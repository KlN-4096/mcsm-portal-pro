/** @jsxImportSource react */

import { h, type Context } from "koishi";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  DEFAULT_COPYRIGHT_TEXT,
  resolveNodeImageTitle,
  resolvePortalTitle,
  resolveServerImageTitle,
  type Config,
} from "../config";
import type { MinecraftInstance, NodeStatus } from "../types";
import {
  createDefaultRenderText,
  createVisualizationLayoutText,
  type RenderText,
} from "../render-text";
import { codeAuthoredLayouts, type CodeAuthoredLayoutDefinition, withImageWidth } from "../visualization";
import { PLUGIN_VERSION } from "../version";
import { NodeStatusLayout, ServerListLayout, type VisualizationLayoutData } from "./layouts";
import { createVisualizationCss } from "./styles";
import { resolveBackgroundTextureChoice } from "./styles";

export interface VisualizationRenderResult {
  layout: CodeAuthoredLayoutDefinition;
  data: VisualizationLayoutData;
  html: string;
  width: number;
  height: number;
}

export function renderNodeStatusVisualization(
  config: Config,
  nodes: NodeStatus[],
  text: RenderText = createDefaultRenderText(config),
) {
  const layout = getLayout("node-status", config.image.width);
  return renderVisualization(layout, createVisualizationData(config, nodes, [], text));
}

export function renderServerListVisualization(
  config: Config,
  servers: MinecraftInstance[],
  text: RenderText = createDefaultRenderText(config),
) {
  const layout = getLayout("server-list", config.image.width);
  return renderVisualization(layout, createVisualizationData(config, [], servers, text));
}

export function renderVisualizationSvgDataUri(result: VisualizationRenderResult) {
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${result.width}" height="${result.height}" viewBox="0 0 ${result.width} ${result.height}">`,
    "<foreignObject width=\"100%\" height=\"100%\">",
    `<div xmlns="http://www.w3.org/1999/xhtml"><style>${createVisualizationCss()}</style>${result.html}</div>`,
    "</foreignObject>",
    "</svg>",
  ].join("");

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

interface PuppeteerLike {
  page(): Promise<{
    setViewport(options: {
      width: number;
      height: number;
      deviceScaleFactor?: number;
    }): Promise<void>;
    setContent(content: string, options?: { waitUntil?: string }): Promise<void>;
    evaluate<T>(callback: (() => T | Promise<T>) | string): Promise<T>;
    screenshot(options: {
      clip: { x: number; y: number; width: number; height: number };
      type?: "png";
    }): Promise<Buffer>;
    close(): Promise<void>;
  }>;
}

export async function renderVisualizationImage(
  ctx: Context,
  config: Config,
  result: VisualizationRenderResult,
) {
  const puppeteer = (ctx as Context & { puppeteer?: PuppeteerLike }).puppeteer;
  if (!config.image.puppeteer || !puppeteer) {
    return h.image(renderVisualizationSvgDataUri(result));
  }

  const page = await puppeteer.page();
  const renderScale = normalizeRenderScale(config.image.renderScale);
  try {
    await page.setViewport({
      width: result.width,
      height: result.height,
      deviceScaleFactor: renderScale,
    });
    await page.setContent(createVisualizationHtml(result), {
      waitUntil: "domcontentloaded",
    });
    await page.evaluate(WAIT_FOR_PREVIEW_ASSETS_SCRIPT);
    const renderedHeight = normalizeRenderedHeight(
      result.height,
      await page.evaluate<number>(MEASURE_IMAGE_HEIGHT_SCRIPT),
    );
    if (renderedHeight !== result.height) {
      await page.setViewport({
        width: result.width,
        height: renderedHeight,
        deviceScaleFactor: renderScale,
      });
    }
    const buffer = await page.screenshot({
      type: "png",
      clip: {
        x: 0,
        y: 0,
        width: result.width,
        height: renderedHeight,
      },
    });
    return h.image(buffer, "image/png");
  } finally {
    await page.close();
  }
}

