const { test } = require('node:test');
const assert = require('node:assert/strict');
const { PROVIDERS, findProvider, createAiClient, AiProviderError } = require('../src/ai/providers');

// fetch finto: registra le chiamate e restituisce la risposta indicata
function fakeFetch(response) {
  const calls = [];
  const fn = async (url, opts = {}) => {
    calls.push({ url, headers: opts.headers || {} });
    if (typeof response === 'function') return response(url);
    return { ok: true, status: 200, json: async () => response };
  };
  fn.calls = calls;
  return fn;
}

const creds = { apiKey: 'KEY123' };

test('PROVIDERS: 5 provider, solo azure senza elenco modelli e con endpoint', () => {
  assert.deepEqual(PROVIDERS.map((p) => p.type), ['anthropic', 'openai', 'google', 'azure', 'openrouter']);
  assert.equal(findProvider('azure').canListModels, false);
  assert.equal(findProvider('azure').needsEndpoint, true);
  assert.equal(findProvider('openai').needsEndpoint, false);
  assert.equal(findProvider('pippo'), undefined);
});

test('anthropic: URL, header e mappatura', async () => {
  const fetch = fakeFetch({ data: [{ id: 'claude-b', display_name: 'Claude B' }, { id: 'claude-a', display_name: 'Claude A' }] });
  const models = await createAiClient({ fetch }).listModels('anthropic', creds);
  assert.equal(fetch.calls[0].url, 'https://api.anthropic.com/v1/models?limit=1000');
  assert.equal(fetch.calls[0].headers['x-api-key'], 'KEY123');
  assert.equal(fetch.calls[0].headers['anthropic-version'], '2023-06-01');
  assert.deepEqual(models, [{ id: 'claude-a', name: 'Claude A' }, { id: 'claude-b', name: 'Claude B' }]);
});

test('openai: URL, header Bearer e nome = id', async () => {
  const fetch = fakeFetch({ data: [{ id: 'gpt-x' }] });
  const models = await createAiClient({ fetch }).listModels('openai', creds);
  assert.equal(fetch.calls[0].url, 'https://api.openai.com/v1/models');
  assert.equal(fetch.calls[0].headers.Authorization, 'Bearer KEY123');
  assert.deepEqual(models, [{ id: 'gpt-x', name: 'gpt-x' }]);
});

test('google: rimuove "models/" e tiene solo generateContent', async () => {
  const fetch = fakeFetch({ models: [
    { name: 'models/gemini-pro', displayName: 'Gemini Pro', supportedGenerationMethods: ['generateContent'] },
    { name: 'models/embedding-1', displayName: 'Embedding', supportedGenerationMethods: ['embedContent'] },
  ] });
  const models = await createAiClient({ fetch }).listModels('google', creds);
  assert.equal(fetch.calls[0].url, 'https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000');
  assert.equal(fetch.calls[0].headers['x-goog-api-key'], 'KEY123');
  assert.deepEqual(models, [{ id: 'gemini-pro', name: 'Gemini Pro' }]);
});

test('openrouter: elenco modelli e prova connessione su /key', async () => {
  const fetch = fakeFetch({ data: [{ id: 'meta/llama', name: 'Llama' }] });
  const client = createAiClient({ fetch });
  assert.deepEqual(await client.listModels('openrouter', creds), [{ id: 'meta/llama', name: 'Llama' }]);
  assert.equal(fetch.calls[0].url, 'https://openrouter.ai/api/v1/models');
  await client.testConnection('openrouter', creds);
  assert.equal(fetch.calls[1].url, 'https://openrouter.ai/api/v1/key');
  assert.equal(fetch.calls[1].headers.Authorization, 'Bearer KEY123');
});

test('azure: prova connessione su endpoint/openai/models, elenco non disponibile', async () => {
  const fetch = fakeFetch({ data: [] });
  const client = createAiClient({ fetch });
  await client.testConnection('azure', { apiKey: 'K', endpoint: 'https://r.openai.azure.com/', apiVersion: '2024-10-21' });
  assert.equal(fetch.calls[0].url, 'https://r.openai.azure.com/openai/models?api-version=2024-10-21');
  assert.equal(fetch.calls[0].headers['api-key'], 'K');
  await assert.rejects(client.listModels('azure', creds), AiProviderError);
});

test('errore 401 con messaggio del provider', async () => {
  const fetch = fakeFetch(() => ({ ok: false, status: 401, json: async () => ({ error: { message: 'invalid x-api-key' } }) }));
  await assert.rejects(createAiClient({ fetch }).testConnection('anthropic', creds), (err) => {
    assert.ok(err instanceof AiProviderError);
    assert.match(err.message, /401/);
    assert.match(err.message, /invalid x-api-key/);
    return true;
  });
});

test('errore 500 con body non JSON', async () => {
  const fetch = fakeFetch(() => ({ ok: false, status: 500, json: async () => { throw new SyntaxError('bad json'); } }));
  await assert.rejects(createAiClient({ fetch }).listModels('openai', creds), (err) => err instanceof AiProviderError && /500/.test(err.message));
});

test('errore di rete e timeout diventano AiProviderError', async () => {
  const netFail = async () => { throw new TypeError('fetch failed'); };
  await assert.rejects(createAiClient({ fetch: netFail }).listModels('openai', creds), (err) => err instanceof AiProviderError && /non raggiungibile/.test(err.message));
  const timeout = async () => { const e = new Error('timeout'); e.name = 'TimeoutError'; throw e; };
  await assert.rejects(createAiClient({ fetch: timeout }).listModels('openai', creds), (err) => err instanceof AiProviderError && /Timeout/.test(err.message));
});

test('risposta 200 non JSON (es. pagina HTML) → AiProviderError, non successo', async () => {
  const fetch = fakeFetch(() => ({ ok: true, status: 200, json: async () => { throw new SyntaxError('Unexpected token <'); } }));
  await assert.rejects(createAiClient({ fetch }).testConnection('azure', { apiKey: 'K', endpoint: 'https://x', apiVersion: 'v' }), AiProviderError);
});

test('risposta con formato inatteso → AiProviderError', async () => {
  const fetch = fakeFetch({ data: [{ name: 'senza id' }] });
  await assert.rejects(createAiClient({ fetch }).listModels('openai', creds), AiProviderError);
  const fetch2 = fakeFetch({ data: 'non un array' });
  await assert.rejects(createAiClient({ fetch: fetch2 }).listModels('openai', creds), AiProviderError);
});
