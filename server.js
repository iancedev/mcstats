const express = require('express');
const { status, statusLegacy, queryFull } = require('minecraft-server-util');
const path = require('path');
const fs = require('fs');
const toml = require('toml');

const app = express();
const PORT = process.env.PORT || 3000;
const cfg = require('./server/config');
const MINECRAFT_SERVER_HOST = cfg.serverHost;
const MINECRAFT_SERVER_PORT = cfg.serverPort; // Default Minecraft port
const MINECRAFT_QUERY_PORT = cfg.queryPort; // Query port (usually same as game port)
const MODPACK_CONFIG_PATH = cfg.modpackConfigPath;
const DYNMAP_URL = cfg.dynmapUrl; // e.g., 'http://host:8123'

// Serve static files from public directory
app.use(express.static('public'));

// Helper function to read modpack info from TOML config file
function readModpackConfig() {
  try {
    if (!fs.existsSync(MODPACK_CONFIG_PATH)) {
      console.warn(`Modpack config file not found at: ${MODPACK_CONFIG_PATH}`);
      return null;
    }
    
    const fileContent = fs.readFileSync(MODPACK_CONFIG_PATH, 'utf8');
    const config = toml.parse(fileContent);
    
    // Extract modpack info from [general] section
    const general = config.general || {};
    
    return {
      modpackName: general.modpackName || null,
      modpackVersion: general.modpackVersion || null,
      modpackProjectID: general.modpackProjectID || null
    };
  } catch (error) {
    console.error('Error reading modpack config:', error.message);
    return null;
  }
}

// Helper function to get all non-loopback network interface IPs
function getAllExternalInterfaceIPs() {
  const os = require('os');
  const interfaces = os.networkInterfaces();
  const ips = [];
  
  // Find all non-loopback, non-internal IPv4 addresses
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      // Skip loopback and internal addresses
      if (!iface.internal && 
          iface.family === 'IPv4' && 
          !iface.address.startsWith('127.') &&
          !iface.address.startsWith('169.254.')) {
        ips.push(iface.address);
      }
    }
  }
  
  return ips;
}

// Helper function to get a non-loopback network interface IP
function getExternalInterfaceIP() {
  const ips = getAllExternalInterfaceIPs();
  return ips.length > 0 ? ips[0] : null;
}

// Check if a target IP is one of the server's own IPs
function isOwnIP(targetIP) {
  const ownIPs = getAllExternalInterfaceIPs();
  return ownIPs.includes(targetIP);
}

// Helper function to check if an IP is in a private/internal range
function isPrivateIP(ip) {
  // IPv4 private ranges
  if (ip.startsWith('127.') || // Loopback
      ip.startsWith('10.') || // Private class A
      ip.startsWith('172.16.') || ip.startsWith('172.17.') || 
      ip.startsWith('172.18.') || ip.startsWith('172.19.') ||
      ip.startsWith('172.20.') || ip.startsWith('172.21.') ||
      ip.startsWith('172.22.') || ip.startsWith('172.23.') ||
      ip.startsWith('172.24.') || ip.startsWith('172.25.') ||
      ip.startsWith('172.26.') || ip.startsWith('172.27.') ||
      ip.startsWith('172.28.') || ip.startsWith('172.29.') ||
      ip.startsWith('172.30.') || ip.startsWith('172.31.') || // Private class B (172.16.0.0/12)
      ip.startsWith('192.168.') || // Private class C
      ip.startsWith('169.254.')) { // Link-local
    return true;
  }
  return false;
}

// Helper function to resolve hostname using external DNS (bypasses /etc/hosts)
async function resolveExternalIP(hostname) {
  const dns = require('dns');
  
  // Try to resolve using external DNS servers (Google DNS)
  // This bypasses local /etc/hosts and local DNS that might resolve to localhost
  return new Promise((resolve, reject) => {
    const resolver = new dns.Resolver();
    // Use external DNS servers
    resolver.setServers(['8.8.8.8', '8.8.4.4', '1.1.1.1']); // Google DNS, Cloudflare DNS
    
    resolver.resolve4(hostname, (err, addresses) => {
      if (err) {
        // Fallback to system DNS if external DNS fails
        dns.resolve4(hostname, (err2, addresses2) => {
          if (err2) reject(err2);
          else resolve(addresses2);
        });
      } else {
        resolve(addresses);
      }
    });
  });
}

