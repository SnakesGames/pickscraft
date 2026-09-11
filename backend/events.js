const { EventEmitter } = require('events');

// Single process wide event hub.
class RealmCraftEvents extends EventEmitter {}
const hub = new RealmCraftEvents();

// A listener throwing should never take down a vote/post/application
hub.on('error', (err) => {
  console.error('[events] listener error:', err.message);
});

// Listeners run synchronously.
function safeEmit(event, payload) {
  try {
    hub.emit(event, payload);
  } catch (err) {
    console.error(`[events] "${event}" listener threw:`, err.message);
  }
}

module.exports = hub;
module.exports.safeEmit = safeEmit;
