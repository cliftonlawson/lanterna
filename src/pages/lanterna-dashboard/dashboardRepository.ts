import { isSupabaseConfigured, supabase } from '../../lib/supabase';
import { userMessage } from '../../lib/userMessages';
import { clearUploadJobRemote, deleteGalleryMediaRemote, deleteGalleryPermanentlyRemote, getStorageStatus, recordGalleryDelivery, setGalleryArchivedRemote } from './appApi';
import { parseRecipientEmails, upsertSentRecipients } from './delivery';
import {
  loadStoredGalleries,
  loadStoredUploadJobs,
  loadStoredWorkspaceAccount,
  saveStoredGalleries,
  saveStoredUploadJobs,
  saveStoredWorkspaceAccount,
} from './localStore';
import { defaultDeliveryDraft, defaultWorkspaceAccount, type DashboardGallery, type UploadJob, type WorkspaceAccount } from './model';
import {
  canPersistGalleryToSchema,
  galleryToSchemaBundle,
  schemaBundleToGallery,
  type AlbumRecord,
  type DeliveryRecipientRecord,
  type DeliveryEventRecord,
  type GalleryDesignRecord,
  type GalleryRecord,
  type PhotoRecord,
  type VideoRecord,
} from './schemaMapper';

type SaveReason = 'autosave' | 'create' | 'delivery' | 'archive' | 'upload' | 'video';

const serverOwnedGalleryFields = new Set([
  'access_type',
  'password_hash',
  'status',
  'source_file_window_days',
  'source_file_expires_at',
  'access_window_days',
  'access_expires_at',
  'storage_tier',
  'is_extended',
  'extended_until',
  'published_at',
  'delivered_at',
  'archived_at',
  'deleted_at',
]);

export type SaveResult = {
  mode: 'local' | 'supabase';
  ok: boolean;
  reason?: string;
};

export type DeliveryResult = SaveResult & {
  gallery: DashboardGallery;
  recipients: string[];
};

export type WorkspaceResult = SaveResult & {
  workspace: WorkspaceAccount;
};

export type UploadJobResult = SaveResult & {
  jobs: UploadJob[];
};

function persistLocal(galleries: DashboardGallery[]): SaveResult {
  saveStoredGalleries(galleries);
  return { mode: 'local', ok: true };
}

async function currentUserId() {
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session?.user?.id) return null;
  return data.session.user.id;
}

async function currentAccountId() {
  const userId = await currentUserId();
  if (!userId) return null;

  const { data, error } = await supabase
    .from('account_members')
    .select('account_id')
    .eq('user_id', userId)
    .limit(1)
    .maybeSingle();

  if (!error && data?.account_id) return data.account_id as string;

  const { data: ensuredAccountId, error: ensureError } = await supabase.rpc('ensure_current_user_account');
  if (ensureError || !ensuredAccountId) return null;

  return ensuredAccountId as string;
}

function persistWorkspaceLocal(workspace: WorkspaceAccount): SaveResult {
  saveStoredWorkspaceAccount(workspace);
  return { mode: 'local', ok: true };
}

function uniqueBy<T>(items: T[], keyFor: (item: T) => string) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = keyFor(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function hasUploadedVideoAsset(video: VideoRecord) {
  return Boolean(video.r2_key || video.web_copy_r2_key || video.stream_uid);
}

function isVisibleDashboardVideo(video: VideoRecord) {
  return hasUploadedVideoAsset(video);
}

async function loadGalleryActivityEvents(galleryIds: string[]) {
  const pageSize = 1000;
  const events: DeliveryEventRecord[] = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from('delivery_events')
      .select('id,gallery_id,video_id,event_type,occurred_at,metadata')
      .in('gallery_id', galleryIds)
      .in('event_type', ['opened', 'video_viewed', 'downloaded'])
      .order('occurred_at', { ascending: false })
      .range(from, from + pageSize - 1);
    if (error) throw error;
    const page = (data ?? []) as DeliveryEventRecord[];
    events.push(...page);
    if (page.length < pageSize) return events;
    from += pageSize;
  }
}

