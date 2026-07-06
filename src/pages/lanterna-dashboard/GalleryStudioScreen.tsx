import {
  ArrowLeft,
  AlertTriangle,
  Check,
  ChevronDown,
  Clock,
  Copy,
  Film,
  Image,
  Layout,
  Link2,
  Lock,
  Monitor,
  MoreHorizontal,
  Music,
  Palette,
  Play,
  Plus,
  Send,
  Settings,
  Type,
  Upload,
  X,
} from 'lucide-react';
import type { KeyboardEvent } from 'react';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { LanternLogo } from '../../components/LanternLogo';
import { getMediaUrls } from './appApi';
import { invalidRecipientEmails } from './delivery';
import {
  FONT_OPTIONS,
  clampFontWeight,
  fontFamilyStack,
  fontOptionFor,
  galleryFontSettings,
  googleFontsHref,
} from './fonts';
import { displayDomain, publicGalleryDisplayUrl, publicGalleryUrl } from './publicLinks';
import {
  mediaTileGradients,
  statusMeta,
  subNavClass,
  type DashboardGallery,
  type GalleryDesign,
  type StudioTab,
  type WorkspaceAccount,
} from './model';
import { Panel, Toggle } from './shared';

const galleryLayoutOptions: Array<{ name: string; meta: string; variant: GalleryDesign['layout'] }> = [
  { name: 'Lumen', meta: 'Left title, striped hero, tidy film row', variant: 'lumen' },
  { name: 'Diptych', meta: 'Tall feature beside an elegant film list', variant: 'diptych' },
  { name: 'Meridian', meta: 'Centered title over a symmetric film grid', variant: 'meridian' },
  { name: 'Grove', meta: 'Framed player above a labelled filmstrip', variant: 'grove' },
  { name: 'Atelier', meta: 'Magazine spread with asymmetric film blocks', variant: 'atelier' },
  { name: 'Reel', meta: 'Feature player with a vertical social rail', variant: 'reel' },
  { name: 'Overture', meta: 'Cinema one-sheet with credits and chapters', variant: 'overture' },
  { name: 'Passage', meta: 'Timeline of the day, chapter by chapter', variant: 'passage' },
  { name: 'Salon', meta: 'Curated gallery wall of framed films', variant: 'salon' },
];

type Props = {
  activeGallery: DashboardGallery;
  selectedPhotos: string[];
  studioTab: StudioTab;
  workspace: WorkspaceAccount;
  onBackToGalleries: () => void;
  onDesignChange: (patch: Partial<GalleryDesign>) => void;
  onGalleryChange: (patch: Partial<DashboardGallery>) => void;
  onBackgroundUpload: (file: File) => void;
  onOpenUpload: () => void;
  onSelectedPhotosChange: (selected: string[]) => void;
  onSendDelivery: () => void;
  onShowToast: (message: string) => void;
  onStudioTabChange: (tab: StudioTab) => void;
  onVideoDetailOpen: (videoId: string) => void;
};

export function GalleryStudioScreen({
  activeGallery,
  selectedPhotos,
  studioTab,
  workspace,
  onBackToGalleries,
  onDesignChange,
  onGalleryChange,
  onBackgroundUpload,
  onOpenUpload,
  onSelectedPhotosChange,
  onSendDelivery,
  onShowToast,
  onStudioTabChange,
  onVideoDetailOpen,
}: Props) {
  const canDeliver = activeGallery.videos > 0;
  const invalidRecipients = invalidRecipientEmails(activeGallery.deliveryDraft.recipients);
  const preflight = [
    {
      ok: activeGallery.access !== 'Password' || activeGallery.passwordSet,
      label: activeGallery.access === 'Password' ? (activeGallery.passwordSet ? 'Password is set' : 'Set gallery password') : 'Access is set',
    },
    { ok: activeGallery.videos > 0, label: activeGallery.videos > 0 ? `${activeGallery.videos} films added` : 'Add at least one film' },
    { ok: activeGallery.coverChosen, label: activeGallery.coverChosen ? 'Cover selected' : 'Choose a cover' },
    { ok: activeGallery.deliveryDraft.recipients.trim().length > 0, label: activeGallery.deliveryDraft.recipients.trim() ? 'Recipients added' : 'Add recipients' },
    { ok: invalidRecipients.length === 0, label: invalidRecipients.length ? `Fix ${invalidRecipients[0]}` : 'Recipient emails valid' },
  ];

  return (
    <section>
      <header className="studio-header">
        <div className="crumb">
          <button onClick={onBackToGalleries}><ArrowLeft size={16} /> Back</button>
          <span className="crumb-mark"><LanternLogo size={22} /></span>
          <span>Galleries</span><em>/</em>
          <strong>{activeGallery.name}</strong>
          <span className={statusMeta(activeGallery.status).className}>{statusMeta(activeGallery.status).label}</span>
        </div>
        <div className="header-actions">
          {studioTab === 'videos' && <button className="secondary" onClick={onOpenUpload}><Plus size={16} /> Add Video</button>}
          {studioTab === 'photos' && <button className="secondary" onClick={onOpenUpload}><Plus size={16} /> Add Photos</button>}
          <button className="primary studio-deliver-cta" disabled={!canDeliver} onClick={() => onStudioTabChange('deliver')} title={canDeliver ? 'Open delivery preflight' : 'Add at least one film to deliver'}>
            <Send size={16} /> Deliver
          </button>
        </div>
      </header>

      <div className="studio-layout">
        <StudioNav activeGallery={activeGallery} studioTab={studioTab} onStudioTabChange={onStudioTabChange} />

        <div className="studio-content">
          {studioTab === 'videos' && (
            <VideosTab activeGallery={activeGallery} onOpenUpload={onOpenUpload} onVideoDetailOpen={onVideoDetailOpen} />
          )}

          {studioTab === 'photos' && (
            <PhotosTab
              activeGallery={activeGallery}
              selectedPhotos={selectedPhotos}
              onGalleryChange={onGalleryChange}
              onOpenUpload={onOpenUpload}
              onSelectedPhotosChange={onSelectedPhotosChange}
              onShowToast={onShowToast}
            />
          )}

          {(['layout', 'heading', 'background', 'music', 'styles'] as StudioTab[]).includes(studioTab) && (
            <div className="design-grid">
              <DesignPanel
                activeGallery={activeGallery}
                design={activeGallery.design}
                tab={studioTab}
                workspace={workspace}
                onBackgroundUpload={onBackgroundUpload}
                onDesignChange={onDesignChange}
              />
              <LivePreview gallery={activeGallery} workspace={workspace} mobile={studioTab === 'layout'} />
            </div>
          )}

          {studioTab === 'settings' && (
            <SettingsTab activeGallery={activeGallery} workspace={workspace} onGalleryChange={onGalleryChange} />
          )}

          {studioTab === 'deliver' && (
            <DeliverTab
              activeGallery={activeGallery}
              preflight={preflight}
              workspace={workspace}
              onGalleryChange={onGalleryChange}
              onSendDelivery={onSendDelivery}
              onShowToast={onShowToast}
            />
          )}
        </div>
      </div>
    </section>
  );
}

function StudioNav({
  activeGallery,
  studioTab,
  onStudioTabChange,
}: {
  activeGallery: DashboardGallery;
  studioTab: StudioTab;
  onStudioTabChange: (tab: StudioTab) => void;
}) {
  return (
    <nav className="studio-sidebar">
      <small>Upload</small>
      <button className={subNavClass(studioTab === 'videos')} onClick={() => onStudioTabChange('videos')}><Film size={17} /> Videos <em>{activeGallery.videos}</em></button>
      <button className={subNavClass(studioTab === 'photos')} onClick={() => onStudioTabChange('photos')}><Image size={17} /> Photos <em>{activeGallery.photos}</em></button>
      <small>Design</small>
      <button className={subNavClass(studioTab === 'layout')} onClick={() => onStudioTabChange('layout')}><Layout size={17} /> Layout</button>
      <button className={subNavClass(studioTab === 'heading')} onClick={() => onStudioTabChange('heading')}><Type size={17} /> Heading</button>
      <button className={subNavClass(studioTab === 'background')} onClick={() => onStudioTabChange('background')}><Image size={17} /> Background</button>
      <button className={subNavClass(studioTab === 'music')} onClick={() => onStudioTabChange('music')}><Music size={17} /> Music</button>
      <button className={subNavClass(studioTab === 'styles')} onClick={() => onStudioTabChange('styles')}><Palette size={17} /> Styles</button>
      <small>Publish</small>
      <button className={subNavClass(studioTab === 'settings')} onClick={() => onStudioTabChange('settings')}><Settings size={17} /> Settings</button>
      <button className={`${subNavClass(studioTab === 'deliver')} ${activeGallery.videos === 0 ? 'has-warning' : ''}`} onClick={() => onStudioTabChange('deliver')}><Send size={17} /> Deliver</button>
    </nav>
  );
}

