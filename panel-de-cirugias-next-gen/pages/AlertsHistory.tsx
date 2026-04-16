import React, { useState, useEffect } from 'react';
import { supabase } from '../src/lib/supabase';
import { useAuth } from '../src/lib/AuthContext';
import { useNavigate } from 'react-router-dom';
import ProgressBar from '../components/ProgressBar';

interface Alert {
    id: string;
    type: string;
    message: string;
    target_role: string;
    acknowledged: boolean;
    created_at: string;
    surgery_id?: string;
    metadata?: any;
}

const AlertsHistory: React.FC = () => {
    const { user } = useAuth();
    const navigate = useNavigate();
    const [alerts, setAlerts] = useState<Alert[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState<'all' | 'unread' | 'read'>('all');
    const [role, setRole] = useState<string>('');

    useEffect(() => {
        if (user) {
            setRole(user.role || '');
            fetchAlerts();
        }
    }, [user, filter]);

    const fetchAlerts = async () => {
        setLoading(true);
        try {
            let query = supabase
                .from('alerts')
                .select('*')
                .order('created_at', { ascending: false });

            if (user?.role !== 'SuperAdmin') {
                // Filter by role for non-admins (conceptually) - though DB might handle this via RLS
                // For now, we fetch all relevant to role
                query = query.eq('target_role', user?.role);
            }

            if (filter === 'unread') {
                query = query.eq('acknowledged', false);
            } else if (filter === 'read') {
                query = query.eq('acknowledged', true);
            }

            const { data, error } = await query;
            if (error) throw error;
            setAlerts(data || []);
        } catch (err) {
            console.error('Error fetching alerts:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleMarkAsRead = async (id: string) => {
        try {
            const { error } = await supabase
                .from('alerts')
                .update({ acknowledged: true })
                .eq('id', id);

            if (error) throw error;
            // Optimistic update
            setAlerts(prev => prev.map(a => a.id === id ? { ...a, acknowledged: true } : a));
        } catch (err) {
            console.error('Error marking alert as read:', err);
        }
    };

    const deleteAlert = async (id: string) => {
        if (!window.confirm('¿Eliminar esta notificación?')) return;
        try {
            const { error } = await supabase
                .from('alerts')
                .delete()
                .eq('id', id);

            if (error) throw error;
            setAlerts(prev => prev.filter(a => a.id !== id));
        } catch (err) {
            console.error('Error deleting alert:', err);
        }
    };

    const getAlertIcon = (type: string) => {
        switch (type) {
            case 'MATERIAL_DELAY': return 'inventory_2';
            case 'SURGERY_DELAY': return 'access_time';
            case 'DOCUMENT_MISSING': return 'description';
            case 'CANCELLED': return 'cancel';
            default: return 'notifications';
        }
    };

    const getAlertColor = (type: string) => {
        switch (type) {
            case 'MATERIAL_DELAY': return 'text-amber-500 bg-amber-50 border-amber-200';
            case 'SURGERY_DELAY': return 'text-blue-500 bg-blue-50 border-blue-200';
            case 'CANCELLED': return 'text-red-500 bg-red-50 border-red-200';
            default: return 'text-slate-500 bg-slate-50 border-slate-200';
        }
    };

    return (
        <div className="flex-1 h-full overflow-hidden bg-slate-50 relative flex flex-col font-sans">
            <ProgressBar isLoading={loading} />

            {/* Background Decoration */}
            <div className="absolute top-0 right-0 w-1/2 h-full bg-gradient-to-l from-indigo-50/50 to-transparent pointer-events-none z-0" />

            {/* Header */}
            <div className="flex-none px-6 md:px-10 py-8 z-10">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                    <div>
                        <h1 className="text-3xl font-black text-slate-900 tracking-tight flex items-center gap-3">
                            <span className="material-symbols-outlined text-4xl text-indigo-600">notifications_active</span>
                            Centro de Alertas
                        </h1>
                        <p className="text-slate-500 font-medium mt-1 ml-12">Historial de notificaciones y avisos del sistema.</p>
                    </div>

                    <div className="bg-white p-1 rounded-xl shadow-sm border border-slate-200 flex">
                        {[
                            { id: 'all', label: 'Todas' },
                            { id: 'unread', label: 'No Leídas' },
                            { id: 'read', label: 'Archivadas' }
                        ].map((opt) => (
                            <button
                                key={opt.id}
                                onClick={() => setFilter(opt.id as any)}
                                className={`px-4 py-2 rounded-lg text-xs font-bold uppercase transition-all ${filter === opt.id
                                    ? 'bg-slate-900 text-white shadow-md'
                                    : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50'
                                    }`}
                            >
                                {opt.label}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* Alerts List */}
            <div className="flex-1 overflow-y-auto px-6 md:px-10 pb-10 z-10">
                <div className="max-w-4xl mx-auto space-y-4">
                    {loading && alerts.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-20 opacity-50">
                            <div className="size-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mb-4"></div>
                            <p className="font-bold text-slate-400 uppercase tracking-widest text-xs">Cargando alertas...</p>
                        </div>
                    ) : alerts.length > 0 ? (
                        alerts.map((alert) => (
                            <div
                                key={alert.id}
                                className={`group relative overflow-hidden transition-all duration-300 hover:-translate-y-1 hover:shadow-lg rounded-2xl border ${alert.acknowledged ? 'bg-white/60 border-slate-200 opacity-75' : 'bg-white border-indigo-100 shadow-md ring-1 ring-indigo-50'}`}
                            >
                                <div className={`absolute top-0 bottom-0 left-0 w-1.5 ${alert.acknowledged ? 'bg-slate-300' : 'bg-indigo-500'}`} />

                                <div className="p-5 pl-7 flex flex-col md:flex-row gap-4 md:items-center">
                                    {/* Icon */}
                                    <div className={`size-12 min-w-12 rounded-2xl flex items-center justify-center border ${getAlertColor(alert.type)}`}>
                                        <span className="material-symbols-outlined text-2xl">{getAlertIcon(alert.type)}</span>
                                    </div>

                                    {/* Content */}
                                    <div className="flex-1">
                                        <div className="flex flex-wrap items-center gap-2 mb-1">
                                            {alert.type && (
                                                <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded border ${getAlertColor(alert.type)} bg-opacity-10 border-opacity-20`}>
                                                    {alert.type.replace('_', ' ')}
                                                </span>
                                            )}
                                            <span className="text-[10px] font-medium text-slate-400 flex items-center gap-1">
                                                <span className="material-symbols-outlined text-xs">schedule</span>
                                                {new Date(alert.created_at).toLocaleString()}
                                            </span>
                                        </div>
                                        <p className={`text-sm md:text-base leading-snug ${alert.acknowledged ? 'text-slate-500 font-medium' : 'text-slate-800 font-bold'}`}>
                                            {alert.message}
                                        </p>
                                    </div>

                                    {/* Actions */}
                                    <div className="flex items-center gap-2 ml-auto md:ml-0">
                                        {!alert.acknowledged && (
                                            <button
                                                onClick={() => handleMarkAsRead(alert.id)}
                                                className="size-10 flex items-center justify-center rounded-full bg-slate-50 hover:bg-emerald-50 text-slate-400 hover:text-emerald-600 border border-slate-200 transition-colors"
                                                title="Marcar como leída"
                                            >
                                                <span className="material-symbols-outlined text-xl">check</span>
                                            </button>
                                        )}

                                        {/* View Details Action (Navigate if surgery_id exists) */}
                                        {alert.surgery_id && (
                                            <button
                                                onClick={() => navigate(`/surgery/${alert.surgery_id}`)}
                                                className="px-4 py-2 rounded-lg bg-slate-50 hover:bg-indigo-50 text-slate-600 hover:text-indigo-600 border border-slate-200 font-bold text-xs uppercase tracking-wide transition-colors"
                                            >
                                                Ver Detalle
                                            </button>
                                        )}

                                        <button
                                            onClick={() => deleteAlert(alert.id)}
                                            className="size-10 flex items-center justify-center rounded-full bg-slate-50 hover:bg-red-50 text-slate-400 hover:text-red-500 border border-slate-200 transition-colors opacity-0 group-hover:opacity-100"
                                            title="Eliminar"
                                        >
                                            <span className="material-symbols-outlined text-xl">delete</span>
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))
                    ) : (
                        <div className="text-center py-20 border-2 border-dashed border-slate-200 rounded-3xl bg-slate-50/50">
                            <div className="size-20 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4 text-slate-300">
                                <span className="material-symbols-outlined text-5xl">notifications_off</span>
                            </div>
                            <h3 className="text-slate-900 font-black text-lg">Todo al día</h3>
                            <p className="text-slate-500 font-medium">No tienes notificaciones en este filtro.</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default AlertsHistory;