const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'config', 'applications.json');

function readAll() {
  try {
    return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
  } catch {
    return { applications: {}, nextId: 1 };
  }
}

function writeAll(db) {
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2), 'utf8');
}

module.exports = { readAll, writeAll };