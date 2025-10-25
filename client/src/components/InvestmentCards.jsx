// src/components/InvestmentCards.jsx
import { useId, useMemo, useState, useCallback, useEffect, useRef } from "react";
import styles from "../styles/InvestmentCards.module.css";
import { useTranslation } from "react-i18next";
import { useAccount } from "wagmi";                   // 👈 добавили
import InvestmentModal from "./InvestmentModal";
import InvestmentApplicationForm from "./InvestmentApplicationForm";

// 👇 лайв-статус релейера
import { useRelayerSSE } from "../hook/useRelayerSSE";
import RelayerLiveStatus from "./RelayerLiveStatus";

export default function InvestmentCards({
  layout = "row",
  onSubmitApplication,
  apiBase = "", // всегда через относительные пути → Vite proxy
  autoStartRelayer = true,
}) {
  const { t } = useTranslation();
  const { address } = useAccount();                  // для SSE по пользователю

  const [openInfo, setOpenInfo] = useState(null);   // 'synthetic' | 'moderate' | null
  const [openForm, setOpenForm] = useState(null);   // 'synthetic' | 'moderate' | null
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState(false);

  const synthTitleId = useId();
  const modTitleId = useId();

  // безопасно соединяем базу и путь (без двойных слешей)
  const joinUrl = useCallback((base, path) => {
    const b = String(base || "").replace(/\/+$/, "");
    const p = String(path || "").replace(/^\/+/, "");
    return b ? `${b}/${p}` : `/${p}`;
  }, []);

  // ---------- Статус релейера (пулим список) ----------
  const { relayers, loadingRelayers, refreshRelayers, statusAvailable } =
    useRelayerStatus(apiBase, joinUrl, true);

  // ---------- LIVE: SSE для текущего пользователя ----------
  const { tick, lastExec } = useRelayerSSE({ apiBase, user: address });

  const products = useMemo(
    () => [
      {
        key: "synthetic",
        titleId: synthTitleId,
        badgeClass: styles.synthetic,
        title: t("inv.synthetic.title"),
        sub: t("inv.synthetic.sub"),
        points: [t("inv.synthetic.p1"), t("inv.synthetic.p2"), t("inv.synthetic.p3")],
        descTitle: t("inv.synthetic.title"),
        descText: t("inv.synthetic.desc", "стратегия с повышенным потенциалом через деривативы и ребаланс."),
      },
      {
        key: "moderate",
        titleId: modTitleId,
        badgeClass: styles.moderate,
        title: t("inv.moderate.title"),
        sub: t("inv.moderate.sub"),
        points: [t("inv.moderate.p1"), t("inv.moderate.p2"), t("inv.moderate.p3")],
        descTitle: t("inv.moderate.title"),
        descText: t("inv.moderate.desc"),
      },
    ],
    [t, synthTitleId, modTitleId]
  );

  // нормализуем тип актива для релейера
  function normalizeAssetKind(investAsset) {
    const v = String(investAsset || "").toUpperCase();
    if (v === "BNB") return "BNB";
    if (v === "CAKE") return "CAKE";
    return null; // кастомные адреса — релейер не трогаем
  }

  // Единая обработка сабмита: сохранить заявку + (опционально) стартануть релейер
  async function submitAndMaybeStartRelayer(payload) {
    setErr("");
    setOk(false);
    setBusy(true);
    try {
      // 1) внешний хук (если передан)
      try {
        await onSubmitApplication?.(payload);
      } catch (e) {
        console.warn("onSubmitApplication failed:", e);
      }

      // 2) сохраняем заявку (через прокси на :3001)
      try {
        const url = joinUrl(apiBase, "api/applications/create");
        const r = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(payload),
        });
        if (!r.ok) {
          const j = await r.json().catch(() => ({}));
          console.warn("applications/create failed:", j?.error || r.statusText);
        }
      } catch (e) {
        console.warn("applications/create error:", e);
      }

      // 3) автозапуск релейера для BNB/CAKE
      if (autoStartRelayer) {
        const assetKind = normalizeAssetKind(payload.investAsset);
        if (assetKind) {
          try {
            const url = joinUrl(apiBase, "api/relayer/start");
            const r = await fetch(url, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              credentials: "include",
              body: JSON.stringify({
                user: payload.address,
                assetKind,
                slippageBps: 50,
                pollMs: 15000,
                gasLimit: 1200000,
                deadlineMin: 10,
              }),
            });
            if (!r.ok) {
              const j = await r.json().catch(() => ({}));
              console.warn("Relayer start failed:", j?.error || r.statusText);
            } else {
              await refreshRelayers?.();
            }
          } catch (e) {
            console.warn("relayer/start error:", e);
          }
        }
      }

      setOk(true);
    } catch (e) {
      setErr(String(e?.message || e || t("app.seriesLoadError", "Произошла ошибка при оформлении")));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className={`${styles.wrap} ${layout === "row" ? styles.row : styles.col}`}>
        {products.map((p) => (
          <article key={p.key} className={`${styles.card} ${p.badgeClass}`} aria-labelledby={p.titleId}>
            <header className={styles.head}>
              <div className={styles.chip} aria-hidden="true" />
              <h2 id={p.titleId}>{p.title}</h2>
              <p className={styles.sub}>{p.sub}</p>
            </header>

            <ul className={styles.points}>
              {p.points.map((x, i) => (<li key={i}>{x}</li>))}
            </ul>

            <footer className={styles.actions}>
              <button className={`${styles.btn} ${styles.ghost}`} onClick={() => setOpenInfo(p.key)}>
                {t("inv.more")}
              </button>
              <button
                className={`${styles.btn} ${styles.solid}`}
                onClick={() => { setOpenForm(p.key); setOk(false); setErr(""); }}
              >
                {t("inv.apply")}
              </button>
            </footer>
          </article>
        ))}
      </div>

      {/* Подробнее */}
      <InvestmentModal
        open={!!openInfo}
        onClose={() => setOpenInfo(null)}
        title={(openInfo === "synthetic" ? products[0] : products[1])?.descTitle}
      >
        <div className={styles.content}>
          <p>
            <b>{(openInfo === "synthetic" ? products[0] : products[1])?.descTitle}</b>{" "}
            — {(openInfo === "synthetic" ? products[0] : products[1])?.descText}
          </p>
          <ul>
            {((openInfo === "synthetic" ? products[0] : products[1])?.points || []).map((x, i) => (
              <li key={i}>{x}</li>
            ))}
          </ul>
        </div>
        <div className={styles.modalActions}>
          <button className={`${styles.btn} ${styles.solid}`} onClick={() => { setOpenForm(openInfo); setOpenInfo(null); }}>
            {t("inv.apply")}
          </button>
          <button className={`${styles.btn} ${styles.ghost}`} onClick={() => setOpenInfo(null)}>
            {t("common.close")}
          </button>
        </div>
      </InvestmentModal>

      {/* Оформление */}
      <InvestmentModal
        open={!!openForm}
        onClose={() => setOpenForm(null)}
        title={`${t("inv.application")} — ${openForm === "synthetic" ? t("inv.synthetic.short") : t("inv.moderate.short")}`}
      >
        {(busy || err || ok) ? (
          <div style={{ marginBottom: 8 }}>
            {busy && <div className={styles.note}>{t("inv.form.signing")}</div>}
            {err && <div className={styles.error} style={{ color: "#ef4444" }}>{err}</div>}
            {ok && <div className={styles.note} style={{ color: "#22c55e" }}>{t("common.close", "Готово")}</div>}
          </div>
        ) : null}

        <InvestmentApplicationForm
          product={openForm}
          onCancel={() => setOpenForm(null)}
          onDone={() => setOpenForm(null)}
          onSubmitApplication={async (payload) => { await submitAndMaybeStartRelayer(payload); }}
        />

        {/* Лёгкая панель со статусом активных релейеров (список) */}
        <RelayerStatus relayers={relayers} loading={loadingRelayers} statusAvailable={statusAvailable} />

        {/* 👇 Живой статус по текущему адресу (SSE) */}
        <RelayerLiveStatus tick={tick} lastExec={lastExec} />
      </InvestmentModal>
    </>
  );
}

