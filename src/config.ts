import { Schema } from "koishi";
import { CONFIG_LOCALES } from "./config.locales";
import {
  INSTANCE_STATUSES,
  type InstanceStatus,
  type ServerFieldVisibility,
} from "./types";
import {
  listBackgroundTextureNames,
  RANDOM_BACKGROUND_TEXTURE,
} from "./visualization/styles";

type RecursivePartial<T> =
  T extends Array<infer U>
    ? RecursivePartial<U>[]
    : T extends object
      ? { [K in keyof T]?: RecursivePartial<T[K]> }
      : T;

export interface ConnectionConfig {
  endpoint: string;
  apiKey: string;
  apiKeyParam: string;
  timeout: number;
}

export interface CommandConfig {
  name: string;
  authority: number;
}

export interface ImageConfig {
  nodeTitle: string;
  serverTitle: string;
  width: number;
  backgroundTexture: string;
  showGeneratedAt: boolean;
  puppeteer: boolean;
  renderScale: number;
}

export interface TextConfig {
  style: "compact" | "detailed";
  showHeader: boolean;
  showSeparators: boolean;
}

export interface OutputConfig {
  mode: "text" | "image";
  text: TextConfig;
}

export interface PreviewConfig {
  enabled: boolean;
}

export interface ReactionMirrorConfig {
  enabled: boolean;
  emojis: string[];
  dedupeTtl: number;
  ignoreSelf: boolean;
}

export interface AvatarDoubleTapConfig {
  enabled: boolean;
  cooldown: number;
}

export interface QQInteractionsConfig {
  reactionMirror: ReactionMirrorConfig;
  avatarDoubleTap: AvatarDoubleTapConfig;
}

export interface LatencyFallbackServiceConfig {
  name: string;
  url: string;
}

export interface MinecraftConfig {
  pageSize: number;
  typeKeywords: string[];
  defaultStatuses: InstanceStatus[];
  latencyFallback: LatencyFallbackServiceConfig[];
  latencyFallbackStrategy: "random" | "fallback" | "average";
  latencyFallbackTrigger: "missing" | "local" | "always";
  latencyFallbackLocalThreshold: number;
  latencyFallbackKeys: string[];
}

export interface CommandExecutionVotingConfig {
  enabled: boolean;
  approveCount: number;
  timeout: number;
  presentation: "auto" | "qq-button" | "image";
  command: string;
}

export interface CommandExecutionConfig {
  enabled: boolean;
  authority: number;
  selectionTimeout: number;
  commandTimeout: number;
  maxResultLength: number;
  voting: CommandExecutionVotingConfig;
}

export interface ErrorMessagesConfig {
  serversFailed: string;
  execFailed: string;
}

export interface Config {
  title: string;
  connection: ConnectionConfig;
  command: CommandConfig;
  image: ImageConfig;
  output: OutputConfig;
  preview: PreviewConfig;
  qqInteractions: QQInteractionsConfig;
  minecraft: MinecraftConfig;
  commandExecution: CommandExecutionConfig;
  errorMessages: ErrorMessagesConfig;
  fields: ServerFieldVisibility;
  cacheTtl: number;
  debug: boolean;
}

export type ConfigInput = RecursivePartial<Config>;

export const PORTAL_IMAGE_BRAND = "MCSM Portal";
export const DEFAULT_COPYRIGHT_TEXT =
  "Powered by §dKoishi§7 - §rMade by §aKrLite";
export const DEFAULT_NODE_IMAGE_TITLE = "Daemon Node Status";
export const DEFAULT_SERVER_IMAGE_TITLE = "Play Multiplayer";

