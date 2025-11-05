# Minecraft Server Status Checker

A comprehensive web application for monitoring your Minecraft server status with integrated BlueMap visualization. Features real-time server information, player tracking, and interactive map exploration.

## Features

### Server Information
- ✅ **Server Status** - Real-time online/offline detection with visual indicators
- ✅ **Version Information** - Displays Minecraft server version and mod loader type (Forge/NeoForge/Fabric)
- ✅ **Player Count** - Shows current online players and maximum capacity
- ✅ **Server Description** - Displays MOTD (Message of the Day)
- ✅ **Server Favicon** - Shows server icon when available
- ✅ **Player List** - Lists all currently online players (when available)
- ✅ **Modpack Information** - Displays modpack name, version, and project ID (from TOML config or server response)

### Latency & Performance
- ✅ **Client-Side Latency** - Measures latency from your browser to the Minecraft server (not just server-to-server)
- ✅ **Real-Time Updates** - Auto-refresh every 30 seconds
- ✅ **Manual Refresh** - Click button to instantly check server status

### BlueMap Integration
- ✅ **Cached Background** - Fast-loading cached screenshot of BlueMap as page background
- ✅ **Automatic Snapshots** - Automatically captures and updates BlueMap screenshots (configurable interval)
- ✅ **Interactive Exploration** - "EXPLORE" button to view live BlueMap with full UI
- ✅ **Seamless Transitions** - Smooth dissolve effects when switching between stats and map views
- ✅ **UI Control** - Automatically hides UI elements in cached snapshots for clean backgrounds

### Design & UX
- ✅ **Responsive Design** - Works on desktop, tablet, and mobile devices
- ✅ **Modern UI** - Clean, Minecraft-themed interface with smooth animations
- ✅ **Sound Effects** - Audio feedback for button interactions
- ✅ **Accessibility** - Proper contrast and readable fonts

## Setup

### Prerequisites
- Node.js (v14 or higher)
- npm
- Access to your Minecraft server
- (Optional) BlueMap installation for map features
- (Optional) Puppeteer-compatible Chromium for BlueMap snapshots

### Installation

1. **Clone or download this repository**

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Configure your server:**
   
   All configuration is centralized in `server/config.js` and can be overridden with environment variables:
   
   ```bash
   # Minecraft Server Configuration
   export MC_SERVER_HOST="play.milan.deviance.rehab"
   export MC_SERVER_PORT=25565
   export MC_QUERY_PORT=25565
   
   # Modpack Configuration (Pterodactyl path)
   export MODPACK_CONFIG_PATH="/var/lib/pterodactyl/volumes/.../config/bcc-common.toml"
   
   # BlueMap Configuration
   export BLUEMAP_URL="https://your-domain.com/map/#world:..."
   export BLUEMAP_SNAPSHOT_EVERY_MS=180000  # 3 minutes
   export BLUEMAP_SNAPSHOT_FILE="bluemap-1920x1080.jpg"
   
   # Client Configuration
   export DISPLAY_HOSTNAME="play.milan.deviance.rehab"
   export PAGE_TITLE="Minecraft Server Status"
   
   # Optional: Chromium path for puppeteer-core
   export CHROMIUM_PATH="/usr/bin/chromium-browser"
   
   # Optional: Dynmap URL
   export DYNMAP_URL="http://your-domain.com:8123"
   ```

4. **Start the server:**
   ```bash
   npm start
   ```

5. **Open your browser:**
   Navigate to `http://localhost:3000` (or your configured PORT)

## Configuration

### Centralized Configuration

All configuration values are managed in `server/config.js`. This file:
- Reads from environment variables with sensible defaults
- Exposes server configuration to the backend
- Provides client-safe configuration via `/api/client-config` endpoint

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `MC_SERVER_HOST` | Minecraft server hostname/IP | `play.milan.deviance.rehab` |
| `MC_SERVER_PORT` | Minecraft server port | `25565` |
| `MC_QUERY_PORT` | Query protocol port | `25565` |
| `MODPACK_CONFIG_PATH` | Path to modpack TOML config | (see config.js) |
| `BLUEMAP_URL` | BlueMap URL for snapshots | (see config.js) |
| `BLUEMAP_SNAPSHOT_EVERY_MS` | Snapshot interval (ms) | `180000` (3 min) |
| `DISPLAY_HOSTNAME` | Hostname shown on page | `play.milan.deviance.rehab` |
| `PAGE_TITLE` | Browser page title | `Minecraft Server Status` |
| `PORT` | Web server port | `3000` |
| `CHROMIUM_PATH` | Path to Chromium (optional) | `null` |
| `DYNMAP_URL` | Dynmap URL (optional) | `null` |

