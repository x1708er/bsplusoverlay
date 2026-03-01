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
let pbScore = null;
let accHistory = []; // { t, acc } — sampled every ≥0.5 s

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

function renderBLHistory(scores) {
  const list = el('bl-history-list');
  if (!list) return;
  const show = Config.get('blShowHistory') !== false;
  const count = Math.max(1, Math.min(10, parseInt(Config.get('blHistoryCount'), 10) || 5));
  if (!show || scores.length === 0) {
    setVisible('bl-history-panel', false);
    return;
  }
  list.innerHTML = scores.slice(0, count).map(s => `
    <div class="bl-hist-row">
      <span class="bl-hist-date">${s.timeago || '—'}</span>
      <span class="bl-hist-acc">${s.accuracy ? s.accuracy + '%' : '—'}</span>
      <span class="bl-hist-fc${s.fc ? ' is-fc' : ''}">${s.fc ? 'FC' : s.misses + ' miss'}</span>
      <span class="bl-hist-pp">${s.pp ? s.pp.toFixed(2) + 'pp' : '—'}</span>
      <span class="bl-hist-rank">${s.rank ? '#' + s.rank : '—'}</span>
    </div>
  `).join('');
  setVisible('bl-history-panel', true);
}

// --- Layout config ---
function applyLayoutConfig() {
  const pos   = Config.get('overlayPosition') || 'bottom-left';
  const scale = parseFloat(Config.get('overlayScale')) || 1;

  // Position class on body
  document.body.className = document.body.className.replace(/\bpos-\S+/g, '').trim();
  if (pos !== 'bottom-left') document.body.classList.add(`pos-${pos}`);

  // Scale with matching transform-origin
  const origins = {
    'bottom-left':  'bottom left',
    'bottom-right': 'bottom right',
    'top-left':     'top left',
    'top-right':    'top right',
  };
  const origin = origins[pos] || 'bottom left';
  for (const id of ['overlay-playing', 'overlay-menu']) {
    const node = el(id);
    if (!node) continue;
    node.style.transformOrigin = origin;
    // Use !important to override CSS animations (fill-mode: both on #overlay-menu keeps
    // transform: translateY(0) active, which would otherwise beat a normal inline style)
    if (scale !== 1) {
      node.style.setProperty('transform', `scale(${scale})`, 'important');
    } else {
      node.style.removeProperty('transform');
    }
  }

  // Panel visibility
  const cfg = key => Config.get(key) !== false;
  setVisible('song-card',          cfg('showSongCard'));
  setVisible('progress-container', cfg('showProgress'));
  setVisible('time-row',           cfg('showProgress'));
  setVisible('score-panel',        cfg('showScorePanel'));
  setVisible('health-container',   cfg('showHealthBar'));
  if (!cfg('showPBDelta')) setVisible('pb-delta', false);
  if (!cfg('showAccGraph')) setVisible('acc-graph', false);
}

// --- BSPlus event handlers ---
BSPlusWS.onConnectionChange = (connected) => {
  setVisible('connection-warning', !connected);
};

