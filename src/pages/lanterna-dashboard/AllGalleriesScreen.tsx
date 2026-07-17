import { useEffect, useRef, useState } from 'react';
import {
  Archive,
  ArrowLeft,
  Check,
  ChevronDown,
  Eye,
  Film,
  HardDrive,
  ListChecks,
  Moon,
  MoreHorizontal,
  PanelLeft,
  Play,
  Plus,
  RotateCcw,
  Search,
  Sun,
  Trash2,
  User,
  X,
} from 'lucide-react';
import { LanternLogo } from '../../components/LanternLogo';
import { getMediaUrls, getStreamPlayback } from './appApi';
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
  onDeleteGallery: (id: string) => Promise<void>;
  onNewGallery: () => void;
  onOpenGallery: (id: string) => void;
  onQueryChange: (query: string) => void;
  onSignUp?: () => void;
  onThemeChange: (theme: Theme) => void;
};

type GallerySort = 'current' | 'created' | 'name' | 'views';

const gallerySortOptions: Array<{ label: string; value: GallerySort }> = [
  { label: 'Gallery order', value: 'current' },
  { label: 'Event date', value: 'created' },
  { label: 'Name A–Z', value: 'name' },
  { label: 'Most viewed', value: 'views' },
];

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
  onDeleteGallery,
  onNewGallery,
  onOpenGallery,
  onQueryChange,
  onSignUp,
  onThemeChange,
}: Props) {
  const [sort, setSort] = useState<GallerySort>('current');
  const [sortOpen, setSortOpen] = useState(false);
  const [deleteCandidate, setDeleteCandidate] = useState<DashboardGallery | null>(null);
  const sortRef = useRef<HTMLDivElement>(null);
  const sortTriggerRef = useRef<HTMLButtonElement>(null);
  const sortOptionRefs = useRef(new Map<GallerySort, HTMLButtonElement>());
  const galleryCoverUrls = useGalleryCoverUrls(galleries);
  const scopedGalleries = folder ? galleries.filter((gallery) => gallery.project === folder) : galleries;
  const totalVideos = scopedGalleries.reduce((sum, gallery) => sum + gallery.videos, 0);
  const totalViews = scopedGalleries.reduce((sum, gallery) => sum + parseGalleryViews(gallery.views), 0);
  const allowanceValue = `${workspace.allowanceUsedGb.toFixed(1)} GB`;
  const activeCount = scopedGalleries.filter((gallery) => !gallery.archived).length;
  const archivedCount = scopedGalleries.length - activeCount;
  const trimmedQuery = query.trim();
  const filteredGalleries = scopedGalleries.filter((gallery) => {
    if (archiveTab === 'archived' && !gallery.archived) return false;
    if (archiveTab === 'active' && gallery.archived) return false;
    const needle = `${gallery.name} ${gallery.client} ${gallery.date}`.toLowerCase();
    return !trimmedQuery || needle.includes(trimmedQuery.toLowerCase());
  });
  const visibleGalleries = sortGalleries(filteredGalleries, sort);
  const sortLabel = gallerySortOptions.find((option) => option.value === sort)?.label ?? gallerySortOptions[0].label;
  const emptyTitle = emptyStateTitle({ archiveTab, folder, query: trimmedQuery });
  const emptyDescription = emptyStateDescription({ archiveTab, folder, query: trimmedQuery });

  useEffect(() => {
    if (!sortOpen) return undefined;

    const closeSort = (event: MouseEvent) => {
      if (sortRef.current?.contains(event.target as Node)) return;
      setSortOpen(false);
    };
    const closeSortWithKeyboard = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      setSortOpen(false);
      sortTriggerRef.current?.focus();
    };
    const frame = window.requestAnimationFrame(() => sortOptionRefs.current.get(sort)?.focus());

    document.addEventListener('mousedown', closeSort);
    document.addEventListener('keydown', closeSortWithKeyboard);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener('mousedown', closeSort);
      document.removeEventListener('keydown', closeSortWithKeyboard);
    };
  }, [sort, sortOpen]);

  const moveSortFocus = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!sortOpen || !['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const options = gallerySortOptions
      .map((option) => sortOptionRefs.current.get(option.value))
      .filter((option): option is HTMLButtonElement => Boolean(option));
    if (!options.length) return;

    const currentIndex = options.indexOf(document.activeElement as HTMLButtonElement);
    if (event.key === 'Home') options[0].focus();
    else if (event.key === 'End') options[options.length - 1].focus();
    else if (event.key === 'ArrowDown') options[(currentIndex + 1 + options.length) % options.length].focus();
    else options[(currentIndex - 1 + options.length) % options.length].focus();
  };

  return (
    <section className="page-shell">
      <header className="page-header">
        <div className="galleries-header-copy">
          <p>{folder ? 'Filtered project' : 'Studio workspace'}</p>
          <h1>{folder ?? 'All Galleries'}</h1>
        </div>
        <div className="header-actions">
          {onBack && <button className="icon-text" onClick={onBack}><ArrowLeft size={16} /> Back</button>}
          {onSignUp && <button className="icon-text" onClick={onSignUp}><User size={16} /> Sign up</button>}
          <div className="segmented galleries-theme-toggle" role="group" aria-label="Dashboard theme">
            <button aria-pressed={theme === 'dark'} className={theme === 'dark' ? 'on' : ''} onClick={() => onThemeChange('dark')}><Moon aria-hidden="true" size={14} /> Dark</button>
            <button aria-pressed={theme === 'light'} className={theme === 'light' ? 'on' : ''} onClick={() => onThemeChange('light')}><Sun aria-hidden="true" size={14} /> Light</button>
          </div>
          <button className="primary" onClick={onNewGallery}><Plus size={17} /> New Gallery</button>
        </div>
      </header>

      <div className="stats-grid">
        <Stat tone="amber" icon={<PanelLeft size={20} />} value={String(scopedGalleries.length)} label="Total galleries" />
        <Stat tone="blue" icon={<Film size={20} />} value={String(totalVideos)} label="Total videos" />
        <Stat tone="green" icon={<Eye size={20} />} value={formatStatNumber(totalViews)} label="Total views" />
        <Stat tone="ice" icon={<HardDrive size={20} />} value={allowanceValue} label="Upload allowance used this period" />
      </div>

      <div className="controls-row">
        <div className="tabs galleries-archive-tabs" role="group" aria-label="Gallery status">
          <button className={archiveTab === 'active' ? 'on' : ''} onClick={() => onArchiveTabChange('active')}>Active <span>{activeCount}</span></button>
          <button className={archiveTab === 'archived' ? 'on' : ''} onClick={() => onArchiveTabChange('archived')}>Archived <span>{archivedCount}</span></button>
        </div>
        <div className="search-sort">
          <div className="galleries-search" role="search">
            <label className="galleries-search-field">
              <Search aria-hidden="true" size={15} />
              <span className="visually-hidden">Search galleries and clients</span>
              <input value={query} onChange={(event) => onQueryChange(event.target.value)} placeholder="Search galleries, clients..." />
            </label>
            {query && (
              <button aria-label="Clear gallery search" className="galleries-search-clear" onClick={() => onQueryChange('')} type="button">
                <X aria-hidden="true" size={14} />
              </button>
            )}
          </div>
          <div
            className="galleries-sort"
            onBlur={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget as Node)) setSortOpen(false);
            }}
            onKeyDown={moveSortFocus}
            ref={sortRef}
          >
            <button
              aria-controls="gallery-sort-menu"
              aria-expanded={sortOpen}
              aria-haspopup="menu"
              className="galleries-sort-trigger"
              onClick={() => setSortOpen((open) => !open)}
              ref={sortTriggerRef}
              type="button"
            >
              <ListChecks aria-hidden="true" size={15} /> {sortLabel} <ChevronDown aria-hidden="true" size={13} />
            </button>
            {sortOpen && (
              <div aria-label="Sort galleries" className="galleries-sort-menu" id="gallery-sort-menu" role="menu">
                {gallerySortOptions.map((option) => (
                  <button
                    aria-checked={sort === option.value}
                    className={`galleries-sort-option ${sort === option.value ? 'is-selected' : ''}`}
                    key={option.value}
                    onClick={() => {
                      setSort(option.value);
                      setSortOpen(false);
                      sortTriggerRef.current?.focus();
                    }}
                    ref={(element) => {
                      if (element) sortOptionRefs.current.set(option.value, element);
                      else sortOptionRefs.current.delete(option.value);
                    }}
                    role="menuitemradio"
                    type="button"
                  >
                    <span>{option.label}</span>
                    {sort === option.value && <Check aria-hidden="true" size={15} />}
                  </button>
                ))}
              </div>
            )}
          </div>
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
              coverUrls={galleryCoverUrls[gallery.id]}
              gallery={gallery}
              key={gallery.id}
              onArchiveGallery={onArchiveGallery}
              onDeleteGallery={setDeleteCandidate}
              onOpenGallery={onOpenGallery}
            />
          ))}
        </div>
      )}
      {deleteCandidate && (
        <PermanentDeleteDialog
          gallery={deleteCandidate}
          onClose={() => setDeleteCandidate(null)}
          onDelete={onDeleteGallery}
        />
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
  coverUrls = [],
  gallery,
  onArchiveGallery,
  onDeleteGallery,
  onOpenGallery,
}: {
  coverUrls?: string[];
  gallery: DashboardGallery;
  onArchiveGallery: (id: string) => void;
  onDeleteGallery: (gallery: DashboardGallery) => void;
  onOpenGallery: (id: string) => void;
}) {
  const meta = statusMeta(gallery.status);
  const [menuOpen, setMenuOpen] = useState(false);
  const [coverIndex, setCoverIndex] = useState(0);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuTriggerRef = useRef<HTMLButtonElement>(null);
  const menuItemRef = useRef<HTMLButtonElement>(null);
  const coverSignature = coverUrls.join('|');
  const coverUrl = coverUrls[coverIndex];

  useEffect(() => {
    setCoverIndex(0);
  }, [coverSignature]);

  useEffect(() => {
    if (!menuOpen) return undefined;

    const closeMenu = (event: MouseEvent) => {
      if (menuRef.current?.contains(event.target as Node)) return;
      setMenuOpen(false);
    };
    const closeMenuWithKeyboard = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      setMenuOpen(false);
      menuTriggerRef.current?.focus();
    };
    const frame = window.requestAnimationFrame(() => menuItemRef.current?.focus());

    document.addEventListener('mousedown', closeMenu);
    document.addEventListener('keydown', closeMenuWithKeyboard);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener('mousedown', closeMenu);
      document.removeEventListener('keydown', closeMenuWithKeyboard);
    };
  }, [menuOpen]);

  const archiveLabel = gallery.archived ? 'Restore gallery' : 'Archive gallery';
  const ArchiveIcon = gallery.archived ? RotateCcw : Archive;

  return (
    <article className="gallery-card">
      <button className="gallery-click" onClick={() => onOpenGallery(gallery.id)}>
        <div className="thumb" style={{ background: gallery.gradient }}>
          {coverUrl && <img alt="" className="gallery-cover-image" key={coverUrl} onError={() => setCoverIndex((index) => index + 1)} src={coverUrl} />}
          <div className="gallery-card-badges">
            <span className="video-pill gallery-video-pill"><Play aria-hidden="true" size={13} fill="currentColor" /> {gallery.videos} {gallery.videos === 1 ? 'video' : 'videos'}</span>
            <span className={`${meta.className} gallery-status-pill`}>{meta.label}</span>
          </div>
        </div>
        <div className="card-body">
          <h3>{gallery.name}</h3>
                <p><span>{gallery.date}</span><span><Eye size={14} />{gallery.views}</span></p>
        </div>
      </button>
      <div
        className="gallery-actions"
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node)) setMenuOpen(false);
        }}
        ref={menuRef}
      >
        <button
          aria-expanded={menuOpen}
          aria-haspopup="menu"
          aria-label="Gallery actions"
          className="kebab"
          onClick={() => setMenuOpen((open) => !open)}
          ref={menuTriggerRef}
          type="button"
        >
          <MoreHorizontal size={19} />
        </button>
        {menuOpen && (
          <div aria-label={`${gallery.name} actions`} className="gallery-action-menu" role="menu">
            <button
              onClick={() => {
                onArchiveGallery(gallery.id);
                setMenuOpen(false);
              }}
              ref={menuItemRef}
              role="menuitem"
              type="button"
            >
              <ArchiveIcon size={15} />
              {archiveLabel}
            </button>
            {gallery.archived && (
              <button
                className="gallery-action-delete"
                onClick={() => {
                  onDeleteGallery(gallery);
                  setMenuOpen(false);
                }}
                role="menuitem"
                type="button"
              >
                <Trash2 aria-hidden="true" size={15} />
                Delete permanently
              </button>
            )}
          </div>
        )}
      </div>
    </article>
  );
}

