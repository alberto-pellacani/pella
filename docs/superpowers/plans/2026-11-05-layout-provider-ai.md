# Layout responsive e Provider AI — Piano di implementazione

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Nuovo layout bianco e nero, responsive (barra laterale su PC, barra fissa in basso e menu a schermo intero su mobile), più una sezione admin per configurare 5 provider AI e i loro modelli, con le chiavi API cifrate nel database.

**Architecture:** Si segue lo schema esistente: servizio di dominio (`aiService`) con dipendenze iniettate. Il servizio usa un repository (Prisma in produzione, in memoria nei test), un client HTTP verso i provider (con `fetch` iniettabile) e un modulo di cifratura AES-256-GCM. `createApp` riceve `aiService` come `userService`. Il layout è fatto solo con EJS e CSS: il menu mobile si apre con `:target`, quindi funziona anche senza JavaScript. Un piccolo `public/app.js` aggiunge il filtro sulle liste lunghe e la conferma prima di eliminare.

**Tech Stack:** Node 22, Express 5, EJS, Prisma 7 (Neon), `node:crypto`, `fetch` nativo, helmet, csrf-sync. Test: `node:test` + supertest.

**Spec:** `docs/superpowers/specs/2026-11-05-layout-provider-ai-design.md`

## Global Constraints

- Le chiavi API non finiscono mai in chiaro nel DB, nei log o nell'HTML. Il browser vede solo l'hint mascherato.
- Nuova variabile `AI_ENCRYPTION_KEY`: 64 caratteri esadecimali (32 byte). In sviluppo/test c'è una chiave fissa di default; in produzione, se manca, l'app si avvia ma la pagina Provider AI mostra un errore e non salva chiavi.
- Cifratura AES-256-GCM: si salvano IV, tag e testo cifrato.
- Chiamate ai provider con `fetch` nativo e timeout di 10 s, senza SDK.
- helmet CSP: niente `<script>` inline (gli attributi `style` vanno bene). JS solo in `public/app.js`.
- Palette solo bianco/nero/grigi. Si rimuove il blocco `@media (prefers-color-scheme: dark)`. Breakpoint a 768px.
- Icone: SVG inline a contorno (stile Lucide, `stroke="currentColor"`, `fill="none"`, stroke-width 2), nessuna libreria o CDN.
- Ogni POST porta `_csrf`. Tutto quello che sta sotto `/admin` richiede `requireLogin` + `requireAdmin`.
- Provider (enum `AiProviderType`): `anthropic`, `google`, `azure`, `openai`, `openrouter`. Etichette: Anthropic, Google, Microsoft Azure, OpenAI, OpenRouter. Una sola configurazione per tipo.
- I testi dell'interfaccia sono in italiano.

## Review Focus

1. **Il provider non risponde, va in timeout o restituisce un errore non JSON**: l'admin vede un messaggio flash leggibile e la pagina non va in errore 500 (test nei Task 2 e 5).
2. **Tipo di provider inesistente nell'URL** (`/admin/ai/pippo`): risposta 404, non 500 (test nel Task 5).
3. **La chiave in chiaro non compare mai** né nell'HTML della pagina di dettaglio né nel valore salvato nel repository (test nei Task 3 e 5).
4. **ID di un modello che appartiene a un altro provider** usato in elimina/modifica: errore "non trovato" e nessuna modifica (test nel Task 3).
5. **`AI_ENCRYPTION_KEY` cambiata dopo il salvataggio**: il provider risulta "chiave da reinserire", senza crash, e `getActiveModels` lo salta (test nel Task 3).

---

### Task 1: Cifratura + configurazione

**Files:**
- Create: `src/services/secretBox.js`, `test/secretBox.test.js`
- Modify: `src/config.js`, `.env.example`

**Interfaces:**
- Produces: `createSecretBox(keyHex: string) → { encrypt(plain: string): string, decrypt(payload: string): string }`. Il payload è `"<iv b64>.<tag b64>.<cipher b64>"`; `decrypt` lancia un'eccezione se il payload è manomesso o la chiave è sbagliata. `createSecretBox` lancia se `keyHex` non è di 64 caratteri esadecimali.
- Produces: `loadConfig(env).aiEncryptionKey: string | null`. Vale `env.AI_ENCRYPTION_KEY` se presente; altrimenti la costante `DEV_AI_KEY` (64 hex, esportata) se non siamo in produzione, `null` in produzione. Se il valore è presente ma non valido, `loadConfig` lancia `"AI_ENCRYPTION_KEY non valida: servono 64 caratteri esadecimali"`.

