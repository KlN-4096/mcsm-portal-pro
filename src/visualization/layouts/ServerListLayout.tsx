/** @jsxImportSource react */

import type { CSSProperties } from "react";
import {
  COPYRIGHT_TEXT,
  cn,
  createImageStyle,
  formatDate,
  formatPlayers,
  serverLatencyLabel,
} from "./components";
import type { MinecraftInstance, MinecraftTextSegment } from "../../types";
import type { VisualizationLayoutProps } from "./types";

export function ServerListLayout({ layout, data }: VisualizationLayoutProps) {
  const running = data.servers.filter(
    (server) => server.status === "running",
  ).length;

  return (
    <article
      className="mcsm-image-base box-border flex min-h-[480px] max-w-full flex-col gap-3.5 bg-black px-8 pb-5 pt-6 font-minecraft text-white"
      style={createImageStyle(layout.previewWidth, data.backgroundTile)}
    >
      <header className="grid justify-items-center gap-1 text-center">
        <span className="font-minecraft-five text-sm">{data.portalName}</span>
        <h3 className="m-0 font-minecraft-ten text-[30px] font-normal leading-normal">
          {data.serverTitle}
        </h3>
        <small className="font-minecraft text-base opacity-80">
          {running}/{data.servers.length} servers online
        </small>
      </header>

      <section className="grid flex-none gap-1 border-t-2 border-white/20 py-2">
        {data.servers.length ? data.servers.map((server) => (
          <article
            key={server.id}
            className={cn(
              "grid min-h-[86px] grid-cols-[74px_minmax(0,1fr)_136px] items-stretch gap-3 border-2 p-[6px_12px_6px_6px] hover:border-white/30 hover:bg-black/35",
              {
                "border-white/30 bg-black/35": server.status === "running",
                "border-white/20 bg-transparent": isInactiveServer(server),
                "border-white/20 bg-black/40":
                  server.status !== "running" && !isInactiveServer(server),
              },
            )}
          >
            <div
              className="mcsm-server-icon-surface grid h-[74px] w-[74px] place-items-center overflow-hidden border-2 border-black/60"
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
            <div className="grid min-w-0 content-start grid-rows-[auto_36px_auto]">
              <div className="flex min-w-0 justify-between gap-3">
                <strong className="overflow-hidden text-ellipsis whitespace-nowrap text-xl font-normal">
                  {server.name}
                </strong>
              </div>
              <div className="mt-1 grid min-h-9 grid-rows-[repeat(2,18px)] content-start overflow-hidden leading-[18px]">
                {renderMotd(server)}
              </div>
              <p className="m-0 mt-1 overflow-hidden text-ellipsis whitespace-nowrap font-minecraft text-sm tracking-[-0.04em] opacity-70">
                {server.address ?? "No address configured"}
              </p>
            </div>
            <aside className="grid min-h-[60px] min-w-0 w-full content-stretch justify-items-end gap-1 overflow-hidden grid-rows-[auto_1fr]">
              <div className="grid min-h-6 w-full grid-cols-[minmax(0,1fr)_43px] items-stretch gap-2">
                <div className="grid h-6 min-w-0 content-between justify-items-end">
                  <small className="block max-w-full overflow-hidden text-ellipsis whitespace-nowrap font-minecraft-five text-[7px] leading-none opacity-70">
                    {serverLatencyLabel(server).toUpperCase()}
                  </small>
                  <span className="block max-w-full overflow-hidden text-ellipsis whitespace-nowrap font-monocraft text-sm leading-none tracking-[-0.04em]">
                    {formatPlayers(server)}
                  </span>
                </div>
                <span
                  className="inline-grid h-6 grid-cols-[repeat(5,7px)] items-end gap-0.5"
                  aria-hidden="true"
                >
                  <i
                    className={cn("block h-[5px] w-[7px] bg-white", {
                      "opacity-30": isInactiveServer(server),
                    })}
                  />
                  <i
                    className={cn("block h-2.5 w-[7px] bg-white", {
                      "opacity-30": isInactiveServer(server),
                    })}
                  />
                  <i
                    className={cn("block h-3.5 w-[7px] bg-white", {
                      "opacity-30": isInactiveServer(server),
                    })}
                  />
                  <i
                    className={cn("block h-[19px] w-[7px] bg-white", {
                      "opacity-30": isInactiveServer(server),
                    })}
                  />
                  <i
                    className={cn("block h-6 w-[7px] bg-white", {
                      "opacity-30": isInactiveServer(server),
                    })}
                  />
                </span>
              </div>
              <small className="max-w-full self-end break-words text-right font-minecraft">
                {server.version ?? "Minecraft"}
              </small>
            </aside>
          </article>
        )) : (
          <div className="grid min-h-[180px] place-items-center text-center font-minecraft text-[22px] opacity-75">
            No servers available
          </div>
        )}
      </section>
      <div className="min-h-0.5 flex-auto" />

      <footer className="mx-[-32px] mb-[-20px] mt-0 flex basis-[46px] items-end justify-between gap-4 bg-black/60 px-8 pb-3 pt-2.5">
        <small className="font-minecraft text-xs opacity-75">
          {COPYRIGHT_TEXT}
        </small>
        <time className="m-0 text-right font-minecraft text-sm opacity-70">
          {formatDate(data.generatedAt)}
        </time>
      </footer>
    </article>
  );
}

function renderMotd(server: MinecraftInstance) {
  const lines = splitMotdLines(
    server.motdSegments?.length
      ? server.motdSegments
      : [{ text: server.motd ?? server.address ?? "Minecraft Server" }],
  );

  return [0, 1].map((index) => (
    <span
      key={index}
      className="block min-w-0 overflow-hidden whitespace-nowrap"
    >
      {lines[index]?.map((segment, segmentIndex) => (
        <span key={segmentIndex} style={createMotdStyle(segment)}>
          {segment.text}
        </span>
      ))}
    </span>
  ));
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

function createMotdStyle(segment: MinecraftTextSegment): CSSProperties {
  return {
    backgroundImage: segment.gradient,
    backgroundClip: segment.gradient ? "text" : undefined,
    WebkitBackgroundClip: segment.gradient ? "text" : undefined,
    color: segment.color,
    WebkitTextFillColor: segment.gradient ? "transparent" : undefined,
    fontWeight: segment.bold ? 700 : undefined,
    fontStyle: segment.italic ? "italic" : undefined,
    textDecoration: [
      segment.underlined ? "underline" : undefined,
      segment.strikethrough ? "line-through" : undefined,
    ].filter(Boolean).join(" ") || undefined,
  };
}

function isInactiveServer(server: MinecraftInstance) {
  return server.status === "stopped" || server.status === "unknown";
}
