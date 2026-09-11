const express = require('express');
const config = require('../config');
const db = require('../db');
const mcStatus = require('../mcStatus');
const vote = require('../voteLogic');
const rateLimit = require('../middleware/rateLimit');
const events = require('../events');

const router = express.Router();
const voteLimiter = rateLimit({ windowMs: 60_000, max: 20 });

router.get('/health', (_req, res) => {
  res.json({ status: 'ok', version: '1.0.0', timestamp: new Date().toISOString() });
});

// Public subset of config.json - excludes adminPassword and webhookSecret.
router.get('/config', (_req, res) => {
  const cfg = config.get();
  res.json({
    success: true,
    data: {
      server: cfg.server,
      theme: cfg.theme,
      gameModes: cfg.gameModes,
      ranks: cfg.ranks || [],
      crates: cfg.crates || [],
      coinBundles: cfg.coinBundles || [],
      voteSites: (cfg.voteSites || []).map((s) => ({ ...s, configured: Boolean(s.url) })),
      votePartyGoal: cfg.votePartyGoal || 200,
      votePartyReward: cfg.votePartyReward || '',
      communityGoals: cfg.communityGoals || [],
      flavorMessages: cfg.flavorMessages || [],
      announcement: cfg.announcement || { enabled: false },
      homepageStats: cfg.homepageStats || {},
    },
  });
});

router.get('/status', async (_req, res) => {
  const status = await mcStatus.fetchStatus().catch(() => mcStatus.fallbackStatus());
  res.json({ success: true, data: status });
});

router.get('/server', (_req, res) => {
  const players = Object.values(db.readAll());
  const stats = vote.getServerVoteStats(players);
  res.json({ success: true, data: { ...stats, serverRank: config.get().server?.rank || 14 } });
});

router.get('/player/:username', (req, res) => {
  const { username } = req.params;
  if (!vote.isValidUsername(username)) {
    return res.status(400).json({ success: false, error: 'Invalid username.' });
  }

  const players = db.readAll();
  let player = players[username];
  let dirty = false;

  if (!player) {
    player = db.createPlayer(username);
    dirty = true;
  }

  const before = JSON.stringify(player);
  player = vote.resetDailyIfNeeded(player);
  if (JSON.stringify(player) !== before) dirty = true;

  if (dirty) {
    players[username] = player;
    db.writeAll(players);
  }

  res.json({ success: true, data: vote.serializePlayer(player) });
});

router.post('/vote', voteLimiter, (req, res) => {
  const { username, siteId } = req.body || {};
  if (!username || !siteId) {
    return res.status(400).json({ success: false, error: 'username and siteId are required.' });
  }
  if (!vote.isValidUsername(username)) {
    return res.status(400).json({ success: false, error: 'Invalid username.' });
  }
  if (!vote.getValidSiteIds().includes(siteId)) {
    return res.status(400).json({ success: false, error: 'Unknown vote site.' });
  }

  const players = db.readAll();
  if (!players[username]) players[username] = db.createPlayer(username);
  let player = vote.resetDailyIfNeeded(players[username]);

  if (!vote.canVoteOnSite(player, siteId)) {
    return res.status(429).json({ success: false, error: 'Already voted on this site today.' });
  }

  const previousStreak = player.streak || 0;
  player.streak = vote.calcStreak(player);
  player.lifetimeVotes += 1;
  player.todayVotes += 1;
  player.weeklyVotes += 1;
  player.lastVoteTimestamp = new Date().toISOString();
  player.lastVoteDate = new Date().toISOString().split('T')[0];
  player.votedSitesToday = [...(player.votedSitesToday || []), siteId];

  const rewards = [];
  if (vote.didEarnVoteReward(player.lifetimeVotes)) {
    const milestone = (config.get().rewards?.milestones || []).find((m) => m.votes === player.lifetimeVotes) || {
      name: 'Vote Key',
      icon: 'key',
      rarity: 'Common',
    };
    player.rewardsEarned = (player.rewardsEarned || 0) + 1;
    rewards.push({ type: 'vote', ...milestone });
  }
  const streakReward = vote.getStreakReward(player.streak);
  if (streakReward) {
    player.rewardsEarned = (player.rewardsEarned || 0) + 1;
    rewards.push({ type: 'streak', ...streakReward });
  }

  players[username] = player;
  db.writeAll(players);

  events.safeEmit('vote', { username, siteId, streak: player.streak, lifetimeVotes: player.lifetimeVotes, rewards, source: 'website' });

  res.json({
    success: true,
    message: `Vote recorded for ${username}!`,
    rewards,
    streakIncreased: player.streak > previousStreak,
    data: vote.serializePlayer(player),
  });
});

