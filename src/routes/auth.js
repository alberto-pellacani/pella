const express = require('express');
const { UserError } = require('../services/errors');
const { flash } = require('../middleware/auth');

function authRoutes({ passport, userService, config }) {
  const router = express.Router();

  // Esegue una strategia Passport e poi il login della sessione, mostrando eventuali messaggi
  const authenticate = (strategy, failurePath) => (req, res, next) => {
    passport.authenticate(strategy, (err, user, info) => {
      if (err) return next(err);
      if (!user) {
        flash(req, 'error', (info && info.message) || 'Accesso non riuscito.');
        return res.redirect(failurePath);
      }
      return req.login(user, (e) => (e ? next(e) : res.redirect('/profile')));
    })(req, res, next);
  };

  router.get('/', (req, res) => res.redirect(req.user ? '/profile' : '/login'));

  router.get('/login', (req, res) => res.render('login', { title: 'Accedi', googleEnabled: config.googleEnabled }));
  router.post('/login', authenticate('local', '/login'));

  router.get('/register', (req, res) => res.render('register', { title: 'Registrati', googleEnabled: config.googleEnabled }));
  router.post('/register', async (req, res, next) => {
    try {
      const user = await userService.registerLocal(req.body);
      req.login(user, (e) => (e ? next(e) : res.redirect('/profile')));
    } catch (err) {
      if (!(err instanceof UserError)) return next(err);
      flash(req, 'error', err.message);
      res.redirect('/register');
    }
  });

  router.post('/logout', (req, res, next) => {
    req.logout((err) => (err ? next(err) : res.redirect('/login')));
  });

  if (config.googleEnabled) {
    router.get('/auth/google', passport.authenticate('google', { scope: ['profile', 'email'], prompt: 'select_account' }));
    router.get('/auth/google/callback', authenticate('google', '/login'));
  }

  return router;
}

module.exports = { authRoutes };
