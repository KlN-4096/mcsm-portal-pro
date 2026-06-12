/** @jsxImportSource react */

import {
  bytesPair,
  cn,
  ImageMetaOverlay,
  ImageShell,
  ImageTitleBlock,
  Meter,
  percent,
  Stat,
} from "./components";
import type { VisualizationLayoutProps } from "./types";

export function NodeStatusLayout({ layout, data }: VisualizationLayoutProps) {
  return (
    <ImageShell
      className="mcsm-image--nodes p-8"
      width={layout.previewWidth}
      backgroundTile={data.backgroundTile}
    >
        <header className="mb-4 flex items-start justify-between gap-5">
          <ImageTitleBlock
            brand={data.portalName}
            title={data.nodeTitle}
            subtitle={data.text.nodeOnlineSummary}
          />
          <ImageMetaOverlay
            copyright={data.copyright}
            pluginVersion={data.pluginVersion}
            generatedAt={data.generatedAt}
          />
        </header>
      <section className="grid gap-3">
        {data.nodes.length ? (
          data.nodes.map((node) => (
            <div
              key={node.id}
              className={cn("border-2 border-white/20 p-3.5", {
                "bg-black/40": node.online,
                "bg-transparent": !node.online,
              })}
            >
              <header className="flex items-start justify-between gap-4">
                <div>
                  <strong className="block text-lg font-normal">
                    {node.name}
                  </strong>
                  <span className="mt-1 block opacity-75">
                    {node.address ?? node.id}
                  </span>
                </div>
                <em className="border-2 border-white/20 bg-black/60 px-2.5 py-1 font-minecraft-five text-[10px] not-italic leading-none">
                  {node.online ? data.text.online : data.text.offline}
                </em>
              </header>
              <div className="my-4 grid grid-cols-2 gap-2.5">
                <Meter
                  label={data.text.cpu}
                  value={percent(node.cpuUsage, data.text.unknown)}
                  progress={node.cpuUsage}
                  tone={usageTone(node.cpuUsage)}
                />
                <Meter
                  label={data.text.memory}
                  value={bytesPair(
                    node.memoryUsed,
                    node.memoryTotal,
                    data.text.unknown,
                  )}
                  progress={memoryRatio(node.memoryUsed, node.memoryTotal)}
                  tone={usageTone(memoryRatio(node.memoryUsed, node.memoryTotal))}
                />
              </div>
              <footer className="grid grid-cols-3 gap-2.5">
                <Stat
                  label={data.text.instances}
                  value={`${node.instanceRunning ?? 0}/${node.instanceTotal ?? 0}`}
                />
                <Stat
                  label={data.text.platform}
                  value={node.platform ?? data.text.unknown}
                />
                <Stat
                  label={data.text.version}
                  value={node.version ?? data.text.unknown}
                />
              </footer>
            </div>
          ))
        ) : (
          <div className="grid min-h-[220px] place-items-center text-center font-minecraft text-[22px] opacity-75">
            {data.text.noNodesAvailable}
          </div>
        )}
      </section>
    </ImageShell>
  );
}

function memoryRatio(used?: number, total?: number) {
  if (typeof used !== "number" || typeof total !== "number" || total <= 0) {
    return;
  }
  return used / total;
}

function usageTone(value?: number) {
  if (typeof value !== "number") return;
  if (value >= 0.85) return "danger";
  if (value >= 0.65) return "warning";
  return "success";
}
