import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import {
  Calendar,
  DollarSign,
  Users,
  TrendingUp,
  BarChart2,
  Download,
  ArrowUpRight,
  ArrowDownRight,
  Sparkles,
  Scissors,
} from 'lucide-react';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  AreaChart,
  Area,
} from 'recharts';
import { api } from '../lib/api';
import { useAuth } from '../hooks/useAuth';
import { formatDate, cn } from '../lib/utils';
import { useCurrency } from '../hooks/useCurrency';
import { Card, CardContent } from '../components/ui/Card';
import { Button } from '../components/ui/Button';

interface AnalyticsData {
  overview: {
    totalBookings: number;
    totalRevenue: number;
    totalClients: number;
    avgBookingValue: number;
    bookingGrowth: number;
    revenueGrowth: number;
  };
  bookingsByDay: Array<{ date: string; count: number; revenue: number }>;
  bookingsByService: Array<{ service: string; count: number; revenue: number; color: string }>;
  bookingsByStaff: Array<{ staff: string; count: number; revenue: number }>;
  clientsByMonth: Array<{ month: string; new: number; returning: number }>;
  revenueByMonth: Array<{ month: string; revenue: number }>;
}

const BRAND_COLORS = {
  primary: 'hsl(var(--color-brand))',
  success: 'hsl(var(--color-success))',
  warning: 'hsl(var(--color-warning))',
  danger: 'hsl(var(--color-danger))',
  info: 'hsl(var(--color-info))',
};

const CHART_COLORS = [
  BRAND_COLORS.primary,
  '#a855f7', // purple-500
  '#ec4899', // pink-500
  '#f43f5e', // rose-500
  '#8b5cf6', // violet-500
  '#6366f1', // indigo-500
];