// Helper function to manually measure latency via external route
// Forces external routing by binding to a non-loopback interface and using external DNS
async function measureLatency(host, port, timeout = 5000) {
  const net = require('net');
  
  return new Promise(async (resolve, reject) => {
    try {
      // Resolve hostname using external DNS to get the actual public IP
      // This bypasses /etc/hosts and local DNS that might resolve to localhost
      let externalIPs;
      try {
        externalIPs = await resolveExternalIP(host);
      } catch (dnsError) {
        // If external DNS fails, try regular DNS resolution
        const dns = require('dns');
        const addresses = await new Promise((resolveDNS, rejectDNS) => {
          dns.lookup(host, { all: true }, (err, addresses) => {
            if (err) rejectDNS(err);
            else resolveDNS(addresses);
          });
        });
        externalIPs = addresses.map(a => a.address);
      }
      
      // Filter out private/internal IP addresses to force external route
      const publicIPs = externalIPs.filter(ip => !isPrivateIP(ip));
      
      if (publicIPs.length === 0) {
        // If no public IP found, reject - we can't measure external latency
        reject(new Error(`Host ${host} resolves only to private/internal IPs. Cannot measure external latency.`));
        return;
      }
      
      // Use the first public IP address
      const targetHost = publicIPs[0];
      
      console.log(`[MC-Ping] Resolved ${host} to external IP: ${targetHost}`);
      
      // Check if this IP is one of our own IPs (same server)
      const ownIPs = getAllExternalInterfaceIPs();
      const isOwnIPAddress = isOwnIP(targetHost);
      
      console.log(`[MC-Ping] Server's network interfaces: ${ownIPs.join(', ') || 'none'}`);
      console.log(`[MC-Ping] Target IP is server's own IP: ${isOwnIPAddress}`);
      
      // Get a non-loopback local interface to bind to (forces external routing)
      const localBindIP = getExternalInterfaceIP();
      
      const socket = new net.Socket();
      const startTime = Date.now();
      
      socket.setTimeout(timeout);
      
      socket.on('connect', () => {
        const measuredLatency = Date.now() - startTime;
        socket.destroy();
        
        // If latency is suspiciously low (< 10ms) and we're connecting to a public IP,
        // it's likely still routing internally (same server or same network)
        if (measuredLatency < 10 && !isOwnIPAddress) {
          console.warn(`[MC-Ping] Very low latency (${measuredLatency}ms) to public IP ${targetHost}. This likely indicates internal routing despite external IP.`);
        }
        
        resolve(measuredLatency);
      });
      
      socket.on('error', (err) => {
        socket.destroy();
        reject(new Error(`Connection failed: ${err.message}`));
      });
      
      socket.on('timeout', () => {
        socket.destroy();
        reject(new Error('Connection timeout'));
      });
      
      // Connect using localAddress option to force external interface (forces external route)
      if (localBindIP) {
        socket.connect({
          port: port,
          host: targetHost,
          localAddress: localBindIP
        });
      } else {
        // If no external interface found, connect without binding (fallback)
        socket.connect(port, targetHost);
      }
      
      // If we detect it's our own IP after connection, we can still reject it
      // But let's try the connection first to see actual latency
    } catch (error) {
      reject(new Error(`Failed to measure latency: ${error.message}`));
    }
  });
}

