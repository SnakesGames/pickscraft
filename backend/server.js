'use strict';

const express = require('express');
const cors = require('cors');
const path = require('path');

const config = require('./config');
const publicRoutes = require('./routes/public');
const adminRoutes = require('./routes/admin');
const forumRoutes = require('./routes/forum');
const staffRoutes = require('./routes/staff');
const events = require('./events');
const db = require('./db');
const forumDb = require('./forumDb');
const forumSessions = require('./forumSessions');
const voteLogic = require('./voteLogic');
const adminAuth = require('./middleware/adminAuth');
const rateLimit = require('./middleware/rateLimit');
const { loadAddons } = require('./addons/loader');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');

const app = express();
app.set('trust proxy', 1); // needed for req.ip to be correct behind a reverse proxy (Render,Nginx)

app.use(cors());
// verify() stashes the raw bytes on req.rawBody before parsing.
app.use(express.json({ limit: '100kb', verify: (req, _res, buf) => { req.rawBody = buf; } }));
app.use(express.static(PUBLIC_DIR));

app.use('/api/admin', adminRoutes);
app.use('/api/forum', forumRoutes);
app.use('/api/staff', staffRoutes);
app.use('/api', publicRoutes);


// Addons mount their own routes (typically under /api/addons/<name>) and
// subscribe to backend/events.js.
loadAddons(app, { config, db, forumDb, forumSessions, voteLogic, events, adminAuth, rateLimit, PUBLIC_DIR });

// Anything under /api that didn't match a route is a real 404.
app.use('/api', (_req, res) => {
  res.status(404).json({ success: false, error: 'Endpoint not found.' });
});

app.get('*', (_req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

const PORT = process.env.PORT || config.get().backend?.port || 3001;
app.listen(PORT, () => {
  console.log(`RealmCraft server listening on http://localhost:${PORT}`);
  console.log(`Admin panel: http://localhost:${PORT}/admin.html`);
});

module.exports = app;