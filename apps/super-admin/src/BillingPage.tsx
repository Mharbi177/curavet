import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { CreditCard, Download, CheckCircle2, Loader2 } from 'lucide-react';
import { apiFetch } from './api';

interface Invoice {
  id: string;
  salon: string;
  amount: string;
  plan?: string;
  date: string;
  status: string;
}

export default function BillingPage() {
  const [mrr, setMrr] = useState('—');
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    apiFetch<{ mrr: string; invoices: Invoice[] }>('/api/billing/overview')
      .then(data => {
        setMrr(data.mrr);
        setInvoices(data.invoices);
        setLoading(false);
      })
      .catch((err: Error) => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  return (
    <div className="ml-64 p-8 w-full">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Billing & Subscriptions</h1>
        <p className="text-gray-500">Manage tenant subscriptions and view global revenue.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-xl p-6 text-white shadow-lg relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-20">
            <CreditCard className="w-24 h-24" />
          </div>
          <p className="text-sm font-medium text-gray-400 mb-2">Total MRR (Monthly Recurring Revenue)</p>
          <p className="text-4xl font-bold mb-4">{loading ? '—' : mrr}</p>
          <div className="flex gap-2">
            <span className="bg-emerald-500/20 text-emerald-400 text-xs font-semibold px-2 py-1 rounded-full">Live usage-based billing</span>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">Recent Invoices</h2>
        </div>
        <table className="w-full text-left">
          <thead className="bg-gray-50 text-gray-500 text-sm">
            <tr>
              <th className="px-6 py-3 font-medium">Invoice ID</th>
              <th className="px-6 py-3 font-medium">Salon</th>
              <th className="px-6 py-3 font-medium">Amount</th>
              <th className="px-6 py-3 font-medium">Date</th>
              <th className="px-6 py-3 font-medium">Status</th>
              <th className="px-6 py-3 font-medium text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr>
                <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                  <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-brand" />
                  Loading live billing data...
                </td>
              </tr>
            ) : error ? (
              <tr>
                <td colSpan={6} className="px-6 py-12 text-center text-sm text-red-500">
                  {error}
                </td>
              </tr>
            ) : invoices.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-12 text-center text-sm text-gray-500">
                  No tenants yet. Invoices will appear here once salons subscribe.
                </td>
              </tr>
            ) : (
              invoices.map((inv, i) => (
              <motion.tr 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.1 }}
                key={inv.id} 
                className="hover:bg-gray-50"
              >
                <td className="px-6 py-4 text-sm font-medium text-gray-900">{inv.id}</td>
                <td className="px-6 py-4 text-sm text-gray-600">{inv.salon}</td>
                <td className="px-6 py-4 text-sm font-semibold">{inv.amount}</td>
                <td className="px-6 py-4 text-sm text-gray-500">{inv.date}</td>
                <td className="px-6 py-4">
                  <span className={`px-2.5 py-1 rounded-full text-xs font-medium flex items-center gap-1 w-max ${inv.status === 'Paid' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                    {inv.status === 'Paid' && <CheckCircle2 className="w-3 h-3" />}
                    {inv.status}
                  </span>
                </td>
                <td className="px-6 py-4 text-right">
                  <button className="p-2 text-gray-400 hover:text-brand transition-colors">
                    <Download className="w-4 h-4" />
                  </button>
                </td>
              </motion.tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