function mergeLocalVideoMonetization(remote: DashboardGallery[], local: DashboardGallery[]) {
  if (!local.length) return remote;
  const localByGalleryId = new Map(local.map((gallery) => [gallery.id, gallery]));

  return remote.map((gallery) => {
    const localGallery = localByGalleryId.get(gallery.id);
    if (!localGallery) return gallery;
    const localVideos = new Map(localGallery.videoItems.map((video) => [video.id, video]));

    return {
      ...gallery,
      videoItems: gallery.videoItems.map((video) => {
        const localVideo = localVideos.get(video.id);
        if (!localVideo) return video;
        return {
          ...video,
          paidUnlockEnabled: localVideo.paidUnlockEnabled,
          paidUnlockLabel: localVideo.paidUnlockLabel,
          paidUnlockPriceCents: localVideo.paidUnlockPriceCents,
          paidUnlockTagline: localVideo.paidUnlockTagline,
        };
      }),
    };
  });
}

function withoutPaidUnlockColumns<T extends Record<string, unknown>>(videos: T[]) {
  return videos.map((video) => {
    const schemaVideo = { ...video };
    delete schemaVideo.paid_unlock_currency;
    delete schemaVideo.paid_unlock_enabled;
    delete schemaVideo.paid_unlock_label;
    delete schemaVideo.paid_unlock_price_cents;
    delete schemaVideo.paid_unlock_tagline;

    return schemaVideo;
  });
}

function editableVideoRows(videos: VideoRecord[]) {
  return videos.map((video) => ({
    id: video.id,
    gallery_id: video.gallery_id,
    title: video.title,
    sort_order: video.sort_order,
    duration_seconds: video.duration_seconds,
    download_enabled: video.download_enabled,
    visible_in_gallery: video.visible_in_gallery,
    tags: video.tags,
    paid_unlock_enabled: video.paid_unlock_enabled ?? false,
    paid_unlock_price_cents: video.paid_unlock_price_cents ?? 30000,
    paid_unlock_currency: video.paid_unlock_currency ?? 'usd',
    paid_unlock_label: video.paid_unlock_label ?? null,
    paid_unlock_tagline: video.paid_unlock_tagline ?? null,
  }));
}

function editablePhotoRows(photos: PhotoRecord[]) {
  return photos.map((photo) => ({
    id: photo.id,
    gallery_id: photo.gallery_id,
    album_id: photo.album_id,
    sort_order: photo.sort_order,
    width: photo.width,
    height: photo.height,
  }));
}

function isMissingPaidUnlockColumn(error: unknown) {
  const message = error instanceof Error
    ? error.message
    : typeof error === 'object' && error && 'message' in error
      ? String(error.message)
      : String(error ?? '');
  return message.includes('paid_unlock_') || message.includes('paidUnlock');
}

function isMissingBackgroundGradientColumn(error: unknown) {
  const message = error instanceof Error
    ? error.message
    : typeof error === 'object' && error && 'message' in error
      ? String(error.message)
      : String(error ?? '');
  return message.includes('background_gradient');
}

function designWithoutBackgroundGradient(row: Record<string, unknown>) {
  const withoutColumn = Object.fromEntries(
    Object.entries(row).filter(([key]) => key !== 'background_gradient'),
  );
  const enabledButtons = row.enabled_buttons && typeof row.enabled_buttons === 'object' && !Array.isArray(row.enabled_buttons)
    ? row.enabled_buttons as Record<string, unknown>
    : {};

  return {
    ...withoutColumn,
    enabled_buttons: {
      ...enabledButtons,
      backgroundGradient: row.background_gradient,
    },
  };
}

