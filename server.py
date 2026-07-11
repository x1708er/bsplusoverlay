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
import importlib.util
import datetime
import glob
import json
import os
import sys
import threading

PORT = 7273
BL_API = 'https://api.beatleader.xyz'
BL_PREFIX = '/bl/'
IMG_PREFIX = '/img'
STEAM_ROUTE = '/steam'
STEAM_APPID = 620980  # Beat Saber
STEAM_API_URL = ('https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/'
                 '?key={key}&steamid={steamid}'
                 '&include_appinfo=0&include_played_free_games=1&format=json')
CONFIG_PATH = 'config.json'
CONFIG_ROUTE = '/config'
LOG_ROUTE = '/log'
UPDATE_CHECK_ROUTE = '/update/check'
UPDATE_APPLY_ROUTE = '/update/apply'

# `.noupdate` is the dev-mode marker (same as in start.py). In dev mode we send
# Cache-Control: no-store so browser caches don't serve stale JS/HTML across
# edits. Released builds keep normal caching behaviour.
BASE_DIR = (os.path.dirname(sys.executable) if getattr(sys, 'frozen', False)
            else os.path.dirname(os.path.abspath(__file__)))
DEV_MODE = os.path.exists(os.path.join(BASE_DIR, '.noupdate'))

# --- Logging -----------------------------------------------------------------
# Eine Logdatei pro Server-Start unter logs/; es werden nur die letzten
# LOG_KEEP Dateien behalten. Client-Logs (Overlay/Settings) kommen per
# POST /log dazu, Server-Ereignisse werden direkt geschrieben.
LOG_DIR = os.path.join(BASE_DIR, 'logs')
LOG_KEEP = 10
_log_lock = threading.Lock()
_log_path = None
_last_msg = None    # (source, level, msg) der zuletzt geschriebenen Zeile
_repeat_count = 0   # wie oft _last_msg seitdem unterdrückt wurde


def _init_logging():
    global _log_path
    os.makedirs(LOG_DIR, exist_ok=True)
    old = sorted(glob.glob(os.path.join(LOG_DIR, 'overlay-*.log')))
    for path in old[:max(0, len(old) - (LOG_KEEP - 1))]:
        try:
            os.remove(path)
        except OSError:
            pass
    stamp = datetime.datetime.now().strftime('%Y%m%d-%H%M%S')
    _log_path = os.path.join(LOG_DIR, f'overlay-{stamp}.log')
    log_line('server', 'info', f'--- BSPlus Overlay gestartet (dev={DEV_MODE}) ---')


def log_line(source, level, msg):
    """Eine Zeile in die aktuelle Logdatei schreiben (thread-sicher).

    Direkt aufeinanderfolgende identische Zeilen werden nicht einzeln
    geschrieben, sondern beim nächsten abweichenden Eintrag zu einer
    Sammelzeile "(letzte Zeile Nx wiederholt)" zusammengefasst.
    """
    global _last_msg, _repeat_count
    if not _log_path:
        return
    ts = datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    try:
        with _log_lock:
            key = (source, level, msg)
            if key == _last_msg:
                _repeat_count += 1
                return
            with open(_log_path, 'a', encoding='utf-8') as f:
                if _repeat_count:
                    f.write(f'{ts} [{_last_msg[0]}] [{_last_msg[1]}] (letzte Zeile {_repeat_count}x wiederholt)\n')
                f.write(f'{ts} [{source}] [{level}] {msg}\n')
            _last_msg = key
            _repeat_count = 0
    except OSError:
        pass


