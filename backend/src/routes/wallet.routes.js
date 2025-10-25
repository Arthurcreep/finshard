// backend/src/routes/wallet.routes.js
const express = require('express');
const { createPublicClient, http, fallback, formatUnits, parseAbi, isAddress } = require('viem');
const { mainnet, polygon, bsc } = require('viem/chains');

const router = express.Router();

/* ---------- цены в USD (кэш 60с) ---------- */
const PRICE_CACHE = { at: 0, data: {} }; // { id: { usd: Number } }
const COINGECKO_IDS = {
    BNB: 'binancecoin',
    ETH: 'ethereum',
    USDT: 'tether',
    USDC: 'usd-coin',
    WETH: 'weth',
    WBNB: 'wbnb',
};

async function fetchUsdPrices(symbols) {
    const ids = [...new Set(symbols.map(s => COINGECKO_IDS[s]).filter(Boolean))];
    if (!ids.length) return {};
    const now = Date.now();
    if (now - PRICE_CACHE.at < 60_000 && ids.every(id => PRICE_CACHE.data[id])) {
        return PRICE_CACHE.data;
    }
    const url = `https://api.coingecko.com/api/v3/simple/price?ids=${ids.join(',')}&vs_currencies=usd`;
    const res = await fetch(url, { headers: { accept: 'application/json' } });
    if (!res.ok) throw new Error('price_http_' + res.status);
    const json = await res.json();
    PRICE_CACHE.at = now;
    PRICE_CACHE.data = { ...PRICE_CACHE.data, ...json };
    return PRICE_CACHE.data;
}

/* ---------- utils ---------- */
function envList(pluralName, singleName, fb = []) {
    const raw = process.env[pluralName] || process.env[singleName] || '';
    if (!raw) return fb;
    return raw.split(',').map(s => s.trim()).filter(Boolean);
}

function chainById(id) {
    const n = Number(id);
    if (n === 1) return mainnet;
    if (n === 137) return polygon;
    if (n === 56) return bsc;
    return mainnet;
}

function makeClient(chain, meta) {
    const cfg =
        chain.id === 1 ? { plural: 'RPC_URLS_MAINNET', single: 'RPC_URL_MAINNET' } :
            chain.id === 137 ? { plural: 'RPC_URLS_POLYGON', single: 'RPC_URL_POLYGON' } :
                chain.id === 56 ? { plural: 'RPC_URLS_BSC', single: 'RPC_URL_BNB' } :
                    { plural: 'RPC_URLS_MAINNET', single: 'RPC_URL_MAINNET' };

    const urls = envList(cfg.plural, cfg.single);
    meta && (meta.rpcVar = `${cfg.plural}/${cfg.single}`, meta.rpcUrls = urls);
    if (!urls.length) {
        const err = new Error('no_rpc');
        err.code = 'NO_RPC';
        throw err;
    }

    const transports = urls.map(u => http(u, {
        batch: true,
        retryCount: 1,
        retryDelay: 300,
        timeout: 8000,
    }));

    return createPublicClient({
        chain,
        transport: fallback(transports, { rank: 'roundRobin', retryCount: 2, retryDelay: 400 }),
    });
}

const ERC20_ABI = parseAbi(['function balanceOf(address) view returns (uint256)']);

