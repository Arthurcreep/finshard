# app.py
from flask import Flask, request, jsonify
import os, traceback
import pandas as pd
import numpy as np
# ========= FE helpers (до моделей) =========
def series_to_returns(vals: list[float]) -> np.ndarray:
    """Процентные изменения (стационаризация)."""
    s = pd.Series(vals, dtype=float)
    r = s.pct_change().fillna(0.0)
    # обрезаем экстремальные выбросы, чтобы VAR/регрессия не сносилась
    r = r.clip(lower=-0.2, upper=0.2)
    return r.to_numpy()

def returns_to_price_path(last_price: float, rets: np.ndarray) -> list[float]:
    """Из прогнозов доходности восстанавливаем ценовой путь."""
    path = []
    p = float(last_price)
    for rr in rets:
        p *= (1.0 + float(rr))
        path.append(p)
    return path

def make_lagged(arr: np.ndarray, lags=(1,2,3)) -> dict[int, np.ndarray]:
    """Сдвигаем массив на лаги, незаполненное заполняем нулями."""
    out = {}
    s = pd.Series(arr)
    for L in lags:
        out[L] = s.shift(L).fillna(0.0).to_numpy()
    return out

def ema1d(x: np.ndarray, alpha: float) -> np.ndarray:
    """Простая EMA для наивного форварда экзогенов."""
    if len(x) == 0: return x
    out = np.empty_like(x, dtype=float)
    out[0] = x[0]
    for i in range(1, len(x)):
        out[i] = alpha * x[i] + (1 - alpha) * out[i-1]
    return out

def naive_exog_forecast(last_values: np.ndarray, steps: int) -> np.ndarray:
    """
    Наивный форвард экзогенов: продолжение сглаженной тенденции (EMA-дрифт).
    Возвращаем FUTURE УРОВНИ, не доходности.
    """
    if last_values.size == 0:
        return np.zeros(steps, dtype=float)
    hist = ema1d(last_values, alpha=0.2)
    drift = float(hist[-1] - hist[-2]) if hist.size >= 2 else 0.0
    base = float(hist[-1])
    future = np.array([base + (i+1)*drift for i in range(steps)], dtype=float)
    return future

app = Flask(__name__)

TF_CFG = {
    "1h": {"freq": "H",  "horizon": 24, "step_ms": 60*60*1000,   "roll_window": 500},
    "4h": {"freq": "4H", "horizon": 18, "step_ms": 4*60*60*1000, "roll_window": 400},
    "1d": {"freq": "D",  "horizon": 7,  "step_ms": 24*60*60*1000,"roll_window": 300},
}

USE_STUB = os.getenv("ML_MODE", "").lower() == "stub"

PROPHET_OK = False
if not USE_STUB:
    try:
        from prophet import Prophet
        PROPHET_OK = True
    except Exception as e:
        print("[ML] Prophet import failed -> STUB mode usable:", repr(e))
        USE_STUB = True  # флаг «разрешаем заглушку»

VAR_OK = False
try:
    from statsmodels.tsa.api import VAR
    VAR_OK = True
except Exception as e:
    print("[ML] statsmodels VAR import failed:", repr(e))

@app.errorhandler(Exception)
def _any_exception(e):
    traceback.print_exc()
    code = 400 if isinstance(e, (ValueError, RuntimeError)) else 500
    return jsonify({"error": f"{type(e).__name__}: {e}"}), code

