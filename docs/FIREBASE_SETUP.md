# Firebase setup and operations

## Current state

The original project was an empty React/Vite frontend. No Firebase SDK, rules, server,
or backend credentials were configured. This implementation uses Firebase only:

- Firebase Web SDK: Authentication and read-only, shop-scoped Cloud Firestore access.
- Firebase Admin SDK: trusted Node.js API for all mutations and ledger tools.
- Firestore transactions: financial entry + balance + audit + idempotency + reversal.
- No analytics, Cloud Functions, Storage, scheduler, payment links, or provider network calls.
- No billing enabled, infrastructure created, rules published, or services deployed by this change.

The supplied **public web config** is the default in `src/lib/firebase.ts`.
It is not an Admin credential. Environment variables can override it for other environments.
SDK initialization does not establish that Auth providers, Firestore, rules or indexes
have been configured in the console.

## 1. Console checklist (manual)

- [ ] Select the intended Firebase project, currently `udhar-khata-f41fb`.
- [ ] Remain on the Spark plan. Do not upgrade or enable billing without approval.
- [x] Authentication → Sign-in method → **Google** provider enabled for project `udhar-khata-f41fb`.
- [ ] Authentication → Settings → Authorized domains → confirm the exact preview/production host.
  The live SDK redirect accepts `localhost`; `127.0.0.1` is rejected, so use `localhost` for local sign-in.
- [ ] Sign in with the owner's Google account, then provision that Auth UID to a shop.
- [ ] Create Cloud Firestore in **production mode**, choose its region deliberately, and review residency/privacy needs.
- [ ] Review and publish `firestore.rules`. Never use test-mode public access rules.
- [ ] Create the indexes in `firestore.indexes.json`.
- [ ] Run local tests against an emulator, not production.
- [ ] Arrange a trusted Node.js API runtime. Hosting/deployment and any paid services need separate approval.
- [ ] Provision owner membership using the administrator command below.
- [ ] Configure the frontend API URL and exact allowed origin.
- [ ] Configure a real human support contact before any WhatsApp launch.

Email/Password is intentionally disabled; the frontend uses Google sign-in. Phone OTP is
**not implemented or enabled**. There is no public signup-to-shop flow and no client ability
to choose its tenant.

## 2. Environment variables

Frontend variables are public and bundled by Vite. Never put privileged secrets in them.

| Variable                      | Purpose                                                                         |
| ----------------------------- | ------------------------------------------------------------------------------- |
| `VITE_FIREBASE_API_KEY`       | Optional override of supplied public web API key                                |
| `VITE_FIREBASE_AUTH_DOMAIN`   | Optional public Firebase Auth domain override                                   |
| `VITE_FIREBASE_PROJECT_ID`    | Optional public project ID override                                             |
| `VITE_FIREBASE_APP_ID`        | Optional public web app ID override                                             |
| `VITE_API_BASE_URL`           | HTTPS origin of the separately hosted trusted API, **no `/api` suffix**         |
| `VITE_USE_FIREBASE_EMULATORS` | Local only: set `true` to use Auth `127.0.0.1:9099`, Firestore `127.0.0.1:8181` |

Storage bucket, sender ID and measurement ID are not consumed: those services are not used.

Server variables must be supplied to the **server process**, not Make's public web config.

| Variable                         | Purpose                                                                                                                  |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `FIREBASE_PROJECT_ID`            | Required: same project as the frontend                                                                                   |
| `GOOGLE_APPLICATION_CREDENTIALS` | Local/server path to a service-account JSON file outside the repository; prefer workload identity/ADC on supported hosts |
| `ALLOWED_ORIGIN`                 | Required: exact frontend origin for CORS (no path or wildcard)                                                           |
| `API_PORT`                       | Optional, defaults to `3001`                                                                                             |
| `NODE_ENV`                       | Set `production` on production server                                                                                    |
| `FIRESTORE_EMULATOR_HOST`        | Local tests only: `127.0.0.1:8181`                                                                                       |
| `FIREBASE_AUTH_EMULATOR_HOST`    | Local tests only: `127.0.0.1:9099`                                                                                       |
| `GNANI_API_KEY`                  | One private, shared Gnani key, consumed only by the Node.js API and future Gnani adapters                                |
| `APP_GEMINI_API_KEY`             | Private Gemini Developer API key for the future LLM action parser; no fallback to host/sandbox credentials               |

