// Простая in-memory реализация, чтобы ничего не падало.
// Позже заменишь на Sequelize/Postgres.
const store = new Map(); // key = `${symbol}|${tf}|${method}` -> { points, ts }

function keyOf(symbol, tf, method) {
    return `${symbol.toUpperCase()}|${tf}|${(method || 'blend').toLowerCase()}`;
}

module.exports = {
    async getLatest(symbol, tf, method) {
        const rec = store.get(keyOf(symbol, tf, method));
        return rec ? { points: rec.points, ts: rec.ts } : null;
    },
    async save(symbol, tf, method, points) {
        store.set(keyOf(symbol, tf, method), { points: Array.isArray(points) ? points : [], ts: Date.now() });
        return true;
    },
};


