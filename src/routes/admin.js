const express = require('express');
const { body, validationResult } = require('express-validator');
const {
  User, Dzongkhag, Hospital, Department, Doctor, Availability, Appointment
} = require('../models');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { sendMail } = require('../services/mailer');

const router = express.Router();
router.use(requireAuth, requireAdmin);

router.get('/', async (req, res, next) => {
  try {
    const [patients, hospitals, doctors, departments, appointments, recentAppointments,
      dzongkhags, departmentList, hospitalList, doctorList, users] = await Promise.all([
      User.count({ where: { role: 'patient' } }),
      Hospital.count(),
      Doctor.count(),
      Department.count(),
      Appointment.count(),
      Appointment.findAll({
        include: [{ model: User, attributes: ['name', 'email'] },
          { model: Doctor, include: [{ model: Hospital }, Department] }],
        order: [['createdAt', 'DESC']],
        limit: 30
      }),
      Dzongkhag.findAll({ order: [['name', 'ASC']] }),
      Department.findAll({ order: [['name', 'ASC']] }),
      Hospital.findAll({ include: [Dzongkhag], order: [['name', 'ASC']] }),
      Doctor.findAll({ include: [Hospital, Department], order: [['name', 'ASC']] }),
      User.findAll({ attributes: ['id', 'name', 'email', 'role', 'isActive', 'createdAt'], order: [['createdAt', 'DESC']], limit: 100 })
    ]);
    return res.render('admin', {
      title: 'Administration',
      stats: { patients, hospitals, doctors, departments, appointments },
      recentAppointments,
      dzongkhags,
      departmentList,
      hospitalList,
      doctorList,
      users
    });
  } catch (error) {
    return next(error);
  }
});

router.post('/hospitals', [
  body('name').trim().isLength({ min: 2, max: 160 }),
  body('dzongkhagId').isUUID(),
  body('website').optional({ checkFalsy: true }).isURL({ protocols: ['http', 'https'], require_protocol: true }),
  body('sourceUrl').optional({ checkFalsy: true }).isURL({ protocols: ['http', 'https'], require_protocol: true })
], async (req, res, next) => {
  try {
    if (!validationResult(req).isEmpty()) {
      return res.status(422).render('error', { title: 'Invalid hospital', message: 'Enter a hospital name, a valid Dzongkhag, and valid HTTP/HTTPS URLs.' });
    }
    await Hospital.create({
      name: req.body.name,
      dzongkhagId: req.body.dzongkhagId,
      address: req.body.address || null,
      phone: req.body.phone || null,
      website: req.body.website || null,
      sourceUrl: req.body.sourceUrl || null,
      verified: false,
      bookingEnabled: false
    });
    req.session.notice = 'Hospital added as unverified. Confirm its details and source before publishing.';
    return res.redirect('/admin');
  } catch (error) {
    return next(error);
  }
});

router.post('/departments', [
  body('name').trim().isLength({ min: 2, max: 100 })
], async (req, res, next) => {
  try {
    if (!validationResult(req).isEmpty()) {
      return res.status(422).render('error', { title: 'Invalid department', message: 'Enter a department name.' });
    }
    await Department.create({ name: req.body.name, description: req.body.description || null });
    req.session.notice = 'Department added.';
    return res.redirect('/admin');
  } catch (error) {
    return next(error);
  }
});

router.post('/hospitals/:id/verify', async (req, res, next) => {
  try {
    const hospital = await Hospital.findByPk(req.params.id);
    if (!hospital || !hospital.sourceUrl) {
      return res.status(409).render('error', { title: 'Cannot verify hospital', message: 'A source URL is required before a hospital can be verified.' });
    }
    await hospital.update({ verified: true, bookingEnabled: req.body.bookingEnabled === 'on' });
    req.session.notice = 'Hospital verification status updated.';
    return res.redirect('/admin');
  } catch (error) {
    return next(error);
  }
});