No service-account key is supplied, stored, generated, or requested in the frontend.
Use a narrowly scoped backend service account. Admin SDK bypasses Security Rules:
never hand its credentials to a browser. Secure the host, restrict IAM to the
intended project, and rotate leaked keys.

## 3. Start the API (operator action, not performed automatically)

The existing Vite server remains managed by the preview platform.
The API is a separate process. On a trusted local machine:

```sh
export FIREBASE_PROJECT_ID=udhar-khata-f41fb
export GOOGLE_APPLICATION_CREDENTIALS=/secure/path/service-account.json
export ALLOWED_ORIGIN=http://localhost:8443
pnpm api
```

The process binds loopback by design. Put it behind a TLS reverse proxy on its
host; do not expose unencrypted bearer tokens. Set the frontend's
`VITE_API_BASE_URL` to the approved HTTPS API origin.
No Vite proxy or frontend import of Admin code is used.

Provision an **existing Auth UID** (not an email address), once:

```sh
pnpm provision:owner <existing-auth-uid> "Your Shop Name"
```

This explicitly writes one shop and its trusted owner membership. It refuses to
replace existing membership. Do not run it against a live project without intent.
For local tests use a `demo-` project and emulator variables.

## 4. Firestore structure

```text
owners/{authUid}
  shopId, role: "owner", active, createdAt, lastLedgerWriteAt

shops/{shopId}
  name, active, language, timezone, remindersEnabled: false,
  policyGate: "NOT_APPROVED", createdAt

  customers/{customerId}
    shopId, name, displayLabel, phone?, active,
    balancePaise, createdAt, updatedAt

  ledgerEntries/{entryId}
    shopId, customerId, type: credit | payment | reversal,
    signedAmountPaise, notes, createdBy, createdAt, source,
    reversesEntryId?, reason?

  reversals/{originalEntryId}
    shopId, originalEntryId, reversalEntryId, reason, createdBy, createdAt

  auditLogs/{auditId}
    shopId, action, actorId, targetId, customerId?,
    before?, after?, createdAt

  reminderPreferences/{customerId}
    shopId, customerId, status: "unknown", optedInAt: null, optedOutAt: null

  operations/{sha256(ownerUid + idempotencyKey)}
    shopId, fingerprint, result, actorId, createdAt
```

All amounts are **safe JavaScript integers in paise**, validated on the server.
There are no float-based rupee mutations. Firestore's wider int64 range must not
be used beyond `Number.MAX_SAFE_INTEGER` in this JavaScript implementation.

Customer balance is a materialized sum updated only in the same transaction as
the new entry. Originals are **fully immutable**, including status: reversal
state lives in `reversals/{originalId}`. This is intentionally stricter than
mutating the original entry's status. Originals and reversals both contribute
to the sum. The unique reversal document prevents double reversal.

The customer document serializes concurrent updates. Owner documents are also
updated on financial writes to serialize `undo_last` with concurrent new entries.
Every transaction re-reads owner membership and shop activity, so it cannot trust
a client-provided shop ID. Operations have request fingerprints to reject a reused
key with changed arguments. Retain operation records as long as retries are possible.

Rules are in **`firestore.rules`**:

- Only active owners may read their matching active shop.
- Own membership: get only, no listing or writes.
- Read access only to customers, ledger, audits, reversal metadata and reminder preferences.
- No client mutations at all; no client access to operation records.
- Unknown paths, collection-group reads, cross-shop access and anonymous access denied.

Rules do **not** constrain Admin credentials. Membership checks and shop scoping
in `server/ledger.ts` are mandatory. Cloud administrators can still alter data:
use IAM controls, backups and external audit retention before production.

