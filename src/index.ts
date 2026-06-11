import { Context } from "koishi";
import { MCSManagerClient } from "./client";
import { registerCommands } from "./commands";
import { Config as ConfigSchema } from "./config";
import type { Config as PluginConfig } from "./config";
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
  const commandName = config.command.name.trim() || "mcsm";
  defineLocales(ctx, commandName);
  registerPreviewEntry(ctx, config);
  const client = new MCSManagerClient(ctx, config.connection, config.minecraft, config.cacheTtl, config.debug);
  registerCommands(ctx, config, client);
}
