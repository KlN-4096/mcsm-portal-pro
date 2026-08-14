const test = require("node:test");
const assert = require("node:assert/strict");
const { App } = require("koishi");

const { registerCommands } = require("../lib/commands.js");
const { createRuntimeConfig } = require("../lib/config.js");

function token(content) {
  return { content, inters: [], quoted: false, terminator: "" };
}

function resolveInput(commander, input) {
  const session = {
    isDirect: true,
    quote: undefined,
    stripped: { appel: true, prefix: "", content: input },
    resolve: (value) => value,
  };
  const argv = {
    root: true,
    session,
    tokens: input.split(/\s+/).map(token),
  };
  return commander.inferCommand(argv)?.name;
}

test("server lifecycle commands use native space and dot subcommand routing", () => {
  const app = new App();
  const config = createRuntimeConfig({
    command: { name: "rc" },
    instanceOperations: { enabled: true },
  });
  registerCommands(app, config, {});

  assert.equal(resolveInput(app.$commander, "server kill"), "server.kill");
  assert.equal(app.$commander.resolve("server.kill")?.name, "server.kill");
  assert.equal(app.$commander.resolve("rc.kill"), undefined);
  assert.equal(resolveInput(app.$commander, "rc exec kill"), "rc");
});
