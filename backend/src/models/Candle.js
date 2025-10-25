// Таблица исторических свечей (OHLCV)
const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const Candle = sequelize.define('Candle', {
    symbol: { type: DataTypes.STRING, allowNull: false },
    timeframe: { type: DataTypes.STRING, allowNull: false },
    time: { type: DataTypes.BIGINT, allowNull: false }, // timestamp Binance
    open: DataTypes.FLOAT,
    high: DataTypes.FLOAT,
    low: DataTypes.FLOAT,
    close: DataTypes.FLOAT,
    volume: DataTypes.FLOAT,
}, {
    indexes: [{ fields: ['symbol', 'timeframe', 'time'], unique: true }],
    timestamps: false   // отключаем createdAt/updatedAt
});

module.exports = Candle;

