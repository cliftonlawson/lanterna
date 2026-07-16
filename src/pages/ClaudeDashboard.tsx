import { useEffect, useRef, useState } from 'react';
import { AccountScreen } from './lanterna-dashboard/AccountScreen';
import { AllGalleriesScreen } from './lanterna-dashboard/AllGalleriesScreen';
import {
  completeBackgroundUpload,
  completeUpload,
  completeVideoMasterUpload,
  createBackgroundUploadSlot,
  createGalleryRemote,
  createUploadSlot,
  pauseVideoMasterUpload,
  processUploadedVideos,
  putFileToR2,
  setGalleryAccessRemote,
  startVideoPlaybackPreparation,
  uploadVideoMasterMultipart,
} from './lanterna-dashboard/appApi';
import { AppShell } from './lanterna-dashboard/AppShell';
import {
  clearUploadJob,
  deliverGallery,
  loadDashboardGalleries,
  loadUploadJobs,
  loadWorkspaceAccount,
  saveDashboardGalleryDesign,
  saveDashboardGalleries,
  saveUploadJobs,
  saveWorkspaceAccount,
  setGalleryArchived,
  softDeleteGalleryMedia,
} from './lanterna-dashboard/dashboardRepository';
import { invalidRecipientEmails, parseRecipientEmails } from './lanterna-dashboard/delivery';
import { GalleryStudioScreen } from './lanterna-dashboard/GalleryStudioScreen';
import { NewGalleryModal } from './lanterna-dashboard/NewGalleryModal';
import { UploadScreen } from './lanterna-dashboard/UploadScreen';
import { VendorDashboardScreen } from './lanterna-dashboard/VendorDashboardScreen';
import { VideoDrawer } from './lanterna-dashboard/VideoDrawer';
import {
  defaultDeliveryDraft,
  defaultGalleryDesign,
  defaultWorkspaceAccount,
  gbToBytes,
  mediaTileGradients,
  type DashboardGallery,
  type GalleryPhoto,
  type GalleryDesign,
  type MediaVideo,
  type ProjectName,
  type StudioTab,
  type Theme,
  type UploadJob,
  type View,
} from './lanterna-dashboard/model';

type Props = {
  onBack?: () => void;
  onSignUp?: () => void;
};

