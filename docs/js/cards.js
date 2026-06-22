/* Pocket TCG card database loader. */
window.PTCGCards = (() => {
  let cards = [];
  let decks = {};
  const byId = new Map();

  async function load() {
    const [cardsRes, decksRes] = await Promise.all([
      fetch("./data/cards-lite.json"),
      fetch("./data/starter-decks.json")
    ]);
    cards = await cardsRes.json();
    decks = await decksRes.json();
    byId.clear();
    cards.forEach(card => byId.set(card.id, card));
    return { cards, decks };
  }

  function get(id) {
    return byId.get(id);
  }

  function all() {
    return cards.slice();
  }

  function starterDeck() {
    return decks.starterFire.cards.slice();
  }

  function typeOf(card) {
    if (!card) return "trainer";
    if (card.supertype === "pokemon") return card.type || "colorless";
    if (card.supertype === "energy") return "energy";
    return "trainer";
  }

  function cardLabel(id) {
    const card = get(id);
    return card ? card.name : id;
  }

  return { load, get, all, starterDeck, typeOf, cardLabel };
})();
