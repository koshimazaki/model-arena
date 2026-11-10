/** Appends one row per paid run to docs/costs.md. */
import { appendFile, readFile } from "node:fs/promises";

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

export async function appendCost(file: string, r: CostRow): Promise<void> {
  const text = await readFile(file, "utf8");
  await appendFile(file, (text.endsWith("\n") ? "" : "\n") + costRow(r));
}
