// src/utils/parseTx.js
import { getAddress } from 'viem'
import { wagmiConfig } from '../wallet/config.jsx'
import { erc20Abi } from 'viem'
import { ABI as VAULT_ABI } from '../contractConfig'
import { createPublicClient, http } from 'viem'
import { bsc } from 'viem/chains'

// независимый клиент на BSC (можно и из wagmi доставать)
const client = createPublicClient({ chain: bsc, transport: http('https://bsc.publicnode.com') })

export async function parseTx(hash) {
    const r = await client.getTransactionReceipt({ hash })
    const out = { hash, status: r.status, to: r.to, from: r.from, logs: [] }

    for (const log of r.logs) {
        // пробуем декодить как VAULT
        try {
            const ev = client.decodeEventLog({ abi: VAULT_ABI, data: log.data, topics: log.topics })
            out.logs.push({ address: log.address, event: ev.eventName, args: ev.args })
            continue
        } catch { }
        // пробуем как ERC20
        try {
            const ev = client.decodeEventLog({ abi: erc20Abi, data: log.data, topics: log.topics })
            out.logs.push({ address: log.address, event: ev.eventName, args: ev.args })
            continue
        } catch { }
        // если не распознали
        out.logs.push({ address: log.address, event: 'Unknown', topics: log.topics, data: log.data })
    }
    return out
}
