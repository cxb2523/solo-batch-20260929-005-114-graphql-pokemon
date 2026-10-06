const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const tracer = require('../trace/tracer');

const DATA_PATH = path.join(__dirname, '..', 'pokemons', 'pokemons.json');
const SERVICE_FILE = 'src/service/Pokemon.js';

let cache = null;
let rebuilding = null;

const stats = {
  cacheHits: 0,
  revalidations: 0,
  rebuilds: 0,
  rebuildWaits: 0,
};

function now() {
  return Number(process.hrtime.bigint()) / 1e6;
}

function fingerprint() {
  const stat = fs.statSync(DATA_PATH);
  return { mtimeMs: stat.mtimeMs, size: stat.size };
}

function buildIndex(raw, fp) {
  const list = JSON.parse(raw);
  const byId = new Map();
  const byName = new Map();
  for (const pokemon of list) {
    byId.set(String(pokemon.id), pokemon);
    byName.set(pokemon.name.toLowerCase(), pokemon);
  }
  return {
    mtimeMs: fp.mtimeMs,
    size: fp.size,
    hash: crypto.createHash('sha256').update(raw).digest('hex'),
    list,
    byId,
    byName,
  };
}

async function getIndex() {
  const fp = fingerprint();
  if (cache && cache.mtimeMs === fp.mtimeMs && cache.size === fp.size) {
    stats.cacheHits += 1;
    return { index: cache, cacheHit: true, waited: false };
  }
  if (rebuilding) {
    stats.rebuildWaits += 1;
    const index = await rebuilding;
    return { index, cacheHit: false, waited: true };
  }
  rebuilding = Promise.resolve().then(() => {
    const raw = fs.readFileSync(DATA_PATH, 'utf8');
    const hash = crypto.createHash('sha256').update(raw).digest('hex');
    if (cache && cache.hash === hash) {
      stats.revalidations += 1;
      cache.mtimeMs = fp.mtimeMs;
      cache.size = fp.size;
      return cache;
    }
    stats.rebuilds += 1;
    cache = buildIndex(raw, fp);
    return cache;
  });
  try {
    const index = await rebuilding;
    return { index, cacheHit: false, waited: false };
  } finally {
    rebuilding = null;
  }
}

function unionTypes(pokemons) {
  const set = new Set();
  for (const pokemon of pokemons) {
    for (const type of pokemon.types || []) set.add(type);
  }
  return Array.from(set).sort().join(', ');
}

function traceHop(action, category, args, started, result, meta) {
  const list = Array.isArray(result) ? result : (result ? [result] : []);
  tracer.record({
    file: SERVICE_FILE,
    action,
    category,
    args,
    hits: Array.isArray(result) ? result.length : (result ? 1 : 0),
    durationMs: Math.round((now() - started) * 1000) / 1000,
    cacheHit: meta.cacheHit,
    waited: meta.waited,
    name: list.length === 1 ? list[0].name : (args && args.name ? String(args.name) : ''),
    types: unionTypes(list),
  });
}

async function getPokemons(args) {
  const started = now();
  const { index, cacheHit, waited } = await getIndex();
  const result = index.list.slice(0, args.first);
  traceHop('getPokemons', 'pokemons', args, started, result, { cacheHit, waited });
  return result || null;
}

async function getPokemonById(pokemonId) {
  const started = now();
  const args = { id: pokemonId };
  const { index, cacheHit, waited } = await getIndex();
  const result = index.byId.get(String(pokemonId)) || null;
  traceHop('getPokemonById', 'pokemon', args, started, result, { cacheHit, waited });
  return result;
}

async function getPokemonByName(pokemonNameSearch) {
  const started = now();
  const pokemonName = pokemonNameSearch.toLowerCase().trim();
  const args = { name: pokemonNameSearch };
  const { index, cacheHit, waited } = await getIndex();
  const result = index.byName.get(pokemonName) || null;
  traceHop('getPokemonByName', 'pokemon', args, started, result, { cacheHit, waited });
  return result;
}

async function getPokemonByEvolutions(evolutions) {
  if (!evolutions) {
    return null;
  }
  const started = now();
  const args = { evolutions: evolutions.map(evolution => evolution.name) };
  const { index, cacheHit, waited } = await getIndex();
  const result = evolutions
    .map(evolution => index.byName.get(evolution.name.toLowerCase().trim()))
    .filter(Boolean);
  traceHop('getPokemonByEvolutions', 'evolution', args, started, result, { cacheHit, waited });
  return result || null;
}

function getStats() {
  return Object.assign({
    dataPath: DATA_PATH,
    cached: Boolean(cache),
    hash: cache ? cache.hash : null,
  }, stats);
}

module.exports = {
  getPokemons,
  getPokemonById,
  getPokemonByName,
  getPokemonByEvolutions,
  getStats,
};
