import React, { useState, useEffect, useRef, useMemo } from 'react';
import { db, auth } from '../lib/firebase';
import { collection, addDoc, updateDoc, doc, deleteDoc, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '../lib/firestore-error';
import { formatCurrency } from '../lib/utils';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { Plus, Search, Edit2, Camera, X, Trash2, Wand2, QrCode, Printer, AlertTriangle, Download } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { toast } from 'sonner';
import { BrowserMultiFormatReader } from '@zxing/library';
import { QRCodeSVG } from 'qrcode.react';
import Fuse from 'fuse.js';

import { useReactToPrint } from 'react-to-print';
import { toPng } from 'html-to-image';
import jsPDF from 'jspdf';
import { useDebounce } from '../hooks/useDebounce';

interface Product {
  id: string;
  barcode: string;
  name: string;
  price: number;
  cost: number;
  stock: number;
  minStock: number;
  category: string;
  description?: string;
  location?: string;
}

export function Inventory() {
  const [products, setProducts] = useState<Product[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isDetailsDialogOpen, setIsDetailsDialogOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [isQrDialogOpen, setIsQrDialogOpen] = useState(false);
  const [qrProduct, setQrProduct] = useState<Product | null>(null);
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
  const [isBatchQrDialogOpen, setIsBatchQrDialogOpen] = useState(false);
  const { role } = useAuth();
  
  const qrPrintRef = useRef<HTMLDivElement>(null);
  const batchQrPrintRef = useRef<HTMLDivElement>(null);
  
  const handlePrintQR = useReactToPrint({
    contentRef: qrPrintRef,
    documentTitle: qrProduct ? `QR_Code_${qrProduct.name}` : 'Product_QR_Code',
  });

  const handlePrintBatchQR = useReactToPrint({
    contentRef: batchQrPrintRef,
    documentTitle: 'Batch_Product_QR_Codes',
  });

  const handleDownloadQRPDF = async () => {
    if (!qrPrintRef.current || !qrProduct) return;
    
    try {
      const dataUrl = await toPng(qrPrintRef.current, { pixelRatio: 3 });
      
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a6', // A small format, similar to a sticker
      });
      
      const imgProps = pdf.getImageProperties(dataUrl);
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;
      
      // Center the image vertically if it's smaller than the page
      const x = 0;
      const y = (pdf.internal.pageSize.getHeight() - pdfHeight) / 2;
      
      pdf.addImage(dataUrl, 'PNG', x, Math.max(0, y), pdfWidth, pdfHeight);
      pdf.save(`QR_Code_${qrProduct.name.replace(/\s+/g, '_')}.pdf`);
      toast.success('PDF downloaded successfully');
    } catch (error) {
      console.error('Failed to generate PDF:', error);
      toast.error('Failed to generate PDF');
    }
  };

  const handleDownloadBatchQRPDF = async () => {
    if (!batchQrPrintRef.current || selectedProductIds.length === 0) return;
    
    try {
      // Temporarily ensure the ref is visible for toPng to capture correctly.
      // (Using a grid or layout inside the dialog should work)
      const dataUrl = await toPng(batchQrPrintRef.current, { pixelRatio: 2 });
      
      // We will export it as A4 format.
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4', 
      });
      
      const imgProps = pdf.getImageProperties(dataUrl);
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;
      
      // If it's longer than a page, it might just run off. A better approach for multi-page 
      // could be complex with html-to-image. For basic batch, we just put it on one long page or let it scale.
      // To support multiple pages properly, generating a PDF from an image that is taller than A4 just cuts it off.
      // So we'll adjust the height of the PDF to fit the image if it's tall.
      if (pdfHeight > pdf.internal.pageSize.getHeight()) {
        const customPdf = new jsPDF({
          orientation: 'portrait',
          unit: 'mm',
          format: [210, Math.max(297, pdfHeight + 20)]
        });
        customPdf.addImage(dataUrl, 'PNG', 0, 10, pdfWidth, pdfHeight);
        customPdf.save(`Batch_QR_Codes.pdf`);
      } else {
        pdf.addImage(dataUrl, 'PNG', 0, 10, pdfWidth, pdfHeight);
        pdf.save(`Batch_QR_Codes.pdf`);
      }
      
      toast.success('Batch PDF downloaded successfully');
    } catch (error) {
      console.error('Failed to generate batch PDF:', error);
      toast.error('Failed to generate Batch PDF');
    }
  };

  const [selectedCategory, setSelectedCategory] = useState<string>('All');

  // Form States
  const [barcode, setBarcode] = useState('');
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [cost, setCost] = useState('');
  const [stock, setStock] = useState('');
  const [minStock, setMinStock] = useState('0');
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  const [locationStr, setLocationStr] = useState('');

  // Scanner States
  const [isScanning, setIsScanning] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const codeReader = useRef(new BrowserMultiFormatReader());
  const [isSubmitting, setIsSubmitting] = useState(false);

  const canEdit = role === 'SUPER_ADMIN' || role === 'STORE_MANAGER';

  useEffect(() => {
    return () => {
      if (codeReader.current) {
        codeReader.current.reset();
      }
    };
  }, []);

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'products'), (snapshot) => {
      const prods: Product[] = [];
      snapshot.forEach((doc) => prods.push({ id: doc.id, ...doc.data() } as Product));
      setProducts(prods);
    }, (error) => handleFirestoreError(error, OperationType.GET, 'products'));

    return () => {
      unsubscribe();
      if (codeReader.current) codeReader.current.reset();
    };
  }, []);

  const openDialog = (product?: Product) => {
    if (product) {
      setEditingProduct(product);
      setBarcode(product.barcode);
      setName(product.name);
      setPrice(product.price.toString());
      setCost(product.cost.toString());
      setStock(product.stock.toString());
      setMinStock(product.minStock.toString());
      setCategory(product.category);
      setDescription(product.description || '');
      setLocationStr(product.location || '');
    } else {
      setEditingProduct(null);
      setBarcode('');
      setName('');
      setPrice('');
      setCost('');
      setStock('');
      setMinStock('0');
      setCategory('');
      setDescription('');
      setLocationStr('');
    }
    setIsDialogOpen(true);
    setIsDetailsDialogOpen(false);
  };

  const closeDialog = () => {
    setIsDialogOpen(false);
    stopScanner();
  };

  const generateBarcode = () => {
    const timestamp = Date.now().toString();
    setBarcode(timestamp);
  };

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

  const startScanner = async () => {
    if (!videoRef.current) {
      toast.error('Scanner initialized improperly.');
      return;
    }
    setIsScanning(true);
    
    const handleResult = (result: any, error: any) => {
      if (result) {
        playBeep();
        setBarcode(result.getText());
        toast.success('Barcode scanned successfully!');
        stopScanner();
      }
      if (error && error.name !== 'NotFoundException') {
        console.warn('Scanner error:', error);
      }
    };

    try {
      if (!codeReader.current) {
         codeReader.current = new BrowserMultiFormatReader();
      }

      try {
        await codeReader.current.decodeFromConstraints(
          { video: { facingMode: 'environment' } },
          videoRef.current,
          handleResult
        );
      } catch (err: any) {
        console.warn('Failed to start environment camera, falling back to default:', err);
        await codeReader.current.decodeFromConstraints(
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
    if (codeReader.current) {
      codeReader.current.reset();
    }
    setIsScanning(false);
  };

  const handleSave = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!barcode || !name || !price || !cost || !stock || !category) {
      toast.error('Please fill in all required fields');
      return;
    }

    if (parseFloat(price) < parseFloat(cost)) {
      toast.error('Selling price cannot be less than cost');
      return;
    }

    // Check if barcode already exists
    const existingProduct = products.find(p => p.barcode === barcode);
    if (!editingProduct && existingProduct) {
      toast.error('A product with this barcode already exists');
      return;
    }

    if (editingProduct && existingProduct && existingProduct.id !== editingProduct.id) {
      toast.error('Another product is already using this barcode');
      return;
    }

    setIsSubmitting(true);

    const productData = {
      barcode,
      name,
      price: parseFloat(price),
      cost: parseFloat(cost),
      stock: parseInt(stock, 10),
      minStock: parseInt(minStock, 10) || 0,
      category,
      description,
      location: locationStr,
    };

    try {
      if (editingProduct) {
        await updateDoc(doc(db, 'products', editingProduct.id), {
          ...productData,
          updatedAt: serverTimestamp()
        });
        await addDoc(collection(db, 'activityLogs'), {
          type: 'STOCK_ADJUSTMENT',
          userId: auth.currentUser?.uid || 'Unknown',
          details: `Updated PRODUCT ${productData.name}`,
          timestamp: serverTimestamp()
        });
        toast.success('Product updated');
      } else {
        await addDoc(collection(db, 'products'), {
          ...productData,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
        await addDoc(collection(db, 'activityLogs'), {
          type: 'INBOUND_DELIVERY',
          userId: auth.currentUser?.uid || 'Unknown',
          details: `Created PRODUCT ${productData.name}`,
          timestamp: serverTimestamp()
        });
        toast.success('Product added');
      }
      closeDialog();
    } catch (error) {
      handleFirestoreError(error, editingProduct ? OperationType.UPDATE : OperationType.CREATE, 'products');
    } finally {
      setIsSubmitting(false);
    }
  };

  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [productToDelete, setProductToDelete] = useState<Product | null>(null);

  const handleDelete = async () => {
    if (!productToDelete) return;
    try {
      await deleteDoc(doc(db, 'products', productToDelete.id));
      await addDoc(collection(db, 'activityLogs'), {
        type: 'STOCK_ADJUSTMENT',
        userId: auth.currentUser?.uid || 'Unknown',
        details: `Deleted PRODUCT ${productToDelete.name}`,
        timestamp: serverTimestamp()
      });
      toast.success('Product deleted successfully');
      setIsDeleteDialogOpen(false);
      setProductToDelete(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, 'products');
    }
  };

  const debouncedSearchQuery = useDebounce(searchQuery, 300);

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

  const handleToggleSelectAll = () => {
    if (selectedProductIds.length === filteredProducts.length && filteredProducts.length > 0) {
      setSelectedProductIds([]);
    } else {
      setSelectedProductIds(filteredProducts.map(p => p.id));
    }
  };

  const handleToggleSelect = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedProductIds(prev => 
      prev.includes(id) ? prev.filter(pid => pid !== id) : [...prev, id]
    );
  };

  const lowStockProducts = useMemo(() => {
    return products.filter(p => p.stock <= p.minStock && p.stock > 0);
  }, [products]);

  const outOfStockProducts = useMemo(() => {
    return products.filter(p => p.stock === 0);
  }, [products]);

  const handleDownloadCSV = () => {
    if (products.length === 0) {
      toast.error('No products to export');
      return;
    }

    const headers = ['Name', 'Barcode', 'Category', 'Price', 'Cost', 'Current Stock', 'Min Stock', 'Total Retail Value'];
    const csvContent = [
      headers.join(','),
      ...products.map(p => {
        return [
          `"${p.name.replace(/"/g, '""')}"`,
          `"${p.barcode}"`,
          `"${p.category}"`,
          p.price,
          p.cost,
          p.stock,
          p.minStock,
          (p.price * p.stock).toFixed(2)
        ].join(',');
      })
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `inventory_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    
    toast.success('Inventory exported successfully');
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between gap-4 items-start sm:items-center">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-[#FAF7F2]">Inventory Management</h2>
          <p className="text-sm font-mono text-[#7A736E]">Real-time stock tracking and adjustments</p>
        </div>
        
        <div className="flex items-center gap-2">
          {selectedProductIds.length > 0 && (
            <Button onClick={() => setIsBatchQrDialogOpen(true)} variant="outline" className="border-[#FF6F00] text-[#FF6F00] hover:bg-[#FF6F00] hover:text-black font-mono text-xs">
              <QrCode className="mr-2 h-4 w-4" /> Generate Batch QR ({selectedProductIds.length})
            </Button>
          )}
          <Button onClick={handleDownloadCSV} variant="outline" className="border-[#3A3230] text-[#7A736E] hover:text-[#FAF7F2] font-mono text-xs">
            <Download className="mr-2 h-4 w-4" /> Export CSV
          </Button>

          {canEdit && (
            <Dialog open={isDialogOpen} onOpenChange={isOpen => {
            if (!isOpen) closeDialog();
            else openDialog();
          }}>
            <DialogTrigger render={<Button className="bg-[#FF6F00] hover:bg-[#FF6F00]/80 text-black font-semibold" />}>
              <Plus className="mr-2 h-4 w-4" /> Add Product
            </DialogTrigger>
            <DialogContent className="bg-[#141210] border-[#3A3230] text-[#FAF7F2] sm:max-w-[425px]">
              <DialogHeader>
                <DialogTitle>{editingProduct ? 'Edit Product' : 'New Product'}</DialogTitle>
              </DialogHeader>

              <div className={`relative rounded-md overflow-hidden bg-black aspect-video border border-[#FF6F00] ${isScanning ? 'block' : 'hidden'}`}>
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

              <form onSubmit={handleSave} className="grid grid-cols-2 gap-4 py-4">
                <div className="col-span-2 space-y-2">
                  <label className="text-xs font-mono text-[#7A736E] uppercase">Barcode</label>
                  <div className="flex gap-2">
                    <Input 
                      name="barcode" 
                      value={barcode}
                      onChange={(e) => setBarcode(e.target.value)}
                      required 
                      className="bg-[#0A0C10] border-[#3A3230] font-mono focus-visible:ring-[#FF6F00]" 
                    />
                    {!isScanning && (
                      <>
                        <Button 
                          type="button"
                          onClick={generateBarcode}
                          className="bg-[#1A1614] border border-[#3A3230] text-[#FF6F00] hover:bg-[#3A3230] shrink-0"
                          title="Generate Barcode"
                        >
                          <Wand2 className="h-4 w-4" />
                        </Button>
                        <Button 
                          type="button"
                          onClick={startScanner}
                          className="bg-[#1A1614] border border-[#3A3230] text-[#1D9E75] hover:bg-[#3A3230] shrink-0"
                          title="Scan Barcode"
                        >
                          <Camera className="h-4 w-4" />
                        </Button>
                      </>
                    )}
                  </div>
                </div>
                <div className="col-span-2 space-y-2">
                  <label className="text-xs font-mono text-[#7A736E] uppercase">Name</label>
                  <Input 
                    name="name" 
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required 
                    className="bg-[#0A0C10] border-[#3A3230] focus-visible:ring-[#FF6F00]" 
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-mono text-[#7A736E] uppercase">Price (₱)</label>
                  <Input 
                    name="price" 
                    type="number" 
                    step="0.01" 
                    min="0" 
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    required 
                    className="bg-[#0A0C10] border-[#3A3230] focus-visible:ring-[#FF6F00]" 
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-mono text-[#7A736E] uppercase">Cost (₱)</label>
                  <Input 
                    name="cost" 
                    type="number" 
                    step="0.01" 
                    min="0" 
                    value={cost}
                    onChange={(e) => setCost(e.target.value)}
                    required 
                    className="bg-[#0A0C10] border-[#3A3230] focus-visible:ring-[#FF6F00]" 
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-mono text-[#7A736E] uppercase">Initial Stock</label>
                  <Input 
                    name="stock" 
                    type="number" 
                    min="0" 
                    value={stock}
                    onChange={(e) => setStock(e.target.value)}
                    required 
                    className="bg-[#0A0C10] border-[#3A3230] focus-visible:ring-[#FF6F00]" 
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-mono text-[#7A736E] uppercase">Min Stock (Alert)</label>
                  <Input 
                    name="minStock" 
                    type="number" 
                    min="0" 
                    value={minStock}
                    onChange={(e) => setMinStock(e.target.value)}
                    required 
                    className="bg-[#0A0C10] border-[#3A3230] focus-visible:ring-[#FF6F00]" 
                  />
                </div>
                <div className="col-span-2 space-y-2">
                  <label className="text-xs font-mono text-[#7A736E] uppercase">Category</label>
                  <Input 
                    name="category" 
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    required 
                    className="bg-[#0A0C10] border-[#3A3230] focus-visible:ring-[#FF6F00]" 
                  />
                </div>
                <div className="col-span-2 space-y-2">
                  <label className="text-xs font-mono text-[#7A736E] uppercase">Description</label>
                  <Input 
                    name="description" 
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="bg-[#0A0C10] border-[#3A3230] focus-visible:ring-[#FF6F00]" 
                  />
                </div>
                <div className="col-span-2 space-y-2">
                  <label className="text-xs font-mono text-[#7A736E] uppercase">Location</label>
                  <Input 
                    name="location" 
                    value={locationStr}
                    onChange={(e) => setLocationStr(e.target.value)}
                    className="bg-[#0A0C10] border-[#3A3230] focus-visible:ring-[#FF6F00]" 
                  />
                </div>
                <div className="col-span-2 mt-4">
                  <Button 
                    type="submit" 
                    disabled={isSubmitting}
                    className="w-full bg-[#1D9E75] hover:bg-[#1D9E75]/80 text-[#FAF7F2] font-semibold uppercase tracking-widest text-xs h-10"
                  >
                    {isSubmitting ? 'PROCESSING...' : (editingProduct ? 'Save Changes' : 'Create Product')}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
          )}
        </div>
      </div>

      {(lowStockProducts.length > 0 || outOfStockProducts.length > 0) && (
        <div className="flex flex-col gap-2 p-4 border border-[#3A3230] bg-[#141210]">
          <div className="flex items-center gap-2 text-[#FAF7F2] font-bold text-xs tracking-widest uppercase mb-1 font-mono">
            <AlertTriangle className="h-4 w-4 text-[#FF6F00]" />
            Inventory Alerts
          </div>
          {outOfStockProducts.length > 0 && (
            <div className="flex items-start gap-3 px-4 py-3 bg-red-500/10 border border-red-500/20 text-red-500 rounded-sm text-xs font-mono">
               <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse mt-1 shrink-0"></span>
               <div>
                 <span className="font-bold tracking-wider">{outOfStockProducts.length} CRITICAL ERRORS</span>
                 <p className="mt-1 opacity-80 leading-relaxed">Items totally depleted. Restock immediately.</p>
               </div>
            </div>
          )}
          {lowStockProducts.length > 0 && (
            <div className="flex items-start gap-3 px-4 py-3 bg-[#FF6F00]/10 border border-[#FF6F00]/20 text-[#FF6F00] rounded-sm text-xs font-mono">
               <span className="w-2 h-2 rounded-full bg-[#FF6F00] animate-pulse mt-1 shrink-0"></span>
               <div>
                 <span className="font-bold tracking-wider">{lowStockProducts.length} WARNINGS</span>
                 <p className="mt-1 opacity-80 leading-relaxed">Items below minimum stock threshold.</p>
               </div>
            </div>
          )}
        </div>
      )}

      <div className="flex gap-4">
        <div className="flex bg-[#0A0C10] border border-[#3A3230] p-1 items-center w-full max-w-md h-12">
          <div className="px-3 text-[#7A736E]">
            <Search className="h-5 w-5" />
          </div>
          <input 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="SEARCH PRODUCTS..." 
            className="bg-transparent w-full text-sm outline-none font-mono placeholder-[#3A3230] text-[#FAF7F2]"
          />
        </div>
        <select
          value={selectedCategory}
          onChange={(e) => setSelectedCategory(e.target.value)}
          className="bg-[#0A0C10] border border-[#3A3230] h-12 px-3 text-[#FAF7F2] font-mono text-sm min-w-[200px] outline-none rounded-md focus:ring-1 focus:ring-[#FF6F00]"
        >
          <option value="All">ALL CATEGORIES</option>
          {categories.map((c) => (
            <option key={c} value={c}>{c.toUpperCase()}</option>
          ))}
        </select>
      </div>

      <div className="border border-[#3A3230] bg-[#0A0C10] flex-1 overflow-hidden flex flex-col">
        <div className="overflow-x-auto flex-1">
          <Table>
            <TableHeader className="bg-[#1A1614]">
              <TableRow className="border-[#3A3230] hover:bg-transparent">
                <TableHead className="w-[40px] px-4">
                  <input
                    type="checkbox"
                    className="rounded border-[#3A3230] bg-[#0A0C10] text-[#1D9E75] focus:ring-[#1D9E75]"
                    checked={selectedProductIds.length === filteredProducts.length && filteredProducts.length > 0}
                    onChange={handleToggleSelectAll}
                  />
                </TableHead>
                <TableHead className="text-[10px] whitespace-nowrap font-mono text-[#7A736E] uppercase tracking-wider w-[100px]">BARCODE</TableHead>
                <TableHead className="text-[10px] whitespace-nowrap font-mono text-[#7A736E] uppercase tracking-wider min-w-[150px]">PRODUCT NAME</TableHead>
                <TableHead className="text-[10px] whitespace-nowrap font-mono text-[#7A736E] uppercase tracking-wider">CATEGORY</TableHead>
                <TableHead className="text-[10px] whitespace-nowrap font-mono text-[#7A736E] uppercase tracking-wider text-right">PRICE</TableHead>
                <TableHead className="text-[10px] whitespace-nowrap font-mono text-[#7A736E] uppercase tracking-wider text-right">STOCK</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className="text-sm font-mono">
              {filteredProducts.map((product) => (
                <TableRow 
                  key={product.id} 
                  className="border-[#3A3230] bg-[#141210] hover:bg-[#1A1614] transition-colors cursor-pointer"
                  onClick={() => {
                    setSelectedProduct(product);
                    setIsDetailsDialogOpen(true);
                  }}
                >
                  <TableCell className="w-[40px] px-4" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      className="rounded border-[#3A3230] bg-[#0A0C10] text-[#1D9E75] focus:ring-[#1D9E75]"
                      checked={selectedProductIds.includes(product.id)}
                      onChange={(e) => handleToggleSelect(product.id, e as any)}
                    />
                  </TableCell>
                  <TableCell className="text-[#7A736E] whitespace-nowrap">{product.barcode}</TableCell>
                  <TableCell className="text-[#FAF7F2] font-sans whitespace-nowrap">{product.name}</TableCell>
                  <TableCell>
                    <span className="text-[#7A736E] whitespace-nowrap">
                      {product.category}
                    </span>
                  </TableCell>
                  <TableCell className="text-right text-[#1D9E75] whitespace-nowrap">₱{formatCurrency(product.price)}</TableCell>
                  <TableCell className="text-right whitespace-nowrap">
                    <div className="flex items-center justify-end gap-2">
                      {product.stock <= product.minStock && product.stock > 0 && (
                        <span className="w-2 h-2 rounded-full bg-[#FF6F00] animate-pulse" title="Low Stock"></span>
                      )}
                      {product.stock === 0 && (
                        <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" title="Out of Stock"></span>
                      )}
                      <span className="text-[#FAF7F2]">{product.stock}</span>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {filteredProducts.length === 0 && (
               <TableRow className="border-[#3A3230] bg-[#141210]">
                 <TableCell colSpan={5} className="h-24 text-center font-mono text-[#7A736E] uppercase tracking-widest text-[10px]">
                    NO PRODUCTS FOUND
                 </TableCell>
               </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <Dialog open={isDetailsDialogOpen} onOpenChange={setIsDetailsDialogOpen}>
        <DialogContent className="bg-[#141210] border-[#3A3230] text-[#FAF7F2] sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="text-[#FF6F00] uppercase tracking-widest flex justify-between items-center pr-6">
              Product Details
              <div className="flex items-center gap-2">
                {canEdit && (
                  <>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-8 w-8 text-[#7A736E] hover:text-[#1D9E75] hover:bg-[#1D9E75]/10"
                      onClick={() => {
                        setIsDetailsDialogOpen(false);
                        if (selectedProduct) {
                          setQrProduct(selectedProduct);
                          setIsQrDialogOpen(true);
                        }
                      }}
                      title="Generate QR Code"
                    >
                      <QrCode className="h-4 w-4" />
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-8 w-8 text-[#7A736E] hover:text-[#FF6F00] hover:bg-[#FF6F00]/10"
                      onClick={() => openDialog(selectedProduct!)}
                      title="Edit Product"
                    >
                      <Edit2 className="h-4 w-4" />
                    </Button>
                  </>
                )}
                {role === 'SUPER_ADMIN' && (
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-8 w-8 text-[#7A736E] hover:text-red-500 hover:bg-red-500/10"
                    onClick={() => {
                      setIsDetailsDialogOpen(false);
                      if (selectedProduct) {
                        setProductToDelete(selectedProduct);
                        setIsDeleteDialogOpen(true);
                      }
                    }}
                    title="Delete Product"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </DialogTitle>
          </DialogHeader>
          
          {selectedProduct && (
            <div className="py-4 space-y-4 font-mono">
              <div className="flex justify-between border-b border-[#3A3230] pb-2">
                <span className="text-[#7A736E] text-xs uppercase tracking-widest">Name</span>
                <span className="text-[#FAF7F2] font-sans font-bold">{selectedProduct.name}</span>
              </div>
              <div className="flex justify-between border-b border-[#3A3230] pb-2">
                <span className="text-[#7A736E] text-xs uppercase tracking-widest">Barcode</span>
                <span className="text-[#FAF7F2]">{selectedProduct.barcode}</span>
              </div>
              <div className="flex justify-between border-b border-[#3A3230] pb-2">
                <span className="text-[#7A736E] text-xs uppercase tracking-widest">Category</span>
                <span className="text-[#FAF7F2]">{selectedProduct.category}</span>
              </div>
              <div className="flex justify-between border-b border-[#3A3230] pb-2">
                <span className="text-[#7A736E] text-xs uppercase tracking-widest">Price</span>
                <span className="text-[#1D9E75] font-bold">₱{formatCurrency(selectedProduct.price)}</span>
              </div>
              <div className="flex justify-between border-b border-[#3A3230] pb-2">
                <span className="text-[#7A736E] text-xs uppercase tracking-widest">Cost</span>
                <span className="text-[#FF6F00]">₱{selectedProduct.cost ? formatCurrency(selectedProduct.cost) : '0.00'}</span>
              </div>
              <div className="flex justify-between border-b border-[#3A3230] pb-2">
                <span className="text-[#7A736E] text-xs uppercase tracking-widest">Stock</span>
                <span className="text-[#FAF7F2]">{selectedProduct.stock} (Min: {selectedProduct.minStock})</span>
              </div>
              
              {selectedProduct.location && (
                <div className="flex justify-between border-b border-[#3A3230] pb-2">
                  <span className="text-[#7A736E] text-xs uppercase tracking-widest">Location</span>
                  <span className="text-[#FAF7F2]">{selectedProduct.location}</span>
                </div>
              )}
              
              <div className="pt-2">
                <span className="text-[#7A736E] text-xs uppercase tracking-widest block mb-1">Description</span>
                <p className="text-[#FAF7F2] font-sans text-sm whitespace-pre-wrap leading-relaxed">
                  {selectedProduct.description || 'No description provided.'}
                </p>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent className="bg-[#141210] border-[#3A3230] text-[#FAF7F2] sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="text-red-500 flex items-center gap-2">
              <Trash2 className="h-5 w-5" /> Confirm Deletion
            </DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="font-mono text-sm text-[#7A736E]">
              Are you sure you want to delete <span className="text-[#FAF7F2] font-semibold">{productToDelete?.name}</span>?
            </p>
            <p className="font-mono text-xs text-red-400 mt-2">
              This action cannot be undone and will permanently remove the product from inventory.
            </p>
          </div>
          <div className="flex justify-end gap-3 mt-4">
            <Button 
              variant="ghost" 
              onClick={() => setIsDeleteDialogOpen(false)}
              className="text-[#FAF7F2] hover:bg-[#1A1614] font-mono text-xs uppercase tracking-widest"
            >
              Cancel
            </Button>
            <Button 
              onClick={handleDelete}
              className="bg-red-500 hover:bg-red-600 text-white font-mono text-xs uppercase tracking-widest"
            >
              Delete Product
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* QR Code Dialog */}
      <Dialog open={isQrDialogOpen} onOpenChange={setIsQrDialogOpen}>
        <DialogContent className="bg-[#141210] border-[#3A3230] text-[#FAF7F2] sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle className="text-[#FF6F00] flex items-center gap-2">
              <QrCode className="h-5 w-5" /> Product QR Code
            </DialogTitle>
          </DialogHeader>
          {qrProduct && (
            <div className="flex flex-col items-center justify-center py-6 gap-6">
              <div 
                id="print-qr-section" 
                ref={qrPrintRef}
                className="bg-white p-6 rounded-xl shadow-lg flex flex-col items-center gap-4"
              >
                <div className="text-center w-full">
                  <h3 className="text-black font-sans font-bold text-lg leading-tight truncate px-2 w-[200px]">
                    {qrProduct.name}
                  </h3>
                  <p className="text-gray-500 font-mono text-xs mt-1">
                    {qrProduct.category}
                  </p>
                </div>
                <QRCodeSVG 
                  value={qrProduct.barcode} 
                  size={150}
                  level="H"
                  includeMargin={true}
                />
                <div className="text-center w-full">
                  <p className="text-black font-mono text-sm font-bold tracking-[0.2em]">
                    {qrProduct.barcode}
                  </p>
                  <p className="text-gray-600 font-sans text-sm font-semibold mt-1">
                    ₱{formatCurrency(qrProduct.price)}
                  </p>
                </div>
              </div>
              <p className="font-mono text-xs text-[#7A736E] text-center max-w-[280px]">
                Print this QR code and attach it to the physical product to quickly scan it at the POS.
              </p>
          </div>
          )}
          <div className="flex flex-col sm:flex-row justify-end gap-3 mt-4">
            <Button 
              variant="ghost" 
              onClick={() => setIsQrDialogOpen(false)}
              className="text-[#FAF7F2] hover:bg-[#1A1614] font-mono text-xs uppercase tracking-widest sm:flex-1"
            >
              Close
            </Button>
            <Button 
              onClick={handleDownloadQRPDF}
              variant="outline"
              className="border-[#FF6F00] text-[#FF6F00] hover:bg-[#FF6F00] hover:text-black font-mono text-xs uppercase tracking-widest sm:flex-1"
            >
              <Download className="h-4 w-4 mr-2" /> Download PDF
            </Button>
            <Button 
              onClick={() => handlePrintQR()}
              className="bg-[#1D9E75] hover:bg-[#147a5b] text-white font-mono text-xs uppercase tracking-widest sm:flex-1"
            >
              <Printer className="h-4 w-4 mr-2" /> Print QR Code
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Batch QR Code Dialog */}
      <Dialog open={isBatchQrDialogOpen} onOpenChange={setIsBatchQrDialogOpen}>
        <DialogContent className="bg-[#141210] border-[#3A3230] text-[#FAF7F2] sm:max-w-[800px] max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="text-[#FF6F00] flex items-center gap-2">
              <QrCode className="h-5 w-5" /> Batch QR Codes ({selectedProductIds.length})
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto p-4 bg-[#0A0C10] border border-[#3A3230] rounded-md custom-scrollbar">
            <div 
              ref={batchQrPrintRef}
              className="bg-white p-6 grid grid-cols-2 md:grid-cols-3 gap-6"
            >
              <style type="text/css" media="print">
                {`
                  @page { size: auto; margin: 10mm; }
                  body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                `}
              </style>
              {products.filter(p => selectedProductIds.includes(p.id)).map(product => (
                <div key={product.id} className="flex flex-col items-center justify-center p-4 border border-dashed border-gray-300 rounded-lg">
                  <div className="text-center w-full mb-3">
                    <h3 className="text-black font-sans font-bold text-sm leading-tight truncate px-1 w-full">
                      {product.name}
                    </h3>
                    <p className="text-gray-500 font-mono text-[10px] mt-1">
                      {product.category}
                    </p>
                  </div>
                  <QRCodeSVG 
                    value={product.barcode} 
                    size={100}
                    level="Q"
                    includeMargin={false}
                  />
                  <div className="text-center w-full mt-3">
                    <p className="text-black font-mono text-xs font-bold tracking-[0.1em]">
                      {product.barcode}
                    </p>
                    <p className="text-gray-600 font-sans text-xs font-semibold mt-1">
                      ₱{formatCurrency(product.price)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="flex flex-col sm:flex-row justify-end gap-3 pt-4 border-t border-[#3A3230]">
            <Button 
              variant="ghost" 
              onClick={() => setIsBatchQrDialogOpen(false)}
              className="text-[#FAF7F2] hover:bg-[#1A1614] font-mono text-xs uppercase tracking-widest sm:flex-1"
            >
              Close
            </Button>
            <Button 
              onClick={handleDownloadBatchQRPDF}
              variant="outline"
              className="border-[#FF6F00] text-[#FF6F00] hover:bg-[#FF6F00] hover:text-black font-mono text-xs uppercase tracking-widest sm:flex-1"
            >
              <Download className="h-4 w-4 mr-2" /> Download PDF
            </Button>
            <Button 
              onClick={() => handlePrintBatchQR()}
              className="bg-[#1D9E75] hover:bg-[#147a5b] text-white font-mono text-xs uppercase tracking-widest sm:flex-1"
            >
              <Printer className="h-4 w-4 mr-2" /> Print Batch
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

