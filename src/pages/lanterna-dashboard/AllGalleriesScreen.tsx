import { useEffect, useRef, useState } from 'react';
import { Archive, ArrowLeft, Eye, Film, HardDrive, ListChecks, PanelLeft, Play, Plus, Search, User, MoreHorizontal, RotateCcw } from 'lucide-react';
import { LanternLogo } from '../../components/LanternLogo';
import { statusMeta, type DashboardGallery, type ProjectName, type Theme, type WorkspaceAccount } from './model';

type Props = {
  archiveTab: 'active' | 'archived';
  folder: ProjectName | null;
  galleries: DashboardGallery[];
  query: string;
  theme: Theme;
  workspace: WorkspaceAccount;
  onArchiveGallery: (id: string) => void;
  onArchiveTabChange: (tab: 'active' | 'archived') => void;
  onBack?: () => void;
  onNewGallery: () => void;
  onOpenGallery: (id: string) => void;
  onQueryChange: (query: string) => void;
  onSignUp?: () => void;
  onThemeChange: (theme: Theme) => void;
};

export function AllGalleriesScreen({
  archiveTab,
  folder,
  galleries,
  query,
  theme,
  workspace,
  onArchiveGallery,
  onArchiveTabChange,
  onBack,
  onNewGallery,
  onOpenGallery,
  onQueryChange,
  onSignUp,
  onThemeChange,
}: Props) {
  const scopedGalleries = folder ? galleries.filter((gallery) => gallery.project === folder) : galleries;
  const totalVideos = scopedGalleries.reduce((sum, gallery) => sum + gallery.videos, 0);
  const totalViews = scopedGalleries.reduce((sum, gallery) => sum + parseGalleryViews(gallery.views), 0);
  const allowanceValue = `${workspace.allowanceUsedGb.toFixed(1)} / ${workspace.allowanceTotalGb.toFixed(0)} GB`;
  const activeCount = scopedGalleries.filter((gallery) => !gallery.archived).length;
  const archivedCount = scopedGalleries.length - activeCount;
  const trimmedQuery = query.trim();
  const visibleGalleries = scopedGalleries.filter((gallery) => {
    if (archiveTab === 'archived' && !gallery.archived) return false;
    if (archiveTab === 'active' && gallery.archived) return false;
    const needle = `${gallery.name} ${gallery.client} ${gallery.date}`.toLowerCase();
    return !trimmedQuery || needle.includes(trimmedQuery.toLowerCase());
  });
  const emptyTitle = emptyStateTitle({ archiveTab, folder, query: trimmedQuery });
  const emptyDescription = emptyStateDescription({ archiveTab, folder, query: trimmedQuery });

  return (
    <section className="page-shell">
      <header className="page-header">
        <div>
          <p>{folder ? 'Filtered project' : 'Studio workspace'}</p>
          <h1>{folder ?? 'All Galleries'}</h1>
        </div>
        <div className="header-actions">
          {onBack && <button className="icon-text" onClick={onBack}><ArrowLeft size={16} /> Back</button>}
          {onSignUp && <button className="icon-text" onClick={onSignUp}><User size={16} /> Sign up</button>}
          <div className="segmented">
            <button className={theme === 'dark' ? 'on' : ''} onClick={() => onThemeChange('dark')}>Dark</button>
            <button className={theme === 'light' ? 'on' : ''} onClick={() => onThemeChange('light')}>Light</button>
          </div>
          <button className="primary" onClick={onNewGallery}><Plus size={17} /> New Gallery</button>
        </div>
      </header>

      <div className="stats-grid">
        <Stat tone="amber" icon={<PanelLeft size={20} />} value={String(scopedGalleries.length)} label="Total galleries" />
        <Stat tone="blue" icon={<Film size={20} />} value={String(totalVideos)} label="Total videos" />
        <Stat tone="green" icon={<Eye size={20} />} value={formatStatNumber(totalViews)} label="Total views" />
        <Stat tone="violet" icon={<HardDrive size={20} />} value={allowanceValue} label="Upload allowance" />
      </div>

      <div className="controls-row">
        <div className="tabs">
          <button className={archiveTab === 'active' ? 'on' : ''} onClick={() => onArchiveTabChange('active')}>Active <span>{activeCount}</span></button>
          <button className={archiveTab === 'archived' ? 'on' : ''} onClick={() => onArchiveTabChange('archived')}>Archived <span>{archivedCount}</span></button>
        </div>
        <div className="search-sort">
          <label><Search size={15} /><input value={query} onChange={(event) => onQueryChange(event.target.value)} placeholder="Search galleries, clients..." /></label>
          <button><ListChecks size={15} /> Last updated</button>
        </div>
      </div>
      <p className="count-label">{visibleGalleries.length} {archiveTab} {visibleGalleries.length === 1 ? 'gallery' : 'galleries'} {folder ? `in ${folder}` : ''}</p>

      {visibleGalleries.length === 0 ? (
        <div className="empty-state">
          <LanternLogo size={48} />
          <h2>{emptyTitle}</h2>
          <p>{emptyDescription}</p>
          {archiveTab === 'active' && !trimmedQuery && <button className="primary" onClick={onNewGallery}><Plus size={17} /> New Gallery</button>}
        </div>
      ) : (
        <div className="gallery-grid">
          {visibleGalleries.map((gallery) => (
            <GalleryCard
              gallery={gallery}
              key={gallery.id}
              onArchiveGallery={onArchiveGallery}
              onOpenGallery={onOpenGallery}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function emptyStateTitle({ archiveTab, folder, query }: { archiveTab: 'active' | 'archived'; folder: ProjectName | null; query: string }) {
  if (query) return 'No matching galleries';
  if (archiveTab === 'archived') return folder ? `No archived ${projectAdjective(folder)} galleries` : 'No archived galleries';
  if (folder) return `No ${projectAdjective(folder)} galleries yet`;
  return 'No galleries yet';
}

function emptyStateDescription({ archiveTab, folder, query }: { archiveTab: 'active' | 'archived'; folder: ProjectName | null; query: string }) {
  if (query) return 'Try a different client name, date, or gallery title.';
  if (archiveTab === 'archived') return 'Archived galleries will appear here when you move them out of the active workspace.';
  if (folder) return `Create a ${projectAdjective(folder)} gallery when you are ready to add films and photos.`;
  return 'Create a client gallery when you are ready to add films and photos.';
}

function projectAdjective(folder: ProjectName) {
  return folder === 'Weddings' ? 'wedding' : folder === 'Engagements' ? 'engagement' : 'portrait';
}

function GalleryCard({
  gallery,
  onArchiveGallery,
  onOpenGallery,
}: {
  gallery: DashboardGallery;
  onArchiveGallery: (id: string) => void;
  onOpenGallery: (id: string) => void;
}) {
  const meta = statusMeta(gallery.status);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return undefined;

    const closeMenu = (event: MouseEvent) => {
      if (menuRef.current?.contains(event.target as Node)) return;
      setMenuOpen(false);
    };

    document.addEventListener('mousedown', closeMenu);
    return () => document.removeEventListener('mousedown', closeMenu);
  }, [menuOpen]);

  const archiveLabel = gallery.archived ? 'Restore gallery' : 'Archive gallery';
  const ArchiveIcon = gallery.archived ? RotateCcw : Archive;

  return (
    <article className="gallery-card">
      <button className="gallery-click" onClick={() => onOpenGallery(gallery.id)}>
        <div className="thumb" style={{ background: gallery.gradient }}>
          <span className="video-pill"><Play size={13} fill="currentColor" /> {gallery.videos} {gallery.videos === 1 ? 'video' : 'videos'}</span>
          <span className={meta.className}>{meta.label}</span>
        </div>
        <div className="card-body">
          <h3>{gallery.name}</h3>
                <p><span>{gallery.date}</span><span><Eye size={14} />{gallery.views}</span></p>
        </div>
      </button>
      <div className="gallery-actions" ref={menuRef}>
        <button
          aria-expanded={menuOpen}
          aria-haspopup="menu"
          aria-label="Gallery actions"
          className="kebab"
          onClick={() => setMenuOpen((open) => !open)}
          type="button"
        >
          <MoreHorizontal size={19} />
        </button>
        {menuOpen && (
          <div className="gallery-action-menu" role="menu">
            <button
              onClick={() => {
                onArchiveGallery(gallery.id);
                setMenuOpen(false);
              }}
              role="menuitem"
              type="button"
            >
              <ArchiveIcon size={15} />
              {archiveLabel}
            </button>
          </div>
        )}
      </div>
    </article>
  );
}

function Stat({ icon, value, label, tone }: { icon: React.ReactNode; value: string; label: string; tone: 'amber' | 'blue' | 'green' | 'violet' }) {
  return <div className={`stat-card stat-${tone}`}><span>{icon}</span><strong>{value}</strong><small>{label}</small></div>;
}

function parseGalleryViews(value: string) {
  const normalized = value.trim().toLowerCase();
  const multiplier = normalized.endsWith('k') ? 1000 : 1;
  const numeric = Number.parseFloat(normalized.replace(/k$/, '').replace(/,/g, ''));
  return Number.isFinite(numeric) ? Math.round(numeric * multiplier) : 0;
}

function formatStatNumber(value: number) {
  if (value >= 1000) return `${(value / 1000).toFixed(value >= 10000 ? 0 : 1)}k`;
  return String(value);
}
