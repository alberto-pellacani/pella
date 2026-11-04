const express = require('express');
const { UserError } = require('../services/errors');
const { requireLogin, flash } = require('../middleware/auth');

function profileRoutes({ userService }) {
  const router = express.Router();
  router.use('/profile', requireLogin);

  router.get('/profile', (req, res) => res.render('profile', { title: 'Il mio profilo' }));

  router.post('/profile', async (req, res, next) => {
    try {
      await userService.updateProfile(req.user.id, { displayName: req.body.displayName });
      flash(req, 'success', 'Profilo aggiornato.');
    } catch (err) {
      if (!(err instanceof UserError)) return next(err);
      flash(req, 'error', err.message);
    }
    res.redirect('/profile');
  });

  return router;
}

module.exports = { profileRoutes };
