import React, { useState, useEffect, useRef } from 'react';
import { db, auth } from '../lib/firebase';
import { collection, addDoc, updateDoc, doc, deleteDoc, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '../lib/firestore-error';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { Plus, Search, Edit2, Camera, X, Trash2, Wand2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { toast } from 'sonner';
import { BrowserMultiFormatReader } from '@zxing/library';

interface Product {
  id: string;
  barcode: string;
  name: string;
  price: number;
  cost: number;
  stock: number;
  minStock: number;
  category: string;
}

export function Inventory() {
  const [products, setProducts] = useState<Product[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const { role } = useAuth();
  
  const [selectedCategory, setSelectedCategory] = useState<string>('All');

  // Form States
  const [barcode, setBarcode] = useState('');
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [cost, setCost] = useState('');
  const [stock, setStock] = useState('');
  const [minStock, setMinStock] = useState('0');
  const [category, setCategory] = useState('');

  // Scanner States
  const [isScanning, setIsScanning] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const codeReader = useRef(new BrowserMultiFormatReader());
  const [isSubmitting, setIsSubmitting] = useState(false);

  const canEdit = role === 'SUPER_ADMIN' || role === 'STORE_MANAGER';

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
    } else {
      setEditingProduct(null);
      setBarcode('');
      setName('');
      setPrice('');
      setCost('');
      setStock('');
      setMinStock('0');
      setCategory('');
    }
    setIsDialogOpen(true);
  };

  const closeDialog = () => {
    setIsDialogOpen(false);
    stopScanner();
  };

  const generateBarcode = () => {
    const timestamp = Date.now().toString();
    setBarcode(timestamp);
  };

  const startScanner = async () => {
    setIsScanning(true);
    try {
      const videoInputDevices = await codeReader.current.listVideoInputDevices();
      const selectedDeviceId = videoInputDevices[0].deviceId;
      
      codeReader.current.decodeFromVideoDevice(selectedDeviceId, videoRef.current, (result, err) => {
        if (result) {
          setBarcode(result.getText());
          toast.success('Barcode scanned successfully!');
          stopScanner();
        }
      });
    } catch (err) {
      console.error(err);
      toast.error('Could not start camera. Please check permissions.');
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

  const categories = Array.from(new Set(products.map(p => p.category))).filter(Boolean).sort();

  const filteredProducts = products.filter(p => {
    const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase()) || p.barcode.includes(searchQuery);
    const matchesCategory = selectedCategory === 'All' || p.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between gap-4 items-start sm:items-center">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-[#FAF7F2]">Inventory Management</h2>
          <p className="text-sm font-mono text-[#7A736E]">Real-time stock tracking and adjustments</p>
        </div>
        
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

              {isScanning && (
                <div className="relative rounded-md overflow-hidden bg-black aspect-video border border-[#FF6F00]">
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
              )}

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
        <Table>
          <TableHeader className="bg-[#1A1614]">
            <TableRow className="border-[#3A3230] hover:bg-transparent">
              <TableHead className="text-[10px] font-mono text-[#7A736E] uppercase tracking-wider w-[100px]">BARCODE</TableHead>
              <TableHead className="text-[10px] font-mono text-[#7A736E] uppercase tracking-wider">PRODUCT NAME</TableHead>
              <TableHead className="text-[10px] font-mono text-[#7A736E] uppercase tracking-wider">CATEGORY</TableHead>
              <TableHead className="text-[10px] font-mono text-[#7A736E] uppercase tracking-wider text-right">PRICE</TableHead>
              <TableHead className="text-[10px] font-mono text-[#7A736E] uppercase tracking-wider text-right">STOCK</TableHead>
              {canEdit && <TableHead className="text-[10px] font-mono text-[#7A736E] uppercase tracking-wider text-right w-[80px]">ACTIONS</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody className="text-sm font-mono">
            {filteredProducts.map((product) => (
              <TableRow key={product.id} className="border-[#3A3230] bg-[#141210] hover:bg-[#1A1614] transition-colors">
                <TableCell className="text-[#7A736E]">{product.barcode}</TableCell>
                <TableCell className="text-[#FAF7F2] font-sans">{product.name}</TableCell>
                <TableCell>
                  <span className="text-[#7A736E]">
                    {product.category}
                  </span>
                </TableCell>
                <TableCell className="text-right text-[#1D9E75]">₱{product.price.toFixed(2)}</TableCell>
                <TableCell className="text-right">
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
                {canEdit && (
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end">
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-8 w-8 text-[#7A736E] hover:text-[#FF6F00] hover:bg-[#FF6F00]/10"
                        onClick={() => openDialog(product)}
                      >
                        <Edit2 className="h-4 w-4" />
                      </Button>
                      {role === 'SUPER_ADMIN' && (
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-8 w-8 text-[#7A736E] hover:text-red-500 hover:bg-red-500/10 ml-1"
                          onClick={() => {
                            setProductToDelete(product);
                            setIsDeleteDialogOpen(true);
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                )}
              </TableRow>
            ))}
            {filteredProducts.length === 0 && (
             <TableRow className="border-[#3A3230] bg-[#141210]">
               <TableCell colSpan={6} className="h-24 text-center font-mono text-[#7A736E] uppercase tracking-widest text-[10px]">
                  NO PRODUCTS FOUND
               </TableCell>
             </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

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
    </div>
  );
}

