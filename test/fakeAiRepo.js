// Repository in memoria con lo stesso contratto di src/db/prismaAiRepo.js
function createFakeAiRepo() {
  const providers = [];
  const models = [];
  let nextProviderId = 1;
  let nextModelId = 1;

  const withModels = (p) => (p ? {
    ...p,
    models: models.filter((m) => m.providerId === p.id).map((m) => ({ ...m }))
      .sort((a, b) => a.displayName.localeCompare(b.displayName)),
  } : null);
  const byType = (type) => providers.find((p) => p.type === type);
  const modelById = (id) => models.find((m) => m.id === Number(id));

  return {
    async listProviders() { return providers.map(withModels); },
    async findProvider(type) { return withModels(byType(type)); },
    async upsertProvider(type, data) {
      let p = byType(type);
      if (p) Object.assign(p, data, { updatedAt: new Date() });
      else {
        p = { id: nextProviderId++, type, endpoint: null, apiVersion: null, active: true, createdAt: new Date(), updatedAt: new Date(), ...data };
        providers.push(p);
      }
      return withModels(p);
    },
    async updateProvider(type, data) {
      Object.assign(byType(type), data, { updatedAt: new Date() });
      return withModels(byType(type));
    },
    async deleteProvider(type) {
      const p = byType(type);
      if (!p) return;
      providers.splice(providers.indexOf(p), 1);
      for (let i = models.length - 1; i >= 0; i--) if (models[i].providerId === p.id) models.splice(i, 1);
    },
    async createModels(providerId, list) {
      let created = 0;
      for (const { modelId, displayName } of list) {
        if (models.some((m) => m.providerId === providerId && m.modelId === modelId)) continue;
        models.push({ id: nextModelId++, providerId, modelId, displayName, active: true, createdAt: new Date() });
        created++;
      }
      return created;
    },
    async findModel(id) { const m = modelById(id); return m ? { ...m } : null; },
    async updateModel(id, data) { const m = modelById(id); Object.assign(m, data); return { ...m }; },
    async deleteModel(id) { const m = modelById(id); if (m) models.splice(models.indexOf(m), 1); },
  };
}

module.exports = { createFakeAiRepo };
