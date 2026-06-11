import type { MinecraftInstance } from "./types";

export function resolveGameType(server: MinecraftInstance) {
  const sources = [server.type, ...server.modList].filter(
    (value): value is string => Boolean(value),
  );

  for (const source of sources) {
    const normalized = source.toLowerCase();
    if (normalized.includes("neoforge")) return "NeoForge";
    if (normalized.includes("fabric")) return "Fabric";
    if (normalized.includes("quilt")) return "Quilt";
    if (normalized.includes("forge")) return "Forge";
    if (normalized.includes("paper")) return "Paper";
    if (normalized.includes("spigot")) return "Spigot";
    if (normalized.includes("bukkit")) return "Bukkit";
    if (normalized.includes("purpur")) return "Purpur";
    if (normalized.includes("folia")) return "Folia";
    if (normalized.includes("vanilla")) return "Vanilla";
    if (normalized.includes("bedrock")) return "Bedrock";
  }

  const type = server.type
    ?.split(/[/:|\\]+/)
    .filter(Boolean)
    .at(-1);
  if (!type || type.toLowerCase() === "minecraft") return;
  return type.slice(0, 1).toUpperCase() + type.slice(1);
}

export function formatGameVersion(server: MinecraftInstance) {
  return [resolveGameType(server), server.version].filter(Boolean).join(" ");
}