async function saveGalleryToSupabase(gallery: DashboardGallery, accountId: string) {
  if (!canPersistGalleryToSchema(gallery)) {
    throw new Error(`${gallery.name} needs a password before it can be saved to Supabase.`);
  }

  const bundle = galleryToSchemaBundle(gallery, accountId);
  const galleryWithoutDeferredMediaRefs = {
    ...bundle.gallery,
    cover_video_id: null,
    cover_photo_id: null,
  };
  const galleryWrite = Object.fromEntries(
    Object.entries(galleryWithoutDeferredMediaRefs).filter(([key]) => !serverOwnedGalleryFields.has(key)),
  );
  const designWithoutDeferredMediaRefs = Object.fromEntries(
    Object.entries({ ...bundle.design, featured_video_id: null }).filter(([key]) => ![
      'background_r2_key',
      'music_track_name',
      'music_track_r2_key',
    ].includes(key)),
  );

  const { error: galleryError } = await supabase.from('galleries').upsert(galleryWrite);
  if (galleryError) throw galleryError;

  if (bundle.albums.length) {
    const { error } = await supabase.from('albums').upsert(bundle.albums);
    if (error) throw error;
  }

  if (bundle.videos.length) {
    const { error } = await supabase.from('videos').upsert(editableVideoRows(bundle.videos));
    if (error) {
      if (!isMissingPaidUnlockColumn(error)) throw error;

      const { error: retryError } = await supabase.from('videos').upsert(withoutPaidUnlockColumns(editableVideoRows(bundle.videos)));
      if (retryError) throw retryError;
    }
  }

  if (bundle.photos.length) {
    const { error } = await supabase.from('photos').upsert(editablePhotoRows(bundle.photos));
    if (error) throw error;
  }

  let { error: designError } = await supabase.from('gallery_design').upsert(designWithoutDeferredMediaRefs);
  if (designError && isMissingBackgroundGradientColumn(designError)) {
    ({ error: designError } = await supabase
      .from('gallery_design')
      .upsert(designWithoutBackgroundGradient(designWithoutDeferredMediaRefs)));
  }
  if (designError) throw designError;

  const { error: galleryCoverError } = await supabase
    .from('galleries')
    .update({
      cover_video_id: bundle.gallery.cover_video_id,
      cover_photo_id: bundle.gallery.cover_photo_id,
    })
    .eq('id', bundle.gallery.id);
  if (galleryCoverError) throw galleryCoverError;

  const { error: designFeaturedError } = await supabase
    .from('gallery_design')
    .update({ featured_video_id: bundle.design.featured_video_id })
    .eq('gallery_id', bundle.design.gallery_id);
  if (designFeaturedError) throw designFeaturedError;
}