// Query Protocol function to get full stats (player list, plugins, map name, etc.)
async function queryServerFullStats(host, port = 25565, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const dgram = require('dgram');
    const client = dgram.createSocket('udp4');
    const challengeToken = Math.floor(Math.random() * 2147483647);
    
    let sessionId = Math.floor(Math.random() * 2147483647);
    let handshakeReceived = false;
    const timeoutHandle = setTimeout(() => {
      client.close();
      reject(new Error('Query timeout'));
    }, timeout);
    
    function parseKeyValuePairs(data, offset) {
      const result = {};
      let pos = offset;
      
      while (pos < data.length && data[pos] !== 0) {
        // Find null terminator for key
        const keyEnd = data.indexOf(0, pos);
        if (keyEnd === -1 || keyEnd >= data.length) break;
        const key = data.slice(pos, keyEnd).toString('utf8');
        pos = keyEnd + 1;
        
        // Find null terminator for value
        if (pos >= data.length || data[pos] === 0) break;
        const valueEnd = data.indexOf(0, pos);
        if (valueEnd === -1 || valueEnd >= data.length) break;
        const value = data.slice(pos, valueEnd).toString('utf8');
        pos = valueEnd + 1;
        
        result[key] = value;
      }
      
      return { result, offset: pos };
    }
    
    client.on('message', (msg, rinfo) => {
      clearTimeout(timeoutHandle);
      
      try {
        const type = msg.readInt32BE(0);
        const sessionIdReceived = msg.readInt32BE(4);
        
        if (sessionIdReceived !== sessionId) {
          client.close();
          reject(new Error('Session ID mismatch'));
          return;
        }
        
        if (type === 9 && !handshakeReceived) {
          // Handshake response - get challenge token (4-byte integer)
          const challengeToken = msg.readInt32BE(8);
          
          handshakeReceived = true;
          
          // Send full stats request
          const fullStatsRequest = Buffer.alloc(15);
          fullStatsRequest.writeInt32BE(0, 0); // Type: Query
          fullStatsRequest.writeInt32BE(sessionId, 4);
          fullStatsRequest.writeInt32BE(challengeToken, 8);
          fullStatsRequest.writeInt32BE(0, 12); // Padding
          
          client.send(fullStatsRequest, port, host, (err) => {
            if (err) {
              client.close();
              reject(err);
            }
          });
        } else if (type === 0 && handshakeReceived) {
          // Full stats response
          let offset = 16; // Skip header (type, session ID, padding)
          
          // Parse key-value pairs for server info
          const { result: serverInfo, offset: newOffset } = parseKeyValuePairs(msg, offset);
          offset = newOffset;
          
          // Skip the null byte that separates server info from player list
          if (offset < msg.length && msg[offset] === 0) {
            offset += 1;
          }
          
          // Parse players list
          const playersList = [];
          while (offset < msg.length) {
            if (msg[offset] === 0) break; // End of player list
            const playerEnd = msg.indexOf(0, offset);
            if (playerEnd === -1) break;
            const playerName = msg.slice(offset, playerEnd).toString('utf8');
            if (!playerName || playerName.length === 0) break;
            playersList.push(playerName);
            offset = playerEnd + 1;
          }
          
          client.close();
          
          resolve({
            hostname: serverInfo.hostname || null,
            gametype: serverInfo.gametype || null,
            game_id: serverInfo.game_id || null,
            version: serverInfo.version || null,
            plugins: serverInfo.plugins || null,
            map: serverInfo.map || null,
            numplayers: parseInt(serverInfo.numplayers) || 0,
            maxplayers: parseInt(serverInfo.maxplayers) || 0,
            hostport: serverInfo.hostport || null,
            hostip: serverInfo.hostip || null,
            players: playersList
          });
        }
      } catch (error) {
        client.close();
        reject(error);
      }
    });
    
    client.on('error', (err) => {
      clearTimeout(timeoutHandle);
      client.close();
      reject(err);
    });
    
    // Send handshake
    const handshake = Buffer.alloc(9);
    handshake.writeInt32BE(9, 0); // Type: Handshake
    handshake.writeInt32BE(sessionId, 4);
    handshake.writeUInt8(0, 8); // Padding
    
    client.send(handshake, port, host, (err) => {
      if (err) {
        clearTimeout(timeoutHandle);
        client.close();
        reject(err);
      }
    });
  });
}

