/**
 * Settings page logic
 * Loads and saves settings via the Config module (config.json on the server).
 */

// --- Load saved values ---
function loadSettings() {
  document.getElementById('input-ws-host').value = Config.get('wsHost');
  document.getElementById('input-ws-port').value = Config.get('wsPort');
  document.getElementById('chk-stats-enabled').checked = Config.get('statsEnabled') !== false;
  selectTheme(Config.get('theme'), false);
  updateStatsDisplay();
}

// --- Theme selection ---
function selectTheme(theme, save = true) {
  document.querySelectorAll('.theme-tile').forEach(tile => {
    tile.classList.toggle('selected', tile.dataset.theme === theme);
  });
  if (save) {
    Config.save({ theme }).then(() => showStatus('Theme gespeichert.'));
  }
}

// --- Save all ---
function saveAll() {
  const wsHost = document.getElementById('input-ws-host').value.trim() || 'localhost';
  const wsPort = parseInt(document.getElementById('input-ws-port').value.trim(), 10) || 2947;
  const statsEnabled = document.getElementById('chk-stats-enabled').checked;
  const selectedTile = document.querySelector('.theme-tile.selected');
  const theme = selectedTile ? selectedTile.dataset.theme : 'minimal';

  Config.save({ wsHost, wsPort, theme, statsEnabled }).then(() => showStatus('Einstellungen gespeichert!'));
}

// --- Career stats display ---
function updateStatsDisplay() {
  const hits = Config.get('totalHits') || 0;
  const misses = Config.get('totalMisses') || 0;
  document.getElementById('disp-total').textContent = (hits + misses).toLocaleString();
  document.getElementById('disp-hits').textContent = hits.toLocaleString();
  document.getElementById('disp-misses').textContent = misses.toLocaleString();
}

function resetStats() {
  Config.save({ totalHits: 0, totalMisses: 0 }).then(() => {
    updateStatsDisplay();
    showStatus('Stats zurückgesetzt.');
  });
}

// --- Status message ---
function showStatus(msg) {
  const el = document.getElementById('save-status');
  if (!el) return;
  el.textContent = msg;
  el.style.opacity = '1';
  setTimeout(() => { el.style.opacity = '0'; }, 2500);
}

// --- Wire up events ---
document.addEventListener('DOMContentLoaded', () => {
  Config.ready.then(() => {
    loadSettings();

    // Poll config every 3s and update stats display when values change
    Config.onUpdate(updateStatsDisplay);
    Config.startPolling(3000);

    document.querySelectorAll('.theme-tile').forEach(tile => {
      tile.addEventListener('click', () => selectTheme(tile.dataset.theme));
    });

    document.getElementById('btn-save').addEventListener('click', saveAll);
    document.getElementById('btn-reset-stats').addEventListener('click', resetStats);
    document.getElementById('link-overlay').href = 'index.html';
  });
});
