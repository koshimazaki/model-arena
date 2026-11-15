/** The site manifest, the studio job fields it reads, and the check that every take in a scene was asked the same thing. */

export interface Manifest {
  mediaBase: string;
  models: Record<string, { name: string; air: string; spec: string; studioModel: string }>;
  scenes: {
    id: string;
    title: string;
    /** The one reference image every take was sent, as a path inside the source folder (SITE_SOURCE), or null. */
    reference: string | null;
    takes: Record<string, { id: string; why: string; alternates: string[] }>;
  }[];
}

/** The studio job fields this site reads; everything else in jobs.json is ignored. */
export interface Job {
  id: string;
  model: string;
  status: string;
  prompt: string;
  duration: number;
  resolution: string;
  aspectRatio: string;
  draft?: boolean;
  cameraEnabled?: boolean;
  imageReferences?: string[];
  createdAt: string;
  updatedAt: string;
  costActualUsd?: number;
  costEstimateUsd?: number;
}

export interface MediaFacts {
  width: number;
  height: number;
  fps: number;
  fpsText: string;
  frames: number;
  seconds: number;
  hasAudio: boolean;
  videoCodec: string;
}

export interface TakeFacts {
  scene: string;
  model: string;
  jobId: string;
  prompt: string;
  requested: { duration: number; resolution: string; aspectRatio: string; references: number };
  measured: MediaFacts & { originalBytes: number; webBytes: number; posterAt: number };
  costActualUsd: number | null;
  costEstimateUsd: number | null;
  /** updatedAt minus createdAt: submit to ready as recorded by the studio, polling included. */
  wallClockSeconds: number | null;
  files: { web: string; poster: string; original: string };
}

export interface TakesFile {
  generatedAt: string;
  takes: TakeFacts[];
  references: Record<string, { web: string; original: string; width: number; height: number }>;
}

/** The one job whose id starts with `prefix`; throws on none or several. */
export function findJob(jobs: Job[], prefix: string): Job {
  const hits = jobs.filter((j) => j.id.startsWith(prefix));
  if (hits.length !== 1) throw new Error(`take ${prefix}: ${hits.length ? "matches several jobs" : "no such job in jobs.json"}`);
  return hits[0]!;
}

/** The settings that must match across a scene's takes. */
export function sharedSettings(j: Job) {
  return {
    prompt: j.prompt,
    duration: j.duration,
    resolution: j.resolution,
    aspectRatio: j.aspectRatio,
    draft: j.draft ?? false,
    cameraEnabled: j.cameraEnabled ?? false,
    imageReferences: (j.imageReferences ?? []).join(","),
  };
}

/** Problems that keep a scene off the page: a wrong model, a take not ready, or settings that differ from the first take. */
export function checkScene(jobs: Job[], manifest: Manifest, models: string[]): string[] {
  const out: string[] = [];
  const first = jobs[0] ? sharedSettings(jobs[0]) : undefined;
  jobs.forEach((j, i) => {
    const key = models[i]!;
    const want = manifest.models[key]?.studioModel;
    if (j.model !== want) out.push(`${j.id.slice(0, 8)} ran ${j.model}, the manifest says ${key} (${want ?? "unknown"})`);
    if (j.status !== "Ready") out.push(`${j.id.slice(0, 8)} has status ${j.status}`);
    if (!first) return;
    const s = sharedSettings(j);
    for (const k of Object.keys(first) as (keyof typeof first)[])
      if (s[k] !== first[k]) out.push(`${j.id.slice(0, 8)} differs from ${jobs[0]!.id.slice(0, 8)} in ${k}`);
  });
  return out;
}
