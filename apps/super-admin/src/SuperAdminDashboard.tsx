
import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Building2, Users, TrendingUp, MessageSquare, Activity, Shield,
  ArrowUpRight, Globe, Zap, CheckCircle2, AlertTriangle, ChevronRight,
  Stethoscope,
} from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
} from 'recharts';
import { apiFetch } from './api';

const FADE = { initial: { opacity: 0, y: 14 }, animate: { opacity: 1, y: 0 } };

const MOCK_CLINICS = [
  { id: '1', name: 'Paws & Claws Veterinary', slug: 'paws-claws', plan: 'pro', status: 'active', convos: 248, revenue: '$4,920', city: 'Dubai' },
  { id: '2', name: 'Urban Animal Hospital', slug: 'urban-animal', plan: 'enterprise', status: 'active', convos: 531, revenue: '$12,400', city: 'Riyadh' },
  { id: '3', name: 'VetCare Express', slug: 'vetcare-express', plan: 'starter', status: 'active', convos: 89, revenue: '$1,780', city: 'Tunis' },
  { id: '4', name: 'Gentle Paws Clinic', slug: 'gentle-paws', plan: 'pro', status: 'trial', convos: 22, revenue: '$440', city: 'Cairo' },
];

const REVENUE_TREND = [
  { month: 'May', revenue: 8200 }, { month: 'Jun', revenue: 10400 },
  { month: 'Jul', revenue: 9800 },  { month: 'Aug', revenue: 12600 },
  { month: 'Sep', revenue: 14200 }, { month: 'Oct', revenue: 19540 },
];

const CHANNEL_MIX = [
  { name: 'WhatsApp', value: 64, color: '#25D366' },
  { name: 'Web Widget', value: 28, color: '#6366f1' },
  { name: 'Instagram', value: 8, color: '#E1306C' },
];

const PLAN_BADGE: Record<string, string> = {
  starter: 'bg-slate-100 text-slate-600',
  pro: 'bg-indigo-100 text-indigo-700',
  enterprise: 'bg-violet-100 text-violet-700',
};
const STATUS_BADGE: Record<string, string> = {
  active: 'bg-emerald-100 text-emerald-700',
  trial: 'bg-amber-100 text-amber-700',
  suspended: 'bg-red-100 text-red-600',
};

interface Clinic { id: string; name: string; slug: string; plan: string; status?: string; convos: number; revenue: string; city?: string; }

