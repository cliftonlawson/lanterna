import { useState } from 'react';
import { ArrowLeft, Mail } from 'lucide-react';
import { ContactModal, SUPPORT_EMAIL } from '../components/ContactModal';
import { LanternLogo } from '../components/LanternLogo';

export type LegalPageKind = 'privacy' | 'refunds' | 'terms';

const pages: Record<LegalPageKind, { eyebrow: string; title: string; sections: Array<{ title: string; body: string }> }> = {
  privacy: {
    eyebrow: 'Legal',
    title: 'Privacy',
    sections: [
      { title: 'What we collect', body: 'We collect the account, studio, gallery, recipient, and activity information needed to operate LANTERNA. Uploaded films, photos, music, backgrounds, and thumbnails are stored only to provide the service you request.' },
      { title: 'How it is used', body: 'We use this information to authenticate your account, process and deliver galleries, report delivery activity, provide support, prevent abuse, and administer billing. We do not sell personal information.' },
      { title: 'Service providers', body: 'LANTERNA relies on Supabase for account and application data, Cloudflare for media storage and playback, Stripe for billing and payouts, and Resend for transactional email. Each provider processes only the information needed for its role.' },
      { title: 'Retention and deletion', body: 'Original-quality files remain available for the source-file window shown in your gallery. Optimized delivery copies may remain available for the longer gallery-access window. When you permanently delete a gallery or your account, LANTERNA removes its media and application records, subject to limited records retained by payment providers or required by law.' },
      { title: 'Your choices', body: 'You can edit or delete galleries in the dashboard. You may request access, correction, export, or deletion of personal information by contacting support.' },
    ],
  },
  terms: {
    eyebrow: 'Legal',
    title: 'Terms',
    sections: [
      { title: 'Your account', body: 'You are responsible for your login, workspace activity, and the people you invite. Keep account details accurate and tell us promptly if you suspect unauthorized access.' },
      { title: 'Your content', body: 'You retain ownership of content you upload. You grant LANTERNA the limited permission needed to store, process, display, and deliver it. You confirm that you have the rights and client permissions required to use the content.' },
      { title: 'Acceptable use', body: 'Do not upload unlawful, abusive, infringing, malicious, or deceptive content, attempt to bypass security or usage limits, or use LANTERNA to harm another person or system.' },
      { title: 'Billing and storage', body: 'Plan and upload allowances renew or expire as shown at checkout and in Account & billing. Upload top-ups supplement an active plan or block. White-label access is included with subscriptions and may be purchased for an eligible upload block.' },
      { title: 'Paid films', body: 'Studios choose which films to sell and set their prices. Stripe processes the payment and payout. LANTERNA deducts the platform fee displayed before the studio enables film sales; Stripe processing fees are separate.' },
      { title: 'Availability and changes', body: 'We work to keep LANTERNA reliable but cannot promise uninterrupted availability. We may suspend use that threatens the service or violates these terms. Material changes will be posted with an updated effective date.' },
    ],
  },
  refunds: {
    eyebrow: 'Legal',
    title: 'Refunds',
    sections: [
      { title: 'Subscriptions', body: 'You can manage or cancel a subscription from Account & billing. Cancellation takes effect at the end of the current paid period unless Stripe or applicable law requires a different result.' },
      { title: 'Upload blocks and add-ons', body: 'One-time upload blocks, top-ups, and white-label add-ons are generally non-refundable after the allowance or feature has been applied. Contact us if a charge was duplicated or a technical failure prevented delivery.' },
      { title: 'Paid films', body: 'The studio offering a paid film controls the customer relationship for that film. A refunded film purchase loses paid access once Stripe confirms the refund. LANTERNA support can help identify the studio or investigate a payment problem.' },
    ],
  },
};

export function LegalPage({ kind }: { kind: LegalPageKind }) {
  const page = pages[kind];
  const [contactOpen, setContactOpen] = useState(false);
  return (
    <div className="legal-page">
      <header className="legal-nav"><a href="/"><LanternLogo size={28} /><span>LANTERNA</span></a><a href="/"><ArrowLeft size={16} /> Home</a></header>
      <main>
        <p className="landing-eyebrow">{page.eyebrow}</p>
        <h1>{page.title}</h1>
        <p className="legal-updated">Effective July 20, 2026</p>
        <div className="legal-sections">{page.sections.map((section) => <section key={section.title}><h2>{section.title}</h2><p>{section.body}</p></section>)}</div>
        <button className="legal-contact" onClick={() => setContactOpen(true)} type="button"><Mail size={17} /> Contact {SUPPORT_EMAIL}</button>
      </main>
      <footer><span>© 2026 LANTERNA</span><nav><a href="/privacy">Privacy</a><a href="/terms">Terms</a><a href="/refunds">Refunds</a><button onClick={() => setContactOpen(true)} type="button">Contact</button></nav></footer>
      {contactOpen && <ContactModal onClose={() => setContactOpen(false)} />}
    </div>
  );
}

export function NotFoundPage() {
  return (
    <div className="legal-page">
      <header className="legal-nav"><a href="/"><LanternLogo size={28} /><span>LANTERNA</span></a></header>
      <main>
        <p className="landing-eyebrow">404</p>
        <h1>This page is out of frame.</h1>
        <p className="legal-updated">The address may have changed, or the page may no longer exist.</p>
        <a className="legal-contact" href="/"><ArrowLeft size={17} /> Return home</a>
      </main>
    </div>
  );
}
