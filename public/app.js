// Pickscraft Network website. Everything goes through this site's own /api (lib/api.js) -
// the same API the Unity game uses - so no database keys are needed in the browser.

import { LEGAL, privacyHtml, termsHtml } from './legal.js';

const cfg = window.PICKSCRAFT_CONFIG || {};
const API = (cfg.apiBase || '').replace(/\/+$/, '');
const app = document.getElementById('app');
const COLORS = ['#F7C78C', '#E0A47A', '#B9785A', '#7A4E35', '#FFD84D', '#FF7A2E', '#FF5470', '#C04BF2',
  '#8B5CF6', '#338CF2', '#2EC4E8', '#3DDC84', '#9BE15D', '#FFFFFF', '#9AA0AE', '#2A2A33'];
const SESSION_KEY = 'pickscraft.session';
let session = loadSession();
let serverReady = true;

// ---------- session + API ----------
function loadSession() { try { return JSON.parse(localStorage.getItem(SESSION_KEY)) || null; } catch { return null; } }
function saveSession(s) {
  session = s ? { ...s, expires_at: Date.now() + (s.expires_in || 3600) * 1000 } : null;
  try { s ? localStorage.setItem(SESSION_KEY, JSON.stringify(session)) : localStorage.removeItem(SESSION_KEY); } catch { /* private mode */ }
  updateNav();
}
const me = () => session?.user ?? null;

async function refreshIfNeeded() {
  if (!session?.refresh_token || Date.now() < session.expires_at - 90_000) return;
  try { saveSession(await raw('POST', '/api/auth/refresh', { refresh_token: session.refresh_token }, false)); }
  catch { saveSession(null); }
}

async function raw(method, path, body, auth = true) {
  const headers = { 'Content-Type': 'application/json' };
  if (auth && session?.access_token) headers.Authorization = 'Bearer ' + session.access_token;
  let r;
  try { r = await fetch(API + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }); }
  catch { throw new Error("Can't reach the Pickscraft server."); }
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    if (r.status === 401 && auth && session) saveSession(null);
    if (r.status === 503) serverReady = false;
    throw new Error(data.error || 'Request failed (' + r.status + ')');
  }
  return data;
}

async function api(method, path, body) {
  await refreshIfNeeded();
  return raw(method, path, body);
}