class Handler(http.server.SimpleHTTPRequestHandler):

    def end_headers(self):
        if DEV_MODE:
            self.send_header('Cache-Control', 'no-store, must-revalidate')
        super().end_headers()

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
        elif self.path == STEAM_ROUTE or self.path.startswith(STEAM_ROUTE + '?'):
            self._proxy_steam()
        elif self.path == CONFIG_ROUTE:
            self._serve_config()
        elif self.path == UPDATE_CHECK_ROUTE:
            self._update_check()
        else:
            super().do_GET()

    def do_POST(self):
        if self.path == CONFIG_ROUTE:
            self._save_config()
        elif self.path == LOG_ROUTE:
            self._receive_log()
        elif self.path == UPDATE_APPLY_ROUTE:
            self._update_apply()
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
            log_line('server', 'warn', f'BeatLeader-Proxy {bl_path}: HTTP {e.code}')
            body = json.dumps({'error': f'BeatLeader returned {e.code}'}).encode()
            self.send_response(e.code)
            self.send_header('Content-Type', 'application/json')
            self._cors_headers()
            self.end_headers()
            self.wfile.write(body)

        except Exception as e:
            log_line('server', 'error', f'BeatLeader-Proxy {bl_path}: {e}')
            body = json.dumps({'error': str(e)}).encode()
            self.send_response(502)
            self.send_header('Content-Type', 'application/json')
            self._cors_headers()
            self.end_headers()
            self.wfile.write(body)

    def _serve_config(self):
        cfg = self._read_config()
        # Den Steam-API-Key NIE an Clients ausliefern (Overlay/OBS/LAN sehen /config).
        # Stattdessen nur ein Flag, ob ein Key gesetzt ist.
        cfg['steamApiKeySet'] = bool((cfg.pop('steamApiKey', '') or '').strip())
        data = json.dumps(cfg, ensure_ascii=False).encode('utf-8')
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
            # Den (ausgeblendeten) Steam-API-Key bewahren, wenn der Client keinen
            # neuen schickt – sonst würde ein normaler Speichervorgang ihn löschen.
            if not (data.get('steamApiKey') or '').strip():
                data.pop('steamApiKey', None)
                existing = self._read_config().get('steamApiKey')
                if (existing or '').strip():
                    data['steamApiKey'] = existing
            data.pop('steamApiKeySet', None)  # nur ein abgeleitetes Flag, nie speichern
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

    def _receive_log(self):
        """POST /log ← {entries: [{level, msg}]} vom Overlay/den Settings.

        Der Browser-Zeitstempel wird ignoriert; die Zeile bekommt die
        Serverzeit, damit Client- und Server-Einträge chronologisch passen.
        """
        length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(length)
        try:
            payload = json.loads(body)
            entries = payload.get('entries') or []
            page = str(payload.get('page') or 'client')[:24]
            for e in entries[:200]:
                level = str(e.get('level', 'info'))[:8]
                msg = str(e.get('msg', ''))[:2000]
                log_line(page, level, msg)
        except Exception:
            pass  # kaputte Log-Payload darf nie einen Fehler auslösen
        self._json_response({})

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
            log_line('server', 'warn', f'Bild-Proxy {url}: {e}')
            self.send_response(502)
            self._cors_headers()
            self.end_headers()

    def _proxy_steam(self):
        """GET /steam?steamid=<id64> → {"hours": <float|null>} Beat-Saber-Spielzeit.

        Nutzt die offizielle Steam Web API (IPlayerService/GetOwnedGames) mit dem
        server-seitig gespeicherten API-Key. Der Key verlässt den Server nie.
        Liefert hours=null bei fehlendem Key, privatem Profil, fehlendem Spiel oder
        Netzfehler – nie ein Fehler-Status, damit das Overlay nie kaputtgeht.
        """
        steamid = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query).get('steamid', [''])[0]
        key = (self._read_config().get('steamApiKey') or '').strip()
        if not steamid.isdigit() or not key:
            self._json_response({'hours': None})
            return
        try:
            url = STEAM_API_URL.format(key=urllib.parse.quote(key), steamid=steamid)
            req = urllib.request.Request(url, headers={'User-Agent': 'BSPlusOverlay/1.0'})
            with urllib.request.urlopen(req, timeout=10) as resp:
                payload = json.loads(resp.read())
            games = (payload.get('response') or {}).get('games') or []
            for g in games:
                if g.get('appid') == STEAM_APPID:
                    minutes = g.get('playtime_forever', 0)
                    self._json_response({'hours': round(minutes / 60, 1)})
                    return
            self._json_response({'hours': None})  # Spiel nicht gefunden / Profil privat
        except Exception as e:
            log_line('server', 'warn', f'Steam-Proxy steamid={steamid}: {e}')
            self._json_response({'hours': None})

    @staticmethod
    def _read_config():
        """Liest config.json als dict (leeres dict bei Fehler/fehlend)."""
        try:
            with open(CONFIG_PATH, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception:
            return {}

    def _load_updater(self):
        if getattr(sys, 'frozen', False):
            import updater
            return updater
        path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'updater.py')
        spec = importlib.util.spec_from_file_location('updater', path)
        mod  = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)
        return mod

    def _update_check(self):
        try:
            result = self._load_updater().check()
        except Exception as e:
            result = {'error': str(e)}
        self._json_response(result)

    def _update_apply(self):
        try:
            result = self._load_updater().apply()
        except Exception as e:
            result = {'ok': False, 'error': str(e)}
        self._json_response(result)

    def _json_response(self, data):
        body = json.dumps(data).encode()
        self.send_response(200)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self._cors_headers()
        self.end_headers()
        self.wfile.write(body)

    def _cors_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')

    def log_message(self, fmt, *args):
        # Nur Proxy- und Config-Anfragen loggen, keine statischen Assets
        if self.path.startswith(BL_PREFIX) or self.path == CONFIG_ROUTE or (args and str(args[1]) >= '400'):
            super().log_message(fmt, *args)
            log_line('server', 'info', f'{self.address_string()} {fmt % args}')


if __name__ == '__main__':
    if not getattr(sys, 'frozen', False):
        os.chdir(os.path.dirname(os.path.abspath(__file__)))

    _init_logging()

    # ThreadingHTTPServer ab Python 3.7
    try:
        server_class = http.server.ThreadingHTTPServer
    except AttributeError:
        server_class = http.server.HTTPServer

    with server_class(('', PORT), Handler) as httpd:
        print(f'BSPlus Overlay läuft auf  http://localhost:{PORT}/settings.html')
        if DEV_MODE:
            print('Dev-Modus (.noupdate vorhanden): Cache-Control: no-store aktiv.')
        print('Strg+C zum Beenden.\n')
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print('\nServer gestoppt.')
