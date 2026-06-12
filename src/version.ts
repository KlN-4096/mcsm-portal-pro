const packageMetadata = require("../package.json") as { version: string };

export const PLUGIN_VERSION = packageMetadata.version;
