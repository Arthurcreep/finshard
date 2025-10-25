const express = require('express');
const crypto = require('crypto');
const { recoverAddress, hashMessage } = require('viem');

const router = express.Router();

// твой адрес как админ (lowercase!)
const ADMIN_ADDRESSES = new Set(['0x9a36464b79301d45c622b553eedf62479253c2ea']);

router.get('/nonce', (req, res) => {
  try {
    const nonce = crypto.randomBytes(16).toString('hex');
    if (!req.session || typeof req.session !== 'object') req.session = {};
    req.session.nonce = nonce;
    res.json({ nonce });
  } catch (e) {
    console.error('[auth][nonce] fail:', e);
    res.status(500).json({ error: 'nonce_failed', message: e.message });
  }
});

router.post('/wc-login', async (req, res) => {
  try {
    const { address, message, signature } = req.body || {};
    if (!address || !message || !signature) return res.status(400).json({ error: 'bad_request' });
    if (!req.session?.nonce || !message.includes(req.session.nonce)) {
      return res.status(400).json({ error: 'invalid_nonce' });
    }

    const recovered = await recoverAddress({ hash: hashMessage(message), signature });
    if (recovered.toLowerCase() !== String(address).toLowerCase()) {
      return res.status(401).json({ error: 'bad_signature' });
    }

    const User = require('../models/User');
    const addr = String(address).toLowerCase();
    let user = await User.findOne({ where: { address: addr } });
    if (!user) user = await User.create({ address: addr });

    if (ADMIN_ADDRESSES.has(addr) && user.role !== 'admin') {
      await user.update({ role: 'admin' });
    }

    const isProd = process.env.NODE_ENV === 'production';
    res.cookie('uid', String(user.id), {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      secure: isProd,
    });
    req.session.nonce = null;
    res.json({ ok: true });
  } catch (e) {
    console.error('[auth][wc-login] fail:', e);
    res.status(500).json({ error: 'auth_failed', message: e.message });
  }
});

router.post('/logout', (req, res) => {
  try {
    res.clearCookie('uid', { path: '/' });
    if (req.session) req.session.destroy(() => {});
    res.json({ ok: true });
  } catch {
    res.json({ ok: true });
  }
});

router.get('/me', async (req, res) => {
  try {
    const uid = req.cookies?.uid;
    if (!uid) return res.status(401).json({ error: 'unauthorized' });
    const User = require('../models/User');
    const user = await User.findByPk(uid);
    if (!user) return res.status(401).json({ error: 'unauthorized' });
    res.json({ id: user.id, address: user.address, role: user.role });
  } catch (e) {
    res.status(500).json({ error: 'me_failed', message: e.message });
  }
});

module.exports = router;
