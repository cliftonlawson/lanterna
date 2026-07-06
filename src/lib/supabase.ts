import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

const disabledSupabaseClient = {
  auth: {
    async getSession() {
      return { data: { session: null }, error: null };
    },
    onAuthStateChange() {
      return { data: { subscription: { unsubscribe() {} } } };
    },
    async signInWithPassword() {
      return { data: { user: null, session: null }, error: new Error('Supabase is not configured.') };
    },
    async signUp() {
      return { data: { user: null, session: null }, error: new Error('Supabase is not configured.') };
    },
    async resend() {
      return { data: {}, error: new Error('Supabase is not configured.') };
    },
    async signOut() {
      return { error: null };
    },
  },
  from() {
    return {
      delete() {
        return {
          eq() {
            return Promise.resolve({ data: null, error: new Error('Supabase is not configured.') });
          },
        };
      },
    };
  },
};

export const supabase: SupabaseClient = (isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey)
  : disabledSupabaseClient) as unknown as SupabaseClient;

export type MemberRole = 'owner' | 'member';
export type ProjectType = 'wedding' | 'engagement' | 'portrait';
export type AccessType = 'public' | 'password' | 'private';
export type GalleryStatus = 'draft' | 'published' | 'delivered';
export type StorageTier = 'hot' | 'web' | 'cold' | 'archived' | 'purged';
export type ProcessingStatus = 'uploading' | 'processing' | 'ready' | 'errored';
export type RecipientStatus = 'sent' | 'opened';
export type DeliveryEventType = 'sent' | 'opened' | 'video_viewed' | 'downloaded';

// UI grouping alias. The real schema stores this as galleries.project_type.
export type Project = {
  id: ProjectType;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
};

export const PROJECTS: Project[] = [
  { id: 'wedding', name: 'Weddings', description: null, created_at: '', updated_at: '' },
  { id: 'engagement', name: 'Engagements', description: null, created_at: '', updated_at: '' },
  { id: 'portrait', name: 'Portraits', description: null, created_at: '', updated_at: '' },
];

export type AccountMember = {
  account_id: string;
  user_id: string;
  role: MemberRole;
  created_at: string;
};

export type VendorBranding = {
  account_id: string;
  studio_name: string;
  tagline: string | null;
  logo_r2_key: string | null;
  accent_color: string;
  custom_domain: string | null;
  default_downloads: boolean;
  updated_at: string;
};

export type Gallery = {
  id: string;
  account_id: string;
  name: string;
  client_name: string | null;
  event_date: string | null;
  project_type: ProjectType;
  slug: string;
  access_type: AccessType;
  password_hash: string | null;
  status: GalleryStatus;
  cover_video_id: string | null;
  cover_photo_id: string | null;
  source_file_window_days: number;
  source_file_expires_at: string | null;
  access_window_days: number;
  access_expires_at: string | null;
  storage_tier: StorageTier;
  is_extended: boolean;
  extended_until: string | null;
  published_at: string | null;
  delivered_at: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  video_count?: number;
};

export type GalleryDesign = {
  gallery_id: string;
  heading_title: string | null;
  heading_eyebrow: string | null;
  heading_subtitle: string | null;
  layout_template: string;
  background_type: 'image' | 'video';
  background_r2_key: string | null;
  theme: string;
  accent_color: string | null;
  typography: string | null;
  headline_font: string | null;
  headline_font_weight: number | null;
  body_font: string | null;
  body_font_weight: number | null;
  music_track_r2_key: string | null;
  featured_video_id: string | null;
  enabled_buttons: { share?: boolean; embed?: boolean; download?: boolean } | Record<string, boolean>;
  allow_downloads: boolean | null;
  updated_at: string;
};

export type Video = {
  id: string;
  gallery_id: string;
  title: string;
  sort_order: number;
  r2_key: string | null;
  r2_bytes: number;
  duration_seconds: number;
  stream_uid: string | null;
  stream_ready: boolean;
  web_copy_r2_key: string | null;
  web_copy_bytes: number;
  poster_r2_key: string | null;
  processing_status: ProcessingStatus;
  download_enabled: boolean | null;
  visible_in_gallery: boolean;
  paid_unlock_enabled: boolean;
  paid_unlock_price_cents: number;
  paid_unlock_currency: string;
  paid_unlock_label: string | null;
  paid_unlock_tagline: string | null;
  paid_unlock_trailer: boolean;
  tags: string[];
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type VideoUnlockPurchase = {
  id: string;
  account_id: string;
  gallery_id: string;
  video_id: string;
  buyer_email: string;
  amount_cents: number;
  currency: string;
  platform_fee_cents: number;
  studio_payout_cents: number;
  stripe_checkout_session_id: string | null;
  stripe_payment_intent_id: string | null;
  status: 'pending' | 'complete' | 'refunded' | 'failed' | string;
  unlocked_at: string | null;
  created_at: string;
};

export type Album = {
  id: string;
  gallery_id: string;
  name: string;
  sort_order: number;
  created_at: string;
  deleted_at: string | null;
};

export type Photo = {
  id: string;
  gallery_id: string;
  album_id: string | null;
  r2_key: string;
  r2_bytes: number;
  width: number | null;
  height: number | null;
  sort_order: number;
  processing_status: ProcessingStatus;
  created_at: string;
  deleted_at: string | null;
};

export type Delivery = {
  id: string;
  gallery_id: string;
  message: string | null;
  sent_by: string;
  sent_at: string;
};

export type DeliveryRecipient = {
  id: string;
  delivery_id: string;
  gallery_id: string;
  email: string;
  name: string | null;
  status: RecipientStatus;
  last_sent_at: string;
  first_opened_at: string | null;
  created_at: string;
};

export type DeliveryEvent = {
  id: string;
  gallery_id: string;
  recipient_id: string | null;
  video_id: string | null;
  event_type: DeliveryEventType;
  occurred_at: string;
  metadata: Record<string, unknown> | null;
};

export type AccountUsage = {
  account_id: string;
  allowance_used_gb: number;
  allowance_total_gb: number;
  hot_bytes_stored: number;
  cold_bytes_stored: number;
  stream_minutes_stored: number;
  synced_at: string | null;
};

export function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}
