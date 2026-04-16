import React, { useState, useEffect } from 'react';
import { supabase } from '../src/lib/supabase';
import { useAuth } from '../src/lib/AuthContext';
import { useNavigate } from 'react-router-dom';

interface SystemError {
    id: string;
    created_at: string;
    user_name: string;
    user_role: string;
    context: string;
    message: string;
    stack: string | null;
    severity: 'ERROR' | 'WARNING' | 'CRITICAL';
    metadata: any;
}

const ErrorLogViewer: React.FC = () => {
    const navigate = useNavigate();
    const { user } = useAuth();
    const [errors, setErrors] = useState<SystemError[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [filterSeverity, setFilterSeverity] = useState<string>('ALL');

    useEffect(() => {
        if (user?.role !== 'SuperAdmin') {
            navigate('/surgeries');
            return;
        }
        fetchErrors();
    }, [user, navigate]);

    const fetchErrors = async () => {
        try {
            setLoading(true);
            const { data, error } = await supabase
                .from('system_errors')
                .select('*')
                .order('created_at', { ascending: false });

            if (error) throw error;
            if (data) setErrors(data);
        } catch (err) {
            console.error('Error fetching system errors:', err);
        } finally {
            setLoading(false);
        }
    };

    const deleteLogs = async () => {
        if (!window.confirm('¿Está seguro de que desea limpiar todos los logs de errores?')) return;
        try {
            const { error } = await supabase
                .from('system_errors')
                .delete()
                .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all

            if (error) throw error;
            setErrors([]);
            alert('Logs eliminados correctamente.');
        } catch (err) {
            alert('Error al eliminar logs.');
        }
    };

    const filteredErrors = errors.filter(error => {
        const matchesSearch =
            (error.message?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
            (error.context?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
            (error.user_name?.toLowerCase() || '').includes(searchTerm.toLowerCase());

        const matchesSeverity = filterSeverity === 'ALL' || error.severity === filterSeverity;

        return matchesSearch && matchesSeverity;
    });

    const getSeverityConfig = (severity: string) => {
        switch (severity) {
            case 'CRITICAL': return { color: 'text-red-700 bg-red-100 border-red-200', icon: 'report' };
            case 'ERROR': return { color: 'text-orange-600 bg-orange-50 border-orange-200', icon: 'error' };
            case 'WARNING': return { color: 'text-amber-600 bg-amber-50 border-amber-200', icon: 'warning' };
            default: return { color: 'text-slate-600 bg-slate-50 border-slate-200', icon: 'info' };
        }
    };

    return (
        <div className="flex-1 h-full overflow-y-auto bg-slate-50 p-8 font-sans">
            <div className="max-w-6xl mx-auto flex flex-col gap-6">

                {/* Header */}
                <div className="flex justify-between items-end">
                    <div>
                        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-3">
                            <span className="material-symbols-outlined text-red-500">bug_report</span>
                            Logs de Errores del Sistema
                        </h1>
                        <p className="text-sm text-slate-500 mt-1">Telemetría técnica para diagnóstico y solución de problemas.</p>
                    </div>
                    <div className="flex gap-2">
                        <button
                            onClick={fetchErrors}
                            className="flex items-center justify-center size-10 bg-white border border-slate-200 text-slate-500 rounded-lg hover:bg-slate-50 transition-colors"
                            title="Refrescar"
                        >
                            <span className={`material-symbols-outlined ${loading ? 'animate-spin' : ''}`}>refresh</span>
                        </button>
                        <button
                            onClick={deleteLogs}
                            className="flex items-center gap-2 px-4 py-2 bg-red-50 border border-red-200 text-red-700 font-bold text-sm rounded-lg hover:bg-red-100 transition-colors shadow-sm"
                        >
                            <span className="material-symbols-outlined text-lg">delete_sweep</span>
                            Limpiar Logs
                        </button>
                    </div>
                </div>

                {/* Toolbar */}
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row gap-4">
                    <div className="relative flex-1">
                        <span className="material-symbols-outlined absolute left-3 top-2.5 text-slate-400">search</span>
                        <input
                            type="text"
                            placeholder="Buscar por mensaje, contexto o usuario..."
                            className="w-full pl-10 pr-4 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-slate-500 focus:border-slate-500 outline-none text-sm"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                    <div className="w-full md:w-64">
                        <select
                            className="w-full py-2 px-3 rounded-lg border border-slate-300 bg-white text-sm text-slate-700 focus:ring-2 focus:ring-slate-500 outline-none cursor-pointer"
                            value={filterSeverity}
                            onChange={(e) => setFilterSeverity(e.target.value)}
                        >
                            <option value="ALL">Todas las Severidades</option>
                            <option value="CRITICAL">Críticos (CRITICAL)</option>
                            <option value="ERROR">Errores (ERROR)</option>
                            <option value="WARNING">Advertencias (WARNING)</option>
                        </select>
                    </div>
                </div>

                {/* Main List */}
                <div className="flex flex-col gap-3">
                    {loading && errors.length === 0 ? (
                        <div className="p-12 text-center bg-white rounded-xl border border-slate-200 border-dashed">
                            <span className="material-symbols-outlined animate-spin text-4xl text-slate-300 mb-2">progress_activity</span>
                            <p className="text-slate-500 font-medium">Cargando telemetría...</p>
                        </div>
                    ) : filteredErrors.map((err) => {
                        const config = getSeverityConfig(err.severity);

                        return (
                            <div key={err.id} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
                                <div className={`px-4 py-3 border-b flex justify-between items-center ${config.color} border-opacity-20`}>
                                    <div className="flex items-center gap-3">
                                        <span className="material-symbols-outlined text-xl">{config.icon}</span>
                                        <span className="font-bold text-xs uppercase tracking-wider">{err.severity}</span>
                                        <span className="text-xs font-medium opacity-60">•</span>
                                        <span className="text-xs font-bold uppercase">{err.context}</span>
                                    </div>
                                    <span className="text-[10px] font-mono opacity-60">
                                        {new Date(err.created_at).toLocaleString('es-AR')}
                                    </span>
                                </div>
                                <div className="p-4">
                                    <p className="text-sm font-bold text-slate-900 mb-2 bg-slate-50 p-2 rounded border border-slate-100">
                                        {err.message}
                                    </p>

                                    {err.stack && (
                                        <details className="mb-3">
                                            <summary className="text-[10px] font-bold text-slate-400 cursor-pointer hover:text-slate-600 transition-colors uppercase">
                                                Ver Stack Trace
                                            </summary>
                                            <pre className="mt-2 p-3 bg-slate-900 text-slate-300 text-[10px] rounded-lg overflow-x-auto font-mono">
                                                {err.stack}
                                            </pre>
                                        </details>
                                    )}

                                    <div className="flex flex-wrap items-center justify-between gap-4 pt-3 border-t border-slate-100">
                                        <div className="flex items-center gap-2">
                                            <div className="size-6 rounded-full bg-slate-200 flex items-center justify-center text-[10px] font-bold text-slate-600">
                                                {err.user_name?.substring(0, 2) || '??'}
                                            </div>
                                            <span className="text-[11px] font-bold text-slate-700">{err.user_name}</span>
                                            <span className="text-[10px] text-slate-400 capitalize">({err.user_role})</span>
                                        </div>

                                        <div className="flex gap-2">
                                            {err.metadata && Object.keys(err.metadata).length > 0 && (
                                                <div className="flex flex-wrap gap-1">
                                                    {Object.entries(err.metadata).map(([key, val]) => (
                                                        <span key={key} className="text-[9px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded font-mono border border-slate-200">
                                                            {key}: {typeof val === 'object' ? JSON.stringify(val) : String(val)}
                                                        </span>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        );
                    })}

                    {!loading && filteredErrors.length === 0 && (
                        <div className="p-12 text-center bg-white rounded-xl border border-slate-200 border-dashed">
                            <span className="material-symbols-outlined text-4xl text-slate-200 mb-2">check_circle</span>
                            <p className="text-slate-400 font-medium italic">No hay errores registrados. ¡Todo funciona correctamente!</p>
                        </div>
                    )}
                </div>

            </div>
        </div>
    );
};

export default ErrorLogViewer;
