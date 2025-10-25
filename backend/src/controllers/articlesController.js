const { nanoid } = require('nanoid');
const { Op } = require('sequelize');
const Article = require('../models/Article');
const { slugify } = require('../utils/slugify');
const { readingTime } = require('../utils/readingTime');

async function listArticles(req, res) {
  const { page = 1, limit = 10, locale = 'ru', q } = req.query;
  const where = { status: 'PUBLISHED', locale };
  if (q) where.title = { [Op.iLike]: `%${q}%` };

  const { rows, count } = await Article.findAndCountAll({
    where,
    order: [
      ['publishedAt', 'DESC'],
      ['updatedAt', 'DESC'],
    ],
    limit: +limit,
    offset: (+page - 1) * +limit,
    attributes: { exclude: ['contentMd'] },
  });
  res.json({ items: rows, total: count, page: +page, pages: Math.ceil(count / limit) });
}

async function getArticle(req, res) {
  const { slug } = req.params;
  const { locale = 'ru', preview } = req.query;
  const where = { slug, locale };
  if (!preview) where.status = 'PUBLISHED';
  const a = await Article.findOne({ where });
  if (!a) return res.status(404).json({ error: 'Not found' });
  res.set('ETag', `"${a.updatedAt?.getTime?.()}"`);
  res.json(a);
}

async function createArticle(req, res) {
  const data = req.body;
  const id = nanoid();
  const base = slugify(data.title);
  let slug = data.slug || base;
  // дедупликация slug в рамках локали
  // eslint-disable-next-line no-constant-condition
  while (await Article.findOne({ where: { slug, locale: data.locale || 'ru' } })) {
    slug = `${base}-${Math.floor(Math.random() * 1000)}`;
  }
  const a = await Article.create({
    ...data,
    id,
    slug,
    readingTime: readingTime(data.contentMd),
  });
  res.status(201).json(a);
}

async function updateArticle(req, res) {
  const { id } = req.params;
  const a = await Article.findByPk(id);
  if (!a) return res.status(404).json({ error: 'Not found' });
  const data = req.body;
  if (data.title && !data.slug) data.slug = slugify(data.title);
  if (data.contentMd) data.readingTime = readingTime(data.contentMd);
  await a.update(data);
  res.json(a);
}

async function deleteArticle(req, res) {
  const { id } = req.params;
  const a = await Article.findByPk(id);
  if (!a) return res.status(404).json({ error: 'Not found' });
  await a.destroy();
  res.status(204).end();
}

module.exports = { listArticles, getArticle, createArticle, updateArticle, deleteArticle };
