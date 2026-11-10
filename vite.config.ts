import { defineConfig } from "vitest/config";

// `npm run dev` serves index.html (the demo); `npm run build` emits the
// element as one ES module for a script tag.
export default defineConfig({
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
