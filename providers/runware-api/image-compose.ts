/**
 * composeImagePrompt: one neutral request (a character sheet, an environment
 * view, or a free subject, plus the references and their roles) written the
 * way the chosen model's Runware guide asks. Deterministic and pure. Each
 * dialect follows its guide (image-guides.ts):
 *
 * - gpt: deliverable first, one clause per region with counts and positions,
 *   a roll call "Image 1 is …" for references, a keep list, then exclusions.
 * - h3: task and use, arrangement, position, camera, empty areas, materials,
 *   light, exclusions last; "the X from image N", keep as categories, say
 *   what may change, light from the setting image.
 * - seedream: a brief (use, subject, setting, light, lens, framing, materials,
 *   exclusions); "image N" plus a noun; keep as categories.
 * - flux3: subject, action, location, composition, style; no exclusions, only
 *   what is there; each reference a job; whose light wins; contact shadows.
 * - klein3: framing, subject, background, lighting, then a style line;
 *   absences as what is there; restate a reference's details.
 * - neutral: no guide published; plain clauses.
 */
import { findImageModel } from "./image-models.ts";
import { imageGuide, type PromptDialect } from "./image-guides.ts";
import { PlanError } from "./task.ts";

export interface ComposeReference {
  role: "character" | "environment" | "other";
  /** What the image shows or is for, in a few words; restated where the guide asks for it. */
  note?: string;
}

export interface ComposeImageInput {
  model: string;
  kind: "character" | "environment" | "free";
  /** The character, the place, or (free) the whole subject. */
  subject: string;
  /** An art style, such as "flat cel-shaded animation". */
  style?: string;
  /** Environment: the light and time of day. */
  light?: string;
  /** Environment: the camera height and angle the shot uses. */
  camera?: string;
  references?: ComposeReference[];
  orientation?: "landscape" | "portrait" | "square";
}

export interface ComposedImagePrompt {
  prompt: string;
  notes: string[];
}

interface Job {
  n: number;
  noun: string;
  /** What this image is for, as a phrase. */
  role: string;
  keep?: string;
  mayChange?: string;
  /** Used only for style or palette, not for content. */
  styleOnly: boolean;
  note?: string;
}