## 5. API and ledger tools

All `/api` routes require `Authorization: Bearer <Firebase ID token>`.
Tokens are verified with revocation checking. Tenant is resolved from `owners/{uid}`.
Mutating POST actions require `Idempotency-Key: <8–128 alphanumeric/dash/underscore characters>`.
Read-only `get_balance` and `find_entries` actions do not require a key.

```text
GET  /health                    Process liveness only
GET  /api/connection            Verify token, owner membership and shop access
POST /api/customers             name, displayLabel?, phone? (E.164)
POST /api/ledger/actions        One strictly validated action
```

Supported action bodies:

```json
{ "action": "add_credit", "customerId": "...", "amountPaise": 34000, "notes": "" }
{ "action": "add_payment", "customerId": "...", "amountPaise": 20000, "notes": "" }
{ "action": "get_balance", "customerId": "..." }
{ "action": "find_entries", "customerId": "...", "dateFrom": "2026-11-01T00:00:00Z", "amountPaise": 34000 }
{ "action": "undo_last", "reason": "Wrong amount" }
{ "action": "undo_entry", "entryId": "...", "reason": "Wrong amount" }
```

`find_entries` supports optional `customerId`, `amountPaise`, `dateFrom`,
`dateTo`, `cursor`, returns at most five records plus `nextCursor`.
Dates and displayed timestamps use IST where indicated.
`get_balance` returns the transactionally maintained balance plus the last five entries.
The exact-entry reversal endpoint is an **owner dashboard** operation; a future
WhatsApp adapter must additionally enforce reply-to / prior-search provenance.
No model can call the Admin SDK directly.

Amounts above ₹1,00,000 require `confirmLargeAmount: true`. Payments above the
balance require `confirmAdvance: true`. Both default false. Plain `undo_last`
only succeeds for exactly one unreversed owner entry in the previous ten minutes.
Otherwise it asks the caller to choose an exact entry. Reversals cannot be reversed.
There is no delete endpoint and no destructive UI.

## 6. Local verification

Requirements: Node 22, pnpm and Java 21+ for the current Firestore emulator.
These commands do not deploy or need Firebase login/billing:

```sh
pnpm typecheck
pnpm test
pnpm exec firebase emulators:exec --only auth,firestore --project demo-udhaar-test "pnpm test:emulators"
pnpm build
```

The emulator test suite refuses to run without emulator host variables and
hardcodes a **demo** project ID. It covers rules, cross-shop reads/writes,
inactive identities, financial arithmetic, duplicate requests, concurrency,
double reversal, immutable originals, invalid-operation atomicity, pagination
and customer creation with no opt-in. HTTP API tests additionally verify real
Auth emulator ID tokens, invalid tokens and revoked membership.

For end-to-end local login, run Auth and Firestore emulators, create a test user
using the Auth emulator, provision it with matching emulator variables and
`FIREBASE_PROJECT_ID=demo-udhaar-test`, then use public frontend env overrides
with that same demo project and `VITE_USE_FIREBASE_EMULATORS=true`.

Live connection checks (read-only except login session):

1. Open preview and choose **Sign in as owner**.
2. Authenticate using the provisioned owner's Google account.
3. Confirm the shop name appears and real Firestore data loads (empty is valid).
4. Connections → **Verify API connection** checks the separate authenticated API.
5. Repeat with a second shop and verify the emulator tests before trusting isolation.
6. Only with explicit intent, add a test customer, credit ₹340 and payment ₹50.50;
   check balance ₹289.50, reverse once with a reason, and inspect both audit records.
7. Verify that loaded ledger CSV exports are clearly page-scoped, not full-history claims.

## 7. Provider and reminder gate

`server/adapters.ts` defines contracts and a server-only registry for WhatsApp,
PRISMA, EVON, TIMBRE, Gnani (correcting the original "Gyani" placeholder), and Gemini for the LLM parser. Every provider adapter is unconfigured by default.
No endpoints, credentials, languages or auth schemes are guessed.
Register a verified implementation only after documentation, privacy and cost review.
The registry is an interface boundary, not a working transcription/LLM integration.
Do not call `add_credit` directly with unvalidated model output: future voice
orchestration must independently validate amount evidence, customer candidates,
clarification state, webhook signatures and WhatsApp idempotency.

