import { useRef } from 'react';
import { ArrowLeft, Upload } from 'lucide-react';
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
  onToggleUploadJob: (jobId: string) => void;
  onProcessReady: () => void;
};

export function UploadScreen({ activeGallery, uploadJobs, workspace, onOpenGallery, onOpenVideoDetail, onAddFiles, onRemoveUploadJob, onToggleUploadJob, onProcessReady }: Props) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
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
          <button className="secondary" onClick={onProcessReady}>Finish processing</button>
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
          const progress = Math.max(4, Math.min(100, Math.round((job.bytesUploaded / job.bytesTotal) * 100)));
          const canOpenVideo = job.status === 'complete' && job.targetType === 'video' && Boolean(job.targetId);
          const statusLabel = job.errorMessage ?? (canOpenVideo ? 'Completed · click to edit' : job.status === 'complete' ? 'Completed' : job.status);
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
            <button onClick={(event) => {
              event.stopPropagation();
              if (job.status === 'complete' || job.status === 'errored') onRemoveUploadJob(job.id);
              else onToggleUploadJob(job.id);
            }}>
              {job.status === 'complete' || job.status === 'errored' ? 'Clear' : job.status === 'paused' ? 'Resume' : 'Pause'}
            </button>
          </div>
          );
        })}
        {galleryJobs.length === 0 && <p className="muted">No active uploads yet.</p>}
      </div>
    </section>
  );
}