// Custom query function to get modpack info using correct protocol version
async function queryServerWithModpack(host, port = 25565, protocolVersion = 127) {
  const net = require('net');
  const crypto = require('crypto');
  
  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    socket.setTimeout(10000);
    
    let storedResponse = null;
    let pingStart = null;
    const payload = crypto.randomBytes(8);
    let payloadValue = null;
    
    function writeVarInt(value) {
      const result = [];
      while (true) {
        if ((value & ~0x7F) === 0) {
          result.push(value);
          break;
        }
        result.push((value & 0x7F) | 0x80);
        value >>>= 7;
      }
      return Buffer.from(result);
    }
    
    function writeString(str) {
      const strBuf = Buffer.from(str, 'utf8');
      return Buffer.concat([writeVarInt(strBuf.length), strBuf]);
    }
    
    socket.on('connect', () => {
      // Handshake packet with correct protocol version
      const handshake = Buffer.concat([
        writeVarInt(0x00), // Packet ID
        writeVarInt(protocolVersion), // Protocol version (127 for 1.21.1)
        writeString(host), // Server address
        Buffer.from([port >> 8, port & 0xFF]), // Port
        writeVarInt(1) // Next state: status
      ]);
      const handshakeLength = Buffer.concat([writeVarInt(handshake.length), handshake]);
      socket.write(handshakeLength);
      
      // Request status packet
      const request = writeVarInt(0x00); // Request packet ID
      const requestLength = Buffer.concat([writeVarInt(request.length), request]);
      socket.write(requestLength);
    });
    
    let buffer = Buffer.alloc(0);
    let gotStatus = false;
    
    socket.on('data', (data) => {
      buffer = Buffer.concat([buffer, data]);
      
      try {
        let offset = 0;
        
        function readVarInt() {
          let value = 0;
          let shift = 0;
          while (offset < buffer.length) {
            const byte = buffer[offset++];
            value |= (byte & 0x7F) << shift;
            if ((byte & 0x80) === 0) return value;
            shift += 7;
            if (shift >= 32) throw new Error('VarInt too large');
          }
          return null;
        }
        
        function readString() {
          const length = readVarInt();
          if (length === null || length < 0 || length > 32767) return null;
          if (offset + length > buffer.length) return null;
          const str = buffer.slice(offset, offset + length).toString('utf8');
          offset += length;
          return str;
        }
        
        function readInt64BE() {
          if (offset + 8 > buffer.length) return null;
          const value = buffer.readBigInt64BE(offset);
          offset += 8;
          return value;
        }
        
        function readInt64BEFromBuffer(buf, off) {
          if (off + 8 > buf.length) return null;
          return buf.readBigInt64BE(off);
        }
        
        if (!gotStatus) {
          // Read status response packet
          // First, check if we have enough data for packet length
          if (buffer.length < 1) return; // Need at least 1 byte for VarInt
          
          offset = 0;
          const packetLength = readVarInt();
          if (packetLength === null || packetLength < 0) {
            // Not enough data yet, wait for more
            return;
          }
          
          // Check if we have the complete packet
          if (buffer.length < offset + packetLength) {
            // Need more data
            return;
          }
          
          const packetId = readVarInt();
          if (packetId === 0x00) {
            // Status response - read the JSON string
            const jsonStr = readString();
            if (jsonStr) {
              try {
                storedResponse = JSON.parse(jsonStr);
                
                // Log full response structure for debugging modpack info
                console.log('=== Full Server Response ===');
                console.log('Keys:', Object.keys(storedResponse));
                // Save full response to file for inspection
                const fullJson = JSON.stringify(storedResponse, null, 2);
                require('fs').writeFileSync('/tmp/mc-server-response.json', fullJson);
                console.log('Full response saved to /tmp/mc-server-response.json');
                console.log('Full JSON length:', fullJson.length, 'chars');
                
                // Check for Better Compatibility Checker data
                // It might be in modinfo, description, or a custom field
                if (storedResponse.modinfo) {
                  console.log('modinfo structure:', JSON.stringify(storedResponse.modinfo).substring(0, 500));
                }
                if (storedResponse.description) {
                  const descStr = typeof storedResponse.description === 'string' 
                    ? storedResponse.description 
                    : JSON.stringify(storedResponse.description);
                  console.log('Description:', descStr.substring(0, 500));
                }
                
                gotStatus = true;
                
                // Send ping packet immediately after getting status
                pingStart = Date.now();
                payloadValue = payload.readBigInt64BE(0);
                const payloadBuffer = Buffer.allocUnsafe(8);
                payloadBuffer.writeBigInt64BE(payloadValue, 0);
                const pingPacket = Buffer.concat([
                  writeVarInt(0x01), // Ping packet ID
                  payloadBuffer
                ]);
                const pingLength = Buffer.concat([writeVarInt(pingPacket.length), pingPacket]);
                socket.write(pingLength);
                
                // Clear buffer for next packet - reset to empty since we've processed the status packet
                buffer = Buffer.alloc(0);
              } catch (parseError) {
                console.error('Parse error:', parseError.message);
                console.error('JSON string:', jsonStr?.substring(0, 200));
                socket.destroy();
                reject(new Error(`Failed to parse JSON: ${parseError.message}`));
              }
            } else {
              // No JSON string read, might be incomplete packet
              return;
            }
          } else {
            // Unexpected packet ID
            socket.destroy();
            reject(new Error(`Unexpected packet ID: ${packetId}, expected 0x00`));
          }
        } else if (pingStart !== null) {
          // Read pong packet
          // First check if we have enough data
          if (buffer.length < 1) return;
          
          offset = 0;
          const packetLength = readVarInt();
          if (packetLength === null || packetLength < 0) {
            // Not enough data yet
            return;
          }
          
          // Check if we have the complete packet
          if (buffer.length < offset + packetLength) {
            // Need more data
            return;
          }
          
          const packetId = readVarInt();
          if (packetId === 0x01) {
            const receivedPayload = readInt64BE();
            const sentPayload = payloadValue;
            if (receivedPayload !== null && receivedPayload === sentPayload) {
              const latency = Date.now() - pingStart;
              socket.destroy();
              
              // Parse modpack info from stored response
              // NeoForge/Forge may send modinfo in different formats or field names
              let modpackInfo = null;
              
              // Check various possible locations for modpack info
              const modInfo = storedResponse.modinfo || storedResponse.forgeData?.mods || storedResponse.neoforge?.mods || null;
              
              if (modInfo || storedResponse.isModded) {
                // Extract mod list from various possible structures
                let modList = [];
                if (modInfo) {
                  if (modInfo.modList) {
                    modList = modInfo.modList;
                  } else if (Array.isArray(modInfo)) {
                    modList = modInfo;
                  } else if (modInfo.mods && Array.isArray(modInfo.mods)) {
                    modList = modInfo.mods;
                  }
                }
                
                // If we have a modded server but no mod list, still show it's modded
                if (modList.length > 0 || storedResponse.isModded) {
                  // NeoForge/Forge sends modpack info in modinfo
                  // Check for modpack identifier - often in a specific mod or metadata
                  let modpackName = null;
                  let modpackVersion = null;
                  
                  // Some modpacks have a special mod that identifies the pack
                  // Check first few mods for common modpack identifiers
                  for (const mod of modList.slice(0, 10)) {
                    const modId = (mod.modId || mod.id || '').toLowerCase();
                    // Common modpack identifier patterns
                    if (modId.includes('pack') || modId.includes('modpack') || modId.includes('core')) {
                      modpackName = modId;
                      modpackVersion = mod.version || null;
                      break;
                    }
                  }
                  
                  // If not found, use first mod as fallback or check description
                  if (!modpackName && modList.length > 0) {
                    const firstMod = modList[0];
                    modpackName = firstMod.modId || firstMod.id || 'Unknown Modpack';
                  }
                  
                  // Check description for modpack name
                  const desc = storedResponse.description;
                  if (desc) {
                    const descText = typeof desc === 'string' 
                      ? desc 
                      : (Array.isArray(desc) 
                          ? desc.map(e => typeof e === 'string' ? e : e?.text || '').join(' ')
                          : desc.text || '');
                    
                    // Try to extract modpack name/version from description
                    const modpackMatch = descText.match(/([A-Za-z0-9\s]+)\s*(?:v|version)?\s*([0-9.]+)/i);
                    if (modpackMatch && !modpackName) {
                      modpackName = modpackMatch[1].trim();
                      modpackVersion = modpackMatch[2] || modpackVersion;
                    }
                  }
                  
                  modpackInfo = {
                    type: (modInfo && modInfo.type) || (storedResponse.modinfo?.type) || 'NEOFORGE',
                    modCount: modList.length || (storedResponse.isModded ? 'Unknown' : 0),
                    name: modpackName || (storedResponse.isModded ? 'Modded Server' : 'Unknown'),
                    version: modpackVersion || null,
                    mods: modList.length > 0 ? modList.slice(0, 15).map(mod => ({
                      id: mod.modId || mod.id || 'unknown',
                      version: mod.version || 'unknown'
                    })) : []
                  };
                }
              }
              
              
              resolve({
                version: storedResponse.version?.name || 'Unknown',
                protocolVersion: storedResponse.version?.protocol || null,
                players: {
                  online: storedResponse.players?.online || 0,
                  max: storedResponse.players?.max || 0,
                  sample: storedResponse.players?.sample?.map(p => {
                    // If player is an object with id/uuid, preserve it; otherwise convert to string
                    if (typeof p === 'object' && p !== null) {
                      return p; // Keep full object with id and name
                    }
                    return typeof p === 'string' ? p : String(p);
                  }) || []
                },
                description: typeof storedResponse.description === 'string' 
                  ? storedResponse.description 
                  : (Array.isArray(storedResponse.description) 
                      ? storedResponse.description.map((e) => typeof e === 'string' ? e : (e?.text || '')).join(' ')
                      : (storedResponse.description?.text || JSON.stringify(storedResponse.description))),
                favicon: storedResponse.favicon || null,
                latency: latency,
                modpack: modpackInfo,
                isModded: storedResponse.isModded || false,
                preventsChatReports: storedResponse.preventsChatReports || false
              });
            } else {
              socket.destroy();
              reject(new Error('Ping payload mismatch'));
            }
          }
        }
      } catch (error) {
        // Only reject on real errors, not incomplete packets
        if (!error.message.includes('null') && !error.message.includes('packetLength') && !error.message.includes('length')) {
          socket.destroy();
          reject(error);
        }
      }
    });
    
    socket.on('error', (error) => {
      reject(error);
    });
    
    socket.on('timeout', () => {
      socket.destroy();
      reject(new Error('Connection timeout'));
    });
    
    socket.connect(port, host);
  });
}

