const path = require('path');

module.exports = {
  // Core Minecraft server connection
  serverHost: process.env.MC_SERVER_HOST || 'play.milan.deviance.rehab',
  serverPort: Number(process.env.MC_SERVER_PORT || 25565),
  queryPort: Number(process.env.MC_QUERY_PORT || 25565),

  // Modpack/TOML path (Pterodactyl host path)
  modpackConfigPath: process.env.MODPACK_CONFIG_PATH || '/var/lib/pterodactyl/volumes/81573612-9e55-41a8-9a3a-93f3c5088168/config/bcc-common.toml',

  // BlueMap live URL and snapshot settings
  bluemapUrl: process.env.BLUEMAP_URL || 'https://mcstats.deviance.rehab/map/#world:238:63:4155:47:0.77:1.34:0:0:perspective',
  snapshotEveryMs: Number(process.env.BLUEMAP_SNAPSHOT_EVERY_MS || 180000),
  snapshotDir: path.join(__dirname, '..', 'public', 'cache'),
  snapshotFileName: process.env.BLUEMAP_SNAPSHOT_FILE || 'bluemap-1920x1080.jpg',

  // Optional Dynmap URL if you want to expose it in API
  dynmapUrl: process.env.DYNMAP_URL || null,

  // Chromium path for puppeteer-core (optional)
  chromiumPath: process.env.CHROMIUM_PATH || null,

  // Values exposed to client
  client: {
    displayHostname: process.env.DISPLAY_HOSTNAME || 'play.milan.deviance.rehab',
    bluemapUrl: process.env.BLUEMAP_URL || 'https://mcstats.deviance.rehab/map/#world:238:63:4155:47:0.77:1.34:0:0:perspective',
    cachedSnapshotUrl: process.env.BLUEMAP_SNAPSHOT_PUBLIC || '/cache/bluemap-1920x1080.jpg',
    pageTitle: process.env.PAGE_TITLE || 'Minecraft Server Status - play.milan.deviance.rehab'
  }
};


