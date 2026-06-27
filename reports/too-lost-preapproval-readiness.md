# Too Lost Pre-Approval Readiness

Date: 2026-06-23

## Verdict

PASS for pre-approval infrastructure.

No live Too Lost API integration was performed. The framework is prepared for credentials after Too Lost app approval, with live calls gated by `TOO_LOST_SANDBOX_MODE=true` and `TOO_LOST_INTEGRATION_APPROVED=false`.

## Credential State

| Variable | Required after approval | Current state |
| --- | --- | --- |
| `TOO_LOST_CLIENT_ID` | yes | empty by design |
| `TOO_LOST_CLIENT_SECRET` | yes | empty by design |
| `TOO_LOST_WEBHOOK_SECRET` | yes | empty by design |
| `TOO_LOST_SANDBOX_MODE` | no | `true` |
| `TOO_LOST_INTEGRATION_APPROVED` | no | `false` |

Credential examples are present in root `.env.example` and `server/.env.example`; client ID, client secret, and webhook secret remain blank.

## Infrastructure Checklist

| Requirement | Status | Evidence |
| --- | --- | --- |
| Complete OAuth framework | PASS | `tooLostOAuth.ts` builds authorization URLs with PKCE, sandbox token exchange, live credential gate, scopes, state, and redirect URI support. Operations endpoints expose authorize and callback routes. |
| Provider configuration page | PASS | `AdminTooLostProviderPanel.tsx` is mounted under Admin -> Too Lost Provider and displays API URLs, redirect URI, webhook endpoint, credential status, sandbox mode, health checks, and sandbox runs. |
| Credential storage system | PASS | `distribution_provider_credentials` stores credential flags and secret references. `TooLostCredentialStore` persists pending records, OAuth state refs, token refs, health checks, and sandbox runs without writing raw client secrets. |
| Webhook endpoint framework | PASS | `/api/webhooks/too-lost` is registered in the operations server, verifies signatures when `TOO_LOST_WEBHOOK_SECRET` is present, rate-limits requests, normalizes supported release events, persists raw events, updates delivery status, and records state history through the SQL distribution store. |
| Provider health dashboard | PASS | Database tables, readiness view, operations health endpoint, and admin UI panel are present for status checks. |
| Release submission adapter interface | PASS | `ReleaseSubmissionAdapter` and `TooLostAdapter.submitRelease()` exist. Sandbox mode returns `SANDBOX_ACCEPTED` without live API calls. |
| Analytics sync adapter interface | PASS | `AnalyticsSyncAdapter` and `TooLostAdapter.syncAnalytics()` exist. Sandbox mode returns a prepared sync result without live API calls. |
| Sandbox testing mode | PASS | `TOO_LOST_SANDBOX_MODE=true` default, sandbox OAuth tokens, sandbox release submission, sandbox analytics sync, sandbox run table, admin buttons, and operations sandbox endpoint are present. |

## Database Objects

Pre-approval migration coverage:

- `distribution_provider_credentials`
- `distribution_provider_oauth_states`
- `distribution_provider_health_checks`
- `distribution_provider_sandbox_runs`
- `too_lost_provider_readiness` view
- `distribution_providers.sandbox_mode`
- `distribution_providers.live_approved`
- `distribution_providers.oauth_authorize_url`
- `distribution_providers.oauth_token_url`
- `distribution_providers.oauth_redirect_uri`
- `distribution_providers.webhook_endpoint_path`

RLS is enabled for credential, OAuth state, health, and sandbox tables. Credential and OAuth state management is restricted to `super_admin`.

## Live API Guardrails

- `TooLostAdapter.authenticate()` returns sandbox auth unless sandbox is disabled and live approval is enabled.
- Live token exchange requires `TOO_LOST_CLIENT_ID` and `TOO_LOST_CLIENT_SECRET`.
- Production validation errors if `TOO_LOST_INTEGRATION_APPROVED=true` while OAuth or webhook credentials are incomplete.
- Webhook signature verification is active when `TOO_LOST_WEBHOOK_SECRET` is configured.
- Raw token values are redacted in API responses; storage writes token references only.

## Verification

| Check | Result |
| --- | --- |
| TypeScript | PASS: `.\node_modules\.bin\tsc.cmd --noEmit` |
| Production build | PASS: `npm.cmd run build` |
| Credential env scan | PASS: requested Too Lost credential variables remain blank in examples |
| Live API integration | SKIPPED: explicitly out of scope while app request is pending |

Build notes: Vite reported existing large chunk warnings and stale Browserslist data. These are not Too Lost readiness blockers.

## Approval-Time Steps

After Too Lost approves the app:

1. Set `TOO_LOST_CLIENT_ID`, `TOO_LOST_CLIENT_SECRET`, and `TOO_LOST_WEBHOOK_SECRET`.
2. Set `TOO_LOST_OAUTH_REDIRECT_URI` to the approved callback URL.
3. Confirm Too Lost production authorize, token, webhook signature, release submission, and analytics endpoint contracts.
4. Keep `TOO_LOST_SANDBOX_MODE=true` for first credential validation.
5. Flip `TOO_LOST_INTEGRATION_APPROVED=true` only after OAuth callback and signed webhook replay pass.
6. Disable sandbox mode only for the first approved live smoke test.
