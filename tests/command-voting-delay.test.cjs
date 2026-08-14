const test = require("node:test");
const assert = require("node:assert/strict");

const { requestExecutionVote } = require("../lib/command-voting.js");
const { createRuntimeConfig } = require("../lib/config.js");

function createSession({ userId, content = "", send, channelId = "channel-1" }) {
  return {
    userId,
    content,
    stripped: { atSelf: false, content },
    platform: "qq",
    isDirect: false,
    channelId,
    cid: `qq:${channelId}`,
    send,
  };
}

function createVotingRuntime(executionDelay, options = {}) {
  const messages = [];
  const middlewares = [];
  const send = (message) => {
    messages.push(message);
    return options.send?.(message, messages.length) ?? Promise.resolve();
  };
  const ctx = {
    middleware(handler) {
      middlewares.push(handler);
      return () => {
        const index = middlewares.indexOf(handler);
        if (index >= 0) middlewares.splice(index, 1);
      };
    },
    logger: () => ({ warn() {} }),
  };
  const session = createSession({ userId: "starter", send });
  const config = {
    commandExecution: {
      voting: {
        enabled: true,
        approveCount: options.approveCount ?? 2,
        timeout: 60_000,
        executionDelay,
        presentation: "qq-button",
        command: "vt",
      },
    },
  };
  const templates = {
    "exec-vote-title": "Vote",
    "exec-vote-server": "Server",
    "exec-vote-command": "Command",
    "exec-vote-progress-label": "Approvals",
    "exec-vote-status-active": "Voting",
    "exec-vote-approve": "Approve",
    "exec-vote-reject": "Reject",
    "exec-vote-execution-pending": "预计 {delay} 秒后执行，可使用 {voteCommand} no 终止执行。",
    "exec-vote-execution-cancelled": "指令执行已终止。",
  };
  const t = (key, params = {}) => Object.entries(params).reduce(
    (message, [name, value]) => message.replace(`{${name}}`, String(value)),
    templates[key] ?? key,
  );

  return {
    ctx,
    session,
    config,
    messages,
    middlewares,
    t,
    vote(content, userId = "voter", channelId = "channel-1") {
      const voteSession = createSession({ userId, content, send, channelId });
      return middlewares[0](voteSession, async () => {});
    },
  };
}

async function flushPromises() {
  await Promise.resolve();
  await Promise.resolve();
}

test("command execution delay defaults to 15 seconds", () => {
  const config = createRuntimeConfig({});

  assert.equal(config.commandExecution.voting.executionDelay, 15);
});

test("any group member can cancel command execution during the configured delay", async () => {
  const runtime = createVotingRuntime(15);
  const result = requestExecutionVote(
    runtime.ctx,
    runtime.session,
    runtime.t,
    runtime.config,
    { id: "server-1", name: "Server 1" },
    "kill @e",
  );

  await runtime.vote("vt yes", "approver");
  await flushPromises();

  assert.equal(runtime.messages[1], "预计 15 秒后执行，可使用 vt no 终止执行。");
  assert.equal(runtime.middlewares.length, 1);

  await runtime.vote("vt no", "observer");

  assert.equal(await result, undefined);
  assert.equal(runtime.messages.at(-1), "指令执行已终止。");
  assert.equal(runtime.middlewares.length, 0);
});

test("cancellation releases the vote scope without waiting for its confirmation message", async () => {
  const runtime = createVotingRuntime(15, {
    send: (_message, call) => call === 3 ? new Promise(() => {}) : Promise.resolve(),
  });
  const result = requestExecutionVote(
    runtime.ctx,
    runtime.session,
    runtime.t,
    runtime.config,
    { id: "server-1", name: "Server 1" },
    "kill @e",
  );
  let resolved = false;
  result.then(() => {
    resolved = true;
  });

  await runtime.vote("vt yes");
  await flushPromises();
  await runtime.vote("vt no", "observer");
  await flushPromises();

  assert.equal(resolved, true);
  assert.equal(await result, undefined);
  assert.equal(runtime.middlewares.length, 0);
});

