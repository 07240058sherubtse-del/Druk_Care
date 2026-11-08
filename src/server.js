require('dotenv').config();
const app = require('./app');
const { sequelize } = require('./models');

async function start() {
  await sequelize.authenticate();
  await app.locals.sessionStore.sync();
  const port = Number(process.env.PORT || 3000);
  app.listen(port, '0.0.0.0', () => {
    console.log(`DrukCare is listening on port ${port}`);
  });
}

start().catch((error) => {
  console.error('Unable to start DrukCare:', error);
  process.exitCode = 1;
});
