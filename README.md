# Pella App — utenti, ruoli e login (Render + Neon)

App di esempio per imparare a pubblicare un'applicazione Node.js su **Render.com** con database **PostgreSQL su Neon**.

Funzionalità:
- registrazione e login con email + password, oppure con **Google**;
- due ruoli, `admin` e `user`: il **primo utente registrato diventa admin**;
- pagina profilo (modifica nome visualizzato);
- pagina admin: elenco utenti, cambio ruolo, disattivazione/riattivazione (deve restare sempre almeno un admin attivo).

Stack: Express 5 · EJS · Prisma 7 · Passport (local + Google) · sessioni salvate su Postgres.

---

## Come è organizzato

```
src/
  server.js              avvio: collega Neon e avvia il server
  app.js                 configurazione Express (sessioni, CSRF, rotte)
  config.js              legge le variabili d'ambiente
  services/userService.js  regole: registrazione, login, ruoli
  db/                    Prisma + repository utenti
  auth/passport.js       strategie di login (email/password e Google)
  routes/                pagine: login/registrazione, profilo, admin
views/                   pagine HTML (EJS)
prisma/                  schema del database e migrazioni
test/                    test automatici (non usano il database)
```

## Variabili d'ambiente

Tutta la configurazione arriva da variabili d'ambiente. In locale stanno nel file **`.env`** (escluso da Git: non va mai committato); su Render si inseriscono in **Environment**. Il modello è `.env.example`.

| Variabile | A cosa serve |
|---|---|
| `DATABASE_URL` | URL Neon **pooled** (host con `-pooler`): usato dall'app |
| `DIRECT_URL` | URL Neon **direct** (host senza `-pooler`): usato dalle migrazioni |
| `SESSION_SECRET` | stringa casuale lunga che firma i cookie di sessione |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | credenziali OAuth Google (se vuote, il pulsante Google non compare) |
| `BASE_URL` | indirizzo pubblico dell'app (in locale `http://localhost:3000`) |
| `NODE_ENV` | `production` su Render |

Per generare un `SESSION_SECRET`:
```
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## 1. Neon: due branch

Usiamo due branch del database, così le prove in locale non toccano i dati pubblicati:

- **branch principale** (`main`/`production`) → usato **solo da Render**;
- **branch `dev`** → usato **in locale**.

Creare il branch `dev`: console Neon → **Branches** → **Create branch** → nome `dev`, genitore il branch principale.
Gli URL si trovano con **Connect** (selezionando il branch): con *Connection pooling* attivo ottieni l'URL pooled, disattivato l'URL direct.

> Suggerimento: per togliere l'avviso SSL del driver `pg` puoi sostituire `sslmode=require` con `sslmode=verify-full` negli URL.

## 2. Avvio in locale

```
npm install
copy .env.example .env      # poi compila .env con gli URL del branch dev
npx prisma migrate dev      # crea/aggiorna le tabelle sul branch dev
npm run dev                 # avvia su http://localhost:3000 (si riavvia a ogni modifica)
```

Altri comandi utili:
- `npm test` — test automatici;
- `npm run db:check` — verifica la connessione al database;
- `npx prisma studio` — interfaccia web per vedere/modificare i dati;
- `npx prisma migrate dev --name <descrizione>` — dopo aver modificato `prisma/schema.prisma`, crea una nuova migrazione.

## 3. Login con Google

1. Vai su [console.cloud.google.com](https://console.cloud.google.com) e crea un progetto (es. "pella-app").
2. **APIs & Services → OAuth consent screen** (o "Google Auth Platform"): tipo **External**, inserisci nome app ed email; in **Audience/Test users** aggiungi la tua email (finché l'app è in modalità *Testing* solo gli utenti di test possono accedere).
3. **Credentials → Create credentials → OAuth client ID** → tipo **Web application**:
   - *Authorized JavaScript origins*: `http://localhost:3000`
   - *Authorized redirect URIs*: `http://localhost:3000/auth/google/callback`
4. Copia **Client ID** e **Client secret** in `.env` (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`) e riavvia `npm run dev`.

Regole: se l'email Google coincide con un account già registrato (e Google la dichiara verificata) l'account viene **collegato**; altrimenti ne viene creato uno nuovo.

## 4. GitHub

Crea un repository **privato** vuoto su GitHub (senza README), poi:
```
git remote add origin https://github.com/<utente>/<repo>.git
git push -u origin main
```

## 5. Render

1. [dashboard.render.com](https://dashboard.render.com) → **New → Web Service** → collega GitHub e scegli il repository.
2. Impostazioni:
   - **Runtime**: Node
   - **Branch**: `main`
   - **Build Command**: `npm ci && npx prisma generate && npx prisma migrate deploy`
   - **Start Command**: `npm start`
   - **Instance type**: Free va bene (dopo 15 minuti di inattività il servizio si "addormenta": la prima richiesta impiega ~1 minuto)
3. **Environment** → aggiungi le variabili:
   - `DATABASE_URL`, `DIRECT_URL` → URL del **branch principale** di Neon (non `dev`!)
   - `SESSION_SECRET` → un valore nuovo, diverso da quello locale
   - `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
   - `NODE_ENV` = `production`
   - `BASE_URL` = `https://<nome-servizio>.onrender.com` (lo vedi in alto dopo la creazione; aggiornalo se cambia)
4. **Create Web Service**. Nei log di build devi vedere `prisma migrate deploy` applicare la migrazione `init`.
5. Su Google Cloud, nello stesso OAuth client aggiungi:
   - origin `https://<nome-servizio>.onrender.com`
   - redirect URI `https://<nome-servizio>.onrender.com/auth/google/callback`
6. Apri l'URL di Render e **registrati per primo**: diventi l'admin di produzione.

Da qui in poi ogni `git push` su `main` avvia automaticamente un nuovo deploy (e applica eventuali nuove migrazioni).

---

## Problemi comuni

| Sintomo | Causa / soluzione |
|---|---|
| Google: `redirect_uri_mismatch` | il redirect URI in Google Cloud deve essere **identico** a `BASE_URL` + `/auth/google/callback` (http vs https, slash finale) |
| Google: "accesso bloccato / app non verificata" | in modalità *Testing* aggiungi l'account tra i *Test users* |
| Su Render il login "non resta" e torni sempre a /login | manca `NODE_ENV=production` (serve per `trust proxy` e cookie sicuri) |
| Build Render fallisce su `migrate deploy` | `DIRECT_URL` mancante o sbagliata (deve essere l'URL **senza** `-pooler`) |
| `relation "session" does not exist` | le migrazioni non sono state applicate a quel branch: `npx prisma migrate dev` (locale) o controlla il build command (Render) |
| "Richiesta non valida o scaduta" | token CSRF scaduto (es. pagina aperta da molto o server riavviato con sessione persa): ricarica la pagina |
