# Too Lost OAuth Debug

## Root Cause
- Primary issue: environment variable name mismatch.
  - Configured values exist in `.env` as `TOO_LOST_API_BASE_URL`, `TOO_LOST_AUTHORIZE_URL`, `TOO_LOST_TOKEN_URL`, and `TOO_LOST_REDIRECT_URI`.
  - The OAuth implementation reads `TOO_LOST_API_URL`, `TOO_LOST_OAUTH_AUTHORIZE_URL`, `TOO_LOST_OAUTH_TOKEN_URL`, and `TOO_LOST_OAUTH_REDIRECT_URI`.
  - Result: the live Too Lost URLs from `.env` are not being used by the OAuth code path.
- Secondary issue: redirect URI mismatch.
  - Configured redirect URI: `https://app.tracksyra.com/auth/toolost/callback`
  - Server callback route that actually exists: `/api/distribution/too-lost/oauth/callback`
  - The configured URI does not map to a route in `src/App.tsx`, so the provider callback cannot complete end-to-end.
- Scope/API limitation:
  - No documented, verified Too Lost endpoint was available in the accessible docs for connected-account/profile retrieval, so that step is intentionally unimplemented unless a documented URL is provided.

## OAuth Authorization
- Exact HTTP request URL:
  - Local request: `GET /api/distribution/too-lost/oauth/authorize?returnTo=/dashboard`
  - Intended upstream request was not emitted because authorization URL generation aborted.
- HTTP status code:
  - `500`
- Response body:
  - `{ "error": "INTERNAL_ERROR", "traceId": "<masked>" }`
- Error message:
  - `Too Lost OAuth redirect URI is required.`
- Root cause:
  - `readTooLostConfig()` does not read `TOO_LOST_REDIRECT_URI`; it expects `TOO_LOST_OAUTH_REDIRECT_URI`.
  - `readTooLostConfig()` also does not read `TOO_LOST_AUTHORIZE_URL`; it expects `TOO_LOST_OAUTH_AUTHORIZE_URL`.

## Authorization Callback
- Exact HTTP request URL:
  - `GET https://app.tracksyra.com/auth/toolost/callback?code=<masked>&state=<masked>`
- HTTP status code:
  - `404` if the browser lands on the frontend application
  - No server callback hit at that URL because no route exists there
- Response body:
  - Frontend SPA `NotFound` response for `/auth/toolost/callback`
- Error message:
  - No callback handler exists at the configured redirect URI.
- Root cause:
  - The redirect URI configured in `.env` does not match the actual callback route in the app/server.
  - The server callback route exists only at `/api/distribution/too-lost/oauth/callback`.

## Token Exchange
- Exact HTTP request URL:
  - `POST https://api.toolost.com/oauth/token`
  - Form body would be:
    - `grant_type=authorization_code`
    - `code=<masked>`
    - `code_verifier=<masked>`
    - `redirect_uri=<configured redirect uri>`
    - `client_id=<masked>`
    - `client_secret=<server-side only>`
- HTTP status code:
  - Not reached in live flow because the callback never completes successfully.
- Response body:
  - None captured from Too Lost
- Error message:
  - Token exchange is blocked by the callback/redirect mismatch and by the env-name mismatch for the token URL.
- Root cause:
  - The code uses `TOO_LOST_OAUTH_TOKEN_URL`, but the configured env provides `TOO_LOST_TOKEN_URL`.
  - The exchange cannot run until the callback returns a valid `code` and `state`.

## Token Refresh
- Exact HTTP request URL:
  - `POST https://api.toolost.com/oauth/token`
  - Form body would be:
    - `grant_type=refresh_token`
    - `refresh_token=<masked>`
    - `client_id=<masked>`
    - `client_secret=<server-side only>`
- HTTP status code:
  - Not reached in live flow because no refresh token is stored from a successful exchange.
- Response body:
  - None captured from Too Lost
- Error message:
  - No refresh token is available because token exchange did not complete.
- Root cause:
  - Downstream failure from callback/exchange.
  - The token URL env name mismatch also means the configured token URL is not being used.

## Connected Account Retrieval
- Exact HTTP request URL:
  - Not sent by default.
  - The code only performs a profile request if `TOO_LOST_ACCOUNT_PROFILE_URL` is configured.
- HTTP status code:
  - Not reached
- Response body:
  - None
- Error message:
  - No documented profile endpoint is configured or verified.
- Root cause:
  - Configuration is missing `TOO_LOST_ACCOUNT_PROFILE_URL`.
  - The implementation intentionally avoids assuming an undocumented profile endpoint.

## Verification Checklist
1. Redirect URI exactly matches the Too Lost developer portal.
   - FAIL
   - The configured URI does not match the route that exists in the app/server.
2. Client ID is being sent.
   - FAIL for live verification
   - The client ID is present in `.env`, but the authorization request aborts before an outbound URL is generated.
3. Client Secret is only used server-side.
   - PASS
4. Authorization URL matches the Too Lost documentation.
   - FAIL / not verifiable from accessible docs
   - The code uses OAuth Authorization Code + PKCE, but the configured URL is not being applied because of env-name mismatch.
5. Token URL matches the Too Lost documentation.
   - FAIL / not verifiable from accessible docs
   - The code expects `TOO_LOST_OAUTH_TOKEN_URL`; the configured env provides `TOO_LOST_TOKEN_URL`.
6. OAuth uses Authorization Code Grant.
   - PASS
7. State parameter validation.
   - PASS
8. Callback route accessibility.
   - FAIL
   - The configured redirect URI does not point at an implemented callback route.
9. Required request headers.
   - PASS in code
   - Token exchange uses `Accept: application/json` and `Content-Type: application/x-www-form-urlencoded`.
10. Required Content-Type.
   - PASS in code
   - Browser-facing API calls use `application/json`; token exchange uses `application/x-www-form-urlencoded`.

## Files Requiring Changes
- `server/src/distribution/providers/too-lost/tooLostOAuth.ts`
- `server/src/http/operationsServer.ts`
- `src/lib/tooLostApi.ts`
- `src/App.tsx`
- `server/.env.example`
- `.env.example`

## Required Configuration Changes
- Align env names with the implementation or update the implementation to accept both sets:
  - `TOO_LOST_API_URL` or `TOO_LOST_API_BASE_URL`
  - `TOO_LOST_OAUTH_AUTHORIZE_URL` or `TOO_LOST_AUTHORIZE_URL`
  - `TOO_LOST_OAUTH_TOKEN_URL` or `TOO_LOST_TOKEN_URL`
  - `TOO_LOST_OAUTH_REDIRECT_URI` or `TOO_LOST_REDIRECT_URI`
- Make the configured redirect URI match the actual callback route that can receive the provider redirect.
- If the provider requires a public callback URL, register the exact public URL in the Too Lost developer application.

## Required Code Changes
- Read the configured Too Lost env variable names used by the production environment.
- Ensure the auth URL is built from the configured authorization endpoint instead of the default fallback.
- Ensure the token exchange and refresh URL are built from the configured token endpoint instead of the default fallback.
- Ensure the configured redirect URI matches the route that actually handles the callback.
- Keep server-side token exchange only and preserve state validation.

## Issue Classification
- Configuration: Yes
- OAuth implementation: Yes
- Too Lost application settings: Yes
- Too Lost API limitation: Yes, for connected-account/profile retrieval only
