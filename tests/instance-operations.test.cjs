const test = require("node:test");
const assert = require("node:assert/strict");

const {
  MCSManagerClient,
  isAmbiguousMCSManagerError,
} = require("../lib/client.js");
const { executeServerCommand } = require("../lib/command-execution.js");
const { createRuntimeConfig } = require("../lib/config.js");
const { executeInstanceOperation } = require("../lib/instance-operations.js");
const minecraftStatus = require("../lib/minecraft-status.js");

const TEMPLATES = {
  "instance-op-low-authority": "权限不足。",
  "instance-op-action-exec": "执行终端命令",
  "instance-op-action-start": "启动",
  "instance-op-action-stop": "关闭",
  "instance-op-action-restart": "重启",
  "instance-op-action-kill": "终止并重启",
  "instance-op-request-exec": "终端命令",
  "instance-op-status-running": "实例正在运行，无法执行。",
  "instance-op-status-stopped": "实例已停止，无法执行。",
  "instance-op-status-starting": "实例正在启动，无法执行。",
  "instance-op-status-stopping": "实例正在停止，无法执行。",
  "instance-op-status-unknown": "实例状态未知，无法执行。",
  "instance-op-missing-node": "缺少节点 ID，无法执行。",
  "instance-op-missing-address": "无法获取服务器地址，无法执行。",
  "instance-op-locked": "实例已有操作进行中（{operation}），无法执行{requested}。",
  "instance-op-progress-start": "正在启动，等待 Minecraft 响应",
  "instance-op-progress-stop": "正在关闭",
  "instance-op-progress-restart": "正在重启，等待 Minecraft 响应",
  "instance-op-progress-kill": "正在终止并重启，等待 Minecraft 响应",
  "instance-op-success-start": "Minecraft 已响应 Ping，启动完成",
  "instance-op-success-stop": "关闭完成",
  "instance-op-success-restart": "Minecraft 已响应 Ping，重启完成",
  "instance-op-success-kill": "Minecraft 已响应 Ping，终止并重启完成",
  "instance-op-timeout": "{action}超时",
  "instance-op-failed": "{action}失败：{message}",
};

function server(status = "running", address = "play.example.com:25565") {
  return {
    id: "server-1",
    name: "Server 1",
    nodeId: "node-1",
    nodeName: "Node 1",
    status,
    address,
    tags: [],
    modList: [],
  };
}

function createRuntime(options = {}) {
  const messages = [];
  const operations = [];
  const fresh = [...(options.fresh ?? [])];
  const ping = [...(options.ping ?? [])];
  const selected = options.selected ?? server();
  const client = {
    listMinecraftInstances: async (isFresh) => {
      assert.equal(isFresh, true);
      return [selected];
    },
    getFreshMinecraftInstance: async () => fresh.shift() ?? selected,
    tryAcquireInstanceOperation: () => options.locked
      ? { acquired: false, operation: options.locked }
      : { acquired: true, release() {} },
    invalidateMinecraftInstanceCache() {},
    operateInstance: async (_server, action) => {
      operations.push(action);
      if (options.operateError) throw options.operateError;
    },
    pingMinecraftInstance: async () => {
      const result = ping.shift();
      if (result instanceof Error) throw result;
    },
  };
  const ctx = {
    permissions: { test: async () => true },
    logger: () => ({ warn() {} }),
  };
  const session = {
    userId: "starter",
    isDirect: false,
    channelId: "channel-1",
    cid: "qq:channel-1",
    send: async (message) => {
      messages.push(message);
      if (options.sendPending) return new Promise(() => {});
      if (options.sendError) throw options.sendError;
    },
    text: (key, params = {}) => {
      const name = key.split(".").at(-1);
      return Object.entries(params).reduce(
        (text, [param, value]) => text.replace(`{${param}}`, String(value)),
        TEMPLATES[name] ?? name,
      );
    },
  };
  const config = {
    instanceOperations: {
      enabled: true,
      authority: 3,
      operationTimeout: 300_000,
    },
    commandExecution: {
      selectionTimeout: 60_000,
      voting: { enabled: true, approveCount: 1 },
    },
  };
  return { client, config, ctx, messages, operations, session };
}

test("instance operations are disabled by default with a five-minute timeout", () => {
  const config = createRuntimeConfig({});

  assert.deepEqual(config.instanceOperations, {
    enabled: false,
    authority: 3,
    operationTimeout: 300_000,
  });
});

