// src/models/Forecast.js
const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const Forecast = sequelize.define('Forecast', {
    symbol: { type: DataTypes.STRING(32), allowNull: false },
    timeframe: { type: DataTypes.STRING(8), allowNull: false },
    method: { type: DataTypes.STRING(16), allowNull: false, defaultValue: 'blend' },
    // JSON.stringify([{time,value},...])
    points: { type: DataTypes.TEXT, allowNull: false, defaultValue: '[]' },
    generated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
}, {
    tableName: 'forecasts',
    indexes: [
        { fields: ['symbol', 'timeframe', 'method'] },
        { fields: ['createdAt'] },
    ],
});

module.exports = Forecast;





