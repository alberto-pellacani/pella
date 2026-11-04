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
};

class UserError extends Error {
  constructor(code, message) {
    super(message || MESSAGES[code] || code);
    this.name = 'UserError';
    this.code = code;
  }
}

module.exports = { UserError };
