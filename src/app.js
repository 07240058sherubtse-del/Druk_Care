require('dotenv').config();
const path = require('path');
const express = require('express');
const helmet = require('helmet');
const session = require('express-session');
const SequelizeStoreFactory = require('connect-session-sequelize');
const csrfProtection = require('./middleware/csrf');
const authRoutes = require('./routes/auth');
const mainRoutes = require('./routes');
const adminRoutes = require('./routes/admin');
const contactRoutes = require('./routes/contact');
const { sequelize, User } = require('./models');

if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) {
  throw new Error('SESSION_SECRET must be set to a random value of at least 32 characters.');
}

const app = express();
const SequelizeStore = SequelizeStoreFactory(session.Store);
const sessionStore = new SequelizeStore({ db: sequelize, tableName: 'sessions', checkExpirationInterval: 15 * 60 * 1000 });

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '..', 'views'));
app.set('trust proxy', 1);
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", 'https://cdn.jsdelivr.net'],
      styleSrc: ["'self'", 'https://cdn.jsdelivr.net'],
      imgSrc: ["'self'", 'data:', 'https:'],
      fontSrc: ["'self'", 'https://cdn.jsdelivr.net', 'data:']
    }
  }
}));
app.use(express.urlencoded({ extended: false, limit: '20kb' }));
app.use(express.json({ limit: '20kb' }));
app.use(express.static(path.join(__dirname, '..', 'public'), { maxAge: process.env.NODE_ENV === 'production' ? '1d' : 0 }));
app.use(session({
  name: 'drukcare.sid',
  secret: process.env.SESSION_SECRET,
  store: sessionStore,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: process.env.COOKIE_SECURE === 'true',
    sameSite: 'lax',
    maxAge: 1000 * 60 * 60 * 12
  }
}));
app.use(async (req, res, next) => {
  if (!req.session.user) return next();
  try {
    const user = await User.findByPk(req.session.user.id);
    if (!user || !user.isActive || !user.emailVerifiedAt) {
      return req.session.destroy((error) => {
        if (error) return next(error);
        res.clearCookie('drukcare.sid');
        return res.redirect('/login');
      });
    }
    req.session.user = { id: user.id, name: user.name, email: user.email, role: user.role };
    return next();
  } catch (error) {
    return next(error);
  }
});
app.use((req, res, next) => {
  res.locals.currentUser = req.session.user || null;
  res.locals.notice = req.session.notice || null;
  res.locals.error = null;
  delete req.session.notice;
  next();
});
app.use(csrfProtection);
app.use('/', authRoutes);
app.use('/', contactRoutes);
app.use('/', mainRoutes);
app.use('/admin', adminRoutes);

app.use((req, res) => res.status(404).render('error', {
  title: 'Page not found',
  message: 'We could not find the page you requested.'
}));

app.use((error, req, res, next) => {
  console.error(error);
  if (res.headersSent) return next(error);
  return res.status(error.status || 500).render('error', {
    title: 'Something went wrong',
    message: process.env.NODE_ENV === 'production'
      ? 'Please try again later. If the problem continues, contact DrukCare support.'
      : error.message
  });
});

app.locals.sessionStore = sessionStore;

module.exports = app;
