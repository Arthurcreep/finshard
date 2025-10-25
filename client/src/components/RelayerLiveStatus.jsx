import React, { useMemo } from "react";
import styles from "../styles/InvestmentCards.module.css";

function bpsBar(val, target = 50) {
  const v = Math.max(0, Math.min(target, Number(val || 0)));
  const pct = (v / target) * 100;
  return (
    <div style={{ height: 8, background: "#e5e7eb", borderRadius: 6, overflow: "hidden" }}>
      <div style={{ width: `${pct}%`, height: "100%", background: "#10b981" }} />
    </div>
  );
}

export default function RelayerLiveStatus({ tick, lastExec }) {
  const phaseLabel = useMemo(() => {
    switch (tick?.phase) {
      case "IN_USDT": return "В USDT (ожидаем вход)";
      case "IN_POSITION_BNB": return "В BNB (ожидаем выход)";
      default: return "Без позиции";
    }
  }, [tick]);

  const nextAction = useMemo(() => {
    if (!tick) return "";
    if (tick.phase === "IN_USDT") return `Ждём падение ≥ 0.5% (drop ${tick.dropBps}/${tick.targetBps} bps)`;
    if (tick.phase === "IN_POSITION_BNB") return `Ждём рост ≥ 0.5% (rise ${tick.riseBps}/${tick.targetBps} bps)`;
    return "—";
  }, [tick]);

  return (
    <div className={styles.block} style={{ marginTop: 12 }}>
      <div style={{ fontWeight: 600, marginBottom: 6 }}>Статус релейера</div>
      {tick ? (
        <>
          <div style={{ marginBottom: 6 }}>
            Фаза: <b>{phaseLabel}</b> · Фид: {tick.feed} · Exec: {tick.execEnabled ? "on" : "off"}
          </div>

          {tick.phase === "IN_USDT" && (
            <>
              <div style={{ marginBottom: 4 }}>{`Падение: ${tick.dropBps}/${tick.targetBps} bps`}</div>
              {bpsBar(tick.dropBps, tick.targetBps)}
            </>
          )}

          {tick.phase === "IN_POSITION_BNB" && (
            <>
              <div style={{ marginBottom: 4 }}>{`Рост: ${tick.riseBps}/${tick.targetBps} bps`}</div>
              {bpsBar(tick.riseBps, tick.targetBps)}
            </>
          )}

          <div style={{ marginTop: 6, fontSize: 12, opacity: 0.85 }}>{nextAction}</div>
          <div style={{ marginTop: 6, fontSize: 12, opacity: 0.85 }}>
            vaultUSDT: {tick.vaultUSDT} · vaultBNB: {tick.vaultBNB}
          </div>

          {lastExec && (
            <div style={{ marginTop: 8, fontSize: 12 }}>
              Последнее действие: <b>{lastExec.side}</b> — {lastExec.stage}
              {lastExec.tx ? <> · tx: <code>{lastExec.tx}</code></> : null}
            </div>
          )}
        </>
      ) : (
        <div style={{ fontSize: 12, opacity: .8 }}>Подключаемся к релейеру…</div>
      )}
    </div>
  );
}
