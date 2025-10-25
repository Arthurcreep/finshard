// src/services/candleService.js
// Простая реализация через публичное API Binance, но теперь умеем тянуть ВСЮ историю
// по 1000 свечей за запрос (пагинация endTime ← назад).
//
// Документация Binance (klines): https://binance-docs.github.io/apidocs/spot/en/#kline-candlestick-data

const axios = require('axios');

function tfToBinance(interval) {
    const map = { '1h': '1h', '4h': '4h', '1d': '1d' };
    return map[interval] || '1h';
}

// Базовый одноразовый вызов (до 1000 баров)
async function fetchKlinesOnce(symbol, tf, { limit = 1000, endTime, startTime } = {}) {
    const params = {
        symbol,
        interval: tfToBinance(tf),
        limit: Math.min(Math.max(+limit || 1, 1), 1000),
    };
    if (endTime) params.endTime = +endTime;     // ms
    if (startTime) params.startTime = +startTime; // ms (обычно не нужен, мы листаем назад endTime'ом)

    const r = await axios.get('https://api.binance.com/api/v3/klines', { params });
    // Формат Binance: [ openTime, open, high, low, close, volume, closeTime, ... ]
    return r.data.map(k => ({
        time: Number(k[0]), // ms
        open: Number(k[1]),
        high: Number(k[2]),
        low: Number(k[3]),
        close: Number(k[4]),
        volume: Number(k[5]),
    }));
}

// Пагинированная загрузка «вся история» (идём назад по времени)
async function fetchAllKlines(symbol, tf, { untilMs = Date.now(), maxBars = Infinity } = {}) {
    const out = [];
    let end = +untilMs;
    while (out.length < maxBars) {
        const need = Math.min(1000, maxBars - out.length);
        const batch = await fetchKlinesOnce(symbol, tf, { limit: need, endTime: end });
        if (!batch.length) break;

        // Binance возвращает по возрастанию времени, но когда мы листаем назад endTime, нам удобно добавлять в голову
        // Однако для простоты просто пушим и потом обновляем end
        out.push(...batch);

        // Если получили меньше 1000 — дальше истории нет
        if (batch.length < 1000) break;

        // Следующая страница — всё, что строго раньше первой свечи в текущем батче
        const first = batch[0];
        end = first.time - 1;
    }

    // На выходе гарантируем возрастание
    out.sort((a, b) => a.time - b.time);
    return out;
}

// ---- Публичный интерфейс ----

// Если limitOrNull > 0 — вернём последние N баров (и только их).
// Если limitOrNull <= 0 или null/undefined — тянем всю доступную историю.
async function getCandles(symbol, tf, limitOrNull = 1000) {
    const lim = Number.isFinite(+limitOrNull) ? +limitOrNull : 1000;

    if (lim > 0) {
        // Чтобы получить последние lim баров, тянем назад до тех пор, пока не наберём
        const all = await fetchAllKlines(symbol, tf, { maxBars: lim });
        // fetchAllKlines уже вернёт по возрастанию. Если по каким-то причинам вытащили меньше — отдаём что есть.
        return all.slice(-lim).map(c => ({ ...c }));
    }

    // lim <= 0 → вся история
    const all = await fetchAllKlines(symbol, tf, { maxBars: Infinity });
    return all.map(c => ({ ...c }));
}

// Сохранённый алиас
const getRecent = getCandles;

// В этой упрощённой версии кэша/БД нет — no-op
async function refreshRecent(_symbol, _tf) { return 0; }
async function ensureHistory(_symbol, _tf) { return true; }

// Последняя свеча
async function getLastCandle(symbol, tf) {
    const rows = await fetchKlinesOnce(symbol, tf, { limit: 1 });
    const c = rows[rows.length - 1];
    if (!c) return null;
    return { ...c };
}

module.exports = {
    getCandles,
    getRecent,
    refreshRecent,
    ensureHistory,
    getLastCandle,
    // совместимость
    loadCandles: getCandles,
};

