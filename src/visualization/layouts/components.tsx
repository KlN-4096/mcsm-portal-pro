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
      className={cn(
        "mcsm-image-base box-border min-h-[480px] max-w-full bg-black p-8 font-minecraft text-white",
        props.className,
      )}
      style={createImageStyle(props.width, props.backgroundTile)}
    >
      <header className="mb-6 flex items-start justify-between gap-5">
        <div>
          <p className="m-0 mb-2 font-minecraft-five text-sm">{props.brand}</p>
          <h3 className="m-0 font-minecraft-ten text-[30px] font-normal leading-normal">
            {props.title}
          </h3>
          <span className="opacity-75">{props.subtitle}</span>
        </div>
        <div className="grid justify-items-end gap-1.5 text-right opacity-75">
          <time>{formatDate(props.generatedAt)}</time>
          <small className="font-minecraft text-xs opacity-75">
            {COPYRIGHT_TEXT}
          </small>
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
    <span className="grid gap-1 border-2 border-white/20 bg-black/30 p-2">
      <small className="opacity-75">{props.label}</small>
      <strong>{props.value}</strong>
    </span>
  );
}

export function Meter(props: { label: string; value: string }) {
  return (
    <div className="grid gap-1 border-2 border-white/20 bg-black/30 p-2">
      <span className="opacity-75">{props.label}</span>
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

export function cn(
  ...values: Array<
    | string
    | false
    | null
    | undefined
    | Record<string, boolean | null | undefined>
  >
) {
  return values
    .flatMap((value) => {
      if (!value) return [];
      if (typeof value === "string") return [value];
      return Object.entries(value)
        .filter(([, enabled]) => enabled)
        .map(([className]) => className);
    })
    .join(" ");
}