function VideosTab({
  activeGallery,
  onOpenUpload,
  onVideoDetailOpen,
}: {
  activeGallery: DashboardGallery;
  onOpenUpload: () => void;
  onVideoDetailOpen: (videoId: string) => void;
}) {
  const posterUrls = useMediaUrls(activeGallery.videoItems.map((video) => video.posterR2Key).filter(Boolean) as string[]);

  return (
    <>
      <div className="studio-section-head">
        <div>
          <p>Upload</p>
          <h2>Videos</h2>
        </div>
        <span>{activeGallery.videos} {activeGallery.videos === 1 ? 'film' : 'films'} in this gallery</span>
      </div>
      {activeGallery.videos === 0 ? (
        <div className="studio-empty">
          <LanternLogo size={48} />
          <strong>No films yet</strong>
          <span>Upload at least one film before publishing or sending this gallery.</span>
          <button className="primary" onClick={onOpenUpload}><Upload size={16} /> Add first film</button>
        </div>
      ) : (
        <div className="video-grid">
          {activeGallery.videoItems.map((video) => {
            const posterUrl = video.posterR2Key ? posterUrls[video.posterR2Key] : '';
            const isPendingVideo = video.processingStatus === 'uploading' || video.processingStatus === 'processing';
            const statusLabel = videoStatusLabel(video.processingStatus);
            return (
              <article className={`video-card ${isPendingVideo ? 'is-processing' : ''}`} key={video.id}>
                <button onClick={() => onVideoDetailOpen(video.id)}>
                  <div
                    className={`thumb ${posterUrl ? 'has-poster' : ''}`}
                    style={{
                      background: posterUrl
                        ? `linear-gradient(180deg,rgba(8,6,12,.04),rgba(8,6,12,.34)), url("${posterUrl}") center / cover`
                        : video.gradient,
                    }}
                  >
                  {video.paidUnlockEnabled && <span className="paid-tile-chip"><Lock size={12} /> ${Math.round((video.paidUnlockPriceCents ?? 30000) / 100)}</span>}
                  <span className="play-round"><Play size={18} fill="currentColor" /></span>
                  <em>{video.duration}</em>
                  {isPendingVideo && (
                    <div className="video-processing-chip">
                      <Clock size={13} />
                      <span>{statusLabel}</span>
                    </div>
                  )}
                  </div>
                  <h3>{video.title}</h3>
                  <p><span><Clock size={13} /> {video.updatedAt}</span><span className={`video-status-text status-${video.processingStatus}`}>{statusLabel}</span></p>
                </button>
                <button aria-label="Video actions" onClick={() => onVideoDetailOpen(video.id)}><MoreHorizontal size={18} /></button>
              </article>
            );
          })}
        </div>
      )}
    </>
  );
}

function videoStatusLabel(status: DashboardGallery['videoItems'][number]['processingStatus']) {
  if (status === 'uploading') return 'Uploading replacement';
  if (status === 'processing') return 'Encoding replacement';
  if (status === 'errored') return 'Needs attention';
  return 'Ready';
}

function PhotosTab({
  activeGallery,
  selectedPhotos,
  onGalleryChange,
  onOpenUpload,
  onSelectedPhotosChange,
  onShowToast,
}: {
  activeGallery: DashboardGallery;
  selectedPhotos: string[];
  onGalleryChange: (patch: Partial<DashboardGallery>) => void;
  onOpenUpload: () => void;
  onSelectedPhotosChange: (selected: string[]) => void;
  onShowToast: (message: string) => void;
}) {
  const mediaUrls = useMediaUrls(activeGallery.photoItems.map((photo) => photo.r2Key).filter(Boolean) as string[]);
  const createAlbum = () => {
    const album = {
      id: `${activeGallery.id}-album-${Date.now()}`,
      name: `Album ${activeGallery.albums.length + 1}`,
      photoIds: [],
    };
    onGalleryChange({ albums: [...activeGallery.albums, album] });
    onShowToast('Album created');
  };

  const moveSelectedPhotos = () => {
    if (!selectedPhotos.length) return;
    const targetAlbum = activeGallery.albums[activeGallery.albums.length - 1] ?? {
      id: `${activeGallery.id}-album-selection`,
      name: 'Selection',
      photoIds: [],
    };
    const albums = activeGallery.albums.some((album) => album.id === targetAlbum.id)
      ? activeGallery.albums
      : [...activeGallery.albums, targetAlbum];
    const selectedSet = new Set(selectedPhotos);
    const nextPhotoItems = activeGallery.photoItems.map((photo) => selectedSet.has(photo.id) ? { ...photo, albumId: targetAlbum.id } : photo);
    const nextAlbums = albums.map((album) => ({
      ...album,
      photoIds: nextPhotoItems.filter((photo) => photo.albumId === album.id).map((photo) => photo.id),
    }));

    onGalleryChange({ albums: nextAlbums, photoItems: nextPhotoItems });
    onSelectedPhotosChange([]);
    onShowToast(`Moved ${selectedPhotos.length} ${selectedPhotos.length === 1 ? 'photo' : 'photos'} to ${targetAlbum.name}`);
  };

  return (
    <div>
      <div className="notice"><Image size={17} /> Films & photos live in this one gallery — one client link, one delivery record.</div>
      <div className="chip-row">
        <button>All <span>{activeGallery.photoItems.length}</span></button>
        {activeGallery.albums.map((album) => <button key={album.id}>{album.name} <span>{album.photoIds.length}</span></button>)}
        <button className="dashed" onClick={createAlbum}><Plus size={14} /> New album</button>
        <button className="select-mode" onClick={() => onSelectedPhotosChange(selectedPhotos.length ? [] : activeGallery.photoItems.slice(0, 2).map((photo) => photo.id))}><Check size={14} /> {selectedPhotos.length ? 'Cancel' : 'Select'}</button>
      </div>
      <div className={`masonry ${selectedPhotos.length ? 'is-selecting' : ''}`}>
        <button className="add-photo" onClick={onOpenUpload}><Upload size={22} /> Add photos</button>
        {activeGallery.photoItems.map((photo, index) => (
          <button
            key={photo.id}
            className={selectedPhotos.includes(photo.id) ? 'photo-tile selected' : 'photo-tile'}
            style={{
              background: photo.r2Key && mediaUrls[photo.r2Key] ? '#0c0a12' : photo.gradient,
              aspectRatio: photo.aspectRatio,
            }}
            onClick={() => {
              if (!selectedPhotos.length) return;
              const key = photo.id;
              onSelectedPhotosChange(selectedPhotos.includes(key) ? selectedPhotos.filter((photo) => photo !== key) : [...selectedPhotos, key]);
            }}
            aria-label={`Photo ${index + 1}`}
          >
            {photo.r2Key && mediaUrls[photo.r2Key] && <img src={mediaUrls[photo.r2Key]} alt="" />}
            <span className="photo-check">{selectedPhotos.includes(photo.id) && <Check size={14} />}</span>
          </button>
        ))}
      </div>
      {selectedPhotos.length > 0 && (
        <div className="floating-bar">
          <strong>{selectedPhotos.length} selected</strong>
          <button onClick={moveSelectedPhotos}><span>Move to</span><ChevronDown size={15} /></button>
          <button className="bar-ghost" onClick={() => onSelectedPhotosChange([])}>Cancel</button>
        </div>
      )}
    </div>
  );
}

