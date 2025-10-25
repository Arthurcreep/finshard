import { useEffect, useState, useCallback, useRef } from 'react';
import {
    useAccount,
    usePublicClient,
    useWriteContract,
    useSwitchChain,
    useWalletClient,
} from 'wagmi';
import { environment, CHAIN_ID } from '../wallet/config';
import { isAddress, getAddress, formatUnits, parseUnits } from 'viem';

// ===== ABIs =====
const erc20Abi = [
    { constant: true, inputs: [{ name: '_owner', type: 'address' }], name: 'balanceOf', outputs: [{ name: 'balance', type: 'uint256' }], stateMutability: 'view', type: 'function' },
    { constant: true, inputs: [{ name: '_owner', type: 'address' }, { name: '_spender', type: 'address' }], name: 'allowance', outputs: [{ name: 'remaining', type: 'uint256' }], stateMutability: 'view', type: 'function' },
    { constant: false, inputs: [{ name: '_spender', type: 'address' }, { name: '_value', type: 'uint256' }], name: 'approve', outputs: [{ name: 'success', type: 'bool' }], stateMutability: 'nonpayable', type: 'function' },
];

const btcUsdFeedAbi = [
    { inputs: [], name: 'latestRoundData', outputs: [{ name: 'roundId', type: 'uint80' }, { name: 'answer', type: 'int256' }, { name: 'startedAt', type: 'uint256' }, { name: 'updatedAt', type: 'uint256' }, { name: 'answeredInRound', type: 'uint80' }], stateMutability: 'view', type: 'function' },
    { inputs: [], name: 'decimals', outputs: [{ name: '', type: 'uint8' }], stateMutability: 'view', type: 'function' },
];

