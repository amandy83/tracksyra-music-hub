# Too Lost Live Production Verification

Date: 2026-06-23

## Final Verdict

FAIL

Readiness score: 0/100

## Credential State

| Credential | State |
| --- | --- |
| TOO_LOST_API_KEY | missing |
| TOO_LOST_API_URL | https://api.toolost.com |
| TOO_LOST_WEBHOOK_SECRET | missing |
| SUPABASE_URL | present |
| SUPABASE_SERVICE_ROLE_KEY | present |

## API Connectivity

```json
[
  {
    "name": "Too Lost health endpoint",
    "request": {
      "method": "GET",
      "url": "https://api.toolost.com/health",
      "headers": {
        "Accept": "application/json"
      },
      "authHeaderPresent": false
    },
    "response": {
      "ok": false,
      "status": 404,
      "statusText": "Not Found",
      "responseTimeMs": 6333,
      "body": {
        "message": "The route health could not be found."
      }
    }
  },
  {
    "name": "Too Lost authenticated health",
    "skipped": true,
    "reason": "TOO_LOST_API_KEY is missing from .env.",
    "request": {
      "method": "GET",
      "url": "https://api.toolost.com/health",
      "authHeaderPresent": false
    }
  }
]
```

## Release Submission Test

Result: FAIL

Requested test release:

```json
{
  "title": "TrackSyra Test Release",
  "artist": "TrackSyra Test Artist"
}
```

No external release ID was returned because live Too Lost credentials are not configured.

## Artwork Upload Test

Result: FAIL

No artwork asset ID was returned because live Too Lost credentials are not configured.

## Audio Upload Test

Result: FAIL

No provider track ID was returned because live Too Lost credentials are not configured.

## Delivery Pipeline

Result: FAIL

No provider processing state could be observed without a submitted Too Lost release.

## Webhook Verification

Result: FAIL

Required events were not triggered against a live provider:

- approved
- rejected
- processing
- delivered
- live

## Dashboard Verification

Database-backed dashboard visibility evidence:

```json
{
  "artistDashboard": {
    "ok": false,
    "error": "TypeError: fetch failed",
    "details": "TypeError: fetch failed\n\nCaused by: Error: getaddrinfo ENOTFOUND yunasnnycedmexvbogbf.supabase.co (ENOTFOUND)\nError: getaddrinfo ENOTFOUND yunasnnycedmexvbogbf.supabase.co\n    at GetAddrInfoReqWrap.onlookupall [as oncomplete] (node:dns:122:26)",
    "hint": ""
  },
  "adminDashboard": {
    "ok": false,
    "error": "TypeError: fetch failed",
    "details": "TypeError: fetch failed\n\nCaused by: Error: getaddrinfo ENOTFOUND yunasnnycedmexvbogbf.supabase.co (ENOTFOUND)\nError: getaddrinfo ENOTFOUND yunasnnycedmexvbogbf.supabase.co\n    at GetAddrInfoReqWrap.onlookupall [as oncomplete] (node:dns:122:26)",
    "hint": ""
  }
}
```

## Failure Recovery

Result: FAIL

Invalid metadata, missing artwork, and duplicate ISRC tests require live Too Lost validation calls.

## Database Evidence

