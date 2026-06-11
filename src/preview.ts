import { resolve } from "path";
import type { Context } from "koishi";
import type { Config } from "./config";
import { createPreviewEntryData } from "./visualization";

interface ConsoleLike {
  addEntry(files: { dev: string; prod: string | string[] }, data?: () => unknown): unknown;
}

interface ConsoleContext extends Context {
  console?: ConsoleLike;
}

export function registerPreviewEntry(ctx: Context, config: Config) {
  if (!config.preview.enabled) return;

  const console = (ctx as ConsoleContext).console;
  if (!console) return;

  console.addEntry({
    dev: resolve(__dirname, "../client/index.ts"),
    prod: resolve(__dirname, "../dist"),
  }, () => createPreviewEntryData(config));
}
