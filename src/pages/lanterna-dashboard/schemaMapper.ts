import type { AccessType, GalleryStatus, ProcessingStatus, ProjectType, RecipientStatus, StorageTier } from '../../lib/supabase';
import {
  defaultDeliveryDraft,
  defaultGalleryDesign,
  mediaTileGradients,
  type DashboardGallery,
  type GalleryDesign,
  type ProjectName,
} from './model';
import { clampFontWeight, DEFAULT_BODY_WEIGHT, DEFAULT_HEADLINE_WEIGHT } from './fonts';

export type GalleryRecord = {
  id: string;
  account_id: string;
  name: string;
  client_name: string;
  event_date: string | null;
  project_type: ProjectType;
  slug: string;
  access_type: AccessType;
  password_hash: string | null;
  status: GalleryStatus;
  cover_video_id: string | null;
  cover_photo_id: string | null;
  storage_tier?: StorageTier;
  archived_at?: string | null;
};

export type GalleryDesignRecord = {
  gallery_id: string;
  heading_title: string | null;
  heading_eyebrow: string | null;
  heading_subtitle: string | null;
  layout_template: string;
  background_type: 'image' | 'video';
  background_gradient?: string | null;
  background_r2_key: string | null;
  theme: string;
  accent_color: string | null;
  typography: string | null;
  headline_font: string | null;
  headline_font_weight: number | null;
  body_font: string | null;
  body_font_weight: number | null;
  music_track_r2_key: string | null;
  music_track_name?: string | null;
  featured_video_id: string | null;
  enabled_buttons: Partial<{
    backgroundGradient: string;
    download: boolean;
    embed: boolean;
    share: boolean;
  }> | null;
  allow_downloads: boolean | null;
};

export type VideoRecord = {
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
  tags: string[];
  paid_unlock_enabled?: boolean;
  paid_unlock_price_cents?: number;
  paid_unlock_currency?: string;
  paid_unlock_label?: string | null;
  paid_unlock_tagline?: string | null;
};

export type PhotoRecord = {
  id: string;
  gallery_id: string;
  album_id: string | null;
  r2_key: string | null;
  r2_bytes: number;
  width: number | null;
  height: number | null;
  sort_order: number;
  processing_status: ProcessingStatus;
};

export type AlbumRecord = {
  id: string;
  gallery_id: string;
  name: string;
  sort_order: number;
};

