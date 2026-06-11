import { Socket } from "net";

export interface MinecraftStatus {
  motd?: string;
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
  return {
    motd: normalizeDescription(value.description),
    iconUrl: readRecordString(value, "favicon"),
    onlinePlayers: readRecordNumber(players, "online"),
    maxPlayers: readRecordNumber(players, "max"),
    version: readRecordString(version, "name"),
  };
}

function normalizeDescription(value: unknown): string | undefined {
  if (typeof value === "string") return stripMinecraftFormatting(value);
  if (!isRecord(value)) return;

  const parts: string[] = [];
  collectText(value, parts);
  const text = parts.join("");
  return text ? stripMinecraftFormatting(text) : undefined;
}

function collectText(value: unknown, output: string[]) {
  if (typeof value === "string") {
    output.push(value);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => collectText(item, output));
    return;
  }
  if (!isRecord(value)) return;
  const text = readRecordString(value, "text");
  if (text) output.push(text);
  collectText(value.extra, output);
}

function stripMinecraftFormatting(value: string) {
  return value.replace(/§[0-9A-FK-OR]/gi, "").trim();
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
