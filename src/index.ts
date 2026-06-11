import { Context } from "koishi";
import { MCSManagerClient } from "./client";
import { registerCommands } from "./commands";
import { Config as ConfigSchema, createRuntimeConfig } from "./config";
import type { ConfigInput as PluginConfig } from "./config";
import { defineLocales } from "./locales";
import { registerPreviewEntry } from "./preview";

export const name = "mcsm-portal";
export const inject = {
  required: ["http"],
  optional: ["console"],
};

export interface Config extends PluginConfig {}

export const Config = ConfigSchema;
export * from "./types";
export * from "./visualization";
export * from "./visualization/layouts";
export * from "./visualization/renderer";
export * from "./visualization/styles";

export function apply(ctx: Context, config: Config) {
  const runtimeConfig = createRuntimeConfig(config);
  const commandName = runtimeConfig.command.name.trim() || "mcsm";
  defineLocales(ctx, commandName);
  const client = new MCSManagerClient(
    ctx,
    runtimeConfig.connection,
    runtimeConfig.minecraft,
    runtimeConfig.cacheTtl,
    runtimeConfig.debug,
  );
  registerPreviewEntry(ctx, runtimeConfig, client);
  registerCommands(ctx, runtimeConfig, client);
}