const DEFAULT_BACKGROUND_TEXTURE = createDefaultBackgroundTexture();
const DEFAULT_CONNECTION_CONFIG: ConnectionConfig = {
  endpoint: "",
  apiKey: "",
  apiKeyParam: "apikey",
  timeout: 10000,
};
const DEFAULT_COMMAND_CONFIG: CommandConfig = {
  name: "mcsm",
  authority: 1,
};
const DEFAULT_IMAGE_CONFIG: ImageConfig = {
  nodeTitle: DEFAULT_NODE_IMAGE_TITLE,
  serverTitle: DEFAULT_SERVER_IMAGE_TITLE,
  width: 854,
  backgroundTexture: DEFAULT_BACKGROUND_TEXTURE,
  showGeneratedAt: true,
  puppeteer: true,
  renderScale: 2,
};
const DEFAULT_TEXT_CONFIG: TextConfig = {
  style: "detailed",
  showHeader: true,
  showSeparators: true,
};
const DEFAULT_OUTPUT_CONFIG: OutputConfig = {
  mode: "text",
  text: DEFAULT_TEXT_CONFIG,
};
const DEFAULT_PREVIEW_CONFIG: PreviewConfig = {
  enabled: false,
};
const DEFAULT_QQ_INTERACTIONS_CONFIG: QQInteractionsConfig = {
  reactionMirror: {
    enabled: false,
    emojis: [],
    dedupeTtl: 10000,
    ignoreSelf: true,
  },
  avatarDoubleTap: {
    enabled: false,
    cooldown: 1000,
  },
};
const DEFAULT_MINECRAFT_CONFIG: MinecraftConfig = {
  pageSize: 50,
  typeKeywords: ["minecraft"],
  defaultStatuses: ["running"],
  latencyFallback: [],
  latencyFallbackStrategy: "fallback",
  latencyFallbackTrigger: "local",
  latencyFallbackLocalThreshold: 10,
  latencyFallbackKeys: [
    "latencyMs",
    "latency",
    "pingMs",
    "ping",
    "delay",
    "ms",
    "data.latencyMs",
    "data.latency",
    "data.pingMs",
    "data.ping",
    "data.delay",
    "data.ms",
    "result.latencyMs",
    "result.latency",
    "result.pingMs",
    "result.ping",
    "result.delay",
    "result.ms",
  ],
};
const DEFAULT_COMMAND_EXECUTION_CONFIG: CommandExecutionConfig = {
  enabled: true,
  authority: 3,
  selectionTimeout: 60000,
  commandTimeout: 60000,
  maxResultLength: 1800,
  voting: {
    enabled: false,
    approveCount: 2,
    timeout: 60000,
    presentation: "auto",
    command: "mcsm.vote",
  },
};
const DEFAULT_ERROR_MESSAGES_CONFIG: ErrorMessagesConfig = {
  serversFailed: "",
  execFailed: "",
};
const DEFAULT_FIELDS_CONFIG: ServerFieldVisibility = {
  address: true,
  onlineCount: true,
  playerNames: true,
  status: true,
  node: true,
  version: true,
  motd: true,
  modList: true,
};

