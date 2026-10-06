const {
  GraphQLObjectType,
  GraphQLString,
  GraphQLInt,
  GraphQLFloat,
  GraphQLList,
} = require('graphql');
const { globalIdField } = require('graphql-relay');

const PokemonDimensionType = require('./PokemonDimensionType');
const PokemonAttackType = require('./PokemonAttackType');
const EvolutionRequirementType = require('./EvolutionRequirementType');
const tracer = require('../trace/tracer');

const { getPokemonByEvolutions } = require('../service/Pokemon');

const TYPE_FILE = 'src/type/PokemonType.js';

function now() {
  return Number(process.hrtime.bigint()) / 1e6;
}

const PokemonType = new GraphQLObjectType({
  name: 'Pokemon',
  description: 'Represents a Pokémon',
  fields: () => ({
    id: globalIdField('Pokemon'),
    number: {
      type: GraphQLString,
      description: 'The identifier of this Pokémon',
      resolve: obj => `00${obj.id}`.slice(-3),
    },
    name: {
      type: GraphQLString,
      description: 'The name of this Pokémon',
      resolve: obj => obj.name,
    },
    weight: {
      type: PokemonDimensionType,
      description: 'The minimum and maximum weight of this Pokémon',
      resolve: obj => obj.weight,
    },
    height: {
      type: PokemonDimensionType,
      description: 'The minimum and maximum weight of this Pokémon',
      resolve: obj => obj.height,
    },
    classification: {
      type: GraphQLString,
      description: 'The classification of this Pokémon',
      resolve: obj => obj.classification,
    },
    types: {
      type: new GraphQLList(GraphQLString),
      description: 'The type(s) of this Pokémon',
      resolve: obj => obj.types,
    },
    resistant: {
      type: new GraphQLList(GraphQLString),
      description: 'The type(s) of Pokémons that this Pokémon is resistant to',
      resolve: obj => obj.resistant,
    },
    attacks: {
      type: PokemonAttackType,
      description: 'The attacks of this Pokémon',
      resolve: obj => obj.attacks,
    },
    weaknesses: {
      type: new GraphQLList(GraphQLString),
      description: 'The type(s) of Pokémons that this Pokémon weak to',
      resolve: obj => obj.weaknesses,
    },
    fleeRate: {
      type: GraphQLFloat,
      resolve: obj => obj.fleeRate,
    },
    maxCP: {
      type: GraphQLInt,
      description: 'The maximum CP of this Pokémon',
      resolve: obj => obj.maxCP,
    },
    evolutions: {
      type: new GraphQLList(PokemonType),
      description: 'The evolutions of this Pokémon',
      resolve: async (obj) => {
        const started = now();
        const result = await getPokemonByEvolutions(obj.evolutions);
        const list = Array.isArray(result) ? result : [];
        const typeSet = new Set();
        for (const pokemon of list) {
          for (const type of pokemon.types || []) typeSet.add(type);
        }
        tracer.record({
          file: TYPE_FILE,
          action: 'resolve:evolutions',
          category: 'evolution',
          args: { from: obj.name },
          hits: list.length,
          durationMs: Math.round((now() - started) * 1000) / 1000,
          cacheHit: null,
          waited: false,
          name: obj.name,
          types: Array.from(typeSet).sort().join(', '),
        });
        return result;
      },
    },
    evolutionRequirements: {
      type: EvolutionRequirementType,
      description: 'The evolution requirements of this Pokémon',
      resolve: obj => obj.evolutionRequirements,
    },
    maxHP: {
      type: GraphQLInt,
      description: 'The maximum HP of this Pokémon',
      resolve: obj => obj.maxHP,
    },
    image: {
      type: GraphQLString,
      resolve: obj =>
        `https://img.pokemondb.net/artwork/${obj.name.toLowerCase().replace(/[&\/\\#,+()$~%.'":*?<>{}]/g, '').replace(' ', '-')}.jpg`,
    },
  }),
});

module.exports = PokemonType;
