import { createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  computed,
  defineComponent,
  h,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  resolveComponent,
  watchEffect,
} from "vue";
import { defineExtension, send, useConfig, useRpc } from "@koishijs/client";
import {
  NodeStatusLayout,
  ServerListLayout,
} from "../src/visualization/layouts";
import "../assets/visualization/layout.css";
import "./style.css";

type VisualizationSurface = "node-status" | "server-list";
type InstanceStatus =
  | "running"
  | "stopped"
  | "starting"
  | "stopping"
  | "unknown";

interface CodeAuthoredLayoutDefinition {
  id: string;
  name: string;
  surface: VisualizationSurface;
  description: string;
  renderer: "react";
  componentPath: string;
  exportName: string;
  previewWidth: number;
}

interface NodeStatus {
  id: string;
  name: string;
  online: boolean;
  address?: string;
  cpuUsage?: number;
  memoryUsed?: number;
  memoryTotal?: number;
  diskUsed?: number;
  diskTotal?: number;
  instanceTotal?: number;
  instanceRunning?: number;
  instanceStopped?: number;
  platform?: string;
  uptime?: number;
  version?: string;
  remark?: string;
}

interface MinecraftInstance {
  id: string;
  name: string;
  status: InstanceStatus;
  type?: string;
  tags: string[];
  nodeId?: string;
  nodeName?: string;
  address?: string;
  iconUrl?: string;
  latencyMs?: number;
  onlinePlayers?: number;
  maxPlayers?: number;
  version?: string;
  motd?: string;
  motdSegments?: MinecraftTextSegment[];
  modList: string[];
}

interface MinecraftTextSegment {
  text: string;
  color?: string;
  gradient?: string;
  bold?: boolean;
  italic?: boolean;
  underlined?: boolean;
  strikethrough?: boolean;
}

interface VisualizationLayoutText {
  nodeOnlineSummary: string;
  serverOnlineSummary: string;
  online: string;
  offline: string;
  cpu: string;
  memory: string;
  instances: string;
  platform: string;
  version: string;
  unknown: string;
  noNodesAvailable: string;
  noServersAvailable: string;
  noAddressConfigured: string;
  defaultMotd: string;
  statusLabels: Record<InstanceStatus, string>;
}

interface VisualizationMockData {
  portalName: string;
  copyright: string;
  pluginVersion: string;
  nodeTitle: string;
  serverTitle: string;
  showGeneratedAt: boolean;
  generatedAt?: string;
  backgroundTexture?: string;
  backgroundTile?: string;
  text: VisualizationLayoutText;
  textPreviews?: Partial<Record<VisualizationSurface, string>>;
  nodes: NodeStatus[];
  servers: MinecraftInstance[];
}

interface PreviewEntryData {
  version: 1;
  realDataAvailable: boolean;
  layouts: CodeAuthoredLayoutDefinition[];
  mock: VisualizationMockData;
}

interface RealPreviewResponse {
  ok: boolean;
  data?: VisualizationMockData;
  error?: string;
}

type PreviewLocale = "en-US" | "zh-CN";