```json
{
  "distributionProvider": {
    "ok": false,
    "error": "TypeError: fetch failed",
    "details": "TypeError: fetch failed\n\nCaused by: Error: getaddrinfo ENOTFOUND yunasnnycedmexvbogbf.supabase.co (ENOTFOUND)\nError: getaddrinfo ENOTFOUND yunasnnycedmexvbogbf.supabase.co\n    at GetAddrInfoReqWrap.onlookupall [as oncomplete] (node:dns:122:26)",
    "hint": ""
  },
  "recentJobs": {
    "ok": false,
    "error": "TypeError: fetch failed",
    "details": "TypeError: fetch failed\n\nCaused by: Error: getaddrinfo ENOTFOUND yunasnnycedmexvbogbf.supabase.co (ENOTFOUND)\nError: getaddrinfo ENOTFOUND yunasnnycedmexvbogbf.supabase.co\n    at GetAddrInfoReqWrap.onlookupall [as oncomplete] (node:dns:122:26)",
    "hint": ""
  },
  "recentSyncLogs": {
    "ok": false,
    "error": "TypeError: fetch failed",
    "details": "TypeError: fetch failed\n\nCaused by: Error: getaddrinfo ENOTFOUND yunasnnycedmexvbogbf.supabase.co (ENOTFOUND)\nError: getaddrinfo ENOTFOUND yunasnnycedmexvbogbf.supabase.co\n    at GetAddrInfoReqWrap.onlookupall [as oncomplete] (node:dns:122:26)",
    "hint": ""
  },
  "recentEvents": {
    "ok": false,
    "error": "TypeError: fetch failed",
    "details": "TypeError: fetch failed\n\nCaused by: Error: getaddrinfo ENOTFOUND yunasnnycedmexvbogbf.supabase.co (ENOTFOUND)\nError: getaddrinfo ENOTFOUND yunasnnycedmexvbogbf.supabase.co\n    at GetAddrInfoReqWrap.onlookupall [as oncomplete] (node:dns:122:26)",
    "hint": ""
  },
  "artistDashboard": {
    "ok": false,
    "error": "TypeError: fetch failed",
    "details": "TypeError: fetch failed\n\nCaused by: Error: getaddrinfo ENOTFOUND yunasnnycedmexvbogbf.supabase.co (ENOTFOUND)\nError: getaddrinfo ENOTFOUND yunasnnycedmexvbogbf.supabase.co\n    at GetAddrInfoReqWrap.onlookupall [as oncomplete] (node:dns:122:26)",
    "hint": ""
  },
  "adminDashboard": {
    "ok": false,
    "error": "TypeError: fetch failed",
    "details": "TypeError: fetch failed\n\nCaused by: Error: getaddrinfo ENOTFOUND yunasnnycedmexvbogbf.supabase.co (ENOTFOUND)\nError: getaddrinfo ENOTFOUND yunasnnycedmexvbogbf.supabase.co\n    at GetAddrInfoReqWrap.onlookupall [as oncomplete] (node:dns:122:26)",
    "hint": ""
  }
}
```

## Blockers

- `TOO_LOST_API_KEY` is missing from `.env`.
- `TOO_LOST_API_URL` is missing from `.env`; default fallback was used for reachability only.
- `TOO_LOST_WEBHOOK_SECRET` is missing from `.env`, so live webhook signature verification cannot be validated.
- No actual Too Lost release ID, artwork asset ID, audio track ID, or webhook payload can be produced without provider credentials.

## Raw Evidence