const FRAME = { landscape: "a wide landscape frame", portrait: "a tall portrait frame", square: "a square frame" } as const;
const clean = (s: string) => s.trim().replace(/\s+/g, " ").replace(/[.\s]+$/, "");
const list = (xs: string[]) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`);
const sentence = (s: string) => (s ? s[0]!.toUpperCase() + s.slice(1) + "." : "");

function jobs(input: ComposeImageInput): Job[] {
  const kind = input.kind === "free" ? undefined : input.kind;
  return (input.references ?? []).map((r, i) => {
    const n = i + 1;
    const note = r.note ? clean(r.note) : undefined;
    if (r.role === "character" && kind !== "environment")
      return { n, noun: "character", role: "the character to show", keep: "face, hair, build and clothing", mayChange: kind === "character" ? "pose and framing" : undefined, styleOnly: false, note };
    if (r.role === "character")
      return { n, noun: "character", role: "a style reference, used only for its art style and colour palette", keep: "art style and colour palette", styleOnly: true, note };
    if (r.role === "environment" && kind !== "character")
      return { n, noun: "place", role: "the place to show", keep: "layout, architecture and materials", mayChange: input.camera ? "camera position" : undefined, styleOnly: false, note };
    if (r.role === "environment")
      return { n, noun: "setting", role: "a style reference, used only for its colour palette and the colour of its light", keep: "colour palette", styleOnly: true, note };
    return { n, noun: note ?? "reference", role: note ? `a reference for ${note}` : "a style reference", styleOnly: true };
  });
}

/** The neutral content of the request, before any dialect orders it. */
function brief(input: ComposeImageInput) {
  const subject = clean(input.subject);
  const style = input.style ? clean(input.style) : undefined;
  const frame = FRAME[input.orientation ?? (input.kind === "character" ? "landscape" : "landscape")];
  if (input.kind === "character")
    return {
      deliverable: `a character reference sheet${style ? ` in ${style}` : ""}, for use as a reference image`,
      subject,
      layout: "three full-body views of the same character side by side: the front view on the left, the side profile in the middle and the back view on the right",
      action: "standing in a neutral pose with the arms relaxed at the sides",
      setting: "a plain light grey studio background",
      settingAsState: "the background is plain, even light grey and unmarked",
      light: "soft, even studio light from the front, the shadows faint and diffuse",
      camera: "straight-on at mid-body height, the whole figure in each view with space above the head and below the feet",
      frame,
      exclusions: ["no text", "no labels", "no logos"],
    };
  if (input.kind === "environment")
    return {
      deliverable: `an environment view for a film shot${style ? ` in ${style}` : ""}`,
      subject,
      layout: "the place on its own",
      action: "empty and still",
      setting: subject,
      settingAsState: "the place is empty of people and every surface is unlettered",
      light: input.light ? clean(input.light) : "",
      camera: input.camera ? clean(input.camera) : "",
      frame,
      exclusions: ["no people", "no text"],
    };
  return { deliverable: "", subject, layout: "", action: "", setting: "", settingAsState: "", light: input.light ? clean(input.light) : "", camera: input.camera ? clean(input.camera) : "", frame, exclusions: [] as string[], style };
}

type Brief = ReturnType<typeof brief>;

function keepClause(js: Job[], of: (j: Job) => string): string {
  const parts = js.filter((j) => j.keep && !j.styleOnly).map((j) => `the ${j.keep} ${of(j)}`);
  return parts.length ? `Keep ${list(parts)}` : "";
}

const write: Record<PromptDialect, (b: Brief, js: Job[], input: ComposeImageInput) => string[]> = {
  gpt(b, js, input) {
    const out: string[] = [];
    if (js.length) out.push(list(js.map((j) => `${j.n === 1 ? "Image" : "image"} ${j.n} is ${j.role}${j.note ? ` (${j.note})` : ""}`)));
    if (input.kind === "free") out.push(b.subject);
    else {
      out.push(`${b.deliverable}, in ${b.frame}: ${b.subject}`);
      out.push(`${b.layout}, ${b.action}`);
      out.push(`${b.setting === b.subject ? "" : `On ${b.setting}, `}${b.light}${b.camera ? `, camera ${b.camera}` : ""}`.replace(/^, /, ""));
    }
    for (const j of js.filter((x) => x.styleOnly)) out.push(`Take only the ${j.keep ?? "style"} from image ${j.n}, not its content`);
    const keep = keepClause(js, (j) => `of the ${j.noun} from image ${j.n}`);
    if (keep) out.push(`${keep} exactly as ${js.filter((j) => j.keep && !j.styleOnly).length > 1 ? "they are" : "it is"}`);
    if (b.exclusions.length) out.push(list(b.exclusions));
    return out;
  },
  h3(b, js, input) {
    const out: string[] = [];
    if (js.length) out.push(`Use ${list(js.map((j) => `image ${j.n} as ${j.role}`))}`);
    if (input.kind === "free") out.push(b.subject);
    else {
      out.push(`${b.deliverable}, in ${b.frame}`);
      out.push(input.kind === "character" ? `${b.subject}, shown in ${b.layout}, ${b.action}` : `${b.subject}, ${b.action}`);
      if (b.camera) out.push(`The camera is ${b.camera}`);
      out.push(input.kind === "character" ? "Plain empty space around each view" : "The frame holds only the place");
      if (input.kind === "character") out.push(`${b.setting}, ${b.light}`);
    }
    const setting = js.find((j) => j.noun === "place" || (j.noun === "setting" && !j.styleOnly));
    if (input.kind === "environment" && b.light) out.push(setting ? `Relight the place from image ${setting.n} with ${b.light}` : b.light);
    const keep = keepClause(js, (j) => `from image ${j.n}`);
    if (keep) out.push(keep);
    for (const j of js.filter((x) => x.styleOnly)) out.push(`Take only the ${j.keep ?? "style"} from image ${j.n}`);
    const may = js.filter((j) => j.mayChange).map((j) => j.mayChange!);
    if (may.length) out.push(`The ${list([...new Set(may)])} can change`);
    if (b.exclusions.length) out.push(list(b.exclusions));
    return out;
  },
  seedream(b, js, input) {
    const out: string[] = [];
    if (js.length) out.push(list(js.map((j) => `${j.n === 1 ? "Image" : "image"} ${j.n} is ${j.role}${j.note ? ` (${j.note})` : ""}`)));
    if (input.kind === "free") out.push(b.subject);
    else {
      out.push(b.deliverable);
      out.push(input.kind === "character" ? `The subject is ${b.subject}, ${b.action}` : `The setting is ${b.subject}, ${b.action}`);
      if (input.kind === "character") out.push(`The setting is ${b.setting}`);
      if (b.light) out.push(`The light is ${b.light}`);
      out.push(input.kind === "character" ? "50mm lens, straight-on" : b.camera ? `The camera is ${b.camera}` : "");
      out.push(`Framing: ${input.kind === "character" ? b.layout : "the place fills the frame"}, in ${b.frame}`);
    }
    const keep = keepClause(js, (j) => `of the ${j.noun} from image ${j.n}`);
    if (keep) out.push(keep);
    for (const j of js.filter((x) => x.styleOnly)) out.push(`Take only the ${j.keep ?? "style"} from image ${j.n}`);
    if (b.exclusions.length) out.push(list(b.exclusions));
    return out.filter(Boolean);
  },
  flux3(b, js, input) {
    const out: string[] = [];
    if (js.length) out.push(list(js.map((j) => `${j.n === 1 ? "Image" : "image"} ${j.n} supplies ${j.role}`)));
    if (input.kind === "free") out.push(b.subject);
    else if (input.kind === "character") {
      out.push(`${b.subject}, shown in ${b.layout}`);
      out.push(b.action);
      out.push(`${b.frame}, the camera ${b.camera}, a soft contact shadow under each view`);
    } else {
      out.push(b.subject);
      out.push(b.settingAsState);
      if (b.camera) out.push(`${b.frame}, the camera ${b.camera}`);
      else out.push(`In ${b.frame}`);
    }
    const setting = js.find((j) => j.noun === "place");
    if (b.light) out.push(setting ? `The light of the scene wins: ${b.light}` : b.light);
    if (input.kind === "character") out.push(b.settingAsState);
    if (input.style) out.push(clean(input.style));
    const keep = keepClause(js, (j) => `of the ${j.noun} from image ${j.n}`);
    if (keep) out.push(keep);
    for (const j of js.filter((x) => x.styleOnly)) out.push(`Take only the ${j.keep ?? "style"} from image ${j.n}`);
    return out;
  },
  klein3(b, js, input) {
    const out: string[] = [];
    const ref = (j: Job) => `the ${j.noun} from image ${j.n}${j.note ? `, ${j.note}` : ""}`;
    if (input.kind === "free") out.push(b.subject);
    else if (input.kind === "character") {
      out.push(`${sentence(b.frame).slice(0, -1)} showing ${b.layout}, ${b.camera}`);
      out.push(`The subject is ${js.find((j) => j.noun === "character" && !j.styleOnly) ? ref(js.find((j) => j.noun === "character" && !j.styleOnly)!) + ", " : ""}${b.subject}, ${b.action}`);
      out.push(`The background is ${b.setting}, plain and blank`);
      out.push(`The lighting is ${b.light}`);
    } else {
      const place = js.find((j) => j.noun === "place");
      out.push(`${sentence(b.frame).slice(0, -1)}${b.camera ? `, the camera ${b.camera}` : ""}`);
      out.push(place ? `Use image ${place.n} as the scene: ${b.subject}` : `The scene is ${b.subject}`);
      out.push(b.settingAsState);
      if (b.light) out.push(`The lighting is ${b.light}`);
    }
    for (const j of js.filter((x) => x.styleOnly)) out.push(`Take only the ${j.keep ?? "style"} of image ${j.n}${j.note ? `, ${j.note}` : ""}`);
    const keep = keepClause(js, (j) => `of the ${j.noun} from image ${j.n}`);
    if (keep) out.push(keep);
    out.push(input.style ? `Style: ${clean(input.style)}` : input.kind === "free" ? "" : "Style: clean reference illustration");
    return out.filter(Boolean);
  },
  neutral(b, js, input) {
    const out: string[] = [];
    const name = (j: Job) => (findImageModel(input.model).references.max === 1 ? "the reference image" : `image ${j.n}`);
    if (js.length) out.push(list(js.map((j) => `${name(j)} is ${j.role}`)));
    if (input.kind === "free") out.push(b.subject);
    else {
      out.push(`${b.deliverable}: ${b.subject}`);
      if (input.kind === "character") out.push(`${b.layout}, ${b.action}`);
      out.push(input.kind === "character" ? `${b.setting}, ${b.light}` : [b.light, b.camera && `camera ${b.camera}`].filter(Boolean).join(", "));
      out.push(b.frame);
    }
    const keep = keepClause(js, (j) => `from ${name(j)}`);
    if (keep) out.push(keep);
    for (const j of js.filter((x) => x.styleOnly)) out.push(`Take only the ${j.keep ?? "style"} from ${name(j)}`);
    if (b.exclusions.length) out.push(list(b.exclusions));
    return out;
  },
};

export function composeImagePrompt(input: ComposeImageInput): ComposedImagePrompt {
  const m = findImageModel(input.model);
  const guide = imageGuide(m.key);
  if (!guide) throw new PlanError(`No prompt guide entry for ${m.name}.`);
  if (!clean(input.subject)) throw new PlanError("Describe the subject.");
  const refs = input.references ?? [];
  if (refs.length > m.references.max)
    throw new PlanError(`${m.name} takes ${m.references.max === 1 ? "one reference image" : `up to ${m.references.max} reference images`}; got ${refs.length}.`);

  const notes: string[] = [];
  const js = jobs(input);
  const b = brief(input);
  const prompt = write[guide.dialect](b, js, input)
    .map((s) => sentence(clean(s)))
    .filter((s) => s.length > 1)
    .join(" ");

  if (prompt.length > m.prompt.max) throw new PlanError(`The composed prompt is ${prompt.length} characters; ${m.name} takes up to ${m.prompt.max}. Shorten the subject.`);
  if (guide.dialect === "seedream" && prompt.split(/\s+/).length > 600) notes.push(`${m.name}: the guide recommends under about 600 words; this prompt has ${prompt.split(/\s+/).length}.`);
  const charIdx = refs.findIndex((r) => r.role === "character");
  if (input.kind === "character" && charIdx > 0 && (guide.dialect === "gpt" || guide.dialect === "seedream"))
    notes.push(`${m.name}: send the character reference first; its guide treats image 1 as the base to keep.`);
  if (input.kind === "environment" && !input.light) notes.push("No light or time of day given; the model will choose one.");
  if (input.kind === "environment" && !input.camera) notes.push("No camera height given; say the one the shot uses.");
  if (guide.dialect === "h3") notes.push(`${m.name}: send a size or 1K/2K; with none it returns 4K at about four times the image tokens.`);
  if (guide.dialect === "seedream" && refs.length > 1) notes.push(`${m.name}: references of different shapes leave the output ratio open; send width and height.`);
  if (!guide.guide.url) notes.push(`${m.name}: no model guide published; the prompt uses plain clauses.`);
  return { prompt, notes };
}
