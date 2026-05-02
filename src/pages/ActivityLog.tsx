import { useState, useEffect } from 'react';
import { db } from '../lib/firebase';
import { collection, onSnapshot, query, orderBy, limit, getDocs, writeBatch, doc } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '../lib/firestore-error';
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

  useEffect(() => {
    const q = query(collection(db, 'activityLogs'), orderBy('timestamp', 'desc'), limit(100));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const msgs: Log[] = [];
      snapshot.forEach(doc => msgs.push({ id: doc.id, ...doc.data() } as Log));
      setLogs(msgs);
    }, (e) => handleFirestoreError(e, OperationType.GET, 'activityLogs'));

    return unsubscribe;
  }, []);

  const handleClearAll = async () => {
    setIsClearing(true);
    try {
      // Create a query to get all logs
      const q = query(collection(db, 'activityLogs'));
      const snapshot = await getDocs(q);
      
      if (snapshot.empty) {
        toast.info("No activity logs to clear");
        return;
      }

      // Process in batches of 500 (Firestore limit)
      const batches = [];
      let currentBatch = writeBatch(db);
      let operationCount = 0;

      snapshot.docs.forEach((document) => {
        currentBatch.delete(doc(db, 'activityLogs', document.id));
        operationCount++;

        if (operationCount === 500) {
          batches.push(currentBatch.commit());
          currentBatch = writeBatch(db);
          operationCount = 0;
        }
      });

      if (operationCount > 0) {
        batches.push(currentBatch.commit());
      }

      await Promise.all(batches);
      toast.success("System audit trail has been successfully cleared.", {
        icon: '🗑️'
      });
      setIsConfirmOpen(false);
    } catch (error) {
      console.error("Error clearing logs:", error);
      toast.error("Failed to clear activity logs. You may not have the required permissions.", {
        icon: <AlertTriangle className="h-4 w-4 text-red-500" />
      });
      handleFirestoreError(error, OperationType.DELETE, 'activityLogs');
    } finally {
      setIsClearing(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between gap-4 items-start sm:items-end">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-[#FAF7F2] flex items-center gap-2">
            <Activity className="h-6 w-6 text-[#1D9E75]" /> System Audit Trail
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
          <AlertDialogContent className="bg-[#141210] border-[#3A3230] text-[#FAF7F2]">
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2 text-red-500">
                <AlertTriangle className="h-5 w-5" />
                Clear System Audit Trail
              </AlertDialogTitle>
              <AlertDialogDescription className="text-[#7A736E]">
                Are you absolutely sure you want to delete all activity logs? This action is permanent and cannot be undone. All historical tracking data will be lost.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="mt-6">
              <AlertDialogCancel 
                disabled={isClearing}
                className="bg-transparent border-[#3A3230] text-[#FAF7F2] hover:bg-[#3A3230]"
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

      <div className="border border-[#3A3230] bg-[#0A0C10] flex-1 overflow-hidden flex flex-col">
        <div className="overflow-x-auto flex-1">
          <Table>
            <TableHeader className="bg-[#1A1614]">
              <TableRow className="border-[#3A3230] hover:bg-transparent">
                <TableHead className="text-[10px] whitespace-nowrap font-mono text-[#7A736E] uppercase tracking-wider w-[180px]">TIMESTAMP</TableHead>
                <TableHead className="text-[10px] whitespace-nowrap font-mono text-[#7A736E] uppercase tracking-wider">TYPE</TableHead>
                <TableHead className="text-[10px] whitespace-nowrap font-mono text-[#7A736E] uppercase tracking-wider">OPERATOR ID</TableHead>
                <TableHead className="text-[10px] whitespace-nowrap font-mono text-[#7A736E] uppercase tracking-wider min-w-[200px]">DETAILS</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className="text-sm font-mono">
              {logs.map((log) => {
                const date = log.timestamp?.toDate ? log.timestamp.toDate() : new Date(log.timestamp || Date.now());
                return (
                  <TableRow key={log.id} className="border-[#3A3230] bg-[#141210] hover:bg-[#1A1614] transition-colors">
                    <TableCell className="text-[#7A736E] whitespace-nowrap">
                      {date.toLocaleString()}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      <span className="text-[#7A736E]">
                        {log.type}
                      </span>
                    </TableCell>
                    <TableCell className="text-[#1D9E75] truncate max-w-[150px]" title={log.userId}>
                      {log.userId}
                    </TableCell>
                    <TableCell className="text-[#FAF7F2] font-sans break-words whitespace-normal min-w-[200px]">
                      {log.details}
                    </TableCell>
                  </TableRow>
                );
              })}
              {logs.length === 0 && (
                <TableRow className="border-[#3A3230] bg-[#141210]">
                  <TableCell colSpan={4} className="h-24 text-center font-mono text-[#7A736E] uppercase tracking-widest text-[10px]">
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
