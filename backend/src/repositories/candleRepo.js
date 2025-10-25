// src/repos/candleRepo.js — если ты всё же пользуешься репозиторием
const Candle = require('../models/Candle');
const axios = require('axios');

const BINANCE = process.env.URL_BINANCE || 'https://api.binance.com/api/v3/klines?';
// лимит Binance за вызов
const BATCH = 1000;

// TF → интервал в мс
const TF_MS = {
    '1m': 60e3, '3m': 180e3, '5m': 300e3, '15m': 900e3, '30m': 1800e3,
    '1h': 3600e3, '2h': 7200e3, '4h': 14400e3, '6h': 21600e3, '8h': 28800e3, '12h': 43200e3,
    '1d': 86400e3,
};

async function fetchKlines(symbol, interval, { startTime, endTime, limit = BATCH } = {}) {
    const p = new URLSearchParams();
    p.set('symbol', symbol);
    p.set('interval', interval);
    p.set('limit', String(limit));
    if (startTime != null) p.set('startTime', String(startTime));
    if (endTime != null) p.set('endTime', String(endTime));
    const url = BINANCE + p.toString();
    const { data } = await axios.get(url, { timeout: 15000 });
    // формат массива Binance: [openTime, open, high, low, close, volume, closeTime, ...]
    return data.map(row => ({
        symbol,
        timeframe: interval,
        time: Number(row[0]),
        open: Number(row[1]),
        high: Number(row[2]),
        low: Number(row[3]),
        close: Number(row[4]),
        volume: Number(row[5]),
    })).filter(c => Number.isFinite(c.time) && Number.isFinite(c.open) && Number.isFinite(c.close));
}

module.exports = {
    // отдать последние N (или весь ряд если limit=null)
    async getRecent(symbol, timeframe, limit = 1000) {
        const opts = {
            where: { symbol, timeframe },
            order: [['time', 'ASC']],
        };
        if (Number.isFinite(limit) && limit > 0) opts.limit = limit;
        const rows = await Candle.findAll(opts);
        return rows.map(r => ({
            id: r.id,
            symbol: r.symbol,
            timeframe: r.timeframe,
            time: Number(r.time),
            open: Number(r.open),
            high: Number(r.high),
            low: Number(r.low),
            close: Number(r.close),
            volume: Number(r.volume),
        }));
    },

    // быстро подтащить последние ~BATCH свечей с Binance
    async refreshRecent(symbol, timeframe) {
        const ms = TF_MS[timeframe] || 3600e3;
        const last = await Candle.findOne({
            where: { symbol, timeframe },
            order: [['time', 'DESC']],
            attributes: ['time'],
        });
        const since = last ? Number(last.time) + ms : Date.now() - ms * BATCH;
        const kl = await fetchKlines(symbol, timeframe, { startTime: since, limit: BATCH });
        if (!kl.length) return 0;
        await Candle.bulkCreate(kl, { ignoreDuplicates: true });
        return kl.length;
    },

    // дотянуть всю историю назад батчами, пока Binance отдаёт
    async ensureHistory(symbol, timeframe) {
        const ms = TF_MS[timeframe] || 3600e3;
        // какая у нас самая ранняя свеча в БД
        const first = await Candle.findOne({
            where: { symbol, timeframe },
            order: [['time', 'ASC']],
            attributes: ['time'],
        });

        let endTime = first ? Number(first.time) - 1 : Date.now();
        let total = 0;

        // ограничитель, чтобы не улететь в бесконечный цикл
        for (let i = 0; i < 10000; i++) {
            const batch = await fetchKlines(symbol, timeframe, {
                endTime,
                limit: BATCH,
            });
            if (!batch.length) break;
            await Candle.bulkCreate(batch, { ignoreDuplicates: true });
            total += batch.length;
            // следующий шаг — ещё раньше
            endTime = batch[0].time - 1;

            // щадим лимиты Binance
            await new Promise(r => setTimeout(r, 350));
            // если уже достигли «давно-давно» — выходим
            if (batch.length < BATCH) break;
        }
        return total;
    },
};
