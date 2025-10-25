// server/index.js
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
dotenv.config();

import healthRoutes from './routes/health.js';
import relayerRoutes from './routes/relayer.js';
import applicationsRoutes from './routes/applications.js';
import withdrawRoutes from './routes/withdraw.js';

const app = express();
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

// простой логгер запросов
app.use((req, _res, next) => {
  const t0 = Date.now();
  const ip = req.ip || req.connection?.remoteAddress || 'unknown';
  console.log(`[REQ] ${req.method} ${req.originalUrl} from ${ip}`);
  req.on('close', () => {
    const dt = Date.now() - t0;
    console.log(`[RES] ${req.statusCode || 200} in ${dt}ms`);
  });
  next();
});

app.use('/api/health', healthRoutes);
app.use('/api/relayer', relayerRoutes);
app.use('/api/applications', applicationsRoutes);
app.use('/api/withdraw', withdrawRoutes);

const PORT = Number(process.env.PORT || 3001);
app.listen(PORT, async () => {
  console.log(`API ready on http://localhost:${PORT}`);

  // Опционально: «холодное» возобновление при старте сервера —
  // если хотите, перечислите адреса через переменную окружения RESUME_ON_BOOT (через запятую)
  // и мы вызовем /ensure для каждого.
  try {
    const resumeList = String(process.env.RESUME_ON_BOOT || '').trim();
    if (resumeList) {
      const users = resumeList
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const { default: fetch } = await import('node-fetch');
      for (const user of users) {
        console.log('[BOOT] ensure for', user);
        await fetch(`http://localhost:${PORT}/api/relayer/ensure`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            user,
            assetKind: 'BNB',
            // если CONTRACT и RPC_URL определены в .env — можно не передавать
            contract: process.env.CONTRACT,
            rpcUrl: process.env.RPC_URL || process.env.BSC_RPC,
          }),
        })
          .then((r) => r.json())
          .then((j) => {
            console.log('[BOOT][ensure] resp:', j);
          })
          .catch((e) => console.error('[BOOT][ensure] ERR', e));
      }
    }
  } catch (e) {
    console.error('[BOOT] resume failed:', e);
  }
});
