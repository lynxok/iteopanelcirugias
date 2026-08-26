import React, { Suspense } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './src/lib/AuthContext';
import { OserSyncProvider } from './src/lib/OserSyncContext';
import { supabase } from './src/lib/supabase';
import ErrorBoundary from './components/ErrorBoundary';
import UpdateNotification from './components/UpdateNotification';
import OserSyncOverlay from './components/OserSyncOverlay';
import DependencyCheckerOverlay from './components/DependencyCheckerOverlay';
import { lazyWithRetry } from './src/lib/lazyWithRetry';

// Componentes estáticos críticos
import Sidebar from './components/Sidebar';
import { LEGACY_PERMISSIONS, checkAccess } from './src/lib/permissions';
import RoleProtectedRoute from './components/RoleProtectedRoute';
import { useRolePermissions } from './src/lib/useRolePermissions';

// Carga perezosa (Lazy Loading) de páginas para optimizar rendimiento usando la utilidad de reintento
const Dashboard = lazyWithRetry(() => import('./pages/Dashboard'));
const Calendar = lazyWithRetry(() => import('./pages/Calendar'));
const Kanban = lazyWithRetry(() => import('./pages/Kanban'));
const SurgeryDetail = lazyWithRetry(() => import('./pages/SurgeryDetail').then(module => ({ default: module.SurgeryDetail })));
const SurgeryList = lazyWithRetry(() => import('./pages/SurgeryList'));
const Monitor = lazyWithRetry(() => import('./pages/Monitor'));
const Settings = lazyWithRetry(() => import('./pages/Settings'));
const Audit = lazyWithRetry(() => import('./pages/Audit'));
const ResultsDashboard = lazyWithRetry(() => import('./pages/ResultsDashboard'));
const AlertsHistory = lazyWithRetry(() => import('./pages/AlertsHistory'));
const Login = lazyWithRetry(() => import('./pages/Login'));
const ErrorLogViewer = lazyWithRetry(() => import('./pages/ErrorLogViewer'));
const Help = lazyWithRetry(() => import('./pages/Help'));
const PatientCard = lazyWithRetry(() => import('./pages/PatientCard').then(module => ({ default: module.PatientCard })));
const QRScanner = lazyWithRetry(() => import('./pages/QRScanner').then(module => ({ default: module.QRScanner })));
const HospitalizationMap = lazyWithRetry(() => import('./pages/HospitalizationMap'));
const HospitalizationScanner = lazyWithRetry(() => import('./pages/HospitalizationScanner'));
const DoctorPanel = lazyWithRetry(() => import('./pages/DoctorPanel'));
const Billing = lazyWithRetry(() => import('./pages/Billing'));
const AdminDashboard = lazyWithRetry(() => import('./pages/AdminDashboard').then(module => ({ default: module.AdminDashboard })));
const ResidentShifts = lazyWithRetry(() => import('./pages/ResidentShifts'));
const TecnicoPanel = lazyWithRetry(() => import('./pages/TecnicoPanel'));

// Componentes estáticos que son ligeros
import { PatientPrintLabel } from './components/PatientPrintLabel';
import { ObsBackgroundController } from './components/ObsBackgroundController';
import { AmbulatoryAutoCompleter } from './components/AmbulatoryAutoCompleter';
import { CommandPalette } from './components/CommandPalette';
import { NetworkStatusBanner } from './components/NetworkStatusBanner';


