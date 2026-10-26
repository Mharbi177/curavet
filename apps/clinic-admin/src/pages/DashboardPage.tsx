import React from 'react';
import { motion } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import {
  HeartPulse,
  ShieldAlert,
  Activity,
  Calendar,
  Users,
  MessageSquare,
  DollarSign,
  TrendingUp,
  Clock,
  CheckCircle2,
  AlertCircle,
  ArrowUpRight,
  ChevronRight,
} from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import { formatTime, formatDate, getInitials, cn } from '../lib/utils';
import { useCurrency } from '../hooks/useCurrency';
import { api } from '../lib/api';
import { useAuth } from '../hooks/useAuth';
import type { DashboardStats } from '../lib/types';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';

// ── Revenue sparkline data (placeholder) ─────────────────────────────────────
const REVENUE_DATA = [
  { day: 'Mon', revenue: 1800, bookings: 6 },
  { day: 'Tue', revenue: 2400, bookings: 9 },
  { day: 'Wed', revenue: 2100, bookings: 7 },
  { day: 'Thu', revenue: 3200, bookings: 12 },
  { day: 'Fri', revenue: 2800, bookings: 10 },
  { day: 'Sat', revenue: 4200, bookings: 15 },
  { day: 'Sun', revenue: 3600, bookings: 13 },
];

// ── Recent Inquiries (placeholder) ───────────────────────────────────────────
const RECENT_INQUIRIES = [
  { channel: 'whatsapp', name: 'Sarah (Buddy - Dog)', preview: 'Need to book Rabies & DHPP vaccine booster', time: '4 min ago', color: 'bg-emerald-100 text-emerald-800' },
  { channel: 'instagram', name: 'Michael (Luna - Cat)', preview: 'Is fasting required before dental cleaning on Thursday?', time: '15 min ago', color: 'bg-teal-100 text-teal-800' },
  { channel: 'whatsapp', name: 'Emma (Rocky - Pup)', preview: 'Are you open for microchipping this afternoon?', time: '38 min ago', color: 'bg-emerald-100 text-emerald-800' },
];

const RECENT_PATIENTS = [
  { name: 'Buddy', species: 'Golden Retriever', age: '3 yrs', weight: '32 kg', status: 'Vaccines Current', doctor: 'Dr. Sarah Mitchell, DVM', icon: '🐕' },
  { name: 'Luna', species: 'Domestic Shorthair', age: '2 yrs', weight: '4.2 kg', status: 'Dental Consult', doctor: 'Dr. Marcus Vance, DVM', icon: '🐈' },
  { name: 'Rocky', species: 'French Bulldog', age: '4 yrs', weight: '12 kg', status: 'Allergy Check', doctor: 'Dr. Sarah Mitchell, DVM', icon: '🐶' },
];

const STATUS_ICONS: Record<string, React.ReactNode> = {
  pending:   <Clock className="w-3 h-3" />,
  confirmed: <CheckCircle2 className="w-3 h-3" />,
  cancelled: <AlertCircle className="w-3 h-3" />,
  completed: <CheckCircle2 className="w-3 h-3" />,
};

function getStatusVariant(status: string): 'warning' | 'success' | 'destructive' | 'info' | 'default' {
  switch (status) {
    case 'pending': return 'warning';
    case 'confirmed': return 'success';
    case 'cancelled': return 'destructive';
    case 'completed': return 'info';
    default: return 'default';
  }
}