const previewMessages = {
  "en-US": {
    pageTitle: "MCSM Portal Preview",
    layout: "Layout",
    dataSource: "Data Source",
    mock: "Mock",
    real: "Real",
    loading: "Loading...",
    refreshing: "Refreshing...",
    refreshRealData: "Refresh real data",
    realHint: "Switch between generated mock content and live MCSManager data.",
    realHintUnavailable:
      "Switch between generated mock content and live MCSManager data. Configure MCSManager endpoint and API key to enable Real.",
    realUnavailable:
      "Real data is unavailable because the MCSManager connection is not configured.",
    realFailed: "Failed to load real preview data.",
    component: "Component",
    renderer: "Renderer",
    background: "Background",
    selectedBackground: "Selected background texture",
    none: "None",
    textPreview: "Text Preview",
    textPreviewUnavailable: "Text preview is unavailable.",
    data: "Data",
    brand: "Brand",
    nodeTitle: "Node title",
    serverTitle: "Server title",
    generated: "Generated",
    hidden: "Hidden",
    nodes: "Nodes",
    servers: "Servers",
    noPreviewData: "No visualization preview data is available.",
    nodeStatus: "Node Status",
    serverList: "Server List",
    nodeStatusSurface: "node status",
    serverListSurface: "server list",
    nodesOnline: "{online}/{total} nodes online",
    serversOnline: "{online}/{total} servers online",
    online: "online",
    offline: "offline",
    cpu: "CPU",
    memory: "Memory",
    instances: "Instances",
    platform: "Platform",
    version: "Version",
    unknown: "unknown",
    noNodesAvailable: "No nodes available",
    noServersAvailable: "No servers available",
    noAddressConfigured: "No address configured",
    defaultMotd: "Minecraft Server",
    statusRunning: "running",
    statusStopped: "stopped",
    statusStarting: "starting",
    statusStopping: "stopping",
    statusUnknown: "unknown",
  },
  "zh-CN": {
    pageTitle: "MCSM Portal 预览",
    layout: "布局",
    dataSource: "数据源",
    mock: "模拟",
    real: "实时",
    loading: "加载中……",
    refreshing: "刷新中……",
    refreshRealData: "刷新实时数据",
    realHint: "在生成的模拟内容和实时 MCSManager 数据之间切换。",
    realHintUnavailable:
      "在生成的模拟内容和实时 MCSManager 数据之间切换。配置 MCSManager 地址和 API 密钥后可启用实时数据。",
    realUnavailable: "实时数据不可用：尚未配置 MCSManager 地址或 API 密钥。",
    realFailed: "加载实时预览数据失败。",
    component: "组件",
    renderer: "渲染器",
    background: "背景",
    selectedBackground: "已选择的背景纹理",
    none: "无",
    textPreview: "文本预览",
    textPreviewUnavailable: "文本预览不可用。",
    data: "数据",
    brand: "品牌",
    nodeTitle: "节点标题",
    serverTitle: "服务器标题",
    generated: "生成时间",
    hidden: "隐藏",
    nodes: "节点",
    servers: "服务器",
    noPreviewData: "没有可用的可视化预览数据。",
    nodeStatus: "节点状态",
    serverList: "服务器列表",
    nodeStatusSurface: "节点状态",
    serverListSurface: "服务器列表",
    nodesOnline: "{online}/{total} 个节点在线",
    serversOnline: "{online}/{total} 个服务器在线",
    online: "在线",
    offline: "离线",
    cpu: "CPU",
    memory: "内存",
    instances: "实例",
    platform: "平台",
    version: "版本",
    unknown: "未知",
    noNodesAvailable: "没有可用节点",
    noServersAvailable: "没有可用服务器",
    noAddressConfigured: "未配置地址",
    defaultMotd: "Minecraft 服务器",
    statusRunning: "运行中",
    statusStopped: "已停止",
    statusStarting: "启动中",
    statusStopping: "停止中",
    statusUnknown: "未知",
  },
} satisfies Record<PreviewLocale, Record<string, string>>;

