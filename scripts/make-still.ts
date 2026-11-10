/**
 * Makes a character still with an image model, optionally pose-matched to a
 * reference such as the guide's first frame, for the motion-transfer lane.
 *
 *   npm run still -- --model klein-9b --prompt "..." --reference frame0.png --dry-run
 *   RUNWARE_API_KEY=... npm run still -- ... --max-price 0.05
 *
 * --dry-run prints the exact task and sends nothing. A real run needs
 * --max-price, refuses when the estimate is over it, asks for confirmation
 * (or --yes), then writes runs/<date>-still-<model>-<id>/still.png and
 * appends a row to docs/costs.md. The key is read only from RUNWARE_API_KEY.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { RunwareClient } from "../providers/runware-api/client.ts";
import { IMAGE_MODELS, planImage, runImage, type ImagePlan, type ImageRequest } from "../providers/runware-api/image.ts";
import { appendCost } from "./lib/costs.ts";
import { elide, loadMedia } from "./lib/media.ts";
import { CliExit } from "./run-lane.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const HELP = `Usage: npm run still -- --model <key> --prompt <text> [--reference <png|jpg|https>] [options]

Models: ${IMAGE_MODELS.map((m) => `${m.key} (${m.air})`).join(", ")}

Options:  --width <px> --height <px>  (klein: multiples of 16; Kling without a reference: fixed pairs)
          --resolution 1K|2K           (Kling with a reference)
          --max-price <usd>  --out <dir> (default runs/)  --dry-run  --yes
`;

const fail = (msg: string, code = 2): never => {
  throw new CliExit(code, msg);
};

export interface StillDeps {
  fetch?: typeof fetch;
  key?: string;
  costsFile?: string;
  write?: (text: string) => void;
  poll?: { sleep?: (ms: number) => Promise<void>; initialDelayMs?: number };
}

export function describeImagePlan(plan: ImagePlan): string {
  const lines = [
    `Model:     ${plan.modelName} (${plan.modelId})`,
    `Estimate:  ${plan.estimate.usd === null ? "unknown" : `$${plan.estimate.usd.toFixed(5)}`} (${plan.estimate.basis})`,
    ...plan.notes.map((n) => `Note:      ${n}`),
    "",
  ];
  for (const u of plan.uploads)
    lines.push(`Upload first: ${JSON.stringify({ taskType: "mediaStorage", taskUUID: "<new uuid>", operation: "upload", media: elide(u.media.ref) })}   -> ${u.placeholder}`, "");
  lines.push("Task (POST https://api.runware.ai/v1, as a one-element array):", JSON.stringify([plan.task], null, 2));
  return lines.join("\n");
}

const int = (v: string | undefined, name: string) => {
  if (v === undefined) return undefined;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1 || n > 8192) fail(`--${name} must be whole pixels; got "${v}".`);
  return n;
};

export async function makeStillCli(argv: string[], deps: StillDeps = {}): Promise<void> {
  const out = deps.write ?? ((t: string) => void process.stdout.write(t));
  let o;
  try {
    o = parseArgs({
      args: argv,
      options: {
        model: { type: "string" },
        prompt: { type: "string" },
        reference: { type: "string" },
        width: { type: "string" },
        height: { type: "string" },
        resolution: { type: "string" },
        "max-price": { type: "string" },
        out: { type: "string" },
        "dry-run": { type: "boolean", default: false },
        yes: { type: "boolean", default: false },
        help: { type: "boolean", default: false },
      },
      strict: true,
    }).values;
  } catch (e) {
    return fail(`${(e as Error).message}\n\n${HELP}`);
  }
  if (o.help) return void out(HELP);
  if (!o.model) fail("--model is required.\n\n" + HELP);
  if (!o.prompt) fail("--prompt is required.");
  if ((o.width === undefined) !== (o.height === undefined)) fail("Give --width and --height together.");

  let plan: ImagePlan;
  try {
    const req: ImageRequest = {
      model: o.model!,
      prompt: o.prompt!,
      ...(o.reference ? { reference: await loadMedia(o.reference, "image") } : {}),
      ...(o.width ? { width: int(o.width, "width"), height: int(o.height, "height") } : {}),
      ...(o.resolution ? { resolution: o.resolution } : {}),
    };
    plan = planImage(req);
  } catch (e) {
    return fail(`Refused: ${(e as Error).message}`);
  }
  out(describeImagePlan(plan) + "\n");
  if (o["dry-run"]) return void out("\nDry run: nothing was sent.\n");

  const maxPrice = o["max-price"] === undefined ? undefined : Number(o["max-price"]);
  if (maxPrice === undefined) fail("\nRefused: a real run needs --max-price <usd>.");
  if (!Number.isFinite(maxPrice) || maxPrice! <= 0 || maxPrice! > 10) fail("--max-price must be a positive number of USD up to 10.");
  if (plan.estimate.usd === null || plan.estimate.usd > maxPrice!)
    fail(`\nRefused: estimate ${plan.estimate.usd === null ? "unknown" : `$${plan.estimate.usd}`} is over --max-price $${maxPrice}.`);
  const key = deps.key ?? (process.env.RUNWARE_API_KEY?.trim() || undefined);
  if (!key) fail("\nRefused: set RUNWARE_API_KEY in the environment (it is read from nowhere else).");
  if (!o.yes && !(await confirm(`\nSpend up to $${plan.estimate.usd} on this still? Type yes to continue: `)))
    fail("Not confirmed; nothing was sent. (Pass --yes to skip this prompt.)", 1);

  const taskUUID = String(plan.task.taskUUID);
  const date = new Date().toISOString();
  const dir = resolve(o.out ?? join(ROOT, "runs"), `${date.slice(0, 10)}-still-${o.model}-${taskUUID.slice(0, 8)}`);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "plan.json"), JSON.stringify({ ...plan, uploads: plan.uploads.map((u) => u.placeholder) }, null, 2));
  const client = new RunwareClient({ getKey: () => key, fetch: deps.fetch as never });
  const costsFile = deps.costsFile ?? join(ROOT, "docs/costs.md");
  const size = String(plan.task.resolution ?? `${plan.task.width}x${plan.task.height}`);
  const row = { date: date.slice(0, 10), model: plan.modelId, taskUUID, duration: "-", resolution: size, inputs: plan.uploads.length || o.reference ? "referenceImage" : "prompt", estimateUsd: plan.estimate.usd };
  const started = Date.now();
  let res;
  try {
    res = await runImage(client, plan, deps.poll ?? {});
  } catch (e) {
    const msg = client.redact((e as Error).message);
    await appendCost(costsFile, { ...row, modelRan: null, costUsd: null, seconds: null, output: "-", status: `failed: ${msg.slice(0, 120)}` });
    return fail(`\nRun stopped: ${msg}\nRow added to ${relative(process.cwd(), costsFile)}. Do not resubmit; the task UUID is ${taskUUID}.`, 1);
  }
  const fetchImpl = deps.fetch ?? globalThis.fetch;
  const img = await fetchImpl(res.result.imageURL);
  if (!img.ok) fail(`Could not download ${res.result.imageURL} (HTTP ${img.status}).`, 1);
  const file = join(dir, "still.png");
  await writeFile(file, new Uint8Array(await img.arrayBuffer()));
  await writeFile(join(dir, "task.json"), JSON.stringify([res.task], null, 2));
  const seconds = (Date.now() - started) / 1000;
  await appendCost(costsFile, { ...row, modelRan: plan.modelId, costUsd: res.result.cost, seconds, output: relative(ROOT, file), status: "ok" });
  out(`\nDone: ${relative(process.cwd(), file)}, cost ${res.result.cost === null ? "not reported" : `$${res.result.cost}`}. Use it with: npm run lane -- ... --character ${relative(process.cwd(), file)}\n`);
}

async function confirm(question: string): Promise<boolean> {
  if (!process.stdin.isTTY) return false;
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(question);
  rl.close();
  return answer.trim().toLowerCase() === "yes";
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    await makeStillCli(process.argv.slice(2));
  } catch (e) {
    if (!(e instanceof CliExit)) throw e;
    process.stderr.write(`${e.message}\n`);
    process.exitCode = e.code;
  }
}
