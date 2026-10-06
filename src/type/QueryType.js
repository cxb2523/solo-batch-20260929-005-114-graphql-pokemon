const {
  GraphQLObjectType,
  GraphQLInt,
  GraphQLString,
  GraphQLList,
  GraphQLNonNull,
} = require('graphql');
const { fromGlobalId } = require('graphql-relay');

const PokemonType = require('./PokemonType');
const tracer = require('../trace/tracer');
const {
  getPokemons,
  getPokemonById,
  getPokemonByName,
} = require('../service/Pokemon');

const QUERY_FILE = 'src/type/QueryType.js';

function now() {
  return Number(process.hrtime.bigint()) / 1e6;
}

function traceHop(action, category, args, started, result) {
  const list = Array.isArray(result) ? result : (result ? [result] : []);
  const typeSet = new Set();
  for (const pokemon of list) {
    for (const type of pokemon.types || []) typeSet.add(type);
  }
  tracer.record({
    file: QUERY_FILE,
    action,
    category,
    args,
    hits: Array.isArray(result) ? result.length : (result ? 1 : 0),
    durationMs: Math.round((now() - started) * 1000) / 1000,
    cacheHit: null,
    waited: false,
    name: list.length === 1 ? list[0].name : (args && args.name ? String(args.name) : ''),
    types: Array.from(typeSet).sort().join(', '),
  });
}

const QueryType = new GraphQLObjectType({
  name: 'Query',
  description: 'Query any Pokémon by number or name',
  fields: () => ({
    query: {
      type: QueryType,
      resolve: (...args) => args,
    },
    pokemons: {
      type: new GraphQLList(PokemonType),
      args: {
        first: {
          type: new GraphQLNonNull(GraphQLInt),
        },
      },
      resolve: async (obj, args) => {
        const started = now();
        const result = await getPokemons(args);
        traceHop('resolve:pokemons', 'pokemons', args, started, result);
        return result;
      },
    },
    pokemon: {
      type: PokemonType,
      args: {
        id: {
          type: GraphQLString,
        },
        name: {
          type: GraphQLString,
        },
      },
      resolve: async (obj, { id, name }) => {
        const started = now();
        if (id) {
          const result = await getPokemonById(fromGlobalId(id).id);
          traceHop('resolve:pokemon', 'pokemon', { id }, started, result);
          return result;
        }

        if (name) {
          const result = await getPokemonByName(name);
          traceHop('resolve:pokemon', 'pokemon', { name }, started, result);
          return result;
        }

        throw new Error(
          'You need to specify either the ID or name of the Pokémon'
        );
      },
    },
  }),
});

module.exports = QueryType;
