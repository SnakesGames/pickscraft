// Pickscraft Network API.
// The game (Unity) and the website both talk ONLY to these /api routes. This file holds the Supabase
// keys server-side (environment variables) and forwards the player's own login token, so Supabase
// row-level security still decides what each player may read or change.
//
// Works on Vercel (api/[...path].js) and locally (server.js).

const SB = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const KEY = process.env.SUPABASE_ANON_KEY || '';
const configured = () => SB.startsWith('https://') && !SB.includes('YOUR-PROJECT') && KEY && !KEY.includes('YOUR-');

const USERNAME = /^[A-Za-z0-9_]{3,20}$/;
const HEX = /^#[0-9A-Fa-f]{6}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ROOM_KINDS = ['dorm', 'plaza', 'splat', 'beam', 'quest', 'maker'];
const MAX_BODY = 512 * 1024;

class ApiError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const fail = (status, message) => { throw new ApiError(status, message); };

// ---------------------------------------------------------------- helpers
function send(res, status, data) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(data));
}

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Game-Client');
  res.setHeader('Access-Control-Max-Age', '86400');
}

async function readBody(req) {
  if (req.body !== undefined && req.body !== null && req.body !== '') {
    if (typeof req.body === 'string') { try { return JSON.parse(req.body); } catch { fail(400, 'Body must be JSON.'); } }
    if (Buffer.isBuffer(req.body)) { try { return JSON.parse(req.body.toString('utf8')); } catch { fail(400, 'Body must be JSON.'); } }
    return req.body;
  }
  if (req.method === 'GET' || req.method === 'DELETE') return {};
  const chunks = []; let size = 0;
  for await (const c of req) { size += c.length; if (size > MAX_BODY) fail(413, 'Request too large.'); chunks.push(c); }
  if (!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { fail(400, 'Body must be JSON.'); }
}

function bearer(req) {
  const h = req.headers.authorization || req.headers.Authorization || '';
  const m = /^Bearer\s+(.+)$/i.exec(h);
  return m ? m[1].trim() : null;
}

/** Call Supabase (REST or Auth). token = the player's access token, or null for public calls. */
async function sb(path, { method = 'GET', body, token, prefer } = {}) {
  const headers = { apikey: KEY, Authorization: 'Bearer ' + (token || KEY), 'Content-Type': 'application/json' };
  if (prefer) headers.Prefer = prefer;
  let r;
  try {
    r = await fetch(SB + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  } catch {
    fail(502, 'Could not reach the database.');
  }
  const text = await r.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!r.ok) {
    const msg = (data && (data.msg || data.error_description || data.message || data.error)) || ('Database error ' + r.status);
    if (r.status === 401 || r.status === 403) fail(401, typeof msg === 'string' && /jwt|token/i.test(msg) ? 'Your login expired. Please log in again.' : msg);
    fail(r.status >= 500 ? 502 : 400, String(msg));
  }
  return data;
}
const rpc = (fn, args, token) => sb('/rest/v1/rpc/' + fn, { method: 'POST', body: args || {}, token });

// small in-memory caches / limits (best effort; resets when the server restarts)
const whoCache = new Map();
async function requireUser(req) {
  const token = bearer(req);
  if (!token) fail(401, 'Please log in first.');
  const hit = whoCache.get(token);
  if (hit && hit.until > Date.now()) return { token, id: hit.id };
  const user = await sb('/auth/v1/user', { token });
  if (!user || !user.id) fail(401, 'Your login expired. Please log in again.');
  whoCache.set(token, { id: user.id, until: Date.now() + 60_000 });
  if (whoCache.size > 5000) whoCache.clear();
  return { token, id: user.id };
}

const hits = new Map();
function rateLimit(req, bucket, max, windowMs) {
  const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'local').split(',')[0].trim();
  const key = bucket + '|' + ip, now = Date.now();
  const h = hits.get(key);
  if (!h || h.reset < now) { hits.set(key, { n: 1, reset: now + windowMs }); return; }
  if (++h.n > max) fail(429, 'Too many tries. Wait a minute and try again.');
  if (hits.size > 20000) hits.clear();
}

