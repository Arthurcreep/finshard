// src/controllers/ForecastController.js
class ForecastController {
    constructor(deps) {
        this.deps = deps;
        this.forecastService = deps.forecastService;
    }

    // POST /api/forecast/generate
    async generate(req, res) {
        const { symbol = 'BTCUSDT', tf = '1h', method = 'blend', exog = null } = req.body || {};
        const out = await this.forecastService.generate({ symbol, tf, method, exog }, this.deps);
        res.json({ ok: true, ...out });
    }

    // GET /api/forecast/latest?symbol=BTCUSDT&tf=1h&method=blend
    async latest(req, res) {
        try {
            const symbol = (req.query.symbol || 'BTCUSDT').toUpperCase();
            const tf = String(req.query.tf || '1h');
            const method = String(req.query.method || 'blend').toLowerCase();
            const data = await this.forecastService.latest({ symbol, tf, method }, this.deps);
            res.json({ ok: true, data });
        } catch (e) {
            console.error('[Forecast.latest] error:', e);
            const code = e.status || e.statusCode || 500;
            res.status(code).json({ ok: false, error: String(e.message || e) });
        }
    }

    async backtest(_req, res) { res.status(501).json({ ok: false, error: 'Not implemented' }); }
    async metrics(_req, res) { res.status(501).json({ ok: false, error: 'Not implemented' }); }
}

module.exports = ForecastController;







