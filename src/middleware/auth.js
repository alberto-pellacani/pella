function requireLogin(req, res, next) {
  if (req.user) return next();
  return res.redirect('/login');
}

function requireAdmin(req, res, next) {
  if (req.user && req.user.role === 'admin') return next();
  return res.status(403).render('error', { title: 'Accesso negato', message: 'Questa pagina è riservata agli amministratori.' });
}

// Messaggio da mostrare una sola volta nella pagina successiva
function flash(req, type, text) {
  req.session.flash = { type, text };
}

module.exports = { requireLogin, requireAdmin, flash };
