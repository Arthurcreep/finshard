import { JsonRpcProvider, Contract, Wallet } from 'ethers';
import dotenv from 'dotenv';
import { EventEmitter } from 'events';
dotenv.config();

/** ---------- LIVE BUS (для SSE) ---------- */
export const relayerBus = new EventEmitter();
relayerBus.setMaxListeners(1000);

/** ---------- CONFIG ---------- */

// RPC
const RPC_URL = process.env.RPC_URL || process.env.BSC_RPC || 'https://bsc-dataseed.binance.org';

// Chainlink feeds (BSC)
const FEED_BTCUSD_DEFAULT = '0x264990fbd0A4796A3E3d8E37C4d5F87a3aCa5Ebf'; // 8 decimals (BTC/USD)
const FEED_BNBUSD_DEFAULT = '0x0567F2323251f0Aab15c8dFb1967E4e8A7D42aeE'; // 8 decimals (BNB/USD)

const FEEDS = {
  BTC: (process.env.FEED_BTCUSD || '').trim() || FEED_BTCUSD_DEFAULT,
  BNB: (process.env.FEED_BNBUSD || '').trim() || FEED_BNBUSD_DEFAULT,
};

// какой фид используем для сигналов (по контракту — BTC)
const FEED_SYMBOL = (process.env.FEED_SYMBOL || 'BTC').toUpperCase();

// Локальные пороги — только для диагностики; решение принимает контракт через shouldTrigger*
const DROP_BPS = Number(process.env.DROP_BPS ?? 50); // 0.5%
const RISE_BPS = Number(process.env.RISE_BPS ?? 50);

const EXECUTE_ONCHAIN = String(process.env.EXECUTE_ONCHAIN || '0') === '1';
const RELAYER_PK_RAW = (process.env.RELAYER_PK || '').trim();

/** ---------- ABIs ---------- */

// ВАЖНО: bnbBalances (а не bnbVault) + shouldTrigger/shouldTriggerRebound + геттеры
const SAFE_ABI = [
  'function balances(address) view returns (uint256)',
  'function bnbBalances(address) view returns (uint256)',
  'function shouldTrigger(address user) view returns (bool ready,uint256 dropBps,int256 basePrice,int256 nowPrice,uint8 feedDecimals,uint256 userVault)',
  'function shouldTriggerRebound(address user) view returns (bool ready,uint256 riseBps,int256 reboundBasePrice,int256 nowPrice,uint8 feedDecimals,uint256 bnbVault)',
  'function performAutoBNBFor(address user, uint16 slipBps, uint256 deadline) external',
  'function performReboundToUSDTFor(address user, uint16 slipBps, uint256 deadline) external',
  'function router() view returns (address)',
  'function WBNB() view returns (address)',
  'function usdt() view returns (address)',
];

const FEED_ABI = [
  'function decimals() view returns (uint8)',
  'function latestRoundData() view returns (uint80,int256,uint256,uint256,uint80)',
];

/** ---------- Runtime ---------- */

const runners = new Map(); // key -> { timer, cfg, startedAt }
const baselines = new Map(); // userLower -> { price, at, reboundPrice, reboundAt }

/** ---------- helpers ---------- */

const toLower = (a) => String(a || '').toLowerCase();
const keyOf = ({ user, assetKind }) => `${toLower(user)}-${String(assetKind || '').toUpperCase()}`;

function toStr(x) {
  if (typeof x === 'bigint') return x.toString();
  return x?.toString?.() ?? String(x);
}

function getFeedAddress(symbol) {
  const s = String(symbol || FEED_SYMBOL).toUpperCase();
  return { address: FEEDS[s] || FEEDS.BTC, symbol: s };
}

