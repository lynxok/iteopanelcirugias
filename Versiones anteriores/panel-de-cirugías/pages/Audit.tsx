import React, { useState } from 'react';

type ActionType = 'CREATE' | 'UPDATE' | 'DELETE' | 'LOGIN' | 'Security' | 'STATUS_CHANGE';

interface AuditLog {
  id: string;
  user: {
    name: string;
    role: string;
    avatar: string; // Initials or URL
  };
  action: ActionType;
  resource: string;
  resourceId: string;
  description: string;
  timestamp: string;
  meta: {
    ip: string;
    browser: string;
  };
}

const MOCK_LOGS: AuditLog[] = [
  {
    id: 'log-001',
    user: { name: 'Dr. Jorge Garcia', role: 'Médico', avatar: 'JG' },
    action: 'CREATE',
    resource: 'Cirugía',
    resourceId: '#8842',
    description: 'Creó nueva solicitud de cirugía: Reemplazo Total de Rodilla',
    timestamp: 'Hace 2 min',
    meta: { ip: '192.168.1.45', browser: 'Chrome 118' }
  },
  {
    id: 'log-002',
    user: { name: 'Admin Principal', role: 'SuperAdmin', avatar: 'AD' },
    action: 'UPDATE',
    resource: 'Usuario',
    resourceId: 'u-102',
    description: 'Actualizó permisos del usuario: Dra. Sarah Smith (Agregó rol: Jefe de Qx)',
    timestamp: 'Hace 15 min',
    meta: { ip: '10.0.0.12', browser: 'Firefox 120' }
  },
  {
    id: 'log-003',
    user: { name: 'Juan Ortopedia', role: 'Ortopedia', avatar: 'JO' },
    action: 'STATUS_CHANGE',
    resource: 'Materiales',
    resourceId: '#8842',
    description: 'Cambió estado de materiales a: "Implante Listo en Quirófano"',
    timestamp: 'Hace 45 min',
    meta: { ip: '200.55.12.99', browser: 'Safari Mobile' }
  },
  {
    id: 'log-004',
    user: { name: 'Pedro Tecnico', role: 'Técnico', avatar: 'PT' },
    action: 'DELETE',
    resource: 'Procedimiento',
    resourceId: 'proc-55',
    description: 'Eliminó plantilla de procedimiento obsoleta: "Artroscopia Simple v1"',
    timestamp: 'Hoy, 09:30 AM',
    meta: { ip: '192.168.1.105', browser: 'Edge' }
  },
  {
    id: 'log-005',
    user: { name: 'Sistema', role: 'System', avatar: 'SYS' },
    action: 'Security',
    resource: 'Login',
    resourceId: 'auth',
    description: 'Múltiples intentos fallidos de inicio de sesión detectados',
    timestamp: 'Hoy, 08:15 AM',
    meta: { ip: '45.22.11.12', browser: 'Unknown' }
  },
  {
    id: 'log-006',
    user: { name: 'Lic. Ana Torres', role: 'Internacion', avatar: 'AT' },
    action: 'UPDATE',
    resource: 'Cirugía',
    resourceId: '#9921',
    description: 'Marcó validación clínica: "Pre-quirúrgicos Aprobados"',
    timestamp: 'Ayer, 18:45 PM',
    meta: { ip: '192.168.1.22', browser: 'Chrome 118' }
  },
];

