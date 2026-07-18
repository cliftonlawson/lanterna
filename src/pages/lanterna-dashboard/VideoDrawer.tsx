import { useEffect, useRef, useState } from 'react';
import { AlertCircle, Camera, DollarSign, Download, Loader2, Lock, Share2, Trash2, Upload, X } from 'lucide-react';
import {
  capturePosterFrame,
  completePosterUpload,
  completeVideoMasterUpload,
  createPosterUploadSlot,
  createUploadSlot,
  getConnectStatus,
  getMediaUrls,
  getStreamPlayback,
  putFileToR2,
  startVideoPlaybackPreparation,
  type SignedStreamPlayback,
  uploadVideoMasterMultipart,
} from './appApi';
import { CustomVideoPlayer } from './CustomVideoPlayer';
import { userMessage } from '../../lib/userMessages';
import { type DashboardGallery, type UploadJob } from './model';
import { publicGalleryUrl } from './publicLinks';
import { Panel, Toggle } from './shared';

const PLATFORM_FEE_RATE = 0.1;

type Props = {
  demo?: boolean;
  gallery: DashboardGallery;
  publicGalleryBase: string;
  uploadJobs: UploadJob[];
  videoId: string | null;
  onDeleteVideo: (videoId: string) => Promise<void>;
  onGalleryChange: (patch: Partial<DashboardGallery>) => void;
  onClose: () => void;
  onShowToast: (message: string) => void;
  onUploadStateChange: () => Promise<void>;
};

