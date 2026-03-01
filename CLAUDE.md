# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Running the Overlay

```bash
# Start the local HTTP + BeatLeader-proxy server (port 7273)
python3 server.py          # then open http://localhost:7273/settings.html

# Or use the shell script (also auto-opens the browser)
./start.sh
```

No build step, no npm, no compilation. All files are served as-is.

## Architecture

### Data Flow

```
Beat Saber (BSPlus mod)
  └─ WebSocket ws://localhost:2947/socket
       └─ js/websocket.js  (BSPlusWS module)
            └─ js/overlay.js  (wires events → DOM in index.html)

BeatLeader REST API
  └─ via server.py proxy  http://localhost:7273/bl/*
       └─ js/beatleader.js  (BeatLeader module)
            └─ js/overlay.js  (called on every mapInfo event)
```

### BSPlus WebSocket Protocol

All game events share `_type: "event"` and are differentiated by `_event`:

| `_event` | payload field | key fields |
|---|---|---|
| `gameState` | `gameStateChanged` | `"Menu"` \| `"Playing"` |
| `mapInfo` | `mapInfoChanged` | `name, artist, mapper, level_id, difficulty, BPM, duration`**(ms!)**, `coverRaw` |
| `score` | `scoreEvent` | `time`(s), `score`, `accuracy`(0–1), `combo`, `missCount`, `currentHealth`(0–1) |
| `pause` | — | — |
| `resume` | — | — |

Handshake is its own `_type: "handshake"` with top-level `playerName`.

**Critical unit mismatch:** `mapInfoChanged.duration` is milliseconds; `scoreEvent.time` is seconds.

### CORS / Proxy

BeatLeader sets no CORS headers. `server.py` proxies `/bl/*` → `https://api.beatleader.xyz/*` with `Access-Control-Allow-Origin: *`. `beatleader.js` auto-detects the environment:
- `file://` protocol → skips all fetches silently
- `localhost` → uses `/bl/` proxy
- Any other host → hits the API directly

### Module Pattern

All JS files expose a single module object (`BSPlusWS`, `BeatLeader`) via IIFE. `overlay.js` overrides the no-op handler functions on `BSPlusWS` at runtime. Script load order in `index.html` matters: `websocket.js` → `beatleader.js` → `overlay.js`.

### Theming

`index.html` loads `css/base.css` (layout, positioning, animations — theme-independent) plus a dynamic theme CSS via `<link id="theme-css">`. `overlay.js` sets the `href` at startup from `localStorage`. Theme files only override visual properties (colors, backgrounds, shadows, borders) for the same element IDs defined in `base.css`.

To add a new theme: create `css/theme-<name>.css`, add a tile in `settings.html`, and add a preview style block there.

### localStorage Keys

| Key | Default | Used by |
|---|---|---|
| `bsplusoverlay_theme` | `minimal` | overlay.js, settings.js |
| `bsplusoverlay_wsPort` | `2947` | websocket.js, settings.js |

The player ID (Steam ID) is **not** stored in localStorage. It comes from the BSPlus handshake (`playerPlatformId`) and is set at runtime via `BeatLeader.setPlayerId()` in overlay.js.

### Overlay States

- **Playing** (`#overlay-playing` visible): shown on `mapInfo` event, hidden on `gameState → Menu`
- **Menu** (`#overlay-menu` visible): shows `#player-banner` bottom-left with player name from handshake
- Both panels are `position: fixed; bottom: 20px; left: 20px; width: 380px`
