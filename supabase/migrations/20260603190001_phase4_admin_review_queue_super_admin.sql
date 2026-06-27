CREATE OR REPLACE FUNCTION public.is_super_admin(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(p_user_id, 'super_admin'::public.app_role);
$$;

CREATE OR REPLACE FUNCTION public.is_review_admin(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(p_user_id, 'admin'::public.app_role) OR public.has_role(p_user_id, 'super_admin'::public.app_role);
$$;

DROP POLICY IF EXISTS "artists view own review queue" ON public.review_queue;
CREATE POLICY "artists view own review queue"
ON public.review_queue
FOR SELECT
USING (artist_id = auth.uid());

DROP POLICY IF EXISTS "assigned admins view review queue" ON public.review_queue;
CREATE POLICY "assigned admins view review queue"
ON public.review_queue
FOR SELECT
USING (
  public.is_super_admin(auth.uid())
  OR (public.has_role(auth.uid(), 'admin'::public.app_role) AND (assigned_admin IS NULL OR assigned_admin = auth.uid()))
);

DROP POLICY IF EXISTS "super admins manage review queue" ON public.review_queue;
CREATE POLICY "super admins manage review queue"
ON public.review_queue
FOR ALL
USING (public.is_super_admin(auth.uid()))
WITH CHECK (public.is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "artists view own review audit" ON public.review_audit_log;

DROP POLICY IF EXISTS "admins view assigned review audit" ON public.review_audit_log;
CREATE POLICY "admins view assigned review audit"
ON public.review_audit_log
FOR SELECT
USING (
  public.is_super_admin(auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.review_queue q
    WHERE q.release_id = review_audit_log.release_id
      AND public.has_role(auth.uid(), 'admin'::public.app_role)
      AND (q.assigned_admin IS NULL OR q.assigned_admin = auth.uid())
  )
);

DROP POLICY IF EXISTS "super admins manage review audit" ON public.review_audit_log;
CREATE POLICY "super admins manage review audit"
ON public.review_audit_log
FOR ALL
USING (public.is_super_admin(auth.uid()))
WITH CHECK (public.is_super_admin(auth.uid()));

CREATE OR REPLACE FUNCTION public.calculate_release_validation_score(p_release_id UUID)
RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH latest AS (
    SELECT DISTINCT ON (validation_type)
      validation_type,
      status
    FROM public.media_validation_results
    WHERE release_id = p_release_id
    ORDER BY validation_type, created_at DESC, id DESC
  )
  SELECT COALESCE(
    ROUND(
      100.0 * SUM(CASE WHEN status = 'passed' THEN 1 WHEN status = 'warning' THEN 0.5 ELSE 0 END)
      / NULLIF(COUNT(*), 0)
    )::INTEGER,
    0
  )
  FROM latest;
$$;

CREATE OR REPLACE FUNCTION public.notify_release_review_event(
  p_release_id UUID,
  p_notification_type TEXT,
  p_title TEXT,
  p_message TEXT,
  p_email_template TEXT DEFAULT NULL,
  p_subject TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_release RECORD;
  v_email TEXT;
  v_name TEXT;
BEGIN
  SELECT r.*, p.full_name, p.artist_name
  INTO v_release
  FROM public.releases r
  LEFT JOIN public.profiles p ON p.id = r.user_id
  WHERE r.id = p_release_id;

  IF v_release.id IS NULL THEN
    RETURN;
  END IF;

  IF to_regclass('public.app_notifications') IS NOT NULL THEN
    INSERT INTO public.app_notifications (user_id, title, message, notification_type, entity_table, entity_id)
    VALUES (v_release.user_id, p_title, p_message, p_notification_type, 'releases', p_release_id);
  END IF;

  IF p_email_template IS NOT NULL AND to_regprocedure('public.queue_email(text,text,text,text,jsonb,text,uuid)') IS NOT NULL THEN
    SELECT email INTO v_email FROM auth.users WHERE id = v_release.user_id;
    v_name := COALESCE(v_release.artist_name, v_release.full_name, v_release.primary_artist, 'Artist');
    IF v_email IS NOT NULL THEN
      PERFORM public.queue_email(
        v_email,
        v_name,
        COALESCE(p_subject, p_title),
        p_email_template,
        jsonb_build_object(
          'release_id', p_release_id,
          'release_title', v_release.title,
          'artist_name', v_release.primary_artist,
          'message', p_message
        ),
        'releases',
        p_release_id
      );
    END IF;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_admin_review_event(
  p_release_id UUID,
  p_notification_type TEXT,
  p_title TEXT,
  p_message TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin RECORD;
BEGIN
  IF to_regclass('public.app_notifications') IS NULL THEN
    RETURN;
  END IF;

  FOR v_admin IN
    SELECT DISTINCT user_id
    FROM public.user_roles
    WHERE role IN ('admin'::public.app_role, 'super_admin'::public.app_role)
  LOOP
    INSERT INTO public.app_notifications (user_id, title, message, notification_type, entity_table, entity_id)
    VALUES (v_admin.user_id, p_title, p_message, p_notification_type, 'releases', p_release_id);
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.enqueue_release_for_review(p_release_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_release RECORD;
  v_queue_id UUID;
  v_score INTEGER;
BEGIN
  SELECT * INTO v_release FROM public.releases WHERE id = p_release_id;
  IF v_release.id IS NULL THEN
    RAISE EXCEPTION 'Release % not found', p_release_id;
  END IF;

  v_score := public.calculate_release_validation_score(p_release_id);

  INSERT INTO public.review_queue (release_id, artist_id, queue_status, validation_score)
  VALUES (p_release_id, v_release.user_id, 'pending', v_score)
  ON CONFLICT (release_id) DO UPDATE
    SET queue_status = CASE
          WHEN public.review_queue.queue_status IN ('approved','rejected') THEN public.review_queue.queue_status
          ELSE 'pending'::public.review_queue_status
        END,
        validation_score = EXCLUDED.validation_score,
        updated_at = now()
  RETURNING id INTO v_queue_id;

  UPDATE public.releases
  SET status = 'under_review'::public.release_status,
      rejection_reason = NULL
  WHERE id = p_release_id
    AND status = 'validation_passed'::public.release_status;

  PERFORM public.notify_release_review_event(
    p_release_id,
    'release_review_started',
    'Release review started',
    'Your release "' || v_release.title || '" is now in admin review.',
    NULL,
    NULL
  );

  PERFORM public.notify_admin_review_event(
    p_release_id,
    'review_queue_new_item',
    'New release review item',
    'Release "' || v_release.title || '" is ready for review.'
  );

  RETURN v_queue_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_validation_passed_review_queue()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'validation_passed'::public.release_status
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status) THEN
    PERFORM public.enqueue_release_for_review(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validation_passed_review_queue ON public.releases;
CREATE TRIGGER trg_validation_passed_review_queue
AFTER INSERT OR UPDATE OF status ON public.releases
FOR EACH ROW
EXECUTE FUNCTION public.handle_validation_passed_review_queue();

CREATE OR REPLACE FUNCTION public.assert_can_review_queue(p_queue_id UUID)
RETURNS public.review_queue
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_queue public.review_queue;
BEGIN
  SELECT * INTO v_queue
  FROM public.review_queue
  WHERE id = p_queue_id
  FOR UPDATE;

  IF v_queue.id IS NULL THEN
    RAISE EXCEPTION 'Review queue item % not found', p_queue_id;
  END IF;

  IF NOT public.is_review_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Admin role required';
  END IF;

  IF v_queue.assigned_admin IS NOT NULL
     AND v_queue.assigned_admin <> auth.uid()
     AND NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only the assigned admin can review this release';
  END IF;

  RETURN v_queue;
END;
$$;

CREATE OR REPLACE FUNCTION public.assign_review_queue_item(
  p_queue_id UUID,
  p_admin_id UUID,
  p_notes TEXT
)
RETURNS public.review_queue
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_queue public.review_queue;
BEGIN
  IF NOT public.is_review_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Admin role required';
  END IF;

  IF p_notes IS NULL OR length(trim(p_notes)) = 0 THEN
    RAISE EXCEPTION 'Assignment notes are required';
  END IF;

  SELECT * INTO v_queue FROM public.review_queue WHERE id = p_queue_id FOR UPDATE;
  IF v_queue.id IS NULL THEN
    RAISE EXCEPTION 'Review queue item % not found', p_queue_id;
  END IF;

  IF v_queue.assigned_admin IS NOT NULL
     AND v_queue.assigned_admin <> auth.uid()
     AND NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only the assigned admin or super admin can reassign this item';
  END IF;

  IF NOT public.is_review_admin(p_admin_id) THEN
    RAISE EXCEPTION 'Assigned user must be an admin';
  END IF;

  UPDATE public.review_queue
  SET assigned_admin = p_admin_id,
      queue_status = CASE WHEN queue_status = 'pending' THEN 'in_review'::public.review_queue_status ELSE queue_status END,
      first_reviewed_at = COALESCE(first_reviewed_at, now()),
      updated_at = now()
  WHERE id = p_queue_id
  RETURNING * INTO v_queue;

  INSERT INTO public.review_audit_log (release_id, review_queue_id, admin_id, action, notes)
  VALUES (v_queue.release_id, v_queue.id, auth.uid(), 'assign', trim(p_notes));

  PERFORM public.notify_release_review_event(
    v_queue.release_id,
    'release_review_started',
    'Release review started',
    'An admin has started reviewing your release.',
    NULL,
    NULL
  );

  RETURN v_queue;
END;
$$;

CREATE OR REPLACE FUNCTION public.review_release_action(
  p_queue_id UUID,
  p_action public.review_action,
  p_notes TEXT
)
RETURNS public.review_queue
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_queue public.review_queue;
  v_release public.releases;
BEGIN
  IF p_notes IS NULL OR length(trim(p_notes)) = 0 THEN
    RAISE EXCEPTION 'Review note is required';
  END IF;

  v_queue := public.assert_can_review_queue(p_queue_id);
  SELECT * INTO v_release FROM public.releases WHERE id = v_queue.release_id FOR UPDATE;

  IF p_action = 'approve' THEN
    UPDATE public.review_queue
    SET queue_status = 'approved',
        reviewed_at = now(),
        approved_at = now(),
        first_reviewed_at = COALESCE(first_reviewed_at, now()),
        updated_at = now()
    WHERE id = p_queue_id
    RETURNING * INTO v_queue;

    UPDATE public.releases
    SET status = 'queued_for_distribution'::public.release_status,
        rejection_reason = NULL
    WHERE id = v_queue.release_id;

    PERFORM public.enqueue_distribution_for_release(v_queue.release_id);

    INSERT INTO public.review_audit_log (release_id, review_queue_id, admin_id, action, notes)
    VALUES (v_queue.release_id, v_queue.id, auth.uid(), 'approve', trim(p_notes));

    PERFORM public.notify_release_review_event(
      v_queue.release_id,
      'release_approved',
      'Release approved',
      'Your release "' || v_release.title || '" was approved and queued for distribution.',
      'release_approved',
      'Release approved: ' || v_release.title
    );

  ELSIF p_action = 'reject' THEN
    UPDATE public.review_queue
    SET queue_status = 'rejected',
        reviewed_at = now(),
        first_reviewed_at = COALESCE(first_reviewed_at, now()),
        updated_at = now()
    WHERE id = p_queue_id
    RETURNING * INTO v_queue;

    UPDATE public.releases
    SET status = 'rejected'::public.release_status,
        rejection_reason = trim(p_notes)
    WHERE id = v_queue.release_id;

    INSERT INTO public.review_audit_log (release_id, review_queue_id, admin_id, action, notes)
    VALUES (v_queue.release_id, v_queue.id, auth.uid(), 'reject', trim(p_notes));

    PERFORM public.notify_release_review_event(
      v_queue.release_id,
      'release_rejected',
      'Release rejected',
      'Your release "' || v_release.title || '" was rejected. Reason: ' || trim(p_notes),
      'release_rejected',
      'Release rejected: ' || v_release.title
    );

  ELSIF p_action = 'needs_changes' THEN
    UPDATE public.review_queue
    SET queue_status = 'needs_changes',
        reviewed_at = now(),
        first_reviewed_at = COALESCE(first_reviewed_at, now()),
        change_request_notes = trim(p_notes),
        updated_at = now()
    WHERE id = p_queue_id
    RETURNING * INTO v_queue;

    UPDATE public.releases
    SET status = 'draft'::public.release_status,
        rejection_reason = trim(p_notes)
    WHERE id = v_queue.release_id;

    INSERT INTO public.review_audit_log (release_id, review_queue_id, admin_id, action, notes)
    VALUES (v_queue.release_id, v_queue.id, auth.uid(), 'needs_changes', trim(p_notes));

    PERFORM public.notify_release_review_event(
      v_queue.release_id,
      'release_changes_requested',
      'Release changes requested',
      'Changes were requested for "' || v_release.title || '": ' || trim(p_notes),
      'release_changes_requested',
      'Release changes requested: ' || v_release.title
    );

  ELSIF p_action = 'escalate' THEN
    UPDATE public.review_queue
    SET priority = LEAST(100, priority + 25),
        queue_status = 'in_review',
        first_reviewed_at = COALESCE(first_reviewed_at, now()),
        escalation_reason = trim(p_notes),
        updated_at = now()
    WHERE id = p_queue_id
    RETURNING * INTO v_queue;

    INSERT INTO public.review_audit_log (release_id, review_queue_id, admin_id, action, notes)
    VALUES (v_queue.release_id, v_queue.id, auth.uid(), 'escalate', trim(p_notes));

    PERFORM public.notify_admin_review_event(
      v_queue.release_id,
      'review_escalated',
      'Review escalated',
      'A release review was escalated: "' || v_release.title || '".'
    );
  ELSE
    RAISE EXCEPTION 'Unsupported review action %', p_action;
  END IF;

  RETURN v_queue;
END;
$$;

CREATE OR REPLACE FUNCTION public.review_queue_metrics()
RETURNS TABLE (
  pending_count INTEGER,
  avg_review_time_hours NUMERIC,
  approvals_today INTEGER,
  rejection_rate NUMERIC
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COUNT(*) FILTER (WHERE queue_status IN ('pending','in_review'))::INTEGER AS pending_count,
    ROUND(AVG(EXTRACT(EPOCH FROM (COALESCE(reviewed_at, now()) - created_at)) / 3600.0) FILTER (WHERE reviewed_at IS NOT NULL), 2) AS avg_review_time_hours,
    COUNT(*) FILTER (WHERE queue_status = 'approved' AND approved_at::DATE = CURRENT_DATE)::INTEGER AS approvals_today,
    ROUND(
      100.0 * COUNT(*) FILTER (WHERE queue_status = 'rejected')
      / NULLIF(COUNT(*) FILTER (WHERE queue_status IN ('approved','rejected','needs_changes')), 0),
      2
    ) AS rejection_rate
  FROM public.review_queue
  WHERE public.is_review_admin(auth.uid());
$$;

GRANT EXECUTE ON FUNCTION public.assign_review_queue_item(UUID, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.review_release_action(UUID, public.review_action, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.review_queue_metrics() TO authenticated;

COMMENT ON TABLE public.review_queue IS 'Phase 4 moderation queue between media validation and distribution.';
COMMENT ON TABLE public.review_audit_log IS 'Admin review action audit log.';

CREATE OR REPLACE FUNCTION public.handle_distribution_job_release_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status::TEXT = 'PROCESSING' THEN
    UPDATE public.releases
    SET status = 'distributing'::public.release_status
    WHERE id = NEW.release_id
      AND status = 'queued_for_distribution'::public.release_status;
  ELSIF NEW.status::TEXT = 'PUBLISHED' THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.distribution_jobs dj
      WHERE dj.release_id = NEW.release_id
        AND dj.status::TEXT NOT IN ('PUBLISHED')
    ) THEN
      UPDATE public.releases
      SET status = 'live'::public.release_status
      WHERE id = NEW.release_id
        AND status IN ('queued_for_distribution','distributing');
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_distribution_job_release_status ON public.distribution_jobs;
CREATE TRIGGER trg_distribution_job_release_status
AFTER INSERT OR UPDATE OF status ON public.distribution_jobs
FOR EACH ROW
EXECUTE FUNCTION public.handle_distribution_job_release_status();
