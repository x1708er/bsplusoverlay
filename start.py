#!/usr/bin/env python3
"""
BSPlus Overlay – Cross-platform launcher

Usage:
  python start.py           # start server + open settings in browser
  python start.py --no-browser  # start server only
"""

import sys
import socket
import threading
import webbrowser
import runpy
import os

PORT = 7273
URL = f"http://localhost:{PORT}/settings.html"
BASE_DIR = (os.path.dirname(sys.executable)
            if getattr(sys, 'frozen', False)
            else os.path.dirname(os.path.abspath(__file__)))

# PyInstaller auf Windows bundelt keine CA-Zertifikate — certifi einbinden
if getattr(sys, 'frozen', False):
    try:
        import certifi
        os.environ.setdefault('SSL_CERT_FILE', certifi.where())
        os.environ.setdefault('REQUESTS_CA_BUNDLE', certifi.where())
    except ImportError:
        pass


def check_python_version():
    if sys.version_info < (3, 6):
        sys.exit("BSPlus Overlay benötigt Python 3.6 oder neuer.")


def port_in_use(port):
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        return s.connect_ex(('localhost', port)) == 0


def run_auto_update():
    if os.path.exists(os.path.join(BASE_DIR, '.noupdate')):
        print("Auto-Update übersprungen (.noupdate vorhanden).")
        return

    print("Prüfe auf Updates …", flush=True)
    if BASE_DIR not in sys.path:
        sys.path.insert(0, BASE_DIR)
    try:
        import updater
        info = updater.check()
    except Exception as e:
        print(f"Update-Check fehlgeschlagen: {e}")
        return

    if not info["update_available"]:
        print(f"Bereits aktuell ({info['remote'][:7]}).")
        return

    local = (info.get("local") or "unbekannt")[:7]
    print(f"Update verfügbar ({local} → {info['remote'][:7]}) – installiere …", flush=True)
    result = updater.apply()
    if result["ok"]:
        print(f"✓ {len(result['updated_files'])} Dateien aktualisiert.")
    else:
        print(f"Warnung: Update fehlgeschlagen: {result['error']}")


def main():
    check_python_version()
    os.chdir(BASE_DIR)
    run_auto_update()

    if port_in_use(PORT):
        print(f"Port {PORT} ist bereits belegt.")
        print(f"Läuft der Server schon? → {URL}")
        if '--no-browser' not in sys.argv:
            webbrowser.open(URL)
        sys.exit(0)

    if '--no-browser' not in sys.argv:
        threading.Timer(1.0, webbrowser.open, args=[URL]).start()

    if getattr(sys, 'frozen', False):
        runpy.run_module('server', run_name='__main__')
    else:
        runpy.run_path(os.path.join(BASE_DIR, 'server.py'), run_name='__main__')


if __name__ == '__main__':
    main()
