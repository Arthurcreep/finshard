// backend/src/services/tx.service.js
// Fetch real transactions from Etherscan/BscScan/Polygonscan and normalize.
// Node >=18 (global fetch)

function explorerFor(chainId) {
  const id = Number(chainId) || 1;
  if (id === 56) return { base: 'https://api.bscscan.com/api', key: process.env.BSCSCAN_KEY, symbol: 'BNB' };
  if (id === 137) return { base: 'https://api.polygonscan.com/api', key: process.env.POLYGONSCAN_KEY, symbol: 'MATIC' };
  return { base: 'https://api.etherscan.io/api', key: process.env.ETHERSCAN_KEY, symbol: 'ETH' };
}

async function getJson(url, params) {
  const qs = new URLSearchParams(params);
  const res = await fetch(url + '?' + qs.toString());
  if (!res.ok) throw new Error('http_' + res.status);
  const json = await res.json();

  // NB: У *scan API бывают ответы status:"0" c message "No transactions found"
  // Это НЕ ошибка — возвращаем пустой массив.
  const msg = String(json?.message || '').toLowerCase();
  const resultStr = String(json?.result || '').toLowerCase();
  if (json?.status === '0') {
    if (msg.includes('no transactions') || resultStr.includes('no transactions')) {
      return { ...json, result: [] };
    }
    // rate limit / другие NOTOK ошибки — бросаем
    throw new Error((json?.message || 'NOTOK') + ':' + (json?.result || ''));
  }

  return json;
}

function fromWei(value, decimals = 18) {
  try {
    const s = String(value || '0');
    if (!/^\d+$/.test(s)) return 0;
    const pad = Math.max(0, decimals);
    const len = s.length;
    const int = len > pad ? s.slice(0, len - pad) : '0';
    const frac = len > pad ? s.slice(len - pad) : s.padStart(pad, '0');
    const n = Number((int + '.' + frac).replace(/\.$/, ''));
    return Number.isFinite(n) ? n : 0;
  } catch { return 0; }
}

/**
 * Fetches native txs and ERC20 transfers, merges, and normalizes.
 * @param {string} address
 * @param {number} chainId
 * @param {object} opts - { page, offset, sort }
 */
async function fetchTx(address, chainId, opts = {}) {
  const addr = String(address || '').toLowerCase();
  const { base, key, symbol } = explorerFor(chainId);
  const page = Number(opts.page || 1);
  const offset = Math.min(100, Number(opts.offset || 50));
  const sort = (opts.sort === 'asc' ? 'asc' : 'desc');

  // Тянем два источника независимо и НЕ валим весь запрос, если один вернул "нет данных"
  let normal = [];
  let token = [];

  try {
    const j = await getJson(base, {
      module: 'account',
      action: 'txlist',
      address: addr,
      startblock: 0,
      endblock: 99999999,
      page, offset, sort,
      apikey: key || ''
    });
    normal = Array.isArray(j.result) ? j.result : [];
  } catch (e) {
    // только логируем; это не критично для отображения (например, rate limit на одном эндпоинте)
    console.warn('[tx.service] txlist failed:', e && e.message ? e.message : e);
    normal = [];
  }

  try {
    const j2 = await getJson(base, {
      module: 'account',
      action: 'tokentx',
      address: addr,
      startblock: 0,
      endblock: 99999999,
      page, offset, sort,
      apikey: key || ''
    });
    token = Array.isArray(j2.result) ? j2.result : [];
  } catch (e) {
    console.warn('[tx.service] tokentx failed:', e && e.message ? e.message : e);
    token = [];
  }

  // Нормализуем
  const items = [];

  for (const tx of normal) {
    const isIncoming = String(tx.to || '').toLowerCase() === addr;
    const amount = fromWei(tx.value, 18) * (isIncoming ? +1 : -1);
    items.push({
      id: tx.hash,
      time: Number(tx.timeStamp) * 1000,
      symbol,
      amount,
      hash: tx.hash
    });
  }

  for (const tr of token) {
    const dec = Number(tr.tokenDecimal || 18) || 18;
    const isIncoming = String(tr.to || '').toLowerCase() === addr;
    const amount = fromWei(tr.value, dec) * (isIncoming ? +1 : -1);
    items.push({
      id: tr.hash + ':' + tr.logIndex,
      time: Number(tr.timeStamp) * 1000,
      symbol: tr.tokenSymbol || 'TOKEN',
      amount,
      hash: tr.hash
    });
  }

  // Дедуп + сортировка по убыванию времени
  const map = new Map();
  for (const it of items) map.set(it.id, it);
  const merged = Array.from(map.values()).sort((a, b) => b.time - a.time);

  return { items: merged, meta: { address: addr, chainId, page, offset, sort } };
}

module.exports = { fetchTx };
