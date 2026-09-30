import { Router, Request, Response } from 'express';
import { serverDb } from '../db.js';
import { BroadcastFunction } from '../types.js';

export function createAuthRouter(broadcast: BroadcastFunction): Router {
  const router = Router();

  // Login
  router.post('/login', (req: Request, res: Response) => {
    const { email, password } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required' });

    const users = serverDb.getCollection('users');
    const user = users.find((u: any) => u.email.toLowerCase() === email.toLowerCase());

    // Automatic bootstrap for Super Admin
    if (email.toLowerCase() === 'z3vitsolutions.ph@gmail.com') {
      if (!user) {
        const adminUser = serverDb.insertDocument('users', {
          email: 'z3vitsolutions.ph@gmail.com',
          name: 'System Administrator',
          role: 'SUPER_ADMIN',
          password: password || 'password123',
          isActive: true,
        });
        return res.json({
          user: {
            id: adminUser.id,
            uid: adminUser.id,
            email: adminUser.email,
            name: adminUser.name,
            displayName: adminUser.name,
            role: adminUser.role,
          },
          token: `mock-jwt-token-${adminUser.id}`,
        });
      }
      return res.json({
        user: {
          id: user.id,
          uid: user.id,
          email: user.email,
          name: user.name,
          displayName: user.name,
          role: 'SUPER_ADMIN',
        },
        token: `mock-jwt-token-${user.id}`,
      });
    }

    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    if (user.password && user.password !== password) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    if (!user.isActive) {
      return res.status(403).json({ error: 'Account has been deactivated. Please contact an administrator.' });
    }

    res.json({
      user: {
        id: user.id,
        uid: user.id,
        email: user.email,
        name: user.name,
        displayName: user.name,
        role: user.role,
      },
      token: `mock-jwt-token-${user.id}`,
    });
  });

  // Register
  router.post('/register', (req: Request, res: Response) => {
    const { email, password, name, role } = req.body;
    if (!email || !password || !name) {
      return res.status(400).json({ error: 'Email, password, and name are required' });
    }

    const users = serverDb.getCollection('users');
    const existing = users.find((u: any) => u.email.toLowerCase() === email.toLowerCase());
    if (existing) {
      return res.status(400).json({ error: 'An account with this email already exists' });
    }

    const validRoles = ['SUPER_ADMIN', 'STORE_MANAGER', 'CASHIER', 'INVENTORY_CLERK'];
    const userRole = email.toLowerCase() === 'z3vitsolutions.ph@gmail.com'
      ? 'SUPER_ADMIN'
      : (validRoles.includes(role) ? role : 'CASHIER');

    const newUser = serverDb.insertDocument('users', {
      email: email.trim().toLowerCase(),
      password,
      name: name.trim(),
      role: userRole,
      isActive: true,
    });

    broadcast({
      type: 'sync',
      collection: 'users',
      action: 'create',
      data: newUser,
    });

    res.status(201).json({
      user: {
        id: newUser.id,
        uid: newUser.id,
        email: newUser.email,
        name: newUser.name,
        displayName: newUser.name,
        role: newUser.role,
      },
      token: `mock-jwt-token-${newUser.id}`,
    });
  });

  // Get Users (passwords stripped)
  router.get('/users', (req: Request, res: Response) => {
    const users = serverDb.getCollection('users').map((u: any) => {
      const { password, ...safe } = u;
      return safe;
    });
    res.json(users);
  });

  // Create User (Admin)
  router.post('/users', (req: Request, res: Response) => {
    const { email, password, name, role } = req.body;
    if (!email || !name) {
      return res.status(400).json({ error: 'Email and name are required' });
    }

    const users = serverDb.getCollection('users');
    const existing = users.find((u: any) => u.email.toLowerCase() === email.toLowerCase());
    if (existing) {
      return res.status(400).json({ error: 'A user with this email already exists' });
    }

    const newUser = serverDb.insertDocument('users', {
      email: email.trim().toLowerCase(),
      name: name.trim(),
      password: password || 'password123',
      role: role || 'CASHIER',
      isActive: true,
    });

    broadcast({
      type: 'sync',
      collection: 'users',
      action: 'create',
      data: newUser,
    });

    res.status(201).json(newUser);
  });

  // Update User
  router.put('/users/:id', (req: Request, res: Response) => {
    const updated = serverDb.updateDocument('users', req.params.id, req.body);
    if (!updated) return res.status(404).json({ error: 'User not found' });

    broadcast({
      type: 'sync',
      collection: 'users',
      action: 'update',
      data: updated,
      id: req.params.id,
    });

    res.json(updated);
  });

  // Delete User
  router.delete('/users/:id', (req: Request, res: Response) => {
    const success = serverDb.deleteDocument('users', req.params.id);
    if (!success) return res.status(404).json({ error: 'User not found' });

    broadcast({
      type: 'sync',
      collection: 'users',
      action: 'delete',
      id: req.params.id,
    });

    res.json({ success: true, id: req.params.id });
  });

  return router;
}
