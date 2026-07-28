const test = require("node:test");
const assert = require("node:assert/strict");

const {
  renderVisualizationImage,
} = require("../lib/visualization/renderer.js");

const config = {
  debug: false,
  image: {
    puppeteer: true,
    renderScale: 1,
  },
};
const result = {
  width: 320,
  height: 180,
  html: "<div>test</div>",
  layout: { surface: "server-list" },
};

function createContext(puppeteer) {
  return {
    puppeteer,
    logger: () => ({ info() {}, warn() {} }),
  };
}

function createPage(overrides = {}) {
  return {
    setViewport: async () => {},
    setContent: async () => {},
    evaluate: async (script) => (
      typeof script === "string" && script.includes("scrollHeight")
        ? result.height
        : true
    ),
    screenshot: async () => Buffer.from("png"),
    close: async () => {},
    ...overrides,
  };
}

test("falls back after a disconnect and retries Puppeteer on the next render", async () => {
  let pageCalls = 0;
  const ctx = createContext({
    page: async () => {
      pageCalls += 1;
      if (pageCalls === 1) {
        throw new Error("Protocol error: Connection closed.");
      }
      return createPage();
    },
  });

  const first = await renderVisualizationImage(ctx, config, result);
  const second = await renderVisualizationImage(ctx, config, result);

  assert.match(first.attrs.src, /^data:image\/svg\+xml/);
  assert.equal(second.attrs.src, "data:image/png;base64,cG5n");
  assert.equal(pageCalls, 2);
});

test("keeps a rendered PNG when closing its page fails", async () => {
  const image = await renderVisualizationImage(
    createContext({
      page: async () => createPage({
        close: async () => {
          throw new Error("Protocol error: Connection closed.");
        },
      }),
    }),
    config,
    result,
  );

  assert.equal(image.attrs.src, "data:image/png;base64,cG5n");
});

test("does not hide non-connection page creation errors", async () => {
  await assert.rejects(
    renderVisualizationImage(
      createContext({
        page: async () => {
          throw new Error("launch misconfigured");
        },
      }),
      config,
      result,
    ),
    /launch misconfigured/,
  );
});

test("does not hide non-connection rendering errors", async () => {
  await assert.rejects(
    renderVisualizationImage(
      createContext({
        page: async () => createPage({
          setViewport: async () => {
            throw new Error("invalid viewport");
          },
        }),
      }),
      config,
      result,
    ),
    /invalid viewport/,
  );
});

test("does not hide non-connection page cleanup errors", async () => {
  await assert.rejects(
    renderVisualizationImage(
      createContext({
        page: async () => createPage({
          close: async () => {
            throw new Error("cleanup failed");
          },
        }),
      }),
      config,
      result,
    ),
    /cleanup failed/,
  );
});
