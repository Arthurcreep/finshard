// src/components/DepositForm.jsx
import { useEffect, useMemo, useState } from 'react'
import {
    useAccount, useWriteContract, useReadContract,
    useChainId, useSwitchChain, useWaitForTransactionReceipt, useConnectorClient
} from 'wagmi'
import { parseUnits, formatUnits } from 'viem'
import { useWeb3Modal } from '@web3modal/wagmi/react'
import { bsc } from 'viem/chains'

import { VAULT, USDT, ERC20_ABI, ABI, TOKENS, USDT_META, DEFAULT_ASSET } from '../contractConfig'

function normErr(e) {
    const s = e?.shortMessage || e?.cause?.shortMessage || e?.message || e?.details || (typeof e === 'string' ? e : JSON.stringify(e))
    return (s || 'Unknown error').replace(/^Error:\s*/i, '').trim()
}
const bscscanTx = (hash) => `https://bscscan.com/tx/${hash}`

export default function DepositForm() {
    const { address, isConnected } = useAccount()
    const chainId = useChainId()
    const { switchChainAsync } = useSwitchChain()
    const { open } = useWeb3Modal()
    const { writeContractAsync } = useWriteContract()
    const { data: client } = useConnectorClient()

    const [amount, setAmount] = useState('')
    const [asset, setAsset] = useState(DEFAULT_ASSET) // ← CAKE по умолчанию
    const [busy, setBusy] = useState(false)
    const [err, setErr] = useState('')
    const [note, setNote] = useState('')

    const [approveHash, setApproveHash] = useState(null)
    const [depositHash, setDepositHash] = useState(null)

    const approveReceipt = useWaitForTransactionReceipt({ hash: approveHash || undefined, chainId: bsc.id })
    const depositReceipt = useWaitForTransactionReceipt({ hash: depositHash || undefined, chainId: bsc.id })

    // Баланс USDT
    const { data: balUSDT } = useReadContract({
        address: USDT, abi: ERC20_ABI, functionName: 'balanceOf',
        args: address ? [address] : undefined, query: { enabled: !!address }
    })
    const balF = useMemo(() => {
        try { return Number(formatUnits(balUSDT ?? 0n, USDT_META.decimals)) } catch { return 0 }
    }, [balUSDT])

    useEffect(() => {
        if (!isConnected) { setNote('Кошелёк не подключён'); return }
        if (chainId !== 56) { setNote('Включи сеть BSC (chainId=56)'); return }
        setNote('')
    }, [isConnected, chainId])

    async function preflightPing() {
        try {
            const req = client?.transport?.value?.request ?? window.ethereum?.request
            if (req) console.log('[preflight] chainId =', await req({ method: 'eth_chainId', params: [] }))
        } catch (e) { console.warn('[preflight] ping failed:', e) }
    }

    async function onDeposit() {
        setErr(''); setApproveHash(null); setDepositHash(null)

        console.groupCollapsed('[Deposit] start')
        console.log('address:', address, 'chainId:', chainId, 'amount:', amount, 'asset:', asset)
        console.groupEnd()

        if (!isConnected || !address) { await open({ view: 'Connect' }); return }
        if (chainId !== bsc.id) {
            try { await switchChainAsync({ chainId: bsc.id }) }
            catch { await open({ view: 'Networks' }); return }
        }
        if (!amount || Number(amount) <= 0) { setErr('Укажи сумму USDT > 0'); return }

        try {
            setBusy(true)
            await preflightPing()

            const wei = parseUnits(amount, USDT_META.decimals)

            console.time('[Deposit] approve')
            const aHash = await writeContractAsync({
                chainId: bsc.id, address: USDT, abi: ERC20_ABI, functionName: 'approve', args: [VAULT, wei],
            })
            setApproveHash(aHash)
            console.info('[Deposit] approve txHash:', aHash, bscscanTx(aHash))
            console.timeEnd('[Deposit] approve')

            console.time('[Deposit] deposit')
            const dHash = await writeContractAsync({
                chainId: bsc.id, address: VAULT, abi: ABI, functionName: 'deposit', args: [wei, asset],
            })
            setDepositHash(dHash)
            console.info('[Deposit] deposit txHash:', dHash, bscscanTx(dHash))
            console.timeEnd('[Deposit] deposit')

            setAmount('')
        } catch (e) {
            console.error('deposit error:', e)
            setErr(normErr(e))
        } finally {
            setBusy(false)
        }
    }

    const assetMeta = TOKENS[asset?.toLowerCase?.()]

    return (
        <div style={{ display: 'grid', gap: 10, border: '1px solid #252936', borderRadius: 12, padding: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontWeight: 700, fontSize: 16 }}>Внести USDT</div>
                <div style={{ fontSize: 12, opacity: .8 }}>
                    {isConnected ? <>Сеть: <b>{chainId === 56 ? 'BSC' : chainId}</b> · Баланс USDT: <b>{balF.toLocaleString('ru-RU')}</b></> : 'Кошелёк не подключён'}
                </div>
            </div>

            <div style={{ fontSize: 12, color: '#aab2c5' }}>
                Выбранный актив: <b>{assetMeta?.symbol || '—'}</b>
            </div>

            <label style={{ display: 'grid', gap: 6 }}>
                <span>Сумма (USDT)</span>
                <input inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} placeholder="100" />
            </label>

            <label style={{ display: 'grid', gap: 6 }}>
                <span>Актив</span>
                <select value={asset} onChange={e => setAsset(e.target.value)}>
                    {Object.entries(TOKENS).map(([addr, m]) => (
                        <option key={addr} value={addr}>{m.symbol}</option>
                    ))}
                </select>
            </label>

            {note ? <div style={{ color: '#a3a3a3', fontSize: 12 }}>{note}</div> : null}
            {err ? <div style={{ color: '#ef4444', fontSize: 13 }}>{err}</div> : null}

            <button onClick={onDeposit} disabled={busy || !isConnected || chainId !== 56} style={{ height: 36, borderRadius: 10 }}>
                {busy ? 'Отправляем…' : 'Внести (approve → deposit)'}
            </button>

            {(approveHash || depositHash) && (
                <div style={{ marginTop: 8, fontSize: 12, color: '#aab2c5', display: 'grid', gap: 6 }}>
                    {approveHash && (
                        <div>
                            Approve: <a href={bscscanTx(approveHash)} target="_blank" rel="noreferrer">
                                {approveHash.slice(0, 10)}…{approveHash.slice(-8)}
                            </a> {approveReceipt?.data ? <> — статус: <b>{approveReceipt.data.status === 'success' ? 'success' : 'reverted'}</b></> : null}
                        </div>
                    )}
                    {depositHash && (
                        <div>
                            Deposit: <a href={bscscanTx(depositHash)} target="_blank" rel="noreferrer">
                                {depositHash.slice(0, 10)}…{depositHash.slice(-8)}
                            </a> {depositReceipt?.data ? <> — статус: <b>{depositReceipt.data.status === 'success' ? 'success' : 'reverted'}</b></> : null}
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}
