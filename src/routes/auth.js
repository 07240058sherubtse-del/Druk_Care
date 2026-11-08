const crypto = require('crypto');
const express = require('express');
const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');
const { Op } = require('sequelize');
const { rateLimit } = require('express-rate-limit');
const { User } = require('../models');
const { sendMail } = require('../services/mailer');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
const authLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: 'Too many attempts. Please try again later.'
});
const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');
const baseUrl = () => process.env.BASE_URL || 'http://localhost:3000';

router.get('/register', (req, res) => res.render('auth/register', { title: 'Create account' }));
router.post('/register', authLimit, [
  body('name').trim().isLength({ min: 2, max: 120 }),
  body('email').trim().isEmail().normalizeEmail(),
  body('password').isLength({ min: 10, max: 128 }),
  body('phone').optional({ checkFalsy: true }).trim().isLength({ max: 30 })
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      req.flash = 'Enter a valid name and email address. Passwords must be at least 10 characters.';
      return res.status(422).render('auth/register', { title: 'Create account', error: req.flash });
    }
    const email = req.body.email.toLowerCase();
    if (await User.findOne({ where: { email } })) {
      return res.status(409).render('auth/register', {
        title: 'Create account',
        error: 'An account already uses that email. Please sign in or reset your password.'
      });
    }
    const token = crypto.randomBytes(32).toString('hex');
    const user = await User.create({
      name: req.body.name,
      email,
      phone: req.body.phone || null,
      passwordHash: await bcrypt.hash(req.body.password, 12),
      verificationTokenHash: hashToken(token),
      verificationExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
    });
    try {
      await sendMail({
        to: user.email,
        subject: 'Verify your DrukCare account',
        text: `Verify your account within 24 hours: ${baseUrl()}/verify/${token}`
      });
    } catch (mailError) {
      await user.destroy();
      throw mailError;
    }
    return res.render('auth/message', {
      title: 'Check your email',
      message: 'We sent an account verification link to your email address. Please verify it before signing in.'
    });
  } catch (error) {
    return next(error);
  }
});

router.get('/verify/:token', async (req, res, next) => {
  try {
    const user = await User.findOne({
      where: {
        verificationTokenHash: hashToken(req.params.token),
        verificationExpiresAt: { [Op.gt]: new Date() }
      }
    });
    if (!user) {
      return res.status(400).render('auth/message', {
        title: 'Link expired',
        message: 'This verification link is invalid or expired. Please register again or contact support.'
      });
    }
    await user.update({
      emailVerifiedAt: new Date(),
      verificationTokenHash: null,
      verificationExpiresAt: null
    });
    return res.render('auth/message', {
      title: 'Email verified',
      message: 'Your email is verified. You can now sign in to DrukCare.'
    });
  } catch (error) {
    return next(error);
  }
});

router.get('/login', (req, res) => res.render('auth/login', { title: 'Sign in' }));
router.post('/login', authLimit, [
  body('email').trim().isEmail().normalizeEmail(),
  body('password').isString().notEmpty()
], async (req, res, next) => {
  try {
    if (!validationResult(req).isEmpty()) {
      return res.status(422).render('auth/login', { title: 'Sign in', error: 'Enter a valid email and password.' });
    }
    const user = await User.findOne({ where: { email: req.body.email.toLowerCase() } });
    if (!user || !user.isActive || !(await bcrypt.compare(req.body.password, user.passwordHash))) {
      return res.status(401).render('auth/login', { title: 'Sign in', error: 'Email or password is incorrect.' });
    }
    if (!user.emailVerifiedAt) {
      return res.status(403).render('auth/login', { title: 'Sign in', error: 'Please verify your email before signing in.' });
    }
    req.session.regenerate((error) => {
      if (error) return next(error);
      req.session.user = { id: user.id, name: user.name, email: user.email, role: user.role };
      req.session.csrfToken = crypto.randomBytes(32).toString('hex');
      return req.session.save((saveError) => {
        if (saveError) return next(saveError);
        return res.redirect(user.role === 'admin' ? '/admin' : '/dashboard');
      });
    });
  } catch (error) {
    return next(error);
  }
});

router.post('/logout', requireAuth, (req, res, next) => {
  req.session.destroy((error) => {
    if (error) return next(error);
    res.clearCookie('drukcare.sid');
    return res.redirect('/');
  });
});

