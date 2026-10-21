
import React from 'react';
import { motion } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import {
  CalendarDays, Users, TrendingUp, MessageSquare, ArrowUpRight,
  Clock, CheckCircle2, AlertTriangle, Activity, ChevronRight, Stethoscope,
} from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { api } from '../lib/api';
import { useAuth } from '../hooks/useAuth';
import { AIChatPanel } from '../components/ai/AIChatPanel';
import { cn } from '../lib/utils';

const FADE_UP = { initial: { opacity: 0, y: 16 }, animate: { opacity: 1, y: 0 } };

function KpiCard({ title, value, delta, deltaPositive, icon: Icon, accent }: {
  title: string; value: string | number; delta: string; deltaPositive: boolean;
  icon: React.ComponentType<{ className?: string }>; accent: string;
}) {
  return (
    <motion.div {...FADE_UP} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between mb-3">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{title}</p>
        <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center', accent)}>
          <Icon className="w-4.5 h-4.5" />
        </div>
      </div>
      <p className="text-2xl font-bold text-slate-900">{value}</p>
      <div className={cn('flex items-center gap-1 mt-2 text-xs font-semibold', deltaPositive ? 'text-emerald-600' : 'text-amber-600')}>
        <ArrowUpRight className="w-3.5 h-3.5" />
        <span>{delta}</span>
      </div>
    </motion.div>
  );
}

