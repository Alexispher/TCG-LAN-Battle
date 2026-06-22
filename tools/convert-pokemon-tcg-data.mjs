#!/usr/bin/env node
/*
  Utility converter for JSON datasets similar to PokemonTCG/pokemon-tcg-data.
  It does not download anything. Put source JSON files in a local folder and run:

    node tools/convert-pokemon-tcg-data.mjs ./raw-cards ./docs/data/cards-lite.json

  The resulting file still needs effect mapping, because card text is not executable game logic.
*/
import fs from "node:fs";
import path from "node:path";

const input = process.argv[2];
const output = process.argv[3] || "./docs/data/cards-lite.json";

if (!input) {
  console.error("Usage: node tools/convert-pokemon-tcg-data.mjs <input-json-file-or-folder> [output-json]");
  process.exit(1);
}

function slug(text = "") {
  return String(text).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "effect";
}

function norm(text = "") {
  return String(text).toLowerCase().replace("pokémon", "pokemon");
}

function readJsonFiles(target) {
  const stat = fs.statSync(target);
  if (stat.isFile()) return [JSON.parse(fs.readFileSync(target, "utf8"))];
  const files = fs.readdirSync(target).filter(f => f.endsWith(".json"));
  return files.map(file => JSON.parse(fs.readFileSync(path.join(target, file), "utf8")));
}

function toLite(card) {
  const supertype = norm(card.supertype || "");
  const subtypes = (card.subtypes || []).map(norm);
  const types = card.types || [];
  const weaknesses = card.weaknesses || [];
  const retreatCost = card.retreatCost || [];

  const lite = {
    id: card.id,
    name: card.name,
    supertype,
    subtypes,
    rarity: card.rarity || "unknown",
    images: card.images || null,
    originalText: card.text || ""
  };

  if (supertype === "pokemon") {
    lite.hp = Number(card.hp || 0);
    lite.type = norm(types[0] || "colorless");
    lite.weakness = weaknesses[0] ? norm(weaknesses[0].type) : null;
    lite.retreat = retreatCost.length;
    if (card.evolvesFrom) lite.evolvesFrom = card.evolvesFrom;
    if (card.abilities?.length) {
      const ability = card.abilities[0];
      lite.ability = {
        id: `${card.id}-${slug(ability.name)}`,
        name: ability.name,
        text: ability.text || "",
        unmapped: true
      };
    }
    lite.attacks = (card.attacks || []).map(attack => ({
      id: `${card.id}-${slug(attack.name)}`,
      name: attack.name,
      cost: (attack.cost || []).map(norm),
      damage: Number(String(attack.damage || "0").replace(/[^0-9]/g, "")) || 0,
      text: attack.text || "",
      effect: null,
      unmapped: !!attack.text
    }));
  }

  if (supertype === "energy") {
    lite.energyType = norm(types[0] || "colorless");
  }

  if (supertype === "trainer") {
    lite.trainerType = norm(subtypes[0] || "item");
    lite.text = card.rules?.join("\n") || card.text || "";
    lite.effect = null;
    lite.unmapped = true;
  }

  return lite;
}

const rawChunks = readJsonFiles(input);
const rawCards = rawChunks.flatMap(chunk => Array.isArray(chunk) ? chunk : (chunk.data || chunk.cards || []));
const lite = rawCards.filter(c => c.id && c.name && c.supertype).map(toLite);
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, JSON.stringify(lite, null, 2));
console.log(`Converted ${lite.length} cards to ${output}`);
console.log("Important: texts are not executable. Map ability/attack/trainer effects manually in rules-engine.js.");
