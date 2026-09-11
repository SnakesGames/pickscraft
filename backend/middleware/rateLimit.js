// Minimal window rate limiter keyed by IP.

const MAX_LOG_ENTRIES = 200;
const securityLog = [];

function recordSecurityEvent(ip, path, reason) {
  securityLog.push({ ip, path, reason, at: new Date().toISOString() });
  if (securityLog.length > MAX_LOG_ENTRIES) securityLog.shift();
}

function getSecurityLog() {
  return [...securityLog].reverse();
}

function rateLimit({ windowMs, max }) {
  const hits = new Map();

  setInterval(() => {
    const cutoff = Date.now() - windowMs;
    for (const [key, timestamps] of hits) {
      const recent = timestamps.filter((t) => t > cutoff);
      if (recent.length === 0) hits.delete(key);
      else hits.set(key, recent);
    }
  }, windowMs).unref();

  return (req, res, next) => {
    const key = req.ip;
    const now = Date.now();
    const timestamps = (hits.get(key) || []).filter((t) => t > now - windowMs);

    if (timestamps.length >= max) {
      recordSecurityEvent(req.ip, req.originalUrl, 'rate_limit_exceeded');
      return res.status(429).json({ success: false, error: 'Too many requests. Try again shortly.' });
    }

    timestamps.push(now);
    hits.set(key, timestamps);
    next();
  };
}

module.exports = rateLimit;
module.exports.recordSecurityEvent = recordSecurityEvent;
module.exports.getSecurityLog = getSecurityLog;