const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, loading } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);

  if (loading) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-slate-50">
        <div className="size-10 border-4 border-primary/30 border-t-primary rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="flex h-[100dvh] w-full bg-background text-slate-900 font-sans responsive-layout overflow-hidden print:h-auto print:overflow-visible">
      {/* Mobile Header */}
      <div className="responsive-mobile-header flex items-center justify-between p-4 bg-white border-b border-slate-200 flex-shrink-0 z-20 print:hidden">
        <div className="flex items-center gap-3">
          <img src="logo-iteo-azul.png" alt="ITEO" className="h-8 w-auto object-contain" />
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={async () => {
              if ('caches' in window) {
                try {
                  const keys = await caches.keys();
                  await Promise.all(keys.map(k => caches.delete(k)));
                } catch (e) {
                  console.error('Error limpiando caché:', e);
                }
              }
              window.location.reload();
            }}
            title="Recargar aplicación"
            className="p-2 text-slate-400 hover:text-blue-600 hover:bg-slate-100 rounded-lg active:scale-95 transition-all"
          >
            <span className="material-symbols-outlined text-2xl">refresh</span>
          </button>
          <button
            onClick={() => setMobileMenuOpen(true)}
            className="p-2 text-slate-500 hover:bg-slate-100 rounded-lg active:bg-slate-200 transition-colors"
          >
            <span className="material-symbols-outlined text-2xl">menu</span>
          </button>
        </div>
      </div>

      <Sidebar mobileOpen={mobileMenuOpen} setMobileOpen={setMobileMenuOpen} />
      
      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto relative w-full flex flex-col print:static">
        {children}
      </div>
      <OserSyncOverlay />
    </div>
  );
};

const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
};

const HomeRedirect: React.FC = () => {
  const { user, loading, hasAccess } = useRolePermissions();

  if (loading) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-slate-50">
        <div className="size-10 border-4 border-primary/30 border-t-primary rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;

  if (user.role === 'SuperAdmin' || hasAccess('dashboard')) {
    return <Layout><Dashboard /></Layout>;
  }

  // Orden de prioridad para la redirección inicial
  const priorityRoutes = [
    { id: 'dashboard', path: '/dashboard_view' },
    { id: 'medico', path: '/medico' },
    { id: 'hospitalization', path: '/hospitalization' },
    { id: 'admin_dashboard', path: '/admin-dashboard' },
    { id: 'surgeries', path: '/surgeries' },
    { id: 'calendar', path: '/calendar' },
    { id: 'resident_shifts', path: '/resident-shifts' },
    { id: 'monitor', path: '/monitor' },
    { id: 'kanban', path: '/kanban' },
    { id: 'scanner', path: '/scanner' },
    { id: 'results', path: '/results' },
    { id: 'audit', path: '/audit' },
    { id: 'billing', path: '/billing' },
    { id: 'help', path: '/help' },
  ];

  const firstAllowed = priorityRoutes.find(r => hasAccess(r.id));
  
  if (firstAllowed) {
    return <Navigate to={firstAllowed.path} replace />;
  }

  return <Layout><Dashboard /></Layout>; // Fallback
};

