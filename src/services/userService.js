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

  async function loginWithGoogle({ googleId, email, emailVerified, displayName }) {
    const byGoogle = await repo.findByGoogleId(googleId);
    if (byGoogle) {
      if (!byGoogle.active) throw new UserError('INACTIVE');
      return publicUser(byGoogle);
    }

    const normEmail = normalizeEmail(email);
    if (!normEmail || emailVerified !== true) throw new UserError('GOOGLE_EMAIL_UNVERIFIED');

    const byEmail = await repo.findByEmail(normEmail);
    if (byEmail) {
      if (!byEmail.active) throw new UserError('INACTIVE');
      // La password di questo account non è mai stata verificata (chiunque poteva registrare
      // questa email): collegando Google la rimuoviamo, così resta solo il proprietario reale.
      return publicUser(await repo.update(byEmail.id, { googleId, passwordHash: null }));
    }

    const name = String(displayName || '').trim() || normEmail.split('@')[0];
    return publicUser(await repo.create({ email: normEmail, googleId, displayName: name, role: await firstUserRole() }));
  }

  async function getActiveUser(id) {
    const user = await repo.findById(id);
    return user && user.active ? publicUser(user) : null;
  }

  async function updateProfile(id, { displayName }) {
    const name = String(displayName || '').trim();
    if (!name || name.length > 100) throw new UserError('INVALID_INPUT', 'Il nome deve avere tra 1 e 100 caratteri.');
    return publicUser(await repo.update(id, { displayName: name }));
  }

  async function listUsers() {
    return (await repo.list()).map(publicUser);
  }

  // Rifiuta l'operazione se toglierebbe l'ultimo admin attivo
  async function loadTargetGuardingLastAdmin(targetId, wouldRemoveAdmin) {
    const target = await repo.findById(targetId);
    if (!target) throw new UserError('NOT_FOUND');
    if (wouldRemoveAdmin && target.role === 'admin' && target.active && (await repo.countActiveAdmins()) <= 1) {
      throw new UserError('LAST_ADMIN');
    }
    return target;
  }

  async function setRole(targetId, role) {
    if (role !== 'admin' && role !== 'user') throw new UserError('INVALID_INPUT', 'Ruolo non valido.');
    await loadTargetGuardingLastAdmin(targetId, role === 'user');
    return publicUser(await repo.update(targetId, { role }));
  }

  async function setActive(targetId, active) {
    await loadTargetGuardingLastAdmin(targetId, active === false);
    return publicUser(await repo.update(targetId, { active: Boolean(active) }));
  }

  return { registerLocal, authenticateLocal, loginWithGoogle, getActiveUser, updateProfile, listUsers, setRole, setActive };
}

module.exports = { createUserService, normalizeEmail };
