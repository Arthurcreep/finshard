export default function TransactionsTable({ rows = [] }) {
    // rows: [{hash, time, symbol, amount, usd, type:'SEND'|'RECV'}]
    return (
        <section className="u-card" aria-labelledby="tx-title" style={{ padding: 16 }}>
            <h2 id="tx-title" style={{ margin: '0 0 8px' }}>Транзакции</h2>
            <table className="table">
                <thead>
                    <tr><th>Время</th><th>Тип</th><th>Токен</th><th>Кол-во</th><th>$</th><th>Хэш</th></tr>
                </thead>
                <tbody>
                    {rows.map(r => (
                        <tr key={r.hash}>
                            <td>{new Date(r.time).toLocaleString()}</td>
                            <td>{r.type}</td>
                            <td>{r.symbol}</td>
                            <td>{r.amount}</td>
                            <td>{r.usd?.toLocaleString?.('en-US', { maximumFractionDigits: 2 }) ?? '-'}</td>
                            <td><a href={r.explorerUrl || '#'} rel="noreferrer" target="_blank">{r.hash.slice(0, 10)}…</a></td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </section>
    )
}
