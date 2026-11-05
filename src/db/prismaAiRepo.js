// Repository dei provider e modelli AI su PostgreSQL (Neon) tramite Prisma.
// Stesso contratto di test/fakeAiRepo.js.
function createPrismaAiRepo(prisma) {
  const include = { models: { orderBy: { displayName: 'asc' } } };
  const validId = (v) => Number.isInteger(Number(v)) && Number(v) > 0;
  return {
    listProviders: () => prisma.aiProvider.findMany({ include }),
    findProvider: (type) => prisma.aiProvider.findUnique({ where: { type }, include }),
    upsertProvider: (type, data) => prisma.aiProvider.upsert({ where: { type }, create: { type, ...data }, update: data, include }),
    updateProvider: (type, data) => prisma.aiProvider.update({ where: { type }, data, include }),
    deleteProvider: (type) => prisma.aiProvider.deleteMany({ where: { type } }),
    createModels: async (providerId, list) => (await prisma.aiModel.createMany({
      data: list.map((m) => ({ providerId, modelId: m.modelId, displayName: m.displayName })),
      skipDuplicates: true,
    })).count,
    findModel: (v) => (validId(v) ? prisma.aiModel.findUnique({ where: { id: Number(v) } }) : Promise.resolve(null)),
    updateModel: (v, data) => prisma.aiModel.update({ where: { id: Number(v) }, data }),
    deleteModel: (v) => prisma.aiModel.delete({ where: { id: Number(v) } }),
  };
}

module.exports = { createPrismaAiRepo };
