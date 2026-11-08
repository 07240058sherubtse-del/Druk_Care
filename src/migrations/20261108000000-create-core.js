'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('users', {
      id: { type: Sequelize.UUID, primaryKey: true, allowNull: false },
      name: { type: Sequelize.STRING(120), allowNull: false },
      email: { type: Sequelize.STRING(254), allowNull: false, unique: true },
      password_hash: { type: Sequelize.STRING, allowNull: false },
      role: { type: Sequelize.ENUM('patient', 'admin'), allowNull: false, defaultValue: 'patient' },
      is_active: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      phone: { type: Sequelize.STRING(30) },
      email_verified_at: { type: Sequelize.DATE },
      verification_token_hash: { type: Sequelize.STRING(64) },
      verification_expires_at: { type: Sequelize.DATE },
      reset_token_hash: { type: Sequelize.STRING(64) },
      reset_expires_at: { type: Sequelize.DATE },
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false }
    });
    await queryInterface.createTable('dzongkhags', {
      id: { type: Sequelize.UUID, primaryKey: true, allowNull: false },
      name: { type: Sequelize.STRING(80), allowNull: false, unique: true }
    });
    await queryInterface.createTable('hospitals', {
      id: { type: Sequelize.UUID, primaryKey: true, allowNull: false },
      name: { type: Sequelize.STRING(160), allowNull: false },
      address: { type: Sequelize.STRING(255) },
      phone: { type: Sequelize.STRING(40) },
      website: { type: Sequelize.STRING(255) },
      verified: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      booking_enabled: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      source_url: { type: Sequelize.STRING(500) },
      dzongkhag_id: {
        type: Sequelize.UUID, allowNull: false, references: { model: 'dzongkhags', key: 'id' },
        onUpdate: 'CASCADE', onDelete: 'RESTRICT'
      },
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false }
    });
    await queryInterface.createTable('departments', {
      id: { type: Sequelize.UUID, primaryKey: true, allowNull: false },
      name: { type: Sequelize.STRING(100), allowNull: false, unique: true },
      description: { type: Sequelize.TEXT },
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false }
    });
    await queryInterface.createTable('doctors', {
      id: { type: Sequelize.UUID, primaryKey: true, allowNull: false },
      name: { type: Sequelize.STRING(120), allowNull: false },
      title: { type: Sequelize.STRING(80) },
      bio: { type: Sequelize.TEXT },
      photo_url: { type: Sequelize.STRING(500) },
      active: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      hospital_id: {
        type: Sequelize.UUID, allowNull: false, references: { model: 'hospitals', key: 'id' },
        onUpdate: 'CASCADE', onDelete: 'RESTRICT'
      },
      department_id: {
        type: Sequelize.UUID, allowNull: false, references: { model: 'departments', key: 'id' },
        onUpdate: 'CASCADE', onDelete: 'RESTRICT'
      },
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false }
    });
    await queryInterface.createTable('availabilities', {
      id: { type: Sequelize.UUID, primaryKey: true, allowNull: false },
      day_of_week: { type: Sequelize.INTEGER, allowNull: false },
      start_time: { type: Sequelize.TIME, allowNull: false },
      end_time: { type: Sequelize.TIME, allowNull: false },
      slot_minutes: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 20 },
      active: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      doctor_id: {
        type: Sequelize.UUID, allowNull: false, references: { model: 'doctors', key: 'id' },
        onUpdate: 'CASCADE', onDelete: 'CASCADE'
      },
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false }
    });
    await queryInterface.createTable('appointments', {
      id: { type: Sequelize.UUID, primaryKey: true, allowNull: false },
      reference: { type: Sequelize.STRING(20), allowNull: false, unique: true },
      appointment_date: { type: Sequelize.DATEONLY, allowNull: false },
      time: { type: Sequelize.TIME, allowNull: false },
      status: {
        type: Sequelize.ENUM('pending', 'confirmed', 'cancelled', 'completed'),
        allowNull: false, defaultValue: 'confirmed'
      },
      reason: { type: Sequelize.STRING(500) },
      cancelled_at: { type: Sequelize.DATE },
      reminder24_sent_at: { type: Sequelize.DATE },
      reminder2_sent_at: { type: Sequelize.DATE },
      user_id: {
        type: Sequelize.UUID, allowNull: false, references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE', onDelete: 'RESTRICT'
      },
      doctor_id: {
        type: Sequelize.UUID, allowNull: false, references: { model: 'doctors', key: 'id' },
        onUpdate: 'CASCADE', onDelete: 'RESTRICT'
      },
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false }
    });
    await queryInterface.addIndex('appointments', ['doctor_id', 'appointment_date', 'time'], {
      name: 'appointments_active_slot_unique',
      unique: true,
      where: { status: ['pending', 'confirmed'] }
    });
    await queryInterface.addIndex('availabilities', ['doctor_id', 'day_of_week']);
    await queryInterface.addIndex('hospitals', ['dzongkhag_id', 'name']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('appointments');
    await queryInterface.dropTable('availabilities');
    await queryInterface.dropTable('doctors');
    await queryInterface.dropTable('departments');
    await queryInterface.dropTable('hospitals');
    await queryInterface.dropTable('dzongkhags');
    await queryInterface.dropTable('users');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_users_role";');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_appointments_status";');
  }
};
