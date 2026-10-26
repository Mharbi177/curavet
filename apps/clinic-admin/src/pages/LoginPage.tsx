
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Eye, EyeOff, ArrowLeft, Loader2, Stethoscope, AlertCircle } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { setUser } from '../lib/auth';
import { cn } from '../lib/utils';

const schema = z.object({
  email: z.string().email('Enter a valid email'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  tenantSlug: z.string().optional(),
});
type FormData = z.infer<typeof schema>;

const FEATURES = [
  { label: 'AI Triage', desc: '24/7 emergency intake & booking' },
  { label: 'Patient CRM', desc: 'Pets, owners, full history' },
  { label: 'Smart Calendar', desc: 'Multi-vet scheduling' },
  { label: 'Auto Reminders', desc: 'Vaccine recalls & follow-ups' },
];

export function LoginPage() {
  const navigate = useNavigate();
  const { login, isLoginPending } = useAuth();
  const [showPwd, setShowPwd] = useState(false);
  const [error, setError] = useState('');

  const { register, handleSubmit, setValue, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { email: '', password: '', tenantSlug: '' },
  });

  const onSubmit = async (data: FormData) => {
    setError('');
    try {
      const result = await login({
        email: data.email,
        password: data.password,
        tenantSlug: data.tenantSlug || undefined,
      });
      if (result?.user) setUser(result.user);
      const role = result?.user?.role ?? '';
      if (role === 'super_admin') {
        window.location.href = `http://localhost:4001/dashboard?token=${encodeURIComponent(result.token)}`;
        return;
      }
      navigate(role === 'receptionist' ? '/my-workflow' : '/dashboard', { replace: true });
    } catch (e: any) {
      setError(e.message || 'Invalid credentials');
    }
  };

  return (
    <div className="min-h-screen flex">
      {/* Left panel — branding */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-slate-900 via-slate-800 to-emerald-950 flex-col p-12 relative overflow-hidden">
        {/* Glow */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl" />
          <div className="absolute bottom-0 right-0 w-80 h-80 bg-indigo-500/10 rounded-full blur-3xl translate-x-1/2 translate-y-1/3" />
        </div>

        <div className="relative z-10 flex-1 flex flex-col justify-between">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-600 flex items-center justify-center shadow-lg shadow-emerald-500/40">
              <Stethoscope className="w-5 h-5 text-white" />
            </div>
            <span className="font-bold text-xl text-white tracking-tight">CuraVet</span>
          </div>

          {/* Hero */}
          <div>
            <div className="inline-flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 rounded-full px-4 py-1.5 mb-6">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-xs font-semibold text-emerald-300">AI-Powered Veterinary Platform</span>
            </div>
            <h1 className="text-4xl font-extrabold text-white leading-tight mb-4">
              Your Clinic's 24/7<br />
              <span className="text-emerald-400">Intelligent Hub</span>
            </h1>
            <p className="text-slate-300 text-base leading-relaxed">
              Appointments, patients, AI triage, and team management — all in one clinical-grade platform.
            </p>

            <div className="grid grid-cols-2 gap-3 mt-8">
              {FEATURES.map(f => (
                <div key={f.label} className="bg-white/5 border border-white/10 rounded-xl p-4 backdrop-blur-sm">
                  <p className="text-emerald-400 text-xs font-bold uppercase tracking-wide">{f.label}</p>
                  <p className="text-slate-300 text-sm mt-1">{f.desc}</p>
                </div>
              ))}
            </div>
          </div>

          <p className="text-slate-500 text-xs">© 2025 CuraVet · Veterinary practice management software</p>
        </div>
      </div>

      {/* Right panel — form */}
      <div className="flex-1 flex items-center justify-center px-6 py-12 bg-slate-50">
        <a href="/" className="absolute top-6 left-6 inline-flex items-center gap-2 text-sm font-medium text-slate-400 hover:text-slate-700 transition-colors lg:hidden">
          <ArrowLeft className="w-4 h-4" /> Back
        </a>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md"
        >
          {/* Mobile logo */}
          <div className="flex items-center gap-3 mb-8 lg:hidden">
            <div className="w-9 h-9 rounded-xl bg-emerald-600 flex items-center justify-center">
              <Stethoscope className="w-5 h-5 text-white" />
            </div>
            <span className="text-xl font-bold text-slate-900">CuraVet</span>
          </div>

          <div className="mb-8">
            <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight">Clinic Portal</h2>
            <p className="text-slate-500 mt-2">Sign in to manage your practice and patients.</p>
          </div>

          {error && (
            <div className="flex items-start gap-3 bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl mb-6">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">Email address</label>
              <input
                type="email"
                {...register('email')}
                placeholder="you@yourclinic.com"
                autoComplete="email"
                className={cn(
                  'w-full px-4 py-3 bg-white border rounded-xl text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 transition-all shadow-sm',
                  errors.email ? 'border-red-300' : 'border-slate-200'
                )}
              />
              {errors.email && <p className="mt-1.5 text-xs text-red-500">{errors.email.message}</p>}
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">Password</label>
              <div className="relative">
                <input
                  type={showPwd ? 'text' : 'password'}
                  {...register('password')}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  className={cn(
                    'w-full px-4 py-3 pr-12 bg-white border rounded-xl text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 transition-all shadow-sm',
                    errors.password ? 'border-red-300' : 'border-slate-200'
                  )}
                />
                <button
                  type="button"
                  onClick={() => setShowPwd(!showPwd)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {errors.password && <p className="mt-1.5 text-xs text-red-500">{errors.password.message}</p>}
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                Clinic Slug <span className="text-slate-400 font-normal">(optional)</span>
              </label>
              <input
                type="text"
                {...register('tenantSlug')}
                placeholder="your-clinic-slug"
                className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 transition-all shadow-sm"
              />
              <p className="mt-1.5 text-xs text-slate-400">Leave blank to use your default clinic</p>
            </div>

            <button
              type="submit"
              disabled={isLoginPending}
              className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 disabled:cursor-not-allowed text-white font-bold py-3.5 rounded-xl transition-all shadow-md shadow-emerald-500/20 flex items-center justify-center gap-2 mt-1"
            >
              {isLoginPending && <Loader2 className="w-4 h-4 animate-spin" />}
              {isLoginPending ? 'Signing in...' : 'Sign In to CuraVet'}
            </button>
          </form>

          <div className="mt-8 pt-6 border-t border-slate-200">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide text-center mb-3">One-Click Role Demo Sign-In</p>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <button
                type="button"
                onClick={() => { setValue('email', 'admin@curavet.io'); setValue('password', 'ClinicAdmin123!'); }}
                className="p-2.5 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 font-medium transition-colors text-center"
              >
                Clinic Owner
              </button>
              <button
                type="button"
                onClick={() => { setValue('email', 'dr.marcus@curavet.io'); setValue('password', 'VetStaff123!'); }}
                className="p-2.5 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 font-medium transition-colors text-center"
              >
                Veterinarian Staff
              </button>
            </div>
            <p className="text-center text-xs text-slate-400 mt-4">
              <a href="http://localhost:4001" className="hover:text-emerald-600 transition-colors">
                ← Return to CuraVet Public Site & Super Admin
              </a>
            </p>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
