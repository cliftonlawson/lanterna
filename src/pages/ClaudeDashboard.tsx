import { useMemo, useState } from 'react';
import {
  ArrowLeft,
  Check,
  ChevronRight,
  Copy,
  Download,
  Eye,
  Film,
  Grid2X2,
  HardDrive,
  Image,
  Layout,
  Link2,
  ListChecks,
  Lock,
  MoreHorizontal,
  Music,
  Palette,
  PanelLeft,
  Play,
  Plus,
  Search,
  Send,
  Settings,
  Share2,
  SlidersHorizontal,
  Trash2,
  Upload,
  User,
  Wand2,
  X,
} from 'lucide-react';
import { LanternLogo } from '../components/LanternLogo';

type Props = {
  onBack?: () => void;
  onSignUp?: () => void;
};

type Theme = 'dark' | 'light';
type View = 'galleries' | 'studio' | 'vendor' | 'account' | 'upload';
type StudioTab = 'videos' | 'photos' | 'layout' | 'heading' | 'background' | 'music' | 'styles' | 'settings' | 'deliver';
type GalleryStatus = 'draft' | 'published' | 'delivered';

type Gallery = {
  id: string;
  name: string;
  client: string;
  date: string;
  project: 'Weddings' | 'Engagements' | 'Portraits';
  videos: number;
  photos: number;
  views: string;
  status: GalleryStatus;
  archived?: boolean;
  access: 'Public' | 'Password' | 'Private';
  passwordSet: boolean;
  coverChosen: boolean;
  gradient: string;
  recipients: { email: string; status: 'sent' | 'opened'; at: string }[];
};

const seedGalleries: Gallery[] = [
  { id: 'andi-romano', name: 'Andi & Romano', client: 'Andi and Romano', date: 'Jun 28, 2026', project: 'Weddings', videos: 7, photos: 48, views: '142', status: 'delivered', access: 'Password', passwordSet: true, coverChosen: true, gradient: 'linear-gradient(135deg,#281628,#86572f 46%,#d8b36c)', recipients: [{ email: 'andi@example.com', status: 'opened', at: 'Jun 29, 9:14 AM' }] },
  { id: 'keira-nolan', name: 'Keira & Nolan', client: 'Keira and Nolan', date: 'Jun 27, 2026', project: 'Weddings', videos: 5, photos: 32, views: '89', status: 'published', access: 'Public', passwordSet: false, coverChosen: true, gradient: 'linear-gradient(135deg,#111827,#536f8f 48%,#e7d3a1)', recipients: [] },
  { id: 'alexis-nick', name: 'Alexis & Nick', client: 'Alexis and Nick', date: 'Jun 25, 2026', project: 'Engagements', videos: 4, photos: 24, views: '203', status: 'delivered', access: 'Public', passwordSet: false, coverChosen: true, gradient: 'linear-gradient(135deg,#21152f,#6d4d91 48%,#f1a85f)', recipients: [{ email: 'alexis@example.com', status: 'sent', at: 'Jun 26, 3:31 PM' }] },
  { id: 'jeanie-nick', name: 'Jeanie & Nick Wedding', client: 'Jeanie and Nick', date: 'Jun 22, 2026', project: 'Weddings', videos: 0, photos: 60, views: '0', status: 'draft', access: 'Password', passwordSet: false, coverChosen: false, gradient: 'linear-gradient(135deg,#19120f,#714332 48%,#c99655)', recipients: [] },
  { id: 'sofia-marco', name: 'Sofia & Marco', client: 'Sofia and Marco', date: 'Jun 18, 2026', project: 'Portraits', videos: 2, photos: 40, views: '28', status: 'published', archived: true, access: 'Private', passwordSet: false, coverChosen: true, gradient: 'linear-gradient(135deg,#10131d,#32566f 50%,#c9a86a)', recipients: [] },
];

