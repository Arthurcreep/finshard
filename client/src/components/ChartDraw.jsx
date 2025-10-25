// src/App.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import TVChart from "./TVChart";
import IndicatorPopover from "./IndicatorPopover";
import { useTranslation } from "react-i18next";

const TFS = ["1h", "4h", "1d"];
const PALETTE = ["#22c55e", "#f59e0b", "#60a5fa", "#ef4444", "#a78bfa", "#10b981"];
const validSymbol = (s) => /^[A-Z0-9]{5,20}$/.test(s || "");

function useQueryState() {
  const params = new URLSearchParams(location.search);
  const [symbol, setSymbol] = useState(params.get("symbol") || "BTCUSDT");
  const [tf, setTf] = useState(params.get("tf") || "1h");
  const [ind, setInd] = useState(params.get("ind") || "SMA:20,EMA:50");
  const [full, setFull] = useState(params.get("full") === "1" ? "1" : "0");

  useEffect(() => {
    const p = new URLSearchParams({ symbol, tf, ind, full });
    history.replaceState(null, "", `?${p.toString()}`);
  }, [symbol, tf, ind, full]);

  return { symbol, tf, ind, full, setSymbol, setTf, setInd, setFull };
}

// "SMA:20,EMA:50" -> [{type,period,...}]
function parseIndStr(str) {
  return String(str || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s, i) => {
      const [type, p] = s.split(":");
      return {
        id: `i${i}_${(type || "X").toUpperCase()}_${p || 1}`,
        type: (type || "").toUpperCase(),
        period: Math.max(1, Number(p) || 1),
        color: PALETTE[i % PALETTE.length],
        enabled: true,
      };
    });
}

function buildIndStr(inds) {
  return (inds || [])
    .filter((i) => i.enabled)
    .map((i) => (i.period ? `${i.type}:${i.period}` : i.type))
    .join(",");
}

export default function App() {
  const { t } = useTranslation();
  const { symbol, tf, ind, full, setSymbol, setTf, setInd, setFull } = useQueryState();

  const [inds, setInds] = useState(() => parseIndStr(ind));
  useEffect(() => setInd(buildIndStr(inds)), [inds, setInd]);

  const uiIndicators = useMemo(
    () => inds.map((i) => ({ ...i, type: i.type.toUpperCase() })),
    [inds]
  );

  const [data, setData] = useState({ candles: [], indicators: {}, forecast: [] });
  const [loading, setLoading] = useState(false);
  const [fLoading, setFLoading] = useState(false);
  const [err, setErr] = useState("");
  const abortRef = useRef(null);

  useEffect(() => {
    setErr("");
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    if (!validSymbol(symbol)) {
      setLoading(false);
      setData({ candles: [], indicators: {}, forecast: [] });
      return () => ac.abort();
    }

    setLoading(true);
    const tmo = setTimeout(async () => {
      try {
        const r = await fetch(
          `/api/series?symbol=${encodeURIComponent(symbol)}&tf=${encodeURIComponent(
            tf
          )}&ind=${encodeURIComponent(ind || "")}&full=${full}`,
          { signal: ac.signal, credentials: "include" }
        );
        if (!r.ok) throw new Error(`series_${r.status}`);
        const j = await r.json();

        let forecast = [];
        try {
          const r2 = await fetch(
            `/api/forecast/latest?symbol=${encodeURIComponent(symbol)}&tf=${encodeURIComponent(tf)}`,
            { signal: ac.signal, credentials: "include" }
          );
          if (r2.ok) {
            const j2 = await r2.json();
            forecast = Array.isArray(j2?.data?.forecast_line) ? j2.data.forecast_line : [];
          }
        } catch {}

        setData({ candles: j.candles || [], indicators: j.indicators || {}, forecast });
      } catch (e) {
        if (e.name !== "AbortError") setErr(t("app.seriesLoadError"));
      } finally {
        if (!ac.signal.aborted) setLoading(false);
      }
    }, 400);

    return () => {
      clearTimeout(tmo);
      ac.abort();
    };
  }, [symbol, tf, ind, full, t]);

  async function generateForecast() {
    setFLoading(true);
    setErr("");
    try {
      const r = await fetch(`/api/forecast/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ symbol, tf, horizon: 120, method: "blend" }),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error(j?.error || "ml_failed");
      }
      const j = await r.json();
      const forecast = Array.isArray(j?.data?.forecast_line) ? j.data.forecast_line : [];
      setData((d) => ({ ...d, forecast }));
    } catch {
      setErr(t("app.forecastError"));
    } finally {
      setFLoading(false);
    }
  }

  const addInd = (indObj) => setInds((prev) => [...prev, indObj]);
  const updInd = (id, patch) => setInds((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  const delInd = (id) => setInds((prev) => prev.filter((i) => i.id !== id));

  return (
    <div style={{ padding: 16, display: "grid", gap: 12 }}>
      <h1 style={{ margin: 0 }}>{t("app.chartTitle")}</h1>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
        <label>
          {t("app.symbol")}:&nbsp;
          <input
            value={symbol}
            onChange={(e) => setSymbol(e.target.value.toUpperCase().replace(/\s+/g, ""))}
            style={{ width: 120 }}
            placeholder={t("app.symbolPlaceholder")}
          />
        </label>

        <label>
          {t("app.timeframe")}:&nbsp;
          <select value={tf} onChange={(e) => setTf(e.target.value)}>
            {TFS.map((x) => (
              <option key={x} value={x}>
                {x}
              </option>
            ))}
          </select>
        </label>

        <IndicatorPopover indicators={inds} onAdd={addInd} onUpdate={updInd} onRemove={delInd} />

        <label title={t("app.historyHint")}>
          {t("app.history")}:&nbsp;
          <select value={full} onChange={(e) => setFull(e.target.value)}>
            <option value="0">{t("app.historyShort")}</option>
            <option value="1">{t("app.historyFull")}</option>
          </select>
        </label>

        <button onClick={generateForecast} disabled={fLoading} style={{ padding: "6px 10px" }}>
          {fLoading ? t("app.generating") : t("app.generateForecast")}
        </button>

        {loading && <span style={{ opacity: 0.7 }}>{t("app.loading")}</span>}
        {err && <span style={{ color: "#ef4444" }}>{err}</span>}
      </div>

      <div style={{ height: "70vh", minHeight: 420 }}>
        <TVChart symbol={symbol} data={data} uiIndicators={uiIndicators} />
      </div>
    </div>
  );
}
