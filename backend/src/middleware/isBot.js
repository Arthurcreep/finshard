const BOT_RE =
  /bot|crawler|spider|crawling|facebookexternalhit|whatsapp|telegram|linkedin|twitterbot|slackbot/i;

function isBotUA(ua = '') {
  return BOT_RE.test(String(ua));
}

module.exports = { isBotUA };