function PermanentDeleteDialog({
  gallery,
  onClose,
  onDelete,
}: {
  gallery: DashboardGallery;
  onClose: () => void;
  onDelete: (id: string) => Promise<void>;
}) {
  const [confirmation, setConfirmation] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const confirmed = confirmation.trim() === gallery.name;

  useEffect(() => {
    inputRef.current?.focus();
    const closeWithKeyboard = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || deleting) return;
      event.preventDefault();
      onClose();
    };
    document.addEventListener('keydown', closeWithKeyboard);
    return () => document.removeEventListener('keydown', closeWithKeyboard);
  }, [deleting, onClose]);

  return (
    <div className="modal-backdrop" role="presentation">
      <section aria-describedby="permanent-delete-description" aria-labelledby="permanent-delete-title" aria-modal="true" className="modal-card permanent-delete-modal" role="dialog">
        <button aria-label="Cancel permanent deletion" className="modal-close" disabled={deleting} onClick={onClose} type="button"><X aria-hidden="true" size={17} /></button>
        <span className="permanent-delete-icon"><Trash2 aria-hidden="true" size={22} /></span>
        <h2 id="permanent-delete-title">Delete gallery permanently?</h2>
        <p id="permanent-delete-description">“{gallery.name}” will disappear immediately. LANTERNA will permanently delete its uploaded films and photos. This cannot be undone.</p>
        <label htmlFor="permanent-delete-confirmation">Type <strong>{gallery.name}</strong> to confirm</label>
        <input
          autoComplete="off"
          disabled={deleting}
          id="permanent-delete-confirmation"
          onChange={(event) => {
            setConfirmation(event.target.value);
            setError('');
          }}
          ref={inputRef}
          value={confirmation}
        />
        {error && <div aria-live="polite" className="modal-form-error" role="alert">{error}</div>}
        <div className="permanent-delete-actions">
          <button className="secondary" disabled={deleting} onClick={onClose} type="button">Cancel</button>
          <button
            className="danger-primary"
            disabled={!confirmed || deleting}
            onClick={() => {
              setDeleting(true);
              setError('');
              void onDelete(gallery.id).then(onClose).catch(() => {
                setError('The gallery could not be deleted. Try again.');
                setDeleting(false);
              });
            }}
            type="button"
          >
            <Trash2 aria-hidden="true" size={16} />
            {deleting ? 'Deleting…' : 'Delete permanently'}
          </button>
        </div>
      </section>
    </div>
  );
}

