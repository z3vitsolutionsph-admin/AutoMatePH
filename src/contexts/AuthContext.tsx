import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, onAuthStateChanged, signOut, GoogleAuthProvider, signInWithPopup, createUserWithEmailAndPassword, signInWithEmailAndPassword } from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import { handleFirestoreError, OperationType } from '../lib/firestore-error';

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

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let unsubscribeUserDoc: (() => void) | null = null;
    const unsubscribeAuth = onAuthStateChanged(auth, async (firebaseUser) => {
      if (unsubscribeUserDoc) {
        unsubscribeUserDoc();
        unsubscribeUserDoc = null;
      }

      setUser(firebaseUser);
      if (firebaseUser) {
        try {
          const userDocRef = doc(db, 'users', firebaseUser.uid);
          unsubscribeUserDoc = onSnapshot(userDocRef, async (userDoc) => {
            if (userDoc.exists()) {
              setRole(userDoc.data().role);
              setLoading(false);
            } else {
              if (firebaseUser.email === 'z3vitsolutions.ph@gmail.com') {
                 await setDoc(userDocRef, {
                   email: firebaseUser.email,
                   name: firebaseUser.displayName || 'Admin',
                   role: 'SUPER_ADMIN',
                   createdAt: serverTimestamp(),
                   updatedAt: serverTimestamp(),
                   isActive: true,
                 });
              } else {
                 setRole(null); 
                 setLoading(false);
              }
            }
          }, (error) => {
             handleFirestoreError(error, OperationType.GET, `users/${firebaseUser.uid}`);
             setLoading(false);
          });
        } catch (error) {
           handleFirestoreError(error, OperationType.GET, `users/${firebaseUser.uid}`);
           setLoading(false);
        }
      } else {
        setRole(null);
        setLoading(false);
      }
    }, (error) => {
       handleFirestoreError(error, OperationType.GET, 'auth');
       setLoading(false);
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribeUserDoc) {
        unsubscribeUserDoc();
      }
    };
  }, []);

  const signInWithGoogle = async () => {
    const provider = new GoogleAuthProvider();
    await signInWithPopup(auth, provider);
  };

  const signIn = async (email: string, password: string) => {
    await signInWithEmailAndPassword(auth, email, password);
  };

  const signUp = async (email: string, password: string, name: string, selectedRole: string) => {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const firebaseUser = userCredential.user;
    
    const validRole = ['SUPER_ADMIN', 'STORE_MANAGER', 'CASHIER', 'INVENTORY_CLERK'].includes(selectedRole) ? selectedRole : 'CASHIER';

    const userDocRef = doc(db, 'users', firebaseUser.uid);
    await setDoc(userDocRef, {
      email: firebaseUser.email,
      name: name,
      role: validRole,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      isActive: true,
    });
    setRole(validRole);
  };

  const logout = async () => {
    await signOut(auth);
  };

  return (
    <AuthContext.Provider value={{ user, role, loading, signInWithGoogle, signIn, signUp, logout }}>
      {!loading && children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
