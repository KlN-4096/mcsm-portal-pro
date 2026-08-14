import type { Context, Session } from "koishi";
import {
  isAmbiguousMCSManagerError,
  type InstanceOperationName,
  type MCSManagerClient,
} from "./client";
import type { Config } from "./config";
import { requestExecutionVote } from "./command-voting";
import { hasForceExecutionAuthority } from "./force-execution";
import type { InstanceStatus, MinecraftInstance } from "./types";

export type InstanceLifecycleAction = Exclude<InstanceOperationName, "exec">;
export const INSTANCE_OPERATION_COMMAND_NAME = "server";

type TextResolver = (key: string, params?: object) => string;
type SelectionResult =
  | { type: "server"; server: MinecraftInstance }
  | { type: "message"; message: string };

interface InstanceOperationRequest {
  ctx: Context;
  session: Session;
  scope: string;
  config: Config;
  client: MCSManagerClient;
  action: InstanceLifecycleAction;
  force?: boolean;
}

interface SelectedOperationRequest extends Omit<InstanceOperationRequest, "scope"> {
  t: TextResolver;
  selected: MinecraftInstance;
}

interface RunningOperationRequest extends Omit<SelectedOperationRequest, "selected"> {
  server: MinecraftInstance;
}

const POLL_INTERVAL_MS = 3000;
const ALLOWED_STATUSES: Record<InstanceLifecycleAction, readonly InstanceStatus[]> = {
  start: ["stopped"],
  stop: ["running", "starting"],
  restart: ["running", "starting"],
  kill: ["running", "starting", "stopping"],
};

export async function executeInstanceOperation(options: InstanceOperationRequest) {
  const { ctx, session, scope, config, client, action } = options;
  const t: TextResolver = (key, params) => session.text(`${scope}.${key}`, params);
  if (!await ctx.permissions.test([`authority:${config.instanceOperations.authority}`], session)) {
    return t("instance-op-low-authority");
  }
  if (options.force && !await hasForceExecutionAuthority(ctx, session)) {
    return t("instance-op-low-authority");
  }
  if (!config.instanceOperations.enabled) return t("instance-op-disabled");

  let targetName: string | undefined;
  try {
    const selection = await selectInstance({ session, t, config, client, action });
    if (selection.type === "message") return selection.message;
    targetName = selection.server.name;
    return await executeSelectedOperation({
      ctx,
      session,
      t,
      config,
      client,
      selected: selection.server,
      action,
      force: options.force,
    });
  } catch (error) {
    const message = formatErrorMessage(t, error);
    ctx.logger("mcsm-portal-pro").warn(
      "instance operation failed: action=%s server=%s message=%s",
      action,
      targetName ?? "<unresolved>",
      message,
    );
    return t("instance-op-failed", { action: t(`instance-op-action-${action}`), message });
  }
}

async function selectInstance(
  options: Pick<SelectedOperationRequest, "session" | "t" | "config" | "client" | "action">,
): Promise<SelectionResult> {
  const { session, t, config, client, action } = options;
  const servers = (await client.listMinecraftInstances(true)).filter((server) =>
    isAllowedStatus(action, server.status),
  );
  if (servers.length === 0) {
    return {
      type: "message",
      message: t("instance-op-no-servers", { action: t(`instance-op-action-${action}`) }),
    };
  }
  if (servers.length === 1) return { type: "server", server: servers[0] };

  await session.send(t("instance-op-select", {
    action: t(`instance-op-action-${action}`),
    servers: servers.map((server, index) => `${index + 1}. ${server.name}`).join("\n"),
  }));
  const answer = await session.prompt(config.commandExecution.selectionTimeout);
  const index = Number(answer?.trim());
  if (!Number.isInteger(index) || index < 1 || index > servers.length) {
    return {
      type: "message",
      message: t("instance-op-select-invalid", { total: servers.length }),
    };
  }
  return { type: "server", server: servers[index - 1] };
}

async function executeSelectedOperation(options: SelectedOperationRequest) {
  const { ctx, session, t, config, client, selected, action } = options;
  const server = await client.getFreshMinecraftInstance(selected);
  const blocked = validateOperation(t, server, action);
  if (blocked) return blocked;

  const lock = client.tryAcquireInstanceOperation(server!, action);
  if (!lock.acquired) {
    return t("instance-op-locked", {
      operation: t(`instance-op-action-${lock.operation}`),
      requested: t(`instance-op-action-${action}`),
    });
  }

  try {
    const approved = options.force
      ? true
      : await requestExecutionVote(
        ctx,
        session,
        t,
        config,
        server!,
        t(`instance-op-action-${action}`),
      );
    if (approved !== true) return approved;

    const current = await client.getFreshMinecraftInstance(server!);
    const recheckBlocked = validateOperation(t, current, action);
    if (recheckBlocked) return recheckBlocked;
    return await runOperation({ ctx, session, t, config, client, server: current!, action });
  } finally {
    client.invalidateMinecraftInstanceCache();
    lock.release();
  }
}

