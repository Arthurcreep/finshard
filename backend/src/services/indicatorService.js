// src/services/indicatorsService.js

function parseSpecMulti(str) {
    // "SMA:360,SMA:180,EMA:720,RSI:14" -> { SMA:[360,180], EMA:[720], RSI:[14] }
    const out = { SMA: [], EMA: [], RSI: [] };
    if (!str) return out;
    String(str)
        .split(',')
        .map(s => s.trim())
        .filter(Boolean)
        .forEach(tok => {
            const [name, p] = tok.split(':');
            const type = String(name || '').toUpperCase();
            const period = Math.max(1, Number(p) || 1);
            if (out[type] && !out[type].includes(period)) out[type].push(period);
        });
    return out;
}

function sma(values, period) {
    const p = Math.max(1, period | 0);
    const out = new Array(values.length).fill(null);
    let sum = 0;
    for (let i = 0; i < values.length; i++) {
        const v = Number(values[i]);
        if (!Number.isFinite(v)) continue;
        sum += v;
        if (i >= p) sum -= Number(values[i - p]);
        if (i >= p - 1) out[i] = sum / p;
    }
    return out;
}

function ema(values, period) {
    const p = Math.max(1, period | 0);
    const out = new Array(values.length).fill(null);
    const k = 2 / (p + 1);
    let prev = null;
    for (let i = 0; i < values.length; i++) {
        const v = Number(values[i]);
        if (!Number.isFinite(v)) continue;
        prev = prev == null ? v : v * k + prev * (1 - k);
        out[i] = prev;
    }
    // первая «полка» не информативна
    for (let i = 0; i < p - 1 && i < out.length; i++) out[i] = null;
    return out;
}

function rsi(values, period = 14) {
    const p = Math.max(1, period | 0);
    const out = new Array(values.length).fill(null);
    let gains = 0, losses = 0;
    for (let i = 1; i <= p && i < values.length; i++) {
        const ch = Number(values[i]) - Number(values[i - 1]);
        gains += ch > 0 ? ch : 0;
        losses += ch < 0 ? -ch : 0;
    }
    let avgGain = gains / p;
    let avgLoss = losses / p;
    if (values.length > p) {
        out[p] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
    }
    for (let i = p + 1; i < values.length; i++) {
        const ch = Number(values[i]) - Number(values[i - 1]);
        const gain = ch > 0 ? ch : 0;
        const loss = ch < 0 ? -ch : 0;
        avgGain = (avgGain * (p - 1) + gain) / p;
        avgLoss = (avgLoss * (p - 1) + loss) / p;
        out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
    }
    return out;
}

/**
 * candles: [{ time(ms|s), open, high, low, close }]
 * specStr: "SMA:360,SMA:180,EMA:720,RSI:14"
 * returns: { "SMA:360":[{time,value}], "SMA:180":[...], "EMA:720":[...], "RSI:14":[...] }
 */
async function calcMulti(candles, specStr) {
    const spec = parseSpecMulti(specStr);
    const times = candles.map(c => Number(c.time));
    const closes = candles.map(c => Number(c.close));

    const out = {};

    // SMA
    for (const p of spec.SMA) {
        const arr = sma(closes, p)
            .map((v, i) => (v == null ? null : { time: times[i], value: v }))
            .filter(Boolean);
        out[`SMA:${p}`] = arr;
    }

    // EMA
    for (const p of spec.EMA) {
        const arr = ema(closes, p)
            .map((v, i) => (v == null ? null : { time: times[i], value: v }))
            .filter(Boolean);
        out[`EMA:${p}`] = arr;
    }

    // RSI
    for (const p of spec.RSI) {
        const arr = rsi(closes, p)
            .map((v, i) => (v == null ? null : { time: times[i], value: v }))
            .filter(Boolean);
        out[`RSI:${p}`] = arr;
    }

    return out;
}

module.exports = {
    calcMulti,
};

