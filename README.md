# 🎮 BSPlusOverlay

> **A fully local, privacy-first stream overlay for Beat Saber** — powered by the BS+ mod and the BeatLeader API.

[![Work in Progress](https://img.shields.io/badge/status-work%20in%20progress-orange?style=flat-square)](https://camo.githubusercontent.com/ba18d0b0989dd2e9ed2b9075f1ebaeddbee8fb142e9099721a556d6cf217af73/68747470733a2f2f696d672e736869656c64732e696f2f62616467652f7374617475732d776f726b253230696e25323070726f67726573732d6f72616e67653f7374796c653d666c61742d737175617265)
[![Python](https://img.shields.io/badge/python-3.14%2B-blue?style=flat-square&logo=python)](https://camo.githubusercontent.com/5aa326c306b4134a6841fd41aa12964b63d099fd200a6fb8abc42c8c364da1f1/68747470733a2f2f696d672e736869656c64732e696f2f62616467652f707974686f6e2d332e31342532422d626c75653f7374796c653d666c61742d737175617265266c6f676f3d707974686f6e)
[![License](https://img.shields.io/badge/license-see%20repo-lightgrey?style=flat-square)](https://camo.githubusercontent.com/0a4b816e8e22968ceaf96a5c9a80aeb467bcfb6526522189c3de4910913fb97a/68747470733a2f2f696d672e736869656c64732e696f2f62616467652f6c6963656e73652d7365652532307265706f2d6c69676874677265793f7374796c653d666c61742d737175617265)
[![Vibe Coded](https://img.shields.io/badge/vibe%20coded%20with-Claude%20Code-blueviolet?style=flat-square)](https://camo.githubusercontent.com/21dd56b0e42eb939d3686f272d2b1b154871c9bd0f29ed36835db49593b58472/68747470733a2f2f696d672e736869656c64732e696f2f62616467652f76696265253230636f646564253230776974682d436c61756465253230436f64652d626c756576696f6c65743f7374796c653d666c61742d737175617265)

---

## ✨ Overview

**BSPlusOverlay** is a completely local stream overlay for Beat Saber that pulls live data from the [BS+ mod](https://github.com/hardcpp/BeatSaberPlus) and the [BeatLeader API](https://www.beatleader.xyz/). No external servers, no subscriptions, no cloud dependencies — everything runs on your machine.

The overlay is designed to be used as a **browser source in OBS** (or any other streaming/recording software that supports browser sources), displaying real-time song info, score, accuracy, and more directly on your stream.

> 🤖 *Vibe coded with [Claude Code](https://www.anthropic.com/claude-code).*

---

## ⚙️ Prerequisites

Before getting started, make sure you have the following installed:

### Required

* **Python 3.14+**
  + Tested on **Arch Linux / CachyOS** with Python 3.14.3
  + Also works on Windows and macOS
  + Python is required to run a local proxy server that bridges the BeatLeader API — this is necessary to work around browser CORS restrictions that would otherwise block direct API calls from the overlay

### Beat Saber Setup

* **BS+ Mod** installed via a mod manager (e.g. ModAssistant or BSManager)
* An active **BeatLeader** profile

---

## 🚀 Getting Started

### 1. Start the local proxy server

```
python start.py
```

This will launch the Python proxy server and open a **settings page** in your default browser where you can configure the overlay to your liking.

> **Tip:** Run `python start.py --no-browser` to start the server without opening the browser automatically.

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
├── start.py           # Cross-platform launcher (run this)
├── server.py          # Local HTTP server + BeatLeader proxy
├── index.html         # Overlay page (use this as OBS browser source)
├── settings.html      # Settings page
├── config.json        # Saved settings
├── css/               # Stylesheets (base + themes)
└── js/                # JavaScript modules
```

---

## 🔒 Privacy & Local-First Design

All data processing happens **entirely on your local machine**:

* No data is sent to any third-party servers (except direct API calls to BeatLeader, which you control)
* No analytics, no telemetry
* No account or login required
* Works fully offline for BS+ data (BeatLeader requires internet access)

---

## 🛠️ Troubleshooting

| Problem | Solution |
| --- | --- |
| Overlay shows no data | Make sure Beat Saber is running with BS+ active |
| BeatLeader stats not loading | Check that the Python proxy is running and reachable at `localhost:7273` |
| Browser source is blank in OBS | Verify the URL is set to `http://localhost:7273/index.html` |
| `start.sh` not executable | Run `chmod +x start.sh` first |
| Port 7273 already in use | Stop any conflicting process or change the port in the config |

---

## 🚧 Roadmap

This project is actively being developed. The roadmap is organized by priority and scope.

### 🎯 Near-term (Core Polish)

- [x] **Personal Best comparison** — live delta display against your own PB for the current map
- [x] **Theme support / preset themes** — light, dark, neon, minimal, and community themes
- [ ] **Custom CSS injection** — advanced users can paste custom styles directly in the settings UI

### 📊 Mid-term (Richer Data)

- [ ] **Session statistics widget** — total PP earned, maps played, average accuracy, combo streaks for the current session
- [ ] **Accuracy graph** — live line chart showing accuracy trend over the course of the current map
- [ ] **Song history panel** — scrollable list of last N played maps with scores and accuracy
- [ ] **Fail / Pass screen** — animated end-of-map result screen with score breakdown
- [ ] **Map leaderboard widget** — show top scores for the current map pulled from BeatLeader in real time
- [ ] **Difficulty color coding** — map difficulty badge styled with BeatLeader's own color scheme
- [ ] **Practice mode indicator** — clearly flag when a map is played in practice mode so stats aren't misleading on stream

### 🔗 Integrations

- [ ] **ScoreSaber API support** — optional alternative to BeatLeader for players who prefer ScoreSaber rankings
- [ ] **BeatSaver map info** — fetch cover art, mapper name, BPM, and NJS directly from BeatSaver for the current map
- [ ] **BSR / song request QR code** — show a scannable QR linking to the current map on BeatSaver for viewers who want to play it
- [ ] **Streamer.bot / Touch Portal integration** — expose overlay state as triggerable events for advanced stream automation

### 🖥️ Infrastructure & DX

- [ ] **Docker support** — single `docker compose up` to run the proxy without a local Python install
- [ ] **WebSocket hot-reload** — overlay updates without full page refresh when config changes
- [ ] **Multi-language support (i18n)** — UI strings externalized for community translations
- [ ] **Automated release pipeline** — GitHub Actions build + versioned releases with changelogs

### 💡 Stretch Goals / Community Features

- [ ] **Multiple overlay presets** — save and switch between named layout configurations (e.g. "tournament mode", "chill stream", "FC attempt")
- [ ] **Custom font support** — load any Google Font or local font file via settings
- [ ] **Animated transitions** — configurable enter/exit animations for each widget
- [ ] **Twitch chat command display** — show viewer `!bsr` requests and currently queued songs (requires BS+ queue integration)
- [ ] **Rank-up alert** — animated notification when a new global or regional rank milestone is hit

---

## 🤝 Contributing

Contributions, issues, and feature requests are welcome! Feel free to open an issue or submit a pull request.

---

## 📄 License

See the repository for license details.

---

Made with 🎵 and **Claude Code** for the Beat Saber community
