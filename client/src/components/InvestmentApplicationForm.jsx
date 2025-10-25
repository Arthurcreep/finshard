// src/components/InvestmentApplicationForm.jsx
import { useMemo, useState, useEffect, useRef } from "react";
import styles from "../styles/InvestmentCards.module.css";
import {
  useAccount,
  useChainId,
  useSignMessage,
  useSendTransaction,
  useReadContract,
} from "wagmi";
import { erc20Abi, formatUnits } from "viem";
import { useTranslation } from "react-i18next";
import InvestmentFundingPanel from "./InvestmentFundingPanel";
import InvestmentWithdrawalPanel from "./InvestmentWithdrawalPanel";

/* ---------- feature flag ---------- */
// Положи в .env.local: VITE_RELAYER_ENABLED=0 (по умолчанию выключен)
const RELAYER_ENABLED = (import.meta.env.VITE_RELAYER_ENABLED === "1");

/* ---------- consts ---------- */

const USDT_BY_CHAIN = {
  56: {
    address: "0x55d398326f99059fF775485246999027B3197955",
    decimals: 18,
    symbol: "USDT",
  }, // BSC
};

const CHAIN_NAME = {
  56: "BNB Smart Chain",
  97: "BSC Testnet",
  1: "Ethereum",
  42161: "Arbitrum",
  137: "Polygon",
};

const PRESET_TOKENS_BSC = [
  { kind: "BNB", label: "BNB (native)", value: "BNB" },
  { kind: "CAKE", label: "CAKE", value: "0x0E09FABB73Bd3Ade0a17ECC321fD13a19e81cE82" },
  { kind: "custom", label: "Custom (ERC-20 address)", value: "custom" },
];

/* ---------- icons ---------- */
function IconNetwork() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden>
      <path d="M12 2l9 5v10l-9 5-9-5V7l9-5zm0 2.2L5 7v10l7 3.9L19 17V7l-7-2.8zM7 9l5 2.8 5-2.8" fill="currentColor" opacity=".4" />
      <path d="M7 12l5 2.8 5-2.8" fill="currentColor" />
    </svg>
  );
}
function IconUSDT() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden>
      <circle cx="12" cy="12" r="10" fill="currentColor" opacity=".12" />
      <path d="M7 7h10v2h-4v2.2c2.9.2 5 .8 5 1.6 0 .9-3.1 1.6-7 1.6s-7-.7-7-1.6c0-.8 2.1-1.4 5-1.6V9H7V7z" fill="currentColor" />
    </svg>
  );
}
function IconTarget() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" fill="none" opacity=".3" />
      <circle cx="12" cy="12" r="5" stroke="currentColor" fill="none" opacity=".6" />
      <circle cx="12" cy="12" r="2" fill="currentColor" />
    </svg>
  );
}

/* ---------- helpers ---------- */

function short(addr) {
  return String(addr).slice(0, 6) + "…" + String(addr).slice(-4);
}
function utf8ToHex(str) {
  const bytes = new TextEncoder().encode(str);
  let hex = "0x";
  for (const b of bytes) hex += b.toString(16).padStart(2, "0");
  return hex;
}
function normalizeErr(e) {
  const msg = String(e?.shortMessage || e?.message || e || "");
  return msg.replace(/^Error:\s*/i, "");
}
function buildHumanReadableMessage(p, lng = "en") {
  if (lng === "ru") {
    return [
      "Инвестиционная заявка",
      `Продукт: ${p.product}`,
      `Сумма (USD): ${p.amountUsd}`,
      `Актив: ${p.investAsset}`,
      `Адрес: ${p.address}`,
      `ChainId: ${p.chainId}`,
      `Срок (дней): ${p.termDays}`,
      `Время: ${new Date(p.ts).toISOString()}`,
      `Nonce: ${p.nonce}`,
    ].join("\n");
  }
  return [
    "Investment Application",
    `Product: ${p.product}`,
    `Amount (USD): ${p.amountUsd}`,
    `Invest Asset: ${p.investAsset}`,
    `Address: ${p.address}`,
    `ChainId: ${p.chainId}`,
    `TermDays: ${p.termDays}`,
    `Timestamp: ${new Date(p.ts).toISOString()}`,
    `Nonce: ${p.nonce}`,
  ].join("\n");
}
function normalizeAssetKind(v) {
  const x = String(v || "").toUpperCase();
  if (x === "BNB") return "BNB";
  if (x === "CAKE") return "CAKE";
  return null;
}
const joinUrl = (base, path) => {
  const b = String(base || "").replace(/\/+$/, "");
  const p = String(path || "").replace(/^\/+/, "");
  return b ? `${b}/${p}` : `/${p}`;
};

/* ---------- component ---------- */

