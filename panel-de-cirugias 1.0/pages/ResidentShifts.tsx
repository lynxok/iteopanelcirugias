import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../src/lib/supabase';
import { useAuth } from '../src/lib/AuthContext';
import { AppUser, ResidentShift, ResidentVacation, getResidentLevelForDate } from '../types';

type Tab = 'calendar' | 'vacations' | 'dashboard' | 'my_consents' | 'audit';

// In-memory cache for fast month transitions and instant navigation
const residentShiftsCache: Record<string, {
    residents: AppUser[];
    shifts: ResidentShift[];
    vacations: ResidentVacation[];
    onDutyDoctors: Record<string, any>;
    onDutyTecnicos: Record<string, any>;
    onDutyAnestesistas: Record<string, any>;
    timestamp: number;
}> = {};

// Helpers para fechas
const getLocalStr = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
};

const getWeekStartStr = (d: Date) => {
    const start = new Date(d);
    start.setDate(d.getDate() - d.getDay()); // Domingo
    return getLocalStr(start);
};

// Feriados Nacionales de Argentina 2025 y 2026 (Excluyendo días no laborables optativos como Jueves Santo)
const ARGENTINA_HOLIDAYS = new Set([
    // 2025
    '2025-01-01', // Año Nuevo
    '2025-03-03', // Carnaval
    '2025-03-04', // Carnaval
    '2025-03-24', // Memoria
    '2025-04-02', // Malvinas
    '2025-04-18', // Viernes Santo
    '2025-05-01', // Trabajador
    '2025-05-25', // Rev. de Mayo
    '2025-06-16', // Güemes
    '2025-06-20', // Belgrano
    '2025-07-09', // Independencia
    '2025-08-17', // San Martín
    '2025-10-12', // Diversidad
    '2025-11-24', // Soberanía
    '2025-12-08', // Inmaculada
    '2025-12-25', // Navidad

    // 2026
    '2026-01-01', // Año Nuevo
    '2026-02-16', // Carnaval
    '2026-02-17', // Carnaval
    '2026-03-24', // Memoria
    '2026-04-02', // Malvinas
    '2026-04-03', // Viernes Santo
    '2026-05-01', // Trabajador
    '2026-05-25', // Rev. de Mayo
    '2026-06-15', // Güemes
    '2026-06-20', // Belgrano
    '2026-07-09', // Independencia
    '2026-08-17', // San Martín
    '2026-10-12', // Diversidad
    '2026-11-23', // Soberanía
    '2026-12-08', // Inmaculada
    '2026-12-25', // Navidad
]);

const isHoliday = (date: Date) => {
    return ARGENTINA_HOLIDAYS.has(getLocalStr(date));
};

const getUncoveredHours = (date: Date, intervals: number[][]) => {
    const dayOfWeek = date.getDay(); // 0 = Domingo, 6 = Sábado
    const isWeekendOrHoliday = dayOfWeek === 0 || dayOfWeek === 6 || isHoliday(date);
    
    // Calcular el estado del día anterior para saber a qué hora termina su guardia
    const yesterday = new Date(date);
    yesterday.setDate(date.getDate() - 1);
    const yesterdayDayOfWeek = yesterday.getDay();
    const isYesterdayWeekendOrHoliday = yesterdayDayOfWeek === 0 || yesterdayDayOfWeek === 6 || isHoliday(yesterday);
    
    // Intervalo de la mañana (cierre de la guardia del día anterior)
    const morningEnd = isYesterdayWeekendOrHoliday ? 8 : 7;
    
    // Intervalo de la tarde/noche (inicio de la guardia de hoy)
    const eveningStart = isWeekendOrHoliday ? 8 : 17;
    
    const targets = [
        [0, morningEnd],
        [eveningStart, 24]
    ];
    
    const sorted = [...intervals].sort((a, b) => a[0] - b[0]);
    let merged: number[][] = [];
    if (sorted.length > 0) {
        merged.push([...sorted[0]]);
        for (let i = 1; i < sorted.length; i++) {
            let last = merged[merged.length - 1];
            let curr = sorted[i];
            if (curr[0] <= last[1]) {
                last[1] = Math.max(last[1], curr[1]);
            } else {
                merged.push([...curr]);
            }
        }
    }
    
    let uncovered = 0;
    for (const [tStart, tEnd] of targets) {
        if (tStart >= tEnd) continue;
        let currentPos = tStart;
        for (const [cStart, cEnd] of merged) {
            if (cEnd <= currentPos) continue;
            if (cStart >= tEnd) break;
            
            if (cStart > currentPos) {
                uncovered += cStart - currentPos;
            }
            currentPos = Math.max(currentPos, cEnd);
        }
        if (currentPos < tEnd) {
            uncovered += tEnd - currentPos;
        }
    }
    return uncovered;
};

const getUncoveredSlots = (date: Date, intervals: number[][]) => {
    const dayOfWeek = date.getDay();
    const isWeekendOrHoliday = dayOfWeek === 0 || dayOfWeek === 6 || isHoliday(date);
    
    const yesterday = new Date(date);
    yesterday.setDate(date.getDate() - 1);
    const yesterdayDayOfWeek = yesterday.getDay();
    const isYesterdayWeekendOrHoliday = yesterdayDayOfWeek === 0 || yesterdayDayOfWeek === 6 || isHoliday(yesterday);
    
    const morningEnd = isYesterdayWeekendOrHoliday ? 8 : 7;
    const eveningStart = isWeekendOrHoliday ? 8 : 17;
    
    const targets = [
        [0, morningEnd],
        [eveningStart, 24]
    ];
    
    const sorted = [...intervals].sort((a, b) => a[0] - b[0]);
    let merged: number[][] = [];
    if (sorted.length > 0) {
        merged.push([...sorted[0]]);
        for (let i = 1; i < sorted.length; i++) {
            let last = merged[merged.length - 1];
            let curr = sorted[i];
            if (curr[0] <= last[1]) {
                last[1] = Math.max(last[1], curr[1]);
            } else {
                merged.push([...curr]);
            }
        }
    }
    
    let gaps: string[] = [];
    
    const formatHour = (h: number) => {
        const hh = Math.floor(h);
        const mm = Math.round((h - hh) * 60);
        return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
    };
    
    for (const [tStart, tEnd] of targets) {
        if (tStart >= tEnd) continue;
        let currentPos = tStart;
        for (const [cStart, cEnd] of merged) {
            if (cEnd <= currentPos) continue;
            if (cStart >= tEnd) break;
            
            if (cStart > currentPos) {
                gaps.push(`${formatHour(currentPos)} a ${formatHour(cStart)}`);
            }
            currentPos = Math.max(currentPos, cEnd);
        }
        if (currentPos < tEnd) {
            gaps.push(`${formatHour(currentPos)} a ${formatHour(tEnd)}`);
        }
    }
    return gaps;
};

