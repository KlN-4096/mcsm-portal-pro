import { Schema } from "koishi";
import type { ServerFieldVisibility } from "./types";
import { listBackgroundTextureNames } from "./visualization/styles";

type RecursivePartial<T> = {
  [K in keyof T]?: T[K] extends object ? RecursivePartial<T[K]> : T[K];
};

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

export interface MinecraftConfig {
  pageSize: number;
  typeKeywords: string[];
}

export interface Config {
  title: string;
  connection: ConnectionConfig;
  command: CommandConfig;
  image: ImageConfig;
  output: OutputConfig;
  preview: PreviewConfig;
  minecraft: MinecraftConfig;
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
  enabled: true,
};
const DEFAULT_MINECRAFT_CONFIG: MinecraftConfig = {
  pageSize: 50,
  typeKeywords: ["minecraft"],
};
const DEFAULT_FIELDS_CONFIG: ServerFieldVisibility = {
  address: true,
  onlineCount: true,
  status: true,
  node: true,
  version: true,
  motd: true,
  modList: true,
};

export const Config = Schema.object({
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
      .description("Query parameter name used to send the API key.")
      .default(DEFAULT_CONNECTION_CONFIG.apiKeyParam),
    timeout: Schema.number()
      .description("Request timeout in milliseconds.")
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
      .description("Minimum authority required to use portal commands.")
      .min(0)
      .max(5)
      .default(DEFAULT_COMMAND_CONFIG.authority),
  })
    .default(emptyObjectDefault<CommandConfig>())
    .description("Command settings"),
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
      .description("Generated image width in pixels.")
      .min(640)
      .max(1600)
      .default(DEFAULT_IMAGE_CONFIG.width),
    backgroundTexture: createBackgroundTextureSchema(),
    showGeneratedAt: Schema.boolean()
      .description("Show generated time in image outputs.")
      .default(DEFAULT_IMAGE_CONFIG.showGeneratedAt),
  })
    .default(emptyObjectDefault<ImageConfig>())
    .description("Image settings"),
  output: Schema.object({
    mode: Schema.union([
      Schema.const("text").description("Text only"),
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
      .description("Text output settings"),
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
    .description("Visualization preview"),
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
  })
    .default(emptyObjectDefault<MinecraftConfig>())
    .description("Minecraft instance discovery"),
  fields: Schema.object({
    address: Schema.boolean()
      .default(DEFAULT_FIELDS_CONFIG.address)
      .description("Show server address."),
    onlineCount: Schema.boolean()
      .default(DEFAULT_FIELDS_CONFIG.onlineCount)
      .description("Show online player count."),
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
    .description("Server list fields"),
  cacheTtl: Schema.number()
    .description("Cache TTL for future MCSManager status queries, in seconds.")
    .min(0)
    .default(30),
  debug: Schema.boolean()
    .description("Print verbose MCSManager discovery logs for debugging.")
    .default(false),
}).description("MCSM Portal settings") as Schema<ConfigInput>;

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
    minecraft: {
      pageSize: config.minecraft?.pageSize ?? DEFAULT_MINECRAFT_CONFIG.pageSize,
      typeKeywords:
        config.minecraft?.typeKeywords ?? DEFAULT_MINECRAFT_CONFIG.typeKeywords,
    },
    fields: {
      address: config.fields?.address ?? DEFAULT_FIELDS_CONFIG.address,
      onlineCount:
        config.fields?.onlineCount ?? DEFAULT_FIELDS_CONFIG.onlineCount,
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
    ...names.map((name) => Schema.const(name).description(name)),
  ];

  return Schema.union(options)
    .description("Tiled background texture from assets/textures.")
    .default(DEFAULT_BACKGROUND_TEXTURE);
}

function createDefaultBackgroundTexture() {
  return listBackgroundTextureNames().includes("dirt.png") ? "dirt.png" : "";
}

function emptyObjectDefault<T extends object>() {
  return {} as T;
}
