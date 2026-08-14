import type { Context } from "koishi";
import type {
  ConnectionConfig,
  LatencyFallbackServiceConfig,
  MinecraftConfig,
} from "./config";
import { parseMinecraftListOutput } from "./minecraft-list-output";
import { queryMinecraftFullStat } from "./minecraft-query";
import { parseMinecraftAddress, queryMinecraftStatus, type MinecraftStatus } from "./minecraft-status";
import {
  captureMarkedLogLines,
  describeMarkedLogCapture,
  limitOutput,
  logContainsMarkerSince,
  stripMinecraftLogPrefixes,
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
type MinecraftPlayerListCacheValue = MinecraftPlayerListSnapshot | null;
export type InstanceOperationName = "exec" | "start" | "stop" | "restart" | "kill";

type InstanceOperationLock = {
  operation: InstanceOperationName;
  token: symbol;
};

const PLAYER_LIST_COMMAND = "list";
const PLAYER_LIST_CONCURRENCY = 3;
const PLAYER_LIST_MAX_RESULT_LENGTH = 20000;
const PLAYER_LIST_QUERY_WAIT_MS = 600;
const SECOND_MS = 1000;
const LATENCY_CACHE_BUSTER_PARAM = "_mcsm_ts";
const COMMAND_OUTPUT_LOG_SIZE = 65536;
const COMMAND_LOG_WINDOW_LINES = 10000;
const COMMAND_OUTPUT_WAIT_MS = 20000;
const COMMAND_OUTPUT_POLL_INTERVAL_MS = 500;
const COMMAND_MARKER_SETTLE_MS = 1000;
const COMMAND_MARKER_NAMESPACE = "mcsm_portal";
const MINECRAFT_PROPERTIES_FILE = "server.properties";
const MINECRAFT_PROPERTIES_TYPE = "properties";
const ERROR_DETAIL_MAX_LENGTH = 300;
const ERROR_DETAIL_MAX_DEPTH = 2;
const AMBIGUOUS_NETWORK_ERROR_CODES = new Set([
  "ECONNABORTED",
  "ECONNREFUSED",
  "ECONNRESET",
  "EAI_AGAIN",
  "ENETDOWN",
  "ENETUNREACH",
  "ENOTFOUND",
  "EPIPE",
  "ERR_NETWORK",
  "ETIMEDOUT",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_HEADERS_TIMEOUT",
  "UND_ERR_SOCKET",
]);

export class MCSManagerClient {
  private nodesCache?: CacheEntry<NodeStatus[]>;
  private minecraftInstancesCache?: CacheEntry<MinecraftInstance[]>;
  private minecraftPlayerListCache = new Map<string, CacheEntry<MinecraftPlayerListCacheValue>>();
  private latencyFallbackCache = new Map<string, CacheEntry<number>>();
  private instanceCommandQueues = new Map<string, Promise<unknown>>();
  private activeInstanceOperations = new Map<string, InstanceOperationLock>();
  private globalInstanceEndpointUnavailable = false;

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

  async listMinecraftInstances(fresh = false) {
    const cached = fresh ? undefined : this.readCache(this.minecraftInstancesCache);
    if (cached) {
      this.debug("minecraft instances cache hit", { count: cached.length });
      return cached;
    }

    const startedAt = Date.now();
    const nodes = await this.listNodes();
    const allInstances = await this.listInstances(nodes);
    const loadedAt = Date.now();
    const instances = await this.enrichMinecraftInstances(
      allInstances.filter((instance) => this.isMinecraftInstance(instance)),
      nodes,
    );
    const enrichedAt = Date.now();
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
    this.debug("minecraft instances timings", {
      loadMs: loadedAt - startedAt,
      enrichMs: enrichedAt - loadedAt,
      totalMs: enrichedAt - startedAt,
    });

    this.minecraftInstancesCache = this.writeCache(instances);
    return instances;
  }

  async listInstances(knownNodes?: NodeStatus[]) {
    const nodes = knownNodes ?? await this.listNodes();
    if (!this.globalInstanceEndpointUnavailable) {
      try {
        const fromGlobal = await this.listInstancesGlobal(nodes);
        this.debug("global instance endpoint loaded", { count: fromGlobal.length });
        if (fromGlobal.length) return fromGlobal;
      } catch (error) {
        const message = formatErrorMessage(error);
        const errorRecord = toRecord(error);
        const responseRecord = toRecord(errorRecord?.response);
        const status = readNumber(errorRecord, "status") ?? readNumber(responseRecord, "status");
        const normalizedMessage = message.trim().toLowerCase();
        const endpointUnavailable = status === 404
          || normalizedMessage === "not found"
          || /\b(?:http(?: status)?|status(?: code)?|returned)\s+404\b/i.test(message);
        if (endpointUnavailable) {
          this.globalInstanceEndpointUnavailable = true;
          this.debug("global instance endpoint unavailable, using per-node queries", { message });
        } else {
          this.ctx.logger("mcsm-portal-pro").warn(
            "global instance endpoint failed, falling back to per-node queries: %s",
            message,
          );
        }
      }
    }

    this.debug("loading instances per node", { nodes: nodes.map((node) => node.id) });
    const batches = await Promise.all(nodes.map((node) => this.listInstancesByNode(node)));
    const instances = batches.flat();
    this.debug("per-node instances loaded", { count: instances.length });
    return instances;
  }

  async getFreshMinecraftInstance(instance: MinecraftInstance, deadline?: number) {
    if (!instance.nodeId) return;
    const node: NodeStatus = {
      id: instance.nodeId,
      name: instance.nodeName ?? instance.nodeId,
      online: true,
    };
    const instances = await this.listInstancesByNode(node, instance.name, deadline);
    const fresh = instances.find((candidate) => candidate.id === instance.id);
    return fresh ? { ...instance, ...fresh, address: fresh.address ?? instance.address } : undefined;
  }

  async pingMinecraftInstance(instance: MinecraftInstance, deadline?: number) {
    if (!instance.address) throw new Error("Minecraft server address is missing.");
    await queryMinecraftStatus(
      instance.address,
      resolveRequestTimeout(Math.min(this.config.timeout, 3000), deadline),
    );
  }

  async operateInstance(
    instance: MinecraftInstance,
    operation: Exclude<InstanceOperationName, "exec">,
    deadline?: number,
  ) {
    if (!instance.nodeId) throw new Error("MCSManager daemon ID is missing for this instance.");
    const endpoint = operation === "start" ? "open" : operation;
    await this.request<unknown>(
      `/api/protected_instance/${endpoint}`,
      {
        daemonId: instance.nodeId,
        uuid: instance.id,
      },
      resolveRequestTimeout(this.config.timeout, deadline),
    );
  }

  tryAcquireInstanceOperation(
    instance: MinecraftInstance,
    operation: InstanceOperationName,
  ) {
    const key = getInstanceCommandKey(instance);
    const active = this.activeInstanceOperations.get(key);
    if (active) return { acquired: false as const, operation: active.operation };

    const token = Symbol(operation);
    this.activeInstanceOperations.set(key, { operation, token });
    return {
      acquired: true as const,
      release: () => {
        if (this.activeInstanceOperations.get(key)?.token === token) {
          this.activeInstanceOperations.delete(key);
        }
      },
    };
  }

  invalidateMinecraftInstanceCache() {
    this.minecraftInstancesCache = undefined;
    this.minecraftPlayerListCache.clear();
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

    return limitOutput(stripMinecraftLogPrefixes(lines).join("\n").trim(), maxLength);
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
    this.invalidateMinecraftInstanceCache();
    this.latencyFallbackCache.clear();
    this.debug("cache cleared");
  }

  async request<T>(
    path: string,
    params: Record<string, string | number | boolean> = {},
    timeout = this.config.timeout,
  ) {
    this.assertConfigured();
    const startedAt = Date.now();

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
        timeout,
      });

      const payload = unwrapResponse<T>(response);
      this.debug("request success", {
        path,
        ms: Date.now() - startedAt,
        payload: describePayload(payload),
      });
      return payload;
    } catch (error) {
      const failure = describeRequestError(error);
      this.debug("request failed", {
        path,
        ms: Date.now() - startedAt,
        message: formatErrorMessage(failure),
      });
      throw failure;
    }
  }

  private async listInstancesByNode(
    node: NodeStatus,
    instanceName = "",
    deadline?: number,
  ) {
    const pageSize = this.minecraft.pageSize;
    const instances: MinecraftInstance[] = [];
    let page = 1;
    let hasNextPage = true;

    while (hasNextPage && page <= 100) {
      const payload = await this.request<unknown>(
        "/api/service/remote_service_instances",
        {
          daemonId: node.id,
          page,
          page_size: pageSize,
          instance_name: instanceName,
          status: "",
          tag: "[]",
        },
        resolveRequestTimeout(this.config.timeout, deadline),
      );
      const result = normalizeInstancePage(payload, node);
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

  private async enrichMinecraftInstances(
    instances: MinecraftInstance[],
    nodes: NodeStatus[],
  ) {
    const timeout = Math.min(this.config.timeout, 3000);
    const peerHosts = findUniquePeerHosts(
      instances,
      [this.config.endpoint, ...nodes.map((node) => node.address)],
    );
    return mapConcurrent(instances, 6, async (instance) => {
      if (instance.status !== "running") return instance;

      const inferred = !instance.address;
      const address = instance.address ?? await this.inferMinecraftAddress(
        instance,
        instance.nodeId ? peerHosts.get(instance.nodeId) : undefined,
      );
      if (!address) return instance;

      const startedAt = Date.now();
      try {
        const status = await queryMinecraftStatus(address, timeout);
        const resolvedInstance = inferred ? { ...instance, address } : instance;
        const latencyMs = await this.resolveLatency(resolvedInstance, status.latencyMs, timeout);
        const playerNames = readCompleteStatusPlayerNames(status);
        this.debug("minecraft status query result", {
          id: instance.id,
          name: instance.name,
          address,
          inferred,
          ms: Date.now() - startedAt,
          statusLatencyMs: status.latencyMs,
          latencyMs,
          samplePlayers: status.samplePlayerNames?.length,
          sampleComplete: playerNames !== undefined,
        });
        return {
          ...instance,
          address,
          onlinePlayers: status.onlinePlayers ?? instance.onlinePlayers,
          maxPlayers: status.maxPlayers ?? instance.maxPlayers,
          playerNames: playerNames ?? instance.playerNames,
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
          address,
          inferred,
          ms: Date.now() - startedAt,
          message: formatErrorMessage(error),
        });
        return instance;
      }
    });
  }

  private async inferMinecraftAddress(
    instance: MinecraftInstance,
    peerHost?: string,
  ) {
    if (!instance.nodeId || !peerHost) return;

    try {
      const properties = await this.request<unknown>(
        "/api/protected_instance/process_config/file",
        {
          daemonId: instance.nodeId,
          uuid: instance.id,
          fileName: MINECRAFT_PROPERTIES_FILE,
          type: MINECRAFT_PROPERTIES_TYPE,
        },
      );
      const port = readMinecraftServerPort(properties);
      if (!port) {
        this.debug("minecraft address inference skipped", {
          id: instance.id,
          name: instance.name,
          reason: "server-port is missing or invalid",
        });
        return;
      }
      return formatAddress(peerHost, port);
    } catch (error) {
      this.debug("minecraft address inference failed", {
        id: instance.id,
        name: instance.name,
        message: formatErrorMessage(error),
      });
    }
  }

  async enrichMinecraftPlayerLists(instances: MinecraftInstance[]) {
    return mapConcurrent(instances, PLAYER_LIST_CONCURRENCY, async (instance) => {
      if (instance.status !== "running") {
        return instance;
      }
      const cacheKey = getInstanceCommandKey(instance);
      const cached = this.readCache(this.minecraftPlayerListCache.get(cacheKey));
      if (cached !== undefined) {
        if (cached === null) return instance;
        return { ...instance, ...cached };
      }

      const startedAt = Date.now();
      const result = await this.resolveMinecraftPlayerList(instance);
      const entry = this.writeCache<MinecraftPlayerListCacheValue>(result?.snapshot ?? null);
      if (entry) this.minecraftPlayerListCache.set(cacheKey, entry);
      if (result) {
        this.debug("minecraft player list result", {
          id: instance.id,
          name: instance.name,
          source: result.source,
          ms: Date.now() - startedAt,
          players: result.snapshot.onlinePlayers,
          playerNames: result.snapshot.playerNames?.length,
        });
        return { ...instance, ...result.snapshot };
      }
      this.debug("minecraft player list unavailable", {
        id: instance.id,
        name: instance.name,
        ms: Date.now() - startedAt,
      });
      return instance;
    });
  }

  private async resolveMinecraftPlayerList(instance: MinecraftInstance) {
    const statusSnapshot = readCompleteInstancePlayerList(instance);
    if (statusSnapshot) return { source: "status" as const, snapshot: statusSnapshot };

    if (instance.address) {
      try {
        const snapshot = await this.queryMinecraftPlayerList(instance);
        if (snapshot) return { source: "query" as const, snapshot };
      } catch (error) {
        this.debug("minecraft query player list failed", {
          id: instance.id,
          name: instance.name,
          address: instance.address,
          message: formatErrorMessage(error),
        });
      }
    }

    if (!instance.nodeId) return;
    try {
      const snapshot = await this.queryTerminalPlayerList(instance);
      if (snapshot) return { source: "terminal" as const, snapshot };
    } catch (error) {
      this.ctx.logger("mcsm-portal-pro").warn(
        "minecraft list command failed: instance=%s name=%s message=%s",
        instance.id,
        instance.name,
        formatErrorMessage(error),
      );
    }
  }

  private async queryMinecraftPlayerList(instance: MinecraftInstance) {
    const timeout = Math.min(this.config.timeout, PLAYER_LIST_QUERY_WAIT_MS);
    const result = await queryMinecraftFullStat(instance.address!, timeout);
    if (result.onlinePlayers === 0) {
      return {
        onlinePlayers: 0,
        maxPlayers: result.maxPlayers ?? instance.maxPlayers,
        playerNames: [],
      };
    }
    if (!result.playerNames?.length) return;

    return {
      onlinePlayers: result.onlinePlayers ?? result.playerNames.length,
      maxPlayers: result.maxPlayers ?? instance.maxPlayers,
      playerNames: result.playerNames,
    };
  }

  private async queryTerminalPlayerList(instance: MinecraftInstance) {
    const output = await this.executeInstanceCommand(
      instance,
      PLAYER_LIST_COMMAND,
      PLAYER_LIST_MAX_RESULT_LENGTH,
    );
    const list = parseMinecraftListOutput(output);
    if (!list) return;
    return {
      onlinePlayers: list.onlinePlayers ?? instance.onlinePlayers,
      maxPlayers: list.maxPlayers ?? instance.maxPlayers,
      playerNames: list.playerNames,
    };
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
      const entry = this.writeCache(
        latencyMs,
        this.minecraft.latencyCacheTtl * SECOND_MS,
      );
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
    const url = new URL(createLatencyTestingServiceUrl(service.url, address));
    url.searchParams.set(LATENCY_CACHE_BUSTER_PARAM, String(Date.now()));
    const response = await this.ctx.http.get<unknown>(url.toString(), { timeout });
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
    if (entry.expiresAt <= Date.now()) return;
    return entry.value;
  }

  private writeCache<T>(value: T, ttlMs = this.cacheTtl * SECOND_MS): CacheEntry<T> | undefined {
    if (ttlMs <= 0) return;
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

function readCompleteStatusPlayerNames(status: MinecraftStatus) {
  if (status.onlinePlayers === 0) return [];
  const sample = status.samplePlayerNames;
  if (!sample?.length || sample.length !== status.onlinePlayers) return;
  return sample;
}

function readCompleteInstancePlayerList(instance: MinecraftInstance): MinecraftPlayerListSnapshot | undefined {
  if (instance.onlinePlayers === 0) {
    return {
      onlinePlayers: 0,
      maxPlayers: instance.maxPlayers,
      playerNames: [],
    };
  }
  if (!instance.playerNames?.length || instance.playerNames.length !== instance.onlinePlayers) return;
  return {
    onlinePlayers: instance.onlinePlayers,
    maxPlayers: instance.maxPlayers,
    playerNames: instance.playerNames,
  };
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
    const error = new Error(message) as Error & { status: number };
    error.status = status;
    throw error;
  }

  if (!("data" in response)) return response as T;
  return response.data as T;
}

export function isAmbiguousMCSManagerError(error: unknown) {
  let current: unknown = error;
  for (let depth = 0; depth < 4 && current; depth += 1) {
    const record = toRecord(current);
    const response = toRecord(record?.response);
    const status = readNumber(record, "status") ??
      readNumber(record, "statusCode") ??
      readNumber(response, "status") ??
      readNumber(response, "statusCode");
    if (status !== undefined) return status >= 500;

    const code = readString(record, "code") ?? readString(response, "code");
    if (code && AMBIGUOUS_NETWORK_ERROR_CODES.has(code.toUpperCase())) return true;
    const message = current instanceof Error
      ? current.message
      : readString(record, "message") ?? "";
    if (/network error|fetch failed|socket hang up|timed?\s*out|connection reset/i.test(message)) {
      return true;
    }
    current = record?.cause;
  }
  return false;
}

function resolveRequestTimeout(configuredTimeout: number, deadline?: number) {
  if (deadline === undefined) return configuredTimeout;
  const remaining = deadline - Date.now();
  if (remaining <= 0) {
    const error = new Error("Instance operation timed out.") as Error & { code: string };
    error.code = "ETIMEDOUT";
    throw error;
  }
  return Math.max(1, Math.min(configuredTimeout, remaining));
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

// MCSManager answers rejected requests with a bare HTTP status such as 403 Forbidden and
// explains the real reason in the response body, so the body is appended to the error message.
function describeRequestError(error: unknown) {
  if (!(error instanceof Error)) return error;
  const detail = readResponseErrorDetail(error);
  if (!detail) return error;

  const message = error.message.trim();
  if (message.includes(detail)) return error;
  error.message = message ? `${message}: ${detail}` : detail;
  return error;
}

function readResponseErrorDetail(error: Error) {
  const record = toRecord(error);
  const response = toRecord(record?.response);
  return readErrorDetailText(response?.data) ?? readErrorDetailText(record?.data);
}

function readErrorDetailText(value: unknown, depth = 0): string | undefined {
  if (depth > ERROR_DETAIL_MAX_DEPTH) return;

  if (typeof value === "string") {
    const text = value.trim();
    if (!text) return;
    const parsed = parseJsonBody(text);
    if (parsed !== undefined) return readErrorDetailText(parsed, depth + 1);
    // Reverse proxies answer with HTML error pages that are noise in chat output.
    if (text.startsWith("<")) return;
    return normalizeErrorDetailText(text);
  }

  const record = toRecord(value);
  const message = readString(record, "data") ??
    readString(record, "message") ??
    readString(record, "error");
  return message ? normalizeErrorDetailText(message) : undefined;
}

function parseJsonBody(text: string) {
  if (!/^[[{"]/.test(text)) return;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return;
  }
}

function normalizeErrorDetailText(value: string) {
  const text = value.replace(/\s+/g, " ").trim();
  if (!text) return;
  return text.length > ERROR_DETAIL_MAX_LENGTH
    ? `${text.slice(0, ERROR_DETAIL_MAX_LENGTH)}…`
    : text;
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
    address: readPingAddress(config) ?? readServerAddress(config) ?? readServerAddress(info) ?? readServerAddress(item),
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

function findUniquePeerHosts(
  instances: MinecraftInstance[],
  excludedAddresses: (string | undefined)[],
) {
  const excludedHosts = new Set(
    excludedAddresses
      .map(getHostFromAddress)
      .filter((host): host is string => Boolean(host))
      .map((host) => host.toLowerCase()),
  );
  const hostsByNode = new Map<string, Set<string>>();

  for (const instance of instances) {
    if (!instance.nodeId || !instance.address) continue;
    const host = getHostFromAddress(instance.address);
    if (!host || !isPublicGameHost(host) || excludedHosts.has(host.toLowerCase())) continue;
    const hosts = hostsByNode.get(instance.nodeId) ?? new Set<string>();
    hosts.add(host);
    hostsByNode.set(instance.nodeId, hosts);
  }

  return new Map(
    [...hostsByNode]
      .filter(([, hosts]) => hosts.size === 1)
      .map(([nodeId, hosts]) => [nodeId, [...hosts][0]]),
  );
}

function readMinecraftServerPort(value: unknown) {
  const properties = toRecord(value);
  const raw = properties?.["server-port"];
  const port = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isInteger(port) || port < 1 || port > 65535) return;
  return port;
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

function readPingAddress(config: Record<string, unknown> | undefined) {
  const pingConfig = toRecord(config?.pingConfig);
  if (!pingConfig) return;

  const pingHost = readString(pingConfig, "ip");
  const pingPort = readNumber(pingConfig, "port");
  if (pingHost && !isLocalHost(pingHost)) return formatAddress(pingHost, pingPort);
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

function isPublicGameHost(host: string) {
  const normalized = host.toLowerCase();
  if (isLocalHost(normalized) || normalized.endsWith(".local")) return false;
  if (/^10\./.test(normalized) || /^192\.168\./.test(normalized)) return false;

  const private172 = normalized.match(/^172\.(\d+)\./);
  if (private172 && Number(private172[1]) >= 16 && Number(private172[1]) <= 31) return false;
  if (/^(?:169\.254|100\.(?:6[4-9]|[78]\d|9\d|1[01]\d|12[0-7]))\./.test(normalized)) return false;
  if (/^(?:fc|fd|fe8|fe9|fea|feb)[0-9a-f]*:/i.test(normalized)) return false;
  return true;
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
