// Мини-обёртка для async-роутов, чтобы не падали без try/catch
module.exports = (fn) => (req, res, next) =>
    Promise.resolve(fn(req, res, next)).catch(next);
