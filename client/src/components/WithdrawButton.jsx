import { useState } from "react";
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { api } from "../lib/api";

function buildDynamicAbi(fn, args) {
  // простейший конструктор ABI: адреса против чисел (uint256)
  const inputs = args.map(a =>
    typeof a === "string" && /^0x[a-fA-F0-9]{40}$/.test(a)
      ? { type: "address" }
      : { type: "uint256" }
  );
  return [{
    type: "function",
    name: fn,
    stateMutability: "nonpayable",
    inputs,
    outputs: [],
  }];
}

export default function WithdrawButton({ apiBase = "", safeboxAddress }) {
  const { address } = useAccount();
  const [err, setErr] = useState("");
  const { writeContractAsync, data: hash, isPending } = useWriteContract();
  const wait = useWaitForTransactionReceipt({ hash });

  async function onClick() {
    try {
      setErr("");
      if (!address) throw new Error("Подключите кошелёк");
      if (!safeboxAddress) throw new Error("Не задан адрес сейфа");

      // 1) узнаём у сервера, какой метод дергать
      const info = await api(`${apiBase}/api/relayer/withdraw`, {
        method: "POST",
        body: JSON.stringify({ user: address, contract: safeboxAddress }),
      });

      if (!info?.ok || !info.fn || !Array.isArray(info.args)) {
        throw new Error("Server didn't return a callable method");
      }

      // 2) вызываем контракт из кошелька пользователя (правильный msg.sender)
      const abi = buildDynamicAbi(info.fn, info.args);
      const args = info.args.map(a => (/^\d+$/.test(a) ? BigInt(a) : a));

      await writeContractAsync({
        abi,
        address: safeboxAddress,
        functionName: info.fn,
        args,
      });

      await wait.refetch();
    } catch (e) {
      setErr(String(e?.message || e));
    }
  }

  return (
    <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
      <button onClick={onClick} disabled={isPending}>
        {isPending ? "Вывод…" : "Вывести средства"}
      </button>
      {hash ? <small style={{ wordBreak: "break-all" }}>TX: {hash}</small> : null}
      {err ? <small style={{ color: "#ef4444" }}>{err}</small> : null}
    </div>
  );
}
