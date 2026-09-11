const fs = require('fs');
const path = require('path');

const CONFIG_PATH = path.join(__dirname, '..', 'config', 'config.json');
const BACKUP_PATH = path.join(__dirname, '..', 'config', 'config.backup.json');

// Any of these values means "not actually set".
const PLACEHOLDER_PASSWORDS = ['CHANGE_ME', 'admin1234'];

let cachedConfig = load();

// Loads config.json. If it's broken (bad JSON from a hand edit, missing
// comma, unquoted value, etc.).
function load() {
  let raw;
  try {
    raw = fs.readFileSync(CONFIG_PATH, 'utf8');
  } catch (err) {
    return loadBackupOrThrow(`Could not read config.json: ${err.message}`);
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    return loadBackupOrThrow(
      `config.json has invalid JSON and could not be loaded.\n` +
      `  Reason: ${err.message}\n` +
      `  Fix: open config/config.json in a text editor and check for a missing comma, quote, or bracket near the spot mentioned above.\n` +
      `  Tip: paste the file into https://jsonlint.com to find the exact problem before saving.`
    );
  }

  if (!parsed.backend) parsed.backend = {};
  if (!parsed.backend.adminPassword || PLACEHOLDER_PASSWORDS.includes(parsed.backend.adminPassword)) {

    const generated = require('crypto').randomBytes(9).toString('base64url');
    parsed.backend.adminPassword = generated;
    try {
      fs.writeFileSync(CONFIG_PATH, JSON.stringify(parsed, null, 2), 'utf8');
      console.log('================================================================');
      console.log('No custom admin password was set, so one was generated for you:');
      console.log(`  ${generated}`);
      console.log('Use this to log into /admin.html. It has been saved to config.json —');
      console.log('you can change it any time by editing backend.adminPassword.');
      console.log('================================================================');
    } catch (err) {
      console.error(`Generated an admin password but could not save it to config.json: ${err.message}`);
      console.error(`Set backend.adminPassword manually to: ${generated}`);
    }
  }


  try {
    fs.writeFileSync(BACKUP_PATH, JSON.stringify(parsed, null, 2), 'utf8');
  } catch (err) {
    console.error(`Warning: could not write config.backup.json: ${err.message}`);
  }

  return parsed;
}

function loadBackupOrThrow(message) {
  console.error(message);
  if (fs.existsSync(BACKUP_PATH)) {
    console.error('Falling back to the last known-good config (config.backup.json) so the site stays online.');
    console.error('Your edit was NOT applied — fix config.json and restart/redeploy to apply it.');
    return JSON.parse(fs.readFileSync(BACKUP_PATH, 'utf8'));
  }

  console.error('No backup config available. The server cannot start until config.json is fixed.');
  process.exit(1);
}

function reload() {
  cachedConfig = load();
  return cachedConfig;
}

function get() {
  return cachedConfig;
}

function writePartial(mutator) {
  const raw = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  mutator(raw);
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(raw, null, 2), 'utf8');
  return reload();
}

module.exports = { get, reload, writePartial, CONFIG_PATH };
