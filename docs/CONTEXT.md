# Udhaar — Project Context / AI Handoff Memory

**Purpose:** Durable handoff context for another AI agent or engineer.  
**Updated:** 2026-11-09

## 1. Product
Udhaar is a WhatsApp-first, voice-enabled digital khata for Indian kirana stores and small retailers. An owner sends a voice note; the system transcribes it, interprets one action, validates it deterministically, updates the shop ledger and confirms the committed result.

Other capabilities: customer balances/history, ambiguity clarification, exact-entry undo, older correction, owner dashboard and a planned weekly reminder workflow.

## 2. Documents to read
Read `PRD.md` (maintained separately), `ARCHITECTURE.md`, `DESIGN.md`, `CONTEXT.md`, `RULES.md` and `TRACKER.md` before material changes. The three workflow diagrams are primary behaviour references:
- `01_core_voice_to_ledger.png`: voice note to verified ledger entry.
- `02_clarification_undo_safety.png`: stop/ask, ambiguity, balance query and reversal.
- `03_reminders_dashboard_privacy.png`: Sunday reminders, owner dashboard and privacy/money rules.

## 3. Durable decisions
- Firebase + Firestore is the selected backend/database. This supersedes Supabase/PostgreSQL wording in the first diagram.
- Firebase Authentication for owner auth; Firebase Admin SDK for privileged server work.
- Payload CMS is not selected.
- Do not add a second primary database.
- Preserve existing frontend and Node.js/TypeScript backend where viable.
- Gemini is intended initial LLM provider for EVON; NVIDIA NIM is optional.
- PRISMA is intended STT, EVON agent/parser, TIMBRE TTS; exact providers/docs/capabilities require verification.
- Gyani/Gnani provider identity and role need confirmation; do not infer capabilities.
- Meta WhatsApp Cloud API is intended channel; live credentials/webhook are external configuration.
- Sunday reminders remain disabled until the kirana ledger reminder use case is cleared under current Meta/BSP policy.

## 4. Workflow 01 — voice to ledger
Owner sends voice note → Meta webhook → verify/map owner to shop/deduplicate → secure media fetch → validate/normalize audio → PRISMA STT → EVON proposes one typed action → deterministic validation → tool handler → Firestore commit → exact confirmation.

Noisy/empty/too-long/unusable audio must be rejected without partial ledger entry.

## 5. Workflow 02 — stop and ask
- Never infer amount from item names.
- Never guess between duplicate customer names.
- Ask one short question in owner's language where supported.
- Persist pending context; no ledger write until all required fields are resolved.
- Balance query is read-only and returns current balance plus last five entries.
- Ten-minute undo must target exact entry linked to bot confirmation.
- Older correction requires customer/date lookup and exact entry selection.
- Reversals/edits preserve history and require actor/reason/audit.
- Empty/noisy/too-long audio creates no partial entry.

## 6. Workflow 03 — reminders/dashboard
Schedule: Sunday 6 PM, Asia/Kolkata.
Eligibility: balance > ₹0, valid phone, recorded opt-in, no opt-out, shop feature enabled and policy gate approved.
At send time recalculate balance; generate one customer-specific reminder and UPI link; use TIMBRE if verified/configured; apply current WhatsApp window/template rules; log delivery or exact skip reason.
A UPI link open/click is not proof of payment. Only recorded/reconciled payment changes ledger.
Dashboard includes owner login, customer list, balances, phone/reminder status, last five/full history, owner-only corrections and audit trail.

## 7. Historical reported test state — not a current guarantee
A prior agent report stated:
- typecheck: passed, 0 errors;
- unit: 96 passed;
- emulator: 74 passed;
- browser E2E: 2 passed;
- browser workspace: 3 passed;
- production build and bundle secret scan: passed;
- total reported: 175 tests passing.

Historical blockers:
- Live Firebase Auth to project `udhar-khata-f41fb` could not be verified in sandbox due proxy/network errors (`ERR_CERT_AUTHORITY_INVALID` / HTTP 520).
- Runtime lacked Firebase server credentials, Gemini, Gnani/Gyani and Meta configuration.
- PRISMA and TIMBRE documentation had not been supplied.
- Reminder sending was hard-disabled as `NOT_APPROVED`.

Re-run tests in the current checkout. Emulator passes do not prove live Firebase connectivity.

## 8. Configuration categories
Keep credentials server-side. Expected categories include Firebase client config, Firebase Admin credentials, Gemini key/model, PRISMA, TIMBRE, Gyani/Gnani, Meta access token, phone number ID, business account ID, app secret, verify token and Graph API version.

Report each integration as `CONFIGURED`, `NOT CONFIGURED`, `INVALID`, `BLOCKED EXTERNALLY` or `DISABLED BY POLICY`.

## 9. Next-agent instructions
- Inspect the current repository and read all project docs first.
- Check `TRACKER.md` before starting.
- Preserve working code and passing tests.
- Do not repeat broad audits without new evidence.
- Diagnose failures from console, network response, backend logs and reproducible tests.
- Make small targeted changes and add regression tests.
- Never claim live integration from mocks/emulator tests.
- Update `CONTEXT.md` for durable decisions and `TRACKER.md` for status.
- Do not change PRD/scope without product-owner approval.
