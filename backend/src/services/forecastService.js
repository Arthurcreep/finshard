// src/services/forecastService.js
const axios = require('axios');

const TF_TO_HORIZON = { '1h': 24, '4h': 18, '1d': 7 };

async function callML({ symbol, tf, method, candles, exog, horizon }) {
    const url = process.env.ML_URL || 'http://localhost:5001/forecast';
    const r = await axios.post(url, { symbol, tf, method, candles, exog, horizon }, { timeout: 60000 });
    return r.data;
}

module.exports = {
    async generate({ symbol, tf, method = 'blend', exog = null }, deps) {
        const horizon = TF_TO_HORIZON[tf] || 24;

        const candles = await deps.candleRepo.getCandles(symbol, tf, 1000);
        if (!Array.isArray(candles) || candles.length < 50) {
            const err = new Error('Not enough candles (>=50) for forecast');
            err.status = 422;
            throw err;
        }

        let resp;
        try {
            resp = await callML({ symbol, tf, method, candles, exog, horizon });
        } catch (e) {
            const status = e.response?.status || 500;
            const msg = e.response?.data?.error || e.message;
            console.error('[forecastService] ML error:', status, msg);
            const err = new Error(`ML /forecast failed: ${msg}`);
            err.status = status === 500 ? 502 : status;
            throw err;
        }

        const line = Array.isArray(resp?.forecast_line) ? resp.forecast_line : [];
        const saved = await deps.forecastRepo.save({
            symbol,
            timeframe: tf,
            method: (resp?.method || method || 'blend').toLowerCase(),
            points: JSON.stringify(line),
            generated_at: new Date(),
        });

        return {
            id: saved.id,
            method: saved.method,
            count: line.length,
            generated_at: saved.generated_at,
        };
    },

    async latest({ symbol, tf, method = 'blend' }, deps) {
        const row = await deps.forecastRepo.getLatest(symbol, tf, method);
        if (!row) return null;
        let points = [];
        try { points = JSON.parse(row.points || '[]'); } catch { }
        return { symbol: row.symbol, tf: row.timeframe, method: row.method, forecast_line: points, generated_at: row.generated_at || row.createdAt };
    },
};

