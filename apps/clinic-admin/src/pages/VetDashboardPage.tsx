
import React from 'react';
import { motion } from 'framer-motion';
import { useQuery, useMutation } from '@tanstack/react-query';
import {
  Stethoscope, Clock, CheckCircle2, AlertCircle, CalendarDays,
  ChevronRight, User, FileText, Activity, Loader2,
} from 'lucide-react';
import { format } from 'date-fns';
import { api } from '../lib/api';
import { useAuth } from '../hooks/useAuth';
import { AIChatPanel } from '../components/ai/AIChatPanel';
import { cn } from '../lib/utils';
import toast from 'react-hot-toast';

const FADE = { initial: { opacity: 0, y: 12 }, animate: { opacity: 1, y: 0 } };

const STATUS_STYLE: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-700 border-amber-200',
  confirmed: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  completed: 'bg-slate-100 text-slate-500 border-slate-200',
  cancelled: 'bg-red-100 text-red-600 border-red-200',
};

export function VetDashboardPage() {
  const { user, tenant } = useAuth();
  const today = new Date();

  const { data: bookings = [], isLoading, refetch } = useQuery({
    queryKey: ['vet-bookings-today'],
    queryFn: async () => {
      const all = await api.getBookings({ limit: 100 });
      const items = Array.isArray(all) ? all : (all as any).items ?? [];
      return items.filter((b: any) => {
        const d = new Date(b.scheduledAt);
        return d.toDateString() === today.toDateString();
      }).sort((a: any, b: any) =>
        new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime()
      );
    },
    retry: false,
  });

  const updateStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      api.updateBookingStatus(id, status),
    onSuccess: () => { toast.success('Appointment updated'); refetch(); },
    onError: () => toast.error('Failed to update'),
  });

  const pending = bookings.filter((b: any) => b.status === 'pending');
  const active = bookings.filter((b: any) => b.status === 'confirmed');
  const done = bookings.filter((b: any) => b.status === 'completed');
  const nextUp = pending[0];

  const greeting = today.getHours() < 12 ? 'Good morning' : today.getHours() < 17 ? 'Good afternoon' : 'Good evening';

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Header */}
      <motion.div {...FADE} className="flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="flex-1">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
            {format(today, 'EEEE, MMMM d')}
          </p>
          <h1 className="text-2xl font-extrabold text-slate-900">
            {greeting}, Dr. {user?.name?.split(' ').pop() || 'Doctor'} 👨‍⚕️
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">{tenant?.name} · Your daily patient rounds</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-xs font-bold text-emerald-700">On Duty</span>
          </div>
        </div>
      </motion.div>

      {/* Counters */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Remaining', count: pending.length, icon: Clock, color: 'text-amber-600', bg: 'bg-amber-50 border-amber-100' },
          { label: 'In Consultation', count: active.length, icon: Stethoscope, color: 'text-emerald-600', bg: 'bg-emerald-50 border-emerald-100' },
          { label: 'Completed', count: done.length, icon: CheckCircle2, color: 'text-slate-500', bg: 'bg-slate-50 border-slate-100' },
        ].map(({ label, count, icon: Icon, color, bg }) => (
          <motion.div key={label} {...FADE} className={cn('rounded-2xl border p-4 text-center', bg)}>
            <div className={cn('flex justify-center mb-1', color)}>
              <Icon className="w-5 h-5" />
            </div>
            <p className={cn('text-2xl font-extrabold', color)}>{count}</p>
            <p className="text-xs font-medium text-slate-500 mt-0.5">{label}</p>
          </motion.div>
        ))}
      </div>

      <div className="grid lg:grid-cols-3 gap-6">

        {/* Left: Patient queue */}
        <div className="lg:col-span-2 space-y-4">

          {isLoading ? (
            <div className="flex items-center justify-center h-40">
              <Loader2 className="w-6 h-6 animate-spin text-emerald-500" />
            </div>
          ) : bookings.length === 0 ? (
            <motion.div {...FADE} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-12 text-center">
              <CalendarDays className="w-12 h-12 text-slate-200 mx-auto mb-3" />
              <p className="font-bold text-slate-700">No appointments today</p>
              <p className="text-sm text-slate-400 mt-1">You're all clear — enjoy your day!</p>
            </motion.div>
          ) : (
            <>
              {/* Active case */}
              {active.length > 0 && active.map((b: any) => (
                <motion.div key={b.id} {...FADE} className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 shadow-sm">
                  <div className="flex items-center gap-1.5 mb-3">
                    <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    <p className="text-xs font-bold text-emerald-700 uppercase tracking-wide">In Consultation</p>
                  </div>
                  <PatientCard
                    booking={b}
                    actions={[
                      { label: 'Complete', variant: 'success', onClick: () => updateStatus.mutate({ id: b.id, status: 'completed' }) }
                    ]}
                  />
                </motion.div>
              ))}

              {/* Next patient */}
              {nextUp && active.length === 0 && (
                <motion.div {...FADE} className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-3">Next Patient</p>
                  <PatientCard
                    booking={nextUp}
                    actions={[
                      { label: 'Start Consultation', variant: 'primary', onClick: () => updateStatus.mutate({ id: nextUp.id, status: 'confirmed' }) }
                    ]}
                  />
                </motion.div>
              )}

              {/* Queue */}
              {pending.slice(active.length === 0 ? 1 : 0).length > 0 && (
                <motion.div {...FADE} className="bg-white rounded-2xl border border-slate-100 shadow-sm">
                  <div className="px-5 py-3 border-b border-slate-100">
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wide">Upcoming Queue</p>
                  </div>
                  <div className="divide-y divide-slate-50">
                    {pending.slice(active.length === 0 ? 1 : 0).map((b: any) => (
                      <div key={b.id} className="flex items-center gap-3 px-5 py-3.5 hover:bg-slate-50 transition-colors">
                        <p className="text-sm font-bold text-slate-400 w-12 flex-shrink-0">
                          {format(new Date(b.scheduledAt), 'HH:mm')}
                        </p>
                        <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-xs font-bold text-indigo-700 flex-shrink-0">
                          {(b.client?.name || '?')[0].toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-slate-800 truncate">{b.client?.name || 'Patient'}</p>
                          <p className="text-xs text-slate-400 truncate">{b.service?.nameEn}</p>
                        </div>
                        <ChevronRight className="w-4 h-4 text-slate-300" />
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}

              {/* Completed */}
              {done.length > 0 && (
                <motion.div {...FADE} className="bg-white rounded-2xl border border-slate-100 shadow-sm">
                  <div className="px-5 py-3 border-b border-slate-100">
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wide">Completed ({done.length})</p>
                  </div>
                  <div className="divide-y divide-slate-50">
                    {done.map((b: any) => (
                      <div key={b.id} className="flex items-center gap-3 px-5 py-3 opacity-60">
                        <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                        <p className="text-xs font-bold text-slate-400 w-12">{format(new Date(b.scheduledAt), 'HH:mm')}</p>
                        <p className="text-sm text-slate-600 flex-1 truncate">{b.client?.name}</p>
                        <p className="text-xs text-slate-400 truncate">{b.service?.nameEn}</p>
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}
            </>
          )}
        </div>

        {/* Right: AI Assistant */}
        <div className="lg:col-span-1">
          <div className="flex items-center gap-2 mb-3">
            <Activity className="w-4 h-4 text-emerald-600" />
            <h2 className="text-sm font-bold text-slate-900">AI Clinical Assistant</h2>
          </div>
          <AIChatPanel clinicName={tenant?.name} compact />
          <p className="text-[11px] text-slate-400 mt-2 text-center">
            Ask about patient history, drug interactions, or treatment protocols
          </p>
        </div>
      </div>
    </div>
  );
}

function PatientCard({ booking, actions }: {
  booking: any;
  actions: Array<{ label: string; variant: 'primary' | 'success'; onClick: () => void }>;
}) {
  return (
    <div>
      <div className="flex items-center gap-3 mb-3">
        <div className="w-10 h-10 rounded-2xl bg-indigo-100 flex items-center justify-center text-sm font-bold text-indigo-700 flex-shrink-0">
          {(booking.client?.name || '?')[0].toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-slate-900">{booking.client?.name || 'Patient'}</p>
          <p className="text-xs text-slate-500">{booking.service?.nameEn}</p>
        </div>
        <div className="text-right">
          <p className="text-sm font-bold text-slate-700">{format(new Date(booking.scheduledAt), 'HH:mm')}</p>
          <p className="text-[10px] text-slate-400">scheduled</p>
        </div>
      </div>
      {booking.notes && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 mb-3 flex items-start gap-2">
          <AlertCircle className="w-3.5 h-3.5 text-amber-500 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-amber-800">{booking.notes}</p>
        </div>
      )}
      <div className="flex gap-2">
        {actions.map(a => (
          <button
            key={a.label}
            onClick={a.onClick}
            className={cn(
              'flex-1 py-2 rounded-xl text-xs font-bold transition-colors',
              a.variant === 'primary' ? 'bg-indigo-600 text-white hover:bg-indigo-700'
                : 'bg-emerald-600 text-white hover:bg-emerald-700'
            )}
          >
            {a.label}
          </button>
        ))}
      </div>
    </div>
  );
}
