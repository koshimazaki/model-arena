// Playback smoke test in real headless Google Chrome, against the Vite dev server.
//
//   npm run smoke            (starts its own dev server on a free port)
//   npm run smoke -- --url http://localhost:5173   (use a running one)
//
// For every <model-arena> on each page: every lane video reaches readyState >= 2
// with a non-zero duration; "Play all" moves the shared clock and every video's
// currentTime together; "Play alone" plays one and pauses the rest. For every
// <model-specs>: the composer panel renders one prompt per model. Local only:
// no key, no network beyond localhost. Exit code 1 on any failure.
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CHROME = process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PAGES = ["/index.html", "/blog-demo.html", "/specs.html"];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const failures = [];
const log = (ok, msg) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${msg}`);
  if (!ok) failures.push(msg);
};

const argUrl = process.argv.indexOf("--url");
let server;
let base = argUrl > 0 ? process.argv[argUrl + 1] : undefined;
if (!base) {
  const { createServer } = await import("vite");
  server = await createServer({ root: ROOT, logLevel: "error", server: { port: 5199, strictPort: false } });
  await server.listen();
  base = server.resolvedUrls.local[0].replace(/\/$/, "");
}
if (!existsSync(CHROME)) {
  console.error(`Google Chrome not found at ${CHROME}; set CHROME_PATH.`);
  process.exit(2);
}

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ["--autoplay-policy=no-user-gesture-required", "--mute-audio"],
});

/** Runs in the page: facts about arena `i`'s lane videos and clock. */
function arenaState(i) {
  const host = document.querySelectorAll("model-arena")[i];
  const root = host.shadowRoot;
  const videos = [...root.querySelectorAll(".screen video")];
  return {
    layout: host.getAttribute("layout") ?? "three-up",
    clock: root.querySelector(".transport .time")?.textContent ?? "",
    play: root.querySelector(".transport button.primary")?.textContent ?? "",
    error: root.querySelector(".error")?.textContent ?? "",
    videos: videos.map((v) => ({
      src: v.currentSrc.split("/").pop(),
      readyState: v.readyState,
      duration: v.duration,
      currentTime: v.currentTime,
      paused: v.paused,
      error: v.error ? v.error.code : null,
    })),
  };
}

async function waitFor(page, fn, args, test, ms = 15000) {
  const end = Date.now() + ms;
  let last;
  while (Date.now() < end) {
    last = await page.evaluate(fn, ...args);
    if (test(last)) return { ok: true, value: last };
    await sleep(200);
  }
  return { ok: false, value: last };
}

const clockSeconds = (text) => {
  const m = /^(\d+):(\d+(?:\.\d+)?)/.exec(text.trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) : NaN;
};

async function clickIn(page, i, selectorOrText) {
  return page.evaluate(
    (i, q) => {
      const root = document.querySelectorAll("model-arena")[i].shadowRoot;
      const b = q.startsWith("text:")
        ? [...root.querySelectorAll("button")].find((x) => x.textContent === q.slice(5) && !x.disabled)
        : root.querySelector(q);
      if (!b) return false;
      b.click();
      return true;
    },
    i,
    selectorOrText,
  );
}

async function checkArena(page, path, i) {
  const tag = `${path} arena #${i}`;
  const loaded = await waitFor(page, arenaState, [i], (s) => s.videos.length > 0 && s.videos.every((v) => v.readyState >= 2 && v.duration > 0));
  const s0 = loaded.value;
  log(loaded.ok, `${tag} (${s0?.layout}): ${s0?.videos.length ?? 0} videos reach readyState >= 2 with a duration` + (loaded.ok ? "" : ` ${JSON.stringify(s0?.videos)}`));
  if (!loaded.ok) return;
  log(clockSeconds(s0.clock.split("/")[1] ?? "") > 0, `${tag}: clock shows a non-zero length (${s0.clock})`);

  log(await clickIn(page, i, ".transport button.primary"), `${tag}: pressed ${s0.play}`);
  await sleep(1500);
  const s1 = await page.evaluate(arenaState, i);
  const times = s1.videos.map((v) => v.currentTime);
  const spread = Math.max(...times) - Math.min(...times);
  const clock = clockSeconds(s1.clock);
  log(s1.videos.every((v) => !v.paused && v.currentTime > 0.5), `${tag}: every video plays (${times.map((t) => t.toFixed(2)).join(", ")})`);
  log(spread < 0.15, `${tag}: videos stay together (spread ${spread.toFixed(3)} s)`);
  log(clock > 0.3 && Math.abs(clock - times[0]) < 0.4, `${tag}: shared clock advances with them (${s1.clock})`);
  log(!s1.error, `${tag}: no error shown${s1.error ? ` (${s1.error})` : ""}`);
  await clickIn(page, i, ".transport button.primary"); // pause

  // The guidance view pairs the guide with one output and has no solo control by design.
  if (s1.videos.length < 2 || s1.layout === "guidance") return;
  if (!(await clickIn(page, i, "text:Play alone"))) return log(false, `${tag}: no Play alone button`);
  await sleep(1000);
  const s2 = await page.evaluate(arenaState, i);
  const playing = s2.videos.filter((v) => !v.paused);
  log(playing.length === 1, `${tag}: Play alone plays one video and pauses ${s2.videos.length - playing.length} (playing: ${playing.map((v) => v.src).join(", ") || "none"})`);
  await clickIn(page, i, "text:Stop");
}

