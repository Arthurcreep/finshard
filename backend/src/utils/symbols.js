// Унификация тикеров под Binance
const QUOTES = ['USDT', 'FDUSD', 'BUSD', 'TUSD', 'USD'];

function normalizeSymbol(input) {
    const raw = String(input || '').trim().toUpperCase();

    // Пустой → дефолт
    if (!raw) return 'BTCUSDT';

    // Если символ короткий (3–5) и не содержит известный квот — добавим USDT
    const hasQuote = QUOTES.some(q => raw.endsWith(q));
    if (!hasQuote) return raw + 'USDT';

    return raw;
}

function isValidSymbol(s) {
    return /^[A-Z0-9]{2,20}$/.test(s);
}

module.exports = { normalizeSymbol, isValidSymbol };