export async function loadDashboardGalleries() {
  const localGalleries = loadStoredGalleries();

  if (!isSupabaseConfigured) return localGalleries;

  try {
    const accountId = await currentAccountId();
    if (!accountId) throw new Error('Supabase account membership is missing.');

    const { data: galleryRows, error: galleryError } = await supabase
      .from('galleries')
      .select('*')
      .eq('account_id', accountId)
      .is('deleted_at', null)
      .order('updated_at', { ascending: false });
    if (galleryError) throw galleryError;

    const galleries = (galleryRows ?? []) as GalleryRecord[];
    if (!galleries.length) {
      saveStoredGalleries([]);
      return [];
    }

    const galleryIds = galleries.map((gallery) => gallery.id);
    const [
      designsResult,
      videosResult,
      albumsResult,
      photosResult,
      recipientsResult,
      events,
    ] = await Promise.all([
      supabase.from('gallery_design').select('*').in('gallery_id', galleryIds),
      supabase.from('videos').select('*').in('gallery_id', galleryIds).is('deleted_at', null).order('sort_order'),
      supabase.from('albums').select('*').in('gallery_id', galleryIds).is('deleted_at', null).order('sort_order'),
      supabase.from('photos').select('*').in('gallery_id', galleryIds).is('deleted_at', null).order('sort_order'),
      supabase.from('delivery_recipients').select('*').in('gallery_id', galleryIds).order('created_at', { ascending: false }),
      loadGalleryActivityEvents(galleryIds),
    ]);

    if (designsResult.error) throw designsResult.error;
    if (videosResult.error) throw videosResult.error;
    if (albumsResult.error) throw albumsResult.error;
    if (photosResult.error) throw photosResult.error;
    if (recipientsResult.error) throw recipientsResult.error;

    const designs = (designsResult.data ?? []) as GalleryDesignRecord[];
    const videos = (videosResult.data ?? []) as VideoRecord[];
    const albums = (albumsResult.data ?? []) as AlbumRecord[];
    const photos = (photosResult.data ?? []) as PhotoRecord[];
    const recipients = (recipientsResult.data ?? []) as DeliveryRecipientRecord[];

    const hydrated = galleries.map((gallery, index) => {
      const design = designs.find((item) => item.gallery_id === gallery.id) ?? {
        gallery_id: gallery.id,
        heading_title: gallery.name,
        heading_eyebrow: 'The Wedding Film',
        heading_subtitle: null,
        layout_template: 'lumen',
        background_type: 'image' as const,
        background_gradient: null,
        background_r2_key: null,
        theme: 'dark',
        accent_color: null,
        typography: 'editorial',
        headline_font: 'Cormorant Garamond',
        headline_font_weight: 500,
        body_font: 'DM Sans',
        body_font_weight: 400,
        music_track_r2_key: null,
        music_track_name: null,
        featured_video_id: null,
        enabled_buttons: { share: true, embed: false, download: true },
        allow_downloads: null,
      };

      const galleryVideos = uniqueBy(
        videos.filter((video) => video.gallery_id === gallery.id && isVisibleDashboardVideo(video)),
        (video) => `${video.sort_order}:${video.title}:${video.duration_seconds}`,
      );
      const galleryAlbums = uniqueBy(
        albums.filter((album) => album.gallery_id === gallery.id),
        (album) => `${album.sort_order}:${album.name}`,
      );
      const galleryPhotos = photos
        .filter((photo) => photo.gallery_id === gallery.id && Boolean(photo.r2_key))
        .slice();

      return schemaBundleToGallery({
        gallery,
        design,
        videos: galleryVideos,
        albums: galleryAlbums,
        photos: galleryPhotos,
        recipients: recipients.filter((recipient) => recipient.gallery_id === gallery.id),
        events: events.filter((event) => event.gallery_id === gallery.id),
      }, index);
    });

    const merged = mergeLocalVideoMonetization(hydrated, localGalleries);
    saveStoredGalleries(merged);
    return merged;
  } catch (error) {
    console.warn('LANTERNA dashboard loaded local galleries because Supabase load failed', error);
    return localGalleries;
  }
}

