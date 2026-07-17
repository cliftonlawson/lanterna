import {
  Check,
  ChevronRight,
  Eye,
  Lock,
  Play,
  Shield,
  Share2,
  Upload,
  Zap,
} from 'lucide-react';
import { useState } from 'react';
import { LanternLogo } from '../components/LanternLogo';

type Props = {
  onGetStarted: () => void;
  onSignIn: () => void;
  onTryDemo: () => void;
};

type PricingTab = 'sub' | 'blocks';

type Plan = {
  badge?: string;
  cta: string;
  desc: string;
  featured?: boolean;
  name: string;
  price: string;
  rows: Array<{ label: string; value: string }>;
  unit: string;
};

const features = [
  {
    desc: 'Drag and drop your videos. We prepare every file and deliver it automatically.',
    icon: Upload,
    title: 'Upload in seconds',
  },
  {
    desc: 'Clients receive a stunning, branded gallery link. No app download. No login required.',
    icon: Share2,
    title: 'Beautiful client galleries',
  },
  {
    desc: 'Get real-time notifications when clients open and view their videos.',
    icon: Eye,
    title: 'Know when they watch',
  },
  {
    desc: 'Your galleries load quickly and preserve full quality wherever clients watch.',
    icon: Zap,
    title: 'Lightning fast delivery',
  },
  {
    desc: 'Password-protect galleries, set expiry dates, and control download permissions.',
    icon: Shield,
    title: 'Secure by default',
  },
  {
    desc: 'Films start quickly and play smoothly on every device.',
    icon: Play,
    title: 'Cinema-quality viewing',
  },
];

const sellTypes = ['Ceremony films', 'Full speeches', 'Rehearsal cuts', 'Vertical reels', 'Extended edits'];

const subscriptionPlans: Plan[] = [
  {
    cta: 'Start free trial',
    desc: 'For solo studios shipping a handful of polished deliveries.',
    name: 'Starter',
    price: '19',
    rows: [
      { label: 'Annual upload allowance', value: '100 GB' },
      { label: 'Workspace access', value: '1 user' },
    ],
    unit: '/mo',
  },
  {
    badge: 'Best fit',
    cta: 'Start free trial',
    desc: 'For steady wedding seasons with room for films, photos, and guest media.',
    featured: true,
    name: 'Pro',
    price: '39',
    rows: [
      { label: 'Annual upload allowance', value: '300 GB' },
      { label: 'Workspace access', value: '1 user' },
    ],
    unit: '/mo',
  },
  {
    cta: 'Start free trial',
    desc: 'For teams that need more annual upload room and shared access.',
    name: 'Studio',
    price: '59',
    rows: [
      { label: 'Annual upload allowance', value: '600 GB' },
      { label: 'Workspace access', value: '2 users' },
    ],
    unit: '/mo',
  },
];

const storagePlans: Plan[] = [
  {
    cta: 'Buy block',
    desc: 'For one-off projects, quieter seasons, or studios that want to buy only what they need.',
    name: '50 GB block',
    price: '50',
    rows: [
      { label: 'Annual storage', value: '50 GB' },
      { label: 'Plan type', value: 'No subscription' },
    ],
    unit: '/yr',
  },
  {
    badge: 'Flexible',
    cta: 'Buy block',
    desc: 'A flexible block for several film-first deliveries without a monthly plan.',
    featured: true,
    name: '100 GB block',
    price: '100',
    rows: [
      { label: 'Annual storage', value: '100 GB' },
      { label: 'Plan type', value: 'No subscription' },
    ],
    unit: '/yr',
  },
  {
    cta: 'Buy block',
    desc: 'Best value for busy seasons when you still do not want a subscription.',
    name: '500 GB block',
    price: '450',
    rows: [
      { label: 'Annual storage', value: '500 GB' },
      { label: 'Plan type', value: 'No subscription' },
    ],
    unit: '/yr',
  },
];

