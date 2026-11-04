const bcrypt = require('bcryptjs');
const { UserError } = require('./errors');

const BCRYPT_COST = 12;
const MIN_PASSWORD = 8;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const normalizeEmail = (email) => String(email || '').trim().toLowerCase();

// Toglie i campi sensibili prima di restituire l'utente al resto dell'app
const publicUser = (u) => {
  if (!u) return null;
  const { passwordHash, ...rest } = u;
  return { ...rest, hasPassword: Boolean(passwordHash) };
};

function createUserService(repo) {
  const firstUserRole = async () => ((await repo.count()) === 0 ? 'admin' : 'user');

  async function registerLocal({ email, password, displayName }) {
    const normEmail = normalizeEmail(email);
    if (!EMAIL_RE.test(normEmail)) throw new UserError('INVALID_INPUT', 'Email non valida.');
    if (typeof password !== 'string' || password.length < MIN_PASSWORD) {
      throw new UserError('INVALID_INPUT', `La password deve avere almeno ${MIN_PASSWORD} caratteri.`);
    }
    const existing = await repo.findByEmail(normEmail);
    if (existing) throw new UserError(existing.passwordHash ? 'EMAIL_TAKEN' : 'EMAIL_GOOGLE_ONLY');

    const name = String(displayName || '').trim() || normEmail.split('@')[0];
    const passwordHash = await bcrypt.hash(password, BCRYPT_COST);
    const user = await repo.create({ email: normEmail, passwordHash, displayName: name, role: await firstUserRole() });
    return publicUser(user);
  }

  async function authenticateLocal(email, password) {
    const user = await repo.findByEmail(normalizeEmail(email));
    if (!user || !user.passwordHash || !(await bcrypt.compare(String(password || ''), user.passwordHash))) {
      throw new UserError('INVALID_CREDENTIALS');
    }
    if (!user.active) throw new UserError('INACTIVE');
    return publicUser(user);
  }

  return { registerLocal, authenticateLocal };
}

module.exports = { createUserService, normalizeEmail };
