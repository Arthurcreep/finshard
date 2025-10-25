import React, { useEffect, useState } from "react";
import { useAutoDCA, deposit, trigger, withdrawAll } from "./useAutoDCA"; // если используешь JS-версию, поменяй на "./useAutoDCA"
import { ethers } from "ethers";


export default function MicroDcaPanel() {
    const { contract } = useAutoDCA();
    const [amount, setAmount] = useState("100");
    const [target, setTarget] = useState("CAKE");
    const [status, setStatus] = useState("");
    const [res, setRes] = useState(null);


    async function refresh() {
        if (!contract) return;
        const signer = contract.runner;
        const addr = await signer.getAddress();
        const r = await contract.getPosition(addr);
        setRes(r);
    }


    useEffect(() => { refresh(); }, [contract]);


    async function onDeposit() {
        if (!contract) return;
        setStatus("⏳ Отправляю транзакцию депозита...");
        try {
            await deposit(contract, amount, target);
            setStatus("✅ Депозит прошёл");
            await refresh();
        } catch (e) {
            setStatus("❌ Ошибка: " + (e?.message || String(e)));
        }
    }


    async function onTrigger() {
        if (!contract) return;
        setStatus("⏳ Тригерю стратегию...");
        try {
            const signer = contract.runner;
            const addr = await signer.getAddress();
            await trigger(contract, addr);
            setStatus("✅ Выполнено");
            await refresh();
        } catch (e) {
            setStatus("❌ Ошибка: " + (e?.message || String(e)));
        }
    }


    async function onWithdraw() {
        if (!contract) return;
        setStatus("⏳ Вывод USDT...");
        try {
            await withdrawAll(contract);
            setStatus("✅ Вывел USDT и закрыл позицию");
            await refresh();
        } catch (e) {
            setStatus("❌ Ошибка: " + (e?.message || String(e)));
        }
    }


    const pos = res?.pos;
}