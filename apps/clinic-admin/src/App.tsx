
import React, { useEffect } from 'react';
import { Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import { Toaster } from 'react-hot-toast';
import { Sidebar } from './components/layout/Sidebar';
import { Header } from './components/layout/Header';
import { LoginPage } from './pages/LoginPage';
import { AdminDashboardPage } from './pages/AdminDashboardPage';
import { VetDashboardPage } from './pages/VetDashboardPage';
import { CalendarPage } from './pages/CalendarPage';
import { ClientsPage } from './pages/ClientsPage';
import { ConversationsPage } from './pages/ConversationsPage';
import { ServicesPage } from './pages/ServicesPage';
import { StaffPage } from './pages/StaffPage';
import { BroadcastPage } from './pages/BroadcastPage';
import { AnalyticsPage } from './pages/AnalyticsPage';
import { SettingsPage } from './pages/SettingsPage';
import { StaffWorkflowPage } from './pages/StaffWorkflowPage';
import { useAuth } from './hooks/useAuth';

function ProtectedRoute({ children, adminOnly = false }: { children: React.ReactNode; adminOnly?: boolean }) {
  const { isAuthenticated, isLoading, tenant, user } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'hsl(var(--color-background))' }}>
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-emerald-600 flex items-center justify-center animate-pulse">
            <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
            </svg>
          </div>
          <p className="text-sm font-medium" style={{ color: 'hsl(var(--color-text-muted))' }}>Loading CuraVet...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) return <Navigate to="/login" replace />;

  if (!tenant && user?.role !== 'super_admin') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p style={{ color: 'hsl(var(--color-text-muted))' }}>No clinic assigned to this account.</p>
      </div>
    );
  }

  const isStaff = user?.role === 'staff';
  if (adminOnly && isStaff) return <Navigate to="/my-workflow" replace />;

  return <>{children}</>;
}

function ClinicLayout() {
  const [sidebarOpen, setSidebarOpen] = React.useState(false);
  return (
    <div className="min-h-screen" style={{ background: 'hsl(var(--color-background))' }}>
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="lg:pl-64 flex flex-col min-h-screen">
        <Header onMenuClick={() => setSidebarOpen(true)} />
        <main className="flex-1 p-4 lg:p-8 overflow-auto">
          <AnimatePresence mode="wait">
            <Outlet />
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
}

function SmartRedirect() {
  const { user } = useAuth();
  if (user?.role === 'staff') return <Navigate to="/my-workflow" replace />;
  return <Navigate to="/dashboard" replace />;
}

export default function App() {
  const { initializeAuth } = useAuth();

  useEffect(() => {
    initializeAuth();
  }, [initializeAuth]);

  return (
    <>
      <Toaster position="top-right" toastOptions={{ duration: 3500 }} />
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<ClinicLayout />}>
          <Route path="/" element={<SmartRedirect />} />

          {/* ── Admin / Clinic Owner routes ── */}
          <Route path="/dashboard" element={<ProtectedRoute adminOnly><AdminDashboardPage /></ProtectedRoute>} />
          <Route path="/clients" element={<ProtectedRoute adminOnly><ClientsPage /></ProtectedRoute>} />
          <Route path="/services" element={<ProtectedRoute adminOnly><ServicesPage /></ProtectedRoute>} />
          <Route path="/staff" element={<ProtectedRoute adminOnly><StaffPage /></ProtectedRoute>} />
          <Route path="/broadcast" element={<ProtectedRoute adminOnly><BroadcastPage /></ProtectedRoute>} />
          <Route path="/analytics" element={<ProtectedRoute adminOnly><AnalyticsPage /></ProtectedRoute>} />

          {/* ── Staff / Vet routes ── */}
          <Route path="/my-workflow" element={<ProtectedRoute><VetDashboardPage /></ProtectedRoute>} />

          {/* ── Shared routes ── */}
          <Route path="/calendar" element={<ProtectedRoute><CalendarPage /></ProtectedRoute>} />
          <Route path="/conversations" element={<ProtectedRoute><ConversationsPage /></ProtectedRoute>} />
          <Route path="/settings" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />
          <Route path="/workflow" element={<ProtectedRoute><StaffWorkflowPage /></ProtectedRoute>} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}
