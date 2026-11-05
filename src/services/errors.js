// Errore "di dominio": ha un codice e un messaggio in italiano mostrabile all'utente
const MESSAGES = {
  EMAIL_TAKEN: 'Esiste già un account con questa email.',
  EMAIL_GOOGLE_ONLY: 'Questa email è collegata a un account Google: usa "Accedi con Google".',
  INVALID_INPUT: 'Dati non validi.',
  INVALID_CREDENTIALS: 'Credenziali non valide.',
  INACTIVE: 'Account disattivato. Contatta un amministratore.',
  GOOGLE_EMAIL_UNVERIFIED: "L'email del tuo account Google non risulta verificata.",
  LAST_ADMIN: 'Operazione non consentita: deve restare almeno un amministratore attivo.',
  NOT_FOUND: 'Utente non trovato.',
  AI_KEY_MISSING: "Configurazione mancante: imposta AI_ENCRYPTION_KEY nelle variabili d'ambiente.",
  PROVIDER_NOT_FOUND: 'Provider non trovato.',
  PROVIDER_NOT_CONFIGURED: 'Configura prima la chiave API.',
  KEY_UNREADABLE: 'La chiave salvata non è più leggibile: reinseriscila.',
  MODEL_NOT_FOUND: 'Modello non trovato.',
  PROVIDER_ERROR: 'Errore dal provider.',
};

class UserError extends Error {
  constructor(code, message) {
    super(message || MESSAGES[code] || code);
    this.name = 'UserError';
    this.code = code;
  }
}

module.exports = { UserError };
