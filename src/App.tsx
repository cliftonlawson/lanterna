import { useEffect, useState } from 'react';
import { AuthProvider } from './contexts/AuthContext';
import { useAuth } from './contexts/useAuth';
import { Landing } from './pages/Landing';
import { Auth } from './pages/Auth';
import { Dashboard } from './pages/Dashboard';
import { DemoDashboard } from './pages/DemoDashboard';
import { PublicGalleryPage } from './pages/PublicGalleryPage';

type Screen = 'landing' | 'auth' | 'dashboard' | 'demo';

function AppInner() {
  const { user, loading } = useAuth();
  const [screen, setScreen] = useState<Screen>(initialScreen);
  const publicSlug = publicGallerySlug();
  const landingRoute = window.location.pathname === '/landing';

  useEffect(() => {
    if (user && window.location.pathname === '/auth') {
      window.history.replaceState({}, '', '/');
    }
    if (user && screen === 'auth') {
      setScreen('dashboard');
    }
  }, [user, screen]);

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
        onGetStarted={() => setScreen('auth')}
        onTryDemo={() => setScreen('demo')}
      />
    );
  }

  // Authenticated flow
  if (user) {
    return <Dashboard />;
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
      onGetStarted={() => setScreen('auth')}
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

export default function App() {
  return (
    <AuthProvider>
      <AppInner />
    </AuthProvider>
  );
}
