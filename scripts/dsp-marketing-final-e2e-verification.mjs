import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { Client as PgClient } from "pg";

const root = process.cwd();
const env = loadEnv(path.join(root, ".env"));
const runId = `dsp-e2e-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
const password = `TrackSyra!${crypto.randomUUID().slice(0, 12)}aA1`;
const reportPath = path.join(root, "reports", "dsp-marketing-final-e2e-verification.md");
const evidence = {
  runId,
  generatedAt: new Date().toISOString(),
  environment: {
    supabaseUrlPresent: Boolean(env.SUPABASE_URL || env.VITE_SUPABASE_URL),
    anonKeyPresent: Boolean(env.VITE_SUPABASE_ANON_KEY || env.VITE_SUPABASE_PUBLISHABLE_KEY),
    serviceRolePresent: Boolean(env.SUPABASE_SERVICE_ROLE_KEY),
    databaseUrlPresent: Boolean(env.DATABASE_URL),
  },
  setup: {},
  phase81: {},
  phase82: {},
  phase83: {},
  phase84: {},
  phase85: {},
  database: {},
  rls: {},
  cleanup: {},
};

await run();

async function run() {
  const supabaseUrl = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
  const anonKey = env.VITE_SUPABASE_ANON_KEY || env.VITE_SUPABASE_PUBLISHABLE_KEY;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !anonKey || !serviceKey) {
    evidence.setup.error = "Missing SUPABASE_URL/VITE_SUPABASE_URL, anon key, or service role key in .env";
    writeReport();
    return;
  }

  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

  const owner = await createAndLoginUser(admin, supabaseUrl, anonKey, "owner");
  const intruder = await createAndLoginUser(admin, supabaseUrl, anonKey, "intruder");

  evidence.setup.owner = redactUser(owner.user);
  evidence.setup.intruder = redactUser(intruder.user);

  const release = await seedRelease(admin, owner.user.id);
  const track = await seedTrack(admin, owner.user.id, release.id);
  const song = await seedSong(admin, owner.user.id);

  const ownerClient = owner.client;
  const intruderClient = intruder.client;

  await verifyDatabaseConnectivity(admin, ownerClient);
  await verifyPhase81(admin, ownerClient, intruderClient, release.id);
  await verifyPhase82(ownerClient, intruderClient, release.id);
  await verifyPhase83(ownerClient, intruderClient, release.id);
  await verifyPhase84(ownerClient);
  await verifyPhase85(ownerClient, release.id, track.id);
  await verifyRlsCatalog();
  if (env.DSP_E2E_CLEANUP === "1") {
    await cleanupArtifacts(admin, owner.user.id, intruder.user.id, release.id, track.id, song.id);
  }

  writeReport();
}

async function createAndLoginUser(admin, supabaseUrl, anonKey, role) {
  const email = `${role}-${runId}@example.com`;
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { runId, role } });
  if (created.error || !created.data?.user) {
    throw new Error(`Failed to create ${role} user: ${created.error?.message || "unknown error"}`);
  }

  const client = createClient(supabaseUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const signedIn = await client.auth.signInWithPassword({ email, password });
  if (signedIn.error || !signedIn.data.session || !signedIn.data.user) {
    throw new Error(`Failed to sign in ${role} user: ${signedIn.error?.message || "unknown error"}`);
  }

  return { user: signedIn.data.user, session: signedIn.data.session, client, email };
}

async function seedRelease(admin, userId) {
  const payload = {
    user_id: userId,
    title: `DSP E2E Release ${runId}`,
    primary_artist: "TrackSyra Verification Artist",
    release_type: "single",
    release_date: new Date().toISOString().slice(0, 10),
    genre: "Electronic",
    language: "English",
    status: "approved",
    rights_owned: true,
    copyright_declared: true,
    ai_content_declared: true,
    copyright_owner: "TrackSyra Verification Artist",
    cover_art_url: null,
  };
  const result = await admin.from("releases").insert(payload).select("*").single();
  assertNoError(result, "seed release");
  evidence.setup.release = summarizeRecord(result.data);
  return result.data;
}

async function seedTrack(admin, userId, releaseId) {
  const payload = {
    release_id: releaseId,
    user_id: userId,
    title: `DSP E2E Track ${runId}`,
    primary_artist: "TrackSyra Verification Artist",
    explicit: false,
    track_number: 1,
  };
  const result = await admin.from("tracks").insert(payload).select("*").single();
  assertNoError(result, "seed track");
  evidence.setup.track = summarizeRecord(result.data);
  return result.data;
}

async function seedSong(admin, userId) {
  const payload = {
    user_id: userId,
    title: `DSP E2E Song ${runId}`,
    primary_artist: "TrackSyra Verification Artist",
    platforms: ["spotify"],
    status: "draft",
    explicit: false,
  };
  const result = await admin.from("songs").insert(payload).select("*").single();
  assertNoError(result, "seed song");
  evidence.setup.song = summarizeRecord(result.data);
  return result.data;
}

async function verifyDatabaseConnectivity(admin, ownerClient) {
  const [releases, tracks, songCount] = await Promise.all([
    admin.from("releases").select("id", { count: "exact", head: true }).eq("user_id", evidence.setup.owner.id),
    admin.from("tracks").select("id", { count: "exact", head: true }).eq("user_id", evidence.setup.owner.id),
    admin.from("songs").select("id", { count: "exact", head: true }).eq("user_id", evidence.setup.owner.id),
  ]);

  evidence.database.connectivity = {
    releases: summarizeCount(releases),
    tracks: summarizeCount(tracks),
    songs: summarizeCount(songCount),
  };

  const ownerVisible = await ownerClient.from("releases").select("id,title,user_id").eq("id", evidence.setup.release.id);
  evidence.database.ownerVisibleRelease = {
    count: ownerVisible.data?.length ?? 0,
    rows: (ownerVisible.data || []).map(summarizeRecord),
    error: ownerVisible.error?.message || null,
  };
}

async function verifyPhase81(admin, ownerClient, intruderClient, releaseId) {
  const readinessCreate = await ownerClient.rpc("upsert_dsp_release_readiness", {
    p_release_id: releaseId,
    p_overall_score: 88,
    p_metadata_score: 90,
    p_artwork_score: 86,
    p_rights_score: 92,
    p_content_score: 84,
    p_status: "in_review",
    p_summary: "Ready for DSP launch verification.",
    p_platform_coverage: ["spotify", "youtube_music"],
    p_last_scored_at: new Date().toISOString(),
  });
  assertNoError(readinessCreate, "create readiness");
  evidence.phase81.readinessCreate = summarizeRecord(readinessCreate.data);

  const readinessRead = await ownerClient.from("dsp_release_readiness").select("*").eq("release_id", releaseId).maybeSingle();
  assertNoError(readinessRead, "read readiness");
  evidence.phase81.readinessRead = summarizeRecord(readinessRead.data);

  const readinessUpdate = await ownerClient.rpc("upsert_dsp_release_readiness", {
    p_release_id: releaseId,
    p_overall_score: 91,
    p_metadata_score: 92,
    p_artwork_score: 89,
    p_rights_score: 94,
    p_content_score: 90,
    p_status: "ready",
    p_summary: "Updated DSP readiness after verification.",
    p_platform_coverage: ["spotify", "youtube_music", "tiktok"],
    p_last_scored_at: new Date().toISOString(),
  });
  assertNoError(readinessUpdate, "update readiness");
  evidence.phase81.readinessUpdate = summarizeRecord(readinessUpdate.data);

  const readinessAfterUpdate = await ownerClient.from("dsp_release_readiness").select("*").eq("release_id", releaseId).maybeSingle();
  assertNoError(readinessAfterUpdate, "read readiness after update");
  evidence.phase81.readinessAfterUpdate = summarizeRecord(readinessAfterUpdate.data);

  const taskCreate = await ownerClient.rpc("upsert_dsp_marketing_task", {
    p_release_id: releaseId,
    p_title: "Finalize release assets",
    p_description: "Verification task created against live Supabase.",
    p_channel: "dsp",
    p_due_date: new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10),
    p_status: "todo",
    p_priority: "high",
    p_assignee: "owner",
    p_completed_at: null,
  });
  assertNoError(taskCreate, "create task");
  evidence.phase81.taskCreate = summarizeRecord(taskCreate.data);

  const taskRead = await ownerClient.from("dsp_marketing_tasks").select("*").eq("release_id", releaseId).maybeSingle();
  assertNoError(taskRead, "read task");
  evidence.phase81.taskRead = summarizeRecord(taskRead.data);

  const taskUpdate = await ownerClient.from("dsp_marketing_tasks").update({
    status: "done",
    completed_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq("id", taskCreate.data.id).select("*").single();
  assertNoError(taskUpdate, "update task");
  evidence.phase81.taskUpdate = summarizeRecord(taskUpdate.data);

  const intruderRead = await intruderClient.from("dsp_release_readiness").select("*").eq("release_id", releaseId);
  const intruderTaskRead = await intruderClient.from("dsp_marketing_tasks").select("*").eq("release_id", releaseId);
  const intruderUpdate = await intruderClient.from("dsp_marketing_tasks").update({ status: "blocked" }).eq("id", taskCreate.data.id).select("*");

  evidence.phase81.ownership = {
    intruderReadCount: intruderRead.data?.length ?? 0,
    intruderReadError: intruderRead.error?.message || null,
    intruderTaskReadCount: intruderTaskRead.data?.length ?? 0,
    intruderTaskReadError: intruderTaskRead.error?.message || null,
    intruderUpdateCount: intruderUpdate.data?.length ?? 0,
    intruderUpdateError: intruderUpdate.error?.message || null,
  };
}

async function verifyPhase82(ownerClient, intruderClient, releaseId) {
  const campaignCreate = await ownerClient.from("dsp_pre_save_campaigns").insert({
    user_id: evidence.setup.owner.id,
    release_id: releaseId,
    campaign_name: `Pre-Save ${runId}`,
    smart_link_slug: `pre-save-${runId}`,
    status: "draft",
    launch_date: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
    destination_url: "https://example.com/pre-save",
    notes: "Live verification pre-save campaign",
  }).select("*").single();
  assertNoError(campaignCreate, "create pre-save campaign");
  evidence.phase82.campaignCreate = summarizeRecord(campaignCreate.data);

  const campaignRead = await ownerClient.from("dsp_pre_save_campaigns").select("*").eq("id", campaignCreate.data.id).maybeSingle();
  assertNoError(campaignRead, "read pre-save campaign");
  evidence.phase82.campaignRead = summarizeRecord(campaignRead.data);

  const campaignUpdate = await ownerClient.from("dsp_pre_save_campaigns").update({
    status: "active",
    notes: "Updated after verification",
    updated_at: new Date().toISOString(),
  }).eq("id", campaignCreate.data.id).eq("user_id", evidence.setup.owner.id).select("*").single();
  assertNoError(campaignUpdate, "update pre-save campaign");
  evidence.phase82.campaignUpdate = summarizeRecord(campaignUpdate.data);

  const eventCreate = await ownerClient.from("dsp_pre_save_events").insert({
    campaign_id: campaignCreate.data.id,
    event_type: "click",
    referrer: "https://instagram.com",
    visitor_id: `visitor-${runId}`,
    user_agent: "Codex Live Verification",
  }).select("*").single();
  assertNoError(eventCreate, "create pre-save event");
  evidence.phase82.eventCreate = summarizeRecord(eventCreate.data);

  const eventRead = await ownerClient.from("dsp_pre_save_events").select("*").eq("campaign_id", campaignCreate.data.id);
  assertNoError(eventRead, "read pre-save event");
  evidence.phase82.eventRead = {
    count: eventRead.data?.length ?? 0,
    rows: (eventRead.data || []).map(summarizeRecord),
    error: eventRead.error?.message || null,
  };

  const eventUpdate = await ownerClient.from("dsp_pre_save_events").update({
    referrer: "https://instagram.com/reels",
  }).eq("id", eventCreate.data.id).select("*").single();
  assertNoError(eventUpdate, "update pre-save event");
  evidence.phase82.eventUpdate = summarizeRecord(eventUpdate.data);

  const intruderCampaignRead = await intruderClient.from("dsp_pre_save_campaigns").select("*").eq("id", campaignCreate.data.id);
  const intruderEventRead = await intruderClient.from("dsp_pre_save_events").select("*").eq("campaign_id", campaignCreate.data.id);
  const intruderCampaignUpdate = await intruderClient.from("dsp_pre_save_campaigns").update({ status: "paused" }).eq("id", campaignCreate.data.id).select("*");

  evidence.phase82.ownership = {
    intruderCampaignReadCount: intruderCampaignRead.data?.length ?? 0,
    intruderCampaignReadError: intruderCampaignRead.error?.message || null,
    intruderEventReadCount: intruderEventRead.data?.length ?? 0,
    intruderEventReadError: intruderEventRead.error?.message || null,
    intruderCampaignUpdateCount: intruderCampaignUpdate.data?.length ?? 0,
    intruderCampaignUpdateError: intruderCampaignUpdate.error?.message || null,
  };
}

async function verifyPhase83(ownerClient, intruderClient, releaseId) {
  const campaignCreate = await ownerClient.from("dsp_campaigns").insert({
    user_id: evidence.setup.owner.id,
    campaign_name: `Campaign Center ${runId}`,
    campaign_type: "spotify",
    budget: 2500,
    start_date: new Date().toISOString().slice(0, 10),
    end_date: new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10),
    status: "draft",
    notes: "Live verification campaign",
  }).select("*").single();
  assertNoError(campaignCreate, "create campaign center campaign");
  evidence.phase83.campaignCreate = summarizeRecord(campaignCreate.data);

  const metricCreate = await ownerClient.from("dsp_campaign_metrics").insert({
    campaign_id: campaignCreate.data.id,
    total_reach: 12000,
    total_engagement: 900,
  }).select("*").single();
  assertNoError(metricCreate, "create campaign center metric");
  evidence.phase83.metricCreate = summarizeRecord(metricCreate.data);

  const campaignRead = await ownerClient.from("dsp_campaigns").select("*").eq("id", campaignCreate.data.id).maybeSingle();
  assertNoError(campaignRead, "read campaign center campaign");
  evidence.phase83.campaignRead = summarizeRecord(campaignRead.data);

  const metricRead = await ownerClient.from("dsp_campaign_metrics").select("*").eq("campaign_id", campaignCreate.data.id).maybeSingle();
  assertNoError(metricRead, "read campaign metric");
  evidence.phase83.metricRead = summarizeRecord(metricRead.data);

  const campaignUpdate = await ownerClient.from("dsp_campaigns").update({
    status: "active",
    notes: "Updated after live verification",
    updated_at: new Date().toISOString(),
  }).eq("id", campaignCreate.data.id).eq("user_id", evidence.setup.owner.id).select("*").single();
  assertNoError(campaignUpdate, "update campaign center campaign");
  evidence.phase83.campaignUpdate = summarizeRecord(campaignUpdate.data);

  const intruderCampaignRead = await intruderClient.from("dsp_campaigns").select("*").eq("id", campaignCreate.data.id);
  const intruderMetricRead = await intruderClient.from("dsp_campaign_metrics").select("*").eq("campaign_id", campaignCreate.data.id);
  const intruderCampaignUpdate = await intruderClient.from("dsp_campaigns").update({ status: "paused" }).eq("id", campaignCreate.data.id).select("*");

  evidence.phase83.ownership = {
    intruderCampaignReadCount: intruderCampaignRead.data?.length ?? 0,
    intruderCampaignReadError: intruderCampaignRead.error?.message || null,
    intruderMetricReadCount: intruderMetricRead.data?.length ?? 0,
    intruderMetricReadError: intruderMetricRead.error?.message || null,
    intruderCampaignUpdateCount: intruderCampaignUpdate.data?.length ?? 0,
    intruderCampaignUpdateError: intruderCampaignUpdate.error?.message || null,
  };
}

async function verifyPhase84(ownerClient) {
  const snapshotSeed = await ownerClient.from("dsp_analytics_snapshots").insert([
    {
      user_id: evidence.setup.owner.id,
      snapshot_date: new Date(Date.now() - 2 * 86400000).toISOString().slice(0, 10),
      streams: 1200,
      saves: 90,
      playlist_adds: 14,
      followers: 260,
      reach: 18000,
      engagement: 480,
    },
    {
      user_id: evidence.setup.owner.id,
      snapshot_date: new Date(Date.now() - 1 * 86400000).toISOString().slice(0, 10),
      streams: 1600,
      saves: 110,
      playlist_adds: 18,
      followers: 320,
      reach: 21000,
      engagement: 620,
    },
  ]).select("*");
  assertNoError(snapshotSeed, "seed analytics snapshots");
  evidence.phase84.snapshotSeed = {
    count: snapshotSeed.data?.length ?? 0,
    rows: (snapshotSeed.data || []).map(summarizeRecord),
    error: snapshotSeed.error?.message || null,
  };

  const audienceSeed = await ownerClient.from("dsp_audience_metrics").insert([
    {
      user_id: evidence.setup.owner.id,
      metric_date: new Date(Date.now() - 2 * 86400000).toISOString().slice(0, 10),
      country: "India",
      city: "Mumbai",
      followers: 180,
      reach: 7000,
      engagement: 210,
      growth_rate: 8.5,
    },
    {
      user_id: evidence.setup.owner.id,
      metric_date: new Date(Date.now() - 1 * 86400000).toISOString().slice(0, 10),
      country: "India",
      city: "Delhi",
      followers: 220,
      reach: 9000,
      engagement: 260,
      growth_rate: 9.2,
    },
  ]).select("*");
  assertNoError(audienceSeed, "seed audience metrics");
  evidence.phase84.audienceSeed = {
    count: audienceSeed.data?.length ?? 0,
    rows: (audienceSeed.data || []).map(summarizeRecord),
    error: audienceSeed.error?.message || null,
  };

  const workspace = await ownerClient.from("dsp_analytics_snapshots").select("*").eq("user_id", evidence.setup.owner.id).order("snapshot_date", { ascending: true });
  const audience = await ownerClient.from("dsp_audience_metrics").select("*").eq("user_id", evidence.setup.owner.id).order("metric_date", { ascending: true });
  const performance = await ownerClient.from("playlist_performance_artist_dashboard").select("*").limit(5);
  const pitchDashboard = await ownerClient.from("playlist_pitch_artist_dashboard").select("*").limit(5);

  evidence.phase84.workspace = {
    snapshots: summarizeQuery(workspace),
    audienceMetrics: summarizeQuery(audience),
    playlistPerformance: summarizeQuery(performance),
    playlistPitchDashboard: summarizeQuery(pitchDashboard),
  };
}

async function verifyPhase85(ownerClient, releaseId, trackId) {
  const pitchCreate = await ownerClient.from("playlist_pitches").insert({
    user_id: evidence.setup.owner.id,
    release_id: releaseId,
    track_id: trackId,
    genre: "Electronic",
    subgenre: "House",
    mood: "Energetic",
    mood_tags: ["uplifting", "club"],
    language: "English",
    territory: "India",
    pitch_story: "This is a live verification pitch story describing a genuine release and its editorial fit. It is long enough to satisfy the live pitch policy and creates an evidence-backed recommendation set.",
    marketing_plan: "Verification marketing plan",
    social_links: {},
    campaign_budget: 1200,
    release_date: new Date().toISOString().slice(0, 10),
    spotify_uri: "spotify:track:verification",
    release_metadata: { source: "dsp-e2e" },
    status: "draft",
    priority_score: 82,
  }).select("*").single();
  assertNoError(pitchCreate, "create playlist pitch");
  evidence.phase85.pitchCreate = summarizeRecord(pitchCreate.data);

  const pitchRead = await ownerClient.from("playlist_pitches").select("*").eq("id", pitchCreate.data.id).maybeSingle();
  assertNoError(pitchRead, "read playlist pitch");
  evidence.phase85.pitchRead = summarizeRecord(pitchRead.data);

  const pitchUpdate = await ownerClient.from("playlist_pitches").update({
    status: "submitted",
    priority_score: 88,
    updated_at: new Date().toISOString(),
  }).eq("id", pitchCreate.data.id).eq("user_id", evidence.setup.owner.id).select("*").single();
  assertNoError(pitchUpdate, "update playlist pitch");
  evidence.phase85.pitchUpdate = summarizeRecord(pitchUpdate.data);

  const recommendations = await ownerClient.from("dsp_ai_recommendations").select("*").eq("user_id", evidence.setup.owner.id).order("recommendation_type", { ascending: true });
  evidence.phase85.recommendationsBeforeAssistant = summarizeQuery(recommendations);

  evidence.phase85.assistantPending = {
    note: "Phase 8.5 recommendations are generated by the live dashboard load. Browser verification will trigger the assistant and then re-query this table.",
  };
}

async function verifyRlsCatalog() {
  if (!env.DATABASE_URL) {
    evidence.rls.catalog = { error: "DATABASE_URL missing; catalog query not run" };
    return;
  }

  const client = new PgClient({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    const result = await client.query(
      `select c.relname as table_name, c.relrowsecurity as rls_enabled, coalesce(count(p.*), 0) as policy_count
       from pg_class c
       join pg_namespace n on n.oid = c.relnamespace
       left join pg_policy p on p.polrelid = c.oid
       where n.nspname = 'public'
         and c.relname in (
           'dsp_release_readiness',
           'dsp_marketing_tasks',
           'dsp_pre_save_campaigns',
           'dsp_pre_save_events',
           'dsp_campaigns',
           'dsp_campaign_metrics',
           'dsp_analytics_snapshots',
           'dsp_audience_metrics',
           'dsp_ai_recommendations'
         )
       group by c.relname, c.relrowsecurity
       order by c.relname`,
    );
    evidence.rls.catalog = {
      count: result.rowCount,
      rows: result.rows,
    };
  } finally {
    await client.end();
  }
}

async function cleanupArtifacts(admin, ownerUserId, intruderUserId, releaseId, trackId, songId) {
  const authAdmin = admin.auth.admin;
  const cleanup = {};
  cleanup.dsp_ai_recommendations = await cleanupTable(admin, "dsp_ai_recommendations", "user_id", ownerUserId);
  cleanup.dsp_audience_metrics = await cleanupTable(admin, "dsp_audience_metrics", "user_id", ownerUserId);
  cleanup.dsp_analytics_snapshots = await cleanupTable(admin, "dsp_analytics_snapshots", "user_id", ownerUserId);
  cleanup.dsp_campaign_metrics = await cleanupTable(admin, "dsp_campaign_metrics", "campaign_id", evidence.phase83.campaignCreate?.id);
  cleanup.dsp_campaigns = await cleanupTable(admin, "dsp_campaigns", "user_id", ownerUserId);
  cleanup.dsp_pre_save_events = await cleanupTable(admin, "dsp_pre_save_events", "campaign_id", evidence.phase82.campaignCreate?.id);
  cleanup.dsp_pre_save_campaigns = await cleanupTable(admin, "dsp_pre_save_campaigns", "user_id", ownerUserId);
  cleanup.dsp_marketing_tasks = await cleanupTable(admin, "dsp_marketing_tasks", "release_id", releaseId);
  cleanup.dsp_release_readiness = await cleanupTable(admin, "dsp_release_readiness", "release_id", releaseId);
  cleanup.playlist_pitches = await cleanupTable(admin, "playlist_pitches", "user_id", ownerUserId);
  cleanup.tracks = await cleanupTable(admin, "tracks", "id", trackId);
  cleanup.releases = await cleanupTable(admin, "releases", "id", releaseId);
  cleanup.songs = await cleanupTable(admin, "songs", "id", songId);
  cleanup.intruderUser = await authAdmin.deleteUser(intruderUserId);
  cleanup.ownerUser = await authAdmin.deleteUser(ownerUserId);
  evidence.cleanup = cleanup;
}

async function cleanupTable(admin, table, column, value) {
  if (!value) return { skipped: true };
  const result = await admin.from(table).delete().eq(column, value);
  return {
    ok: !result.error,
    error: result.error?.message || null,
  };
}

function summarizeRecord(row) {
  if (!row || typeof row !== "object") return row;
  const entries = Object.entries(row).map(([key, value]) => [key, normalizeValue(value)]);
  return Object.fromEntries(entries);
}

function summarizeQuery(result) {
  return {
    count: result.data?.length ?? 0,
    rows: (result.data || []).map(summarizeRecord),
    error: result.error?.message || null,
  };
}

function summarizeCount(result) {
  return {
    count: result.count ?? 0,
    error: result.error?.message || null,
  };
}

function normalizeValue(value) {
  if (Array.isArray(value)) return value.map(normalizeValue);
  if (value && typeof value === "object") return summarizeRecord(value);
  return value;
}

function redactUser(user) {
  return {
    id: user.id,
    email: user.email,
    created_at: user.created_at,
    aud: user.aud,
  };
}

function assertNoError(result, step) {
  if (result.error) {
    throw new Error(`${step} failed: ${result.error.message}`);
  }
}

function writeReport() {
  const pass = determinePass();
  const readinessScore = determineReadinessScore();
  const markdown = buildMarkdown(pass, readinessScore);
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, markdown, "utf8");
  fs.writeFileSync(path.join(root, "reports", "dsp-marketing-final-e2e-evidence.json"), JSON.stringify(evidence, null, 2), "utf8");
  console.log(JSON.stringify({ verdict: pass ? "PASS" : "FAIL", readinessScore, reportPath }, null, 2));
}

function determinePass() {
  const phase81 = okPhase(evidence.phase81, ["readinessCreate", "readinessRead", "readinessUpdate", "taskCreate", "taskRead", "taskUpdate"]);
  const phase82 = okPhase(evidence.phase82, ["campaignCreate", "campaignRead", "campaignUpdate", "eventCreate", "eventRead", "eventUpdate"]);
  const phase83 = okPhase(evidence.phase83, ["campaignCreate", "metricCreate", "campaignRead", "metricRead", "campaignUpdate"]);
  const phase84 = okPhase(evidence.phase84, ["snapshotSeed", "audienceSeed", "workspace"]);
  const phase85 = okPhase(evidence.phase85, ["pitchCreate", "pitchRead", "pitchUpdate", "finalRecommendations"]);
  const db = Boolean(evidence.database.connectivity?.releases?.count >= 1 && evidence.database.connectivity?.tracks?.count >= 1 && evidence.database.connectivity?.songs?.count >= 1);
  const rls = Boolean(evidence.rls.catalog?.rows?.every((row) => row.rls_enabled && row.policy_count > 0));
  return phase81 && phase82 && phase83 && phase84 && phase85 && db && rls;
}

function determineReadinessScore() {
  const metrics = [
    okPhase(evidence.phase81, ["readinessCreate", "taskCreate", "ownership"]) ? 20 : 0,
    okPhase(evidence.phase82, ["campaignCreate", "eventCreate", "ownership"]) ? 20 : 0,
    okPhase(evidence.phase83, ["campaignCreate", "metricCreate", "ownership"]) ? 20 : 0,
    okPhase(evidence.phase84, ["snapshotSeed", "audienceSeed", "workspace"]) ? 15 : 0,
    okPhase(evidence.phase85, ["pitchCreate", "finalRecommendations"]) ? 15 : 0,
    evidence.database.connectivity?.releases?.count >= 1 ? 5 : 0,
    evidence.rls.catalog?.rows?.every((row) => row.rls_enabled && row.policy_count > 0) ? 5 : 0,
  ];
  return metrics.reduce((sum, value) => sum + value, 0);
}

function okPhase(bucket, keys) {
  return keys.every((key) => {
    const value = bucket[key];
    if (value == null) return false;
    if (value.error && typeof value.error === "string") return false;
    if (value.count === 0 && /create|read|update|workspace|seed|recommendations/.test(key)) return false;
    return true;
  });
}

function buildMarkdown(pass, readinessScore) {
  return `# DSP Marketing Final E2E Verification

