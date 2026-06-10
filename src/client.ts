import type { Context } from "koishi";
import type { ConnectionConfig, MinecraftConfig } from "./config";
import type {
  InstanceStatus,
  MCSManagerResponse,
  MinecraftInstance,
  NodeStatus,
} from "./types";

interface CacheEntry<T> {
  expiresAt: number;
  value: T;
}

export class MCSManagerClient {
  private nodesCache?: CacheEntry<NodeStatus[]>;
  private minecraftInstancesCache?: CacheEntry<MinecraftInstance[]>;

  constructor(
    private ctx: Context,
    private config: ConnectionConfig,
    private minecraft: MinecraftConfig,
    private cacheTtl: number,
    private debugEnabled: boolean,
  ) {}

  get configured() {
    return Boolean(this.config.endpoint && this.config.apiKey);
  }

  async checkConnection() {
    return this.request<unknown>("/api/overview");
  }

  async listNodes() {
    const cached = this.readCache(this.nodesCache);
    if (cached) {
      this.debug("nodes cache hit", { count: cached.length });
      return cached;
    }

    this.debug("loading nodes");

    const [remoteServices, remoteSystems] = await Promise.all([
      this.request<unknown>("/api/service/remote_services_list"),
      this.request<unknown>("/api/service/remote_services_system"),
    ]);
    this.debug("node payloads loaded", {
      remoteServices: describePayload(remoteServices),
      remoteSystems: describePayload(remoteSystems),
    });

    const nodes = normalizeNodes(remoteServices, remoteSystems);
    this.debug("nodes normalized", {
      count: nodes.length,
      nodes: nodes.map((node) => ({
        id: node.id,
        name: node.name,
        online: node.online,
        address: node.address,
      })),
    });
    this.nodesCache = this.writeCache(nodes);
    return nodes;
  }

  async listMinecraftInstances() {
    const cached = this.readCache(this.minecraftInstancesCache);
    if (cached) {
      this.debug("minecraft instances cache hit", { count: cached.length });
      return cached;
    }

    const allInstances = await this.listInstances();
    const instances = allInstances.filter((instance) => this.isMinecraftInstance(instance));
    const excluded = allInstances.filter((instance) => !this.isMinecraftInstance(instance));

    this.debug("minecraft instances filtered", {
      keywords: this.normalizedMinecraftKeywords(),
      total: allInstances.length,
      matched: instances.length,
      excluded: excluded.map((instance) => ({
        id: instance.id,
        name: instance.name,
        type: instance.type,
        tags: instance.tags,
      })),
    });

    this.minecraftInstancesCache = this.writeCache(instances);
    return instances;
  }

  async listInstances() {
    const nodes = await this.listNodes();
    try {
      const fromGlobal = await this.listInstancesGlobal(nodes);
      this.debug("global instance endpoint loaded", { count: fromGlobal.length });
      if (fromGlobal.length) return fromGlobal;
    } catch (error) {
      this.ctx.logger("mcsm-portal").warn("global instance endpoint failed, falling back to per-node queries: %s", formatErrorMessage(error));
    }

    this.debug("loading instances per node", { nodes: nodes.map((node) => node.id) });
    const batches = await Promise.all(nodes.map((node) => this.listInstancesByNode(node)));
    const instances = batches.flat();
    this.debug("per-node instances loaded", { count: instances.length });
    return instances;
  }

  clearCache() {
    this.nodesCache = undefined;
    this.minecraftInstancesCache = undefined;
    this.debug("cache cleared");
  }

