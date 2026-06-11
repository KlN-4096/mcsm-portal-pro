import { createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  computed,
  defineComponent,
  h,
  onBeforeUnmount,
  ref,
  resolveComponent,
  watchEffect,
} from "vue";
import { defineExtension, useRpc } from "@koishijs/client";
import {
  NodeStatusLayout,
  ServerListLayout,
} from "../src/visualization/layouts";
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
  onlinePlayers?: number;
  maxPlayers?: number;
  version?: string;
  motd?: string;
  modList: string[];
}

interface VisualizationMockData {
  panelName: string;
  generatedAt: string;
  backgroundTexture?: string;
  backgroundTile?: string;
  nodes: NodeStatus[];
  servers: MinecraftInstance[];
}

interface PreviewEntryData {
  version: 1;
  layouts: CodeAuthoredLayoutDefinition[];
  mock: VisualizationMockData;
}

const PreviewPage = defineComponent({
  name: "McsmPortalVisualizationPreview",
  setup() {
    const rpc = useRpc<PreviewEntryData>();
    const selectedLayoutId = ref("");

    const layouts = computed(() => rpc.value?.layouts ?? []);
    const mock = computed(() => rpc.value?.mock);
    const selectedLayout = computed(
      () =>
        layouts.value.find((layout) => layout.id === selectedLayoutId.value) ??
        layouts.value[0],
    );

    const KLayout = resolveComponent("k-layout");
    const ElScrollbar = resolveComponent("el-scrollbar");

    return () =>
      h(
        KLayout,
        { main: "mcsm-portal-preview-page" },
        {
          header: () => "MCSM preview",
          default: () =>
            h(ElScrollbar, null, {
              default: () =>
                h("main", { class: "mcsm-portal-preview-page__content" }, [
                  selectedLayout.value && mock.value
                    ? h("section", { class: "mcsm-portal-preview-workbench" }, [
                        h(
                          "aside",
                          {
                            class: "mcsm-portal-panel mcsm-portal-layout-list",
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
                                        layout.id === selectedLayout.value?.id,
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
                            h("div", { class: "mcsm-portal-texture-preview" }, [
                              mock.value.backgroundTile
                                ? h("img", {
                                    src: mock.value.backgroundTile,
                                    alt:
                                      mock.value.backgroundTexture ??
                                      "Selected background texture",
                                  })
                                : h("div", {
                                    class: "mcsm-portal-texture-preview__empty",
                                  }),
                              h("span", mock.value.backgroundTexture || "None"),
                            ]),
                          ],
                        ),
                        h("section", { class: "mcsm-portal-preview-column" }, [
                          h("div", { class: "mcsm-portal-panel" }, [
                            h("div", { class: "mcsm-portal-panel__heading" }, [
                              h("h2", selectedLayout.value.name),
                              h("span", "mock"),
                            ]),
                            h("div", { class: "mcsm-portal-stage" }, [
                              renderComponentPreview(
                                selectedLayout.value,
                                mock.value,
                              ),
                            ]),
                          ]),
                          h(
                            "div",
                            {
                              class:
                                "mcsm-portal-panel mcsm-portal-mock-summary",
                            },
                            [
                              h("h2", "Data"),
                              h("div", { class: "mcsm-portal-summary-grid" }, [
                                summaryItem("Panel", mock.value.panelName),
                                summaryItem(
                                  "Generated",
                                  formatDate(mock.value.generatedAt),
                                ),
                                summaryItem(
                                  "Nodes",
                                  String(mock.value.nodes.length),
                                ),
                                summaryItem(
                                  "Servers",
                                  String(mock.value.servers.length),
                                ),
                              ]),
                            ],
                          ),
                        ]),
                      ])
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
    const host = ref<HTMLElement>();
    let root: Root | undefined;

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
    });

    onBeforeUnmount(() => {
      root?.unmount();
      root = undefined;
    });

    return () => h("div", { ref: host, class: "mcsm-react-host" });
  },
});

export default defineExtension((ctx) => {
  ctx.page({
    id: "mcsm-portal-preview",
    path: "/mcsm-portal/preview",
    name: "MCSM Preview",
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
