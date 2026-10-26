import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Bell,
  Shield,
  Globe,
  Palette,
  Key,
  Database,
  Save,
  Loader2,
  ToggleLeft,
  ToggleRight,
  MessageSquare,
  Calendar,
} from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../hooks/useAuth';
import { cn } from '../lib/utils';
import toast from 'react-hot-toast';

interface Settings {
  timezone: string;
  languageDefault: string;
  notificationPreferences: {
    emailBookings: boolean;
    emailReminders: boolean;
    emailMarketing: boolean;
    pushBookings: boolean;
    pushReminders: boolean;
    smsReminders: boolean;
  };
  branding: {
    logoUrl: string;
    primaryColor: string;
    botName: string;
  };
}

const TIMEZONES = [
  'Asia/Dubai', 'Asia/Riyadh', 'Asia/Qatar', 'Asia/Kuwait', 'Asia/Bahrain', 'Asia/Muscat',
  'Europe/London', 'Europe/Paris', 'Europe/Berlin', 'America/New_York', 'America/Los_Angeles',
  'UTC',
];

export function SettingsPage() {
  const { tenant, user } = useAuth();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'general' | 'notifications' | 'branding' | 'integrations'>('general');
  const [isSaving, setIsSaving] = useState(false);

  const { data: settings, isLoading } = useQuery({
    queryKey: ['settings', tenant?.id],
    queryFn: () => api.getSettings(),
    enabled: !!tenant,
  });

  const updateMutation = useMutation({
    mutationFn: (data: Partial<Settings>) => api.updateSettings(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      toast.success('Settings saved successfully');
      setIsSaving(false);
    },
    onError: (err: Error) => {
      toast.error(err.message);
      setIsSaving(false);
    },
  });

  const handleSave = (data: Partial<Settings>) => {
    setIsSaving(true);
    updateMutation.mutate(data);
  };

  const tabs = [
    { id: 'general', label: 'General', icon: Globe },
    { id: 'notifications', label: 'Notifications', icon: Bell },
  ];

  if (user?.role !== 'receptionist') {
    tabs.push(
      { id: 'branding', label: 'Branding', icon: Palette },
      { id: 'integrations', label: 'Integrations', icon: Key }
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  const s = settings || {
    timezone: 'Asia/Dubai',
    languageDefault: 'en',
    notificationPreferences: {
      emailBookings: true,
      emailReminders: true,
      emailMarketing: false,
      pushBookings: true,
      pushReminders: true,
      smsReminders: false,
    },
    branding: {
      logoUrl: '',
      primaryColor: '#ec4899',
      botName: 'CuraVet',
    },
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
      >
        <div>
          <h1 className="text-3xl font-bold text-foreground">Settings</h1>
          <p className="text-muted-foreground mt-1">Configure your salon preferences</p>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="bg-card border border-border rounded-xl overflow-hidden"
      >
        <div className="border-b border-border">
          <nav className="flex overflow-x-auto" aria-label="Settings tabs">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as typeof activeTab)}
                className={cn(
                  'flex items-center gap-2 px-6 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap',
                  activeTab === tab.id
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                )}
              >
                <tab.icon className="w-4 h-4" />
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        <div className="p-6">
          {activeTab === 'general' && (
            <GeneralSettings settings={s} onSave={handleSave} isSaving={isSaving} />
          )}
          {activeTab === 'notifications' && (
            <NotificationSettings settings={s} onSave={handleSave} isSaving={isSaving} />
          )}
          {activeTab === 'branding' && (
            <BrandingSettings settings={s} onSave={handleSave} isSaving={isSaving} />
          )}
          {activeTab === 'integrations' && (
            <IntegrationSettings settings={s} onSave={handleSave} isSaving={isSaving} />
          )}
        </div>
      </motion.div>
    </div>
  );
}

