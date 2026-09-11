const config = require('./config');

function getPlayerLevel(votes) {
  const levels = config.get().levels || [];
  let result = levels[0] || { min: 0, level: 1, title: 'Newcomer', icon: '🌱' };
  for (const level of levels) {
    if (votes >= level.min) result = level;
  }
  return result;
}

function getISOWeek(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}


// Rolls over daily/weekly vote counters if the player last voted on a previous day/week. 

function resetDailyIfNeeded(player) {
  const todayStr = new Date().toISOString().split('T')[0];
  const weekStr = getISOWeek(new Date());

  if (player.lastVoteDate !== todayStr) {
    player.todayVotes = 0;
    player.votedSitesToday = [];
    player.lastVoteDate = todayStr;
  }
  if (player.lastVoteWeek && player.lastVoteWeek !== weekStr) {
    player.weeklyVotes = 0;
  }
  player.lastVoteWeek = weekStr;
  return player;
}


// Streak breaks if more than 48h have passed.
function calcStreak(player) {
  if (!player.lastVoteTimestamp) return 1;

  const hoursSinceLastVote = (Date.now() - new Date(player.lastVoteTimestamp)) / 3_600_000;
  if (hoursSinceLastVote > 48) return 1;

  const sameDay = new Date(player.lastVoteTimestamp).toDateString() === new Date().toDateString();
  return sameDay ? player.streak || 1 : (player.streak || 0) + 1;
}

function voteInterval() {
  return config.get().rewards?.voteInterval || 10;
}

function calcRewardProgress(votes) {
  const interval = voteInterval();
  return Math.round(((votes % interval) / interval) * 100);
}

function didEarnVoteReward(votes) {
  return votes > 0 && votes % voteInterval() === 0;
}

function getStreakReward(streak) {
  return (config.get().rewards?.streakRewards || []).find((r) => r.streak === streak) || null;
}

function canVoteOnSite(player, siteId) {
  return !(player.votedSitesToday || []).includes(siteId);
}

function getValidSiteIds() {
  return (config.get().voteSites || []).map((s) => s.id);
}


function computeAchievements(player) {
  const siteCount = (config.get().voteSites || []).length;
  const sitesVotedToday = (player.votedSitesToday || []).length;

  return (config.get().achievements || []).map((a) => {
    let unlocked = false;
    if (a.condition?.startsWith('votes>=')) {
      unlocked = player.lifetimeVotes >= parseInt(a.condition.split('>=')[1], 10);
    } else if (a.condition?.startsWith('streak>=')) {
      unlocked = player.streak >= parseInt(a.condition.split('>=')[1], 10);
    } else if (a.condition === 'allSites') {
      unlocked = sitesVotedToday >= siteCount;
    }
    return { id: a.id, name: a.name, description: a.description, icon: a.icon, rarity: a.rarity, unlocked };
  });
}

function getUpcomingRewards(votes) {
  const interval = voteInterval();
  const nextMilestone = Math.ceil((votes + 1) / interval) * interval;
  const configured = (config.get().rewards?.milestones || []).filter((m) => m.votes > votes).slice(0, 4);

  const generated = [
    { votes: nextMilestone, name: 'Vote Key', icon: 'key', rarity: 'Common' },
    { votes: nextMilestone + interval, name: 'Vote Bundle', icon: 'coin', rarity: 'Common' },
    { votes: nextMilestone + interval * 2, name: 'XP Booster', icon: 'bolt', rarity: 'Uncommon' },
    { votes: nextMilestone + interval * 3, name: 'Crate', icon: 'gift', rarity: 'Uncommon' },
  ];

  return [...configured, ...generated]
    .slice(0, 4)
    .map((m) => ({ name: m.name, icon: m.icon, at: m.votes, rarity: m.rarity }));
}

function serializePlayer(player) {
  const level = getPlayerLevel(player.lifetimeVotes);
  const pendingRewards = Math.max(0, (player.rewardsEarned || 0) - (player.rewardsClaimed || 0));

  return {
    username: player.username,
    lifetimeVotes: player.lifetimeVotes,
    weeklyVotes: player.weeklyVotes,
    todayVotes: player.todayVotes,
    streak: player.streak,
    level: level.level,
    reputation: level.title,
    reputationIcon: level.icon,
    rewardProgress: calcRewardProgress(player.lifetimeVotes),
    pendingRewards,
    rewardsEarned: player.rewardsEarned,
    rewardsClaimed: player.rewardsClaimed,
    achievements: computeAchievements(player),
    votedSitesToday: player.votedSitesToday || [],
    upcomingRewards: getUpcomingRewards(player.lifetimeVotes),
    lastVoteTimestamp: player.lastVoteTimestamp,
  };
}

function getServerVoteStats(players) {
  const today = new Date().toISOString().split('T')[0];
  let statsToday = 0;
  let statsWeekly = 0;

  for (const p of players) {
    if (p.lastVoteDate === today) statsToday += p.todayVotes || 0;
    statsWeekly += p.weeklyVotes || 0;
  }

  const topToday = players
    .filter((p) => p.lastVoteDate === today)
    .sort((a, b) => (b.todayVotes || 0) - (a.todayVotes || 0))[0];

  return { statsToday, statsWeekly, topSupporterToday: topToday?.username || 'Be the first!' };
}

function isValidUsername(username) {
  return typeof username === 'string' && /^[a-zA-Z0-9_]{2,24}$/.test(username);
}

module.exports = {
  getPlayerLevel,
  resetDailyIfNeeded,
  calcStreak,
  calcRewardProgress,
  didEarnVoteReward,
  getStreakReward,
  canVoteOnSite,
  getValidSiteIds,
  computeAchievements,
  getUpcomingRewards,
  serializePlayer,
  getServerVoteStats,
  isValidUsername,
};