const PreviewPage = defineComponent({
  name: "McsmPortalVisualizationPreview",
  setup() {
    const rpc = useRpc<PreviewEntryData>();
    const consoleConfig = useConfig();
    const selectedLayoutId = ref("");
    const dataSource = ref<"mock" | "real">("mock");
    const realData = ref<VisualizationMockData>();
    const realLoading = ref(false);
    const realError = ref("");
    const workbench = ref<HTMLElement>();
    const isStacked = ref(false);
    const previewGeneratedAt = ref(new Date().toISOString());
    let resizeObserver: ResizeObserver | undefined;
    let observedWorkbench: HTMLElement | undefined;
    let generatedAtTimer: ReturnType<typeof setInterval> | undefined;

    const layouts = computed(() => rpc.value?.layouts ?? []);
    const mock = computed(() => rpc.value?.mock);
    const activeData = computed(() => {
      const data =
        dataSource.value === "real" && realData.value
          ? realData.value
          : mock.value;
      if (!data) return data;
      return {
        ...data,
        generatedAt: data.showGeneratedAt ? previewGeneratedAt.value : undefined,
        text: createPreviewLayoutText(data),
      };
    });
    const activeSourceLabel = computed(() =>
      dataSource.value === "real" && realData.value ? "real" : "mock",
    );
    const activeSourceText = computed(() =>
      activeSourceLabel.value === "real" ? t("real") : t("mock"),
    );
    const selectedLayout = computed(
      () =>
        layouts.value.find((layout) => layout.id === selectedLayoutId.value) ??
        layouts.value[0],
    );
    const currentLocale = computed<PreviewLocale>(() =>
      consoleConfig.value.locale === "zh-CN" ? "zh-CN" : "en-US",
    );
    const t = (key: keyof typeof previewMessages["en-US"]) =>
      previewMessages[currentLocale.value][key];
    const layoutName = (layout: CodeAuthoredLayoutDefinition) =>
      layout.surface === "node-status" ? t("nodeStatus") : t("serverList");
    const surfaceLabel = (surface: VisualizationSurface) =>
      surface === "node-status" ? t("nodeStatusSurface") : t("serverListSurface");

    function createPreviewLayoutText(
      data: VisualizationMockData,
    ): VisualizationLayoutText {
      const onlineNodes = data.nodes.filter((node) => node.online).length;
      const onlineServers = data.servers.filter(
        (server) => server.status === "running",
      ).length;

      return {
        nodeOnlineSummary: formatMessage(t("nodesOnline"), {
          online: onlineNodes,
          total: data.nodes.length,
        }),
        serverOnlineSummary: formatMessage(t("serversOnline"), {
          online: onlineServers,
          total: data.servers.length,
        }),
        online: t("online"),
        offline: t("offline"),
        cpu: t("cpu"),
        memory: t("memory"),
        instances: t("instances"),
        platform: t("platform"),
        version: t("version"),
        unknown: t("unknown"),
        noNodesAvailable: t("noNodesAvailable"),
        noServersAvailable: t("noServersAvailable"),
        noAddressConfigured: t("noAddressConfigured"),
        defaultMotd: t("defaultMotd"),
        statusLabels: {
          running: t("statusRunning"),
          stopped: t("statusStopped"),
          starting: t("statusStarting"),
          stopping: t("statusStopping"),
          unknown: t("statusUnknown"),
        },
      };
    }

    const KLayout = resolveComponent("k-layout");
    const ElScrollbar = resolveComponent("el-scrollbar");

    async function selectDataSource(source: "mock" | "real") {
      if (source === "mock") {
        dataSource.value = "mock";
        realError.value = "";
        return;
      }

      if (!realData.value && !(await loadRealData())) return;
      dataSource.value = "real";
    }

    async function refreshRealData() {
      if (await loadRealData()) dataSource.value = "real";
    }

    async function loadRealData() {
      if (!rpc.value?.realDataAvailable) {
        realError.value = t("realUnavailable");
        return false;
      }

      realLoading.value = true;
      realError.value = "";
      try {
        const response = (await send(
          "mcsm-portal/preview-data",
        )) as RealPreviewResponse;
        if (!response.ok || !response.data) {
          realError.value = response.error ?? t("realFailed");
          return false;
        }
        realData.value = response.data;
        return true;
      } catch (error) {
        realError.value =
          error instanceof Error ? error.message : String(error);
        return false;
      } finally {
        realLoading.value = false;
      }
    }

    function updateLayoutMode() {
      if (!workbench.value || !selectedLayout.value) return;
      const sidebarWidth = 320;
      const gap = 16;
      const previewChrome = 54;
      const threshold =
        sidebarWidth + gap + selectedLayout.value.previewWidth + previewChrome;
      isStacked.value = workbench.value.clientWidth < threshold;
    }

    onMounted(() => {
      generatedAtTimer = setInterval(() => {
        previewGeneratedAt.value = new Date().toISOString();
      }, 1000);
      resizeObserver = new ResizeObserver(updateLayoutMode);
      if (workbench.value) resizeObserver.observe(workbench.value);
      observedWorkbench = workbench.value;
      updateLayoutMode();
    });

    onBeforeUnmount(() => {
      if (generatedAtTimer) clearInterval(generatedAtTimer);
      resizeObserver?.disconnect();
    });

    watchEffect(() => {
      selectedLayout.value?.previewWidth;
      nextTick(() => {
        if (
          resizeObserver &&
          workbench.value &&
          workbench.value !== observedWorkbench
        ) {
          if (observedWorkbench) resizeObserver.unobserve(observedWorkbench);
          resizeObserver.observe(workbench.value);
          observedWorkbench = workbench.value;
        }
        updateLayoutMode();
      });
    });

    return () =>
      h(
        KLayout,
        { main: "mcsm-portal-preview-page" },
        {
          header: () => t("pageTitle"),
          default: () =>
            h(ElScrollbar, null, {
              default: () =>
                h("main", { class: "mcsm-portal-preview-page__content" }, [
                  selectedLayout.value && activeData.value
                    ? h(
                        "section",
                        {
                          ref: workbench,
                          class: [
                            "mcsm-portal-preview-workbench",
                            isStacked.value ? "is-stacked" : "",
                          ],
                          style: {
                            "--mcsm-preview-width": `${selectedLayout.value.previewWidth}px`,
                          },
                        },
                        [
                          h(
                            "aside",
                            {
                              class:
                                "mcsm-portal-panel mcsm-portal-layout-list",
                            },
                            [
                              h("h2", t("layout")),
                              h(
                                "div",
                                { class: "mcsm-portal-layout-buttons" },
                                layouts.value.map((layout) =>
                                  h(
                                    "button",
                                    {
                                      key: layout.id,
                                      type: "button",
                                      class: {
                                        "is-active":
                                          layout.id ===
                                          selectedLayout.value?.id,
                                      },
                                      onClick: () => {
                                        selectedLayoutId.value = layout.id;
                                      },
                                    },
                                    [
                                      h("strong", layoutName(layout)),
                                      h("span", surfaceLabel(layout.surface)),
                                    ],
                                  ),
                                ),
                              ),
                              h("hr"),
                              h("h2", t("dataSource")),
                              h("div", { class: "mcsm-portal-source-toggle" }, [
                                h(
                                  "div",
                                  {
                                    class: "mcsm-portal-source-toggle__buttons",
                                  },
                                  [
                                    h(
                                      "button",
                                      {
                                        type: "button",
                                        class: {
                                          "is-active":
                                            activeSourceLabel.value === "mock",
                                        },
                                        onClick: () => selectDataSource("mock"),
                                      },
                                      t("mock"),
                                    ),
                                    h(
                                      "button",
                                      {
                                        type: "button",
                                        disabled:
                                          realLoading.value ||
                                          !rpc.value?.realDataAvailable,
                                        class: {
                                          "is-active":
                                            activeSourceLabel.value === "real",
                                        },
                                        onClick: () => selectDataSource("real"),
                                      },
                                      realLoading.value ? t("loading") : t("real"),
                                    ),
                                  ],
                                ),
                                activeSourceLabel.value === "real"
                                  ? h(
                                      "button",
                                      {
                                        type: "button",
                                        class:
                                          "mcsm-portal-source-toggle__refresh",
                                        disabled: realLoading.value,
                                        onClick: refreshRealData,
                                      },
                                      realLoading.value
                                        ? t("refreshing")
                                        : t("refreshRealData"),
                                    )
                                  : null,
                                realError.value
                                  ? h(
                                      "p",
                                      {
                                        class:
                                          "mcsm-portal-source-toggle__error",
                                      },
                                      realError.value,
                                    )
                                  : h(
                                      "p",
                                      {
                                        class:
                                          "mcsm-portal-source-toggle__hint",
                                      },
                                      rpc.value?.realDataAvailable
                                        ? t("realHint")
                                        : t("realHintUnavailable"),
                                    ),
                              ]),
                              h("hr"),
                              h("h2", t("component")),
                              h("dl", { class: "mcsm-portal-code-meta" }, [
                                h("dt", t("renderer")),
                                h("dd", selectedLayout.value.renderer),
                                h("dt", t("component")),
                                h("dd", [
                                  h("code", selectedLayout.value.componentPath),
                                  h("small", selectedLayout.value.exportName),
                                ]),
                              ]),
                              h("hr"),
                              h("h2", t("background")),
                              h(
                                "div",
                                { class: "mcsm-portal-texture-preview" },
                                [
                                  activeData.value.backgroundTile
                                    ? h("img", {
                                        src: activeData.value.backgroundTile,
                                        alt:
                                          activeData.value.backgroundTexture ??
                                          t("selectedBackground"),
                                      })
                                    : h("div", {
                                        class:
                                          "mcsm-portal-texture-preview__empty",
                                      }),
                                  h(
                                    "span",
                                    activeData.value.backgroundTexture ||
                                      t("none"),
                                  ),
                                ],
                              ),
                            ],
                          ),
                          h(
                            "section",
                            {
                              class: "mcsm-portal-preview-column",
                              style: {
                                "--mcsm-preview-width": `${selectedLayout.value.previewWidth}px`,
                              },
                            },
                            [
                              h("div", { class: "mcsm-portal-panel" }, [
                                h(
                                  "div",
                                  { class: "mcsm-portal-panel__heading" },
                                  [
                                    h("h2", layoutName(selectedLayout.value)),
                                    h(
                                      "span",
                                      activeSourceText.value,
                                    ),
                                  ],
                                ),
                                h("div", { class: "mcsm-portal-stage" }, [
                                  renderComponentPreview(
                                    selectedLayout.value,
                                    activeData.value,
                                  ),
                                ]),
                                h(
                                  "div",
                                  { class: "mcsm-portal-text-preview" },
                                  [
                                    h(
                                      "div",
                                      {
                                        class:
                                          "mcsm-portal-text-preview__heading",
                                      },
                                      [
                                        h("strong", t("textPreview")),
                                        h("span", surfaceLabel(selectedLayout.value.surface)),
                                      ],
                                    ),
                                    h(
                                      "pre",
                                      activeData.value.textPreviews?.[
                                        selectedLayout.value.surface
                                      ] ?? t("textPreviewUnavailable"),
                                    ),
                                  ],
                                ),
                              ]),
                              h(
                                "div",
                                {
                                  class:
                                    "mcsm-portal-panel mcsm-portal-mock-summary",
                                },
                                [
                                  h("h2", t("data")),
                                  h(
                                    "div",
                                    { class: "mcsm-portal-summary-grid" },
                                    [
                                      summaryItem(
                                        t("brand"),
                                        activeData.value.portalName,
                                      ),
                                      summaryItem(
                                        t("nodeTitle"),
                                        activeData.value.nodeTitle,
                                      ),
                                      summaryItem(
                                        t("serverTitle"),
                                        activeData.value.serverTitle,
                                      ),
                                      summaryItem(
                                        t("generated"),
                                        activeData.value.generatedAt
                                          ? formatDate(
                                              activeData.value.generatedAt,
                                            )
                                          : t("hidden"),
                                      ),
                                      summaryItem(
                                        t("nodes"),
                                        String(activeData.value.nodes.length),
                                      ),
                                      summaryItem(
                                        t("servers"),
                                        String(activeData.value.servers.length),
                                      ),
                                    ],
                                  ),
                                ],
                              ),
                            ],
                          ),
                        ],
                      )
                    : h(
                        "section",
                        { class: "mcsm-portal-panel" },
                        t("noPreviewData"),
                      ),
                ]),
            }),
        },
      );
  },
});

