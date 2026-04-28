import React, { useState, useEffect } from 'react';
import { db, auth } from '../lib/firebase';
import { collection, addDoc, updateDoc, doc, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '../lib/firestore-error';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { Plus, Search, Edit2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { toast } from 'sonner';

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
  
  const canEdit = role === 'SUPER_ADMIN' || role === 'STORE_MANAGER';

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'products'), (snapshot) => {
      const prods: Product[] = [];
      snapshot.forEach((doc) => prods.push({ id: doc.id, ...doc.data() } as Product));
      setProducts(prods);
    }, (error) => handleFirestoreError(error, OperationType.GET, 'products'));

    return unsubscribe;
  }, []);

  const handleSave = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const productData = {
      barcode: formData.get('barcode') as string,
      name: formData.get('name') as string,
      price: parseFloat(formData.get('price') as string),
      cost: parseFloat(formData.get('cost') as string),
      stock: parseInt(formData.get('stock') as string, 10),
      minStock: parseInt(formData.get('minStock') as string, 10) || 0,
      category: formData.get('category') as string,
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
      setIsDialogOpen(false);
      setEditingProduct(null);
    } catch (error) {
      handleFirestoreError(error, editingProduct ? OperationType.UPDATE : OperationType.CREATE, 'products');
    }
  };

  const filteredProducts = products.filter(p => 
    p.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
    p.barcode.includes(searchQuery)
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between gap-4 items-start sm:items-center">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-[#FAF7F2]">Inventory Management</h2>
          <p className="text-sm font-mono text-[#7A736E]">Real-time stock tracking and adjustments</p>
        </div>
        
        {canEdit && (
          <Dialog open={isDialogOpen} onOpenChange={isOpen => {
            setIsDialogOpen(isOpen);
            if (!isOpen) setEditingProduct(null);
          }}>
            <DialogTrigger render={<Button className="bg-[#FF6F00] hover:bg-[#FF6F00]/80 text-black font-semibold" />}>
              <Plus className="mr-2 h-4 w-4" /> Add Product
            </DialogTrigger>
            <DialogContent className="bg-[#141210] border-[#3A3230] text-[#FAF7F2] sm:max-w-[425px]">
              <DialogHeader>
                <DialogTitle>{editingProduct ? 'Edit Product' : 'New Product'}</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSave} className="grid grid-cols-2 gap-4 py-4">
                <div className="col-span-2 space-y-2">
                  <label className="text-xs font-mono text-[#7A736E] uppercase">Barcode</label>
                  <Input name="barcode" defaultValue={editingProduct?.barcode} required className="bg-[#0A0C10] border-[#3A3230]" />
                </div>
                <div className="col-span-2 space-y-2">
                  <label className="text-xs font-mono text-[#7A736E] uppercase">Name</label>
                  <Input name="name" defaultValue={editingProduct?.name} required className="bg-[#0A0C10] border-[#3A3230]" />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-mono text-[#7A736E] uppercase">Price (₱)</label>
                  <Input name="price" type="number" step="0.01" min="0" defaultValue={editingProduct?.price} required className="bg-[#0A0C10] border-[#3A3230]" />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-mono text-[#7A736E] uppercase">Cost (₱)</label>
                  <Input name="cost" type="number" step="0.01" min="0" defaultValue={editingProduct?.cost} required className="bg-[#0A0C10] border-[#3A3230]" />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-mono text-[#7A736E] uppercase">Initial Stock</label>
                  <Input name="stock" type="number" min="0" defaultValue={editingProduct?.stock} required className="bg-[#0A0C10] border-[#3A3230]" />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-mono text-[#7A736E] uppercase">Min Stock (Alert)</label>
                  <Input name="minStock" type="number" min="0" defaultValue={editingProduct?.minStock || 0} required className="bg-[#0A0C10] border-[#3A3230]" />
                </div>
                <div className="col-span-2 space-y-2">
                  <label className="text-xs font-mono text-[#7A736E] uppercase">Category</label>
                  <Input name="category" defaultValue={editingProduct?.category} required className="bg-[#0A0C10] border-[#3A3230]" />
                </div>
                <div className="col-span-2 mt-4">
                  <Button type="submit" className="w-full bg-[#1D9E75] hover:bg-[#1D9E75]/80 text-[#FAF7F2]">
                    {editingProduct ? 'Save Changes' : 'Create Product'}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>

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
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-8 w-8 text-[#7A736E] hover:text-[#FF6F00] hover:bg-[#FF6F00]/10"
                      onClick={() => {
                        setEditingProduct(product);
                        setIsDialogOpen(true);
                      }}
                    >
                      <Edit2 className="h-4 w-4" />
                    </Button>
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
    </div>
  );
}
