const { KEY_RE } = require('./services/secretBox');

// Chiave usata SOLO in sviluppo/test quando AI_ENCRYPTION_KEY non è impostata
const DEV_AI_KEY = '0123456789abcdef'.repeat(4);

// Legge la configurazione dalle variabili d'ambiente (mai valori segreti nel codice)
function loadConfig(env = process.env) {
  const isProd = env.NODE_ENV === 'production';
  const sessionSecret = env.SESSION_SECRET || (isProd ? null : 'dev-secret-non-usare-in-produzione');
  if (!sessionSecret) throw new Error("SESSION_SECRET mancante: impostala nelle variabili d'ambiente");

  // Chiave per cifrare le chiavi API dei provider AI: se manca in produzione la funzione resta disattivata
  if (env.AI_ENCRYPTION_KEY && !KEY_RE.test(env.AI_ENCRYPTION_KEY)) {
    throw new Error('AI_ENCRYPTION_KEY non valida: servono 64 caratteri esadecimali');
  }
  const aiEncryptionKey = env.AI_ENCRYPTION_KEY || (isProd ? null : DEV_AI_KEY);

  const baseUrl = (env.BASE_URL || `http://localhost:${env.PORT || 3000}`).replace(/\/$/, '');
  return {
    isProd,
    port: Number(env.PORT) || 3000,
    baseUrl,
    sessionSecret,
    aiEncryptionKey,
    googleEnabled: Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET),
    googleClientId: env.GOOGLE_CLIENT_ID,
    googleClientSecret: env.GOOGLE_CLIENT_SECRET,
  };
}

module.exports = { loadConfig, DEV_AI_KEY };