function DesignPanel({
  activeGallery,
  design,
  tab,
  workspace,
  onBackgroundUpload,
  onDesignChange,
}: {
  activeGallery: DashboardGallery;
  design: GalleryDesign;
  tab: StudioTab;
  workspace: WorkspaceAccount;
  onBackgroundUpload: (file: File) => void;
  onDesignChange: (patch: Partial<GalleryDesign>) => void;
}) {
  const backgroundInputRef = useRef<HTMLInputElement | null>(null);
  const [layoutBrowserOpen, setLayoutBrowserOpen] = useState(false);
  const [draftLayout, setDraftLayout] = useState<GalleryDesign['layout']>(design.layout);
  const titles: Record<string, { title: string; kicker: string }> = {
    layout: { title: 'Layout', kicker: 'How films are arranged on the client page.' },
    heading: { title: 'Heading', kicker: 'What clients read at the top of the gallery.' },
    background: { title: 'Background media', kicker: 'Use a still image or motion clip as the gallery entrance.' },
    music: { title: 'Music and featured film', kicker: 'Upload your own track and choose the film the gallery leads with.' },
    styles: { title: 'Client styling', kicker: 'Theme, accent, typography, and top-button visibility.' },
  };
  const accentPresets = ['#FFB24D', '#FF7A2F', '#C9A86A', '#7BC47F', '#7AA7E8'];
  const currentLayout = galleryLayoutOptions.find((item) => item.variant === design.layout) ?? galleryLayoutOptions[0];

  return (
    <Panel title={titles[tab]?.title ?? 'Design'}>
      <p className="design-panel-intro">{titles[tab]?.kicker}</p>

      {tab === 'layout' && (
        <>
          <section className="current-layout-card">
            <div className="current-layout-copy">
              <span>Current layout</span>
              <h3>{currentLayout.name}</h3>
              <p>{currentLayout.meta}</p>
            </div>
            <button
              className="primary browse-layouts-button"
              onClick={() => {
                setDraftLayout(design.layout);
                setLayoutBrowserOpen(true);
              }}
            >
              <Layout size={16} /> Browse layouts
            </button>
          </section>
          <section className="current-layout-preview">
            <GalleryPreviewFrame gallery={activeGallery} workspace={workspace} className="layout-tab-preview" />
          </section>
          {layoutBrowserOpen && (
            <LayoutBrowserOverlay
              activeGallery={activeGallery}
              draftLayout={draftLayout}
              workspace={workspace}
              onClose={() => setLayoutBrowserOpen(false)}
              onDraftLayoutChange={setDraftLayout}
              onSave={() => {
                onDesignChange({ layout: draftLayout });
                setLayoutBrowserOpen(false);
              }}
            />
          )}
        </>
      )}

      {tab === 'heading' && (
        <div className="design-stack">
          <label>Eyebrow<input value={design.eyebrow} placeholder="Optional" onChange={(event) => onDesignChange({ eyebrow: event.target.value })} /></label>
          <label>Title<input value={design.title} onChange={(event) => onDesignChange({ title: event.target.value })} /></label>
          <label>Subtitle<input value={design.subtitle} placeholder="Optional" onChange={(event) => onDesignChange({ subtitle: event.target.value })} /></label>
          <div className="save-state"><Check size={15} /> Autosaved to draft</div>
        </div>
      )}

      {tab === 'background' && (
        <div className="design-stack">
          <div className="segmented wide"><button className={design.backgroundType === 'image' ? 'on' : ''} onClick={() => onDesignChange({ backgroundType: 'image' })}>Image</button><button className={design.backgroundType === 'video' ? 'on' : ''} onClick={() => onDesignChange({ backgroundType: 'video' })}>Video</button></div>
          <input
            ref={backgroundInputRef}
            type="file"
            accept="image/*"
            className="visually-hidden"
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              if (file) onBackgroundUpload(file);
              event.currentTarget.value = '';
            }}
          />
          <button className="upload-mini" onClick={() => backgroundInputRef.current?.click()}><Upload size={20} /><span>Upload background image<small>{design.backgroundR2Key ? 'Current image saved to R2' : 'JPG or PNG recommended'}</small></span></button>
          <div className="sample-row">
            {mediaTileGradients.slice(0, 4).map((gradient, index) => (
              <button key={gradient} className={design.backgroundGradient === gradient ? 'selected' : ''} style={{ background: gradient }} onClick={() => onDesignChange({ backgroundGradient: gradient })} aria-label={`Background option ${index + 1}`} />
            ))}
          </div>
        </div>
      )}

      {tab === 'music' && (
        <div className="design-stack">
          <button className="music-row"><Music size={18} /><span>{design.musicTrack}<small>Uploaded track</small></span><strong>Replace</strong></button>
          <label>
            Featured film
            <select value={design.featuredFilm} onChange={(event) => onDesignChange({ featuredFilm: event.target.value })}>
              {[...new Set([design.featuredFilm, ...activeGallery.videoItems.map((video) => video.title), 'Wedding Film'].filter(Boolean))].map((title) => <option key={title}>{title}</option>)}
            </select>
          </label>
          <div className="featured-film-list">
            {design.featuredFilm && <button className="selected"><Play size={14} fill="currentColor" /><span>{design.featuredFilm}</span></button>}
          </div>
        </div>
      )}

      {tab === 'styles' && (
        <div className="design-stack">
          <div className="segmented wide"><button className={design.theme === 'dark' ? 'on' : ''} onClick={() => onDesignChange({ theme: 'dark' })}>Dark</button><button className={design.theme === 'light' ? 'on' : ''} onClick={() => onDesignChange({ theme: 'light' })}>Light</button></div>
          <div className="style-group">
            <span className="field-title">Accent</span>
            <div className="swatches">{accentPresets.map((color) => <button key={color} className={design.accent === color ? 'selected' : ''} style={{ background: color }} onClick={() => onDesignChange({ accent: color })} aria-label={`Use accent ${color}`} />)}<label className="color-picker"><input type="color" value={design.accent} onChange={(event) => onDesignChange({ accent: event.target.value })} /><Palette size={15} /> Custom</label></div>
          </div>
          <div className="style-group">
            <span className="field-title">Typography</span>
            <div className="font-grid">
              <button className={design.typography === 'editorial' ? 'font-option selected' : 'font-option'} onClick={() => onDesignChange({ typography: 'editorial' })}><Type size={15} /><span>Editorial</span></button>
              <button className={design.typography === 'modern' ? 'font-option selected' : 'font-option'} onClick={() => onDesignChange({ typography: 'modern' })}><Monitor size={15} /><span>Modern</span></button>
            </div>
            <div className="font-picker-grid">
              <label>
                Headline font
                <select
                  value={design.headlineFont}
                  onChange={(event) => {
                    const headlineFont = event.target.value;
                    onDesignChange({
                      headlineFont,
                      headlineFontWeight: clampFontWeight(headlineFont, design.headlineFontWeight, design.headlineFontWeight),
                    });
                  }}
                >
                  {FONT_OPTIONS.map((font) => <option key={font.family} value={font.family}>{font.family} · {font.mood}</option>)}
                </select>
              </label>
              <label>
                Weight
                <select
                  value={design.headlineFontWeight}
                  onChange={(event) => onDesignChange({ headlineFontWeight: Number(event.target.value) })}
                >
                  {fontOptionFor(design.headlineFont).weights.map((weight) => <option key={weight} value={weight}>{weight}</option>)}
                </select>
              </label>
              <label>
                Body font
                <select
                  value={design.bodyFont}
                  onChange={(event) => {
                    const bodyFont = event.target.value;
                    onDesignChange({
                      bodyFont,
                      bodyFontWeight: clampFontWeight(bodyFont, design.bodyFontWeight, design.bodyFontWeight),
                    });
                  }}
                >
                  {FONT_OPTIONS.map((font) => <option key={font.family} value={font.family}>{font.family} · {font.mood}</option>)}
                </select>
              </label>
              <label>
                Weight
                <select
                  value={design.bodyFontWeight}
                  onChange={(event) => onDesignChange({ bodyFontWeight: Number(event.target.value) })}
                >
                  {fontOptionFor(design.bodyFont).weights.map((weight) => <option key={weight} value={weight}>{weight}</option>)}
                </select>
              </label>
            </div>
          </div>
          <div className="style-group">
            <span className="field-title">Top buttons</span>
            <Toggle title="Share" checked={design.topButtons.share} onChange={(share) => onDesignChange({ topButtons: { ...design.topButtons, share } })} />
            <Toggle title="Embed" checked={design.topButtons.embed} onChange={(embed) => onDesignChange({ topButtons: { ...design.topButtons, embed } })} />
            <Toggle title="Download" checked={design.topButtons.download} onChange={(download) => onDesignChange({ topButtons: { ...design.topButtons, download } })} />
          </div>
        </div>
      )}
    </Panel>
  );
}

