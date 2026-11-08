const express = require('express');
const crypto = require('crypto');
const { Op } = require('sequelize');
const {
  sequelize, Dzongkhag, Hospital, Department, Doctor, Availability, Appointment, User
} = require('../models');
const { requireAuth } = require('../middleware/auth');
const { sendMail } = require('../services/mailer');
const { availableSlots, createBooking, validFutureDate } = require('../services/appointment');

const router = express.Router();
const includes = [
  { model: Hospital, where: { verified: true }, include: [Dzongkhag] },
  { model: Department },
  { model: Availability, where: { active: true }, required: false }
];
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

router.get('/', async (req, res, next) => {
  try {
    const [hospitalCount, doctorCount, departmentCount, dzongkhags] = await Promise.all([
      Hospital.count({ where: { verified: true } }),
      Doctor.count({ where: { active: true } }),
      Department.count(),
      Dzongkhag.findAll({ order: [['name', 'ASC']] })
    ]);
    const hospitals = await Hospital.findAll({
      where: { verified: true },
      include: [Dzongkhag],
      order: [['name', 'ASC']],
      limit: 3
    });
    const departments = await Department.findAll({ order: [['name', 'ASC']], limit: 8 });
    return res.render('home', {
      title: 'Find care across Bhutan',
      hospitalCount,
      doctorCount,
      departmentCount,
      dzongkhags,
      hospitals,
      departments
    });
  } catch (error) {
    return next(error);
  }
});

router.get('/hospitals', async (req, res, next) => {
  try {
    if (req.query.dzongkhag && !UUID_PATTERN.test(req.query.dzongkhag)) {
      return res.status(400).render('error', { title: 'Invalid Dzongkhag', message: 'Select a valid Dzongkhag filter.' });
    }
    const dzongkhags = await Dzongkhag.findAll({ order: [['name', 'ASC']] });
    const where = { verified: true };
    if (req.query.dzongkhag) where.dzongkhagId = req.query.dzongkhag;
    if (typeof req.query.q === 'string' && req.query.q.trim()) {
      where.name = { [Op.iLike]: `%${req.query.q.trim().slice(0, 100)}%` };
    }
    const hospitals = await Hospital.findAll({
      where,
      include: [Dzongkhag],
      order: [['name', 'ASC']]
    });
    return res.render('hospitals', { title: 'Find hospitals', hospitals, dzongkhags, query: req.query });
  } catch (error) {
    return next(error);
  }
});

router.get('/hospitals/:id', async (req, res, next) => {
  try {
    if (!UUID_PATTERN.test(req.params.id)) {
      return res.status(404).render('error', { title: 'Hospital not found', message: 'This facility listing is unavailable.' });
    }
    const hospital = await Hospital.findOne({
      where: { id: req.params.id, verified: true },
      include: [Dzongkhag]
    });
    if (!hospital) return res.status(404).render('error', { title: 'Hospital not found', message: 'This facility listing is unavailable.' });
    const doctors = await Doctor.findAll({
      where: { hospitalId: hospital.id, active: true },
      include: [
        { model: Department },
        { model: Availability, where: { active: true }, required: false }
      ],
      order: [['name', 'ASC']]
    });
    return res.render('hospital', { title: hospital.name, hospital, doctors });
  } catch (error) {
    return next(error);
  }
});

router.get('/doctors', async (req, res, next) => {
  try {
    if ((req.query.department && !UUID_PATTERN.test(req.query.department)) ||
        (req.query.hospital && !UUID_PATTERN.test(req.query.hospital))) {
      return res.status(400).render('error', { title: 'Invalid filter', message: 'Select a valid hospital and department.' });
    }
    const where = { active: true };
    if (req.query.department) where.departmentId = req.query.department;
    if (req.query.hospital) where.hospitalId = req.query.hospital;
    if (typeof req.query.q === 'string' && req.query.q.trim()) {
      where.name = { [Op.iLike]: `%${req.query.q.trim().slice(0, 100)}%` };
    }
    const [doctors, departments, hospitals] = await Promise.all([
      Doctor.findAll({ where, include: includes, order: [['name', 'ASC']] }),
      Department.findAll({ order: [['name', 'ASC']] }),
      Hospital.findAll({ where: { verified: true }, order: [['name', 'ASC']] })
    ]);
    return res.render('doctors', { title: 'Find doctors', doctors, departments, hospitals, query: req.query });
  } catch (error) {
    return next(error);
  }
});