test("instance locks report the active operation and release only their own token", () => {
  const client = new MCSManagerClient(
    {},
    { endpoint: "", apiKey: "", apiKeyParam: "apikey", timeout: 3000 },
    {},
    0,
    false,
  );
  const instance = server();
  const first = client.tryAcquireInstanceOperation(instance, "restart");
  const blocked = client.tryAcquireInstanceOperation(instance, "exec");

  assert.equal(first.acquired, true);
  assert.deepEqual(blocked, { acquired: false, operation: "restart" });
  first.release();
  assert.equal(client.tryAcquireInstanceOperation(instance, "exec").acquired, true);
});

test("MCSManager lifecycle actions use the official protected-instance routes", async () => {
  const paths = [];
  const client = new MCSManagerClient(
    {
      http: {
        get: async (path) => {
          paths.push(path);
          return {};
        },
      },
      logger: () => ({ info() {} }),
    },
    {
      endpoint: "https://panel.example.com",
      apiKey: "key",
      apiKeyParam: "apikey",
      timeout: 3000,
    },
    {},
    0,
    false,
  );

  for (const action of ["start", "stop", "restart", "kill"]) {
    await client.operateInstance(server(), action);
  }

  assert.deepEqual(paths, [
    "/api/protected_instance/open",
    "/api/protected_instance/stop",
    "/api/protected_instance/restart",
    "/api/protected_instance/kill",
  ]);
});

test("only network failures and server errors have an ambiguous operation result", () => {
  assert.equal(isAmbiguousMCSManagerError(Object.assign(new Error("forbidden"), { status: 403 })), false);
  assert.equal(isAmbiguousMCSManagerError(new Error("MCSManager endpoint is not configured.")), false);
  assert.equal(isAmbiguousMCSManagerError(Object.assign(new Error("unavailable"), { status: 503 })), true);
  assert.equal(isAmbiguousMCSManagerError(Object.assign(new Error("reset"), { code: "ECONNRESET" })), true);
  assert.equal(isAmbiguousMCSManagerError(new Error("request failed", {
    cause: Object.assign(new Error("DNS unavailable"), { code: "EAI_AGAIN" }),
  })), true);
});

test("operation HTTP and Minecraft Ping requests use only the remaining deadline", async () => {
  const httpTimeouts = [];
  const pingTimeouts = [];
  const client = new MCSManagerClient(
    {
      http: {
        get: async (_path, options) => {
          httpTimeouts.push(options.timeout);
          return {};
        },
      },
      logger: () => ({ info() {} }),
    },
    {
      endpoint: "https://panel.example.com",
      apiKey: "key",
      apiKeyParam: "apikey",
      timeout: 10_000,
    },
    {},
    0,
    false,
  );
  const originalQuery = minecraftStatus.queryMinecraftStatus;
  minecraftStatus.queryMinecraftStatus = async (_address, timeout) => {
    pingTimeouts.push(timeout);
    return {};
  };

  try {
    const deadline = Date.now() + 100;
    await client.operateInstance(server(), "restart", deadline);
    await client.pingMinecraftInstance(server(), deadline);

    assert.equal(httpTimeouts.length, 1);
    assert.equal(pingTimeouts.length, 1);
    assert.ok(httpTimeouts[0] > 0 && httpTimeouts[0] <= 100);
    assert.ok(pingTimeouts[0] > 0 && pingTimeouts[0] <= 100);
  } finally {
    minecraftStatus.queryMinecraftStatus = originalQuery;
  }
});

test("an ambiguous API failure is polled without repeating the operation", async () => {
  const error = Object.assign(new Error("unavailable"), { status: 503 });
  const runtime = createRuntime({
    fresh: [server(), server(), server()],
    ping: [new Error("connection refused"), undefined],
    operateError: error,
  });

  const result = await executeInstanceOperation({
    ctx: runtime.ctx,
    session: runtime.session,
    scope: "commands.rc.messages",
    config: runtime.config,
    client: runtime.client,
    action: "restart",
  });

  assert.equal(result, "Minecraft 已响应 Ping，重启完成");
  assert.deepEqual(runtime.operations, ["restart"]);
});

