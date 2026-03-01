# 🎮 BSPlusOverlay

> **A fully local, privacy-first stream overlay for Beat Saber** — powered by the BS+ mod and the BeatLeader API.

![Work in Progress](https://img.shields.io/badge/status-work%20in%20progress-orange?style=flat-square)
![Python](https://img.shields.io/badge/python-3.14%2B-blue?style=flat-square&logo=python)
![License](https://img.shields.io/badge/license-see%20repo-lightgrey?style=flat-square)
![Vibe Coded](https://img.shields.io/badge/vibe%20coded%20with-Claude%20Code-blueviolet?style=flat-square)

---

## ✨ Overview

**BSPlusOverlay** is a completely local stream overlay for Beat Saber that pulls live data from the [BS+ mod](https://github.com/hardcpp/BeatSaberPlus) and the [BeatLeader API](https://www.beatleader.xyz/). No external servers, no subscriptions, no cloud dependencies — everything runs on your machine.

The overlay is designed to be used as a **browser source in OBS** (or any other streaming/recording software that supports browser sources), displaying real-time song info, score, accuracy, and more directly on your stream.

> 🤖 *Vibe coded with [Claude Code](https://www.anthropic.com/claude-code).*

---

## ⚙️ Prerequisites

Before getting started, make sure you have the following installed:

### Required
- **Python 3.14+**
  - Tested on **Arch Linux / CachyOS** with Python 3.14.3
  - Also works on Windows and macOS
  - Python is required to run a local proxy server that bridges the BeatLeader API — this is necessary to work around browser CORS restrictions that would otherwise block direct API calls from the overlay

### Beat Saber Setup
- **BS+ Mod** installed via a mod manager (e.g. ModAssistant or BSManager)
- An active **BeatLeader** profile

---

## 🚀 Getting Started

### 1. Start the local proxy server

**Windows:**
```bat
start.bat
```

**macOS & Linux:**
```bash
./start.sh
```

This will launch the Python proxy server in the background and open a **settings page** in your default browser where you can configure the overlay to your liking.

---

### 2. Configure the overlay

Once the settings page opens, customize the overlay appearance and behavior — player ID, layout, colors, enabled elements, etc.

---

### 3. Add to OBS as Browser Source

In OBS Studio (or similar):

1. Add a new **Browser Source**
2. Set the URL to:
   ```
   http://localhost:7273/index.html
   ```
3. Set the resolution to match your canvas (e.g. `1920 × 1080`)
4. Done — the overlay is now live! 🎉

---

## 🗂️ Project Structure

```
bsplusoverlay/
├── start.bat          # Windows launcher
├── start.sh           # macOS/Linux launcher
├── proxy/             # Python CORS proxy for BeatLeader API
└── overlay/           # Frontend overlay (HTML/CSS/JS)
    └── index.html     # Main overlay page (use this as browser source)
```

---

## 🔒 Privacy & Local-First Design

All data processing happens **entirely on your local machine**:

- No data is sent to any third-party servers (except direct API calls to BeatLeader, which you control)
- No analytics, no telemetry
- No account or login required
- Works fully offline for BS+ data (BeatLeader requires internet access)

---

## 🛠️ Troubleshooting

| Problem | Solution |
|---|---|
| Overlay shows no data | Make sure Beat Saber is running with BS+ active |
| BeatLeader stats not loading | Check that the Python proxy is running and reachable at `localhost:7273` |
| Browser source is blank in OBS | Verify the URL is set to `http://localhost:7273/index.html` |
| `start.sh` not executable | Run `chmod +x start.sh` first |
| Port 7273 already in use | Stop any conflicting process or change the port in the config |

---

## 🚧 Roadmap / Work in Progress

This project is actively being developed. Planned features and improvements:

- [x] More customizable layout options
- [x] Additional BeatLeader stats (rank, PP gain, leaderboard position)
- [x] Theme support / preset themes
- [x] In-overlay settings panel
- [ ] Improved cross-platform launcher
- [ ] Docker support for easier deployment

---

## 🤝 Contributing

Contributions, issues, and feature requests are welcome! Feel free to open an issue or submit a pull request.

---

## 📄 License

See the repository for license details.

---

<div align="center">
  Made with 🎵 and <strong>Claude Code</strong> for the Beat Saber community
</div>
