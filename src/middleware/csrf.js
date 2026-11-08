const crypto = require('crypto');

function csrfProtection(req, res, next) {
  if (!req.session.csrfToken) {
    req.session.csrfToken = crypto.randomBytes(32).toString('hex');
  }
  res.locals.csrfToken = req.session.csrfToken;
  if (req.method === 'POST') {
    const submitted = req.body?._csrf || req.get('x-csrf-token') || '';
    const expected = req.session.csrfToken;
    const validLength = submitted.length === expected.length;
    const valid = validLength && crypto.timingSafeEqual(
      Buffer.from(submitted),
      Buffer.from(expected)
    );
    if (!valid) {
      return res.status(403).render('error', {
        title: 'Request expired',
        message: 'This form has expired. Go back, refresh the page, and try again.'
      });
    }
  }
  return next();
}

module.exports = csrfProtection;
