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


def check_python_version():
    if sys.version_info < (3, 6):
        sys.exit("BSPlus Overlay benötigt Python 3.6 oder neuer.")


def port_in_use(port):
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        return s.connect_ex(('localhost', port)) == 0


def main():
    check_python_version()

    if port_in_use(PORT):
        print(f"Port {PORT} ist bereits belegt.")
        print(f"Läuft der Server schon? → {URL}")
        if '--no-browser' not in sys.argv:
            webbrowser.open(URL)
        sys.exit(0)

    if '--no-browser' not in sys.argv:
        threading.Timer(1.0, webbrowser.open, args=[URL]).start()

    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    runpy.run_path(os.path.join(os.path.dirname(__file__), 'server.py'), run_name='__main__')


if __name__ == '__main__':
    main()
