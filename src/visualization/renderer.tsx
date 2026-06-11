/** @jsxImportSource react */

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
import { codeAuthoredLayouts, type CodeAuthoredLayoutDefinition, withImageWidth } from "../visualization";
import { NodeStatusLayout, ServerListLayout, type VisualizationLayoutData } from "./layouts";
import { createVisualizationCss } from "./styles";
import { resolveBackgroundTextureDataUri } from "./styles";

export interface VisualizationRenderResult {
  layout: CodeAuthoredLayoutDefinition;
  data: VisualizationLayoutData;
  html: string;
  width: number;
  height: number;
}

export function renderNodeStatusVisualization(config: Config, nodes: NodeStatus[]) {
  const layout = getLayout("node-status", config.image.width);
  return renderVisualization(layout, createVisualizationData(config, nodes, []));
}

export function renderServerListVisualization(config: Config, servers: MinecraftInstance[]) {
  const layout = getLayout("server-list", config.image.width);
  return renderVisualization(layout, createVisualizationData(config, [], servers));
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

export function createVisualizationData(
  config: Config,
  nodes: NodeStatus[],
  servers: MinecraftInstance[],
): VisualizationLayoutData {
  return {
    portalName: resolvePortalTitle(config),
    copyright: DEFAULT_COPYRIGHT_TEXT,
    nodeTitle: resolveNodeImageTitle(config),
    serverTitle: resolveServerImageTitle(config),
    showGeneratedAt: config.image.showGeneratedAt,
    generatedAt: config.image.showGeneratedAt ? new Date().toISOString() : undefined,
    backgroundTexture: config.image.backgroundTexture || undefined,
    backgroundTile: resolveBackgroundTextureDataUri(config.image.backgroundTexture),
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
    if (!data.nodes.length) return 390;
    return 145 + Math.max(data.nodes.length, 1) * 190;
  }
  if (!data.servers.length) return 430;
  return 170 + data.servers.length * 98;
}