// ── Custom Tooltip for Recharts ───────────────────────────────────────────────
function RevenueTooltip({ active, payload, label, formatter }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-surface-elevated border border-border rounded-lg p-3 shadow-lg text-xs">
      <p className="font-semibold text-text-primary mb-1">{label}</p>
      <p className="text-text-muted">Revenue: <span className="font-medium text-text-primary">{formatter(payload[0]?.value)}</span></p>
      <p className="text-text-muted">Bookings: <span className="font-medium text-text-primary">{payload[1]?.value}</span></p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
export function DashboardPage() {
  const { tenant } = useAuth();
  const { formatCurrency } = useCurrency();

  const { data: stats, isLoading, error } = useQuery<DashboardStats>({
    queryKey: ['dashboard', 'stats', tenant?.id],
    queryFn: () => api.getDashboardStats(),
    enabled: !!tenant,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-10 w-10 border-[3px] border-brand border-t-transparent" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <AlertCircle className="w-10 h-10 text-danger mx-auto mb-3" />
        <p className="text-text-muted">Failed to load dashboard data</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">

      {/* ── Clinical Emergency Triage Status Banner ── */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-gradient-to-r from-emerald-950/80 via-slate-900 to-teal-950/80 border border-emerald-500/30 rounded-2xl p-4 shadow-lg flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
      >
        <div className="flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-400/30 flex items-center justify-center flex-shrink-0">
            <HeartPulse className="w-5 h-5 text-emerald-400 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-white tracking-wide">24/7 Veterinary AI Triage Active</h3>
              <span className="w-2 h-2 bg-emerald-400 rounded-full animate-ping" />
              <span className="text-[10px] uppercase font-bold px-2 py-0.5 bg-emerald-500/20 text-emerald-300 rounded-full">
                Normal Operational Level
              </span>
            </div>
            <p className="text-xs text-slate-300 mt-0.5">
              WhatsApp & Web bots actively triaging inquiries. 0 acute emergency escalations in the last 24 hours.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 self-end sm:self-auto">
          <span className="text-xs text-slate-400">Emergency Line:</span>
          <span className="text-xs font-mono font-bold text-emerald-300 bg-slate-900 px-2.5 py-1 rounded-lg border border-slate-700">
            {tenant?.emergencyPhone || '+1-800-CURA-VET'}
          </span>
        </div>
      </motion.div>

      {/* ── Metric cards ── */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="grid grid-cols-2 lg:grid-cols-4 gap-4"
      >
        <MetricCard
          title="Today's Patient Visits"
          value={stats?.todayBookings ?? 0}
          delta="+3 from yesterday"
          deltaPositive
          icon={Calendar}
          accent="brand"
        />
        <MetricCard
          title="New Pet Patients"
          value={stats?.newClientsThisMonth ?? 0}
          delta="+2 from yesterday"
          deltaPositive
          icon={Users}
          accent="info"
        />
        <MetricCard
          title="Today's Clinic Revenue"
          value={formatCurrency(stats?.todayRevenue ?? 0)}
          delta="+12% from yesterday"
          deltaPositive
          icon={DollarSign}
          accent="success"
        />
        <MetricCard
          title="Triage & Chat Inquiries"
          value={stats?.pendingBookings ?? 0}
          delta="Need attention"
          deltaPositive={false}
          icon={MessageSquare}
          accent="warning"
        />
      </motion.div>

      {/* ── Main grid: schedule + right panels ── */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">

        {/* ── Today's Schedule (2/3 width on xl) ── */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.1 }}
          className="xl:col-span-2"
        >
          <Card className="h-full">
            <CardHeader className="flex flex-row items-center justify-between border-b border-border pb-4">
              <div>
                <CardTitle>Today's Schedule</CardTitle>
                <CardDescription>{stats?.recentBookings?.length || 0} appointments today</CardDescription>
              </div>
              <a href="/calendar" className="text-xs font-semibold text-brand hover:underline flex items-center">
                View Calendar <ChevronRight className="ml-1 w-3.5 h-3.5" />
              </a>
            </CardHeader>
            <div className="divide-y divide-border">
              {!stats?.recentBookings?.length ? (
                <div className="p-12 text-center">
                  <Calendar className="w-10 h-10 text-text-muted/40 mx-auto mb-3" />
                  <p className="text-sm font-medium text-text-primary">No bookings scheduled for today</p>
                  <p className="text-xs text-text-muted mt-1">Enjoy your free day!</p>
                </div>
              ) : (
                stats.recentBookings.map((booking, index) => (
                  <motion.div
                    key={booking.id}
                    initial={{ opacity: 0, x: -12 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.15 + index * 0.04 }}
                    className="flex items-center gap-4 px-6 py-4 hover:bg-slate-50 transition-colors"
                  >
                    <div className="text-right w-16 flex-shrink-0">
                      <p className="text-sm font-semibold text-text-primary">{formatTime(booking.scheduledAt)}</p>
                    </div>

                    <div className="w-1 h-10 rounded-full bg-brand flex-shrink-0" />

                    <div className="w-9 h-9 rounded-full bg-brand/10 flex items-center justify-center flex-shrink-0">
                      <span className="text-xs font-bold text-brand">
                        {getInitials(booking.client.name || booking.client.phone)}
                      </span>
                    </div>

                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-text-primary truncate">{booking.service.nameEn}</p>
                      <p className="text-xs text-text-muted truncate">
                        {booking.client.name || booking.client.phone} <span className="mx-1">·</span> {booking.staff.name}
                      </p>
                    </div>

                    <Badge variant={getStatusVariant(booking.status)} className="gap-1.5 px-3">
                      {STATUS_ICONS[booking.status]}
                      {booking.status.charAt(0).toUpperCase() + booking.status.slice(1)}
                    </Badge>
                  </motion.div>
                ))
              )}
            </div>
          </Card>
        </motion.div>

        {/* ── Right column ── */}
        <div className="flex flex-col gap-6">

          {/* ── Revenue sparkline ── */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: 0.15 }}
          >
            <Card className="p-6 pb-2">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <p className="text-xs font-semibold text-text-muted uppercase tracking-wider">Weekly Revenue</p>
                  <p className="text-2xl font-bold text-text-primary mt-1">
                    {formatCurrency(REVENUE_DATA.reduce((s, d) => s + d.revenue, 0))}
                  </p>
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-success mt-1">
                    <ArrowUpRight className="w-3.5 h-3.5" /> +18% vs last week
                  </span>
                </div>
                <div className="w-10 h-10 rounded-xl bg-brand/10 flex items-center justify-center">
                  <TrendingUp className="w-5 h-5 text-brand" />
                </div>
              </div>
              <ResponsiveContainer width="100%" height={90}>
                <AreaChart data={REVENUE_DATA} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
                  <defs>
                    <linearGradient id="revenueGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--color-brand))" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="hsl(var(--color-brand))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--color-border))" vertical={false} />
                  <XAxis dataKey="day" tick={{ fontSize: 10, fill: 'hsl(var(--color-text-muted))' }} axisLine={false} tickLine={false} />
                  <YAxis hide />
                  <Tooltip content={<RevenueTooltip formatter={formatCurrency} />} />
                  <Area
                    type="monotone"
                    dataKey="revenue"
                    stroke="hsl(var(--color-brand))"
                    strokeWidth={3}
                    fill="url(#revenueGrad)"
                    dot={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </Card>
          </motion.div>

          {/* ── Recent Inquiries ── */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: 0.2 }}
          >
            <Card>
              <CardHeader className="flex flex-row items-center justify-between border-b border-border pb-4">
                <CardTitle className="text-sm">Recent Inquiries</CardTitle>
                <a href="/conversations" className="text-xs font-semibold text-brand hover:underline flex items-center">
                  View all <ChevronRight className="ml-1 w-3.5 h-3.5" />
                </a>
              </CardHeader>
              <div className="divide-y divide-border">
                {RECENT_INQUIRIES.map((inq, i) => (
                  <div key={i} className="flex items-start gap-3 px-6 py-4 hover:bg-slate-50 transition-colors cursor-pointer group">
                    <span className={cn('flex-shrink-0 text-[9px] font-extrabold px-1.5 py-0.5 rounded uppercase mt-0.5 tracking-wider', inq.color)}>
                      {inq.channel === 'whatsapp' ? 'WA' : 'IG'}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-text-primary truncate">{inq.name}</p>
                      <p className="text-xs text-text-muted truncate mt-0.5 group-hover:text-text-primary transition-colors">{inq.preview}</p>
                    </div>
                    <p className="text-[10px] font-medium text-text-muted flex-shrink-0">{inq.time}</p>
                  </div>
                ))}
              </div>
            </Card>
          </motion.div>
        </div>
      </div>

      {/* ── Quick Actions ── */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.3 }}
      >
        <h2 className="text-sm font-bold text-text-primary mb-4 uppercase tracking-wider">Quick Actions</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: 'New Patient Booking', icon: Calendar, href: '/calendar?new=true', accent: 'text-brand bg-brand/10 hover:bg-brand hover:text-white' },
            { label: 'Register Pet Owner', icon: Users, href: '/clients', accent: 'text-info bg-info/10 hover:bg-info hover:text-white' },
            { label: 'Broadcast Vaccine Recall', icon: MessageSquare, href: '/broadcast', accent: 'text-brand-strong bg-brand-strong/10 hover:bg-brand-strong hover:text-white' },
            { label: 'Clinical Analytics', icon: TrendingUp, href: '/analytics', accent: 'text-success bg-success/10 hover:bg-success hover:text-white' },
          ].map((action) => (
            <a
              key={action.label}
              href={action.href}
              className="group bg-surface border border-border rounded-xl p-5 hover:border-brand/30 hover:shadow-lg transition-all duration-300"
            >
              <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center mb-4 transition-colors', action.accent)}>
                <action.icon className="w-5 h-5" />
              </div>
              <p className="text-sm font-semibold text-text-primary">{action.label}</p>
            </a>
          ))}
        </div>
      </motion.div>
    </div>
  );
}

