// Минимальный клиент к публичному REST Binance (без ключей)
// Документация: https://binance-docs.github.io/apidocs/spot/en/#kline-candlestick-data

const fetch = (...args) => import('node-fetch').then(({ default: f }) => f(...args));

const BASE = 'https://api.binance.com';

const TF_MAP = {
    '1m': '1m', '3m': '3m', '5m': '5m', '15m': '15m', '30m': '30m',
    '1h': '1h', '2h': '2h', '4h': '4h', '6h': '6h', '8h': '8h', '12h': '12h',
    '1d': '1d', '3d': '3d', '1w': '1w', '1M': '1M',
};

// маленький sleep, чтобы не нарваться на лимиты
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function getExchangeInfo() {
    const res = await fetch(`${BASE}/api/v3/exchangeInfo`);
    if (!res.ok) throw new Error(`exchangeInfo failed: ${res.status}`);
    return res.json();
}

// Проверка, что символ существует и доступен для трейдинга
async function validateSymbol(symbol) {
    const info = await getExchangeInfo();
    const s = info.symbols.find(s => s.symbol === symbol);
    if (!s) return { ok: false, reason: 'unknown' };
    const tradingEnabled = s.status === 'TRADING';
    const isSpot = (s.permissions || []).includes('SPOT');
    return { ok: tradingEnabled && isSpot, reason: tradingEnabled && isSpot ? 'ok' : 'not_trading' };
}

// Разовая порция Klines
async function getKlines(symbol, interval, startTime, endTime, limit = 1000) {
    const params = new URLSearchParams({ symbol, interval, limit: String(limit) });
    if (startTime != null) params.set('startTime', String(startTime));
    if (endTime != null) params.set('endTime', String(endTime));
    const url = `${BASE}/api/v3/klines?` + params.toString();
    const res = await fetch(url);
    if (!res.ok) throw new Error(`klines failed: ${res.status}`);
    const json = await res.json();
    // Формат свечи Binance:
    // [ openTime, open, high, low, close, volume, closeTime, ... ]
    return json.map(row => ({
        ts: row[0],                 // ms
        open: Number(row[1]),
        high: Number(row[2]),
        low: Number(row[3]),
        close: Number(row[4]),
        volume: Number(row[5]),
        closeTime: row[6],
    }));
}

// Пагинированный сбор всей истории по TF с начала (или с указанной точки)
async function getKlinesAll(symbol, tf, sinceTs = 0) {
    const interval = TF_MAP[tf];
    if (!interval) throw new Error(`Unsupported timeframe: ${tf}`);

    const out = [];
    let start = sinceTs || 0;

    // Binance возвращает до 1000 свечей. Идем курсором: startTime = last.closeTime + 1
    while (true) {
        const batch = await getKlines(symbol, interval, start, undefined, 1000);
        if (batch.length === 0) break;
        out.push(...batch);
        const last = batch[batch.length - 1];
        // следующий запрос начнем с конца последней свечи
        start = last.closeTime + 1;
        // немножко тормозим, чтобы не досадить публичному API
        await sleep(350);
        // хрупкая защита от слишком длинных историй: можно убрать
        if (out.length > 2_000_000) break;
    }
    return out;
}

module.exports = { validateSymbol, getKlinesAll, getKlines, TF_MAP };
