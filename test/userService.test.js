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
