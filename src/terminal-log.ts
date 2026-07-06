export interface MarkedTerminalLogCaptureOptions {
  before: string | null;
  log: string | null;
  beginMarker: string;
  endMarker: string;
  ignoredMarkers: string[];
  windowLines: number;
}

const ANSI_CSI_PATTERN = /\u001B\[[0-9;?]*[ -/]*[@-~]/g;
const ANSI_OSC_PATTERN = /\u001B\][^\u0007]*\u0007/g;
const CONTROL_CHARS_PATTERN = /[\u0000-\u001F\u007F-\u009F]/g;
const LOG_LINE_SEPARATOR_PATTERN =
  /\r\n|\n|\r|\\r\\n|\\n|\\r|<br\s*\/?>/i;
const LOG_LINE_PREFIX_PATTERN = /^\[[^\]]+\]\s+\[[^\]]+\]\s+\[[^\]]+\]:\s*/;
const LOG_TIME_PATTERN = /^\[(\d{2}):(\d{2}):(\d{2})\]/;

export function captureMarkedLogLines(options: MarkedTerminalLogCaptureOptions) {
  const lines = tailLines(toLogLines(options.log), options.windowLines);
  return captureFromBaselineDelta(options, lines)
    ?? captureFromMarkerRange(options, lines);
}

export function describeMarkedLogCapture(
  options: MarkedTerminalLogCaptureOptions,
) {
  const beforeLines = tailLines(toLogLines(options.before), options.windowLines);
  const afterLines = tailLines(toLogLines(options.log), options.windowLines);
  const appended = findAppendedLines(beforeLines, afterLines);

  return {
    beforeLines: beforeLines.length,
    afterLines: afterLines.length,
    baselineDeltaFound: Boolean(appended),
    appendedLines: appended?.length,
    beginMarkerTextFound: containsMarkerText(afterLines, options.beginMarker),
    endMarkerTextFound: containsMarkerText(afterLines, options.endMarker),
    beginMarkerLineFound: containsMarkerLine(afterLines, options.beginMarker),
    endMarkerLineFound: containsMarkerLine(afterLines, options.endMarker),
    beforeLogShape: describeLogShape(options.before),
    afterLogShape: describeLogShape(options.log),
  };
}

function captureFromMarkerRange(
  options: MarkedTerminalLogCaptureOptions,
  lines: string[],
) {
  for (let endIndex = lines.length - 1; endIndex >= 0; endIndex--) {
    if (!isCommandMarkerLine(lines[endIndex], options.endMarker)) continue;

    const beginIndex = findLastMarkerIndex(
      lines,
      options.beginMarker,
      endIndex - 1,
    );
    if (beginIndex < 0) continue;

    return normalizeCapturedLines(options, lines.slice(beginIndex + 1, endIndex));
  }
}

function captureFromBaselineDelta(
  options: MarkedTerminalLogCaptureOptions,
  afterLines: string[],
) {
  const beforeLines = tailLines(toLogLines(options.before), options.windowLines);
  const appended = findAppendedLines(beforeLines, afterLines);
  if (!appended) return;

  const endIndex = appended.findIndex((line) =>
    isCommandMarkerLine(line, options.endMarker),
  );
  if (endIndex < 0) return;

  return normalizeCapturedLines(options, appended.slice(0, endIndex));
}

function normalizeCapturedLines(
  options: MarkedTerminalLogCaptureOptions,
  lines: string[],
) {
  return dedupeConsecutive(
    lines.filter((line) =>
      options.ignoredMarkers.every((marker) => !line.includes(marker)),
    ),
  );
}

function findLastMarkerIndex(lines: string[], marker: string, start: number) {
  for (let index = start; index >= 0; index--) {
    if (isCommandMarkerLine(lines[index], marker)) return index;
  }
  return -1;
}

export function logContainsMarkerSince(
  before: string | null,
  after: string | null,
  marker: string,
  windowLines: number,
) {
  const beforeTail = tailLines(toLogLines(before), windowLines);
  const afterTail = tailLines(toLogLines(after), windowLines);
  return (findAppendedLines(beforeTail, afterTail) ?? afterTail).some((line) =>
    isCommandMarkerLine(line, marker),
  );
}

export function limitOutput(output: string, maxLength: number) {
  if (output.length <= maxLength) return output;
  return `${output.slice(0, Math.max(0, maxLength - 3))}...`;
}

export function stripMinecraftLogPrefixes(lines: string[]) {
  return lines.map((line) => line.replace(LOG_LINE_PREFIX_PATTERN, ""));
}

function toLogLines(text: string | null) {
  if (!text) return [];
  return text
    .split(LOG_LINE_SEPARATOR_PATTERN)
    .map(stripAnsiAndControls)
    .map((line) => line.trimEnd())
    .filter((line) => line.trim() !== "");
}

function describeLogShape(text: string | null) {
  const value = text ?? "";
  return {
    rawLength: value.length,
    hasLf: value.includes("\n"),
    hasCr: value.includes("\r"),
    hasEscapedLf: value.includes("\\n"),
    hasEscapedCr: value.includes("\\r"),
    hasHtmlBreak: /<br\s*\/?>/i.test(value),
  };
}

function findAppendedLines(before: string[], after: string[]) {
  if (before.length === 0) return after;
  const pattern = [...before].reverse();
  const text = [...after].reverse();
  const table = buildPrefixTable(pattern);
  let bestStart = -1;
  let bestOverlap = 0;
  let matched = 0;

  for (let index = 0; index < text.length; index++) {
    while (matched > 0 && text[index] !== pattern[matched]) {
      matched = table[matched - 1];
    }
    if (text[index] === pattern[matched]) matched += 1;

    if (matched > bestOverlap) {
      bestStart = after.length - 1 - index;
      bestOverlap = matched;
    }
    if (matched === pattern.length) matched = table[matched - 1];
  }

  if (bestOverlap === 0) return;
  return after.slice(bestStart + bestOverlap);
}

function buildPrefixTable(pattern: string[]) {
  const table = new Array<number>(pattern.length).fill(0);
  let matched = 0;

  for (let index = 1; index < pattern.length; index++) {
    while (matched > 0 && pattern[index] !== pattern[matched]) {
      matched = table[matched - 1];
    }
    if (pattern[index] === pattern[matched]) matched += 1;
    table[index] = matched;
  }

  return table;
}

function dedupeConsecutive(lines: string[]) {
  const result: string[] = [];
  let previous = "";

  for (const line of lines) {
    const key = stripTimestampPrefix(line).trimEnd();
    if (key === previous) continue;
    previous = key;
    result.push(line);
  }
  return result;
}

function isCommandMarkerLine(line: string, marker: string) {
  return line.includes(marker);
}

function containsMarkerText(lines: string[], marker: string) {
  return lines.some((line) => line.includes(marker));
}

function containsMarkerLine(lines: string[], marker: string) {
  return lines.some((line) => isCommandMarkerLine(line, marker));
}

function tailLines(lines: string[], limit: number) {
  if (limit <= 0) return [];
  return lines.length <= limit ? lines : lines.slice(lines.length - limit);
}

function stripTimestampPrefix(line: string) {
  return line.replace(LOG_TIME_PATTERN, "").trimStart();
}

function stripAnsiAndControls(input: string) {
  return input
    .replace(ANSI_CSI_PATTERN, "")
    .replace(ANSI_OSC_PATTERN, "")
    .replace(CONTROL_CHARS_PATTERN, "");
}
