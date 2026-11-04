# App utenti e ruoli (Render + Neon) — Piano di implementazione

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** App Express con registrazione/login (email+password e Google), ruoli admin/user e pagina admin, pubblicata su Render con database Neon.

**Architecture:** Un solo servizio Express con pagine EJS. La logica di dominio (`UserService`) dipende da un "repository" iniettato: in produzione è Prisma su Neon, nei test un repository in memoria. In questo modo i test non richiedono un database. `createApp({ userService, sessionStore, config })` costruisce l'app, mentre `server.js` collega Prisma e lo store di sessione su Postgres.

**Tech Stack:** Node.js (CommonJS), Express 5, EJS, Prisma + PostgreSQL (Neon), passport, passport-local, passport-google-oauth20, bcrypt, express-session, connect-pg-simple, csrf-sync, helmet, dotenv. Test: `node:test` + supertest.

**Spec:** `docs/superpowers/specs/2026-11-04-app-utenti-ruoli-design.md`

## Global Constraints

- Nessun segreto nel codice o in Git: `.env` va in `.gitignore`, mentre `.env.example` viene committato.
- Variabili d'ambiente: `DATABASE_URL` (pooled), `DIRECT_URL` (direct, usata per le migrazioni), `SESSION_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `BASE_URL`, `NODE_ENV`, `PORT`.
- Le password sono cifrate con bcrypt (cost 12).
- Sessioni su Postgres (tabella `session`, modellata in Prisma affinché `migrate dev` non segnali drift). In produzione: `app.set('trust proxy', 1)` e cookie `secure`, `httpOnly`, `sameSite: 'lax'`.
- `package.json` → `"engines": { "node": "22.x" }`.
- Branch Neon: `.env` locale punta al branch `dev`, Render al branch principale. Migrazioni: in locale `prisma migrate dev`, su Render `prisma migrate deploy` in fase di build.
- Ruoli: enum `admin` | `user`. Il primo utente registrato (con qualsiasi metodo) diventa `admin`.
- Deve sempre restare almeno un admin attivo.
- I testi dell'interfaccia sono in italiano.

## Review Focus

1. **Email con maiuscole o spazi** (`" Mario@X.it "` e `mario@x.it`): devono risultare lo stesso utente. Si normalizza con trim e lowercase ovunque (test in Task 1).
2. **Utente disattivato con una sessione già aperta**: alla richiesta successiva viene disconnesso e rimandato al login (test in Task 4).
3. **POST senza token CSRF**: risponde 403 (test in Task 4).
4. **Cookie secure dietro il proxy di Render**: senza `trust proxy` il login "non resta" e ripropone sempre la pagina di login. Va verificato a mano dopo il deploy (Task 6).
5. **Account Google senza email o con email non verificata**: il login viene rifiutato con un messaggio chiaro, senza crash (test in Task 2).

---

### Task 1: Setup progetto + UserService (registrazione e login locale)

**Files:**
- Create: `package.json`, `.gitignore`, `.env.example`, `src/services/userService.js`, `src/services/errors.js`, `test/fakeUserRepo.js`, `test/userService.test.js`

**Interfaces:**
- Produces:
  - `class UserError extends Error { code: string }`. I codici sono: `EMAIL_TAKEN`, `EMAIL_GOOGLE_ONLY`, `INVALID_INPUT`, `INVALID_CREDENTIALS`, `INACTIVE`, `GOOGLE_EMAIL_UNVERIFIED`, `LAST_ADMIN`, `NOT_FOUND`.
  - Il repository (contratto implementato da `fakeUserRepo` e da `prismaUserRepo`) è asincrono: `count()`, `countActiveAdmins()`, `findById(id)`, `findByEmail(email)`, `findByGoogleId(googleId)`, `create(data)`, `update(id, data)`, `list()`.
  - Forma dell'oggetto utente: `{ id, email, passwordHash|null, googleId|null, displayName, role: 'admin'|'user', active: boolean, createdAt }`.
  - `createUserService(repo)` restituisce `{ registerLocal({email, password, displayName}), authenticateLocal(email, password), ... }`. Gli altri metodi vengono aggiunti nel Task 2.