// ---------- helpers ----------
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const validName = u => /^[A-Za-z0-9_]{3,20}$/.test(u);
function toast(msg) {
  const t = document.getElementById('toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 2600);
}
function avatar(p, big = false) {
  return `<div class="avatar${big ? ' big' : ''}" style="background:${esc(p.avatar_color || '#F7C78C')};box-shadow:inset 0 -${big ? 18 : 8}px 0 ${esc(p.shirt_color || '#338CF2')}"></div>`;
}
const ROOM_NAMES = { dorm: 'their dorm', plaza: 'the Plaza', splat: 'Splat Clash', beam: 'Beam Battle', quest: 'Crystal Caverns', maker: 'a Maker room' };
function whereText(f) {
  if (!f.online) return f.last_seen ? `Last seen ${new Date(f.last_seen).toLocaleString()}` : 'Offline';
  return `In ${esc(f.room_name || ROOM_NAMES[f.room_kind] || 'a room')}${f.platform ? ' &middot; ' + esc(f.platform) : ''}`;
}
function need() {
  if (!me()) { location.hash = '#/login'; return false; }
  return true;
}
const FRIEND_MSG = { sent: 'Request sent!', accepted: 'You are now friends!', not_found: 'No player with that username.', self: "That's you!", already_friends: 'Already friends.' };

// ---------- pages ----------
async function home() {
  app.innerHTML = `
  <section class="hero">
    <div>
      <h1>Hang out. Play. <span>Build anything.</span></h1>
      <p>Pickscraft Network is a social game for VR, desktop and mobile. Meet friends in the Plaza, battle in Splat Clash and Beam Battle, team up in Crystal Caverns, and build your own rooms with the Maker Pen.</p>
      <div class="row"><a class="btn" href="downloads/Pickscraft%20Network%20Launcher.exe" download>&#11015; Download for Windows</a>${me() ? `<a class="btn ghost" href="#/friends">Find friends</a><a class="btn ghost" href="#/me">Your profile</a>`
        : `<a class="btn ghost" href="#/signup">Create your account</a><a class="btn ghost" href="#/login">Log in</a>`}</div>
      <p class="hint">The launcher installs the game and keeps it up to date.</p>
    </div>
    <div class="art"><img src="assets/models.png" alt="Pickscraft avatar, blasters, plaza fountain, dorm furniture and the Gloomlet"></div>
  </section>
  <section class="stats"><div class="stat"><b id="s-players">&ndash;</b><span>players</span></div>
    <div class="stat"><b id="s-online">&ndash;</b><span>online now</span></div><div class="stat"><b id="s-rooms">&ndash;</b><span>player rooms</span></div></section>
  <section class="grid features">
    <div class="card"><div class="icon">&#127963;&#65039;</div><h3>The Plaza</h3><p>The town square where everyone meets up, with portals to every game.</p></div>
    <div class="card"><div class="icon">&#127912;</div><h3>Splat Clash</h3><p>Team paint battles with capture the flag.</p></div>
    <div class="card"><div class="icon">&#9889;</div><h3>Beam Battle</h3><p>Fast free-for-all laser tag.</p></div>
    <div class="card"><div class="icon">&#128142;</div><h3>Crystal Caverns</h3><p>Co-op quest: defend the crystals from waves of Gloomlets.</p></div>
    <div class="card"><div class="icon">&#128394;&#65039;</div><h3>Maker Pen</h3><p>Build rooms together, save them and share them here.</p></div>
    <div class="card"><div class="icon">&#128719;&#65039;</div><h3>Your Dorm</h3><p>Your own private room to invite friends to.</p></div>
  </section>`;
  try {
    const s = await api('GET', '/api/stats');
    for (const k of ['players', 'online', 'rooms']) document.getElementById('s-' + k).textContent = s[k];
  } catch { /* stats are optional */ }
}

function authPage(mode) {
  const signup = mode === 'signup';
  app.innerHTML = `<form class="form card" id="auth">
    <h2>${signup ? 'Create your account' : 'Welcome back'}</h2>
    ${signup ? `<label for="u">Username</label><input id="u" autocomplete="username" maxlength="20" required>
    <div class="hint">3&ndash;20 letters, numbers or _. This is how friends find you.</div>` : ''}
    <label for="em">Email</label><input id="em" type="email" autocomplete="email" maxlength="254" required>
    <label for="p">Password</label><input id="p" type="password" autocomplete="${signup ? 'new' : 'current'}-password" minlength="6" required>
    ${signup ? `<label for="p2">Confirm password</label><input id="p2" type="password" autocomplete="new-password" required>
    <label class="check"><input type="checkbox" id="agree" required><span>I'm ${LEGAL.minAge} or older (or have my parent's permission if I'm under 18),
      and I agree to the <a href="#/terms" target="_blank">Terms of Service</a> and <a href="#/privacy" target="_blank">Privacy Policy</a>.</span></label>` : ''}
    <div class="error" id="err"></div>
    <button class="btn" style="width:100%">${signup ? 'Sign up' : 'Log in'}</button>
    <p class="hint" style="text-align:center">${signup ? 'Already have an account? <a href="#/login">Log in</a>' : 'New here? <a href="#/signup">Make an account</a>'}</p>
    <p class="hint" style="text-align:center">Use the same email and password in the game.</p>
  </form>`;
  document.getElementById('auth').onsubmit = async e => {
    e.preventDefault();
    const err = document.getElementById('err'), btn = e.target.querySelector('button');
    const username = signup ? document.getElementById('u').value.trim() : '';
    const email = document.getElementById('em').value.trim().toLowerCase(), password = document.getElementById('p').value;
    err.textContent = '';
    if (signup && !validName(username)) return err.textContent = 'Usernames are 3-20 letters, numbers or _.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return err.textContent = 'Please enter a real email address.';
    if (password.length < 6) return err.textContent = 'Passwords need at least 6 characters.';
    if (signup && password !== document.getElementById('p2').value) return err.textContent = 'Passwords do not match.';
    if (signup && !document.getElementById('agree').checked) return err.textContent = 'Please agree to the Terms of Service and Privacy Policy.';
    btn.disabled = true;
    try {
      const r = await raw('POST', signup ? '/api/auth/signup' : '/api/auth/login', signup ? { username, email, password, accept_terms: LEGAL.version } : { email, password }, false);
      if (r.confirm) { app.innerHTML = `<div class="card empty"><h2>Check your email</h2><p>${esc(r.message)}</p><p><a class="btn" href="#/login">Go to log in</a></p></div>`; return; }
      saveSession(r);
      if (signup) { toast('Welcome to Pickscraft Network!'); location.hash = '#/me'; }
      else location.hash = '#/friends';
    } catch (x) { err.textContent = x.message; } finally { btn.disabled = false; }
  };
}

function legalPage(html) {
  app.innerHTML = `<article class="card legal">${html}</article>`;
  scrollTo(0, 0);
}

async function profileEdit() {
  if (!need()) return;
  let p;
  try { p = await api('GET', '/api/me'); }
  catch (x) { app.innerHTML = `<div class="card empty">${esc(x.message)}</div>`; return; }
  let skin = p.avatar_color, shirt = p.shirt_color;
  const sw = sel => COLORS.map(c => `<button type="button" class="swatch${c.toLowerCase() === String(sel).toLowerCase() ? ' sel' : ''}" data-c="${c}" style="background:${c}" aria-label="${c}"></button>`).join('');
  app.innerHTML = `<div class="profile-head"><div id="prev">${avatar(p, true)}</div><div><h1>${esc(p.display_name)}</h1>
    <span class="tag">@${esc(p.username)}</span> <span class="tag">Level ${p.level}</span> <span class="tag">${p.xp} XP</span>
    <span class="tag token">${tokenIcon()} ${(p.tokens || 0).toLocaleString()} Tokens</span>
    <p class="hint"><a href="#/u/${esc(p.username)}">View public profile</a> &middot; <a href="#/creator">Creator dashboard</a></p></div></div>
  <div id="gifts"></div>
  <form class="card" id="pf"><div class="two"><div>
    <label for="dn">Display name</label><input id="dn" maxlength="32" value="${esc(p.display_name)}">
    <label for="bio">Bio</label><textarea id="bio" rows="4" maxlength="280">${esc(p.bio)}</textarea></div><div>
    <label>Skin colour</label><div class="swatches" id="sk">${sw(skin)}</div>
    <label>Shirt colour</label><div class="swatches" id="sh">${sw(shirt)}</div>
    <p class="hint">Your avatar colours show up in the game next time you join a room.</p></div></div>
    <div class="error" id="err"></div><button class="btn">Save profile</button></form>`;
  const pick = (box, set) => document.getElementById(box).onclick = e => {
    const c = e.target.dataset.c; if (!c) return; set(c);
    [...e.currentTarget.children].forEach(b => b.classList.toggle('sel', b.dataset.c === c));
    document.getElementById('prev').innerHTML = avatar({ avatar_color: skin, shirt_color: shirt }, true);
  };
  pick('sk', c => skin = c); pick('sh', c => shirt = c);
  try {
    const gifts = await api('GET', '/api/me/gifts');
    if (gifts.length) document.getElementById('gifts').innerHTML = `<div class="card gift-note">${giftIcon()}<div><b>You have ${gifts.length === 1 ? 'a gift box' : gifts.length + ' gift boxes'} waiting!</b>
      <div class="hint" style="margin:0">${gifts.reduce((a, g) => a + g.amount, 0).toLocaleString()} Tokens are already in your balance. Join the game to open ${gifts.length === 1 ? 'it' : 'them'}.</div></div></div>`;
  } catch { /* gifts are optional */ }
  document.getElementById('pf').onsubmit = async e => {
    e.preventDefault();
    const err = document.getElementById('err');
    try {
      await api('PATCH', '/api/me', { display_name: document.getElementById('dn').value.trim() || p.username,
        bio: document.getElementById('bio').value, avatar_color: skin, shirt_color: shirt });
      err.textContent = ''; toast('Profile saved');
    } catch (x) { err.textContent = x.message; }
  };
}

async function friends() {
  if (!need()) return;
  app.innerHTML = `<h1>Friends</h1><div class="two">
    <div class="card"><h3>Your friends</h3><div id="fl"><div class="empty">Loading&hellip;</div></div></div>
    <div><form class="card" id="add"><h3>Add a friend</h3><div class="row">
      <input id="fu" placeholder="Their username" maxlength="20" style="flex:1"><button class="btn">Send</button></div>
      <div class="error" id="err"></div></form>
    <div class="card" style="margin-top:20px"><h3>Requests</h3><div id="rq"><div class="empty">Loading&hellip;</div></div></div></div></div>`;
  const load = async () => {
    let fl = [], rq = [];
    try { [fl, rq] = await Promise.all([api('GET', '/api/friends'), api('GET', '/api/friends/requests')]); }
    catch (x) { document.getElementById('fl').innerHTML = `<div class="empty">${esc(x.message)}</div>`; return; }
    document.getElementById('fl').innerHTML = fl.length ? fl.map(f => `<div class="person">${avatar(f)}<div class="info">
      <a href="#/u/${esc(f.username)}">${esc(f.display_name)}</a><small><span class="dot${f.online ? ' on' : ''}"></span>${whereText(f)}</small></div>
      <button class="btn small ghost" data-rm="${esc(f.id)}">Remove</button></div>`).join('') : `<div class="empty">No friends yet. Add someone by username!</div>`;
    document.getElementById('rq').innerHTML = rq.length ? rq.map(r => `<div class="person"><div class="info">
      <a href="#/u/${esc(r.username)}">${esc(r.display_name)}</a><small>${r.direction === 'incoming' ? 'Wants to be friends' : 'Waiting for them to accept'}</small></div>
      ${r.direction === 'incoming' ? `<button class="btn small" data-yes="${r.request_id}">Accept</button><button class="btn small ghost" data-no="${r.request_id}">Decline</button>`
        : `<button class="btn small ghost" data-rm="${esc(r.user_id)}">Cancel</button>`}</div>`).join('') : `<div class="empty">No pending requests.</div>`;
  };
  app.onclick = async e => {
    const d = e.target.dataset;
    try {
      if (d.rm) { await api('POST', '/api/friends/remove', { user_id: d.rm }); toast('Removed'); load(); }
      if (d.yes || d.no) { await api('POST', '/api/friends/respond', { request_id: +(d.yes || d.no), accept: !!d.yes }); toast(d.yes ? 'You are now friends!' : 'Declined'); load(); }
    } catch (x) { toast(x.message); }
  };
  document.getElementById('add').onsubmit = async e => {
    e.preventDefault();
    const err = document.getElementById('err');
    try {
      const { result } = await api('POST', '/api/friends/request', { username: document.getElementById('fu').value.trim() });
      const good = ['sent', 'accepted'].includes(result);
      err.textContent = good ? '' : (FRIEND_MSG[result] || "Couldn't send the request.");
      if (good) { toast(FRIEND_MSG[result]); e.target.reset(); load(); }
    } catch (x) { err.textContent = x.message; }
  };
  load();
  clearInterval(friends.t); friends.t = setInterval(() => location.hash === '#/friends' ? load() : clearInterval(friends.t), 20000);
}

async function player(username) {
  let p;
  try { p = await api('GET', '/api/players/' + encodeURIComponent(username)); }
  catch { app.innerHTML = `<div class="card empty">No player called @${esc(username)}.</div>`; return; }
  const self = me()?.id === p.id;
  app.innerHTML = `<div class="profile-head">${avatar(p, true)}<div><h1>${esc(p.display_name)}</h1>
    <span class="tag">@${esc(p.username)}</span> <span class="tag">Level ${p.level}</span>
    <span class="tag">Joined ${new Date(p.created_at).toLocaleDateString()}</span>
    <p>${esc(p.bio) || '<span class="hint">No bio yet.</span>'}</p>
    ${self ? `<a class="btn small" href="#/me">Edit profile</a>` : me() ? `<button class="btn small" id="addf">Add friend</button>` : ''}</div></div>
    <h2>Rooms by ${esc(p.display_name)}</h2>${roomCards(p.rooms)}`;
  const b = document.getElementById('addf');
  if (b) b.onclick = async () => {
    try { const { result } = await api('POST', '/api/friends/request', { username: p.username }); toast(FRIEND_MSG[result] || 'Could not send'); }
    catch (x) { toast(x.message); }
  };
}

const CATS = ['hangout', 'game', 'obby', 'art', 'showcase', 'roleplay', 'puzzle', 'other'];
const cap = w => w ? w[0].toUpperCase() + w.slice(1) : '';
const thumb = (down = false) => `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" style="vertical-align:-3px${down ? ';transform:rotate(180deg)' : ''}"><path fill="currentColor" d="M2 21h4V9H2v12zm20-11a2 2 0 0 0-2-2h-6.3l1-4.6v-.3c0-.4-.2-.8-.4-1.1L13.2 1 6.6 7.6C6.2 8 6 8.5 6 9v10a2 2 0 0 0 2 2h9c.8 0 1.5-.5 1.8-1.2l3-7.1c.1-.2.2-.5.2-.7v-2z"/></svg>`;
const rating = r => { const t = (r.likes || 0) + (r.dislikes || 0); return t ? Math.round(100 * (r.likes || 0) / t) + '% liked' : 'No ratings yet'; };

function roomCards(rooms) {
  return rooms?.length ? `<div class="grid">${rooms.map(r => `<a class="card" style="text-decoration:none" href="#/room/${esc(r.id)}">
    <h3>${esc(r.name)}</h3><p>${esc(r.description) || 'A Maker Pen creation.'}</p>
    <div class="row" style="gap:6px">${r.settings?.category ? `<span class="tag">${esc(cap(r.settings.category))}</span>` : ''}
    <span class="tag">${fmt(r.visits)} visits</span><span class="tag" style="color:#3ddc84">${thumb()} ${fmt(r.likes)}</span>
    <span class="tag" style="color:#ff7a8a">${thumb(true)} ${fmt(r.dislikes)}</span>${r.profiles ? ` <span class="tag">by @${esc(r.profiles.username)}</span>` : ''}
    ${r.is_public === false ? '<span class="tag">Private</span>' : ''}</div></a>`).join('')}</div>`
    : `<div class="card empty">No rooms here yet. Build one in-game with the Maker Pen and tap Publish.</div>`;
}

async function rooms() {
  app.innerHTML = `<h1>Player rooms</h1><div class="tabs" style="flex-wrap:wrap"><button class="btn small" data-s="popular">Popular</button>
    <button class="btn small ghost" data-s="liked">Top rated</button><button class="btn small ghost" data-s="new">New</button>
    ${me() ? `<button class="btn small ghost" data-s="mine">Mine</button>` : ''}</div>
    <div class="row" style="margin-bottom:16px;max-width:320px"><select id="cat"><option value="">All categories</option>
    ${CATS.map(c => `<option value="${c}">${cap(c)}</option>`).join('')}</select></div><div id="list"></div>`;
  let sort = 'popular';
  const load = async () => {
    const cat = document.getElementById('cat').value;
    const q = sort === 'mine' ? '?scope=mine&limit=60' : `?sort=${sort}&limit=60${cat ? '&category=' + cat : ''}`;
    document.getElementById('list').innerHTML = '<div class="card empty">Loading...</div>';
    try { document.getElementById('list').innerHTML = roomCards(await api('GET', '/api/rooms' + q)); }
    catch (x) { document.getElementById('list').innerHTML = `<div class="card empty">${esc(x.message)}</div>`; }
  };
  app.querySelector('.tabs').onclick = e => { const s = e.target.closest('button')?.dataset.s; if (!s) return;
    [...e.currentTarget.children].forEach(b => b.classList.toggle('ghost', b.dataset.s !== s)); sort = s; load(); };
  document.getElementById('cat').onchange = load;
  load();
}

const SETTING_ROWS = [
  ['category', 'Category', [['', 'None'], ...CATS.map(c => [c, cap(c)])]],
  ['gravity', 'Gravity', [[0.3, 'Moon'], [0.6, 'Low'], [1, 'Normal'], [1.6, 'High'], [2.5, 'Heavy']]],
  ['speed', 'Walk speed', [[0.6, 'Slow'], [1, 'Normal'], [1.5, 'Fast'], [2.2, 'Super fast']]],
  ['jump', 'Jump power', [[0, 'No jumping'], [0.6, 'Low'], [1, 'Normal'], [1.6, 'High'], [2.5, 'Super']]],
  ['respawn_y', 'Respawn if below', [[-5, '5 m'], [-15, '15 m'], [-30, '30 m'], [-60, '60 m'], [-150, '150 m']]],
  ['max_players', 'Player limit', [[4, '4'], [8, '8'], [12, '12'], [16, '16'], [20, '20']]],
  ['chat', 'Chat', [[true, 'On'], [false, 'Off']]],
  ['sky', 'Sky', [['', 'Normal'], ['#FF8A5B', 'Sunset'], ['#1B1F4A', 'Night'], ['#FF8FD1', 'Pink'], ['#7CF5C4', 'Mint'], ['#3A8DFF', 'Ocean'],
    ['#FFD84D', 'Gold'], ['#8B5CF6', 'Purple'], ['#3A5A2A', 'Spooky'], ['#E0381F', 'Fire']]]
];
const DEFAULTS = { build: 'everyone', category: '', gravity: 1, speed: 1, jump: 1, respawn_y: -30, max_players: 12, chat: true, sky: '' };
const nearest = (opts, v) => opts.reduce((b, o) => (typeof o[0] === 'number' && Math.abs(o[0] - v) < Math.abs(b[0] - v) ? o : b), opts[0])[0];

async function room(id) {
  let r;
  try { r = await api('GET', '/api/rooms/' + encodeURIComponent(id)); }
  catch (x) { app.innerHTML = `<div class="card empty">${esc(x.message)}</div>`; return; }
  const mine = me()?.id === r.owner_id, blocks = r.data?.blocks?.length || 0, chips = r.data?.chips?.length || 0;
  const st = { ...DEFAULTS, ...(r.settings || {}) };
  const pick = (key, opts) => { const v = st[key]; return typeof opts[0][0] === 'number' ? nearest(opts, Number(v)) : v; };
  const settingsHtml = SETTING_ROWS.map(([key, label, opts]) => `<div class="row" style="margin:6px 0"><b style="min-width:150px">${label}</b>
    ${opts.map(([v, n]) => `<button class="btn small ${String(pick(key, opts)) === String(v) ? '' : 'ghost'}" ${mine ? '' : 'disabled'}
      data-key="${key}" data-val='${JSON.stringify(v)}'>${n}</button>`).join('')}</div>`).join('');
  const link = location.origin + location.pathname + '#/room/' + r.id;
  app.innerHTML = `<div class="card"><h1>${esc(r.name)}</h1><p>${esc(r.description) || 'A Maker Pen creation.'}</p>
    <div class="row"><span class="tag">by <a href="#/u/${esc(r.profiles?.username)}">@${esc(r.profiles?.username)}</a></span>
    ${st.category ? `<span class="tag">${esc(cap(st.category))}</span>` : ''}
    <span class="tag">${blocks} pieces</span><span class="tag">${chips} CV3 chips</span><span class="tag">${fmt(r.visits)} visits</span>
    <span class="tag">${r.is_public ? 'Public' : 'Private'}</span><span class="tag">Up to ${st.max_players} players</span></div>
    <div class="row" style="margin-top:16px">
      <button class="btn small ${r.my_vote === 1 ? '' : 'ghost'}" id="like" ${mine ? 'disabled title="You can\'t rate your own room"' : ''} style="${r.my_vote === 1 ? 'background:#3ddc84' : ''}">${thumb()} Like · ${fmt(r.likes)}</button>
      <button class="btn small ${r.my_vote === -1 ? 'danger' : 'ghost'}" id="dislike" ${mine ? 'disabled' : ''}>${thumb(true)} Dislike · ${fmt(r.dislikes)}</button>
      <span class="hint" style="margin:0">${rating(r)}</span>
      <button class="btn small ghost" id="share">Copy link</button></div>
    <p class="hint">Open the game, press Tab, go to <b>Create</b> or <b>Play &rsaquo; Maker Rooms</b> and pick <b>${esc(r.name)}</b> to visit.</p></div>
    ${mine ? `<div class="card" style="margin-top:16px"><h2>Manage room</h2>
      <label class="hint">Name</label><input id="rname" maxlength="40" value="${esc(r.name)}">
      <label class="hint">Description</label><textarea id="rdesc" maxlength="280" rows="3">${esc(r.description)}</textarea>
      <div class="row" style="margin-top:12px"><button class="btn small" id="savedet">Save name &amp; description</button>
      <button class="btn small purple" id="pub">${r.is_public ? 'Make private' : 'Make public'}</button>
      <button class="btn small ghost" id="copy">Save a copy</button>
      <button class="btn small danger" id="del">Delete room</button></div>
      <h3 style="margin-top:22px">Co-owners</h3>
      <p class="hint">Only you and your co-owners can use the Maker Pen in this room. Co-owners can also open it while it's private.</p>
      <div class="row" style="gap:8px;margin:8px 0">${(r.co_owners || []).length ? r.co_owners.map(c => `<span class="tag">@${esc(c.username)}
        <button class="btn small ghost" style="padding:0 8px;margin-left:6px" data-rm="${esc(c.id)}" title="Remove">&times;</button></span>`).join('') : '<span class="hint" style="margin:0">No co-owners yet.</span>'}</div>
      <div class="row" style="max-width:520px"><input id="coname" maxlength="21" placeholder="Username to add" style="flex:1">
      <button class="btn small purple" id="coadd">Add co-owner</button></div></div>` : ''}
    ${!mine && r.is_coowner ? `<div class="card" style="margin-top:16px"><h2>You're a co-owner</h2>
      <p class="hint">You can build in this room with the Maker Pen.</p><button class="btn small ghost" id="leave">Stop being a co-owner</button></div>` : ''}
    <div class="card" style="margin-top:16px"><h2>Room settings</h2>
      <p class="hint">${mine ? 'Changes save right away and apply the next time the room loads (or instantly from the in-game Room tab).' : 'Set by the room creator.'}</p>
      ${settingsHtml}</div>`;

  const vote = async v => {
    if (!me()) { toast('Log in to rate rooms.'); return; }
    try { await api('POST', `/api/rooms/${r.id}/vote`, { vote: r.my_vote === v ? 0 : v }); room(id); } catch (x) { toast(x.message); }
  };
  document.getElementById('like').onclick = () => vote(1);
  document.getElementById('dislike').onclick = () => vote(-1);
  document.getElementById('share').onclick = async () => {
    try { await navigator.clipboard.writeText(link); toast('Link copied!'); } catch { prompt('Copy this link:', link); }
  };
  if (!mine && r.is_coowner) document.getElementById('leave').onclick = async () => {
    if (!confirm('Stop being a co-owner of this room?')) return;
    try { await api('DELETE', `/api/rooms/${r.id}/coowners/${me().id}`); room(id); } catch (x) { toast(x.message); }
  };
  if (!mine) return;
  const addCo = async () => {
    const n = document.getElementById('coname').value.trim();
    if (!n) return;
    try { const c = await api('POST', `/api/rooms/${r.id}/coowners`, { username: n }); toast('@' + c.username + ' is now a co-owner.'); room(id); } catch (x) { toast(x.message); }
  };
  document.getElementById('coadd').onclick = addCo;
  document.getElementById('coname').onkeydown = e => { if (e.key === 'Enter') addCo(); };
  app.querySelectorAll('[data-rm]').forEach(b => b.onclick = async e => {
    e.preventDefault();
    try { await api('DELETE', `/api/rooms/${r.id}/coowners/${b.dataset.rm}`); toast('Co-owner removed.'); room(id); } catch (x) { toast(x.message); }
  });
  app.querySelectorAll('[data-key]').forEach(b => b.onclick = async () => {
    const next = { ...st, [b.dataset.key]: JSON.parse(b.dataset.val) };
    try { await api('PATCH', '/api/rooms/' + r.id, { settings: next }); room(id); } catch (x) { toast(x.message); }
  });
  document.getElementById('savedet').onclick = async () => {
    try { await api('PATCH', '/api/rooms/' + r.id, { name: document.getElementById('rname').value, description: document.getElementById('rdesc').value }); toast('Saved!'); room(id); }
    catch (x) { toast(x.message); }
  };
  document.getElementById('pub').onclick = async () => {
    try { await api('PATCH', '/api/rooms/' + r.id, { is_public: !r.is_public }); toast(r.is_public ? 'Room is private now.' : 'Room is public!'); room(id); } catch (x) { toast(x.message); }
  };
  document.getElementById('copy').onclick = async () => {
    try { const c = await api('POST', `/api/rooms/${r.id}/copy`, {}); toast('Copy saved (private).'); location.hash = '#/room/' + c.id; } catch (x) { toast(x.message); }
  };
  document.getElementById('del').onclick = async () => {
    if (!confirm('Delete this room forever? This can\'t be undone.')) return;
    try { await api('DELETE', '/api/rooms/' + r.id); location.hash = '#/rooms'; } catch (x) { toast(x.message); }
  };
}

// ---------- tokens ----------
const tokenIcon = () => `<svg class="ticon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="#FFD84D"/><circle cx="12" cy="12" r="6.5" fill="none" stroke="#C98A00" stroke-width="2"/><path d="M12 8.2v7.6M9.6 10h4.8" stroke="#C98A00" stroke-width="2" stroke-linecap="round"/></svg>`;
const giftIcon = () => `<svg class="gicon" viewBox="0 0 48 48" aria-hidden="true"><rect x="7" y="20" width="34" height="22" rx="4" fill="#8B5CF6"/><rect x="5" y="13" width="38" height="9" rx="3" fill="#A98BFF"/><rect x="21" y="13" width="6" height="29" fill="#FFD84D"/><path d="M24 13c-4-8-13-6-9 0m9 0c4-8 13-6 9 0" fill="none" stroke="#FFD84D" stroke-width="3" stroke-linecap="round"/></svg>`;

// ---------- creator dashboard ----------
const fmt = n => Number(n || 0).toLocaleString();
const ago = d => {
  if (!d) return 'Never';
  const s = (Date.now() - new Date(d)) / 1000;
  return s < 90 ? 'Just now' : s < 3600 ? Math.round(s / 60) + ' min ago' : s < 86400 ? Math.round(s / 3600) + ' h ago' : Math.round(s / 86400) + ' days ago';
};

/** Column chart: one series, rounded tops, hairline grid, hover tooltip. data = [{label, value, tip}] */
function columnChart(el, data, { color = '#e8641f', unit = 'visits' } = {}) {
  const W = el.clientWidth || 700, H = 240, padL = 40, padR = 8, padT = 12, padB = 30;
  const max = Math.max(1, ...data.map(d => d.value));
  const step = niceStep(max), top = Math.ceil(max / step) * step;
  const iw = W - padL - padR, ih = H - padT - padB, slot = iw / data.length, bw = Math.max(3, Math.min(24, slot - 2));
  const y = v => padT + ih - (v / top) * ih;
  let g = '';
  for (let v = 0; v <= top; v += step)
    g += `<line x1="${padL}" x2="${W - padR}" y1="${y(v)}" y2="${y(v)}" class="grid"/><text x="${padL - 8}" y="${y(v) + 4}" class="tick" text-anchor="end">${compact(v)}</text>`;
  const every = Math.ceil(data.length / Math.max(1, Math.floor(iw / 64)));
  let bars = '', labels = '';
  data.forEach((d, i) => {
    const x = padL + slot * i + (slot - bw) / 2, h = Math.max(0, y(0) - y(d.value)), r = Math.min(4, bw / 2, h);
    if (d.value > 0) bars += `<path d="M${x},${y(0)} v${-(h - r)} q0,${-r} ${r},${-r} h${bw - 2 * r} q${r},0 ${r},${r} v${h - r} z" fill="${color}"/>`;
    bars += `<rect class="hit" x="${padL + slot * i}" y="${padT}" width="${slot}" height="${ih}" data-i="${i}"/>`;
    if (i % every === 0) labels += `<text x="${padL + slot * i + slot / 2}" y="${H - 8}" class="tick" text-anchor="middle">${esc(d.label)}</text>`;
  });
  el.innerHTML = `<div class="chart"><svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}" role="img" aria-label="Column chart of ${unit}">${g}${bars}${labels}</svg><div class="tip" hidden></div></div>`;
  const tip = el.querySelector('.tip'), svg = el.querySelector('svg');
  svg.addEventListener('mousemove', e => {
    const i = e.target.dataset?.i; if (i === undefined) { tip.hidden = true; return; }
    const d = data[+i];
    tip.innerHTML = `<b>${fmt(d.value)}</b> ${unit}<br><span>${esc(d.tip || d.label)}</span>`;
    tip.hidden = false;
    const box = el.getBoundingClientRect();
    tip.style.left = Math.min(box.width - 150, Math.max(0, e.clientX - box.left - 60)) + 'px';
    tip.style.top = Math.max(0, e.clientY - box.top - 64) + 'px';
  });
  svg.addEventListener('mouseleave', () => { tip.hidden = true; });
  svg.addEventListener('touchend', () => setTimeout(() => { tip.hidden = true; }, 1500));
}
function niceStep(max) {
  const raw = max / 4, p = Math.pow(10, Math.floor(Math.log10(raw)));
  const s = [1, 2, 5, 10].map(m => m * p).find(v => v >= raw) || p * 10;
  return Math.max(1, s);
}
const compact = v => v >= 1e6 ? (v / 1e6).toFixed(v % 1e6 ? 1 : 0) + 'M' : v >= 1000 ? (v / 1000).toFixed(v % 1000 ? 1 : 0) + 'K' : String(v);
const shortDay = d => new Date(d + 'T00:00:00Z').toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' });
const monthName = m => new Date(m + '-01T00:00:00Z').toLocaleDateString(undefined, { month: 'short', year: '2-digit', timeZone: 'UTC' });

function seriesFor(stats, view) {
  if (view === 'weekly') return stats.weekly.map(w => ({ label: shortDay(w.week), value: w.visits, tip: 'Week of ' + shortDay(w.week) }));
  if (view === 'monthly') return stats.monthly.map(m => ({ label: monthName(m.month), value: m.visits, tip: monthName(m.month) }));
  return stats.daily.map(d => ({ label: shortDay(d.day), value: d.visits, tip: `${shortDay(d.day)} - ${fmt(d.players)} player${d.players === 1 ? '' : 's'}` }));
}

async function creator() {
  if (!need()) return;
  app.innerHTML = `<h1>Creator dashboard</h1><p class="hint" style="margin-top:-6px">Visits to the rooms you build with the Maker Pen. Your own visits don't count, and each player counts once every 10 minutes.</p><div id="cd"><div class="card empty">Loading&hellip;</div></div>`;
  let st;
  try { st = await api('GET', '/api/creator'); }
  catch (x) { document.getElementById('cd').innerHTML = `<div class="card empty">${esc(x.message)}</div>`; return; }
  if (!st.rooms.length) {
    document.getElementById('cd').innerHTML = `<div class="card empty"><h3>No rooms yet</h3><p>Build a room in the game with the Maker Pen, save it and press Publish. Visits show up here.</p></div>`;
    return;
  }
  const t = st.totals;
  const tile = (n, label, sub) => `<div class="kpi"><b>${fmt(n)}</b><span>${label}</span>${sub ? `<small>${sub}</small>` : ''}</div>`;
  document.getElementById('cd').innerHTML = `
    <div class="kpis">${tile(t.today, 'Today')}${tile(t.week, 'This week', fmt(t.players_week) + ' players')}${tile(t.month, 'This month', fmt(t.players_month) + ' players')}${tile(t.year, 'This year')}${tile(t.all_time, 'All time', fmt(t.rooms) + (t.rooms === 1 ? ' room' : ' rooms'))}</div>
    <div class="card"><div class="row" style="justify-content:space-between"><h3 id="ctitle" style="margin:0">All rooms</h3>
      <div class="seg" id="views"><button data-v="daily" class="on">Last 30 days</button><button data-v="weekly">By week</button><button data-v="monthly">By month</button></div></div>
      <div id="chart" style="margin-top:12px"></div><button class="btn small ghost" id="allrooms" hidden>Show all rooms</button></div>
    <div class="card" style="margin-top:20px;overflow-x:auto"><h3>Your rooms</h3><table class="tbl"><thead><tr><th>Room</th><th>Today</th><th>7 days</th><th>30 days</th><th>Players (30 days)</th><th>All time</th><th>Last visit</th></tr></thead>
      <tbody>${st.rooms.map(r => `<tr data-room="${esc(r.room_id)}" tabindex="0"><td><b>${esc(r.name)}</b> <span class="tag">${r.is_public ? 'Public' : 'Private'}</span></td>
        <td>${fmt(r.today)}</td><td>${fmt(r.week)}</td><td>${fmt(r.month)}</td><td>${fmt(r.unique_month)}</td><td>${fmt(r.visits_total)}</td><td>${ago(r.last_visit)}</td></tr>`).join('')}</tbody></table>
      <p class="hint">Click a room to see its own chart.</p></div>`;
  let view = 'daily', current = st;
  const draw = () => columnChart(document.getElementById('chart'), seriesFor(current, view));
  draw();
  document.getElementById('views').onclick = e => {
    const v = e.target.dataset.v; if (!v) return;
    view = v; [...e.currentTarget.children].forEach(b => b.classList.toggle('on', b.dataset.v === v)); draw();
  };
  const pickRoom = async tr => {
    try { current = await api('GET', '/api/creator/rooms/' + tr.dataset.room); }
    catch (x) { toast(x.message); return; }
    document.getElementById('ctitle').textContent = tr.querySelector('b').textContent;
    document.getElementById('allrooms').hidden = false;
    document.querySelectorAll('.tbl tr').forEach(r => r.classList.toggle('sel', r === tr));
    draw();
  };
  document.querySelector('.tbl tbody').onclick = e => { const tr = e.target.closest('tr'); if (tr) pickRoom(tr); };
  document.querySelector('.tbl tbody').onkeydown = e => { if (e.key === 'Enter') { const tr = e.target.closest('tr'); if (tr) pickRoom(tr); } };
  document.getElementById('allrooms').onclick = e => {
    current = st; e.target.hidden = true; document.getElementById('ctitle').textContent = 'All rooms';
    document.querySelectorAll('.tbl tr').forEach(r => r.classList.remove('sel')); draw();
  };
  clearTimeout(creator.r); onresize = () => { clearTimeout(creator.r); creator.r = setTimeout(() => location.hash === '#/creator' && draw(), 150); };
}

// ---------- admin: give Tokens ----------
async function admin() {
  if (!need()) return;
  if (!myProfile) await loadMyProfile();
  if (!myProfile?.is_admin) {
    app.innerHTML = `<div class="card empty"><h3>Admins only</h3><p>To make yourself an admin, run this once in Supabase &rsaquo; SQL Editor:</p>
      <code>update public.profiles set is_admin = true where username = '${esc(me()?.username || 'YourUsername')}';</code></div>`;
    return;
  }
  app.innerHTML = `<h1>${tokenIcon()} Give Tokens</h1><div class="two">
    <form class="card" id="give"><h3>Send a gift box</h3>
      <label for="gu">Player</label><input id="gu" maxlength="20" placeholder="username, or * for everyone" required>
      <label for="ga">Amount</label><input id="ga" type="number" step="1" min="-1000000" max="1000000" value="100" required>
      <label for="gm">Message (shown when they open the box)</label><input id="gm" maxlength="120" placeholder="Thanks for playing!">
      <div class="hint">Tokens go into their balance right away. If they're in the game, a gift box drops in front of them to open; otherwise it waits for their next visit. A negative amount takes Tokens away (no box).</div>
      <div class="error" id="err"></div><button class="btn">Send Tokens</button></form>
    <div class="card"><h3>Recent gifts</h3><div id="log"><div class="empty">Loading&hellip;</div></div></div></div>`;
  const log = async () => {
    try {
      const rows = await api('GET', '/api/admin/gifts?limit=40');
      document.getElementById('log').innerHTML = rows.length ? `<table class="tbl"><thead><tr><th>To</th><th>Tokens</th><th>Message</th><th>Opened</th></tr></thead><tbody>${rows.map(r =>
        `<tr><td><a href="#/u/${esc(r.to_username)}">@${esc(r.to_username)}</a></td><td>${fmt(r.amount)}</td><td>${esc(r.message)}</td><td>${r.opened_at ? ago(r.opened_at) : '<span class="tag">Not yet</span>'}</td></tr>`).join('')}</tbody></table>` : `<div class="empty">No gifts sent yet.</div>`;
    } catch (x) { document.getElementById('log').innerHTML = `<div class="empty">${esc(x.message)}</div>`; }
  };
  document.getElementById('give').onsubmit = async e => {
    e.preventDefault();
    const err = document.getElementById('err'), btn = e.target.querySelector('button');
    const username = document.getElementById('gu').value.trim(), amount = Math.trunc(+document.getElementById('ga').value);
    if (username === '*' && !confirm(`Send ${fmt(amount)} Tokens to EVERY player?`)) return;
    btn.disabled = true; err.textContent = '';
    try {
      const { given } = await api('POST', '/api/admin/tokens', { username, amount, message: document.getElementById('gm').value });
      toast(given.length === 1 ? `Sent! @${given[0].username} now has ${fmt(given[0].tokens)} Tokens.` : `Sent to ${given.length} players!`);
      loadMyProfile(); log();
    } catch (x) { err.textContent = x.message; } finally { btn.disabled = false; }
  };
  log();
}

// ---------- router ----------
async function route() {
  app.onclick = null;
  const [, page, arg] = (location.hash || '#/').split('/');
  document.querySelectorAll('nav a').forEach(a => a.classList.toggle('active', a.getAttribute('href') === `#/${page}`));
  const pages = { '': home, login: () => authPage('login'), signup: () => authPage('signup'), me: profileEdit, friends,
    rooms, u: () => player(decodeURIComponent(arg || '')), room: () => room(arg), creator, admin,
    privacy: () => legalPage(privacyHtml()), terms: () => legalPage(termsHtml()) };
  try { await (pages[page] || home)(); } catch (e) { console.error(e); app.innerHTML = `<div class="card empty">Something went wrong: ${esc(e.message)}</div>`; }
  document.getElementById('setup-banner').hidden = serverReady;
}
function updateNav() {
  document.querySelectorAll('[data-auth]').forEach(el => el.hidden = !me());
  document.querySelectorAll('[data-guest]').forEach(el => el.hidden = !!me());
  document.querySelectorAll('[data-admin]').forEach(el => el.hidden = !(me() && myProfile?.is_admin));
  const bal = document.getElementById('balance');
  if (bal) { bal.hidden = !(me() && myProfile); if (myProfile) bal.innerHTML = `${tokenIcon()} ${(myProfile.tokens || 0).toLocaleString()}`; }
}

// The signed-in player's profile (tokens, admin flag) for the top bar.
let myProfile = null;
async function loadMyProfile() {
  if (!me()) { myProfile = null; updateNav(); return; }
  try { myProfile = await api('GET', '/api/me'); } catch { myProfile = null; }
  updateNav();
}
document.getElementById('logout').onclick = async () => {
  try { await raw('POST', '/api/auth/logout', {}); } catch { /* ignore */ }
  saveSession(null); toast('Logged out'); location.hash = '#/';
};

addEventListener('hashchange', loadMyProfile);
loadMyProfile();
fetch(API + '/api/health').then(r => r.json()).then(h => { serverReady = !!h.configured; document.getElementById('setup-banner').hidden = serverReady; }).catch(() => {});
updateNav();
addEventListener('hashchange', route);
route();
