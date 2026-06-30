import { Play, Upload, Share2, Eye, Zap, Shield, ChevronRight, Check } from 'lucide-react';
import { LanternLogo } from '../components/LanternLogo';

type Props = {
  onGetStarted: () => void;
  onTryDemo: () => void;
};

const features = [
  {
    icon: Upload,
    title: 'Upload in seconds',
    desc: 'Drag and drop your videos. We handle encoding, compression, and delivery automatically.',
  },
  {
    icon: Share2,
    title: 'Beautiful client galleries',
    desc: 'Clients receive a stunning, branded gallery link. No app download. No login required.',
  },
  {
    icon: Eye,
    title: 'Know when they watch',
    desc: 'Get real-time notifications when clients open and view their videos.',
  },
  {
    icon: Zap,
    title: 'Lightning fast delivery',
    desc: 'Global CDN delivers your work at full quality, no matter where your client is.',
  },
  {
    icon: Shield,
    title: 'Secure by default',
    desc: 'Password-protect galleries, set expiry dates, and control download permissions.',
  },
  {
    icon: Play,
    title: 'Cinema-quality playback',
    desc: 'Adaptive streaming ensures smooth, buffer-free playback on every device.',
  },
];

const plans = [
  {
    name: 'Starter',
    price: '19',
    desc: 'Perfect for independent filmmakers just getting started.',
    storage: '50 GB',
    galleries: '10',
    features: ['Unlimited video uploads', 'Client gallery sharing', 'Email notifications', 'Basic analytics'],
    cta: 'Start free trial',
    highlight: false,
  },
  {
    name: 'Pro',
    price: '49',
    desc: 'For growing studios delivering consistent, professional work.',
    storage: '500 GB',
    galleries: 'Unlimited',
    features: ['Everything in Starter', 'Custom branding', 'Password protection', 'Download controls', 'Priority support'],
    cta: 'Start free trial',
    highlight: true,
  },
  {
    name: 'Studio',
    price: '99',
    desc: 'Built for high-volume studios with demanding clients.',
    storage: '2 TB',
    galleries: 'Unlimited',
    features: ['Everything in Pro', 'White-label galleries', 'Team collaboration', 'API access', 'Dedicated support'],
    cta: 'Contact sales',
    highlight: false,
  },
];

