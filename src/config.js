// Legge la configurazione dalle variabili d'ambiente (mai valori segreti nel codice)
function loadConfig(env = process.env) {
  const isProd = env.NODE_ENV === 'production';
  const sessionSecret = env.SESSION_SECRET || (isProd ? null : 'dev-secret-non-usare-in-produzione');
  if (!sessionSecret) throw new Error("SESSION_SECRET mancante: impostala nelle variabili d'ambiente");

  const baseUrl = (env.BASE_URL || `http://localhost:${env.PORT || 3000}`).replace(/\/$/, '');
  return {
    isProd,
    port: Number(env.PORT) || 3000,
    baseUrl,
    sessionSecret,
    googleEnabled: Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET),
    googleClientId: env.GOOGLE_CLIENT_ID,
    googleClientSecret: env.GOOGLE_CLIENT_SECRET,
  };
}

module.exports = { loadConfig };