// Helper function to try multiple connection methods
async function queryServerStatus() {
  const options = {
    timeout: 10000,
    enableSRV: false
  };

  // Try custom query with modpack support first (uses correct protocol version)
  let statusResponse = null;
  try {
    statusResponse = await Promise.race([
      queryServerWithModpack(MINECRAFT_SERVER_HOST, MINECRAFT_SERVER_PORT, 127),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 8000))
    ]);
    
    // IMPORTANT: Store original player sample with UUIDs before Query Protocol potentially overwrites it
    const originalPlayerSample = statusResponse.players.sample;
    const hasPlayerUuids = originalPlayerSample && originalPlayerSample.some(p => typeof p === 'object' && p !== null && (p.id || p.uuid));
    
    // Try to get Query Protocol data using library (doesn't block if it fails)
    // Try external hostname first (works with UDP firewall), then fallback to localhost
    let queryData = null;
    const queryHosts = [MINECRAFT_SERVER_HOST, '127.0.0.1', 'localhost'];
    for (const queryHost of queryHosts) {
      try {
        queryData = await Promise.race([
          queryFull(queryHost, MINECRAFT_QUERY_PORT, { timeout: 8000 }),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Query timeout')), 8000))
        ]);
        console.log(`✅ Query Protocol success on ${queryHost}!`);
        break; // Success, exit loop
      } catch (queryError) {
        // Try next host silently unless it's the last one
        if (queryHost === queryHosts[queryHosts.length - 1]) {
          console.log(`Query Protocol failed on all hosts. Last error on ${queryHost}:`, queryError.message);
        }
      }
    }
    
    if (queryData) {
      try {
      
        console.log('Query Protocol success! Data received:', Object.keys(queryData));
        
        // Merge query player list with status response
        // Important: Preserve UUIDs from status response if available
        if (queryData && queryData.players && queryData.players.list && queryData.players.list.length > 0) {
          if (hasPlayerUuids && originalPlayerSample) {
            // We have UUID objects from status response - match them with query player names
            const playerMap = new Map();
            originalPlayerSample.forEach(p => {
              if (typeof p === 'object' && p !== null) {
                const name = String(p.name || p.id || '').toLowerCase().trim();
                if (name) playerMap.set(name, p);
              }
            });
            
            // Create merged list preserving UUIDs
            const mergedSample = queryData.players.list.map(playerName => {
              const playerNameLower = String(playerName).toLowerCase().trim();
              const playerObj = playerMap.get(playerNameLower);
              if (playerObj) {
                console.log(`Matched player ${playerName} with UUID ${playerObj.id || playerObj.uuid}`);
                return playerObj; // Use object with UUID
              }
              console.log(`No UUID found for player ${playerName}, using string`);
              return playerName; // Fallback to string
            });
            
            statusResponse.players = {
              ...statusResponse.players,
              fullList: queryData.players.list,
              sample: mergedSample
            };
          } else {
            // No UUIDs in status response, just use query list
            statusResponse.players = {
              ...statusResponse.players,
              fullList: queryData.players.list,
              sample: queryData.players.list
            };
          }
        }
        
        // Add query data (library returns: map, plugins, software, hostIP, hostPort, motd)
        statusResponse.query = {
          map: queryData.map || null,
          plugins: queryData.plugins && queryData.plugins.length > 0 
            ? (typeof queryData.plugins === 'string' ? queryData.plugins : queryData.plugins.join(', '))
            : null,
          gametype: queryData.software || queryData.gameType || queryData.gametype || null,
          hostname: queryData.hostIP || queryData.hostName || queryData.hostname || null,
          hostport: queryData.hostPort || null,
          motdHtml: queryData.motd?.html || null,
          motdClean: queryData.motd?.clean || null
        };
        
        console.log('Query data added:', statusResponse.query);
      } catch (parseError) {
        console.log('Error parsing query data:', parseError.message);
      }
    } else {
      // All hosts failed
      console.log('Query Protocol not available - tried:', queryHosts.join(', '));
      console.log('Note: Make sure enable-query=true in server.properties, server is restarted, and UDP port is open');
    }
    
    return {
      online: true,
      ...statusResponse
    };
  } catch (error) {
    console.log('Custom query failed:', error.message);
    // Fall through to library methods
  }

  // Try modern status from library (may have modpack info but might fail)
  try {
    const response = await status(MINECRAFT_SERVER_HOST, MINECRAFT_SERVER_PORT, options);
    
    let modpackInfo = null;
    // Library doesn't expose modinfo, so we'll try custom query first
    
    return {
      online: true,
      version: response.version?.name || 'Unknown',
      protocolVersion: response.version?.protocol || null,
      players: {
        online: response.players?.online || 0,
        max: response.players?.max || 0,
        sample: response.players?.sample || []
      },
      description: response.motd?.clean || response.motd?.raw || null,
      favicon: response.favicon || null,
      latency: response.roundTripLatency || 0,
      modpack: modpackInfo
    };
  } catch (error) {
    console.log('Modern status failed, trying legacy...', error.message);
    
    // Try legacy status as fallback with manual latency measurement
    try {
      const startTime = Date.now();
      const response = await statusLegacy(MINECRAFT_SERVER_HOST, MINECRAFT_SERVER_PORT, options);
      
      // Measure actual network latency separately
      let networkLatency = 0;
      try {
        networkLatency = await measureLatency(MINECRAFT_SERVER_HOST, MINECRAFT_SERVER_PORT, 5000);
      } catch (e) {
        // If direct latency measurement fails, use the time difference as fallback
        networkLatency = Date.now() - startTime;
      }
      
      return {
        online: true,
        version: response.version?.name || 'Unknown',
        protocolVersion: response.version?.protocol || null,
        players: {
          online: response.players?.online || 0,
          max: response.players?.max || 0,
          sample: []
        },
        description: response.motd?.clean || response.motd?.raw || null,
        favicon: null,
        latency: networkLatency,
        modpack: null
      };
    } catch (legacyError) {
      throw new Error(`All connection methods failed. Last error: ${legacyError.message}`);
    }
  }
}

