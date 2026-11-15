/**
 * The words of each model's dialect. Structure follows each model's own
 * prompting guide, as summarised in its spec's `prompting.rules`:
 * - tags (Kling): "Reference only the … of <<<video_1>>>" when a guide video carries the move, one
 *   sentence per other input, the shot, camera words (move, height, speed, end) only without a guide, timed beats, audio;
 * - at-mentions (Seedance): the camera clause first, tags bound to roles, audio last;
 * - plain words (MiniMax): references by number with roles, subject not move, then "Sound:";
 * - none (LTX): one flowing present-tense paragraph, the move left out when the parameter carries it;
 * - none (FLUX 3 Video): plain prose, frames named in words, always a camera direction.
 */
import type { ComposedCamera, ReferenceRole, ShotDescription, UsedInput } from "./compose.ts";
import type { CameraMove, ModelSpec } from "./specs/types.ts";

const ROLE: Record<ReferenceRole, { noun: string; keep: string }> = {
  "first-frame": { noun: "the opening frame", keep: "its composition and pose" },
  "last-frame": { noun: "the closing frame", keep: "its composition and pose" },
  keyframe: { noun: "a keyframe", keep: "its pose" },
  character: { noun: "the character", keep: "face, build and outfit" },
  product: { noun: "the product", keep: "shape, materials and colours" },
  garment: { noun: "the garment", keep: "cut, fabric and colour" },
  style: { noun: "the look", keep: "palette, lighting and texture" },
  setting: { noun: "the setting", keep: "layout and light" },
  motion: { noun: "the motion guide", keep: "body motion, timing and camera move" },
  source: { noun: "the source clip", keep: "everything not named in the prompt" },
  soundtrack: { noun: "the soundtrack", keep: "its beat and timing" },
};

/** Plain words for moves a model's guide does not name. */
const NEUTRAL: Record<CameraMove, string> = {
  static: "The camera stays still.",
  "push-in": "The camera moves slowly towards the subject.",
  "pull-out": "The camera moves slowly away from the subject.",
  "track-left": "The camera moves left alongside the subject.",
  "track-right": "The camera moves right alongside the subject.",
  "crane-up": "The camera rises.",
  "crane-down": "The camera lowers.",
  orbit: "The camera circles the subject.",
  handheld: "Handheld camera.",
  "rack-focus": "Focus shifts from the foreground to the subject.",
};

/** The camera sentence from the model's own guide vocabulary, or plain words with a note. */
export function cameraSentence(spec: ModelSpec, move: CameraMove, focus = "the subject"): { text: string; note?: string } {
  const term = spec.camera.vocabulary.find((t) => t.move === move && t.phrase);
  if (term?.phrase) return { text: term.phrase.replaceAll("{subject}", focus) };
  if (spec.camera.kind === "parameter") {
    const v = spec.camera.values.find((x) => x.move === move);
    if (v) return { text: v.meaning };
  }
  return { text: NEUTRAL[move], note: `"${move}" is not in ${spec.name}'s guide vocabulary; plain words are used.` };
}

const sentence = (s: string) => {
  const t = s.trim().replace(/\s+/g, " ");
  if (!t) return "";
  const c = t[0]!.toUpperCase() + t.slice(1);
  return /[.!?]$/.test(c) ? c : `${c}.`;
};
const keepOf = (u: UsedInput, shot: ShotDescription) => shot.references.find((r) => r.id === u.ref)?.keep ?? ROLE[u.role].keep;
const join = (parts: (string | null | undefined | false)[], sep = " ") => parts.filter(Boolean).join(sep);

/** Subject and action, then the environment when the shot names one. */
const scene = (shot: ShotDescription, body = sentence(`${shot.subject} ${shot.action}`)) =>
  join([body, shot.environment ? sentence(shot.environment) : null]);
const legend = (shot: ShotDescription) => (shot.legend ? sentence(shot.legend) : null);

const range = (b: { start: number; end: number }) => `${b.start}–${b.end} s`;

