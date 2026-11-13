import { describe, expect, it } from "vitest";
import { composeFor } from "../packages/core/src/compose.ts";
import { blobEntry, generateFromGuide, reference } from "../providers/runware-api/generate.ts";
import { imageSize, loadImage } from "../providers/runware-api/guide-bundle.ts";
import { previewPrompt } from "../providers/runware-api/guide-plan.ts";
import { planTask } from "../providers/runware-api/task.ts";
import { characterPng, FAKE_KEY, fakeRunware, fastPoll, makeBundle, pngHeader, SHOT } from "./embed-helpers.ts";

const facts = { seconds: 5, hasAudio: true, hasCharacter: true, hasEnvironment: true };
const STATIC = /static|locked|tripod|does not move/i;

describe("camera from the guide video", () => {
  it("kling-4: the guide reference carries motion, camera path and pacing; no camera words", () => {
    const p = previewPrompt(SHOT, "kling-4", facts).composed;
    expect(p.camera).toMatchObject({ move: "guide", mode: "guide-video", text: null });
    expect(p.prompt).toContain("Reference only the motion, camera path and pacing of <<<video_1>>>.");
    expect(p.prompt).not.toMatch(STATIC);
    expect(p.prompt).toMatchSnapshot();
  });

  it("seedance-2.5: opens with a camera clause that follows @Video1, never a static camera", () => {
    const p = previewPrompt(SHOT, "seedance-2.5", facts).composed;
    expect(p.camera).toMatchObject({ move: "guide", mode: "guide-video" });
    expect(p.prompt.startsWith("Camera: follow the camera move of @Video1.")).toBe(true);
    expect(p.prompt).toContain("@Video1 is the motion guide: follow its body motion, timing and camera move.");
    expect(p.prompt).not.toMatch(STATIC);
    expect(p.prompt).toMatchSnapshot();
  });

  it("h3: Video 1 carries the camera move; no camera sentence of its own", () => {
    const p = previewPrompt(SHOT, "h3", facts).composed;
    expect(p.camera).toMatchObject({ move: "guide", mode: "guide-video", text: null });
    expect(p.prompt).toContain("Video 1 is the motion reference: follow its body motion, timing and camera move.");
    expect(p.prompt).not.toMatch(STATIC);
    expect(p.prompt).toMatchSnapshot();
  });

  it("ltx-2.5 sees no guide video, so it gets no camera words and a note", () => {
    const p = previewPrompt(SHOT, "ltx-2.5", { ...facts, hasEnvironment: false }).composed;
    expect(p.prompt).not.toMatch(STATIC);
    expect(p.notes.join(" ")).toContain("No guide video reaches this model");
  });

  it("shot.camera still overrides on Seedance and H3", () => {
    const shot = { ...SHOT, camera: "push-in" as const };
    expect(previewPrompt(shot, "seedance-2.5", facts).composed.prompt).not.toContain("follow the camera move of");
    expect(previewPrompt(shot, "h3", facts).composed.prompt).toMatch(/push-in/i);
    expect(previewPrompt({ ...SHOT, camera: "static" }, "seedance-2.5", facts).composed.prompt).toMatch(/locked-off/);
  });

  it("an explicit camera keeps the old prompts unchanged (the composer snapshots stand)", () => {
    const shot = { subject: "a figure", action: "walks", camera: "static" as const, references: [{ id: "g", kind: "video" as const, role: "motion" as const }], duration: 5 };
    expect(composeFor("seedance-2.5", shot).prompt.startsWith("Static, locked-off camera.")).toBe(true);
  });
});

describe("reference images: image-specific refusals before upload", () => {
  const ref = (w: number, h: number) => ({ name: "sheet.png", contentType: "image/png", ref: "data:image/png;base64,AAAA", info: { width: w, height: h } });
  const guide = { name: "guide.mp4", contentType: "video/mp4", ref: "https://example.com/g.mp4", info: { width: 1280, height: 720, fps: 24, seconds: 5 } };

  it("too small: names the model's minimum and says how to fix an image, with no ffmpeg video command", () => {
    for (const [model, min] of [["kling-4", 300], ["seedance-2.5", 300], ["h3", 256]] as const) {
      const e = (() => {
        try {
          planTask({ model, prompt: "Follow it.", guideVideo: guide, character: ref(200, 200), duration: 5 });
        } catch (x) {
          return (x as Error).message;
        }
        return "";
      })();
      expect(e).toContain(`at least ${min} px on each side; sheet.png is 200×200`);
      expect(e).toContain("Use a larger image");
      expect(e).not.toContain("ffmpeg");
    }
  });

  it("too wide or too big: crop and save advice", () => {
    expect(() => planTask({ model: "kling-4", prompt: "x", guideVideo: guide, environment: ref(3000, 1000), duration: 5 })).toThrow(/Crop it closer to square/);
    const big = { ...ref(1024, 1024), info: { width: 1024, height: 1024, bytes: 40 * 1048576 } };
    expect(() => planTask({ model: "h3", prompt: "xy", guideVideo: guide, environment: big, duration: 5 })).toThrow(/up to 30 MB.*Save it as a JPEG/);
  });

  it("reads PNG, JPEG and WebP sizes; refuses other types and unreadable headers", async () => {
    expect(imageSize(pngHeader(640, 480))).toEqual({ width: 640, height: 480 });
    const webp = new Uint8Array(32);
    webp.set([82, 73, 70, 70, 0, 0, 0, 0, 87, 69, 66, 80, 86, 80, 56, 88]);
    webp.set([0xff, 0x03, 0x00, 0xff, 0x02, 0x00], 24); // VP8X: 1024 × 768
    expect(imageSize(webp)).toEqual({ width: 1024, height: 768 });
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x02, 0xd0, 0x05, 0x00, 0x03, 0, 0, 0]);
    expect(imageSize(jpeg)).toEqual({ width: 1280, height: 720 });
    const gif = new Blob(["GIF89a"], { type: "image/gif" });
    await expect(reference(gif, "character")).rejects.toMatchObject({ code: "refused", message: expect.stringContaining("PNG, JPEG or WebP") });
    const junk = new Blob([new Uint8Array([1, 2, 3, 4])], { type: "image/png" });
    await expect(reference(junk, "environment")).rejects.toMatchObject({ code: "refused", message: expect.stringContaining("could not be read") });
    await expect(loadImage(blobEntry(gif, "a.gif"))).rejects.toThrow(/PNG, JPEG or WebP/);
  });

  it("generateFromGuide refuses a too-small character sheet without any request", async () => {
    const api = fakeRunware();
    const e = await generateFromGuide({ guide: makeBundle(), model: "seedance-2.5", maxPrice: 3, key: FAKE_KEY, confirm: () => true, fetch: api.fetch, poll: fastPoll, references: { character: characterPng(120, 120) } }).catch((x) => x);
    expect(e.code).toBe("refused");
    expect(e.message).toContain("Use a larger image");
    expect(api.calls).toHaveLength(0);
  });
});
