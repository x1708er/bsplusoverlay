/**
 * BeatLeader API Wrapper
 * Fetches recent scores for a player and matches them against the current map.
 */
const BeatLeader = (() => {
  // On localhost (server.py) use the built-in proxy (/bl/...) to work around
  // BeatLeader's missing CORS headers. Everywhere else hit the API directly.
  const BASE = (() => {
    const { hostname, port, protocol } = window.location;
    if (protocol === 'file:') return null; // no fetching from file://
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return `http://${hostname}:${port || 7273}/bl`;
    }
    return 'https://api.beatleader.xyz';
  })();

  let cachedPlayerId = null;
  let cachedPlayerInfo = null;
  const anyPlayerInfoCache = new Map(); // { playerId → playerData }

  function setPlayerId(id) {
    if (id && id !== cachedPlayerId) {
      cachedPlayerId = id;
      cachedPlayerInfo = null; // invalidate cached info on ID change
    }
  }

  function getPlayerId() {
    return cachedPlayerId || '';
  }

  async function fetchPlayerInfo(playerId) {
    if (!playerId || !BASE) return null;
    if (cachedPlayerId === playerId && cachedPlayerInfo) return cachedPlayerInfo;

    try {
      const res = await fetch(`${BASE}/player/${encodeURIComponent(playerId)}`);
      if (!res.ok) return null;
      const data = await res.json();
      cachedPlayerId = playerId;
      cachedPlayerInfo = data;
      return data;
    } catch {
      return null;
    }
  }

  async function fetchAnyPlayerInfo(playerId) {
    if (!playerId || !BASE) return null;
    if (anyPlayerInfoCache.has(playerId)) return anyPlayerInfoCache.get(playerId);
    anyPlayerInfoCache.set(playerId, null); // mark pending
    try {
      const res = await fetch(`${BASE}/player/${encodeURIComponent(playerId)}`);
      if (!res.ok) return null;
      const data = await res.json();
      anyPlayerInfoCache.set(playerId, data);
      return data;
    } catch {
      return null;
    }
  }

  /**
   * Fetch all of the player's scores for a specific map, sorted by date desc.
   * Works for both ranked and unranked maps.
   * @param {string} levelId - BSPlus level_id (e.g. "custom_level_ABCD1234...")
   * @param {string} difficulty - difficulty string from BSPlus (e.g. "ExpertPlus")
   * @param {number} count - how many recent player scores to search through (default 100)
   * @returns {object[]}
   */
  async function fetchMapScores(levelId, difficulty, count = 100) {
    const playerId = getPlayerId();
    if (!playerId || !levelId || !BASE) return [];

    const hashMatch = levelId.match(/custom_level_([0-9A-Fa-f]+)/i);
    const hash = hashMatch ? hashMatch[1].toLowerCase() : null;
    if (!hash) return [];

    try {
      // Fetch player's recent scores.
      // type=0 includes all score types (ranked + unranked).
      const url = `${BASE}/player/${encodeURIComponent(playerId)}/scores` +
        `?sortBy=date&order=desc&count=${count}&type=0`;
      console.log('[BL] fetching:', url);
      const res = await fetch(url);
      console.log('[BL] status:', res.status);
      if (!res.ok) return [];
      const data = await res.json();
      const allScores = data.data || data.scores || [];
      console.log('[BL] total scores returned:', allScores.length);
      const normalizedDiff = normalizeDifficulty(difficulty);

      // hash is nested at leaderboard.song.hash (not leaderboard.songHash)
      const matched = allScores.filter(s => {
        const song = s.leaderboard?.song || {};
        const songHash = (song.hash || '').toLowerCase();
        const diff = normalizeDifficulty(s.leaderboard?.difficulty?.difficultyName || '');
        return songHash === hash && diff === normalizedDiff;
      });
      console.log('[BL] matched for this map:', matched.length);

      return matched.map(s => {
        const diffData = s.leaderboard?.difficulty || {};
        // timeset is unix timestamp in seconds, not an ISO string
        const tsMs = s.timeset ? parseInt(s.timeset) * 1000 : null;
        return {
          pp: s.pp || 0,
          accuracy: s.accuracy ? (s.accuracy * 100).toFixed(2) : null,
          rank: s.rank || null,
          modifiedScore: s.modifiedScore || s.baseScore || null,
          stars: diffData.stars || null,
          maxPP: diffData.maxPP || null,
          fc: !!(s.fullCombo || s.fc),
          misses: (s.missedNotes || 0) + (s.badCuts || 0) + (s.bombCuts || 0),
          maxCombo: s.maxCombo || null,
          timeset: tsMs,
          timeago: timeAgo(tsMs),
        };
      });
    } catch (e) {
      console.error('[BL] fetchMapScores error:', e);
      return [];
    }
  }

  async function fetchScoreForMap(levelId, difficulty) {
    const scores = await fetchMapScores(levelId, difficulty, 10);
    return scores[0] || null;
  }

  function timeAgo(isoString) {
    if (!isoString) return null;
    const diff = Date.now() - new Date(isoString).getTime();
    const hours = Math.floor(diff / 3600000);
    if (hours < 1) return 'gerade';
    if (hours < 24) return `vor ${hours}h`;
    const days = Math.floor(diff / 86400000);
    if (days < 7) return `vor ${days}d`;
    if (days < 30) return `vor ${Math.floor(days / 7)}w`;
    if (days < 365) return `vor ${Math.floor(days / 30)}mo`;
    return `vor ${Math.floor(days / 365)}y`;
  }

  // Converts any BSPlus difficulty string to BeatLeader's canonical form
  // used in the leaderboard/hash endpoint (e.g. "ExpertPlus", "Expert", "Hard")
  function toBLDifficulty(diff) {
    if (!diff) return '';
    const map = {
      'expertplus': 'ExpertPlus',
      'expert+':    'ExpertPlus',
      'expert':     'Expert',
      'hard':       'Hard',
      'normal':     'Normal',
      'easy':       'Easy',
    };
    return map[diff.toLowerCase()] || diff;
  }

  function normalizeDifficulty(diff) {
    if (!diff) return '';
    const map = {
      'expertplus': 'expertplus',
      'expert+': 'expertplus',
      'expert': 'expert',
      'hard': 'hard',
      'normal': 'normal',
      'easy': 'easy',
    };
    return map[diff.toLowerCase()] || diff.toLowerCase();
  }

  /**
   * Fetch the global leaderboard for a specific map + difficulty.
   * @param {string} levelId - BSPlus level_id (e.g. "custom_level_ABCD1234...")
   * @param {string} difficulty - difficulty string from BSPlus
   * @param {number} count - number of top scores to fetch (default 5)
   * @returns {object[]}
   */
  async function fetchLeaderboard(levelId, difficulty, count = 5) {
    if (!levelId || !BASE) return [];
    const hashMatch = levelId.match(/custom_level_([0-9A-Fa-f]+)/i);
    const hash = hashMatch ? hashMatch[1].toLowerCase() : null;
    if (!hash) return [];

    const blDiff = toBLDifficulty(difficulty);
    const url = `${BASE}/leaderboard/hash/${hash}?difficulty=${encodeURIComponent(blDiff)}&page=1&count=${count}`;
    try {
      const res = await fetch(url);
      if (!res.ok) return [];
      const data = await res.json();
      const scores = data.scores || [];
      return scores.map(s => ({
        rank:     s.rank,
        name:     s.player?.name    || '?',
        country:  s.player?.country || '',
        accuracy: s.accuracy != null ? (s.accuracy * 100).toFixed(2) : null,
        pp:       s.pp || 0,
        fc:       !!(s.fullCombo),
      }));
    } catch (e) {
      console.error('[BL] fetchLeaderboard error:', e);
      return [];
    }
  }

  return {
    setPlayerId,
    getPlayerId,
    fetchPlayerInfo,
    fetchAnyPlayerInfo,
    fetchMapScores,
    fetchScoreForMap,
    fetchLeaderboard,
  };
})();
