import type { ReactNode } from 'react';

export type Theme = 'dark' | 'light';
export type View = 'galleries' | 'studio' | 'vendor' | 'account' | 'upload';
export type StudioTab = 'videos' | 'photos' | 'layout' | 'heading' | 'background' | 'music' | 'styles' | 'settings' | 'deliver';
export type GalleryStatus = 'draft' | 'published' | 'delivered';
export type ProjectName = 'Weddings' | 'Engagements' | 'Portraits';

export type WorkspaceAccount = {
  accountId: string | null;
  studioName: string;
  tagline: string;
  accentColor: string;
  defaultDownloads: boolean;
  customDomain: string | null;
  allowanceUsedGb: number;
  allowanceTotalGb: number;
  hotBytesStored: number;
  coldBytesStored: number;
  streamMinutesStored: number;
  userName: string;
  userEmail: string;
};

export type UploadJob = {
  id: string;
  galleryId: string;
  targetType: 'video' | 'photo';
  targetId: string | null;
  fileName: string;
  status: 'pending' | 'uploading' | 'paused' | 'processing' | 'complete' | 'errored';
  bytesTotal: number;
  bytesUploaded: number;
  createdAt: string;
  errorCode?: string;
  errorMessage?: string;
  isReplacement?: boolean;
  uploadPhase?: 'uploading_master' | 'master_secured' | 'starting_playback' | 'preparing_playback' | 'copy_failed' | 'ready';
};

export type DeliveryRecipient = {
  email: string;
  status: 'sent' | 'opened' | 'failed';
  at: string;
};

export type DeliveryDraft = {
  message: string;
  recipients: string;
};

export type MediaVideo = {
  id: string;
  title: string;
  duration: string;
  gradient: string;
  r2Bytes?: number;
  r2Key?: string | null;
  posterR2Key?: string | null;
  paidUnlockEnabled?: boolean;
  paidUnlockLabel?: string;
  paidUnlockPriceCents?: number;
  paidUnlockTagline?: string;
  streamReady?: boolean;
  streamUid?: string | null;
  webCopyR2Key?: string | null;
  processingStatus: 'uploading' | 'processing' | 'ready' | 'errored';
  downloadEnabled: boolean;
  visibleInGallery: boolean;
  tags: string[];
  updatedAt: string;
};

export type PhotoAlbum = {
  id: string;
  name: string;
  photoIds: string[];
};

export type GalleryPhoto = {
  id: string;
  albumId: string | null;
  gradient: string;
  r2Bytes?: number;
  r2Key?: string | null;
  aspectRatio: '1/1' | '3/4' | '4/3';
  processingStatus: 'uploading' | 'processing' | 'ready' | 'errored';
};

export type GalleryDesign = {
  accent: string;
  backgroundGradient: string;
  backgroundR2Key: string | null;
  backgroundType: 'image' | 'video';
  bodyFont: string;
  bodyFontWeight: number;
  eyebrow: string;
  featuredFilm: string;
  headlineFont: string;
  headlineFontWeight: number;
  layout: 'lumen' | 'diptych' | 'meridian' | 'grove' | 'atelier' | 'reel' | 'overture' | 'passage' | 'salon';
  musicTrackName: string;
  musicTrackR2Key: string | null;
  subtitle: string;
  theme: Theme;
  title: string;
  topButtons: {
    download: boolean;
    embed: boolean;
    share: boolean;
  };
  typography: 'editorial' | 'modern';
};

export type DashboardGallery = {
  id: string;
  slug: string;
  name: string;
  client: string;
  date: string;
  project: ProjectName;
  videos: number;
  photos: number;
  views: string;
  status: GalleryStatus;
  archived?: boolean;
  access: 'Public' | 'Password' | 'Private';
  allowDownloads: boolean;
  autoExpire: boolean;
  passwordSet: boolean;
  passwordHash?: string | null;
  coverChosen: boolean;
  design: GalleryDesign;
  deliveryDraft: DeliveryDraft;
  gradient: string;
  videoItems: MediaVideo[];
  albums: PhotoAlbum[];
  photoItems: GalleryPhoto[];
  recipients: DeliveryRecipient[];
};

export type StatusMeta = {
  label: string;
  className: string;
};

export type StatConfig = {
  icon: ReactNode;
  value: string;
  label: string;
};

export const projectNames: ProjectName[] = ['Weddings', 'Engagements', 'Portraits'];

export const defaultWorkspaceAccount: WorkspaceAccount = {
  accountId: null,
  studioName: 'LANTERNA Studio',
  tagline: 'Wedding films, delivered beautifully',
  accentColor: '#6EE7F9',
  defaultDownloads: true,
  customDomain: null,
  allowanceUsedGb: 0,
  allowanceTotalGb: 50,
  hotBytesStored: 0,
  coldBytesStored: 0,
  streamMinutesStored: 0,
  userName: 'Studio Owner',
  userEmail: 'owner@lanterna.local',
};

export function gbToBytes(gb: number) {
  return Math.round(gb * 1_000_000_000);
}

export const mediaTileGradients = [
  'linear-gradient(135deg,#141830,#2f5586 46%,#6cc4d8)',
  'linear-gradient(135deg,#111827,#536f8f 48%,#a1c8e7)',
  'linear-gradient(135deg,#161530,#6d4d91 48%,#5fa8f1)',
  'linear-gradient(135deg,#0f1219,#324a71 48%,#55a0c9)',
  'linear-gradient(135deg,#0f1520,#3c6b72 48%,#8ac9d6)',
  'linear-gradient(135deg,#0f1016,#3c558d 46%,#6ee7f9)',
];

export function defaultDeliveryDraft(recipients = ''): DeliveryDraft {
  return {
    message: 'Your gallery is ready. We hope you love reliving the day.',
    recipients,
  };
}

export function defaultGalleryDesign(title: string, gradient = mediaTileGradients[0]): GalleryDesign {
  return {
    accent: '#6EE7F9',
    backgroundGradient: gradient,
    backgroundR2Key: null,
    backgroundType: 'image',
    bodyFont: 'DM Sans',
    bodyFontWeight: 400,
    eyebrow: 'The Wedding Film',
    featuredFilm: 'Wedding Film',
    headlineFont: 'Cormorant Garamond',
    headlineFontWeight: 500,
    layout: 'lumen',
    musicTrackName: '',
    musicTrackR2Key: null,
    subtitle: 'June 4, 2026 · Villa Toscana',
    theme: 'dark',
    title,
    topButtons: {
      download: true,
      embed: false,
      share: true,
    },
    typography: 'editorial',
  };
}

export function statusMeta(status: GalleryStatus): StatusMeta {
  if (status === 'delivered') return { label: 'Delivered', className: 'status status-green' };
  if (status === 'published') return { label: 'Published', className: 'status status-blue' };
  return { label: 'Draft', className: 'status status-amber' };
}

export function navClass(on: boolean) {
  return `ld-nav ${on ? 'is-active' : ''}`;
}

export function subNavClass(on: boolean) {
  return `studio-nav ${on ? 'is-active' : ''}`;
}