function useGalleryCoverUrls(galleries: DashboardGallery[]) {
  const [coverUrls, setCoverUrls] = useState<Record<string, string[]>>({});

  useEffect(() => {
    const candidates = galleries.map(galleryCoverCandidate);
    const r2Keys = candidates.flatMap((candidate) => candidate.r2Keys);
    const streamCandidates = candidates.filter((candidate) => candidate.streamUid);
    if (!r2Keys.length && !streamCandidates.length) {
      setCoverUrls({});
      return undefined;
    }

    let cancelled = false;
    void (async () => {
      const signedR2Urls: Record<string, string> = r2Keys.length
        ? await getMediaUrls(r2Keys).catch(() => ({}))
        : {};
      const streamResults = await Promise.all(streamCandidates.map(async (candidate) => {
        try {
          const playback = await getStreamPlayback(candidate.galleryId, [candidate.streamUid!]);
          return [candidate.galleryId, playback[candidate.streamUid!]?.thumbnailUrl] as const;
        } catch {
          return [candidate.galleryId, undefined] as const;
        }
      }));
      if (cancelled) return;

      const nextUrls: Record<string, string[]> = {};
      candidates.forEach((candidate) => {
        nextUrls[candidate.galleryId] = candidate.r2Keys
          .map((r2Key) => signedR2Urls[r2Key])
          .filter(Boolean);
      });
      streamResults.forEach(([galleryId, thumbnailUrl]) => {
        if (thumbnailUrl) nextUrls[galleryId] = [...(nextUrls[galleryId] ?? []), thumbnailUrl];
      });
      setCoverUrls(nextUrls);
    })();

    return () => {
      cancelled = true;
    };
  }, [galleries]);

  return coverUrls;
}