// API endpoint to check server status
app.get('/api/status', async (req, res) => {
  try {
    const data = await queryServerStatus();
    
    // Read modpack info from TOML config file
    const tomlModpackInfo = readModpackConfig();
    
    // Merge TOML modpack info with server response modpack info
    // TOML info takes precedence for name, version, and projectID
    if (tomlModpackInfo) {
      if (data.modpack) {
        // Merge with existing modpack info, overriding with TOML values
        data.modpack = {
          ...data.modpack,
          name: tomlModpackInfo.modpackName || data.modpack.name,
          version: tomlModpackInfo.modpackVersion || data.modpack.version,
          projectID: tomlModpackInfo.modpackProjectID || null
        };
      } else if (tomlModpackInfo.modpackName) {
        // Create modpack info object if it doesn't exist but we have TOML data
        data.modpack = {
          type: 'Unknown',
          name: tomlModpackInfo.modpackName,
          version: tomlModpackInfo.modpackVersion,
          projectID: tomlModpackInfo.modpackProjectID,
          modCount: null,
          mods: []
        };
      }
    }
    
    // Add Dynmap URL if configured
    if (DYNMAP_URL) {
      data.dynmapUrl = DYNMAP_URL;
    }
    
    res.json(data);
  } catch (error) {
    console.error('Error querying Minecraft server:', error.message);
    
    // Try to include modpack info even if server is offline
    const tomlModpackInfo = readModpackConfig();
    const modpackInfo = tomlModpackInfo && tomlModpackInfo.modpackName ? {
      type: 'Unknown',
      name: tomlModpackInfo.modpackName,
      version: tomlModpackInfo.modpackVersion,
      projectID: tomlModpackInfo.modpackProjectID,
      modCount: null,
      mods: []
    } : null;
    
    res.json({
      online: false,
      error: error.message,
      version: null,
      players: {
        online: 0,
        max: 0,
        sample: []
      },
      description: null,
      favicon: null,
      latency: null,
      modpack: modpackInfo
    });
  }
});

