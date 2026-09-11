const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'config', 'players.json');

function readAll() {
  try {
    return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
  } catch {
    return {};
  }
}

function writeAll(players) {
  fs.writeFileSync(DB_PATH, JSON.stringify(players, null, 2), 'utf8');
}

function createPlayer(username) {
  return {
    username,
    lifetimeVotes: 0,
    weeklyVotes: 0,
    todayVotes: 0,
    streak: 0,
    lastVoteTimestamp: null,
    lastVoteDate: null,
    lastVoteWeek: null,
    rewardsEarned: 0,
    rewardsClaimed: 0,
    votedSitesToday: [],
    createdAt: new Date().toISOString(),
  };
}

module.exports = { readAll, writeAll, createPlayer };
