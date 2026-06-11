import type { MinecraftInstance, NodeStatus } from "../../types";
import type { CodeAuthoredLayoutDefinition } from "../../visualization";

export interface VisualizationLayoutData {
  portalName: string;
  nodeTitle: string;
  serverTitle: string;
  generatedAt: string;
  backgroundTexture?: string;
  backgroundTile?: string;
  nodes: NodeStatus[];
  servers: MinecraftInstance[];
}

export interface VisualizationLayoutProps {
  layout: CodeAuthoredLayoutDefinition;
  data: VisualizationLayoutData;
}
