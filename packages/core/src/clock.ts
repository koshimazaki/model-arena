/**
 * One clock for every lane, lifted from the camera-director Arena playback
 * hook and made framework-free. The first registered clip is the master; the
 * others are pulled back onto it whenever they drift more than `maxDrift`.
 * `solo` plays one clip on its own: the shared loop stops and the rest pause.
 * A generation counter cancels any play() that resolves after a newer action.
 */

/** The slice of HTMLVideoElement the clock uses, so tests can fake it. */
export interface ClockMedia {
  currentTime: number;
  readonly duration: number;
  readonly readyState: number;
  readonly ended: boolean;
  readonly error: unknown;
  play(): Promise<void>;
  pause(): void;
  addEventListener(type: "pause", fn: () => void, opts?: { once?: boolean }): void;
}

export interface ClockState {
  playing: boolean;
  soloing: string | undefined;
  time: number;
  duration: number;
  error: string;
}

export interface ClockOptions {
  /** Largest allowed offset from the master, in seconds. Default half a frame at 24 fps. */
  maxDrift?: number;
  /** Minimum milliseconds between state publications while playing. */
  publishEvery?: number;
  raf?: (fn: (now: number) => void) => number;
  caf?: (id: number) => void;
}

const END_SLACK = 0.025;

export class SharedClock {
  private media = new Map<string, ClockMedia>();
  private generation = 0;
  private frame: number | undefined;
  private listeners = new Set<(s: ClockState) => void>();
  private readonly maxDrift: number;
  private readonly publishEvery: number;
  private readonly raf: (fn: (now: number) => void) => number;
  private readonly caf: (id: number) => void;
  state: ClockState = { playing: false, soloing: undefined, time: 0, duration: 0, error: "" };

  constructor(opts: ClockOptions = {}) {
    this.maxDrift = opts.maxDrift ?? 1 / 48;
    this.publishEvery = opts.publishEvery ?? 100;
    this.raf = opts.raf ?? ((fn) => requestAnimationFrame(fn));
    this.caf = opts.caf ?? ((id) => cancelAnimationFrame(id));
  }

  subscribe(fn: (s: ClockState) => void): () => void {
    this.listeners.add(fn);
    fn(this.state);
    return () => this.listeners.delete(fn);
  }

  private set(patch: Partial<ClockState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((fn) => fn(this.state));
  }

  add(id: string, m: ClockMedia) {
    this.media.set(id, m);
    this.loaded();
  }

  remove(id: string) {
    this.media.get(id)?.pause();
    this.media.delete(id);
    this.loaded();
  }

  /** Call on `loadedmetadata`: the shared length is the shortest clip. */
  loaded() {
    const times = [...this.media.values()]
      .map((m) => m.duration)
      .filter((n) => Number.isFinite(n) && n > 0);
    this.set({ duration: times.length ? Math.min(...times) : 0 });
  }

  pause() {
    this.generation++;
    this.stopLoop();
    this.media.forEach((m) => m.pause());
    this.set({ playing: false, soloing: undefined });
  }

  seek(t: number) {
    this.pause();
    const time = Math.max(0, Math.min(t, this.state.duration || t));
    this.media.forEach((m) => {
      if (m.readyState >= 1) m.currentTime = Math.min(time, m.duration);
    });
    this.set({ time });
  }

  async play(): Promise<void> {
    if (this.state.playing) return this.pause();
    if (this.state.soloing) this.pause();
    const attempt = ++this.generation;
    this.set({ error: "" });
    const list = [...this.media.values()];
    if (!list.length || list.some((m) => m.readyState < 2 || m.error)) {
      this.set({ error: "Wait for every video to load, or replace the unavailable clip." });
      return;
    }
    const { time, duration } = this.state;
    const start = time >= duration - 0.04 ? 0 : time;
    list.forEach((m) => (m.currentTime = start));
    try {
      await Promise.all(list.map((m) => m.play()));
      if (attempt !== this.generation) return void list.forEach((m) => m.pause());
      this.set({ playing: true });
      this.startLoop();
    } catch {
      if (attempt !== this.generation) return;
      this.pause();
      this.set({ error: "Playback was interrupted. Press Play to try again." });
    }
  }

  async solo(id: string): Promise<void> {
    const m = this.media.get(id);
    if (!m) return;
    if (this.state.soloing === id) return this.pause();
    this.pause();
    const attempt = this.generation;
    this.set({ error: "" });
    if (m.readyState < 2 || m.error) {
      this.set({ error: "Wait for this video to load, or replace the clip." });
      return;
    }
    if (m.ended || m.currentTime >= m.duration - 0.04) m.currentTime = 0;
    try {
      await m.play();
      if (attempt !== this.generation) return m.pause();
      this.set({ soloing: id });
      m.addEventListener("pause", () => this.state.soloing === id && this.set({ soloing: undefined }), {
        once: true,
      });
      this.startSoloLoop(id, m);
    } catch {
      if (attempt === this.generation) this.set({ error: "Playback was interrupted. Press Play to try again." });
    }
  }

  /** Pause everything; call on page hide or element disconnect. */
  hide() {
    this.pause();
  }

  private stopLoop() {
    if (this.frame !== undefined) this.caf(this.frame);
    this.frame = undefined;
  }

  /** One frame of the sync loop; public so tests can drive it. */
  tick(now: number): boolean {
    const list = [...this.media.values()];
    const master = list[0];
    const { duration } = this.state;
    if (!master || master.ended || master.currentTime >= duration - END_SLACK) {
      list.forEach((m) => m.pause());
      this.stopLoop();
      this.set({ playing: false, time: duration });
      return false;
    }
    for (const m of list.slice(1))
      if (Math.abs(m.currentTime - master.currentTime) > this.maxDrift) m.currentTime = master.currentTime;
    if (now - this.published >= this.publishEvery) {
      this.published = now;
      this.set({ time: master.currentTime });
    }
    return true;
  }
  private published = -Infinity;

  private startLoop() {
    this.stopLoop();
    this.published = -Infinity;
    const loop = (now: number) => {
      if (this.tick(now)) this.frame = this.raf(loop);
    };
    this.frame = this.raf(loop);
  }

  private startSoloLoop(id: string, m: ClockMedia) {
    this.stopLoop();
    const loop = () => {
      if (this.state.soloing !== id) return;
      this.set({ time: m.currentTime });
      this.frame = this.raf(loop);
    };
    this.frame = this.raf(loop);
  }
}