- [ ] **Step 1:** esegui `git init` e `npm init -y`. Imposta lo script `"test": "node --test"`, imposta `engines` e installa le dipendenze dello stack più `supertest` come devDependency. In `.gitignore` metti `node_modules`, `.env`, `generated`. Crea `.env.example` con tutte le variabili, senza valori.
- [ ] **Step 2: Scrivi i test che falliscono** in `test/userService.test.js` (usando `test/fakeUserRepo.js`, un repository in memoria con id incrementali):
  - `registerLocal: il primo utente è admin, il secondo è user`
  - `registerLocal: normalizza l'email` (registrando `" Mario@X.it "` si salva `mario@x.it`)
  - `registerLocal: password < 8 caratteri → UserError INVALID_INPUT`
  - `registerLocal: email già registrata con password → EMAIL_TAKEN`
  - `registerLocal: email di un account solo-Google → EMAIL_GOOGLE_ONLY`
  - `registerLocal: salva passwordHash diverso dalla password`
  - `authenticateLocal: credenziali giuste → utente; password errata o email sconosciuta → INVALID_CREDENTIALS`
  - `authenticateLocal: email con maiuscole funziona`
  - `authenticateLocal: utente disattivato → INACTIVE`
- [ ] **Step 3:** esegui `npm test`. Atteso: FAIL perché il modulo non esiste.
- [ ] **Step 4:** implementa `src/services/errors.js` e `src/services/userService.js`. `displayName` è facoltativo: se manca si usa la parte dell'email prima di `@`. Il ruolo è `admin` se `await repo.count() === 0`.
- [ ] **Step 5:** esegui `npm test`. Atteso: PASS.
- [ ] **Step 6:** commit con `feat: setup progetto e registrazione/login locale`.

### Task 2: UserService (Google, profilo, regole admin)

**Files:**
- Modify: `src/services/userService.js`, `test/userService.test.js`

**Interfaces:**
- Produces, aggiunti a `createUserService(repo)`:
  - `loginWithGoogle({ googleId, email, emailVerified, displayName })` → utente
  - `getActiveUser(id)` → utente, oppure `null` se l'utente non esiste o è disattivato
  - `updateProfile(id, { displayName })` → utente
  - `listUsers()` → utenti ordinati per `createdAt`
  - `setRole(targetId, role)` → utente
  - `setActive(targetId, active)` → utente

- [ ] **Step 1: Scrivi i test che falliscono:**
  - `loginWithGoogle: googleId già noto → stesso utente`
  - `loginWithGoogle: email nuova e verificata → crea utente (admin se primo)`
  - `loginWithGoogle: email esistente e verificata → collega googleId all'utente esistente`
  - `loginWithGoogle: email non verificata o mancante → GOOGLE_EMAIL_UNVERIFIED`
  - `loginWithGoogle: utente disattivato → INACTIVE`
  - `updateProfile: displayName vuoto → INVALID_INPUT; valido → aggiornato (trim)`
  - `setRole: declassare l'unico admin attivo → LAST_ADMIN; con 2 admin → ok`
  - `setActive: disattivare l'unico admin attivo → LAST_ADMIN`
  - `setRole: ruolo non valido → INVALID_INPUT; id inesistente → NOT_FOUND`
  - `getActiveUser: utente disattivato → null`
- [ ] **Step 2:** esegui `npm test`. Atteso: FAIL.
- [ ] **Step 3:** implementa i metodi. Le regole `LAST_ADMIN` valgono quando il target è un admin attivo, `countActiveAdmins() === 1` e l'operazione lo declasserebbe o lo disattiverebbe.
- [ ] **Step 4:** esegui `npm test`. Atteso: PASS.
- [ ] **Step 5:** commit con `feat: login Google e regole ruoli`.

### Task 3: Database Neon con Prisma

**Files:**
- Create: `prisma/schema.prisma`, `prisma/migrations/*` (generati), `src/db/prisma.js`, `src/db/prismaUserRepo.js`

