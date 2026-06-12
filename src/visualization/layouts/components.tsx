/** @jsxImportSource react */

import type { MinecraftInstance, MinecraftTextSegment } from "../../types";
import type { CSSProperties, ReactNode } from "react";
import { parseMinecraftText } from "../../minecraft-text";

export function ImageShell(props: {
  className?: string;
  width: number;
  backgroundTile?: string;
  children: ReactNode;
}) {
  return (
    <article
      className={cn(
        "mcsm-image-base box-border min-h-[480px] max-w-full bg-black font-minecraft text-white",
        props.className,
      )}
      style={createImageStyle(props.width, props.backgroundTile)}
    >
      {props.children}
    </article>
  );
}

export function ImageTitleBlock(props: {
  brand?: string;
  title?: string;
  subtitle?: string;
  centered?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex flex-col",
        props.centered ? "items-center" : "items-start",
      )}
    >
      <p className={cn("m-0 font-minecraft-five text-sm mb-2")}>
        <FormattedText text={props.brand ?? ""} />
      </p>
      <h3 className="m-0 font-minecraft-ten text-[30px] font-normal leading-normal">
        <FormattedText text={props.title ?? ""} />
      </h3>
      <span className="font-minecraft text-base opacity-80">
        {props.subtitle}
      </span>
    </div>
  );
}

export function ImageMetaOverlay(props: {
  copyright: string;
  pluginVersion: string;
  generatedAt?: string;
}) {
  return (
    <div className="grid justify-items-end gap-0.5 text-right opacity-75">
      {props.generatedAt ? <time>{formatDate(props.generatedAt)}</time> : null}
      <span className="flex items-center justify-end gap-1.5">
        <VersionTag version={props.pluginVersion} />
        <small className="font-minecraft text-xs">
          <FormattedText text={props.copyright} />
        </small>
      </span>
    </div>
  );
}

export function VersionTag(props: { version: string }) {
  return (
    <small className="inline-block bg-white/15 px-[5px] py-[3px] font-minecraft text-[10px] leading-none text-white/85">
      v{props.version}
    </small>
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

export function FormattedText(props: { text: string }) {
  return <>{renderMinecraftTextSegments(parseMinecraftText(props.text))}</>;
}

export function renderMinecraftTextSegments(segments: MinecraftTextSegment[]) {
  return segments.map((segment, index) => (
    <span key={index} style={createMinecraftTextStyle(segment)}>
      {segment.text}
    </span>
  ));
}

export function createMinecraftTextStyle(
  segment: MinecraftTextSegment,
): CSSProperties {
  return {
    backgroundImage: segment.gradient,
    backgroundClip: segment.gradient ? "text" : undefined,
    WebkitBackgroundClip: segment.gradient ? "text" : undefined,
    color: segment.color,
    WebkitTextFillColor: segment.gradient ? "transparent" : undefined,
    fontWeight: segment.bold ? 700 : undefined,
    fontStyle: segment.italic ? "italic" : undefined,
    textDecoration:
      [
        segment.underlined ? "underline" : undefined,
        segment.strikethrough ? "line-through" : undefined,
      ]
        .filter(Boolean)
        .join(" ") || undefined,
  };
}

export function Stat(props: { label: string; value: string }) {
  return (
    <span className="grid gap-1 border-2 border-white/20 bg-black/30 p-2">
      <small className="opacity-75">{props.label}</small>
      <strong>{props.value}</strong>
    </span>
  );
}

export function Meter(props: {
  label: string;
  value: string;
  progress?: number;
  tone?: "success" | "warning" | "danger";
}) {
  const progress = normalizeProgress(props.progress);
  const visualProgress =
    progress === undefined ? undefined : normalizeVisualProgress(progress);
  return (
    <div
      className={cn(
        "relative grid gap-1 overflow-hidden border-2 bg-black/30 p-2",
        meterBorderClass(props.tone),
      )}
    >
      {visualProgress !== undefined ? (
        <span
          className={cn(
            "absolute inset-y-0 left-0",
            meterFillClass(props.tone),
          )}
          style={{ width: `${visualProgress * 100}%` }}
          aria-hidden="true"
        />
      ) : null}
      <span className={cn("relative opacity-75", meterTextClass(props.tone))}>
        {props.label}
      </span>
      <strong className={cn("relative", meterTextClass(props.tone))}>
        {props.value}
      </strong>
    </div>
  );
}

function meterFillClass(tone?: "success" | "warning" | "danger") {
  switch (tone) {
    case "danger":
      return "bg-[#ff5555]/20";
    case "warning":
      return "bg-[#ffff55]/20";
    case "success":
      return "bg-[#55ff55]/15";
    default:
      return "bg-white/10";
  }
}

function meterBorderClass(tone?: "success" | "warning" | "danger") {
  switch (tone) {
    case "danger":
      return "border-[#ff5555]/45";
    case "warning":
      return "border-[#ffff55]/40";
    case "success":
      return "border-[#55ff55]/35";
    default:
      return "border-white/20";
  }
}

function meterTextClass(tone?: "success" | "warning" | "danger") {
  switch (tone) {
    case "danger":
      return "text-[#ff5555]";
    case "warning":
      return "text-[#ffff55]";
    case "success":
      return "text-[#55ff55]";
    default:
      return "text-white";
  }
}

function normalizeProgress(value?: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) return;
  return Math.min(1, Math.max(0, value));
}

function normalizeVisualProgress(value: number) {
  if (value > 0 && value < 0.02) return 0.02;
  if (value > 0.98) return 1;
  return value;
}

export function percent(value?: number, unknown = "unknown") {
  if (typeof value !== "number") return unknown;
  return `${Math.round(value * 100)}%`;
}

export function bytesPair(used?: number, total?: number, unknown = "unknown") {
  if (typeof used !== "number" || typeof total !== "number") return unknown;
  return `${formatBytes(used)} / ${formatBytes(total)}`;
}

export function formatPlayers(server: MinecraftInstance, unknown = "unknown") {
  if (
    typeof server.onlinePlayers !== "number" &&
    typeof server.maxPlayers !== "number"
  ) {
    return unknown;
  }
  return `${server.onlinePlayers ?? "?"}/${server.maxPlayers ?? "?"}`;
}

export function serverLatencyLabel(
  server: MinecraftInstance,
  labels: Record<MinecraftInstance["status"], string>,
) {
  return labels[server.status] ?? labels.unknown;
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
