# Technical audit — Voice Udhaar

Audit date: 8 Nov 2026. Section A records the codebase **as found** before this
remediation pass. Section B (at the end) records the state after remediation.
Classifications: WORKING (verified by automated test), PARTIALLY WORKING, BROKEN,
MISSING, BLOCKED EXTERNALLY.

Source caveat: the three workflow diagrams were never attached to any message in
this project. Workflow behaviour was compared against the written PRD (v0.9),
sections 9, 16, 17 and 19, which describe Workflows 01–03 step by step.

## A. Baseline (before this pass)

### A1. Architecture

- Frontend: React 19 + Vite 8 + Tailwind v4, single `src/App.tsx` (1,577 lines),
  Firebase Web SDK (Auth email/password, Firestore read-only).
- Backend: Express 5 + TypeScript (`server/`), Firebase Admin SDK, run with `tsx`.
- Database: Cloud Firestore, shop subcollections. Rules deny all client writes.
- No Cloud Functions, no Storage, no hosting configuration, no CI.
- No Payload, Supabase or competing data store found. Single source of truth: Firestore.

### A2. Inventory

| Feature | State | Evidence |
| --- | --- | --- |
| Owner email/password login | PARTIALLY WORKING | Code present; live provider enablement unverified |
| Shop isolation (rules) | WORKING | 3 emulator rule tests |
| Ledger add_credit / add_payment / undo_entry / undo_last | WORKING | Emulator tests incl. concurrency, idempotency, rollback |
| get_balance / find_entries | WORKING | Emulator test (pagination, shop scope) |
| Entry edit (reverse + new) with revisions | MISSING | No code, no `entryRevisions` |
| Customer create | WORKING | Emulator + HTTP test |
| Customer edit, aliases | MISSING | No API or UI |
| Customer detail / full history UI | MISSING | Only global ledger table |
| Audit log UI | MISSING | Logs written, never displayed |
| Reminder consent recording | MISSING | Preferences created as `unknown` only |
| WhatsApp webhook (verify, signature, dedupe) | MISSING | No route |
| WhatsApp outbound / media | MISSING | Interface only |
| Audio validation / STT pipeline | MISSING | Interface only |
| PRISMA / TIMBRE | BLOCKED EXTERNALLY | No documentation or keys |
| Gemini (EVON) parser | MISSING | Key-presence check only |
| Deterministic AI validation (amount phrase, customer match) | MISSING | — |
| Hindi/Hinglish number-word parser | MISSING | Only `"340.50"` digit parsing |
| Clarification state machine | MISSING | — |
| Job queue / retries / DLQ | MISSING | — |
| Reminder engine (eligibility, scheduler, logs) | MISSING | Frozen `NOT_APPROVED` constant only |
| UPI link builder | MISSING | — |
| Nightly balance integrity check | MISSING | — |
| Startup env validation / integration classification | PARTIALLY WORKING | Gnani/Gemini presence only |
| `.env.example` | MISSING | — |

### A3. Critical bugs and defects found

1. No end-to-end voice path exists; the core product promise is unimplemented.
2. `LedgerService` hardcodes `source: "dashboard"`; WhatsApp-originated entries could not be traced to a message (G4 traceability).
3. No way to correct a wrong amount except reverse + manual re-entry with no linkage (PRD 14.1 edit lineage).
4. Dashboard "Total outstanding" only sums positive balances (correct label), but customer search is client-side over loaded pages only (documented, not a bug).
5. `undo_last` window and customer matching exist only on the dashboard path; no WhatsApp undo by reply context.
6. Unused variable `configuredApi` in `App.tsx` (dead code).

### A4. Security findings

- Good: deny-by-default rules, server re-resolves shop from verified ID token, Admin SDK isolated in `server/`, no secrets in bundle (scanned).
- Gap: no webhook signature verification (no webhook at all).
- Gap: rate limiter is per-process memory only.
- Gap: no prompt-injection defence because no LLM path exists yet.
- Gap: no stale-replay rejection for inbound events.

### A5. Database problems

- Missing collections for PRD flows: pending clarifications, WhatsApp messages,
  webhook events, jobs, entry revisions, reminder jobs/logs, payment links,
  confirmations map, owner phone index.
- Customer aliases not modelled.

### A6. Integration problems

- Gemini key saved as `APP_GEMINI_API_KEY` (the sandbox reserves `GEMINI_API_KEY`),
  but no model ID chosen and no adapter.
- Gnani key saved as `GNANI_API_KEY`; the PRD's "Gyani" is the same placeholder.
  No Gnani documentation supplied.
- Neither secret is visible to this workspace runtime (checked: `false`).

### A7. Testing deficiencies

32 tests (12 unit, 17 emulator, 3 browser). No webhook, AI, voice, clarification,
reminder, or end-to-end tests.

### A8. Performance

- Dashboard loads 50 customers/entries per page with server aggregates: acceptable.
- `undo_last` query bounded to 101 docs. No unbounded reads.

### A9. Deployment blockers

- No hosting target for the Node API/worker; Cloud Functions require the Blaze plan
  (not approved). Firebase Storage on new projects also requires Blaze.
- Meta app, phone number, webhook URL not configured.

### A10. Remediation plan (priority order)

1. Ledger: source traceability, entry edit with revisions, integrity check.
2. Deterministic validators: number words, customer matching.
3. EVON: Gemini adapter (official SDK, JSON schema output), strict schema, repair retry.
4. Clarification state machine and undo-by-reply.
5. WhatsApp: webhook verify/signature/dedupe/stale reject, Graph adapter, statuses.
6. Firestore-backed job queue with checkpointing, bounded retries, dead-letter.
7. Audio validation + STT adapter contract (PRISMA blocked).
8. Reminder engine with policy gate (sending disabled), UPI, TTS contract.
9. Dashboard: customer detail/edit/aliases, history, edit entry, audit log, reminders.
10. Config validation, `.env.example`, docs, ≥100 meaningful tests.

## B. Google Authentication update (9 Nov 2026)

- The frontend now starts Firebase Google sign-in with redirect, explicitly persists
  the session locally, and consumes the redirect result on app startup.
- New Google identities are routed to the existing trusted shop-linking guide;
  existing users continue to the workspace. Shop access still requires an active
  owner membership.
- Email/Password remains intentionally disabled and is not required by the app.
- The Google provider and local browser origins were accepted by the live Identity
  Toolkit sign-in endpoint. A full interactive Google account sign-in and the
  deployed site's authorized-domain/OAuth client settings require browser/operator
  verification.
- Backend routes call Firebase Admin `verifyIdToken(token, true)`. Emulator-backed
  API tests verify valid, invalid and revoked tokens. Live Admin verification
  remains blocked until server ADC or `GOOGLE_APPLICATION_CREDENTIALS` is supplied.
