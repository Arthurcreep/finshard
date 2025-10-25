// src/components/PortfolioPanel.jsx — robust, paginated, real-API ready
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAccount, useChainId } from 'wagmi';
import { useTranslation } from 'react-i18next';
import s from '../styles/PortfolioPanel.module.css';

const COLORS = ['#22c55e', '#38bdf8', '#f59e0b', '#a78bfa', '#ef4444', '#14b8a6', '#eab308'];

export default function PortfolioPanel() {
    const { t } = useTranslation();
    const { address } = useAccount();
    const chainId = useChainId();

    const [holdings, setHoldings] = useState({ items: [], totals: { usd: 0 }, meta: null });
    const [tx, setTx] = useState({ items: [], page: 1, hasMore: true, loading: false });
    const [loading, setLoading] = useState(true);
    const [err, setErr] = useState('');
    const [viewChain, setViewChain] = useState('all');

    // abort controllers to cancel previous fetches on deps change
    const abRef = useRef({ h: null, tx: null });

    const fetchHoldings = useCallback(async (addr, chain) => {
        if (abRef.current.h) abRef.current.h.abort();
        const ac = new AbortController();
        abRef.current.h = ac;
        const qs = `?address=${encodeURIComponent(addr)}&chainId=${encodeURIComponent(chain || 1)}&aggregate=1`;
        const r = await fetch('/api/wallet/holdings' + qs, { credentials: 'include', signal: ac.signal });
        if (!r.ok) throw new Error('holdings_http_' + r.status);
        const j = await r.json();
        return j;
    }, []);

    const fetchTxPage = useCallback(async (addr, chain, page = 1, offset = 50) => {
        if (abRef.current.tx) abRef.current.tx.abort();
        const ac = new AbortController();
        abRef.current.tx = ac;
        const qs = `?address=${encodeURIComponent(addr)}&chainId=${encodeURIComponent(chain || 1)}&page=${page}&offset=${offset}&sort=desc`;
        const r = await fetch('/api/tx/list' + qs, { credentials: 'include', signal: ac.signal });
        if (!r.ok) throw new Error('tx_http_' + r.status);
        const j = await r.json();
        return j;
    }, []);

    // initial + on address/chain change
    useEffect(() => {
        let cancelled = false;
        async function load() {
            if (!address) {
                setHoldings({ items: [], totals: { usd: 0 }, meta: null });
                setTx({ items: [], page: 1, hasMore: false, loading: false });
                setLoading(false);
                return;
            }
            setLoading(true);
            setErr('');
            try {
                const [h, t0] = await Promise.all([
                    fetchHoldings(address, chainId),
                    fetchTxPage(address, chainId, 1, 50),
                ]);
                if (cancelled) return;
                if (Array.isArray(h?.items)) {
                    setHoldings({ items: h.items, totals: h.totals || { usd: 0 }, meta: h.meta || null });
                    setViewChain(p => (p === 'all' || typeof p === 'number') ? p : 'all');
                } else {
                    setHoldings({ items: [], totals: { usd: 0 }, meta: null });
                    setErr(t('portfolio.fetchBalancesError'));
                }
                const firstItems = Array.isArray(t0?.items) ? t0.items : [];
                setTx({ items: firstItems, page: 1, hasMore: firstItems.length >= 50, loading: false });
            } catch (e) {
                if (!cancelled) {
                    console.error('[PortfolioPanel] load error:', e);
                    setErr(t('portfolio.loadError'));
                    setHoldings({ items: [], totals: { usd: 0 }, meta: null });
                    setTx({ items: [], page: 1, hasMore: false, loading: false });
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        }
        load();
        return () => { cancelled = true; if (abRef.current.h) abRef.current.h.abort(); if (abRef.current.tx) abRef.current.tx.abort(); };
    }, [address, chainId, fetchHoldings, fetchTxPage, t]);

    const chainOptions = useMemo(() => {
        const arr = holdings.meta?.perChain || [];
        return arr
            .filter(pc => Array.isArray(pc.items) && pc.items.length)
            .map(pc => ({ chainId: pc.chainId, name: chainName(pc.chainId), totals: pc.totals?.usd || 0 }));
    }, [holdings.meta]);

    const displayed = useMemo(() => {
        if (!holdings.items?.length) return { items: [], total: 0 };
        if (viewChain === 'all') {
            const total = holdings.items.reduce((s, i) => s + (Number(i.usd) || 0), 0);
            const withChain = holdings.items.map(it => (it.chainId ? it : { ...it, chainId: guessChainFromSymbol(it.symbol) }));
            return { items: withChain, total };
        }
        const pc = holdings.meta?.perChain?.find(x => x.chainId === viewChain);
        const items = Array.isArray(pc?.items) ? pc.items : [];
        const total = Number(pc?.totals?.usd || 0);
        return { items, total };
    }, [holdings, viewChain]);

    const pie = useMemo(() => {
        const items = displayed.items || [];
        if (!items.length) return [];
        const totalUsd = items.reduce((s, i) => s + (Number(i.usd) || 0), 0);
        if (totalUsd > 0) {
            return items
                .map(i => ({ key: i.symbol, value: Number(i.usd || 0), pct: (Number(i.usd || 0) / totalUsd) * 100 }))
                .sort((a, b) => b.value - a.value);
        }
        const totalQty = items.reduce((s, i) => s + Math.max(0, Number(i.amount) || 0), 0);
        if (!totalQty) return [];
        return items
            .map(i => ({ key: i.symbol, value: Number(i.amount || 0), pct: (Number(i.amount || 0) / totalQty) * 100 }))
            .sort((a, b) => b.value - a.value);
    }, [displayed]);

    const loadMore = useCallback(async () => {
        if (!address || tx.loading || !tx.hasMore) return;
        try {
            setTx(p => ({ ...p, loading: true }));
            const next = (tx.page || 1) + 1;
            const j = await fetchTxPage(address, chainId, next, 50);
            const items = Array.isArray(j?.items) ? j.items : [];
            setTx(p => ({
                items: [...(p.items || []), ...items],
                page: next,
                hasMore: items.length >= 50,
                loading: false,
            }));
        } catch (e) {
            console.error('[PortfolioPanel] loadMore error:', e);
            setTx(p => ({ ...p, loading: false, hasMore: false }));
        }
    }, [address, chainId, tx.loading, tx.hasMore, tx.page, fetchTxPage]);

    return (
        <div className={s.wrap} aria-live="polite" style={{ opacity: loading ? .92 : 1 }}>
            <section className={s.card} aria-label={t('portfolio.dist')}>
                <header className={s.head}>
                    <h2>{t('portfolio.portfolio')}</h2>
                    <span className={s.total}>
                        {viewChain === 'all' ? t('portfolio.allNetworks') : chainName(viewChain)} · ≈ ${fmt(displayed.total || 0)}
                    </span>
                </header>

                {/* Табы по сетям */}
                {chainOptions?.length ? (
                    <div style={{ display: 'flex', gap: 8, margin: '8px 0 16px', flexWrap: 'wrap' }}>
                        <button onClick={() => setViewChain('all')} aria-pressed={viewChain === 'all'} className={s.pill}>
                            {t('portfolio.allNetworks')} · ${fmt(chainOptions.reduce((s, o) => s + Number(o.totals || 0), 0))}
                        </button>
                        {chainOptions.map(o => (
                            <button key={o.chainId} onClick={() => setViewChain(o.chainId)} aria-pressed={viewChain === o.chainId} className={s.pill}>
                                {o.name} · ${fmt(o.totals)}
                            </button>
                        ))}
                    </div>
                ) : null}

                <div className={s.grid}>
                    {loading ? <DonutSkeleton /> : <Donut data={pie} placeholderSub={t('portfolio.placeholderSub')} noDataLabel={t('portfolio.noData')} />}
                    <HoldingsTable
                        items={displayed.items || []}
                        loading={loading}
                        showChain={viewChain === 'all'}
                        t={t}
                    />
                </div>
                {err && !loading ? <div className={s.err}>{err}</div> : null}
            </section>

            <section className={s.card} aria-label={t('portfolio.transactions')}>
                <header className={s.head}>
                    <h2>{t('portfolio.transactions')}</h2>
                </header>
                <TxTable items={tx.items || []} loading={loading || tx.loading} chainId={chainId} t={t} />
                {(tx.hasMore && !(loading || tx.loading)) ? (
                    <div style={{ display: 'flex', justifyContent: 'center', marginTop: 12 }}>
                        <button className={s.pill} onClick={loadMore}>
                            {t('portfolio.loadMore')}
                        </button>
                    </div>
                ) : null}
            </section>
        </div>
    );
}

/* ===== Donut & tables ===== */
function Donut({ data, placeholderSub, noDataLabel }) {
    const r = 56, C = 2 * Math.PI * r;
    let acc = 0;
    if (!data?.length) {
        return (
            <div className={s.donutBox}>
                <svg className={s.donut} viewBox="0 0 140 140" role="img" aria-label={noDataLabel}>
                    <circle cx="70" cy="70" r={r} className={s.ringBg} />
                </svg>
                <div className={s.placeholder}>
                    <div className={s.placeholderTitle}>—</div>
                    <div className={s.placeholderSub}>{placeholderSub}</div>
                </div>
            </div>
        );
    }
    return (
        <div className={s.donutBox}>
            <svg className={s.donut} viewBox="0 0 140 140" role="img">
                <circle cx="70" cy="70" r={r} className={s.ringBg} />
                {data.map((d, i) => {
                    const len = (d.pct / 100) * C;
                    const dasharray = `${len} ${C - len}`;
                    const dashoffset = C - acc;
                    acc += len;
                    return (
                        <circle key={d.key} cx="70" cy="70" r={r}
                            stroke={COLORS[i % COLORS.length]} strokeWidth="16" fill="transparent"
                            strokeDasharray={dasharray} strokeDashoffset={dashoffset} strokeLinecap="butt" className={s.slice}
                        />
                    );
                })}
            </svg>
            <ul className={s.legend}>
                {data.map((d, i) => (
                    <li key={d.key}>
                        <span className={s.dot} style={{ background: COLORS[i % COLORS.length] }} />
                        <span className={s.sym}>{d.key}</span>
                        <span className={s.pct}>{d.pct.toFixed(1)}%</span>
                    </li>
                ))}
            </ul>
        </div>
    );
}

function DonutSkeleton() {
    return (
        <div className={s.donutBox}>
            <div className={s.skelCircle} />
            <ul className={s.legend}>
                {[1, 2, 3].map(i => (
                    <li key={i} className={s.skelRow}><span className={s.skelDot} /><span className={s.skelBar} /></li>
                ))}
            </ul>
        </div>
    );
}

function HoldingsTable({ items, loading, showChain, t }) {
    return (
        <table className={s.table} aria-label={t('portfolio.portfolio')}>
            <thead>
                <tr>
                    <th>{t('portfolio.token')}</th>
                    <th>{t('portfolio.qty')}</th>
                    <th className={s.num}>{t('portfolio.usd')}</th>
                    {showChain ? <th>{t('portfolio.net')}</th> : null}
                </tr>
            </thead>
            <tbody>
                {loading ? (
                    <tr><td colSpan={showChain ? 4 : 3} className={s.empty}>{t('portfolio.loading')}</td></tr>
                ) : items?.length ? items.map((i, idx) => (
                    <tr key={i.symbol + ':' + idx}>
                        <td className={s.ticker}>{i.symbol}</td>
                        <td>{fmtAmt(i.amount)}</td>
                        <td className={s.num}>${fmt(i.usd)}</td>
                        {showChain ? <td>{chainName(i.chainId) || '—'}</td> : null}
                    </tr>
                )) : (
                    <tr><td colSpan={showChain ? 4 : 3} className={s.empty}>{t('portfolio.noData')}</td></tr>
                )}
            </tbody>
        </table>
    );
}

function TxTable({ items, loading, chainId, t }) {
    return (
        <table className={s.table} aria-label={t('portfolio.transactions')}>
            <thead>
                <tr>
                    <th>{t('portfolio.date')}</th>
                    <th>{t('portfolio.token')}</th>
                    <th className={s.num}>{t('portfolio.amount')}</th>
                    <th>{t('portfolio.txHash')}</th>
                </tr>
            </thead>
            <tbody>
                {loading ? (
                    <tr><td colSpan="4" className={s.empty}>{t('portfolio.loading')}</td></tr>
                ) : items?.length ? items.map((tx) => (
                    <tr key={tx.id || tx.hash}>
                        <td>{fmtDate(tx.time)}</td>
                        <td>{tx.symbol}</td>
                        <td className={s.num} style={{ color: (tx.amount || 0) >= 0 ? '#22c55e' : '#ef4444' }}>
                            {fmtAmt(tx.amount)}
                        </td>
                        <td>
                            {tx.hash
                                ? <a className={s.hash} href={toExplorer(chainId, tx.hash)} target="_blank" rel="noreferrer">{shortHash(tx.hash)}</a>
                                : '—'}
                        </td>
                    </tr>
                )) : (
                    <tr><td colSpan="4" className={s.empty}>{t('portfolio.noData')}</td></tr>
                )}
            </tbody>
        </table>
    );
}

/* ===== utils ===== */
function fmt(n) { return Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 0 }); }
function fmtAmt(n) { return Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 8 }); }
function fmtDate(ts) { const d = new Date(Number(ts || Date.now())); return d.toLocaleString(); }
function shortHash(h) { h = String(h || ''); return h.length > 12 ? `${h.slice(0, 6)}…${h.slice(-4)}` : h; }
function chainName(id) { if (id === 1) return 'Ethereum'; if (id === 56) return 'BNB Smart Chain'; if (id === 137) return 'Polygon'; return id ? `Chain ${id}` : ''; }
function guessChainFromSymbol(sym) { if (sym === 'BNB' || sym === 'WBNB') return 56; return 1; }
function toExplorer(chainId, hash) { const h = String(hash || '').replace(/^0x/i, '0x'); if (chainId === 56) return `https://bscscan.com/tx/${h}`; if (chainId === 137) return `https://polygonscan.com/tx/${h}`; return `https://etherscan.io/tx/${h}`; }
