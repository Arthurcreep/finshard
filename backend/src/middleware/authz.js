const User = require('../models/User');

async function requireAuth(req, res, next) {
  try {
    const uid = req.cookies?.uid;
    if (!uid) return res.status(401).json({ error: 'unauthorized' });
    const user = await User.findByPk(uid);
    if (!user) return res.status(401).json({ error: 'unauthorized' });
    req.user = user;
    next();
  } catch (e) {
    next(e);
  }
}

function requireRole(role) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'unauthorized' });
    if (req.user.role !== role) return res.status(403).json({ error: 'forbidden' });
    next();
  };
}

module.exports = { requireAuth, requireRole };
