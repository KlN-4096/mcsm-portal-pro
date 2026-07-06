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
  vite?: unknown;
}

type ConsoleContext = Context & { console: ConsoleLike };
type ContextWithBaseDir = Context & { baseDir?: string };

const PREVIEW_DATA_EVENT = "mcsm-portal-pro/preview-data";
const PREVIEW_CLIENT_LOADED_EVENT = "mcsm-portal-pro/preview-client-loaded";

export function registerPreviewEntry(ctx: Context, config: Config, client: MCSManagerClient) {
  const logger = ctx.logger("mcsm-portal-pro");
  if (!config.preview.enabled) {
    logger.info("[preview] disabled by config");
    return;
  }

  const devEntry = resolve(__dirname, "../client/index.ts").replace(/\\/g, "/");
  const prodEntry = resolve(__dirname, "../dist").replace(/\\/g, "/");
  logger.info("[preview] waiting for console service");

  ctx.inject(["console"], (ctx) => {
    const console = (ctx as ConsoleContext).console;
    logger.info("[preview] console service injected");
    const viteAllow = allowPreviewSourceInConsoleVite(ctx, console, resolve(__dirname, ".."));
    logger.info(
      "[preview] vite fs allow updated active=%s allow=%o",
      Boolean(console.vite),
      viteAllow,
    );

    console.addListener(PREVIEW_CLIENT_LOADED_EVENT, () => {
      logger.info("[preview] client extension loaded");
      return { ok: true };
    });

    console.addListener(PREVIEW_DATA_EVENT, async () => {
      logger.info("[preview] real data requested");
      if (!client.configured) {
        logger.info("[preview] real data rejected: client not configured");
        return {
          ok: false,
          error: "MCSManager endpoint or API key is not configured.",
        };
      }

      try {
        const data = withTextPreviews(await createRealPreviewData(config, client), config);
        logger.info("[preview] real data loaded");
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

    const entry = console.addEntry({
      dev: devEntry,
      prod: prodEntry,
    }, () => {
      logger.info("[preview] entry data requested");
      const data = createPreviewEntryData(config, client.configured);
      return {
        ...data,
        mock: withTextPreviews(data.mock, config),
      };
    });
    logger.info(
      "[preview] addEntry registered id=%s dev=%s prod=%s configured=%s",
      entry.id,
      devEntry,
      prodEntry,
      client.configured,
    );
  });
}

function allowPreviewSourceInConsoleVite(ctx: Context, console: ConsoleLike, root: string) {
  const fs = console.config?.dev?.fs;
  const baseDir = (ctx as ContextWithBaseDir).baseDir;
  if (!fs || !baseDir) return fs?.allow;

  const allow = fs.allow?.map(normalizePath) ?? [normalizePath(baseDir)];
  const sourceRoot = normalizePath(root);
  if (!allow.includes(sourceRoot)) allow.push(sourceRoot);
  fs.allow = allow;
  return allow;
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