function tags(spec: ModelSpec, shot: ShotDescription, used: UsedInput[], cam: ComposedCamera): string {
  const guide = used.find((u) => u.input === "referenceVideos" && u.role === "motion" && u.address);
  const lines: string[] = [];
  if (guide) {
    // Runware's reference-videos guide: "Reference only the camera path and pacing of <<<video_1>>>."
    const what = shot.references.find((r) => r.id === guide.ref)?.keep;
    lines.push(`Reference only the ${what ?? "motion, camera path and pacing"} of ${guide.address}.`);
  }
  for (const u of used) {
    if (!u.address || u === guide) continue;
    const ref = shot.references.find((r) => r.id === u.ref);
    if (u.input === "firstFrame") lines.push(`${u.address} is the first frame.`);
    else if (u.input === "lastFrame") lines.push(`${u.address} is the last frame.`);
    else if (guide && ref?.replaces) lines.push(`Replace ${ref.replaces} with ${ROLE[u.role].noun} in ${u.address}; keep ${keepOf(u, shot)}.`);
    else lines.push(`${u.address} defines ${ROLE[u.role].noun}; keep ${keepOf(u, shot)}.`);
  }
  const beats = shot.beats?.length ? shot.beats.map((b) => `${range(b)}: ${sentence(b.text)}`).join("\n") : null;
  const audio = shot.audio ? `Audio: ${sentence(shot.audio)} No subtitles.` : null;
  return join([join([...lines, legend(shot)]), join([scene(shot), cam.text]), beats, audio], "\n\n");
}

function atMentions(spec: ModelSpec, shot: ShotDescription, used: UsedInput[], cam: ComposedCamera): string {
  const bind = used
    .filter((u) => u.address && u.input !== "referenceAudios")
    .map((u) => (u.role === "motion" ? `${u.address} is ${ROLE.motion.noun}: follow its ${keepOf(u, shot)}.` : `${u.address} is ${ROLE[u.role].noun}; keep ${keepOf(u, shot)}.`));
  const audioRef = used.find((u) => u.input === "referenceAudios");
  const audio = shot.audio || audioRef ? join(["Audio:", shot.audio ? sentence(shot.audio) : null, audioRef?.address ? `Sync the motion to ${audioRef.address}.` : null]) : null;
  const beats = shot.beats?.length ? shot.beats.map((b) => `[${b.start}-${b.end}s] ${sentence(b.text)}`).join("\n") : null;
  return join([cam.text, join([...bind, legend(shot)]), scene(shot), beats, audio], "\n\n");
}

function plainWords(spec: ModelSpec, shot: ShotDescription, used: UsedInput[], cam: ComposedCamera): string {
  const motion = used.find((u) => u.role === "motion" && u.address);
  const refs = used
    .filter((u) => u.address && u.input !== "referenceAudios")
    .map((u) => (u === motion ? `${u.address} is the motion reference: follow its ${keepOf(u, shot)}.` : `${u.address} is ${ROLE[u.role].noun}; keep ${keepOf(u, shot)}.`));
  // With a motion reference the guide says to describe the subject, not the move.
  const body = scene(shot, motion ? sentence(`${shot.subject}, moving as in ${motion.address}`) : undefined);
  const hasAudioRef = used.some((u) => u.input === "referenceAudios");
  const sound = shot.audio || hasAudioRef ? join(["Sound:", shot.audio ? sentence(shot.audio) : null, hasAudioRef ? "Follow the reference audio." : null]) : null;
  return join([join([...refs, legend(shot)]), join([body, cam.text]), sound], "\n\n");
}

function paragraph(spec: ModelSpec, shot: ShotDescription, used: UsedInput[], cam: ComposedCamera): string {
  const frames = spec.id.startsWith("flux")
    ? used.map((u) =>
        u.input === "firstFrame" ? "Use this image as the first frame." : u.input === "lastFrame" ? "Use this image as the last frame." : u.input === "keyframes" ? "Use these images as keyframes, in order." : null,
      )
    : [];
  const audio = shot.audio ? `Audio: ${sentence(shot.audio)}` : null;
  return join([...new Set(frames)], " ") + (frames.some(Boolean) ? " " : "") + join([scene(shot), legend(shot), cam.text, audio]);
}

export function writePrompt(spec: ModelSpec, shot: ShotDescription, used: UsedInput[], cam: ComposedCamera): string {
  switch (spec.prompting.addressing.style) {
    case "tags":
      return tags(spec, shot, used, cam);
    case "at-mentions":
      return atMentions(spec, shot, used, cam);
    case "plain-words":
      return spec.prompting.addressing.tokens.length ? plainWords(spec, shot, used, cam) : paragraph(spec, shot, used, cam);
    default:
      return paragraph(spec, shot, used, cam);
  }
}