const videos = ['Wedding Film', 'Ceremony Highlight', 'Sneak Peek', 'Reception Speeches', 'Vertical Teaser', 'Getting Ready', 'Love Teaser'];
const albumNames = ['Portraits', 'Ceremony', 'Reception', 'Details'];
const gradients = [
  'linear-gradient(135deg,#281628,#86572f 46%,#d8b36c)',
  'linear-gradient(135deg,#111827,#536f8f 48%,#e7d3a1)',
  'linear-gradient(135deg,#21152f,#6d4d91 48%,#f1a85f)',
  'linear-gradient(135deg,#19120f,#714332 48%,#c99655)',
  'linear-gradient(135deg,#15121f,#516b55 48%,#d6c28a)',
  'linear-gradient(135deg,#100f16,#8d4a3c 46%,#ffb24d)',
];

function statusMeta(status: GalleryStatus) {
  if (status === 'delivered') return { label: 'Delivered', className: 'status status-green' };
  if (status === 'published') return { label: 'Published', className: 'status status-blue' };
  return { label: 'Draft', className: 'status status-amber' };
}

function navClass(on: boolean) {
  return `ld-nav ${on ? 'is-active' : ''}`;
}

function subNavClass(on: boolean) {
  return `studio-nav ${on ? 'is-active' : ''}`;
}

