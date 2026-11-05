// Pagine admin per configurare i provider AI e i loro modelli
const express = require('express');
const { UserError } = require('../services/errors');
const { requireLogin, requireAdmin, flash } = require('../middleware/auth');
const { findProvider } = require('../ai/providers');

const notFound = (res) => res.status(404).render('error', { title: 'Pagina non trovata', message: 'Provider non trovato.' });

// Il body urlencoded dà una stringa per un solo valore e un array per più valori
const asArray = (v) => (v === undefined ? [] : [].concat(v));

function aiAdminRoutes({ aiService }) {
  const router = express.Router();
  router.use('/admin/ai', requireLogin, requireAdmin);

  // Esegue un'azione, mostra l'esito come messaggio flash e torna alla pagina del provider
  const action = (fn, okMessage, redirectTo = (req) => `/admin/ai/${req.params.type}`) => async (req, res, next) => {
    try {
      const result = await fn(req);
      if (okMessage) flash(req, 'success', typeof okMessage === 'function' ? okMessage(result) : okMessage);
    } catch (err) {
      if (!(err instanceof UserError)) return next(err);
      if (err.code === 'PROVIDER_NOT_FOUND') return notFound(res);
      flash(req, 'error', err.message);
    }
    return res.redirect(redirectTo(req));
  };

  router.get('/admin/ai', async (req, res) => {
    res.render('ai-providers', {
      title: 'Provider AI',
      providers: await aiService.listProviders(),
      encryptionReady: aiService.encryptionReady,
    });
  });

  router.get('/admin/ai/:type', async (req, res, next) => {
    try {
      const provider = await aiService.getProvider(req.params.type);
      res.render('ai-provider', { title: provider.label, provider, encryptionReady: aiService.encryptionReady });
    } catch (err) {
      if (err instanceof UserError && err.code === 'PROVIDER_NOT_FOUND') return notFound(res);
      next(err);
    }
  });

  router.get('/admin/ai/:type/available', async (req, res, next) => {
    try {
      const provider = await aiService.getProvider(req.params.type);
      const models = await aiService.fetchAvailableModels(req.params.type);
      res.render('ai-available', { title: `Modelli ${provider.label}`, provider, models });
    } catch (err) {
      if (!(err instanceof UserError)) return next(err);
      if (err.code === 'PROVIDER_NOT_FOUND') return notFound(res);
      flash(req, 'error', err.message);
      res.redirect(`/admin/ai/${req.params.type}`);
    }
  });

  router.post('/admin/ai/:type/credentials', action(
    (req) => aiService.saveCredentials(req.params.type, req.body),
    'Credenziali salvate.',
  ));
  router.post('/admin/ai/:type/active', action(
    (req) => aiService.setProviderActive(req.params.type, req.body.active === 'true'),
    'Stato del provider aggiornato.',
  ));
  router.post('/admin/ai/:type/delete', action(
    (req) => aiService.deleteProvider(req.params.type),
    'Configurazione eliminata.',
    () => '/admin/ai',
  ));
  router.post('/admin/ai/:type/test', action(
    (req) => aiService.testConnection(req.params.type),
    'Connessione riuscita.',
  ));

  router.post('/admin/ai/:type/models', async (req, res, next) => {
    if (!findProvider(req.params.type)) return notFound(res);
    const ids = asArray(req.body.models);
    if (ids.length === 0) {
      flash(req, 'error', 'Nessun modello selezionato.');
      return res.redirect(`/admin/ai/${encodeURIComponent(req.params.type)}/available`);
    }
    return action(
      () => aiService.addModelsFromProvider(req.params.type, ids),
      (n) => (n === 1 ? '1 modello aggiunto.' : `${n} modelli aggiunti.`),
    )(req, res, next);
  });
  router.post('/admin/ai/:type/models/manual', action(
    (req) => aiService.addModelManually(req.params.type, req.body),
    'Modello aggiunto.',
  ));
  router.post('/admin/ai/:type/models/:id/active', action(
    (req) => aiService.setModelActive(req.params.type, req.params.id, req.body.active === 'true'),
    'Stato del modello aggiornato.',
  ));
  router.post('/admin/ai/:type/models/:id/name', action(
    (req) => aiService.renameModel(req.params.type, req.params.id, req.body.displayName),
    'Nome del modello aggiornato.',
  ));
  router.post('/admin/ai/:type/models/:id/delete', action(
    (req) => aiService.deleteModel(req.params.type, req.params.id),
    'Modello eliminato.',
  ));

  return router;
}

module.exports = { aiAdminRoutes };
