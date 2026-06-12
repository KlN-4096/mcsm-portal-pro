/** @jsxImportSource react */

import {
  cn,
  createMinecraftTextStyle,
  FormattedText,
  ImageShell,
  ImageTitleBlock,
  VersionTag,
  formatDate,
  formatPlayers,
  serverLatencyLabel,
} from "./components";
import { formatGameVersion } from "../../minecraft-server";
import type { MinecraftInstance, MinecraftTextSegment } from "../../types";
import type { VisualizationLayoutProps } from "./types";

export function ServerListLayout({ layout, data }: VisualizationLayoutProps) {
  return (
    <ImageShell
      className="flex flex-col gap-3.5 px-8 pb-5 pt-6"
      width={layout.previewWidth}
      backgroundTile={data.backgroundTile}
    >
      <header className="flex items-start justify-center gap-5 text-center">
        <ImageTitleBlock
          brand={data.portalName}
          title={data.serverTitle}
          subtitle={data.text.serverOnlineSummary}
          centered
        />
      </header>
      <section className="grid flex-none gap-1 border-t-2 border-white/20 py-2">
        {data.servers.length ? (
          data.servers.map((server) => (
            <article
              key={server.id}
              className={cn(
                "grid min-h-[86px] grid-cols-[86px_minmax(0,1fr)_156px] items-stretch gap-3 border-2 p-[6px_12px_6px_6px] border-white/20",
                server.status === "running" ? "bg-black/40" : "bg-transparent",
              )}
            >
              <div
                className="mcsm-server-icon-surface grid h-[86px] w-[86px] place-items-center overflow-hidden border-2 border-black/60"
                aria-hidden="true"
              >
                {server.iconUrl ? (
                  <img
                    className="block h-full w-full object-cover [image-rendering:pixelated]"
                    src={server.iconUrl}
                    alt=""
                  />
                ) : (
                  <span className="font-minecraft-ten text-2xl font-normal leading-none">
                    {server.name.slice(0, 1)}
                  </span>
                )}
              </div>
              <div className="grid min-w-0 grid-rows-[auto_1fr_auto]">
                <div className="flex min-w-0 justify-between gap-3">
                  <strong className="overflow-hidden text-ellipsis whitespace-nowrap text-xl font-normal">
                    {server.name}
                  </strong>
                </div>
                <div className="mt-1 grid min-h-9 grid-rows-[repeat(2,18px)] content-start overflow-hidden leading-[18px]">
                  {renderMotd(server, data.text.defaultMotd)}
                </div>
                <p className="m-0 self-end overflow-hidden text-ellipsis whitespace-nowrap font-minecraft text-[11px] leading-[13px] opacity-70">
                  {server.address ?? data.text.noAddressConfigured}
                </p>
              </div>
              <aside className="grid min-h-[60px] min-w-0 w-full content-stretch justify-items-end gap-1 overflow-hidden grid-rows-[auto_auto_1fr]">
                <span className="flex h-3.5 items-baseline justify-end gap-1">
                  <span
                    className={cn(
                      "min-w-[42px] text-right font-monocraft text-xs leading-[14px] tracking-[-0.04em]",
                      latencyTextClass(server),
                    )}
                  >
                    {formatLatency(server)}
                  </span>
                  <span
                    className="relative top-px inline-grid h-2.5 grid-cols-[repeat(5,2px)] items-end gap-0.5"
                    aria-label={formatLatency(server)}
                  >
                    {["h-0.5", "h-1", "h-1.5", "h-2", "h-2.5"].map(
                      (height, index) => (
                        <i
                          key={height}
                          className={cn(
                            "block w-0.5",
                            height,
                            signalBarClass(server, index),
                          )}
                        />
                      ),
                    )}
                  </span>
                </span>
                <div className="grid h-6 min-w-0 content-between justify-items-end">
                  <small
                    className={cn(
                      "block max-w-full overflow-hidden text-ellipsis whitespace-nowrap font-minecraft-five text-[7px] leading-none",
                      latencyTextClass(server),
                    )}
                  >
                    {serverLatencyLabel(server, data.text.statusLabels)}
                  </small>
                  <span className="block max-w-full overflow-hidden text-ellipsis whitespace-nowrap font-monocraft text-sm leading-none tracking-[-0.04em]">
                    {formatPlayers(server, data.text.unknown)}
                  </span>
                </div>
                <small className="max-w-full self-end break-words text-right font-minecraft">
                  {formatGameVersion(server)}
                </small>
              </aside>
            </article>
          ))
        ) : (
          <div className="grid min-h-[180px] place-items-center text-center font-minecraft text-[22px] opacity-75">
            {data.text.noServersAvailable}
          </div>
        )}
      </section>
      <div className="min-h-0.5 flex-auto" />
      <footer className="border-t-2 border-black/30 mx-[-32px] mb-[-20px] mt-0 flex basis-[46px] items-end justify-between gap-4 bg-black/60 px-8 pb-3 pt-2.5">
        <span className="flex items-center gap-2">
          <small className="font-minecraft text-sm">
            <FormattedText text={data.copyright} />
          </small>
          <VersionTag version={data.pluginVersion} />
        </span>
        {data.generatedAt ? (
          <time className="m-0 text-right font-minecraft text-sm">
            {formatDate(data.generatedAt)}
          </time>
        ) : null}
      </footer>
    </ImageShell>
  );
}

