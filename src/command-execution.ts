import type { Context, Session } from "koishi";
import type { MCSManagerClient } from "./client";
import type { Config } from "./config";
import { formatErrorTemplate } from "./error-message";
import type { MinecraftInstance } from "./types";
import { requestExecutionVote } from "./command-voting";

type TextResolver = (key: string, params?: object) => string;

type DirectTarget =
  | { type: "none"; command: string }
  | { type: "target"; server: MinecraftInstance; command: string }
  | { type: "message"; message: string }
  | { type: "ambiguous"; matches: MinecraftInstance[] };

type ExecutionRequest =
  | { type: "ready"; server: MinecraftInstance; command: string }
  | { type: "message"; message: string };

interface ResolveExecutionRequestOptions {
  session: Session;
  t: TextResolver;
  config: Config;
  client: MCSManagerClient;
  input?: string;
}

export async function executeServerCommand(
  ctx: Context,
  session: Session,
  scope: string,
  config: Config,
  client: MCSManagerClient,
  input?: string,
) {
  const t: TextResolver = (key, params) => session.text(`${scope}.${key}`, params);
  const execution = config.commandExecution;
  if (!await ctx.permissions.test([`authority:${execution.authority}`], session)) {
    return t("exec-low-authority");
  }
  if (!execution.enabled) return t("exec-disabled");

  let targetName: string | undefined;
  try {
    const request = await resolveExecutionRequest({ session, t, config, client, input });
    if (request.type === "message") return request.message;
    targetName = request.server.name;
    const approved = await requestExecutionVote(ctx, session, t, config, request.server, request.command);
    if (approved !== true) return approved;

    const output = await client.executeInstanceCommand(
      request.server,
      request.command,
      config.commandExecution.maxResultLength,
    );
    return output
      ? t("exec-result", { name: request.server.name, output })
      : t("exec-no-output", { name: request.server.name });
  } catch (error) {
    const message = formatErrorMessage(t, error);
    ctx.logger("mcsm-portal-pro").warn(
      "terminal command execution failed: server=%s message=%s",
      targetName ?? "<unresolved>",
      message,
    );
    return formatErrorTemplate(config.errorMessages.execFailed, {
      message,
      name: targetName,
    }) ?? t("exec-failed", { message });
  }
}

async function resolveExecutionRequest(
  options: ResolveExecutionRequestOptions,
): Promise<ExecutionRequest> {
  const execution = options.config.commandExecution;
  const servers = await options.client.listMinecraftInstances();
  const target = await resolveExecutionTarget(
    options.session,
    options.t,
    execution.selectionTimeout,
    servers,
    options.input,
  );
  if (target.type === "message") return target;
  if (target.type === "ambiguous") {
    return {
      type: "message",
      message: options.t("exec-ambiguous", {
        name: options.input,
        matches: target.matches.map((server) => server.name).join(", "),
      }),
    };
  }
  if (!target.server.nodeId) {
    return { type: "message", message: options.t("exec-missing-node", { name: target.server.name }) };
  }
  if (target.server.status !== "running") {
    return { type: "message", message: options.t("exec-not-running", target.server) };
  }
  const command = await resolveExecutionCommand(
    options.session,
    options.t,
    execution.commandTimeout,
    target.command,
  );
  return command
    ? { type: "ready", server: target.server, command }
    : { type: "message", message: options.t("exec-command-cancelled") };
}

async function resolveExecutionTarget(
  session: Session,
  t: TextResolver,
  timeout: number,
  servers: MinecraftInstance[],
  input?: string,
) {
  const direct = resolveDirectTarget(servers, input);
  if (direct.type !== "none") return direct;

  const runningServers = servers.filter((server) => server.status === "running");
  if (runningServers.length === 0) {
    return { type: "message" as const, message: t("exec-no-running-servers") };
  }
  if (runningServers.length === 1) {
    return { type: "target" as const, server: runningServers[0], command: direct.command };
  }

  await session.send(t("exec-select-server", {
    servers: runningServers.map((server, index) => `${index + 1}. ${server.name}`).join("\n"),
  }));
  const answer = await session.prompt(timeout);
  const index = Number(answer?.trim());
  if (!Number.isInteger(index) || index < 1 || index > runningServers.length) {
    return { type: "message" as const, message: t("exec-select-invalid", { total: runningServers.length }) };
  }
  return { type: "target" as const, server: runningServers[index - 1], command: direct.command };
}

function resolveDirectTarget(servers: MinecraftInstance[], input?: string): DirectTarget {
  const normalizedInput = input?.trim() ?? "";
  if (!normalizedInput) return { type: "none", command: "" };

  const matches = servers
    .map((server) => matchServerPrefix(server, normalizedInput))
    .filter((match): match is { server: MinecraftInstance; command: string; length: number } => Boolean(match))
    .sort((left, right) => right.length - left.length);
  if (!matches.length) return { type: "none", command: normalizedInput };

  const best = matches.filter((match) => match.length === matches[0].length);
  if (best.length > 1) return { type: "ambiguous", matches: best.map((match) => match.server) };
  return { type: "target", server: best[0].server, command: best[0].command };
}

function matchServerPrefix(server: MinecraftInstance, input: string) {
  const normalizedInput = input.toLowerCase();
  for (const key of [server.name, server.id]) {
    const normalizedKey = key.trim().toLowerCase();
    if (!normalizedKey) continue;
    if (normalizedInput === normalizedKey) return { server, command: "", length: normalizedKey.length };
    if (normalizedInput.startsWith(`${normalizedKey} `)) {
      return {
        server,
        command: input.slice(normalizedKey.length).trim(),
        length: normalizedKey.length,
      };
    }
  }
}

async function resolveExecutionCommand(
  session: Session,
  t: TextResolver,
  timeout: number,
  command: string,
) {
  const normalized = command.trim();
  if (normalized) return normalized;

  await session.send(t("exec-command-prompt"));
  const answer = await session.prompt(timeout);
  return answer?.trim();
}

function formatErrorMessage(t: TextResolver, error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return t("error-unknown");
}