**Interfaces:**
- Consumes: il contratto del repository definito nel Task 1.
- Produces: `prisma` (client singleton) e `createPrismaUserRepo(prisma)`, che implementa quel contratto.

- [ ] **Step 1 (passo dell'utente, guidato):** su Neon crea il branch `dev` dal branch principale. Copia gli URL pooled e direct del branch `dev` in `.env`, alle voci `DATABASE_URL` e `DIRECT_URL`.
- [ ] **Step 2:** scrivi lo schema: `datasource` con `url = env("DATABASE_URL")` e `directUrl = env("DIRECT_URL")`, enum `Role { admin user }` e i due modelli seguenti:
  - `User`: `id Int @id @default(autoincrement())`, `email String @unique`, `passwordHash String?`, `googleId String? @unique`, `displayName String`, `role Role @default(user)`, `active Boolean @default(true)`, `createdAt DateTime @default(now())`
  - `Session` mappato su `"session"`: `sid String @id @db.VarChar`, `sess Json`, `expire DateTime @db.Timestamp(6)`, `@@index([expire])`. È lo schema richiesto da connect-pg-simple.
- [ ] **Step 3:** esegui `npx prisma migrate dev --name init`. Atteso: migrazione creata e applicata al branch `dev`, con le tabelle `User` e `session` visibili nella console di Neon.
- [ ] **Step 4:** implementa `prismaUserRepo.js`, con una funzione per ciascun metodo del contratto.
- [ ] **Step 5:** fai una verifica rapida eseguendo `node --env-file=.env scripts/check-db.js`, uno script che crea il repository, chiama `count()` e stampa il numero. Atteso: `0`.
- [ ] **Step 6:** commit con `feat: schema Prisma e repository Neon`.

### Task 4: App Express (sessioni, login, profilo, admin)

**Files:**
- Create: `src/config.js`, `src/app.js`, `src/server.js`, `src/auth/passport.js`, `src/middleware/auth.js`, `src/routes/auth.js`, `src/routes/profile.js`, `src/routes/admin.js`, `views/layout` (partials `header.ejs` e `footer.ejs`), `views/login.ejs`, `views/register.ejs`, `views/profile.ejs`, `views/admin.ejs`, `views/error.ejs`, `public/style.css`, `test/app.test.js`

**Interfaces:**
- Consumes: `createUserService`, `createPrismaUserRepo`, `prisma`.
- Produces:
  - `createApp({ userService, sessionStore, config })` → app Express. Nei test si usa `MemoryStore` con `config.googleEnabled = false`.
  - `loadConfig(env)` → `{ isProd, port, baseUrl, sessionSecret, googleEnabled, googleClientId, googleClientSecret }`. Lancia un errore se in produzione manca `SESSION_SECRET`.
  - Rotte: `GET /` (reindirizza a `/profile` o a `/login`), `GET|POST /register`, `GET|POST /login`, `POST /logout`, `GET /auth/google`, `GET /auth/google/callback`, `GET|POST /profile`, `GET /admin`, `POST /admin/users/:id/role`, `POST /admin/users/:id/active`.
  - Passport: `deserializeUser` usa `userService.getActiveUser(id)`. Se restituisce `null`, la sessione diventa anonima.

- [ ] **Step 1: Scrivi i test che falliscono** in `test/app.test.js`, usando supertest con un agent che conserva i cookie e leggendo il token CSRF dall'input hidden `_csrf` dei form:
  - `GET /profile da anonimo → redirect /login`
  - `registrazione → redirect /profile e la pagina mostra l'email`
  - `POST /login senza _csrf → 403`
  - `login con password errata → resta su /login con messaggio "Credenziali non valide"`
  - `user normale: GET /admin → 403`
  - `admin: GET /admin elenca gli utenti; POST role cambia il ruolo`
  - `admin che si declassa da unico admin → messaggio di errore, ruolo invariato`
  - `utente disattivato dall'admin con sessione aperta → alla richiesta successiva redirect /login`
  - `POST /logout → GET /profile redirect /login`
  - `con googleEnabled=false il pulsante Google non compare`
- [ ] **Step 2:** esegui `npm test`. Atteso: FAIL.
- [ ] **Step 3:** implementa i file. I messaggi per l'utente si passano con un "flash" semplice salvato in sessione, senza librerie aggiuntive. La strategia Google si registra solo se `googleEnabled`, con callback `${baseUrl}/auth/google/callback` e `emailVerified` letto da `profile._json.email_verified`. In `server.js` si usano `connect-pg-simple` con `conString: DATABASE_URL`, `tableName: 'session'` e `createTableIfMissing: false`, e lo script npm `"start": "node src/server.js"`, `"dev": "node --watch --env-file=.env src/server.js"` (`server.js` carica dotenv solo fuori produzione).
- [ ] **Step 4:** esegui `npm test`. Atteso: PASS.
- [ ] **Step 5:** verifica manuale. Esegui `npm run dev`, apri `http://localhost:3000`, registrati (diventi admin), apri `/admin`, fai logout e login. Il riavvio del server non deve far perdere la sessione.
- [ ] **Step 6:** commit con `feat: app Express con login, profilo e admin`.

### Task 5: Login con Google in locale

**Files:**
- Modify: `.env` (non committato), `README.md` (sezione Google)

- [ ] **Step 1 (passo dell'utente, guidato):** in Google Cloud Console crea il progetto, configura la schermata di consenso OAuth (tipo External, in modalità test con la tua email tra gli utenti di test) e crea le credenziali "OAuth client ID" di tipo Web application. Origine autorizzata: `http://localhost:3000`. Redirect URI: `http://localhost:3000/auth/google/callback`.
- [ ] **Step 2:** inserisci in `.env` `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` e `BASE_URL=http://localhost:3000`.
- [ ] **Step 3:** verifica manuale. Il pulsante "Accedi con Google" compare e il login funziona. Se usi la stessa email dell'account locale, l'account viene collegato e su `/admin` non compaiono doppioni.
- [ ] **Step 4:** commit con `docs: guida configurazione Google`.

### Task 6: Pubblicazione su Render + guida completa

**Files:**
- Create/Modify: `README.md`, `render.yaml` (facoltativo, come riferimento)

- [ ] **Step 1:** scrivi il README in italiano: prerequisiti, branch Neon (`dev` per il locale, principale per Render, con la differenza tra URL pooled e direct), setup locale (`npm install`, `.env`, `npx prisma migrate dev`, `npm run dev`), Google, GitHub, Render, risoluzione dei problemi comuni (redirect_uri_mismatch, login che non resta, migrazioni).
- [ ] **Step 2 (passo dell'utente, guidato):** crea un repository GitHub privato ed esegui `git remote add origin …` e `git push -u origin main`.
- [ ] **Step 3 (passo dell'utente, guidato):** su Render crea un nuovo Web Service collegato al repository, con questa configurazione:
  - Runtime Node.
  - Build command: `npm ci && npx prisma generate && npx prisma migrate deploy`.
  - Start command: `npm start`.
  - Variabili d'ambiente:
    - `DATABASE_URL` e `DIRECT_URL` del branch **principale** di Neon
    - `SESSION_SECRET` (valore casuale lungo)
    - `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
    - `NODE_ENV=production`
    - `BASE_URL=https://<nome>.onrender.com`
- [ ] **Step 4 (passo dell'utente):** in Google Cloud aggiungi l'origine `https://<nome>.onrender.com` e il redirect `https://<nome>.onrender.com/auth/google/callback`.
- [ ] **Step 5:** verifica sull'URL di Render. Registrati come primo utente (diventi admin di produzione), poi verifica che il login resti attivo tra una pagina e l'altra (Review Focus 4), il login con Google, la pagina `/admin` e il logout. Controlla nei log di Render che `migrate deploy` sia andato a buon fine.
- [ ] **Step 6:** commit e push con `docs: guida pubblicazione Render`. Verifica che il push attivi un nuovo deploy automatico.
