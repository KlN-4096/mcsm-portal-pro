/** @jsxImportSource react */

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { Config } from "../config";
import {
  type CodeAuthoredLayoutDefinition,
  withImageWidth,
} from "../visualization";
import {
  ExecutionVoteLayout,
  type ExecutionVoteLayoutData,
  type ExecutionVoteStatus,
} from "./layouts";
import { createVisualizationDataBase } from "./render-base";
import type { VisualizationRenderResult } from "./renderer";

export interface ExecutionVoteVisualizationState {
  title: string;
  serverNameLabel: string;
  serverName: string;
  commandLabel: string;
  command: string;
  progressLabel: string;
  hint: string;
  status: ExecutionVoteStatus;
  statusLabel: string;
  approvals: number;
  required: number;
}

export function renderExecutionVoteVisualization(
  config: Config,
  vote: ExecutionVoteVisualizationState,
): VisualizationRenderResult {
  const layout = withImageWidth(EXECUTION_VOTE_LAYOUT, config.image.width);
  const data = createExecutionVoteData(config, vote);
  return {
    layout,
    data,
    html: renderToStaticMarkup(createElement(ExecutionVoteLayout, { layout, data })),
    width: layout.previewWidth,
    height: estimateExecutionVoteHeight(vote),
  };
}

function createExecutionVoteData(
  config: Config,
  vote: ExecutionVoteVisualizationState,
): ExecutionVoteLayoutData {
  const base = createVisualizationDataBase(config);
  return {
    portalName: base.portalName,
    copyright: base.copyright,
    pluginVersion: base.pluginVersion,
    generatedAt: base.generatedAt,
    backgroundTile: base.backgroundTile,
    ...vote,
  };
}

const EXECUTION_VOTE_LAYOUT: CodeAuthoredLayoutDefinition = {
  id: "execution-vote.react.default",
  name: "Execution Vote",
  surface: "execution-vote",
  description: "Runtime layout for MCSManager command execution votes.",
  renderer: "react",
  componentPath: "src/visualization/layouts/ExecutionVoteLayout.tsx",
  exportName: "ExecutionVoteLayout",
  previewWidth: 854,
};

const VOTE_COMMAND_CHARS_PER_LINE = 58;
const VOTE_BASE_HEIGHT = 410;
const VOTE_LINE_HEIGHT = 24;

function estimateExecutionVoteHeight(vote: ExecutionVoteVisualizationState) {
  const lineCount = vote.command
    .split(/\r\n?|\n/)
    .reduce((total, line) => {
      return total + Math.max(1, Math.ceil(line.length / VOTE_COMMAND_CHARS_PER_LINE));
    }, 0);
  return VOTE_BASE_HEIGHT + Math.max(0, lineCount - 1) * VOTE_LINE_HEIGHT;
}
