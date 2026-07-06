import { rm } from "node:fs/promises";

await Promise.all([
  rm("lib", { recursive: true, force: true }),
  rm("tsconfig.tsbuildinfo", { force: true }),
]);
