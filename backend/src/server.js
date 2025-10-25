require('dotenv').config();
const app = require('./app');
const sequelize = require('./config/db');

// регистрируем модели, чтобы sequelize их знал
require('./models/User');
require('./models/Candle');
require('./models/Forecast');
require('./models/Transaction');
require('./models/Article');

const PORT = process.env.PORT || 5000;

async function start() {
  try {
    await sequelize.authenticate();
    await sequelize.sync();
    app.listen(PORT, () => console.log(`API on ${PORT}`));
  } catch (e) {
    console.error('DB connection failed:', e);
    process.exit(1);
  }
}
start();
