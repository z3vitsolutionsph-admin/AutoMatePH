import { useState, useEffect } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Package, ShoppingCart, LayoutDashboard, LogOut, Activity, Terminal, Users } from 'lucide-react';
import { cn } from '../lib/utils';
import { Toaster } from './ui/sonner';
import { TerminalChat } from './TerminalChat';

export function Layout() {
  const { user, role, logout } = useAuth();
  const location = useLocation();
  const [terminalOpen, setTerminalOpen] = useState(false);

  useEffect(() => {
    const handleOpenTerminal = () => setTerminalOpen(true);
    window.addEventListener('open-terminal', handleOpenTerminal);
    return () => window.removeEventListener('open-terminal', handleOpenTerminal);
  }, []);

  const navItems = [
    { label: 'Dashboard', path: '/', icon: LayoutDashboard, roles: ['SUPER_ADMIN', 'STORE_MANAGER'] },
    { label: 'Point of Sale', path: '/pos', icon: ShoppingCart, roles: ['SUPER_ADMIN', 'STORE_MANAGER', 'CASHIER'] },
    { label: 'Inventory', path: '/inventory', icon: Package, roles: ['SUPER_ADMIN', 'STORE_MANAGER'] },
    { label: 'Activity', path: '/activityLog', icon: Activity, roles: ['SUPER_ADMIN', 'STORE_MANAGER'] },
    { label: 'Users & Roles', path: '/users', icon: Users, roles: ['SUPER_ADMIN'] },
  ];

  return (
    <div className="h-screen w-full bg-[#0A0C10] text-[#FAF7F2] font-sans flex flex-col overflow-hidden">
      <header className="h-14 border-b border-[#3A3230] bg-[#141210] flex items-center justify-between px-6 shrink-0 z-10">
        <div className="flex items-center gap-4">
          <div className="w-8 h-8 bg-[#FF6F00] flex items-center justify-center font-bold text-black rounded-sm tracking-tighter">AM</div>
          <h1 className="text-lg font-bold tracking-tight">AUTOMATE<span className="text-[#FF6F00]">PH</span></h1>
          <div className="h-4 w-[1px] bg-[#3A3230] mx-2 hidden sm:block"></div>
          <span className="text-xs font-mono text-[#7A736E] uppercase tracking-widest hidden sm:block">Terminal v4.2 // Sector-A</span>
        </div>
        <div className="flex items-center gap-6">
          <div className="hidden sm:flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-[#1D9E75] shadow-[0_0_8px_#1D9E75]"></div>
            <span className="text-[10px] font-mono text-[#1D9E75] uppercase tracking-wider">Cloud Synced</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right hidden sm:block">
              <p className="text-[10px] leading-none text-[#7A736E] uppercase">{role}</p>
              <p className="text-xs font-medium">{user?.displayName || user?.email?.split('@')[0]}</p>
            </div>
            <div className="w-8 h-8 rounded bg-[#1A1614] border border-[#3A3230] flex items-center justify-center text-[10px] text-[#FF6F00]">
              {user?.displayName ? user.displayName.substring(0, 2).toUpperCase() : user?.email?.substring(0, 2).toUpperCase()}
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 flex flex-col sm:flex-row overflow-hidden relative">
        {/* Main Workspace */}
        <section className="flex-1 flex flex-col bg-[#141210] p-4 sm:p-6 overflow-hidden overflow-y-auto mb-16 sm:mb-0">
          <Outlet />
        </section>

        {/* Side/Bottom Navigation */}
        <nav className="fixed sm:static bottom-0 left-0 w-full sm:w-20 border-t sm:border-t-0 sm:border-r border-[#3A3230] bg-[#0A0C10] flex sm:flex-col items-center justify-around sm:justify-start px-2 py-3 sm:py-6 sm:gap-8 shrink-0 z-20">
          {navItems.filter(item => !item.roles || item.roles.includes(role || '')).map((item) => {
             const Icon = item.icon;
             const isActive = location.pathname === item.path;

             return (
               <Link
                 key={item.path}
                 to={item.path}
                 className={cn(
                    "group cursor-pointer flex flex-col items-center gap-1 transition-colors",
                    isActive ? "text-[#FF6F00]" : "text-[#7A736E] hover:text-[#FAF7F2]"
                 )}
               >
                 <div className={cn(
                    "p-2 rounded-lg transition-colors flex items-center justify-center",
                    isActive ? "bg-[#1A1614] border border-[#FF6F00]" : "border border-transparent"
                 )}>
                   <Icon className="w-5 h-5 sm:w-6 sm:h-6" />
                 </div>
                 <span className="text-[9px] uppercase font-bold tracking-tighter text-center hidden sm:block">{item.label.split(' ')[0]}</span>
               </Link>
             )
          })}
          
          <div className="sm:mt-auto flex sm:flex-col items-center gap-2 sm:gap-4 ml-auto sm:ml-0 pr-4 sm:pr-0">
             <div 
               onClick={() => setTerminalOpen(!terminalOpen)}
               className="group cursor-pointer flex flex-col items-center gap-1 text-[#1D9E75] hover:text-[#FAF7F2] transition-colors"
             >
                <div className="p-2 border border-[#1D9E75] rounded-lg bg-[#1A1614] flex items-center justify-center">
                   <Terminal className="w-5 h-5 sm:w-6 sm:h-6" />
                </div>
                <span className="text-[9px] uppercase font-bold tracking-tighter text-center hidden sm:block">AI Insights</span>
             </div>

             <div 
               onClick={logout}
               className="group cursor-pointer flex flex-col items-center gap-1 text-[#7A736E] hover:text-[#FAF7F2] transition-colors sm:mt-4"
             >
                <LogOut className="w-5 h-5 sm:w-6 sm:h-6" />
                <span className="text-[9px] uppercase font-bold tracking-tighter hidden sm:block">Exit</span>
             </div>
          </div>
        </nav>
      </main>

      <footer className="h-10 bg-[#1A1614] border-t border-[#3A3230] flex items-center px-6 text-[10px] font-mono tracking-widest shrink-0 hidden sm:flex">
        <div className="flex gap-6">
          <div className="flex gap-2"><span className="text-[#FF6F00] font-bold">F1</span> SEARCH</div>
          <div className="flex gap-2"><span className="text-[#FF6F00] font-bold">F2</span> CHECKOUT</div>
        </div>
        <div className="ml-auto flex gap-4 text-[#7A736E]">
           <span className="text-[#1D9E75]">v1.0.24-STABLE</span>
        </div>
      </footer>
      
      <Toaster theme="dark" toastOptions={{ style: { background: '#1A1614', border: '1px solid #3A3230', color: '#FAF7F2'} }} />
      <TerminalChat isOpen={terminalOpen} onClose={() => setTerminalOpen(false)} />
    </div>
  );
}
