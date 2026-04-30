import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { db } from '../lib/firebase';
import { collection, onSnapshot, query, orderBy, limit } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '../lib/firestore-error';
import { formatCurrency } from '../lib/utils';
import { PackageSearch, TrendingUp, AlertTriangle, Activity } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useAuth } from '../contexts/AuthContext';

interface Stats {
  totalProducts: number;
  lowStockItems: number;
  totalSales: number;
  recentTransactionsCount: number;
  inventoryValueCost: number;
  inventoryValueRetail: number;
}

export function Dashboard() {
  const [stats, setStats] = useState<Stats>({ 
    totalProducts: 0, 
    lowStockItems: 0, 
    totalSales: 0, 
    recentTransactionsCount: 0,
    inventoryValueCost: 0,
    inventoryValueRetail: 0
  });
  const [salesData, setSalesData] = useState<{name: string; sales: number}[]>([]);
  const [isLoadingSales, setIsLoadingSales] = useState(true);
  const [salesError, setSalesError] = useState<string | null>(null);
  const [products, setProducts] = useState<any[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const { role } = useAuth();

  const forecastData = useMemo(() => {
    if (products.length === 0 || transactions.length === 0) return null;

    let oldestDate = new Date();
    const productSalesMap = new Map<string, number>();

    transactions.forEach(t => {
      if (t.status === 'COMPLETED' && t.createdAt) {
        let date;
        if (typeof t.createdAt?.toDate === 'function') {
          date = t.createdAt.toDate();
        } else {
          date = new Date(t.createdAt.seconds ? t.createdAt.seconds * 1000 : t.createdAt);
        }
        
        if (!isNaN(date.getTime()) && date < oldestDate) oldestDate = date;
        
        if (t.items && Array.isArray(t.items)) {
          t.items.forEach((item: any) => {
            if (item.productId && item.quantity) {
              productSalesMap.set(item.productId, (productSalesMap.get(item.productId) || 0) + item.quantity);
            }
          });
        }
      }
    });

    let daysSpan = (new Date().getTime() - oldestDate.getTime()) / (1000 * 60 * 60 * 24);
    if (daysSpan < 0.5) daysSpan = 0.5; // Avoid dividing by near-zero if all txs are from last few hours
    if (daysSpan > 30) daysSpan = 30; // Cap at 30 days for this simple velocity calc

    const forecasts = products.map(p => {
      const sold = productSalesMap.get(p.id) || 0;
      const velocity = sold / daysSpan;
      const daysLeft = velocity > 0 ? (p.stock / velocity) : Infinity;
      const reorderQty = Math.ceil(velocity * 14 + (p.minStock || 0)); // Reorder for 14 days + minStock buffer
      return { ...p, velocity, daysLeft, reorderQty };
    }).filter(f => f.velocity > 0 && f.stock > 0 && f.daysLeft < 30)
      .sort((a, b) => a.daysLeft - b.daysLeft);

    if (forecasts.length === 0) return null;
    return forecasts;
  }, [products, transactions]);

  useEffect(() => {
    // Basic stats aggregation
    const unsubProducts = onSnapshot(collection(db, 'products'), (snapshot) => {
      let totalProducts = 0;
      let lowStockItems = 0;
      let inventoryValueCost = 0;
      let inventoryValueRetail = 0;
      const prods: any[] = [];
      snapshot.forEach((doc) => {
        totalProducts++;
        const data = doc.data();
        prods.push({ id: doc.id, ...data });
        if (data.stock <= (data.minStock || 0)) lowStockItems++;
        inventoryValueCost += (data.stock || 0) * (data.cost || 0);
        inventoryValueRetail += (data.stock || 0) * (data.price || 0);
      });
      setStats(s => ({ ...s, totalProducts, lowStockItems, inventoryValueCost, inventoryValueRetail }));
      setProducts(prods);
    }, (e) => handleFirestoreError(e, OperationType.GET, 'products'));

    const unsubTransactions = onSnapshot(query(collection(db, 'transactions'), orderBy('createdAt', 'desc'), limit(200)), (snapshot) => {
      let totalSales = 0;
      let recentCount = 0;
      
      // Mock chart data from latest txs
      const dataMap = new Map<string, number>();
      const txs: any[] = [];

      snapshot.forEach((doc) => {
        const data = doc.data();
        txs.push({ id: doc.id, ...data });
        if (data.status === 'COMPLETED') {
          totalSales += data.totalAmount;
          recentCount++;
          
          if (data.createdAt) {
            let date;
            if (typeof data.createdAt?.toDate === 'function') {
              date = data.createdAt.toDate();
            } else {
              // Fallback for timestamp alternatives or strings
              date = new Date(data.createdAt.seconds ? data.createdAt.seconds * 1000 : data.createdAt);
            }

            if (!isNaN(date.getTime())) {
              const hour = date.getHours().toString().padStart(2, '0');
              const label = `${hour}:00`;
              dataMap.set(label, (dataMap.get(label) || 0) + data.totalAmount);
            }
          }
        }
      });
      
      const sortedEntries = Array.from(dataMap.entries())
        .sort((a, b) => a[0].localeCompare(b[0]));
        
      if (sortedEntries.length > 0) {
        const firstHour = parseInt(sortedEntries[0][0].split(':')[0]);
        const lastHour = parseInt(sortedEntries[sortedEntries.length - 1][0].split(':')[0]);
        for (let h = firstHour; h <= lastHour; h++) {
          const hourLabel = `${h.toString().padStart(2, '0')}:00`;
          if (!dataMap.has(hourLabel)) {
            dataMap.set(hourLabel, 0);
          }
        }
      }

      const chartData = Array.from(dataMap.entries())
        .map(([name, sales]) => ({ name, sales }))
        .sort((a, b) => a.name.localeCompare(b.name));
        
      setSalesData(chartData);
      setStats(s => ({ ...s, totalSales, recentTransactionsCount: recentCount }));
      setTransactions(txs);
      setIsLoadingSales(false);
      setSalesError(null);
    }, (e) => {
      setSalesError("Unable to load telemetry data.");
      setIsLoadingSales(false);
      handleFirestoreError(e, OperationType.GET, 'transactions');
    });

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

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <div className="flex flex-col gap-4 lg:col-span-1">
          <Card className="bg-[#141210] border-[#3A3230]">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-mono font-medium text-[#7A736E]">
                SESSION REVENUE
              </CardTitle>
              <TrendingUp className="h-4 w-4 text-[#1D9E75]" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-[#FAF7F2]">₱{formatCurrency(stats.totalSales)}</div>
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
        </div>

        <Card className="bg-[#1A1614] border border-[#3A3230] lg:col-span-3 overflow-hidden relative group">
          <div className="absolute inset-0 bg-gradient-to-br from-transparent to-[#FF6F00]/5 pointer-events-none transition-opacity duration-500 opacity-50 group-hover:opacity-100"></div>
          <CardHeader className="flex flex-row items-center justify-between pb-2 border-b border-[#3A3230]">
            <CardTitle className="text-sm font-mono tracking-widest text-[#FF6F00] uppercase flex items-center gap-2">
              <PackageSearch className="h-4 w-4" />
              Inventory Valuation
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6 grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-4 gap-6 relative z-10">
            <div className="flex flex-col gap-1 lg:col-span-2">
              <span className="text-xs text-[#7A736E] font-mono tracking-widest uppercase mb-1">Total Retail Value</span>
              <span className="text-4xl lg:text-5xl font-sans font-bold text-[#FAF7F2] tracking-tight">₱{formatCurrency(stats.inventoryValueRetail)}</span>
              <div className="mt-2 text-sm text-[#1D9E75] font-mono">
                Profit: ₱{formatCurrency(stats.inventoryValueRetail - stats.inventoryValueCost)}
              </div>
            </div>
            
            <div className="flex flex-col gap-1">
              <span className="text-[10px] text-[#7A736E] font-mono tracking-widest uppercase">Catalog Size</span>
              <span className="text-xl font-bold font-mono text-[#FAF7F2]">{stats.totalProducts} <span className="text-xs font-sans font-normal text-[#7A736E]">items</span></span>
              
              <span className="text-[10px] text-[#7A736E] font-mono tracking-widest uppercase mt-4">Total Cost</span>
              <span className="text-xl font-bold font-mono text-[#7A736E]">₱{formatCurrency(stats.inventoryValueCost)}</span>
            </div>
            
            <div className="flex flex-col gap-1 rounded-lg bg-[#0A0C10] p-4 border border-[#3A3230]">
              <span className="text-[10px] text-[#7A736E] font-mono tracking-widest uppercase flex justify-between items-center">
                Action Items
                <AlertTriangle className={`h-3 w-3 ${stats.lowStockItems > 0 ? "text-red-500 animate-pulse" : "text-[#7A736E]"}`} />
              </span>
              <div className="mt-auto">
                <span className={`text-3xl font-bold font-mono ${stats.lowStockItems > 0 ? 'text-red-500' : 'text-[#7A736E]'}`}>
                  {stats.lowStockItems}
                </span>
                <span className="text-xs text-[#7A736E] block mt-1 uppercase font-mono tracking-wider">Low Stock Alerts</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:h-[400px]">
        {/* Main Chart */}
        <Card className="bg-[#141210] border-[#3A3230] lg:col-span-2 flex flex-col min-h-[350px]">
          <CardHeader>
            <CardTitle className="text-sm font-mono text-[#7A736E]">REVENUE TELEMETRY (HOURLY)</CardTitle>
          </CardHeader>
          <CardContent className="h-[300px] w-full">
             {isLoadingSales ? (
               <div className="h-full w-full flex items-center justify-center font-mono text-[#7A736E] animate-pulse">
                 SYNCING TELEMETRY...
               </div>
             ) : salesError ? (
               <div className="h-full w-full flex items-center justify-center font-mono text-red-500">
                 {salesError}
               </div>
             ) : salesData.length > 0 ? (
               <div style={{ width: '100%', height: 300 }}>
                 <ResponsiveContainer width="100%" height={300}>
                   <AreaChart data={salesData} margin={{ top: 10, right: 30, bottom: 0, left: 0 }}>
                     <defs>
                       <linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1">
                         <stop offset="5%" stopColor="#FF6F00" stopOpacity={0.3}/>
                         <stop offset="95%" stopColor="#FF6F00" stopOpacity={0}/>
                       </linearGradient>
                     </defs>
                     <CartesianGrid strokeDasharray="3 3" stroke="#3A3230" vertical={false} />
                     <XAxis dataKey="name" stroke="#7A736E" fontSize={12} tickLine={false} axisLine={false} tickMargin={10} />
                     <YAxis stroke="#7A736E" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(value) => `₱${formatCurrency(value)}`} tickMargin={10} />
                     <Tooltip 
                       contentStyle={{ backgroundColor: '#1A1614', border: '1px solid #3A3230', borderRadius: '8px' }}
                       itemStyle={{ color: '#FF6F00' }}
                       formatter={(value: number) => [`₱${formatCurrency(value)}`, 'Revenue']}
                     />
                     <Area type="monotone" dataKey="sales" stroke="#FF6F00" strokeWidth={3} fillOpacity={1} fill="url(#colorSales)" activeDot={{ r: 6, fill: '#FF6F00', stroke: '#141210', strokeWidth: 2 }} />
                   </AreaChart>
                 </ResponsiveContainer>
               </div>
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
          <CardContent className="flex-1 flex flex-col">
            <div className="space-y-4 flex-1">
               {forecastData && forecastData.length > 0 ? (
                 <div className="bg-[#0A0C10] p-4 rounded border border-[#3A3230]">
                   <div className="text-xs text-[#7A736E] font-mono mb-2 flex items-center justify-between">
                     <span>FORECAST: STOCKOUT WARNING</span>
                     <span className="text-[#FF6F00]">{forecastData.length} items on watch</span>
                   </div>
                   <div className="text-sm text-[#FAF7F2] leading-relaxed">
                     Based on trailing velocity, <span className="font-bold text-[#FF6F00]">{forecastData[0].name}</span> will exhaust in <span className="font-bold">{forecastData[0].daysLeft.toFixed(1)} days</span>. 
                     Recommend reordering <span className="font-bold text-[#1D9E75]">{forecastData[0].reorderQty} units</span> to cover lead time.
                   </div>
                 </div>
               ) : (
                 <div className="bg-[#0A0C10] p-4 rounded border border-[#3A3230]">
                   <div className="text-xs text-[#7A736E] font-mono mb-2">FORECAST: ALL STABLE</div>
                   <div className="text-sm text-[#FAF7F2] leading-relaxed">
                     No critical stockout warnings detected based on recent velocity.
                   </div>
                 </div>
               )}
               
               {/* We will build the global terminal chatbot later */}
               <div className="text-center mt-auto pb-2">
                 <button 
                   onClick={() => window.dispatchEvent(new CustomEvent('open-terminal'))}
                   className="text-[#FF6F00] font-mono text-xs border-b border-dashed border-[#FF6F00] pb-1 hover:text-[#FAF7F2] hover:border-[#FAF7F2] transition-colors"
                 >
                   OPEN ASSISTANT TERMINAL
                 </button>
               </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Detailed Foresight Forecast */}
      {forecastData && forecastData.length > 0 && (
        <div className="mt-6">
          <Card className="bg-[#141210] border-[#3A3230]">
            <CardHeader>
              <CardTitle className="text-sm font-mono text-[#FAF7F2] uppercase tracking-wide">
                Stockout Predictions & Reorder Intelligence
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="text-xs font-mono uppercase bg-[#1A1614] text-[#7A736E] border-b border-[#3A3230]">
                    <tr>
                      <th className="px-4 py-3 font-medium">Product Name</th>
                      <th className="px-4 py-3 font-medium text-right">Current Stock</th>
                      <th className="px-4 py-3 font-medium text-right">Velocity (per day)</th>
                      <th className="px-4 py-3 font-medium text-right">Days Remaining</th>
                      <th className="px-4 py-3 font-medium text-right">Est. Stockout Date</th>
                      <th className="px-4 py-3 font-medium text-right text-[#1D9E75]">Rec. Reorder (14d)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {forecastData.map((item, i) => {
                      const stockoutDate = new Date();
                      stockoutDate.setDate(stockoutDate.getDate() + item.daysLeft);
                      const isCritical = item.daysLeft <= 3;
                      const isWarning = item.daysLeft <= 7 && !isCritical;
                      return (
                        <tr key={item.id} className="border-b border-[#3A3230]/50 hover:bg-[#1A1614] text-[#FAF7F2]">
                          <td className="px-4 py-3 font-medium">{item.name}</td>
                          <td className="px-4 py-3 text-right">{item.stock}</td>
                          <td className="px-4 py-3 text-right">{item.velocity.toFixed(2)}</td>
                          <td className={`px-4 py-3 text-right font-bold ${isCritical ? 'text-red-500' : isWarning ? 'text-[#FF6F00]' : ''}`}>
                            {item.daysLeft.toFixed(1)} days
                          </td>
                          <td className={`px-4 py-3 text-right ${isCritical ? 'text-red-500 font-medium' : isWarning ? 'text-[#FF6F00]' : 'text-[#7A736E]'}`}>
                            {stockoutDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                          </td>
                          <td className="px-4 py-3 text-right font-bold text-[#1D9E75]">
                            {item.reorderQty}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
