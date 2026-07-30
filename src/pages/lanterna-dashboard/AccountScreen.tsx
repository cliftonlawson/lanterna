import { useEffect, useState } from 'react';
import { Archive, ArrowLeft, Banknote, CheckCircle2, CreditCard, ExternalLink, Film, HardDrive, Loader2, Plus, Sparkles, Trash2 } from 'lucide-react';
import { useAuth } from '../../contexts/useAuth';
import { userMessage } from '../../lib/userMessages';
import { BLOCK_PRODUCTS, formatAllowance, formatCatalogMoney, SUBSCRIPTION_TIERS, TOP_UP_PRODUCT, WHITE_LABEL_PRODUCT } from '../../shared/billingCatalog.js';
import { deleteAccountRemote, getConnectStatus, getPlatformBillingStatus, startConnectOnboarding, startPlatformBillingCheckout, startPlatformBillingPortal, type ConnectStatus, type PlatformBillingStatus } from './appApi';
import type { WorkspaceAccount } from './model';

type Props = {
  demo?: boolean;
  refreshAfterCheckout?: boolean;
  workspace: WorkspaceAccount;
  onBack: () => void;
  onSignUp?: () => void;
};

const UNAVAILABLE_CONNECT: ConnectStatus = {
  available: false,
  chargesEnabled: false,
  detailsSubmitted: false,
  payoutsEnabled: false,
  requirementsDue: [],
  sales: { grossCents: 0, lanternaFeeCents: 0, salesCount: 0, studioEarningsCents: 0 },
  state: 'not_connected',
};

