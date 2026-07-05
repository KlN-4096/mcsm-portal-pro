import { resolveNodeImageTitle, type Config } from "./config";
import type { MinecraftInstance, NodeStatus } from "./types";
import type { VisualizationLayoutText } from "./visualization/layouts";

export interface RenderText {
  noNodes: string;
  noServers: string;
  nodeSummary: (online: number, total: number) => string;
  serverSummary: (total: number) => string;
  nodesOnline: (online: number, total: number) => string;
  serversOnline: (online: number, total: number) => string;
  online: string;
  offline: string;
  cpu: string;
  memory: string;
  address: string;
  status: string;
  node: string;
  players: string;
  playerNames: string;
  type: string;
  version: string;
  motd: string;
  modList: string;
  tags: string;
  instances: string;
  platform: string;
  unknown: string;
  noNodesAvailable: string;
  noServersAvailable: string;
  noAddressConfigured: string;
  defaultMotd: string;
  instanceCounts: (running: number, stopped: number, total: number) => string;
  playerCount: (online: number, max: number | string) => string;
  playerList: (names: string[]) => string;
  mods: (count: number) => string;
  statusLabel: (status: MinecraftInstance["status"]) => string;
}

export function createDefaultRenderText(config: Config): RenderText {
  return {
    noNodes: `${resolveNodeImageTitle(config)}: no MCSManager nodes were returned.`,
    noServers: "No Minecraft server instances were returned by MCSManager.",
    nodeSummary: (online, total) => `Nodes: ${online}/${total} online`,
    serverSummary: (total) => `Minecraft servers: ${total}`,
    nodesOnline: (online, total) => `${online}/${total} nodes online`,
    serversOnline: (online, total) => `${online}/${total} servers online`,
    online: "online",
    offline: "offline",
    cpu: "CPU",
    memory: "Memory",
    address: "Address",
    status: "Status",
    node: "Node",
    players: "Online players",
    playerNames: "Players",
    type: "Type",
    version: "Version",
    motd: "MOTD",
    modList: "Mods",
    tags: "Tags",
    instances: "Instances",
    platform: "Platform",
    unknown: "unknown",
    noNodesAvailable: "No nodes available",
    noServersAvailable: "No servers available",
    noAddressConfigured: "No address configured",
    defaultMotd: "Minecraft Server",
    instanceCounts: (running, stopped, total) =>
      `Instances ${running} running / ${stopped} stopped / ${total} total`,
    playerCount: (online, max) => `${online}/${max} online`,
    playerList: (names) => `Players: ${names.join(", ")}`,
    mods: (count) => `${count} mods`,
    statusLabel: (status) => status,
  };
}

export function createVisualizationLayoutText(
  text: RenderText,
  nodes: NodeStatus[],
  servers: MinecraftInstance[],
): VisualizationLayoutText {
  const onlineNodes = nodes.filter((node) => node.online).length;
  const onlineServers = servers.filter((server) => server.status === "running").length;

  return {
    nodeOnlineSummary: text.nodesOnline(onlineNodes, nodes.length),
    serverOnlineSummary: text.serversOnline(onlineServers, servers.length),
    online: text.online,
    offline: text.offline,
    cpu: text.cpu,
    memory: text.memory,
    instances: text.instances,
    platform: text.platform,
    version: text.version,
    playerNames: text.playerNames,
    unknown: text.unknown,
    noNodesAvailable: text.noNodesAvailable,
    noServersAvailable: text.noServersAvailable,
    noAddressConfigured: text.noAddressConfigured,
    defaultMotd: text.defaultMotd,
    statusLabels: {
      running: text.statusLabel("running"),
      stopped: text.statusLabel("stopped"),
      starting: text.statusLabel("starting"),
      stopping: text.statusLabel("stopping"),
      unknown: text.statusLabel("unknown"),
    },
  };
}
