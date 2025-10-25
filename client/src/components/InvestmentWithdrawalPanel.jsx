// src/components/InvestmentWithdrawalPanel.jsx
import { useMemo, useState, useCallback } from "react";
import { useAccount, useChainId, useSwitchChain, useWalletClient } from "wagmi";
import { encodeFunctionData } from "viem";
import styles from "../styles/InvestmentCards.module.css";

// 👇 лайв-статус релейера
import { useRelayerSSE } from "../hook/useRelayerSSE";
import RelayerLiveStatus from "./RelayerLiveStatus";

const ABI_WITHDRAW_1 = [
  { type: "function", name: "withdraw", stateMutability: "nonpayable",
    inputs: [{ name: "amount", type: "uint256" }], outputs: [] }
];
const ABI_WITHDRAW_2 = [
  { type: "function", name: "withdraw", stateMutability: "nonpayable",
    inputs: [{ name: "to", type: "address" }, { name: "amount", type: "uint256" }], outputs: [] }
];

function isAddr(v) { return /^0x[a-fA-F0-9]{40}$/.test(String(v || "")); }

export default function InvestmentWithdrawalPanel({
  safeAddress,
  usdtDecimals = 18,
  allowWithdrawTo = true,
  defaultToAddress = "",
  apiBase = "",              // базовый URL бэка (можно не передавать, при Vite proxy пустая строка ок)
  onDone,
}) {
  const { address } = useAccount();
  const chainId = useChainId();
  const { switchChainAsync } = useSwitchChain();
  const { data: wallet } = useWalletClient();

  const [amount, setAmount] = useState("");
  const [toAddr, setToAddr] = useState(defaultToAddress || "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [log, setLog] = useState("");
  const [ok, setOk] = useState(false);

  // hint от бэка: когда позиция в BNB и нужно сделать ребаунд
  const [serverHint, setServerHint] = useState(null);

  // 👇 подключаемся к SSE и получаем live tick/exec для UI
  const { tick, lastExec } = useRelayerSSE({ apiBase, user: address });

  const joinUrl = useCallback((base, path) => {
    const b = String(base || "").replace(/\/+$/, "");
    const p = String(path || "").replace(/^\/+/, "");
    return b ? `${b}/${p}` : `/${p}`;
  }, []);

  const needBsc = chainId !== 56;

  const amountRaw = useMemo(() => {
    try {
      if (!amount) return null;
      const [intP, fracP = ""] = String(amount).split(".");
      const frac = (fracP + "0".repeat(usdtDecimals)).slice(0, usdtDecimals);
      return BigInt(intP || "0") * (10n ** BigInt(usdtDecimals)) + BigInt(frac || "0");
    } catch {
      return null;
    }
  }, [amount, usdtDecimals]);

  async function handleSwitchToBsc() {
    try {
      setErr(""); setLog("Switching to BSC (56)...");
      await switchChainAsync?.({ chainId: 56 });
      setLog("Switched to BSC.");
    } catch (e) {
      setErr(`Не удалось переключить сеть: ${e?.message || e}`);
    }
  }

  async function handleWithdraw(e) {
    e?.preventDefault?.();
    setErr(""); setLog(""); setOk(false); setServerHint(null);

    if (!address) { setErr("Подключите кошелёк"); return; }
    if (!safeAddress || !isAddr(safeAddress)) { setErr("Не задан адрес сейфа"); return; }
    if (needBsc) { setErr("Нужна сеть BSC (56)"); return; }
    if (!amountRaw || amountRaw <= 0n) { setErr("Введите сумму вывода"); return; }
    if (!wallet) { setErr("Нет walletClient"); return; }

    const dest = (allowWithdrawTo && toAddr) ? toAddr : address;
    if (allowWithdrawTo && toAddr && !isAddr(dest)) { setErr("Неверный адрес получателя"); return; }

    try {
      setBusy(true);

      // 1) симуляция на бэке
      const url = joinUrl(apiBase, "api/withdraw/simulate");
      const r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ user: address, contract: safeAddress }),
      });

      // безопасный парсинг тела даже при 400
      let payload = {};
      try { payload = await r.clone().json(); } catch {}

      if (!r.ok || payload?.ok !== true) {
        if (payload?.next === "rebound_required" && payload?.hint) {
          setServerHint(payload.hint); // { side, endpoint, body, note }
          setErr("Позиция в BNB. Сначала обменяем BNB → USDT (ребаунд), затем можно выводить.");
        } else {
          setErr(payload?.error || `${r.status} ${r.statusText || ""}`.trim());
        }
        return;
      }

      // 2) формируем calldata
      const { fn, args } = payload;
      if (!fn || !Array.isArray(args)) { setErr("Некорректный ответ simulate"); return; }

      let data;
      if (args.length === 1) {
        data = encodeFunctionData({ abi: ABI_WITHDRAW_1, functionName: "withdraw", args: [amountRaw] });
      } else if (args.length === 2) {
        data = encodeFunctionData({ abi: ABI_WITHDRAW_2, functionName: "withdraw", args: [dest, amountRaw] });
      } else {
        setErr("Неизвестная сигнатура withdraw");
        return;
      }

      // 3) отправка транзакции
      setLog("Подписываем транзакцию...");
      const hash = await wallet.sendTransaction({ to: safeAddress, data, value: 0n });
      setLog(`tx: ${hash}`);
      setLog("Вывод отправлен. Ожидайте подтверждения.");
      setOk(true);
      onDone?.();
    } catch (e) {
      setErr(String(e?.message || e));
      console.warn("[withdraw] error:", e);
    } finally {
      setBusy(false);
    }
  }

  async function handleForceRebound() {
    if (!serverHint?.endpoint || !serverHint?.body) return;
    try {
      setBusy(true); setErr(""); setLog(""); setOk(false);
      const url = joinUrl(apiBase, serverHint.endpoint);
      const r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(serverHint.body),
      });
      const j = await r.json().catch(() => ({}));

      if (!r.ok || j?.ok === false) {
        setErr(j?.error || j?.note || "Ребаунд не выполнен");
        return;
      }
      setLog(`Ребаунд отправлен. tx: ${j?.hash || "(см. бэк)"}`);
      setOk(true);
    } catch (e) {
      setErr(String(e?.message || e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={styles.block} style={{ borderTop: "1px solid #eee" }}>
      <div className={styles.field} style={{ marginBottom: 8 }}>
        <span>Withdraw (USDT)</span>
      </div>

      {needBsc && (
        <div className={styles.error} style={{ marginBottom: 8 }}>
          Вы в сети ChainId {chainId}. Нужна сеть <b>BSC (56)</b>.{" "}
          <button className={styles.btn} onClick={handleSwitchToBsc} style={{ marginLeft: 8 }}>
            Переключить сеть
          </button>
        </div>
      )}

      <div className={styles.field}>
        <span>Amount</span>
        <input
          type="number" min="0" step="0.01"
          value={amount} onChange={(e) => setAmount(e.target.value)}
          placeholder="10"
        />
      </div>

      {allowWithdrawTo && (
        <div className={styles.field}>
          <span>To address</span>
          <input
            type="text"
            value={toAddr}
            onChange={(e) => setToAddr(e.target.value)}
            placeholder={address || "0x..."}
          />
        </div>
      )}

      {log ? <div className={styles.note} style={{ color: "#22c55e", marginTop: 8 }}>{log}</div> : null}
      {err ? <div className={styles.error} style={{ color: "#ef4444", marginTop: 8 }}>{err}</div> : null}
      {ok ? <div className={styles.note} style={{ color: "#16a34a", marginTop: 8 }}>Готово</div> : null}

      {/* Если бэк сказал, что нужно ребаундить — показываем подсказку и кнопку */}
      {serverHint && (
        <div style={{ marginTop: 10, padding: 10, border: "1px solid #e5e7eb", borderRadius: 10 }}>
          <div style={{ fontSize: 12, marginBottom: 8, opacity: 0.9 }}>
            {serverHint.note || "Позиция в BNB — сначала обменяем BNB обратно в USDT, затем можно выводить."}
          </div>
          <button
            type="button"
            onClick={handleForceRebound}
            disabled={busy}
            className={`${styles.btn} ${styles.solid}`}
          >
            Сделать ребаунд (SELL)
          </button>
        </div>
      )}

      <div className={styles.modalActions} style={{ marginTop: 10 }}>
        <button
          className={`${styles.btn} ${styles.ghost}`}
          onClick={handleWithdraw}
          disabled={busy || needBsc}
          type="button"
        >
          {busy ? "Withdrawing..." : "Withdraw"}
        </button>
      </div>

      {/* 👇 лайв-статус релейера прямо под кнопкой */}
      <RelayerLiveStatus tick={tick} lastExec={lastExec} />
    </section>
  );
}
