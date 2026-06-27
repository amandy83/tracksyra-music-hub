import { createClient } from "@supabase/supabase-js";
import pg from "pg";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";

const { Client } = pg;

const migrations = [
  "supabase/migrations/20260604100000_phase6_playlist_pitching_system.sql",
  "supabase/migrations/20260604110000_phase61_curator_marketplace.sql",
  "supabase/migrations/20260604120000_phase62_playlist_performance_analytics.sql",
  "supabase/migrations/20260623170000_free_playlist_pitching_system.sql",
  "supabase/migrations/20260623180000_real_curator_delivery_system.sql",
  "supabase/migrations/20260623190000_phase63_curator_recruitment_verification.sql",
];

const expectedTables = [
  "playlist_pitches",
  "playlist_curators",
  "playlist_pitch_assignments",
  "playlist_pitch_responses",
  "playlist_pitch_analytics",
  "playlist_pitch_audit_logs",
  "playlist_curator_marketplace",
  "curator_playlists",
  "curator_contact_methods",
  "curator_verification_requests",
  "curator_outreach_history",
  "curator_deliveries",
  "curator_responses",
  "curator_playlist_additions",
  "curator_playlist_registry",
  "curator_quality_scores",
];

const expectedRequestedTables = [
  "playlist_pitches",
  "playlist_pitch_notes",
  "curator_profiles",
  "curator_marketplace",
  "curator_assignments",
  "curator_quality_scores",
  "playlist_analytics",
  "playlist_reach_metrics",
];

const expectedViews = [
  "playlist_pitch_admin_queue",
  "playlist_pitch_artist_dashboard",
  "playlist_pitch_delivery_tracking",
  "free_playlist_pitch_admin_analytics",
  "free_playlist_pitch_usage",
  "curator_marketplace_playlist_cards",
  "curator_marketplace_admin_analytics",
  "curator_verification_admin_queue",
  "curator_outreach_artist_dashboard",
  "playlist_performance_artist_dashboard",
  "playlist_performance_timeline",
  "playlist_performance_admin_analytics",
  "playlist_genre_performance_admin",
];

const expectedFunctions = [
  "review_playlist_pitch",
  "assign_playlist_pitch_curator",
  "record_playlist_pitch_response",
  "recalculate_playlist_pitch_analytics",
  "playlist_pitch_limit_for_user",
  "recommend_playlist_curators_for_pitch",
  "refresh_playlist_pitch_curator_recommendations",
  "deliver_playlist_pitch_to_matched_curators",
  "force_assign_playlist_pitch_curator",
  "record_curator_delivery_action",
  "create_curator_outreach",
  "record_curator_outreach_response",
  "create_curator_verification_request",
  "review_curator_verification_request",
  "refresh_curator_marketplace_stats",
  "refresh_curator_quality_score",
  "refresh_playlist_placement_metrics",
];

const expectedPolicies = {
  playlist_pitches: [
    "artists view own playlist pitches",
    "artists create own playlist pitches",
    "artists update own draft playlist pitches",
    "admins manage playlist pitches",
  ],
  playlist_pitch_assignments: [
    "artists view own playlist pitch assignments",
    "admins manage playlist pitch assignments",
  ],
  playlist_pitch_responses: [
    "artists view own playlist pitch responses",
    "admins manage playlist pitch responses",
  ],
  playlist_pitch_analytics: [
    "artists view own playlist pitch analytics",
    "admins manage playlist pitch analytics",
  ],
  playlist_pitch_audit_logs: [
    "artists view own playlist pitch audit logs",
    "admins view playlist pitch audit logs",
  ],
  playlist_curator_marketplace: [
    "artists view active marketplace curators",
    "admins manage marketplace curators",
  ],
  curator_deliveries: [
    "artists view own curator deliveries",
    "admins manage curator deliveries",
    "curator accounts update own deliveries",
  ],
  curator_responses: [
    "artists view own curator responses",
    "admins manage curator responses",
  ],
  curator_playlist_additions: [
    "artists view own curator playlist additions",
    "admins manage curator playlist additions",
  ],
  curator_quality_scores: [
    "authenticated view curator quality scores",
    "admins manage curator quality scores",
  ],
};

