/** @jsxImportSource react */

import {
  cn,
  FormattedText,
  ImageShell,
  ImageTitleBlock,
  VersionTag,
} from "./components";
import type { ReactNode } from "react";
import type {
  ExecutionVoteLayoutProps,
  ExecutionVoteStatus,
} from "./types";

export function ExecutionVoteLayout({ layout, data }: ExecutionVoteLayoutProps) {
  return (
    <ImageShell
      className="flex flex-col gap-4 px-8 pb-5 pt-6"
      width={layout.previewWidth}
      backgroundTile={data.backgroundTile}
    >
      <VoteHeader data={data} />
      <VoteCommandCard data={data} />
      <VoteProgressCard data={data} />
      <div className="min-h-0.5 flex-auto" />
      <VoteFooter data={data} />
    </ImageShell>
  );
}

function VoteHeader({ data }: Pick<ExecutionVoteLayoutProps, "data">) {
  return (
    <header className="flex items-start justify-between gap-6 border-b-2 border-white/20 pb-4">
      <ImageTitleBlock
        brand={data.portalName}
        title={data.title}
        subtitle={data.statusLabel}
      />
      <span
        className={cn(
          "whitespace-nowrap border-2 px-3 py-2 font-minecraft-ten text-xl leading-none",
          statusClass(data.status),
        )}
      >
        {data.approvals}/{data.required}
      </span>
    </header>
  );
}

function VoteCommandCard({ data }: Pick<ExecutionVoteLayoutProps, "data">) {
  return (
    <section className="grid gap-3 border-2 border-white/20 bg-black/40 p-4">
      <LabeledValue label={data.serverNameLabel}>
        <strong className="min-w-0 break-words font-minecraft-ten text-2xl font-normal leading-none">
          {data.serverName}
        </strong>
      </LabeledValue>
      <LabeledValue label={data.commandLabel}>
        <pre className="m-0 min-w-0 whitespace-pre-wrap break-words font-monocraft text-base leading-6">
          {data.command}
        </pre>
      </LabeledValue>
    </section>
  );
}

function LabeledValue(props: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[112px_minmax(0,1fr)] gap-3">
      <span className="font-minecraft text-sm opacity-70">{props.label}</span>
      {props.children}
    </div>
  );
}

function VoteProgressCard({ data }: Pick<ExecutionVoteLayoutProps, "data">) {
  const progress = Math.min(1, Math.max(0, data.approvals / data.required));
  return (
    <section className="grid gap-2 border-2 border-white/20 bg-black/30 p-4">
      <div className="flex items-baseline justify-between gap-4">
        <span className="font-minecraft text-sm opacity-75">
          {data.progressLabel}
        </span>
        <strong className="font-monocraft text-lg leading-none">
          {data.approvals}/{data.required}
        </strong>
      </div>
      <div className="h-5 overflow-hidden border-2 border-black/70 bg-black/60">
        <span
          className={cn("block h-full", progressClass(data.status))}
          style={{ width: `${progress * 100}%` }}
        />
      </div>
      {data.hint ? (
        <p className="m-0 font-minecraft text-sm leading-5 opacity-75">
          {data.hint}
        </p>
      ) : null}
    </section>
  );
}

function VoteFooter({ data }: Pick<ExecutionVoteLayoutProps, "data">) {
  return (
    <footer className="border-t-2 border-black/30 mx-[-32px] mb-[-20px] mt-0 flex basis-[46px] items-end justify-between gap-4 bg-black/60 px-8 pb-3 pt-2.5">
      <span className="flex items-center gap-2">
        <small className="whitespace-nowrap font-minecraft text-[10px] leading-none">
          <FormattedText text={data.copyright} />
        </small>
        <VersionTag version={data.pluginVersion} />
      </span>
      {data.generatedAt ? (
        <time className="m-0 text-right font-minecraft text-sm">
          {data.generatedAt}
        </time>
      ) : null}
    </footer>
  );
}

function statusClass(status: ExecutionVoteStatus) {
  switch (status) {
    case "passed":
      return "border-[#55ff55]/60 text-[#55ff55]";
    case "rejected":
      return "border-[#ff5555]/60 text-[#ff5555]";
    case "timeout":
      return "border-[#ffaa00]/60 text-[#ffaa00]";
    default:
      return "border-[#ffff55]/50 text-[#ffff55]";
  }
}

function progressClass(status: ExecutionVoteStatus) {
  switch (status) {
    case "passed":
      return "bg-[#55ff55]";
    case "rejected":
      return "bg-[#ff5555]";
    case "timeout":
      return "bg-[#ffaa00]";
    default:
      return "bg-[#ffff55]";
  }
}
