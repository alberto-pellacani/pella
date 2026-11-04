// Punto di avvio: collega l'app al database Neon e avvia il server HTTP
const { loadConfig } = require('./config');
const { createApp } = require('./app');
const { prisma } = require('./db/prisma');
const { createPrismaUserRepo } = require('./db/prismaUserRepo');
const { createSessionStore } = require('./db/sessionStore');
const { createUserService } = require('./services/userService');

const config = loadConfig(process.env);
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL mancante: impostala nel file .env o su Render');

const { store: sessionStore } = createSessionStore(process.env.DATABASE_URL);
const userService = createUserService(createPrismaUserRepo(prisma));

const app = createApp({ userService, sessionStore, config });
app.listen(config.port, () => {
  console.log(`App avviata su ${config.baseUrl} (porta ${config.port})`);
  if (!config.googleEnabled) console.log('Login con Google disattivato: GOOGLE_CLIENT_ID/SECRET non impostati');
});
