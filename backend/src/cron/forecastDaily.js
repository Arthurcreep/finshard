// src/cron/forecastDaily.js
const cron = require('node-cron');
module.exports.startForecastDaily = (svc, tz = 'America/Phoenix') => {
    // каждый день в 06:00
    const task = cron.schedule('0 6 * * *', async () => {
        try {
            const SYMBOL = 'BTCUSDT';
            // 1h → 24h, 4h → 72h (18 баров), 1d → 7d
            await svc.generate({ symbol: SYMBOL, tf: '1h', method: 'blend' });
            await svc.generate({ symbol: SYMBOL, tf: '4h', method: 'blend' });
            await svc.generate({ symbol: SYMBOL, tf: '1d', method: 'blend' });
            console.log('[cron] daily forecast ok');
        } catch (e) {
            console.error('[cron] daily forecast failed', e);
        }
    }, { timezone: tz });
    return task;
};

