let autoRefreshInterval;
let clientConfig = null;
let bluemapReady = false;
let pendingExplore = false;
let hasExploredBefore = false; // Track if user has clicked explore at least once

// Preload click sound for refresh button
const refreshClickAudio = new Audio('audio/minecraft_click.mp3');
refreshClickAudio.preload = 'auto';
refreshClickAudio.volume = 1.0;

function playClickAndCheck() {
    try {
        // Restart from beginning and play immediately on user gesture
        refreshClickAudio.currentTime = 0;
        const playPromise = refreshClickAudio.play();
        if (playPromise && typeof playPromise.then === 'function') {
            playPromise.catch(() => {});
        }
    } catch (_) {
        // ignore playback errors and proceed
    }
    checkStatus();
}

async function checkStatus() {
    const refreshBtn = document.getElementById('refreshBtn');
    const statusText = document.getElementById('statusText');
    const statusRectangles = document.querySelectorAll('.status-rectangle');
    const versionValue = document.getElementById('versionValue');
    const versionType = document.getElementById('versionType');
    const playersValue = document.getElementById('playersValue');
    const latencyValue = document.getElementById('latencyValue');
    const descriptionBox = document.getElementById('descriptionBox');
    const descriptionText = document.getElementById('descriptionText');
    const serverFavicon = document.getElementById('serverFavicon');
    const modpackBox = document.getElementById('modpackBox');
    const modpackName = document.getElementById('modpackName');
    const modpackId = document.getElementById('modpackId');
    const modpackVersionBox = document.getElementById('modpackVersionBox');
    const modpackVersion = document.getElementById('modpackVersion');
    const playerList = document.getElementById('playerList');
    const playersList = document.getElementById('playersList');
    const errorBox = document.getElementById('errorBox');
    const errorText = document.getElementById('errorText');
    const serverAddress = document.getElementById('serverAddress');

    // Disable refresh button and show loading state
    refreshBtn.disabled = true;
    statusText.textContent = 'CHECKING...';
    statusRectangles.forEach(rect => {
        rect.classList.remove('offline');
        rect.style.opacity = '0.5';
    });

    try {
        const response = await fetch('/api/status');
        const data = await response.json();

        // Always display configured host (from client config if available)
        if (clientConfig && clientConfig.displayHostname) {
            serverAddress.textContent = clientConfig.displayHostname;
            if (document && document.title && clientConfig.pageTitle) {
                document.title = clientConfig.pageTitle;
            }
        }

        if (data.online) {
            // Server is online
            statusText.textContent = 'ONLINE';
            statusRectangles.forEach(rect => {
                rect.classList.remove('offline');
                rect.style.opacity = '1';
            });
            
            // Update version
            versionValue.textContent = data.version || 'Unknown';
            
            // Update version type (mod loader type)
            if (data.modpack && data.modpack.type && data.modpack.type !== 'Unknown') {
                const type = data.modpack.type.toUpperCase();
                versionType.textContent = type;
                versionType.style.display = 'inline-flex';
            } else {
                versionType.textContent = '';
                versionType.style.display = 'none';
            }
            
            // Update players
            playersValue.textContent = `${data.players.online} / ${data.players.max}`;
            
            // Update latency
            if (data.latency !== null && data.latency !== undefined) {
                const latencyMs = Math.round(data.latency);
                latencyValue.textContent = `${latencyMs}ms`;
                latencyValue.style.color = '#ffffff'; // Keep white as per design
            } else {
                latencyValue.textContent = '-';
                latencyValue.style.color = '#ffffff';
            }

            // Show favicon if available
            if (data.favicon) {
                serverFavicon.src = data.favicon;
                serverFavicon.style.display = 'block';
            } else {
                serverFavicon.style.display = 'none';
            }

            // Show description if available
            const description = data.description || (data.query && data.query.motdClean);
            if (description) {
                descriptionBox.style.display = '';
                if (data.description && data.description.trim()) {
                    descriptionText.textContent = data.description;
                } else if (data.query && data.query.motdClean && data.query.motdClean.trim()) {
                    descriptionText.textContent = data.query.motdClean;
                } else {
                    descriptionText.textContent = String(description);
                }
            } else {
                descriptionBox.style.display = 'none';
            }

            // Show modpack info if available
            if (data.modpack && (data.modpack.name || data.modpack.type)) {
                modpackBox.style.display = '';
                
                if (data.modpack.name && data.modpack.name !== 'Unknown') {
                    modpackName.textContent = data.modpack.name;
                    
                    // Show modpack ID if available
                    if (data.modpack.projectID) {
                        modpackId.textContent = `ID: ${data.modpack.projectID}`;
                        modpackId.style.display = 'block';
                    } else {
                        modpackId.textContent = '';
                        modpackId.style.display = 'none';
                    }
                } else {
                    modpackName.textContent = '';
                }
                
                // Show modpack version if available
                if (data.modpack.version && data.modpack.version !== 'Unknown') {
                    modpackVersion.textContent = data.modpack.version;
                    modpackVersionBox.style.display = '';
                } else {
                    modpackVersionBox.style.display = 'none';
                }
            } else {
                modpackBox.style.display = 'none';
                modpackVersionBox.style.display = 'none';
            }

            // Show player list if there are players
            if (data.players.sample && data.players.sample.length > 0) {
                playerList.style.display = '';
                playersList.innerHTML = '';
                
                // Process players
                const playerPromises = data.players.sample.map(async (player) => {
                    let playerName, uuid = null;
                    
                    // Check if player is an object with id/uuid and name
                    if (typeof player === 'object' && player !== null) {
                        playerName = player.name || player.id || Object.values(player)[0];
                        uuid = player.id || player.uuid || null;
                    } else {
                        // Player is just a string
                        playerName = String(player).trim();
                    }
                    
                    // Clean player name - take first word only if there are spaces
                    const cleanName = String(playerName).trim().split(/\s+/)[0];
                    
                    // If we don't have UUID from server, try Mojang API as fallback
                    if (!uuid) {
                        try {
                            const uuidResponse = await fetch(`https://api.mojang.com/users/profiles/minecraft/${encodeURIComponent(cleanName)}`, {
                                method: 'GET',
                                headers: { 'Accept': 'application/json' }
                            });
                            if (uuidResponse.ok) {
                                const uuidData = await uuidResponse.json();
                                uuid = uuidData.id;
                            }
                        } catch (e) {
                            // UUID lookup failed, will use default avatar
                        }
                    }
                    
                    const playerButton = document.createElement('div');
                    playerButton.className = 'player-button';
                    
                    const playerNameSpan = document.createElement('span');
                    playerNameSpan.className = 'player-name';
                    playerNameSpan.textContent = cleanName;
                    
                    playerButton.appendChild(playerNameSpan);
                    
                    return playerButton;
                });
                
                const playerElements = await Promise.all(playerPromises);
                playerElements.forEach(button => playersList.appendChild(button));
            } else if (data.players.online > 0) {
                playerList.style.display = 'block';
                playersList.innerHTML = '<div class="player-button"><span class="player-name">Player names unavailable</span></div>';
            } else {
                playerList.style.display = 'none';
            }

            // Show Dynmap if configured
            if (data.dynmapUrl) {
                document.getElementById('dynmapFrame').src = data.dynmapUrl;
                document.getElementById('dynmapBox').style.display = '';
            } else {
                document.getElementById('dynmapBox').style.display = 'none';
            }

            errorBox.style.display = 'none';
        } else {
            // Server is offline
            statusText.textContent = 'OFFLINE';
            statusRectangles.forEach(rect => {
                rect.classList.add('offline');
                rect.style.opacity = '1';
            });
            
            versionValue.textContent = '-';
            versionType.textContent = '';
            versionType.style.display = 'none';
            playersValue.textContent = '-';
            latencyValue.textContent = '-';
            serverFavicon.style.display = 'none';
            descriptionBox.style.display = 'none';
            playerList.style.display = 'none';

            // Show modpack info if available even when server is offline
            if (data.modpack && (data.modpack.name || data.modpack.type)) {
                modpackBox.style.display = '';
                
                if (data.modpack.name && data.modpack.name !== 'Unknown') {
                    modpackName.textContent = data.modpack.name;
                    
                    if (data.modpack.projectID) {
                        modpackId.textContent = `ID: ${data.modpack.projectID}`;
                        modpackId.style.display = 'block';
                    } else {
                        modpackId.textContent = '';
                        modpackId.style.display = 'none';
                    }
                } else {
                    modpackName.textContent = '';
                }
                
                if (data.modpack.version && data.modpack.version !== 'Unknown') {
                    modpackVersion.textContent = data.modpack.version;
                    modpackVersionBox.style.display = '';
                } else {
                    modpackVersionBox.style.display = 'none';
                }
            } else {
                modpackBox.style.display = 'none';
                modpackVersionBox.style.display = 'none';
            }

            if (data.error) {
                errorBox.style.display = '';
                errorText.textContent = data.error;
            } else {
                errorBox.style.display = '';
                errorText.textContent = 'Unable to connect to server';
            }
        }
    } catch (error) {
        console.error('Error fetching status:', error);
        statusText.textContent = 'ERROR';
        statusRectangles.forEach(rect => {
            rect.classList.add('offline');
            rect.style.opacity = '1';
        });
        versionValue.textContent = '-';
        versionType.textContent = '';
        versionType.style.display = 'none';
        playersValue.textContent = '-';
        latencyValue.textContent = '-';
        serverFavicon.style.display = 'none';
        descriptionBox.style.display = 'none';
        playerList.style.display = 'none';
        modpackBox.style.display = 'none';
        modpackVersionBox.style.display = 'none';
        errorBox.style.display = '';
        errorText.textContent = 'Failed to fetch server status';
    } finally {
        refreshBtn.disabled = false;
    }
}

