const Koa = require('koa');
const cors = require('koa-cors');
const graphqlHTTP = require('koa-graphql');
const convert = require('koa-convert');

const schema = require('./schema');
const traceMiddleware = require('./trace/traceEndpoint');

const app = new Koa();

app
  .use(traceMiddleware)
  .use(convert(cors()))
  .use(convert(graphqlHTTP(async () => ({
    graphiql: true,
    schema,
    formatError: ({ message, locations, stack }) => ({
      message,
      locations,
      stack,
    }),
  })
)));

module.exports = app;