export async function loadWorkspaceAccount(): Promise<WorkspaceAccount> {
  const localWorkspace = loadStoredWorkspaceAccount();

  if (!isSupabaseConfigured) return localWorkspace;

  try {
    const accountId = await currentAccountId();
    const userId = await currentUserId();
    if (!accountId || !userId) throw new Error('Supabase account membership is missing.');

    const [brandingResult, subscriptionResult, usageResult, userResult, storageStatus] = await Promise.all([
      supabase.from('vendor_branding').select('*').eq('account_id', accountId).maybeSingle(),
      supabase.from('subscriptions').select('id').eq('account_id', accountId).eq('status', 'active').gt('current_period_end', new Date().toISOString()).limit(1).maybeSingle(),
      supabase.from('account_usage').select('*').eq('account_id', accountId).maybeSingle(),
      supabase.from('users').select('*').eq('id', userId).maybeSingle(),
      getStorageStatus().catch(() => null),
    ]);

    if (brandingResult.error) throw brandingResult.error;
    if (subscriptionResult.error) throw subscriptionResult.error;
    if (usageResult.error) throw usageResult.error;
    if (userResult.error) throw userResult.error;

    const allowanceTotalGb = Number(usageResult.data?.allowance_total_gb ?? 0);
    const whiteLabelUntil = brandingResult.data?.white_label_until
      ? Date.parse(String(brandingResult.data.white_label_until))
      : 0;
    const whiteLabel = Boolean(subscriptionResult.data)
      || (Number.isFinite(whiteLabelUntil) && whiteLabelUntil > Date.now());
    const workspace: WorkspaceAccount = {
      ...defaultWorkspaceAccount,
      accountId,
      studioName: brandingResult.data?.studio_name ?? defaultWorkspaceAccount.studioName,
      tagline: brandingResult.data?.tagline ?? defaultWorkspaceAccount.tagline,
      accentColor: brandingResult.data?.accent_color ?? defaultWorkspaceAccount.accentColor,
      defaultDownloads: brandingResult.data?.default_downloads ?? defaultWorkspaceAccount.defaultDownloads,
      customDomain: whiteLabel ? brandingResult.data?.custom_domain ?? defaultWorkspaceAccount.customDomain : null,
      whiteLabel,
      allowanceUsedGb: Number(usageResult.data?.allowance_used_gb ?? 0),
      allowanceTotalGb: Math.max(0, allowanceTotalGb),
      hotBytesStored: Number(storageStatus?.hotBytesStored ?? usageResult.data?.hot_bytes_stored ?? defaultWorkspaceAccount.hotBytesStored),
      coldBytesStored: Number(storageStatus?.coldBytesStored ?? usageResult.data?.cold_bytes_stored ?? defaultWorkspaceAccount.coldBytesStored),
      streamMinutesStored: Number(storageStatus?.streamMinutesStored ?? usageResult.data?.stream_minutes_stored ?? defaultWorkspaceAccount.streamMinutesStored),
      userName: userResult.data?.display_name ?? defaultWorkspaceAccount.userName,
      userEmail: userResult.data?.email ?? defaultWorkspaceAccount.userEmail,
    };

    saveStoredWorkspaceAccount(workspace);
    return workspace;
  } catch (error) {
    console.warn('LANTERNA workspace loaded local account data because Supabase load failed', error);
    return localWorkspace;
  }
}

export async function saveWorkspaceAccount(workspace: WorkspaceAccount): Promise<WorkspaceResult> {
  persistWorkspaceLocal(workspace);

  if (!isSupabaseConfigured) {
    return { mode: 'local', ok: true, workspace };
  }

  try {
    const accountId = workspace.accountId ?? await currentAccountId();
    if (!accountId) throw new Error('Supabase account membership is missing.');

    const { error } = await supabase.from('vendor_branding').upsert({
      account_id: accountId,
      studio_name: workspace.studioName,
      tagline: workspace.tagline,
      accent_color: workspace.accentColor,
      custom_domain: workspace.whiteLabel ? workspace.customDomain : null,
      default_downloads: workspace.defaultDownloads,
    });

    if (error) throw error;

    return { mode: 'supabase', ok: true, workspace: { ...workspace, accountId } };
  } catch (error) {
    console.warn('LANTERNA workspace stayed local because Supabase save failed', error);
    return {
      mode: 'local',
      ok: true,
      reason: error instanceof Error ? error.message : 'Supabase workspace save failed',
      workspace,
    };
  }
}

