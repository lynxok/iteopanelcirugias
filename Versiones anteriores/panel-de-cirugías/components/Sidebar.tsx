import React from 'react';
import { NavLink } from 'react-router-dom';

const Sidebar: React.FC = () => {
  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${
      isActive
        ? 'bg-primary/10 text-primary'
        : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 dark:text-slate-400'
    }`;

  const iconClass = ({ isActive }: { isActive: boolean }) =>
    `material-symbols-outlined ${isActive ? 'filled' : ''}`;

  return (
    <aside className="w-64 flex-shrink-0 border-r border-slate-200 bg-white flex flex-col h-screen hidden md:flex z-20">
      <div className="h-full flex flex-col justify-between p-4">
        <div className="flex flex-col gap-4">
          {/* Brand */}
          <div className="flex gap-3 items-center px-2 py-2">
            <div className="bg-primary/10 rounded-lg p-2 flex items-center justify-center text-primary">
              <span className="material-symbols-outlined text-2xl">medical_services</span>
            </div>
            <div className="flex flex-col">
              <h1 className="text-slate-900 text-base font-bold leading-normal">ITEO</h1>
              <p className="text-slate-500 text-xs font-normal leading-normal">Coordinación de Cirugías</p>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="flex flex-col gap-1 mt-4">
            <NavLink to="/" className={linkClass}>
              {({ isActive }) => (
                <>
                  <span className={iconClass({ isActive })}>dashboard</span>
                  <p className="text-sm font-medium leading-normal">Tablero</p>
                </>
              )}
            </NavLink>
            <NavLink to="/calendar" className={linkClass}>
              {({ isActive }) => (
                <>
                  <span className={iconClass({ isActive })}>calendar_today</span>
                  <p className="text-sm font-medium leading-normal">Calendario</p>
                </>
              )}
            </NavLink>
            <NavLink to="/kanban" className={linkClass}>
              {({ isActive }) => (
                <>
                  <span className={iconClass({ isActive })}>view_kanban</span>
                  <p className="text-sm font-medium leading-normal">Planificación</p>
                </>
              )}
            </NavLink>
             <NavLink to="/surgeries" className={linkClass}>
              {({ isActive }) => (
                <>
                  <span className={iconClass({ isActive })}>table_rows</span>
                  <p className="text-sm font-medium leading-normal">Listado General</p>
                </>
              )}
            </NavLink>
             <NavLink to="/monitor" className={linkClass}>
              {({ isActive }) => (
                <>
                  <span className={iconClass({ isActive })}>monitor_heart</span>
                  <p className="text-sm font-medium leading-normal">Monitor en Vivo</p>
                </>
              )}
            </NavLink>
             <NavLink to="/results" className={linkClass}>
              {({ isActive }) => (
                <>
                  <span className={iconClass({ isActive })}>analytics</span>
                  <p className="text-sm font-medium leading-normal">Resultados</p>
                </>
              )}
            </NavLink>
             <NavLink to="/audit" className={linkClass}>
              {({ isActive }) => (
                <>
                  <span className={iconClass({ isActive })}>history_edu</span>
                  <p className="text-sm font-medium leading-normal">Auditoría</p>
                </>
              )}
            </NavLink>
             <NavLink to="/settings" className={linkClass}>
              {({ isActive }) => (
                <>
                  <span className={iconClass({ isActive })}>settings</span>
                  <p className="text-sm font-medium leading-normal">Configuración</p>
                </>
              )}
            </NavLink>
          </nav>
        </div>

        {/* Bottom User Profile */}
        <div className="flex items-center gap-3 px-3 py-3 rounded-lg border border-slate-200 mt-auto cursor-pointer hover:bg-slate-50 transition-colors">
          <img 
            src="https://picsum.photos/100/100" 
            alt="User" 
            className="h-10 w-10 rounded-full object-cover"
          />
          <div className="flex flex-col overflow-hidden">
            <p className="text-sm font-medium truncate">Dra. Sarah C.</p>
            <p className="text-xs text-slate-500 truncate">Cirujano Jefe</p>
          </div>
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;