```json
{
  "generatedAt": "2026-06-23T08:39:54.385Z",
  "environment": {
    "tooLostApiKeyPresent": false,
    "tooLostApiUrl": "https://api.toolost.com",
    "tooLostWebhookSecretPresent": false,
    "supabaseUrlPresent": true,
    "supabaseServiceRolePresent": true
  },
  "apiConnectivity": [
    {
      "name": "Too Lost health endpoint",
      "request": {
        "method": "GET",
        "url": "https://api.toolost.com/health",
        "headers": {
          "Accept": "application/json"
        },
        "authHeaderPresent": false
      },
      "response": {
        "ok": false,
        "status": 404,
        "statusText": "Not Found",
        "responseTimeMs": 6333,
        "body": {
          "message": "The route health could not be found."
        }
      }
    },
    {
      "name": "Too Lost authenticated health",
      "skipped": true,
      "reason": "TOO_LOST_API_KEY is missing from .env.",
      "request": {
        "method": "GET",
        "url": "https://api.toolost.com/health",
        "authHeaderPresent": false
      }
    }
  ],
  "database": {
    "distributionProvider": {
      "ok": false,
      "error": "TypeError: fetch failed",
      "details": "TypeError: fetch failed\n\nCaused by: Error: getaddrinfo ENOTFOUND yunasnnycedmexvbogbf.supabase.co (ENOTFOUND)\nError: getaddrinfo ENOTFOUND yunasnnycedmexvbogbf.supabase.co\n    at GetAddrInfoReqWrap.onlookupall [as oncomplete] (node:dns:122:26)",
      "hint": ""
    },
    "recentJobs": {
      "ok": false,
      "error": "TypeError: fetch failed",
      "details": "TypeError: fetch failed\n\nCaused by: Error: getaddrinfo ENOTFOUND yunasnnycedmexvbogbf.supabase.co (ENOTFOUND)\nError: getaddrinfo ENOTFOUND yunasnnycedmexvbogbf.supabase.co\n    at GetAddrInfoReqWrap.onlookupall [as oncomplete] (node:dns:122:26)",
      "hint": ""
    },
    "recentSyncLogs": {
      "ok": false,
      "error": "TypeError: fetch failed",
      "details": "TypeError: fetch failed\n\nCaused by: Error: getaddrinfo ENOTFOUND yunasnnycedmexvbogbf.supabase.co (ENOTFOUND)\nError: getaddrinfo ENOTFOUND yunasnnycedmexvbogbf.supabase.co\n    at GetAddrInfoReqWrap.onlookupall [as oncomplete] (node:dns:122:26)",
      "hint": ""
    },
    "recentEvents": {
      "ok": false,
      "error": "TypeError: fetch failed",
      "details": "TypeError: fetch failed\n\nCaused by: Error: getaddrinfo ENOTFOUND yunasnnycedmexvbogbf.supabase.co (ENOTFOUND)\nError: getaddrinfo ENOTFOUND yunasnnycedmexvbogbf.supabase.co\n    at GetAddrInfoReqWrap.onlookupall [as oncomplete] (node:dns:122:26)",
      "hint": ""
    },
    "artistDashboard": {
      "ok": false,
      "error": "TypeError: fetch failed",
      "details": "TypeError: fetch failed\n\nCaused by: Error: getaddrinfo ENOTFOUND yunasnnycedmexvbogbf.supabase.co (ENOTFOUND)\nError: getaddrinfo ENOTFOUND yunasnnycedmexvbogbf.supabase.co\n    at GetAddrInfoReqWrap.onlookupall [as oncomplete] (node:dns:122:26)",
      "hint": ""
    },
    "adminDashboard": {
      "ok": false,
      "error": "TypeError: fetch failed",
      "details": "TypeError: fetch failed\n\nCaused by: Error: getaddrinfo ENOTFOUND yunasnnycedmexvbogbf.supabase.co (ENOTFOUND)\nError: getaddrinfo ENOTFOUND yunasnnycedmexvbogbf.supabase.co\n    at GetAddrInfoReqWrap.onlookupall [as oncomplete] (node:dns:122:26)",
      "hint": ""
    }
  },
  "checks": [
    {
      "name": "Release Submission Test",
      "result": "FAIL",
      "reason": "TOO_LOST_API_KEY is missing from .env.",
      "blocker": "Requires valid TOO_LOST_API_KEY and confirmed Too Lost release-submission sandbox/production endpoint."
    },
    {
      "name": "Artwork Upload Test",
      "result": "FAIL",
      "reason": "TOO_LOST_API_KEY is missing from .env.",
      "blocker": "Requires valid TOO_LOST_API_KEY and provider artwork upload endpoint."
    },
    {
      "name": "Audio Upload Test",
      "result": "FAIL",
      "reason": "TOO_LOST_API_KEY is missing from .env.",
      "blocker": "Requires valid TOO_LOST_API_KEY and provider audio upload endpoint."
    },
    {
      "name": "Delivery Pipeline",
      "result": "FAIL",
      "reason": "TOO_LOST_API_KEY is missing from .env.",
      "blocker": "Requires a submitted provider release ID from Too Lost."
    },
    {
      "name": "Webhook Verification",
      "result": "FAIL",
      "reason": "TOO_LOST_API_KEY is missing from .env.",
      "blocker": "Requires Too Lost webhook delivery or documented event replay endpoint."
    },
    {
      "name": "Failure Recovery",
      "result": "FAIL",
      "reason": "TOO_LOST_API_KEY is missing from .env.",
      "blocker": "Requires live provider validation calls for invalid metadata, missing artwork, and duplicate ISRC."
    }
  ]
}
```
