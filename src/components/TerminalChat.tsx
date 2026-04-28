import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Terminal, X, Send } from 'lucide-react';
import { Card } from './ui/card';
import { GoogleGenAI } from '@google/genai';
import { db } from '../lib/firebase';
import { collection, getDocs, limit, query, orderBy } from 'firebase/firestore';

interface Message {
  role: 'user' | 'model';
  text: string;
}

export function TerminalChat({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [messages, setMessages] = useState<Message[]>([
    { role: 'model', text: 'AutoMatePH AI Foresight active. Type a command or ask a question.' }
  ]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  const fetchContext = async () => {
    let contextStr = 'Current Context:\n';
    try {
      // Fetch some inventory
      const q = query(collection(db, 'products'), limit(20));
      const snapshot = await getDocs(q);
      const prods: any[] = [];
      snapshot.forEach(doc => {
        const d = doc.data();
        prods.push(`${d.name} (Stock: ${d.stock}, Min: ${d.minStock || 0})`);
      });
      contextStr += `Inventory sample: ${prods.join(', ')}\n`;
    } catch (e) {
      console.warn("Could not fetch inventory for AI context", e);
    }
    return contextStr;
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;

    const userMsg = input.trim();
    setMessages(prev => [...prev, { role: 'user', text: userMsg }]);
    setInput('');
    setIsTyping(true);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      // In a real app we might preserve history or use createChat
      // Here we just build a prompt with some context and history
      
      const context = await fetchContext();
      
      const historyStr = messages.map(m => `${m.role === 'user' ? 'Operator' : 'AI'}: ${m.text}`).join('\n');
      
      const prompt = `You are a terminal-based AI assistant for AutoMatePH, a POS and Inventory system. Be concise, professional, industrial.
      
${context}

Chat History:
${historyStr}
Operator: ${userMsg}
AI:`;

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt
      });

      setMessages(prev => [...prev, { role: 'model', text: response.text || 'No response.' }]);
    } catch (err) {
      console.error(err);
      setMessages(prev => [...prev, { role: 'model', text: '[ERROR: FAILED TO CONNECT TO CORE INTELLIGENCE]' }]);
    } finally {
      setIsTyping(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0, y: 20, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 20, scale: 0.95 }}
          transition={{ type: 'spring', stiffness: 300, damping: 25 }}
          className="fixed bottom-6 right-6 w-[400px] h-[500px] z-50 flex flex-col"
        >
          <Card className="flex-1 bg-[#141210] border-[#FF6F00]/50 shadow-[0_0_30px_rgba(255,111,0,0.1)] flex flex-col overflow-hidden relative font-mono">
            {/* Header */}
            <div className="h-10 bg-[#FF6F00] text-black flex items-center justify-between px-3 shrink-0">
              <div className="flex items-center gap-2 font-bold text-sm">
                <Terminal className="h-4 w-4" />
                FORESIGHT_TERMINAL v1.0
              </div>
              <button onClick={onClose} className="hover:bg-black/20 p-1 rounded transition-colors">
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar bg-[#0A0C10] text-[#FAF7F2] text-xs">
              {messages.map((msg, idx) => (
                <div key={idx} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                  <div className={`text-[10px] uppercase mb-1 opacity-50 ${msg.role === 'user' ? 'text-[#1D9E75]' : 'text-[#FF6F00]'}`}>
                    {msg.role === 'user' ? 'OPERATOR' : 'SYS_AI'}
                  </div>
                  <div className={`p-2 border rounded ${
                    msg.role === 'user' 
                      ? 'bg-[#1D9E75]/10 border-[#1D9E75]/30 text-[#FAF7F2]' 
                      : 'bg-[#1A1614] border-[#3A3230] text-[#7A736E]'
                  } max-w-[85%] break-words whitespace-pre-wrap`}>
                    {msg.text}
                  </div>
                </div>
              ))}
              {isTyping && (
                <div className="text-[#FF6F00] animate-pulse py-2">
                  [ PROCESSING REQUEST... ]
                </div>
              )}
              <div ref={endRef} />
            </div>

            {/* Input */}
            <form onSubmit={handleSend} className="h-12 border-t border-[#3A3230] bg-[#141210] flex items-center">
              <div className="px-3 text-[#FF6F00]">Admin@Sys:~$</div>
              <input
                value={input}
                onChange={e => setInput(e.target.value)}
                placeholder="_"
                className="flex-1 bg-transparent border-none outline-none text-[#FAF7F2] placeholder-[#7A736E] text-xs focus:ring-0"
                autoFocus
              />
              <button 
                type="submit" 
                disabled={!input.trim() || isTyping}
                className="h-full px-3 text-[#7A736E] hover:text-[#FF6F00] disabled:opacity-50 transition-colors"
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
