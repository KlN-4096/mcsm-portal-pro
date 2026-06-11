/** @jsxImportSource react */

import { bytesPair, ImageShell, Meter, percent, Stat } from "./components";
import type { VisualizationLayoutProps } from "./types";

export function NodeStatusLayout({ layout, data }: VisualizationLayoutProps) {
  return (
    <ImageShell
      className="mcsm-image--nodes"
      width={layout.previewWidth}
      title={data.panelName}
      subtitle="Daemon node status"
      generatedAt={data.generatedAt}
      backgroundTile={data.backgroundTile}
    >
      <section className="mcsm-node-grid">
        {data.nodes.map((node) => (
          <div
            key={node.id}
            className={`mcsm-node-card ${node.online ? "is-online" : "is-offline"}`}
          >
            <header>
              <div>
                <strong>{node.name}</strong>
                <span>{node.address ?? node.id}</span>
              </div>
              <em>{node.online ? "Online" : "Offline"}</em>
            </header>
            <div className="mcsm-meter-list">
              <Meter label="CPU" value={percent(node.cpuUsage)} />
              <Meter
                label="Memory"
                value={bytesPair(node.memoryUsed, node.memoryTotal)}
              />
              <Meter
                label="Disk"
                value={bytesPair(node.diskUsed, node.diskTotal)}
              />
            </div>
            <footer>
              <Stat
                label="Instances"
                value={`${node.instanceRunning ?? 0}/${node.instanceTotal ?? 0}`}
              />
              <Stat label="Platform" value={node.platform ?? "unknown"} />
              <Stat label="Version" value={node.version ?? "unknown"} />
            </footer>
            {node.remark ? <p>{node.remark}</p> : null}
          </div>
        ))}
      </section>
    </ImageShell>
  );
}
