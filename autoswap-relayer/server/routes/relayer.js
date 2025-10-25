import { Router } from 'express';
import dotenv from 'dotenv';
dotenv.config();

import {
  startRelayer,
  stopRelayer,
  listRelayers,
  forceOnceSwap,
  inspectState,
  relayerBus,
} from '../relayerManager.js';

const r = Router();

// 🔧 Хелпер: убираем BigInt из ответов
function sanitize(obj) {
  return JSON.parse(JSON.stringify(obj, (_k, v) => (typeof v === 'bigint' ? v.toString() : v)));
}

// утилита: ключ раннера
function keyOf(user, assetKind) {
  return `${String(user).toLowerCase()}-${String(assetKind || '').toUpperCase()}`;
}

/**
 * POST /api/relayer/start
 * body: { user, assetKind, slippageBps?, pollMs?, gasLimit?, deadlineMin?, contract?, rpcUrl? }
 */
r.post('/start', async (req, res) => {
  try {
    const { user, assetKind } = req.body || {};
    if (!/^0x[a-fA-F0-9]{40}$/.test(user || ''))
      return res.status(400).json({ error: 'invalid user address' });
    if (!['BNB', 'CAKE'].includes(String(assetKind || '').toUpperCase()))
      return res.status(400).json({ error: 'assetKind must be BNB or CAKE' });

    const info = startRelayer({
      user,
      assetKind: String(assetKind).toUpperCase(),
      slippageBps: Number(req.body.slippageBps ?? 50),
      pollMs: Number(req.body.pollMs ?? 15000),
      gasLimit: Number(req.body.gasLimit ?? 1200000),
      deadlineMin: Number(req.body.deadlineMin ?? 10),
      contract: req.body.contract,
      rpcUrl: req.body.rpcUrl,
    });

    res.json(sanitize({ ok: true, ...info }));
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
});

/**
 * 🔁 POST /api/relayer/ensure
 * body: { user, assetKind?, contract?, rpcUrl? }
 */
r.post('/ensure', async (req, res) => {
  try {
    const { user, assetKind, contract, rpcUrl } = req.body || {};
    if (!/^0x[a-fA-F0-9]{40}$/.test(user || ''))
      return res.status(400).json({ error: 'invalid user address' });

    const kind = String(assetKind || 'BNB').toUpperCase();
    const key = keyOf(user, kind);

    const state = await inspectState({
      user,
      contract: contract || process.env.CONTRACT,
      rpcUrl: rpcUrl || process.env.RPC_URL || process.env.BSC_RPC,
    });

    const vault = BigInt(String(state?.vault ?? '0'));
    const vaultBNB = BigInt(String(state?.vaultBNB ?? '0'));

    const hasPosition = vault > 0n || vaultBNB > 0n;
    const alreadyRunning = !!listRelayers().find((x) => x.key === key);

    let started = false;
    if (hasPosition && !alreadyRunning) {
      startRelayer({
        user,
        assetKind: kind,
        slippageBps: 50,
        pollMs: 15000,
        gasLimit: 1_200_000,
        deadlineMin: 10,
        contract: contract || process.env.CONTRACT,
        rpcUrl: rpcUrl || process.env.RPC_URL || process.env.BSC_RPC,
      });
      started = true;
    }

    return res.json(
      sanitize({
        ok: true,
        ensure: { triedStart: started, alreadyRunning, hasPosition },
        state,
        runners: listRelayers(),
      }),
    );
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
});

/** POST /api/relayer/stop  body: { user, assetKind } */
r.post('/stop', async (req, res) => {
  const { user, assetKind } = req.body || {};
  if (!/^0x[a-fA-F0-9]{40}$/.test(user || ''))
    return res.status(400).json({ error: 'invalid user address' });
  const key = keyOf(user, assetKind);
  const ok = stopRelayer(key);
  res.json(sanitize({ ok }));
});

/** GET /api/relayer/list */
r.get('/list', (_req, res) => {
  res.json(sanitize({ items: listRelayers() }));
});

/** GET /api/relayer/state?user=0x...&contract=...&rpcUrl=... */
r.get('/state', async (req, res) => {
  try {
    const { user, contract, rpcUrl } = req.query || {};
    if (!/^0x[a-fA-F0-9]{40}$/.test(user || ''))
      return res.status(400).json({ error: 'invalid user' });
    const info = await inspectState({
      user,
      contract: contract || process.env.CONTRACT,
      rpcUrl: rpcUrl || process.env.RPC_URL || process.env.BSC_RPC,
    });
    res.json(sanitize(info));
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
});

/**
 * POST /api/relayer/force
 * body: { user, assetKind, slippageBps?, gasLimit?, deadlineMin?, confirm }
 */
r.post('/force', async (req, res) => {
  try {
    if (process.env.ALLOW_FORCE_MAINNET !== '1') {
      return res
        .status(400)
        .json({ error: 'FORCE is disabled. Set ALLOW_FORCE_MAINNET=1 to enable.' });
    }
    const CONF = process.env.FORCE_CONFIRM || 'I_KNOW_WHAT_IM_DOING_ON_MAINNET';
    const { user, assetKind, slippageBps, gasLimit, deadlineMin, confirm } = req.body || {};
    if (confirm !== CONF) return res.status(400).json({ error: 'confirm string mismatch' });
    if (!/^0x[a-fA-F0-9]{40}$/.test(user || ''))
      return res.status(400).json({ error: 'invalid user address' });
    if (!['BNB', 'CAKE'].includes(String(assetKind || '').toUpperCase()))
      return res.status(400).json({ error: 'assetKind must be BNB or CAKE' });

    const info = await forceOnceSwap({
      user,
      assetKind: String(assetKind).toUpperCase(),
      slippageBps: Number(slippageBps ?? 50),
      gasLimit: Number(gasLimit ?? 1200000),
      deadlineMin: Number(deadlineMin ?? 10),
    });

    res.json(sanitize({ ok: true, ...info }));
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
});

/** ---------- NEW: SSE stream ---------- */
/** GET /api/relayer/stream?user=0x...  — события tick/exec в реальном времени */
r.get('/stream', (req, res) => {
  try {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');

    const userFilter = String(req.query.user || '').toLowerCase();
    const send = (event, dataObj) => {
      if (userFilter && String(dataObj?.user || '').toLowerCase() !== userFilter) return;
      res.write(`event: ${event}\n`);
      res.write(`data: ${JSON.stringify(dataObj)}\n\n`);
    };

    const onTick = (p) => send('tick', p);
    const onExec = (p) => send('exec', p);

    relayerBus.on('tick', onTick);
    relayerBus.on('exec', onExec);

    const ping = setInterval(() => {
      res.write(': ping\n\n');
    }, 15000);

    req.on('close', () => {
      clearInterval(ping);
      relayerBus.off('tick', onTick);
      relayerBus.off('exec', onExec);
    });

    res.write(': connected\n\n');
  } catch (_e) {
    res.status(500).end();
  }
});

export default r;
