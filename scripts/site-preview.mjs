// Local preview of the built blog site, as Cloudflare Pages plus R2 would serve it.
//
//   npm run build:site && npm run site:preview      → http://localhost:4321/
//
// Serves site-dist/ at / and site-media/ at /media/ (the preview media base),
// with HTTP range requests so the clips seek. Local only, read only.
import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SITE = join(ROOT, "site-dist");
const MEDIA = join(ROOT, "site-media");
const TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8", ".mp4": "video/mp4", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".png": "image/png", ".webp": "image/webp", ".svg": "image/svg+xml",
};

/** The file for a URL path, kept inside its folder; null when there is none. */
function fileFor(urlPath) {
  const path = decodeURIComponent(urlPath.split("?")[0]);
  const [dir, rest] = path.startsWith("/media/") ? [MEDIA, path.slice(7)] : [SITE, path.slice(1)];
  let file = normalize(join(dir, rest));
  if (file !== dir && !file.startsWith(dir + sep)) return null;
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, "index.html");
  return existsSync(file) ? file : null;
}

export function startPreview(port = Number(process.env.PORT ?? 4321)) {
  const server = createServer((req, res) => {
    const file = fileFor(req.url ?? "/");
    if (!file) {
      res.writeHead(404, { "Content-Type": "text/plain" }).end("Not found");
      return;
    }
    const size = statSync(file).size;
    const type = TYPES[extname(file).toLowerCase()] ?? "application/octet-stream";
    const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? "");
    if (range) {
      const start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]));
      const end = range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
      if (start >= size || start > end) {
        res.writeHead(416, { "Content-Range": `bytes */${size}` }).end();
        return;
      }
      res.writeHead(206, { "Content-Type": type, "Content-Length": end - start + 1, "Content-Range": `bytes ${start}-${end}/${size}`, "Accept-Ranges": "bytes" });
      createReadStream(file, { start, end }).pipe(res);
      return;
    }
    res.writeHead(200, { "Content-Type": type, "Content-Length": size, "Accept-Ranges": "bytes" });
    if (req.method === "HEAD") res.end();
    else createReadStream(file).pipe(res);
  });
  return new Promise((ok) => server.listen(port, "127.0.0.1", () => ok(server)));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (!existsSync(SITE)) {
    console.error("site-dist/ is missing: run npm run build:site first.");
    process.exit(2);
  }
  const server = await startPreview();
  console.log(`Preview: http://localhost:${server.address().port}/  (site-dist/, clips from site-media/ at /media/)`);
}
