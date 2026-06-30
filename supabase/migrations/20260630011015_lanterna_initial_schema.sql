/*
# Lanterna Initial Schema

Builds the account-scoped data model from Lanterna_schema_spec.md.
Supabase owns relational truth; Cloudflare owns media bytes and Stream minutes.
*/

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Enums
DO $$ BEGIN
  CREATE TYPE member_role AS ENUM ('owner', 'member');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE project_type AS ENUM ('wedding', 'engagement', 'portrait');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE access_type AS ENUM ('public', 'password', 'private');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE gallery_status AS ENUM ('draft', 'published', 'delivered');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE storage_tier AS ENUM ('hot', 'web', 'cold', 'archived', 'purged');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE background_type AS ENUM ('image', 'video');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE invite_status AS ENUM ('pending', 'accepted', 'revoked', 'expired');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE processing_status AS ENUM ('uploading', 'processing', 'ready', 'errored');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE recipient_status AS ENUM ('sent', 'opened');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE delivery_event_type AS ENUM ('sent', 'opened', 'video_viewed', 'downloaded');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE plan_tier AS ENUM ('starter', 'pro', 'studio');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE sub_status AS ENUM ('active', 'past_due', 'canceled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE entitlement_source AS ENUM ('subscription', 'block', 'topup');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE entitlement_status AS ENUM ('active', 'expired', 'consumed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE upload_target AS ENUM ('video', 'photo');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE job_status AS ENUM ('pending', 'uploading', 'paused', 'processing', 'complete', 'errored');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE media_task_type AS ENUM ('generate_web_copy', 'delete_r2', 'delete_stream', 'reconcile_usage', 'purge_gallery');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE task_status AS ENUM ('pending', 'running', 'done', 'failed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Core accounts
CREATE TABLE IF NOT EXISTS public.accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.users (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text UNIQUE NOT NULL,
  display_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.account_members (
  account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  role member_role NOT NULL DEFAULT 'member',
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.account_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  email text NOT NULL,
  role member_role NOT NULL DEFAULT 'member',
  token text UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),
  status invite_status NOT NULL DEFAULT 'pending',
  invited_by uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '14 days'),
  accepted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS account_invites_account_status_idx ON public.account_invites(account_id, status);

CREATE TABLE IF NOT EXISTS public.vendor_branding (
  account_id uuid PRIMARY KEY REFERENCES public.accounts(id) ON DELETE CASCADE,
  studio_name text NOT NULL,
  tagline text,
  logo_r2_key text,
  accent_color text NOT NULL DEFAULT '#FFB24D',
  custom_domain text,
  default_downloads boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Galleries are created before media; cover FKs are added after media tables.
CREATE TABLE IF NOT EXISTS public.galleries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  name text NOT NULL,
  client_name text,
  event_date date,
  project_type project_type NOT NULL DEFAULT 'wedding',
  slug text NOT NULL,
  access_type access_type NOT NULL DEFAULT 'private',
  password_hash text,
  status gallery_status NOT NULL DEFAULT 'draft',
  cover_video_id uuid,
  cover_photo_id uuid,
  source_file_window_days int NOT NULL DEFAULT 730,
  source_file_expires_at timestamptz,
  access_window_days int NOT NULL DEFAULT 3650,
  access_expires_at timestamptz,
  storage_tier storage_tier NOT NULL DEFAULT 'hot',
  is_extended boolean NOT NULL DEFAULT false,
  extended_until timestamptz,
  published_at timestamptz,
  delivered_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT galleries_slug_unique UNIQUE (account_id, slug),
  CONSTRAINT galleries_password_required CHECK (access_type <> 'password' OR password_hash IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS galleries_account_status_archived_idx ON public.galleries(account_id, status, archived_at);
CREATE INDEX IF NOT EXISTS galleries_access_expires_idx ON public.galleries(access_expires_at) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.videos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gallery_id uuid NOT NULL REFERENCES public.galleries(id) ON DELETE CASCADE,
  title text NOT NULL,
  sort_order int NOT NULL DEFAULT 0,
  r2_key text,
  r2_bytes bigint NOT NULL DEFAULT 0,
  duration_seconds int NOT NULL DEFAULT 0,
  stream_uid text,
  stream_ready boolean NOT NULL DEFAULT false,
  web_copy_r2_key text,
  web_copy_bytes bigint NOT NULL DEFAULT 0,
  poster_r2_key text,
  processing_status processing_status NOT NULL DEFAULT 'uploading',
  download_enabled boolean,
  visible_in_gallery boolean NOT NULL DEFAULT true,
  tags text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS videos_gallery_sort_idx ON public.videos(gallery_id, sort_order);

CREATE TABLE IF NOT EXISTS public.albums (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gallery_id uuid NOT NULL REFERENCES public.galleries(id) ON DELETE CASCADE,
  name text NOT NULL,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gallery_id uuid NOT NULL REFERENCES public.galleries(id) ON DELETE CASCADE,
  album_id uuid REFERENCES public.albums(id) ON DELETE SET NULL,
  r2_key text NOT NULL,
  r2_bytes bigint NOT NULL DEFAULT 0,
  width int,
  height int,
  sort_order int NOT NULL DEFAULT 0,
  processing_status processing_status NOT NULL DEFAULT 'uploading',
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS photos_gallery_album_sort_idx ON public.photos(gallery_id, album_id, sort_order);

ALTER TABLE public.galleries
  ADD CONSTRAINT galleries_cover_video_id_fkey
  FOREIGN KEY (cover_video_id) REFERENCES public.videos(id) ON DELETE SET NULL;

ALTER TABLE public.galleries
  ADD CONSTRAINT galleries_cover_photo_id_fkey
  FOREIGN KEY (cover_photo_id) REFERENCES public.photos(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.gallery_design (
  gallery_id uuid PRIMARY KEY REFERENCES public.galleries(id) ON DELETE CASCADE,
  heading_title text,
  heading_subtitle text,
  layout_template text NOT NULL DEFAULT 'cinematic',
  background_type background_type NOT NULL DEFAULT 'image',
  background_r2_key text,
  theme text NOT NULL DEFAULT 'dark',
  accent_color text,
  typography text,
  music_track_r2_key text,
  featured_video_id uuid REFERENCES public.videos(id) ON DELETE SET NULL,
  enabled_buttons jsonb NOT NULL DEFAULT '{"share":true,"embed":false,"download":true}'::jsonb,
  allow_downloads boolean,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gallery_id uuid NOT NULL REFERENCES public.galleries(id) ON DELETE CASCADE,
  message text,
  sent_by uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  sent_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS deliveries_gallery_sent_idx ON public.deliveries(gallery_id, sent_at);

CREATE TABLE IF NOT EXISTS public.delivery_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_id uuid NOT NULL REFERENCES public.deliveries(id) ON DELETE CASCADE,
  gallery_id uuid NOT NULL REFERENCES public.galleries(id) ON DELETE CASCADE,
  email text NOT NULL,
  name text,
  status recipient_status NOT NULL DEFAULT 'sent',
  last_sent_at timestamptz NOT NULL DEFAULT now(),
  first_opened_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS delivery_recipients_gallery_idx ON public.delivery_recipients(gallery_id);
CREATE INDEX IF NOT EXISTS delivery_recipients_delivery_idx ON public.delivery_recipients(delivery_id);

CREATE TABLE IF NOT EXISTS public.delivery_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gallery_id uuid NOT NULL REFERENCES public.galleries(id) ON DELETE CASCADE,
  recipient_id uuid REFERENCES public.delivery_recipients(id) ON DELETE SET NULL,
  video_id uuid REFERENCES public.videos(id) ON DELETE SET NULL,
  event_type delivery_event_type NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb
);

CREATE INDEX IF NOT EXISTS delivery_events_gallery_occurred_idx ON public.delivery_events(gallery_id, occurred_at);
CREATE INDEX IF NOT EXISTS delivery_events_video_type_idx ON public.delivery_events(video_id, event_type);

CREATE TABLE IF NOT EXISTS public.subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  plan plan_tier NOT NULL,
  status sub_status NOT NULL DEFAULT 'active',
  seats int NOT NULL DEFAULT 1,
  current_period_start timestamptz NOT NULL,
  current_period_end timestamptz NOT NULL,
  stripe_subscription_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.entitlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  source entitlement_source NOT NULL,
  gb_granted numeric(10,2) NOT NULL,
  period_start timestamptz NOT NULL,
  period_end timestamptz NOT NULL,
  status entitlement_status NOT NULL DEFAULT 'active',
  stripe_reference text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS entitlements_account_status_period_idx ON public.entitlements(account_id, status, period_end);

CREATE TABLE IF NOT EXISTS public.usage_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  entitlement_id uuid REFERENCES public.entitlements(id) ON DELETE SET NULL,
  gb numeric(10,2) NOT NULL,
  gallery_id uuid REFERENCES public.galleries(id) ON DELETE SET NULL,
  video_id uuid REFERENCES public.videos(id) ON DELETE SET NULL,
  photo_id uuid REFERENCES public.photos(id) ON DELETE SET NULL,
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS usage_events_account_occurred_idx ON public.usage_events(account_id, occurred_at);

CREATE TABLE IF NOT EXISTS public.account_usage (
  account_id uuid PRIMARY KEY REFERENCES public.accounts(id) ON DELETE CASCADE,
  allowance_used_gb numeric(12,2) NOT NULL DEFAULT 0,
  allowance_total_gb numeric(12,2) NOT NULL DEFAULT 0,
  hot_bytes_stored bigint NOT NULL DEFAULT 0,
  cold_bytes_stored bigint NOT NULL DEFAULT 0,
  stream_minutes_stored numeric(12,2) NOT NULL DEFAULT 0,
  synced_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.upload_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  gallery_id uuid NOT NULL REFERENCES public.galleries(id) ON DELETE CASCADE,
  target_type upload_target NOT NULL,
  target_id uuid,
  status job_status NOT NULL DEFAULT 'pending',
  bytes_total bigint NOT NULL,
  bytes_uploaded bigint NOT NULL DEFAULT 0,
  multipart_upload_id text,
  stream_upload_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS upload_jobs_account_status_idx ON public.upload_jobs(account_id, status);

CREATE TABLE IF NOT EXISTS public.media_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  task_type media_task_type NOT NULL,
  gallery_id uuid REFERENCES public.galleries(id) ON DELETE CASCADE,
  video_id uuid REFERENCES public.videos(id) ON DELETE SET NULL,
  payload jsonb,
  status task_status NOT NULL DEFAULT 'pending',
  attempts int NOT NULL DEFAULT 0,
  last_error text,
  run_after timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS media_tasks_status_run_after_idx ON public.media_tasks(status, run_after);

-- Updated-at helper.
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER accounts_set_updated_at
  BEFORE UPDATE ON public.accounts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER vendor_branding_set_updated_at
  BEFORE UPDATE ON public.vendor_branding
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER galleries_set_updated_at
  BEFORE UPDATE ON public.galleries
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER videos_set_updated_at
  BEFORE UPDATE ON public.videos
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER gallery_design_set_updated_at
  BEFORE UPDATE ON public.gallery_design
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER upload_jobs_set_updated_at
  BEFORE UPDATE ON public.upload_jobs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER media_tasks_set_updated_at
  BEFORE UPDATE ON public.media_tasks
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- RLS helpers avoid recursive policies on account_members.
CREATE OR REPLACE FUNCTION public.is_account_member(target_account_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.account_members
    WHERE account_id = target_account_id
      AND user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.gallery_account_id(target_gallery_id uuid)
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT account_id FROM public.galleries WHERE id = target_gallery_id;
$$;

-- Auth bootstrap: create a personal studio account for new users.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_account_id uuid;
  display text;
BEGIN
  display := COALESCE(NEW.raw_user_meta_data ->> 'display_name', NEW.raw_user_meta_data ->> 'name', split_part(NEW.email, '@', 1));

  INSERT INTO public.users (id, email, display_name)
  VALUES (NEW.id, NEW.email, display)
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    display_name = COALESCE(public.users.display_name, EXCLUDED.display_name);

  INSERT INTO public.accounts (name)
  VALUES (COALESCE(display, 'Lanterna Studio'))
  RETURNING id INTO new_account_id;

  INSERT INTO public.account_members (account_id, user_id, role)
  VALUES (new_account_id, NEW.id, 'owner');

  INSERT INTO public.vendor_branding (account_id, studio_name, tagline)
  VALUES (new_account_id, COALESCE(display, 'Lanterna Studio'), 'Wedding films, delivered beautifully');

  INSERT INTO public.account_usage (account_id, allowance_used_gb, allowance_total_gb, synced_at)
  VALUES (new_account_id, 0, 0, now());

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Enable RLS.
ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.account_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.account_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendor_branding ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.galleries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gallery_design ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.videos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.albums ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_recipients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.entitlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usage_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.account_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.upload_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.media_tasks ENABLE ROW LEVEL SECURITY;

-- Account-scoped policies.
CREATE POLICY "members can read accounts" ON public.accounts
  FOR SELECT TO authenticated
  USING (public.is_account_member(id));

CREATE POLICY "members can update accounts" ON public.accounts
  FOR UPDATE TO authenticated
  USING (public.is_account_member(id))
  WITH CHECK (public.is_account_member(id));

CREATE POLICY "users can read themselves" ON public.users
  FOR SELECT TO authenticated
  USING (id = auth.uid());

CREATE POLICY "users can update themselves" ON public.users
  FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

CREATE POLICY "members can read account members" ON public.account_members
  FOR SELECT TO authenticated
  USING (public.is_account_member(account_id));

CREATE POLICY "members can read invites" ON public.account_invites
  FOR SELECT TO authenticated
  USING (public.is_account_member(account_id));

CREATE POLICY "members can manage invites" ON public.account_invites
  FOR ALL TO authenticated
  USING (public.is_account_member(account_id))
  WITH CHECK (public.is_account_member(account_id));

CREATE POLICY "members can manage vendor branding" ON public.vendor_branding
  FOR ALL TO authenticated
  USING (public.is_account_member(account_id))
  WITH CHECK (public.is_account_member(account_id));

CREATE POLICY "members can manage galleries" ON public.galleries
  FOR ALL TO authenticated
  USING (public.is_account_member(account_id))
  WITH CHECK (public.is_account_member(account_id));

CREATE POLICY "members can manage gallery design" ON public.gallery_design
  FOR ALL TO authenticated
  USING (public.is_account_member(public.gallery_account_id(gallery_id)))
  WITH CHECK (public.is_account_member(public.gallery_account_id(gallery_id)));

CREATE POLICY "members can manage videos" ON public.videos
  FOR ALL TO authenticated
  USING (public.is_account_member(public.gallery_account_id(gallery_id)))
  WITH CHECK (public.is_account_member(public.gallery_account_id(gallery_id)));

CREATE POLICY "members can manage albums" ON public.albums
  FOR ALL TO authenticated
  USING (public.is_account_member(public.gallery_account_id(gallery_id)))
  WITH CHECK (public.is_account_member(public.gallery_account_id(gallery_id)));

CREATE POLICY "members can manage photos" ON public.photos
  FOR ALL TO authenticated
  USING (public.is_account_member(public.gallery_account_id(gallery_id)))
  WITH CHECK (public.is_account_member(public.gallery_account_id(gallery_id)));

CREATE POLICY "members can manage deliveries" ON public.deliveries
  FOR ALL TO authenticated
  USING (public.is_account_member(public.gallery_account_id(gallery_id)))
  WITH CHECK (public.is_account_member(public.gallery_account_id(gallery_id)));

CREATE POLICY "members can manage delivery recipients" ON public.delivery_recipients
  FOR ALL TO authenticated
  USING (public.is_account_member(public.gallery_account_id(gallery_id)))
  WITH CHECK (public.is_account_member(public.gallery_account_id(gallery_id)));

CREATE POLICY "members can manage delivery events" ON public.delivery_events
  FOR ALL TO authenticated
  USING (public.is_account_member(public.gallery_account_id(gallery_id)))
  WITH CHECK (public.is_account_member(public.gallery_account_id(gallery_id)));

CREATE POLICY "members can read subscriptions" ON public.subscriptions
  FOR SELECT TO authenticated
  USING (public.is_account_member(account_id));

CREATE POLICY "members can read entitlements" ON public.entitlements
  FOR SELECT TO authenticated
  USING (public.is_account_member(account_id));

CREATE POLICY "members can read usage events" ON public.usage_events
  FOR SELECT TO authenticated
  USING (public.is_account_member(account_id));

CREATE POLICY "members can read account usage" ON public.account_usage
  FOR SELECT TO authenticated
  USING (public.is_account_member(account_id));

CREATE POLICY "members can manage upload jobs" ON public.upload_jobs
  FOR ALL TO authenticated
  USING (public.is_account_member(account_id))
  WITH CHECK (public.is_account_member(account_id));

CREATE POLICY "members can read media tasks" ON public.media_tasks
  FOR SELECT TO authenticated
  USING (public.is_account_member(account_id));

-- Service role bypasses RLS for billing syncs, delivery workers, and media task processors.
