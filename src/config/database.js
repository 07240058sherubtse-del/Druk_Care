require('dotenv').config();

const { Sequelize } = require('sequelize');

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
    throw new Error('DATABASE_URL is required. Copy .env.example to .env and configure PostgreSQL.');
}

const sequelize = new Sequelize(databaseUrl, {
    dialect: 'postgres',
    logging: false
});

module.exports = sequelize;
