#!/usr/bin/env bash
# BSPlus Overlay – lokaler HTTP-Server mit BeatLeader-Proxy (Port 7273)

PORT=7273
URL="http://localhost:${PORT}/settings.html"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

cd "$SCRIPT_DIR"

echo "BSPlus Overlay – Server startet auf Port ${PORT}"
echo "Strg+C zum Beenden."
echo ""

# Versuche Browser zu öffnen (im Hintergrund)
if command -v xdg-open &>/dev/null; then
    (sleep 0.8 && xdg-open "$URL") &
elif command -v open &>/dev/null; then
    (sleep 0.8 && open "$URL") &
fi

# Python 3
if command -v python3 &>/dev/null; then
    python3 server.py
    exit 0
fi

if command -v python &>/dev/null; then
    python server.py
    exit 0
fi

echo "FEHLER: Python nicht gefunden."
echo "Bitte Python installieren: https://www.python.org"
exit 1