export function SuperAdminDashboard() {
  const [clinics, setClinics] = useState<Clinic[]>(MOCK_CLINICS);
  const [loading, setLoading] = useState(false);
  const now = new Date();
  const greeting = now.getHours() < 12 ? 'Good morning' : now.getHours() < 17 ? 'Good afternoon' : 'Good evening';

  useEffect(() => {
    setLoading(true);
    apiFetch<{ items?: Clinic[]; tenants?: Clinic[] }>('/api/platform/tenants?limit=50')
      .then(data => {
        const list = data.items ?? data.tenants ?? [];
        if (list.length > 0) setClinics(list.map((t, i) => ({
          ...t,
          convos: MOCK_CLINICS[i % MOCK_CLINICS.length]?.convos ?? 0,
          revenue: MOCK_CLINICS[i % MOCK_CLINICS.length]?.revenue ?? '$0',
        })));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const totalRevenue = REVENUE_TREND.reduce((s, d) => s + d.revenue, 0);

  return (
    <div className="flex-1 overflow-auto bg-slate-50 p-6 space-y-6">

      {/* Header */}
      <motion.div {...FADE} className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Shield className="w-4 h-4 text-violet-500" />
            <span className="text-xs font-bold text-violet-600 uppercase tracking-wider">Super Admin Console</span>
          </div>
          <h1 className="text-2xl font-extrabold text-slate-900">{greeting}, Platform Admin</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-xs font-bold text-emerald-700">All Systems Operational</span>
          </div>
        </div>
      </motion.div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { title: 'Active Clinics', value: clinics.filter(c => c.status !== 'suspended').length, icon: Building2, color: 'bg-indigo-50 text-indigo-600', delta: '+2 this month' },
          { title: 'Total Conversations', value: '18,492', icon: MessageSquare, color: 'bg-emerald-50 text-emerald-600', delta: '+34% vs last month' },
          { title: 'Platform Revenue', value: `$${(totalRevenue / 1000).toFixed(1)}k`, icon: TrendingUp, color: 'bg-violet-50 text-violet-600', delta: '+18% MoM' },
          { title: 'AI Agent Uptime', value: '99.98%', icon: Zap, color: 'bg-amber-50 text-amber-600', delta: 'Last 30 days' },
        ].map((kpi, i) => (
          <motion.div key={kpi.title} {...FADE} transition={{ delay: i * 0.05 }}
            className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 hover:shadow-md transition-shadow"
          >
            <div className="flex items-start justify-between mb-3">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{kpi.title}</p>
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${kpi.color}`}>
                <kpi.icon className="w-4.5 h-4.5" />
              </div>
            </div>
            <p className="text-2xl font-bold text-slate-900">{kpi.value}</p>
            <div className="flex items-center gap-1 mt-2 text-xs font-semibold text-emerald-600">
              <ArrowUpRight className="w-3.5 h-3.5" />
              <span>{kpi.delta}</span>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Main content */}
      <div className="grid lg:grid-cols-3 gap-6">

        {/* Clinics table */}
        <motion.div {...FADE} transition={{ delay: 0.1 }}
          className="lg:col-span-2 bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden"
        >
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <Building2 className="w-4 h-4 text-slate-400" />
              <h2 className="text-sm font-bold text-slate-900">Registered Clinics</h2>
            </div>
            <a href="/dashboard/tenants" className="text-xs font-semibold text-indigo-600 hover:text-indigo-700 flex items-center gap-1">
              Manage all <ChevronRight className="w-3.5 h-3.5" />
            </a>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-slate-50">
                  <th className="text-left px-5 py-2.5 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Clinic</th>
                  <th className="text-left px-5 py-2.5 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Plan</th>
                  <th className="text-left px-5 py-2.5 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Status</th>
                  <th className="text-left px-5 py-2.5 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Convos</th>
                  <th className="text-left px-5 py-2.5 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Revenue</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {clinics.map(clinic => (
                  <tr key={clinic.id} className="hover:bg-slate-50 transition-colors cursor-pointer">
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-xl bg-indigo-100 flex items-center justify-center flex-shrink-0">
                          <Stethoscope className="w-4 h-4 text-indigo-600" />
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-slate-900">{clinic.name}</p>
                          <p className="text-xs text-slate-400">{clinic.slug}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className={`px-2 py-0.5 rounded text-[11px] font-bold capitalize ${PLAN_BADGE[clinic.plan?.toLowerCase()] ?? 'bg-slate-100 text-slate-600'}`}>
                        {clinic.plan}
                      </span>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className={`px-2 py-0.5 rounded text-[11px] font-bold capitalize ${STATUS_BADGE[clinic.status?.toLowerCase() ?? 'active'] ?? 'bg-slate-100 text-slate-600'}`}>
                        {clinic.status ?? 'active'}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-sm text-slate-600">{clinic.convos.toLocaleString()}</td>
                    <td className="px-5 py-3.5 text-sm font-bold text-slate-900">{clinic.revenue}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </motion.div>

        {/* Charts */}
        <div className="space-y-5">
          {/* Revenue chart */}
          <motion.div {...FADE} transition={{ delay: 0.15 }}
            className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5"
          >
            <div className="flex items-start justify-between mb-1">
              <div>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Platform Revenue</p>
                <p className="text-xl font-bold text-slate-900 mt-0.5">${totalRevenue.toLocaleString()}</p>
                <div className="flex items-center gap-1 text-xs font-semibold text-emerald-600">
                  <ArrowUpRight className="w-3 h-3" /> +18% from last month
                </div>
              </div>
              <TrendingUp className="w-4 h-4 text-slate-300" />
            </div>
            <div className="mt-4">
              <ResponsiveContainer width="100%" height={90}>
                <AreaChart data={REVENUE_TREND} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
                  <defs>
                    <linearGradient id="superRevGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6366f1" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                  <YAxis hide />
                  <Tooltip contentStyle={{ background: '#1e293b', border: 'none', borderRadius: '10px', color: '#f8fafc', fontSize: 12 }} />
                  <Area type="monotone" dataKey="revenue" stroke="#6366f1" strokeWidth={2} fill="url(#superRevGrad)" dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </motion.div>

          {/* Channel mix */}
          <motion.div {...FADE} transition={{ delay: 0.2 }}
            className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5"
          >
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-4">Channel Mix</p>
            <div className="flex items-center gap-4">
              <ResponsiveContainer width={80} height={80}>
                <PieChart>
                  <Pie data={CHANNEL_MIX} cx="50%" cy="50%" innerRadius={24} outerRadius={38} paddingAngle={2} dataKey="value" strokeWidth={0}>
                    {CHANNEL_MIX.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="flex flex-col gap-2 flex-1">
                {CHANNEL_MIX.map(d => (
                  <div key={d.name} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full" style={{ background: d.color }} />
                      <span className="text-slate-600 font-medium">{d.name}</span>
                    </div>
                    <span className="font-bold text-slate-800">{d.value}%</span>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>

          {/* System status */}
          <motion.div {...FADE} transition={{ delay: 0.25 }}
            className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5"
          >
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">System Health</p>
            <div className="space-y-2">
              {[
                { service: 'API Server', status: 'operational', latency: '12ms' },
                { service: 'AI Agent', status: 'operational', latency: '340ms' },
                { service: 'WhatsApp', status: 'operational', latency: '—' },
                { service: 'Database', status: 'operational', latency: '4ms' },
              ].map(s => (
                <div key={s.service} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${s.status === 'operational' ? 'bg-emerald-500' : 'bg-red-500 animate-pulse'}`} />
                    <span className="text-xs text-slate-700 font-medium">{s.service}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-slate-400">{s.latency}</span>
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
