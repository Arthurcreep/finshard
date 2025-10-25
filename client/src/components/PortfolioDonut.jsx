import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts'

const COLORS = ['#38bdf8', '#a78bfa', '#22c55e', '#f59e0b', '#ef4444', '#94a3b8']

export default function PortfolioDonut({ items = [] }) {
    // items: [{symbol:'ETH', value: 45.2}, ...] value в %
    return (
        <div className="u-card" aria-labelledby="port-title" style={{ padding: 16 }}>
            <h2 id="port-title" style={{ margin: '0 0 8px' }}>Структура портфеля</h2>
            <div style={{ width: '100%', height: 280 }}>
                <ResponsiveContainer>
                    <PieChart>
                        <Pie data={items} dataKey="value" nameKey="symbol" innerRadius={60} outerRadius={100} paddingAngle={1}>
                            {items.map((entry, i) => <Cell key={entry.symbol} fill={COLORS[i % COLORS.length]} />)}
                        </Pie>
                        <Tooltip />
                        <Legend />
                    </PieChart>
                </ResponsiveContainer>
            </div>
        </div>
    )
}
