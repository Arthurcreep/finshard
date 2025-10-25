// backend/src/models/User.js
const { DataTypes } = require('sequelize')
const sequelize = require('../config/db')

const User = sequelize.define('User', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    address: { type: DataTypes.STRING, allowNull: false, unique: true },
    role: { type: DataTypes.ENUM('user', 'admin'), allowNull: false, defaultValue: 'user' },
    statsTxCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    statsVolumeUSD: { type: DataTypes.DECIMAL, allowNull: false, defaultValue: 0 }
}, { tableName: 'users', underscored: true })

module.exports = User

