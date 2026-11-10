/** `run-lane --shot`: the lane's prompt, camera parameter and duration from the composer. */
import { readFile } from "node:fs/promises";
import { composeFor, type ComposedPrompt, type ShotDescription } from "../../packages/core/src/compose.ts";
import { composedMarker, parseShot } from "../../packages/core/src/shot.ts";
import { MODEL_SPECS } from "../../packages/core/src/specs/index.ts";

export interface ComposedLane {
  shot: ShotDescription;
  composed: ComposedPrompt;
  marker: ReturnType<typeof composedMarker>;
}

export async function composeFromFile(path: string, modelKey: string): Promise<ComposedLane> {
  let json: unknown;
  try {
    json = JSON.parse(await readFile(path, "utf8"));
  } catch (e) {
    throw new Error(`--shot ${path}: ${(e as Error).message}`, { cause: e });
  }
  const shot = parseShot(json);
  if (!MODEL_SPECS.some((s) => s.id === modelKey))
    throw new Error(`--shot needs a model with a spec (${MODEL_SPECS.map((s) => s.id).join(", ")}); the router lane takes --prompt.`);
  const composed = composeFor(modelKey, shot);
  return { shot, composed, marker: composedMarker(composed) };
}

/** Lines the CLI prints so the reader sees what the composer did. */
export function describeComposed(c: ComposedPrompt): string {
  return [
    `Composer:  prompt written for ${c.name}; camera ${c.camera.mode}${c.camera.value ? ` (${c.camera.field}=${c.camera.value})` : ""}`,
    ...c.used.map((u) => `  uses     ${u.ref} as ${u.field}${u.address ? `, addressed ${u.address}` : ""}`),
    ...c.dropped.map((d) => `  drops    ${d.ref}: ${d.reason}`),
    ...c.notes.map((n) => `  note     ${n}`),
  ].join("\n");
}
