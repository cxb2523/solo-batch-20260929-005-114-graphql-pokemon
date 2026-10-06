const CAPACITY = 500;

const buffer = new Array(CAPACITY);
let head = 0;
let size = 0;
let seq = 0;
let dropped = 0;

function record(entry) {
  seq += 1;
  buffer[head] = Object.assign({ seq, ts: new Date().toISOString() }, entry);
  head = (head + 1) % CAPACITY;
  if (size < CAPACITY) {
    size += 1;
  } else {
    dropped += 1;
  }
}

function matches(entry, filter) {
  if (filter.name) {
    const needle = filter.name.toLowerCase();
    const inName = (entry.name || '').toLowerCase().indexOf(needle) !== -1;
    const inArgs = JSON.stringify(entry.args || {}).toLowerCase().indexOf(needle) !== -1;
    if (!inName && !inArgs) return false;
  }
  if (filter.type) {
    const needle = filter.type.toLowerCase();
    if ((entry.types || '').toLowerCase().indexOf(needle) === -1) return false;
  }
  if (filter.category) {
    if ((entry.category || '') !== filter.category) return false;
  }
  return true;
}

function list(filter) {
  const out = [];
  for (let i = 0; i < size; i += 1) {
    const entry = buffer[(head - size + i + CAPACITY) % CAPACITY];
    if (!filter || matches(entry, filter)) out.push(entry);
  }
  return out;
}

function meta() {
  return { capacity: CAPACITY, size, dropped };
}

module.exports = { record, list, meta };
