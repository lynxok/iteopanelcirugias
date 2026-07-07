import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../src/lib/supabase';
import { useAuth } from '../src/lib/AuthContext';
import { SystemAlert, AlertSeverity, AlertStatus, UserRole } from '../types';
import { syncAllAlerts, syncSurgeryAlerts } from '../src/lib/alertService';


const AlertsHistory: React.FC = () => {
    const navigate = useNavigate();
    const { user } = useAuth();

    // --- Original State ---
    const [allUsers, setAllUsers] = useState<any[]>([]);
    const [simulatedUserId, setSimulatedUserId] = useState<string>(''); // "" means no simulation
    const [alerts, setAlerts] = useState<SystemAlert[]>([]);
    const [filterStatus, setFilterStatus] = useState<'All' | 'Active' | 'Resolved'>('Active');
    const [filterUser, setFilterUser] = useState<string>('All');
    const [loading, setLoading] = useState(true);
    const [isAuditMode, setIsAuditMode] = useState(false);

    // --- New Telegram Logs State ---
    const [activeTab, setActiveTab] = useState<'alerts' | 'telegram'>('alerts');
    const [telegramLogs, setTelegramLogs] = useState<any[]>([]);
    const [loadingLogs, setLoadingLogs] = useState(false);

    // --- Original Logic: Fetch Alerts ---
    const fetchAndSyncAlerts = async () => {
        setLoading(true);
        try {
            // 1. Fetch Phase (From DB) - Load instantly!
            const { data: finalAlerts, error } = await supabase
                .from('system_alerts')
                .select('*')
                .order('date_generated', { ascending: false });

            if (error) throw error;

            setAlerts((finalAlerts || []).map((a: any) => ({
                id: a.id,
                type: a.type,
                severity: a.severity as AlertSeverity,
                title: a.title,
                message: a.message,
                patientName: a.patient_name,
                surgeryId: a.surgery_id,
                targetRole: a.target_role as UserRole,
                targetDoctorId: a.target_doctor_id,
                targetVendorId: a.target_vendor_id,
                dateGenerated: new Date(a.date_generated).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }),
                deadlineDate: '---',
                status: a.status as AlertStatus,
                resolvedAt: a.resolved_at ? new Date(a.resolved_at).toLocaleString() : undefined,
                resolvedBy: a.resolved_by
            })));

            setLoading(false); // Stop loading immediately!

            // 2. Background Detection Phase - Sync in background silently!
            syncAllAlerts().then(async () => {
                const { data: refreshedAlerts } = await supabase
                    .from('system_alerts')
                    .select('*')
                    .order('date_generated', { ascending: false });
                
                if (refreshedAlerts) {
                    setAlerts(refreshedAlerts.map((a: any) => ({
                        id: a.id,
                        type: a.type,
                        severity: a.severity as AlertSeverity,
                        title: a.title,
                        message: a.message,
                        patientName: a.patient_name,
                        surgeryId: a.surgery_id,
                        targetRole: a.target_role as UserRole,
                        targetDoctorId: a.target_doctor_id,
                        targetVendorId: a.target_vendor_id,
                        dateGenerated: new Date(a.date_generated).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }),
                        deadlineDate: '---',
                        status: a.status as AlertStatus,
                        resolvedAt: a.resolved_at ? new Date(a.resolved_at).toLocaleString() : undefined,
                        resolvedBy: a.resolved_by
                    })));
                }
            }).catch(err => {
                console.error('Error syncing alerts in background:', err);
            });

        } catch (err) {
            console.error('Error fetching alerts:', err);
            setLoading(false);
        }
    };

    // --- New Logic: Fetch Telegram Logs ---
    const fetchTelegramLogs = async () => {
        setLoadingLogs(true);
        try {
            const { data, error } = await supabase
                .from('telegram_notifications')
                .select(`
                    *,
                    users:user_id (name, role),
                    surgeries:surgery_id (
                        patients (full_name),
                        surgery_date
                    )
                `)
                .order('sent_at', { ascending: false })
                .limit(100);

            if (data) {
                setTelegramLogs(data);
            }
        } catch (err) {
            console.error('Error fetching telegram logs:', err);
        } finally {
            setLoadingLogs(false);
        }
    };

    // --- Effects ---
    useEffect(() => {
        if (user && user.role === 'SuperAdmin') {
            setIsAuditMode(true);
            // Fetch all users for simulation dropdown
            const fetchUsers = async () => {
                const { data } = await supabase
                    .from('users')
                    .select('id, name, role, doctor_id')
                    .order('name');
                setAllUsers(data || []);
            };
            fetchUsers();
        }
    }, [user]);

    useEffect(() => {
        fetchAndSyncAlerts();
    }, []); // Only fetch once or refresh manually

    useEffect(() => {
        if (activeTab === 'telegram') {
            fetchTelegramLogs();
        }
    }, [activeTab]);

    // --- Handlers ---
    // v1.1.13: Track Check-in (Taking Responsibility)
    const handleCheckIn = async (alert: SystemAlert) => {
        // Just record who saw it/is handling it, don't close it
        try {
            if (alert.resolvedBy) return; // Already claimed

            await supabase
                .from('system_alerts')
                .update({
                    resolved_by: user?.name || 'Usuario', // "Taken by"
                    resolved_by_id: user?.id
                })
                .eq('id', alert.id);

            fetchAndSyncAlerts();
        } catch (err) {
            console.error('Error handling check-in:', err);
        }
        navigate(`/detail/${alert.surgeryId}`);
    };

    const handleResolve = async (id: string) => {
        try {
            const now = new Date().toISOString();
            const { error } = await supabase
                .from('system_alerts')
                .update({
                    status: 'Resolved',
                    resolved_at: now,
                    resolved_by: user?.name || 'Sistema',
                    resolved_by_id: user?.id
                })
                .eq('id', id);

            if (error) throw error;
            fetchAndSyncAlerts();
        } catch (err) {
            console.error('Error resolving alert:', err);
        }
    };

    // Unified Alert Generation logic removed from here as it is now centralized in alertService.ts


    // Resolving users for filter
    const resolvers = Array.from(new Set(alerts.filter(a => a.resolvedBy).map(a => a.resolvedBy || '')));

    // Filter Logic
    // Filter Logic
    const filteredAlerts = alerts.filter(alert => {
        // Determine "Role" context
        let actingRole = user?.role;
        let actingDoctorId = user?.doctorId;

        if (user?.role === 'SuperAdmin') {
            if (simulatedUserId) {
                const simulatedUser = allUsers.find(u => u.id === simulatedUserId);
                if (simulatedUser) {
                    actingRole = simulatedUser.role;
                    actingDoctorId = simulatedUser.doctor_id;
                }
            } else {
                // If not simulating, SuperAdmin sees everything in Audit Mode or just generic filter
                actingRole = 'SuperAdmin';
            }
        }

        let roleMatch = false;

        if (actingRole === 'SuperAdmin') {
            roleMatch = true;
        } else {
            roleMatch = alert.targetRole === actingRole;

            // Specific Role Filters
            if (actingRole === 'Medico' && actingDoctorId) {
                if (alert.targetDoctorId) {
                    roleMatch = roleMatch && alert.targetDoctorId === actingDoctorId;
                }
            } else if (actingRole === 'Ortopedia') {
                // If it's for Ortopedia role, check if it has a targetVendorId
                // If it has, user must match it. If not, it's a general ortho alert.
                if (alert.targetVendorId && !user?.can_view_all_vendors) {
                    roleMatch = roleMatch && alert.targetVendorId === user?.vendorId;
                }
            }
        }

        const statusMatch = filterStatus === 'All' || alert.status === filterStatus;
        const userMatch = filterUser === 'All' || alert.resolvedBy === filterUser;
        return roleMatch && statusMatch && userMatch;
    });

    // Helper for Styles
    const getSeverityStyles = (severity: AlertSeverity) => {
        switch (severity) {
            case 'Critical': return { bg: 'bg-slate-900', border: 'border-red-500', text: 'text-red-400', icon: 'gpp_maybe' };
            case 'Urgent': return { bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-700', icon: 'error' };
            case 'Warning': return { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-700', icon: 'warning' };
            case 'Info': return { bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-700', icon: 'info' };
        }
    };

    return (
        <div className="flex-1 h-full overflow-y-auto bg-slate-50 p-8 font-sans">
            <div className="max-w-6xl mx-auto flex flex-col gap-6">

                {/* Header & Tabs */}
                <div className="flex flex-col gap-6">
                    <div className="flex justify-between items-end">
                        <div className="flex items-center gap-3">
                            <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
                                <span className="material-symbols-outlined text-indigo-600">
                                    {activeTab === 'alerts' ? 'notifications_active' : 'history_edu'}
                                </span>
                                {activeTab === 'alerts' ? (isAuditMode ? 'Auditoría de Alertas' : 'Centro de Alertas') : 'Registro de Notificaciones'}
                            </h1>
                        </div>

                        {/* Tabs */}
                        <div className="bg-white p-1 rounded-lg border border-slate-200 flex shadow-sm">
                            <button
                                onClick={() => setActiveTab('alerts')}
                                className={`px-4 py-2 rounded-md text-sm font-bold flex items-center gap-2 transition-all ${activeTab === 'alerts' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-500 hover:text-slate-700'}`}
                            >
                                <span className="material-symbols-outlined text-lg">notifications</span>
                                Alertas Activas
                            </button>
                            <button
                                onClick={() => setActiveTab('telegram')}
                                className={`px-4 py-2 rounded-md text-sm font-bold flex items-center gap-2 transition-all ${activeTab === 'telegram' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-500 hover:text-slate-700'}`}
                            >
                                <span className="material-symbols-outlined text-lg">send</span>
                                Log Telegram
                            </button>
                        </div>
                    </div>

                    {/* ALERTS TAB CONTENT */}
                    {activeTab === 'alerts' && (
                        <>
                            <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                                <div>
                                    <p className="text-slate-500 text-sm">
                                        {simulatedUserId
                                            ? `Simulando vista de: ${allUsers.find(u => u.id === simulatedUserId)?.name}`
                                            : isAuditMode
                                                ? 'Registro histórico centralizado de alertas y gestiones realizadas.'
                                                : `Avisos automáticos para: ${user?.role}`}
                                    </p>
                                    {user?.role === 'SuperAdmin' && (
                                        <button
                                            onClick={() => setIsAuditMode(!isAuditMode)}
                                            className={`mt-2 text-[10px] px-2 py-0.5 rounded-full font-bold border transition-colors ${isAuditMode ? 'bg-indigo-600 text-white border-indigo-500' : 'bg-white text-slate-500 border-slate-200 hover:border-indigo-400'
                                                }`}
                                        >
                                            {isAuditMode ? 'MODO AUDITORÍA ON' : 'ACTIVAR AUDITORÍA'}
                                        </button>
                                    )}
                                </div>

                                <div className="flex flex-col md:flex-row gap-2">
                                    {/* User Filter (Audit Mode) */}
                                    {isAuditMode && (
                                        <select
                                            value={filterUser}
                                            onChange={(e) => setFilterUser(e.target.value)}
                                            className="bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-lg text-xs font-bold text-slate-700 outline-none hover:border-slate-300 focus:border-indigo-500 transition-all"
                                        >
                                            <option value="All">Todos los Usuarios</option>
                                            {resolvers.map(res => (
                                                <option key={res} value={res!}>{res}</option>
                                            ))}
                                        </select>
                                    )}

                                    {/* Simulation Dropdown (SuperAdmin) */}
                                    {user?.role === 'SuperAdmin' && (
                                        <div className="flex flex-col">
                                            <select
                                                value={simulatedUserId}
                                                onChange={(e) => setSimulatedUserId(e.target.value)}
                                                className="bg-indigo-50 border border-indigo-200 text-indigo-700 px-3 py-1.5 rounded-lg text-xs font-bold outline-none shadow-sm focus:ring-2 focus:ring-indigo-500"
                                            >
                                                <option value="">Vista Global (Sin Simulación)</option>
                                                {allUsers.map(u => (
                                                    <option key={u.id} value={u.id}>
                                                        {u.name} ({u.role})
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                    )}

                                    {/* Status Tabs */}
                                    <div className="bg-slate-100 p-1 rounded-lg flex">
                                        {['Active', 'Resolved', 'All'].map(status => (
                                            <button
                                                key={status}
                                                onClick={() => setFilterStatus(status as any)}
                                                className={`px-3 py-1 rounded text-xs font-bold transition-all ${filterStatus === status
                                                    ? 'bg-white text-slate-900 shadow-sm'
                                                    : 'text-slate-500 hover:text-slate-700'
                                                    }`}
                                            >
                                                {status === 'Active' ? 'Pendientes' : status === 'Resolved' ? 'Resueltas' : 'Todo'}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            <div className="flex flex-col gap-4">
                                {loading ? (
                                    <div className="text-center py-12">
                                        <span className="material-symbols-outlined animate-spin text-slate-300 text-4xl">sync</span>
                                    </div>
                                ) : filteredAlerts.length > 0 ? (
                                    filteredAlerts.map(alert => {
                                        const styles = getSeverityStyles(alert.severity);
                                        const isResolved = alert.status === 'Resolved';

                                        return (
                                            <div
                                                key={alert.id}
                                                className={`relative flex flex-col md:flex-row gap-4 p-5 rounded-xl border shadow-sm transition-all ${isResolved ? 'bg-white border-slate-200 opacity-80' : `bg-white ${styles.border} border-l-4`
                                                    }`}
                                            >
                                                {/* Left Icon */}
                                                <div className="flex-shrink-0">
                                                    <div className={`size-10 rounded-full flex items-center justify-center ${isResolved ? 'bg-emerald-50 text-emerald-600' : `${styles.bg} ${styles.text}`
                                                        }`}>
                                                        <span className="material-symbols-outlined">{isResolved ? 'task_alt' : styles.icon}</span>
                                                    </div>
                                                </div>

                                                {/* Content */}
                                                <div className="flex-1">
                                                    <div className="flex flex-wrap justify-between items-start mb-1">
                                                        <div className="flex items-center gap-2">
                                                            <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${isResolved ? 'bg-emerald-100 text-emerald-700' : `${styles.bg} ${styles.text}`
                                                                }`}>
                                                                {alert.type}
                                                            </span>
                                                            <h3 className={`font-bold text-base ${isResolved ? 'text-slate-500' : 'text-slate-900'}`}>
                                                                {alert.title}
                                                            </h3>
                                                        </div>
                                                        <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">{alert.dateGenerated}</span>
                                                    </div>

                                                    <p className={`text-sm mb-3 ${isResolved ? 'text-slate-600' : 'text-slate-700'}`}>
                                                        {alert.message}
                                                    </p>

                                                    {/* Footer Details */}
                                                    <div className="flex flex-wrap items-center gap-4 text-[10px] bg-slate-50 p-2 rounded-lg border border-slate-100 w-fit">
                                                        <div className="flex items-center gap-1.5 text-slate-600">
                                                            <span className="material-symbols-outlined text-sm">person</span>
                                                            <span className="font-bold">{alert.patientName}</span>
                                                        </div>
                                                        <div className="w-px h-3 bg-slate-300"></div>
                                                        <div className="flex items-center gap-1.5 text-slate-600 font-medium">
                                                            <span className="material-symbols-outlined text-sm">assignment</span>
                                                            <span>REF #{alert.surgeryId.split('-')[0]}</span>
                                                        </div>
                                                        {isAuditMode && (
                                                            <>
                                                                <div className="w-px h-3 bg-slate-300"></div>
                                                                <div className="flex items-center gap-1.5 text-indigo-600 font-bold">
                                                                    <span className="material-symbols-outlined text-sm">groups</span>
                                                                    <span>ROL: {alert.targetRole}</span>
                                                                </div>
                                                            </>
                                                        )}
                                                    </div>

                                                    {/* Resolution Info */}
                                                    {isResolved && (
                                                        <div className="mt-3 text-[11px] bg-emerald-50 text-emerald-700 p-2 rounded-lg border border-emerald-100 flex items-center justify-between">
                                                            <div className="flex items-center gap-2">
                                                                <span className="font-bold uppercase tracking-tight">Atendido por:</span>
                                                                <span className="font-black underline decoration-emerald-500">{alert.resolvedBy}</span>
                                                            </div>
                                                            <span className="font-mono text-[10px] opacity-70">{alert.resolvedAt}</span>
                                                        </div>
                                                    )}
                                                </div>

                                                {/* Actions */}
                                                {!isResolved && (
                                                    <div className="flex flex-row md:flex-col gap-2 justify-center border-t md:border-t-0 md:border-l border-slate-100 pt-4 md:pt-0 md:pl-4 min-w-[140px]">
                                                        <button
                                                            onClick={() => handleCheckIn(alert)}
                                                            className="flex-1 px-3 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-[10px] font-bold rounded-lg transition-colors flex items-center justify-center gap-2"
                                                        >
                                                            Ver Detalles
                                                        </button>
                                                        <button
                                                            onClick={() => handleResolve(alert.id)}
                                                            className="flex-1 px-3 py-2 bg-slate-900 hover:bg-slate-800 text-white text-[10px] font-bold rounded-lg transition-colors shadow-sm flex items-center justify-center gap-2"
                                                        >
                                                            <span className="material-symbols-outlined text-sm">check</span>
                                                            Marcar Gestión
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })
                                ) : (
                                    <div className="text-center py-12 bg-white rounded-xl border border-dashed border-slate-300">
                                        <span className="material-symbols-outlined text-4xl text-slate-300 mb-2">check_circle</span>
                                        <h3 className="text-slate-900 font-bold">Todo al día</h3>
                                        <p className="text-slate-500 text-sm">No hay alertas {filterStatus === 'Active' ? 'activas' : ''} para {simulatedUserId ? 'este usuario simulado' : user?.role} en este momento.</p>
                                    </div>
                                )}
                            </div>
                        </>
                    )}

                    {/* TELEGRAM LOG TAB CONTENT */}
                    {activeTab === 'telegram' && (
                        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden animate-fadeIn">
                            <div className="p-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
                                <div>
                                    <h2 className="text-sm font-bold text-slate-700">Historial de Envíos</h2>
                                    <p className="text-xs text-slate-500">Últimos 100 mensajes procesados por el sistema.</p>
                                </div>
                                <button
                                    onClick={fetchTelegramLogs}
                                    className="p-2 text-slate-500 hover:text-indigo-600 hover:bg-white rounded-full transition-all"
                                    title="Actualizar Log"
                                >
                                    <span className={`material-symbols-outlined ${loadingLogs ? 'animate-spin' : ''}`}>sync</span>
                                </button>
                            </div>

                            <div className="overflow-x-auto">
                                <table className="w-full text-left border-collapse">
                                    <thead>
                                        <tr className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider">
                                            <th className="px-6 py-3 font-bold">Fecha</th>
                                            <th className="px-6 py-3 font-bold">Destinatario</th>
                                            <th className="px-6 py-3 font-bold">Contexto (Paciente/Cirugía)</th>
                                            <th className="px-6 py-3 font-bold">Mensaje</th>
                                            <th className="px-6 py-3 font-bold text-right">Estado</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {loadingLogs ? (
                                            <tr>
                                                <td colSpan={5} className="px-6 py-12 text-center text-slate-400">
                                                    <div className="flex flex-col items-center gap-2">
                                                        <span className="material-symbols-outlined animate-spin text-3xl">sync</span>
                                                        <span className="text-xs">Cargando registros...</span>
                                                    </div>
                                                </td>
                                            </tr>
                                        ) : telegramLogs.length === 0 ? (
                                            <tr>
                                                <td colSpan={5} className="px-6 py-12 text-center text-slate-400">
                                                    No hay registros de notificaciones enviadas.
                                                </td>
                                            </tr>
                                        ) : (
                                            telegramLogs.map((log) => (
                                                <tr key={log.id} className="hover:bg-slate-50 transition-colors text-sm text-slate-700">
                                                    <td className="px-6 py-4 whitespace-nowrap font-mono text-xs">
                                                        {new Date(log.sent_at).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <div className="flex flex-col">
                                                            <span className="font-bold text-slate-900">{log.users?.name || 'Desconocido'}</span>
                                                            <span className="text-[10px] uppercase text-slate-400">{log.users?.role || 'N/A'}</span>
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        {log.surgeries ? (
                                                            <div className="flex flex-col">
                                                                <span className="font-medium text-slate-800">
                                                                    {(log.surgeries.patients as any)?.full_name || 'Paciente sin nombre'}
                                                                </span>
                                                                <span className="text-[10px] text-slate-500">
                                                                    {new Date(log.surgeries.surgery_date).toLocaleDateString('es-ES')}
                                                                </span>
                                                            </div>
                                                        ) : (
                                                            <span className="text-slate-400 italic">-- sin cirugía vinculada --</span>
                                                        )}
                                                    </td>
                                                    <td className="px-6 py-4 max-w-xs">
                                                        <p className="truncate text-slate-600" title={log.message_content}>
                                                            {log.message_content}
                                                        </p>
                                                        <span className="text-[10px] text-slate-400 uppercase tracking-wider">{log.message_type}</span>
                                                    </td>
                                                    <td className="px-6 py-4 text-right">
                                                        <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide ${log.status === 'sent'
                                                            ? 'bg-emerald-100 text-emerald-700'
                                                            : 'bg-red-100 text-red-700'
                                                            }`}>
                                                            {log.status === 'sent' ? (
                                                                <>
                                                                    <span className="material-symbols-outlined text-[10px]">check</span>
                                                                    Enviado
                                                                </>
                                                            ) : (
                                                                <>
                                                                    <span className="material-symbols-outlined text-[10px]">error</span>
                                                                    Error
                                                                </>
                                                            )}
                                                        </span>
                                                    </td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default AlertsHistory;