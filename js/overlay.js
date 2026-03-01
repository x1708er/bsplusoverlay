/**
 * Overlay DOM updater
 * Wires up BSPlusWS and BeatLeader events to the DOM elements in index.html.
 */

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

function triggerAnim(id, className, duration = 600) {
  const node = el(id);
  if (!node) return;
  node.classList.remove(className);
  void node.offsetWidth; // force reflow to restart animation
  node.classList.add(className);
  setTimeout(() => node.classList.remove(className), duration);
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

// --- Career counter state ---
let sessionHits = 0;
let sessionMisses = 0;
let prevMissCount = 0;
let prevCombo = 0;
let sessionActive = false;

function updateCareerStatsDisplay() {
  const enabled = Config.get('statsEnabled') !== false;
  setVisible('career-stats', enabled);
  if (!enabled) return;
  const hits = Config.get('totalHits') || 0;
  const misses = Config.get('totalMisses') || 0;
  setText('stat-hits', hits.toLocaleString());
  setText('stat-misses', misses.toLocaleString());
  setText('stat-total', (hits + misses).toLocaleString());
}

async function flushSession() {
  if (!sessionActive) return;
  sessionActive = false;
  const totalHits = (Config.get('totalHits') || 0) + sessionHits;
  const totalMisses = (Config.get('totalMisses') || 0) + sessionMisses;
  await Config.save({ totalHits, totalMisses });
  updateCareerStatsDisplay();
}

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

BSPlusWS.onGameState = async ({ state }) => {
  // state: "Menu" | "Playing"
  const playing = state === 'Playing';
  setVisible('overlay-playing', playing);
  setVisible('overlay-menu', state === 'Menu' || state === 'ResultsScreen');
  if (!playing) {
    stopSongTimer();
    await flushSession();
  }
};

BSPlusWS.onMapInfo = async (info) => {
  currentMapInfo = info;
  stopSongTimer();
  await flushSession();
  sessionHits = 0;
  sessionMisses = 0;
  prevMissCount = 0;
  prevCombo = 0;
  sessionActive = true;
  setVisible('overlay-playing', true);
  setVisible('overlay-menu', false);

  // Staggered entrance animation for overlay panels
  const playingPanel = el('overlay-playing');
  if (playingPanel) {
    playingPanel.classList.remove('entering');
    void playingPanel.offsetWidth;
    playingPanel.classList.add('entering');
    setTimeout(() => playingPanel.classList.remove('entering'), 800);
  }

  // Cover art
  const coverEl = el('cover-art');
  if (coverEl) {
    if (info.coverRaw) {
      coverEl.src = `data:image/png;base64,${info.coverRaw}`;
      triggerAnim('cover-art', 'entering', 500);
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

  // Accumulate per-session hit/miss counters
  const deltaMiss = Math.max(0, missCount - prevMissCount);
  sessionMisses += deltaMiss;
  if (deltaMiss > 0) {
    // Hits that occurred after the miss within this tick
    sessionHits += combo;
  } else if (combo > prevCombo) {
    sessionHits += combo - prevCombo;
  }

  // Animations
  if (deltaMiss > 0) {
    triggerAnim('miss', 'flash', 550);
  }
  const prevMilestone = Math.floor(prevCombo / 100);
  const curMilestone = Math.floor(combo / 100);
  if (curMilestone > prevMilestone && combo > 0) {
    triggerAnim('combo', 'milestone', 600);
  }
  const healthBar = el('health-bar');
  if (healthBar) healthBar.classList.toggle('warning', health < 0.25);

  prevMissCount = missCount;
  prevCombo = combo;

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
Config.ready.then(() => {
  const link = document.getElementById('theme-css');
  if (link) link.href = `css/theme-${Config.get('theme')}.css`;
  updateCareerStatsDisplay();
  BSPlusWS.connect();
});
