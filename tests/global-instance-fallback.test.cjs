const test = require("node:test");
const assert = require("node:assert/strict");

const { MCSManagerClient } = require("../lib/client.js");

function createClient(globalError) {
  const warnings = [];
  const client = new MCSManagerClient(
    {
      logger: () => ({
        info() {},
        warn: (...args) => warnings.push(args),
      }),
    },
    {},
    {},
    30,
    false,
  );
  let globalCalls = 0;
  let perNodeCalls = 0;

  client.listNodes = async () => [{ id: "node-1" }];
  client.listInstancesGlobal = async () => {
    globalCalls += 1;
    throw globalError;
  };
  client.listInstancesByNode = async () => {
    perNodeCalls += 1;
    return [];
  };

  return {
    client,
    warnings,
    globalCalls: () => globalCalls,
    perNodeCalls: () => perNodeCalls,
  };
}

test("Not Found disables the unsupported global instance endpoint", async () => {
  const runtime = createClient(new Error("Not Found"));

  await runtime.client.listInstances();
  await runtime.client.listInstances();

  assert.equal(runtime.globalCalls(), 1);
  assert.equal(runtime.perNodeCalls(), 2);
  assert.equal(runtime.warnings.length, 0);
});

test("unexpected global instance errors remain visible and retryable", async () => {
  const runtime = createClient(new Error("Unauthorized"));

  await runtime.client.listInstances();
  await runtime.client.listInstances();

  assert.equal(runtime.globalCalls(), 2);
  assert.equal(runtime.perNodeCalls(), 2);
  assert.equal(runtime.warnings.length, 2);
});

test("unrelated not found messages do not disable the global endpoint", async () => {
  const runtime = createClient(new Error("API key not found"));

  await runtime.client.listInstances();
  await runtime.client.listInstances();

  assert.equal(runtime.globalCalls(), 2);
  assert.equal(runtime.perNodeCalls(), 2);
  assert.equal(runtime.warnings.length, 2);
});
