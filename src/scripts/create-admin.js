require('dotenv').config();
const bcrypt = require('bcryptjs');
const { sequelize, User } = require('../models');

async function main() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password || password.length < 16) {
    throw new Error('Set ADMIN_EMAIL and an ADMIN_PASSWORD of at least 16 characters for this one-time command.');
  }
  await sequelize.authenticate();
  const existing = await User.findOne({ where: { email } });
  if (existing) throw new Error('An account already uses ADMIN_EMAIL.');
  await User.create({
    name: 'DrukCare Administrator',
    email,
    passwordHash: await bcrypt.hash(password, 12),
    role: 'admin',
    emailVerifiedAt: new Date()
  });
  console.log(`Administrator created for ${email}`);
}

main().catch((error) => {
  console.error('Could not create administrator:', error.message);
  process.exitCode = 1;
}).finally(() => sequelize.close());
