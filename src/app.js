const path = require('node:path');
const express = require('express');
const session = require('express-session');
const helmet = require('helmet');
const { csrfSync } = require('csrf-sync');
const { createPassport } = require('./auth/passport');
const { authRoutes } = require('./routes/auth');
const { profileRoutes } = require('./routes/profile');
const { adminRoutes } = require('./routes/admin');
const { aiAdminRoutes } = require('./routes/aiAdmin');

function createApp({ userService, aiService, sessionStore, config }) {
  const app = express();
  const passport = createPassport(userService, config);
  const { csrfSynchronisedProtection, generateToken } = csrfSync({
    getTokenFromRequest: (req) => req.body && req.body._csrf,
  });

  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, '..', 'views'));
  // Su Render l'app sta dietro un proxy HTTPS: serve per i cookie "secure"
  if (config.isProd) app.set('trust proxy', 1);

  app.use(helmet());
  app.use(express.static(path.join(__dirname, '..', 'public')));
  app.use(express.urlencoded({ extended: false }));
  app.use(session({
    store: sessionStore,
    secret: config.sessionSecret,
    name: 'sid',
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, sameSite: 'lax', secure: config.isProd, maxAge: 7 * 24 * 60 * 60 * 1000 },
  }));
  app.use(passport.initialize());
  app.use(passport.session());

  // Variabili disponibili in tutte le pagine
  app.use((req, res, next) => {
    res.locals.currentUser = req.user || null;
    res.locals.currentPath = req.path;
    res.locals.csrfToken = generateToken(req);
    res.locals.flash = req.session.flash || null;
    delete req.session.flash;
    next();
  });
  app.use(csrfSynchronisedProtection);

  app.use(authRoutes({ passport, userService, config }));
  app.use(profileRoutes({ userService }));
  app.use(adminRoutes({ userService }));
  app.use(aiAdminRoutes({ aiService }));

  app.use((req, res) => res.status(404).render('error', { title: 'Pagina non trovata', message: 'La pagina richiesta non esiste.' }));

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    const status = err.status || err.statusCode || 500;
    if (status >= 500) console.error(err);
    const message = status === 403
      ? 'Richiesta non valida o scaduta. Ricarica la pagina e riprova.'
      : 'Si è verificato un errore imprevisto.';
    res.status(status).render('error', { title: 'Errore', message });
  });

  return app;
}

module.exports = { createApp };