export function ClaudeDashboard({ onBack, onSignUp }: Props) {
  const [theme, setTheme] = useState<Theme>('dark');
  const [view, setView] = useState<View>('galleries');
  const [studioTab, setStudioTab] = useState<StudioTab>('videos');
  const [folder, setFolder] = useState<string | null>(null);
  const [archiveTab, setArchiveTab] = useState<'active' | 'archived'>('active');
  const [query, setQuery] = useState('');
  const [galleries, setGalleries] = useState(seedGalleries);
  const [activeId, setActiveId] = useState('andi-romano');
  const [newOpen, setNewOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [toast, setToast] = useState('');
  const [clientTheme, setClientTheme] = useState<Theme>('dark');
  const [accent, setAccent] = useState('#FFB24D');
  const [selectedPhotos, setSelectedPhotos] = useState<string[]>([]);

  const activeGallery = galleries.find((g) => g.id === activeId) ?? galleries[0];
  const visibleGalleries = useMemo(() => galleries.filter((g) => {
    if (archiveTab === 'archived' && !g.archived) return false;
    if (archiveTab === 'active' && g.archived) return false;
    if (folder && g.project !== folder) return false;
    const needle = `${g.name} ${g.client} ${g.date}`.toLowerCase();
    return !query || needle.includes(query.toLowerCase());
  }), [archiveTab, folder, galleries, query]);

  const showToast = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(''), 2200);
  };

  const openGallery = (id: string, tab: StudioTab = 'videos') => {
    setActiveId(id);
    setStudioTab(tab);
    setView('studio');
  };

  const archiveGallery = (id: string) => {
    setGalleries((prev) => prev.map((g) => g.id === id ? { ...g, archived: !g.archived } : g));
    showToast('Gallery updated');
  };

  const createGallery = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const name = String(data.get('name') || 'Untitled gallery');
    const project = String(data.get('project') || 'Weddings') as Gallery['project'];
    const access = String(data.get('access') || 'Private') as Gallery['access'];
    const gallery: Gallery = {
      id: name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || `gallery-${Date.now()}`,
      name,
      client: String(data.get('client') || name),
      date: String(data.get('date') || 'Just now'),
      project,
      videos: 0,
      photos: 0,
      views: '0',
      status: 'draft',
      access,
      passwordSet: access !== 'Password' ? false : Boolean(data.get('password')),
      coverChosen: false,
      gradient: gradients[galleries.length % gradients.length],
      recipients: [],
    };
    setGalleries((prev) => [gallery, ...prev]);
    setActiveId(gallery.id);
    setNewOpen(false);
    setView('upload');
    showToast(`Gallery "${name}" created`);
  };

  const sendDelivery = () => {
    if (!activeGallery.videos) {
      showToast('Add at least one film to deliver');
      return;
    }
    setGalleries((prev) => prev.map((g) => g.id === activeGallery.id ? {
      ...g,
      status: 'delivered',
      recipients: [...g.recipients, { email: 'client@example.com', status: 'sent', at: 'Just now' }],
    } : g));
    showToast('Delivery sent');
  };

  const preflight = [
    { ok: activeGallery.access !== 'Password' || activeGallery.passwordSet, label: activeGallery.access === 'Password' ? 'Password is set' : 'Access is set' },
    { ok: activeGallery.videos > 0, label: activeGallery.videos > 0 ? `${activeGallery.videos} films added` : 'Add at least one film' },
    { ok: activeGallery.coverChosen, label: activeGallery.coverChosen ? 'Cover selected' : 'Choose a cover' },
  ];

  return (
    <div className={`lanterna-app ${theme}`}>
      <aside className="ld-sidebar">
        <button className="brand-block" onClick={() => { setView('galleries'); setFolder(null); }}>
          <LanternLogo size={42} />
          <span>
            <strong>Lanterna</strong>
            <small>Retrosound Films</small>
          </span>
        </button>

        <button className={navClass(view === 'galleries' && !folder)} onClick={() => { setView('galleries'); setFolder(null); }}>
          <Grid2X2 size={18} /> <span>All Galleries</span> <em>{galleries.length}</em>
        </button>

        <div className="nav-label">Projects</div>
        {(['Weddings', 'Engagements', 'Portraits'] as const).map((name) => (
          <button key={name} className={navClass(view === 'galleries' && folder === name)} onClick={() => { setView('galleries'); setFolder(name); }}>
            <i /> <span>{name}</span> <em>{galleries.filter((g) => g.project === name).length}</em>
          </button>
        ))}

        <div className="sidebar-rule" />
        <button className={navClass(view === 'vendor')} onClick={() => setView('vendor')}>
          <SlidersHorizontal size={18} /> <span>Vendor Dashboard</span>
        </button>
        <div className="sidebar-spacer" />
        <button className="user-card" onClick={() => setView('account')}>
          <b>C</b>
          <span><strong>Cassie Moore</strong><small>demo@retrosound.com</small></span>
          <ChevronRight size={16} />
        </button>
      </aside>

      <main className="ld-main">
        {view === 'galleries' && (
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
                  <button className={theme === 'dark' ? 'on' : ''} onClick={() => setTheme('dark')}>Dark</button>
                  <button className={theme === 'light' ? 'on' : ''} onClick={() => setTheme('light')}>Light</button>
                </div>
                <button className="primary" onClick={() => setNewOpen(true)}><Plus size={17} /> New Gallery</button>
              </div>
            </header>

            <div className="stats-grid">
              <Stat icon={<PanelLeft size={20} />} value={String(galleries.length)} label="Total galleries" />
              <Stat icon={<Film size={20} />} value={String(galleries.reduce((sum, g) => sum + g.videos, 0))} label="Total videos" />
              <Stat icon={<Eye size={20} />} value="1.2k" label="Total views" />
              <Stat icon={<HardDrive size={20} />} value="24.6 / 50 GB" label="Upload allowance" />
            </div>

            <div className="controls-row">
              <div className="tabs">
                <button className={archiveTab === 'active' ? 'on' : ''} onClick={() => setArchiveTab('active')}>Active</button>
                <button className={archiveTab === 'archived' ? 'on' : ''} onClick={() => setArchiveTab('archived')}>Archived</button>
              </div>
              <div className="search-sort">
                <label><Search size={15} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search galleries, clients..." /></label>
                <button><ListChecks size={15} /> Last updated</button>
              </div>
            </div>
            <p className="count-label">{visibleGalleries.length} {archiveTab} galleries</p>

            {visibleGalleries.length === 0 ? (
              <div className="empty-state">
                <LanternLogo size={64} />
                <h2>No galleries here yet</h2>
                <p>Create a client gallery and start uploading films and photos.</p>
                <button className="primary" onClick={() => setNewOpen(true)}><Plus size={17} /> New Gallery</button>
              </div>
            ) : (
              <div className="gallery-grid">
                {visibleGalleries.map((gallery) => {
                  const meta = statusMeta(gallery.status);
                  return (
                    <article className="gallery-card" key={gallery.id}>
                      <button className="gallery-click" onClick={() => openGallery(gallery.id)}>
                        <div className="thumb" style={{ background: gallery.gradient }}>
                          <span className="video-pill"><Play size={13} fill="currentColor" /> {gallery.videos} videos</span>
                          <span className={meta.className}>{meta.label}</span>
                        </div>
                        <div className="card-body">
                          <h3>{gallery.name}</h3>
                          <p>{gallery.date}<span><Eye size={14} />{gallery.views}</span></p>
                        </div>
                      </button>
                      <button className="kebab" onClick={() => archiveGallery(gallery.id)} aria-label="Archive or restore gallery"><MoreHorizontal size={19} /></button>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {view === 'studio' && (
          <section>
            <header className="studio-header">
              <div className="crumb">
                <button onClick={() => setView('galleries')}><ArrowLeft size={16} /> Back</button>
                <LanternLogo size={22} />
                <span>Galleries</span><em>/</em><strong>{activeGallery.name}</strong>
                <span className={statusMeta(activeGallery.status).className}>{statusMeta(activeGallery.status).label}</span>
              </div>
              <div className="header-actions">
                {studioTab === 'videos' && <button className="secondary" onClick={() => setView('upload')}><Plus size={16} /> Add Video</button>}
                {studioTab === 'photos' && <button className="secondary" onClick={() => setView('upload')}><Plus size={16} /> Add Photos</button>}
                <button className="primary" disabled={!activeGallery.videos} onClick={() => setStudioTab('deliver')}><Send size={16} /> Deliver</button>
              </div>
            </header>

            <div className="studio-layout">
              <nav className="studio-sidebar">
                <small>Upload</small>
                <button className={subNavClass(studioTab === 'videos')} onClick={() => setStudioTab('videos')}><Film size={17} /> Videos <em>{activeGallery.videos}</em></button>
                <button className={subNavClass(studioTab === 'photos')} onClick={() => setStudioTab('photos')}><Image size={17} /> Photos <em>{activeGallery.photos}</em></button>
                <small>Design</small>
                <button className={subNavClass(studioTab === 'layout')} onClick={() => setStudioTab('layout')}><Layout size={17} /> Layout</button>
                <button className={subNavClass(studioTab === 'heading')} onClick={() => setStudioTab('heading')}><Wand2 size={17} /> Heading</button>
                <button className={subNavClass(studioTab === 'background')} onClick={() => setStudioTab('background')}><Image size={17} /> Background</button>
                <button className={subNavClass(studioTab === 'music')} onClick={() => setStudioTab('music')}><Music size={17} /> Music</button>
                <button className={subNavClass(studioTab === 'styles')} onClick={() => setStudioTab('styles')}><Palette size={17} /> Styles</button>
                <small>Publish</small>
                <button className={subNavClass(studioTab === 'settings')} onClick={() => setStudioTab('settings')}><Settings size={17} /> Settings</button>
                <button className={subNavClass(studioTab === 'deliver')} onClick={() => setStudioTab('deliver')}><Send size={17} /> Deliver</button>
              </nav>

              <div className="studio-content">
                {studioTab === 'videos' && (
                  <>
                    <div className="section-line"><span>{activeGallery.videos} films in this gallery</span></div>
                    {activeGallery.videos === 0 ? (
                      <button className="studio-empty" onClick={() => setView('upload')}>
                        <LanternLogo size={48} />
                        <strong>No films yet</strong>
                        <span>Upload the couple's films and they will appear here.</span>
                      </button>
                    ) : (
                      <div className="video-grid">
                        {videos.slice(0, activeGallery.videos).map((title, index) => (
                          <article className="video-card" key={title}>
                            <button onClick={() => setDetailOpen(true)}>
                              <div className="thumb" style={{ background: gradients[index % gradients.length] }}><span className="play-round"><Play size={18} fill="currentColor" /></span><em>{index + 2}:4{index}</em></div>
                              <h3>{title}</h3>
                              <p>Updated today</p>
                            </button>
                            <button aria-label="Video actions"><MoreHorizontal size={18} /></button>
                          </article>
                        ))}
                      </div>
                    )}
                  </>
                )}

                {studioTab === 'photos' && (
                  <div>
                    <div className="notice"><Image size={17} /> Films & photos live in this one gallery — one client link, one delivery record.</div>
                    <div className="chip-row">
                      {['All', ...albumNames].map((album) => <button key={album}>{album} <span>{album === 'All' ? activeGallery.photos : Math.floor(activeGallery.photos / 4)}</span></button>)}
                      <button className="dashed"><Plus size={14} /> New album</button>
                      <button className="select-mode" onClick={() => setSelectedPhotos(selectedPhotos.length ? [] : ['1', '2'])}><Check size={14} /> {selectedPhotos.length ? 'Cancel' : 'Select'}</button>
                    </div>
                    <div className="masonry">
                      <button className="add-photo"><Upload size={22} /> Add photos</button>
                      {Array.from({ length: 15 }).map((_, i) => <button key={i} className={selectedPhotos.includes(String(i)) ? 'photo-tile selected' : 'photo-tile'} style={{ background: gradients[i % gradients.length], aspectRatio: i % 3 === 0 ? '3/4' : i % 3 === 1 ? '1/1' : '4/3' }} />)}
                    </div>
                    {selectedPhotos.length > 0 && <div className="floating-bar">{selectedPhotos.length} selected <button>Move to...</button></div>}
                  </div>
                )}

                {(['layout', 'heading', 'background', 'music', 'styles'] as StudioTab[]).includes(studioTab) && (
                  <div className="design-grid">
                    <DesignPanel tab={studioTab} clientTheme={clientTheme} setClientTheme={setClientTheme} accent={accent} setAccent={setAccent} />
                    <LivePreview gallery={activeGallery} clientTheme={clientTheme} accent={accent} />
                  </div>
                )}

                {studioTab === 'settings' && (
                  <div className="settings-stack">
                    <Panel title="Gallery details">
                      <label>Gallery name<input defaultValue={activeGallery.name} /></label>
                      <label>Gallery link<div className="readonly"><Link2 size={15} /> deliver.retrosoundfilms.com/{activeGallery.id}</div></label>
                    </Panel>
                    <Panel title="Access">
                      <div className="segmented wide">{['Public', 'Password', 'Private'].map((item) => <button key={item} className={activeGallery.access === item ? 'on' : ''}>{item}</button>)}</div>
                      {activeGallery.access === 'Password' && <label>Gallery password<input placeholder={activeGallery.passwordSet ? 'Password set' : 'Set a password'} /></label>}
                      <Toggle title="Allow downloads" />
                      <Toggle title="Auto-expire gallery" />
                    </Panel>
                  </div>
                )}

                {studioTab === 'deliver' && (
                  <div className="deliver-stack">
                    <Panel title={activeGallery.videos ? 'Ready to deliver' : 'Delivery blocked'}>
                      <p className="muted">{activeGallery.videos ? 'Run the final preflight and send the gallery.' : 'Add at least one film before publishing or sending.'}</p>
                      <div className="preflight">
                        {preflight.map((item) => <div key={item.label} className={item.ok ? 'ok' : 'warn'}>{item.ok ? <Check size={16} /> : <Lock size={16} />}{item.label}</div>)}
                      </div>
                    </Panel>
                    <Panel title="Delivery link">
                      <div className="copy-field">deliver.retrosoundfilms.com/{activeGallery.id}<button onClick={() => showToast('Copied link')}><Copy size={15} /> Copy</button></div>
                      <label>Send to clients<input placeholder="client@email.com, planner@email.com" /></label>
                      <label>Optional message<textarea placeholder="A short note for the couple..." /></label>
                      <button className="primary" disabled={!activeGallery.videos} onClick={sendDelivery}><Send size={16} /> Send to clients</button>
                    </Panel>
                    <Panel title="Delivery history">
                      {activeGallery.recipients.length ? activeGallery.recipients.map((r) => <div className="recipient" key={r.email}><span>{r.email}<small>{r.status} · {r.at}</small></span><button>Resend</button></div>) : <p className="muted">No deliveries sent yet.</p>}
                    </Panel>
                  </div>
                )}
              </div>
            </div>
          </section>
        )}

        {view === 'upload' && (
          <section className="page-shell">
            <header className="studio-header">
              <div className="crumb"><button onClick={() => openGallery(activeGallery.id)}><ArrowLeft size={16} /> Back</button><strong>Uploading to {activeGallery.name}</strong></div>
              <button className="secondary" onClick={() => openGallery(activeGallery.id)}>Open gallery</button>
            </header>
            <div className="upload-drop">
              <LanternLogo size={54} />
              <h2>Drop films or photos to upload</h2>
              <p>Browser uploads will go directly to Cloudflare once the worker is wired.</p>
              <button className="primary" onClick={() => showToast('Upload queue mocked for now')}><Upload size={17} /> Select files</button>
            </div>
            <div className="queue">
              {['wedding-film-master.mov', 'ceremony-highlight.mp4', 'reception-gallery.zip'].map((file, index) => <div className="queue-row" key={file}><span>{file}<small>{index === 2 ? 'Optimizing photos' : 'Processing video'}</small></span><div><i style={{ width: `${72 - index * 18}%` }} /></div><button>{index === 0 ? 'Pause' : 'Resume'}</button></div>)}
            </div>
          </section>
        )}

        {view === 'vendor' && <VendorView accent={accent} setAccent={setAccent} />}
        {view === 'account' && <AccountView />}
      </main>

      {newOpen && <NewGalleryModal onClose={() => setNewOpen(false)} onCreate={createGallery} />}
      {detailOpen && <VideoDrawer gallery={activeGallery} onClose={() => setDetailOpen(false)} />}
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

function Stat({ icon, value, label }: { icon: React.ReactNode; value: string; label: string }) {
  return <div className="stat-card"><span>{icon}</span><strong>{value}</strong><small>{label}</small></div>;
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="panel"><h2>{title}</h2>{children}</section>;
}

function Toggle({ title }: { title: string }) {
  const [on, setOn] = useState(true);
  return <button className="toggle-row" onClick={() => setOn(!on)}><span>{title}</span><i className={on ? 'on' : ''}><b /></i></button>;
}

function DesignPanel({ tab, clientTheme, setClientTheme, accent, setAccent }: { tab: StudioTab; clientTheme: Theme; setClientTheme: (theme: Theme) => void; accent: string; setAccent: (accent: string) => void }) {
  return (
    <Panel title={tab[0].toUpperCase() + tab.slice(1)}>
      {tab === 'layout' && <div className="template-grid">{['Atrium', 'Lumina', 'Marquee', 'Vista'].map((item) => <button key={item}><div /><span>{item}</span></button>)}</div>}
      {tab === 'heading' && <><label>Title<input defaultValue="Andi & Romano" /></label><label>Subtitle<input defaultValue="A summer wedding film" /></label></>}
      {tab === 'background' && <><div className="segmented wide"><button className="on">Image</button><button>Video</button></div><div className="upload-mini"><Upload size={20} /> Upload background</div></>}
      {tab === 'music' && <><div className="music-row"><Music size={18} /><span>First dance.wav<small>Uploaded track</small></span></div><label>Featured film<select defaultValue="Wedding Film"><option>Wedding Film</option><option>Ceremony Highlight</option></select></label></>}
      {tab === 'styles' && <><div className="segmented wide"><button className={clientTheme === 'dark' ? 'on' : ''} onClick={() => setClientTheme('dark')}>Dark</button><button className={clientTheme === 'light' ? 'on' : ''} onClick={() => setClientTheme('light')}>Light</button></div><div className="swatches">{['#FFB24D', '#FF7A2F', '#C9A86A', '#7BC47F', '#7AA7E8'].map((c) => <button key={c} className={accent === c ? 'selected' : ''} style={{ background: c }} onClick={() => setAccent(c)} />)}</div><Toggle title="Share" /><Toggle title="Embed" /><Toggle title="Download" /></>}
    </Panel>
  );
}

function LivePreview({ gallery, clientTheme, accent }: { gallery: Gallery; clientTheme: Theme; accent: string }) {
  return (
    <aside className="preview-wrap">
      <div className="preview-label">Live preview <span>Updating as you edit</span></div>
      <div className={`client-preview ${clientTheme}`} style={{ ['--client-accent' as string]: accent, background: gallery.gradient }}>
        <div className="browser-dots"><i /><i /><i /><span>deliver.retrosoundfilms.com/{gallery.id}</span></div>
        <div className="preview-content">
          <header><span><LanternLogo size={26} /> Retrosound Films</span><nav><b>Share</b><b>Download</b></nav></header>
          <main><h2>{gallery.name}</h2><p>A cinematic client gallery for {gallery.client}</p><button><Play size={14} fill="currentColor" /> Watch film</button></main>
          <footer>{[0, 1, 2].map((i) => <i key={i} style={{ background: gradients[i] }} />)}</footer>
        </div>
      </div>
    </aside>
  );
}

function NewGalleryModal({ onClose, onCreate }: { onClose: () => void; onCreate: (event: React.FormEvent<HTMLFormElement>) => void }) {
  return (
    <div className="modal-backdrop">
      <form className="modal-card" onSubmit={onCreate}>
        <button type="button" className="modal-close" onClick={onClose}><X size={18} /></button>
        <h2>New Gallery</h2>
        <p>Create the gallery before uploading so every file lands in the right client space.</p>
        <label>Gallery name<input name="name" autoFocus required placeholder="Andi & Romano Wedding Film" /></label>
        <label>Client / couple<input name="client" placeholder="Andi and Romano" /></label>
        <label>Event date<input name="date" type="date" /></label>
        <label>Project type<select name="project"><option>Weddings</option><option>Engagements</option><option>Portraits</option></select></label>
        <label>Access<select name="access"><option>Private</option><option>Password</option><option>Public</option></select></label>
        <label>Password<input name="password" placeholder="Only needed for password access" /></label>
        <button className="primary" type="submit"><Plus size={17} /> Create gallery</button>
      </form>
    </div>
  );
}

function VideoDrawer({ gallery, onClose }: { gallery: Gallery; onClose: () => void }) {
  return (
    <div className="drawer-backdrop">
      <button className="drawer-close" onClick={onClose}><X size={17} /> Close</button>
      <section className="video-drawer">
        <p>{gallery.name} · Film 1 of {Math.max(gallery.videos, 1)}</p>
        <div className="drawer-hero" style={{ background: gallery.gradient }}><button><Play size={26} fill="currentColor" /></button><input defaultValue="Wedding Film" maxLength={80} /></div>
        <div className="drawer-actions"><button><Share2 size={15} /> Share</button><button><Link2 size={15} /> Embed</button><button><Download size={15} /> Download</button><button><Upload size={15} /> Replace video</button><button className="primary">Save changes</button></div>
        <div className="drawer-body"><Panel title="Thumbnail"><div className="filmstrip">{gradients.slice(0, 6).map((g) => <button key={g} style={{ background: g }} />)}</div><button className="secondary"><Upload size={15} /> Upload your own image</button></Panel><Panel title="Details"><Toggle title="Public in gallery" /><Toggle title="Allow download" /><label>Tags<input defaultValue="ceremony, vows" /></label><button className="danger"><Trash2 size={15} /> Delete film</button></Panel></div>
      </section>
    </div>
  );
}

function VendorView({ accent, setAccent }: { accent: string; setAccent: (accent: string) => void }) {
  return <section className="page-shell vendor-page"><header className="page-header"><div><p>Branding & delivery</p><h1>Vendor Dashboard</h1></div></header><div className="design-grid"><Panel title="Studio profile"><label>Studio name<input defaultValue="Retrosound Films" /></label><label>Tagline<input defaultValue="Wedding films, delivered beautifully" /></label><button className="secondary"><Upload size={15} /> Replace logo</button><h3>Brand accent</h3><div className="swatches">{['#FFB24D', '#FF7A2F', '#C9A86A', '#7BC47F', '#7AA7E8'].map((c) => <button key={c} className={accent === c ? 'selected' : ''} style={{ background: c }} onClick={() => setAccent(c)} />)}</div><Toggle title="Allow downloads" /><Toggle title="Password protect" /></Panel><LivePreview gallery={seedGalleries[0]} clientTheme="dark" accent={accent} /></div></section>;
}

function AccountView() {
  return <section className="page-shell"><header className="page-header"><div><p>Profile, billing, storage</p><h1>Account</h1></div></header><div className="settings-stack"><Panel title="Plan & billing"><div className="usage-bar"><span><b style={{ width: '49%' }} /></span><p>24.6 / 50 GB upload allowance used this period</p></div><button className="primary">Upgrade plan</button></Panel><Panel title="Team"><div className="recipient"><span>Cassie Moore<small>Owner · demo@retrosound.com</small></span><button>Invite collaborator</button></div></Panel></div></section>;
}
