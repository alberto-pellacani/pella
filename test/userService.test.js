const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createUserService } = require('../src/services/userService');
const { createFakeUserRepo } = require('./fakeUserRepo');

const setup = () => {
  const repo = createFakeUserRepo();
  return { repo, svc: createUserService(repo) };
};
const rejectsCode = (p, code) => assert.rejects(p, (e) => e.code === code);

test('registerLocal: il primo utente è admin, il secondo è user', async () => {
  const { svc } = setup();
  const a = await svc.registerLocal({ email: 'a@x.it', password: 'password1' });
  const b = await svc.registerLocal({ email: 'b@x.it', password: 'password1' });
  assert.equal(a.role, 'admin');
  assert.equal(b.role, 'user');
});

test("registerLocal: normalizza l'email", async () => {
  const { svc } = setup();
  const u = await svc.registerLocal({ email: ' Mario@X.it ', password: 'password1' });
  assert.equal(u.email, 'mario@x.it');
  assert.equal(u.displayName, 'mario');
});

test('registerLocal: password < 8 caratteri → INVALID_INPUT', async () => {
  const { svc } = setup();
  await rejectsCode(svc.registerLocal({ email: 'a@x.it', password: 'corta' }), 'INVALID_INPUT');
  await rejectsCode(svc.registerLocal({ email: 'non-una-email', password: 'password1' }), 'INVALID_INPUT');
});

test('registerLocal: email già registrata con password → EMAIL_TAKEN', async () => {
  const { svc } = setup();
  await svc.registerLocal({ email: 'a@x.it', password: 'password1' });
  await rejectsCode(svc.registerLocal({ email: 'A@x.it', password: 'password2' }), 'EMAIL_TAKEN');
});

test('registerLocal: email di un account solo-Google → EMAIL_GOOGLE_ONLY', async () => {
  const { repo, svc } = setup();
  await repo.create({ email: 'g@x.it', googleId: 'g1', displayName: 'G' });
  await rejectsCode(svc.registerLocal({ email: 'g@x.it', password: 'password1' }), 'EMAIL_GOOGLE_ONLY');
});

test('registerLocal: salva passwordHash diverso dalla password', async () => {
  const { repo, svc } = setup();
  const u = await svc.registerLocal({ email: 'a@x.it', password: 'password1' });
  const stored = await repo.findById(u.id);
  assert.ok(stored.passwordHash);
  assert.notEqual(stored.passwordHash, 'password1');
});

test('authenticateLocal: credenziali giuste → utente; errate → INVALID_CREDENTIALS', async () => {
  const { svc } = setup();
  await svc.registerLocal({ email: 'a@x.it', password: 'password1' });
  const u = await svc.authenticateLocal('a@x.it', 'password1');
  assert.equal(u.email, 'a@x.it');
  await rejectsCode(svc.authenticateLocal('a@x.it', 'sbagliata'), 'INVALID_CREDENTIALS');
  await rejectsCode(svc.authenticateLocal('nessuno@x.it', 'password1'), 'INVALID_CREDENTIALS');
});

test('authenticateLocal: email con maiuscole funziona', async () => {
  const { svc } = setup();
  await svc.registerLocal({ email: 'a@x.it', password: 'password1' });
  const u = await svc.authenticateLocal(' A@X.IT', 'password1');
  assert.equal(u.email, 'a@x.it');
});

test('authenticateLocal: account solo-Google → INVALID_CREDENTIALS', async () => {
  const { repo, svc } = setup();
  await repo.create({ email: 'g@x.it', googleId: 'g1', displayName: 'G' });
  await rejectsCode(svc.authenticateLocal('g@x.it', 'qualsiasi'), 'INVALID_CREDENTIALS');
});

test('authenticateLocal: utente disattivato → INACTIVE', async () => {
  const { repo, svc } = setup();
  const u = await svc.registerLocal({ email: 'a@x.it', password: 'password1' });
  await repo.update(u.id, { active: false });
  await rejectsCode(svc.authenticateLocal('a@x.it', 'password1'), 'INACTIVE');
});

// ---- Task 2: Google, profilo, regole admin ----
const g = (over = {}) => ({ googleId: 'g1', email: 'g@x.it', emailVerified: true, displayName: 'Gianni', ...over });

test('loginWithGoogle: googleId già noto → stesso utente', async () => {
  const { svc } = setup();
  const a = await svc.loginWithGoogle(g());
  const b = await svc.loginWithGoogle(g({ email: 'cambiata@x.it' }));
  assert.equal(a.id, b.id);
});