const v3Abi = [
    { inputs: [], name: 'DROP_BPS', outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view', type: 'function' },
    { inputs: [{ name: 'account', type: 'address' }], name: 'balances', outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view', type: 'function' },
    { inputs: [], name: 'totalUsdt', outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view', type: 'function' },

    // ВАЖНО: правильные типы
    { inputs: [{ name: 'account', type: 'address' }], name: 'baselineOf', outputs: [{ name: 'price', type: 'int256' }, { name: 'setAt', type: 'uint64' }], stateMutability: 'view', type: 'function' },

    { inputs: [], name: 'resetBaseline', outputs: [], stateMutability: 'nonpayable', type: 'function' },
    { inputs: [{ name: 'amount', type: 'uint256' }], name: 'deposit', outputs: [], stateMutability: 'nonpayable', type: 'function' },
    { inputs: [{ name: 'amount', type: 'uint256' }], name: 'withdraw', outputs: [], stateMutability: 'nonpayable', type: 'function' },
    { inputs: [{ name: 'amount', type: 'uint256' }, { name: 'minOut', type: 'uint256' }, { name: 'deadline', type: 'uint256' }], name: 'swapUsdtToBNB', outputs: [], stateMutability: 'nonpayable', type: 'function' },
    { inputs: [{ name: 'amount', type: 'uint256' }, { name: 'minOut', type: 'uint256' }, { name: 'deadline', type: 'uint256' }], name: 'swapUsdtToCAKE', outputs: [], stateMutability: 'nonpayable', type: 'function' },
    { inputs: [{ name: 'amount', type: 'uint256' }], name: 'previewUsdtToBNB', outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view', type: 'function' },
    { inputs: [{ name: 'amount', type: 'uint256' }], name: 'previewUsdtToCAKE', outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view', type: 'function' },
];

// ===== Consts =====
const CAKE_ADDRESS = '0x0E09FABB73BD3ADE0A17ECC321FD13A19E81CE82'; // BSC mainnet
const BTC_USD_FEED = '0x264990fbd0A4796A3E3d8E37C4d5F87a3aCa5Ebf'; // BSC mainnet, 8 decimals
const DROP_BPS = 50;        // 0.50% триггер
const SLIPPAGE_BPS = 50;    // 0.50% защита
const POLL_MS = 10000;      // 10 секунд

export default function AutoDropPanel() {
    const { address, chainId } = useAccount();
    const { data: walletClient } = useWalletClient();
    const publicClient = usePublicClient({ chainId: CHAIN_ID });
    const { writeContractAsync } = useWriteContract();
    const { switchChain } = useSwitchChain();

    // onchain/state
    const contractAddress = getAddress(environment.DCA_CONTRACT_ADDRESS);
    const usdtAddress = getAddress(environment.USDT_ADDRESS);

    // ui state
    const [isV3, setIsV3] = useState(false);
    const [allowance, setAllowance] = useState('0');
    const [vaultBalance, setVaultBalance] = useState('0');
    const [totalUsdt, setTotalUsdt] = useState('0');
    const [usdtBalance, setUsdtBalance] = useState('0');
    const [currentBtcPrice, setCurrentBtcPrice] = useState(null);

    // user inputs
    const [depositAmount, setDepositAmount] = useState('');
    const [withdrawAmount, setWithdrawAmount] = useState('');
    const [selectedAsset, setSelectedAsset] = useState('BNB');

    // fixed baseline snapshot (from chain) + derived trigger
    const [baseline, setBaseline] = useState(null);              // [price(int256), setAt(uint64)]
    const [triggerPrice, setTriggerPrice] = useState(null);      // число (string), НЕ меняется
    const [autoMode, setAutoMode] = useState(false);             // включается после депозита
    const [isSwapping, setIsSwapping] = useState(false);
    const [lastSwap, setLastSwap] = useState(null);              // {hash, asset, expectedOut, actualDelta}

    const autoPollRef = useRef(null);

    // ===== Helpers =====
    const waitForWalletClient = async () => {
        if (!walletClient) {
            for (let i = 0; i < 5; i++) {
                await new Promise(r => setTimeout(r, 1000));
                if (walletClient) return walletClient;
            }
            throw new Error('Wallet client not ready. Reconnect wallet.');
        }
        return walletClient;
    };

    const fetchCurrentBtcPrice = useCallback(async () => {
        try {
            const [round, decimals] = await Promise.all([
                publicClient.readContract({ address: BTC_USD_FEED, abi: btcUsdFeedAbi, functionName: 'latestRoundData' }),
                publicClient.readContract({ address: BTC_USD_FEED, abi: btcUsdFeedAbi, functionName: 'decimals' }),
            ]);
            setCurrentBtcPrice(formatUnits(round[1], decimals));
        } catch (e) {
            // не ломаем UI, просто убираем цену
            setCurrentBtcPrice(null);
        }
    }, [publicClient]);

    const refetchAllowance = useCallback(async () => {
        if (!address) return;
        try {
            const res = await publicClient.readContract({ address: usdtAddress, abi: erc20Abi, functionName: 'allowance', args: [getAddress(address), contractAddress] });
            setAllowance(formatUnits(res, 18));
        } catch {
            setAllowance('0');
        }
    }, [address, publicClient, usdtAddress, contractAddress]);

    const refetchVaultBalance = useCallback(async () => {
        if (!address) return;
        try {
            const res = await publicClient.readContract({ address: contractAddress, abi: v3Abi, functionName: 'balances', args: [getAddress(address)] });
            setVaultBalance(formatUnits(res, 18));
        } catch {
            setVaultBalance('0');
        }
    }, [address, publicClient, contractAddress]);

    const refetchUsdtBalance = useCallback(async () => {
        if (!address) return;
        try {
            const res = await publicClient.readContract({ address: usdtAddress, abi: erc20Abi, functionName: 'balanceOf', args: [getAddress(address)] });
            setUsdtBalance(formatUnits(res, 18));
        } catch {
            setUsdtBalance('0');
        }
    }, [address, publicClient, usdtAddress]);

    const fetchBaseline = useCallback(async () => {
        if (!address || !isV3) return setBaseline(null);
        try {
            const res = await publicClient.readContract({ address: contractAddress, abi: v3Abi, functionName: 'baselineOf', args: [getAddress(address)] });
            setBaseline(res);
            if (res && res[0] !== 0n) {
                // фиксируем триггер один раз от baseline и больше его не трогаем
                const base = Number(formatUnits(res[0], 8));
                const trigger = base * (1 - DROP_BPS / 10000);
                setTriggerPrice(trigger.toFixed(4));
            } else {
                setTriggerPrice(null);
            }
        } catch {
            setBaseline(null);
            setTriggerPrice(null);
        }
    }, [address, isV3, publicClient, contractAddress]);

    // ===== Init =====
    useEffect(() => {
        (async () => {
            if (!address) return;
            if (!isAddress(contractAddress)) return;
            try {
                await publicClient.readContract({ address: contractAddress, abi: v3Abi, functionName: 'DROP_BPS' });
                setIsV3(true);
            } catch {
                setIsV3(true);
            }
            await Promise.all([refetchAllowance(), refetchVaultBalance(), refetchUsdtBalance(), fetchCurrentBtcPrice()]);
            await fetchBaseline();
        })();
    }, [address, publicClient, contractAddress, refetchAllowance, refetchVaultBalance, refetchUsdtBalance, fetchBaseline, fetchCurrentBtcPrice]);

    // ===== Actions =====
    const handleSwitchChain = async () => {
        await switchChain({ chainId: CHAIN_ID });
    };

    const handleApprove = async () => {
        await waitForWalletClient();
        const amountToApprove = depositAmount && parseFloat(depositAmount) > 0 ? depositAmount : '1000';
        const hash = await writeContractAsync({
            address: usdtAddress, abi: erc20Abi, functionName: 'approve',
            args: [contractAddress, parseUnits(amountToApprove, 18)],
            chainId: CHAIN_ID, gas: 100000n,
        });
        await publicClient.waitForTransactionReceipt({ hash });
        await refetchAllowance();
    };

    const handleDeposit = async () => {
        await waitForWalletClient();
        const amt = parseFloat(depositAmount || '0');
        if (!amt || amt <= 0) throw new Error('Enter deposit amount');

        // баланс и allowance
        const [bal, alw] = await Promise.all([
            publicClient.readContract({ address: usdtAddress, abi: erc20Abi, functionName: 'balanceOf', args: [getAddress(address)] }),
            publicClient.readContract({ address: usdtAddress, abi: erc20Abi, functionName: 'allowance', args: [getAddress(address), contractAddress] }),
        ]);
        if (bal < parseUnits(depositAmount, 18)) throw new Error('Insufficient USDT');
        if (alw < parseUnits(depositAmount, 18)) throw new Error('Insufficient allowance');

        // deposit
        await publicClient.simulateContract({ address: contractAddress, abi: v3Abi, functionName: 'deposit', args: [parseUnits(depositAmount, 18)], account: getAddress(address) });
        const hash = await writeContractAsync({ address: contractAddress, abi: v3Abi, functionName: 'deposit', args: [parseUnits(depositAmount, 18)], chainId: CHAIN_ID, gas: 1_000_000n });
        await publicClient.waitForTransactionReceipt({ hash });

        // фиксируем baseline ровно по цене на момент депозита (через контракт)
        const { request } = await publicClient.simulateContract({
            address: contractAddress, abi: v3Abi, functionName: 'resetBaseline', args: [], account: getAddress(address), chain: CHAIN_ID,
        });
        const h2 = await writeContractAsync(request);
        await publicClient.waitForTransactionReceipt({ hash: h2 });

        // обновить локально
        await Promise.all([refetchVaultBalance(), refetchUsdtBalance(), fetchBaseline(), fetchCurrentBtcPrice()]);

        // включаем авто-режим под выбранный актив
        setAutoMode(true);
    };

    const handleWithdraw = async () => {
        await waitForWalletClient();
        const amt = parseFloat(withdrawAmount || '0');
        if (!amt || amt <= 0) throw new Error('Enter withdraw amount');

        const bal = await publicClient.readContract({ address: contractAddress, abi: v3Abi, functionName: 'balances', args: [getAddress(address)] });
        if (bal < parseUnits(withdrawAmount, 18)) throw new Error('Insufficient vault balance');

        await publicClient.simulateContract({ address: contractAddress, abi: v3Abi, functionName: 'withdraw', args: [parseUnits(withdrawAmount, 18)], account: getAddress(address) });
        const hash = await writeContractAsync({ address: contractAddress, abi: v3Abi, functionName: 'withdraw', args: [parseUnits(withdrawAmount, 18)], chainId: CHAIN_ID, gas: 1_000_000n });
        await publicClient.waitForTransactionReceipt({ hash });
        await Promise.all([refetchVaultBalance(), refetchUsdtBalance(), fetchBaseline()]);
    };

    // ручной своп (на случай тестов)
    const manualSwapAll = async () => {
        await performSwap('manual');
    };

    // ===== Авто-своп: весь vault, когда текущая цена <= triggerPrice =====
    const performSwap = useCallback(async (reason = 'auto') => {
        if (isSwapping) return;
        const vb = parseFloat(vaultBalance || '0');
        if (!vb || vb <= 0) return;
        if (!baseline || baseline[0] === 0n || !triggerPrice) return;

        try {
            await waitForWalletClient();
            if (chainId !== CHAIN_ID) await switchChain({ chainId: CHAIN_ID });

            setIsSwapping(true);

            const amountIn = parseUnits(vaultBalance, 18); // всё
            const fnPreview = selectedAsset === 'BNB' ? 'previewUsdtToBNB' : 'previewUsdtToCAKE';
            const previewOut = await publicClient.readContract({
                address: contractAddress, abi: v3Abi, functionName: fnPreview, args: [amountIn],
            });
            const minOut = (previewOut * BigInt(10000 - SLIPPAGE_BPS)) / 10000n;
            const deadline = Math.floor(Date.now() / 1000) + 60 * 20;
            const fnSwap = selectedAsset === 'BNB' ? 'swapUsdtToBNB' : 'swapUsdtToCAKE';

            // snapshot до свопа (для показа дельты)
            const beforeNative = selectedAsset === 'BNB'
                ? await publicClient.getBalance({ address: getAddress(address) })
                : null;
            const beforeCake = selectedAsset === 'CAKE'
                ? await publicClient.readContract({ address: CAKE_ADDRESS, abi: erc20Abi, functionName: 'balanceOf', args: [getAddress(address)] })
                : null;

            await publicClient.simulateContract({
                address: contractAddress, abi: v3Abi, functionName: fnSwap,
                args: [amountIn, minOut, deadline], account: getAddress(address),
            });

            const hash = await writeContractAsync({
                address: contractAddress, abi: v3Abi, functionName: fnSwap,
                args: [amountIn, minOut, deadline], chainId: CHAIN_ID, gas: 1_500_000n,
            });
            const receipt = await publicClient.waitForTransactionReceipt({ hash });

            // баланс после
            let actualDelta = null;
            if (selectedAsset === 'BNB') {
                const after = await publicClient.getBalance({ address: getAddress(address) });
                if (beforeNative != null) actualDelta = formatUnits(after - beforeNative, 18) + ' BNB';
            } else {
                const after = await publicClient.readContract({ address: CAKE_ADDRESS, abi: erc20Abi, functionName: 'balanceOf', args: [getAddress(address)] });
                if (beforeCake != null) actualDelta = formatUnits(after - beforeCake, 18) + ' CAKE';
            }

            setLastSwap({
                hash,
                asset: selectedAsset,
                expectedOut: formatUnits(previewOut, 18),
                actualDelta,
                reason,
                status: receipt.status,
            });

            await Promise.all([refetchVaultBalance(), fetchBaseline()]);
            setIsSwapping(false);
            // авто-режим выключим, чтобы не свопать повторно; включишь снова новым депозитом
            setAutoMode(false);
        } catch (e) {
            setIsSwapping(false);
            // оставляем авто-режим включенным — попробует снова на следующей итерации
        }
    }, [address, chainId, vaultBalance, baseline, triggerPrice, selectedAsset, publicClient, writeContractAsync, refetchVaultBalance, fetchBaseline, switchChain]);

    // ПОЛЛИНГ: мониторим цену и бьём своп, когда условие выполнено
    useEffect(() => {
        if (!autoMode || !triggerPrice) return;
        // чистим старый таймер
        if (autoPollRef.current) clearInterval(autoPollRef.current);
        autoPollRef.current = setInterval(async () => {
            try {
                await fetchCurrentBtcPrice();
                if (!currentBtcPrice) return;
                const cur = Number(currentBtcPrice);
                const trig = Number(triggerPrice);
                if (cur <= trig) {
                    clearInterval(autoPollRef.current);
                    autoPollRef.current = null;
                    await performSwap('auto');
                }
            } catch {/* ignore */ }
        }, POLL_MS);
        return () => {
            if (autoPollRef.current) clearInterval(autoPollRef.current);
            autoPollRef.current = null;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [autoMode, triggerPrice, selectedAsset, vaultBalance]);

    // ===== UI helpers =====
    const isValidDepositAmount = () => {
        const a = parseFloat(depositAmount || '0');
        return a > 0 && a <= parseFloat(usdtBalance) && a <= parseFloat(allowance);
    };
    const isValidWithdrawAmount = () => {
        const a = parseFloat(withdrawAmount || '0');
        return a > 0 && a <= parseFloat(vaultBalance);
    };

    return (
        <div style={{ padding: 20, fontFamily: 'Arial, sans-serif' }}>
            <h2>Auto Drop Panel</h2>

            <p><strong>Connected Wallet:</strong> {address || '—'}</p>
            <p>
                <strong>Current Chain:</strong> {chainId}{' '}
                {chainId !== CHAIN_ID && (
                    <button onClick={handleSwitchChain} style={{ background: '#ff4d4f', color: '#fff', padding: '6px 12px', border: 'none', borderRadius: 6 }}>
                        Switch to BSC
                    </button>
                )}
            </p>

            <p><strong>USDT Balance:</strong> {usdtBalance} USDT</p>
            <p><strong>Allowance:</strong> {allowance} USDT</p>
            <p><strong>Vault Balance:</strong> {vaultBalance} USDT</p>
            <p><strong>Total USDT:</strong> {totalUsdt} USDT</p>
            <p><strong>Current BTC Price:</strong> {currentBtcPrice ? `${currentBtcPrice} USD` : '—'}</p>

            <hr />

            <div style={{ margin: '12px 0' }}>
                <label>
                    Target asset:&nbsp;
                    <select value={selectedAsset} onChange={(e) => setSelectedAsset(e.target.value)} style={{ padding: 6 }}>
                        <option value="BNB">BNB</option>
                        <option value="CAKE">CAKE</option>
                    </select>
                </label>
            </div>

            <div style={{ margin: '12px 0' }}>
                <label>
                    Deposit Amount (USDT):&nbsp;
                    <input type="number" min="0.01" step="0.01" value={depositAmount} onChange={(e) => setDepositAmount(e.target.value)} style={{ padding: 6, width: 140 }} />
                </label>
                &nbsp;
                <button onClick={handleApprove} style={{ background: '#1890ff', color: '#fff', padding: '6px 12px', border: 'none', borderRadius: 6, marginRight: 8 }}>
                    Approve {depositAmount || '1000'} USDT
                </button>
                <button onClick={handleDeposit} disabled={!isValidDepositAmount()} style={{ background: isValidDepositAmount() ? '#faad14' : '#d9d9d9', color: '#fff', padding: '6px 12px', border: 'none', borderRadius: 6 }}>
                    Deposit
                </button>
            </div>

            <div style={{ margin: '12px 0' }}>
                <label>
                    Withdraw Amount (USDT):&nbsp;
                    <input type="number" min="0.01" step="0.01" value={withdrawAmount} onChange={(e) => setWithdrawAmount(e.target.value)} style={{ padding: 6, width: 140 }} />
                </label>
                &nbsp;
                <button onClick={handleWithdraw} disabled={!isValidWithdrawAmount()} style={{ background: isValidWithdrawAmount() ? '#ff4d4f' : '#d9d9d9', color: '#fff', padding: '6px 12px', border: 'none', borderRadius: 6 }}>
                    Withdraw
                </button>
            </div>

            <hr />

            <h3>Autoswap</h3>
            <p><strong>Baseline:</strong> {baseline && baseline[0] !== 0n ? `${formatUnits(baseline[0], 8)} USD (set ${new Date(Number(baseline[1]) * 1000).toLocaleString()})` : 'Not set'}</p>
            <p><strong>Swap will occur at:</strong> {triggerPrice ? `${triggerPrice} USD` : 'N/A (deposit first)'}</p>
            <p><strong>Mode:</strong> {autoMode ? '✅ ON' : 'OFF'} {isSwapping ? ' (swapping...)' : ''}</p>
            <div style={{ marginTop: 8 }}>
                <button onClick={() => setAutoMode((x) => !x)} disabled={!triggerPrice || parseFloat(vaultBalance) <= 0} style={{ background: triggerPrice && parseFloat(vaultBalance) > 0 ? '#52c41a' : '#d9d9d9', color: '#fff', padding: '6px 12px', border: 'none', borderRadius: 6 }}>
                    {autoMode ? 'Disable auto' : 'Enable auto'}
                </button>
                &nbsp;
                <button onClick={manualSwapAll} disabled={!triggerPrice || parseFloat(vaultBalance) <= 0} style={{ background: '#722ed1', color: '#fff', padding: '6px 12px', border: 'none', borderRadius: 6 }}>
                    Swap now (all)
                </button>
            </div>

            {lastSwap && (
                <div style={{ marginTop: 12, padding: 12, border: '1px solid #eee', borderRadius: 8 }}>
                    <div><strong>Last swap:</strong> {lastSwap.reason} / status: {String(lastSwap.status)}</div>
                    <div><strong>Tx:</strong> <a href={`https://bscscan.com/tx/${lastSwap.hash}`} target="_blank" rel="noreferrer">{lastSwap.hash}</a></div>
                    <div><strong>Asset:</strong> {lastSwap.asset}</div>
                    <div><strong>Expected out:</strong> {lastSwap.expectedOut} {lastSwap.asset}</div>
                    <div><strong>Wallet delta:</strong> {lastSwap.actualDelta || '—'}</div>
                </div>
            )}
        </div>
    );
}
