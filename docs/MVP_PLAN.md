# Voice Udhaar Khata — MVP plan and status

WhatsApp is out of scope for now: the assistant lives in the website (Home → mic or type).

## Folder structure
```
api/index.ts                 Vercel serverless entry (runs server/app.ts)
server/
  app.ts                     Express API: /api/assistant, /api/customers, /api/ledger/actions, /api/shop, ...
  assistant.ts               One assistant turn: audio/text -> STT -> agent -> reply
  agent/voice-agent.ts       Decide -> ledger write -> follow-up question / undo (shared with dormant WhatsApp)
  agent/gemini.ts            "Evon" parser: system prompt + 9 few-shot examples, strict JSON schema
  agent/decide.ts            Server validation of every proposal (customer match, amount agreement)
  money-words.ts             Hindi/Marathi/Gujarati number words, quantity-vs-amount rules (integer paise)
  matching.ts                Customer matching with aliases, labels, phonetic keys
  gnani-stt.ts               Prisma speech-to-text (Gnani), language hints per shop
  ledger.ts                  Firestore transactions: entries, balances, reversals, audit, idempotency
  languages.ts               Shop language -> STT language hints
  eval/parser-cases.ts       16 test notes + live accuracy runner
src/                         React dashboard (Home assistant, Customers, Entries, Activity, Settings)
tests/unit, tests/integration, tests/browser
```

## Environment variables (Vercel → Settings → Environment Variables)
| Name | Required | Notes |
|---|---|---|
| FIREBASE_SERVICE_ACCOUNT | yes | Service-account JSON (Secret) |
| GNANI_API_KEY | for voice | Prisma STT (Secret) |
| APP_GEMINI_API_KEY | for parsing | Gemini key (Secret); model defaults to gemini-3.5-flash-lite |
| APP_GEMINI_MODEL | no | Override the model |
| GNANI_STT_MODEL / GNANI_STT_FORMAT | no | Defaults prisma-v3.0 / verbatim |

## Decisions
- Database: Firestore (already live) instead of Supabase. Same model: shops, customers, ledgerEntries
  (integer paise, items in `notes`, reversals instead of delete), auditLogs.
- "Evon" = Gemini behind the `EvonParser` interface; can be swapped when Evon docs are provided.
- Prisma (STT) and Timbre (TTS) = Gnani, from docs.gnani.ai.

## Phase 1 — parsing accuracy (done)
Test against the spec found: quantities read as amounts ("teen packet … 85 rupaye" refused), Marathi/Gujarati
amounts not understood, language hard-wired to Hindi, items missing from confirmations, no few-shot prompt,
no accuracy test. All fixed; server layer passes 16/16 eval cases. Live score: Connections → "Run AI accuracy test".

## Next phases
- Phase 2: Khatabook-style customer page, add a new customer by voice, store transcript/items properly.
- Phase 3: Reminders without WhatsApp API: UPI link + QR, Timbre voice note, share via WhatsApp/SMS link from
  the owner's phone, list of customers without a phone number.
- Phase 4: real-voice testing with 2 shopkeepers, fixes, 60-second demo.