// Диагностические bps (для логов)
function bpsDown(fromBig, toBig) {
  try {
    const from = BigInt(fromBig);
    const to = BigInt(toBig);
    if (from <= 0n) return 0;
    const diff = from - to;
    if (diff <= 0n) return 0;
    return Number((diff * 10000n) / from);
  } catch {
    return 0;
  }
}
function bpsUp(fromBig, toBig) {
  try {
    const from = BigInt(fromBig);
    const to = BigInt(toBig);
    if (from <= 0n) return 0;
    const diff = to - from;
    if (diff <= 0n) return 0;
    return Number((diff * 10000n) / from);
  } catch {
    return 0;
  }
}
function isHexPk(pk) {
  return /^0x[0-9a-fA-F]{64}$/.test(pk);
}

/** ---------- Public: inspectState ---------- */
export async function inspectState({ user, contract, rpcUrl }) {
  const provider = new JsonRpcProvider(rpcUrl || RPC_URL);

  if (!/^0x[a-fA-F0-9]{40}$/.test(String(contract || '')))
    throw new Error('inspectState: invalid contract');

  const safe = new Contract(contract, SAFE_ABI, provider);

  let vault = 0n;
  try {
    vault = await safe.balances(user);
  } catch {}
  let vaultBNB = 0n;
  try {
    vaultBNB = await safe.bnbBalances(user);
  } catch {}

  const base = baselines.get(toLower(user)) || {
    price: '0',
    at: 0,
    reboundPrice: '0',
    reboundAt: 0,
  };

  const { address: feedAddr, symbol: feedSymbol } = getFeedAddress(FEED_SYMBOL);
  const feed = new Contract(feedAddr, FEED_ABI, provider);

  let feedDecimals = 8;
  try {
    feedDecimals = await feed.decimals();
  } catch {}
  let nowAnswer = 0n;
  try {
    const [, a] = await feed.latestRoundData();
    nowAnswer = BigInt(a);
  } catch {}

  // локальные (диагностические) bps
  const dropLocal = bpsDown(base.price || '0', nowAnswer);
  const riseLocal = bpsUp(base.reboundPrice || '0', nowAnswer);

  // контрактные ready/bps
  let onReadyIn = false,
    onDropBps = 0;
  try {
    const r = await safe.shouldTrigger(user);
    onReadyIn = !!r[0];
    onDropBps = Number(r[1]);
  } catch {}
  let onReadyOut = false,
    onRiseBps = 0;
  try {
    const r2 = await safe.shouldTriggerRebound(user);
    onReadyOut = !!r2[0];
    onRiseBps = Number(r2[1]);
  } catch {}

  const trigger = {
    ready: onReadyIn,
    dropBps: onDropBps,
    dropBpsLocal: dropLocal,
    basePrice: base.price,
    nowPrice: toStr(nowAnswer),
    feedDecimals,
    userVault: toStr(vault),
  };
  const rebound = {
    ready: onReadyOut,
    riseBps: onRiseBps,
    riseBpsLocal: riseLocal,
    reboundBasePrice: base.reboundPrice || '0',
    nowPrice: toStr(nowAnswer),
    feedDecimals,
    bnbVault: toStr(vaultBNB),
  };

  return {
    user,
    contract,
    rpcUrl: 'provider',
    feed: { address: feedAddr, symbol: feedSymbol, decimals: feedDecimals },
    vault: toStr(vault),
    vaultBNB: toStr(vaultBNB),
    baseline: base,
    trigger,
    rebound,
  };
}

