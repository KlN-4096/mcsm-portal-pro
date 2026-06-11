import { h } from "koishi";
import {
  resolveNodeImageTitle,
  resolveServerImageTitle,
  type Config,
} from "./config";
import type { MinecraftInstance, NodeStatus, ServerFieldVisibility } from "./types";
import {
  renderNodeStatusVisualization,
  renderServerListVisualization,
  renderVisualizationSvgDataUri,
} from "./visualization/renderer";
import { resolveGameType } from "./minecraft-server";

export interface RenderText {
  noNodes: string;
  noServers: string;
  nodeSummary: (online: number, total: number) => string;
  serverSummary: (total: number) => string;
  online: string;
  offline: string;
  cpu: string;
  memory: string;
  address: string;
  status: string;
  node: string;
  players: string;
  type: string;
  version: string;
  motd: string;
  modList: string;
  tags: string;
  unknown: string;
  instanceCounts: (running: number, stopped: number, total: number) => string;
  playerCount: (online: number, max: number | string) => string;
  mods: (count: number) => string;
  statusLabel: (status: MinecraftInstance["status"]) => string;
}

export function createDefaultRenderText(config: Config): RenderText {
  return {
    noNodes: `${resolveNodeImageTitle(config)}: no MCSManager nodes were returned.`,
    noServers: "No Minecraft server instances were returned by MCSManager.",
    nodeSummary: (online, total) => `Nodes: ${online}/${total} online`,
    serverSummary: (total) => `Minecraft servers: ${total}`,
    online: "online",
    offline: "offline",
    cpu: "CPU",
    memory: "Memory",
    address: "Address",
    status: "Status",
    node: "Node",
    players: "Players",
    type: "Type",
    version: "Version",
    motd: "MOTD",
    modList: "Mods",
    tags: "Tags",
    unknown: "unknown",
    instanceCounts: (running, stopped, total) =>
      `Instances ${running} running / ${stopped} stopped / ${total} total`,
    playerCount: (online, max) => `${online}/${max} online`,
    mods: (count) => `${count} mods`,
    statusLabel: (status) => status,
  };
}

export function renderNodeStatus(config: Config, nodes: NodeStatus[], text: RenderText) {
  if (!nodes.length) return text.noNodes;
  if (config.output.mode === "image") {
    return h.image(renderVisualizationSvgDataUri(renderNodeStatusVisualization(config, nodes)));
  }
  return renderNodeStatusText(config, nodes, text);
}

export function renderServerList(config: Config, servers: MinecraftInstance[], text: RenderText) {
  if (!servers.length) return text.noServers;
  if (config.output.mode === "image") {
    return h.image(renderVisualizationSvgDataUri(renderServerListVisualization(config, servers)));
  }
  return renderServerListText(config, servers, text);
}

export function renderNodeStatusText(config: Config, nodes: NodeStatus[], text: RenderText) {
  if (!nodes.length) return text.noNodes;

  const separator = config.output.text.showSeparators ? "\n\n" : "\n";
  const onlineCount = nodes.filter((node) => node.online).length;
  const output: string[] = [];

  if (config.output.text.showHeader) {
    output.push(`${resolveNodeImageTitle(config)}\n${text.nodeSummary(onlineCount, nodes.length)}`);
  }

  output.push(...nodes.map((node) => renderNode(node, config, text)));
  return output.join(separator);
}

export function renderServerListText(config: Config, servers: MinecraftInstance[], text: RenderText) {
  const { fields } = config;
  if (!servers.length) return text.noServers;

  const separator = config.output.text.showSeparators ? "\n\n" : "\n";
  const output: string[] = [];

  if (config.output.text.showHeader) {
    output.push(`${resolveServerImageTitle(config)}\n${text.serverSummary(servers.length)}`);
  }

  output.push(...servers.map((server) => renderServer(server, fields, config, text)));
  return output.join(separator);
}

