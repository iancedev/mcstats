# Minecraft Server Status Checker

A simple, in-house solution to check the status of your Minecraft server without relying on third-party APIs.

## Features

- ✅ Real-time server status (online/offline)
- ✅ Server version information
- ✅ Player count (online/max)
- ✅ Server description (MOTD)
- ✅ Latency measurement
- ✅ List of online players (when available)
- ✅ Auto-refresh every 30 seconds
- ✅ Beautiful, responsive UI
- ✅ No external dependencies - queries your server directly

## Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Start the server:**
   ```bash
   npm start
   ```

3. **Open your browser:**
   Navigate to `http://localhost:3000`

## Configuration

The server to check is configured in `server.js`:
- Host: `play.milan.deviance.rehab`
- Port: `25565` (default Minecraft port)

To change the server, modify the `MINECRAFT_SERVER_HOST` and `MINECRAFT_SERVER_PORT` constants in `server.js`.

## How It Works

This application uses the `minecraft-server-util` package to directly query your Minecraft server using the Server List Ping (SLP) protocol. It doesn't rely on any external APIs - all communication is direct between this application and your Minecraft server.

The backend Express server provides an API endpoint (`/api/status`) that queries the Minecraft server, and the frontend displays this information in a clean, modern interface.

## Port Configuration

By default, the web server runs on port 3000. You can change this by setting the `PORT` environment variable:
```bash
PORT=8080 npm start
```

