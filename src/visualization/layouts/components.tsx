/** @jsxImportSource react */

import type { MinecraftInstance } from "../../types";
import type { ReactNode } from "react";

export function ImageShell(props: {
  className: string;
  width: number;
  title: string;
  subtitle: string;
  generatedAt: string;
  children: ReactNode;
}) {
  return (
    <article
      className={`mcsm-image ${props.className}`}
      style={{ width: `${props.width}px` }}
    >
      <header className="mcsm-image-header">
        <div>
          <p>MCSM Portal</p>
          <h3>{props.title}</h3>
          <span>{props.subtitle}</span>
        </div>
        <time>{formatDate(props.generatedAt)}</time>
      </header>
      {props.children}
    </article>
  );
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

function formatBytes(value: number) {
  const gib = value / 1024 ** 3;
  return `${gib.toFixed(gib >= 10 ? 0 : 1)} GiB`;
}

function formatDate(value: string) {
  return new Date(value).toLocaleString();
}
