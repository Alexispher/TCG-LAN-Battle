/* Static GitHub Pages multiplayer via MQTT over WebSocket. */
window.PTCGMqtt = (() => {
  const BROKER_URL = "wss://broker.emqx.io:8084/mqtt";
  const NS = "pegasus/pockettcg/v1";

  let client = null;
  let roomCode = "";
  let account = null;
  let isHost = false;
  let hostFullState = null;
  let lobbyPlayers = [];
  let callbacks = {};

  function randomRoom() {
    const part = Math.random().toString(36).slice(2, 8).toUpperCase();
    return `PEGASUS-${part}`;
  }

  function topics() {
    const base = `${NS}/${roomCode}`;
    return {
      lobby: `${base}/lobby`,
      actions: `${base}/actions`,
      state: `${base}/state`,
      private: `${base}/private/${account.id}`
    };
  }

  function connect({ room, host, user, onStatus, onLobby, onPublicState, onPrivateState }) {
    roomCode = room || randomRoom();
    isHost = !!host;
    account = user;
    callbacks = { onStatus, onLobby, onPublicState, onPrivateState };
    lobbyPlayers = [{ id: account.id, name: account.name, avatar: account.avatar, deck: account.activeDeck }];
    hostFullState = null;

    if (client) {
      try { client.end(true); } catch (_) {}
    }

    client = mqtt.connect(BROKER_URL, {
      clientId: `ptcg_${account.id.slice(0, 8)}_${Math.random().toString(16).slice(2, 8)}`,
      clean: true,
      reconnectPeriod: 1800,
      connectTimeout: 9000
    });

    client.on("connect", () => {
      const t = topics();
      client.subscribe(t.lobby);
      client.subscribe(t.state);
      client.subscribe(t.private);
      client.subscribe(t.actions);
      callbacks.onStatus?.("Conectado ao MQTT.");
      if (isHost) {
        publishLobby();
      } else {
        publish(t.lobby, { type: "JOIN", player: lobbyPlayers[0] });
      }
    });

    client.on("reconnect", () => callbacks.onStatus?.("Reconectando ao MQTT..."));
    client.on("error", err => callbacks.onStatus?.(`Erro MQTT: ${err.message}`));

    client.on("message", (topic, payload) => {
      let msg;
      try { msg = JSON.parse(payload.toString()); } catch { return; }
      const t = topics();

      if (topic === t.lobby) handleLobby(msg);
      if (topic === t.actions && isHost) handleHostAction(msg);
      if (topic === t.state) callbacks.onPublicState?.(msg);
      if (topic === t.private) callbacks.onPrivateState?.(msg);
    });

    return roomCode;
  }

  function disconnect() {
    if (client) {
      try { client.end(true); } catch (_) {}
    }
    client = null;
    roomCode = "";
    isHost = false;
    hostFullState = null;
    lobbyPlayers = [];
  }

  function publish(topic, data) {
    if (!client || !client.connected) return;
    client.publish(topic, JSON.stringify(data));
  }

  function publishLobby() {
    if (!isHost) return;
    publish(topics().lobby, { type: "LOBBY", roomCode, players: lobbyPlayers.map(p => ({ id: p.id, name: p.name, avatar: p.avatar })) });
    callbacks.onLobby?.(lobbyPlayers);
  }

  function handleLobby(msg) {
    if (msg.type === "JOIN" && isHost) {
      const exists = lobbyPlayers.some(p => p.id === msg.player.id);
      if (!exists) lobbyPlayers.push(msg.player);
      publishLobby();
    }
    if (msg.type === "LOBBY") {
      callbacks.onLobby?.(msg.players || []);
    }
    if (msg.type === "PING" && isHost) publishLobby();
  }

  function sendAction(action) {
    publish(topics().actions, { ...action, senderId: account.id, at: Date.now() });
  }

  function requestLobbyRefresh() {
    publish(topics().lobby, { type: "PING", senderId: account.id, at: Date.now() });
  }

  function startGame() {
    if (!isHost) return;
    if (lobbyPlayers.length !== 2) {
      callbacks.onStatus?.("A partida demonstrativa exige exatamente 2 jogadores.");
      return;
    }
    const playerInputs = lobbyPlayers.map(p => ({
      id: p.id,
      name: p.name,
      avatar: p.avatar,
      deck: Array.isArray(p.deck) && p.deck.length ? p.deck : account.activeDeck
    }));
    hostFullState = PTCGRules.createMatch(playerInputs);
    publishFullState();
  }

  function handleHostAction(action) {
    if (!hostFullState) return;
    if (action.type === "REQUEST_SYNC") {
      publishFullState();
      return;
    }
    PTCGRules.processAction(hostFullState, action);
    publishFullState();
  }

  function publishFullState() {
    if (!isHost || !hostFullState) return;
    const pub = PTCGRules.publicState(hostFullState);
    publish(topics().state, pub);
    callbacks.onPublicState?.(pub);

    hostFullState.players.forEach(p => {
      const privateTopic = `${NS}/${roomCode}/private/${p.id}`;
      const priv = PTCGRules.privateState(hostFullState, p.id);
      publish(privateTopic, priv);
      if (p.id === account.id) callbacks.onPrivateState?.(priv);
    });
  }

  function getRoomCode() { return roomCode; }
  function getIsHost() { return isHost; }

  return { randomRoom, connect, disconnect, sendAction, requestLobbyRefresh, startGame, getRoomCode, getIsHost };
})();
