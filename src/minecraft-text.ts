import type { MinecraftTextSegment } from "./types";

export function parseMinecraftText(
  value: string,
  base: Omit<MinecraftTextSegment, "text"> = {},
): MinecraftTextSegment[] {
  const segments = parseLegacyFormatting(value, base);
  return segments.flatMap((segment) => parseMiniMessage(segment.text, segment));
}

export function parseMinecraftChatComponent(value: unknown): MinecraftTextSegment[] {
  const output: MinecraftTextSegment[] = [];
  collectComponentText(value, {}, output);
  return output.flatMap((segment) => parseMinecraftText(segment.text, segment));
}

function collectComponentText(
  value: unknown,
  inherited: Omit<MinecraftTextSegment, "text">,
  output: MinecraftTextSegment[],
) {
  if (typeof value === "string") {
    output.push(...parseMinecraftText(value, inherited));
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => collectComponentText(item, inherited, output));
    return;
  }
  if (!isRecord(value)) return;
  const current = {
    ...inherited,
    ...readComponentStyle(value),
  };
  const text = readRecordString(value, "text");
  if (text) output.push(...parseMinecraftText(text, current));
  collectComponentText(value.extra, current, output);
}

function parseLegacyFormatting(
  value: string,
  base: Omit<MinecraftTextSegment, "text">,
): MinecraftTextSegment[] {
  const output: MinecraftTextSegment[] = [];
  let style = { ...base };
  let buffer = "";

  const flush = () => {
    if (!buffer) return;
    output.push({ ...style, text: buffer });
    buffer = "";
  };

  for (let index = 0; index < value.length; index += 1) {
    if (value[index] !== "§" || index + 1 >= value.length) {
      buffer += value[index];
      continue;
    }

    const code = value[++index].toLowerCase();
    const color = legacyColors[code];
    if (color) {
      flush();
      style = { ...base, color };
    } else if (code === "l") {
      flush();
      style = { ...style, bold: true };
    } else if (code === "o") {
      flush();
      style = { ...style, italic: true };
    } else if (code === "n") {
      flush();
      style = { ...style, underlined: true };
    } else if (code === "m") {
      flush();
      style = { ...style, strikethrough: true };
    } else if (code === "r") {
      flush();
      style = { ...base };
    }
  }

  flush();
  return output;
}

function parseMiniMessage(
  value: string,
  base: Omit<MinecraftTextSegment, "text">,
): MinecraftTextSegment[] {
  const output: MinecraftTextSegment[] = [];
  const stack: Array<Omit<MinecraftTextSegment, "text">> = [{ ...base }];
  let buffer = "";
  let index = 0;

  const flush = () => {
    if (!buffer) return;
    output.push({ ...stack[stack.length - 1], text: buffer });
    buffer = "";
  };

  while (index < value.length) {
    const start = value.indexOf("<", index);
    if (start === -1) {
      buffer += value.slice(index);
      break;
    }

    buffer += value.slice(index, start);
    const end = value.indexOf(">", start + 1);
    if (end === -1) {
      buffer += value.slice(start);
      break;
    }

    const rawTag = value.slice(start + 1, end).trim();
    if (rawTag.toLowerCase() === "newline" || rawTag.toLowerCase() === "br") {
      buffer += "\n";
      index = end + 1;
      continue;
    }

    const style = resolveMiniMessageTag(rawTag, stack[stack.length - 1]);
    if (!style) {
      buffer += value.slice(start, end + 1);
    } else {
      flush();
      if (style === "close") {
        if (stack.length > 1) stack.pop();
      } else if (style === "reset") {
        stack.length = 1;
      } else {
        stack.push(style);
      }
    }
    index = end + 1;
  }

  flush();
  return output;
}

