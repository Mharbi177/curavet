import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Clock, User, CheckCircle2, Plus, FileText,
  ChevronRight, Loader2, AlertCircle, CalendarDays,
  Star, Scissors, ArrowRight,
} from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { api } from '../lib/api';
import { formatTime, getInitials, cn } from '../lib/utils';
import { useCurrency } from '../hooks/useCurrency';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import toast from 'react-hot-toast';

type AppointmentState = 'upcoming' | 'in_service' | 'completed';

function getTimeUntil(dateStr: string) {
  const diff = new Date(dateStr).getTime() - Date.now();
  const mins = Math.floor(diff / 60000);
  if (mins < 0) return 'Now';
  if (mins < 60) return `${mins} min`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

function AppointmentCard({
  booking,
  state,
  onStart,
  onComplete,
  onAddNote,
}: {
  booking: any;
  state: AppointmentState;
  onStart: () => void;
  onComplete: () => void;
  onAddNote: () => void;
}) {
  const { formatCurrency } = useCurrency();
  const isNext = state === 'upcoming';
  const isActive = state === 'in_service';

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        'rounded-2xl border p-5 transition-all',
        isActive
          ? 'border-brand/40 bg-brand/5 shadow-md shadow-brand/10'
          : 'border-border bg-surface shadow-sm'
      )}
    >
      {/* Time + Status */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className={cn(
            'w-10 h-10 rounded-xl flex items-center justify-center',
            isActive ? 'bg-brand text-white' : 'bg-slate-100 text-text-muted'
          )}>
            <Clock className="w-5 h-5" />
          </div>
          <div>
            <p className="font-bold text-text-primary text-lg leading-none">{formatTime(booking.scheduledAt)}</p>
            {isNext && (
              <p className="text-xs text-text-muted mt-0.5">
                In {getTimeUntil(booking.scheduledAt)}
              </p>
            )}
          </div>
        </div>
        <Badge variant={isActive ? 'default' : 'secondary'} className={isActive ? 'bg-brand' : ''}>
          {isActive ? 'In Service' : isNext ? 'Upcoming' : 'Done'}
        </Badge>
      </div>

      {/* Client */}
      <div className="flex items-center gap-3 mb-4 p-3 rounded-xl bg-white border border-border">
        <div className="w-10 h-10 rounded-full bg-brand/10 flex items-center justify-center font-bold text-brand flex-shrink-0">
          {getInitials(booking.client?.name || booking.client?.phone || '?')}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-text-primary truncate">
            {booking.client?.name || 'Unnamed Client'}
          </p>
          <p className="text-xs text-text-muted truncate">{booking.client?.phone}</p>
        </div>
        {booking.client?.visitCount > 3 && (
          <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-amber-50 border border-amber-200">
            <Star className="w-3 h-3 text-amber-500 fill-amber-500" />
            <span className="text-xs font-bold text-amber-600">VIP</span>
          </div>
        )}
      </div>

      {/* Service */}
      <div className="flex items-center gap-3 mb-4">
        <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0">
          <Scissors className="w-4 h-4 text-text-muted" />
        </div>
        <div className="flex-1">
          <p className="font-semibold text-text-primary">{booking.service?.nameEn}</p>
          <p className="text-xs text-text-muted">
            {booking.service?.durationMinutes} min · {formatCurrency(booking.service?.price || 0)}
          </p>
        </div>
      </div>

      {/* Client notes */}
      {booking.notes && (
        <div className="mb-4 p-3 rounded-xl bg-amber-50 border border-amber-100">
          <p className="text-xs font-bold text-amber-700 mb-1 uppercase tracking-wider">Client Notes</p>
          <p className="text-sm text-amber-800">{booking.notes}</p>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2">
        {isNext && (
          <Button onClick={onStart} className="flex-1 gap-2">
            <ArrowRight className="w-4 h-4" />
            Start Service
          </Button>
        )}
        {isActive && (
          <>
            <Button onClick={onAddNote} variant="secondary" size="sm" className="gap-1.5">
              <FileText className="w-3.5 h-3.5" />
              Add Note
            </Button>
            <Button onClick={onComplete} className="flex-1 gap-2">
              <CheckCircle2 className="w-4 h-4" />
              Complete Service
            </Button>
          </>
        )}
      </div>
    </motion.div>
  );
}

// ─── Staff Dashboard Page ─────────────────────────────────────────────────────
export function StaffWorkflowPage() {
  const { user, tenant } = useAuth();
  const queryClient = useQueryClient();
  const [activeBookingId, setActiveBookingId] = useState<string | null>(null);
  const [noteModal, setNoteModal] = useState<{ open: boolean; bookingId: string | null }>({ open: false, bookingId: null });
  const [noteText, setNoteText] = useState('');

  const { data: staffBookings, isLoading } = useQuery({
    queryKey: ['staff-bookings', tenant?.id],
    queryFn: () => {
      const today = new Date().toISOString().split('T')[0];
      return api.getBookings({ startDate: today, endDate: today });
    },
    enabled: !!tenant,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const updateStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      api.updateBooking(id, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['staff-bookings', tenant?.id] });
      toast.success('Appointment updated');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const handleStartService = (bookingId: string) => {
    setActiveBookingId(bookingId);
    updateStatusMutation.mutate({ id: bookingId, status: 'confirmed' });
  };

  const handleCompleteService = (bookingId: string) => {
    updateStatusMutation.mutate({ id: bookingId, status: 'completed' });
    setActiveBookingId(null);
  };

  const now = new Date();
  const todayBookings = (staffBookings ?? []).filter(b => {
    const d = new Date(b.scheduledAt);
    return d.toDateString() === now.toDateString();
  }).sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime());

  const activeBooking = todayBookings.find(b => b.id === activeBookingId || b.status === 'confirmed');
  const upcomingBookings = todayBookings.filter(b => b.status === 'pending' && b.id !== activeBooking?.id);
  const completedBookings = todayBookings.filter(b => b.status === 'completed');

  const nextBooking = upcomingBookings[0];

  return (
    <div className="space-y-6 max-w-2xl mx-auto">

      {/* ── Top summary ── */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="grid grid-cols-3 gap-3"
      >
        {[
          { label: 'Remaining', value: upcomingBookings.length, color: 'text-brand', bg: 'bg-brand/10' },
          { label: 'In Service', value: activeBooking ? 1 : 0, color: 'text-success', bg: 'bg-success/10' },
          { label: 'Completed', value: completedBookings.length, color: 'text-text-muted', bg: 'bg-slate-100' },
        ].map(({ label, value, color, bg }) => (
          <Card key={label} className="text-center p-4">
            <p className={cn('text-2xl font-bold', color)}>{value}</p>
            <p className="text-xs font-medium text-text-muted mt-1">{label}</p>
          </Card>
        ))}
      </motion.div>

      {isLoading ? (
        <div className="flex items-center justify-center h-40">
          <Loader2 className="w-8 h-8 animate-spin text-brand" />
        </div>
      ) : todayBookings.length === 0 ? (
        <Card className="text-center py-16">
          <CardContent>
            <CalendarDays className="w-14 h-14 text-text-muted/30 mx-auto mb-4" />
            <p className="font-bold text-text-primary text-lg">No appointments today</p>
            <p className="text-sm text-text-muted mt-2">You're all clear!</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {/* Active service */}
          {activeBooking && (
            <div>
              <p className="text-xs font-bold text-brand uppercase tracking-wider mb-3">Currently In Service</p>
              <AppointmentCard
                booking={activeBooking}
                state="in_service"
                onStart={() => handleStartService(activeBooking.id)}
                onComplete={() => handleCompleteService(activeBooking.id)}
                onAddNote={() => setNoteModal({ open: true, bookingId: activeBooking.id })}
              />
            </div>
          )}

          {/* Next client */}
          {nextBooking && !activeBooking && (
            <div>
              <p className="text-xs font-bold text-text-muted uppercase tracking-wider mb-3">Next Client</p>
              <AppointmentCard
                booking={nextBooking}
                state="upcoming"
                onStart={() => handleStartService(nextBooking.id)}
                onComplete={() => handleCompleteService(nextBooking.id)}
                onAddNote={() => setNoteModal({ open: true, bookingId: nextBooking.id })}
              />
            </div>
          )}

          {/* Remaining queue */}
          {upcomingBookings.slice(nextBooking && !activeBooking ? 1 : 0).length > 0 && (
            <div>
              <p className="text-xs font-bold text-text-muted uppercase tracking-wider mb-3">Later Today</p>
              <div className="space-y-3">
                {upcomingBookings.slice(nextBooking && !activeBooking ? 1 : 0).map(booking => (
                  <div key={booking.id} className="flex items-center gap-3 p-4 rounded-xl border border-border bg-surface">
                    <p className="text-sm font-bold text-text-primary w-14 flex-shrink-0">{formatTime(booking.scheduledAt)}</p>
                    <div className="w-8 h-8 rounded-full bg-brand/10 flex items-center justify-center text-xs font-bold text-brand flex-shrink-0">
                      {getInitials(booking.client?.name || '?')}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-text-primary truncate">{booking.client?.name || 'Client'}</p>
                      <p className="text-xs text-text-muted truncate">{booking.service?.nameEn}</p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-text-muted flex-shrink-0" />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Completed */}
          {completedBookings.length > 0 && (
            <div>
              <p className="text-xs font-bold text-text-muted uppercase tracking-wider mb-3">Completed ({completedBookings.length})</p>
              <div className="space-y-2">
                {completedBookings.map(booking => (
                  <div key={booking.id} className="flex items-center gap-3 p-3 rounded-xl border border-border bg-slate-50 opacity-60">
                    <CheckCircle2 className="w-4 h-4 text-success flex-shrink-0" />
                    <p className="text-sm font-medium text-text-primary">{formatTime(booking.scheduledAt)}</p>
                    <p className="text-sm text-text-muted">{booking.client?.name}</p>
                    <p className="text-xs text-text-muted ml-auto">{booking.service?.nameEn}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Note modal */}
      <AnimatePresence>
        {noteModal.open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4"
            onClick={() => setNoteModal({ open: false, bookingId: null })}
          >
            <motion.div
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 40 }}
              className="bg-surface rounded-2xl p-6 w-full max-w-sm shadow-2xl"
              onClick={e => e.stopPropagation()}
            >
              <h3 className="font-bold text-text-primary mb-4">Add Service Note</h3>
              <textarea
                className="w-full border border-border rounded-xl p-3 text-sm bg-background text-text-primary resize-none h-24 focus:outline-none focus:ring-2 focus:ring-brand/30"
                placeholder="E.g., client requested lighter highlights, sensitive scalp…"
                value={noteText}
                onChange={e => setNoteText(e.target.value)}
                autoFocus
              />
              <div className="flex gap-2 mt-4">
                <Button variant="secondary" className="flex-1" onClick={() => setNoteModal({ open: false, bookingId: null })}>
                  Cancel
                </Button>
                <Button className="flex-1" onClick={() => {
                  if (!noteText.trim()) {
                    toast.error('Note vide');
                    return;
                  }
                  if (noteModal.bookingId) {
                    updateStatusMutation.mutate(
                      { id: noteModal.bookingId, status: 'confirmed' } as any,
                      // We reuse the same mutation type but need a notes-patch.
                      // Call the api directly and invalidate.
                    );
                    api.updateBooking(noteModal.bookingId, { status: 'confirmed' } as any)
                      .catch(() => null);
                    // Persist notes via a PATCH.
                    api.updateBooking(noteModal.bookingId, { notes: noteText } as any)
                      .then(() => {
                        queryClient.invalidateQueries({ queryKey: ['staff-bookings', tenant?.id] });
                        toast.success('Note enregistrée');
                      })
                      .catch(() => toast.error('Échec de la sauvegarde'));
                  }
                  setNoteText('');
                  setNoteModal({ open: false, bookingId: null });
                }}>
                  Save Note
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
