#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { graphql } = require('graphql');
const { introspectionQuery, printSchema } = require('graphql/utilities');

const GraphQLSchema = require('../src/schema');
const { checkDrift } = require('../src/trace/drift');

const SCHEMAS_DIR = path.join(__dirname, '..', 'schemas');
const writeMode = process.argv.includes('--write');

async function regenerate() {
  const result = await graphql(GraphQLSchema, introspectionQuery);

  if (result.errors) {
    console.error(
      'ERROR introspecting schema: ',
      JSON.stringify(result.errors, null, 2)
    );
    process.exit(1);
  }

  fs.writeFileSync(
    path.join(SCHEMAS_DIR, 'schema.json'),
    JSON.stringify(result, null, 2)
  );

  fs.writeFileSync(
    path.join(SCHEMAS_DIR, 'schema.graphql'),
    printSchema(GraphQLSchema)
  );

  console.log('Regenerated schemas/schema.{json,graphql} from src/type/*.js (source of truth).');
}

async function main() {
  if (writeMode) {
    await regenerate();
    return;
  }

  const { drift, conflicts } = checkDrift();
  if (drift) {
    console.error('DRIFT detected: schemas/schema.graphql diverges from src/type/*.js (source of truth).');
    for (const conflict of conflicts) {
      console.error(`  [${conflict.where}:${conflict.line}] ${conflict.text}`);
    }
    console.error('Run `node scripts/buildSchema.js --write` to regenerate the snapshot.');
    process.exit(1);
  }

  console.log('OK: no drift. schemas/schema.graphql matches src/type/*.js');
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
