import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Stethoscope, Shield, Building2, Eye, EyeOff, Loader2, ArrowRight, CheckCircle2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { API_BASE_URL, setAuthToken } from './api';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [activePortalTab, setActivePortalTab] = useState<'all' | 'clinic' | 'admin'>('all');
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError('Please provide both your email and password.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      let csrfToken = '';
      try {
        const csrfRes = await fetch(`${API_BASE_URL}/api/csrf-token`, { credentials: 'include' });
        const csrfData = await csrfRes.json().catch(() => ({}));
        csrfToken = csrfData.csrfToken ?? '';
      } catch {
        // Non-fatal
      }

      const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...(csrfToken ? { 'x-csrf-token': csrfToken } : {}),
        },
        body: JSON.stringify({ email: email.trim(), password }),
      });

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        setError(data?.error || 'Invalid credentials. Please verify your email and password.');
        return;
      }

      const role = data.user?.role;
      const token = data.token;

      // 1. Super Admin Role
      if (role === 'super_admin') {
        setAuthToken(token);
        localStorage.setItem('curavet_super_auth', 'true');
        localStorage.setItem('curavet_user_name', data.user.name || 'Super Admin');
        navigate('/dashboard');
        return;
      }

      // 2. Clinic Owner / Admin Role -> Smart Route to Clinic Management
      if (role === 'salon_admin') {
        window.location.href = `http://localhost:4002/dashboard?token=${encodeURIComponent(token)}`;
        return;
      }

      // 3. Doctor / Medical Staff Role -> Smart Route to Medical Workflow
      if (role === 'staff') {
        window.location.href = `http://localhost:4002/my-workflow?token=${encodeURIComponent(token)}`;
        return;
      }

      // Fallback
      setError('Your account has an unassigned role. Contact platform support.');
    } catch {
      setError('Unable to reach CuraVet authentication service. Please ensure the backend is running.');
    } finally {
      setLoading(false);
    }
  };

  const autofillDemo = (role: 'admin' | 'doctor' | 'super') => {
    if (role === 'admin') {
      setEmail('admin@curavet.io');
      setPassword('ClinicAdmin123!');
    } else if (role === 'doctor') {
      setEmail('dr.marcus@curavet.io');
      setPassword('VetStaff123!');
    } else if (role === 'super') {
      setEmail('superadmin@curavet.io');
      setPassword('SuperAdmin123!');
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center px-4 relative overflow-hidden">
      {/* Background radial gradients */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[700px] h-[700px] bg-emerald-500/10 rounded-full blur-[120px]" />
        <div className="absolute bottom-10 right-10 w-[400px] h-[400px] bg-teal-500/10 rounded-full blur-[100px]" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="w-full max-w-lg relative z-10"
      >
        <div className="bg-slate-900/90 backdrop-blur-2xl border border-slate-800 rounded-3xl shadow-2xl p-8 lg:p-10">
          
          {/* Header & Logo */}
          <div className="text-center mb-7">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-500 shadow-xl shadow-emerald-500/20 mb-4">
              <Stethoscope className="w-7 h-7 text-white" />
            </div>
            <h1 className="text-2xl font-extrabold text-white tracking-tight">CuraVet Portal Access</h1>
            <p className="text-slate-400 mt-1.5 text-sm">
              Single sign-on for Clinic Owners, Veterinary Staff, and Platform Admins
            </p>
          </div>

          {/* Error notice */}
          <AnimatePresence>
            {error && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="bg-red-500/10 border border-red-500/30 text-red-400 text-xs sm:text-sm px-4 py-3 rounded-xl mb-6 flex items-start gap-2.5"
              >
                <span className="font-bold flex-shrink-0">!</span>
                <span>{error}</span>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Form */}
          <form onSubmit={handleLogin} className="flex flex-col gap-4">
            <div>
              <label htmlFor="email" className="block text-xs font-semibold text-slate-300 mb-1.5 uppercase tracking-wider">
                Email Address
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="doctor@curavet.io or admin@curavet.io"
                className="w-full px-4 py-3 bg-slate-950/70 border border-slate-700/80 rounded-xl text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500 transition-all shadow-inner"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label htmlFor="password" className="block text-xs font-semibold text-slate-300 uppercase tracking-wider">
                  Password
                </label>
              </div>
              <div className="relative">
                <input
                  id="password"
                  type={showPwd ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  className="w-full px-4 py-3 bg-slate-950/70 border border-slate-700/80 rounded-xl text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500 transition-all pr-12 shadow-inner"
                />
                <button
                  type="button"
                  onClick={() => setShowPwd(!showPwd)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
                >
                  {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold py-3.5 rounded-xl transition-all mt-2 shadow-lg shadow-emerald-600/25 flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed text-sm"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              {loading ? 'Authenticating & Routing...' : 'Sign In to My Portal'}
            </button>
          </form>

          {/* Quick Demo Pre-fills (Discrete, professional pill buttons) */}
          <div className="mt-7 pt-6 border-t border-slate-800/80">
            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider text-center mb-3">
              One-Click Role Demo Sign-In
            </p>
            <div className="grid grid-cols-3 gap-2 text-xs">
              <button
                type="button"
                onClick={() => autofillDemo('admin')}
                className="px-2.5 py-2 rounded-xl bg-slate-800/60 hover:bg-slate-800 border border-slate-700/60 text-slate-300 hover:text-white transition-all text-center flex flex-col items-center gap-1"
              >
                <Building2 className="w-3.5 h-3.5 text-emerald-400" />
                <span className="font-semibold text-[11px]">Clinic Owner</span>
              </button>

              <button
                type="button"
                onClick={() => autofillDemo('doctor')}
                className="px-2.5 py-2 rounded-xl bg-slate-800/60 hover:bg-slate-800 border border-slate-700/60 text-slate-300 hover:text-white transition-all text-center flex flex-col items-center gap-1"
              >
                <Stethoscope className="w-3.5 h-3.5 text-teal-400" />
                <span className="font-semibold text-[11px]">Veterinarian</span>
              </button>

              <button
                type="button"
                onClick={() => autofillDemo('super')}
                className="px-2.5 py-2 rounded-xl bg-slate-800/60 hover:bg-slate-800 border border-slate-700/60 text-slate-300 hover:text-white transition-all text-center flex flex-col items-center gap-1"
              >
                <Shield className="w-3.5 h-3.5 text-indigo-400" />
                <span className="font-semibold text-[11px]">Super Admin</span>
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between text-xs text-slate-500 mt-6 pt-4 border-t border-slate-800/50">
            <a href="/" className="hover:text-slate-300 transition-colors">
              ← Back to CuraVet Home
            </a>
            <a href="http://localhost:4002/login" className="text-emerald-400 hover:text-emerald-300 transition-colors font-medium flex items-center gap-1">
              Direct Clinic Portal <ArrowRight className="w-3 h-3" />
            </a>
          </div>

        </div>
      </motion.div>
    </div>
  );
}
