// Vercel serverless entry: vercel.json sends every /api/... request here (as /api?__path=...),
// and lib/api.js routes it. The website pages themselves are plain files in public/.
import handler from '../lib/api.js';

export default function (req, res) {
  const url = new URL(req.url, 'http://local');
  const p = url.searchParams.get('__path');
  if (p !== null) {
    url.searchParams.delete('__path');
    const qs = url.searchParams.toString();
    req.url = '/api/' + p.replace(/^\/+/, '') + (qs ? '?' + qs : '');
  }
  return handler(req, res);
}