function validateOperation(
  t: TextResolver,
  server: MinecraftInstance | undefined,
  action: InstanceLifecycleAction,
) {
  if (!server) return t("instance-op-status-unknown");
  if (!server.nodeId) return t("instance-op-missing-node");
  if (!isAllowedStatus(action, server.status)) {
    return t(`instance-op-status-${server.status}`);
  }
  if (action !== "stop" && !server.address) {
    return t("instance-op-missing-address");
  }
}

async function runOperation(options: RunningOperationRequest) {
  const { ctx, session, t, config, client, server, action } = options;
  const deadline = Date.now() + config.instanceOperations.operationTimeout;
  await submitOnce({ ctx, client, server, action, deadline });
  void sendProgress({
    ctx,
    session,
    message: t(`instance-op-progress-${action}`),
    action,
    server,
  });

  let completed = false;
  if (action === "stop") {
    completed = await waitForStatus({ client, server, status: "stopped", deadline });
  } else if (action === "restart") {
    const interrupted = await waitForRestartInterruption(client, server, deadline);
    completed = interrupted && await waitForPing(client, server, deadline);
  } else if (action === "kill") {
    const stopped = await waitForStatus({ client, server, status: "stopped", deadline });
    if (stopped && Date.now() < deadline) {
      await submitOnce({ ctx, client, server, action: "start", deadline });
      completed = await waitForPing(client, server, deadline);
    }
  } else {
    completed = await waitForPing(client, server, deadline);
  }

  return completed
    ? t(`instance-op-success-${action}`)
    : t("instance-op-timeout", { action: t(`instance-op-action-${action}`) });
}

async function sendProgress(
  options: Pick<RunningOperationRequest, "ctx" | "session" | "action" | "server"> & {
    message: string;
  },
) {
  const { ctx, session, message, action, server } = options;
  try {
    await session.send(message);
  } catch (error) {
    ctx.logger("mcsm-portal-pro").warn(
      "failed to send instance operation progress: action=%s server=%s message=%s",
      action,
      server.name,
      formatErrorMessage(undefined, error),
    );
  }
}

async function submitOnce(
  options: Pick<RunningOperationRequest, "ctx" | "client" | "server" | "action"> & {
    deadline: number;
  },
) {
  const { ctx, client, server, action, deadline } = options;
  try {
    await client.operateInstance(server, action, deadline);
  } catch (error) {
    if (!isAmbiguousMCSManagerError(error)) throw error;
    ctx.logger("mcsm-portal-pro").warn(
      "instance operation response is ambiguous; polling without retry: action=%s server=%s message=%s",
      action,
      server.name,
      formatErrorMessage(undefined, error),
    );
  }
}

async function waitForStatus(options: {
  client: MCSManagerClient;
  server: MinecraftInstance;
  status: InstanceStatus;
  deadline: number;
}) {
  const { client, server, status, deadline } = options;
  return waitUntil(deadline, async () =>
    (await tryGetFreshInstance(client, server, deadline))?.status === status,
  );
}

async function waitForRestartInterruption(
  client: MCSManagerClient,
  server: MinecraftInstance,
  deadline: number,
) {
  return waitUntil(deadline, async () => {
    const current = await tryGetFreshInstance(client, server, deadline);
    if (current && current.status !== "running") return true;
    return !await canPing(client, server, deadline);
  });
}

async function waitForPing(
  client: MCSManagerClient,
  server: MinecraftInstance,
  deadline: number,
) {
  return waitUntil(deadline, () => canPing(client, server, deadline));
}

async function waitUntil(deadline: number, predicate: () => Promise<boolean>) {
  while (Date.now() < deadline) {
    if (await predicate()) return Date.now() <= deadline;
    const remaining = deadline - Date.now();
    if (remaining > 0) await sleep(Math.min(POLL_INTERVAL_MS, remaining));
  }
  return false;
}

async function tryGetFreshInstance(
  client: MCSManagerClient,
  server: MinecraftInstance,
  deadline: number,
) {
  try {
    return await client.getFreshMinecraftInstance(server, deadline);
  } catch {
    return undefined;
  }
}

async function canPing(
  client: MCSManagerClient,
  server: MinecraftInstance,
  deadline: number,
) {
  try {
    await client.pingMinecraftInstance(server, deadline);
    return true;
  } catch {
    return false;
  }
}

function isAllowedStatus(action: InstanceLifecycleAction, status: InstanceStatus) {
  return ALLOWED_STATUSES[action].includes(status);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatErrorMessage(t: TextResolver | undefined, error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return t?.("error-unknown") ?? String(error);
}
