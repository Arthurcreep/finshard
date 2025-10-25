// server/routes/withdraw.js
import { Router } from 'express';
import dotenv from 'dotenv';
dotenv.config();

import { simulateWithdraw, prettyErr } from '../withdrawHelper.js';
import { inspectState } from '../relayerManager.js';

const r = Router();

/**
 * POST /api/withdraw/simulate
 * body: { user:"0x...", contract?:"0x...", rpcUrl?:"https://..." }
 * Возвращает:
 *  - если есть USDT: { ok:true, fn, args, to, amountRaw }
 *  - если USDT=0, но есть BNB: { ok:false, next:"rebound_required", hint:{ side:"SELL", endpoint:"/api/relayer/force", body:{...} } }
 *  - если вообще пусто: { ok:false, error:"nothing to withdraw (balance is 0)" }
 */
r.post('/simulate', async (req, res) => {
  try {
    const { user, contract, rpcUrl } = req.body || {};
    console.log('[withdraw/simulate] body:', req.body);

    if (!/^0x[a-fA-F0-9]{40}$/.test(user || '')) {
      console.log('[withdraw/simulate] invalid user:', user);
      return res.status(400).json({ error: 'invalid user address' });
    }

    const RPC = String(
      rpcUrl || process.env.RPC_URL || process.env.BSC_RPC || 'https://bsc-dataseed.binance.org',
    );
    const CONTRACT = String(contract || process.env.CONTRACT || '').trim();

    if (!/^0x[a-fA-F0-9]{40}$/.test(CONTRACT)) {
      console.log('[withdraw/simulate] invalid contract:', CONTRACT);
      return res.status(400).json({ error: 'invalid contract address' });
    }

    console.log('[withdraw/simulate] using RPC:', RPC);
    console.log('[withdraw/simulate] using CONTRACT:', CONTRACT);
    console.log('[withdraw/simulate] using USER:', user);

    // 1) Сначала пробуем обычную симуляцию вывода USDT
    const result = await simulateWithdraw({ rpcUrl: RPC, contract: CONTRACT, user }).catch((e) => {
      console.warn('[withdraw/simulate] simulateWithdraw threw:', e?.message || e);
      return { ok: false, error: prettyErr(e) };
    });

    // Если всё ОК — возвращаем сразу
    if (result?.ok) {
      res.set('Cache-Control', 'no-store');
      return res.json(result);
    }

    // 2) Иначе смотрим состояние сейфа: может, у нас позиция в BNB?
    const state = await inspectState({ user, contract: CONTRACT, rpcUrl: RPC }).catch(() => null);
    const vaultUSDT = BigInt(String(state?.vault ?? '0'));
    const vaultBNB = BigInt(String(state?.vaultBNB ?? '0'));

    if (vaultUSDT === 0n && vaultBNB > 0n) {
      // есть BNB-позиция — подсказываем шаг SELL через /api/relayer/force
      const hint = {
        side: 'SELL',
        endpoint: '/api/relayer/force',
        body: {
          user,
          assetKind: 'BNB',
          slippageBps: 50,
          gasLimit: 1_200_000,
          deadlineMin: 10,
          confirm: process.env.FORCE_CONFIRM || 'I_KNOW_WHAT_IM_DOING_ON_MAINNET',
        },
        note: 'Position is in BNB. Rebound to USDT first, then withdraw.',
      };
      return res.status(400).json({ ok: false, next: 'rebound_required', hint });
    }

    // 3) Иначе — действительно нечего выводить
    return res
      .status(400)
      .json(result?.error ? result : { ok: false, error: 'nothing to withdraw (balance is 0)' });
  } catch (e) {
    console.error('[withdraw/simulate] error:', e);
    return res.status(500).json({ error: prettyErr(e) });
  }
});

export default r;
