import type { Context } from "koishi";
import type {
  ConnectionConfig,
  LatencyFallbackServiceConfig,
  MinecraftConfig,
} from "./config";
import { parseMinecraftListOutput } from "./minecraft-list-output";
import { parseMinecraftAddress, queryMinecraftStatus } from "./minecraft-status";
import {
  captureMarkedLogLines,
  describeMarkedLogCapture,
  limitOutput,
  logContainsMarkerSince,
} from "./terminal-log";
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

type MinecraftPlayerListSnapshot = Pick<MinecraftInstance, "onlinePlayers" | "maxPlayers" | "playerNames">;

const PLAYER_LIST_COMMAND = "list";
const PLAYER_LIST_MAX_RESULT_LENGTH = 20000;
const PLAYER_LIST_CONCURRENCY = 3;
const SECOND_MS = 1000;
const LATENCY_FALLBACK_CACHE_TTL_MS = 5 * 60 * SECOND_MS;
const COMMAND_OUTPUT_LOG_SIZE = 65536;
const COMMAND_LOG_WINDOW_LINES = 10000;
const COMMAND_OUTPUT_WAIT_MS = 20000;
const COMMAND_OUTPUT_POLL_INTERVAL_MS = 500;
const COMMAND_MARKER_SETTLE_MS = 1000;
const COMMAND_MARKER_NAMESPACE = "mcsm_portal";

export class MCSManagerClient {
  private nodesCache?: CacheEntry<NodeStatus[]>;
  private minecraftInstancesCache?: CacheEntry<MinecraftInstance[]>;
  private minecraftPlayerListCache = new Map<string, CacheEntry<MinecraftPlayerListSnapshot>>();
  private latencyFallbackCache = new Map<string, CacheEntry<number>>();
  private instanceCommandQueues = new Map<string, Promise<unknown>>();
  private playerListUnavailableInstances = new Set<string>();

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
    const instances = await this.enrichMinecraftInstances(
      allInstances.filter((instance) => this.isMinecraftInstance(instance)),
    );
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

  async listMinecraftInstancesWithPlayerList() {
    const instances = await this.listMinecraftInstances();
    return this.enrichMinecraftPlayerLists(instances);
  }

  async listInstances() {
    const nodes = await this.listNodes();
    try {
      const fromGlobal = await this.listInstancesGlobal(nodes);
      this.debug("global instance endpoint loaded", { count: fromGlobal.length });
      if (fromGlobal.length) return fromGlobal;
    } catch (error) {
      this.ctx.logger("mcsm-portal-pro").warn("global instance endpoint failed, falling back to per-node queries: %s", formatErrorMessage(error));
    }

    this.debug("loading instances per node", { nodes: nodes.map((node) => node.id) });
    const batches = await Promise.all(nodes.map((node) => this.listInstancesByNode(node)));
    const instances = batches.flat();
    this.debug("per-node instances loaded", { count: instances.length });
    return instances;
  }

  async executeInstanceCommand(
    instance: MinecraftInstance,
    command: string,
    maxLength: number,
  ) {
    if (!instance.nodeId) throw new Error("MCSManager daemon ID is missing for this instance.");
    return this.runInstanceCommandExclusive(instance, () =>
      this.executeMarkedInstanceCommand(instance, command, maxLength),
    );
  }

  private async executeMarkedInstanceCommand(
    instance: MinecraftInstance,
    command: string,
    maxLength: number,
  ) {
    const nonce = createCommandNonce();
    const beginMarker = createCommandMarker("begin", nonce);
    const endMarker = createCommandMarker("end", nonce);
    const before = await this.getInstanceOutputLog(instance);
    await this.sendInstanceCommand(instance, createMarkerCommand(beginMarker));
    await this.waitForLogMarker(instance, before, beginMarker);
    await sleep(COMMAND_MARKER_SETTLE_MS);
    const commandBaseline = await this.getInstanceOutputLog(instance);
    await this.sendInstanceCommand(instance, command);
    await this.sendInstanceCommand(instance, createMarkerCommand(endMarker));
    const afterEnd = await this.waitForLogMarker(instance, commandBaseline, endMarker);
    const lines = captureMarkedLogLines({
      before: commandBaseline,
      log: afterEnd,
      beginMarker,
      endMarker,
      ignoredMarkers: [beginMarker, endMarker],
      windowLines: COMMAND_LOG_WINDOW_LINES,
    });
    if (!lines) {
      this.debug("terminal command capture failed", {
        id: instance.id,
        name: instance.name,
        ...describeMarkedLogCapture({
          before: commandBaseline,
          log: afterEnd,
          beginMarker,
          endMarker,
          ignoredMarkers: [beginMarker, endMarker],
          windowLines: COMMAND_LOG_WINDOW_LINES,
        }),
      });
      throw new Error("Failed to capture terminal output between command markers.");
    }

    return limitOutput(lines.join("\n").trim(), maxLength);
  }

