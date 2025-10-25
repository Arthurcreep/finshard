// src/components/NetworkGuard.jsx
import { useState, useMemo } from 'react'
import { useAccount, useChainId, useSwitchChain } from 'wagmi'
import { bsc } from 'viem/chains'
import { useWeb3Modal } from '@web3modal/wagmi/react'

const BSC_PARAMS = {
    chainId: '0x38', // 56
    chainName: 'Binance Smart Chain',
    nativeCurrency: { name: 'BNB', symbol: 'BNB', decimals: 18 },
    rpcUrls: ['https://bsc-dataseed.binance.org'],
    blockExplorerUrls: ['https://bscscan.com'],
};

export default function NetworkGuard() {
    const chainId = useChainId()
    const { isConnected, connector } = useAccount()
    const { switchChain } = useSwitchChain()
    const { open } = useWeb3Modal()

    const [busy, setBusy] = useState(false)
    const [err, setErr] = useState('')

    const isInjected = useMemo(() => {
        // есть ли реальный инжект-провайдер (MetaMask/Zerion extension и т.п.)
        return !!(window?.ethereum && typeof window.ethereum.request === 'function')
    }, [])

    async function hardSwitchToBSC() {
        setErr('')
        setBusy(true)
        try {
            if (isInjected) {
                // 1) стандартный путь через wagmi
                await switchChain({ chainId: bsc.id })
                return
            }
            // 2) нет injected (или это WalletConnect/мобилка) — открываем модалку в режиме выбора сети
            await open({ view: 'Networks' })
        } catch (e) {
            // попытка вручную через provider.request (часть кошельков любит прямые вызовы)
            try {
                const eth = window.ethereum || window?.zerion?.ethereum
                if (!eth?.request) throw e
                await eth.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: BSC_PARAMS.chainId }] })
            } catch (e2) {
                const code = e2?.code ?? e2?.cause?.code
                if (code === 4902 || /Unrecognized chain/i.test(String(e2?.message))) {
                    // сеть не добавлена — пробуем добавить
                    const eth = window.ethereum || window?.zerion?.ethereum
                    if (!eth?.request) throw e2
                    await eth.request({ method: 'wallet_addEthereumChain', params: [BSC_PARAMS] })
                } else {
                    setErr(String(e2?.shortMessage || e2?.message || e2) || 'switch failed')
                }
            }
        } finally {
            setBusy(false)
        }
    }

    if (chainId === bsc.id) return null

    return (
        <div style={{
            padding: '10px 12px', border: '1px solid #3a3f53', background: '#151823',
            color: '#e8eaf0', borderRadius: 12, display: 'flex', gap: 12, alignItems: 'center', justifyContent: 'space-between'
        }}>
            <div>
                <div style={{ fontWeight: 700 }}>Нужна сеть BSC</div>
                <div style={{ fontSize: 13, opacity: .8 }}>
                    Сейчас цепь {chainId ?? '—'}. Переключись на Binance Smart Chain{isConnected ? '' : ' и подключи кошелёк'}.
                </div>
                {err && <div style={{ color: '#ef4444', fontSize: 12, marginTop: 6 }}>{err}</div>}
            </div>
            <button
                onClick={hardSwitchToBSC}
                disabled={busy}
                style={{ height: 36, padding: '0 14px', borderRadius: 10, border: '1px solid #3a3f53', background: '#8b5cf6', color: '#0b0c0f', fontWeight: 600 }}
            >
                {busy ? 'Переключаем…' : 'Переключить на BSC'}
            </button>
        </div>
    )
}
