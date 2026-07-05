import type { Context, Session } from "koishi";
import type { MCSManagerClient } from "./client";
import type { CommandExecutionVotingConfig, Config } from "./config";
import { formatErrorTemplate } from "./error-message";
import type { MinecraftInstance } from "./types";

type TextResolver = (key: string, params?: object) => string;

type DirectTarget =
  | { type: "none"; command: string }
  | { type: "target"; server: MinecraftInstance; command: string }
  | { type: "message"; message: string }
  | { type: "ambiguous"; matches: MinecraftInstance[] };

type VoteOutcome = "passed" | "rejected" | "timeout";

const activeVoteGroups = new Set<string>();

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
    const servers = await client.listMinecraftInstances();
    const target = await resolveExecutionTarget(session, t, execution.selectionTimeout, servers, input);
    if (target.type === "message") return target.message;
    if (target.type === "ambiguous") {
      return t("exec-ambiguous", {
        name: input,
        matches: target.matches.map((server) => server.name).join(", "),
      });
    }
    if (!target.server.nodeId) return t("exec-missing-node", { name: target.server.name });
    if (target.server.status !== "running") {
      return t("exec-not-running", { name: target.server.name, status: target.server.status });
    }
    targetName = target.server.name;
    const command = await resolveExecutionCommand(session, t, execution.commandTimeout, target.command);
    if (!command) return t("exec-command-cancelled");
    const approved = await requestExecutionVote(ctx, session, t, config, target.server, command);
    if (approved !== true) return approved;

    const output = await client.executeInstanceCommand(
      target.server,
      command,
      config.commandExecution.maxResultLength,
    );
    return output
      ? t("exec-result", { name: target.server.name, output })
      : t("exec-no-output", { name: target.server.name });
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

async function requestExecutionVote(
  ctx: Context,
  session: Session,
  t: TextResolver,
  config: Config,
  server: MinecraftInstance,
  command: string,
) {
  const voting = config.commandExecution.voting;
  if (!voting.enabled || voting.approveCount <= 1) return true;
  const groupId = session.guildId;
  if (!groupId) return t("exec-vote-guild-only");
  if (activeVoteGroups.has(groupId)) return t("exec-vote-active");

  activeVoteGroups.add(groupId);
  try {
    const outcome = await waitForVote(ctx, session, t, voting, server, command);
    if (outcome === "passed") return true;
    return t(outcome === "timeout" ? "exec-vote-timeout" : "exec-vote-rejected");
  } finally {
    activeVoteGroups.delete(groupId);
  }
}

function waitForVote(
  ctx: Context,
  session: Session,
  t: TextResolver,
  vote: CommandExecutionVotingConfig,
  server: MinecraftInstance,
  command: string,
) {
  return new Promise<VoteOutcome>((resolve) => {
    const voters = new Set<string>(session.userId ? [session.userId] : []);
    let approvals = voters.size;
    const cleanup = createVoteCleanup(vote.timeout, resolve);

    session.send(t("exec-vote-start", {
      name: server.name,
      command,
      voteCommand: vote.command,
      progress: formatVoteProgress(approvals, vote.approveCount),
    }));

    cleanup.dispose = ctx.middleware(async (voteSession, next) => {
      if (voteSession.guildId !== session.guildId) return next();
      const decision = parseVoteDecision(voteSession.content, vote.command);
      if (!decision) return next();
      if (voteSession.userId && voters.has(voteSession.userId)) {
        await voteSession.send(t("exec-vote-already-voted"));
        return next();
      }
      if (decision === "no") return cleanup.finish("rejected");

      if (voteSession.userId) voters.add(voteSession.userId);
      approvals += 1;
      if (approvals >= vote.approveCount) {
        return cleanup.finish("passed");
      }
      await voteSession.send(t("exec-vote-progress", {
        progress: formatVoteProgress(approvals, vote.approveCount),
      }));
      return next();
    });
  });
}

function createVoteCleanup(
  timeout: number,
  resolve: (value: VoteOutcome) => void,
) {
  const cleanup: { dispose?: () => void; finish: (value: VoteOutcome) => void } = {
    finish(value) {
      clearTimeout(timer);
      cleanup.dispose?.();
      resolve(value);
    },
  };
  const timer = setTimeout(() => cleanup.finish("timeout"), timeout);
  return cleanup;
}

function parseVoteDecision(content: string, command: string) {
  const [head, decision] = content.trim().split(/\s+/);
  if (head !== command) return;
  const normalized = decision?.toLowerCase();
  if (["yes", "y", "同意", "赞成"].includes(normalized)) return "yes";
  if (["no", "n", "否", "反对"].includes(normalized)) return "no";
}

function formatVoteProgress(approvals: number, required: number) {
  const approved = "◆ ".repeat(Math.min(approvals, required));
  const pending = "◇ ".repeat(Math.max(0, required - approvals));
  return `${approved}${pending}`.trim();
}

function formatErrorMessage(t: TextResolver, error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return t("error-unknown");
}
