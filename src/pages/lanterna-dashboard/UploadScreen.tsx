import { useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Clock3, Film, Image, Pause, RefreshCw, Upload, X } from 'lucide-react';
import { LanternLogo } from '../../components/LanternLogo';
import { type DashboardGallery, type UploadJob, type WorkspaceAccount } from './model';

type Props = {
  activeGallery: DashboardGallery;
  uploadJobs: UploadJob[];
  workspace: WorkspaceAccount;
  onOpenGallery: () => void;
  onOpenVideoDetail: (videoId: string) => void;
  onAddFiles: (files: FileList) => void;
  onCancelUploadJob: (jobId: string) => void;
  onRemoveUploadJob: (jobId: string) => void;
  onResumeVideoUpload: (jobId: string, file: File) => void;
  onRetryVideoPlayback: (jobId: string) => void;
  onToggleUploadJob: (jobId: string) => void;
};

export function UploadScreen({ activeGallery, uploadJobs, workspace, onOpenGallery, onOpenVideoDetail, onAddFiles, onCancelUploadJob, onRemoveUploadJob, onResumeVideoUpload, onRetryVideoPlayback, onToggleUploadJob }: Props) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const resumeInputRefs = useRef(new Map<string, HTMLInputElement>());
  const dragDepthRef = useRef(0);
  const [isDragging, setIsDragging] = useState(false);
  const galleryJobs = uploadJobs.filter((job) => job.galleryId === activeGallery.id);
  const visibleJobs = galleryJobs;
  const availableGb = Math.max(workspace.allowanceTotalGb - workspace.allowanceUsedGb, 0);
  const chooseFiles = () => fileInputRef.current?.click();
  const handleFiles = (files: FileList | null) => {
    if (!files?.length) return;
    onAddFiles(files);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <section className="page-shell upload-page">
      <header className="upload-page-header">
        <div className="upload-page-heading">
          <button aria-label={`Back to ${activeGallery.name} gallery`} className="icon-text upload-back" onClick={onOpenGallery} type="button">
            <ArrowLeft size={16} /> Back to gallery
          </button>
          <div>
            <p className="upload-kicker">Uploading to</p>
            <h1 className="upload-title">{activeGallery.name}</h1>
          </div>
        </div>
        <button className="primary upload-open-gallery" onClick={onOpenGallery} type="button">
          Open gallery <ArrowRight size={16} />
        </button>
      </header>

      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="image/*,video/*"
        className="visually-hidden"
        tabIndex={-1}
        onChange={(event) => handleFiles(event.currentTarget.files)}
      />
      <div
        aria-describedby="upload-drop-hint upload-availability"
        aria-label={`Choose films or photos to upload to ${activeGallery.name}`}
        className={`upload-drop upload-dropzone ${isDragging ? 'is-dragging' : ''}`}
        onClick={chooseFiles}
        onDragEnter={(event) => {
          event.preventDefault();
          dragDepthRef.current += 1;
          setIsDragging(true);
        }}
        onDragLeave={(event) => {
          event.preventDefault();
          dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
          if (dragDepthRef.current === 0) setIsDragging(false);
        }}
        onDragOver={(event) => {
          event.preventDefault();
          event.dataTransfer.dropEffect = 'copy';
        }}
        onDrop={(event) => {
          event.preventDefault();
          dragDepthRef.current = 0;
          setIsDragging(false);
          handleFiles(event.dataTransfer.files);
        }}
        onKeyDown={(event) => {
          if (event.key !== 'Enter' && event.key !== ' ') return;
          event.preventDefault();
          chooseFiles();
        }}
        role="button"
        tabIndex={0}
      >
        <LanternLogo size={64} />
        <h2>Drag &amp; drop films or photos here</h2>
        <p id="upload-drop-hint">Choose video or image files. Uploads continue while you work elsewhere in LANTERNA.</p>
        <span aria-hidden="true" className="upload-dropzone-action">
          <Upload size={17} /> Select files
        </span>
        <span className="upload-meter" id="upload-availability">{availableGb.toFixed(1)} GB available this period</span>
      </div>

      <section aria-labelledby="upload-queue-heading" className="upload-queue-section">
        <header className="upload-queue-header">
          <div className="upload-queue-heading">
            <h2 id="upload-queue-heading">Upload queue</h2>
            <span>{queueCountLabel(galleryJobs.length, visibleJobs.length)}</span>
          </div>
          <p className="upload-auto-resume"><Clock3 aria-hidden="true" size={14} /> Interrupted video uploads can be resumed</p>
        </header>

        <div className="upload-queue-list">
          {visibleJobs.map((job) => {
            const progress = uploadProgress(job);
            const canOpenVideo = job.status === 'complete' && job.targetType === 'video' && Boolean(job.targetId);
            const canRetryPlayback = job.targetType === 'video' && (job.uploadPhase === 'copy_failed' || job.uploadPhase === 'master_secured');
            const canResumeMaster = job.targetType === 'video'
              && job.uploadPhase === 'uploading_master'
              && (job.status === 'paused' || job.status === 'errored');
            const canPauseMaster = job.targetType === 'video' && job.uploadPhase === 'uploading_master' && job.status === 'uploading';
            const canCancel = job.status === 'uploading'
              || job.status === 'paused'
              || job.status === 'processing'
              || canResumeMaster
              || canRetryPlayback;
            const canClear = job.status === 'complete' || (job.status === 'errored' && !canResumeMaster && !canRetryPlayback);
            const statusLabel = uploadStatusLabel(job, canOpenVideo);
            const targetGradient = uploadTargetGradient(activeGallery, job);
            const cardContent = (
              <>
                <span className={`upload-queue-thumbnail target-${job.targetType}`} style={{ background: targetGradient }}>
                  <span className="upload-queue-glyph" aria-hidden="true">
                    {job.targetType === 'video' ? <Film size={24} /> : <Image size={24} />}
                  </span>
                </span>
                <span className="upload-queue-content">
                  <span className="upload-queue-topline">
                    <strong className="upload-file-name">{job.fileName}</strong>
                    <span className="upload-file-size">{formatFileSize(job.bytesTotal)}</span>
                  </span>
                  <span
                    aria-label={`${job.fileName} upload progress`}
                    aria-valuemax={100}
                    aria-valuemin={0}
                    aria-valuenow={progress}
                    aria-valuetext={`${progress}%`}
                    className="upload-progress-track"
                    role="progressbar"
                  >
                  <span className="upload-progress-bar" style={{ width: `${Math.max(progress, 4)}%` }} />
                  </span>
                  <span className="upload-queue-meta">
                    <span aria-live="polite" className="upload-status" role="status">{statusLabel}</span>
                    <span className="upload-meta-right">{uploadMetaLabel(job, progress)}</span>
                  </span>
                </span>
              </>
            );

            return (
              <article className={`upload-queue-card status-${job.status} ${canOpenVideo ? 'is-clickable' : ''}`} key={job.id}>
                {canOpenVideo && job.targetId ? (
                  <button
                    aria-label={`Open video details for ${job.fileName}`}
                    className="upload-queue-main"
                    onClick={() => onOpenVideoDetail(job.targetId!)}
                    type="button"
                  >
                    {cardContent}
                  </button>
                ) : (
                  <div className="upload-queue-main">{cardContent}</div>
                )}

                <input
                  ref={(element) => {
                    if (element) resumeInputRefs.current.set(job.id, element);
                    else resumeInputRefs.current.delete(job.id);
                  }}
                  accept="video/mp4,video/quicktime,video/x-m4v,video/webm,video/*"
                  aria-label={`Choose the video file to resume ${job.fileName}`}
                  className="visually-hidden"
                  tabIndex={-1}
                  type="file"
                  onChange={(event) => {
                    const file = event.currentTarget.files?.[0];
                    if (file) onResumeVideoUpload(job.id, file);
                    event.currentTarget.value = '';
                  }}
                />

                <div className="upload-queue-actions">
                  {canRetryPlayback ? (
                    <button className="upload-queue-action" onClick={(event) => {
                      event.stopPropagation();
                      onRetryVideoPlayback(job.id);
                    }} type="button"><RefreshCw size={14} /> Retry preparation</button>
                  ) : null}
                  {canResumeMaster ? (
                    <button className="upload-queue-action" onClick={(event) => {
                      event.stopPropagation();
                      resumeInputRefs.current.get(job.id)?.click();
                    }} type="button"><Upload size={14} /> Resume upload</button>
                  ) : null}
                  {canPauseMaster ? (
                    <button className="upload-queue-action" onClick={(event) => {
                      event.stopPropagation();
                      onToggleUploadJob(job.id);
                    }} type="button"><Pause size={14} /> Pause</button>
                  ) : null}
                  {canCancel ? (
                    <button className="upload-queue-action is-danger" onClick={(event) => {
                      event.stopPropagation();
                      onCancelUploadJob(job.id);
                    }} type="button"><X size={14} /> Cancel</button>
                  ) : null}
                  {canClear ? (
                    <button className="upload-queue-action" onClick={(event) => {
                      event.stopPropagation();
                      onRemoveUploadJob(job.id);
                    }} type="button"><X size={14} /> Clear</button>
                  ) : null}
                </div>
              </article>
            );
          })}

          {galleryJobs.length === 0 && (
            <div className="upload-queue-empty">
              <strong>No active uploads yet</strong>
              <span>New films and photos will appear here with their upload progress.</span>
            </div>
          )}
        </div>
      </section>
    </section>
  );
}

