import { useState, useEffect, useMemo, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { db, collection, onSnapshot, query, orderBy, limit, writeBatch, doc, getDocs } from '../lib/realtime';
import { formatCurrency } from '../lib/utils';
import { PackageSearch, TrendingUp, AlertTriangle, Activity, PieChart as PieChartIcon } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend, Sector } from 'recharts';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { RevenueTrendsChart } from '../components/RevenueTrendsChart';

// ui components
import { Button } from '../components/ui/button';
import { toast } from 'sonner';
import { Loader2, Trash2 } from 'lucide-react';


interface Stats {
  totalProducts: number;
  lowStockItems: number;
  totalSales: number;
  recentTransactionsCount: number;
  inventoryValueCost: number;
  inventoryValueRetail: number;
}

const renderActiveShape = (props: any) => {
  const RADIAN = Math.PI / 180;
  const { cx, cy, midAngle, innerRadius, outerRadius, startAngle, endAngle, fill, payload, percent, value } = props;
  const sin = Math.sin(-RADIAN * midAngle);
  const cos = Math.cos(-RADIAN * midAngle);
  const sx = cx + (outerRadius + 10) * cos;
  const sy = cy + (outerRadius + 10) * sin;
  const mx = cx + (outerRadius + 30) * cos;
  const my = cy + (outerRadius + 30) * sin;
  const ex = mx + (cos >= 0 ? 1 : -1) * 22;
  const ey = my;
  const textAnchor = cos >= 0 ? 'start' : 'end';

  return (
    <g>
      <text x={cx} y={cy} dy={8} textAnchor="middle" fill="#FAF7F2" className="text-xl font-bold font-mono">
        {payload.name}
      </text>
      <Sector
        cx={cx}
        cy={cy}
        innerRadius={innerRadius}
        outerRadius={outerRadius + 8}
        startAngle={startAngle}
        endAngle={endAngle}
        fill={fill}
      />
      <Sector
        cx={cx}
        cy={cy}
        startAngle={startAngle}
        endAngle={endAngle}
        innerRadius={outerRadius + 10}
        outerRadius={outerRadius + 14}
        fill={fill}
      />
      <path d={`M${sx},${sy}L${mx},${my}L${ex},${ey}`} stroke={fill} fill="none" />
      <circle cx={ex} cy={ey} r={2} fill={fill} stroke="none" />
      <text x={ex + (cos >= 0 ? 1 : -1) * 12} y={ey} textAnchor={textAnchor} fill="#FAF7F2" className="text-sm font-mono">{`₱${formatCurrency(value)}`}</text>
      <text x={ex + (cos >= 0 ? 1 : -1) * 12} y={ey} dy={18} textAnchor={textAnchor} fill="#7A736E" className="text-xs font-mono">
        {`(Rate ${(percent * 100).toFixed(2)}%)`}
      </text>
    </g>
  );
};

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
  const [activeIndex, setActiveIndex] = useState(0);
  const { role } = useAuth();
  const navigate = useNavigate();

  const isInitialLoad = useRef(true);
  const prevProductsRef = useRef(new Map<string, any>());

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

  const salesByCategory = useMemo(() => {
    if (products.length === 0 || transactions.length === 0) return [];
    
    const categorySalesMap = new Map<string, number>();
    const productMap = new Map<string, any>();
    products.forEach(p => productMap.set(p.id, p));

    transactions.forEach(t => {
      if (t.status === 'COMPLETED' && t.items && Array.isArray(t.items)) {
        t.items.forEach((item: any) => {
          const product = productMap.get(item.productId);
          const category = product?.category || 'Uncategorized';
          const salesAmount = (item.quantity || 0) * (item.price || 0);
          categorySalesMap.set(category, (categorySalesMap.get(category) || 0) + salesAmount);
        });
      }
    });

    const sortedCategories = Array.from(categorySalesMap.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);

    // Group into 'Other' if more than 5 categories
    if (sortedCategories.length > 5) {
      const topCategories = sortedCategories.slice(0, 5);
      const otherValue = sortedCategories.slice(5).reduce((acc, curr) => acc + curr.value, 0);
      topCategories.push({ name: 'Other', value: otherValue });
      return topCategories;
    }

    return sortedCategories;
  }, [products, transactions]);

  const COLORS = ['#FF6F00', '#1D9E75', '#8E44AD', '#3498DB', '#E74C3C', '#F1C40F', '#34495E', '#1ABC9C'];

  useEffect(() => {
    // Basic stats aggregation
    const unsubProducts = onSnapshot(collection(db, 'products'), (snapshot) => {
      let totalProducts = 0;
      let lowStockItems = 0;
      let inventoryValueCost = 0;
      let inventoryValueRetail = 0;
      const prods: any[] = [];

      if (!isInitialLoad.current) {
        snapshot.docChanges().forEach(change => {
          if (change.type === 'modified') {
            const data = change.doc.data();
            const id = change.doc.id;
            const prevData = prevProductsRef.current.get(id);
            const minStock = data.minStock || 0;
            
            if (data.stock <= minStock && prevData && prevData.stock > minStock) {
              toast.error(`Low Stock Alert: ${data.name}`, {
                description: `Current stock dropped to ${data.stock} (Min: ${minStock})`,
                action: {
                  label: 'Reorder Now',
                  onClick: () => navigate('/inventory', { state: { createPO: true, productId: id, qty: minStock * 2 || 10 } })
                },
                duration: 10000,
              });
            }
          }
        });
      }

      snapshot.forEach((doc) => {
        totalProducts++;
        const data = doc.data();
        prods.push({ id: doc.id, ...data });
        prevProductsRef.current.set(doc.id, data);
        if (data.stock <= (data.minStock || 0)) lowStockItems++;
        inventoryValueCost += (data.stock || 0) * (data.cost || 0);
        inventoryValueRetail += (data.stock || 0) * (data.price || 0);
      });

      isInitialLoad.current = false;
      setStats(s => ({ ...s, totalProducts, lowStockItems, inventoryValueCost, inventoryValueRetail }));
      setProducts(prods);
    }, (e) => console.error('Error fetching products:', e));

    const unsubTransactions = onSnapshot(query(collection(db, 'transactions'), orderBy('createdAt', 'desc'), limit(200)), (snapshot) => {
      let totalSales = 0;
      let recentCount = 0;
      
      // Mock chart data from latest txs
      const dataMap = new Map<string, number>();
      const txs: any[] = [];

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      snapshot.forEach((doc) => {
        const data = doc.data();
        txs.push({ id: doc.id, ...data });
        
        let date: Date | null = null;
        if (data.createdAt) {
          if (typeof data.createdAt?.toDate === 'function') {
            date = data.createdAt.toDate();
          } else {
            // Fallback for timestamp alternatives or strings
            date = new Date(data.createdAt.seconds ? data.createdAt.seconds * 1000 : data.createdAt);
          }
        }

        if (data.status === 'COMPLETED' && date && date >= today) {
          totalSales += data.totalAmount;
          recentCount++;
          
          if (!isNaN(date.getTime())) {
            const hour = date.getHours().toString().padStart(2, '0');
            const label = `${hour}:00`;
            dataMap.set(label, (dataMap.get(label) || 0) + data.totalAmount);
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
      setSalesError("Unable to load performance data.");
      setIsLoadingSales(false);
      console.error('Transactions load error:', e);
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
           <p className="text-sm font-mono text-[#7A736E]">Real-time operational metrics and tracking</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <div className="flex flex-col gap-4 lg:col-span-1">
          <Card className="bg-white/[0.03] backdrop-blur-xl border border-white/[0.08] shadow-[0_8px_32px_rgba(0,0,0,0.25)] hover:border-white/[0.16] transition-all rounded-xl">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-xs font-mono font-medium text-[#8E857E] uppercase tracking-wider">
                SESSION REVENUE
              </CardTitle>
              <div className="p-1.5 rounded-lg bg-[#1D9E75]/15 border border-[#1D9E75]/30">
                <TrendingUp className="h-4 w-4 text-[#1D9E75]" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold font-mono text-[#FAF7F2]">₱{formatCurrency(stats.totalSales)}</div>
              <p className="text-xs font-mono text-[#1D9E75] mt-1">+12% vs last shift</p>
            </CardContent>
          </Card>
          
          <Card className="bg-white/[0.03] backdrop-blur-xl border border-white/[0.08] shadow-[0_8px_32px_rgba(0,0,0,0.25)] hover:border-white/[0.16] transition-all rounded-xl">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-xs font-mono font-medium text-[#8E857E] uppercase tracking-wider">
                TRANSACTIONS (LATEST)
              </CardTitle>
              <div className="p-1.5 rounded-lg bg-[#FF6F00]/15 border border-[#FF6F00]/30">
                <Activity className="h-4 w-4 text-[#FF6F00]" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold font-mono text-[#FAF7F2]">{stats.recentTransactionsCount}</div>
            </CardContent>
          </Card>
        </div>

        <Card className="bg-white/[0.03] backdrop-blur-2xl border border-white/[0.1] lg:col-span-3 overflow-hidden relative group rounded-2xl shadow-[0_16px_48px_rgba(0,0,0,0.35)]">
          <div className="absolute inset-0 bg-gradient-to-br from-white/[0.02] to-[#FF6F00]/[0.04] pointer-events-none transition-opacity duration-500 opacity-60 group-hover:opacity-100"></div>
          <CardHeader className="flex flex-row items-center justify-between pb-3 border-b border-white/[0.08]">
            <CardTitle className="text-xs font-mono tracking-widest text-[#FF6F00] uppercase flex items-center gap-2">
              <PackageSearch className="h-4 w-4" />
              Inventory Valuation
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6 grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-4 gap-6 relative z-10">
            <div className="flex flex-col gap-1 lg:col-span-2">
              <span className="text-[10px] text-[#8E857E] font-mono tracking-widest uppercase mb-1">Total Retail Value</span>
              <span className="text-4xl lg:text-5xl font-mono font-bold text-[#FAF7F2] tracking-tight">₱{formatCurrency(stats.inventoryValueRetail)}</span>
              <div className="mt-2 text-xs text-[#1D9E75] font-mono font-semibold flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-[#1D9E75] animate-pulse"></span>
                Estimated Margin: ₱{formatCurrency(stats.inventoryValueRetail - stats.inventoryValueCost)}
              </div>
            </div>
            
            <div className="flex flex-col gap-1">
              <span className="text-[10px] text-[#8E857E] font-mono tracking-widest uppercase">Catalog Size</span>
              <span className="text-2xl font-bold font-mono text-[#FAF7F2]">{stats.totalProducts} <span className="text-xs font-sans font-normal text-[#8E857E]">items</span></span>
              
              <span className="text-[10px] text-[#8E857E] font-mono tracking-widest uppercase mt-4">Total Cost</span>
              <span className="text-xl font-bold font-mono text-[#8E857E]">₱{formatCurrency(stats.inventoryValueCost)}</span>
            </div>
            
            <div className="flex flex-col gap-1 rounded-xl bg-white/[0.03] backdrop-blur-md p-4 border border-white/[0.08]">
              <span className="text-[10px] text-[#8E857E] font-mono tracking-widest uppercase flex justify-between items-center">
                Action Items
                <AlertTriangle className={`h-3.5 w-3.5 ${stats.lowStockItems > 0 ? "text-amber-500 animate-pulse" : "text-[#8E857E]"}`} />
              </span>
              <div className="mt-auto">
                <span className={`text-3xl font-bold font-mono ${stats.lowStockItems > 0 ? 'text-amber-400' : 'text-[#8E857E]'}`}>
                  {stats.lowStockItems}
                </span>
                <span className="text-xs text-[#8E857E] block mt-1 uppercase font-mono tracking-wider mb-2">Low Stock Alerts</span>
                {stats.lowStockItems > 0 && (
                  <Button 
                    variant="outline" 
                    size="sm"
                    className="w-full text-[10px] uppercase tracking-widest h-7 border-amber-500/40 text-amber-400 bg-amber-500/10 hover:bg-amber-500/20 hover:text-amber-300 font-mono rounded-lg transition-all"
                    onClick={() => navigate('/inventory', { state: { createPO: true } })}
                  >
                    View & Reorder
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-stretch">
        {/* Main Revenue & Sales Trends Visualization (Daily, Weekly, Hourly) */}
        <div className="lg:col-span-2">
          <RevenueTrendsChart 
            transactions={transactions}
            isLoading={isLoadingSales}
            onNavigateToReports={() => navigate('/reports')}
          />
        </div>

        {/* AI Insight Assistant Card */}
        <Card className="glass-card rounded-2xl border border-white/[0.08] shadow-[0_8px_32px_rgba(0,0,0,0.3)] relative overflow-hidden flex flex-col justify-between">
          <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
             <Activity className="h-32 w-32" />
          </div>
          <CardHeader className="border-b border-white/[0.08] pb-4">
            <CardTitle className="text-xs font-mono text-[#1D9E75] flex items-center gap-2 uppercase tracking-widest">
              <span className="w-2 h-2 rounded-full bg-[#1D9E75] animate-ping" /> AI Store Intelligence
            </CardTitle>
          </CardHeader>
          <CardContent className="flex-1 flex flex-col pt-4">
            <div className="space-y-4 flex-1 flex flex-col">
               {forecastData && forecastData.length > 0 ? (
                 <div className="bg-white/[0.03] p-4 rounded-xl border border-white/[0.08] backdrop-blur-md">
                   <div className="text-xs text-[#8E857E] font-mono mb-2 flex items-center justify-between">
                     <span>LOW STOCK FORECAST</span>
                     <span className="text-[#FF6F00] font-semibold">{forecastData.length} items flagged</span>
                   </div>
                   <div className="text-sm text-[#FAF7F2] leading-relaxed">
                     Based on current sales velocity, <span className="font-bold text-[#FF6F00]">{forecastData[0].name}</span> has approximately <span className="font-bold">{forecastData[0].daysLeft.toFixed(1)} days</span> of stock remaining. 
                     Suggested reorder: <span className="font-bold text-[#1D9E75]">{forecastData[0].reorderQty} units</span>.
                   </div>
                 </div>
               ) : (
                 <div className="bg-white/[0.03] p-4 rounded-xl border border-white/[0.08] backdrop-blur-md">
                   <div className="text-xs text-[#8E857E] font-mono mb-2">INVENTORY STABLE</div>
                   <div className="text-sm text-[#FAF7F2] leading-relaxed">
                     No critical stock depletion warnings detected based on recent sales.
                   </div>
                 </div>
               )}
               
               <div className="text-center mt-auto pb-2 pt-4">
                 <button 
                   onClick={() => window.dispatchEvent(new CustomEvent('open-terminal'))}
                   className="w-full text-[#FF6F00] hover:text-[#FAF7F2] font-mono text-xs px-3 py-2 rounded-xl bg-[#FF6F00]/10 border border-[#FF6F00]/30 hover:bg-[#FF6F00]/20 transition-all shadow-sm flex items-center justify-center gap-1.5"
                 >
                   <span>Open Foresight Terminal (F4)</span>
                   <span>→</span>
                 </button>
               </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-6 items-start">
        {/* Detailed Foresight Forecast */}
        <div className="lg:col-span-2">
          <Card className="glass-card rounded-2xl border border-white/[0.08] shadow-[0_8px_32px_rgba(0,0,0,0.3)] flex flex-col min-h-[350px]">
            <CardHeader className="border-b border-white/[0.08] pb-4">
              <CardTitle className="text-xs font-mono text-[#FAF7F2] uppercase tracking-widest flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-[#FF6F00]" />
                Stockout Predictions & Replenishment
              </CardTitle>
            </CardHeader>
            <CardContent className="flex-1 p-0">
              {forecastData && forecastData.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead className="text-[11px] font-mono uppercase bg-white/[0.03] text-[#8E857E] border-b border-white/[0.08]">
                      <tr>
                        <th className="px-6 py-3.5 font-medium">Product</th>
                        <th className="px-6 py-3.5 font-medium text-right">Current Stock</th>
                        <th className="px-6 py-3.5 font-medium text-right">Velocity</th>
                        <th className="px-6 py-3.5 font-medium text-right">Depletion Est.</th>
                        <th className="px-6 py-3.5 font-medium text-right text-[#1D9E75]">Suggested Order</th>
                        <th className="px-6 py-3.5 font-medium text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/[0.05]">
                      {forecastData.map((item) => {
                        const isCritical = item.daysLeft <= 3;
                        const isWarning = item.daysLeft <= 7 && !isCritical;
                        return (
                          <tr key={item.id} className="hover:bg-white/[0.04] text-[#FAF7F2] transition-colors">
                            <td className="px-6 py-3.5 font-medium">{item.name}</td>
                            <td className="px-6 py-3.5 text-right font-mono tabular-nums">{item.stock}</td>
                            <td className="px-6 py-3.5 text-right font-mono tabular-nums text-[#8E857E]">{item.velocity.toFixed(2)}/day</td>
                            <td className={`px-6 py-3.5 text-right font-mono tabular-nums font-bold ${isCritical ? 'text-red-400' : isWarning ? 'text-[#FF6F00]' : ''}`}>
                              {item.daysLeft.toFixed(1)} days
                            </td>
                            <td className="px-6 py-3.5 text-right font-mono tabular-nums font-bold text-[#1D9E75]">
                              {item.reorderQty} units
                            </td>
                            <td className="px-6 py-3.5 text-right">
                               <button 
                                 className="px-2.5 py-1 bg-[#FF6F00]/10 hover:bg-[#FF6F00]/25 text-[#FF6F00] text-[10px] uppercase font-mono tracking-wider rounded-md border border-[#FF6F00]/30 transition-colors"
                                 onClick={() => navigate('/inventory', { state: { createPO: true, productId: item.id, qty: item.reorderQty } })}
                               >
                                 Create PO
                               </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="h-full w-full min-h-[250px] flex flex-col items-center justify-center text-[#8E857E] font-mono py-10">
                   <PackageSearch className="w-10 h-10 mb-2 opacity-30 text-[#FF6F00]" />
                   <span className="text-xs uppercase tracking-wider">Inventory Levels Nominal</span>
                   <span className="text-[11px] mt-1 text-[#8E857E]">No stock depletion predicted in current operational cycle.</span>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Sales By Category */}
        <div className="lg:col-span-1">
          <Card className="glass-card rounded-2xl border border-white/[0.08] shadow-[0_8px_32px_rgba(0,0,0,0.3)] flex flex-col min-h-[350px] h-full">
            <CardHeader className="border-b border-white/[0.08] pb-4">
              <CardTitle className="text-xs font-mono text-[#FAF7F2] uppercase tracking-widest flex items-center gap-2">
                <PieChartIcon className="h-4 w-4 text-[#1D9E75]" />
                Sales By Category
              </CardTitle>
            </CardHeader>
            <CardContent className="flex-1 w-full relative pt-4 flex flex-col items-center justify-center">
              {isLoadingSales ? (
                <div className="flex flex-col items-center justify-center font-mono text-[#8E857E] animate-pulse">
                  <Activity className="h-6 w-6 mb-2 opacity-50" />
                  <span className="text-xs tracking-widest">CALCULATING...</span>
                </div>
              ) : salesError ? (
                <div className="flex flex-col items-center justify-center font-mono text-red-400 px-6 text-center">
                  <AlertTriangle className="h-6 w-6 mb-2 opacity-80" />
                  <span className="text-xs">{salesError}</span>
                </div>
              ) : salesByCategory.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      // @ts-ignore
                      activeIndex={activeIndex}
                      activeShape={renderActiveShape}
                      data={salesByCategory}
                      cx="50%"
                      cy="45%"
                      innerRadius={50}
                      outerRadius={70}
                      dataKey="value"
                      onMouseEnter={(_, index) => setActiveIndex(index)}
                      stroke="none"
                    >
                      {salesByCategory.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip 
                      contentStyle={{ backgroundColor: 'rgba(20, 18, 16, 0.88)', backdropFilter: 'blur(16px)', border: '1px solid rgba(255, 255, 255, 0.12)', borderRadius: '12px', boxShadow: '0 20px 40px rgba(0, 0, 0, 0.6)' }}
                      itemStyle={{ color: '#FAF7F2', fontWeight: 600, fontSize: '13px', fontFamily: 'monospace' }}
                      formatter={(value: number, name: string) => [`₱${formatCurrency(value)}`, name]}
                    />
                    <Legend 
                      verticalAlign="bottom" 
                      height={40} 
                      iconType="circle"
                      formatter={(value) => <span className="text-[10px] font-mono text-[#FAF7F2] ml-1">{value}</span>}
                    />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex flex-col items-center justify-center font-mono text-[#8E857E]">
                  <Activity className="w-8 h-8 opacity-20 mb-3" />
                  <span className="text-xs tracking-widest">NO DATA AVAILABLE</span>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
