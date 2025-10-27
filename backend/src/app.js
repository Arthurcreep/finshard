// app.js
require('dotenv').config();

const express = require('express');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const session = require('express-session');
const cors = require('cors');
const path = require('path');

const app = express();

// если стоим за nginx/прокси — важно для secure-кук
app.set('trust proxy', 1);

// -------------------- базовые middleware --------------------
app.disable('etag');
app.use(morgan('dev'));
app.use(express.json());
app.use(cookieParser());

// ---------- ЖЁСТКИЙ CORS БЕЗ ВНЕШНИХ ФАЙЛОВ ----------
const allowedOrigins = new Set([
  'https://finshard.com',
  'https://www.finshard.com',
  // на всякий случай для локальной отладки:
  'http://localhost:5173',
  'http://127.0.0.1:5173',
]);

app.use(
  cors({
    origin(origin, cb) {
      if (!origin) return cb(null, true); // curl/health без Origin
      if (allowedOrigins.has(origin)) return cb(null, true);
      return cb(new Error(`Not allowed by CORS: ${origin}`), false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type', 'X-Requested-With'],
  }),
);
app.options(/^\/.*$/, cors(corsOptions));

// ---------- Сессия ----------
const isProd = process.env.NODE_ENV === 'production';
const forceSecure = process.env.FORCE_SECURE_COOKIES === '1';

app.use(
  session({
    secret: process.env.SESSION_SECRET || 'replace_me',
    resave: false,
    saveUninitialized: true,
    cookie: {
      // кросс-доменные запросы finshard.com -> api.finshard.com требуют None+Secure
      sameSite: isProd || forceSecure ? 'none' : 'lax',
      secure: isProd || forceSecure,
    },
  }),
);

// -------------------- ваши API-роуты --------------------
app.use('/api/auth', require('./routes/auth.routes'));
app.use('/api/forecast', require('./routes/forecast.routes'));
app.use('/api/series', require('./routes/series.routes'));
app.use('/api/wallet', require('./routes/wallet.routes'));
app.use('/api/tx', require('./routes/tx.routes'));
app.use('/api/articles', require('./routes/articles'));

// ping/health для проверок
app.get('/__ping', (_req, res) => res.json({ ok: true, ts: Date.now() }));
app.get('/health', (_req, res) => res.json({ ok: true, path: '/health' }));

// -------------------- раздача статики SPA (Vite build) --------------------
const clientDist = process.env.CLIENT_DIST || path.resolve(__dirname, '..', '..', 'client', 'dist');

app.use(
  express.static(clientDist, {
    index: false,
    setHeaders: (res, filePath) => {
      if (/\.(js|css|woff2|png|jpe?g|svg)$/.test(filePath)) {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      }
      if (/index\.html$/.test(filePath)) {
        res.setHeader('Cache-Control', 'no-cache');
      }
    },
  }),
);

// -------------------- мини-SSR для ботов /blog/:slug --------------------
function isBotUA(ua = '') {
  return /bot|crawler|spider|crawling|facebookexternalhit|whatsapp|telegram|linkedin|twitterbot|slackbot/i.test(
    String(ua),
  );
}
function esc(s = '') {
  return String(s).replace(
    /[&<>"]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]),
  );
}
function renderArticleHtml(article, origin = '') {
  let mdRender = (txt) => `<pre>${esc(txt || '')}</pre>`;
  try {
    const MarkdownIt = require('markdown-it');
    const md = new MarkdownIt({ html: false, linkify: true, breaks: true });
    mdRender = (txt) => md.render(txt || '');
  } catch (_) {}
  const title = article.seoTitle || article.title || 'Article';
  const desc = article.seoDesc || article.excerpt || '';
  const url = `${origin}/blog/${article.slug}`;
  const og = article.ogImageUrl || `${origin}/og-default.png`;
  const pub = article.publishedAt ? new Date(article.publishedAt).toISOString() : '';
  const body = mdRender(article.contentMd);
  return `<!doctype html>
<html lang="${article.locale || 'ru'}">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}" />
<link rel="canonical" href="${esc(url)}" />
<meta property="og:type" content="article" />
<meta property="og:title" content="${esc(title)}" />
<meta property="og:description" content="${esc(desc)}" />
<meta property="og:image" content="${esc(og)}" />
<meta property="og:url" content="${esc(url)}" />
<meta name="twitter:card" content="summary_large_image" />
${pub ? `<meta property="article:published_time" content="${esc(pub)}" />` : ''}
<style>
  body{margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,Ubuntu,Cantarell,'Helvetica Neue',Arial}
  .wrap{max-width:880px;margin:40px auto;padding:0 16px}
  .meta{color:#64748b;font-size:14px;margin-bottom:12px}
  .content{line-height:1.65;font-size:18px}
  .content img{max-width:100%;height:auto;border-radius:12px}
  .content pre{padding:12px;background:#0f172a;color:#e2e8f0;border-radius:12px;overflow:auto}
  h1{font-size:36px;margin:0 0 12px}
</style>
</head>
<body>
  <div class="wrap">
    <h1>${esc(article.title || '')}</h1>
    <div class="meta">
      ${article.readingTime ? `${article.readingTime} мин чтения` : ''}${
    article.publishedAt ? ` • ${new Date(article.publishedAt).toLocaleDateString()}` : ''
  }
    </div>
    ${
      article.coverImage
        ? `<img src="${esc(
            article.coverImage,
          )}" alt="" style="width:100%;margin:16px 0;border-radius:12px" />`
        : ''
    }
    <article class="content">${body}</article>
  </div>
</body>
</html>`;
}

const Article = require('./models/Article');
app.get(['/blog/:slug', '/:locale/blog/:slug'], async (req, res, next) => {
  try {
    if (!isBotUA(req.headers['user-agent'])) return next();
    const slug = req.params.slug;
    const locale = req.params.locale || req.query.locale || 'ru';
    const a = await Article.findOne({ where: { slug, locale, status: 'PUBLISHED' } });
    if (!a) return next();
    const origin = req.protocol + '://' + req.get('host');
    const html = renderArticleHtml(a, origin);
    res.set('Cache-Control', 'public, max-age=600, stale-while-revalidate=600');
    res.type('html').send(html);
  } catch (e) {
    next(e);
  }
});

// -------------------- SPA fallback --------------------
const SPA_INDEX = path.join(clientDist, 'index.html');
app.get(/^\/(?!api\/).*/, (_req, res) => res.sendFile(SPA_INDEX));

// -------------------- глобальный обработчик ошибок --------------------
app.use((err, _req, res, _next) => {
  console.error('[unhandled]', err && err.stack ? err.stack : err);
  res.status(err?.status || 500).json({ error: 'unhandled', message: String(err?.message || err) });
});

module.exports = app;