- [ ] **Step 1: Scrivere i test in `test/secretBox.test.js`**
  - `encrypt → decrypt` restituisce il testo originale; due `encrypt` dello stesso testo danno payload diversi (IV casuale); il payload non contiene il testo in chiaro.
  - `decrypt` con un'altra chiave lancia; `decrypt` di un payload con un carattere cambiato lancia.
  - `createSecretBox('abc')` lancia.
  - `loadConfig({ SESSION_SECRET: 'x', NODE_ENV: 'production' }).aiEncryptionKey === null`; in sviluppo, senza variabile, è uguale a `DEV_AI_KEY`; `AI_ENCRYPTION_KEY: 'zz'` → lancia.
- [ ] **Step 2:** `npm test` → i nuovi test FALLISCONO (modulo mancante).
- [ ] **Step 3: Implementare** `src/services/secretBox.js` con `crypto.createCipheriv('aes-256-gcm', key, iv)` e IV di 12 byte. Aggiornare `src/config.js`. In `.env.example` aggiungere `AI_ENCRYPTION_KEY=` con un commento che spiega come generarla (stesso comando di `SESSION_SECRET`) e che non va cambiata dopo aver salvato le chiavi.
- [ ] **Step 4:** `npm test` → tutto PASS.
- [ ] **Step 5: Commit** `feat: cifratura AES-256-GCM per le chiavi API`

---

### Task 2: Client dei provider AI

**Files:**
- Create: `src/ai/providers.js`, `test/aiProviders.test.js`