async function checkSpecs(page, path, i) {
  const tag = `${path} specs #${i}`;
  const res = await waitFor(
    page,
    (i) => {
      const root = document.querySelectorAll("model-specs")[i].shadowRoot;
      return {
        rows: root.querySelectorAll("table.matrix tbody tr").length,
        cards: root.querySelectorAll("article.card").length,
        prompts: [...root.querySelectorAll(".composer .out pre")].map((p) => p.textContent.length),
      };
    },
    [i],
    (s) => s.prompts.length > 0,
  );
  const s = res.value;
  log(s.rows > 0, `${tag}: matrix has ${s.rows} rows`);
  log(s.cards > 0, `${tag}: ${s.cards} model cards`);
  log(res.ok && s.prompts.every((n) => n > 20), `${tag}: composer renders ${s.prompts.length} prompts`);
  // Typing a new subject must re-compose every prompt.
  const changed = await page.evaluate((i) => {
    const root = document.querySelectorAll("model-specs")[i].shadowRoot;
    const input = root.querySelector('.composer input[name="subject"]');
    if (!input) return false;
    input.value = "a wooden chair";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    return [...root.querySelectorAll(".composer .out pre")].every((p) => p.textContent.includes("wooden chair"));
  }, i);
  log(changed, `${tag}: editing the subject updates every prompt`);
}

try {
  for (const path of PAGES) {
    // Vite answers a missing page with index.html, so check the file first.
    if (!existsSync(resolve(ROOT, path.slice(1)))) {
      log(false, `${path}: page missing`);
      continue;
    }
    const page = await browser.newPage();
    await page.setViewport({ width: 1400, height: 1000 });
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => m.type() === "error" && !m.text().startsWith("Failed to load resource") && errors.push(m.text()));
    page.on("response", (r) => r.status() >= 400 && errors.push(`HTTP ${r.status()} ${new URL(r.url()).pathname}`));
    const res = await page.goto(base + path, { waitUntil: "networkidle0" });
    if (!res || !res.ok()) {
      log(false, `${path}: HTTP ${res?.status()}`);
      continue;
    }
    const counts = await page.evaluate(() => ({
      arenas: document.querySelectorAll("model-arena").length,
      specs: document.querySelectorAll("model-specs").length,
    }));
    for (let i = 0; i < counts.arenas; i++) await checkArena(page, path, i);
    for (let i = 0; i < counts.specs; i++) await checkSpecs(page, path, i);
    log(errors.length === 0, `${path}: no page errors${errors.length ? `: ${errors.join(" | ")}` : ""}`);
    await page.close();
  }
} finally {
  await browser.close();
  await server?.close();
}

console.log(failures.length ? `\n${failures.length} check(s) failed.` : "\nSmoke test passed.");
process.exitCode = failures.length ? 1 : 0;