function galleryCoverCandidate(gallery: DashboardGallery) {
  const backgroundKey = gallery.design.backgroundType === 'image' ? gallery.design.backgroundR2Key : null;
  const firstVideo = gallery.videoItems[0];
  const posterKey = firstVideo?.posterR2Key && !/\.tiff?$/i.test(firstVideo.posterR2Key) ? firstVideo.posterR2Key : null;
  const streamUid = firstVideo?.streamUid && firstVideo.streamReady !== false ? firstVideo.streamUid : null;
  return {
    galleryId: gallery.id,
    r2Keys: [...new Set([backgroundKey, posterKey].filter(Boolean) as string[])],
    streamUid,
  };
}

function Stat({ icon, value, label, tone }: { icon: React.ReactNode; value: string; label: string; tone: 'amber' | 'blue' | 'green' | 'ice' }) {
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

function sortGalleries(galleries: DashboardGallery[], sort: GallerySort) {
  return galleries
    .map((gallery, index) => ({ gallery, index }))
    .sort((left, right) => {
      if (sort === 'created') {
        const dateDifference = parseGalleryDate(right.gallery.date) - parseGalleryDate(left.gallery.date);
        return dateDifference || left.index - right.index;
      }
      if (sort === 'name') {
        return left.gallery.name.localeCompare(right.gallery.name, undefined, { sensitivity: 'base' }) || left.index - right.index;
      }
      if (sort === 'views') {
        return parseGalleryViews(right.gallery.views) - parseGalleryViews(left.gallery.views) || left.index - right.index;
      }
      return left.index - right.index;
    })
    .map(({ gallery }) => gallery);
}

function parseGalleryDate(value: string) {
  if (value.trim().toLowerCase() === 'just now') return Number.MAX_SAFE_INTEGER;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : 0;
}
