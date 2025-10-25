// CommonJS версия, как и остальные твои модели
const { DataTypes, Model } = require('sequelize');
const sequelize = require('../config/db');

class Article extends Model {}

Article.init(
  {
    id: { type: DataTypes.STRING, primaryKey: true },
    slug: { type: DataTypes.STRING, allowNull: false },
    locale: { type: DataTypes.STRING, allowNull: false, defaultValue: 'ru' },
    title: { type: DataTypes.STRING, allowNull: false },
    excerpt: { type: DataTypes.TEXT },
    contentMd: { type: DataTypes.TEXT, allowNull: false },
    status: {
      type: DataTypes.ENUM('DRAFT', 'PUBLISHED', 'SCHEDULED'),
      allowNull: false,
      defaultValue: 'DRAFT',
    },
    publishedAt: { type: DataTypes.DATE },
    canonicalUrl: { type: DataTypes.STRING },
    seoTitle: { type: DataTypes.STRING },
    seoDesc: { type: DataTypes.STRING(300) },
    ogImageUrl: { type: DataTypes.STRING },
    noindex: { type: DataTypes.BOOLEAN, defaultValue: false },
    readingTime: { type: DataTypes.INTEGER, defaultValue: 0 },
    coverImage: { type: DataTypes.STRING },
  },
  {
    sequelize,
    modelName: 'Article',
    tableName: 'articles',
    indexes: [
      { unique: true, fields: ['slug', 'locale'] },
      { fields: ['status', 'publishedAt'] },
      { fields: ['locale'] },
    ],
  },
);

module.exports = Article;
