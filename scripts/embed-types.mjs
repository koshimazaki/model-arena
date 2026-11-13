// Writes dist/embed/model-arena-embed.d.ts: one entry that re-exports the
// declarations tsc emitted under dist/embed/types/.
import { writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const out = resolve(dirname(fileURLToPath(import.meta.url)), "../dist/embed/model-arena-embed.d.ts");
writeFileSync(out, 'export * from "./types/packages/element/src/embed.js";\n');
console.log(`wrote ${out}`);
