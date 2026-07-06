import { LivePreview } from './GalleryStudioScreen';
import { defaultDeliveryDraft, defaultGalleryDesign, mediaTileGradients, type DashboardGallery, type WorkspaceAccount } from './model';
import { Panel, Toggle } from './shared';

type Props = {
  workspace: WorkspaceAccount;
  onWorkspaceChange: (patch: Partial<WorkspaceAccount>) => void;
};

export function VendorDashboardScreen({ workspace, onWorkspaceChange }: Props) {
  const previewGallery: DashboardGallery = {
    id: 'brand-preview',
    slug: 'brand-preview',
    name: 'Client Gallery',
    client: 'Client',
    date: 'Just now',
    project: 'Weddings',
    videos: 1,
    photos: 3,
    views: '0',
    status: 'draft',
    access: 'Private',
    allowDownloads: workspace.defaultDownloads,
    autoExpire: false,
    passwordSet: false,
    coverChosen: true,
    deliveryDraft: defaultDeliveryDraft(''),
    gradient: mediaTileGradients[0],
    videoItems: [],
    albums: [],
    photoItems: [],
    recipients: [],
    design: {
      ...defaultGalleryDesign('Client Gallery', mediaTileGradients[0]),
      accent: workspace.accentColor,
    },
  };

  return (
    <section className="page-shell vendor-page">
      <header className="page-header">
        <div>
          <p>Branding & delivery</p>
          <h1>Vendor Dashboard</h1>
        </div>
      </header>

      <div className="design-grid">
        <Panel title="Studio profile">
          <label>Studio name<input value={workspace.studioName} onChange={(event) => onWorkspaceChange({ studioName: event.target.value })} /></label>
          <label>Tagline<input value={workspace.tagline} onChange={(event) => onWorkspaceChange({ tagline: event.target.value })} /></label>
          <label>Custom domain<input value={workspace.customDomain ?? ''} onChange={(event) => onWorkspaceChange({ customDomain: event.target.value || null })} /></label>
          <h3>Brand accent</h3>
          <div className="swatches">
            {['#FFB24D', '#FF7A2F', '#C9A86A', '#7BC47F', '#7AA7E8'].map((color) => (
              <button key={color} className={workspace.accentColor === color ? 'selected' : ''} style={{ background: color }} onClick={() => onWorkspaceChange({ accentColor: color })} />
            ))}
          </div>
          <Toggle title="Allow downloads" checked={workspace.defaultDownloads} onChange={(defaultDownloads) => onWorkspaceChange({ defaultDownloads })} />
        </Panel>

        <LivePreview gallery={previewGallery} workspace={workspace} />
      </div>
    </section>
  );
}
