import React, { useState, useEffect, useRef, useMemo } from 'react';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, auth, storage } from '../lib/firebase';
import { collection, addDoc, updateDoc, doc, deleteDoc, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '../lib/firestore-error';
import { formatCurrency } from '../lib/utils';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../components/ui/alert-dialog';
import { Plus, Search, Edit2, Camera, X, Trash2, Wand2, QrCode, Printer, AlertTriangle, Download, Sparkles, Loader2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { toast } from 'sonner';
import { BrowserMultiFormatReader } from '@zxing/library';
import { QRCodeSVG } from 'qrcode.react';
import Fuse from 'fuse.js';

import { useReactToPrint } from 'react-to-print';
import { toPng } from 'html-to-image';
import jsPDF from 'jspdf';
import { useDebounce } from '../hooks/useDebounce';
import { useLocation, useNavigate } from 'react-router-dom';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { PurchaseOrders } from '../components/PurchaseOrders';
import imageCompression from 'browser-image-compression';
import { GoogleGenAI } from '@google/genai';
import ReactCrop, { type Crop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';

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
  imageUrl?: string;
  supplierId?: string;
}

interface Supplier {
  id: string;
  name: string;
  contact: string;
  address: string;
}

export function Inventory() {
  const [products, setProducts] = useState<Product[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isDetailsDialogOpen, setIsDetailsDialogOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const location = useLocation();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState(() => {
    return location.state?.createPO ? 'purchase_orders' : 'products';
  });
  const [prefilledPOItem, setPrefilledPOItem] = useState<{productId: string, qty: number} | null>(() => {
    if (location.state?.createPO && location.state?.productId && location.state?.qty) {
      return { productId: location.state.productId, qty: location.state.qty };
    }
    return null;
  });

  // Clear location state after reading
  useEffect(() => {
    if (location.state?.createPO) {
      navigate('/inventory', { replace: true, state: {} });
    }
  }, [location.state, navigate]);

  const handleReorderProduct = (product: Product, qty: number) => {
    setPrefilledPOItem({ productId: product.id, qty });
    setActiveTab('purchase_orders');
  };
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [isQrDialogOpen, setIsQrDialogOpen] = useState(false);
  const [qrProduct, setQrProduct] = useState<Product | null>(null);
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
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
  const [supplierId, setSupplierId] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imageUrl, setImageUrl] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [isGeneratingDesc, setIsGeneratingDesc] = useState(false);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [isSupplierDialogOpen, setIsSupplierDialogOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [supplierName, setSupplierName] = useState('');
  const [supplierContact, setSupplierContact] = useState('');
  const [supplierAddress, setSupplierAddress] = useState('');

  // Cropper states
  const [crop, setCrop] = useState<Crop>({
    unit: '%',
    x: 0,
    y: 0,
    width: 100,
    height: 100
  });
  const [isCropDialogOpen, setIsCropDialogOpen] = useState(false);
  const [cropSrc, setCropSrc] = useState<string>('');
  const imageRef = useRef<HTMLImageElement | null>(null);

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
    const unsubscribeProducts = onSnapshot(collection(db, 'products'), (snapshot) => {
      const prods: Product[] = [];
      snapshot.forEach((doc) => prods.push({ id: doc.id, ...doc.data() } as Product));
      setProducts(prods);
    }, (error) => handleFirestoreError(error, OperationType.GET, 'products'));

    const unsubscribeSuppliers = onSnapshot(collection(db, 'suppliers'), (snapshot) => {
      const supps: Supplier[] = [];
      snapshot.forEach((doc) => supps.push({ id: doc.id, ...doc.data() } as Supplier));
      setSuppliers(supps);
    }, (error) => handleFirestoreError(error, OperationType.GET, 'suppliers'));

    return () => {
      unsubscribeProducts();
      unsubscribeSuppliers();
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
      setSupplierId(product.supplierId || '');
      setImageUrl(product.imageUrl || '');
      setImageFile(null);
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
      setSupplierId('');
      setImageUrl('');
      setImageFile(null);
    }
    setIsDialogOpen(true);
    setIsDetailsDialogOpen(false);
  };

  const closeDialog = () => {
    setIsDialogOpen(false);
    stopScanner();
  };

  const openSupplierDialog = (supplier?: Supplier) => {
    if (supplier) {
      setEditingSupplier(supplier);
      setSupplierName(supplier.name);
      setSupplierContact(supplier.contact);
      setSupplierAddress(supplier.address);
    } else {
      setEditingSupplier(null);
      setSupplierName('');
      setSupplierContact('');
      setSupplierAddress('');
    }
    setIsSupplierDialogOpen(true);
  };

  const closeSupplierDialog = () => {
    setIsSupplierDialogOpen(false);
    setEditingSupplier(null);
  };

  const handleSaveSupplier = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const supplierData = {
        name: supplierName,
        contact: supplierContact,
        address: supplierAddress,
      };

      if (editingSupplier) {
        await updateDoc(doc(db, 'suppliers', editingSupplier.id), {
          ...supplierData,
          updatedAt: serverTimestamp()
        });
        toast.success('Supplier updated');
      } else {
        await addDoc(collection(db, 'suppliers'), {
          ...supplierData,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
        toast.success('Supplier created');
      }
      closeSupplierDialog();
    } catch (error) {
      handleFirestoreError(error, editingSupplier ? OperationType.UPDATE : OperationType.CREATE, 'suppliers');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteSupplier = async () => {
    if (!supplierToDelete) return;
    try {
      await deleteDoc(doc(db, 'suppliers', supplierToDelete.id));
      toast.success('Supplier deleted successfully');
      setSupplierToDelete(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, 'suppliers');
    }
  };

  const handleSupplierDeleteClick = (supplier: Supplier) => {
    const linkedProductsCount = products.filter(p => p.supplierId === supplier.id).length;
    if (linkedProductsCount > 0) {
      toast.error(`Cannot delete ${supplier.name} because it is linked to ${linkedProductsCount} product(s). Please edit or delete those products first.`, {
        icon: <AlertTriangle className="h-4 w-4 text-red-500" />
      });
      return;
    }
    setSupplierToDelete(supplier);
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

  const generateAIAIDescription = async () => {
    if (!name) {
      toast.error('Please enter a product name first before generating a description.');
      return;
    }
    
    // To generate based on image, we need an image URL or File
    let base64Image = '';
    let mimeType = '';
    if (imageFile) {
        try {
           const reader = new FileReader();
           const fileData = await new Promise<string>((resolve) => {
              reader.onloadend = () => resolve(reader.result as string);
              reader.readAsDataURL(imageFile);
           });
           mimeType = fileData.substring(5, fileData.indexOf(';'));
           base64Image = fileData.substring(fileData.indexOf(',') + 1);
        } catch(e) {}
    } else if (imageUrl && imageUrl.startsWith('data:image')) {
        mimeType = imageUrl.substring(5, imageUrl.indexOf(';'));
        base64Image = imageUrl.substring(imageUrl.indexOf(',') + 1);
    }

    try {
      setIsGeneratingDesc(true);
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });
      const prompt = `Write a short, engaging description (max 2 sentences) for a product named "${name}"${category ? ` in the ${category} category` : ''}. Keep it concise and professional.`;
      
      let contents: any = prompt;
      if (base64Image) {
        contents = {
          parts: [
            { text: prompt + " Here is an image of the product to help you write the description." },
            { inlineData: { mimeType, data: base64Image } }
          ]
        };
      }
      
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: contents
      });
      
      if (response.text) {
        setDescription(response.text.trim());
        toast.success("Description generated");
      }
    } catch (err) {
      toast.error('Failed to generate description. Ensure Gemini key is set.');
      console.error('Gemini error:', err);
    } finally {
      setIsGeneratingDesc(false);
    }
  };

  const generateProductImage = async () => {
    if (!name) {
      toast.error('Please enter a product name first before generating an image.');
      return;
    }
    
    try {
      setIsGeneratingImage(true);
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });
      let supplierNameText = '';
      if (supplierId) {
        const supplier = suppliers.find(s => s.id === supplierId);
        if (supplier) {
          supplierNameText = supplier.name;
        }
      }
      const prompt = `Photorealistic, accurate studio product photography of the real-world product: ${name} ${category ? `(${category})` : ''} ${supplierNameText ? `by ${supplierNameText}` : ''}. Exact brand packaging and appearance. Centered, extreme detail, 4k, clean white background, professional lighting.`;
      
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: {
          parts: [
            {
              text: prompt,
            },
          ],
        },
        config: {
          imageConfig: {
            aspectRatio: "1:1"
          }
        },
      });
      
      let generatedImageUrl = '';
      if (response.candidates && response.candidates[0]?.content?.parts) {
        for (const part of response.candidates[0].content.parts) {
          if (part.inlineData && part.inlineData.mimeType && part.inlineData.data) {
            generatedImageUrl = `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
            break;
          }
        }
      }
      
      if (generatedImageUrl) {
        try {
          const res = await fetch(generatedImageUrl);
          const blob = await res.blob();
          const file = new File([blob], "generated_product.jpg", { type: blob.type || "image/jpeg" });
          setImageFile(file);
          setImageUrl('');
          setCropSrc(URL.createObjectURL(file));
          setIsCropDialogOpen(true);
          toast.success("Image generated successfully. You can crop it now.");
        } catch (e) {
          console.error("Error converting generated image to file:", e);
          setImageUrl(generatedImageUrl);
          setImageFile(null);
          setCropSrc(generatedImageUrl);
          setIsCropDialogOpen(true);
          toast.success("Image generated successfully. You can crop it now.");
        }
      } else {
        toast.error('Failed to generate image. Try again.');
      }
    } catch (err) {
      toast.error('Failed to generate image. Ensure API key supports image generation.');
      console.error('Gemini error:', err);
    } finally {
      setIsGeneratingImage(false);
    }
  };

  const getCroppedImg = async () => {
    if (!imageRef.current || !crop.width || !crop.height) return;
    
    const canvas = document.createElement('canvas');
    const scaleX = imageRef.current.naturalWidth / imageRef.current.width;
    const scaleY = imageRef.current.naturalHeight / imageRef.current.height;
    
    canvas.width = crop.width * scaleX;
    canvas.height = crop.height * scaleY;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    ctx.drawImage(
      imageRef.current,
      crop.x * scaleX,
      crop.y * scaleY,
      crop.width * scaleX,
      crop.height * scaleY,
      0,
      0,
      crop.width * scaleX,
      crop.height * scaleY
    );
    
    canvas.toBlob((blob) => {
      if (!blob) return;
      const file = new File([blob], 'cropped.png', { type: 'image/png' });
      setImageFile(file);
      setImageUrl('');
      setIsCropDialogOpen(false);
    }, 'image/png');
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
      supplierId: supplierId || '',
      imageUrl: imageUrl,
    };

    try {
      let productId = editingProduct?.id;

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
        const docRef = await addDoc(collection(db, 'products'), {
          ...productData,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
        productId = docRef.id;
        await addDoc(collection(db, 'activityLogs'), {
          type: 'INBOUND_DELIVERY',
          userId: auth.currentUser?.uid || 'Unknown',
          details: `Created PRODUCT ${productData.name}`,
          timestamp: serverTimestamp()
        });
        toast.success('Product added');
      }
      closeDialog();

      // Background image upload using Base64 to bypass Storage rules limit
      if (imageFile && productId) {
        const options = {
          maxSizeMB: 0.2, // Compress significantly to fit well within Firestore 1MB limit
          maxWidthOrHeight: 600,
          useWebWorker: true,
        };
        imageCompression(imageFile, options).then(async (compressedFile) => {
          const reader = new FileReader();
          reader.readAsDataURL(compressedFile);
          reader.onloadend = async () => {
            const base64data = reader.result as string;
            try {
              await updateDoc(doc(db, 'products', productId!), { 
                imageUrl: base64data,
                updatedAt: serverTimestamp()
              });
            } catch (err) {
              console.error('Error saving image to product:', err);
              toast.error('Image compression succeeded, but failed to save to product.');
            }
          };
        }).catch(err => {
          console.error('Error processing image:', err);
          toast.error('Image processing failed, but product was saved.');
        });
      }

    } catch (error) {
      handleFirestoreError(error, editingProduct ? OperationType.UPDATE : OperationType.CREATE, 'products');
    } finally {
      setIsSubmitting(false);
    }
  };

  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [productToDelete, setProductToDelete] = useState<Product | null>(null);

  const [supplierToDelete, setSupplierToDelete] = useState<Supplier | null>(null);

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

  const [stockFilter, setStockFilter] = useState('All');

  const filteredProducts = useMemo(() => {
    let result = [...products];

    if (selectedCategory !== 'All') {
      result = result.filter(p => p.category === selectedCategory);
    }

    if (stockFilter === 'LowStock') {
      result = result.filter(p => p.stock <= p.minStock && p.stock > 0);
    } else if (stockFilter === 'OutOfStock') {
      result = result.filter(p => p.stock === 0);
    }

    if (debouncedSearchQuery) {
      const fuse = new Fuse(result, {
        keys: ['name', 'barcode', 'category'],
        threshold: 0.3,
      });
      result = fuse.search(debouncedSearchQuery).map(res => res.item);
    } else {
      result.sort((a, b) => a.name.localeCompare(b.name));
    }

    return result;
  }, [products, debouncedSearchQuery, selectedCategory, stockFilter]);

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
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="bg-[#141210] border border-[#3A3230] p-1 mb-6">
          <TabsTrigger value="products" className="font-mono text-xs uppercase data-[state=active]:bg-[#FF6F00] data-[state=active]:text-black text-[#7A736E] data-[state=inactive]:hover:text-[#FAF7F2]">Products</TabsTrigger>
          <TabsTrigger value="suppliers" className="font-mono text-xs uppercase data-[state=active]:bg-[#FF6F00] data-[state=active]:text-black text-[#7A736E] data-[state=inactive]:hover:text-[#FAF7F2]">Suppliers</TabsTrigger>
          <TabsTrigger value="purchase_orders" className="font-mono text-xs uppercase data-[state=active]:bg-[#FF6F00] data-[state=active]:text-black text-[#7A736E] data-[state=inactive]:hover:text-[#FAF7F2]">Supplier Orders</TabsTrigger>
        </TabsList>

        <TabsContent value="products" className="space-y-6">
          <div className="flex justify-between items-center flex-wrap gap-4">
             <div className="flex items-center gap-2 flex-wrap ml-auto">
          {selectedProductIds.length > 0 && (
            <Button onClick={() => handlePrintBatchQR()} variant="outline" className="border-[#1D9E75] text-[#1D9E75] hover:bg-[#1D9E75] hover:text-white font-mono text-xs">
              <Printer className="mr-2 h-4 w-4" /> Print Batch ({selectedProductIds.length})
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
                <div className="col-span-2 grid grid-cols-2 gap-4 bg-[#1A1614]/50 border border-[#3A3230] p-4 rounded-lg">
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
                  <label className="text-xs font-mono text-[#7A736E] uppercase">Supplier <span className="text-[10px] text-gray-500">(Optional)</span></label>
                  <select
                    value={supplierId}
                    onChange={(e) => setSupplierId(e.target.value)}
                    className="w-full bg-[#0A0C10] border border-[#3A3230] h-10 px-3 text-[#FAF7F2] font-mono text-sm outline-none rounded-md focus:ring-1 focus:ring-[#FF6F00]"
                  >
                    <option value="">No Supplier</option>
                    {suppliers.map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
                <div className="col-span-2 space-y-2">
                  <label className="text-xs font-mono text-[#7A736E] uppercase">Description</label>
                  <div className="flex gap-2 relative">
                    <Input 
                      name="description" 
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      className="bg-[#0A0C10] border-[#3A3230] focus-visible:ring-[#FF6F00] pr-10" 
                    />
                    <Button 
                      type="button" 
                      onClick={generateAIAIDescription} 
                      disabled={isGeneratingDesc || !name}
                      variant="ghost" 
                      size="icon" 
                      title="Generate AI Description"
                      className={`absolute right-0 top-0 h-10 w-10 transition-colors ${isGeneratingDesc ? 'text-[#1D9E75]' : 'text-[#FF6F00] hover:bg-[#FF6F00]/10'}`}
                    >
                      {isGeneratingDesc ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Sparkles className="h-4 w-4 z-[1]" />
                      )}
                    </Button>
                  </div>
                </div>
                <div className="col-span-2 space-y-2">
                  <label className="text-xs font-mono text-[#7A736E] uppercase">Product Image</label>
                  <div className="flex flex-col gap-4">
                    <div className="flex items-center gap-4">
                      {(imageFile || imageUrl) && (
                        <div className="relative w-16 h-16 rounded-md border border-[#3A3230] overflow-hidden bg-[#0A0C10]">
                          <img 
                            src={imageFile ? URL.createObjectURL(imageFile) : imageUrl} 
                            alt="Product preview" 
                            className="w-full h-full object-cover"
                          />
                        </div>
                      )}
                      <div className="flex-1 space-y-2">
                        <Input 
                          type="file" 
                          accept="image/*"
                          onChange={(e) => {
                            if (e.target.files && e.target.files[0]) {
                              const file = e.target.files[0];
                              setImageFile(file);
                              const url = URL.createObjectURL(file);
                              setCropSrc(url);
                              setIsCropDialogOpen(true);
                            }
                          }}
                          className="bg-[#0A0C10] border-[#3A3230] focus-visible:ring-[#FF6F00] w-full text-sm text-[#FAF7F2] file:mr-4 file:py-1 file:px-4 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-[#1A1614] file:text-[#FAF7F2] hover:file:bg-[#3A3230]" 
                        />
                        {(imageFile || imageUrl) && (
                          <Button 
                            type="button" 
                            onClick={() => {
                              if (imageFile) {
                                setCropSrc(URL.createObjectURL(imageFile));
                              } else {
                                setCropSrc(imageUrl);
                              }
                              setIsCropDialogOpen(true);
                            }}
                            className="w-full bg-[#FAF7F2] text-black hover:bg-gray-200 text-xs font-mono mb-2"
                          >
                            <Edit2 className="h-3 w-3 mr-2" /> Crop/Resize Image
                          </Button>
                        )}
                        <Button 
                          type="button" 
                          onClick={generateProductImage}
                          disabled={isGeneratingImage || !name}
                          className="w-full bg-[#FAF7F2] text-black hover:bg-gray-200 text-xs font-mono border border-[#3A3230]"
                        >
                          {isGeneratingImage ? (
                            <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Generating...</>
                          ) : (
                            <><Sparkles className="h-4 w-4 mr-2" /> Auto-Generate with AI</>
                          )}
                        </Button>
                      </div>
                    </div>
                  </div>
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
                 <span className="font-bold tracking-wider">{outOfStockProducts.length} CRITICAL OUT OF STOCK</span>
                 <p className="mt-1 opacity-80 leading-relaxed">Items totally depleted. Restock immediately.</p>
               </div>
            </div>
          )}
          {lowStockProducts.length > 0 && (
            <div className="flex items-start gap-3 px-4 py-3 bg-[#FF6F00]/10 border border-[#FF6F00]/20 text-[#FF6F00] rounded-sm text-xs font-mono">
               <span className="w-2 h-2 rounded-full bg-[#FF6F00] animate-pulse mt-1 shrink-0"></span>
               <div>
                 <span className="font-bold tracking-wider">{lowStockProducts.length} LOW STOCK WARNINGS</span>
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
          className="bg-[#0A0C10] border border-[#3A3230] h-12 px-3 text-[#FAF7F2] font-mono text-sm min-w-[150px] outline-none rounded-md focus:ring-1 focus:ring-[#FF6F00]"
        >
          <option value="All">ALL CATEGORIES</option>
          {categories.map((c) => (
            <option key={c} value={c}>{c.toUpperCase()}</option>
          ))}
        </select>
        <select
          value={stockFilter}
          onChange={(e) => setStockFilter(e.target.value)}
          className="bg-[#0A0C10] border border-[#3A3230] h-12 px-3 text-[#FAF7F2] font-mono text-sm min-w-[150px] outline-none rounded-md focus:ring-1 focus:ring-[#FF6F00]"
        >
          <option value="All">ALL STOCK</option>
          <option value="LowStock">LOW STOCK</option>
          <option value="OutOfStock">OUT OF STOCK</option>
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
                <TableHead className="text-[10px] whitespace-nowrap font-mono text-[#7A736E] uppercase tracking-wider w-[60px]">IMAGE</TableHead>
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
                  <TableCell>
                    {product.imageUrl ? (
                      <div className="w-8 h-8 rounded shrink-0 overflow-hidden bg-[#0A0C10] border border-[#3A3230]">
                        <img src={product.imageUrl} alt={product.name} className="w-full h-full object-cover" />
                      </div>
                    ) : (
                      <div className="w-8 h-8 rounded shrink-0 bg-[#0A0C10] border border-[#3A3230] flex items-center justify-center text-[#3A3230]">
                        <Camera className="w-4 h-4" />
                      </div>
                    )}
                  </TableCell>
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
                      {product.stock <= product.minStock && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 px-2 text-[10px] text-[#FF6F00] hover:text-[#FF6F00] hover:bg-[#FF6F00]/10 border border-[#FF6F00]/30 ml-2 uppercase tracking-widest font-mono"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleReorderProduct(product, product.minStock * 2 || 10);
                          }}
                        >
                          Reorder
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {filteredProducts.length === 0 && (
               <TableRow className="border-[#3A3230] bg-[#141210]">
                 <TableCell colSpan={7} className="h-24 text-center font-mono text-[#7A736E] uppercase tracking-widest text-[10px]">
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
              {selectedProduct.imageUrl && (
                <div className="flex justify-center mb-6">
                  <div className="w-48 h-48 rounded-lg overflow-hidden border border-[#3A3230] bg-[#0A0C10]">
                    <img src={selectedProduct.imageUrl} alt={selectedProduct.name} className="w-full h-full object-cover" />
                  </div>
                </div>
              )}
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
              <div className="flex justify-between border-b border-[#3A3230] pb-2">
                <span className="text-[#7A736E] text-xs uppercase tracking-widest">Supplier</span>
                <span className="text-[#FAF7F2]">{selectedProduct.supplierId ? suppliers.find(s => s.id === selectedProduct.supplierId)?.name || 'Unknown Supplier' : 'No Supplier'}</span>
              </div>
              
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

      {/* Batch QR Code Hidden Print Container */}
      <div className="fixed overflow-hidden h-0 w-0" style={{ left: '-10000px', top: '-10000px' }}>
        <div 
          ref={batchQrPrintRef}
          className="bg-white p-8 w-[210mm]"
        >
          <style type="text/css" media="print">
            {`
              @page { size: A4 portrait; margin: 10mm; }
              body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
              .sticker-grid {
                display: grid !important;
                grid-template-columns: repeat(3, 1fr) !important;
                gap: 10mm !important;
              }
              .sticker-item {
                page-break-inside: avoid;
                border: 1px dashed #cccccc;
                padding: 10px;
                text-align: center;
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                height: 100%;
              }
            `}
          </style>
          <h2 className="text-black text-center font-bold text-xl mb-6">Batch Product QR Codes</h2>
          <div className="sticker-grid grid grid-cols-3 gap-4">
            {products.filter(p => selectedProductIds.includes(p.id)).map(product => (
              <div key={`print-${product.id}`} className="sticker-item border border-dashed border-gray-300 rounded-lg p-4 flex flex-col items-center">
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
      </div>
        </TabsContent>
        <TabsContent value="suppliers" className="space-y-6">
          <div className="flex justify-between items-center flex-wrap gap-4">
             <div className="flex items-center gap-2 flex-wrap ml-auto">
               {canEdit && (
                 <>
                   <Button onClick={() => openSupplierDialog()} className="bg-[#FF6F00] hover:bg-[#FF6F00]/80 text-black font-semibold">
                     <Plus className="mr-2 h-4 w-4" /> Add Supplier
                   </Button>
                   <Dialog open={isSupplierDialogOpen} onOpenChange={isOpen => {
                     if (!isOpen) closeSupplierDialog();
                   }}>
                     <DialogContent className="bg-[#141210] border-[#3A3230] text-[#FAF7F2] sm:max-w-[425px]">
                     <DialogHeader>
                       <DialogTitle>{editingSupplier ? 'Edit Supplier' : 'New Supplier'}</DialogTitle>
                     </DialogHeader>
                     
                     <form onSubmit={handleSaveSupplier} className="space-y-4 py-4">
                       <div className="space-y-2">
                         <label className="text-xs font-mono text-[#7A736E] uppercase">Supplier Name</label>
                         <Input 
                           value={supplierName}
                           onChange={(e) => setSupplierName(e.target.value)}
                           required 
                           className="bg-[#0A0C10] border-[#3A3230] focus-visible:ring-[#FF6F00]" 
                         />
                       </div>
                       <div className="space-y-2">
                         <label className="text-xs font-mono text-[#7A736E] uppercase">Contact Details</label>
                         <Input 
                           value={supplierContact}
                           onChange={(e) => setSupplierContact(e.target.value)}
                           className="bg-[#0A0C10] border-[#3A3230] focus-visible:ring-[#FF6F00]" 
                         />
                       </div>
                       <div className="space-y-2">
                         <label className="text-xs font-mono text-[#7A736E] uppercase">Address</label>
                         <Input 
                           value={supplierAddress}
                           onChange={(e) => setSupplierAddress(e.target.value)}
                           className="bg-[#0A0C10] border-[#3A3230] focus-visible:ring-[#FF6F00]" 
                         />
                       </div>
                       <div className="flex justify-end gap-2 pt-4">
                         <Button type="button" variant="outline" onClick={closeSupplierDialog} className="border-[#3A3230] text-[#000000]">Cancel</Button>
                         <Button type="submit" disabled={isSubmitting} className="bg-[#FF6F00] text-black hover:bg-[#FF6F00]/80">
                           {isSubmitting ? 'Saving...' : 'Save'}
                         </Button>
                       </div>
                     </form>
                   </DialogContent>
                 </Dialog>
                 </>
               )}
             </div>
          </div>

          <div className="border border-[#3A3230] bg-[#0A0C10] flex-1 overflow-hidden flex flex-col">
            <div className="overflow-x-auto flex-1">
              <Table>
                <TableHeader>
                  <TableRow className="border-[#3A3230] hover:bg-transparent">
                    <TableHead className="text-[10px] whitespace-nowrap font-mono text-[#7A736E] uppercase tracking-wider">SUPPLIER NAME</TableHead>
                    <TableHead className="text-[10px] whitespace-nowrap font-mono text-[#7A736E] uppercase tracking-wider">CONTACT</TableHead>
                    <TableHead className="text-[10px] whitespace-nowrap font-mono text-[#7A736E] uppercase tracking-wider">ADDRESS</TableHead>
                    <TableHead className="text-[10px] whitespace-nowrap font-mono text-[#7A736E] uppercase tracking-wider text-right">ACTIONS</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="font-mono text-sm">
                  {suppliers.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center h-24 text-[#7A736E]">No suppliers found.</TableCell>
                    </TableRow>
                  ) : (
                    suppliers.map((supplier) => (
                      <TableRow key={supplier.id} className="border-[#3A3230] bg-[#141210] hover:bg-[#1A1614] transition-colors">
                        <TableCell className="text-[#FAF7F2] font-sans font-medium">{supplier.name}</TableCell>
                        <TableCell className="text-[#7A736E]">{supplier.contact || '-'}</TableCell>
                        <TableCell className="text-[#7A736E] max-w-[200px] truncate" title={supplier.address}>{supplier.address || '-'}</TableCell>
                        <TableCell className="text-right whitespace-nowrap">
                          {canEdit && (
                            <div className="flex items-center justify-end gap-2">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => openSupplierDialog(supplier)}
                                className="h-8 w-8 text-[#FAF7F2] hover:text-[#FF6F00] hover:bg-[#FF6F00]/10"
                                title="Edit Supplier"
                              >
                                <Edit2 className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleSupplierDeleteClick(supplier)}
                                className="h-8 w-8 text-[#FAF7F2] hover:text-red-500 hover:bg-red-500/10"
                                title="Delete Supplier"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </TabsContent>
        <TabsContent value="purchase_orders">
          <PurchaseOrders 
            products={products} 
            suppliers={suppliers}
            prefilledPOItem={prefilledPOItem} 
            onClearPrefill={() => setPrefilledPOItem(null)} 
          />
        </TabsContent>
      </Tabs>
      <Dialog open={isCropDialogOpen} onOpenChange={setIsCropDialogOpen}>
        <DialogContent className="bg-[#141210] border-[#3A3230] text-[#FAF7F2] max-w-xl">
          <DialogHeader>
            <DialogTitle className="text-[#FF6F00] font-mono tracking-widest uppercase text-sm">
              Crop Image
            </DialogTitle>
          </DialogHeader>
          <div className="flex flex-col items-center gap-4 py-4 max-h-[60vh] overflow-auto">
            {cropSrc && (
              <ReactCrop
                crop={crop}
                onChange={(_, percentCrop) => setCrop(percentCrop)}
                className="max-w-full bg-[#0A0C10] border border-[#3A3230] rounded-md"
              >
                <img
                  src={cropSrc}
                  ref={imageRef}
                  alt="Crop preview"
                  className="max-w-full h-auto max-h-[50vh]"
                />
              </ReactCrop>
            )}
          </div>
          <div className="flex justify-end gap-3 mt-4">
            <Button
              variant="ghost"
              onClick={() => setIsCropDialogOpen(false)}
              className="text-[#FAF7F2] hover:bg-[#1A1614]"
            >
              Cancel
            </Button>
            <Button
              onClick={getCroppedImg}
              className="bg-[#1D9E75] hover:bg-[#1D9E75]/80 text-[#FAF7F2]"
            >
              Apply Crop
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Supplier Delete Confirmation Alert */}
      <AlertDialog open={!!supplierToDelete} onOpenChange={(open) => !open && setSupplierToDelete(null)}>
        <AlertDialogContent className="bg-[#141210] border-[#3A3230] text-[#FAF7F2] font-mono">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-red-500">Delete Supplier</AlertDialogTitle>
            <AlertDialogDescription className="text-[#7A736E]">
              Are you sure you want to permanently delete <span className="font-bold text-[#FAF7F2]">{supplierToDelete?.name}</span>?
              <br /><br />
              This action cannot be undone and will permanently remove the supplier from your records.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button 
              variant="outline" 
              onClick={() => setSupplierToDelete(null)} 
              className="border-[#3A3230] bg-transparent hover:bg-[#1A1614] text-[#FAF7F2]"
            >
              Cancel
            </Button>
            <Button 
              onClick={handleDeleteSupplier}
              className="bg-red-500 hover:bg-red-600 text-white"
            >
              Delete Supplier
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

