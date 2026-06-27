const BRAND = {
  primary: "#ec4899",
  primaryDark: "#be185d",
  bg: "#ffffff",
  text: "#1f2937",
  muted: "#6b7280",
  site: "https://hello.tracksyra.com",
  dashboard: "https://hello.tracksyra.com/dashboard",
  support: "support@tracksyra.com",
  name: "TrackSyra",
};

const escapeHtml = (value: unknown) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

const layout = (title: string, body: string, cta: { label: string; url: string }) => `
<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${title}</title>
</head>
<body data-tracksyra-email="branded" style="margin:0;padding:0;background:#fdf2f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:${BRAND.text};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fdf2f8;padding:32px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:${BRAND.bg};border-radius:14px;overflow:hidden;border:1px solid #fce7f3;">
        <tr><td style="background:${BRAND.primary};background:linear-gradient(135deg,${BRAND.primary},${BRAND.primaryDark});padding:28px 32px;text-align:center;">
          <div style="font-size:28px;line-height:1;font-weight:800;color:#fff;">${BRAND.name}</div>
          <div style="font-size:12px;color:#fce7f3;margin-top:6px;">Music Distribution Platform</div>
        </td></tr>
        <tr><td style="padding:32px;">
          <h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;color:${BRAND.text};">${title}</h1>
          <div style="font-size:15px;line-height:1.6;color:${BRAND.text};">${body}</div>
          <div style="text-align:center;margin:28px 0 8px;">
            <a href="${cta.url}" style="display:inline-block;background:${BRAND.primary};color:#fff;text-decoration:none;padding:14px 28px;border-radius:999px;font-weight:700;font-size:15px;">${cta.label}</a>
          </div>
        </td></tr>
        <tr><td style="background:#fff7fb;padding:20px 32px;text-align:center;border-top:1px solid #fce7f3;">
          <div style="font-size:12px;line-height:1.6;color:${BRAND.muted};">Need help? Contact <a href="mailto:${BRAND.support}" style="color:${BRAND.primary};text-decoration:none;">${BRAND.support}</a></div>
          <div style="font-size:11px;color:${BRAND.muted};margin-top:12px;">Copyright ${new Date().getFullYear()} ${BRAND.name}. All rights reserved.</div>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

const stripHtml = (value: string) => value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

export function renderTemplate(name: string, data: Record<string, any>) {
  const template = String(name || "").toLowerCase();
  const person = escapeHtml(data.name || (template.includes("admin") || template.includes("contact_form") ? "Admin" : "Artist"));
  const notes = data.notes ? `<p style="background:#fdf2f8;padding:12px;border-radius:8px;font-size:13px;"><strong>Note:</strong> ${escapeHtml(data.notes)}</p>` : "";
  const formType = escapeHtml(data.form_type || "application");
  const dashboardUrl = escapeHtml(data.dashboard_url || BRAND.dashboard);

  let title = "Hello from TrackSyra";
  let body = `<p>Hi ${person},</p><p>Thanks for being part of TrackSyra.</p>`;
  let cta = { label: "Open Dashboard", url: dashboardUrl };

  switch (template) {
    case "artist_request_pending":
    case "artist_pending":
    case "welcome":
      title = template === "welcome" ? `Welcome to TrackSyra, ${person}!` : "Your artist request is pending";
      body = template === "welcome"
        ? `<p>Hi ${person},</p><p>Your account is ready. Start uploading songs, pitch playlists, and track your royalties from one dashboard.</p>`
        : `<p>Hi ${person},</p><p>Your request is under review. We will notify you once approved.</p>`;
      break;
    case "artist_request_approved":
    case "artist_approved":
      title = "Your artist request is approved";
      body = `<p>Hi ${person},</p><p>Your request is approved.</p><p>Your Artist ID is: <strong>${escapeHtml(data.artist_id)}</strong></p><p>You can now access your dashboard, upload releases, and use distribution tools.</p>`;
      break;
    case "artist_request_rejected":
    case "artist_rejected":
      title = "Update on your artist request";
      body = `<p>Hi ${person},</p><p>Your artist request was not approved at this time.</p>${notes}`;
      cta = { label: "Contact Support", url: `mailto:${BRAND.support}` };
      break;
    case "form_approved":
      title = "Your application is approved";
      body = `<p>Hi ${person},</p><p>Great news. Your <strong>${formType}</strong> has been approved. Our team will reach out shortly with next steps.</p>${notes}`;
      break;
    case "form_rejected":
      title = "Update on your application";
      body = `<p>Hi ${person},</p><p>Thanks for your interest in TrackSyra. After review, we are unable to move forward at this time.</p>${notes}<p>You are welcome to apply again anytime.</p>`;
      cta = { label: "Contact Support", url: `mailto:${BRAND.support}` };
      break;
    case "contact_form_notification":
      title = "New contact form submission";
      body = `<p>Hi Admin,</p><p>A new TrackSyra contact form submission needs review.</p><p><strong>From:</strong> ${person} (${escapeHtml(data.email || "no email")})</p><p><strong>Type:</strong> ${formType}</p>`;
      cta = { label: "Open Admin", url: `${BRAND.site}/admin` };
      break;
    case "admin_notification":
      title = "TrackSyra admin notification";
      body = `<p>Hi Admin,</p><p>${escapeHtml(data.message || "A TrackSyra admin event requires review.")}</p>`;
      cta = { label: "Open Admin", url: `${BRAND.site}/admin` };
      break;
    case "song_approved":
      title = `Your song "${escapeHtml(data.title)}" is approved`;
      body = `<p>Hi ${person},</p><p>Your artist profile has been approved and you can now distribute music on TrackSyra.</p><p><strong>${escapeHtml(data.title)}</strong> by ${escapeHtml(data.artist)} is now being delivered to platforms.</p>`;
      break;
    case "song_rejected":
      title = `Action needed on "${escapeHtml(data.title)}"`;
      body = `<p>Hi ${person},</p><p>Your song <strong>${escapeHtml(data.title)}</strong> needs changes before we can distribute it. Please review and resubmit from your dashboard.</p>${notes}`;
      break;
    case "release_approved":
      title = `Release approved: ${escapeHtml(data.release_title || data.title)}`;
      body = `<p>Hi ${person},</p><p>Your release <strong>${escapeHtml(data.release_title || data.title)}</strong> was approved and queued for distribution.</p>`;
      break;
    case "release_rejected":
      title = `Release rejected: ${escapeHtml(data.release_title || data.title)}`;
      body = `<p>Hi ${person},</p><p>Your release <strong>${escapeHtml(data.release_title || data.title)}</strong> was rejected by our review team.</p><p>${escapeHtml(data.message || data.notes || "Review the admin note in your dashboard before resubmitting.")}</p>`;
      break;
    case "release_changes_requested":
      title = `Changes requested: ${escapeHtml(data.release_title || data.title)}`;
      body = `<p>Hi ${person},</p><p>Our review team requested changes for <strong>${escapeHtml(data.release_title || data.title)}</strong>.</p><p>${escapeHtml(data.message || data.notes || "Open your dashboard to review the requested changes.")}</p>`;
      break;
    case "playlist_pitch_submitted":
      title = "Playlist pitch submitted";
      body = `<p>Hi ${person},</p><p>Your playlist pitch has entered editorial review. We will notify you when the curation team makes a decision.</p>${notes}`;
      break;
    case "pitch_approved":
      title = "Playlist pitch approved";
      body = `<p>Hi ${person},</p><p>Your pitch to <strong>${escapeHtml(data.playlist)}</strong> on ${escapeHtml(data.platform)} was approved by our curation team.</p>${notes}`;
      break;
    case "pitch_rejected":
      title = "Update on your playlist pitch";
      body = `<p>Hi ${person},</p><p>Your pitch to <strong>${escapeHtml(data.playlist)}</strong> was not selected this round.</p>${notes}`;
      break;
    case "playlist_pitch_accepted":
      title = "A curator accepted your pitch";
      body = `<p>Hi ${person},</p><p>A curator accepted your playlist pitch. Placement reach and response details are now available in your dashboard.</p>${notes}`;
      break;
    case "playlist_pitch_update":
      title = "Playlist pitch status updated";
      body = `<p>Hi ${person},</p><p>Your playlist pitch status changed. Open your dashboard for the latest review and curator details.</p>${notes}`;
      break;
    case "curator_pitch_submitted":
      title = "Curator pitch submitted";
      body = `<p>Hi ${person},</p><p>Your curator outreach was submitted. We will track views, responses, and curator feedback in your marketplace dashboard.</p>${notes}`;
      break;
    case "curator_pitch_accepted":
      title = "A curator accepted your pitch";
      body = `<p>Hi ${person},</p><p>A curator accepted your pitch. Open the curator marketplace to review the placement details and feedback.</p>${notes}`;
      break;
    case "curator_pitch_rejected":
      title = "Update on your curator pitch";
      body = `<p>Hi ${person},</p><p>Your curator pitch was not accepted this time. Review the feedback and use it to refine future outreach.</p>${notes}`;
      break;
    case "curator_response_received":
      title = "Curator response received";
      body = `<p>Hi ${person},</p><p>A curator responded to your pitch. The response and notes are available in your curator marketplace outreach history.</p>${notes}`;
      break;
    case "test":
      title = "SMTP test successful";
      body = `<p>Hi Admin,</p><p>If you are reading this, your SMTP credentials are working.</p>`;
      cta = { label: "Open Admin", url: `${BRAND.site}/admin` };
      break;
  }

  const html = layout(title, body, cta);
  return { html, text: stripHtml(body) };
}
