// TVChart.jsx — compact & robust with indicators
import { useEffect, useMemo, useRef, useState } from "react";
import { createChart } from "lightweight-charts";

/* ---------- helpers: тема/язык ---------- */
function getCookie(name) {
    const m = document.cookie.match(new RegExp('(?:^|; )' + name.replace(/([$?*|{}\\^])/g, '\\$1') + '=([^;]*)'));
    return m ? decodeURIComponent(m[1]) : '';
}
function getThemeFromDomOrCookie() {
    const attr = document.documentElement.getAttribute('data-theme');
    if (attr === 'dark' || attr === 'light') return attr;
    const c = getCookie('theme');
    return (c === 'dark' || c === 'light') ? c : 'light';
}
function getLangFromDomOrCookie() {
    const attr = document.documentElement.getAttribute('lang');
    if (attr) return attr;
    const c = getCookie('lang');
    return c || 'ru-RU';
}
function keyFor(ind) {
    const t = String(ind.type || '').toUpperCase();
    const p = ind.period != null ? Number(ind.period) : undefined;
    return p ? `${t}:${p}` : t;
}

/* ---------- time utils & tick formatter ---------- */
const toSec = (t) => {
    if (t == null) return null;
    if (typeof t === "object") {
        // BusinessDay -> UTC midnight
        const y = t.year, m = (t.month || 1) - 1, d = t.day || 1;
        return Math.floor(Date.UTC(y, m, d) / 1000);
    }
    const n = Number(t);
    if (!Number.isFinite(n)) return null;
    return n > 1e12 ? Math.floor(n / 1000) : Math.floor(n); // ms -> sec
};

const makeTickFormatter = (locale = "ru-RU") => {
    const mk = (opts) => new Intl.DateTimeFormat(locale, { timeZone: "UTC", ...opts });
    const F = {
        Year: mk({ year: "numeric" }),
        Month: mk({ month: "short", year: "2-digit" }),
        Day: mk({ day: "2-digit", month: "short" }),
        Time: mk({ hour: "2-digit", minute: "2-digit" }),
        TimeWithSeconds: mk({ hour: "2-digit", minute: "2-digit", second: "2-digit" }),
    };
    return (time, tickMarkType) => {
        const sec = typeof time === "number" ? time : toSec(time);
        const d = new Date((sec || 0) * 1000);
        return (F[tickMarkType] || F.Day).format(d);
    };
};

/* ---------- normalize data ---------- */
function normalizeCandles(raw) {
    if (!Array.isArray(raw) || !raw.length) return [];
    const out = [];
    for (const c of raw) {
        if (!c || typeof c !== 'object') continue;
        const time = toSec(c?.time);
        const open = Number(c?.open), high = Number(c?.high), low = Number(c?.low), close = Number(c?.close);
        if (![time, open, high, low, close].every(Number.isFinite)) continue;
        out.push({ time, open, high: Math.max(high, open, close, low), low: Math.min(low, open, close, high), close });
    }
    out.sort((a, b) => a.time - b.time);
    return out;
}
function normalizeLine(raw) {
    if (!Array.isArray(raw) || !raw.length) return [];
    return raw
        .map(p => {
            if (!p || typeof p !== 'object') return null;
            const time = toSec(p?.time), value = Number(p?.value);
            if (!Number.isFinite(time) || !Number.isFinite(value)) return null;
            return { time, value };
        })
        .filter(Boolean)
        .sort((a, b) => a.time - b.time);
}

/* ---------- компонент ---------- */
/**
 * props:
 *  - symbol: string
 *  - data: {
 *      candles: Array<Candle>,
 *      indicators?: Record<string, Array<{time,value}>>,
 *      forecast?: Array<{time,value}>
 *    }
 *  - uiIndicators?: Array<{ id, type, period?, color, enabled }>
 */