export function AnalyticsPage() {
  const { tenant } = useAuth();
  const { formatCurrency } = useCurrency();
  const [dateRange, setDateRange] = useState<'7d' | '30d' | '90d' | '1y'>('30d');

  const { data, isLoading, error } = useQuery({
    queryKey: ['analytics', tenant?.id, dateRange],
    queryFn: () => api.getAnalytics({ 
      startDate: getStartDate(dateRange),
      endDate: new Date().toISOString().split('T')[0],
    }),
    enabled: !!tenant,
  });

  const getStartDate = (range: string) => {
    const date = new Date();
    switch (range) {
      case '7d': date.setDate(date.getDate() - 7); break;
      case '30d': date.setDate(date.getDate() - 30); break;
      case '90d': date.setDate(date.getDate() - 90); break;
      case '1y': date.setFullYear(date.getFullYear() - 1); break;
    }
    return date.toISOString().split('T')[0];
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-brand border-t-transparent" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-text-muted">Failed to load analytics</p>
      </div>
    );
  }

  const analytics = data as AnalyticsData | undefined;
  const overview = analytics?.overview || {
    totalBookings: 0,
    totalRevenue: 0,
    totalClients: 0,
    avgBookingValue: 0,
    bookingGrowth: 0,
    revenueGrowth: 0,
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* ── Header ── */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col sm:flex-row sm:items-center justify-between gap-4"
      >
        <div>
          <h1 className="text-2xl font-bold text-text-primary flex items-center gap-2">
            Analytics <Sparkles className="w-5 h-5 text-brand" />
          </h1>
          <p className="text-sm text-text-muted mt-1">Business insights and performance metrics</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex border border-border rounded-xl p-1 bg-surface shadow-sm">
            {(['7d', '30d', '90d', '1y'] as const).map(range => (
              <button
                key={range}
                onClick={() => setDateRange(range)}
                className={cn(
                  'px-4 py-1.5 text-xs font-bold rounded-lg transition-all',
                  dateRange === range
                    ? 'bg-brand text-white shadow-sm shadow-brand/20'
                    : 'text-text-muted hover:text-text-primary hover:bg-slate-50'
                )}
              >
                {range === '7d' ? '7 Days' : range === '30d' ? '30 Days' : range === '90d' ? '90 Days' : '1 Year'}
              </button>
            ))}
          </div>
          <Button variant="secondary" className="gap-2 text-xs h-[36px]">
            <Download className="w-4 h-4" />
            <span className="hidden sm:inline">Export</span>
          </Button>
        </div>
      </motion.div>

      {/* ── Key Metrics ── */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"
      >
        <StatCard
          title="Total Bookings"
          value={overview.totalBookings.toLocaleString()}
          icon={Calendar}
          iconColor="text-brand"
          bgColor="bg-brand/10"
          trend={overview.bookingGrowth}
        />
        <StatCard
          title="Total Revenue"
          value={formatCurrency(overview.totalRevenue)}
          icon={DollarSign}
          iconColor="text-success"
          bgColor="bg-success/10"
          trend={overview.revenueGrowth}
        />
        <StatCard
          title="Active Clients"
          value={overview.totalClients.toLocaleString()}
          icon={Users}
          iconColor="text-info"
          bgColor="bg-info/10"
          subtitle="Unique clients this period"
        />
        <StatCard
          title="Avg Booking Value"
          value={formatCurrency(overview.avgBookingValue)}
          icon={TrendingUp}
          iconColor="text-warning"
          bgColor="bg-warning/10"
          subtitle="Per appointment"
        />
      </motion.div>

      {/* ── Main Charts ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Revenue & Bookings Over Time */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-surface border border-border rounded-2xl p-5 shadow-sm"
        >
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-sm font-bold text-text-primary uppercase tracking-wider">Bookings & Revenue</h2>
            <BarChart2 className="w-4 h-4 text-text-muted" />
          </div>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={analytics?.bookingsByDay || []} margin={{ top: 10, right: 0, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorBookings" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={BRAND_COLORS.primary} stopOpacity={0.3}/>
                    <stop offset="95%" stopColor={BRAND_COLORS.primary} stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={BRAND_COLORS.success} stopOpacity={0.3}/>
                    <stop offset="95%" stopColor={BRAND_COLORS.success} stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--color-border))" />
                <XAxis dataKey="date" tickFormatter={(v) => formatDate(v).split(',')[0]} axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: 'hsl(var(--color-text-muted))' }} dy={10} />
                <YAxis yAxisId="left" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: 'hsl(var(--color-text-muted))' }} />
                <YAxis yAxisId="right" orientation="right" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: 'hsl(var(--color-text-muted))' }} tickFormatter={(v) => `$${v}`} />
                <Tooltip
                  formatter={(value: number, name: string) => [name === 'count' ? value : formatCurrency(value), name === 'count' ? 'Bookings' : 'Revenue']}
                  contentStyle={{ backgroundColor: 'hsl(var(--color-surface))', border: '1px solid hsl(var(--color-border))', borderRadius: '12px', fontSize: '12px', fontWeight: 600, boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                  itemStyle={{ color: 'hsl(var(--color-text-primary))' }}
                />
                <Legend iconType="circle" wrapperStyle={{ fontSize: '12px', fontWeight: 600, paddingTop: '10px' }} />
                <Area type="monotone" dataKey="count" name="Bookings" stroke={BRAND_COLORS.primary} strokeWidth={3} fillOpacity={1} fill="url(#colorBookings)" yAxisId="left" />
                <Area type="monotone" dataKey="revenue" name="Revenue" stroke={BRAND_COLORS.success} strokeWidth={3} fillOpacity={1} fill="url(#colorRevenue)" yAxisId="right" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </motion.div>

        {/* Top Services */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-surface border border-border rounded-2xl p-5 shadow-sm"
        >
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-sm font-bold text-text-primary uppercase tracking-wider">Top Services</h2>
            <Scissors className="w-4 h-4 text-text-muted" />
          </div>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={analytics?.bookingsByService || []} layout="vertical" margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(var(--color-border))" />
                <XAxis type="number" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: 'hsl(var(--color-text-muted))' }} />
                <YAxis type="category" dataKey="service" width={100} axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: 'hsl(var(--color-text-primary))', fontWeight: 600 }} />
                <Tooltip
                  formatter={(value: number) => [value, 'Bookings']}
                  cursor={{ fill: 'hsl(var(--color-slate-50))' }}
                  contentStyle={{ backgroundColor: 'hsl(var(--color-surface))', border: '1px solid hsl(var(--color-border))', borderRadius: '12px', fontSize: '12px', fontWeight: 600 }}
                />
                <Bar dataKey="count" name="Bookings" radius={[0, 4, 4, 0]} barSize={24}>
                  {analytics?.bookingsByService?.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </motion.div>
      </div>

      {/* ── Secondary Charts ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Staff Performance */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="bg-surface border border-border rounded-2xl p-5 shadow-sm"
        >
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-sm font-bold text-text-primary uppercase tracking-wider">Staff Performance</h2>
            <Users className="w-4 h-4 text-text-muted" />
          </div>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={analytics?.bookingsByStaff || []} layout="vertical" margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(var(--color-border))" />
                <XAxis type="number" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: 'hsl(var(--color-text-muted))' }} />
                <YAxis type="category" dataKey="staff" width={80} axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: 'hsl(var(--color-text-primary))', fontWeight: 600 }} />
                <Tooltip
                  formatter={(value: number, name: string) => [name === 'count' ? value : formatCurrency(value), name === 'count' ? 'Bookings' : 'Revenue']}
                  cursor={{ fill: 'hsl(var(--color-slate-50))' }}
                  contentStyle={{ backgroundColor: 'hsl(var(--color-surface))', border: '1px solid hsl(var(--color-border))', borderRadius: '12px', fontSize: '12px', fontWeight: 600 }}
                />
                <Legend iconType="circle" wrapperStyle={{ fontSize: '12px', fontWeight: 600 }} />
                <Bar dataKey="count" name="Bookings" fill={BRAND_COLORS.primary} radius={[0, 4, 4, 0]} barSize={16} />
                <Bar dataKey="revenue" name="Revenue" fill={BRAND_COLORS.success} radius={[0, 4, 4, 0]} barSize={16} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </motion.div>

        {/* Client Growth */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="bg-surface border border-border rounded-2xl p-5 shadow-sm"
        >
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-sm font-bold text-text-primary uppercase tracking-wider">Client Growth</h2>
            <TrendingUp className="w-4 h-4 text-text-muted" />
          </div>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={analytics?.clientsByMonth || []} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--color-border))" />
                <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: 'hsl(var(--color-text-muted))' }} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: 'hsl(var(--color-text-muted))' }} />
                <Tooltip
                  contentStyle={{ backgroundColor: 'hsl(var(--color-surface))', border: '1px solid hsl(var(--color-border))', borderRadius: '12px', fontSize: '12px', fontWeight: 600, boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                />
                <Legend iconType="circle" wrapperStyle={{ fontSize: '12px', fontWeight: 600, paddingTop: '10px' }} />
                <Line type="monotone" dataKey="new" name="New Clients" stroke={BRAND_COLORS.primary} strokeWidth={3} dot={{ r: 4, strokeWidth: 2, fill: '#fff' }} activeDot={{ r: 6, strokeWidth: 0, fill: BRAND_COLORS.primary }} />
                <Line type="monotone" dataKey="returning" name="Returning Clients" stroke={BRAND_COLORS.info} strokeWidth={3} dot={{ r: 4, strokeWidth: 2, fill: '#fff' }} activeDot={{ r: 6, strokeWidth: 0, fill: BRAND_COLORS.info }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </motion.div>
      </div>
    </div>
  );
}

// ─── Stat Card Helper ──────────────────────────────────────────────────────────
function StatCard({ title, value, icon: Icon, iconColor, bgColor, trend, subtitle }: any) {
  const isPositive = trend !== undefined && trend >= 0;
  return (
    <div className="bg-surface border border-border rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden group">
      <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-bl from-slate-100 to-transparent rounded-full -mr-10 -mt-10 opacity-50 group-hover:scale-110 transition-transform duration-500" />
      <div className="flex items-start justify-between relative z-10">
        <div>
          <p className="text-xs font-bold text-text-muted uppercase tracking-wider">{title}</p>
          <p className="text-3xl font-bold text-text-primary mt-2 leading-none">{value}</p>
        </div>
        <div className={cn('w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0', bgColor)}>
          <Icon className={cn('w-6 h-6', iconColor)} />
        </div>
      </div>
      
      <div className="mt-4 relative z-10">
        {trend !== undefined ? (
          <div className="flex items-center gap-1.5">
            <div className={cn(
              'flex items-center gap-0.5 px-2 py-0.5 rounded-full text-xs font-bold',
              isPositive ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger'
            )}>
              {isPositive ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
              {Math.abs(trend)}%
            </div>
            <span className="text-xs font-medium text-text-muted">vs previous period</span>
          </div>
        ) : (
          <p className="text-xs font-medium text-text-muted flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-slate-300" />
            {subtitle}
          </p>
        )}
      </div>
    </div>
  );
}