function resolveMiniMessageTag(
  rawTag: string,
  current: Omit<MinecraftTextSegment, "text">,
): Omit<MinecraftTextSegment, "text"> | "close" | "reset" | undefined {
  const tag = rawTag.toLowerCase();
  if (!tag) return;
  if (tag.startsWith("/")) return "close";
  if (tag === "reset") return "reset";

  const color =
    miniMessageColors[tag] ?? normalizeHexColor(tag) ?? readMiniMessageColor(tag);
  if (color) return { ...current, color };
  if (tag === "bold" || tag === "b") return { ...current, bold: true };
  if (tag === "italic" || tag === "i") return { ...current, italic: true };
  if (tag === "underlined" || tag === "underline" || tag === "u") {
    return { ...current, underlined: true };
  }
  if (tag === "strikethrough" || tag === "st") {
    return { ...current, strikethrough: true };
  }

  const gradient = tag.match(/^gradient:([^:>]+)(?::([^:>]+))?/);
  if (gradient) {
    const from =
      normalizeHexColor(gradient[1]) ?? miniMessageColors[gradient[1]];
    const to =
      normalizeHexColor(gradient[2] ?? "") ??
      miniMessageColors[gradient[2] ?? ""];
    if (from && to) {
      return {
        ...current,
        color: undefined,
        gradient: `linear-gradient(90deg, ${from}, ${to})`,
      };
    }
    if (from) return { ...current, color: from };
  }
}

function readComponentStyle(record: Record<string, unknown>) {
  const style: Omit<MinecraftTextSegment, "text"> = {};
  const color = readRecordString(record, "color");
  if (color) style.color = normalizeMinecraftColor(color);
  if (readRecordBoolean(record, "bold")) style.bold = true;
  if (readRecordBoolean(record, "italic")) style.italic = true;
  if (readRecordBoolean(record, "underlined")) style.underlined = true;
  if (readRecordBoolean(record, "strikethrough")) style.strikethrough = true;
  return style;
}

function normalizeMinecraftColor(value: string) {
  return normalizeHexColor(value) ?? miniMessageColors[value.toLowerCase()] ?? value;
}

function normalizeHexColor(value: string) {
  const normalized = value.startsWith("#") ? value : undefined;
  return normalized && /^#[0-9a-f]{6}$/i.test(normalized) ? normalized : undefined;
}

function readMiniMessageColor(tag: string) {
  const match = tag.match(/^(?:color|colour):(.+)$/);
  if (!match) return;
  return normalizeHexColor(match[1]) ?? miniMessageColors[match[1]];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readRecordString(record: Record<string, unknown> | undefined, key: string) {
  const value = record?.[key];
  return typeof value === "string" && value ? value : undefined;
}

function readRecordBoolean(record: Record<string, unknown> | undefined, key: string) {
  const value = record?.[key];
  return typeof value === "boolean" ? value : undefined;
}

const legacyColors: Record<string, string> = {
  "0": "#000000",
  "1": "#0000aa",
  "2": "#00aa00",
  "3": "#00aaaa",
  "4": "#aa0000",
  "5": "#aa00aa",
  "6": "#ffaa00",
  "7": "#aaaaaa",
  "8": "#555555",
  "9": "#5555ff",
  a: "#55ff55",
  b: "#55ffff",
  c: "#ff5555",
  d: "#ff55ff",
  e: "#ffff55",
  f: "#ffffff",
};

const miniMessageColors: Record<string, string> = {
  black: "#000000",
  dark_blue: "#0000aa",
  dark_green: "#00aa00",
  dark_aqua: "#00aaaa",
  dark_red: "#aa0000",
  dark_purple: "#aa00aa",
  gold: "#ffaa00",
  gray: "#aaaaaa",
  grey: "#aaaaaa",
  dark_gray: "#555555",
  dark_grey: "#555555",
  blue: "#5555ff",
  green: "#55ff55",
  aqua: "#55ffff",
  red: "#ff5555",
  light_purple: "#ff55ff",
  yellow: "#ffff55",
  white: "#ffffff",
};