// ── MetricCard ────────────────────────────────────────────────────────────────
type AccentColor = 'brand' | 'info' | 'success' | 'warning';

const ACCENT_MAP: Record<AccentColor, { icon: string; bg: string; text: string }> = {
  brand:   { icon: 'text-brand', bg: 'bg-brand/10', text: 'text-brand' },
  info:    { icon: 'text-info', bg: 'bg-info/10', text: 'text-info' },
  success: { icon: 'text-success', bg: 'bg-success/10', text: 'text-success' },
  warning: { icon: 'text-warning', bg: 'bg-warning/10', text: 'text-warning' },
};

interface MetricCardProps {
  title: string;
  value: string | number;
  delta: string;
  deltaPositive: boolean;
  icon: React.ComponentType<{ className?: string }>;
  accent: AccentColor;
}

function MetricCard({ title, value, delta, deltaPositive, icon: Icon, accent }: MetricCardProps) {
  const { icon: iconCls, bg } = ACCENT_MAP[accent];
  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <p className="text-xs font-semibold text-text-muted tracking-wide">{title}</p>
          <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0', bg)}>
            <Icon className={cn('w-5 h-5', iconCls)} />
          </div>
        </div>
        <p className="text-2xl font-bold text-text-primary mt-3">{value}</p>
        <p className={cn('text-xs font-semibold mt-2 flex items-center gap-1', deltaPositive ? 'text-success' : 'text-warning')}>
          {deltaPositive ? <TrendingUp className="w-3.5 h-3.5" /> : null} {delta}
        </p>
      </CardContent>
    </Card>
  );
}

