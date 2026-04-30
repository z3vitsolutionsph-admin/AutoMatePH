import React, { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ShoppingCart, Search, CreditCard, Wallet, Banknote, Plus, Minus, Trash2, WifiOff, Camera, X, Printer, CheckCircle2 } from 'lucide-react';
import { Card, CardContent } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';
import { toast } from 'sonner';
import { db, auth } from '../lib/firebase';
import { collection, addDoc, serverTimestamp, getDocs, onSnapshot, updateDoc, doc } from 'firebase/firestore';
import { dbLocal } from '../lib/db';
import { handleFirestoreError, OperationType } from '../lib/firestore-error';
import { formatCurrency } from '../lib/utils';
import { BrowserMultiFormatReader } from '@zxing/library';
import Fuse from 'fuse.js';
import { useDebounce } from '../hooks/useDebounce';
import { useReactToPrint } from 'react-to-print';

// Mock inventory for quick demonstration, but we'll sync with Firestore
interface Product {
  id: string;
  barcode: string;
  name: string;
  price: number;
  stock: number;
  category?: string;
}

interface CartItem extends Product {
  quantity: number;
  subtotal: number;
}

export function POS() {
  const [products, setProducts] = useState<Product[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [isSyncing, setIsSyncing] = useState(false);
  const [checkoutModalOpen, setCheckoutModalOpen] = useState(false);
  const [cashReceived, setCashReceived] = useState('');
  const cashInputRef = useRef<HTMLInputElement>(null);
  
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Receipt Modal State
  const [receiptModalOpen, setReceiptModalOpen] = useState(false);
  const [completedTx, setCompletedTx] = useState<any>(null);
  const receiptPrintRef = useRef<HTMLDivElement>(null);

  const handlePrintReceipt = useReactToPrint({
    contentRef: receiptPrintRef,
    documentTitle: completedTx ? `Receipt_${completedTx.id}` : 'Transaction_Receipt',
    onAfterPrint: () => toast.success('Receipt printed successfully.'),
    onPrintError: (error) => toast.error('Error encountered while printing the receipt.'),
  });

  useEffect(() => {
    const handleOnline = async () => {
      setIsOffline(false);
      try {
        const pendingTxs = await dbLocal.transactions.where('status').equals('pending').toArray();
        if (pendingTxs.length > 0) {
          setIsSyncing(true);
          toast.success(`Syncing ${pendingTxs.length} offline transactions...`);
          let successCount = 0;
          for (const tx of pendingTxs) {
            try {
              await addDoc(collection(db, 'transactions'), {
                ...tx.transactionData,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp()
              });
              await dbLocal.transactions.update(tx.id!, { status: 'synced' });
              successCount++;
            } catch (err) {
              console.error("Failed to sync specific tx:", err);
            }
          }
          setIsSyncing(false);
          toast.success(`Offline synchronization complete. ${successCount}/${pendingTxs.length} synced successfully.`);
        }
      } catch (e) {
        setIsSyncing(false);
        console.error("Failed to sync offline tx", e);
        toast.error("Failed to sync some offline transactions.");
      }
    };
    
    const handleOffline = () => setIsOffline(true);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    // Fetch products from Firestore
    const unsubscribe = onSnapshot(collection(db, 'products'), (snapshot) => {
      const prods: Product[] = [];
      snapshot.forEach((doc) => {
        prods.push({ id: doc.id, ...doc.data() } as Product);
      });
      setProducts(prods);
    }, (error) => {
       handleFirestoreError(error, OperationType.GET, 'products');
    });

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    return () => {
      if (codeReaderRef.current) {
        codeReaderRef.current.reset();
      }
    };
  }, []);

  const [isScanning, setIsScanning] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const codeReaderRef = useRef<BrowserMultiFormatReader | null>(null);

  useEffect(() => {
    // Auto-add product if barcode matches exactly
    if (searchQuery) {
      const exactMatch = products.find(p => p.barcode === searchQuery);
      if (exactMatch) {
         addToCart(exactMatch);
         setSearchQuery('');
      }
    }
  }, [searchQuery, products]);

  const playBeep = () => {
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);
      
      oscillator.type = 'sine';
      oscillator.frequency.value = 800;
      gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
      
      oscillator.start();
      setTimeout(() => oscillator.stop(), 100);
    } catch (e) {
      console.error("Audio beep failed", e);
    }
  };

  const lastScannedBarcode = useRef<string | null>(null);
  const lastScanTime = useRef<number>(0);

  const startScanner = async () => {
    if (!videoRef.current) {
      toast.error('Scanner initialized improperly.');
      return;
    }
    setIsScanning(true);
    
    const handleResult = (result: any, error: any) => {
      if (result) {
        const scannedBarcode = result.getText();
        const now = Date.now();
        
        // Prevent rapid re-scanning of the same barcode within 2 seconds
        if (scannedBarcode === lastScannedBarcode.current && now - lastScanTime.current < 2000) {
          return;
        }
        
        lastScannedBarcode.current = scannedBarcode;
        lastScanTime.current = now;
        
        playBeep();
        const exactMatch = products.find(p => p.barcode === scannedBarcode);
        if (exactMatch) {
          toast.success(`Added 1x ${exactMatch.name}`);
          addToCart(exactMatch);
          // Keep scanning continuously for POS!
        } else {
          toast.warning('Product barcode not recognized in inventory');
          setSearchQuery(scannedBarcode);
          stopScanner(); // Stop if not found so they can manually intervene
        }
      }
      if (error && error.name !== 'NotFoundException') {
        // console.warn('Scanner error:', error); // can be noisy
      }
    };

    try {
      if (!codeReaderRef.current) {
        codeReaderRef.current = new BrowserMultiFormatReader();
      }
      
      try {
        await codeReaderRef.current.decodeFromConstraints(
          { video: { facingMode: 'environment' } }, 
          videoRef.current, 
          handleResult
        );
      } catch (err: any) {
        // Fallback to any camera if environment facing fails
        console.warn('Failed to start environment camera, falling back to default:', err);
        await codeReaderRef.current.decodeFromConstraints(
          { video: true },
          videoRef.current,
          handleResult
        );
      }
    } catch (err: any) {
      console.error('Camera initialization error:', err);
      let errorMessage = 'Could not start camera. Please check permissions.';
      if (err?.name === 'NotAllowedError') {
        errorMessage = 'Camera access was denied. Please grant permissions in your browser.';
      } else if (err?.name === 'NotFoundError') {
        errorMessage = 'No camera found on this device.';
      } else if (err?.name === 'NotReadableError') {
        errorMessage = 'Camera is already in use by another application.';
      } else if (err?.message) {
        errorMessage = `Camera error: ${err.message}`;
      }
      toast.error(errorMessage);
      setIsScanning(false);
    }
  };


  const stopScanner = () => {
    if (codeReaderRef.current) {
      codeReaderRef.current.reset();
    }
    setIsScanning(false);
  };


  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F1') {
        e.preventDefault();
        searchInputRef.current?.focus();
      } else if (e.key === 'F2') {
        e.preventDefault();
        initiateCheckout('CASH');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [cart]);

  const debouncedSearchQuery = useDebounce(searchQuery, 300);
  const [selectedCategory, setSelectedCategory] = useState<string>('All');

  const categories = useMemo(() => Array.from(new Set(products.map(p => p.category))).filter(Boolean).sort(), [products]);

  const filteredProducts = useMemo(() => {
    let result = products;

    if (selectedCategory !== 'All') {
      result = result.filter(p => p.category === selectedCategory);
    }

    if (debouncedSearchQuery) {
      const fuse = new Fuse(result, {
        keys: ['name', 'barcode', 'category'],
        threshold: 0.3,
      });
      result = fuse.search(debouncedSearchQuery).map(res => res.item);
    }

    return result;
  }, [products, debouncedSearchQuery, selectedCategory]);

  const addToCart = (product: Product) => {
    setCart(prev => {
      const existing = prev.find(item => item.id === product.id);
      if (existing) {
        if (existing.quantity >= product.stock) {
          toast.error(`Out of stock: ${product.name}`);
          return prev;
        }
        return prev.map(item => 
          item.id === product.id 
            ? { ...item, quantity: item.quantity + 1, subtotal: (item.quantity + 1) * item.price }
            : item
        );
      }
      if (product.stock <= 0) {
        toast.error(`Out of stock: ${product.name}`);
        return prev;
      }
      return [...prev, { ...product, quantity: 1, subtotal: product.price }];
    });
  };

  const updateQuantity = (id: string, delta: number) => {
    setCart(prev => prev.map(item => {
      if (item.id === id) {
        const newQuantity = Math.max(1, item.quantity + delta);
        if (newQuantity > item.stock) {
           toast.error(`Cannot exceed stock for ${item.name}`);
           return item;
        }
        return { ...item, quantity: newQuantity, subtotal: newQuantity * item.price };
      }
      return item;
    }));
  };

  const removeFromCart = (id: string) => {
    setCart(prev => prev.filter(item => item.id !== id));
  };

  const total = cart.reduce((sum, item) => sum + item.subtotal, 0);

  const initiateCheckout = (paymentMethod: string) => {
    if (cart.length === 0) return;
    if (paymentMethod === 'CASH') {
      setCashReceived('');
      setCheckoutModalOpen(true);
      setTimeout(() => cashInputRef.current?.focus(), 100);
    } else {
      processCheckout(paymentMethod);
    }
  };

  const processCheckout = async (paymentMethod: string) => {
    if (cart.length === 0) return;
    
    let cashRcv = Number(cashReceived);
    if (paymentMethod !== 'CASH') {
      cashRcv = total; // For card/wallet, they exact amount
    }

    const cashierId = auth.currentUser?.uid || 'UNKNOWN';

    const transactionData = {
      totalAmount: total,
      paymentMethod,
      cashierId,
      items: cart.map(item => ({
        productId: item.id,
        quantity: item.quantity,
        unitPrice: item.price,
        subtotal: item.subtotal,
        name: item.name,
      })),
      status: 'COMPLETED',
      cashReceived: cashRcv,
      change: cashRcv - total,
    };

    let newTxId = '';
    let timestamp = new Date();

    if (isOffline) {
      try {
        newTxId = crypto.randomUUID();
        await dbLocal.transactions.add({
          syncId: newTxId,
          transactionData,
          status: 'pending',
          createdAt: timestamp.toISOString()
        });
        toast.success('Offline mode: Transaction queued locally.', {
          icon: <WifiOff className="h-4 w-4" />
        });
      } catch (err) {
        console.error(err);
        toast.error('Failed to save offline transaction.');
        return;
      }
    } else {
      try {
         const docRef = await addDoc(collection(db, 'transactions'), {
           ...transactionData,
           createdAt: serverTimestamp(),
           updatedAt: serverTimestamp()
         });
         newTxId = docRef.id;

         for (const item of cart) {
           await updateDoc(doc(db, 'products', item.id), {
             stock: item.stock - item.quantity,
             updatedAt: serverTimestamp()
           });
         }

         await addDoc(collection(db, 'activityLogs'), {
           type: 'SALE',
           userId: cashierId,
           details: `Completed SALE for ₱${formatCurrency(total)} (${cart.length} items)`,
           timestamp: serverTimestamp()
         });
         
         toast.success('Transaction Completed Successfully');
      } catch (error) {
         handleFirestoreError(error, OperationType.CREATE, 'transactions');
         return; 
      }
    }

    setCompletedTx({
      id: newTxId,
      ...transactionData,
      createdAt: timestamp,
    });
    setReceiptModalOpen(true);
  };

  const closeReceiptAndNewTransaction = () => {
    setCart([]);
    setCompletedTx(null);
    setCashReceived('');
    setReceiptModalOpen(false);
  };

  return (
    <div className="h-full flex flex-col gap-6 relative">
      {isOffline && (
        <div className="bg-[#FF6F00] text-[#0A0C10] font-mono font-bold text-center py-2 px-4 flex items-center justify-center gap-2 sticky top-0 z-50 shadow-md">
          <WifiOff className="h-5 w-5" />
          <span>OFFLINE MODE - TRANSACTIONS WILL BE SAVED LOCALLY AND SYNCED AUTOMATICALLY</span>
        </div>
      )}
      
      {isSyncing && (
        <div className="bg-[#1D9E75] text-[#0A0C10] font-mono font-bold text-center py-2 px-4 flex items-center justify-center gap-2 sticky top-0 z-50 shadow-md animate-pulse">
          <div className="h-4 w-4 rounded-full border-2 border-[#0A0C10] border-t-transparent animate-spin" />
          <span>SYNCHRONIZING OFFLINE TRANSACTIONS...</span>
        </div>
      )}

      <div className="flex-1 flex flex-col lg:flex-row gap-6">
        {/* Products Section */}
        <div className="flex-1 flex flex-col gap-4">
        <div className="flex flex-col gap-4">
          <div className="flex gap-4">
            <div className="flex-1 bg-[#0A0C10] border border-[#3A3230] p-1 flex items-center h-12">
              <div className="px-3 text-[#7A736E]">
                <Search className="h-5 w-5" />
              </div>
              <input 
                ref={searchInputRef}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="bg-transparent w-full text-sm outline-none font-mono placeholder-[#3A3230] text-[#FAF7F2]" 
                placeholder="SCAN BARCODE OR [F1] SEARCH PRODUCTS..."
              />
              {!isScanning && (
                <Button 
                  type="button"
                  onClick={startScanner}
                  variant="ghost"
                  className="text-[#1D9E75] hover:text-[#1D9E75] hover:bg-[#3A3230]/50 shrink-0 h-full px-4 rounded-none"
                  title="Scan with Camera"
                >
                  <Camera className="h-5 w-5" />
                </Button>
              )}
            </div>
            
            <div className="w-[140px] sm:w-[200px] bg-[#0A0C10] border border-[#3A3230] h-12 flex items-center shrink-0">
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="w-full bg-transparent text-[#FAF7F2] text-sm font-mono outline-none px-3 h-full appearance-none cursor-pointer"
                >
                  <option value="All">ALL CATEGORIES</option>
                  {categories.map((c) => (
                    <option key={c} value={c}>{c.toUpperCase()}</option>
                  ))}
                </select>
            </div>
          </div>
          
          <div className={`relative rounded-md overflow-hidden bg-black aspect-video md:aspect-[21/9] border border-[#FF6F00] shadow-lg max-h-[300px] ${isScanning ? 'block' : 'hidden'}`}>
            <video ref={videoRef} className="absolute inset-0 w-full h-full object-cover" />
            
            {/* Scanner Overlay Frame */}
            <div className="absolute inset-0 z-10 pointer-events-none flex items-center justify-center">
              <div className="w-64 h-32 border-2 border-[#FF6F00] rounded-lg relative overflow-hidden shadow-[0_0_0_9999px_rgba(0,0,0,0.6)]">
                <div className="absolute top-0 left-0 w-full h-0.5 bg-[#FF6F00] shadow-[0_0_8px_#FF6F00] animate-scan"></div>
              </div>
            </div>

            {/* Actions & Instructions */}
            <div className="absolute bottom-4 left-0 right-0 z-20 flex flex-col items-center gap-3">
              <p className="text-[10px] font-mono bg-[#141210]/90 px-3 py-1.5 rounded text-[#FAF7F2] tracking-widest border border-[#3A3230]">
                POSITION BARCODE IN FRAME
              </p>
              <Button 
                type="button"
                variant="destructive"
                onClick={stopScanner}
                className="bg-red-500/90 hover:bg-red-600 text-white font-mono text-xs uppercase tracking-widest px-6 h-8"
              >
                <X className="h-3 w-3 mr-2" /> Cancel Scanning
              </Button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4 overflow-y-auto pb-4 pr-2 custom-scrollbar">
          {filteredProducts.map(product => (
            <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} key={product.id}>
              <Card 
                className="bg-[#141210] border-[#3A3230] hover:border-[#FF6F00] cursor-pointer transition-colors relative overflow-hidden h-full flex flex-col justify-between"
                onClick={() => addToCart(product)}
              >
                <div className="absolute top-2 right-2 text-xs font-mono font-bold text-[#1D9E75]">
                  {product.stock} in stock
                </div>
                <CardContent className="p-4 pt-8">
                  <div className="text-[#FAF7F2] font-medium leading-tight mb-2 truncate" title={product.name}>
                    {product.name}
                  </div>
                  <div className="text-[#FF6F00] font-mono font-bold text-lg">
                    ₱{formatCurrency(product.price)}
                  </div>
                  <div className="text-[#7A736E] font-mono text-xs mt-1">
                    {product.barcode}
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
          {filteredProducts.length === 0 && (
            <div className="col-span-full h-32 flex items-center justify-center text-[#7A736E] font-mono border border-dashed border-[#3A3230] rounded-xl">
              NO INVENTORY MATCH
            </div>
          )}
        </div>
      </div>

      {/* Cart Section */}
      <div className="flex-1 max-w-full lg:max-w-[450px] xl:max-w-[500px] flex flex-col border border-[#3A3230] bg-[#0A0C10] shrink-0">
        <div className="p-4 border-b border-[#3A3230] flex justify-between items-center bg-[#1A1614]">
          <h2 className="text-[#FAF7F2] font-bold flex items-center gap-2 uppercase tracking-widest text-xs font-mono">
            <ShoppingCart className="h-4 w-4 text-[#FF6F00]" />
            Current Order
          </h2>
          {isOffline && (
            <Badge variant="outline" className="bg-red-500/10 text-red-500 border-red-500/50 text-[10px] tracking-widest uppercase">
              OFFLINE QUEUE
            </Badge>
          )}
        </div>
        
        <div className="hidden sm:grid grid-cols-12 gap-2 px-4 py-3 bg-[#1A1614] border-b border-[#3A3230] text-[10px] font-mono text-[#7A736E] uppercase tracking-wider">
          <div className="col-span-4">Item</div>
          <div className="col-span-3 text-center">Qty</div>
          <div className="col-span-2 text-right">Unit</div>
          <div className="col-span-3 text-right">Subtotal</div>
        </div>

        <div className="flex-1 overflow-y-auto font-mono text-sm custom-scrollbar flex flex-col">
          <AnimatePresence>
            {cart.map((item, index) => (
              <motion.div
                key={item.id}
                layout
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="flex flex-col sm:grid sm:grid-cols-12 gap-2 px-4 py-3 border-b border-[#3A3230] bg-[#141210] sm:items-center"
              >
                <div className="sm:col-span-4 flex flex-col sm:block truncate pr-2">
                   <div className="text-[#FAF7F2] truncate font-sans font-bold">{item.name}</div>
                   <div className="text-[10px] text-[#7A736E] sm:hidden font-mono">Unit: ₱{formatCurrency(item.price)}</div>
                </div>
                
                <div className="flex items-center justify-between sm:contents mt-2 sm:mt-0">
                  <div className="sm:col-span-3 flex justify-start sm:justify-center items-center">
                    <div className="flex items-center bg-[#1A1614] rounded border border-[#3A3230]">
                      <button onClick={() => updateQuantity(item.id, -1)} className="p-1 sm:p-1.5 hover:bg-[#3A3230] text-[#7A736E] hover:text-[#FAF7F2]"><Minus className="h-3 w-3 sm:h-4 sm:w-4"/></button>
                      <span className="px-2 font-bold text-xs sm:text-sm min-w-[2rem] text-center text-[#FAF7F2]">{item.quantity}</span>
                      <button onClick={() => updateQuantity(item.id, 1)} className="p-1 sm:p-1.5 hover:bg-[#3A3230] text-[#7A736E] hover:text-[#FAF7F2]"><Plus className="h-3 w-3 sm:h-4 sm:w-4"/></button>
                    </div>
                  </div>

                  <div className="sm:col-span-2 text-right hidden sm:block text-[#7A736E] text-xs">
                    {formatCurrency(item.price)}
                  </div>

                  <div className="sm:col-span-3 flex justify-end items-center gap-3">
                    <span className="text-[#1D9E75] font-bold text-sm sm:text-base">₱{formatCurrency(item.subtotal)}</span>
                    <button onClick={() => removeFromCart(item.id)} className="p-2 text-red-500 hover:bg-red-500/10 rounded transition-colors" title="Remove">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>

          {cart.length === 0 && (
            <div className="h-full flex flex-col items-center justify-center text-[#7A736E] gap-2 p-6">
              <ShoppingCart className="h-8 w-8 opacity-20" />
              <p className="font-mono text-xs uppercase tracking-widest">CART IS EMPTY</p>
            </div>
          )}
        </div>

        <div className="p-4 bg-[#1A1614] flex flex-col gap-4 border-t-2 border-[#FF6F00]">
          <div className="flex justify-between items-center">
            <div className="flex gap-8">
               <div>
                  <p className="text-[10px] text-[#7A736E] uppercase font-mono mb-1">Items</p>
                  <p className="text-xl font-bold font-mono text-[#FAF7F2]">{cart.reduce((s, i) => s + i.quantity, 0).toString().padStart(2, '0')}</p>
               </div>
            </div>
            <div className="text-right">
              <p className="text-xs text-[#FF6F00] uppercase font-bold tracking-widest">Total Due</p>
              <motion.p 
                key={total}
                initial={{ scale: 1.1, color: '#FF6F00' }}
                animate={{ scale: 1, color: '#FAF7F2' }}
                className="text-3xl font-bold leading-none mt-1 font-sans tracking-tight"
              >
                ₱{formatCurrency(total)}
              </motion.p>
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-2 mt-2">
             <Button 
               onClick={() => initiateCheckout('CASH')}
               disabled={cart.length === 0}
               className="h-12 bg-[#FF6F00] hover:bg-[#FF6F00]/80 text-black font-bold uppercase tracking-widest text-xs rounded-sm"
             >
               CASH (F2)
             </Button>
             <Button 
               onClick={() => initiateCheckout('E_WALLET')}
               disabled={cart.length === 0}
               className="h-12 bg-[#1A1614] border border-[#FF6F00] hover:bg-[#FF6F00]/10 text-[#FF6F00] font-bold uppercase tracking-widest text-xs rounded-sm"
             >
               G-CASH
             </Button>
          </div>
        </div>
      </div>
      
      {/* Checkout Modal */}
      <Dialog open={checkoutModalOpen} onOpenChange={setCheckoutModalOpen}>
        <DialogContent 
          className="bg-[#0A0C10] border-[#3A3230] text-[#FAF7F2] font-mono sm:max-w-md"
        >
          <DialogHeader>
            <DialogTitle className="text-[#FF6F00] uppercase tracking-widest text-sm border-b border-[#3A3230] pb-4">
              Cash Checkout
            </DialogTitle>
          </DialogHeader>
          <div className="py-2 flex flex-col gap-6">
            <div className="flex justify-between items-center text-lg">
              <span className="text-[#7A736E] uppercase">Total Due</span>
              <span className="text-3xl font-bold font-sans text-[#FAF7F2]">₱{formatCurrency(total)}</span>
            </div>
            
            <div className="flex flex-col gap-2 relative">
              <label className="text-xs uppercase text-[#7A736E] tracking-widest">Cash Received</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#7A736E] font-sans text-xl">₱</span>
                <Input
                  ref={cashInputRef}
                  type="number"
                  value={cashReceived}
                  onChange={(e) => setCashReceived(e.target.value)}
                  className="pl-8 h-14 bg-[#141210] border-[#FF6F00] text-2xl font-sans text-[#FAF7F2] focus-visible:ring-1 focus-visible:ring-[#FF6F00]"
                  placeholder="0.00"
                  step="0.01"
                  min={total}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && Number(cashReceived) >= total) {
                      e.preventDefault();
                      setCheckoutModalOpen(false);
                      processCheckout('CASH');
                    }
                  }}
                />
              </div>
              {Number(cashReceived) > 0 && Number(cashReceived) < total && (
                 <p className="text-red-500 text-xs text-right mt-1">Insufficient amount</p>
              )}
            </div>

            {Number(cashReceived) > 0 && (
              <div className="flex justify-between items-center bg-[#141210] p-4 rounded-sm border border-[#3A3230]">
                <span className="text-[#7A736E] uppercase tracking-widest text-xs">Change</span>
                <span className={`text-2xl font-bold font-sans ${Number(cashReceived) < total ? 'text-red-500' : 'text-[#1D9E75]'}`}>
                  ₱{formatCurrency(Number(cashReceived) - total)}
                </span>
              </div>
            )}
          </div>
          <DialogFooter className="sm:justify-end gap-2 border-t border-[#3A3230] mt-2 pt-4">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setCheckoutModalOpen(false)}
              className="font-mono text-xs uppercase tracking-widest text-[#7A736E] hover:text-[#FAF7F2] hover:bg-[#3A3230]"
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => {
                setCheckoutModalOpen(false);
                processCheckout('CASH');
              }}
              disabled={Number(cashReceived) < total}
              className="bg-[#1D9E75] hover:bg-[#1D9E75]/80 text-[#0A0C10] font-mono text-xs uppercase tracking-widest"
            >
              Confirm Transaction
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Receipt Modal */}
      <Dialog open={receiptModalOpen} onOpenChange={(open) => {
        if (!open) closeReceiptAndNewTransaction();
      }}>
        <DialogContent 
          className="bg-[#141210] border-[#3A3230] text-[#FAF7F2] font-mono sm:max-w-md p-0 overflow-hidden [&>button]:opacity-0"
        >
          <div className="flex flex-col items-center justify-center p-6 bg-[#1D9E75]/10 border-b border-[#3A3230]">
              <CheckCircle2 className="h-12 w-12 text-[#1D9E75] mb-2" />
              <h2 className="text-xl font-bold font-sans">Payment Successful</h2>
              <p className="text-[#7A736E] text-xs mt-1">Transaction ID: <span className="text-[#FAF7F2]">{completedTx?.id}</span></p>
              {completedTx?.change > 0 && (
                 <div className="mt-4 bg-[#141210] border border-[#1D9E75]/30 rounded-lg px-6 py-3 text-center">
                    <p className="text-[#7A736E] uppercase tracking-widest text-[10px]">Change Due</p>
                    <p className="text-[#1D9E75] font-bold text-2xl font-sans">₱{formatCurrency(completedTx.change)}</p>
                 </div>
              )}
          </div>
          
          <div className="p-6 overflow-y-auto custom-scrollbar max-h-[50vh] flex justify-center">
            <div 
              ref={receiptPrintRef} 
              className="bg-white text-black p-4 font-mono text-[10px] sm:text-xs"
              style={{ width: '80mm', maxWidth: '100%', boxSizing: 'border-box' }}
            >
              {/* Print-specific styles to remove browser headers/footers and margins */}
              <style type="text/css" media="print">
                {`
                  @page { size: auto; margin: 0mm; }
                  body { margin: 10mm; }
                `}
              </style>

              <div className="text-center mb-4">
                <div className="flex justify-center mb-2">
                  {/* Simple logo placeholder */}
                  <div className="h-10 w-10 bg-black text-white flex items-center justify-center rounded-sm font-bold text-xl">
                    A
                  </div>
                </div>
                <h1 className="font-bold text-base sm:text-lg mb-1">AUTOMATE_PH</h1>
                <p>123 Tech Avenue, Makati City</p>
                <p>Metro Manila, Philippines</p>
                <p>VAT REG TIN: 123-456-789-000</p>
                <p>MIN: 123456789</p>
                <p className="my-2 border-b border-dashed border-gray-400"></p>
                <p className="font-bold text-sm tracking-widest">OFFICIAL RECEIPT</p>
                <p className="my-2 border-b border-dashed border-gray-400"></p>
              </div>
              
              <div className="mb-4 space-y-1">
                <div className="flex justify-between">
                  <span>DATE:</span>
                  <span>{completedTx?.createdAt?.toLocaleString() || new Date().toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span>OR NO:</span>
                  <span className="truncate w-32 text-right">{completedTx?.id?.substring(0, 12).toUpperCase()}</span>
                </div>
                <div className="flex justify-between">
                  <span>CASHIER:</span>
                  <span className="truncate w-32 text-right">{completedTx?.cashierId?.substring(0, 8) || 'N/A'}</span>
                </div>
              </div>

              <p className="my-2 border-b border-dashed border-gray-400"></p>
              
              {/* Table Header for Items */}
              <div className="flex justify-between font-bold mb-2 pb-1 border-b border-gray-300">
                <span className="flex-1">ITEM</span>
                <span className="w-16 text-right">QTY</span>
                <span className="w-20 text-right">AMOUNT</span>
              </div>

              <div className="my-2 space-y-2">
                {completedTx?.items.map((item: any, i: number) => (
                  <div key={i} className="flex flex-col">
                     <span className="font-bold">{item.name}</span>
                     <div className="flex justify-between text-gray-700">
                        <span className="flex-1 pl-2">@ {formatCurrency(item.unitPrice)}</span>
                        <span className="w-16 text-right">{item.quantity}</span>
                        <span className="w-20 text-right">{formatCurrency(item.subtotal)}</span>
                     </div>
                  </div>
                ))}
              </div>

              <p className="my-2 border-b border-dashed border-gray-400"></p>
              
              {/* Totals and Tax Breakdown */}
              <div className="my-4 space-y-1">
                <div className="flex justify-between text-gray-700">
                  <span>SUBTOTAL</span>
                  <span>{formatCurrency(completedTx?.totalAmount || 0)}</span>
                </div>
                
                {/* Philippine Standard VAT Calculation (12% Inclusive) */}
                {(() => {
                  const total = completedTx?.totalAmount || 0;
                  const vatable = total / 1.12;
                  const vat = total - vatable;
                  return (
                    <>
                      <div className="flex justify-between text-gray-700 text-[9px]">
                        <span>VATable Sales</span>
                        <span>{formatCurrency(vatable)}</span>
                      </div>
                      <div className="flex justify-between text-gray-700 text-[9px]">
                        <span>VAT Amount (12%)</span>
                        <span>{formatCurrency(vat)}</span>
                      </div>
                      <div className="flex justify-between text-gray-700 text-[9px]">
                        <span>VAT Exempt Sales</span>
                        <span>0.00</span>
                      </div>
                    </>
                  );
                })()}

                <p className="my-2 border-b border-dashed border-gray-400"></p>

                <div className="flex justify-between items-center pb-1">
                  <span className="font-bold text-sm">TOTAL DUE:</span>
                  <span className="text-base font-bold text-black border-y-2 border-black py-1">
                    ₱{formatCurrency(completedTx?.totalAmount || 0)}
                  </span>
                </div>
                
                <div className="flex justify-between mt-2 pt-1 border-t border-gray-300">
                  <span>PAID ({completedTx?.paymentMethod}):</span>
                  <span>{formatCurrency(completedTx?.cashReceived || 0)}</span>
                </div>
                <div className="flex justify-between font-bold">
                  <span>CHANGE:</span>
                  <span>{formatCurrency(completedTx?.change || 0)}</span>
                </div>
              </div>
              
              <p className="my-2 border-b border-dashed border-gray-400"></p>
              
              {/* Footer */}
              <div className="text-center mt-4 space-y-1">
                <p className="font-bold text-xs uppercase">Thank you for your purchase!</p>
                <p className="text-[9px] uppercase">Please come again.</p>
                <p className="text-[9px] mt-2">Return policy: 7 days with original receipt.</p>
                <p className="text-[9px] mt-4 font-bold border-t border-gray-400 pt-2">
                  THIS DOCUMENT IS NOT VALID FOR CLAIM OF INPUT TAX
                </p>
                <p className="text-[8px] mt-1 text-gray-500">
                  Powered by AutoMatePH
                </p>
              </div>
            </div>
          </div>

          <div className="p-4 border-t border-[#3A3230] flex gap-3 bg-[#0A0C10]">
            <Button
              onClick={() => handlePrintReceipt()}
              variant="outline"
              className="flex-1 border-[#FF6F00] text-[#FF6F00] hover:bg-[#FF6F00] hover:text-black font-mono text-xs tracking-widest uppercase"
            >
              <Printer className="h-4 w-4 mr-2" /> Print Receipt
            </Button>
            <Button
              onClick={closeReceiptAndNewTransaction}
              className="flex-1 bg-[#1D9E75] hover:bg-[#1D9E75]/80 text-[#0A0C10] font-mono text-xs tracking-widest uppercase"
            >
              New Transaction
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
    </div>
  );
}
