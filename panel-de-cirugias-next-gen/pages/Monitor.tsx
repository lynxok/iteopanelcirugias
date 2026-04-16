import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../src/lib/supabase';
import ProgressBar from '../components/ProgressBar';
import { OperatingRoom } from '../types';
import { useAuth } from '../src/lib/AuthContext';

interface MonitorCase {
    id: string;
    patient: string;
    procedure: string;
    doctor: string;
    anesthetist?: string;
    status: 'previous' | 'current' | 'next';
    startTime?: string; // HH:mm
    endTime?: string; // HH:mm
    estimatedDuration: number; // minutes
    elapsedMinutes?: number; // minutes
    plannedStartTime?: string;
    plannedEndTime?: string;
    actualStartTime?: string;
    actualEndTime?: string;
}

interface RoomMonitorData {
    room: OperatingRoom;
    completed: MonitorCase[];
    current: MonitorCase | null;
    next: MonitorCase | null;
}

const Monitor: React.FC = () => {
    const navigate = useNavigate();
    const { user } = useAuth();
    const [currentTime, setCurrentTime] = useState(new Date());
    const [roomsData, setRoomsData] = useState<RoomMonitorData[]>([]);
    const [loading, setLoading] = useState(true);
    const [isFullscreen, setIsFullscreen] = useState(!!document.fullscreenElement);

    useEffect(() => {
        const handleFullscreenChange = () => setIsFullscreen(!!document.fullscreenElement);
        document.addEventListener('fullscreenchange', handleFullscreenChange);
        return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
    }, []);

    const isTecnico = user?.role === 'Tecnico' || user?.role === 'SuperAdmin' || user?.role === 'Quirofano';

    // Real-time clock and data refresh
    useEffect(() => {
        document.documentElement.classList.add('dark');

        const clockTimer = setInterval(() => {
            setCurrentTime(new Date());
        }, 1000);

        // Fetch data immediately and then every minute
        fetchMonitorData();
        const refreshTimer = setInterval(fetchMonitorData, 60000);

        // Real-time subscription
        const channel = supabase
            .channel('public-monitor-changes')
            .on(
                'postgres_changes',
                { event: '*', schema: 'quirofano', table: 'surgeries' },
                (payload) => {
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
                    doctors!doctor_id (full_name)
                `)
                .eq('surgery_date', todayStr)
                .order('start_time');

            if (sxError) throw sxError;

            // --- Robust Join Support (Array vs Object) ---
            const sanitizedSurgeries = (surgeries || []).map(s => {
                const getFullName = (obj: any) => {
                    if (!obj) return 'N/A';
                    if (Array.isArray(obj)) return obj[0]?.full_name || 'N/A';
                    return obj.full_name || 'N/A';
                };

                return {
                    ...s,
                    patient_name: getFullName(s.patients),
                    doctor_name: getFullName(s.doctors)
                };
            });

            // --- AUTO-TRANSITION LOGIC (Visual Only) ---
            const currentHours = now.getHours();
            const currentMinutes = now.getMinutes();
            const currentTotalMinutes = currentHours * 60 + currentMinutes;

            sanitizedSurgeries.forEach(s => {
                if (!s.start_time) return;

                const [sxHours, sxMinutes] = s.start_time.split(':').map(Number);
                const sxStartTotalMinutes = sxHours * 60 + sxMinutes;

                // 0. Visual Promotion for Pending (v1.1.11 Logic)
                if (s.status === 'pending_validation' || s.status === 'waiting_date' || s.status === 'scheduled') {
                    if (s.ortho_validated && s.admission_validated) {
                        if (s.or_validated && s.surgery_date) {
                            s.status = 'scheduled';
                        } else {
                            s.status = 'waiting_date';
                        }
                    } else {
                        s.status = 'pending_validation';
                    }
                }

                // 1. Auto-Start (REAL DB UPDATE)
                if (s.status === 'scheduled' || s.status === 'pending_validation') {
                    if (currentTotalMinutes >= sxStartTotalMinutes) {
                        s.status = 'in_progress';

                        // Fire DB update if authorized
                        if (isTecnico) {
                            const nowStr = new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
                            supabase.from('surgeries')
                                .update({
                                    status: 'in_progress',
                                    actual_start_time: nowStr
                                })
                                .eq('id', s.id)
                                .then(({ error }) => {
                                    if (error) console.error('Error auto-starting surgery:', s.id, error);
                                });
                        }
                    }
                }

                // 2. Smart Auto-Finish (REAL DB UPDATE - "Risky Application")
                if (s.status === 'in_progress' || s.status === 'in_or' || s.status === 'delayed') {
                    if (s.estimated_duration) {
                        const timeBase = s.status === 'delayed' ? s.start_time : (s.actual_start_time || s.start_time);
                        if (timeBase) {
                            const [bH, bM] = timeBase.split(':').map(Number);
                            const baseStartTotal = bH * 60 + bM;

                            const duration = Number(s.estimated_duration);
                            const BUFFER_MINUTES = 10;
                            const sxEndTotalMinutes = baseStartTotal + duration + BUFFER_MINUTES;

                            if (currentTotalMinutes >= sxEndTotalMinutes) {
                                const realEndTotal = baseStartTotal + duration;
                                const endH = Math.floor(realEndTotal / 60);
                                const endM = realEndTotal % 60;
                                const endTimeStr = `${endH.toString().padStart(2, '0')}:${endM.toString().padStart(2, '0')}:00`;

                                s.status = 'completed';
                                s.actual_end_time = endTimeStr;
                                s.end_time = endTimeStr;

                                // TRIGGER DB UPDATE (Only if technician/admin to avoid race conditions/perms issues)
                                if (isTecnico) {
                                    // Fire and forget update to avoid blocking UI
                                    const nowStr = new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
                                    supabase.from('surgeries')
                                        .update({
                                            status: 'completed',
                                            actual_end_time: nowStr
                                        })
                                        .eq('id', s.id)
                                        .then(({ error }) => {
                                            if (error) console.error('Error auto-finishing surgery:', s.id, error);
                                        });
                                }
                            }
                        }
                    }
                }
            });
            // ------------------------

            // 3. Process data for each room
            const processedRooms: RoomMonitorData[] = (rooms || []).map(room => {
                const roomSurgeries = sanitizedSurgeries.filter(s => s.operating_room_id === room.id);

                const currentSx = roomSurgeries.find(s => s.status === 'in_progress' || s.status === 'in_or' || s.status === 'delayed');
                // Filter completed: last 5 hours
                const completedList = roomSurgeries.filter(s => {
                    if (s.status !== 'completed') return false;
                    const finishedTime = s.actual_end_time || s.end_time || s.planned_end_time;
                    if (!finishedTime) return true;

                    const [h, m] = finishedTime.split(':').map(Number);
                    const endTotalMinutes = h * 60 + m;
                    const diff = currentTotalMinutes - endTotalMinutes;
                    return diff <= 300;
                });

                let nextSx = null;
                if (currentSx) {
                    const currentIndex = roomSurgeries.indexOf(currentSx);
                    nextSx = roomSurgeries.slice(currentIndex + 1).find(s => s.status === 'scheduled' || s.status === 'pending_validation' || s.status === 'waiting_date');
                } else {
                    nextSx = roomSurgeries.find(s => s.status === 'scheduled' || s.status === 'pending_validation' || s.status === 'waiting_date');
                }

                const mapToMonitor = (s: any, status: 'previous' | 'current' | 'next'): MonitorCase => {
                    let elapsed = 0;
                    if (status === 'current' && s.start_time) {
                        const [h, m] = s.start_time.split(':').map(Number);
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
                        actualEndTime: s.actual_end_time
                    };
                };

                return {
                    room,
                    completed: completedList.map(s => mapToMonitor(s, 'previous')),
                    current: currentSx ? mapToMonitor(currentSx, 'current') : null,
                    next: nextSx ? mapToMonitor(nextSx, 'next') : null
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
        return date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    };

    const formatDate = (date: Date) => {
        return date.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
    };

    const handleStartSurgery = async (id: string, roomId?: string) => {
        if (!isTecnico) return;

        try {
            setLoading(true);

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

            const now = new Date();
            const timeStr = now.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });

            const { error } = await supabase
                .from('surgeries')
                .update({
                    status: 'in_progress',
                    actual_start_time: timeStr
                })
                .eq('id', id);

            if (error) throw error;
            fetchMonitorData();
        } catch (err) {
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
            const { error } = await supabase
                .from('surgeries')
                .update({
                    status: 'completed',
                    actual_end_time: timeStr
                })
                .eq('id', id);

            if (error) throw error;
            fetchMonitorData();
        } catch (err) {
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
            fetchMonitorData();
            alert(`Sincronización completa: ${updates.length} inicios desplazados ${delay} min.`);
        } catch (err) {
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
            fetchMonitorData();
            alert(`Extensión aplicada. Se desplazaron ${updates.length} cirugías siguientes.`);
        } catch (err) {
            alert('Error al extender la cirugía');
        } finally {
            setLoading(false);
        }
    };

    // Component to render a single case card
    const CaseCard: React.FC<{ data: MonitorCase; room?: OperatingRoom }> = ({ data, room }) => {
        if (data.status === 'previous') {
            return (
                <div className="bg-slate-800/60 rounded-xl p-4 border-l-4 border-slate-600 opacity-60 grayscale mb-4 backdrop-blur-sm">
                    <div className="flex justify-between items-center mb-1">
                        <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Finalizada</span>
                        <span className="text-xs font-mono text-slate-400 border border-slate-600 rounded px-1.5 py-0.5">{data.startTime} - {data.endTime}</span>
                    </div>
                    <h4 className="text-lg font-bold text-slate-300 truncate">{data.patient}</h4>
                    <p className="text-sm text-slate-500 truncate">{data.procedure}</p>
                </div>
            );
        }

        if (data.status === 'next') {
            return (
                <div className="bg-slate-800/80 rounded-xl p-5 border-l-4 border-blue-500/50 border-t border-r border-b border-white/5 mt-6 relative overflow-hidden group backdrop-blur-md shadow-lg">
                    <div className="absolute top-0 right-0 p-3 opacity-5">
                        <span className="material-symbols-outlined text-6xl">event_upcoming</span>
                    </div>
                    <div className="flex justify-between items-center mb-2">
                        <span className="text-xs font-black text-blue-400 uppercase tracking-widest flex items-center gap-1">
                            <span className="size-2 rounded-full bg-blue-500 animate-pulse"></span>
                            Siguiente Paciente
                        </span>
                        <div className="flex items-center gap-2 z-10">
                            <span className="text-xs font-mono text-blue-300 bg-blue-900/30 px-2 py-1 rounded">Est. {data.startTime}</span>
                            {isTecnico && (
                                <button
                                    onClick={() => handleStartSurgery(data.id, room?.id)}
                                    className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-[10px] font-black uppercase transition-all shadow-lg hover:shadow-emerald-500/20 active:scale-95 flex items-center gap-1"
                                >
                                    <span className="material-symbols-outlined text-sm">play_arrow</span> Iniciar
                                </button>
                            )}
                        </div>
                    </div>
                    <h4 className="text-xl font-bold text-white truncate my-1">{data.patient}</h4>
                    <p className="text-sm text-slate-400 truncate mb-3">{data.procedure}</p>
                    <div className="flex items-center justify-between text-xs text-slate-500 pt-3 border-t border-white/5">
                        <span className="flex items-center gap-2 font-medium">
                            <span className="material-symbols-outlined text-sm">person</span> {data.doctor}
                        </span>
                        <span className="flex items-center gap-2 font-medium">
                            <span className="material-symbols-outlined text-sm">medication</span> {data.anesthetist || 'Sin anest.'}
                        </span>
                        {isTecnico && room && (
                            <button
                                onClick={() => handleStartDelay(data, room)}
                                className="text-amber-500 hover:text-amber-400 font-bold uppercase text-[10px] flex items-center gap-1 ml-2 transition-colors z-10"
                            >
                                <span className="material-symbols-outlined text-sm">schedule</span> Demorar
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
            <div className={`relative rounded-2xl shadow-[0_20px_50px_-12px_rgba(0,0,0,0.7)] overflow-hidden border ${isOvertime ? 'border-red-500/50 shadow-red-900/20' : 'border-emerald-500/30 shadow-emerald-900/20'} bg-slate-900`}>
                <div className={`absolute inset-0 opacity-20 pointer-events-none bg-gradient-to-br ${isOvertime ? 'from-red-900/40 via-transparent to-red-900/10' : 'from-emerald-900/40 via-transparent to-blue-900/10'}`}></div>

                <div className="p-6 md:p-8 flex flex-col gap-6 relative z-10">
                    {/* Header Row */}
                    <div className="flex justify-between items-start">
                        <div className="flex flex-col gap-3">
                            <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-lg text-sm font-black uppercase tracking-wider shadow-lg ${isOvertime ? 'bg-red-500 text-white animate-pulse' : 'bg-emerald-500 text-white'}`}>
                                <span className="material-symbols-outlined text-base animate-spin">progress_activity</span>
                                {isOvertime ? 'DEMORADO' : 'EN CURSO'}
                            </div>

                            {isTecnico && (
                                <div className="flex flex-wrap gap-2 mt-1">
                                    <button onClick={() => handleFinishSurgery(data.id)} className="bg-white/10 hover:bg-white/20 text-white border border-white/20 px-3 py-1.5 rounded-lg text-xs font-bold uppercase transition-all flex items-center gap-2 backdrop-blur-sm">
                                        <span className="material-symbols-outlined text-sm text-emerald-400">check_circle</span> Finalizar
                                    </button>
                                    {room && (
                                        <button onClick={() => handleExtendSurgery(data, room)} className="bg-white/10 hover:bg-white/20 text-white border border-white/20 px-3 py-1.5 rounded-lg text-xs font-bold uppercase transition-all flex items-center gap-2 backdrop-blur-sm">
                                            <span className="material-symbols-outlined text-sm text-amber-400">history</span> Extender
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>
                        <div className="text-right">
                            <div className="flex flex-col items-end">
                                <span className="text-[10px] text-slate-400 font-black uppercase tracking-widest mb-0.5">Inicio Real</span>
                                <span className="text-3xl md:text-5xl font-black text-white tabular-nums tracking-tighter leading-none font-mono drop-shadow-lg">{data.startTime}</span>
                            </div>
                        </div>
                    </div>

                    {/* Patient Info */}
                    <div className="border-l-4 border-white/10 pl-4 py-1">
                        <span className="text-slate-500 text-[10px] font-bold uppercase tracking-[0.2em] mb-1 block">Paciente en Quirófano</span>
                        <h3 className="text-3xl md:text-5xl font-black text-white leading-tight mb-2 truncate drop-shadow-md">{data.patient}</h3>
                        <p className="text-lg md:text-2xl text-blue-400 font-bold truncate">{data.procedure}</p>
                    </div>

                    {/* Team Info */}
                    <div className="grid grid-cols-2 gap-4 bg-white/5 rounded-xl p-4 border border-white/5 backdrop-blur-sm">
                        <div className="flex items-center gap-3">
                            <div className="size-10 rounded-full bg-slate-800 flex items-center justify-center border border-white/10">
                                <span className="material-symbols-outlined text-slate-400">person</span>
                            </div>
                            <div>
                                <p className="text-[9px] text-slate-500 font-black uppercase tracking-wider">Cirujano</p>
                                <p className="text-sm font-bold text-white truncate">{data.doctor}</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-3 border-l border-white/5 pl-4">
                            <div className="size-10 rounded-full bg-slate-800 flex items-center justify-center border border-white/10">
                                <span className="material-symbols-outlined text-slate-400">medication</span>
                            </div>
                            <div>
                                <p className="text-[9px] text-slate-500 font-black uppercase tracking-wider">Anestesista</p>
                                <p className="text-sm font-bold text-white truncate">{data.anesthetist || 'No asignado'}</p>
                            </div>
                        </div>
                    </div>

                    {/* Progress & Stats */}
                    <div>
                        <div className="grid grid-cols-3 items-end mb-3 px-1">
                            <div>
                                <p className="text-[10px] text-slate-400 font-bold uppercase mb-1">Estimado</p>
                                <p className="text-white font-mono text-lg font-bold">{data.estimatedDuration} min</p>
                            </div>
                            <div className="text-center">
                                <p className="text-[10px] text-slate-400 font-bold uppercase mb-1">Finalización Aprox.</p>
                                <p className="text-white font-mono text-lg font-bold bg-white/10 px-2 rounded inline-block">
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
                                <p className={`font-mono text-3xl font-black leading-none ${isOvertime ? 'text-red-500' : 'text-emerald-400'}`}>
                                    {data.elapsedMinutes} min
                                </p>
                            </div>
                        </div>

                        {/* Progress Bar Container */}
                        <div className="w-full bg-slate-800 rounded-full h-3 md:h-4 overflow-hidden border border-white/5 shadow-inner relative">
                            {/* Marker for "Overtime" */}
                            <div className="absolute left-[100%] top-0 bottom-0 w-0.5 bg-red-500/50 z-20"></div>

                            <div
                                className={`h-full rounded-full transition-all duration-1000 relative overflow-hidden ${isOvertime ? 'bg-gradient-to-r from-orange-500 to-red-600' : 'bg-gradient-to-r from-blue-500 to-emerald-500'}`}
                                style={{ width: `${Math.min(progress, 100)}%` }}
                            >
                                <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/diagonal-stripes.png')] opacity-20 animate-[pulse_2s_infinite]"></div>
                            </div>
                        </div>
                        {isOvertime && (
                            <p className="text-[10px] text-red-400 font-bold uppercase text-right mt-1 animate-pulse">
                                Excedido por {data.elapsedMinutes! - data.estimatedDuration} min
                            </p>
                        )}
                    </div>
                </div>
            </div>
        );
    };

    return (
        <div className="bg-[#0f1115] text-white h-screen flex flex-col overflow-hidden font-display w-full absolute top-0 left-0 z-50 selection:bg-emerald-500/30">
            {/* Background Effects */}
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,_rgba(16,185,129,0.05)_0%,_rgba(0,0,0,0)_50%)] pointer-events-none"></div>

            <ProgressBar isLoading={loading} />
            {/* Header */}
            <header className="flex-none bg-slate-900/80 backdrop-blur-md border-b border-white/5 px-4 md:px-8 py-3 md:py-4 shadow-xl z-20">
                <div className="flex flex-col md:flex-row items-center justify-between w-full gap-3 md:gap-0 max-w-[1920px] mx-auto">
                    <div className="flex items-center gap-3 w-full md:w-1/3 justify-between md:justify-start">
                        <div className="flex items-center gap-4">
                            <button onClick={() => navigate('/')} className="flex items-center justify-center size-10 rounded-xl bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white transition-all border border-white/5">
                                <span className="material-symbols-outlined text-xl">arrow_back</span>
                            </button>
                            <div className="flex flex-col">
                                <h1 className="text-xl md:text-2xl font-black tracking-tight text-white uppercase leading-none">Monitor Central</h1>
                                <p className="text-xs font-bold text-emerald-500 tracking-[0.2em] uppercase mt-0.5">Quirófano en Vivo</p>
                            </div>
                        </div>
                    </div>

                    {/* Real-time Clock */}
                    <div className="flex flex-col items-center justify-center w-full md:w-1/3 py-1 md:py-0">
                        <span className="text-4xl md:text-6xl font-black tracking-tighter text-white font-mono leading-none drop-shadow-[0_0_20px_rgba(255,255,255,0.2)]">
                            {formatTime(currentTime)}
                        </span>
                        <p className="text-slate-400 font-bold text-xs uppercase tracking-[0.4em] mt-1 opacity-60">
                            {formatDate(currentTime)}
                        </p>
                    </div>

                    <div className="hidden md:flex items-center justify-end gap-6 text-right w-1/3">
                        <button
                            onClick={() => {
                                if (!document.fullscreenElement) {
                                    document.documentElement.requestFullscreen().catch(console.error);
                                } else {
                                    if (document.exitFullscreen) document.exitFullscreen();
                                }
                            }}
                            className="flex items-center justify-center size-10 rounded-xl bg-white/5 border border-white/5 text-slate-400 hover:text-white hover:bg-white/10 transition-all"
                            title={isFullscreen ? "Salir Pantalla Completa" : "Pantalla Completa"}
                        >
                            <span className="material-symbols-outlined">{isFullscreen ? 'close_fullscreen' : 'fullscreen'}</span>
                        </button>
                        <div className="flex items-center gap-3 bg-emerald-500/10 px-4 py-2 rounded-full border border-emerald-500/20 shadow-[0_0_15px_rgba(16,185,129,0.2)]">
                            <span className="relative flex h-2 w-2">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                            </span>
                            <span className="text-[10px] font-black text-emerald-400 tracking-widest uppercase">Sistema Operativo</span>
                        </div>
                    </div>
                </div>
            </header>

            {/* Content - Dynamic OR List */}
            <main className="flex-grow flex w-full overflow-hidden relative z-10">
                {loading ? (
                    <div className="flex-grow flex flex-col items-center justify-center text-slate-500 gap-4">
                        <div className="size-16 rounded-full border-4 border-emerald-500/30 border-t-emerald-500 animate-spin"></div>
                        <p className="text-lg font-black uppercase tracking-widest text-slate-600">Sincronizando...</p>
                    </div>
                ) : (
                    <div className="flex-grow flex flex-col md:flex-row overflow-y-auto md:overflow-x-auto w-full max-w-[1920px] mx-auto snap-x snap-mandatory">
                        {roomsData.map((data, idx) => (
                            <section
                                key={data.room.id}
                                className={`snap-center flex-none w-full ${roomsData.length === 1 ? 'md:w-full max-w-5xl mx-auto' : 'md:w-1/2 xl:w-1/2'} flex flex-col md:h-full relative ${idx < roomsData.length - 1 ? 'border-b md:border-b-0 md:border-r border-white/5' : ''} bg-[#0b0d10] even:bg-[#0f1115]`}
                            >
                                <div className="p-4 md:p-6 border-b border-white/5 flex items-center justify-between sticky top-0 z-20 bg-inherit/95 backdrop-blur-md">
                                    <div className="flex items-center gap-4">
                                        <div className="flex items-center justify-center size-12 md:size-14 rounded-2xl bg-white/5 text-2xl font-black text-white border border-white/10 shadow-lg">
                                            {(idx + 1).toString().padStart(2, '0')}
                                        </div>
                                        <div>
                                            <h2 className="text-xl md:text-2xl font-black text-white uppercase tracking-tight leading-none truncate">{data.room.name}</h2>
                                            <div className="flex items-center gap-2 mt-1.5">
                                                <span className={`size-2 rounded-full ${data.current ? 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.6)]' : 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]'}`}></span>
                                                <span className={`text-[10px] font-bold uppercase tracking-wider ${data.current ? 'text-red-400' : 'text-emerald-400'}`}>
                                                    {data.current ? 'Ocupado' : 'Disponible'}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div className="flex-1 overflow-y-auto p-4 md:p-6 relative space-y-6 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
                                    {/* Previous Surgeries (Collapsible ideally, but just top list here) */}
                                    {data.completed.length > 0 && (
                                        <div className="flex flex-col gap-2 opacity-50 hover:opacity-100 transition-opacity">
                                            <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest pl-1">Finalizadas de hoy</h4>
                                            {data.completed.map(sx => <CaseCard key={sx.id} data={sx} />)}
                                        </div>
                                    )}

                                    {/* Current Surgery Area */}
                                    <div className="py-2">
                                        {data.current ? (
                                            <CaseCard data={data.current} room={data.room} />
                                        ) : (
                                            <div className="border-2 border-dashed border-white/5 rounded-3xl h-64 flex flex-col items-center justify-center text-slate-600 bg-white/[0.02]">
                                                <span className="material-symbols-outlined text-5xl mb-4 opacity-50">sensor_door</span>
                                                <p className="font-bold uppercase tracking-[0.2em] text-xs">Quirófano Inactivo</p>
                                                <p className="text-[10px] mt-2 opacity-50">Esperando ingreso...</p>
                                            </div>
                                        )}
                                    </div>

                                    {/* Next Surgery */}
                                    {data.next && (
                                        <div className="animate-in slide-in-from-bottom-5 duration-700">
                                            <CaseCard data={data.next} room={data.room} />
                                        </div>
                                    )}
                                </div>
                            </section>
                        ))}
                        {roomsData.length === 0 && (
                            <div className="flex-grow flex flex-col items-center justify-center text-slate-500">
                                <span className="material-symbols-outlined text-6xl mb-4">door_front</span>
                                <p className="text-xl font-bold uppercase tracking-widest">No hay quirófanos activos configurados</p>
                            </div>
                        )}
                    </div>
                )}
            </main>
        </div>
    );
};

export default Monitor;