import { resolve } from "path";
import type { Context } from "koishi";
import type { MCSManagerClient } from "./client";
import type { Config } from "./config";
import { createPreviewEntryData, createRealPreviewData } from "./visualization";

interface ConsoleLike {
  addEntry(files: { dev: string; prod: string | string[] }, data?: () => unknown): unknown;
  addListener(event: string, callback: () => unknown): void;
}

interface ConsoleContext extends Context {
  console?: ConsoleLike;
}

export function registerPreviewEntry(ctx: Context, config: Config, client: MCSManagerClient) {
  if (!config.preview.enabled) return;

  const console = (ctx as ConsoleContext).console;
  if (!console) return;

  console.addListener("mcsm-portal/preview-data", async () => {
    if (!client.configured) {
      return {
        ok: false,
        error: "MCSManager endpoint or API key is not configured.",
      };
    }

    try {
      return {
        ok: true,
        data: await createRealPreviewData(config, client),
      };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });

  console.addEntry({
    dev: resolve(__dirname, "../client/index.ts"),
    prod: resolve(__dirname, "../dist"),
  }, () => createPreviewEntryData(config, client.configured));
}
