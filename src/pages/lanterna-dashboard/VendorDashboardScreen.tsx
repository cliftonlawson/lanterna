import { Check, Globe2, Instagram, Linkedin, Play, Youtube } from 'lucide-react';
import { LanternLogo } from '../../components/LanternLogo';
import { displayDomain } from './publicLinks';
import { type WorkspaceAccount } from './model';

type Props = {
  workspace: WorkspaceAccount;
  onWorkspaceChange: (patch: Partial<WorkspaceAccount>) => void;
};

const accentOptions = [
  { color: '#6EE7F9', name: 'Cyan' },
  { color: '#7AA7E8', name: 'Blue' },
  { color: '#818CF8', name: 'Indigo' },
  { color: '#7BC47F', name: 'Green' },
  { color: '#9CC3E8', name: 'Ice' },
];

export function VendorDashboardScreen({ workspace, onWorkspaceChange }: Props) {
  const customDomain = workspace.customDomain?.trim() ?? '';
  const deliveryDomain = displayDomain(customDomain || 'deliver.lanterna.studio');

  return (
    <section className="page-shell vendor-page">
      <header className="page-header vendor-page-header">
        <div>
          <p>Branding &amp; delivery</p>
          <h1>Vendor Dashboard</h1>
          <span>Everything clients see when you deliver a film — your name, your mark, your domain.</span>
        </div>
      </header>

      <div className="vendor-layout">
        <div className="vendor-settings-stack">
          <section className="vendor-card vendor-profile-card">
            <header>
              <h2>Studio profile</h2>
              <p>As it appears on every client gallery</p>
            </header>
            <div className="vendor-profile-fields">
              <div className="vendor-logo-tile"><LanternLogo size={58} /></div>
              <div>
                <label>Studio name<input value={workspace.studioName} onChange={(event) => onWorkspaceChange({ studioName: event.target.value })} /></label>
                <label>Tagline<input value={workspace.tagline} onChange={(event) => onWorkspaceChange({ tagline: event.target.value })} /></label>
              </div>
            </div>
            <div className="vendor-autosave"><Check size={14} /> Changes save automatically</div>
          </section>

          <section className="vendor-card">
            <header>
              <h2>Brand accent</h2>
              <p>The glow that lights up your galleries</p>
            </header>
            <div className="vendor-accent-grid" aria-label="Brand accent color" role="group">
              {accentOptions.map(({ color, name }) => (
                <button
                  aria-pressed={workspace.accentColor === color}
                  className={workspace.accentColor === color ? 'selected' : ''}
                  key={color}
                  onClick={() => onWorkspaceChange({ accentColor: color })}
                  type="button"
                >
                  <i style={{ background: color, boxShadow: `0 0 14px ${color}` }} />
                  <span>{name}</span>
                </button>
              ))}
            </div>
          </section>

          <section className="vendor-card">
            <header>
              <h2>Custom domain</h2>
              <p>Deliver from your own address</p>
            </header>
            <label className="vendor-domain-input">
              <Globe2 size={18} />
              <input
                aria-label="Custom delivery domain"
                placeholder="deliver.yourstudio.com"
                value={workspace.customDomain ?? ''}
                onChange={(event) => onWorkspaceChange({ customDomain: event.target.value || null })}
              />
              <span><i />{customDomain ? 'Custom' : 'Included'}</span>
            </label>
            <p className="vendor-domain-help">Leave this blank to use deliver.lanterna.studio.</p>
          </section>

          <section className="vendor-card">
            <header>
              <h2>Client space</h2>
              <p>Choose what is available when a gallery opens</p>
            </header>
            <button
              aria-pressed={workspace.defaultDownloads}
              className="vendor-toggle-row"
              onClick={() => onWorkspaceChange({ defaultDownloads: !workspace.defaultDownloads })}
              type="button"
            >
              <span><strong>Allow downloads</strong><small>Let clients save delivered films by default</small></span>
              <i className={workspace.defaultDownloads ? 'on' : ''}><b /></i>
            </button>
          </section>
        </div>

        <aside className="vendor-preview-column">
          <div className="vendor-preview-label">Client preview <span>Updates as you edit</span></div>
          <div className="vendor-client-preview">
            <div className="vendor-preview-browser">
              <i /><i /><i />
              <span>{deliveryDomain}/g/client-gallery</span>
            </div>
            <div className="vendor-preview-body">
              <div className="vendor-preview-logo"><LanternLogo size={54} /></div>
              <h2>{workspace.studioName || 'Your studio'}</h2>
              <p>Client Gallery — Wedding Film</p>
              <span className="vendor-preview-tagline">{workspace.tagline}</span>
              <div className="vendor-preview-rule" />
              <span className="vendor-preview-cta" style={{ background: `linear-gradient(135deg, ${workspace.accentColor}, #818CF8)` }}><Play size={16} fill="currentColor" /> Watch your film</span>
              <div className="vendor-preview-socials" aria-hidden="true">
                <span><Linkedin size={16} /></span><span><Instagram size={16} /></span><span><Youtube size={17} /></span>
              </div>
              <small><LanternLogo size={14} /> Powered by LANTERNA</small>
            </div>
          </div>
        </aside>
      </div>
    </section>
  );
}
