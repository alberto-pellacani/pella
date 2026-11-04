const express = require('express');
const { UserError } = require('../services/errors');
const { requireLogin, requireAdmin, flash } = require('../middleware/auth');

function adminRoutes({ userService }) {
  const router = express.Router();
  router.use('/admin', requireLogin, requireAdmin);

  router.get('/admin', async (req, res) => {
    res.render('admin', { title: 'Gestione utenti', users: await userService.listUsers() });
  });

  // Esegue un'azione admin; se l'admin ha tolto i permessi a se stesso lo porta al profilo
  const action = (fn, okMessage) => async (req, res, next) => {
    try {
      const updated = await fn(req.params.id, req.body);
      flash(req, 'success', okMessage(updated));
      const self = updated.id === req.user.id;
      if (self && (updated.role !== 'admin' || !updated.active)) return res.redirect('/profile');
    } catch (err) {
      if (!(err instanceof UserError)) return next(err);
      flash(req, 'error', err.message);
    }
    res.redirect('/admin');
  };

  router.post('/admin/users/:id/role', action(
    (id, body) => userService.setRole(id, body.role),
    (u) => `Ruolo di ${u.email} impostato a "${u.role}".`,
  ));
  router.post('/admin/users/:id/active', action(
    (id, body) => userService.setActive(id, body.active === 'true'),
    (u) => `${u.email} ${u.active ? 'riattivato' : 'disattivato'}.`,
  ));

  return router;
}

module.exports = { adminRoutes };
