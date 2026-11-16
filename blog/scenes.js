// CLIPS: the takes shown on the page. To swap a pick, run
//   GENOBI_LOCAL=<studio .local folder> scripts/blog-encode.sh <job-id>[@poster-seconds]
// and replace that clip's line with the JSON line it prints (keep scene and role).
// role "main" fills a scene's three-up player; "pov" fills the scene-1 side note.
// Optional: label (overrides the model name), mode (the facts table's Input row;
// default "text to video"), blocked (a run that produced no clip: shown as a card).
// Facts come from Genobi Studio's jobs.json (cost = Runware's includeCost; secs = updatedAt - createdAt).
const CLIPS = [
  { scene: "moto", role: "main", id: "813f9416", model: "runware-seedance-2-5", refs: 0, w: 1280, h: 720, fps: 24, cost: 2.3208, secs: 173, dur: 10, audio: true, prompt: "motocross riding, with camera on drivers head looking at the steering bar with interface, dynmic jumps with time warp and slow down half way through the trick, sports channel like camera with rain and mud splashing. We have sports comentator giving live comments on the tricks. Saying \"oh noo\" once the here does full backflip and lands full of dirt continueing the ride. Sunset on on the sky with full rainy wether. camera grain fast pase clip." },
  { scene: "moto", role: "main", id: "26875b74", model: "runware-kling-4", refs: 0, w: 1280, h: 720, fps: 24, cost: 1.57, secs: 277, dur: 10, audio: true, prompt: "motocross riding, with camera on drivers head looking at the steering bar with interface, dynmic jumps with time warp and slow down half way through the trick, sports channel like camera with rain and mud splashing. We have sports comentator giving live comments on the tricks. Saying \"oh noo\" once the here does full backflip and lands full of dirt continueing the ride. Sunset on on the sky with full rainy wether. camera grain fast pase clip." },
  { scene: "moto", role: "main", id: "8de579ee", model: "runware-h3", refs: 0, w: 1344, h: 768, fps: 24, cost: 0.8, secs: 202, dur: 10, audio: true, prompt: "motocross riding, with camera on drivers head looking at the steering bar with interface, dynmic jumps with time warp and slow down half way through the trick, sports channel like camera with rain and mud splashing. We have sports comentator giving live comments on the tricks. Saying \"oh noo\" once the here does full backflip and lands full of dirt continueing the ride. Sunset on on the sky with full rainy wether. camera grain fast pase clip." },
  { scene: "moto", role: "pov", label: "Seedance 2.5, second version", id: "57b611a7", model: "runware-seedance-2-5", refs: 0, w: 1280, h: 720, fps: 24, cost: 2.3208, secs: 267, dur: 10, audio: true, prompt: "motocross riding, with camera on drivers head looking at the steering bar with interface, dynmic jumps with time warp and slow down half way through the trick, sports channel like camera with rain and mud splashing. We have sports comentator giving live comments on the tricks. Saying \"oh noo\" once the here does full backflip and lands full of dirt continueing the ride, same camera view from the drivers head throughout the video. Sunset on on the sky with full rainy wether. camera grain fast pase clip." },
  { scene: "moto", role: "pov", label: "Kling VIDEO 4.0, second version", id: "bfc88a84", model: "runware-kling-4", refs: 0, w: 1280, h: 720, fps: 24, cost: 1.57, secs: 225, dur: 10, audio: true, prompt: "motocross riding, with camera on drivers head looking at the steering bar with interface, dynmic jumps with time warp and slow down half way through the trick, sports channel like camera with rain and mud splashing. We have sports comentator giving live comments on the tricks. Saying \"oh noo\" once the here does full backflip and lands full of dirt continueing the ride, same camera view from the drivers head throughout the video no cuts. Sunset on on the sky with full rainy wether. camera grain fast pase clip." },
  { scene: "sheet", role: "main", id: "7915cbce", model: "runware-seedance-2-5", refs: 1, w: 1280, h: 720, fps: 24, cost: 2.3208, secs: 170, dur: 10, audio: true, prompt: "animate this character sheet treating it as storyboard, follow closely the aesthetic and style with smooth camera move from each angle with zooms on\ndetails and body parts in 3D realistic view, device setting up moving and assembling with parts, no hard cuts Every camera transition is motivated by adding parts and assembling unit, reflective gear surface, usability electrical shockwave or foreground occlusion. Camera movement feels like an elegant\nhigh-end product film combined with kinetic action: smooth acceleration, controlled energy bursts, precise spatial continuity. No voice and commentary or logos or text." },
  { scene: "sheet", role: "main", id: "e8b3fb8f", model: "runware-kling-4", refs: 1, w: 1280, h: 720, fps: 24, cost: 1.57, secs: 159, dur: 10, audio: true, prompt: "animate this character sheet treating it as storyboard, follow closely the aesthetic and style with smooth camera move from each angle with zooms on\ndetails and body parts in 3D realistic view, device setting up moving and assembling with parts, no hard cuts Every camera transition is motivated by adding parts and assembling unit, reflective gear surface, usability foreground occlusion. Camera movement feels like an elegant\nhigh-end product film combined with kinetic action: smooth acceleration, controlled, precise spatial continuity. No voice and commentary or logos or text." },
  { scene: "sheet", role: "main", id: "cab7d0d8", model: "runware-h3", refs: 1, w: 1344, h: 768, fps: 24, cost: 0.8, secs: 208, dur: 10, audio: true, prompt: "animate this character sheet treating it as storyboard, follow closely the aesthetic and style with smooth camera move from each angle with zooms on\ndetails and body parts in 3D realistic view, device setting up moving and assembling with parts, no hard cuts Every camera transition is motivated by adding parts and assembling unit, reflective gear surface, usability electrical shockwave or foreground occlusion. Camera movement feels like an elegant\nhigh-end product film combined with kinetic action: smooth acceleration, controlled energy bursts, precise spatial continuity. No voice and commentary or logos or text." },
  {"scene": "runner", "role": "main", "id": "ae5f5a5b", "model": "runware-kling-4", "prompt": "nike advert, runner in the new york city. Moving accross pavement, fine greain, visible logo, characters  strength and speed", "refs": 1, "w": 1280, "h": 720, "fps": 24.0, "cost": 1.57, "secs": 134, "dur": 10.0, "audio": true, "mode": "text to video, one reference image"},
  {"scene": "runner", "role": "main", "id": "873c2f11", "model": "runware-h3-frame", "prompt": "nike advert, runner in the new york city. Moving accross pavement, fine greain, visible logo, characters  strength and speed", "refs": 1, "w": 1344, "h": 768, "fps": 24.0, "cost": 0.8, "secs": 204, "dur": 10.0, "audio": true, "mode": "first frame (one still)"},
  {"scene": "runner", "role": "main", "id": "23a921db", "model": "flux-3-i2v", "prompt": "shoe manufacturer advert, runner in the new york city. Moving accross pavement, fine greain, visible logo, characters  strength and speed", "refs": 1, "w": 1280, "h": 704, "fps": 24.0, "cost": 1.5, "secs": 100, "dur": 10.0, "audio": true, "mode": "image to video (start image)"},
  { "scene": "runner", "role": "main", "model": "runware-seedance-2-5", "blocked": "Rejected by ByteDance's content moderation. Runware answered every Seedance run of this brief with invalidProviderContent: \"The generated content was flagged and rejected by ByteDance's content moderation system.\" Nothing was charged.", "mode": "text to video and first frame, same start image" },
  // Draw Control (Example 1). The inputs first: the map played back (recorded from the page by stepping its scrub bar,
  // one screenshot per frame) and the guide clip itself (Settings > Download guide (.zip) > guide.mp4). Then the three
  // models that followed the guide with the same references. No cost or time recorded for these runs.
  { scene: "guide", role: "main", id: "drawing-ex1", input: true, model: "draw-control-map", label: "The drawing, played back in Draw Control", w: 1280, h: 720, fps: 24, dur: 14.04, audio: true },
  { scene: "guide", role: "main", id: "guide-ex1", input: true, model: "draw-control-guide", label: "The guide, from Draw Control", w: 1280, h: 720, fps: 24, dur: 14.04, audio: true },
  { scene: "guide", role: "main", id: "febe9cb1", model: "runware-seedance-2-5", w: 1280, h: 720, fps: 24, dur: 14.04, audio: true },
  { scene: "guide", role: "main", id: "224d7eae", model: "runware-kling-4", w: 1280, h: 720, fps: 24, dur: 14.04, audio: true },
  { scene: "guide", role: "main", id: "ecc3166d", model: "runware-h3", w: 1344, h: 768, fps: 24, dur: 14.38, audio: true },
  // Draw Control, Example 2: one guide, three subjects.
  { scene: "guide2", role: "main", id: "drawing-ex2", input: true, model: "draw-control-map", label: "The drawing, played back in Draw Control", w: 1280, h: 720, fps: 24, dur: 12.04, audio: true },
  { scene: "guide2", role: "main", id: "guide-ex2", input: true, model: "draw-control-guide", label: "The guide, from Draw Control", w: 1280, h: 720, fps: 24, dur: 12.04, audio: true },
  { scene: "guide2", role: "main", id: "ea43cecf", model: "runware-kling-4", label: "Anime skater · Kling VIDEO 4.0", w: 1280, h: 720, fps: 24, dur: 11.04, audio: true },
  { scene: "guide2", role: "main", id: "467386d7", model: "runware-seedance-2-5", label: "Anime skater · Seedance 2.5", w: 1280, h: 720, fps: 24, dur: 11.07, audio: true },
  { scene: "guide2", role: "main", id: "316c556f", model: "runware-kling-4", label: "Runner · Kling VIDEO 4.0", w: 1280, h: 720, fps: 24, dur: 12.04, audio: true },
  { scene: "guide2", role: "main", id: "cba0b6ba", model: "runware-seedance-2-5", label: "Forklift · Seedance 2.5", w: 1280, h: 720, fps: 24, dur: 12.06, audio: true },
];