def to_utc_ms(ts):
    ts = pd.Timestamp(ts)
    if ts.tzinfo is None:
        ts = ts.tz_localize('UTC')
    else:
        ts = ts.tz_convert('UTC')
    return int(ts.value // 10**6)

def align_series(main_times_ms, series):
    if not series:
        return None
    s = pd.DataFrame(series)
    if "time" not in s or "value" not in s or len(s) == 0:
        return None
    s["time"] = pd.to_datetime(s["time"].astype("int64"), unit="ms", utc=True).dt.tz_localize(None)
    s = s.sort_values("time").drop_duplicates("time", keep="last")
    s = pd.Series(s["value"].astype(float).to_numpy(), index=pd.DatetimeIndex(s["time"]))
    idx = pd.to_datetime(np.array(main_times_ms, dtype="int64"), unit="ms", utc=True).tz_localize(None)
    idx = pd.DatetimeIndex(idx)
    s = s.reindex(idx, method="ffill")
    if s.isna().any():
        s = s.fillna(method="bfill").fillna(method="ffill")
    return s.to_numpy()

def build_df_from_candles(candles, use_naive_utc=True):
    closes = [float(c["close"]) for c in candles]
    times_ms = [int(c["time"]) for c in candles]
    ds = pd.to_datetime(times_ms, unit='ms', utc=True)
    if use_naive_utc:
        ds = ds.tz_localize(None)
    return pd.DataFrame({"ds": ds, "y": closes}), closes, times_ms

def forecast_stub(times_ms, closes, horizon, step_ms):
    last_t = int(times_ms[-1]); last_c = float(closes[-1])
    out, band = [], []
    for i in range(1, horizon+1):
        t = last_t + i*step_ms
        val = last_c
        out.append({"time": t, "value": val})
        band.append({"time": t, "low": val*0.99, "high": val*1.01})
    return out, band, "Stub"

def forecast_prophet(candles, tf, horizon, exog):
    if not PROPHET_OK:
        raise RuntimeError("Prophet not available")

    df, closes, times_ms = build_df_from_candles(candles, use_naive_utc=True)

    # --- регрессоры ---
    regressors = []
    if exog:
        for key, arr in exog.items():
            v = align_series(times_ms, arr)
            if v is not None:
                # стандартизуем регрессоры → устойчивее фит
                mu, sd = float(np.mean(v)), float(np.std(v) or 1.0)
                df[key] = (v - mu) / sd
                regressors.append((key, mu, sd))

    # --- Prophet с тюнингом ---
    # для дневки лучше multiplicative из-за масштабирующейся волатильности
    seasonality_mode = "multiplicative" if tf == "1d" else "additive"
    m = Prophet(
        seasonality_mode=seasonality_mode,
        yearly_seasonality=True,
        weekly_seasonality=True,
        daily_seasonality=True if tf in ("1h","4h") else False,
        changepoint_prior_scale=0.2,     # более гибкие изломы тренда
        seasonality_prior_scale=5.0
    )
    # чуть богаче недельная сезонность (в крипте есть «неделя» несмотря на 24/7)
    if tf == "1h":
        # у Prophet период в днях; доп. сезонка «почасовая» не нужна, daily уже включена
        pass
    if tf == "4h":
        pass
    if tf == "1d":
        m.add_seasonality(name="monthly", period=30.5, fourier_order=5)

    for name, *_ in regressors:
        m.add_regressor(name)

    m.fit(df)

    freq = TF_CFG[tf]["freq"]
    future = m.make_future_dataframe(periods=int(horizon), freq=freq, include_history=False)

    # --- будущее для регрессоров: наивный EMA‑дрифт, затем стандартизируем теми же μ,σ ---
    if regressors:
        for name, mu, sd in regressors:
            hist = df[name].to_numpy() * sd + mu  # вернули уровни
            fut_levels = naive_exog_forecast(hist, steps=int(horizon))
            fut_std = (fut_levels - mu) / (sd or 1.0)
            future[name] = fut_std

    fcst = m.predict(future)
    out  = [{"time": to_utc_ms(r.ds), "value": float(r.yhat)} for _, r in fcst.iterrows()]
    band = [{"time": to_utc_ms(r.ds), "low": float(r.yhat_lower), "high": float(r.yhat_upper)} for _, r in fcst.iterrows()]
    return out, band, "Prophet"

def forecast_var_ret(candles, tf, horizon, exog):
    if not VAR_OK:
        raise RuntimeError("VAR not available")

    # базовый ряд: доходности BTC
    _, closes, times_ms = build_df_from_candles(candles, use_naive_utc=False)
    idx = pd.to_datetime(times_ms, unit='ms', utc=True).tz_localize(None)
    y_ret = series_to_returns(closes)

    data = pd.DataFrame({"y": y_ret}, index=idx)

    # экзогены → тоже доходности + лаги
    if exog:
        for key, arr in exog.items():
            v = align_series(times_ms, arr)  # уровни экзогена, выровнены по времени BTC
            if v is None: 
                continue
            r = series_to_returns(v)
            data[f"{key}_r"] = r
            # лаги 1..3, чтобы не было утечек в будущее
            lags = make_lagged(r, lags=(1,2,3))
            for L, arrL in lags.items():
                data[f"{key}_r_l{L}"] = arrL

    # техпризнаки (микро‑сигналы) на сам BTC
    data["y_lag1"] = pd.Series(y_ret, index=idx).shift(1).fillna(0.0)
    # «волатильность»: |ret| скользящее среднее
    span = 24 if tf == "1h" else (6 if tf == "4h" else 7)
    data["y_vol"] = pd.Series(np.abs(y_ret), index=idx).rolling(span, min_periods=2).mean().fillna(0.0)

    # чистка
    data = data.replace([np.inf, -np.inf], np.nan).fillna(0.0)
    if data.shape[1] < 2 or len(data) < 120:
        raise ValueError("not enough data for VAR-ret (need >=120 with features)")

    # fit
    model = VAR(data)
    maxlags = min(8, max(2, len(data)//20))  # для ретов меньше лагов хватает
    res = model.fit(maxlags=maxlags, ic='aic')

    # прогноз доходности y на steps
    steps = int(horizon)
    prev = res.y if hasattr(res, "y") else res.endog
    fc = res.forecast(prev, steps=steps)  # ndarray (steps x k)

    # индекс столбца целевой переменной
    y_idx = list(data.columns).index("y")

    # доверительный коридор на доходность и перевод в цену
    resid_arr = np.asarray(res.resid) if hasattr(res, "resid") else None
    resid_std = float(np.std(resid_arr[:, y_idx])) if resid_arr is not None and resid_arr.size else 0.02

    yhat_rets = fc[:, y_idx].astype(float)

    step_ms = TF_CFG[tf]["step_ms"]
    future_times = [int(times_ms[-1] + (i+1)*step_ms) for i in range(steps)]

    # восстанавливаем цену из доходностей
    out_prices = returns_to_price_path(last_price=float(closes[-1]), rets=yhat_rets)

    # грубые доверительные коридоры в ценах (накопление std)
    band_low, band_high = [], []
    p = float(closes[-1])
    low, high = p, p
    for i, rr in enumerate(yhat_rets, start=1):
        p *= (1.0 + rr)
        low  *= (1.0 + rr - 1.96*resid_std)
        high *= (1.0 + rr + 1.96*resid_std)
        band_low.append(low)
        band_high.append(high)

    out = [{"time": future_times[i], "value": float(out_prices[i])} for i in range(steps)]
    band = [{"time": future_times[i], "low": float(band_low[i]), "high": float(band_high[i])} for i in range(steps)]
    return out, band, "VAR_RET"

def blend_two(f1, f2):
    d1 = {p["time"]: p["value"] for p in f1}
    d2 = {p["time"]: p["value"] for p in f2}
    times = sorted(set(d1.keys()) & set(d2.keys()))
    if not times:
        # если пересечений нет — просто склеим по времени второго списка
        return sorted(f1 + f2, key=lambda x: x["time"])
    return [{"time": t, "value": (d1[t] + d2[t]) / 2.0} for t in times]

@app.route("/health", methods=["GET"])
def health():
    return jsonify({"ok": True, "mode": "STUB" if USE_STUB else "PROPHET", "prophet_ok": PROPHET_OK, "var_ok": VAR_OK})

@app.route("/forecast", methods=["POST"])
def forecast():
    p = request.get_json(force=True) or {}
    symbol  = p.get("symbol", "BTCUSDT")
    tf      = p.get("tf", "1h")
    method  = (p.get("method") or "prophet").lower()
    candles = p.get("candles", [])
    exog    = p.get("exog", {}) or {}

    cfg = TF_CFG.get(tf)
    if not cfg:
        return jsonify({"error": f"unsupported tf: {tf}"}), 400
    if not candles or len(candles) < 50:
        return jsonify({"error": "not enough candles (>=50) required"}), 400

    # базовые ряды для заглушки «на готове»
    _, closes, times_ms = build_df_from_candles(candles, use_naive_utc=True)
    horizon = int(p.get("horizon") or cfg["horizon"])

    try:
        if method == "prophet":
            if USE_STUB and not PROPHET_OK:
                out, band, used = forecast_stub(times_ms, closes, horizon, cfg["step_ms"])
                return jsonify({"symbol":symbol, "tf":tf, "method":used, "forecast_line":out, "confidence":band})
            out, band, used = forecast_prophet(candles, tf, horizon, exog)
            return jsonify({"symbol":symbol, "tf":tf, "method":used, "forecast_line":out, "confidence":band})

        elif method == "var":
            if not VAR_OK:
                # деградация в заглушку, чтобы не валить 500
                out, band, used = forecast_stub(times_ms, closes, horizon, cfg["step_ms"])
                return jsonify({"symbol":symbol, "tf":tf, "method":used, "forecast_line":out, "confidence":band})
            out, band, used = forecast_var(candles, tf, horizon, exog)
            return jsonify({"symbol":symbol, "tf":tf, "method":used, "forecast_line":out, "confidence":band})

        elif method == "blend":
            parts = []
            # часть Prophet
            if PROPHET_OK and not USE_STUB:
                try:
                    p_out, _, _ = forecast_prophet(candles, tf, horizon, exog)
                    parts.append(p_out)
                except Exception as e:
                    print("[BLEND] prophet failed:", repr(e))
            else:
                # если «пророка» нет — используем стаб как одну из частей
                p_out, _, _ = forecast_stub(times_ms, closes, horizon, cfg["step_ms"])
                parts.append(p_out)
            # часть VAR
            if VAR_OK:
                try:
                    v_out, _, _ = forecast_var(candles, tf, horizon, exog)
                    parts.append(v_out)
                except Exception as e:
                    print("[BLEND] var failed:", repr(e))

            if not parts:
                out, band, used = forecast_stub(times_ms, closes, horizon, cfg["step_ms"])
                return jsonify({"symbol":symbol, "tf":tf, "method":used, "forecast_line":out, "confidence":band})
            if len(parts) == 1:
                out = parts[0]
            else:
                out = blend_two(parts[0], parts[1])
            return jsonify({"symbol":symbol, "tf":tf, "method":"Blend", "forecast_line": out, "confidence": []})

        else:
            return jsonify({"error": f"unsupported method: {method}"}), 400

    except Exception as e:
        # вместо 500 отдадим осмысленную 400/422
        return jsonify({"error": f"forecast failed: {type(e).__name__}: {e}"}), 422

# backtest как было...
if __name__ == "__main__":
    print("[ML] MODE:", "STUB" if USE_STUB else "PROPHET", "| PROPHET_OK:", PROPHET_OK, "| VAR_OK:", VAR_OK)
    app.run(host="0.0.0.0", port=5001)