/** ---------- Runner loop ---------- */
function makeRunnerLoop(cfg) {
  const { user, assetKind, pollMs, contract, rpcUrl } = cfg;

  const key = keyOf({ user, assetKind });
  const provider = new JsonRpcProvider(rpcUrl || RPC_URL);
  const safeR = new Contract(contract, SAFE_ABI, provider);

  // безопасный signer
  let signer = null;
  let safeW = null;
  if (EXECUTE_ONCHAIN) {
    if (!isHexPk(RELAYER_PK_RAW)) {
      console.warn(`[relayer ${key}] EXECUTE_ONCHAIN=1, но RELAYER_PK невалидный — read-only`);
    } else {
      try {
        signer = new Wallet(RELAYER_PK_RAW, provider);
        safeW = new Contract(contract, SAFE_ABI, signer);
      } catch (e) {
        console.warn(`[relayer ${key}] Wallet init failed — read-only`, e?.message || e);
      }
    }
  }

  const { address: feedAddr, symbol: feedSymbol } = getFeedAddress(FEED_SYMBOL);
  const feed = new Contract(feedAddr, FEED_ABI, provider);

  const publish = (evt, payload) => {
    try {
      relayerBus.emit(evt, { ts: Date.now(), ...payload });
    } catch {}
  };

  async function tick() {
    try {
      // состояние сейфа
      let vault = 0n;
      try {
        vault = await safeR.balances(user);
      } catch {}
      let vaultBNB = 0n;
      try {
        vaultBNB = await safeR.bnbBalances(user);
      } catch {}

      // цена для baseline/логов
      const dec = await feed.decimals().catch(() => 8);
      const [, answer] = await feed.latestRoundData().catch(() => [0n, 0n, 0n, 0n, 0n]);
      const now = BigInt(answer || 0n);

      // первичная базовая цена
      const b = baselines.get(toLower(user)) || {
        price: '0',
        at: 0,
        reboundPrice: '0',
        reboundAt: 0,
      };
      if ((vault > 0n || vaultBNB > 0n) && (b.at === 0 || b.price === '0')) {
        b.price = now.toString();
        b.at = Math.floor(Date.now() / 1000);
        baselines.set(toLower(user), b);
        console.log(`[baseline set ${key}] ${feedSymbol} price=${b.price} (dec=${dec}) at=${b.at}`);
      }

      // контрактные триггеры
      let onReadyIn = false,
        onDropBps = 0;
      try {
        const r = await safeR.shouldTrigger(user);
        onReadyIn = !!r[0];
        onDropBps = Number(r[1]);
      } catch {}
      let onReadyOut = false,
        onRiseBps = 0;
      try {
        const r2 = await safeR.shouldTriggerRebound(user);
        onReadyOut = !!r2[0];
        onRiseBps = Number(r2[1]);
      } catch {}

      // локальные (диагностические) bps
      const dropLocal = bpsDown(b.price || '0', now);
      const riseLocal = bpsUp(b.reboundPrice || '0', now);

      console.log(
        `[tick ${key}] feed=${feedSymbol} now=${now.toString()} dec=${dec} ` +
          `vaultUSDT=${vault.toString()} vaultBNB=${vaultBNB.toString()} ` +
          `readyIn=${onReadyIn} dropBps=${onDropBps} (local=${dropLocal}/${DROP_BPS}) ` +
          `readyOut=${onReadyOut} riseBps=${onRiseBps} (local=${riseLocal}/${RISE_BPS}) ` +
          `exec=${EXECUTE_ONCHAIN && !!safeW}`,
      );

      // публикуем tick в SSE
      const phase = vaultBNB > 0n ? 'IN_POSITION_BNB' : vault > 0n ? 'IN_USDT' : 'EMPTY';
      publish('tick', {
        key,
        phase,
        user,
        contract,
        feed: feedSymbol,
        priceNow: now.toString(),
        feedDecimals: dec,
        vaultUSDT: vault.toString(),
        vaultBNB: vaultBNB.toString(),
        dropBps: onDropBps,
        riseBps: onRiseBps,
        targetBps: 50,
        readyIn: onReadyIn,
        readyOut: onReadyOut,
        execEnabled: EXECUTE_ONCHAIN && !!safeW,
      });

      // --- Исполнение строго по контрактным ready-флагам ---
      if (EXECUTE_ONCHAIN && safeW) {
        // вход (USDT -> BNB)
        if (onReadyIn) {
          try {
            const slip = Math.min(cfg.slippageBps ?? 50, 100); // <= 1%
            const deadline = Math.floor(Date.now() / 1000) + (cfg.deadlineMin ?? 10) * 60;
            console.log(`[exec ${key}] BUY: slip=${slip}bps deadline=${deadline}`);
            publish('exec', { key, user, side: 'BUY', stage: 'sending' });
            const tx = await safeW.performAutoBNBFor(user, slip, deadline, {
              gasLimit: cfg.gasLimit,
            });
            console.log(`[tx ${key}] BUY sent: ${tx.hash}`);
            const rc = await tx.wait();
            console.log(`[tx ${key}] BUY mined status=${rc.status} gas=${rc.gasUsed}`);
            publish('exec', {
              key,
              user,
              side: 'BUY',
              stage: 'mined',
              status: Number(rc?.status || 0),
              tx: tx.hash,
            });
            // база для ребаунда
            b.reboundPrice = now.toString();
            b.reboundAt = Math.floor(Date.now() / 1000);
            baselines.set(toLower(user), b);
          } catch (e) {
            console.error(`[ERR ${key}] BUY`, e?.reason || e?.message || e);
          }
        }

        // выход (BNB -> USDT)
        if (onReadyOut) {
          try {
            const slip = Math.min(cfg.slippageBps ?? 50, 100);
            const deadline = Math.floor(Date.now() / 1000) + (cfg.deadlineMin ?? 10) * 60;
            console.log(`[exec ${key}] SELL: slip=${slip}bps deadline=${deadline}`);
            publish('exec', { key, user, side: 'SELL', stage: 'sending' });
            const tx = await safeW.performReboundToUSDTFor(user, slip, deadline, {
              gasLimit: cfg.gasLimit,
            });
            console.log(`[tx ${key}] SELL sent: ${tx.hash}`);
            const rc = await tx.wait();
            console.log(`[tx ${key}] SELL mined status=${rc.status} gas=${rc.gasUsed}`);
            publish('exec', {
              key,
              user,
              side: 'SELL',
              stage: 'mined',
              status: Number(rc?.status || 0),
              tx: tx.hash,
            });
            // новая база для следующего входа
            b.price = now.toString();
            b.at = Math.floor(Date.now() / 1000);
            baselines.set(toLower(user), b);
          } catch (e) {
            console.error(`[ERR ${key}] SELL`, e?.reason || e?.message || e);
          }
        }
      }
    } catch (e) {
      console.error(`[ERR  ${key}]`, e?.reason || e?.message || e);
    } finally {
      const entry = runners.get(key);
      if (entry) {
        entry.timer = setTimeout(tick, cfg.pollMs);
        runners.set(key, entry);
      }
    }
  }

  return {
    start() {
      const feedInfo = getFeedAddress(FEED_SYMBOL);
      console.log(`[relayer ${key}] loop start (feed=${FEED_SYMBOL} @ ${feedInfo.address})`);
      // адреса из контракта для верификации деплоя
      (async () => {
        try {
          const [router, wbnb, usdt] = await Promise.all([
            safeR.router().catch(() => null),
            safeR.WBNB().catch(() => null),
            safeR.usdt().catch(() => null),
          ]);
          if (router || wbnb || usdt) {
            console.log(`[relayer ${key}] cfg router=${router} WBNB=${wbnb} USDT=${usdt}`);
          }
        } catch {}
      })();

      const entry = runners.get(key) || { timer: null, cfg, startedAt: Date.now() };
      entry.timer = setTimeout(tick, 0);
      entry.startedAt = Date.now();
      runners.set(key, entry);
    },
    stop() {
      const entry = runners.get(key);
      if (entry?.timer) clearTimeout(entry.timer);
      runners.delete(key);
      console.log(`[relayer ${key}] stopped`);
    },
  };
}

