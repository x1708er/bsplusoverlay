/**
 * Logger module
 * Spiegelt alle console.*-Ausgaben und unbehandelte JS-Fehler an den lokalen
 * Server (POST /log), der sie in logs/overlay-*.log schreibt. Gepuffert und
 * gebatcht, damit kein Request pro Zeile entsteht; Flush beim Verlassen der
 * Seite per sendBeacon. Läuft die Seite ohne Server (file://), passiert nichts.
 */
const Logger = (() => {
  const { protocol, hostname, port } = window.location;
  const BASE = protocol !== 'file:' ? `${protocol}//${hostname}:${port || 7273}` : null;
  const PAGE = (location.pathname.split('/').pop() || 'index.html').replace('.html', '');
  const FLUSH_MS = 2000;
  const MAX_QUEUE = 500;

  let queue = [];

  function fmt(args) {
    return args.map(a => {
      if (a instanceof Error) return a.stack || String(a);
      if (typeof a === 'object' && a !== null) {
        try { return JSON.stringify(a); } catch { return String(a); }
      }
      return String(a);
    }).join(' ');
  }

  function push(level, args) {
    if (!BASE) return;
    if (queue.length >= MAX_QUEUE) queue.shift();
    queue.push({ level, msg: fmt(args) });
  }

  function flush(useBeacon = false) {
    if (!BASE || !queue.length) return;
    const body = JSON.stringify({ page: PAGE, entries: queue });
    queue = [];
    if (useBeacon && navigator.sendBeacon) {
      navigator.sendBeacon(`${BASE}/log`, new Blob([body], { type: 'application/json' }));
      return;
    }
    fetch(`${BASE}/log`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    }).catch(() => {});
  }

  // console.* wrappen, damit alles Bestehende automatisch mitgeloggt wird
  for (const level of ['log', 'info', 'warn', 'error', 'debug']) {
    const orig = console[level].bind(console);
    console[level] = (...args) => {
      orig(...args);
      push(level === 'log' ? 'info' : level, args);
    };
  }

  window.addEventListener('error', (e) => {
    push('error', [`Unhandled: ${e.message} (${e.filename}:${e.lineno}:${e.colno})`]);
  });
  window.addEventListener('unhandledrejection', (e) => {
    push('error', ['Unhandled rejection:', e.reason]);
  });

  setInterval(flush, FLUSH_MS);
  window.addEventListener('pagehide', () => flush(true));

  push('info', [`--- ${PAGE} geladen (${navigator.userAgent}) ---`]);

  return { flush };
})();
