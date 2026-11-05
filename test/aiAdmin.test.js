const { test } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const session = require('express-session');
const { createApp } = require('../src/app');
const { loadConfig, DEV_AI_KEY } = require('../src/config');
const { createUserService } = require('../src/services/userService');
const { createAiService } = require('../src/services/aiService');
const { createSecretBox } = require('../src/services/secretBox');
const { AiProviderError } = require('../src/ai/providers');
const { createFakeUserRepo } = require('./fakeUserRepo');
const { createFakeAiRepo } = require('./fakeAiRepo');

const KEY = 'sk-proj-abcdefghijklmnop1234';

function setup({ clientError = null, secretBox = createSecretBox(DEV_AI_KEY) } = {}) {
  const client = {
    async listModels() { if (clientError) throw clientError; return [{ id: 'gpt-a', name: 'GPT A' }, { id: 'gpt-b', name: 'GPT B' }]; },
    async testConnection() { if (clientError) throw clientError; },
  };
  const userService = createUserService(createFakeUserRepo());
  const aiService = createAiService({ repo: createFakeAiRepo(), client, secretBox });
  const config = loadConfig({ SESSION_SECRET: 'test-secret', NODE_ENV: 'test' });
  return createApp({ userService, aiService, sessionStore: new session.MemoryStore(), config });
}

const csrfFrom = (html) => html.match(/name="_csrf" value="([^"]+)"/)[1];

async function registered(app, email) {
  const agent = request.agent(app);
  const _csrf = csrfFrom((await agent.get('/register')).text);
  await agent.post('/register').type('form').send({ _csrf, email, password: 'password1', displayName: '' }).expect(302);
  return agent;
}

async function post(agent, path, body = {}) {
  const _csrf = csrfFrom((await agent.get('/').expect(200)).text);
  return agent.post(path).type('form').send({ _csrf, ...body });
}

test('provider AI: utente normale riceve 403 su GET e POST', async () => {
  const app = setup();
  await registered(app, 'admin@x.it');
  const user = await registered(app, 'user@x.it');
  await user.get('/admin/ai').expect(403);
  const r = await post(user, '/admin/ai/openai/credentials', { apiKey: KEY });
  assert.equal(r.status, 403);
});

test('provider AI: elenco con le 5 etichette; tipo sconosciuto → 404', async () => {
  const app = setup();
  const admin = await registered(app, 'admin@x.it');
  const res = await admin.get('/admin/ai').expect(200);
  for (const label of ['Anthropic', 'OpenAI', 'Google', 'Microsoft Azure', 'OpenRouter']) assert.match(res.text, new RegExp(label));
  await admin.get('/admin/ai/pippo').expect(404);
});

test('provider AI: salvataggio chiave → mostrata solo mascherata', async () => {
  const app = setup();
  const admin = await registered(app, 'admin@x.it');
  const r = await post(admin, '/admin/ai/openai/credentials', { apiKey: KEY });
  assert.equal(r.headers.location, '/admin/ai/openai');
  const page = await admin.get('/admin/ai/openai').expect(200);
  assert.match(page.text, /sk-proj-••••1234/);
  assert.doesNotMatch(page.text, /abcdefghijklmnop/);
});

test('provider AI: errore del provider in prova connessione → messaggio nella pagina', async () => {
  const app = setup({ clientError: new AiProviderError('HTTP 401: bad key') });
  const admin = await registered(app, 'admin@x.it');
  await post(admin, '/admin/ai/openai/credentials', { apiKey: KEY });
  const r = await post(admin, '/admin/ai/openai/test');
  assert.equal(r.headers.location, '/admin/ai/openai');
  assert.match((await admin.get('/admin/ai/openai')).text, /bad key/);
});

test('provider AI: errore del provider nel recupero lista → redirect al dettaglio con messaggio', async () => {
  const app = setup({ clientError: new AiProviderError('Timeout: nessuna risposta') });
  const admin = await registered(app, 'admin@x.it');
  await post(admin, '/admin/ai/openai/credentials', { apiKey: KEY });
  const r = await admin.get('/admin/ai/openai/available').expect(302);
  assert.equal(r.headers.location, '/admin/ai/openai');
  assert.match((await admin.get('/admin/ai/openai')).text, /Timeout/);
});

test('provider AI: recupera lista e aggiunge un modello', async () => {
  const app = setup();
  const admin = await registered(app, 'admin@x.it');
  await post(admin, '/admin/ai/openai/credentials', { apiKey: KEY });
  const list = await admin.get('/admin/ai/openai/available').expect(200);
  assert.match(list.text, /gpt-a/);
  assert.match(list.text, /gpt-b/);
  await post(admin, '/admin/ai/openai/models', { models: 'gpt-a' }).then((r) => assert.equal(r.status, 302));
  const page = await admin.get('/admin/ai/openai').expect(200);
  assert.match(page.text, /gpt-a/);
  assert.doesNotMatch(page.text, /gpt-b/);
});

test('provider AI: senza AI_ENCRYPTION_KEY la pagina lo segnala', async () => {
  const app = setup({ secretBox: null });
  const admin = await registered(app, 'admin@x.it');
  assert.match((await admin.get('/admin/ai').expect(200)).text, /AI_ENCRYPTION_KEY/);
});

test('provider AI: POST modelli senza selezione su tipo sconosciuto → 404', async () => {
  const app = setup();
  const admin = await registered(app, 'admin@x.it');
  const r = await post(admin, '/admin/ai/pippo/models');
  assert.equal(r.status, 404);
});