### Gnani environment

The shared key is stored under **`GNANI_API_KEY`**. Do not create
`VITE_GNANI_API_KEY`, put it in Firebase web configuration, or store it in
Firestore. No separate key is required in this app for each future Gnani model.
Model availability and which capabilities the account permits still require
the vendor's documentation; no model identifiers or API URLs are guessed.

`server/gnani-config.ts` reads the key only on the server and reports only
credential presence. It does not initialize a provider or make a network request.
`GET /api/connection` includes Gnani's `credentialsConfigured` boolean and
`missing_credentials` / `awaiting_documentation` state while `configured` remains
false until a real adapter is registered. The Connections screen displays this
status only after an authenticated API verification.

The separate Node.js API must receive the secret in **its own environment**.
A saved Make secret does not prove that an externally hosted API inherited it.
Use the server host's secret manager or an ignored local `.env.local` file.
The `pnpm api` and `pnpm check:gnani-env` scripts load optional `.env` then
`.env.local` files using Node 22; existing process environment variables take
precedence. Do not commit these files or paste the key into a command argument.

Run on the API host:

```sh
pnpm check:gnani-env
```

This prints only credential presence, readiness state and `modelCallsEnabled: false`.
It exits nonzero if the API process cannot see a nonempty `GNANI_API_KEY`.
Successful detection is **not** vendor authentication or a model-access test.
Provide the Gnani API documentation (authentication, endpoints, model identifiers
and request/response formats) before implementing adapters. Key configuration
does not enable billing, paid calls, deployment, or reminders.

### Gemini LLM environment

The Gemini secret is stored as **`APP_GEMINI_API_KEY`**. The application reads only
that exact server environment variable. It deliberately ignores `GEMINI_API_KEY`,
`GOOGLE_API_KEY`, and all `VITE_` key variants to avoid using host/sandbox credentials
or exposing the secret in the browser. Gnani continues to use its independent key.

`server/gemini-config.ts` provides server-only key access and a safe presence status.
`GET /api/connection` reports `credentialsConfigured` without the secret, and
`awaiting_model_selection` when a key is present. A key alone does not enable
Gemini calls, register a model adapter, or authorize ledger writes.

On the separate Node.js API host, inject the saved secret through its secret manager
or ignored `.env.local`, then run:

```sh
pnpm check:gemini-env
```

Like the Gnani check, this loads optional `.env` and `.env.local` files, prints
only safe metadata and exits nonzero when credentials are absent. It makes no
provider requests and does not authenticate the key with Google. A saved Make
secret is not proof that the separate API runtime has received it.

The next integration step requires confirming the exact Gemini model ID available
to your account and its usage/cost constraints. No model ID, provider endpoint,
or default to paid calls is selected by this environment setup.
The future LLM parser must return one schema-valid proposal; the existing
deterministic validation and shop-scoped transaction service remain the only
authority for ledger writes. Reminders remain disabled.

Reminders are hard-disabled with a frozen `NOT_APPROVED` policy and no sending job.
Changing a Firestore field cannot enable them. Written Meta/BSP approval, consent
handling, opt-out enforcement, delivery windows and template review are required
before a separate implementation is authorized.

## 8. Production work still required

- Hosting, TLS, real Admin identity, Auth provider enablement, actual rules/index publication.
- Approved account recovery/support, privacy notice, retention and deletion policy.
- Backup/restore drill, scheduled balance-to-ledger reconciliation and alerting.
- Shared edge/API rate limiting before more than one API process (current guard is per-process).
- Load testing, monitoring, IAM review and independent security review.
- Full WhatsApp/AI pipeline, transcript evidence validation and clarification state machine.
- No production readiness or PRD acceptance metrics are claimed by this backend foundation.
