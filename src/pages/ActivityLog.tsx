import { useState, useEffect } from 'react';
import { db, collection, onSnapshot, query, orderBy, limit, getDocs, writeBatch, doc, realtime } from '../lib/realtime';
import { dbLocal } from '../lib/db';
import { useAuth } from '../contexts/AuthContext';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Activity, Trash2, Loader2, AlertTriangle } from 'lucide-react';
import { Button } from '../components/ui/button';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '../components/ui/alert-dialog';

interface Log {
  id: string;
  type: string;
  userId: string;
  details: string;
  timestamp: any;
}

export function ActivityLog() {
  const [logs, setLogs] = useState<Log[]>([]);
  const [isClearing, setIsClearing] = useState(false);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const { role } = useAuth();

  useEffect(() => {
    const q = query(collection(db, 'activityLogs'), orderBy('timestamp', 'desc'), limit(100));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const msgs: Log[] = [];
      snapshot.forEach(doc => msgs.push({ id: doc.id, ...doc.data() } as Log));
      setLogs(msgs);
    }, (e) => console.error('Activity logs subscription error:', e));

    return unsubscribe;
  }, []);

  const handleClearAll = async () => {
    setIsClearing(true);
    try {
      await realtime.clearActivityLogs();
      if (dbLocal && dbLocal.transactions) {
        await dbLocal.transactions.clear();
      }
      toast.success("Activity history and transaction records have been successfully cleared.", {
        icon: '🗑️'
      });
      setIsConfirmOpen(false);
    } catch (error) {
      console.error("Error clearing logs:", error);
      toast.error("Failed to clear activity logs.", {
        icon: <AlertTriangle className="h-4 w-4 text-red-500" />
      });
    } finally {
      setIsClearing(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between gap-4 items-start sm:items-end">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-[#FAF7F2] flex items-center gap-2">
            <Activity className="h-6 w-6 text-[#1D9E75]" /> Activity History
          </h2>
          <p className="text-sm font-mono text-[#7A736E]">Chronological immutable activity log</p>
        </div>
        
        <AlertDialog open={isConfirmOpen} onOpenChange={setIsConfirmOpen}>
          <AlertDialogTrigger 
            disabled={logs.length === 0 || isClearing}
            render={
              <Button 
                variant="destructive" 
                className="bg-red-500/10 hover:bg-red-500/20 text-red-500 hover:text-red-400 border border-red-500/20 font-mono text-xs uppercase tracking-widest transition-colors"
              />
            }
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Clear All Logs
          </AlertDialogTrigger>
          <AlertDialogContent className="glass-modal border border-white/[0.12] text-[#FAF7F2] rounded-2xl shadow-[0_24px_64px_rgba(0,0,0,0.7)]">
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2 text-red-400">
                <AlertTriangle className="h-5 w-5" />
                Clear Activity History
              </AlertDialogTitle>
              <AlertDialogDescription className="text-[#8E857E]">
                Are you absolutely sure you want to delete all activity logs? This action is permanent and cannot be undone. All historical tracking data will be lost.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="mt-6">
              <AlertDialogCancel 
                disabled={isClearing}
                className="bg-transparent border-white/[0.1] text-[#FAF7F2] hover:bg-white/[0.08]"
              >
                Cancel
              </AlertDialogCancel>
              <Button
                variant="destructive"
                onClick={(e) => {
                  e.preventDefault();
                  handleClearAll();
                }}
                disabled={isClearing}
                className="bg-red-500 hover:bg-red-600 text-white font-mono uppercase tracking-widest text-xs"
              >
                {isClearing ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Clearing...
                  </>
                ) : (
                  'Yes, delete all data'
                )}
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      <div className="glass-panel rounded-2xl border border-white/[0.08] shadow-[0_8px_32px_rgba(0,0,0,0.3)] flex-1 overflow-hidden flex flex-col">
        <div className="overflow-x-auto flex-1">
          <Table>
            <TableHeader className="bg-white/[0.03]">
              <TableRow className="border-b border-white/[0.08] hover:bg-transparent">
                <TableHead className="text-[10px] whitespace-nowrap font-mono text-[#8E857E] uppercase tracking-wider w-[180px]">TIMESTAMP</TableHead>
                <TableHead className="text-[10px] whitespace-nowrap font-mono text-[#8E857E] uppercase tracking-wider">TYPE</TableHead>
                <TableHead className="text-[10px] whitespace-nowrap font-mono text-[#8E857E] uppercase tracking-wider">USER</TableHead>
                <TableHead className="text-[10px] whitespace-nowrap font-mono text-[#8E857E] uppercase tracking-wider min-w-[200px]">DETAILS</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className="text-sm font-mono">
              {logs.map((log) => {
                const date = log.timestamp?.toDate ? log.timestamp.toDate() : new Date(log.timestamp || Date.now());
                return (
                  <TableRow key={log.id} className="border-b border-white/[0.05] hover:bg-white/[0.035] transition-colors">
                    <TableCell className="text-[#8E857E] whitespace-nowrap font-mono tabular-nums">
                      {date.toLocaleString()}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      <span className="px-2 py-0.5 rounded text-[11px] font-mono border border-[#1D9E75]/30 bg-[#1D9E75]/10 text-[#1D9E75]">
                        {log.type.replace(/_/g, ' ')}
                      </span>
                    </TableCell>
                    <TableCell className="text-[#FAF7F2] font-semibold truncate max-w-[150px]" title={log.userId}>
                      {log.userId}
                    </TableCell>
                    <TableCell className="text-[#FAF7F2] font-sans break-words whitespace-normal min-w-[200px]">
                      {log.details}
                    </TableCell>
                  </TableRow>
                );
              })}
              {logs.length === 0 && (
                <TableRow className="border-b border-white/[0.06] bg-transparent">
                  <TableCell colSpan={4} className="h-24 text-center font-mono text-[#8E857E] uppercase tracking-widest text-[10px]">
                    NO ACTIVITY RECORDED
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