export default function ResidentShifts() {
    const { user } = useAuth();
    const [activeTab, setActiveTab] = useState<Tab>('calendar');
    const [currentDate, setCurrentDate] = useState(new Date());
    
    // Data
    const [residents, setResidents] = useState<AppUser[]>([]);
    const [shifts, setShifts] = useState<ResidentShift[]>([]);
    const [vacations, setVacations] = useState<ResidentVacation[]>([]);
    
    // OnDuty Configs
    const [onDutyDoctors, setOnDutyDoctors] = useState<Record<string, any>>({});
    const [onDutyTecnicos, setOnDutyTecnicos] = useState<Record<string, any>>({});
    const [onDutyAnestesistas, setOnDutyAnestesistas] = useState<Record<string, any>>({});
    
    const canEdit = user?.role === 'SuperAdmin' || (user?.role === 'Residente' && user?.can_edit_shifts) || user?.role === 'Administrativo' || user?.role === 'Administrativo de Guardias';
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchData();
    }, [currentDate.getFullYear(), currentDate.getMonth()]);

    const fetchData = async (forceRefresh = false) => {
        const year = currentDate.getFullYear();
        const month = currentDate.getMonth();
        const cacheKey = `${year}-${month}`;

        if (!forceRefresh && residentShiftsCache[cacheKey]) {
            const cached = residentShiftsCache[cacheKey];
            setResidents(cached.residents);
            setShifts(cached.shifts);
            setVacations(cached.vacations);
            setOnDutyDoctors(cached.onDutyDoctors);
            setOnDutyTecnicos(cached.onDutyTecnicos);
            setOnDutyAnestesistas(cached.onDutyAnestesistas);
            setLoading(false);
            if (Date.now() - cached.timestamp < 30000) {
                return;
            }
        } else {
            setLoading(true);
        }

        try {
            const startDate = new Date(year, month, 1);
            const startStr = startDate.toISOString();
            const endStr = new Date(year, month + 1, 1).toISOString();

            // Fetch all required data in parallel
            const [resRes, shiftRes, vacRes, onDutyRes] = await Promise.all([
                supabase
                    .from('users')
                    .select('id, name, email, can_edit_shifts, resident_level, resident_level_history, role, does_guardias_medicas')
                    .eq('active', true)
                    .or('role.eq.Residente,and(role.eq.Medico,does_guardias_medicas.eq.true)'),
                supabase
                    .from('resident_shifts')
                    .select('*, users!resident_id(name)')
                    .gte('start_time', startStr)
                    .lt('start_time', endStr),
                supabase
                    .from('resident_vacations')
                    .select('*, users!resident_id(name)')
                    .gte('end_date', startStr.split('T')[0]),
                supabase
                    .from('admin_settings')
                    .select('key, value')
                    .in('key', ['on_duty_doctors', 'on_duty_tecnicos', 'on_duty_anestesistas'])
            ]);

            const newResidents = (resRes.data || []) as unknown as AppUser[];
            setResidents(newResidents);

            const formattedShifts = (shiftRes.data || []).map((s: any) => ({
                ...s,
                resident: { name: s.users?.name || 'Desconocido', full_name: s.users?.name }
            }));
            setShifts(formattedShifts);

            const formattedVacs = (vacRes.data || []).map((v: any) => ({
                ...v,
                resident: { name: v.users?.name || 'Desconocido', full_name: v.users?.name }
            }));
            setVacations(formattedVacs);

            let newOnDutyDoctors = {};
            let newOnDutyTecnicos = {};
            let newOnDutyAnestesistas = {};

            if (onDutyRes.data) {
                const docConf = onDutyRes.data.find(d => d.key === 'on_duty_doctors');
                if (docConf?.value) newOnDutyDoctors = JSON.parse(docConf.value);
                
                const tecConf = onDutyRes.data.find(d => d.key === 'on_duty_tecnicos');
                if (tecConf?.value) newOnDutyTecnicos = JSON.parse(tecConf.value);
                
                const aneConf = onDutyRes.data.find(d => d.key === 'on_duty_anestesistas');
                if (aneConf?.value) newOnDutyAnestesistas = JSON.parse(aneConf.value);

                setOnDutyDoctors(newOnDutyDoctors);
                setOnDutyTecnicos(newOnDutyTecnicos);
                setOnDutyAnestesistas(newOnDutyAnestesistas);
            }

            // Save in cache
            residentShiftsCache[cacheKey] = {
                residents: newResidents,
                shifts: formattedShifts,
                vacations: formattedVacs,
                onDutyDoctors: newOnDutyDoctors,
                onDutyTecnicos: newOnDutyTecnicos,
                onDutyAnestesistas: newOnDutyAnestesistas,
                timestamp: Date.now()
            };
        } catch (err) {
            console.error('Error fetching resident shifts data:', err);
        } finally {
            setLoading(false);
        }
    };

    // Helper functions para obtener responsables del quirófano
    const getOnDutyPerson = (date: Date, config: Record<string, any>, defaultKey: string) => {
        const weekStartStr = getWeekStartStr(date);
        const dateStr = getLocalStr(date);
        const weekConf = config[weekStartStr];
        if (!weekConf) return null;
        if (weekConf.overrides && dateStr in weekConf.overrides) return weekConf.overrides[dateStr];
        return weekConf[defaultKey] || null;
    };

    return (
        <div className="flex flex-col h-full bg-slate-50 relative animate-fadeIn p-4 overflow-y-auto">
            <div className="mb-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                        <span className="material-symbols-outlined text-indigo-600 text-3xl">medical_services</span>
                        Gestión de Guardias
                    </h1>
                    <p className="text-sm text-slate-500 mt-1">Módulo exclusivo para residentes y administración</p>
                </div>
            </div>

            {/* Tabs */}
            <div className="flex bg-white rounded-lg p-1 border border-slate-200 shadow-sm w-fit mb-6">
                <button
                    onClick={() => setActiveTab('calendar')}
                    className={`px-4 py-2 text-sm font-bold rounded-md transition-all ${activeTab === 'calendar' ? 'bg-indigo-50 text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'}`}
                >
                    Calendario Mensual
                </button>
                <button
                    onClick={() => setActiveTab('vacations')}
                    className={`px-4 py-2 text-sm font-bold rounded-md transition-all ${activeTab === 'vacations' ? 'bg-indigo-50 text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'}`}
                >
                    Vacaciones y Licencias
                </button>
                <button
                    onClick={() => setActiveTab('dashboard')}
                    className={`px-4 py-2 text-sm font-bold rounded-md transition-all ${activeTab === 'dashboard' ? 'bg-indigo-50 text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'}`}
                >
                    Dashboard Resumen
                </button>
                {user?.role === 'Residente' && (
                    <button
                        onClick={() => setActiveTab('my_consents')}
                        className={`px-4 py-2 text-sm font-bold rounded-md transition-all flex items-center gap-2 ${activeTab === 'my_consents' ? 'bg-indigo-50 text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'}`}
                    >
                        Mis Guardias
                        {shifts.filter((s:any) => s.resident_id === user?.id && s.consent_status === 'pending').length > 0 && (
                            <span className="bg-red-500 text-white text-[10px] px-1.5 py-0.5 rounded-full">
                                {shifts.filter((s:any) => s.resident_id === user?.id && s.consent_status === 'pending').length}
                            </span>
                        )}
                    </button>
                )}
                {user?.role === 'SuperAdmin' && (
                    <button
                        onClick={() => setActiveTab('audit')}
                        className={`px-4 py-2 text-sm font-bold rounded-md transition-all flex items-center gap-2 ${activeTab === 'audit' ? 'bg-indigo-50 text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'}`}
                    >
                        Auditoría
                    </button>
                )}
            </div>

            {loading ? (
                <div className="flex-1 flex justify-center items-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
                </div>
            ) : (
                <>
                    {activeTab === 'calendar' && (
                        <ShiftsCalendarView 
                            currentDate={currentDate} 
                            setCurrentDate={setCurrentDate}
                            shifts={shifts}
                            vacations={vacations}
                            residents={residents}
                            canEdit={canEdit}
                            onDutyDoctors={onDutyDoctors}
                            onDutyTecnicos={onDutyTecnicos}
                            onDutyAnestesistas={onDutyAnestesistas}
                            getOnDutyPerson={getOnDutyPerson}
                            fetchData={fetchData}
                            user={user}
                        />
                    )}
                    {activeTab === 'vacations' && (
                        <VacationsView 
                            vacations={vacations}
                            residents={residents}
                            canEdit={canEdit}
                            fetchData={fetchData}
                        />
                    )}
                    {activeTab === 'dashboard' && (
                        <DashboardStatsView 
                            currentDate={currentDate} 
                            setCurrentDate={setCurrentDate}
                            shifts={shifts}
                            residents={residents}
                            user={user}
                        />
                    )}
                    {activeTab === 'my_consents' && (
                        <MyConsentsView 
                            shifts={shifts}
                            user={user}
                            fetchData={fetchData}
                            vacations={vacations}
                        />
                    )}
                    {activeTab === 'audit' && (
                        <AuditShiftsView 
                            residents={residents}
                        />
                    )}
                </>
            )}
        </div>
    );
}

// -----------------------------------------------------------------------------------------
// VISTAS INTERNAS
// -----------------------------------------------------------------------------------------

