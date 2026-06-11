/** @jsxImportSource react */

import type { CSSProperties } from "react";
import {
  COPYRIGHT_TEXT,
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
      className="mcsm-image mcsm-image--servers mcsm-minecraft-screen"
      style={createImageStyle(layout.previewWidth, data.backgroundTile)}
    >
      <header className="mcsm-minecraft-screen__header">
        <span>{data.portalName}</span>
        <h3>{data.serverTitle}</h3>
        <small>
          {running}/{data.servers.length} servers online
        </small>
      </header>

      <section className="mcsm-minecraft-server-list">
        {data.servers.length ? data.servers.map((server) => (
          <article
            key={server.id}
            className={`mcsm-server-row is-${server.status}`}
          >
            <div className="mcsm-server-icon" aria-hidden="true">
              {server.iconUrl ? (
                <img src={server.iconUrl} alt="" />
              ) : (
                <span>{server.name.slice(0, 1)}</span>
              )}
            </div>
            <div className="mcsm-server-main">
              <div className="mcsm-server-title-line">
                <strong>{server.name}</strong>
              </div>
              <div className="mcsm-server-motd">
                {renderMotd(server)}
              </div>
              <p className="mcsm-server-address">
                {server.address ?? "No address configured"}
              </p>
            </div>
            <aside className="mcsm-server-side">
              <div className="mcsm-server-presence">
                <div className="mcsm-server-status-stack">
                  <small className="mcsm-server-status-tag">
                    {serverLatencyLabel(server).toUpperCase()}
                  </small>
                  <span className="mcsm-server-players">
                    {formatPlayers(server)}
                  </span>
                </div>
                <span className="mcsm-ping-bars" aria-hidden="true">
                  <i />
                  <i />
                  <i />
                  <i />
                  <i />
                </span>
              </div>
              <small className="mcsm-server-version">
                {server.version ?? "Minecraft"}
              </small>
            </aside>
          </article>
        )) : (
          <div className="mcsm-empty-state mcsm-empty-state--servers">
            No servers available
          </div>
        )}
      </section>
      <div className="mcsm-minecraft-footer-spacer" />

      <footer className="mcsm-minecraft-footer">
        <small className="mcsm-image-copyright">{COPYRIGHT_TEXT}</small>
        <time className="mcsm-minecraft-caption">
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
    <span key={index} className="mcsm-server-motd-line">
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