// Initial check
checkStatus();

// Auto-refresh every 30 seconds
autoRefreshInterval = setInterval(checkStatus, 30000);

// Clean up interval on page unload
window.addEventListener('beforeunload', () => {
    if (autoRefreshInterval) {
        clearInterval(autoRefreshInterval);
    }
});

// Fade-in BlueMap background when it finishes loading; keep fallback until then
window.addEventListener('DOMContentLoaded', () => {
    const bgFrame = document.getElementById('bluemapFrameBg');
    const bgContainer = document.querySelector('.bluemap-bg');
    const fallbackDiv = document.querySelector('.bluemap-fallback');
    const container = document.querySelector('.container');
    const exploreBtn = document.getElementById('exploreBtn');
    const liveMapOverlay = document.getElementById('liveMapOverlay');
    const liveMapFrame = document.getElementById('liveMapFrame');

    // Load client config (use cached if available from early inline script)
    const configPromise = window._bluemapConfig 
        ? Promise.resolve(window._bluemapConfig)
        : fetch('/api/client-config').then(r => r.json());
    
    configPromise.then(cfg => {
        clientConfig = cfg;
        if (cfg.displayHostname) {
            const serverAddress = document.getElementById('serverAddress');
            if (serverAddress) serverAddress.textContent = cfg.displayHostname;
        }
        if (cfg.pageTitle) document.title = cfg.pageTitle;
        if (fallbackDiv && cfg.cachedSnapshotUrl) {
            fallbackDiv.style.backgroundImage = `url('${cfg.cachedSnapshotUrl}')`;
        }
        // Don't load iframe until EXPLORE is clicked - just store config
    }).catch((err) => {
        // best-effort; keep defaults if config fetch fails
        console.warn('Config fetch failed, using defaults:', err);
    });

    function markMapReady() {
        console.log('[markMapReady] Called, bluemapReady:', bluemapReady, 'pendingExplore:', pendingExplore);
        if (bluemapReady) {
            console.log('[markMapReady] Already ready, returning');
            return;
        }
        bluemapReady = true;
        console.log('[markMapReady] Set bluemapReady to true');
        if (pendingExplore) {
            console.log('[markMapReady] pendingExplore is true, entering explore mode');
            // User already clicked explore; enter now
            hasExploredBefore = true; // Mark that we've explored
            document.body.classList.add('exploring');
            if (container) container.classList.add('exploring');
            if (exploreBtn) {
                exploreBtn.textContent = 'BACK TO STATS';
                exploreBtn.disabled = false;
                console.log('[markMapReady] Updated button to BACK TO STATS');
            }
            // Hide cached image permanently after first explore
            const fallbackDiv = document.querySelector('.bluemap-fallback');
            if (fallbackDiv) {
                fallbackDiv.style.display = 'none';
            }
            // Show BlueMap UI when exploring
            const bgFrame = document.getElementById('bluemapFrameBg');
            if (bgFrame) {
                showBluemapUI(bgFrame);
            }
            pendingExplore = false;
            console.log('[markMapReady] Explore mode entered successfully');
        } else {
            console.log('[markMapReady] pendingExplore is false, not entering explore mode');
        }
    }

    let uiObserver = null;
    let isHidingUI = false; // Flag to prevent conflicts

    // Inject CSS into iframe to hide UI elements (works when same-origin)
    function hideBluemapUI(iframe) {
        isHidingUI = true; // Set flag
        console.log('[hideBluemapUI] Function called');
        if (!iframe) {
            console.error('[hideBluemapUI] iframe is null');
            return;
        }
        function attemptInject(retries = 20) {
            try {
                const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
                if (!iframeDoc || !iframeDoc.head) {
                    console.log(`[hideBluemapUI] iframeDoc not ready, retries left: ${retries}`);
                    if (retries > 0) {
                        setTimeout(() => attemptInject(retries - 1), 100);
                    }
                    return;
                }
                console.log('[hideBluemapUI] iframeDoc ready, injecting CSS...');
                
                // Stop any existing observer
                if (uiObserver) {
                    uiObserver.disconnect();
                    uiObserver = null;
                }
                
                // Remove existing style if present
                const existingStyle = iframeDoc.getElementById('hide-ui-style');
                if (existingStyle) {
                    existingStyle.remove();
                }
                
                // Add CSS to hide UI elements - use very high specificity
                const style = iframeDoc.createElement('style');
                style.id = 'hide-ui-style';
                style.textContent = `
                    #zoom-buttons,
                    #zoom-buttons *,
                    .zoom-buttons,
                    .zoom-buttons *,
                    [id*="zoom-buttons"],
                    [id*="zoom-buttons"] *,
                    [class*="zoom-buttons"],
                    [class*="zoom-buttons"] *,
                    [class*="zoomButtons"],
                    [class*="zoomButtons"] *,
                    .control-bar,
                    .control-bar * {
                        display: none !important;
                        opacity: 0 !important;
                        visibility: hidden !important;
                        pointer-events: none !important;
                    }
                `;
                // Append to head, and also try to keep it at the end for higher priority
                iframeDoc.head.appendChild(style);
                console.log('[hideBluemapUI] CSS style tag injected into iframe head');
                // Also append after a short delay to ensure it stays
                setTimeout(() => {
                    try {
                        const existingStyle = iframeDoc.getElementById('hide-ui-style');
                        if (existingStyle && existingStyle.parentNode) {
                            // Move to end of head to increase priority
                            existingStyle.parentNode.appendChild(existingStyle);
                            console.log('[hideBluemapUI] Moved style tag to end of head for higher priority');
                        }
                    } catch (e) {}
                }, 100);
                
                // Track if we've already logged to prevent spam
                let hasLoggedDebug = false;
                let lastHideTime = 0;
                const THROTTLE_MS = 500; // Only run hideElements max once per 500ms
                
                // Function to directly hide elements
                function hideElements() {
                    // Don't hide if we're showing UI
                    if (!isHidingUI) {
                        return;
                    }
                    const now = Date.now();
                    if (now - lastHideTime < THROTTLE_MS) {
                        return; // Throttle to prevent infinite loops
                    }
                    lastHideTime = now;
                    
                    try {
                        // Try multiple selectors to catch zoom-buttons
                        // It's an ID, not a class! Use #zoom-buttons
                        const zoomBtns1 = iframeDoc.querySelectorAll('#zoom-buttons');
                        const zoomBtns2 = iframeDoc.querySelectorAll('.zoom-buttons'); // Also try class just in case
                        const zoomBtns3 = iframeDoc.querySelectorAll('[id*="zoom-buttons"]');
                        const zoomBtns4 = iframeDoc.querySelectorAll('[class*="zoom-buttons"]');
                        const zoomBtns5 = iframeDoc.querySelectorAll('[class*="zoomButtons"]');
                        const allZoomBtns = new Set([...zoomBtns1, ...zoomBtns2, ...zoomBtns3, ...zoomBtns4, ...zoomBtns5]);
                        const zoomBtns = Array.from(allZoomBtns);
                        
                        console.log(`[hideBluemapUI] #zoom-buttons (ID) found: ${zoomBtns1.length}, .zoom-buttons (class) found: ${zoomBtns2.length}, total: ${zoomBtns.length}`);
                        
                        // If we found elements, log them
                        if (zoomBtns.length > 0) {
                            console.log(`[hideBluemapUI] SUCCESS! Found ${zoomBtns.length} zoom-buttons elements`);
                            zoomBtns.forEach((el, idx) => {
                                console.log(`[hideBluemapUI] Element ${idx + 1}: id="${el.id}", classes="${el.className}", tag="${el.tagName}"`);
                            });
                        }
                        
                        const controlBar = iframeDoc.querySelectorAll('.control-bar');
                        
                        // Only log once when we first run, or when we find something new
                        if (!hasLoggedDebug) {
                            console.log(`[hideBluemapUI] Found ${zoomBtns.length} zoom-buttons elements, ${controlBar.length} control-bar elements`);
                        }
                        
                        // If no zoom-buttons found, search more broadly - maybe it's a button container
                        if (zoomBtns.length === 0 && !hasLoggedDebug) {
                            hasLoggedDebug = true; // Mark as logged so we don't spam
                            // Search for all buttons and containers that might be zoom buttons
                            const allButtons = iframeDoc.querySelectorAll('button, [role="button"], .btn, [class*="button"]');
                            const allContainers = iframeDoc.querySelectorAll('[class*="control"], [class*="toolbar"], [class*="panel"]');
                            
                            console.log(`[hideBluemapUI] Searching broadly - found ${allButtons.length} buttons, ${allContainers.length} containers`);
                            console.log(`[hideBluemapUI] Please inspect the BlueMap page and find the zoom buttons class name`);
                            
                            // Try to find elements that might be zoom buttons by looking for common patterns
                            const possibleZoomBtns = Array.from(allButtons).concat(Array.from(allContainers));
                            possibleZoomBtns.forEach((el, idx) => {
                                if (idx < 10 && el.className && typeof el.className === 'string') {
                                    const classes = el.className.toLowerCase();
                                    if (classes.includes('zoom') || classes.includes('in') || classes.includes('out')) {
                                        console.log(`[hideBluemapUI] Possible zoom element ${idx + 1}: classes="${el.className}", tag="${el.tagName}"`);
                                    }
                                }
                            });
                        }
                        
                        zoomBtns.forEach((el) => {
                            // Apply hiding styles with !important to override BlueMap's styles
                            el.style.setProperty('display', 'none', 'important');
                            el.style.setProperty('opacity', '0', 'important');
                            el.style.setProperty('visibility', 'hidden', 'important');
                            el.style.setProperty('pointer-events', 'none', 'important');
                        });
                        
                        controlBar.forEach(el => {
                            el.style.setProperty('display', 'none', 'important');
                            el.style.setProperty('opacity', '0', 'important');
                            el.style.setProperty('visibility', 'hidden', 'important');
                        });
                    } catch (e) {
                        console.error('[hideBluemapUI] Error in hideElements:', e);
                    }
                }
                
                // Hide existing elements immediately
                hideElements();
                
                // Also try multiple times with delays to catch elements that load later
                const delayedSearches = [100, 300, 500, 1000, 2000, 3000];
                delayedSearches.forEach(delay => {
                    setTimeout(() => {
                        console.log(`[hideBluemapUI] Delayed search after ${delay}ms`);
                        hideElements();
                    }, delay);
                });
                
                // Watch for new elements being added
                uiObserver = new MutationObserver(() => {
                    hideElements();
                });
                
                // Start observing
                const target = iframeDoc.body || iframeDoc.documentElement;
                if (target) {
                    uiObserver.observe(target, {
                        childList: true,
                        subtree: true
                    });
                }
                
                // Also hide elements periodically as backup (more frequent)
                const hideInterval = setInterval(() => {
                    if (iframe.contentDocument) {
                        // Ensure style tag still exists
                        const existingStyle = iframeDoc.getElementById('hide-ui-style');
                        if (!existingStyle) {
                            // Style was removed, re-add it
                            const style = iframeDoc.createElement('style');
                            style.id = 'hide-ui-style';
                            style.textContent = `
                                #zoom-buttons,
                                #zoom-buttons *,
                                .zoom-buttons,
                                .zoom-buttons *,
                                [id*="zoom-buttons"],
                                [id*="zoom-buttons"] *,
                                [class*="zoom-buttons"],
                                [class*="zoom-buttons"] *,
                                [class*="zoomButtons"],
                                [class*="zoomButtons"] *,
                                .control-bar,
                                .control-bar * {
                                    display: none !important;
                                    opacity: 0 !important;
                                    visibility: hidden !important;
                                    pointer-events: none !important;
                                }
                            `;
                            iframeDoc.head.appendChild(style);
                        }
                        // Only hide if flag is still set
                        if (isHidingUI) {
                            hideElements();
                        }
                    } else {
                        clearInterval(hideInterval);
                    }
                }, 50);
                
                // Store interval so we can clear it later
                iframe._hideUIInterval = hideInterval;
                
            } catch (e) {
                if (retries > 0) {
                    setTimeout(() => attemptInject(retries - 1), 100);
                }
            }
        }
        attemptInject();
    }

    // Remove CSS from iframe to show UI elements
    function showBluemapUI(iframe) {
        isHidingUI = false; // Clear flag to stop hiding
        console.log('[showBluemapUI] Function called, clearing hide flag');
        function attemptRemove(retries = 10) {
            try {
                const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
                if (!iframeDoc || !iframeDoc.head) {
                    if (retries > 0) {
                        setTimeout(() => attemptRemove(retries - 1), 100);
                    }
                    return;
                }
                
                // Stop observer FIRST
                if (uiObserver) {
                    uiObserver.disconnect();
                    uiObserver = null;
                    console.log('[showBluemapUI] Observer stopped');
                }
                
                // Clear interval FIRST
                if (iframe._hideUIInterval) {
                    clearInterval(iframe._hideUIInterval);
                    iframe._hideUIInterval = null;
                    console.log('[showBluemapUI] Interval cleared');
                }
                
                // Remove CSS style
                const existingStyle = iframeDoc.getElementById('hide-ui-style');
                if (existingStyle) {
                    existingStyle.remove();
                }
                
                // Remove inline styles from elements
                try {
                    // Use ID selector for zoom-buttons (it's an ID, not a class!)
                    const zoomBtns1 = iframeDoc.querySelectorAll('#zoom-buttons');
                    const zoomBtns2 = iframeDoc.querySelectorAll('.zoom-buttons');
                    const zoomBtns3 = iframeDoc.querySelectorAll('[id*="zoom-buttons"]');
                    const allZoomBtns = new Set([...zoomBtns1, ...zoomBtns2, ...zoomBtns3]);
                    const zoomBtns = Array.from(allZoomBtns);
                    
                    const controlBar = iframeDoc.querySelectorAll('.control-bar');
                    
                    console.log(`[showBluemapUI] Removing inline styles from ${zoomBtns.length} zoom-buttons, ${controlBar.length} control-bar`);
                    
                    zoomBtns.forEach(el => {
                        el.style.removeProperty('display');
                        el.style.removeProperty('opacity');
                        el.style.removeProperty('visibility');
                        el.style.removeProperty('pointer-events');
                    });
                    controlBar.forEach(el => {
                        el.style.removeProperty('display');
                        el.style.removeProperty('opacity');
                        el.style.removeProperty('visibility');
                    });
                } catch (e) {
                    console.error('[showBluemapUI] Error removing inline styles:', e);
                }
                
            } catch (e) {
                if (retries > 0) {
                    setTimeout(() => attemptRemove(retries - 1), 100);
                }
            }
        }
        attemptRemove();
    }

    // Toggle explore: dissolve stats and cached screenshot to reveal preloaded BlueMap
    window.toggleExplore = function toggleExplore() {
        const isExploring = document.body.classList.contains('exploring');
        const bgFrame = document.getElementById('bluemapFrameBg');
        
        if (!isExploring) {
            // Entering explore mode - show UI
            if (bluemapReady) {
                hasExploredBefore = true; // Mark that we've explored
                document.body.classList.add('exploring');
                if (container) container.classList.add('exploring');
                if (exploreBtn) exploreBtn.textContent = 'BACK TO STATS';
                // Hide cached image permanently after first explore
                const fallbackDiv = document.querySelector('.bluemap-fallback');
                if (fallbackDiv) {
                    fallbackDiv.style.display = 'none';
                }
                // Show BlueMap UI when exploring
                if (bgFrame) {
                    showBluemapUI(bgFrame);
                }
            } else {
                // Entering explore mode - need to load iframe first
                console.log('[toggleExplore] Starting explore mode, bluemapReady:', bluemapReady);
                
                // Set pending explore and update button immediately
                pendingExplore = true;
                if (exploreBtn) {
                    exploreBtn.textContent = 'LOADING...';
                    exploreBtn.disabled = true;
                }
                
                // Load iframe now if not already loaded
                const loadIframe = (config) => {
                    console.log('[toggleExplore] loadIframe called, bgFrame:', bgFrame, 'current src:', bgFrame?.src);
                    if (bgFrame) {
                        // Check if src is empty or not set
                        const currentSrc = bgFrame.src;
                        const srcAttr = bgFrame.getAttribute('src');
                        console.log('[toggleExplore] currentSrc:', currentSrc, 'srcAttr:', srcAttr);
                        // Check if src is empty, about:blank, or points to current page
                        if (!currentSrc || currentSrc === '' || currentSrc === 'about:blank' || 
                            currentSrc === window.location.href || currentSrc === `${window.location.origin}/`) {
                            const url = config?.bluemapUrl || (window._bluemapConfig?.bluemapUrl) || 'https://mcstats.deviance.rehab/map/#world:227:63:4177:32:1.21:1.31:0:0:perspective';
                            bgFrame.src = url;
                            console.log('[toggleExplore] Loading BlueMap iframe:', bgFrame.src);
                            
                            // Set up load tracking
                            bgFrame.addEventListener('load', () => {
                                console.log('[toggleExplore] BlueMap iframe load event fired');
                                markMapReady();
                            }, { once: true });
                            
                            // Fallback timeout
                            setTimeout(() => {
                                if (!bluemapReady) {
                                    console.log('[toggleExplore] BlueMap iframe timeout fallback - marking ready after 5s');
                                    markMapReady();
                                }
                            }, 5000);
                        } else {
                            console.log('[toggleExplore] Iframe already has src, waiting for it to be ready');
                            // Iframe already loading, just wait for it
                            if (!bluemapReady) {
                                bgFrame.addEventListener('load', () => {
                                    console.log('[toggleExplore] BlueMap iframe load event fired (already loading)');
                                    markMapReady();
                                }, { once: true });
                                setTimeout(() => {
                                    if (!bluemapReady) {
                                        console.log('[toggleExplore] BlueMap iframe timeout fallback - marking ready after 5s');
                                        markMapReady();
                                    }
                                }, 5000);
                            }
                        }
                    } else {
                        console.error('[toggleExplore] bgFrame is null!');
                    }
                };
                
                // Wait for config if not loaded yet
                if (clientConfig) {
                    console.log('[toggleExplore] Using clientConfig');
                    loadIframe(clientConfig);
                } else if (window._bluemapConfig) {
                    console.log('[toggleExplore] Using window._bluemapConfig');
                    loadIframe(window._bluemapConfig);
                } else {
                    console.log('[toggleExplore] Fetching config...');
                    // Fetch config first
                    fetch('/api/client-config')
                        .then(r => r.json())
                        .then(cfg => {
                            console.log('[toggleExplore] Config fetched:', cfg);
                            clientConfig = cfg;
                            loadIframe(cfg);
                        })
                        .catch((err) => {
                            console.error('[toggleExplore] Config fetch failed:', err);
                            loadIframe(null); // Use fallback URL
                        });
                }
            }
        } else {
            // Exiting explore mode - hide UI, keep live map visible, show stats overlay
            document.body.classList.remove('exploring');
            if (container) container.classList.remove('exploring');
            if (exploreBtn) exploreBtn.textContent = 'EXPLORE';
            if (exploreBtn) exploreBtn.disabled = false;
            // Hide BlueMap UI when showing stats
            if (bgFrame && hasExploredBefore) {
                hideBluemapUI(bgFrame);
            }
            // Live BlueMap stays visible in background (not cached image)
        }
    };
    
});
