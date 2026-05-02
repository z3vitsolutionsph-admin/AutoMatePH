import React, { useState, useEffect, useMemo } from 'react';
import { db, auth } from '../lib/firebase';
import { collection, onSnapshot, doc, updateDoc, addDoc, serverTimestamp, writeBatch, increment } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '../lib/firestore-error';
import { formatCurrency } from '../lib/utils';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog';
import { Plus, Search, Truck, CheckCircle2, XCircle, Trash2, Download, Eye } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { toast } from 'sonner';
import jsPDF from 'jspdf';

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
  supplierId?: string;
}

interface POItem {
  productId: string;
  productName: string;
  quantity: number;
  cost: number;
}

interface PurchaseOrder {
  id: string;
  supplierId?: string;
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

interface Supplier {
  id: string;
  name: string;
  contact: string;
  address: string;
}

export function PurchaseOrders({ products, suppliers, prefilledPOItem, onClearPrefill }: { products: Product[], suppliers: Supplier[], prefilledPOItem?: { productId: string, qty: number } | null, onClearPrefill?: () => void }) {
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<PurchaseOrder | null>(null);
  const [isDetailsDialogOpen, setIsDetailsDialogOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { role, user } = useAuth();
  
  const canEdit = role === 'SUPER_ADMIN' || role === 'STORE_MANAGER';

  // Form State
  const [supplierId, setSupplierId] = useState('');
  const [supplierName, setSupplierName] = useState('');
  const [supplierContact, setSupplierContact] = useState('');
  const [orderDate, setOrderDate] = useState(new Date().toISOString().split('T')[0]);
  const [expectedDeliveryDate, setExpectedDeliveryDate] = useState('');
  const [poItems, setPoItems] = useState<POItem[]>([]);
  const [selectedProductId, setSelectedProductId] = useState('');
  const [itemQuantity, setItemQuantity] = useState('1');
  const [itemCost, setItemCost] = useState('0');
  
  // Custom Autocomplete State
  const [productSearch, setProductSearch] = useState('');
  const [isProductDropdownOpen, setIsProductDropdownOpen] = useState(false);
  const dropdownRef = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (prefilledPOItem) {
      const product = products.find(p => p.id === prefilledPOItem.productId);
      if (product) {
        setPoItems([{
          productId: product.id,
          productName: product.name,
          quantity: prefilledPOItem.qty,
          cost: product.cost || 0
        }]);
        
        if (product.supplierId && suppliers) {
          const matchedSupplier = suppliers.find(s => s.id === product.supplierId);
          if (matchedSupplier) {
            setSupplierId(matchedSupplier.id);
            setSupplierName(matchedSupplier.name);
            setSupplierContact(matchedSupplier.contact || '');
          }
        }

        setIsDialogOpen(true);
      }
      if (onClearPrefill) onClearPrefill();
    }
  }, [prefilledPOItem, products, suppliers, onClearPrefill]);

  useEffect(() => {
    if (isDialogOpen) {
      if (!expectedDeliveryDate) {
        const deliveryDate = new Date();
        deliveryDate.setDate(deliveryDate.getDate() + 7);
        setExpectedDeliveryDate(deliveryDate.toISOString().split('T')[0]);
      }
    }
  }, [isDialogOpen, expectedDeliveryDate]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsProductDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

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

  const filteredProductOptions = useMemo(() => {
    if (!productSearch) return products.slice(0, 50);
    return products.filter(p => 
      p.name.toLowerCase().includes(productSearch.toLowerCase()) || 
      p.barcode.includes(productSearch)
    ).slice(0, 50);
  }, [products, productSearch]);

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
    setProductSearch('');
    setItemQuantity('1');
    setItemCost('0');
  };

  const handleRemoveItem = (index: number) => {
    setPoItems(prev => prev.filter((_, i) => i !== index));
  };

  const handleProductSelect = (product: Product) => {
    setSelectedProductId(product.id);
    setItemCost(product.cost.toString());
    setProductSearch(product.name);
    setIsProductDropdownOpen(false);
  };

