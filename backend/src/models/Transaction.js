// backend/src/models/Transaction.js
const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const Transaction = sequelize.define('Transaction', {
    id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
    userId: { type: DataTypes.BIGINT, allowNull: false },
    address: { type: DataTypes.STRING(64), allowNull: false }, // адрес кошелька (быстро фильтровать)
    hash: { type: DataTypes.STRING(80), allowNull: false, unique: true },
    symbol: { type: DataTypes.STRING(16), allowNull: false },
    amount: { type: DataTypes.DECIMAL(36, 18), allowNull: false },
    usd: { type: DataTypes.DECIMAL(36, 6), allowNull: true },
    timestamp: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW }
}, {
    tableName: 'transactions',
    underscored: true,
});

module.exports = Transaction;



