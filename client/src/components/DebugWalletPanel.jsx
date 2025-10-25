import { useAccount, useChainId, useConnectorClient } from 'wagmi'
import { useWeb3Modal } from '@web3modal/wagmi/react'
import { useState } from 'react'

export default function DebugWalletPanel() {
    const { address, connector, isConnected } = useAccount()
    const chainId = useChainId()
    const { data: client } = useConnectorClient()
    const { open } = useWeb3Modal()
    const [res, setRes] = useState('')

    async function ping() {
        try {
            const eth = (client?.transport?.value?.request) ? client.transport.value : window.ethereum
            const id = await eth.request?.({ method: 'eth_chainId' })
            setRes(`chainId=${id}`)
        } catch (e) {
            setRes(String(e?.message || e))
        }
    }

    return (
        <div style={{ border: '1px dashed #3a3f53', borderRadius: 12, padding: 10, fontSize: 12, color: '#aab2c5' }}>
            <div>connected: <b>{String(isConnected)}</b></div>
            <div>address: <b>{address || '—'}</b></div>
            <div>chainId: <b>{chainId ?? '—'}</b></div>
            <div>connector: <b>{connector?.name || '—'}</b></div>
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button onClick={() => open({ view: 'Connect' })}>Open Connect</button>
                <button onClick={() => open({ view: 'Networks' })}>Open Networks</button>
                <button onClick={ping}>eth_chainId()</button>
            </div>
            {res && <div style={{ marginTop: 6 }}>res: {res}</div>}
        </div>
    )
}
