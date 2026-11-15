import { defineConfig, type Plugin } from "vitest/config";
import { MODEL_SPECS } from "./packages/core/src/specs/index.ts";

/** Emits the spec database as dist/model-specs.json beside the element. */
const specsJson = (): Plugin => ({
  name: "model-specs-json",
  generateBundle() {
    this.emitFile({ type: "asset", fileName: "model-specs.json", source: `${JSON.stringify(MODEL_SPECS, null, 2)}\n` });
  },
});

// `npm run dev` serves index.html (the demo); `npm run build` emits the
// element as one ES module for a script tag.
export default defineConfig({
  plugins: [specsJson()],
  build: {
    lib: {
      entry: "packages/element/src/index.ts",
      formats: ["es"],
      fileName: () => "model-arena.js",
    },
    outDir: "dist",
  },
  test: {
    include: ["tests/**/*.test.ts"],
  },
});
