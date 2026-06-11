import type { MinecraftInstance, NodeStatus } from "./types";
import {
  DEFAULT_NODE_IMAGE_TITLE,
  DEFAULT_SERVER_IMAGE_TITLE,
  PORTAL_IMAGE_BRAND,
  resolveNodeImageTitle,
  resolveServerImageTitle,
  type Config,
} from "./config";
import type { MCSManagerClient } from "./client";
import { resolveBackgroundTextureDataUri } from "./visualization/styles";

export type VisualizationSurface = "node-status" | "server-list";

export interface CodeAuthoredLayoutDefinition {
  id: string;
  name: string;
  surface: VisualizationSurface;
  description: string;
  renderer: "react";
  componentPath: string;
  exportName: string;
  previewWidth: number;
}

export interface VisualizationMockData {
  portalName: string;
  nodeTitle: string;
  serverTitle: string;
  generatedAt: string;
  backgroundTexture?: string;
  backgroundTile?: string;
  nodes: NodeStatus[];
  servers: MinecraftInstance[];
}

export interface PreviewEntryData {
  version: 1;
  realDataAvailable: boolean;
  layouts: CodeAuthoredLayoutDefinition[];
  mock: VisualizationMockData;
}

export const codeAuthoredLayouts: CodeAuthoredLayoutDefinition[] = [
  {
    id: "node-status.react.default",
    name: "Node Status",
    surface: "node-status",
    description: "Preview of the React component that will render MCSManager daemon node health.",
    renderer: "react",
    componentPath: "src/visualization/layouts/NodeStatusLayout.tsx",
    exportName: "NodeStatusLayout",
    previewWidth: 854,
  },
  {
    id: "server-list.react.default",
    name: "Server List",
    surface: "server-list",
    description: "Preview of the React component that will render Minecraft instances discovered from MCSManager.",
    renderer: "react",
    componentPath: "src/visualization/layouts/ServerListLayout.tsx",
    exportName: "ServerListLayout",
    previewWidth: 854,
  },
];

export function createPreviewEntryData(config?: Config, realDataAvailable = false): PreviewEntryData {
  return {
    version: 1,
    realDataAvailable,
    layouts: codeAuthoredLayouts.map((layout) => withImageWidth(layout, config?.image.width)),
    mock: createMockPreviewData(config),
  };
}

export async function createRealPreviewData(config: Config, client: MCSManagerClient): Promise<VisualizationMockData> {
  const nodes = await client.listNodes();
  const servers = await client.listMinecraftInstances();

  return {
    ...createVisualizationDataBase(config),
    nodes,
    servers,
  };
}

export function createMockPreviewData(config?: Config): VisualizationMockData {
  return {
    ...createVisualizationDataBase(config),
    nodes: [
      {
        id: "node-shanghai-01",
        name: "Shanghai Node",
        online: true,
        address: "10.0.0.12:24444",
        cpuUsage: 0.38,
        memoryUsed: 12.4 * 1024 ** 3,
        memoryTotal: 32 * 1024 ** 3,
        diskUsed: 178 * 1024 ** 3,
        diskTotal: 512 * 1024 ** 3,
        instanceTotal: 6,
        instanceRunning: 4,
        instanceStopped: 2,
        platform: "linux x64",
        uptime: 172800,
        version: "10.5.x",
        remark: "Main production daemon",
      },
      {
        id: "node-backup-01",
        name: "Backup Node",
        online: false,
        address: "10.0.0.23:24444",
        instanceTotal: 2,
        instanceRunning: 0,
        instanceStopped: 2,
        platform: "linux x64",
        remark: "Maintenance window",
      },
    ],
    servers: [
      {
        id: "survival-01",
        name: "Survival SMP",
        status: "running",
        type: "minecraft/java",
        tags: ["survival", "public"],
        nodeId: "node-shanghai-01",
        nodeName: "Shanghai Node",
        address: "play.example.com:25565",
        onlinePlayers: 18,
        maxPlayers: 64,
        version: "1.20.1",
        motd: "Vanilla survival with land claims",
        modList: ["Fabric", "Lithium", "Ledger"],
      },
      {
        id: "creative-01",
        name: "Creative Plot",
        status: "running",
        type: "minecraft/java",
        tags: ["creative"],
        nodeId: "node-shanghai-01",
        nodeName: "Shanghai Node",
        address: "creative.example.com:25566",
        onlinePlayers: 7,
        maxPlayers: 40,
        version: "1.20.4",
        motd: "Build showcase and plot worlds",
        modList: [],
      },
      {
        id: "modded-01",
        name: "Modded Expedition",
        status: "stopped",
        type: "minecraft/forge",
        tags: ["modded", "whitelist"],
        nodeId: "node-backup-01",
        nodeName: "Backup Node",
        address: "modded.example.com:25567",
        onlinePlayers: 0,
        maxPlayers: 20,
        version: "1.19.2",
        motd: "Forge adventure pack",
        modList: ["Create", "Botania", "Twilight Forest"],
      },
    ],
  };
}

function createVisualizationDataBase(config?: Config) {
  return {
    portalName: PORTAL_IMAGE_BRAND,
    nodeTitle: config ? resolveNodeImageTitle(config) : DEFAULT_NODE_IMAGE_TITLE,
    serverTitle: config ? resolveServerImageTitle(config) : DEFAULT_SERVER_IMAGE_TITLE,
    generatedAt: new Date().toISOString(),
    backgroundTexture: config?.image.backgroundTexture || undefined,
    backgroundTile: resolveBackgroundTextureDataUri(config?.image.backgroundTexture),
  };
}

export function withImageWidth(layout: CodeAuthoredLayoutDefinition, width = 854): CodeAuthoredLayoutDefinition {
  return {
    ...layout,
    previewWidth: Math.min(1600, Math.max(640, width)),
  };
}