/** ---------- Public: runner controls ---------- */
export function startRelayer({
  user,
  assetKind = 'BNB',
  slippageBps = 50,
  pollMs = 15000,
  gasLimit = 1_200_000,
  deadlineMin = 10,
  contract,
  rpcUrl,
}) {
  if (!/^0x[a-fA-F0-9]{40}$/.test(String(user || ''))) throw new Error('invalid user');

  const CONTRACT = String(contract || process.env.CONTRACT || '');
  if (!/^0x[a-fA-F0-9]{40}$/.test(CONTRACT))
    throw new Error('invalid contract (pass contract or set CONTRACT in .env)');

  const key = keyOf({ user, assetKind });
  if (runners.has(key)) {
    return { key, alreadyRunning: true, cfg: runners.get(key).cfg };
  }

  const cfg = {
    user,
    assetKind: String(assetKind).toUpperCase(),
    slippageBps,
    pollMs,
    gasLimit,
    deadlineMin,
    contract: CONTRACT,
    rpcUrl: rpcUrl || RPC_URL,
  };

  const loop = makeRunnerLoop(cfg);
  loop.start();
  return { key, started: true, cfg };
}

export function stopRelayer(key) {
  const entry = runners.get(key);
  if (!entry) return false;
  const loop = makeRunnerLoop(entry.cfg);
  loop.stop();
  return true;
}

