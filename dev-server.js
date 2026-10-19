// Local test server (Vercel does NOT use this file): serves public/ AND the /api on one port.
//   npm run dev   ->  http://localhost:3000   (Unity's PickscraftConfig.json points here while testing)
// Reads settings from a .env file next to this one (copy .env.example to .env).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, 'public'); // website files (Vercel serves this folder too)
const envFile = path.join(here, '.env');
if (fs.existsSync(envFile))
  for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m && !line.trim().startsWith('#') && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }

const { default: api } = await import('./lib/api.js');
const PORT = Number(process.env.PORT) || 3000;
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.json': 'application/json',
  '.zip': 'application/zip', '.exe': 'application/octet-stream' };
const PUBLIC = new Set(['index.html', 'app.js', 'styles.css', 'config.js']);

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://local');
  if (url.pathname.startsWith('/api/')) return api(req, res);
  let rel = decodeURIComponent(url.pathname).replace(/^\/+/, '') || 'index.html';
  const file = path.join(root, rel);
  const allowed = PUBLIC.has(rel) || rel.startsWith('assets/') || rel.startsWith('downloads/'); // downloads/ = launcher + game builds
  if (!allowed || !file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.statusCode = 404; res.setHeader('Content-Type', 'text/plain'); return res.end('Not found');
  }
  res.setHeader('Content-Type', TYPES[path.extname(file)] || 'application/octet-stream');
  res.setHeader('Content-Length', fs.statSync(file).size); // lets the launcher show download progress
  if (rel === 'downloads/latest.json') res.setHeader('Cache-Control', 'no-store');
  fs.createReadStream(file).pipe(res);
}).listen(PORT, () => {
  console.log(`Pickscraft Network website + API running at http://localhost:${PORT}`);
  if (!process.env.SUPABASE_URL) console.log('  ! SUPABASE_URL is not set yet - copy .env.example to .env and fill it in.');
});