const str = (v, max) => (typeof v === 'string' ? v : '').trim().slice(0, max);
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function sessionOut(s, username) {
  return {
    access_token: s.access_token,
    refresh_token: s.refresh_token,
    expires_in: s.expires_in || 3600,
    user: { id: s.user?.id, username: username || s.user?.user_metadata?.username || null }
  };
}

// ---------------------------------------------------------------- routes
const routes = [];
const route = (method, pattern, fn) => {
  const keys = [];
  const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '/?$');
  routes.push({ method, re, keys, fn });
};

route('GET', '/api/health', async () => ({ ok: true, configured: configured(), time: new Date().toISOString() }));

route('GET', '/api/stats', async () => {
  const rows = await rpc('public_stats');
  const r = (Array.isArray(rows) ? rows[0] : rows) || {};
  return { players: Number(r.players || 0), online: Number(r.online || 0), rooms: Number(r.rooms || 0) };
});

// ---- accounts
route('GET', '/api/auth/available', async (req, q) => {
  const u = str(q.get('username'), 20);
  if (!USERNAME.test(u)) return { available: false };
  return { available: (await rpc('username_available', { p_username: u })) === true };
});

function password(body) {
  const pw = typeof body.password === 'string' ? body.password : '';
  if (pw.length < 6 || pw.length > 128) fail(400, 'Passwords need at least 6 characters.');
  return pw;
}

function email(body) {
  const e = str(body.email, 254).toLowerCase();
  if (!EMAIL.test(e)) fail(400, 'Please enter a real email address.');
  return e;
}

route('POST', '/api/auth/signup', async (req, q, body) => {
  rateLimit(req, 'signup', 8, 60_000);
  const username = str(body.username, 20);
  if (!USERNAME.test(username)) fail(400, 'Usernames are 3-20 letters, numbers or _.');
  const mail = email(body), pw = password(body);
  if ((await rpc('username_available', { p_username: username })) !== true) fail(409, 'That username is taken.');
  let s;
  try {
    s = await sb('/auth/v1/signup', { method: 'POST', body: { email: mail, password: pw, data: { username, display_name: username } } });
  } catch (e) {
    if (/registered|already exists/i.test(e.message)) fail(409, 'That email already has an account. Try logging in.');
    throw e;
  }
  // With "Confirm email" turned on, Supabase sends a link and gives no login yet.
  if (!s || !s.access_token) return { confirm: true, message: 'Account made! Check ' + mail + ' for a confirmation link, then log in.' };
  return sessionOut(s, username);
});

route('POST', '/api/auth/login', async (req, q, body) => {
  rateLimit(req, 'login', 15, 60_000);
  const mail = email(body), pw = password(body);
  try {
    return sessionOut(await sb('/auth/v1/token?grant_type=password', { method: 'POST', body: { email: mail, password: pw } }));
  } catch (e) {
    if (/confirm/i.test(e.message)) fail(401, 'Please confirm your email first - check your inbox for the link.');
    if (e.status === 400 || e.status === 401) fail(401, 'Wrong email or password.');
    throw e;
  }
});

route('POST', '/api/auth/refresh', async (req, q, body) => {
  rateLimit(req, 'refresh', 30, 60_000);
  const token = str(body.refresh_token, 512);
  if (!token) fail(400, 'Missing refresh_token.');
  try {
    return sessionOut(await sb('/auth/v1/token?grant_type=refresh_token', { method: 'POST', body: { refresh_token: token } }));
  } catch (e) {
    if (e.status === 400) fail(401, 'Your login expired. Please log in again.');
    throw e;
  }
});

route('POST', '/api/auth/logout', async (req) => {
  const token = bearer(req);
  if (token) { try { await sb('/auth/v1/logout', { method: 'POST', token, body: {} }); } catch { /* already gone */ } whoCache.delete(token); }
  return { ok: true };
});

