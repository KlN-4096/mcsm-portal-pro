import { resolve } from "path";
import type { Context } from "koishi";
import type { MCSManagerClient } from "./client";
import type { Config } from "./config";
import {
  createPreviewEntryData,
  createRealPreviewData,
  type VisualizationMockData,
} from "./visualization";
import { createDefaultRenderText } from "./render-text";
import {
  renderNodeStatusText,
  renderServerListText,
} from "./render";

interface ConsoleLike {
  addEntry(files: { dev: string; prod: string | string[] }, data?: () => unknown): { id: string };
  addListener(event: string, callback: () => unknown): void;
  config?: {
    dev?: {
      fs?: {
        allow?: string[] | null;
      };
    };
  };
  vite?: {
    config?: {
      server?: {
        fs?: {
          allow?: string[] | null;
        };
      };
    };
  };
}

type ConsoleContext = Context & { console: ConsoleLike };
type ContextWithBaseDir = Context & { baseDir?: string };

const PREVIEW_DATA_EVENT = "mcsm-portal-pro/preview-data";

export function registerPreviewEntry(ctx: Context, config: Config, client: MCSManagerClient) {
  const logger = ctx.logger("mcsm-portal-pro");
  if (!config.preview.enabled) return;

  const devEntry = resolve(__dirname, "../client/index.ts").replace(/\\/g, "/");
  const prodEntry = resolve(__dirname, "../dist").replace(/\\/g, "/");

  ctx.inject(["console"], (ctx) => {
    const console = (ctx as ConsoleContext).console;
    allowPreviewSourceInConsoleVite(ctx, console, resolve(__dirname, ".."));

    console.addListener(PREVIEW_DATA_EVENT, async () => {
      if (!client.configured) {
        return {
          ok: false,
          error: "MCSManager endpoint or API key is not configured.",
        };
      }

      try {
        const data = withTextPreviews(await createRealPreviewData(config, client), config);
        return {
          ok: true,
          data,
        };
      } catch (error) {
        logger.warn(
          "[preview] real data failed: %s",
          error instanceof Error ? error.message : String(error),
        );
        return {
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    });

    console.addEntry({
      dev: devEntry,
      prod: prodEntry,
    }, () => {
      const data = createPreviewEntryData(config, client.configured);
      return {
        ...data,
        mock: withTextPreviews(data.mock, config),
      };
    });
  });
}

function allowPreviewSourceInConsoleVite(ctx: Context, console: ConsoleLike, root: string) {
  const baseDir = (ctx as ContextWithBaseDir).baseDir;
  if (!baseDir) return;

  const requiredPaths = [baseDir, root];
  const configFs = console.config?.dev?.fs;
  if (configFs) {
    configFs.allow = mergeAllowedPaths(configFs.allow, requiredPaths);
  }
  const viteFs = console.vite?.config?.server?.fs;
  if (viteFs) {
    viteFs.allow = mergeAllowedPaths(viteFs.allow, requiredPaths);
  }
}

function mergeAllowedPaths(allow: string[] | null | undefined, paths: string[]) {
  const merged = allow?.map(normalizePath) ?? [];
  for (const path of paths.map(normalizePath)) {
    if (!merged.includes(path)) merged.push(path);
  }
  return merged;
}

function normalizePath(path: string) {
  return path.replace(/\\/g, "/");
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
