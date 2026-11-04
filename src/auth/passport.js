const { Passport } = require('passport');
const { Strategy: LocalStrategy } = require('passport-local');
const { Strategy: GoogleStrategy } = require('passport-google-oauth20');
const { UserError } = require('../services/errors');

// Gli errori di dominio diventano "login fallito con messaggio"; gli altri restano errori veri
const toDone = (done) => (err) => (err instanceof UserError ? done(null, false, { message: err.message }) : done(err));

function createPassport(userService, config) {
  const passport = new Passport();

  passport.use(new LocalStrategy({ usernameField: 'email' }, (email, password, done) => {
    userService.authenticateLocal(email, password).then((u) => done(null, u), toDone(done));
  }));

  if (config.googleEnabled) {
    passport.use(new GoogleStrategy({
      clientID: config.googleClientId,
      clientSecret: config.googleClientSecret,
      callbackURL: `${config.baseUrl}/auth/google/callback`,
    }, (accessToken, refreshToken, profile, done) => {
      userService.loginWithGoogle({
        googleId: profile.id,
        email: profile.emails && profile.emails[0] && profile.emails[0].value,
        emailVerified: Boolean(profile._json && profile._json.email_verified === true),
        displayName: profile.displayName,
      }).then((u) => done(null, u), toDone(done));
    }));
  }

  // In sessione salviamo solo l'id; a ogni richiesta ricarichiamo l'utente dal database,
  // così disattivazioni e cambi di ruolo hanno effetto immediato.
  passport.serializeUser((user, done) => done(null, user.id));
  passport.deserializeUser((id, done) => {
    userService.getActiveUser(id).then((u) => done(null, u || false), done);
  });

  return passport;
}

module.exports = { createPassport };
