import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { money, measuredLine, sceneRecord, specTable } from "../scripts/lib/site-html.ts";
import { checkScene, findJob, type Job, type Manifest, type TakesFile } from "../scripts/lib/site-takes.ts";
import { parseRecord } from "../packages/core/src/record.ts";

const manifest = JSON.parse(readFileSync("site/manifest.json", "utf8")) as Manifest;
const takes = JSON.parse(readFileSync("site/takes.json", "utf8")) as TakesFile;

const job = (id: string, model: string, over: Partial<Job> = {}): Job => ({
  id, model, status: "Ready", prompt: "p", duration: 10, resolution: "hd", aspectRatio: "16:9",
  createdAt: "2026-11-15T10:00:00Z", updatedAt: "2026-11-15T10:03:00Z", ...over,
});

describe("site takes", () => {
  it("finds one job by id prefix and refuses none or several", () => {
    const jobs = [job("aaaa1111", "x"), job("aaaa2222", "x")];
    expect(findJob(jobs, "aaaa1").id).toBe("aaaa1111");
    expect(() => findJob(jobs, "aaaa")).toThrow(/several/);
    expect(() => findJob(jobs, "b")).toThrow(/no such job/);
  });

  it("refuses a scene whose takes differ in prompt, or ran another model", () => {
    const ok = [job("s", "runware-seedance-2-5"), job("k", "runware-kling-4"), job("h", "runware-h3")];
    expect(checkScene(ok, manifest, ["seedance", "kling", "h3"])).toEqual([]);
    const bad = [ok[0]!, job("k", "runware-kling-4", { prompt: "other" }), job("h", "runware-h3-frame")];
    expect(checkScene(bad, manifest, ["seedance", "kling", "h3"])).toEqual([
      "k differs from s in prompt",
      "h ran runware-h3-frame, the manifest says h3 (runware-h3)",
    ]);
  });

  it("formats recorded costs without rounding them away", () => {
    expect([money(0.8), money(1.57), money(2.3208), money(null)]).toEqual(["$0.80", "$1.57", "$2.3208", "cost not recorded"]);
  });

  it("writes records the element accepts, with media from the base", () => {
    for (const scene of manifest.scenes) {
      const r = parseRecord(sceneRecord(manifest, takes, scene.id, "https://media.example.com/"));
      expect(r.lanes.map((l) => l.id)).toEqual(Object.keys(scene.takes));
      for (const l of r.lanes) {
        expect(l.output!.src).toMatch(/^https:\/\/media\.example\.com\/.+\.mp4$/);
        expect(l.output!.original).toMatch(/-original\.mp4$/);
        expect(l.note).toMatch(/fps/);
      }
    }
  });

  it("puts measured facts and the published specs in the table", () => {
    const t = takes.takes[0]!;
    expect(measuredLine(t)).toContain(`${t.measured.frames} frames`);
    const html = specTable(manifest, takes);
    expect(html).toContain("not published");
    expect(html).toContain("https://runware.ai/docs/models/bytedance-seedance-2-5");
    expect(html).not.toMatch(/\$—|— s|undefined|NaN/);
  });
});