router.get('/forgot-password', (req, res) => res.render('auth/forgot-password', { title: 'Reset password' }));
router.post('/forgot-password', authLimit, body('email').trim().isEmail().normalizeEmail(), async (req, res, next) => {
  try {
    if (!validationResult(req).isEmpty()) {
      return res.status(422).render('auth/forgot-password', { title: 'Reset password', error: 'Enter a valid email.' });
    }
    if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
      return res.status(503).render('error', {
        title: 'Password recovery unavailable',
        message: 'Email delivery is not configured. Please contact DrukCare support.'
      });
    }
    const user = await User.findOne({ where: { email: req.body.email.toLowerCase() } });
    if (user) {
      const token = crypto.randomBytes(32).toString('hex');
      await user.update({
        resetTokenHash: hashToken(token),
        resetExpiresAt: new Date(Date.now() + 60 * 60 * 1000)
      });
      await sendMail({
        to: user.email,
        subject: 'Reset your DrukCare password',
        text: `Reset your password within one hour: ${baseUrl()}/reset-password/${token}`
      });
    }
    return res.render('auth/message', {
      title: 'Check your email',
      message: 'If an account exists for that address, a password reset link has been sent.'
    });
  } catch (error) {
    return next(error);
  }
});

router.get('/reset-password/:token', (req, res) =>
  res.render('auth/reset-password', { title: 'Choose a new password', token: req.params.token }));
router.post('/reset-password/:token', authLimit, [
  body('password').isLength({ min: 10, max: 128 })
], async (req, res, next) => {
  try {
    if (!validationResult(req).isEmpty()) {
      return res.status(422).render('auth/reset-password', {
        title: 'Choose a new password', token: req.params.token,
        error: 'Choose a password with at least 10 characters.'
      });
    }
    const user = await User.findOne({
      where: {
        resetTokenHash: hashToken(req.params.token),
        resetExpiresAt: { [Op.gt]: new Date() }
      }
    });
    if (!user) {
      return res.status(400).render('auth/message', {
        title: 'Link expired',
        message: 'This password reset link is invalid or expired. Request a new one.'
      });
    }
    await user.update({
      passwordHash: await bcrypt.hash(req.body.password, 12),
      resetTokenHash: null,
      resetExpiresAt: null
    });
    return res.render('auth/message', { title: 'Password updated', message: 'Your password has been updated. Sign in to continue.' });
  } catch (error) {
    return next(error);
  }
});

router.get('/profile', requireAuth, async (req, res, next) => {
  try {
    const user = await User.findByPk(req.session.user.id);
    if (!user) return res.status(404).render('error', { title: 'Account not found', message: 'Your account could not be found.' });
    return res.render('auth/profile', { title: 'Edit profile', user });
  } catch (error) {
    return next(error);
  }
});

router.post('/profile', requireAuth, [
  body('name').trim().isLength({ min: 2, max: 120 }),
  body('phone').optional({ checkFalsy: true }).trim().isLength({ max: 30 })
], async (req, res, next) => {
  try {
    if (!validationResult(req).isEmpty()) {
      return res.status(422).render('auth/profile', {
        title: 'Edit profile',
        user: { name: req.body.name, phone: req.body.phone },
        error: 'Enter a name and a valid phone number.'
      });
    }
    const user = await User.findByPk(req.session.user.id);
    if (!user) return res.status(404).render('error', { title: 'Account not found', message: 'Your account could not be found.' });
    await user.update({ name: req.body.name, phone: req.body.phone || null });
    req.session.user.name = user.name;
    req.session.notice = 'Your profile has been updated.';
    return res.redirect('/profile');
  } catch (error) {
    return next(error);
  }
});

router.get('/change-password', requireAuth, (req, res) =>
  res.render('auth/change-password', { title: 'Change password' }));
router.post('/change-password', requireAuth, [
  body('currentPassword').isString().notEmpty(),
  body('password').isLength({ min: 10, max: 128 })
], async (req, res, next) => {
  try {
    if (!validationResult(req).isEmpty()) {
      return res.status(422).render('auth/change-password', {
        title: 'Change password', error: 'New passwords must be at least 10 characters.'
      });
    }
    const user = await User.findByPk(req.session.user.id);
    if (!user || !(await bcrypt.compare(req.body.currentPassword, user.passwordHash))) {
      return res.status(401).render('auth/change-password', {
        title: 'Change password', error: 'Your current password was not correct.'
      });
    }
    await user.update({ passwordHash: await bcrypt.hash(req.body.password, 12) });
    req.session.notice = 'Your password has been changed.';
    return res.redirect('/dashboard');
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
