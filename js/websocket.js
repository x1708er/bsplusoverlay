/**
 * BSPlus SongOverlay WebSocket Client
 * Protocol: ws://localhost:2947/socket
 *
 * Message structure:
 *   Handshake: { _type: "handshake", playerName, gameVersion, playerPlatformId, ... }
 *   All game events: { _type: "event", _event: "<name>", <camelCasePayloadField>: {...} }
 *     _event values: "gameState" | "mapInfo" | "score" | "pause" | "resume"
 */
const BSPlusWS = (() => {
  let ws = null;
  let reconnectDelay = 1000;
  const MAX_DELAY = 30000;

  function getPort() {
    return parseInt(localStorage.getItem('bsplusoverlay_wsPort') || '2947', 10);
  }

  function connect() {
    const port = getPort();
    const url = `ws://localhost:${port}/socket`;

    try {
      ws = new WebSocket(url);
    } catch (e) {
      scheduleReconnect();
      return;
    }

    ws.onopen = () => {
      console.log('[BSPlus] Connected to', url);
      reconnectDelay = 1000;
      BSPlusWS.onConnectionChange(true);
    };

    ws.onmessage = (event) => {
      let data;
      try {
        data = JSON.parse(event.data);
      } catch {
        return;
      }
      handleMessage(data);
    };

    ws.onclose = () => {
      console.log('[BSPlus] Disconnected');
      BSPlusWS.onConnectionChange(false);
      scheduleReconnect();
    };

    ws.onerror = () => {
      ws.close();
    };
  }

  function scheduleReconnect() {
    console.log(`[BSPlus] Reconnecting in ${reconnectDelay}ms`);
    setTimeout(() => connect(), reconnectDelay);
    reconnectDelay = Math.min(reconnectDelay * 2, MAX_DELAY);
  }

  function handleMessage(data) {
    // Handshake is its own _type
    if (data._type === 'handshake') {
      BSPlusWS.onHandshake({
        playerName: data.playerName || '',
        gameVersion: data.gameVersion || '',
        pluginVersion: data.pluginVersion || '',
        playerId: data.playerPlatformId || '',
      });
      return;
    }

    // All game events share _type: "event", differentiated by _event
    if (data._type === 'event') {
      switch (data._event) {
        case 'gameState':
          BSPlusWS.onGameState({ state: data.gameStateChanged || '' });
          break;
        case 'mapInfo':
          BSPlusWS.onMapInfo(data.mapInfoChanged || {});
          break;
        case 'score':
          BSPlusWS.onScore(data.scoreEvent || {});
          break;
        case 'pause':
          BSPlusWS.onPause();
          break;
        case 'resume':
          BSPlusWS.onResume();
          break;
        default:
          break;
      }
    }
  }

  return {
    connect,

    // Override these in overlay.js
    onConnectionChange: (_connected) => {},
    onHandshake: (_data) => {},
    onGameState: (_data) => {},
    onMapInfo: (_data) => {},
    onScore: (_data) => {},
    onPause: () => {},
    onResume: () => {},
  };
})();