export const Config = Schema.intersect([
  Schema.object({
    title: Schema.string()
      .description("Global title shown at the top of generated images.")
      .default(PORTAL_IMAGE_BRAND),
    connection: Schema.object({
      endpoint: Schema.string()
        .description(
          "MCSManager panel API endpoint, for example http://my-server-ip:23333.",
        )
        .default(DEFAULT_CONNECTION_CONFIG.endpoint),
      apiKey: Schema.string()
        .role("secret")
        .description("MCSManager API key.")
        .default(DEFAULT_CONNECTION_CONFIG.apiKey),
      apiKeyParam: Schema.string()
        .description(
          "Query parameter name used to send the API key.",
        )
        .default(DEFAULT_CONNECTION_CONFIG.apiKeyParam),
      timeout: Schema.number()
        .description(
          "Request timeout in milliseconds.",
        )
        .min(1000)
        .default(DEFAULT_CONNECTION_CONFIG.timeout),
    })
      .default(emptyObjectDefault<ConnectionConfig>())
      .description("MCSManager connection"),
    command: Schema.object({
      name: Schema.string()
        .description("Root command name.")
        .default(DEFAULT_COMMAND_CONFIG.name),
      authority: Schema.number()
        .description(
          "Minimum authority required to use portal commands.",
        )
        .min(0)
        .max(5)
        .default(DEFAULT_COMMAND_CONFIG.authority),
    })
      .default(emptyObjectDefault<CommandConfig>())
      .description("Command settings"),
  }).description("连接与命令"),
  Schema.object({
    image: Schema.object({
    nodeTitle: Schema.string()
      .description(
        "Title displayed below the global title in node status images.",
      )
      .default(DEFAULT_IMAGE_CONFIG.nodeTitle),
    serverTitle: Schema.string()
      .description(
        "Title displayed below the global title in server list images.",
      )
      .default(DEFAULT_IMAGE_CONFIG.serverTitle),
    width: Schema.number()
      .description(
        "Generated image width in pixels.",
      )
      .min(640)
      .max(1600)
      .default(DEFAULT_IMAGE_CONFIG.width),
    backgroundTexture: createBackgroundTextureSchema(),
    showGeneratedAt: Schema.boolean()
      .description(
        "Show generated time in image outputs.",
      )
      .default(DEFAULT_IMAGE_CONFIG.showGeneratedAt),
    puppeteer: Schema.boolean()
      .description(
        "Render image outputs with the optional Puppeteer service. This produces PNG images, avoids adapter issues with SVG data URIs, and enables render scaling for sharper output. Disable to force SVG output.",
      )
      .default(DEFAULT_IMAGE_CONFIG.puppeteer),
    renderScale: Schema.number()
      .description(
        "Puppeteer PNG render scale. Higher values are sharper but produce larger images.",
      )
      .min(1)
      .max(4)
      .step(0.5)
      .default(DEFAULT_IMAGE_CONFIG.renderScale),
  })
    .default(emptyObjectDefault<ImageConfig>())
    .description("Image settings")
    .collapse(),
  output: Schema.object({
    mode: Schema.union([
      Schema.const("text").description("Text"),
      Schema.const("image").description("Image"),
    ] as const)
      .description("Bot result output mode.")
      .default(DEFAULT_OUTPUT_CONFIG.mode),
    text: Schema.object({
      style: Schema.union([
        Schema.const("compact").description("Compact"),
        Schema.const("detailed").description("Detailed"),
      ] as const)
        .description("Text message formatting style.")
        .default(DEFAULT_TEXT_CONFIG.style),
      showHeader: Schema.boolean()
        .description("Show title and summary lines in text output.")
        .default(DEFAULT_TEXT_CONFIG.showHeader),
      showSeparators: Schema.boolean()
        .description("Separate text cards with blank lines.")
        .default(DEFAULT_TEXT_CONFIG.showSeparators),
    })
      .default(emptyObjectDefault<TextConfig>())
      .description("Text output settings")
      .collapse(),
  })
    .default(emptyObjectDefault<OutputConfig>())
    .description("Output settings"),
  preview: Schema.object({
    enabled: Schema.boolean()
      .description(
        "Register the code-authored visualization preview page in Koishi Console when available.",
      )
      .default(DEFAULT_PREVIEW_CONFIG.enabled),
  })
    .default(emptyObjectDefault<PreviewConfig>())
    .description("Visualization preview")
    .collapse(),
  }).description("显示输出"),
  Schema.object({
    minecraft: Schema.object({
      pageSize: Schema.number()
        .description(
          "Number of instances to request from each MCSManager node per page.",
        )
        .min(1)
        .max(50)
        .default(DEFAULT_MINECRAFT_CONFIG.pageSize),
      typeKeywords: Schema.array(Schema.string())
        .description("Instance type keywords treated as Minecraft servers.")
        .default(DEFAULT_MINECRAFT_CONFIG.typeKeywords),
      defaultStatuses: Schema.array(createInstanceStatusSchema())
        .description("Instance statuses shown by server list commands when no status filter is provided. Leave empty to show all statuses.")
        .default(DEFAULT_MINECRAFT_CONFIG.defaultStatuses),
      latencyFallback: Schema.array(
        Schema.object({
          name: Schema.string()
            .description("Display name for this latency testing service.")
            .default(""),
          url: Schema.string()
            .description(
              "Latency testing service URL template. Supports {address}, {host}, and {port}.",
            )
            .default(""),
        }),
      )
        .description("Remote latency testing services.")
        .default(DEFAULT_MINECRAFT_CONFIG.latencyFallback),
      latencyFallbackStrategy: Schema.union([
        Schema.const("fallback").description(
          "Use services in order; try the next one if one fails or times out",
        ),
        Schema.const("random").description("Pick one service randomly"),
        Schema.const("average").description(
          "Query all services and average successful non-timeout results",
        ),
      ] as const)
        .description("How multiple latency testing services are selected.")
        .default(DEFAULT_MINECRAFT_CONFIG.latencyFallbackStrategy),
      latencyFallbackTrigger: Schema.union([
        Schema.const("missing").description(
          "Only when Minecraft status latency is missing",
        ),
        Schema.const("local").description(
          "When latency is missing or looks local/useless",
        ),
        Schema.const("always").description(
          "Always use testing services when possible",
        ),
      ] as const)
        .description("When to use remote latency testing services.")
        .default(DEFAULT_MINECRAFT_CONFIG.latencyFallbackTrigger),
      latencyFallbackLocalThreshold: Schema.number()
        .description(
          "Latency at or below this value, in milliseconds, is treated as local/useless.",
        )
        .min(0)
        .default(DEFAULT_MINECRAFT_CONFIG.latencyFallbackLocalThreshold),
      latencyFallbackKeys: Schema.array(Schema.string())
        .description(
          "Response key paths used to read latency from service JSON. Dot paths are supported, for example data.ping.",
        )
        .default(DEFAULT_MINECRAFT_CONFIG.latencyFallbackKeys),
    })
      .default(emptyObjectDefault<MinecraftConfig>())
      .description("Minecraft instance discovery")
      .collapse(),
    fields: Schema.object({
      address: Schema.boolean()
        .default(DEFAULT_FIELDS_CONFIG.address)
        .description("Show server address."),
      onlineCount: Schema.boolean()
        .default(DEFAULT_FIELDS_CONFIG.onlineCount)
        .description("Show online player count."),
      playerNames: Schema.boolean()
        .default(DEFAULT_FIELDS_CONFIG.playerNames)
        .description("Show online player names returned by the MCSManager terminal list command."),
      status: Schema.boolean()
        .default(DEFAULT_FIELDS_CONFIG.status)
        .description("Show instance status."),
      node: Schema.boolean()
        .default(DEFAULT_FIELDS_CONFIG.node)
        .description("Show node name."),
      version: Schema.boolean()
        .default(DEFAULT_FIELDS_CONFIG.version)
        .description("Show Minecraft version."),
      motd: Schema.boolean()
        .default(DEFAULT_FIELDS_CONFIG.motd)
        .description("Show MOTD."),
      modList: Schema.boolean()
        .default(DEFAULT_FIELDS_CONFIG.modList)
        .description("Show mod list."),
    })
      .default(emptyObjectDefault<ServerFieldVisibility>())
      .description("Server list fields")
      .collapse(),
  }).description("Minecraft 服务器").collapse(),
  Schema.object({
    commandExecution: Schema.object({
      enabled: Schema.boolean()
        .description("Enable chat commands that execute through the MCSManager instance terminal.")
        .default(DEFAULT_COMMAND_EXECUTION_CONFIG.enabled),
      authority: Schema.number()
        .description("Minimum authority required to execute instance commands.")
        .min(0)
        .max(5)
        .default(DEFAULT_COMMAND_EXECUTION_CONFIG.authority),
      selectionTimeout: Schema.number()
        .description("Time to wait for interactive server selection, in milliseconds.")
        .min(1000)
        .default(DEFAULT_COMMAND_EXECUTION_CONFIG.selectionTimeout),
      commandTimeout: Schema.number()
        .description("Time to wait for interactive command input, in milliseconds.")
        .min(1000)
        .default(DEFAULT_COMMAND_EXECUTION_CONFIG.commandTimeout),
      maxResultLength: Schema.number()
        .description("Maximum terminal output length returned to chat.")
        .min(100)
        .default(DEFAULT_COMMAND_EXECUTION_CONFIG.maxResultLength),
      voting: Schema.object({
        enabled: Schema.boolean()
          .description("Require a chat vote before executing instance commands.")
          .default(DEFAULT_COMMAND_EXECUTION_CONFIG.voting.enabled),
        approveCount: Schema.number()
          .description("Number of approvals required to pass the vote.")
          .min(1)
          .default(DEFAULT_COMMAND_EXECUTION_CONFIG.voting.approveCount),
        timeout: Schema.number()
          .description("Vote timeout in milliseconds.")
          .min(1000)
          .default(DEFAULT_COMMAND_EXECUTION_CONFIG.voting.timeout),
        presentation: Schema.union([
          Schema.const("auto").description("QQ buttons when available, otherwise image"),
          Schema.const("qq-button").description("QQ official bot buttons"),
          Schema.const("image").description("Image progress"),
        ] as const)
          .description("Vote progress presentation.")
          .default(DEFAULT_COMMAND_EXECUTION_CONFIG.voting.presentation),
        command: Schema.string()
          .description("Vote command. Users reply with this command plus yes or no.")
          .default(DEFAULT_COMMAND_EXECUTION_CONFIG.voting.command),
      })
        .default(emptyObjectDefault<CommandExecutionVotingConfig>())
        .description("Execution vote")
        .collapse(),
    })
      .default(emptyObjectDefault<CommandExecutionConfig>())
      .description("Command execution")
      .collapse(),
  }).description("终端执行").collapse(),
  Schema.object({
    errorMessages: Schema.object({
      serversFailed: Schema.string()
        .role("textarea")
        .description(
          "Custom message for Minecraft server list loading failures. Supports {message}. Leave empty to use the built-in locale.",
        )
        .default(DEFAULT_ERROR_MESSAGES_CONFIG.serversFailed),
      execFailed: Schema.string()
        .role("textarea")
        .description(
          "Custom message for terminal command execution failures. Supports {message} and {name}. Leave empty to use the built-in locale.",
        )
        .default(DEFAULT_ERROR_MESSAGES_CONFIG.execFailed),
    })
      .default(emptyObjectDefault<ErrorMessagesConfig>())
      .description("Error messages")
      .collapse(),
    qqInteractions: Schema.object({
    reactionMirror: Schema.object({
      enabled: Schema.boolean()
        .description(
          "Mirror configured QQ message reactions when users add them to a message.",
        )
        .default(DEFAULT_QQ_INTERACTIONS_CONFIG.reactionMirror.enabled),
      emojis: Schema.array(Schema.string())
        .description(
          "QQ reaction emoji IDs to mirror. Supports Satori format such as 1:123, or a bare emoji ID.",
        )
        .default(DEFAULT_QQ_INTERACTIONS_CONFIG.reactionMirror.emojis),
      dedupeTtl: Schema.number()
        .description(
          "Time in milliseconds to suppress repeated mirrored reactions on the same message and emoji.",
        )
        .min(0)
        .default(DEFAULT_QQ_INTERACTIONS_CONFIG.reactionMirror.dedupeTtl),
      ignoreSelf: Schema.boolean()
        .description("Ignore reactions created by the bot itself.")
        .default(DEFAULT_QQ_INTERACTIONS_CONFIG.reactionMirror.ignoreSelf),
    })
      .default(emptyObjectDefault<ReactionMirrorConfig>())
      .description("QQ reaction mirroring"),
    avatarDoubleTap: Schema.object({
      enabled: Schema.boolean()
        .description(
          "Reply to QQ avatar double-tap notifications by double-tapping the user back. Requires a OneBot-compatible adapter that exposes notice/poke events and send_poke.",
        )
        .default(DEFAULT_QQ_INTERACTIONS_CONFIG.avatarDoubleTap.enabled),
      cooldown: Schema.number()
        .description(
          "Minimum interval in milliseconds before double-tapping the same user again.",
        )
        .min(0)
        .default(DEFAULT_QQ_INTERACTIONS_CONFIG.avatarDoubleTap.cooldown),
    })
      .default(emptyObjectDefault<AvatarDoubleTapConfig>())
      .description("QQ avatar double-tap"),
  })
    .default(emptyObjectDefault<QQInteractionsConfig>())
    .description("QQ interactions")
    .collapse(),
    cacheTtl: Schema.number()
      .description("Cache TTL for future MCSManager status queries, in seconds.")
      .min(0)
      .default(30),
    debug: Schema.boolean()
      .description("Print verbose MCSManager discovery logs for debugging.")
      .default(false),
  }).description("QQ 与高级"),
])
  .description("MCSM Portal settings")
  .i18n(CONFIG_LOCALES) as Schema<ConfigInput>;