// ---- my profile
route('GET', '/api/me', async (req) => {
  const u = await requireUser(req);
  const rows = await sb(`/rest/v1/profiles?select=*&id=eq.${u.id}`, { token: u.token });
  if (!rows || !rows.length) fail(404, 'Profile not found. Did you run supabase/schema.sql?');
  return rows[0];
});

route('PATCH', '/api/me', async (req, q, body) => {
  const u = await requireUser(req);
  const patch = {};
  if (body.display_name !== undefined) { const d = str(body.display_name, 32); if (d.length < 1) fail(400, 'Display name is empty.'); patch.display_name = d; }
  if (body.bio !== undefined) patch.bio = str(body.bio, 280);
  for (const k of ['avatar_color', 'shirt_color'])
    if (body[k] !== undefined) { if (!HEX.test(body[k])) fail(400, k + ' must look like #RRGGBB.'); patch[k] = body[k]; }
  if (!Object.keys(patch).length) fail(400, 'Nothing to change.');
  const rows = await sb(`/rest/v1/profiles?id=eq.${u.id}`, { method: 'PATCH', body: patch, token: u.token, prefer: 'return=representation' });
  return rows && rows[0] ? rows[0] : { ok: true };
});

route('POST', '/api/me/xp', async (req, q, body) => {
  const u = await requireUser(req);
  const amount = Math.max(0, Math.min(50, Math.floor(Number(body.amount) || 0)));
  const rows = await rpc('award_game_xp', { p_amount: amount }, u.token);
  const r = (Array.isArray(rows) ? rows[0] : rows) || {};
  return { level: r.level, xp: r.xp };
});

// ---- presence
route('POST', '/api/presence', async (req, q, body) => {
  const u = await requireUser(req);
  const kind = str(body.room_kind, 16).toLowerCase();
  await rpc('heartbeat', {
    p_room_kind: ROOM_KINDS.includes(kind) ? kind : 'plaza',
    p_room_name: str(body.room_name, 64),
    p_session: str(body.session, 96),
    p_platform: str(body.platform, 16)
  }, u.token);
  return { ok: true };
});

route('POST', '/api/presence/offline', async (req) => {
  const u = await requireUser(req);
  await rpc('go_offline', {}, u.token);
  return { ok: true };
});

// ---- friends
route('GET', '/api/friends', async (req) => {
  const u = await requireUser(req);
  return (await rpc('get_friends', {}, u.token)) || [];
});

route('GET', '/api/friends/requests', async (req) => {
  const u = await requireUser(req);
  return (await rpc('get_friend_requests', {}, u.token)) || [];
});

route('POST', '/api/friends/request', async (req, q, body) => {
  const u = await requireUser(req);
  rateLimit(req, 'friendreq', 30, 60_000);
  const username = str(body.username, 20);
  if (!USERNAME.test(username)) return { result: 'not_found' };
  const result = await rpc('send_friend_request', { p_username: username }, u.token);
  return { result: String(result) };
});

route('POST', '/api/friends/respond', async (req, q, body) => {
  const u = await requireUser(req);
  const id = Math.floor(Number(body.request_id));
  if (!Number.isFinite(id) || id <= 0) fail(400, 'Bad request_id.');
  const result = await rpc('respond_friend_request', { p_request_id: id, p_accept: body.accept === true }, u.token);
  return { result: String(result) };
});

route('POST', '/api/friends/remove', async (req, q, body) => {
  const u = await requireUser(req);
  const other = str(body.user_id, 64);
  if (!UUID.test(other)) fail(400, 'Bad user_id.');
  await rpc('remove_friend', { p_other: other }, u.token);
  return { ok: true };
});

// ---- players
route('GET', '/api/players/:username', async (req, q, body, p) => {
  const name = decodeURIComponent(p.username);
  if (!USERNAME.test(name)) fail(404, 'No player with that name.');
  const rows = await sb(`/rest/v1/profiles?select=id,username,display_name,bio,avatar_color,shirt_color,level,created_at&username=ilike.${encodeURIComponent(name.replace(/_/g, "\\_"))}&limit=1`);
  if (!rows || !rows.length) fail(404, 'No player with that name.');
  const pl = rows[0];
  const rooms = await sb(`/rest/v1/rooms?select=id,name,description,visits&owner_id=eq.${pl.id}&is_public=eq.true&order=visits.desc&limit=60`);
  return { ...pl, rooms: rooms || [] };
});

