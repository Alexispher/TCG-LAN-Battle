/* Local trainer account. Stored only in this browser. */
window.PTCGAccount = (() => {
  const KEY = "pegasus_pocket_tcg_account_v1";

  function fallbackUuid() {
    return "P_" + Math.random().toString(36).slice(2) + Date.now().toString(36);
  }

  function makeAccount(name = "Treinador", avatar = "trainer-red") {
    return {
      id: (crypto && crypto.randomUUID) ? crypto.randomUUID() : fallbackUuid(),
      name,
      avatar,
      wins: 0,
      losses: 0,
      games: 0,
      coins: 0,
      collection: {},
      activeDeck: [],
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
  }

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (error) {
      console.warn("Could not load account", error);
      return null;
    }
  }

  function save(account) {
    account.updatedAt = Date.now();
    localStorage.setItem(KEY, JSON.stringify(account));
    return account;
  }

  function reset() {
    localStorage.removeItem(KEY);
  }

  function ensureStarterCollection(account, deckList) {
    const collection = {};
    deckList.forEach(cardId => {
      collection[cardId] = (collection[cardId] || 0) + 1;
    });
    account.collection = { ...collection, ...account.collection };
    if (!Array.isArray(account.activeDeck) || account.activeDeck.length < 1) {
      account.activeDeck = deckList.slice();
    }
    return save(account);
  }

  return { makeAccount, load, save, reset, ensureStarterCollection };
})();
