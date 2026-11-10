import { describe, expect, it } from "vitest";
import { compose, composeFor, type ShotDescription, type ShotReference } from "../packages/core/src/compose.ts";

const still: ShotReference = { id: "still", kind: "image", role: "first-frame" };
const character: ShotReference = { id: "char", kind: "image", role: "character" };
const guide: ShotReference = { id: "guide", kind: "video", role: "motion" };
const beat: ShotReference = { id: "beat", kind: "audio", role: "soundtrack" };

const shot = (over: Partial<ShotDescription> = {}): ShotDescription => ({
  subject: "A wooden mannequin in a grey studio",
  action: "dances to the beat",
  camera: "push-in",
  references: [still, character, guide, beat],
  audio: "a dry kick drum at 120 bpm",
  duration: 8,
  ...over,
});

const byModel = (s: ShotDescription) => Object.fromEntries(compose(s).map((c) => [c.model, c]));

describe("addressing in each model's syntax", () => {
  const out = byModel(shot());

  it("Kling numbers images across frames then references, with tags", () => {
    expect(out["kling-4"]!.used.map((u) => u.address)).toEqual(["<<<image_1>>>", "<<<image_2>>>", "<<<video_1>>>"]);
    expect(out["kling-4"]!.prompt).toContain("<<<video_1>>> sets the motion");
  });

  it("Seedance uses @Image, @Video and @Audio", () => {
    expect(out["seedance-2.5"]!.used.map((u) => u.address)).toEqual(["@Image1", "@Image2", "@Video1", "@Audio1"]);
    expect(out["seedance-2.5"]!.prompt).toMatch(/Sync the motion to @Audio1\.$/);
  });

  it("MiniMax uses plain words and names the subject, not the move", () => {
    const h3 = out["h3"]!;
    expect(h3.used.map((u) => u.address)).toEqual(["Image 1", "Image 2", "Video 1", null]);
    expect(h3.prompt).toContain("moving as in Video 1");
    expect(h3.prompt).not.toContain("dances to the beat");
    expect(h3.prompt).toMatch(/Sound: .*reference audio/);
  });

  it("LTX and FLUX 3 Video name no inputs", () => {
    for (const id of ["ltx-2.5", "flux-3-video"]) {
      expect(out[id]!.used.every((u) => u.address === null)).toBe(true);
      expect(out[id]!.prompt).not.toMatch(/<<<|@|Image \d|Video \d/);
    }
    expect(out["flux-3-video"]!.prompt).toMatch(/^Use this image as the first frame\./);
  });
});

