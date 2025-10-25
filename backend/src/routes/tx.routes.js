// backend/src/routes/tx.routes.js — real list route
const express = require('express');
const router = express.Router();
const { fetchTx } = require('../services/tx.service');

router.get('/list', async (req, res) => {
    try {
        const address = String(req.query.address || '').trim();
        const chainId = Number(req.query.chainId || 1);
        const page = Number(req.query.page || 1);
        const offset = Math.min(100, Number(req.query.offset || 50));
        const sort = (req.query.sort === 'asc' ? 'asc' : 'desc');

        if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
            return res.status(400).json({ error: 'bad_address' });
        }

        const data = await fetchTx(address, chainId, { page, offset, sort });
        // Гарантируем shape даже при пустых данных
        res.json({ items: data.items || [], meta: data.meta || { address, chainId, page, offset, sort } });
    } catch (e) {
        console.error('[tx.list]', e);
        const msg = String(e && e.message || e);
        if (/rate|limit/i.test(msg)) {
            return res.status(429).json({ error: 'rate_limited', message: msg });
        }
        res.status(500).json({ error: 'tx_fetch_failed', message: msg });
    }
});

module.exports = router;