export type DeliveryRecipientRecord = {
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

export type DeliveryEventRecord = {
  id: string;
  gallery_id: string;
  video_id: string | null;
  event_type: 'sent' | 'opened' | 'video_viewed' | 'downloaded' | 'failed';
  occurred_at: string;
  metadata: Record<string, unknown> | null;
};

export type GallerySchemaBundle = {
  gallery: GalleryRecord;
  design: GalleryDesignRecord;
  videos: VideoRecord[];
  albums: AlbumRecord[];
  photos: PhotoRecord[];
};

const projectMap: Record<DashboardGallery['project'], GalleryRecord['project_type']> = {
  Engagements: 'engagement',
  Portraits: 'portrait',
  Weddings: 'wedding',
};

const accessMap: Record<DashboardGallery['access'], GalleryRecord['access_type']> = {
  Password: 'password',
  Private: 'private',
  Public: 'public',
};

const projectNameMap: Record<ProjectType, ProjectName> = {
  engagement: 'Engagements',
  portrait: 'Portraits',
  wedding: 'Weddings',
};

const accessNameMap: Record<AccessType, DashboardGallery['access']> = {
  password: 'Password',
  private: 'Private',
  public: 'Public',
};

const layoutSet = new Set<GalleryDesign['layout']>([
  'lumen',
  'diptych',
  'meridian',
  'grove',
  'atelier',
  'reel',
  'overture',
  'passage',
  'salon',
]);

const typographySet = new Set<GalleryDesign['typography']>(['editorial', 'modern']);
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function stableUuid(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  const hex = Array.from({ length: 32 }).map((_, index) => {
    hash ^= value.charCodeAt(index % value.length) + index;
    hash = Math.imul(hash, 16777619);
    return ((hash >>> ((index % 4) * 8)) & 0xff).toString(16).padStart(2, '0');
  }).join('');

  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-${((parseInt(hex.slice(16, 18), 16) & 0x3f) | 0x80).toString(16)}${hex.slice(18, 20)}-${hex.slice(20, 32)}`;
}

export function videoDatabaseId(videoId: string) {
  if (uuidPattern.test(videoId)) return videoId;
  return stableUuid(`video:${videoId}`);
}

export function albumDatabaseId(albumId: string) {
  if (uuidPattern.test(albumId)) return albumId;
  return stableUuid(`album:${albumId}`);
}

export function photoDatabaseId(photoId: string) {
  if (uuidPattern.test(photoId)) return photoId;
  return stableUuid(`photo:${photoId}`);
}

function secondsFromDuration(duration: string) {
  const [minutes = '0', seconds = '0'] = duration.split(':');
  return Number(minutes) * 60 + Number(seconds);
}

function durationFromSeconds(durationSeconds: number) {
  const minutes = Math.floor(durationSeconds / 60);
  const seconds = String(durationSeconds % 60).padStart(2, '0');
  return `${minutes}:${seconds}`;
}

function shortDate(value: string | null) {
  if (!value) return 'Just now';
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split('-').map(Number);
    return new Date(year, month - 1, day).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Just now';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function schemaDateFromDisplay(value: string) {
  if (!value || value === 'Just now') return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function relativeDate(value: string | null) {
  if (!value) return 'Just now';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Just now';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function activityDate(value: string) {
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return 'Just now';
  const minutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60000));
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function canPersistGalleryToSchema(gallery: DashboardGallery) {
  return gallery.access !== 'Password' || gallery.passwordSet;
}

export function galleryToSchemaBundle(gallery: DashboardGallery, accountId: string): GallerySchemaBundle {
  const galleryId = gallery.id;
  const featuredVideo = gallery.videoItems.find((video) => video.title === gallery.design.featuredFilm) ?? gallery.videoItems[0];
  const coverVideo = gallery.coverChosen ? (featuredVideo ?? gallery.videoItems[0]) : null;
  const coverPhoto = gallery.coverChosen ? gallery.photoItems[0] : null;

  return {
    gallery: {
      id: galleryId,
      account_id: accountId,
      name: gallery.name,
      client_name: gallery.client,
      event_date: schemaDateFromDisplay(gallery.date),
      project_type: projectMap[gallery.project],
      slug: gallery.slug,
      access_type: accessMap[gallery.access],
      password_hash: null,
      status: gallery.status,
      cover_video_id: coverVideo ? videoDatabaseId(coverVideo.id) : null,
      cover_photo_id: coverPhoto ? photoDatabaseId(coverPhoto.id) : null,
    },
    design: {
      gallery_id: galleryId,
      heading_title: gallery.design.title || null,
      heading_eyebrow: gallery.design.eyebrow || null,
      heading_subtitle: gallery.design.subtitle || null,
      layout_template: gallery.design.layout,
      background_type: gallery.design.backgroundType,
      background_gradient: gallery.design.backgroundGradient,
      background_r2_key: gallery.design.backgroundR2Key,
      theme: gallery.design.theme,
      accent_color: gallery.design.accent,
      typography: gallery.design.typography,
      headline_font: gallery.design.headlineFont,
      headline_font_weight: gallery.design.headlineFontWeight,
      body_font: gallery.design.bodyFont,
      body_font_weight: gallery.design.bodyFontWeight,
      music_track_name: gallery.design.musicTrackName || null,
      music_track_r2_key: gallery.design.musicTrackR2Key,
      featured_video_id: featuredVideo ? videoDatabaseId(featuredVideo.id) : null,
      enabled_buttons: {
        ...gallery.design.topButtons,
        backgroundGradient: gallery.design.backgroundGradient,
      },
      allow_downloads: gallery.allowDownloads,
    },
    videos: gallery.videoItems.map((video, index) => ({
      id: videoDatabaseId(video.id),
      gallery_id: galleryId,
      title: video.title,
      sort_order: index,
      r2_key: video.r2Key ?? null,
      r2_bytes: video.r2Bytes ?? 0,
      duration_seconds: secondsFromDuration(video.duration),
      stream_uid: video.streamUid ?? null,
      stream_ready: video.streamReady ?? video.processingStatus === 'ready',
      web_copy_r2_key: video.webCopyR2Key ?? null,
      web_copy_bytes: 0,
      poster_r2_key: video.posterR2Key ?? null,
      processing_status: video.processingStatus,
      download_enabled: video.downloadEnabled,
      visible_in_gallery: video.visibleInGallery,
      tags: video.tags,
      paid_unlock_enabled: video.paidUnlockEnabled ?? false,
      paid_unlock_price_cents: video.paidUnlockPriceCents ?? 30000,
      paid_unlock_currency: 'usd',
      paid_unlock_label: video.paidUnlockLabel ?? null,
      paid_unlock_tagline: video.paidUnlockTagline ?? null,
    })),
    albums: gallery.albums.map((album, index) => ({
      id: albumDatabaseId(album.id),
      gallery_id: galleryId,
      name: album.name,
      sort_order: index,
    })),
    photos: gallery.photoItems.map((photo, index) => ({
      id: photoDatabaseId(photo.id),
      gallery_id: galleryId,
      album_id: photo.albumId ? albumDatabaseId(photo.albumId) : null,
      r2_key: photo.r2Key ?? null,
      r2_bytes: photo.r2Bytes ?? 0,
      width: null,
      height: null,
      sort_order: index,
      processing_status: photo.processingStatus,
    })),
  };
}

export function schemaBundleToGallery(bundle: GallerySchemaBundle & { events: DeliveryEventRecord[]; recipients: DeliveryRecipientRecord[] }, index = 0): DashboardGallery {
  const slug = bundle.gallery.slug || bundle.gallery.id;
  const fallbackGradient = mediaTileGradients[index % mediaTileGradients.length];
  const videos = [...bundle.videos].sort((a, b) => a.sort_order - b.sort_order);
  const photos = [...bundle.photos].sort((a, b) => a.sort_order - b.sort_order);
  const albums = [...bundle.albums].sort((a, b) => a.sort_order - b.sort_order);
  const featuredVideo = videos.find((video) => video.id === bundle.design.featured_video_id) ?? videos[0];
  const videoTitles = new Map(videos.map((video) => [video.id, video.title]));
  const activityEvents = bundle.events.filter((event) => ['opened', 'video_viewed', 'downloaded'].includes(event.event_type));
  const designDefaults = defaultGalleryDesign(bundle.gallery.name, fallbackGradient);
  const enabledButtons = bundle.design.enabled_buttons ?? designDefaults.topButtons;
  const savedBackgroundGradient = 'backgroundGradient' in enabledButtons
    && typeof enabledButtons.backgroundGradient === 'string'
    ? enabledButtons.backgroundGradient
    : null;
  const design: GalleryDesign = {
    ...designDefaults,
    accent: bundle.design.accent_color ?? designDefaults.accent,
    backgroundGradient: bundle.design.background_gradient
      ?? savedBackgroundGradient
      ?? designDefaults.backgroundGradient,
    backgroundR2Key: bundle.design.background_r2_key,
    backgroundType: bundle.design.background_type,
    eyebrow: bundle.design.heading_eyebrow ?? designDefaults.eyebrow,
    featuredFilm: featuredVideo?.title ?? designDefaults.featuredFilm,
    headlineFont: bundle.design.headline_font ?? designDefaults.headlineFont,
    headlineFontWeight: clampFontWeight(
      bundle.design.headline_font ?? designDefaults.headlineFont,
      bundle.design.headline_font_weight,
      DEFAULT_HEADLINE_WEIGHT,
    ),
    bodyFont: bundle.design.body_font ?? designDefaults.bodyFont,
    bodyFontWeight: clampFontWeight(
      bundle.design.body_font ?? designDefaults.bodyFont,
      bundle.design.body_font_weight,
      DEFAULT_BODY_WEIGHT,
    ),
    layout: layoutSet.has(bundle.design.layout_template as GalleryDesign['layout'])
      ? bundle.design.layout_template as GalleryDesign['layout']
      : designDefaults.layout,
    musicTrackName: bundle.design.music_track_name ?? '',
    musicTrackR2Key: bundle.design.music_track_r2_key?.startsWith(`${bundle.gallery.account_id}/`)
      ? bundle.design.music_track_r2_key
      : null,
    subtitle: bundle.design.heading_subtitle ?? designDefaults.subtitle,
    theme: bundle.design.theme === 'light' ? 'light' : 'dark',
    title: bundle.design.heading_title ?? bundle.gallery.name,
    topButtons: {
      download: enabledButtons.download ?? designDefaults.topButtons.download,
      embed: enabledButtons.embed ?? designDefaults.topButtons.embed,
      share: enabledButtons.share ?? designDefaults.topButtons.share,
    },
    typography: typographySet.has(bundle.design.typography as GalleryDesign['typography'])
      ? bundle.design.typography as GalleryDesign['typography']
      : designDefaults.typography,
  };

  return {
    id: bundle.gallery.id,
    slug,
    name: bundle.gallery.name,
    client: bundle.gallery.client_name ?? bundle.gallery.name,
    date: bundle.gallery.event_date ? shortDate(bundle.gallery.event_date) : 'Just now',
    project: projectNameMap[bundle.gallery.project_type],
    videos: videos.length,
    photos: photos.length,
    views: String(activityEvents.filter((event) => event.event_type === 'opened').length),
    status: bundle.gallery.status,
    archived: Boolean(bundle.gallery.archived_at),
    access: accessNameMap[bundle.gallery.access_type],
    allowDownloads: bundle.design.allow_downloads ?? true,
    autoExpire: Boolean(bundle.gallery.archived_at || bundle.gallery.storage_tier === 'archived'),
    passwordSet: Boolean(bundle.gallery.password_hash),
    passwordHash: null,
    coverChosen: Boolean(bundle.gallery.cover_video_id || bundle.gallery.cover_photo_id || videos.length),
    deliveryDraft: defaultDeliveryDraft(''),
    design,
    gradient: fallbackGradient,
    videoItems: videos.map((video, videoIndex) => ({
      id: video.id,
      title: video.title,
      duration: durationFromSeconds(video.duration_seconds),
      gradient: mediaTileGradients[videoIndex % mediaTileGradients.length],
      r2Bytes: Number(video.r2_bytes ?? 0),
      r2Key: video.r2_key,
      posterR2Key: video.poster_r2_key,
      processingStatus: video.processing_status,
      streamReady: video.stream_ready,
      streamUid: video.stream_uid,
      downloadEnabled: video.download_enabled ?? true,
      visibleInGallery: video.visible_in_gallery,
      webCopyR2Key: video.web_copy_r2_key,
      tags: video.tags ?? [],
      paidUnlockEnabled: video.paid_unlock_enabled ?? false,
      paidUnlockLabel: video.paid_unlock_label ?? undefined,
      paidUnlockPriceCents: video.paid_unlock_price_cents ?? 30000,
      paidUnlockTagline: video.paid_unlock_tagline ?? undefined,
      updatedAt: 'Recently updated',
    })),
    albums: albums.map((album) => ({
      id: album.id,
      name: album.name,
      photoIds: photos.filter((photo) => photo.album_id === album.id).map((photo) => photo.id),
    })),
    photoItems: photos.map((photo, photoIndex) => ({
      id: photo.id,
      albumId: photo.album_id,
      gradient: mediaTileGradients[photoIndex % mediaTileGradients.length],
      r2Bytes: Number(photo.r2_bytes ?? 0),
      r2Key: photo.r2_key,
      aspectRatio: photoIndex % 3 === 0 ? '3/4' : photoIndex % 3 === 1 ? '1/1' : '4/3',
      processingStatus: photo.processing_status,
    })),
    recipients: bundle.recipients.map((recipient) => ({
      email: recipient.email,
      status: recipient.status,
      at: recipient.status === 'opened' ? relativeDate(recipient.first_opened_at) : relativeDate(recipient.last_sent_at),
    })),
    activity: activityEvents.slice(0, 30).map((event) => ({
      id: event.id,
      type: event.event_type as 'opened' | 'video_viewed' | 'downloaded',
      at: activityDate(event.occurred_at),
      videoTitle: event.video_id ? videoTitles.get(event.video_id) : undefined,
    })),
    activityCounts: {
      downloads: activityEvents.filter((event) => event.event_type === 'downloaded').length,
      opens: activityEvents.filter((event) => event.event_type === 'opened').length,
      plays: activityEvents.filter((event) => event.event_type === 'video_viewed').length,
    },
  };
}