test("a nested transport failure is polled without repeating the operation", async () => {
  const error = new Error("request failed", {
    cause: Object.assign(new Error("connect timeout"), {
      code: "UND_ERR_CONNECT_TIMEOUT",
    }),
  });
  const runtime = createRuntime({
    fresh: [server(), server(), server()],
    ping: [new Error("connection refused"), undefined],
    operateError: error,
  });

  const result = await executeInstanceOperation({
    ctx: runtime.ctx,
    session: runtime.session,
    scope: "commands.rc.messages",
    config: runtime.config,
    client: runtime.client,
    action: "restart",
  });

  assert.equal(result, "Minecraft 已响应 Ping，重启完成");
  assert.deepEqual(runtime.operations, ["restart"]);
});

test("a deterministic local API error fails immediately", async () => {
  const runtime = createRuntime({
    fresh: [server(), server()],
    operateError: new Error("MCSManager endpoint is not configured."),
  });

  const result = await executeInstanceOperation({
    ctx: runtime.ctx,
    session: runtime.session,
    scope: "commands.rc.messages",
    config: runtime.config,
    client: runtime.client,
    action: "restart",
  });

  assert.equal(result, "重启失败：MCSManager endpoint is not configured.");
  assert.deepEqual(runtime.operations, ["restart"]);
  assert.deepEqual(runtime.messages, []);
});

test("a status change after approval prevents the operation API call", async () => {
  const runtime = createRuntime({
    fresh: [server("running"), server("stopped")],
  });

  const result = await executeInstanceOperation({
    ctx: runtime.ctx,
    session: runtime.session,
    scope: "commands.rc.messages",
    config: runtime.config,
    client: runtime.client,
    action: "stop",
  });

  assert.equal(result, "实例已停止，无法执行。");
  assert.deepEqual(runtime.operations, []);
});

test("restart observes an interruption before accepting a successful Ping", async () => {
  const runtime = createRuntime({
    fresh: [server(), server(), server()],
    ping: [new Error("connection refused"), undefined],
  });

  const result = await executeInstanceOperation({
    ctx: runtime.ctx,
    session: runtime.session,
    scope: "commands.rc.messages",
    config: runtime.config,
    client: runtime.client,
    action: "restart",
  });

  assert.equal(result, "Minecraft 已响应 Ping，重启完成");
  assert.deepEqual(runtime.operations, ["restart"]);
  assert.deepEqual(runtime.messages, ["正在重启，等待 Minecraft 响应"]);
});

test("a pending progress message does not block operation completion", async () => {
  const runtime = createRuntime({
    fresh: [server(), server(), server()],
    ping: [new Error("connection refused"), undefined],
    sendPending: true,
  });

  const result = await executeInstanceOperation({
    ctx: runtime.ctx,
    session: runtime.session,
    scope: "commands.rc.messages",
    config: runtime.config,
    client: runtime.client,
    action: "restart",
  });

  assert.equal(result, "Minecraft 已响应 Ping，重启完成");
  assert.deepEqual(runtime.operations, ["restart"]);
});

test("kill waits for stopped, starts once, then waits for Ping", async () => {
  const runtime = createRuntime({
    fresh: [server(), server(), server("stopped")],
    ping: [undefined],
  });

  const result = await executeInstanceOperation({
    ctx: runtime.ctx,
    session: runtime.session,
    scope: "commands.rc.messages",
    config: runtime.config,
    client: runtime.client,
    action: "kill",
  });

  assert.equal(result, "Minecraft 已响应 Ping，终止并重启完成");
  assert.deepEqual(runtime.operations, ["kill", "start"]);
  assert.deepEqual(runtime.messages, ["正在终止并重启，等待 Minecraft 响应"]);
});

test("kill does not start after the shared operation deadline expires", async () => {
  const runtime = createRuntime();
  const sequence = [
    server(),
    server(),
    new Promise((resolve) => setTimeout(() => resolve(server("stopped")), 5)),
  ];
  runtime.client.getFreshMinecraftInstance = async () => await sequence.shift();
  runtime.config.instanceOperations.operationTimeout = 1;

  const result = await executeInstanceOperation({
    ctx: runtime.ctx,
    session: runtime.session,
    scope: "commands.rc.messages",
    config: runtime.config,
    client: runtime.client,
    action: "kill",
  });

  assert.equal(result, "终止并重启超时");
  assert.deepEqual(runtime.operations, ["kill"]);
});

