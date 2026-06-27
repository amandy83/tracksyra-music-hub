# Too Lost Provider Sync Verification

## Provider Row Before

- `provider`: `too_lost`
- `is_enabled`: `false`
- `live_approved`: `false`
- `sandbox_mode`: `true`
- `oauth_redirect_uri`: `null`
- `oauth_authorize_url`: populated
- `oauth_token_url`: populated

## Provider Row After Startup Sync

- `provider`: `too_lost`
- `is_enabled`: `true`
- `live_approved`: `false`
- `sandbox_mode`: `true`
- `oauth_redirect_uri`: `https://app.tracksyra.com/auth/toolost/callback`
- `oauth_authorize_url`: preserved/populated from config or existing row
- `oauth_token_url`: preserved/populated from config or existing row

## Environment Source

- `TOO_LOST_REDIRECT_URI`: `https://app.tracksyra.com/auth/toolost/callback`
- `TOO_LOST_CLIENT_ID`: present
- `TOO_LOST_CLIENT_SECRET`: present
- `TOO_LOST_WEBHOOK_SECRET`: missing
- `TOO_LOST_TOKEN_ENCRYPTION_KEY`: missing

## Enabled Status

- `is_enabled` is set from the presence of valid OAuth credentials.
- With `TOO_LOST_CLIENT_ID`, `TOO_LOST_CLIENT_SECRET`, and `TOO_LOST_REDIRECT_URI` present, the startup sync marks the provider enabled.

## Readiness

- OAuth connection readiness: partial.
- OAuth redirect URI is now loaded from environment and written to the provider row.
- Live approval remains unchanged at `false`.
- The provider row is synchronized automatically during startup via `TooLostCredentialStore.syncProviderConfiguration()`.
