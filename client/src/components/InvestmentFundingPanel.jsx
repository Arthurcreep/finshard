// src/components/InvestmentFundingPanel.jsx
import { useCallback, useMemo, useState } from "react";
import {
  useAccount,
  useChainId,
  usePublicClient,
  useWalletClient,
} from "wagmi";
import { erc20Abi, parseUnits, maxUint256 } from "viem";
import styles from "../styles/InvestmentCards.module.css";

const SAFEBOX_ABI = [
  { type: "function", name: "deposit", stateMutability: "nonpayable", inputs: [{ name: "amount", type: "uint256" }], outputs: [] },
];

function isAddress(addr) {
  return /^0x[a-fA-F0-9]{40}$/.test(String(addr || ""));
}
function prettyErr(e) {
  if (!e) return "Unknown error";
  return (
    e.shortMessage ||
    e.details ||
    e.reason ||
    e.message ||
    (typeof e === "string" ? e : JSON.stringify(e))
  );
}

export default function InvestmentFundingPanel({
  amountUsd,          // string | number (USDT, 18 dec)
  usdtAddress,        // USDT адрес
  usdtDecimals = 18,
  safeAddress,        // адрес твоего контракта (UsdtSafeboxV4)
  apiBase = "",
  onDone,
}) {
  const chainId = useChainId();
  const { address, isConnected } = useAccount();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [note, setNote] = useState("");

  const amountRaw = useMemo(() => {
    try {
      const val = String(amountUsd ?? "").trim();
      if (!val) return null;
      const parsed = parseUnits(val, usdtDecimals);
      if (parsed <= 0n) return null;
      return parsed;
    } catch {
      return null;
    }
  }, [amountUsd, usdtDecimals]);

  const disabled = useMemo(
    () =>
      !isConnected ||
      chainId !== 56 ||
      !isAddress(usdtAddress) ||
      !isAddress(safeAddress) ||
      amountRaw == null ||
      busy,
    [isConnected, chainId, usdtAddress, safeAddress, amountRaw, busy]
  );

  const doDeposit = useCallback(async () => {
    setErr("");
    setNote("");
    console.log("[Deposit] START", {
      address,
      chainId,
      usdtAddress,
      safeAddress,
      amountUsd,
      amountRaw: amountRaw?.toString?.(),
    });

    try {
      if (!isConnected) throw new Error("Wallet is not connected");
      if (chainId !== 56) throw new Error("Wrong chain. Switch to BNB Smart Chain (56).");
      if (!isAddress(usdtAddress)) throw new Error("Bad USDT address");
      if (!isAddress(safeAddress)) throw new Error("Bad Safe address");
      if (!publicClient) throw new Error("No publicClient");
      if (!walletClient) throw new Error("No walletClient");
      if (amountRaw == null) throw new Error("Invalid amount");

      setBusy(true);

      // 0) Баланс USDT
      console.log("[Deposit] read USDT balanceOf...");
      const bal = await publicClient.readContract({
        address: usdtAddress,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [address],
      });
      console.log("[Deposit] USDT balance =", bal.toString());
      if (bal < amountRaw) {
        throw new Error(
          `Not enough USDT. Need ${amountUsd}, have ${Number(bal) / 1e18} (raw=${bal}).`
        );
      }

      // 1) allowance
      console.log("[Deposit] read allowance...");
      let allowance = 0n;
      try {
        allowance = await publicClient.readContract({
          address: usdtAddress,
          abi: erc20Abi,
          functionName: "allowance",
          args: [address, safeAddress],
        });
      } catch (e) {
        console.warn("[Deposit] allowance read failed:", e);
        throw new Error("Failed to read allowance");
      }
      console.log("[Deposit] allowance =", allowance.toString());

      // 2) approve если нужно
      if (allowance < amountRaw) {
        // Пытаемся сразу выдать большой allowance (maxUint256)
        const approveTry = async (spender, value, label) => {
          console.log(`[Deposit] approve ${label} value=${value.toString()}`);
          const hash = await walletClient.writeContract({
            address: usdtAddress,
            abi: erc20Abi,
            functionName: "approve",
            args: [spender, value],
            account: address,
          });
          console.log("[Deposit] approve sent:", hash);
          const r = await publicClient.waitForTransactionReceipt({ hash });
          console.log("[Deposit] approve receipt:", {
            status: r.status,
            gasUsed: r.gasUsed?.toString?.(),
            blockNumber: r.blockNumber?.toString?.(),
          });
          if (r.status !== "success") throw new Error("Approve tx failed");
        };

        try {
          // основная попытка — сразу max
          await approveTry(safeAddress, maxUint256, "max");
        } catch (e1) {
          console.warn("[Deposit] approve(max) failed, try approve(0) then amount… reason:", prettyErr(e1));
          // некоторые токены требуют сначала обнулить
          try {
            await approveTry(safeAddress, 0n, "zero");
            await approveTry(safeAddress, amountRaw, "exact");
          } catch (e2) {
            console.error("[Deposit] approve(0→amount) failed:", e2);
            throw new Error(`Approve failed: ${prettyErr(e2)}`);
          }
        }
      } else {
        console.log("[Deposit] approve not required");
      }

      // 3) Предсимуляция deposit для читаемой причины ревёрта
      console.log("[Deposit] simulate deposit()…");
      let sim;
      try {
        sim = await publicClient.simulateContract({
          address: safeAddress,
          abi: SAFEBOX_ABI,
          functionName: "deposit",
          args: [amountRaw],
          account: address,
        });
        console.log("[Deposit] simulate OK. Suggested gas:", sim?.request?.gas);
      } catch (e) {
        console.error("[Deposit] simulate revert:", e);
        throw new Error(`Deposit simulate failed: ${prettyErr(e)}`);
      }

      // 4) Отправка deposit
      console.log("[Deposit] write deposit()…");
      let txHashDeposit;
      try {
        // можно отправить либо по simulate.request через walletClient, либо обычным writeContract
        txHashDeposit = await walletClient.writeContract({
          address: safeAddress,
          abi: SAFEBOX_ABI,
          functionName: "deposit",
          args: [amountRaw],
          account: address,
          // gas: sim?.request?.gas, // обычно кошелек сам выставит, но можно подставить
        });
        console.log("[Deposit] deposit sent:", txHashDeposit);
        setNote(`TX sent: ${txHashDeposit}`);
      } catch (e) {
        console.error("[Deposit] deposit send failed:", e);
        throw new Error(`Deposit failed: ${prettyErr(e)}`);
      }

      // 5) Ожидание квитанции
      try {
        const receipt = await publicClient.waitForTransactionReceipt({
          hash: txHashDeposit,
        });
        console.log("[Deposit] deposit receipt:", {
          status: receipt.status,
          gasUsed: receipt.gasUsed?.toString?.(),
          blockNumber: receipt.blockNumber?.toString?.(),
        });
        if (receipt.status !== "success") {
          throw new Error("Deposit tx failed");
        }
      } catch (e) {
        console.error("[Deposit] deposit wait failed:", e);
        throw new Error(`Deposit wait failed: ${prettyErr(e)}`);
      }

      console.log("[Deposit] ✅ success");
      setNote("✅ Deposit done");
      try {
        onDone?.();
      } catch {}
    } catch (e) {
      const msg = prettyErr(e);
      console.error("[Deposit] ❌ error:", msg, e);
      setErr(msg);
    } finally {
      setBusy(false);
    }
  }, [
    isConnected,
    chainId,
    usdtAddress,
    safeAddress,
    amountUsd,
    amountRaw,
    usdtDecimals,
    address,
    publicClient,
    walletClient,
    onDone,
  ]);

  return (
    <section className={styles.block}>
      <div className={styles.field}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <button
            type="button"
            className={`${styles.btn} ${styles.solid}`}
            onClick={doDeposit}
            disabled={disabled}
            title={
              !isConnected
                ? "Connect wallet"
                : chainId !== 56
                ? "Switch to BNB Smart Chain"
                : !amountRaw
                ? "Enter amount"
                : !isAddress(usdtAddress) || !isAddress(safeAddress)
                ? "Bad addresses"
                : busy
                ? "Processing…"
                : "Deposit"
            }
          >
            {busy ? "Processing…" : "Deposit USDT → Safe"}
          </button>

          <small className={styles.muted}>
            Approve + Simulate + Deposit. Network: BSC (56).
          </small>
        </div>

        {note ? (
          <div className={styles.note} style={{ marginTop: 6, color: "#16a34a" }}>
            {note}
          </div>
        ) : null}
        {err ? (
          <div className={styles.error} style={{ marginTop: 6, color: "#ef4444" }}>
            {err}
          </div>
        ) : null}
      </div>
    </section>
  );
}
