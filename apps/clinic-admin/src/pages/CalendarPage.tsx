import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ChevronLeft, ChevronRight, Calendar, Clock, User,
  Scissors, Plus, X, Check, CheckCircle2, XCircle,
  Loader2, Phone, Search, GripVertical,
} from 'lucide-react';
import {
  DndContext, DragEndEvent, DragOverlay, DragStartEvent,
  PointerSensor, useSensor, useSensors, useDroppable, useDraggable,
  closestCenter,
} from '@dnd-kit/core';
import {
  startOfWeek, endOfWeek, startOfMonth, endOfMonth,
  eachDayOfInterval, format, isSameDay, isToday,
  addDays, addWeeks, subWeeks, addMonths, subMonths,
  parseISO, differenceInMinutes, set as setDateFields,
} from 'date-fns';
import { api } from '../lib/api';
import { useAuth } from '../hooks/useAuth';
import { useCurrency } from '../hooks/useCurrency';
import { useDebounce } from '../hooks/useDebounce';
import { formatTime, formatDate, cn, getInitials } from '../lib/utils';
import toast from 'react-hot-toast';
import type { Booking, Service, Client } from '../lib/types';

// ─── Constants ────────────────────────────────────────────────────────────────
const HOUR_HEIGHT = 64; // px per hour
const START_HOUR = 8;
const END_HOUR = 22;
const HOURS = Array.from({ length: END_HOUR - START_HOUR }, (_, i) => i + START_HOUR);

interface StaffMember { id: string; name: string; color?: string; workingHoursJson: string; }
type ViewMode = 'day' | 'week' | 'month';

const STATUS_STYLES: Record<string, { chip: string; dot: string }> = {
  pending:   { chip: 'bg-warning/15 border-warning/30 text-warning',        dot: 'bg-warning' },
  confirmed: { chip: 'bg-brand/15 border-brand/30 text-brand',              dot: 'bg-brand' },
  completed: { chip: 'bg-success/15 border-success/30 text-success',        dot: 'bg-success' },
  cancelled: { chip: 'bg-danger/15 border-danger/30 text-danger',           dot: 'bg-danger' },
  no_show:   { chip: 'bg-slate-100 border-slate-200 text-text-muted',       dot: 'bg-slate-400' },
};

// ─── Booking Chip ─────────────────────────────────────────────────────────────
function BookingChip({ booking, onClick, isDragging = false }: {
  booking: Booking; onClick?: () => void; isDragging?: boolean;
}) {
  const start = parseISO(booking.scheduledAt);
  const end = parseISO(booking.endsAt);
  const durationMins = differenceInMinutes(end, start);
  const topMins = differenceInMinutes(start, setDateFields(start, { hours: START_HOUR, minutes: 0, seconds: 0 }));
  const heightPx = Math.max((durationMins / 60) * HOUR_HEIGHT - 4, 28);
  const topPx = (topMins / 60) * HOUR_HEIGHT + 2;
  const style = STATUS_STYLES[booking.status] || STATUS_STYLES.pending;

  return (
    <div
      onClick={onClick}
      style={{ top: topPx, height: heightPx, position: 'absolute', left: 4, right: 4 }}
      className={cn(
        'rounded-xl border px-2.5 py-1.5 cursor-pointer select-none overflow-hidden transition-all',
        style.chip,
        isDragging ? 'opacity-40 shadow-2xl scale-105 z-50' : 'hover:brightness-95 z-10'
      )}
    >
      <div className="flex items-center gap-1.5">
        <span className={cn('w-1.5 h-1.5 rounded-full flex-shrink-0', style.dot)} />
        <p className="text-xs font-bold truncate leading-none">{booking.service.nameEn}</p>
      </div>
      {heightPx > 40 && (
        <p className="text-[10px] font-medium opacity-80 truncate mt-0.5">
          {booking.client.name || booking.client.phone}
        </p>
      )}
      {heightPx > 56 && (
        <p className="text-[10px] opacity-60 mt-0.5">{formatTime(booking.scheduledAt)}</p>
      )}
    </div>
  );
}

// ─── Draggable Booking Chip ────────────────────────────────────────────────────
function DraggableBookingChip({ booking, onClick }: { booking: Booking; onClick: () => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: booking.id, data: { booking } });
  return (
    <div ref={setNodeRef} {...listeners} {...attributes} style={{ position: 'absolute', inset: 0, top: undefined, height: undefined }}>
      <BookingChip booking={booking} onClick={onClick} isDragging={isDragging} />
    </div>
  );
}

