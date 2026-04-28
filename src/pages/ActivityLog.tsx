import { useState, useEffect } from 'react';
import { db } from '../lib/firebase';
import { collection, onSnapshot, query, orderBy, limit } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '../lib/firestore-error';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Activity } from 'lucide-react';

interface Log {
  id: string;
  type: string;
  userId: string;
  details: string;
  timestamp: any;
}

export function ActivityLog() {
  const [logs, setLogs] = useState<Log[]>([]);

  useEffect(() => {
    const q = query(collection(db, 'activityLogs'), orderBy('timestamp', 'desc'), limit(100));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const msgs: Log[] = [];
      snapshot.forEach(doc => msgs.push({ id: doc.id, ...doc.data() } as Log));
      setLogs(msgs);
    }, (e) => handleFirestoreError(e, OperationType.GET, 'activityLogs'));

    return unsubscribe;
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-[#FAF7F2] flex items-center gap-2">
          <Activity className="h-6 w-6 text-[#1D9E75]" /> System Audit Trail
        </h2>
        <p className="text-sm font-mono text-[#7A736E]">Chronological immutable activity log</p>
      </div>

      <div className="border border-[#3A3230] bg-[#0A0C10] flex-1 overflow-hidden flex flex-col">
        <Table>
          <TableHeader className="bg-[#1A1614]">
            <TableRow className="border-[#3A3230] hover:bg-transparent">
              <TableHead className="text-[10px] font-mono text-[#7A736E] uppercase tracking-wider w-[180px]">TIMESTAMP</TableHead>
              <TableHead className="text-[10px] font-mono text-[#7A736E] uppercase tracking-wider">TYPE</TableHead>
              <TableHead className="text-[10px] font-mono text-[#7A736E] uppercase tracking-wider">OPERATOR ID</TableHead>
              <TableHead className="text-[10px] font-mono text-[#7A736E] uppercase tracking-wider">DETAILS</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className="text-sm font-mono">
            {logs.map((log) => {
              const date = log.timestamp?.toDate ? log.timestamp.toDate() : new Date(log.timestamp || Date.now());
              return (
                <TableRow key={log.id} className="border-[#3A3230] bg-[#141210] hover:bg-[#1A1614] transition-colors">
                  <TableCell className="text-[#7A736E]">
                    {date.toLocaleString()}
                  </TableCell>
                  <TableCell>
                    <span className="text-[#7A736E]">
                      {log.type}
                    </span>
                  </TableCell>
                  <TableCell className="text-[#1D9E75] truncate max-w-[150px]" title={log.userId}>
                    {log.userId}
                  </TableCell>
                  <TableCell className="text-[#FAF7F2] font-sans">
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
  );
}
