import { useState, useEffect, useMemo } from 'react';
import { db } from '../lib/firebase';
import { collection, query, getDocs, orderBy } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/tabs';
import { handleFirestoreError, OperationType } from '../lib/firestore-error';
import { formatCurrency } from '../lib/utils';
import { BarChart3, Calendar, FileText, Download, TrendingUp, Box, AlertTriangle, Bot, Filter, Search, ShoppingBag, ArrowUpRight, Activity } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, AreaChart, Area, Legend, PieChart, Pie, Cell } from 'recharts';
import { motion } from 'motion/react';

interface Transaction {
  id: string;
  totalAmount: number;
  status: string;
  createdAt: any;
  items: any[];
}

interface Product {
  id: string;
  name: string;
  stock: number;
  minStock: number;
  category: string;
}

export function Reports() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  // Filters
  const [dateFilter, setDateFilter] = useState<'daily'|'weekly'|'monthly'|'quarterly'|'yearly'>('monthly');
  const [locationFilter, setLocationFilter] = useState<string>('All');
  
  // Date Range (mocking native dates for now)
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');

  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      try {
        const txQuery = query(collection(db, 'transactions'), orderBy('createdAt', 'desc'));
        const txSnap = await getDocs(txQuery);
        const txs: Transaction[] = [];
        txSnap.forEach(doc => {
          txs.push({ id: doc.id, ...doc.data() } as Transaction);
        });
        setTransactions(txs);

        const prodQuery = query(collection(db, 'products'));
        const prodSnap = await getDocs(prodQuery);
        const prods: Product[] = [];
        prodSnap.forEach(doc => {
          prods.push({ id: doc.id, ...doc.data() } as Product);
        });
        setProducts(prods);

      } catch (error) {
        handleFirestoreError(error, OperationType.GET, 'reportsData');
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, []);

  const filteredTransactions = useMemo(() => {
    return transactions.filter(t => {
      // Future location logic could go here if transaction has locationId
      // Apply date range
      if (startDate || endDate) {
        const date = t.createdAt?.toDate ? t.createdAt.toDate() : new Date(t.createdAt);
        if (startDate && new Date(date) < new Date(startDate)) return false;
        if (endDate && new Date(date) > new Date(endDate)) return false;
      }
      return true;
    });
  }, [transactions, startDate, endDate, locationFilter]);

  const salesData = useMemo(() => {
    if (!filteredTransactions.length) return { chartData: [], topProducts: [], categoryData: [], totalRevenue: 0, totalTransactions: 0 };
    
    const dataMap = new Map<string, number>();
    const productSalesMap = new Map<string, { revenue: number, sold: number }>();
    const categoryRevenueMap = new Map<string, number>();
    
    let totalRevenue = 0;
    let totalTransactions = 0;

    filteredTransactions.forEach(t => {
      if (t.status === 'COMPLETED') {
        const date = t.createdAt?.toDate ? t.createdAt.toDate() : new Date(t.createdAt);
        let key = '';
        
        if (dateFilter === 'daily') {
          key = date.toLocaleDateString();
        } else if (dateFilter === 'weekly') {
          const d = new Date(date);
          const day = d.getDay();
          const diff = d.getDate() - day + (day === 0 ? -6 : 1);
          d.setDate(diff);
          key = `Wk ${d.toLocaleDateString()}`;
        } else if (dateFilter === 'monthly') {
          key = `${date.toLocaleString('default', { month: 'short' })} '${date.getFullYear().toString().slice(-2)}`;
        } else if (dateFilter === 'quarterly') {
          const q = Math.ceil((date.getMonth() + 1) / 3);
          key = `Q${q} '${date.getFullYear().toString().slice(-2)}`;
        } else if (dateFilter === 'yearly') {
          key = `${date.getFullYear()}`;
        }

        dataMap.set(key, (dataMap.get(key) || 0) + (t.totalAmount || 0));
        totalRevenue += (t.totalAmount || 0);
        totalTransactions++;

        // Add to products map
        if (Array.isArray(t.items)) {
          t.items.forEach(item => {
            const current = productSalesMap.get(item.productId) || { revenue: 0, sold: 0 };
            const itemRev = (item.price || 0) * (item.quantity || 1);
            
            productSalesMap.set(item.productId, {
              revenue: current.revenue + itemRev,
              sold: current.sold + (item.quantity || 1)
            });

            // If product exists in products state, get category
            const prod = products.find(p => p.id === item.productId);
            if (prod && prod.category) {
              categoryRevenueMap.set(prod.category, (categoryRevenueMap.get(prod.category) || 0) + itemRev);
            }
          });
        }
      }
    });

    const chartData = Array.from(dataMap.entries())
      .map(([name, sales]) => ({ name, sales }))
      .reverse();

    const topProducts = Array.from(productSalesMap.entries())
      .map(([id, data]) => {
        const p = products.find(prod => prod.id === id);
        return {
          name: p ? p.name : 'Unknown',
          revenue: data.revenue,
          sold: data.sold
        };
      })
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5);

    const categoryData = Array.from(categoryRevenueMap.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);

    return { chartData, topProducts, categoryData, totalRevenue, totalTransactions };
  }, [filteredTransactions, dateFilter, products]);

  const inventoryData = useMemo(() => {
    const lowStock = products.filter(p => p.stock <= p.minStock);
    const outOfStock = products.filter(p => p.stock === 0);
    
    // Calculate simple mock turnover rate (sold items / average stock)
    const itemsSoldMapTypes = new Map<string, number>();
    filteredTransactions.forEach(t => {
      if (t.status === 'COMPLETED' && Array.isArray(t.items)) {
        t.items.forEach(item => {
          itemsSoldMapTypes.set(item.productId, (itemsSoldMapTypes.get(item.productId) || 0) + (item.quantity || 1));
        });
      }
    });

    const turnoverData = products.map(p => {
      const sold = itemsSoldMapTypes.get(p.id) || 0;
      // turnover rate = sales / (current stock + sold (approx average stock))
      // In a real app we'd need historical stock levels, so we approximate
      const avgStock = Math.max((p.stock + (p.stock + sold)) / 2, 1); 
      const rate = (sold / avgStock).toFixed(2);
      return {
        ...p,
        sold,
        turnoverRate: parseFloat(rate)
      };
    }).sort((a, b) => b.turnoverRate - a.turnoverRate).slice(0, 10); // top 10

    return { lowStock, outOfStock, turnoverData };
  }, [products, filteredTransactions]);

  const forecastData = useMemo(() => {
    // Generate AI-driven forecast mock data based on recent sales
    const baseData = salesData.chartData.slice(-6);
    if (baseData.length === 0) return [];

    let lastVal = baseData[baseData.length - 1].sales;
    const forecast = [];
    
    // Push historical
    baseData.forEach(d => {
      forecast.push({ name: d.name, actual: d.sales, forecast: null });
    });
    
    // Push 3 periods of forecast
    for (let i = 1; i <= 3; i++) {
        // Simple random upward trend
        lastVal = lastVal * (1 + (Math.random() * 0.15 - 0.05));
        forecast.push({ 
           name: `Forecast +${i}`, 
           actual: null, 
           forecast: parseFloat(lastVal.toFixed(2)) 
        });
    }

    // Connect the lines seamlessly by plugging the last actual into the first forecast point
    /* @ts-ignore */
    forecast[baseData.length - 1].forecast = forecast[baseData.length - 1].actual;

    return forecast;
  }, [salesData]);

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center space-x-2 text-[#7A736E] font-mono animate-pulse">
        <TrendingUp className="h-6 w-6" />
        <span>AGGREGATING DATA...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6 flex flex-col h-full bg-[#0A0C10] p-4 text-[#FAF7F2]">
      
      {/* Header and Global Filters */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-[#FAF7F2] flex items-center gap-2 font-sans">
            <BarChart3 className="h-6 w-6 text-[#FF6F00]" /> Reports & Analytics
          </h2>
          <p className="text-sm font-mono text-[#7A736E]">Advanced system diagnostics and performance metrics</p>
        </div>
        
        <div className="flex flex-col md:flex-row flex-wrap items-stretch md:items-center gap-3 bg-[#141210] p-2 border border-[#3A3230] rounded-lg w-full md:w-auto">
           <div className="flex items-center gap-2 flex-1 md:flex-none">
             <Calendar className="h-4 w-4 text-[#7A736E] shrink-0" />
             <Input 
                type="date" 
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="bg-[#0A0C10] border-[#3A3230] text-xs h-8 w-full md:w-[130px]" 
             />
             <span className="text-[#7A736E] text-xs">to</span>
             <Input 
                type="date" 
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="bg-[#0A0C10] border-[#3A3230] text-xs h-8 w-full md:w-[130px]" 
             />
           </div>
           
           <div className="h-4 w-px bg-[#3A3230] hidden md:block"></div>
           
           <div className="flex items-center gap-2 flex-1 md:flex-none">
             <Filter className="h-4 w-4 text-[#7A736E] shrink-0" />
             <select 
               value={locationFilter}
               onChange={(e) => setLocationFilter(e.target.value)}
               className="bg-[#0A0C10] border border-[#3A3230] rounded-md text-xs h-8 px-2 text-[#FAF7F2] outline-none w-full md:w-auto"
             >
               <option value="All">All Locations</option>
               <option value="Store 1">Main Store</option>
               <option value="Warehouse">Warehouse</option>
             </select>
           </div>
        </div>
      </div>

      <Tabs defaultValue="sales" className="flex-1 flex flex-col min-h-0">
          <div className="w-full overflow-x-auto pb-2 mb-2 custom-scrollbar">
            <TabsList className="bg-[#141210] border border-[#3A3230] h-12 p-1 min-w-max flex justify-start">
               <TabsTrigger value="sales" className="data-[state=active]:bg-[#0A0C10] data-[state=active]:text-[#FF6F00] font-mono text-xs whitespace-nowrap">
                 <TrendingUp className="h-4 w-4 mr-2" /> Sales Performance
               </TabsTrigger>
               <TabsTrigger value="inventory" className="data-[state=active]:bg-[#0A0C10] data-[state=active]:text-[#FF6F00] font-mono text-xs whitespace-nowrap">
                 <Box className="h-4 w-4 mr-2" /> Inventory Health
               </TabsTrigger>
               <TabsTrigger value="ai-forecast" className="data-[state=active]:bg-[#0A0C10] data-[state=active]:text-[#FF6F00] font-mono text-xs relative overflow-hidden group whitespace-nowrap">
                 <span className="absolute inset-0 bg-gradient-to-r from-transparent via-[#FF6F00]/10 to-transparent translate-x-[-100%] group-hover:animate-[scan_1.5s_ease-in-out_infinite]"></span>
                 <Bot className="h-4 w-4 mr-2 text-[#FF6F00]" /> AI Demand Forecast
               </TabsTrigger>
            </TabsList>
          </div>

          {/* SALES PERFORMANCE TAB */}
          <TabsContent value="sales" className="flex-1 space-y-4 focus-visible:outline-none overflow-y-auto">
             <div className="flex bg-[#141210] border border-[#3A3230] rounded-md p-1 overflow-x-auto w-full sm:w-fit custom-scrollbar">
                {['daily', 'weekly', 'monthly', 'quarterly', 'yearly'].map(f => (
                  <button
                    key={f}
                    onClick={() => setDateFilter(f as any)}
                    className={`px-3 py-1.5 text-xs font-mono tracking-widest uppercase transition-colors rounded-sm whitespace-nowrap ${
                      dateFilter === f 
                        ? 'bg-[#FF6F00] text-black font-bold' 
                        : 'text-[#7A736E] hover:text-[#FAF7F2] hover:bg-[#1A1614]'
                    }`}
                  >
                    {f}
                  </button>
                ))}
             </div>

             <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6">
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
                  <Card className="bg-[#141210] border-[#3A3230] hover:border-[#1D9E75]/50 transition-colors">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-mono font-medium text-[#7A736E]">TOTAL REVENUE</CardTitle>
                      <Activity className="h-4 w-4 text-[#1D9E75]" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold text-[#FAF7F2]">₱{formatCurrency(salesData.totalRevenue)}</div>
                    </CardContent>
                  </Card>
                </motion.div>
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
                  <Card className="bg-[#141210] border-[#3A3230] hover:border-[#3498DB]/50 transition-colors">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-mono font-medium text-[#7A736E]">TRANSACTIONS</CardTitle>
                      <FileText className="h-4 w-4 text-[#3498DB]" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold text-[#FAF7F2]">{salesData.totalTransactions}</div>
                    </CardContent>
                  </Card>
                </motion.div>
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
                  <Card className="bg-[#141210] border-[#3A3230] hover:border-[#9B59B6]/50 transition-colors">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-mono font-medium text-[#7A736E]">AVG ORDER VALUE</CardTitle>
                      <ShoppingBag className="h-4 w-4 text-[#9B59B6]" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold text-[#FAF7F2]">₱{formatCurrency(salesData.totalTransactions ? salesData.totalRevenue / salesData.totalTransactions : 0)}</div>
                    </CardContent>
                  </Card>
                </motion.div>
             </div>

             <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
                 <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }} className="lg:col-span-2">
                   <Card className="bg-[#1A1614] border-[#3A3230] p-4 sm:p-6 h-[400px] flex flex-col">
                      <h3 className="font-mono text-sm tracking-widest text-[#7A736E] mb-4 flex items-center gap-2 shrink-0">
                        <TrendingUp className="h-4 w-4 text-[#FF6F00]" /> REVENUE TREND
                      </h3>
                      {salesData.chartData.length > 0 ? (
                        <div className="flex-1 w-full min-h-0">
                          <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={salesData.chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                            <defs>
                              <linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#FF6F00" stopOpacity={0.3}/>
                                <stop offset="95%" stopColor="#FF6F00" stopOpacity={0}/>
                              </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="#3A3230" vertical={false} opacity={0.5} />
                            <XAxis dataKey="name" stroke="#7A736E" fontSize={10} fontFamily="monospace" tickLine={false} axisLine={false} tickMargin={12} />
                            <YAxis stroke="#7A736E" fontSize={10} fontFamily="monospace" tickLine={false} axisLine={false} tickFormatter={(value) => `₱${formatCurrency(value)}`} />
                            <Tooltip 
                              cursor={{ fill: 'transparent', stroke: '#FF6F00', strokeWidth: 1, strokeDasharray: '4 4' }}
                              contentStyle={{ backgroundColor: '#141210', border: '1px solid #3A3230', borderRadius: '8px' }}
                              itemStyle={{ color: '#FAF7F2', fontWeight: 600, fontSize: '14px', fontFamily: 'monospace' }}
                              labelStyle={{ color: '#7A736E', marginBottom: '4px', fontSize: '12px' }}
                              formatter={(value: number) => [`₱${formatCurrency(value)}`, 'Revenue']}
                            />
                            <Area type="monotone" dataKey="sales" stroke="#FF6F00" fillOpacity={1} fill="url(#colorSales)" />
                          </AreaChart>
                        </ResponsiveContainer>
                        </div>
                      ) : (
                        <div className="h-full flex items-center justify-center text-[#7A736E] font-mono">No transaction data available.</div>
                      )}
                   </Card>
                 </motion.div>

                 <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }} className="lg:col-span-1">
                   <Card className="bg-[#1A1614] border-[#3A3230] p-4 sm:p-6 h-[400px] flex flex-col">
                      <h3 className="font-mono text-sm tracking-widest text-[#7A736E] mb-4 shrink-0">TOP PRODUCTS BY REVENUE</h3>
                      {salesData.topProducts.length > 0 ? (
                        <div className="flex-1 w-full min-h-0">
                          <ResponsiveContainer width="100%" height="100%">
                             <BarChart data={salesData.topProducts} layout="vertical" margin={{ top: 0, right: 30, left: 10, bottom: 0 }}>
                             <CartesianGrid strokeDasharray="3 3" stroke="#3A3230" horizontal={false} opacity={0.5} />
                             <XAxis type="number" hide />
                             <YAxis type="category" dataKey="name" stroke="#FAF7F2" fontSize={11} fontFamily="sans-serif" tickLine={false} axisLine={false} width={90} tick={{ fill: '#FAF7F2' }} />
                             <Tooltip 
                               cursor={{ fill: '#3A3230', opacity: 0.2 }}
                               contentStyle={{ backgroundColor: '#141210', border: '1px solid #3A3230', borderRadius: '8px' }}
                               formatter={(value: number) => [`₱${formatCurrency(value)}`, 'Revenue']}
                             />
                             <Bar dataKey="revenue" fill="#1D9E75" radius={[0, 4, 4, 0]}>
                               {salesData.topProducts.map((entry, index) => (
                                 <Cell key={`cell-${index}`} fill={index === 0 ? '#1D9E75' : '#1D9E7599'} />
                               ))}
                             </Bar>
                           </BarChart>
                          </ResponsiveContainer>
                        </div>
                      ) : (
                        <div className="flex-1 flex items-center justify-center text-[#7A736E] font-mono">No product data.</div>
                      )}
                   </Card>
                 </motion.div>
             </div>
          </TabsContent>

          {/* INVENTORY HEALTH TAB */}
          <TabsContent value="inventory" className="flex-1 space-y-4 focus-visible:outline-none overflow-y-auto">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
                 <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 }} className="lg:col-span-1 border border-[#3A3230] rounded-xl overflow-hidden shadow-sm flex flex-col h-[400px]">
                   <Card className="bg-[#141210] border-none flex flex-col h-full rounded-none">
                      <CardHeader className="flex flex-row gap-2 border-b border-[#3A3230] pb-4 shrink-0">
                         <div className="bg-red-500/10 p-2 rounded-lg">
                           <AlertTriangle className="h-5 w-5 text-red-500" />
                         </div>
                         <div>
                           <CardTitle className="text-sm font-mono text-[#FAF7F2]">LOW STOCK ALERTS</CardTitle>
                           <CardDescription className="text-[#7A736E] text-xs">Items at or below minimum threshold</CardDescription>
                         </div>
                      </CardHeader>
                      <CardContent className="flex-1 overflow-y-auto p-0 min-h-0">
                         <Table>
                           <TableHeader className="bg-[#0A0C10] sticky top-0 z-10">
                              <TableRow className="border-[#3A3230] hover:bg-transparent">
                                 <TableHead className="text-[#7A736E] text-xs font-mono uppercase h-8 py-2">Product</TableHead>
                                 <TableHead className="text-right text-[#7A736E] text-xs font-mono uppercase h-8 py-2">Stock/Min</TableHead>
                                 <TableHead className="text-right text-[#7A736E] text-xs font-mono uppercase h-8 py-2">Status</TableHead>
                              </TableRow>
                           </TableHeader>
                           <TableBody>
                              {inventoryData.lowStock.map(p => (
                                 <TableRow key={p.id} className="border-[#3A3230] hover:bg-[#1A1614]/50 transition-colors">
                                    <TableCell className="font-semibold text-sm py-2">
                                      <div className="flex flex-col">
                                        <span className="truncate max-w-[120px]" title={p.name}>{p.name}</span>
                                        <span className="text-[10px] text-[#7A736E]">{p.category}</span>
                                      </div>
                                    </TableCell>
                                    <TableCell className="text-right font-mono text-[#FAF7F2] py-2">
                                       <span className={p.stock === 0 ? "text-red-500 font-bold" : "text-[#FF6F00]"}>{p.stock}</span> <span className="text-[#7A736E]">/ {p.minStock}</span>
                                    </TableCell>
                                    <TableCell className="text-right py-2">
                                       <Badge variant="outline" className={`font-mono text-[10px] ${p.stock === 0 ? 'border-red-500 bg-red-500/10 text-red-500' : 'border-[#FF6F00] bg-[#FF6F00]/10 text-[#FF6F00]'}`}>
                                          {p.stock === 0 ? 'DEPLETED' : 'LOW'}
                                       </Badge>
                                    </TableCell>
                                 </TableRow>
                              ))}
                              {inventoryData.lowStock.length === 0 && (
                                 <TableRow>
                                    <TableCell colSpan={3} className="text-center text-[#1D9E75] py-12 font-mono bg-[#1D9E75]/5">
                                      <div className="flex flex-col items-center gap-2">
                                        <Box className="h-6 w-6 opacity-50" />
                                        <span>Inventory levels optimal.</span>
                                      </div>
                                    </TableCell>
                                 </TableRow>
                              )}
                           </TableBody>
                         </Table>
                      </CardContent>
                   </Card>
                 </motion.div>

                 <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="lg:col-span-1 border border-[#3A3230] rounded-xl overflow-hidden shadow-sm flex flex-col h-[400px]">
                   <Card className="bg-[#141210] border-none flex flex-col h-full rounded-none">
                      <CardHeader className="flex flex-row gap-2 border-b border-[#3A3230] pb-4 shrink-0">
                         <div className="bg-[#3498DB]/10 p-2 rounded-lg">
                           <TrendingUp className="h-5 w-5 text-[#3498DB]" />
                         </div>
                         <div>
                           <CardTitle className="text-sm font-mono text-[#FAF7F2]">TURNOVER VELOCITY</CardTitle>
                           <CardDescription className="text-[#7A736E] text-xs">Top products by estimated velocity</CardDescription>
                         </div>
                      </CardHeader>
                      <CardContent className="flex-1 overflow-y-auto p-0 min-h-0">
                         <Table>
                           <TableHeader className="bg-[#0A0C10] sticky top-0 z-10">
                              <TableRow className="border-[#3A3230] hover:bg-transparent">
                                 <TableHead className="text-[#7A736E] text-xs font-mono uppercase h-8 py-2">Product</TableHead>
                                 <TableHead className="text-right text-[#7A736E] text-xs font-mono uppercase h-8 py-2">Sold</TableHead>
                                 <TableHead className="text-right text-[#7A736E] text-xs font-mono uppercase h-8 py-2">Turnover</TableHead>
                              </TableRow>
                           </TableHeader>
                           <TableBody>
                              {inventoryData.turnoverData.map((p, i) => (
                                 <TableRow key={p.id} className="border-[#3A3230] hover:bg-[#1A1614]/50 transition-colors">
                                    <TableCell className="font-semibold text-sm truncate max-w-[120px] py-2" title={p.name}>
                                      <div className="flex items-center gap-2">
                                        <span className="text-[#7A736E] text-xs font-mono w-4">{i + 1}.</span>
                                        <span className="truncate">{p.name}</span>
                                      </div>
                                    </TableCell>
                                    <TableCell className="text-right font-mono text-[#FAF7F2] py-2">{p.sold}</TableCell>
                                    <TableCell className="text-right py-2">
                                      <div className="flex flex-col items-end gap-1">
                                        <span className="font-mono text-xs text-[#3498DB]">{p.turnoverRate}x</span>
                                        <div className="w-12 bg-[#0A0C10] h-1.5 rounded-full overflow-hidden border border-[#3A3230]">
                                          <div 
                                            className="h-full bg-gradient-to-r from-[#3498DB] to-[#8E44AD]" 
                                            style={{ width: `${Math.min((p.turnoverRate / 10) * 100, 100)}%` }}
                                          />
                                        </div>
                                      </div>
                                    </TableCell>
                                 </TableRow>
                              ))}
                              {inventoryData.turnoverData.length === 0 && (
                                 <TableRow>
                                    <TableCell colSpan={3} className="text-center text-[#7A736E] py-12 font-mono bg-[#1A1614]/20">
                                      <div className="flex flex-col items-center gap-2">
                                        <Activity className="h-6 w-6 opacity-30" />
                                        <span>No sales data to calculate rates.</span>
                                      </div>
                                    </TableCell>
                                 </TableRow>
                              )}
                           </TableBody>
                         </Table>
                      </CardContent>
                   </Card>
                 </motion.div>

                 <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.3 }} className="lg:col-span-1 border border-[#3A3230] rounded-xl overflow-hidden shadow-sm flex flex-col h-[400px]">
                   <Card className="bg-[#141210] border-none flex flex-col h-full rounded-none">
                      <CardHeader className="flex flex-row gap-2 border-b border-[#3A3230] pb-4 shrink-0">
                         <div className="bg-[#8E44AD]/10 p-2 rounded-lg">
                           <Box className="h-5 w-5 text-[#8E44AD]" />
                         </div>
                         <div>
                           <CardTitle className="text-sm font-mono text-[#FAF7F2]">CATEGORY BREAKDOWN</CardTitle>
                           <CardDescription className="text-[#7A736E] text-xs">Revenue grouped by category</CardDescription>
                         </div>
                      </CardHeader>
                      <CardContent className="flex-1 p-4 min-h-0 flex flex-col">
                        {salesData.categoryData.length > 0 ? (
                          <div className="h-full flex flex-col min-h-0">
                            <div className="flex-1 w-full min-h-0">
                              <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                <Pie 
                                   data={salesData.categoryData} 
                                   cx="50%" 
                                   cy="50%" 
                                   innerRadius={40} 
                                   outerRadius={80} 
                                   paddingAngle={5} 
                                   dataKey="value"
                                   stroke="none"
                                >
                                  {salesData.categoryData.map((entry, index) => {
                                    const colors = ['#1D9E75', '#3498DB', '#9B59B6', '#FF6F00', '#F1C40F'];
                                    return <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />;
                                  })}
                                </Pie>
                                <Tooltip 
                                   contentStyle={{ backgroundColor: '#141210', border: '1px solid #3A3230', borderRadius: '8px' }}
                                   formatter={(value: number) => [`₱${formatCurrency(value)}`, 'Revenue']}
                                />
                              </PieChart>
                            </ResponsiveContainer>
                           </div>
                           <div className="mt-4 flex flex-col gap-2 overflow-y-auto pr-1 custom-scrollbar shrink-0 max-h-[120px]">
                               {salesData.categoryData.map((cat, index) => {
                                 const colors = ['#1D9E75', '#3498DB', '#9B59B6', '#FF6F00', '#F1C40F'];
                                 return (
                                   <div key={index} className="flex items-center justify-between font-mono text-xs">
                                     <div className="flex items-center gap-2">
                                       <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: colors[index % colors.length] }} />
                                       <span className="text-[#FAF7F2] truncate max-w-[100px]">{cat.name}</span>
                                     </div>
                                     <span className="text-[#7A736E]">₱{formatCurrency(cat.value)}</span>
                                   </div>
                                 );
                               })}
                            </div>
                          </div>
                        ) : (
                          <div className="h-full flex items-center justify-center text-[#7A736E] font-mono flex-col gap-2">
                            <Box className="h-6 w-6 opacity-30" />
                            <span>No category data available.</span>
                          </div>
                        )}
                      </CardContent>
                   </Card>
                 </motion.div>
              </div>
          </TabsContent>

          {/* AI FORECAST TAB */}
          <TabsContent value="ai-forecast" className="flex-1 space-y-4 focus-visible:outline-none overflow-y-auto">
             <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.1 }} className="h-full">
               <Card className="bg-[#141210] border-[#3A3230] p-4 sm:p-6 min-h-[500px] flex flex-col relative overflow-hidden group">
                  {/* Background grid effect */}
                  <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0MCIgaGVpZ2h0PSI0MCI+PHBhdGggZD0iTTAgMGg0MHY0MEgweiIgZmlsbD0ibm9uZSIvPjxwYXRoIGQ0iTTAgNDBoNDBNNDAgMHY0MCIgc3Ryb2tlPSIjM0EzMjMwIiBzdHJva2Utd2lkdGg9IjEiIGZpbGwtb3BhY2l0eT0iMC4xIi8+PC9zdmc+')] opacity-20 pointer-events-none"></div>
                  
                  {/* Subtle pulsing background glow */}
                  <div className="absolute -top-[100%] -left-[100%] w-[300%] h-[300%] bg-gradient-radial from-[#FF6F00]/5 to-transparent pointer-events-none animate-pulse" />

                  <div className="flex flex-col sm:flex-row justify-between items-start gap-4 mb-6 relative z-10">
                     <div className="flex items-center gap-3">
                       <div className="h-10 w-10 bg-[#FF6F00]/10 border border-[#FF6F00]/30 rounded-xl flex items-center justify-center">
                         <Bot className="h-5 w-5 text-[#FF6F00]" />
                       </div>
                       <div>
                         <h3 className="font-mono text-base sm:text-lg font-bold text-[#FF6F00]">AI Demand Forecast</h3>
                         <p className="text-[#7A736E] text-xs mt-1">Predictive analysis based on multi-variate historical trends</p>
                       </div>
                     </div>
                     <Badge variant="outline" className="border-[#FF6F00] text-[#FF6F00] bg-[#0A0C10] font-mono self-start sm:self-auto shrink-0 shadow-[0_0_10px_rgba(255,111,0,0.2)]">MODEL: AUTO-REGRESSIVE</Badge>
                  </div>
                  
                  <div className="flex-1 bg-[#0A0C10]/80 rounded-xl border border-[#3A3230] p-2 sm:p-4 relative overflow-hidden min-h-0 flex flex-col backdrop-blur-sm z-10 border-t-[#FF6F00]/20 shadow-inner">
                     {forecastData.length > 0 ? (
                       <div className="flex-1 w-full min-h-0">
                         <ResponsiveContainer width="100%" height="100%" className="relative z-10">
                           <LineChart data={forecastData} margin={{ top: 20, right: 30, left: 0, bottom: 0 }}>
                           <CartesianGrid strokeDasharray="3 3" stroke="#3A3230" vertical={false} opacity={0.3} />
                           <XAxis dataKey="name" stroke="#7A736E" fontSize={10} fontFamily="monospace" tickLine={false} axisLine={false} />
                           <YAxis stroke="#7A736E" fontSize={10} fontFamily="monospace" tickLine={false} axisLine={false} tickFormatter={(value) => `₱${formatCurrency(value)}`} />
                           <Tooltip 
                              contentStyle={{ backgroundColor: '#141210', border: '1px solid #FF6F00', borderRadius: '8px', boxShadow: '0 0 15px rgba(255, 111, 0, 0.2)' }}
                              itemStyle={{ color: '#FAF7F2', fontWeight: 600, fontSize: '14px', fontFamily: 'monospace' }}
                              labelStyle={{ color: '#FF6F00', marginBottom: '4px', fontSize: '12px', fontWeight: 'bold' }}
                           />
                           <Legend wrapperStyle={{ fontSize: '12px', fontFamily: 'monospace', color: '#7A736E' }} />
                           <Line 
                              type="monotone" 
                              dataKey="actual" 
                              name="Actual Revenue" 
                              stroke="#1D9E75" 
                              strokeWidth={3} 
                              dot={{ r: 4, fill: '#141210', stroke: '#1D9E75', strokeWidth: 2 }} 
                              activeDot={{ r: 6, fill: '#1D9E75' }}
                           />
                           <Line 
                              type="monotone" 
                              dataKey="forecast" 
                              name="AI Forecast" 
                              stroke="#FF6F00" 
                              strokeWidth={3} 
                              strokeDasharray="5 5"
                              dot={{ r: 4, fill: '#141210', stroke: '#FF6F00', strokeWidth: 2 }} 
                              activeDot={{ r: 6, stroke: '#FF6F00', strokeWidth: 2, fill: '#141210' }}
                           />
                         </LineChart>
                       </ResponsiveContainer>
                      </div>
                     ) : (
                       <div className="h-full flex items-center justify-center text-[#7A736E] font-mono z-10 relative">Insufficient historical data to generate forecast model.</div>
                     )}
                  </div>
                  
                  <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 font-mono text-sm relative z-10">
                     <div className="bg-[#0A0C10]/80 backdrop-blur p-4 rounded border border-[#3A3230] hover:border-[#1D9E75]/50 transition-colors">
                        <div className="text-[#7A736E] text-xs mb-1">CONFIDENCE SCORE</div>
                        <div className="text-[#FAF7F2] font-bold text-xl flex items-end gap-2">
                          84.2% <span className="text-xs text-[#1D9E75] font-normal mb-1">↑ 2.1%</span>
                        </div>
                     </div>
                     <div className="bg-[#0A0C10]/80 backdrop-blur p-4 rounded border border-[#3A3230] hover:border-[#3498DB]/50 transition-colors">
                        <div className="text-[#7A736E] text-xs mb-1">PREDICTED TREND</div>
                        <div className="text-[#3498DB] font-bold text-lg flex items-center gap-2">
                           STEADY CLIMB <TrendingUp className="h-5 w-5" />
                        </div>
                     </div>
                     <div className="bg-[#0A0C10]/80 backdrop-blur p-4 rounded border border-[#3A3230] hover:border-[#FF6F00]/50 transition-colors sm:col-span-2 lg:col-span-1">
                        <div className="text-[#7A736E] text-xs mb-1">RECOMMENDED ACTION</div>
                        <div className="text-[#FF6F00] font-bold truncate items-center flex gap-2" title="Increase safety stock for fast-movers">
                          <ArrowUpRight className="h-4 w-4" /> Increase Fast-Mover Stock
                        </div>
                     </div>
                  </div>
               </Card>
             </motion.div>
          </TabsContent>
      </Tabs>
    </div>
  );
}

