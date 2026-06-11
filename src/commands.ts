import type { Context, Session } from "koishi";
import type { MCSManagerClient } from "./client";
import type { Config } from "./config";
import { renderNodeStatusText, renderServerListText, type RenderText } from "./render";
import { resolveServerAddress } from "./servers";

export function registerCommands(ctx: Context, config: Config, client: MCSManagerClient) {
  const commandName = config.command.name.trim() || "mcsm";
  const commandOptions = { authority: config.command.authority };
  const messageScope = `commands.${commandName}.messages`;

  ctx.command(`${commandName} [input:text]`, "MCSManager portal", commandOptions)
    .usage((session) => session.text(".usage", { command: commandName }))
    .action(async ({ session }, input) => {
      if (!input) return;
      return dispatchRootAction(session, messageScope, input, config, client);
    });

  ctx.command(`${commandName}.check`, "Check MCSManager API connectivity.", commandOptions)
    .action(({ session }) => checkConnection(session, messageScope, client));

  ctx.command(`${commandName}.status`, "Show MCSManager node status.", commandOptions)
    .action(({ session }) => showNodeStatus(session, messageScope, config, client));

  ctx.command(`${commandName}.servers`, "Show Minecraft servers from MCSManager.", commandOptions)
    .alias(`${commandName}.list`)
    .action(({ session }) => showMinecraftServers(session, messageScope, config, client));

  ctx.command(`${commandName}.addr <name:text>`, "Copy a Minecraft server address.", commandOptions)
    .alias(`${commandName}.address`)
    .action(({ session }, name) => showServerAddress(session, messageScope, client, name));

  ctx.command(`${commandName}.refresh`, "Refresh cached MCSManager data.", commandOptions)
    .action(({ session }) => refreshCache(session, messageScope, client));
}

async function dispatchRootAction(session: Session, scope: string, input: string, config: Config, client: MCSManagerClient) {
  const [action = "", ...args] = input.trim().split(/\s+/);
  const rest = args.join(" ");

  if (action === "check") return checkConnection(session, scope, client);
  if (action === "status") return showNodeStatus(session, scope, config, client);
  if (action === "servers" || action === "list") return showMinecraftServers(session, scope, config, client);
  if (action === "addr" || action === "address") return showServerAddress(session, scope, client, rest);
  if (action === "refresh") return refreshCache(session, scope, client);

  return text(session, scope, "unknown-action", { action });
}

async function checkConnection(session: Session, scope: string, client: MCSManagerClient) {
  try {
    await client.checkConnection();
    return text(session, scope, "check-success");
  } catch (error) {
    return text(session, scope, "check-failed", { message: formatErrorMessage(session, scope, error) });
  }
}

async function showNodeStatus(session: Session, scope: string, config: Config, client: MCSManagerClient) {
  try {
    const nodes = await client.listNodes();
    return renderNodeStatusText(config, nodes, createRenderText(session, scope, config));
  } catch (error) {
    return text(session, scope, "status-failed", { message: formatErrorMessage(session, scope, error) });
  }
}

async function showMinecraftServers(session: Session, scope: string, config: Config, client: MCSManagerClient) {
  try {
    const servers = await client.listMinecraftInstances();
    return renderServerListText(config, servers, createRenderText(session, scope, config));
  } catch (error) {
    return text(session, scope, "servers-failed", { message: formatErrorMessage(session, scope, error) });
  }
}

async function showServerAddress(session: Session, scope: string, client: MCSManagerClient, name?: string) {
  try {
    const servers = await client.listMinecraftInstances();
    const result = resolveServerAddress(servers, name);
    if (result.type === "missing-query") return text(session, scope, "addr-missing-query");
    if (result.type === "not-found") return text(session, scope, "addr-not-found", { name });
    if (result.type === "ambiguous") {
      return text(session, scope, "addr-ambiguous", {
        name,
        matches: result.matches.map((server) => server.name).join(", "),
      });
    }
    if (!result.server.address) {
      return text(session, scope, "addr-missing-address", { name: result.server.name });
    }
    return result.server.address;
  } catch (error) {
    return text(session, scope, "servers-failed", { message: formatErrorMessage(session, scope, error) });
  }
}

function refreshCache(session: Session, scope: string, client: MCSManagerClient) {
  client.clearCache();
  return text(session, scope, "refresh-success");
}

function createRenderText(session: Session, scope: string, config: Config): RenderText {
  return {
    noNodes: text(session, scope, "render.no-nodes", { title: config.image.title }),
    noServers: text(session, scope, "render.no-servers"),
    nodeSummary: (online, total) => text(session, scope, "render.node-summary", { online, total }),
    serverSummary: (total) => text(session, scope, "render.server-summary", { total }),
    online: text(session, scope, "render.online"),
    offline: text(session, scope, "render.offline"),
    cpu: text(session, scope, "render.cpu"),
    memory: text(session, scope, "render.memory"),
    address: text(session, scope, "render.address"),
    status: text(session, scope, "render.status"),
    node: text(session, scope, "render.node"),
    players: text(session, scope, "render.players"),
    version: text(session, scope, "render.version"),
    motd: text(session, scope, "render.motd"),
    modList: text(session, scope, "render.mod-list"),
    tags: text(session, scope, "render.tags"),
    unknown: text(session, scope, "render.unknown"),
    instanceCounts: (running, stopped, total) => text(session, scope, "render.instance-counts", { running, stopped, total }),
    playerCount: (online, max) => text(session, scope, "render.player-count", { online, max }),
    mods: (count) => text(session, scope, "render.mods", { count }),
    statusLabel: (status) => text(session, scope, `render.status-labels.${status}`),
  };
}

function formatErrorMessage(session: Session, scope: string, error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return text(session, scope, "error-unknown");
}

function text(session: Session, scope: string, key: string, params?: object) {
  return session.text(`${scope}.${key}`, params);
}