// ---- Maker rooms
const ROOM_LIST = 'id,owner_id,name,description,visits,likes,dislikes,settings,is_public,updated_at,profiles(username)';

route('GET', '/api/rooms', async (req, q) => {
  const limit = Math.max(1, Math.min(100, Number(q.get('limit')) || 40));
  if (q.get('scope') === 'mine') {
    const u = await requireUser(req);
    return (await sb(`/rest/v1/rooms?select=${ROOM_LIST}&owner_id=eq.${u.id}&order=updated_at.desc&limit=${limit}`, { token: u.token })) || [];
  }
  const sort = { new: 'updated_at', liked: 'likes' }[q.get('sort')] || 'visits';
  const cat = ROOM_CATEGORIES.includes(q.get('category')) ? `&settings->>category=eq.${q.get('category')}` : '';
  return (await sb(`/rest/v1/rooms?select=${ROOM_LIST}&is_public=eq.true${cat}&order=${sort}.desc,visits.desc&limit=${limit}`)) || [];
});

route('GET', '/api/rooms/:id', async (req, q, body, p) => {
  if (!UUID.test(p.id)) fail(404, 'Room not found.');
  const token = bearer(req);
  const rows = await sb(`/rest/v1/rooms?select=*,profiles(username,display_name)&id=eq.${p.id}`, { token });
  if (!rows || !rows.length) fail(404, 'Room not found (it may be private).');
  const room = rows[0];
  room.my_vote = 0; room.is_coowner = false; room.co_owners = [];
  if (token) {
    try {
      const u = await requireUser(req);
      const [v, co] = await Promise.all([
        sb(`/rest/v1/room_votes?select=vote&room_id=eq.${p.id}&user_id=eq.${u.id}`, { token }),
        sb(`/rest/v1/room_coowners?select=user_id,profiles(username)&room_id=eq.${p.id}&order=added_at`, { token })
      ]);
      room.my_vote = v && v[0] ? v[0].vote : 0;
      room.co_owners = (co || []).map(c => ({ id: c.user_id, username: c.profiles?.username || '' }));
      room.is_coowner = room.co_owners.some(c => c.id === u.id);
      if (room.owner_id !== u.id) room.co_owners = room.co_owners.filter(c => c.id === u.id); // only the creator sees the whole list
    } catch { /* not logged in any more */ }
  }
  return room;
});

// Like (1) / dislike (-1) / clear (0)
route('POST', '/api/rooms/:id/vote', async (req, q, body, p) => {
  const u = await requireUser(req);
  if (!UUID.test(p.id)) fail(404, 'Room not found.');
  rateLimit(req, 'vote', 60, 60_000);
  const vote = Number(body.vote);
  if (![1, -1, 0].includes(vote)) fail(400, 'vote must be 1, -1 or 0.');
  return await rpc('vote_room', { p_room: p.id, p_vote: vote }, u.token);
});

// Co-owners: they can use the Maker Pen in the room (the creator manages the list)
route('POST', '/api/rooms/:id/coowners', async (req, q, body, p) => {
  const u = await requireUser(req);
  if (!UUID.test(p.id)) fail(404, 'Room not found.');
  rateLimit(req, 'coowner', 30, 60_000);
  const name = str(body.username, 20).replace(/^@/, '');
  if (!USERNAME.test(name)) fail(400, 'Type a username.');
  return await rpc('add_room_coowner', { p_room: p.id, p_username: name }, u.token);
});

route('DELETE', '/api/rooms/:id/coowners/:user', async (req, q, body, p) => {
  const u = await requireUser(req);
  if (!UUID.test(p.id) || !UUID.test(p.user)) fail(404, 'Not found.');
  await rpc('remove_room_coowner', { p_room: p.id, p_user: p.user }, u.token);
  return { ok: true };
});

