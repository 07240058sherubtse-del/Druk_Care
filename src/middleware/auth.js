function requireAuth(req, res, next) {
  if (!req.session.user) {
    req.flashMessage = { type: 'info', text: 'Please sign in to continue.' };
    return res.redirect('/login');
  }
  return next();
}

function requireAdmin(req, res, next) {
  if (!req.session.user || req.session.user.role !== 'admin') {
    return res.status(403).render('error', {
      title: 'Access denied',
      message: 'You do not have permission to access this page.'
    });
  }
  return next();
}

module.exports = { requireAuth, requireAdmin };
