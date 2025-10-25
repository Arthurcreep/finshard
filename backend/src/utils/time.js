// шаги таймфреймов и проверка "закрыта ли свеча"
const TF_TO_MS = {
    '1h': 60 * 60 * 1000,
    '4h': 4 * 60 * 60 * 1000,
    '1d': 24 * 60 * 60 * 1000
};

function stepMsFor(tf) {
    const v = TF_TO_MS[tf];
    if (!v) throw new Error(`Unsupported timeframe: ${tf}`);
    return v;
}

// округление вниз к началу свечи
function floorToFrame(ts, tf) {
    const step = stepMsFor(tf);
    return Math.floor(ts / step) * step;
}

// закрыта ли свеча с данным closeTime
function isCandleClosed(closeTimeMs) {
    return Date.now() >= closeTimeMs; // REST Binance возвращает closeTime; если текущее время >= closeTime — свеча закрыта
}

module.exports = { stepMsFor, floorToFrame, isCandleClosed };
