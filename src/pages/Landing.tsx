import {
  ArrowUpRight,
  Check,
  ChevronRight,
  Lock,
  Play,
} from 'lucide-react';
import { useState } from 'react';
import { LanternLogo } from '../components/LanternLogo';
import { BLOCK_PRODUCTS, formatAllowance, SUBSCRIPTION_TIERS, WELCOME_ALLOWANCE_GB } from '../shared/billingCatalog.js';

type Props = {
  onGetStarted: () => void;
  onChoosePlan: (sku: string) => void;
  onSignIn: () => void;
  onTryDemo: () => void;
};

type PricingTab = 'sub' | 'blocks';
type BillingCadence = 'monthly' | 'annual';

type Plan = {
  badge?: string;
  cta: string;
  desc: string;
  featured?: boolean;
  name: string;
  price: string;
  rows: Array<{ label: string; value: string }>;
  sku: string;
  unit: string;
};

const workflow = [
  {
    number: '01',
    title: 'Upload once',
    desc: 'Bring in films, photos, chosen thumbnails, and background music. LANTERNA prepares the delivery without exposing the machinery behind it.',
  },
  {
    number: '02',
    title: 'Direct the experience',
    desc: 'Choose a gallery layout, shape the typography and color, then preview exactly what your couple will receive on desktop and mobile.',
  },
  {
    number: '03',
    title: 'Send with confidence',
    desc: 'Deliver one polished link with permissions, passwords, downloads, viewing activity, and paid bonus films coming soon.',
  },
];

const sellTypes = ['Ceremony films', 'Full speeches', 'Rehearsal cuts', 'Vertical reels', 'Extended edits'];

const faqs = [
  {
    question: 'Can I try LANTERNA before I subscribe?',
    answer: `Yes. New studios receive ${formatAllowance(WELCOME_ALLOWANCE_GB)} of upload room for one year. No card is required to begin.`,
  },
  {
    question: 'Do I have to subscribe?',
    answer: 'No. Subscribe monthly or annually for recurring delivery volume, or buy a one-year upload block only when you need it.',
  },
  {
    question: 'What happens when my upload allowance resets?',
    answer: 'Subscription upload allowance refreshes each year and does not roll over. Your optimized client galleries remain accessible for 10 years.',
  },
  {
    question: 'How long can couples download original files?',
    answer: 'Original-quality downloads are available for one year. The optimized gallery experience remains available after that window.',
  },
  {
    question: 'Can I remove LANTERNA branding?',
    answer: 'White-label branding is included with every subscription. Studios using upload blocks can add white label for $149 per year.',
  },
  {
    question: 'How do paid bonus films work?',
    answer: 'Paid bonus films are coming soon. Once live, you will choose the film, set the price, and offer it inside the same client gallery. A 10% LANTERNA fee will apply, plus Stripe processing fees.',
  },
];

function subscriptionPlans(cadence: BillingCadence): Plan[] {
  return SUBSCRIPTION_TIERS.map((tier) => {
    const price = cadence === 'annual' ? tier.annual : tier.monthly;
    return {
      badge: tier.featured ? 'Best fit' : undefined,
      cta: `Choose ${tier.name}`,
      desc: tier.description,
      featured: tier.featured,
      name: tier.name,
      price: (price.amountCents / 100).toLocaleString('en-US'),
      rows: [
        { label: 'Annual upload allowance', value: formatAllowance(tier.allowanceGb) },
        { label: 'Billing', value: cadence === 'annual' ? 'Once per year' : 'Monthly' },
        { label: 'White-label branding', value: 'Included' },
      ],
      sku: price.sku,
      unit: cadence === 'annual' ? '/yr' : '/mo',
    };
  });
}

const storagePlans: Plan[] = BLOCK_PRODUCTS.map((block) => ({
  badge: block.featured ? 'Flexible' : undefined,
  cta: 'Buy block',
  desc: block.description,
  featured: block.featured,
  name: block.name,
  price: (block.amountCents / 100).toLocaleString('en-US'),
  rows: [
    { label: 'Upload allowance', value: formatAllowance(block.allowanceGb) },
    { label: 'Valid for', value: '1 year' },
    { label: 'White-label add-on', value: '$149/year' },
  ],
  sku: block.sku,
  unit: ' once',
}));

