const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createSessionStore } = require('../src/db/sessionStore');

test('createSessionStore: il pool pg ha un listener di errore (evita crash se Neon chiude una connessione)', async () => {
  const { pool } = createSessionStore('postgresql://u:p@localhost:1/db');
  assert.ok(pool.listenerCount('error') > 0);
  await pool.end();
});
