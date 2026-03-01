/**
 * Settings page logic
 * Loads and saves bsplusoverlay_* keys in localStorage.
 */

const KEYS = {
  theme: 'bsplusoverlay_theme',
  wsPort: 'bsplusoverlay_wsPort',
};

// --- Load saved values ---
function loadSettings() {
  const theme = localStorage.getItem(KEYS.theme) || 'minimal';
  const wsPort = localStorage.getItem(KEYS.wsPort) || '2947';

  document.getElementById('input-ws-port').value = wsPort;

  selectTheme(theme, false);
}

// --- Theme selection ---
function selectTheme(theme, save = true) {
  document.querySelectorAll('.theme-tile').forEach(tile => {
    tile.classList.toggle('selected', tile.dataset.theme === theme);
  });
  if (save) {
    localStorage.setItem(KEYS.theme, theme);
    showStatus('Theme gespeichert.');
  }
}

// --- Save all ---
function saveAll() {
  const wsPort = document.getElementById('input-ws-port').value.trim() || '2947';
  const selectedTile = document.querySelector('.theme-tile.selected');
  const theme = selectedTile ? selectedTile.dataset.theme : 'minimal';

  localStorage.setItem(KEYS.wsPort, wsPort);
  localStorage.setItem(KEYS.theme, theme);

  showStatus('Einstellungen gespeichert!');
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
  loadSettings();

  document.querySelectorAll('.theme-tile').forEach(tile => {
    tile.addEventListener('click', () => selectTheme(tile.dataset.theme));
  });

  document.getElementById('btn-save').addEventListener('click', saveAll);

  document.getElementById('link-overlay').href = 'index.html';
});
