-- Standardize database-triggered outbound email templates on the branded HTML layout.

CREATE OR REPLACE FUNCTION public.email_brand_layout(
  p_title TEXT,
  p_body TEXT,
  p_cta_label TEXT DEFAULT 'Open Dashboard',
  p_cta_url TEXT DEFAULT 'https://hello.tracksyra.com/dashboard'
) RETURNS TEXT
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  RETURN
    '<!doctype html><html><head><meta charset="utf-8">' ||
    '<meta name="viewport" content="width=device-width,initial-scale=1">' ||
    '<title>' || public.email_escape_html(p_title) || '</title></head>' ||
    '<body data-tracksyra-email="branded" style="margin:0;padding:0;background:#fdf2f8;font-family:-apple-system,BlinkMacSystemFont,''Segoe UI'',Arial,sans-serif;color:#1f2937;">' ||
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fdf2f8;padding:24px 12px;"><tr><td align="center">' ||
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #fce7f3;">' ||
    '<tr><td style="background:#ec4899;padding:28px 28px;text-align:center;">' ||
    '<div style="font-size:28px;line-height:1;font-weight:800;color:#ffffff;">TrackSyra</div>' ||
    '<div style="font-size:13px;line-height:1.5;color:#fce7f3;margin-top:6px;">Music Distribution Platform</div>' ||
    '</td></tr><tr><td style="padding:30px 28px;">' ||
    '<h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;color:#1f2937;">' || public.email_escape_html(p_title) || '</h1>' ||
    '<div style="font-size:15px;line-height:1.65;color:#1f2937;">' || COALESCE(p_body, '') || '</div>' ||
    '<div style="text-align:center;margin:28px 0 4px;">' ||
    '<a href="' || public.email_escape_html(p_cta_url) || '" style="display:inline-block;background:#ec4899;color:#ffffff;text-decoration:none;padding:13px 24px;border-radius:999px;font-weight:700;font-size:15px;">' ||
    public.email_escape_html(p_cta_label) || '</a></div>' ||
    '</td></tr><tr><td style="background:#fff7fb;padding:20px 28px;text-align:center;border-top:1px solid #fce7f3;">' ||
    '<div style="font-size:12px;line-height:1.6;color:#6b7280;">Need help? Contact <a href="mailto:support@tracksyra.com" style="color:#ec4899;text-decoration:none;">support@tracksyra.com</a></div>' ||
    '<div style="font-size:11px;line-height:1.6;color:#6b7280;margin-top:10px;">Copyright ' || EXTRACT(YEAR FROM now())::TEXT || ' TrackSyra. All rights reserved.</div>' ||
    '</td></tr></table></td></tr></table></body></html>';
END;
$$;

CREATE OR REPLACE FUNCTION public.email_template_html(
  p_template_type TEXT,
  p_payload JSONB
) RETURNS TEXT
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_template TEXT := lower(COALESCE(p_template_type, ''));
  v_name TEXT := public.email_escape_html(COALESCE(p_payload->>'name', 'Artist'));
  v_email TEXT := public.email_escape_html(COALESCE(p_payload->>'email', 'no email'));
  v_form_type TEXT := public.email_escape_html(COALESCE(p_payload->>'form_type', 'application'));
  v_notes TEXT := public.email_escape_html(COALESCE(p_payload->>'notes', ''));
  v_artist_id TEXT := public.email_escape_html(COALESCE(p_payload->>'artist_id', ''));
  v_body TEXT;
