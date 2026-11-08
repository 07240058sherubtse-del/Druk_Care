const crypto = require('crypto');
const { Op } = require('sequelize');
const { Appointment, Availability, Doctor, Hospital, Department, User } = require('../models');

function parseTime(value) {
  const [hours, minutes] = value.slice(0, 5).split(':').map(Number);
  return { hours, minutes, total: hours * 60 + minutes };
}

function bhutanNowParts() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Thimphu',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(new Date());
  return Object.fromEntries(parts.map(({ type, value }) => [type, value]));
}

function validFutureDate(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const [year, month, day] = date.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) {
    return false;
  }
  const local = bhutanNowParts();
  const today = `${local.year}-${local.month}-${local.day}`;
  const maximum = new Date(Date.now() + 90 * 86400000);
  const maxParts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Thimphu',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(maximum);
  const max = Object.fromEntries(maxParts.map(({ type, value }) => [type, value]));
  const maxDate = `${max.year}-${max.month}-${max.day}`;
  return date >= today && date <= maxDate;
}

async function availableSlots(doctorId, date) {
  if (!validFutureDate(date)) return [];
  const [year, month, day] = date.split('-').map(Number);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  const schedules = await Availability.findAll({
    where: { doctorId, dayOfWeek: weekday, active: true },
    order: [['startTime', 'ASC']]
  });
  if (!schedules.length) return [];

  const occupied = await Appointment.findAll({
    attributes: ['time'],
    where: {
      doctorId,
      appointmentDate: date,
      status: { [Op.in]: ['pending', 'confirmed'] }
    }
  });
  const occupiedTimes = new Set(occupied.map((appointment) => appointment.time.slice(0, 5)));
  const local = bhutanNowParts();
  const isToday = date === `${local.year}-${local.month}-${local.day}`;
  const currentMinute = Number(local.hour) * 60 + Number(local.minute);
  const slots = new Set();

  for (const schedule of schedules) {
    const start = parseTime(schedule.startTime).total;
    const end = parseTime(schedule.endTime).total;
    for (let minute = start; minute + schedule.slotMinutes <= end; minute += schedule.slotMinutes) {
      const hour = String(Math.floor(minute / 60)).padStart(2, '0');
      const mins = String(minute % 60).padStart(2, '0');
      const time = `${hour}:${mins}`;
      if ((!isToday || minute > currentMinute) && !occupiedTimes.has(time)) slots.add(time);
    }
  }
  return [...slots].sort();
}

async function createBooking({ userId, doctorId, date, time, reason }) {
  if (!validFutureDate(date)) {
    const error = new Error('Choose a valid appointment date within the next 90 days.');
    error.status = 400;
    throw error;
  }
  const doctor = await Doctor.findOne({
    where: { id: doctorId, active: true },
    include: [{ model: Hospital }, { model: Department }]
  });
  if (!doctor || !doctor.Hospital.verified || !doctor.Hospital.bookingEnabled) {
    const error = new Error('This doctor is not currently accepting online bookings.');
    error.status = 400;
    throw error;
  }
  const slots = await availableSlots(doctorId, date);
  if (!slots.includes(time)) {
    const error = new Error('That appointment time is no longer available. Please choose another slot.');
    error.status = 409;
    throw error;
  }
  const user = await User.findByPk(userId);
  try {
    const appointment = await Appointment.create({
      reference: `DC-${crypto.randomBytes(5).toString('hex').toUpperCase()}`,
      userId,
      doctorId,
      appointmentDate: date,
      time: `${time}:00`,
      reason: reason || null
    });
    return { appointment, doctor, user };
  } catch (error) {
    if (error.name === 'SequelizeUniqueConstraintError') {
      const conflict = new Error('That time was just booked. Please select another available time.');
      conflict.status = 409;
      throw conflict;
    }
    throw error;
  }
}

module.exports = { availableSlots, createBooking, validFutureDate };
