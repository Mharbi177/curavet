import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plus,
  Edit2,
  Trash2,
  UserCog,
  Clock,
  Calendar,
  ChevronDown,
  ChevronUp,
  Save,
  X,
} from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../hooks/useAuth';
import { cn } from '../lib/utils';
import toast from 'react-hot-toast';

import type { Staff as StaffMember } from '../lib/types';
interface WorkingHours {
  [day: string]: { start: string; end: string }[];
}

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export function StaffPage() {
  const { tenant } = useAuth();
  const queryClient = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [editingStaff, setEditingStaff] = useState<StaffMember | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data: staff, isLoading, error } = useQuery({
    queryKey: ['staff', tenant?.id],
    queryFn: () => api.getStaff(),
    enabled: !!tenant,
  });

  const { data: services } = useQuery({
    queryKey: ['services', tenant?.id],
    queryFn: () => api.getServices(),
    enabled: !!tenant,
  });

  const createMutation = useMutation({
    mutationFn: (data: { name: string; workingHoursJson: string; skillsJson: string }) => api.createStaff(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['staff'] });
      toast.success('Staff member added successfully');
      setShowModal(false);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<StaffMember> }) => api.updateStaff(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['staff'] });
      toast.success('Staff member updated successfully');
      setEditingStaff(null);
      setShowModal(false);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.deleteStaff(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['staff'] });
      toast.success('Staff member deleted');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const parseWorkingHours = (json: string): WorkingHours => {
    try {
      return JSON.parse(json || '{}');
    } catch {
      return {};
    }
  };

  const parseSkills = (json: string): string[] => {
    try {
      return JSON.parse(json || '[]');
    } catch {
      return [];
    }
  };

  const formatWorkingHours = (hours: WorkingHours): string => {
    return DAYS.map(day => {
      const shifts = hours[day] || [];
      if (shifts.length === 0) return `${day}: Closed`;
      return `${day}: ${shifts.map(s => `${s.start}-${s.end}`).join(', ')}`;
    }).join('; ');
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const name = formData.get('name') as string;
    
    // Build working hours JSON
    const workingHours: WorkingHours = {};
    DAYS.forEach(day => {
      const start = formData.get(`${day}_start`) as string;
      const end = formData.get(`${day}_end`) as string;
      if (start && end) {
        workingHours[day] = [{ start, end }];
      }
    });
    
    // Build skills JSON
    const skills: string[] = [];
    services?.forEach(service => {
      if (formData.get(`skill_${service.id}`) === 'on') {
        skills.push(service.id);
      }
    });

    const workingHoursJson = JSON.stringify(workingHours);
    const skillsJson = JSON.stringify(skills);

    if (editingStaff) {
      updateMutation.mutate({ id: editingStaff.id, data: { name, workingHoursJson, skillsJson } });
    } else {
      createMutation.mutate({ name, workingHoursJson, skillsJson });
    }
  };

  const openEditModal = (member: StaffMember) => {
    setEditingStaff(member);
    setShowModal(true);
  };

  const openCreateModal = () => {
    setEditingStaff(null);
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
        <p className="text-muted-foreground">Failed to load staff</p>
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
          <h1 className="text-3xl font-bold text-foreground">Staff</h1>
          <p className="text-muted-foreground mt-1">Manage your team and their schedules</p>
        </div>
        <button
          onClick={openCreateModal}
          className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          Add Staff
        </button>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="bg-card border border-border rounded-xl overflow-hidden"
      >
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Staff Member</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Skills</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Working Hours</th>
                <th className="px-4 py-3 text-right text-sm font-medium text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {staff?.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-12 text-center text-muted-foreground">
                    <UserCog className="w-12 h-12 mx-auto mb-3 text-muted-foreground/50" />
                    <p>No staff members yet</p>
                    <p className="text-sm mt-1">Add your first team member</p>
                  </td>
                </tr>
              ) : (
                staff?.map((member, index) => (
                  <React.Fragment key={member.id}>
                    <motion.tr
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.03 }}
                      className="hover:bg-accent/50 cursor-pointer"
                      onClick={() => setExpandedId(prev => prev === member.id ? null : member.id)}
                    >
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                            <UserCog className="w-5 h-5 text-primary" />
                          </div>
                          <div>
                            <p className="font-medium text-foreground">{member.name}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex flex-wrap gap-1">
                          {parseSkills(member.skillsJson).map(skillId => {
                            const service = services?.find(s => s.id === skillId);
                            return service ? (
                              <span key={skillId} className="px-2 py-0.5 bg-primary/10 text-primary text-xs rounded-full">
                                {service.nameEn}
                              </span>
                            ) : null;
                          })}
                          {parseSkills(member.skillsJson).length === 0 && (
                            <span className="text-xs text-muted-foreground">No skills assigned</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-4 text-sm text-muted-foreground max-w-xs truncate">
                        {formatWorkingHours(parseWorkingHours(member.workingHoursJson))}
                      </td>
                      <td className="px-4 py-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={(e) => { e.stopPropagation(); openEditModal(member); }}
                            className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                            aria-label="Edit staff"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); if (confirm('Delete this staff member?')) deleteMutation.mutate(member.id); }}
                            className="p-2 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                            aria-label="Delete staff"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </motion.tr>
                    {expandedId === member.id && (
                      <tr className="bg-accent/30">
                        <td colSpan={4} className="px-4 py-4">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                            <div>
                              <p className="font-medium text-foreground">Skills:</p>
                              <p className="text-muted-foreground">
                                {parseSkills(member.skillsJson).map(id => services?.find(s => s.id === id)?.nameEn).filter(Boolean).join(', ') || 'None'}
                              </p>
                            </div>
                            <div>
                              <p className="font-medium text-foreground">Weekly Schedule:</p>
                              <div className="text-muted-foreground space-y-1">
                                {DAYS.map(day => {
                                  const shifts = parseWorkingHours(member.workingHoursJson)[day] || [];
                                  return shifts.length > 0 ? (
                                    <div key={day} className="flex justify-between">
                                      <span>{day}:</span>
                                      <span>{shifts.map(s => `${s.start}-${s.end}`).join(', ')}</span>
                                    </div>
                                  ) : (
                                    <div key={day} className="flex justify-between">
                                      <span>{day}:</span>
                                      <span className="text-muted-foreground/50">Closed</span>
                                    </div>
                                  );
                                })}
                              </div>
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

      {/* Staff Modal */}
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
                {editingStaff ? 'Edit Staff Member' : 'Add New Staff Member'}
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
                <label className="block text-sm font-medium text-foreground mb-1">Name *</label>
                <input
                  type="text"
                  name="name"
                  required
                  defaultValue={editingStaff?.name || ''}
                  className="w-full px-4 py-2 border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-3">Skills (Services they can perform)</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {services?.map(service => (
                    <label key={service.id} className="flex items-center gap-2 p-2 border border-border rounded-lg hover:bg-accent/50 cursor-pointer">
                      <input
                        type="checkbox"
                        name={`skill_${service.id}`}
                        defaultChecked={parseSkills(editingStaff?.skillsJson || '[]').includes(service.id)}
                        className="rounded border-border text-primary focus:ring-primary"
                      />
                      <span className="text-sm text-foreground">{service.nameEn}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-3">Working Hours</label>
                <div className="space-y-3">
                  {DAYS.map(day => {
                    const hours = parseWorkingHours(editingStaff?.workingHoursJson || '{}');
                    const shift = hours[day]?.[0] || { start: '', end: '' };
                    return (
                      <div key={day} className="grid grid-cols-3 gap-3 items-center">
                        <label className="text-sm font-medium text-foreground w-24">{day}</label>
                        <div className="flex items-center gap-2">
                          <input
                            type="time"
                            name={`${day}_start`}
                            defaultValue={shift.start}
                            className="flex-1 px-3 py-2 border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary"
                          />
                          <span className="text-muted-foreground">to</span>
                          <input
                            type="time"
                            name={`${day}_end`}
                            defaultValue={shift.end}
                            className="flex-1 px-3 py-2 border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary"
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
                <p className="text-xs text-muted-foreground mt-2">Leave empty for days off</p>
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