export async function loadUploadJobs() {
  const localJobs = loadStoredUploadJobs().map((job) => ({
    ...job,
    errorMessage: job.errorMessage ? userMessage(job.errorMessage, 'Upload needs attention. Try again.') : undefined,
  }));

  if (!isSupabaseConfigured) return localJobs;

  try {
    const accountId = await currentAccountId();
    if (!accountId) throw new Error('Supabase account membership is missing.');

    const { data, error } = await supabase
      .from('upload_jobs')
      .select('*')
      .eq('account_id', accountId)
      .in('target_type', ['video', 'photo'])
      .order('created_at', { ascending: false });

    if (error) throw error;

    const videoIds = [...new Set((data ?? []).filter((job) => job.target_type === 'video' && job.target_id).map((job) => job.target_id))];
    const photoIds = [...new Set((data ?? []).filter((job) => job.target_type === 'photo' && job.target_id).map((job) => job.target_id))];
    const [videosResult, photosResult] = await Promise.all([
      videoIds.length
        ? supabase.from('videos').select('id,title').in('id', videoIds).is('deleted_at', null)
        : { data: [], error: null },
      photoIds.length
        ? supabase.from('photos').select('id').in('id', photoIds).is('deleted_at', null)
        : { data: [], error: null },
    ]);

    if (videosResult.error) throw videosResult.error;
    if (photosResult.error) throw photosResult.error;

    const videoTitleById = new Map((videosResult.data ?? []).map((video) => [video.id, video.title]));
    const validVideoIds = new Set(videoTitleById.keys());
    const validPhotoIds = new Set((photosResult.data ?? []).map((photo) => photo.id));
    const terminalTargets = new Set<string>();
    const activeStatuses = new Set(['pending', 'uploading', 'paused', 'processing']);
    const jobs: UploadJob[] = (data ?? []).filter((job) => {
      if (!job.target_id) return false;
      const targetKey = `${job.target_type}:${job.target_id}`;
      const targetExists = job.target_type === 'video'
        ? validVideoIds.has(job.target_id)
        : validPhotoIds.has(job.target_id);
      if (activeStatuses.has(job.status)) return true;
      if (!targetExists || terminalTargets.has(targetKey)) return false;
      terminalTargets.add(targetKey);
      return true;
    }).map((job) => {
      const errorMessage = job.error_message || (activeStatuses.has(job.status) && !(
        job.target_type === 'video'
          ? validVideoIds.has(job.target_id)
          : validPhotoIds.has(job.target_id)
      ) ? 'Upload target is missing. Retry this upload.' : undefined);

      return {
      id: job.id,
      galleryId: job.gallery_id,
      targetType: job.target_type,
      targetId: job.target_id,
      fileName: job.file_name || (job.target_type === 'video' && job.target_id
        ? videoTitleById.get(job.target_id) ?? 'Video upload'
        : 'Photo upload'),
      status: activeStatuses.has(job.status) && !(
        job.target_type === 'video'
          ? validVideoIds.has(job.target_id)
          : validPhotoIds.has(job.target_id)
      ) ? 'errored' : job.status,
      bytesTotal: Number(job.bytes_total),
      bytesUploaded: Number(job.bytes_uploaded),
      createdAt: job.created_at,
      errorCode: job.error_code ?? undefined,
      errorMessage: errorMessage ? userMessage(errorMessage, 'Upload needs attention. Try again.') : undefined,
      isReplacement: Boolean(job.is_replacement),
      uploadPhase: job.upload_phase ?? undefined,
      };
    });

    saveStoredUploadJobs(jobs);
    return jobs;
  } catch (error) {
    console.warn('LANTERNA upload jobs loaded locally because Supabase load failed', error);
    return localJobs;
  }
}

export async function saveUploadJobs(jobs: UploadJob[]): Promise<UploadJobResult> {
  saveStoredUploadJobs(jobs);

  return { mode: 'local', ok: true, jobs };
}

export async function clearUploadJob(job: UploadJob): Promise<SaveResult> {
  if (!isSupabaseConfigured) return { mode: 'local', ok: true };

  try {
    await clearUploadJobRemote(job.id);

    return { mode: 'supabase', ok: true };
  } catch (error) {
    console.warn('LANTERNA upload job clear stayed local because Supabase delete failed', error);
    return { mode: 'local', ok: true, reason: error instanceof Error ? error.message : 'Supabase upload job delete failed' };
  }
}

export async function softDeleteGalleryMedia(
  galleryId: string,
  targetId: string,
  targetType: 'video' | 'photo',
): Promise<SaveResult> {
  if (!isSupabaseConfigured) return { mode: 'local', ok: true };

  try {
    await deleteGalleryMediaRemote({ galleryId, targetId, targetType });

    return { mode: 'supabase', ok: true };
  } catch (error) {
    console.warn('LANTERNA media delete stayed local because Supabase soft-delete failed', error);
    return { mode: 'local', ok: true, reason: error instanceof Error ? error.message : 'Supabase media delete failed' };
  }
}

