import { useEffect, useState } from 'react';
import { AuthProvider } from './contexts/AuthContext';
import { useAuth } from './contexts/useAuth';
import { Landing } from './pages/Landing';
import { Auth } from './pages/Auth';
import { Dashboard } from './pages/Dashboard';
import { DemoDashboard } from './pages/DemoDashboard';
import { PublicGalleryPage } from './pages/PublicGalleryPage';

type Screen = 'landing' | 'auth' | 'dashboard' | 'demo';

const APP_ORIGIN = 'https://app.lanterna.video';
const DELIVERY_ORIGIN = 'https://deliver.lanterna.video';
const MARKETING_ORIGIN = 'https://lanterna.video';
const MARKETING_HOSTS = new Set(['lanterna.video', 'www.lanterna.video']);

function AppInner() {
  const { user, loading } = useAuth();
  const [screen, setScreen] = useState<Screen>(initialScreen);
  const publicSlug = publicGallerySlug();
  const landingRoute = window.location.pathname === '/landing';
  const redirectTarget = productionRedirectTarget(publicSlug);

  useEffect(() => {
    if (redirectTarget) {
      window.location.replace(redirectTarget);
    }
  }, [redirectTarget]);

  useEffect(() => {
    if (user && window.location.pathname === '/auth') {
      window.history.replaceState({}, '', '/');
    }
    if (user && screen === 'auth') {
      setScreen('dashboard');
    }
  }, [user, screen]);

  if (redirectTarget) {
    return null;
  }

  if (publicSlug) {
    return <PublicGalleryPage slug={publicSlug} />;
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#080808] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-2 border-orange-500/30 border-t-orange-500 rounded-full animate-spin" />
          <p className="text-sm text-gray-600">Loading LANTERNA...</p>
        </div>
      </div>
    );
  }

  if (landingRoute && screen === 'landing') {
    return (
      <Landing
        onGetStarted={() => openAuth('signup', setScreen)}
        onSignIn={() => openAuth('signin', setScreen)}
        onTryDemo={() => setScreen('demo')}
      />
    );
  }

  if (isMarketingHost()) {
    if (screen === 'demo') {
      return (
        <DemoDashboard
          onSignUp={() => openAuth('signup', setScreen)}
          onBack={() => setScreen('landing')}
        />
      );
    }

    return (
      <Landing
        onGetStarted={() => openAuth('signup', setScreen)}
        onSignIn={() => openAuth('signin', setScreen)}
        onTryDemo={() => setScreen('demo')}
      />
    );
  }

  // Authenticated flow
  if (user) {
    return <Dashboard />;
  }

  if (window.location.hostname === 'app.lanterna.video') {
    return <Auth onBack={() => window.location.assign(MARKETING_ORIGIN)} />;
  }

  // Demo mode — no auth required
  if (screen === 'demo') {
    return (
      <DemoDashboard
        onSignUp={() => setScreen('auth')}
        onBack={() => setScreen('landing')}
      />
    );
  }

  // Auth page
  if (screen === 'auth') {
    return <Auth onBack={() => setScreen('landing')} />;
  }

  // Landing page
  return (
    <Landing
      onGetStarted={() => openAuth('signup', setScreen)}
      onSignIn={() => openAuth('signin', setScreen)}
      onTryDemo={() => setScreen('demo')}
    />
  );
}

function initialScreen(): Screen {
  if (window.location.pathname === '/landing') return 'landing';
  if (window.location.pathname === '/auth') return 'auth';
  if (window.location.search.includes('auth=true')) return 'auth';
  if (window.location.search.includes('demo=true')) return 'demo';
  return 'landing';
}

function publicGallerySlug() {
  const match = window.location.pathname.match(/^\/(?:g|gallery)\/([^/]+)\/?$/);
  return match ? decodeURIComponent(match[1]) : '';
}

function isMarketingHost() {
  return MARKETING_HOSTS.has(window.location.hostname);
}

function openAuth(mode: 'signin' | 'signup', setScreen: (screen: Screen) => void) {
  if (isProductionHost()) {
    const query = mode === 'signup' ? '?mode=signup' : '';
    window.location.assign(`${APP_ORIGIN}/auth${query}`);
    return;
  }

  const query = mode === 'signup' ? '?mode=signup' : '';
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
    return publicSlug ? '' : MARKETING_ORIGIN;
  }

  if (hostname === 'app.lanterna.video') {
    if (publicSlug) return `${DELIVERY_ORIGIN}${galleryPath}`;
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
