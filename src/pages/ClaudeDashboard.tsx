import { useEffect, useRef, useState } from 'react';
import { AccountScreen } from './lanterna-dashboard/AccountScreen';
import { AllGalleriesScreen } from './lanterna-dashboard/AllGalleriesScreen';
import {
  completeBackgroundUpload,
  completeUpload,
  createBackgroundUploadSlot,
  createUploadSlot,
  notifyDeliveryRecipients,
  postFileToStream,
  processUploadedVideos,
  putFileToR2,
} from './lanterna-dashboard/appApi';
import { AppShell } from './lanterna-dashboard/AppShell';
import {
  clearUploadJob,
  deliverGallery,
  loadDashboardGalleries,
  loadUploadJobs,
  loadWorkspaceAccount,
  recordUploadUsage,
  saveDashboardGalleries,
  saveUploadJobs,
  saveWorkspaceAccount,
} from './lanterna-dashboard/dashboardRepository';
import { invalidRecipientEmails, parseRecipientEmails } from './lanterna-dashboard/delivery';
import { GalleryStudioScreen } from './lanterna-dashboard/GalleryStudioScreen';
import { NewGalleryModal } from './lanterna-dashboard/NewGalleryModal';
import { publicGalleryUrl } from './lanterna-dashboard/publicLinks';
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
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailVideoId, setDetailVideoId] = useState<string | null>(null);
  const [toast, setToast] = useState('');
  const [workspace, setWorkspace] = useState(defaultWorkspaceAccount);
  const [uploadJobs, setUploadJobs] = useState<UploadJob[]>([]);
  const [selectedPhotos, setSelectedPhotos] = useState<string[]>([]);
  const gallerySaveQueueRef = useRef(Promise.resolve());

  const activeGallery = galleries.find((gallery) => gallery.id === activeId) ?? galleries[0];

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
    .filter(videoNeedsProcessingRefresh)
    .map((video) => video.id)
    .join('|') ?? '';

  useEffect(() => {
    if (!activeGalleryId || !processingVideoIds) return undefined;

    let cancelled = false;
    let inFlight = false;
    const galleryId = activeGalleryId;

    const refreshProcessingVideos = async () => {
      if (inFlight) return;
      inFlight = true;

      try {
        const result = await processUploadedVideos(galleryId);
        if (cancelled || (result.processed === 0 && result.checked > 0)) return;

        const refreshedGalleries = await loadDashboardGalleries();
        if (cancelled) return;

        const refreshedActive = refreshedGalleries.find((gallery) => gallery.id === galleryId);
        if (!refreshedActive) return;

        setGalleries(refreshedGalleries);
        setActiveId(refreshedActive.id);
        await saveDashboardGalleries(refreshedGalleries, 'upload');

        const completedVideoIds = new Set(result.processedVideoIds ?? []);
        if (completedVideoIds.size > 0) {
          setUploadJobs((current) => {
            const next = current.map((job) => galleryVideoJobNeedsProcessing(job, galleryId) && job.targetId && completedVideoIds.has(job.targetId)
              ? { ...job, status: 'complete' as const, bytesUploaded: job.bytesTotal }
              : job);
            void saveUploadJobs(next);
            return next;
          });
        }

        if (result.processed > 0) showToast('Replacement video is ready');
      } catch {
        // Keep this quiet; the manual "Finish processing" action still surfaces errors.
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
  }, [activeGalleryId, processingVideoIds]);

  const commitGalleries = (
    updater: (current: DashboardGallery[]) => DashboardGallery[],
    reason: Parameters<typeof saveDashboardGalleries>[1],
  ) => {
    setGalleries((current) => {
      const next = updater(current);
      gallerySaveQueueRef.current = gallerySaveQueueRef.current
        .catch(() => undefined)
        .then(() => saveDashboardGalleries(next, reason))
        .then(() => undefined);
      return next;
    });
  };

  const showToast = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(''), 2200);
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

  const archiveGallery = (id: string) => {
    commitGalleries((prev) => prev.map((gallery) => gallery.id === id ? { ...gallery, archived: !gallery.archived } : gallery), 'archive');
    showToast('Gallery updated');
  };

  const updateActiveDesign = (patch: Partial<GalleryDesign>) => {
    commitGalleries((prev) => prev.map((gallery) => gallery.id === activeGallery.id ? { ...gallery, design: { ...gallery.design, ...patch } } : gallery), 'autosave');
  };

  const updateActiveGallery = (patch: Partial<DashboardGallery>) => {
    commitGalleries((prev) => prev.map((gallery) => gallery.id === activeGallery.id ? { ...gallery, ...patch } : gallery), 'autosave');
  };

  const createGallery = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const name = String(data.get('name') || 'Untitled gallery');
    const project = String(data.get('project') || 'Weddings') as DashboardGallery['project'];
    const access = String(data.get('access') || 'Private') as DashboardGallery['access'];
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || `gallery-${Date.now()}`;
    const gallery: DashboardGallery = {
      id: crypto.randomUUID(),
      slug,
      name,
      client: String(data.get('client') || name),
      date: String(data.get('date') || 'Just now'),
      project,
      videos: 0,
      photos: 0,
      views: '0',
      status: 'draft',
      access,
      allowDownloads: false,
      autoExpire: false,
      passwordSet: access !== 'Password' ? false : Boolean(data.get('password')),
      coverChosen: false,
      deliveryDraft: defaultDeliveryDraft(),
      design: defaultGalleryDesign(name, mediaTileGradients[galleries.length % mediaTileGradients.length]),
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

    const recipients = parseRecipientEmails(activeGallery.deliveryDraft.recipients);
    const deliveryLink = publicGalleryUrl(workspace.customDomain ?? 'deliver.lanterna.studio', activeGallery.slug);
    const deliveryResult = await deliverGallery(activeGallery);

    commitGalleries((prev) => prev.map((gallery) => gallery.id === activeGallery.id ? deliveryResult.gallery : gallery), 'delivery');
    void notifyDeliveryRecipients({ deliveryLink, gallery: activeGallery, recipients, workspace });
    showToast(deliveryResult.mode === 'supabase' ? 'Delivery sent' : `Delivery saved locally (${recipients.length})`);
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
          paidUnlockTrailer: true,
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
        setJob(jobId, { status: 'uploading' }, false);
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

        let streamUpload = targetType === 'video' && slot.stream?.url ? slot.stream : null;
        let uploadedR2Key: string | null = null;
        if (streamUpload) {
          try {
            await postFileToStream(file, streamUpload, (bytesUploaded) => setJob(jobId, { bytesUploaded, status: 'uploading' }));
          } catch {
            streamUpload = null;
            await putFileToR2(file, slot.r2, (bytesUploaded) => setJob(jobId, { bytesUploaded, status: 'uploading' }));
            uploadedR2Key = slot.r2.key;
          }
        } else {
          await putFileToR2(file, slot.r2, (bytesUploaded) => setJob(jobId, { bytesUploaded, status: 'uploading' }));
          uploadedR2Key = slot.r2.key;
        }
        await completeUpload({
          bytes: file.size,
          galleryId: activeGallery.id,
          r2Key: uploadedR2Key,
          streamUid: streamUpload ? slot.stream?.streamUploadId ?? null : null,
          targetId: target.id,
          targetType,
          uploadJobId: slot.uploadJobId,
        });
        const autoReady = targetType === 'video' && Boolean(uploadedR2Key) && !streamUpload;
        if (autoReady) await processUploadedVideos(activeGallery.id, target.id);

        setJob(jobId, { bytesUploaded: file.size, status: targetType === 'photo' || autoReady ? 'complete' : 'processing' });
        setGalleries((current) => {
          const updated = current.map((gallery) => gallery.id === activeGallery.id ? updateUploadedMedia(gallery, target.id, targetType, uploadedR2Key, file.size, streamUpload ? slot.stream?.streamUploadId ?? null : null, autoReady) : gallery);
          void saveDashboardGalleries(updated, 'upload');
          return updated;
        });
        await recordUploadUsage(activeGallery.id, file.size);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Upload failed';
        setJob(jobId, { errorMessage: message, status: 'errored' });
        setGalleries((current) => {
          const updated = current.map((gallery) => gallery.id === activeGallery.id ? removePendingMediaFromGallery(gallery, target.id, targetType) : gallery);
          void saveDashboardGalleries(updated, 'upload');
          return updated;
        });
        showToast(message);
      }
    }

    const nextAllowanceUsedGb = Number((workspace.allowanceUsedGb + uploadBytes / 1024 / 1024 / 1024).toFixed(2));
    updateWorkspace({ allowanceUsedGb: nextAllowanceUsedGb });
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
        contentType: file.type || 'application/octet-stream',
        fileName: file.name,
        galleryId: activeGallery.id,
      });

      await putFileToR2(file, slot.r2, () => undefined);
      await completeBackgroundUpload({
        bytes: file.size,
        galleryId: activeGallery.id,
        r2Key: slot.r2.key,
      });

      const updatedGalleries = galleries.map((gallery) => gallery.id === activeGallery.id ? {
        ...gallery,
        design: {
          ...gallery.design,
          backgroundR2Key: slot.r2.key,
          backgroundType: 'image' as const,
        },
      } : gallery);
      setGalleries(updatedGalleries);
      await saveDashboardGalleries(updatedGalleries, 'upload');
      await recordUploadUsage(activeGallery.id, file.size);
      updateWorkspace({ allowanceUsedGb: Number((workspace.allowanceUsedGb + file.size / 1024 / 1024 / 1024).toFixed(2)) });
      showToast('Background uploaded');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Background upload failed');
    }
  };

  const toggleUploadJob = (jobId: string) => {
    setUploadJobs((current) => {
      const next = current.map((job) => job.id === jobId ? {
        ...job,
        status: job.status === 'paused' ? 'uploading' as const : 'paused' as const,
      } : job);
      void saveUploadJobs(next);
      return next;
    });
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

  const finishProcessing = async () => {
    if (!activeGallery) return;
    try {
      const result = await processUploadedVideos(activeGallery.id);
      if (result.processed === 0) {
        const refreshedGalleries = await loadDashboardGalleries();
        const refreshedActive = refreshedGalleries.find((gallery) => gallery.id === activeGallery.id);
        if (refreshedActive) {
          setGalleries(refreshedGalleries);
          setActiveId(refreshedActive.id);
          await saveDashboardGalleries(refreshedGalleries, 'upload');
        }

        const localProcessingJobs = uploadJobs.filter((job) => galleryVideoJobNeedsProcessing(job, activeGallery.id));
        if (result.pending > 0) {
          showToast('Cloudflare is still processing that video');
          return;
        }

        if (localProcessingJobs.length > 0 && refreshedActive?.videoItems.some((video) => video.processingStatus === 'ready' && video.streamUid)) {
          const updatedJobs = uploadJobs.map((job) => galleryVideoJobNeedsProcessing(job, activeGallery.id)
            ? { ...job, status: 'complete' as const, bytesUploaded: job.bytesTotal }
            : job);
          setUploadJobs(updatedJobs);
          await saveUploadJobs(updatedJobs);
          showToast('Video is ready');
          return;
        }

        showToast('No processing videos found');
        return;
      }

      const refreshedGalleries = await loadDashboardGalleries();
      const refreshedActive = refreshedGalleries.find((gallery) => gallery.id === activeGallery.id);
      if (refreshedActive) {
        setGalleries(refreshedGalleries);
        setActiveId(refreshedActive.id);
        await saveDashboardGalleries(refreshedGalleries, 'upload');
      }

      const processedVideoIds = new Set(result.processedVideoIds ?? []);
      const updatedJobs = uploadJobs.map((job) => galleryVideoJobNeedsProcessing(job, activeGallery.id)
        && job.targetId
        && processedVideoIds.has(job.targetId)
        ? { ...job, status: 'complete' as const, bytesUploaded: job.bytesTotal }
        : job);
      setUploadJobs(updatedJobs);
      await saveUploadJobs(updatedJobs);
      showToast(`${result.processed} ${result.processed === 1 ? 'video' : 'videos'} ready`);
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Processing update failed');
    }
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
          onNewGallery={() => setNewOpen(true)}
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
          onProcessReady={finishProcessing}
          onRemoveUploadJob={removeUploadJob}
          onToggleUploadJob={toggleUploadJob}
        />
      )}

      {view === 'vendor' && <VendorDashboardScreen workspace={workspace} onWorkspaceChange={updateWorkspace} />}
      {view === 'account' && <AccountScreen workspace={workspace} />}

      {newOpen && <NewGalleryModal onClose={() => setNewOpen(false)} onCreate={createGallery} />}
      {detailOpen && activeGallery && (
        <VideoDrawer
          gallery={activeGallery}
          publicGalleryBase={workspace.customDomain ?? 'deliver.lanterna.studio'}
          videoId={detailVideoId}
          onGalleryChange={updateActiveGallery}
          onClose={() => setDetailOpen(false)}
          onShowToast={showToast}
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
    && (job.status === 'processing' || job.status === 'uploading');
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
