import React, { useState, useEffect } from 'react';
import { db, auth } from '../lib/firebase';
import { collection, onSnapshot, doc, updateDoc, setDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '../lib/firestore-error';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '../components/ui/alert-dialog';
import { Plus, Search, Edit2, ShieldAlert, UserX, UserCheck, Trash2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { toast } from 'sonner';
import { initializeApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword } from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';

interface UserData {
  id: string;
  email: string;
  name: string;
  role: string;
  isActive: boolean;
  createdAt: any;
  updatedAt: any;
}

// Ensure secondary app is initialized outside to prevent memory leak/re-initialization
let secondaryApp: any = null;
let secondaryAuth: any = null;
try {
  secondaryApp = initializeApp(firebaseConfig, "SecondaryAuthApp-" + Date.now());
  secondaryAuth = getAuth(secondaryApp);
} catch (e) {
  console.error("Failed to init secondary app", e);
}

export function UserManagement() {
  const [users, setUsers] = useState<UserData[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserData | null>(null);
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState('CASHIER');
  const [isActive, setIsActive] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deleteConfirmationUser, setDeleteConfirmationUser] = useState<UserData | null>(null);
  const [formErrors, setFormErrors] = useState<{email?: string, password?: string, name?: string, general?: string}>({});
  
  const { user: currentUser, role: currentUserRole } = useAuth();
  const canManage = currentUserRole === 'SUPER_ADMIN';

  useEffect(() => {
    if (!canManage) return;
    
    setIsSubmitting(true);
    const unsubscribe = onSnapshot(collection(db, 'users'), (snapshot) => {
      const usersList: UserData[] = [];
      snapshot.forEach((doc) => usersList.push({ id: doc.id, ...doc.data() } as UserData));
      setUsers(usersList);
      setIsSubmitting(false);
    }, (error) => {
      setIsSubmitting(false);
      handleFirestoreError(error, OperationType.GET, 'users');
    });

    return () => unsubscribe();
  }, [canManage]);

  const filteredUsers = users.filter(user => 
    user.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    user.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
    user.role.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const resetForm = () => {
    setEditingUser(null);
    setEmail('');
    setPassword('');
    setName('');
    setRole('CASHIER');
    setIsActive(true);
    setFormErrors({});
  };

  const openDialog = (user?: UserData) => {
    setFormErrors({});
    if (user) {
      setEditingUser(user);
      setEmail(user.email);
      setPassword(''); // Password isn't fetched, obviously
      setName(user.name);
      setRole(user.role);
      setIsActive(user.isActive !== false);
    } else {
      resetForm();
    }
    setIsDialogOpen(true);
  };

  const validateForm = () => {
    const errors: {email?: string, password?: string, name?: string} = {};
    let isValid = true;
    
    if (!name.trim()) {
      errors.name = 'Full name is required';
      isValid = false;
    }

    if (!editingUser) {
      if (!email.trim()) {
        errors.email = 'Email address is required';
        isValid = false;
      } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        errors.email = 'Please enter a valid email address';
        isValid = false;
      }

      if (!password) {
        errors.password = 'Password is required';
        isValid = false;
      } else if (password.length < 6) {
        errors.password = 'Password must be at least 6 characters';
        isValid = false;
      }
    }

    setFormErrors(errors);
    return isValid;
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManage) return;
    
    setFormErrors({});

    if (!validateForm()) {
      toast.error('Please fix the errors in the form');
      return;
    }

    try {
      setIsSubmitting(true);
      if (editingUser) {
        // Only update name and maybe role/isActive if we allow it via firestore.rules
        const userRef = doc(db, 'users', editingUser.id);
        const updateData: any = {
           name,
           updatedAt: serverTimestamp()
        };
        
        if (currentUserRole === 'SUPER_ADMIN' || currentUserRole === 'STORE_MANAGER') {
            updateData.role = role;
            updateData.isActive = isActive;
        }

        await updateDoc(userRef, updateData);
        toast.success('User updated successfully');
      } else {
        // CREATE NEW USER using secondary Firebase app to not logout current user
        if (!secondaryAuth) throw new Error("Secondary auth app not initialized");
        
        toast.info("Creating user account... please wait.");
        const userCredential = await createUserWithEmailAndPassword(secondaryAuth, email, password);
        const newUserId = userCredential.user.uid;
        
        // now sign out of secondary App
        await secondaryAuth.signOut();
        
        // create the user document using the MAIN firebase app doc reference
        const userDocRef = doc(db, 'users', newUserId);
        await setDoc(userDocRef, {
          email,
          name,
          role,
          isActive: true,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        
        toast.success('User created successfully');
      }
      setIsDialogOpen(false);
      resetForm();
    } catch (error: any) {
      console.error('Error saving user:', error);
      const errorCode = error.code || '';
      let errorMessage = error.message || 'Operation failed';
      
      if (errorCode === 'auth/email-already-in-use' || errorMessage.includes('email-already-in-use')) {
        errorMessage = 'This email is already registered';
        setFormErrors(prev => ({ ...prev, email: errorMessage }));
      } else if (errorCode === 'auth/weak-password' || errorMessage.includes('weak-password')) {
        errorMessage = 'Password must be at least 6 characters';
        setFormErrors(prev => ({ ...prev, password: errorMessage }));
      } else if (errorCode === 'auth/invalid-email' || errorMessage.includes('invalid-email')) {
        errorMessage = 'Please enter a valid email address';
        setFormErrors(prev => ({ ...prev, email: errorMessage }));
      } else {
        setFormErrors(prev => ({ ...prev, general: errorMessage }));
      }
      toast.error(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  const toggleUserStatus = async (user: UserData) => {
    try {
       const userRef = doc(db, 'users', user.id);
       await updateDoc(userRef, {
           isActive: !user.isActive,
           updatedAt: serverTimestamp()
       });
       toast.success(`User ${user.isActive ? 'disabled' : 'enabled'} successfully`);
    } catch (error: any) {
       handleFirestoreError(error, OperationType.UPDATE, `users/${user.id}`);
    }
  };

  const handleDeleteUser = async () => {
    if (isSubmitting || !deleteConfirmationUser) return;
    
    const user = deleteConfirmationUser;
    
    try {
      setIsSubmitting(true);
      await deleteDoc(doc(db, 'users', user.id));
      toast.success(`User ${user.name} deleted successfully`);
      setDeleteConfirmationUser(null);
    } catch (error: any) {
      console.error('Error deleting user:', error);
      handleFirestoreError(error, OperationType.DELETE, `users/${user.id}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!canManage) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-[#7A736E]">
        <ShieldAlert className="w-16 h-16 mb-4 text-[#FF6F00] opacity-50" />
        <h2 className="text-xl font-bold text-[#FAF7F2]">Access Denied</h2>
        <p className="font-mono text-sm mt-2">You do not have permission to view this section.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between gap-4 items-start sm:items-center">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-[#FAF7F2]">Account Management</h2>
          <p className="text-sm font-mono text-[#7A736E]">Manage users, roles, and access control</p>
        </div>
        
        <div className="flex items-center gap-2">
          <Dialog open={isDialogOpen} onOpenChange={isOpen => {
            if (!isOpen) { setIsDialogOpen(false); resetForm(); }
            else openDialog();
          }}>
            <DialogTrigger render={(props: any) => (
              <Button {...props} className="bg-[#FF6F00] hover:bg-[#FF6F00]/80 text-black font-semibold">
                <Plus className="mr-2 h-4 w-4" /> Add User
              </Button>
            )} />
            <DialogContent className="bg-[#141210] border-[#3A3230] text-[#FAF7F2] font-mono sm:max-w-md">
              <DialogHeader>
                <DialogTitle className="text-[#FF6F00] uppercase tracking-widest text-sm border-b border-[#3A3230] pb-4">
                  {editingUser ? 'Edit User' : 'Create User Account'}
                </DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSave} className="space-y-4 pt-4">
                {formErrors.general && (
                  <div className="bg-red-500/10 border border-red-500/50 text-red-500 px-3 py-2 rounded text-sm mb-4">
                    {formErrors.general}
                  </div>
                )}
                {!editingUser && (
                  <>
                    <div className="space-y-1.5">
                      <label className="text-[10px] text-[#7A736E] uppercase tracking-wider">Email Address</label>
                      <Input
                        required
                        type="email"
                        value={email}
                        onChange={(e) => {
                          setEmail(e.target.value);
                          if (formErrors.email) setFormErrors(prev => ({ ...prev, email: undefined }));
                        }}
                        className={`bg-[#0A0C10] text-[#FAF7F2] ${formErrors.email ? 'border-red-500 focus-visible:ring-red-500' : 'border-[#3A3230] focus-visible:ring-[#FF6F00]'}`}
                      />
                      {formErrors.email && <p className="text-red-500 text-xs mt-1">{formErrors.email}</p>}
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] text-[#7A736E] uppercase tracking-wider">Password</label>
                      <Input
                        required
                        type="password"
                        value={password}
                        onChange={(e) => {
                          setPassword(e.target.value);
                          if (formErrors.password) setFormErrors(prev => ({ ...prev, password: undefined }));
                        }}
                        className={`bg-[#0A0C10] text-[#FAF7F2] ${formErrors.password ? 'border-red-500 focus-visible:ring-red-500' : 'border-[#3A3230] focus-visible:ring-[#FF6F00]'}`}
                      />
                      {formErrors.password && <p className="text-red-500 text-xs mt-1">{formErrors.password}</p>}
                    </div>
                  </>
                )}
                
                <div className="space-y-1.5">
                  <label className="text-[10px] text-[#7A736E] uppercase tracking-wider">Full Name</label>
                  <Input
                    required
                    value={name}
                    onChange={(e) => {
                      setName(e.target.value);
                      if (formErrors.name) setFormErrors(prev => ({ ...prev, name: undefined }));
                    }}
                    className={`bg-[#0A0C10] text-[#FAF7F2] ${formErrors.name ? 'border-red-500 focus-visible:ring-red-500' : 'border-[#3A3230] focus-visible:ring-[#FF6F00]'}`}
                  />
                  {formErrors.name && <p className="text-red-500 text-xs mt-1">{formErrors.name}</p>}
                </div>
                
                <div className="space-y-1.5">
                  <label className="text-[10px] text-[#7A736E] uppercase tracking-wider">Role</label>
                  <select
                    value={role}
                    onChange={(e) => setRole(e.target.value)}
                    className="flex h-10 w-full rounded-md border border-[#3A3230] bg-[#0A0C10] px-3 py-2 text-sm text-[#FAF7F2] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#FF6F00]"
                  >
                    <option value="CASHIER">CASHIER</option>
                    <option value="INVENTORY_CLERK">INVENTORY CLERK</option>
                    <option value="STORE_MANAGER">STORE MANAGER</option>
                    {currentUserRole === 'SUPER_ADMIN' && <option value="SUPER_ADMIN">SUPER ADMIN</option>}
                  </select>
                </div>
                
                {editingUser && (
                  <div className="space-y-1.5 pt-2">
                     <label className="text-[10px] text-[#7A736E] uppercase tracking-wider block">Account Status</label>
                     <div className="flex items-center gap-2">
                       <input 
                         type="checkbox" 
                         checked={isActive} 
                         onChange={(e) => setIsActive(e.target.checked)}
                         className="rounded border-[#3A3230] bg-[#0A0C10] text-[#1D9E75] focus:ring-[#1D9E75]"
                       />
                       <span className="text-sm">Active (Can Login)</span>
                     </div>
                  </div>
                )}
                
                <div className="flex justify-end gap-3 pt-4 border-t border-[#3A3230]">
                  <Button type="button" variant="ghost" onClick={() => setIsDialogOpen(false)} className="text-[#7A736E] hover:text-[#FAF7F2]">Cancel</Button>
                  <Button type="submit" disabled={isSubmitting} className="bg-[#FF6F00] hover:bg-[#FF6F00]/80 text-black">
                    {isSubmitting ? 'Saving...' : 'Save User'}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="bg-[#0A0C10] border border-[#3A3230] p-1 flex items-center w-full max-w-md h-12">
        <div className="px-3 text-[#7A736E]">
          <Search className="h-5 w-5" />
        </div>
        <input 
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="SEARCH USERS..." 
          className="bg-transparent w-full text-sm outline-none font-mono placeholder-[#3A3230] text-[#FAF7F2]"
        />
      </div>

      <div className="border border-[#3A3230] bg-[#0A0C10] rounded-sm overflow-hidden flex flex-col">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-[#1A1614]">
              <TableRow className="border-[#3A3230] hover:bg-transparent">
                <TableHead className="text-[10px] font-mono text-[#7A736E] uppercase tracking-wider">Name</TableHead>
                <TableHead className="text-[10px] font-mono text-[#7A736E] uppercase tracking-wider">Email</TableHead>
                <TableHead className="text-[10px] font-mono text-[#7A736E] uppercase tracking-wider">Role</TableHead>
                <TableHead className="text-[10px] font-mono text-[#7A736E] uppercase tracking-wider">Status</TableHead>
                <TableHead className="text-[10px] font-mono text-[#7A736E] uppercase tracking-wider text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className="text-sm font-mono">
              {filteredUsers.map((user) => (
                <TableRow key={user.id} className="border-[#3A3230] bg-[#141210] hover:bg-[#1A1614] transition-colors">
                  <TableCell className="text-[#FAF7F2] font-sans font-medium">{user.name}</TableCell>
                  <TableCell className="text-[#7A736E]">{user.email}</TableCell>
                  <TableCell>
                    <span className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider ${
                      user.role === 'SUPER_ADMIN' ? 'bg-purple-500/10 text-purple-400' :
                      user.role === 'STORE_MANAGER' ? 'bg-[#FF6F00]/10 text-[#FF6F00]' :
                      user.role === 'INVENTORY_CLERK' ? 'bg-blue-500/10 text-blue-400' :
                      'bg-[#1D9E75]/10 text-[#1D9E75]'
                    }`}>
                      {user.role.replace('_', ' ')}
                    </span>
                  </TableCell>
                  <TableCell>
                     {user.isActive !== false ? (
                       <span className="flex items-center text-[#1D9E75] text-[10px] uppercase tracking-wider"><UserCheck className="w-3 h-3 mr-1"/> Active</span>
                     ) : (
                       <span className="flex items-center text-red-500 text-[10px] uppercase tracking-wider"><UserX className="w-3 h-3 mr-1"/> Disabled</span>
                     )}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button 
                      variant="ghost" 
                      size="icon"
                      onClick={() => openDialog(user)}
                      className="h-8 w-8 text-[#7A736E] hover:text-[#FAF7F2] hover:bg-[#3A3230]"
                    >
                      <Edit2 className="h-4 w-4" />
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="icon"
                      onClick={() => toggleUserStatus(user)}
                      className={`h-8 w-8 ml-1 ${user.isActive !== false ? 'text-red-500 hover:bg-red-500/10' : 'text-[#1D9E75] hover:bg-[#1D9E75]/10'}`}
                      title={user.isActive !== false ? "Disable User" : "Enable User"}
                    >
                      {user.isActive !== false ? <UserX className="h-4 w-4" /> : <UserCheck className="h-4 w-4" />}
                    </Button>
                    {currentUser?.uid !== user.id && (
                      <Button 
                        variant="ghost" 
                        size="icon"
                        onClick={() => setDeleteConfirmationUser(user)}
                        className="h-8 w-8 ml-1 text-red-500 hover:text-red-400 hover:bg-red-500/10"
                        title="Delete User"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {filteredUsers.length === 0 && (
                <TableRow className="border-[#3A3230] hover:bg-transparent">
                  <TableCell colSpan={5} className="h-24 text-center text-[#7A736E]">
                    No users found matching your criteria.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <AlertDialog open={!!deleteConfirmationUser} onOpenChange={(open) => !open && setDeleteConfirmationUser(null)}>
        <AlertDialogContent className="bg-[#141210] border-[#3A3230] text-[#FAF7F2] font-mono">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-red-500">Delete User Account</AlertDialogTitle>
            <AlertDialogDescription className="text-[#7A736E]">
              Are you sure you want to permanently delete <span className="font-bold text-[#FAF7F2]">{deleteConfirmationUser?.name}</span>? 
              This action will remove their access to the application immediately.
              <br /><br />
              <span className="text-red-400 text-xs gap-1 flex items-center">
                <ShieldAlert className="w-3 h-3" />
                Note: This deletes their app data. You must also delete their Authentication record from the Firebase Console to fully erase their credentials.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button 
              variant="outline" 
              onClick={() => setDeleteConfirmationUser(null)} 
              disabled={isSubmitting} 
              className="border-[#3A3230] bg-transparent hover:bg-[#1A1614] text-[#FAF7F2]"
            >
              Cancel
            </Button>
            <Button 
              onClick={(e) => {
                e.preventDefault();
                handleDeleteUser();
              }}
              disabled={isSubmitting}
              className="bg-red-500 hover:bg-red-600 text-white"
            >
              {isSubmitting ? 'Deleting...' : 'Delete Permanently'}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
