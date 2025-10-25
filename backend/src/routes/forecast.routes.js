const express = require('express')
const router = express.Router()
const axios = require('axios')
const { z } = require('zod')

// URL ML-сервиса: .env ML_URL=http://localhost:5001
const ML_URL = process.env.ML_URL || 'http://localhost:5001'

const Qget = z.object({
    symbol: z.string().trim().min(3).max(20),
    tf: z.enum(['1h', '4h', '1d']),
    method: z.string().optional()
})

const Qgen = z.object({
    symbol: z.string().trim().min(3).max(20),
    tf: z.enum(['1h', '4h', '1d']),
    horizon: z.number().int().positive().max(500),
    method: z.string().optional()
})

// in-memory кэш последнего прогноза
const LATEST = new Map()
const keyOf = (symbol, tf, method) =>
    `${symbol.toUpperCase()}|${tf}|${String(method || 'blend').toLowerCase()}`

// маппинг таймфреймов
const TF_BINANCE = { '1h': '1h', '4h': '4h', '1d': '1d' }

// подгружаем свечи с Binance (как в /api/series)
async function loadCandles(symbol, tf, full = true) {
    const limit = full ? 1000 : 500
    const { data } = await axios.get('https://api.binance.com/api/v3/klines', {
        params: { symbol: symbol.toUpperCase(), interval: TF_BINANCE[tf], limit }
    })
    return data.map(a => ({
        time: Number(a[0]),
        open: Number(a[1]),
        high: Number(a[2]),
        low: Number(a[3]),
        close: Number(a[4]),
        volume: Number(a[5])
    }))
}

// GET /api/forecast/latest
router.get('/latest', (req, res) => {
    const q = Qget.safeParse(req.query)
    if (!q.success) return res.status(400).json({ error: 'bad_query' })
    const k = keyOf(q.data.symbol, q.data.tf, q.data.method)
    const data = LATEST.get(k) || null
    return res.json({ data })
})

// POST /api/forecast/generate
router.post('/generate', express.json(), async (req, res) => {
    const q = Qgen.safeParse(req.body)
    if (!q.success) return res.status(400).json({ error: 'bad_body' })

    const { symbol, tf, horizon, method } = q.data
    const k = keyOf(symbol, tf, method)

    try {
        // 1) свечи
        const candles = await loadCandles(symbol, tf, true)

        // 2) запрос в ML-сервис
        const body = {
            symbol: symbol.toUpperCase(),
            tf,
            method: (method || 'blend').toLowerCase(), // 'prophet' | 'var' | 'blend' | 'stub'
            horizon,
            candles,
            exog: {} // при необходимости сюда добавим внешние ряды
        }

        const { data } = await axios.post(`${ML_URL}/forecast`, body, {
            timeout: 15000
        })

        // ожидаем формат: { forecast_line: [{time, value}], ... }
        const payload = {
            forecast_line: Array.isArray(data?.forecast_line) ? data.forecast_line : []
        }

        // кэш
        LATEST.set(k, payload)
        return res.json({ ok: true, data: payload })
    } catch (e) {
        // не валим 500 — фронт сам догенерит при следующем клике
        const msg = e?.response?.data || e?.message || 'ml_failed'
        console.error('[forecast][generate] fail:', msg)
        return res.status(502).json({ error: 'ml_failed', message: String(msg) })
    }
})

module.exports = router