export function Landing({ onGetStarted, onTryDemo }: Props) {
  return (
    <div className="min-h-screen bg-[#080808] text-white overflow-x-hidden">
      {/* Background glow */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[900px] h-[600px] bg-orange-500/[0.06] rounded-full blur-[120px]" />
        <div className="absolute top-1/3 left-1/4 w-[400px] h-[400px] bg-orange-600/[0.04] rounded-full blur-[100px]" />
        <div className="absolute top-1/2 right-1/4 w-[300px] h-[300px] bg-amber-500/[0.03] rounded-full blur-[80px]" />
      </div>

      {/* Nav */}
      <nav className="relative z-10 flex items-center justify-between px-8 py-5 max-w-7xl mx-auto">
        <div className="flex items-center gap-2.5">
          <LanternLogo size={36} />
          <span className="text-xl font-semibold tracking-tight">Lanterna</span>
        </div>
        <div className="hidden md:flex items-center gap-8 text-sm text-gray-400">
          <a href="#features" className="hover:text-white transition-colors">Features</a>
          <a href="#pricing" className="hover:text-white transition-colors">Pricing</a>
          <a href="#" className="hover:text-white transition-colors">Blog</a>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onTryDemo}
            className="text-sm text-gray-400 hover:text-gray-200 transition-colors px-4 py-2 rounded-lg hover:bg-white/[0.04]"
          >
            Try demo
          </button>
          <button
            onClick={onGetStarted}
            className="text-sm text-gray-400 hover:text-gray-200 transition-colors px-4 py-2 rounded-lg hover:bg-white/[0.04]"
          >
            Sign in
          </button>
          <button
            onClick={onGetStarted}
            className="text-sm bg-orange-500 hover:bg-orange-400 text-white px-4 py-2 rounded-lg font-medium transition-all hover:shadow-[0_0_20px_rgba(249,115,22,0.4)]"
          >
            Get started
          </button>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative z-10 text-center px-6 pt-20 pb-32 max-w-5xl mx-auto">
        <div className="inline-flex items-center gap-2 text-xs bg-orange-500/10 border border-orange-500/20 text-orange-400 px-3.5 py-1.5 rounded-full mb-8">
          <span className="w-1.5 h-1.5 bg-orange-400 rounded-full animate-pulse" />
          Now in public beta — free for the first 3 months
        </div>

        <h1 className="text-5xl md:text-7xl font-bold tracking-tight leading-[1.08] mb-6">
          Deliver your films<br />
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-orange-400 to-amber-300">
            like never before
          </span>
        </h1>

        <p className="text-lg md:text-xl text-gray-400 max-w-2xl mx-auto leading-relaxed mb-10">
          Lanterna is the simplest way for filmmakers to share videos with clients.
          Upload, organize, and deliver — in minutes, not hours.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <button
            onClick={onGetStarted}
            className="group flex items-center gap-2 bg-orange-500 hover:bg-orange-400 text-white px-7 py-3.5 rounded-xl font-semibold text-base transition-all hover:shadow-[0_0_40px_rgba(249,115,22,0.5)]"
          >
            Start for free
            <ChevronRight size={16} className="group-hover:translate-x-0.5 transition-transform" />
          </button>
          <button
            onClick={onTryDemo}
            className="group flex items-center gap-2.5 text-gray-300 hover:text-white px-6 py-3.5 rounded-xl border border-white/10 hover:border-orange-500/30 hover:bg-orange-500/[0.05] transition-all text-sm font-medium"
          >
            <div className="w-8 h-8 bg-orange-500/10 border border-orange-500/20 rounded-full flex items-center justify-center group-hover:bg-orange-500/20 transition-colors">
              <Play size={12} fill="currentColor" className="text-orange-400 ml-0.5" />
            </div>
            Try the demo
          </button>
        </div>

        {/* Hero visual */}
        <div className="mt-20 relative">
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-[#080808] pointer-events-none z-10" />
          <div className="relative rounded-2xl overflow-hidden border border-white/[0.08] shadow-[0_0_80px_rgba(249,115,22,0.15)]">
            {/* Mock dashboard UI */}
            <div className="bg-[#111010] p-0">
              {/* Top bar */}
              <div className="flex items-center justify-between px-5 py-3 border-b border-white/[0.06] bg-[#0d0d0d]">
                <div className="flex items-center gap-3">
                  <LanternLogo size={20} />
                  <span className="text-sm font-medium text-gray-300">Studio Dashboard</span>
                  <span className="text-white/20 mx-1">·</span>
                  <span className="text-sm text-gray-500">Retrosound Films</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full bg-orange-500/20 border border-orange-500/30 flex items-center justify-center">
                    <span className="text-[10px] text-orange-400 font-bold">R</span>
                  </div>
                </div>
              </div>

              {/* Content area */}
              <div className="flex" style={{ height: '340px' }}>
                {/* Sidebar */}
                <div className="w-48 border-r border-white/[0.06] bg-[#0d0d0d] p-3 flex-shrink-0">
                  <div className="text-[10px] text-gray-600 uppercase tracking-wider mb-2 px-2">Projects</div>
                  {['Weddings', 'Engagements', 'Portraits'].map((item, i) => (
                    <div
                      key={item}
                      className={`flex items-center gap-2 px-2 py-1.5 rounded-lg mb-0.5 text-xs ${i === 0 ? 'bg-orange-500/10 text-orange-400' : 'text-gray-500 hover:text-gray-300'}`}
                    >
                      <div className={`w-1.5 h-1.5 rounded-full ${i === 0 ? 'bg-orange-400' : 'bg-gray-600'}`} />
                      {item}
                    </div>
                  ))}
                </div>

                {/* Gallery grid */}
                <div className="flex-1 p-4 overflow-hidden">
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-sm font-medium text-gray-200">Weddings</span>
                    <div className="text-[10px] bg-orange-500 text-white px-2.5 py-1 rounded-lg font-medium">+ New Gallery</div>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { name: 'Andi & Romano', img: 'https://images.pexels.com/photos/3014856/pexels-photo-3014856.jpeg?auto=compress&cs=tinysrgb&w=400', date: 'Jun 4' },
                      { name: 'Keira & Nolan', img: 'https://images.pexels.com/photos/2959192/pexels-photo-2959192.jpeg?auto=compress&cs=tinysrgb&w=400', date: 'Jun 2' },
                      { name: 'Alexis & Nick', img: 'https://images.pexels.com/photos/1024960/pexels-photo-1024960.jpeg?auto=compress&cs=tinysrgb&w=400', date: 'Jun 9' },
                      { name: 'Jeanie & Nick', img: 'https://images.pexels.com/photos/3014853/pexels-photo-3014853.jpeg?auto=compress&cs=tinysrgb&w=400', date: 'Jun 11' },
                      { name: 'Addie & Seve', img: 'https://images.pexels.com/photos/1589216/pexels-photo-1589216.jpeg?auto=compress&cs=tinysrgb&w=400', date: 'May 25' },
                      { name: 'Emma & James', img: 'https://images.pexels.com/photos/1128318/pexels-photo-1128318.jpeg?auto=compress&cs=tinysrgb&w=400', date: 'May 18' },
                    ].map((g) => (
                      <div key={g.name} className="group rounded-lg overflow-hidden border border-white/[0.06] hover:border-orange-500/30 transition-all cursor-pointer">
                        <div className="relative aspect-video bg-gray-900">
                          <img src={g.img} alt={g.name} className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" />
                          <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                            <div className="w-7 h-7 bg-orange-500/90 rounded-full flex items-center justify-center">
                              <Play size={10} fill="white" className="text-white ml-0.5" />
                            </div>
                          </div>
                        </div>
                        <div className="px-2 py-1.5 bg-[#111010]">
                          <p className="text-[10px] font-medium text-gray-300 truncate">{g.name}</p>
                          <p className="text-[9px] text-gray-600">Updated · {g.date}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Logos */}
      <section className="relative z-10 py-12 border-y border-white/[0.05]">
        <div className="max-w-5xl mx-auto px-6 text-center">
          <p className="text-sm text-gray-600 mb-8">Trusted by filmmakers worldwide</p>
          <div className="flex items-center justify-center gap-10 flex-wrap">
            {['Retrosound Films', 'Golden Hour Co.', 'Dusk & Dawn Studios', 'Meridian Films', 'Luminary Pictures'].map((name) => (
              <span key={name} className="text-sm font-medium text-gray-600 hover:text-gray-400 transition-colors">{name}</span>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="relative z-10 py-28 px-6 max-w-7xl mx-auto">
        <div className="text-center mb-16">
          <h2 className="text-4xl md:text-5xl font-bold tracking-tight mb-4">
            Everything you need.<br />
            <span className="text-gray-500">Nothing you don't.</span>
          </h2>
          <p className="text-gray-400 text-lg max-w-xl mx-auto">
            Built for filmmakers who want to focus on their craft, not their workflow.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {features.map(({ icon: Icon, title, desc }) => (
            <div
              key={title}
              className="group p-6 rounded-2xl border border-white/[0.07] bg-white/[0.02] hover:bg-white/[0.04] hover:border-orange-500/20 transition-all duration-300"
            >
              <div className="w-10 h-10 bg-orange-500/10 border border-orange-500/20 rounded-xl flex items-center justify-center mb-4 group-hover:bg-orange-500/15 transition-colors">
                <Icon size={18} className="text-orange-400" />
              </div>
              <h3 className="font-semibold text-gray-100 mb-2">{title}</h3>
              <p className="text-sm text-gray-500 leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="relative z-10 py-28 px-6 max-w-6xl mx-auto">
        <div className="text-center mb-16">
          <h2 className="text-4xl md:text-5xl font-bold tracking-tight mb-4">Simple pricing</h2>
          <p className="text-gray-400 text-lg">Start free. Scale when you're ready.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {plans.map((plan) => (
            <div
              key={plan.name}
              className={`relative rounded-2xl border p-7 flex flex-col ${
                plan.highlight
                  ? 'border-orange-500/40 bg-gradient-to-b from-orange-500/[0.08] to-transparent shadow-[0_0_60px_rgba(249,115,22,0.12)]'
                  : 'border-white/[0.08] bg-white/[0.02]'
              }`}
            >
              {plan.highlight && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <span className="bg-orange-500 text-white text-xs font-semibold px-3 py-1 rounded-full">Most popular</span>
                </div>
              )}
              <div className="mb-6">
                <h3 className="font-semibold text-gray-200 mb-1">{plan.name}</h3>
                <p className="text-sm text-gray-500 mb-4">{plan.desc}</p>
                <div className="flex items-end gap-1">
                  <span className="text-4xl font-bold text-white">${plan.price}</span>
                  <span className="text-gray-500 mb-1.5">/mo</span>
                </div>
              </div>

              <ul className="space-y-2.5 mb-7 flex-1">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-center gap-2.5 text-sm text-gray-400">
                    <Check size={14} className="text-orange-400 flex-shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>

              <button
                onClick={onGetStarted}
                className={`w-full py-2.5 rounded-xl font-medium text-sm transition-all ${
                  plan.highlight
                    ? 'bg-orange-500 hover:bg-orange-400 text-white hover:shadow-[0_0_30px_rgba(249,115,22,0.4)]'
                    : 'bg-white/[0.06] hover:bg-white/[0.1] text-gray-200 border border-white/[0.08]'
                }`}
              >
                {plan.cta}
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="relative z-10 py-28 px-6 text-center">
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-[600px] h-[300px] bg-orange-500/[0.06] rounded-full blur-[80px]" />
        </div>
        <div className="relative">
          <LanternLogo size={56} className="mx-auto mb-6" />
          <h2 className="text-4xl md:text-5xl font-bold tracking-tight mb-4">
            Ready to illuminate<br />your client experience?
          </h2>
          <p className="text-gray-400 text-lg mb-8 max-w-lg mx-auto">
            Join thousands of filmmakers delivering their best work through Lanterna.
          </p>
          <button
            onClick={onGetStarted}
            className="bg-orange-500 hover:bg-orange-400 text-white px-8 py-4 rounded-xl font-semibold text-base transition-all hover:shadow-[0_0_50px_rgba(249,115,22,0.5)]"
          >
            Get started for free
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 border-t border-white/[0.05] py-10 px-6">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <LanternLogo size={24} />
            <span className="text-sm font-medium text-gray-400">Lanterna</span>
          </div>
          <p className="text-sm text-gray-600">© 2026 Lanterna. All rights reserved.</p>
          <div className="flex gap-6 text-sm text-gray-600">
            <a href="#" className="hover:text-gray-400 transition-colors">Privacy</a>
            <a href="#" className="hover:text-gray-400 transition-colors">Terms</a>
            <a href="#" className="hover:text-gray-400 transition-colors">Support</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
