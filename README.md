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

## 3. Login con Google (facoltativo)

Il login Google è **facoltativo**: finché `GOOGLE_CLIENT_ID` e `GOOGLE_CLIENT_SECRET` sono vuote, il pulsante "Accedi con Google" non compare e l'app funziona solo con email e password. Puoi saltare questa sezione e tornarci dopo.

### Come funziona (in breve)

1. L'utente clicca "Accedi con Google" → l'app lo manda su `/auth/google` → Google.
2. L'utente sceglie l'account e accetta di condividere **nome ed email** (scope `profile` ed `email`).
3. Google lo rimanda all'indirizzo di **callback** dell'app: `BASE_URL` + `/auth/google/callback`.
4. L'app riceve i dati e fa login (o crea l'utente).

Per questo Google deve sapere **in anticipo** quali indirizzi di callback sono ammessi: se l'indirizzo non è nella lista, Google rifiuta con `redirect_uri_mismatch`.

### 3.1 Creare il progetto Google Cloud

1. Vai su [console.cloud.google.com](https://console.cloud.google.com) e accedi con il tuo account Google.
2. In alto a sinistra, accanto al logo, clicca il **selettore progetti** → **New Project**.
3. Nome: es. `pella-app` → **Create**. Attendi qualche secondo e assicurati che il progetto sia **selezionato** nel selettore in alto (tutte le impostazioni seguenti valgono per il progetto selezionato).

Non serve abilitare API particolari: per il solo login bastano i passi seguenti.

### 3.2 Configurare la schermata di consenso

È la pagina che Google mostra all'utente ("*pella-app* vuole accedere al tuo account").

1. Menu ☰ → **APIs & Services → OAuth consent screen**. Nelle versioni più recenti della console si chiama **Google Auth Platform**: se vedi **Get started**, cliccalo.
2. **App information**: nome app (es. `Pella App`) e **User support email** (la tua email).
3. **Audience**: scegli **External** (così funziona con qualsiasi account Gmail; *Internal* è solo per organizzazioni Google Workspace).
4. **Contact information**: di nuovo la tua email.
5. Accetta le condizioni → **Create**.
6. Vai su **Audience** (o "Test users") → **Add users** → aggiungi la tua email e quella di chi deve provare l'app.

> **Modalità *Testing***: l'app nasce in modalità di test. Solo gli indirizzi in *Test users* (max 100) possono fare login; gli altri vedono "Accesso bloccato". Per un progetto didattico va benissimo così. Per aprirla a tutti si clicca **Publish app**: con i soli scope `profile` ed `email` di norma non serve la verifica di Google.

### 3.3 Creare le credenziali (Client ID e Secret)

1. Vai su **Clients** (o **APIs & Services → Credentials → Create credentials → OAuth client ID**).
2. **Application type**: **Web application**. Nome: es. `pella-web`.
3. **Authorized JavaScript origins** → **Add URI**:
   - `http://localhost:3000`
4. **Authorized redirect URIs** → **Add URI**:
   - `http://localhost:3000/auth/google/callback`
5. **Create**. Compare una finestra con **Client ID** e **Client secret**: copiali subito (il secret si può rivedere/rigenerare in seguito dalla pagina del client, ma conviene salvarlo ora).

Attenzione agli indirizzi:
- devono essere **identici**: `http` in locale, `https` su Render, **nessuno slash finale**;
- le *origins* sono solo protocollo + host (niente percorso), i *redirect URI* invece includono `/auth/google/callback`;
- le modifiche possono richiedere **alcuni minuti** prima di funzionare.

### 3.4 Configurare l'app in locale

Nel file `.env`:
```
GOOGLE_CLIENT_ID=123456789-xxxxxxxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-xxxxxxxxxxxx
BASE_URL=http://localhost:3000
```
Riavvia `npm run dev`, apri http://localhost:3000/login: deve comparire il pulsante Google. Prova il login con un account presente nei *Test users*.

### 3.5 Aggiungere l'indirizzo di Render

Quando l'app è pubblicata (sezione 5), **nello stesso client OAuth** (non serve crearne un altro) aggiungi:
- *Authorized JavaScript origins*: `https://<tuo-url>.onrender.com`
- *Authorized redirect URIs*: `https://<tuo-url>.onrender.com/auth/google/callback`

e su Render imposta `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` (gli stessi del locale) e `BASE_URL=https://<tuo-url>.onrender.com`.
Lo stesso client può avere più indirizzi: locale e Render convivono.

### Regole dell'app

- Se l'email Google coincide con un account già registrato **e** Google la dichiara verificata, l'account viene **collegato** (da quel momento puoi entrare in entrambi i modi).
- Altrimenti viene creato un nuovo utente (ruolo `user`, oppure `admin` se è il primo in assoluto).

## 4. GitHub

Crea un repository **privato** vuoto su GitHub (senza README), poi:
```
git remote add origin https://github.com/<utente>/<repo>.git
git push -u origin main
```

## 5. Render

1. [dashboard.render.com](https://dashboard.render.com) → **New → Web Service** → collega GitHub e scegli il repository.
2. **Name**: scegli bene, perché da qui nasce l'indirizzo `https://<name>.onrender.com` e **non cambia più**, anche se rinomini il servizio in seguito. Se il nome è già preso, Render aggiunge un suffisso casuale (es. `pella-l7ki.onrender.com`); non c'è un modo affidabile per verificarlo prima.
3. Impostazioni:
   - **Runtime**: Node
   - **Branch**: `main`
   - **Build Command**: `npm ci && npx prisma generate && npx prisma migrate deploy`
   - **Start Command**: `npm start`
   - **Instance type**: Free va bene (dopo 15 minuti di inattività il servizio si "addormenta": la prima richiesta impiega ~1 minuto)
4. **Environment** → aggiungi le variabili:
   - `DATABASE_URL`, `DIRECT_URL` → URL del **branch principale** di Neon (non `dev`!)
   - `SESSION_SECRET` → un valore nuovo, diverso da quello locale
   - `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` (facoltative, vedi sezione 3)
   - `NODE_ENV` = `production`
   - `BASE_URL` = `https://<nome-servizio>.onrender.com` (lo vedi in alto dopo la creazione; senza slash finale)
5. **Create Web Service**. Nei log di build devi vedere `prisma migrate deploy` applicare la migrazione `init`.
6. Se usi Google: aggiungi l'indirizzo di Render al client OAuth (sezione 3.5).
7. Apri l'URL di Render e **registrati per primo**: diventi l'admin di produzione.

### Aggiornamenti successivi

"New → Web Service" si usa **solo la prima volta**. Poi:

- **Codice**: `git add .` → `git commit -m "..."` → `git push`. Ogni push su `main` avvia da solo un nuovo deploy (build + migrazioni + avvio). Lo segui in **Events** / **Logs**.
- **Database**: modifica `prisma/schema.prisma`, lancia `npx prisma migrate dev --name <descrizione>` in locale, committa anche `prisma/migrations/` e fai push: `migrate deploy` la applica al branch principale durante il build.
- **Variabili d'ambiente**: pagina del servizio → menu a sinistra **Environment** → **Edit** / **Add Environment Variable** → salva con **Save and deploy** (l'app legge le variabili solo all'avvio, quindi serve un riavvio).
- **Rideploy senza modifiche**: **Manual Deploy → Deploy latest commit**.
- **Tornare indietro**: in **Events** scegli un deploy precedente → **Rollback**.

### Cambiare l'indirizzo

Rinominare il servizio (**Settings → Name**) cambia solo il nome in dashboard, **non** l'URL. Per un indirizzo diverso:
- **ricrea il servizio** con il nuovo nome, le stesse impostazioni e variabili (con il nuovo `BASE_URL`), poi cancella il vecchio (**Settings → Delete Web Service**). I dati restano su Neon; gli utenti dovranno solo rifare il login;
- oppure usa un **dominio tuo** da **Settings → Custom Domains** (gratuito anche sul piano Free; il dominio si compra a parte).

In entrambi i casi aggiorna `BASE_URL` e, se usi Google, gli indirizzi nel client OAuth.

---

## Problemi comuni

| Sintomo | Causa / soluzione |
|---|---|
| Google: `redirect_uri_mismatch` | il redirect URI in Google Cloud deve essere **identico** a `BASE_URL` + `/auth/google/callback` (http vs https, slash finale) |
| Google: "accesso bloccato / app non verificata" | in modalità *Testing* aggiungi l'account tra i *Test users* |
| Il pulsante Google non compare | `GOOGLE_CLIENT_ID` o `GOOGLE_CLIENT_SECRET` vuote, oppure app non riavviata dopo averle impostate |
| Google: `invalid_client` | Client ID o Secret copiati male (spazi, caratteri mancanti) o client cancellato |
| Google funziona in locale ma non su Render | mancano gli indirizzi `https://…onrender.com` nel client OAuth, oppure `BASE_URL` su Render è ancora `http://localhost:3000` |
| Su Render il login "non resta" e torni sempre a /login | manca `NODE_ENV=production` (serve per `trust proxy` e cookie sicuri) |
| Build Render fallisce su `migrate deploy` | `DIRECT_URL` mancante o sbagliata (deve essere l'URL **senza** `-pooler`) |
| `relation "session" does not exist` | le migrazioni non sono state applicate a quel branch: `npx prisma migrate dev` (locale) o controlla il build command (Render) |
| "Richiesta non valida o scaduta" | token CSRF scaduto (es. pagina aperta da molto o server riavviato con sessione persa): ricarica la pagina |
