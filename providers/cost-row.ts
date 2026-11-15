/**
 * One row of docs/costs.md, as pure data and text, so the Node CLI and the
 * browser generate flow describe a paid run the same way. Appending the row to
 * the file is the CLI's job (scripts/lib/costs.ts); the browser hands it back.
 */

export interface CostRow {
  date: string;
  model: string;
  modelRan: string | null;
  taskUUID: string;
  duration: string;
  resolution: string;
  inputs: string;
  estimateUsd: number | null;
  costUsd: number | null;
  seconds: number | null;
  output: string;
  status: string;
}

// Pipes and newlines would break the table.
const cell = (v: unknown) => String(v ?? "").replace(/[|\r\n]+/g, " ").trim() || "-";
const usd = (n: number | null) => (n === null ? "-" : `$${n.toFixed(4)}`);

export function costRow(r: CostRow): string {
  return `| ${[
    r.date,
    r.model,
    r.modelRan ?? "unknown",
    r.taskUUID,
    r.duration,
    r.resolution,
    r.inputs,
    usd(r.estimateUsd),
    usd(r.costUsd),
    r.seconds === null ? "-" : r.seconds.toFixed(1),
    r.output,
    r.status,
  ]
    .map(cell)
    .join(" | ")} |\n`;
}

/** The resolution cell: the `resolution` field, or width×height (LTX). */
export const resolutionCell = (task: Record<string, unknown>) =>
  String(task.resolution ?? `${task.width ?? ""}x${task.height ?? ""}`);