  private async waitForLogMarker(
    instance: MinecraftInstance,
    baseline: string | null,
    marker: string,
  ) {
    const deadline = Date.now() + COMMAND_OUTPUT_WAIT_MS;
    while (Date.now() < deadline) {
      await sleep(COMMAND_OUTPUT_POLL_INTERVAL_MS);
      const after = await this.getInstanceOutputLog(instance);
      if (logContainsMarkerSince(
        baseline,
        after,
        marker,
        COMMAND_LOG_WINDOW_LINES,
      )) return after;
    }

    throw new TerminalMarkerTimeoutError();
  }

  clearCache() {
    this.nodesCache = undefined;
    this.minecraftInstancesCache = undefined;
    this.minecraftPlayerListCache.clear();
    this.latencyFallbackCache.clear();
    this.playerListUnavailableInstances.clear();
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
    let hasNextPage = true;

    while (hasNextPage && page <= 100) {
      const payload = await this.request<unknown>("/api/service/remote_service_instances", {
        daemonId: node.id,
        page,
        page_size: pageSize,
        instance_name: "",
        status: "",
        tag: "[]",
      });
      const result = normalizeInstancePage(payload, node, this.getPublicHost(node));
      instances.push(...result.instances);
      if (result.maxPage !== undefined) {
        hasNextPage = page < result.maxPage;
      } else if (result.total !== undefined) {
        hasNextPage = instances.length < result.total;
      } else {
        hasNextPage = result.instances.length >= pageSize;
      }
      this.debug("node instance page loaded", {
        nodeId: node.id,
        nodeName: node.name,
        page,
        pageSize,
        maxPage: result.maxPage,
        total: result.total,
        hasNextPage,
        count: result.instances.length,
        instances: result.instances.map((instance) => describeInstance(instance)),
      });
      page += 1;
    }

    return instances;
  }

