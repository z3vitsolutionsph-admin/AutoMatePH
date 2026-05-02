import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Terminal, X, Send, Maximize2, Minimize2, AlertCircle } from 'lucide-react';
import { Card } from './ui/card';
import { GoogleGenAI } from '@google/genai';
import { formatCurrency } from '../lib/utils';
import { db } from '../lib/firebase';
import { collection, getDocs, limit, query, orderBy } from 'firebase/firestore';
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
      const qTrans = query(collection(db, 'transactions'), orderBy('createdAt', 'desc'), limit(100));
      const syncTrans = await getDocs(qTrans);
      
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

    if (!process.env.GEMINI_API_KEY) {
      setMessages(prev => [...prev, { role: 'error', text: '[ERROR: GEMINI_API_KEY NOT CONFIGURED IN ENVIRONMENT]' }]);
      setIsTyping(false);
      return;
    }

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      
      const context = await Promise.race([
        fetchContext(),
        new Promise<string>((_, reject) => setTimeout(() => reject(new Error("Context fetch timeout")), 8000))
      ]).catch(err => {
         console.warn("Context fetch timed out or failed", err);
         return "System Knowledge Base: [LIMITED/PARTIAL DATA DUE TO TIMEOUT]\n\n";
      });
      
      const historyStr = messages.slice(-10).map(m => `${m.role === 'user' ? 'Operator' : 'AI'}: ${m.text}`).join('\n');
      
      const prompt = `You are an advanced AI Analytics Engine for "AutoMatePH", a POS and Inventory system.
You analyze real-time data to provide forecasts, operational insights, and answer queries.
Be concise, analytical, and industrial. Use Markdown for formatting. Prefer bullet points for lists.

${context}

Chat History:
${historyStr}
Operator: ${userMsg}
AI:`;

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: {
          temperature: 0.2, // low temp for analytical consistency
        }
      });

      setMessages(prev => [...prev, { role: 'model', text: response.text || 'No response.' }]);
    } catch (err: any) {
      console.error("AI Insights Error:", err);
      const errMsg = err.message || 'FAILED TO CONNECT TO CORE INTELLIGENCE';
      setMessages(prev => [...prev, { role: 'error', text: `[SYSTEM DIAGNOSTIC] ${errMsg}` }]);
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
               : 'inset-0 sm:inset-auto sm:bottom-6 sm:right-6 sm:w-[400px] md:w-[450px] sm:h-[500px] md:h-[600px]'
           }`}
        >
          <Card className={`flex-1 bg-[#141210] border-[#FF6F00]/50 shadow-[0_0_30px_rgba(255,111,0,0.15)] flex flex-col overflow-hidden relative font-mono ${isExpanded ? 'rounded-none sm:rounded-xl' : 'rounded-none sm:rounded-xl'}`}>
             {/* Header */}
             <div className="h-12 bg-gradient-to-r from-[#FF6F00] to-[#E65100] text-black flex items-center justify-between px-4 shrink-0 shadow-sm">
               <div className="flex items-center gap-2 font-bold text-sm tracking-widest uppercase">
                 <Terminal className="h-5 w-5" />
                 AI_Assistant
               </div>
               <div className="flex items-center gap-1">
                 <button onClick={toggleExpand} className="hover:bg-black/20 p-1.5 rounded transition-colors hidden sm:block" title={isExpanded ? "Restore" : "Maximize"}>
                   {isExpanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                 </button>
                 <button onClick={onClose} className="hover:bg-black/20 p-1.5 rounded transition-colors" title="Close">
                   <X className="h-5 w-5" />
                 </button>
               </div>
             </div>

             {/* Messages */}
             <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6 custom-scrollbar bg-[#0A0C10] text-[#FAF7F2] text-sm leading-relaxed">
               {messages.map((msg, idx) => (
                 <div key={idx} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                   <div className={`text-[10px] tracking-widest uppercase mb-1.5 opacity-70 flex items-center gap-1 ${
                     msg.role === 'user' ? 'text-[#1D9E75]' : msg.role === 'error' ? 'text-red-500' : 'text-[#FF6F00]'
                   }`}>
                     {msg.role === 'user' ? 'OPERATOR' : msg.role === 'error' ? 'SYS_ERROR' : 'SYS_AI'}
                     {msg.role === 'error' && <AlertCircle className="h-3 w-3" />}
                   </div>
                   <div className={`p-4 border rounded-lg shadow-sm ${
                     msg.role === 'user' 
                       ? 'bg-[#1D9E75]/10 border-[#1D9E75]/30 text-[#FAF7F2] rounded-tr-sm' 
                       : msg.role === 'error'
                       ? 'bg-red-500/10 border-red-500/30 text-red-400 rounded-tl-sm'
                       : 'bg-[#1A1614] border-[#3A3230] text-[#E8E6E3] rounded-tl-sm'
                   } max-w-[90%] md:max-w-[85%] break-words whitespace-pre-wrap`}>
                     {msg.role === 'model' || msg.role === 'error' ? (
                       <div className="markdown-body text-xs md:text-sm">
                         <Markdown
                           components={{
                             ul: ({node, ...props}) => <ul className="list-disc pl-4 space-y-1 mb-4 last:mb-0" {...props} />,
                             ol: ({node, ...props}) => <ol className="list-decimal pl-4 space-y-1 mb-4 last:mb-0" {...props} />,
                             li: ({node, ...props}) => <li className="pl-1" {...props} />,
                             p: ({node, ...props}) => <p className="mb-4 last:mb-0 leading-relaxed" {...props} />,
                             strong: ({node, ...props}) => <strong className="font-bold text-[#FF6F00]" {...props} />,
                             em: ({node, ...props}) => <em className="italic text-[#1D9E75]" {...props} />,
                             code: ({node, inline, className, children, ...props}: any) => {
                               return !inline ? (
                                 <div className="bg-black/50 border border-[#3A3230] rounded-md p-3 my-4 overflow-x-auto">
                                   <code className={className} {...props}>
                                     {children}
                                   </code>
                                 </div>
                               ) : (
                                 <code className="bg-black/40 text-[#FF6F00] px-1.5 py-0.5 rounded font-mono text-xs" {...props}>
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
                   <div className="text-[10px] tracking-widest uppercase mb-1.5 opacity-70 text-[#FF6F00]">SYS_AI</div>
                   <div className="p-4 border rounded-lg rounded-tl-sm bg-[#1A1614] border-[#3A3230] text-[#FF6F00] flex items-center gap-3 text-xs md:text-sm">
                     <span className="animate-pulse">[ PROCESSING REQUEST ]</span>
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
             <form onSubmit={handleSend} className="h-14 md:h-16 border-t border-[#3A3230] bg-[#141210] flex items-center px-2">
               <div className="px-3 text-[#FF6F00] hidden sm:block">Admin@Sys:~$</div>
               <div className="px-3 text-[#FF6F00] sm:hidden">~$</div>
               <input
                 ref={inputRef}
                 value={input}
                 onChange={e => setInput(e.target.value)}
                 placeholder="Enter command or query..."
                 className="flex-1 bg-transparent border-none outline-none text-[#FAF7F2] placeholder-[#7A736E] text-sm focus:ring-0 h-full px-2"
                 autoFocus
                 disabled={isTyping}
                 maxLength={500}
               />
               <button 
                 type="submit" 
                 disabled={!input.trim() || isTyping}
                 className="h-10 w-10 flex items-center justify-center rounded-md bg-[#FF6F00]/10 text-[#FF6F00] hover:bg-[#FF6F00] hover:text-black disabled:opacity-30 disabled:hover:bg-[#FF6F00]/10 disabled:hover:text-[#FF6F00] transition-colors mx-2 shrink-0"
               >
                 <Send className="h-4 w-4" />
               </button>
             </form>
          </Card>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

