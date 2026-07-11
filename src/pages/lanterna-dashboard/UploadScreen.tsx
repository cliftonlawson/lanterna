import { useRef } from 'react';
import { ArrowLeft, Pause, RefreshCw, Upload, X } from 'lucide-react';
import { LanternLogo } from '../../components/LanternLogo';
import { type DashboardGallery, type UploadJob, type WorkspaceAccount } from './model';

type Props = {
  activeGallery: DashboardGallery;
  uploadJobs: UploadJob[];
  workspace: WorkspaceAccount;
  onOpenGallery: () => void;
  onOpenVideoDetail: (videoId: string) => void;
  onAddFiles: (files: FileList) => void;
  onRemoveUploadJob: (jobId: string) => void;
  onResumeVideoUpload: (jobId: string, file: File) => void;
  onRetryVideoPlayback: (jobId: string) => void;
  onToggleUploadJob: (jobId: string) => void;
};

export function UploadScreen({ activeGallery, uploadJobs, workspace, onOpenGallery, onOpenVideoDetail, onAddFiles, onRemoveUploadJob, onResumeVideoUpload, onRetryVideoPlayback, onToggleUploadJob }: Props) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const resumeInputRefs = useRef(new Map<string, HTMLInputElement>());
  const galleryJobs = uploadJobs.filter((job) => job.galleryId === activeGallery.id);
  const availableGb = Math.max(workspace.allowanceTotalGb - workspace.allowanceUsedGb, 0);
  const chooseFiles = () => fileInputRef.current?.click();
  const handleFiles = (files: FileList | null) => {
    if (!files?.length) return;
    onAddFiles(files);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <section className="page-shell">
      <header className="studio-header">
        <div className="crumb"><button onClick={onOpenGallery}><ArrowLeft size={16} /> Back</button><strong>Uploading to {activeGallery.name}</strong></div>
        <div className="header-actions">
          <button className="secondary" onClick={onOpenGallery}>Open gallery</button>
        </div>
      </header>
      <div className="upload-drop">
        <LanternLogo size={54} />
        <h2>Drop films or photos to upload</h2>
        <p>Add films and photo sets to this gallery.</p>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*,video/*"
          className="visually-hidden"
          onChange={(event) => handleFiles(event.currentTarget.files)}
        />
        <button className="primary" onClick={chooseFiles}><Upload size={17} /> Add files</button>
        <span className="upload-meter">{availableGb.toFixed(1)} GB available this period</span>
      </div>
      <div className="queue">
        {galleryJobs.slice(0, 5).map((job) => {
          const progress = job.uploadPhase && job.uploadPhase !== 'uploading_master'
            ? 100
            : Math.max(4, Math.min(100, Math.round((job.bytesUploaded / job.bytesTotal) * 100)));
          const canOpenVideo = job.status === 'complete' && job.targetType === 'video' && Boolean(job.targetId);
          const canRetryPlayback = job.targetType === 'video' && (job.uploadPhase === 'copy_failed' || job.uploadPhase === 'master_secured');
          const canResumeMaster = job.targetType === 'video'
            && job.uploadPhase === 'uploading_master'
            && (job.status === 'paused' || job.status === 'errored');
          const canPauseMaster = job.targetType === 'video' && job.uploadPhase === 'uploading_master' && job.status === 'uploading';
          const statusLabel = uploadStatusLabel(job, canOpenVideo);
          return (
          <div
            className={`queue-row status-${job.status} ${canOpenVideo ? 'is-clickable' : ''}`}
            key={job.id}
            onClick={() => {
              if (canOpenVideo && job.targetId) onOpenVideoDetail(job.targetId);
            }}
            role={canOpenVideo ? 'button' : undefined}
            tabIndex={canOpenVideo ? 0 : undefined}
            onKeyDown={(event) => {
              if (canOpenVideo && job.targetId && (event.key === 'Enter' || event.key === ' ')) {
                event.preventDefault();
                onOpenVideoDetail(job.targetId);
              }
            }}
          >
            <span>{job.fileName}<small>{statusLabel}</small></span>
            <div><i style={{ width: `${progress}%` }} /></div>
            <input
              ref={(element) => {
                if (element) resumeInputRefs.current.set(job.id, element);
                else resumeInputRefs.current.delete(job.id);
              }}
              accept="video/mp4,video/quicktime,video/x-m4v,video/webm,video/*"
              className="visually-hidden"
              type="file"
              onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                if (file) onResumeVideoUpload(job.id, file);
                event.currentTarget.value = '';
              }}
            />
            {canRetryPlayback ? (
              <button onClick={(event) => {
                event.stopPropagation();
                onRetryVideoPlayback(job.id);
              }}><RefreshCw size={14} /> Retry playback</button>
            ) : canResumeMaster ? (
              <button onClick={(event) => {
                event.stopPropagation();
                resumeInputRefs.current.get(job.id)?.click();
              }}><Upload size={14} /> Resume upload</button>
            ) : canPauseMaster ? (
              <button onClick={(event) => {
                event.stopPropagation();
                onToggleUploadJob(job.id);
              }}><Pause size={14} /> Pause</button>
            ) : job.status === 'complete' || job.status === 'errored' ? (
              <button onClick={(event) => {
                event.stopPropagation();
                onRemoveUploadJob(job.id);
              }}><X size={14} /> Clear</button>
            ) : null}
          </div>
          );
        })}
        {galleryJobs.length === 0 && <p className="muted">No active uploads yet.</p>}
      </div>
    </section>
  );
}

function uploadStatusLabel(job: UploadJob, canOpenVideo: boolean) {
  if (job.targetType === 'video') {
    if (canOpenVideo || job.uploadPhase === 'ready') return 'Ready · click to edit';
    if (job.uploadPhase === 'copy_failed') return job.errorMessage || 'Master secured · playback preparation failed';
    if (job.uploadPhase === 'master_secured' || job.uploadPhase === 'starting_playback') return 'Master secured';
    if (job.uploadPhase === 'preparing_playback') return 'Preparing playback';
    if (job.uploadPhase === 'uploading_master') {
      if (job.status === 'paused') return 'Master upload paused';
      if (job.status === 'errored') return job.errorMessage || 'Master upload interrupted';
      return 'Uploading master';
    }
  }

  return job.errorMessage ?? (job.status === 'complete' ? 'Completed' : job.status);
}
