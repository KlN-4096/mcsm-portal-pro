import type { Context, Session } from "koishi";
import type { Config } from "./config";

declare module "koishi" {
  interface Events {
    notice(session: Session): void;
  }

  interface Session {
    subtype?: string;
    targetId?: string;
    onebot?: {
      _request(action: string, params: Record<string, unknown>): Promise<unknown>;
    };
  }
}

type ReactionBot = {
  createReaction?: (
    channelId: string,
    messageId: string,
    emojiId: string,
  ) => Promise<void>;
};

export function registerQQInteractions(ctx: Context, config: Config) {
  registerReactionMirror(ctx, config);
  registerAvatarDoubleTap(ctx, config);
}

function registerReactionMirror(ctx: Context, config: Config) {
  const { reactionMirror } = config.qqInteractions;
  if (!reactionMirror.enabled) return;

  const logger = ctx.logger("mcsm-portal-pro");
  const emojis = new Set(reactionMirror.emojis);
  const dedupe = new Map<string, number>();
  let warnedMissingCapability = false;

  ctx.on("reaction-added", async (session) => {
    const emojiId = session.content;
    if (!emojiId || !matchesReactionEmoji(emojis, emojiId)) return;
    if (reactionMirror.ignoreSelf && session.userId === session.selfId) return;
    if (!session.channelId || !session.messageId) {
      logger.warn(
        "cannot mirror QQ reaction %s: missing channelId or messageId",
        emojiId,
      );
      return;
    }

    const bot = session.bot as typeof session.bot & ReactionBot;
    if (typeof bot.createReaction !== "function") {
      if (!warnedMissingCapability) {
        warnedMissingCapability = true;
        logger.warn(
          "cannot mirror QQ reactions: current adapter does not expose createReaction()",
        );
      }
      return;
    }

    const now = Date.now();
    const key = `${session.channelId}:${session.messageId}:${emojiId}`;
    if (isCoolingDown(dedupe, key, now, reactionMirror.dedupeTtl)) return;
    markCache(dedupe, key, now, reactionMirror.dedupeTtl);

    try {
      await bot.createReaction(
        session.channelId,
        session.messageId,
        emojiId,
      );
    } catch (error) {
      dedupe.delete(key);
      logger.warn(
        "failed to mirror QQ reaction %s on message %s: %s",
        emojiId,
        session.messageId,
        formatErrorMessage(error),
      );
    }
  });
}

function matchesReactionEmoji(emojis: Set<string>, emojiId: string) {
  if (emojis.has(emojiId)) return true;
  const [, bareId] = emojiId.split(":");
  return bareId !== undefined && emojis.has(bareId);
}

function registerAvatarDoubleTap(ctx: Context, config: Config) {
  const { avatarDoubleTap } = config.qqInteractions;
  if (!avatarDoubleTap.enabled) return;

  const logger = ctx.logger("mcsm-portal-pro");
  const cooldown = new Map<string, number>();
  let warnedMissingCapability = false;

  ctx.on("notice", async (session) => {
    // OneBot reports QQ avatar double-tap / 拍一拍 as a notify poke event.
    if (session.subtype !== "poke") return;
    if (session.targetId !== session.selfId) return;
    if (!session.userId || session.userId === session.selfId) return;

    if (typeof session.onebot?._request !== "function") {
      if (!warnedMissingCapability) {
        warnedMissingCapability = true;
        logger.warn(
          "cannot reply to QQ avatar double-tap: current adapter does not expose onebot._request()",
        );
      }
      return;
    }

    const now = Date.now();
    const key = `${session.guildId ?? "private"}:${session.userId}`;
    if (isCoolingDown(cooldown, key, now, avatarDoubleTap.cooldown)) return;
    markCache(cooldown, key, now, avatarDoubleTap.cooldown);

    const params: Record<string, unknown> = { user_id: session.userId };
    if (!session.isDirect && session.guildId) params.group_id = session.guildId;

    try {
      await session.onebot._request("send_poke", params);
    } catch (error) {
      cooldown.delete(key);
      logger.warn(
        "failed to reply to QQ avatar double-tap from %s: %s",
        session.userId,
        formatErrorMessage(error),
      );
    }
  });
}

function isCoolingDown(
  cache: Map<string, number>,
  key: string,
  now: number,
  ttl: number,
) {
  if (ttl <= 0) return false;
  const last = cache.get(key);
  return last !== undefined && now - last < ttl;
}

function markCache(
  cache: Map<string, number>,
  key: string,
  now: number,
  ttl: number,
) {
  if (ttl <= 0) return;
  cache.set(key, now);
  pruneExpired(cache, now, ttl);
}

function pruneExpired(cache: Map<string, number>, now: number, ttl: number) {
  if (ttl <= 0) return;
  for (const [key, timestamp] of cache) {
    if (now - timestamp >= ttl) cache.delete(key);
  }
}

function formatErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return String(error);
}
