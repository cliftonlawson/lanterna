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
  errorMessage?: string;
};

export type DeliveryRecipient = {
  email: string;
  status: 'sent' | 'opened';
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
  paidUnlockTrailer?: boolean;
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
  musicTrack: string;
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
  studioName: 'Lanterna Studio',
  tagline: 'Wedding films, delivered beautifully',
  accentColor: '#FFB24D',
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
  return Math.round(gb * 1024 * 1024 * 1024);
}

export const mediaTileGradients = [
  'linear-gradient(135deg,#281628,#86572f 46%,#d8b36c)',
  'linear-gradient(135deg,#111827,#536f8f 48%,#e7d3a1)',
  'linear-gradient(135deg,#21152f,#6d4d91 48%,#f1a85f)',
  'linear-gradient(135deg,#19120f,#714332 48%,#c99655)',
  'linear-gradient(135deg,#15121f,#516b55 48%,#d6c28a)',
  'linear-gradient(135deg,#100f16,#8d4a3c 46%,#ffb24d)',
];

export function defaultDeliveryDraft(recipients = ''): DeliveryDraft {
  return {
    message: 'Your gallery is ready. We hope you love reliving the day.',
    recipients,
  };
}

export function defaultGalleryDesign(title: string, gradient = mediaTileGradients[0]): GalleryDesign {
  return {
    accent: '#FFB24D',
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
    musicTrack: 'First dance.wav',
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