test("a locked instance does not start another vote or API operation", async () => {
  const runtime = createRuntime({
    fresh: [server()],
    locked: "exec",
  });

  const result = await executeInstanceOperation({
    ctx: runtime.ctx,
    session: runtime.session,
    scope: "commands.rc.messages",
    config: runtime.config,
    client: runtime.client,
    action: "restart",
  });

  assert.equal(result, "实例已有操作进行中（执行终端命令），无法执行重启。");
  assert.deepEqual(runtime.operations, []);
});

test("force lifecycle execution requires authority 5 and skips voting", async () => {
  const checked = [];
  const runtime = createRuntime();
  runtime.ctx.permissions.test = async ([permission]) => {
    checked.push(permission);
    return permission !== "authority:5";
  };

  const denied = await executeInstanceOperation({
    ctx: runtime.ctx,
    session: runtime.session,
    scope: "commands.rc.messages",
    config: runtime.config,
    client: runtime.client,
    action: "stop",
    force: true,
  });

  assert.equal(denied, "权限不足。");
  assert.deepEqual(checked, ["authority:3", "authority:5"]);
  assert.deepEqual(runtime.operations, []);
});

test("authority 5 can force lifecycle execution without starting a vote", async () => {
  const runtime = createRuntime({
    fresh: [server(), server(), server("stopped")],
  });
  runtime.config.commandExecution.voting.approveCount = 2;

  const result = await executeInstanceOperation({
    ctx: runtime.ctx,
    session: runtime.session,
    scope: "commands.rc.messages",
    config: runtime.config,
    client: runtime.client,
    action: "stop",
    force: true,
  });

  assert.equal(result, "关闭完成");
  assert.deepEqual(runtime.operations, ["stop"]);
});

test("a lifecycle lock blocks the real terminal execution workflow", async () => {
  const client = new MCSManagerClient(
    {},
    { endpoint: "", apiKey: "", apiKeyParam: "apikey", timeout: 3000 },
    {},
    0,
    false,
  );
  const instance = server();
  const lifecycleLock = client.tryAcquireInstanceOperation(instance, "restart");
  client.listMinecraftInstances = async () => [instance];
  let executions = 0;
  client.executeInstanceCommand = async () => {
    executions += 1;
    return "unexpected";
  };
  const ctx = {
    permissions: { test: async () => true },
    logger: () => ({ warn() {} }),
  };
  const session = {
    text: (key, params = {}) => Object.entries(params).reduce(
      (text, [param, value]) => text.replace(`{${param}}`, String(value)),
      TEMPLATES[key.split(".").at(-1)] ?? key.split(".").at(-1),
    ),
  };
  const config = {
    commandExecution: {
      enabled: true,
      authority: 3,
      selectionTimeout: 60_000,
      commandTimeout: 60_000,
      maxResultLength: 1800,
      voting: { enabled: false, approveCount: 2 },
    },
  };

  try {
    const result = await executeServerCommand(
      ctx,
      session,
      "commands.rc.messages",
      config,
      client,
      { input: "say hello" },
    );
    assert.equal(result, "实例已有操作进行中（重启），无法执行终端命令。");
    assert.equal(executions, 0);
  } finally {
    lifecycleLock.release();
  }
});

test("authority 5 can force terminal execution without starting a vote", async () => {
  const checked = [];
  const instance = server();
  const client = {
    listMinecraftInstances: async () => [instance],
    tryAcquireInstanceOperation: () => ({ acquired: true, release() {} }),
    executeInstanceCommand: async (_server, command) => `sent: ${command}`,
  };
  const ctx = {
    permissions: {
      test: async ([permission]) => {
        checked.push(permission);
        return true;
      },
    },
    logger: () => ({ warn() {} }),
  };
  const session = {
    text: (key, params = {}) => Object.entries(params).reduce(
      (text, [param, value]) => text.replace(`{${param}}`, String(value)),
      TEMPLATES[key.split(".").at(-1)] ?? key.split(".").at(-1),
    ),
  };
  const config = {
    commandExecution: {
      enabled: true,
      authority: 3,
      selectionTimeout: 60_000,
      commandTimeout: 60_000,
      maxResultLength: 1800,
      voting: { enabled: true, approveCount: 2 },
    },
  };

  const result = await executeServerCommand(
    ctx,
    session,
    "commands.rc.messages",
    config,
    client,
    { input: "say hello", force: true },
  );

  assert.equal(result, "exec-result");
  assert.deepEqual(checked, ["authority:3", "authority:5"]);
});
