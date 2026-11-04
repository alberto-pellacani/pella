// Verifica rapida della connessione: node --env-file=.env scripts/check-db.js
const { prisma } = require('../src/db/prisma');
const { createPrismaUserRepo } = require('../src/db/prismaUserRepo');

createPrismaUserRepo(prisma).count()
  .then((n) => console.log(`Connessione OK. Utenti nel database: ${n}`))
  .catch((e) => { console.error('Connessione fallita:', e.message); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