  private async listInstancesGlobal(nodes: NodeStatus[]) {
    const payload = await this.request<unknown>("/api/service/remote_services_instances_global", {
      page: 1,
      page_size: this.minecraft.pageSize,
      instance_name: "",
      status: "",
    });
    const instances = normalizeGlobalInstances(payload, nodes, (node) => this.getPublicHost(node));
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

  private getPublicHost(node: NodeStatus) {
    const nodeHost = getHostFromAddress(node.address);
    if (nodeHost && !isLocalHost(nodeHost)) return nodeHost;

    const endpointHost = getHostFromAddress(this.config.endpoint);
    if (endpointHost && !isLocalHost(endpointHost)) return endpointHost;
  }

  private async enrichMinecraftInstances(instances: MinecraftInstance[]) {
    const timeout = Math.min(this.config.timeout, 3000);
    return mapConcurrent(instances, 6, async (instance) => {
      if (!instance.address || instance.status !== "running") return instance;

      try {
        const status = await queryMinecraftStatus(instance.address, timeout);
        const latencyMs = await this.resolveLatency(instance, status.latencyMs, timeout);
        return {
          ...instance,
          onlinePlayers: status.onlinePlayers ?? instance.onlinePlayers,
          maxPlayers: status.maxPlayers ?? instance.maxPlayers,
          latencyMs: latencyMs ?? status.latencyMs ?? instance.latencyMs,
          version: status.version ?? instance.version,
          motd: status.motd ?? instance.motd,
          motdSegments: status.motdSegments ?? instance.motdSegments,
          iconUrl: status.iconUrl ?? instance.iconUrl,
        };
      } catch (error) {
        this.debug("minecraft status query failed", {
          id: instance.id,
          name: instance.name,
          address: instance.address,
          message: formatErrorMessage(error),
        });
        return instance;
      }
    });
  }

  async enrichMinecraftPlayerLists(instances: MinecraftInstance[]) {
    return mapConcurrent(instances, PLAYER_LIST_CONCURRENCY, async (instance) => {
      if (instance.status !== "running" || !instance.nodeId) {
        return instance;
      }
      const cacheKey = getInstanceCommandKey(instance);
      const cached = this.readCache(this.minecraftPlayerListCache.get(cacheKey));
      if (cached) {
        return { ...instance, ...cached };
      }
      if (this.playerListUnavailableInstances.has(cacheKey)) {
        this.debug("minecraft player list skipped for terminal-incompatible instance", {
          id: instance.id,
          name: instance.name,
        });
        return instance;
      }

      try {
        const output = await this.executeInstanceCommand(
          instance,
          PLAYER_LIST_COMMAND,
          PLAYER_LIST_MAX_RESULT_LENGTH,
        );
        const list = parseMinecraftListOutput(output);
        if (!list) return instance;
        const snapshot = {
          onlinePlayers: list.onlinePlayers ?? instance.onlinePlayers,
          maxPlayers: list.maxPlayers ?? instance.maxPlayers,
          playerNames: list.playerNames ?? instance.playerNames,
        };
        const entry = this.writeCache(snapshot);
        if (entry) this.minecraftPlayerListCache.set(cacheKey, entry);
        return { ...instance, ...snapshot };
      } catch (error) {
        if (error instanceof TerminalMarkerTimeoutError) {
          this.playerListUnavailableInstances.add(cacheKey);
          this.debug("minecraft player list disabled after terminal marker timeout", {
            id: instance.id,
            name: instance.name,
          });
        }
        this.ctx.logger("mcsm-portal-pro").warn(
          "minecraft list command failed: instance=%s name=%s message=%s",
          instance.id,
          instance.name,
          formatErrorMessage(error),
        );
        return instance;
      }
    });
  }

  private async sendInstanceCommand(instance: MinecraftInstance, command: string) {
    await this.request<unknown>("/api/protected_instance/command", {
      daemonId: instance.nodeId!,
      uuid: instance.id,
      command,
    });
  }

  private async getInstanceOutputLog(instance: MinecraftInstance) {
    const output = await this.request<unknown>("/api/protected_instance/outputlog", {
      daemonId: instance.nodeId!,
      uuid: instance.id,
      size: COMMAND_OUTPUT_LOG_SIZE,
    });
    return extractOutputLogText(output);
  }

  private async runInstanceCommandExclusive<T>(
    instance: MinecraftInstance,
    task: () => Promise<T>,
  ) {
    const key = getInstanceCommandKey(instance);
    const previous = this.instanceCommandQueues.get(key) ?? Promise.resolve();
    const current = previous.catch(() => undefined).then(task);
    this.instanceCommandQueues.set(key, current);

    try {
      return await current;
    } finally {
      if (this.instanceCommandQueues.get(key) === current) {
        this.instanceCommandQueues.delete(key);
      }
    }
  }

  private async resolveLatency(
    instance: MinecraftInstance,
    statusLatencyMs: number | undefined,
    timeout: number,
  ) {
    const services = this.minecraft.latencyFallback.filter((service) =>
      service.url.trim(),
    );
    if (services.length === 0) return statusLatencyMs;
    if (!shouldUseLatencyFallback(statusLatencyMs, this.minecraft)) {
      return statusLatencyMs;
    }

    const cacheKey = instance.address!;
    const cached = this.readCache(this.latencyFallbackCache.get(cacheKey));
    if (cached !== undefined) {
      this.debug("latency testing service cache hit", {
        id: instance.id,
        name: instance.name,
        address: instance.address,
        latencyMs: cached,
      });
      return cached;
    }

    try {
      const latencyMs = await this.queryLatencyTestingServices(
        services,
        cacheKey,
        timeout,
      );
      const entry = this.writeCache(latencyMs, LATENCY_FALLBACK_CACHE_TTL_MS);
      if (entry) this.latencyFallbackCache.set(cacheKey, entry);
      this.debug("latency testing service result", {
        id: instance.id,
        name: instance.name,
        address: instance.address,
        strategy: this.minecraft.latencyFallbackStrategy,
        statusLatencyMs,
        latencyMs,
      });
      return latencyMs;
    } catch (error) {
      this.debug("latency testing service failed", {
        id: instance.id,
        name: instance.name,
        address: instance.address,
        statusLatencyMs,
        message: formatErrorMessage(error),
      });
      return statusLatencyMs;
    }
  }

  private async queryLatencyTestingServices(
    services: LatencyFallbackServiceConfig[],
    address: string,
    timeout: number,
  ) {
    switch (this.minecraft.latencyFallbackStrategy) {
      case "random": {
        const service = pickRandom(services);
        return this.queryLatencyTestingService(service, address, timeout);
      }
      case "average": {
        const results = await Promise.all(
          services.map((service) =>
            this.queryLatencyTestingService(service, address, timeout).catch(
              () => undefined,
            ),
          ),
        );
        const latencies = results.filter(
          (latencyMs): latencyMs is number => latencyMs !== undefined,
        );
        if (latencies.length === 0) {
          throw new Error("All latency testing services failed.");
        }
        return Math.round(
          latencies.reduce((sum, latencyMs) => sum + latencyMs, 0) /
            latencies.length,
        );
      }
      case "fallback":
      default: {
        let lastError: unknown;
        for (const service of services) {
          try {
            return await this.queryLatencyTestingService(
              service,
              address,
              timeout,
            );
          } catch (error) {
            lastError = error;
          }
        }
        throw lastError ?? new Error("All latency testing services failed.");
      }
    }
  }

  private async queryLatencyTestingService(
    service: LatencyFallbackServiceConfig,
    address: string,
    timeout: number,
  ) {
    const url = createLatencyTestingServiceUrl(service.url, address);
    const response = await this.ctx.http.get<unknown>(url, { timeout });
    const latencyMs = readLatencyValue(
      response,
      this.minecraft.latencyFallbackKeys,
    );
    if (latencyMs === undefined) {
      throw new Error(
        "Latency testing service response did not contain a numeric latency field.",
      );
    }
    return latencyMs;
  }

  private readCache<T>(entry?: CacheEntry<T>) {
    if (!entry) return;
    if (this.cacheTtl <= 0) return;
    if (entry.expiresAt <= Date.now()) return;
    return entry.value;
  }

  private writeCache<T>(value: T, ttlMs = this.cacheTtl * SECOND_MS): CacheEntry<T> | undefined {
    if (this.cacheTtl <= 0 || ttlMs <= 0) return;
    return {
      expiresAt: Date.now() + ttlMs,
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
      this.ctx.logger("mcsm-portal-pro").info("[debug] %s", message);
    } else {
      this.ctx.logger("mcsm-portal-pro").info("[debug] %s %o", message, data);
    }
  }
}

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}

