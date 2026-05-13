// Brand-styled HTML email templates (pink + white).
const BRAND = {
  primary: "#ec4899",
  primaryDark: "#be185d",
  bg: "#ffffff",
  text: "#1f2937",
  muted: "#6b7280",
  site: "https://tracksyra.com",
  name: "TrackSyra",
};

const layout = (title: string, body: string, cta?: { label: string; url: string }) => `
<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title></head>
<body style="margin:0;padding:0;background:#fdf2f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:${BRAND.text};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fdf2f8;padding:32px 12px;">
  <tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:${BRAND.bg};border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(236,72,153,0.10);">
      <tr><td style="background:linear-gradient(135deg,${BRAND.primary},${BRAND.primaryDark});padding:28px 32px;text-align:center;">
        <div style="font-size:26px;font-weight:800;color:#fff;letter-spacing:-0.5px;">${BRAND.name}</div>
        <div style="font-size:12px;color:#fce7f3;margin-top:4px;">Music Distribution Platform</div>
      </td></tr>
      <tr><td style="padding:32px;">
        <h1 style="margin:0 0 16px;font-size:22px;color:${BRAND.text};">${title}</h1>
        <div style="font-size:15px;line-height:1.6;color:${BRAND.text};">${body}</div>
        ${cta ? `<div style="text-align:center;margin:28px 0 8px;">
          <a href="${cta.url}" style="display:inline-block;background:${BRAND.primary};color:#fff;text-decoration:none;padding:14px 28px;border-radius:999px;font-weight:600;font-size:15px;">${cta.label}</a>
        </div>` : ""}
      </td></tr>
      <tr><td style="background:#fdf2f8;padding:20px 32px;text-align:center;border-top:1px solid #fce7f3;">
        <div style="font-size:12px;color:${BRAND.muted};margin-bottom:8px;">Follow us</div>
        <div style="font-size:12px;color:${BRAND.muted};">
          <a href="#" style="color:${BRAND.primary};text-decoration:none;margin:0 6px;">Instagram</a>·
          <a href="#" style="color:${BRAND.primary};text-decoration:none;margin:0 6px;">Twitter</a>·
          <a href="#" style="color:${BRAND.primary};text-decoration:none;margin:0 6px;">YouTube</a>
        </div>
        <div style="font-size:11px;color:${BRAND.muted};margin-top:12px;">© ${new Date().getFullYear()} ${BRAND.name}. All rights reserved.</div>
      </td></tr>
    </table>
  </td></tr></table></body></html>`;

const stripHtml = (s: string) => s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

export function renderTemplate(name: string, data: Record<string, any>) {
  const n = (data.name as string) || "Artist";
  let title = "Hello from TrackSyra";
  let body = `<p>Hi ${n},</p><p>Thanks for being part of TrackSyra.</p>`;
  let cta: { label: string; url: string } | undefined = { label: "Open Dashboard", url: `${BRAND.site}/dashboard` };

  switch (name) {
    case "welcome":
      title = `Welcome to TrackSyra, ${n}! 🎵`;
      body = `<p>Hi ${n},</p><p>Your account is ready. Start uploading songs, pitch playlists, and track your royalties — all from one beautiful dashboard.</p>`;
      break;
    case "form_approved":
      title = "Your application is approved 🎉";
      body = `<p>Hi ${n || "there"},</p><p>Great news — your <strong>${data.form_type || "application"}</strong> has been approved. Our team will reach out shortly with next steps.</p>${data.notes ? `<p style="background:#fdf2f8;padding:12px;border-radius:8px;font-size:13px;">Note from team: ${data.notes}</p>` : ""}`;
      break;
    case "form_rejected":
      title = "Update on your application";
      body = `<p>Hi ${n || "there"},</p><p>Thanks for your interest in TrackSyra. After review, we're unable to move forward at this time.</p>${data.notes ? `<p style="background:#fdf2f8;padding:12px;border-radius:8px;font-size:13px;">Reason: ${data.notes}</p>` : ""}<p>You're welcome to apply again anytime.</p>`;
      cta = undefined;
      break;
    case "song_approved":
      title = `Your song "${data.title}" is approved ✅`;
      body = `<p>Hi ${n},</p><p>Your artist profile has been approved and you can now distribute music on Track Syra.</p><p>"<strong>${data.title}</strong>" by ${data.artist} is now being delivered to platforms.</p>`;
      break;
    case "song_rejected":
      title = `Action needed on "${data.title}"`;
      body = `<p>Hi ${n},</p><p>Your song <strong>${data.title}</strong> needs some changes before we can distribute it. Please review and resubmit from your dashboard.</p>`;
      break;
    case "pitch_approved":
      title = "Playlist pitch approved 🎯";
      body = `<p>Hi ${n},</p><p>Your pitch to <strong>${data.playlist}</strong> on ${data.platform} was approved by our curation team.</p>${data.notes ? `<p style="background:#fdf2f8;padding:12px;border-radius:8px;font-size:13px;">${data.notes}</p>` : ""}`;
      break;
    case "pitch_rejected":
      title = "Update on your playlist pitch";
      body = `<p>Hi ${n},</p><p>Your pitch to <strong>${data.playlist}</strong> wasn't selected this round. Keep creating — we'd love to see your next track.</p>${data.notes ? `<p style="background:#fdf2f8;padding:12px;border-radius:8px;font-size:13px;">${data.notes}</p>` : ""}`;
      cta = undefined;
      break;
    case "purchase":
      title = "Payment received ✓";
      body = `<p>Hi ${n},</p><p>Thanks for your purchase of <strong>${data.plan || "TrackSyra Plan"}</strong> for ₹${data.amount || ""}. Your distribution credits are now active.</p>`;
      break;
    case "test":
      title = "SMTP test successful ✓";
      body = `<p>If you're reading this, your SMTP credentials are working perfectly.</p>`;
      cta = undefined;
      break;
  }

  const html = layout(title, body, cta);
  return { html, text: stripHtml(body) };
}
