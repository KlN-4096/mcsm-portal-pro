/** @jsxImportSource react */

import {
  bytesPair,
  cn,
  ImageShell,
  Meter,
  percent,
  Stat,
} from "./components";
import type { VisualizationLayoutProps } from "./types";

export function NodeStatusLayout({ layout, data }: VisualizationLayoutProps) {
  const online = data.nodes.filter((node) => node.online).length;

  return (
    <ImageShell
      className="mcsm-image--nodes"
      width={layout.previewWidth}
      title={data.nodeTitle}
      subtitle={`${online}/${data.nodes.length} nodes online`}
      brand={data.portalName}
      generatedAt={data.generatedAt}
      backgroundTile={data.backgroundTile}
    >
      <section className="grid gap-3">
        {data.nodes.length ? data.nodes.map((node) => (
          <div
            key={node.id}
            className={cn("border-2 border-white/20 p-3.5", {
              "bg-black/40": node.online,
              "bg-transparent": !node.online,
            })}
          >
            <header className="flex items-start justify-between gap-4">
              <div>
                <strong className="block text-lg font-normal">{node.name}</strong>
                <span className="mt-1 block opacity-75">
                  {node.address ?? node.id}
                </span>
              </div>
              <em className="border-2 border-white/30 bg-black/35 px-2.5 py-1 not-italic">
                {node.online ? "Online" : "Offline"}
              </em>
            </header>
            <div className="my-4 grid grid-cols-3 gap-2.5">
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
            <footer className="grid grid-cols-3 gap-2.5">
              <Stat
                label="Instances"
                value={`${node.instanceRunning ?? 0}/${node.instanceTotal ?? 0}`}
              />
              <Stat label="Platform" value={node.platform ?? "unknown"} />
              <Stat label="Version" value={node.version ?? "unknown"} />
            </footer>
            {node.remark ? (
              <p className="m-0 mt-3 leading-[1.45] opacity-80">
                {node.remark}
              </p>
            ) : null}
          </div>
        )) : (
          <div className="grid min-h-[220px] place-items-center text-center font-minecraft text-[22px] opacity-75">
            No nodes available
          </div>
        )}
      </section>
    </ImageShell>
  );
}