function uploadProgress(job: UploadJob) {
  if (job.uploadPhase && job.uploadPhase !== 'uploading_master') return 100;
  if (!Number.isFinite(job.bytesTotal) || job.bytesTotal <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((job.bytesUploaded / job.bytesTotal) * 100)));
}

function uploadTargetGradient(gallery: DashboardGallery, job: UploadJob) {
  if (job.targetType === 'video') {
    return gallery.videoItems.find((video) => video.id === job.targetId)?.gradient ?? gallery.gradient;
  }

  return gallery.photoItems.find((photo) => photo.id === job.targetId)?.gradient ?? gallery.gradient;
}

function queueCountLabel(total: number, visible: number) {
  if (total === 0) return 'No files';
  if (total > visible) return `${visible} of ${total} files`;
  return `${total} ${total === 1 ? 'file' : 'files'}`;
}

function uploadMetaLabel(job: UploadJob, progress: number) {
  if (job.status === 'complete' || job.uploadPhase === 'ready') return `${job.targetType === 'video' ? 'Film' : 'Photo'} ready`;
  if (job.status === 'errored' || job.uploadPhase === 'copy_failed') return 'Action required';
  if (job.status === 'processing' || job.uploadPhase === 'preparing_playback') return 'Finalizing media';
  if (job.status === 'paused') return `${progress}% uploaded`;
  return `${formatFileSize(Math.min(job.bytesUploaded, job.bytesTotal))} of ${formatFileSize(job.bytesTotal)}`;
}

function formatFileSize(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const unitIndex = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** unitIndex;
  const precision = unitIndex === 0 || value >= 10 ? 0 : 1;
  return `${value.toFixed(precision)} ${units[unitIndex]}`;
}

function uploadStatusLabel(job: UploadJob, canOpenVideo: boolean) {
  if (job.targetType === 'video') {
    if (canOpenVideo || job.uploadPhase === 'ready') return 'Ready · click to edit';
    if (job.uploadPhase === 'copy_failed') return job.errorMessage || 'Upload complete · video preparation failed';
    if (job.uploadPhase === 'master_secured' || job.uploadPhase === 'starting_playback') return 'Upload complete';
    if (job.uploadPhase === 'preparing_playback') return 'Preparing video';
    if (job.uploadPhase === 'uploading_master') {
      if (job.status === 'paused') return 'Video upload paused';
      if (job.status === 'errored') return job.errorMessage || 'Video upload interrupted';
      return 'Uploading video';
    }
  }

  return job.errorMessage ?? (job.status === 'complete' ? 'Completed' : job.status);
}
