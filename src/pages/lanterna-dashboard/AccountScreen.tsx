import { useEffect, useState } from 'react';
import { Archive, ArrowLeft, Banknote, CheckCircle2, ExternalLink, Film, HardDrive, Loader2 } from 'lucide-react';
import { getConnectStatus, startConnectOnboarding, type ConnectStatus } from './appApi';
import type { WorkspaceAccount } from './model';

type Props = {
  demo?: boolean;
  workspace: WorkspaceAccount;
  onBack: () => void;
  onSignUp?: () => void;
};

export function AccountScreen({ demo = false, workspace, onBack, onSignUp }: Props) {
  const [connect, setConnect] = useState<ConnectStatus | null>(null);
  const [connectError, setConnectError] = useState('');
  const [connecting, setConnecting] = useState(false);
  const usagePercent = workspace.allowanceTotalGb > 0
    ? Math.min(100, Math.round((workspace.allowanceUsedGb / workspace.allowanceTotalGb) * 100))
    : 0;
  const usageLabel = `${workspace.allowanceUsedGb.toFixed(1)} of ${workspace.allowanceTotalGb.toFixed(0)} GB used this period`;
  const nearLimit = usagePercent >= 80;

  useEffect(() => {
    if (demo || !workspace.accountId) {
      setConnect({
        chargesEnabled: false,
        detailsSubmitted: false,
        payoutsEnabled: false,
        requirementsDue: [],
        sales: { grossCents: 0, lanternaFeeCents: 0, salesCount: 0, studioEarningsCents: 0 },
        state: 'not_connected',
      });
      return undefined;
    }
    let mounted = true;
    void getConnectStatus().then((status) => {
      if (mounted) setConnect(status);
    }).catch(() => {
      if (mounted) setConnectError('Film sales status could not be loaded.');
    });
    return () => {
      mounted = false;
    };
  }, [demo, workspace.accountId]);

  const openPayoutSetup = async () => {
    if (demo) {
      onSignUp?.();
      return;
    }
    try {
      setConnecting(true);
      setConnectError('');
      const result = await startConnectOnboarding();
      window.location.assign(result.onboardingUrl);
    } catch {
      setConnectError('Payout setup could not be opened. Try again.');
      setConnecting(false);
    }
  };

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

          <section className="account-card account-sales-card">
            <header className="account-card-heading">
              <h2>Film sales</h2>
              <span className={`account-sales-state is-${connect?.state ?? 'loading'}`}>{connectStateLabel(connect)}</span>
            </header>
            {!connect && !connectError && <div className="account-sales-loading"><Loader2 size={17} /> Loading film sales</div>}
            {connectError && <p className="account-sales-error">{connectError}</p>}
            {connect?.state === 'active' ? (
              <>
                <p>Your studio is ready to sell paid films. LANTERNA keeps 10%; Stripe deducts its processing fee separately.</p>
                <div className="account-sales-totals">
                  <span><small>Studio share before Stripe fees</small><strong>{money(connect.sales.studioEarningsCents)}</strong></span>
                  <span><small>Completed sales</small><strong>{connect.sales.salesCount}</strong></span>
                  <span><small>Gross sales</small><strong>{money(connect.sales.grossCents)}</strong></span>
                </div>
                <a className="account-sales-link" href="https://dashboard.stripe.com/" rel="noreferrer" target="_blank">
                  Manage payouts <ExternalLink size={14} />
                </a>
              </>
            ) : connect ? (
              <>
                <p>{connect.state === 'not_connected'
                  ? demo
                    ? 'Create your account to connect payouts and offer paid films.'
                    : 'Connect a payout account before offering paid films. Stripe verifies your business and sends earnings directly to your studio.'
                  : connect.state === 'restricted'
                    ? 'Your payout account needs more information before film sales can continue.'
                    : 'Your payout setup is underway. Continue if Stripe still needs information from you.'}</p>
                <button className="primary account-sales-action" disabled={connecting} onClick={() => void openPayoutSetup()}>
                  {connecting ? <><Loader2 size={16} /> Opening setup</> : <><Banknote size={16} /> {demo ? 'Create account' : connect.state === 'not_connected' ? 'Set up payouts' : 'Continue setup'}</>}
                </button>
              </>
            ) : null}
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

function connectStateLabel(connect: ConnectStatus | null) {
  if (!connect) return 'Checking';
  if (connect.state === 'active') return 'Ready';
  if (connect.state === 'restricted') return 'Action needed';
  if (connect.state === 'pending') return 'In progress';
  return 'Not connected';
}

function money(cents: number) {
  return new Intl.NumberFormat('en-US', { currency: 'USD', style: 'currency' }).format(cents / 100);
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
