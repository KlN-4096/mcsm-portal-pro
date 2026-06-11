import { computed, defineComponent, h, ref, resolveComponent } from "vue";
import { defineExtension, useRpc } from "@koishijs/client";
import "./style.css";

type VisualizationSurface = "node-status" | "server-list";
type InstanceStatus = "running" | "stopped" | "starting" | "stopping" | "unknown";

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
    const selectedLayout = computed(() => (
      layouts.value.find((layout) => layout.id === selectedLayoutId.value)
      ?? layouts.value[0]
    ));

    const KLayout = resolveComponent("k-layout");
    const ElScrollbar = resolveComponent("el-scrollbar");

    return () => h(KLayout, { main: "mcsm-portal-preview-page" }, {
      header: () => "MCSM preview",
      default: () => h(ElScrollbar, null, {
        default: () => h("main", { class: "mcsm-portal-preview-page__content" }, [
          h("section", { class: "mcsm-portal-hero" }, [
            h("h1", "Preview"),
            h("p", "React layouts rendered with mock MCSManager data."),
          ]),
          selectedLayout.value && mock.value ? h("section", { class: "mcsm-portal-preview-workbench" }, [
            h("aside", { class: "mcsm-portal-panel mcsm-portal-layout-list" }, [
              h("h2", "Layout"),
              h("div", { class: "mcsm-portal-layout-buttons" }, layouts.value.map((layout) => h("button", {
                key: layout.id,
                type: "button",
                class: {
                  "is-active": layout.id === selectedLayout.value?.id,
                },
                onClick: () => {
                  selectedLayoutId.value = layout.id;
                },
              }, [
                h("strong", layout.name),
                h("span", layout.surface),
              ]))),
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
            ]),
            h("section", { class: "mcsm-portal-preview-column" }, [
              h("div", { class: "mcsm-portal-panel" }, [
                h("div", { class: "mcsm-portal-panel__heading" }, [
                  h("h2", selectedLayout.value.name),
                  h("span", "mock"),
                ]),
                h("div", { class: "mcsm-portal-stage" }, [
                  renderMockPreview(selectedLayout.value, mock.value),
                ]),
              ]),
              h("div", { class: "mcsm-portal-panel mcsm-portal-mock-summary" }, [
                h("h2", "Data"),
                h("div", { class: "mcsm-portal-summary-grid" }, [
                  summaryItem("Panel", mock.value.panelName),
                  summaryItem("Generated", formatDate(mock.value.generatedAt)),
                  summaryItem("Nodes", String(mock.value.nodes.length)),
                  summaryItem("Servers", String(mock.value.servers.length)),
                ]),
              ]),
            ]),
          ]) : h("section", { class: "mcsm-portal-panel" }, "No visualization preview data is available."),
        ]),
      }),
    });
  },
});

const NodeStatusPreview = defineComponent<{
  layout: CodeAuthoredLayoutDefinition;
  mock: VisualizationMockData;
}>({
  name: "McsmPortalNodeStatusPreview",
  props: ["layout", "mock"],
  setup(props) {
    return () => h("article", {
      class: "mcsm-image mcsm-image--nodes",
      style: { width: `${props.layout.previewWidth}px` },
    }, [
      imageHeader(props.mock.panelName, "Daemon node status", props.mock.generatedAt),
      h("section", { class: "mcsm-node-grid" }, props.mock.nodes.map((node) => h("div", {
        key: node.id,
        class: ["mcsm-node-card", node.online ? "is-online" : "is-offline"],
      }, [
        h("header", [
          h("div", [
            h("strong", node.name),
            h("span", node.address ?? node.id),
          ]),
          h("em", node.online ? "Online" : "Offline"),
        ]),
        h("div", { class: "mcsm-meter-list" }, [
          meter("CPU", percent(node.cpuUsage)),
          meter("Memory", bytesPair(node.memoryUsed, node.memoryTotal)),
          meter("Disk", bytesPair(node.diskUsed, node.diskTotal)),
        ]),
        h("footer", [
          stat("Instances", `${node.instanceRunning ?? 0}/${node.instanceTotal ?? 0}`),
          stat("Platform", node.platform ?? "unknown"),
          stat("Version", node.version ?? "unknown"),
        ]),
        node.remark ? h("p", node.remark) : null,
      ]))),
    ]);
  },
});

const ServerListPreview = defineComponent<{
  layout: CodeAuthoredLayoutDefinition;
  mock: VisualizationMockData;
}>({
  name: "McsmPortalServerListPreview",
  props: ["layout", "mock"],
  setup(props) {
    const running = computed(() => props.mock.servers.filter((server) => server.status === "running").length);

    return () => h("article", {
      class: "mcsm-image mcsm-image--servers",
      style: { width: `${props.layout.previewWidth}px` },
    }, [
      imageHeader(props.mock.panelName, `${running.value}/${props.mock.servers.length} Minecraft servers running`, props.mock.generatedAt),
      h("section", { class: "mcsm-server-grid" }, props.mock.servers.map((server) => h("div", {
        key: server.id,
        class: ["mcsm-server-card", `is-${server.status}`],
      }, [
        h("header", [
          h("div", [
            h("strong", server.name),
            h("span", server.nodeName ?? server.nodeId ?? "Unknown node"),
          ]),
          h("em", server.status),
        ]),
        h("p", { class: "mcsm-address" }, server.address ?? "No address configured"),
        h("div", { class: "mcsm-server-meta" }, [
          stat("Players", formatPlayers(server)),
          stat("Version", server.version ?? "unknown"),
          stat("Type", server.type ?? "minecraft"),
        ]),
        server.motd ? h("p", { class: "mcsm-motd" }, server.motd) : null,
        server.tags.length ? h("div", { class: "mcsm-tags" }, server.tags.map((tag) => h("span", { key: tag }, tag))) : null,
      ]))),
    ]);
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

function renderMockPreview(layout: CodeAuthoredLayoutDefinition, mock: VisualizationMockData) {
  if (layout.surface === "node-status") return h(NodeStatusPreview, { layout, mock });
  return h(ServerListPreview, { layout, mock });
}

function imageHeader(title: string, subtitle: string, generatedAt: string) {
  return h("header", { class: "mcsm-image-header" }, [
    h("div", [
      h("p", "MCSM Portal"),
      h("h3", title),
      h("span", subtitle),
    ]),
    h("time", formatDate(generatedAt)),
  ]);
}

function summaryItem(label: string, value: string) {
  return h("div", [
    h("span", label),
    h("strong", value),
  ]);
}

function stat(label: string, value: string) {
  return h("span", { class: "mcsm-stat" }, [
    h("small", label),
    h("strong", value),
  ]);
}

function meter(label: string, value: string) {
  return h("div", { class: "mcsm-meter" }, [
    h("span", label),
    h("strong", value),
  ]);
}

function percent(value?: number) {
  if (typeof value !== "number") return "unknown";
  return `${Math.round(value * 100)}%`;
}

function bytesPair(used?: number, total?: number) {
  if (typeof used !== "number" || typeof total !== "number") return "unknown";
  return `${formatBytes(used)} / ${formatBytes(total)}`;
}

function formatBytes(value: number) {
  const gib = value / 1024 ** 3;
  return `${gib.toFixed(gib >= 10 ? 0 : 1)} GiB`;
}

function formatPlayers(server: MinecraftInstance) {
  if (typeof server.onlinePlayers !== "number" && typeof server.maxPlayers !== "number") return "unknown";
  return `${server.onlinePlayers ?? "?"}/${server.maxPlayers ?? "?"}`;
}

function formatDate(value: string) {
  return new Date(value).toLocaleString();
}
