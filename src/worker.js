require('dotenv').config();
const { Op } = require('sequelize');
const { sequelize, Appointment, User, Doctor, Hospital } = require('./models');
const { sendMail } = require('./services/mailer');

const HOUR = 60 * 60 * 1000;
const WORKER_INTERVAL = 60 * 1000;

function localToday() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Thimphu',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function appointmentInstant(appointment) {
  return new Date(`${appointment.appointmentDate}T${appointment.time.slice(0, 8)}+06:00`);
}

async function sendReminder(appointment, kind, offset) {
  const column = kind === '24h' ? 'reminder24SentAt' : 'reminder2SentAt';
  const [claimed] = await Appointment.update(
    { [column]: new Date() },
    { where: { id: appointment.id, status: 'confirmed', [column]: null } }
  );
  if (!claimed) return;
  try {
    await sendMail({
      to: appointment.User.email,
      subject: `DrukCare appointment reminder - ${appointment.reference}`,
      text: `Reminder: your appointment with ${appointment.Doctor.name} at ${appointment.Doctor.Hospital.name} is scheduled for ${appointment.appointmentDate} at ${appointment.time.slice(0, 5)} Bhutan Time, in about ${offset} hours. Reference: ${appointment.reference}.`
    });
  } catch (error) {
    await Appointment.update({ [column]: null }, { where: { id: appointment.id, status: 'confirmed' } });
    throw error;
  }
}

async function runOnce() {
  const now = Date.now();
  const today = localToday();
  const endDate = new Date(`${today}T00:00:00+06:00`);
  endDate.setUTCDate(endDate.getUTCDate() + 2);
  const throughDate = endDate.toISOString().slice(0, 10);
  const appointments = await Appointment.findAll({
    where: {
      status: 'confirmed',
      appointmentDate: { [Op.between]: [today, throughDate] },
      [Op.or]: [{ reminder24SentAt: null }, { reminder2SentAt: null }]
    },
    include: [{ model: User }, { model: Doctor, include: [{ model: Hospital }] }]
  });

  for (const appointment of appointments) {
    const visit = appointmentInstant(appointment).getTime();
    const untilVisit = visit - now;
    if (untilVisit <= 0) continue;
    if (!appointment.reminder24SentAt && untilVisit <= 24 * HOUR && untilVisit > 2 * HOUR) {
      await sendReminder(appointment, '24h', 24);
    }
    if (!appointment.reminder2SentAt && untilVisit <= 2 * HOUR) {
      await sendReminder(appointment, '2h', 2);
    }
  }
}

async function start() {
  await sequelize.authenticate();
  console.log('DrukCare reminder worker started (Asia/Thimphu).');
  const tick = async () => {
    try {
      await runOnce();
    } catch (error) {
      console.error('Appointment reminder run failed:', error);
    }
  };
  await tick();
  setInterval(tick, WORKER_INTERVAL);
}

start().catch((error) => {
  console.error('Unable to start reminder worker:', error);
  process.exitCode = 1;
});
