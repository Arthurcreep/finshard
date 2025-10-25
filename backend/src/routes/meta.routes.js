const { Router } = require('express');
const dayjs = require('dayjs');
const Article = require('../models/Article');

const r = Router();

r.get('/sitemap.xml', async (req, res) => {
  const origin = req.protocol + '://' + req.get('host');
  const items = await Article.findAll({
    where: { status: 'PUBLISHED' },
    order: [['publishedAt', 'DESC']],
    attributes: ['slug', 'locale', 'updatedAt', 'publishedAt'],
  });
  const urls = items
    .map(
      (a) => `
    <url>
      <loc>${origin}/blog/${a.slug}</loc>
      <lastmod>${dayjs(a.updatedAt || a.publishedAt || new Date()).toISOString()}</lastmod>
      <changefreq>weekly</changefreq>
      <priority>0.8</priority>
    </url>`,
    )
    .join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
  <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
    <url>
      <loc>${origin}/</loc>
      <changefreq>daily</changefreq>
      <priority>1.0</priority>
    </url>
    ${urls}
  </urlset>`;
  res.set('Content-Type', 'application/xml').send(xml);
});

r.get('/rss.xml', async (req, res) => {
  const origin = req.protocol + '://' + req.get('host');
  const items = await Article.findAll({
    where: { status: 'PUBLISHED' },
    order: [['publishedAt', 'DESC']],
    limit: 30,
  });

  const feedItems = items
    .map(
      (a) => `
    <item>
      <title><![CDATA[${a.seoTitle || a.title}]]></title>
      <link>${origin}/blog/${a.slug}</link>
      <guid isPermaLink="true">${origin}/blog/${a.slug}</guid>
      <pubDate>${dayjs(a.publishedAt || a.updatedAt || new Date())
        .toDate()
        .toUTCString()}</pubDate>
      ${a.seoDesc ? `<description><![CDATA[${a.seoDesc}]]></description>` : ''}
    </item>`,
    )
    .join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
  <rss version="2.0">
    <channel>
      <title>Your Blog</title>
      <link>${origin}</link>
      <description>Последние статьи</description>
      ${feedItems}
    </channel>
  </rss>`;
  res.set('Content-Type', 'application/rss+xml').send(xml);
});

module.exports = r;
