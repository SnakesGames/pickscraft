const fs = require('fs');
const path = require('path');

const LOG_PATH = path.join(__dirname, '..', 'config', 'audit-log.json');
const MAX_ENTRIES = 500;

function readAll() {
  try {
    return JSON.parse(fs.readFileSync(LOG_PATH, 'utf8'));
  } catch {
    return [];
  }
}

function record(entry) {
  const log = readAll();
  log.push(entry);
  if (log.length > MAX_ENTRIES) log.shift();
  fs.writeFileSync(LOG_PATH, JSON.stringify(log, null, 2), 'utf8');
}

// Called from any admin route that changes state. adminName comes from the X-Admin-Name header the panel sends, just a label the person typed in on login
function logAction(req, action, target = null) {
  record({
    admin: (req.headers['x-admin-name'] || 'Admin').slice(0, 40),
    action,
    target,
    ip: req.ip,
    at: new Date().toISOString(),
  });
}

module.exports = { readAll, logAction };