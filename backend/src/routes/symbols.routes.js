const { Router } = require('express');
const asyncHandler = require('../utils/asyncHandler');
const { validateSymbol } = require('../services/binanceClient');

module.exports = () => {
    const r = Router();
    // GET /api/symbols/validate?symbol=1INCHUSDT
    r.get('/validate', asyncHandler(async (req, res) => {
        const symbol = String(req.query.symbol || '').toUpperCase();
        if (!symbol) return res.status(400).json({ ok: false, error: 'symbol required' });
        const ok = await validateSymbol(symbol);
        res.json({ ok: ok.ok, reason: ok.reason });
    }));
    return r;
};
