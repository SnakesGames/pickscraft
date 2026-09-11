const crypto = require('crypto');
const config = require('../config');
const { recordSecurityEvent } = require('./rateLimit');

function timingSafeEqual(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function adminAuth(req, res, next) {
  const provided = req.headers['x-admin-password'] || req.body?.adminPassword || '';
  const expected = config.get().backend?.adminPassword || '';

  if (!provided || !timingSafeEqual(provided, expected)) {
    recordSecurityEvent(req.ip, req.originalUrl, 'admin_auth_failed');
    return res.status(401).json({ success: false, error: 'Unauthorized.' });
  }
  next();
}

module.exports = adminAuth;
