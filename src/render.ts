import type { ImageConfig } from "./config";
import type { MinecraftInstance, NodeStatus, ServerFieldVisibility } from "./types";

export interface RenderText {
  noNodes: string;
  noServers: string;
  online: string;
  offline: string;
  cpu: string;
  memory: string;
  instanceCounts: (running: number, stopped: number, total: number) => string;
  playerCount: (online: number, max: number | string) => string;
  mods: (count: number) => string;
}

export function renderNodeStatusPlaceholder(config: ImageConfig, nodes: NodeStatus[], text: RenderText) {
  if (!nodes.length) return text.noNodes;

  return [
    config.title,
    ...nodes.map((node) => {
      const parts = [
        node.online ? text.online : text.offline,
        node.address,
        formatUsage(text.cpu, node.cpuUsage, "%"),
        formatBytesUsage(text.memory, node.memoryUsed, node.memoryTotal),
        formatInstanceCounts(node, text),
      ].filter(Boolean);
      return `${node.name}: ${parts.join(" | ")}`;
    }),
  ].join("\n");
}

export function renderServerListPlaceholder(servers: MinecraftInstance[], fields: ServerFieldVisibility, text: RenderText) {
  if (!servers.length) return text.noServers;

  return servers.map((server) => {
    const parts = [server.name];
    if (fields.status) parts.push(server.status);
    if (fields.node && server.nodeName) parts.push(server.nodeName);
    if (fields.address && server.address) parts.push(server.address);
    if (fields.onlineCount && server.onlinePlayers !== undefined) {
      parts.push(text.playerCount(server.onlinePlayers, server.maxPlayers ?? "?"));
    }
    if (fields.version && server.version) parts.push(server.version);
    if (fields.motd && server.motd) parts.push(server.motd);
    if (fields.modList && server.modList.length) parts.push(text.mods(server.modList.length));
    return parts.join(" - ");
  }).join("\n");
}

function formatUsage(label: string, value?: number, suffix = "") {
  if (value === undefined) return;
  return `${label} ${value.toFixed(1)}${suffix}`;
}

function formatBytesUsage(label: string, used?: number, total?: number) {
  if (used === undefined || total === undefined) return;
  return `${label} ${formatBytes(used)}/${formatBytes(total)}`;
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