test("rejection releases the vote scope without waiting for its result message", async () => {
  const runtime = createVotingRuntime(15, {
    send: (_message, call) => call === 2 ? new Promise(() => {}) : Promise.resolve(),
  });
  const result = requestExecutionVote(
    runtime.ctx,
    runtime.session,
    runtime.t,
    runtime.config,
    { id: "server-1", name: "Server 1" },
    "say hello",
  );

  await runtime.vote("vt no", "rejecter");
  await flushPromises();

  assert.equal(await result, undefined);
  assert.equal(runtime.middlewares.length, 0);
});

test("timeout releases the vote scope without waiting for its result message", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const runtime = createVotingRuntime(15, {
    send: (_message, call) => call === 2 ? new Promise(() => {}) : Promise.resolve(),
  });
  runtime.config.commandExecution.voting.timeout = 1000;
  const result = requestExecutionVote(
    runtime.ctx,
    runtime.session,
    runtime.t,
    runtime.config,
    { id: "server-1", name: "Server 1" },
    "say hello",
  );

  t.mock.timers.tick(1000);
  await flushPromises();

  assert.equal(await result, undefined);
  assert.equal(runtime.middlewares.length, 0);
});

test("a passed vote resolves only after the configured number of seconds", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const runtime = createVotingRuntime(5);
  const result = requestExecutionVote(
    runtime.ctx,
    runtime.session,
    runtime.t,
    runtime.config,
    { id: "server-1", name: "Server 1" },
    "say hello",
  );
  let resolved = false;
  result.then(() => {
    resolved = true;
  });

  await runtime.vote("vt yes");
  await flushPromises();
  t.mock.timers.tick(4_999);
  await flushPromises();
  assert.equal(resolved, false);

  t.mock.timers.tick(1);

  assert.equal(await result, true);
  assert.equal(runtime.middlewares.length, 0);
});

test("the delay starts when the vote passes even while its notice is pending", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const runtime = createVotingRuntime(5, {
    send: (_message, call) => call === 2 ? new Promise(() => {}) : Promise.resolve(),
  });
  const result = requestExecutionVote(
    runtime.ctx,
    runtime.session,
    runtime.t,
    runtime.config,
    { id: "server-1", name: "Server 1" },
    "say hello",
  );

  await runtime.vote("vt yes");
  t.mock.timers.tick(5_000);

  assert.equal(await result, true);
  assert.equal(runtime.middlewares.length, 0);
});

test("a failed delay notice does not overturn a passed vote", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const runtime = createVotingRuntime(5, {
    send: (_message, call) => call === 2
      ? Promise.reject(new Error("notice failed"))
      : Promise.resolve(),
  });
  const result = requestExecutionVote(
    runtime.ctx,
    runtime.session,
    runtime.t,
    runtime.config,
    { id: "server-1", name: "Server 1" },
    "say hello",
  );

  await runtime.vote("vt yes");
  await flushPromises();
  t.mock.timers.tick(5_000);

  assert.equal(await result, true);
});

test("a different group cannot cancel pending command execution", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const runtime = createVotingRuntime(5);
  const result = requestExecutionVote(
    runtime.ctx,
    runtime.session,
    runtime.t,
    runtime.config,
    { id: "server-1", name: "Server 1" },
    "say hello",
  );

  await runtime.vote("vt yes");
  await flushPromises();
  await runtime.vote("vt no", "outsider", "channel-2");
  t.mock.timers.tick(5_000);

  assert.equal(await result, true);
});

test("a stale vote progress failure cannot cancel an already passed vote", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let rejectStaleUpdate;
  const staleUpdate = new Promise((_, reject) => {
    rejectStaleUpdate = reject;
  });
  const runtime = createVotingRuntime(5, {
    approveCount: 3,
    send: (_message, call) => call === 2 ? staleUpdate : Promise.resolve(),
  });
  const result = requestExecutionVote(
    runtime.ctx,
    runtime.session,
    runtime.t,
    runtime.config,
    { id: "server-1", name: "Server 1" },
    "say hello",
  );

  await runtime.vote("vt yes", "voter-1");
  await runtime.vote("vt yes", "voter-2");
  rejectStaleUpdate(new Error("stale render failed"));
  await flushPromises();
  t.mock.timers.tick(5_000);

  assert.equal(await result, true);
});
