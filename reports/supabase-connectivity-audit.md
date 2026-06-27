# Supabase Connectivity Audit

Generated: 2026-06-23T12:25:55.617Z

## Final Status

- DNS: PASS
- AUTH: PASS
- REST: PASS
- DATABASE: PASS

## Actual Runtime Values

Runtime precedence follows `server/src/config/envLoader.ts`: existing `process.env`, then `.env`, then `.env.local`, then `server/.env`. `server/.env.local` is checked in this audit because it was requested, but the runtime loader does not currently load it.

| Key | Configured value |
| --- | --- |
| SUPABASE_URL | https://busmtpthvtugdesnamho.supabase.co |
| VITE_SUPABASE_URL | https://busmtpthvtugdesnamho.supabase.co |
| SUPABASE_ANON_KEY | sb_publ...GBqDYY |
| VITE_SUPABASE_ANON_KEY | sb_publ...GBqDYY |
| VITE_SUPABASE_PUBLISHABLE_KEY | sb_publ...GBqDYY |
| SUPABASE_SERVICE_ROLE_KEY | eyJhbGc...FWw05c |
| DATABASE_URL | postgresql://po***:***@db.busmtpthvtugdesnamho.supabase.co:5432/postgres |
| PAYMENT_DATABASE_URL | postgresql://po***:***@db.busmtpthvtugdesnamho.supabase.co:5432/postgres |

## Values By Source

| Source | Key | Value |
| --- | --- | --- |
| .env | SUPABASE_URL | https://busmtpthvtugdesnamho.supabase.co |
| .env | VITE_SUPABASE_URL | https://busmtpthvtugdesnamho.supabase.co |
| .env | SUPABASE_ANON_KEY | sb_publ...GBqDYY |
| .env | VITE_SUPABASE_ANON_KEY | sb_publ...GBqDYY |
| .env | VITE_SUPABASE_PUBLISHABLE_KEY | sb_publ...GBqDYY |
| .env | SUPABASE_SERVICE_ROLE_KEY | eyJhbGc...FWw05c |
| .env | DATABASE_URL | postgresql://po***:***@db.busmtpthvtugdesnamho.supabase.co:5432/postgres |
| .env | PAYMENT_DATABASE_URL | postgresql://po***:***@db.busmtpthvtugdesnamho.supabase.co:5432/postgres |

## Environment Files

| File | Status | Requested keys present |
| --- | --- | --- |
| .env | present | VITE_SUPABASE_PUBLISHABLE_KEY, VITE_SUPABASE_ANON_KEY, SUPABASE_ANON_KEY, VITE_SUPABASE_URL, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, DATABASE_URL, PAYMENT_DATABASE_URL |
| .env.local | missing | - |
| server/.env | missing | - |
| server/.env.local | missing | - |

## Deployment Variables

| Platform | Local config | Variable values | Notes |
| --- | --- | --- | --- |
| vercel | missing | not readable | No vercel.json/.vercel metadata or Vercel CLI found in this workspace. |
| netlify | missing | not readable | No netlify.toml/.netlify metadata or Netlify CLI found in this workspace. |
| railway | missing | not readable | No railway.json/railway.toml/.railway metadata or Railway CLI found in this workspace. |
| render | present | partial/local only | render.yaml declares SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, DATABASE_URL, and PAYMENT_DATABASE_URL as sync:false remote variables; actual Render values are not stored in the repo. |
| docker | present | partial/local only | Dockerfile.worker only sets NODE_ENV=production; Supabase variables are not baked into Docker and must be injected at runtime. |

## Outdated Or Mismatched URLs

| Source | Key | Value |
| --- | --- | --- |
| none | none | none |

## Outdated Or Mismatched Project Refs

| Source | Key | Current value | Expected value |
| --- | --- | --- | --- |
| supabase/config.toml | project_id | konlvaogrijyhrtgueom | busmtpthvtugdesnamho |

## Connectivity Checks

| Check | Target | Result | Detail |
| --- | --- | --- | --- |
| DNS API host | busmtpthvtugdesnamho.supabase.co | PASS | 64:ff9b::ac40:95f6, 64:ff9b::6812:260a, 104.18.38.10, 172.64.149.246 |
| DNS database host | db.busmtpthvtugdesnamho.supabase.co | PASS | 2406:da12:557:f802:3ce1:6c8d:f7c6:6925 |
| Database TCP | db.busmtpthvtugdesnamho.supabase.co:5432 | PASS | tcp db.busmtpthvtugdesnamho.supabase.co:5432 reachable |
| Auth endpoint | https://busmtpthvtugdesnamho.supabase.co/auth/v1/settings | PASS | 200 responded |
| REST endpoint | https://busmtpthvtugdesnamho.supabase.co/rest/v1/ | PASS | 200 responded |
| Supabase client/database | playlist_pitches head query | PASS | playlist_pitches reachable; count=unknown |

## Root Cause

Connectivity passes, but local Supabase CLI project metadata still points at an old project id.
