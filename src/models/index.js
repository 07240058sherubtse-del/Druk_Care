const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const User = sequelize.define('User', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  name: { type: DataTypes.STRING(120), allowNull: false },
  email: { type: DataTypes.STRING(254), allowNull: false, unique: true, validate: { isEmail: true } },
  passwordHash: { type: DataTypes.STRING, allowNull: false },
  role: { type: DataTypes.ENUM('patient', 'admin'), allowNull: false, defaultValue: 'patient' },
  isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  phone: { type: DataTypes.STRING(30) },
  emailVerifiedAt: { type: DataTypes.DATE },
  verificationTokenHash: { type: DataTypes.STRING(64) },
  verificationExpiresAt: { type: DataTypes.DATE },
  resetTokenHash: { type: DataTypes.STRING(64) },
  resetExpiresAt: { type: DataTypes.DATE }
}, { tableName: 'users', underscored: true });

const Dzongkhag = sequelize.define('Dzongkhag', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  name: { type: DataTypes.STRING(80), allowNull: false, unique: true }
}, { tableName: 'dzongkhags', underscored: true, timestamps: false });

const Hospital = sequelize.define('Hospital', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  name: { type: DataTypes.STRING(160), allowNull: false },
  address: { type: DataTypes.STRING(255) },
  phone: { type: DataTypes.STRING(40) },
  website: { type: DataTypes.STRING(255) },
  verified: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  bookingEnabled: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  sourceUrl: { type: DataTypes.STRING(500) }
}, { tableName: 'hospitals', underscored: true });

const Department = sequelize.define('Department', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  name: { type: DataTypes.STRING(100), allowNull: false, unique: true },
  description: { type: DataTypes.TEXT }
}, { tableName: 'departments', underscored: true });

const Doctor = sequelize.define('Doctor', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  name: { type: DataTypes.STRING(120), allowNull: false },
  title: { type: DataTypes.STRING(80) },
  bio: { type: DataTypes.TEXT },
  photoUrl: { type: DataTypes.STRING(500) },
  active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true }
}, { tableName: 'doctors', underscored: true });

const Availability = sequelize.define('Availability', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  dayOfWeek: { type: DataTypes.INTEGER, allowNull: false, validate: { min: 0, max: 6 } },
  startTime: { type: DataTypes.TIME, allowNull: false },
  endTime: { type: DataTypes.TIME, allowNull: false },
  slotMinutes: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 20 },
  active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true }
}, { tableName: 'availabilities', underscored: true });

const Appointment = sequelize.define('Appointment', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  reference: { type: DataTypes.STRING(20), allowNull: false, unique: true },
  appointmentDate: { type: DataTypes.DATEONLY, allowNull: false },
  time: { type: DataTypes.TIME, allowNull: false },
  status: {
    type: DataTypes.ENUM('pending', 'confirmed', 'cancelled', 'completed'),
    allowNull: false,
    defaultValue: 'confirmed'
  },
  reason: { type: DataTypes.STRING(500) },
  cancelledAt: { type: DataTypes.DATE },
  reminder24SentAt: { type: DataTypes.DATE },
  reminder2SentAt: { type: DataTypes.DATE }
}, { tableName: 'appointments', underscored: true });

Dzongkhag.hasMany(Hospital, { foreignKey: { name: 'dzongkhagId', allowNull: false } });
Hospital.belongsTo(Dzongkhag, { foreignKey: { name: 'dzongkhagId', allowNull: false } });
Hospital.hasMany(Doctor, { foreignKey: { name: 'hospitalId', allowNull: false } });
Doctor.belongsTo(Hospital, { foreignKey: { name: 'hospitalId', allowNull: false } });
Department.hasMany(Doctor, { foreignKey: { name: 'departmentId', allowNull: false } });
Doctor.belongsTo(Department, { foreignKey: { name: 'departmentId', allowNull: false } });
Doctor.hasMany(Availability, { foreignKey: { name: 'doctorId', allowNull: false } });
Availability.belongsTo(Doctor, { foreignKey: { name: 'doctorId', allowNull: false } });
User.hasMany(Appointment, { foreignKey: { name: 'userId', allowNull: false } });
Appointment.belongsTo(User, { foreignKey: { name: 'userId', allowNull: false } });
Doctor.hasMany(Appointment, { foreignKey: { name: 'doctorId', allowNull: false } });
Appointment.belongsTo(Doctor, { foreignKey: { name: 'doctorId', allowNull: false } });

module.exports = { sequelize, User, Dzongkhag, Hospital, Department, Doctor, Availability, Appointment };
