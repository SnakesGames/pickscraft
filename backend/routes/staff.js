const express = require('express');
const config = require('../config');
const staffDb = require('../staffDb');
const rateLimit = require('../middleware/rateLimit');
const events = require('../events');

const router = express.Router();
const applyLimiter = rateLimit({ windowMs: 60 * 60_000, max: 3 }); // 3 applications per hour per IP

const USERNAME_RE = /^[a-zA-Z0-9_]{3,24}$/;

router.get('/team', (_req, res) => {
  res.json({ success: true, data: config.get().staffTeam || [] });
});

router.get('/positions', (_req, res) => {
  res.json({ success: true, data: config.get().staffPositions || [] });
});

router.post('/apply', applyLimiter, (req, res) => {
  const { username, age, position, discord, experience, whyYou } = req.body || {};
  const validPositions = (config.get().staffPositions || []).map((p) => p.id);

  if (!USERNAME_RE.test(username || '')) {
    return res.status(400).json({ success: false, error: 'Enter a valid Minecraft username.' });
  }
  const ageNum = Number(age);
  if (!Number.isInteger(ageNum) || ageNum < 10 || ageNum > 99) {
    return res.status(400).json({ success: false, error: 'Enter a valid age.' });
  }
  if (!validPositions.includes(position)) {
    return res.status(400).json({ success: false, error: 'Select a valid position.' });
  }
  if (typeof experience !== 'string' || experience.trim().length < 20 || experience.length > 2000) {
    return res.status(400).json({ success: false, error: 'Experience must be 20-2000 characters.' });
  }
  if (typeof whyYou !== 'string' || whyYou.trim().length < 20 || whyYou.length > 2000) {
    return res.status(400).json({ success: false, error: 'Tell us why you\'d be a good fit (20-2000 characters).' });
  }

  const db = staffDb.readAll();
  const id = String(db.nextId++);
  db.applications[id] = {
    id,
    username,
    age: ageNum,
    position,
    discord: typeof discord === 'string' ? discord.trim().slice(0, 50) : '',
    experience: experience.trim(),
    whyYou: whyYou.trim(),
    status: 'pending',
    submittedAt: new Date().toISOString(),
  };
  staffDb.writeAll(db);
  events.safeEmit('staff:application', { id, username, position });

  res.status(201).json({ success: true, message: 'Application submitted! The team will review it soon.' });
});

module.exports = router;