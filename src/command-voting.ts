import { h, type Context, type Session } from "koishi";
import type { CommandExecutionVotingConfig, Config } from "./config";
import type { MinecraftInstance } from "./types";
import {
  renderExecutionVoteVisualization,
  type ExecutionVoteVisualizationState,
} from "./visualization/vote-renderer";
import {
  renderVisualizationImage,
} from "./visualization/renderer";

type TextResolver = (key: string, params?: object) => string;
type VoteOutcome = "passed" | "rejected" | "timeout";
type VoteDecision = "yes" | "no";
type VotePresentation = "qq-button" | "image";

interface VoteRuntime {
  ctx: Context;
  session: Session;
  t: TextResolver;
  config: Config;
  vote: CommandExecutionVotingConfig;
  server: MinecraftInstance;
  command: string;
  voteId: string;
  presentation: VotePresentation;
  voters: Set<string>;
  approvals: number;
  settled: boolean;
  renderVersion: number;
  timer?: ReturnType<typeof setTimeout>;
  disposers: Array<() => void>;
  resolve: (outcome: VoteOutcome) => void;
  reject: (error: unknown) => void;
}

const activeVoteScopes = new Set<string>();

export async function requestExecutionVote(
  ctx: Context,
  session: Session,
  t: TextResolver,
  config: Config,
  server: MinecraftInstance,
  command: string,
) {
  const voting = config.commandExecution.voting;
  if (!voting.enabled || voting.approveCount <= 1) return true;
  const scope = resolveVoteScope(session);
  if (!scope) return t("exec-vote-guild-only");
  if (activeVoteScopes.has(scope)) return t("exec-vote-active");

  activeVoteScopes.add(scope);
  try {
    const outcome = await waitForVote(ctx, session, t, config, voting, server, command);
    return outcome === "passed" ? true : undefined;
  } finally {
    activeVoteScopes.delete(scope);
  }
}

function waitForVote(
  ctx: Context,
  session: Session,
  t: TextResolver,
  config: Config,
  vote: CommandExecutionVotingConfig,
  server: MinecraftInstance,
  command: string,
) {
  return new Promise<VoteOutcome>((resolve, reject) => {
    const runtime = createVoteRuntime({
      ctx,
      session,
      t,
      config,
      vote,
      server,
      command,
      resolve,
      reject,
    });
    runtime.timer = setTimeout(() => finishVote(runtime, "timeout"), vote.timeout);
    runtime.disposers.push(createMessageVoteMiddleware(runtime));
    sendVoteUpdate(runtime, "active").catch((error) => failVote(runtime, error));
  });
}

function createVoteRuntime(options: Pick<
  VoteRuntime,
  "ctx" | "session" | "t" | "config" | "vote" | "server" | "command" | "resolve" | "reject"
>): VoteRuntime {
  const voters = new Set<string>(options.session.userId ? [options.session.userId] : []);
  return {
    ...options,
    voteId: createVoteId(),
    presentation: resolveVotePresentation(options.session, options.vote),
    voters,
    approvals: voters.size,
    settled: false,
    renderVersion: 0,
    disposers: [],
  };
}

function createMessageVoteMiddleware(runtime: VoteRuntime) {
  return runtime.ctx.middleware(async (voteSession, next) => {
    if (!isSameVoteScope(runtime, voteSession)) return next();
    const decision = parseVoteDecision(voteSession, runtime.vote.command);
    if (!decision) return next();
    submitVote(runtime, voteSession.userId, decision);
  });
}

function submitVote(
  runtime: VoteRuntime,
  userId: string | undefined,
  decision: VoteDecision,
) {
  if (runtime.settled || !userId || runtime.voters.has(userId)) return;
  if (decision === "no") return finishVote(runtime, "rejected");
  runtime.voters.add(userId);
  runtime.approvals += 1;
  if (runtime.approvals >= runtime.vote.approveCount) {
    return finishVote(runtime, "passed");
  }
  sendVoteUpdate(runtime, "active").catch((error) => failVote(runtime, error));
}

function finishVote(runtime: VoteRuntime, outcome: VoteOutcome) {
  if (runtime.settled) return;
  runtime.settled = true;
  invalidatePendingVoteRenders(runtime);
  disposeVote(runtime);
  const finalRender =
    outcome === "passed"
      ? Promise.resolve()
      : outcome === "timeout"
        ? sendVoteTimeout(runtime)
        : sendVoteUpdate(runtime, outcome);
  finalRender.then(() => runtime.resolve(outcome), runtime.reject);
}

function failVote(runtime: VoteRuntime, error: unknown) {
  if (runtime.settled) return;
  runtime.settled = true;
  disposeVote(runtime);
  runtime.reject(error);
}

function disposeVote(runtime: VoteRuntime) {
  if (runtime.timer) clearTimeout(runtime.timer);
  runtime.disposers.forEach((dispose) => dispose());
}

