/**
 * Overlay DOM updater
 * Wires up BSPlusWS and BeatLeader events to the DOM elements in index.html.
 */

// --- Font loading ---
function applyFont(font) {
  const old = document.getElementById('google-font');
  if (old) old.remove();
  if (font) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.id = 'google-font';
    link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(font)}:wght@400;600;700;800;900&display=swap`;
    document.head.appendChild(link);
    document.body.style.fontFamily = `'${font}', 'Segoe UI', Arial, sans-serif`;
  } else {
    document.body.style.fontFamily = '';
  }
}

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

// --- Accuracy & Streak color helpers ---
function accColorClass(accuracy) {
  if (accuracy >= 0.95) return 'acc-good';
  if (accuracy >= 0.90) return 'acc-ok';
  return 'acc-bad';
}

function streakClass(combo) {
  if (combo >= 200) return 'streak-epic';
  if (combo >= 100) return 'streak-hot';
  if (combo >= 50)  return 'streak-warm';
  return '';
}

function applyAccColor(el, accuracy) {
  el.classList.remove('acc-good', 'acc-ok', 'acc-bad');
  el.classList.add(accColorClass(accuracy));
}

function applyStreakClass(el, combo) {
  el.classList.remove('streak-warm', 'streak-hot', 'streak-epic');
  const cls = streakClass(combo);
  if (cls) el.classList.add(cls);
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

// --- Song history state ---
let lastScoreData = null;   // { score, accuracy, missCount, health } — last received score event
let songWasPlayed = false;  // true once at least one score event arrived for current song
let songHistory = [];       // [{ name, artist, difficulty, coverRaw, score, accuracy, missCount, health, ts }], newest first
let shScrollInterval = null;
let shScrollStep = 0;

// --- Multiplayer state ---
let multiplayerScores = []; // [{ id, name, score, accuracy, combo, missCount, rank }]
let mpAccHistory = {};      // { [playerId]: [{t, acc}] } — sampled every ≥0.5 s
let mpPlayerInfoCache = {}; // { [playerId]: { rank, countryRank, country, pp } | null }
let mpPbScores = {};        // { [playerId]: number | null } — null = pending/no PB

// --- Career counter state ---
let sessionHits = 0;
let sessionMisses = 0;
let prevMissCount = 0;
let prevCombo = 0;
let sessionActive = false;

// --- Session stats state ---
let sessionMapsPlayed = 0;
let sessionFCs = 0;
let sessionBestCombo = 0;

// --- Result screen state ---
let lastBLScore = null;
let resultScreenTimer = null;

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

function updateSessionStats() {
  const show = Config.get('showSessionStats') !== false;
  setVisible('session-stats-panel', show);
  if (!show) return;
  setText('session-maps', sessionMapsPlayed);
  setText('session-fcs', sessionFCs);
  setText('session-combo', sessionBestCombo + 'x');
}

async function flushSession() {
  if (!sessionActive) return;
  sessionActive = false;
  const totalHits = (Config.get('totalHits') || 0) + sessionHits;
  const totalMisses = (Config.get('totalMisses') || 0) + sessionMisses;
  await Config.save({ totalHits, totalMisses });
  updateCareerStatsDisplay();
}

// --- Result Screen ---

function dismissResultScreen() {
  if (resultScreenTimer) {
    clearTimeout(resultScreenTimer);
    resultScreenTimer = null;
  }
  const screen = el('result-screen');
  if (!screen) return;
  screen.classList.add('hidden');
  screen.classList.remove('result-hiding', 'result-entering');
}

function showResultScreen(mapInfo, scoreData, blScore) {
  if (Config.get('showResultScreen') === false) return false;
  if (!scoreData || !mapInfo) return false;

  const isFail = scoreData.health <= 0.001;
  const isFC   = scoreData.missCount === 0 && !isFail;

  const verdictEl = el('result-verdict');
  if (verdictEl) {
    verdictEl.textContent = isFail ? 'FAIL' : 'PASS';
    verdictEl.classList.toggle('result-pass', !isFail);
    verdictEl.classList.toggle('result-fail',  isFail);
  }

  const coverEl = el('result-cover');
  if (coverEl) coverEl.src = mapInfo.coverRaw ? `data:image/png;base64,${mapInfo.coverRaw}` : '';
  setText('result-song-name',   mapInfo.name   || '');
  setText('result-song-artist', mapInfo.artist || '');

  const diffEl = el('result-diff-badge');
  if (diffEl) {
    const diff = mapInfo.difficulty || '';
    diffEl.textContent        = diffLabel(diff);
    diffEl.style.backgroundColor = DIFF_COLORS[diff.toLowerCase()] || '#666';
  }

  setText('result-accuracy', `${(scoreData.accuracy * 100).toFixed(2)}%`);
  setText('result-score',    (scoreData.score || 0).toLocaleString());

  const notesEl = el('result-notes');
  if (notesEl) {
    notesEl.textContent = isFC ? 'FC' : `${scoreData.missCount} miss`;
    notesEl.className   = 'rg-value' + (isFC ? ' result-fc' : isFail ? ' result-fail-val' : '');
  }

  setText('result-combo', `${sessionBestCombo}x`);

  const pp = blScore?.pp;
  setVisible('result-pp-item', !!pp && pp > 0);
  if (pp) setText('result-pp', `${pp.toFixed(2)}pp`);

  const screen = el('result-screen');
  if (!screen) return false;

  screen.classList.remove('hidden', 'result-hiding', 'result-entering');
  void screen.offsetWidth;
  screen.classList.add('result-entering');
  setTimeout(() => screen.classList.remove('result-entering'), 500);

  resultScreenTimer = setTimeout(() => {
    resultScreenTimer = null;
    screen.classList.add('result-hiding');
    setTimeout(() => {
      screen.classList.add('hidden');
      screen.classList.remove('result-hiding');
      setVisible('overlay-menu', true);
      renderSongHistory();
    }, 420);
  }, 4500);

  return true;
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

function renderLeaderboard(scores) {
  const list = el('lb-list');
  if (!list) return;
  const show = Config.get('showLeaderboard') === true;
  if (!show || scores.length === 0) {
    setVisible('leaderboard-panel', false);
    return;
  }
  const playerId = BeatLeader.getPlayerId();
  list.innerHTML = scores.map(s => {
    const isMe = playerId && s.playerId === playerId;
    const accStr = s.accuracy != null ? `${s.accuracy}%` : '—';
    const ppStr  = s.pp > 0 ? `${s.pp.toFixed(2)}pp` : '—';
    const nameStr = s.country
      ? `${s.country.toUpperCase()} ${s.name}`
      : s.name;
    return `
      <div class="lb-row${isMe ? ' lb-me' : ''}">
        <span class="lb-rank">#${s.rank}</span>
        <span class="lb-name">${nameStr}</span>
        <span class="lb-acc">${accStr}</span>
        <span class="lb-pp">${ppStr}</span>
      </div>`;
  }).join('');
  setVisible('leaderboard-panel', true);
}

function renderMultiplayerPanel(scores) {
  const list = el('mp-list');
  if (!list) return;
  const show = Config.get('showMultiplayer') !== false;
  if (!show || scores.length < 2) {
    setVisible('multiplayer-panel', false);
    return;
  }
  const myId = BeatLeader.getPlayerId();
  const showPBDelta = Config.get('showPBDelta') !== false;
  const duration = currentMapInfo ? currentMapInfo.duration / 1000 : 0;
  const progress = duration > 0 && songElapsed > 0 ? Math.min(1, songElapsed / duration) : 0;
  const sorted = [...scores].sort((a, b) => (b.score || 0) - (a.score || 0));
  list.innerHTML = sorted.map((s, i) => {
    const isMe     = myId && s.id === myId;
    const rankCls  = i < 3 ? ` mp-rank-${i + 1}` : '';
    const accStr   = s.accuracy != null ? `${(s.accuracy * 100).toFixed(2)}%` : '—';
    const missStr  = s.missCount != null ? `${s.missCount} miss` : '';
    const accCls   = s.accuracy != null ? ` ${accColorClass(s.accuracy)}` : '';
    const combo    = s.combo || 0;
    const strkCls  = streakClass(combo);
    const blInfo   = s.id ? mpPlayerInfoCache[s.id] : undefined;
    let blSubHtml  = '';
    if (blInfo) {
      const parts = [];
      if (blInfo.rank) parts.push(`#${blInfo.rank.toLocaleString()}`);
      if (blInfo.countryRank && blInfo.country)
        parts.push(`#${blInfo.countryRank.toLocaleString()} ${blInfo.country.toUpperCase()}`);
      if (blInfo.pp) parts.push(`${Math.round(blInfo.pp).toLocaleString()}pp`);
      if (parts.length) blSubHtml = `<div class="mp-bl-sub">${parts.join(' · ')}</div>`;
    }
    const pb = showPBDelta && s.id ? mpPbScores[s.id] : undefined;
    const pbDelta = pb && progress > 0 ? Math.round((s.score || 0) - progress * pb) : null;
    const pbHtml = pbDelta != null
      ? `<span class="mp-pb-delta ${pbDelta >= 0 ? 'pb-ahead' : 'pb-behind'}">${pbDelta >= 0 ? '+' : ''}${pbDelta.toLocaleString()} PB</span>`
      : '';
    return `
      <div class="mp-entry${isMe ? ' mp-entry-me' : ''}">
        <div class="mp-row">
          <span class="mp-rank${rankCls}">${i + 1}</span>
          <span class="mp-name${isMe ? ' mp-name-me' : ''}">${s.name || '?'}</span>
          <span class="mp-score">${(s.score || 0).toLocaleString()}</span>
          <span class="mp-acc${accCls}">${accStr}</span>
          <span class="mp-miss">${missStr}</span>
          <span class="mp-streak${strkCls ? ` ${strkCls}` : ''}">${combo}</span>
          ${pbHtml}
        </div>
        ${blSubHtml}
        <canvas class="mp-acc-graph" width="356" height="18" data-pid="${s.id || ''}"></canvas>
      </div>`;
  }).join('');

  // Draw graphs after DOM is updated
  list.querySelectorAll('canvas.mp-acc-graph').forEach(canvas => {
    const pid = canvas.dataset.pid;
    const history = mpAccHistory[pid] || [];
    const isMe = myId && pid === myId;
    drawMpAccGraph(canvas, history, isMe);
  });

  setVisible('multiplayer-panel', true);
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

