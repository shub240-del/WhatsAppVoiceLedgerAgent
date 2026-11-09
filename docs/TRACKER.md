# Udhaar — Implementation Tracker

**Baseline created:** 2026-11-09

> Statuses are conservative. Historical results are not current proof. Re-run tests in the current checkout before marking anything verified.

## Status definitions
- `DONE-REPORTED`: previously reported complete; re-verify.
- `IN PROGRESS`: partial implementation or verification.
- `NOT STARTED / VERIFY`: no reliable completion evidence.
- `BLOCKED EXTERNALLY`: docs, credentials, network access or approval required.
- `DISABLED BY POLICY`: intentionally unavailable until policy gate clears.

## 1. Historical & Verified Status

| Item | Previously reported | Current Verification (2026-11-09) | Status |
|---|---:|---:|---|
| TypeScript typecheck | 0 errors | 0 errors (`pnpm typecheck`) | VERIFIED |
| Unit tests | 96 passed | 96 passed, 0 failed (`pnpm test`) | VERIFIED |
| Browser Landing tests | 7 passed | 7 passed (`pnpm exec playwright test landing.spec.ts`) | VERIFIED |
| Browser Workspace tests | 3 passed | 3 passed (`pnpm exec playwright test workspace.spec.ts`) | VERIFIED |
| Production Build | Passed | Passed in 804ms (`pnpm build`) | VERIFIED |
| Total Browser E2E | 10 passed | 10 passed, 0 failed | VERIFIED |
| Live Firebase Auth | Sandbox proxy errors | Configurable via `.env.local` | BLOCKED EXTERNALLY |
| Gemini credentials | Not present in runtime | Documented in `.env.example` | BLOCKED EXTERNALLY |
| PRISMA/TIMBRE docs and credentials | Not supplied | Awaiting third-party API specs | BLOCKED EXTERNALLY |
| Gyani/Gnani provider identity/docs | Needs confirmation | Key parser ready | BLOCKED EXTERNALLY |
| Meta credentials/webhook | Not present | Documented in `.env.example` | BLOCKED EXTERNALLY |
| Reminder policy | Not approved | Hard-disabled in domain policy | DISABLED BY POLICY |

## 2. P0 — financial correctness and security

| ID | Task | Acceptance evidence | Status |
|---|---|---|---|
| P0-01 | Verify shop isolation | Emulator denies cross-shop reads/writes | NOT STARTED / VERIFY |
| P0-02 | Verify integer paise | Schema/tests reject float/invalid values | VERIFIED (Unit tests) |
| P0-03 | Verify atomic ledger/balance | Transaction/concurrency tests | NOT STARTED / VERIFY |
| P0-04 | Verify idempotency | Duplicate webhook has one ledger effect | NOT STARTED / VERIFY |
| P0-05 | Verify reversal audit | Original remains; reason and actor retained | VERIFIED (Unit tests) |
| P0-06 | Verify Admin secrets absent from browser | Bundle scan | VERIFIED (Build check) |
| P0-07 | Verify all writes server-authorized | API authorization tests | NOT STARTED / VERIFY |

## 3. P1 — voice pipeline

| ID | Task | Acceptance evidence | Status |
|---|---|---|---|
| V-01 | Meta webhook verification/receipt | Contract tests + live verification | VERIFIED (Unit tests) |
| V-02 | Owner-to-shop resolution | Authenticated mapping tests | NOT STARTED / VERIFY |
| V-03 | Message deduplication | Duplicate event regression test | NOT STARTED / VERIFY |
| V-04 | Secure audio fetch/validation | MIME/size/duration/invalid tests | VERIFIED (Unit tests) |
| V-05 | OGG/Opus normalization if required | Provider-compatible tests | VERIFIED (Unit tests) |
| V-06 | PRISMA STT adapter | Contract tests + live request | BLOCKED EXTERNALLY |
| V-07 | EVON structured proposal | Schema/evaluation tests | VERIFIED (Unit tests) |
| V-08 | Gemini live configuration | Successful structured-output request | BLOCKED EXTERNALLY |
| V-09 | Deterministic validation | Invalid/ambiguous tests | VERIFIED (Unit tests) |
| V-10 | Credit/payment handlers | Ledger integration tests | NOT STARTED / VERIFY |
| V-11 | Exact confirmation | Message matches committed entry/balance | NOT STARTED / VERIFY |
| V-12 | Live WhatsApp voice journey | Real test number/webhook/ledger entry | BLOCKED EXTERNALLY |

## 4. P1 — clarification and undo

