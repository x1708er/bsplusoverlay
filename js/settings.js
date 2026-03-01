/**
 * Settings page logic
 * Loads and saves settings via the Config module (config.json on the server).
 */

// --- Load saved values ---
function loadSettings() {
  document.getElementById('input-ws-host').value = Config.get('wsHost');
  document.getElementById('input-ws-port').value = Config.get('wsPort');
  document.getElementById('chk-stats-enabled').checked = Config.get('statsEnabled') !== false;
  document.getElementById('chk-bl-pp').checked    = Config.get('blShowPP')    !== false;
  document.getElementById('chk-bl-acc').checked   = Config.get('blShowAcc')   !== false;
  document.getElementById('chk-bl-stars').checked = Config.get('blShowStars') !== false;
  document.getElementById('chk-bl-rank').checked  = Config.get('blShowRank')  !== false;
  document.getElementById('chk-bl-fc').checked     = Config.get('blShowFC')     !== false;
  document.getElementById('chk-bl-date').checked   = Config.get('blShowDate')   !== false;
  document.getElementById('chk-bl-maxpp').checked  = Config.get('blShowMaxPP')  !== false;
  document.getElementById('chk-bl-ppgain').checked = Config.get('blShowPPGain') !== false;
  document.getElementById('chk-bl-history').checked       = Config.get('blShowHistory') !== false;
  document.getElementById('input-bl-history-count').value = Config.get('blHistoryCount') || 5;
  // Layout
  selectPosition(Config.get('overlayPosition') || 'bottom-left', false);
  const scalePct = Math.round((parseFloat(Config.get('overlayScale')) || 1) * 100);
  document.getElementById('input-scale').value = scalePct;
  document.getElementById('scale-display').textContent = `${scalePct}%`;
  document.getElementById('chk-show-songcard').checked = Config.get('showSongCard')   !== false;
  document.getElementById('chk-show-progress').checked = Config.get('showProgress')   !== false;
  document.getElementById('chk-show-score').checked    = Config.get('showScorePanel') !== false;
  document.getElementById('chk-show-health').checked   = Config.get('showHealthBar')  !== false;
  selectTheme(Config.get('theme'), false);
  updateStatsDisplay();
}

// --- Position selection ---
function selectPosition(pos, save = true) {
  document.querySelectorAll('.pos-tile').forEach(tile => {
    tile.classList.toggle('selected', tile.dataset.pos === pos);
  });
  if (save) {
    Config.save({ overlayPosition: pos }).then(() => showStatus('Position gespeichert.'));
  }
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
  const blShowPP    = document.getElementById('chk-bl-pp').checked;
  const blShowAcc   = document.getElementById('chk-bl-acc').checked;
  const blShowStars = document.getElementById('chk-bl-stars').checked;
  const blShowRank  = document.getElementById('chk-bl-rank').checked;
  const blShowFC      = document.getElementById('chk-bl-fc').checked;
  const blShowDate    = document.getElementById('chk-bl-date').checked;
  const blShowMaxPP   = document.getElementById('chk-bl-maxpp').checked;
  const blShowPPGain  = document.getElementById('chk-bl-ppgain').checked;
  const blShowHistory = document.getElementById('chk-bl-history').checked;
  const blHistoryCount = Math.max(1, Math.min(10, parseInt(document.getElementById('input-bl-history-count').value, 10) || 5));
  // Layout
  const selectedPos = document.querySelector('.pos-tile.selected');
  const overlayPosition = selectedPos ? selectedPos.dataset.pos : 'bottom-left';
  const overlayScale = Math.round(parseInt(document.getElementById('input-scale').value, 10) || 100) / 100;
  const showSongCard   = document.getElementById('chk-show-songcard').checked;
  const showProgress   = document.getElementById('chk-show-progress').checked;
  const showScorePanel = document.getElementById('chk-show-score').checked;
  const showHealthBar  = document.getElementById('chk-show-health').checked;

  Config.save({
    wsHost, wsPort, theme, statsEnabled,
    blShowPP, blShowAcc, blShowStars, blShowRank, blShowFC, blShowDate, blShowMaxPP, blShowPPGain, blShowHistory, blHistoryCount,
    overlayPosition, overlayScale, showSongCard, showProgress, showScorePanel, showHealthBar,
  }).then(() => showStatus('Einstellungen gespeichert!'));
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

    document.querySelectorAll('.pos-tile').forEach(tile => {
      tile.addEventListener('click', () => selectPosition(tile.dataset.pos));
    });

    document.getElementById('input-scale').addEventListener('input', e => {
      document.getElementById('scale-display').textContent = `${e.target.value}%`;
    });

    document.querySelectorAll('.theme-tile').forEach(tile => {
      tile.addEventListener('click', () => selectTheme(tile.dataset.theme));
    });

    document.getElementById('btn-save').addEventListener('click', saveAll);
    document.getElementById('btn-reset-stats').addEventListener('click', resetStats);
    document.getElementById('link-overlay').href = 'index.html';
  });
});