### Modpack Configuration

The application reads modpack information from a TOML configuration file (typically in Pterodactyl volume). The file should have a `[general]` section with:

```toml
[general]
modpackName = "All The Mods"
modpackVersion = "1.0.0"
modpackProjectID = "123456"
```

## How It Works

### Server Querying

The application uses the `minecraft-server-util` package to directly query your Minecraft server using:
- **Server List Ping (SLP) Protocol** - Modern status protocol
- **Query Protocol** - For detailed player lists and server info
- **Legacy Status** - Fallback for older servers

All communication is direct between this application and your Minecraft server - no external APIs required.

### Latency Measurement

The application measures latency in two ways:
1. **Client-Side Latency** (displayed): Measures round-trip time from your browser to the Node.js server, approximating browser-to-Minecraft latency
2. **Server-Side Latency** (fallback): Measures Node.js server to Minecraft server latency

### BlueMap Snapshots

The BlueMap snapshot system:
1. Uses Puppeteer to load BlueMap in a headless browser
2. Automatically hides all UI elements (zoom buttons, controls, etc.)
3. Waits for map content to fully render
4. Captures a screenshot and saves it as a cached background
5. Automatically updates at configurable intervals (default: 3 minutes)
6. Initial snapshot waits 30 seconds after server start to ensure system readiness

### API Endpoints

- `GET /api/status` - Returns current server status and information
- `GET /api/ping` - Lightweight endpoint for client-side latency measurement
- `GET /api/client-config` - Returns client-safe configuration values
- `GET /` - Serves the main status page

## Project Structure

```
minecraft-status-checker/
├── server.js              # Main Express server
├── server/
│   ├── config.js         # Centralized configuration
│   └── bluemap-snapshot.js # BlueMap snapshot automation
├── public/
│   ├── index.html        # Main page
│   ├── script.js         # Frontend logic
│   ├── styles.css        # Styling
│   ├── cache/            # BlueMap snapshot cache (gitignored)
│   ├── audio/            # Sound effects
│   ├── fonts/            # Custom fonts
│   └── img/              # Images and icons
├── package.json
└── README.md
```

## Port Configuration

By default, the web server runs on port 3000. You can change this by setting the `PORT` environment variable:

```bash
PORT=8080 npm start
```

## BlueMap Features

### Cached Background

The application uses a cached screenshot of BlueMap as the page background for instant loading. This screenshot:
- Is automatically updated at configurable intervals
- Has all UI elements removed for a clean background
- Provides fast perceived load time

### Interactive Exploration

Click the "EXPLORE" button to:
- View the live BlueMap with full UI
- Navigate and interact with the map
- Seamlessly switch back to stats view
- The button text changes to "BACK TO STATS" during exploration

## Troubleshooting

### White Screenshot Issue

If BlueMap snapshots appear white:
- The snapshot system waits for map content to render
- Initial snapshot waits 30 seconds after server start
- If issues persist, check BlueMap URL accessibility
- Verify Puppeteer/Chromium is working correctly

### Zoom Buttons Visible

If zoom buttons appear in cached snapshots:
- The system automatically hides UI elements
- If visible, check that BlueMap selectors haven't changed
- Verify the snapshot completed successfully

### Latency Not Showing

- Check that `/api/ping` endpoint is accessible
- Verify network connectivity to server
- Check browser console for errors

## Dependencies

- **express** - Web server framework
- **minecraft-server-util** - Minecraft server querying
- **puppeteer** - Headless browser for BlueMap snapshots
- **toml** - TOML configuration file parsing

## License

MIT License

## Notes

- This application uses the Minecraft Server List Ping protocol and does not require any external APIs
- BlueMap integration requires BlueMap to be installed and accessible
- Modpack information is read from TOML config files (typically in Pterodactyl volumes)
- All server communication is direct and secure