// --- Song History ---

function captureAndAddToHistory() {
  if (!currentMapInfo || !songWasPlayed || !lastScoreData) return;
  const maxCount = Math.max(1, Math.min(20, parseInt(Config.get('songHistoryCount'), 10) || 8));
  songHistory.unshift({
    name:       currentMapInfo.name       || '',
    artist:     currentMapInfo.artist     || '',
    difficulty: currentMapInfo.difficulty || '',
    coverRaw:   currentMapInfo.coverRaw   || '',
    score:      lastScoreData.score,
    accuracy:   lastScoreData.accuracy,
    missCount:  lastScoreData.missCount,
    health:     lastScoreData.health,
    ts:         Date.now(),
  });
  sessionMapsPlayed++;
  const isFail = lastScoreData.health <= 0.001;
  if (lastScoreData.missCount === 0 && !isFail) sessionFCs++;
  updateSessionStats();
  while (songHistory.length > maxCount) songHistory.pop();
  songWasPlayed = false;
  lastScoreData = null;
}

function stopHistoryScroll() {
  if (shScrollInterval) {
    clearInterval(shScrollInterval);
    shScrollInterval = null;
  }
}

function startHistoryScroll(rowHeight, totalRows, visibleRows) {
  stopHistoryScroll();
  const speed = Math.max(500, parseInt(Config.get('songHistoryScrollSpeed'), 10) || 3000);
  const maxStep = totalRows - visibleRows;
  const list = el('song-history-list');
  if (!list || maxStep <= 0) return;

  shScrollStep = 0;

  shScrollInterval = setInterval(() => {
    shScrollStep++;
    if (shScrollStep > maxStep) {
      // instant jump back to top, then re-enable smooth transition
      list.style.transition = 'none';
      list.style.transform = 'translateY(0)';
      shScrollStep = 0;
      void list.offsetWidth; // force reflow
      list.style.transition = 'transform 0.7s ease-in-out';
    } else {
      list.style.transition = 'transform 0.7s ease-in-out';
      list.style.transform = `translateY(-${shScrollStep * rowHeight}px)`;
    }
  }, speed);
}