export default function InvestmentApplicationForm({
  product,
  onCancel,
  onDone,
  onSubmitApplication,
}) {
  const { t, i18n } = useTranslation();
  const { address, isConnected } = useAccount();
  const chainId = useChainId();

  const { signMessageAsync } = useSignMessage();
  const { sendTransactionAsync } = useSendTransaction();

  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [info, setInfo] = useState("");

  const [tokenChoice, setTokenChoice] = useState("BNB");
  const [customToken, setCustomToken] = useState("");

  const [refreshTick, setRefreshTick] = useState(0);
  const bump = () => setRefreshTick((x) => x + 1);

  const TERM_DAYS = 180;
  const chainName = CHAIN_NAME[chainId] || `Chain ID ${chainId}`;
  const usdtMeta = USDT_BY_CHAIN[chainId];

  const SAFE_CONTRACT =
    (import.meta.env.VITE_SAFE_CONTRACT || "").trim() ||
    "0x805b43EA0B7f3F19Ec462A5b2F99c81c80d3aceD" ||
    "0xe67e0e2b9ec606c0f05c4bcca601de5b6d33acef";

  // Относительные пути → Vite proxy
  const API_BASE = "";
  const RPC_URL = (import.meta.env.VITE_RPC_URL || "").trim();

  // баланс USDT
  const { data: usdtBalanceRaw, refetch: refetchUsdt } = useReadContract({
    abi: erc20Abi,
    address: usdtMeta?.address,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: Boolean(address && usdtMeta?.address) },
  });
  const usdtBalance = useMemo(() => {
    try {
      if (!usdtBalanceRaw || !usdtMeta) return null;
      return Number(formatUnits(usdtBalanceRaw, usdtMeta.decimals));
    } catch {
      return null;
    }
  }, [usdtBalanceRaw, usdtMeta]);

  const TX_TO = (import.meta.env.VITE_TX_TO || "").trim();
  const TX_CHAIN = Number(import.meta.env.VITE_TX_CHAIN_ID || 0) || 0;

  /* ---------- auto-ensure релейера: одна попытка; флаг/авария → молчим ---------- */
  const [relayerDown, setRelayerDown] = useState(!RELAYER_ENABLED);
  const ensuredRef = useRef({ addr: "", done: false });
  useEffect(() => {
    async function ensure() {
      if (!RELAYER_ENABLED) return;          // флаг выключен — не трогаем бэк
      if (!address || relayerDown) return;
      if (ensuredRef.current.addr === address && ensuredRef.current.done) return;
      ensuredRef.current = { addr: address, done: true };

      try {
        const url = joinUrl(API_BASE, "api/relayer/ensure");
        const body = { user: address, assetKind: "BNB", contract: SAFE_CONTRACT };
        const r = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(body),
        });
        if (!r.ok) { setRelayerDown(true); return; }
      } catch {
        setRelayerDown(true);
        ensuredRef.current.done = false;
      }
    }
    ensure();
  }, [address, API_BASE, SAFE_CONTRACT, relayerDown]);

  async function handleSubmit(e) {
    e.preventDefault();
    setErr(""); setInfo("");

    if (!isConnected) { setErr(t("inv.form.connectWallet")); return; }

    const amountUsd = Number(amount);
    if (!Number.isFinite(amountUsd) || amountUsd <= 0) {
      setErr(t("inv.form.invalidAmount", "Invalid amount"));
      return;
    }

    // целевой актив
    let investAsset = "BNB";
    if (tokenChoice === "CAKE") investAsset = "CAKE";
    else if (tokenChoice === "custom") {
      const v = customToken.trim();
      if (!/^0x[a-fA-F0-9]{40}$/.test(v)) {
        setErr(t("inv.form.invalidCustomToken", "A valid ERC-20 address is required for Custom token"));
        return;
      }
      investAsset = v;
    }

    setBusy(true);
    try {
      const payload = {
        product,
        amountUsd,
        investAsset,
        chainId,
        address,
        ts: Date.now(),
        termDays: TERM_DAYS,
        nonce: Math.random().toString(36).slice(2),
      };
      const message = buildHumanReadableMessage(payload, i18n.language);
      const signature = await signMessageAsync({ message });

      let txHash = null;
      if (TX_TO) {
        if (TX_CHAIN && TX_CHAIN !== chainId) throw new Error(`Нужна сеть chainId=${TX_CHAIN}`);
        const memoHex = utf8ToHex(JSON.stringify(payload));
        const hash = await sendTransactionAsync({ to: TX_TO, value: 0n, data: memoHex });
        txHash = String(hash);
      }

      // 1) сохранить заявку — не критично к ответу
      try {
        const url = joinUrl(API_BASE, "api/applications/create");
        await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ ...payload, message, signature, txHash }),
        }).catch(() => {});
      } catch {}

      // 2) автозапуск релейера (BNB/CAKE), только если включён и не «упал»
      const assetKind = normalizeAssetKind(investAsset);
      if (assetKind && !relayerDown && RELAYER_ENABLED) {
        try {
          const url = joinUrl(API_BASE, "api/relayer/start");
          const body = {
            user: address,
            assetKind,
            slippageBps: 50,
            pollMs: 15000,
            gasLimit: 1_200_000,
            deadlineMin: 10,
            contract: SAFE_CONTRACT,
          };
          if (RPC_URL) body.rpcUrl = RPC_URL;

          const r = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify(body),
          });
          if (r.ok) setInfo("Auto-relayer started");
          else setInfo("");
        } catch { setInfo(""); }
      } else if (!assetKind) {
        setInfo("Relayer not started (custom token selected)");
      }

      try { await onSubmitApplication?.({ ...payload, message, signature, txHash }); } catch {}
      onDone?.();
    } catch (e) {
      setErr(normalizeErr(e));
    } finally {
      setBusy(false);
    }
  }

  async function handlePanelsDone() {
    try { await refetchUsdt?.(); } catch {}
    bump();
  }

  return (
    <form onSubmit={handleSubmit} className={styles.form} aria-label={t("inv.application")}>
      {/* Верхний инфо-блок */}
      <section className={styles.infoRow}>
        <div className={styles.infoCard}>
          <div className={styles.infoHead}><IconNetwork /><span>{t("inv.form.network", "Network")}</span></div>
          <div className={styles.infoMain}>{chainName}</div>
          <div className={styles.infoSub}>{t("inv.form.workBscUsdt", "Works on BSC, settlement in USDT")}</div>
        </div>
        <div className={styles.infoCard}>
          <div className={styles.infoHead}><IconTarget /><span>{t("inv.form.term", "Term")}</span></div>
          <div className={styles.infoMain}>{TERM_DAYS} {t("inv.form.days", "days")}</div>
          <div className={styles.infoSub}>{t("inv.moderate.sub")}</div>
        </div>
        <div className={styles.infoCard}>
          <div className={styles.infoHead}><IconUSDT /><span>USDT</span></div>
          <div className={styles.infoMain}>
            {usdtMeta ? (usdtBalance == null ? "—" :
              `${usdtBalance.toLocaleString(undefined, { maximumFractionDigits: 6 })}`) : "—"}
          </div>
          <div className={styles.infoSub}>
            {usdtMeta?.symbol || "—"} {usdtMeta?.address ? `· ${short(usdtMeta.address)}` : ""}
          </div>
        </div>
      </section>

      <div className={styles.hr} />

      {/* Депозит */}
      <InvestmentFundingPanel
        key={`fund-${refreshTick}`}
        amountUsd={amount}
        usdtAddress={usdtMeta?.address}
        usdtDecimals={usdtMeta?.decimals ?? 18}
        safeAddress={SAFE_CONTRACT}
        apiBase={API_BASE}
        onDone={handlePanelsDone}
      />

      {/* Вывод средств */}
      <InvestmentWithdrawalPanel
        key={`with-${refreshTick}`}
        safeAddress={SAFE_CONTRACT}
        usdtDecimals={usdtMeta?.decimals ?? 18}
        onDone={handlePanelsDone}
        allowWithdrawTo={true}
        defaultToAddress={address || ""}
        apiBase={API_BASE}
        relayerDown={relayerDown} // ← важное: блокируем, если релейер недоступен/выключен
      />

      {/* Сумма заявки */}
      <section className={styles.block}>
        <label className={styles.field}>
          <span>{t("inv.form.amount", "Amount, USD")}</span>
          <div className={styles.amountRow}>
            <input
              type="number" min="0" step="0.01" required
              value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="1000"
            />
            <button
              type="button" className={styles.maxBtn}
              onClick={() => { if (usdtBalance != null) setAmount(String(Math.max(0, usdtBalance))); }}
              disabled={usdtBalance == null}
              title={t("inv.form.fillBalance", "Fill with balance")}
            >
              MAX
            </button>
          </div>
          <small className={styles.muted}>
            {t("inv.form.swapNote", "Deposit in USDT; BNB/CAKE swaps via 1inch. Redemption always in USDT.")}
          </small>
        </label>
      </section>

      {/* Таргет-актив */}
      <section className={styles.block}>
        <label className={styles.field}>
          <span>{t("inv.form.targetAsset", "Target asset")}</span>
          <div className={styles.tokenPills}>
            {PRESET_TOKENS_BSC.map((opt) => (
              <button
                key={opt.value}
                type="button"
                className={`${styles.pill} ${tokenChoice === opt.kind ? styles.pillActive : ""}`}
                onClick={() => setTokenChoice(opt.kind)}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </label>

        {tokenChoice === "custom" && (
          <label className={styles.field}>
            <span>{t("inv.form.erc20Address", "ERC-20 address")}</span>
            <input type="text" value={customToken} onChange={(e) => setCustomToken(e.target.value)} placeholder="0x…" />
          </label>
        )}
      </section>

      {info ? <div className={styles.note} style={{ color: "#22c55e", marginBottom: 8 }}>{info}</div> : null}
      {err ? <div className={styles.error} style={{ color: "#ef4444" }}>{err}</div> : null}

      <div className={styles.modalActions}>
        <button type="submit" className={`${styles.btn} ${styles.solid}`} disabled={busy}>
          {busy ? t("inv.form.signing") : t("inv.apply")}
        </button>
        <button type="button" className={`${styles.btn} ${styles.ghost}`} onClick={onCancel} disabled={busy}>
          {t("inv.form.cancel")}
        </button>
      </div>
    </form>
  );
}