export function VideoDrawer({ demo = false, gallery, publicGalleryBase, uploadJobs, videoId, onDeleteVideo, onGalleryChange, onClose, onShowToast, onUploadStateChange }: Props) {
  const video = gallery.videoItems.find((item) => item.id === videoId) ?? gallery.videoItems[0];
  const videoIndex = Math.max(0, gallery.videoItems.findIndex((item) => item.id === video?.id));
  const paidEnabled = Boolean(video?.paidUnlockEnabled);
  const paidPriceCents = video?.paidUnlockPriceCents ?? 30000;
  const paidPriceDollars = Math.max(0, Math.round(paidPriceCents / 100));
  const feeDollars = Math.round(paidPriceDollars * PLATFORM_FEE_RATE);
  const payoutDollars = Math.max(0, paidPriceDollars - feeDollars);
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});
  const [streamPlayback, setStreamPlayback] = useState<Record<string, SignedStreamPlayback>>({});
  const [localPosterPreviewUrl, setLocalPosterPreviewUrl] = useState('');
  const [captureOpen, setCaptureOpen] = useState(false);
  const [captureSecond, setCaptureSecond] = useState(0);
  const [posterUploading, setPosterUploading] = useState(false);
  const [videoReplacing, setVideoReplacing] = useState(false);
  const [filmSalesReady, setFilmSalesReady] = useState<boolean | null>(null);
  const [replaceStage, setReplaceStage] = useState<'idle' | 'uploading_master' | 'master_secured' | 'preparing_playback'>('idle');
  const [replaceProgress, setReplaceProgress] = useState(0);
  const posterInputRef = useRef<HTMLInputElement | null>(null);
  const playbackKey = video?.webCopyR2Key || video?.r2Key || null;
  const posterKey = video?.posterR2Key || null;
  const playbackUrl = playbackKey ? signedUrls[playbackKey] : '';
  const stream = video?.streamUid ? streamPlayback[video.streamUid] : null;
  const remotePosterUrl = posterKey && !/\.tiff?($|\?)/i.test(posterKey) ? signedUrls[posterKey] : stream?.thumbnailUrl ?? '';
  const posterUrl = localPosterPreviewUrl || remotePosterUrl;
  const streamUrl = stream?.iframeUrl ?? '';
  const replacementJob = latestReplacementJob(uploadJobs, gallery.id, video?.id);
  const serverReplacementPending = Boolean(replacementJob
    && replacementJob.status !== 'complete'
    && replacementJob.status !== 'errored'
    && replacementJob.uploadPhase !== 'ready');
  const replacementPending = videoReplacing || serverReplacementPending;
  const replacementFailed = Boolean(replacementJob
    && (replacementJob.status === 'errored' || replacementJob.uploadPhase === 'copy_failed'));
  const serverReplaceProgress = replacementJob?.bytesTotal
    ? Math.round((replacementJob.bytesUploaded / replacementJob.bytesTotal) * 100)
    : 0;
  const pendingVideo = replacementPending || video?.processingStatus === 'uploading' || video?.processingStatus === 'processing';
  const pendingLabel = replacementPending
    ? replacementStatusLabel(
      videoReplacing ? replaceStage : replacementJob?.uploadPhase,
      videoReplacing ? replaceProgress : serverReplaceProgress,
      replacementJob?.status,
    )
    : video?.processingStatus === 'processing'
      ? 'Preparing replacement'
      : video?.processingStatus === 'uploading'
        ? 'Uploading replacement'
        : '';

  useEffect(() => {
    if (demo) {
      setFilmSalesReady(true);
      return undefined;
    }
    let cancelled = false;
    void getConnectStatus().then((status) => {
      if (!cancelled) setFilmSalesReady(status.state === 'active');
    }).catch(() => {
      if (!cancelled) setFilmSalesReady(false);
    });
    return () => {
      cancelled = true;
    };
  }, [demo]);

  useEffect(() => {
    const keys = [playbackKey, posterKey].filter(Boolean) as string[];
    if (!keys.length) {
      setSignedUrls({});
      return undefined;
    }

    let cancelled = false;
    void getMediaUrls(keys).then((nextUrls) => {
      if (!cancelled) setSignedUrls(nextUrls);
    }).catch(() => {
      if (!cancelled) setSignedUrls({});
    });

    return () => {
      cancelled = true;
    };
  }, [playbackKey, posterKey]);

  useEffect(() => {
    const streamUid = video?.streamUid;
    if (!streamUid || video.streamReady === false) {
      setStreamPlayback({});
      return undefined;
    }

    let cancelled = false;
    void getStreamPlayback(gallery.id, [streamUid]).then((nextPlayback) => {
      if (!cancelled) setStreamPlayback(nextPlayback);
    }).catch(() => {
      if (!cancelled) setStreamPlayback({});
    });

    return () => {
      cancelled = true;
    };
  }, [gallery.id, video?.streamReady, video?.streamUid]);

  useEffect(() => {
    setLocalPosterPreviewUrl('');
    setCaptureOpen(false);
    setCaptureSecond(0);
  }, [video?.id]);

  useEffect(() => () => {
    if (localPosterPreviewUrl.startsWith('blob:')) URL.revokeObjectURL(localPosterPreviewUrl);
  }, [localPosterPreviewUrl]);

  const updateVideo = (patch: Partial<NonNullable<typeof video>>) => {
    if (!video) return;
    onGalleryChange({
      videoItems: gallery.videoItems.map((item) => item.id === video.id ? { ...item, ...patch } : item),
      design: patch.title && gallery.design.featuredFilm === video.title ? { ...gallery.design, featuredFilm: patch.title } : gallery.design,
    });
  };

  const deleteVideo = async () => {
    if (!video) return;
    await onDeleteVideo(video.id);
    onShowToast('Film deleted');
    onClose();
  };

  const copyGalleryLink = () => {
    void navigator.clipboard?.writeText(publicGalleryUrl(publicGalleryBase, gallery.slug));
    onShowToast('Gallery link copied');
  };

  const setPaidMode = (enabled: boolean) => {
    if (!video) return;
    if (enabled && filmSalesReady !== true) {
      onShowToast('Set up payouts in Account & billing before offering paid films');
      return;
    }
    updateVideo({
      paidUnlockEnabled: enabled,
      paidUnlockLabel: video.paidUnlockLabel || video.title,
      paidUnlockPriceCents: video.paidUnlockPriceCents ?? 30000,
      paidUnlockTagline: video.paidUnlockTagline ?? '',
    });
    if (enabled && !video.paidUnlockEnabled) onShowToast('Marked as a paid unlock');
  };

  const updatePaidPrice = (value: string) => {
    const dollars = Number.parseInt(value.replace(/[^0-9]/g, ''), 10);
    updateVideo({ paidUnlockPriceCents: Number.isFinite(dollars) ? dollars * 100 : 0 });
  };

  const uploadPoster = async (file: File | undefined) => {
    if (!file || !video) return;
    if (!file.type.startsWith('image/') || !/(jpe?g|png|webp)$/i.test(file.name)) {
      onShowToast('Choose a JPG, PNG, or WebP image');
      return;
    }

    try {
      setPosterUploading(true);
      const slot = await createPosterUploadSlot({
        bytesTotal: file.size,
        contentType: file.type || 'application/octet-stream',
        fileName: file.name,
        galleryId: gallery.id,
        videoId: video.id,
      });
      await putFileToR2(file, slot.r2, () => undefined);
      const completed = await completePosterUpload({
        galleryId: gallery.id,
        uploadJobId: slot.uploadJobId,
        videoId: video.id,
      });
      const localPreview = URL.createObjectURL(file);
      setLocalPosterPreviewUrl(localPreview);
      void getMediaUrls([completed.r2Key]).then((nextUrls) => {
        setSignedUrls((current) => ({ ...current, ...nextUrls }));
      }).catch(() => undefined);
      updateVideo({ posterR2Key: completed.r2Key, updatedAt: 'Poster updated' });
      onShowToast('Thumbnail uploaded');
    } catch (error) {
      onShowToast(userMessage(error, 'Thumbnail could not be uploaded. Try again.'));
    } finally {
      setPosterUploading(false);
      if (posterInputRef.current) posterInputRef.current.value = '';
    }
  };

  const captureStreamFrame = async () => {
    if (!video || !streamUrl) return;

    try {
      setPosterUploading(true);
      const captured = await capturePosterFrame({
        galleryId: gallery.id,
        timeSeconds: captureSecond,
        videoId: video.id,
      });
      setLocalPosterPreviewUrl(captured.posterUrl);
      setSignedUrls((current) => ({
        ...current,
        ...Object.fromEntries(Object.entries(captured.media ?? {}).map(([key, signed]) => [key, signed.url])),
      }));
      updateVideo({ posterR2Key: captured.r2Key, updatedAt: 'Poster updated' });
      setCaptureOpen(false);
      onShowToast('Frame saved as thumbnail');
    } catch (error) {
      onShowToast(userMessage(error, 'Frame could not be saved. Try again.'));
    } finally {
      setPosterUploading(false);
    }
  };

  const replaceVideo = async (file: File | undefined) => {
    if (!file || !video) return;
    if (!file.type.startsWith('video/')) {
      onShowToast('Choose a video file');
      return;
    }

    try {
      setVideoReplacing(true);
      setReplaceStage('uploading_master');
      setReplaceProgress(0);
      updateVideo({ updatedAt: 'Replacing video' });

      const slot = await createUploadSlot({
        bytesTotal: file.size,
        contentType: file.type || 'application/octet-stream',
        fileName: file.name,
        galleryId: gallery.id,
        targetId: video.id,
        targetType: 'video',
      });
      if (slot.r2.method !== 'MULTIPART') throw new Error('Video replacement could not start. Try again.');
      await onUploadStateChange();

      await uploadVideoMasterMultipart(
        file,
        { galleryId: gallery.id, r2: slot.r2, uploadJobId: slot.uploadJobId },
        (bytesUploaded) => setReplaceProgress(Math.round((bytesUploaded / file.size) * 100)),
      );
      await completeVideoMasterUpload(gallery.id, slot.uploadJobId);
      setReplaceStage('master_secured');
      await startVideoPlaybackPreparation(gallery.id, slot.uploadJobId);
      setReplaceStage('preparing_playback');
      await onUploadStateChange();
      onShowToast('Replacement uploaded; preparing your film');
    } catch (error) {
      updateVideo({ processingStatus: video.streamUid || video.r2Key || video.webCopyR2Key ? video.processingStatus : 'errored', updatedAt: 'Replacement failed' });
      onShowToast(userMessage(error, 'Replacement could not be uploaded. Try again.'));
    } finally {
      setVideoReplacing(false);
      setReplaceStage('idle');
      setReplaceProgress(0);
    }
  };

  const chooseReplacementVideo = async () => {
    if (videoReplacing) return;

    try {
      const file = await pickVideoFile();
      if (file) await replaceVideo(file);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      onShowToast(userMessage(error, 'Video picker could not be opened. Try again.'));
    }
  };

  return (
    <div className={`drawer-backdrop ${captureOpen ? 'is-capturing' : ''}`}>
      <button className="drawer-close" onClick={onClose}><X size={17} /> Close</button>
      <section className="video-drawer">
        <p>{gallery.name} · Film {videoIndex + 1} of {Math.max(gallery.videoItems.length, 1)}</p>
        <div className={`drawer-hero ${pendingVideo ? 'is-processing' : ''}`}>
          <CustomVideoPlayer
            fallbackBackground={video?.gradient ?? gallery.gradient}
            posterUrl={posterUrl}
            streamUrl={streamUrl}
            title={video?.title ?? 'Film preview'}
            videoUrl={playbackUrl}
          />
          {pendingVideo && (
            <div className="drawer-processing-overlay" aria-live="polite">
              <Loader2 size={26} />
              <strong>{pendingLabel}</strong>
              <span>Viewing and frame capture will update once the replacement is ready.</span>
            </div>
          )}
        </div>
        {pendingVideo && (
          <div className="drawer-status-callout">
            <Loader2 size={16} />
            <span>{pendingLabel}. This can take a few minutes after larger uploads finish.</span>
          </div>
        )}
        {replacementFailed && (
          <div className="drawer-status-callout is-error" role="alert">
            <AlertCircle size={16} />
            <span>{replacementJob?.errorMessage || 'Replacement preparation failed.'} The existing video is unchanged.</span>
          </div>
        )}
        <div className="drawer-actions">
          <button onClick={copyGalleryLink}><Share2 size={15} /> Share</button>
          <button onClick={() => onShowToast(video?.downloadEnabled ? 'Download queued' : 'Downloads are disabled for this film')}><Download size={15} /> Download</button>
          <button disabled={replacementPending} onClick={() => void chooseReplacementVideo()}>
            <Upload size={15} /> {replacementPending ? replacementButtonLabel(pendingLabel) : 'Replace video'}
          </button>
          <button className="primary" onClick={() => { onShowToast('Video changes saved'); onClose(); }}>Save changes</button>
        </div>
        <div className="drawer-body">
          <Panel title="Thumbnail">
            <div className={posterUrl ? 'thumbnail-preview' : 'thumbnail-empty'}>
              <input
                ref={posterInputRef}
                accept="image/jpeg,image/png,image/webp"
                className="visually-hidden"
                type="file"
                onChange={(event) => void uploadPoster(event.currentTarget.files?.[0])}
              />
              {posterUrl ? <img alt="" src={posterUrl} /> : <Upload size={18} />}
              <strong>{posterUrl ? 'Thumbnail image' : 'No thumbnail image yet'}</strong>
              <span>{posterUrl ? 'Shown as the poster frame before the film starts.' : 'Upload a JPG, PNG, or WebP poster frame for this film.'}</span>
              <button onClick={() => posterInputRef.current?.click()} disabled={posterUploading}>
                <Upload size={15} /> {posterUploading ? 'Uploading' : posterUrl ? 'Replace thumbnail' : 'Upload thumbnail'}
              </button>
            </div>
            {streamUrl && (
              <button className="capture-frame-launch" onClick={() => setCaptureOpen(true)} type="button">
                <Camera size={15} /> Capture frame
              </button>
            )}
          </Panel>
          <Panel title="Details">
            <label>Title<input value={video?.title ?? 'Untitled film'} maxLength={80} onChange={(event) => updateVideo({ title: event.target.value })} /></label>
            <Toggle title="Public in gallery" checked={video?.visibleInGallery ?? true} onChange={(visibleInGallery) => updateVideo({ visibleInGallery })} />
            <Toggle title="Allow download" checked={video?.downloadEnabled ?? gallery.allowDownloads} onChange={(downloadEnabled) => updateVideo({ downloadEnabled })} />
            <label>Tags<input value={video?.tags.join(', ') ?? ''} onChange={(event) => updateVideo({ tags: event.target.value.split(',').map((tag) => tag.trim()).filter(Boolean) })} /></label>
            <button className="danger" onClick={() => void deleteVideo()}><Trash2 size={15} /> Delete film</button>
          </Panel>
        </div>
        <section className="paid-unlock-panel">
          <header>
            <span><Lock size={16} /></span>
            <strong>Access & pricing</strong>
          </header>
          <p>Include this film in the gallery, or lock it as a paid bonus edit the couple can unlock.</p>
          <div className="paid-segmented" role="group" aria-label="Film access pricing">
            <button className={!paidEnabled ? 'on' : ''} onClick={() => setPaidMode(false)}>Included</button>
            <button className={paidEnabled ? 'on' : ''} disabled={filmSalesReady !== true && !paidEnabled} onClick={() => setPaidMode(true)}>Paid unlock</button>
          </div>
          {filmSalesReady === false && !paidEnabled && <p className="paid-setup-note">Set up payouts in Account &amp; billing to offer paid films.</p>}
          {paidEnabled && (
            <>
              <div className="paid-form-grid">
                <label>
                  Price
                  <div className="price-field">
                    <span>$</span>
                    <input inputMode="numeric" value={paidPriceDollars} onChange={(event) => updatePaidPrice(event.target.value)} />
                    <em>one-time</em>
                  </div>
                </label>
                <label>
                  Unlock label
                  <input
                    placeholder="Speeches Film"
                    value={video?.paidUnlockLabel ?? video?.title ?? ''}
                    onChange={(event) => updateVideo({ paidUnlockLabel: event.target.value })}
                  />
                </label>
                <label className="wide">
                  Bonus tagline <span>optional</span>
                  <input
                    placeholder="The full, uncut speeches - every toast and tear."
                    value={video?.paidUnlockTagline ?? ''}
                    onChange={(event) => updateVideo({ paidUnlockTagline: event.target.value })}
                  />
                </label>
              </div>
              <div className="payout-preview">
                <span><DollarSign size={20} /></span>
                <div>
                  <strong>You receive ${payoutDollars} per unlock</strong>
                  <p>Couple pays ${paidPriceDollars} / LANTERNA fee 10% (${feeDollars}) / paid out to your studio.</p>
                </div>
              </div>
            </>
          )}
        </section>
      </section>
      {captureOpen && video && (
        <div className="frame-capture-overlay" role="dialog" aria-label="Capture thumbnail frame" aria-modal="true">
          <div className="frame-capture-scrim" />
          <section className="frame-capture-stage">
            <div className="frame-capture-topbar">
              <button onClick={() => setCaptureOpen(false)} type="button">Cancel</button>
              <span>{formatFrameTime(captureSecond)}</span>
              <button className="primary" disabled={posterUploading} onClick={() => void captureStreamFrame()} type="button">
                {posterUploading ? 'Saving frame' : 'Use frame as thumbnail'}
              </button>
            </div>
            <CustomVideoPlayer
              className="frame-capture-player"
              fallbackBackground={video.gradient ?? gallery.gradient}
              onTimeChange={setCaptureSecond}
              posterUrl={posterUrl}
              streamUrl={streamUrl}
              title={`${video.title} frame capture`}
              videoUrl={playbackUrl}
            />
          </section>
        </div>
      )}
    </div>
  );
}

