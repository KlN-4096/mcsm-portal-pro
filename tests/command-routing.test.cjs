const test = require("node:test");
const assert = require("node:assert/strict");
const { App, Argv } = require("koishi");

const { registerCommands } = require("../lib/commands.js");
const { createRuntimeConfig } = require("../lib/config.js");
const { parseForceInput } = require("../lib/force-execution.js");

function resolveInput(commander, input) {
  const session = {
    isDirect: true,
    quote: undefined,
    stripped: { appel: true, prefix: "", content: input },
    resolve: (value) => value,
  };
  const argv = Object.assign(Argv.parse(input), {
    root: true,
    session,
  });
  return commander.inferCommand(argv)?.name;
}

function parseInput(commander, input) {
  const session = {
    isDirect: true,
    quote: undefined,
    stripped: { appel: true, prefix: "", content: input },
    resolve: (value) => value,
  };
  const argv = Object.assign(Argv.parse(input), {
    root: true,
    session,
  });
  const command = commander.inferCommand(argv);
  return command.parse(argv);
}

test("server lifecycle commands use native space and dot subcommand routing", () => {
  const app = new App();
  const config = createRuntimeConfig({
    command: { name: "rc" },
    instanceOperations: { enabled: true },
  });
  registerCommands(app, config, {});

  assert.equal(resolveInput(app.$commander, "server kill"), "server.kill");
  assert.equal(resolveInput(app.$commander, "server stop -f"), "server.stop");
  assert.equal(app.$commander.resolve("server.kill")?.name, "server.kill");
  assert.equal(app.$commander.resolve("rc.kill"), undefined);
  assert.equal(resolveInput(app.$commander, "rc exec kill"), "rc");
  assert.equal(resolveInput(app.$commander, "rc exec -f kill"), "rc");
  assert.deepEqual(parseInput(app.$commander, "rc exec -f kill").args, ["exec -f kill"]);
  assert.deepEqual(parseInput(app.$commander, "server stop -f").options, { force: true });
  assert.deepEqual(parseInput(app.$commander, "rc.exec -f kill").args, ["kill"]);
  assert.deepEqual(parseInput(app.$commander, "rc.exec -f kill").options, { force: true });
});

test("terminal force flag is accepted at either edge without consuming middle command flags", () => {
  assert.deepEqual(parseForceInput("-f list"), { input: "list", force: true });
  assert.deepEqual(parseForceInput("list -f"), { input: "list", force: true });
  assert.deepEqual(parseForceInput("-f list -f"), { input: "list", force: true });
  assert.deepEqual(parseForceInput("say -f hello"), { input: "say -f hello", force: false });
});