export function AccountScreen({ demo = false, refreshAfterCheckout = false, workspace, onBack, onSignUp }: Props) {
  const { signOut } = useAuth();
  const [connect, setConnect] = useState<ConnectStatus | null>(null);
  const [connectError, setConnectError] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [billing, setBilling] = useState<PlatformBillingStatus | null>(null);
  const [billingAction, setBillingAction] = useState('');
  const [billingError, setBillingError] = useState('');
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const [deleteError, setDeleteError] = useState('');
  const [deleting, setDeleting] = useState(false);
  const allowanceTotalGb = billing?.usage.allowanceTotalGb ?? workspace.allowanceTotalGb;
  const allowanceUsedGb = billing?.usage.allowanceUsedGb ?? workspace.allowanceUsedGb;
  const usagePercent = allowanceTotalGb > 0
    ? Math.min(100, Math.round((allowanceUsedGb / allowanceTotalGb) * 100))
    : 0;
  const usageLabel = `${allowanceUsedGb.toFixed(1)} of ${allowanceTotalGb.toFixed(0)} GB used this period`;
  const nearLimit = usagePercent >= 80;

  useEffect(() => {
    if (demo || !workspace.accountId) {
      setConnect(UNAVAILABLE_CONNECT);
      return undefined;
    }
    let mounted = true;
    void getConnectStatus().then((status) => {
      if (mounted) setConnect(status);
    }).catch(() => {
      if (mounted) setConnect(UNAVAILABLE_CONNECT);
    });
    return () => {
      mounted = false;
    };
  }, [demo, workspace.accountId]);

  useEffect(() => {
    if (demo || !workspace.accountId) return undefined;
    let mounted = true;
    let timer: number | undefined;
    let attempts = 0;
    const loadBilling = () => {
      void getPlatformBillingStatus().then((status) => {
        if (!mounted) return;
        setBilling(status);
        attempts += 1;
        if (refreshAfterCheckout && attempts < 4) timer = window.setTimeout(loadBilling, 1500);
      }).catch((error) => {
        if (mounted) setBillingError(error instanceof Error ? error.message : 'Billing could not be loaded.');
      });
    };
    loadBilling();
    return () => {
      mounted = false;
      if (timer) window.clearTimeout(timer);
    };
  }, [demo, refreshAfterCheckout, workspace.accountId]);

  const openCheckout = async (sku: string) => {
    if (demo) {
      onSignUp?.();
      return;
    }
    try {
      setBillingAction(sku);
      setBillingError('');
      const result = await startPlatformBillingCheckout(sku);
      window.location.assign(result.checkoutUrl);
    } catch (error) {
      setBillingError(error instanceof Error ? error.message : 'Checkout could not be opened.');
      setBillingAction('');
    }
  };

  const openBillingPortal = async (action = 'portal') => {
    try {
      setBillingAction(action);
      setBillingError('');
      const result = await startPlatformBillingPortal();
      window.location.assign(result.portalUrl);
    } catch (error) {
      setBillingError(error instanceof Error ? error.message : 'Billing settings could not be opened.');
      setBillingAction('');
    }
  };

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
    } catch (error) {
      setConnectError(userMessage(error, 'Payout setup could not be opened. Try again.'));
      setConnecting(false);
    }
  };

  const deleteAccount = async () => {
    if (deleteConfirmation !== workspace.studioName) {
      setDeleteError(`Type “${workspace.studioName}” exactly to continue.`);
      return;
    }
    try {
      setDeleting(true);
      setDeleteError('');
      await deleteAccountRemote(deleteConfirmation);
      await signOut();
      window.location.assign('https://lanterna.video/?account=deleted');
    } catch (error) {
      setDeleteError(userMessage(error, 'Account deletion could not be completed. Your account is unchanged.'));
      setDeleting(false);
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
            <p>{allowanceTotalGb > 0
              ? `${workspace.studioName} includes ${formatAllowance(allowanceTotalGb)} of upload allowance this period.`
              : `${workspace.studioName} needs a subscription or upload block before files can be added.`}</p>
          </section>

          <section className="account-card account-billing-card">
            <header className="account-card-heading">
              <h2>Plan &amp; billing</h2>
              <span>{billing?.subscription ? capitalize(billing.subscription.plan) : billing?.blockActive ? 'Upload block' : 'No paid plan'}</span>
            </header>
            {!demo && !billing && !billingError && <div className="account-sales-loading"><Loader2 size={17} /> Loading billing</div>}
            {billingError && <p className="account-sales-error">{billingError}</p>}
            {billing?.subscription ? (
              <div className="account-current-plan">
                <div><strong>{capitalize(billing.subscription.plan)}</strong><span>{formatAllowance(billing.usage.allowanceTotalGb)} refreshed annually · white label included</span></div>
                <p>{billing.subscription.status === 'past_due'
                  ? 'Payment needs attention. New uploads are paused until billing is current.'
                  : billing.subscription.cancel_at_period_end
                    ? 'Cancels at the end of the current paid period.'
                    : `${billing.subscription.billing_interval === 'year' ? 'Annual' : 'Monthly'} billing is active.`}</p>
                <div className="account-addon-actions">
                  <button disabled={!billing.canBuyTopup || Boolean(billingAction)} onClick={() => void openCheckout(TOP_UP_PRODUCT.sku)}><Plus size={15} /> Add 5 GB · $5</button>
                  <button className="secondary" disabled={Boolean(billingAction)} onClick={() => void openBillingPortal()}>{billingAction === 'portal' ? <Loader2 size={15} /> : <CreditCard size={15} />} Manage billing</button>
                </div>
              </div>
            ) : billing?.blockActive ? (
              <div className="account-current-plan">
                <div><strong>Annual upload block</strong><span>{formatAllowance(billing.usage.allowanceTotalGb)} available until {formatDate(billing.periodEnd)}</span></div>
                <div className="account-addon-actions">
                  <button disabled={!billing.canBuyTopup || Boolean(billingAction)} onClick={() => void openCheckout(TOP_UP_PRODUCT.sku)}><Plus size={15} /> Add 5 GB · $5</button>
                  <button disabled={!billing.canBuyWhiteLabel || Boolean(billingAction)} onClick={() => void openCheckout(WHITE_LABEL_PRODUCT.sku)}><Sparkles size={15} /> {billing.whiteLabel ? 'White label active' : 'White label · $149/year'}</button>
                </div>
              </div>
            ) : billing ? <p>{billing.usage.allowanceTotalGb > 0
              ? `Your ${formatAllowance(billing.usage.allowanceTotalGb)} welcome allowance is active. Choose a subscription for annual upload room and included white label, or buy a one-time block.`
              : 'Choose a subscription for automatic annual upload room and included white label, or buy a one-time block.'}</p>
              : demo ? <p>Create an account to choose a plan or upload block.</p> : null}

            {billing && (
              <div className="account-plan-comparison">
                <div className="account-plan-comparison-heading">
                  <strong>{billing.subscription ? 'Compare plans' : 'Subscription plans'}</strong>
                  <span>{billing.subscription ? 'Changes are managed securely in Stripe.' : 'White label is included with every plan.'}</span>
                </div>
                <div className="account-plan-options">
                  {SUBSCRIPTION_TIERS.map((tier) => {
                    const currentTier = billing.subscription?.plan === tier.plan;
                    return (
                      <article className={currentTier ? 'is-current' : ''} key={tier.plan}>
                        <div className="account-plan-name">
                          <strong>{tier.name}<small>{formatAllowance(tier.allowanceGb)} annually</small></strong>
                          {currentTier && <span>Current plan</span>}
                        </div>
                        {[tier.monthly, tier.annual].map((price) => {
                          const cadence = price === tier.monthly ? 'month' : 'year';
                          const isCurrent = currentTier && billing.subscription?.billing_interval === cadence;
                          const action = billing.subscription ? `portal-${price.sku}` : price.sku;
                          return (
                            <button
                              aria-current={isCurrent ? 'true' : undefined}
                              className={isCurrent ? 'is-current' : ''}
                              disabled={isCurrent || Boolean(billingAction) || (!billing.subscription && billing.blockActive)}
                              key={price.sku}
                              onClick={() => void (billing.subscription ? openBillingPortal(action) : openCheckout(price.sku))}
                            >
                              {billingAction === action && <Loader2 size={14} />}
                              {isCurrent ? 'Current · ' : billing.subscription ? 'Change · ' : ''}{formatCatalogMoney(price.amountCents)}/{cadence}
                            </button>
                          );
                        })}
                      </article>
                    );
                  })}
                </div>
                {billing.blockActive && <p className="account-plan-note">Your upload block stays active through {formatDate(billing.periodEnd)}. A subscription can begin after it expires.</p>}
              </div>
            )}

            {billing && !billing.subscription && !billing.blockActive && (
              <div className="account-block-section">
                <strong>Prefer no subscription?</strong>
                <span>Buy a one-time annual upload block. White label is available separately.</span>
                <div className="account-block-options">
                  {BLOCK_PRODUCTS.map((block) => (
                    <button disabled={Boolean(billingAction)} key={block.sku} onClick={() => void openCheckout(block.sku)}>{block.name} · {formatCatalogMoney(block.amountCents)}</button>
                  ))}
                </div>
              </div>
            )}
          </section>

          <section className="account-card">
            <h2>Workspace owner</h2>
            <div className="account-team-member">
              <b>{workspace.userName.slice(0, 1).toUpperCase()}</b>
              <span><strong>{workspace.userName}</strong><small>Owner · {workspace.userEmail}</small></span>
            </div>
          </section>

          <section className="account-card account-sales-card">
            <header className="account-card-heading">
              <h2>Film sales</h2>
              <span className={`account-sales-state is-${connect ? connect.available !== true ? 'unavailable' : connect.state : 'loading'}`}>{connectStateLabel(connect)}</span>
            </header>
            {!connect && !connectError && <div className="account-sales-loading"><Loader2 size={17} /> Loading film sales</div>}
            {connectError && <p className="account-sales-error">{connectError}</p>}
            {connect && connect.available !== true ? (
              <div className="account-sales-unavailable-banner">
                <span>Unavailable</span>
                <div><strong>Film sales are temporarily paused.</strong><p>Gallery delivery remains available.</p></div>
              </div>
            ) : connect?.state === 'active' ? (
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

          {!demo && <section className="account-card account-danger-card">
            <h2>Delete account</h2>
            <p>Permanently remove this workspace, its galleries, and stored media. This cannot be undone.</p>
            {!deleteOpen ? (
              <button className="account-danger-button" onClick={() => setDeleteOpen(true)} type="button"><Trash2 size={15} /> Delete account</button>
            ) : (
              <div className="account-danger-confirm">
                <label><span>Type <strong>{workspace.studioName}</strong> to confirm</span><input autoComplete="off" onChange={(event) => setDeleteConfirmation(event.target.value)} value={deleteConfirmation} /></label>
                {deleteError && <p role="alert">{deleteError}</p>}
                <div><button className="secondary" disabled={deleting} onClick={() => { setDeleteOpen(false); setDeleteConfirmation(''); setDeleteError(''); }} type="button">Cancel</button><button className="account-danger-button" disabled={deleting || deleteConfirmation !== workspace.studioName} onClick={() => void deleteAccount()} type="button">{deleting ? <><Loader2 size={15} /> Deleting</> : <><Trash2 size={15} /> Permanently delete</>}</button></div>
              </div>
            )}
          </section>}
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
            <div className="account-storage-legend"><span>{allowanceUsedGb.toFixed(1)} GB used</span><span>{allowanceTotalGb.toFixed(0)} GB period allowance</span></div>
            <div className={nearLimit ? 'account-storage-note is-warning' : 'account-storage-note'}>
              <CheckCircle2 size={16} />
              <span>{allowanceTotalGb <= 0 ? 'Choose a plan or upload block to start adding files.' : nearLimit ? 'Your upload allowance is nearing its limit.' : 'You have upload room for your next delivery.'}</span>
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
  if (!connect.available) return 'Unavailable';
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

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function formatDate(value: string | null) {
  if (!value) return 'the end of the paid period';
  return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' }).format(new Date(value));
}
