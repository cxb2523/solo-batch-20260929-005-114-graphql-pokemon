#!/usr/bin/env node
const BASE = process.env.BASE_URL || `http://localhost:${process.env.PORT || 5000}`;

let failures = 0;

function check(label, condition, detail) {
  if (condition) {
    console.log(`PASS ${label}`);
  } else {
    failures += 1;
    console.error(`FAIL ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

async function gql(query) {
  const res = await fetch(`${BASE}/graphql`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  if (!res.ok) throw new Error(`graphql HTTP ${res.status}`);
  return res.json();
}

async function getJson(path) {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new Error(`GET ${path} -> HTTP ${res.status}`);
  return res.json();
}

async function main() {
  const list = await gql('{ pokemons(first: 3) { id name } }');
  check('pokemons(first:3) returns 3 rows',
    list.data && list.data.pokemons && list.data.pokemons.length === 3,
    JSON.stringify(list).slice(0, 200));

  const byName = await gql('{ pokemon(name: "Pikachu") { name types } }');
  check('pokemon(name:Pikachu) hits Pikachu',
    byName.data && byName.data.pokemon && byName.data.pokemon.name === 'Pikachu',
    JSON.stringify(byName).slice(0, 200));

  const evo = await gql('{ pokemon(name: "Bulbasaur") { name evolutions { name } } }');
  const evoNames = evo.data && evo.data.pokemon && evo.data.pokemon.evolutions
    ? evo.data.pokemon.evolutions.map(p => p.name) : [];
  check('evolution chain Bulbasaur -> Ivysaur, Venusaur',
    evoNames.join(',') === 'Ivysaur,Venusaur', evoNames.join(','));

  const statsBefore = (await getJson('/trace.json')).stats;
  await gql('{ pokemon(name: "Pikachu") { name } }');
  const statsAfter = (await getJson('/trace.json')).stats;
  check('repeat query increases cache hits',
    statsAfter.cacheHits > statsBefore.cacheHits,
    `before=${statsBefore.cacheHits} after=${statsAfter.cacheHits}`);
  check('index was built at least once', statsAfter.rebuilds >= 1,
    `rebuilds=${statsAfter.rebuilds}`);

  const trace = await getJson('/trace.json');
  const files = new Set(trace.records.map(r => r.file));
  check('trace has QueryType.js hop', files.has('src/type/QueryType.js'));
  check('trace has Pokemon.js hop', files.has('src/service/Pokemon.js'));
  check('trace has PokemonType.js evolution hop', files.has('src/type/PokemonType.js'));
  check('trace records carry args/hits/duration',
    trace.records.every(r => r.args !== undefined && typeof r.hits === 'number' && typeof r.durationMs === 'number'));
  check('no schema drift reported', trace.drift.drift === false,
    JSON.stringify(trace.drift.conflicts).slice(0, 200));

  const byNameFilter = await getJson('/trace.json?name=Pikachu');
  check('filter by name=Pikachu returns only matching rows',
    byNameFilter.records.length > 0 &&
    byNameFilter.records.every(r =>
      (r.name || '').toLowerCase().includes('pikachu') ||
      JSON.stringify(r.args).toLowerCase().includes('pikachu')));

  const byCategory = await getJson('/trace.json?category=evolution');
  check('filter by category=evolution returns evolution rows',
    byCategory.records.length > 0 &&
    byCategory.records.every(r => r.category === 'evolution'));

  const byType = await getJson('/trace.json?type=Electric');
  check('filter by type=Electric returns rows whose hits include Electric',
    byType.records.length > 0 &&
    byType.records.every(r => (r.types || '').includes('Electric')));

  const html = await (await fetch(`${BASE}/trace?name=Pikachu`)).text();
  check('/trace renders HTML table with stats and decisions',
    html.includes('<table') && html.includes('缓存命中') && html.includes('索引重建') && html.includes('真源'));

  const concurrent = await Promise.all(
    Array.from({ length: 20 }, () => gql('{ pokemons(first: 1) { name } }'))
  );
  check('20 concurrent queries all succeed without stale/empty hits',
    concurrent.every(r => r.data && r.data.pokemons && r.data.pokemons.length === 1));

  const traceAfter = await getJson('/trace.json');
  check('trace ring buffer kept recording under concurrency',
    traceAfter.records.length > trace.records.length);
}

main()
  .then(() => {
    if (failures > 0) {
      console.error(`\n${failures} check(s) failed`);
      process.exit(1);
    }
    console.log('\nAll checks passed');
    process.exit(0);
  })
  .catch((error) => {
    console.error(`FATAL ${error.message}`);
    process.exit(1);
  });
