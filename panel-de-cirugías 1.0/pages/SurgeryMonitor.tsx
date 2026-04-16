import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../src/lib/supabase';
import ProgressBar from '../components/ProgressBar';
import { useAuth } from '../src/lib/AuthContext';
import { captureError } from '../src/lib/errorLogger';

interface MonitorSurgery {
    id: string;
    patientName: string;
    procedure: string;
    doctorName: string;
    doctorId: string;
    status: string;
    startTime: string;
    estimatedDuration: number;
    orId: string;
    orName: string;
    suspensionRequested?: boolean;
    rescheduleRequested?: boolean;
}

interface OR {
    id: string;
    name: string;
}

const STATUS_OPTIONS = [
    { value: 'scheduled', label: 'Programada', color: 'bg-blue-100 text-blue-700 border-blue-300' },
    { value: 'in_or', label: 'En Quirófano', color: 'bg-purple-100 text-purple-700 border-purple-300' },
    { value: 'in_progress', label: 'En Curso', color: 'bg-indigo-100 text-indigo-700 border-indigo-300 animate-pulse' },
    { value: 'delayed', label: 'Demorada', color: 'bg-amber-100 text-amber-700 border-amber-300' },
    { value: 'completed', label: 'Finalizada', color: 'bg-emerald-100 text-emerald-700 border-emerald-300' },
    { value: 'waiting_date', label: 'A la espera de fecha', color: 'bg-sky-100 text-sky-700 border-sky-300' },
];

