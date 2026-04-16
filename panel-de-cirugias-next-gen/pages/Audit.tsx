import React, { useState, useEffect } from 'react';
import { supabase } from '../src/lib/supabase';
import { useAuth } from '../src/lib/AuthContext';
import { useNavigate } from 'react-router-dom';

type ActionType = 'CREATE' | 'UPDATE' | 'DELETE' | 'LOGIN' | 'Security' | 'STATUS_CHANGE';

interface AuditLog {
    id: string;
    user_name: string;
    user_role: string;
    user_avatar: string;
    action: ActionType;
    resource: string;
    resource_id: string;
    description: string;
    created_at: string;
    meta: {
        ip: string;
        browser: string;
    };
}

const Audit: React.FC = () => {
    const navigate = useNavigate();
    const { user } = useAuth();
    const [logs, setLogs] = useState<AuditLog[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [filterType, setFilterType] = useState<string>('ALL');

    useEffect(() => {
        if (user?.role === 'Medico') {
            navigate('/surgeries');
            return;
        }
        fetchLogs();
    }, [user, navigate]);

    const fetchLogs = async () => {
        try {
            setLoading(true);
            const { data, error } = await supabase
                .from('audit_logs')
                .select('*')
                .order('created_at', { ascending: false });

            if (error) throw error;
            if (data) setLogs(data);
        } catch (err) {
            console.error('Error fetching audit logs:', err instanceof Error ? err.message : JSON.stringify(err));
        } finally {
            setLoading(false);
        }
    };

    const filteredLogs = logs.filter(log => {
        const matchesSearch =
            (log.description?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
            (log.user_name?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
            (log.resource_id?.toLowerCase() || '').includes(searchTerm.toLowerCase());

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

    const formatTimestamp = (timestamp: string) => {
        const date = new Date(timestamp);
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffMin = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMin / 60);

        if (diffMin < 1) return 'Ahora mismo';
        if (diffMin < 60) return `Hace ${diffMin} min`;
        if (diffHours < 24) return `Hace ${diffHours} h`;
        return date.toLocaleString('es-ES', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
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
                    <div className="flex gap-2">
                        <button
                            onClick={fetchLogs}
                            className="flex items-center justify-center size-10 bg-white border border-slate-200 text-slate-500 rounded-lg hover:bg-slate-50 transition-colors"
                            title="Refrescar"
                        >
                            <span className={`material-symbols-outlined ${loading ? 'animate-spin' : ''}`}>refresh</span>
                        </button>
                        <button className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-700 font-bold text-sm rounded-lg hover:bg-slate-50 transition-colors shadow-sm">
                            <span className="material-symbols-outlined text-lg">download</span>
                            Exportar CSV
                        </button>
                    </div>
                </div>

                {/* Toolbar */}
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row gap-4">
                    <div className="relative flex-1">
                        <span className="material-symbols-outlined absolute left-3 top-2.5 text-slate-400">search</span>
                        <input
                            type="text"
                            placeholder="Buscar por usuario, acción, ID, Paciente o DNI..."
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
                </div>

                {/* Timeline Log */}
                <div className="flex flex-col gap-4 relative">
                    {/* Vertical Line */}
                    <div className="absolute left-6 top-4 bottom-4 w-px bg-slate-200 z-0 hidden md:block"></div>

                    {loading && logs.length === 0 ? (
                        <div className="p-12 text-center bg-white rounded-xl border border-slate-200 border-dashed">
                            <span className="material-symbols-outlined animate-spin text-4xl text-slate-300 mb-2">progress_activity</span>
                            <p className="text-slate-500 font-medium">Cargando registros...</p>
                        </div>
                    ) : filteredLogs.map((log) => {
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
                                            <span className="text-xs font-mono bg-slate-100 text-slate-600 px-1.5 rounded">{log.resource_id}</span>
                                        </div>
                                        <span className="text-xs text-slate-400 font-medium whitespace-nowrap">{formatTimestamp(log.created_at)}</span>
                                    </div>

                                    <div className="text-sm text-slate-800 mb-3 leading-relaxed whitespace-pre-wrap font-mono bg-slate-50 p-2 rounded border border-slate-100">
                                        {log.description}
                                    </div>

                                    {/* Meta Footer */}
                                    <div className="flex items-center justify-between pt-3 border-t border-slate-50 mt-1">
                                        <div className="flex items-center gap-2">
                                            <div className="size-6 rounded-full bg-slate-200 flex items-center justify-center text-[10px] font-bold text-slate-600">
                                                {log.user_avatar || '??'}
                                            </div>
                                            <span className="text-xs font-medium text-slate-700">{log.user_name}</span>
                                            <span className="text-[10px] text-slate-400">({log.user_role})</span>
                                        </div>
                                        <div className="flex items-center gap-3 text-[10px] text-slate-400 font-mono">
                                            <span title="Dirección IP">{log.meta?.ip || 'N/A'}</span>
                                            <span className="hidden sm:inline">•</span>
                                            <span title="Navegador" className="hidden sm:inline">{log.meta?.browser || 'N/A'}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        );
                    })}

                    {!loading && filteredLogs.length === 0 && (
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