**Interfaces:**
- Produces: `PROVIDERS: Array<{ type, label, canListModels: boolean, needsEndpoint: boolean }>` nell'ordine anthropic, openai, google, azure, openrouter. Solo per azure `canListModels: false` e `needsEndpoint: true`.
- Produces: `findProvider(type) → descriptor | undefined`.
- Produces: `class AiProviderError extends Error` (il messaggio è leggibile, in italiano, e include lo stato HTTP quando c'è).
- Produces: `createAiClient({ fetch = globalThis.fetch, timeoutMs = 10000 } = {}) → { listModels(type, creds) → Promise<Array<{ id, name }>>, testConnection(type, creds) → Promise<void> }` con `creds = { apiKey, endpoint?, apiVersion? }`. Gli errori sono sempre `AiProviderError`.

Chiamate (base URL esatti):

| type | listModels | testConnection |
|---|---|---|
| anthropic | `GET https://api.anthropic.com/v1/models?limit=1000`, header `x-api-key`, `anthropic-version: 2023-06-01`; `data[].id`, name = `display_name` | come listModels |
| openai | `GET https://api.openai.com/v1/models`, `Authorization: Bearer`; `data[].id`, name = id | come listModels |
| google | `GET https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000`, header `x-goog-api-key`; tenere solo `supportedGenerationMethods` che include `generateContent`; id = `name` senza il prefisso `models/`, name = `displayName` | come listModels |
| openrouter | `GET https://openrouter.ai/api/v1/models`, Bearer; `data[].id`, `data[].name` | `GET https://openrouter.ai/api/v1/key`, Bearer |
| azure | lancia `AiProviderError('Per Azure i modelli si inseriscono a mano (nome del deployment).')` | `GET {endpoint senza / finale}/openai/models?api-version={apiVersion}`, header `api-key` |

Il risultato di `listModels` è ordinato per `id`.

- [ ] **Step 1: Scrivere i test** con un `fetch` finto che registra URL e header e restituisce `{ ok, status, json() }`:
  - Per ognuno dei 4 provider elencabili: URL e header corretti, mappatura in `{id, name}` (per Google: il prefisso `models/` viene rimosso e i modelli senza `generateContent` vengono esclusi).
  - `testConnection('openrouter')` chiama `/api/v1/key`.
  - `testConnection('azure', { apiKey, endpoint: 'https://r.openai.azure.com/', apiVersion: '2024-10-21' })` → URL `https://r.openai.azure.com/openai/models?api-version=2024-10-21` con header `api-key`.
  - Risposta 401 con body `{ error: { message: 'invalid x-api-key' } }` → `AiProviderError` il cui messaggio contiene `401` e `invalid x-api-key`.
  - Risposta 500 con `json()` che lancia → `AiProviderError` che contiene `500`.
  - `fetch` che rifiuta (errore di rete / `AbortError` per timeout) → `AiProviderError` ("Provider non raggiungibile" / "Timeout").
- [ ] **Step 2:** `npm test` → FALLISCE.
- [ ] **Step 3: Implementare** `src/ai/providers.js` (timeout con `AbortSignal.timeout(timeoutMs)`; il messaggio d'errore usa `body.error.message`, `body.error` se è una stringa, oppure `body.message`).
- [ ] **Step 4:** `npm test` → PASS.
- [ ] **Step 5: Commit** `feat: client per elenco modelli e prova connessione dei provider AI`

---

### Task 3: Schema, repository e aiService

**Files:**
- Modify: `prisma/schema.prisma`, `src/services/errors.js`
- Create: migrazione `prisma/migrations/<timestamp>_ai_providers/` (con `npm run db:migrate -- --name ai_providers`), `src/db/prismaAiRepo.js`, `test/fakeAiRepo.js`, `src/services/aiService.js`, `test/aiService.test.js`

**Interfaces:**
- Schema:
  ```prisma
  enum AiProviderType { anthropic google azure openai openrouter }
  model AiProvider {
    id Int @id @default(autoincrement())
    type AiProviderType @unique
    apiKeyEnc String
    apiKeyHint String
    endpoint String?
    apiVersion String?
    active Boolean @default(true)
    createdAt DateTime @default(now())
    updatedAt DateTime @updatedAt
    models AiModel[]
  }
  model AiModel {
    id Int @id @default(autoincrement())
    providerId Int
    provider AiProvider @relation(fields: [providerId], references: [id], onDelete: Cascade)
    modelId String
    displayName String
    active Boolean @default(true)
    createdAt DateTime @default(now())
    @@unique([providerId, modelId])
  }
  ```
- Contratto del repository (Prisma e fake identici; i provider vengono sempre restituiti con `models` ordinati per `displayName`):
  `listProviders()`, `findProvider(type)`, `upsertProvider(type, data)`, `updateProvider(type, data)`, `deleteProvider(type)`, `createModels(providerId, [{ modelId, displayName }])` (salta i duplicati e restituisce quanti ne ha creati), `findModel(id)`, `updateModel(id, data)`, `deleteModel(id)`. Un `id` non numerico restituisce `null`, come in `prismaUserRepo`.
- Nuovi codici in `errors.js`: `AI_KEY_MISSING: 'Configurazione mancante: imposta AI_ENCRYPTION_KEY nelle variabili d'ambiente.'`, `PROVIDER_NOT_FOUND: 'Provider non trovato.'`, `PROVIDER_NOT_CONFIGURED: 'Configura prima la chiave API.'`, `KEY_UNREADABLE: 'La chiave salvata non è più leggibile: reinseriscila.'`, `MODEL_NOT_FOUND: 'Modello non trovato.'`. `PROVIDER_ERROR` usa il messaggio del provider.
- Produces: `maskKey(apiKey) → string`: se la chiave ha almeno 20 caratteri, `primi 6 + '••••' + ultimi 4`; altrimenti `'••••' + ultimi 4`.
- Produces: `createAiService({ repo, client, secretBox /* null se manca la chiave */ })` →
  - `encryptionReady: boolean`
  - `listProviders() → [{ type, label, canListModels, needsEndpoint, configured, active, modelCount }]`: sempre 5 voci, nell'ordine di `PROVIDERS`.
  - `getProvider(type) → { ...descriptor, configured, active, keyHint, endpoint, apiVersion, keyReadable, models: [{ id, modelId, displayName, active }] }`. Lancia `PROVIDER_NOT_FOUND` se il tipo non è in `PROVIDERS`.
  - `saveCredentials(type, { apiKey, endpoint, apiVersion })`: lancia `AI_KEY_MISSING` se `secretBox` manca. Alla prima configurazione `apiKey` è obbligatoria; se è vuota (dopo trim) la chiave resta quella salvata. Per azure servono `endpoint` (deve iniziare con `https://`) e `apiVersion` (default `2024-10-21` se vuota).
  - `setProviderActive(type, active: boolean)`, `deleteProvider(type)`
  - `testConnection(type)`: decifra la chiave e chiama `client.testConnection`. `AiProviderError` diventa `UserError('PROVIDER_ERROR', msg)`; una decifratura fallita diventa `KEY_UNREADABLE`.
  - `fetchAvailableModels(type) → [{ id, name, added: boolean }]`
  - `addModelsFromProvider(type, modelIds: string[]) → number`: riscarica la lista e aggiunge solo gli id che ci sono davvero, con `displayName = name`.
  - `addModelManually(type, { modelId, displayName })`: entrambi i campi obbligatori dopo trim, al massimo 200 caratteri; un duplicato dà `INVALID_INPUT` con il messaggio "Modello già presente.".
  - `setModelActive(type, id, active)`, `renameModel(type, id, displayName)`, `deleteModel(type, id)`: se il modello non appartiene a `type` lanciano `MODEL_NOT_FOUND`.
  - `getActiveModels() → [{ providerType, modelId, displayName, credentials: { apiKey, endpoint, apiVersion } }]`: solo modelli attivi di provider attivi; i provider con chiave non decifrabile vengono saltati.

- [ ] **Step 1:** Aggiornare lo schema ed eseguire `npm run db:migrate -- --name ai_providers` (branch Neon `dev`). Risultato atteso: la migrazione viene creata e applicata e il client Prisma è rigenerato.
- [ ] **Step 2: Scrivere `test/aiService.test.js`** (fake repo, client finto, `createSecretBox(DEV_AI_KEY)`):
  - `saveCredentials('openai', { apiKey: 'sk-proj-abcdefghijklmnop1234' })`: nel repository `apiKeyEnc` non contiene la chiave in chiaro; `apiKeyHint === 'sk-pro••••1234'`. Un secondo salvataggio con `apiKey: ''` mantiene la stessa chiave (`getActiveModels` restituisce ancora quella originale).
  - Prima configurazione senza chiave → `INVALID_INPUT`. Azure senza endpoint → `INVALID_INPUT`; endpoint `http://` → `INVALID_INPUT`.
  - Con `secretBox: null` → `encryptionReady === false` e `saveCredentials` lancia `AI_KEY_MISSING`.
  - `getProvider('pippo')` → `PROVIDER_NOT_FOUND`. `listProviders()` restituisce 5 voci con `configured: false`.
  - Salvataggio con una chiave e lettura con un `secretBox` diverso → `getProvider().keyReadable === false`, `testConnection` → `KEY_UNREADABLE`, `getActiveModels()` salta quel provider.
  - `addModelsFromProvider('openai', ['gpt-a', 'inventato'])` con il client che restituisce `[{id:'gpt-a'}, {id:'gpt-b'}]` → 1 aggiunto; `fetchAvailableModels` segna `gpt-a` come `added: true`.
  - `addModelManually` duplicato → `INVALID_INPUT`.
  - `deleteModel('anthropic', idDiUnModelloOpenAI)` → `MODEL_NOT_FOUND`, e il modello esiste ancora.
  - Il client lancia `AiProviderError('HTTP 401: bad key')` → `testConnection` lancia `UserError` con codice `PROVIDER_ERROR` e messaggio che contiene `bad key`.
  - `getActiveModels()` esclude i modelli disattivati e i provider disattivati.
- [ ] **Step 3:** `npm test` → FALLISCE.
- [ ] **Step 4: Implementare** `test/fakeAiRepo.js`, `src/db/prismaAiRepo.js` (usa `include: { models: { orderBy: { displayName: 'asc' } } }` e `createMany({ skipDuplicates: true })`) e `src/services/aiService.js`.
- [ ] **Step 5:** `npm test` → PASS.
- [ ] **Step 6: Commit** `feat: modello dati e servizio per provider e modelli AI`

---

### Task 4: Nuovo layout bianco e nero + Home

**Files:**
- Modify: `views/partials/header.ejs`, `views/partials/footer.ejs`, `public/style.css` (riscritto), `views/login.ejs`, `views/register.ejs`, `views/profile.ejs`, `views/admin.ejs`, `views/error.ejs`, `views/partials/google.ejs`, `src/app.js`, `src/routes/auth.js`, `test/app.test.js`
- Create: `views/partials/icon.ejs`, `views/partials/nav.ejs`, `views/home.ejs`, `public/app.js`

**Interfaces:**
- `res.locals.currentPath = req.path` (impostato nel middleware locals di `app.js`).
- `include('partials/icon', { name })` → `<svg>` a contorno, 20×20. Nomi: `home`, `user`, `users`, `bot`, `menu`, `x`, `logout`, `plus`, `refresh`, `check`, `alert`, `trash`, `plug`.
- `nav.ejs` riceve `{ variant: 'sidebar' | 'fullscreen' }` e genera le voci Home `/`, Profilo `/profile`, sezione "Amministrazione" (solo admin) con Utenti `/admin` e Provider AI `/admin/ai`, ed Esci (form POST `/logout`). La voce attiva ha la classe `active` (match esatto per `/` e `/admin`, per prefisso per `/admin/ai` e `/profile`).
- Struttura (solo se `currentUser`): `.topbar` (brand "PELLA" + "Nome · ruolo"), `aside.sidebar` (nascosta sotto i 768px), `main.content`, `nav.bottombar` (visibile solo sotto i 768px) con Home, Profilo e Menu (`href="#menu"`), `div#menu.menu-full` mostrato con `:target`, con ✕ `href="#"` e `nav variant fullscreen`. Senza utente collegato la pagina mostra solo `main.auth` centrato.
- Il footer carica `<script src="/app.js" defer></script>`. `public/app.js`: (1) `input[data-filter]` nasconde le righe `[data-filter-row]` il cui `data-filter-text` non contiene il testo cercato (senza distinzione tra maiuscole e minuscole); (2) i `form[data-confirm]` chiedono `confirm(msg)` prima dell'invio.
- `GET /` per l'utente collegato mostra `home` (titolo "Home", benvenuto con nome e schede di collegamento rapido, quelle admin solo per gli admin). Login, registrazione e callback Google ora reindirizzano a `/` invece di `/profile`.
- I messaggi flash usano l'icona `check` o `alert`. Errore: bordo nero di 2px e testo in grassetto. Successo: bordo grigio di 1px.

- [ ] **Step 1: Aggiornare/aggiungere i test in `test/app.test.js`:**
  - Gli attuali `assert.equal(r.headers.location, '/profile')` dopo registrazione e login diventano `'/'`.
  - `GET /` da collegato → 200, contiene `Benvenuto` e `class="sidebar"`, contiene `href="#menu"` e `id="menu"`.
  - Utente normale: `GET /` non contiene `href="/admin/ai"`. Admin: lo contiene.
  - `GET /login` → non contiene `class="sidebar"` né `bottombar`.
  - `GET /profile` da collegato → il link a `/profile` ha la classe `active`.
- [ ] **Step 2:** `npm test` → i nuovi test FALLISCONO.
- [ ] **Step 3: Implementare** partial, viste, CSS e route. CSS: variabili `--bg #fafafa`, `--card #fff`, `--text #111`, `--muted #737373`, `--border #e5e5e5`; nessun `prefers-color-scheme`. Sidebar fissa larga 240px. La bottombar è fissa con `padding-bottom: env(safe-area-inset-bottom)`; `main` ha un padding in basso pari alla sua altezza. `.menu-full` è `position: fixed; inset: 0`, con lo z-index sopra tutto.
- [ ] **Step 4:** `npm test` → PASS.
- [ ] **Step 5: Verifica a mano:** `npm run dev`, poi aprire `http://localhost:3000` su desktop e con la vista mobile di DevTools (larghezza 375px). Controllare che: la sidebar compaia solo su desktop; la barra in basso resti fissa durante lo scroll; "Menu" apra il menu a schermo intero e ✕ lo chiuda; la tabella utenti scorra in orizzontale.
- [ ] **Step 6: Commit** `feat: layout responsive in bianco e nero con barra laterale e barra mobile`

---

### Task 5: Pagine admin Provider AI + collegamento

**Files:**
- Create: `src/routes/aiAdmin.js`, `views/ai-providers.ejs`, `views/ai-provider.ejs`, `views/ai-available.ejs`, `test/aiAdmin.test.js`
- Modify: `src/app.js` (`createApp({ userService, aiService, sessionStore, config })`), `src/server.js`, `test/app.test.js` (la funzione `setup` passa anche un `aiService`), `README.md`

**Interfaces:**
- Consumes: `createAiService` (Task 3), `createAiClient`/`PROVIDERS` (Task 2), `createSecretBox`/`config.aiEncryptionKey` (Task 1), partial `icon` (Task 4).
- `server.js`: `secretBox = config.aiEncryptionKey ? createSecretBox(config.aiEncryptionKey) : null`. Se manca, scrive nel log `Provider AI: AI_ENCRYPTION_KEY non impostata, salvataggio chiavi disattivato`.
- Route (tutte con `requireLogin, requireAdmin`; ogni POST fa redirect alla pagina di dettaglio con un flash; una `UserError` diventa flash `error`; `PROVIDER_NOT_FOUND` → pagina 404):
  - `GET /admin/ai` → elenco con 5 schede (stato: "non configurato" / "attivo" / "disattivato", numero di modelli). Banner se `!encryptionReady`.
  - `GET /admin/ai/:type` → dettaglio: form credenziali (campo password vuoto con placeholder = hint; endpoint e versione API solo se `needsEndpoint`); "Prova connessione"; interruttore attivo; "Elimina configurazione" (`data-confirm`); tabella modelli con rinomina, attiva/disattiva ed elimina; link "Recupera lista dal provider" (solo se `canListModels` e configurato); form "Aggiungi a mano" (etichetta "Nome deployment" per Azure). Se `!keyReadable` mostra l'avviso `KEY_UNREADABLE`.
  - `POST /admin/ai/:type/credentials`, `POST /admin/ai/:type/active` (`active=true|false`), `POST /admin/ai/:type/delete` (redirect a `/admin/ai`), `POST /admin/ai/:type/test` (successo: "Connessione riuscita.").
  - `GET /admin/ai/:type/available` → chiama `fetchAvailableModels`. In caso di errore del provider: flash e redirect al dettaglio. Mostra la lista di checkbox `name="models" value="<id>"` (disabilitate se `added`) e un campo `data-filter`.
  - `POST /admin/ai/:type/models` (`models` può essere una stringa o un array; va normalizzato in array; se è vuoto: flash "Nessun modello selezionato.") → "N modelli aggiunti."
  - `POST /admin/ai/:type/models/manual`, `POST /admin/ai/:type/models/:id/active`, `POST /admin/ai/:type/models/:id/name`, `POST /admin/ai/:type/models/:id/delete`.

- [ ] **Step 1: Scrivere `test/aiAdmin.test.js`** (stesse funzioni di supporto di `app.test.js`; `aiService` reale con fake repo, client finto e `DEV_AI_KEY`; il primo utente registrato è admin):
  - Un utente normale su `GET /admin/ai` → 403; su `POST /admin/ai/openai/credentials` (con csrf) → 403.
  - Admin: `GET /admin/ai` → 200 e contiene le 5 etichette. `GET /admin/ai/pippo` → 404.
  - Admin salva la chiave `sk-proj-abcdefghijklmnop1234` → redirect `/admin/ai/openai`; la pagina contiene `sk-pro••••1234` e **non** contiene `abcdefghijklmnop`.
  - Il client finto rifiuta con `AiProviderError('HTTP 401: bad key')` → `POST .../test` fa redirect al dettaglio e la pagina mostra `bad key`.
  - `GET /admin/ai/openai/available` mostra i modelli del client finto; `POST .../models` con `models=gpt-a` → nel dettaglio compare `gpt-a`.
  - Con `aiService` creato con `secretBox: null`: `GET /admin/ai` contiene `AI_ENCRYPTION_KEY`.
- [ ] **Step 2:** `npm test` → FALLISCE.
- [ ] **Step 3: Implementare** route, viste e collegamenti in `app.js`/`server.js`, e aggiornare `setup()` in `test/app.test.js`.
- [ ] **Step 4:** `npm test` → tutto PASS.
- [ ] **Step 5: README:** aggiungere una sezione "Provider AI" con: generazione di `AI_ENCRYPTION_KEY`, inserimento in `.env` e nelle Environment Variables di Render, avviso che cambiarla rende illeggibili le chiavi già salvate, e note su Azure (endpoint, versione API, nome del deployment come ID modello).
- [ ] **Step 6: Verifica a mano:** `npm run dev` come admin → Provider AI → configurare almeno un provider con una chiave vera (se disponibile), poi "Prova connessione", "Recupera lista", aggiungere 2 modelli, disattivarne uno, eliminarne uno. Su `npm run db:check` o Prisma Studio controllare che `apiKeyEnc` non contenga la chiave in chiaro.
- [ ] **Step 7: Commit** `feat: pagine admin per configurare provider e modelli AI`
