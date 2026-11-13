/** Appends one row per paid run to docs/costs.md. The row format lives in providers/cost-row.ts. */
import { appendFile, readFile } from "node:fs/promises";
import { costRow, type CostRow } from "../../providers/cost-row.ts";

export { costRow, type CostRow } from "../../providers/cost-row.ts";

export async function appendCost(file: string, r: CostRow): Promise<void> {
  const text = await readFile(file, "utf8");
  await appendFile(file, (text.endsWith("\n") ? "" : "\n") + costRow(r));
}
