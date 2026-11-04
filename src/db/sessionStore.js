// Store delle sessioni su PostgreSQL (tabella "session", creata dalla migrazione Prisma)
const session = require('express-session');
const PgSession = require('connect-pg-simple')(session);
const { Pool } = require('pg');

function createSessionStore(connectionString) {
  const pool = new Pool({ connectionString });
  // Senza questo listener, se Neon chiude una connessione inattiva il processo Node va in crash
  pool.on('error', (err) => console.error('Errore pool sessioni PostgreSQL:', err.message));
  const store = new PgSession({ pool, tableName: 'session', createTableIfMissing: false });
  return { store, pool };
}

module.exports = { createSessionStore };
