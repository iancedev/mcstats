const path = require('path');

const atm10ServerHost = process.env.MC_SERVER_HOST || 'play.milan.deviance.rehab';
const atm10ServerPort = Number(process.env.MC_SERVER_PORT || 25565);
const atm10QueryPort = Number(process.env.MC_QUERY_PORT || 25565);
const atm10ModpackConfigPath = process.env.MODPACK_CONFIG_PATH || '/var/lib/pterodactyl/volumes/81573612-9e55-41a8-9a3a-93f3c5088168/config/bcc-common.toml';
const atm10BluemapUrl = process.env.BLUEMAP_URL || 'https://mcstats.deviance.rehab/map/#world:238:63:4155:47:0.77:1.34:0:0:perspective';
const atm10DynmapUrl = process.env.DYNMAP_URL || null;
const atm10SnapshotPublic = process.env.BLUEMAP_SNAPSHOT_PUBLIC || '/cache/bluemap-1920x1080.jpg';
const atm10Client = {
  displayHostname: process.env.DISPLAY_HOSTNAME || atm10ServerHost,
  bluemapUrl: atm10BluemapUrl,
  cachedSnapshotUrl: atm10SnapshotPublic,
  pageTitle: process.env.PAGE_TITLE || `Minecraft Server Status - ${process.env.DISPLAY_HOSTNAME || atm10ServerHost}`
};

const vanillaSnapshotFileName = process.env.VANILLA_BLUEMAP_SNAPSHOT_FILE || 'bluemap-vanilla-1920x1080.jpg';
const vanillaSnapshotPublic = process.env.VANILLA_BLUEMAP_SNAPSHOT_PUBLIC || `/cache/${vanillaSnapshotFileName}`;

module.exports = {
  // Core Minecraft server connection
  serverHost: atm10ServerHost,
  serverPort: atm10ServerPort,
  queryPort: atm10QueryPort,

  // Modpack/TOML path (Pterodactyl host path)
  modpackConfigPath: atm10ModpackConfigPath,

  // BlueMap live URL and snapshot settings
  bluemapUrl: atm10BluemapUrl,
  snapshotEveryMs: Number(process.env.BLUEMAP_SNAPSHOT_EVERY_MS || 180000),
  snapshotDir: path.join(__dirname, '..', 'public', 'cache'),
  snapshotFileName: process.env.BLUEMAP_SNAPSHOT_FILE || 'bluemap-1920x1080.jpg',
  vanillaSnapshotFileName,

  // Optional Dynmap URL if you want to expose it in API
  dynmapUrl: atm10DynmapUrl,

  // Chromium path for puppeteer-core (optional)
  chromiumPath: process.env.CHROMIUM_PATH || null,

  // Values exposed to client
  client: atm10Client,

  // Per-server allowlist (used by API routes, prevents arbitrary host probing)
  defaultServerKey: process.env.DEFAULT_SERVER_KEY || 'atm10',
  servers: {
    vanilla: {
      serverHost: process.env.VANILLA_SERVER_HOST || 'playgay.milan.deviance.rehab',
      serverPort: Number(process.env.VANILLA_SERVER_PORT || 25566),
      queryPort: Number(process.env.VANILLA_QUERY_PORT || 25566),
      modpackConfigPath: null,
      dynmapUrl: null,
      bluemapUrl: process.env.VANILLA_BLUEMAP_URL || 'https://mcstats.deviance.rehab/mapvanilla/#world:16:65:179:23:1.12:1.01:0:0:perspective',
      client: {
        displayHostname: process.env.VANILLA_DISPLAY_HOSTNAME || 'playgay.milan.deviance.rehab',
        bluemapUrl: process.env.VANILLA_BLUEMAP_URL || 'https://mcstats.deviance.rehab/mapvanilla/#world:16:65:179:23:1.12:1.01:0:0:perspective',
        cachedSnapshotUrl: vanillaSnapshotPublic,
        pageTitle: process.env.VANILLA_PAGE_TITLE || 'STATS - playgay.milan.deviance.rehab'
      }
    },
    atm10: {
      serverHost: atm10ServerHost,
      serverPort: atm10ServerPort,
      queryPort: atm10QueryPort,
      modpackConfigPath: atm10ModpackConfigPath,
      dynmapUrl: atm10DynmapUrl,
      bluemapUrl: atm10BluemapUrl,
      client: atm10Client
    }
  }
};


