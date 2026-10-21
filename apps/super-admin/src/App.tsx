import React, { useEffect, useState } from 'react';
import {
  BrowserRouter as Router,
  Routes, Route, Link, useLocation, Navigate,
} from 'react-router-dom';
import {
  LayoutDashboard, CreditCard, BarChart2, MessageSquare,
  Settings, UserCircle, Building2, Sparkles, Loader2,
  TrendingUp, Users, ArrowUpRight, ChevronRight,
  MessageCircle, Globe,
} from 'lucide-react';
import { motion } from 'framer-motion';
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis,
  CartesianGrid, Tooltip, PieChart, Pie, Cell, Legend,
} from 'recharts';
import TenantsPage from './TenantsPage';
import BillingPage from './BillingPage';
import AnalyticsPage from './AnalyticsPage';
import ConversationsPage from './ConversationsPage';
import SettingsPage from './SettingsPage';
import LandingPage from './LandingPage';
import LoginPage from './LoginPage';
import { SuperAdminDashboard } from './SuperAdminDashboard';
import PrivacyPolicy from './PrivacyPolicy';
import TermsOfService from './TermsOfService';
import { API_BASE_URL, apiFetch, clearAuthToken, getAuthToken } from './api';

// ── Revenue sparkline data ────────────────────────────────────────────────────
const REVENUE_DATA = [
  { month: 'Jan', revenue: 8400 },
  { month: 'Feb', revenue: 9700 },
  { month: 'Mar', revenue: 8900 },
  { month: 'Apr', revenue: 11200 },
  { month: 'May', revenue: 10500 },
  { month: 'Jun', revenue: 11976 },
];

// ── Channel distribution ──────────────────────────────────────────────────────
const CHANNEL_DATA = [
  { name: 'WhatsApp', value: 62, color: '#22c55e' },
  { name: 'Instagram', value: 24, color: '#a855f7' },
  { name: 'Web',       value: 14, color: '#4F6EF7' },
];

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-slate-200 rounded-lg p-3 shadow-lg text-xs">
      <p className="font-semibold text-slate-800 mb-1">{label}</p>
      <p className="text-slate-500">
        Revenue: <span className="font-medium text-slate-800">AED {payload[0]?.value?.toLocaleString()}</span>
      </p>
    </div>
  );
}

