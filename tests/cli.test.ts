import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const PNG = join(ROOT, "tests/fixtures/tiny-320x180.png");

function lane(args: string[], env: Record<string, string> = {}) {
  const { RUNWARE_API_KEY: _drop, ...rest } = process.env;
  const r = spawnSync(process.execPath, ["--import", "tsx", join(ROOT, "scripts/run-lane.ts"), ...args], {
    cwd: ROOT,
    env: { ...rest, ...env },
    encoding: "utf8",
    timeout: 30_000,
  });
  return { code: r.status, out: r.stdout + r.stderr };
}

const base = ["--model", "ltx-2.5", "--prompt", "A grey card slowly brightens.", "--first-frame", PNG, "--duration", "6"];

describe("run-lane CLI", () => {
  it("--dry-run prints the exact task and sends nothing", () => {
    const { code, out } = lane([...base, "--dry-run"]);
    expect(code).toBe(0);
    expect(out).toContain('"model": "lightricks:ltx@2.5-pro"');
    expect(out).toContain('"includeCost": true');
    expect(out).toContain("mediaStorage");
    expect(out).toContain("Dry run: nothing was sent.");
  });

  it("refuses a real run without --max-price", () => {
    const { code, out } = lane(base, { RUNWARE_API_KEY: "test-key-not-real-0123456789" });
    expect(code).toBe(2);
    expect(out).toMatch(/needs --max-price/);
    expect(out).not.toContain("test-key-not-real-0123456789");
  });

  it("refuses when the estimate is over --max-price", () => {
    const { code, out } = lane([...base, "--max-price", "0.10"], { RUNWARE_API_KEY: "test-key-not-real-0123456789" });
    expect(code).toBe(2);
    expect(out).toMatch(/over --max-price/);
  });

  it("refuses a real run without RUNWARE_API_KEY", () => {
    const { code, out } = lane([...base, "--max-price", "2"]);
    expect(code).toBe(2);
    expect(out).toMatch(/RUNWARE_API_KEY/);
  });

  it("refuses inputs a model cannot use, with the reason", () => {
    const { code, out } = lane(["--model", "ltx-2.5", "--prompt", "xy", "--guide", join(ROOT, "tests/fixtures/tiny-64x36-24fps.mp4"), "--dry-run"]);
    expect(code).toBe(2);
    expect(out).toMatch(/no reference video/);
  });
});

describe("run-lane end to end against a fake API", () => {
  it("uploads, submits, polls, downloads, writes a record and a cost row", async () => {
    const { mkdtemp, readFile, writeFile, readdir } = await import("node:fs/promises");
    const { tmpdir } = await import("node:os");
    const { runLaneCli } = await import("../scripts/run-lane.ts");
    const dir = await mkdtemp(join(tmpdir(), "ma-cli-"));
    const costs = join(dir, "costs.md");
    await writeFile(costs, "| header |\n");
    const KEY = "test-key-not-real-0123456789";
    const sent: { url: string; auth?: string; body?: unknown }[] = [];
    const fake = (async (url: string, init?: { headers?: Record<string, string>; body?: string }) => {
      sent.push({ url, auth: init?.headers?.Authorization, body: init?.body ? JSON.parse(init.body) : undefined });
      if (url === "https://vm.runware.ai/out.mp4") return new Response(new Uint8Array([0, 0, 0, 8]));
      const task = (JSON.parse(init!.body!) as Record<string, unknown>[])[0]!;
      const reply =
        task.taskType === "mediaStorage"
          ? { data: [{ taskType: "mediaStorage", taskUUID: task.taskUUID, mediaUUID: "11111111-1111-4111-8111-000000000001", mediaURL: "https://mm.runware.ai/m.png" }] }
          : task.taskType === "videoInference"
            ? { data: [{ taskType: "videoInference", taskUUID: task.taskUUID }] }
            : { data: [{ taskType: "videoInference", taskUUID: task.taskUUID, status: "success", videoURL: "https://vm.runware.ai/out.mp4", cost: 0.7 }] };
      return new Response(JSON.stringify(reply), { headers: { "content-type": "application/json" } });
    }) as unknown as typeof fetch;
    let printed = "";
    await runLaneCli([...base, "--max-price", "1", "--yes", "--out", dir], {
      fetch: fake, key: KEY, costsFile: costs, write: (t) => (printed += t), poll: { sleep: async () => {}, initialDelayMs: 0 },
    });
    expect(sent.filter((s) => s.url === "https://api.runware.ai/v1").every((s) => s.auth === `Bearer ${KEY}`)).toBe(true);
    expect(sent.find((s) => s.url.includes("vm.runware.ai"))?.auth).toBeUndefined();
    const [folder] = await readdir(dir).then((names) => names.filter((n) => n.includes("ltx-2.5")));
    const record = JSON.parse(await readFile(join(dir, folder!, "record.json"), "utf8"));
    expect(record.lanes[0]).toMatchObject({ costUsd: 0.7, modelRan: "lightricks:ltx@2.5-pro", output: { src: "output.mp4" } });
    expect(record.lanes[0].inputsSent[0].src).toBe("inputs/tiny-320x180.png");
    const row = await readFile(costs, "utf8");
    expect(row).toContain("lightricks:ltx@2.5-pro");
    expect(row).toContain("$0.7000");
    expect(printed + row + JSON.stringify(record)).not.toContain(KEY);
  });
});