export function Landing({ onGetStarted, onSignIn, onTryDemo }: Props) {
  const [pricingTab, setPricingTab] = useState<PricingTab>('sub');
  const subscription = pricingTab === 'sub';
  const plans = subscription ? subscriptionPlans : storagePlans;

  return (
    <div className="landing-page">
      <div className="landing-glow" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>

      <nav className="landing-nav" aria-label="Landing navigation">
        <a className="landing-brand" href="#top" aria-label="LANTERNA home">
          <LanternLogo size={36} />
          <span>LANTERNA</span>
        </a>
        <div className="landing-nav-links">
          <a href="#features">Features</a>
          <a href="#pricing">Pricing</a>
          <a href="#footer">Blog</a>
        </div>
        <div className="landing-nav-actions">
          <button className="landing-ghost" onClick={onTryDemo}>Explore LANTERNA</button>
          <button className="landing-ghost" onClick={onSignIn}>Sign in</button>
          <button className="landing-primary small" onClick={onGetStarted}>Get started</button>
        </div>
      </nav>

      <main id="top">
        <section className="landing-hero">
          <h1>
            Deliver your films
            <span>like never before</span>
          </h1>
          <p>
            LANTERNA is the simplest way for filmmakers to share videos and photos with clients.
            Upload, organize, and deliver - to a gallery that feels like a premier, not a folder.
          </p>
          <div className="landing-hero-actions">
            <button className="landing-primary" onClick={onGetStarted}>
              Start for free <ChevronRight size={17} />
            </button>
            <button className="landing-demo" onClick={onTryDemo}>
              <span><Play size={12} fill="currentColor" /></span>
              Explore the workspace
            </button>
          </div>
          <HeroGalleryMockup />
        </section>

        <section className="landing-trust" aria-label="Trusted by">
          <p>Trusted by filmmakers worldwide</p>
          <div>
            {['Retrosound Films', 'Golden Hour Co.', 'Dusk & Dawn Studios', 'Meridian Films', 'Luminary Pictures'].map((name) => (
              <span key={name}>{name}</span>
            ))}
          </div>
        </section>

        <section className="landing-section" id="features">
          <header className="landing-section-head">
            <h2>
              Everything you need.
              <span>Nothing you don't.</span>
            </h2>
            <p>Built for filmmakers who want to focus on their craft, not their workflow.</p>
          </header>
          <div className="landing-feature-grid">
            {features.map((feature) => {
              const Icon = feature.icon;
              return (
                <article className="landing-feature-card" key={feature.title}>
                  <span><Icon size={19} /></span>
                  <h3>{feature.title}</h3>
                  <p>{feature.desc}</p>
                </article>
              );
            })}
          </div>
        </section>

        <section className="landing-monetize">
          <div className="landing-bronze-glow" aria-hidden="true" />
          <div className="landing-monetize-inner">
            <div className="landing-monetize-copy">
              <p>Monetize</p>
              <h2>
                Make money on
                <span>LANTERNA</span>
              </h2>
              <p>
                Offer ceremony films, full speeches, rehearsal cuts, vertical reels, and extended edits as
                paid bonus films - unlocked right inside the gallery your couples already love. You set the
                price; we handle checkout and pay out to your studio.
              </p>
              <div>
                {sellTypes.map((type) => <span key={type}>{type}</span>)}
              </div>
              <footer>
                <button className="landing-primary" onClick={onGetStarted}>Start selling</button>
                <span><Check size={16} /> Keep 90% of every unlock.</span>
              </footer>
            </div>
            <PaidUnlockGraphic />
          </div>
        </section>

        <section className="landing-pricing" id="pricing">
          <div className="landing-pricing-toggle" role="tablist" aria-label="Pricing type">
            <button className={subscription ? 'active' : ''} onClick={() => setPricingTab('sub')} role="tab" aria-selected={subscription}>Subscription</button>
            <button className={!subscription ? 'active' : ''} onClick={() => setPricingTab('blocks')} role="tab" aria-selected={!subscription}>Annual storage blocks</button>
          </div>
          <header className="landing-pricing-head">
            <p>{subscription ? 'Subscription' : 'No subscription'}</p>
            <h2>{subscription ? 'For studios with steady delivery volume.' : 'Buy annual storage only when you need it.'}</h2>
            <span>{subscription ? 'Every plan starts with a 14-day free trial. No card required.' : 'Pay once per year for the room you need - no recurring plan.'}</span>
          </header>
          <div className="landing-plan-grid">
            {plans.map((plan) => <PlanCard key={plan.name} onChoose={onGetStarted} plan={plan} />)}
          </div>
          <p className="landing-footnote">
            {subscription
              ? 'Subscriptions and storage blocks control new upload capacity, not the total number of past galleries in your account. Storage blocks are an alternative to monthly plans, and 5GB top-ups unlock after your first block purchase.'
              : 'The moat: tiny top-ups after a real block. Buy any 50GB+ block, then add 5GB anytime for $5/year.'}
          </p>
        </section>

        <section className="landing-final-cta">
          <div aria-hidden="true" />
          <LanternLogo size={56} />
          <h2>
            Ready to illuminate
            <span>your client experience?</span>
          </h2>
          <p>Join thousands of filmmakers delivering their best work through LANTERNA.</p>
          <button className="landing-primary" onClick={onGetStarted}>Get started for free</button>
        </section>
      </main>

      <footer className="landing-footer" id="footer">
        <a className="landing-footer-brand" href="#top">
          <LanternLogo size={24} />
          <span>LANTERNA</span>
        </a>
        <p>© 2026 LANTERNA. All rights reserved.</p>
        <nav aria-label="Footer links">
          <a href="#footer">Privacy</a>
          <a href="#footer">Terms</a>
          <a href="#footer">Support</a>
        </nav>
      </footer>
    </div>
  );
}

