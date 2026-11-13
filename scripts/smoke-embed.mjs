// The embed part of `npm run smoke`: builds dist/embed/, serves the repo as
// plain static files under a sub-path (no Vite, no server logic: what a host's
// static hosting does), opens examples/embed.html in headless Chrome, connects
// a fake key, runs a faked generation end to end and checks the result plays,
// the gallery takes it, the player follows the host clock and every request
// stayed on the local server. No key, no paid call.
import { spawnSync } from "node:child_process";
import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, resolve } from "node:path";

const SUB = "/static/sub/path/";
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".json": "application/json", ".mp4": "video/mp4", ".wav": "audio/wav", ".png": "image/png", ".css": "text/css" };
const FAKE_KEY = "smoke-fake-key-0123456789-NOT-REAL";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** A static file server with byte ranges (video seeking needs them), rooted at ROOT under SUB. */
function staticServer(root) {
  const server = createServer((req, res) => {
    const url = new URL(req.url, "http://x");
    if (!url.pathname.startsWith(SUB)) return res.writeHead(404).end();
    const file = normalize(join(root, decodeURIComponent(url.pathname.slice(SUB.length))));
    if (!file.startsWith(root) || !existsSync(file) || !statSync(file).isFile()) return res.writeHead(404).end();
    const size = statSync(file).size;
    const type = TYPES[extname(file)] ?? "application/octet-stream";
    const range = /bytes=(\d*)-(\d*)/.exec(req.headers.range ?? "");
    if (range) {
      const start = range[1] ? Number(range[1]) : 0;
      const end = range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
      res.writeHead(206, { "Content-Type": type, "Content-Range": `bytes ${start}-${end}/${size}`, "Accept-Ranges": "bytes", "Content-Length": end - start + 1 });
      return createReadStream(file, { start, end }).pipe(res);
    }
    res.writeHead(200, { "Content-Type": type, "Content-Length": size, "Accept-Ranges": "bytes" });
    createReadStream(file).pipe(res);
  });
  return new Promise((ok) => server.listen(0, "127.0.0.1", () => ok(server)));
}

async function until(page, fn, test, ms = 15000) {
  const end = Date.now() + ms;
  let last;
  while (Date.now() < end) {
    last = await page.evaluate(fn);
    if (test(last)) return { ok: true, value: last };
    await sleep(150);
  }
  return { ok: false, value: last };
}