function LayoutBrowserOverlay({
  activeGallery,
  draftLayout,
  workspace,
  onClose,
  onDraftLayoutChange,
  onSave,
}: {
  activeGallery: DashboardGallery;
  draftLayout: GalleryDesign['layout'];
  workspace: WorkspaceAccount;
  onClose: () => void;
  onDraftLayoutChange: (layout: GalleryDesign['layout']) => void;
  onSave: () => void;
}) {
  return createPortal(
    <div className="layout-browser-overlay" role="dialog" aria-modal="true" aria-label="Choose layout">
      <header className="layout-browser-header">
        <button className="layout-browser-back" onClick={onClose}><ArrowLeft size={20} /> Back</button>
        <div>
          <h2>Choose Layout</h2>
          <p>Pick the client-facing gallery arrangement.</p>
        </div>
        <div className="layout-browser-actions">
          <button className="secondary icon-only" onClick={onClose} aria-label="Close layout browser"><X size={18} /></button>
          <button className="primary" onClick={onSave}><Check size={16} /> Save layout</button>
        </div>
      </header>

      <main className="layout-browser-body">
        <h3>Gallery layouts</h3>
        <div className="layout-browser-grid">
          {galleryLayoutOptions.map((item) => (
            <button
              className={draftLayout === item.variant ? 'layout-browser-card selected' : 'layout-browser-card'}
              key={item.variant}
              onClick={() => onDraftLayoutChange(item.variant)}
            >
              <GalleryPreviewFrame gallery={activeGallery} workspace={workspace} layout={item.variant} className="layout-browser-preview" crop />
              <span>{item.name}</span>
              <small>{item.meta}</small>
            </button>
          ))}
        </div>
      </main>
    </div>,
    document.body,
  );
}

export function LivePreview({ gallery, mobile = false, workspace }: { gallery: DashboardGallery; mobile?: boolean; workspace?: WorkspaceAccount }) {
  return (
    <aside className={`preview-wrap ${mobile ? 'mobile-preview-wrap' : ''}`}>
      <div className="preview-label">{mobile ? 'Mobile preview' : 'Live preview'} <span>Updating as you edit</span></div>
      {mobile ? <GalleryMobilePreviewFrame gallery={gallery} workspace={workspace} /> : <GalleryPreviewFrame gallery={gallery} workspace={workspace} />}
    </aside>
  );
}

export type PreviewFilm = {
  category: string;
  duration: string;
  gradient: string;
  id: string;
  paidUnlockEnabled?: boolean;
  paidUnlockLabel?: string;
  paidUnlockPriceCents?: number;
  paidUnlockTagline?: string;
  paidUnlockTrailer?: boolean;
  posterUrl?: string;
  sourceVideoId?: string | null;
  title: string;
  tone: string;
};

type FilmSelectHandler = (film: PreviewFilm) => void;

type PreviewModel = {
  actions: string[];
  chapters: Array<{ blurb: string; duration: string; film: PreviewFilm; time: string; title: string }>;
  couple: string;
  dateLabel: string;
  films: PreviewFilm[];
  eyebrow: string;
  locationLabel: string;
  metaLabel: string;
  pullQuote: string;
  reels: PreviewFilm[];
  studioName: string;
  subtitle: string;
  url: string;
};

const handoffTones = ['#C4AE88', '#CDB998', '#C3AF8D', '#BFA983', '#D2C0A0', '#D7C6A6', '#BFA983', '#C8B392'];
const fallbackTitles = ['The Full Film', 'Ceremony', 'Reception', 'First Dance', 'Golden Hour', 'Getting Ready', 'Speeches', '60-Second Teaser'];
const fallbackDurations = ['6:42', '24:10', '38:55', '4:38', '3:05', '4:20', '8:12', '1:00'];
const fallbackCategories = ['FEATURE', 'FULL', 'FULL', 'MOMENT', 'MOMENT', 'MOMENT', 'FULL', 'SOCIAL'];

function useMediaUrls(keys: string[]) {
  const stableKey = [...new Set(keys)].sort().join('|');
  const [urls, setUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    const uniqueKeys = stableKey ? stableKey.split('|') : [];
    if (!uniqueKeys.length) {
      setUrls({});
      return undefined;
    }

    let cancelled = false;
    void getMediaUrls(uniqueKeys).then((nextUrls) => {
      if (!cancelled) setUrls(nextUrls);
    }).catch(() => {
      if (!cancelled) setUrls({});
    });

    return () => {
      cancelled = true;
    };
  }, [stableKey]);

  return urls;
}

function fontLinkId(href: string) {
  let hash = 0;
  for (let index = 0; index < href.length; index += 1) {
    hash = ((hash << 5) - hash + href.charCodeAt(index)) | 0;
  }
  return `lanterna-fonts-${Math.abs(hash)}`;
}

function GoogleFontLoader({ design }: { design: GalleryDesign }) {
  const fontSettings = galleryFontSettings(design);
  const href = googleFontsHref(fontSettings);

  useEffect(() => {
    if (typeof document === 'undefined') return undefined;
    const id = fontLinkId(href);
    let link = document.getElementById(id) as HTMLLinkElement | null;
    if (!link) {
      link = document.createElement('link');
      link.id = id;
      link.rel = 'stylesheet';
      link.href = href;
      document.head.appendChild(link);
    }
    return undefined;
  }, [href]);

  return null;
}

function fontPreviewVars(design: GalleryDesign) {
  const settings = galleryFontSettings(design);
  return {
    ['--gallery-headline-font' as string]: fontFamilyStack(settings.headlineFont, 'Georgia, serif'),
    ['--gallery-body-font' as string]: fontFamilyStack(settings.bodyFont, 'system-ui, sans-serif'),
    ['--gallery-headline-weight' as string]: settings.headlineFontWeight,
    ['--gallery-body-weight' as string]: settings.bodyFontWeight,
  };
}

export function GalleryPreviewFrame({
  gallery,
  workspace,
  layout,
  className = '',
  crop = false,
  mediaUrls,
  publicMode = false,
  onFilmSelect,
}: {
  gallery: DashboardGallery;
  workspace?: WorkspaceAccount;
  layout?: GalleryDesign['layout'];
  className?: string;
  crop?: boolean;
  mediaUrls?: Record<string, string>;
  publicMode?: boolean;
  onFilmSelect?: FilmSelectHandler;
}) {
  const previewGallery = layout ? { ...gallery, design: { ...gallery.design, layout } } : gallery;
  const signedMediaUrls = useMediaUrls(mediaUrls ? [] : previewGallery.design.backgroundR2Key ? [previewGallery.design.backgroundR2Key] : []);
  const backgroundUrl = previewGallery.design.backgroundR2Key
    ? (mediaUrls?.[previewGallery.design.backgroundR2Key] ?? signedMediaUrls[previewGallery.design.backgroundR2Key])
    : '';
  const model = buildPreviewModel(previewGallery, workspace, { mediaUrls, repeatFilms: !publicMode });
  const { design } = previewGallery;
  const shellRef = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const shell = shellRef.current;
    if (!shell) return undefined;
    const syncScale = () => {
      const rect = shell.getBoundingClientRect();
      const widthScale = rect.width / 1150;
      const heightScale = rect.height > 0 ? rect.height / 632 : widthScale;
      setScale(publicMode ? Math.max(widthScale, heightScale) : widthScale);
    };
    syncScale();
    const observer = new ResizeObserver(syncScale);
    observer.observe(shell);
    return () => observer.disconnect();
  }, [publicMode]);

  return (
    <div
      className={`client-preview lanterna-preview-frame ${publicMode ? 'is-public' : ''} ${crop ? 'is-crop' : 'has-browser'} layout-${design.layout} ${className}`}
      style={{
        ['--client-accent' as string]: design.accent,
        ['--preview-bg' as string]: backgroundUrl ? `url("${backgroundUrl}")` : design.backgroundGradient,
        ...fontPreviewVars(design),
      }}
    >
      <GoogleFontLoader design={design} />
      {!crop && (
        <div className="lg-browser-bar">
          <i /><i /><i />
          <span>{model.url}</span>
        </div>
      )}
      <div className="lg-content-shell" ref={shellRef} style={{ ['--preview-scale' as string]: scale }}>
        <GalleryTemplatePreview gallery={previewGallery} model={model} onFilmSelect={onFilmSelect} />
      </div>
    </div>
  );
}

