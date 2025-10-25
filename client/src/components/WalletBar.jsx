// src/components/WalletBar.jsx
import { useAccount, useDisconnect } from 'wagmi'
import { useWeb3Modal } from '@web3modal/wagmi/react'
import Cookies from 'js-cookie'
import './WalletBar.css'
import { useTranslation } from 'react-i18next'

export default function WalletBar() {
    const { address, isConnected } = useAccount()
    const { disconnectAsync } = useDisconnect()
    const { open } = useWeb3Modal()
    const { t } = useTranslation()

    const onDisconnect = async () => {
        try {
            await open({ view: 'Account' }).catch(() => { })
            await disconnectAsync().catch(() => { })
        } finally {
            Cookies.remove('role', { path: '/' })
            Cookies.remove('uid', { path: '/' })
            // Если нужно, отпишись на бэке:
            // await fetch('/api/auth/logout', { method:'POST', credentials:'include' }).catch(()=>{})
            window.location.replace('/')
        }
    }

    if (!isConnected) return <w3m-button balance="hide" />

    const short = `${address.slice(0, 6)}…${address.slice(-4)}`
    return (
        <div className="wb-bar">
            <span className="wb-addr" title={address}>{short}</span>
            <button className="wb-btn" onClick={onDisconnect}>{t('wallet.disconnect')}</button>
        </div>
    )
}