// Save a private copy of one of your rooms
route('POST', '/api/rooms/:id/copy', async (req, q, body, p) => {
  const u = await requireUser(req);
  if (!UUID.test(p.id)) fail(404, 'Room not found.');
  rateLimit(req, 'newroom', 20, 60_000);
  const rows = await sb(`/rest/v1/rooms?select=name,description,data,settings,owner_id&id=eq.${p.id}`, { token: u.token });
  if (!rows || !rows.length || rows[0].owner_id !== u.id) fail(403, 'You can only copy your own rooms.');
  const src = rows[0];
  const name = str(body.name, 40) || (src.name.length > 33 ? src.name.slice(0, 33) : src.name) + ' (copy)';
  const made = await sb('/rest/v1/rooms', { method: 'POST', token: u.token, prefer: 'return=representation',
    body: { owner_id: u.id, name, description: src.description, data: src.data, settings: src.settings || {}, is_public: false } });
  return made && made[0] ? made[0] : fail(400, "Couldn't copy the room.");
});

const num = v => (Number.isFinite(+v) ? +v : 0);
const int = (v, lo, hi) => Math.max(lo, Math.min(hi, Math.trunc(num(v))));

/** Cleans a saved Maker room: pieces, CV3 chips and the wires between them. */
function roomData(d) {
  const blocks = d && Array.isArray(d.blocks) ? d.blocks : null;
  if (!blocks) fail(400, 'data.blocks must be a list.');
  if (blocks.length > 200) fail(400, 'Rooms can have at most 200 pieces.');
  const chips = Array.isArray(d.chips) ? d.chips : [];
  if (chips.length > 128) fail(400, 'Rooms can have at most 128 CV3 chips.');
  const wires = Array.isArray(d.wires) ? d.wires : [];
  if (wires.length > 256) fail(400, 'Rooms can have at most 256 wires.');
  return {
    blocks: blocks.map(b => ({ s: int(b.s, 0, 999), c: int(b.c, 0, 11), x: num(b.x), y: num(b.y), z: num(b.z), r: num(b.r), k: 1, sc: Math.min(10, Math.max(0.1, num(b.sc) || 1)), t: str(b.t, 30) })),
    chips: chips.map(c => ({ k: str(c.k, 64), x: num(c.x), y: num(c.y), z: num(c.z), qx: num(c.qx), qy: num(c.qy), qz: num(c.qz), qw: num(c.qw),
      i: int(c.i, -1, 1e9), f: num(c.f), s: str(c.s, 30) })).map(c => (/^[a-z0-9_]+$/.test(c.k) ? c : { ...c, k: '' })), // unknown chips are skipped by the game
    wires: wires.map(w => ({ a: int(w.a, 0, 127), ap: int(w.ap, 0, 31), b: int(w.b, 0, 127), bp: int(w.bp, 0, 31) }))
      .filter(w => w.a < chips.length && w.b < chips.length)
  };
}

const ROOM_CATEGORIES = ['hangout', 'game', 'obby', 'art', 'showcase', 'roleplay', 'puzzle', 'other'];
const clampNum = (v, lo, hi, def) => (Number.isFinite(+v) ? Math.max(lo, Math.min(hi, +v)) : def);

/** Room settings the game applies (who can build, physics, sky...). Unknown keys are dropped. */
function roomSettings(s) {
  if (!s || typeof s !== 'object' || Array.isArray(s)) fail(400, 'settings must be an object.');
  return {
    build: s.build === 'owner' ? 'owner' : 'everyone',
    category: ROOM_CATEGORIES.includes(s.category) ? s.category : '',
    gravity: clampNum(s.gravity, 0.2, 3, 1),
    speed: clampNum(s.speed, 0.25, 3, 1),
    jump: clampNum(s.jump, 0, 4, 1),
    sky: /^#[0-9a-fA-F]{6}$/.test(s.sky || '') ? s.sky.toUpperCase() : '',
    max_players: Math.round(clampNum(s.max_players, 2, 20, 12)),
    chat: s.chat !== false,
    respawn_y: clampNum(s.respawn_y, -200, 0, -30)
  };
}