router.get('/doctors/:id', async (req, res, next) => {
  try {
    if (!UUID_PATTERN.test(req.params.id)) {
      return res.status(404).render('error', { title: 'Doctor not found', message: 'This profile is unavailable.' });
    }
    const doctor = await Doctor.findOne({
      where: { id: req.params.id, active: true },
      include: includes
    });
    if (!doctor) return res.status(404).render('error', { title: 'Doctor not found', message: 'This profile is unavailable.' });
    return res.render('doctor', { title: doctor.name, doctor });
  } catch (error) {
    return next(error);
  }
});

router.get('/book/:doctorId', requireAuth, async (req, res, next) => {
  try {
    if (!UUID_PATTERN.test(req.params.doctorId)) {
      return res.status(404).render('error', { title: 'Online booking unavailable', message: 'This provider is not available for online booking.' });
    }
    const doctor = await Doctor.findOne({
      where: { id: req.params.doctorId, active: true },
      include: includes
    });
    if (!doctor || !doctor.Hospital.verified || !doctor.Hospital.bookingEnabled) {
      return res.status(404).render('error', {
        title: 'Online booking unavailable',
        message: 'This provider has not enabled verified online appointment booking.'
      });
    }
    return res.render('booking', { title: 'Book an appointment', doctor });
  } catch (error) {
    return next(error);
  }
});

router.get('/api/doctors/:doctorId/slots', requireAuth, async (req, res, next) => {
  try {
    if (!UUID_PATTERN.test(req.params.doctorId)) return res.status(404).json({ error: 'Doctor not found.' });
    if (!validFutureDate(req.query.date)) return res.status(400).json({ error: 'Choose a valid date within the next 90 days.' });
    const slots = await availableSlots(req.params.doctorId, req.query.date);
    return res.json({ slots, timeZone: 'Asia/Thimphu' });
  } catch (error) {
    return next(error);
  }
});

router.post('/book/:doctorId', requireAuth, async (req, res, next) => {
  try {
    if (!UUID_PATTERN.test(req.params.doctorId)) {
      return res.status(404).render('error', { title: 'Booking unavailable', message: 'This doctor is not available for online booking.' });
    }
    const time = String(req.body.time || '');
    if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time)) {
      return res.status(422).render('error', { title: 'Invalid time', message: 'Choose an available appointment time.' });
    }
    const result = await createBooking({
      userId: req.session.user.id,
      doctorId: req.params.doctorId,
      date: String(req.body.date || ''),
      time,
      reason: String(req.body.reason || '').trim().slice(0, 500)
    });
    let emailSent = true;
    try {
      emailSent = await sendMail({
        to: result.user.email,
        subject: `DrukCare appointment confirmed - ${result.appointment.reference}`,
        text: `Your appointment with ${result.doctor.name} at ${result.doctor.Hospital.name} is on ${result.appointment.appointmentDate} at ${time} (Asia/Thimphu). Reference: ${result.appointment.reference}.`
      });
    } catch (mailError) {
      console.error('Appointment confirmation email failed:', mailError);
      emailSent = false;
    }
    return res.render('booking-confirmation', {
      title: 'Appointment request received',
      appointment: result.appointment,
      doctor: result.doctor,
      emailSent
    });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).render('error', { title: 'Booking not completed', message: error.message });
    }
    return next(error);
  }
});

router.get('/dashboard', requireAuth, async (req, res, next) => {
  try {
    const appointments = await Appointment.findAll({
      where: { userId: req.session.user.id },
      include: [{ model: Doctor, include: [{ model: Hospital, include: [Dzongkhag] }, Department] }],
      order: [['appointmentDate', 'DESC'], ['time', 'DESC']]
    });
    return res.render('dashboard', { title: 'My appointments', appointments });
  } catch (error) {
    return next(error);
  }
});

