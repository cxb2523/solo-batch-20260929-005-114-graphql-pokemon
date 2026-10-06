const fs = require('fs');
const path = require('path');
const { printSchema } = require('graphql/utilities');

const SNAPSHOT_PATH = path.join(__dirname, '..', '..', 'schemas', 'schema.graphql');

function normalize(text) {
  return text.replace(/\r\n/g, '\n').trim();
}

function expectedSchema() {
  const schema = require('../schema');
  return normalize(printSchema(schema));
}

function actualSchema() {
  if (!fs.existsSync(SNAPSHOT_PATH)) return '';
  return normalize(fs.readFileSync(SNAPSHOT_PATH, 'utf8'));
}

function checkDrift() {
  const expected = expectedSchema();
  const actual = actualSchema();
  if (expected === actual) {
    return { drift: false, conflicts: [] };
  }
  const expectedLines = expected.split('\n');
  const actualLines = actual.split('\n');
  const expectedSet = new Set(expectedLines);
  const actualSet = new Set(actualLines);
  const conflicts = [];
  actualLines.forEach((line, i) => {
    if (!expectedSet.has(line)) {
      conflicts.push({ where: 'schemas/schema.graphql', line: i + 1, text: line });
    }
  });
  expectedLines.forEach((line, i) => {
    if (!actualSet.has(line)) {
      conflicts.push({ where: 'src/type/*.js (expected)', line: i + 1, text: line });
    }
  });
  return { drift: true, conflicts };
}

module.exports = { checkDrift, SNAPSHOT_PATH };
