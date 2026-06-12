export const CONFIG_LOCALES = {
  "zh-CN": {
    $desc: "MCSM Portal 设置",
    title: "显示在生成图片顶部的全局标题。",
    connection: {
      $desc: "MCSManager 连接",
      endpoint: "MCSManager 面板 API 地址，例如 http://my-server-ip:23333。",
      apiKey: "MCSManager API 密钥。",
      apiKeyParam: "发送 API 密钥时使用的查询参数名。",
      timeout: "请求超时时间，单位为毫秒。",
    },
    command: {
      $desc: "命令设置",
      name: "根命令名称。",
      authority: "使用入口命令所需的最低权限等级。",
    },
    image: {
      $desc: "图片设置",
      nodeTitle: "节点状态图片中显示在全局标题下方的标题。",
      serverTitle: "服务器列表图片中显示在全局标题下方的标题。",
      width: "生成图片宽度，单位为像素。",
      backgroundTexture: "图片背景纹理。",
      showGeneratedAt: "在图片输出中显示生成时间。",
      puppeteer:
        "使用可选的 Puppeteer 服务渲染图片输出。它会生成 PNG 图片，避免部分适配器不支持 SVG data URI 的问题，并支持渲染缩放以获得更清晰的图片。关闭后将强制使用 SVG 输出。",
      renderScale:
        "Puppeteer PNG 渲染缩放倍率。数值越高图片越清晰，但体积也会更大。",
    },
    output: {
      $desc: "输出设置",
      mode: "机器人结果输出模式。",
      text: {
        $desc: "文本输出设置",
        style: "文本消息格式样式。",
        showHeader: "在文本输出中显示标题和摘要行。",
        showSeparators: "使用空行分隔文本卡片。",
      },
    },
    preview: {
      $desc: "可视化预览",
      enabled: "在 Koishi 控制台可用时注册代码生成的可视化预览页面。",
    },
    minecraft: {
      $desc: "Minecraft 实例发现",
      pageSize: "每次从每个 MCSManager 节点请求的实例数量。",
      typeKeywords: "被视为 Minecraft 服务器的实例类型关键词。",
      latencyFallback: {
        $desc: "远程延迟测试服务。",
        $inner: {
          name: "延迟测试服务的显示名称。",
          url: "延迟测试服务 URL 模板。支持 {address}、{host} 和 {port}。",
        },
      },
      latencyFallbackStrategy: "多个延迟测试服务的选择方式。",
      latencyFallbackTrigger: "何时使用远程延迟测试服务。",
      latencyFallbackLocalThreshold:
        "小于或等于此值的延迟（毫秒）会被视为本机/无效延迟。",
      latencyFallbackKeys:
        "用于从服务 JSON 响应中读取延迟的键路径。支持点路径，例如 data.ping。",
    },
    fields: {
      $desc: "服务器列表字段",
      address: "显示服务器地址。",
      onlineCount: "显示在线玩家数量。",
      status: "显示实例状态。",
      node: "显示节点名称。",
      version: "显示 Minecraft 版本。",
      motd: "显示 MOTD。",
      modList: "显示模组列表。",
    },
    cacheTtl: "MCSManager 状态查询缓存时间，单位为秒。",
    debug: "打印详细的 MCSManager 发现日志用于调试。",
  },
} as const;
