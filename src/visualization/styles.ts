import { existsSync, readFileSync, readdirSync } from "fs";
import { basename, extname, join } from "path";

type FontFormat = "truetype" | "opentype";

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
  cachedCss ??= `${createFontFaceCss()}\n${visualizationLayoutCss}`;
  return cachedCss;
}

function createFontFaceCss() {
  return fonts.map((font) => {
    const path = resolveFontPath(font.file);
    const mime = font.format === "opentype" ? "font/otf" : "font/ttf";
    const data = readFileSync(path).toString("base64");
    const unicodeRange = font.unicodeRange ? `\n  unicode-range: ${font.unicodeRange};` : "";
    return `@font-face {
  font-family: "${font.family}";
  src: url("data:${mime};base64,${data}") format("${font.format}");
  font-weight: 400;
  font-style: normal;
  font-display: swap;${unicodeRange}
}`;
  }).join("\n");
}

function resolveFontPath(file: string) {
  const candidates = createAssetPathCandidates("fonts", file);
  const path = candidates.find((item) => existsSync(item));
  if (!path) {
    throw new Error(`Missing visualization font ${file}. Put it under the plugin assets/fonts directory.`);
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
  if (textureName !== basename(textureName) || !isSupportedImage(textureName)) return undefined;

  const cached = cachedBackgroundTextures.get(textureName);
  if (cached !== undefined) return cached;

  const path = createAssetPathCandidates("textures", textureName).find((item) => existsSync(item));
  if (!path) {
    cachedBackgroundTextures.set(textureName, undefined);
    return undefined;
  }

  const extension = extname(textureName).toLowerCase();
  const mime = extension === ".jpg" || extension === ".jpeg"
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

function createAssetDirectoryCandidates(kind: "fonts" | "textures") {
  return [
    join(__dirname, "../assets", kind),
    join(__dirname, "../../assets", kind),
    join(process.cwd(), "external/mcsm-portal/assets", kind),
    join(process.cwd(), "assets", kind),
  ];
}

function createAssetPathCandidates(kind: "fonts" | "textures", file: string) {
  return createAssetDirectoryCandidates(kind).map((directory) => join(directory, file));
}

function isSupportedImage(file: string) {
  return [".png", ".jpg", ".jpeg", ".webp", ".gif"].includes(extname(file).toLowerCase());
}

export const visualizationLayoutCss = `
.mcsm-image {
  --mcsm-background-tile: none;
  --mcsm-background-tile-size: 64px 64px;
  box-sizing: border-box;
  max-width: 100%;
  min-height: 480px;
  padding: 24px 32px 20px;
  color: #fff;
  background-color: #000;
  background-image:
    linear-gradient(rgba(0,0,0,.58), rgba(0,0,0,.58)),
    var(--mcsm-background-tile);
  background-size: 100% 100%, var(--mcsm-background-tile-size);
  background-repeat: no-repeat, repeat;
  background-position: center center, center center;
  font-family: "Minecraft", "Unifont", sans-serif;
  image-rendering: pixelated;
  text-rendering: geometricPrecision;
}
.mcsm-image,
.mcsm-image * {
  box-sizing: border-box;
  color: #fff;
}
.mcsm-image-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20px;
  margin-bottom: 24px;
}
.mcsm-image-header p,
.mcsm-minecraft-screen__header span,
.mcsm-minecraft-caption,
.mcsm-server-side small {
  font-family: "Minecraft Five", "Minecraft", "Unifont", sans-serif;
  font-size: 14px;
}
.mcsm-image-header p {
  margin: 0 0 8px;
}
.mcsm-image-header h3,
.mcsm-minecraft-screen__header h3 {
  margin: 0;
  font-family: "Minecraft Ten", "Minecraft", "Unifont", sans-serif;
  font-size: 30px;
  font-weight: 400;
}
.mcsm-image-header span,
.mcsm-image-header time {
  opacity: .76;
}
.mcsm-node-grid {
  display: grid;
  gap: 12px;
}
.mcsm-node-card {
  border: 2px solid rgba(255,255,255,.22);
  padding: 14px;
  background: rgba(0,0,0,.42);
}
.mcsm-node-card header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}
.mcsm-node-card strong {
  display: block;
  font-size: 18px;
  font-weight: 400;
}
.mcsm-node-card header span {
  display: block;
  margin-top: 4px;
  opacity: .76;
}
.mcsm-node-card em {
  border: 2px solid rgba(255,255,255,.28);
  padding: 4px 10px;
  background: rgba(0,0,0,.35);
  font-style: normal;
}
.mcsm-meter-list {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
  margin: 16px 0;
}
.mcsm-meter,
.mcsm-stat {
  display: grid;
  gap: 4px;
  border: 2px solid rgba(255,255,255,.18);
  padding: 8px;
  background: rgba(0,0,0,.28);
}
.mcsm-meter span,
.mcsm-stat small {
  opacity: .74;
}
.mcsm-node-card footer {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}
.mcsm-node-card p {
  margin: 12px 0 0;
  line-height: 1.45;
  opacity: .82;
}
.mcsm-minecraft-screen {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.mcsm-minecraft-screen__header {
  display: grid;
  gap: 4px;
  justify-items: center;
  text-align: center;
}
.mcsm-minecraft-screen__header small {
  font-family: "Minecraft", "Unifont", sans-serif;
  font-size: 16px;
  opacity: .82;
}
.mcsm-minecraft-server-list {
  display: grid;
  gap: 4px;
  border-top: 2px solid rgba(255,255,255,.20);
  border-bottom: 2px solid rgba(0,0,0,.55);
  padding: 8px 0;
}
.mcsm-server-row {
  display: grid;
  grid-template-columns: 64px minmax(0, 1fr) 132px;
  gap: 12px;
  min-height: 74px;
  border: 2px solid transparent;
  padding: 6px;
  background: rgba(0,0,0,.18);
}
.mcsm-server-row:hover,
.mcsm-server-row.is-running {
  border-color: rgba(255,255,255,.35);
  background: rgba(255,255,255,.12);
}
.mcsm-server-icon {
  display: grid;
  place-items: center;
  width: 60px;
  height: 60px;
  border: 2px solid rgba(0,0,0,.55);
  background:
    linear-gradient(135deg, rgba(255,255,255,.20), transparent 48%),
    repeating-linear-gradient(45deg, rgba(255,255,255,.08) 0 6px, rgba(0,0,0,.10) 6px 12px),
    #535353;
}
.mcsm-server-icon span {
  font-family: "Minecraft Ten", "Minecraft", "Unifont", sans-serif;
  font-size: 24px;
}
.mcsm-server-main {
  min-width: 0;
}
.mcsm-server-title-line {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  min-width: 0;
}
.mcsm-server-title-line strong {
  overflow: hidden;
  font-size: 20px;
  font-weight: 400;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.mcsm-server-title-line span {
  flex: 0 0 auto;
  font-family: "Monocraft", "Minecraft", "Unifont", monospace;
  font-size: 16px;
}
.mcsm-server-motd,
.mcsm-server-address {
  overflow: hidden;
  margin: 5px 0 0;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.mcsm-server-motd {
  opacity: .82;
}
.mcsm-server-address {
  font-family: "Monocraft", "Minecraft", "Unifont", monospace;
  font-size: 14px;
  opacity: .72;
}
.mcsm-server-side {
  display: grid;
  justify-items: end;
  align-content: start;
  gap: 4px;
}
.mcsm-ping-bars {
  display: inline-grid;
  grid-template-columns: repeat(5, 5px);
  align-items: end;
  gap: 2px;
  height: 20px;
}
.mcsm-ping-bars i {
  display: block;
  width: 5px;
  background: #fff;
}
.mcsm-ping-bars i:nth-child(1) { height: 4px; }
.mcsm-ping-bars i:nth-child(2) { height: 8px; }
.mcsm-ping-bars i:nth-child(3) { height: 12px; }
.mcsm-ping-bars i:nth-child(4) { height: 16px; }
.mcsm-ping-bars i:nth-child(5) { height: 20px; }
.mcsm-server-row.is-stopped .mcsm-ping-bars i,
.mcsm-server-row.is-unknown .mcsm-ping-bars i {
  opacity: .28;
}
.mcsm-minecraft-buttons {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}
.mcsm-minecraft-buttons button {
  border: 2px solid #000;
  border-top-color: rgba(255,255,255,.70);
  border-left-color: rgba(255,255,255,.70);
  padding: 9px 10px;
  background: #6b6b6b;
  box-shadow: inset -2px -3px 0 rgba(0,0,0,.55), inset 2px 2px 0 rgba(255,255,255,.22);
  font: inherit;
}
.mcsm-minecraft-caption {
  margin: 0;
  text-align: right;
  opacity: .68;
}
`;
