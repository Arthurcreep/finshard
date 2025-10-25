// src/cron/tickCron.js
const cron = require('node-cron');
const { loadCandles, getLastCandle } = require('../services/candleService');

async function maybeUpdate(symbol, tf) {
    try {
        const last = await getLastCandle(symbol, tf);
        console.log(`[cron] ${tf} last:`, last?.time || 'none');
        const inserted = await loadCandles(symbol, tf, 300);
        console.log(`[cron] ${tf} inserted:`, inserted.length);
    } catch (e) {
        console.error(`[cron] ${tf} update failed:`, e.message);
    }
}

function startSmartTick(symbol = 'BTCUSDT', everyMinutes = 5, tz = 'America/Phoenix') {
    const spec = `*/${everyMinutes} * * * *`;
    console.log(`Smart tick scheduled: ${spec} (${tz})`);
    cron.schedule(spec, () => {
        ['1h', '4h', '1d'].map(tf => maybeUpdate(symbol, tf));
    }, { timezone: tz });
}

module.exports = { startSmartTick };

