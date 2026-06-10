export type InstanceStatus = "running" | "stopped" | "starting" | "stopping" | "unknown";

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
  onlinePlayers?: number;
  maxPlayers?: number;
  version?: string;
  motd?: string;
  modList: string[];
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