function roomFields(body, creating) {
  const out = {};
  if (body.name !== undefined || creating) { const n = str(body.name, 40); if (!n) fail(400, 'Rooms need a name.'); out.name = n; }
  if (body.description !== undefined) out.description = str(body.description, 280);
  if (body.is_public !== undefined) out.is_public = body.is_public === true;
  if (body.data !== undefined) out.data = roomData(body.data);
  if (body.settings !== undefined) out.settings = roomSettings(body.settings);
  return out;
}

route('POST', '/api/rooms', async (req, q, body) => {
  const u = await requireUser(req);
  rateLimit(req, 'newroom', 20, 60_000);
  const fields = roomFields(body, true);
  if (!fields.data) fields.data = { blocks: [] };
  const rows = await sb('/rest/v1/rooms', { method: 'POST', body: { ...fields, owner_id: u.id }, token: u.token, prefer: 'return=representation' });
  return rows && rows[0] ? rows[0] : fail(400, "Couldn't create the room.");
});

route('PATCH', '/api/rooms/:id', async (req, q, body, p) => {
  const u = await requireUser(req);
  if (!UUID.test(p.id)) fail(404, 'Room not found.');
  const fields = roomFields(body, false);
  if (!Object.keys(fields).length) fail(400, 'Nothing to change.');
  fields.updated_at = new Date().toISOString();
  const rows = await sb(`/rest/v1/rooms?id=eq.${p.id}&owner_id=eq.${u.id}`, { method: 'PATCH', body: fields, token: u.token, prefer: 'return=representation' });
  if (!rows || !rows.length) fail(403, 'Only the room creator can change it.');
  return rows[0];
});

route('DELETE', '/api/rooms/:id', async (req, q, body, p) => {
  const u = await requireUser(req);
  if (!UUID.test(p.id)) fail(404, 'Room not found.');
  const rows = await sb(`/rest/v1/rooms?id=eq.${p.id}&owner_id=eq.${u.id}`, { method: 'DELETE', token: u.token, prefer: 'return=representation' });
  if (!rows || !rows.length) fail(403, 'Only the room creator can delete it.');
  return { ok: true };
});

route('POST', '/api/rooms/:id/visit', async (req, q, body, p) => {
  if (!UUID.test(p.id)) fail(404, 'Room not found.');
  const token = bearer(req);
  try { await rpc('record_room_visit', { p_room: p.id }, token); } catch { /* visits are best effort */ }
  return { ok: true };
});

// ---- creator dashboard (visits to my rooms)
const first = rows => (Array.isArray(rows) ? rows[0] : rows) || {};
const dayKey = d => new Date(d + 'T00:00:00Z');

/** Groups a list of {day, visits, players} into weeks (Mon-Sun) and calendar months. */
function buckets(daily) {
  const weeks = new Map(), months = new Map();
  for (const d of daily) {
    const t = dayKey(d.day), dow = (t.getUTCDay() + 6) % 7;
    const wk = new Date(t.getTime() - dow * 86400000).toISOString().slice(0, 10);
    const mo = d.day.slice(0, 7);
    weeks.set(wk, (weeks.get(wk) || 0) + Number(d.visits));
    months.set(mo, (months.get(mo) || 0) + Number(d.visits));
  }
  return {
    weekly: [...weeks].map(([week, visits]) => ({ week, visits })).slice(-12),
    monthly: [...months].map(([month, visits]) => ({ month, visits })).slice(-12)
  };
}

