const test = require("node:test");
const assert = require("node:assert/strict");

const { MCSManagerClient } = require("../lib/client.js");

const DISABLED_API_KEY_BODY = JSON.stringify({
  status: 403,
  data: "The administrator has disabled the use of the API key. \nPlease contact the administrator and set \"enableApiKey\" to \"true\" in the configuration file to enable normal use of the API endpoints.",
  time: 1785200979803,
});

function createClient(error) {
  const client = new MCSManagerClient(
    {
      http: {
        get: async () => {
          throw error;
        },
      },
      logger: () => ({ info() {}, warn() {} }),
    },
    {
      endpoint: "http://panel.example:23333",
      apiKey: "key",
      apiKeyParam: "apikey",
      timeout: 1000,
    },
    {},
    30,
    false,
  );
  return client;
}

function createHttpError(statusText, response) {
  const error = new Error(statusText);
  error.response = response;
  return error;
}

test("panel text/plain error bodies are surfaced in the error message", async () => {
  const client = createClient(createHttpError("Forbidden", {
    status: 403,
    statusText: "Forbidden",
    data: DISABLED_API_KEY_BODY,
  }));

  await assert.rejects(
    () => client.request("/api/service/remote_services_list"),
    (error) => {
      assert.match(error.message, /^Forbidden: /);
      assert.match(error.message, /disabled the use of the API key/);
      assert.doesNotMatch(error.message, /\n/);
      return true;
    },
  );
});

test("panel JSON error bodies are surfaced in the error message", async () => {
  const client = createClient(createHttpError("Forbidden", {
    status: 403,
    statusText: "Forbidden",
    data: { status: 403, data: "密钥不正确", time: 1785201678340 },
  }));

  await assert.rejects(
    () => client.request("/api/overview"),
    (error) => {
      assert.equal(error.message, "Forbidden: 密钥不正确");
      return true;
    },
  );
});

test("errors without a response body keep their original message", async () => {
  const client = createClient(new Error("connect ECONNREFUSED 127.0.0.1:23333"));

  await assert.rejects(
    () => client.request("/api/overview"),
    (error) => {
      assert.equal(error.message, "connect ECONNREFUSED 127.0.0.1:23333");
      return true;
    },
  );
});

test("duplicated detail is not appended twice", async () => {
  const client = createClient(createHttpError("密钥不正确", {
    status: 403,
    data: { status: 403, data: "密钥不正确" },
  }));

  await assert.rejects(
    () => client.request("/api/overview"),
    (error) => {
      assert.equal(error.message, "密钥不正确");
      return true;
    },
  );
});

test("long panel error bodies are truncated", async () => {
  const client = createClient(createHttpError("Internal Server Error", {
    status: 500,
    data: { status: 500, data: "x".repeat(1000) },
  }));

  await assert.rejects(
    () => client.request("/api/overview"),
    (error) => {
      assert.ok(error.message.length < 400, `message too long: ${error.message.length}`);
      assert.match(error.message, /…$/);
      return true;
    },
  );
});

test("reverse proxy HTML error pages are not appended", async () => {
  const client = createClient(createHttpError("Forbidden", {
    status: 403,
    data: "<html>\r\n<head><title>403 Forbidden</title></head>\r\n<body><center><h1>403 Forbidden</h1></center></body>\r\n</html>",
  }));

  await assert.rejects(
    () => client.request("/api/overview"),
    (error) => {
      assert.equal(error.message, "Forbidden");
      return true;
    },
  );
});

test("enriched 404 messages still disable the unsupported global instance endpoint", async () => {
  const client = createClient(new Error("unused"));
  const notFound = createHttpError("Not Found", {
    status: 404,
    data: JSON.stringify({ status: 404, data: "[404] Not Found", time: 1 }),
  });
  const warnings = [];
  let globalCalls = 0;
  let perNodeCalls = 0;

  client.ctx = {
    logger: () => ({ info() {}, warn: (...args) => warnings.push(args) }),
  };
  client.listNodes = async () => [{ id: "node-1" }];
  client.listInstancesGlobal = async () => {
    globalCalls += 1;
    const error = new Error(notFound.message);
    error.response = notFound.response;
    // simulate request() enrichment
    error.message = "Not Found: [404] Not Found";
    throw error;
  };
  client.listInstancesByNode = async () => {
    perNodeCalls += 1;
    return [];
  };

  await client.listInstances();
  await client.listInstances();

  assert.equal(globalCalls, 1);
  assert.equal(perNodeCalls, 2);
  assert.equal(warnings.length, 0);
});
