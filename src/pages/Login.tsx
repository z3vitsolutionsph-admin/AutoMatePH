import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Navigate } from 'react-router-dom';
import { Button } from '../components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { ShoppingCart, LogIn, UserPlus, Eye, EyeOff, ShieldCheck, UserCheck, Key, Zap } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'sonner';

export function Login() {
  const { user, signInWithGoogle, signIn, signUp, loading } = useAuth();
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [name, setName] = useState('');
  const role = 'STORE_MANAGER';
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [confirmPasswordError, setConfirmPasswordError] = useState('');
  const [nameError, setNameError] = useState('');

  React.useEffect(() => {
    setEmailError('');
    setPasswordError('');
    setConfirmPasswordError('');
    setNameError('');
    setEmail('');
    setPassword('');
    setConfirmPassword('');
    setName('');
  }, [isLogin]);

  if (loading) {
    return (
      <div className="min-h-screen w-full bg-[#0A0C10] flex flex-col items-center justify-center text-[#FAF7F2] font-mono gap-3 relative overflow-hidden">
        <div className="pointer-events-none absolute w-96 h-96 bg-[#FF6F00]/[0.08] rounded-full blur-[120px]" />
        <div className="w-9 h-9 border-2 border-[#FF6F00] border-t-transparent rounded-full animate-spin z-10"></div>
        <span className="text-xs font-mono uppercase tracking-widest text-[#8E857E] z-10">
          Loading Authorization...
        </span>
      </div>
    );
  }
  if (user) return <Navigate to="/" replace />;

  const handleGoogleSignIn = async () => {
    try {
      setIsLoading(true);
      await signInWithGoogle();
      toast.success('Successfully authenticated as System Administrator');
    } catch (error: any) {
      console.error(error);
      toast.error(error.message || 'Failed to sign in');
    } finally {
      setIsLoading(false);
    }
  };

  const handleQuickLogin = async (presetEmail: string, presetPass: string) => {
    try {
      setIsLoading(true);
      setEmail(presetEmail);
      setPassword(presetPass);
      await signIn(presetEmail, presetPass);
      toast.success(`Authenticated as ${presetEmail}`);
    } catch (error: any) {
      console.error(error);
      toast.error(error.message || 'Authentication failed');
    } finally {
      setIsLoading(false);
    }
  };

  const handleEmailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setEmail(val);
    if (!val) setEmailError('Email is required');
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) setEmailError('Please enter a valid email address');
    else setEmailError('');
  };

  const handlePasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setPassword(val);
    if (!val) setPasswordError('Password is required');
    else if (val.length < 6) setPasswordError('Password must be at least 6 characters long');
    else setPasswordError('');
    
    if (!isLogin && confirmPassword && val !== confirmPassword) {
      setConfirmPasswordError('Passwords do not match');
    } else if (!isLogin && confirmPassword && val === confirmPassword) {
      setConfirmPasswordError('');
    }
  };

  const handleConfirmPasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setConfirmPassword(val);
    if (!val) setConfirmPasswordError('Please confirm your password');
    else if (val !== password) setConfirmPasswordError('Passwords do not match');
    else setConfirmPasswordError('');
  };

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setName(val);
    if (!isLogin && !val.trim()) setNameError('Full Name is required for registration');
    else setNameError('');
  };

  const validateForm = () => {
    let isValid = true;
    
    if (!email) {
      setEmailError('Email is required');
      isValid = false;
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setEmailError('Please enter a valid email address');
      isValid = false;
    }

    if (!password) {
      setPasswordError('Password is required');
      isValid = false;
    } else if (password.length < 6) {
      setPasswordError('Password must be at least 6 characters long');
      isValid = false;
    }

    if (!isLogin) {
      if (!name.trim()) {
        setNameError('Full Name is required for registration');
        isValid = false;
      }

      if (!confirmPassword) {
        setConfirmPasswordError('Please confirm your password');
        isValid = false;
      } else if (confirmPassword !== password) {
        setConfirmPasswordError('Passwords do not match');
        isValid = false;
      }
    }

    if (!isValid) {
      toast.error('Please fix the errors in the form before submitting');
    }

    return isValid;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;

    try {
      setIsLoading(true);
      const cleanEmail = email.trim();
      const cleanName = name.trim();
      
      if (isLogin) {
        await signIn(cleanEmail, password);
        toast.success('Successfully logged in');
      } else {
        await signUp(cleanEmail, password, cleanName, role);
        toast.success('Successfully registered and logged in');
      }
    } catch (error: any) {
      console.error(error);
      const errorMessage = error.message || 'Authentication failed';
      toast.error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-[#0A0C10] flex items-center justify-center p-4 relative overflow-hidden font-sans">
      {/* Ambient Glassmorphic Background Orbs */}
      <div className="pointer-events-none absolute -top-40 -left-40 w-[500px] h-[500px] bg-[#FF6F00]/[0.08] rounded-full blur-[140px]" />
      <div className="pointer-events-none absolute -bottom-40 -right-40 w-[500px] h-[500px] bg-[#1D9E75]/[0.08] rounded-full blur-[140px]" />
      <div className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-[#FF6F00]/[0.04] rounded-full blur-[160px]" />

      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-md relative z-10"
      >
        {/* Frosted Glass Authorization Card */}
        <div className="bg-[#141210]/75 backdrop-blur-2xl border border-white/[0.12] text-[#FAF7F2] rounded-2xl shadow-[0_24px_64px_rgba(0,0,0,0.65),inset_0_1px_1px_rgba(255,255,255,0.15)] overflow-hidden relative">
          {/* Top Glass Specular Line */}
          <div className="h-1 bg-gradient-to-r from-[#FF6F00] via-[#FF8F00] to-[#1D9E75] shadow-[0_0_12px_rgba(255,111,0,0.4)]"></div>
          
          <div className="text-center space-y-2 pb-6 border-b border-white/[0.08] pt-8 px-6">
            <div className="mx-auto bg-gradient-to-br from-[#FF6F00]/20 to-[#FF6F00]/5 border border-[#FF6F00]/30 w-16 h-16 rounded-2xl flex items-center justify-center mb-3 shadow-[0_0_24px_rgba(255,111,0,0.25)] backdrop-blur-md">
              <ShoppingCart className="h-8 w-8 text-[#FF6F00]" />
            </div>
            <h1 className="text-2xl font-bold font-mono tracking-tight text-[#FAF7F2]">
              AUTOMATE<span className="text-[#FF6F00]">PH</span>
            </h1>
            <p className="text-[#8E857E] font-mono text-xs uppercase tracking-widest">
              Terminal Authorization Required
            </p>
          </div>
          
          <div className="p-6">
            {/* Glass Switcher Tabs */}
            <div className="flex p-1 bg-white/[0.03] backdrop-blur-md rounded-xl border border-white/[0.08] mb-6">
              <button
                type="button"
                className={`flex-1 py-2 text-xs font-bold uppercase tracking-wider transition-all duration-200 rounded-lg ${
                  isLogin 
                    ? 'bg-[#FF6F00]/15 text-[#FF6F00] shadow-[0_0_15px_rgba(255,111,0,0.15)] border border-[#FF6F00]/30 backdrop-blur-md' 
                    : 'text-[#8E857E] hover:text-[#FAF7F2]'
                }`}
                onClick={() => setIsLogin(true)}
              >
                Sign In
              </button>
              <button
                type="button"
                className={`flex-1 py-2 text-xs font-bold uppercase tracking-wider transition-all duration-200 rounded-lg ${
                  !isLogin 
                    ? 'bg-[#1D9E75]/15 text-[#1D9E75] shadow-[0_0_15px_rgba(29,158,117,0.15)] border border-[#1D9E75]/30 backdrop-blur-md' 
                    : 'text-[#8E857E] hover:text-[#FAF7F2]'
                }`}
                onClick={() => setIsLogin(false)}
              >
                Register
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <AnimatePresence mode="popLayout">
                {!isLogin && (
                  <motion.div
                    initial={{ opacity: 0, height: 0, y: -10 }}
                    animate={{ opacity: 1, height: 'auto', y: 0 }}
                    exit={{ opacity: 0, height: 0, y: -10 }}
                    className="space-y-4 overflow-hidden"
                  >
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-mono text-[#8E857E] uppercase tracking-wider">Full Name</label>
                      <Input
                        type="text"
                        placeholder="Juan Dela Cruz"
                        value={name}
                        onChange={handleNameChange}
                        disabled={isLoading}
                        className={`bg-white/[0.04] text-[#FAF7F2] font-mono focus-visible:ring-[#FF6F00] backdrop-blur-md ${nameError ? 'border-red-500 focus-visible:ring-red-500' : 'border-white/[0.08]'}`}
                      />
                      {nameError && (
                        <p className="text-red-400 text-[10px] font-mono mt-1">{nameError}</p>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="space-y-1.5">
                <label className="text-[10px] font-mono text-[#8E857E] uppercase tracking-wider">Email Address</label>
                <Input
                  type="email"
                  placeholder="admin@automate.ph"
                  value={email}
                  onChange={handleEmailChange}
                  disabled={isLoading}
                  className={`bg-white/[0.04] text-[#FAF7F2] font-mono focus-visible:ring-[#FF6F00] backdrop-blur-md ${emailError ? 'border-red-500 focus-visible:ring-red-500' : 'border-white/[0.08]'}`}
                />
                {emailError && (
                  <p className="text-red-400 text-[10px] font-mono mt-1">{emailError}</p>
                )}
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-mono text-[#8E857E] uppercase tracking-wider">Password</label>
                <div className="relative">
                  <Input
                    type={showPassword ? "text" : "password"}
                    placeholder="••••••••"
                    value={password}
                    onChange={handlePasswordChange}
                    disabled={isLoading}
                    className={`bg-white/[0.04] text-[#FAF7F2] font-mono pr-10 focus-visible:ring-[#FF6F00] backdrop-blur-md ${passwordError ? 'border-red-500 focus-visible:ring-red-500' : 'border-white/[0.08]'}`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8E857E] hover:text-[#FAF7F2] transition-colors"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {passwordError && (
                  <p className="text-red-400 text-[10px] font-mono mt-1">{passwordError}</p>
                )}
              </div>

              <AnimatePresence mode="popLayout">
                {!isLogin && (
                  <motion.div
                    initial={{ opacity: 0, height: 0, y: -10 }}
                    animate={{ opacity: 1, height: 'auto', y: 0 }}
                    exit={{ opacity: 0, height: 0, y: -10 }}
                    className="space-y-4 overflow-hidden"
                  >
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-mono text-[#8E857E] uppercase tracking-wider">Confirm Password</label>
                      <div className="relative">
                        <Input
                          type={showConfirmPassword ? "text" : "password"}
                          placeholder="••••••••"
                          value={confirmPassword}
                          onChange={handleConfirmPasswordChange}
                          disabled={isLoading}
                          className={`bg-white/[0.04] text-[#FAF7F2] font-mono pr-10 focus-visible:ring-[#FF6F00] backdrop-blur-md ${confirmPasswordError ? 'border-red-500 focus-visible:ring-red-500' : 'border-white/[0.08]'}`}
                        />
                        <button
                          type="button"
                          onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8E857E] hover:text-[#FAF7F2] transition-colors"
                        >
                          {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                      {confirmPasswordError && (
                        <p className="text-red-400 text-[10px] font-mono mt-1">{confirmPasswordError}</p>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <Button
                type="submit"
                disabled={isLoading}
                className={`w-full h-11 font-bold font-mono uppercase tracking-widest transition-all duration-200 rounded-xl shadow-lg mt-2 ${
                  isLogin 
                    ? 'bg-[#FF6F00] hover:bg-[#FF6F00]/90 text-[#0A0C10] shadow-[0_0_20px_rgba(255,111,0,0.3)]' 
                    : 'bg-[#1D9E75] hover:bg-[#1D9E75]/90 text-white shadow-[0_0_20px_rgba(29,158,117,0.3)]'
                }`}
              >
                {isLoading ? (
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin"></div>
                    PROCESSING...
                  </div>
                ) : isLogin ? (
                  <div className="flex items-center justify-center gap-2">
                    <LogIn className="w-4 h-4" />
                    AUTHORIZE ACCESS
                  </div>
                ) : (
                  <div className="flex items-center justify-center gap-2">
                    <UserPlus className="w-4 h-4" />
                    CREATE ACCOUNT
                  </div>
                )}
              </Button>
            </form>

            {/* Quick Demo Role Logins */}
            <div className="mt-6 pt-5 border-t border-white/[0.08]">
              <div className="flex items-center justify-between mb-2.5">
                <span className="text-[10px] font-mono uppercase tracking-widest text-[#8E857E] flex items-center gap-1">
                  <Zap className="w-3 h-3 text-[#FF6F00]" /> One-Click Role Access
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                <button
                  type="button"
                  onClick={() => handleQuickLogin('z3vitsolutions.ph@gmail.com', 'password123')}
                  className="px-2.5 py-2 rounded-lg bg-white/[0.03] hover:bg-[#FF6F00]/10 border border-white/[0.08] hover:border-[#FF6F00]/40 text-left transition-all backdrop-blur-md group"
                >
                  <div className="text-[10px] font-bold text-[#FF6F00] uppercase flex items-center justify-between">
                    <span>Super Admin</span>
                    <ShieldCheck className="w-3 h-3 opacity-60 group-hover:opacity-100" />
                  </div>
                  <span className="text-[9px] text-[#8E857E] truncate block">z3vitsolutions.ph</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleQuickLogin('manager@automate.ph', 'password123')}
                  className="px-2.5 py-2 rounded-lg bg-white/[0.03] hover:bg-[#1D9E75]/10 border border-white/[0.08] hover:border-[#1D9E75]/40 text-left transition-all backdrop-blur-md group"
                >
                  <div className="text-[10px] font-bold text-[#1D9E75] uppercase flex items-center justify-between">
                    <span>Store Manager</span>
                    <UserCheck className="w-3 h-3 opacity-60 group-hover:opacity-100" />
                  </div>
                  <span className="text-[9px] text-[#8E857E] truncate block">manager@automate.ph</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleQuickLogin('cashier@automate.ph', 'password123')}
                  className="px-2.5 py-2 rounded-lg bg-white/[0.03] hover:bg-white/[0.08] border border-white/[0.08] hover:border-white/[0.2] text-left transition-all backdrop-blur-md group"
                >
                  <div className="text-[10px] font-bold text-[#FAF7F2] uppercase flex items-center justify-between">
                    <span>POS Cashier</span>
                    <Key className="w-3 h-3 opacity-60 group-hover:opacity-100" />
                  </div>
                  <span className="text-[9px] text-[#8E857E] truncate block">cashier@automate.ph</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleQuickLogin('clerk@automate.ph', 'password123')}
                  className="px-2.5 py-2 rounded-lg bg-white/[0.03] hover:bg-white/[0.08] border border-white/[0.08] hover:border-white/[0.2] text-left transition-all backdrop-blur-md group"
                >
                  <div className="text-[10px] font-bold text-[#FAF7F2] uppercase flex items-center justify-between">
                    <span>Inventory Clerk</span>
                    <Key className="w-3 h-3 opacity-60 group-hover:opacity-100" />
                  </div>
                  <span className="text-[9px] text-[#8E857E] truncate block">clerk@automate.ph</span>
                </button>
              </div>
            </div>

            <div className="relative mt-6 mb-5">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-white/[0.08]"></div>
              </div>
              <div className="relative flex justify-center text-[10px] uppercase font-mono tracking-widest">
                <span className="bg-[#141210] px-3 text-[#8E857E]">OR ENTERPRISE LOGIN</span>
              </div>
            </div>

            <Button 
              type="button"
              onClick={handleGoogleSignIn} 
              disabled={isLoading}
              variant="outline"
              className="w-full bg-white/[0.03] hover:bg-white/[0.07] border-white/[0.1] text-[#FAF7F2] h-10 font-medium font-sans rounded-xl backdrop-blur-md transition-all"
            >
              <svg className="w-4 h-4 mr-2" viewBox="0 0 24 24">
                <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="#FFC107" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FF3D00" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                <path fill="#4CAF50" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
              </svg>
              Google Workspace
            </Button>
            
            <div className="mt-5 text-center">
              <p className="text-[10px] text-[#8E857E] font-mono tracking-widest uppercase">
                Secure Session • Realtime Cloud Synchronized
              </p>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