export function GalleryMobilePreviewFrame({
  gallery,
  workspace,
  layout,
  className = '',
  mediaUrls,
  publicMode = false,
  onFilmSelect,
}: {
  gallery: DashboardGallery;
  workspace?: WorkspaceAccount;
  layout?: GalleryDesign['layout'];
  className?: string;
  mediaUrls?: Record<string, string>;
  publicMode?: boolean;
  onFilmSelect?: FilmSelectHandler;
}) {
  const previewGallery = layout ? { ...gallery, design: { ...gallery.design, layout } } : gallery;
  const signedMediaUrls = useMediaUrls(mediaUrls ? [] : previewGallery.design.backgroundR2Key ? [previewGallery.design.backgroundR2Key] : []);
  const backgroundUrl = previewGallery.design.backgroundR2Key
    ? (mediaUrls?.[previewGallery.design.backgroundR2Key] ?? signedMediaUrls[previewGallery.design.backgroundR2Key])
    : '';
  const model = buildPreviewModel(previewGallery, workspace, { mediaUrls, repeatFilms: !publicMode });
  const stageRef = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return undefined;
    const syncScale = () => {
      const maxScale = publicMode ? 1.24 : 1.1;
      const scaleOffset = publicMode ? 0.98 : 0.8;
      setScale(Math.min(stage.getBoundingClientRect().width / 322, maxScale) * scaleOffset);
    };
    syncScale();
    const observer = new ResizeObserver(syncScale);
    observer.observe(stage);
    return () => observer.disconnect();
  }, [publicMode]);

  if (publicMode) {
    return (
      <div
        className={`mobile-preview-stage is-public ${className}`}
        style={{
          ['--preview-bg' as string]: backgroundUrl ? `url("${backgroundUrl}")` : previewGallery.design.backgroundGradient,
          ...fontPreviewVars(previewGallery.design),
        }}
      >
        <GoogleFontLoader design={previewGallery.design} />
        <div className="public-mobile-screen">
          <GalleryMobileTemplate gallery={previewGallery} model={model} onFilmSelect={onFilmSelect} />
        </div>
      </div>
    );
  }

  return (
    <div
      className={`mobile-preview-stage ${className}`}
      ref={stageRef}
      style={{
        height: 644 * scale,
        ['--preview-bg' as string]: backgroundUrl ? `url("${backgroundUrl}")` : previewGallery.design.backgroundGradient,
        ...fontPreviewVars(previewGallery.design),
      }}
    >
      <GoogleFontLoader design={previewGallery.design} />
      <div className="lm-device" style={{ transform: `scale(${scale})` }}>
        <div className="lm-screen">
          <span className="lm-notch" />
          <GalleryMobileTemplate gallery={previewGallery} model={model} onFilmSelect={onFilmSelect} />
        </div>
      </div>
    </div>
  );
}

function buildPreviewModel(gallery: DashboardGallery, workspace?: WorkspaceAccount, options: { mediaUrls?: Record<string, string>; repeatFilms?: boolean } = {}): PreviewModel {
  const studioName = workspace?.studioName || 'Nightingale Films';
  const customDomain = displayDomain(workspace?.customDomain || 'lanterna.film');
  const title = gallery.design.title || gallery.name || 'Emma & James';
  const subtitle = gallery.design.subtitle.trim();
  const dateLabel = gallery.date === 'Just now' ? '14 June 2025' : gallery.date;
  const locationLabel = subtitle.includes('·') ? subtitle.split('·').slice(1).join('·').trim() : subtitle;
  const metaLabel = [dateLabel, locationLabel].filter(Boolean).join(' · ');
  const sourceFilms = gallery.videoItems.length ? gallery.videoItems : [];
  const filmCount = sourceFilms.length && options.repeatFilms === false ? sourceFilms.length : 8;
  const films = Array.from({ length: filmCount }).map((_, index) => {
    const source = sourceFilms[index % Math.max(sourceFilms.length, 1)];
    const fallbackTone = index === 0 ? '#C4AE88' : handoffTones[index];
    return {
      category: fallbackCategories[index],
      duration: source?.duration || fallbackDurations[index],
      gradient: source?.gradient || (index === 0 ? gallery.design.backgroundGradient : `linear-gradient(135deg,${fallbackTone},#7A5632)`),
      id: source ? `${source.id}-preview-${index}` : `preview-film-${index}`,
      paidUnlockEnabled: source?.paidUnlockEnabled,
      paidUnlockLabel: source?.paidUnlockLabel,
      paidUnlockPriceCents: source?.paidUnlockPriceCents,
      paidUnlockTagline: source?.paidUnlockTagline,
      paidUnlockTrailer: source?.paidUnlockTrailer,
      posterUrl: source?.posterR2Key ? options.mediaUrls?.[source.posterR2Key] : undefined,
      sourceVideoId: source?.id ?? null,
      title: source?.title || fallbackTitles[index],
      tone: fallbackTone,
    };
  });
  const filmAt = (index: number) => films[index] ?? films[films.length - 1] ?? {
    category: fallbackCategories[0],
    duration: fallbackDurations[0],
    gradient: gallery.design.backgroundGradient,
    id: 'preview-film-fallback',
    posterUrl: undefined,
    sourceVideoId: null,
    title: fallbackTitles[0],
    tone: '#C4AE88',
  };
  const reels = [
    { ...filmAt(7), category: 'REEL', title: 'The Highlight', tone: '#BCA684' },
    { ...filmAt(3), category: 'REEL', title: 'First Dance', tone: '#CDB998' },
  ];

  return {
    actions: [
      gallery.design.topButtons.share ? 'Share' : '',
      gallery.design.topButtons.embed ? 'Embed' : '',
      gallery.design.topButtons.download ? 'Download' : '',
    ].filter(Boolean),
    chapters: [
      { blurb: 'Quiet morning light, the dress, the letters', duration: filmAt(5).duration, film: filmAt(5), time: '11:00 AM', title: 'Getting Ready' },
      { blurb: 'Vows beneath the pergola, not a dry eye', duration: filmAt(1).duration, film: filmAt(1), time: '3:00 PM', title: 'The Ceremony' },
      { blurb: 'Portraits along the Amalfi cliffs', duration: filmAt(4).duration, film: filmAt(4), time: '7:30 PM', title: 'Golden Hour' },
      { blurb: 'First dance, speeches, sparklers till midnight', duration: filmAt(2).duration, film: filmAt(2), time: '9:00 PM', title: 'The Reception' },
    ],
    couple: title,
    dateLabel,
    eyebrow: gallery.design.eyebrow.trim(),
    films,
    locationLabel,
    metaLabel,
    pullQuote: 'Six hours of film, distilled into the six minutes we will play every anniversary.',
    reels,
    studioName,
    subtitle,
    url: `${customDomain}/${gallery.id}`,
  };
}

function GalleryTemplatePreview({ gallery, model, onFilmSelect }: { gallery: DashboardGallery; model: PreviewModel; onFilmSelect?: FilmSelectHandler }) {
  const layout = gallery.design.layout;

  if (layout === 'diptych') return <DiptychTemplate model={model} onFilmSelect={onFilmSelect} />;
  if (layout === 'meridian') return <MeridianTemplate model={model} onFilmSelect={onFilmSelect} />;
  if (layout === 'grove') return <GroveTemplate model={model} onFilmSelect={onFilmSelect} />;
  if (layout === 'atelier') return <AtelierTemplate model={model} onFilmSelect={onFilmSelect} />;
  if (layout === 'reel') return <ReelTemplate model={model} onFilmSelect={onFilmSelect} />;
  if (layout === 'overture') return <OvertureTemplate model={model} onFilmSelect={onFilmSelect} />;
  if (layout === 'passage') return <PassageTemplate model={model} onFilmSelect={onFilmSelect} />;
  if (layout === 'salon') return <SalonTemplate model={model} onFilmSelect={onFilmSelect} />;
  return <LumenTemplate model={model} onFilmSelect={onFilmSelect} />;
}

function GalleryMobileTemplate({ gallery, model, onFilmSelect }: { gallery: DashboardGallery; model: PreviewModel; onFilmSelect?: FilmSelectHandler }) {
  const layout = gallery.design.layout;

  if (layout === 'diptych') return <MobileDiptychTemplate model={model} onFilmSelect={onFilmSelect} />;
  if (layout === 'meridian') return <MobileMeridianTemplate model={model} onFilmSelect={onFilmSelect} />;
  if (layout === 'grove') return <MobileGroveTemplate model={model} onFilmSelect={onFilmSelect} />;
  if (layout === 'atelier') return <MobileAtelierTemplate model={model} onFilmSelect={onFilmSelect} />;
  if (layout === 'reel') return <MobileReelTemplate model={model} onFilmSelect={onFilmSelect} />;
  if (layout === 'overture') return <MobileOvertureTemplate model={model} onFilmSelect={onFilmSelect} />;
  if (layout === 'passage') return <MobilePassageTemplate model={model} onFilmSelect={onFilmSelect} />;
  if (layout === 'salon') return <MobileSalonTemplate model={model} onFilmSelect={onFilmSelect} />;
  return <MobileLumenTemplate model={model} onFilmSelect={onFilmSelect} />;
}

