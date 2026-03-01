#!/usr/bin/env python3
"""
BSPlus Overlay – lokaler HTTP-Server mit BeatLeader-Proxy
Port: 7273

Statische Dateien: http://localhost:7273/
BeatLeader-Proxy:  http://localhost:7273/bl/<pfad>  →  https://api.beatleader.xyz/<pfad>
"""

import http.server
import urllib.request
import urllib.error
import urllib.parse
import json
import os
import sys

PORT = 7273
BL_API = 'https://api.beatleader.xyz'
BL_PREFIX = '/bl/'
IMG_PREFIX = '/img'
CONFIG_PATH = 'config.json'
CONFIG_ROUTE = '/config'


class Handler(http.server.SimpleHTTPRequestHandler):

    def do_OPTIONS(self):
        """Preflight-Anfragen beantworten."""
        self.send_response(204)
        self._cors_headers()
        self.end_headers()

    def do_GET(self):
        if self.path.startswith(BL_PREFIX):
            self._proxy_beatleader()
        elif self.path.startswith(IMG_PREFIX + '?') or self.path == IMG_PREFIX:
            self._proxy_image()
        elif self.path == CONFIG_ROUTE:
            self._serve_config()
        else:
            super().do_GET()

    def do_POST(self):
        if self.path == CONFIG_ROUTE:
            self._save_config()
        else:
            self.send_response(404)
            self.end_headers()

    def _proxy_beatleader(self):
        # /bl/player/123?foo=bar  →  https://api.beatleader.xyz/player/123?foo=bar
        bl_path = self.path[len(BL_PREFIX) - 1:]  # strip '/bl', keep leading '/'
        url = BL_API + bl_path

        try:
            req = urllib.request.Request(
                url,
                headers={'User-Agent': 'BSPlusOverlay/1.0', 'Accept': 'application/json'},
            )
            with urllib.request.urlopen(req, timeout=10) as resp:
                data = resp.read()
            self.send_response(200)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.send_header('Content-Length', str(len(data)))
            self._cors_headers()
            self.end_headers()
            self.wfile.write(data)

        except urllib.error.HTTPError as e:
            body = json.dumps({'error': f'BeatLeader returned {e.code}'}).encode()
            self.send_response(e.code)
            self.send_header('Content-Type', 'application/json')
            self._cors_headers()
            self.end_headers()
            self.wfile.write(body)

        except Exception as e:
            body = json.dumps({'error': str(e)}).encode()
            self.send_response(502)
            self.send_header('Content-Type', 'application/json')
            self._cors_headers()
            self.end_headers()
            self.wfile.write(body)

    def _serve_config(self):
        if os.path.exists(CONFIG_PATH):
            with open(CONFIG_PATH, 'r', encoding='utf-8') as f:
                data = f.read().encode('utf-8')
        else:
            data = b'{}'
        self.send_response(200)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(data)))
        self._cors_headers()
        self.end_headers()
        self.wfile.write(data)

    def _save_config(self):
        length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(length)
        try:
            data = json.loads(body)
            with open(CONFIG_PATH, 'w', encoding='utf-8') as f:
                json.dump(data, f, indent=2, ensure_ascii=False)
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self._cors_headers()
            self.end_headers()
            self.wfile.write(b'{}')
        except Exception as e:
            err = json.dumps({'error': str(e)}).encode()
            self.send_response(400)
            self.send_header('Content-Type', 'application/json')
            self._cors_headers()
            self.end_headers()
            self.wfile.write(err)

    def _proxy_image(self):
        """GET /img?url=<encoded> → fetches any image URL and returns it from localhost."""
        qs = urllib.parse.urlparse(self.path).query
        params = urllib.parse.parse_qs(qs)
        url = params.get('url', [None])[0]
        if not url:
            self.send_response(400)
            self.end_headers()
            return

        try:
            req = urllib.request.Request(
                url,
                headers={'User-Agent': 'BSPlusOverlay/1.0'},
            )
            with urllib.request.urlopen(req, timeout=10) as resp:
                data = resp.read()
                content_type = resp.headers.get('Content-Type', 'image/jpeg')
            self.send_response(200)
            self.send_header('Content-Type', content_type)
            self.send_header('Content-Length', str(len(data)))
            self._cors_headers()
            self.end_headers()
            self.wfile.write(data)

        except Exception as e:
            self.send_response(502)
            self._cors_headers()
            self.end_headers()

    def _cors_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')

    def log_message(self, fmt, *args):
        # Nur Proxy- und Config-Anfragen loggen, keine statischen Assets
        if self.path.startswith(BL_PREFIX) or self.path == CONFIG_ROUTE or (args and str(args[1]) >= '400'):
            super().log_message(fmt, *args)


if __name__ == '__main__':
    os.chdir(os.path.dirname(os.path.abspath(__file__)))

    # ThreadingHTTPServer ab Python 3.7
    try:
        server_class = http.server.ThreadingHTTPServer
    except AttributeError:
        server_class = http.server.HTTPServer

    with server_class(('', PORT), Handler) as httpd:
        print(f'BSPlus Overlay läuft auf  http://localhost:{PORT}/settings.html')
        print('Strg+C zum Beenden.\n')
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print('\nServer gestoppt.')
