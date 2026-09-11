const fs = require('fs');
const path = require('path');

const ADDONS_DIR = __dirname;

// Every addon is a folder under backend/addons/ with an index.js that
// exports register(app, ctx). ctx gives the addon read access to the
// core modules it's allowed to depend on, without ever requiring core
// files to know the addon exists.
//
function loadAddons(app, ctx) {
  let entries;
  try {
    entries = fs.readdirSync(ADDONS_DIR, { withFileTypes: true });
  } catch {
    return [];
  }

  const loaded = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const addonPath = path.join(ADDONS_DIR, entry.name);
    const entryFile = path.join(addonPath, 'index.js');
    if (!fs.existsSync(entryFile)) continue;

    try {
      const addon = require(entryFile);
      if (typeof addon.register !== 'function') {
        console.error(`[addons] "${entry.name}" has no register(app, ctx) export - skipped.`);
        continue;
      }
      addon.register(app, ctx);
      loaded.push(addon.name || entry.name);
      console.log(`[addons] loaded "${addon.name || entry.name}"`);
    } catch (err) {
      console.error(`[addons] "${entry.name}" failed to load and was skipped:`, err.message);
    }
  }

  return loaded;
}

module.exports = { loadAddons };
