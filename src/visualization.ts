import type { MinecraftInstance, NodeStatus } from "./types";
import {
  DEFAULT_NODE_IMAGE_TITLE,
  DEFAULT_SERVER_IMAGE_TITLE,
  PORTAL_IMAGE_BRAND,
  DEFAULT_COPYRIGHT_TEXT,
  resolveNodeImageTitle,
  resolvePortalTitle,
  resolveServerImageTitle,
  createRuntimeConfig,
  type Config,
} from "./config";
import type { MCSManagerClient } from "./client";
import {
  createDefaultRenderText,
  createVisualizationLayoutText,
  type RenderText,
} from "./render-text";
import type { VisualizationLayoutText } from "./visualization/layouts";
import { resolveBackgroundTextureChoice } from "./visualization/styles";
import { formatKoishiDate } from "./time";
import { PLUGIN_VERSION } from "./version";

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
  copyright: string;
  pluginVersion: string;
  nodeTitle: string;
  serverTitle: string;
  showGeneratedAt: boolean;
  generatedAt?: string;
  backgroundTexture?: string;
  backgroundTile?: string;
  text: VisualizationLayoutText;
  textPreviews?: Partial<Record<VisualizationSurface, string>>;
  nodes: NodeStatus[];
  servers: MinecraftInstance[];
}

type VisualizationMockDataWithoutText = Omit<VisualizationMockData, "text">;

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
    ...withVisualizationText(
      {
        ...createVisualizationDataBase(config),
        nodes,
        servers,
      },
      config,
    ),
  };
}

export function createMockPreviewData(config?: Config): VisualizationMockData {
  const nodes: NodeStatus[] = [
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
    ];
  const servers: MinecraftInstance[] = [
      {
        id: "survival-01",
        name: "Survival SMP",
        status: "running",
        type: "minecraft/java",
        tags: ["survival", "public"],
        nodeId: "node-shanghai-01",
        nodeName: "Shanghai Node",
        address: "play.example.com:25565",
        latencyMs: 42,
        onlinePlayers: 18,
        maxPlayers: 64,
        version: "1.20.1",
        motd: "§aVanilla Survival §7- §fLand claims enabled",
        motdSegments: [
          { text: "Vanilla Survival", color: "#55ff55", bold: true },
          { text: " - ", color: "#aaaaaa" },
          { text: "Land claims enabled", color: "#ffffff" },
        ],
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
        latencyMs: 136,
        onlinePlayers: 7,
        maxPlayers: 40,
        version: "1.20.4",
        motd: "§bCreative Plots §7| §eShowcase builds welcome",
        motdSegments: [
          { text: "Creative Plots", color: "#55ffff", bold: true },
          { text: " | ", color: "#aaaaaa" },
          { text: "Showcase builds welcome", color: "#ffff55" },
        ],
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
        latencyMs: 0,
        onlinePlayers: 0,
        maxPlayers: 20,
        version: "1.19.2",
        motd: "§6Forge Adventure §7- §dMagic, tech, exploration",
        motdSegments: [
          { text: "Forge Adventure", color: "#ffaa00", bold: true },
          { text: " - ", color: "#aaaaaa" },
          { text: "Magic", color: "#ff55ff" },
          { text: ", ", color: "#aaaaaa" },
          { text: "tech", color: "#55ffff" },
          { text: ", ", color: "#aaaaaa" },
          { text: "exploration", color: "#55ff55" },
        ],
        modList: ["Create", "Botania", "Twilight Forest"],
      },
    ];
  return withVisualizationText(
    {
      ...createVisualizationDataBase(config),
      nodes,
      servers,
    },
    config,
  );
}

function createVisualizationDataBase(config?: Config) {
  const showGeneratedAt = config?.image.showGeneratedAt ?? true;
  const backgroundTexture = resolveBackgroundTextureChoice(
    config?.image.backgroundTexture,
  );
  return {
    portalName: config ? resolvePortalTitle(config) : PORTAL_IMAGE_BRAND,
    copyright: DEFAULT_COPYRIGHT_TEXT,
    pluginVersion: PLUGIN_VERSION,
    nodeTitle: config ? resolveNodeImageTitle(config) : DEFAULT_NODE_IMAGE_TITLE,
    serverTitle: config ? resolveServerImageTitle(config) : DEFAULT_SERVER_IMAGE_TITLE,
    showGeneratedAt,
    generatedAt: showGeneratedAt ? formatKoishiDate(new Date()) : undefined,
    backgroundTexture: backgroundTexture.name || undefined,
    backgroundTile: backgroundTexture.dataUri,
  };
}

function withVisualizationText(
  data: VisualizationMockDataWithoutText,
  config?: Config,
): VisualizationMockData {
  const text = config
    ? createDefaultRenderText(config)
    : createFallbackRenderText();
  return {
    ...data,
    text: createVisualizationLayoutText(text, data.nodes, data.servers),
  };
}

function createFallbackRenderText(): RenderText {
  return createDefaultRenderText(createRuntimeConfig({}));
}

export function withImageWidth(layout: CodeAuthoredLayoutDefinition, width = 854): CodeAuthoredLayoutDefinition {
  return {
    ...layout,
    previewWidth: Math.min(1600, Math.max(640, width)),
  };
}