async function loadPlayerAvatar(playerId) {
  if (!playerId) return;
  const info = await BeatLeader.fetchPlayerInfo(playerId);
  const avatarEl = el('player-avatar');
  if (avatarEl && info?.avatar) {
    const base = `${window.location.protocol}//${window.location.hostname}:${window.location.port || 7273}`;
    avatarEl.onerror = () => { avatarEl.removeAttribute('src'); };
    avatarEl.src = `${base}/img?url=${encodeURIComponent(info.avatar)}`;
  }
  if (info?.rank) {
    const parts = [`#${info.rank.toLocaleString()}`];
    if (info.countryRank && info.country)
      parts.push(`#${info.countryRank.toLocaleString()} ${info.country.toUpperCase()}`);
    else if (info.country)
      parts.push(info.country.toUpperCase());
    if (info.pp) parts.push(`${Math.round(info.pp).toLocaleString()} pp`);
    setText('player-bl-stats', parts.join(' · '));
    setVisible('player-bl-stats', true);
  }
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

  // Hide BeatLeader panels until we have data
  setVisible('beatleader-panel', false);
  setVisible('bl-history-panel', false);

  // Reset PB delta
  pbScore = null;
  setVisible('pb-delta', false);
  const pbEl = el('pb-delta');
  if (pbEl) pbEl.classList.remove('pb-ahead', 'pb-behind');

  // Reset accuracy graph
  accHistory = [];
  setVisible('acc-graph', false);
  const graphCanvas = el('acc-graph');
  if (graphCanvas) graphCanvas.getContext('2d').clearRect(0, 0, graphCanvas.width, graphCanvas.height);

  // Fetch BeatLeader scores
  const levelId = info.level_id || '';
  const difficulty = info.difficulty || '';
  if (BeatLeader.getPlayerId()) {
    const blScores = await BeatLeader.fetchMapScores(levelId, difficulty);
    // Find personal best (highest modifiedScore across all attempts)
    if (blScores.length > 0) {
      pbScore = Math.max(...blScores.map(s => s.modifiedScore || 0)) || null;
    }
    const blScore = blScores[0] || null;
    if (blScore) {
      const cfg = key => Config.get(key) !== false;
      const ppGain = (blScore.maxPP && blScore.pp) ? blScore.maxPP - blScore.pp : null;

      setVisible('bl-item-pp',     cfg('blShowPP')     && blScore.pp > 0);
      setVisible('bl-item-acc',    cfg('blShowAcc'));
      setVisible('bl-item-rank',   cfg('blShowRank'));
      setVisible('bl-item-stars',  cfg('blShowStars')  && !!blScore.stars);
      setVisible('bl-item-fc',     cfg('blShowFC'));
      setVisible('bl-item-date',   cfg('blShowDate')   && !!blScore.timeago);
      setVisible('bl-item-maxpp',  cfg('blShowMaxPP')  && !!blScore.maxPP);
      setVisible('bl-item-ppgain', cfg('blShowPPGain') && ppGain !== null && ppGain > 0);

      setText('bl-pp',     blScore.pp       ? `${blScore.pp.toFixed(2)}pp`            : '—');
      setText('bl-acc',    blScore.accuracy ? `${blScore.accuracy}%`                  : '—');
      setText('bl-rank',   blScore.rank     ? `#${blScore.rank}`                      : '—');
      setText('bl-stars',  blScore.stars    ? `★ ${Number(blScore.stars).toFixed(2)}` : '—');
      setText('bl-fc',     blScore.fc       ? 'FC' : `${blScore.misses} miss`);
      setText('bl-date',   blScore.timeago  || '—');
      setText('bl-maxpp',  blScore.maxPP    ? `${Number(blScore.maxPP).toFixed(2)}pp` : '—');
      setText('bl-ppgain', ppGain !== null  ? `↑${ppGain.toFixed(2)}pp`              : '—');

      setVisible('beatleader-panel', true);
    }
    renderBLHistory(blScores);
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

  // PB delta — compare current score against personal best pace
  if (pbScore && Config.get('showPBDelta') !== false && duration > 0 && time > 0) {
    const progress = Math.min(1, time / duration);
    const delta = rawScore - progress * pbScore;
    const pbEl = el('pb-delta');
    if (pbEl) {
      pbEl.classList.toggle('pb-ahead',  delta >= 0);
      pbEl.classList.toggle('pb-behind', delta < 0);
      pbEl.textContent = (delta >= 0 ? '+' : '') + Math.round(delta).toLocaleString() + ' vs PB';
      setVisible('pb-delta', true);
    }
  }

  // Accuracy graph — sample every ≥0.5 s
  if (Config.get('showAccGraph') !== false && time > 0) {
    const lastPt = accHistory[accHistory.length - 1];
    if (!lastPt || time - lastPt.t >= 0.5) {
      accHistory.push({ t: time, acc: accuracy * 100 });
    }
    if (accHistory.length >= 2) {
      setVisible('acc-graph', true);
      drawAccGraph();
    }
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

// --- Accuracy Graph ---
function drawAccGraph() {
  const canvas = el('acc-graph');
  if (!canvas || accHistory.length < 2) return;
  const ctx = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;
  ctx.clearRect(0, 0, W, H);

  const duration = (currentMapInfo?.duration || 0) / 1000;
  const timeSpan = duration > 0 ? duration : accHistory[accHistory.length - 1].t || 1;

  const accValues = accHistory.map(p => p.acc);
  const minAcc = Math.max(0, Math.min(...accValues) - 1);
  const accRange = (100 - minAcc) || 1;

  const toX = t => (t / timeSpan) * W;
  const toY = acc => H - 1 - ((acc - minAcc) / accRange) * (H - 2);

  const first = accHistory[0];
  const last  = accHistory[accHistory.length - 1];

  // Fill under line
  ctx.beginPath();
  ctx.moveTo(toX(first.t), toY(first.acc));
  for (let i = 1; i < accHistory.length; i++) {
    ctx.lineTo(toX(accHistory[i].t), toY(accHistory[i].acc));
  }
  ctx.lineTo(toX(last.t), H);
  ctx.lineTo(toX(first.t), H);
  ctx.closePath();
  ctx.fillStyle = 'rgba(96, 176, 255, 0.15)';
  ctx.fill();

  // Stroke line
  ctx.beginPath();
  ctx.moveTo(toX(first.t), toY(first.acc));
  for (let i = 1; i < accHistory.length; i++) {
    ctx.lineTo(toX(accHistory[i].t), toY(accHistory[i].acc));
  }
  ctx.strokeStyle = 'rgba(96, 176, 255, 0.9)';
  ctx.lineWidth = 1.5;
  ctx.lineJoin = 'round';
  ctx.stroke();

  // Current value dot
  ctx.beginPath();
  ctx.arc(toX(last.t), toY(last.acc), 2.5, 0, Math.PI * 2);
  ctx.fillStyle = '#60b0ff';
  ctx.fill();
}

// --- In-Overlay Settings Panel ---

function buildSettingsPanelHTML() {
  return `
    <div class="ov-section">
      <div class="ov-section-title">Theme</div>
      <div class="ov-theme-tiles">
        <div class="ov-theme-tile" data-ov-theme="minimal">
          <div class="ov-theme-preview ov-prev-minimal"></div>
          <div class="ov-tile-label">Minimal</div>
        </div>
        <div class="ov-theme-tile" data-ov-theme="neon">
          <div class="ov-theme-preview ov-prev-neon"></div>
          <div class="ov-tile-label">Neon</div>
        </div>
        <div class="ov-theme-tile" data-ov-theme="glass">
          <div class="ov-theme-preview ov-prev-glass"></div>
          <div class="ov-tile-label">Glass</div>
        </div>
      </div>
    </div>

    <div class="ov-section">
      <div class="ov-section-title">Position</div>
      <div class="ov-pos-grid">
        <div class="ov-pos-tile" data-ov-pos="top-left">↖ Oben links</div>
        <div class="ov-pos-tile" data-ov-pos="top-right">↗ Oben rechts</div>
        <div class="ov-pos-tile" data-ov-pos="bottom-left">↙ Unten links</div>
        <div class="ov-pos-tile" data-ov-pos="bottom-right">↘ Unten rechts</div>
      </div>
    </div>

    <div class="ov-section">
      <div class="ov-section-title">Größe <span id="ov-scale-display" style="color:#60b0ff">100%</span></div>
      <input type="range" id="ov-scale" min="60" max="150" step="5" value="100">
    </div>

    <div class="ov-section">
      <div class="ov-section-title">Elemente</div>
      <div class="ov-check-grid">
        <label class="ov-check-label"><input type="checkbox" id="ov-chk-songcard"> Song-Karte</label>
        <label class="ov-check-label"><input type="checkbox" id="ov-chk-progress"> Fortschritt</label>
        <label class="ov-check-label"><input type="checkbox" id="ov-chk-score"> Score</label>
        <label class="ov-check-label"><input type="checkbox" id="ov-chk-health"> Health</label>
        <label class="ov-check-label"><input type="checkbox" id="ov-chk-pbdelta"> PB-Delta</label>
        <label class="ov-check-label"><input type="checkbox" id="ov-chk-accgraph"> Acc-Graph</label>
      </div>
    </div>

    <div class="ov-section">
      <div class="ov-section-title">BeatLeader</div>
      <div class="ov-check-grid">
        <label class="ov-check-label"><input type="checkbox" id="ov-chk-bl-pp"> PP</label>
        <label class="ov-check-label"><input type="checkbox" id="ov-chk-bl-acc"> Acc</label>
        <label class="ov-check-label"><input type="checkbox" id="ov-chk-bl-stars"> Stars</label>
        <label class="ov-check-label"><input type="checkbox" id="ov-chk-bl-rank"> Rank</label>
        <label class="ov-check-label"><input type="checkbox" id="ov-chk-bl-fc"> FC</label>
        <label class="ov-check-label"><input type="checkbox" id="ov-chk-bl-date"> Datum</label>
        <label class="ov-check-label"><input type="checkbox" id="ov-chk-bl-maxpp"> Max PP</label>
        <label class="ov-check-label"><input type="checkbox" id="ov-chk-bl-ppgain"> PP Gain</label>
      </div>
    </div>
  `;
}

function initOverlaySettings() {
  const zone     = el('ov-hover-zone');
  const trigger  = el('ov-settings-trigger');
  const panel    = el('ov-settings-panel');
  const closeBtn = el('ov-settings-close');
  const body     = el('ov-settings-body');
  if (!zone || !trigger || !panel || !closeBtn || !body) return;

  body.innerHTML = buildSettingsPanelHTML();

  let panelOpen = false;

  const OV_CHECKBOXES = [
    { id: 'ov-chk-songcard',  key: 'showSongCard'    },
    { id: 'ov-chk-progress',  key: 'showProgress'    },
    { id: 'ov-chk-score',     key: 'showScorePanel'  },
    { id: 'ov-chk-health',    key: 'showHealthBar'   },
    { id: 'ov-chk-bl-pp',     key: 'blShowPP'        },
    { id: 'ov-chk-bl-acc',    key: 'blShowAcc'       },
    { id: 'ov-chk-bl-stars',  key: 'blShowStars'     },
    { id: 'ov-chk-bl-rank',   key: 'blShowRank'      },
    { id: 'ov-chk-bl-fc',     key: 'blShowFC'        },
    { id: 'ov-chk-bl-date',   key: 'blShowDate'      },
    { id: 'ov-chk-bl-maxpp',  key: 'blShowMaxPP'     },
    { id: 'ov-chk-bl-ppgain', key: 'blShowPPGain'    },
    { id: 'ov-chk-pbdelta',   key: 'showPBDelta'     },
    { id: 'ov-chk-accgraph',  key: 'showAccGraph'    },
  ];

  function syncPanelValues() {
    const theme = Config.get('theme') || 'minimal';
    panel.querySelectorAll('[data-ov-theme]').forEach(t =>
      t.classList.toggle('ov-selected', t.dataset.ovTheme === theme));

    const pos = Config.get('overlayPosition') || 'bottom-left';
    panel.querySelectorAll('[data-ov-pos]').forEach(t =>
      t.classList.toggle('ov-selected', t.dataset.ovPos === pos));

    const scale = parseFloat(Config.get('overlayScale')) || 1;
    const scaleSlider  = el('ov-scale');
    const scaleDisplay = el('ov-scale-display');
    if (scaleSlider)  scaleSlider.value = Math.round(scale * 100);
    if (scaleDisplay) scaleDisplay.textContent = `${Math.round(scale * 100)}%`;

    OV_CHECKBOXES.forEach(({ id, key }) => {
      const chk = el(id);
      if (chk) chk.checked = Config.get(key) !== false;
    });
  }

  function openPanel() {
    panelOpen = true;
    document.body.classList.add('ov-hover');
    panel.classList.add('open');
    syncPanelValues();
  }

  function closePanel() {
    panelOpen = false;
    panel.classList.remove('open');
  }

  // Hover zone: show/hide trigger
  zone.addEventListener('mouseenter', () => document.body.classList.add('ov-hover'));
  zone.addEventListener('mouseleave', () => { if (!panelOpen) document.body.classList.remove('ov-hover'); });

  // Trigger click: toggle panel
  trigger.addEventListener('click', () => panelOpen ? closePanel() : openPanel());

  // Close button
  closeBtn.addEventListener('click', (e) => { e.stopPropagation(); closePanel(); });

  // Click outside panel/trigger → close
  document.addEventListener('click', (e) => {
    if (!panelOpen) return;
    if (!panel.contains(e.target) && !trigger.contains(e.target)) closePanel();
  });

  // Theme tiles + position tiles
  panel.addEventListener('click', (e) => {
    const themeTile = e.target.closest('[data-ov-theme]');
    if (themeTile) {
      const theme = themeTile.dataset.ovTheme;
      panel.querySelectorAll('[data-ov-theme]').forEach(t => t.classList.remove('ov-selected'));
      themeTile.classList.add('ov-selected');
      const link = document.getElementById('theme-css');
      if (link) link.href = `css/theme-${theme}.css`;
      clearTimeout(_scaleSaveTimer);   // cancel any pending slider save before saving
      Config.save({ theme });
      return;
    }

    const posTile = e.target.closest('[data-ov-pos]');
    if (posTile) {
      const pos = posTile.dataset.ovPos;
      panel.querySelectorAll('[data-ov-pos]').forEach(t => t.classList.remove('ov-selected'));
      posTile.classList.add('ov-selected');
      clearTimeout(_scaleSaveTimer);
      Config.save({ overlayPosition: pos });
      applyLayoutConfig();
    }
  });

  // Scale slider — apply immediately, debounce the save to prevent racing other saves
  let _scaleSaveTimer = null;
  body.addEventListener('input', (e) => {
    if (e.target.id !== 'ov-scale') return;
    const val = parseFloat(e.target.value) / 100;
    const disp = el('ov-scale-display');
    if (disp) disp.textContent = `${e.target.value}%`;
    // Apply scale immediately without waiting for network
    for (const id of ['overlay-playing', 'overlay-menu']) {
      const node = el(id);
      if (!node) continue;
      if (val !== 1) {
        node.style.setProperty('transform', `scale(${val})`, 'important');
      } else {
        node.style.removeProperty('transform');
      }
    }
    // Debounce: send only one POST after user stops dragging
    clearTimeout(_scaleSaveTimer);
    _scaleSaveTimer = setTimeout(() => Config.save({ overlayScale: val }), 500);
  });

  // Checkboxes — apply immediately, save without blocking
  body.addEventListener('change', (e) => {
    if (e.target.type !== 'checkbox') return;
    const entry = OV_CHECKBOXES.find(c => c.id === e.target.id);
    if (!entry) return;
    Config.save({ [entry.key]: e.target.checked });
    applyLayoutConfig();
  });
}

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
  const customStyle = document.getElementById('custom-css');
  if (customStyle) customStyle.textContent = Config.get('customCSS') || '';
  applyLayoutConfig();
  updateCareerStatsDisplay();
  initOverlaySettings();
  BSPlusWS.connect();
});