## Final Verdict

${pass ? "PRODUCTION READY" : "NOT READY"}

Readiness score: ${readinessScore}/100

## Environment

| Item | State |
| --- | --- |
| SUPABASE_URL | ${evidence.environment.supabaseUrlPresent ? "present" : "missing"} |
| SUPABASE_ANON_KEY | ${evidence.environment.anonKeyPresent ? "present" : "missing"} |
| SUPABASE_SERVICE_ROLE_KEY | ${evidence.environment.serviceRolePresent ? "present" : "missing"} |
| DATABASE_URL | ${evidence.environment.databaseUrlPresent ? "present" : "missing"} |

## Phase 8.1 Result

${formatPhaseResult(evidence.phase81)}

## Phase 8.2 Result

${formatPhaseResult(evidence.phase82)}

## Phase 8.3 Result

${formatPhaseResult(evidence.phase83)}

## Phase 8.4 Result

${formatPhaseResult(evidence.phase84)}

## Phase 8.5 Result

${formatPhaseResult(evidence.phase85)}

## Database Result

\`\`\`json
${JSON.stringify(evidence.database, null, 2)}
\`\`\`

## RLS Result

\`\`\`json
${JSON.stringify(evidence.rls, null, 2)}
\`\`\`

## Cleanup Result

\`\`\`json
${JSON.stringify(evidence.cleanup, null, 2)}
\`\`\`

## Raw Evidence

\`\`\`json
${JSON.stringify(evidence, null, 2)}
\`\`\`
`;
}

function formatPhaseResult(phase) {
  return `\`\`\`json
${JSON.stringify(phase, null, 2)}
\`\`\``;
}

function loadEnv(file) {
  if (!fs.existsSync(file)) return {};
  return Object.fromEntries(
    fs.readFileSync(file, "utf8")
      .split(/\r?\n/)
      .filter((line) => /^\s*[A-Za-z_][A-Za-z0-9_]*=/.test(line))
      .map((line) => {
        const index = line.indexOf("=");
        return [line.slice(0, index).trim(), line.slice(index + 1).trim().replace(/^"|"$/g, "")];
      }),
  );
}