export function listRelayers() {
  return Array.from(runners.entries()).map(([key, v]) => ({
    key,
    user: v.cfg.user,
    assetKind: v.cfg.assetKind,
    slippageBps: v.cfg.slippageBps,
    pollMs: v.cfg.pollMs,
    gasLimit: v.cfg.gasLimit,
    deadlineMin: v.cfg.deadlineMin,
    contract: v.cfg.contract,
    rpcUrl: v.cfg.rpcUrl,
    startedAt: v.startedAt,
  }));
}

export async function forceOnceSwap({ user, assetKind, slippageBps, gasLimit, deadlineMin }) {
  const provider = new JsonRpcProvider(RPC_URL);
  const CONTRACT = String(process.env.CONTRACT || '');
  if (!/^0x[a-fA-F0-9]{40}$/.test(CONTRACT)) throw new Error('invalid CONTRACT');

  if (!EXECUTE_ONCHAIN) return { ok: false, error: 'EXECUTE_ONCHAIN=0' };
  if (!isHexPk(RELAYER_PK_RAW)) return { ok: false, error: 'invalid RELAYER_PK' };

  const signer = new Wallet(RELAYER_PK_RAW, provider);
  const safe = new Contract(CONTRACT, SAFE_ABI, signer);

  const slip = Math.min(Number(slippageBps ?? 50), 100);
  const gasL = Number(gasLimit ?? 1_200_000);
  const deadline = Math.floor(Date.now() / 1000) + Number(deadlineMin ?? 10) * 60;

  // Решаем сторону по состоянию сейфа + контрактным ready-флагам
  const [vault, vaultBNB] = await Promise.all([
    safe.balances(user).catch(() => 0n),
    safe.bnbBalances(user).catch(() => 0n),
  ]);

  if (vault > 0n) {
    const r = await safe.shouldTrigger(user).catch(() => [false]);
    if (!r[0]) return { ok: false, note: 'not ready (contract shouldTrigger=false)' };
    const tx = await safe.performAutoBNBFor(user, slip, deadline, { gasLimit: gasL });
    const rc = await tx.wait();
    return { ok: true, side: 'BUY', hash: tx.hash, status: String(rc?.status ?? '') };
  } else if (vaultBNB > 0n) {
    const r2 = await safe.shouldTriggerRebound(user).catch(() => [false]);
    if (!r2[0]) return { ok: false, note: 'not ready (contract shouldTriggerRebound=false)' };
    const tx = await safe.performReboundToUSDTFor(user, slip, deadline, { gasLimit: gasL });
    const rc = await tx.wait();
    return { ok: true, side: 'SELL', hash: tx.hash, status: String(rc?.status ?? '') };
  }
  return { ok: false, note: 'no position to act on' };
}
