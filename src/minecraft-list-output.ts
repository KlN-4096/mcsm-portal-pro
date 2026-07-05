export interface MinecraftListOutput {
  onlinePlayers?: number;
  maxPlayers?: number;
  playerNames?: string[];
}

const COLOR_CODE_PATTERN = /(?:\u00a7|&)[0-9a-fk-or]/gi;
const LOG_PREFIX_PATTERN = /^\[[^\]]+\]\s*(?:\[[^\]]+\]\s*)*/;
const LIST_LINE_PATTERN = /players?\s+online|online\s+players?|玩家在线|在线玩家|在线.*玩家/i;
const ENGLISH_LIST_COUNT_PATTERN =
  /there\s+are\s+(\d+)\s+(?:of|out\s+of)\s+(?:a\s+)?(?:max(?:imum)?\s+of\s+)?(\d+)\s+players?\s+online/i;
const SLASH_COUNT_PATTERN = /(\d+)\s*\/\s*(\d+)\s*(?:players?|玩家)?\s*(?:online|在线)?/i;

export function parseMinecraftListOutput(output: string): MinecraftListOutput | undefined {
  const lines = output
    .split(/\r?\n/)
    .map(cleanListLine)
    .filter(Boolean);
  const line = lines.find((value) => LIST_LINE_PATTERN.test(value)) ?? lines.at(-1);
  if (!line) return;

  const counts = parsePlayerCounts(line);
  const playerNames = parsePlayerNames(line, counts.onlinePlayers);
  if (counts.onlinePlayers === undefined && counts.maxPlayers === undefined && !playerNames?.length) {
    return;
  }

  return {
    ...counts,
    playerNames,
  };
}

function cleanListLine(line: string) {
  return line
    .replace(COLOR_CODE_PATTERN, "")
    .replace(LOG_PREFIX_PATTERN, "")
    .trim();
}

function parsePlayerCounts(line: string) {
  const english = line.match(ENGLISH_LIST_COUNT_PATTERN);
  if (english) {
    return {
      onlinePlayers: Number(english[1]),
      maxPlayers: Number(english[2]),
    };
  }

  const slash = line.match(SLASH_COUNT_PATTERN);
  if (slash) {
    return {
      onlinePlayers: Number(slash[1]),
      maxPlayers: Number(slash[2]),
    };
  }

  return {};
}

function parsePlayerNames(line: string, onlinePlayers?: number) {
  if (onlinePlayers === 0) return [];

  const separatorIndex = Math.max(line.lastIndexOf(":"), line.lastIndexOf("："));
  if (separatorIndex < 0) return;

  const namesText = line.slice(separatorIndex + 1).trim();
  if (!namesText || /^(?:none|no players?)$/i.test(namesText)) return [];

  const names = namesText
    .split(/[,，、]/)
    .map((name) => name.trim())
    .filter(Boolean);
  return names.length ? [...new Set(names)] : undefined;
}
