import { Socket } from "net";
import type { MinecraftTextSegment } from "./types";

export interface MinecraftStatus {
  motd?: string;
  motdSegments?: MinecraftTextSegment[];
  iconUrl?: string;
  onlinePlayers?: number;
  maxPlayers?: number;
  version?: string;
}

export async function queryMinecraftStatus(address: string, timeout: number): Promise<MinecraftStatus> {
  const target = parseAddress(address);
  if (!target) throw new Error(`Invalid Minecraft server address: ${address}`);

  const response = await requestStatus(target.host, target.port, timeout);
  return normalizeStatusResponse(response);
}

function parseAddress(address: string) {
  const trimmed = address.trim();
  if (!trimmed) return;

  const bracketed = trimmed.match(/^\[([^\]]+)](?::(\d+))?$/);
  if (bracketed) {
    return {
      host: bracketed[1],
      port: bracketed[2] ? Number(bracketed[2]) : 25565,
    };
  }

  const lastColon = trimmed.lastIndexOf(":");
  if (lastColon > -1 && trimmed.indexOf(":") === lastColon) {
    return {
      host: trimmed.slice(0, lastColon),
      port: Number(trimmed.slice(lastColon + 1)) || 25565,
    };
  }

  return { host: trimmed, port: 25565 };
}

function requestStatus(host: string, port: number, timeout: number) {
  return new Promise<unknown>((resolve, reject) => {
    const socket = new Socket();
    const chunks: Buffer[] = [];
    let settled = false;

    const finish = (error?: Error, value?: unknown) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      if (error) reject(error);
      else resolve(value);
    };

    socket.setTimeout(timeout, () => finish(new Error(`Minecraft status query timed out for ${host}:${port}.`)));
    socket.once("error", (error) => finish(error));
    socket.on("data", (chunk) => {
      chunks.push(chunk);
      const parsed = tryParseStatusPacket(Buffer.concat(chunks));
      if (parsed !== undefined) finish(undefined, parsed);
    });
    socket.connect(port, host, () => {
      socket.write(createHandshake(host, port));
      socket.write(Buffer.from([0x01, 0x00]));
    });
  });
}

function createHandshake(host: string, port: number) {
  const payload = Buffer.concat([
    writeVarInt(0),
    writeVarInt(760),
    writeString(host),
    writeUnsignedShort(port),
    writeVarInt(1),
  ]);
  return Buffer.concat([writeVarInt(payload.length), payload]);
}

function tryParseStatusPacket(buffer: Buffer) {
  let offset = 0;
  const packetLength = readVarInt(buffer, offset);
  if (!packetLength) return;
  offset = packetLength.offset;
  if (buffer.length < offset + packetLength.value) return;

  const packetId = readVarInt(buffer, offset);
  if (!packetId) return;
  offset = packetId.offset;
  if (packetId.value !== 0) throw new Error(`Unexpected Minecraft status packet id: ${packetId.value}`);

  const json = readString(buffer, offset);
  if (!json) return;
  return JSON.parse(json.value);
}

function normalizeStatusResponse(value: unknown): MinecraftStatus {
  if (!isRecord(value)) return {};

  const players = toRecord(value.players);
  const version = toRecord(value.version);
  const description = normalizeDescription(value.description);
  return {
    motd: description?.text,
    motdSegments: description?.segments,
    iconUrl: readRecordString(value, "favicon"),
    onlinePlayers: readRecordNumber(players, "online"),
    maxPlayers: readRecordNumber(players, "max"),
    version: readRecordString(version, "name"),
  };
}

function normalizeDescription(value: unknown): { text: string; segments: MinecraftTextSegment[] } | undefined {
  const segments = typeof value === "string"
    ? parseFormattedText(value)
    : parseChatComponent(value);

  const text = segments.map((segment) => segment.text).join("").trim();
  return text ? { text, segments } : undefined;
}

function parseChatComponent(value: unknown): MinecraftTextSegment[] {
  const output: MinecraftTextSegment[] = [];
  collectComponentText(value, {}, output);
  return output.flatMap((segment) => parseFormattedText(segment.text, segment));
}

function collectComponentText(
  value: unknown,
  inherited: Omit<MinecraftTextSegment, "text">,
  output: MinecraftTextSegment[],
) {
  if (typeof value === "string") {
    output.push(...parseFormattedText(value, inherited));
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
  if (text) output.push(...parseFormattedText(text, current));
  collectComponentText(value.extra, current, output);
}

function parseFormattedText(value: string, base: Omit<MinecraftTextSegment, "text"> = {}): MinecraftTextSegment[] {
  const segments = parseLegacyFormatting(value, base);
  return segments.flatMap((segment) => parseMiniMessage(segment.text, segment));
}

function parseLegacyFormatting(value: string, base: Omit<MinecraftTextSegment, "text">): MinecraftTextSegment[] {
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

  const color = miniMessageColors[tag] ?? normalizeHexColor(tag) ?? readMiniMessageColor(tag);
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
    const from = normalizeHexColor(gradient[1]) ?? miniMessageColors[gradient[1]];
    const to = normalizeHexColor(gradient[2] ?? "") ?? miniMessageColors[gradient[2] ?? ""];
    if (from && to) return { ...current, color: undefined, gradient: `linear-gradient(90deg, ${from}, ${to})` };
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

function writeString(value: string) {
  const data = Buffer.from(value, "utf8");
  return Buffer.concat([writeVarInt(data.length), data]);
}

function writeUnsignedShort(value: number) {
  const data = Buffer.allocUnsafe(2);
  data.writeUInt16BE(value & 0xffff, 0);
  return data;
}

function writeVarInt(value: number) {
  const bytes: number[] = [];
  let current = value >>> 0;
  do {
    let byte = current & 0x7f;
    current >>>= 7;
    if (current !== 0) byte |= 0x80;
    bytes.push(byte);
  } while (current !== 0);
  return Buffer.from(bytes);
}

function readString(buffer: Buffer, offset: number) {
  const length = readVarInt(buffer, offset);
  if (!length) return;
  const end = length.offset + length.value;
  if (buffer.length < end) return;
  return {
    value: buffer.toString("utf8", length.offset, end),
    offset: end,
  };
}

function readVarInt(buffer: Buffer, offset: number) {
  let value = 0;
  let position = 0;
  let currentOffset = offset;

  while (currentOffset < buffer.length) {
    const current = buffer[currentOffset++];
    value |= (current & 0x7f) << position;
    if ((current & 0x80) === 0) return { value, offset: currentOffset };

    position += 7;
    if (position >= 35) throw new Error("Minecraft status packet VarInt is too large.");
  }
}

function toRecord(value: unknown) {
  return isRecord(value) ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readRecordString(record: Record<string, unknown> | undefined, key: string) {
  const value = record?.[key];
  return typeof value === "string" && value ? value : undefined;
}

function readRecordNumber(record: Record<string, unknown> | undefined, key: string) {
  const value = record?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
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
