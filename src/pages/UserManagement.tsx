import React, { useState, useEffect } from 'react';
import { db, collection, onSnapshot, doc, updateDoc, deleteDoc, serverTimestamp, realtime } from '../lib/realtime';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '../components/ui/alert-dialog';
import { Plus, Search, Edit2, ShieldAlert, UserX, UserCheck, Trash2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { toast } from 'sonner';

interface UserData {
  id: string;
  email: string;
  name: string;
  role: string;
  isActive: boolean;
  createdAt: any;
  updatedAt: any;
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
      console.error('Error fetching users:', error);
    });

    return () => unsubscribe();
  }, [canManage]);

  const filteredUsers = users.filter(user => 
    user.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    user.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    user.role?.toLowerCase().includes(searchQuery.toLowerCase())
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
      setPassword('');
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
        const updateData = {
          name: name.trim(),
          role,
          isActive,
        };

        const res = await fetch(`/api/auth/users/${editingUser.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updateData),
        });

        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || 'Failed to update user');
        }

        toast.success('User updated successfully');
      } else {
        const res = await fetch('/api/auth/users', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: email.trim().toLowerCase(),
            password,
            name: name.trim(),
            role,
          }),
        });

        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || 'Failed to create user');
        }

        toast.success('User created successfully');
      }
      setIsDialogOpen(false);
      resetForm();
    } catch (error: any) {
      console.error('Error saving user:', error);
      let errorMessage = error.message || 'Operation failed';
      
      if (errorMessage.includes('already exists')) {
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
      const res = await fetch(`/api/auth/users/${user.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !user.isActive }),
      });
      if (!res.ok) throw new Error('Failed to update status');
      toast.success(`User ${user.isActive ? 'disabled' : 'enabled'} successfully`);
    } catch (error: any) {
      toast.error(error.message || 'Failed to change user status');
    }
  };

  const handleDeleteUser = async () => {
    if (isSubmitting || !deleteConfirmationUser) return;
    
    const user = deleteConfirmationUser;
    
    try {
      setIsSubmitting(true);
      const res = await fetch(`/api/auth/users/${user.id}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Failed to delete user');
      toast.success(`User ${user.name} deleted successfully`);
      setDeleteConfirmationUser(null);
    } catch (error: any) {
      console.error('Error deleting user:', error);
      toast.error(error.message || 'Failed to delete user');
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
          <Button 
            onClick={() => openDialog()}
            className="bg-[#FF6F00] hover:bg-[#FF6F00]/80 text-[#0A0C10] font-bold"
          >
            <Plus className="w-4 h-4 mr-2" /> Add Staff Account
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-4 bg-white/[0.03] backdrop-blur-xl p-3 rounded-xl border border-white/[0.08] shadow-sm">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8E857E]" />
          <Input 
            placeholder="Search by name, email, or role..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 bg-white/[0.04] border-white/[0.08] text-[#FAF7F2] font-mono text-sm focus-visible:ring-[#FF6F00] backdrop-blur-md"
          />
        </div>
      </div>

      <div className="glass-panel rounded-2xl border border-white/[0.08] overflow-hidden shadow-[0_8px_32px_rgba(0,0,0,0.3)]">
        <Table>
          <TableHeader>
            <TableRow className="border-b border-white/[0.08] bg-white/[0.02] hover:bg-transparent">
              <TableHead className="font-mono text-xs text-[#8E857E] uppercase tracking-wider">USER</TableHead>
              <TableHead className="font-mono text-xs text-[#8E857E] uppercase tracking-wider">EMAIL</TableHead>
              <TableHead className="font-mono text-xs text-[#8E857E] uppercase tracking-wider">ROLE</TableHead>
              <TableHead className="font-mono text-xs text-[#8E857E] uppercase tracking-wider">STATUS</TableHead>
              <TableHead className="font-mono text-xs text-[#8E857E] uppercase tracking-wider text-right">ACTIONS</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredUsers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8 text-[#8E857E] font-mono text-sm">
                  No accounts found
                </TableCell>
              </TableRow>
            ) : (
              filteredUsers.map((user) => {
                const isSuperAdminUser = user.role === 'SUPER_ADMIN';
                const isSelf = currentUser?.uid === user.id;

                return (
                  <TableRow key={user.id} className="border-b border-white/[0.05] hover:bg-white/[0.035] transition-colors">
                    <TableCell className="font-medium text-[#FAF7F2]">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-white/[0.05] border border-white/[0.1] flex items-center justify-center font-mono font-bold text-[#FF6F00] text-xs backdrop-blur-md shadow-sm">
                          {user.name ? user.name.charAt(0).toUpperCase() : '?'}
                        </div>
                        <div>
                          <div className="font-bold">{user.name}</div>
                          {isSelf && <span className="text-[10px] font-mono text-[#1D9E75]">(You)</span>}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-sm text-[#8E857E]">{user.email}</TableCell>
                    <TableCell>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-mono font-medium border backdrop-blur-md ${
                        user.role === 'SUPER_ADMIN' 
                          ? 'bg-[#FF6F00]/10 text-[#FF6F00] border-[#FF6F00]/30'
                          : user.role === 'STORE_MANAGER'
                          ? 'bg-[#1D9E75]/10 text-[#1D9E75] border-[#1D9E75]/30'
                          : user.role === 'INVENTORY_CLERK'
                          ? 'bg-blue-500/10 text-blue-400 border-blue-500/30'
                          : 'bg-neutral-500/10 text-neutral-300 border-neutral-500/30'
                      }`}>
                        {user.role}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-mono font-medium ${
                        user.isActive !== false ? 'text-[#1D9E75]' : 'text-red-400'
                      }`}>
                        <span className={`w-1.5 h-1.5 rounded-full mr-1.5 ${
                          user.isActive !== false ? 'bg-[#1D9E75]' : 'bg-red-400'
                        }`} />
                        {user.isActive !== false ? 'ACTIVE' : 'DISABLED'}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openDialog(user)}
                          className="h-8 w-8 p-0 text-[#7A736E] hover:text-[#FAF7F2] hover:bg-[#3A3230]/40"
                          title="Edit User"
                        >
                          <Edit2 className="w-4 h-4" />
                        </Button>
                        
                        {!isSelf && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => toggleUserStatus(user)}
                            className="h-8 w-8 p-0 text-[#7A736E] hover:text-[#FAF7F2] hover:bg-[#3A3230]/40"
                            title={user.isActive !== false ? "Disable Account" : "Enable Account"}
                          >
                            {user.isActive !== false ? (
                              <UserX className="w-4 h-4 text-amber-500" />
                            ) : (
                              <UserCheck className="w-4 h-4 text-[#1D9E75]" />
                            )}
                          </Button>
                        )}

                        {!isSelf && !isSuperAdminUser && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setDeleteConfirmationUser(user)}
                            className="h-8 w-8 p-0 text-[#7A736E] hover:text-red-500 hover:bg-[#3A3230]/40"
                            title="Delete User"
                          >
                            <Trash2 className="w-4 h-4 text-red-500" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* User Form Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="bg-[#141210] border-[#3A3230] text-[#FAF7F2] max-w-md">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold">
              {editingUser ? 'Edit Staff Account' : 'Create Staff Account'}
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSave} className="space-y-4 pt-4">
            {formErrors.general && (
              <div className="p-3 bg-red-500/10 border border-red-500/30 rounded text-red-400 font-mono text-xs">
                {formErrors.general}
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-xs font-mono text-[#7A736E] uppercase">Full Name</label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Juan Dela Cruz"
                className={`bg-[#0A0C10] border-[#3A3230] text-[#FAF7F2] focus-visible:ring-[#FF6F00] ${
                  formErrors.name ? 'border-red-500' : ''
                }`}
              />
              {formErrors.name && (
                <p className="text-xs text-red-500 font-mono">{formErrors.name}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-mono text-[#7A736E] uppercase">Email Address</label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="cashier@automate.ph"
                disabled={!!editingUser}
                className={`bg-[#0A0C10] border-[#3A3230] text-[#FAF7F2] focus-visible:ring-[#FF6F00] ${
                  editingUser ? 'opacity-50 cursor-not-allowed' : ''
                } ${formErrors.email ? 'border-red-500' : ''}`}
              />
              {formErrors.email && (
                <p className="text-xs text-red-500 font-mono">{formErrors.email}</p>
              )}
            </div>

            {!editingUser && (
              <div className="space-y-1.5">
                <label className="text-xs font-mono text-[#7A736E] uppercase">Password</label>
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className={`bg-[#0A0C10] border-[#3A3230] text-[#FAF7F2] focus-visible:ring-[#FF6F00] ${
                    formErrors.password ? 'border-red-500' : ''
                  }`}
                />
                {formErrors.password && (
                  <p className="text-xs text-red-500 font-mono">{formErrors.password}</p>
                )}
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-xs font-mono text-[#7A736E] uppercase">System Role</label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className="w-full h-10 px-3 rounded-md bg-[#0A0C10] border border-[#3A3230] text-[#FAF7F2] font-mono text-sm focus:outline-none focus:ring-1 focus:ring-[#FF6F00]"
              >
                <option value="CASHIER">CASHIER (Point of Sale)</option>
                <option value="INVENTORY_CLERK">INVENTORY CLERK (Products & POs)</option>
                <option value="STORE_MANAGER">STORE MANAGER (Full Ops & Reports)</option>
                <option value="SUPER_ADMIN">SUPER ADMIN (Complete System Control)</option>
              </select>
            </div>

            {editingUser && (
              <div className="flex items-center justify-between pt-2">
                <label className="text-xs font-mono text-[#7A736E] uppercase">Account Active</label>
                <input
                  type="checkbox"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                  className="rounded border-[#3A3230] bg-[#0A0C10] text-[#FF6F00] focus:ring-[#FF6F00] w-4 h-4"
                />
              </div>
            )}

            <div className="flex justify-end gap-2 pt-4 border-t border-[#3A3230]">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsDialogOpen(false)}
                className="border-[#3A3230] text-[#FAF7F2] hover:bg-[#3A3230]/40"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isSubmitting}
                className="bg-[#FF6F00] hover:bg-[#FF6F00]/80 text-[#0A0C10] font-bold"
              >
                {isSubmitting ? 'Saving...' : editingUser ? 'Save Changes' : 'Create Account'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete User Confirmation */}
      <AlertDialog open={!!deleteConfirmationUser} onOpenChange={(open) => !open && setDeleteConfirmationUser(null)}>
        <AlertDialogContent className="bg-[#141210] border-[#3A3230] text-[#FAF7F2]">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-red-500 font-bold">Delete Staff Account</AlertDialogTitle>
            <AlertDialogDescription className="text-[#7A736E] font-mono text-sm">
              Are you sure you want to delete user "{deleteConfirmationUser?.name}" ({deleteConfirmationUser?.email})? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteConfirmationUser(null)}
              className="border-[#3A3230] text-[#FAF7F2]"
            >
              Cancel
            </Button>
            <Button
              onClick={handleDeleteUser}
              disabled={isSubmitting}
              className="bg-red-600 hover:bg-red-700 text-white font-bold"
            >
              {isSubmitting ? 'Deleting...' : 'Delete Account'}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