function shouldUseLatencyFallback(
  latencyMs: number | undefined,
  minecraft: MinecraftConfig,
) {
  if (minecraft.latencyFallbackTrigger === "always") return true;
  if (latencyMs === undefined) return true;
  return (
    minecraft.latencyFallbackTrigger === "local" &&
    latencyMs <= minecraft.latencyFallbackLocalThreshold
  );
}

function createLatencyTestingServiceUrl(template: string, address: string) {
  const target = parseMinecraftAddress(address);
  if (!target) throw new Error(`Invalid Minecraft server address: ${address}`);

  const replacements: Record<string, string> = {
    address,
    host: target.host,
    port: String(target.port),
  };
  return template.replace(/\{(address|host|port)\}/g, (_, key: string) =>
    encodeURIComponent(replacements[key]),
  );
}

function readLatencyValue(
  value: unknown,
  keys: readonly string[],
): number | undefined {
  const direct = normalizeLatencyNumber(value);
  if (direct !== undefined) return direct;

  for (const key of keys) {
    const path = key.split(".").filter(Boolean);
    if (path.length === 0) continue;
    const nested = readNestedValue(value, path);
    const latencyMs = normalizeLatencyNumber(nested);
    if (latencyMs !== undefined) return latencyMs;
  }
}

function pickRandom<T>(values: readonly T[]) {
  return values[Math.floor(Math.random() * values.length)];
}

