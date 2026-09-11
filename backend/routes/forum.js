const express = require('express');
const config = require('../config');
const forumDb = require('../forumDb');
const sessions = require('../forumSessions');
const rateLimit = require('../middleware/rateLimit');
const events = require('../events');

const router = express.Router();
const authLimiter = rateLimit({ windowMs: 60_000, max: 10 });
const postLimiter = rateLimit({ windowMs: 60_000, max: 15 });

const USERNAME_RE = /^[a-zA-Z0-9_]{3,24}$/;

function isValidUsername(u) {
  return typeof u === 'string' && USERNAME_RE.test(u);
}

function requireAuth(req, res, next) {
  const token = req.headers['x-forum-token'];
  const session = token && sessions.getSession(token);
  if (!session) return res.status(401).json({ success: false, error: 'Not signed in.' });
  req.forumUser = session.username;
  next();
}

router.post('/register', authLimiter, (req, res) => {
  const { username, password } = req.body || {};
  if (!isValidUsername(username)) {
    return res.status(400).json({ success: false, error: 'Username must be 3-24 letters, numbers, or underscores.' });
  }
  if (typeof password !== 'string' || password.length < 8) {
    return res.status(400).json({ success: false, error: 'Password must be at least 8 characters.' });
  }

  const db = forumDb.readAll();
  const key = username.toLowerCase();
  if (db.users[key]) {
    return res.status(409).json({ success: false, error: 'That username is already taken.' });
  }

  const { salt, hash } = forumDb.hashPassword(password);
  db.users[key] = {
    username,
    salt,
    hash,
    joinedAt: new Date().toISOString(),
    postCount: 0,
  };
  forumDb.writeAll(db);

  const token = sessions.createSession(username);
  res.status(201).json({ success: true, token, username });
});

router.post('/login', authLimiter, (req, res) => {
  const { username, password } = req.body || {};
  if (!isValidUsername(username) || typeof password !== 'string') {
    return res.status(400).json({ success: false, error: 'Invalid username or password.' });
  }

  const db = forumDb.readAll();
  const user = db.users[username.toLowerCase()];
  if (!user || !forumDb.verifyPassword(password, user.salt, user.hash)) {
    return res.status(401).json({ success: false, error: 'Invalid username or password.' });
  }

  const token = sessions.createSession(user.username);
  res.json({ success: true, token, username: user.username });
});

router.post('/logout', requireAuth, (req, res) => {
  sessions.destroySession(req.headers['x-forum-token']);
  res.json({ success: true });
});

router.get('/session', (req, res) => {
  const token = req.headers['x-forum-token'];
  const session = token && sessions.getSession(token);
  res.json({ success: true, signedIn: Boolean(session), username: session?.username || null });
});

router.get('/categories', (_req, res) => {
  res.json({ success: true, data: config.get().forumCategories || [] });
});

router.get('/stats', (_req, res) => {
  const db = forumDb.readAll();
  const users = Object.values(db.users);
  const threads = Object.values(db.threads);
  const posts = Object.values(db.posts);
  const newest = users.sort((a, b) => new Date(b.joinedAt) - new Date(a.joinedAt))[0];

  const perCategory = {};
  for (const t of threads) perCategory[t.category] = (perCategory[t.category] || 0) + 1 + (t.replyCount || 0);

  res.json({
    success: true,
    data: {
      totalPosts: posts.length,
      totalThreads: threads.length,
      totalMembers: users.length,
      newestMember: newest?.username || null,
      perCategory,
    },
  });
});

router.get('/threads', (req, res) => {
  const { category } = req.query;
  const db = forumDb.readAll();
  let threads = Object.values(db.threads);
  if (category) threads = threads.filter((t) => t.category === category);
  threads.sort((a, b) => new Date(b.lastPostAt) - new Date(a.lastPostAt));

  res.json({
    success: true,
    data: threads.map((t) => ({
      id: t.id,
      category: t.category,
      title: t.title,
      author: t.author,
      createdAt: t.createdAt,
      lastPostAt: t.lastPostAt,
      replyCount: t.replyCount,
    })),
  });
});

router.get('/threads/:id', (req, res) => {
  const db = forumDb.readAll();
  const thread = db.threads[req.params.id];
  if (!thread) return res.status(404).json({ success: false, error: 'Thread not found.' });

  const posts = Object.values(db.posts)
    .filter((p) => p.threadId === thread.id)
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

  res.json({ success: true, data: { thread, posts } });
});

router.post('/threads', requireAuth, postLimiter, (req, res) => {
  const { category, title, body } = req.body || {};
  const validCategories = (config.get().forumCategories || []).map((c) => c.id);

  if (!validCategories.includes(category)) {
    return res.status(400).json({ success: false, error: 'Unknown category.' });
  }
  if (typeof title !== 'string' || title.trim().length < 4 || title.length > 120) {
    return res.status(400).json({ success: false, error: 'Title must be 4-120 characters.' });
  }
  if (typeof body !== 'string' || body.trim().length < 10 || body.length > 5000) {
    return res.status(400).json({ success: false, error: 'Post body must be 10-5000 characters.' });
  }

  const db = forumDb.readAll();
  const id = String(db.nextThreadId++);
  const now = new Date().toISOString();

  db.threads[id] = {
    id,
    category,
    title: title.trim(),
    author: req.forumUser,
    createdAt: now,
    lastPostAt: now,
    replyCount: 0,
  };

  const postId = String(db.nextPostId++);
  db.posts[postId] = { id: postId, threadId: id, author: req.forumUser, body: body.trim(), createdAt: now };

  const authorKey = req.forumUser.toLowerCase();
  if (db.users[authorKey]) db.users[authorKey].postCount += 1;

  forumDb.writeAll(db);
  events.safeEmit('forum:thread', { id, category, title: db.threads[id].title, author: req.forumUser });
  res.status(201).json({ success: true, data: db.threads[id] });
});

router.post('/threads/:id/posts', requireAuth, postLimiter, (req, res) => {
  const { body } = req.body || {};
  if (typeof body !== 'string' || body.length > 5000) {
    return res.status(400).json({
      success: false,
      error: 'Reply must be 5000 characters or less.'
    });
  }

  const db = forumDb.readAll();
  const thread = db.threads[req.params.id];
  if (!thread) return res.status(404).json({ success: false, error: 'Thread not found.' });

  const postId = String(db.nextPostId++);
  const now = new Date().toISOString();
  db.posts[postId] = { id: postId, threadId: thread.id, author: req.forumUser, body: body.trim(), createdAt: now };

  thread.replyCount += 1;
  thread.lastPostAt = now;

  const authorKey = req.forumUser.toLowerCase();
  if (db.users[authorKey]) db.users[authorKey].postCount += 1;

  forumDb.writeAll(db);
  events.safeEmit('forum:post', { id: postId, threadId: thread.id, threadTitle: thread.title, author: req.forumUser });
  res.status(201).json({ success: true, data: db.posts[postId] });
});

module.exports = router;