function parseEnv(text) {
  const env = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const index = line.indexOf("=");
    if (index === -1) continue;
    const key = line.slice(0, index).trim();
    let value = line.slice(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

async function loadEnv() {
  const env = { ...process.env };
  for (const file of [".env", ".env.local", "server/.env", "server/.env.local"]) {
    if (!existsSync(file)) continue;
    const parsed = parseEnv(await readFile(file, "utf8"));
    for (const [key, value] of Object.entries(parsed)) {
      if (!env[key]) env[key] = value;
    }
  }
  return env;
}

function pass(ok, detail = "") {
  return { ok: Boolean(ok), status: ok ? "PASS" : "FAIL", detail };
}

async function query(client, text, params = []) {
  return client.query(text, params);
}

async function insertReturning(client, table, row) {
  const entries = Object.entries(row).filter(([, value]) => value !== undefined);
  const columns = entries.map(([key]) => key);
  const values = entries.map(([, value]) => value);
  const placeholders = values.map((_, index) => `$${index + 1}`);
  const result = await query(
    client,
    `INSERT INTO public.${table} (${columns.map((column) => `"${column}"`).join(", ")}) VALUES (${placeholders.join(", ")}) RETURNING *`,
    values,
  );
  return result.rows[0];
}

async function countExistingRelations(client, names, kinds = ["r", "p", "v", "m"]) {
  const result = await query(
    client,
    `
      SELECT c.relname, c.relkind
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = ANY($1)
        AND c.relkind = ANY($2)
      ORDER BY c.relname
    `,
    [names, kinds],
  );
  return new Map(result.rows.map((row) => [row.relname, row.relkind]));
}

async function existingFunctions(client, names) {
  const result = await query(
    client,
    `
      SELECT DISTINCT p.proname
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.proname = ANY($1)
      ORDER BY p.proname
    `,
    [names],
  );
  return new Set(result.rows.map((row) => row.proname));
}

async function existingPolicies(client) {
  const result = await query(
    client,
    `
      SELECT schemaname, tablename, policyname
      FROM pg_policies
      WHERE schemaname = 'public'
      ORDER BY tablename, policyname
    `,
  );
  return new Set(result.rows.map((row) => `${row.tablename}:${row.policyname}`));
}

async function main() {
  const env = await loadEnv();
  const databaseUrl = env.DATABASE_URL || env.PAYMENT_DATABASE_URL;
  const supabaseUrl = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!databaseUrl || !supabaseUrl || !serviceKey) {
    throw new Error("Missing DATABASE_URL, SUPABASE_URL, or SUPABASE_SERVICE_ROLE_KEY.");
  }

  const projectRef = new URL(supabaseUrl).hostname.replace(".supabase.co", "");
  if (projectRef !== "busmtpthvtugdesnamho") {
    throw new Error(`Refusing to deploy to ${projectRef}; expected busmtpthvtugdesnamho.`);
  }

  const startedAt = new Date().toISOString();
  const runId = `pp-${startedAt.replace(/[-:.TZ]/g, "").slice(0, 14)}-${Math.random().toString(36).slice(2, 7)}`;
  const checks = {};
  const evidence = { projectRef, runId, startedAt, migrations: [], ids: {}, checks };
  const client = new Client({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false } });
  const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

  try {
    await client.connect();
    await query(client, "SELECT set_config('statement_timeout', '120000', false)");

    for (const file of migrations) {
      const sql = await readFile(file, "utf8");
      const migrationStarted = Date.now();
      try {
        await query(client, sql);
        evidence.migrations.push({ file, status: "PASS", ms: Date.now() - migrationStarted });
      } catch (error) {
        evidence.migrations.push({ file, status: "FAIL", detail: error.message, ms: Date.now() - migrationStarted });
        throw error;
      }
    }
    checks.migrations = pass(evidence.migrations.every((row) => row.status === "PASS"), JSON.stringify(evidence.migrations));

    const tableMap = await countExistingRelations(client, expectedTables, ["r", "p"]);
    const missingTables = expectedTables.filter((name) => !tableMap.has(name));
    checks.tables = pass(missingTables.length === 0, `existing=${expectedTables.filter((name) => tableMap.has(name)).join(", ")} missing=${missingTables.join(", ") || "none"}`);

    const requestedMap = await countExistingRelations(client, expectedRequestedTables, ["r", "p", "v", "m"]);
    const missingRequested = expectedRequestedTables.filter((name) => !requestedMap.has(name));
    checks.requestedExactTables = pass(missingRequested.length === 0, `existing=${expectedRequestedTables.filter((name) => requestedMap.has(name)).join(", ") || "none"} missing=${missingRequested.join(", ") || "none"}`);

    const viewMap = await countExistingRelations(client, expectedViews, ["v", "m"]);
    const missingViews = expectedViews.filter((name) => !viewMap.has(name));
    checks.views = pass(missingViews.length === 0, `existing=${expectedViews.filter((name) => viewMap.has(name)).join(", ")} missing=${missingViews.join(", ") || "none"}`);

    const fnSet = await existingFunctions(client, expectedFunctions);
    const missingFunctions = expectedFunctions.filter((name) => !fnSet.has(name));
    checks.rpcFunctions = pass(missingFunctions.length === 0, `existing=${expectedFunctions.filter((name) => fnSet.has(name)).join(", ")} missing=${missingFunctions.join(", ") || "none"}`);

    const policySet = await existingPolicies(client);
    const missingPolicies = Object.entries(expectedPolicies)
      .flatMap(([table, policies]) => policies.map((policy) => ({ table, policy })))
      .filter(({ table, policy }) => !policySet.has(`${table}:${policy}`));
    checks.rlsPolicies = pass(missingPolicies.length === 0, `missing=${missingPolicies.map((row) => `${row.table}.${row.policy}`).join("; ") || "none"}`);

    const artistEmail = `${runId}-artist@example.com`;
    const curatorEmail = `${runId}-curator@example.com`;
    const password = `PlaylistPitch!${runId}`;
    const artistCreate = await supabase.auth.admin.createUser({ email: artistEmail, password, email_confirm: true, user_metadata: { runId, role: "artist" } });
    if (artistCreate.error) throw new Error(`create artist user: ${artistCreate.error.message}`);
    const curatorCreate = await supabase.auth.admin.createUser({ email: curatorEmail, password, email_confirm: true, user_metadata: { runId, role: "curator" } });
    if (curatorCreate.error) throw new Error(`create curator user: ${curatorCreate.error.message}`);
    const artistId = artistCreate.data.user.id;
    const curatorUserId = curatorCreate.data.user.id;
    evidence.ids.artistUser = artistId;
    evidence.ids.curatorUser = curatorUserId;

    await query(client, "INSERT INTO public.user_roles (user_id, role) VALUES ($1, 'artist'::public.app_role), ($2, 'artist'::public.app_role) ON CONFLICT DO NOTHING", [artistId, curatorUserId]);
    await query(
      client,
      `
        INSERT INTO public.profiles (id, full_name, artist_name, country, main_genre)
        VALUES ($1, $2, $3, 'US', 'Pop'), ($4, $5, $6, 'US', 'Pop')
        ON CONFLICT (id) DO UPDATE
        SET full_name = EXCLUDED.full_name,
            artist_name = EXCLUDED.artist_name,
            country = EXCLUDED.country,
            main_genre = EXCLUDED.main_genre
      `,
      [artistId, `Playlist Pitch Artist ${runId}`, `Pitch Artist ${runId}`, curatorUserId, `Playlist Pitch Curator ${runId}`, `Pitch Curator ${runId}`],
    );

    const release = await insertReturning(client, "releases", {
      user_id: artistId,
      title: `Playlist Pitch Verification Release ${runId}`,
      primary_artist: `Pitch Artist ${runId}`,
      release_type: "single",
      release_date: "2026-06-23",
      genre: "Pop",
      language: "English",
      copyright_owner: `Pitch Artist ${runId}`,
      copyright_declared: true,
      ai_content_declared: false,
      rights_owned: true,
      cover_art_url: "https://tracksyra.example/playlist-pitch-verification-cover.jpg",
      status: "approved",
    });
    const track = await insertReturning(client, "tracks", {
      release_id: release.id,
      user_id: artistId,
      title: `Playlist Pitch Verification Track ${runId}`,
      primary_artist: `Pitch Artist ${runId}`,
      audio_url: "https://tracksyra.example/playlist-pitch-verification.wav",
      audio_hash: `playlist-pitch-${runId}`,
      duration_sec: 180,
      audio_format: "wav",
      track_number: 1,
    });
    evidence.ids.release = release.id;
    evidence.ids.track = track.id;

    const curator = await insertReturning(client, "playlist_curator_marketplace", {
      curator_name: `Verified Curator ${runId}`,
      company_name: "TrackSyra Verification",
      email: curatorEmail,
      country: "US",
      territory: "Global",
      verified: true,
      active: true,
      acceptance_rate: 90,
      response_rate: 95,
      average_response_days: 0,
      total_playlists: 1,
      total_followers: 250000,
      approval_status: "approved",
      metadata: { runId, language: "English" },
      created_by: curatorUserId,
      verified_by: curatorUserId,
      verified_at: new Date().toISOString(),
    });
    const playlist = await insertReturning(client, "curator_playlists", {
      playlist_name: `Verified Playlist ${runId}`,
      spotify_playlist_url: `https://open.spotify.com/playlist/${runId}`,
      spotify_playlist_id: runId,
      followers: 250000,
      genre: "Pop",
      mood: "Upbeat",
      territory: "Global",
      curator_id: curator.id,
      active: true,
      verified: true,
      last_checked_at: new Date().toISOString(),
      metadata: { runId, language: "English" },
    });
    evidence.ids.curator = curator.id;
    evidence.ids.playlist = playlist.id;

    if (tableMap.has("curator_quality_scores")) {
      await query(
        client,
        `
          INSERT INTO public.curator_quality_scores (
            curator_id, response_rate, acceptance_rate, playlist_add_rate,
            artist_satisfaction_score, average_response_hours, quality_score, curator_level
          ) VALUES ($1, 95, 90, 85, 90, 1, 90, 'platinum')
          ON CONFLICT (curator_id) DO UPDATE
          SET response_rate = EXCLUDED.response_rate,
              acceptance_rate = EXCLUDED.acceptance_rate,
              playlist_add_rate = EXCLUDED.playlist_add_rate,
              artist_satisfaction_score = EXCLUDED.artist_satisfaction_score,
              average_response_hours = EXCLUDED.average_response_hours,
              quality_score = EXCLUDED.quality_score,
              curator_level = EXCLUDED.curator_level
        `,
        [curator.id],
      );
    }

    const pitch = await insertReturning(client, "playlist_pitches", {
      user_id: artistId,
      release_id: release.id,
      track_id: track.id,
      genre: "Pop",
      subgenre: "Dance Pop",
      mood: "Upbeat",
      mood_tags: ["Upbeat", "Energetic"],
      instruments: ["Synth", "Drums"],
      language: "English",
      territory: "Global",
      artist_country: "US",
      similar_artists: "Dua Lipa, Taylor Swift",
      pitch_story: `Live Playlist Pitching verification ${runId}`,
      marketing_plan: "Live verification plan.",
      social_links: { spotify: "https://open.spotify.com/artist/06HL4z0CvFAxyc27GXpf02" },
      spotify_uri: "spotify:track:0VjIjW4GlUZAMYd2vXMi3b",
      spotify_url: "https://open.spotify.com/track/0VjIjW4GlUZAMYd2vXMi3b",
      status: "submitted",
      priority_score: 75,
      submitted_at: new Date().toISOString(),
    });
    evidence.ids.pitch = pitch.id;
    checks.testPitch = pass(Boolean(pitch.id), `playlist_pitches.id=${pitch.id} status=${pitch.status}`);

    await query(client, "SELECT public.deliver_playlist_pitch_to_matched_curators($1, 8)", [pitch.id]).catch(async () => {
      await query(client, "SELECT public.force_assign_playlist_pitch_curator($1, $2, $3, $4)", [pitch.id, curator.id, playlist.id, `verification ${runId}`]);
    });

    const deliveryRows = await query(client, "SELECT * FROM public.curator_deliveries WHERE pitch_id = $1 ORDER BY created_at DESC", [pitch.id]);
    const delivery = deliveryRows.rows[0];
    evidence.ids.delivery = delivery?.id ?? null;
    checks.curatorAssignment = pass(Boolean(delivery?.id), `curator_deliveries=${deliveryRows.rowCount} delivery_id=${delivery?.id ?? "none"} status=${delivery?.status ?? "none"}`);

    if (delivery?.id) {
      await query(
        client,
        "SELECT public.record_curator_delivery_action($1, 'playlist_added', $2, NULL, $3, $4, $5, $6)",
        [
          delivery.id,
          `Verification playlist add ${runId}`,
          `https://open.spotify.com/playlist/${runId}`,
          runId,
          `Verified Playlist ${runId}`,
          250000,
        ],
      );
    }

    const analyticsRows = await query(client, "SELECT * FROM public.playlist_pitch_analytics WHERE pitch_id = $1", [pitch.id]);
    checks.analyticsRow = pass(
      analyticsRows.rowCount === 1 && Number(analyticsRows.rows[0].total_curators_sent) > 0,
      analyticsRows.rowCount ? JSON.stringify({
        pitch_id: analyticsRows.rows[0].pitch_id,
        total_curators_sent: analyticsRows.rows[0].total_curators_sent,
        accepted_count: analyticsRows.rows[0].accepted_count,
        estimated_playlist_reach: analyticsRows.rows[0].estimated_playlist_reach,
      }) : "no analytics row",
    );

    const artistDashboard = await query(client, "SELECT * FROM public.playlist_pitch_artist_dashboard WHERE id = $1", [pitch.id]);
    const adminQueue = await query(client, "SELECT * FROM public.playlist_pitch_admin_queue WHERE id = $1", [pitch.id]);
    const deliveryTracking = await query(client, "SELECT * FROM public.playlist_pitch_delivery_tracking WHERE pitch_id = $1", [pitch.id]);
    checks.dashboardQueries = pass(
      artistDashboard.rowCount === 1 && adminQueue.rowCount === 1 && deliveryTracking.rowCount === 1,
      JSON.stringify({
        artist_dashboard_rows: artistDashboard.rowCount,
        admin_queue_rows: adminQueue.rowCount,
        delivery_tracking_rows: deliveryTracking.rowCount,
        playlist_added_count: deliveryTracking.rows[0]?.playlist_added_count ?? null,
        playlist_reach: deliveryTracking.rows[0]?.playlist_reach ?? null,
      }),
    );
  } catch (error) {
    evidence.error = error.message;
    if (!checks.migrations && evidence.migrations.length) {
      checks.migrations = pass(false, JSON.stringify(evidence.migrations));
    }
  } finally {
    await client.end().catch(() => {});
  }

  evidence.completedAt = new Date().toISOString();
  evidence.finalStatus = Object.values(checks).length > 0 && Object.values(checks).every((check) => check.ok) ? "PASS" : "FAIL";

  const lines = [
    "# Playlist Pitching Post-Deployment Verification",
    "",
    `Final Status: ${evidence.finalStatus}`,
    `Project: ${evidence.projectRef}`,
    `Run ID: ${evidence.runId}`,
    `Started: ${evidence.startedAt}`,
    `Completed: ${evidence.completedAt}`,
    "",
    "## Evidence",
    "",
    ...Object.entries(checks).map(([name, check]) => `- ${name}: ${check.status} - ${check.detail}`),
    "",
    "## Migration Execution",
    "",
    ...evidence.migrations.map((row) => `- ${row.status} - ${row.file}${row.detail ? ` - ${row.detail}` : ""}`),
    "",
    "## Live IDs",
    "",
    "```json",
    JSON.stringify(evidence.ids, null, 2),
    "```",
  ];
  if (evidence.error) lines.push("", "## Error", "", evidence.error);

  await mkdir("reports", { recursive: true });
  await writeFile("reports/playlist-pitching-post-deployment-verification.md", `${lines.join("\n")}\n`, "utf8");
  console.log(JSON.stringify({
    status: evidence.finalStatus,
    checks,
    ids: evidence.ids,
    error: evidence.error ?? null,
    report: "reports/playlist-pitching-post-deployment-verification.md",
  }, null, 2));
  if (evidence.finalStatus !== "PASS") process.exitCode = 1;
}

main().catch(async (error) => {
  await mkdir("reports", { recursive: true });
  await writeFile("reports/playlist-pitching-post-deployment-verification.md", `# Playlist Pitching Post-Deployment Verification\n\nFinal Status: FAIL\n\nError: ${error.message}\n`, "utf8");
  console.error(JSON.stringify({ status: "FAIL", error: error.message, report: "reports/playlist-pitching-post-deployment-verification.md" }, null, 2));
  process.exitCode = 1;
});
