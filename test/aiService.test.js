const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createAiService, maskKey } = require('../src/services/aiService');
const { createSecretBox } = require('../src/services/secretBox');
const { AiProviderError } = require('../src/ai/providers');
const { DEV_AI_KEY } = require('../src/config');
const { createFakeAiRepo } = require('./fakeAiRepo');

const KEY = 'sk-proj-abcdefghijklmnop1234';

// Client finto: restituisce i modelli indicati, oppure lancia l'errore indicato
function fakeClient({ models = [{ id: 'gpt-a', name: 'GPT A' }, { id: 'gpt-b', name: 'GPT B' }], error = null } = {}) {
  return {
    async listModels() { if (error) throw error; return models; },
    async testConnection() { if (error) throw error; },
  };
}

function setup(opts = {}) {
  const repo = opts.repo || createFakeAiRepo();
  const secretBox = 'secretBox' in opts ? opts.secretBox : createSecretBox(DEV_AI_KEY);
  const service = createAiService({ repo, client: opts.client || fakeClient(), secretBox });
  return { repo, service };
}

const code = (c) => (err) => { assert.equal(err.code, c); return true; };

test('maskKey: prefisso + ultime 4 per chiavi lunghe, solo ultime 4 per chiavi corte', () => {
  assert.equal(maskKey(KEY), 'sk-pro••••1234');
  assert.equal(maskKey('short5678'), '••••5678');
});

test('saveCredentials: la chiave è cifrata e mascherata; vuota al secondo salvataggio mantiene la precedente', async () => {
  const { repo, service } = setup();
  await service.saveCredentials('openai', { apiKey: KEY });
  const stored = await repo.findProvider('openai');
  assert.ok(!stored.apiKeyEnc.includes(KEY));
  assert.ok(!stored.apiKeyEnc.includes('abcdefghijklmnop'));
  assert.equal(stored.apiKeyHint, 'sk-pro••••1234');

  await service.saveCredentials('openai', { apiKey: '   ' });
  await service.addModelManually('openai', { modelId: 'gpt-a', displayName: 'GPT A' });
  const [active] = await service.getActiveModels();
  assert.equal(active.credentials.apiKey, KEY);
});

test('saveCredentials: validazioni (chiave obbligatoria la prima volta, endpoint Azure https)', async () => {
  const { service } = setup();
  await assert.rejects(service.saveCredentials('openai', { apiKey: '' }), code('INVALID_INPUT'));
  await assert.rejects(service.saveCredentials('azure', { apiKey: KEY }), code('INVALID_INPUT'));
  await assert.rejects(service.saveCredentials('azure', { apiKey: KEY, endpoint: 'http://r.openai.azure.com' }), code('INVALID_INPUT'));
  await service.saveCredentials('azure', { apiKey: KEY, endpoint: 'https://r.openai.azure.com', apiVersion: '' });
  const p = await service.getProvider('azure');
  assert.equal(p.apiVersion, '2024-10-21');
  assert.equal(p.endpoint, 'https://r.openai.azure.com');
});

test('senza secretBox: encryptionReady false e salvataggio rifiutato', async () => {
  const { service } = setup({ secretBox: null });
  assert.equal(service.encryptionReady, false);
  await assert.rejects(service.saveCredentials('openai', { apiKey: KEY }), code('AI_KEY_MISSING'));
});

test('getProvider con tipo sconosciuto → PROVIDER_NOT_FOUND; listProviders restituisce 5 voci', async () => {
  const { service } = setup();
  await assert.rejects(service.getProvider('pippo'), code('PROVIDER_NOT_FOUND'));
  const list = await service.listProviders();
  assert.equal(list.length, 5);
  assert.ok(list.every((p) => p.configured === false));
});

test('chiave di cifratura cambiata: keyReadable false, test KEY_UNREADABLE, getActiveModels lo salta', async () => {
  const repo = createFakeAiRepo();
  const { service: before } = setup({ repo });
  await before.saveCredentials('openai', { apiKey: KEY });
  await before.addModelManually('openai', { modelId: 'gpt-a', displayName: 'GPT A' });

  const { service: after } = setup({ repo, secretBox: createSecretBox('f'.repeat(64)) });
  assert.equal((await after.getProvider('openai')).keyReadable, false);
  await assert.rejects(after.testConnection('openai'), code('KEY_UNREADABLE'));
  assert.deepEqual(await after.getActiveModels(), []);
});

