const test = require("node:test");
const assert = require("node:assert/strict");

const minecraftStatus = require("../lib/minecraft-status.js");
const { MCSManagerClient } = require("../lib/client.js");

function createInstance(name, status, pingConfig) {
  return {
    instanceUuid: `instance-${name}`,
    status,
    config: {
      nickname: name,
      type: "minecraft/java",
      tag: [],
      pingConfig,
      docker: { ports: [] },
    },
    info: {
      currentPlayers: 0,
      maxPlayers: 0,
      version: "",
      allocatedPorts: [],
    },
  };
}

function createClient(instances, properties = { "server-port": 25567 }) {
  const requests = [];
  const ctx = {
    http: {
      get: async (path, options) => {
        requests.push({ path, params: options.params });
        if (path === "/api/service/remote_services_list") {
          return [{
            uuid: "node-1",
            ip: "wss://daemon.example.com",
            available: true,
            remarks: "node",
          }];
        }
        if (path === "/api/service/remote_services_system") return [];
        if (path === "/api/service/remote_services_instances_global") {
          throw new Error("Not Found");
        }
        if (path === "/api/service/remote_service_instances") {
          return { page: 1, pageSize: 50, maxPage: 1, data: instances };
        }
        if (path === "/api/protected_instance/process_config/file") {
          return properties;
        }
        throw new Error(`Unexpected request: ${path}`);
      },
    },
    logger: () => ({ info() {}, warn() {} }),
  };
  const client = new MCSManagerClient(
    ctx,
    {
      endpoint: "https://panel.example.com",
      apiKey: "test-key",
      apiKeyParam: "apikey",
      timeout: 3000,
    },
    {
      pageSize: 50,
      typeKeywords: ["minecraft"],
      latencyFallback: [],
    },
    0,
    false,
  );
  return { client, requests };
}

test("infers an unconfigured Minecraft address from a peer host and server.properties", async () => {
  const instances = [
    createInstance("configured", 0, { ip: "play.example.com", port: 25565, type: 1 }),
    createInstance("private", 0, { ip: "192.168.31.19", port: 25566, type: 1 }),
    createInstance("unconfigured", 3, { ip: "", port: 0, type: 1 }),
  ];
  const runtime = createClient(instances);
  const queriedAddresses = [];
  const originalQuery = minecraftStatus.queryMinecraftStatus;
  minecraftStatus.queryMinecraftStatus = async (address) => {
    queriedAddresses.push(address);
    return {
      onlinePlayers: 1,
      maxPlayers: 20,
      version: "1.21.1",
      motd: "hello",
      iconUrl: "data:image/png;base64,icon",
      latencyMs: 12,
    };
  };

  try {
    const result = await runtime.client.listMinecraftInstances();
    const inferred = result.find((instance) => instance.name === "unconfigured");

    assert.equal(inferred.address, "play.example.com:25567");
    assert.equal(inferred.onlinePlayers, 1);
    assert.equal(inferred.version, "1.21.1");
    assert.deepEqual(queriedAddresses, ["play.example.com:25567"]);
    assert.ok(runtime.requests.some(({ path, params }) => (
      path === "/api/protected_instance/process_config/file" &&
      params.fileName === "server.properties" &&
      params.type === "properties"
    )));
  } finally {
    minecraftStatus.queryMinecraftStatus = originalQuery;
  }
});

test("does not substitute the MCSManager daemon host for a game host", async () => {
  const runtime = createClient([
    createInstance("unconfigured", 3, { ip: "", port: 0, type: 1 }),
  ]);
  const queriedAddresses = [];
  const originalQuery = minecraftStatus.queryMinecraftStatus;
  minecraftStatus.queryMinecraftStatus = async (address) => {
    queriedAddresses.push(address);
    return { latencyMs: 1 };
  };

  try {
    const [instance] = await runtime.client.listMinecraftInstances();

    assert.equal(instance.address, undefined);
    assert.deepEqual(queriedAddresses, []);
  } finally {
    minecraftStatus.queryMinecraftStatus = originalQuery;
  }
});

test("keeps an inferred address only after its Minecraft status probe succeeds", async () => {
  const runtime = createClient([
    createInstance("configured", 0, { ip: "play.example.com", port: 25565, type: 1 }),
    createInstance("unconfigured", 3, { ip: "", port: 0, type: 1 }),
  ]);
  const originalQuery = minecraftStatus.queryMinecraftStatus;
  minecraftStatus.queryMinecraftStatus = async () => {
    throw new Error("connection refused");
  };

  try {
    const result = await runtime.client.listMinecraftInstances();
    const inferred = result.find((instance) => instance.name === "unconfigured");

    assert.equal(inferred.address, undefined);
  } finally {
    minecraftStatus.queryMinecraftStatus = originalQuery;
  }
});

test("does not guess when a node has multiple public game hosts", async () => {
  const runtime = createClient([
    createInstance("configured-a", 0, { ip: "play-a.example.com", port: 25565, type: 1 }),
    createInstance("configured-b", 0, { ip: "play-b.example.com", port: 25566, type: 1 }),
    createInstance("unconfigured", 3, { ip: "", port: 0, type: 1 }),
  ]);
  const queriedAddresses = [];
  const originalQuery = minecraftStatus.queryMinecraftStatus;
  minecraftStatus.queryMinecraftStatus = async (address) => {
    queriedAddresses.push(address);
    return { latencyMs: 1 };
  };

  try {
    const result = await runtime.client.listMinecraftInstances();
    const inferred = result.find((instance) => instance.name === "unconfigured");

    assert.equal(inferred.address, undefined);
    assert.deepEqual(queriedAddresses, []);
  } finally {
    minecraftStatus.queryMinecraftStatus = originalQuery;
  }
});

test("keeps an explicit pingConfig address without reading server.properties", async () => {
  const runtime = createClient([
    createInstance("configured", 3, { ip: "play.example.com", port: 25570, type: 1 }),
  ]);
  const queriedAddresses = [];
  const originalQuery = minecraftStatus.queryMinecraftStatus;
  minecraftStatus.queryMinecraftStatus = async (address) => {
    queriedAddresses.push(address);
    return { latencyMs: 1 };
  };

  try {
    const [instance] = await runtime.client.listMinecraftInstances();

    assert.equal(instance.address, "play.example.com:25570");
    assert.deepEqual(queriedAddresses, ["play.example.com:25570"]);
    assert.equal(runtime.requests.some(({ path }) => (
      path === "/api/protected_instance/process_config/file"
    )), false);
  } finally {
    minecraftStatus.queryMinecraftStatus = originalQuery;
  }
});

test("rejects an invalid server.properties port", async () => {
  const runtime = createClient([
    createInstance("configured", 0, { ip: "play.example.com", port: 25565, type: 1 }),
    createInstance("unconfigured", 3, { ip: "", port: 0, type: 1 }),
  ], { "server-port": 70000 });
  const queriedAddresses = [];
  const originalQuery = minecraftStatus.queryMinecraftStatus;
  minecraftStatus.queryMinecraftStatus = async (address) => {
    queriedAddresses.push(address);
    return { latencyMs: 1 };
  };

  try {
    const result = await runtime.client.listMinecraftInstances();
    const inferred = result.find((instance) => instance.name === "unconfigured");

    assert.equal(inferred.address, undefined);
    assert.deepEqual(queriedAddresses, []);
  } finally {
    minecraftStatus.queryMinecraftStatus = originalQuery;
  }
});
