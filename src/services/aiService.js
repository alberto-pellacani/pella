// Logica dei provider AI: credenziali cifrate, modelli abilitati, prova connessione.
// Dipendenze iniettate: repo (Prisma o in memoria), client HTTP dei provider, secretBox (null se manca la chiave).
const { PROVIDERS, findProvider, AiProviderError } = require('../ai/providers');
const { UserError } = require('./errors');

const DEFAULT_AZURE_API_VERSION = '2024-10-21';
const MAX_LEN = 200;

// Prefissi pubblici delle chiavi (non segreti): l'unica parte iniziale che si può mostrare
const PUBLIC_PREFIX = /^(sk-ant-|sk-or-v1-|sk-or-|sk-proj-|sk-svcacct-|sk-|AIza)/;

// Mostra solo il prefisso pubblico (se c'è) e le ultime 4 cifre della chiave
function maskKey(apiKey) {
  const key = String(apiKey);
  const prefix = key.length >= 20 ? (key.match(PUBLIC_PREFIX) || [''])[0] : '';
  return `${prefix}••••${key.slice(-4)}`;
}

const clean = (v) => String(v ?? '').trim();

function createAiService({ repo, client, secretBox }) {
  const descriptorFor = (type) => {
    const d = findProvider(type);
    if (!d) throw new UserError('PROVIDER_NOT_FOUND');
    return d;
  };

  async function requireConfigured(type) {
    descriptorFor(type);
    const p = await repo.findProvider(type);
    if (!p) throw new UserError('PROVIDER_NOT_CONFIGURED');
    return p;
  }

  // Restituisce la chiave in chiaro oppure null se non decifrabile (chiave di cifratura cambiata/mancante)
  function tryDecrypt(p) {
    if (!secretBox) return null;
    try { return secretBox.decrypt(p.apiKeyEnc); } catch { return null; }
  }

  function credentialsOf(p) {
    const apiKey = tryDecrypt(p);
    if (apiKey === null) throw new UserError('KEY_UNREADABLE');
    return { apiKey, endpoint: p.endpoint, apiVersion: p.apiVersion };
  }

  // Esegue una chiamata al provider trasformando gli errori HTTP in messaggi per l'utente
  async function callProvider(fn) {
    try {
      return await fn();
    } catch (err) {
      if (err instanceof AiProviderError) throw new UserError('PROVIDER_ERROR', err.message);
      throw err;
    }
  }

  async function listProviders() {
    const stored = await repo.listProviders();
    return PROVIDERS.map((d) => {
      const p = stored.find((s) => s.type === d.type);
      return { ...d, configured: Boolean(p), active: Boolean(p && p.active), modelCount: p ? p.models.length : 0 };
    });
  }

  async function getProvider(type) {
    const d = descriptorFor(type);
    const p = await repo.findProvider(type);
    return {
      ...d,
      configured: Boolean(p),
      active: Boolean(p && p.active),
      keyHint: p ? p.apiKeyHint : null,
      endpoint: p ? p.endpoint : null,
      apiVersion: p ? p.apiVersion : null,
      keyReadable: Boolean(p) && tryDecrypt(p) !== null,
      models: p ? p.models.map(({ id, modelId, displayName, active }) => ({ id, modelId, displayName, active })) : [],
    };
  }

  async function saveCredentials(type, { apiKey, endpoint, apiVersion } = {}) {
    const d = descriptorFor(type);
    if (!secretBox) throw new UserError('AI_KEY_MISSING');
    const existing = await repo.findProvider(type);
    const key = clean(apiKey);
    if (!key && !existing) throw new UserError('INVALID_INPUT', 'Inserisci la chiave API.');

    const data = {};
    if (key) Object.assign(data, { apiKeyEnc: secretBox.encrypt(key), apiKeyHint: maskKey(key) });
    if (d.needsEndpoint) {
      const ep = clean(endpoint).replace(/\/+$/, '');
      if (!/^https:\/\/[^\s/]+/.test(ep)) throw new UserError('INVALID_INPUT', "L'endpoint deve iniziare con https://");
      data.endpoint = ep;
      data.apiVersion = clean(apiVersion) || DEFAULT_AZURE_API_VERSION;
    }
    await repo.upsertProvider(type, data);
  }

  async function setProviderActive(type, active) {
    await requireConfigured(type);
    await repo.updateProvider(type, { active: Boolean(active) });
  }

  async function deleteProvider(type) {
    descriptorFor(type);
    await repo.deleteProvider(type);
  }

  async function testConnection(type) {
    const p = await requireConfigured(type);
    const creds = credentialsOf(p);
    await callProvider(() => client.testConnection(type, creds));
  }

  async function fetchAvailableModels(type) {
    const p = await requireConfigured(type);
    const creds = credentialsOf(p);
    const models = await callProvider(() => client.listModels(type, creds));
    const added = new Set(p.models.map((m) => m.modelId));
    return models.map((m) => ({ id: m.id, name: m.name, added: added.has(m.id) }));
  }

  async function addModelsFromProvider(type, modelIds) {
    const p = await requireConfigured(type);
    const wanted = new Set(modelIds);
    const available = await fetchAvailableModels(type);
    const toAdd = available.filter((m) => wanted.has(m.id) && !m.added)
      .map((m) => ({ modelId: m.id, displayName: m.name.slice(0, MAX_LEN) }));
    return toAdd.length ? repo.createModels(p.id, toAdd) : 0;
  }

  async function addModelManually(type, { modelId, displayName } = {}) {
    const p = await requireConfigured(type);
    const id = clean(modelId);
    const name = clean(displayName);
    if (!id || !name || id.length > MAX_LEN || name.length > MAX_LEN) {
      throw new UserError('INVALID_INPUT', `ID modello e nome sono obbligatori (massimo ${MAX_LEN} caratteri).`);
    }
    if (p.models.some((m) => m.modelId === id)) throw new UserError('INVALID_INPUT', 'Modello già presente.');
    await repo.createModels(p.id, [{ modelId: id, displayName: name }]);
  }

  // Carica un modello verificando che appartenga al provider indicato
  async function modelOf(type, id) {
    descriptorFor(type);
    const p = await repo.findProvider(type);
    const m = await repo.findModel(id);
    if (!p || !m || m.providerId !== p.id) throw new UserError('MODEL_NOT_FOUND');
    return m;
  }

  async function setModelActive(type, id, active) {
    const m = await modelOf(type, id);
    await repo.updateModel(m.id, { active: Boolean(active) });
  }

  async function renameModel(type, id, displayName) {
    const m = await modelOf(type, id);
    const name = clean(displayName);
    if (!name || name.length > MAX_LEN) throw new UserError('INVALID_INPUT', `Il nome deve avere tra 1 e ${MAX_LEN} caratteri.`);
    await repo.updateModel(m.id, { displayName: name });
  }

  async function deleteModel(type, id) {
    const m = await modelOf(type, id);
    await repo.deleteModel(m.id);
  }

  // Per le funzionalità future: modelli utilizzabili con le relative credenziali in chiaro
  async function getActiveModels() {
    const result = [];
    for (const p of await repo.listProviders()) {
      if (!p.active) continue;
      const apiKey = tryDecrypt(p);
      if (apiKey === null) continue;
      for (const m of p.models.filter((x) => x.active)) {
        result.push({
          providerType: p.type,
          modelId: m.modelId,
          displayName: m.displayName,
          credentials: { apiKey, endpoint: p.endpoint, apiVersion: p.apiVersion },
        });
      }
    }
    return result;
  }

  return {
    encryptionReady: Boolean(secretBox),
    listProviders,
    getProvider,
    saveCredentials,
    setProviderActive,
    deleteProvider,
    testConnection,
    fetchAvailableModels,
    addModelsFromProvider,
    addModelManually,
    setModelActive,
    renameModel,
    deleteModel,
    getActiveModels,
  };
}

module.exports = { createAiService, maskKey };
