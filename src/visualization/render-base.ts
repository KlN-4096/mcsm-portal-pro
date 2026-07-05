import {
  DEFAULT_COPYRIGHT_TEXT,
  resolveNodeImageTitle,
  resolvePortalTitle,
  resolveServerImageTitle,
  type Config,
} from "../config";
import { formatKoishiDate } from "../time";
import { PLUGIN_VERSION } from "../version";
import { resolveBackgroundTextureChoice } from "./styles";

export function createVisualizationDataBase(config: Config) {
  const backgroundTexture = resolveBackgroundTextureChoice(
    config.image.backgroundTexture,
  );
  return {
    portalName: resolvePortalTitle(config),
    copyright: DEFAULT_COPYRIGHT_TEXT,
    pluginVersion: PLUGIN_VERSION,
    nodeTitle: resolveNodeImageTitle(config),
    serverTitle: resolveServerImageTitle(config),
    showGeneratedAt: config.image.showGeneratedAt,
    generatedAt: config.image.showGeneratedAt
      ? formatKoishiDate(new Date())
      : undefined,
    backgroundTexture: backgroundTexture.name || undefined,
    backgroundTile: backgroundTexture.dataUri,
  };
}
