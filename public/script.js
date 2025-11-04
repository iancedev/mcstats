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
        // BlueMap iframe src should already be set by inline script, but update if needed
        if (bgFrame) {
            if (cfg.bluemapUrl && bgFrame.src !== cfg.bluemapUrl) {
                bgFrame.src = cfg.bluemapUrl;
                console.log('BlueMap iframe src updated to:', cfg.bluemapUrl);
            } else if (bgFrame.src) {
                console.log('BlueMap iframe already has src from config:', bgFrame.src);
            }
            
            // Track loading - src should be set by now
            if (bgFrame.src) {
                // Try load event (may not fire for cross-origin)
                bgFrame.addEventListener('load', () => {
                    console.log('BlueMap iframe load event fired');
                    markMapReady();
                }, { once: true });
                
                // Fallback: consider ready after delay (SPA apps like BlueMap need time to initialize)
                setTimeout(() => {
                    if (!bluemapReady) {
                        console.log('BlueMap iframe timeout fallback - marking ready after 5s');
                        markMapReady();
                    }
                }, 5000);
                
                // Also check iframe error event
                bgFrame.addEventListener('error', (e) => {
                    console.error('BlueMap iframe error:', e);
                });
            }
        }
    }).catch((err) => {
        // best-effort; keep defaults if config fetch fails
        console.warn('Config fetch failed, using defaults:', err);
        const bgFrame = document.getElementById('bluemapFrameBg');
        if (bgFrame && bgFrame.src) {
            // Iframe already has src from HTML, track its loading
            bgFrame.addEventListener('load', () => {
                console.log('BlueMap iframe load event fired (fallback)');
                markMapReady();
            }, { once: true });
            setTimeout(() => {
                if (!bluemapReady) {
                    console.log('BlueMap iframe timeout fallback - marking ready after 5s (fallback)');
                    markMapReady();
                }
            }, 5000);
        }
    });
    
    // Also handle iframe that might already be loading from HTML src (before config loads)
    if (bgFrame && bgFrame.src) {
        // Check if already loaded (no reliable way, so just set timeout)
        setTimeout(() => {
            if (!bluemapReady) {
                // Iframe had src from HTML, give it time then mark ready
                console.log('BlueMap iframe had src from HTML - marking ready after 3s');
                markMapReady();
            }
        }, 3000);
    }

    function markMapReady() {
        if (bluemapReady) return;
        bluemapReady = true;
        if (pendingExplore) {
            // User already clicked explore; enter now
            hasExploredBefore = true; // Mark that we've explored
            document.body.classList.add('exploring');
            if (container) container.classList.add('exploring');
            if (exploreBtn) {
                exploreBtn.textContent = 'BACK TO STATS';
                exploreBtn.disabled = false;
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
        }
    }

    let uiObserver = null;

    // Inject CSS into iframe to hide UI elements (works when same-origin)
    function hideBluemapUI(iframe) {
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
                    .zoom-buttons,
                    .zoom-buttons *,
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
                    const now = Date.now();
                    if (now - lastHideTime < THROTTLE_MS) {
                        return; // Throttle to prevent infinite loops
                    }
                    lastHideTime = now;
                    
                    try {
                        // Try multiple selectors to catch zoom-buttons
                        // First try exact class name
                        const zoomBtns1 = iframeDoc.querySelectorAll('.zoom-buttons');
                        console.log(`[hideBluemapUI] Direct .zoom-buttons query found: ${zoomBtns1.length} elements`);
                        
                        // Try variations
                        const zoomBtns2 = iframeDoc.querySelectorAll('[class*="zoom-buttons"]');
                        const zoomBtns3 = iframeDoc.querySelectorAll('[class*="zoomButtons"]');
                        const zoomBtns4 = iframeDoc.querySelectorAll('[class*="zoom"]');
                        const allZoomBtns = new Set([...zoomBtns1, ...zoomBtns2, ...zoomBtns3, ...zoomBtns4]);
                        const zoomBtns = Array.from(allZoomBtns);
                        
                        // If we found elements with exact .zoom-buttons, log them
                        if (zoomBtns1.length > 0) {
                            console.log(`[hideBluemapUI] SUCCESS! Found ${zoomBtns1.length} elements with .zoom-buttons class`);
                            zoomBtns1.forEach((el, idx) => {
                                console.log(`[hideBluemapUI] Element ${idx + 1}: classes="${el.className}", tag="${el.tagName}", parent="${el.parentElement?.className || 'none'}"`);
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
                                .zoom-buttons,
                                .zoom-buttons *,
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
                        hideElements();
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
        function attemptRemove(retries = 10) {
            try {
                const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
                if (!iframeDoc || !iframeDoc.head) {
                    if (retries > 0) {
                        setTimeout(() => attemptRemove(retries - 1), 100);
                    }
                    return;
                }
                
                // Stop observer
                if (uiObserver) {
                    uiObserver.disconnect();
                    uiObserver = null;
                }
                
                // Clear interval
                if (iframe._hideUIInterval) {
                    clearInterval(iframe._hideUIInterval);
                    iframe._hideUIInterval = null;
                }
                
                // Remove CSS style
                const existingStyle = iframeDoc.getElementById('hide-ui-style');
                if (existingStyle) {
                    existingStyle.remove();
                }
                
                // Remove inline styles from elements
                try {
                    const zoomBtns = iframeDoc.querySelectorAll('.zoom-buttons');
                    const controlBar = iframeDoc.querySelectorAll('.control-bar');
                    zoomBtns.forEach(el => {
                        el.style.removeProperty('display');
                        el.style.removeProperty('opacity');
                        el.style.removeProperty('visibility');
                    });
                    controlBar.forEach(el => {
                        el.style.removeProperty('display');
                        el.style.removeProperty('opacity');
                        el.style.removeProperty('visibility');
                    });
                } catch (e) {}
                
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
                // Defer transition until iframe is ready
                pendingExplore = true;
                if (exploreBtn) {
                    exploreBtn.textContent = 'LOADING MAP...';
                    exploreBtn.disabled = true;
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