router.post('/doctors', [
  body('name').trim().isLength({ min: 2, max: 120 }),
  body('hospitalId').isUUID(),
  body('departmentId').isUUID()
], async (req, res, next) => {
  try {
    if (!validationResult(req).isEmpty()) {
      return res.status(422).render('error', { title: 'Invalid doctor', message: 'Enter a name and select a hospital and department.' });
    }
    const hospital = await Hospital.findOne({ where: { id: req.body.hospitalId, verified: true } });
    if (!hospital) {
      return res.status(409).render('error', { title: 'Unverified hospital', message: 'Doctors can only be listed under a verified hospital.' });
    }
    await Doctor.create({
      name: req.body.name,
      title: req.body.title || null,
      hospitalId: hospital.id,
      departmentId: req.body.departmentId,
      bio: req.body.bio || null,
      active: true
    });
    req.session.notice = 'Doctor profile created. Add availability before enabling online bookings.';
    return res.redirect('/admin');
  } catch (error) {
    return next(error);
  }
});

router.post('/doctors/:id/availability', [
  body('dayOfWeek').isInt({ min: 0, max: 6 }),
  body('startTime').matches(/^(?:[01]\d|2[0-3]):[0-5]\d$/),
  body('endTime').matches(/^(?:[01]\d|2[0-3]):[0-5]\d$/),
  body('slotMinutes').isInt({ min: 5, max: 180 })
], async (req, res, next) => {
  try {
    if (!validationResult(req).isEmpty() || req.body.endTime <= req.body.startTime) {
      return res.status(422).render('error', { title: 'Invalid schedule', message: 'Choose a valid weekday, time range and slot length.' });
    }
    const doctor = await Doctor.findByPk(req.params.id);
    if (!doctor) return res.status(404).render('error', { title: 'Doctor not found', message: 'Doctor profile was not found.' });
    await Availability.create({
      doctorId: doctor.id,
      dayOfWeek: Number(req.body.dayOfWeek),
      startTime: `${req.body.startTime}:00`,
      endTime: `${req.body.endTime}:00`,
      slotMinutes: Number(req.body.slotMinutes),
      active: true
    });
    req.session.notice = 'Doctor availability added.';
    return res.redirect('/admin');
  } catch (error) {
    return next(error);
  }
});

router.post('/appointments/:id/status', body('status').isIn(['confirmed', 'cancelled', 'completed']), async (req, res, next) => {
  try {
    if (!validationResult(req).isEmpty()) return res.status(422).redirect('/admin');
    const appointment = await Appointment.findByPk(req.params.id);
    if (!appointment) return res.status(404).render('error', { title: 'Not found', message: 'Appointment was not found.' });
    await appointment.update({
      status: req.body.status,
      cancelledAt: req.body.status === 'cancelled' ? new Date() : null
    });
    let emailSent = true;
    if (req.body.status === 'cancelled') {
      try {
        const patient = await User.findByPk(appointment.userId);
        await sendMail({
          to: patient.email,
          subject: `DrukCare appointment cancelled - ${appointment.reference}`,
          text: `Your appointment ${appointment.reference} on ${appointment.appointmentDate} has been cancelled by the facility.`
        });
      } catch (mailError) {
        console.error('Admin cancellation email failed:', mailError);
        emailSent = false;
      }
    }
    req.session.notice = emailSent
      ? 'Appointment status updated.'
      : 'Appointment status updated, but the cancellation email could not be sent.';
    return res.redirect('/admin');
  } catch (error) {
    return next(error);
  }
});

router.post('/users/:id/status', body('isActive').isIn(['true', 'false']), async (req, res, next) => {
  try {
    if (!validationResult(req).isEmpty()) return res.status(422).redirect('/admin');
    if (req.params.id === req.session.user.id && req.body.isActive === 'false') {
      return res.status(409).render('error', { title: 'Cannot disable account', message: 'You cannot disable your own administrator account.' });
    }
    const user = await User.findByPk(req.params.id);
    if (!user) return res.status(404).render('error', { title: 'Not found', message: 'User account was not found.' });
    await user.update({ isActive: req.body.isActive === 'true' });
    req.session.notice = 'User account status updated.';
    return res.redirect('/admin');
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