router.post('/appointments/:id/cancel', requireAuth, async (req, res, next) => {
  try {
    const appointment = await Appointment.findOne({
      where: { id: req.params.id, userId: req.session.user.id },
      include: [{ model: Doctor, include: [{ model: Hospital }] }]
    });
    if (!appointment) return res.status(404).render('error', { title: 'Not found', message: 'Appointment not found.' });
    if (!['pending', 'confirmed'].includes(appointment.status)) {
      return res.status(409).render('error', { title: 'Cannot cancel', message: 'This appointment is no longer active.' });
    }
    const nowParts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Thimphu',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23'
    }).formatToParts(new Date());
    const localNow = Object.fromEntries(nowParts.map(({ type, value }) => [type, value]));
    const todayInBhutan = `${localNow.year}-${localNow.month}-${localNow.day}`;
    const currentMinute = Number(localNow.hour) * 60 + Number(localNow.minute);
    const appointmentMinute = Number(appointment.time.slice(0, 2)) * 60 + Number(appointment.time.slice(3, 5));
    if (appointment.appointmentDate < todayInBhutan ||
        (appointment.appointmentDate === todayInBhutan && appointmentMinute <= currentMinute)) {
      return res.status(409).render('error', { title: 'Cannot cancel', message: 'Past appointments cannot be cancelled.' });
    }
    await appointment.update({ status: 'cancelled', cancelledAt: new Date() });
    let emailSent = true;
    try {
      const patient = await User.findByPk(req.session.user.id);
      await sendMail({
        to: patient.email,
        subject: `DrukCare appointment cancelled - ${appointment.reference}`,
        text: `Your appointment ${appointment.reference} on ${appointment.appointmentDate} has been cancelled.`
      });
    } catch (mailError) {
      console.error('Appointment cancellation email failed:', mailError);
      emailSent = false;
    }
    req.session.notice = emailSent
      ? 'Your appointment has been cancelled.'
      : 'Your appointment has been cancelled, but we could not send the email notification.';
    return res.redirect('/dashboard');
  } catch (error) {
    return next(error);
  }
});

router.get('/appointments/:id/reschedule', requireAuth, async (req, res, next) => {
  try {
    const appointment = await Appointment.findOne({
      where: { id: req.params.id, userId: req.session.user.id, status: { [Op.in]: ['pending', 'confirmed'] } },
      include: [{ model: Doctor, include: [{ model: Hospital }, Department] }]
    });
    if (!appointment) return res.status(404).render('error', { title: 'Not found', message: 'Appointment not found.' });
    return res.render('reschedule', { title: 'Reschedule appointment', appointment });
  } catch (error) {
    return next(error);
  }
});

router.post('/appointments/:id/reschedule', requireAuth, async (req, res, next) => {
  let transaction;
  try {
    transaction = await sequelize.transaction();
    const appointment = await Appointment.findOne({
      where: { id: req.params.id, userId: req.session.user.id, status: { [Op.in]: ['pending', 'confirmed'] } },
      include: [{ model: Doctor, include: [{ model: Hospital }, Department] }],
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    if (!appointment) {
      await transaction.rollback();
      return res.status(404).render('error', { title: 'Not found', message: 'Appointment not found.' });
    }
    const time = String(req.body.time || '');
    if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time) ||
        !(await availableSlots(appointment.doctorId, String(req.body.date || ''))).includes(time)) {
      await transaction.rollback();
      return res.status(409).render('reschedule', {
        title: 'Reschedule appointment',
        appointment,
        error: 'That new date or time is unavailable. Please select another slot.'
      });
    }
    const oldReference = appointment.reference;
    await appointment.update({ status: 'cancelled', cancelledAt: new Date() }, { transaction });
    const replacement = await Appointment.create({
      reference: `DC-${crypto.randomBytes(5).toString('hex').toUpperCase()}`,
      userId: req.session.user.id,
      doctorId: appointment.doctorId,
      appointmentDate: req.body.date,
      time: `${time}:00`,
      reason: appointment.reason
    }, { transaction });
    await transaction.commit();
    let emailSent = true;
    try {
      const patient = await User.findByPk(req.session.user.id);
      await sendMail({
        to: patient.email,
        subject: `DrukCare appointment rescheduled - ${replacement.reference}`,
        text: `Your previous appointment ${oldReference} was rescheduled. Your new visit with ${appointment.Doctor.name} at ${appointment.Doctor.Hospital.name} is on ${replacement.appointmentDate} at ${replacement.time.slice(0, 5)} Bhutan Time. Reference: ${replacement.reference}.`
      });
    } catch (mailError) {
      console.error('Appointment reschedule email failed:', mailError);
      emailSent = false;
    }
    req.session.notice = emailSent
      ? `Appointment ${oldReference} was rescheduled. New reference: ${replacement.reference}.`
      : `Appointment rescheduled. New reference: ${replacement.reference}. Email notification could not be sent.`;
    return res.redirect('/dashboard');
  } catch (error) {
    if (transaction && !transaction.finished) await transaction.rollback();
    if (error.name === 'SequelizeUniqueConstraintError') {
      return res.status(409).render('error', { title: 'Slot unavailable', message: 'That time was just booked. Please try another.' });
    }
    return next(error);
  }
});

module.exports = router;
