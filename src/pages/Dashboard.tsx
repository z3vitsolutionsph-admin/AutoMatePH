import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { db } from '../lib/firebase';
import { collection, onSnapshot, query, orderBy, limit } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '../lib/firestore-error';
import { PackageSearch, TrendingUp, AlertTriangle, Activity } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useAuth } from '../contexts/AuthContext';

interface Stats {
  totalProducts: number;
  lowStockItems: number;
  totalSales: number;
  recentTransactionsCount: number;
}

export function Dashboard() {
  const [stats, setStats] = useState<Stats>({ totalProducts: 0, lowStockItems: 0, totalSales: 0, recentTransactionsCount: 0 });
  const [salesData, setSalesData] = useState<{name: string; sales: number}[]>([]);
  const { role } = useAuth();

  useEffect(() => {
    // Basic stats aggregation
    const unsubProducts = onSnapshot(collection(db, 'products'), (snapshot) => {
      let totalProducts = 0;
      let lowStockItems = 0;
      snapshot.forEach((doc) => {
        totalProducts++;
        const data = doc.data();
        if (data.stock <= (data.minStock || 0)) lowStockItems++;
      });
      setStats(s => ({ ...s, totalProducts, lowStockItems }));
    }, (e) => handleFirestoreError(e, OperationType.GET, 'products'));

    const unsubTransactions = onSnapshot(query(collection(db, 'transactions'), orderBy('createdAt', 'desc'), limit(50)), (snapshot) => {
      let totalSales = 0;
      let recentCount = 0;
      
      // Mock chart data from latest 50 txs
      const dataMap = new Map<string, number>();

      snapshot.forEach((doc) => {
        const data = doc.data();
        if (data.status === 'COMPLETED') {
          totalSales += data.totalAmount;
          recentCount++;
          
          if (data.createdAt) {
            const date = data.createdAt.toDate ? data.createdAt.toDate() : new Date(data.createdAt);
            const label = `${date.getHours()}:00`;
            dataMap.set(label, (dataMap.get(label) || 0) + data.totalAmount);
          }
        }
      });
      
      const chartData = Array.from(dataMap.entries()).map(([name, sales]) => ({ name, sales })).reverse();
      setSalesData(chartData);
      setStats(s => ({ ...s, totalSales, recentTransactionsCount: recentCount }));
    }, (e) => handleFirestoreError(e, OperationType.GET, 'transactions'));

    return () => {
      unsubProducts();
      unsubTransactions();
    };
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
           <h2 className="text-2xl font-bold tracking-tight text-[#FAF7F2]">Terminal Overview</h2>
           <p className="text-sm font-mono text-[#7A736E]">Real-time telemetry and operational metrics</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-[#141210] border-[#3A3230]">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-mono font-medium text-[#7A736E]">
              SESSION REVENUE
            </CardTitle>
            <TrendingUp className="h-4 w-4 text-[#1D9E75]" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-[#FAF7F2]">₱{stats.totalSales.toFixed(2)}</div>
            <p className="text-xs font-mono text-[#7A736E] mt-1">+12% vs last shift</p>
          </CardContent>
        </Card>
        <Card className="bg-[#141210] border-[#3A3230]">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-mono font-medium text-[#7A736E]">
              TRANSACTIONS (LAST 50)
            </CardTitle>
            <Activity className="h-4 w-4 text-[#FF6F00]" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-[#FAF7F2]">{stats.recentTransactionsCount}</div>
          </CardContent>
        </Card>
        <Card className="bg-[#141210] border-[#3A3230]">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-mono font-medium text-[#7A736E]">
              CATALOG SIZE
            </CardTitle>
            <PackageSearch className="h-4 w-4 text-[#7A736E]" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-[#FAF7F2]">{stats.totalProducts}</div>
          </CardContent>
        </Card>
        <Card className="bg-[#141210] border-[#3A3230]">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-mono font-medium text-[#7A736E]">
              LOW STOCK ALERTS
            </CardTitle>
            <AlertTriangle className={`h-4 w-4 ${stats.lowStockItems > 0 ? "text-red-500 animate-pulse" : "text-[#7A736E]"}`} />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-[#FAF7F2]">{stats.lowStockItems}</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-[400px]">
        {/* Main Chart */}
        <Card className="bg-[#141210] border-[#3A3230] col-span-2 flex flex-col">
          <CardHeader>
            <CardTitle className="text-sm font-mono text-[#7A736E]">REVENUE TELEMETRY (HOURLY)</CardTitle>
          </CardHeader>
          <CardContent className="flex-1 min-h-[300px]">
            {salesData.length > 0 ? (
               <ResponsiveContainer width="100%" height="100%">
                 <LineChart data={salesData}>
                   <CartesianGrid strokeDasharray="3 3" stroke="#3A3230" vertical={false} />
                   <XAxis dataKey="name" stroke="#7A736E" fontSize={12} tickLine={false} axisLine={false} />
                   <YAxis stroke="#7A736E" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(value) => `₱${value}`} />
                   <Tooltip 
                     contentStyle={{ backgroundColor: '#1A1614', border: '1px solid #3A3230', borderRadius: '8px' }}
                     itemStyle={{ color: '#FF6F00' }}
                   />
                   <Line type="monotone" dataKey="sales" stroke="#FF6F00" strokeWidth={3} dot={{ r: 4, fill: '#1A1614', stroke: '#FF6F00' }} activeDot={{ r: 6, fill: '#FF6F00' }} />
                 </LineChart>
               </ResponsiveContainer>
            ) : (
               <div className="h-full w-full flex items-center justify-center font-mono text-[#7A736E]">AWAITING DATA</div>
            )}
          </CardContent>
        </Card>

        {/* AI Insight Placeholder */}
        <Card className="bg-[#141210] border-[#3A3230] relative overflow-hidden flex flex-col">
          <div className="absolute top-0 right-0 p-4 opacity-10 pointer-events-none">
             <Activity className="h-32 w-32" />
          </div>
          <CardHeader>
            <CardTitle className="text-sm font-mono text-[#1D9E75] flex items-center gap-2 uppercase tracking-wide">
              <span>●</span> AI FORESIGHT (GEMINI)
            </CardTitle>
          </CardHeader>
          <CardContent className="flex-1">
            <div className="space-y-4">
               <div className="bg-[#0A0C10] p-4 rounded border border-[#3A3230]">
                 <div className="text-xs text-[#7A736E] font-mono mb-2">FORECAST: STOCKOUT WARNING</div>
                 <div className="text-sm text-[#FAF7F2] leading-relaxed">
                   Based on trailing 7-day velocity, 'Mineral Water 500ml' will exhaust in 1.4 days. Recommend reordering 200 units.
                 </div>
               </div>
               
               {/* We will build the global terminal chatbot later */}
               <div className="text-center mt-8">
                 <button className="text-[#FF6F00] font-mono text-xs border-b border-dashed border-[#FF6F00] pb-1 hover:text-[#FAF7F2] hover:border-[#FAF7F2] transition-colors">
                   OPEN ASSISTANT TERMINAL
                 </button>
               </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
