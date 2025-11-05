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
    // Use both CSS injection and direct DOM manipulation for maximum reliability
    try {
      // Inject CSS with comprehensive selectors
      await page.addStyleTag({ content: `
        .leaflet-control-container,
        .leaflet-control,
        .leaflet-control-zoom,
        .leaflet-control-zoom-in,
        .leaflet-control-zoom-out,
        .zoom-buttons,
        .zoomButtons,
        #zoom-buttons,
        #zoomButtons,
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
          pointer-events: none !important;
        }
      `});
      
      // Wait for initial page load
      await new Promise((r) => setTimeout(r, 500));
      
      // Directly hide elements via JavaScript (more reliable than CSS alone)
      await page.evaluate(() => {
        // Function to hide elements with multiple selector attempts
        const hideElements = () => {
          const selectors = [
            '.leaflet-control-container',
            '.leaflet-control',
            '.leaflet-control-zoom',
            '.leaflet-control-zoom-in',
            '.leaflet-control-zoom-out',
            '.zoom-buttons',
            '.zoomButtons',
            '#zoom-buttons',
            '#zoomButtons',
            '[class*="zoom" i]',
            '[class*="zoom-buttons" i]',
            '[class*="zoomButtons" i]',
            '[id*="zoom" i]',
            '[id*="Zoom" i]',
            '[class*="control" i]',
            '[class*="ui" i]',
            '[class*="toolbar" i]',
            '[class*="sidebar" i]',
            'nav',
            'header',
            'footer'
          ];
          
          selectors.forEach(selector => {
            try {
              const elements = document.querySelectorAll(selector);
              elements.forEach(el => {
                el.style.display = 'none';
                el.style.opacity = '0';
                el.style.visibility = 'hidden';
                el.style.pointerEvents = 'none';
              });
            } catch (e) {}
          });
        };
        
        // Hide immediately
        hideElements();
        
        // Use MutationObserver to catch dynamically added elements
        const observer = new MutationObserver(() => {
          hideElements();
        });
        
        observer.observe(document.body, {
          childList: true,
          subtree: true,
          attributes: true,
          attributeFilter: ['class', 'id']
        });
        
        // Also hide periodically to catch any elements that slip through
        const interval = setInterval(hideElements, 100);
        
        // Store cleanup function for later
        window._bluemapCleanup = () => {
          observer.disconnect();
          clearInterval(interval);
        };
      });
      
      // Wait longer for all elements to be processed
      await new Promise((r) => setTimeout(r, 1000));
    } catch (e) {
      console.log('Warning: Failed to hide UI elements:', e.message);
    }

    // Wait until a large canvas (rendered map) exists to avoid capturing a loading state
    try {
      await page.waitForFunction(() => {
        const canvases = Array.from(document.querySelectorAll('canvas'));
        return canvases.some(c => (c.width || 0) * (c.height || 0) > 512 * 512);
      }, { timeout: 15000 });
      
      console.log('Canvas detected, waiting for map content...');
      
      // Wait for map to actually render content (not just white)
      // Poll multiple times to ensure content is loaded (check more frequently)
      let hasContent = false;
      for (let attempt = 0; attempt < 30; attempt++) {
        await new Promise((r) => setTimeout(r, 500)); // Wait 0.5 seconds per attempt (check twice as often)
        
        hasContent = await page.evaluate((attemptNum) => {
          const canvases = Array.from(document.querySelectorAll('canvas'));
          const largeCanvas = canvases.find(c => (c.width || 0) * (c.height || 0) > 512 * 512);
          if (!largeCanvas) return false;
          
          try {
            // Try to check if canvas has WebGL context (BlueMap uses WebGL)
            const gl = largeCanvas.getContext('webgl') || largeCanvas.getContext('webgl2');
            if (gl) {
              // Check if WebGL has been used
              const params = gl.getParameter(gl.FRAMEBUFFER_BINDING);
              if (params !== null) {
                return true;
              }
            }
            
            // Fallback: Try 2D context and sample pixels
            const ctx = largeCanvas.getContext('2d', { willReadFrequently: true });
            if (ctx) {
              try {
                const w = largeCanvas.width;
                const h = largeCanvas.height;
                // Sample center and corners
                const samples = [
                  [w * 0.5, h * 0.5],
                  [w * 0.1, h * 0.1],
                  [w * 0.9, h * 0.9]
                ];
                
                for (const [x, y] of samples) {
                  const imgData = ctx.getImageData(Math.floor(x), Math.floor(y), 1, 1);
                  const r = imgData.data[0];
                  const g = imgData.data[1];
                  const b = imgData.data[2];
                  // If pixel is not white/very light, we have content
                  if (r < 240 || g < 240 || b < 240) {
                    return true;
                  }
                }
              } catch (e) {
                // Can't read pixels (CORS), but WebGL context exists, so assume ready after enough attempts
                return attemptNum >= 15; // After 7.5 seconds (15 * 0.5s)
              }
            }
          } catch (e) {
            // Context check failed, continue waiting
          }
          
          return false;
        }, attempt);
        
        if (hasContent) {
          console.log('Map content detected after', (attempt + 1) * 0.5, 'seconds');
          break;
        }
      }
      
      if (!hasContent) {
        console.log('Warning: Could not verify map content, waiting extra 3 seconds...');
        await new Promise((r) => setTimeout(r, 3000));
      }
      
      // Final wait to ensure everything is fully rendered (reduced from 2s to 1s)
      await new Promise((r) => setTimeout(r, 1000));
      
      // Final pass to ensure all UI elements are hidden
      await page.evaluate(() => {
        if (window._bluemapCleanup) {
          window._bluemapCleanup();
        }
        // Final aggressive hide
        const allSelectors = [
          '.leaflet-control-container', '.leaflet-control', '.leaflet-control-zoom',
          '.zoom-buttons', '.zoomButtons', '#zoom-buttons', '#zoomButtons',
          '[class*="zoom" i]', '[class*="zoom-buttons" i]', '[class*="zoomButtons" i]',
          '[id*="zoom" i]', '[id*="Zoom" i]', '[class*="control" i]',
          '[class*="ui" i]', '[class*="toolbar" i]', '[class*="sidebar" i]',
          'nav', 'header', 'footer'
        ];
        allSelectors.forEach(sel => {
          try {
            document.querySelectorAll(sel).forEach(el => {
              el.style.cssText = 'display: none !important; opacity: 0 !important; visibility: hidden !important; pointer-events: none !important;';
            });
          } catch (e) {}
        });
      });
      
      // One more brief wait before screenshot
      await new Promise((r) => setTimeout(r, 500));
    } catch (_) {
      // Fallback: small settle
      await new Promise((r) => setTimeout(r, 2000));
    }
    
    await page.screenshot({ path: SNAPSHOT_FILE, type: 'jpeg', quality: 80 });
    return SNAPSHOT_FILE;
  } finally {
    await browser.close();
  }
}

function startScheduler() {
  // Wait before first snapshot to ensure system is ready
  // Delay initial snapshot to give BlueMap server time to be ready
  setTimeout(() => {
    console.log('Taking initial BlueMap snapshot...');
    takeSnapshot().catch((e) => console.log('Initial BlueMap snapshot failed:', e.message));
  }, 30000); // Wait 30 seconds before first snapshot (reduced from 60s)
  
  // Schedule recurring snapshots
  setInterval(() => {
    takeSnapshot().catch((e) => console.log('Scheduled BlueMap snapshot failed:', e.message));
  }, INTERVAL_MS);
}

module.exports = { startScheduler, takeSnapshot, SNAPSHOT_FILE };


