import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plus,
  Send,
  Users,
  Clock,
  Trash2,
  Edit2,
  Eye,
  ChevronDown,
  ChevronUp,
  MessageSquare,
  Filter,
} from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../hooks/useAuth';
import { formatDateTime, cn } from '../lib/utils';
import toast from 'react-hot-toast';

import type { Broadcast, Client } from '../lib/types';
export function BroadcastPage() {
  const { tenant } = useAuth();
  const queryClient = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [editingBroadcast, setEditingBroadcast] = useState<Broadcast | null>(null);
  const [activeTab, setActiveTab] = useState<'drafts' | 'sent'>('drafts');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data: broadcasts, isLoading: broadcastsLoading } = useQuery({
    queryKey: ['broadcasts', tenant?.id],
    queryFn: () => api.getBroadcasts(),
    enabled: !!tenant,
  });

  const { data: clients } = useQuery({
    queryKey: ['clients', tenant?.id, '', 1, false, 'all'],
    queryFn: () => api.getClients({ limit: 1000 }),
    enabled: !!tenant,
  });

  const createMutation = useMutation({
    mutationFn: (data: {
      name: string;
      message: string;
      audience: 'all' | 'inactive' | 'vip' | 'custom';
      customClientIds?: string[];
      scheduledAt?: string;
    }) => api.createBroadcast(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['broadcasts'] });
      toast.success('Broadcast created successfully');
      setShowModal(false);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.deleteBroadcast(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['broadcasts'] });
      toast.success('Broadcast deleted');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const sendNowMutation = useMutation({
    mutationFn: (id: string) => api.sendBroadcastNow(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['broadcasts'] });
      toast.success('Broadcast sent!');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const name = formData.get('name') as string;
    const message = formData.get('message') as string;
    const audience = formData.get('audience') as 'all' | 'inactive' | 'vip' | 'custom';
    const scheduledAt = formData.get('scheduledAt') as string;
    const customClientIds = audience === 'custom' 
      ? Array.from(formData.getAll('customClientIds') as string[])
      : undefined;

    if (editingBroadcast) {
      // Update would need an update endpoint
      toast.error('Editing not implemented yet');
    } else {
      createMutation.mutate({ name, message, audience, customClientIds, scheduledAt: scheduledAt || undefined });
    }
  };

  const openCreateModal = () => {
    setEditingBroadcast(null);
    setShowModal(true);
  };

  const getAudienceLabel = (audience: string) => {
    switch (audience) {
      case 'all': return 'All Clients';
      case 'inactive': return 'Inactive (>30 days)';
      case 'vip': return 'VIP Clients';
      case 'custom': return 'Custom Selection';
      default: return audience;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'sent': return 'bg-emerald-100 text-emerald-700';
      case 'scheduled': return 'bg-blue-100 text-blue-700';
      case 'draft': return 'bg-gray-100 text-gray-700';
      case 'failed': return 'bg-red-100 text-red-700';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  const filteredBroadcasts = broadcasts?.filter(b => 
    activeTab === 'sent' ? b.status === 'sent' : b.status !== 'sent'
  ) || [];

  if (broadcastsLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
      >
        <div>
          <h1 className="text-3xl font-bold text-foreground">Broadcasts</h1>
          <p className="text-muted-foreground mt-1">Send WhatsApp campaigns to your clients</p>
        </div>
        <button
          onClick={openCreateModal}
          className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          New Broadcast
        </button>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="bg-card border border-border rounded-xl overflow-hidden"
      >
        <div className="border-b border-border">
          <nav className="flex" aria-label="Broadcast tabs">
            <button
              onClick={() => setActiveTab('drafts')}
              className={cn(
                'px-6 py-3 text-sm font-medium border-b-2 transition-colors',
                activeTab === 'drafts'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              )}
            >
              Drafts & Scheduled
            </button>
            <button
              onClick={() => setActiveTab('sent')}
              className={cn(
                'px-6 py-3 text-sm font-medium border-b-2 transition-colors',
                activeTab === 'sent'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              )}
            >
              Sent
            </button>
          </nav>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Campaign</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Audience</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Recipients</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Status</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Schedule</th>
                <th className="px-4 py-3 text-right text-sm font-medium text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredBroadcasts.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-muted-foreground">
                    <MessageSquare className="w-12 h-12 mx-auto mb-3 text-muted-foreground/50" />
                    <p>No broadcasts yet</p>
                    <p className="text-sm mt-1">Create your first campaign to reach clients</p>
                  </td>
                </tr>
              ) : (
                filteredBroadcasts.map((broadcast, index) => (
                  <React.Fragment key={broadcast.id}>
                    <motion.tr
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.03 }}
                      className="hover:bg-accent/50 cursor-pointer"
                      onClick={() => setExpandedId(prev => prev === broadcast.id ? null : broadcast.id)}
                    >
                      <td className="px-4 py-4">
                        <p className="font-medium text-foreground">{broadcast.name}</p>
                        <p className="text-sm text-muted-foreground truncate max-w-xs">{broadcast.message}</p>
                      </td>
                      <td className="px-4 py-4">
                        <span className="px-2 py-1 bg-primary/10 text-primary text-xs rounded-full">
                          {getAudienceLabel(broadcast.audience)}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-sm text-foreground">
                        {broadcast.recipientCount}
                      </td>
                      <td className="px-4 py-4">
                        <span className={cn('px-2.5 py-1 rounded-full text-xs font-medium', getStatusColor(broadcast.status))}>
                          {broadcast.status.charAt(0).toUpperCase() + broadcast.status.slice(1)}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-sm text-muted-foreground">
                        {broadcast.scheduledAt ? formatDateTime(broadcast.scheduledAt) : 'Immediate'}
                        {broadcast.sentAt && <span className="ml-2 text-xs text-emerald-600">Sent: {formatDateTime(broadcast.sentAt)}</span>}
                      </td>
                      <td className="px-4 py-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {broadcast.status === 'draft' && (
                            <button
                              onClick={(e) => { e.stopPropagation(); sendNowMutation.mutate(broadcast.id); }}
                              disabled={sendNowMutation.isPending}
                              className="px-3 py-1.5 bg-primary text-primary-foreground text-xs rounded-lg hover:bg-primary/90 transition-colors"
                            >
                              <Send className="w-3 h-3 mr-1" /> Send Now
                            </button>
                          )}
                          <button
                            onClick={(e) => { e.stopPropagation(); setEditingBroadcast(broadcast); setShowModal(true); }}
                            className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                            aria-label="Edit broadcast"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); if (confirm('Delete this broadcast?')) deleteMutation.mutate(broadcast.id); }}
                            className="p-2 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                            aria-label="Delete broadcast"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </motion.tr>
                    {expandedId === broadcast.id && (
                      <tr className="bg-accent/30">
                        <td colSpan={6} className="px-4 py-4">
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                            <div>
                              <p className="font-medium text-foreground">Message:</p>
                              <p className="text-muted-foreground whitespace-pre-wrap">{broadcast.message}</p>
                            </div>
                            <div>
                              <p className="font-medium text-foreground">Stats:</p>
                              <div className="space-y-1 text-muted-foreground">
                                <div className="flex justify-between">
                                  <span>Delivered:</span>
                                  <span className="font-medium">{broadcast.deliveredCount}</span>
                                </div>
                                <div className="flex justify-between">
                                  <span>Read:</span>
                                  <span className="font-medium">{broadcast.readCount}</span>
                                </div>
                                <div className="flex justify-between">
                                  <span>Read Rate:</span>
                                  <span className="font-medium">
                                    {broadcast.deliveredCount > 0 
                                      ? Math.round((broadcast.readCount / broadcast.deliveredCount) * 100) + '%' 
                                      : '0%'}
                                  </span>
                                </div>
                              </div>
                            </div>
                            <div>
                              <p className="font-medium text-foreground">Audience Details:</p>
                              <p className="text-muted-foreground">
                                {getAudienceLabel(broadcast.audience)}
                                {broadcast.audience === 'custom' && broadcast.customClientIds && (
                                  <span className="ml-2">({broadcast.customClientIds.length} clients)</span>
                                )}
                              </p>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))
              )}
            </tbody>
          </table>
        </div>
      </motion.div>

      {/* Broadcast Modal */}
      {showModal && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
          onClick={() => setShowModal(false)}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="bg-card border border-border rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            <div className="px-6 py-4 border-b border-border flex justify-between items-center sticky top-0 bg-card/95 backdrop-blur">
              <h2 className="text-lg font-semibold text-foreground">
                {editingBroadcast ? 'Edit Broadcast' : 'Create New Broadcast'}
              </h2>
              <button
                onClick={() => setShowModal(false)}
                className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-6">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Campaign Name *</label>
                <input
                  type="text"
                  name="name"
                  required
                  defaultValue={editingBroadcast?.name || ''}
                  placeholder="e.g., Summer Promotion"
                  className="w-full px-4 py-2 border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Message *</label>
                <textarea
                  name="message"
                  required
                  rows={4}
                  defaultValue={editingBroadcast?.message || ''}
                  placeholder="Your message here... Use {{name}} for personalization"
                  className="w-full px-4 py-2 border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  {'Use {{name}} to personalize with the client name'}
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-3">Audience</label>
                <div className="space-y-3">
                  {[
                    { value: 'all', label: 'All Clients', desc: 'Send to everyone in your database' },
                    { value: 'inactive', label: 'Inactive Clients', desc: 'Clients who haven\'t visited in 30+ days' },
                    { value: 'vip', label: 'VIP Clients', desc: 'Only your VIP tagged clients' },
                    { value: 'custom', label: 'Custom Selection', desc: 'Pick specific clients' },
                  ].map(option => (
                    <label key={option.value} className="flex items-start gap-3 p-3 border border-border rounded-lg cursor-pointer hover:bg-accent/50">
                      <input
                        type="radio"
                        name="audience"
                        value={option.value}
                        defaultChecked={editingBroadcast?.audience === option.value || (!editingBroadcast && option.value === 'all')}
                        className="mt-1 rounded border-border text-primary focus:ring-primary"
                      />
                      <div>
                        <p className="font-medium text-foreground">{option.label}</p>
                        <p className="text-xs text-muted-foreground">{option.desc}</p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              <div id="custom-clients" className="border border-border rounded-lg p-4">
                <label className="block text-sm font-medium text-foreground mb-3">Select Clients</label>
                <div className="max-h-60 overflow-y-auto space-y-2">
                  {clients?.clients?.map(client => (
                    <label key={client.id} className="flex items-center gap-2 p-2 border border-border rounded-lg hover:bg-accent/50 cursor-pointer">
                      <input
                        type="checkbox"
                        name="customClientIds"
                        value={client.id}
                        className="rounded border-border text-primary focus:ring-primary"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">
                          {client.name || 'Unnamed'}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          {client.phone} {client.isVip && 'â­ VIP'}
                        </p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Schedule (Optional)</label>
                <input
                  type="datetime-local"
                  name="scheduledAt"
                  defaultValue={editingBroadcast?.scheduledAt ? new Date(editingBroadcast.scheduledAt).toISOString().slice(0, 16) : ''}
                  className="w-full px-4 py-2 border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary"
                />
                <p className="text-xs text-muted-foreground mt-1">Leave empty to send immediately</p>
              </div>

              <div className="flex gap-3 pt-4 border-t border-border">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 px-4 py-2 border border-border rounded-lg text-sm font-medium hover:bg-accent"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createMutation.isPending}
                  className="flex-1 bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary/90"
                >
                  {createMutation.isPending ? 'Creating...' : 'Create Broadcast'}
                </button>
              </div>
            </form>
          </motion.div>
        </motion.div>
      )}
    </div>
  );
}
