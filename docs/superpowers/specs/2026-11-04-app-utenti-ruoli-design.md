# App di esempio: utenti, ruoli e login — Render + Neon

Data: 2026-11-04

## Intento

App di prova il cui scopo principale è **imparare il flusso di sviluppo e pubblicazione** su Render.com con un database PostgreSQL su Neon. La funzionalità è volutamente minima: gestione utenti e ruoli, con login sia tramite email/password sia tramite Google (single sign-on). Il valore sta nel capire il percorso completo: sviluppo in locale → GitHub → Render → Neon, con configurazione tramite variabili d'ambiente.

L'utente sviluppatore conosce/preferisce Node.js. Il database Neon è già creato e la connessione via URL è già stata testata.

## Obiettivi

- Registrazione con email + password; login con email + password.
- Login con Google (OAuth 2.0 / OpenID Connect).
- Un account con la stessa email usata con Google viene collegato a quello esistente (nessun doppione).
- Due ruoli: `admin` e `user`. Il **primo utente registrato** diventa `admin`; gli altri sono `user`.
- Utente normale: vede e modifica il proprio profilo (nome visualizzato), logout.
- Admin: pagina con l'elenco utenti; può cambiare ruolo e attivare/disattivare un utente. Un utente disattivato non può fare login.
- Un admin non può togliersi il ruolo da solo né disattivarsi (per non restare senza admin).
- App funzionante in locale contro Neon e pubblicata su Render.
- Un README in italiano con la guida passo-passo: Neon, Google Cloud Console, GitHub, Render.

## Non obiettivi

- Reset password via email, verifica email, 2FA.
- Altri provider SSO oltre a Google.
- Frontend separato (SPA/React), API pubblica.
- Ruoli/permessi configurabili o granulari oltre admin/user.
- Test automatici estesi (bastano alcuni test essenziali sulla logica di autenticazione/ruoli).

## Anti-obiettivi (sarebbe un fallimento anche se funziona)

- Segreti (URL database, client secret Google, session secret) scritti nel codice o committati su Git.
- Password salvate in chiaro o con hash debole.
- Login che si perde a ogni riavvio/deploy di Render.
- Un'architettura così complessa da oscurare lo scopo didattico: il codice deve essere piccolo e leggibile.

## Vincoli

- Hosting: Render.com, Web Service (piano free va bene; tenerne conto: lo spin-down a freddo è accettabile).
- Database: Neon PostgreSQL (già esistente). Neon fornisce un URL "pooled" e uno "direct"; le migrazioni vanno eseguite sul direct.
- Node.js (in locale è installato Node 26; su Render fissare una versione LTS supportata tramite `engines` in `package.json`).
- Sviluppo su Windows.
- Codice ospitato su GitHub (Render fa deploy dal repository).

## Decisioni sul "come" (scelte di Claude, approvate dall'utente nel complesso)

- **Express** con pagine renderizzate dal server (**EJS**), un unico servizio.
- **Prisma** come ORM e per le migrazioni (`DATABASE_URL` pooled per l'app, `DIRECT_URL` per le migrazioni).
- **Passport**: strategia `passport-local` + `passport-google-oauth20`.
- Hash password con **bcrypt**.
- Sessioni con `express-session` salvate su Postgres (**connect-pg-simple**), cookie `secure` in produzione, `trust proxy` attivo su Render.
- Protezione CSRF sui form e header di sicurezza di base (helmet).
- Configurazione solo tramite variabili d'ambiente (`.env` in locale, escluso da Git; `.env.example` committato): `DATABASE_URL`, `DIRECT_URL`, `SESSION_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `BASE_URL`.
- Su Render: build `npm install && npx prisma migrate deploy && npx prisma generate` (o equivalente), start `npm start`.

## Regole di dettaglio (scelte di Claude dopo la revisione)

- **Login Google senza account esistente**: crea automaticamente un nuovo utente (ruolo `user`, oppure `admin` se è il primo in assoluto).
- **Collegamento Google ↔ account esistente**: avviene in automatico solo se Google dichiara l'email verificata (`email_verified`); altrimenti il login viene rifiutato con un messaggio chiaro.
- **Registrazione con email già usata da un account solo-Google**: rifiutata con il messaggio "usa Accedi con Google". Non si può impostare una password su un account altrui senza verifica.
- **Disattivazione e cambio ruolo hanno effetto immediato**: l'utente viene riletto dal database a ogni richiesta (deserialize di Passport). Se è disattivato, la sessione viene chiusa.
- **Ci deve essere sempre almeno un admin attivo**: qualsiasi declassamento o disattivazione che lascerebbe zero admin attivi viene rifiutato (questo include anche il caso di un admin che agisce su se stesso). Un admin può declassare o disattivare altri admin, purché ne resti almeno uno.

## Ambienti database (deciso dall'utente)

- **Due branch Neon separati**: il branch principale (`main`/`production`) è usato solo da Render; un branch `dev` creato dal principale è usato in locale.
- In locale: `.env` punta al branch `dev`; le migrazioni si creano con `prisma migrate dev`.
- Su Render: le variabili puntano al branch principale; le migrazioni si applicano solo con `prisma migrate deploy` in fase di build.
- La regola "primo utente = admin" vale per ciascun database: il primo admin di produzione si crea registrandosi sull'app pubblicata.
- Il README spiega come creare il branch `dev` su Neon e quali URL (pooled/direct) usare in ciascun ambiente.

## Lasciato al builder

- Struttura delle cartelle, nomi dei file, stile della UI (semplice e pulito, un CSS leggero va bene).
- Schema esatto delle tabelle, purché supporti: email unica, password hash opzionale (utenti solo-Google), google id opzionale, ruolo, stato attivo, date di creazione.
- Scelta della libreria CSRF e dettagli dei messaggi di errore.
- Se usare `render.yaml` (Blueprint) oltre alla configurazione manuale: facoltativo, la guida deve comunque spiegare la configurazione manuale dalla dashboard.
