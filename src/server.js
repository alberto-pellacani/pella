// Punto di avvio: collega l'app al database Neon e avvia il server HTTP
const { loadConfig } = require('./config');
const { createApp } = require('./app');
const { prisma } = require('./db/prisma');
const { createPrismaUserRepo } = require('./db/prismaUserRepo');
const { createSessionStore } = require('./db/sessionStore');
const { createUserService } = require('./services/userService');
const { createPrismaAiRepo } = require('./db/prismaAiRepo');
const { createAiService } = require('./services/aiService');
const { createSecretBox } = require('./services/secretBox');
const { createAiClient } = require('./ai/providers');

const config = loadConfig(process.env);
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL mancante: impostala nel file .env o su Render');

const { store: sessionStore } = createSessionStore(process.env.DATABASE_URL);
const userService = createUserService(createPrismaUserRepo(prisma));

// Le chiavi API dei provider AI sono cifrate con AI_ENCRYPTION_KEY: senza, il salvataggio resta disattivato
const secretBox = config.aiEncryptionKey ? createSecretBox(config.aiEncryptionKey) : null;
const aiService = createAiService({ repo: createPrismaAiRepo(prisma), client: createAiClient(), secretBox });

const app = createApp({ userService, aiService, sessionStore, config });
app.listen(config.port, () => {
  console.log(`App avviata su ${config.baseUrl} (porta ${config.port})`);
  if (!secretBox) console.log('Provider AI: AI_ENCRYPTION_KEY non impostata, salvataggio chiavi disattivato');
  if (!config.googleEnabled) console.log('Login con Google disattivato: GOOGLE_CLIENT_ID/SECRET non impostati');
});
