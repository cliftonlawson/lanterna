import { Panel } from './shared';
import type { WorkspaceAccount } from './model';

type Props = {
  workspace: WorkspaceAccount;
};

export function AccountScreen({ workspace }: Props) {
  const usagePercent = workspace.allowanceTotalGb > 0
    ? Math.min(100, Math.round((workspace.allowanceUsedGb / workspace.allowanceTotalGb) * 100))
    : 0;
  const usageLabel = `${workspace.allowanceUsedGb.toFixed(1)} / ${workspace.allowanceTotalGb.toFixed(0)} GB upload allowance used this period`;

  return (
    <section className="page-shell">
      <header className="page-header">
        <div>
          <p>Profile, billing, storage</p>
          <h1>Account</h1>
        </div>
      </header>

      <div className="settings-stack">
        <Panel title="Plan & billing">
          <div className="usage-bar">
            <span><b style={{ width: `${usagePercent}%` }} /></span>
            <p>{usageLabel}</p>
          </div>
        </Panel>

        <Panel title="Team">
          <div className="recipient">
            <span>{workspace.userName}<small>Owner · {workspace.userEmail}</small></span>
          </div>
        </Panel>
      </div>
    </section>
  );
}
