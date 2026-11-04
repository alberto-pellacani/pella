// Punto di avvio: collega l'app al database Neon e avvia il server HTTP
const session = require('express-session');
const PgSession = require('connect-pg-simple')(session);
const { Pool } = require('pg');
const { loadConfig } = require('./config');
const { createApp } = require('./app');
const { prisma } = require('./db/prisma');
const { createPrismaUserRepo } = require('./db/prismaUserRepo');
const { createUserService } = require('./services/userService');

const config = loadConfig(process.env);
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL mancante: impostala nel file .env o su Render');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const sessionStore = new PgSession({ pool, tableName: 'session', createTableIfMissing: false });
const userService = createUserService(createPrismaUserRepo(prisma));

const app = createApp({ userService, sessionStore, config });
app.listen(config.port, () => {
  console.log(`App avviata su ${config.baseUrl} (porta ${config.port})`);
  if (!config.googleEnabled) console.log('Login con Google disattivato: GOOGLE_CLIENT_ID/SECRET non impostati');
});
