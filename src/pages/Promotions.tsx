import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Plus, Search, Tag, Edit, Trash2, Calendar, CheckCircle2, Ticket, ShoppingCart, Package, Folder, AlertCircle } from 'lucide-react';
import { collection, query, onSnapshot, doc, setDoc, deleteDoc, serverTimestamp, getDocs, where } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';
import { handleFirestoreError, OperationType } from '../lib/firestore-error';
import { toast } from 'sonner';

interface Promotion {
  id: string;
  code: string;
  name: string;
  type: 'PERCENTAGE' | 'FIXED' | 'BOGO';
  value: number;
  targetType: 'ORDER' | 'PRODUCT' | 'CATEGORY';
  targetIds: string[];
  startDate: string;
  endDate: string;
  active: boolean;
  createdAt: any;
  updatedAt: any;
}

export function Promotions() {
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  
  // Dialog State
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingPromo, setEditingPromo] = useState<Promotion | null>(null);
  
  // Form State
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [type, setType] = useState<'PERCENTAGE' | 'FIXED' | 'BOGO'>('PERCENTAGE');
  const [value, setValue] = useState(0);
  const [targetType, setTargetType] = useState<'ORDER' | 'PRODUCT' | 'CATEGORY'>('ORDER');
  const [targetIdsStr, setTargetIdsStr] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [active, setActive] = useState(true);

  // Error State
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Auto-generate code
  const generateCode = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let newCode = '';
    for (let i = 0; i < 8; i++) {
       newCode += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setCode(newCode);
  };

  useEffect(() => {
    const q = query(collection(db, 'promotions'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Promotion[];
      setPromotions(data);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'promotions');
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const resetForm = () => {
    setEditingPromo(null);
    setName('');
    setCode('');
    setType('PERCENTAGE');
    setValue(0);
    setTargetType('ORDER');
    setTargetIdsStr('');
    setStartDate('');
    setEndDate('');
    setActive(true);
    setFormErrors({});
  };

  const openNewDialog = () => {
    resetForm();
    setIsDialogOpen(true);
  };

  const openEditDialog = (promo: Promotion) => {
    setEditingPromo(promo);
    setName(promo.name);
    setCode(promo.code);
    setType(promo.type);
    setValue(promo.value);
    setTargetType(promo.targetType);
    setTargetIdsStr(promo.targetIds?.join(', ') || '');
    setStartDate(promo.startDate);
    setEndDate(promo.endDate);
    setActive(promo.active);
    setFormErrors({});
    setIsDialogOpen(true);
  };

  const validateForm = () => {
    const errors: Record<string, string> = {};
    if (!name.trim()) errors.name = 'Name is required';
    if (code.trim() && code.length < 3) errors.code = 'Code must be at least 3 characters if provided';
    
    if (type === 'PERCENTAGE' && (value <= 0 || value > 100)) {
      errors.value = 'Percentage must be between 1 and 100';
    } else if (type === 'FIXED' && value <= 0) {
      errors.value = 'Fixed amount must be greater than 0';
    }

    if (targetType !== 'ORDER' && !targetIdsStr.trim()) {
      errors.targetIdsStr = `Please specify at least one ${targetType.toLowerCase()} ID`;
    }

    if (startDate && endDate && new Date(startDate) > new Date(endDate)) {
      errors.endDate = 'End date cannot be before start date';
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) {
      toast.error('Please fix the errors before saving.');
      return;
    }
    
    setIsSubmitting(true);
    const tIds = targetIdsStr.split(',').map(s => s.trim()).filter(s => s !== '');
    
    try {
      // Check if code already exists for another promotion
      if (code.trim()) {
        const q = query(collection(db, 'promotions'), where('code', '==', code.toUpperCase()));
        const querySnapshot = await getDocs(q);
        const existingCode = querySnapshot.docs.find(d => d.id !== editingPromo?.id);
        
        if (existingCode) {
          setFormErrors(prev => ({ ...prev, code: 'This code is already in use by another promotion' }));
          setIsSubmitting(false);
          toast.error('Duplicate code found');
          return;
        }
      }

      const docRef = doc(collection(db, 'promotions'), editingPromo ? editingPromo.id : undefined);
      const isNew = !editingPromo;

      const payload = {
        name: name.trim(),
        code: code.toUpperCase().trim(),
        type,
        value: type === 'BOGO' ? 0 : value,
        targetType,
        targetIds: tIds,
        startDate,
        endDate,
        active,
        updatedAt: serverTimestamp(),
        ...(isNew && { createdAt: serverTimestamp() })
      };

      await setDoc(docRef, payload, { merge: true });
      toast.success(`Promotion ${isNew ? 'created' : 'updated'} successfully!`);
      setIsDialogOpen(false);
    } catch (error) {
      handleFirestoreError(error, editingPromo ? OperationType.UPDATE : OperationType.CREATE, 'promotions');
      toast.error('Failed to save promotion');
    } finally {
      setIsSubmitting(false);
    }
  };

  const toggleActive = async (promo: Promotion) => {
    try {
      const docRef = doc(db, 'promotions', promo.id);
      await setDoc(docRef, { 
        active: !promo.active,
        updatedAt: serverTimestamp()
      }, { merge: true });
      toast.success(`Promotion ${promo.active ? 'deactivated' : 'activated'}`);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'promotions');
      toast.error('Failed to update promotion status');
    }
  };

  const handleDelete = async (id: string) => {
    if (window.confirm('Are you sure you want to delete this promotion?')) {
      try {
        await deleteDoc(doc(db, 'promotions', id));
        toast.success('Promotion deleted');
      } catch (error) {
        handleFirestoreError(error, OperationType.DELETE, 'promotions');
        toast.error('Failed to delete promotion');
      }
    }
  };

  const filteredPromotions = promotions.filter(p => 
    p.name.toLowerCase().includes(search.toLowerCase()) || 
    p.code.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="h-full flex flex-col gap-6">
       <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
         <div>
           <div className="flex items-center gap-2 mb-1">
             <div className="bg-[#FF6F00]/20 p-2 rounded-lg">
               <Ticket className="h-5 w-5 text-[#FF6F00]" />
             </div>
             <h2 className="text-2xl font-bold tracking-tight text-[#FAF7F2]">Discount Engine</h2>
           </div>
           <p className="text-sm font-mono text-[#7A736E] mt-1 ml-10">Manage promotions, coupons, and rulesets.</p>
         </div>

         <Button
           onClick={openNewDialog}
           className="bg-[#1D9E75] hover:bg-[#1D9E75]/80 text-[#FAF7F2] font-mono tracking-widest uppercase text-xs shadow-lg shadow-[#1D9E75]/20 transition-all hover:scale-105"
         >
           <Plus className="mr-2 h-4 w-4" /> New Rule
         </Button>
       </div>

       <div className="bg-[#141210] border border-[#3A3230] p-2 rounded-lg flex items-center gap-2">
         <Search className="h-4 w-4 text-[#7A736E] ml-2" />
         <Input
           type="text"
           placeholder="Search promotions by name or code..."
           value={search}
           onChange={(e) => setSearch(e.target.value)}
           className="bg-transparent border-none text-sm text-[#FAF7F2] focus-visible:ring-0 placeholder:text-[#7A736E]"
         />
       </div>

       {loading ? (
         <div className="flex-1 flex justify-center items-center">
           <div className="flex flex-col items-center gap-4">
             <div className="animate-spin text-[#FF6F00]"><Ticket className="h-8 w-8" /></div>
             <p className="text-[#7A736E] font-mono text-xs animate-pulse">Loading rulesets...</p>
           </div>
         </div>
       ) : (
         <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <AnimatePresence>
              {filteredPromotions.map((promo) => (
                <motion.div
                  key={promo.id}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={{ duration: 0.2 }}
                >
                  <Card className={`bg-[#1A1614] border ${promo.active ? 'border-[#3A3230] hover:border-[#FF6F00]' : 'border-[#3A3230]/50 opacity-70'} h-full flex flex-col transition-colors`}>
                    <CardHeader className="flex flex-row justify-between items-start pb-2">
                      <div className="flex-1 pr-2">
                        <CardTitle className="text-sm font-bold text-[#FAF7F2] truncate" title={promo.name}>{promo.name}</CardTitle>
                        {promo.code && (
                          <div className="flex items-center gap-2 mt-2">
                            <Badge variant="outline" className={`border-dashed ${promo.active ? 'border-[#1D9E75] text-[#1D9E75] bg-[#1D9E75]/10' : 'border-[#7A736E] text-[#7A736E] bg-transparent'} font-mono text-xs tracking-wider`}>
                              {promo.code}
                            </Badge>
                          </div>
                        )}
                      </div>
                      <div 
                        className={`cursor-pointer transition-transform hover:scale-105 active:scale-95`}
                        onClick={() => toggleActive(promo)}
                        title={promo.active ? "Click to deactivate" : "Click to activate"}
                      >
                        <Badge variant="outline" className={promo.active ? "border-[#1D9E75] text-[#1D9E75] bg-[#1D9E75]/10" : "border-[#7A736E] text-[#7A736E] bg-transparent"}>
                          {promo.active ? 'ACTIVE' : 'INACTIVE'}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="flex-1 flex flex-col gap-4 text-sm mt-4">
                       <div className="flex flex-col gap-3">
                         <div className="flex items-center justify-between text-[#7A736E]">
                            <span className="flex items-center gap-1.5 font-mono text-xs">
                              {promo.type === 'PERCENTAGE' ? <Tag className="h-3.5 w-3.5" /> : 
                               promo.type === 'BOGO' ? <Package className="h-3.5 w-3.5" /> : 
                               <Ticket className="h-3.5 w-3.5" />} 
                              TYPE
                            </span>
                            <span className="font-mono text-[#FAF7F2] font-semibold bg-[#0A0C10] px-2 py-0.5 rounded border border-[#3A3230]">
                              {promo.type === 'PERCENTAGE' && `${promo.value}% OFF`}
                              {promo.type === 'FIXED' && `₱${promo.value} OFF`}
                              {promo.type === 'BOGO' && 'BOGO'}
                            </span>
                         </div>
                         <div className="flex items-center justify-between text-[#7A736E]">
                            <span className="flex items-center gap-1.5 font-mono text-xs">
                              {promo.targetType === 'ORDER' ? <ShoppingCart className="h-3.5 w-3.5" /> : 
                               promo.targetType === 'PRODUCT' ? <Package className="h-3.5 w-3.5" /> : 
                               <Folder className="h-3.5 w-3.5" />} 
                              APPLIES TO
                            </span>
                            <span className="font-mono text-[#FAF7F2] truncate max-w-[120px]" title={promo.targetType === 'ORDER' ? 'Entire Order' : promo.targetIds.join(', ')}>
                              {promo.targetType === 'ORDER' ? 'Entire Order' : `${promo.targetType} (${promo.targetIds.length})`}
                            </span>
                         </div>
                       </div>
                       
                       <div className="flex flex-col text-[#7A736E] font-mono text-xs gap-1.5 mt-auto pt-4 border-t border-[#3A3230]/50">
                          {(promo.startDate || promo.endDate) ? (
                            <>
                             {promo.startDate && <div className="flex justify-between items-center"><span className="flex items-center gap-1"><Calendar className="h-3 w-3"/> START:</span> <span className="text-[#FAF7F2]">{new Date(promo.startDate).toLocaleDateString()}</span></div>}
                             {promo.endDate && <div className="flex justify-between items-center"><span className="flex items-center gap-1"><Calendar className="h-3 w-3"/> END:</span> <span className="text-[#FAF7F2]">{new Date(promo.endDate).toLocaleDateString()}</span></div>}
                            </>
                          ) : (
                            <div className="text-center italic opacity-70 flex items-center justify-center gap-1"><Calendar className="h-3 w-3" /> No Expiry Date</div>
                          )}
                       </div>

                       <div className="flex gap-2 mt-4 pt-4 border-t border-[#3A3230]">
                         <Button variant="outline" size="sm" onClick={() => openEditDialog(promo)} className="flex-1 border-[#3A3230] hover:bg-[#3A3230] hover:text-[#FAF7F2] text-[#7A736E] h-8 text-xs font-mono transition-colors">
                           <Edit className="h-3.5 w-3.5 mr-1.5" /> Edit Rule
                         </Button>
                         <Button variant="outline" size="sm" onClick={() => handleDelete(promo.id)} className="border-red-900/30 text-red-500 hover:bg-red-900/20 hover:text-red-400 h-8 w-10 p-0 shrink-0 transition-colors">
                           <Trash2 className="h-4 w-4" />
                         </Button>
                       </div>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </AnimatePresence>
            {filteredPromotions.length === 0 && (
              <div className="col-span-full py-20 flex flex-col items-center justify-center text-[#7A736E] bg-[#141210] rounded-xl border border-dashed border-[#3A3230]">
                 <div className="bg-[#1A1614] p-4 rounded-full mb-4 border border-[#3A3230]">
                   <Ticket className="h-8 w-8 text-[#FF6F00]/70" />
                 </div>
                 <h3 className="text-[#FAF7F2] font-semibold mb-1">No promotions found</h3>
                 <p className="font-mono text-xs text-center max-w-sm">
                    {search ? "No promotions match your search criteria. Try a different term." : "You haven't created any promotions yet. Click 'New Rule' to get started."}
                 </p>
                 {!search && (
                   <Button onClick={openNewDialog} className="mt-6 bg-[#1D9E75]/10 text-[#1D9E75] hover:bg-[#1D9E75]/20 border border-[#1D9E75]/30">
                     Create First Promotion
                   </Button>
                 )}
              </div>
            )}
         </div>
       )}

       <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent className="bg-[#141210] border-[#3A3230] text-[#FAF7F2] max-w-lg">
             <DialogHeader>
                <DialogTitle className="text-[#FF6F00] font-mono tracking-widest uppercase text-sm">
                   {editingPromo ? 'Edit Promotion' : 'New Rule'}
                </DialogTitle>
             </DialogHeader>
             
             <form onSubmit={handleSave} className="space-y-6 py-4">
                <div className="grid grid-cols-2 gap-x-4 gap-y-5">
                   <div className="space-y-2 col-span-2">
                     <label className="text-xs font-mono text-[#FAF7F2] flex items-center justify-between">
                       PROMOTION NAME <span className="text-red-500">*</span>
                     </label>
                     <Input 
                       value={name} 
                       onChange={(e) => setName(e.target.value)} 
                       className={`bg-[#0A0C10] border ${formErrors.name ? 'border-red-500 focus-visible:ring-red-500' : 'border-[#3A3230] focus-visible:ring-[#FF6F00]'} text-sm text-[#FAF7F2]`}
                       placeholder="e.g. Summer Sale 2026, Buy 1 Get 1 Hotdog"
                     />
                     {formErrors.name && (
                       <p className="text-red-500 text-xs font-mono mt-1 flex items-center gap-1"><AlertCircle className="w-3 h-3" /> {formErrors.name}</p>
                     )}
                   </div>

                   <div className="space-y-2">
                     <label className="text-xs font-mono text-[#FAF7F2] flex justify-between items-center">
                       COUPON CODE <span className="cursor-pointer text-[#FF6F00] hover:underline text-[10px]" onClick={generateCode}>Auto-gen</span>
                     </label>
                     <div className="relative">
                       <Input 
                         value={code} 
                         onChange={(e) => setCode(e.target.value.toUpperCase().replace(/\s+/g, ''))} 
                         className={`bg-[#0A0C10] border ${formErrors.code ? 'border-red-500 focus-visible:ring-red-500' : 'border-[#3A3230] focus-visible:ring-[#FF6F00]'} text-sm font-mono text-[#FAF7F2] placeholder:text-[#7A736E]`}
                         placeholder="e.g. PROMO20 (Optional)"
                       />
                     </div>
                     {formErrors.code && (
                       <p className="text-red-500 text-xs font-mono mt-1 flex items-center gap-1"><AlertCircle className="w-3 h-3 shrink-0" /> {formErrors.code}</p>
                     )}
                   </div>

                   <div className="space-y-2">
                     <label className="text-xs font-mono text-[#FAF7F2]">STATUS</label>
                     <select 
                       value={active.toString()} 
                       onChange={(e) => setActive(e.target.value === 'true')}
                       className="w-full bg-[#0A0C10] border border-[#3A3230] focus:border-[#FF6F00] focus:ring-1 focus:ring-[#FF6F00] text-sm rounded-md px-3 h-10 outline-none text-[#FAF7F2]"
                     >
                        <option value="true">Active</option>
                        <option value="false">Inactive</option>
                     </select>
                   </div>
                   
                   <div className="col-span-2 border-t border-[#3A3230] my-2 pt-4">
                     <h4 className="text-xs font-mono font-bold text-[#FF6F00] mb-4">RULE DEFINITION</h4>
                   </div>

                   <div className="space-y-2">
                     <label className="text-xs font-mono text-[#FAF7F2]">DISCOUNT TYPE</label>
                     <select 
                       value={type} 
                       onChange={(e) => {
                         setType(e.target.value as any);
                         if (e.target.value === 'BOGO') setValue(0);
                       }}
                       className="w-full bg-[#0A0C10] border border-[#3A3230] focus:border-[#FF6F00] focus:ring-1 focus:ring-[#FF6F00] text-sm rounded-md px-3 h-10 outline-none text-[#FAF7F2]"
                     >
                        <option value="PERCENTAGE">Percentage (%)</option>
                        <option value="FIXED">Fixed Amount (₱)</option>
                        <option value="BOGO">Buy One Get One</option>
                     </select>
                   </div>

                   <div className="space-y-2">
                     <label className={`text-xs font-mono ${type === 'BOGO' ? 'text-[#7A736E]' : 'text-[#FAF7F2]'}`}>
                       DISCOUNT VALUE {type === 'PERCENTAGE' ? '(%)' : type === 'FIXED' ? '(₱)' : ''}
                     </label>
                     <Input 
                       disabled={type === 'BOGO'}
                       type="number"
                       step="0.01"
                       min="0"
                       max={type === 'PERCENTAGE' ? "100" : undefined}
                       value={value || ''} 
                       onChange={(e) => setValue(parseFloat(e.target.value) || 0)} 
                       className={`bg-[#0A0C10] border ${formErrors.value ? 'border-red-500 focus-visible:ring-red-500' : 'border-[#3A3230] focus-visible:ring-[#FF6F00]'} text-sm text-[#FAF7F2] ${type === 'BOGO' ? 'opacity-50' : ''}`}
                     />
                     {formErrors.value && (
                       <p className="text-red-500 text-xs font-mono mt-1 flex items-center gap-1"><AlertCircle className="w-3 h-3" /> {formErrors.value}</p>
                     )}
                   </div>

                   <div className="space-y-2 col-span-2">
                     <label className="text-xs font-mono text-[#FAF7F2]">APPLIES TO</label>
                     <select 
                       value={targetType} 
                       onChange={(e) => setTargetType(e.target.value as any)}
                       className="w-full bg-[#0A0C10] border border-[#3A3230] focus:border-[#FF6F00] focus:ring-1 focus:ring-[#FF6F00] text-sm rounded-md px-3 h-10 outline-none text-[#FAF7F2]"
                     >
                        <option value="ORDER">Entire Order</option>
                        <option value="PRODUCT">Specific Products (by Barcode)</option>
                        <option value="CATEGORY">Specific Categories</option>
                     </select>
                   </div>

                   {targetType !== 'ORDER' && (
                      <div className="space-y-2 col-span-2 animate-in fade-in slide-in-from-top-2 duration-300">
                        <label className="text-xs font-mono text-[#FAF7F2]">TARGET {targetType === 'PRODUCT' ? 'BARCODES' : 'CATEGORIES'} <span className="text-red-500">*</span></label>
                        <Input 
                          value={targetIdsStr} 
                          onChange={(e) => setTargetIdsStr(e.target.value)} 
                          className={`bg-[#0A0C10] border ${formErrors.targetIdsStr ? 'border-red-500 focus-visible:ring-red-500' : 'border-[#3A3230] focus-visible:ring-[#FF6F00]'} text-sm text-[#FAF7F2] placeholder:text-[#7A736E]`}
                          placeholder={targetType === 'PRODUCT' ? "e.g. 123456, 789012 (comma separated)" : "e.g. Snacks, Drinks (comma separated)"}
                        />
                        {formErrors.targetIdsStr ? (
                           <p className="text-red-500 text-xs font-mono mt-1 flex items-center gap-1"><AlertCircle className="w-3 h-3" /> {formErrors.targetIdsStr}</p>
                         ) : (
                           <p className="text-[#7A736E] text-[10px] uppercase mt-1 px-1">Separate multiple entries with commas</p>
                         )}
                      </div>
                   )}
                   
                   <div className="col-span-2 border-t border-[#3A3230] my-2 pt-4">
                     <h4 className="text-xs font-mono font-bold text-[#FF6F00] mb-4">VALIDITY PERIOD (OPTIONAL)</h4>
                   </div>

                   <div className="space-y-2">
                     <label className="text-xs font-mono text-[#FAF7F2]">START DATE</label>
                     <Input 
                       type="date"
                       value={startDate} 
                       onChange={(e) => setStartDate(e.target.value)} 
                       className="bg-[#0A0C10] border-[#3A3230] focus-visible:ring-[#FF6F00] text-sm text-[#FAF7F2] [color-scheme:dark]"
                     />
                   </div>
                   
                   <div className="space-y-2">
                     <label className="text-xs font-mono text-[#FAF7F2]">END DATE</label>
                     <Input 
                       type="date"
                       value={endDate} 
                       min={startDate}
                       onChange={(e) => setEndDate(e.target.value)} 
                       className={`bg-[#0A0C10] border ${formErrors.endDate ? 'border-red-500 focus-visible:ring-red-500' : 'border-[#3A3230] focus-visible:ring-[#FF6F00]'} text-sm text-[#FAF7F2] [color-scheme:dark]`}
                     />
                     {formErrors.endDate && (
                       <p className="text-red-500 text-xs font-mono mt-1 flex items-center gap-1"><AlertCircle className="w-3 h-3" /> {formErrors.endDate}</p>
                     )}
                   </div>
                </div>

                <DialogFooter className="mt-8 border-t border-[#3A3230] pt-6">
                  <Button type="button" variant="ghost" onClick={() => setIsDialogOpen(false)} className="text-[#FAF7F2] hover:bg-[#1A1614]">
                     Cancel
                  </Button>
                  <Button type="submit" disabled={isSubmitting} className="bg-[#1D9E75] hover:bg-[#1D9E75]/80 text-[#FAF7F2] font-mono tracking-wide px-6">
                     {isSubmitting ? 'Saving...' : editingPromo ? 'Update Rule' : 'Create Rule'}
                  </Button>
                </DialogFooter>
             </form>
          </DialogContent>
       </Dialog>
    </div>
  );
}