function MobileTopBar({ dark = false, model }: { dark?: boolean; model: PreviewModel }) {
  return (
    <header className={`lm-topbar ${dark ? 'is-dark' : ''}`}>
      <BrandMark studioName={model.studioName} dark={dark} />
      <ActionDots actions={model.actions} light={!dark} />
    </header>
  );
}

function MobileLumenTemplate({ model, onFilmSelect }: { model: PreviewModel; onFilmSelect?: FilmSelectHandler }) {
  return (
    <main className="lm-template lm-lumen">
      <MobileTopBar dark model={model} />
      <section className="lm-hero-copy">
        {model.eyebrow && <small>{model.eyebrow}</small>}
        <h2>{model.couple}</h2>
        <button onClick={() => onFilmSelect?.(model.films[0])}><PlayTriangle /> Play All Films</button>
        {model.metaLabel && <span>{model.metaLabel}</span>}
      </section>
      <section className="lm-film-stack">{model.films.slice(0, 3).map((film, index) => <FilmCard active={index === 0} film={film} key={film.id} onFilmSelect={onFilmSelect} />)}</section>
    </main>
  );
}

function MobileDiptychTemplate({ model, onFilmSelect }: { model: PreviewModel; onFilmSelect?: FilmSelectHandler }) {
  return (
    <main className="lm-template lm-diptych">
      <section className="lm-mobile-feature still" style={filmStyle(model.films[0])}>
        <MobileTopBar dark model={model} />
        <div>{model.eyebrow && <small>{model.eyebrow}</small>}<h2>{model.couple}</h2><button onClick={() => onFilmSelect?.(model.films[0])}><PlayTriangle /> Play Film</button></div>
      </section>
      <section className="lm-list">{model.films.slice(0, 4).map((film, index) => <FilmRow active={index === 0} film={film} key={film.id} onFilmSelect={onFilmSelect} />)}</section>
    </main>
  );
}

function MobileMeridianTemplate({ model, onFilmSelect }: { model: PreviewModel; onFilmSelect?: FilmSelectHandler }) {
  return (
    <main className="lm-template lm-meridian">
      <MobileTopBar model={model} />
      <section className="lm-centered">
        <small>The Wedding Of</small>
        <h2>{model.couple}</h2>
        <p>{model.dateLabel}</p>
        <button onClick={() => onFilmSelect?.(model.films[0])}><PlayTriangle light /> Play All Films</button>
      </section>
      <section className="lm-film-stack">{model.films.slice(0, 2).map((film) => <FilmCard film={film} key={film.id} onFilmSelect={onFilmSelect} />)}</section>
    </main>
  );
}

function MobileGroveTemplate({ model, onFilmSelect }: { model: PreviewModel; onFilmSelect?: FilmSelectHandler }) {
  return (
    <main className="lm-template lm-grove">
      <MobileTopBar model={model} />
      <section className="lm-player still" style={filmStyle(model.films[0])}>
        <div><small>Now Playing</small><h2>{model.couple}</h2><button onClick={() => onFilmSelect?.(model.films[0])}><PlayTriangle /> Play Film</button></div>
      </section>
      <section className="lm-grid">{model.films.slice(0, 4).map((film, index) => <FilmThumb active={index === 0} film={film} key={film.id} onFilmSelect={onFilmSelect} />)}</section>
    </main>
  );
}

function MobileAtelierTemplate({ model, onFilmSelect }: { model: PreviewModel; onFilmSelect?: FilmSelectHandler }) {
  return (
    <main className="lm-template lm-atelier">
      <header><BrandMark studioName={model.studioName} /><span>Ravello · MMXXV</span></header>
      <section><small>Ravello · Vol.14</small><h2>{model.couple}</h2><p>{model.pullQuote}</p></section>
      <section className="lm-bento">{model.films.slice(0, 5).map((film, index) => <FilmBento film={film} index={index} key={film.id} onFilmSelect={onFilmSelect} />)}</section>
    </main>
  );
}

function MobileReelTemplate({ model, onFilmSelect }: { model: PreviewModel; onFilmSelect?: FilmSelectHandler }) {
  return (
    <main className="lm-template lm-reel">
      <MobileTopBar model={model} />
      <section className="lm-player still" style={filmStyle(model.films[0])}>
        <div><small>Feature Film</small><h2>{model.couple}</h2><button onClick={() => onFilmSelect?.(model.films[0])}><PlayTriangle /> Play Film</button></div>
      </section>
      <strong>Social Reels <b>1 / 5</b></strong>
      <section className="lm-reels">{model.reels.map((film, index) => <ReelCard film={film} index={index} key={film.id} onFilmSelect={onFilmSelect} />)}</section>
    </main>
  );
}

function MobileOvertureTemplate({ model, onFilmSelect }: { model: PreviewModel; onFilmSelect?: FilmSelectHandler }) {
  return (
    <main className="lm-template lm-overture">
      <small>Nightingale Films Presents</small>
      <section className="lm-poster still" style={filmStyle(model.films[0])}>
        <span className="lg-play-circle"><PlayTriangle /></span>
        <h2>{model.couple.replace('&', 'and')}</h2>
      </section>
      {model.metaLabel && <p>{model.metaLabel}</p>}
      <button onClick={() => onFilmSelect?.(model.films[0])}><PlayTriangle light /> Play Feature</button>
    </main>
  );
}

function MobilePassageTemplate({ model, onFilmSelect }: { model: PreviewModel; onFilmSelect?: FilmSelectHandler }) {
  return (
    <main className="lm-template lm-passage">
      <BrandMark studioName={model.studioName} />
      <h2>{model.couple}</h2>
      <p>A film in four movements · {model.dateLabel}</p>
      <button onClick={() => onFilmSelect?.(model.films[0])}><PlayTriangle light /> Play the Full Film</button>
      <section className="lm-timeline">{model.chapters.map((chapter) => <TimelineStation chapter={chapter} key={chapter.title} onFilmSelect={onFilmSelect} />)}</section>
    </main>
  );
}

function MobileSalonTemplate({ model, onFilmSelect }: { model: PreviewModel; onFilmSelect?: FilmSelectHandler }) {
  return (
    <main className="lm-template lm-salon">
      <header><BrandMark studioName={model.studioName} /><SegmentedTabs /></header>
      <h2>{model.couple}</h2>
      <section className="lm-salon-wall">{model.films.slice(0, 4).map((film, index) => <SalonPrint feature={index === 0} film={film} key={film.id} onFilmSelect={onFilmSelect} />)}</section>
    </main>
  );
}

function LumenTemplate({ model, onFilmSelect }: { model: PreviewModel; onFilmSelect?: FilmSelectHandler }) {
  return (
    <main className="lg-template lg-lumen">
      <div className="lg-faint-label">Feature Film · 16:9</div>
      <div className="lg-lumen-top"><BrandMark studioName={model.studioName} dark /><ActionDots actions={model.actions} /></div>
      <section className="lg-lumen-title">
        {model.eyebrow && <small>{model.eyebrow}</small>}
        <h2>{model.couple}</h2>
        <div><button onClick={() => onFilmSelect?.(model.films[0])}><PlayTriangle /> Play All Films</button>{model.metaLabel && <span>{model.metaLabel}</span>}</div>
      </section>
      <section className="lg-lumen-films">{model.films.slice(0, 3).map((film, index) => <FilmCard active={index === 0} film={film} key={film.id} onFilmSelect={onFilmSelect} />)}</section>
    </main>
  );
}

function DiptychTemplate({ model, onFilmSelect }: { model: PreviewModel; onFilmSelect?: FilmSelectHandler }) {
  return (
    <main className="lg-template lg-diptych">
      <section className="lg-diptych-feature still" style={filmStyle(model.films[0])}>
        <BrandMark studioName={model.studioName} dark />
        <div>
          {model.eyebrow && <small>{model.eyebrow}</small>}
          <h2>{model.couple}</h2>
          {model.metaLabel && <p>{model.metaLabel}</p>}
          <button onClick={() => onFilmSelect?.(model.films[0])}><PlayTriangle /> Play Film · {model.films[0].duration}</button>
        </div>
      </section>
      <section className="lg-diptych-list">
        <header><h3>The Films</h3><ActionDots actions={model.actions} light /></header>
        <p>Four films in this collection</p>
        {model.films.slice(0, 4).map((film, index) => <FilmRow active={index === 0} film={film} key={film.id} onFilmSelect={onFilmSelect} />)}
      </section>
    </main>
  );
}

