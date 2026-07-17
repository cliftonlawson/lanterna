import { ChevronRight, Grid2X2, SlidersHorizontal } from 'lucide-react';
import { LanternLogo } from '../../components/LanternLogo';
import { navClass, projectNames, type DashboardGallery, type ProjectName, type Theme, type View, type WorkspaceAccount } from './model';

type Props = {
  children: React.ReactNode;
  galleries: DashboardGallery[];
  workspace: WorkspaceAccount;
  theme: Theme;
  view: View;
  folder: ProjectName | null;
  onFolderChange: (folder: ProjectName | null) => void;
  onViewChange: (view: View) => void;
};

export function AppShell({
  children,
  galleries,
  workspace,
  theme,
  view,
  folder,
  onFolderChange,
  onViewChange,
}: Props) {
  const openGalleries = (project: ProjectName | null) => {
    onViewChange('galleries');
    onFolderChange(project);
  };

  return (
    <div className={`lanterna-app ${theme}`}>
      <aside className="ld-sidebar">
        <button aria-label="Open all galleries" className="brand-block" onClick={() => openGalleries(null)}>
          <LanternLogo size={42} />
          <span>
            <strong>LANTERNA</strong>
            <small>{workspace.studioName}</small>
          </span>
        </button>

        <button className={navClass(view === 'galleries' && !folder)} onClick={() => openGalleries(null)}>
          <Grid2X2 size={18} /> <span>All Galleries</span> <em>{galleries.length}</em>
        </button>

        <div className="nav-label">Projects</div>
        {projectNames.map((name) => (
          <button key={name} className={navClass(view === 'galleries' && folder === name)} onClick={() => openGalleries(name)}>
            <i className={`project-dot project-${name.toLowerCase()}`} /> <span>{name}</span> <em>{galleries.filter((gallery) => gallery.project === name).length}</em>
          </button>
        ))}

        <div className="sidebar-rule" />
        <button className={navClass(view === 'vendor')} onClick={() => onViewChange('vendor')}>
          <SlidersHorizontal size={18} /> <span>Vendor Dashboard</span>
        </button>
        <div className="sidebar-spacer" />
        <button aria-label={`Open account settings for ${workspace.userName}`} className="user-card" onClick={() => onViewChange('account')}>
          <b>{workspace.userName.slice(0, 1).toUpperCase()}</b>
          <span><strong>{workspace.userName}</strong><small>{workspace.userEmail}</small></span>
          <ChevronRight size={16} />
        </button>
      </aside>

      <main className="ld-main">{children}</main>
    </div>
  );
}
