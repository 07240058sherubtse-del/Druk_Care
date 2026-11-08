'use strict';

const crypto = require('crypto');

module.exports = {
  async up(queryInterface) {
    const now = new Date();
    const districts = [
      'Bumthang', 'Chhukha', 'Dagana', 'Gasa', 'Haa', 'Lhuntse', 'Mongar',
      'Paro', 'Pema Gatshel', 'Punakha', 'Samtse', 'Sarpang', 'Thimphu',
      'Samdrup Jongkhar', 'Trashigang', 'Trashiyangtse', 'Trongsa', 'Tsirang',
      'Wangdue Phodrang', 'Zhemgang'
    ];
    await queryInterface.bulkInsert('dzongkhags', districts.map((name) => ({
      id: crypto.randomUUID(), name
    })));
    const departments = [
      'Cardiology', 'Dental', 'Dermatology', 'Emergency Medicine', 'Family Medicine',
      'General Medicine', 'General Surgery', 'Gynaecology and Obstetrics',
      'Ophthalmology', 'Orthopaedics', 'Paediatrics', 'Psychiatry', 'Radiology'
    ];
    await queryInterface.bulkInsert('departments', departments.map((name) => ({
      id: crypto.randomUUID(), name, description: null, created_at: now, updated_at: now
    })));
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete('departments', null, {});
    await queryInterface.bulkDelete('dzongkhags', null, {});
  }
};
