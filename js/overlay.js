/**
 * Overlay DOM updater
 * Wires up BSPlusWS and BeatLeader events to the DOM elements in index.html.
 */

// --- Theme loader ---
(function loadTheme() {
  const theme = localStorage.getItem('bsplusoverlay_theme') || 'minimal';
  const link = document.getElementById('theme-css');
  if (link) link.href = `css/theme-${theme}.css`;
})();

// --- Helpers ---
function el(id) {
  return document.getElementById(id);
}

function setText(id, value) {
  const node = el(id);
  if (node) node.textContent = value ?? '';
}

function setVisible(id, visible) {
  const node = el(id);
  if (node) node.classList.toggle('hidden', !visible);
}

function setProgress(id, fraction) {
  const node = el(id);
  if (node) node.style.width = `${Math.max(0, Math.min(1, fraction)) * 100}%`;
}

const DIFF_COLORS = {
  easy: '#3cb371',
  normal: '#59b0f4',
  hard: '#ff6347',
  expert: '#bf2626',
  expertplus: '#8b1a8b',
  'expert+': '#8b1a8b',
};

function diffLabel(diff) {
  if (!diff) return '';
  const map = {
    expertplus: 'Expert+',
    'expert+': 'Expert+',
    expert: 'Expert',
    hard: 'Hard',
    normal: 'Normal',
    easy: 'Easy',
  };
  return map[diff.toLowerCase()] || diff;
}

// --- State ---
let currentMapInfo = null;
let songTimerInterval = null;
let songStartTime = 0;
let songElapsed = 0;
let isPaused = false;

// --- Song timer (client-side fallback) ---
function startSongTimer(duration, startFrom = 0) {
  stopSongTimer();
  songElapsed = startFrom;
  songStartTime = Date.now() - startFrom * 1000;
  isPaused = false;

  songTimerInterval = setInterval(() => {
    if (isPaused) return;
    songElapsed = (Date.now() - songStartTime) / 1000;
    if (duration > 0) {
      setProgress('progress-bar', songElapsed / duration);
      setText('time-current', formatTime(songElapsed));
      setText('time-total', formatTime(duration));
    }
  }, 250);
}

function stopSongTimer() {
  if (songTimerInterval) {
    clearInterval(songTimerInterval);
    songTimerInterval = null;
  }
}

function formatTime(seconds) {
  const s = Math.floor(seconds);
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

// --- BSPlus event handlers ---
BSPlusWS.onConnectionChange = (connected) => {
  setVisible('connection-warning', !connected);
};

async function loadPlayerAvatar(playerId) {
  if (!playerId) return;
  const info = await BeatLeader.fetchPlayerInfo(playerId);
  const avatarEl = el('player-avatar');
  if (!avatarEl || !info?.avatar) return;
  const base = `${window.location.protocol}//${window.location.hostname}:${window.location.port || 7273}`;
  avatarEl.onerror = () => { avatarEl.removeAttribute('src'); };
  avatarEl.src = `${base}/img?url=${encodeURIComponent(info.avatar)}`;
}

BSPlusWS.onHandshake = ({ playerName, playerId }) => {
  setText('player-name', playerName);
  if (playerId) BeatLeader.setPlayerId(playerId);
  loadPlayerAvatar(playerId);
};

BSPlusWS.onGameState = ({ state }) => {
  // state: "Menu" | "Playing"
  const playing = state === 'Playing';
  setVisible('overlay-playing', playing);
  setVisible('overlay-menu', state === 'Menu' || state === 'ResultsScreen');
  if (!playing) stopSongTimer();
};

BSPlusWS.onMapInfo = async (info) => {
  currentMapInfo = info;
  stopSongTimer();
  setVisible('overlay-playing', true);
  setVisible('overlay-menu', false);

  // Cover art
  const coverEl = el('cover-art');
  if (coverEl) {
    if (info.coverRaw) {
      coverEl.src = `data:image/png;base64,${info.coverRaw}`;
    } else {
      coverEl.src = '';
    }
  }

  setText('song-name', info.name || '');
  setText('song-artist', info.artist || '');
  setText('song-mapper', info.mapper || '');
  setText('bpm', info.BPM ? `${Math.round(info.BPM)} BPM` : '');

  // Difficulty badge
  const diffEl = el('difficulty-badge');
  if (diffEl) {
    const diff = info.difficulty || '';
    diffEl.textContent = diffLabel(diff);
    diffEl.style.backgroundColor = DIFF_COLORS[diff.toLowerCase()] || '#666';
  }

  // Duration: BSPlus sends milliseconds → convert to seconds
  const duration = (info.duration || 0) / 1000;
  setText('time-total', formatTime(duration));
  setText('time-current', '0:00');
  setProgress('progress-bar', 0);

  // Reset score elements
  setText('score', '0');
  setText('accuracy', '100.00%');
  setText('combo', '0');
  setText('miss', '0');
  setProgress('health-bar', 1);

  // Hide BeatLeader panel until we have data
  setVisible('beatleader-panel', false);

  // Fetch BeatLeader score
  const levelId = info.level_id || '';
  const difficulty = info.difficulty || '';
  if (BeatLeader.getPlayerId()) {
    const blScore = await BeatLeader.fetchScoreForMap(levelId, difficulty);
    if (blScore) {
      setText('bl-pp', blScore.pp ? `${blScore.pp.toFixed(2)}pp` : '—');
      setText('bl-acc', blScore.accuracy ? `${blScore.accuracy}%` : '—');
      setText('bl-rank', blScore.rank ? `#${blScore.rank}` : '—');
      setVisible('beatleader-panel', true);
    }
  }
};

BSPlusWS.onScore = (score) => {
  const rawScore = score.score ?? 0;
  const accuracy = score.accuracy ?? 1;
  const combo = score.combo ?? 0;
  const missCount = score.missCount ?? 0;
  const health = score.currentHealth ?? 1;
  const time = score.time ?? 0;

  setText('score', rawScore.toLocaleString());
  setText('accuracy', `${(accuracy * 100).toFixed(2)}%`);
  setText('combo', `${combo}x`);
  setText('miss', `${missCount} miss`);
  setProgress('health-bar', health);

  // duration stored in ms, time from scoreEvent in seconds
  const duration = (currentMapInfo?.duration || 0) / 1000;
  if (duration > 0) {
    setProgress('progress-bar', time / duration);
    setText('time-current', formatTime(time));
    songElapsed = time;
    songStartTime = Date.now() - time * 1000;
  }
};

BSPlusWS.onPause = () => {
  isPaused = true;
  setVisible('pause-indicator', true);
};

BSPlusWS.onResume = () => {
  isPaused = false;
  songStartTime = Date.now() - songElapsed * 1000;
  setVisible('pause-indicator', false);
};

// --- Dev mode link ---
(function devMode() {
  const params = new URLSearchParams(window.location.search);
  if (params.get('dev') === '1') {
    setVisible('dev-link', true);
  }
})();

// --- Init ---
BSPlusWS.connect();
