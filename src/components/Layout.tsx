import { useState, useEffect } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Package, ShoppingCart, LayoutDashboard, LogOut, Activity, Terminal, Users, BarChart3, Tag, Clock } from 'lucide-react';
import { cn } from '../lib/utils';
import { Toaster } from './ui/sonner';
import { TerminalChat } from './TerminalChat';
import { Badge } from './ui/badge';
import { SyncStatusIndicator } from './SyncStatusIndicator';
import { ServiceWorkerStatusIndicator } from './ServiceWorkerStatusIndicator';

export function Layout() {
  const { user, role, logout } = useAuth();
  const location = useLocation();
  const [terminalOpen, setTerminalOpen] = useState(false);
  const [currentTime, setCurrentTime] = useState(() => new Date().toLocaleTimeString('en-US', { hour12: false }));

  useEffect(() => {
    const handleOpenTerminal = () => setTerminalOpen(true);
    window.addEventListener('open-terminal', handleOpenTerminal);

    const timer = setInterval(() => {
      setCurrentTime(new Date().toLocaleTimeString('en-US', { hour12: false }));
    }, 1000);

    return () => {
      window.removeEventListener('open-terminal', handleOpenTerminal);
      clearInterval(timer);
    };
  }, []);

  const navItems = [
    { label: 'Dashboard', path: '/', icon: LayoutDashboard, roles: ['SUPER_ADMIN', 'STORE_MANAGER'] },
    { label: 'Point of Sale', path: '/pos', icon: ShoppingCart, roles: ['SUPER_ADMIN', 'STORE_MANAGER', 'CASHIER'] },
    { label: 'Inventory', path: '/inventory', icon: Package, roles: ['SUPER_ADMIN', 'STORE_MANAGER', 'INVENTORY_CLERK'] },
    { label: 'Promotions', path: '/promotions', icon: Tag, roles: ['SUPER_ADMIN', 'STORE_MANAGER'] },
    { label: 'Reports', path: '/reports', icon: BarChart3, roles: ['SUPER_ADMIN', 'STORE_MANAGER'] },
    { label: 'Activity', path: '/activityLog', icon: Activity, roles: ['SUPER_ADMIN', 'STORE_MANAGER'] },
    { label: 'Users & Roles', path: '/users', icon: Users, roles: ['SUPER_ADMIN'] },
  ];

  return (
    <div className="h-screen w-full bg-[#0A0C10] text-[#FAF7F2] font-sans flex flex-col overflow-hidden relative selection:bg-[#FF6F00]/30 selection:text-[#FF6F00]">
      {/* Ambient Glassmorphism Luminous Glows */}
      <div className="pointer-events-none absolute -top-32 -left-32 w-96 h-96 bg-[#FF6F00]/[0.06] rounded-full blur-[120px]" />
      <div className="pointer-events-none absolute top-1/3 -right-32 w-96 h-96 bg-[#1D9E75]/[0.05] rounded-full blur-[130px]" />
      <div className="pointer-events-none absolute -bottom-32 left-1/3 w-[500px] h-[500px] bg-[#FF6F00]/[0.04] rounded-full blur-[140px]" />

      {/* Frosted Glass Top Header */}
      <header className="h-14 border-b border-white/[0.08] bg-[#141210]/65 backdrop-blur-xl flex items-center justify-between px-3 sm:px-6 shrink-0 z-20 shadow-[0_4px_24px_rgba(0,0,0,0.3)]">
        <div className="flex items-center gap-3 sm:gap-4">
          <div className="w-8 h-8 bg-gradient-to-br from-[#FF8F00] to-[#FF6F00] flex items-center justify-center font-bold text-[#0A0C10] rounded-lg font-mono text-sm tracking-tighter shadow-[0_0_16px_rgba(255,111,0,0.35)] border border-white/20">
            AM
          </div>
          <div className="flex items-baseline gap-1">
            <h1 className="text-base sm:text-lg font-bold font-mono tracking-tight text-[#FAF7F2]">
              AUTOMATE<span className="text-[#FF6F00]">PH</span>
            </h1>
            <span className="text-[10px] font-mono text-[#FF6F00] font-semibold hidden md:inline ml-1 px-1.5 py-0.2 rounded bg-[#FF6F00]/10 border border-[#FF6F00]/30 backdrop-blur-sm">
              CORE POS
            </span>
          </div>
          <div className="h-4 w-[1px] bg-white/[0.1] mx-1 hidden lg:block"></div>
          <span className="text-xs font-mono text-[#8E857E] hidden lg:block">
            Retail Operations · Unified POS
          </span>
        </div>

        <div className="flex items-center gap-3 sm:gap-5">
          {/* Glass Clock */}
          <div className="hidden md:flex items-center gap-1.5 text-xs font-mono text-[#8E857E] px-2.5 py-1 rounded-md bg-white/[0.03] border border-white/[0.08] backdrop-blur-md shadow-sm">
            <Clock className="w-3.5 h-3.5 text-[#FF6F00]" />
            <span className="text-[#FAF7F2]">{currentTime}</span>
          </div>

          {/* PWA Service Worker Status Indicator (Online / Offline) */}
          <ServiceWorkerStatusIndicator />

          {/* Synchronization Status Indicator (Offline / Syncing / Online) */}
          <SyncStatusIndicator />

          {/* AI Insights quick trigger in header */}
          <button
            id="header-terminal-trigger"
            onClick={() => setTerminalOpen(true)}
            className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-white/[0.04] border border-[#1D9E75]/40 text-[#1D9E75] hover:bg-[#1D9E75]/15 hover:text-[#FAF7F2] hover:border-[#1D9E75]/70 transition-all font-mono text-xs backdrop-blur-md shadow-sm"
            title="Open Foresight AI Terminal (F4)"
          >
            <Terminal className="w-3.5 h-3.5" />
            <span className="text-[11px] font-semibold uppercase tracking-wider">AI Insights</span>
          </button>

          {/* User Profile */}
          <div className="flex items-center gap-2.5 pl-2 border-l border-white/[0.08]">
            <div className="text-right hidden sm:block">
              <Badge variant="outline" className="text-[9px] py-0 px-1 text-[#FF6F00] border-[#FF6F00]/40 bg-[#FF6F00]/10 backdrop-blur-sm">
                {role?.replace('_', ' ') || 'STAFF'}
              </Badge>
              <p className="text-xs font-mono font-medium text-[#FAF7F2] truncate max-w-[120px]">
                {user?.displayName || user?.email?.split('@')[0] || 'Staff'}
              </p>
            </div>
            <div className="w-8 h-8 rounded-lg bg-white/[0.05] border border-white/[0.1] flex items-center justify-center text-xs font-mono font-bold text-[#FF6F00] shadow-[inset_0_1px_1px_rgba(255,255,255,0.1)] backdrop-blur-md">
              {user?.displayName ? user.displayName.substring(0, 2).toUpperCase() : user?.email ? user.email.substring(0, 2).toUpperCase() : 'AM'}
            </div>
          </div>
        </div>
      </header>

      {/* Main Layout Area: Navigation Rail + Workspace */}
      <main className="flex-1 flex flex-col sm:flex-row overflow-hidden relative z-10">
        {/* Navigation Rail (Left on Desktop, Bottom on Mobile) */}
        <nav className="fixed sm:static bottom-0 left-0 w-full sm:w-20 border-t sm:border-t-0 sm:border-r border-white/[0.08] bg-[#141210]/60 backdrop-blur-xl flex sm:flex-col items-center justify-start px-2 py-2 sm:py-5 gap-1.5 sm:gap-4 shrink-0 z-30 overflow-x-auto sm:overflow-x-visible no-scrollbar shadow-2xl sm:shadow-none">
          {navItems
            .filter((item) => !item.roles || item.roles.includes(role || ''))
            .map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.path;

              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={cn(
                    "group cursor-pointer flex flex-col items-center justify-center gap-1 p-1 sm:p-2 rounded-xl transition-all duration-200 min-w-[56px] sm:min-w-0 sm:w-16 relative",
                    isActive
                      ? "text-[#FF6F00] bg-[#FF6F00]/15 border border-[#FF6F00]/40 shadow-[0_0_20px_rgba(255,111,0,0.2),inset_0_1px_0_rgba(255,255,255,0.15)] backdrop-blur-md"
                      : "text-[#8E857E] hover:text-[#FAF7F2] hover:bg-white/[0.04] border border-transparent hover:border-white/[0.08]"
                  )}
                  title={item.label}
                >
                  <Icon className={cn("w-5 h-5 transition-transform duration-200 group-hover:scale-110", isActive && "text-[#FF6F00]")} />
                  <span className="text-[9px] font-mono uppercase font-bold tracking-tighter text-center truncate max-w-[54px]">
                    {item.label.split(' ')[0]}
                  </span>
                </Link>
              );
            })}

          {/* Secondary Controls (AI Insights & Logout) */}
          <div className="sm:mt-auto flex sm:flex-col items-center gap-1.5 sm:gap-3 ml-auto sm:ml-0 pl-2 sm:pl-0 sm:pt-4 sm:border-t sm:border-white/[0.08]">
            <button
              onClick={() => setTerminalOpen(!terminalOpen)}
              className="group cursor-pointer flex flex-col items-center justify-center gap-1 p-1 sm:p-2 rounded-xl text-[#1D9E75] hover:text-[#FAF7F2] hover:bg-[#1D9E75]/15 transition-all min-w-[56px] sm:min-w-0 sm:w-16 border border-[#1D9E75]/30 hover:border-[#1D9E75]/70 backdrop-blur-md"
              title="Open AI Insights Terminal"
            >
              <Terminal className="w-5 h-5 transition-transform group-hover:scale-110" />
              <span className="text-[9px] font-mono uppercase font-bold tracking-tighter text-center">
                AI Intel
              </span>
            </button>

            <button
              onClick={logout}
              className="group cursor-pointer flex flex-col items-center justify-center gap-1 p-1 sm:p-2 rounded-xl text-[#8E857E] hover:text-red-400 hover:bg-red-500/10 transition-all min-w-[48px] sm:min-w-0 sm:w-16 border border-transparent hover:border-red-500/30 backdrop-blur-md"
              title="Sign Out"
            >
              <LogOut className="w-5 h-5 transition-transform group-hover:scale-110" />
              <span className="text-[9px] font-mono uppercase font-bold tracking-tighter text-center">
                Exit
              </span>
            </button>
          </div>
        </nav>

        {/* Main Workspace */}
        <section className="flex-1 flex flex-col bg-transparent p-3 sm:p-6 overflow-hidden overflow-y-auto pb-20 sm:pb-6 relative z-10">
          <Outlet />
        </section>
      </main>

      {/* Tactile Keyboard Shortcuts & Telemetry Footer */}
      <footer className="h-9 bg-[#141210]/65 backdrop-blur-xl border-t border-white/[0.08] flex items-center px-6 text-[10px] font-mono tracking-wider shrink-0 hidden sm:flex justify-between z-20">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-1.5 text-[#8E857E]">
            <span className="px-1.5 py-0.5 rounded bg-white/[0.05] border border-white/[0.1] text-[#FF6F00] font-bold shadow-sm">F1</span>
            <span>SEARCH</span>
          </div>
          <div className="flex items-center gap-1.5 text-[#8E857E]">
            <span className="px-1.5 py-0.5 rounded bg-white/[0.05] border border-white/[0.1] text-[#FF6F00] font-bold shadow-sm">F2</span>
            <span>CHECKOUT</span>
          </div>
          <div className="flex items-center gap-1.5 text-[#8E857E]">
            <span className="px-1.5 py-0.5 rounded bg-white/[0.05] border border-white/[0.1] text-[#FF6F00] font-bold shadow-sm">F3</span>
            <span>E-WALLET</span>
          </div>
          <div className="flex items-center gap-1.5 text-[#8E857E]">
            <span className="px-1.5 py-0.5 rounded bg-white/[0.05] border border-white/[0.1] text-[#1D9E75] font-bold shadow-sm">F4</span>
            <span>AI TERMINAL</span>
          </div>
        </div>
        <div className="flex items-center gap-3 text-[#8E857E]">
          <span className="text-[10px]">Real-time PubSub Active</span>
          <span className="text-white/[0.1]">·</span>
          <span className="text-[10px] text-[#FAF7F2]/80">Dexie IndexedDB Persistent</span>
        </div>
      </footer>

      {/* Global Notifications & Foresight AI Terminal */}
      <Toaster />
      <TerminalChat isOpen={terminalOpen} onClose={() => setTerminalOpen(false)} />
    </div>
  );
}
