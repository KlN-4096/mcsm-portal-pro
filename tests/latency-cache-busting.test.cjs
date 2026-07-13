const test = require("node:test");
const assert = require("node:assert/strict");

const { MCSManagerClient } = require("../lib/client.js");

test("remote latency requests bypass upstream URL caches", async () => {
  const requestedUrls = [];
  const ctx = {
    http: {
      get: async (url) => {
        requestedUrls.push(url);
        return { delay: 42 };
      },
    },
    logger: () => ({ info() {}, warn() {} }),
  };
  const client = new MCSManagerClient(
    ctx,
    { endpoint: "", apiKey: "", apiKeyParam: "apikey", timeout: 3000 },
    {
      pageSize: 20,
      typeKeywords: [],
      defaultStatuses: ["running"],
      latencyFallback: [
        {
          name: "test",
          url: "https://example.com/status?host={host}&port={port}",
        },
      ],
      latencyCacheTtl: 0,
      latencyFallbackStrategy: "fallback",
      latencyFallbackTrigger: "always",
      latencyFallbackLocalThreshold: 10,
      latencyFallbackKeys: ["delay"],
    },
    0,
    false,
  );
  const instance = {
    id: "test",
    name: "test",
    address: "mc.example.com:25565",
    status: "running",
  };
  const originalNow = Date.now;

  try {
    Date.now = () => 1000;
    await client.resolveLatency(instance, 5, 3000);
    Date.now = () => 2000;
    await client.resolveLatency(instance, 5, 3000);
  } finally {
    Date.now = originalNow;
  }

  assert.deepEqual(
    requestedUrls.map((value) => new URL(value).searchParams.get("_mcsm_ts")),
    ["1000", "2000"],
  );
});
