const express = require('express');
const errorHandler = require('../middlewares/errorHandler');

module.exports = (deps) => {
    const router = express.Router();

    router.use('/api/series', require('./series.routes')({ seriesController: deps.seriesController }));
    router.use('/api/forecast', require('./forecast.routes')({ forecastController: deps.forecastController }));

    router.use((_req, res) => res.status(404).json({ ok: false, error: 'Not Found' }));
    router.use(errorHandler);
    return router;
};
