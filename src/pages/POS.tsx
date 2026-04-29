import React, { useState, useEffect, useRef, useMemo, useDeferredValue } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ShoppingCart, Search, CreditCard, Wallet, Banknote, Plus, Minus, Trash2, WifiOff, Camera, X } from 'lucide-react';
import { Card, CardContent } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { toast } from 'sonner';
import { db, auth } from '../lib/firebase';
import { collection, addDoc, serverTimestamp, getDocs, onSnapshot, updateDoc, doc } from 'firebase/firestore';
import { dbLocal } from '../lib/db';
import { handleFirestoreError, OperationType } from '../lib/firestore-error';
import { BrowserMultiFormatReader } from '@zxing/library';

// Mock inventory for quick demonstration, but we'll sync with Firestore
interface Product {
  id: string;
  barcode: string;
  name: string;
  price: number;
  stock: number;
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
  
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleOnline = async () => {
      setIsOffline(false);
      try {
        const pendingTxs = await dbLocal.transactions.where('status').equals('pending').toArray();
        if (pendingTxs.length > 0) {
          toast.success(`Syncing ${pendingTxs.length} offline transactions...`);
          for (const tx of pendingTxs) {
            await addDoc(collection(db, 'transactions'), {
              ...tx.transactionData,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp()
            });
            await dbLocal.transactions.update(tx.id!, { status: 'synced' });
          }
          toast.success('Offline synchronization complete.');
        }
      } catch (e) {
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
        handleCheckout('CASH');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [cart]);

  const deferredSearchQuery = useDeferredValue(searchQuery);

  const filteredProducts = useMemo(() => {
    return products.filter(p => 
      p.name.toLowerCase().includes(deferredSearchQuery.toLowerCase()) || 
      p.barcode.includes(deferredSearchQuery)
    );
  }, [products, deferredSearchQuery]);

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

  const handleCheckout = async (paymentMethod: string) => {
    if (cart.length === 0) return;
    
    const cashierId = auth.currentUser?.uid;
    if (!cashierId) {
      toast.error('Session expired. Please log in.');
      return;
    }

    const transactionData = {
      totalAmount: total,
      paymentMethod,
      cashierId,
      items: cart.map(item => ({
        productId: item.id,
        quantity: item.quantity,
        unitPrice: item.price,
        subtotal: item.subtotal
      })),
      status: 'COMPLETED'
    };

    if (isOffline) {
      try {
        await dbLocal.transactions.add({
          syncId: crypto.randomUUID(),
          transactionData,
          status: 'pending',
          createdAt: new Date().toISOString()
        });
        toast.success('Offline mode: Transaction queued locally.', {
          icon: <WifiOff className="h-4 w-4" />
        });
        setCart([]);
      } catch (err) {
        console.error(err);
        toast.error('Failed to save offline transaction.');
      }
      return;
    }

    try {
       await addDoc(collection(db, 'transactions'), {
         ...transactionData,
         createdAt: serverTimestamp(),
         updatedAt: serverTimestamp()
       });

       for (const item of cart) {
         await updateDoc(doc(db, 'products', item.id), {
           stock: item.stock - item.quantity,
           updatedAt: serverTimestamp()
         });
       }

       await addDoc(collection(db, 'activityLogs'), {
         type: 'SALE',
         userId: cashierId,
         details: `Completed SALE for ₱${total.toFixed(2)} (${cart.length} items)`,
         timestamp: serverTimestamp()
       });
       
       toast.success('Transaction Completed Successfully');
       setCart([]);
    } catch (error) {
       handleFirestoreError(error, OperationType.CREATE, 'transactions');
    }
  };

  return (
    <div className="h-full flex flex-col lg:flex-row gap-6">
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
                    ₱{product.price.toFixed(2)}
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
                className="grid grid-cols-1 sm:grid-cols-12 gap-2 px-4 py-3 border-b border-[#3A3230] bg-[#141210] items-center"
              >
                <div className="sm:col-span-4 flex flex-col sm:block truncate pr-2">
                   <div className="text-[#FAF7F2] truncate">{item.name}</div>
                   <div className="text-[10px] text-[#7A736E] sm:hidden">₱{item.price.toFixed(2)}</div>
                </div>
                
                <div className="sm:col-span-3 flex justify-between sm:justify-center items-center">
                  <div className="flex items-center bg-[#1A1614] rounded border border-[#3A3230]">
                    <button onClick={() => updateQuantity(item.id, -1)} className="p-1 hover:bg-[#3A3230] text-[#7A736E] hover:text-[#FAF7F2]"><Minus className="h-3 w-3"/></button>
                    <span className="px-2 font-bold text-xs min-w-[1.5rem] text-center text-[#FAF7F2]">{item.quantity}</span>
                    <button onClick={() => updateQuantity(item.id, 1)} className="p-1 hover:bg-[#3A3230] text-[#7A736E] hover:text-[#FAF7F2]"><Plus className="h-3 w-3"/></button>
                  </div>
                </div>

                <div className="sm:col-span-2 text-right hidden sm:block text-[#7A736E] text-xs">
                  {item.price.toFixed(2)}
                </div>

                <div className="sm:col-span-3 flex justify-between sm:justify-end items-center gap-2">
                  <span className="text-[#1D9E75] font-bold">₱{item.subtotal.toFixed(2)}</span>
                  <button onClick={() => removeFromCart(item.id)} className="p-1 text-red-500 hover:bg-red-500/10 rounded transition-colors" title="Remove">
                    <Trash2 className="h-3 w-3" />
                  </button>
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
                ₱{total.toFixed(2)}
              </motion.p>
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-2 mt-2">
             <Button 
               onClick={() => handleCheckout('CASH')}
               disabled={cart.length === 0}
               className="h-12 bg-[#FF6F00] hover:bg-[#FF6F00]/80 text-black font-bold uppercase tracking-widest text-xs rounded-sm"
             >
               CASH (F2)
             </Button>
             <Button 
               onClick={() => handleCheckout('E_WALLET')}
               disabled={cart.length === 0}
               className="h-12 bg-[#1A1614] border border-[#FF6F00] hover:bg-[#FF6F00]/10 text-[#FF6F00] font-bold uppercase tracking-widest text-xs rounded-sm"
             >
               G-CASH
             </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
