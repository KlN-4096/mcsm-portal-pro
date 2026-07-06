import { createSocket } from "dgram";
import { parseMinecraftAddress } from "./minecraft-status";

export interface MinecraftQueryFullStat {
  onlinePlayers?: number;
  maxPlayers?: number;
  playerNames?: string[];
}

const QUERY_MAGIC = Buffer.from([0xfe, 0xfd]);
const QUERY_TYPE_STAT = 0x00;
const QUERY_TYPE_HANDSHAKE = 0x09;

export async function queryMinecraftFullStat(
  address: string,
  timeout: number,
): Promise<MinecraftQueryFullStat> {
  const target = parseMinecraftAddress(address);
  if (!target) throw new Error(`Invalid Minecraft server address: ${address}`);

  return new Promise((resolve, reject) => {
    const socket = createSocket(target.host.includes(":") ? "udp6" : "udp4");
    const sessionId = Math.floor(Math.random() * 0x7fffffff);
    const timer = setTimeout(
      () => finish(new Error(`Minecraft query timed out for ${target.host}:${target.port}.`)),
      timeout,
    );
    let finished = false;

    const finish = (error?: Error, value?: MinecraftQueryFullStat) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      socket.close();
      if (error) reject(error);
      else resolve(value ?? {});
    };
    const send = (packet: Buffer) => {
      socket.send(packet, target.port, target.host, (error) => {
        if (error) finish(error);
      });
    };

    socket.once("error", finish);
    socket.on("message", (message) => {
      try {
        if (message.length < 5 || message.readInt32BE(1) !== sessionId) return;
        if (message[0] === QUERY_TYPE_HANDSHAKE) {
          send(createFullStatPacket(sessionId, readChallengeToken(message)));
        } else if (message[0] === QUERY_TYPE_STAT) {
          finish(undefined, parseMinecraftQueryFullStat(message));
        }
      } catch (error) {
        finish(error instanceof Error ? error : new Error(String(error)));
      }
    });
    send(createHandshakePacket(sessionId));
  });
}

export function parseMinecraftQueryFullStat(packet: Buffer): MinecraftQueryFullStat {
  if (packet.length < 5 || packet[0] !== QUERY_TYPE_STAT) {
    throw new Error("Invalid Minecraft query full stat packet.");
  }

  const tokens = readNullTerminatedTokens(packet.subarray(5));
  const markerIndex = tokens.findIndex((token) => token.endsWith("player_"));
  const fields = readKeyValueTokens(markerIndex < 0 ? tokens : tokens.slice(0, markerIndex));
  const playerNames = markerIndex < 0 ? undefined : tokens.slice(markerIndex + 1).filter(Boolean);

  return {
    onlinePlayers: readNumber(fields.numplayers),
    maxPlayers: readNumber(fields.maxplayers),
    playerNames,
  };
}

function createHandshakePacket(sessionId: number) {
  const packet = Buffer.allocUnsafe(7);
  QUERY_MAGIC.copy(packet, 0);
  packet[2] = QUERY_TYPE_HANDSHAKE;
  packet.writeInt32BE(sessionId, 3);
  return packet;
}

function createFullStatPacket(sessionId: number, challengeToken: number) {
  const packet = Buffer.alloc(15);
  QUERY_MAGIC.copy(packet, 0);
  packet[2] = QUERY_TYPE_STAT;
  packet.writeInt32BE(sessionId, 3);
  packet.writeInt32BE(challengeToken, 7);
  return packet;
}

function readChallengeToken(message: Buffer) {
  const value = message.subarray(5).toString("ascii").replace(/\0.*$/, "").trim();
  const token = Number(value);
  if (!Number.isFinite(token)) throw new Error("Minecraft query returned an invalid challenge token.");
  return token;
}

function readNullTerminatedTokens(buffer: Buffer) {
  const tokens: string[] = [];
  let start = 0;
  for (let index = 0; index <= buffer.length; index++) {
    if (index < buffer.length && buffer[index] !== 0) continue;
    tokens.push(buffer.toString("latin1", start, index));
    start = index + 1;
  }
  return tokens;
}

function readKeyValueTokens(tokens: string[]) {
  const fields: Record<string, string> = {};
  let index = tokens[0] === "splitnum" ? 2 : 0;
  while (index < tokens.length) {
    const key = tokens[index++];
    if (!key) continue;
    fields[key] = tokens[index++] ?? "";
  }
  return fields;
}

function readNumber(value?: string) {
  if (!value) return;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}