function normalizeRenderScale(value: number) {
  return Number.isFinite(value) ? Math.min(4, Math.max(1, value)) : 1;
}

function normalizeRenderedHeight(estimatedHeight: number, renderedHeight: number) {
  if (!Number.isFinite(renderedHeight) || renderedHeight <= 0) {
    return estimatedHeight;
  }
  return Math.max(estimatedHeight, Math.ceil(renderedHeight));
}

const WAIT_FOR_PREVIEW_ASSETS_SCRIPT = `(() => {
  const timeout = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  return Promise.resolve()
    .then(() => Promise.race([
      document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve(),
      timeout(1500),
    ]))
    .then(() => Promise.race([
      Promise.all(Array.from(document.images).map((image) => {
        if (image.complete) return true;
        return new Promise((resolve) => {
          image.onload = () => resolve(true);
          image.onerror = () => resolve(false);
        });
      })),
      timeout(2500),
    ]));
})()`;

const MEASURE_IMAGE_HEIGHT_SCRIPT = `(() => {
  const root = document.querySelector(".mcsm-image-base");
  const rectHeight = root ? root.getBoundingClientRect().height : 0;
  const scrollHeight = root ? root.scrollHeight : 0;
  return Math.max(
    rectHeight,
    scrollHeight,
    document.body ? document.body.scrollHeight : 0,
    document.documentElement ? document.documentElement.scrollHeight : 0
  );
})()`;

function createVisualizationHtml(result: VisualizationRenderResult) {
  return [
    "<!doctype html>",
    "<html>",
    "<head>",
    "<meta charset=\"utf-8\">",
    "<style>",
    "html,body{margin:0;padding:0;background:transparent;}",
    createVisualizationCss(),
    "</style>",
    "</head>",
    "<body>",
    result.html,
    "</body>",
    "</html>",
  ].join("");
}

export function createVisualizationData(
  config: Config,
  nodes: NodeStatus[],
  servers: MinecraftInstance[],
  text: RenderText = createDefaultRenderText(config),
): VisualizationLayoutData {
  const backgroundTexture = resolveBackgroundTextureChoice(
    config.image.backgroundTexture,
  );
  return {
    portalName: resolvePortalTitle(config),
    copyright: DEFAULT_COPYRIGHT_TEXT,
    pluginVersion: PLUGIN_VERSION,
    nodeTitle: resolveNodeImageTitle(config),
    serverTitle: resolveServerImageTitle(config),
    showGeneratedAt: config.image.showGeneratedAt,
    generatedAt: config.image.showGeneratedAt ? new Date().toISOString() : undefined,
    backgroundTexture: backgroundTexture.name || undefined,
    backgroundTile: backgroundTexture.dataUri,
    text: createVisualizationLayoutText(text, nodes, servers),
    nodes,
    servers,
  };
}

function renderVisualization(
  layout: CodeAuthoredLayoutDefinition,
  data: VisualizationLayoutData,
): VisualizationRenderResult {
  const component = layout.surface === "node-status" ? NodeStatusLayout : ServerListLayout;
  const html = renderToStaticMarkup(createElement(component, { layout, data }));
  return {
    layout,
    data,
    html,
    width: layout.previewWidth,
    height: estimateHeight(layout, data),
  };
}

function getLayout(surface: CodeAuthoredLayoutDefinition["surface"], width?: number) {
  const layout = codeAuthoredLayouts.find((item) => item.surface === surface);
  if (!layout) throw new Error(`Missing visualization layout for ${surface}.`);
  return withImageWidth(layout, width);
}

function estimateHeight(layout: CodeAuthoredLayoutDefinition, data: VisualizationLayoutData) {
  if (layout.surface === "node-status") {
    if (!data.nodes.length) return 480;
    return 190 + Math.max(data.nodes.length, 1) * 210;
  }
  if (!data.servers.length) return 480;
  return 220 + data.servers.length * 112;
}
