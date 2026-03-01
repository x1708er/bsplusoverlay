#!/usr/bin/env python3
"""
Auto-Updater für BSPlus Overlay
Lädt Updates von https://github.com/x1708er/bsplusoverlay herunter.

check()  → prüft ob ein Update verfügbar ist (GitHub API)
apply()  → lädt ZIP herunter und überschreibt alle Dateien außer config.json
"""

import urllib.request
import urllib.error
import json
import os
import zipfile
import tempfile

REPO   = "x1708er/bsplusoverlay"
BRANCH = "main"
API_BASE = "https://api.github.com"
VERSION_FILE = ".version"

# Dateien, die beim Update NIE überschrieben werden (exakter relativer Pfad ab Repo-Root)
SKIP_FILES = {"config.json"}


def _base_dir():
    return os.path.dirname(os.path.abspath(__file__))


def get_local_sha():
    path = os.path.join(_base_dir(), VERSION_FILE)
    if not os.path.exists(path):
        return None
    with open(path, "r", encoding="utf-8") as f:
        return f.read().strip() or None


def _save_local_sha(sha):
    path = os.path.join(_base_dir(), VERSION_FILE)
    with open(path, "w", encoding="utf-8") as f:
        f.write(sha)


def get_remote_sha():
    """Fragt den neuesten Commit-SHA des Branches über die GitHub API ab."""
    url = f"{API_BASE}/repos/{REPO}/commits/{BRANCH}"
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": "BSPlusOverlay-Updater/1.0",
            "Accept": "application/vnd.github.sha",
        },
    )
    with urllib.request.urlopen(req, timeout=10) as resp:
        return resp.read().decode().strip()


def check():
    """
    Prüft ob ein Update verfügbar ist.
    Gibt zurück: {"local": str|None, "remote": str, "update_available": bool}
    Wirft Exception bei Netzwerkfehler.
    """
    remote = get_remote_sha()
    local  = get_local_sha()
    return {
        "local":            local,
        "remote":           remote,
        "update_available": local != remote,
    }


def apply():
    """
    Lädt das ZIP-Archiv vom Branch herunter und kopiert alle Dateien
    (außer SKIP_FILES) in das Projektverzeichnis.
    Gibt zurück: {"ok": True, "updated_files": [...], "remote_sha": str}
                 {"ok": False, "error": str}
    """
    try:
        remote  = get_remote_sha()
        zip_url = f"https://github.com/{REPO}/archive/refs/heads/{BRANCH}.zip"

        req = urllib.request.Request(
            zip_url,
            headers={"User-Agent": "BSPlusOverlay-Updater/1.0"},
        )
        with urllib.request.urlopen(req, timeout=60) as resp:
            zip_data = resp.read()

        base    = _base_dir()
        updated = []
        prefix  = f"bsplusoverlay-{BRANCH}/"

        with tempfile.TemporaryDirectory() as tmpdir:
            zip_path = os.path.join(tmpdir, "update.zip")
            with open(zip_path, "wb") as f:
                f.write(zip_data)

            with zipfile.ZipFile(zip_path, "r") as zf:
                for member in zf.infolist():
                    if member.is_dir():
                        continue

                    rel = member.filename
                    if rel.startswith(prefix):
                        rel = rel[len(prefix):]
                    if not rel:
                        continue

                    # Dateien, die niemals überschrieben werden
                    if rel in SKIP_FILES:
                        continue

                    dest = os.path.join(base, rel)
                    os.makedirs(os.path.dirname(dest), exist_ok=True)
                    with zf.open(member) as src, open(dest, "wb") as dst:
                        dst.write(src.read())
                    updated.append(rel)

        _save_local_sha(remote)
        return {"ok": True, "updated_files": updated, "remote_sha": remote}

    except Exception as e:
        return {"ok": False, "error": str(e)}


if __name__ == "__main__":
    print("Prüfe auf Updates …")
    try:
        info = check()
    except Exception as e:
        print(f"Fehler beim Prüfen: {e}")
        raise SystemExit(1)

    local  = info["local"]  or "unbekannt"
    remote = info["remote"]
    print(f"Lokal:  {local[:7]}")
    print(f"Remote: {remote[:7]}")

    if not info["update_available"]:
        print("Bereits aktuell.")
        raise SystemExit(0)

    print("Update verfügbar – installiere …")
    result = apply()
    if result["ok"]:
        print(f"✓ {len(result['updated_files'])} Dateien aktualisiert.")
        print("Bitte Server neu starten.")
    else:
        print(f"✗ Fehler: {result['error']}")
        raise SystemExit(1)