function HeroGalleryMockup() {
  return (
    <div className="landing-gallery-mockup">
      <div className="landing-browser-bar">
        <i /><i /><i />
        <span>lanterna.film/emma-and-james</span>
      </div>
      <div className="landing-lumen-demo">
        <div className="landing-feature-tag">FEATURE FILM · 16:9</div>
        <header>
          <span><i />Nightingale Films</span>
          <nav><b>Share</b><b>Download</b></nav>
        </header>
        <section>
          <small>THE WEDDING FILM</small>
          <h2>Emma & James</h2>
          <div>
            <button><Play size={14} fill="currentColor" />Play All Films</button>
            <span>14 June 2025 · Villa Cimbrone, Ravello</span>
          </div>
        </section>
        <div className="landing-film-row">
          {[
            ['The Full Film', '6:42'],
            ['Ceremony', '24:10'],
            ['Reception', '38:55'],
          ].map(([title, duration], index) => (
            <article className={index === 0 ? 'active' : ''} key={title}>
              <b>{duration}</b>
              <span>{title}</span>
            </article>
          ))}
        </div>
      </div>
    </div>
  );
}

function PaidUnlockGraphic() {
  return (
    <div className="landing-paid-graphic">
      <div className="landing-payout-badge">
        <span>$</span>
        <div><strong>You receive $270</strong><small>per unlock · 90% payout</small></div>
      </div>
      <div className="landing-paid-card">
        <header><i /><strong>Emma & James</strong><em>·</em><span>Films</span></header>
        <div className="landing-paid-grid">
          <article className="landing-locked-tile">
            <div className="landing-price-chip"><Lock size={12} />$300</div>
            <section>
              <span><Lock size={21} /></span>
              <small>BONUS EDIT</small>
              <h3>Speeches Film</h3>
              <p>22:10 · full, uncut toasts</p>
            </section>
            <button><Lock size={14} />Unlock for $300</button>
          </article>
          {['Ceremony', 'Highlight Film'].map((title) => (
            <article className="landing-included-tile" key={title}>
              <span><Play size={13} fill="currentColor" /></span>
              <p>{title}</p>
            </article>
          ))}
        </div>
      </div>
    </div>
  );
}

function PlanCard({ onChoose, plan }: { onChoose: () => void; plan: Plan }) {
  return (
    <article className={`landing-plan-card ${plan.featured ? 'featured' : ''}`}>
      {plan.badge && <span className="landing-plan-badge">{plan.badge}</span>}
      <div>
        <h3>{plan.name}</h3>
        <p>{plan.desc}</p>
        <div><strong>${plan.price}</strong><span>{plan.unit}</span></div>
      </div>
      <section>
        {plan.rows.map((row) => (
          <div key={row.label}>
            <small>{row.label}</small>
            <span>{row.value}</span>
          </div>
        ))}
      </section>
      <button onClick={onChoose}>{plan.cta}</button>
    </article>
  );
}