function formatFrameTime(seconds: number) {
  const safeSeconds = Number.isFinite(seconds) && seconds > 0 ? seconds : 0;
  const minutes = Math.floor(safeSeconds / 60);
  const remainingSeconds = safeSeconds - minutes * 60;
  return `${minutes}:${remainingSeconds.toFixed(1).padStart(4, '0')}`;
}

function latestReplacementJob(uploadJobs: UploadJob[], galleryId: string, videoId: string | undefined) {
  if (!videoId) return undefined;

  return uploadJobs.reduce<UploadJob | undefined>((latest, job) => {
    if (!job.isReplacement || job.galleryId !== galleryId || job.targetId !== videoId) return latest;
    if (!latest || job.createdAt > latest.createdAt) return job;
    return latest;
  }, undefined);
}

function replacementStatusLabel(
  phase: UploadJob['uploadPhase'] | 'idle' | undefined,
  progress: number,
  status: UploadJob['status'] | undefined,
) {
  if (status === 'paused') return `Replacement upload paused at ${progress}%`;
  if (phase === 'master_secured') return 'Replacement uploaded';
  if (phase === 'starting_playback' || phase === 'preparing_playback') return 'Preparing replacement';
  return `Uploading replacement ${progress}%`;
}

function replacementButtonLabel(statusLabel: string) {
  if (statusLabel.startsWith('Uploading replacement')) {
    return statusLabel.replace('Uploading replacement', 'Replacing');
  }
  if (statusLabel.includes('paused')) return 'Replacement paused';
  return 'Preparing replacement';
}

async function pickVideoFile() {
  const picker = (window as Window & {
    showOpenFilePicker?: (options?: unknown) => Promise<Array<{ getFile: () => Promise<File> }>>;
  }).showOpenFilePicker;

  if (picker) {
    const handles = await picker({
      excludeAcceptAllOption: false,
      multiple: false,
      types: [{
        accept: {
          'video/*': ['.mp4', '.mov', '.m4v', '.webm'],
        },
        description: 'Video files',
      }],
    });
    return await handles[0]?.getFile();
  }

  return new Promise<File | undefined>((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'video/mp4,video/quicktime,video/x-m4v,video/webm,video/*';
    input.style.position = 'fixed';
    input.style.left = '-10000px';
    input.style.top = '0';

    const cleanup = () => {
      window.setTimeout(() => input.remove(), 0);
    };

    input.addEventListener('change', () => {
      const file = input.files?.[0];
      cleanup();
      resolve(file);
    }, { once: true });
    input.addEventListener('cancel', () => {
      cleanup();
      resolve(undefined);
    }, { once: true });

    document.body.appendChild(input);
    input.click();
  });
}