/* ===================== helpers / hooks ===================== */

function RelayerStatus({ relayers, loading, statusAvailable }) {
  return (
    <div style={{ marginTop: 12, fontSize: 12, opacity: 0.9 }}>
      {!statusAvailable ? (
        <div className={styles.note}>Статус релейера временно недоступен</div>
      ) : loading ? (
        <div>⏳ Проверяем статус релейера…</div>
      ) : (
        <>
          <div>Активных релейеров: {relayers.length}</div>
          {relayers.length > 0 && (
            <ul style={{ marginTop: 6, paddingLeft: 18 }}>
              {relayers.map((x) => (
                <li key={x.key}>
                  <code>{x.key}</code>{x.asset ? ` · ${x.asset}` : ""}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
function useRelayerStatus(apiBase, joinUrl, enabled) {
  const [relayers, setRelayers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [statusAvailable, setStatusAvailable] = useState(true);
  const failRef = useRef(0);
  const timerRef = useRef(null);
  const abortRef = useRef(null);

  const list = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    const ctrl = new AbortController();
    abortRef.current?.abort();
    abortRef.current = ctrl;

    try {
      const url = joinUrl(apiBase, `api/relayer/list?_=${Date.now()}`);
      const r = await fetch(url, {
        credentials: "include",
        cache: "no-store",
        headers: { "Cache-Control": "no-cache" },
        signal: ctrl.signal,
      });

      if (!r.ok) {
        failRef.current = Math.min(failRef.current + 1, 10);
        if (failRef.current >= 3) setStatusAvailable(false);
        return;
      }
      const j = await r.json().catch(() => ({}));
      setRelayers(Array.isArray(j?.items) ? j.items : []);
      failRef.current = 0;
      if (!statusAvailable) setStatusAvailable(true);
    } catch (e) {
      if (e?.name !== "AbortError") {
        failRef.current = Math.min(failRef.current + 1, 10);
        if (failRef.current >= 3) setStatusAvailable(false);
      }
    } finally {
      setLoading(false);
    }
  }, [apiBase, joinUrl, enabled, statusAvailable]);

  const tick = useCallback(async () => {
    if (!enabled) return;
    await list();
    const delay = Math.min(60_000, 10_000 * Math.max(1, failRef.current + 1)); // backoff
    timerRef.current = setTimeout(tick, delay);
  }, [list, enabled]);

  useEffect(() => {
    if (enabled) {
      tick();
      return () => { clearTimeout(timerRef.current); abortRef.current?.abort(); };
    }
    clearTimeout(timerRef.current);
    abortRef.current?.abort();
    failRef.current = 0;
    setLoading(false);
    setStatusAvailable(true);
    return () => { clearTimeout(timerRef.current); abortRef.current?.abort(); };
  }, [enabled, tick]);

  const refreshRelayers = useCallback(async () => {
    await list();
  }, [list]);

  return { relayers, loadingRelayers: loading, refreshRelayers, statusAvailable };
}
