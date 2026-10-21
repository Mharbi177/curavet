import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { BarChart3, TrendingUp, Users, Calendar, MessageSquare, Loader2 } from 'lucide-react';
import { apiFetch } from './api';

interface AnalyticsData {
  totalTenants: number;
  totalBookings: number;
  totalConversations: number;
  activeTenants: number;
}

export default function AnalyticsPage() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    apiFetch<AnalyticsData>('/api/analytics')
      .then(result => {
        setData(result);
        setLoading(false);
      })
      .catch((err: Error) => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  const stats = [
    { title: 'Total Tenants', val: loading ? '—' : String(data?.totalTenants ?? 0), icon: Users, color: 'text-emerald-500', bg: 'bg-emerald-100' },
    { title: 'Total AI Bookings', val: loading ? '—' : String(data?.totalBookings ?? 0), icon: Calendar, color: 'text-brand', bg: 'bg-brand/10' },
    { title: 'Total Conversations', val: loading ? '—' : String(data?.totalConversations ?? 0), icon: MessageSquare, color: 'text-blue-500', bg: 'bg-blue-100' },
    { title: 'Active Tenants', val: loading ? '—' : String(data?.activeTenants ?? 0), icon: TrendingUp, color: 'text-purple-500', bg: 'bg-purple-100' },
  ];

  return (
    <div className="ml-64 p-8 w-full">
      <div className="mb-8 flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Platform Analytics</h1>
          <p className="text-gray-500">Live aggregate statistics across all SaaS tenants.</p>
        </div>
        <select className="border border-gray-200 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand">
          <option>Last 30 Days</option>
          <option>Last 90 Days</option>
          <option>Year to Date</option>
        </select>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-100 text-red-600 text-sm px-4 py-3 rounded-xl mb-6">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {stats.map((stat, i) => (
          <motion.div 
            key={i}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: i * 0.1 }}
            className="bg-white rounded-xl p-6 border border-gray-100 shadow-sm flex items-center gap-4"
          >
            <div className={`p-3 rounded-lg ${stat.bg}`}>
              <stat.icon className={`w-6 h-6 ${stat.color}`} />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-500">{stat.title}</p>
              <p className="text-2xl font-bold text-gray-900">{loading ? <Loader2 className="w-5 h-5 animate-spin text-gray-300" /> : stat.val}</p>
            </div>
          </motion.div>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 h-96 flex flex-col justify-center items-center">
        <BarChart3 className="w-16 h-16 text-gray-200 mb-4" />
        <p className="text-gray-500 font-medium">
          {loading ? 'Loading live platform metrics...' : `${data?.totalBookings ?? 0} bookings across ${data?.totalTenants ?? 0} tenants`}
        </p>
        <p className="text-sm text-gray-400 mt-2">Connected to live GlamBot database metrics.</p>
      </div>
    </div>
  );
}