export async function checkEmbed(browser, log, ROOT) {
  const root = resolve(ROOT);
  if (!existsSync(join(root, "examples/media/embed-bundle/bundle.json"))) spawnSync("sh", [join(root, "scripts/make-embed-bundle.sh")], { stdio: "inherit" });
  const built = spawnSync("npm", ["run", "build:embed"], { cwd: root, encoding: "utf8" });
  log(built.status === 0, `build:embed wrote dist/embed/model-arena-embed.js${built.status === 0 ? "" : `: ${built.stderr.slice(-400)}`}`);
  if (built.status !== 0) return;

  const server = await staticServer(root);
  const origin = `http://127.0.0.1:${server.address().port}`;
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 1000 });
  const errors = [];
  const hosts = new Set();
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error" && !m.text().startsWith("Failed to load resource")) errors.push(m.text());
    if (m.text().includes(FAKE_KEY)) errors.push("the key reached the console");
  });
  page.on("request", (r) => /^https?:/.test(r.url()) && hosts.add(new URL(r.url()).origin));
  const tag = "/examples/embed.html";
  try {
    const res = await page.goto(`${origin}${SUB}examples/embed.html`, { waitUntil: "networkidle0" });
    log(Boolean(res?.ok()), `${tag}: served from a sub-path (${SUB}) by a plain static server`);

    const empty = await page.evaluate(() => document.getElementById("gallery").shadowRoot.querySelector("[data-empty]")?.textContent ?? "");
    log(empty.includes("No published runs yet"), `${tag}: gallery shows its empty state`);

    const preset = await until(page, () => {
      const r = document.getElementById("gen").shadowRoot;
      return { subject: r.querySelector('[data-field="subject"]')?.value, estimate: r.querySelector("[data-estimate]")?.textContent ?? "", refs: r.querySelectorAll("[data-ref] img").length, tags: r.querySelector("[data-preview]")?.textContent ?? "" };
    }, (s) => s.estimate.startsWith("Estimated") && s.refs === 2);
    log(preset.ok, `${tag}: preset loaded (bundle, two references, shot): ${preset.value?.estimate.slice(0, 80)}`);
    log(preset.value?.tags.includes("<<<image_2>>>"), `${tag}: composed Kling prompt addresses the environment as <<<image_2>>>`);

    await page.evaluate((key) => {
      const r = document.getElementById("key").shadowRoot;
      r.querySelector('[data-field="key"]').value = key;
      r.querySelector("form").requestSubmit();
    }, FAKE_KEY);
    const connected = await page.evaluate(() => document.getElementById("key").connected);
    log(connected, `${tag}: fake key connected in the header panel`);

    await page.evaluate(() => document.getElementById("gen").shadowRoot.querySelector('[data-action="run"]').click());
    const asked = await until(page, () => Boolean(document.getElementById("gen").shadowRoot.querySelector('[data-action="confirm"]')), Boolean);
    log(asked.ok, `${tag}: Run asks to confirm the estimate first`);
    await page.evaluate(() => document.getElementById("gen").shadowRoot.querySelector('[data-action="confirm"]').click());
    const done = await until(page, () => document.getElementById("gen").shadowRoot.querySelector("[data-caption]")?.textContent ?? "", Boolean, 20000);
    log(done.ok && ["reference video guide.mp4", "reference image character.png", "reference image environment.png", "Cost: $0.940"].every((x) => done.value.includes(x)), `${tag}: result caption: ${done.value?.slice(0, 120)}`);

    const arena = () => {
      const a = document.getElementById("gen").shadowRoot.querySelector("model-arena").shadowRoot;
      return [...a.querySelectorAll(".screen video")].map((v) => ({ ready: v.readyState, t: v.currentTime, paused: v.paused }));
    };
    const ready = await until(page, arena, (v) => v.length === 2 && v.every((x) => x.ready >= 2));
    log(ready.ok, `${tag}: guide and result both load (${JSON.stringify(ready.value)})`);
    await page.evaluate(() => document.getElementById("gen").shadowRoot.querySelector("model-arena").shadowRoot.querySelector(".transport button.primary").click());
    await sleep(1200);
    const played = await page.evaluate(arena);
    const spread = Math.abs(played[0].t - played[1].t);
    log(played.every((v) => !v.paused && v.t > 0.4) && spread < 0.15, `${tag}: guide and result play on one clock (spread ${spread.toFixed(3)} s)`);

    await page.evaluate(() => document.getElementById("gen").shadowRoot.querySelector('[data-action="add"]').click());
    const gal = await until(page, () => {
      const a = document.getElementById("gallery").shadowRoot.querySelector("model-arena")?.shadowRoot;
      return a ? { videos: [...a.querySelectorAll(".inputs-row video")].map((v) => v.readyState), refs: a.querySelectorAll(".ref-strip img").length, audio: a.querySelectorAll("audio").length } : null;
    }, (s) => s && s.videos.length === 2 && s.videos.every((r) => r >= 2));
    log(gal.ok && gal.value.refs === 2 && gal.value.audio === 1, `${tag}: gallery plays the added run with its references and the guide's audio (${JSON.stringify(gal.value)})`);

    const follow = await until(page, () => document.getElementById("player").video.readyState, (r) => r >= 2);
    log(follow.ok, `${tag}: <arena-player> loaded the result`);
    await page.evaluate(() => document.getElementById("host-play").click());
    await sleep(1200);
    const f = await page.evaluate(() => ({ host: window.hostClock.time, video: document.getElementById("player").currentTime }));
    await page.evaluate(() => document.getElementById("host-play").click());
    log(f.video > 0.5 && Math.abs(f.host - f.video) <= 1 / 24 + 0.02, `${tag}: player follows the host clock (host ${f.host.toFixed(3)} s, video ${f.video.toFixed(3)} s)`);

    const leaked = await page.evaluate((key) => document.documentElement.outerHTML.includes(key) || location.href.includes(key) || JSON.stringify(localStorage).includes(key), FAKE_KEY);
    log(!leaked, `${tag}: the key is in no markup, URL or localStorage`);
    log([...hosts].every((h) => h === origin), `${tag}: every request stayed on the static server (${[...hosts].join(", ")})`);
    log(errors.length === 0, `${tag}: no page errors${errors.length ? `: ${errors.join(" | ")}` : ""}`);
  } finally {
    await page.close();
    server.close();
  }
}
