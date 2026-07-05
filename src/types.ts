export const INSTANCE_STATUSES = ["running", "stopped", "starting", "stopping", "unknown"] as const;

export type InstanceStatus = typeof INSTANCE_STATUSES[number];

export interface NodeStatus {
  id: string;
  name: string;
  online: boolean;
  address?: string;
  cpuUsage?: number;
  memoryUsed?: number;
  memoryTotal?: number;
  diskUsed?: number;
  diskTotal?: number;
  instanceTotal?: number;
  instanceRunning?: number;
  instanceStopped?: number;
  platform?: string;
  uptime?: number;
  version?: string;
  remark?: string;
}

export interface MinecraftInstance {
  id: string;
  name: string;
  status: InstanceStatus;
  type?: string;
  tags: string[];
  nodeId?: string;
  nodeName?: string;
  address?: string;
  iconUrl?: string;
  latencyMs?: number;
  onlinePlayers?: number;
  maxPlayers?: number;
  playerNames?: string[];
  version?: string;
  motd?: string;
  motdSegments?: MinecraftTextSegment[];
  modList: string[];
}

export interface MinecraftTextSegment {
  text: string;
  color?: string;
  gradient?: string;
  bold?: boolean;
  italic?: boolean;
  underlined?: boolean;
  strikethrough?: boolean;
}

export interface ServerAddress {
  id: string;
  name: string;
  address?: string;
  nodeName?: string;
}

export interface ServerFieldVisibility {
  address: boolean;
  onlineCount: boolean;
  playerNames: boolean;
  status: boolean;
  node: boolean;
  version: boolean;
  motd: boolean;
  modList: boolean;
}

export interface MCSManagerResponse<T> {
  status?: number;
  data?: T;
  message?: string;
  error?: string;
}
