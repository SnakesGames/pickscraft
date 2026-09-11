const express = require('express');
const config = require('../config');
const db = require('../db');
const vote = require('../voteLogic');
const staffDb = require('../staffDb');
const auditLog = require('../auditLog');
const adminAuth = require('../middleware/adminAuth');
const { getSecurityLog } = require('../middleware/rateLimit');

const router = express.Router();
router.use(adminAuth);

router.get('/security-log', (_req, res) => {
  res.json({ success: true, data: getSecurityLog() });
});

router.get('/audit-log', (_req, res) => {
  res.json({ success: true, data: [...auditLog.readAll()].reverse() });
});

router.get('/applications', (_req, res) => {
  const appDb = staffDb.readAll();
  const applications = Object.values(appDb.applications).sort(
    (a, b) => new Date(b.submittedAt) - new Date(a.submittedAt)
  );
  res.json({ success: true, data: applications });
});

router.post('/applications/:id/status', (req, res) => {
  const { status } = req.body || {};
  if (!['pending', 'accepted', 'rejected'].includes(status)) {
    return res.status(400).json({ success: false, error: 'Invalid status.' });
  }

  const appDb = staffDb.readAll();
  const application = appDb.applications[req.params.id];
  if (!application) return res.status(404).json({ success: false, error: 'Application not found.' });

  application.status = status;
  staffDb.writeAll(appDb);
  auditLog.logAction(req, `APPLICATION_${status.toUpperCase()}`, application.username);
  res.json({ success: true, data: application });
});

router.delete('/applications/:id', (req, res) => {
  const appDb = staffDb.readAll();
  const application = appDb.applications[req.params.id];
  if (!application) {
    return res.status(404).json({ success: false, error: 'Application not found.' });
  }
  delete appDb.applications[req.params.id];
  staffDb.writeAll(appDb);
  auditLog.logAction(req, 'APPLICATION_DELETE', application.username);
  res.json({ success: true });
});

router.get('/stats', (_req, res) => {
  const players = Object.values(db.readAll());
  const today = new Date().toISOString().split('T')[0];
  const stats = vote.getServerVoteStats(players);

  res.json({
    success: true,
    data: {
      ...stats,
      totalPlayers: players.length,
      activeToday: players.filter((p) => p.lastVoteDate === today).length,
      totalRewardsEarned: players.reduce((sum, p) => sum + (p.rewardsEarned || 0), 0),
      pendingRewards: players.reduce((sum, p) => sum + Math.max(0, (p.rewardsEarned || 0) - (p.rewardsClaimed || 0)), 0),
      topStreak: players.reduce((max, p) => Math.max(max, p.streak || 0), 0),
    },
  });
});

router.get('/players', (_req, res) => {
  const players = db.readAll();
  res.json({
    success: true,
    data: Object.values(players).map(vote.serializePlayer),
    total: Object.keys(players).length,
  });
});

router.post('/reset-player', (req, res) => {
  const { username } = req.body || {};
  if (!username) return res.status(400).json({ success: false, error: 'username is required.' });

  const players = db.readAll();
  if (!players[username]) return res.status(404).json({ success: false, error: 'Player not found.' });

  players[username] = { ...db.createPlayer(username), createdAt: players[username].createdAt };
  db.writeAll(players);
  auditLog.logAction(req, 'RESET_PLAYER', username);
  res.json({ success: true, message: `${username} reset.` });
});

router.post('/reset-streak', (req, res) => {
  const { username } = req.body || {};
  if (!username) return res.status(400).json({ success: false, error: 'username is required.' });

  const players = db.readAll();
  if (!players[username]) return res.status(404).json({ success: false, error: 'Player not found.' });

  players[username].streak = 0;
  players[username].lastVoteTimestamp = null;
  db.writeAll(players);
  auditLog.logAction(req, 'RESET_STREAK', username);
  res.json({ success: true, message: `${username} streak reset.` });
});

// Lets an admin manually credit a test vote without hitting the public rate-limited endpoint.
router.post('/simulate-vote', (req, res) => {
  const { username, siteId = 'planetmc' } = req.body || {};
  if (!username) return res.status(400).json({ success: false, error: 'username is required.' });

  const players = db.readAll();
  if (!players[username]) players[username] = db.createPlayer(username);
  const player = vote.resetDailyIfNeeded(players[username]);

  player.votedSitesToday = (player.votedSitesToday || []).filter((s) => s !== siteId);
  player.streak = vote.calcStreak(player);
  player.lifetimeVotes += 1;
  player.todayVotes += 1;
  player.weeklyVotes += 1;
  player.lastVoteTimestamp = new Date().toISOString();
  player.lastVoteDate = new Date().toISOString().split('T')[0];
  player.votedSitesToday.push(siteId);

  players[username] = player;
  db.writeAll(players);
  auditLog.logAction(req, 'SIMULATE_VOTE', username);
  res.json({ success: true, message: `Simulated vote for ${username}.`, data: vote.serializePlayer(player) });
});

router.post('/update-announcement', (req, res) => {
  const { text, enabled, type } = req.body || {};
  if (text !== undefined && (typeof text !== 'string' || text.length > 300)) {
    return res.status(400).json({ success: false, error: 'text must be a string under 300 characters.' });
  }

  try {
    const updated = config.writePartial((cfg) => {
      cfg.announcement = {
        enabled: enabled !== undefined ? Boolean(enabled) : cfg.announcement?.enabled,
        text: text ?? cfg.announcement?.text,
        type: type ?? cfg.announcement?.type ?? 'info',
      };
    });
    auditLog.logAction(req, 'UPDATE_ANNOUNCEMENT', null);
    res.json({ success: true, announcement: updated.announcement });
  } catch (err) {
    console.error(`Failed to update announcement: ${err.message}`);
    res.status(500).json({ success: false, error: 'Could not update config.' });
  }
});

router.post('/update-messages', (req, res) => {
  const { messages } = req.body || {};
  if (!Array.isArray(messages)) {
    return res.status(400).json({ success: false, error: 'messages must be an array.' });
  }

  try {
    const updated = config.writePartial((cfg) => {
      cfg.flavorMessages = messages.filter((m) => typeof m === 'string' && m.trim());
    });
    auditLog.logAction(req, 'UPDATE_MESSAGES', null);
    res.json({ success: true, messages: updated.flavorMessages });
  } catch (err) {
    console.error(`Failed to update messages: ${err.message}`);
    res.status(500).json({ success: false, error: 'Could not update config.' });
  }
});

module.exports = router;