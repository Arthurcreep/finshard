import React, { useMemo, useState } from "react";
import { useTokenMeta, useVaultV2, useVaultV3, fmt } from "./useEcho";

// Компонент универсален: по умолчанию работает как V2.
// Передай prop isV3={true} если контракт — V3.
export default function EchoPanel({ isV3 = false }) {
    const [amount, setAmount] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");

    const meta = useTokenMeta();
    const v2 = useVaultV2();
    const v3 = useVaultV3();

    const decimals = meta.decimals ?? 18;
    const allowance = meta.allowance;
    const wallet = meta.walletBalance;
    const vault = meta.vaultBalance;

    const needsApprove = useMemo(() => {
        try {
            if (!amount) return false;
            const parsed = v2.parseUnits(String(amount), decimals);
            return allowance ? (BigInt(allowance) < BigInt(parsed)) : true;
        } catch {
            return true;
        }
    }, [amount, allowance, decimals, v2]);

    const onApprove = async () => {
        setBusy(true); setError("");
        try {
            if (!amount) throw new Error("Введите сумму");
            const parsed = v2.parseUnits(String(amount), decimals);
            if (BigInt(allowance ?? 0n) < parsed) {
                setError('Недостаточно allowance для депозита. Нажми Approve на нужную сумму.');
                setBusy(false);
                return;
            }
            await v2.approve(parsed);
            await meta.refetchAllowance?.();
        } catch (e) {
            setError(e?.message || String(e));
        } finally { setBusy(false); }
    };

    const onDeposit = async () => {
        setBusy(true); setError("");
        try {
            if (!amount) throw new Error("Введите сумму");
            const parsed = v2.parseUnits(String(amount), decimals);
            if (isV3) {
                await v3.deposit(parsed); // V3 ABI
            } else {
                await v2.deposit(parsed); // V2 ABI
            }
            await meta.refetchVaultBalance?.();
        } catch (e) {
            setError(e?.message || String(e));
        } finally { setBusy(false); }
    };

    return (
        <div className="w-full max-w-xl mx-auto space-y-4">
            <div className="p-4 rounded-2xl shadow border">
                <div className="flex items-center justify-between">
                    <h2 className="text-xl font-semibold">USDT Safebox {isV3 ? "V3" : "V2"}</h2>
                    <span className={`text-xs px-2 py-1 rounded ${isV3 ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-700"}`}>
                        {isV3 ? "V3-фичи: да" : "V3-фичи: нет"}
                    </span>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                    <div className="p-3 rounded bg-slate-50">
                        <div className="text-slate-500">В кошельке</div>
                        <div className="font-medium">{fmt(wallet, decimals)} USDT</div>
                    </div>
                    <div className="p-3 rounded bg-slate-50">
                        <div className="text-slate-500">Allowance → Safebox</div>
                        <div className="font-medium">{fmt(allowance, decimals)} USDT</div>
                    </div>
                    <div className="p-3 rounded bg-slate-50 col-span-2">
                        <div className="text-slate-500">В сейфе</div>
                        <div className="font-medium">{fmt(vault, decimals)} USDT</div>
                    </div>
                </div>
                <div className="mt-4">
                    <label className="text-sm text-slate-600">Сумма депозита (USDT)</label>
                    <input
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        placeholder="0.0"
                        className="mt-1 w-full rounded-xl border px-3 py-2 focus:outline-none focus:ring"
                        inputMode="decimal"
                    />
                </div>
                {error && (
                    <div className="mt-3 text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl p-2">
                        {error}
                    </div>
                )}
                <div className="mt-4 flex gap-3">
                    <button
                        onClick={onApprove}
                        disabled={busy || !needsApprove}
                        className={`px-4 py-2 rounded-xl border shadow ${busy || !needsApprove ? "opacity-50 cursor-not-allowed" : "hover:bg-slate-50"}`}
                    >
                        Approve
                    </button>
                    <button
                        onClick={onDeposit}
                        disabled={busy}
                        className={`px-4 py-2 rounded-xl text-white ${busy ? "bg-slate-400" : "bg-indigo-600 hover:bg-indigo-700"}`}
                    >
                        Deposit
                    </button>
                </div>
                {isV3 && (
                    <div className="mt-3 text-xs text-slate-500">
                        V3-логика (baseline/reset) живёт вне этого компонента; здесь используется только V3-ABI для депозита.
                    </div>
                )}
            </div>
        </div>
    );
}
