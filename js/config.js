/**
 * Config module
 * Reads/writes config.json on the local server via GET/POST /config.
 * Falls back to defaults silently when running from file:// or server unreachable.
 */
const Config = (() => {
  const DEFAULTS = {
    theme: 'minimal', wsHost: 'localhost', wsPort: 2947,
    totalHits: 0, totalMisses: 0, statsEnabled: true,
    blShowPP: true, blShowAcc: true, blShowRank: true,
    blShowStars: true, blShowFC: true, blShowDate: false,
    blShowHistory: true, blHistoryCount: 5,
  };

  let values = { ...DEFAULTS };

  const { protocol, hostname, port } = window.location;
  const isLocalServer = protocol !== 'file:' &&
    (hostname === 'localhost' || hostname === '127.0.0.1');
  const BASE = isLocalServer ? `http://${hostname}:${port || 7273}` : null;

  const ready = BASE
    ? fetch(`${BASE}/config`)
        .then(r => r.ok ? r.json() : {})
        .then(data => { values = { ...DEFAULTS, ...data }; })
        .catch(() => {})
    : Promise.resolve();

  let _onUpdate = null;

  function get(key) {
    return values[key] ?? DEFAULTS[key];
  }

  async function save(data) {
    if (!BASE) return;
    values = { ...values, ...data };
    await fetch(`${BASE}/config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(values),
    });
  }

  function onUpdate(fn) {
    _onUpdate = fn;
  }

  function startPolling(ms = 3000) {
    if (!BASE) return;
    setInterval(async () => {
      try {
        const res = await fetch(`${BASE}/config`);
        if (!res.ok) return;
        const data = await res.json();
        const next = { ...DEFAULTS, ...data };
        if (next.totalHits !== values.totalHits || next.totalMisses !== values.totalMisses) {
          values = next;
          _onUpdate?.();
        }
      } catch { /* ignore */ }
    }, ms);
  }

  return { ready, get, save, onUpdate, startPolling };
})();
