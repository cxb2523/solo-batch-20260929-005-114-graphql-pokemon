<p align="center">
  <img src="https://github.com/lucasbento/graphql-pokemon/raw/master/content/logo.png">
</p>

<h1 align="center">GraphQL Pokémon</h1>
<p align="center">
  Get information of a Pokémon with GraphQL!<br />
  <a href="https://graphql-pokemon.now.sh/">See the GraphiQL interface</a>
</p>

## How to use

Simply get Pokémon's information through queries in GraphQL, example:

```graphql
query {
  pokemon(name: "Pikachu") {
    id
    number
    name
    attacks {
      special {
        name
        type
        damage
      }
    }
    evolutions {
      id
      number
      name
      weight {
        minimum
        maximum
      }
      attacks {
        fast {
          name
          type
          damage
        }
      }
    }
  }
}
```

> Try this query [here](https://graphql-pokemon.now.sh/?query=%7B%0A%20%20pokemon(name%3A%20%22Pikachu%22)%20%7B%0A%20%20%20%20id%0A%20%20%20%20number%0A%20%20%20%20name%0A%20%20%20%20attacks%20%7B%0A%20%20%20%20%20%20special%20%7B%0A%20%20%20%20%20%20%20%20name%0A%20%20%20%20%20%20%20%20type%0A%20%20%20%20%20%20%20%20damage%0A%20%20%20%20%20%20%7D%0A%20%20%20%20%7D%0A%20%20%20%20evolutions%20%7B%0A%20%20%20%20%20%20id%0A%20%20%20%20%20%20number%0A%20%20%20%20%20%20name%0A%20%20%20%20%20%20weight%20%7B%0A%20%20%20%20%20%20%20%20minimum%0A%20%20%20%20%20%20%20%20maximum%0A%20%20%20%20%20%20%7D%0A%20%20%20%20%20%20attacks%20%7B%0A%20%20%20%20%20%20%20%20fast%20%7B%0A%20%20%20%20%20%20%20%20%20%20name%0A%20%20%20%20%20%20%20%20%20%20type%0A%20%20%20%20%20%20%20%20%20%20damage%0A%20%20%20%20%20%20%20%20%7D%0A%20%20%20%20%20%20%7D%0A%20%20%20%20%7D%0A%20%20%7D%0A%7D)!

> Check out the [React Relay Pokémon Project](https://github.com/lucasbento/react-relay-pokemon) and [Live Demo](https://react-relay-pokemon.now.sh/) too!

## Running

### Production

```sh
yarn
yarn run build-app
yarn start
```

### Development

```sh
yarn
yarn run watch # Using nodemon for auto-reloading

or

vercel dev # npm i -g @now/cli
```

## Disclaimer

This was built as part of a talk on Relay & GraphQL at [@ReactSP](https://meetup.com/pt-BR/ReactJS-SP) meetup, check us out, we build cool stuff. ;)

## Related Projects

* [Pokemon Gopher](https://github.com/racerxdl/pokemon-gopher) - Fetch information about pokémons with GraphQL and GO 🙂

## Observability (/trace)

The `pokemons.json` fetch chain is observable end to end: every hop
(`src/type/QueryType.js` / `src/type/PokemonType.js` -> `src/service/Pokemon.js`)
records file, args, hit count and duration into an in-memory ring buffer
(`src/trace/tracer.js`, capacity 500), rendered at `GET /trace` as an
auto-refreshing (2s) table filterable by `name` / `type` / `category`
(`GET /trace.json` for the raw view).

Decisions (fixed):

- **Source of truth**: `src/type/*.js`. `schemas/schema.graphql` is a derived
  snapshot; `node scripts/buildSchema.js` exits non-zero on drift and `/trace`
  highlights conflicting lines in red. `node scripts/buildSchema.js --write`
  regenerates the snapshot.
- **Caching**: `src/service/Pokemon.js` keeps an in-process index
  (`list` / `byId` / `byName`). Invalidation: `mtime`+`size` fast check, and on
  mismatch a SHA-256 content hash revalidation; if the hash changed it falls
  back to re-reading the file and rebuilding the index.
- **Concurrency**: index rebuilds are single-flight — concurrent callers await
  the same rebuild promise instead of reading a stale snapshot, so filter
  results never contain stale hits and measured durations include the wait.
- **Evolution chains**: `getPokemonByEvolutions` reuses the same `byName`
  index; `pokemons.json` is never parsed twice.

Acceptance: `node scripts/buildSchema.js` (no drift), `node index.js`
(serves on :5000), `node scripts/verifyFlow.js` (exit 0).