function renderSongHistory() {
  const show = Config.get('showSongHistory') !== false;
  const list = el('song-history-list');
  if (!list) return;

  stopHistoryScroll();

  if (!show || songHistory.length === 0) {
    setVisible('song-history-panel', false);
    return;
  }

  const ROW_H = 44; // matches .sh-row height in CSS
  const visibleRows = Math.max(1, Math.min(8, parseInt(Config.get('songHistoryVisibleRows'), 10) || 3));

  list.innerHTML = songHistory.map(s => {
    const accStr  = s.accuracy != null ? `${(s.accuracy * 100).toFixed(2)}%` : '—';
    const isFail  = s.health <= 0.001;
    const isFC    = s.missCount === 0 && !isFail;
    const missStr = isFail ? 'FAIL' : (isFC ? 'FC' : `${s.missCount} miss`);
    const missClass = isFC ? ' sh-fc' : (isFail ? ' sh-fail' : '');
    const diffColor = DIFF_COLORS[s.difficulty.toLowerCase()] || '#666';
    const coverSrc  = s.coverRaw ? `data:image/png;base64,${s.coverRaw}` : '';
    return `
      <div class="sh-row">
        ${coverSrc
          ? `<img class="sh-cover" src="${coverSrc}" alt="">`
          : '<div class="sh-cover"></div>'}
        <div class="sh-info">
          <div class="sh-name">${s.name || '—'}</div>
          <div class="sh-sub">
            ${s.artist ? `<span>${s.artist}</span>` : ''}
            <span class="sh-diff" style="color:${diffColor}">${diffLabel(s.difficulty)}</span>
          </div>
        </div>
        <div class="sh-stats">
          <span class="sh-acc">${accStr}</span>
          <span class="sh-miss${missClass}">${missStr}</span>
        </div>
      </div>`;
  }).join('');

  // Set viewport height to show exactly visibleRows rows
  const viewport = el('song-history-viewport');
  if (viewport) viewport.style.height = `${visibleRows * ROW_H}px`;

  // Reset scroll position
  list.style.transition = 'none';
  list.style.transform = 'translateY(0)';
  shScrollStep = 0;

  setVisible('song-history-panel', true);

  if (songHistory.length > visibleRows && Config.get('songHistoryScroll') !== false) {
    startHistoryScroll(ROW_H, songHistory.length, visibleRows);
  }
}

