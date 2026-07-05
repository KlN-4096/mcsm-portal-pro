import { INSTANCE_STATUSES, type InstanceStatus } from "./types";

export type StatusFilter = InstanceStatus[] | "all";

const STATUS_ALIASES: Record<string, InstanceStatus | "all"> = {
  all: "all",
  any: "all",
  "*": "all",
  全部: "all",
  所有: "all",
  running: "running",
  run: "running",
  online: "running",
  运行: "running",
  运行中: "running",
  在线: "running",
  stopped: "stopped",
  stop: "stopped",
  offline: "stopped",
  停止: "stopped",
  已停止: "stopped",
  离线: "stopped",
  starting: "starting",
  启动: "starting",
  启动中: "starting",
  stopping: "stopping",
  停止中: "stopping",
  unknown: "unknown",
  未知: "unknown",
};

export function resolveStatusFilter(input: string | undefined, defaults: InstanceStatus[]) {
  const normalized = input?.trim();
  if (!normalized) {
    return { ok: true as const, filter: defaults.length ? defaults : "all" as const };
  }

  const tokens = normalized.split(/[\s,，|/]+/).filter(Boolean);
  if (!tokens.length) return { ok: false as const };

  const statuses = tokens.map(resolveStatusToken);
  if (statuses.some((status) => !status)) return { ok: false as const };
  if (statuses.includes("all")) return { ok: true as const, filter: "all" as const };
  return { ok: true as const, filter: [...new Set(statuses as InstanceStatus[])] };
}

export function filterServersByStatus<T extends { status: InstanceStatus }>(servers: T[], filter: StatusFilter) {
  if (filter === "all") return servers;
  return servers.filter((server) => filter.includes(server.status));
}

export function formatStatusChoices() {
  return [...INSTANCE_STATUSES, "all"].join(", ");
}

function resolveStatusToken(token: string) {
  return STATUS_ALIASES[token.trim().toLowerCase()];
}