function readNestedValue(value: unknown, path: string[]) {
  let current = value;
  for (const key of path) {
    const record = toRecord(current);
    if (!record) return;
    current = record[key];
  }
  return current;
}

function normalizeLatencyNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    return Math.round(value);
  }
  if (typeof value !== "string") return;
  const match = value.match(/\d+(?:\.\d+)?/);
  if (!match) return;
  const parsed = Number(match[0]);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed) : undefined;
}

function extractOutputLogText(value: unknown) {
  if (typeof value === "string") return value;
  const record = toRecord(value);
  const data = record?.data;
  return typeof data === "string" ? data : "";
}

function unwrapResponse<T>(response: MCSManagerResponse<T> | T) {
  if (!isRecord(response)) return response as T;

  const status = readNumber(response, "status");
  if (status !== undefined && status >= 400) {
    const message = readString(response, "message") ?? readString(response, "error") ?? `MCSManager API returned ${status}.`;
    throw new Error(message);
  }

  if (!("data" in response)) return response as T;
  return response.data as T;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

class TerminalMarkerTimeoutError extends Error {
  constructor() {
    super("Timed out waiting for the MCSManager terminal marker.");
  }
}

function getInstanceCommandKey(instance: MinecraftInstance) {
  return `${instance.nodeId}:${instance.id}`;
}

function createCommandNonce() {
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function createCommandMarker(kind: "begin" | "end", nonce: string) {
  return `${COMMAND_MARKER_NAMESPACE}:${kind}_${nonce}`;
}

function createMarkerCommand(marker: string) {
  return `data get storage ${marker}`;
}

function sanitizeParams(params: Record<string, string | number | boolean>, apiKeyParam: string) {
  return Object.fromEntries(Object.entries(params).map(([key, value]) => [
    key,
    key === apiKeyParam || key === "command" ? "<redacted>" : value,
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
  const systemRows = toArray(remoteSystemsPayload).map(toRecord).filter(isRecord);
  const systemsById = new Map(
    systemRows
      .map((row) => [readNodeId(row), row] as const)
      .filter((entry): entry is readonly [string, Record<string, unknown>] =>
        Boolean(entry[0]),
      ),
  );
  let onlineSystemIndex = 0;

  return services.map((service) => {
    const id = readNodeId(service) ?? "";
    const available = readBoolean(service, "available");
    const systemInfo = systemsById.get(id) ?? (
      systemsById.size === 0 && available !== false
        ? systemRows[onlineSystemIndex++]
        : undefined
    );
    const system = toRecord(systemInfo?.system);
    const instance = toRecord(systemInfo?.instance);
    const memoryUsage = normalizeRatio(
      readNumber(system, "memUsage") ?? readNumber(system, "memoryUsage"),
    );
    const freeMemory = readNumber(system, "freemem") ?? readNumber(system, "freeMemory") ?? readNumber(system, "memFree");
    const totalMemory = readNumber(system, "totalmem") ?? readNumber(system, "totalMemory") ?? readNumber(system, "memTotal");
    const memoryUsed = totalMemory !== undefined
      ? memoryUsage !== undefined
        ? totalMemory * memoryUsage
        : freeMemory !== undefined
          ? totalMemory - freeMemory
          : undefined
      : undefined;
    const instanceTotal = readNumber(instance, "total");
    const instanceRunning = readNumber(instance, "running");
    const diskUsage = readDiskUsage(system);

    return {
      id,
      name: readString(service, "remarks") ?? readString(service, "name") ?? id,
      online: available ?? Boolean(systemInfo),
      address: formatAddress(readString(service, "ip"), readNumber(service, "port")),
      cpuUsage: normalizeRatio(
        readNumber(system, "cpuUsage") ?? readNumber(system, "cpu"),
      ),
      memoryUsed,
      memoryTotal: totalMemory,
      diskUsed: diskUsage.used,
      diskTotal: diskUsage.total,
      instanceTotal,
      instanceRunning,
      instanceStopped:
        readNumber(instance, "stopped") ??
        (instanceTotal !== undefined && instanceRunning !== undefined
          ? Math.max(0, instanceTotal - instanceRunning)
          : undefined),
      platform:
        readString(system, "platform") ??
        readString(system, "type") ??
        readString(system, "release"),
      uptime: readNumber(system, "uptime"),
      version:
        readString(systemInfo, "version") ??
        readString(system, "version") ??
        readString(system, "release"),
      remark: readString(service, "remarks"),
    };
  });
}

function readNodeId(record: Record<string, unknown> | undefined) {
  return readString(record, "uuid") ??
    readString(record, "id") ??
    readString(record, "daemonId") ??
    readString(record, "remoteUuid");
}

function normalizeRatio(value: number | undefined) {
  if (value === undefined) return;
  return value > 1 ? value / 100 : value;
}

function readDiskUsage(system: Record<string, unknown> | undefined) {
  const direct = readSingleDiskUsage(system);
  if (direct.total !== undefined || direct.used !== undefined) return direct;

  for (const key of ["disk", "storage", "filesystem"] as const) {
    const nested = readSingleDiskUsage(toRecord(system?.[key]));
    if (nested.total !== undefined || nested.used !== undefined) return nested;
  }

  const disks = [
    ...toArray(system?.disks),
    ...toArray(system?.diskList),
    ...toArray(system?.fsSize),
    ...toArray(system?.filesystems),
  ].map(toRecord).filter(isRecord).map(readSingleDiskUsage);
  const total = sumDefined(disks.map((disk) => disk.total));
  const used = sumDefined(disks.map((disk) => disk.used));
  return { used, total };
}

function readSingleDiskUsage(record: Record<string, unknown> | undefined) {
  const total = readFirstNumber(record, [
    "diskTotal",
    "totalDisk",
    "storageTotal",
    "totalStorage",
    "size",
    "total",
  ]);
  const free = readFirstNumber(record, [
    "diskFree",
    "freeDisk",
    "storageFree",
    "freeStorage",
    "available",
    "avail",
    "free",
  ]);
  const usage = normalizeRatio(
    readFirstNumber(record, ["diskUsage", "storageUsage", "usage", "use"]),
  );
  const used =
    readFirstNumber(record, [
      "diskUsed",
      "usedDisk",
      "storageUsed",
      "usedStorage",
      "used",
    ]) ??
    (total !== undefined && free !== undefined
      ? total - free
      : total !== undefined && usage !== undefined
        ? total * usage
        : undefined);
  return { used, total };
}

function readFirstNumber(
  record: Record<string, unknown> | undefined,
  keys: readonly string[],
) {
  for (const key of keys) {
    const value = readNumber(record, key);
    if (value !== undefined) return value;
  }
}

function sumDefined(values: readonly (number | undefined)[]) {
  const numbers = values.filter((value): value is number => value !== undefined);
  if (numbers.length === 0) return;
  return numbers.reduce((sum, value) => sum + value, 0);
}

function normalizeInstancePage(payload: unknown, node: NodeStatus, publicHost?: string) {
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
      .map((item) => normalizeInstance(item, node, publicHost))
      .filter((instance): instance is MinecraftInstance => Boolean(instance)),
  };
}

function normalizeInstance(item: Record<string, unknown>, node: NodeStatus, publicHost?: string): MinecraftInstance | undefined {
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
    address: readPingAddress(config, info, publicHost) ?? readServerAddress(config) ?? readServerAddress(info) ?? readServerAddress(item),
    iconUrl: readImageSource(config) ?? readImageSource(info) ?? readImageSource(item),
    onlinePlayers: readNumber(info, "currentPlayers") ?? readNumber(item, "onlinePlayers") ?? readNumber(item, "currentPlayers"),
    maxPlayers: readNumber(info, "maxPlayers") ?? readNumber(item, "maxPlayers"),
    version: readString(info, "version") ?? readString(item, "version"),
    motd: readString(info, "motd") ?? readString(item, "motd"),
    modList: readStringArray(info, "modList") ?? readStringArray(item, "modList") ?? readStringArray(item, "mods") ?? [],
  };
}

function normalizeGlobalInstances(
  payload: unknown,
  nodes: NodeStatus[],
  publicHost: (node: NodeStatus) => string | undefined,
) {
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
      .map((item) => normalizeInstance(item, node, publicHost(node)))
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

function readServerAddress(record: Record<string, unknown> | undefined) {
  return readString(record, "address") ??
    readString(record, "serverAddress") ??
    readString(record, "connectAddress") ??
    readString(record, "ipAddress") ??
    formatAddress(
      readString(record, "host") ?? readString(record, "hostname") ?? readString(record, "ip"),
      readNumber(record, "port") ?? readNumber(record, "serverPort") ?? readNumber(record, "mcPort"),
    );
}

function readPingAddress(
  config: Record<string, unknown> | undefined,
  info: Record<string, unknown> | undefined,
  publicHost?: string,
) {
  const pingConfig = toRecord(config?.pingConfig);
  if (!pingConfig) return;

  const pingHost = readString(pingConfig, "ip");
  const pingPort = readNumber(pingConfig, "port");
  if (pingHost && !isLocalHost(pingHost)) return formatAddress(pingHost, pingPort);
  if (!publicHost) return pingHost ? formatAddress(pingHost, pingPort) : undefined;

  const publishedPort = findPublishedPort(config, info, pingPort);
  return formatAddress(publicHost, publishedPort ?? pingPort);
}

function findPublishedPort(
  config: Record<string, unknown> | undefined,
  info: Record<string, unknown> | undefined,
  targetPort?: number,
) {
  const fromAllocated = toArray(info?.allocatedPorts)
    .map(toRecord)
    .filter(isRecord)
    .find((entry) => {
      const protocol = readString(entry, "protocol")?.toLowerCase();
      const container = readNumber(entry, "container") ?? readNumber(entry, "PrivatePort");
      return protocol !== "udp" && (targetPort === undefined || container === targetPort);
    });
  const allocatedHost = readString(fromAllocated, "host");
  const allocatedPort = Number(allocatedHost ?? readNumber(fromAllocated, "PublicPort"));
  if (Number.isFinite(allocatedPort) && allocatedPort > 0) return allocatedPort;

  const docker = toRecord(config?.docker);
  const fromDocker = readStringArray(docker, "ports")
    ?.map(parseDockerPortMapping)
    .find((entry) => entry && entry.protocol !== "udp" && (targetPort === undefined || entry.containerPort === targetPort));
  return fromDocker?.hostPort;
}

function parseDockerPortMapping(value: string) {
  const match = value.match(/^(?:(?:[^:]+):)?(\d+):(\d+)(?:\/(\w+))?$/);
  if (!match) return;
  return {
    hostPort: Number(match[1]),
    containerPort: Number(match[2]),
    protocol: (match[3] ?? "tcp").toLowerCase(),
  };
}

function getHostFromAddress(value?: string) {
  if (!value) return;
  try {
    return new URL(value.includes("://") ? value : `http://${value}`).hostname;
  } catch {
    const bracketed = value.match(/^\[([^\]]+)]/);
    if (bracketed) return bracketed[1];
    return value.split(":")[0];
  }
}

function isLocalHost(host: string) {
  const normalized = host.toLowerCase();
  return normalized === "localhost" ||
    normalized === "0.0.0.0" ||
    normalized === "::" ||
    normalized === "::1" ||
    normalized.startsWith("127.");
}

function readImageSource(record: Record<string, unknown> | undefined) {
  const value = readString(record, "iconUrl") ??
    readString(record, "serverIcon") ??
    readString(record, "favicon") ??
    readString(record, "faviconUrl") ??
    readString(record, "icon") ??
    readString(record, "image") ??
    readString(record, "avatar");
  if (!value) return;
  if (/^(data:image\/|https?:\/\/|\/)/.test(value)) return value;
  if (/^[A-Za-z0-9+/=]+$/.test(value) && value.length > 100) {
    return `data:image/png;base64,${value}`;
  }
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

function readStringArray(record: Record<string, unknown> | undefined, key: string) {
  const value = record?.[key];
  if (!Array.isArray(value)) return;
  return value.filter((item): item is string => typeof item === "string");
}

async function mapConcurrent<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T) => Promise<R>,
) {
  const results = new Array<R>(items.length);
  let index = 0;

  async function worker() {
    while (index < items.length) {
      const current = index++;
      results[current] = await mapper(items[current]);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, worker),
  );
  return results;
}
