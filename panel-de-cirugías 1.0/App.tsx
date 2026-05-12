import React, { lazy, Suspense } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './src/lib/AuthContext';
import ErrorBoundary from './components/ErrorBoundary';
import UpdateNotification from './components/UpdateNotification';

// Componentes estáticos críticos
import Sidebar from './components/Sidebar';

// Carga perezosa (Lazy Loading) de páginas para optimizar rendimiento
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Calendar = lazy(() => import('./pages/Calendar'));
const Kanban = lazy(() => import('./pages/Kanban'));
const SurgeryDetail = lazy(() => import('./pages/SurgeryDetail').then(module => ({ default: module.SurgeryDetail })));
const SurgeryList = lazy(() => import('./pages/SurgeryList'));
const Monitor = lazy(() => import('./pages/Monitor'));
const Settings = lazy(() => import('./pages/Settings'));
const Audit = lazy(() => import('./pages/Audit'));
const ResultsDashboard = lazy(() => import('./pages/ResultsDashboard'));
const AlertsHistory = lazy(() => import('./pages/AlertsHistory'));
const Login = lazy(() => import('./pages/Login'));
const ErrorLogViewer = lazy(() => import('./pages/ErrorLogViewer'));
const Help = lazy(() => import('./pages/Help'));
const PatientCard = lazy(() => import('./pages/PatientCard').then(module => ({ default: module.PatientCard })));
const QRScanner = lazy(() => import('./pages/QRScanner').then(module => ({ default: module.QRScanner })));
const HospitalizationMap = lazy(() => import('./pages/HospitalizationMap'));
const HospitalizationScanner = lazy(() => import('./pages/HospitalizationScanner'));
const DoctorPanel = lazy(() => import('./pages/DoctorPanel'));
const Billing = lazy(() => import('./pages/Billing'));
const AdminDashboard = lazy(() => import('./pages/AdminDashboard').then(module => ({ default: module.AdminDashboard })));

// Componentes estáticos que son ligeros
import { PatientPrintLabel } from './components/PatientPrintLabel';


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
    <div className="flex h-[100dvh] w-full bg-background text-slate-900 font-sans flex-col md:flex-row overflow-hidden print:h-auto print:overflow-visible">
      {/* Mobile Header */}
      <div className="md:hidden flex items-center justify-between p-4 bg-white border-b border-slate-200 flex-shrink-0 z-20 print:hidden">
        <div className="flex items-center gap-3">
          <img src="/logo iteo azul.png" alt="ITEO" className="h-8 w-auto object-contain" />
        </div>
        <button
          onClick={() => setMobileMenuOpen(true)}
          className="p-2 text-slate-500 hover:bg-slate-100 rounded-lg active:bg-slate-200 transition-colors"
        >
          <span className="material-symbols-outlined text-2xl">menu</span>
        </button>
      </div>

      <Sidebar mobileOpen={mobileMenuOpen} setMobileOpen={setMobileMenuOpen} />
      
      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto relative w-full flex flex-col print:static">
        {children}
      </div>
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
  const { user, loading } = useAuth();
  const [permissions, setPermissions] = React.useState<string[]>([]);
  const [checking, setChecking] = React.useState(true);

  React.useEffect(() => {
    const fetchPermissions = async () => {
      if (!user) return;
      if (user.role === 'SuperAdmin') {
        setPermissions(['dashboard']); // SuperAdmin siempre tiene acceso
        setChecking(false);
        return;
      }

      try {
        const { data } = await supabase
          .from('admin_settings')
          .select('value')
          .eq('key', 'role_permissions')
          .maybeSingle();

        if (data?.value) {
          const allPerms = JSON.parse(data.value);
          const roleKey = Object.keys(allPerms).find(k => k.toLowerCase() === user.role?.toLowerCase());
          if (roleKey) {
            setPermissions(allPerms[roleKey]);
          }
        }
      } catch (err) {
        console.error('Error fetching perms for redirect:', err);
      } finally {
        setChecking(false);
      }
    };
    fetchPermissions();
  }, [user]);

  if (loading || checking) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-slate-50">
        <div className="size-10 border-4 border-primary/30 border-t-primary rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;

  // Orden de prioridad para la redirección inicial
  const priorityRoutes = [
    { id: 'dashboard', path: '/dashboard_view' }, // Cambiaremos la ruta del dashboard para evitar bucles
    { id: 'medico', path: '/medico' },
    { id: 'hospitalization', path: '/hospitalization' },
    { id: 'admin_dashboard', path: '/admin-dashboard' },
    { id: 'surgeries', path: '/surgeries' },
    { id: 'calendar', path: '/calendar' },
    { id: 'monitor', path: '/monitor' },
    { id: 'kanban', path: '/kanban' },
    { id: 'alerts', path: '/alerts' },
    { id: 'scanner', path: '/scanner' },
    { id: 'results', path: '/results' },
    { id: 'audit', path: '/audit' },
    { id: 'billing', path: '/billing' },
    { id: 'help', path: '/help' },
  ];

  if (user.role === 'SuperAdmin' || permissions.includes('dashboard')) {
    return <Layout><Dashboard /></Layout>;
  }

  const firstAllowed = priorityRoutes.find(r => permissions.includes(r.id));
  
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
      console.warn("Error de precarga detectado (posible nueva versión). Recargando...");
      window.location.reload();
    };

    window.addEventListener("vite:preloadError", handlePreloadError);
    return () => window.removeEventListener("vite:preloadError", handlePreloadError);
  }, []);

  return (
    <AuthProvider>
      <ErrorBoundary>
        <UpdateNotification />
        <HashRouter>
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
              <Route path="/dashboard_view" element={<Layout><Dashboard /></Layout>} />
              <Route path="/alerts" element={<Layout><AlertsHistory /></Layout>} />
              <Route path="/calendar" element={<Layout><Calendar /></Layout>} />
              <Route path="/kanban" element={<Layout><Kanban /></Layout>} />
              <Route path="/surgeries" element={<Layout><SurgeryList /></Layout>} />
              <Route path="/admin-dashboard" element={<Layout><AdminDashboard /></Layout>} />
              <Route path="/detail/:id" element={<Layout><SurgeryDetail /></Layout>} />
              <Route path="/audit" element={<Layout><Audit /></Layout>} />
              <Route path="/results" element={<Layout><ResultsDashboard /></Layout>} />
              <Route path="/settings" element={<Layout><Settings /></Layout>} />
              <Route path="/monitor" element={<Layout><Monitor /></Layout>} />
              <Route path="/hospitalization" element={<Layout><HospitalizationMap /></Layout>} />
              <Route path="/hospitalization-scanner" element={<HospitalizationScanner />} />
              <Route path="/medico" element={<Layout><DoctorPanel /></Layout>} />
              <Route path="/billing" element={<Layout><Billing /></Layout>} />
              <Route path="/nueva-cirugia" element={<Layout><SurgeryDetail /></Layout>} />
              <Route path="/error-logs" element={<Layout><ErrorLogViewer /></Layout>} />
              <Route path="/help" element={<Layout><Help /></Layout>} />
              <Route path="/print-wristband/:id" element={<PatientPrintLabel />} />
              <Route path="/tracking/:id" element={<Layout><PatientCard /></Layout>} />
              <Route path="/scanner" element={<Layout><QRScanner /></Layout>} />
            </Routes>
          </Suspense>
        </HashRouter>
      </ErrorBoundary>
    </AuthProvider>
  );
};

export default App;