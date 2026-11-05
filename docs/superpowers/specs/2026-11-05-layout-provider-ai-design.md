# Layout responsive e configurazione Provider AI

Data: 2026-11-05

## Intento

Due cambiamenti all'app esistente (Express + EJS + Prisma su Neon, ruoli admin/user):

1. **Nuovo layout responsive** per PC e mobile, con menu dinamici, in stile sobrio **bianco e nero** su sfondo chiaro. All'utente non piacciono le app colorate.
2. **Prima funzionalità vera, solo per admin**: configurare i **provider AI** e i **modelli LLM** che l'app userà in funzionalità future (che per ora non esistono). Oggi si tratta solo di censire credenziali e modelli in modo sicuro; nessuna chiamata di "chat" o generazione.

Il progetto resta didattico (imparare Render + Neon): codice piccolo e leggibile, nessun framework frontend.

## Obiettivi

### Layout
- **PC (schermi larghi)**: barra laterale fissa a sinistra con le voci:
  - Home, Profilo
  - sezione "Amministrazione" (visibile **solo agli admin**): Utenti, Provider AI
  - Esci (in fondo)
  - In alto una barra sottile con il nome dell'app e l'utente collegato (nome · ruolo).
- **Mobile**: barra **fissa in basso** con icona + etichetta per Home, Profilo e Menu. "Menu" apre l'elenco completo delle voci **a schermo intero**, con una ✕ per chiuderlo.
- La voce della pagina corrente è evidenziata (sfondo nero, testo bianco su PC; grassetto/nero nella barra mobile).
- **Icone** monocromatiche a contorno, come SVG inline nel codice (stile Lucide, licenza ISC), senza librerie esterne né CDN.
- Palette solo bianco/nero/grigi. Si **rimuove il tema scuro automatico** attuale (`prefers-color-scheme: dark`): lo sfondo resta chiaro. I messaggi di errore/successo restano distinguibili senza colori vivaci (es. bordo nero spesso per errore, icona).
- Pagine esistenti (login, registrazione, profilo, gestione utenti, errore) portate nel nuovo stile. Le pagine di login/registrazione (utente non collegato) **non** mostrano barra laterale né barra in basso: solo il form centrato.
- **Home**: nuova pagina `/` per utenti collegati con un benvenuto semplice e collegamenti rapidi (Profilo; per admin anche Utenti e Provider AI). Gli utenti non collegati su `/` vanno a `/login` come oggi.
- Il menu mobile si apre/chiude con poco JavaScript nel file statico in `public/` (helmet blocca gli script inline). Senza JavaScript la pagina deve restare usabile (scelta di Claude: il menu completo è comunque raggiungibile, ad esempio con un link a una pagina/ancora del menu).
- Tabelle larghe (es. utenti) scorrono in orizzontale sul telefono.