function MeridianTemplate({ model, onFilmSelect }: { model: PreviewModel; onFilmSelect?: FilmSelectHandler }) {
  return (
    <main className="lg-template lg-meridian">
      <header><BrandMark studioName={model.studioName} /><SegmentedTabs /><ActionDots actions={model.actions} light /></header>
      <section className="lg-centered-title">
        <small>The Wedding Of</small>
        <h2>{model.couple}</h2>
        <p>{model.dateLabel}</p>
        <button onClick={() => onFilmSelect?.(model.films[0])}><PlayTriangle light /> Play All Films</button>
      </section>
      <section className="lg-card-row">{model.films.slice(0, 3).map((film) => <FilmCard film={film} key={film.id} onFilmSelect={onFilmSelect} />)}</section>
    </main>
  );
}

function GroveTemplate({ model, onFilmSelect }: { model: PreviewModel; onFilmSelect?: FilmSelectHandler }) {
  return (
    <main className="lg-template lg-grove">
      <header><BrandMark studioName={model.studioName} /><ActionDots actions={model.actions} light /></header>
      <section className="lg-grove-player still" style={filmStyle(model.films[0])}>
        <div>
          <small>Now Playing · Wedding Film</small>
          <h2>{model.couple}</h2>
          <p><button onClick={() => onFilmSelect?.(model.films[0])}><PlayTriangle /> Play Film</button><span>{model.dateLabel} · {model.films[0].duration}</span></p>
        </div>
      </section>
      <section className="lg-grove-strip">{model.films.slice(0, 4).map((film, index) => <FilmThumb active={index === 0} film={film} key={film.id} onFilmSelect={onFilmSelect} />)}</section>
    </main>
  );
}

function AtelierTemplate({ model, onFilmSelect }: { model: PreviewModel; onFilmSelect?: FilmSelectHandler }) {
  const parts = model.couple.split('&').map((part) => part.trim());
  return (
    <main className="lg-template lg-atelier">
      <header><BrandMark studioName={model.studioName} /><span>Ravello · MMXXV · Vol.14</span></header>
      <section className="lg-atelier-title">
        <div><small>Ravello · MMXXV · Vol.14</small><h2>{parts[0] || model.couple} <em>&</em> {parts[1] || ''}</h2></div>
        <p>{model.pullQuote}</p>
      </section>
      <section className="lg-bento">{model.films.slice(0, 5).map((film, index) => <FilmBento film={film} index={index} key={film.id} onFilmSelect={onFilmSelect} />)}</section>
    </main>
  );
}

function ReelTemplate({ model, onFilmSelect }: { model: PreviewModel; onFilmSelect?: FilmSelectHandler }) {
  return (
    <main className="lg-template lg-reel">
      <header><BrandMark studioName={model.studioName} /><ActionDots actions={model.actions} light /></header>
      <section className="lg-reel-body">
        <div className="lg-reel-feature still" style={filmStyle(model.films[0])}>
          <div><small>Feature Film · 16:9</small><h2>{model.couple}</h2><button onClick={() => onFilmSelect?.(model.films[0])}><PlayTriangle /> Play Film · {model.films[0].duration}</button></div>
        </div>
        <aside>
          <strong>Social Reels <b>1 / 5</b></strong>
          {model.reels.map((film, index) => <ReelCard film={film} index={index} key={film.id} onFilmSelect={onFilmSelect} />)}
        </aside>
      </section>
    </main>
  );
}

function OvertureTemplate({ model, onFilmSelect }: { model: PreviewModel; onFilmSelect?: FilmSelectHandler }) {
  const parts = model.couple.replace('&', 'and').split(' ');
  return (
    <main className="lg-template lg-overture">
      <small>Nightingale Films Presents</small>
      <section className="lg-poster">
        <div className="still" style={filmStyle(model.films[0])}>
          <span className="lg-play-circle"><PlayTriangle /></span>
          <h2>{parts.slice(0, 1).join(' ')}<em>and</em>{parts.slice(-1).join(' ')}</h2>
        </div>
      </section>
      <p>{['Filmed by ' + model.studioName, model.locationLabel, model.dateLabel, `Runtime ${model.films[0].duration}`].filter(Boolean).join(' · ')}</p>
      <div className="lg-chips"><button onClick={() => onFilmSelect?.(model.films[0])}>Play Feature</button>{model.films.slice(1, 4).map((film) => <button key={film.id} onClick={() => onFilmSelect?.(film)}>{film.title} · {film.duration}</button>)}</div>
    </main>
  );
}

function PassageTemplate({ model, onFilmSelect }: { model: PreviewModel; onFilmSelect?: FilmSelectHandler }) {
  return (
    <main className="lg-template lg-passage">
      <header>
        <div><BrandMark studioName={model.studioName} /><h2>{model.couple}</h2><p>A film in four movements · {model.dateLabel} · Ravello</p></div>
        <button onClick={() => onFilmSelect?.(model.films[0])}><PlayTriangle light /> Play the Full Film</button>
      </header>
      <section className="lg-timeline">{model.chapters.map((chapter) => <TimelineStation chapter={chapter} key={chapter.title} onFilmSelect={onFilmSelect} />)}</section>
    </main>
  );
}

function SalonTemplate({ model, onFilmSelect }: { model: PreviewModel; onFilmSelect?: FilmSelectHandler }) {
  return (
    <main className="lg-template lg-salon">
      <header><div><BrandMark studioName={model.studioName} /><h2>{model.couple}</h2></div><div><SegmentedTabs /><ActionDots actions={model.actions} light single /></div></header>
      <section className="lg-salon-wall">{model.films.map((film, index) => <SalonPrint feature={index === 0} film={film} key={film.id} onFilmSelect={onFilmSelect} />)}</section>
    </main>
  );
}

function BrandMark({ dark = false, studioName }: { dark?: boolean; studioName: string }) {
  return <span className={`lg-brand ${dark ? 'is-dark' : ''}`}><i /><b>{studioName}</b></span>;
}

function ActionDots({ actions = ['Share', 'Download'], light = false, single = false }: { actions?: string[]; light?: boolean; single?: boolean }) {
  const visibleActions = single ? actions.slice(-1) : actions;
  return <nav className={`lg-actions ${light ? 'is-light' : ''}`}>{visibleActions.map((action) => <span key={action}>{action}</span>)}</nav>;
}

function SegmentedTabs() {
  return <nav className="lg-tabs"><span>Films</span><span>Photos</span></nav>;
}

function PlayTriangle({ light = false }: { light?: boolean }) {
  return <i className={`lg-play-triangle ${light ? 'is-light' : ''}`} />;
}

function filmStyle(film: PreviewFilm) {
  return {
    ['--film-image' as string]: film.posterUrl ? `linear-gradient(180deg,rgba(20,12,6,.08),rgba(20,12,6,.42)), url("${film.posterUrl}")` : undefined,
    ['--film-tone' as string]: film.tone,
    background: film.gradient,
  };
}

function filmInteractionProps(film: PreviewFilm, onFilmSelect?: FilmSelectHandler) {
  if (!onFilmSelect) return {};
  const play = () => onFilmSelect(film);
  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      play();
    }
  };

  return {
    'aria-label': `Play ${film.title}`,
    onClick: play,
    onKeyDown,
    role: 'button',
    tabIndex: 0,
  };
}

function PaidFilmBadge({ compact = false, film }: { compact?: boolean; film: PreviewFilm }) {
  if (!film.paidUnlockEnabled) return null;
  const price = Math.max(0, Math.round((film.paidUnlockPriceCents ?? 30000) / 100));
  return <em className={`lg-paid-badge ${compact ? 'is-compact' : ''}`}><Lock size={compact ? 8 : 10} /> ${price}</em>;
}

function FilmCard({ active = false, film, onFilmSelect }: { active?: boolean; film: PreviewFilm; onFilmSelect?: FilmSelectHandler }) {
  return <article className={`lg-film-card still ${active ? 'active' : ''} ${film.paidUnlockEnabled ? 'is-paid' : ''}`} style={filmStyle(film)} {...filmInteractionProps(film, onFilmSelect)}><PaidFilmBadge film={film} /><b>{film.duration}</b><span>{film.title}</span></article>;
}

function FilmThumb({ active = false, film, onFilmSelect }: { active?: boolean; film: PreviewFilm; onFilmSelect?: FilmSelectHandler }) {
  return <article className={`lg-film-thumb still ${active ? 'active' : ''} ${film.paidUnlockEnabled ? 'is-paid' : ''}`} style={filmStyle(film)} {...filmInteractionProps(film, onFilmSelect)}><PaidFilmBadge compact film={film} /><span>{film.title}</span><b>{film.duration}</b></article>;
}

