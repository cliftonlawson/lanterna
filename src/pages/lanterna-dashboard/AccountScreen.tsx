import { Archive, ArrowLeft, CheckCircle2, Film, HardDrive } from 'lucide-react';
import type { WorkspaceAccount } from './model';

type Props = {
  workspace: WorkspaceAccount;
  onBack: () => void;
};

export function AccountScreen({ workspace, onBack }: Props) {
  const usagePercent = workspace.allowanceTotalGb > 0
    ? Math.min(100, Math.round((workspace.allowanceUsedGb / workspace.allowanceTotalGb) * 100))
    : 0;
  const usageLabel = `${workspace.allowanceUsedGb.toFixed(1)} of ${workspace.allowanceTotalGb.toFixed(0)} GB used this period`;
  const nearLimit = usagePercent >= 80;

  return (
    <section className="page-shell account-page">
      <header className="account-header">
        <button className="icon-text" onClick={onBack}><ArrowLeft size={16} /> All galleries</button>
        <div><p>Your account</p><h1>Account &amp; billing</h1></div>
      </header>

      <div className="account-layout">
        <div className="account-primary-column">
          <section className="account-card account-profile-card">
            <h2>Profile</h2>
            <div>
              <b>{workspace.userName.slice(0, 1).toUpperCase()}</b>
              <span><strong>{workspace.userName}</strong><small>{workspace.userEmail} · Owner</small></span>
            </div>
          </section>

          <section className="account-card">
            <header className="account-card-heading"><h2>Workspace</h2><span>Owner</span></header>
            <p>{workspace.studioName} includes {workspace.allowanceTotalGb.toFixed(0)} GB of upload allowance per period.</p>
          </section>

          <section className="account-card">
            <h2>Team</h2>
            <div className="account-team-member">
              <b>{workspace.userName.slice(0, 1).toUpperCase()}</b>
              <span><strong>{workspace.userName}</strong><small>Owner · {workspace.userEmail}</small></span>
            </div>
          </section>
        </div>

        <aside className="account-secondary-column">
          <section className="account-card account-storage-card">
            <h2>Upload allowance</h2>
            <p>{usageLabel}</p>
            <div
              aria-label="Upload allowance used this period"
              aria-valuemax={100}
              aria-valuemin={0}
              aria-valuenow={usagePercent}
              aria-valuetext={usageLabel}
              className="account-storage-track"
              role="progressbar"
            ><i className={nearLimit ? 'near-limit' : ''} style={{ width: `${usagePercent}%` }} /></div>
            <div className="account-storage-legend"><span>{workspace.allowanceUsedGb.toFixed(1)} GB used</span><span>{workspace.allowanceTotalGb.toFixed(0)} GB period allowance</span></div>
            <div className={nearLimit ? 'account-storage-note is-warning' : 'account-storage-note'}>
              <CheckCircle2 size={16} />
              <span>{nearLimit ? 'Your upload allowance is nearing its limit.' : 'You have upload room for your next delivery.'}</span>
            </div>
          </section>

          <section className="account-card account-breakdown-card">
            <h2>Storage breakdown</h2>
            <div><HardDrive size={16} /><span>Active originals</span><strong>{formatBytes(workspace.hotBytesStored)}</strong></div>
            <div><Archive size={16} /><span>Archive</span><strong>{formatBytes(workspace.coldBytesStored)}</strong></div>
            <div><Film size={16} /><span>Ready-to-play video</span><strong>{formatMinutes(workspace.streamMinutesStored)}</strong></div>
          </section>
        </aside>
      </div>
    </section>
  );
}

function formatBytes(bytes: number) {
  if (!bytes) return '0 GB';
  const gb = bytes / 1_000_000_000;
  return gb >= 0.1 ? `${gb.toFixed(1)} GB` : `${Math.round(bytes / 1_000_000)} MB`;
}

function formatMinutes(minutes: number) {
  if (!minutes) return '0 min';
  if (minutes < 60) return `${Math.round(minutes)} min`;
  return `${(minutes / 60).toFixed(1)} hr`;
}
