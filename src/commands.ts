import type { Context, Session } from "koishi";
import type { MCSManagerClient } from "./client";
import { executeServerCommand } from "./command-execution";
import { resolveNodeImageTitle, type Config } from "./config";
import { formatErrorTemplate } from "./error-message";
import { renderNodeStatus, renderServerList } from "./render";
import type { RenderText } from "./render-text";
import { resolveServerAddress } from "./servers";
import { filterServersByStatus, formatStatusChoices, resolveStatusFilter } from "./status-filter";

export function registerCommands(ctx: Context, config: Config, client: MCSManagerClient) {
  const commandName = config.command.name.trim() || "mcsm";
  const commandOptions = { authority: config.command.authority };
  const messageScope = `commands.${commandName}.messages`;

  ctx.command(`${commandName} [input:text]`, "MCSManager portal", commandOptions)
    .usage((session) => session.text(".usage", { command: commandName }))
    .action(async ({ session }, input) => {
      if (!input) return;
      return dispatchRootAction(ctx, session, messageScope, input, config, client);
    });

  ctx.command(`${commandName}.check`, "Check MCSManager API connectivity.", commandOptions)
    .action(({ session }) => checkConnection(session, messageScope, client));

  ctx.command(`${commandName}.status`, "Show MCSManager node status.", commandOptions)
    .action(({ session }) => showNodeStatus(ctx, session, messageScope, config, client));

  ctx.command(`${commandName}.servers [status:text]`, "Show Minecraft servers from MCSManager.", commandOptions)
    .alias(`${commandName}.list`)
    .action(({ session }, status) => showMinecraftServers(ctx, session, messageScope, config, client, status));

  ctx.command(`${commandName}.addr <name:text>`, "Copy a Minecraft server address.", commandOptions)
    .alias(`${commandName}.address`)
    .action(({ session }, name) => showServerAddress(ctx, session, messageScope, config, client, name));

  ctx.command(`${commandName}.exec [input:text]`, "Execute an instance command through the MCSManager terminal.", {
    authority: config.commandExecution.authority,
  })
    .action(({ session }, input) => executeServerCommand(ctx, session, messageScope, config, client, input));

  ctx.command(`${commandName}.refresh`, "Refresh cached MCSManager data.", commandOptions)
    .action(({ session }) => refreshCache(session, messageScope, client));
}

async function dispatchRootAction(ctx: Context, session: Session, scope: string, input: string, config: Config, client: MCSManagerClient) {
  const [action = "", ...args] = input.trim().split(/\s+/);
  const rest = args.join(" ");

  if (action === "check") return checkConnection(session, scope, client);
  if (action === "status") return showNodeStatus(ctx, session, scope, config, client);
  if (action === "servers" || action === "list") return showMinecraftServers(ctx, session, scope, config, client, rest);
  if (action === "addr" || action === "address") return showServerAddress(ctx, session, scope, config, client, rest);
  if (action === "exec") return executeServerCommand(ctx, session, scope, config, client, rest);
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

async function showNodeStatus(ctx: Context, session: Session, scope: string, config: Config, client: MCSManagerClient) {
  try {
    const nodes = await client.listNodes();
    return renderNodeStatus(ctx, config, nodes, createRenderText(session, scope, config));
  } catch (error) {
    return text(session, scope, "status-failed", { message: formatErrorMessage(session, scope, error) });
  }
}

async function showMinecraftServers(
  ctx: Context,
  session: Session,
  scope: string,
  config: Config,
  client: MCSManagerClient,
  statusInput?: string,
) {
  try {
    const parsed = resolveStatusFilter(statusInput, config.minecraft.defaultStatuses);
    if (!parsed.ok) {
      return text(session, scope, "servers-invalid-status", {
        status: statusInput,
        statuses: formatStatusChoices(),
      });
    }

    const servers = await client.listMinecraftInstances();
    const visibleServers = filterServersByStatus(servers, parsed.filter);
    const displayServers = config.fields.playerNames
      ? await client.enrichMinecraftPlayerLists(visibleServers)
      : visibleServers;
    return renderServerList(ctx, config, displayServers, createRenderText(session, scope, config));
  } catch (error) {
    const message = formatErrorMessage(session, scope, error);
    ctx.logger("mcsm-portal-pro").warn("minecraft server list failed: %s", message);
    return formatServersFailedMessage(session, scope, config, message);
  }
}

async function showServerAddress(ctx: Context, session: Session, scope: string, config: Config, client: MCSManagerClient, name?: string) {
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
    const message = formatErrorMessage(session, scope, error);
    ctx.logger("mcsm-portal-pro").warn("minecraft server address lookup failed: %s", message);
    return formatServersFailedMessage(session, scope, config, message);
  }
}

async function refreshCache(session: Session, scope: string, client: MCSManagerClient) {
  client.clearCache();
  return text(session, scope, "refresh-success");
}

function createRenderText(session: Session, scope: string, config: Config): RenderText {
  return {
    noNodes: text(session, scope, "render.no-nodes", { title: resolveNodeImageTitle(config) }),
    noServers: text(session, scope, "render.no-servers"),
    nodeSummary: (online, total) => text(session, scope, "render.node-summary", { online, total }),
    serverSummary: (total) => text(session, scope, "render.server-summary", { total }),
    nodesOnline: (online, total) => text(session, scope, "render.nodes-online", { online, total }),
    serversOnline: (online, total) => text(session, scope, "render.servers-online", { online, total }),
    online: text(session, scope, "render.online"),
    offline: text(session, scope, "render.offline"),
    cpu: text(session, scope, "render.cpu"),
    memory: text(session, scope, "render.memory"),
    address: text(session, scope, "render.address"),
    status: text(session, scope, "render.status"),
    node: text(session, scope, "render.node"),
    players: text(session, scope, "render.players"),
    playerNames: text(session, scope, "render.player-names"),
    type: text(session, scope, "render.type"),
    version: text(session, scope, "render.version"),
    motd: text(session, scope, "render.motd"),
    modList: text(session, scope, "render.mod-list"),
    tags: text(session, scope, "render.tags"),
    instances: text(session, scope, "render.instances"),
    platform: text(session, scope, "render.platform"),
    unknown: text(session, scope, "render.unknown"),
    noNodesAvailable: text(session, scope, "render.no-nodes-available"),
    noServersAvailable: text(session, scope, "render.no-servers-available"),
    noAddressConfigured: text(session, scope, "render.no-address-configured"),
    defaultMotd: text(session, scope, "render.default-motd"),
    instanceCounts: (running, stopped, total) => text(session, scope, "render.instance-counts", { running, stopped, total }),
    playerCount: (online, max) => text(session, scope, "render.player-count", { online, max }),
    playerList: (names) => text(session, scope, "render.player-list", { players: names.join(", ") }),
    mods: (count) => text(session, scope, "render.mods", { count }),
    statusLabel: (status) => text(session, scope, `render.status-labels.${status}`),
  };
}

function formatErrorMessage(session: Session, scope: string, error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return text(session, scope, "error-unknown");
}

function formatServersFailedMessage(session: Session, scope: string, config: Config, message: string) {
  return formatErrorTemplate(config.errorMessages.serversFailed, { message })
    ?? text(session, scope, "servers-failed", { message });
}

function text(session: Session, scope: string, key: string, params?: object) {
  return session.text(`${scope}.${key}`, params);
}
