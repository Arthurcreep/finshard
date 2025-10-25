const express = require('express')
const router = express.Router()
const asyncHandler = require('express-async-handler')
const axios = require('axios')
const { z } = require('zod')
const TI = require('technicalindicators')

const Q = z.object({
    symbol: z.string().trim().min(3).max(20),
    tf: z.enum(['1h', '4h', '1d']),
    ind: z.string().optional(),   // "SMA:10,EMA:10"
    full: z.union([z.literal('1'), z.literal('0')]).optional(),
    method: z.string().optional()
})

const BINANCE_TF = { '1h': '1h', '4h': '4h', '1d': '1d' }

function parseIndicators(ind) {
    if (!ind) return []
    return String(ind).split(',')
        .map(s => s.trim()).filter(Boolean)
        .map(s => {
            const [type, p] = s.split(':')
            return { type: String(type || '').toUpperCase(), period: Math.max(1, Number(p) || 1) }
        })
        .filter(x => x.type && Number.isFinite(x.period))
}

async function loadCandles(symbol, tf, full) {
    const limit = full === '1' ? 1000 : 500
    const { data } = await axios.get('https://api.binance.com/api/v3/klines', {
        params: { symbol, interval: BINANCE_TF[tf], limit }
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

// выравниваем индикатор к длине свечей, заполняем начальные null
function alignSeries(candles, values, period) {
    const pad = Array(Math.max(0, candles.length - values.length)).fill(null)
    const arr = pad.concat(values)
    // превратим в {time,value} и пропустим null, если фронту так удобнее
    return arr.map((v, i) => v == null ? null : ({ time: candles[i].time, value: v })).filter(Boolean)
}

router.get('/', asyncHandler(async (req, res) => {
    const q = Q.safeParse(req.query)
    if (!q.success) return res.status(400).json({ error: 'bad_query', details: q.error.errors })
    const { symbol, tf, ind, full } = q.data
    const indicators = parseIndicators(ind)

    const candles = await loadCandles(symbol.toUpperCase(), tf, full)
    const closes = candles.map(c => c.close)

    const indicatorMap = {}
    for (const it of indicators) {
        const key = `${it.type}:${it.period}`
        try {
            if (it.type === 'SMA') {
                const values = TI.SMA.calculate({ period: it.period, values: closes })
                indicatorMap[key] = alignSeries(candles, values, it.period)
            } else if (it.type === 'EMA') {
                const values = TI.EMA.calculate({ period: it.period, values: closes })
                indicatorMap[key] = alignSeries(candles, values, it.period)
            } else {
                // неизвестный индикатор, просто отдадим пусто
                indicatorMap[key] = []
            }
        } catch (e) {
            console.error('[series][ind] fail', key, e?.message)
            indicatorMap[key] = []
        }
    }

    res.json({
        meta: { symbol: symbol.toUpperCase(), tf },
        candles,
        indicators: indicatorMap
    })
}))

module.exports = router

