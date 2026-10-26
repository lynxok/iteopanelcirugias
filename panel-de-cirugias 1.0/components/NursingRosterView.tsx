import React, { useState, useEffect } from 'react';
import { supabase } from '../src/lib/supabase';
import { useAuth } from '../src/lib/AuthContext';
import { 
    AppUser, NursingRosterEntry, NursingAbsence, 
    NursingShiftType, NursingRosterStatus, NursingShiftLog 
} from '../types';
import { 
    format, addDays, startOfWeek, endOfWeek, 
    startOfMonth, endOfMonth, eachDayOfInterval, 
    isSameDay, parseISO, getDay 
} from 'date-fns';
import { es } from 'date-fns/locale';
import { 
    generateMonthlyNursingRoster, 
    DEFAULT_NURSING_PROFILES, 
    NursingProfileConfig, 
    NursingUnavailability, 
    SolverResult 
} from '../src/lib/nursingScheduler';

interface NursingRosterViewProps {
    currentOccupiedBedsCount?: number;
    canManage?: boolean;
}

const SHIFT_LABELS: Record<NursingShiftType, { label: string; time: string; color: string }> = {
    manana: { label: 'Mañana', time: '06:00 - 14:00', color: 'bg-amber-100 text-amber-800 border-amber-300' },
    tarde: { label: 'Tarde', time: '14:00 - 22:00', color: 'bg-sky-100 text-sky-800 border-sky-300' },
    noche: { label: 'Noche', time: '22:00 - 06:00', color: 'bg-indigo-100 text-indigo-800 border-indigo-300' }
};