// Ping Minecraft server via external route and return latency
// This measures the actual network latency that external clients would experience
app.get('/api/mc-ping', async (req, res) => {
  try {
    // Get the external interface IP for logging
    const bindIP = getExternalInterfaceIP();
    console.log(`[MC-Ping] Measuring latency to ${MINECRAFT_SERVER_HOST}:${MINECRAFT_SERVER_PORT}`);
    if (bindIP) {
      console.log(`[MC-Ping] Binding to external interface: ${bindIP}`);
    } else {
      console.log(`[MC-Ping] Warning: No external interface found, using default routing`);
    }
    
    // Try multi-strategy measurement first (more accurate when servers are on same machine)
    const multiStrategy = require('./server/latency-measurement');
    let multiResult = null;
    try {
      multiResult = await multiStrategy.measureLatencyMultiStrategy(
        MINECRAFT_SERVER_HOST, 
        MINECRAFT_SERVER_PORT, 
        5000
      );
    } catch (e) {
      console.log(`[MC-Ping] Multi-strategy measurement failed: ${e.message}`);
    }
    
    // Also try direct measurement
    let directLatency = null;
    try {
      directLatency = await measureLatency(MINECRAFT_SERVER_HOST, MINECRAFT_SERVER_PORT, 5000);
      console.log(`[MC-Ping] Direct measurement: ${directLatency}ms`);
    } catch (e) {
      console.log(`[MC-Ping] Direct measurement failed: ${e.message}`);
    }
    
    // Choose the best measurement
    let finalLatency = null;
    let method = 'direct';
    
    if (multiResult && multiResult.latency) {
      // If multi-strategy found a result and it's reasonable (> 10ms), use it
      if (multiResult.latency >= 10) {
        finalLatency = multiResult.latency;
        method = `multi-strategy (${multiResult.confidence})`;
      } else if (directLatency && directLatency >= 10) {
        // Use direct if it's reasonable
        finalLatency = directLatency;
        method = 'direct';
      } else {
        // Both are low - likely internal routing
        finalLatency = multiResult.latency || directLatency;
        method = multiResult ? 'multi-strategy (likely internal)' : 'direct (likely internal)';
      }
    } else if (directLatency) {
      finalLatency = directLatency;
      method = 'direct';
    } else {
      throw new Error('All measurement methods failed');
    }
    
    console.log(`[MC-Ping] Final latency: ${finalLatency}ms (method: ${method})`);
    
    // If latency is suspiciously low (< 10ms), it's likely internal routing
    // In this case, we should indicate that client-side measurement would be more accurate
    if (finalLatency < 10) {
      console.warn(`[MC-Ping] Warning: Very low latency (${finalLatency}ms) detected. This likely indicates internal routing.`);
      console.warn(`[MC-Ping] Client will automatically fall back to browser-based measurement for accurate external latency.`);
      
      // Return a special flag indicating internal routing detected - client should use its own measurement
      res.json({ 
        latency: finalLatency,
        success: true,
        warning: 'internal_routing',
        useClientMeasurement: true,  // Explicit flag for client to use its own measurement
        method: method,
        multiStrategyResult: multiResult
      });
    } else {
      res.json({ 
        latency: finalLatency,
        success: true,
        method: method,
        multiStrategyResult: multiResult
      });
    }
  } catch (error) {
    // If ping fails, return error (server might be offline or unreachable externally)
    console.error(`[MC-Ping] Failed: ${error.message}`);
    res.status(500).json({ 
      latency: null,
      success: false,
      error: error.message 
    });
  }
});