test('loginWithGoogle: email nuova e verificata → crea utente (admin se primo)', async () => {
  const { svc } = setup();
  const a = await svc.loginWithGoogle(g({ email: 'G@X.it' }));
  assert.equal(a.email, 'g@x.it');
  assert.equal(a.role, 'admin');
  assert.equal(a.displayName, 'Gianni');
  const b = await svc.loginWithGoogle(g({ googleId: 'g2', email: 'h@x.it' }));
  assert.equal(b.role, 'user');
});

test('loginWithGoogle: email esistente e verificata → collega googleId', async () => {
  const { repo, svc } = setup();
  const local = await svc.registerLocal({ email: 'g@x.it', password: 'password1' });
  const u = await svc.loginWithGoogle(g());
  assert.equal(u.id, local.id);
  assert.equal((await repo.findById(local.id)).googleId, 'g1');
  assert.equal(await repo.count(), 1);
});

test('loginWithGoogle: email non verificata o mancante → GOOGLE_EMAIL_UNVERIFIED', async () => {
  const { svc } = setup();
  await rejectsCode(svc.loginWithGoogle(g({ emailVerified: false })), 'GOOGLE_EMAIL_UNVERIFIED');
  await rejectsCode(svc.loginWithGoogle(g({ email: undefined })), 'GOOGLE_EMAIL_UNVERIFIED');
});

test('loginWithGoogle: utente disattivato → INACTIVE', async () => {
  const { repo, svc } = setup();
  const u = await svc.loginWithGoogle(g());
  await repo.update(u.id, { active: false });
  await rejectsCode(svc.loginWithGoogle(g()), 'INACTIVE');
});

test('updateProfile: displayName vuoto → INVALID_INPUT; valido → aggiornato', async () => {
  const { svc } = setup();
  const u = await svc.registerLocal({ email: 'a@x.it', password: 'password1' });
  await rejectsCode(svc.updateProfile(u.id, { displayName: '   ' }), 'INVALID_INPUT');
  const v = await svc.updateProfile(u.id, { displayName: '  Anna  ' });
  assert.equal(v.displayName, 'Anna');
});

test("setRole: declassare l'unico admin attivo → LAST_ADMIN; con 2 admin → ok", async () => {
  const { svc } = setup();
  const a = await svc.registerLocal({ email: 'a@x.it', password: 'password1' });
  const b = await svc.registerLocal({ email: 'b@x.it', password: 'password1' });
  await rejectsCode(svc.setRole(a.id, 'user'), 'LAST_ADMIN');
  await svc.setRole(b.id, 'admin');
  const a2 = await svc.setRole(a.id, 'user');
  assert.equal(a2.role, 'user');
});

test("setActive: disattivare l'unico admin attivo → LAST_ADMIN; un user → ok", async () => {
  const { svc } = setup();
  const a = await svc.registerLocal({ email: 'a@x.it', password: 'password1' });
  const b = await svc.registerLocal({ email: 'b@x.it', password: 'password1' });
  await rejectsCode(svc.setActive(a.id, false), 'LAST_ADMIN');
  const b2 = await svc.setActive(b.id, false);
  assert.equal(b2.active, false);
});

test('setRole: ruolo non valido → INVALID_INPUT; id inesistente → NOT_FOUND', async () => {
  const { svc } = setup();
  const a = await svc.registerLocal({ email: 'a@x.it', password: 'password1' });
  await rejectsCode(svc.setRole(a.id, 'superuser'), 'INVALID_INPUT');
  await rejectsCode(svc.setRole(999, 'user'), 'NOT_FOUND');
  await rejectsCode(svc.setActive(999, false), 'NOT_FOUND');
});

test('getActiveUser: utente disattivato → null; listUsers ordina per data', async () => {
  const { svc } = setup();
  const a = await svc.registerLocal({ email: 'a@x.it', password: 'password1' });
  const b = await svc.registerLocal({ email: 'b@x.it', password: 'password1' });
  assert.equal((await svc.getActiveUser(b.id)).email, 'b@x.it');
  await svc.setActive(b.id, false);
  assert.equal(await svc.getActiveUser(b.id), null);
  assert.equal(await svc.getActiveUser(999), null);
  assert.deepEqual((await svc.listUsers()).map((u) => u.id), [a.id, b.id]);
});

test('loginWithGoogle: collegando un account con password non verificata, la password viene rimossa', async () => {
  const { repo, svc } = setup();
  const local = await svc.registerLocal({ email: 'g@x.it', password: 'password1' });
  const u = await svc.loginWithGoogle(g());
  assert.equal(u.hasPassword, false);
  assert.equal((await repo.findById(local.id)).passwordHash, null);
  await rejectsCode(svc.authenticateLocal('g@x.it', 'password1'), 'INVALID_CREDENTIALS');
});
