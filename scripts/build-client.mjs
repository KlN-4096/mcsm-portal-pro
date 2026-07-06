import { rename } from "node:fs/promises";
import { build } from "esbuild";

await build({
  entryPoints: ["client/index.ts"],
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2020",
  outfile: "dist/index.js",
  external: ["vue", "@koishijs/client"],
  loader: {
    ".ttf": "dataurl",
    ".TTF": "dataurl",
    ".otf": "dataurl",
    ".OTF": "dataurl",
    ".png": "dataurl",
    ".PNG": "dataurl",
  },
});

await rename("dist/index.css", "dist/style.css");
