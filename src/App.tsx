import { useEffect, useState } from 'react';
import { AuthProvider } from './contexts/AuthContext';
import { useAuth } from './contexts/useAuth';
import { Landing } from './pages/Landing';
import { Auth } from './pages/Auth';
import { Dashboard } from './pages/Dashboard';
import { PublicGalleryPage } from './pages/PublicGalleryPage';
import { LanternLogo } from './components/LanternLogo';
import { LegalPage, NotFoundPage, type LegalPageKind } from './pages/LegalPage';

type Screen = 'landing' | 'auth' | 'dashboard';

const APP_ORIGIN = 'https://app.lanterna.video';
const DELIVERY_ORIGIN = 'https://deliver.lanterna.video';
const MARKETING_ORIGIN = 'https://lanterna.video';
const MARKETING_HOSTS = new Set(['lanterna.video', 'www.lanterna.video']);

function AppInner() {
  const { user, loading, recoveryMode } = useAuth();
  const [screen, setScreen] = useState<Screen>(initialScreen);
  const publicSlug = publicGallerySlug();
  const landingRoute = window.location.pathname === '/landing' || window.location.pathname === '/support';
  const contactRequested = window.location.pathname === '/support' || new URLSearchParams(window.location.search).has('contact');
  const redirectTarget = productionRedirectTarget(publicSlug);
  const legalPage = legalPageKind();

  useEffect(() => {
    if (redirectTarget) {
      window.location.replace(redirectTarget);
    }
  }, [redirectTarget]);

  useEffect(() => {
    if (user && window.location.pathname === '/auth' && !recoveryMode) {
      window.history.replaceState({}, '', '/');
    }
    if (user && screen === 'auth' && !recoveryMode) {
      setScreen('dashboard');
    }
  }, [recoveryMode, user, screen]);

  if (redirectTarget) {
    return null;
  }

  if (publicSlug) {
    return <PublicGalleryPage slug={publicSlug} />;
  }

  if (legalPage) return <LegalPage kind={legalPage} />;

  if (isMarketingHost() && !['/', '/landing', '/support'].includes(window.location.pathname)) return <NotFoundPage />;

  if (loading) {
    return (
      <div className="app-loading">
        <div className="app-loading-glow" />
        <div className="app-loading-content">
          <LanternLogo size={40} />
          <div className="app-loading-spinner" />
          <p>Opening LANTERNA</p>
        </div>
      </div>
    );
  }

  if (landingRoute && screen === 'landing') {
    return (
      <Landing
        initialContactOpen={contactRequested}
        onChoosePlan={(sku) => openAuth('signup', setScreen, sku)}
        onGetStarted={() => openAuth('signup', setScreen)}
        onSignIn={() => openAuth('signin', setScreen)}
        onTryDemo={() => openAuth('signup', setScreen)}
      />
    );
  }

  if (isMarketingHost()) {
    return (
      <Landing
        initialContactOpen={contactRequested}
        onChoosePlan={(sku) => openAuth('signup', setScreen, sku)}
        onGetStarted={() => openAuth('signup', setScreen)}
        onSignIn={() => openAuth('signin', setScreen)}
        onTryDemo={() => openAuth('signup', setScreen)}
      />
    );
  }

  // Authenticated flow
  if (user && !recoveryMode) {
    return <Dashboard />;
  }

  if (window.location.hostname === 'app.lanterna.video') {
    return <Auth onBack={() => window.location.assign(MARKETING_ORIGIN)} />;
  }

  // Auth page
  if (screen === 'auth') {
    return <Auth onBack={() => setScreen('landing')} />;
  }

  // Landing page
  return (
    <Landing
      initialContactOpen={contactRequested}
      onChoosePlan={(sku) => openAuth('signup', setScreen, sku)}
      onGetStarted={() => openAuth('signup', setScreen)}
      onSignIn={() => openAuth('signin', setScreen)}
      onTryDemo={() => openAuth('signup', setScreen)}
    />
  );
}

function legalPageKind(): LegalPageKind | null {
  const value = window.location.pathname.replace(/^\/+|\/+$/g, '');
  return value === 'privacy' || value === 'terms' || value === 'refunds' ? value : null;
}

function initialScreen(): Screen {
  if (window.location.pathname === '/landing' || window.location.pathname === '/support') return 'landing';
  if (window.location.pathname === '/auth') return 'auth';
  if (window.location.search.includes('auth=true')) return 'auth';
  return 'landing';
}

function publicGallerySlug() {
  const match = window.location.pathname.match(/^\/(?:g|gallery)\/([^/]+)\/?$/);
  return match ? decodeURIComponent(match[1]) : '';
}

function isMarketingHost() {
  return MARKETING_HOSTS.has(window.location.hostname);
}

function openAuth(mode: 'signin' | 'signup', setScreen: (screen: Screen) => void, checkoutSku?: string) {
  const params = new URLSearchParams();
  if (mode === 'signup') params.set('mode', 'signup');
  if (checkoutSku) params.set('checkout', checkoutSku);
  const query = params.size ? `?${params.toString()}` : '';
  if (isProductionHost()) {
    window.location.assign(`${APP_ORIGIN}/auth${query}`);
    return;
  }

  window.history.replaceState({}, '', `/auth${query}`);
  setScreen('auth');
}

function isProductionHost() {
  return isMarketingHost()
    || window.location.hostname === 'app.lanterna.video'
    || window.location.hostname === 'deliver.lanterna.video';
}

function productionRedirectTarget(publicSlug: string) {
  const { hostname, pathname, search } = window.location;
  const galleryPath = `${pathname}${search}`;

  if (hostname === 'deliver.lanterna.video') {
    if (publicSlug) return '';
    return pathname === '/support' ? `${MARKETING_ORIGIN}/?contact=true` : MARKETING_ORIGIN;
  }

  if (hostname === 'app.lanterna.video') {
    if (publicSlug) return `${DELIVERY_ORIGIN}${galleryPath}`;
    if (pathname === '/support') return `${MARKETING_ORIGIN}/?contact=true`;
    if (pathname === '/landing') return MARKETING_ORIGIN;
    return '';
  }

  if (MARKETING_HOSTS.has(hostname)) {
    if (publicSlug) return `${DELIVERY_ORIGIN}${galleryPath}`;
    if (pathname === '/auth') return `${APP_ORIGIN}${pathname}${search}`;
  }

  return '';
}

export default function App() {
  return (
    <AuthProvider>
      <AppInner />
    </AuthProvider>
  );
}
