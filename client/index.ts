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
import { defineExtension, send, useRpc } from "@koishijs/client";
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

interface VisualizationMockData {
  portalName: string;
  copyright: string;
  nodeTitle: string;
  serverTitle: string;
  showGeneratedAt: boolean;
  generatedAt?: string;
  backgroundTexture?: string;
  backgroundTile?: string;
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

const PreviewPage = defineComponent({
  name: "McsmPortalVisualizationPreview",
  setup() {
    const rpc = useRpc<PreviewEntryData>();
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
      };
    });
    const activeSourceLabel = computed(() =>
      dataSource.value === "real" && realData.value ? "real" : "mock",
    );
    const selectedLayout = computed(
      () =>
        layouts.value.find((layout) => layout.id === selectedLayoutId.value) ??
        layouts.value[0],
    );

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
        realError.value =
          "Real data is unavailable because the MCSManager connection is not configured.";
        return false;
      }

      realLoading.value = true;
      realError.value = "";
      try {
        const response = (await send(
          "mcsm-portal/preview-data",
        )) as RealPreviewResponse;
        if (!response.ok || !response.data) {
          realError.value =
            response.error ?? "Failed to load real preview data.";
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
          header: () => "MCSM Portal Preview",
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
                        },
                        [
                          h(
                            "aside",
                            {
                              class:
                                "mcsm-portal-panel mcsm-portal-layout-list",
                            },
                            [
                              h("h2", "Layout"),
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
                                      h("strong", layout.name),
                                      h("span", layout.surface),
                                    ],
                                  ),
                                ),
                              ),
                              h("hr"),
                              h("h2", "Data Source"),
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
                                      "Mock",
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
                                      realLoading.value ? "Loading..." : "Real",
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
                                        ? "Refreshing..."
                                        : "Refresh real data",
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
                                        ? "Switch between generated mock content and live MCSManager data."
                                        : "Switch between generated mock content and live MCSManager data. Configure MCSManager endpoint and API key to enable Real.",
                                    ),
                              ]),
                              h("hr"),
                              h("h2", "Component"),
                              h("dl", { class: "mcsm-portal-code-meta" }, [
                                h("dt", "Renderer"),
                                h("dd", selectedLayout.value.renderer),
                                h("dt", "Component"),
                                h("dd", [
                                  h("code", selectedLayout.value.componentPath),
                                  h("small", selectedLayout.value.exportName),
                                ]),
                              ]),
                              h("hr"),
                              h("h2", "Background"),
                              h(
                                "div",
                                { class: "mcsm-portal-texture-preview" },
                                [
                                  activeData.value.backgroundTile
                                    ? h("img", {
                                        src: activeData.value.backgroundTile,
                                        alt:
                                          activeData.value.backgroundTexture ??
                                          "Selected background texture",
                                      })
                                    : h("div", {
                                        class:
                                          "mcsm-portal-texture-preview__empty",
                                      }),
                                  h(
                                    "span",
                                    activeData.value.backgroundTexture ||
                                      "None",
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
                                    h("h2", selectedLayout.value.name),
                                    h(
                                      "span",
                                      capitalize(activeSourceLabel.value),
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
                                        h("strong", "Text Preview"),
                                        h("span", selectedLayout.value.surface),
                                      ],
                                    ),
                                    h(
                                      "pre",
                                      activeData.value.textPreviews?.[
                                        selectedLayout.value.surface
                                      ] ?? "Text preview is unavailable.",
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
                                  h("h2", "Data"),
                                  h(
                                    "div",
                                    { class: "mcsm-portal-summary-grid" },
                                    [
                                      summaryItem(
                                        "Brand",
                                        activeData.value.portalName,
                                      ),
                                      summaryItem(
                                        "Node title",
                                        activeData.value.nodeTitle,
                                      ),
                                      summaryItem(
                                        "Server title",
                                        activeData.value.serverTitle,
                                      ),
                                      summaryItem(
                                        "Generated",
                                        activeData.value.generatedAt
                                          ? formatDate(
                                              activeData.value.generatedAt,
                                            )
                                          : "Hidden",
                                      ),
                                      summaryItem(
                                        "Nodes",
                                        String(activeData.value.nodes.length),
                                      ),
                                      summaryItem(
                                        "Servers",
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
                        "No visualization preview data is available.",
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

function capitalize(value: string) {
  return value.slice(0, 1).toUpperCase() + value.slice(1);
}
