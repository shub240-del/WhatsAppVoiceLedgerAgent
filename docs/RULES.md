# Udhaar — Engineering Rules

**Mandatory project rules | Updated:** 2026-11-09

## 1. Before editing
1. Read `PRD.md`, `ARCHITECTURE.md`, `DESIGN.md`, `CONTEXT.md`, `RULES.md`, `TRACKER.md`.
2. Inspect the relevant existing implementation.
3. Reproduce the bug or confirm the missing behaviour.
4. Record evidence and assumptions.
5. Make the smallest safe change.

Do not restart a broad audit for a narrow task.

## 2. Architecture
- Firebase/Firestore is the selected primary backend and database.
- Do not introduce Payload, Supabase, PostgreSQL, MongoDB or MySQL as a second source of truth without explicit approval.
- Preserve existing frontend and Node.js/TypeScript structure where viable.
- Keep business logic server-side and providers behind adapters.
- Do not silently change routes/API contracts.
- Do not enable paid services or upgrade Firebase billing without approval.

## 3. Financial safety
- LLM proposes; deterministic backend validates and executes.
- LLM never writes directly to Firestore.
- Store money as integer paise; never use floating point for money.
- Never guess amount, customer identity or transaction type.
- Never infer price from item names.
- Never write partial transactions.
- Every write is authorized, shop-scoped and idempotent.
- Duplicate messages/webhooks must not duplicate ledger effects.
- Use atomic writes for ledger/balance invariants.
- Never hard-delete posted financial history.
- Reversals require exact target, authorized actor, reason and audit.
- UPI link click/open is not payment proof.
- Balance changes only after recorded/reconciled payment.

## 4. AI and untrusted input
- Treat audio, transcripts, model output and provider payloads as untrusted.
- Validate model output against strict schemas.
- Exactly one proposed action per request.
- Resolve IDs from trusted backend context.
- Never trust model-generated shop IDs, customer IDs or balances.
- Reject malformed/unknown actions and invalid amounts.
- Ambiguity triggers one concise clarification.
- Provider capabilities/endpoints/formats must be verified from documentation; never invent them.

## 5. Security/privacy
- Never commit API keys, tokens, service-account JSON or certificates.
- Never expose Firebase Admin credentials in frontend bundles.
- Use secret manager/server environment for secrets.
- Do not return secrets from integration-status APIs.
- Enforce tenant isolation server-side and in Firestore rules.
- Frontend filtering is not authorization.
- Keep audio private with defined retention.
- Avoid logging secrets, raw audio or unnecessary personal data.
- Verify Meta webhook signatures as documented.
- Do not expose stack traces to users.
- Reminder sending stays disabled until policy approval.

## 6. API compatibility
- Do not break existing contracts without approval.
- Update callers, tests and docs together when a change is approved.
- Validate inputs/outputs.
- Use consistent errors, timeouts and bounded retries.
- Use stable idempotency for retried operations.
- Distinguish provider outages from business validation failures.

## 7. Code quality
- Prefer strict TypeScript and explicit types.
- Avoid `any`; isolate and explain if unavoidable.
- Do not add unnecessary dependencies.
- Do not suppress lint/type errors to force green builds.
- Remove temporary debug code.
- Do not leave TODOs for work claimed complete.
- Keep functions focused and testable.
- Do not duplicate business rules across frontend/backend.

## 8. UI/UX
- Follow `DESIGN.md`.
- Preserve forest-green/warm off-white brand.
- Every visible button must do its advertised action.
- No fake analytics, hardcoded financial data or placeholder interactions in production paths.
- Show loading, empty, success and error states.
- Never show unavailable balance as zero.
- Use accessible labels, keyboard support and visible focus.
- Respect reduced motion and test mobile overflow.
- Label demo data as illustrative.
- Marketing claims must match verified capabilities.

## 9. Testing
After each meaningful change:
1. Run targeted tests.
2. Run typecheck/lint as applicable.
3. Add regression test for each bug.
4. Run affected integration tests.
5. Run full suite and production build before completion.

Use Firebase Emulator for rules/transaction tests. Mocks are not proof of live provider integration. Never delete, weaken or skip tests to obtain a pass. Report skipped tests accurately.

## 10. Debugging protocol
1. Reproduce.
2. Capture console error and stack.
3. Capture failed request URL/method/status/response (redact secrets).
4. Inspect backend/provider logs.
5. State evidence-based root cause.
6. Fix only affected area.
7. Add regression test.
8. Re-run original failing operation and relevant tests.
9. State what remains unverified.

Do not guess from symptoms.

## 11. External integrations
- Meta, Gemini, PRISMA, TIMBRE and Gyani/Gnani are independently configurable.
- NVIDIA is optional if Gemini is selected.
- Keep adapters testable with contract mocks.
- Mark live integration configured only after a real successful request.
- Do not claim live WhatsApp from mocked webhook tests.
- Do not send customer reminders before policy approval.

## 12. Change management
- No destructive migration without approval and rollback/backup plan.
- No public deployment or billing activation without approval.
- Keep changes small/reviewable.
- Update docs when durable behaviour/architecture changes.
- Update `TRACKER.md` after task status changes.
- Update `CONTEXT.md` for durable decisions.

## 13. Definition of done
A task is complete only when implemented, tested, regression-safe, documented, and honestly classified. External blockers must be explicit. Code existence alone is not proof.
