// Implementazione del repository utenti su PostgreSQL (Neon) tramite Prisma.
// Stesso contratto di test/fakeUserRepo.js.
function createPrismaUserRepo(prisma) {
  const id = (v) => Number(v);
  const validId = (v) => Number.isInteger(id(v)) && id(v) > 0;
  return {
    count: () => prisma.user.count(),
    countActiveAdmins: () => prisma.user.count({ where: { role: 'admin', active: true } }),
    findById: (v) => (validId(v) ? prisma.user.findUnique({ where: { id: id(v) } }) : Promise.resolve(null)),
    findByEmail: (email) => prisma.user.findUnique({ where: { email } }),
    findByGoogleId: (googleId) => prisma.user.findUnique({ where: { googleId } }),
    create: (data) => prisma.user.create({ data }),
    update: (v, data) => prisma.user.update({ where: { id: id(v) }, data }),
    list: () => prisma.user.findMany({ orderBy: { createdAt: 'asc' } }),
  };
}

module.exports = { createPrismaUserRepo };
