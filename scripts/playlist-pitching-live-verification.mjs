import { createClient } from "@supabase/supabase-js";
import { mkdir, readFile, writeFile } from "node:fs/promises";

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

function pass(ok, detail = "") {
  return { ok: Boolean(ok), status: ok ? "PASS" : "FAIL", detail };
}

async function requireOk(label, result) {
  if (result?.error) throw new Error(`${label}: ${result.error.message}`);
  return result.data;
}

async function signIn(url, anonKey, email, password) {
  const client = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`signIn ${email}: ${error.message}`);
  if (!data.session) throw new Error(`signIn ${email}: no session returned`);
  return createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${data.session.access_token}` } },
  });
}

async function createUser(admin, runId, role, password, slug = role) {
  const email = `phase6-${slug}-${runId}@example.com`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { live_verification_run: runId, role, slug },
  });
  if (error) throw new Error(`createUser ${role}: ${error.message}`);
  const userId = data.user.id;

  const profileResult = await admin.from("profiles").upsert({
    id: userId,
    full_name: `Phase 6 ${slug}`,
    artist_name: role === "artist" ? `Phase 6 Artist ${runId}` : null,
    country: "US",
    main_genre: "Pop",
  });
  if (profileResult.error && !profileResult.error.message.includes("Could not find the table 'public.profiles'")) {
    throw new Error(`profile ${role}: ${profileResult.error.message}`);
  }

  const roleResult = await admin.from("user_roles").upsert({ user_id: userId, role });
  if (roleResult.error && !roleResult.error.message.includes("Could not find the table 'public.user_roles'")) {
    throw new Error(`role ${role}: ${roleResult.error.message}`);
  }
  return { email, password, userId, role, slug, profileCreated: !profileResult.error, roleCreated: !roleResult.error };
}

async function firstVerifiedCurator(admin) {
  const { data, error } = await admin
    .from("curator_marketplace_playlist_cards")
    .select("curator_id,playlist_id,curator_name,playlist_name,followers,curator_verified,playlist_verified,suspended")
    .limit(1);
  if (error) return null;
  return data?.[0] ?? null;
}

async function ensureVerifiedCurator({ admin, superAdminClient, curatorClient, curatorUser, runId }) {
  const existing = await firstVerifiedCurator(admin);
  if (existing) return { source: "existing_verified_curator", ...existing };

  const playlist = {
    url: "https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M",
    id: "37i9dQZF1DXcBWIGoYBM5M",
    followers: 35000000,
  };

  const requestResult = await curatorClient.rpc("create_curator_verification_request", {
    p_curator_name: `Phase 6 Verified Curator ${runId}`,
    p_playlist_url: playlist.url,
    p_spotify_playlist_id: playlist.id,
    p_playlist_followers: playlist.followers,
    p_contact_email: curatorUser.email,
    p_social_links: { website: "https://open.spotify.com", x: "https://x.com/spotify" },
    p_company_name: "Phase 6 Verification",
    p_country: "US",
    p_territory: "Global",
    p_playlist_name: `Phase 6 Live Playlist ${runId}`,
    p_playlist_public: true,
  });

  if (requestResult.error?.message.includes("Could not find the function public.create_curator_verification_request")) {
    const curator = await requireOk("direct verified curator insert", await admin.from("playlist_curator_marketplace").insert({
      curator_name: `Phase 6 Verified Curator ${runId}`,
      company_name: "Phase 6 Verification",
      email: curatorUser.email,
      country: "US",
      territory: "Global",
      verified: true,
      active: true,
      suspended: false,
      approval_status: "approved",
      acceptance_rate: 80,
      response_rate: 90,
      total_playlists: 1,
      total_followers: playlist.followers,
      curator_level: "gold",
      verified_by: curatorUser.userId,
      verified_at: new Date().toISOString(),
      created_by: curatorUser.userId,
      metadata: { live_verification_run: runId, language: "English" },
    }).select("*").single());

    const createdPlaylist = await requireOk("direct verified curator playlist insert", await admin.from("curator_playlists").insert({
      curator_id: curator.id,
      playlist_name: `Phase 6 Live Playlist ${runId}`,
      spotify_playlist_url: `${playlist.url}?si=${runId}`,
      spotify_playlist_id: `${playlist.id}-${runId}`,
      followers: playlist.followers,
      genre: "Pop",
      mood: "Upbeat",
      territory: "Global",
      active: true,
      verified: true,
      is_public: true,
      verification_status: "verified",
      last_checked_at: new Date().toISOString(),
      metadata: { live_verification_run: runId },
    }).select("*").single());

    const verificationRequest = await admin.from("curator_verification_requests").insert({
      curator_id: curator.id,
      requested_by: curatorUser.userId,
      status: "approved",
      evidence_url: playlist.url,
      evidence_notes: "Direct live verification fallback because onboarding RPC is not deployed.",
      playlist_url: `${playlist.url}?si=${runId}`,
      spotify_playlist_id: `${playlist.id}-${runId}`,
      playlist_followers: playlist.followers,
      contact_email: curatorUser.email,
      playlist_public: true,
      reviewed_by: curatorUser.userId,
      reviewed_at: new Date().toISOString(),
    }).select("*").single();

    const registry = await requireOk("direct verified registry insert", await admin.from("curator_playlist_registry").insert({
      curator_id: curator.id,
      playlist_id: createdPlaylist.id,
      playlist_url: `${playlist.url}?si=${runId}`,
      spotify_playlist_id: `${playlist.id}-${runId}`,
      playlist_name: createdPlaylist.playlist_name,
      playlist_followers: playlist.followers,
      is_public: true,
      verification_status: "verified",
      verified_at: new Date().toISOString(),
      verified_by: curatorUser.userId,
      metadata: { live_verification_run: runId },
    }).select("*").single());

    await requireOk("direct quality score upsert", await admin.from("curator_quality_scores").upsert({
      curator_id: curator.id,
      response_rate: 90,
      acceptance_rate: 80,
      playlist_add_rate: 75,
      artist_satisfaction_score: 90,
      average_response_hours: 1,
      quality_score: 85,
      curator_level: "gold",
    }));

    return {
      source: "direct_service_role_verified_curator_fallback",
      request_id: verificationRequest.error ? null : verificationRequest.data?.id,
      curator_id: curator.id,
      playlist_id: registry.playlist_id,
      curator_name: curator.curator_name,
      playlist_name: createdPlaylist.playlist_name,
    };
  }

  const request = await requireOk("create_curator_verification_request", requestResult);

  await requireOk("review_curator_verification_request approve", await superAdminClient.rpc("review_curator_verification_request", {
    p_request_id: request.id,
    p_action: "approve",
    p_admin_notes: `Live verification approval ${runId}`,
  }));

  const registryRows = await requireOk("registry after approval", await admin
    .from("curator_playlist_registry")
    .select("id,curator_id,playlist_id")
    .eq("curator_id", request.curator_id)
    .eq("spotify_playlist_id", playlist.id)
    .limit(1));
  const registry = registryRows?.[0];
  if (!registry?.playlist_id) throw new Error("approved curator registry row did not link a playlist_id");

  await requireOk("match curator fields", await admin
    .from("playlist_curator_marketplace")
    .update({ acceptance_rate: 80, response_rate: 90, total_followers: playlist.followers, active: true, verified: true, suspended: false, approval_status: "approved" })
    .eq("id", request.curator_id));

  await requireOk("match playlist fields", await admin
    .from("curator_playlists")
    .update({ genre: "Pop", mood: "Upbeat", territory: "Global", followers: playlist.followers, active: true, verified: true, is_public: true, verification_status: "verified" })
    .eq("id", registry.playlist_id));

  return {
    source: "created_via_verification_rpc",
    request_id: request.id,
    curator_id: request.curator_id,
    playlist_id: registry.playlist_id,
    curator_name: `Phase 6 Verified Curator ${runId}`,
    playlist_name: `Phase 6 Live Playlist ${runId}`,
  };
}

async function main() {
  const env = parseEnv(await readFile(".env", "utf8"));
  const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = env.VITE_SUPABASE_ANON_KEY || env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !serviceKey || !anonKey) {
    throw new Error("Missing SUPABASE_URL/VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, or VITE_SUPABASE_ANON_KEY.");
  }

  const runId = `${new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 17)}${Math.random().toString(36).slice(2, 6)}`;
  const password = `Phase6Live!${runId}`;
  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const evidence = { runId, startedAt: new Date().toISOString(), ids: {}, checks: {} };

  try {
    const tables = ["playlist_pitches", "curator_deliveries", "curator_responses", "curator_playlist_additions", "curator_verification_requests", "curator_quality_scores"];
    const tableResults = {};
    for (const table of tables) {
      const result = await admin.from(table).select("*").limit(1);
      tableResults[table] = !result.error;
      if (result.error) tableResults[`${table}_error`] = result.error.message;
    }
    evidence.checks.tables = pass(tables.every((table) => tableResults[table]), JSON.stringify(tableResults));
    if (!evidence.checks.tables.ok) {
      evidence.checks.realPitch = pass(false, "skipped because required playlist pitching tables are missing from the live Supabase schema cache");
      evidence.checks.playlistPitchesRow = pass(false, "playlist_pitches table is not available");
      evidence.checks.curatorSetup = pass(false, "skipped because required curator tables are missing");
      evidence.checks.deliveryRpc = pass(false, "skipped because required tables are missing");
      evidence.checks.curatorDeliveries = pass(false, "curator_deliveries table is not available");
      evidence.checks.curatorRouting = pass(false, "cannot verify routing because curator marketplace/delivery tables are not available");
      evidence.checks.curatorResponses = pass(false, "curator_responses table is not available");
      evidence.checks.playlistAdditionEvidence = pass(false, "curator_playlist_additions table is not available");
      evidence.checks.artistDashboard = pass(false, "cannot verify dashboard because playlist pitch tables/views are unavailable");
      evidence.checks.adminDashboard = pass(false, "cannot verify admin dashboard because playlist pitch tables/views are unavailable");
      evidence.checks.analytics = pass(false, "cannot verify analytics because playlist pitch tables/views are unavailable");
      evidence.checks.rls = pass(false, "cannot verify RLS because role and playlist pitching tables are unavailable");
      evidence.summary = {
        liveDatabase: false,
        curatorRouting: false,
        artistDashboard: false,
        adminDashboard: false,
        analytics: false,
        rls: false,
      };
      throw new Error("Required Phase 6 playlist pitching tables are missing from the live Supabase schema cache.");
    }

    const artist = await createUser(admin, runId, "artist", password);
    const label = await createUser(admin, runId, "label", password);
    const publisher = await createUser(admin, runId, "publisher", password);
    const superAdmin = await createUser(admin, runId, "super_admin", password);
    const curatorUser = await createUser(admin, runId, "artist", password, "curator");
    evidence.ids.users = { artist: artist.userId, label: label.userId, publisher: publisher.userId, super_admin: superAdmin.userId, curator: curatorUser.userId };

    const labelArtistLink = await admin.from("label_artists").upsert({
      label_user_id: label.userId,
      artist_user_id: artist.userId,
      status: "active",
      created_by: superAdmin.userId,
    });
    if (labelArtistLink.error && !labelArtistLink.error.message.includes("Could not find the table 'public.label_artists'")) {
      throw new Error(`label artist link: ${labelArtistLink.error.message}`);
    }
    const publisherLabelLink = await admin.from("publisher_labels").upsert({
      publisher_user_id: publisher.userId,
      label_user_id: label.userId,
      status: "active",
      created_by: superAdmin.userId,
    });
    if (publisherLabelLink.error && !publisherLabelLink.error.message.includes("Could not find the table 'public.publisher_labels'")) {
      throw new Error(`publisher label link: ${publisherLabelLink.error.message}`);
    }
    evidence.checks.roleHierarchyTables = pass(
      !labelArtistLink.error && !publisherLabelLink.error && artist.roleCreated && label.roleCreated && publisher.roleCreated && superAdmin.roleCreated,
      JSON.stringify({
        user_roles: artist.roleCreated && label.roleCreated && publisher.roleCreated && superAdmin.roleCreated,
        label_artists: !labelArtistLink.error,
        publisher_labels: !publisherLabelLink.error,
      })
    );

    const artistClient = await signIn(url, anonKey, artist.email, password);
    const labelClient = await signIn(url, anonKey, label.email, password);
    const publisherClient = await signIn(url, anonKey, publisher.email, password);
    const superAdminClient = await signIn(url, anonKey, superAdmin.email, password);
    const curatorClient = await signIn(url, anonKey, curatorUser.email, password);

    let curator = null;
    try {
      curator = await ensureVerifiedCurator({ admin, superAdminClient, curatorClient, curatorUser, runId });
      evidence.ids.curator = curator;
      evidence.checks.curatorSetup = pass(true, JSON.stringify(curator));
    } catch (error) {
      evidence.checks.curatorSetup = pass(false, error.message);
    }

    const release = await requireOk("artist release insert", await artistClient.from("releases").insert({
      user_id: artist.userId,
      title: `Phase 6 Live Verification Release ${runId}`,
      primary_artist: `Phase 6 Artist ${runId}`,
      release_type: "single",
      release_date: "2026-06-23",
      genre: "Pop",
      language: "English",
      copyright_owner: `Phase 6 Artist ${runId}`,
      copyright_declared: true,
      ai_content_declared: false,
      rights_owned: true,
      cover_art_url: "https://tracksyra.example/live-verification-cover.jpg",
      status: "approved",
    }).select("*").single());

    const track = await requireOk("artist track insert", await artistClient.from("tracks").insert({
      release_id: release.id,
      user_id: artist.userId,
      title: `Phase 6 Live Verification Track ${runId}`,
      primary_artist: `Phase 6 Artist ${runId}`,
      audio_url: "https://tracksyra.example/live-verification-audio.wav",
      audio_hash: `phase6-live-${runId}`,
      duration_sec: 180,
      audio_format: "wav",
      track_number: 1,
    }).select("*").single());
    evidence.ids.release = release.id;
    evidence.ids.track = track.id;

    const pitch = await requireOk("artist playlist pitch insert", await artistClient.from("playlist_pitches").insert({
      user_id: artist.userId,
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
      pitch_story: `Phase 6 live verification pitch ${runId}. This is a real database submission through the authenticated artist client, with release, track, Spotify URL, and curator routing enabled.`,
      marketing_plan: "Live verification test plan for production playlist pitching.",
      social_links: { spotify: "https://open.spotify.com/artist/06HL4z0CvFAxyc27GXpf02" },
      spotify_uri: "spotify:track:0VjIjW4GlUZAMYd2vXMi3b",
      spotify_url: "https://open.spotify.com/track/0VjIjW4GlUZAMYd2vXMi3b",
      status: "submitted",
      priority_score: 75,
      submitted_at: new Date().toISOString(),
    }).select("*").single());
    evidence.ids.pitch = pitch.id;
    evidence.checks.realPitch = pass(Boolean(pitch.id), `playlist_pitches id ${pitch.id}`);

    await new Promise((resolve) => setTimeout(resolve, 1500));

    const pitchRows = await requireOk("playlist_pitches row", await admin.from("playlist_pitches").select("*").eq("id", pitch.id));
    evidence.checks.playlistPitchesRow = pass(pitchRows.length === 1, `found ${pitchRows.length} row`);

    if (curator?.curator_id && curator?.playlist_id) {
      const deliveryResult = await superAdminClient.rpc("deliver_playlist_pitch_to_matched_curators", {
        p_pitch_id: pitch.id,
        p_limit: 8,
      });
      if (deliveryResult.error) {
        evidence.checks.deliveryRpc = pass(false, deliveryResult.error.message);
      } else {
        evidence.checks.deliveryRpc = pass(true, `delivered count ${deliveryResult.data}`);
      }
    } else {
      evidence.checks.deliveryRpc = pass(false, "skipped because no verified curator could be set up");
    }

    let deliveries = await requireOk("curator_deliveries rows", await admin.from("curator_deliveries").select("*").eq("pitch_id", pitch.id).order("created_at", { ascending: true }));
    evidence.checks.curatorDeliveries = pass(deliveries.length > 0, `found ${deliveries.length} delivery rows`);
    if (!deliveries.length) {
      evidence.checks.curatorRouting = pass(false, "No curator deliveries were created for the live test pitch.");
      evidence.checks.curatorResponses = pass(false, "skipped because no curator delivery exists");
      evidence.checks.playlistAdditionEvidence = pass(false, "skipped because no curator delivery exists");
      evidence.checks.artistDashboard = pass(false, "skipped before dashboard lifecycle completion because no curator delivery exists");
      evidence.checks.analytics = pass(false, "skipped because no curator delivery/playlist addition exists");
      evidence.checks.adminDashboard = pass(false, "skipped because no curator delivery/playlist addition exists");
      evidence.checks.rls = pass(false, "role hierarchy tables or delivery workflow unavailable; see roleHierarchyTables and curatorSetup checks");
      evidence.summary = {
        liveDatabase: evidence.checks.tables.ok && evidence.checks.realPitch.ok && evidence.checks.playlistPitchesRow.ok,
        curatorRouting: false,
        artistDashboard: false,
        adminDashboard: false,
        analytics: false,
        rls: false,
      };
      throw new Error("No curator deliveries were created for the live test pitch.");
    }

    const curatorIds = [...new Set(deliveries.map((row) => row.curator_id))];
    const matchedCurators = await requireOk("matched curator states", await admin
      .from("playlist_curator_marketplace")
      .select("id,verified,active,suspended,approval_status,deleted_at")
      .in("id", curatorIds));
    const routingOk = matchedCurators.length === curatorIds.length && matchedCurators.every((row) =>
      row.verified === true && row.active === true && row.suspended === false && row.approval_status === "approved" && row.deleted_at === null
    );
    evidence.checks.curatorRouting = pass(routingOk, JSON.stringify(matchedCurators.map((row) => ({ id: row.id, verified: row.verified, active: row.active, suspended: row.suspended, approval_status: row.approval_status }))));

    const delivery = deliveries[0];
    evidence.ids.delivery = delivery.id;

    const actionSequence = [
      ["opened", {}],
      ["reviewed", { p_response_notes: "Live verification reviewed by curator." }],
      ["accepted", { p_response_notes: "Live verification accepted by curator." }],
      ["playlist_added", {
        p_response_notes: "Live verification playlist addition evidence confirmed.",
        p_playlist_url: "https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M",
        p_playlist_id: "37i9dQZF1DXcBWIGoYBM5M",
        p_playlist_name: "Today's Top Hits",
        p_estimated_reach: 35000000,
      }],
    ];
    for (const [action, extra] of actionSequence) {
      await requireOk(`record_curator_delivery_action ${action}`, await curatorClient.rpc("record_curator_delivery_action", {
        p_delivery_id: delivery.id,
        p_action: action,
        p_response_notes: extra.p_response_notes ?? null,
        p_requested_information: null,
        p_playlist_url: extra.p_playlist_url ?? null,
        p_playlist_id: extra.p_playlist_id ?? null,
        p_playlist_name: extra.p_playlist_name ?? null,
        p_estimated_reach: extra.p_estimated_reach ?? 0,
      }));
    }

    const responses = await requireOk("curator_responses rows", await admin.from("curator_responses").select("*").eq("delivery_id", delivery.id).order("created_at"));
    evidence.ids.responses = responses.map((row) => row.id);
    evidence.checks.curatorResponses = pass(responses.length >= 4, `found ${responses.length} response rows`);

    const additions = await requireOk("curator_playlist_additions rows", await admin.from("curator_playlist_additions").select("*").eq("delivery_id", delivery.id));
    const addition = additions[0];
    evidence.ids.playlist_addition = addition?.id;
    evidence.checks.playlistAdditionEvidence = pass(
      Boolean(addition?.playlist_url && addition?.playlist_id && addition?.curator_confirmation === true),
      addition ? JSON.stringify({ playlist_url: addition.playlist_url, playlist_id: addition.playlist_id, curator_confirmation: addition.curator_confirmation }) : "no playlist addition row"
    );

    deliveries = await requireOk("updated delivery", await admin.from("curator_deliveries").select("*").eq("id", delivery.id));
    const updatedDelivery = deliveries[0];
    const artistDashboard = await requireOk("artist dashboard", await artistClient
      .from("playlist_pitch_artist_dashboard")
      .select("*")
      .eq("id", pitch.id)
      .single());
    evidence.checks.artistDashboard = pass(
      artistDashboard.status === "accepted"
        && updatedDelivery.matched_at
        && updatedDelivery.delivered_at
        && updatedDelivery.opened_at
        && updatedDelivery.reviewed_at
        && updatedDelivery.accepted_at
        && updatedDelivery.playlist_added_at
        && Number(artistDashboard.playlist_added_count || 0) >= 1,
      JSON.stringify({
        status: artistDashboard.status,
        matched: Boolean(updatedDelivery.matched_at),
        delivered: Boolean(updatedDelivery.delivered_at),
        opened: Boolean(updatedDelivery.opened_at),
        reviewed: Boolean(updatedDelivery.reviewed_at),
        accepted: Boolean(updatedDelivery.accepted_at),
        playlist_added: Boolean(updatedDelivery.playlist_added_at),
        playlist_added_count: artistDashboard.playlist_added_count,
      })
    );

    const pitchAnalytics = await requireOk("pitch analytics", await artistClient.from("playlist_pitch_delivery_tracking").select("*").eq("pitch_id", pitch.id).single());
    const adminAnalytics = await requireOk("admin analytics", await superAdminClient.from("free_playlist_pitch_admin_analytics").select("*").maybeSingle());
    evidence.checks.analytics = pass(
      Number(pitchAnalytics.pitch_success_rate || 0) > 0
        && Number(adminAnalytics?.curator_acceptance_rate || 0) > 0
        && Number(adminAnalytics?.playlist_reach || 0) > 0,
      JSON.stringify({
        pitch_success_rate: pitchAnalytics.pitch_success_rate,
        curator_acceptance_rate: adminAnalytics?.curator_acceptance_rate,
        playlist_reach: adminAnalytics?.playlist_reach,
      })
    );

    const adminQueue = await requireOk("admin dashboard queue", await superAdminClient.from("playlist_pitch_admin_queue").select("*").eq("id", pitch.id).single());
    evidence.checks.adminDashboard = pass(Boolean(adminQueue.id) && Number(adminQueue.playlist_added_count || 0) >= 1, JSON.stringify({ id: adminQueue.id, status: adminQueue.status, playlist_added_count: adminQueue.playlist_added_count }));

    const roleChecks = {};
    const roleQueries = [
      ["artist", artistClient],
      ["label", labelClient],
      ["publisher", publisherClient],
      ["super_admin", superAdminClient],
    ];
    for (const [role, client] of roleQueries) {
      const dash = await client.from("playlist_pitch_artist_dashboard").select("id,status,playlist_added_count").eq("id", pitch.id).maybeSingle();
      roleChecks[`${role}_artist_dashboard`] = !dash.error && dash.data?.id === pitch.id;
    }
    const artistAdmin = await artistClient.from("free_playlist_pitch_admin_analytics").select("*").maybeSingle();
    roleChecks.artist_admin_analytics_blocked_or_empty = Boolean(artistAdmin.error || !artistAdmin.data);
    const superAdminAdmin = await superAdminClient.from("free_playlist_pitch_admin_analytics").select("*").maybeSingle();
    roleChecks.super_admin_admin_analytics_allowed = !superAdminAdmin.error && Boolean(superAdminAdmin.data);
    evidence.checks.rls = pass(Object.values(roleChecks).every(Boolean), JSON.stringify(roleChecks));

    evidence.summary = {
      liveDatabase: evidence.checks.tables.ok && evidence.checks.realPitch.ok && evidence.checks.playlistPitchesRow.ok && evidence.checks.curatorDeliveries.ok && evidence.checks.curatorResponses.ok && evidence.checks.playlistAdditionEvidence.ok,
      curatorRouting: evidence.checks.curatorRouting.ok,
      artistDashboard: evidence.checks.artistDashboard.ok,
      adminDashboard: evidence.checks.adminDashboard.ok,
      analytics: evidence.checks.analytics.ok,
      rls: evidence.checks.rls.ok,
    };
  } catch (error) {
    evidence.error = error.message;
    evidence.summary = evidence.summary ?? {
      liveDatabase: false,
      curatorRouting: false,
      artistDashboard: false,
      adminDashboard: false,
      analytics: false,
      rls: false,
    };
  }

  evidence.completedAt = new Date().toISOString();
  const score = Object.values(evidence.summary).filter(Boolean).length;
  const total = Object.values(evidence.summary).length;
  evidence.finalProductionScore = `${score}/${total}`;

  const lines = [
    "# Playlist Pitching Live Verification",
    "",
    `Run ID: ${evidence.runId}`,
    `Started: ${evidence.startedAt}`,
    `Completed: ${evidence.completedAt}`,
    "",
    "## Final Status",
    "",
    `- LIVE DATABASE: ${evidence.summary.liveDatabase ? "PASS" : "FAIL"}`,
    `- CURATOR ROUTING: ${evidence.summary.curatorRouting ? "PASS" : "FAIL"}`,
    `- ARTIST DASHBOARD: ${evidence.summary.artistDashboard ? "PASS" : "FAIL"}`,
    `- ADMIN DASHBOARD: ${evidence.summary.adminDashboard ? "PASS" : "FAIL"}`,
    `- ANALYTICS: ${evidence.summary.analytics ? "PASS" : "FAIL"}`,
    `- RLS: ${evidence.summary.rls ? "PASS" : "FAIL"}`,
    "",
    `Final Production Score: ${evidence.finalProductionScore}`,
    "",
    "## Evidence IDs",
    "",
    "```json",
    JSON.stringify(evidence.ids, null, 2),
    "```",
    "",
    "## Step Evidence",
    "",
    ...Object.entries(evidence.checks).map(([key, value]) => `- ${key}: ${value.status} - ${value.detail}`),
  ];
  if (evidence.error) {
    lines.push("", "## Error", "", evidence.error);
  }

  await mkdir("reports", { recursive: true });
  await writeFile("reports/playlist-pitching-live-verification.md", `${lines.join("\n")}\n`, "utf8");
  console.log(JSON.stringify({
    runId: evidence.runId,
    summary: evidence.summary,
    finalProductionScore: evidence.finalProductionScore,
    report: "reports/playlist-pitching-live-verification.md",
    error: evidence.error ?? null,
  }, null, 2));

  if (Object.values(evidence.summary).some((ok) => !ok)) {
    process.exitCode = 1;
  }
}

main().catch(async (error) => {
  await mkdir("reports", { recursive: true });
  await writeFile("reports/playlist-pitching-live-verification.md", `# Playlist Pitching Live Verification\n\nLIVE DATABASE: FAIL\n\nError: ${error.message}\n`, "utf8");
  console.error(JSON.stringify({ error: error.message, report: "reports/playlist-pitching-live-verification.md" }, null, 2));
  process.exitCode = 1;
});
