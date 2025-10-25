// Если тебе нужен ML-клиент — верни импорт.
// const { postForecast } = require('../services/mlClient');

const DEFAULT_LIMITS = {
    '1h': 2000,
    '4h': 3000,
    '1d': 4000,
};

class SeriesController {
    constructor(deps) {
        this.candleRepo = deps.candleRepo;
        this.indicatorsService = deps.indicatorsService;
        this.forecastRepo = deps.forecastRepo;
    }

    async getSeries(req, res) {
        const symbol = String(req.query.symbol || 'BTCUSDT').toUpperCase();
        const tf = String(req.query.tf || '1h');
        const full = !!req.query.full;
        const ind = String(req.query.ind || '').trim(); // строка вида "EMA:720,SMA:360,SMA:180,..."

        try {
            // 1) История
            if (full) await this.candleRepo.ensureHistory(symbol, tf);
            else await this.candleRepo.refreshRecent(symbol, tf);

            const limit = DEFAULT_LIMITS[tf] ?? 2000;
            const raw = await this.candleRepo.getRecent(symbol, tf, limit);
            const candles = Array.isArray(raw) ? raw : [];
            if (candles.length < 2) {
                console.warn(`[series] candles too short: ${symbol} ${tf} len=${candles.length}`);
            }

            // 2) Индикаторы (НА БЭКЕ) по ind-строке.
            // Поддерживаю оба варианта сервиса: calcMulti и calc.
            let indicators = {};
            if (ind) {
                try {
                    if (typeof this.indicatorsService.calcMulti === 'function') {
                        indicators = await this.indicatorsService.calcMulti(candles, ind);
                    } else if (typeof this.indicatorsService.calc === 'function') {
                        indicators = await this.indicatorsService.calc(candles, ind);
                    } else {
                        console.warn('[series] indicatorsService has no calc/calcMulti');
                        indicators = {};
                    }
                } catch (e) {
                    console.warn('[series] indicators calc failed:', e?.message || e);
                    indicators = {};
                }
            }

            // 3) Прогноз: просто отдаём то, что есть в БД, без падений
            let forecastLine = null;
            let confidenceBand = null;
            try {
                const latest = await this.forecastRepo.getLatest(symbol, tf);
                const saved = latest?.payload || latest || null;
                const savedLine =
                    Array.isArray(saved?.forecast_line) ? saved.forecast_line
                        : Array.isArray(saved?.points) ? saved.points
                            : Array.isArray(saved?.data) ? saved.data
                                : null;

                if (savedLine?.length) {
                    forecastLine = savedLine;
                    confidenceBand = Array.isArray(saved?.confidence) ? saved.confidence : null;
                    console.log(`[series] forecast DB: ${symbol} ${tf} points=${forecastLine.length}`);
                } else {
                    console.log('[series] forecast empty for', symbol, tf);
                }
            } catch (e) {
                console.warn('[series] forecast error:', e?.message || e);
            }

            res.json({
                ok: true,
                meta: { symbol, timeframe: tf },
                candles,
                indicators,          // фронт их рисует
                forecast: forecastLine || null,
                band: confidenceBand || null,
            });
        } catch (err) {
            console.error('❌ [series] getSeries failed:', err);
            const code = err.status || err.statusCode || 500;
            res.status(code).json({ ok: false, error: String(err.message || err) });
        }
    }

    async refresh(req, res) {
        try {
            const symbol = String(req.body?.symbol || '').toUpperCase();
            const tf = String(req.body?.tf || '1h');
            if (!symbol) return res.status(400).json({ ok: false, error: 'symbol required' });

            const added = await this.candleRepo.refreshRecent(symbol, tf);
            res.json({ ok: true, added });
        } catch (err) {
            console.error('❌ [series] refresh failed:', err);
            res.status(500).json({ ok: false, error: 'refresh failed' });
        }
    }
}

module.exports = SeriesController;