const SurgeryMonitor: React.FC = () => {
    const navigate = useNavigate();
    const { user } = useAuth();
    const [surgeries, setSurgeries] = useState<MonitorSurgery[]>([]);
    const [ors, setOrs] = useState<OR[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedOr, setSelectedOr] = useState<string | 'all'>('all');

    // Delay Modal State
    const [delayModal, setDelayModal] = useState<{
        isOpen: boolean;
        surgeryId: string | null;
        delayMinutes: number;
        cleaningMinutes: number;
    }>({
        isOpen: false,
        surgeryId: null,
        delayMinutes: 30,
        cleaningMinutes: 15
    });

    const canEdit = user?.role === 'Quirofano' || user?.role === 'SuperAdmin';

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            // Fetch ORs
            const { data: orData } = await supabase
                .from('operating_rooms')
                .select('id, name')
                .eq('active', true)
                .order('name');
            if (orData) setOrs(orData);

            // Fetch today's surgeries (Local Time)
            const now = new Date();
            const year = now.getFullYear();
            const month = (now.getMonth() + 1).toString().padStart(2, '0');
            const day = now.getDate().toString().padStart(2, '0');
            const today = `${year}-${month}-${day}`;
            let query = supabase
                .from('surgeries')
                .select(`
                    id,
                    status,
                    start_time,
                    estimated_duration,
                    procedure_name,
                    operating_room_id,
                    doctor_id,
                    ortho_validated,
                    admission_validated,
                    or_validated,
                    surgery_date,
                    patients (full_name),
                    doctors!doctor_id (id, full_name),
                    operating_rooms (id, name),
                    suspension_requested,
                    reschedule_requested
                `)
                .eq('surgery_date', today)
                .neq('status', 'cancelled')
                .neq('status', 'suspended')
                .order('start_time', { ascending: true });

            const { data, error } = await query;
            if (error) throw error;

            if (data) {
                const mapped: MonitorSurgery[] = data.map((s: any) => {
                    let finalStatus = s.status;

                    // 0. Visual Promotion for Pending (v1.1.11 Logic)
                    if (finalStatus === 'pending_validation' || finalStatus === 'waiting_date' || finalStatus === 'scheduled') {
                        if (s.ortho_validated && s.admission_validated) {
                            if (s.or_validated && s.surgery_date) {
                                finalStatus = 'scheduled';
                            } else {
                                finalStatus = 'waiting_date';
                            }
                        } else {
                            finalStatus = 'pending_validation';
                        }
                    }

                    return {
                        id: s.id,
                        patientName: s.patients?.full_name || 'N/A',
                        procedure: s.procedure_name || 'N/A',
                        doctorName: s.doctors?.full_name || 'N/A',
                        doctorId: s.doctors?.id || s.doctor_id,
                        status: finalStatus,
                        startTime: s.start_time || '00:00',
                        estimatedDuration: s.estimated_duration || 60,
                        orId: s.operating_rooms?.id || s.operating_room_id,
                        orName: s.operating_rooms?.name || 'Sin asignar',
                        suspensionRequested: s.suspension_requested,
                        rescheduleRequested: s.reschedule_requested
                    };
                });
                setSurgeries(mapped);
            }
        } catch (err) {
            console.error('Error fetching monitor data:', err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchData();

        // Real-time subscription
        const channel = supabase
            .channel('monitor-changes')
            .on(
                'postgres_changes',
                { event: '*', schema: 'quirofano', table: 'surgeries' },
                (payload) => {
                    // console.log('Real-time update:', payload);
                    fetchData();
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [fetchData]);

    const handleStatusChange = async (surgeryId: string, newStatus: string) => {
        if (!canEdit) return;

        if (newStatus === 'delayed') {
            setDelayModal({ isOpen: true, surgeryId, delayMinutes: 30, cleaningMinutes: 15 });
            return;
        }

        try {
            const now = new Date().toISOString();
            const updatePayload: any = { status: newStatus };

            // Record actual timestamps for efficiency tracking
            if (newStatus === 'in_progress') {
                updatePayload.actual_start_time = now;
            }
            if (newStatus === 'completed') {
                updatePayload.actual_end_time = now;
            }

            const { error } = await supabase
                .from('surgeries')
                .update(updatePayload)
                .eq('id', surgeryId);

            if (error) throw error;

            // Audit log
            const statusLabel = STATUS_OPTIONS.find(opt => opt.value === newStatus)?.label || newStatus;
            const surgery = surgeries.find(s => s.id === surgeryId);
            supabase.from('audit_logs').insert({
                user_name: user?.name || 'Usuario',
                user_role: user?.role,
                action: 'UPDATE',
                resource: 'Cirugía',
                resource_id: surgeryId,
                description: `Monitor: Cambio de estado a "${statusLabel}" para ${surgery?.patientName || ''}`,
                meta: { source: 'SurgeryMonitor', newStatus, patient_name: surgery?.patientName }
            }).then(({ error: auditError }) => {
                if (auditError) console.warn('Silent Audit Error:', auditError);
            });

            fetchData();
        } catch (err) {
            console.error('Error updating status:', err);
            alert('Error al actualizar el estado');
        }
    };

    const handleDelayConfirm = async () => {
        if (!delayModal.surgeryId || !canEdit) return;

        try {
            // Call Database RPC to handle shift and list logic
            const { error } = await supabase.rpc('register_surgery_delay', {
                p_surgery_id: delayModal.surgeryId,
                p_delay_minutes: delayModal.delayMinutes,
                p_cleaning_minutes: delayModal.cleaningMinutes
            });

            if (error) throw error;

            // Audit log
            captureError("Evento de Auditoría: Demora Registrada", {
                context: 'SurgeryMonitor.handleDelayConfirm.audit',
                severity: 'WARNING',
                user: user,
                metadata: {
                    user_name: user?.name,
                    action: 'DELAY_REGISTERED',
                    resource_id: delayModal.surgeryId,
                    delayMinutes: delayModal.delayMinutes,
                    cleaningMinutes: delayModal.cleaningMinutes
                }
            });

            setDelayModal({ isOpen: false, surgeryId: null, delayMinutes: 30, cleaningMinutes: 15 });
            fetchData();
            alert('Demora registrada y horarios actualizados correctamente.');
        } catch (err) {
            console.error('Error applying delay:', err);
            alert('Error al aplicar la demora: ' + (err as any).message);
        }
    };

    const filteredSurgeries = selectedOr === 'all'
        ? surgeries
        : surgeries.filter(s => s.orId === selectedOr);

    const getStatusStyle = (status: string) => {
        return STATUS_OPTIONS.find(s => s.value === status)?.color || 'bg-slate-100 text-slate-700';
    };

    const getStatusLabel = (status: string) => {
        return STATUS_OPTIONS.find(s => s.value === status)?.label || status;
    };

    return (
        <div className="flex-1 h-full overflow-y-auto bg-slate-100 p-6 pb-32 font-sans">
            <ProgressBar isLoading={loading} />
            <div className="max-w-7xl mx-auto">
                {/* Header */}
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
                    <div>
                        <h1 className="text-2xl font-black text-slate-900 flex items-center gap-3">
                            <span className="material-symbols-outlined text-primary text-3xl">monitor_heart</span>
                            Monitor en Vivo
                        </h1>
                        <p className="text-slate-500 text-sm mt-1">
                            Seguimiento en tiempo real de las cirugías del día.
                            {!canEdit && <span className="text-amber-600 font-bold ml-2">(Solo lectura)</span>}
                        </p>
                    </div>
                    <div className="flex items-center gap-3">
                        <select
                            value={selectedOr}
                            onChange={(e) => setSelectedOr(e.target.value)}
                            className="px-4 py-2 rounded-lg border border-slate-300 bg-white text-sm font-medium focus:ring-2 focus:ring-primary outline-none"
                        >
                            <option value="all">Todos los Quirófanos</option>
                            {ors.map(or => (
                                <option key={or.id} value={or.id}>{or.name}</option>
                            ))}
                        </select>
                        <button
                            onClick={() => fetchData()}
                            className="p-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 transition-colors"
                            title="Actualizar"
                        >
                            <span className="material-symbols-outlined text-slate-600">refresh</span>
                        </button>
                    </div>
                </div>

                {/* Grid */}
                {loading ? (
                    <div className="flex items-center justify-center h-64">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
                    </div>
                ) : filteredSurgeries.length === 0 ? (
                    <div className="bg-white rounded-xl p-12 text-center border border-slate-200">
                        <span className="material-symbols-outlined text-5xl text-slate-300 mb-4">event_busy</span>
                        <h3 className="text-lg font-bold text-slate-600">No hay cirugías programadas para hoy</h3>
                        <p className="text-slate-400 text-sm mt-1">Las cirugías del día aparecerán aquí.</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                        {filteredSurgeries.map(surgery => (
                            <div
                                key={surgery.id}
                                className={`bg-white rounded-xl border-2 p-5 shadow-sm hover:shadow-md transition-all ${getStatusStyle(surgery.status).includes('animate-pulse') ? 'ring-2 ring-indigo-400' : ''}`}
                            >
                                {/* Header */}
                                <div className="flex justify-between items-start mb-4">
                                    <div>
                                        <div className="flex flex-col gap-1">
                                            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">{surgery.orName}</p>
                                            <span className="text-[25px] bg-indigo-600 text-white px-3 py-1 rounded-lg font-black border-2 border-indigo-700 shadow-sm w-fit inline-block leading-none mt-1">
                                                {surgery.id.slice(-8).toUpperCase()}
                                            </span>
                                        </div>
                                        <h3 className="text-lg font-black text-slate-900 mt-1">{surgery.patientName}</h3>
                                    </div>
                                    <span className={`text-xs font-bold px-3 py-1 rounded-full border ${getStatusStyle(surgery.status)}`}>
                                        {getStatusLabel(surgery.status)}
                                    </span>
                                </div>

                                {surgery.suspensionRequested && (
                                    <div className="bg-amber-100 text-amber-700 text-[10px] font-black px-3 py-1.5 rounded-lg border-2 border-amber-200 uppercase tracking-wider animate-bounce flex items-center justify-center gap-2 mb-4 shadow-sm">
                                        <span className="material-symbols-outlined text-base">report_problem</span>
                                        Suspensión Solicitada por Internación
                                    </div>
                                )}

                                {surgery.rescheduleRequested && (
                                    <div className="bg-indigo-100 text-indigo-700 text-[10px] font-black px-3 py-1.5 rounded-lg border-2 border-indigo-200 uppercase tracking-wider animate-bounce flex items-center justify-center gap-2 mb-4 shadow-sm">
                                        <span className="material-symbols-outlined text-base">event_repeat</span>
                                        Reprogramación Solicitada por Internación
                                    </div>
                                )}

                                {/* Details */}
                                <div className="space-y-2 text-sm mb-4">
                                    <div className="flex items-center gap-2 text-slate-600">
                                        <span className="material-symbols-outlined text-base text-slate-400">schedule</span>
                                        <span className="font-medium">{surgery.startTime}</span>
                                        <span className="text-slate-400">({surgery.estimatedDuration} min)</span>
                                        <span className="text-slate-300 mx-1">→</span>
                                        <span className="font-bold text-slate-700">
                                            {(() => {
                                                const [h, m] = surgery.startTime.split(':').map(Number);
                                                const date = new Date();
                                                date.setHours(h, m + Number(surgery.estimatedDuration));
                                                return date.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false });
                                            })()}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-2 text-slate-600">
                                        <span className="material-symbols-outlined text-base text-slate-400">medical_services</span>
                                        <span className="font-medium truncate">{surgery.procedure}</span>
                                    </div>
                                    <div className="flex items-center gap-2 text-slate-600">
                                        <span className="material-symbols-outlined text-base text-slate-400">person</span>
                                        <span className="font-medium">Dr. {surgery.doctorName}</span>
                                    </div>
                                </div>

                                {/* Actions */}
                                {canEdit && (
                                    <div className="flex flex-wrap gap-2 pt-3 border-t border-slate-100">
                                        {surgery.status === 'scheduled' && (
                                            <button
                                                onClick={() => handleStatusChange(surgery.id, 'in_or')}
                                                className="flex-1 text-xs font-bold py-2 px-3 rounded-lg bg-purple-50 text-purple-700 hover:bg-purple-100 transition-colors flex items-center justify-center gap-1"
                                            >
                                                <span className="material-symbols-outlined text-sm">login</span>
                                                Ingreso
                                            </button>
                                        )}
                                        {surgery.status === 'in_or' && (
                                            <button
                                                onClick={() => handleStatusChange(surgery.id, 'in_progress')}
                                                className="flex-1 text-xs font-bold py-2 px-3 rounded-lg bg-indigo-50 text-indigo-700 hover:bg-indigo-100 transition-colors flex items-center justify-center gap-1"
                                            >
                                                <span className="material-symbols-outlined text-sm">play_arrow</span>
                                                Iniciar
                                            </button>
                                        )}
                                        {(surgery.status === 'in_or' || surgery.status === 'in_progress') && (
                                            <button
                                                onClick={() => handleStatusChange(surgery.id, 'delayed')}
                                                className="flex-1 text-xs font-bold py-2 px-3 rounded-lg bg-amber-50 text-amber-700 hover:bg-amber-100 transition-colors flex items-center justify-center gap-1"
                                            >
                                                <span className="material-symbols-outlined text-sm">hourglass_top</span>
                                                Demorar
                                            </button>
                                        )}
                                        {(surgery.status === 'in_progress' || surgery.status === 'delayed') && (
                                            <button
                                                onClick={() => handleStatusChange(surgery.id, 'completed')}
                                                className="flex-1 text-xs font-bold py-2 px-3 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors flex items-center justify-center gap-1"
                                            >
                                                <span className="material-symbols-outlined text-sm">check_circle</span>
                                                Finalizar
                                            </button>
                                        )}
                                    </div>
                                )}

                                {/* View Detail */}
                                <button
                                    onClick={() => navigate(`/detail/${surgery.id}`)}
                                    className="w-full mt-3 text-xs font-bold py-2 rounded-lg border border-slate-200 text-slate-500 hover:border-primary hover:text-primary transition-colors flex items-center justify-center gap-1"
                                >
                                    <span className="material-symbols-outlined text-sm">visibility</span>
                                    Ver Detalle
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Delay Modal */}
            {delayModal.isOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
                        <div className="p-6 border-b border-slate-100 bg-amber-50">
                            <h3 className="text-xl font-black text-slate-900 flex items-center gap-2">
                                <span className="material-symbols-outlined text-amber-600">hourglass_top</span>
                                Registrar Demora
                            </h3>
                            <p className="text-xs text-slate-500 mt-1">
                                Las cirugías posteriores serán reprogramadas automáticamente.
                            </p>
                        </div>
                        <div className="p-6">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-black text-slate-500 uppercase mb-2">
                                        Tiempo de Demora
                                    </label>
                                    <div className="flex items-center gap-3">
                                        <input
                                            type="number"
                                            min="0"
                                            step="5"
                                            value={delayModal.delayMinutes}
                                            onChange={(e) => setDelayModal({ ...delayModal, delayMinutes: parseInt(e.target.value) || 0 })}
                                            className="w-full text-center rounded-lg border-slate-300 text-3xl font-black text-amber-600 p-3 focus:ring-2 focus:ring-amber-400 outline-none bg-amber-50/50"
                                        />
                                    </div>
                                    <span className="text-xs text-center block mt-1 text-slate-400 font-bold uppercase">Minutos</span>
                                </div>
                                <div>
                                    <label className="block text-xs font-black text-slate-500 uppercase mb-2">
                                        Tiempo Limpieza
                                    </label>
                                    <div className="flex items-center gap-3">
                                        <input
                                            type="number"
                                            min="0"
                                            step="5"
                                            value={delayModal.cleaningMinutes}
                                            onChange={(e) => setDelayModal({ ...delayModal, cleaningMinutes: parseInt(e.target.value) || 0 })}
                                            className="w-full text-center rounded-lg border-slate-300 text-3xl font-black text-blue-600 p-3 focus:ring-2 focus:ring-blue-400 outline-none bg-blue-50/50"
                                        />
                                    </div>
                                    <span className="text-xs text-center block mt-1 text-slate-400 font-bold uppercase">Minutos</span>
                                </div>
                            </div>

                            <div className="mt-6 p-4 bg-slate-100 rounded-xl border border-slate-200">
                                <div className="flex justify-between items-center mb-2">
                                    <span className="text-slate-500 font-bold">Desplazamiento Total:</span>
                                    <span className="text-2xl font-black text-slate-800">
                                        {(delayModal.delayMinutes || 0) + (delayModal.cleaningMinutes || 0)} min
                                    </span>
                                </div>
                                <p className="text-xs text-slate-500">
                                    Se reprogramarán automáticamente las cirugías posteriores y se notificará a los médicos si cambia el horario.
                                </p>
                            </div>
                        </div>
                        <div className="p-6 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
                            <button
                                onClick={() => setDelayModal({ isOpen: false, surgeryId: null, delayMinutes: 30, cleaningMinutes: 15 })}
                                className="px-5 py-2 font-bold text-slate-500 hover:bg-slate-200 rounded-xl transition-all"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleDelayConfirm}
                                className="px-6 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-xl font-black text-sm shadow-lg shadow-amber-200 transition-all"
                            >
                                Confirmar Demora
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default SurgeryMonitor;
