// Configurazione della CLI di Prisma (migrate, studio, ...)
const { defineConfig } = require('prisma/config');

// In locale carica .env; su Render le variabili arrivano già dall'ambiente
try { process.loadEnvFile(); } catch { /* .env assente: va bene */ }

module.exports = defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  // Le migrazioni usano la connessione "direct" di Neon (senza pooler)
  datasource: { url: process.env.DIRECT_URL },
});