function invalidatePendingVoteRenders(runtime: VoteRuntime) {
  runtime.renderVersion += 1;
}

function parseVoteDecision(session: Session, command: string): VoteDecision | undefined {
  return parseCommandVote(session.content, command) ?? parseMentionVote(session);
}

function parseCommandVote(content: string, command: string): VoteDecision | undefined {
  const [head, decision] = content.trim().split(/\s+/);
  if (head !== command) return;
  return parseDecisionWord(decision);
}

function parseMentionVote(session: Session): VoteDecision | undefined {
  const { atSelf, content } = session.stripped;
  if (!atSelf) return;
  return parseDecisionWord(content);
}

function parseDecisionWord(word: string | undefined): VoteDecision | undefined {
  const normalized = word?.trim().toLowerCase();
  if (!normalized) return;
  if (["yes", "y", "approve", "同意", "赞成"].includes(normalized)) return "yes";
  if (["no", "n", "reject", "否", "否决", "反对"].includes(normalized)) return "no";
}

async function sendVoteUpdate(
  runtime: VoteRuntime,
  status: VoteOutcome | "active",
) {
  const state = createVoteVisualizationState(runtime, status);
  if (runtime.presentation === "qq-button") {
    return runtime.session.send(renderVoteTextMessage(runtime, state, status));
  }
  const renderVersion = ++runtime.renderVersion;
  const image = await renderVisualizationImage(
    runtime.ctx,
    runtime.config,
    renderExecutionVoteVisualization(runtime.config, state),
  );
  if (renderVersion !== runtime.renderVersion) return;
  return runtime.session.send(image);
}

function sendVoteTimeout(runtime: VoteRuntime) {
  return runtime.session.send(
    renderVoteTextMessage(runtime, createVoteVisualizationState(runtime, "timeout"), "timeout"),
  );
}

function renderVoteTextMessage(
  runtime: VoteRuntime,
  state: ExecutionVoteVisualizationState,
  status: VoteOutcome | "active",
) {
  const content = [
    state.title,
    `${state.statusLabel} | ${state.progressLabel}: ${state.approvals}/${state.required}`,
    `${state.serverNameLabel}: ${state.serverName}`,
    `${state.commandLabel}: ${state.command}`,
  ].join("\n");
  if (status !== "active") return content;
  return [
    content,
    h("button-group", {},
      h("button", {
        id: createVoteButtonId(runtime.voteId, "yes"),
        type: "input",
        text: createVoteInputText(runtime, "yes"),
        class: "primary",
      }, runtime.t("exec-vote-approve")),
      h("button", {
        id: createVoteButtonId(runtime.voteId, "no"),
        type: "input",
        text: createVoteInputText(runtime, "no"),
      }, runtime.t("exec-vote-reject")),
    ),
  ];
}

function createVoteInputText(runtime: VoteRuntime, decision: VoteDecision) {
  return decision === "yes" ? runtime.t("exec-vote-approve") : runtime.t("exec-vote-reject");
}

function createVoteVisualizationState(
  runtime: VoteRuntime,
  status: VoteOutcome | "active",
): ExecutionVoteVisualizationState {
  return {
    title: runtime.t("exec-vote-title", { name: runtime.server.name }),
    serverNameLabel: runtime.t("exec-vote-server"),
    serverName: runtime.server.name,
    commandLabel: runtime.t("exec-vote-command"),
    command: runtime.command,
    progressLabel: runtime.t("exec-vote-progress-label"),
    hint: createVoteHint(runtime, status),
    status,
    statusLabel: runtime.t(`exec-vote-status-${status}`),
    approvals: runtime.approvals,
    required: runtime.vote.approveCount,
  };
}

function createVoteHint(runtime: VoteRuntime, status: VoteOutcome | "active") {
  if (runtime.presentation !== "image" || status !== "active") return "";
  return runtime.t("exec-vote-image-hint", { voteCommand: runtime.vote.command });
}

function resolveVotePresentation(
  session: Session,
  vote: CommandExecutionVotingConfig,
): VotePresentation {
  if (vote.presentation === "image") return "image";
  return isQQOfficialSession(session) ? "qq-button" : "image";
}

function isQQOfficialSession(session: Session) {
  return session.platform === "qq" || session.platform === "qqguild";
}

function resolveVoteScope(session: Session) {
  if (session.isDirect || !session.channelId) return;
  return session.cid;
}

function isSameVoteScope(runtime: VoteRuntime, session: Session) {
  return resolveVoteScope(session) === resolveVoteScope(runtime.session);
}

function createVoteId() {
  return Math.random().toString(36).slice(2, 10);
}

function createVoteButtonId(voteId: string, decision: VoteDecision) {
  return `mvp:${voteId}:${decision}`;
}