export function Landing({ onChoosePlan, onGetStarted, onSignIn, onTryDemo }: Props) {
  const [pricingTab, setPricingTab] = useState<PricingTab>('sub');
  const [billingCadence, setBillingCadence] = useState<BillingCadence>('monthly');
  const subscription = pricingTab === 'sub';
  const plans = subscription ? subscriptionPlans(billingCadence) : storagePlans;

  return (
    <div className="landing-page">
      <div className="landing-glow" aria-hidden="true"><span /><span /></div>

      <nav className="landing-nav" aria-label="Landing navigation">
        <a className="landing-brand" href="#top" aria-label="LANTERNA home">
          <LanternLogo size={36} />
          <span>LANTERNA</span>
        </a>
        <div className="landing-nav-links">
          <a href="#gallery">Galleries</a>
          <a href="#workflow">How it works</a>
          <a href="#pricing">Pricing</a>
        </div>
        <div className="landing-nav-actions">
          <button className="landing-ghost" onClick={onSignIn} type="button">Sign in</button>
          <button className="landing-primary small" onClick={onGetStarted} type="button">Start free</button>
        </div>
      </nav>

      <main id="top">
        <section className="landing-hero">
          <div className="landing-hero-copy">
            <p className="landing-eyebrow">Wedding film + photo delivery</p>
            <h1><span>Illuminate</span> every delivery.</h1>
            <p>
              LANTERNA gives wedding filmmakers a cinematic home for every film and photograph—
              so the client experience feels as considered as the work itself.
            </p>
            <div className="landing-hero-actions">
              <button className="landing-primary" onClick={onGetStarted} type="button">
                Start free with {formatAllowance(WELCOME_ALLOWANCE_GB)} <ChevronRight size={17} />
              </button>
              <button className="landing-demo" onClick={onTryDemo} type="button">
                <Play size={14} fill="currentColor" /> Explore the workspace
              </button>
            </div>
            <small className="landing-welcome-note">No card required <i /> Welcome allowance valid for one year</small>
          </div>

          <div className="landing-gallery-stage" id="gallery">
            <div className="landing-gallery-intro">
              <div><span>Gallery 01</span><strong>Lumen</strong></div>
              <button onClick={onTryDemo} type="button">Explore this layout <ArrowUpRight size={16} /></button>
            </div>
            <HeroGalleryMockup />
          </div>
        </section>

        <section className="landing-proof-strip" aria-label="LANTERNA product facts">
          <article><strong>{formatAllowance(WELCOME_ALLOWANCE_GB)}</strong><span>Free for your first year</span></article>
          <article><strong>9</strong><span>Gallery layouts included</span></article>
          <article><strong>10 years</strong><span>Optimized gallery access</span></article>
        </section>

        <section className="landing-statement" aria-label="The LANTERNA promise">
          <p>A delivery link should feel like the <em>final scene</em>, not a file transfer.</p>
        </section>

        <section className="landing-section landing-workflow" id="workflow">
          <header className="landing-section-head">
            <p className="landing-eyebrow">The workflow</p>
            <h2>From final export to <span>felt experience.</span></h2>
            <p>LANTERNA carries the technical weight so your work can arrive with calm, clarity, and intention.</p>
          </header>
          <div className="landing-feature-grid">
            {workflow.map((feature) => (
              <article className="landing-feature-card" key={feature.title}>
                <span>{feature.number}</span>
                <h3>{feature.title}</h3>
                <p>{feature.desc}</p>
              </article>
            ))}
          </div>
          <button className="landing-section-link" onClick={onTryDemo} type="button">Explore the workspace <ArrowUpRight size={16} /></button>
        </section>

        <section className="landing-monetize">
          <div className="landing-monetize-inner">
            <div className="landing-monetize-copy">
              <p className="landing-eyebrow">Paid bonus films</p>
              <div className="landing-coming-soon-banner"><span>Coming soon</span><p>Film sales are in final payout review. Galleries and delivery are available now.</p></div>
              <h2>One gallery can hold <span>more value.</span></h2>
              <p>
                Soon you can offer ceremony films, speeches, reels, and extended edits as paid additions
                inside the gallery your couple already knows. You set the price; LANTERNA handles checkout.
              </p>
              <div>{sellTypes.map((type) => <span key={type}>{type}</span>)}</div>
              <footer>
                <button className="landing-primary" onClick={onGetStarted} type="button">Start free</button>
                <span><Check size={16} /> 10% LANTERNA fee per unlock.</span>
              </footer>
            </div>
            <PaidUnlockGraphic />
          </div>
        </section>

        <section className="landing-pricing" id="pricing">
          <header className="landing-pricing-head">
            <p className="landing-eyebrow">Simple by design</p>
            <h2>Choose steady capacity or <span>buy only what you need.</span></h2>
            <p>Subscriptions for recurring delivery. One-year upload blocks for everyone else.</p>
          </header>
          <div className="landing-pricing-toggle" role="tablist" aria-label="Pricing type">
            <button className={subscription ? 'active' : ''} onClick={() => setPricingTab('sub')} role="tab" aria-selected={subscription} type="button">Subscription</button>
            <button className={!subscription ? 'active' : ''} onClick={() => setPricingTab('blocks')} role="tab" aria-selected={!subscription} type="button">Upload blocks</button>
          </div>
          {subscription && (
            <div className="landing-billing-cadence" aria-label="Billing cadence" role="group">
              <button className={billingCadence === 'monthly' ? 'active' : ''} onClick={() => setBillingCadence('monthly')} type="button">Monthly</button>
              <button className={billingCadence === 'annual' ? 'active' : ''} onClick={() => setBillingCadence('annual')} type="button">Annual</button>
            </div>
          )}
          <div className="landing-plan-grid">
            {plans.map((plan) => <PlanCard key={plan.name} onChoose={onChoosePlan} plan={plan} />)}
          </div>
          <p className="landing-footnote">
            {subscription
              ? 'Upload allowance refreshes each year and does not roll over. Add 5 GB anytime for $5; top-ups expire at the same annual reset. Every plan includes white-label branding. Original-quality downloads are available for one year, while optimized client galleries remain accessible for 10 years. Applicable taxes are calculated at checkout.'
              : 'Blocks are valid for one year and do not renew automatically. Galleries carry LANTERNA branding unless you add white label for $149/year. After any 50 GB+ block, add 5 GB top-ups for $5. Applicable taxes are calculated at checkout.'}
          </p>
        </section>

        <section className="landing-faq" aria-labelledby="landing-faq-title">
          <header>
            <p className="landing-eyebrow">Before you begin</p>
            <h2 id="landing-faq-title">The practical details.</h2>
          </header>
          <div>
            {faqs.map((faq) => (
              <details key={faq.question}>
                <summary>{faq.question}<span aria-hidden="true">+</span></summary>
                <p>{faq.answer}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="landing-final-cta">
          <div aria-hidden="true" />
          <LanternLogo size={56} />
          <p className="landing-eyebrow">Your next delivery</p>
          <h2>Ready to illuminate<br /><span>{' '}the handoff?</span></h2>
          <p>Give your next wedding a gallery worthy of the films inside it.</p>
          <button className="landing-primary" onClick={onGetStarted} type="button">Start free with {formatAllowance(WELCOME_ALLOWANCE_GB)}</button>
        </section>
      </main>

      <footer className="landing-footer">
        <a className="landing-footer-brand" href="#top">
          <LanternLogo size={24} />
          <span>LANTERNA</span>
        </a>
        <p>Wedding films, delivered with light.</p>
        <nav aria-label="Footer navigation"><a href="#gallery">Galleries</a><a href="#pricing">Pricing</a><a href="/privacy">Privacy</a><a href="/terms">Terms</a><a href="/refunds">Refunds</a><a href="/support">Support</a></nav>
        <small>© 2026 LANTERNA</small>
      </footer>
    </div>
  );
}

function HeroGalleryMockup() {
  return (
    <div className="landing-gallery-mockup" aria-label="Lumen wedding gallery example">
      <div className="landing-browser-bar">
        <i /><i /><i />
        <span>deliver.lanterna.video/g/emma-and-james</span>
      </div>
      <div className="landing-lumen-demo">
        <img
          alt="Bride and groom walking together outdoors"
          className="landing-lumen-hero"
          decoding="async"
          height={941}
          src="/landing/lumen-hero.jpg"
          width={1672}
        />
        <div className="landing-feature-tag">FEATURE FILM · 16:9</div>
        <header>
          <span><i />Retrosound Films</span>
          <nav aria-label="Gallery example actions"><b>Share</b><b>Download</b></nav>
        </header>
        <section>
          <small>THE WEDDING FILM</small>
          <h2>Emma &amp; James</h2>
          <div>
            <span className="landing-gallery-play"><Play size={14} fill="currentColor" />Play All Films</span>
            <span>14 June 2026 · Villa Cimbrone, Ravello</span>
          </div>
        </section>
        <div className="landing-film-row">
          {[
            {
              alt: 'Bride and groom kissing outdoors',
              duration: '1:12',
              height: 992,
              src: '/landing/lumen-teaser.jpg',
              title: 'Teaser',
              width: 1586,
            },
            {
              alt: 'Bride and groom posing with the bride\'s veil in motion',
              duration: '6:42',
              height: 941,
              src: '/landing/lumen-feature-film.jpg',
              title: 'Feature Film',
              width: 1672,
            },
            {
              alt: 'Newlyweds walking through guests after their ceremony',
              duration: '24:10',
              height: 992,
              src: '/landing/lumen-ceremony-presentation.jpg',
              title: 'Ceremony Presentation',
              width: 1586,
            },
          ].map((film, index) => (
            <article className={index === 0 ? 'active' : ''} key={film.title}>
              <img
                alt={film.alt}
                className="landing-film-image"
                decoding="async"
                height={film.height}
                loading="lazy"
                src={film.src}
                width={film.width}
              />
              <b>{film.duration}</b><span>{film.title}</span>
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
        <span>$</span><div><strong>$270 studio share at launch</strong><small>on a $300 unlock · before Stripe fees</small></div>
      </div>
      <div className="landing-paid-card">
        <header><i /><strong>Sofia &amp; Bennett</strong><em>·</em><span>Films</span></header>
        <div className="landing-paid-grid">
          <article className="landing-locked-tile">
            <img
              alt="Floral wedding ceremony arch overlooking the countryside"
              className="landing-paid-film-image"
              decoding="async"
              height={992}
              loading="lazy"
              src="/landing/paid-ceremony-film.jpg"
              width={1586}
            />
            <div className="landing-price-chip"><Lock size={12} />$300</div>
            <section><span><Lock size={21} /></span><small>BONUS FILM</small><h3>Ceremony Film</h3><p>42:18 · full ceremony presentation</p></section>
            <span className="landing-unlock-button"><Lock size={14} />Coming soon · $300</span>
          </article>
          {[
            {
              alt: 'Bride walking down the aisle with her father',
              height: 933,
              src: '/landing/paid-highlight-film.jpg',
              title: 'Highlight Film',
              width: 1686,
            },
            {
              alt: 'Bride and groom walking together across a lawn',
              height: 992,
              src: '/landing/paid-teaser.jpg',
              title: 'Teaser',
              width: 1586,
            },
          ].map((film) => (
            <article className="landing-included-tile" key={film.title}>
              <img
                alt={film.alt}
                className="landing-paid-film-image"
                decoding="async"
                height={film.height}
                loading="lazy"
                src={film.src}
                width={film.width}
              />
              <span><Play size={13} fill="currentColor" /></span><p>{film.title}</p>
            </article>
          ))}
        </div>
      </div>
    </div>
  );
}

function PlanCard({ onChoose, plan }: { onChoose: (sku: string) => void; plan: Plan }) {
  return (
    <article className={`landing-plan-card ${plan.featured ? 'featured' : ''}`}>
      {plan.badge && <span className="landing-plan-badge">{plan.badge}</span>}
      <div><h3>{plan.name}</h3><p>{plan.desc}</p><div><strong>${plan.price}</strong><span>{plan.unit}</span></div></div>
      <section>
        {plan.rows.map((row) => <div key={row.label}><small>{row.label}</small><span>{row.value}</span></div>)}
      </section>
      <button onClick={() => onChoose(plan.sku)} type="button">{plan.cta}</button>
    </article>
  );
}