function renderMotd(server: MinecraftInstance, defaultMotd: string) {
  const lines = splitMotdLines(
    server.motdSegments?.length
      ? server.motdSegments
      : [{ text: server.motd ?? server.address ?? defaultMotd }],
  );

  return [0, 1].map((index) => (
    <span
      key={index}
      className="block min-w-0 overflow-hidden whitespace-nowrap"
    >
      {lines[index]?.map((segment, segmentIndex) => (
        <span key={segmentIndex} style={createMinecraftTextStyle(segment)}>
          {renderMotdSegmentText(segment.text)}
        </span>
      ))}
    </span>
  ));
}

function renderMotdSegmentText(text: string) {
  return text.split(/([ \t]+)/).map((part, index) => {
    if (!part) return null;
    if (!/^[ \t]+$/.test(part)) return part;
    return [...part].map((character, spaceIndex) => (
      <span
        key={`${index}-${spaceIndex}`}
        className="inline-block"
        style={{ width: character === "\t" ? "2.67em" : "0.67em" }}
        aria-hidden="true"
      />
    ));
  });
}

function splitMotdLines(segments: MinecraftTextSegment[]) {
  const lines: MinecraftTextSegment[][] = [[]];

  for (const segment of segments) {
    const parts = segment.text.replace(/\r\n?/g, "\n").split("\n");
    parts.forEach((part, index) => {
      if (index > 0) lines.push([]);
      if (part) lines[lines.length - 1].push({ ...segment, text: part });
    });
  }

  return lines.slice(0, 2);
}

function isInactiveServer(server: MinecraftInstance) {
  return server.status === "stopped" || server.status === "unknown";
}

function formatLatency(server: MinecraftInstance) {
  if (isInactiveServer(server)) return "";
  if (typeof server.latencyMs !== "number") return "? ms";
  return `${Math.max(0, Math.round(server.latencyMs))} ms`;
}

function signalBarClass(server: MinecraftInstance, index: number) {
  if (index >= activeSignalBars(server)) return "bg-white/20";
  switch (latencyTier(server)) {
    case "excellent":
      return "bg-[#55ff55]";
    case "good":
      return "bg-[#ffff55]";
    case "fair":
      return "bg-[#ffaa00]";
    case "poor":
      return "bg-[#ff5555]";
    default:
      return "bg-[#555555]";
  }
}

function latencyTextClass(server: MinecraftInstance) {
  switch (latencyTier(server)) {
    case "excellent":
      return "text-[#55ff55]";
    case "good":
      return "text-[#ffff55]";
    case "fair":
      return "text-[#ffaa00]";
    case "poor":
      return "text-[#ff5555]";
    default:
      return "text-[#aaaaaa]";
  }
}

function activeSignalBars(server: MinecraftInstance) {
  switch (latencyTier(server)) {
    case "excellent":
      return 5;
    case "good":
      return 4;
    case "fair":
      return 3;
    case "poor":
      return 2;
    default:
      return isInactiveServer(server) ? 0 : 1;
  }
}

function latencyTier(server: MinecraftInstance) {
  if (isInactiveServer(server) || typeof server.latencyMs !== "number") {
    return "offline";
  }
  if (server.latencyMs <= 150) return "excellent";
  if (server.latencyMs <= 300) return "good";
  if (server.latencyMs <= 600) return "fair";
  return "poor";
}