const ReactLayoutHost = defineComponent<{
  layout: CodeAuthoredLayoutDefinition;
  data: VisualizationMockData;
}>({
  name: "McsmPortalReactLayoutHost",
  props: ["layout", "data"],
  setup(props) {
    const frame = ref<HTMLElement>();
    const host = ref<HTMLElement>();
    const scale = ref(1);
    const naturalHeight = ref<number>();
    let root: Root | undefined;
    let resizeObserver: ResizeObserver | undefined;

    function updateScale() {
      const frameElement = frame.value;
      const hostElement = host.value;
      if (!frameElement || !hostElement) return;

      const parent = frameElement.parentElement;
      const parentStyle = parent ? getComputedStyle(parent) : undefined;
      const horizontalPadding = parentStyle
        ? parseFloat(parentStyle.paddingLeft) +
          parseFloat(parentStyle.paddingRight)
        : 0;
      const availableWidth = parent
        ? parent.clientWidth - horizontalPadding
        : props.layout.previewWidth;
      const nextScale = Math.min(1, availableWidth / props.layout.previewWidth);
      scale.value = Number.isFinite(nextScale) && nextScale > 0 ? nextScale : 1;
      naturalHeight.value = hostElement.scrollHeight;
    }

    watchEffect(() => {
      if (!host.value) return;
      root ??= createRoot(host.value);
      const Component =
        props.layout.surface === "node-status"
          ? NodeStatusLayout
          : ServerListLayout;
      root.render(
        createElement(Component, {
          layout: props.layout,
          data: props.data,
        }),
      );
      nextTick(updateScale);
      requestAnimationFrame(updateScale);
    });

    onMounted(() => {
      resizeObserver = new ResizeObserver(updateScale);
      if (frame.value) resizeObserver.observe(frame.value);
      if (frame.value?.parentElement)
        resizeObserver.observe(frame.value.parentElement);
      if (host.value) resizeObserver.observe(host.value);
      updateScale();
    });

    onBeforeUnmount(() => {
      resizeObserver?.disconnect();
      root?.unmount();
      root = undefined;
    });

    return () =>
      h(
        "div",
        {
          ref: frame,
          class: "mcsm-react-frame",
          style: {
            width: `${props.layout.previewWidth * scale.value}px`,
            height: naturalHeight.value
              ? `${naturalHeight.value * scale.value}px`
              : undefined,
            "--mcsm-preview-scale": String(scale.value),
          },
        },
        [
          h("div", {
            ref: host,
            class: "mcsm-react-host",
            style: {
              width: `${props.layout.previewWidth}px`,
            },
          }),
        ],
      );
  },
});

export default defineExtension((ctx) => {
  ctx.page({
    id: "mcsm-portal-preview",
    path: "/mcsm-portal/preview",
    name: "MCSM Portal Preview",
    icon: "activity:default",
    component: PreviewPage,
  });
});

function renderComponentPreview(
  layout: CodeAuthoredLayoutDefinition,
  mock: VisualizationMockData,
) {
  return h(ReactLayoutHost, { layout, data: mock });
}

function summaryItem(label: string, value: string) {
  return h("div", [h("span", label), h("strong", value)]);
}

function formatDate(value: string) {
  return new Date(value).toLocaleString();
}

function formatMessage(
  template: string,
  params: Record<string, string | number>,
) {
  return template.replace(/\{(\w+)\}/g, (source, key) =>
    params[key] === undefined ? source : String(params[key]),
  );
}
