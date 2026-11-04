const { test } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const session = require('express-session');
const { createApp } = require('../src/app');
const { loadConfig } = require('../src/config');
const { createUserService } = require('../src/services/userService');
const { createFakeUserRepo } = require('./fakeUserRepo');

function setup(envOver = {}) {
  const userService = createUserService(createFakeUserRepo());
  const config = loadConfig({ SESSION_SECRET: 'test-secret', NODE_ENV: 'test', ...envOver });
  const app = createApp({ userService, sessionStore: new session.MemoryStore(), config });
  return { app, userService };
}

const csrfFrom = (html) => {
  const m = html.match(/name="_csrf" value="([^"]+)"/);
  assert.ok(m, 'token CSRF non trovato nella pagina');
  return m[1];
};

async function getCsrf(agent, path) {
  const res = await agent.get(path).expect(200);
  return csrfFrom(res.text);
}

async function register(agent, email, password = 'password1') {
  const _csrf = await getCsrf(agent, '/register');
  return agent.post('/register').type('form').send({ _csrf, email, password, displayName: '' });
}

async function login(agent, email, password = 'password1') {
  const _csrf = await getCsrf(agent, '/login');
  return agent.post('/login').type('form').send({ _csrf, email, password });
}

test('GET /profile da anonimo → redirect /login', async () => {
  const { app } = setup();
  await request(app).get('/profile').expect(302).expect('Location', '/login');
});

test("registrazione → redirect /profile e la pagina mostra l'email", async () => {
  const { app } = setup();
  const agent = request.agent(app);
  await register(agent, 'anna@x.it').then((r) => {
    assert.equal(r.status, 302);
    assert.equal(r.headers.location, '/profile');
  });
  const res = await agent.get('/profile').expect(200);
  assert.match(res.text, /anna@x\.it/);
});

test('registrazione con errore → resta sul form con messaggio', async () => {
  const { app } = setup();
  const agent = request.agent(app);
  const r = await register(agent, 'anna@x.it', 'corta');
  assert.equal(r.headers.location, '/register');
  const res = await agent.get('/register').expect(200);
  assert.match(res.text, /almeno 8 caratteri/);
});

test('POST /login senza _csrf → 403', async () => {
  const { app } = setup();
  const agent = request.agent(app);
  await agent.get('/login');
  await agent.post('/login').type('form').send({ email: 'a@x.it', password: 'password1' }).expect(403);
});

test('login con password errata → resta su /login con messaggio', async () => {
  const { app } = setup();
  const agent = request.agent(app);
  await register(agent, 'anna@x.it');
  const t = await getCsrf(agent, '/profile');
  await agent.post('/logout').type('form').send({ _csrf: t });
  const r = await login(agent, 'anna@x.it', 'sbagliata');
  assert.equal(r.headers.location, '/login');
  const res = await agent.get('/login');
  assert.match(res.text, /Credenziali non valide/);
});

test('login corretto dopo logout → /profile', async () => {
  const { app } = setup();
  const agent = request.agent(app);
  await register(agent, 'anna@x.it');
  const t = await getCsrf(agent, '/profile');
  await agent.post('/logout').type('form').send({ _csrf: t });
  const r = await login(agent, 'ANNA@x.it');
  assert.equal(r.headers.location, '/profile');
});

test('user normale: GET /admin → 403', async () => {
  const { app } = setup();
  await register(request.agent(app), 'admin@x.it');
  const user = request.agent(app);
  await register(user, 'user@x.it');
  await user.get('/admin').expect(403);
});

test('admin: GET /admin elenca gli utenti; POST role cambia il ruolo', async () => {
  const { app, userService } = setup();
  const admin = request.agent(app);
  await register(admin, 'admin@x.it');
  await register(request.agent(app), 'user@x.it');
  const page = await admin.get('/admin').expect(200);
  assert.match(page.text, /user@x\.it/);
  const target = (await userService.listUsers()).find((u) => u.email === 'user@x.it');
  await admin.post(`/admin/users/${target.id}/role`).type('form').send({ _csrf: csrfFrom(page.text), role: 'admin' }).expect(302);
  assert.equal((await userService.getActiveUser(target.id)).role, 'admin');
});

test('admin che si declassa da unico admin → messaggio di errore, ruolo invariato', async () => {
  const { app, userService } = setup();
  const admin = request.agent(app);
  await register(admin, 'admin@x.it');
  const me = (await userService.listUsers())[0];
  const _csrf = await getCsrf(admin, '/admin');
  await admin.post(`/admin/users/${me.id}/role`).type('form').send({ _csrf, role: 'user' }).expect(302);
  const page = await admin.get('/admin').expect(200);
  assert.match(page.text, /almeno un amministratore attivo/);
  assert.equal((await userService.getActiveUser(me.id)).role, 'admin');
});

test("utente disattivato dall'admin con sessione aperta → redirect /login", async () => {
  const { app, userService } = setup();
  const admin = request.agent(app);
  await register(admin, 'admin@x.it');
  const user = request.agent(app);
  await register(user, 'user@x.it');
  await user.get('/profile').expect(200);
  const target = (await userService.listUsers()).find((u) => u.email === 'user@x.it');
  const _csrf = await getCsrf(admin, '/admin');
  await admin.post(`/admin/users/${target.id}/active`).type('form').send({ _csrf, active: 'false' }).expect(302);
  await user.get('/profile').expect(302).expect('Location', '/login');
});

test('POST /logout → GET /profile redirect /login', async () => {
  const { app } = setup();
  const agent = request.agent(app);
  await register(agent, 'anna@x.it');
  const t = await getCsrf(agent, '/profile');
  await agent.post('/logout').type('form').send({ _csrf: t }).expect(302);
  await agent.get('/profile').expect(302).expect('Location', '/login');
});

test('profilo: modifica del nome visualizzato', async () => {
  const { app } = setup();
  const agent = request.agent(app);
  await register(agent, 'anna@x.it');
  const _csrf = await getCsrf(agent, '/profile');
  await agent.post('/profile').type('form').send({ _csrf, displayName: 'Anna Rossi' }).expect(302);
  const res = await agent.get('/profile');
  assert.match(res.text, /Anna Rossi/);
});

test('con Google non configurato il pulsante Google non compare; configurato sì', async () => {
  const off = await request(setup().app).get('/login').expect(200);
  assert.doesNotMatch(off.text, /\/auth\/google/);
  const { app } = setup({ GOOGLE_CLIENT_ID: 'id', GOOGLE_CLIENT_SECRET: 'secret', BASE_URL: 'http://localhost:3000' });
  const on = await request(app).get('/login').expect(200);
  assert.match(on.text, /\/auth\/google/);
  await request(app).get('/auth/google').expect(302).expect('Location', /accounts\.google\.com/);
});

test('loadConfig: in produzione senza SESSION_SECRET lancia errore', () => {
  assert.throws(() => loadConfig({ NODE_ENV: 'production' }), /SESSION_SECRET/);
});
