/**
 * Runs one Model Arena lane from the command line, through the same provider
 * code the browser uses.
 *
 *   npm run lane -- --model kling-4 --prompt "..." --guide clip.mp4 --duration 5 --dry-run
 *   RUNWARE_API_KEY=... npm run lane -- ... --max-price 1.50
 *
 * --dry-run prints the exact task (and the uploads it needs) and sends nothing.
 * A real run refuses without --max-price, refuses when the schema-rate estimate
 * is over it, asks for confirmation (or --yes), then uploads, submits, polls,
 * downloads the clip next to a record JSON and appends a row to docs/costs.md.
 * The key is read only from RUNWARE_API_KEY and never printed.
 */
import { copyFile, mkdir, writeFile } from "node:fs/promises";
import { basename, dirname, join, relative, resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import type { ArenaRecord, FirstFrameVariant } from "../packages/core/src/record.ts";
import { findModel, MODELS } from "../providers/runware-api/models.ts";
import { runwareProvider } from "../providers/runware-api/index.ts";
import { laneFromRun, type LanePlan, type LaneRequest } from "../providers/types.ts";
import { appendCost } from "./lib/costs.ts";
import { elide, loadMedia } from "./lib/media.ts";
import { composeFromFile, describeComposed, type ComposedLane } from "./lib/shot.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const HELP = `Usage: npm run lane -- --model <key> --prompt <text> [inputs] [options]

Models: ${MODELS.map((m) => `${m.key} (${m.air})`).join(", ")}

Inputs:   --guide <mp4|https>  --first-frame <png|jpg|https>  --audio <wav|mp3|m4a|https>
          --character <png|jpg|https>  (a still that replaces the guide's figure: a reference
          image beside the guide on Kling, Seedance, H3 and the router; never a frame image)
Options:  --duration <s|auto>  --resolution <preset>  --camera <movement, LTX only>
          --shot <shot.json>  (a neutral shot description: the composer writes the prompt,
          camera parameter and duration for this model; --prompt etc. override it)
          --first-frame-variant A|B|C  --requirements <text, router>  --max-price <usd>
          --out <dir> (default runs/)  --timeout-min <n> (default 45)  --resume <taskUUID>
          --dry-run  --yes
`;

/** A refusal or failure with its exit code; caught once at the top. */
export class CliExit extends Error {
  constructor(public code: number, message: string) {
    super(message);
  }
}

function fail(msg: string, code = 2): never {
  throw new CliExit(code, msg);
}

export interface CliDeps {
  /** Replaces global fetch for both the API and the download (tests). */
  fetch?: typeof fetch;
  key?: string;
  costsFile?: string;
  write?: (text: string) => void;
  poll?: { sleep?: (ms: number) => Promise<void>; initialDelayMs?: number };
}

export function parseCli(argv: string[]) {
  const { values } = parseArgs({
    args: argv,
    options: {
      model: { type: "string" },
      prompt: { type: "string" },
      guide: { type: "string" },
      "first-frame": { type: "string" },
      "first-frame-variant": { type: "string" },
      character: { type: "string" },
      shot: { type: "string" },
      audio: { type: "string" },
      duration: { type: "string" },
      resolution: { type: "string" },
      camera: { type: "string" },
      requirements: { type: "string" },
      "max-price": { type: "string" },
      out: { type: "string" },
      "timeout-min": { type: "string" },
      resume: { type: "string" },
      "dry-run": { type: "boolean", default: false },
      yes: { type: "boolean", default: false },
      help: { type: "boolean", default: false },
    },
    strict: true,
  });
  return values;
}

type Cli = ReturnType<typeof parseCli>;

function parseMaxPrice(v: string | undefined): number | undefined {
  if (v === undefined) return undefined;
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0 || n > 100) fail(`--max-price must be a positive number of USD up to 100; got "${v}".`);
  return n;
}

function parseDuration(v: string | undefined): number | "auto" | undefined {
  if (v === undefined) return undefined;
  if (v === "auto") return "auto";
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1 || n > 60) fail(`--duration must be whole seconds or "auto"; got "${v}".`);
  return n;
}

export async function buildRequest(o: Cli): Promise<LaneRequest & { composed?: ComposedLane }> {
  if (!o.model) fail("--model is required.\n\n" + HELP);
  const model = findModel(o.model);
  const composed = o.shot ? await composeFromFile(o.shot, model.key) : undefined;
  if (composed && !o.prompt) {
    // The composed prompt addresses each reference it uses; each must actually be sent.
    const flag: Record<string, string | undefined> = { motion: o.guide, character: o.character, "first-frame": o["first-frame"], soundtrack: o.audio };
    const flagName: Record<string, string> = { motion: "--guide", character: "--character", "first-frame": "--first-frame", soundtrack: "--audio" };
    for (const u of composed.composed.used)
      if (u.role in flag && !flag[u.role]) fail(`--shot uses "${u.ref}" (${u.role}) but ${flagName[u.role]} was not given; the prompt would address an input that is not sent.`);
  }
  const prompt = o.prompt ?? composed?.composed.prompt;
  if (!prompt) fail("--prompt (or --shot) is required.");
  const cParams = composed?.composed.params ?? {};
  const cDuration = typeof cParams.duration === "number" ? cParams.duration : undefined;
  const cCamera = typeof cParams["settings.cameraMovement"] === "string" ? (cParams["settings.cameraMovement"] as string) : undefined;
  const variant = o["first-frame-variant"];
  if (variant !== undefined && !["A", "B", "C"].includes(variant)) fail("--first-frame-variant must be A, B or C.");
  const maxPrice = parseMaxPrice(o["max-price"]);
  return {
    model: model.key,
    prompt: prompt!,
    ...(composed ? { composed } : {}),
    ...(o.guide ? { guideVideo: await loadMedia(o.guide, "video") } : {}),
    ...(o["first-frame"] ? { firstFrame: await loadMedia(o["first-frame"], "image") } : {}),
    ...(variant ? { firstFrameVariant: variant as FirstFrameVariant } : {}),
    ...(o.character ? { character: await loadMedia(o.character, "image") } : {}),
    ...(o.audio ? { audio: await loadMedia(o.audio, "audio") } : {}),
    ...(o.duration !== undefined ? { duration: parseDuration(o.duration) } : cDuration !== undefined ? { duration: cDuration } : {}),
    ...(o.resolution ? { resolution: o.resolution } : {}),
    ...(o.camera ? { camera: o.camera } : cCamera ? { camera: cCamera } : {}),
    ...(model.key === "auto"
      ? { routing: { maxPrice: maxPrice ?? 0, ...(o.requirements ? { requirements: o.requirements } : {}) } }
      : {}),
  };
}

export function describePlan(plan: LanePlan): string {
  const lines = [
    `Model:     ${plan.modelName} (${plan.modelId})`,
    `Inputs:    ${plan.inputsSent.map((i) => `${i.role}${i.frame !== undefined ? `@${i.frame}` : ""}=${i.label}`).join(", ") || "prompt only"}`,
    `First frame variant: ${plan.firstFrameVariant}`,
    `Estimate:  ${plan.estimate.usd === null ? "unknown" : `$${plan.estimate.usd.toFixed(4)}`} (${plan.estimate.basis})`,
    ...plan.notes.map((n) => `Note:      ${n}`),
    "",
  ];
  if (plan.uploads.length) {
    lines.push(`Uploads first (POST ${"https://api.runware.ai/v1"}, one mediaStorage task each; the returned mediaUUID replaces the placeholder):`);
    for (const u of plan.uploads)
      lines.push(
        JSON.stringify({ taskType: "mediaStorage", taskUUID: "<new uuid>", operation: "upload", media: elide(u.media.ref) }) +
          `   -> ${u.placeholder}`,
      );
    lines.push("");
  }
  lines.push("Task (POST https://api.runware.ai/v1, as a one-element array):", JSON.stringify([plan.task], null, 2));
  return lines.join("\n");
}

async function confirm(question: string): Promise<boolean> {
  if (!process.stdin.isTTY) return false;
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(question);
  rl.close();
  return answer.trim().toLowerCase() === "yes";
}

export async function runLaneCli(argv: string[], deps: CliDeps = {}): Promise<void> {
  const out = deps.write ?? ((t: string) => void process.stdout.write(t));
  const costsFile = deps.costsFile ?? join(ROOT, "docs/costs.md");
  const fetchImpl = deps.fetch ?? globalThis.fetch;
  let o: Cli;
  try {
    o = parseCli(argv);
  } catch (e) {
    fail(`${(e as Error).message}\n\n${HELP}`);
  }
  if (o.help) return void out(HELP);

  const key = deps.key ?? (process.env.RUNWARE_API_KEY?.trim() || undefined);
  const provider = runwareProvider({ getKey: () => key });
  let req: LaneRequest & { composed?: ComposedLane };
  let plan: LanePlan;
  try {
    req = await buildRequest(o);
    plan = provider.plan(req);
  } catch (e) {
    fail(`Refused: ${(e as Error).message}`);
  }
  if (req.composed) out(describeComposed(req.composed.composed) + "\n" + (o.prompt ? "  (--prompt given: it replaces the composed prompt)\n" : "") + "\n");
  out(describePlan(plan) + "\n");
  if (o["dry-run"]) return void out("\nDry run: nothing was sent.\n");

  const maxPrice = parseMaxPrice(o["max-price"]);
  if (maxPrice === undefined) fail("\nRefused: a real run needs --max-price <usd>.");
  if (plan.estimate.usd === null) fail("\nRefused: no price estimate for this model; cannot check it against --max-price.");
  if (plan.estimate.usd > maxPrice)
    fail(`\nRefused: estimate $${plan.estimate.usd.toFixed(4)} is over --max-price $${maxPrice.toFixed(2)}.`);
  if (!key) fail("\nRefused: set RUNWARE_API_KEY in the environment (it is read from nowhere else).");
  if (!o.yes && !o.resume && !(await confirm(`\nSpend up to $${plan.estimate.usd.toFixed(2)} on this run? Type yes to continue: `)))
    fail("Not confirmed; nothing was sent. (Pass --yes to skip this prompt.)", 1);

  const date = new Date().toISOString();
  const taskUUID = o.resume ?? String(plan.task.taskUUID);
  const outDir = resolve(o.out ?? join(ROOT, "runs"), `${date.slice(0, 10)}-${findModel(req.model).key}-${taskUUID.slice(0, 8)}`);
  await mkdir(join(outDir, "inputs"), { recursive: true });
  for (const m of [req.guideVideo, req.firstFrame, req.character, req.audio])
    if (m && !m.ref.startsWith("https://")) {
      const src = [o.guide, o["first-frame"], o.character, o.audio].find((p) => p && basename(p) === m.name);
      if (src) await copyFile(src, join(outDir, "inputs", m.name));
      m.displaySrc = `inputs/${m.name}`;
    }
  plan = provider.plan({ ...req }); // re-plan so inputsSent carries the copied paths
  if (!o.resume) plan.task.taskUUID = taskUUID;
  await writeFile(join(outDir, "plan.json"), JSON.stringify({ ...plan, uploads: plan.uploads.map((u) => u.placeholder) }, null, 2));
  out(`\nRun folder: ${relative(process.cwd(), outDir)}\nTask UUID: ${taskUUID} (to resume: --resume ${taskUUID})\n`);

  const timeoutMin = Number(o["timeout-min"] ?? 45);
  if (!Number.isFinite(timeoutMin) || timeoutMin <= 0) fail("--timeout-min must be a positive number.");
  const progress = (p: { stage: string; message: string; progress?: number }) =>
    out(`  [${new Date().toISOString().slice(11, 19)}] ${p.stage}: ${p.message}${p.progress !== undefined ? ` ${p.progress}%` : ""}\n`);
  const runner = runwareProvider({ getKey: () => key, fetch: fetchImpl as never, poll: { timeoutMs: timeoutMin * 60_000, ...deps.poll } });
  let result;
  try {
    result = o.resume ? await runner.resume(plan, o.resume, { onProgress: progress }) : await runner.run(plan, { onProgress: progress });
  } catch (e) {
    const msg = runner.client.redact((e as Error).message);
    await appendCost(costsFile, {
      date: date.slice(0, 10), model: plan.modelId, modelRan: null, taskUUID, duration: String(req.duration ?? "default"),
      resolution: String(plan.task.resolution ?? `${plan.task.width ?? ""}x${plan.task.height ?? ""}`), inputs: plan.inputsSent.map((i) => i.role).join("+"),
      estimateUsd: plan.estimate.usd, costUsd: null, seconds: null, output: "-", status: `failed: ${msg.slice(0, 120)}`,
    });
    fail(
      `\nRun stopped: ${msg}\nRunware does not charge failed generations. If the task may still be running, poll it with --resume ${taskUUID} (same flags); never resubmit. Row added to ${relative(process.cwd(), costsFile)}.`,
      1,
    );
  }
  await writeFile(join(outDir, "task.json"), JSON.stringify([result.task], null, 2));

  const res = await fetchImpl(result.videoURL);
  if (!res.ok) fail(`Could not download ${result.videoURL} (HTTP ${res.status}). It stays available for 7 days by default.`, 1);
  await writeFile(join(outDir, "output.mp4"), new Uint8Array(await res.arrayBuffer()));

  const lane = laneFromRun("lane-1", plan, req, result, "output.mp4");
  if (req.composed && !o.prompt) lane.composed = req.composed.marker;
  const record: ArenaRecord = {
    schemaVersion: 1, id: `run-${taskUUID.slice(0, 8)}`, title: `${plan.modelName}: ${req.prompt.slice(0, 80)}`, createdAt: date, lanes: [lane],
    ...(req.composed ? { shot: req.composed.shot } : {}),
  };
  await writeFile(join(outDir, "record.json"), JSON.stringify(record, null, 2));
  await appendCost(costsFile, {
    date: date.slice(0, 10), model: plan.modelId, modelRan: result.modelRan, taskUUID, duration: String(req.duration ?? "default"),
    resolution: String(plan.task.resolution ?? `${plan.task.width ?? ""}x${plan.task.height ?? ""}`), inputs: plan.inputsSent.map((i) => i.role).join("+"),
    estimateUsd: plan.estimate.usd, costUsd: result.costUsd, seconds: result.generationSeconds, output: relative(ROOT, join(outDir, "output.mp4")), status: "ok",
  });
  if (result.costUsd !== null && result.costUsd > maxPrice)
    out(`\nWarning: reported cost $${result.costUsd} is over --max-price $${maxPrice}.\n`);
  out(`\nDone: ${relative(process.cwd(), join(outDir, "output.mp4"))}, cost ${result.costUsd === null ? "not reported" : `$${result.costUsd}`}, ${result.generationSeconds.toFixed(1)} s, model ran: ${result.modelRan ?? "unknown"}.\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    await runLaneCli(process.argv.slice(2));
  } catch (e) {
    if (!(e instanceof CliExit)) throw e;
    process.stderr.write(`${e.message}\n`);
    process.exitCode = e.code;
  }
}
