import { defineConfig } from "vite";

// `npm run build:embed`: one ES module a host app vendors as a single file.
// It registers <arena-key>, <arena-generate>, <arena-gallery> and <model-arena>
// and exports generateFromGuide. Styles live in each element's shadow root,
// so there is no separate CSS file. Types go to dist/embed/types/ (tsc).
export default defineConfig({
  publicDir: false,
  build: {
    lib: {
      entry: "packages/element/src/embed.ts",
      formats: ["es"],
      fileName: () => "model-arena-embed.js",
    },
    outDir: "dist/embed",
    emptyOutDir: true,
    target: "es2022",
  },
});
