const express = require('express');
const { body, validationResult } = require('express-validator');
const { rateLimit } = require('express-rate-limit');
const { sendMail } = require('../services/mailer');

const router = express.Router();
const contactLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-8',
  legacyHeaders: false
});

router.get('/contact', (req, res) => res.render('contact', { title: 'Contact DrukCare' }));
router.post('/contact', contactLimit, [
  body('name').trim().isLength({ min: 2, max: 120 }),
  body('email').trim().isEmail().normalizeEmail(),
  body('message').trim().isLength({ min: 10, max: 2000 })
], async (req, res, next) => {
  try {
    if (!validationResult(req).isEmpty()) {
      return res.status(422).render('contact', {
        title: 'Contact DrukCare',
        error: 'Enter your name, a valid email address, and a message between 10 and 2,000 characters.'
      });
    }
    if (!process.env.SUPPORT_EMAIL) throw new Error('SUPPORT_EMAIL is not configured.');
    await sendMail({
      to: process.env.SUPPORT_EMAIL,
      subject: `DrukCare contact form: ${req.body.name}`,
      text: `From: ${req.body.name}\nEmail: ${req.body.email}\n\n${req.body.message}`
    });
    return res.render('auth/message', {
      title: 'Message sent',
      message: 'Thank you for contacting DrukCare. Your message has been delivered.'
    });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
