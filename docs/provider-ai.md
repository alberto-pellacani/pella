# Provider AI — configurazione

La pagina **Amministrazione → Provider AI** (`/admin/ai`, solo admin) permette di salvare le chiavi API di Anthropic, OpenAI, Google, Microsoft Azure e OpenRouter e di scegliere i modelli che l'app potrà usare nelle funzionalità future.

## 1. La chiave di cifratura `AI_ENCRYPTION_KEY`

Le chiavi API vengono salvate nel database **cifrate** (AES-256-GCM). Per cifrarle serve una chiave che sta solo nelle variabili d'ambiente, mai nel codice o nel database.

1. Genera una chiave (64 caratteri esadecimali):
   ```
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```
2. **In locale**: aggiungila al file `.env` → `AI_ENCRYPTION_KEY=...` e riavvia `npm run dev`.
   (Se non la imposti, in sviluppo l'app usa una chiave di prova fissa: va bene solo per provare.)
3. **Su Render**: Dashboard → servizio → **Environment** → *Add Environment Variable* → `AI_ENCRYPTION_KEY` con una chiave **diversa** da quella locale → *Save changes* (Render rifà il deploy).
   Se in produzione la variabile manca, l'app parte lo stesso ma la pagina Provider AI mostra un avviso e non salva chiavi.

> ⚠️ **Non cambiare `AI_ENCRYPTION_KEY` dopo aver salvato delle chiavi**: quelle già salvate diventerebbero illeggibili. La pagina lo segnala ("La chiave salvata non è più leggibile") e basta reinserirle.

Locale e Render usano branch Neon diversi, quindi anche le chiavi API salvate sono separate: vanno inserite in entrambi gli ambienti.

## 2. Configurare un provider

1. Apri **Provider AI** e clicca il provider.
2. Incolla la **chiave API** e premi **Salva**. Da quel momento la chiave non viene più mostrata: si vedono solo le ultime 4 cifre. Per cambiarla incollane una nuova; lasciando il campo vuoto resta quella attuale.
3. **Prova connessione** verifica che la chiave funzioni.
4. **Recupera lista dal provider** scarica i modelli disponibili: spunta quelli da abilitare e premi *Aggiungi selezionati* (c'è un campo per filtrare le liste lunghe, es. OpenRouter).
5. In alternativa usa **Aggiungi a mano** (ID del modello + nome da mostrare).
6. Ogni modello si può rinominare, disattivare o eliminare; anche l'intero provider si può disattivare.

Dove trovare le chiavi:

| Provider | Dove |
|---|---|
| Anthropic | console.anthropic.com → API Keys |
| OpenAI | platform.openai.com → API keys |
| Google | aistudio.google.com → Get API key |
| OpenRouter | openrouter.ai → Keys |
| Microsoft Azure | portale Azure → risorsa Azure OpenAI → *Keys and Endpoint* |

## 3. Microsoft Azure (Azure OpenAI)

Azure funziona in modo diverso dagli altri:

- servono **Endpoint** (es. `https://nome-risorsa.openai.azure.com`) e **Versione API** (se vuota: `2024-10-21`), entrambi nella pagina *Keys and Endpoint* della risorsa;
- i modelli **non** si recuperano automaticamente: si aggiungono a mano, e l'ID da inserire è il **nome del deployment** che hai creato in Azure AI Foundry, non il nome del modello.

## 4. Per gli sviluppatori

- Codice: `src/ai/providers.js` (chiamate HTTP), `src/services/aiService.js` (logica), `src/services/secretBox.js` (cifratura), `src/routes/aiAdmin.js` (pagine).
- Le funzionalità future otterranno i modelli utilizzabili con `aiService.getActiveModels()`: restituisce solo modelli attivi di provider attivi, con le credenziali già decifrate.
