import { ReactNode, useState, useRef, useEffect } from 'react';
import {
  LayoutGrid, Search, Bell, LogOut, ChevronDown,
  FolderOpen, Settings, ChevronRight, User,
} from 'lucide-react';
import { LanternLogo } from './LanternLogo';
import { useAuth } from '../contexts/useAuth';
import { Project, ProjectType } from '../lib/supabase';

type Props = {
  children: ReactNode;
  projects: Project[];
  selectedProjectId: ProjectType | null;
  onSelectProject: (id: ProjectType | null) => void;
  onSearchOpen: () => void;
  heading?: string;
  headerRight?: ReactNode;
};

export function AppLayout({
  children,
  projects,
  selectedProjectId,
  onSelectProject,
  onSearchOpen,
  heading,
  headerRight,
}: Props) {
  const { user, signOut } = useAuth();
  const [projectsOpen, setProjectsOpen] = useState(true);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  const initials = user?.email?.slice(0, 2).toUpperCase() ?? 'ME';
  const studioName = user?.email?.split('@')[0]
    .replace(/[._-]/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase()) ?? 'My Studio';

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div className="flex h-screen bg-[#080808] text-white overflow-hidden">
      {/* Ambient background glows */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-32 left-1/3 w-[700px] h-[500px] bg-orange-500/[0.045] rounded-full blur-[140px]" />
        <div className="absolute bottom-0 right-0 w-[400px] h-[400px] bg-amber-600/[0.025] rounded-full blur-[100px]" />
      </div>

      {/* ── Sidebar ── */}
      <aside className="relative z-10 w-[220px] flex-shrink-0 flex flex-col border-r border-white/[0.055]"
        style={{ background: 'linear-gradient(180deg, #0c0b0a 0%, #0a0908 100%)' }}>

        {/* Brand */}
        <div className="px-4 py-4 border-b border-white/[0.055]">
          <div className="flex items-center gap-2.5">
            <LanternLogo size={30} />
            <div>
              <p className="text-sm font-semibold tracking-tight leading-none">LANTERNA</p>
              <p className="text-[10px] text-gray-600 mt-0.5 truncate max-w-[130px]">{studioName}</p>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-2.5 py-3 space-y-0.5 overflow-y-auto">
          <button
            onClick={() => onSelectProject(null)}
            className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13px] font-medium transition-all ${
              selectedProjectId === null
                ? 'bg-orange-500/12 text-orange-400 shadow-[inset_0_0_0_1px_rgba(249,115,22,0.15)]'
                : 'text-gray-500 hover:text-gray-300 hover:bg-white/[0.04]'
            }`}
          >
            <LayoutGrid size={14} className={selectedProjectId === null ? 'text-orange-400' : 'text-gray-600'} />
            All Galleries
          </button>

          <button
            onClick={onSearchOpen}
            className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13px] text-gray-500 hover:text-gray-300 hover:bg-white/[0.04] transition-all"
          >
            <Search size={14} className="text-gray-600" />
            Search
            <span className="ml-auto text-[10px] text-gray-700 font-mono bg-white/[0.04] px-1.5 py-0.5 rounded border border-white/[0.06]">⌘K</span>
          </button>

          {/* Divider */}
          <div className="my-2 border-t border-white/[0.05]" />

          {/* Projects */}
          <div>
            <button
              onClick={() => setProjectsOpen(!projectsOpen)}
              className="w-full flex items-center justify-between px-2.5 py-1.5 text-[11px] font-semibold text-gray-600 uppercase tracking-wider hover:text-gray-400 transition-colors rounded-lg hover:bg-white/[0.03]"
            >
              <div className="flex items-center gap-1.5">
                <FolderOpen size={10} />
                Projects
              </div>
              <ChevronDown
                size={11}
                className={`transition-transform duration-200 ${projectsOpen ? '' : '-rotate-90'}`}
              />
            </button>

            <div className={`overflow-hidden transition-all duration-200 ${projectsOpen ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'}`}>
              <div className="mt-0.5 space-y-0.5 pl-1">
                {projects.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => onSelectProject(p.id)}
                    className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-[13px] transition-all ${
                      selectedProjectId === p.id
                        ? 'bg-orange-500/10 text-orange-400'
                        : 'text-gray-500 hover:text-gray-300 hover:bg-white/[0.04]'
                    }`}
                  >
                    <ChevronRight size={11} className={`flex-shrink-0 transition-transform ${selectedProjectId === p.id ? 'rotate-90 text-orange-400' : 'text-gray-700'}`} />
                    <span className="truncate">{p.name}</span>
                  </button>
                ))}

              </div>
            </div>
          </div>

          {/* Divider */}
          <div className="my-2 border-t border-white/[0.05]" />

          <button className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13px] text-gray-600 hover:text-gray-400 hover:bg-white/[0.04] transition-all">
            <Settings size={13} />
            Settings
          </button>
        </nav>

        {/* User footer */}
        <div className="border-t border-white/[0.055] p-2.5 relative" ref={userMenuRef}>
          <button
            onClick={() => setUserMenuOpen(!userMenuOpen)}
            className="w-full flex items-center gap-2.5 px-2 py-2 rounded-lg hover:bg-white/[0.04] transition-all group"
          >
            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-orange-500/30 to-amber-600/20 border border-orange-500/25 flex items-center justify-center flex-shrink-0">
              <span className="text-[11px] text-orange-400 font-bold">{initials}</span>
            </div>
            <div className="flex-1 min-w-0 text-left">
              <p className="text-[12px] font-medium text-gray-300 truncate">{studioName}</p>
              <p className="text-[10px] text-gray-600 truncate">{user?.email}</p>
            </div>
            <ChevronDown size={12} className={`text-gray-600 transition-transform ${userMenuOpen ? 'rotate-180' : ''}`} />
          </button>

          {userMenuOpen && (
            <div className="absolute bottom-full left-2.5 right-2.5 mb-1.5 bg-[#1a1815] border border-white/[0.1] rounded-xl shadow-2xl py-1.5 z-50">
              <div className="px-3 py-2 border-b border-white/[0.06] mb-1">
                <p className="text-[11px] text-gray-400">{user?.email}</p>
              </div>
              <button className="w-full flex items-center gap-2.5 px-3 py-2 text-[13px] text-gray-400 hover:text-white hover:bg-white/[0.05] transition-colors rounded-lg">
                <User size={13} />
                Profile
              </button>
              <button className="w-full flex items-center gap-2.5 px-3 py-2 text-[13px] text-gray-400 hover:text-white hover:bg-white/[0.05] transition-colors rounded-lg">
                <Settings size={13} />
                Settings
              </button>
              <div className="border-t border-white/[0.06] my-1" />
              <button
                onClick={signOut}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-[13px] text-red-400 hover:text-red-300 hover:bg-red-500/[0.06] transition-colors rounded-lg"
              >
                <LogOut size={13} />
                Sign out
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* ── Main ── */}
      <main className="relative z-10 flex-1 flex flex-col overflow-hidden">
        {/* Top bar */}
        <header className="flex items-center justify-between px-6 h-[52px] border-b border-white/[0.055] bg-[#090808]/80 backdrop-blur-sm flex-shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            {heading && <h1 className="text-sm font-semibold text-gray-200 truncate">{heading}</h1>}
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={onSearchOpen}
              className="hidden sm:flex items-center gap-2.5 bg-white/[0.04] border border-white/[0.07] hover:border-white/[0.12] rounded-xl px-3 py-1.5 text-sm text-gray-500 hover:text-gray-300 transition-all group"
            >
              <Search size={13} />
              <span className="text-xs">Search galleries...</span>
              <span className="text-[10px] bg-white/[0.05] px-1.5 py-0.5 rounded font-mono text-gray-700 border border-white/[0.06]">⌘K</span>
            </button>

            <button className="relative p-2 rounded-xl text-gray-600 hover:text-gray-300 hover:bg-white/[0.05] transition-all">
              <Bell size={15} />
              <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-orange-500 rounded-full" />
            </button>

            {headerRight}
          </div>
        </header>

        {/* Page content */}
        <div className="flex-1 overflow-y-auto">
          {children}
        </div>
      </main>
    </div>
  );
}
