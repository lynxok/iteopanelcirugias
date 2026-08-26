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
    meta: any;
}

const renderMetaChanges = (log: AuditLog) => {
    if (!log.meta || typeof log.meta !== 'object' || log.action !== 'UPDATE') return null;

    const changes = Object.entries(log.meta).filter(
        ([_, val]) => val && typeof val === 'object' && ('old' in val || 'new' in val)
    );

    if (changes.length === 0) return null;

    return (
        <div className="mt-2 text-xs bg-slate-50 border border-slate-100 rounded-lg p-3">
            <div className="font-bold text-slate-500 mb-1.5 uppercase tracking-wider text-[10px]">Valores Modificados:</div>
            <div className="flex flex-col gap-1.5 font-mono">
                {changes.map(([field, val]: [string, any]) => {
                    const oldStr = val.old === null ? 'null' : typeof val.old === 'boolean' ? (val.old ? 'Sí' : 'No') : String(val.old);
                    const newStr = val.new === null ? 'null' : typeof val.new === 'boolean' ? (val.new ? 'Sí' : 'No') : String(val.new);
                    return (
                        <div key={field} className="flex flex-wrap items-center gap-1 border-b border-slate-100 pb-1 last:border-0 last:pb-0">
                            <span className="font-bold text-slate-700">{field}:</span>
                            <span className="bg-red-50 text-red-700 px-1.5 py-0.2 rounded border border-red-100 line-through max-w-[200px] truncate" title={oldStr}>{oldStr}</span>
                            <span className="text-slate-400">➔</span>
                            <span className="bg-emerald-50 text-emerald-700 px-1.5 py-0.2 rounded border border-emerald-100 max-w-[200px] truncate" title={newStr}>{newStr}</span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

interface ResourceDetails {
    patientName?: string;
    documentNumber?: string;
    procedureName?: string;
}

const Audit: React.FC = () => {
    const navigate = useNavigate();
    const { user } = useAuth();
    const [logs, setLogs] = useState<AuditLog[]>([]);
    const [resourceDetailsMap, setResourceDetailsMap] = useState<Record<string, ResourceDetails>>({});
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
                // Buscar pacientes y cirugías asociadas por si el término es un NUC, DNI o Nombre de paciente
                let matchedResourceIds: string[] = [];
                try {
                    // NOTA: la columna 'nuc' es numeric, no acepta ILIKE.
                    // Se busca por igualdad si el término es numérico, y por ILIKE en los campos de texto.
                    const isNumeric = /^\d+$/.test(searchTerm.trim());

                    let patientQuery = supabase
                        .from('patients')
                        .select('id');

                    if (isNumeric) {
                        // Búsqueda exacta en nuc (numeric) + ILIKE en campos de texto
                        patientQuery = patientQuery.or(
                            `nuc.eq.${searchTerm.trim()},document_number.ilike.%${searchTerm}%,full_name.ilike.%${searchTerm}%`
                        );
                    } else {
                        // Búsqueda solo en campos de texto
                        patientQuery = patientQuery.or(
                            `document_number.ilike.%${searchTerm}%,full_name.ilike.%${searchTerm}%`
                        );
                    }

                    const { data: matchedPatients } = await patientQuery;

                    if (matchedPatients && matchedPatients.length > 0) {
                        const patientIds = matchedPatients.map(p => p.id);
                        matchedResourceIds.push(...patientIds);

                        const { data: matchedSurgeries } = await supabase
                            .from('surgeries')
                            .select('id')
                            .in('patient_id', patientIds);

                        if (matchedSurgeries && matchedSurgeries.length > 0) {
                            const surgeryIds = matchedSurgeries.map(s => s.id);
                            matchedResourceIds.push(...surgeryIds);
                        }
                    }
                } catch (e) {
                    console.error('Error pre-fetching resources for search term:', e);
                }

                // Search across multiple columns using OR syntax
                let orConditions = `description.ilike.%${searchTerm}%,user_name.ilike.%${searchTerm}%,resource_id.ilike.%${searchTerm}%`;
                if (matchedResourceIds.length > 0) {
                    orConditions += `,resource_id.in.(${matchedResourceIds.join(',')})`;
                }
                query = query.or(orConditions);
            }

            // Apply Pagination
            const from = page * pageSize;
            const to = from + pageSize - 1;

            const { data, count, error } = await query
                .order('created_at', { ascending: false })
                .range(from, to);

            if (error) throw error;

            if (data) {
                setLogs(data);

                // Resolver datos de paciente, DNI y práctica para los recursos
                const surgeryIds: string[] = [];
                const patientIds: string[] = [];

                data.forEach((log: AuditLog) => {
                    if (!log.resource_id) return;
                    const res = (log.resource || '').toLowerCase();
                    if (res === 'surgeries' || res === 'surgery' || res === 'cirugia' || res === 'cirugias') {
                        surgeryIds.push(log.resource_id);
                    } else if (res === 'patients' || res === 'patient' || res === 'paciente' || res === 'pacientes') {
                        patientIds.push(log.resource_id);
                    }
                });

                const detailsMap: Record<string, ResourceDetails> = {};

                if (surgeryIds.length > 0) {
                    try {
                        const { data: surgeriesData } = await supabase
                            .from('surgeries')
                            .select(`
                                id,
                                procedure_name,
                                patients (
                                    full_name,
                                    document_number
                                )
                            `)
                            .in('id', Array.from(new Set(surgeryIds)));

                        if (surgeriesData) {
                            surgeriesData.forEach((s: any) => {
                                detailsMap[s.id] = {
                                    patientName: s.patients?.full_name || undefined,
                                    documentNumber: s.patients?.document_number || undefined,
                                    procedureName: s.procedure_name || undefined
                                };
                            });
                        }
                    } catch (e) {
                        console.error('Error fetching surgery details for audit:', e);
                    }
                }

                if (patientIds.length > 0) {
                    try {
                        const { data: patientsData } = await supabase
                            .from('patients')
                            .select('id, full_name, document_number')
                            .in('id', Array.from(new Set(patientIds)));

                        if (patientsData) {
                            patientsData.forEach((p: any) => {
                                detailsMap[p.id] = {
                                    ...(detailsMap[p.id] || {}),
                                    patientName: p.full_name || undefined,
                                    documentNumber: p.document_number || undefined
                                };
                            });
                        }
                    } catch (e) {
                        console.error('Error fetching patient details for audit:', e);
                    }
                }

                setResourceDetailsMap(detailsMap);
            }
            if (count !== null) setTotalCount(count);

        } catch (err) {
            console.error('Error fetching audit logs:', err instanceof Error ? err.message : JSON.stringify(err));
        } finally {
            setLoading(false);
        }
    };

    const handleExportCSV = async () => {
        if (logs.length === 0) return;
        
        const headers = ['Fecha', 'Usuario', 'Rol', 'Accion', 'Recurso', 'ID Recurso', 'Paciente', 'DNI', 'Practica', 'Descripcion', 'IP', 'Navegador'];
        const csvRows = [headers.join(',')];
        
        logs.forEach(log => {
            const details = log.resource_id ? resourceDetailsMap[log.resource_id] : undefined;
            const row = [
                `"${new Date(log.created_at).toLocaleString()}"`,
                `"${log.user_name || ''}"`,
                `"${log.user_role || ''}"`,
                `"${log.action || ''}"`,
                `"${log.resource || ''}"`,
                `"${log.resource_id || ''}"`,
                `"${details?.patientName || ''}"`,
                `"${details?.documentNumber || ''}"`,
                `"${details?.procedureName || ''}"`,
                `"${(log.description || '').replace(/"/g, '""')}"`,
                `"${log.meta?.ip || ''}"`,
                `"${log.meta?.browser || ''}"`
            ];
            csvRows.push(row.join(','));
        });
        
        const csvString = '\uFEFF' + csvRows.join('\n'); // BOM for Excel
        const filename = `Auditoria_${new Date().toISOString().slice(0, 10)}.csv`;
        
        const api = (window as any).electronAPI;
        if (api && api.saveFile) {
            const res = await api.saveFile(csvString, filename, 'csv');
            if (res?.success) {
                alert(`CSV exportado correctamente en:\n${res.path}`);
            } else if (res && !res.cancelled) {
                alert(`Error al exportar: ${res.error}`);
            }
        } else {
            const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.setAttribute('href', url);
            link.setAttribute('download', filename);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
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
                        {(user?.role === 'SuperAdmin' || 
                          user?.role === 'Direccion' || 
                          user?.role === 'Administrativo Direccion' || 
                          user?.role === 'Administrativo' || 
                          user?.role === 'Auditoria' || 
                          user?.role === 'Gerencia') && (
                            <button 
                                onClick={handleExportCSV}
                                className="flex-1 md:flex-none flex items-center justify-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-700 font-bold text-sm rounded-lg hover:bg-slate-50 transition-colors shadow-sm"
                            >
                                <span className="material-symbols-outlined text-lg">download</span>
                                Exportar CSV
                            </button>
                        )}
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

                                    {/* Patient & Procedure Info Banner */}
                                    {log.resource_id && resourceDetailsMap[log.resource_id] && (
                                        (resourceDetailsMap[log.resource_id].patientName || resourceDetailsMap[log.resource_id].procedureName) && (
                                            <div className="mb-3 px-3 py-2 bg-sky-50/70 border border-sky-100 rounded-lg flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                                                {resourceDetailsMap[log.resource_id].patientName && (
                                                    <div className="flex items-center gap-1.5 font-bold text-sky-900">
                                                        <span className="material-symbols-outlined text-sm text-sky-600">person</span>
                                                        <span>{resourceDetailsMap[log.resource_id].patientName}</span>
                                                    </div>
                                                )}
                                                {resourceDetailsMap[log.resource_id].documentNumber && (
                                                    <div className="flex items-center gap-1 text-sky-700 font-medium font-mono text-[11px] bg-sky-100/60 px-1.5 py-0.5 rounded border border-sky-200/50">
                                                        <span className="text-[10px] font-bold uppercase text-sky-600">DNI:</span>
                                                        <span>{resourceDetailsMap[log.resource_id].documentNumber}</span>
                                                    </div>
                                                )}
                                                {resourceDetailsMap[log.resource_id].procedureName && (
                                                    <div className="flex items-center gap-1.5 text-slate-700 font-medium">
                                                        <span className="text-sky-300">•</span>
                                                        <span className="material-symbols-outlined text-sm text-sky-600">medical_services</span>
                                                        <span className="font-semibold text-slate-800">{resourceDetailsMap[log.resource_id].procedureName}</span>
                                                    </div>
                                                )}
                                            </div>
                                        )
                                    )}

                                    {renderMetaChanges(log)}

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