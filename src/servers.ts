import type { MinecraftInstance, ServerAddress } from "./types";

type ResolveAddressResult =
  | { type: "missing-query" }
  | { type: "not-found" }
  | { type: "ambiguous"; matches: ServerAddress[] }
  | { type: "matched"; server: ServerAddress };

export function resolveServerAddress(servers: MinecraftInstance[], query?: string): ResolveAddressResult {
  const normalizedQuery = normalizeLookupKey(query);
  if (!normalizedQuery) return { type: "missing-query" };

  const matchedServers = servers.filter((server) =>
    getLookupKeys(server).includes(normalizedQuery)
  );

  if (!matchedServers.length) return { type: "not-found" };
  if (matchedServers.length > 1) {
    return { type: "ambiguous", matches: matchedServers.map(toServerAddress) };
  }
  return { type: "matched", server: toServerAddress(matchedServers[0]) };
}

function getLookupKeys(server: MinecraftInstance) {
  return [server.id, server.name, server.address, ...server.tags]
    .map(normalizeLookupKey)
    .filter((value): value is string => Boolean(value));
}

function normalizeLookupKey(value?: string) {
  return value?.trim().toLowerCase();
}

function toServerAddress(server: MinecraftInstance): ServerAddress {
  return {
    id: server.id,
    name: server.name,
    address: server.address,
    nodeName: server.nodeName,
  };
}
