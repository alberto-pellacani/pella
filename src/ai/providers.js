// Elenco dei provider AI supportati e chiamate HTTP verso le loro API
// (solo elenco modelli e prova connessione: la generazione arriverà più avanti).

const PROVIDERS = [
  { type: 'anthropic', label: 'Anthropic', canListModels: true, needsEndpoint: false },
  { type: 'openai', label: 'OpenAI', canListModels: true, needsEndpoint: false },
  { type: 'google', label: 'Google', canListModels: true, needsEndpoint: false },
  { type: 'azure', label: 'Microsoft Azure', canListModels: false, needsEndpoint: true },
  { type: 'openrouter', label: 'OpenRouter', canListModels: true, needsEndpoint: false },
];

const findProvider = (type) => PROVIDERS.find((p) => p.type === type);

class AiProviderError extends Error {
  constructor(message) {
    super(message);
    this.name = 'AiProviderError';
  }
}

const bearer = (c) => ({ Authorization: `Bearer ${c.apiKey}` });

// Per ogni provider: richiesta per l'elenco modelli, come leggerlo, e richiesta di prova connessione
const SPECS = {
  anthropic: {
    list: (c) => ({ url: 'https://api.anthropic.com/v1/models?limit=1000', headers: { 'x-api-key': c.apiKey, 'anthropic-version': '2023-06-01' } }),
    parse: (body) => (body.data || []).map((m) => ({ id: m.id, name: m.display_name || m.id })),
  },
  openai: {
    list: (c) => ({ url: 'https://api.openai.com/v1/models', headers: bearer(c) }),
    parse: (body) => (body.data || []).map((m) => ({ id: m.id, name: m.id })),
  },
  google: {
    list: (c) => ({ url: 'https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000', headers: { 'x-goog-api-key': c.apiKey } }),
    parse: (body) => (body.models || [])
      .filter((m) => (m.supportedGenerationMethods || []).includes('generateContent'))
      .map((m) => ({ id: m.name.replace(/^models\//, ''), name: m.displayName || m.name })),
  },
  openrouter: {
    list: (c) => ({ url: 'https://openrouter.ai/api/v1/models', headers: bearer(c) }),
    parse: (body) => (body.data || []).map((m) => ({ id: m.id, name: m.name || m.id })),
    // L'elenco modelli di OpenRouter è pubblico: per verificare la chiave serve un endpoint autenticato
    test: (c) => ({ url: 'https://openrouter.ai/api/v1/key', headers: bearer(c) }),
  },
  azure: {
    test: (c) => ({
      url: `${String(c.endpoint || '').replace(/\/+$/, '')}/openai/models?api-version=${encodeURIComponent(c.apiVersion || '')}`,
      headers: { 'api-key': c.apiKey },
    }),
  },
};

// Estrae un messaggio leggibile dal corpo di una risposta d'errore
function errorDetail(body) {
  if (!body) return '';
  if (typeof body.error === 'string') return body.error;
  if (body.error && body.error.message) return body.error.message;
  return body.message || '';
}

function createAiClient({ fetch = globalThis.fetch, timeoutMs = 10000 } = {}) {
  async function call({ url, headers }) {
    let res;
    try {
      res = await fetch(url, { headers, signal: AbortSignal.timeout(timeoutMs) });
    } catch (err) {
      if (err.name === 'TimeoutError' || err.name === 'AbortError') {
        throw new AiProviderError(`Timeout: il provider non ha risposto entro ${timeoutMs / 1000} secondi.`);
      }
      throw new AiProviderError(`Provider non raggiungibile (${err.message}).`);
    }
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      const detail = errorDetail(body);
      throw new AiProviderError(`Errore dal provider (HTTP ${res.status})${detail ? `: ${detail}` : '.'}`);
    }
    return body || {};
  }

  const specFor = (type) => {
    const spec = SPECS[type];
    if (!spec) throw new AiProviderError('Provider non supportato.');
    return spec;
  };

  async function listModels(type, creds) {
    const spec = specFor(type);
    if (!spec.list) throw new AiProviderError('Per Azure i modelli si inseriscono a mano (nome del deployment).');
    const models = spec.parse(await call(spec.list(creds)));
    return models.sort((a, b) => a.id.localeCompare(b.id));
  }

  async function testConnection(type, creds) {
    const spec = specFor(type);
    await call((spec.test || spec.list)(creds));
  }

  return { listModels, testConnection };
}

module.exports = { PROVIDERS, findProvider, createAiClient, AiProviderError };