function GeneralSettings({ settings, onSave, isSaving }: { settings: Settings; onSave: (data: Partial<Settings>) => void; isSaving: boolean }) {
  const [timezone, setTimezone] = useState(settings.timezone);
  const [languageDefault, setLanguageDefault] = useState(settings.languageDefault);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({ timezone, languageDefault });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-foreground mb-4">General Settings</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Timezone</label>
            <select
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              className="w-full px-4 py-2 border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary"
            >
              {TIMEZONES.map(tz => (
                <option key={tz} value={tz}>{tz}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Default Language</label>
            <select
              value={languageDefault}
              onChange={(e) => setLanguageDefault(e.target.value)}
              className="w-full px-4 py-2 border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="en">English</option>
              <option value="ar">Arabic</option>
            </select>
          </div>
        </div>
      </div>

      <div className="pt-6 border-t border-border flex justify-end">
        <button
          type="submit"
          disabled={isSaving}
          className="px-6 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50 flex items-center gap-2"
        >
          {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {isSaving ? 'Saving...' : 'Save Changes'}
        </button>
      </div>
    </form>
  );
}

function NotificationSettings({ settings, onSave, isSaving }: { settings: Settings; onSave: (data: Partial<Settings>) => void; isSaving: boolean }) {
  const [prefs, setPrefs] = useState(settings.notificationPreferences);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({ notificationPreferences: prefs });
  };

  const toggle = (key: keyof typeof prefs) => {
    setPrefs(prev => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-foreground mb-4">Notification Preferences</h3>
        <p className="text-sm text-muted-foreground mb-6">
          Choose how you want to be notified about bookings, reminders, and marketing.
        </p>
      </div>

      <div className="space-y-4">
        {[
          { key: 'emailBookings', label: 'Email - New Bookings', desc: 'Receive email when a new booking is made' },
          { key: 'emailReminders', label: 'Email - Reminders', desc: 'Receive email reminders for upcoming appointments' },
          { key: 'emailMarketing', label: 'Email - Marketing', desc: 'Receive promotional emails and updates' },
          { key: 'pushBookings', label: 'Push - New Bookings', desc: 'Push notification for new bookings' },
          { key: 'pushReminders', label: 'Push - Reminders', desc: 'Push notification for appointment reminders' },
          { key: 'smsReminders', label: 'SMS - Reminders', desc: 'SMS reminders for appointments (requires Twilio)' },
        ].map(item => (
          <div key={item.key} className="flex items-center justify-between p-4 border border-border rounded-lg">
            <div>
              <p className="font-medium text-foreground">{item.label}</p>
              <p className="text-sm text-muted-foreground">{item.desc}</p>
            </div>
            <button
              type="button"
              onClick={() => toggle(item.key as keyof typeof prefs)}
              className={cn(
                'relative w-12 h-6 rounded-full transition-colors',
                prefs[item.key as keyof typeof prefs] ? 'bg-primary' : 'bg-gray-300'
              )}
              aria-label={item.label}
              aria-pressed={prefs[item.key as keyof typeof prefs]}
            >
              <span className={cn(
                'absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-md transition-transform',
                prefs[item.key as keyof typeof prefs] ? 'translate-x-6' : 'translate-x-0.5'
              )} />
            </button>
          </div>
        ))}
      </div>

      <div className="pt-6 border-t border-border flex justify-end">
        <button
          type="submit"
          disabled={isSaving}
          className="px-6 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50 flex items-center gap-2"
        >
          {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {isSaving ? 'Saving...' : 'Save Changes'}
        </button>
      </div>
    </form>
  );
}

function BrandingSettings({ settings, onSave, isSaving }: { settings: Settings; onSave: (data: Partial<Settings>) => void; isSaving: boolean }) {
  const [branding, setBranding] = useState(settings.branding);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({ branding });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-foreground mb-4">Branding & Appearance</h3>
        <p className="text-sm text-muted-foreground mb-6">
          Customize how your bot appears to clients on WhatsApp and web.
        </p>
      </div>

      <div className="space-y-6">
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">Bot Name</label>
          <input
            type="text"
            value={branding.botName}
            onChange={(e) => setBranding(prev => ({ ...prev, botName: e.target.value }))}
            className="w-full px-4 py-2 border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary"
            placeholder="CuraVet"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-foreground mb-1">Primary Color</label>
          <div className="flex items-center gap-4">
            <input
              type="color"
              value={branding.primaryColor}
              onChange={(e) => setBranding(prev => ({ ...prev, primaryColor: e.target.value }))}
              className="w-12 h-12 rounded-lg border border-border cursor-pointer"
            />
            <input
              type="text"
              value={branding.primaryColor}
              onChange={(e) => setBranding(prev => ({ ...prev, primaryColor: e.target.value }))}
              className="flex-1 px-4 py-2 border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary font-mono"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-foreground mb-1">Logo URL</label>
          <input
            type="url"
            value={branding.logoUrl}
            onChange={(e) => setBranding(prev => ({ ...prev, logoUrl: e.target.value }))}
            className="w-full px-4 py-2 border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary"
            placeholder="https://example.com/logo.png"
          />
          <p className="text-xs text-muted-foreground mt-1">Recommended: 200x200px, PNG or SVG</p>
        </div>

        <div className="p-4 border border-border rounded-lg bg-background/50">
          <p className="font-medium text-foreground mb-2">Preview</p>
          <div className="flex items-center gap-3 p-3 bg-white rounded-lg border" style={{ borderColor: branding.primaryColor }}>
            <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ backgroundColor: branding.primaryColor }}>
              <span className="text-white font-bold">{branding.botName.charAt(0)}</span>
            </div>
            <div>
              <p className="font-medium text-foreground">{branding.botName}</p>
              <p className="text-sm text-muted-foreground">Your AI Booking Assistant</p>
            </div>
          </div>
        </div>
      </div>

      <div className="pt-6 border-t border-border flex justify-end">
        <button
          type="submit"
          disabled={isSaving}
          className="px-6 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50 flex items-center gap-2"
        >
          {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {isSaving ? 'Saving...' : 'Save Changes'}
        </button>
      </div>
    </form>
  );
}

function IntegrationSettings({ settings: _settings, onSave: _onSave, isSaving: _isSaving }: { settings: Settings; onSave: (data: Partial<Settings>) => void; isSaving: boolean }) {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-foreground mb-4">Integrations</h3>
        <p className="text-sm text-muted-foreground mb-6">
          Manage your third-party integrations. Configure these in the Super Admin dashboard.
        </p>
      </div>

      <div className="space-y-4">
        {[
          { name: 'WhatsApp Business', icon: MessageSquare, status: 'connected', desc: 'WhatsApp Cloud API' },
          { name: 'Instagram DM', icon: MessageSquare, status: 'disconnected', desc: 'Meta Instagram Messaging' },
          { name: 'Stripe Payments', icon: Key, status: 'disconnected', desc: 'Accept payments via WhatsApp' },
          { name: 'Google Calendar', icon: Calendar, status: 'disconnected', desc: 'Sync bookings to calendar' },
        ].map(item => (
          <div key={item.name} className="flex items-center justify-between p-4 border border-border rounded-lg">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <item.icon className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="font-medium text-foreground">{item.name}</p>
                <p className="text-sm text-muted-foreground">{item.desc}</p>
              </div>
            </div>
            <span className={cn(
              'px-3 py-1 rounded-full text-xs font-medium',
              item.status === 'connected' ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-700'
            )}>
              {item.status === 'connected' ? 'Connected' : 'Not Connected'}
            </span>
          </div>
        ))}
      </div>

      <div className="pt-6 border-t border-border">
        <p className="text-sm text-muted-foreground">
          WhatsApp and Instagram integrations are configured at the platform level. Contact your administrator to set up new channels.
        </p>
      </div>
    </div>
  );
}