test('addModelsFromProvider aggiunge solo id esistenti; fetchAvailableModels segna quelli già aggiunti', async () => {
  const { service } = setup();
  await service.saveCredentials('openai', { apiKey: KEY });
  assert.equal(await service.addModelsFromProvider('openai', ['gpt-a', 'inventato']), 1);
  const available = await service.fetchAvailableModels('openai');
  assert.deepEqual(available, [{ id: 'gpt-a', name: 'GPT A', added: true }, { id: 'gpt-b', name: 'GPT B', added: false }]);
  const p = await service.getProvider('openai');
  assert.deepEqual(p.models.map((m) => [m.modelId, m.displayName, m.active]), [['gpt-a', 'GPT A', true]]);
});

test('addModelsFromProvider/fetchAvailableModels su provider non configurato → PROVIDER_NOT_CONFIGURED', async () => {
  const { service } = setup();
  await assert.rejects(service.fetchAvailableModels('openai'), code('PROVIDER_NOT_CONFIGURED'));
});

test('addModelManually: duplicato o campi vuoti → INVALID_INPUT', async () => {
  const { service } = setup();
  await service.saveCredentials('openai', { apiKey: KEY });
  await service.addModelManually('openai', { modelId: 'gpt-a', displayName: 'GPT A' });
  await assert.rejects(service.addModelManually('openai', { modelId: 'gpt-a', displayName: 'Altro' }), code('INVALID_INPUT'));
  await assert.rejects(service.addModelManually('openai', { modelId: ' ', displayName: 'X' }), code('INVALID_INPUT'));
});

test('operazioni su modello di un altro provider → MODEL_NOT_FOUND e nessuna modifica', async () => {
  const { service } = setup();
  await service.saveCredentials('openai', { apiKey: KEY });
  await service.saveCredentials('anthropic', { apiKey: KEY });
  await service.addModelManually('openai', { modelId: 'gpt-a', displayName: 'GPT A' });
  const [m] = (await service.getProvider('openai')).models;
  await assert.rejects(service.deleteModel('anthropic', m.id), code('MODEL_NOT_FOUND'));
  await assert.rejects(service.renameModel('anthropic', m.id, 'X'), code('MODEL_NOT_FOUND'));
  await assert.rejects(service.setModelActive('anthropic', m.id, false), code('MODEL_NOT_FOUND'));
  await assert.rejects(service.deleteModel('openai', 'abc'), code('MODEL_NOT_FOUND'));
  assert.equal((await service.getProvider('openai')).models.length, 1);
});

test('errore del provider in testConnection → PROVIDER_ERROR con il messaggio', async () => {
  const { service } = setup({ client: fakeClient({ error: new AiProviderError('HTTP 401: bad key') }) });
  await service.saveCredentials('openai', { apiKey: KEY });
  await assert.rejects(service.testConnection('openai'), (err) => err.code === 'PROVIDER_ERROR' && /bad key/.test(err.message));
});

test('getActiveModels esclude modelli disattivati e provider disattivati', async () => {
  const { service } = setup();
  await service.saveCredentials('openai', { apiKey: KEY });
  await service.saveCredentials('anthropic', { apiKey: 'ant-key' });
  await service.addModelManually('openai', { modelId: 'gpt-a', displayName: 'GPT A' });
  await service.addModelManually('openai', { modelId: 'gpt-b', displayName: 'GPT B' });
  await service.addModelManually('anthropic', { modelId: 'claude-x', displayName: 'Claude X' });
  const gptB = (await service.getProvider('openai')).models.find((m) => m.modelId === 'gpt-b');
  await service.setModelActive('openai', gptB.id, false);
  await service.setProviderActive('anthropic', false);
  const active = await service.getActiveModels();
  assert.deepEqual(active.map((m) => [m.providerType, m.modelId]), [['openai', 'gpt-a']]);
});

test('renameModel e deleteProvider', async () => {
  const { service } = setup();
  await service.saveCredentials('openai', { apiKey: KEY });
  await service.addModelManually('openai', { modelId: 'gpt-a', displayName: 'GPT A' });
  const [m] = (await service.getProvider('openai')).models;
  await service.renameModel('openai', m.id, 'Nuovo nome');
  assert.equal((await service.getProvider('openai')).models[0].displayName, 'Nuovo nome');
  await service.deleteProvider('openai');
  const p = await service.getProvider('openai');
  assert.equal(p.configured, false);
  assert.deepEqual(p.models, []);
});
