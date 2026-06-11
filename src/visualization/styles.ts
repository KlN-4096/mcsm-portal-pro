import { existsSync, readFileSync, readdirSync } from "fs";
import { basename, extname, join } from "path";

type FontFormat = "truetype" | "opentype";
type AssetKind = "fonts" | "textures" | "visualization";

interface FontSource {
  family: string;
  file: string;
  format: FontFormat;
  unicodeRange?: string;
}

const fonts: FontSource[] = [
  {
    family: "Minecraft",
    file: "minecraft.ttf",
    format: "truetype",
    unicodeRange: "U+0000-00FF",
  },
  {
    family: "Unifont",
    file: "UNIFONT-14.0.01.TTF",
    format: "truetype",
    unicodeRange: "U+0100-10FFFF",
  },
  {
    family: "Minecraft Ten",
    file: "minecraft-ten.ttf",
    format: "truetype",
  },
  {
    family: "Monocraft",
    file: "Monocraft.otf",
    format: "opentype",
  },
  {
    family: "Minecraft Five",
    file: "minecraft-five-bold.otf",
    format: "opentype",
  },
];

let cachedCss: string | undefined;
const cachedBackgroundTextures = new Map<string, string | undefined>();

export function createVisualizationCss() {
  cachedCss ??= `${createFontFaceCss()}\n${readVisualizationLayoutCss()}`;
  return cachedCss;
}

function createFontFaceCss() {
  return fonts
    .map((font) => {
      const path = resolveFontPath(font.file);
      const mime = font.format === "opentype" ? "font/otf" : "font/ttf";
      const data = readFileSync(path).toString("base64");
      const unicodeRange = font.unicodeRange
        ? `\n  unicode-range: ${font.unicodeRange};`
        : "";
      return `@font-face {
  font-family: "${font.family}";
  src: url("data:${mime};base64,${data}") format("${font.format}");
  font-weight: 400;
  font-style: normal;
  font-display: swap;${unicodeRange}
}`;
    })
    .join("\n");
}

function resolveFontPath(file: string) {
  const candidates = createAssetPathCandidates("fonts", file);
  const path = candidates.find((item) => existsSync(item));
  if (!path) {
    throw new Error(
      `Missing visualization font ${file}. Put it under the plugin assets/fonts directory.`,
    );
  }
  return path;
}

export function listBackgroundTextureNames() {
  const names = new Set<string>();

  for (const directory of createAssetDirectoryCandidates("textures")) {
    if (!existsSync(directory)) continue;
    for (const file of readdirSync(directory)) {
      if (isSupportedImage(file)) names.add(file);
    }
  }

  return [...names].sort((a, b) => a.localeCompare(b));
}

export function resolveBackgroundTextureDataUri(textureName?: string) {
  if (!textureName) return undefined;
  if (textureName !== basename(textureName) || !isSupportedImage(textureName))
    return undefined;

  const cached = cachedBackgroundTextures.get(textureName);
  if (cached !== undefined) return cached;

  const path = createAssetPathCandidates("textures", textureName).find((item) =>
    existsSync(item),
  );
  if (!path) {
    cachedBackgroundTextures.set(textureName, undefined);
    return undefined;
  }

  const extension = extname(textureName).toLowerCase();
  const mime =
    extension === ".jpg" || extension === ".jpeg"
      ? "image/jpeg"
      : extension === ".webp"
        ? "image/webp"
        : extension === ".gif"
          ? "image/gif"
          : "image/png";
  const dataUri = `data:${mime};base64,${readFileSync(path).toString("base64")}`;
  cachedBackgroundTextures.set(textureName, dataUri);
  return dataUri;
}

function createAssetDirectoryCandidates(kind: AssetKind) {
  return [
    join(__dirname, "../assets", kind),
    join(__dirname, "../../assets", kind),
    join(process.cwd(), "external/mcsm-portal/assets", kind),
    join(process.cwd(), "assets", kind),
  ];
}

function createAssetPathCandidates(kind: AssetKind, file: string) {
  return createAssetDirectoryCandidates(kind).map((directory) =>
    join(directory, file),
  );
}

function isSupportedImage(file: string) {
  return [".png", ".jpg", ".jpeg", ".webp", ".gif"].includes(
    extname(file).toLowerCase(),
  );
}

function readVisualizationLayoutCss() {
  const path = createAssetPathCandidates("visualization", "layout.css").find((item) =>
    existsSync(item),
  );
  if (!path) {
    throw new Error(
      "Missing visualization layout CSS. Put layout.css under assets/visualization.",
    );
  }
  return readFileSync(path, "utf8");
}
