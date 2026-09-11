// Single API client used by every page. Change BASE below to point at your
// deployed server once you take this off localhost.
'use strict';

const API = (() => {
  // On Cloudflare Pages + Render, set window.REALMCRAFT_API to your Render
  // URL (e.g. https://realmcraft-api.onrender.com) before this script loads.
  const BASE = window.REALMCRAFT_API || '';

  async function req(method, path, body, extraHeaders = {}) {
    const opts = {
      method,
      headers: { 'Content-Type': 'application/json', ...extraHeaders },
    };
    if (body) opts.body = JSON.stringify(body);

    const res = await fetch(BASE + path, opts);
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
    return json;
  }

  const health = () => req('GET', '/api/health');
  const config = () => req('GET', '/api/config');
  const status = () => req('GET', '/api/status');
  const serverStats = () => req('GET', '/api/server');
  const player = (username) => req('GET', `/api/player/${encodeURIComponent(username)}`);
  const vote = (username, siteId) => req('POST', '/api/vote', { username, siteId });
  const claimReward = (username) => req('POST', '/api/claim-reward', { username });
  const leaderboard = (limit = 10) => req('GET', `/api/leaderboard?limit=${limit}`);

  // Pass username to get player cooldown status.
  const voteSites = (username = null) => {
    const q = username ? `?username=${encodeURIComponent(username)}` : '';
    return req('GET', `/api/vote-sites${q}`);
  };

  function adminReq(method, path, body, password) {
    return req(method, path, body, { 'X-Admin-Password': password });
  }

  const staff = {
    team: () => req('GET', '/api/staff/team'),
    positions: () => req('GET', '/api/staff/positions'),
    apply: (payload) => req('POST', '/api/staff/apply', payload),
  };

  const admin = {
    stats: (pwd) => adminReq('GET', '/api/admin/stats', null, pwd),
    players: (pwd) => adminReq('GET', '/api/admin/players', null, pwd),
    reset: (pwd, username) => adminReq('POST', '/api/admin/reset-player', { username }, pwd),
    resetStreak: (pwd, username) => adminReq('POST', '/api/admin/reset-streak', { username }, pwd),
    simulate: (pwd, username, siteId) => adminReq('POST', '/api/admin/simulate-vote', { username, siteId }, pwd),
    setAnnouncement: (pwd, text, enabled, type) =>
      adminReq('POST', '/api/admin/update-announcement', { text, enabled, type }, pwd),
    setMessages: (pwd, messages) => adminReq('POST', '/api/admin/update-messages', { messages }, pwd),
    applications: (pwd) => adminReq('GET', '/api/admin/applications', null, pwd),
    setApplicationStatus: (pwd, id, status) => adminReq('POST', `/api/admin/applications/${id}/status`, { status }, pwd),
    deleteApplication: (pwd, id) => adminReq('DELETE', `/api/admin/applications/${id}`, null, pwd),
  };

  // Small memory cache.
  const _cache = {};
  const _ttl = {};
  const CACHE_MS = 15_000;

  async function cached(key, fetcher) {
    const now = Date.now();
    if (_cache[key] && now - _ttl[key] < CACHE_MS) return _cache[key];
    const result = await fetcher();
    _cache[key] = result;
    _ttl[key] = now;
    return result;
  }

  const cachedConfig = () => cached('config', config);
  const cachedStatus = () => cached('status', status);

  function forumReq(method, path, body) {
    const token = localStorage.getItem('rc_forum_token');
    return req(method, path, body, token ? { 'X-Forum-Token': token } : {});
  }

  const forum = {
    register: (username, password) => forumReq('POST', '/api/forum/register', { username, password }),
    login: (username, password) => forumReq('POST', '/api/forum/login', { username, password }),
    logout: () => forumReq('POST', '/api/forum/logout'),
    session: () => forumReq('GET', '/api/forum/session'),
    categories: () => forumReq('GET', '/api/forum/categories'),
    stats: () => forumReq('GET', '/api/forum/stats'),
    threads: (category) => forumReq('GET', `/api/forum/threads${category ? '?category=' + encodeURIComponent(category) : ''}`),
    thread: (id) => forumReq('GET', `/api/forum/threads/${encodeURIComponent(id)}`),
    createThread: (category, title, body) => forumReq('POST', '/api/forum/threads', { category, title, body }),
    reply: (threadId, body) => forumReq('POST', `/api/forum/threads/${encodeURIComponent(threadId)}/posts`, { body }),
  };

  return {
    BASE,
    health, config, status, serverStats,
    player, vote, claimReward, leaderboard, voteSites,
    admin, forum, staff,
    cachedConfig, cachedStatus,
  };
})();