import React from 'react';
import { HashRouter, Routes, Route } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import Dashboard from './pages/Dashboard';
import Calendar from './pages/Calendar';
import Kanban from './pages/Kanban';
import { SurgeryDetail } from './pages/SurgeryDetail';
import SurgeryList from './pages/SurgeryList';
import Monitor from './pages/Monitor';
import Settings from './pages/Settings';
import Audit from './pages/Audit';
import ResultsDashboard from './pages/ResultsDashboard';
import AlertsHistory from './pages/AlertsHistory';
import Login from './pages/Login';
import ErrorLogViewer from './pages/ErrorLogViewer';
import Help from './pages/Help';
import ErrorBoundary from './components/ErrorBoundary';
import UpdateNotification from './components/UpdateNotification';
import { AuthProvider, useAuth } from './src/lib/AuthContext';
import { Navigate } from 'react-router-dom';

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
    <div className="flex h-screen w-full bg-background text-slate-900 font-sans flex-col md:flex-row overflow-hidden">
      {/* Mobile Header */}
      <div className="md:hidden flex items-center justify-between p-4 bg-white border-b border-slate-200 flex-shrink-0 z-20">
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
      <div className="flex-1 h-full overflow-hidden relative w-full">
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

const App: React.FC = () => {
  return (
    <AuthProvider>
      <ErrorBoundary>
        <UpdateNotification />
        <HashRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/" element={<Layout><Dashboard /></Layout>} />
            <Route path="/alerts" element={<Layout><AlertsHistory /></Layout>} />
            <Route path="/calendar" element={<Layout><Calendar /></Layout>} />
            <Route path="/kanban" element={<Layout><Kanban /></Layout>} />
            <Route path="/surgeries" element={<Layout><SurgeryList /></Layout>} />
            <Route path="/detail/:id" element={<Layout><SurgeryDetail /></Layout>} />
            <Route path="/audit" element={<Layout><Audit /></Layout>} />
            <Route path="/results" element={<Layout><ResultsDashboard /></Layout>} />
            <Route path="/settings" element={<Layout><Settings /></Layout>} />
            <Route path="/monitor" element={<Layout><Monitor /></Layout>} />
            <Route path="/nueva-cirugia" element={<Layout><SurgeryDetail /></Layout>} />
            <Route path="/error-logs" element={<Layout><ErrorLogViewer /></Layout>} />
            <Route path="/help" element={<Layout><Help /></Layout>} />
          </Routes>
        </HashRouter>
      </ErrorBoundary>
    </AuthProvider>
  );
};

export default App;