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

  /**
   * Find score for a specific map level_id from the player's recent scores.
   * @param {string} levelId - BSPlus level_id (e.g. "custom_level_ABCD1234...")
   * @param {string} difficulty - difficulty string (Easy/Normal/Hard/Expert/ExpertPlus)
   * @returns {object|null}
   */
  async function fetchScoreForMap(levelId, difficulty) {
    const playerId = getPlayerId();
    if (!playerId || !levelId || !BASE) return null;

    // Normalize level hash: BSPlus uses "custom_level_HASH" format
    const hashMatch = levelId.match(/custom_level_([0-9A-Fa-f]+)/i);
    const hash = hashMatch ? hashMatch[1].toLowerCase() : null;

    try {
      const url = `${BASE}/player/${encodeURIComponent(playerId)}/scores?sortBy=date&order=desc&count=10`;
      const res = await fetch(url);
      if (!res.ok) return null;
      const data = await res.json();
      const scores = data.data || data.scores || [];

      const match = scores.find(s => {
        const leaderboard = s.leaderboard || s.song || {};
        const songHash = (leaderboard.songHash || leaderboard.hash || '').toLowerCase();
        const diff = (leaderboard.difficulty?.difficultyName || leaderboard.difficultyName || '').toLowerCase();
        const normalizedDiff = normalizeDifficulty(difficulty);
        return hash && songHash === hash && diff === normalizedDiff;
      });

      if (!match) return null;

      return {
        pp: match.pp || 0,
        accuracy: match.accuracy ? (match.accuracy * 100).toFixed(2) : null,
        rank: match.rank || null,
        timeset: match.timeset || match.timeSet || null,
        modifiedScore: match.modifiedScore || match.score || null,
      };
    } catch {
      return null;
    }
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

  return {
    setPlayerId,
    getPlayerId,
    fetchPlayerInfo,
    fetchScoreForMap,
  };
})();
