const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createSecretBox } = require('../src/services/secretBox');
const { loadConfig, DEV_AI_KEY } = require('../src/config');

const KEY_A = 'a'.repeat(64);
const KEY_B = 'b'.repeat(64);

test('secretBox: encrypt → decrypt restituisce il testo originale', () => {
  const box = createSecretBox(KEY_A);
  assert.equal(box.decrypt(box.encrypt('sk-segreta-123')), 'sk-segreta-123');
});

test('secretBox: due encrypt dello stesso testo sono diversi e non contengono il testo in chiaro', () => {
  const box = createSecretBox(KEY_A);
  const p1 = box.encrypt('sk-segreta-123');
  const p2 = box.encrypt('sk-segreta-123');
  assert.notEqual(p1, p2);
  assert.ok(!p1.includes('sk-segreta-123'));
});

test('secretBox: decrypt con chiave diversa lancia', () => {
  const payload = createSecretBox(KEY_A).encrypt('ciao');
  assert.throws(() => createSecretBox(KEY_B).decrypt(payload));
});

test('secretBox: decrypt di un payload manomesso lancia', () => {
  const box = createSecretBox(KEY_A);
  const payload = box.encrypt('ciao mondo');
  const last = payload.at(-2);
  const tampered = payload.slice(0, -2) + (last === 'A' ? 'B' : 'A') + payload.at(-1);
  assert.throws(() => box.decrypt(tampered));
});

test('secretBox: chiave non valida lancia', () => {
  assert.throws(() => createSecretBox('abc'));
});

test('loadConfig: AI_ENCRYPTION_KEY null in produzione se mancante, DEV_AI_KEY in sviluppo', () => {
  assert.equal(loadConfig({ SESSION_SECRET: 'x', NODE_ENV: 'production' }).aiEncryptionKey, null);
  assert.equal(loadConfig({ SESSION_SECRET: 'x' }).aiEncryptionKey, DEV_AI_KEY);
  assert.match(DEV_AI_KEY, /^[0-9a-f]{64}$/);
  assert.equal(loadConfig({ SESSION_SECRET: 'x', AI_ENCRYPTION_KEY: KEY_B }).aiEncryptionKey, KEY_B);
});

test('loadConfig: AI_ENCRYPTION_KEY non valida lancia', () => {
  assert.throws(() => loadConfig({ SESSION_SECRET: 'x', AI_ENCRYPTION_KEY: 'zz' }), /AI_ENCRYPTION_KEY non valida/);
});
