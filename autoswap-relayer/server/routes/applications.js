// server/routes/applications.js
import { Router } from 'express';
const r = Router();

// псевдо-БД в памяти
const store = [];

r.post('/create', (req, res) => {
  try {
    const payload = req.body || {};
    const id = String(Date.now());
    store.push({ id, ...payload });
    console.log('[applications/create] saved id:', id);
    return res.json({ ok: true, id });
  } catch (e) {
    console.error('[applications/create] error:', e);
    return res.status(500).json({ error: String(e?.message || e) });
  }
});

r.get('/list', (_req, res) => {
  try {
    res.json({ items: store });
  } catch (e) {
    console.error('[applications/list] error:', e);
    res.status(500).json({ error: String(e?.message || e) });
  }
});

export default r;