describe("camera", () => {
  it("LTX gets settings.cameraMovement and keeps the move out of the prompt", () => {
    const ltx = composeFor("ltx-2.5", shot());
    expect(ltx.params["settings.cameraMovement"]).toBe("dolly_in");
    expect(ltx.camera).toMatchObject({ mode: "parameter", value: "dolly_in", text: null });
    expect(ltx.prompt).not.toMatch(/camera|dolly|push/i);
  });

  it("models with a guide video carry the move in the video and in words", () => {
    for (const id of ["kling-4", "seedance-2.5", "h3"]) {
      const c = composeFor(id, shot());
      expect(c.camera.mode).toBe("guide-video");
      expect(c.params["settings.cameraMovement"]).toBeUndefined();
      expect(c.prompt).toContain(c.camera.text!);
    }
  });

  it("without a guide video every other model gets the move in words", () => {
    for (const c of compose(shot({ references: [still] }))) {
      if (c.model === "ltx-2.5") continue;
      expect(c.camera.mode).toBe("prompt");
      expect(c.prompt).toContain(c.camera.text!);
    }
  });

  it("Seedance opens with the camera clause", () => {
    expect(composeFor("seedance-2.5", shot()).prompt.startsWith("Slow dolly-in")).toBe(true);
  });

  it("a move with no LTX parameter value falls back to words, with a note", () => {
    const ltx = composeFor("ltx-2.5", shot({ camera: "orbit" }));
    expect(ltx.camera.mode).toBe("prompt");
    expect(ltx.prompt).toContain("orbits");
    expect(ltx.notes.join(" ")).toMatch(/no value for "orbit"/);
  });

  it("a move outside a model's guide vocabulary uses plain words and says so", () => {
    const h3 = composeFor("h3", shot({ camera: "rack-focus", references: [] }));
    expect(h3.camera.text).toBe("Focus shifts from the foreground to the subject.");
    expect(h3.notes.join(" ")).toMatch(/not in MiniMax H3's guide vocabulary/);
  });
});

describe("inputs used and inputs the model cannot take", () => {
  it("Seedance and H3 take the start frame as an image reference beside reference videos", () => {
    for (const id of ["seedance-2.5", "h3"]) {
      const c = composeFor(id, shot());
      expect(c.used.find((u) => u.ref === "still")).toMatchObject({ input: "referenceImages", convertedFrom: "firstFrame" });
    }
  });

  it("a start frame alone stays a start frame on Seedance", () => {
    expect(composeFor("seedance-2.5", shot({ references: [still] })).used[0]).toMatchObject({ input: "firstFrame", field: "inputs.frameImages" });
  });

  it("LTX keeps the camera parameter and drops audio and the guide video by default", () => {
    const ltx = composeFor("ltx-2.5", shot());
    expect(ltx.used.map((u) => u.ref)).toEqual(["still"]);
    expect(ltx.dropped.map((d) => d.ref).sort()).toEqual(["beat", "char", "guide"]);
    expect(ltx.dropped.find((d) => d.ref === "guide")!.reason).toMatch(/takes no reference video/);
    expect(ltx.cannotTake).toEqual(expect.arrayContaining(["referenceVideos", "referenceAudios", "keyframes"]));
  });

  it("LTX audio mode, when inputs are preferred: one reference image, no duration, the move in words", () => {
    const ltx = composeFor("ltx-2.5", shot(), { prefer: "inputs" });
    expect(ltx.used.map((u) => [u.ref, u.input])).toEqual([
      ["still", "referenceImages"],
      ["beat", "audioToVideo"],
    ]);
    expect(ltx.params).toEqual({});
    expect(ltx.camera.mode).toBe("prompt");
    expect(ltx.notes.join(" ")).toMatch(/runs as long as the audio/);
  });

  it("H3 refuses reference audio with no visual reference beside it", () => {
    const h3 = composeFor("h3", shot({ references: [beat] }));
    expect(h3.used).toEqual([]);
    expect(h3.dropped[0]!.reason).toMatch(/needs a reference image or a reference video/);
  });

  it("Kling Flash drops a last frame; Kling 4.0 keeps it", () => {
    const refs: ShotReference[] = [still, { id: "end", kind: "image", role: "last-frame" }];
    expect(composeFor("kling-4-flash", shot({ references: refs })).dropped.map((d) => d.ref)).toEqual(["end"]);
    expect(composeFor("kling-4", shot({ references: refs })).used.map((u) => u.input)).toEqual(["firstFrame", "lastFrame"]);
  });

  it("FLUX 3 Video takes keyframes but no references", () => {
    const keys: ShotReference[] = [1, 2, 3].map((n) => ({ id: `k${n}`, kind: "image", role: "keyframe" }));
    const flux = composeFor("flux-3-video", shot({ references: [...keys, character] }));
    expect(flux.used.map((u) => u.input)).toEqual(["keyframes", "keyframes", "keyframes"]);
    expect(flux.dropped.map((d) => d.ref)).toEqual(["char"]);
    expect(flux.prompt).toMatch(/^Use these images as keyframes, in order\./);
  });

  it("every model reports what it cannot take from the spec database", () => {
    const out = byModel(shot());
    expect(out["kling-4"]!.cannotTake).toEqual(["referenceAudios", "audioToVideo"]);
    expect(out["flux-3-video"]!.cannotTake).toContain("referenceVideos");
    expect(out["seedance-2.5"]!.cannotTake).toEqual(["keyframes", "elements"]);
  });
});

describe("duration", () => {
  it("clamps to a range and snaps to a list, with a note", () => {
    const h3 = composeFor("h3", shot({ duration: 20 }));
    expect(h3.duration).toEqual({ requested: 20, sent: 15 });
    expect(h3.notes.join(" ")).toMatch(/15 s is sent/);
    expect(composeFor("ltx-2.5", shot({ duration: 9 })).params.duration).toBe(8);
    expect(composeFor("kling-4", shot({ duration: 8 })).notes).toEqual([]);
  });
});
