import type { MinecraftInstance, NodeStatus } from "../../types";
import type { CodeAuthoredLayoutDefinition } from "../../visualization";

export interface VisualizationLayoutText {
  nodeOnlineSummary: string;
  serverOnlineSummary: string;
  online: string;
  offline: string;
  cpu: string;
  memory: string;
  instances: string;
  platform: string;
  version: string;
  playerNames: string;
  unknown: string;
  noNodesAvailable: string;
  noServersAvailable: string;
  noAddressConfigured: string;
  defaultMotd: string;
  statusLabels: Record<MinecraftInstance["status"], string>;
}

export interface VisualizationLayoutData {
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
  nodes: NodeStatus[];
  servers: MinecraftInstance[];
}

export interface VisualizationLayoutProps {
  layout: CodeAuthoredLayoutDefinition;
  data: VisualizationLayoutData;
}

export type ExecutionVoteStatus = "active" | "passed" | "rejected" | "timeout";

export interface ExecutionVoteLayoutData {
  portalName: string;
  copyright: string;
  pluginVersion: string;
  generatedAt?: string;
  backgroundTile?: string;
  title: string;
  serverNameLabel: string;
  serverName: string;
  commandLabel: string;
  command: string;
  progressLabel: string;
  hint: string;
  status: ExecutionVoteStatus;
  statusLabel: string;
  approvals: number;
  required: number;
}

export interface ExecutionVoteLayoutProps {
  layout: CodeAuthoredLayoutDefinition;
  data: ExecutionVoteLayoutData;
}
