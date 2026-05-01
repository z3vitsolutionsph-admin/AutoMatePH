import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Navigate } from 'react-router-dom';
import { Button } from '../components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { ShoppingCart, LogIn, UserPlus, Eye, EyeOff } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'sonner';

export function Login() {
  const { user, signInWithGoogle, signIn, signUp, loading } = useAuth();
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [name, setName] = useState('');
  // role defaults to STORE_MANAGER for public registration 
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

  if (loading) return null;
  if (user) return <Navigate to="/" replace />;

  const handleGoogleSignIn = async () => {
    try {
      setIsLoading(true);
      await signInWithGoogle();
      toast.success('Successfully authenticated');
    } catch (error: unknown) {
      console.error(error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to sign in with Google';
      toast.error(errorMessage);
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
    } catch (error: unknown) {
      console.error(error);
      const errorCode = (error as any)?.code || '';
      const message = (error as any)?.message || '';
      let errorMessage = message || 'Authentication failed';
      if (errorCode === 'auth/invalid-credential' || errorMessage.includes('invalid-credential')) {
        errorMessage = 'Invalid email or password';
        setEmailError('Invalid email or password');
        setPasswordError('Invalid email or password');
      } else if (errorCode.includes('auth/user-not-found') || errorCode.includes('auth/wrong-password') || errorMessage.includes('auth/user-not-found') || errorMessage.includes('auth/wrong-password')) {
        errorMessage = 'Invalid email or password';
        setEmailError('Invalid email or password');
        setPasswordError('Invalid email or password');
      } else if (errorCode === 'auth/email-already-in-use' || errorMessage.includes('email-already-in-use')) {
        errorMessage = 'An account with this email already exists';
        setEmailError('Email already in use');
      } else if (errorCode === 'auth/weak-password' || errorMessage.includes('weak-password')) {
        errorMessage = 'Password must be at least 6 characters';
        setPasswordError('Password too weak');
      }
      toast.error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0A0C10] flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.3, type: "spring", stiffness: 300, damping: 20 }}
        className="w-full max-w-md"
      >
        <Card className="bg-[#141210] border-[#3A3230] text-[#FAF7F2] shadow-2xl relative overflow-hidden">
          {/* Accent Line */}
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-[#FF6F00] to-[#1D9E75]"></div>
          
          <CardHeader className="text-center space-y-2 pb-6 border-b border-[#3A3230] pt-8">
            <div className="mx-auto bg-[#FF6F00]/10 w-16 h-16 rounded-full flex items-center justify-center mb-2 shadow-[0_0_15px_rgba(255,111,0,0.2)]">
              <ShoppingCart className="h-8 w-8 text-[#FF6F00]" />
            </div>
            <CardTitle className="text-2xl font-bold tracking-tight">AUTOMATE<span className="text-[#FF6F00]">PH</span></CardTitle>
            <CardDescription className="text-[#7A736E] font-mono text-xs uppercase tracking-widest">
              Terminal Authorization Required
            </CardDescription>
          </CardHeader>
          
          <CardContent className="pt-6">
            {/* Tabs */}
            <div className="flex p-1 bg-[#0A0C10] rounded-md border border-[#3A3230] mb-6">
              <button
                type="button"
                className={`flex-1 py-2 text-xs font-bold uppercase tracking-widest transition-colors rounded-sm ${isLogin ? 'bg-[#1A1614] text-[#FF6F00] shadow-sm border border-[#FF6F00]/30' : 'text-[#7A736E] hover:text-[#FAF7F2]'}`}
                onClick={() => setIsLogin(true)}
              >
                Sign In
              </button>
              <button
                type="button"
                className={`flex-1 py-2 text-xs font-bold uppercase tracking-widest transition-colors rounded-sm ${!isLogin ? 'bg-[#1A1614] text-[#1D9E75] shadow-sm border border-[#1D9E75]/30' : 'text-[#7A736E] hover:text-[#FAF7F2]'}`}
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
                      <label className="text-[10px] font-mono text-[#7A736E] uppercase tracking-wider">Full Name</label>
                      <Input
                        type="text"
                        placeholder="John Doe"
                        value={name}
                        onChange={handleNameChange}
                        disabled={isLoading}
                        className={`bg-[#0A0C10] text-[#FAF7F2] font-mono focus-visible:ring-[#FF6F00] ${nameError ? 'border-red-500 focus-visible:ring-red-500' : 'border-[#3A3230]'}`}
                      />
                      {nameError && (
                        <p className="text-red-500 text-[10px] font-mono mt-1 pr-1 truncate animate-in fade-in slide-in-from-top-1">{nameError}</p>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="space-y-1.5">
                <label className="text-[10px] font-mono text-[#7A736E] uppercase tracking-wider">Email Address</label>
                <Input
                  type="email"
                  placeholder="admin@automate.ph"
                  value={email}
                  onChange={handleEmailChange}
                  disabled={isLoading}
                  className={`bg-[#0A0C10] text-[#FAF7F2] font-mono focus-visible:ring-[#FF6F00] ${emailError ? 'border-red-500 focus-visible:ring-red-500' : 'border-[#3A3230]'}`}
                />
                {emailError && (
                  <p className="text-red-500 text-[10px] font-mono mt-1 pr-1 truncate animate-in fade-in slide-in-from-top-1">{emailError}</p>
                )}
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-mono text-[#7A736E] uppercase tracking-wider">Password</label>
                <div className="relative">
                  <Input
                    type={showPassword ? "text" : "password"}
                    placeholder="••••••••"
                    value={password}
                    onChange={handlePasswordChange}
                    disabled={isLoading}
                    className={`bg-[#0A0C10] text-[#FAF7F2] font-mono focus-visible:ring-[#FF6F00] pr-10 ${passwordError ? 'border-red-500 focus-visible:ring-red-500' : 'border-[#3A3230]'}`}
                  />
                  <button 
                    type="button" 
                    onClick={() => setShowPassword(!showPassword)}
                    disabled={isLoading}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[#7A736E] hover:text-[#FAF7F2] transition-colors disabled:opacity-50"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {passwordError && (
                  <p className="text-red-500 text-[10px] font-mono mt-1 pr-1 truncate animate-in fade-in slide-in-from-top-1">{passwordError}</p>
                )}
              </div>

              <AnimatePresence mode="popLayout">
                {!isLogin && (
                  <motion.div
                    initial={{ opacity: 0, height: 0, y: -10 }}
                    animate={{ opacity: 1, height: 'auto', y: 0 }}
                    exit={{ opacity: 0, height: 0, y: -10 }}
                    className="space-y-1.5 overflow-hidden"
                  >
                    <label className="text-[10px] font-mono text-[#7A736E] uppercase tracking-wider">Confirm Password</label>
                    <div className="relative">
                      <Input
                        type={showConfirmPassword ? "text" : "password"}
                        placeholder="••••••••"
                        value={confirmPassword}
                        onChange={handleConfirmPasswordChange}
                        disabled={isLoading}
                        className={`bg-[#0A0C10] text-[#FAF7F2] font-mono focus-visible:ring-[#FF6F00] pr-10 ${confirmPasswordError ? 'border-red-500 focus-visible:ring-red-500' : 'border-[#3A3230]'}`}
                      />
                      <button 
                        type="button" 
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        disabled={isLoading}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-[#7A736E] hover:text-[#FAF7F2] transition-colors disabled:opacity-50"
                      >
                        {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                    {confirmPasswordError && (
                      <p className="text-red-500 text-[10px] font-mono mt-1 pr-1 truncate animate-in fade-in slide-in-from-top-1">{confirmPasswordError}</p>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>

              <Button 
                type="submit" 
                disabled={isLoading}
                className={`w-full h-12 font-bold uppercase tracking-widest ${isLogin ? 'bg-[#FF6F00] hover:bg-[#FF6F00]/80 text-black' : 'bg-[#1D9E75] hover:bg-[#1D9E75]/80 text-white'}`}
              >
                {isLoading ? (
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin"></div>
                    PROCESSING...
                  </div>
                ) : isLogin ? (
                  <div className="flex items-center justify-center">
                    <LogIn className="w-4 h-4 mr-2" />
                    AUTHORIZE ACCESS
                  </div>
                ) : (
                  <div className="flex items-center justify-center">
                    <UserPlus className="w-4 h-4 mr-2" />
                    CREATE ACCOUNT
                  </div>
                )}
              </Button>
            </form>

            <div className="relative mt-6 mb-6">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-[#3A3230]"></div>
              </div>
              <div className="relative flex justify-center text-[10px] uppercase font-mono tracking-widest">
                <span className="bg-[#141210] px-2 text-[#7A736E]">OR CONTINUE WITH</span>
              </div>
            </div>

            <Button 
              type="button"
              onClick={handleGoogleSignIn} 
              disabled={isLoading}
              variant="outline"
              className="w-full bg-[#1A1614] border-[#3A3230] text-[#FAF7F2] hover:bg-[#3A3230]/50 h-10 font-medium font-sans"
            >
              <svg className="w-4 h-4 mr-2" viewBox="0 0 24 24">
                <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="#FFC107" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FF3D00" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                <path fill="#4CAF50" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
              </svg>
              Google Workspace
            </Button>
            
            <div className="mt-6 text-center">
              <p className="text-[10px] text-[#7A736E] font-mono tracking-widest">
                SECURE CONNECTION • 256-BIT ENCRYPTION
              </p>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
