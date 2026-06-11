import { resolve } from "path";
import type { Context } from "koishi";
import type { MCSManagerClient } from "./client";
import type { Config } from "./config";
import {
  createPreviewEntryData,
  createRealPreviewData,
  type VisualizationMockData,
} from "./visualization";
import {
  createDefaultRenderText,
  renderNodeStatusText,
  renderServerListText,
} from "./render";

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
        data: withTextPreviews(await createRealPreviewData(config, client), config),
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
  }, () => {
    const data = createPreviewEntryData(config, client.configured);
    return {
      ...data,
      mock: withTextPreviews(data.mock, config),
    };
  });
}

function withTextPreviews(data: VisualizationMockData, config: Config) {
  const text = createDefaultRenderText(config);
  return {
    ...data,
    textPreviews: {
      "node-status": renderNodeStatusText(config, data.nodes, text),
      "server-list": renderServerListText(config, data.servers, text),
    },
  };
}
