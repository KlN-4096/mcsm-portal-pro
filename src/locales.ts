import type { Context } from "koishi";

export function defineLocales(ctx: Context, commandName: string) {
  ctx.i18n.define("en-US", createLocale(commandName, enUS));
  ctx.i18n.define("zh-CN", createLocale(commandName, zhCN));
}

function createLocale(commandName: string, messages: LocaleMessages) {
  return {
    [`commands.${commandName}`]: {
      description: messages.commands.root,
      messages: messages.messages,
    },
    [`commands.${commandName}.check`]: {
      description: messages.commands.check,
    },
    [`commands.${commandName}.status`]: {
      description: messages.commands.status,
    },
    [`commands.${commandName}.servers`]: {
      description: messages.commands.servers,
    },
    [`commands.${commandName}.addr`]: {
      description: messages.commands.addr,
    },
    [`commands.${commandName}.refresh`]: {
      description: messages.commands.refresh,
    },
  };
}

interface LocaleMessages {
  commands: Record<"root" | "check" | "status" | "servers" | "addr" | "refresh", string>;
  messages: Record<string, string | Record<string, string>>;
}

const enUS: LocaleMessages = {
  commands: {
    root: "MCSManager portal",
    check: "Check MCSManager API connectivity.",
    status: "Show MCSManager node status.",
    servers: "Show Minecraft servers from MCSManager.",
    addr: "Copy a Minecraft server address.",
    refresh: "Refresh cached MCSManager data.",
  },
  messages: {
    usage: "Available actions: check, status, servers, addr <name>, refresh.\nYou can use either \"{command} status\" or \"{command}.status\".",
    "unknown-action": "Unknown MCSManager action \"{action}\". Available actions: check, status, servers, addr <name>, refresh.",
    "check-success": "MCSManager connection check succeeded.",
    "check-failed": "MCSManager connection check failed: {message}",
    "status-failed": "Failed to load MCSManager node status: {message}",
    "servers-failed": "Failed to load Minecraft servers: {message}",
    "addr-missing-query": "Please provide a server name, alias, or ID.",
    "addr-not-found": "No MCSManager server matched \"{name}\".",
    "addr-ambiguous": "Multiple servers matched \"{name}\": {matches}.",
    "addr-missing-address": "{name} does not expose an address from MCSManager yet.",
    "refresh-success": "MCSManager portal cache refreshed.",
    "error-unknown": "Unknown error",
    render: {
      "no-nodes": "{title}: no MCSManager nodes were returned.",
      "no-servers": "No Minecraft server instances were returned by MCSManager.",
      online: "online",
      offline: "offline",
      cpu: "CPU",
      memory: "Memory",
      "instance-counts": "Instances {running} running / {stopped} stopped / {total} total",
      "player-count": "{online}/{max} online",
      mods: "{count} mods",
    },
  },
};

const zhCN: LocaleMessages = {
  commands: {
    root: "MCSManager 入口",
    check: "检查 MCSManager API 连接。",
    status: "查看 MCSManager 节点状态。",
    servers: "查看 MCSManager 中的 Minecraft 服务器。",
    addr: "快速复制 Minecraft 服务器地址。",
    refresh: "刷新缓存的 MCSManager 数据。",
  },
  messages: {
    usage: "可用操作：check、status、servers、addr <名称>、refresh。\n可使用 \"{command} status\" 或 \"{command}.status\"。",
    "unknown-action": "未知的 MCSManager 操作 \"{action}\"。可用操作：check、status、servers、addr <名称>、refresh。",
    "check-success": "MCSManager 连接检查成功。",
    "check-failed": "MCSManager 连接检查失败：{message}",
    "status-failed": "加载 MCSManager 节点状态失败：{message}",
    "servers-failed": "加载 Minecraft 服务器失败：{message}",
    "addr-missing-query": "请提供服务器名称、别名或 ID。",
    "addr-not-found": "没有匹配 \"{name}\" 的 MCSManager 服务器。",
    "addr-ambiguous": "\"{name}\" 匹配到多个服务器：{matches}。",
    "addr-missing-address": "{name} 暂未从 MCSManager 暴露地址。",
    "refresh-success": "MCSManager 入口缓存已刷新。",
    "error-unknown": "未知错误",
    render: {
      "no-nodes": "{title}：MCSManager 没有返回节点。",
      "no-servers": "MCSManager 没有返回 Minecraft 服务器实例。",
      online: "在线",
      offline: "离线",
      cpu: "CPU",
      memory: "内存",
      "instance-counts": "实例 {running} 运行 / {stopped} 停止 / 共 {total}",
      "player-count": "{online}/{max} 在线",
      mods: "{count} 个模组",
    },
  },
};