function FilmRow({ active = false, film, onFilmSelect }: { active?: boolean; film: PreviewFilm; onFilmSelect?: FilmSelectHandler }) {
  return <article className={`lg-film-row ${active ? 'active' : ''} ${film.paidUnlockEnabled ? 'is-paid' : ''}`} {...filmInteractionProps(film, onFilmSelect)}><i className="still" style={filmStyle(film)}><PlayTriangle light /><PaidFilmBadge compact film={film} /></i><span>{film.title}<b>{film.category} · {film.duration}</b></span></article>;
}

function FilmBento({ film, index, onFilmSelect }: { film: PreviewFilm; index: number; onFilmSelect?: FilmSelectHandler }) {
  return <article className={`lg-bento-cell still ${film.paidUnlockEnabled ? 'is-paid' : ''}`} style={filmStyle(film)} {...filmInteractionProps(film, onFilmSelect)}><PaidFilmBadge film={film} /><b>{String(index + 1).padStart(2, '0')}</b><span>{film.title}<em>{film.category} · {film.duration}</em></span></article>;
}

function ReelCard({ film, index, onFilmSelect }: { film: PreviewFilm; index: number; onFilmSelect?: FilmSelectHandler }) {
  return <article className={`lg-reel-card still ${film.paidUnlockEnabled ? 'is-paid' : ''}`} style={filmStyle(film)} {...filmInteractionProps(film, onFilmSelect)}><PaidFilmBadge compact film={film} /><b>Reel {String(index + 1).padStart(2, '0')}</b><span>{film.title}</span></article>;
}

function TimelineStation({ chapter, onFilmSelect }: { chapter: PreviewModel['chapters'][number]; onFilmSelect?: FilmSelectHandler }) {
  return <article className={chapter.film.paidUnlockEnabled ? 'is-paid' : ''} {...filmInteractionProps(chapter.film, onFilmSelect)}><time>{chapter.time}</time><i className="still" style={filmStyle(chapter.film)}><PlayTriangle light /><PaidFilmBadge compact film={chapter.film} /></i><span>{chapter.title}<b>{chapter.blurb}</b></span><em>{chapter.duration}</em></article>;
}

function SalonPrint({ feature = false, film, onFilmSelect }: { feature?: boolean; film: PreviewFilm; onFilmSelect?: FilmSelectHandler }) {
  return <article className={`lg-print ${film.paidUnlockEnabled ? 'is-paid' : ''}`} {...filmInteractionProps(film, onFilmSelect)}><i className="still" style={filmStyle(film)}><PaidFilmBadge compact film={film} />{feature && <b>Feature</b>}<span>{film.title}</span></i></article>;
}

function bytesToHex(buffer: ArrayBuffer) {
  return [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function randomSalt() {
  const bytes = new Uint8Array(16);
  window.crypto.getRandomValues(bytes);
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function passwordHash(password: string) {
  const salt = randomSalt();
  const digest = await window.crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${salt}:${password}`));
  return `sha256:${salt}:${bytesToHex(digest)}`;
}

function SettingsTab({
  activeGallery,
  workspace,
  onGalleryChange,
}: {
  activeGallery: DashboardGallery;
  workspace: WorkspaceAccount;
  onGalleryChange: (patch: Partial<DashboardGallery>) => void;
}) {
  const accessOptions: DashboardGallery['access'][] = ['Public', 'Password', 'Private'];
  const customDomain = displayDomain(workspace.customDomain ?? 'deliver.lanterna.studio');
  const setPassword = async (value: string) => {
    const password = value.trim();
    if (!password) {
      onGalleryChange({ passwordHash: null, passwordSet: false });
      return;
    }
    onGalleryChange({ passwordHash: await passwordHash(password), passwordSet: true });
  };

  return (
    <div className="settings-stack">
      <Panel title="Gallery details">
        <label>Gallery name<input value={activeGallery.name} onChange={(event) => onGalleryChange({ name: event.target.value })} /></label>
        <label>Client name<input value={activeGallery.client} onChange={(event) => onGalleryChange({ client: event.target.value })} /></label>
        <label>Gallery link<div className="readonly"><Link2 size={15} /> {customDomain}/{activeGallery.slug}</div></label>
      </Panel>
      <Panel title="Access">
        <div className="segmented wide">
          {accessOptions.map((item) => (
            <button
              key={item}
              className={activeGallery.access === item ? 'on' : ''}
              onClick={() => onGalleryChange({ access: item, passwordHash: item === 'Password' ? activeGallery.passwordHash : null, passwordSet: item === 'Password' ? activeGallery.passwordSet : false })}
            >
              {item}
            </button>
          ))}
        </div>
        {activeGallery.access === 'Password' && (
          <label>
            Gallery password
            <input type="password" placeholder={activeGallery.passwordSet ? 'Password is set' : 'Set a password'} onChange={(event) => void setPassword(event.target.value)} />
          </label>
        )}
        {activeGallery.access === 'Password' && <div className={activeGallery.passwordSet ? 'save-state' : 'save-state warn'}>{activeGallery.passwordSet ? <Check size={15} /> : <Lock size={15} />}{activeGallery.passwordSet ? 'Password ready' : 'Password required'}</div>}
        <Toggle title="Allow downloads" checked={activeGallery.allowDownloads} onChange={(allowDownloads) => onGalleryChange({ allowDownloads })} />
        <Toggle title="Auto-expire gallery" checked={activeGallery.autoExpire} onChange={(autoExpire) => onGalleryChange({ autoExpire })} />
      </Panel>
    </div>
  );
}

function DeliverTab({
  activeGallery,
  preflight,
  workspace,
  onGalleryChange,
  onSendDelivery,
  onShowToast,
}: {
  activeGallery: DashboardGallery;
  preflight: { ok: boolean; label: string }[];
  workspace: WorkspaceAccount;
  onGalleryChange: (patch: Partial<DashboardGallery>) => void;
  onSendDelivery: () => void;
  onShowToast: (message: string) => void;
}) {
  const deliveryReady = preflight.every((item) => item.ok);
  const customDomain = workspace.customDomain ?? 'deliver.lanterna.studio';
  const deliveryLink = publicGalleryDisplayUrl(customDomain, activeGallery.slug);
  const copyDeliveryLink = () => {
    void navigator.clipboard?.writeText(publicGalleryUrl(customDomain, activeGallery.slug));
    onShowToast('Copied link');
  };

  return (
    <div className="deliver-stack">
      <section className={`panel deliver-hero ${deliveryReady ? 'is-ready' : 'is-blocked'}`}>
        <span className="deliver-icon">{deliveryReady ? <Check size={20} /> : <AlertTriangle size={20} />}</span>
        <h2>{deliveryReady ? 'Ready to deliver' : 'Delivery blocked'}</h2>
        <p className="muted">{deliveryReady ? 'Run the final preflight and send the gallery.' : 'Complete the preflight before sending this gallery.'}</p>
        <div className="preflight">
          {preflight.map((item) => <div key={item.label} className={item.ok ? 'ok' : 'warn'}>{item.ok ? <Check size={16} /> : <Lock size={16} />}{item.label}</div>)}
        </div>
      </section>
      <Panel title="Delivery link">
        <div className="copy-field">{deliveryLink}<button onClick={copyDeliveryLink}><Copy size={15} /> Copy</button></div>
        <label>
          Send to clients
          <input
            value={activeGallery.deliveryDraft.recipients}
            placeholder="client@email.com, planner@email.com"
            onChange={(event) => onGalleryChange({ deliveryDraft: { ...activeGallery.deliveryDraft, recipients: event.target.value } })}
          />
        </label>
        <label>
          Optional message
          <textarea
            value={activeGallery.deliveryDraft.message}
            placeholder="A short note for the couple..."
            onChange={(event) => onGalleryChange({ deliveryDraft: { ...activeGallery.deliveryDraft, message: event.target.value } })}
          />
        </label>
        <button className="primary" disabled={!deliveryReady} onClick={onSendDelivery}><Send size={16} /> Send to clients</button>
      </Panel>
      <Panel title="Delivery history">
        {activeGallery.recipients.length ? activeGallery.recipients.map((recipient) => <div className="recipient" key={recipient.email}><span>{recipient.email}<small>{recipient.status} · {recipient.at}</small></span></div>) : <p className="muted">No deliveries sent yet.</p>}
      </Panel>
    </div>
  );
}
