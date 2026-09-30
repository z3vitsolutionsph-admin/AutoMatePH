import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Terminal, X, Send, Maximize2, Minimize2, AlertCircle } from 'lucide-react';
import { Card } from './ui/card';
import { formatCurrency } from '../lib/utils';
import { db, auth, collection, getDocs, limit, query, orderBy, where } from '../lib/realtime';
import Markdown from 'react-markdown';

interface Message {
  role: 'user' | 'model' | 'error';
  text: string;
}

export function TerminalChat({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [messages, setMessages] = useState<Message[]>([
    { role: 'model', text: 'AutoMatePH AI Assistant active. Type a command or ask a question.' }
  ]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping, isExpanded]);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  const fetchContext = async () => {
    let contextStr = 'System Knowledge Base (Real-time Snapshot):\n\n';
    const rawProductsData: any[] = [];
    
    try {
      // Fetch currently active inventory
      const qProd = query(collection(db, 'products'), orderBy('name'), limit(200));
      const syncProducts = await getDocs(qProd);
      const prods: string[] = [];
      const lowStockProds: string[] = [];
      let lowStockCount = 0;
      let inventoryValue = 0;
      
      syncProducts.forEach(doc => {
        const d = doc.data();
        rawProductsData.push({ id: doc.id, ...d });
        prods.push(`- ${d.name} (${d.category || 'General'}): Stock ${d.stock}, Price ₱${formatCurrency(d.price)}`);
        inventoryValue += (d.stock || 0) * (d.price || 0);
        if (d.stock <= (d.minStock || 0)) {
          lowStockCount++;
          lowStockProds.push(`- ${d.name}: ${d.stock} left (Min: ${d.minStock || 0})`);
        }
      });
      
      contextStr += `[INVENTORY METRICS]\nTotal Tracked Items: ${syncProducts.size}\nLow Stock Items: ${lowStockCount}\nTotal Retail Value: ₱${formatCurrency(inventoryValue)}\n\n`;
      
      if (lowStockProds.length > 0) {
        contextStr += `[ALERTED ITEMS - ATTENTION REQUIRED]\n${lowStockProds.join('\n')}\n\n`;
      }
      
      contextStr += `[CATALOG SAMPLE]\n${prods.slice(0, 30).join('\n')}${prods.length > 30 ? '\n... (truncated)' : ''}\n\n`;
    } catch (e) {
      console.error("Context fetch error (products):", e);
      contextStr += `[INVENTORY SYSTEM] UNAVAILABLE\n\n`;
    }

    try {
      // Fetch recent transactions
      let syncTrans;
      try {
        const qTrans = query(collection(db, 'transactions'), orderBy('createdAt', 'desc'), limit(100));
        syncTrans = await getDocs(qTrans);
      } catch {
        if (auth.currentUser?.uid) {
          const qTransCashier = query(collection(db, 'transactions'), where('cashierId', '==', auth.currentUser.uid), limit(100));
          syncTrans = await getDocs(qTransCashier);
        } else {
          syncTrans = { size: 0, forEach: () => {} } as any;
        }
      }
      
      let totalRevenue = 0;
      let recentSalesCount = 0;
      const trans: string[] = [];
      const productSalesCount: Record<string, number> = {};
      let oldestDate = new Date();

      syncTrans.forEach(doc => {
        const d = doc.data();
        if (d.status === 'COMPLETED') {
          totalRevenue += d.totalAmount || 0;
          recentSalesCount++;
          
          let dateActual = new Date();
          if (d.createdAt) {
            dateActual = typeof d.createdAt?.toDate === 'function' ? d.createdAt.toDate() : new Date(d.createdAt.seconds ? d.createdAt.seconds * 1000 : d.createdAt);
            if (!isNaN(dateActual.getTime()) && dateActual < oldestDate) oldestDate = dateActual;
          }
          const dateStr = dateActual.toLocaleString();
          
          let itemsSummary = '';
          if (d.items && Array.isArray(d.items)) {
            itemsSummary = d.items.map((i: any) => {
              if (i.name && i.quantity) {
                productSalesCount[i.name] = (productSalesCount[i.name] || 0) + i.quantity;
              }
              return `${i.quantity}x ${i.name}`;
            }).join(', ');
          }
          
          trans.push(`- ${dateStr}: ₱${formatCurrency(d.totalAmount)} (${itemsSummary || 'Unknown items'}) - ${d.paymentMethod}`);
        }
      });

      const topSelling = Object.entries(productSalesCount)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([name, qty]) => `- ${name}: ${qty} sold`);

      let daysSpan = (new Date().getTime() - oldestDate.getTime()) / (1000 * 60 * 60 * 24);
      if (daysSpan < 0.5) daysSpan = 0.5;
      if (daysSpan > 30) daysSpan = 30;

      const forecastsStr: string[] = [];
      rawProductsData.forEach(p => {
        const sold = productSalesCount[p.name] || 0;
        const velocity = sold / daysSpan;
        const daysLeft = velocity > 0 ? (p.stock / velocity) : Infinity;
        if (velocity > 0 && p.stock > 0 && daysLeft < 30) {
          const reorderQty = Math.ceil(velocity * 14 + (p.minStock || 0));
          forecastsStr.push(`- ${p.name}: Sales Rate ${velocity.toFixed(1)}/day, Stockout in ${daysLeft.toFixed(1)} days. Suggest Ordering: ${reorderQty}`);
        }
      });

      contextStr += `[SALES FIGURES (Latest ${recentSalesCount} Completed)]\nTotal Revenue: ₱${formatCurrency(totalRevenue)}\n\n`;
      
      if (topSelling.length > 0) {
        contextStr += `[TOP-SELLING PRODUCTS]\n${topSelling.join('\n')}\n\n`;
      }
      
      if (forecastsStr.length > 0) {
        contextStr += `[STOCK FORECASTS & PREDICTIONS]\n${forecastsStr.join('\n')}\n\n`;
      }

      contextStr += `[RECENT TRANSACTION LOG]\n${trans.slice(0, 10).join('\n')}${trans.length > 10 ? '\n... (truncated)' : ''}\n\n`;
    } catch (e) {
      console.error("Context fetch error (transactions):", e);
      contextStr += `[TRANSACTION SYSTEM] UNAVAILABLE\n\n`;
    }

    return contextStr;
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedInput = input.trim();
    if (!trimmedInput) return;

    if (trimmedInput.length > 500) {
      setMessages(prev => [...prev, { role: 'error', text: 'Input exceeds maximum length of 500 characters.' }]);
      return;
    }

    const userMsg = trimmedInput;
    setMessages(prev => [...prev, { role: 'user', text: userMsg }]);
    setInput('');
    setIsTyping(true);

    try {
      const context = await Promise.race([
        fetchContext(),
        new Promise<string>((_, reject) => setTimeout(() => reject(new Error("Context fetch timeout")), 8000))
      ]).catch(err => {
         console.warn("Context fetch timed out or failed", err);
         return "System Knowledge Base: [LIMITED/PARTIAL DATA DUE TO TIMEOUT]\n\n";
      });
      
      const historyStr = messages.slice(-10).map(m => `${m.role === 'user' ? 'Operator' : 'AI'}: ${m.text}`).join('\n');
      const prompt = `Chat History:\n${historyStr}\nOperator: ${userMsg}\nAI:`;

      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, context }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to reach AI service');
      }

      const data = await res.json();
      setMessages(prev => [...prev, { role: 'model', text: data.reply || 'No response.' }]);
    } catch (err: any) {
      console.error("AI Insights Error:", err);
      const errMsg = err.message || 'Unable to connect to AI intelligence';
      setMessages(prev => [...prev, { role: 'error', text: errMsg }]);
    } finally {
      setIsTyping(false);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  };

  const toggleExpand = () => setIsExpanded(!isExpanded);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
           initial={{ opacity: 0, y: 20, scale: 0.95 }}
           animate={{ opacity: 1, y: 0, scale: 1 }}
           exit={{ opacity: 0, y: 20, scale: 0.95 }}
           transition={{ type: 'spring', stiffness: 300, damping: 25 }}
           className={`fixed z-50 flex flex-col transition-all duration-300 ease-in-out ${
             isExpanded 
               ? 'inset-0 sm:inset-4 md:inset-8 lg:inset-12' 
               : 'inset-0 sm:inset-auto sm:bottom-6 sm:right-6 sm:w-[420px] md:w-[460px] sm:h-[520px] md:h-[620px]'
           }`}
        >
          <div className={`flex-1 bg-[#141210]/90 backdrop-blur-2xl border border-white/[0.12] shadow-[0_24px_64px_rgba(0,0,0,0.7),inset_0_1px_1px_rgba(255,255,255,0.15)] flex flex-col overflow-hidden relative font-sans ${isExpanded ? 'rounded-none sm:rounded-2xl' : 'rounded-none sm:rounded-2xl'}`}>
             {/* Header */}
             <div className="h-13 bg-white/[0.03] border-b border-white/[0.08] backdrop-blur-md text-[#FAF7F2] flex items-center justify-between px-4 shrink-0">
               <div className="flex items-center gap-2.5 font-bold font-mono text-xs tracking-wider uppercase text-[#1D9E75]">
                 <div className="p-1 rounded-md bg-[#1D9E75]/15 border border-[#1D9E75]/30">
                   <Terminal className="h-4 w-4 text-[#1D9E75]" />
                 </div>
                 <span>Foresight AI Store Intelligence</span>
               </div>
               <div className="flex items-center gap-1">
                 <button onClick={toggleExpand} className="hover:bg-white/[0.08] text-[#8E857E] hover:text-[#FAF7F2] p-1.5 rounded-lg transition-colors hidden sm:block" title={isExpanded ? "Restore" : "Maximize"}>
                   {isExpanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                 </button>
                 <button onClick={onClose} className="hover:bg-white/[0.08] text-[#8E857E] hover:text-[#FAF7F2] p-1.5 rounded-lg transition-colors" title="Close">
                   <X className="h-5 w-5" />
                 </button>
               </div>
             </div>

             {/* Messages */}
             <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4 custom-scrollbar bg-transparent text-[#FAF7F2] text-sm leading-relaxed">
               {messages.map((msg, idx) => (
                 <div key={idx} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                   <div className={`text-[10px] font-mono tracking-wider uppercase mb-1 opacity-70 flex items-center gap-1 ${
                     msg.role === 'user' ? 'text-[#1D9E75]' : msg.role === 'error' ? 'text-red-400' : 'text-[#FF6F00]'
                   }`}>
                     {msg.role === 'user' ? 'You' : msg.role === 'error' ? 'System Notification' : 'Foresight AI'}
                     {msg.role === 'error' && <AlertCircle className="h-3 w-3" />}
                   </div>
                   <div className={`p-3.5 border rounded-xl shadow-sm ${
                     msg.role === 'user' 
                       ? 'bg-[#1D9E75]/15 border-[#1D9E75]/35 text-[#FAF7F2] rounded-tr-sm backdrop-blur-md' 
                       : msg.role === 'error'
                       ? 'bg-red-500/10 border-red-500/30 text-red-300 rounded-tl-sm backdrop-blur-md' 
                       : 'bg-white/[0.04] border-white/[0.08] text-[#FAF7F2] rounded-tl-sm backdrop-blur-md'
                   } max-w-[90%] md:max-w-[85%] break-words whitespace-pre-wrap font-sans`}>
                     {msg.role === 'model' || msg.role === 'error' ? (
                       <div className="markdown-body text-xs md:text-sm">
                         <Markdown
                           components={{
                             ul: ({node, ...props}) => <ul className="list-disc pl-4 space-y-1 mb-3 last:mb-0" {...props} />,
                             ol: ({node, ...props}) => <ol className="list-decimal pl-4 space-y-1 mb-3 last:mb-0" {...props} />,
                             li: ({node, ...props}) => <li className="pl-1" {...props} />,
                             p: ({node, ...props}) => <p className="mb-3 last:mb-0 leading-relaxed" {...props} />,
                             strong: ({node, ...props}) => <strong className="font-bold text-[#FF6F00]" {...props} />,
                             em: ({node, ...props}) => <em className="italic text-[#1D9E75]" {...props} />,
                             code: ({node, inline, className, children, ...props}: any) => {
                               return !inline ? (
                                 <div className="bg-black/60 border border-white/[0.1] rounded-lg p-3 my-3 overflow-x-auto font-mono text-xs">
                                   <code className={className} {...props}>
                                     {children}
                                   </code>
                                 </div>
                               ) : (
                                 <code className="bg-white/[0.08] text-[#FF6F00] px-1.5 py-0.5 rounded font-mono text-xs" {...props}>
                                   {children}
                                 </code>
                               )
                             }
                           }}
                         >
                           {msg.text}
                         </Markdown>
                       </div>
                     ) : (
                       msg.text
                     )}
                   </div>
                 </div>
               ))}
               {isTyping && (
                 <div className="flex flex-col items-start">
                   <div className="text-[10px] font-mono tracking-wider uppercase mb-1 opacity-70 text-[#FF6F00]">Foresight AI</div>
                   <div className="p-3.5 border rounded-xl rounded-tl-sm bg-white/[0.04] border-white/[0.08] text-[#FF6F00] flex items-center gap-3 text-xs backdrop-blur-md">
                     <span className="font-mono">Analyzing telemetry...</span>
                     <span className="flex gap-1">
                       <span className="w-1.5 h-1.5 rounded-full bg-[#FF6F00] animate-bounce" style={{ animationDelay: '0ms' }} />
                       <span className="w-1.5 h-1.5 rounded-full bg-[#FF6F00] animate-bounce" style={{ animationDelay: '150ms' }} />
                       <span className="w-1.5 h-1.5 rounded-full bg-[#FF6F00] animate-bounce" style={{ animationDelay: '300ms' }} />
                     </span>
                   </div>
                 </div>
               )}
               <div ref={endRef} className="h-1" />
             </div>

             {/* Input */}
             <form onSubmit={handleSend} className="h-14 border-t border-white/[0.08] bg-white/[0.02] backdrop-blur-md flex items-center px-3 gap-2">
               <input
                 ref={inputRef}
                 value={input}
                 onChange={e => setInput(e.target.value)}
                 placeholder="Ask about sales, stockouts, or inventory forecasts..."
                 className="flex-1 bg-transparent border-none outline-none text-[#FAF7F2] placeholder-[#8E857E] text-xs font-sans h-full px-2"
                 autoFocus
                 disabled={isTyping}
                 maxLength={500}
               />
               <button 
                 type="submit" 
                 disabled={!input.trim() || isTyping}
                 className="h-9 px-3 flex items-center justify-center gap-1.5 rounded-lg bg-[#FF6F00] hover:bg-[#FF6F00]/90 text-[#0A0C10] font-bold font-mono text-xs uppercase disabled:opacity-30 transition-all shadow-[0_0_15px_rgba(255,111,0,0.25)] shrink-0"
               >
                 <span>Send</span>
                 <Send className="h-3.5 w-3.5" />
               </button>
             </form>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