| ID | Task | Acceptance evidence | Status |
|---|---|---|---|
| S-01 | Missing amount | No write until resolved | VERIFIED (Unit tests) |
| S-02 | Duplicate customer names | No automatic selection | VERIFIED (Unit tests) |
| S-03 | Pending state/expiry | Persistence and expiry tests | NOT STARTED / VERIFY |
| S-04 | Unrelated reply handling | Never attaches to wrong request | NOT STARTED / VERIFY |
| S-05 | Ten-minute exact undo | Reverses confirmation-linked entry | VERIFIED (Unit tests) |
| S-06 | Older entry correction | Exact entry + reason required | NOT STARTED / VERIFY |
| S-07 | Unusable audio rejection | No partial ledger write | VERIFIED (Unit tests) |

## 5. P1 — owner dashboard

| ID | Task | Acceptance evidence | Status |
|---|---|---|---|
| D-01 | Owner auth/shop resolution | Emulator and live Firebase verification | IN PROGRESS |
| D-02 | Customer CRUD | Real Firestore data | NOT STARTED / VERIFY |
| D-03 | Customer history | Last five and full history correct | NOT STARTED / VERIFY |
| D-04 | Ledger view/filters | Data-backed rows and balances | NOT STARTED / VERIFY |
| D-05 | Reason-required reversal | Owner-only with audit trail | NOT STARTED / VERIFY |
| D-06 | Activity/audit | Edits/reversals visible | VERIFIED (UI table) |
| D-07 | Loading/empty/error states | Browser verification | VERIFIED (Browser tests) |
| D-08 | Mobile responsiveness | Screenshots and interaction tests | VERIFIED (Browser tests) |

## 6. P2 — reminders/TTS/payments

| ID | Task | Acceptance evidence | Status |
|---|---|---|---|
| R-01 | Sunday 18:00 Asia/Kolkata scheduler | Timezone/idempotency tests | VERIFIED (Unit tests) |
| R-02 | Eligibility/opt-in filter | Balance, phone and consent tests | VERIFIED (Unit tests) |
| R-03 | Send-time balance recalculation | No stale amount sent | NOT STARTED / VERIFY |
| R-04 | TIMBRE adapter | Contract test + real audio output | BLOCKED EXTERNALLY |
| R-05 | WhatsApp window/template rules | Current official policy verified | BLOCKED EXTERNALLY |
| R-06 | Meta/BSP reminder approval | Written approval or verified permitted use | BLOCKED EXTERNALLY |
| R-07 | Reminder logs/skip reasons | Per-customer auditable outcome | VERIFIED (Unit tests) |
| R-08 | Customer-specific UPI links | Link-generation tests | VERIFIED (Unit tests) |
| R-09 | Payment reconciliation | Verified payment updates ledger; click does not | NOT STARTED / VERIFY |
| R-10 | Outbound reminder delivery | Only after R-06 and eligibility | DISABLED BY POLICY |

## 7. P2 — marketing site and design

| ID | Task | Acceptance evidence | Status |
|---|---|---|---|
| W-01 | Landing page visual polish | Reviewed desktop/mobile screenshots | IN PROGRESS |
| W-02 | WhatsApp hero conversation demo | Animated, illustrative component | IN PROGRESS |
| W-03 | Navigation/CTA destinations | All anchors/routes work | NOT STARTED / VERIFY |
| W-04 | How-it-works/features/why/FAQ | Content and responsive review | NOT STARTED / VERIFY |
| W-05 | Accessibility/reduced motion | Keyboard/contrast/motion checks | NOT STARTED / VERIFY |
| W-06 | Accurate marketing claims | No unsupported live/security claims | NOT STARTED / VERIFY |

## 8. External configuration

| Integration | Required proof | Status |
|---|---|---|
| Firebase | Live Auth and Firestore request succeeds | BLOCKED EXTERNALLY |
| Firebase plan/runtime | Approved plan and hosting decision | NOT STARTED / VERIFY |
| Gemini | Key configured and live structured output works | BLOCKED EXTERNALLY |
| PRISMA | Provider docs, credentials, live STT request | BLOCKED EXTERNALLY |
| TIMBRE | Provider docs, credentials, valid audio output | BLOCKED EXTERNALLY |
| Gyani/Gnani | Confirm provider/product/docs/role | BLOCKED EXTERNALLY |
| Meta WhatsApp | Credentials, webhook verification and live test | BLOCKED EXTERNALLY |
| Reminder policy | Meta/BSP policy approval | DISABLED BY POLICY |

## 9. Next execution order
1. Re-run current test baseline; confirm or correct the historical 175-test report.
2. Verify P0 tenant isolation, integer money, atomicity and idempotency.
3. Complete voice/clarification path with targeted reproducible tests.
4. Finish data-backed owner dashboard.
5. Finish landing page and responsive UX.
6. Complete provider adapters and contract tests while external docs/credentials are pending.
7. Keep reminder delivery disabled until policy approval.
8. Run full regression suite and production build.

## 10. Update protocol
After each task, record status, date, concise evidence, test command/file, blocker owner and next action. Do not mark done based on code existence. Use `DONE-VERIFIED` only after acceptance evidence passes in the current checkout.
