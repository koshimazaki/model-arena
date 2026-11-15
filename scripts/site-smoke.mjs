// Smoke test of the built blog site in headless Google Chrome.
//
//   npm run build:site && npm run site:smoke [-- --shots <dir>]
//
// Serves site-dist/ with clips from site-media/ (scripts/site-preview.mjs), then
// checks: both <model-arena> elements render three tiles; every clip's metadata
// loads from the media base with a duration; every poster and image answers 200;
// Play all moves the clock; no console errors; no sideways scroll at phone width;
// the specs page renders. Optional screenshots at desktop and phone width.
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import puppeteer from "puppeteer-core";
import { startPreview } from "./site-preview.mjs";

const CHROME = process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const shotsAt = process.argv.indexOf("--shots");
const SHOTS = shotsAt > 0 ? process.argv[shotsAt + 1] : null;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const failures = [];
const log = (ok, msg) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${msg}`);
  if (!ok) failures.push(msg);
};

if (!existsSync(CHROME)) {
  console.error(`Google Chrome not found at ${CHROME}; set CHROME_PATH.`);
  process.exit(2);
}
const server = await startPreview(0);
const base = `http://localhost:${server.address().port}`;
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--mute-audio"] });

async function open(path, width, height) {
  const page = await browser.newPage();
  await page.setViewport({ width, height, deviceScaleFactor: 1 });
  const errors = [];
  const bad = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("response", (r) => {
    const u = r.url();
    if (u.startsWith(base) && r.status() >= 400) bad.push(`${r.status()} ${u}`);
  });
  await page.goto(`${base}${path}`, { waitUntil: "networkidle0" });
  return { page, errors, bad };
}

/** In the page: per arena, the tiles' videos and their state. */
const arenas = () =>
  [...document.querySelectorAll("model-arena")].map((host) => {
    const root = host.shadowRoot;
    return {
      tiles: root.querySelectorAll("figure.tile").length,
      clock: root.querySelector(".transport .time")?.textContent ?? "",
      error: root.querySelector(".error")?.textContent ?? "",
      foot: [...root.querySelectorAll(".tile-foot")].map((f) => f.textContent),
      videos: [...root.querySelectorAll(".screen video")].map((v) => ({
        src: v.currentSrc || v.src,
        poster: v.poster,
        preload: v.getAttribute("preload"),
        ready: v.readyState,
        duration: v.duration,
        autoplay: v.autoplay,
        muted: v.muted,
      })),
    };
  });

try {
  const { page, errors, bad } = await open("/", 1440, 900);
  let state = [];
  for (let i = 0; i < 40; i++) {
    state = await page.evaluate(arenas);
    if (state.length === 2 && state.every((a) => a.videos.length === 3 && a.videos.every((v) => v.ready >= 1 && v.duration > 0))) break;
    await sleep(250);
  }
  log(state.length === 2, `two <model-arena> elements (found ${state.length})`);
  state.forEach((a, i) => {
    log(a.tiles === 3, `arena ${i + 1}: three tiles`);
    log(!a.error, `arena ${i + 1}: no element error ${a.error ? `(${a.error})` : ""}`);
    for (const v of a.videos) {
      const name = v.src.split("/").pop();
      log(v.ready >= 1 && v.duration > 0, `${name}: metadata loaded, ${v.duration?.toFixed(2)} s`);
      log(v.src.startsWith(`${base}/media/`), `${name}: from the media base`);
      log(v.preload === "metadata" && !v.autoplay && v.muted, `${name}: preload metadata, no autoplay, muted`);
      log(Boolean(v.poster), `${name}: has a poster`);
    }
    log(a.foot.length === 3 && a.foot.every((f) => /fps/.test(f) && /Full resolution/.test(f)), `arena ${i + 1}: measured line and Full resolution under every tile`);
  });

  // Every poster and image on the page answers 200.
  const assets = await page.evaluate(() => [
    ...[...document.querySelectorAll("model-arena")].flatMap((h) => [...h.shadowRoot.querySelectorAll("video")].map((v) => v.poster)),
    ...[...document.images].map((i) => i.src),
  ]);
  for (const url of assets) {
    const status = await page.evaluate(async (u) => (await fetch(u, { method: "HEAD" })).status, url);
    log(status === 200, `${url.split("/").pop()}: HTTP ${status}`);
  }

  // Play all on scene 1 moves the clock.
  await page.evaluate(() => document.querySelector("model-arena").shadowRoot.querySelector(".transport button.primary").click());
  await sleep(2500);
  const playing = await page.evaluate(() => document.querySelector("model-arena").shadowRoot.querySelector(".transport .time").textContent);
  log(!/^0:00\.0 \//.test(playing), `Play all moves the clock (${playing})`);
  await page.evaluate(() => document.querySelector("model-arena").shadowRoot.querySelector(".transport button.primary").click());
  await page.evaluate(() => window.scrollTo(0, 0));
  if (SHOTS) {
    mkdirSync(SHOTS, { recursive: true });
    await page.screenshot({ path: join(SHOTS, "desktop.png"), fullPage: true });
  }
  log(errors.length === 0, `no console errors on / ${errors.length ? errors.join(" | ") : ""}`);
  log(bad.length === 0, `no failed requests on / ${bad.join(" | ")}`);

  // Phone width: no sideways scroll, the tiles stack.
  const phone = await open("/", 390, 844);
  await sleep(1500);
  const wide = await phone.page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  log(wide <= 0, `phone width: no sideways page scroll (overflow ${wide}px)`);
  if (SHOTS) await phone.page.screenshot({ path: join(SHOTS, "phone.png"), fullPage: true });
  log(phone.errors.length === 0, `phone: no console errors ${phone.errors.join(" | ")}`);

  // The specs page.
  const specs = await open("/arena/specs.html", 1280, 900);
  const rendered = await specs.page.evaluate(() => document.querySelector("model-specs")?.shadowRoot?.textContent?.length ?? 0);
  log(rendered > 500, `arena/specs.html renders <model-specs> (${rendered} chars)`);
  log(specs.errors.length === 0 && specs.bad.length === 0, `arena/specs.html: no errors ${[...specs.errors, ...specs.bad].join(" | ")}`);
} finally {
  await browser.close();
  server.close();
}

console.log(failures.length ? `\n${failures.length} failed` : "\nall passed");
process.exit(failures.length ? 1 : 0);
