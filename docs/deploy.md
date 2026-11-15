---
tags: [deploy, site, cloudflare, model-arena]
summary: How the blog site is built for Cloudflare Pages, how its clips reach R2, how to set the media base and how to swap a take.
---

# Deploying the blog site

The site is one static folder, `site-dist/`: the blog post at `/` (three models, two scenes, played by `<model-arena>`), the spec matrix at `/arena/specs.html`, the element (`model-arena.js`), two scene records and a `_headers` file. It needs no key and no server. Clips never go into it; they live on R2.

| File | What it is |
| --- | --- |
| `site/manifest.json` | the media base and the chosen take per model per scene (the one file to edit) |
| `site/takes.json` | measured facts per take, written by `npm run site:media` (committed) |
| `site/index.html` | the post; `<!--@scene:<id>-->` and `<!--@specs-->` are filled at build time |
| `site-media/` | web copies, posters and originals (gitignored, uploaded to R2) |
| `site-dist/` | the build (gitignored, deployed to Pages) |

## Build

```sh
npm install
MEDIA_BASE=https://<your R2 public base>/ npm run build:site   # writes site-dist/
```

- **Build command:** `npm run build:site` · **output folder:** `site-dist` · Node 24.
- The build fails if any file in `site-dist/` is over 25 MiB, or if a clip, `jobs.json`, `.env` or key file would ship.
- In the Pages dashboard, set `MEDIA_BASE` as a build environment variable, or build locally and upload the folder:

```sh
npx wrangler pages deploy site-dist --project-name <name>
```

## Media to R2 (once, and after any swap)

```sh
SITE_SOURCE=<studio .local folder> npm run site:media                # site-media/ and site/takes.json
CLOUDFLARE_ACCOUNT_ID=<id> sh scripts/site-upload-r2.sh <bucket> [prefix]
DRY_RUN=1 CLOUDFLARE_ACCOUNT_ID=<id> sh scripts/site-upload-r2.sh <bucket>   # print the commands only
```

Make the bucket readable at a public URL (an r2.dev subdomain or a custom domain). That URL plus the prefix is the media base. Videos play from another origin without CORS because the page uses plain `<video>` tags.

## The media base

One value decides where every clip, poster and image loads from: `MEDIA_BASE` at build time, else `mediaBase` in `site/manifest.json` (`media/`, the preview). It is a relative folder or an `https://` URL.

## Preview locally

```sh
npm run build:site && npm run site:preview   # http://localhost:4321/, clips from site-media/ at /media/
npm run site:smoke -- --shots /tmp/shots     # headless Chrome: clips load, Play all, no console errors, phone width
```

## Swap a take

Edit the take's `id` in `site/manifest.json` (an id prefix from the studio's `jobs.json`; the alternates are listed beside it), then:

```sh
SITE_SOURCE=<studio .local folder> npm run site
```

That re-measures and re-encodes every chosen take, refuses a scene whose takes differ in prompt or settings, and rebuilds. Upload the new files to R2 and deploy again.

## The reference image (scene 2)

A scene's `"reference"` in the manifest is a path inside the source folder (`SITE_SOURCE`), for example `media/<job id>.image` for a still made in the studio. `npm run site` copies it to `site-media/` as the original plus a lighter JPEG, and the page shows it above the scene with a Full resolution link. The studio records only a SHA-256 of the reference it sent, and that fingerprint matches no file on disk, so the scene 2 sheet was matched by eye (the VORAX-M7 sheet, job `329983f2`): confirm it before publishing. `null` leaves the image off the page.
