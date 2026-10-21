import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Menu, Bell, User, LogOut, ChevronDown,
  Settings, Plus, Calendar, MessageCircle,
  CheckCircle2, X,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { useAuth } from '../../hooks/useAuth';
import { useRealtimeConversations } from '../../hooks/useRealtimeConversations';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { Button } from '../ui/Button';

interface HeaderProps {
  onMenuClick: () => void;
}

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

function getGreetingEmoji(): string {
  const hour = new Date().getHours();
  if (hour < 12) return '☀️';
  if (hour < 17) return '👋';
  return '🌙';
}

const PAGE_TITLES: Record<string, string> = {
  dashboard: 'Dashboard',
  calendar: 'Calendar',
  clients: 'Clients',
  services: 'Services',
  staff: 'Team',
  conversations: 'Conversations',
  broadcast: 'Broadcast',
  analytics: 'Analytics',
  settings: 'Settings',
};

interface NotificationItem {
  id: string;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  desc: string;
  time: string;
  dotClass: string;
  href: string;
  read: boolean;
}

function useNotifications() {
  const { tenant } = useAuth();

  const { data: recentBookings } = useQuery({
    queryKey: ['dashboard', 'stats', tenant?.id],
    queryFn: () => api.getDashboardStats(),
    enabled: !!tenant,
    staleTime: 30_000,
    select: (d) => d.recentBookings ?? [],
  });

  const { data: conversations } = useQuery({
    queryKey: ['conversations', tenant?.id],
    queryFn: () => api.getConversations({ status: 'active' }),
    enabled: !!tenant,
    staleTime: 15_000,
  });

  const notifications: NotificationItem[] = [];

  (recentBookings ?? []).slice(0, 2).forEach((b) => {
    notifications.push({
      id: `booking-${b.id}`,
      icon: Calendar,
      title: 'New Booking',
      desc: `${b.client.name || b.client.phone} booked ${b.service.nameEn}`,
      time: 'Just now',
      dotClass: 'bg-brand text-white',
      href: '/calendar',
      read: false,
    });
  });

  const unread = conversations?.filter((c) => c.status === 'active').slice(0, 2) ?? [];
  unread.forEach((c) => {
    notifications.push({
      id: `conv-${c.id}`,
      icon: MessageCircle,
      title: 'New Message',
      desc: `Message from ${c.client?.name || c.client?.phone || 'a client'}`,
      time: 'Recently',
      dotClass: 'bg-warning text-text-primary',
      href: `/conversations?id=${c.id}`,
      read: false,
    });
  });

  notifications.push({
    id: 'reminder-static',
    icon: CheckCircle2,
    title: '24h Reminders Sent',
    desc: 'Automated reminders sent to clients with upcoming appointments',
    time: '1 hour ago',
    dotClass: 'bg-success text-white',
    href: '/broadcast',
    read: true,
  });

  return notifications.slice(0, 6);
}

