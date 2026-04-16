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

const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <div className="flex h-screen w-full bg-background text-slate-900 font-sans">
      <Sidebar />
      {children}
    </div>
  );
};

const App: React.FC = () => {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<Layout><Dashboard /></Layout>} />
        <Route path="/calendar" element={<Layout><Calendar /></Layout>} />
        <Route path="/kanban" element={<Layout><Kanban /></Layout>} />
        <Route path="/surgeries" element={<Layout><SurgeryList /></Layout>} />
        <Route path="/detail/:id" element={<Layout><SurgeryDetail /></Layout>} />
        <Route path="/audit" element={<Layout><Audit /></Layout>} />
        <Route path="/results" element={<Layout><ResultsDashboard /></Layout>} />
        <Route path="/settings" element={<Layout><Settings /></Layout>} />
        <Route path="/monitor" element={<Monitor />} />
      </Routes>
    </HashRouter>
  );
};

export default App;