export function createRuntimeConfig(config: ConfigInput): Config {
  return {
    title: config.title ?? PORTAL_IMAGE_BRAND,
    connection: {
      endpoint:
        config.connection?.endpoint ?? DEFAULT_CONNECTION_CONFIG.endpoint,
      apiKey: config.connection?.apiKey ?? DEFAULT_CONNECTION_CONFIG.apiKey,
      apiKeyParam:
        config.connection?.apiKeyParam ?? DEFAULT_CONNECTION_CONFIG.apiKeyParam,
      timeout: config.connection?.timeout ?? DEFAULT_CONNECTION_CONFIG.timeout,
    },
    command: {
      name: config.command?.name ?? DEFAULT_COMMAND_CONFIG.name,
      authority: config.command?.authority ?? DEFAULT_COMMAND_CONFIG.authority,
    },
    image: {
      nodeTitle: config.image?.nodeTitle ?? DEFAULT_IMAGE_CONFIG.nodeTitle,
      serverTitle:
        config.image?.serverTitle ?? DEFAULT_IMAGE_CONFIG.serverTitle,
      width: config.image?.width ?? DEFAULT_IMAGE_CONFIG.width,
      backgroundTexture:
        config.image?.backgroundTexture ??
        DEFAULT_IMAGE_CONFIG.backgroundTexture,
      showGeneratedAt:
        config.image?.showGeneratedAt ?? DEFAULT_IMAGE_CONFIG.showGeneratedAt,
      puppeteer: config.image?.puppeteer ?? DEFAULT_IMAGE_CONFIG.puppeteer,
      renderScale:
        config.image?.renderScale ?? DEFAULT_IMAGE_CONFIG.renderScale,
    },
    output: {
      mode: config.output?.mode ?? DEFAULT_OUTPUT_CONFIG.mode,
      text: {
        style: config.output?.text?.style ?? DEFAULT_TEXT_CONFIG.style,
        showHeader:
          config.output?.text?.showHeader ?? DEFAULT_TEXT_CONFIG.showHeader,
        showSeparators:
          config.output?.text?.showSeparators ??
          DEFAULT_TEXT_CONFIG.showSeparators,
      },
    },
    preview: {
      enabled: config.preview?.enabled ?? DEFAULT_PREVIEW_CONFIG.enabled,
    },
    qqInteractions: {
      reactionMirror: {
        enabled:
          config.qqInteractions?.reactionMirror?.enabled ??
          DEFAULT_QQ_INTERACTIONS_CONFIG.reactionMirror.enabled,
        emojis:
          config.qqInteractions?.reactionMirror?.emojis
            ?.map((emoji) => emoji.trim())
            .filter(Boolean) ??
          DEFAULT_QQ_INTERACTIONS_CONFIG.reactionMirror.emojis,
        dedupeTtl:
          config.qqInteractions?.reactionMirror?.dedupeTtl ??
          DEFAULT_QQ_INTERACTIONS_CONFIG.reactionMirror.dedupeTtl,
        ignoreSelf:
          config.qqInteractions?.reactionMirror?.ignoreSelf ??
          DEFAULT_QQ_INTERACTIONS_CONFIG.reactionMirror.ignoreSelf,
      },
      avatarDoubleTap: {
        enabled:
          config.qqInteractions?.avatarDoubleTap?.enabled ??
          DEFAULT_QQ_INTERACTIONS_CONFIG.avatarDoubleTap.enabled,
        cooldown:
          config.qqInteractions?.avatarDoubleTap?.cooldown ??
          DEFAULT_QQ_INTERACTIONS_CONFIG.avatarDoubleTap.cooldown,
      },
    },
    minecraft: {
      pageSize: config.minecraft?.pageSize ?? DEFAULT_MINECRAFT_CONFIG.pageSize,
      typeKeywords:
        config.minecraft?.typeKeywords ?? DEFAULT_MINECRAFT_CONFIG.typeKeywords,
      defaultStatuses: normalizeInstanceStatuses(config.minecraft?.defaultStatuses),
      latencyFallback: normalizeLatencyFallbackServices(
        config.minecraft?.latencyFallback,
      ),
      latencyFallbackStrategy:
        config.minecraft?.latencyFallbackStrategy ??
        readLegacyLatencyFallbackValue(
          config.minecraft?.latencyFallback,
          "strategy",
          DEFAULT_MINECRAFT_CONFIG.latencyFallbackStrategy,
        ),
      latencyFallbackTrigger:
        config.minecraft?.latencyFallbackTrigger ??
        readLegacyLatencyFallbackValue(
          config.minecraft?.latencyFallback,
          "trigger",
          DEFAULT_MINECRAFT_CONFIG.latencyFallbackTrigger,
        ),
      latencyFallbackLocalThreshold:
        config.minecraft?.latencyFallbackLocalThreshold ??
        readLegacyLatencyFallbackValue(
          config.minecraft?.latencyFallback,
          "localThreshold",
          DEFAULT_MINECRAFT_CONFIG.latencyFallbackLocalThreshold,
        ),
      latencyFallbackKeys:
        config.minecraft?.latencyFallbackKeys ??
        readLegacyLatencyFallbackValue(
          config.minecraft?.latencyFallback,
          "keys",
          DEFAULT_MINECRAFT_CONFIG.latencyFallbackKeys,
        ),
    },
    commandExecution: {
      enabled:
        config.commandExecution?.enabled ?? DEFAULT_COMMAND_EXECUTION_CONFIG.enabled,
      authority:
        config.commandExecution?.authority ?? DEFAULT_COMMAND_EXECUTION_CONFIG.authority,
      selectionTimeout:
        config.commandExecution?.selectionTimeout ??
        DEFAULT_COMMAND_EXECUTION_CONFIG.selectionTimeout,
      commandTimeout:
        config.commandExecution?.commandTimeout ??
        DEFAULT_COMMAND_EXECUTION_CONFIG.commandTimeout,
      maxResultLength:
        config.commandExecution?.maxResultLength ??
        DEFAULT_COMMAND_EXECUTION_CONFIG.maxResultLength,
      voting: {
        enabled:
          config.commandExecution?.voting?.enabled ??
          DEFAULT_COMMAND_EXECUTION_CONFIG.voting.enabled,
        approveCount:
          config.commandExecution?.voting?.approveCount ??
          DEFAULT_COMMAND_EXECUTION_CONFIG.voting.approveCount,
        timeout:
          config.commandExecution?.voting?.timeout ??
          DEFAULT_COMMAND_EXECUTION_CONFIG.voting.timeout,
        presentation:
          config.commandExecution?.voting?.presentation ??
          DEFAULT_COMMAND_EXECUTION_CONFIG.voting.presentation,
        command:
          config.commandExecution?.voting?.command ??
          DEFAULT_COMMAND_EXECUTION_CONFIG.voting.command,
      },
    },
    errorMessages: {
      serversFailed:
        config.errorMessages?.serversFailed ??
        DEFAULT_ERROR_MESSAGES_CONFIG.serversFailed,
      execFailed:
        config.errorMessages?.execFailed ??
        DEFAULT_ERROR_MESSAGES_CONFIG.execFailed,
    },
    fields: {
      address: config.fields?.address ?? DEFAULT_FIELDS_CONFIG.address,
      onlineCount:
        config.fields?.onlineCount ?? DEFAULT_FIELDS_CONFIG.onlineCount,
      playerNames:
        config.fields?.playerNames ?? DEFAULT_FIELDS_CONFIG.playerNames,
      status: config.fields?.status ?? DEFAULT_FIELDS_CONFIG.status,
      node: config.fields?.node ?? DEFAULT_FIELDS_CONFIG.node,
      version: config.fields?.version ?? DEFAULT_FIELDS_CONFIG.version,
      motd: config.fields?.motd ?? DEFAULT_FIELDS_CONFIG.motd,
      modList: config.fields?.modList ?? DEFAULT_FIELDS_CONFIG.modList,
    },
    cacheTtl: config.cacheTtl ?? 30,
    debug: config.debug ?? false,
  };
}