// ── Sidebar ───────────────────────────────────────────────────────────────────
function Sidebar() {
  const location = useLocation();
  const isActive = (path: string) => location.pathname === path;

  const navItems = [
    { to: '/dashboard',               label: 'Dashboard',     icon: LayoutDashboard },
    { to: '/dashboard/tenants',       label: 'Tenants',       icon: Building2 },
    { to: '/dashboard/billing',       label: 'Billing',       icon: CreditCard },
    { to: '/dashboard/analytics',     label: 'Analytics',     icon: BarChart2 },
    { to: '/dashboard/conversations', label: 'Conversations', icon: MessageSquare },
    { to: '/dashboard/settings',      label: 'Settings',      icon: Settings },
  ];

  return (
    <div className="w-64 bg-sidebar text-slate-400 flex flex-col h-screen fixed left-0 top-0 border-r border-slate-800">
      {/* Logo */}
      <div className="p-5 flex items-center gap-3 border-b border-slate-800">
        <div className="bg-brand rounded-lg w-8 h-8 flex items-center justify-center shadow-md">
          <Sparkles className="w-4 h-4 text-white" />
        </div>
        <span className="text-lg font-bold text-white tracking-tight">CuraVet</span>
      </div>

      {/* Nav label */}
      <div className="px-5 pt-5 pb-2 text-[10px] font-semibold tracking-widest uppercase text-slate-600">
        Menu
      </div>

      {/* Nav links */}
      <nav className="flex-1 flex flex-col gap-0.5 px-3 overflow-y-auto scrollbar-hide">
        {navItems.map(({ to, label, icon: Icon }) => {
          const active = isActive(to);
          return (
            <Link
              key={to}
              to={to}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 ${
                active
                  ? 'bg-brand text-white shadow-sm'
                  : 'hover:bg-sidebarHover hover:text-white'
              }`}
            >
              <Icon className="w-[18px] h-[18px] flex-shrink-0" />
              {label}
              {active && <div className="ml-auto w-1.5 h-1.5 rounded-full bg-white/70" />}
            </Link>
          );
        })}
      </nav>

      {/* User footer */}
      <div className="p-4 border-t border-slate-800 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center">
            <UserCircle className="w-5 h-5 text-slate-400" />
          </div>
          <div>
            <p className="text-sm font-semibold text-white leading-tight">Admin</p>
            <p className="text-xs text-slate-500">Super Admin</p>
          </div>
        </div>
        <button
          onClick={() => { clearAuthToken(); window.location.href = '/login'; }}
          className="text-xs text-slate-500 hover:text-red-400 transition-colors font-medium"
        >
          Logout
        </button>
      </div>
    </div>
  );
}

// ── Stat card ─────────────────────────────────────────────────────────────────
function StatCard({
  title, value, subtext, subtextColor, icon: Icon, iconBg,
}: {
  title: string;
  value: string | number;
  subtext: string;
  subtextColor: string;
  icon: React.ComponentType<{ className?: string }>;
  iconBg: string;
}) {
  return (
    <div className="bg-white rounded-xl p-5 border border-slate-100 shadow-sm flex flex-col gap-2 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between">
        <p className="text-xs font-medium text-slate-500 leading-snug">{title}</p>
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${iconBg}`}>
          <Icon className="w-[18px] h-[18px]" />
        </div>
      </div>
      <p className="text-2xl font-bold text-slate-900 leading-none">{value}</p>
      <p className={`text-xs font-medium ${subtextColor}`}>{subtext}</p>
    </div>
  );
}

// ── Dashboard ─────────────────────────────────────────────────────────────────
function Dashboard() {
  interface TenantSummary {
    id: string; name: string; slug: string; plan: string;
    status: string; convos: string; revenue: string;
  }

  const [tenants, setTenants] = useState<TenantSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    apiFetch<TenantSummary[]>('/api/tenants')
      .then((data) => { setTenants(Array.isArray(data) ? data : []); setLoading(false); })
      .catch((err: Error) => { setError(err.message); setLoading(false); });
  }, []);

  const PLAN_BADGE: Record<string, string> = {
    pro:     'bg-indigo-100 text-indigo-700',
    starter: 'bg-sky-100 text-sky-700',
    agency:  'bg-violet-100 text-violet-700',
  };

  const STATUS_BADGE: Record<string, string> = {
    active:      'bg-emerald-100 text-emerald-700',
    'payment due': 'bg-amber-100 text-amber-700',
    inactive:    'bg-slate-100 text-slate-600',
  };

  return (
    <div className="ml-64 p-8 min-h-screen">
      {/* Page header */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8"
      >
        <h1 className="text-2xl font-bold text-slate-900">Overview</h1>
        <p className="text-slate-500 text-sm mt-0.5">Your salon AI platform at a glance</p>
      </motion.div>

      {/* ── Stat cards ── */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8"
      >
        <StatCard
          title="Total Salons" icon={Building2} iconBg="bg-indigo-50 text-indigo-600"
          value={loading ? '—' : tenants.length}
          subtext="↑ +20% this month" subtextColor="text-emerald-600"
        />
        <StatCard
          title="Monthly Revenue" icon={TrendingUp} iconBg="bg-emerald-50 text-emerald-600"
          value="AED 11,976"
          subtext="↑ +18% this month" subtextColor="text-emerald-600"
        />
        <StatCard
          title="Total Conversations" icon={MessageSquare} iconBg="bg-sky-50 text-sky-600"
          value="12,543"
          subtext="↑ +32% this month" subtextColor="text-emerald-600"
        />
        <StatCard
          title="Active Today" icon={Users} iconBg="bg-violet-50 text-violet-600"
          value="18"
          subtext="→ 75% of total" subtextColor="text-slate-500"
        />
      </motion.div>

      {/* ── Main content ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* ── Salons table ── */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="lg:col-span-2 bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden"
        >
          <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center">
            <h2 className="font-semibold text-slate-900 text-sm">Salons</h2>
            <Link
              to="/dashboard/tenants"
              className="flex items-center gap-1 text-brand text-xs font-medium hover:underline"
            >
              View all <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <table className="w-full text-left">
            <thead className="bg-slate-50 text-slate-500 text-xs">
              <tr>
                {['Name', 'Plan', 'Status', 'Conversations', 'Revenue'].map((h) => (
                  <th key={h} className="px-5 py-3 font-semibold tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-slate-500">
                    <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2 text-brand" />
                    <span className="text-sm">Fetching live salons…</span>
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td colSpan={5} className="px-6 py-10 text-center text-red-500 text-sm">
                    API error: {error}. Verify VITE_API_URL ({API_BASE_URL}).
                  </td>
                </tr>
              ) : tenants.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-10 text-center text-slate-500 text-sm">
                    No salons yet.{' '}
                    <Link to="/dashboard/tenants" className="text-brand underline">Add one →</Link>
                  </td>
                </tr>
              ) : (
                tenants.map((tenant) => (
                  <tr key={tenant.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className="w-7 h-7 rounded-md bg-brandLight text-brand flex items-center justify-center font-bold text-xs uppercase flex-shrink-0">
                          {tenant.name.charAt(0)}
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-slate-900 leading-tight">{tenant.name}</p>
                          <p className="text-xs text-slate-500">{tenant.slug}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className={`px-2 py-0.5 rounded text-[11px] font-semibold capitalize ${PLAN_BADGE[tenant.plan?.toLowerCase()] ?? 'bg-slate-100 text-slate-600'}`}>
                        {tenant.plan}
                      </span>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className={`px-2 py-0.5 rounded text-[11px] font-semibold capitalize ${STATUS_BADGE[tenant.status?.toLowerCase()] ?? 'bg-slate-100 text-slate-600'}`}>
                        {tenant.status}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-sm text-slate-600">{tenant.convos}</td>
                    <td className="px-5 py-3.5 text-sm font-semibold text-slate-900">{tenant.revenue}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </motion.div>

        {/* ── Right column: charts ── */}
        <div className="flex flex-col gap-6">

          {/* Revenue Growth */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="bg-white rounded-xl border border-slate-100 shadow-sm p-5"
          >
            <div className="flex items-start justify-between mb-1">
              <div>
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Revenue Growth</p>
                <p className="text-xl font-bold text-slate-900 mt-1">AED 11,976</p>
                <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600">
                  <ArrowUpRight className="w-3 h-3" /> +18% from last month
                </span>
              </div>
              <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center">
                <TrendingUp className="w-4 h-4 text-brand" />
              </div>
            </div>
            <div className="mt-4">
              <ResponsiveContainer width="100%" height={100}>
                <AreaChart data={REVENUE_DATA} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
                  <defs>
                    <linearGradient id="superRevGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#4F6EF7" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#4F6EF7" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                  <YAxis hide />
                  <Tooltip content={<CustomTooltip />} />
                  <Area
                    type="monotone" dataKey="revenue"
                    stroke="#4F6EF7" strokeWidth={2}
                    fill="url(#superRevGrad)" dot={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </motion.div>

          {/* Conversations by Channel donut */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="bg-white rounded-xl border border-slate-100 shadow-sm p-5"
          >
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-4">
              Conversations by Channel
            </p>
            <div className="flex items-center gap-4">
              <ResponsiveContainer width={100} height={100}>
                <PieChart>
                  <Pie
                    data={CHANNEL_DATA}
                    cx="50%" cy="50%"
                    innerRadius={30} outerRadius={48}
                    paddingAngle={2}
                    dataKey="value"
                    strokeWidth={0}
                  >
                    {CHANNEL_DATA.map((entry, index) => (
                      <Cell key={index} fill={entry.color} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="flex flex-col gap-2 flex-1">
                {CHANNEL_DATA.map((d) => {
                  const Icon = d.name === 'WhatsApp' ? MessageCircle : Globe;
                  return (
                    <div key={d.name} className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: d.color }} />
                        <span className="text-slate-600 font-medium">{d.name}</span>
                      </div>
                      <span className="font-semibold text-slate-800">{d.value}%</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}

// ── Auth layout ───────────────────────────────────────────────────────────────
function DashboardLayout() {
  const [authChecked, setAuthChecked] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    const token = getAuthToken();
    if (!token) { setAuthChecked(true); return; }
    apiFetch<{ user: unknown }>('/api/auth/me')
      .then(() => setIsAuthenticated(true))
      .catch(() => clearAuthToken())
      .finally(() => setAuthChecked(true));
  }, []);

  if (!authChecked) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="w-6 h-6 animate-spin text-brand" />
      </div>
    );
  }

  if (!isAuthenticated) return <Navigate to="/login" replace />;

  return (
    <div className="flex min-h-screen bg-slate-50">
      <Sidebar />
      <Routes>
        <Route path="/"               element={<SuperAdminDashboard />} />
        <Route path="/tenants"        element={<TenantsPage />} />
        <Route path="/billing"        element={<BillingPage />} />
        <Route path="/analytics"      element={<AnalyticsPage />} />
        <Route path="/conversations"  element={<ConversationsPage />} />
        <Route path="/settings"       element={<SettingsPage />} />
      </Routes>
    </div>
  );
}

// ── App ───────────────────────────────────────────────────────────────────────
function App() {
  return (
    <Router>
      <Routes>
        <Route path="/"           element={<LandingPage />} />
        <Route path="/login"      element={<LoginPage />} />
        <Route path="/privacy"    element={<PrivacyPolicy />} />
        <Route path="/terms"      element={<TermsOfService />} />
        <Route path="/dashboard/*" element={<DashboardLayout />} />
      </Routes>
    </Router>
  );
}

export default App;