  async request<T>(path: string, params: Record<string, string | number | boolean> = {}) {
    this.assertConfigured();

    const query = {
      ...params,
      [this.config.apiKeyParam]: this.config.apiKey,
    };

    this.debug("request start", {
      path,
      params: sanitizeParams(query, this.config.apiKeyParam),
    });

    try {
      const response = await this.ctx.http.get<MCSManagerResponse<T> | T>(path, {
        baseURL: trimTrailingSlash(this.config.endpoint),
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "X-Requested-With": "XMLHttpRequest",
        },
        params: query,
        timeout: this.config.timeout,
      });

      const payload = unwrapResponse<T>(response);
      this.debug("request success", {
        path,
        payload: describePayload(payload),
      });
      return payload;
    } catch (error) {
      this.debug("request failed", {
        path,
        message: formatErrorMessage(error),
      });
      throw error;
    }
  }

  private async listInstancesByNode(node: NodeStatus) {
    const pageSize = this.minecraft.pageSize;
    const instances: MinecraftInstance[] = [];
    let page = 1;
    let total: number | undefined;

    do {
      const payload = await this.request<unknown>("/api/service/remote_service_instances", {
        daemonId: node.id,
        page,
        page_size: pageSize,
        instance_name: "",
        status: "",
        tag: "[]",
      });
      const result = normalizeInstancePage(payload, node);
      instances.push(...result.instances);
      total = result.total ?? (result.maxPage !== undefined ? result.maxPage * pageSize : undefined);
      this.debug("node instance page loaded", {
        nodeId: node.id,
        nodeName: node.name,
        page,
        pageSize,
        maxPage: result.maxPage,
        total,
        count: result.instances.length,
        instances: result.instances.map((instance) => describeInstance(instance)),
      });
      page += 1;
    } while (total !== undefined && instances.length < total && page <= 100);

    return instances;
  }

  private async listInstancesGlobal(nodes: NodeStatus[]) {
    const payload = await this.request<unknown>("/api/service/remote_services_instances_global", {
      page: 1,
      page_size: this.minecraft.pageSize,
      instance_name: "",
      status: "",
    });
    const instances = normalizeGlobalInstances(payload, nodes);
    this.debug("global instances normalized", {
      payload: describePayload(payload),
      count: instances.length,
      instances: instances.map((instance) => describeInstance(instance)),
    });
    return instances;
  }

  private isMinecraftInstance(instance: MinecraftInstance) {
    const keywords = this.normalizedMinecraftKeywords();
    if (!keywords.length) return true;

    const haystack = [
      instance.type,
      instance.name,
      ...instance.tags,
    ].filter((value): value is string => Boolean(value)).join(" ").toLowerCase();

    return keywords.some((keyword) => haystack.includes(keyword));
  }

  private normalizedMinecraftKeywords() {
    return this.minecraft.typeKeywords.map((keyword) => keyword.trim().toLowerCase()).filter(Boolean);
  }

  private readCache<T>(entry?: CacheEntry<T>) {
    if (!entry) return;
    if (this.cacheTtl <= 0) return;
    if (entry.expiresAt <= Date.now()) return;
    return entry.value;
  }

  private writeCache<T>(value: T): CacheEntry<T> | undefined {
    if (this.cacheTtl <= 0) return;
    return {
      expiresAt: Date.now() + this.cacheTtl * 1000,
      value,
    };
  }

  private assertConfigured() {
    if (!this.config.endpoint) {
      throw new Error("MCSManager endpoint is not configured.");
    }
    if (!this.config.apiKey) {
      throw new Error("MCSManager API key is not configured.");
    }
  }

  private debug(message: string, data?: unknown) {
    if (!this.debugEnabled) return;
    if (data === undefined) {
      this.ctx.logger("mcsm-portal").info("[debug] %s", message);
    } else {
      this.ctx.logger("mcsm-portal").info("[debug] %s %o", message, data);
    }
  }
}

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}

function unwrapResponse<T>(response: MCSManagerResponse<T> | T) {
  if (!isRecord(response)) return response as T;
  if (!("status" in response) || !("data" in response)) return response as T;

  const status = readNumber(response, "status");
  if (status !== undefined && status >= 400) {
    const message = readString(response, "message") ?? readString(response, "error") ?? `MCSManager API returned ${status}.`;
    throw new Error(message);
  }

  return response.data as T;
}

function sanitizeParams(params: Record<string, string | number | boolean>, apiKeyParam: string) {
  return Object.fromEntries(Object.entries(params).map(([key, value]) => [
    key,
    key === apiKeyParam ? "<redacted>" : value,
  ]));
}

function describePayload(value: unknown): unknown {
  if (Array.isArray(value)) return { type: "array", length: value.length };
  if (!isRecord(value)) return { type: typeof value };

  const keys = Object.keys(value);
  return {
    type: "object",
    keys,
    dataLength: Array.isArray(value.data) ? value.data.length : undefined,
    instanceGroups: keys.filter((key) => Array.isArray(toRecord(value[key])?.instances)).length,
  };
}

function describeInstance(instance: MinecraftInstance) {
  return {
    id: instance.id,
    name: instance.name,
    type: instance.type,
    status: instance.status,
    nodeId: instance.nodeId,
    nodeName: instance.nodeName,
    tags: instance.tags,
    hasAddress: Boolean(instance.address),
  };
}

function formatErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function normalizeNodes(remoteServicesPayload: unknown, remoteSystemsPayload: unknown): NodeStatus[] {
  const services = toArray(remoteServicesPayload).map(toRecord).filter(isRecord);
  const systems = new Map(
    toArray(remoteSystemsPayload)
      .map(toRecord)
      .filter(isRecord)
      .map((system) => [readString(system, "uuid") ?? readString(system, "id"), system] as const)
      .filter((entry): entry is readonly [string, Record<string, unknown>] => Boolean(entry[0])),
  );

  return services.map((service) => {
    const id = readString(service, "uuid") ?? readString(service, "id") ?? "";
    const systemInfo = systems.get(id);
    const system = toRecord(systemInfo?.system);
    const instance = toRecord(systemInfo?.instance);
    const totalMemory = readNumber(system, "totalmem") ?? readNumber(system, "totalMemory") ?? readNumber(system, "memTotal");
    const freeMemory = readNumber(system, "freemem") ?? readNumber(system, "freeMemory") ?? readNumber(system, "memFree");

    return {
      id,
      name: readString(service, "remarks") ?? readString(service, "name") ?? id,
      online: readBoolean(service, "available") ?? Boolean(systemInfo),
      address: formatAddress(readString(service, "ip"), readNumber(service, "port")),
      cpuUsage: readNumber(system, "cpu") ?? readNumber(system, "cpuUsage"),
      memoryUsed: totalMemory !== undefined && freeMemory !== undefined ? totalMemory - freeMemory : undefined,
      memoryTotal: totalMemory,
      diskUsed: readNumber(system, "diskUsed"),
      diskTotal: readNumber(system, "diskTotal"),
      instanceTotal: readNumber(instance, "total"),
      instanceRunning: readNumber(instance, "running"),
      instanceStopped: readNumber(instance, "stopped"),
      platform: readString(system, "platform") ?? readString(system, "type"),
      uptime: readNumber(system, "uptime"),
      version: readString(system, "version"),
      remark: readString(service, "remarks"),
    };
  });
}

function normalizeInstancePage(payload: unknown, node: NodeStatus) {
  const record = toRecord(payload);
  const data = toArray(record?.data ?? payload);
  const total = record ? readNumber(record, "total") : undefined;
  const maxPage = record ? readNumber(record, "maxPage") : undefined;

  return {
    total,
    maxPage,
    instances: data
      .map(toRecord)
      .filter(isRecord)
      .map((item) => normalizeInstance(item, node))
      .filter((instance): instance is MinecraftInstance => Boolean(instance)),
  };
}

function normalizeInstance(item: Record<string, unknown>, node: NodeStatus): MinecraftInstance | undefined {
  const id = readString(item, "instanceUuid") ?? readString(item, "uuid") ?? readString(item, "id");
  if (!id) return;

  const config = toRecord(item.config);
  const info = toRecord(item.info);
  const type = readString(config, "type") ?? readString(item, "type");
  return {
    id,
    name: readString(config, "nickname") ?? readString(item, "nickname") ?? readString(item, "name") ?? id,
    status: normalizeStatus(item.status),
    type,
    tags: readStringArray(config, "tag") ?? readStringArray(item, "tag") ?? readStringArray(item, "tags") ?? [],
    nodeId: node.id,
    nodeName: node.name,
    address: readString(config, "address") ?? readString(item, "address") ?? readString(item, "serverAddress"),
    onlinePlayers: readNumber(info, "currentPlayers") ?? readNumber(item, "onlinePlayers") ?? readNumber(item, "currentPlayers"),
    maxPlayers: readNumber(info, "maxPlayers") ?? readNumber(item, "maxPlayers"),
    version: readString(info, "version") ?? readString(item, "version"),
    motd: readString(info, "motd") ?? readString(item, "motd"),
    modList: readStringArray(info, "modList") ?? readStringArray(item, "modList") ?? readStringArray(item, "mods") ?? [],
  };
}

function normalizeGlobalInstances(payload: unknown, nodes: NodeStatus[]) {
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  const record = toRecord(payload);
  if (!record) return [];

  return Object.entries(record).flatMap(([nodeId, value]) => {
    const node = nodeMap.get(nodeId) ?? {
      id: nodeId,
      name: nodeId,
      online: true,
    };
    const instances = toArray(toRecord(value)?.instances);
    return instances
      .map(toRecord)
      .filter(isRecord)
      .map((item) => normalizeInstance(item, node))
      .filter((instance): instance is MinecraftInstance => Boolean(instance));
  });
}

function normalizeStatus(value: unknown): InstanceStatus {
  if (typeof value === "number") {
    if (value === 0) return "stopped";
    if (value === 1) return "stopping";
    if (value === 2) return "starting";
    if (value === 3) return "running";
  }

  if (typeof value === "string") {
    const normalized = value.toLowerCase();
    if (normalized === "running" || normalized === "stopped" || normalized === "starting" || normalized === "stopping") {
      return normalized;
    }
  }

  return "unknown";
}

function formatAddress(host?: string, port?: number) {
  if (!host) return;
  if (!port) return host;
  return `${host}:${port}`;
}

function toArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function toRecord(value: unknown): Record<string, unknown> | undefined {
  return isRecord(value) ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readString(record: Record<string, unknown> | undefined, key: string) {
  const value = record?.[key];
  return typeof value === "string" && value ? value : undefined;
}

function readNumber(record: Record<string, unknown> | undefined, key: string) {
  const value = record?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function readBoolean(record: Record<string, unknown> | undefined, key: string) {
  const value = record?.[key];
  return typeof value === "boolean" ? value : undefined;
}

function readStringArray(record: Record<string, unknown>, key: string) {
  const value = record[key];
  if (!Array.isArray(value)) return;
  return value.filter((item): item is string => typeof item === "string");
}
