import { useState } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { Landing } from './pages/Landing';
import { Auth } from './pages/Auth';
import { Dashboard } from './pages/Dashboard';
import { GalleryView } from './pages/GalleryView';
import { DemoDashboard } from './pages/DemoDashboard';
import { Gallery } from './lib/supabase';

type Screen = 'landing' | 'auth' | 'dashboard' | 'gallery' | 'demo';

function AppInner() {
  const { user, loading } = useAuth();
  const [screen, setScreen] = useState<Screen>('demo');
  const [activeGallery, setActiveGallery] = useState<Gallery | null>(null);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#080808] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-2 border-orange-500/30 border-t-orange-500 rounded-full animate-spin" />
          <p className="text-sm text-gray-600">Loading Lanterna...</p>
        </div>
      </div>
    );
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

  // Authenticated flow
  if (user) {
    if (screen === 'gallery' && activeGallery) {
      return (
        <GalleryView
          gallery={activeGallery}
          onBack={() => setScreen('dashboard')}
        />
      );
    }
    return (
      <Dashboard
        onOpenGallery={(gallery) => {
          setActiveGallery(gallery);
          setScreen('gallery');
        }}
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

export default function App() {
  return (
    <AuthProvider>
      <AppInner />
    </AuthProvider>
  );
}