router.post('/claim-reward', (req, res) => {
  const { username } = req.body || {};
  if (!username) return res.status(400).json({ success: false, error: 'username is required.' });

  const players = db.readAll();
  const player = players[username];
  if (!player) return res.status(404).json({ success: false, error: 'Player not found.' });

  const pending = (player.rewardsEarned || 0) - (player.rewardsClaimed || 0);
  if (pending <= 0) return res.status(400).json({ success: false, error: 'No pending rewards.' });

  player.rewardsClaimed = (player.rewardsClaimed || 0) + 1;
  players[username] = player;
  db.writeAll(players);

  res.json({
    success: true,
    message: 'Reward claimed! Type /reward in-game.',
    pendingRewards: (player.rewardsEarned || 0) - player.rewardsClaimed,
  });
});

router.get('/leaderboard', (req, res) => {
  const lbConfig = config.get().leaderboard || {};
  const limit = Math.min(parseInt(req.query.limit, 10) || lbConfig.size || 10, 50);
  const badges = lbConfig.badges || ['👑', '💎', '🔥', '🛡️', '⚔️', '🏆', '🌟', '⚙️', '🎯', '🌙'];

  const ranked = Object.values(db.readAll())
    .sort((a, b) => b.lifetimeVotes - a.lifetimeVotes)
    .slice(0, limit)
    .map((p, i) => ({
      rank: i + 1,
      username: p.username,
      votes: p.lifetimeVotes,
      streak: p.streak,
      badge: badges[i] || 'star',
      level: vote.getPlayerLevel(p.lifetimeVotes).level,
    }));

  res.json({ success: true, data: ranked });
});

router.get('/vote-sites', (req, res) => {
  const { username } = req.query;
  const players = db.readAll();
  const player = username && players[username] ? vote.resetDailyIfNeeded(players[username]) : null;

  const sites = (config.get().voteSites || []).map((s) => ({
    ...s,
    cooldown: `${s.cooldownHours || 24} hours`,
    available: player ? vote.canVoteOnSite(player, s.id) : true,
    configured: Boolean(s.url), // false until the server owner adds their real listing link
  }));

  res.json({ success: true, data: sites });
});

// Called by the in-game plugin/webhook (NuVotifier or a Skript script) when a player votes on an external site, so votes cast in-game count the same
// as votes cast through the website.
router.post('/minecraft/vote', voteLimiter, (req, res) => {
  const { player: username, site, reward, timestamp, secret } = req.body || {};
  const expectedSecret = config.get().backend?.webhookSecret;

  if (expectedSecret && secret !== expectedSecret) {
    return res.status(401).json({ success: false, error: 'Invalid webhook secret.' });
  }
  if (!username || !vote.isValidUsername(username.trim())) {
    return res.status(400).json({ success: false, error: 'Invalid player name.' });
  }

  const cleanUsername = username.trim();
  const siteId = site || vote.getValidSiteIds()[0] || 'planetmc';
  const players = db.readAll();
  if (!players[cleanUsername]) players[cleanUsername] = db.createPlayer(cleanUsername);
  const player = vote.resetDailyIfNeeded(players[cleanUsername]);

  if (!vote.canVoteOnSite(player, siteId)) {
    return res.json({ success: false, alreadyVoted: true, message: 'Already voted today.' });
  }

  player.streak = vote.calcStreak(player);
  player.lifetimeVotes += 1;
  player.todayVotes += 1;
  player.weeklyVotes += 1;
  player.lastVoteTimestamp = Number.isNaN(new Date(timestamp).getTime()) ? new Date().toISOString() : timestamp;
  player.lastVoteDate = new Date().toISOString().split('T')[0];
  player.votedSitesToday = [...(player.votedSitesToday || []), siteId];

  const rewards = [];
  if (vote.didEarnVoteReward(player.lifetimeVotes)) {
    player.rewardsEarned = (player.rewardsEarned || 0) + 1;
    rewards.push({ type: 'vote', name: reward || 'Vote Key', icon: 'key', rarity: 'Common' });
  }
  const streakReward = vote.getStreakReward(player.streak);
  if (streakReward) {
    player.rewardsEarned = (player.rewardsEarned || 0) + 1;
    rewards.push({ type: 'streak', ...streakReward });
  }

  players[cleanUsername] = player;
  db.writeAll(players);
  console.log(`[vote] ${cleanUsername} voted via ${siteId} (webhook)`);

  events.safeEmit('vote', { username: cleanUsername, siteId, streak: player.streak, lifetimeVotes: player.lifetimeVotes, rewards, source: 'minecraft' });

  res.json({
    success: true,
    player: cleanUsername,
    siteId,
    lifetimeVotes: player.lifetimeVotes,
    streak: player.streak,
    rewards,
  });
});

module.exports = router;