const App: React.FC = () => {
  // Manejador global para errores de carga de módulos dinámicos (Chunks)
  // Esto sucede cuando se sube una nueva versión y el usuario tiene una vieja en caché.
  React.useEffect(() => {
    const handlePreloadError = (event: Event) => {
      const lastReload = sessionStorage.getItem("last_preload_reload");
      const now = Date.now();
      
      // Solo recargar si han pasado más de 10 segundos desde el último intento
      if (!lastReload || now - parseInt(lastReload, 10) > 10000) {
        sessionStorage.setItem("last_preload_reload", now.toString());
        console.warn("Error de precarga detectado (posible nueva versión). Recargando...");
        window.location.reload();
      } else {
        console.error("Error de precarga persistente detectado. Evitando bucle infinito de recarga.");
      }
    };

    window.addEventListener("vite:preloadError", handlePreloadError);
    return () => window.removeEventListener("vite:preloadError", handlePreloadError);
  }, []);

  return (
    <AuthProvider>
      <OserSyncProvider>
        <ErrorBoundary>
        <UpdateNotification />
        <DependencyCheckerOverlay />
        <ObsBackgroundController />
        <AmbulatoryAutoCompleter />
        <NetworkStatusBanner />
        <HashRouter>
          <CommandPalette />
          <Suspense fallback={
            <div className="h-screen w-full flex items-center justify-center bg-slate-50">
              <div className="flex flex-col items-center gap-4">
                <div className="size-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin"></div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest animate-pulse">Cargando módulo...</p>
              </div>
            </div>
          }>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/" element={<HomeRedirect />} />
              <Route path="/dashboard_view" element={<RoleProtectedRoute sectionId="dashboard"><Layout><Dashboard /></Layout></RoleProtectedRoute>} />
              <Route path="/alerts" element={<RoleProtectedRoute sectionId="alerts"><Layout><AlertsHistory /></Layout></RoleProtectedRoute>} />
              <Route path="/calendar" element={<RoleProtectedRoute sectionId="calendar"><Layout><Calendar /></Layout></RoleProtectedRoute>} />
              <Route path="/resident-shifts" element={<RoleProtectedRoute sectionId="resident_shifts"><Layout><ResidentShifts /></Layout></RoleProtectedRoute>} />
              <Route path="/kanban" element={<RoleProtectedRoute sectionId="kanban"><Layout><Kanban /></Layout></RoleProtectedRoute>} />
              <Route path="/surgeries" element={<RoleProtectedRoute sectionId="surgeries"><Layout><SurgeryList /></Layout></RoleProtectedRoute>} />
              <Route path="/admin-dashboard" element={<RoleProtectedRoute sectionId="admin_dashboard"><Layout><AdminDashboard /></Layout></RoleProtectedRoute>} />
              <Route path="/detail/:id" element={<RoleProtectedRoute sectionId="detail"><Layout><SurgeryDetail /></Layout></RoleProtectedRoute>} />
              <Route path="/audit" element={<RoleProtectedRoute sectionId="audit"><Layout><Audit /></Layout></RoleProtectedRoute>} />
              <Route path="/results" element={<RoleProtectedRoute sectionId="results"><Layout><ResultsDashboard /></Layout></RoleProtectedRoute>} />
              <Route path="/settings" element={<RoleProtectedRoute sectionId="settings"><Layout><Settings /></Layout></RoleProtectedRoute>} />
              <Route path="/monitor" element={<RoleProtectedRoute sectionId="monitor"><Layout><Monitor /></Layout></RoleProtectedRoute>} />
              <Route path="/hospitalization" element={<RoleProtectedRoute sectionId="hospitalization"><Layout><HospitalizationMap /></Layout></RoleProtectedRoute>} />
              <Route path="/hospitalization-scanner" element={<RoleProtectedRoute sectionId="hospitalization"><HospitalizationScanner /></RoleProtectedRoute>} />
              <Route path="/medico" element={<RoleProtectedRoute sectionId="medico"><Layout><DoctorPanel /></Layout></RoleProtectedRoute>} />
              <Route path="/billing" element={<RoleProtectedRoute sectionId="billing"><Layout><Billing /></Layout></RoleProtectedRoute>} />
              <Route path="/tecnicos" element={<RoleProtectedRoute sectionId="tecnicos"><Layout><TecnicoPanel /></Layout></RoleProtectedRoute>} />
              <Route path="/nueva-cirugia" element={<RoleProtectedRoute sectionId="surgeries" requiredLevel="edit"><Layout><SurgeryDetail /></Layout></RoleProtectedRoute>} />
              <Route path="/error-logs" element={<RoleProtectedRoute sectionId="error_logs"><Layout><ErrorLogViewer /></Layout></RoleProtectedRoute>} />
              <Route path="/help" element={<RoleProtectedRoute sectionId="help"><Layout><Help /></Layout></RoleProtectedRoute>} />
              <Route path="/print-wristband/:id" element={<PatientPrintLabel />} />
              <Route path="/tracking/:id" element={<Layout><PatientCard /></Layout>} />
              <Route path="/scanner" element={<RoleProtectedRoute sectionId="scanner"><Layout><QRScanner /></Layout></RoleProtectedRoute>} />
              {/* Ruta comodín para capturar direcciones inexistentes o inválidas */}
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </HashRouter>
      </ErrorBoundary>
      </OserSyncProvider>
    </AuthProvider>
  );
};

export default App;