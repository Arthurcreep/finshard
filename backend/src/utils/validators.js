// src/utils/validate.js
const TF_ALLOWED = new Set(['1m', '5m', '15m', '1h', '4h', '1d']); // при необходимости расширишь
// Разрешаем тикеры типа 1INCHUSDT, 1000SHIBUSDT, PEPEUSDT, LINKUSDT и т.д.
const SYM_RE = /^[A-Z0-9_-]{2,30}$/;

function normalizeSymbol(raw) {
    return String(raw || '').trim().toUpperCase();
}

function normalizeTf(raw) {
    return String(raw || '').trim();
}

function validateSymbol(symbol) {
    return SYM_RE.test(symbol);
}

function validateTf(tf) {
    return TF_ALLOWED.has(tf);
}

module.exports = {
    normalizeSymbol,
    normalizeTf,
    validateSymbol,
    validateTf,
    TF_ALLOWED,
};
