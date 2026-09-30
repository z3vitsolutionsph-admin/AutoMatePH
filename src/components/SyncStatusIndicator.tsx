import React, { useState, useRef, useEffect } from 'react';
import { useSyncStatus } from '../lib/realtime';
import { 
  Wifi, 
  WifiOff, 
  RefreshCw, 
  CheckCircle2, 
  AlertCircle, 
  Database, 
  Cloud, 
  Clock, 
  ArrowUpRight, 
  ChevronDown,
  HardDrive
} from 'lucide-react';
import { Button } from './ui/button';
import { toast } from 'sonner';

export function SyncStatusIndicator() {
  const syncInfo = useSyncStatus();
  const [isOpen, setIsOpen] = useState(false);
  const [isManualSyncing, setIsManualSyncing] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        popoverRef.current && 
        !popoverRef.current.contains(event.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const handleManualSync = async () => {
    try {
      setIsManualSyncing(true);
      const res = await syncInfo.triggerManualSync();
      if (res.synced > 0) {
        toast.success(`Successfully synchronized ${res.synced} offline transaction(s).`);
      } else if (syncInfo.status === 'offline') {
        toast.info('System is offline. Records are stored locally and will sync once connection returns.');
      } else {
        toast.success('System is fully up-to-date. Realtime sync active.');
      }
    } catch (err: any) {
      toast.error(err.message || 'Sync attempt encountered an issue');
    } finally {
      setIsManualSyncing(false);
    }
  };

  const formatLastSync = (date: Date | null) => {
    if (!date) return 'Never';
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    });
  };

  return (
    <div className="relative">
      {/* Visual Trigger Button in Header */}
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`group flex items-center gap-2 px-2.5 py-1.5 rounded transition-all duration-200 text-xs font-mono select-none outline-none focus-visible:ring-1 focus-visible:ring-[#FF6F00] ${
          syncInfo.status === 'online'
            ? 'bg-[#1D9E75]/10 border border-[#1D9E75]/30 text-[#1D9E75] hover:bg-[#1D9E75]/20 hover:border-[#1D9E75]/50 shadow-[0_0_10px_rgba(29,158,117,0.1)]'
            : syncInfo.status === 'syncing'
            ? 'bg-[#FF6F00]/15 border border-[#FF6F00]/40 text-[#FF6F00] hover:bg-[#FF6F00]/25 shadow-[0_0_12px_rgba(255,111,0,0.15)] animate-pulse'
            : 'bg-amber-500/15 border border-amber-500/40 text-amber-400 hover:bg-amber-500/25 shadow-[0_0_10px_rgba(245,158,11,0.15)]'
        }`}
        title={`Status: ${syncInfo.label} • Click for synchronization details`}
      >
        {/* Animated Pulse or Spinning Indicator */}
        <div className="relative flex items-center justify-center">
          {syncInfo.status === 'online' ? (
            <>
              <div className="w-2 h-2 rounded-full bg-[#1D9E75] shadow-[0_0_8px_#1D9E75]"></div>
              <div className="absolute w-3.5 h-3.5 rounded-full bg-[#1D9E75]/30 animate-ping"></div>
            </>
          ) : syncInfo.status === 'syncing' || isManualSyncing ? (
            <RefreshCw className="w-3.5 h-3.5 text-[#FF6F00] animate-spin" />
          ) : (
            <>
              <div className="w-2 h-2 rounded-full bg-amber-400 shadow-[0_0_8px_#F59E0B]"></div>
              <div className="absolute w-3 h-3 rounded-full bg-amber-400/30 animate-pulse"></div>
            </>
          )}
        </div>

        {/* Text Labels */}
        <div className="flex items-center gap-1.5">
          <span className="font-bold uppercase tracking-wider text-[11px]">
            {syncInfo.status === 'syncing' || isManualSyncing 
              ? (syncInfo.pendingCount > 0 ? `Syncing (${syncInfo.pendingCount})` : 'Syncing...')
              : syncInfo.status === 'offline' 
              ? (syncInfo.pendingCount > 0 ? `Offline (${syncInfo.pendingCount})` : 'Offline')
              : 'Online'
            }
          </span>

          <span className={`text-[9px] px-1 py-0.2 rounded font-mono uppercase tracking-widest hidden md:inline border ${
            syncInfo.status === 'online'
              ? 'bg-[#1D9E75]/20 border-[#1D9E75]/40 text-[#FAF7F2]'
              : syncInfo.status === 'syncing'
              ? 'bg-[#FF6F00]/20 border-[#FF6F00]/40 text-[#FAF7F2]'
              : 'bg-amber-500/20 border-amber-500/40 text-amber-200'
          }`}>
            {syncInfo.status === 'online' ? 'Saved' : syncInfo.status === 'syncing' ? 'Saving' : 'Local'}
          </span>
        </div>

        <ChevronDown className={`w-3 h-3 transition-transform duration-200 opacity-60 group-hover:opacity-100 ${
          isOpen ? 'rotate-180' : ''
        }`} />
      </button>

      {/* Flyout Synchronization Telemetry Popover */}
      {isOpen && (
        <div
          ref={popoverRef}
          className="absolute right-0 top-full mt-2 w-80 sm:w-96 bg-[#141210]/85 backdrop-blur-2xl border border-white/[0.12] rounded-xl shadow-[0_20px_60px_rgba(0,0,0,0.6)] z-50 p-4 text-[#FAF7F2] font-mono animate-in fade-in slide-in-from-top-2 duration-150"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-white/[0.08] pb-3 mb-3">
            <div className="flex items-center gap-2">
              <Database className="w-4 h-4 text-[#FF6F00]" />
              <span className="text-xs font-bold uppercase tracking-wider text-[#FAF7F2]">
                Synchronization Telemetry
              </span>
            </div>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded border uppercase backdrop-blur-md ${
              syncInfo.status === 'online'
                ? 'bg-[#1D9E75]/15 border-[#1D9E75]/40 text-[#1D9E75]'
                : syncInfo.status === 'syncing'
                ? 'bg-[#FF6F00]/15 border-[#FF6F00]/40 text-[#FF6F00]'
                : 'bg-amber-500/15 border-amber-500/40 text-amber-400'
            }`}>
              {syncInfo.label}
            </span>
          </div>

          {/* Status Breakdown Cards */}
          <div className="space-y-2.5 text-xs">
            {/* Connectivity State */}
            <div className="p-2.5 rounded-lg bg-white/[0.03] border border-white/[0.07] backdrop-blur-md flex items-start gap-3">
              <div className="p-1.5 rounded-md bg-white/[0.05] border border-white/[0.08] mt-0.5 shrink-0">
                {syncInfo.isOnline ? (
                  <Wifi className="w-4 h-4 text-[#1D9E75]" />
                ) : (
                  <WifiOff className="w-4 h-4 text-amber-400" />
                )}
              </div>
              <div className="space-y-0.5 flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-[#8E857E] uppercase tracking-wider font-semibold">
                    Network Transport
                  </span>
                  <span className="text-[10px] text-[#FAF7F2] font-semibold">
                    {syncInfo.isOnline ? 'Online (WS Active)' : 'Network Disconnected'}
                  </span>
                </div>
                <p className="text-[11px] text-[#8E857E] leading-relaxed">
                  {syncInfo.isOnline 
                    ? 'Connected to central WebSocket reactive server with low-latency pub/sub.'
                    : 'Network link unavailable. Operating offline with automatic local persistence.'}
                </p>
              </div>
            </div>

            {/* Data Storage & Saving Status */}
            <div className="p-2.5 rounded-lg bg-white/[0.03] border border-white/[0.07] backdrop-blur-md flex items-start gap-3">
              <div className="p-1.5 rounded-md bg-white/[0.05] border border-white/[0.08] mt-0.5 shrink-0">
                {syncInfo.status === 'online' ? (
                  <Cloud className="w-4 h-4 text-[#1D9E75]" />
                ) : (
                  <HardDrive className="w-4 h-4 text-[#FF6F00]" />
                )}
              </div>
              <div className="space-y-0.5 flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-[#8E857E] uppercase tracking-wider font-semibold">
                    Data Saving State
                  </span>
                  <span className={`text-[10px] font-semibold ${
                    syncInfo.status === 'online' ? 'text-[#1D9E75]' : 'text-[#FF6F00]'
                  }`}>
                    {syncInfo.status === 'online' 
                      ? 'Saved to Cloud Database' 
                      : syncInfo.status === 'syncing'
                      ? 'Syncing Data...'
                      : 'Saved Locally in Dexie'}
                  </span>
                </div>
                <p className="text-[11px] text-[#8E857E] leading-relaxed">
                  {syncInfo.status === 'online'
                    ? 'All POS transactions, inventory stocks, and audit logs are safely journaled.'
                    : syncInfo.status === 'syncing'
                    ? 'Uploading and reconciling local transaction journals with the main store database.'
                    : 'All sales and activities are saved instantly to local browser IndexedDB.'}
                </p>
              </div>
            </div>

            {/* Offline Queue & Timestamp row */}
            <div className="grid grid-cols-2 gap-2 pt-1">
              <div className="p-2 rounded-lg bg-white/[0.03] border border-white/[0.07] backdrop-blur-md">
                <span className="text-[9px] text-[#8E857E] uppercase block font-semibold">
                  Local Queue
                </span>
                <span className={`text-sm font-bold ${
                  syncInfo.pendingCount > 0 ? 'text-amber-400' : 'text-[#FAF7F2]'
                }`}>
                  {syncInfo.pendingCount} <span className="text-[10px] font-normal text-[#8E857E]">pending</span>
                </span>
              </div>

              <div className="p-2 rounded-lg bg-white/[0.03] border border-white/[0.07] backdrop-blur-md">
                <span className="text-[9px] text-[#8E857E] uppercase block font-semibold">
                  Last Synced
                </span>
                <span className="text-xs font-bold text-[#FAF7F2] truncate block">
                  {formatLastSync(syncInfo.lastSyncedAt)}
                </span>
              </div>
            </div>
          </div>

          {/* Action Footer */}
          <div className="pt-3 mt-3 border-t border-white/[0.08] flex items-center justify-between gap-2">
            <span className="text-[10px] text-[#8E857E]">
              {syncInfo.status === 'online' ? 'Auto-sync active' : 'Will sync on connection'}
            </span>
            <Button
              type="button"
              size="sm"
              disabled={isManualSyncing || (syncInfo.status === 'offline' && syncInfo.pendingCount === 0)}
              onClick={handleManualSync}
              className="h-8 px-3 text-xs font-bold uppercase tracking-wider bg-[#FF6F00] hover:bg-[#FF6F00]/90 text-[#0A0C10] shadow-[0_0_15px_rgba(255,111,0,0.25)] flex items-center gap-1.5"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isManualSyncing ? 'animate-spin' : ''}`} />
              <span>{isManualSyncing ? 'Syncing...' : 'Sync Now'}</span>
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