export function AdminDashboardPage() {
  const { user, tenant } = useAuth();
  const { data: stats } = useQuery({ queryKey: ['dashboard'], queryFn: () => api.getDashboardStats(), retry: false });

  const today = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });

  const weekData = [
    { day: 'Mon', bookings: 12, revenue: 1840 }, { day: 'Tue', bookings: 18, revenue: 2620 },
    { day: 'Wed', bookings: 14, revenue: 2100 }, { day: 'Thu', bookings: 22, revenue: 3200 },
    { day: 'Fri', bookings: 19, revenue: 2850 }, { day: 'Sat', bookings: 27, revenue: 3900 },
    { day: 'Sun', bookings: 8, revenue: 1200 },
  ];

  const recentBookings = stats?.recentBookings?.slice(0, 5) ?? [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div {...FADE_UP} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">{today}</p>
          <h1 className="text-2xl font-extrabold text-slate-900">
            Good {new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 17 ? 'afternoon' : 'evening'}, {user?.name?.split(' ')[0] || 'Doctor'} 👋
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">{tenant?.name} · Practice Management Dashboard</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-xs font-bold text-emerald-700">AI Agent Active</span>
          </div>
        </div>
      </motion.div>

      {/* KPI Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { title: "Today's Appointments", value: stats?.todayBookings ?? '—', delta: '+3 vs yesterday', deltaPositive: true, icon: CalendarDays, accent: 'bg-indigo-100 text-indigo-600' },
          { title: 'Active Patients', value: stats?.newClientsThisMonth ?? '—', delta: '+12 this month', deltaPositive: true, icon: Users, accent: 'bg-emerald-100 text-emerald-600' },
          { title: "Today's Revenue", value: stats?.todayRevenue ? `$${stats.todayRevenue.toFixed(0)}` : '—', delta: '+8% vs avg', deltaPositive: true, icon: TrendingUp, accent: 'bg-violet-100 text-violet-600' },
          { title: 'Open Conversations', value: stats?.activeConversations ?? '—', delta: 'AI handling all', deltaPositive: true, icon: MessageSquare, accent: 'bg-sky-100 text-sky-600' },
        ].map((kpi, i) => (
          <motion.div key={kpi.title} {...FADE_UP} transition={{ delay: i * 0.05 }}>
            <KpiCard {...kpi} />
          </motion.div>
        ))}
      </div>

      {/* Main content + AI chat */}
      <div className="grid lg:grid-cols-3 gap-6">

        {/* Left 2/3 — chart + bookings */}
        <div className="lg:col-span-2 space-y-6">

          {/* Weekly bookings chart */}
          <motion.div {...FADE_UP} transition={{ delay: 0.15 }} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-sm font-bold text-slate-900">Weekly Appointment Volume</h2>
                <p className="text-xs text-slate-400 mt-0.5">Bookings and revenue trends</p>
              </div>
              <Activity className="w-4 h-4 text-slate-300" />
            </div>
            <ResponsiveContainer width="100%" height={160}>
              <AreaChart data={weekData} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="adminBookGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#059669" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#059669" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="day" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <YAxis hide />
                <Tooltip
                  contentStyle={{ background: '#1e293b', border: 'none', borderRadius: '12px', color: '#f8fafc', fontSize: 12 }}
                  itemStyle={{ color: '#6ee7b7' }}
                />
                <Area type="monotone" dataKey="bookings" stroke="#059669" strokeWidth={2.5} fill="url(#adminBookGrad)" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </motion.div>

          {/* Today's appointment list */}
          <motion.div {...FADE_UP} transition={{ delay: 0.2 }} className="bg-white rounded-2xl border border-slate-100 shadow-sm">
            <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <CalendarDays className="w-4 h-4 text-slate-400" />
                <h2 className="text-sm font-bold text-slate-900">Today's Appointments</h2>
              </div>
              <a href="/calendar" className="text-xs font-semibold text-emerald-600 hover:text-emerald-700 flex items-center gap-1">
                Full calendar <ChevronRight className="w-3.5 h-3.5" />
              </a>
            </div>
            <div className="divide-y divide-slate-50">
              {recentBookings.length === 0 ? (
                <div className="flex flex-col items-center py-10 gap-2">
                  <CalendarDays className="w-10 h-10 text-slate-200" />
                  <p className="text-sm text-slate-400">No appointments loaded yet</p>
                </div>
              ) : recentBookings.map((b) => (
                <div key={b.id} className="flex items-center gap-3 px-5 py-3.5 hover:bg-slate-50 transition-colors group cursor-pointer">
                  <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0">
                    <span className="text-xs font-bold text-emerald-700">
                      {(b.client?.name || '?')[0].toUpperCase()}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-900 truncate">{b.client?.name || 'Patient'}</p>
                    <p className="text-xs text-slate-400 truncate">{b.service?.nameEn} · Dr. {b.staff?.name}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-xs font-semibold text-slate-700">
                      {new Date(b.scheduledAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                    <span className={cn(
                      'text-[10px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wide',
                      b.status === 'confirmed' ? 'bg-emerald-100 text-emerald-700'
                        : b.status === 'completed' ? 'bg-slate-100 text-slate-500'
                        : 'bg-amber-100 text-amber-700'
                    )}>
                      {b.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>

          {/* Quick actions */}
          <motion.div {...FADE_UP} transition={{ delay: 0.25 }}>
            <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Quick Actions</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: 'New Appointment', href: '/calendar?new=1', icon: CalendarDays, color: 'bg-indigo-50 text-indigo-600 hover:bg-indigo-600 hover:text-white border-indigo-100' },
                { label: 'Add Patient', href: '/clients', icon: Users, color: 'bg-emerald-50 text-emerald-600 hover:bg-emerald-600 hover:text-white border-emerald-100' },
                { label: 'Send Reminder', href: '/broadcast', icon: MessageSquare, color: 'bg-violet-50 text-violet-600 hover:bg-violet-600 hover:text-white border-violet-100' },
                { label: 'View Analytics', href: '/analytics', icon: TrendingUp, color: 'bg-sky-50 text-sky-600 hover:bg-sky-600 hover:text-white border-sky-100' },
              ].map(a => (
                <a key={a.label} href={a.href}
                  className={cn('flex flex-col items-center gap-2.5 p-4 rounded-2xl border text-center transition-all duration-200 group cursor-pointer', a.color)}
                >
                  <a.icon className="w-5 h-5 transition-colors" />
                  <p className="text-xs font-semibold">{a.label}</p>
                </a>
              ))}
            </div>
          </motion.div>
        </div>

        {/* Right 1/3 — AI Chat */}
        <motion.div {...FADE_UP} transition={{ delay: 0.1 }} className="lg:col-span-1">
          <div className="flex items-center gap-2 mb-3">
            <Stethoscope className="w-4 h-4 text-emerald-600" />
            <h2 className="text-sm font-bold text-slate-900">Clinic AI Assistant</h2>
          </div>
          <AIChatPanel clinicName={tenant?.name} />
        </motion.div>
      </div>
    </div>
  );
}
