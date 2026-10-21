
import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard, CalendarDays, Users, MessageSquare, Settings,
  BarChart2, Megaphone, Activity, UserCog, ChevronRight, LogOut,
  Stethoscope, ClipboardList, Shield,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { clearAuthToken } from '../../lib/auth';
import { useAuth } from '../../hooks/useAuth';

interface SidebarProps { isOpen: boolean; onClose: () => void; }

const ADMIN_NAV = [
  { name: 'Dashboard',        href: '/dashboard',     icon: LayoutDashboard },
  { name: 'Calendar',         href: '/calendar',       icon: CalendarDays },
  { name: 'Conversations',    href: '/conversations',  icon: MessageSquare },
  { name: 'Patients & Owners', href: '/clients',       icon: Users },
  { name: 'Treatments',       href: '/services',       icon: Activity },
  { name: 'Veterinary Team',  href: '/staff',          icon: UserCog },
  { name: 'Broadcast',        href: '/broadcast',      icon: Megaphone },
  { name: 'Analytics',        href: '/analytics',      icon: BarChart2 },
  { name: 'Settings',         href: '/settings',       icon: Settings },
];

const VET_NAV = [
  { name: 'My Rounds',        href: '/my-workflow',   icon: Stethoscope },
  { name: 'Calendar',         href: '/calendar',       icon: CalendarDays },
  { name: 'Conversations',    href: '/conversations',  icon: MessageSquare },
  { name: 'My Schedule',      href: '/workflow',       icon: ClipboardList },
  { name: 'Settings',         href: '/settings',       icon: Settings },
];

export function Sidebar({ isOpen, onClose }: SidebarProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, tenant } = useAuth();

  const isStaff = user?.role === 'staff';
  const isSuperAdmin = user?.role === 'super_admin';
  const nav = isStaff ? VET_NAV : ADMIN_NAV;

  const roleLabel = isSuperAdmin ? 'Super Administrator' : isStaff ? 'Veterinarian' : 'Practice Manager';
  const roleBadge = isSuperAdmin
    ? { text: 'SUPER ADMIN', cls: 'bg-violet-500/20 text-violet-300' }
    : isStaff
    ? { text: 'VET STAFF', cls: 'bg-emerald-500/20 text-emerald-300' }
    : { text: 'ADMIN', cls: 'bg-sky-500/20 text-sky-300' };

  const handleLogout = () => {
    clearAuthToken();
    navigate('/login');
  };

  return (
    <>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden"
            onClick={onClose} aria-hidden="true"
          />
        )}
      </AnimatePresence>

      <aside
        className={cn(
          'fixed top-0 left-0 z-50 h-screen w-64 flex flex-col transition-transform duration-300 ease-in-out lg:translate-x-0 sidebar-bg sidebar-border border-r',
          isOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        {/* Logo */}
        <div className="flex h-16 items-center gap-3 px-5 border-b sidebar-border">
          <div className="w-9 h-9 rounded-xl bg-emerald-600 flex items-center justify-center shadow-lg shadow-emerald-500/30 flex-shrink-0">
            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-white text-sm tracking-tight truncate">CuraVet</p>
            {tenant && <p className="text-[10px] truncate" style={{ color: 'hsl(var(--sidebar-fg))' }}>{tenant.name}</p>}
          </div>
          <button className="lg:hidden text-slate-400 hover:text-white" onClick={onClose}>
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {/* Role badge */}
        <div className="px-4 pt-4 pb-1">
          <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded-full tracking-wider uppercase', roleBadge.cls)}>
            {roleBadge.text}
          </span>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-2 space-y-0.5 overflow-y-auto scrollbar-hide">
          {nav.map((item) => {
            const isActive = location.pathname === item.href || location.pathname.startsWith(item.href + '/');
            return (
              <Link
                key={item.name} to={item.href} onClick={onClose}
                className={cn('sidebar-item', isActive && 'active')}
                aria-current={isActive ? 'page' : undefined}
              >
                <item.icon className="w-[18px] h-[18px] flex-shrink-0" />
                <span>{item.name}</span>
                {isActive && (
                  <motion.div layoutId="sidebar-active-dot" className="ml-auto w-1.5 h-1.5 rounded-full bg-white/70" />
                )}
              </Link>
            );
          })}
        </nav>

        {/* User footer */}
        <div className="p-4 border-t sidebar-border space-y-2">
          <div className="flex items-center gap-3 px-2 py-1.5 rounded-lg">
            <div className="w-8 h-8 rounded-full bg-emerald-600/25 border border-emerald-500/30 flex items-center justify-center flex-shrink-0">
              <span className="text-xs font-bold text-emerald-300">
                {(user?.name || user?.email || 'U')[0].toUpperCase()}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-white truncate">{user?.name || 'CuraVet User'}</p>
              <p className="text-[11px] truncate" style={{ color: 'hsl(var(--sidebar-fg))' }}>{roleLabel}</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-2 py-2 rounded-lg text-sm font-medium transition-colors hover:bg-red-500/10 hover:text-red-400"
            style={{ color: 'hsl(var(--sidebar-fg))' }}
          >
            <LogOut className="w-[18px] h-[18px] flex-shrink-0" />
            <span>Sign out</span>
          </button>
        </div>
      </aside>
    </>
  );
}
