// src/components/PositionTable.jsx
import { useAccount, useReadContract, useWriteContract } from 'wagmi'
import { formatUnits } from 'viem'
import { ABI, VAULT, USDT_META, TOKENS, ERC20_ABI } from '../contractConfig'
import s from './PositionTable.module.css'

const short = (x) => (x ? x.slice(0, 6) + '…' + x.slice(-4) : '')

export default function PositionTable() {
    // 1) ВСЕ ХУКИ — ВВЕРХУ КОМПОНЕНТА, БЕЗ УСЛОВИЙ
    const { address, isConnected } = useAccount()

    // позиция
    const { data: p } = useReadContract({
        address: VAULT,
        abi: ABI,
        functionName: 'getPosition',
        args: address ? [address] : undefined,
        query: { enabled: !!address, refetchInterval: 10_000 },
    })

    // стоимость позиции
    const { data: val } = useReadContract({
        address: VAULT,
        abi: ABI,
        functionName: 'positionValueUSDT',
        args: address ? [address] : undefined,
        query: { enabled: !!address, refetchInterval: 10_000 },
    })

    // адрес актива (даже если p ещё нет — держим переменную, чтобы порядок хуков не менялся)
    const assetAddr = p?.asset?.toLowerCase?.()

    // локальные метаданные токена (не хук)
    const localMeta = assetAddr ? TOKENS[assetAddr] : undefined

    // Бэкап-метаданные токена с ончейна — ХУКИ ВСЕГДА ВЫЗЫВАЕМ,
    // только флаг enabled управляет выполнением (порядок не меняется)
    const { data: onchainSymbol } = useReadContract({
        address: assetAddr,
        abi: ERC20_ABI,
        functionName: 'symbol',
        args: [],
        query: { enabled: !!assetAddr && !localMeta },
    })

    const { data: onchainDecimals } = useReadContract({
        address: assetAddr,
        abi: ERC20_ABI,
        functionName: 'decimals',
        args: [],
        query: { enabled: !!assetAddr && !localMeta },
    })

    // write-хук — тоже всегда наверху
    const { writeContractAsync } = useWriteContract()

    // 2) ПОСЛЕ ВСЕХ ХУКОВ — УСЛОВНЫЕ RETURN'ы
    if (!isConnected) return <div className={s.card}>Подключи кошелёк</div>
    if (!p || p.asset === '0x0000000000000000000000000000000000000000') {
        return <div className={s.card}>Активной позиции нет</div>
    }

    // 3) Расчёты (обычные переменные, не хуки)
    const symbol = localMeta?.symbol || onchainSymbol || short(p.asset)
    const decimals =
        localMeta?.decimals ??
        (typeof onchainDecimals === 'number' ? onchainDecimals : 18)

    const deposit = Number(
        formatUnits(p.depositUSDT ?? 0n, USDT_META.decimals),
    )
    const remain = Number(
        formatUnits(p.remainingUSDT ?? 0n, USDT_META.decimals),
    )
    const assetAmt = p.assetAmount ?? 0n
    const assetAmtF = Number(formatUnits(assetAmt, decimals))
    const valueUSDT = val?.[0] || 0n
    const pnlUSDT = val?.[1] || 0n
    const valueF = Number(formatUnits(valueUSDT, USDT_META.decimals))
    const pnlF =
        Number(
            formatUnits(pnlUSDT >= 0n ? pnlUSDT : -pnlUSDT, USDT_META.decimals),
        ) * (pnlUSDT >= 0n ? 1 : -1)

    async function withdrawAll() {
        // 1inch calldata добавим позже
        const args = assetAmt === 0n ? [0n, '0x'] : [0n, '0x']
        await writeContractAsync({
            address: VAULT,
            abi: ABI,
            functionName: 'withdrawAll',
            args,
        })
    }

    const createdMs = Number(p.createdAt || 0n) * 1000
    const days = createdMs
        ? Math.floor((Date.now() - createdMs) / 86400000)
        : '—'

    return (
        <div className={s.card}>
            <header className={s.header}>
                <div>
                    <div className={s.hint}>Адрес</div>
                    <div className={s.value}>{short(address)}</div>
                </div>
                <div>
                    <div className={s.hint}>Срок (дней)</div>
                    <div className={s.value}>{days}</div>
                </div>
                <div>
                    <div className={s.hint}>Актив</div>
                    <div className={s.value}>{symbol}</div>
                </div>
                <div>
                    <div className={s.hint}>P&L (USDT)</div>
                    <div className={`${s.value} ${pnlUSDT >= 0n ? s.profit : s.loss}`}>
                        {pnlF.toLocaleString('ru-RU')}
                    </div>
                </div>
            </header>

            <div className={s.hint} style={{ marginTop: -6, marginBottom: 6 }}>
                Траншей куплено: <b>{Number(p.tranchesExecuted || 0)}</b> / 2
                {assetAmt === 0n
                    ? ' · пока свопов не было — количество в активе = 0'
                    : ''}
            </div>

            <table className={s.table}>
                <tbody>
                    <tr>
                        <td><b>Депозит (USDT)</b></td>
                        <td>{deposit.toLocaleString('ru-RU')}</td>
                    </tr>
                    <tr>
                        <td><b>Осталось в USDT</b></td>
                        <td>{remain.toLocaleString('ru-RU')}</td>
                    </tr>
                    <tr>
                        <td><b>Выбранный Актив (и тут сколько получилось)</b></td>
                        <td>{symbol} &nbsp; {assetAmtF}</td>
                    </tr>
                    <tr>
                        <td><b>В активе</b></td>
                        <td>{assetAmtF} {symbol}</td>
                    </tr>
                    <tr>
                        <td><b>Текущая стоимость (USDT)</b></td>
                        <td>{valueF.toLocaleString('ru-RU')}</td>
                    </tr>
                </tbody>
            </table>

            <div className={s.actions}>
                <button className={s.btn} onClick={withdrawAll}>
                    Забрать деньги
                </button>
            </div>
        </div>
    )
}