function normalizeInstanceStatuses(value: unknown): InstanceStatus[] {
  if (!Array.isArray(value)) return DEFAULT_MINECRAFT_CONFIG.defaultStatuses;
  const statuses = value.filter((status): status is InstanceStatus =>
    typeof status === "string" && (INSTANCE_STATUSES as readonly string[]).includes(status),
  );
  return [...new Set(statuses)];
}

function normalizeLatencyFallbackServices(value: unknown): LatencyFallbackServiceConfig[] {
  if (Array.isArray(value)) {
    return value.map(normalizeLatencyFallbackService);
  }

  const legacy = readRecord(value);
  const url = readString(legacy, "url");
  if (url === undefined) return DEFAULT_MINECRAFT_CONFIG.latencyFallback;
  return [{ name: "", url }];
}

function normalizeLatencyFallbackService(
  service: unknown,
): LatencyFallbackServiceConfig {
  const record = readRecord(service);
  return {
    name: readString(record, "name") ?? "",
    url: readString(record, "url") ?? "",
  };
}

function readLegacyLatencyFallbackValue<T>(
  value: unknown,
  key: string,
  fallback: T,
): T {
  const record = readRecord(value);
  if (!record || !(key in record)) return fallback;
  const legacyValue = record[key];
  return legacyValue === undefined ? fallback : (legacyValue as T);
}

function readRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function readString(record: Record<string, unknown> | undefined, key: string) {
  const value = record?.[key];
  return typeof value === "string" ? value : undefined;
}

export function resolvePortalTitle(config?: Pick<Config, "title">) {
  return config?.title?.trim() || PORTAL_IMAGE_BRAND;
}

export function resolveNodeImageTitle(config: Config) {
  return resolveSurfaceImageTitle(
    config.image.nodeTitle,
    DEFAULT_NODE_IMAGE_TITLE,
  );
}

export function resolveServerImageTitle(config: Config) {
  return resolveSurfaceImageTitle(
    config.image.serverTitle,
    DEFAULT_SERVER_IMAGE_TITLE,
  );
}

function resolveSurfaceImageTitle(
  title: string | undefined,
  defaultTitle: string,
) {
  const normalized = title?.trim();
  if (normalized && normalized !== defaultTitle) return normalized;
  return normalized || defaultTitle;
}

function createBackgroundTextureSchema() {
  const names = listBackgroundTextureNames();
  const options = [
    Schema.const("").description("None"),
    Schema.const(RANDOM_BACKGROUND_TEXTURE).description("Random"),
    ...names.map((name) => Schema.const(name).description(name)),
  ];

  return Schema.union(options)
    .description("Tiled background texture from assets/textures.")
    .default(DEFAULT_BACKGROUND_TEXTURE);
}

function createInstanceStatusSchema() {
  return Schema.union(
    INSTANCE_STATUSES.map((status) => Schema.const(status).description(status)),
  );
}

function createDefaultBackgroundTexture() {
  return listBackgroundTextureNames().includes("dirt.png") ? "dirt.png" : "";
}

function emptyObjectDefault<T extends object>() {
  return {} as T;
}
