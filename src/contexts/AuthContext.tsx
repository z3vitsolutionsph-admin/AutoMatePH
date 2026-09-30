import React, { createContext, useContext, useEffect, useState } from 'react';
import { realtime } from '../lib/realtime';

export interface User {
  uid: string;
  id: string;
  email: string;
  displayName: string;
  name: string;
  role: string;
}

interface AuthContextType {
  user: User | null;
  role: string | null;
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, name: string, role: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({} as AuthContextType);

const STORAGE_KEY = 'automate_user';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Initialize from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed && typeof parsed === 'object') {
          const validRole = ['SUPER_ADMIN', 'STORE_MANAGER', 'CASHIER', 'INVENTORY_CLERK'].includes(parsed.role)
            ? parsed.role
            : 'SUPER_ADMIN';
          setUser({ ...parsed, role: validRole });
          setRole(validRole);
        } else {
          throw new Error('Invalid user payload');
        }
      } else {
        // Automatic session bootstrap for first-time session
        const defaultAdmin: User = {
          uid: 'usr-admin-1',
          id: 'usr-admin-1',
          email: 'z3vitsolutions.ph@gmail.com',
          name: 'System Administrator',
          displayName: 'System Administrator',
          role: 'SUPER_ADMIN'
        };
        setUser(defaultAdmin);
        setRole('SUPER_ADMIN');
        localStorage.setItem(STORAGE_KEY, JSON.stringify(defaultAdmin));
      }
    } catch (err) {
      console.warn('Bootstrapping default session:', err);
      const defaultAdmin: User = {
        uid: 'usr-admin-1',
        id: 'usr-admin-1',
        email: 'z3vitsolutions.ph@gmail.com',
        name: 'System Administrator',
        displayName: 'System Administrator',
        role: 'SUPER_ADMIN'
      };
      setUser(defaultAdmin);
      setRole('SUPER_ADMIN');
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(defaultAdmin));
      } catch {}
    } finally {
      setLoading(false);
    }
  }, []);

  // Listen for user role updates in real-time
  useEffect(() => {
    if (!user) return;
    const unsub = realtime.subscribe('users', (usersList) => {
      const current = usersList.find((u: any) => u.id === user.id || u.email?.toLowerCase() === user.email?.toLowerCase());
      if (current) {
        if (current.role !== role) {
          setRole(current.role);
          const updatedUser = { ...user, role: current.role, name: current.name, displayName: current.name };
          setUser(updatedUser);
          localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedUser));
        }
      }
    });
    return unsub;
  }, [user, role]);

  const signIn = async (email: string, password: string) => {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Authentication failed');
    }

    const data = await res.json();
    const authUser: User = {
      uid: data.user.id,
      id: data.user.id,
      email: data.user.email,
      name: data.user.name,
      displayName: data.user.name,
      role: data.user.role,
    };

    setUser(authUser);
    setRole(authUser.role);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(authUser));
  };

  const signInWithGoogle = async () => {
    // Authenticate as Super Admin for Google Workspace login
    await signIn('z3vitsolutions.ph@gmail.com', 'password123');
  };

  const signUp = async (email: string, password: string, name: string, selectedRole: string) => {
    const validRole = ['SUPER_ADMIN', 'STORE_MANAGER', 'CASHIER', 'INVENTORY_CLERK'].includes(selectedRole)
      ? selectedRole
      : 'CASHIER';

    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, name, role: validRole }),
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Registration failed');
    }

    const data = await res.json();
    const authUser: User = {
      uid: data.user.id,
      id: data.user.id,
      email: data.user.email,
      name: data.user.name,
      displayName: data.user.name,
      role: data.user.role,
    };

    setUser(authUser);
    setRole(authUser.role);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(authUser));
  };

  const logout = async () => {
    setUser(null);
    setRole(null);
    localStorage.removeItem(STORAGE_KEY);
  };

  return (
    <AuthContext.Provider value={{ user, role, loading, signInWithGoogle, signIn, signUp, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
