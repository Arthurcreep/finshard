// Лёгкий клиент к твоему Flask (app.py). По умолчанию http://localhost:5001
// Возвращает { forecast_line: [...], confidence: [...] } либо кидает ошибку.

const fetch = (...a) => import('node-fetch').then(({ default: f }) => f(...a));

const ML_URL = process.env.ML_URL || 'http://127.0.0.1:5001';

async function postForecast({ symbol, tf, method = 'blend', candles, exog = null, horizon = null }) {
    const url = `${ML_URL}/forecast`;
    const body = {
        symbol, tf, method, candles,
    };
    if (exog) body.exog = exog;
    if (horizon != null) body.horizon = horizon;

    const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        timeout: 60_000,
    });

    let data = null;
    try {
        data = await res.json();
    } catch {
        // пусто
    }

    if (!res.ok) {
        const msg = data?.error || `${res.status} ${res.statusText}`;
        const err = new Error(`ML forecast failed: ${msg}`);
        err.status = res.status;
        throw err;
    }
    // ожидаем формат из app.py: { forecast_line: [...], confidence: [...] }
    return {
        forecast_line: Array.isArray(data?.forecast_line) ? data.forecast_line : [],
        confidence: Array.isArray(data?.confidence) ? data.confidence : [],
        meta: { method: data?.method, tf: data?.tf, symbol: data?.symbol },
    };
}

module.exports = { postForecast };