route('GET', '/api/creator', async (req) => {
  const u = await requireUser(req);
  const [totals, rooms, daily] = await Promise.all([
    rpc('creator_totals', {}, u.token), rpc('creator_stats', {}, u.token), rpc('creator_daily', { p_days: 366 }, u.token)
  ]);
  const t = first(totals), days = (daily || []).map(d => ({ day: d.day, visits: Number(d.visits), players: Number(d.players) }));
  const n = k => Number(t[k] || 0);
  return {
    totals: { today: n('today'), week: n('week'), month: n('month'), year: n('year'), all_time: n('all_time'),
      players_week: n('players_week'), players_month: n('players_month'), rooms: n('rooms') },
    rooms: (rooms || []).map(r => ({ ...r, today: Number(r.today), week: Number(r.week), month: Number(r.month),
      unique_week: Number(r.unique_week), unique_month: Number(r.unique_month) })),
    daily: days.slice(-30),
    ...buckets(days)
  };
});

route('GET', '/api/creator/rooms/:id', async (req, q, body, p) => {
  const u = await requireUser(req);
  if (!UUID.test(p.id)) fail(404, 'Room not found.');
  const daily = (await rpc('creator_daily', { p_days: 366, p_room: p.id }, u.token)) || [];
  const days = daily.map(d => ({ day: d.day, visits: Number(d.visits), players: Number(d.players) }));
  return { daily: days.slice(-30), ...buckets(days) };
});

// ---- Tokens + gift boxes
route('GET', '/api/me/gifts', async (req) => {
  const u = await requireUser(req);
  return ((await rpc('my_gifts', {}, u.token)) || []).map(g => ({ ...g, id: Number(g.id), amount: Number(g.amount) }));
});

route('POST', '/api/me/gifts/:id/open', async (req, q, body, p) => {
  const u = await requireUser(req);
  const id = Math.floor(Number(p.id));
  if (!Number.isFinite(id) || id <= 0) fail(400, 'Bad gift id.');
  const r = first(await rpc('open_gift', { p_id: id }, u.token));
  if (r.amount === undefined) fail(404, 'That gift was already opened.');
  return { amount: r.amount, message: r.message || '', from_name: r.from_name || 'Pickscraft', tokens: r.tokens };
});

route('POST', '/api/admin/tokens', async (req, q, body) => {
  const u = await requireUser(req);
  rateLimit(req, 'givetokens', 30, 60_000);
  const username = str(body.username, 20);
  if (username !== '*' && !USERNAME.test(username)) fail(400, 'Type a username, or * for everyone.');
  const amount = Math.trunc(Number(body.amount));
  if (!Number.isFinite(amount) || amount === 0 || Math.abs(amount) > 1_000_000) fail(400, 'Amount must be between 1 and 1,000,000 (negative takes Tokens away).');
  const rows = await rpc('admin_give_tokens', { p_username: username, p_amount: amount, p_message: str(body.message, 120) }, u.token);
  return { given: rows || [] };
});

route('GET', '/api/admin/gifts', async (req, q) => {
  const u = await requireUser(req);
  const limit = Math.max(1, Math.min(200, Number(q.get('limit')) || 50));
  return (await rpc('admin_gift_log', { p_limit: limit }, u.token)) || [];
});

// ---------------------------------------------------------------- entry point
export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') { res.statusCode = 204; return res.end(); }
  const url = new URL(req.url, 'http://local');
  const path = url.pathname.replace(/\/+$/, '') || '/';
  try {
    const candidates = routes.filter(r => r.re.test(path));
    if (!candidates.length) fail(404, 'No such API route: ' + path);
    const r = candidates.find(c => c.method === req.method);
    if (!r) fail(405, 'Method not allowed.');
    if (path !== '/api/health' && !configured())
      fail(503, 'The server is not connected to Supabase yet. Set SUPABASE_URL and SUPABASE_ANON_KEY.');
    const m = r.re.exec(path), params = {};
    r.keys.forEach((k, i) => { params[k] = m[i + 1]; });
    const body = await readBody(req);
    const data = await r.fn(req, url.searchParams, body || {}, params);
    send(res, 200, data === undefined ? { ok: true } : data);
  } catch (e) {
    if (e instanceof ApiError) return send(res, e.status, { error: e.message });
    console.error('[api]', e);
    send(res, 500, { error: 'Something went wrong on the server.' });
  }
}
