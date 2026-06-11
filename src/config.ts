import { Schema } from "koishi";
import type { ServerFieldVisibility } from "./types";
import { listBackgroundTextureNames } from "./visualization/styles";

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
  title?: string;
  nodeTitle: string;
  serverTitle: string;
  width: number;
  backgroundTexture: string;
  accentColor: string;
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

export const PORTAL_IMAGE_BRAND = "MCSM Portal";
export const DEFAULT_NODE_IMAGE_TITLE = "Daemon Node Status";
export const DEFAULT_SERVER_IMAGE_TITLE = "Play Multiplayer";

export const Config: Schema<Config> = Schema.intersect([
  Schema.object({
    connection: Schema.object({
      endpoint: Schema.string()
        .description(
          "MCSManager panel API endpoint, for example http://my-server-ip:23333.",
        )
        .default(""),
      apiKey: Schema.string()
        .role("secret")
        .description("MCSManager API key.")
        .default(""),
      apiKeyParam: Schema.string()
        .description("Query parameter name used to send the API key.")
        .default("apikey"),
      timeout: Schema.number()
        .description("Request timeout in milliseconds.")
        .min(1000)
        .default(10000),
    }).description("MCSManager connection"),
    command: Schema.object({
      name: Schema.string().description("Root command name.").default("mcsm"),
      authority: Schema.number()
        .description("Minimum authority required to use portal commands.")
        .min(0)
        .max(5)
        .default(1),
    }).description("Command settings"),
    cacheTtl: Schema.number()
      .description(
        "Cache TTL for future MCSManager status queries, in seconds.",
      )
      .min(0)
      .default(30),
    debug: Schema.boolean()
      .description("Print verbose MCSManager discovery logs for debugging.")
      .default(false),
  }),
  Schema.object({
    image: Schema.object({
      nodeTitle: Schema.string()
        .description("Title displayed below MCSM Portal in node status images.")
        .default(DEFAULT_NODE_IMAGE_TITLE),
      serverTitle: Schema.string()
        .description("Title displayed below MCSM Portal in server list images.")
        .default(DEFAULT_SERVER_IMAGE_TITLE),
      width: Schema.number()
        .description("Generated image width in pixels.")
        .min(640)
        .max(1600)
        .default(854),
      backgroundTexture: createBackgroundTextureSchema(),
      accentColor: Schema.string()
        .description("CSS color used as the image accent color.")
        .default("#39c5bb"),
      showGeneratedAt: Schema.boolean()
        .description("Show generated time in future image outputs.")
        .default(true),
    }).description("Image settings"),
    output: Schema.object({
      mode: Schema.union([
        Schema.const("text").description("Text only"),
        Schema.const("image").description("Image"),
      ] as const)
        .description("Bot result output mode.")
        .default("text"),
      text: Schema.object({
        style: Schema.union([
          Schema.const("compact").description("Compact"),
          Schema.const("detailed").description("Detailed"),
        ] as const)
          .description("Text message formatting style.")
          .default("detailed"),
        showHeader: Schema.boolean()
          .description("Show title and summary lines in text output.")
          .default(true),
        showSeparators: Schema.boolean()
          .description("Separate text cards with blank lines.")
          .default(true),
      }).description("Text output settings"),
    }).description("Output settings"),
    preview: Schema.object({
      enabled: Schema.boolean()
        .description(
          "Register the code-authored visualization preview page in Koishi Console when available.",
        )
        .default(true),
    }).description("Visualization preview"),
    minecraft: Schema.object({
      pageSize: Schema.number()
        .description(
          "Number of instances to request from each MCSManager node per page.",
        )
        .min(1)
        .max(50)
        .default(50),
      typeKeywords: Schema.array(Schema.string())
        .description("Instance type keywords treated as Minecraft servers.")
        .default(["minecraft"]),
    }).description("Minecraft instance discovery"),
    fields: Schema.object({
      address: Schema.boolean()
        .default(true)
        .description("Show server address."),
      onlineCount: Schema.boolean()
        .default(true)
        .description("Show online player count."),
      status: Schema.boolean()
        .default(true)
        .description("Show instance status."),
      node: Schema.boolean().default(true).description("Show node name."),
      version: Schema.boolean()
        .default(true)
        .description("Show Minecraft version."),
      motd: Schema.boolean().default(true).description("Show MOTD."),
      modList: Schema.boolean().default(true).description("Show mod list."),
    }).description("Server list fields"),
  }),
]);

export function resolveNodeImageTitle(config: Config) {
  return resolveSurfaceImageTitle(
    config.image.nodeTitle,
    DEFAULT_NODE_IMAGE_TITLE,
    config.image.title,
  );
}

export function resolveServerImageTitle(config: Config) {
  return resolveSurfaceImageTitle(
    config.image.serverTitle,
    DEFAULT_SERVER_IMAGE_TITLE,
    config.image.title,
  );
}

function resolveSurfaceImageTitle(title: string | undefined, defaultTitle: string, legacyTitle?: string) {
  const normalized = title?.trim();
  if (normalized && normalized !== defaultTitle) return normalized;

  const legacy = legacyTitle?.trim();
  if (legacy && legacy !== PORTAL_IMAGE_BRAND) return legacy;

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
    .default(names.includes("dirt.png") ? "dirt.png" : "");
}