BEGIN
  IF v_template IN ('artist_pending', 'artist_request_pending', 'welcome') THEN
    IF v_template = 'welcome' THEN
      v_body := '<p>Hi ' || v_name || ',</p><p>Your account is ready. Start uploading songs, pitch playlists, and track your royalties from one dashboard.</p>';
      RETURN public.email_brand_layout('Welcome to TrackSyra, ' || v_name || '!', v_body, 'Open Dashboard', 'https://hello.tracksyra.com/dashboard');
    END IF;
    v_body := '<p>Hi ' || v_name || ',</p><p>Your request is under review. We will notify you once approved.</p>';
    RETURN public.email_brand_layout('Your artist request is pending', v_body, 'Open Dashboard', 'https://hello.tracksyra.com/dashboard');
  ELSIF v_template IN ('artist_approved', 'artist_request_approved') THEN
    v_body := '<p>Hi ' || v_name || ',</p><p>Your request is approved.</p><p>Your Artist ID is: <strong>' || v_artist_id || '</strong></p><p>You can now log in to your artist dashboard and upload releases.</p>';
    RETURN public.email_brand_layout('Your artist request is approved', v_body, 'Open Dashboard', 'https://hello.tracksyra.com/dashboard');
  ELSIF v_template IN ('artist_rejected', 'artist_request_rejected') THEN
    v_body := '<p>Hi ' || v_name || ',</p><p>Your artist request was not approved at this time.</p>' ||
      CASE WHEN v_notes <> '' THEN '<p><strong>Note:</strong> ' || v_notes || '</p>' ELSE '' END;
    RETURN public.email_brand_layout('Update on your artist request', v_body, 'Contact Support', 'mailto:support@tracksyra.com');
  ELSIF v_template = 'form_approved' THEN
    v_body := '<p>Hi ' || v_name || ',</p><p>Great news. Your <strong>' || v_form_type || '</strong> has been approved.</p>' ||
      CASE WHEN v_notes <> '' THEN '<p><strong>Note:</strong> ' || v_notes || '</p>' ELSE '' END;
    RETURN public.email_brand_layout('Your application is approved', v_body, 'Open Dashboard', 'https://hello.tracksyra.com/dashboard');
  ELSIF v_template = 'form_rejected' THEN
    v_body := '<p>Hi ' || v_name || ',</p><p>Thanks for your interest in TrackSyra. After review, we are unable to move forward at this time.</p>' ||
      CASE WHEN v_notes <> '' THEN '<p><strong>Reason:</strong> ' || v_notes || '</p>' ELSE '' END;
    RETURN public.email_brand_layout('Update on your application', v_body, 'Contact Support', 'mailto:support@tracksyra.com');
  ELSIF v_template = 'contact_form_notification' THEN
    v_body := '<p>Hi Admin,</p><p>A new TrackSyra contact form submission needs review.</p><p><strong>From:</strong> ' || v_name || ' (' || v_email || ')</p><p><strong>Type:</strong> ' || v_form_type || '</p>';
    RETURN public.email_brand_layout('New contact form submission', v_body, 'Open Admin', 'https://hello.tracksyra.com/admin');
  ELSIF v_template = 'admin_notification' THEN
    v_body := '<p>Hi Admin,</p><p>' || public.email_escape_html(COALESCE(p_payload->>'message', 'A TrackSyra admin event requires review.')) || '</p>';
    RETURN public.email_brand_layout('TrackSyra admin notification', v_body, 'Open Admin', 'https://hello.tracksyra.com/admin');
  END IF;

  v_body := '<p>Hi ' || v_name || ',</p><p>' || public.email_escape_html(COALESCE(NULLIF(p_payload->>'message', ''), 'Thanks for being part of TrackSyra.')) || '</p>';
  RETURN public.email_brand_layout('Hello from TrackSyra', v_body, 'Open Dashboard', 'https://hello.tracksyra.com/dashboard');
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_contact_form_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.queue_email(
    'support@tracksyra.com',
    'TrackSyra Admin',
    'New contact form submission',
    'contact_form_notification',
    jsonb_build_object(
      'name', COALESCE(NEW.name, 'Unknown'),
      'email', COALESCE(NEW.email, ''),
      'form_type', COALESCE(NEW.form_type, 'Contact form'),
      'message', 'A new contact form submission needs review.'
    ),
    'form_submissions',
    NEW.id
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS form_submissions_contact_notification_email ON public.form_submissions;
CREATE TRIGGER form_submissions_contact_notification_email
AFTER INSERT ON public.form_submissions
FOR EACH ROW EXECUTE FUNCTION public.notify_contact_form_insert();

REVOKE EXECUTE ON FUNCTION public.email_brand_layout(TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_contact_form_insert() FROM PUBLIC, anon, authenticated;