const MODELS = {
  "runware-seedance-2-5": { name: "Seedance 2.5", air: "bytedance:seedance@2.5" },
  "runware-kling-4": { name: "Kling VIDEO 4.0", air: "klingai:kling-video@4.0" },
  "runware-h3": { name: "MiniMax H3", air: "minimax:h3@0" },
  "runware-h3-frame": { name: "MiniMax H3", air: "minimax:h3@0" },
  "flux-3-i2v": { name: "FLUX 3 Video", air: "black-forest-labs:flux-3" },
};

(() => {
  // Where the clips load from: the page's <meta name="media-base">, else media/ beside the page.
  const CLIP_BASE = (() => {
    const raw = document.querySelector('meta[name="media-base"]')?.content.trim() || "media/";
    return raw.endsWith("/") ? raw : `${raw}/`;
  })();
  // Everything is built with DOM nodes and text, never parsed HTML.
  function h(tag, attrs = {}, ...kids) {
    const svg = ["svg", "path"].includes(tag);
    const el = svg ? document.createElementNS("http://www.w3.org/2000/svg", tag) : document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
      else if (v === true) el.setAttribute(k, "");
      else if (v !== false && v != null) el.setAttribute(k, v);
    }
    for (const k of kids.flat()) if (k != null) el.append(typeof k === "string" ? document.createTextNode(k) : k);
    return el;
  }
  const icon = (...d) => h("svg", { viewBox: "0 0 24 24", "aria-hidden": "true" }, d.map((p) => h("path", typeof p === "string" ? { d: p } : p)));
  const PLAY = () => icon("M7 5v14l12-7z");
  const PAUSE = () => icon("M7 5h4v14H7zM13 5h4v14h-4z");
  const SPK = () => icon("M4 9v6h4l5 4V5L8 9H4z", { d: "M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12", class: "wave" });

  const words = (s) => s.replace(/\s+/g, " ").trim().split(" ");
  const mins = (s) => `${Math.floor(s / 60)} m ${String(s % 60).padStart(2, "0")} s`;
  const clock = (t) => `0:${String(Math.floor(t)).padStart(2, "0")}`;
  const name = (c) => (MODELS[c.model] || { name: c.model }).name;

  // Word-level diff against the scene's first prompt, so a tuned prompt shows what changed.
  function diff(base, text) {
    const a = words(base), b = words(text), n = a.length, m = b.length;
    const L = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
    for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--)
      L[i][j] = a[i] === b[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
    const runs = []; let i = 0, j = 0;
    const push = (kind, w) => {
      const last = runs[runs.length - 1];
      if (last && last.kind === kind) last.words.push(w);
      else runs.push({ kind, words: [w] });
    };
    while (i < n || j < m) {
      if (i < n && j < m && a[i] === b[j]) { push("same", a[i]); i++; j++; }
      else if (j < m && (i === n || L[i][j + 1] >= L[i + 1][j])) { push("ins", b[j]); j++; }
      else { push("del", a[i]); i++; }
    }
    return runs.flatMap((r, k) => [k ? " " : null, r.kind === "same" ? r.words.join(" ") : h(r.kind, {}, r.words.join(" "))]);
  }

  const EXPAND = () => icon("m15 15 6 6M15 9l6-6M21 16v5h-5M21 8V3h-5M3 16v5h5M3 21l6-6M3 8V3h5M9 9 3 3");
  const CLOSE = () => icon("M6 6l12 12M18 6 6 18");
  const SCENE_NAMES = { moto: "Brief 1 · motocross", sheet: "Brief 2 · character sheet", runner: "Brief 3 · runner", guide: "Draw Control · drawn guide", guide2: "Draw Control · one guide, three subjects" };

  // The page plays light web copies; Full view loads the originals as generated
  // (full/ under the clip base), only for the scene it opens. Clips come from the
  // page's <meta name="media-base"> (an R2 public URL), else from media/ beside the
  // page; posters always sit beside the page.
  function tile(c, base, onExpand, full) {
    const m = MODELS[c.model] || { name: c.model, air: "" };
    const same = !c.prompt || words(c.prompt).join(" ") === words(base).join(" ");
    const src = full ? `${CLIP_BASE}full/${c.id}.mp4` : `${CLIP_BASE}${c.id}.mp4`;
    const video = h("video", { muted: true, playsinline: true, preload: full ? "auto" : "metadata", poster: `media/${c.id}.jpg`, src });
    video.muted = true;
    const spk = h("button", { class: "spk", "aria-pressed": "false", "aria-label": `Listen to ${c.label || m.name}`, title: "Listen to this clip" }, SPK());
    const ex = onExpand
      ? h("button", { class: "expand", "aria-label": `Open ${c.label || m.name} bigger`, title: "Open bigger", onclick: onExpand }, EXPAND())
      : null;
    return h("figure", { class: "clip" },
      h("div", { class: "frame" }, video, spk, ex),
      h("figcaption", {}, h("b", {}, c.label || m.name),
        c.prompt ? h("details", {}, h("summary", {}, "Prompt ", h("span", {}, same ? "· as written" : "· tuned, changes marked")),
          h("p", { class: "prompt" }, same ? c.prompt : diff(base, c.prompt))) : null));
  }

  // One synced grid: tiles on a shared clock, a thin transport bar, one speaker at a time.
  // opts.full: original files; opts.loop: start again at the end; opts.from: the
  // time and play state to pick up from (Full view continues where you were).
  function grid(clips, base, onExpand, opts = {}) {
    const tiles = clips.map((c, i) => tile(c, base, onExpand && (() => onExpand(i)), opts.full));
    const pp = h("button", { class: "pp", "aria-label": "Play all" }, PLAY());
    const range = h("input", { type: "range", min: "0", max: "10", step: "any", value: "0", "aria-label": "Scrub all clips" });
    const t = h("span", { class: "t" }, "0:00 / 0:10");
    const vids = tiles.map((f) => f.querySelector("video")), lead = vids[0];
    const end = () => Math.min(...vids.map((v) => v.duration || 10));
    const seek = (x) => vids.forEach((v) => { v.currentTime = x; });
    // The scrub bar and the clock take the clips' real length once it is known (10 s until then).
    const fit = () => { range.max = String(end()); t.textContent = `${clock(lead.currentTime)} / ${clock(end())}`; };
    vids.forEach((v) => (v.readyState >= 1 ? fit() : v.addEventListener("loadedmetadata", fit, { once: true })));
    pp.addEventListener("click", () => {
      if (!lead.paused) { vids.forEach((v) => v.pause()); return; }
      if (lead.currentTime >= end() - 0.05) seek(0); else seek(lead.currentTime);
      vids.forEach((v) => v.play().catch(() => {}));
    });
    // The line fills green up to the playhead.
    const fill = (x) => range.style.setProperty("--p", `${Math.min(100, (x / end()) * 100)}%`);
    range.addEventListener("input", () => { seek(Number(range.value)); fill(Number(range.value)); });
    // timeupdate only fires about four times a second, so while playing the line
    // and the dot are redrawn every frame from the playhead: a smooth glide.
    let frame = 0;
    const glide = () => {
      const x = lead.currentTime;
      range.value = x; fill(x);
      frame = lead.paused ? 0 : requestAnimationFrame(glide);
    };
    lead.addEventListener("play", () => {
      pp.replaceChildren(PAUSE()); pp.setAttribute("aria-label", "Pause all");
      if (!frame) frame = requestAnimationFrame(glide);
    });
    lead.addEventListener("pause", () => {
      pp.replaceChildren(PLAY()); pp.setAttribute("aria-label", "Play all"); vids.forEach((v) => v.pause());
      cancelAnimationFrame(frame); frame = 0; range.value = lead.currentTime; fill(lead.currentTime);
    });
    lead.addEventListener("timeupdate", () => {
      const x = lead.currentTime; t.textContent = `${clock(x)} / ${clock(end())}`;
      if (lead.paused) { range.value = x; fill(x); }
      if (!lead.paused) vids.slice(1).forEach((v) => { if (Math.abs(v.currentTime - x) > 0.12) v.currentTime = x; });
      if (x >= end() - 0.05) {
        if (opts.loop && !lead.paused) { seek(0); vids.forEach((v) => v.play().catch(() => {})); }
        else vids.forEach((v) => v.pause());
      }
    });
    // Pick up from where the viewer was, once every clip can seek.
    if (opts.from) {
      const { t: at, playing } = opts.from;
      const ready = vids.map((v) => (v.readyState >= 1 ? Promise.resolve() : new Promise((r) => v.addEventListener("loadedmetadata", r, { once: true }))));
      Promise.all(ready).then(() => {
        const x = Math.min(at, end() - 0.1);
        seek(Math.max(0, x)); range.value = x; fill(x);
        if (playing) vids.forEach((v) => v.play().catch(() => {}));
      });
    }
    tiles.forEach((f, i) => f.querySelector(".spk").addEventListener("click", (e) => {
      const b = e.currentTarget, on = b.getAttribute("aria-pressed") !== "true";
      document.querySelectorAll(".spk").forEach((o) => o.setAttribute("aria-pressed", "false"));
      document.querySelectorAll("video").forEach((v) => { v.muted = true; });
      if (on) { b.setAttribute("aria-pressed", "true"); vids[i].muted = false; }
    }));
    const state = () => ({ t: lead.currentTime || 0, playing: !lead.paused });
    return { nodes: [h("div", { class: `clips n${clips.length}` }, tiles), h("div", { class: "bar" }, pp, range, t)], tiles, vids, state };
  }

  // Lightbox, as in the Arena panel: "All" shows the scene's clips big on one clock;
  // one clip shows alone with its prompt, fitted or at its actual size (never upscaled).
  const lb = h("dialog", { class: "lb", "aria-label": "Full view" });
  document.body.append(lb);
  const pauseAll = () => document.querySelectorAll("video").forEach((v) => v.pause());
  lb.addEventListener("close", () => { lb.querySelectorAll("video").forEach((v) => v.pause()); lb.replaceChildren(); });
  lb.addEventListener("click", (e) => { if (e.target === lb) lb.close(); });

  // from: { t, playing } of the player it was opened from, so playback carries on.
  function openLb(clips, base, scene, which, from) {
    pauseAll();
    const all = which === "all";
    const shownCount = all ? clips.length : 1;
    // Four to six clips sit in two rows in Full view (guidance over videos, or two by two), sized to fit the window.
    const frame = h("div", { class: `lb-frame${all ? "" : " one"}${shownCount >= 4 && shownCount <= 6 ? ` fit${shownCount}` : ""}` });
    const size = h("button", { class: "lb-size", hidden: all }, "Actual size");
    const close = h("button", { class: "lb-close", "aria-label": "Close full view", onclick: () => lb.close() }, CLOSE());
    const title = all ? `All ${clips.length} clips · ${SCENE_NAMES[scene] || ""}` : clips[which].label || name(clips[which]);
    const shown = all ? clips : [clips[which]];
    // In Full view the clips loop, play the originals, and carry the playhead on swap.
    let g = null;
    const go = (to) => openLb(clips, base, scene, to, g ? g.state() : from);
    g = grid(shown, base, all ? (i) => go(i) : null, { full: true, loop: true, from });
    frame.append(...g.nodes);
    if (all) g.tiles.forEach((f, i) => f.querySelector(".frame").addEventListener("click", (e) => {
      if (!e.target.closest("button")) go(i);
    }));
    size.addEventListener("click", () => {
      const on = frame.classList.toggle("actual");
      size.textContent = on ? "Fit to screen" : "Actual size";
    });
    const strip = h("div", { class: "lb-strip" },
      h("button", { "aria-current": String(all), onclick: () => go("all") }, "All"),
      clips.map((c, i) => h("button", { "aria-current": String(i === which), onclick: () => go(i) }, c.label || name(c))));
    const one = all ? null : clips[which].prompt;
    const promptText = all ? (clips.some((c) => c.prompt) ? "Click a clip to see it alone, with its prompt." : "Click a clip to see it alone.")
      : !one ? "" : (words(one).join(" ") === words(base).join(" ") ? one : diff(base, one));
    lb.replaceChildren(h("div", { class: "lb-inner" },
      h("div", { class: "lb-bar" }, h("b", {}, title), h("div", { class: "lb-tools" }, size, close)),
      frame, strip, h("p", { class: "lb-prompt" }, promptText)));
    if (!lb.open) lb.showModal();
    close.focus();
  }

  function player(el) {
    const all = CLIPS.filter((c) => c.scene === el.dataset.scene && c.role === el.dataset.role);
    // A run that produced no clip (moderation) is a card under the player, never a video.
    const clips = all.filter((c) => !c.blocked);
    const blocked = all.filter((c) => c.blocked);
    if (!clips.length) return;
    const base = (CLIPS.find((c) => c.scene === el.dataset.scene && c.role === "main" && !c.blocked) || clips[0]).prompt;
    const scene = el.dataset.scene;
    const g = grid(clips, base, (i) => openLb(clips, base, scene, i, g.state()));
    // Where a scene shows its inputs beside the models (input: true), a second button opens the models alone.
    const outputs = clips.filter((c) => !c.input);
    const split = outputs.length > 1 && outputs.length < clips.length;
    const full = h("button", { class: "fullview", title: split ? "The guidance and the videos, bigger" : "All clips, bigger", onclick: () => openLb(clips, base, scene, "all", g.state()) }, EXPAND(), "Full view");
    const only = split
      ? h("button", { class: "fullview", title: "Only the models' videos, side by side", onclick: () => openLb(outputs, base, scene, "all", g.state()) }, EXPAND(), "Videos only")
      : null;
    const cards = blocked.map((c) =>
      h("div", { class: "blocked" }, h("b", {}, name(c)), h("span", {}, " · no clip"), h("p", {}, c.blocked)));
    el.replaceChildren(h("div", { class: "views" }, only, full), ...g.nodes, ...cards);
  }

  function facts(el) {
    const clips = CLIPS.filter((c) => c.scene === el.dataset.scene && c.role === "main" && !c.blocked);
    const row = (label, f) => h("tr", {}, h("th", {}, label), clips.map((c) => h("td", {}, f(c))));
    // Input mode only where a brief mixes them (brief 3); briefs 1 and 2 are all text to video.
    const mode = clips.some((c) => c.mode) ? [row("Input", (c) => c.mode || "text to video")] : [];
    el.replaceChildren(h("table", {},
      h("thead", {}, h("tr", {}, h("th", {}), clips.map((c) => h("th", {}, name(c))))),
      h("tbody", {},
        ...mode,
        row("Duration", (c) => `${c.dur.toFixed(2)} s`),
        row("Resolution", (c) => `${c.w}×${c.h}`),
        row("Frame rate", (c) => `${c.fps} fps`),
        row("Sound", (c) => (c.audio ? "generated" : "none")),
        row("Cost per 10 s HD clip", (c) => `$${c.cost.toFixed(2)}`),
        row(["Time to result ", h("small", {}, "(approx.)")], (c) => `≈ ${mins(c.secs)}`))));
  }

  // A reference image opens bigger in a small window over the page: click or Enter to open; click, Escape or the cross to close.
  const box = h("dialog", { class: "imgbox", "aria-label": "Image, larger" });
  document.body.append(box);
  box.addEventListener("close", () => box.replaceChildren());
  box.addEventListener("click", (e) => { if (e.target === box || e.target.tagName === "IMG") box.close(); });
  function openImage(img) {
    const caption = img.closest("figure")?.querySelector("figcaption")?.textContent || img.alt;
    const close = h("button", { class: "lb-close", "aria-label": "Close image", onclick: () => box.close() }, CLOSE());
    box.replaceChildren(h("div", { class: "imgbar" }, h("span", {}, caption), close), h("img", { src: img.currentSrc || img.src, alt: img.alt }));
    if (!box.open) box.showModal();
    close.focus();
  }
  document.querySelectorAll("figure.ref img").forEach((img) => {
    img.tabIndex = 0;
    img.setAttribute("role", "button");
    img.setAttribute("aria-label", `Open bigger: ${img.alt}`);
    img.addEventListener("click", () => openImage(img));
    img.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openImage(img); } });
  });

  // A stand-alone clip in the page (the teaser) takes its file from the same clip base.
  document.querySelectorAll("video[data-clip]").forEach((v) => { v.src = `${CLIP_BASE}${v.dataset.clip}.mp4`; });
  document.querySelectorAll(".player").forEach(player);
  document.querySelectorAll(".facts").forEach(facts);
})();
