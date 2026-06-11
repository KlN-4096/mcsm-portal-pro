/** @jsxImportSource react */

import type { MinecraftInstance } from "../../types";
import type { CSSProperties, ReactNode } from "react";

export const COPYRIGHT_TEXT = "Powered by Koishi - Made by KrLite";

export function ImageShell(props: {
  className: string;
  width: number;
  brand: string;
  title: string;
  subtitle: string;
  generatedAt: string;
  backgroundTile?: string;
  children: ReactNode;
}) {
  return (
    <article
      className={`mcsm-image ${props.className}`}
      style={createImageStyle(props.width, props.backgroundTile)}
    >
      <header className="mcsm-image-header">
        <div>
          <p>{props.brand}</p>
          <h3>{props.title}</h3>
          <span>{props.subtitle}</span>
        </div>
        <div className="mcsm-image-meta">
          <time>{formatDate(props.generatedAt)}</time>
          <small className="mcsm-image-copyright">{COPYRIGHT_TEXT}</small>
        </div>
      </header>
      {props.children}
    </article>
  );
}

export function createImageStyle(width: number, backgroundTile?: string) {
  return {
    width: `${width}px`,
    ...(backgroundTile
      ? { "--mcsm-background-tile": `url("${backgroundTile}")` }
      : {}),
  } as CSSProperties & Record<"--mcsm-background-tile", string>;
}

export function Stat(props: { label: string; value: string }) {
  return (
    <span className="mcsm-stat">
      <small>{props.label}</small>
      <strong>{props.value}</strong>
    </span>
  );
}

export function Meter(props: { label: string; value: string }) {
  return (
    <div className="mcsm-meter">
      <span>{props.label}</span>
      <strong>{props.value}</strong>
    </div>
  );
}

export function percent(value?: number) {
  if (typeof value !== "number") return "unknown";
  return `${Math.round(value * 100)}%`;
}

export function bytesPair(used?: number, total?: number) {
  if (typeof used !== "number" || typeof total !== "number") return "unknown";
  return `${formatBytes(used)} / ${formatBytes(total)}`;
}

export function formatPlayers(server: MinecraftInstance) {
  if (
    typeof server.onlinePlayers !== "number" &&
    typeof server.maxPlayers !== "number"
  ) {
    return "unknown";
  }
  return `${server.onlinePlayers ?? "?"}/${server.maxPlayers ?? "?"}`;
}

export function serverLatencyLabel(server: MinecraftInstance) {
  if (server.status === "running") return "Online";
  if (server.status === "starting") return "Starting";
  if (server.status === "stopping") return "Stopping";
  if (server.status === "stopped") return "Offline";
  return "Unknown";
}

export function formatDate(value: string) {
  return new Date(value).toLocaleString();
}

function formatBytes(value: number) {
  const gib = value / 1024 ** 3;
  return `${gib.toFixed(gib >= 10 ? 0 : 1)} GiB`;
}
