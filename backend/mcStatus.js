const https = require('https');
const config = require('./config');

let cache = null;
let cachedAt = 0;

function ttlMs() {
  return (config.get().backend?.statusCacheSecs || 30) * 1000;
}

function fallbackStatus() {
  const cfg = config.get().server || {};
  return {
    online: true,
    players: { online: 0, max: cfg.maxPlayers || 500 },
    version: cfg.version || '1.21',
    motd: cfg.tagline || '',
    ip: cfg.ip || 'localhost',
    cached: true,
  };
}

// mcsrvstat.us
function fetchStatus() {
  const now = Date.now();
  if (cache && now - cachedAt < ttlMs()) return Promise.resolve(cache);

  return new Promise((resolve) => {
    const ip = config.get().server?.ip || 'localhost';
    const url = `https://api.mcsrvstat.us/3/${encodeURIComponent(ip)}`;

    const request = https.get(url, { timeout: 5000 }, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => {
        try {
          const json = JSON.parse(body);
          cache = {
            online: json.online ?? false,
            players: {
              online: json.players?.online ?? 0,
              max: json.players?.max ?? config.get().server?.maxPlayers ?? 500,
            },
            version: json.version ?? config.get().server?.version ?? '1.21',
            motd: json.motd?.clean?.[0] ?? config.get().server?.tagline ?? '',
            ip,
            cached: false,
          };
          cachedAt = Date.now();
        } catch {
          cache = fallbackStatus();
        }
        resolve(cache);
      });
    });

    request.on('error', () => resolve(fallbackStatus()));
    request.on('timeout', () => {
      request.destroy();
      resolve(fallbackStatus());
    });
  });
}

module.exports = { fetchStatus, fallbackStatus };
