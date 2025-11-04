const fs = require('fs');
const path = require('path');
const cfg = require('./config');

const BLUEMAP_URL = cfg.bluemapUrl;
const SNAPSHOT_DIR = cfg.snapshotDir;
const SNAPSHOT_FILE = path.join(SNAPSHOT_DIR, cfg.snapshotFileName);
const INTERVAL_MS = cfg.snapshotEveryMs; // 3 minutes by default
const VIEWPORT = { width: 1920, height: 1080, deviceScaleFactor: 2 };

async function takeSnapshot() {
  if (!fs.existsSync(SNAPSHOT_DIR)) fs.mkdirSync(SNAPSHOT_DIR, { recursive: true });

  const useCore = !!cfg.chromiumPath;
  const puppeteer = useCore ? require('puppeteer-core') : require('puppeteer');
  const launchOpts = useCore
    ? { executablePath: cfg.chromiumPath, args: ['--no-sandbox', '--disable-setuid-sandbox'] }
    : { args: ['--no-sandbox', '--disable-setuid-sandbox'] };

  const browser = await puppeteer.launch(launchOpts);
  try {
    const page = await browser.newPage();
    await page.setViewport(VIEWPORT);
    // Navigate; try networkidle then fall back to domcontentloaded to avoid timeouts from long-polling
    try {
      await page.goto(BLUEMAP_URL, { waitUntil: 'networkidle2', timeout: 25000 });
    } catch (_) {
      await page.goto(BLUEMAP_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    }

    // Hide ALL BlueMap UI elements (including zoom buttons) so screenshot is clean
    try {
      await page.addStyleTag({ content: `
        .leaflet-control-container,
        .leaflet-control,
        .leaflet-control-zoom,
        .leaflet-control-zoom-in,
        .leaflet-control-zoom-out,
        .zoom-buttons,
        .zoomButtons,
        [class*="leaflet-control"],
        [class*="zoom" i],
        [class*="zoom-buttons" i],
        [class*="zoomButtons" i],
        [id*="zoom" i],
        [id*="Zoom" i],
        [class*="ui" i],
        [class*="toolbar" i],
        [class*="control" i],
        [class*="sidebar" i],
        [class*="button" i],
        nav, header, footer { 
          display: none !important; 
          opacity: 0 !important; 
          visibility: hidden !important; 
        }
      `});
      // Wait a moment for styles to apply
      await new Promise((r) => setTimeout(r, 200));
    } catch (_) {}

    // Wait until a large canvas (rendered map) exists to avoid capturing a loading state
    try {
      await page.waitForFunction(() => {
        const canvases = Array.from(document.querySelectorAll('canvas'));
        return canvases.some(c => (c.width || 0) * (c.height || 0) > 512 * 512);
      }, { timeout: 15000 });
    } catch (_) {
      // Fallback: small settle
      await new Promise((r) => setTimeout(r, 1500));
    }
    await page.screenshot({ path: SNAPSHOT_FILE, type: 'jpeg', quality: 80 });
    return SNAPSHOT_FILE;
  } finally {
    await browser.close();
  }
}

function startScheduler() {
  // Fire one immediately, then schedule recurring snapshots
  takeSnapshot().catch((e) => console.log('Initial BlueMap snapshot failed:', e.message));
  setInterval(() => {
    takeSnapshot().catch((e) => console.log('Scheduled BlueMap snapshot failed:', e.message));
  }, INTERVAL_MS);
}

module.exports = { startScheduler, takeSnapshot, SNAPSHOT_FILE };