export function ClaudeDashboard({ onBack, onSignUp }: Props) {
  const [theme, setTheme] = useState<Theme>('dark');
  const [view, setView] = useState<View>('galleries');
  const [studioTab, setStudioTab] = useState<StudioTab>('videos');
  const [folder, setFolder] = useState<ProjectName | null>(null);
  const [archiveTab, setArchiveTab] = useState<'active' | 'archived'>('active');
  const [query, setQuery] = useState('');
  const [galleries, setGalleries] = useState<DashboardGallery[]>([]);
  const [activeId, setActiveId] = useState('');
  const [newOpen, setNewOpen] = useState(false);
  const [creatingGallery, setCreatingGallery] = useState(false);
  const [createGalleryError, setCreateGalleryError] = useState('');
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailVideoId, setDetailVideoId] = useState<string | null>(null);
  const [toast, setToast] = useState('');
  const [workspace, setWorkspace] = useState(defaultWorkspaceAccount);
  const [uploadJobs, setUploadJobs] = useState<UploadJob[]>([]);
  const [selectedPhotos, setSelectedPhotos] = useState<string[]>([]);
  const gallerySaveQueueRef = useRef(Promise.resolve());
  const galleriesRef = useRef<DashboardGallery[]>([]);
  const createGalleryRequestRef = useRef(false);
  const uploadAbortControllersRef = useRef(new Map<string, AbortController>());

  const activeGallery = galleries.find((gallery) => gallery.id === activeId) ?? galleries[0];

  useEffect(() => {
    galleriesRef.current = galleries;
  }, [galleries]);

  useEffect(() => {
    let mounted = true;
    void loadDashboardGalleries().then((loadedGalleries) => {
      if (!mounted) return;
      setGalleries(loadedGalleries);
      setActiveId((current) => loadedGalleries.some((gallery) => gallery.id === current) ? current : loadedGalleries[0]?.id ?? '');
    });
    void loadWorkspaceAccount().then((loadedWorkspace) => {
      if (!mounted) return;
      setWorkspace(loadedWorkspace);
    });
    void loadUploadJobs().then((loadedJobs) => {
      if (!mounted) return;
      setUploadJobs(loadedJobs);
    });

    return () => {
      mounted = false;
    };
  }, []);

  const activeGalleryId = activeGallery?.id ?? '';
  const processingVideoIds = activeGallery?.videoItems
    .filter((video) => videoNeedsProcessingRefresh(video) && !uploadJobs.some((job) => (
      job.galleryId === activeGalleryId
      && job.targetId === video.id
      && job.uploadPhase
      && job.uploadPhase !== 'preparing_playback'
      && job.uploadPhase !== 'ready'
    )))
    .map((video) => video.id)
    .join('|') ?? '';
  const processingUploadJobIds = uploadJobs
    .filter((job) => galleryVideoJobNeedsProcessing(job, activeGalleryId))
    .map((job) => job.id)
    .sort()
    .join('|');

  useEffect(() => {
    if (!activeGalleryId || (!processingVideoIds && !processingUploadJobIds)) return undefined;

    let cancelled = false;
    let inFlight = false;
    const galleryId = activeGalleryId;

    const refreshProcessingVideos = async () => {
      if (inFlight) return;
      inFlight = true;

      try {
        const result = await processUploadedVideos(galleryId);
        if (cancelled) return;

        const [refreshedGalleries, refreshedJobs] = await Promise.all([
          loadDashboardGalleries(),
          loadUploadJobs(),
        ]);
        if (cancelled) return;

        const refreshedActive = refreshedGalleries.find((gallery) => gallery.id === galleryId);
        if (!refreshedActive) return;

        setGalleries(refreshedGalleries);
        setActiveId(refreshedActive.id);
        setUploadJobs(refreshedJobs);

        const completedVideoIds = new Set(result.processedVideoIds ?? []);
        const erroredVideoIds = new Set(result.erroredVideoIds ?? []);
        if (completedVideoIds.size > 0 || erroredVideoIds.size > 0) {
          setUploadJobs((current) => {
            const byId = new Map(refreshedJobs.map((job) => [job.id, job]));
            const next = current.map((job) => {
              const refreshed = byId.get(job.id) ?? job;
              if (!galleryVideoJobNeedsProcessing(refreshed, galleryId) || !refreshed.targetId) return refreshed;
              if (completedVideoIds.has(refreshed.targetId)) return { ...refreshed, status: 'complete' as const, bytesUploaded: refreshed.bytesTotal };
              if (erroredVideoIds.has(refreshed.targetId)) return { ...refreshed, errorMessage: 'Video processing failed', status: 'errored' as const };
              return refreshed;
            });
            void saveUploadJobs(next);
            return next;
          });
        }

        if (result.errored > 0) showToast('Video processing failed');
        else if (result.processed > 0) showToast('Video is ready');
      } catch {
        // Keep this quiet; the upload queue keeps polling until processing finishes or fails.
      } finally {
        inFlight = false;
      }
    };

    void refreshProcessingVideos();
    const interval = window.setInterval(refreshProcessingVideos, 15000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [activeGalleryId, processingUploadJobIds, processingVideoIds]);

  const commitGalleries = (
    updater: (current: DashboardGallery[]) => DashboardGallery[],
    reason: Parameters<typeof saveDashboardGalleries>[1],
    designGalleryId?: string,
  ) => {
    const next = updater(galleriesRef.current);
    galleriesRef.current = next;
    setGalleries(next);
    gallerySaveQueueRef.current = gallerySaveQueueRef.current
      .catch(() => undefined)
      .then(() => designGalleryId
        ? saveDashboardGalleryDesign(next, designGalleryId)
        : saveDashboardGalleries(next, reason))
      .then(() => undefined);
  };

  const showToast = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(''), 2200);
  };

  const patchUploadJob = (jobId: string, patch: Partial<UploadJob>) => {
    setUploadJobs((current) => {
      const next = current.map((job) => job.id === jobId ? { ...job, ...patch } : job);
      void saveUploadJobs(next);
      return next;
    });
  };

  const updateWorkspace = (patch: Partial<typeof workspace>) => {
    setWorkspace((current) => {
      const next = { ...current, ...patch };
      void saveWorkspaceAccount(next).then((result) => {
        if (result.workspace.accountId && result.workspace.accountId !== next.accountId) {
          setWorkspace((latest) => ({ ...latest, accountId: result.workspace.accountId }));
        }
      });
      return next;
    });
  };

  const openGallery = (id: string, tab: StudioTab = 'videos') => {
    setActiveId(id);
    setStudioTab(tab);
    setView('studio');
  };

  const openVideoDetail = (videoId: string) => {
    setDetailVideoId(videoId);
    setDetailOpen(true);
  };

  const refreshUploadState = async () => {
    const [refreshedGalleries, refreshedJobs] = await Promise.all([
      loadDashboardGalleries(),
      loadUploadJobs(),
    ]);
    setGalleries(refreshedGalleries);
    setUploadJobs(refreshedJobs);
  };

  const archiveGallery = async (id: string) => {
    const gallery = galleries.find((item) => item.id === id);
    if (!gallery) return;

    const archived = !gallery.archived;
    try {
      await setGalleryArchived(id, archived);
      commitGalleries((prev) => prev.map((item) => item.id === id ? { ...item, archived } : item), 'archive');
      showToast(archived ? 'Gallery archived' : 'Gallery restored');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Gallery update failed');
    }
  };

  const updateActiveDesign = (patch: Partial<GalleryDesign>) => {
    commitGalleries(
      (prev) => prev.map((gallery) => gallery.id === activeGallery.id ? { ...gallery, design: { ...gallery.design, ...patch } } : gallery),
      'autosave',
      activeGallery.id,
    );
  };

  const updateActiveGallery = (patch: Partial<DashboardGallery>) => {
    commitGalleries((prev) => prev.map((gallery) => gallery.id === activeGallery.id ? { ...gallery, ...patch } : gallery), 'autosave');
  };

  const deleteActiveVideo = async (videoId: string) => {
    const video = activeGallery.videoItems.find((item) => item.id === videoId);
    if (!video) return;

    const nextVideos = activeGallery.videoItems.filter((item) => item.id !== videoId);
    const nextFeaturedFilm = activeGallery.design.featuredFilm === video.title
      ? nextVideos[0]?.title ?? ''
      : activeGallery.design.featuredFilm;

    const result = await softDeleteGalleryMedia(activeGallery.id, videoId, 'video');
    commitGalleries((prev) => prev.map((gallery) => gallery.id === activeGallery.id ? {
      ...gallery,
      coverChosen: nextVideos.length > 0 ? gallery.coverChosen : false,
      design: { ...gallery.design, featuredFilm: nextFeaturedFilm },
      videoItems: nextVideos,
      videos: nextVideos.length,
    } : gallery), 'video');

    if (result.mode === 'local') showToast(result.reason ?? 'Film removed locally; database delete did not complete');
  };

  const createGallery = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (createGalleryRequestRef.current) return;

    const data = new FormData(event.currentTarget);
    const name = String(data.get('name') || '').trim() || 'Untitled gallery';
    const project = String(data.get('project') || 'Weddings') as DashboardGallery['project'];
    const access = String(data.get('access') || 'Private') as DashboardGallery['access'];
    const password = String(data.get('password') || '').trim();
    if (access === 'Password' && !password) {
      setCreateGalleryError('Set a password before creating this gallery.');
      return;
    }

    createGalleryRequestRef.current = true;
    setCreatingGallery(true);
    setCreateGalleryError('');

    try {
      const result = await createGalleryRemote({
        accessType: access === 'Public' ? 'public' : access === 'Password' ? 'password' : 'private',
        clientName: String(data.get('client') || '').trim() || name,
        eventDate: String(data.get('date') || '').trim() || null,
        name,
        password: access === 'Password' ? password : null,
        projectType: project === 'Engagements' ? 'engagement' : project === 'Portraits' ? 'portrait' : 'wedding',
      });
      const persisted = result.gallery;
      const gallery: DashboardGallery = {
        id: persisted.id,
        slug: persisted.slug,
        name: persisted.name,
        client: persisted.clientName,
        date: persisted.eventDate || 'Just now',
        project,
        videos: 0,
        photos: 0,
        views: '0',
        status: persisted.status,
        access,
        allowDownloads: false,
        autoExpire: false,
        passwordSet: persisted.passwordSet,
        coverChosen: false,
        deliveryDraft: defaultDeliveryDraft(),
        design: defaultGalleryDesign(persisted.name, mediaTileGradients[galleries.length % mediaTileGradients.length]),
        gradient: mediaTileGradients[galleries.length % mediaTileGradients.length],
        videoItems: [],
        albums: [],
        photoItems: [],
        recipients: [],
      };

      commitGalleries((prev) => [gallery, ...prev], 'create');
      setActiveId(gallery.id);
      setNewOpen(false);
      setView('upload');
      showToast(`Gallery "${name}" created`);
    } catch (error) {
      const message = error instanceof Error && error.message !== 'Failed to fetch'
        ? error.message
        : 'Gallery could not be saved. Check your connection and try again.';
      setCreateGalleryError(message);
    } finally {
      createGalleryRequestRef.current = false;
      setCreatingGallery(false);
    }
  };

  const updateGalleryAccess = async (access: DashboardGallery['access'], password?: string) => {
    const accessType = access === 'Public' ? 'public' : access === 'Password' ? 'password' : 'private';
    const result = await setGalleryAccessRemote(activeGallery.id, accessType, password);
    setGalleries((current) => current.map((gallery) => gallery.id === activeGallery.id ? {
      ...gallery,
      access,
      passwordHash: null,
      passwordSet: result.gallery.passwordSet,
    } : gallery));
  };

  const sendDelivery = async () => {
    const preflight = [
      { ok: activeGallery.access !== 'Password' || activeGallery.passwordSet, message: 'Set gallery password' },
      { ok: activeGallery.videos > 0, message: 'Add at least one film to deliver' },
      { ok: activeGallery.coverChosen, message: 'Choose a cover before delivery' },
      { ok: activeGallery.deliveryDraft.recipients.trim().length > 0, message: 'Add at least one recipient' },
    ];
    const failed = preflight.find((item) => !item.ok);
    const invalidRecipients = invalidRecipientEmails(activeGallery.deliveryDraft.recipients);

    if (failed) {
      showToast(failed.message);
      return;
    }

    if (invalidRecipients.length > 0) {
      showToast(`Fix recipient: ${invalidRecipients[0]}`);
      return;
    }

    try {
      const deliveryResult = await deliverGallery(activeGallery);

      commitGalleries((prev) => prev.map((gallery) => gallery.id === activeGallery.id ? deliveryResult.gallery : gallery), 'delivery');
      const recipients = parseRecipientEmails(activeGallery.deliveryDraft.recipients);
      showToast(deliveryResult.mode === 'supabase' ? 'Delivery sent' : `Delivery saved locally (${recipients.length})`);
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Delivery blocked');
    }
  };

  const addFilesToGallery = async (fileList: FileList) => {
    if (!activeGallery) return;

    const files = Array.from(fileList).filter((file) => file.type.startsWith('image/') || file.type.startsWith('video/'));
    const skipped = fileList.length - files.length;
    const uploadBytes = files.reduce((sum, file) => sum + file.size, 0);
    const availableBytes = gbToBytes(workspace.allowanceTotalGb - workspace.allowanceUsedGb);

    if (!files.length) {
      showToast('Choose image or video files');
      return;
    }

    if (availableBytes < uploadBytes) {
      showToast('Not enough upload allowance');
      return;
    }

    const now = Date.now();
    let nextVideoIndex = activeGallery.videoItems.length + 1;
    let nextPhotoIndex = activeGallery.photoItems.length + 1;
    const videos: MediaVideo[] = [];
    const photos: GalleryPhoto[] = [];

    files.forEach((file, index) => {
      if (file.type.startsWith('video/')) {
        const videoIndex = nextVideoIndex;
        nextVideoIndex += 1;
        videos.push({
          id: `${activeGallery.id}-video-${now}-${index}`,
          title: cleanFileTitle(file.name) || (videoIndex === 1 ? 'Wedding Film' : `Film ${videoIndex}`),
          duration: '0:00',
          gradient: mediaTileGradients[videoIndex % mediaTileGradients.length],
          paidUnlockEnabled: false,
          paidUnlockPriceCents: 30000,
          processingStatus: 'uploading',
          downloadEnabled: activeGallery.allowDownloads,
          visibleInGallery: true,
          tags: [],
          updatedAt: 'Uploading now',
        });
        return;
      }

      const photoIndex = nextPhotoIndex;
      nextPhotoIndex += 1;
      photos.push({
        id: `${activeGallery.id}-photo-${now}-${index}`,
        albumId: activeGallery.albums[0]?.id ?? null,
        gradient: mediaTileGradients[photoIndex % mediaTileGradients.length],
        aspectRatio: '4/3',
        processingStatus: 'uploading',
      });
    });

    const photoIds = photos.map((photo) => photo.id);
    const fileTargets = files.map((file) => {
      const isVideo = file.type.startsWith('video/');
      const target = isVideo ? videos.shift() : photos.shift();
      if (!target) throw new Error(`Missing upload target for ${file.name}`);
      return { file, target, targetType: isVideo ? 'video' as const : 'photo' as const };
    });
    const videoTargets = fileTargets.filter((target) => target.targetType === 'video').map((target) => target.target as MediaVideo);
    const photoTargets = fileTargets.filter((target) => target.targetType === 'photo').map((target) => target.target as GalleryPhoto);
    const jobs: UploadJob[] = fileTargets.map(({ file, target, targetType }) => ({
      id: crypto.randomUUID(),
      galleryId: activeGallery.id,
      targetType,
      targetId: target.id,
      fileName: file.name,
      status: 'pending',
      bytesTotal: file.size,
      bytesUploaded: 0,
      createdAt: new Date().toISOString(),
      uploadPhase: targetType === 'video' ? 'uploading_master' : undefined,
    }));

    const nextGalleries = galleries.map((gallery) => gallery.id === activeGallery.id ? {
      ...gallery,
      coverChosen: true,
      videos: gallery.videoItems.length + videoTargets.length,
      photos: gallery.photoItems.length + photoTargets.length,
      videoItems: [...gallery.videoItems, ...videoTargets],
      photoItems: [...gallery.photoItems, ...photoTargets],
      albums: gallery.albums.map((album, index) => index === 0 ? { ...album, photoIds: [...album.photoIds, ...photoIds] } : album),
      design: gallery.design.featuredFilm || !videoTargets[0] ? gallery.design : { ...gallery.design, featuredFilm: videoTargets[0].title },
    } : gallery);
    let nextJobs = [...jobs, ...uploadJobs];

    setGalleries(nextGalleries);
    setUploadJobs(nextJobs);
    showToast(skipped > 0 ? `Uploading ${files.length}; skipped ${skipped}` : `Uploading ${files.length} ${files.length === 1 ? 'file' : 'files'}`);

    const setJob = (jobId: string, patch: Partial<UploadJob>, persist = true) => {
      nextJobs = nextJobs.map((job) => job.id === jobId ? { ...job, ...patch } : job);
      setUploadJobs(nextJobs);
      if (persist) void saveUploadJobs(nextJobs);
    };

    await saveDashboardGalleries(nextGalleries, 'upload');

    for (const { file, target, targetType } of fileTargets) {
      const localJob = nextJobs.find((job) => job.targetId === target.id);
      if (!localJob) continue;

      let jobId = localJob.id;
      try {
        setJob(jobId, { status: 'pending' }, false);
        const slot = await createUploadSlot({
          bytesTotal: file.size,
          contentType: file.type || 'application/octet-stream',
          fileName: file.name,
          galleryId: activeGallery.id,
          targetId: target.id,
          targetType,
        });
        nextJobs = nextJobs.map((job) => job.id === jobId ? { ...job, id: slot.uploadJobId } : job);
        jobId = slot.uploadJobId;
        setUploadJobs(nextJobs);
        setJob(jobId, {
          status: 'uploading',
          uploadPhase: targetType === 'video' ? 'uploading_master' : undefined,
        });

        if (targetType === 'video') {
          if (slot.r2.method !== 'MULTIPART') throw new Error('Video upload did not return an R2 multipart session.');
          const controller = new AbortController();
          uploadAbortControllersRef.current.set(jobId, controller);

          await uploadVideoMasterMultipart(
            file,
            { galleryId: activeGallery.id, r2: slot.r2, uploadJobId: slot.uploadJobId },
            (bytesUploaded) => setJob(jobId, {
              bytesUploaded,
              status: 'uploading',
              uploadPhase: 'uploading_master',
            }),
            controller.signal,
          );
          const master = await completeVideoMasterUpload(activeGallery.id, slot.uploadJobId);
          uploadAbortControllersRef.current.delete(jobId);
          setJob(jobId, {
            bytesUploaded: master.verifiedBytes,
            errorCode: undefined,
            errorMessage: undefined,
            status: 'processing',
            uploadPhase: 'master_secured',
          });
          setGalleries((current) => current.map((gallery) => gallery.id === activeGallery.id
            ? updateUploadedMedia(gallery, target.id, 'video', master.r2Key, master.verifiedBytes, null, false)
            : gallery));
          showToast('Master secured; preparing playback');

          try {
            const playback = await startVideoPlaybackPreparation(activeGallery.id, slot.uploadJobId);
            setJob(jobId, { status: 'processing', uploadPhase: playback.uploadPhase });
            setGalleries((current) => current.map((gallery) => gallery.id === activeGallery.id
              ? updateUploadedMedia(gallery, target.id, 'video', master.r2Key, master.verifiedBytes, playback.streamUid, false)
              : gallery));
          } catch (error) {
            const [refreshedGalleries, refreshedJobs] = await Promise.all([
              loadDashboardGalleries(),
              loadUploadJobs(),
            ]);
            const refreshedById = new Map(refreshedJobs.map((job) => [job.id, job]));
            nextJobs = nextJobs.map((job) => refreshedById.get(job.id) ?? job);
            setGalleries(refreshedGalleries);
            setUploadJobs(nextJobs);
            showToast(error instanceof Error ? error.message : 'Master secured; playback preparation needs a retry');
          }
          continue;
        }

        if (slot.r2.method !== 'PUT') throw new Error('Photo upload did not return an R2 upload URL.');
        await putFileToR2(file, slot.r2, (bytesUploaded) => setJob(jobId, { bytesUploaded, status: 'uploading' }));
        const completed = await completeUpload({
          galleryId: activeGallery.id,
          targetId: target.id,
          targetType: 'photo',
          uploadJobId: slot.uploadJobId,
        });
        setJob(jobId, { bytesUploaded: completed.verifiedBytes, status: 'complete' });
        setGalleries((current) => {
          const updated = current.map((gallery) => gallery.id === activeGallery.id
            ? updateUploadedMedia(gallery, target.id, 'photo', completed.r2Key, completed.verifiedBytes)
            : gallery);
          void saveDashboardGalleries(updated, 'upload');
          return updated;
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Upload failed';
        const paused = error instanceof DOMException && error.name === 'AbortError';
        uploadAbortControllersRef.current.delete(jobId);
        setJob(jobId, {
          errorMessage: paused ? undefined : message,
          status: paused ? 'paused' : 'errored',
          uploadPhase: targetType === 'video' ? 'uploading_master' : undefined,
        });
        if (targetType === 'photo') {
          setGalleries((current) => {
            const updated = current.map((gallery) => gallery.id === activeGallery.id ? removePendingMediaFromGallery(gallery, target.id, targetType) : gallery);
            void saveDashboardGalleries(updated, 'upload');
            return updated;
          });
        }
        showToast(message);
      }
    }

    const refreshedWorkspace = await loadWorkspaceAccount();
    setWorkspace(refreshedWorkspace);
  };

  const resumeVideoMasterUpload = async (jobId: string, file: File) => {
    const job = uploadJobs.find((item) => item.id === jobId);
    const gallery = galleries.find((item) => item.id === job?.galleryId);
    if (!job || !gallery || job.targetType !== 'video' || !job.targetId) return;
    if (file.name !== job.fileName || file.size !== job.bytesTotal) {
      showToast('Choose the same video file to resume this upload');
      return;
    }

    try {
      patchUploadJob(job.id, {
        errorCode: undefined,
        errorMessage: undefined,
        status: 'uploading',
        uploadPhase: 'uploading_master',
      });
      const slot = await createUploadSlot({
        bytesTotal: file.size,
        contentType: file.type || 'application/octet-stream',
        fileName: file.name,
        galleryId: gallery.id,
        resumeUploadJobId: job.id,
        targetId: job.targetId,
        targetType: 'video',
      });
      if (slot.r2.method !== 'MULTIPART') throw new Error('Video resume did not return an R2 multipart session.');

      const controller = new AbortController();
      uploadAbortControllersRef.current.set(job.id, controller);
      await uploadVideoMasterMultipart(
        file,
        { galleryId: gallery.id, r2: slot.r2, uploadJobId: job.id },
        (bytesUploaded) => patchUploadJob(job.id, { bytesUploaded, status: 'uploading', uploadPhase: 'uploading_master' }),
        controller.signal,
      );

      const master = await completeVideoMasterUpload(gallery.id, job.id);
      uploadAbortControllersRef.current.delete(job.id);
      patchUploadJob(job.id, {
        bytesUploaded: master.verifiedBytes,
        status: 'processing',
        uploadPhase: 'master_secured',
      });
      setGalleries((current) => current.map((item) => item.id === gallery.id
        ? updateUploadedMedia(item, job.targetId!, 'video', master.r2Key, master.verifiedBytes, null, false)
        : item));

      const playback = await startVideoPlaybackPreparation(gallery.id, job.id);
      patchUploadJob(job.id, { status: 'processing', uploadPhase: playback.uploadPhase });
      setGalleries((current) => current.map((item) => item.id === gallery.id
        ? updateUploadedMedia(item, job.targetId!, 'video', master.r2Key, master.verifiedBytes, playback.streamUid, false)
        : item));
      setWorkspace(await loadWorkspaceAccount());
      showToast('Master secured; preparing playback');
    } catch (error) {
      const paused = error instanceof DOMException && error.name === 'AbortError';
      uploadAbortControllersRef.current.delete(job.id);
      if (paused) {
        patchUploadJob(job.id, { status: 'paused', uploadPhase: 'uploading_master' });
        return;
      }
      const [refreshedGalleries, refreshedJobs] = await Promise.all([
        loadDashboardGalleries(),
        loadUploadJobs(),
      ]);
      setGalleries(refreshedGalleries);
      setUploadJobs(refreshedJobs);
      showToast(error instanceof Error ? error.message : 'Upload resume failed');
    }
  };

  const retryVideoPlayback = async (jobId: string) => {
    const job = uploadJobs.find((item) => item.id === jobId);
    if (!job || job.targetType !== 'video') return;

    try {
      patchUploadJob(job.id, {
        errorCode: undefined,
        errorMessage: undefined,
        status: 'processing',
        uploadPhase: 'starting_playback',
      });
      const playback = await startVideoPlaybackPreparation(job.galleryId, job.id);
      patchUploadJob(job.id, { status: 'processing', uploadPhase: playback.uploadPhase });
      showToast('Preparing playback from the secured master');
    } catch (error) {
      const [refreshedGalleries, refreshedJobs] = await Promise.all([
        loadDashboardGalleries(),
        loadUploadJobs(),
      ]);
      setGalleries(refreshedGalleries);
      setUploadJobs(refreshedJobs);
      showToast(error instanceof Error ? error.message : 'Playback retry failed');
    }
  };

  const uploadBackgroundImage = async (file: File) => {
    if (!activeGallery) return;
    if (!file.type.startsWith('image/')) {
      showToast('Choose an image file');
      return;
    }

    const availableBytes = gbToBytes(workspace.allowanceTotalGb - workspace.allowanceUsedGb);
    if (availableBytes < file.size) {
      showToast('Not enough upload allowance');
      return;
    }

    try {
      showToast('Uploading background');
      const slot = await createBackgroundUploadSlot({
        bytesTotal: file.size,
        contentType: file.type || 'application/octet-stream',
        fileName: file.name,
        galleryId: activeGallery.id,
      });

      await putFileToR2(file, slot.r2, () => undefined);
      const completed = await completeBackgroundUpload({
        galleryId: activeGallery.id,
        uploadJobId: slot.uploadJobId,
      });

      const updatedGalleries = galleries.map((gallery) => gallery.id === activeGallery.id ? {
        ...gallery,
        design: {
          ...gallery.design,
          backgroundR2Key: completed.r2Key,
          backgroundType: 'image' as const,
        },
      } : gallery);
      setGalleries(updatedGalleries);
      await saveDashboardGalleries(updatedGalleries, 'upload');
      updateWorkspace({ allowanceUsedGb: workspace.allowanceUsedGb + completed.verifiedBytes / 1_000_000_000 });
      showToast('Background uploaded');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Background upload failed');
    }
  };

  const toggleUploadJob = (jobId: string) => {
    const job = uploadJobs.find((item) => item.id === jobId);
    if (!job) return;

    if (job.targetType === 'video' && job.uploadPhase === 'uploading_master') {
      uploadAbortControllersRef.current.get(jobId)?.abort();
      patchUploadJob(jobId, { status: 'paused' });
      void pauseVideoMasterUpload(job.galleryId, job.id).catch((error) => {
        showToast(error instanceof Error ? error.message : 'Could not pause upload');
      });
      return;
    }

    patchUploadJob(jobId, { status: job.status === 'paused' ? 'uploading' : 'paused' });
  };

  const removeUploadJob = (jobId: string) => {
    const job = uploadJobs.find((item) => item.id === jobId);
    const nextJobs = uploadJobs.filter((item) => item.id !== jobId);
    setUploadJobs(nextJobs);
    void saveUploadJobs(nextJobs);

    if (!job) return;
    void clearUploadJob(job);
    if (job.status === 'complete') return;
    const updatedGalleries = galleries.map((gallery) => gallery.id === job.galleryId ? removePendingMediaFromGallery(gallery, job.targetId, job.targetType) : gallery);
    setGalleries(updatedGalleries);
    void saveDashboardGalleries(updatedGalleries, 'upload');
  };

  return (
    <AppShell
      galleries={galleries}
      workspace={workspace}
      theme={theme}
      view={view}
      folder={folder}
      onFolderChange={setFolder}
      onViewChange={setView}
    >
      {view === 'galleries' && (
        <AllGalleriesScreen
          archiveTab={archiveTab}
          folder={folder}
          galleries={galleries}
          query={query}
          theme={theme}
          workspace={workspace}
          onArchiveGallery={archiveGallery}
          onArchiveTabChange={setArchiveTab}
          onBack={onBack}
          onNewGallery={() => {
            setCreateGalleryError('');
            setNewOpen(true);
          }}
          onOpenGallery={openGallery}
          onQueryChange={setQuery}
          onSignUp={onSignUp}
          onThemeChange={setTheme}
        />
      )}

      {view === 'studio' && activeGallery && (
        <GalleryStudioScreen
          activeGallery={activeGallery}
          selectedPhotos={selectedPhotos}
          studioTab={studioTab}
          workspace={workspace}
          onBackToGalleries={() => setView('galleries')}
          onDesignChange={updateActiveDesign}
          onGalleryChange={updateActiveGallery}
          onGalleryAccessChange={updateGalleryAccess}
          onBackgroundUpload={uploadBackgroundImage}
          onOpenUpload={() => setView('upload')}
          onSelectedPhotosChange={setSelectedPhotos}
          onSendDelivery={sendDelivery}
          onShowToast={showToast}
          onStudioTabChange={setStudioTab}
          onVideoDetailOpen={openVideoDetail}
        />
      )}

      {view === 'upload' && activeGallery && (
        <UploadScreen
          activeGallery={activeGallery}
          uploadJobs={uploadJobs}
          workspace={workspace}
          onAddFiles={addFilesToGallery}
          onOpenGallery={() => openGallery(activeGallery.id)}
          onOpenVideoDetail={(videoId) => {
            openGallery(activeGallery.id, 'videos');
            openVideoDetail(videoId);
          }}
          onRemoveUploadJob={removeUploadJob}
          onResumeVideoUpload={(jobId, file) => void resumeVideoMasterUpload(jobId, file)}
          onRetryVideoPlayback={(jobId) => void retryVideoPlayback(jobId)}
          onToggleUploadJob={toggleUploadJob}
        />
      )}

      {view === 'vendor' && <VendorDashboardScreen workspace={workspace} onWorkspaceChange={updateWorkspace} />}
      {view === 'account' && <AccountScreen workspace={workspace} onBack={() => {
        setFolder(null);
        setView('galleries');
      }} />}

      {newOpen && (
        <NewGalleryModal
          error={createGalleryError}
          submitting={creatingGallery}
          onClose={() => {
            setCreateGalleryError('');
            setNewOpen(false);
          }}
          onCreate={createGallery}
        />
      )}
      {detailOpen && activeGallery && (
        <VideoDrawer
          gallery={activeGallery}
          publicGalleryBase={workspace.customDomain ?? 'deliver.lanterna.studio'}
          uploadJobs={uploadJobs}
          videoId={detailVideoId}
          onDeleteVideo={deleteActiveVideo}
          onGalleryChange={updateActiveGallery}
          onClose={() => setDetailOpen(false)}
          onShowToast={showToast}
          onUploadStateChange={refreshUploadState}
        />
      )}
      {toast && <div className="toast">{toast}</div>}
    </AppShell>
  );
}

function cleanFileTitle(fileName: string) {
  return fileName
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function videoNeedsProcessingRefresh(video: MediaVideo) {
  return (video.processingStatus === 'processing' || video.processingStatus === 'uploading')
    && Boolean(video.r2Key || video.webCopyR2Key || video.streamUid);
}

function galleryVideoJobNeedsProcessing(job: UploadJob, galleryId: string) {
  return job.galleryId === galleryId
    && job.targetType === 'video'
    && job.status === 'processing'
    && (!job.uploadPhase || job.uploadPhase === 'preparing_playback');
}

function removePendingMediaFromGallery(gallery: DashboardGallery, targetId: string | null, targetType: 'video' | 'photo') {
  if (!targetId) return gallery;

  if (targetType === 'photo') {
    const nextPhotoItems = gallery.photoItems.filter((photo) => photo.id !== targetId || Boolean(photo.r2Key));
    if (nextPhotoItems.length === gallery.photoItems.length) return gallery;

    return {
      ...gallery,
      albums: gallery.albums.map((album) => ({ ...album, photoIds: album.photoIds.filter((photoId) => photoId !== targetId) })),
      photoItems: nextPhotoItems,
      photos: nextPhotoItems.length,
    };
  }

  const nextVideoItems = gallery.videoItems.filter((video) => video.id !== targetId || Boolean(video.r2Key || video.webCopyR2Key || video.streamUid));
  if (nextVideoItems.length === gallery.videoItems.length) return gallery;

  const nextFeaturedFilm = nextVideoItems.some((video) => video.title === gallery.design.featuredFilm)
    ? gallery.design.featuredFilm
    : nextVideoItems[0]?.title ?? '';

  return {
    ...gallery,
    coverChosen: nextVideoItems.length > 0 || gallery.photoItems.length > 0 ? gallery.coverChosen : false,
    design: { ...gallery.design, featuredFilm: nextFeaturedFilm },
    videoItems: nextVideoItems,
    videos: nextVideoItems.length,
  };
}

function updateUploadedMedia(gallery: DashboardGallery, targetId: string, targetType: 'video' | 'photo', r2Key: string | null, r2Bytes: number, streamUid: string | null = null, ready = false) {
  if (targetType === 'photo') {
    return {
      ...gallery,
      photoItems: gallery.photoItems.map((photo) => photo.id === targetId ? { ...photo, processingStatus: 'ready' as const, r2Bytes, r2Key } : photo),
    };
  }

  return {
    ...gallery,
    videoItems: gallery.videoItems.map((video) => video.id === targetId ? {
      ...video,
      processingStatus: ready ? 'ready' as const : 'processing' as const,
      r2Bytes,
      r2Key,
      streamReady: ready ? false : video.streamReady,
      streamUid,
      updatedAt: ready ? 'Ready' : 'Uploaded; processing',
    } : video),
  };
}
