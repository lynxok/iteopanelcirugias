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

    // Pagination & Filter State
    const [page, setPage] = useState(0);
    const [pageSize, setPageSize] = useState(10);
    const [totalCount, setTotalCount] = useState(0);
    const [searchTerm, setSearchTerm] = useState('');
    const [filterType, setFilterType] = useState<string>('ALL');

    useEffect(() => {
        if (user?.role === 'Medico') {
            navigate('/surgeries');
            return;
        }
    }, [user, navigate]);

    // Fetch when pagination or filters change
    useEffect(() => {
        fetchLogs();
    }, [page, pageSize, filterType, searchTerm]); // Search term should ideally be debounced in a real app, but direct effect is fine for now

    const fetchLogs = async () => {
        try {
            setLoading(true);

            let query = supabase
                .from('audit_logs')
                .select('*', { count: 'exact' });

            // Apply Filters (Server-Side)
            if (filterType !== 'ALL') {
                query = query.eq('action', filterType);
            }

            if (searchTerm) {
                // Search across multiple columns using OR syntax
                query = query.or(`description.ilike.%${searchTerm}%,user_name.ilike.%${searchTerm}%,resource_id.ilike.%${searchTerm}%`);
            }

            // Apply Pagination
            const from = page * pageSize;
            const to = from + pageSize - 1;

            const { data, count, error } = await query
                .order('created_at', { ascending: false })
                .range(from, to);

            if (error) throw error;

            if (data) setLogs(data);
            if (count !== null) setTotalCount(count);

        } catch (err) {
            console.error('Error fetching audit logs:', err instanceof Error ? err.message : JSON.stringify(err));
        } finally {
            setLoading(false);
        }
    };

    const handlePageChange = (newPage: number) => {
        if (newPage >= 0 && newPage < Math.ceil(totalCount / pageSize)) {
            setPage(newPage);
        }
    };

    const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setSearchTerm(e.target.value);
        setPage(0); // Reset to first page on search
    };

    const handleFilterChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        setFilterType(e.target.value);
        setPage(0); // Reset to first page on filter change
    };

    const handlePageSizeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        setPageSize(Number(e.target.value));
        setPage(0); // Reset to first page on size change
    };

    // Helper for Total Pages
    const totalPages = Math.ceil(totalCount / pageSize);

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
        <div className="flex-1 h-full overflow-y-auto bg-slate-50 p-4 md:p-8 font-sans flex flex-col">
            <div className="max-w-5xl mx-auto flex flex-col gap-6 w-full flex-1">

                {/* Header */}
                <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
                    <div>
                        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-3">
                            <span className="material-symbols-outlined text-slate-400">history_edu</span>
                            Registro de Auditoría
                        </h1>
                        <p className="text-sm text-slate-500 mt-1">Historial inmutable de acciones y seguridad del sistema.</p>
                    </div>
                    <div className="flex gap-2 w-full md:w-auto">
                        <button
                            onClick={fetchLogs}
                            className="flex items-center justify-center size-10 bg-white border border-slate-200 text-slate-500 rounded-lg hover:bg-slate-50 transition-colors"
                            title="Refrescar"
                        >
                            <span className={`material-symbols-outlined ${loading ? 'animate-spin' : ''}`}>refresh</span>
                        </button>
                        <button className="flex-1 md:flex-none flex items-center justify-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-700 font-bold text-sm rounded-lg hover:bg-slate-50 transition-colors shadow-sm">
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
                            onChange={handleSearchChange}
                        />
                    </div>
                    <div className="w-full md:w-48">
                        <select
                            className="w-full py-2 px-3 rounded-lg border border-slate-300 bg-white text-sm text-slate-700 focus:ring-2 focus:ring-slate-500 outline-none cursor-pointer"
                            value={filterType}
                            onChange={handleFilterChange}
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
                <div className="flex flex-col gap-4 relative flex-1 min-h-0">
                    {/* Vertical Line */}
                    <div className="absolute left-6 top-4 bottom-4 w-px bg-slate-200 z-0 hidden md:block"></div>

                    {loading && logs.length === 0 ? (
                        <div className="p-12 text-center bg-white rounded-xl border border-slate-200 border-dashed">
                            <span className="material-symbols-outlined animate-spin text-4xl text-slate-300 mb-2">progress_activity</span>
                            <p className="text-slate-500 font-medium">Cargando registros...</p>
                        </div>
                    ) : logs.map((log) => {
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
                                <div className="flex-1 min-w-0">
                                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 mb-2">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded border uppercase tracking-wider ${config.color}`}>
                                                {log.action}
                                            </span>
                                            <span className="text-xs font-semibold text-slate-400 hidden md:inline">•</span>
                                            <span className="text-xs font-bold text-slate-500 uppercase truncate max-w-[150px]">{log.resource}</span>
                                            <span className="text-xs font-mono bg-slate-100 text-slate-600 px-1.5 rounded truncate max-w-[100px]">{log.resource_id}</span>
                                        </div>
                                        <span className="text-xs text-slate-400 font-medium whitespace-nowrap">{formatTimestamp(log.created_at)}</span>
                                    </div>

                                    <div className="text-sm text-slate-800 mb-3 leading-relaxed whitespace-pre-wrap font-mono bg-slate-50 p-2 rounded border border-slate-100 break-words">
                                        {log.description}
                                    </div>

                                    {/* Meta Footer */}
                                    <div className="flex items-center justify-between pt-3 border-t border-slate-50 mt-1 flex-wrap gap-2">
                                        <div className="flex items-center gap-2">
                                            <div className="size-6 rounded-full bg-slate-200 flex items-center justify-center text-[10px] font-bold text-slate-600 shrink-0">
                                                {log.user_avatar || '??'}
                                            </div>
                                            <span className="text-xs font-medium text-slate-700 truncate max-w-[120px]">{log.user_name}</span>
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

                    {!loading && logs.length === 0 && (
                        <div className="p-12 text-center bg-white rounded-xl border border-slate-200 border-dashed">
                            <span className="material-symbols-outlined text-4xl text-slate-300 mb-2">find_in_page</span>
                            <p className="text-slate-500 font-medium">No se encontraron registros de auditoría con estos criterios.</p>
                        </div>
                    )}
                </div>

                {/* Pagination Controls */}
                <div className="sticky bottom-0 bg-white p-4 rounded-xl border border-slate-200 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] mt-4 z-20 flex flex-col sm:flex-row items-center justify-between gap-4">

                    <div className="flex items-center gap-2 text-sm text-slate-600 order-2 sm:order-1">
                        <span>Mostrar:</span>
                        <select
                            value={pageSize}
                            onChange={handlePageSizeChange}
                            className="border border-slate-300 rounded-lg text-sm py-1 pl-2 pr-6 focus:ring-2 focus:ring-slate-500 outline-none"
                        >
                            <option value={10}>10</option>
                            <option value={40}>40</option>
                            <option value={60}>60</option>
                            <option value={80}>80</option>
                            <option value={100}>100</option>
                        </select>
                        <span className="hidden sm:inline">registros por página</span>
                    </div>

                    <div className="flex items-center justify-center gap-4 order-1 sm:order-2 w-full sm:w-auto">
                        <span className="text-xs font-bold text-slate-400 uppercase tracking-widest order-2 sm:hidden">
                            {page + 1} / {totalPages || 1}
                        </span>

                        <div className="flex items-center gap-1 order-1 sm:order-2">
                            <button
                                onClick={() => handlePageChange(page - 1)}
                                disabled={page === 0 || loading}
                                className="p-2 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            >
                                <span className="material-symbols-outlined">chevron_left</span>
                            </button>

                            <span className="text-sm font-medium text-slate-700 px-4 hidden sm:block">
                                Página <span className="font-bold">{page + 1}</span> de <span className="font-bold">{totalPages || 1}</span>
                            </span>

                            <button
                                onClick={() => handlePageChange(page + 1)}
                                disabled={page >= totalPages - 1 || loading}
                                className="p-2 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            >
                                <span className="material-symbols-outlined">chevron_right</span>
                            </button>
                        </div>
                    </div>

                    <div className="text-xs text-slate-400 font-medium order-3">
                        Total: <span className="font-bold text-slate-600">{totalCount}</span> eventos
                    </div>
                </div>

            </div>
        </div>
    );
};

export default Audit;