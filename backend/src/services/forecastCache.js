// src/services/forecastCache.js
const cache = new Map(); // key -> { ts, data }
const TTL_MS = 10 * 60 * 1000;
function get(key) { const v = cache.get(key); if (!v) return null; if (Date.now() - v.ts > TTL_MS) { cache.delete(key); return null; } return v.data; }
function set(key, data) { cache.set(key, { ts: Date.now(), data }); }
module.exports = { get, set };
