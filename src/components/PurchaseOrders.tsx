import React, { useState, useEffect, useMemo } from 'react';
import { db, auth } from '../lib/firebase';
import { collection, onSnapshot, doc, updateDoc, addDoc, serverTimestamp, writeBatch } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '../lib/firestore-error';
import { formatCurrency } from '../lib/utils';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog';
import { Plus, Search, Truck, CheckCircle2, XCircle, Trash2 } from 'lucide-react';
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
  description?: string;
  location?: string;
  imageUrl?: string;
}

interface POItem {
  productId: string;
  productName: string;
  quantity: number;
  cost: number;
}

interface PurchaseOrder {
  id: string;
  supplierName: string;
  supplierContact?: string;
  orderDate: string;
  expectedDeliveryDate: string;
  items: POItem[];
  status: 'PENDING' | 'DELIVERED' | 'CANCELLED';
  totalAmount: number;
  createdBy: string;
  createdAt: any;
  updatedAt: any;
}

export function PurchaseOrders({ products }: { products: Product[] }) {
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { role, user } = useAuth();
  
  const canEdit = role === 'SUPER_ADMIN' || role === 'STORE_MANAGER';

  // Form State
  const [supplierName, setSupplierName] = useState('');
  const [supplierContact, setSupplierContact] = useState('');
  const [orderDate, setOrderDate] = useState(new Date().toISOString().split('T')[0]);
  const [expectedDeliveryDate, setExpectedDeliveryDate] = useState('');
  const [poItems, setPoItems] = useState<POItem[]>([]);
  const [selectedProductId, setSelectedProductId] = useState('');
  const [itemQuantity, setItemQuantity] = useState('1');
  const [itemCost, setItemCost] = useState('0');

  useEffect(() => {
    if (!canEdit) return; // Only store managers can view POs according to rules
    const unsubscribe = onSnapshot(collection(db, 'purchaseOrders'), (snapshot) => {
      const ordersList: PurchaseOrder[] = [];
      snapshot.forEach((doc) => ordersList.push({ id: doc.id, ...doc.data() } as PurchaseOrder));
      // sort by date descending
      ordersList.sort((a, b) => new Date(b.orderDate).getTime() - new Date(a.orderDate).getTime());
      setOrders(ordersList);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'purchaseOrders');
    });

    return () => unsubscribe();
  }, [canEdit]);

  const filteredOrders = useMemo(() => {
    return orders.filter(o => 
      o.supplierName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      o.status.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [orders, searchQuery]);

  const handleAddItem = () => {
    if (!selectedProductId || !itemQuantity || parseInt(itemQuantity) <= 0) {
      toast.error('Please select a product and valid quantity');
      return;
    }
    const product = products.find(p => p.id === selectedProductId);
    if (!product) return;
    
    setPoItems(prev => [...prev, {
      productId: product.id,
      productName: product.name,
      quantity: parseInt(itemQuantity),
      cost: parseFloat(itemCost) || product.cost || 0
    }]);
    
    setSelectedProductId('');
    setItemQuantity('1');
    setItemCost('0');
  };

  const handleRemoveItem = (index: number) => {
    setPoItems(prev => prev.filter((_, i) => i !== index));
  };

  const handleProductSelect = (id: string) => {
    setSelectedProductId(id);
    const p = products.find(prod => prod.id === id);
    if (p) setItemCost(p.cost.toString());
  };

  const resetForm = () => {
    setSupplierName('');
    setSupplierContact('');
    setOrderDate(new Date().toISOString().split('T')[0]);
    setExpectedDeliveryDate('');
    setPoItems([]);
    setSelectedProductId('');
  };

  const handleCreateOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supplierName || !orderDate || poItems.length === 0) {
      toast.error('Please fill in required fields and add at least one item');
      return;
    }

    try {
      setIsSubmitting(true);
      const totalAmount = poItems.reduce((sum, item) => sum + (item.quantity * item.cost), 0);
      
      const poData = {
        supplierName,
        supplierContact,
        orderDate,
        expectedDeliveryDate,
        items: poItems,
        status: 'PENDING',
        totalAmount,
        createdBy: user?.uid || 'Unknown',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };

      await addDoc(collection(db, 'purchaseOrders'), poData);
      
      toast.success('Purchase Order created');
      setIsDialogOpen(false);
      resetForm();
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'purchaseOrders');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleMarkDelivered = async (order: PurchaseOrder) => {
    if (!canEdit) return;
    try {
      setIsSubmitting(true);
      
      // Use a batch to update PO status and all product stocks simultaneously
      const batch = writeBatch(db);
      
      const orderRef = doc(db, 'purchaseOrders', order.id);
      batch.update(orderRef, {
        status: 'DELIVERED',
        updatedAt: serverTimestamp()
      });

      // Update stock for each item
      order.items.forEach(item => {
        const productRef = doc(db, 'products', item.productId);
        const product = products.find(p => p.id === item.productId);
        if (product) {
            batch.update(productRef, {
              stock: product.stock + item.quantity,
              updatedAt: serverTimestamp()
            });
        }
      });
      
      // Add activity log
      const logRef = doc(collection(db, 'activityLogs'));
      batch.set(logRef, {
        type: 'INBOUND_DELIVERY',
        userId: user?.uid || 'Unknown',
        details: `Received delivery for PO from ${order.supplierName} (${order.items.length} items)`,
        timestamp: serverTimestamp()
      });

      await batch.commit();
      toast.success('Order marked as delivered and stock updated');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `purchaseOrders/${order.id}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancelOrder = async (order: PurchaseOrder) => {
    if (!canEdit) return;
    if (!window.confirm('Are you sure you want to cancel this order?')) return;
    
    try {
      setIsSubmitting(true);
      const orderRef = doc(db, 'purchaseOrders', order.id);
      await updateDoc(orderRef, {
        status: 'CANCELLED',
        updatedAt: serverTimestamp()
      });
      toast.success('Order cancelled');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `purchaseOrders/${order.id}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!canEdit) {
    return (
       <div className="flex flex-col items-center justify-center p-12 text-[#7A736E] border border-[#3A3230] rounded-lg bg-[#141210]">
         <Truck className="w-12 h-12 mb-4 opacity-50" />
         <h2 className="text-lg font-bold text-[#FAF7F2]">Access Restricted</h2>
         <p className="font-mono text-sm mt-2">Only Store Managers can manage purchase orders.</p>
       </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center flex-wrap gap-4">
         <div className="flex bg-[#0A0C10] border border-[#3A3230] p-1 items-center w-full max-w-md h-10">
           <div className="px-3 text-[#7A736E]">
             <Search className="h-4 w-4" />
           </div>
           <input 
             value={searchQuery}
             onChange={(e) => setSearchQuery(e.target.value)}
             placeholder="SEARCH SUPPLIER..." 
             className="bg-transparent w-full text-xs outline-none font-mono placeholder-[#3A3230] text-[#FAF7F2]"
           />
         </div>
         <Button onClick={() => setIsDialogOpen(true)} className="bg-[#FF6F00] hover:bg-[#FF6F00]/80 text-black font-semibold uppercase tracking-widest text-xs h-10">
           <Plus className="mr-2 h-4 w-4" /> New PO
         </Button>
         <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
           <DialogContent className="bg-[#141210] border-[#3A3230] text-[#FAF7F2] font-mono sm:max-w-3xl max-h-[90vh] overflow-y-auto">
             <DialogHeader>
               <DialogTitle className="text-[#FF6F00] uppercase tracking-widest text-sm border-b border-[#3A3230] pb-4">
                 Create Purchase Order
               </DialogTitle>
             </DialogHeader>
             <form onSubmit={handleCreateOrder} className="space-y-6 pt-4">
               <div className="grid grid-cols-2 gap-4">
                 <div className="space-y-1.5">
                   <label className="text-[10px] text-[#7A736E] uppercase tracking-wider">Supplier Name *</label>
                   <Input required value={supplierName} onChange={e => setSupplierName(e.target.value)} className="bg-[#0A0C10] border-[#3A3230] focus-visible:ring-[#FF6F00] text-sm text-[#FAF7F2]" />
                 </div>
                 <div className="space-y-1.5">
                   <label className="text-[10px] text-[#7A736E] uppercase tracking-wider">Supplier Contact</label>
                   <Input value={supplierContact} onChange={e => setSupplierContact(e.target.value)} className="bg-[#0A0C10] border-[#3A3230] focus-visible:ring-[#FF6F00] text-sm text-[#FAF7F2]" />
                 </div>
                 <div className="space-y-1.5">
                   <label className="text-[10px] text-[#7A736E] uppercase tracking-wider">Order Date *</label>
                   <Input type="date" required value={orderDate} onChange={e => setOrderDate(e.target.value)} className="bg-[#0A0C10] border-[#3A3230] focus-visible:ring-[#FF6F00] text-sm text-[#FAF7F2]" />
                 </div>
                 <div className="space-y-1.5">
                   <label className="text-[10px] text-[#7A736E] uppercase tracking-wider">Expected Delivery</label>
                   <Input type="date" value={expectedDeliveryDate} onChange={e => setExpectedDeliveryDate(e.target.value)} className="bg-[#0A0C10] border-[#3A3230] focus-visible:ring-[#FF6F00] text-sm text-[#FAF7F2]" />
                 </div>
               </div>

               <div className="border border-[#3A3230] rounded p-4 bg-[#0A0C10] space-y-4">
                 <div className="text-xs font-bold text-[#FF6F00] uppercase tracking-widest mb-2">Order Items</div>
                 
                 <div className="flex gap-2 items-end">
                    <div className="flex-1 space-y-1.5">
                      <label className="text-[10px] text-[#7A736E] uppercase tracking-wider">Product</label>
                      <select 
                         value={selectedProductId} 
                         onChange={e => handleProductSelect(e.target.value)}
                         className="flex h-10 w-full rounded-md border border-[#3A3230] bg-[#141210] px-3 py-2 text-sm text-[#FAF7F2] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#FF6F00]"
                      >
                         <option value="">Select Product...</option>
                         {products.map(p => (
                             <option key={p.id} value={p.id}>{p.name} (Stock: {p.stock})</option>
                         ))}
                      </select>
                    </div>
                    <div className="w-24 space-y-1.5">
                      <label className="text-[10px] text-[#7A736E] uppercase tracking-wider">Qty</label>
                      <Input type="number" min="1" value={itemQuantity} onChange={e => setItemQuantity(e.target.value)} className="bg-[#141210] border-[#3A3230] focus-visible:ring-[#FF6F00] text-sm text-[#FAF7F2]" />
                    </div>
                    <div className="w-32 space-y-1.5">
                      <label className="text-[10px] text-[#7A736E] uppercase tracking-wider">Cost / Unit</label>
                      <Input type="number" min="0" step="0.01" value={itemCost} onChange={e => setItemCost(e.target.value)} className="bg-[#141210] border-[#3A3230] focus-visible:ring-[#FF6F00] text-sm text-[#FAF7F2]" />
                    </div>
                    <Button type="button" onClick={handleAddItem} variant="outline" className="border-[#3A3230] hover:bg-[#3A3230] text-[#FAF7F2] h-10">
                      Add
                    </Button>
                 </div>

                 {poItems.length > 0 && (
                   <div className="mt-4 border border-[#3A3230] rounded-sm overflow-hidden">
                     <Table>
                       <TableHeader className="bg-[#1A1614]">
                         <TableRow className="border-[#3A3230]">
                           <TableHead className="text-[10px] text-[#7A736E] tracking-wider uppercase h-8 py-1">Product</TableHead>
                           <TableHead className="text-[10px] text-[#7A736E] tracking-wider uppercase h-8 py-1 text-right">Qty</TableHead>
                           <TableHead className="text-[10px] text-[#7A736E] tracking-wider uppercase h-8 py-1 text-right">Cost</TableHead>
                           <TableHead className="text-[10px] text-[#7A736E] tracking-wider uppercase h-8 py-1 text-right">Total</TableHead>
                           <TableHead className="text-[10px] text-[#7A736E] tracking-wider uppercase h-8 py-1 text-center">Action</TableHead>
                         </TableRow>
                       </TableHeader>
                       <TableBody>
                         {poItems.map((item, idx) => (
                           <TableRow key={idx} className="border-[#3A3230] bg-[#141210] text-xs">
                             <TableCell className="py-2">{item.productName}</TableCell>
                             <TableCell className="py-2 text-right">{item.quantity}</TableCell>
                             <TableCell className="py-2 text-right">₱{formatCurrency(item.cost)}</TableCell>
                             <TableCell className="py-2 text-right">₱{formatCurrency(item.cost * item.quantity)}</TableCell>
                             <TableCell className="py-2 text-center">
                               <Button type="button" variant="ghost" size="icon" onClick={() => handleRemoveItem(idx)} className="h-6 w-6 text-red-500 hover:text-red-400">
                                 <XCircle className="h-4 w-4" />
                               </Button>
                             </TableCell>
                           </TableRow>
                         ))}
                       </TableBody>
                     </Table>
                     <div className="p-3 bg-[#1A1614] border-t border-[#3A3230] flex justify-between items-center">
                        <span className="text-xs text-[#7A736E] uppercase tracking-widest">Total Amount</span>
                        <span className="text-sm font-bold text-[#FF6F00]">₱{formatCurrency(poItems.reduce((sum, item) => sum + (item.quantity * item.cost), 0))}</span>
                     </div>
                   </div>
                 )}
               </div>

               <div className="flex justify-end gap-3 border-t border-[#3A3230] pt-4 mt-6">
                 <Button type="button" variant="ghost" onClick={() => setIsDialogOpen(false)} className="text-[#7A736E] hover:text-[#FAF7F2] text-xs uppercase tracking-widest">Cancel</Button>
                 <Button type="submit" disabled={isSubmitting || poItems.length === 0} className="bg-[#1D9E75] hover:bg-[#1D9E75]/80 text-white font-semibold text-xs uppercase tracking-widest">
                   {isSubmitting ? 'Processing...' : 'Create Order'}
                 </Button>
               </div>
             </form>
           </DialogContent>
         </Dialog>
      </div>

      <div className="border border-[#3A3230] rounded-sm overflow-hidden flex flex-col bg-[#0A0C10]">
        <Table>
          <TableHeader className="bg-[#1A1614]">
            <TableRow className="border-[#3A3230] hover:bg-transparent">
              <TableHead className="text-[10px] font-mono text-[#7A736E] uppercase tracking-wider py-3">Order Date</TableHead>
              <TableHead className="text-[10px] font-mono text-[#7A736E] uppercase tracking-wider py-3">Supplier</TableHead>
              <TableHead className="text-[10px] font-mono text-[#7A736E] uppercase tracking-wider py-3">Items</TableHead>
              <TableHead className="text-[10px] font-mono text-[#7A736E] uppercase tracking-wider py-3 text-right">Amount</TableHead>
              <TableHead className="text-[10px] font-mono text-[#7A736E] uppercase tracking-wider py-3 text-center">Status</TableHead>
              <TableHead className="text-[10px] font-mono text-[#7A736E] uppercase tracking-wider py-3 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className="text-sm font-mono">
            {filteredOrders.map(order => (
               <TableRow key={order.id} className="border-[#3A3230] bg-[#141210] hover:bg-[#1A1614] transition-colors">
                  <TableCell className="text-[#FAF7F2]">{order.orderDate}</TableCell>
                  <TableCell>
                    <div className="font-bold text-[#FAF7F2]">{order.supplierName}</div>
                    {order.expectedDeliveryDate && <div className="text-[10px] text-[#7A736E] mt-1">Exp: {order.expectedDeliveryDate}</div>}
                  </TableCell>
                  <TableCell className="text-[#7A736E]">{order.items.length} items</TableCell>
                  <TableCell className="text-right font-bold text-[#FAF7F2]">₱{formatCurrency(order.totalAmount)}</TableCell>
                  <TableCell className="text-center">
                    <span className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider ${
                      order.status === 'DELIVERED' ? 'bg-[#1D9E75]/10 text-[#1D9E75]' :
                      order.status === 'CANCELLED' ? 'bg-red-500/10 text-red-500' :
                      'bg-[#FF6F00]/10 text-[#FF6F00]'
                    }`}>
                      {order.status}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    {order.status === 'PENDING' && (
                      <div className="flex justify-end gap-1">
                        <Button 
                          variant="ghost" 
                          size="icon"
                          onClick={() => handleMarkDelivered(order)}
                          className="h-8 w-8 text-[#1D9E75] hover:bg-[#1D9E75]/10 hover:text-[#1D9E75]"
                          title="Mark Delivered"
                          disabled={isSubmitting}
                        >
                          <CheckCircle2 className="h-4 w-4" />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="icon"
                          onClick={() => handleCancelOrder(order)}
                          className="h-8 w-8 text-red-500 hover:bg-red-500/10 hover:text-red-500"
                          title="Cancel Order"
                          disabled={isSubmitting}
                        >
                          <XCircle className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                  </TableCell>
               </TableRow>
            ))}
            {filteredOrders.length === 0 && (
               <TableRow className="border-[#3A3230] bg-[#141210]">
                 <TableCell colSpan={6} className="h-24 text-center font-mono text-[#7A736E] uppercase tracking-widest text-[10px]">
                    NO ORDERS FOUND
                 </TableCell>
               </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
