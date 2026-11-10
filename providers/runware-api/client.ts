/**
 * The Runware REST client, shared by the browser element and the Node CLI.
 * It talks to one host only, takes the key from a getter so the caller
 * decides where it lives (memory, sessionStorage, an env var), and never puts
 * the key in an error, a log line or a returned object.
 */

export const RUNWARE_ENDPOINT = "https://api.runware.ai/v1";

export type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body: string; signal?: AbortSignal }) => Promise<{
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}>;

export interface RunwareError {
  code: string;
  message: string;
  parameter?: string;
  taskUUID?: string;
}

export class RunwareApiError extends Error {
  constructor(public status: number, public errors: RunwareError[]) {
    super(
      errors.length
        ? errors.map((e) => `${e.code}: ${e.message}${e.parameter ? ` (${e.parameter})` : ""}`).join("; ")
        : `Runware API returned HTTP ${status}.`,
    );
    this.name = "RunwareApiError";
  }
}

export interface RunwareResponse {
  data: Record<string, unknown>[];
  errors: RunwareError[];
}

// Printable ASCII, no spaces: the key goes into a header as-is.
const KEY_SHAPE = /^[\x21-\x7e]{8,512}$/;

export class RunwareClient {
  private readonly getKey: () => string | undefined;
  private readonly fetchImpl: FetchLike;

  constructor(opts: { getKey: () => string | undefined; fetch?: FetchLike }) {
    this.getKey = opts.getKey;
    this.fetchImpl = opts.fetch ?? (globalThis.fetch as unknown as FetchLike);
  }

  /** Redacts the key from any text before it is shown. */
  redact(text: string): string {
    const key = this.getKey();
    return key ? text.split(key).join("[key]") : text;
  }

  async post(tasks: Record<string, unknown>[], signal?: AbortSignal): Promise<RunwareResponse> {
    const key = this.getKey();
    if (!key) throw new Error("No Runware API key. Set RUNWARE_API_KEY, or paste it into the key panel.");
    if (!KEY_SHAPE.test(key)) throw new Error("That does not look like a Runware API key.");
    const res = await this.fetchImpl(RUNWARE_ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify(tasks),
      signal,
    });
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      throw new RunwareApiError(res.status, []);
    }
    const obj = (body ?? {}) as { data?: unknown; errors?: unknown };
    const data = Array.isArray(obj.data) ? (obj.data as Record<string, unknown>[]) : [];
    const errors = Array.isArray(obj.errors)
      ? (obj.errors as Record<string, unknown>[]).map((e) => ({
          code: String(e.code ?? "error"),
          message: this.redact(String(e.message ?? "")),
          ...(e.parameter ? { parameter: String(e.parameter) } : {}),
          ...(e.taskUUID ? { taskUUID: String(e.taskUUID) } : {}),
        }))
      : [];
    if (!res.ok && !data.length) throw new RunwareApiError(res.status, errors);
    return { data, errors };
  }

  /** Stores media (data URI, base64 or public URL) and returns its UUID and URL. */
  async upload(media: string, signal?: AbortSignal): Promise<{ mediaUUID: string; mediaURL: string }> {
    const taskUUID = globalThis.crypto.randomUUID();
    const { data, errors } = await this.post([{ taskType: "mediaStorage", taskUUID, operation: "upload", media }], signal);
    const mine = errors.filter((e) => !e.taskUUID || e.taskUUID === taskUUID);
    if (mine.length) throw new RunwareApiError(400, mine);
    const row = data.find((d) => d.taskUUID === taskUUID) ?? data[0];
    if (!row || typeof row.mediaUUID !== "string") throw new Error("mediaStorage upload returned no mediaUUID.");
    return { mediaUUID: row.mediaUUID, mediaURL: String(row.mediaURL ?? "") };
  }

  /** Reads back the stored request for a task; used to learn which model the router chose. */
  async taskDetails(taskUUID: string, signal?: AbortSignal): Promise<Record<string, unknown> | undefined> {
    const { data } = await this.post([{ taskType: "getTaskDetails", taskUUID }], signal);
    return data[0];
  }
}
