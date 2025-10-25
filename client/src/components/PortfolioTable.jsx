export default function PortfolioTable({ rows = [] }) {
    // rows: [{symbol:'ETH', amount: 1.234, usd: 4356.12}]
    return (
        <section className="u-card" aria-labelledby="holdings-title" style={{ padding: 16 }}>
            <h2 id="holdings-title" style={{ margin: '0 0 8px' }}>Активы</h2>
            <table className="table">
                <thead><tr><th>Токен</th><th>Кол-во</th><th>Стоимость, $</th></tr></thead>
                <tbody>
                    {rows.map(r => (
                        <tr key={r.symbol}>
                            <td>{r.symbol}</td>
                            <td>{r.amount}</td>
                            <td>{r.usd?.toLocaleString?.('en-US', { maximumFractionDigits: 2 }) ?? '-'}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </section>
    )
}