const STATUS_LABELS: Record<NursingRosterStatus, { label: string; badge: string }> = {
    programado: { label: 'Guardia', badge: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
    franco: { label: 'Franco', badge: 'bg-slate-100 text-slate-600 border-slate-200' },
    vacaciones: { label: 'Vacaciones', badge: 'bg-purple-100 text-purple-800 border-purple-200' },
    licencia: { label: 'Licencia', badge: 'bg-rose-100 text-rose-800 border-rose-200' },
    refuerzo: { label: 'Refuerzo', badge: 'bg-blue-100 text-blue-800 border-blue-200' }
};

export const NursingRosterView: React.FC<NursingRosterViewProps> = ({
    currentOccupiedBedsCount = 0,
    canManage = false
}) => {
    const { user } = useAuth();
    const [viewMode, setViewMode] = useState<'daily' | 'weekly' | 'monthly'>('weekly');
    const [selectedDate, setSelectedDate] = useState<Date>(new Date());
    const [nurses, setNurses] = useState<AppUser[]>([]);
    const [rosterEntries, setRosterEntries] = useState<NursingRosterEntry[]>([]);
    const [absences, setAbsences] = useState<NursingAbsence[]>([]);
    const [shiftLogs, setShiftLogs] = useState<NursingShiftLog[]>([]);
    const [loading, setLoading] = useState(true);

    // Modal de asignación rápida
    const [showAssignModal, setShowAssignModal] = useState(false);
    const [selectedSlot, setSelectedSlot] = useState<{
        dateStr: string;
        shift: NursingShiftType;
        nurseId?: string;
        currentStatus?: NursingRosterStatus;
    } | null>(null);

    // Modal de ausencia
    const [showAbsenceModal, setShowAbsenceModal] = useState(false);
    const [newAbsence, setNewAbsence] = useState({
        nurse_id: '',
        type: 'vacaciones',
        start_date: format(new Date(), 'yyyy-MM-dd'),
        end_date: format(addDays(new Date(), 7), 'yyyy-MM-dd'),
        notes: ''
    });

    // Modal de Asignación por Rango / Bloque (CCT 122/75)
    const [showBulkModal, setShowBulkModal] = useState(false);
    const [bulkForm, setBulkForm] = useState({
        nurse_id: '',
        shift: 'manana' as NursingShiftType,
        start_date: format(new Date(), 'yyyy-MM-dd'),
        end_date: format(addDays(new Date(), 9), 'yyyy-MM-dd'), // 10 días por defecto
        pattern: 'consecutive' as 'consecutive' | 'weekdays' | 'rotation_6x2',
        override_warning: false
    });
    const [bulkValidationWarnings, setBulkValidationWarnings] = useState<string[]>([]);

    // Estados para Planificador Inteligente / Solver de Restricciones
    const [nursingProfiles, setNursingProfiles] = useState<NursingProfileConfig[]>(DEFAULT_NURSING_PROFILES);
    const [unavailabilities, setUnavailabilities] = useState<NursingUnavailability[]>([]);
    const [showSolverModal, setShowSolverModal] = useState(false);
    const [showUnavailModal, setShowUnavailModal] = useState(false);
    const [solverResult, setSolverResult] = useState<SolverResult | null>(null);
    const [solverPreviewTab, setSolverPreviewTab] = useState<'calendar' | 'matrix' | 'summary'>('calendar');
    const [isSavingSolver, setIsSavingSolver] = useState(false);

    // Formulario de indisponibilidad para Andrea / Enzo / Licencias
    const [newUnavail, setNewUnavail] = useState({
        profile_id: 'andrea',
        date: format(new Date(), 'yyyy-MM-dd'),
        shift: 'all' as 'all' | NursingShiftType,
        reason: 'Planilla externa hospital'
    });

    const isSupervisor = canManage || 
        user?.role === 'SuperAdmin' || 
        (user?.role as any) === 'Dirección' || 
        user?.role === 'Direccion' || 
        !!user?.can_manage_nursing_shifts;

    useEffect(() => {
        fetchNursesAndRoster();
    }, [selectedDate, viewMode]);

    const fetchNursesAndRoster = async () => {
        setLoading(true);
        try {
            // 1. Obtener lista de usuarios de Enfermería e Internación
            const { data: usersData } = await supabase
                .from('users')
                .select('*')
                .in('role', ['Enfermeria', 'Internacion'])
                .eq('active', true)
                .order('name');

            if (usersData) {
                setNurses(usersData);
            }

            // 2. Determinar rango de fechas según la vista
            let start: Date;
            let end: Date;

            if (viewMode === 'daily') {
                start = selectedDate;
                end = selectedDate;
            } else if (viewMode === 'weekly') {
                start = startOfWeek(selectedDate, { weekStartsOn: 1 });
                end = endOfWeek(selectedDate, { weekStartsOn: 1 });
            } else {
                start = startOfMonth(selectedDate);
                end = endOfMonth(selectedDate);
            }

            const startStr = format(start, 'yyyy-MM-dd');
            const endStr = format(end, 'yyyy-MM-dd');

            // 3. Consultar Roster, Ausencias, Logs e Indisponibilidades
            const [rosterRes, absencesRes, logsRes, unavailRes] = await Promise.all([
                supabase
                    .from('nursing_roster')
                    .select('*, nurse:nurse_id(id, name, email)')
                    .gte('date', startStr)
                    .lte('date', endStr),
                supabase
                    .from('nursing_absences')
                    .select('*, nurse:nurse_id(id, name, email)')
                    .or(`start_date.lte.${endStr},end_date.gte.${startStr}`),
                supabase
                    .from('nursing_shift_logs')
                    .select('*')
                    .gte('date', startStr)
                    .lte('date', endStr),
                supabase
                    .from('nursing_unavailabilities')
                    .select('*')
                    .gte('date', startStr)
                    .lte('date', endStr)
            ]);

            if (rosterRes.data) setRosterEntries(rosterRes.data);
            if (absencesRes.data) setAbsences(absencesRes.data);
            if (logsRes.data) setShiftLogs(logsRes.data);
            if (unavailRes.data) setUnavailabilities(unavailRes.data);

            // Mapear IDs de usuarios reales si coinciden por nombre
            if (usersData) {
                setNursingProfiles(prev => prev.map(prof => {
                    const matchedUser = usersData.find(u => 
                        u.name.toLowerCase().includes(prof.name.toLowerCase()) || 
                        prof.name.toLowerCase().includes(u.name.toLowerCase())
                    );
                    return matchedUser ? { ...prof, user_id: matchedUser.id } : prof;
                }));
            }

        } catch (err) {
            console.error('Error loading nursing roster:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleAssignSlot = async (nurseId: string, status: NursingRosterStatus) => {
        if (!selectedSlot) return;
        try {
            const { error } = await supabase
                .from('nursing_roster')
                .upsert({
                    date: selectedSlot.dateStr,
                    shift: selectedSlot.shift,
                    nurse_id: nurseId,
                    status,
                    created_by: user?.id || null
                }, { onConflict: 'nurse_id,date,shift' });

            if (error) throw error;
            setShowAssignModal(false);
            fetchNursesAndRoster();
        } catch (e: any) {
            alert('Error al asignar turno: ' + e.message);
        }
    };

    const handleRemoveEntry = async (entryId: string) => {
        if (!confirm('¿Desea quitar esta asignación?')) return;
        try {
            await supabase.from('nursing_roster').delete().eq('id', entryId);
            fetchNursesAndRoster();
        } catch (e: any) {
            alert(e.message);
        }
    };

    const handleSaveAbsence = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const { error } = await supabase
                .from('nursing_absences')
                .insert({
                    ...newAbsence,
                    created_by: user?.id || null
                });

            if (error) throw error;
            setShowAbsenceModal(false);
            fetchNursesAndRoster();
            alert('Ausencia/Vacaciones registradas con éxito.');
        } catch (e: any) {
            alert('Error: ' + e.message);
        }
    };

    const handleSaveBulk = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!bulkForm.nurse_id) {
            alert('Seleccione un enfermero/a');
            return;
        }

        const start = parseISO(bulkForm.start_date);
        const end = parseISO(bulkForm.end_date);
        if (end < start) {
            alert('La fecha hasta debe ser igual o posterior a la fecha desde');
            return;
        }

        const allDays = eachDayOfInterval({ start, end });
        const warnings: string[] = [];

        // Evaluar días a asignar según el patrón
        const daysToAssign: { dateStr: string; status: NursingRosterStatus }[] = [];
        let consecutiveWorkDays = 0;

        for (let i = 0; i < allDays.length; i++) {
            const currentDay = allDays[i];
            const dateStr = format(currentDay, 'yyyy-MM-dd');
            const dayOfWeek = currentDay.getDay(); // 0 = Domingo, 6 = Sábado

            if (bulkForm.pattern === 'weekdays') {
                if (dayOfWeek === 0 || dayOfWeek === 6) {
                    daysToAssign.push({ dateStr, status: 'franco' });
                    consecutiveWorkDays = 0;
                } else {
                    daysToAssign.push({ dateStr, status: 'programado' });
                    consecutiveWorkDays++;
                }
            } else if (bulkForm.pattern === 'rotation_6x2') {
                // Ciclo de 8 días: 6 trabajo, 2 francos
                const cycleIndex = i % 8;
                if (cycleIndex < 6) {
                    daysToAssign.push({ dateStr, status: 'programado' });
                    consecutiveWorkDays++;
                } else {
                    daysToAssign.push({ dateStr, status: 'franco' });
                    consecutiveWorkDays = 0;
                }
            } else {
                // 'consecutive' corrido
                daysToAssign.push({ dateStr, status: 'programado' });
                consecutiveWorkDays++;
            }

            // Validación CCT 122/75: Límite de días seguidos (> 6 días)
            if (consecutiveWorkDays > 6) {
                warnings.push(`Excede el límite de 6 jornadas continuas sin descanso semanal de 40 hs (Art. 20 CCT 122/75). Acumula ${consecutiveWorkDays} días continuos.`);
            }
        }

        // Validación descanso entre jornadas (12 hs mínimas)
        // Si el turno asignado es Mañana (06:00), verificar si el día anterior tenía turno Tarde (22:00) o Noche
        if (bulkForm.shift === 'manana') {
            for (const item of daysToAssign) {
                if (item.status === 'programado') {
                    const prevDate = format(addDays(parseISO(item.dateStr), -1), 'yyyy-MM-dd');
                    const prevEntry = rosterEntries.find(r => r.nurse_id === bulkForm.nurse_id && r.date === prevDate && (r.shift === 'tarde' || r.shift === 'noche'));
                    if (prevEntry) {
                        warnings.push(`Incompatibilidad de descanso en fecha ${item.dateStr}: el día anterior realizó turno ${prevEntry.shift.toUpperCase()} (solo median 8 hs de reposo, el CCT y LCT exigen mínimo 12 hs).`);
                        break;
                    }
                }
            }
        }

        if (warnings.length > 0 && !bulkForm.override_warning) {
            setBulkValidationWarnings(warnings);
            return;
        }

        try {
            // Guardar masivamente en Supabase
            const payload = daysToAssign.map(item => ({
                nurse_id: bulkForm.nurse_id,
                date: item.dateStr,
                shift: bulkForm.shift,
                status: item.status,
                created_by: user?.id || null
            }));

            const { error } = await supabase
                .from('nursing_roster')
                .upsert(payload, { onConflict: 'nurse_id,date,shift' });

            if (error) throw error;

            alert(`Se asignaron ${payload.length} jornadas correctamente respetando la cobertura.`);
            setShowBulkModal(false);
            setBulkValidationWarnings([]);
            setBulkForm({ ...bulkForm, override_warning: false });
            fetchNursesAndRoster();
        } catch (err: any) {
            alert('Error en asignación masiva: ' + err.message);
        }
    };

    // Ejecutar Motor de Sugerencia Inteligente
    const handleRunSolver = () => {
        const start = startOfMonth(selectedDate);
        const end = endOfMonth(selectedDate);
        const result = generateMonthlyNursingRoster(start, end, nursingProfiles, unavailabilities, absences);
        setSolverResult(result);
        setShowSolverModal(true);
    };

    // Confirmar y Guardar Asignación Sugerida en Base de Datos
    const handleApplySolver = async () => {
        if (!solverResult) return;
        setIsSavingSolver(true);
        try {
            // Transformar cada turno asignado al formato de quirofano.nursing_roster
            const payload = solverResult.shifts.map(s => {
                const matchedNurse = nurses.find(n => 
                    n.name.toLowerCase().includes(s.nurse_name.toLowerCase()) || 
                    s.nurse_name.toLowerCase().includes(n.name.toLowerCase())
                );
                return {
                    nurse_id: matchedNurse?.id || s.nurse_id,
                    date: s.date,
                    shift: s.shift,
                    status: s.status,
                    notes: s.notes,
                    created_by: user?.id || null
                };
            }).filter(item => !!item.nurse_id);

            const { error } = await supabase
                .from('nursing_roster')
                .upsert(payload, { onConflict: 'nurse_id,date,shift' });

            if (error) throw error;

            // Actualizar perfiles en memoria
            setNursingProfiles(solverResult.updatedProfiles);

            alert(`¡Planificación mensual generada y guardada con éxito! (${payload.length} turnos registrados).`);
            setShowSolverModal(false);
            setSolverResult(null);
            fetchNursesAndRoster();
        } catch (err: any) {
            alert('Error al guardar la planificación: ' + err.message);
        } finally {
            setIsSavingSolver(false);
        }
    };

    // Guardar Indisponibilidad Externa
    const handleSaveUnavailability = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const profile = nursingProfiles.find(p => p.id === newUnavail.profile_id);
            const { error } = await supabase
                .from('nursing_unavailabilities')
                .upsert({
                    profile_id: newUnavail.profile_id,
                    nurse_name: profile?.name || newUnavail.profile_id,
                    date: newUnavail.date,
                    shift: newUnavail.shift,
                    reason: newUnavail.reason,
                    created_by: user?.id || null
                }, { onConflict: 'profile_id,date,shift' });

            if (error) throw error;

            alert('Indisponibilidad registrada con éxito.');
            setShowUnavailModal(false);
            fetchNursesAndRoster();
        } catch (err: any) {
            alert('Error al registrar indisponibilidad: ' + err.message);
        }
    };

    const handleDeleteUnavailability = async (id?: string) => {
        if (!id) return;
        try {
            await supabase.from('nursing_unavailabilities').delete().eq('id', id);
            fetchNursesAndRoster();
        } catch (err: any) {
            alert(err.message);
        }
    };

    // Cálculo de dotación sugerida para 9 camas
    // <= 6 camas -> 1 enfermera por turno
    // 7 a 9 camas -> 2 enfermeras por turno
    const requiredNursesPerShift = currentOccupiedBedsCount > 6 ? 2 : 1;

    // Rango de días a iterar
    const daysInterval = viewMode === 'daily' 
        ? [selectedDate]
        : viewMode === 'weekly'
            ? eachDayOfInterval({ 
                start: startOfWeek(selectedDate, { weekStartsOn: 1 }), 
                end: endOfWeek(selectedDate, { weekStartsOn: 1 }) 
              })
            : eachDayOfInterval({
                start: startOfMonth(selectedDate),
                end: endOfMonth(selectedDate)
              });

    return (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-6 animate-fadeIn">
            {/* Header & Controles */}
            <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 border-b border-slate-100 pb-5">
                <div>
                    <div className="flex items-center gap-3">
                        <span className="material-symbols-outlined text-primary text-2xl">calendar_month</span>
                        <h2 className="text-xl font-black text-slate-900">Planificador de Cobertura de Enfermería</h2>
                    </div>
                    <p className="text-xs text-slate-500 font-medium mt-1">
                        Organización de 3 turnos (Mañana, Tarde, Noche), francos y vacaciones según ocupación de camas (Capacidad: 9 camas).
                    </p>
                </div>

                {/* Banner de Dotación Sugerida */}
                <div className="bg-slate-50 border border-slate-200 px-4 py-2.5 rounded-2xl flex items-center gap-4">
                    <div className="text-left">
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Camas Ocupadas Hoy</span>
                        <span className="text-sm font-black text-slate-800">{currentOccupiedBedsCount} / 9</span>
                    </div>
                    <div className="h-7 w-px bg-slate-200"></div>
                    <div className="text-left">
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Dotación Sugerida</span>
                        <span className={`text-xs font-black px-2 py-0.5 rounded-full inline-block ${
                            requiredNursesPerShift === 1 
                                ? 'bg-emerald-100 text-emerald-800' 
                                : 'bg-amber-100 text-amber-800'
                        }`}>
                            {requiredNursesPerShift} enfermera/o por turno
                        </span>
                    </div>
                </div>

                {/* Acciones de Supervisor */}
                <div className="flex items-center gap-2">
                    {isSupervisor && (
                        <>
                            <button
                                onClick={handleRunSolver}
                                className="px-3.5 py-2 bg-gradient-to-r from-indigo-600 to-primary text-white hover:brightness-110 rounded-xl text-xs font-black flex items-center gap-1.5 transition-all shadow-md shadow-indigo-500/20"
                                title="Generar propuesta automática mensual basada en ciclo 6-2/5-1 y restricciones individuales"
                            >
                                <span className="material-symbols-outlined text-sm">smart_toy</span>
                                Sugerir Planificación
                            </button>
                            <button
                                onClick={() => setShowUnavailModal(true)}
                                className="px-3 py-2 bg-amber-50 text-amber-800 hover:bg-amber-100 border border-amber-200 rounded-xl text-xs font-black flex items-center gap-1.5 transition-all shadow-sm"
                                title="Cargar bloqueos externos (ej. planilla del 28 de Andrea/Enzo)"
                            >
                                <span className="material-symbols-outlined text-sm">event_busy</span>
                                Bloqueos Externos
                                {unavailabilities.length > 0 && (
                                    <span className="size-4 rounded-full bg-amber-500 text-white text-[9px] flex items-center justify-center font-bold">
                                        {unavailabilities.length}
                                    </span>
                                )}
                            </button>
                            <button
                                onClick={() => {
                                    setBulkValidationWarnings([]);
                                    setShowBulkModal(true);
                                }}
                                className="px-3 py-2 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 rounded-xl text-xs font-black flex items-center gap-1.5 transition-all shadow-sm"
                            >
                                <span className="material-symbols-outlined text-sm">date_range</span>
                                Carga Rápida (Rango)
                            </button>
                            <button
                                onClick={() => setShowAbsenceModal(true)}
                                className="px-3 py-2 bg-purple-50 text-purple-700 hover:bg-purple-100 border border-purple-200 rounded-xl text-xs font-black flex items-center gap-1.5 transition-all shadow-sm"
                            >
                                <span className="material-symbols-outlined text-sm">beach_access</span>
                                Vacaciones / Licencia
                            </button>
                        </>
                    )}

                    {/* Selector de Vista */}
                    <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200">
                        <button
                            onClick={() => setViewMode('daily')}
                            className={`px-3 py-1 rounded-lg text-xs font-black transition-all ${
                                viewMode === 'daily' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'
                            }`}
                        >
                            Diario
                        </button>
                        <button
                            onClick={() => setViewMode('weekly')}
                            className={`px-3 py-1 rounded-lg text-xs font-black transition-all ${
                                viewMode === 'weekly' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'
                            }`}
                        >
                            Semanal
                        </button>
                        <button
                            onClick={() => setViewMode('monthly')}
                            className={`px-3 py-1 rounded-lg text-xs font-black transition-all ${
                                viewMode === 'monthly' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'
                            }`}
                        >
                            Mensual
                        </button>
                    </div>
                </div>
            </div>

            {/* Navegación temporal */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => setSelectedDate(addDays(selectedDate, viewMode === 'daily' ? -1 : viewMode === 'weekly' ? -7 : -30))}
                        className="size-8 rounded-lg border border-slate-200 hover:bg-slate-50 flex items-center justify-center text-slate-600 transition-colors"
                    >
                        <span className="material-symbols-outlined text-sm">chevron_left</span>
                    </button>
                    <span className="text-sm font-black text-slate-800 capitalize min-w-[200px] text-center">
                        {format(selectedDate, viewMode === 'monthly' ? 'MMMM yyyy' : "d 'de' MMMM, yyyy", { locale: es })}
                    </span>
                    <button
                        onClick={() => setSelectedDate(addDays(selectedDate, viewMode === 'daily' ? 1 : viewMode === 'weekly' ? 7 : 30))}
                        className="size-8 rounded-lg border border-slate-200 hover:bg-slate-50 flex items-center justify-center text-slate-600 transition-colors"
                    >
                        <span className="material-symbols-outlined text-sm">chevron_right</span>
                    </button>
                    <button
                        onClick={() => setSelectedDate(new Date())}
                        className="px-2.5 py-1 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors border border-slate-200 ml-2"
                    >
                        Hoy
                    </button>
                </div>
            </div>

            {/* Grilla Semanal / Cuadrante */}
            {viewMode === 'weekly' && (
                <div className="overflow-x-auto">
                    <table className="w-full border-collapse border border-slate-200 rounded-xl overflow-hidden text-left text-xs">
                        <thead>
                            <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase font-black text-[10px] tracking-wider">
                                <th className="p-3 border-r border-slate-200 w-36">Turno</th>
                                {daysInterval.map(d => {
                                    const isToday = isSameDay(d, new Date());
                                    return (
                                        <th key={d.toISOString()} className={`p-3 text-center border-r border-slate-200 last:border-r-0 ${isToday ? 'bg-primary/5 text-primary' : ''}`}>
                                            <div className="font-black">{format(d, 'EEEE', { locale: es })}</div>
                                            <div className="text-xs font-normal text-slate-400">{format(d, 'dd/MM')}</div>
                                        </th>
                                    );
                                })}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200">
                            {(['manana', 'tarde', 'noche'] as NursingShiftType[]).map(shiftKey => {
                                const shiftInfo = SHIFT_LABELS[shiftKey];
                                return (
                                    <tr key={shiftKey} className="hover:bg-slate-50/50 transition-colors">
                                        {/* Columna Turno */}
                                        <td className="p-3 border-r border-slate-200 font-bold bg-slate-50/30">
                                            <div className="text-xs font-black text-slate-800">{shiftInfo.label}</div>
                                            <div className="text-[10px] text-slate-400 font-medium">{shiftInfo.time}</div>
                                        </td>

                                        {/* Celdas por Día */}
                                        {daysInterval.map(d => {
                                            const dateStr = format(d, 'yyyy-MM-dd');
                                            const entries = rosterEntries.filter(e => e.date === dateStr && e.shift === shiftKey);
                                            const isCovered = entries.length >= requiredNursesPerShift;

                                            return (
                                                <td key={dateStr} className="p-2 border-r border-slate-200 last:border-r-0 align-top min-w-[130px]">
                                                    <div className="space-y-1.5 min-h-[50px] flex flex-col justify-between">
                                                        <div className="space-y-1">
                                                            {entries.map(entry => (
                                                                <div 
                                                                    key={entry.id} 
                                                                    className="group relative p-1.5 rounded-lg border bg-white shadow-xs flex items-center justify-between text-[11px]"
                                                                >
                                                                    <div className="truncate font-bold text-slate-700">
                                                                        {entry.nurse?.name || 'Enfermero/a'}
                                                                    </div>
                                                                    {isSupervisor && (
                                                                        <button
                                                                            onClick={() => handleRemoveEntry(entry.id)}
                                                                            className="opacity-0 group-hover:opacity-100 text-rose-500 hover:text-rose-700 size-4 flex items-center justify-center"
                                                                            title="Quitar"
                                                                        >
                                                                            &times;
                                                                        </button>
                                                                    )}
                                                                </div>
                                                            ))}
                                                        </div>

                                                        {/* Botón de Asignación / Estado */}
                                                        {isSupervisor && (
                                                            <button
                                                                onClick={() => {
                                                                    setSelectedSlot({ dateStr, shift: shiftKey });
                                                                    setShowAssignModal(true);
                                                                }}
                                                                className={`w-full py-1 text-[10px] font-black rounded-md border border-dashed transition-all flex items-center justify-center gap-1 ${
                                                                    entries.length === 0
                                                                        ? 'border-rose-300 text-rose-600 bg-rose-50/50 hover:bg-rose-50'
                                                                        : 'border-slate-200 text-slate-400 hover:text-slate-700 hover:border-slate-300'
                                                                }`}
                                                            >
                                                                <span className="material-symbols-outlined text-[12px]">add</span>
                                                                {entries.length === 0 ? 'Sin Cobertura' : 'Asignar'}
                                                            </button>
                                                        )}
                                                    </div>
                                                </td>
                                            );
                                        })}
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Vista Diaria Detallada */}
            {viewMode === 'daily' && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {(['manana', 'tarde', 'noche'] as NursingShiftType[]).map(shiftKey => {
                        const shiftInfo = SHIFT_LABELS[shiftKey];
                        const dateStr = format(selectedDate, 'yyyy-MM-dd');
                        const entries = rosterEntries.filter(e => e.date === dateStr && e.shift === shiftKey);
                        const log = shiftLogs.find(l => l.date === dateStr && l.shift === shiftKey);

                        return (
                            <div key={shiftKey} className="p-4 rounded-2xl border border-slate-200 bg-slate-50/50 space-y-3">
                                <div className="flex justify-between items-center border-b border-slate-200 pb-2">
                                    <div>
                                        <h3 className="font-black text-slate-800 text-sm">{shiftInfo.label}</h3>
                                        <p className="text-[10px] text-slate-400">{shiftInfo.time}</p>
                                    </div>
                                    <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${
                                        entries.length >= requiredNursesPerShift 
                                            ? 'bg-emerald-100 text-emerald-800' 
                                            : 'bg-rose-100 text-rose-800'
                                    }`}>
                                        {entries.length} / {requiredNursesPerShift} asignadas
                                    </span>
                                </div>

                                {/* Personal en Turno */}
                                <div className="space-y-1.5">
                                    <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">Personal</span>
                                    {entries.length === 0 ? (
                                        <p className="text-xs text-rose-500 font-bold italic">Turno sin enfermera/o asignado</p>
                                    ) : (
                                        entries.map(e => (
                                            <div key={e.id} className="p-2 bg-white rounded-xl border border-slate-200 flex justify-between items-center text-xs font-bold text-slate-700">
                                                <span>{e.nurse?.name || 'Enfermero/a'}</span>
                                                <span className="text-[9px] uppercase px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">
                                                    {e.status}
                                                </span>
                                            </div>
                                        ))
                                    )}
                                </div>

                                {/* Cierre de Curaciones */}
                                <div className="pt-2 border-t border-slate-200">
                                    <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block mb-1">Cierre de Curaciones</span>
                                    {log ? (
                                        <div className="bg-white p-2.5 rounded-xl border border-slate-200 text-xs space-y-1">
                                            <div className="flex justify-between font-bold text-slate-700">
                                                <span>Curaciones:</span>
                                                <span className="text-primary font-black">{log.wound_dressings_count}</span>
                                            </div>
                                            {log.notes && (
                                                <p className="text-[11px] text-slate-500 italic">"{log.notes}"</p>
                                            )}
                                        </div>
                                    ) : (
                                        <p className="text-[11px] text-slate-400 italic">Pendiente de cierre por el personal</p>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Vista Mensual (Calendario Completo del Mes) */}
            {viewMode === 'monthly' && (
                <div className="space-y-3">
                    <div className="grid grid-cols-7 gap-2 text-center text-[10px] font-black uppercase tracking-wider text-slate-400 pb-1">
                        <div>Lun</div>
                        <div>Mar</div>
                        <div>Mié</div>
                        <div>Jue</div>
                        <div>Vie</div>
                        <div>Sáb</div>
                        <div>Dom</div>
                    </div>
                    <div className="grid grid-cols-7 gap-2">
                        {daysInterval.map(d => {
                            const dateStr = format(d, 'yyyy-MM-dd');
                            const isToday = isSameDay(d, new Date());
                            const dayEntries = rosterEntries.filter(e => e.date === dateStr);
                            const dayAbsences = absences.filter(a => a.start_date <= dateStr && a.end_date >= dateStr);
                            
                            // Cantidad de turnos cubiertos
                            const shiftsCount = new Set(dayEntries.map(e => e.shift)).size;
                            const isFullyCovered = shiftsCount === 3;

                            return (
                                <div
                                    key={dateStr}
                                    className={`min-h-[135px] p-2 rounded-xl border transition-all flex flex-col justify-between ${
                                        isToday 
                                            ? 'bg-primary/5 border-primary ring-1 ring-primary/20' 
                                            : 'bg-white border-slate-200 hover:border-slate-300'
                                    }`}
                                >
                                    <div className="flex justify-between items-center mb-1.5">
                                        <button
                                            type="button"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setSelectedDate(d);
                                                setViewMode('daily');
                                            }}
                                            className={`text-xs font-black size-6 rounded-full flex items-center justify-center transition-transform hover:scale-110 ${
                                                isToday ? 'bg-primary text-white shadow-xs' : 'text-slate-700 hover:bg-slate-100'
                                            }`}
                                            title="Ver detalle del día"
                                        >
                                            {format(d, 'd')}
                                        </button>
                                        <div className="flex items-center gap-1.5">
                                            <span className="text-[9px] font-bold text-slate-400">
                                                {dayEntries.length} {dayEntries.length === 1 ? 'enf' : 'enfs'}
                                            </span>
                                            <div className={`size-2 rounded-full ${
                                                dayEntries.length === 0 
                                                    ? 'bg-rose-400' 
                                                    : isFullyCovered 
                                                        ? 'bg-emerald-500' 
                                                        : 'bg-amber-400'
                                            }`} title={
                                                dayEntries.length === 0 
                                                    ? 'Sin cobertura' 
                                                    : isFullyCovered 
                                                        ? '3 turnos cubiertos' 
                                                        : 'Cobertura parcial'
                                            } />
                                        </div>
                                    </div>

                                    {/* Franjas de Turnos: Mañana, Tarde, Noche */}
                                    <div className="space-y-1 flex-1">
                                        {(['manana', 'tarde', 'noche'] as NursingShiftType[]).map(s => {
                                            const sEntries = dayEntries.filter(e => e.shift === s);
                                            const shiftInfo = SHIFT_LABELS[s];
                                            const isShiftAssigned = sEntries.length > 0;

                                            return (
                                                <div 
                                                    key={s} 
                                                    onClick={() => {
                                                        if (!isSupervisor) return;
                                                        setSelectedSlot({ dateStr, shift: s });
                                                        setShowAssignModal(true);
                                                    }}
                                                    className={`group/shift rounded-md px-1.5 py-1 text-[10px] flex items-center justify-between transition-all border ${
                                                        isSupervisor ? 'cursor-pointer' : ''
                                                    } ${
                                                        isShiftAssigned 
                                                            ? 'bg-slate-50/80 border-slate-200 hover:border-primary/50 hover:bg-slate-100/80 shadow-2xs' 
                                                            : 'bg-transparent border-dashed border-slate-200 hover:border-primary hover:bg-primary/5'
                                                    }`}
                                                    title={isSupervisor ? `Asignar o cambiar guardia ${shiftInfo.label}` : undefined}
                                                >
                                                    <div className="flex items-center gap-1 min-w-0 flex-1">
                                                        <span className={`font-black uppercase text-[8px] px-1 py-0.2 rounded shrink-0 ${shiftInfo.color}`}>
                                                            {s === 'manana' ? 'M' : s === 'tarde' ? 'T' : 'N'}
                                                        </span>
                                                        
                                                        {isShiftAssigned ? (
                                                            <div className="truncate text-slate-700 font-bold text-[10px]">
                                                                {sEntries.map(e => e.nurse?.name || 'Enf').join(', ')}
                                                            </div>
                                                        ) : (
                                                            <span className="text-[9px] text-slate-400 font-medium italic group-hover/shift:text-primary transition-colors">
                                                                Sin cubrir
                                                            </span>
                                                        )}
                                                    </div>

                                                    {/* Botón de acción por turno */}
                                                    {isSupervisor && (
                                                        <div className="flex items-center gap-0.5 shrink-0 ml-1">
                                                            {isShiftAssigned && (
                                                                <button
                                                                    type="button"
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        handleRemoveEntry(sEntries[0].id);
                                                                    }}
                                                                    className="opacity-0 group-hover/shift:opacity-100 text-rose-500 hover:text-rose-700 size-4 flex items-center justify-center rounded hover:bg-rose-50 transition-opacity"
                                                                    title="Quitar guardia"
                                                                >
                                                                    &times;
                                                                </button>
                                                            )}
                                                            <button
                                                                type="button"
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    setSelectedSlot({ dateStr, shift: s });
                                                                    setShowAssignModal(true);
                                                                }}
                                                                className={`size-4 rounded flex items-center justify-center transition-all ${
                                                                    !isShiftAssigned 
                                                                        ? 'text-slate-400 group-hover/shift:text-primary group-hover/shift:scale-110' 
                                                                        : 'opacity-0 group-hover/shift:opacity-100 text-slate-400 hover:text-slate-700 hover:bg-slate-200'
                                                                }`}
                                                                title={`Asignar guardia ${shiftInfo.label}`}
                                                            >
                                                                <span className="material-symbols-outlined text-[12px]">add</span>
                                                            </button>
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}

                                        {/* Badge de Vacaciones / Ausencias */}
                                        {dayAbsences.map(a => (
                                            <div key={a.id} className="text-[8px] truncate px-1 rounded bg-purple-50 text-purple-700 font-bold border border-purple-200 flex items-center gap-0.5">
                                                <span className="material-symbols-outlined text-[9px]">beach_access</span>
                                                <span className="truncate">{a.nurse?.name}: Vac</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Modal de Asignación */}
            {showAssignModal && selectedSlot && (
                <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-900/60 backdrop-blur-md p-4 animate-fadeIn">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-6 space-y-4 border border-slate-200">
                        <div className="flex justify-between items-center border-b border-slate-100 pb-3">
                            <h3 className="font-black text-slate-900 text-sm">Asignar Turno de Enfermería</h3>
                            <button onClick={() => setShowAssignModal(false)} className="text-slate-400 hover:text-slate-600">
                                <span className="material-symbols-outlined text-lg">close</span>
                            </button>
                        </div>

                        <div className="text-xs text-slate-500">
                            <strong>Fecha:</strong> {selectedSlot.dateStr} | <strong>Turno:</strong> {SHIFT_LABELS[selectedSlot.shift].label}
                        </div>

                        <div className="space-y-2 max-h-60 overflow-y-auto">
                            <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">Seleccione Enfermero/a</label>
                            {nurses.map(n => (
                                <button
                                    key={n.id}
                                    onClick={() => handleAssignSlot(n.id, 'programado')}
                                    className="w-full p-2.5 rounded-xl border border-slate-200 hover:border-primary hover:bg-primary/5 text-left text-xs font-bold text-slate-800 flex justify-between items-center transition-all"
                                >
                                    <span>{n.name}</span>
                                    <span className="material-symbols-outlined text-sm text-slate-400">arrow_forward</span>
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* Modal de Carga de Vacaciones / Ausencias */}
            {showAbsenceModal && (
                <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-900/60 backdrop-blur-md p-4 animate-fadeIn">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-6 space-y-4 border border-slate-200">
                        <div className="flex justify-between items-center border-b border-slate-100 pb-3">
                            <h3 className="font-black text-slate-900 text-sm">Registrar Vacaciones / Licencia</h3>
                            <button onClick={() => setShowAbsenceModal(false)} className="text-slate-400 hover:text-slate-600">
                                <span className="material-symbols-outlined text-lg">close</span>
                            </button>
                        </div>

                        <form onSubmit={handleSaveAbsence} className="space-y-4">
                            <div>
                                <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">Personal</label>
                                <select
                                    value={newAbsence.nurse_id}
                                    onChange={e => setNewAbsence({ ...newAbsence, nurse_id: e.target.value })}
                                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800"
                                    required
                                >
                                    <option value="">Seleccione personal...</option>
                                    {nurses.map(n => (
                                        <option key={n.id} value={n.id}>{n.name}</option>
                                    ))}
                                </select>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">Desde</label>
                                    <input 
                                        type="date"
                                        value={newAbsence.start_date}
                                        onChange={e => setNewAbsence({ ...newAbsence, start_date: e.target.value })}
                                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800"
                                        required
                                    />
                                </div>
                                <div>
                                    <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">Hasta</label>
                                    <input 
                                        type="date"
                                        value={newAbsence.end_date}
                                        onChange={e => setNewAbsence({ ...newAbsence, end_date: e.target.value })}
                                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800"
                                        required
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">Tipo de Ausencia</label>
                                <select
                                    value={newAbsence.type}
                                    onChange={e => setNewAbsence({ ...newAbsence, type: e.target.value })}
                                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800"
                                >
                                    <option value="vacaciones">Vacaciones</option>
                                    <option value="licencia_medica">Licencia Médica</option>
                                    <option value="licencia_especial">Licencia Especial</option>
                                    <option value="otro">Otro</option>
                                </select>
                            </div>

                            <div className="flex gap-2 pt-2">
                                <button
                                    type="button"
                                    onClick={() => setShowAbsenceModal(false)}
                                    className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs uppercase"
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="submit"
                                    className="flex-1 py-2.5 bg-primary text-white font-black rounded-xl text-xs uppercase shadow-md shadow-primary/20"
                                >
                                    Guardar
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Modal de Carga Rápida / Asignación Masiva por Rango (CCT 122/75) */}
            {showBulkModal && (
                <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="bg-white rounded-3xl p-6 shadow-2xl max-w-lg w-full border border-slate-100 animate-in fade-in zoom-in-95 duration-150">
                        <div className="flex justify-between items-center mb-4">
                            <div>
                                <h3 className="text-base font-black text-slate-800">Carga Rápida de Cobertura</h3>
                                <p className="text-xs text-slate-500 font-medium mt-0.5">Asignación por bloque de fechas con validaciones CCT 122/75</p>
                            </div>
                            <button 
                                onClick={() => { setShowBulkModal(false); setBulkValidationWarnings([]); }}
                                className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-200 transition-colors"
                            >
                                ✕
                            </button>
                        </div>

                        <form onSubmit={handleSaveBulk} className="space-y-4">
                            <div>
                                <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">Enfermero/a a Programar</label>
                                <select
                                    value={bulkForm.nurse_id}
                                    onChange={e => {
                                        setBulkForm({ ...bulkForm, nurse_id: e.target.value, override_warning: false });
                                        setBulkValidationWarnings([]);
                                    }}
                                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800"
                                    required
                                >
                                    <option value="">Seleccione personal...</option>
                                    {nurses.map(n => (
                                        <option key={n.id} value={n.id}>{n.name}</option>
                                    ))}
                                </select>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">Turno Habitual</label>
                                    <select
                                        value={bulkForm.shift}
                                        onChange={e => {
                                            setBulkForm({ ...bulkForm, shift: e.target.value as NursingShiftType, override_warning: false });
                                            setBulkValidationWarnings([]);
                                        }}
                                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800"
                                    >
                                        <option value="manana">Mañana (06:00 - 14:00)</option>
                                        <option value="tarde">Tarde (14:00 - 22:00)</option>
                                        <option value="noche">Noche (22:00 - 06:00)</option>
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">Patrón / Modalidad</label>
                                    <select
                                        value={bulkForm.pattern}
                                        onChange={e => {
                                            setBulkForm({ ...bulkForm, pattern: e.target.value as any, override_warning: false });
                                            setBulkValidationWarnings([]);
                                        }}
                                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800"
                                    >
                                        <option value="weekdays">Lunes a Viernes (Sáb/Dom Franco)</option>
                                        <option value="rotation_6x2">Rotativo 6x2 (6 Trabajo / 2 Francos CCT)</option>
                                        <option value="consecutive">Días Corridos (Requiere validar descansos)</option>
                                    </select>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">Fecha Desde</label>
                                    <input 
                                        type="date"
                                        value={bulkForm.start_date}
                                        onChange={e => {
                                            setBulkForm({ ...bulkForm, start_date: e.target.value, override_warning: false });
                                            setBulkValidationWarnings([]);
                                        }}
                                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800"
                                        required
                                    />
                                </div>
                                <div>
                                    <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">Fecha Hasta</label>
                                    <input 
                                        type="date"
                                        value={bulkForm.end_date}
                                        onChange={e => {
                                            setBulkForm({ ...bulkForm, end_date: e.target.value, override_warning: false });
                                            setBulkValidationWarnings([]);
                                        }}
                                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800"
                                        required
                                    />
                                </div>
                            </div>

                            {/* Alerta de advertencia CCT 122/75 */}
                            {bulkValidationWarnings.length > 0 && (
                                <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-2xl space-y-2 animate-in fade-in">
                                    <div className="flex items-center gap-2 text-amber-800 font-bold text-xs">
                                        <span className="text-base">⚠️</span>
                                        <span>Observaciones de Jornada Laboral (CCT 122/75):</span>
                                    </div>
                                    <ul className="text-[11px] text-amber-700 space-y-1 list-disc list-inside">
                                        {bulkValidationWarnings.map((warn, i) => (
                                            <li key={i}>{warn}</li>
                                        ))}
                                    </ul>

                                    <div className="pt-2 border-t border-amber-200/60 flex items-center gap-2">
                                        <input 
                                            type="checkbox"
                                            id="override_warning"
                                            checked={bulkForm.override_warning}
                                            onChange={e => setBulkForm({ ...bulkForm, override_warning: e.target.checked })}
                                            className="w-4 h-4 text-amber-600 rounded border-amber-300 focus:ring-amber-500"
                                        />
                                        <label htmlFor="override_warning" className="text-xs font-bold text-amber-900 cursor-pointer">
                                            Autorizar excepción y asignar de todas formas
                                        </label>
                                    </div>
                                </div>
                            )}

                            <div className="flex gap-2 pt-2">
                                <button
                                    type="button"
                                    onClick={() => { setShowBulkModal(false); setBulkValidationWarnings([]); }}
                                    className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs uppercase"
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="submit"
                                    className="flex-1 py-2.5 bg-primary text-white font-black rounded-xl text-xs uppercase shadow-md shadow-primary/20 hover:brightness-105"
                                >
                                    {bulkValidationWarnings.length > 0 && !bulkForm.override_warning ? 'Verificar y Continuar' : 'Confirmar Asignación'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Modal de Sugerencia Inteligente de Planificación (Solver) */}
            {showSolverModal && solverResult && (
                <div className="fixed inset-0 z-[130] bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4 animate-fadeIn">
                    <div className="bg-white rounded-3xl p-6 shadow-2xl max-w-6xl w-full border border-slate-200 space-y-4 max-h-[92vh] flex flex-col">
                        <div className="flex justify-between items-center border-b border-slate-100 pb-3">
                            <div className="flex items-center gap-2.5">
                                <span className="material-symbols-outlined text-indigo-600 text-2xl">auto_fix_high</span>
                                <div>
                                    <h3 className="text-base font-black text-slate-900">Propuesta de Planificación Mensual</h3>
                                    <p className="text-xs text-slate-500 font-medium">
                                        Período: {format(selectedDate, 'MMMM yyyy', { locale: es })} • Generada con reglas de CCT, continuidad de ciclo y descansos de 40hs
                                    </p>
                                </div>
                            </div>
                            <button 
                                onClick={() => setShowSolverModal(false)}
                                className="size-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-200 transition-colors"
                            >
                                ✕
                            </button>
                        </div>

                        {/* Métricas de Cobertura */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 shrink-0">
                            <div className="p-3 bg-slate-50 border border-slate-200 rounded-2xl">
                                <span className="text-[10px] font-black uppercase text-slate-400 block">Días del Mes</span>
                                <span className="text-lg font-black text-slate-800">{solverResult.coverageStats.totalDays}</span>
                            </div>
                            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-2xl">
                                <span className="text-[10px] font-black uppercase text-emerald-600 block">Cobertura Completa</span>
                                <span className="text-lg font-black text-emerald-800">
                                    {solverResult.coverageStats.fullyCoveredDays} días
                                </span>
                            </div>
                            <div className="p-3 bg-amber-50 border border-amber-200 rounded-2xl">
                                <span className="text-[10px] font-black uppercase text-amber-600 block">Cobertura Parcial</span>
                                <span className="text-lg font-black text-amber-800">
                                    {solverResult.coverageStats.partiallyCoveredDays} días
                                </span>
                            </div>
                            <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-2xl">
                                <span className="text-[10px] font-black uppercase text-indigo-600 block">Turnos Sugeridos</span>
                                <span className="text-lg font-black text-indigo-800">
                                    {solverResult.shifts.filter(s => s.status === 'programado').length}
                                </span>
                            </div>
                        </div>

                        {/* Advertencias y Observaciones */}
                        {solverResult.warnings.length > 0 && (
                            <div className="p-3.5 bg-amber-50/70 border border-amber-200 rounded-2xl space-y-1.5 shrink-0 max-h-32 overflow-y-auto">
                                <div className="flex items-center gap-1.5 text-xs font-bold text-amber-800">
                                    <span className="material-symbols-outlined text-sm">warning</span>
                                    <span>Observaciones de la propuesta ({solverResult.warnings.length}):</span>
                                </div>
                                <ul className="text-[11px] text-amber-700 space-y-1 list-disc list-inside">
                                    {solverResult.warnings.map((w, idx) => (
                                        <li key={idx}>
                                            <strong>{w.nurse_name}</strong> {w.date ? `(${w.date}): ` : ': '}{w.message}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}

                        {/* Selector de Vistas de la Propuesta */}
                        <div className="flex justify-between items-center bg-slate-100 p-1 rounded-2xl shrink-0">
                            <div className="flex gap-1">
                                <button
                                    type="button"
                                    onClick={() => setSolverPreviewTab('calendar')}
                                    className={`px-3.5 py-1.5 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 ${
                                        solverPreviewTab === 'calendar' 
                                            ? 'bg-white text-indigo-700 shadow-sm' 
                                            : 'text-slate-500 hover:text-slate-800'
                                    }`}
                                >
                                    <span className="material-symbols-outlined text-sm">calendar_month</span>
                                    Calendario Propuesto (Día x Día)
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setSolverPreviewTab('matrix')}
                                    className={`px-3.5 py-1.5 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 ${
                                        solverPreviewTab === 'matrix' 
                                            ? 'bg-white text-indigo-700 shadow-sm' 
                                            : 'text-slate-500 hover:text-slate-800'
                                    }`}
                                >
                                    <span className="material-symbols-outlined text-sm">table_chart</span>
                                    Grilla por Enfermera
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setSolverPreviewTab('summary')}
                                    className={`px-3.5 py-1.5 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 ${
                                        solverPreviewTab === 'summary' 
                                            ? 'bg-white text-indigo-700 shadow-sm' 
                                            : 'text-slate-500 hover:text-slate-800'
                                    }`}
                                >
                                    <span className="material-symbols-outlined text-sm">pie_chart</span>
                                    Resumen y Balance
                                </button>
                            </div>

                            <span className="text-[11px] font-bold text-slate-500 pr-2">
                                Propuesta preliminar • Podrás ajustarla antes de guardar
                            </span>
                        </div>

                        {/* VISTA 1: CALENDARIO MENSUAL VISUAL COMPLETO */}
                        {solverPreviewTab === 'calendar' && (
                            <div className="flex-1 overflow-y-auto space-y-2 p-1">
                                <div className="grid grid-cols-7 gap-1.5 text-center text-[10px] font-black uppercase text-slate-400 pb-1 sticky top-0 bg-white z-10">
                                    <div>Lun</div>
                                    <div>Mar</div>
                                    <div>Mié</div>
                                    <div>Jue</div>
                                    <div>Vie</div>
                                    <div className="text-indigo-600">Sáb</div>
                                    <div className="text-indigo-600">Dom</div>
                                </div>
                                <div className="grid grid-cols-7 gap-2">
                                    {eachDayOfInterval({
                                        start: startOfMonth(selectedDate),
                                        end: endOfMonth(selectedDate)
                                    }).map(day => {
                                        const dStr = format(day, 'yyyy-MM-dd');
                                        const dayShifts = solverResult.shifts.filter(s => s.date === dStr && s.status === 'programado');
                                        const mShifts = dayShifts.filter(s => s.shift === 'manana');
                                        const tShifts = dayShifts.filter(s => s.shift === 'tarde');
                                        const nShifts = dayShifts.filter(s => s.shift === 'noche');
                                        const fShifts = solverResult.shifts.filter(s => s.date === dStr && s.status === 'franco');
                                        const isWeekend = getDay(day) === 0 || getDay(day) === 6;

                                        return (
                                            <div 
                                                key={dStr} 
                                                className={`min-h-[145px] p-2 rounded-2xl border flex flex-col justify-between transition-all ${
                                                    isWeekend 
                                                        ? 'bg-indigo-50/20 border-indigo-200/60' 
                                                        : 'bg-white border-slate-200'
                                                }`}
                                            >
                                                {/* Encabezado del día */}
                                                <div className="flex justify-between items-center mb-1">
                                                    <span className={`text-xs font-black size-6 rounded-full flex items-center justify-center ${
                                                        isWeekend ? 'bg-indigo-100 text-indigo-800' : 'text-slate-800'
                                                    }`}>
                                                        {format(day, 'd')}
                                                    </span>
                                                    <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-full ${
                                                        dayShifts.length >= (isWeekend ? 3 : 4)
                                                            ? 'bg-emerald-100 text-emerald-800'
                                                            : 'bg-amber-100 text-amber-800'
                                                    }`}>
                                                        {dayShifts.length} cubiertos
                                                    </span>
                                                </div>

                                                {/* Franjas de Guardias */}
                                                <div className="space-y-1.5 flex-1">
                                                    {/* Mañana */}
                                                    {(() => {
                                                        const reqM = isWeekend ? 1 : 2;
                                                        const isUncovered = mShifts.length < reqM;
                                                        const uncovInfo = solverResult.uncoveredSlots?.find(u => u.date === dStr && u.shift === 'manana');

                                                        return (
                                                            <div className={`p-1.5 rounded-xl border text-[9px] transition-all ${
                                                                isUncovered 
                                                                    ? 'bg-rose-50 border-rose-300 ring-1 ring-rose-300/50 shadow-xs' 
                                                                    : 'bg-amber-50/80 border-amber-200/80'
                                                            }`}>
                                                                <div className="flex items-center justify-between font-black">
                                                                    <div className="flex items-center gap-1 min-w-0">
                                                                        <span className={`size-3.5 rounded flex items-center justify-center text-[8px] shrink-0 ${
                                                                            isUncovered ? 'bg-rose-200 text-rose-900 font-black' : 'bg-amber-200 text-amber-900'
                                                                        }`}>M</span>
                                                                        <span className={`truncate ${isUncovered ? 'text-rose-900 font-black' : 'text-amber-800'}`}>
                                                                            {mShifts.length > 0 ? mShifts.map(s => s.nurse_name).join(', ') : 'Sin cubrir'}
                                                                        </span>
                                                                    </div>
                                                                    {isUncovered && (
                                                                        <span className="text-[8px] bg-rose-200 text-rose-800 font-black px-1 rounded shrink-0 ml-1">
                                                                            Falta {reqM - mShifts.length}
                                                                        </span>
                                                                    )}
                                                                </div>
                                                                {isUncovered && uncovInfo && (
                                                                    <div className="mt-1 text-[8px] text-rose-700 font-bold bg-white/70 p-1 rounded-md border border-rose-200/60 leading-tight">
                                                                        <span className="font-black text-rose-800">Causa:</span> {uncovInfo.reason}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        );
                                                    })()}

                                                    {/* Tarde */}
                                                    {(() => {
                                                        const isUncovered = tShifts.length === 0;
                                                        const uncovInfo = solverResult.uncoveredSlots?.find(u => u.date === dStr && u.shift === 'tarde');

                                                        return (
                                                            <div className={`p-1.5 rounded-xl border text-[9px] transition-all ${
                                                                isUncovered 
                                                                    ? 'bg-rose-50 border-rose-300 ring-1 ring-rose-300/50 shadow-xs' 
                                                                    : 'bg-sky-50/80 border-sky-200/80'
                                                            }`}>
                                                                <div className="flex items-center justify-between font-black">
                                                                    <div className="flex items-center gap-1 min-w-0">
                                                                        <span className={`size-3.5 rounded flex items-center justify-center text-[8px] shrink-0 ${
                                                                            isUncovered ? 'bg-rose-200 text-rose-900 font-black' : 'bg-sky-200 text-sky-900'
                                                                        }`}>T</span>
                                                                        <span className={`truncate ${isUncovered ? 'text-rose-900 font-black' : 'text-sky-800'}`}>
                                                                            {tShifts.length > 0 ? tShifts.map(s => s.nurse_name).join(', ') : 'Sin cubrir'}
                                                                        </span>
                                                                    </div>
                                                                    {isUncovered && (
                                                                        <span className="text-[8px] bg-rose-200 text-rose-800 font-black px-1 rounded shrink-0 ml-1">
                                                                            Falta 1
                                                                        </span>
                                                                    )}
                                                                </div>
                                                                {isUncovered && uncovInfo && (
                                                                    <div className="mt-1 text-[8px] text-rose-700 font-bold bg-white/70 p-1 rounded-md border border-rose-200/60 leading-tight">
                                                                        <span className="font-black text-rose-800">Causa:</span> {uncovInfo.reason}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        );
                                                    })()}

                                                    {/* Noche */}
                                                    {(() => {
                                                        const isUncovered = nShifts.length === 0;
                                                        const uncovInfo = solverResult.uncoveredSlots?.find(u => u.date === dStr && u.shift === 'noche');

                                                        return (
                                                            <div className={`p-1.5 rounded-xl border text-[9px] transition-all ${
                                                                isUncovered 
                                                                    ? 'bg-rose-50 border-rose-300 ring-1 ring-rose-300/50 shadow-xs' 
                                                                    : 'bg-indigo-50/80 border-indigo-200/80'
                                                            }`}>
                                                                <div className="flex items-center justify-between font-black">
                                                                    <div className="flex items-center gap-1 min-w-0">
                                                                        <span className={`size-3.5 rounded flex items-center justify-center text-[8px] shrink-0 ${
                                                                            isUncovered ? 'bg-rose-200 text-rose-900 font-black' : 'bg-indigo-200 text-indigo-900'
                                                                        }`}>N</span>
                                                                        <span className={`truncate ${isUncovered ? 'text-rose-900 font-black' : 'text-indigo-800'}`}>
                                                                            {nShifts.length > 0 ? nShifts.map(s => s.nurse_name).join(', ') : 'Sin cubrir'}
                                                                        </span>
                                                                    </div>
                                                                    {isUncovered && (
                                                                        <span className="text-[8px] bg-rose-200 text-rose-800 font-black px-1 rounded shrink-0 ml-1">
                                                                            Falta 1
                                                                        </span>
                                                                    )}
                                                                </div>
                                                                {isUncovered && uncovInfo && (
                                                                    <div className="mt-1 text-[8px] text-rose-700 font-bold bg-white/70 p-1 rounded-md border border-rose-200/60 leading-tight">
                                                                        <span className="font-black text-rose-800">Causa:</span> {uncovInfo.reason}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        );
                                                    })()}
                                                </div>

                                                {/* Francos del día */}
                                                {fShifts.length > 0 && (
                                                    <div className="mt-1 pt-1 border-t border-slate-100 text-[8px] text-slate-400 font-bold truncate">
                                                        <span className="text-emerald-700 font-black">F:</span> {fShifts.map(s => s.nurse_name).join(', ')}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {/* VISTA 2: MATRIZ HORIZONTAL POR ENFERMERA */}
                        {solverPreviewTab === 'matrix' && (
                            <div className="flex-1 overflow-x-auto overflow-y-auto border border-slate-200 rounded-2xl">
                                <table className="w-full text-left border-collapse text-xs">
                                    <thead className="bg-slate-50 sticky top-0 z-10 border-b border-slate-200">
                                        <tr>
                                            <th className="p-2.5 font-black text-slate-700 sticky left-0 bg-slate-50 z-20 min-w-[130px] border-r border-slate-200">
                                                Enfermera/o
                                            </th>
                                            {eachDayOfInterval({
                                                start: startOfMonth(selectedDate),
                                                end: endOfMonth(selectedDate)
                                            }).map(d => {
                                                const isW = getDay(d) === 0 || getDay(d) === 6;
                                                return (
                                                    <th key={d.toISOString()} className={`p-1.5 text-center font-black min-w-[34px] border-r border-slate-100 ${
                                                        isW ? 'bg-indigo-50/50 text-indigo-800' : 'text-slate-600'
                                                    }`}>
                                                        <div className="text-[9px] uppercase font-bold text-slate-400">{format(d, 'EEEEE', { locale: es })}</div>
                                                        <div>{format(d, 'd')}</div>
                                                    </th>
                                                );
                                            })}
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {nursingProfiles.map(prof => (
                                            <tr key={prof.id} className="hover:bg-slate-50/60 transition-colors">
                                                <td className="p-2.5 font-bold text-slate-800 sticky left-0 bg-white z-10 border-r border-slate-200 shadow-2xs">
                                                    <div className="truncate font-black text-xs">{prof.name}</div>
                                                    <div className="text-[9px] text-slate-400 font-bold truncate">
                                                        {prof.ciclo_tipo === '6-2_5-1' ? '6-2 / 5-1' : 'Planilla Ext.'}
                                                    </div>
                                                </td>
                                                {eachDayOfInterval({
                                                    start: startOfMonth(selectedDate),
                                                    end: endOfMonth(selectedDate)
                                                }).map(d => {
                                                    const dStr = format(d, 'yyyy-MM-dd');
                                                    const shift = solverResult.shifts.find(s => 
                                                        s.date === dStr && 
                                                        s.nurse_name.toLowerCase() === prof.name.toLowerCase()
                                                    );
                                                    const isW = getDay(d) === 0 || getDay(d) === 6;

                                                    let badge = null;
                                                    if (shift?.status === 'franco') {
                                                        badge = <span className="size-6 rounded-md bg-emerald-100 text-emerald-800 font-black text-[10px] flex items-center justify-center" title="Franco">F</span>;
                                                    } else if (shift?.shift === 'manana') {
                                                        badge = <span className="size-6 rounded-md bg-amber-100 text-amber-900 font-black text-[10px] flex items-center justify-center shadow-2xs" title="Mañana (06:00 - 14:00)">M</span>;
                                                    } else if (shift?.shift === 'tarde') {
                                                        badge = <span className="size-6 rounded-md bg-sky-100 text-sky-900 font-black text-[10px] flex items-center justify-center shadow-2xs" title="Tarde (14:00 - 22:00)">T</span>;
                                                    } else if (shift?.shift === 'noche') {
                                                        badge = <span className="size-6 rounded-md bg-indigo-100 text-indigo-900 font-black text-[10px] flex items-center justify-center shadow-2xs" title="Noche (22:00 - 06:00)">N</span>;
                                                    } else {
                                                        badge = <span className="text-slate-200 text-[10px] font-bold">-</span>;
                                                    }

                                                    return (
                                                        <td key={dStr} className={`p-1 text-center border-r border-slate-100 ${isW ? 'bg-indigo-50/20' : ''}`}>
                                                            <div className="flex items-center justify-center">
                                                                {badge}
                                                            </div>
                                                        </td>
                                                    );
                                                })}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}

                        {/* VISTA 3: RESUMEN Y BALANCE */}
                        {solverPreviewTab === 'summary' && (
                            <div className="flex-1 overflow-y-auto space-y-3">
                                <h4 className="text-xs font-black uppercase tracking-wider text-slate-400">Distribución de Guardias por Enfermera/o</h4>
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                                    {nursingProfiles.map(prof => {
                                        const profShifts = solverResult.shifts.filter(s => s.nurse_name.toLowerCase() === prof.name.toLowerCase());
                                        const mCount = profShifts.filter(s => s.shift === 'manana' && s.status === 'programado').length;
                                        const tCount = profShifts.filter(s => s.shift === 'tarde' && s.status === 'programado').length;
                                        const nCount = profShifts.filter(s => s.shift === 'noche' && s.status === 'programado').length;
                                        const fCount = profShifts.filter(s => s.status === 'franco').length;
                                        const totalWork = mCount + tCount + nCount;

                                        return (
                                            <div key={prof.id} className="p-3.5 rounded-2xl border border-slate-200 bg-slate-50/50 space-y-2">
                                                <div className="flex justify-between items-center">
                                                    <div>
                                                        <h5 className="font-black text-slate-800 text-xs">{prof.name}</h5>
                                                        <span className="text-[10px] text-slate-400 font-bold">
                                                            {prof.ciclo_tipo === '6-2_5-1' ? 'Ciclo 6-2 / 5-1' : 'Planilla Externa'}
                                                        </span>
                                                    </div>
                                                    <span className="px-2 py-0.5 rounded-full bg-slate-200 text-slate-700 text-[10px] font-black">
                                                        {totalWork} guardias
                                                    </span>
                                                </div>

                                                <div className="grid grid-cols-4 gap-1.5 text-center text-[10px]">
                                                    <div className="bg-amber-100 text-amber-900 rounded-lg py-1 font-bold">
                                                        <div>M</div>
                                                        <div className="font-black">{mCount}</div>
                                                    </div>
                                                    <div className="bg-sky-100 text-sky-900 rounded-lg py-1 font-bold">
                                                        <div>T</div>
                                                        <div className="font-black">{tCount}</div>
                                                    </div>
                                                    <div className="bg-indigo-100 text-indigo-900 rounded-lg py-1 font-bold">
                                                        <div>N</div>
                                                        <div className="font-black">{nCount}</div>
                                                    </div>
                                                    <div className="bg-emerald-100 text-emerald-900 rounded-lg py-1 font-bold">
                                                        <div>F</div>
                                                        <div className="font-black">{fCount}</div>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {/* Botones de Acción */}
                        <div className="flex gap-2.5 pt-3 border-t border-slate-100 shrink-0">
                            <button
                                type="button"
                                onClick={() => setShowSolverModal(false)}
                                className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs uppercase transition-colors"
                            >
                                Descartar
                            </button>
                            <button
                                type="button"
                                onClick={handleApplySolver}
                                disabled={isSavingSolver}
                                className="flex-1 py-2.5 bg-gradient-to-r from-indigo-600 to-primary text-white font-black rounded-xl text-xs uppercase shadow-md shadow-indigo-500/20 hover:brightness-105 transition-all flex items-center justify-center gap-2"
                            >
                                {isSavingSolver ? (
                                    <>
                                        <span className="animate-spin text-sm">⏳</span>
                                        <span>Guardando en base de datos...</span>
                                    </>
                                ) : (
                                    <>
                                        <span className="material-symbols-outlined text-sm">check_circle</span>
                                        <span>Aplicar y Guardar en Roster</span>
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal de Bloqueos / Indisponibilidades Externas (Andrea, Enzo, Licencias) */}
            {showUnavailModal && (
                <div className="fixed inset-0 z-[130] bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4 animate-fadeIn">
                    <div className="bg-white rounded-3xl p-6 shadow-2xl max-w-lg w-full border border-slate-200 space-y-4">
                        <div className="flex justify-between items-center border-b border-slate-100 pb-3">
                            <div className="flex items-center gap-2">
                                <span className="material-symbols-outlined text-amber-600 text-xl">event_busy</span>
                                <h3 className="text-base font-black text-slate-900">Bloqueos de Disponibilidad Externa</h3>
                            </div>
                            <button 
                                onClick={() => setShowUnavailModal(false)}
                                className="size-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-600"
                            >
                                ✕
                            </button>
                        </div>

                        <p className="text-xs text-slate-500 font-medium">
                            Cargue los días en que Andrea o Enzo no pueden realizar guardias por sus responsabilidades en el hospital o ejército (recibidas aprox. el 28 de cada mes).
                        </p>

                        {/* Formulario de Alta */}
                        <form onSubmit={handleSaveUnavailability} className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl space-y-3">
                            <div className="grid grid-cols-2 gap-2.5">
                                <div>
                                    <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">Personal</label>
                                    <select
                                        value={newUnavail.profile_id}
                                        onChange={e => setNewUnavail({ ...newUnavail, profile_id: e.target.value })}
                                        className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800"
                                    >
                                        {nursingProfiles.map(p => (
                                            <option key={p.id} value={p.id}>{p.name}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">Fecha</label>
                                    <input 
                                        type="date"
                                        value={newUnavail.date}
                                        onChange={e => setNewUnavail({ ...newUnavail, date: e.target.value })}
                                        className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800"
                                        required
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-2.5">
                                <div>
                                    <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">Turno Bloqueado</label>
                                    <select
                                        value={newUnavail.shift}
                                        onChange={e => setNewUnavail({ ...newUnavail, shift: e.target.value as any })}
                                        className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800"
                                    >
                                        <option value="all">Todo el día</option>
                                        <option value="manana">Mañana (06:00 - 14:00)</option>
                                        <option value="tarde">Tarde (14:00 - 22:00)</option>
                                        <option value="noche">Noche (22:00 - 06:00)</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">Motivo</label>
                                    <input 
                                        type="text"
                                        value={newUnavail.reason}
                                        onChange={e => setNewUnavail({ ...newUnavail, reason: e.target.value })}
                                        placeholder="Ej. Planilla Hospital"
                                        className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800"
                                    />
                                </div>
                            </div>

                            <button
                                type="submit"
                                className="w-full py-2 bg-amber-600 hover:bg-amber-700 text-white font-black rounded-xl text-xs uppercase shadow-sm transition-colors"
                            >
                                + Agregar Bloqueo
                            </button>
                        </form>

                        {/* Listado de Bloqueos Activos */}
                        <div className="space-y-2 max-h-48 overflow-y-auto">
                            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">
                                Bloqueos cargados ({unavailabilities.length})
                            </span>
                            {unavailabilities.length === 0 ? (
                                <p className="text-xs text-slate-400 italic">No hay bloqueos externos cargados para este período.</p>
                            ) : (
                                unavailabilities.map((u, i) => (
                                    <div key={u.id || i} className="p-2 bg-slate-50 border border-slate-200 rounded-xl flex justify-between items-center text-xs">
                                        <div>
                                            <span className="font-black text-slate-800">{u.nurse_name}</span>
                                            <span className="text-slate-400 mx-1.5">•</span>
                                            <span className="font-bold text-slate-600">{u.date}</span>
                                            <span className="text-slate-400 mx-1.5">•</span>
                                            <span className="text-[10px] uppercase font-black px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">
                                                {u.shift === 'all' ? 'Todo el día' : u.shift}
                                            </span>
                                            {u.reason && <span className="text-slate-400 italic text-[11px] block">{u.reason}</span>}
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => handleDeleteUnavailability(u.id)}
                                            className="text-rose-500 hover:text-rose-700 text-sm p-1 rounded hover:bg-rose-50"
                                            title="Eliminar bloqueo"
                                        >
                                            ✕
                                        </button>
                                    </div>
                                ))
                            )}
                        </div>

                        <div className="pt-2 border-t border-slate-100">
                            <button
                                type="button"
                                onClick={() => setShowUnavailModal(false)}
                                className="w-full py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs uppercase"
                            >
                                Cerrar
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