// ─── Droppable Time Cell ───────────────────────────────────────────────────────
function DroppableCell({ id, children, className }: { id: string; children?: React.ReactNode; className?: string }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      className={cn('border-b border-border/40 relative transition-colors', isOver && 'bg-brand/5', className)}
      style={{ height: HOUR_HEIGHT }}
    >
      {children}
    </div>
  );
}

// ─── New Booking Modal ─────────────────────────────────────────────────────────
function NewBookingModal({ onClose, defaultDate, staffList, services }: {
  onClose: () => void; defaultDate?: Date; staffList: StaffMember[]; services: Service[];
}) {
  const queryClient = useQueryClient();
  const { tenant } = useAuth();
  const { formatCurrency } = useCurrency();
  const [step, setStep] = useState<'service' | 'staff' | 'datetime' | 'client' | 'confirm'>('service');
  const [selectedService, setSelectedService] = useState<Service | null>(null);
  const [selectedStaff, setSelectedStaff] = useState<StaffMember | null>(null);
  const [selectedDate, setSelectedDate] = useState(defaultDate ? format(defaultDate, 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd'));
  const [selectedTime, setSelectedTime] = useState('10:00');
  const [clientSearch, setClientSearch] = useState('');
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [newClientPhone, setNewClientPhone] = useState('');
  const [newClientName, setNewClientName] = useState('');
  const [clientMode, setClientMode] = useState<'search' | 'new'>('search');
  const debouncedSearch = useDebounce(clientSearch, 300);

  const { data: clientsData, isLoading: clientsLoading } = useQuery({
    queryKey: ['clients-search', tenant?.id, debouncedSearch],
    queryFn: () => api.getClients({ search: debouncedSearch, limit: 10 }),
    enabled: !!tenant && debouncedSearch.length > 1,
  });

  const activeServices = services.filter((s) => s.isActive);

  const createBookingMutation = useMutation({
    mutationFn: async (data: any) => api.createBooking({ ...data, source: 'admin' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['calendar', 'bookings'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      toast.success('Booking created!');
      onClose();
    },
    onError: (err: Error) => toast.error(err.message || 'Failed to create booking'),
  });

  const createClientMutation = useMutation({
    mutationFn: (data: { phone: string; name?: string }) => api.createClient(data),
    onSuccess: (client) => { setSelectedClient(client); setStep('confirm'); },
    onError: (err: Error) => toast.error(err.message || 'Failed to create client'),
  });

  const handleConfirm = useCallback(async () => {
    if (!selectedService || !selectedStaff || !selectedDate || !selectedTime) return;
    let clientId = selectedClient?.id;
    if (!clientId && clientMode === 'new') {
      if (!newClientPhone.trim()) { toast.error('Phone number is required'); return; }
      createClientMutation.mutate({ phone: newClientPhone.trim(), name: newClientName.trim() || undefined }, {
        onSuccess: (client) => {
          createBookingMutation.mutate({ clientId: client.id, staffId: selectedStaff.id, serviceId: selectedService.id, date: selectedDate, time: selectedTime });
        },
      });
      return;
    }
    if (!clientId) { toast.error('Please select or create a client'); return; }
    createBookingMutation.mutate({ clientId, staffId: selectedStaff.id, serviceId: selectedService.id, date: selectedDate, time: selectedTime });
  }, [selectedService, selectedStaff, selectedDate, selectedTime, selectedClient, clientMode, newClientPhone, newClientName]);

  const timeSlots = useMemo(() => {
    const slots: string[] = [];
    for (let h = 8; h <= 21; h++) for (const m of [0, 30]) slots.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
    return slots;
  }, []);

  const STEPS = ['service', 'staff', 'datetime', 'client', 'confirm'] as const;
  const stepIdx = STEPS.indexOf(step);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <motion.div initial={{ opacity: 0, scale: 0.95, y: 24 }} animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 24 }} transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        className="bg-surface border border-border rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden"
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-border flex items-center justify-between flex-shrink-0">
          <div>
            <h2 className="text-lg font-bold text-text-primary">New Booking</h2>
            <div className="flex items-center gap-1 mt-2">
              {STEPS.map((s, i) => (
                <div key={s} className={cn('h-1.5 rounded-full transition-all duration-300', i < stepIdx ? 'w-8 bg-brand' : i === stepIdx ? 'w-8 bg-brand/50' : 'w-4 bg-slate-200')} />
              ))}
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl text-text-muted hover:text-text-primary hover:bg-slate-100 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6">
          <AnimatePresence mode="wait">

            {step === 'service' && (
              <motion.div key="service" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                <p className="text-xs font-bold text-text-muted uppercase tracking-wider mb-4">Select Service</p>
                <div className="space-y-2">
                  {activeServices.map((service) => (
                    <button key={service.id} onClick={() => { setSelectedService(service); setStep('staff'); }}
                      className={cn('w-full text-left flex items-center justify-between p-4 rounded-xl border-2 transition-all hover:border-brand/40',
                        selectedService?.id === service.id ? 'border-brand bg-brand/5' : 'border-border')}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-brand/10 flex items-center justify-center">
                          <Scissors className="w-5 h-5 text-brand" />
                        </div>
                        <div>
                          <p className="font-bold text-text-primary">{service.nameEn}</p>
                          <p className="text-xs text-text-muted">{service.nameAr}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-text-primary">{formatCurrency(service.price)}</p>
                        <p className="text-xs text-text-muted">{service.durationMinutes} min</p>
                      </div>
                    </button>
                  ))}
                </div>
              </motion.div>
            )}

            {step === 'staff' && (
              <motion.div key="staff" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                <p className="text-xs font-bold text-text-muted uppercase tracking-wider mb-4">Select Staff Member</p>
                <div className="space-y-2">
                  {staffList.map((member) => (
                    <button key={member.id} onClick={() => { setSelectedStaff(member); setStep('datetime'); }}
                      className={cn('w-full text-left flex items-center gap-3 p-4 rounded-xl border-2 transition-all hover:border-brand/40',
                        selectedStaff?.id === member.id ? 'border-brand bg-brand/5' : 'border-border')}
                    >
                      <div className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm"
                        style={{ backgroundColor: member.color || 'hsl(var(--color-brand))' }}>
                        {getInitials(member.name)}
                      </div>
                      <p className="font-bold text-text-primary flex-1">{member.name}</p>
                      {selectedStaff?.id === member.id && <Check className="w-4 h-4 text-brand" />}
                    </button>
                  ))}
                </div>
              </motion.div>
            )}

            {step === 'datetime' && (
              <motion.div key="datetime" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                <p className="text-xs font-bold text-text-muted uppercase tracking-wider mb-4">Date & Time</p>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-semibold text-text-primary mb-2">Date</label>
                    <input type="date" value={selectedDate} min={format(new Date(), 'yyyy-MM-dd')}
                      onChange={(e) => setSelectedDate(e.target.value)}
                      className="w-full px-4 py-3 border border-border rounded-xl bg-background text-text-primary focus:outline-none focus:ring-2 focus:ring-brand/40" />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-text-primary mb-2">Time Slot</label>
                    <div className="grid grid-cols-4 gap-2 max-h-52 overflow-y-auto pr-1">
                      {timeSlots.map((slot) => (
                        <button key={slot} onClick={() => setSelectedTime(slot)}
                          className={cn('py-2.5 text-sm font-semibold rounded-xl border transition-all',
                            selectedTime === slot
                              ? 'bg-brand text-white border-brand shadow-sm shadow-brand/30'
                              : 'border-border text-text-primary hover:border-brand/40 hover:bg-brand/5')}
                        >
                          {slot}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {step === 'client' && (
              <motion.div key="client" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                <p className="text-xs font-bold text-text-muted uppercase tracking-wider mb-4">Client</p>
                <div className="grid grid-cols-2 gap-2 mb-4">
                  {(['search', 'new'] as const).map((mode) => (
                    <button key={mode} onClick={() => { setClientMode(mode); setSelectedClient(null); }}
                      className={cn('py-2.5 rounded-xl text-sm font-bold border-2 transition-all',
                        clientMode === mode ? 'bg-brand text-white border-brand' : 'border-border text-text-muted')}
                    >
                      {mode === 'search' ? 'Existing Client' : 'New Client'}
                    </button>
                  ))}
                </div>

                {clientMode === 'search' ? (
                  <div>
                    <div className="relative mb-3">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
                      <input type="text" placeholder="Search by name or phone…" value={clientSearch}
                        onChange={(e) => setClientSearch(e.target.value)} autoFocus
                        className="w-full pl-10 pr-4 py-2.5 border border-border rounded-xl bg-background text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-brand/40"
                      />
                    </div>
                    {clientsLoading && <div className="flex items-center justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-brand" /></div>}
                    <div className="space-y-2 max-h-52 overflow-y-auto">
                      {clientsData?.clients?.map((client) => (
                        <button key={client.id} onClick={() => setSelectedClient(client)}
                          className={cn('w-full text-left flex items-center gap-3 p-3 rounded-xl border-2 transition-all',
                            selectedClient?.id === client.id ? 'border-brand bg-brand/5' : 'border-border hover:border-brand/40')}
                        >
                          <div className="w-9 h-9 rounded-full bg-brand/10 flex items-center justify-center">
                            <span className="text-sm font-bold text-brand">{getInitials(client.name || client.phone)}</span>
                          </div>
                          <div>
                            <p className="font-semibold text-text-primary text-sm">{client.name || 'Unnamed'}</p>
                            <p className="text-xs text-text-muted">{client.phone}</p>
                          </div>
                          {selectedClient?.id === client.id && <Check className="w-4 h-4 text-brand ml-auto" />}
                        </button>
                      ))}
                      {clientSearch.length <= 1 && <p className="text-center text-text-muted text-sm py-6">Type to search clients…</p>}
                      {clientSearch.length > 1 && !clientsLoading && !clientsData?.clients?.length && (
                        <p className="text-center text-text-muted text-sm py-6">No clients found</p>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div>
                      <label className="block text-sm font-semibold text-text-primary mb-1.5">Phone Number *</label>
                      <div className="relative">
                        <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
                        <input type="tel" value={newClientPhone} onChange={(e) => setNewClientPhone(e.target.value)}
                          placeholder="+971 50 123 4567" autoFocus
                          className="w-full pl-10 pr-4 py-2.5 border border-border rounded-xl bg-background text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-brand/40" />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-text-primary mb-1.5">Name (optional)</label>
                      <input type="text" value={newClientName} onChange={(e) => setNewClientName(e.target.value)}
                        placeholder="Client name"
                        className="w-full px-4 py-2.5 border border-border rounded-xl bg-background text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-brand/40" />
                    </div>
                  </div>
                )}
              </motion.div>
            )}

            {step === 'confirm' && (
              <motion.div key="confirm" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                <p className="text-xs font-bold text-text-muted uppercase tracking-wider mb-4">Review & Confirm</p>
                <div className="bg-brand/5 rounded-2xl border border-brand/20 p-5 space-y-4">
                  {[
                    { icon: Scissors, label: 'Service', value: selectedService ? `${selectedService.nameEn} · ${formatCurrency(selectedService.price)}` : '' },
                    { icon: User,     label: 'Staff',   value: selectedStaff?.name || '' },
                    { icon: Calendar, label: 'Date',    value: selectedDate ? formatDate(selectedDate) : '' },
                    { icon: Clock,    label: 'Time',    value: selectedTime },
                    { icon: Phone,    label: 'Client',  value: selectedClient ? `${selectedClient.name || 'Unnamed'} · ${selectedClient.phone}` : clientMode === 'new' ? `${newClientName || 'New Client'} · ${newClientPhone}` : '—' },
                  ].map(({ icon: Icon, label, value }) => (
                    <div key={label} className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-brand/10 flex items-center justify-center flex-shrink-0">
                        <Icon className="w-4 h-4 text-brand" />
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-text-muted">{label}</p>
                        <p className="text-sm font-bold text-text-primary">{value}</p>
                      </div>
                    </div>
                  ))}
                </div>
                {selectedService && (
                  <div className="mt-4 p-3 bg-success/10 rounded-xl flex items-center gap-2 border border-success/20">
                    <CheckCircle2 className="w-4 h-4 text-success" />
                    <p className="text-sm font-medium text-success">
                      {selectedService.durationMinutes} min service + {selectedService.bufferMinutes ?? 0} min buffer
                    </p>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-border flex items-center justify-between gap-3 flex-shrink-0">
          {step !== 'service' ? (
            <button onClick={() => setStep(STEPS[stepIdx - 1] as typeof step)}
              className="flex items-center gap-1.5 px-4 py-2.5 border border-border rounded-xl text-sm font-semibold text-text-muted hover:text-text-primary hover:bg-slate-50 transition-colors">
              <ChevronLeft className="w-4 h-4" /> Back
            </button>
          ) : <div />}

          {step === 'service' && <div />}
          {step !== 'confirm' && step !== 'service' && (
            <button onClick={() => setStep(STEPS[stepIdx + 1] as typeof step)}
              disabled={(step === 'staff' && !selectedStaff) || (step === 'datetime' && (!selectedDate || !selectedTime)) || (step === 'client' && !selectedClient && clientMode === 'search' && !newClientPhone)}
              className="flex items-center gap-1.5 px-5 py-2.5 bg-brand text-white rounded-xl text-sm font-bold hover:bg-brand-strong disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-sm shadow-brand/30">
              Next <ChevronRight className="w-4 h-4" />
            </button>
          )}
          {step === 'client' && (
            <button onClick={() => {
              if (clientMode === 'search' && !selectedClient) { toast.error('Please select a client'); return; }
              if (clientMode === 'new' && !newClientPhone.trim()) { toast.error('Phone required'); return; }
              setStep('confirm');
            }}
              className="flex items-center gap-1.5 px-5 py-2.5 bg-brand text-white rounded-xl text-sm font-bold hover:bg-brand-strong transition-all">
              Review <ChevronRight className="w-4 h-4" />
            </button>
          )}
          {step === 'confirm' && (
            <button onClick={handleConfirm} disabled={createBookingMutation.isPending || createClientMutation.isPending}
              className="flex items-center gap-2 px-6 py-2.5 bg-brand text-white rounded-xl text-sm font-bold hover:bg-brand-strong disabled:opacity-40 transition-all shadow-sm shadow-brand/30">
              {createBookingMutation.isPending || createClientMutation.isPending
                ? <><Loader2 className="w-4 h-4 animate-spin" /> Creating…</>
                : <><CheckCircle2 className="w-4 h-4" /> Confirm Booking</>
              }
            </button>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

// ─── Booking Detail Modal ──────────────────────────────────────────────────────
function BookingDetailModal({ booking, onClose }: { booking: Booking; onClose: () => void }) {
  const queryClient = useQueryClient();
  const { formatCurrency } = useCurrency();
  const cancelMutation   = useMutation({ mutationFn: () => api.cancelBooking(booking.id),                             onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['calendar', 'bookings'] }); toast.success('Booking cancelled'); onClose(); }, onError: (err: Error) => toast.error(err.message) });
  const confirmMutation  = useMutation({ mutationFn: () => api.updateBooking(booking.id, { status: 'confirmed' }),   onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['calendar', 'bookings'] }); toast.success('Booking confirmed'); onClose(); }, onError: (err: Error) => toast.error(err.message) });
  const completeMutation = useMutation({ mutationFn: () => api.updateBooking(booking.id, { status: 'completed' }),   onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['calendar', 'bookings'] }); toast.success('Booking completed'); onClose(); }, onError: (err: Error) => toast.error(err.message) });
  const style = STATUS_STYLES[booking.status] || STATUS_STYLES.pending;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <motion.div initial={{ opacity: 0, scale: 0.95, y: 24 }} animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 24 }} transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        className="bg-surface border border-border rounded-2xl shadow-2xl w-full max-w-md"
      >
        <div className="px-6 py-5 border-b border-border flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-text-primary">{booking.service.nameEn}</h2>
            <span className={cn('inline-flex items-center gap-1.5 mt-1.5 px-3 py-1 rounded-full text-xs font-bold border', style.chip)}>
              <span className={cn('w-1.5 h-1.5 rounded-full', style.dot)} />
              {booking.status.charAt(0).toUpperCase() + booking.status.slice(1).replace('_', ' ')}
            </span>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl text-text-muted hover:bg-slate-100 transition-colors"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-6 space-y-4">
          {[
            { icon: User,     label: 'Client',  value: booking.client.name || booking.client.phone },
            { icon: User,     label: 'Staff',   value: booking.staff.name },
            { icon: Calendar, label: 'Date',    value: formatDate(booking.scheduledAt) },
            { icon: Clock,    label: 'Time',    value: `${formatTime(booking.scheduledAt)} → ${formatTime(booking.endsAt)}` },
            { icon: Scissors, label: 'Service', value: `${booking.service.nameEn} · ${booking.service.durationMinutes} min · ${formatCurrency(booking.service.price)}` },
          ].map(({ icon: Icon, label, value }) => (
            <div key={label} className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-brand/10 flex items-center justify-center flex-shrink-0"><Icon className="w-4 h-4 text-brand" /></div>
              <div><p className="text-xs font-semibold text-text-muted">{label}</p><p className="text-sm font-bold text-text-primary">{value}</p></div>
            </div>
          ))}
        </div>
        <div className="px-6 pb-6 flex flex-wrap gap-2">
          {booking.status === 'pending' && (
            <button onClick={() => confirmMutation.mutate()} disabled={confirmMutation.isPending}
              className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 bg-brand text-white rounded-xl text-sm font-bold hover:bg-brand-strong disabled:opacity-50 transition-colors">
              <Check className="w-4 h-4" /> {confirmMutation.isPending ? 'Confirming…' : 'Confirm'}
            </button>
          )}
          {(booking.status === 'confirmed' || booking.status === 'pending') && (
            <button onClick={() => completeMutation.mutate()} disabled={completeMutation.isPending}
              className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 bg-success text-white rounded-xl text-sm font-bold hover:bg-emerald-700 disabled:opacity-50 transition-colors">
              <CheckCircle2 className="w-4 h-4" /> {completeMutation.isPending ? 'Completing…' : 'Complete'}
            </button>
          )}
          {booking.status !== 'cancelled' && booking.status !== 'completed' && (
            <button onClick={() => { if (window.confirm('Cancel this booking?')) cancelMutation.mutate(); }} disabled={cancelMutation.isPending}
              className="flex items-center justify-center gap-1.5 px-4 py-2.5 border border-danger/40 text-danger rounded-xl text-sm font-bold hover:bg-danger/10 disabled:opacity-50 transition-colors">
              <XCircle className="w-4 h-4" /> {cancelMutation.isPending ? 'Cancelling…' : 'Cancel'}
            </button>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

// ─── Time Grid ─────────────────────────────────────────────────────────────────
function TimeGrid({ days, bookings, onBookingClick }: {
  days: Date[]; bookings: Booking[]; onBookingClick: (b: Booking) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Scroll to current hour on mount
  useEffect(() => {
    const now = new Date();
    const offset = ((now.getHours() - START_HOUR) * HOUR_HEIGHT) - 80;
    scrollRef.current?.scrollTo({ top: Math.max(0, offset), behavior: 'smooth' });
  }, []);

  return (
    <div className="flex flex-1 overflow-hidden">
      {/* Time gutter */}
      <div className="w-14 flex-shrink-0 border-r border-border bg-background overflow-y-hidden">
        <div className="h-10 border-b border-border" /> {/* header spacer */}
        {HOURS.map((hour) => (
          <div key={hour} style={{ height: HOUR_HEIGHT }} className="border-b border-border/40 px-2 pt-1">
            <span className="text-[10px] font-semibold text-text-muted/60 leading-none">
              {hour === 12 ? '12 PM' : hour > 12 ? `${hour - 12} PM` : `${hour} AM`}
            </span>
          </div>
        ))}
      </div>

      {/* Scrollable area */}
      <div className="flex-1 overflow-auto" ref={scrollRef}>
        {/* Day headers */}
        <div className="flex sticky top-0 z-10 bg-background border-b border-border">
          {days.map((day) => (
            <div key={day.toISOString()} className="flex-1 min-w-0 px-2 py-2 text-center border-r border-border/50 last:border-r-0">
              <p className={cn('text-xs font-bold uppercase tracking-wider', isToday(day) ? 'text-brand' : 'text-text-muted')}>{format(day, 'EEE')}</p>
              <div className={cn('text-xl font-bold mt-0.5 w-9 h-9 rounded-full flex items-center justify-center mx-auto transition-colors',
                isToday(day) ? 'bg-brand text-white' : 'text-text-primary'
              )}>
                {format(day, 'd')}
              </div>
            </div>
          ))}
        </div>

        {/* Grid body */}
        <div className="flex relative">
          {days.map((day) => {
            const dayBookings = bookings.filter((b) => isSameDay(parseISO(b.scheduledAt), day));
            return (
              <div key={day.toISOString()} className="flex-1 min-w-0 relative border-r border-border/50 last:border-r-0" style={{ minWidth: 120 }}>
                {HOURS.map((hour) => (
                  <DroppableCell
                    key={hour}
                    id={`${format(day, 'yyyy-MM-dd')}-${String(hour).padStart(2, '0')}:00`}
                  />
                ))}
                {/* Current time indicator */}
                {isToday(day) && (() => {
                  const now = new Date();
                  const mins = (now.getHours() - START_HOUR) * 60 + now.getMinutes();
                  if (mins < 0 || mins > (END_HOUR - START_HOUR) * 60) return null;
                  return (
                    <div className="absolute left-0 right-0 z-20 pointer-events-none flex items-center" style={{ top: (mins / 60) * HOUR_HEIGHT }}>
                      <div className="w-2.5 h-2.5 rounded-full bg-danger -ml-1.5 flex-shrink-0" />
                      <div className="flex-1 h-px bg-danger" />
                    </div>
                  );
                })()}
                {/* Booking chips */}
                <div className="absolute inset-0">
                  {dayBookings.map((booking) => (
                    <DraggableBookingChip key={booking.id} booking={booking} onClick={() => onBookingClick(booking)} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Month View ────────────────────────────────────────────────────────────────
function MonthView({ days, currentDate, bookings, onBookingClick, onDayClick }: {
  days: Date[]; currentDate: Date; bookings: Booking[]; onBookingClick: (b: Booking) => void; onDayClick: (d: Date) => void;
}) {
  return (
    <div className="flex-1 overflow-auto">
      <div className="grid grid-cols-7 border-b border-border">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
          <div key={d} className="py-2 text-center text-xs font-bold text-text-muted uppercase tracking-wider border-r border-border/50 last:border-r-0">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {days.map((day) => {
          const dayBookings = bookings.filter((b) => isSameDay(parseISO(b.scheduledAt), day));
          const isCurrentMonth = day.getMonth() === currentDate.getMonth();
          return (
            <div key={day.toISOString()}
              onClick={() => onDayClick(day)}
              className={cn('min-h-[100px] p-2 border-b border-r border-border/50 cursor-pointer hover:bg-slate-50 transition-colors', !isCurrentMonth && 'opacity-40')}
            >
              <div className={cn('w-7 h-7 flex items-center justify-center rounded-full text-sm font-bold mb-1',
                isToday(day) ? 'bg-brand text-white' : 'text-text-primary'
              )}>
                {format(day, 'd')}
              </div>
              <div className="space-y-0.5">
                {dayBookings.slice(0, 3).map((b) => {
                  const style = STATUS_STYLES[b.status] || STATUS_STYLES.pending;
                  return (
                    <div key={b.id} onClick={(e) => { e.stopPropagation(); onBookingClick(b); }}
                      className={cn('flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-semibold border truncate', style.chip)}>
                      <span className={cn('w-1 h-1 rounded-full flex-shrink-0', style.dot)} />
                      {b.client.name || b.service.nameEn}
                    </div>
                  );
                })}
                {dayBookings.length > 3 && (
                  <p className="text-[10px] text-text-muted font-semibold pl-1">+{dayBookings.length - 3} more</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Main Calendar Page ────────────────────────────────────────────────────────
export function CalendarPage() {
  const { tenant } = useAuth();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<ViewMode>(typeof window !== 'undefined' && window.innerWidth < 768 ? 'day' : 'week');
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);
  const [showNewBookingModal, setShowNewBookingModal] = useState(searchParams.get('new') === 'true');
  const [activeBooking, setActiveBooking] = useState<Booking | null>(null);

  useEffect(() => { setShowNewBookingModal(searchParams.get('new') === 'true'); }, [searchParams]);
  const openNewBookingModal  = () => setSearchParams({ new: 'true' });
  const closeNewBookingModal = () => { setSearchParams({}); setShowNewBookingModal(false); };

  const { data: bookings, isLoading: bookingsLoading } = useQuery({
    queryKey: ['calendar', 'bookings', tenant?.id, viewMode, format(currentDate, 'yyyy-MM-dd')],
    queryFn: async () => {
      const start = viewMode === 'month' ? startOfMonth(currentDate) : viewMode === 'week' ? startOfWeek(currentDate) : currentDate;
      const end   = viewMode === 'month' ? endOfMonth(currentDate)   : viewMode === 'week' ? endOfWeek(currentDate)   : currentDate;
      return api.getBookings({ startDate: format(start, 'yyyy-MM-dd'), endDate: format(end, 'yyyy-MM-dd') });
    },
    enabled: !!tenant,
  });

  const { data: staff } = useQuery({ queryKey: ['calendar', 'staff', tenant?.id], queryFn: () => api.getStaff(), enabled: !!tenant });
  const { data: services } = useQuery({ queryKey: ['calendar', 'services', tenant?.id], queryFn: () => api.getServices(), enabled: !!tenant });

  // DnD reschedule mutation
  const rescheduleMutation = useMutation({
    mutationFn: ({ bookingId, newDate, newTime }: { bookingId: string; newDate: string; newTime: string }) =>
      api.updateBooking(bookingId, { date: newDate, time: newTime }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['calendar', 'bookings'] });
      toast.success('Booking rescheduled!');
    },
    onError: (err: Error) => toast.error(`Reschedule failed: ${err.message}`),
  });

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const handleDragStart = (event: DragStartEvent) => setActiveBooking(event.active.data.current?.booking ?? null);

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveBooking(null);
    const { active, over } = event;
    if (!over) return;
    const [newDate, newTime] = (over.id as string).split('-');
    if (!newDate || !newTime) return;
    rescheduleMutation.mutate({ bookingId: active.id as string, newDate, newTime });
  };

  const nav = (dir: number) => setCurrentDate((prev) => {
    if (viewMode === 'day')   return addDays(prev, dir);
    if (viewMode === 'week')  return dir > 0 ? addWeeks(prev, 1)  : subWeeks(prev, 1);
    return dir > 0 ? addMonths(prev, 1) : subMonths(prev, 1);
  });

  const days = useMemo(() => {
    if (viewMode === 'day')   return [currentDate];
    if (viewMode === 'week')  return Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(currentDate), i));
    return eachDayOfInterval({ start: startOfWeek(startOfMonth(currentDate)), end: endOfWeek(endOfMonth(currentDate)) });
  }, [currentDate, viewMode]);

  const dateLabel =
    viewMode === 'day'   ? format(currentDate, 'EEEE, MMMM d, yyyy') :
    viewMode === 'week'  ? `${format(startOfWeek(currentDate), 'MMM d')} – ${format(endOfWeek(currentDate), 'MMM d, yyyy')}` :
    format(currentDate, 'MMMM yyyy');

  if (bookingsLoading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin rounded-full h-12 w-12 border-4 border-brand border-t-transparent" />
    </div>
  );

  return (
    <div className="flex flex-col h-[calc(100vh-80px)] gap-0">

      {/* ── Toolbar ── */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
        className="flex flex-wrap items-center justify-between gap-3 mb-4 flex-shrink-0"
      >
        {/* Date nav */}
        <div className="flex items-center gap-2">
          <button onClick={() => nav(-1)} className="w-9 h-9 flex items-center justify-center rounded-xl border border-border hover:bg-slate-50 transition-colors">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button onClick={() => setCurrentDate(new Date())}
            className="px-4 h-9 rounded-xl border border-border text-sm font-semibold text-text-muted hover:bg-slate-50 transition-colors">
            Today
          </button>
          <button onClick={() => nav(1)} className="w-9 h-9 flex items-center justify-center rounded-xl border border-border hover:bg-slate-50 transition-colors">
            <ChevronRight className="w-4 h-4" />
          </button>
          <h2 className="text-sm font-bold text-text-primary ml-1">{dateLabel}</h2>
        </div>

        <div className="flex items-center gap-2">
          {/* View toggle */}
          <div className="flex border border-border rounded-xl overflow-hidden text-sm">
            {(['day', 'week', 'month'] as const).map((mode) => (
              <button key={mode} onClick={() => setViewMode(mode)} aria-pressed={viewMode === mode}
                className={cn('px-3 py-2 font-semibold transition-colors capitalize',
                  viewMode === mode ? 'bg-brand text-white' : 'text-text-muted hover:text-text-primary hover:bg-slate-50'
                )}>
                {mode}
              </button>
            ))}
          </div>
          {/* New booking */}
          <button onClick={openNewBookingModal} id="new-booking-btn"
            className="flex items-center gap-1.5 px-4 py-2 bg-brand text-white rounded-xl text-sm font-bold hover:bg-brand-strong transition-all shadow-sm shadow-brand/30">
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">New Booking</span>
          </button>
        </div>
      </motion.div>

      {/* ── Calendar body ── */}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className="flex-1 overflow-hidden rounded-2xl border border-border bg-surface shadow-sm flex flex-col">
          {viewMode !== 'month' ? (
            <TimeGrid days={days} bookings={bookings ?? []} onBookingClick={setSelectedBooking} />
          ) : (
            <MonthView
              days={days}
              currentDate={currentDate}
              bookings={bookings ?? []}
              onBookingClick={setSelectedBooking}
              onDayClick={(d) => { setCurrentDate(d); setViewMode('day'); }}
            />
          )}
        </div>

        {/* Drag Overlay */}
        <DragOverlay dropAnimation={{ duration: 200, easing: 'ease' }}>
          {activeBooking ? (
            <div className={cn(
              'rounded-xl border px-3 py-2 shadow-2xl w-36 opacity-90 rotate-1 scale-105',
              STATUS_STYLES[activeBooking.status]?.chip || STATUS_STYLES.pending.chip
            )}>
              <p className="text-xs font-bold truncate">{activeBooking.service.nameEn}</p>
              <p className="text-[10px] opacity-80 truncate">{activeBooking.client.name}</p>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      {/* ── Modals ── */}
      <AnimatePresence>
        {showNewBookingModal && (
          <NewBookingModal
            onClose={closeNewBookingModal}
            staffList={staff ?? []}
            services={services ?? []}
            defaultDate={currentDate}
          />
        )}
        {selectedBooking && (
          <BookingDetailModal booking={selectedBooking} onClose={() => setSelectedBooking(null)} />
        )}
      </AnimatePresence>
    </div>
  );
}