export default function TVChart({ symbol = "BTCUSDT", data, uiIndicators = [] }) {
    const containerRef = useRef(null);
    const chartRef = useRef(null);
    const candleRef = useRef(null);
    const forecastRef = useRef(null);
    const indSeriesMapRef = useRef(new Map()); // id -> { series, key }

    const [theme, setTheme] = useState(getThemeFromDomOrCookie());
    const [locale, setLocale] = useState(getLangFromDomOrCookie());

    // Следим за <html data-theme/lang>
    useEffect(() => {
        const obs = new MutationObserver(() => setTheme(getThemeFromDomOrCookie()));
        obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
        return () => obs.disconnect();
    }, []);
    useEffect(() => {
        const obs = new MutationObserver(() => setLocale(getLangFromDomOrCookie()));
        obs.observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
        return () => obs.disconnect();
    }, []);

    // Инициализация графика (без падений при content-visibility)
    useEffect(() => {
        if (!containerRef.current || chartRef.current) return;
        const el = containerRef.current;
        const isDark = theme === 'dark';

        const chart = createChart(el, {
            width: Math.max(1, el.clientWidth),
            height: Math.max(420, el.clientHeight || 420),
            layout: {
                background: { type: "solid", color: isDark ? "#0b0e14" : "#ffffff" },
                textColor: isDark ? "#e5e7eb" : "#0f172a",
                fontSize: 12,
            },
            grid: {
                vertLines: { color: isDark ? "#1f2937" : "#e5e7eb" },
                horzLines: { color: isDark ? "#1f2937" : "#e5e7eb" },
            },
            rightPriceScale: { borderColor: isDark ? "#1f2937" : "#e5e7eb" },
            timeScale: {
                borderColor: isDark ? "#1f2937" : "#e5e7eb",
                timeVisible: true,
                secondsVisible: false,
                tickMarkFormatter: makeTickFormatter(locale),
            },
            localization: { locale },
            crosshair: { mode: 1 },
        });
        chartRef.current = chart;

        // Серии
        candleRef.current = chart.addCandlestickSeries({
            upColor: "#16a34a",
            downColor: "#ef4444",
            borderUpColor: "#16a34a",
            borderDownColor: "#ef4444",
            wickUpColor: "#16a34a",
            wickDownColor: "#ef4444",
        });
        forecastRef.current = chart.addLineSeries({
            color: "#3b82f6",
            lineWidth: 2,
            priceLineVisible: false,
            lastValueVisible: false,
        });

        // Первичная подгонка после «пробуждения» контейнера
        const raf = requestAnimationFrame(() => {
            try {
                chart.applyOptions({ width: el.clientWidth, height: Math.max(420, el.clientHeight || 420) });
                chart.timeScale().fitContent();
            } catch { }
        });

        // Ресайз без дёрганий
        const ro = new ResizeObserver(() => {
            try {
                chart.applyOptions({ width: el.clientWidth, height: Math.max(420, el.clientHeight || 420) });
            } catch { }
        });
        ro.observe(el);

        // Первичная установка данных если уже пришли
        if (data?.candles?.length) {
            const initial = normalizeCandles(data.candles);
            if (initial.length) {
                candleRef.current.setData(initial);
                chart.timeScale().fitContent();
            }
        }
        if (data?.forecast?.length) {
            const initF = normalizeLine(data.forecast);
            if (initF.length) forecastRef.current.setData(initF);
        }

        return () => {
            cancelAnimationFrame(raf);
            ro.disconnect();
            try { chart.remove(); } catch { }
            chartRef.current = null;
            candleRef.current = null;
            forecastRef.current = null;
            indSeriesMapRef.current.forEach(({ series }) => { try { chart.removeSeries(series); } catch { } });
            indSeriesMapRef.current.clear();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []); // один раз

    // Тема
    useEffect(() => {
        const chart = chartRef.current;
        if (!chart) return;
        const isDark = theme === 'dark';
        chart.applyOptions({
            layout: {
                background: { type: "solid", color: isDark ? "#0b0e14" : "#ffffff" },
                textColor: isDark ? "#e5e7eb" : "#0f172a",
            },
            grid: {
                vertLines: { color: isDark ? "#1f2937" : "#e5e7eb" },
                horzLines: { color: isDark ? "#1f2937" : "#e5e7eb" },
            },
            rightPriceScale: { borderColor: isDark ? "#1f2937" : "#e5e7eb" },
            timeScale: { borderColor: isDark ? "#1f2937" : "#e5e7eb" },
        });
    }, [theme]);

    // Локаль + формат тиков
    useEffect(() => {
        const chart = chartRef.current;
        if (!chart) return;
        chart.applyOptions({
            localization: { locale },
            timeScale: { tickMarkFormatter: makeTickFormatter(locale) },
        });
    }, [locale]);

    // Обновление свечей/прогноза
    useEffect(() => {
        const chart = chartRef.current;
        if (!chart) return;

        // Candles
        if (data?.candles) {
            const safe = normalizeCandles(data.candles);
            candleRef.current?.setData(safe);
            if (safe.length) chart.timeScale().fitContent();
        } else {
            candleRef.current?.setData([]);
        }

        // Forecast
        if (data?.forecast) {
            const line = normalizeLine(data.forecast);
            forecastRef.current?.setData(line);
        } else {
            forecastRef.current?.setData([]);
        }
    }, [data?.candles, data?.forecast, symbol]);

    // ----- Индикаторы -----
    const indicatorsData = useMemo(() => data?.indicators || {}, [data?.indicators]);
    useEffect(() => {
        const chart = chartRef.current;
        if (!chart) return;

        const map = indSeriesMapRef.current;
        const wanted = new Set();

        for (const ind of (uiIndicators || [])) {
            if (!ind?.enabled) continue;
            const k = keyFor(ind);
            const arr = normalizeLine(indicatorsData[k]); // toSec внутри
            if (!arr.length) continue;

            wanted.add(ind.id);
            let rec = map.get(ind.id);
            if (!rec) {
                const series = chart.addLineSeries({
                    color: ind.color || "#22c55e",
                    lineWidth: 2,
                    priceLineVisible: false,
                    lastValueVisible: false,
                });
                rec = { series, key: k };
                map.set(ind.id, rec);
            }
            if (rec.key !== k) rec.key = k;
            rec.series.applyOptions({ color: ind.color || "#22c55e" });
            rec.series.setData(arr);
        }

        // Удаляем выключенные/отсутствующие
        for (const [id, rec] of map.entries()) {
            if (!wanted.has(id)) {
                try { rec.series && chart.removeSeries(rec.series); } catch { }
                map.delete(id);
            }
        }
    }, [uiIndicators, indicatorsData]);

    return (
        <div
            ref={containerRef}
            className="chart-shell"
            style={{ width: "100%", height: "100%", minHeight: 420 }}
            aria-label={`Chart ${symbol}`}
        />
    );
}
