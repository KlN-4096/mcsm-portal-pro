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
    qqInteractions: {
      $desc: "QQ 交互",
      reactionMirror: {
        $desc: "QQ 表情跟贴",
        enabled: "当用户给消息贴上指定 QQ 表情时，机器人也贴同一个表情。",
        emojis:
          "需要跟贴的 QQ 表情 ID。支持 Satori 格式（例如 1:123）或只填写表情 ID。",
        dedupeTtl:
          "同一消息同一表情的重复跟贴抑制时间，单位为毫秒。",
        ignoreSelf: "忽略机器人自己添加的表情。",
      },
      avatarDoubleTap: {
        $desc: "QQ 双击头像",
        enabled:
          "当用户对机器人触发双击头像（拍一拍）时，机器人也双击该用户头像。需要兼容 OneBot 的适配器暴露 notice/poke 事件和 send_poke 动作。",
        cooldown: "对同一用户再次双击头像的最小间隔，单位为毫秒。",
      },
    },
    minecraft: {
      $desc: "Minecraft 实例发现",
      pageSize: "每次从每个 MCSManager 节点请求的实例数量。",
      typeKeywords: "被视为 Minecraft 服务器的实例类型关键词。",
      defaultStatuses:
        "未在命令中指定状态时，服务器列表默认显示的实例状态。默认只显示运行中实例；留空则显示全部状态。",
      latencyFallback: {
        $desc: "远程延迟测试服务。",
        $inner: {
          name: "延迟测试服务的显示名称。",
          url: "延迟测试服务 URL 模板。支持 {address}、{host} 和 {port}。",
        },
      },
      latencyCacheTtl: "远程延迟测试结果缓存时间，单位为秒。",
      latencyFallbackStrategy: "多个延迟测试服务的选择方式。",
      latencyFallbackTrigger: "何时使用远程延迟测试服务。",
      latencyFallbackLocalThreshold:
        "小于或等于此值的延迟（毫秒）会被视为本机/无效延迟。",
      latencyFallbackKeys:
        "用于从服务 JSON 响应中读取延迟的键路径。支持点路径，例如 data.ping。",
    },
    commandExecution: {
      $desc: "命令执行",
      enabled: "允许通过 MCSManager 实例终端执行聊天指令。",
      authority: "执行实例指令所需的最低权限等级。",
      selectionTimeout: "交互式选择服务器的等待时间，单位为毫秒。",
      commandTimeout: "交互式输入指令的等待时间，单位为毫秒。",
      maxResultLength: "返回到聊天中的指令结果最大长度。",
      voting: {
        $desc: "执行投票",
        enabled: "执行实例指令前要求聊天投票通过。",
        approveCount: "投票通过所需的同意人数。",
        timeout: "投票超时时间，单位为毫秒。",
        presentation:
          "投票进度展示方式。auto 会在 QQ 官方机器人中使用按钮，否则使用图片；qq-button 在非 QQ 官方机器人中会回退为图片。",
        command: "投票命令。用户使用该命令加 yes 或 no 回复。",
      },
    },
    errorMessages: {
      $desc: "错误提示",
      serversFailed:
        "Minecraft 服务器列表加载失败时的自定义提示。支持 {message}；留空使用内置文案。",
      execFailed:
        "终端指令执行失败时的自定义提示。支持 {message} 和 {name}；{name} 是已解析出的服务器名，未解析到服务器时为空。留空使用内置文案。",
    },
    fields: {
      $desc: "服务器列表字段",
      address: "显示服务器地址。",
      onlineCount: "显示在线玩家数量。",
      playerNames: "显示 MCSManager 终端 list 指令返回的在线玩家名单。",
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