// --- Layout config ---
function applyLayoutConfig() {
  const pos   = Config.get('overlayPosition') || 'bottom-left';
  const scale = parseFloat(Config.get('overlayScale')) || 1;

  // Position + animation classes on body
  document.body.className = document.body.className
    .replace(/\bpos-\S+/g, '').replace(/\banim-\S+/g, '').trim();
  if (pos !== 'bottom-left') document.body.classList.add(`pos-${pos}`);
  const anim = Config.get('animationStyle') || 'slide';
  if (anim !== 'slide') document.body.classList.add(`anim-${anim}`);

  // Scale with matching transform-origin
  const origins = {
    'bottom-left':  'bottom left',
    'bottom-right': 'bottom right',
    'top-left':     'top left',
    'top-right':    'top right',
  };
  const origin = origins[pos] || 'bottom left';
  for (const id of ['overlay-playing', 'overlay-menu', 'result-screen']) {
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
  setVisible('session-stats-panel', cfg('showSessionStats'));
  if (!cfg('showPBDelta'))    setVisible('pb-delta',         false);
  if (!cfg('showAccGraph'))   setVisible('acc-graph',        false);
  if (Config.get('showLeaderboard') !== true) setVisible('leaderboard-panel', false);
  if (!cfg('showMultiplayer')) setVisible('multiplayer-panel', false);
  else if (multiplayerScores.length >= 2) renderMultiplayerPanel(multiplayerScores);
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
  if (playing) {
    el('overlay-playing')?.classList.remove('leaving');
    setVisible('overlay-playing', true);
    dismissResultScreen();
    setVisible('overlay-menu', false);
    stopHistoryScroll();
  } else {
    captureAndAddToHistory();
    multiplayerScores = [];
    mpAccHistory = {};
    mpPlayerInfoCache = {};
    mpPbScores = {};
    setVisible('multiplayer-panel', false);
    stopSongTimer();
    await flushSession();
    // Animate out overlay-playing before hiding
    const playingPanel = el('overlay-playing');
    if (Config.get('animationStyle') !== 'none' && playingPanel && !playingPanel.classList.contains('hidden')) {
      playingPanel.classList.add('leaving');
      await new Promise(r => setTimeout(r, 280));
      playingPanel.classList.remove('leaving');
    }
    setVisible('overlay-playing', false);
    const shown = showResultScreen(currentMapInfo, lastScoreData, lastBLScore);
    if (!shown) {
      setVisible('overlay-menu', true);
      renderSongHistory();
    }
    // else: menu is shown after result screen auto-dismisses
  }
};

BSPlusWS.onMapInfo = async (info) => {
  captureAndAddToHistory(); // capture previous song before overwriting currentMapInfo
  dismissResultScreen();
  el('overlay-playing')?.classList.remove('leaving');
  stopHistoryScroll();
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

  // Practice mode indicator
  const speed = info.speed ?? info.timeMultiplier ?? 1.0;
  const isPractice = typeof speed === 'number' && Math.abs(speed - 1.0) > 0.001;
  const practiceEl = el('practice-badge');
  if (practiceEl) {
    practiceEl.textContent = isPractice ? `PRACTICE · ${Math.round(speed * 100)}%` : 'PRACTICE';
    practiceEl.classList.toggle('hidden', !isPractice);
  }

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
  el('accuracy')?.classList.remove('acc-good', 'acc-ok', 'acc-bad');
  el('combo')?.classList.remove('streak-warm', 'streak-hot', 'streak-epic');
  setVisible('streak-badge', false);

  // Hide BeatLeader panels until we have data
  setVisible('beatleader-panel', false);
  setVisible('bl-history-panel', false);

  // Reset PB delta
  pbScore = null;
  setVisible('pb-delta', false);
  const pbEl = el('pb-delta');
  if (pbEl) pbEl.classList.remove('pb-ahead', 'pb-behind');

  // Reset multiplayer panel
  multiplayerScores = [];
  mpAccHistory = {};
  mpPbScores = {};
  setVisible('multiplayer-panel', false);

  // Reset accuracy graph
  accHistory = [];
  setVisible('acc-graph', false);
  const graphCanvas = el('acc-graph');
  if (graphCanvas) graphCanvas.getContext('2d').clearRect(0, 0, graphCanvas.width, graphCanvas.height);

  // Fetch BeatLeader scores
  lastBLScore = null;
  const levelId = info.level_id || '';
  const difficulty = info.difficulty || '';
  if (BeatLeader.getPlayerId()) {
    const blScores = await BeatLeader.fetchMapScores(levelId, difficulty);
    // Find personal best (highest modifiedScore across all attempts)
    if (blScores.length > 0) {
      pbScore = Math.max(...blScores.map(s => s.modifiedScore || 0)) || null;
    }
    const blScore = blScores[0] || null;
    lastBLScore = blScore;
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

    // Fetch global leaderboard (only if enabled, to avoid unnecessary requests)
    if (Config.get('showLeaderboard') === true) {
      const lbCount = Math.max(1, Math.min(10, parseInt(Config.get('blLeaderboardCount'), 10) || 5));
      const lbScores = await BeatLeader.fetchLeaderboard(levelId, difficulty, lbCount);
      renderLeaderboard(lbScores);
    } else {
      setVisible('leaderboard-panel', false);
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

  // Track for song history capture
  lastScoreData = { score: rawScore, accuracy, missCount, health };
  songWasPlayed = true;

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

  if (combo > sessionBestCombo) sessionBestCombo = combo;

  prevMissCount = missCount;
  prevCombo = combo;

  setText('score', rawScore.toLocaleString());
  setText('accuracy', `${(accuracy * 100).toFixed(2)}%`);
  setText('combo', `${combo}x`);
  setText('miss', `${missCount} miss`);
  setProgress('health-bar', health);

  // Accuracy color
  const accEl = el('accuracy');
  if (accEl) applyAccColor(accEl, accuracy);

  // Streak badge + combo color
  const streakEl = el('streak-badge');
  if (streakEl) {
    if (combo > 0) {
      streakEl.textContent = `🔥 ${combo}`;
      applyStreakClass(streakEl, combo);
      setVisible('streak-badge', true);
    } else {
      setVisible('streak-badge', false);
    }
  }
  const comboEl = el('combo');
  if (comboEl) applyStreakClass(comboEl, combo);

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

BSPlusWS.onMultiplayerScore = (scores) => {
  multiplayerScores = scores;
  // Sample each player's accuracy into history (≥0.5 s between samples)
  const t = songElapsed;
  if (t > 0) {
    for (const s of scores) {
      if (!s.id || s.accuracy == null) continue;
      if (!mpAccHistory[s.id]) mpAccHistory[s.id] = [];
      const hist = mpAccHistory[s.id];
      const last = hist[hist.length - 1];
      if (!last || t - last.t >= 0.5) {
        hist.push({ t, acc: s.accuracy * 100 });
      }
    }
  }
  // Fetch BeatLeader profile and PB for any player not yet cached
  for (const s of scores) {
    if (!s.id) continue;
    if (!(s.id in mpPlayerInfoCache)) {
      mpPlayerInfoCache[s.id] = null; // mark as pending so we don't re-fetch
      BeatLeader.fetchAnyPlayerInfo(s.id).then(info => {
        if (info) {
          mpPlayerInfoCache[s.id] = {
            rank: info.rank || null,
            countryRank: info.countryRank || null,
            country: info.country || null,
            pp: info.pp || null,
          };
          renderMultiplayerPanel(multiplayerScores);
        }
      });
    }
    if (!(s.id in mpPbScores) && currentMapInfo) {
      mpPbScores[s.id] = null; // mark as pending
      const { level_id, difficulty } = currentMapInfo;
      BeatLeader.fetchMapScoresForPlayer(s.id, level_id, difficulty, 10).then(blScores => {
        const pb = blScores.length > 0
          ? (Math.max(...blScores.map(b => b.modifiedScore || 0)) || null)
          : null;
        mpPbScores[s.id] = pb;
        renderMultiplayerPanel(multiplayerScores);
      });
    }
  }
  renderMultiplayerPanel(scores);
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

function drawMpAccGraph(canvas, history, isMe) {
  if (!canvas || history.length < 2) return;
  const ctx = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;
  ctx.clearRect(0, 0, W, H);

  const duration = (currentMapInfo?.duration || 0) / 1000;
  const timeSpan = duration > 0 ? duration : history[history.length - 1].t || 1;

  const accValues = history.map(p => p.acc);
  const minAcc = Math.max(0, Math.min(...accValues) - 1);
  const accRange = (100 - minAcc) || 1;

  const toX = t => (t / timeSpan) * W;
  const toY = acc => H - 1 - ((acc - minAcc) / accRange) * (H - 2);

  const color = isMe ? 'rgba(96, 176, 255, 0.9)' : 'rgba(200, 200, 220, 0.65)';
  const fill  = isMe ? 'rgba(96, 176, 255, 0.12)' : 'rgba(200, 200, 220, 0.07)';

  const first = history[0];
  const last  = history[history.length - 1];

  ctx.beginPath();
  ctx.moveTo(toX(first.t), toY(first.acc));
  for (let i = 1; i < history.length; i++) ctx.lineTo(toX(history[i].t), toY(history[i].acc));
  ctx.lineTo(toX(last.t), H);
  ctx.lineTo(toX(first.t), H);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(toX(first.t), toY(first.acc));
  for (let i = 1; i < history.length; i++) ctx.lineTo(toX(history[i].t), toY(history[i].acc));
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.lineJoin = 'round';
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(toX(last.t), toY(last.acc), 2, 0, Math.PI * 2);
  ctx.fillStyle = color;
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
      <div class="ov-section-title">Animation</div>
      <div class="ov-anim-tiles">
        <div class="ov-anim-tile" data-ov-anim="slide">Gleiten</div>
        <div class="ov-anim-tile" data-ov-anim="fade">Einblenden</div>
        <div class="ov-anim-tile" data-ov-anim="bounce">Springen</div>
        <div class="ov-anim-tile" data-ov-anim="none">Keine</div>
      </div>
    </div>

    <div class="ov-section">
      <div class="ov-section-title">Font</div>
      <input type="text" id="ov-font-input" placeholder="Google Font, z.B. Orbitron" style="width:100%;background:rgba(255,255,255,0.07);border:1px solid rgba(255,255,255,0.15);border-radius:5px;color:#fff;padding:5px 8px;font-size:0.75rem;outline:none;">
      <div class="ov-font-presets">
        <button class="ov-font-btn" data-font="Orbitron">Orbitron</button>
        <button class="ov-font-btn" data-font="Rajdhani">Rajdhani</button>
        <button class="ov-font-btn" data-font="Exo 2">Exo 2</button>
        <button class="ov-font-btn" data-font="">Standard</button>
      </div>
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
        <label class="ov-check-label"><input type="checkbox" id="ov-chk-leaderboard"> Leaderboard</label>
        <label class="ov-check-label"><input type="checkbox" id="ov-chk-multiplayer"> Multiplayer</label>
        <label class="ov-check-label"><input type="checkbox" id="ov-chk-songhistory"> Song-Verlauf</label>
        <label class="ov-check-label"><input type="checkbox" id="ov-chk-resultscreen"> Ergebnis-Screen</label>
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
    { id: 'ov-chk-pbdelta',     key: 'showPBDelta'     },
    { id: 'ov-chk-accgraph',     key: 'showAccGraph'     },
    { id: 'ov-chk-leaderboard',  key: 'showLeaderboard',  defaultOn: false },
    { id: 'ov-chk-multiplayer',  key: 'showMultiplayer'  },
    { id: 'ov-chk-songhistory',  key: 'showSongHistory'  },
    { id: 'ov-chk-resultscreen', key: 'showResultScreen' },
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

    const animStyle = Config.get('animationStyle') || 'slide';
    panel.querySelectorAll('[data-ov-anim]').forEach(t =>
      t.classList.toggle('ov-selected', t.dataset.ovAnim === animStyle));

    const fontInput2 = el('ov-font-input');
    if (fontInput2) fontInput2.value = Config.get('customFont') || '';

    OV_CHECKBOXES.forEach(({ id, key, defaultOn = true }) => {
      const chk = el(id);
      if (!chk) return;
      const val = Config.get(key);
      chk.checked = val === undefined ? defaultOn : val !== false;
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
    for (const id of ['overlay-playing', 'overlay-menu', 'result-screen']) {
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

  // Animation tiles
  panel.addEventListener('click', (e) => {
    const animTile = e.target.closest('[data-ov-anim]');
    if (animTile) {
      const style = animTile.dataset.ovAnim;
      panel.querySelectorAll('[data-ov-anim]').forEach(t => t.classList.remove('ov-selected'));
      animTile.classList.add('ov-selected');
      Config.save({ animationStyle: style });
      applyLayoutConfig();
    }
  });

  // Font input — debounced apply + save
  let _fontSaveTimer = null;
  const fontInput = el('ov-font-input');
  if (fontInput) {
    fontInput.addEventListener('input', () => {
      clearTimeout(_fontSaveTimer);
      _fontSaveTimer = setTimeout(() => {
        const font = fontInput.value.trim();
        applyFont(font);
        Config.save({ customFont: font });
      }, 700);
    });
    fontInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        clearTimeout(_fontSaveTimer);
        const font = fontInput.value.trim();
        applyFont(font);
        Config.save({ customFont: font });
      }
    });
  }

  // Font preset buttons
  body.addEventListener('click', (e) => {
    const btn = e.target.closest('.ov-font-btn');
    if (!btn) return;
    const font = btn.dataset.font;
    if (fontInput) fontInput.value = font;
    applyFont(font);
    clearTimeout(_fontSaveTimer);
    Config.save({ customFont: font });
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
    document.body.classList.add('dev-mode');
  }
})();

// --- Init ---
Config.ready.then(() => {
  const link = document.getElementById('theme-css');
  if (link) link.href = `css/theme-${Config.get('theme')}.css`;
  const customStyle = document.getElementById('custom-css');
  if (customStyle) customStyle.textContent = Config.get('customCSS') || '';
  applyFont(Config.get('customFont') || '');
  applyLayoutConfig();
  updateCareerStatsDisplay();
  updateSessionStats();
  initOverlaySettings();
  BSPlusWS.connect();
});
