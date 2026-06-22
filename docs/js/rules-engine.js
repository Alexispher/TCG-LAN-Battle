/*
  Pocket TCG rules engine.
  Host is authoritative. Clients only send actions.
*/
window.PTCGRules = (() => {
  const CONDITIONS = {
    POISONED: "poisoned",
    BURNED: "burned",
    PARALYZED: "paralyzed",
    ASLEEP: "asleep",
    CONFUSED: "confused"
  };

  function uid(prefix = "C") {
    return prefix + "_" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
  }

  function shuffle(arr) {
    const copy = arr.slice();
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function card(id) {
    return PTCGCards.get(id);
  }

  function isBasicPokemon(cardId) {
    const c = card(cardId);
    return c && c.supertype === "pokemon" && (c.subtypes || []).includes("basic");
  }

  function makeCardInstances(deckIds) {
    return deckIds.map(cardId => ({ uid: uid("C"), cardId }));
  }

  function addLog(full, text) {
    full.logs.push({ at: Date.now(), text });
    if (full.logs.length > 90) full.logs.shift();
  }

  function getPublicPlayer(full, playerId) {
    return full.players.find(p => p.id === playerId);
  }

  function getPrivate(full, playerId) {
    return full.privateByPlayer[playerId];
  }

  function opponentId(full, playerId) {
    return full.players.find(p => p.id !== playerId)?.id;
  }

  function ownBoardPokemon(publicPlayer) {
    const list = [];
    if (publicPlayer.board.active) list.push(publicPlayer.board.active);
    publicPlayer.board.bench.forEach(p => list.push(p));
    return list;
  }

  function findOwnPokemon(publicPlayer, pokemonUid) {
    if (publicPlayer.board.active && publicPlayer.board.active.uid === pokemonUid) {
      return { pokemon: publicPlayer.board.active, zone: "active", index: -1 };
    }
    const index = publicPlayer.board.bench.findIndex(p => p.uid === pokemonUid);
    if (index >= 0) return { pokemon: publicPlayer.board.bench[index], zone: "bench", index };
    return null;
  }

  function removeFromHand(priv, cardUid) {
    const index = priv.hand.findIndex(c => c.uid === cardUid);
    if (index < 0) throw new Error("Carta não encontrada na mão.");
    return priv.hand.splice(index, 1)[0];
  }

  function pushDiscard(full, playerId, instanceOrCardId) {
    const p = getPublicPlayer(full, playerId);
    const cardId = typeof instanceOrCardId === "string" ? instanceOrCardId : instanceOrCardId.cardId;
    p.board.discard.push(cardId);
  }

  function drawCards(full, playerId, amount) {
    const priv = getPrivate(full, playerId);
    const publicPlayer = getPublicPlayer(full, playerId);
    for (let i = 0; i < amount; i++) {
      if (priv.deck.length === 0) {
        full.winnerId = opponentId(full, playerId);
        full.status = "finished";
        addLog(full, `${publicPlayer.name} tentou comprar carta com deck vazio.`);
        return;
      }
      priv.hand.push(priv.deck.shift());
    }
  }

  function hasEnergyCost(pokemon, attackCost) {
    const energies = pokemon.attachedEnergy.map(e => card(e.cardId)?.energyType).filter(Boolean);
    const pool = energies.slice();
    for (const cost of attackCost) {
      if (cost === "colorless") {
        if (pool.length < 1) return false;
        pool.pop();
      } else {
        const idx = pool.indexOf(cost);
        if (idx < 0) return false;
        pool.splice(idx, 1);
      }
    }
    return true;
  }

  function pokemonHp(pokemon) {
    return card(pokemon.cardId)?.hp || 0;
  }

  function makePokemon(instance, turnNumber) {
    return {
      uid: uid("P"),
      instanceUid: instance.uid,
      cardId: instance.cardId,
      damage: 0,
      attachedEnergy: [],
      tool: null,
      conditions: [],
      turnPlayed: turnNumber,
      turnEvolved: null
    };
  }

  function boardSummaryPokemon(p) {
    if (!p) return null;
    return {
      uid: p.uid,
      cardId: p.cardId,
      damage: p.damage,
      hp: pokemonHp(p),
      attachedEnergy: p.attachedEnergy.map(e => e.cardId),
      tool: p.tool ? p.tool.cardId : null,
      conditions: p.conditions.slice()
    };
  }

  function createMatch(playerInputs) {
    const players = playerInputs.map(input => ({
      id: input.id,
      name: input.name,
      avatar: input.avatar,
      handCount: 0,
      deckCount: 0,
      prizeCount: 0,
      flags: { energyPlayed: false, supporterPlayed: false, retreated: false },
      board: { active: null, bench: [], discard: [] }
    }));

    const full = {
      status: "playing",
      createdAt: Date.now(),
      players,
      privateByPlayer: {},
      currentPlayerId: players[0].id,
      firstPlayerId: players[0].id,
      turnNumber: 1,
      stadium: null,
      logs: [],
      winnerId: null
    };

    for (const input of playerInputs) {
      const deck = shuffle(makeCardInstances(input.deck));
      const priv = { deck, hand: [], prizes: [], pendingChoice: null };
      full.privateByPlayer[input.id] = priv;

      let attempts = 0;
      do {
        priv.deck = shuffle(priv.deck.concat(priv.hand));
        priv.hand = [];
        for (let i = 0; i < 7; i++) priv.hand.push(priv.deck.shift());
        attempts++;
      } while (!priv.hand.some(c => isBasicPokemon(c.cardId)) && attempts < 10);

      for (let i = 0; i < 6; i++) {
        if (priv.deck.length) priv.prizes.push(priv.deck.shift());
      }

      const player = getPublicPlayer(full, input.id);
      const activeIndex = priv.hand.findIndex(c => isBasicPokemon(c.cardId));
      if (activeIndex >= 0) {
        const [activeCard] = priv.hand.splice(activeIndex, 1);
        player.board.active = makePokemon(activeCard, full.turnNumber);
      }
      while (player.board.bench.length < 2) {
        const idx = priv.hand.findIndex(c => isBasicPokemon(c.cardId));
        if (idx < 0) break;
        const [benchCard] = priv.hand.splice(idx, 1);
        player.board.bench.push(makePokemon(benchCard, full.turnNumber));
      }
    }

    drawCards(full, full.currentPlayerId, 1);
    addLog(full, "Partida iniciada. Pokémon Básicos foram colocados automaticamente para acelerar o teste.");
    syncCounts(full);
    return full;
  }

  function syncCounts(full) {
    full.players.forEach(p => {
      const priv = getPrivate(full, p.id);
      if (!priv) return;
      p.handCount = priv.hand.length;
      p.deckCount = priv.deck.length;
      p.prizeCount = priv.prizes.length;
    });
  }

  function publicState(full) {
    syncCounts(full);
    return {
      status: full.status,
      currentPlayerId: full.currentPlayerId,
      firstPlayerId: full.firstPlayerId,
      turnNumber: full.turnNumber,
      stadium: full.stadium ? { ownerId: full.stadium.ownerId, cardId: full.stadium.cardId } : null,
      logs: full.logs.slice(-60),
      winnerId: full.winnerId,
      players: full.players.map(p => ({
        id: p.id,
        name: p.name,
        avatar: p.avatar,
        handCount: p.handCount,
        deckCount: p.deckCount,
        prizeCount: p.prizeCount,
        flags: clone(p.flags),
        board: {
          active: boardSummaryPokemon(p.board.active),
          bench: p.board.bench.map(boardSummaryPokemon),
          discard: p.board.discard.slice(-18)
        }
      }))
    };
  }

  function privateState(full, playerId) {
    const priv = getPrivate(full, playerId);
    if (!priv) return null;
    return {
      hand: clone(priv.hand),
      deckCount: priv.deck.length,
      prizeCount: priv.prizes.length,
      pendingChoice: clone(priv.pendingChoice)
    };
  }

  function isOwnTurn(full, playerId) {
    return full.currentPlayerId === playerId && full.status === "playing";
  }

  function currentTurnPlayer(full) {
    return getPublicPlayer(full, full.currentPlayerId);
  }

  function isFirstPlayerFirstTurn(full, playerId) {
    return full.turnNumber === 1 && full.firstPlayerId === playerId;
  }

  function restoreFullState(target, snapshot) {
    Object.keys(target).forEach(key => delete target[key]);
    Object.assign(target, snapshot);
  }

  function processAction(full, action) {
    const snapshot = full ? clone(full) : null;
    try {
      if (!full || full.status !== "playing") return full;
      const playerId = action.senderId;
      if (action.type === "CHOICE_SELECT") {
        actionChoiceSelect(full, playerId, action);
        syncCounts(full);
        return full;
      }
      if (!isOwnTurn(full, playerId)) throw new Error("Não é sua vez.");
      const priv = getPrivate(full, playerId);
      if (priv?.pendingChoice) throw new Error("Resolva a escolha pendente antes de continuar.");

      switch (action.type) {
        case "PLAY_BASIC": actionPlayBasic(full, playerId, action); break;
        case "EVOLVE": actionEvolve(full, playerId, action); break;
        case "ATTACH_ENERGY": actionAttachEnergy(full, playerId, action); break;
        case "PLAY_TRAINER": actionPlayTrainer(full, playerId, action); break;
        case "ATTACK": actionAttack(full, playerId, action); break;
        case "RETREAT": actionRetreat(full, playerId, action); break;
        case "END_TURN": endTurn(full, playerId); break;
        default: break;
      }
      syncCounts(full);
    } catch (error) {
      if (snapshot) restoreFullState(full, snapshot);
      addLog(full, `Ação recusada: ${error.message}`);
    }
    return full;
  }

  function actionPlayBasic(full, playerId, action) {
    const player = getPublicPlayer(full, playerId);
    const priv = getPrivate(full, playerId);
    const instance = removeFromHand(priv, action.cardUid);
    const c = card(instance.cardId);
    if (!c || c.supertype !== "pokemon" || !(c.subtypes || []).includes("basic")) throw new Error("Somente Pokémon Básico pode ser colocado direto.");
    if (action.zone === "active") {
      if (player.board.active) throw new Error("Você já tem Pokémon Ativo.");
      player.board.active = makePokemon(instance, full.turnNumber);
    } else {
      if (player.board.bench.length >= 5) throw new Error("Banco cheio.");
      player.board.bench.push(makePokemon(instance, full.turnNumber));
    }
    addLog(full, `${player.name} colocou ${c.name} no ${action.zone === "active" ? "Ativo" : "Banco"}.`);
  }

  function actionEvolve(full, playerId, action) {
    const player = getPublicPlayer(full, playerId);
    const priv = getPrivate(full, playerId);
    const target = findOwnPokemon(player, action.targetUid);
    if (!target) throw new Error("Pokémon alvo não encontrado.");
    if (target.pokemon.turnPlayed === full.turnNumber) throw new Error("Este Pokémon entrou neste turno e ainda não pode evoluir.");
    if (target.pokemon.turnEvolved === full.turnNumber) throw new Error("Este Pokémon já evoluiu neste turno.");
    const instance = removeFromHand(priv, action.cardUid);
    const evo = card(instance.cardId);
    const base = card(target.pokemon.cardId);
    if (!evo || evo.supertype !== "pokemon" || !(evo.subtypes || []).some(s => s.startsWith("stage"))) throw new Error("Carta não é evolução.");
    if (evo.evolvesFrom !== base.name) throw new Error(`${evo.name} não evolui de ${base.name}.`);
    pushDiscard(full, playerId, target.pokemon.cardId);
    target.pokemon.cardId = evo.id;
    target.pokemon.turnEvolved = full.turnNumber;
    target.pokemon.conditions = [];
    addLog(full, `${player.name} evoluiu ${base.name} para ${evo.name}.`);
  }

  function actionAttachEnergy(full, playerId, action) {
    const player = getPublicPlayer(full, playerId);
    if (player.flags.energyPlayed) throw new Error("Você já anexou Energia neste turno.");
    const target = findOwnPokemon(player, action.targetUid);
    if (!target) throw new Error("Pokémon alvo não encontrado.");
    const priv = getPrivate(full, playerId);
    const instance = removeFromHand(priv, action.cardUid);
    const c = card(instance.cardId);
    if (!c || c.supertype !== "energy") throw new Error("Esta carta não é Energia.");
    target.pokemon.attachedEnergy.push(instance);
    player.flags.energyPlayed = true;
    addLog(full, `${player.name} anexou ${c.name} em ${card(target.pokemon.cardId).name}.`);
  }

  function actionPlayTrainer(full, playerId, action) {
    const player = getPublicPlayer(full, playerId);
    const priv = getPrivate(full, playerId);
    const instance = removeFromHand(priv, action.cardUid);
    const c = card(instance.cardId);
    if (!c || c.supertype !== "trainer") throw new Error("Esta carta não é Treinador.");

    if (c.trainerType === "supporter") {
      if (isFirstPlayerFirstTurn(full, playerId)) throw new Error("Quem começa não pode jogar Apoiador no primeiro turno.");
      if (player.flags.supporterPlayed) throw new Error("Você já jogou um Apoiador neste turno.");
      player.flags.supporterPlayed = true;
    }

    if (c.trainerType === "stadium") {
      if (full.stadium) pushDiscard(full, full.stadium.ownerId, full.stadium.cardId);
      full.stadium = { ownerId: playerId, cardId: c.id, effect: c.effect };
      addLog(full, `${player.name} colocou o Estádio ${c.name}.`);
      return;
    }

    if (c.trainerType === "tool") {
      const target = findOwnPokemon(player, action.targetUid);
      if (!target) throw new Error("Escolha um Pokémon para anexar a Ferramenta.");
      if (target.pokemon.tool) throw new Error("Este Pokémon já tem Ferramenta.");
      target.pokemon.tool = instance;
      addLog(full, `${player.name} anexou ${c.name} em ${card(target.pokemon.cardId).name}.`);
      return;
    }

    pushDiscard(full, playerId, instance);
    resolveTrainerEffect(full, playerId, c, action);
  }

  function resolveTrainerEffect(full, playerId, c, action) {
    const player = getPublicPlayer(full, playerId);
    const opp = getPublicPlayer(full, opponentId(full, playerId));
    if (c.effect === "draw-3") {
      drawCards(full, playerId, 3);
      addLog(full, `${player.name} usou ${c.name} e comprou 3 cartas.`);
    }
    if (c.effect === "heal-30") {
      const target = findOwnPokemon(player, action.targetUid) || { pokemon: player.board.active };
      if (!target.pokemon) throw new Error("Não há alvo para curar.");
      target.pokemon.damage = Math.max(0, target.pokemon.damage - 30);
      addLog(full, `${player.name} curou 30 de ${card(target.pokemon.cardId).name}.`);
    }
    if (c.effect === "switch-own-active") {
      const target = findOwnPokemon(player, action.targetUid);
      if (!target || target.zone !== "bench") throw new Error("Escolha um Pokémon do Banco para trocar.");
      switchActiveWithBench(player, target.index);
      addLog(full, `${player.name} trocou seu Pokémon Ativo.`);
    }
    if (c.effect === "poison-opponent-active") {
      if (!opp?.board.active) throw new Error("Oponente sem Ativo.");
      addCondition(opp.board.active, CONDITIONS.POISONED);
      addLog(full, `${player.name} usou ${c.name}. O Ativo adversário ficou Envenenado.`);
    }
    if (c.effect === "search-basic-pokemon") {
      const priv = getPrivate(full, playerId);
      const allowed = priv.deck.filter(inst => isBasicPokemon(inst.cardId));
      if (allowed.length === 0) {
        addLog(full, `${player.name} usou ${c.name}, mas não encontrou Pokémon Básico no deck.`);
        return;
      }
      priv.pendingChoice = {
        id: uid("Q"),
        type: "search-basic-pokemon",
        prompt: "Escolha 1 Pokémon Básico do deck para colocar na mão.",
        cards: allowed.map(inst => ({ uid: inst.uid, cardId: inst.cardId })),
        amount: 1
      };
      addLog(full, `${player.name} está buscando uma carta no deck.`);
    }
  }

  function addCondition(pokemon, condition) {
    if (!pokemon.conditions.includes(condition)) pokemon.conditions.push(condition);
  }

  function removeCondition(pokemon, condition) {
    pokemon.conditions = pokemon.conditions.filter(c => c !== condition);
  }

  function actionChoiceSelect(full, playerId, action) {
    const priv = getPrivate(full, playerId);
    const player = getPublicPlayer(full, playerId);
    if (!priv?.pendingChoice || priv.pendingChoice.id !== action.choiceId) throw new Error("Escolha pendente inválida.");
    const choice = priv.pendingChoice;
    if (choice.type === "search-basic-pokemon") {
      const selectedUid = (action.selectedUids || [])[0];
      if (!choice.cards.some(c => c.uid === selectedUid)) throw new Error("Carta não permitida nesta escolha.");
      const idx = priv.deck.findIndex(c => c.uid === selectedUid);
      if (idx >= 0) {
        const [found] = priv.deck.splice(idx, 1);
        priv.hand.push(found);
        priv.deck = shuffle(priv.deck);
        addLog(full, `${player.name} revelou ${card(found.cardId).name} e colocou na mão.`);
      }
    }
    priv.pendingChoice = null;
    syncCounts(full);
    return full;
  }

  function actionAttack(full, playerId, action) {
    const player = getPublicPlayer(full, playerId);
    const opp = getPublicPlayer(full, opponentId(full, playerId));
    const attacker = player.board.active;
    const defender = opp?.board.active;
    if (!attacker || !defender) throw new Error("Ataque impossível sem Pokémon Ativo dos dois lados.");
    if (isFirstPlayerFirstTurn(full, playerId)) throw new Error("Quem começa não pode atacar no primeiro turno.");
    if (attacker.conditions.includes(CONDITIONS.PARALYZED)) throw new Error("Seu Pokémon está Paralisado.");
    if (attacker.conditions.includes(CONDITIONS.ASLEEP)) throw new Error("Seu Pokémon está Adormecido.");

    const c = card(attacker.cardId);
    const attack = (c.attacks || []).find(a => a.id === action.attackId);
    if (!attack) throw new Error("Ataque não encontrado.");
    if (!hasEnergyCost(attacker, attack.cost || [])) throw new Error("Energia insuficiente para este ataque.");

    if (attacker.conditions.includes(CONDITIONS.CONFUSED)) {
      const heads = coinFlip();
      addLog(full, `${c.name} está Confuso. Moeda: ${heads ? "cara" : "coroa"}.`);
      if (!heads) {
        attacker.damage += 30;
        addLog(full, `${c.name} causou 30 de dano em si mesmo pela Confusão.`);
        checkKnockouts(full, opponentId(full, playerId), playerId);
        endTurn(full, playerId);
        return;
      }
    }

    let damage = Number(attack.damage || 0);
    damage = applyContinuousDamageHooks(full, attacker, defender, damage);
    defender.damage += damage;
    addLog(full, `${player.name} atacou com ${attack.name} e causou ${damage} de dano.`);

    if (attack.effect === "coin-burn") {
      const heads = coinFlip();
      addLog(full, `Efeito de ${attack.name}: moeda ${heads ? "cara" : "coroa"}.`);
      if (heads) addCondition(defender, CONDITIONS.BURNED);
    }
    if (attack.effect === "coin-paralyze") {
      const heads = coinFlip();
      addLog(full, `Efeito de ${attack.name}: moeda ${heads ? "cara" : "coroa"}.`);
      if (heads) addCondition(defender, CONDITIONS.PARALYZED);
    }

    checkKnockouts(full, playerId, opponentId(full, playerId));
    if (full.status === "playing") endTurn(full, playerId);
  }

  function coinFlip() {
    return Math.random() >= 0.5;
  }

  function applyContinuousDamageHooks(full, attacker, defender, baseDamage) {
    let damage = baseDamage;
    const attackerCard = card(attacker.cardId);
    const defenderCard = card(defender.cardId);

    // Ability hook: continuous attack modifier.
    if (attackerCard?.ability?.id === "heat-aura") damage += 10;

    // Tool hook.
    if (attacker.tool && card(attacker.tool.cardId)?.effect === "tool-damage-plus-10") damage += 10;

    // Weakness hook.
    if (defenderCard?.weakness && attackerCard?.type && defenderCard.weakness === attackerCard.type) damage *= 2;

    // Defender ability hook.
    if (defenderCard?.ability?.id === "thick-hide") damage = Math.max(0, damage - 10);

    return damage;
  }

  function actionRetreat(full, playerId, action) {
    const player = getPublicPlayer(full, playerId);
    if (player.flags.retreated) throw new Error("Você já recuou neste turno.");
    if (!player.board.active) throw new Error("Sem Pokémon Ativo.");
    const target = findOwnPokemon(player, action.targetUid);
    if (!target || target.zone !== "bench") throw new Error("Escolha um Pokémon do Banco para assumir o Ativo.");
    if (player.board.active.conditions.includes(CONDITIONS.PARALYZED) || player.board.active.conditions.includes(CONDITIONS.ASLEEP)) {
      throw new Error("Este Pokémon não pode recuar por causa da condição especial.");
    }

    let cost = card(player.board.active.cardId)?.retreat || 0;
    if (full.stadium?.effect === "stadium-retreat-minus-1") cost = Math.max(0, cost - 1);
    if (player.board.active.attachedEnergy.length < cost) throw new Error("Energia insuficiente para recuar.");
    for (let i = 0; i < cost; i++) {
      const discarded = player.board.active.attachedEnergy.shift();
      pushDiscard(full, playerId, discarded);
    }
    switchActiveWithBench(player, target.index);
    player.flags.retreated = true;
    addLog(full, `${player.name} recuou pagando ${cost} Energia.`);
  }

  function switchActiveWithBench(player, benchIndex) {
    const oldActive = player.board.active;
    const newActive = player.board.bench.splice(benchIndex, 1)[0];
    player.board.active = newActive;
    if (oldActive) player.board.bench.unshift(oldActive);
  }

  function checkKnockouts(full, prizeTakerId, damagedPlayerId) {
    const damaged = getPublicPlayer(full, damagedPlayerId);
    if (!damaged?.board.active) return;
    if (damaged.board.active.damage < pokemonHp(damaged.board.active)) return;

    const knocked = damaged.board.active;
    const knockedCard = card(knocked.cardId);
    addLog(full, `${knockedCard.name} foi Nocauteado.`);
    discardPokemonStack(full, damagedPlayerId, knocked);
    damaged.board.active = null;

    const takerPriv = getPrivate(full, prizeTakerId);
    const taker = getPublicPlayer(full, prizeTakerId);
    if (takerPriv?.prizes.length) {
      takerPriv.hand.push(takerPriv.prizes.shift());
      addLog(full, `${taker.name} pegou 1 Prêmio.`);
    }
    if (takerPriv?.prizes.length === 0) {
      full.winnerId = prizeTakerId;
      full.status = "finished";
      addLog(full, `${taker.name} venceu por pegar todos os Prêmios.`);
      return;
    }

    if (damaged.board.bench.length) {
      damaged.board.active = damaged.board.bench.shift();
      addLog(full, `${damaged.name} promoveu automaticamente um Pokémon do Banco.`);
    } else {
      full.winnerId = prizeTakerId;
      full.status = "finished";
      addLog(full, `${taker.name} venceu porque o oponente ficou sem Pokémon em campo.`);
    }
  }

  function discardPokemonStack(full, playerId, pokemon) {
    pushDiscard(full, playerId, pokemon.cardId);
    pokemon.attachedEnergy.forEach(e => pushDiscard(full, playerId, e));
    if (pokemon.tool) pushDiscard(full, playerId, pokemon.tool);
  }

  function applyPokemonCheckup(full) {
    for (const p of full.players) {
      const active = p.board.active;
      if (!active) continue;
      if (active.conditions.includes(CONDITIONS.POISONED)) {
        active.damage += 10;
        addLog(full, `${card(active.cardId).name} recebeu 10 de dano por Envenenamento.`);
      }
      if (active.conditions.includes(CONDITIONS.BURNED)) {
        active.damage += 20;
        const heads = coinFlip();
        addLog(full, `${card(active.cardId).name} recebeu 20 por Queimadura. Moeda: ${heads ? "cara" : "coroa"}.`);
        if (heads) removeCondition(active, CONDITIONS.BURNED);
      }
      if (active.conditions.includes(CONDITIONS.ASLEEP)) {
        const heads = coinFlip();
        addLog(full, `${card(active.cardId).name} está Adormecido. Moeda: ${heads ? "cara" : "coroa"}.`);
        if (heads) removeCondition(active, CONDITIONS.ASLEEP);
      }
    }
    for (const p of full.players) {
      if (p.board.active && p.board.active.damage >= pokemonHp(p.board.active)) {
        checkKnockouts(full, opponentId(full, p.id), p.id);
        if (full.status !== "playing") return;
      }
    }
  }

  function endTurn(full, playerId) {
    const player = getPublicPlayer(full, playerId);
    if (!player || full.currentPlayerId !== playerId) return;

    // Paralysis expires after the affected player's turn ends.
    if (player.board.active?.conditions.includes(CONDITIONS.PARALYZED)) {
      removeCondition(player.board.active, CONDITIONS.PARALYZED);
      addLog(full, `${card(player.board.active.cardId).name} não está mais Paralisado.`);
    }

    applyPokemonCheckup(full);
    if (full.status !== "playing") return;

    const nextId = opponentId(full, playerId);
    full.currentPlayerId = nextId;
    full.turnNumber += 1;
    const next = getPublicPlayer(full, nextId);
    next.flags = { energyPlayed: false, supporterPlayed: false, retreated: false };
    drawCards(full, nextId, 1);
    addLog(full, `Turno de ${next.name}.`);
  }

  return { CONDITIONS, createMatch, processAction, publicState, privateState, syncCounts, clone };
})();
