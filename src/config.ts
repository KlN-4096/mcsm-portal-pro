import { Schema } from "koishi";
import type { ServerFieldVisibility } from "./types";

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
  title: string;
  theme: "auto" | "light" | "dark";
  accentColor: string;
  showGeneratedAt: boolean;
}

export interface MinecraftConfig {
  pageSize: number;
  typeKeywords: string[];
}

export interface Config {
  connection: ConnectionConfig;
  command: CommandConfig;
  image: ImageConfig;
  minecraft: MinecraftConfig;
  fields: ServerFieldVisibility;
  cacheTtl: number;
  debug: boolean;
}

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
      title: Schema.string()
        .description("Title displayed in generated portal images.")
        .default("MCSManager Portal"),
      theme: Schema.union([
        Schema.const("auto").description(
          "Auto (light/dark based on local sunrise/sunset time)",
        ),
        Schema.const("light").description("Light"),
        Schema.const("dark").description("Dark"),
      ] as const)
        .description("Image theme.")
        .default("auto"),
      accentColor: Schema.string()
        .description("CSS color used as the image accent color.")
        .default("#39c5bb"),
      showGeneratedAt: Schema.boolean()
        .description("Show generated time in future image outputs.")
        .default(true),
    }).description("Image settings"),
    minecraft: Schema.object({
      pageSize: Schema.number()
        .description("Number of instances to request from each MCSManager node per page.")
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
