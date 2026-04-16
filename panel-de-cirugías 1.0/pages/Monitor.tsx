import React, { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../src/lib/supabase';
import ProgressBar from '../components/ProgressBar';
import { OperatingRoom, SurgeryStatus } from '../types';
import { useAuth } from '../src/lib/AuthContext';
import SurgeryForm from '../components/SurgeryForm';

export interface MonitorCase {
    id: string;
    patient: string;
    procedure: string;
    doctor: string;
    anesthetist?: string;
    anesthesiologistId?: string;
    status: 'previous' | 'current' | 'next';
    startTime?: string; // HH:mm
    endTime?: string; // HH:mm
    estimatedDuration: number; // minutes
    elapsedMinutes?: number; // minutes
    verticalScrollOffset?: number;
    plannedStartTime?: string;
    plannedEndTime?: string;
    actualStartTime?: string;
    actualEndTime?: string;
    date?: string; // YYYY-MM-DD
    hasPendingReschedule?: boolean;
    patientAvailableFrom?: string | null;
    diagnosis?: string;
    side?: string;
    surgerySide?: string;
}

interface RoomMonitorData {
    room: OperatingRoom;
    completed: MonitorCase[];
    current: MonitorCase | null;
    next: MonitorCase[];
}

const Monitor: React.FC = () => {
    const navigate = useNavigate();
    const { user } = useAuth();
    const [currentTime, setCurrentTime] = useState(new Date());
    const [roomsData, setRoomsData] = useState<RoomMonitorData[]>([]);
    const [loading, setLoading] = useState(true);
    const [isFullscreen, setIsFullscreen] = useState(!!document.fullscreenElement);
    const [selectedSurgeryForForm, setSelectedSurgeryForForm] = useState<MonitorCase | null>(null);
    const [showFormModal, setShowFormModal] = useState(false);
    const [activeRoomIdx, setActiveRoomIdx] = useState(0);

    // Idle detection
    const lastInteraction = useRef(Date.now());

    useEffect(() => {
        const handleFullscreenChange = () => setIsFullscreen(!!document.fullscreenElement);
        document.addEventListener('fullscreenchange', handleFullscreenChange);

        // Interaction listeners
        const updateInteraction = () => { lastInteraction.current = Date.now(); };
        window.addEventListener('mousemove', updateInteraction);
        window.addEventListener('click', updateInteraction);
        window.addEventListener('keydown', updateInteraction);
        window.addEventListener('touchstart', updateInteraction);

        return () => {
            document.removeEventListener('fullscreenchange', handleFullscreenChange);
            window.removeEventListener('mousemove', updateInteraction);
            window.removeEventListener('click', updateInteraction);
            window.removeEventListener('keydown', updateInteraction);
            window.removeEventListener('touchstart', updateInteraction);
        };
    }, []);

    const isTecnico = user?.role === 'Tecnico' || user?.role === 'SuperAdmin' || user?.role === 'Quirofano';

    // Real-time clock and data refresh
    useEffect(() => {
        document.documentElement.classList.add('dark');

        const clockTimer = setInterval(() => {
            setCurrentTime(new Date());
        }, 1000);

        // Fetch data immediately
        fetchMonitorData();

        // Refresh every 30 seconds IF user is idle (no interaction in last 30s)
        const refreshTimer = setInterval(() => {
            const timeSinceInteraction = Date.now() - lastInteraction.current;
            if (timeSinceInteraction >= 30000) {
                fetchMonitorData();
            }
        }, 30000);

        // Real-time subscription
        const channel = supabase
            .channel('public-monitor-changes')
            .on(
                'postgres_changes',
                { event: '*', schema: 'quirofano', table: 'surgeries' },
                (payload) => {
                    // console.log('Real-time update received:', payload);
                    fetchMonitorData();
                }
            )
            .subscribe();

        return () => {
            document.documentElement.classList.remove('dark');
            clearInterval(clockTimer);
            clearInterval(refreshTimer);
            supabase.removeChannel(channel);
        };
    }, []);

    const fetchMonitorData = async () => {
        try {
            // Fetch today's surgeries (Local Time)
            const now = new Date();
            const year = now.getFullYear();
            const month = (now.getMonth() + 1).toString().padStart(2, '0');
            const day = now.getDate().toString().padStart(2, '0');
            const todayStr = `${year}-${month}-${day}`;

            // 1. Fetch active ORs
            const { data: rooms, error: roomsError } = await supabase
                .from('operating_rooms')
                .select('*')
                .eq('active', true)
                .eq('active', true);

            // Manual sort to avoid 400 error
            if (rooms) {
                (rooms as any[]).sort((a, b) => a.name.localeCompare(b.name));
            }

            if (roomsError) throw roomsError;

            // 2. Fetch today's surgeries
            const { data: surgeries, error: sxError } = await supabase
                .from('surgeries')
                .select(`
                    *,
                    patients (full_name),
                    doctors!doctor_id (full_name),
                    anesthesiologists:doctors!anesthesiologist_id (id, full_name),
                    diagnosis,
                    side,
                    surgery_side
                `)
                .eq('surgery_date', todayStr)
                .order('start_time');

            if (sxError) throw sxError;

            // 3. Fetch active reschedule alerts
            const { data: alerts } = await supabase
                .from('system_alerts')
                .select('surgery_id')
                .eq('type', 'Solicitud Reprogramación')
                .eq('status', 'Active');

            const surgeriesWithAlerts = (surgeries || []).map(s => ({
                ...s,
                has_pending_reschedule: alerts?.some(a => a.surgery_id === s.id) || false
            }));

            // --- Robust Join Support (Array vs Object) ---
            const sanitizedSurgeries = surgeriesWithAlerts.map(s => {
                const getFullName = (obj: any) => {
                    if (!obj) return 'N/A';
                    if (Array.isArray(obj)) return obj[0]?.full_name || 'N/A';
                    return obj.full_name || 'N/A';
                };

                return {
                    ...s,
                    patient_name: getFullName(s.patients),
                    doctor_name: getFullName(s.doctors),
                    anesthesiologist_name: getFullName(s.anesthesiologists),
                    extracted_anesthesiologist_id: (Array.isArray(s.anesthesiologists) ? s.anesthesiologists[0]?.id : s.anesthesiologists?.id) || s.anesthesiologist_id
                };
            });

            // --- AUTO-TRANSITION LOGIC REMOVED (Manual Control Only) ---
            // The system now relies 100% on manual status updates via buttons.
            // Logic for auto-start and auto-finish has been removed to prevent unwanted state changes.
            const currentHours = now.getHours();
            const currentMinutes = now.getMinutes();
            const currentTotalMinutes = currentHours * 60 + currentMinutes;


            // 3. Process data for each room
            const processedRooms: RoomMonitorData[] = (rooms || []).map(room => {
                const roomSurgeries = sanitizedSurgeries.filter(s => s.operating_room_id === room.id);

                const currentSx = roomSurgeries.find(s => s.status === 'in_progress' || s.status === 'in_or' || s.status === 'delayed');
                // Filter completed: last 5 hours
                const completedList = roomSurgeries.filter(s => {
                    if (s.status !== 'completed') return false;
                    return true;
                });

                let nextList: any[] = [];
                if (currentSx) {
                    const currentIndex = roomSurgeries.indexOf(currentSx);
                    nextList = roomSurgeries.slice(currentIndex + 1).filter(s => ['scheduled', 'pending_validation', 'waiting_date'].includes(s.status));
                } else {
                    nextList = roomSurgeries.filter(s => ['scheduled', 'pending_validation', 'waiting_date'].includes(s.status) && s.status !== 'completed');
                }

                const mapToMonitor = (s: any, status: 'previous' | 'current' | 'next'): MonitorCase => {
                    let elapsed = 0;
                    const startTimeToUse = s.actual_start_time || s.start_time;

                    if (status === 'current' && startTimeToUse) {
                        const [h, m] = startTimeToUse.split(':').map(Number);
                        const start = new Date();
                        start.setHours(h, m, 0, 0);
                        elapsed = Math.floor((new Date().getTime() - start.getTime()) / 60000);
                    }

                    return {
                        id: s.id,
                        patient: s.patient_name || 'N/A',
                        procedure: s.procedure_name || 'N/A',
                        doctor: s.doctor_name || 'N/A',
                        status: status === 'current' ? 'current' : status === 'next' ? 'next' : 'previous',
                        startTime: s.actual_start_time || s.start_time || '--:--',
                        endTime: s.actual_end_time || s.end_time || s.planned_end_time || '--:--',
                        estimatedDuration: s.estimated_duration || 60,
                        elapsedMinutes: elapsed > 0 ? elapsed : 0,
                        plannedStartTime: s.planned_start_time,
                        plannedEndTime: s.planned_end_time,
                        actualStartTime: s.actual_start_time,
                        actualEndTime: s.actual_end_time,
                        date: s.surgery_date,
                        hasPendingReschedule: s.has_pending_reschedule,
                        patientAvailableFrom: s.patient_available_from,
                        anesthesiologistId: s.extracted_anesthesiologist_id,
                        anesthetist: s.anesthesiologist_name,
                        diagnosis: s.diagnosis,
                        side: s.side,
                        surgerySide: s.surgery_side
                    };
                };

                return {
                    room,
                    completed: completedList.map(s => mapToMonitor(s, 'previous')),
                    current: currentSx ? mapToMonitor(currentSx, 'current') : null,
                    next: nextList.map(s => mapToMonitor(s, 'next'))
                };
            });

            setRoomsData(processedRooms);
        } catch (err) {
            console.error('Error fetching monitor data:', err);
        } finally {
            setLoading(false);
        }
    };

    const formatTime = (date: Date) => {
        return date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
    };

    const formatDate = (date: Date) => {
        return date.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
    };

    // --- Audit Logging Helper ---
    const logAction = async (action: string, surgeryId: string, details: string) => {
        if (!user) return;
        try {
            await supabase.from('audit_logs').insert({
                user_id: user.id,
                user_name: user.name || user.email,
                user_role: user.role,
                action: action,
                resource: 'Cirugía',
                resource_id: surgeryId,
                description: details,
                diff: { source: 'Monitor' } // Metadata to track origin
            });
        } catch (err) {
            console.error('Error logging action:', err);
            // Non-blocking error
        }
    };

    const handleStartSurgery = async (id: string, roomId?: string, patientAvailableFrom?: string | null) => {
        if (!isTecnico) return;

        try {
            setLoading(true);

            // 0. Patient Availability Check
            const now = new Date();
            const todayStr = now.toISOString().split('T')[0];

            if (patientAvailableFrom && todayStr < patientAvailableFrom) {
                if (!confirm(`⚠️ ALERTA: El paciente tiene disponibilidad a partir del ${patientAvailableFrom}. Hoy es ${todayStr}. ¿Desea iniciar la cirugía de todas formas?`)) {
                    setLoading(false);
                    return;
                }
            }

            // 1. Validation: Check if there is already a surgery in progress in this room
            if (roomId) {
                const now = new Date();
                const todayStr = now.toISOString().split('T')[0];

                const { data: existing, error: checkError } = await supabase
                    .from('surgeries')
                    .select('id')
                    .eq('operating_room_id', roomId)
                    .eq('surgery_date', todayStr)
                    .or('status.eq.in_progress,status.eq.in_or')
                    .maybeSingle();

                if (checkError) throw checkError;

                if (existing) {
                    alert('No se puede iniciar la cirugía: ya existe otra cirugía en curso en este quirófano. Finalice la cirugía actual primero.');
                    return;
                }
            }

            const timeStr = now.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });

            const { error } = await supabase
                .from('surgeries')
                .update({
                    status: 'in_progress',
                    actual_start_time: timeStr
                })
                .eq('id', id);

            if (error) throw error;

            // Log Audit
            await logAction('UPDATE', id, `Cirugía iniciada manualmente en Monitor a las ${timeStr}`);

            fetchMonitorData();
        } catch (err) {
            console.error('Error starting surgery:', err);
            alert('Error al iniciar la cirugía');
        } finally {
            setLoading(false);
        }
    };

    const handleFinishSurgery = async (id: string) => {
        if (!isTecnico) return;
        const now = new Date();
        const timeStr = now.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });

        try {
            // 1. Update Surgery Status
            const { error } = await supabase
                .from('surgeries')
                .update({
                    status: 'completed',
                    actual_end_time: timeStr
                })
                .eq('id', id);

            if (error) throw error;

            // 2. Propagate to Surgery Form (if exists)
            // We use HH:mm for the form
            const formTimeStr = timeStr.substring(0, 5);
            try {
                await supabase
                    .from('surgery_forms')
                    .update({ 
                        cirugia_fin: formTimeStr,
                        updated_at: new Date().toISOString()
                    })
                    .eq('surgery_id', id);
            } catch (formErr) {
                console.warn('Could not sync surgery_forms finishing time:', formErr);
                // Non-blocking
            }

            // Log Audit
            await logAction('UPDATE', id, `Cirugía finalizada manualmente en Monitor a las ${timeStr}. Sincronizado con Ficha Técnica.`);

            fetchMonitorData();
        } catch (err) {
            console.error('Error finishing surgery:', err);
            alert('Error al finalizar la cirugía');
        }
    };

    const handleStartDelay = async (surgery: MonitorCase, room: OperatingRoom) => {
        if (!isTecnico) return;
        const minutes = prompt('Ingrese los minutos de demora de INICIO:');
        if (!minutes || isNaN(parseInt(minutes))) return;
        const delay = parseInt(minutes);

        try {
            setLoading(true);
            const now = new Date();
            const todayStr = now.toISOString().split('T')[0];

            // 1. Fetch ALL subsequent surgeries in the same OR for today
            const { data: subsequent, error: fetchError } = await supabase
                .from('surgeries')
                .select('id, start_time')
                .eq('operating_room_id', room.id)
                .eq('surgery_date', todayStr)
                .gte('start_time', surgery.startTime)
                .order('start_time');

            if (fetchError) throw fetchError;

            // 2. Shift all (including current)
            const updates = (subsequent || []).map(s => {
                const [h, m] = s.start_time.split(':').map(Number);
                const date = new Date();
                date.setHours(h, m + delay, 0, 0);
                const newTime = date.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });

                return supabase
                    .from('surgeries')
                    .update({ start_time: newTime })
                    .eq('id', s.id);
            });

            await Promise.all(updates);

            // Log Audit (Generic for the batch, or per surgery? Keeping it simple for now)
            await logAction('UPDATE_BATCH', surgery.id, `Inicio demorado ${delay} min. Se ajustaron ${updates.length} cirugías.`);

            fetchMonitorData();
            alert(`Sincronización completa: ${updates.length} inicios desplazados ${delay} min.`);
        } catch (err) {
            console.error('Error delaying starts:', err);
            alert('Error al aplicar la demora de inicio');
        } finally {
            setLoading(false);
        }
    };

    const handleExtendSurgery = async (surgery: MonitorCase, room: OperatingRoom) => {
        if (!isTecnico) return;
        const minutes = prompt('Ingrese cuántos minutos desea EXTENDER la cirugía actual:');
        if (!minutes || isNaN(parseInt(minutes))) return;
        const extension = parseInt(minutes);

        try {
            setLoading(true);
            const now = new Date();
            const todayStr = now.toISOString().split('T')[0];

            // 1. Update current surgery duration
            const { error: updateError } = await supabase
                .from('surgeries')
                .update({
                    estimated_duration: (surgery.estimatedDuration || 0) + extension,
                    status: 'delayed' // Halt auto-finish if needed
                })
                .eq('id', surgery.id);

            if (updateError) throw updateError;

            // 2. Shift ALL subsequent surgeries for today
            const { data: subsequent, error: fetchError } = await supabase
                .from('surgeries')
                .select('id, start_time')
                .eq('operating_room_id', room.id)
                .eq('surgery_date', todayStr)
                .gt('start_time', surgery.startTime) // Only those that start AFTER this one
                .order('start_time');

            if (fetchError) throw fetchError;

            const updates = (subsequent || []).map(s => {
                const [h, m] = s.start_time.split(':').map(Number);
                const date = new Date();
                date.setHours(h, m + extension, 0, 0);
                const newTime = date.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });

                return supabase
                    .from('surgeries')
                    .update({ start_time: newTime })
                    .eq('id', s.id);
            });

            await Promise.all(updates);

            // Log Audit
            await logAction('UPDATE', surgery.id, `Cirugía extendida ${extension} min. Se ajustaron ${updates.length} cirugías siguientes.`);

            fetchMonitorData();
            alert(`Extensión aplicada. Se desplazaron ${updates.length} cirugías siguientes.`);
        } catch (err) {
            console.error('Error extending surgery:', err);
            alert('Error al extender la cirugía');
        } finally {
            setLoading(false);
        }
    };

    const handleResetSurgery = async (id: string) => {
        if (!isTecnico) return;
        if (!window.confirm('⚠ ¿ESTÁS SEGURO? \n\nEsta acción REINICIARÁ el contador de tiempo de la cirugía al momento actual.\nLa cirugía permanecerá "En Curso" pero su hora de inicio será AHORA.\n\n¿Confirmar reinicio de tiempo?')) return;

        const now = new Date();
        const timeStr = now.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });

        try {
            setLoading(true);
            const { error } = await supabase
                .from('surgeries')
                .update({
                    // status: 'in_progress', // Status remains in_progress
                    actual_start_time: timeStr,
                    actual_end_time: null // Ensure no end time exists
                })
                .eq('id', id);

            if (error) throw error;

            // Log Audit
            await logAction('UPDATE', id, `Reinicio de contador (Reset) ejecutado. Nuevo inicio: ${timeStr}`);

            fetchMonitorData();
        } catch (err) {
            console.error('Error resetting surgery time:', err);
            alert('Error al reiniciar el tiempo de la cirugía');
        } finally {
            setLoading(false);
        }
    };

    const handleResumeSurgery = async (id: string) => {
        if (!isTecnico) return;
        if (!window.confirm('⚠ ¿ESTÁS SEGURO? \n\nEsta acción REANUDARÁ la cirugía a estado "En Curso".\nSe borrará la hora de finalización.\n\n¿Confirmar reanudación?')) return;

        try {
            setLoading(true);
            const { error } = await supabase
                .from('surgeries')
                .update({
                    status: 'in_progress',
                    actual_end_time: null
                })
                .eq('id', id);

            if (error) throw error;

            // Log Audit
            await logAction('UPDATE', id, `Cirugía reanudada (Resume) desde estado Finalizada.`);

            fetchMonitorData();
        } catch (err) {
            console.error('Error resuming surgery:', err);
            alert('Error al reanudar la cirugía');
        } finally {
            setLoading(false);
        }
    };

    // View Mode State (Persistence)
    const [viewMode, setViewMode] = useState<'normal' | 'compact'>(() => {
        return (localStorage.getItem('monitorViewMode') as 'normal' | 'compact') || 'normal';
    });

    const toggleViewMode = () => {
        const newMode = viewMode === 'normal' ? 'compact' : 'normal';
        setViewMode(newMode);
        localStorage.setItem('monitorViewMode', newMode);
    };

    // Component to render a single case card
    const CaseCard: React.FC<{ data: MonitorCase; room?: OperatingRoom }> = ({ data, room }) => {
        const isCompact = viewMode === 'compact';

        if (data.status === 'previous') {
            return (
                <div className={`bg-[#1F262E]/50 rounded-lg border-l-4 border-slate-500 opacity-60 grayscale group hover:opacity-100 hover:grayscale-0 transition-all ${isCompact ? 'p-2 mb-2' : 'p-4 mb-4'}`}>
                    <div className={`flex justify-between items-center ${isCompact ? 'mb-0.5' : 'mb-1'}`}>
                        <span className={`font-bold text-slate-400 uppercase group-hover:text-slate-200 ${isCompact ? 'text-[10px]' : 'text-xs'}`}>Finalizada</span>
                        <div className="flex items-center gap-2">
                            <span className={`font-mono text-slate-400 ${isCompact ? 'text-[10px]' : 'text-xs'}`}>{data.startTime} - {data.endTime}</span>
                            <div className="flex items-center gap-1.5 ml-2">
                                {isTecnico && (
                                    <button
                                        onClick={() => handleResumeSurgery(data.id)}
                                        className="hidden group-hover:flex px-2 py-0.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-[10px] font-black uppercase items-center gap-1 shadow-md transition-all"
                                        title="Reanudar Cirugía (Volver a En Curso)"
                                    >
                                        <span className="material-symbols-outlined text-[10px]">replay</span> {isCompact ? '' : 'Reanudar'}
                                    </button>
                                )}
                                {(user?.canFillForms || user?.role === 'SuperAdmin') && data.date && data.date >= '2026-02-16' && (
                                    <button
                                        onClick={() => {
                                            setSelectedSurgeryForForm(data);
                                            setShowFormModal(true);
                                        }}
                                        className="px-2 py-0.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded text-[10px] font-black uppercase flex items-center gap-1 shadow-md transition-all"
                                        title="Ver Ficha de Cirugía"
                                    >
                                        <span className="material-symbols-outlined text-[12px]">description</span> {isCompact ? '' : 'Ficha'}
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                    <h4 className={`font-bold text-slate-300 truncate flex items-center gap-2 ${isCompact ? 'text-sm' : 'text-lg'}`}>
                        {data.patient}
                        <span className="text-[10px] bg-white/5 text-slate-500 px-1.5 py-0.5 rounded border border-white/5 font-mono">
                            {data.id.slice(-8).toUpperCase()}
                        </span>
                    </h4>
                    <p className={`text-slate-500 truncate ${isCompact ? 'text-xs' : 'text-sm'}`}>{data.procedure}</p>
                </div>
            );
        }

        if (data.status === 'next') {
            return (
                <div className={`bg-[#1F262E] rounded-lg border-l-4 border-blue-500/30 border border-white/5 relative overflow-hidden group ${isCompact ? 'p-2 mt-2' : 'p-4 mt-4'}`}>
                    <div className={`flex justify-between items-center ${isCompact ? 'mb-0.5' : 'mb-1'}`}>
                        <div className="flex items-center gap-2">
                            <span className={`font-bold text-blue-400 uppercase tracking-wider ${isCompact ? 'text-[10px]' : 'text-xs'}`}>Siguiente</span>
                            {data.hasPendingReschedule && (
                                <span className={`bg-amber-500 text-white font-bold uppercase tracking-wider rounded flex items-center gap-1 ${isCompact ? 'px-1 py-0.5 text-[8px]' : 'px-2 py-0.5 text-[10px]'}`}>
                                    <span className="material-symbols-outlined text-[10px]">event_repeat</span> {isCompact ? 'Reprogr.' : 'Reprogramación Solicitada'}
                                </span>
                            )}
                        </div>
                        <div className="flex items-center gap-2">
                            <span className={`font-mono text-slate-400 ${isCompact ? 'text-[10px]' : 'text-xs'}`}>Est. {data.startTime}</span>
                            {isTecnico && (
                                <button
                                    onClick={() => handleStartSurgery(data.id, room?.id, data.patientAvailableFrom)}
                                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-black uppercase transition-all shadow-lg active:scale-95 flex items-center gap-2"
                                >
                                    <span className="material-symbols-outlined text-[20px]">play_arrow</span>
                                    Iniciar
                                </button>
                            )}
                        </div>
                    </div>
                    <h4 className={`font-bold text-white truncate flex items-center gap-2 ${isCompact ? 'text-base' : 'text-xl'}`}>
                        {data.patient}
                        <span className="text-[10px] bg-white/10 text-slate-400 px-1.5 py-0.5 rounded border border-white/5 font-mono">
                            {data.id.slice(-8).toUpperCase()}
                        </span>
                    </h4>
                    <p className={`text-slate-400 truncate ${isCompact ? 'text-xs' : 'text-sm'}`}>{data.procedure}</p>
                    <div className={`flex items-center justify-between text-slate-500 ${isCompact ? 'mt-1 text-[10px]' : 'mt-2 text-xs'}`}>
                        <span className="flex items-center gap-2">
                            <span className={`material-symbols-outlined ${isCompact ? 'text-xs' : 'text-sm'}`}>person</span> {data.doctor}
                        </span>
                        {isTecnico && room && (
                            <button
                                onClick={() => handleStartDelay(data, room)}
                                className="text-amber-500 hover:text-amber-400 font-bold uppercase text-[10px] flex items-center gap-1"
                            >
                                <span className={`material-symbols-outlined ${isCompact ? 'text-[10px]' : 'text-xs'}`}>schedule</span> {isCompact ? 'Demorar' : 'Demorar Inicio'}
                            </button>
                        )}
                    </div>
                </div>
            );
        }

        // CURRENT CASE (Main Focus)
        const progress = Math.min(((data.elapsedMinutes || 0) / data.estimatedDuration) * 100, 100);
        const isOvertime = (data.elapsedMinutes || 0) > data.estimatedDuration;

        return (
            <div className={`bg-card-dark rounded-xl border-l-8 border-primary shadow-[0_10px_30px_-10px_rgba(0,0,0,0.5)] ring-1 ring-white/10 overflow-hidden relative group ${isCompact ? 'p-3' : 'p-4 md:p-6'}`}>
                <div className="absolute inset-0 bg-gradient-to-r from-primary/10 to-transparent animate-pulse pointer-events-none"></div>

                <div className={`flex flex-col relative z-10 ${isCompact ? 'gap-2' : 'gap-3 md:gap-4'}`}>
                    <div className="flex justify-between items-start">
                        <div className="flex flex-col gap-2">
                            <div className="flex flex-wrap items-center gap-2">
                                <div className={`inline-flex items-center gap-2 rounded bg-primary text-white font-bold uppercase tracking-wider shadow-lg shadow-primary/20 w-fit ${isCompact ? 'px-2 py-0.5 text-[10px]' : 'px-2 py-0.5 md:px-3 md:py-1 text-[10px] md:text-sm'}`}>
                                    <span className={`animate-spin material-symbols-outlined ${isCompact ? 'text-xs' : 'text-xs md:text-sm'}`}>progress_activity</span> En Curso
                                </div>
                                {data.hasPendingReschedule && (
                                    <div className={`inline-flex items-center gap-2 rounded bg-amber-500 text-white font-bold uppercase tracking-wider shadow-lg shadow-amber-900/20 w-fit ${isCompact ? 'px-2 py-0.5 text-[8px]' : 'px-2 py-0.5 md:px-3 md:py-1 text-[10px] md:text-sm'}`}>
                                        <span className={`material-symbols-outlined ${isCompact ? 'text-[10px]' : 'text-xs md:text-sm'}`}>event_repeat</span> Reprogramación Solicitada
                                    </div>
                                )}
                            </div>
                            {isTecnico && (
                                <div className="flex flex-wrap gap-2">
                                    <button
                                        onClick={() => handleFinishSurgery(data.id)}
                                        className={`bg-red-600 hover:bg-red-700 text-white rounded font-black uppercase shadow-lg shadow-red-900/20 transition-all flex items-center gap-1 md:gap-2 ${isCompact ? 'px-2 py-0.5 text-[9px]' : 'px-2 py-0.5 md:px-3 md:py-1 text-[9px] md:text-xs'}`}
                                    >
                                        <span className={`material-symbols-outlined ${isCompact ? 'text-xs' : 'text-xs md:text-sm'}`}>check_circle</span> Finalizar
                                    </button>
                                    {room && (
                                        <button
                                            onClick={() => handleExtendSurgery(data, room)}
                                            className={`bg-amber-600 hover:bg-amber-700 text-white rounded font-black uppercase shadow-lg shadow-amber-900/20 transition-all flex items-center gap-1 md:gap-2 ${isCompact ? 'px-2 py-0.5 text-[9px]' : 'px-2 py-0.5 md:px-3 md:py-1 text-[9px] md:text-xs'}`}
                                        >
                                            <span className={`material-symbols-outlined ${isCompact ? 'text-xs' : 'text-xs md:text-sm'}`}>history</span> {isCompact ? '+T' : 'Extender'}
                                        </button>
                                    )}
                                    <button
                                        onClick={() => handleResetSurgery(data.id)}
                                        className={`bg-slate-600 hover:bg-slate-500 text-white rounded font-black uppercase shadow-lg shadow-slate-900/20 transition-all flex items-center gap-1 md:gap-2 opacity-50 hover:opacity-100 ${isCompact ? 'px-2 py-0.5 text-[9px]' : 'px-2 py-0.5 md:px-3 md:py-1 text-[9px] md:text-xs'}`}
                                        title="Reiniciar Contador"
                                    >
                                        <span className={`material-symbols-outlined ${isCompact ? 'text-xs' : 'text-xs md:text-sm'}`}>restart_alt</span> {isCompact ? 'Reset' : 'Reiniciar'}
                                    </button>
                                    {/* Ficha de Cirugía Button */}
                                    {(user?.canFillForms || user?.role === 'SuperAdmin') && (
                                        <button
                                            onClick={() => {
                                                setSelectedSurgeryForForm(data);
                                                setShowFormModal(true);
                                            }}
                                            className={`bg-indigo-600 hover:bg-indigo-700 text-white rounded font-black uppercase shadow-lg shadow-indigo-900/20 transition-all flex items-center gap-1 md:gap-2 ${isCompact ? 'px-2 py-0.5 text-[9px]' : 'px-2 py-0.5 md:px-3 md:py-1 text-[9px] md:text-xs'}`}
                                        >
                                            <span className={`material-symbols-outlined ${isCompact ? 'text-xs' : 'text-xs md:text-sm'}`}>description</span> {isCompact ? 'Ficha' : 'Ficha de Cirugía'}
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>
                        <div className="text-right">
                            <span className="block text-[10px] text-slate-400 font-bold uppercase">Inicio Real</span>
                            <span className={`font-black text-white tabular-nums tracking-tighter leading-none ${isCompact ? 'text-lg' : 'text-xl md:text-3xl'}`}>{data.startTime}</span>
                        </div>
                    </div>

                    <div>
                        <span className="text-slate-500 text-[10px] font-bold uppercase tracking-widest">Paciente Actual</span>
                        <h3 className={`font-black text-white leading-tight truncate flex items-center gap-3 ${isCompact ? 'text-xl my-0.5' : 'text-2xl md:text-4xl my-0.5 md:my-1'}`}>
                            {data.patient}
                            <span className="text-sm bg-white/10 text-primary px-2 py-1 rounded border border-primary/20 font-mono">
                                {data.id.slice(-8).toUpperCase()}
                            </span>
                        </h3>
                        <p className={`text-primary font-medium truncate ${isCompact ? 'text-sm' : 'text-sm md:text-xl'}`}>{data.procedure}</p>
                    </div>

                    <div className={`grid grid-cols-2 border-t border-white/5 border-b ${isCompact ? 'gap-2 py-2 mb-0.5' : 'gap-3 md:gap-4 py-3 md:py-4 mb-0.5 md:mb-1'}`}>
                        <div>
                            <p className={`text-slate-500 font-bold uppercase mb-1 ${isCompact ? 'text-[9px]' : 'text-[9px] md:text-[10px]'}`}>Cirujano</p>
                            <p className={`font-bold text-white flex items-center gap-1 md:gap-2 truncate ${isCompact ? 'text-xs' : 'text-xs md:text-base'}`}>
                                <span className={`material-symbols-outlined text-slate-500 ${isCompact ? 'text-xs' : 'text-xs md:text-sm'}`}>person</span> {data.doctor}
                            </p>
                        </div>
                        <div>
                            <p className={`text-slate-500 font-bold uppercase mb-1 ${isCompact ? 'text-[9px]' : 'text-[9px] md:text-[10px]'}`}>Anestesista</p>
                            <p className={`font-bold text-white flex items-center gap-1 md:gap-2 truncate ${isCompact ? 'text-xs' : 'text-xs md:text-base'}`}>
                                <span className={`material-symbols-outlined text-slate-500 ${isCompact ? 'text-xs' : 'text-xs md:text-sm'}`}>medication</span> {data.anesthetist || '--'}
                            </p>
                        </div>
                    </div>

                    <div>
                        <div className="grid grid-cols-3 items-end mb-2">
                            <div>
                                <p className="text-[10px] text-slate-400 font-bold uppercase mb-1">Duración</p>
                                <p className={`text-white font-mono ${isCompact ? 'text-sm' : 'text-sm md:text-lg'}`}>{data.estimatedDuration} min</p>
                            </div>
                            <div className="text-center">
                                <p className="text-[10px] text-slate-400 font-bold uppercase mb-1">Fin Aprox.</p>
                                <p className={`text-white font-mono ${isCompact ? 'text-sm' : 'text-sm md:text-lg'}`}>
                                    {(() => {
                                        if (!data.startTime) return '--:--';
                                        const [h, m] = data.startTime.split(':').map(Number);
                                        const date = new Date();
                                        date.setHours(h, m + data.estimatedDuration);
                                        return date.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false });
                                    })()}
                                </p>
                            </div>
                            <div className="text-right">
                                <p className="text-[10px] text-slate-400 font-bold uppercase mb-1">Transcurrido</p>
                                <p className={`font-mono font-bold ${isCompact ? 'text-lg' : 'text-base md:text-2xl'} ${isOvertime ? 'text-red-500 animate-pulse' : 'text-emerald-400'}`}>
                                    {data.elapsedMinutes} min
                                </p>
                            </div>
                        </div>
                        <div className={`w-full bg-slate-700/50 rounded-full overflow-hidden ${isCompact ? 'h-1.5' : 'h-1.5 md:h-3'}`}>
                            <div
                                className={`h-full rounded-full transition-all duration-1000 ${isOvertime ? 'bg-red-500' : 'bg-gradient-to-r from-primary to-emerald-400'}`}
                                style={{ width: `${progress}%` }}
                            ></div>
                        </div>
                    </div>
                </div>
            </div>
        );
    };

    return (
        <div className="bg-dark-bg text-white h-full md:h-screen flex flex-col overflow-hidden font-display w-full relative md:absolute md:top-0 md:left-0 md:z-50 selection:bg-primary/30">
            <ProgressBar isLoading={loading} />
            {/* Header */}
            <header className={`flex-none bg-surface-dark border-b border-[#283039] shadow-md z-20 ${viewMode === 'compact' ? 'px-4 py-2' : 'px-4 md:px-6 py-3 md:py-4'}`}>
                <div className="flex flex-col md:flex-row items-center justify-between w-full gap-3 md:gap-0">
                    <div className="flex items-center gap-3 w-full md:w-1/3 justify-between md:justify-start">
                        <div className="flex items-center gap-3">
                            <button onClick={() => navigate('/')} className="flex items-center justify-center size-10 rounded-full hover:bg-white/10 text-slate-400 hover:text-white transition-colors">
                                <span className="material-symbols-outlined text-2xl">arrow_back</span>
                            </button>
                            <div className={`hidden md:flex items-center justify-center bg-primary/20 rounded-lg text-primary border border-primary/20 shadow-[0_0_15px_rgba(13,127,242,0.3)] ${viewMode === 'compact' ? 'size-10' : 'size-12'}`}>
                                <span className={`material-symbols-outlined ${viewMode === 'compact' ? 'text-[24px]' : 'text-[32px]'}`}>monitor_heart</span>
                            </div>
                            <div>
                                <h1 className={`font-black tracking-tight text-white uppercase leading-none ${viewMode === 'compact' ? 'text-lg' : 'text-lg md:text-xl'}`}>Monitor</h1>
                                <p className="hidden md:block text-slate-400 text-xs font-bold tracking-widest mt-1">CONTROL CENTRAL</p>
                            </div>
                        </div>
                        <div className="flex md:hidden items-center gap-2 bg-[#283039] px-3 py-1.5 rounded-full border border-white/5">
                            <span className="relative flex h-2 w-2">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                            </span>
                            <span className="text-[10px] font-bold text-slate-300">EN LÍNEA</span>
                        </div>
                    </div>

                    {/* Real-time Clock */}
                    <div className="flex flex-col items-center justify-center w-full md:w-1/3 py-1 md:py-0">
                        <div className="flex items-baseline gap-2">
                            <span className={`font-black tracking-tighter text-white font-mono leading-none drop-shadow-lg ${viewMode === 'compact' ? 'text-3xl' : 'text-3xl md:text-5xl'}`}>
                                {formatTime(currentTime)}
                            </span>
                        </div>
                        <p className="text-primary font-bold text-xs uppercase tracking-[0.2em] md:tracking-[0.3em] mt-1 opacity-80">
                            {formatDate(currentTime)}
                        </p>
                    </div>

                    <div className="hidden md:flex items-center justify-end gap-3 text-right w-1/3">
                        {/* View Mode Toggle */}
                        <button
                            onClick={toggleViewMode}
                            className="flex items-center justify-center size-10 rounded-full bg-[#283039] border border-white/5 text-slate-400 hover:text-white hover:bg-white/10 transition-colors shadow-inner"
                            title={viewMode === 'normal' ? "Cambiar a Vista Compacta" : "Cambiar a Vista Normal"}
                        >
                            <span className="material-symbols-outlined">{viewMode === 'normal' ? 'compress' : 'expand'}</span>
                        </button>

                        <button
                            onClick={() => {
                                if (!document.fullscreenElement) {
                                    document.documentElement.requestFullscreen().catch((e) => {
                                        console.error(`Error attempting to enable fullscreen mode: ${e.message} (${e.name})`);
                                    });
                                } else {
                                    if (document.exitFullscreen) {
                                        document.exitFullscreen();
                                    }
                                }
                            }}
                            className="flex items-center justify-center size-10 rounded-full bg-[#283039] border border-white/5 text-slate-400 hover:text-white hover:bg-white/10 transition-colors shadow-inner"
                            title={isFullscreen ? "Salir Pantalla Completa" : "Pantalla Completa"}
                        >
                            <span className="material-symbols-outlined">{isFullscreen ? 'close_fullscreen' : 'fullscreen'}</span>
                        </button>
                        <div className="flex items-center gap-2 bg-[#283039] px-4 py-2 rounded-full border border-white/5 shadow-inner">
                            <span className="relative flex h-3 w-3">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
                            </span>
                            <span className="text-xs font-bold text-slate-300 tracking-wider">SISTEMA EN LÍNEA</span>
                        </div>
                    </div>
                </div>
            </header>

            {/* Mobile Room Selector */}
            {!loading && roomsData.length > 0 && (
                <div className="md:hidden flex-none bg-[#1F262E] border-b border-[#283039] p-2 flex gap-2 overflow-x-auto no-scrollbar">
                    {roomsData.map((data, idx) => (
                        <button
                            key={`tab-${data.room.id}`}
                            onClick={() => setActiveRoomIdx(idx)}
                            className={`flex-none px-4 py-2 rounded-lg font-black text-xs uppercase transition-all border ${activeRoomIdx === idx
                                ? 'bg-primary text-white border-primary shadow-[0_0_10px_rgba(13,127,242,0.3)]'
                                : 'bg-[#283039] text-slate-400 border-white/5'
                                }`}
                        >
                            {(idx + 1).toString().padStart(2, '0')}. {data.room.name}
                        </button>
                    ))}
                </div>
            )}

            {/* Content - Dynamic OR List */}
            <main className="flex-grow flex w-full overflow-hidden bg-dark-bg">
                {loading ? (
                    <div className="flex-grow flex flex-col items-center justify-center text-slate-500">
                        <span className="material-symbols-outlined animate-spin text-5xl mb-4">progress_activity</span>
                        <p className="text-lg font-bold uppercase tracking-widest">Iniciando Monitor...</p>
                    </div>
                ) : (
                    <div className="flex-grow flex flex-col md:flex-row overflow-y-auto md:overflow-x-auto">
                        {roomsData.filter((_, idx) => {
                            // On mobile, only show the active room
                            if (window.innerWidth < 768) {
                                return idx === activeRoomIdx;
                            }
                            return true;
                        }).map((data, idx) => {
                            // Find the original index for the OR number label
                            const originalIdx = roomsData.findIndex(r => r.room.id === data.room.id);

                            return (
                                <section
                                    key={data.room.id}
                                    className={`flex-none w-full ${roomsData.length === 1 ? 'md:w-full' : 'md:w-[50%]'} flex flex-col md:h-full relative ${originalIdx < roomsData.length - 1 ? 'border-b md:border-b-0 md:border-r border-[#283039]' : ''} ${originalIdx % 2 !== 0 ? 'bg-[#13181e]' : ''}`}
                                >
                                    <div className={`bg-surface-dark border-b border-[#283039] flex items-center justify-between sticky top-0 z-10 shadow-lg ${viewMode === 'compact' ? 'p-2 md:p-3' : 'p-3 md:p-4'}`}>
                                        <div className="flex items-center gap-3 md:gap-4">
                                            <div className={`flex items-center justify-center rounded-xl font-black md:text-2xl border ${idx % 2 === 0
                                                ? 'bg-blue-600/20 text-blue-500 border-blue-500/30 shadow-[0_0_15px_rgba(37,99,235,0.2)]'
                                                : 'bg-orange-500/20 text-orange-500 border-orange-500/30 shadow-[0_0_15px_rgba(249,115,22,0.2)]'
                                                } ${viewMode === 'compact' ? 'size-8 text-lg' : 'size-10 md:size-14 text-lg'}`}>
                                                {(originalIdx + 1).toString().padStart(2, '0')}
                                            </div>
                                            <div>
                                                <h2 className={`font-black text-white uppercase tracking-tight leading-none ${viewMode === 'compact' ? 'text-base md:text-lg' : 'text-lg md:text-xl lg:text-2xl'}`}>{data.room.name}</h2>
                                                <span className={`inline-flex mt-1 items-center rounded px-2 py-0.5 text-[10px] md:text-xs font-bold ring-1 ring-inset uppercase tracking-wide ${data.current
                                                    ? 'bg-red-500/10 text-red-400 ring-red-500/20'
                                                    : 'bg-emerald-500/10 text-emerald-400 ring-emerald-500/20'
                                                    }`}>
                                                    {data.current ? 'Ocupado' : 'Disponible'}
                                                </span>
                                            </div>
                                        </div>
                                    </div>

                                    <div className={`flex-1 overflow-y-auto relative bg-transparent scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent ${viewMode === 'compact' ? 'p-2' : 'p-4 md:p-6'}`}>
                                        <div className={viewMode === 'compact' ? 'flex flex-col gap-2' : 'flex flex-col gap-4'}>
                                            {data.completed.map(sx => (
                                                <CaseCard key={sx.id} data={sx} />
                                            ))}

                                            <div>
                                                {data.current ? (
                                                    <CaseCard data={data.current} room={data.room} />
                                                ) : (
                                                    <div className={`bg-[#1F262E]/20 border-2 border-dashed border-white/5 rounded-xl flex flex-col items-center justify-center text-slate-600 ${viewMode === 'compact' ? 'h-24' : 'h-32 md:h-48'}`}>
                                                        <span className={`material-symbols-outlined mb-2 ${viewMode === 'compact' ? 'text-2xl' : 'text-2xl md:text-4xl'}`}>sensor_door</span>
                                                        <p className="font-bold uppercase tracking-widest text-[10px] md:text-sm">Sin cirugía en curso</p>
                                                    </div>
                                                )}
                                            </div>
                                            {data.next.map(sx => (
                                                <CaseCard key={sx.id} data={sx} room={data.room} />
                                            ))}
                                        </div>
                                    </div>
                                </section>
                            );
                        })}
                        {roomsData.length === 0 && (
                            <div className="flex-grow flex flex-col items-center justify-center text-slate-500">
                                <span className="material-symbols-outlined text-6xl mb-4">door_front</span>
                                <p className="text-xl font-bold uppercase tracking-widest">No hay quirófanos activos configurados</p>
                            </div>
                        )}
                    </div>
                )}
            </main>

            {/* Surgery Form Modal */}
            {showFormModal && selectedSurgeryForForm && (
                <SurgeryForm
                    surgery={selectedSurgeryForForm}
                    onClose={() => {
                        setShowFormModal(false);
                        setSelectedSurgeryForForm(null);
                    }}
                    onSave={() => {
                        fetchMonitorData();
                    }}
                />
            )}
        </div>
    );
};

export default Monitor;