  const resetForm = () => {
    setSupplierId('');
    setSupplierName('');
    setSupplierContact('');
    setOrderDate(new Date().toISOString().split('T')[0]);
    setExpectedDeliveryDate('');
    setPoItems([]);
    setSelectedProductId('');
    setProductSearch('');
  };

  const handleCreateOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supplierId) {
      toast.error('Please select a supplier');
      return;
    }
    if (!orderDate || poItems.length === 0) {
      toast.error('Please fill in required fields and add at least one item');
      return;
    }

    try {
      setIsSubmitting(true);
      const totalAmount = poItems.reduce((sum, item) => sum + (item.quantity * item.cost), 0);
      
      const poData = {
        supplierId,
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
      
      toast.success('Supplier Order created');
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
    
    // Status validation
    if (order.status !== 'PENDING') {
      toast.error(`Order cannot be marked as delivered because it is already ${order.status.toLowerCase()}`);
      return;
    }

    // Validate that all products still exist in the inventory
    const invalidItems = order.items.filter(item => !products.some(p => p.id === item.productId));
    if (invalidItems.length > 0) {
      toast.error(`Cannot deliver: some products no longer exist in inventory (${invalidItems.map(i => i.productName).join(', ')})`);
      return;
    }

    // User confirmation
    if (!window.confirm('Are you sure you want to mark this order as delivered? This will automatically add the ordered quantities to your inventory stock.')) {
      return;
    }

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
        batch.update(productRef, {
          stock: increment(item.quantity),
          updatedAt: serverTimestamp()
        });
      });
      
      // Add activity log
      const logRef = doc(collection(db, 'activityLogs'));
      batch.set(logRef, {
        type: 'INBOUND_DELIVERY',
        userId: user?.email || user?.uid || 'Unknown',
        details: `Received delivery for order from ${order.supplierName} (${order.items.length} items)`,
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
    
    // Status validation
    if (order.status !== 'PENDING') {
      toast.error(`Order cannot be cancelled because it is already ${order.status.toLowerCase()}`);
      return;
    }

    if (!window.confirm('Are you sure you want to cancel this order? This action cannot be undone and no items will be added to inventory.')) {
      return;
    }
    
    try {
      setIsSubmitting(true);
      const batch = writeBatch(db);
      
      const orderRef = doc(db, 'purchaseOrders', order.id);
      batch.update(orderRef, {
        status: 'CANCELLED',
        updatedAt: serverTimestamp()
      });
      
      // Add activity log
      const logRef = doc(collection(db, 'activityLogs'));
      batch.set(logRef, {
        type: 'ORDER_CANCELLED',
        userId: user?.email || user?.uid || 'Unknown',
        details: `Cancelled order for ${order.supplierName} (${order.items.length} items)`,
        timestamp: serverTimestamp()
      });
      
      await batch.commit();
      toast.success('Order cancelled');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `purchaseOrders/${order.id}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const exportOrderAsPDF = (order: PurchaseOrder) => {
    try {
      const doc = new jsPDF();
      
      // Title
      doc.setFontSize(22);
      doc.setTextColor(255, 111, 0); // Primary color matching
      doc.text('SUPPLIER ORDER', 105, 20, { align: 'center' });
      
      // Order Details
      doc.setFontSize(10);
      doc.setTextColor(100, 100, 100);
      doc.text(`Order Number: ${order.id}`, 20, 35);
      doc.text(`Date: ${order.orderDate}`, 20, 42);
      doc.text(`Status: ${order.status}`, 20, 49);
      if (order.expectedDeliveryDate) {
        doc.text(`Expected Delivery: ${order.expectedDeliveryDate}`, 20, 56);
      }
      doc.text(`Created By: ${order.createdBy}`, 20, 63);
      
      // Supplier info
      doc.setFontSize(12);
      doc.setTextColor(0, 0, 0);
      doc.text('Supplier Information', 120, 35);
      doc.setFontSize(10);
      doc.setTextColor(100, 100, 100);
      doc.text(`Name: ${order.supplierName}`, 120, 42);
      if (order.supplierContact) {
        doc.text(`Contact: ${order.supplierContact}`, 120, 49);
      }
      
      // Items table header
      let yPos = 75;
      doc.setFillColor(26, 22, 20);
      doc.rect(20, yPos - 6, 170, 10, 'F');
      doc.setFontSize(10);
      doc.setTextColor(255, 255, 255);
      doc.text('Product Name', 25, yPos);
      doc.text('Qty', 110, yPos, { align: 'right' });
      doc.text('Unit Cost', 140, yPos, { align: 'right' });
      doc.text('Total', 185, yPos, { align: 'right' });
      
      yPos += 8;
      
      // Items
      doc.setTextColor(0, 0, 0);
      order.items.forEach(item => {
        // If we reach the bottom, add page
        if (yPos > 270) {
          doc.addPage();
          yPos = 20;
        }
        const total = item.quantity * item.cost;
        const splitName = doc.splitTextToSize(item.productName, 70);
        
        doc.text(splitName, 25, yPos);
        doc.text(item.quantity.toString(), 110, yPos, { align: 'right' });
        doc.text(`PHP ${item.cost.toFixed(2)}`, 140, yPos, { align: 'right' });
        doc.text(`PHP ${total.toFixed(2)}`, 185, yPos, { align: 'right' });
        
        yPos += (splitName.length * 6) + 2;
        
        // Add minimal separator line
        doc.setDrawColor(200, 200, 200);
        doc.line(20, yPos - 3, 190, yPos - 3);
      });
      
      // Total amount
      yPos += 10;
      doc.setFontSize(12);
      doc.setTextColor(100, 100, 100);
      doc.text('Total Amount:', 130, yPos);
      doc.setFontSize(14);
      doc.setTextColor(255, 111, 0);
      doc.text(`PHP ${order.totalAmount.toFixed(2)}`, 185, yPos, { align: 'right' });
      
      doc.save(`Purchase_Order_${order.id}.pdf`);
      toast.success('PDF generated successfully');
    } catch (err) {
      console.error(err);
      toast.error('Failed to generate PDF');
    }
  };

  if (!canEdit) {
    return (
       <div className="flex flex-col items-center justify-center p-12 text-[#7A736E] border border-[#3A3230] rounded-lg bg-[#141210]">
         <Truck className="w-12 h-12 mb-4 opacity-50" />
         <h2 className="text-lg font-bold text-[#FAF7F2]">Access Restricted</h2>
         <p className="font-mono text-sm mt-2">Only Store Managers can manage supplier orders.</p>
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
           <Plus className="mr-2 h-4 w-4" /> New Order
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
                 <div className="space-y-1.5 col-span-2">
                   <label className="text-[10px] text-[#7A736E] uppercase tracking-wider">Select Supplier *</label>
                   <select 
                     required
                     value={supplierId} 
                    onChange={e => {
                      const newSupplierId = e.target.value;
                      const selected = suppliers.find(s => s.id === newSupplierId);
                      setSupplierId(newSupplierId);
                      if (selected) {
                        setSupplierName(selected.name);
                        setSupplierContact(selected.contact || '');
                        
                        // Auto-suggest low stock products for this supplier
                        const lowStockProducts = products.filter(p => p.supplierId === newSupplierId && p.stock <= (p.minStock || 0));
                        if (lowStockProducts.length > 0) {
                          const suggestedItems: POItem[] = lowStockProducts.map(p => ({
                            productId: p.id,
                            productName: p.name,
                            quantity: (p.minStock && p.minStock > 0) ? p.minStock * 2 : 10,
                            cost: p.cost || 0
                          }));
                          
                          // Merge with existing items to prevent duplicates if user already added items
                          setPoItems(current => {
                            const newItems = [...current];
                            suggestedItems.forEach(suggested => {
                              if (!newItems.some(existing => existing.productId === suggested.productId)) {
                                newItems.push(suggested);
                              }
                            });
                            return newItems;
                          });
                          
                          toast.info(`Automatically added ${suggestedItems.length} low-stock products from this supplier`);
                        }
                      } else {
                        setSupplierName('');
                        setSupplierContact('');
                      }
                    }}
                     className="flex h-10 w-full rounded-md border border-[#3A3230] bg-[#141210] px-3 py-2 text-sm text-[#FAF7F2] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#FF6F00]"
                   >
                     <option value="" disabled>Select a supplier...</option>
                     {suppliers.map(s => (
                       <option key={s.id} value={s.id}>{s.name}</option>
                     ))}
                   </select>
                 </div>
                 <div className="space-y-1.5 hidden">
                   <label className="text-[10px] text-[#7A736E] uppercase tracking-wider">Supplier Name *</label>
                   <Input required value={supplierName} onChange={e => setSupplierName(e.target.value)} className="bg-[#0A0C10] border-[#3A3230] focus-visible:ring-[#FF6F00] text-sm text-[#FAF7F2]" />
                 </div>
                 <div className="space-y-1.5 hidden">
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
                    <div className="flex-1 space-y-1.5 relative" ref={dropdownRef}>
                      <label className="text-[10px] text-[#7A736E] uppercase tracking-wider">Product</label>
                      <div className="relative">
                        <Input
                          placeholder="Search product name or barcode..."
                          value={productSearch}
                          onChange={(e) => {
                            setProductSearch(e.target.value);
                            setIsProductDropdownOpen(true);
                            setSelectedProductId(''); // Reset selection if typing
                          }}
                          onFocus={() => setIsProductDropdownOpen(true)}
                          className="bg-[#141210] border-[#3A3230] focus-visible:ring-[#FF6F00] text-sm text-[#FAF7F2]"
                        />
                        {isProductDropdownOpen && (
                          <div className="absolute z-50 w-full mt-1 bg-[#141210] border border-[#3A3230] rounded-md shadow-lg max-h-60 overflow-auto">
                            {filteredProductOptions.map(p => (
                              <div
                                key={p.id}
                                className="px-3 py-2 cursor-pointer hover:bg-[#1A1614] border-b border-[#3A3230] last:border-0"
                                onClick={() => handleProductSelect(p)}
                              >
                                <div className="text-sm text-[#FAF7F2] font-medium">{p.name}</div>
                                <div className="flex justify-between text-[10px] text-[#7A736E] mt-1 font-mono">
                                  <span>Cost: ₱{formatCurrency(p.cost)}</span>
                                  <span>Stock: <span className={p.stock <= p.minStock ? 'text-red-500' : 'text-[#1D9E75]'}>{p.stock}</span></span>
                                </div>
                              </div>
                            ))}
                            {filteredProductOptions.length === 0 && (
                              <div className="px-3 py-4 text-xs text-center text-[#7A736E]">No products found</div>
                            )}
                          </div>
                        )}
                      </div>
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
                    <div className="flex justify-end gap-1">
                      <Button 
                        variant="ghost" 
                        size="icon"
                        onClick={() => {
                          setSelectedOrder(order);
                          setIsDetailsDialogOpen(true);
                        }}
                        className="h-8 w-8 text-[#FAF7F2] hover:bg-[#1D9E75]/10 hover:text-[#1D9E75]"
                        title="View Details"
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="icon"
                        onClick={() => exportOrderAsPDF(order)}
                        className="h-8 w-8 text-[#FAF7F2] hover:bg-[#3A3230] hover:text-[#FAF7F2]"
                        title="Download PDF"
                      >
                        <Download className="h-4 w-4" />
                      </Button>
                      {order.status === 'PENDING' && (
                        <>
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
                        </>
                      )}
                    </div>
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

      <Dialog open={isDetailsDialogOpen} onOpenChange={setIsDetailsDialogOpen}>
        <DialogContent className="bg-[#141210] border-[#3A3230] text-[#FAF7F2] font-mono sm:max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-[#FF6F00] uppercase tracking-widest text-sm border-b border-[#3A3230] pb-4 flex justify-between items-center">
              <span>Supplier Order Details</span>
            </DialogTitle>
          </DialogHeader>

          {selectedOrder && (
            <div className="space-y-6 pt-2">
              <div className="grid grid-cols-2 gap-6 text-sm">
                <div className="space-y-2">
                  <div className="text-[10px] text-[#7A736E] uppercase tracking-wider">Order Reference</div>
                  <div className="font-bold text-[#FAF7F2] break-all">{selectedOrder.id}</div>
                  <div className="text-[10px] text-[#7A736E] uppercase tracking-wider mt-4">Order Date</div>
                  <div className="text-[#FAF7F2]">{selectedOrder.orderDate}</div>
                  {selectedOrder.expectedDeliveryDate && (
                    <>
                      <div className="text-[10px] text-[#7A736E] uppercase tracking-wider mt-4">Expected Delivery</div>
                      <div className="text-[#FAF7F2]">{selectedOrder.expectedDeliveryDate}</div>
                    </>
                  )}
                  <div className="text-[10px] text-[#7A736E] uppercase tracking-wider mt-4">Status</div>
                  <div className={`inline-flex px-2 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider ${
                      selectedOrder.status === 'DELIVERED' ? 'bg-[#1D9E75]/10 text-[#1D9E75]' :
                      selectedOrder.status === 'CANCELLED' ? 'bg-red-500/10 text-red-500' :
                      'bg-[#FF6F00]/10 text-[#FF6F00]'
                    }`}>
                      {selectedOrder.status}
                  </div>
                </div>
                
                <div className="space-y-2">
                  <div className="text-[10px] text-[#7A736E] uppercase tracking-wider">Supplier Information</div>
                  <div className="font-bold text-[#FAF7F2]">{selectedOrder.supplierName}</div>
                  {selectedOrder.supplierContact && (
                    <div className="text-[#7A736E]">{selectedOrder.supplierContact}</div>
                  )}
                  <div className="text-[10px] text-[#7A736E] uppercase tracking-wider mt-4">Created By</div>
                  <div className="text-[#FAF7F2]">{selectedOrder.createdBy}</div>
                </div>
              </div>

              <div>
                <h3 className="text-xs text-[#7A736E] uppercase tracking-widest mb-3">Order Items</h3>
                <div className="border border-[#3A3230] rounded-sm overflow-hidden bg-[#0A0C10]">
                  <Table>
                    <TableHeader className="bg-[#1A1614]">
                      <TableRow className="border-[#3A3230] hover:bg-transparent">
                        <TableHead className="text-[10px] text-[#7A736E] uppercase tracking-wider py-2">Item</TableHead>
                        <TableHead className="text-[10px] text-[#7A736E] uppercase tracking-wider py-2 text-right">Qty</TableHead>
                        <TableHead className="text-[10px] text-[#7A736E] uppercase tracking-wider py-2 text-right">Unit Price</TableHead>
                        <TableHead className="text-[10px] text-[#7A736E] uppercase tracking-wider py-2 text-right">Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {selectedOrder.items.map((item, idx) => (
                        <TableRow key={idx} className="border-[#3A3230] hover:bg-transparent">
                          <TableCell className="py-2 text-[#FAF7F2]">{item.productName}</TableCell>
                          <TableCell className="py-2 text-right text-[#FAF7F2]">{item.quantity}</TableCell>
                          <TableCell className="py-2 text-right text-[#7A736E]">₱{formatCurrency(item.cost)}</TableCell>
                          <TableCell className="py-2 text-right font-medium text-[#FAF7F2]">₱{formatCurrency(item.quantity * item.cost)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  <div className="p-3 bg-[#1A1614] border-t border-[#3A3230] flex justify-between items-center">
                    <span className="text-[10px] text-[#7A736E] uppercase tracking-widest">Total Amount</span>
                    <span className="text-sm font-bold text-[#FF6F00]">₱{formatCurrency(selectedOrder.totalAmount)}</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