/* ---------- токены по сетям ---------- */
const TOKENS_BY_CHAIN = {
    1: [
        { symbol: 'USDT', decimals: 6, address: '0xdAC17F958D2ee523a2206206994597C13D831ec7' },
        { symbol: 'USDC', decimals: 6, address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' },
        { symbol: 'WETH', decimals: 18, address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2' },
    ],
    56: [
        { symbol: 'USDT', decimals: 18, address: '0x55d398326f99059fF775485246999027B3197955' },
        { symbol: 'USDC', decimals: 18, address: '0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d' },
        { symbol: 'WBNB', decimals: 18, address: '0xBB4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c' },
    ],
};

// Сети, которые агрегируем «по умолчанию»
const AGGREGATE_CHAIN_IDS = [1, 56];

const CACHE = new Map();
const ckey = (addr, chainId) => `h:${chainId}:${addr.toLowerCase()}`;

/* ---------- расчёт по одной сети ---------- */
async function computeHoldingsSingle(address, chainId, debug = false) {
    const meta = { reason: null, chainId: Number(chainId || 1), rpcUrls: [] };

    if (!address) { const e = new Error('address_required'); e.status = 400; throw e; }
    if (!isAddress(address)) { const e = new Error('bad_address'); e.status = 400; throw e; }

    const chain = chainById(chainId || 1);
    const K = ckey(address, chain.id);
    const cached = CACHE.get(K);

    try {
        const client = makeClient(chain, meta);

        // 1) native
        let baseBal = 0n;
        try {
            baseBal = await client.getBalance({ address });
        } catch (e) {
            meta.nativeError = e?.shortMessage || e?.message || String(e);
        }

        const items = [];
        if (baseBal > 0n) {
            items.push({
                symbol: chain.id === 56 ? 'BNB' : (chain.nativeCurrency?.symbol || 'ETH'),
                amount: Number(formatUnits(baseBal, chain.nativeCurrency?.decimals ?? 18)),
                usd: 0,
                chainId: chain.id,
            });
        }

        // 2) ERC-20 — без multicall, поштучно
        const list = TOKENS_BY_CHAIN[chain.id] || [];
        if (list.length) {
            try {
                const reads = await Promise.allSettled(
                    list.map(t =>
                        client.readContract({
                            address: t.address,
                            abi: ERC20_ABI,
                            functionName: 'balanceOf',
                            args: [address],
                        })
                    )
                );
                reads.forEach((r, i) => {
                    if (r.status !== 'fulfilled') return;
                    const t = list[i];
                    const raw = r.value;
                    if (raw && raw > 0n) {
                        items.push({
                            symbol: t.symbol,
                            amount: Number(formatUnits(raw, t.decimals)),
                            usd: 0,
                            chainId: chain.id,
                        });
                    }
                });
            } catch (e) {
                meta.erc20Error = e?.shortMessage || e?.message || String(e);
            }
        }

        // 3) цены → usd
        try {
            const symbols = items.map(i => i.symbol);
            const priceMap = await fetchUsdPrices(symbols);
            for (const it of items) {
                const id = COINGECKO_IDS[it.symbol];
                const p = id && priceMap[id] ? Number(priceMap[id].usd || 0) : 0;
                it.usd = Number((it.amount || 0) * p);
            }
        } catch (e) {
            console.warn('[prices]', e?.message || e);
        }

        const data = {
            items,
            totals: { usd: items.reduce((s, i) => s + Number(i.usd || 0), 0) }
        };
        CACHE.set(K, { at: Date.now(), data });

        if (debug) data.meta = { ...meta, cached: false, nativeHadBalance: baseBal > 0n };
        return data;
    } catch (e) {
        const isRateLimit = /429|Too many|rate/i.test(String(e?.message || e || ''));
        const meta = { reason: e.code === 'NO_RPC' ? 'no_rpc' : isRateLimit ? 'rate_limit' : (e.message || 'network_error'), chainId };
        if (isRateLimit && cached) {
            const data = { ...cached.data };
            if (debug) data.meta = { ...meta, cached: true };
            return data;
        }
        const data = { items: [], totals: { usd: 0 } };
        if (debug) data.meta = meta;
        return data;
    }
}

/* ---------- агрегация по нескольким сетям ---------- */
function mergeItemsBySymbol(arrays) {
    const map = new Map(); // symbol -> { symbol, amount, usd }
    for (const a of arrays) {
        for (const it of (a || [])) {
            const key = it.symbol;
            const prev = map.get(key) || { symbol: key, amount: 0, usd: 0 };
            map.set(key, {
                symbol: key,
                amount: Number(prev.amount) + Number(it.amount || 0),
                usd: Number(prev.usd) + Number(it.usd || 0),
            });
        }
    }
    return Array.from(map.values()).sort((a, b) => Number(b.usd) - Number(a.usd));
}

async function computeHoldingsAggregate(address, chains, debug = false) {
    const results = await Promise.all(chains.map(id => computeHoldingsSingle(address, id, debug)));
    const items = mergeItemsBySymbol(results.map(r => r.items));
    const totals = { usd: items.reduce((s, i) => s + Number(i.usd || 0), 0) };
    const data = { items, totals };
    if (debug) {
        data.meta = {
            aggregate: chains,
            perChain: results.map((r, i) => ({
                chainId: chains[i],
                totals: r.totals,
                items: r.items, // отдадим покомпонентно для фронта
            })),
        };
    } else {
        // без debug тоже отдаём perChain, чтобы фронт всегда мог переключать сети
        data.meta = {
            aggregate: chains,
            perChain: results.map((r, i) => ({
                chainId: chains[i],
                totals: r.totals,
                items: r.items,
            })),
        };
    }
    return data;
}

/* ---------- routes ---------- */
router.get('/holdings', async (req, res) => {
    const address = String(req.query.address || '').trim();
    const chainId = Number(req.query.chainId || 1);
    const debug = String(req.query.debug || '') === '1';
    const aggregate = String(req.query.aggregate || '') === '1';

    try {
        if (aggregate) {
            const data = await computeHoldingsAggregate(address, AGGREGATE_CHAIN_IDS, debug);
            return res.json(data);
        }
        const data = await computeHoldingsSingle(address, chainId, debug);
        return res.json(data);
    } catch (e) {
        res.status(e.status || 500).json({ error: e.message || 'unhandled' });
    }
});

// Совместимость
router.get('/portfolio', async (req, res) => {
    const address = String(req.query.address || '').trim();
    const chainId = Number(req.query.chainId || 1);
    const debug = String(req.query.debug || '') === '1';
    const aggregate = String(req.query.aggregate || '') === '1';

    const data = aggregate
        ? await computeHoldingsAggregate(address, AGGREGATE_CHAIN_IDS, debug)
        : await computeHoldingsSingle(address, chainId, debug);

    res.json({ items: data.items, totals: data.totals, ...(data.meta ? { meta: data.meta } : {}) });
});

router.get('/summary', async (req, res) => {
    const address = String(req.query.address || '').trim();
    const chainId = Number(req.query.chainId || 1);
    const debug = String(req.query.debug || '') === '1';
    const aggregate = String(req.query.aggregate || '') === '1';

    const data = aggregate
        ? await computeHoldingsAggregate(address, AGGREGATE_CHAIN_IDS, debug)
        : await computeHoldingsSingle(address, chainId, debug);

    res.json({ totals: data.totals, ...(data.meta ? { meta: data.meta } : {}) });
});

module.exports = router;
