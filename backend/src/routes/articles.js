const { Router } = require('express');
const c = require('../controllers/articlesController');
const path = require('path');

// надёжный абсолютный импорт middlewares
const { requireAuth, requireRole } = require(path.join(__dirname, '..', 'middleware', 'authz'));

const r = Router();
r.get('/', c.listArticles);
r.get('/:slug', c.getArticle);
r.post('/', requireAuth, requireRole('admin'), c.createArticle);
r.patch('/:id', requireAuth, requireRole('admin'), c.updateArticle);
r.delete('/:id', requireAuth, requireRole('admin'), c.deleteArticle);
module.exports = r;
