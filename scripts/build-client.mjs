import { rename, rm } from "node:fs/promises";
import { build } from "esbuild";

await rm("dist", { recursive: true, force: true });

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

try {
  await rename("dist/index.css", "dist/style.css");
} catch (error) {
  if (error && error.code === "ENOENT") {
    throw new Error("Client build did not emit dist/index.css.");
  }
  throw error;
}