function ShiftsCalendarView({ currentDate, setCurrentDate, shifts, vacations, residents, canEdit, onDutyDoctors, onDutyTecnicos, onDutyAnestesistas, getOnDutyPerson, fetchData, user }: any) {
    const [selectedDate, setSelectedDate] = useState<Date | null>(new Date());
    const [showModal, setShowModal] = useState(false);
    const [isMobile, setIsMobile] = useState(window.innerWidth < 1024);

    useEffect(() => {
        const handleResize = () => setIsMobile(window.innerWidth < 1024);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    const isSameDate = (d1: Date, d2: Date) =>
        d1.getDate() === d2.getDate() &&
        d1.getMonth() === d2.getMonth() &&
        d1.getFullYear() === d2.getFullYear();

    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstDayIndex = new Date(year, month, 1).getDay();

    const days = Array.from({ length: daysInMonth }, (_, i) => new Date(year, month, i + 1));
    const blanks = Array.from({ length: firstDayIndex }, (_, i) => i);

    const formatTime = (isoString: string) => {
        const d = new Date(isoString);
        return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    };

    const handlePrevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
    const handleNextMonth = () => setCurrentDate(new Date(year, month + 1, 1));

    const handleDayClick = (date: Date) => {
        setSelectedDate(date);
        if (canEdit && !isMobile) setShowModal(true);
    };

    // Fast O(1) indexed maps for days rendering
    const visualBarsByDate = useMemo(() => {
        const map = new Map<string, any[]>();
        for (const s of shifts) {
            const startD = new Date(s.start_time);
            const endD = new Date(s.end_time);
            const startStr = getLocalStr(startD);
            const endStr = getLocalStr(endD);

            // Add for start day
            if (!map.has(startStr)) map.set(startStr, []);
            let sHr = startD.getHours() + startD.getMinutes() / 60;
            let eHr = (startStr === endStr) ? (endD.getHours() + endD.getMinutes() / 60) : 24;
            map.get(startStr)!.push({
                id: s.id,
                resident: s.resident,
                start_time: s.start_time,
                end_time: s.end_time,
                sHr,
                eHr,
                consent_status: s.consent_status,
                isContinuation: false,
                leftPct: (sHr / 24) * 100,
                widthPct: ((eHr - sHr) / 24) * 100
            });

            // Add continuation for end day if overnight
            if (startStr !== endStr && endD.getHours() > 0) {
                if (!map.has(endStr)) map.set(endStr, []);
                let eHrCont = endD.getHours() + endD.getMinutes() / 60;
                map.get(endStr)!.push({
                    id: s.id,
                    resident: s.resident,
                    start_time: s.start_time,
                    end_time: s.end_time,
                    sHr: 0,
                    eHr: eHrCont,
                    consent_status: s.consent_status,
                    isContinuation: true,
                    leftPct: 0,
                    widthPct: (eHrCont / 24) * 100
                });
            }
        }
        return map;
    }, [shifts]);

    const vacationsByDate = useMemo(() => {
        const map = new Map<string, any[]>();
        for (const v of vacations) {
            if (!v.start_date || !v.end_date) continue;
            // Iterate over vacation days
            const cur = new Date(v.start_date + 'T00:00:00');
            const end = new Date(v.end_date + 'T00:00:00');
            while (cur <= end) {
                const dStr = getLocalStr(cur);
                if (!map.has(dStr)) map.set(dStr, []);
                map.get(dStr)!.push(v);
                cur.setDate(cur.getDate() + 1);
            }
        }
        return map;
    }, [vacations]);

    return (
        <div className="flex flex-col gap-4">
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
                {/* Header del Calendario */}
                <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50">
                    <button onClick={handlePrevMonth} className="p-2 hover:bg-slate-200 rounded-full transition-colors">
                        <span className="material-symbols-outlined">chevron_left</span>
                    </button>
                    <h2 className="text-lg font-bold text-slate-800 capitalize">
                        {currentDate.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })}
                    </h2>
                    <button onClick={handleNextMonth} className="p-2 hover:bg-slate-200 rounded-full transition-colors">
                        <span className="material-symbols-outlined">chevron_right</span>
                    </button>
                </div>

                {/* Grid de días */}
                <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-100">
                    {['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'].map(d => (
                        <div key={d} className="py-2 text-center text-xs font-bold text-slate-500 uppercase">
                            {isMobile ? d[0] : d}
                        </div>
                    ))}
                </div>

                <div className={`grid grid-cols-7 ${isMobile ? 'auto-rows-[minmax(55px,_1fr)]' : 'auto-rows-[minmax(120px,_1fr)]'}`}>
                    {blanks.map(b => (
                        <div key={`blank-${b}`} className="border-r border-b border-slate-100 bg-slate-50/50"></div>
                    ))}
                    
                    {days.map(date => {
                        const dateStr = getLocalStr(date);
                        const isSelected = selectedDate && isSameDate(date, selectedDate);

                        // Obtener barras visuales precalculadas O(1)
                        const visualBars = visualBarsByDate.get(dateStr) || [];

                        // Calcular cobertura de horas para la alerta
                        const uncoveredHrs = getUncoveredHours(date, visualBars.map(b => [b.sHr, b.eHr]));

                        // Responsables
                        const cirujano = getOnDutyPerson(date, onDutyDoctors, 'defaultDoctor');
                        const tecnico = getOnDutyPerson(date, onDutyTecnicos, 'defaultTecnico');
                        const anestesista = getOnDutyPerson(date, onDutyAnestesistas, 'defaultAnestesista');

                        // Check si hay un residente en vacaciones este día O(1)
                        const residentsOnVacation = vacationsByDate.get(dateStr) || [];

                        return (
                            <div 
                                key={dateStr} 
                                onClick={() => handleDayClick(date)}
                                className={`border-r border-b border-slate-200 p-1.5 sm:p-2 flex flex-col transition-colors ${canEdit ? 'cursor-pointer hover:bg-indigo-50/30' : ''} ${isSelected && isMobile ? 'bg-indigo-50/50 ring-2 ring-indigo-600/40' : ''}`}
                            >
                                <span className={`text-xs sm:text-sm font-bold ${date.toDateString() === new Date().toDateString() ? 'bg-indigo-600 text-white rounded-full size-5 sm:size-6 flex items-center justify-center' : 'text-slate-700'}`}>
                                    {date.getDate()}
                                </span>
                                
                                {isMobile ? (
                                    /* Mobile view indicators */
                                    <div className="mt-1 flex flex-wrap gap-0.5 justify-center max-w-full">
                                        {visualBars.map(bar => (
                                            <span key={bar.id} className="size-1.5 rounded-full bg-indigo-600 inline-block" title={bar.resident?.name} />
                                        ))}
                                        {residentsOnVacation.map(v => (
                                            <span key={v.id} className="size-1.5 rounded-full bg-orange-500 inline-block" title={`Vacaciones: ${v.resident?.name}`} />
                                        ))}
                                        {uncoveredHrs > 0 && (
                                            <span className="size-1.5 rounded-full bg-red-600 inline-block animate-pulse" title="Brecha de cobertura" />
                                        )}
                                    </div>
                                ) : (
                                    /* Desktop view detailed components */
                                    <div className="mt-2 flex-1 flex flex-col gap-1.5">
                                        {/* Alerta de Brecha */}
                                        {uncoveredHrs > 0 && (
                                            <div 
                                                className="text-[9px] font-bold text-red-600 bg-red-50 border border-red-200 rounded px-1 py-0.5 text-center flex items-center justify-center gap-1 shadow-sm"
                                                title={`Falta cubrir: ${getUncoveredSlots(date, visualBars.map(b => [b.sHr, b.eHr])).join(', ')}`}
                                            >
                                                <span className="material-symbols-outlined text-[10px]">warning</span>
                                                Brecha: {uncoveredHrs.toFixed(1).replace('.0', '')}h sin cubrir
                                            </div>
                                        )}

                                        {/* Timeline 24h Visual */}
                                        <div className="relative h-6 bg-slate-200 rounded-md overflow-hidden flex shadow-inner mb-1">
                                            {/* Marcadores de hora de fondo (6, 12, 18) */}
                                            {[6, 12, 18].map(h => (
                                                <div key={h} className="absolute top-0 bottom-0 border-l border-slate-300/50 z-0" style={{ left: `${(h/24)*100}%` }}></div>
                                            ))}
                                            {visualBars.map(bar => (
                                                <div 
                                                    key={`${bar.id}-${bar.isContinuation ? 'c' : 's'}`}
                                                    className={`absolute top-0 bottom-0 border-r border-indigo-700/20 text-[8px] font-bold text-white px-1 whitespace-nowrap overflow-hidden flex items-center shadow-sm z-10 transition-all hover:brightness-110 ${bar.isContinuation ? 'bg-indigo-400' : 'bg-indigo-600'}`}
                                                    style={{ left: `${bar.leftPct}%`, width: `${bar.widthPct}%` }}
                                                    title={`${bar.resident?.name} (${formatTime(bar.start_time)} - ${formatTime(bar.end_time)})`}
                                                >
                                                    {bar.widthPct > 15 ? bar.resident?.name?.split(' ')[0] : ''}
                                                </div>
                                            ))}
                                        </div>
                                        
                                        {/* Lista detallada */}
                                        <div className="flex flex-col gap-0.5">
                                            {visualBars.map(bar => (
                                                <div key={`txt-${bar.id}-${bar.isContinuation ? 'c' : 's'}`} className="text-[9px] text-slate-600 truncate leading-tight flex items-center">
                                                    <span className={`w-1.5 h-1.5 inline-block rounded-full mr-1 ${bar.isContinuation ? 'bg-indigo-400' : 'bg-indigo-600'}`}></span>
                                                    {bar.resident?.name} {bar.isContinuation ? `(hasta ${formatTime(bar.end_time)})` : `(${formatTime(bar.start_time)}-${formatTime(bar.end_time)})`}
                                                    {bar.consent_status === 'accepted' ? <span className="ml-1 text-[10px]" title="Aceptada">✅</span> : (bar.consent_status === 'rejected' ? <span className="ml-1 text-[10px]" title="Rechazada">❌</span> : <span className="ml-1 text-[10px]" title="Pendiente de confirmación">⏳</span>)}
                                                </div>
                                            ))}
                                        </div>

                                        {/* Info Quirófano (Solo lectura) */}
                                        {cirujano && (
                                            <div className="text-[10px] text-slate-500 truncate mt-1" title={`Cirujano: ${cirujano.name}`}>
                                                <span className="font-bold text-slate-400">Cir:</span> {cirujano.name}
                                            </div>
                                        )}
                                        {tecnico && (
                                            <div className="text-[10px] text-slate-500 truncate" title={`Inst/Tec: ${tecnico.name}`}>
                                                <span className="font-bold text-slate-400">Inst:</span> {tecnico.name}
                                            </div>
                                        )}
                                        {anestesista && (
                                            <div className="text-[10px] text-slate-500 truncate" title={`Anest: ${anestesista.name}`}>
                                                <span className="font-bold text-slate-400">Ane:</span> {anestesista.name}
                                            </div>
                                        )}

                                        {/* Aviso de vacaciones */}
                                        {residentsOnVacation.map((v: any) => (
                                            <div key={`vac-${v.id}`} className="bg-orange-100 text-orange-800 text-[9px] p-1 rounded font-medium mt-1 truncate">
                                                🌴 {v.resident?.name}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Mobile Daily Details Panel */}
            {isMobile && selectedDate && (
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 space-y-4 animate-in slide-in-from-bottom-2 duration-300">
                    <div className="flex justify-between items-center border-b border-slate-100 pb-3">
                        <h3 className="text-sm font-black text-slate-900 uppercase tracking-wide">
                            Guardias del {selectedDate.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'short' })}
                        </h3>
                        {canEdit && (
                            <button
                                onClick={() => setShowModal(true)}
                                className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-bold text-xs flex items-center gap-1 transition-colors active:scale-95 shadow-sm"
                            >
                                <span className="material-symbols-outlined text-[14px]">add_circle</span>
                                Asignar
                            </button>
                        )}
                    </div>

                    {/* Check Brecha Alerts */}
                    {(() => {
                        const dateStr = getLocalStr(selectedDate);
                        const dayShifts = shifts.filter((s: any) => {
                            const startD = new Date(s.start_time);
                            const endD = new Date(s.end_time);
                            return getLocalStr(startD) === dateStr || (getLocalStr(endD) === dateStr && endD.getHours() > 0);
                        });

                        const visualBars = dayShifts.map((s: any) => {
                            const startD = new Date(s.start_time);
                            const endD = new Date(s.end_time);
                            let sHr = 0, eHr = 24;
                            if (getLocalStr(startD) === dateStr) sHr = startD.getHours() + startD.getMinutes() / 60;
                            if (getLocalStr(endD) === dateStr) eHr = endD.getHours() + endD.getMinutes() / 60;
                            return { sHr, eHr };
                        });

                        const uncoveredHrs = getUncoveredHours(selectedDate, visualBars.map(b => [b.sHr, b.eHr]));

                        if (uncoveredHrs <= 0) return null;
                        const uncoveredSlots = getUncoveredSlots(selectedDate, visualBars.map(b => [b.sHr, b.eHr]));
                        return (
                            <div className="p-3 bg-red-50 border border-red-100 rounded-xl flex flex-col gap-1">
                                <div className="flex items-center gap-2.5">
                                    <span className="material-symbols-outlined text-red-600 font-bold">warning</span>
                                    <p className="text-[11px] font-bold text-red-700">
                                        Brecha de Cobertura: {uncoveredHrs.toFixed(1).replace('.0', '')} horas sin cubrir.
                                    </p>
                                </div>
                                <p className="text-[10px] text-red-600 font-bold ml-8">
                                    Falta cubrir: {uncoveredSlots.join(', ')}
                                </p>
                            </div>
                        );
                    })()}

                    {/* Staff on Duty Banner */}
                    {(() => {
                        const cirujano = getOnDutyPerson(selectedDate, onDutyDoctors, 'defaultDoctor');
                        const tecnico = getOnDutyPerson(selectedDate, onDutyTecnicos, 'defaultTecnico');
                        const anestesista = getOnDutyPerson(selectedDate, onDutyAnestesistas, 'defaultAnestesista');

                        if (!cirujano && !tecnico && !anestesista) return null;
                        return (
                            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                                <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Responsables Quirófano</h4>
                                <div className="grid grid-cols-1 gap-1.5 text-xs">
                                    {cirujano && (
                                        <div className="flex items-center gap-1.5 font-bold text-slate-700">
                                            <span className="material-symbols-outlined text-xs text-rose-500 font-bold">stethoscope</span>
                                            <span className="text-slate-400 font-semibold">Cirujano:</span> {cirujano.name}
                                        </div>
                                    )}
                                    {anestesista && (
                                        <div className="flex items-center gap-1.5 font-bold text-slate-700">
                                            <span className="material-symbols-outlined text-xs text-indigo-500 font-bold">air</span>
                                            <span className="text-slate-400 font-semibold">Anestesista:</span> {anestesista.name}
                                        </div>
                                    )}
                                    {tecnico && (
                                        <div className="flex items-center gap-1.5 font-bold text-slate-700">
                                            <span className="material-symbols-outlined text-xs text-emerald-500 font-bold">healing</span>
                                            <span className="text-slate-400 font-semibold">Instrum.:</span> {tecnico.name}
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })()}

                    {/* Resident Guards List */}
                    <div className="space-y-2.5">
                        <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Residentes Asignados</h4>
                        {(() => {
                            const dateStr = getLocalStr(selectedDate);
                            const dayShifts = shifts.filter((s: any) => {
                                const startD = new Date(s.start_time);
                                const endD = new Date(s.end_time);
                                return getLocalStr(startD) === dateStr || (getLocalStr(endD) === dateStr && endD.getHours() > 0);
                            });

                            if (dayShifts.length === 0) {
                                return (
                                    <div className="text-center py-6 text-xs text-slate-400 font-bold italic uppercase tracking-wider bg-slate-50 rounded-xl border border-dashed border-slate-100">
                                        Sin residentes asignados
                                    </div>
                                );
                            }

                            return dayShifts.map((s: any) => {
                                const startD = new Date(s.start_time);
                                const endD = new Date(s.end_time);
                                const isCont = getLocalStr(startD) !== dateStr;

                                return (
                                    <div key={s.id} className="p-3 bg-white rounded-xl border border-slate-200 flex justify-between items-center">
                                        <div>
                                            <p className="text-sm font-black text-slate-800">{s.resident?.name}</p>
                                            <p className="text-xs font-semibold text-slate-500 mt-0.5">
                                                {isCont ? `Continúa hasta ${formatTime(s.end_time)}` : `${formatTime(s.start_time)} - ${formatTime(s.end_time)}`}
                                            </p>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            {s.consent_status === 'accepted' ? (
                                                <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full text-[9px] font-bold uppercase tracking-tight">Aceptada</span>
                                            ) : s.consent_status === 'rejected' ? (
                                                <span className="px-2 py-0.5 bg-red-50 text-red-700 border border-red-200 rounded-full text-[9px] font-bold uppercase tracking-tight">Rechazada</span>
                                            ) : (
                                                <span className="px-2 py-0.5 bg-amber-50 text-amber-700 border border-amber-200 rounded-full text-[9px] font-bold uppercase tracking-tight">Pendiente</span>
                                            )}
                                            {canEdit && (
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setShowModal(true);
                                                    }}
                                                    className="p-1 text-indigo-600 hover:bg-indigo-50 rounded transition-colors"
                                                    title="Editar esta guardia"
                                                >
                                                    <span className="material-symbols-outlined text-sm font-bold">edit</span>
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                );
                            });
                        })()}
                    </div>

                    {/* Vacations Section */}
                    {(() => {
                        const dateStr = getLocalStr(selectedDate);
                        const dayVacations = vacations.filter((v: any) => dateStr >= v.start_date && dateStr <= v.end_date);

                        if (dayVacations.length === 0) return null;
                        return (
                            <div className="space-y-2">
                                <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Licencias / Vacaciones</h4>
                                <div className="grid grid-cols-1 gap-2">
                                    {dayVacations.map((v: any) => (
                                        <div key={v.id} className="p-2.5 bg-orange-50 border border-orange-100 rounded-xl text-xs font-bold text-orange-900 flex items-center gap-2">
                                            <span>🌴</span>
                                            <span>{v.resident?.name} (del {v.start_date} al {v.end_date})</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        );
                    })()}
                </div>
            )}

            {showModal && selectedDate && (
                <ShiftAssignModal 
                    date={selectedDate} 
                    onClose={() => {
                        setShowModal(false);
                        fetchData();
                    }}
                    shifts={shifts}
                    residents={residents}
                    vacations={vacations}
                    user={canEdit ? user : null}
                />
            )}
        </div>
    );
}

// -----------------------------------------------------------------------------------------

function ShiftAssignModal({ date, onClose, shifts, residents, vacations, user }: any) {
    const [localShifts, setLocalShifts] = useState<any[]>(shifts);
    const [selectedResident, setSelectedResident] = useState('');
    const [editingShiftId, setEditingShiftId] = useState<string | null>(null);
    
    // Si es fin de semana o feriado, por defecto sugerimos inicio 08:00 con 12hs.
    // Si es día de semana normal, por defecto sugerimos inicio 17:00 con 14hs (hasta las 07:00 del día siguiente).
    const dayOfWeek = date.getDay();
    const isWeekendOrHoliday = dayOfWeek === 0 || dayOfWeek === 6 || isHoliday(date);
    const defaultStartTime = isWeekendOrHoliday ? '08:00' : '17:00';
    const defaultDuration = isWeekendOrHoliday ? 12 : 14;

    const [startTime, setStartTime] = useState(defaultStartTime);
    const [durationHrs, setDurationHrs] = useState(defaultDuration);
    const [saving, setSaving] = useState(false);

    const dateStr = getLocalStr(date);
    const dayShifts = localShifts.filter((s: any) => getLocalStr(new Date(s.start_time)) === dateStr);

    const handleAssign = async () => {
        if (!selectedResident) return alert('Seleccione un residente.');
        
        // 1. Limite de 2 por día (excluyendo la que estamos editando)
        const activeDayShifts = dayShifts.filter((s: any) => s.id !== editingShiftId);
        if (activeDayShifts.length >= 2) return alert('Máximo 2 residentes de guardia por día.');

        // 2. Validar Vacaciones
        const onVacation = vacations.find((v: any) => v.resident_id === selectedResident && dateStr >= v.start_date && dateStr <= v.end_date);
        if (onVacation) return alert('El residente seleccionado se encuentra de vacaciones en esta fecha.');

        // 3. Crear fechas
        const startDateTime = new Date(`${dateStr}T${startTime}:00`);
        const endDateTime = new Date(startDateTime.getTime() + durationHrs * 60 * 60 * 1000);

        // 4. Validar Descanso de 16 hs (excluyendo la que estamos editando)
        const resShifts = localShifts.filter((s: any) => s.resident_id === selectedResident && s.id !== editingShiftId);
        for (const s of resShifts) {
            const pastEnd = new Date(s.end_time);
            const futureStart = new Date(s.start_time);
            
            const pastEndPlus16 = new Date(pastEnd.getTime() + 16 * 60 * 60 * 1000);
            const futureStartMinus16 = new Date(futureStart.getTime() - 16 * 60 * 60 * 1000);

            if (startDateTime >= pastEnd && startDateTime < pastEndPlus16) {
                if (!confirm(`Advertencia: El residente no cumple con las 16 hs de descanso. Su última guardia finaliza el ${pastEnd.toLocaleString()}. ¿Desea continuar de todos modos?`)) {
                    return;
                }
            }
            if (endDateTime <= futureStart && endDateTime > futureStartMinus16) {
                if (!confirm(`Advertencia: El residente no cumple con las 16 hs de descanso. Su siguiente guardia comienza el ${futureStart.toLocaleString()}. ¿Desea continuar de todos modos?`)) {
                    return;
                }
            }
            if ((startDateTime >= futureStart && startDateTime < pastEnd) || (endDateTime > futureStart && endDateTime <= pastEnd)) {
                return alert('La guardia se superpone con otra ya existente.');
            }
        }

        setSaving(true);
        try {
            const assignedRes = residents.find((r: any) => r.id === selectedResident);
            const consentStatus = assignedRes?.can_edit_shifts ? 'accepted' : 'pending';
            const consentDate = assignedRes?.can_edit_shifts ? new Date().toISOString() : null;

            if (editingShiftId) {
                const { data: updatedShift, error } = await supabase
                    .from('resident_shifts')
                    .update({
                        resident_id: selectedResident,
                        start_time: startDateTime.toISOString(),
                        end_time: endDateTime.toISOString(),
                        consent_status: consentStatus,
                        consent_date: consentDate,
                    })
                    .eq('id', editingShiftId)
                    .select('*, users!resident_id(name)').single();

                if (error) throw error;

                const formattedShift = {
                    ...updatedShift,
                    resident: { name: updatedShift.users?.name || 'Desconocido', full_name: updatedShift.users?.name }
                };
                setLocalShifts(prev => prev.map(s => s.id === editingShiftId ? formattedShift : s));
                setEditingShiftId(null);
                setSelectedResident('');
                setStartTime(defaultStartTime);
                setDurationHrs(defaultDuration);
            } else {
                const { data: newShift, error } = await supabase.from('resident_shifts').insert({
                    resident_id: selectedResident,
                    start_time: startDateTime.toISOString(),
                    end_time: endDateTime.toISOString(),
                    consent_status: consentStatus,
                    consent_date: consentDate,
                    created_by: user?.id
                }).select('*, users!resident_id(name)').single();
                
                if (error) throw error;

                const formattedNewShift = {
                    ...newShift,
                    resident: { name: newShift.users?.name || 'Desconocido', full_name: newShift.users?.name }
                };
                setLocalShifts(prev => [...prev, formattedNewShift]);
                setSelectedResident('');
                setStartTime(defaultStartTime);
                setDurationHrs(defaultDuration);
            }
        } catch (err: any) {
            console.error(err);
            alert('Error al guardar guardia: ' + err.message);
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('¿Eliminar esta guardia?')) return;
        try {
            const { error } = await supabase.from('resident_shifts').delete().eq('id', id);
            if (error) throw error;
            setLocalShifts(prev => prev.filter(s => s.id !== id));
            if (editingShiftId === id) {
                setEditingShiftId(null);
                setSelectedResident('');
            }
        } catch (err) {
            alert('Error al eliminar.');
        }
    };

    const handleEditClick = (s: any) => {
        setEditingShiftId(s.id);
        setSelectedResident(s.resident_id);
        const startD = new Date(s.start_time);
        const hh = String(startD.getHours()).padStart(2, '0');
        const mm = String(startD.getMinutes()).padStart(2, '0');
        setStartTime(`${hh}:${mm}`);
        const duration = Math.round((new Date(s.end_time).getTime() - startD.getTime()) / (1000 * 60 * 60));
        setDurationHrs(duration);
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4 animate-fadeIn">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col">
                <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50 rounded-t-2xl">
                    <h3 className="text-lg font-bold text-slate-900">
                        Guardias: {date.toLocaleDateString()}
                    </h3>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
                        <span className="material-symbols-outlined">close</span>
                    </button>
                </div>
                
                <div className="p-4 space-y-4">
                    <div className="space-y-2">
                        <h4 className="text-xs font-bold text-slate-500 uppercase">Guardias Asignadas ({dayShifts.length}/2)</h4>
                        {dayShifts.length === 0 && <p className="text-sm text-slate-400 italic">No hay residentes asignados.</p>}
                        {dayShifts.map((s: any) => (
                            <div key={s.id} className="flex justify-between items-center bg-indigo-50 p-2 rounded border border-indigo-100">
                                <div>
                                    <p className="text-sm font-bold text-indigo-900">{s.resident?.name}</p>
                                    <p className="text-xs text-indigo-700">
                                        {new Date(s.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - {new Date(s.end_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    </p>
                                </div>
                                <div className="flex gap-1.5">
                                    <button onClick={() => handleEditClick(s)} className="text-indigo-600 hover:bg-indigo-150 p-1 rounded transition-colors" title="Editar guardia">
                                        <span className="material-symbols-outlined text-sm">edit</span>
                                    </button>
                                    <button onClick={() => handleDelete(s.id)} className="text-red-500 hover:bg-red-100 p-1 rounded transition-colors" title="Eliminar guardia">
                                        <span className="material-symbols-outlined text-sm">delete</span>
                                    </button>
                                </div>
                            </div>
                        ))}
                        {(() => {
                            const intervals = dayShifts.map((s: any) => {
                                const startD = new Date(s.start_time);
                                const endD = new Date(s.end_time);
                                let sHr = 0, eHr = 24;
                                if (getLocalStr(startD) === dateStr) sHr = startD.getHours() + startD.getMinutes() / 60;
                                if (getLocalStr(endD) === dateStr) eHr = endD.getHours() + endD.getMinutes() / 60;
                                return [sHr, eHr];
                            });
                            const uncoveredSlots = getUncoveredSlots(date, intervals);
                            if (uncoveredSlots.length === 0) return null;
                            return (
                                <div className="mt-2 p-2.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 font-bold flex items-center gap-1.5 shadow-sm">
                                    <span className="material-symbols-outlined text-sm">warning</span>
                                    <span>Falta cubrir: {uncoveredSlots.join(', ')}</span>
                                </div>
                            );
                        })()}
                    </div>
 
                    {(dayShifts.length < 2 || editingShiftId) && (
                        <div className="border-t border-slate-200 pt-4 space-y-3">
                            <h4 className="text-xs font-bold text-slate-500 uppercase">
                                {editingShiftId ? 'Editar Guardia' : 'Nueva Asignación'}
                            </h4>
                            <div>
                                <label className="block text-xs font-bold text-slate-700 mb-1">Residente</label>
                                <select 
                                    className="w-full border-slate-300 rounded-lg text-sm"
                                    value={selectedResident}
                                    onChange={e => setSelectedResident(e.target.value)}
                                >
                                    <option value="">Seleccione...</option>
                                    {residents.map((r: any) => {
                                        const activeLevel = r.role === 'Medico' ? null : getResidentLevelForDate(r, date);
                                        return (
                                            <option key={r.id} value={r.id}>
                                                {r.name} {r.role === 'Medico' ? '(Médico de Guardia)' : `(Residente ${activeLevel || ''})`}
                                            </option>
                                        );
                                    })}
                                </select>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs font-bold text-slate-700 mb-1">Hora Inicio</label>
                                    <input 
                                        type="time" 
                                        className="w-full border-slate-300 rounded-lg text-sm"
                                        value={startTime}
                                        onChange={e => setStartTime(e.target.value)}
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-700 mb-1">Duración</label>
                                    <select 
                                        className="w-full border-slate-300 rounded-lg text-sm"
                                        value={durationHrs}
                                        onChange={e => setDurationHrs(Number(e.target.value))}
                                    >
                                        <option value={12}>12 Horas</option>
                                        <option value={14}>14 Horas</option>
                                        <option value={24}>24 Horas</option>
                                    </select>
                                </div>
                            </div>
                            <div className="flex gap-2">
                                {editingShiftId && (
                                    <button 
                                        onClick={() => {
                                            setEditingShiftId(null);
                                            setSelectedResident('');
                                            setStartTime(defaultStartTime);
                                            setDurationHrs(defaultDuration);
                                        }}
                                        className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-2 rounded-lg text-sm mt-2 transition-colors border border-slate-200"
                                    >
                                        Cancelar
                                    </button>
                                )}
                                <button 
                                    onClick={handleAssign}
                                    disabled={saving}
                                    className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 rounded-lg text-sm mt-2 transition-colors disabled:opacity-50"
                                >
                                    {editingShiftId ? 'Guardar Cambios' : 'Asignar Guardia'}
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

// -----------------------------------------------------------------------------------------

function VacationsView({ vacations, residents, canEdit, fetchData }: any) {
    const [selectedResident, setSelectedResident] = useState('');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');

    const handleAdd = async () => {
        if (!selectedResident || !startDate || !endDate) return alert('Complete todos los campos');
        if (endDate < startDate) return alert('La fecha de fin no puede ser menor a la de inicio.');

        try {
            const { error } = await supabase.from('resident_vacations').insert({
                resident_id: selectedResident,
                start_date: startDate,
                end_date: endDate
            });
            if (error) throw error;
            setStartDate('');
            setEndDate('');
            setSelectedResident('');
            fetchData();
            alert('Vacaciones registradas correctamente.');
        } catch (err) {
            alert('Error al registrar.');
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Eliminar registro?')) return;
        await supabase.from('resident_vacations').delete().eq('id', id);
        fetchData();
    };

    return (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 flex flex-col md:flex-row gap-8">
            <div className="flex-1 space-y-4">
                <h3 className="text-lg font-bold text-slate-800">Registros de Vacaciones</h3>
                {vacations.length === 0 && <p className="text-slate-500 text-sm">No hay vacaciones registradas.</p>}
                <div className="space-y-2">
                    {vacations.map((v: any) => (
                        <div key={v.id} className="flex justify-between items-center p-3 bg-orange-50 border border-orange-100 rounded-lg">
                            <div>
                                <p className="font-bold text-orange-900">{v.resident?.name}</p>
                                <p className="text-xs text-orange-700">Del {v.start_date} al {v.end_date}</p>
                            </div>
                            {canEdit && (
                                <button onClick={() => handleDelete(v.id)} className="text-red-500 hover:bg-red-100 p-2 rounded">
                                    <span className="material-symbols-outlined text-sm">delete</span>
                                </button>
                            )}
                        </div>
                    ))}
                </div>
            </div>

            {canEdit && (
                <div className="w-full md:w-80 bg-slate-50 p-4 rounded-xl border border-slate-200 h-fit">
                    <h3 className="text-sm font-bold text-slate-800 mb-4">Cargar Nueva Licencia</h3>
                    <div className="space-y-3">
                        <div>
                            <label className="block text-xs font-bold text-slate-700 mb-1">Residente</label>
                            <select className="w-full border-slate-300 rounded-lg text-sm" value={selectedResident} onChange={e => setSelectedResident(e.target.value)}>
                                <option value="">Seleccione...</option>
                                {residents.map((r: any) => <option key={r.id} value={r.id}>{r.name}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-700 mb-1">Desde</label>
                            <input type="date" className="w-full border-slate-300 rounded-lg text-sm" value={startDate} onChange={e => setStartDate(e.target.value)} />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-700 mb-1">Hasta</label>
                            <input type="date" className="w-full border-slate-300 rounded-lg text-sm" value={endDate} onChange={e => setEndDate(e.target.value)} />
                        </div>
                        <button onClick={handleAdd} className="w-full bg-orange-600 hover:bg-orange-700 text-white font-bold py-2 rounded-lg text-sm mt-2 transition-colors">
                            Registrar Vacaciones
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

// -----------------------------------------------------------------------------------------

function DashboardStatsView({ currentDate, setCurrentDate, shifts, residents, user }: any) {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    const handlePrevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
    const handleNextMonth = () => setCurrentDate(new Date(year, month + 1, 1));

    // Si el usuario es Residente, solo mostramos sus propios datos
    const displayResidents = user?.role === 'Residente'
        ? residents.filter((r: any) => r.id === user.id)
        : residents;

    // Calculate metrics
    const stats = displayResidents.map((r: any) => {
        const activeLevel = r.role === 'Medico' ? null : getResidentLevelForDate(r, currentDate);
        const rShifts = shifts.filter((s: any) => s.resident_id === r.id);
        const hours12 = rShifts.filter((s: any) => {
            const h = (new Date(s.end_time).getTime() - new Date(s.start_time).getTime()) / (1000 * 60 * 60);
            return h <= 12;
        }).length;
        const hours24 = rShifts.filter((s: any) => {
            const h = (new Date(s.end_time).getTime() - new Date(s.start_time).getTime()) / (1000 * 60 * 60);
            return h > 12;
        }).length;

        // Requirements mapping
        let req24 = 0;
        let req12 = 0;
        if (activeLevel === 'R1') { req24 = 3; req12 = 5; }
        else if (activeLevel === 'R2') { req24 = 2; req12 = 6; }
        else if (activeLevel === 'R3') { req24 = 2; req12 = 4; }
        else if (activeLevel === 'R4') { req24 = 1; req12 = 5; }

        const meetsRequirements = (req24 === 0 && req12 === 0) ? null : (hours12 >= req12 && hours24 >= req24);

        return {
            id: r.id,
            name: r.name,
            resident_level: activeLevel,
            totalShifts: rShifts.length,
            hours12,
            hours24,
            req12,
            req24,
            meetsRequirements
        };
    }).sort((a: any, b: any) => b.totalShifts - a.totalShifts);

    return (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col animate-fadeIn">
            <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50">
                <button onClick={handlePrevMonth} className="p-2 hover:bg-slate-200 rounded-full transition-colors">
                    <span className="material-symbols-outlined">chevron_left</span>
                </button>
                <h2 className="text-lg font-bold text-slate-800 capitalize">
                    Reporte: {currentDate.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })}
                </h2>
                <button onClick={handleNextMonth} className="p-2 hover:bg-slate-200 rounded-full transition-colors">
                    <span className="material-symbols-outlined">chevron_right</span>
                </button>
            </div>

            <div className="p-6">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-slate-50 border-b border-slate-200">
                                <th className="py-3 px-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Residente</th>
                                <th className="py-3 px-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-center">Nivel</th>
                                <th className="py-3 px-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-center">Total Guardias</th>
                                <th className="py-3 px-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-center">Guardias 12hs</th>
                                <th className="py-3 px-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-center">Guardias 24hs</th>
                                <th className="py-3 px-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-center">Estado Obligatorias</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {stats.map((s: any) => (
                                <tr key={s.id} className="hover:bg-slate-50 transition-colors">
                                    <td className="py-4 px-4 font-medium text-slate-900">{s.name}</td>
                                    <td className="py-4 px-4 text-center">
                                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold ${s.resident_level ? 'bg-orange-50 text-orange-700 border border-orange-200' : 'bg-slate-100 text-slate-400 border border-slate-200'}`}>
                                            {s.resident_level || 'N/A'}
                                        </span>
                                    </td>
                                    <td className="py-4 px-4 text-center">
                                        <span className="inline-flex items-center justify-center bg-indigo-50 border border-indigo-150 text-indigo-700 font-bold px-2.5 py-0.5 rounded-full text-xs">
                                            {s.totalShifts}
                                        </span>
                                    </td>
                                    <td className="py-4 px-4 text-center">
                                        <div className="flex flex-col items-center">
                                            <span className={`font-bold text-sm ${s.req12 > 0 && s.hours12 >= s.req12 ? 'text-emerald-600' : s.req12 > 0 ? 'text-amber-600' : 'text-slate-600'}`}>
                                                {s.hours12} {s.req12 > 0 ? `/ ${s.req12}` : ''}
                                            </span>
                                            {s.req12 > 0 && (
                                                <span className="text-[10px] text-slate-400">
                                                    {s.hours12 >= s.req12 ? 'Cumplido' : `${s.req12 - s.hours12} faltante(s)`}
                                                </span>
                                            )}
                                        </div>
                                    </td>
                                    <td className="py-4 px-4 text-center">
                                        <div className="flex flex-col items-center">
                                            <span className={`font-bold text-sm ${s.req24 > 0 && s.hours24 >= s.req24 ? 'text-emerald-600' : s.req24 > 0 ? 'text-amber-600' : 'text-slate-600'}`}>
                                                {s.hours24} {s.req24 > 0 ? `/ ${s.req24}` : ''}
                                            </span>
                                            {s.req24 > 0 && (
                                                <span className="text-[10px] text-slate-400">
                                                    {s.hours24 >= s.req24 ? 'Cumplido' : `${s.req24 - s.hours24} faltante(s)`}
                                                </span>
                                            )}
                                        </div>
                                    </td>
                                    <td className="py-4 px-4 text-center">
                                        {s.meetsRequirements === null ? (
                                            <span className="text-xs text-slate-400 italic">Sin nivel configurado</span>
                                        ) : s.meetsRequirements ? (
                                            <span className="inline-flex items-center gap-1 bg-emerald-50 border border-emerald-200 text-emerald-700 font-bold px-3 py-1 rounded-full text-xs">
                                                <span className="material-symbols-outlined text-sm font-bold">check_circle</span>
                                                Completo
                                            </span>
                                        ) : (
                                            <span className="inline-flex items-center gap-1 bg-amber-50 border border-amber-200 text-amber-700 font-bold px-3 py-1 rounded-full text-xs">
                                                <span className="material-symbols-outlined text-sm font-bold">pending</span>
                                                En Progreso
                                            </span>
                                        )}
                                    </td>
                                </tr>
                            ))}
                            {stats.length === 0 && (
                                <tr>
                                    <td colSpan={6} className="py-8 text-center text-slate-500 italic">No hay datos para este mes.</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}

// -----------------------------------------------------------------------------------------

function MyConsentsView({ shifts, user, fetchData, vacations }: any) {
    const [showLogModal, setShowLogModal] = useState(false);
    const [shiftToEdit, setShiftToEdit] = useState<any | null>(null);
    const myPendingShifts = shifts.filter((s: any) => s.resident_id === user?.id && s.consent_status === 'pending');
    const myAcceptedShifts = shifts.filter((s: any) => s.resident_id === user?.id && s.consent_status !== 'pending');

    const handleConsent = async (id: string, status: 'accepted' | 'rejected') => {
        try {
            const { error } = await supabase.from('resident_shifts').update({ 
                consent_status: status,
                consent_date: new Date().toISOString()
            }).eq('id', id);
            if (error) throw error;
            await fetchData();
            alert(`Guardia ${status === 'accepted' ? 'aceptada' : 'rechazada'} correctamente.`);
        } catch (err) {
            alert('Error al procesar el consentimiento.');
        }
    };

    return (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 animate-fadeIn">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6 pb-4 border-b border-slate-100">
                <div>
                    <h2 className="text-xl font-black text-slate-800 uppercase tracking-wide">Mis Guardias (Consentimientos)</h2>
                    <p className="text-xs text-slate-500 mt-1">Registra tu horario real o confirma las guardias asignadas por la administración.</p>
                </div>
                <button
                    onClick={() => {
                        setShiftToEdit(null);
                        setShowLogModal(true);
                    }}
                    className="w-full sm:w-auto px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-bold text-sm flex items-center justify-center gap-2 transition-colors active:scale-95 shadow-sm"
                >
                    <span className="material-symbols-outlined text-[18px]">add_circle</span>
                    Registrar Guardia
                </button>
            </div>

            <div className="space-y-6">
                <div>
                    <h3 className="text-sm font-bold text-slate-500 uppercase mb-3 flex items-center gap-2">
                        <span className="material-symbols-outlined text-orange-500">pending_actions</span>
                        Pendientes de Consentimiento ({myPendingShifts.length})
                    </h3>
                    {myPendingShifts.length === 0 && <p className="text-sm text-slate-400 italic">No tienes guardias pendientes de revisión.</p>}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {myPendingShifts.map((s: any) => (
                            <div key={s.id} className="bg-orange-50 border border-orange-200 rounded-lg p-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                                <div>
                                    <p className="font-bold text-orange-900 capitalize">{new Date(s.start_time).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
                                    <p className="text-sm text-orange-800 mt-1">
                                        🕒 {new Date(s.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - {new Date(s.end_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    </p>
                                </div>
                                <div className="flex gap-2 w-full md:w-auto items-center">
                                    <button
                                        onClick={() => {
                                            setShiftToEdit(s);
                                            setShowLogModal(true);
                                        }}
                                        className="p-1.5 text-orange-700 hover:bg-orange-200/60 rounded-lg transition-colors"
                                        title="Modificar horario de guardia"
                                    >
                                        <span className="material-symbols-outlined text-sm font-bold">edit</span>
                                    </button>
                                    <button onClick={() => handleConsent(s.id, 'rejected')} className="flex-1 md:flex-none px-3 py-1.5 text-red-600 bg-white border border-red-200 hover:bg-red-50 rounded text-sm font-bold transition-colors">
                                        Rechazar
                                    </button>
                                    <button onClick={() => handleConsent(s.id, 'accepted')} className="flex-1 md:flex-none px-3 py-1.5 text-white bg-green-600 hover:bg-green-700 rounded text-sm font-bold transition-colors shadow-sm">
                                        Aceptar Guardia
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="pt-6 border-t border-slate-200">
                    <h3 className="text-sm font-bold text-slate-500 uppercase mb-3 flex items-center gap-2">
                        <span className="material-symbols-outlined text-green-500">task_alt</span>
                        Guardias Históricas / Confirmadas
                    </h3>
                    {myAcceptedShifts.length === 0 && <p className="text-sm text-slate-400 italic">No hay registros.</p>}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        {myAcceptedShifts.map((s: any) => (
                            <div key={s.id} className="bg-slate-50 border border-slate-200 rounded-lg p-3 relative group">
                                <div className="flex justify-between items-start">
                                    <p className="font-bold text-slate-700 capitalize">{new Date(s.start_time).toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' })}</p>
                                    <div className="flex items-center gap-1.5">
                                        <button
                                            onClick={() => {
                                                setShiftToEdit(s);
                                                setShowLogModal(true);
                                            }}
                                            className="p-1 text-slate-400 hover:text-indigo-600 hover:bg-slate-200/60 rounded transition-colors"
                                            title="Editar horario"
                                        >
                                            <span className="material-symbols-outlined text-xs font-bold">edit</span>
                                        </button>
                                        {s.consent_status === 'accepted' ? <span className="text-[10px] bg-green-100 text-green-700 px-1.5 rounded font-bold" title={s.consent_date ? `Aceptada el ${new Date(s.consent_date).toLocaleString()}` : ''}>Aceptada</span> : <span className="text-[10px] bg-red-100 text-red-700 px-1.5 rounded font-bold" title={s.consent_date ? `Rechazada el ${new Date(s.consent_date).toLocaleString()}` : ''}>Rechazada</span>}
                                    </div>
                                </div>
                                <p className="text-xs text-slate-500 mt-1">
                                    {new Date(s.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} a {new Date(s.end_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </p>
                                {s.consent_date && (
                                    <p className="text-[9px] text-slate-400 mt-1 flex items-center gap-1">
                                        <span className="material-symbols-outlined text-[10px]">edit_calendar</span>
                                        Resp. el {new Date(s.consent_date).toLocaleDateString('es-ES', {day: '2-digit', month: 'short'})} a las {new Date(s.consent_date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    </p>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {showLogModal && (
                <LogShiftModal
                    shifts={shifts}
                    user={user}
                    vacations={vacations}
                    myPendingShifts={myPendingShifts}
                    shiftToEdit={shiftToEdit}
                    fetchData={fetchData}
                    onClose={() => {
                        setShowLogModal(false);
                        setShiftToEdit(null);
                        fetchData();
                    }}
                />
            )}
        </div>
    );
}

function LogShiftModal({ onClose, shifts, user, vacations, fetchData, myPendingShifts, shiftToEdit }: any) {
    const [mode, setMode] = useState<'pending' | 'new' | 'edit'>(shiftToEdit ? 'edit' : 'pending');
    const [selectedPendingId, setSelectedPendingId] = useState('');
    const [pendingStartTime, setPendingStartTime] = useState('');
    
    const [newStartTime, setNewStartTime] = useState('');
    const [newEndTime, setNewEndTime] = useState('');
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (shiftToEdit) {
            setMode('edit');
            const formatForInput = (isoStr: string) => {
                if (!isoStr) return '';
                const d = new Date(isoStr);
                const offset = d.getTimezoneOffset();
                const local = new Date(d.getTime() - (offset * 60 * 1000));
                return local.toISOString().slice(0, 16);
            };
            setNewStartTime(formatForInput(shiftToEdit.start_time));
            setNewEndTime(formatForInput(shiftToEdit.end_time));
        }
    }, [shiftToEdit]);

    useEffect(() => {
        if (mode === 'pending' && selectedPendingId) {
            const sh = myPendingShifts.find((s: any) => s.id === selectedPendingId);
            if (sh) {
                const d = new Date(sh.start_time);
                const offset = d.getTimezoneOffset();
                const localDate = new Date(d.getTime() - (offset * 60 * 1000));
                setPendingStartTime(localDate.toISOString().slice(0, 16));
            }
        } else if (mode === 'pending') {
            setPendingStartTime('');
        }
    }, [selectedPendingId, mode]);

    const handleDeleteShift = async () => {
        if (!shiftToEdit?.id) return;
        if (!confirm('¿Está seguro de eliminar este registro de guardia?')) return;
        setSaving(true);
        try {
            const { error } = await supabase.from('resident_shifts').delete().eq('id', shiftToEdit.id);
            if (error) throw error;
            alert('Guardia eliminada correctamente.');
            onClose();
        } catch (err: any) {
            alert('Error al eliminar: ' + err.message);
        } finally {
            setSaving(false);
        }
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            if (mode === 'pending') {
                if (!selectedPendingId) return alert('Seleccione una guardia pendiente.');
                if (!pendingStartTime) return alert('Seleccione la hora de inicio.');
                
                const selectedPending = myPendingShifts.find((s: any) => s.id === selectedPendingId);
                const duration = new Date(selectedPending.end_time).getTime() - new Date(selectedPending.start_time).getTime();
                const startDateTime = new Date(pendingStartTime);
                const endDateTime = new Date(startDateTime.getTime() + duration);

                // Validar descanso
                const otherShifts = shifts.filter((s: any) => s.resident_id === user.id && s.id !== selectedPendingId);
                for (const s of otherShifts) {
                    const pastEnd = new Date(s.end_time);
                    const futureStart = new Date(s.start_time);
                    const pastEndPlus16 = new Date(pastEnd.getTime() + 16 * 60 * 60 * 1000);
                    const futureStartMinus16 = new Date(futureStart.getTime() - 16 * 60 * 60 * 1000);

                    if (startDateTime >= pastEnd && startDateTime < pastEndPlus16) {
                        if (!confirm(`Advertencia: No cumples con las 16 hs de descanso. Tu última guardia finaliza el ${pastEnd.toLocaleString()}. ¿Deseas continuar de todos modos?`)) {
                            return;
                        }
                    }
                    if (endDateTime <= futureStart && endDateTime > futureStartMinus16) {
                        if (!confirm(`Advertencia: No cumples con las 16 hs de descanso. Tienes una guardia que comienza el ${futureStart.toLocaleString()}. ¿Deseas continuar de todos modos?`)) {
                            return;
                        }
                    }
                    if ((startDateTime >= futureStart && startDateTime < pastEnd) || (endDateTime > futureStart && endDateTime <= pastEnd)) {
                        return alert('La guardia se superpone con otra ya existente.');
                    }
                }

                const { error } = await supabase.from('resident_shifts').update({
                    start_time: startDateTime.toISOString(),
                    end_time: endDateTime.toISOString(),
                    consent_status: 'accepted',
                    consent_date: new Date().toISOString()
                }).eq('id', selectedPendingId);

                if (error) throw error;
                alert('Guardia confirmada correctamente.');
                onClose();
            } else if (mode === 'edit' && shiftToEdit) {
                if (!newStartTime || !newEndTime) return alert('Complete las fechas y horas de inicio y fin.');
                const startDateTime = new Date(newStartTime);
                const endDateTime = new Date(newEndTime);

                if (endDateTime <= startDateTime) {
                    return alert('La hora de fin debe ser posterior a la de inicio.');
                }

                // Validar vacaciones
                const dateStr = getLocalStr(startDateTime);
                const onVacation = vacations?.find((v: any) => v.resident_id === user.id && dateStr >= v.start_date && dateStr <= v.end_date);
                if (onVacation) return alert('Te encuentras de vacaciones en esta fecha.');

                // Validar descanso excluyendo la guardia actual
                const otherShifts = shifts.filter((s: any) => s.resident_id === user.id && s.id !== shiftToEdit.id);
                for (const s of otherShifts) {
                    const pastEnd = new Date(s.end_time);
                    const futureStart = new Date(s.start_time);
                    const pastEndPlus16 = new Date(pastEnd.getTime() + 16 * 60 * 60 * 1000);
                    const futureStartMinus16 = new Date(futureStart.getTime() - 16 * 60 * 60 * 1000);

                    if (startDateTime >= pastEnd && startDateTime < pastEndPlus16) {
                        if (!confirm(`Advertencia: No cumples con las 16 hs de descanso. Tu última guardia finaliza el ${pastEnd.toLocaleString()}. ¿Deseas continuar de todos modos?`)) {
                            return;
                        }
                    }
                    if (endDateTime <= futureStart && endDateTime > futureStartMinus16) {
                        if (!confirm(`Advertencia: No cumples con las 16 hs de descanso. Tienes una guardia que comienza el ${futureStart.toLocaleString()}. ¿Deseas continuar de todos modos?`)) {
                            return;
                        }
                    }
                    if ((startDateTime >= futureStart && startDateTime < pastEnd) || (endDateTime > futureStart && endDateTime <= pastEnd)) {
                        return alert('La guardia se superpone con otra ya existente.');
                    }
                }

                const { error } = await supabase.from('resident_shifts').update({
                    start_time: startDateTime.toISOString(),
                    end_time: endDateTime.toISOString(),
                    consent_status: 'accepted',
                    consent_date: new Date().toISOString()
                }).eq('id', shiftToEdit.id);

                if (error) throw error;
                alert('Guardia modificada correctamente.');
                onClose();
            } else {
                if (!newStartTime || !newEndTime) return alert('Complete las fechas y horas de inicio y fin.');
                const startDateTime = new Date(newStartTime);
                const endDateTime = new Date(newEndTime);

                if (endDateTime <= startDateTime) {
                    return alert('La hora de fin debe ser posterior a la de inicio.');
                }

                // Validar vacaciones
                const dateStr = getLocalStr(startDateTime);
                const onVacation = vacations?.find((v: any) => v.resident_id === user.id && dateStr >= v.start_date && dateStr <= v.end_date);
                if (onVacation) return alert('Te encuentras de vacaciones en esta fecha.');

                // Validar descanso
                const otherShifts = shifts.filter((s: any) => s.resident_id === user.id);
                for (const s of otherShifts) {
                    const pastEnd = new Date(s.end_time);
                    const futureStart = new Date(s.start_time);
                    const pastEndPlus16 = new Date(pastEnd.getTime() + 16 * 60 * 60 * 1000);
                    const futureStartMinus16 = new Date(futureStart.getTime() - 16 * 60 * 60 * 1000);

                    if (startDateTime >= pastEnd && startDateTime < pastEndPlus16) {
                        if (!confirm(`Advertencia: No cumples con las 16 hs de descanso. Tu última guardia finaliza el ${pastEnd.toLocaleString()}. ¿Deseas continuar de todos modos?`)) {
                            return;
                        }
                    }
                    if (endDateTime <= futureStart && endDateTime > futureStartMinus16) {
                        if (!confirm(`Advertencia: No cumples con las 16 hs de descanso. Tienes una guardia que comienza el ${futureStart.toLocaleString()}. ¿Deseas continuar de todos modos?`)) {
                            return;
                        }
                    }
                    if ((startDateTime >= futureStart && startDateTime < pastEnd) || (endDateTime > futureStart && endDateTime <= pastEnd)) {
                        return alert('La guardia se superpone con otra ya existente.');
                    }
                }

                const { error } = await supabase.from('resident_shifts').insert({
                    resident_id: user.id,
                    start_time: startDateTime.toISOString(),
                    end_time: endDateTime.toISOString(),
                    consent_status: 'accepted',
                    consent_date: new Date().toISOString(),
                    created_by: user.id
                });

                if (error) throw error;
                alert('Guardia registrada correctamente.');
                onClose();
            }
        } catch (err: any) {
            alert('Error al guardar la guardia: ' + err.message);
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4 animate-fadeIn">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col overflow-hidden">
                <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50">
                    <h3 className="text-lg font-bold text-slate-900 flex items-center gap-1.5">
                        <span className="material-symbols-outlined text-indigo-600">more_time</span>
                        {mode === 'edit' ? 'Modificar Guardia' : 'Registrar mi Guardia'}
                    </h3>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
                        <span className="material-symbols-outlined">close</span>
                    </button>
                </div>
                
                <div className="p-5 space-y-4">
                    {!shiftToEdit && (
                        <div className="flex bg-slate-100 p-1 rounded-lg border border-slate-200">
                            <button
                                type="button"
                                onClick={() => setMode('pending')}
                                className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-all ${mode === 'pending' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                            >
                                Confirmar Pendiente
                            </button>
                            <button
                                type="button"
                                onClick={() => setMode('new')}
                                className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-all ${mode === 'new' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                            >
                                Cargar Nueva Guardia
                            </button>
                        </div>
                    )}

                    {mode === 'pending' ? (
                        <div className="space-y-4 animate-fadeIn">
                            <div>
                                <label className="block text-xs font-bold text-slate-700 uppercase mb-1.5">Seleccionar Guardia</label>
                                <select
                                    className="w-full border-slate-200 rounded-lg text-sm bg-white focus:ring-indigo-500 focus:border-indigo-500"
                                    value={selectedPendingId}
                                    onChange={e => setSelectedPendingId(e.target.value)}
                                >
                                    <option value="">Seleccione...</option>
                                    {myPendingShifts.map((s: any) => {
                                        const dateLabel = new Date(s.start_time).toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' });
                                        const timeLabel = new Date(s.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                                        const h = (new Date(s.end_time).getTime() - new Date(s.start_time).getTime()) / (1000 * 60 * 60);
                                        return (
                                            <option key={s.id} value={s.id}>
                                                {dateLabel} - {timeLabel} ({h}hs)
                                            </option>
                                        );
                                    })}
                                </select>
                            </div>

                            {selectedPendingId && (
                                <div className="space-y-4 animate-fadeIn">
                                    <div>
                                        <label className="block text-xs font-bold text-slate-700 uppercase mb-1.5">Establecer Hora de Inicio Real</label>
                                        <input
                                            type="datetime-local"
                                            className="w-full border-slate-200 rounded-lg text-sm focus:ring-indigo-500 focus:border-indigo-500"
                                            value={pendingStartTime}
                                            onChange={e => setPendingStartTime(e.target.value)}
                                        />
                                    </div>
                                    <div className="bg-indigo-50/50 p-3 rounded-lg border border-indigo-100/50 text-xs text-indigo-800 space-y-1">
                                        <p className="font-bold">Información de guardia:</p>
                                        <p>La guardia mantendrá su duración original y se recalculará la hora de finalización en base a la hora de inicio real que ingreses.</p>
                                    </div>
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="space-y-4 animate-fadeIn">
                            <div>
                                <label className="block text-xs font-bold text-slate-700 uppercase mb-1.5">Fecha y Hora de Inicio</label>
                                <input
                                    type="datetime-local"
                                    className="w-full border-slate-200 rounded-lg text-sm focus:ring-indigo-500 focus:border-indigo-500"
                                    value={newStartTime}
                                    onChange={e => setNewStartTime(e.target.value)}
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-700 uppercase mb-1.5">Fecha y Hora de Fin</label>
                                <input
                                    type="datetime-local"
                                    className="w-full border-slate-200 rounded-lg text-sm focus:ring-indigo-500 focus:border-indigo-500"
                                    value={newEndTime}
                                    onChange={e => setNewEndTime(e.target.value)}
                                />
                            </div>
                            
                            {newStartTime && newEndTime && (
                                <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 text-xs text-slate-600">
                                    Duración calculada: <span className="font-bold text-slate-800">
                                        {((new Date(newEndTime).getTime() - new Date(newStartTime).getTime()) / (1000 * 60 * 60)).toFixed(1)} hs
                                    </span>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                <div className="p-4 border-t border-slate-100 flex justify-between items-center bg-slate-50">
                    <div>
                        {shiftToEdit && (
                            <button
                                onClick={handleDeleteShift}
                                disabled={saving}
                                className="px-3 py-2 text-red-600 hover:bg-red-50 rounded-lg font-bold text-xs border border-red-200 transition-colors"
                            >
                                Eliminar
                            </button>
                        )}
                    </div>
                    <div className="flex gap-2">
                        <button
                            onClick={onClose}
                            className="px-4 py-2 text-slate-500 hover:bg-slate-200 rounded-lg font-bold text-xs transition-colors"
                        >
                            Cancelar
                        </button>
                        <button
                            onClick={handleSave}
                            disabled={saving}
                            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-bold text-xs transition-colors shadow-sm disabled:opacity-50"
                        >
                            {mode === 'edit' ? 'Guardar Cambios' : 'Guardar Registro'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

// -----------------------------------------------------------------------------------------

function AuditShiftsView({ residents }: any) {
    const [auditLogs, setAuditLogs] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedResident, setSelectedResident] = useState('');

    useEffect(() => {
        fetchAuditLogs();
    }, []);

    const fetchAuditLogs = async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('resident_shifts_audit')
                .select('*, resident:users!resident_shifts_audit_resident_id_fkey(name), actor:users!resident_shifts_audit_action_by_fkey(name)')
                .order('action_date', { ascending: false });
            if (error) throw error;
            setAuditLogs(data || []);
        } catch (err) {
            console.error('Error fetching audit:', err);
        } finally {
            setLoading(false);
        }
    };

    const filteredLogs = auditLogs.filter(log => {
        const matchesResident = selectedResident ? log.resident_id === selectedResident : true;
        const searchStr = `${log.action_type} ${log.resident?.name} ${log.actor?.name}`.toLowerCase();
        const matchesSearch = searchStr.includes(searchTerm.toLowerCase());
        return matchesResident && matchesSearch;
    });

    return (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 flex flex-col h-full max-h-[80vh]">
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                    <span className="material-symbols-outlined text-indigo-600">history</span>
                    Auditoría de Guardias
                </h2>
                <button onClick={fetchAuditLogs} className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-500">
                    <span className="material-symbols-outlined">refresh</span>
                </button>
            </div>

            <div className="flex flex-col md:flex-row gap-4 mb-6">
                <div className="flex-1 relative">
                    <span className="material-symbols-outlined absolute left-3 top-2.5 text-slate-400">search</span>
                    <input 
                        type="text" 
                        placeholder="Buscar por acción, usuario..." 
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                    />
                </div>
                <div className="w-full md:w-64">
                    <select 
                        value={selectedResident}
                        onChange={e => setSelectedResident(e.target.value)}
                        className="w-full px-4 py-2 border border-slate-300 rounded-lg text-sm bg-white"
                    >
                        <option value="">Todos los residentes</option>
                        {residents.map((r: any) => (
                            <option key={r.id} value={r.id}>{r.name}</option>
                        ))}
                    </select>
                </div>
            </div>

            <div className="flex-1 overflow-auto border border-slate-200 rounded-lg">
                <table className="w-full text-left border-collapse">
                    <thead className="bg-slate-50 sticky top-0 z-10">
                        <tr>
                            <th className="py-3 px-4 text-xs font-bold text-slate-500 uppercase">Fecha/Hora</th>
                            <th className="py-3 px-4 text-xs font-bold text-slate-500 uppercase">Acción</th>
                            <th className="py-3 px-4 text-xs font-bold text-slate-500 uppercase">Residente Afectado</th>
                            <th className="py-3 px-4 text-xs font-bold text-slate-500 uppercase">Detalles Guardia</th>
                            <th className="py-3 px-4 text-xs font-bold text-slate-500 uppercase">Ejecutado Por</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                        {loading && (
                            <tr><td colSpan={5} className="py-8 text-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mx-auto"></div></td></tr>
                        )}
                        {!loading && filteredLogs.length === 0 && (
                            <tr><td colSpan={5} className="py-8 text-center text-slate-500 italic">No hay registros de auditoría que coincidan con la búsqueda.</td></tr>
                        )}
                        {!loading && filteredLogs.map(log => (
                            <tr key={log.id} className="hover:bg-slate-50">
                                <td className="py-3 px-4 text-sm text-slate-600">
                                    {new Date(log.action_date).toLocaleString()}
                                </td>
                                <td className="py-3 px-4">
                                    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-bold ${log.action_type === 'ELIMINACIÓN' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                                        <span className="material-symbols-outlined text-[12px]">{log.action_type === 'ELIMINACIÓN' ? 'delete' : 'add_circle'}</span>
                                        {log.action_type}
                                    </span>
                                </td>
                                <td className="py-3 px-4 text-sm font-bold text-slate-800">
                                    {log.resident?.name || 'Desconocido'}
                                </td>
                                <td className="py-3 px-4 text-xs text-slate-500">
                                    {log.shift_start_time ? `${new Date(log.shift_start_time).toLocaleDateString()} ${new Date(log.shift_start_time).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})} a ${new Date(log.shift_end_time).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}` : '-'}
                                </td>
                                <td className="py-3 px-4 text-sm text-slate-600">
                                    {log.actor?.name || 'Sistema'}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
