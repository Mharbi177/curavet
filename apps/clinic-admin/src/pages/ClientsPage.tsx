import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Search,
  Plus,
  User,
  Phone,
  Mail,
  MoreHorizontal,
  Edit2,
  Trash2,
  Star,
  Filter,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../hooks/useAuth';
import { formatDate, getInitials, cn } from '../lib/utils';
import toast from 'react-hot-toast';
import { useDebounce } from '../hooks/useDebounce';
import { useCurrency } from '../hooks/useCurrency';

import type { Client, PaginatedClients } from '../lib/types';
import type { ClientUpdate } from '../lib/api';
export function ClientsPage() {
  const { tenant } = useAuth();
  const { formatCurrency } = useCurrency();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [showModal, setShowModal] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [filterVip, setFilterVip] = useState(false);
  const [filterLanguage, setFilterLanguage] = useState('all');
  const debouncedSearch = useDebounce(search, 300);

  const { data, isLoading, error } = useQuery({
    queryKey: ['clients', tenant?.id, debouncedSearch, page, filterVip, filterLanguage],
    queryFn: () => api.getClients({ search: debouncedSearch, page, limit: 20 }),
    enabled: !!tenant,
  });

  const createMutation = useMutation({
    mutationFn: (data: { phone: string; name?: string; languagePreference?: string }) => api.createClient(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      toast.success('Client created successfully');
      setShowModal(false);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: ClientUpdate }) => api.updateClient(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      toast.success('Client updated successfully');
      setEditingClient(null);
      setShowModal(false);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.deleteClient(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      toast.success('Client deleted');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const phone = formData.get('phone') as string;
    const name = formData.get('name') as string;
    const languagePreference = formData.get('languagePreference') as string;
    const isVip = formData.get('isVip') === 'on';

    if (editingClient) {
      updateMutation.mutate({ id: editingClient.id, data: { phone, name, languagePreference, isVip } });
    } else {
      createMutation.mutate({ phone, name, languagePreference });
    }
  };

  const openEditModal = (client: Client) => {
    setEditingClient(client);
    setShowModal(true);
  };

  const openCreateModal = () => {
    setEditingClient(null);
    setShowModal(true);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Failed to load clients</p>
      </div>
    );
  }

  const clients = data?.clients || [];
  const total = data?.total || 0;

  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
      >
        <div>
          <h1 className="text-3xl font-bold text-foreground">Clients</h1>
          <p className="text-muted-foreground mt-1">Manage your client database</p>
        </div>
        <button
          onClick={openCreateModal}
          className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          Add Client
        </button>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="bg-card border border-border rounded-xl overflow-hidden"
      >
        <div className="p-4 border-b border-border flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search by name or phone..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="w-full pl-10 pr-4 py-2 border border-border rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
              <input
                type="checkbox"
                checked={filterVip}
                onChange={(e) => { setFilterVip(e.target.checked); setPage(1); }}
                className="rounded border-border text-primary focus:ring-primary"
              />
              VIP only
            </label>
            <select
              value={filterLanguage}
              onChange={(e) => { setFilterLanguage(e.target.value); setPage(1); }}
              className="px-3 py-2 border border-border rounded-lg text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="all">All Languages</option>
              <option value="en">English</option>
              <option value="ar">Arabic</option>
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Client</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Contact</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Language</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Bookings</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Total Spent</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Last Visit</th>
                <th className="px-4 py-3 text-right text-sm font-medium text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {clients.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-muted-foreground">
                    <User className="w-12 h-12 mx-auto mb-3 text-muted-foreground/50" />
                    <p>No clients found</p>
                    <p className="text-sm mt-1">Add your first client to get started</p>
                  </td>
                </tr>
              ) : (
                clients.map((client, index) => (
                  <motion.tr
                    key={client.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.03 }}
                    className="hover:bg-accent/50"
                  >
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                          <span className="text-sm font-medium text-primary">
                            {getInitials(client.name || client.phone)}
                          </span>
                        </div>
                        <div>
                          <p className="font-medium text-foreground">{client.name || 'Unnamed'}</p>
                          <p className="text-xs text-muted-foreground">{client.phone}</p>
                        </div>
                        {client.isVip && (
                          <Star className="w-4 h-4 text-amber-500 fill-current" aria-label="VIP Client" />
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex flex-col gap-1">
                        <span className="text-sm text-foreground">{client.phone}</span>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <span className={cn(
                        'px-2 py-1 rounded-full text-xs font-medium',
                        client.languagePreference === 'ar'
                          ? 'bg-blue-100 text-blue-700'
                          : 'bg-emerald-100 text-emerald-700'
                      )}>
                        {client.languagePreference === 'ar' ? 'Ø§Ù„Ø¹Ø±Ø¨ÙŠØ©' : 'English'}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-sm text-foreground">{client.bookingCount ?? 0}</td>
                    <td className="px-4 py-4 text-sm font-medium text-foreground">
                      {formatCurrency(client.totalSpent ?? 0)}
                    </td>
                    <td className="px-4 py-4 text-sm text-muted-foreground">
                      {formatDate(client.lastContactAt)}
                    </td>
                    <td className="px-4 py-4 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => openEditModal(client)}
                          className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                          aria-label="Edit client"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => {
                            if (confirm('Are you sure you want to delete this client?')) {
                              deleteMutation.mutate(client.id);
                            }
                          }}
                          className="p-2 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                          aria-label="Delete client"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </motion.tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {total > 20 && (
          <div className="p-4 border-t border-border flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Showing {((page - 1) * 20) + 1} to {Math.min(page * 20, total)} of {total} clients
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1.5 border border-border rounded-lg text-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => setPage(p => p + 1)}
                disabled={page * 20 >= total}
                className="px-3 py-1.5 border border-border rounded-lg text-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </motion.div>

      {/* Client Modal */}
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
            className="bg-card border border-border rounded-xl shadow-xl w-full max-w-md"
            onClick={e => e.stopPropagation()}
          >
            <div className="px-6 py-4 border-b border-border flex justify-between items-center">
              <h2 className="text-lg font-semibold text-foreground">
                {editingClient ? 'Edit Client' : 'Add New Client'}
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
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Phone *</label>
                <input
                  type="tel"
                  name="phone"
                  required
                  defaultValue={editingClient?.phone || ''}
                  className="w-full px-4 py-2 border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Name</label>
                <input
                  type="text"
                  name="name"
                  defaultValue={editingClient?.name || ''}
                  className="w-full px-4 py-2 border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Language</label>
                <select
                  name="languagePreference"
                  defaultValue={editingClient?.languagePreference || 'en'}
                  className="w-full px-4 py-2 border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="en">English</option>
                  <option value="ar">Arabic</option>
                </select>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  name="isVip"
                  id="isVip"
                  defaultChecked={editingClient?.isVip || false}
                  className="rounded border-border text-primary focus:ring-primary"
                />
                <label htmlFor="isVip" className="text-sm text-foreground">VIP Client</label>
              </div>
              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 px-4 py-2 border border-border rounded-lg text-sm font-medium hover:bg-accent"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createMutation.isPending || updateMutation.isPending}
                  className="flex-1 bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary/90"
                >
                  {createMutation.isPending || updateMutation.isPending ? 'Saving...' : 'Save'}
                </button>
              </div>
            </form>
          </motion.div>
        </motion.div>
      )}
    </div>
  );
}