export async function setGalleryArchived(galleryId: string, archived: boolean): Promise<SaveResult> {
  if (!isSupabaseConfigured) return { mode: 'local', ok: true };

  await setGalleryArchivedRemote(galleryId, archived);
  return { mode: 'supabase', ok: true };
}

export async function permanentlyDeleteGallery(galleryId: string): Promise<SaveResult> {
  if (isSupabaseConfigured) await deleteGalleryPermanentlyRemote(galleryId);
  saveStoredGalleries(loadStoredGalleries().filter((gallery) => gallery.id !== galleryId));
  return { mode: isSupabaseConfigured ? 'supabase' : 'local', ok: true };
}

export async function saveDashboardGalleries(galleries: DashboardGallery[], reason: SaveReason = 'autosave'): Promise<SaveResult> {
  const localResult = persistLocal(galleries);

  if (!isSupabaseConfigured) return localResult;

  try {
    const accountId = await currentAccountId();
    if (!accountId) throw new Error('Supabase account membership is missing.');

    const validGalleries = galleries.filter(canPersistGalleryToSchema);
    await Promise.all(validGalleries.map((gallery) => saveGalleryToSupabase(gallery, accountId)));
    return { mode: 'supabase', ok: true };
  } catch (error) {
    console.warn(`LANTERNA ${reason} stayed local because Supabase save failed`, error);
    return { mode: 'local', ok: true, reason: error instanceof Error ? error.message : 'Supabase save failed' };
  }
}

export async function saveDashboardGalleryDesign(
  galleries: DashboardGallery[],
  galleryId: string,
): Promise<SaveResult> {
  const localResult = persistLocal(galleries);

  if (!isSupabaseConfigured) return localResult;

  try {
    const accountId = await currentAccountId();
    if (!accountId) throw new Error('Supabase account membership is missing.');

    const gallery = galleries.find((item) => item.id === galleryId);
    if (!gallery) throw new Error('Gallery is missing.');

    const bundle = galleryToSchemaBundle(gallery, accountId);
    const editableDesign = Object.fromEntries(
      Object.entries(bundle.design).filter(([key]) => ![
        'background_r2_key',
        'gallery_id',
        'music_track_r2_key',
        'music_track_name',
      ].includes(key)),
    );
    let { error } = await supabase
      .from('gallery_design')
      .update(editableDesign)
      .eq('gallery_id', galleryId);
    if (error && isMissingBackgroundGradientColumn(error)) {
      ({ error } = await supabase
        .from('gallery_design')
        .update(designWithoutBackgroundGradient(editableDesign))
        .eq('gallery_id', galleryId));
    }
    if (error) throw error;

    return { mode: 'supabase', ok: true };
  } catch (error) {
    console.warn('LANTERNA design stayed local because Supabase save failed', error);
    return { mode: 'local', ok: true, reason: error instanceof Error ? error.message : 'Supabase design save failed' };
  }
}

export async function deliverGallery(gallery: DashboardGallery): Promise<DeliveryResult> {
  const recipients = parseRecipientEmails(gallery.deliveryDraft.recipients);
  const deliveredGallery: DashboardGallery = {
    ...gallery,
    status: 'delivered',
    recipients: upsertSentRecipients(gallery.recipients, recipients),
    deliveryDraft: defaultDeliveryDraft(''),
  };

  if (!isSupabaseConfigured) {
    return { mode: 'local', ok: true, gallery: deliveredGallery, recipients };
  }

  try {
    await recordGalleryDelivery({
      galleryId: gallery.id,
      message: gallery.deliveryDraft.message,
      recipients,
    });

    return { mode: 'supabase', ok: true, gallery: deliveredGallery, recipients };
  } catch (error) {
    console.warn('LANTERNA delivery failed server preflight or persistence', error);
    throw error;
  }
}
