// простой конфиг, быстро заменить env
module.exports = {
  db: {
    url: process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/crypto',
  },
  cron: {
    // Запуск генерации в 06:00 по America/Phoenix
    schedule: '0 6 * * *',
    timezone: 'America/Phoenix',
  },
  ml: {
    // endpoint/strategy - в будущем сюда впишешь Python service
    strategy: process.env.ML_STRATEGY || 'naive',
  },
};
