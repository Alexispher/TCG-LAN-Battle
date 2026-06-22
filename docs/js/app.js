window.PTCGApp = (() => {
  let account = null;
  let publicState = null;
  let privateState = null;
  let resolvedWinnerKey = null;

  const $ = sel => document.querySelector(sel);

  function show(id) {
    document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
    $(id).classList.add("active");
  }

  async function init() {
    await PTCGCards.load();
    account = PTCGAccount.load();
    if (account) {
      PTCGAccount.ensureStarterCollection(account, PTCGCards.starterDeck());
      account = PTCGAccount.load();
      renderMenu();
      show("#screen-menu");
    } else {
      show("#screen-account");
    }
    bindEvents();
    renderDeckList();
  }

  function bindEvents() {
    $("#btn-save-account").addEventListener("click", () => {
      const name = $("#account-name").value.trim() || "Treinador";
      const avatar = $("#account-avatar").value;
      account = PTCGAccount.makeAccount(name, avatar);
      PTCGAccount.ensureStarterCollection(account, PTCGCards.starterDeck());
      account = PTCGAccount.load();
      renderMenu();
      show("#screen-menu");
    });

    $("#btn-reset-account").addEventListener("click", () => {
      if (!confirm("Limpar sua conta local deste navegador?")) return;
      PTCGAccount.reset();
      location.reload();
    });

    $("#btn-create-room").addEventListener("click", createRoom);
    $("#btn-join-room").addEventListener("click", joinRoom);
    $("#btn-deck-builder").addEventListener("click", () => { renderDeckList(); show("#screen-deck"); });
    $("#btn-back-menu").addEventListener("click", () => show("#screen-menu"));
    $("#btn-copy-room").addEventListener("click", copyRoomCode);
    $("#btn-refresh-lobby").addEventListener("click", () => PTCGMqtt.requestLobbyRefresh());
    $("#btn-start-game").addEventListener("click", () => PTCGMqtt.startGame());
    $("#btn-leave-lobby").addEventListener("click", leaveRoom);
    $("#btn-leave-game").addEventListener("click", leaveRoom);
    $("#btn-end-turn").addEventListener("click", () => send({ type: "END_TURN" }));
  }

  function renderMenu() {
    $("#welcome-title").textContent = `Olá, ${account.name}`;
    $("#account-stats").textContent = `Vitórias: ${account.wins || 0} · Derrotas: ${account.losses || 0} · Partidas: ${account.games || 0}`;
  }

  function renderDeckList() {
    const counts = {};
    (account?.activeDeck || PTCGCards.starterDeck()).forEach(id => counts[id] = (counts[id] || 0) + 1);
    const wrap = $("#deck-list");
    wrap.innerHTML = "";
    Object.entries(counts).sort((a,b) => PTCGCards.cardLabel(a[0]).localeCompare(PTCGCards.cardLabel(b[0]))).forEach(([id, count]) => {
      const card = PTCGCards.get(id);
      const div = document.createElement("div");
      div.className = "deck-item";
      div.innerHTML = `<strong>${card?.name || id}</strong><span>${count} cópia(s) · ${card?.supertype || "?"}${card?.trainerType ? " / " + card.trainerType : ""}</span>`;
      wrap.appendChild(div);
    });
  }

  function createRoom() {
    publicState = null;
    privateState = null;
    const room = PTCGMqtt.randomRoom();
    enterRoom(room, true);
  }

  function joinRoom() {
    const room = $("#room-code-input").value.trim().toUpperCase();
    if (!room) return alert("Digite o código da sala.");
    publicState = null;
    privateState = null;
    enterRoom(room, false);
  }

  function enterRoom(room, host) {
    const code = PTCGMqtt.connect({
      room,
      host,
      user: account,
      onStatus: text => $("#connection-status").textContent = text,
      onLobby: renderLobby,
      onPublicState: state => {
        publicState = state;
        renderGame();
        show("#screen-game");
        updateStatsIfFinished(state);
      },
      onPrivateState: state => {
        privateState = state;
        renderGame();
      }
    });
    $("#lobby-room-code").textContent = code;
    $("#game-room-code").textContent = code;
    $("#btn-start-game").style.display = host ? "block" : "none";
    renderLobby([{ id: account.id, name: account.name, avatar: account.avatar }]);
    show("#screen-lobby");
  }

  function leaveRoom() {
    PTCGMqtt.disconnect();
    publicState = null;
    privateState = null;
    resolvedWinnerKey = null;
    show("#screen-menu");
  }

  async function copyRoomCode() {
    const code = PTCGMqtt.getRoomCode();
    try {
      await navigator.clipboard.writeText(code);
      $("#connection-status").textContent = "Código copiado.";
    } catch {
      prompt("Copie o código:", code);
    }
  }

  function renderLobby(players) {
    const wrap = $("#lobby-players");
    wrap.innerHTML = "";
    players.forEach((p, i) => {
      const div = document.createElement("div");
      div.className = "player-chip";
      div.innerHTML = `<strong>${escapeHtml(p.name)}${p.id === account.id ? " (você)" : ""}</strong><span>${i === 0 ? "Host" : "Jogador"}</span>`;
      wrap.appendChild(div);
    });
  }

  function renderGame() {
    if (!publicState) return;
    const me = publicState.players.find(p => p.id === account.id);
    const opp = publicState.players.find(p => p.id !== account.id);
    const current = publicState.players.find(p => p.id === publicState.currentPlayerId);
    const isMyTurn = publicState.currentPlayerId === account.id && publicState.status === "playing";

    $("#turn-label").textContent = publicState.status === "finished"
      ? winnerText(publicState)
      : isMyTurn ? "Sua vez" : `Vez de ${current?.name || "..."}`;

    $("#rules-label").textContent = "Apoiador bloqueado para quem começa no 1º turno; ataque encerra o turno; condições rodam no Pokémon Checkup.";
    $("#stadium-slot").textContent = publicState.stadium ? `Estádio: ${PTCGCards.cardLabel(publicState.stadium.cardId)}` : "Sem estádio";
    $("#hand-count").textContent = privateState ? `(${privateState.hand.length})` : "";

    renderBoard("#opponent-board", opp, false);
    renderBoard("#my-board", me, true);
    renderHand(me, isMyTurn);
    renderChoiceBox();
    renderLog();
    $("#btn-end-turn").disabled = !isMyTurn;
  }

  function winnerText(state) {
    const winner = state.players.find(p => p.id === state.winnerId);
    if (!winner) return "Partida encerrada";
    return winner.id === account.id ? "Você venceu" : `${winner.name} venceu`;
  }

  function updateStatsIfFinished(state) {
    if (state.status !== "finished" || !state.winnerId) return;
    const key = `${PTCGMqtt.getRoomCode()}-${state.winnerId}-${state.turnNumber}`;
    if (resolvedWinnerKey === key) return;
    resolvedWinnerKey = key;
    account.games = (account.games || 0) + 1;
    if (state.winnerId === account.id) account.wins = (account.wins || 0) + 1;
    else account.losses = (account.losses || 0) + 1;
    PTCGAccount.save(account);
    renderMenu();
  }

  function renderBoard(selector, player, mine) {
    const wrap = $(selector);
    wrap.innerHTML = "";
    if (!player) {
      wrap.innerHTML = `<div class="board-title">Aguardando oponente</div>`;
      return;
    }
    const title = document.createElement("div");
    title.className = "board-title";
    title.textContent = `${mine ? "Seu campo" : "Campo adversário"} · mão ${player.handCount} · deck ${player.deckCount} · prêmios ${player.prizeCount}`;
    wrap.appendChild(title);

    const activeRow = document.createElement("div");
    activeRow.className = "pokemon-row";
    activeRow.appendChild(renderPokemonSlot(player.board.active, "Ativo", mine, true));
    wrap.appendChild(activeRow);

    const benchRow = document.createElement("div");
    benchRow.className = "pokemon-row";
    for (let i = 0; i < 5; i++) {
      benchRow.appendChild(renderPokemonSlot(player.board.bench[i], `Banco ${i + 1}`, mine, false));
    }
    wrap.appendChild(benchRow);
  }

  function renderPokemonSlot(pokemon, label, mine, activeSlot) {
    const slot = document.createElement("div");
    slot.className = `slot ${activeSlot ? "active-slot" : ""}`;
    if (!pokemon) {
      slot.textContent = label;
      return slot;
    }
    slot.innerHTML = `<div class="zone-title">${label}</div>`;
    slot.appendChild(renderCard(pokemon.cardId, { compact: true, disabled: true }));
    const meta = document.createElement("div");
    meta.className = "pokemon-meta";
    meta.innerHTML = `
      <span><strong>${pokemon.damage}/${pokemon.hp}</strong> dano/HP</span>
      <span>Energias: ${pokemon.attachedEnergy.length}</span>
      <span>Ferramenta: ${pokemon.tool ? PTCGCards.cardLabel(pokemon.tool) : "—"}</span>
      <span class="conditions">${pokemon.conditions.length ? pokemon.conditions.join(", ") : "sem condição"}</span>
    `;
    slot.appendChild(meta);

    if (mine && publicState?.currentPlayerId === account.id && publicState.status === "playing") {
      const actions = document.createElement("div");
      actions.className = "card-actions";
      if (activeSlot) {
        const c = PTCGCards.get(pokemon.cardId);
        (c.attacks || []).forEach(atk => {
          const b = smallButton(`Atacar: ${atk.name}`, () => send({ type: "ATTACK", attackId: atk.id }));
          actions.appendChild(b);
        });
      } else {
        actions.appendChild(smallButton("Recuar para este", () => send({ type: "RETREAT", targetUid: pokemon.uid })));
      }
      slot.appendChild(actions);
    }
    return slot;
  }

  function renderHand(me, isMyTurn) {
    const hand = $("#my-hand");
    hand.innerHTML = "";
    if (!privateState?.hand) return;
    privateState.hand.forEach(inst => {
      const wrap = document.createElement("div");
      wrap.appendChild(renderCard(inst.cardId, { cardUid: inst.uid }));
      const actions = document.createElement("div");
      actions.className = "card-actions";
      if (isMyTurn && publicState.status === "playing") fillHandActions(actions, inst, me);
      wrap.appendChild(actions);
      hand.appendChild(wrap);
    });
  }

  function fillHandActions(actions, inst, me) {
    const c = PTCGCards.get(inst.cardId);
    if (!c) return;
    const ownPokemons = listOwnPokemon(me);
    if (c.supertype === "pokemon") {
      if ((c.subtypes || []).includes("basic")) {
        if (!me.board.active) actions.appendChild(smallButton("Ativo", () => send({ type: "PLAY_BASIC", cardUid: inst.uid, zone: "active" })));
        if (me.board.bench.length < 5) actions.appendChild(smallButton("Banco", () => send({ type: "PLAY_BASIC", cardUid: inst.uid, zone: "bench" })));
      } else {
        ownPokemons.forEach(p => {
          if (PTCGCards.get(p.cardId)?.name === c.evolvesFrom) {
            actions.appendChild(smallButton(`Evoluir ${PTCGCards.cardLabel(p.cardId)}`, () => send({ type: "EVOLVE", cardUid: inst.uid, targetUid: p.uid })));
          }
        });
      }
    }
    if (c.supertype === "energy") {
      ownPokemons.forEach(p => actions.appendChild(smallButton(`Energia em ${PTCGCards.cardLabel(p.cardId)}`, () => send({ type: "ATTACH_ENERGY", cardUid: inst.uid, targetUid: p.uid }))));
    }
    if (c.supertype === "trainer") {
      if (["stadium", "supporter"].includes(c.trainerType) || ["search-basic-pokemon", "poison-opponent-active", "draw-3"].includes(c.effect)) {
        actions.appendChild(smallButton("Jogar", () => send({ type: "PLAY_TRAINER", cardUid: inst.uid })));
      } else if (c.trainerType === "tool" || c.effect === "heal-30") {
        ownPokemons.forEach(p => actions.appendChild(smallButton(`Usar em ${PTCGCards.cardLabel(p.cardId)}`, () => send({ type: "PLAY_TRAINER", cardUid: inst.uid, targetUid: p.uid }))));
      } else if (c.effect === "switch-own-active") {
        (me.board.bench || []).forEach(p => actions.appendChild(smallButton(`Trocar por ${PTCGCards.cardLabel(p.cardId)}`, () => send({ type: "PLAY_TRAINER", cardUid: inst.uid, targetUid: p.uid }))));
      } else {
        actions.appendChild(smallButton("Jogar", () => send({ type: "PLAY_TRAINER", cardUid: inst.uid })));
      }
    }
  }

  function listOwnPokemon(player) {
    const list = [];
    if (player?.board.active) list.push(player.board.active);
    (player?.board.bench || []).forEach(p => list.push(p));
    return list;
  }

  function renderChoiceBox() {
    const box = $("#choice-box");
    box.innerHTML = "";
    if (!privateState?.pendingChoice) {
      box.classList.add("hidden");
      return;
    }
    const choice = privateState.pendingChoice;
    box.classList.remove("hidden");
    const title = document.createElement("h3");
    title.textContent = choice.prompt;
    box.appendChild(title);
    const grid = document.createElement("div");
    grid.className = "choice-grid";
    choice.cards.forEach(inst => {
      const b = document.createElement("button");
      b.className = "secondary";
      b.textContent = PTCGCards.cardLabel(inst.cardId);
      b.onclick = () => send({ type: "CHOICE_SELECT", choiceId: choice.id, selectedUids: [inst.uid] });
      grid.appendChild(b);
    });
    box.appendChild(grid);
  }

  function renderLog() {
    const log = $("#game-log");
    log.innerHTML = "";
    (publicState.logs || []).slice().reverse().forEach(entry => {
      const div = document.createElement("div");
      div.className = "log-entry";
      div.textContent = entry.text;
      log.appendChild(div);
    });
  }

  function renderCard(cardId, options = {}) {
    const card = PTCGCards.get(cardId);
    const tpl = $("#card-template").content.firstElementChild.cloneNode(true);
    tpl.dataset.type = PTCGCards.typeOf(card);
    tpl.disabled = !!options.disabled;
    tpl.querySelector(".card-name").textContent = card?.name || cardId;
    tpl.querySelector(".card-hp").textContent = card?.hp ? `${card.hp} HP` : (card?.trainerType || card?.energyType || "");
    tpl.querySelector(".card-subtype").textContent = subtypeText(card);
    tpl.querySelector(".card-art").textContent = iconFor(card);
    tpl.querySelector(".card-text").textContent = textFor(card);
    if (options.cardUid) tpl.dataset.cardUid = options.cardUid;
    attachTilt(tpl);
    return tpl;
  }

  function subtypeText(card) {
    if (!card) return "";
    if (card.supertype === "pokemon") return `${card.type || ""} · ${(card.subtypes || []).join(" /")}`;
    if (card.supertype === "energy") return `${card.energyType} energy`;
    return `${card.trainerType || "trainer"}`;
  }

  function iconFor(card) {
    const t = PTCGCards.typeOf(card);
    return ({ fire: "🔥", water: "💧", grass: "🌿", lightning: "⚡", energy: "✦", trainer: "◇" })[t] || "◆";
  }

  function textFor(card) {
    if (!card) return "";
    if (card.ability) return `${card.ability.name}: ${card.ability.text}`;
    if (card.attacks?.length) return card.attacks.map(a => `${a.name} ${a.damage || ""}`).join(" · ");
    return card.text || "";
  }

  function attachTilt(el) {
    function move(ev) {
      const touch = ev.touches ? ev.touches[0] : ev;
      const r = el.getBoundingClientRect();
      const x = Math.max(0, Math.min(1, (touch.clientX - r.left) / r.width));
      const y = Math.max(0, Math.min(1, (touch.clientY - r.top) / r.height));
      const rx = ((0.5 - y) * 12).toFixed(2) + "deg";
      const ry = ((x - 0.5) * 16).toFixed(2) + "deg";
      el.style.setProperty("--mx", `${(x * 100).toFixed(1)}%`);
      el.style.setProperty("--my", `${(y * 100).toFixed(1)}%`);
      el.style.setProperty("--rx", rx);
      el.style.setProperty("--ry", ry);
    }
    function leave() {
      el.style.setProperty("--mx", "50%");
      el.style.setProperty("--my", "50%");
      el.style.setProperty("--rx", "0deg");
      el.style.setProperty("--ry", "0deg");
    }
    el.addEventListener("mousemove", move);
    el.addEventListener("touchmove", move, { passive: true });
    el.addEventListener("mouseleave", leave);
    el.addEventListener("touchend", leave);
  }

  function smallButton(label, onClick) {
    const b = document.createElement("button");
    b.className = "secondary";
    b.type = "button";
    b.textContent = label;
    b.onclick = onClick;
    return b;
  }

  function send(action) {
    PTCGMqtt.sendAction(action);
  }

  function escapeHtml(text) {
    return String(text).replace(/[&<>"]/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]));
  }

  return { init };
})();

document.addEventListener("DOMContentLoaded", () => PTCGApp.init());