function renderNode(node: NodeStatus, config: Config, text: RenderText) {
  const status = node.online ? text.online : text.offline;
  if (config.output.text.style === "compact") {
    const parts = [
      status,
      node.address,
      formatUsage(text.cpu, node.cpuUsage, "%"),
      formatBytesUsage(text.memory, node.memoryUsed, node.memoryTotal),
      formatInstanceCounts(node, text),
    ].filter(Boolean);
    return `- ${node.name}: ${parts.join(" | ")}`;
  }

  const lines = [
    `- ${node.name} (${status})`,
    formatField(text.address, node.address),
    formatField(text.cpu, formatNumber(node.cpuUsage, "%")),
    formatField(text.memory, formatBytesPair(node.memoryUsed, node.memoryTotal)),
    formatInstanceCounts(node, text),
    formatField(text.version, node.version),
  ].filter(Boolean);
  return lines.join("\n  ");
}

function renderServer(server: MinecraftInstance, fields: ServerFieldVisibility, config: Config, text: RenderText) {
  if (config.output.text.style === "compact") {
    const parts = [text.statusLabel(server.status)];
    if (fields.node && server.nodeName) parts.push(server.nodeName);
    if (fields.address && server.address) parts.push(server.address);
    if (fields.onlineCount && server.onlinePlayers !== undefined) {
      parts.push(text.playerCount(server.onlinePlayers, server.maxPlayers ?? "?"));
    }
    const gameType = resolveGameType(server);
    if (gameType) parts.push(gameType);
    if (fields.version && server.version) parts.push(server.version);
    if (fields.modList && server.modList.length) parts.push(text.mods(server.modList.length));
    return `- ${server.name}: ${parts.join(" | ")}`;
  }

  const lines = [
    `- ${server.name}`,
    fields.status ? formatField(text.status, text.statusLabel(server.status)) : undefined,
    fields.node ? formatField(text.node, server.nodeName) : undefined,
    fields.address ? formatField(text.address, server.address) : undefined,
    fields.onlineCount && server.onlinePlayers !== undefined
      ? formatField(text.players, text.playerCount(server.onlinePlayers, server.maxPlayers ?? "?"))
      : undefined,
    formatField(text.type, resolveGameType(server)),
    fields.version ? formatField(text.version, server.version) : undefined,
    fields.motd ? formatField(text.motd, server.motd) : undefined,
    fields.modList && server.modList.length ? formatField(text.modList, text.mods(server.modList.length)) : undefined,
    server.tags.length ? formatField(text.tags, server.tags.join(", ")) : undefined,
  ].filter(Boolean);
  return lines.join("\n  ");
}

function formatUsage(label: string, value?: number, suffix = "") {
  if (value === undefined) return;
  return `${label} ${value.toFixed(1)}${suffix}`;
}

function formatBytesUsage(label: string, used?: number, total?: number) {
  if (used === undefined || total === undefined) return;
  return `${label} ${formatBytes(used)}/${formatBytes(total)}`;
}

function formatBytesPair(used?: number, total?: number) {
  if (used === undefined || total === undefined) return;
  return `${formatBytes(used)} / ${formatBytes(total)}`;
}

function formatBytes(value: number) {
  const units = ["B", "KiB", "MiB", "GiB", "TiB"];
  let current = value;
  let unit = 0;
  while (current >= 1024 && unit < units.length - 1) {
    current /= 1024;
    unit += 1;
  }
  return `${current.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
}

function formatInstanceCounts(node: NodeStatus, text: RenderText) {
  if (node.instanceTotal === undefined) return;
  const running = node.instanceRunning ?? 0;
  const stopped = node.instanceStopped ?? 0;
  return text.instanceCounts(running, stopped, node.instanceTotal);
}

function formatField(label: string, value?: string) {
  if (!value) return;
  return `${label}: ${value}`;
}

function formatNumber(value?: number, suffix = "") {
  if (value === undefined) return;
  return `${value.toFixed(1)}${suffix}`;
}
