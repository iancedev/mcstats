let autoRefreshInterval;

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

        // Always display configured host
        serverAddress.textContent = 'play.milan.deviance.rehab';

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