export function Header({ onMenuClick }: HeaderProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { tenant, user, logout } = useAuth();
  const [showUserMenu, setShowUserMenu] = React.useState(false);
  const [showNotifications, setShowNotifications] = React.useState(false);
  const [readIds, setReadIds] = React.useState<Set<string>>(new Set());

  const segment = location.pathname.split('/')[1] || 'dashboard';
  const pageTitle = PAGE_TITLES[segment] ?? 'Dashboard';
  const isDashboard = segment === 'dashboard' || segment === '';

  const notifications = useNotifications();
  const unreadCount = notifications.filter((n) => !n.read && !readIds.has(n.id)).length;

  useRealtimeConversations({ tenantId: tenant?.id, enabled: !!tenant });

  React.useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as Element;
      if (!target.closest('[data-header-menu]')) {
        setShowUserMenu(false);
        setShowNotifications(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleNotificationClick = (notif: NotificationItem) => {
    setReadIds((prev) => new Set([...prev, notif.id]));
    setShowNotifications(false);
    navigate(notif.href);
  };

  const markAllRead = () => setReadIds(new Set(notifications.map((n) => n.id)));

  return (
    <header className="sticky top-0 z-30 w-full border-b border-border bg-background/95 backdrop-blur-md supports-[backdrop-filter]:bg-background/80">
      <div className="flex h-16 items-center justify-between px-4 lg:px-8 gap-4">

        {/* ── Left ── */}
        <div className="flex items-center gap-3 min-w-0">
          <button
            className="lg:hidden min-w-[40px] min-h-[40px] flex items-center justify-center rounded-xl text-text-muted hover:text-text-primary hover:bg-slate-100 transition-colors"
            onClick={onMenuClick}
            aria-label="Open navigation menu"
          >
            <Menu className="w-5 h-5" />
          </button>

          <div className="min-w-0">
            {isDashboard ? (
              <>
                <h1 className="text-base font-bold text-text-primary leading-tight truncate">
                  {getGreeting()}, {tenant?.name?.split(' ')[0] || 'there'}! {getGreetingEmoji()}
                </h1>
                <p className="text-xs text-text-muted hidden sm:block">
                  {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
                </p>
              </>
            ) : (
              <h1 className="text-base font-bold text-text-primary leading-tight">{pageTitle}</h1>
            )}
          </div>
        </div>

        {/* ── Right ── */}
        <div className="flex items-center gap-2 flex-shrink-0" data-header-menu>

          {/* New Booking CTA */}
          <Button
            id="header-new-booking"
            size="sm"
            onClick={() => navigate('/calendar?new=true')}
            aria-label="New Booking"
            className="gap-1.5"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">New Booking</span>
          </Button>

          {/* Notifications */}
          <div className="relative">
            <button
              className="relative w-10 h-10 flex items-center justify-center rounded-xl text-text-muted hover:text-text-primary hover:bg-slate-100 transition-colors"
              onClick={() => { setShowNotifications(!showNotifications); setShowUserMenu(false); }}
              aria-label="View notifications"
              aria-expanded={showNotifications}
            >
              <Bell className="w-[18px] h-[18px]" />
              {unreadCount > 0 && (
                <motion.span
                  key={unreadCount}
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  className="absolute top-1.5 right-1.5 min-w-[16px] h-4 px-0.5 bg-danger text-white rounded-full text-[10px] font-bold flex items-center justify-center border-2 border-background"
                >
                  {unreadCount > 9 ? '9+' : unreadCount}
                </motion.span>
              )}
            </button>

            <AnimatePresence>
              {showNotifications && (
                <motion.div
                  initial={{ opacity: 0, y: 8, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 8, scale: 0.96 }}
                  transition={{ duration: 0.15, ease: 'easeOut' }}
                  className="absolute right-0 mt-2 w-[min(380px,calc(100vw-2rem))] rounded-2xl border border-border bg-surface shadow-2xl z-50 overflow-hidden"
                  role="menu"
                  aria-label="Notifications"
                >
                  <div className="flex items-center justify-between px-5 py-4 border-b border-border">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-bold text-text-primary">Notifications</p>
                      {unreadCount > 0 && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-brand/10 text-brand font-semibold">
                          {unreadCount} new
                        </span>
                      )}
                    </div>
                    {unreadCount > 0 && (
                      <button
                        onClick={markAllRead}
                        className="text-xs text-brand hover:underline font-semibold"
                      >
                        Mark all read
                      </button>
                    )}
                  </div>

                  <div className="divide-y divide-border max-h-80 overflow-y-auto">
                    {notifications.length === 0 ? (
                      <div className="px-5 py-10 text-center">
                        <Bell className="w-8 h-8 mx-auto mb-2 text-text-muted/30" />
                        <p className="text-sm text-text-muted">No notifications yet</p>
                      </div>
                    ) : (
                      notifications.map((notif) => {
                        const Icon = notif.icon;
                        const isRead = notif.read || readIds.has(notif.id);
                        return (
                          <button
                            key={notif.id}
                            role="menuitem"
                            onClick={() => handleNotificationClick(notif)}
                            className={cn(
                              'w-full text-left flex gap-3.5 px-5 py-4 hover:bg-slate-50 transition-colors',
                              !isRead && 'bg-brand/[0.02]'
                            )}
                          >
                            <div className="relative flex-shrink-0 mt-0.5">
                              <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center', notif.dotClass)}>
                                <Icon className="w-4 h-4" />
                              </div>
                              {!isRead && (
                                <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-brand border-2 border-background" />
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className={cn('text-sm font-semibold text-text-primary', isRead && 'opacity-70')}>{notif.title}</p>
                              <p className="text-xs text-text-muted mt-0.5 line-clamp-2">{notif.desc}</p>
                              <p className="text-[10px] text-text-muted/60 mt-1">{notif.time}</p>
                            </div>
                            {!isRead && <div className="w-2 h-2 rounded-full flex-shrink-0 mt-2 bg-brand" />}
                          </button>
                        );
                      })
                    )}
                  </div>

                  <div className="px-5 py-3 border-t border-border bg-slate-50">
                    <button
                      className="w-full text-sm font-semibold text-brand hover:underline focus-visible:outline-none"
                      onClick={() => { setShowNotifications(false); navigate('/conversations'); }}
                    >
                      View all activity →
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* User menu */}
          <div className="relative">
            <button
              className="flex items-center gap-2 h-10 px-2.5 rounded-xl hover:bg-slate-100 transition-colors"
              onClick={() => { setShowUserMenu(!showUserMenu); setShowNotifications(false); }}
              aria-label="Open user menu"
              aria-expanded={showUserMenu}
            >
              <div className="w-8 h-8 rounded-full bg-brand flex items-center justify-center flex-shrink-0">
                <span className="text-xs font-bold text-white">
                  {(user?.name || tenant?.name || 'S').charAt(0).toUpperCase()}
                </span>
              </div>
              <span className="hidden md:block text-sm font-semibold text-text-primary max-w-[120px] truncate">
                {user?.name || tenant?.name || 'Clinic'}
              </span>
              <ChevronDown className={cn('w-3.5 h-3.5 text-text-muted flex-shrink-0 transition-transform', showUserMenu && 'rotate-180')} />
            </button>

            <AnimatePresence>
              {showUserMenu && (
                <motion.div
                  initial={{ opacity: 0, y: 8, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 8, scale: 0.96 }}
                  transition={{ duration: 0.15, ease: 'easeOut' }}
                  className="absolute right-0 mt-2 w-56 rounded-2xl border border-border bg-surface py-2 shadow-xl z-50"
                  role="menu"
                >
                  <div className="px-4 py-3 border-b border-border mb-1">
                    <p className="text-xs font-semibold text-text-muted uppercase tracking-wider">Account</p>
                    <p className="text-sm font-bold text-text-primary mt-1 truncate">{user?.name || tenant?.name || 'Clinic'}</p>
                    {user?.role === 'staff' && (
                      <span className="text-xs text-brand font-semibold">Staff Member</span>
                    )}
                  </div>
                  <Link
                    to="/settings"
                    className="flex items-center gap-2.5 px-4 py-2.5 text-sm font-medium text-text-primary hover:bg-slate-50 transition-colors mx-1 rounded-xl"
                    role="menuitem"
                    onClick={() => setShowUserMenu(false)}
                  >
                    <Settings className="w-4 h-4 text-text-muted" />
                    Settings
                  </Link>
                  <button
                    className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm font-semibold text-danger hover:bg-danger/10 transition-colors mx-1 rounded-xl"
                    role="menuitem"
                    onClick={logout}
                  >
                    <LogOut className="w-4 h-4" />
                    Sign out
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </header>
  );
}