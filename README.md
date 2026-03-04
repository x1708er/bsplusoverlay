# 🎮 BSPlusOverlay

> **A fully local, privacy-first stream overlay for Beat Saber** — powered by the BS+ mod and the BeatLeader API.

[![Release](https://img.shields.io/github/v/release/x1708er/bsplusoverlay?style=flat-square)](https://github.com/x1708er/bsplusoverlay/releases)
[![Python](https://img.shields.io/badge/python-3.6%2B-blue?style=flat-square&logo=python)](https://www.python.org/)
[![License](https://img.shields.io/badge/license-see%20repo-lightgrey?style=flat-square)](LICENSE)
[![Vibe Coded](https://img.shields.io/badge/vibe%20coded%20with-Claude%20Code-blueviolet?style=flat-square)](https://www.anthropic.com/claude-code)

---

## ✨ Overview

**BSPlusOverlay** is a completely local stream overlay for Beat Saber that pulls live data from the [BS+ mod](https://github.com/hardcpp/BeatSaberPlus) and the [BeatLeader API](https://www.beatleader.xyz/). No external servers, no subscriptions, no cloud dependencies — everything runs on your machine.

The overlay is designed to be used as a **browser source in OBS** (or any other streaming/recording software that supports browser sources), displaying real-time song info, score, accuracy, and more directly on your stream.

> 🤖 *Vibe coded with [Claude Code](https://www.anthropic.com/claude-code).*

---

## ⚙️ Prerequisites

* **BS+ Mod** installed via a mod manager (e.g. ModAssistant or BSManager)
* An active **BeatLeader** profile

---

## 🚀 Getting Started

### Option A — Installer (recommended, no Python required)

Download the latest release for your platform from the [Releases page](https://github.com/x1708er/bsplusoverlay/releases):

| Platform | File |
|---|---|
| Windows | `BSPlusOverlay-Setup-Windows.exe` |
| macOS | `BSPlusOverlay-macOS.dmg` |
| Linux | `BSPlusOverlay-Linux.tar.gz` |

Run the installer (Windows) or the extracted binary — it opens the settings page in your browser automatically.

### Option B — Run from source (Python 3.6+)

```bash
python start.py               # start server + open settings in browser
python start.py --no-browser  # server only
```

---

### Configure the overlay

Once the settings page opens, customize the overlay appearance and behavior — theme, layout, visible panels, font, and more. Your player name is detected automatically from Beat Saber via the BS+ mod.

---

### Add to OBS as Browser Source

1. Add a new **Browser Source**
2. Set the URL to `http://localhost:7273/index.html`
3. Set the resolution to match your canvas (e.g. `1920 × 1080`)
4. Done — the overlay is now live! 🎉

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
| BeatLeader stats not loading | Check that the server is running and reachable at `localhost:7273` |
| Browser source is blank in OBS | Verify the URL is set to `http://localhost:7273/index.html` |
| Port 7273 already in use | Stop any conflicting process or change the port in the settings |

---

## 🚧 Roadmap

### 🎯 Near-term (Core Polish)

- [x] **Personal Best comparison** — live delta display against your own PB for the current map
- [x] **Theme support / preset themes** — light, dark, neon, minimal, and community themes
- [x] **Custom CSS injection** — advanced users can paste custom styles directly in the settings UI

### 📊 Mid-term (Richer Data)

- [x] **Session statistics widget** — total PP earned, maps played, average accuracy, combo streaks for the current session
- [x] **Accuracy graph** — live line chart showing accuracy trend over the course of the current map
- [x] **Song history panel** — scrollable list of last N played maps with scores and accuracy
- [x] **Fail / Pass screen** — animated end-of-map result screen with score breakdown
- [x] **Map leaderboard widget** — show top scores for the current map pulled from BeatLeader in real time
- [x] **Difficulty color coding** — map difficulty badge styled with BeatLeader's own color scheme
- [x] **Practice mode indicator** — clearly flag when a map is played in practice mode so stats aren't misleading on stream

### 🔗 Integrations

- [ ] **ScoreSaber API support** — optional alternative to BeatLeader for players who prefer ScoreSaber rankings
- [ ] **BeatSaver map info** — fetch cover art, mapper name, BPM, and NJS directly from BeatSaver for the current map
- [ ] **BSR / song request QR code** — show a scannable QR linking to the current map on BeatSaver for viewers who want to play it
- [ ] **Streamer.bot / Touch Portal integration** — expose overlay state as triggerable events for advanced stream automation

### 🖥️ Infrastructure & DX

- [ ] **Docker support** — single `docker compose up` to run the proxy without a local Python install
- [ ] **WebSocket hot-reload** — overlay updates without full page refresh when config changes
- [ ] **Multi-language support (i18n)** — UI strings externalized for community translations
- [x] **Automated release pipeline** — GitHub Actions builds self-contained installers for Windows, macOS, and Linux on every tagged release

### 💡 Stretch Goals / Community Features

- [ ] **Multiple overlay presets** — save and switch between named layout configurations (e.g. "tournament mode", "chill stream", "FC attempt")
- [x] **Custom font support** — load any Google Font via settings
- [x] **Animated transitions** — configurable enter/exit animations for each widget
- [ ] **Twitch chat command display** — show viewer `!bsr` requests and currently queued songs (requires BS+ queue integration)
- [ ] **Rank-up alert** — animated notification when a new global or regional rank milestone is hit
- [ ] **Hosted Version** — hosted version for those who don't want to deal with a local installation

---

## 🤝 Contributing

Contributions, issues, and feature requests are welcome! Feel free to open an issue or submit a pull request.

---

## 📄 License

See the repository for license details.

---

Made with 🎵 and **Claude Code** for the Beat Saber community