// Legacy ping endpoint (kept for backward compatibility, but not used for latency display)
app.get('/api/ping', (req, res) => {
  res.json({ ping: true });
});

// Client configuration endpoint (exposes only safe values)
app.get('/api/client-config', (req, res) => {
  const { client } = require('./server/config');
  res.json(client);
});

// Diagnostic endpoint for BlueMap snapshot system
app.get('/api/bluemap-diagnostic', (req, res) => {
  const fs = require('fs');
  const path = require('path');
  const cfg = require('./server/config');
  
  const diagnostic = {
    configured: true,
    issues: [],
    info: {},
    status: 'unknown'
  };
  
  // Check configuration
  if (!cfg.bluemapUrl) {
    diagnostic.issues.push('BLUEMAP_URL is not configured');
    diagnostic.configured = false;
  } else {
    diagnostic.info.bluemapUrl = cfg.bluemapUrl;
  }
  
  diagnostic.info.snapshotInterval = cfg.snapshotEveryMs;
  diagnostic.info.snapshotDir = cfg.snapshotDir;
  diagnostic.info.snapshotFile = cfg.snapshotFileName;
  diagnostic.info.chromiumPath = cfg.chromiumPath || 'using bundled Chromium';
  
  // Check if puppeteer is available
  try {
    const useCore = !!cfg.chromiumPath;
    if (useCore) {
      require('puppeteer-core');
      diagnostic.info.puppeteerMode = 'puppeteer-core';
    } else {
      require('puppeteer');
      diagnostic.info.puppeteerMode = 'puppeteer (bundled)';
    }
  } catch (e) {
    diagnostic.issues.push(`Puppeteer not available: ${e.message}`);
    diagnostic.configured = false;
  }
  
  // Check directory permissions
  const snapshotDir = cfg.snapshotDir;
  try {
    if (!fs.existsSync(snapshotDir)) {
      fs.mkdirSync(snapshotDir, { recursive: true });
      diagnostic.info.directoryCreated = true;
    }
    
    const testFile = path.join(snapshotDir, '.write-test');
    fs.writeFileSync(testFile, 'test');
    fs.unlinkSync(testFile);
    diagnostic.info.directoryWritable = true;
  } catch (e) {
    diagnostic.issues.push(`Cannot write to snapshot directory: ${e.message}`);
    diagnostic.configured = false;
  }
  
  // Check if snapshot file exists
  const snapshotFile = path.join(snapshotDir, cfg.snapshotFileName);
  if (fs.existsSync(snapshotFile)) {
    const stats = fs.statSync(snapshotFile);
    diagnostic.info.snapshotExists = true;
    diagnostic.info.snapshotSize = stats.size;
    diagnostic.info.snapshotModified = stats.mtime.toISOString();
    diagnostic.status = 'active';
  } else {
    diagnostic.info.snapshotExists = false;
    diagnostic.status = 'no-snapshot-yet';
  }
  
  if (diagnostic.issues.length === 0 && diagnostic.configured) {
    diagnostic.status = 'ok';
  } else {
    diagnostic.status = 'error';
  }
  
  res.json(diagnostic);
});

// Serve the main page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Checking Minecraft server: ${MINECRAFT_SERVER_HOST}:${MINECRAFT_SERVER_PORT}`);
});

// Start BlueMap snapshot scheduler (best-effort)
try {
  const { startScheduler } = require('./server/bluemap-snapshot');
  const cfg = require('./server/config');
  
  // Log configuration for debugging
  console.log('BlueMap snapshot configuration:');
  console.log('  - URL:', cfg.bluemapUrl);
  console.log('  - Interval:', cfg.snapshotEveryMs, 'ms (' + (cfg.snapshotEveryMs / 1000 / 60).toFixed(1), 'minutes)');
  console.log('  - Output directory:', cfg.snapshotDir);
  console.log('  - Output file:', cfg.snapshotFileName);
  console.log('  - Chromium path:', cfg.chromiumPath || 'using bundled Chromium');
  
  startScheduler();
  console.log('✓ BlueMap snapshot scheduler started successfully.');
  console.log('  First snapshot will be taken in 30 seconds...');
} catch (e) {
  console.error('✗ BlueMap snapshot scheduler failed to start!');
  console.error('  Error:', e.message);
  console.error('  Stack:', e.stack);
  console.error('');
  console.error('Common issues:');
  console.error('  1. Puppeteer/Chromium not installed - run: npm install');
  console.error('  2. Missing system dependencies - may need libnss3, libatk, etc.');
  console.error('  3. If using puppeteer-core, set CHROMIUM_PATH environment variable');
  console.error('  4. Check BlueMap URL is accessible from this server');
  console.error('  5. Ensure cache directory is writable:', require('./server/config').snapshotDir);
}

