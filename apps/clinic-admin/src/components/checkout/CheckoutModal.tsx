import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  CreditCard, Banknote, Receipt, Check, Loader2,
  Plus, Minus, AlertCircle, ArrowRight, Star,
} from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { api } from '../lib/api';
import { useCurrency } from '../hooks/useCurrency';
import { cn } from '../lib/utils';
import { Button } from '../components/ui/Button';
import { Card, CardContent } from '../components/ui/Card';
import toast from 'react-hot-toast';

type PaymentMethod = 'card' | 'cash' | 'other';

interface CheckoutProps {
  bookingId: string;
  onClose: () => void;
  onComplete: () => void;
}

function PaymentMethodButton({
  method,
  label,
  icon: Icon,
  selected,
  onClick,
}: {
  method: PaymentMethod;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all',
        selected
          ? 'border-brand bg-brand/5 text-brand'
          : 'border-border bg-surface text-text-muted hover:border-brand/30'
      )}
    >
      <Icon className="w-6 h-6" />
      <span className="text-xs font-bold">{label}</span>
    </button>
  );
}

// ─── Checkout Modal ───────────────────────────────────────────────────────────
export function CheckoutModal({ bookingId, onClose, onComplete }: CheckoutProps) {
  const { formatCurrency } = useCurrency();
  const queryClient = useQueryClient();
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('card');
  const [discount, setDiscount] = useState(0);
  const [tip, setTip] = useState(0);
  const [isComplete, setIsComplete] = useState(false);

  const { data: booking, isLoading } = useQuery({
    queryKey: ['booking', bookingId],
    queryFn: () => api.getBooking(bookingId),
    enabled: !!bookingId,
  });

  const completeMutation = useMutation({
    mutationFn: () => api.updateBooking(bookingId, { status: 'completed' }),
    onSuccess: () => {
      setIsComplete(true);
      queryClient.invalidateQueries({ queryKey: ['bookings'] });
      toast.success('Payment completed!');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  if (isLoading || !booking) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-brand" />
      </div>
    );
  }

  const servicePrice = booking.service?.price ?? 0;
  const subtotal = servicePrice;
  const discountAmount = (subtotal * discount) / 100;
  const tax = (subtotal - discountAmount) * 0.05; // 5% VAT
  const total = subtotal - discountAmount + tax + tip;

  if (isComplete) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="text-center py-8 px-6"
      >
        <div className="w-16 h-16 rounded-full bg-success/10 flex items-center justify-center mx-auto mb-4">
          <Check className="w-8 h-8 text-success" />
        </div>
        <h3 className="text-xl font-bold text-text-primary">Payment Complete</h3>
        <p className="text-text-muted text-sm mt-2">
          {formatCurrency(total)} charged via {paymentMethod}
        </p>

        <div className="mt-8 grid grid-cols-2 gap-3">
          <Button variant="secondary" onClick={() => { /* send receipt */ toast('Receipt sent!'); }}>
            <Receipt className="w-4 h-4 mr-2" />
            Send Receipt
          </Button>
          <Button onClick={onComplete} className="gap-2">
            Rebook Client
            <ArrowRight className="w-4 h-4" />
          </Button>
        </div>
        <button onClick={onClose} className="w-full mt-3 text-sm text-text-muted hover:text-text-primary transition-colors">
          Close
        </button>
      </motion.div>
    );
  }

  return (
    <div className="flex flex-col gap-5 max-h-[80vh] overflow-y-auto">
      {/* Client + Service summary */}
      <div className="flex items-center gap-3 p-4 rounded-xl bg-brand/5 border border-brand/20">
        <div className="w-10 h-10 rounded-full bg-brand/10 flex items-center justify-center font-bold text-brand flex-shrink-0">
          {(booking.client?.name || '?').charAt(0)}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-text-primary">{booking.client?.name || 'Client'}</p>
          <p className="text-sm text-text-muted">{booking.service?.nameEn}</p>
        </div>
        <p className="font-bold text-text-primary text-lg">{formatCurrency(servicePrice)}</p>
      </div>

      {/* Discount & Tip */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <p className="text-xs font-bold text-text-muted uppercase tracking-wider mb-2">Discount (%)</p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setDiscount(Math.max(0, discount - 5))}
              className="w-8 h-8 rounded-lg border border-border flex items-center justify-center hover:bg-slate-50 transition-colors"
            >
              <Minus className="w-4 h-4" />
            </button>
            <span className="flex-1 text-center font-bold text-text-primary">{discount}%</span>
            <button
              onClick={() => setDiscount(Math.min(50, discount + 5))}
              className="w-8 h-8 rounded-lg border border-border flex items-center justify-center hover:bg-slate-50 transition-colors"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
        </div>
        <div>
          <p className="text-xs font-bold text-text-muted uppercase tracking-wider mb-2">Tip</p>
          <div className="flex items-center gap-1">
            {[0, 10, 20, 30].map(t => (
              <button
                key={t}
                onClick={() => setTip(t)}
                className={cn(
                  'flex-1 py-1.5 rounded-lg text-xs font-bold transition-all',
                  tip === t
                    ? 'bg-brand text-white'
                    : 'bg-slate-100 text-text-muted hover:bg-slate-200'
                )}
              >
                {t > 0 ? `${formatCurrency(t)}` : 'None'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Price breakdown */}
      <div className="rounded-xl border border-border p-4 space-y-2.5">
        <div className="flex justify-between text-sm">
          <span className="text-text-muted">{booking.service?.nameEn}</span>
          <span className="font-medium text-text-primary">{formatCurrency(subtotal)}</span>
        </div>
        {discount > 0 && (
          <div className="flex justify-between text-sm">
            <span className="text-success">Discount ({discount}%)</span>
            <span className="font-medium text-success">-{formatCurrency(discountAmount)}</span>
          </div>
        )}
        <div className="flex justify-between text-sm">
          <span className="text-text-muted">VAT (5%)</span>
          <span className="font-medium text-text-primary">{formatCurrency(tax)}</span>
        </div>
        {tip > 0 && (
          <div className="flex justify-between text-sm">
            <span className="text-text-muted flex items-center gap-1.5">
              <Star className="w-3 h-3 text-amber-400 fill-amber-400" /> Tip
            </span>
            <span className="font-medium text-text-primary">{formatCurrency(tip)}</span>
          </div>
        )}
        <div className="border-t border-border pt-2.5 flex justify-between">
          <span className="font-bold text-text-primary">Total</span>
          <span className="font-bold text-text-primary text-xl">{formatCurrency(total)}</span>
        </div>
      </div>

      {/* Payment method */}
      <div>
        <p className="text-xs font-bold text-text-muted uppercase tracking-wider mb-3">Payment Method</p>
        <div className="grid grid-cols-3 gap-2">
          <PaymentMethodButton method="card" label="Card" icon={CreditCard} selected={paymentMethod === 'card'} onClick={() => setPaymentMethod('card')} />
          <PaymentMethodButton method="cash" label="Cash" icon={Banknote} selected={paymentMethod === 'cash'} onClick={() => setPaymentMethod('cash')} />
          <PaymentMethodButton method="other" label="Other" icon={Receipt} selected={paymentMethod === 'other'} onClick={() => setPaymentMethod('other')} />
        </div>
      </div>

      {/* CTA */}
      <Button
        onClick={() => completeMutation.mutate()}
        isLoading={completeMutation.isPending}
        size="lg"
        className="w-full"
      >
        Complete Payment · {formatCurrency(total)}
      </Button>
    </div>
  );
}
