const MarkdownIt = require('markdown-it');
const dayjs = require('dayjs');

const md = new MarkdownIt({ html: false, linkify: true, breaks: true });

function esc(s = '') {
  return String(s).replace(
    /[&<>"]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]),
  );
}

/**
 * Рендерим полноценную HTML-страницу для бота.
 * article: { title, seoTitle, seoDesc, ogImageUrl, slug, locale, contentMd, publishedAt, readingTime }
 * origin: https://example.com
 */
function renderArticleHtml(article, origin = '') {
  const title = article.seoTitle || article.title;
  const desc = article.seoDesc || article.excerpt || '';
  const url = origin ? `${origin}/blog/${article.slug}` : `/blog/${article.slug}`;
  const og = article.ogImageUrl || `${origin}/og-default.png`;
  const pub = article.publishedAt ? dayjs(article.publishedAt).toISOString() : '';
  const body = md.render(article.contentMd || '');

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
    <h1>${esc(article.title)}</h1>
    <div class="meta">
      ${article.readingTime ? `${article.readingTime} мин чтения` : ''}${
    pub ? ` • ${esc(dayjs(article.publishedAt).format('DD.MM.YYYY'))}` : ''
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

module.exports = { renderArticleHtml };