const Audit: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<string>('ALL');

  const filteredLogs = MOCK_LOGS.filter(log => {
    const matchesSearch = 
        log.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
        log.user.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        log.resourceId.includes(searchTerm);
    
    const matchesType = filterType === 'ALL' || log.action === filterType;

    return matchesSearch && matchesType;
  });

  const getActionConfig = (action: ActionType) => {
      switch (action) {
          case 'CREATE': return { color: 'text-emerald-600 bg-emerald-50 border-emerald-200', icon: 'add_circle' };
          case 'UPDATE': return { color: 'text-blue-600 bg-blue-50 border-blue-200', icon: 'edit' };
          case 'DELETE': return { color: 'text-red-600 bg-red-50 border-red-200', icon: 'delete' };
          case 'STATUS_CHANGE': return { color: 'text-purple-600 bg-purple-50 border-purple-200', icon: 'swap_horiz' };
          case 'Security': return { color: 'text-amber-600 bg-amber-50 border-amber-200', icon: 'security' };
          default: return { color: 'text-slate-600 bg-slate-50 border-slate-200', icon: 'info' };
      }
  };

  return (
    <div className="flex-1 h-full overflow-y-auto bg-slate-50 p-8 font-sans">
        <div className="max-w-5xl mx-auto flex flex-col gap-6">
            
            {/* Header */}
            <div className="flex justify-between items-end">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-3">
                        <span className="material-symbols-outlined text-slate-400">history_edu</span>
                        Registro de Auditoría
                    </h1>
                    <p className="text-sm text-slate-500 mt-1">Historial inmutable de acciones y seguridad del sistema.</p>
                </div>
                <button className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-700 font-bold text-sm rounded-lg hover:bg-slate-50 transition-colors shadow-sm">
                    <span className="material-symbols-outlined text-lg">download</span>
                    Exportar CSV
                </button>
            </div>

            {/* Toolbar */}
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row gap-4">
                <div className="relative flex-1">
                    <span className="material-symbols-outlined absolute left-3 top-2.5 text-slate-400">search</span>
                    <input 
                        type="text" 
                        placeholder="Buscar por usuario, acción o ID..." 
                        className="w-full pl-10 pr-4 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-slate-500 focus:border-slate-500 outline-none text-sm"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
                <div className="w-full md:w-64">
                    <select 
                        className="w-full py-2 px-3 rounded-lg border border-slate-300 bg-white text-sm text-slate-700 focus:ring-2 focus:ring-slate-500 outline-none cursor-pointer"
                        value={filterType}
                        onChange={(e) => setFilterType(e.target.value)}
                    >
                        <option value="ALL">Todos los Eventos</option>
                        <option value="CREATE">Creación (Create)</option>
                        <option value="UPDATE">Edición (Update)</option>
                        <option value="DELETE">Eliminación (Delete)</option>
                        <option value="STATUS_CHANGE">Cambio de Estado</option>
                        <option value="Security">Seguridad / Alertas</option>
                    </select>
                </div>
                <div className="w-full md:w-auto">
                     <input 
                        type="date" 
                        className="w-full py-2 px-3 rounded-lg border border-slate-300 bg-white text-sm text-slate-700 focus:ring-2 focus:ring-slate-500 outline-none"
                     />
                </div>
            </div>

            {/* Timeline Log */}
            <div className="flex flex-col gap-4 relative">
                {/* Vertical Line */}
                <div className="absolute left-6 top-4 bottom-4 w-px bg-slate-200 z-0 hidden md:block"></div>

                {filteredLogs.map((log) => {
                    const config = getActionConfig(log.action);
                    
                    return (
                        <div key={log.id} className="relative z-10 flex flex-col md:flex-row gap-4 bg-white p-5 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow group">
                            
                            {/* Icon / Avatar Section */}
                            <div className="flex md:flex-col items-center gap-3 md:w-12 flex-shrink-0">
                                <div className={`size-12 rounded-full border-4 border-slate-50 flex items-center justify-center shadow-sm ${config.color}`}>
                                    <span className="material-symbols-outlined text-xl">{config.icon}</span>
                                </div>
                            </div>

                            {/* Main Content */}
                            <div className="flex-1">
                                <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 mb-2">
                                    <div className="flex items-center gap-2">
                                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded border uppercase tracking-wider ${config.color}`}>
                                            {log.action}
                                        </span>
                                        <span className="text-xs font-semibold text-slate-400">•</span>
                                        <span className="text-xs font-bold text-slate-500 uppercase">{log.resource}</span>
                                        <span className="text-xs font-mono bg-slate-100 text-slate-600 px-1.5 rounded">{log.resourceId}</span>
                                    </div>
                                    <span className="text-xs text-slate-400 font-medium whitespace-nowrap">{log.timestamp}</span>
                                </div>
                                
                                <p className="text-sm font-medium text-slate-800 mb-3 leading-relaxed">
                                    {log.description}
                                </p>

                                {/* Meta Footer */}
                                <div className="flex items-center justify-between pt-3 border-t border-slate-50 mt-1">
                                    <div className="flex items-center gap-2">
                                        <div className="size-6 rounded-full bg-slate-200 flex items-center justify-center text-[10px] font-bold text-slate-600">
                                            {log.user.avatar}
                                        </div>
                                        <span className="text-xs font-medium text-slate-700">{log.user.name}</span>
                                        <span className="text-[10px] text-slate-400">({log.user.role})</span>
                                    </div>
                                    <div className="flex items-center gap-3 text-[10px] text-slate-400 font-mono">
                                        <span title="Dirección IP">{log.meta.ip}</span>
                                        <span className="hidden sm:inline">•</span>
                                        <span title="Navegador" className="hidden sm:inline">{log.meta.browser}</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    );
                })}

                {filteredLogs.length === 0 && (
                    <div className="p-12 text-center bg-white rounded-xl border border-slate-200 border-dashed">
                        <span className="material-symbols-outlined text-4xl text-slate-300 mb-2">find_in_page</span>
                        <p className="text-slate-500 font-medium">No se encontraron registros de auditoría con estos criterios.</p>
                    </div>
                )}
            </div>

        </div>
    </div>
  );
};

export default Audit;