### Provider AI (solo admin, `/admin/ai`)
- Provider supportati, fissi nel codice: **Anthropic, Google (Gemini), Microsoft Azure (Azure OpenAI), OpenAI, OpenRouter**.
- **Una configurazione per provider** (una sola chiave per tipo). Scelta di Claude: l'utente non ha chiesto più account per lo stesso provider.
- Pagina elenco: una scheda per ognuno dei 5 provider con stato (non configurato / attivo / disattivato) e numero di modelli.
- Pagina dettaglio provider:
  - **Credenziali**: chiave API; per Azure anche **Endpoint** (es. `https://<risorsa>.openai.azure.com`) e **Versione API**. Pulsante Salva. La chiave salvata non viene mai rimostrata: si vede solo mascherata (es. `sk-ant-••••3f9a`, ultime 4 cifre). Lasciando il campo vuoto al salvataggio, la chiave esistente resta invariata.
  - Interruttore **attivo/disattivo** del provider.
  - **Prova connessione**: chiamata leggera al provider (di solito l'elenco modelli) che risponde "ok" o il messaggio d'errore del provider.
  - **Modelli**: tabella con nome visualizzato, ID modello (quello usato nelle API), stato attivo/disattivo; azioni modifica nome / attiva-disattiva / elimina.
  - **Recupera lista dal provider**: l'app scarica i modelli disponibili e li mostra con caselle da spuntare; quelli spuntati vengono aggiunti. I modelli già aggiunti sono indicati/esclusi.
  - **Aggiungi a mano**: ID modello + nome visualizzato (per Azure l'ID è il **nome del deployment**).
  - Elimina provider/credenziali: cancella la chiave e i suoi modelli (con conferma).
- Recupero elenco modelli per provider:
  - Anthropic: `GET https://api.anthropic.com/v1/models` (header `x-api-key`, `anthropic-version`).
  - OpenAI: `GET https://api.openai.com/v1/models` (Bearer).
  - Google: `GET https://generativelanguage.googleapis.com/v1beta/models` (header `x-goog-api-key`); tenere solo i modelli che supportano `generateContent`.
  - OpenRouter: `GET https://openrouter.ai/api/v1/models` (Bearer).
  - Azure: **solo inserimento a mano** (i deployment non sono elencabili con la sola chiave API). "Prova connessione" per Azure verifica endpoint+chiave con una chiamata leggera all'API (scelta lasciata al builder).
  - Liste molto lunghe (OpenRouter ha centinaia di modelli): campo di filtro testuale sulla lista (JS leggero) o ricerca lato server; scelta al builder.
- Una piccola funzione di servizio per le funzionalità future: "dammi i modelli attivi (di provider attivi) con le credenziali decifrate". Non usata dall'interfaccia oggi, ma è il motivo di tutto questo.

## Non obiettivi

- Chiamare davvero gli LLM per generare testo (arriverà dopo).
- Più configurazioni per lo stesso provider, provider personalizzati/aggiuntivi.
- Tracciamento costi, quote, limiti d'uso.
- Accesso degli utenti normali alla configurazione.
- Tema scuro.
- Rotazione automatica della chiave di cifratura.

## Anti-obiettivi

- Chiavi API salvate in chiaro nel database, scritte nei log, rimandate al browser in chiaro o committate.
- Chiave di cifratura nel codice o nel database.
- Interfaccia colorata/vistosa.
- Menu mobile che copre solo parte dello schermo o barra di navigazione che sparisce scorrendo.
- Introdurre un framework frontend o un sistema di build (React, Tailwind, bundler…).

## Vincoli

- Stack esistente: Node 22 su Render, Express 5, EJS, Prisma 7 su Neon, helmet (CSP: niente script/stili inline), csrf-sync su tutti i POST.
- Migrazione Prisma nuova (branch Neon `dev` in locale, applicata su Render dal build).
- Cifratura: **AES-256-GCM** con `node:crypto`, chiave a 32 byte da nuova variabile d'ambiente `AI_ENCRYPTION_KEY` (64 caratteri esadecimali). Si salvano IV e tag insieme al testo cifrato. In produzione, se manca, l'app si avvia ma la pagina Provider AI mostra un errore chiaro e non salva chiavi (scelta di Claude; in sviluppo si può usare una chiave fissa di sviluppo come già fatto per `SESSION_SECRET`). Va aggiunta a `.env.example`, al README e alle variabili d'ambiente su Render.
- Chiamate HTTP verso i provider con `fetch` nativo di Node, con timeout (es. 10 s); nessun SDK dei provider per ora.
- Test con `node --test` + supertest come gli esistenti; le chiamate ai provider vanno rese sostituibili (iniettate) per poterle simulare nei test.

## Decisioni sul "come" (prese con l'utente)

- Chiavi API salvate **nel database, cifrate** (deciso dall'utente).
- Elenco modelli **recuperato dal provider quando possibile**, altrimenti inserito a mano (deciso dall'utente).
- Layout: **barra laterale su PC, barra fissa in basso su mobile con menu a schermo intero, bianco e nero, con icone** (deciso dall'utente sulle bozze).

## Scelte di Claude dopo la revisione

- **Chiave mascherata**: calcolata al salvataggio e salvata a parte (solo prefisso non segreto + ultime 4 cifre), così per mostrarla non serve decifrare.
- **Modelli recuperati dal provider**: aggiunti come attivi.
- **Decifratura fallita** (es. `AI_ENCRYPTION_KEY` cambiata): niente crash, il provider mostra lo stato "chiave da reinserire".
- **OpenRouter – Prova connessione**: l'elenco modelli di OpenRouter è pubblico e non verifica la chiave, quindi il test usa un endpoint autenticato (`GET https://openrouter.ai/api/v1/key`).

## Scelte lasciate al builder

- Schema dati esatto. Indicazione: tabella `AiProvider` (tipo enum unico, chiave cifrata, endpoint/versione per Azure, attivo, timestamp) e `AiModel` (provider, ID modello unico per provider, nome visualizzato, attivo, timestamp), eliminazione a cascata.
- Struttura URL sotto `/admin/ai`, nomi dei file, organizzazione dei servizi (in linea con `userService`/repo esistenti).
- Selezione delle icone e piccoli dettagli grafici, purché bianco/nero.
- Breakpoint del layout (indicativamente ~768 px).
