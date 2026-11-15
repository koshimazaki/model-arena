/**
 * A record set: several records shown as tabs in one element, e.g. the blog
 * post's "Camera", "Audio sync" and "Character" tests. Each tab points at a
 * record file (resolved against the set's URL) or holds the record inline.
 */
import { parseRecord, RecordError, type ArenaRecord } from "./record.ts";

export interface RecordSetTab {
  id: string;
  label: string;
  /** A record URL, relative to the set. */
  src?: string;
  record?: ArenaRecord;
}

export interface RecordSet {
  schemaVersion: 1;
  id: string;
  title: string;
  tabs: RecordSetTab[];
}

const SLUG = /^[a-z0-9][a-z0-9-]{0,63}$/;
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** True when a fetched JSON document is a set rather than a single record. */
export const isRecordSet = (v: unknown): boolean => isObj(v) && Array.isArray(v.tabs);

/** Validates an untrusted record set; inline records are parsed too. */
export function parseRecordSet(v: unknown): RecordSet {
  if (!isObj(v)) throw new RecordError("set", "must be an object");
  if (v.schemaVersion !== 1) throw new RecordError("schemaVersion", "must be 1");
  if (typeof v.id !== "string" || !SLUG.test(v.id)) throw new RecordError("id", "must be a slug");
  if (typeof v.title !== "string" || v.title.length < 1 || v.title.length > 200) throw new RecordError("title", "must be 1-200 characters");
  if (!Array.isArray(v.tabs) || v.tabs.length < 1 || v.tabs.length > 8) throw new RecordError("tabs", "must hold 1-8 tabs");
  const ids = new Set<string>();
  v.tabs.forEach((t, i) => {
    const p = `tabs[${i}]`;
    if (!isObj(t)) throw new RecordError(p, "must be an object");
    if (typeof t.id !== "string" || !SLUG.test(t.id)) throw new RecordError(`${p}.id`, "must be a slug");
    if (ids.has(t.id)) throw new RecordError(`${p}.id`, "tab ids must be distinct");
    ids.add(t.id);
    if (typeof t.label !== "string" || t.label.length < 1 || t.label.length > 40) throw new RecordError(`${p}.label`, "must be 1-40 characters");
    if (t.record !== undefined) parseRecord(t.record);
    else if (typeof t.src !== "string" || t.src.length < 1 || t.src.length > 2048) throw new RecordError(`${p}.src`, "must be a record URL, or give an inline record");
  });
  return v as unknown as RecordSet;
}
