/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { Layout } from './components/Layout';
import { Login } from './pages/Login';
import { POS } from './pages/POS';
import { Inventory } from './pages/Inventory';
import { Dashboard } from './pages/Dashboard';
import { ActivityLog } from './pages/ActivityLog';
import { UserManagement } from './pages/UserManagement';
import { Reports } from './pages/Reports';
import { Promotions } from './pages/Promotions';

const ProtectedRoute = ({ children, allowedRoles }: { children: React.ReactNode, allowedRoles?: string[] }) => {
  const { user, role, loading } = useAuth();
  if (loading) return <div className="h-screen w-screen bg-[#0A0C10] flex items-center justify-center text-[#7A736E] font-mono">LOADING...</div>;
  if (!user) return <Navigate to="/login" replace />;
  
  // If allowedRoles is provided, check if user has required role
  if (allowedRoles && role && !allowedRoles.includes(role)) {
    // Redirect to safe fallback depending on role
    if (role === 'CASHIER') return <Navigate to="/pos" replace />;
    if (role === 'INVENTORY_CLERK') return <Navigate to="/inventory" replace />;
    return <Navigate to="/" replace />;
  }
  
  return <>{children}</>;
};

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <Layout />
              </ProtectedRoute>
            }
          >
            <Route index element={
              <ProtectedRoute allowedRoles={['SUPER_ADMIN', 'STORE_MANAGER']}>
                <Dashboard />
              </ProtectedRoute>
            } />
            <Route path="pos" element={
              <ProtectedRoute allowedRoles={['SUPER_ADMIN', 'STORE_MANAGER', 'CASHIER']}>
                <POS />
              </ProtectedRoute>
            } />
            <Route path="inventory" element={
              <ProtectedRoute allowedRoles={['SUPER_ADMIN', 'STORE_MANAGER', 'INVENTORY_CLERK']}>
                <Inventory />
              </ProtectedRoute>
            } />
            <Route path="promotions" element={
              <ProtectedRoute allowedRoles={['SUPER_ADMIN', 'STORE_MANAGER']}>
                <Promotions />
              </ProtectedRoute>
            } />
            <Route path="activityLog" element={
              <ProtectedRoute allowedRoles={['SUPER_ADMIN', 'STORE_MANAGER']}>
                <ActivityLog />
              </ProtectedRoute>
            } />
            <Route path="reports" element={
              <ProtectedRoute allowedRoles={['SUPER_ADMIN', 'STORE_MANAGER']}>
                <Reports />
              </ProtectedRoute>
            } />
            <Route path="users" element={
              <ProtectedRoute allowedRoles={['SUPER_ADMIN']}>
                <UserManagement />
              </ProtectedRoute>
            } />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
