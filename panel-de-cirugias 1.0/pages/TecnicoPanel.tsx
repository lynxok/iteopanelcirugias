import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { supabase } from '../src/lib/supabase';
import { useAuth } from '../src/lib/AuthContext';
import nomencladorData from '../src/data/nomenclador_mapping.json';

// Set de Feriados Nacionales de Argentina 2025 y 2026 (Reutilizado para cálculos)
const ARGENTINA_HOLIDAYS = new Set([
    // 2025
    '2025-01-01', '2025-03-03', '2025-03-04', '2025-03-24', '2025-04-02', '2025-04-18',
    '2025-05-01', '2025-05-25', '2025-06-16', '2025-06-20', '2025-07-09', '2025-08-17',
    '2025-10-12', '2025-11-24', '2025-12-08', '2025-12-25',
    // 2026
    '2026-01-01', '2026-02-16', '2026-02-17', '2026-03-24', '2026-04-02', '2026-04-03',
    '2026-05-01', '2026-05-25', '2026-06-15', '2026-06-20', '2026-07-09', '2026-08-17',
    '2026-10-12', '2026-11-23', '2026-12-08', '2026-12-25',
]);

const getLocalStr = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
};

const getWeekStartStr = (d: Date) => {
    const start = new Date(d);
    start.setDate(d.getDate() - d.getDay()); // Domingo como inicio de semana
    return getLocalStr(start);
};

const isHoliday = (date: Date) => {
    return ARGENTINA_HOLIDAYS.has(getLocalStr(date));
};

interface Rate {
    id?: string;
    rate_type: 'practice' | 'hour' | 'guard' | 'clinic_ip' | 'notification_email';
    practice_code?: string;
    value: number;
    updated_at?: string;
    updated_by?: string;
    updated_by_name?: string;
}

interface Attendance {
    id: string;
    user_id: string;
    timestamp: string;
    type: 'check_in' | 'break_out' | 'break_in' | 'check_out';
    ip_address: string;
}

interface Consent {
    id: string;
    user_id: string;
    period: string;
    consented_at: string;
    amount_calculated: number;
    status: string;
}

export interface ManualSurgery {
    id: string;
    user_id: string;
    surgery_id: string;
    status: 'pending' | 'approved' | 'rejected';
    validated_at?: string;
    validated_by?: string;
    validated_by_name?: string;
    created_by?: string;
    created_by_name?: string;
    created_by_role?: string;
    created_at?: string;
    notes?: string;
}

export default function TecnicoPanel() {
    const { user } = useAuth();
    const canValidateManualSurgeries = user?.role === 'SuperAdmin' || 
        user?.role === 'Direccion' || 
        user?.role === 'DireccionMedica' || 
        user?.role === 'Administrativo Direccion' || 
        user?.role === 'Gerencia' || 
        user?.role === 'GerenciaMedica' || 
        user?.role === 'Administracion' || 
        user?.role === 'JefaturaDeAdministracion';

    const isLevelAdmin = canValidateManualSurgeries;

    // Tabs
    const [activeTab, setActiveTab] = useState<'clock' | 'billing' | 'guards' | 'rates'>(
        isLevelAdmin ? 'billing' : 'clock'
    );

    // Fechas y Selección de Período (Por defecto, mes actual)
    const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
    const [selectedMonth, setSelectedMonth] = useState<number>(new Date().getMonth()); // 0-11
    const [selectedTecnicoId, setSelectedTecnicoId] = useState<string>(user?.role === 'Tecnico' ? user.id : '');

    // Listados de datos
    const [tecnicos, setTecnicos] = useState<any[]>([]);
    const [surgeries, setSurgeries] = useState<any[]>([]);
    const [attendanceLogs, setAttendanceLogs] = useState<Attendance[]>([]);
    const [allMonthAttendance, setAllMonthAttendance] = useState<Attendance[]>([]);
    const [manualSurgeryIds, setManualSurgeryIds] = useState<string[]>([]);
    const [allManualSurgeries, setAllManualSurgeries] = useState<ManualSurgery[]>([]);
    const [isAddManualModalOpen, setIsAddManualModalOpen] = useState<boolean>(false);
    const [selectedManualSurgeryId, setSelectedManualSurgeryId] = useState<string>('');
    const [isSavingManualSurgery, setIsSavingManualSurgery] = useState<boolean>(false);
    const [isCoAssignModalOpen, setIsCoAssignModalOpen] = useState<boolean>(false);
    const [coAssignSurgeryId, setCoAssignSurgeryId] = useState<string>('');
    const [coAssignTecnicoId, setCoAssignTecnicoId] = useState<string>('');
    const [currentConsent, setCurrentConsent] = useState<Consent | null>(null);
    const [rates, setRates] = useState<Rate[]>([]);
    const [onDutyTecnicosConfig, setOnDutyTecnicosConfig] = useState<Record<string, any>>({});
    
    // IP del cliente e IP de la clínica
    const [clientIp, setClientIp] = useState<string>('');
    const [clinicIp, setClinicIp] = useState<string>('');
    const [loadingIp, setLoadingIp] = useState<boolean>(true);
    const [isSavingRate, setIsSavingRate] = useState<boolean>(false);
    const [todayUserLogs, setTodayUserLogs] = useState<Attendance[]>([]);
    const [currentTime, setCurrentTime] = useState<Date>(new Date());

    // Modal de Edición Directa de Tarifa de Práctica
    const [rateModalConfig, setRateModalConfig] = useState<{
        isOpen: boolean;
        code: string;
        oserCode?: string;
        description?: string;
        currentValue: number;
        updated_at?: string;
        updated_by_name?: string;
    }>({
        isOpen: false,
        code: '',
        currentValue: 0
    });
    const [rateModalInputValue, setRateModalInputValue] = useState<number>(0);

    // Rate Form State
    const [hourRate, setHourRate] = useState<number>(0);
    const [guardRate, setGuardRate] = useState<number>(0);
    const [notificationEmail, setNotificationEmail] = useState<string>('');
    const [inputClinicIp, setInputClinicIp] = useState<string>('');
    const [inputNotificationEmail, setInputNotificationEmail] = useState<string>('');
    const [practiceCodeInput, setPracticeCodeInput] = useState<string>('');
    const [practiceValueInput, setPracticeValueInput] = useState<number>(0);
    const [practiceSearchFilter, setPracticeSearchFilter] = useState<string>('');
    const [practiceSortOption, setPracticeSortOption] = useState<'cases_desc' | 'cases_asc' | 'code_asc' | 'code_desc' | 'price_desc' | 'price_asc'>('cases_desc');

    // Helper: Formato de última edición de tarifas
    const formatLastUpdated = (updated_at?: string, updated_by_name?: string) => {
        if (!updated_at) return null;
        const d = new Date(updated_at);
        if (isNaN(d.getTime())) return null;

        const dateStr = d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
        const timeStr = d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });

        const now = new Date();
        const diffMs = now.getTime() - d.getTime();
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        let relativeStr = '';
        if (diffDays <= 0) relativeStr = 'hoy';
        else if (diffDays === 1) relativeStr = 'ayer';
        else if (diffDays < 30) relativeStr = `hace ${diffDays} días`;
        else if (diffDays < 365) {
            const months = Math.floor(diffDays / 30);
            relativeStr = `hace ${months} ${months === 1 ? 'mes' : 'meses'}`;
        } else {
            const years = Math.floor(diffDays / 365);
            relativeStr = `hace ${years} ${years === 1 ? 'año' : 'años'}`;
        }

        return {
            fullText: `${dateStr} a las ${timeStr} hs (${relativeStr})`,
            dateStr,
            timeStr,
            relativeStr,
            byText: updated_by_name ? `por ${updated_by_name}` : ''
        };
    };

    // Helper: Abrir modal de edición rápida de tarifa
    const openRateModal = (code: string, oserCode?: string, description?: string, currentValue: number = 0, updated_at?: string, updated_by_name?: string) => {
        const cleanCode = code.replace(/\./g, '').trim();
        const existingRate = rates.find(r => r.rate_type === 'practice' && r.practice_code === cleanCode);

        setRateModalConfig({
            isOpen: true,
            code: cleanCode,
            oserCode: oserCode || code,
            description: description || '',
            currentValue: existingRate?.value ?? currentValue ?? 0,
            updated_at: existingRate?.updated_at || updated_at,
            updated_by_name: existingRate?.updated_by_name || updated_by_name
        });
        setRateModalInputValue(existingRate?.value ?? currentValue ?? 0);
    };

    // Helpers de liquidación
    const getRoundedDurationMinutes = (realMin: number) => {
        if (realMin <= 0) return 0;
        if (realMin <= 30) return 30;
        return Math.ceil(realMin / 15) * 15;
    };

    const calculateDurationMinutes = (startStr: string, endStr: string) => {
        if (!startStr || !endStr) return 0;
        const getMinutes = (str: string) => {
            if (str.includes('T') || str.includes('-')) {
                const d = new Date(str);
                return d.getHours() * 60 + d.getMinutes();
            }
            const [h, m] = str.split(':').map(Number);
            return h * 60 + m;
        };
        const startMin = getMinutes(startStr);
        const endMin = getMinutes(endStr);
        let diff = endMin - startMin;
        if (diff < 0) diff += 24 * 60; // Cruce de medianoche
        return diff;
    };

    // Obtener IP pública del cliente
    const fetchClientIp = async () => {
        setLoadingIp(true);
        try {
            const res = await fetch('https://api.ipify.org?format=json');
            const data = await res.json();
            setClientIp(data.ip || '');
        } catch (err) {
            console.error('Error fetching client IP:', err);
            setClientIp('');
        } finally {
            setLoadingIp(false);
        }
    };

    const fetchData = useCallback(async () => {
        try {
            // 1. Obtener todos los técnicos activos asignados a guardias o turno tarde
            const { data: tecData } = await supabase
                .from('users')
                .select('id, name, email, is_turno_tarde, has_tecnico_section_access, does_guardias')
                .eq('role', 'Tecnico')
                .eq('active', true);
            if (tecData) {
                const filteredTecs = tecData.filter(t => t.does_guardias || t.is_turno_tarde);
                setTecnicos(filteredTecs);
                if (!selectedTecnicoId && filteredTecs.length > 0 && isLevelAdmin) {
                    setSelectedTecnicoId(filteredTecs[0].id);
                }
            }

            // 2. Obtener Tarifas
            const { data: rateData } = await supabase
                .from('tecnico_rates')
                .select('*');
            if (rateData) {
                setRates(rateData);
                const hr = rateData.find(r => r.rate_type === 'hour')?.value || 0;
                const gr = rateData.find(r => r.rate_type === 'guard')?.value || 0;
                const cip = rateData.find(r => r.rate_type === 'clinic_ip')?.practice_code || '';
                const ne = rateData.find(r => r.rate_type === 'notification_email')?.practice_code || '';
                setHourRate(hr);
                setGuardRate(gr);
                setClinicIp(cip);
                setInputClinicIp(cip);
                setNotificationEmail(ne);
                setInputNotificationEmail(ne);
            }

            // 3. Configuración de guardias semanales de técnicos
            const { data: onDutyData } = await supabase
                .from('admin_settings')
                .select('value')
                .eq('key', 'on_duty_tecnicos')
                .maybeSingle();
            if (onDutyData?.value) {
                setOnDutyTecnicosConfig(JSON.parse(onDutyData.value));
            }

            // 4. Cargar Fichadas del mes seleccionado para el técnico bajo consulta
            if (selectedTecnicoId) {
                const monthStr = String(selectedMonth + 1).padStart(2, '0');
                const lastDayOfMonth = new Date(selectedYear, selectedMonth + 1, 0).getDate();
                const startStr = `${selectedYear}-${monthStr}-01T00:00:00`;
                const endStr = `${selectedYear}-${monthStr}-${String(lastDayOfMonth).padStart(2, '0')}T23:59:59`;

                const { data: attData } = await supabase
                    .from('tecnico_attendance')
                    .select('*')
                    .eq('user_id', selectedTecnicoId)
                    .gte('timestamp', startStr)
                    .lte('timestamp', endStr)
                    .order('timestamp', { ascending: false });
                if (attData) setAttendanceLogs(attData);

                // Cargar Consentimiento del período
                const periodStr = `${selectedYear}-${monthStr}`;
                const { data: conData } = await supabase
                    .from('tecnico_monthly_consents')
                    .select('*')
                    .eq('user_id', selectedTecnicoId)
                    .eq('period', periodStr)
                    .maybeSingle();
                setCurrentConsent(conData || null);
            }

            // 5. Cargar Cirugías completadas del mes
            const monthStr = String(selectedMonth + 1).padStart(2, '0');
            const lastDay = new Date(selectedYear, selectedMonth + 1, 0).getDate();
            const surgStartStr = `${selectedYear}-${monthStr}-01`;
            const surgEndStr = `${selectedYear}-${monthStr}-${String(lastDay).padStart(2, '0')}`;

            const { data: rawSurgData } = await supabase
                .from('surgeries')
                .select(`
                    id, 
                    patient:patients(full_name), 
                    procedure:procedure_name, 
                    date:surgery_date, 
                    actual_start_time, 
                    actual_end_time
                `)
                .eq('status', 'completed')
                .gte('surgery_date', surgStartStr)
                .lte('surgery_date', surgEndStr);

            if (rawSurgData && rawSurgData.length > 0) {
                const surgeryIds = rawSurgData.map(s => s.id);
                const { data: formsData } = await supabase
                    .from('surgery_forms')
                    .select('surgery_id, instrumentadora')
                    .in('surgery_id', surgeryIds);

                const formsMap = new Map<string, string>();
                if (formsData) {
                    formsData.forEach(f => {
                        if (f.surgery_id && f.instrumentadora) {
                            formsMap.set(f.surgery_id, f.instrumentadora);
                        }
                    });
                }

                const mergedSurgData = rawSurgData.map(s => ({
                    ...s,
                    surgery_forms: { instrumentadora: formsMap.get(s.id) || null }
                }));

                setSurgeries(mergedSurgData);
            } else {
                setSurgeries([]);
            }

            // 5.b Cargar Mapeo de Cirugías Manuales y Asistencia del Mes
            const { data: allManData } = await supabase
                .from('tecnico_manual_surgeries')
                .select('*');
            if (allManData) {
                setAllManualSurgeries(allManData);
                if (selectedTecnicoId) {
                    setManualSurgeryIds(allManData.filter(m => m.user_id === selectedTecnicoId).map(m => m.surgery_id));
                }
            } else {
                setAllManualSurgeries([]);
                setManualSurgeryIds([]);
            }

            if (selectedTecnicoId) {
                const monthStr = String(selectedMonth + 1).padStart(2, '0');
                const lastDayOfMonth = new Date(selectedYear, selectedMonth + 1, 0).getDate();
                const startStr = `${selectedYear}-${monthStr}-01T00:00:00`;
                const endStr = `${selectedYear}-${monthStr}-${String(lastDayOfMonth).padStart(2, '0')}T23:59:59`;

                const { data: monthAttData } = await supabase
                    .from('tecnico_attendance')
                    .select('*')
                    .eq('user_id', selectedTecnicoId)
                    .gte('timestamp', startStr)
                    .lte('timestamp', endStr);
                if (monthAttData) setAllMonthAttendance(monthAttData);
                else setAllMonthAttendance([]);
            }

            // 6. Cargar fichadas de hoy del técnico seleccionado
            if (selectedTecnicoId) {
                const { data: userLogs } = await supabase
                    .from('tecnico_attendance')
                    .select('*')
                    .eq('user_id', selectedTecnicoId)
                    .order('timestamp', { ascending: false })
                    .limit(20);
                if (userLogs) {
                    const todayStr = new Date().toDateString();
                    const filtered = userLogs.filter(log => new Date(log.timestamp).toDateString() === todayStr);
                    setTodayUserLogs(filtered);
                } else {
                    setTodayUserLogs([]);
                }
            }

        } catch (err) {
            console.error('Error fetching TecnicoPanel data:', err);
        }
    }, [selectedYear, selectedMonth, selectedTecnicoId, isLevelAdmin, user]);

    useEffect(() => {
        fetchClientIp();
        fetchData();
    }, [fetchData]);

    useEffect(() => {
        const timer = setInterval(() => {
            setCurrentTime(new Date());
        }, 1000);
        return () => clearInterval(timer);
    }, []);

    // Helper: Verificar si un técnico registró fichaje de ingreso (check_in) en una fecha determinada
    const hasCheckedInOnDate = useCallback((userId: string, dateStr: string) => {
        return allMonthAttendance.some(att => {
            if (att.user_id !== userId || att.type !== 'check_in') return false;
            const attDateStr = getLocalStr(new Date(att.timestamp));
            return attDateStr === dateStr;
        });
    }, [allMonthAttendance]);

    // Cálculo de horas reales trabajadas (fichadas) en el mes
    const attendanceHoursReport = useMemo(() => {
        if (attendanceLogs.length === 0) return { totalHours: 0, amount: 0, details: [] };
        
        // Agrupar fichadas por día
        const logsByDay: Record<string, Attendance[]> = {};
        attendanceLogs.forEach(log => {
            const dateStr = getLocalStr(new Date(log.timestamp));
            if (!logsByDay[dateStr]) logsByDay[dateStr] = [];
            logsByDay[dateStr].push(log);
        });

        let totalMinutes = 0;
        const displayLogs: (Attendance & { isAuto?: boolean })[] = [...attendanceLogs];

        const details = Object.entries(logsByDay).map(([dateStr, dayLogs]) => {
            const sortedLogs = [...dayLogs].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
            let dayMin = 0;
            let currentCheckInTime: number | null = null;
            let currentBreakOutTime: number | null = null;
            let breakMinutes = 0;

            sortedLogs.forEach(log => {
                const time = new Date(log.timestamp).getTime();
                if (log.type === 'check_in') {
                    currentCheckInTime = time;
                } else if (log.type === 'break_out') {
                    currentBreakOutTime = time;
                } else if (log.type === 'break_in') {
                    if (currentBreakOutTime !== null) {
                        breakMinutes += (time - currentBreakOutTime) / 60000;
                        currentBreakOutTime = null;
                    }
                } else if (log.type === 'check_out') {
                    if (currentCheckInTime !== null) {
                        let diff = (time - currentCheckInTime) / 60000;
                        dayMin += diff;
                        currentCheckInTime = null;
                    }
                }
            });

            // Si quedó un check_in abierto (sin check_out)
            if (currentCheckInTime !== null) {
                const defaultAutoOutTime = new Date(`${dateStr}T19:00:00`).getTime();
                const cutoff22Time = new Date(`${dateStr}T22:00:00`).getTime();
                const nowTime = new Date().getTime();

                // Si ya pasaron las 22:00 del mismo día O es un día pasado, cerrar automáticamente a las 19:00 hs
                if (nowTime >= cutoff22Time || getLocalStr(new Date()) > dateStr) {
                    if (defaultAutoOutTime > currentCheckInTime) {
                        let diff = (defaultAutoOutTime - currentCheckInTime) / 60000;
                        dayMin += diff;

                        // Insertar fichada sintética visual de egreso automático
                        const autoOutLog: Attendance & { isAuto?: boolean } = {
                            id: `auto-out-${dateStr}`,
                            user_id: selectedTecnicoId,
                            timestamp: new Date(`${dateStr}T19:00:00`).toISOString(),
                            type: 'check_out',
                            ip_address: 'Sistema (Auto)',
                            isAuto: true
                        };
                        displayLogs.push(autoOutLog);
                    }
                }
            }

            const netMinutes = Math.max(0, dayMin - breakMinutes);
            totalMinutes += netMinutes;
            const hours = netMinutes / 60;
            return {
                date: dateStr,
                hours,
                amount: hours * hourRate
            };
        });

        // Ordenar la lista visual final cronológicamente descendente
        displayLogs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

        const totalHours = totalMinutes / 60;
        return {
            totalHours,
            amount: totalHours * hourRate,
            details,
            displayLogs
        };
    }, [attendanceLogs, hourRate, selectedTecnicoId]);

    // Lógica para saber quién estuvo de guardia en una fecha
    const getOnDutyTecnicoForDate = useCallback((dateStr: string) => {
        if (!dateStr || !onDutyTecnicosConfig) return null;
        const dateObj = new Date(`${dateStr}T12:00:00`);
        const weekStartStr = getWeekStartStr(dateObj);
        const weekConf = onDutyTecnicosConfig[weekStartStr];
        if (!weekConf) return null;
        if (weekConf.overrides && dateStr in weekConf.overrides) return weekConf.overrides[dateStr];
        return weekConf.defaultTecnico || null;
    }, [onDutyTecnicosConfig]);

    // Filtrado de cirugías en las que participó el técnico seleccionado
    const filteredSurgeries = useMemo(() => {
        const tec = tecnicos.find(t => t.id === selectedTecnicoId);
        if (!tec) return [];

        return surgeries.filter(s => {
            // Si la cirugía fue agregada manualmente por este técnico, incluir siempre
            if (manualSurgeryIds.includes(s.id)) return true;

            // Verificar si el técnico seleccionado figura como instrumentador/a en la Ficha Técnica de Cirugía
            const formInstrumentadora = Array.isArray(s.surgery_forms) ? s.surgery_forms[0]?.instrumentadora : s.surgery_forms?.instrumentadora;
            
            const normalizeStr = (str: string) => str ? str.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim() : "";
            const normForm = normalizeStr(formInstrumentadora || '');
            const normTec = normalizeStr(tec.name || '');

            const isAssignedInForm = normForm !== '' && normTec !== '' && (
                normForm.includes(normTec) ||
                normTec.includes(normForm) ||
                normForm.includes('yuskowich') && normTec.includes('yuskowich')
            );

            // Si está explícitamente asignado/a en la ficha técnica, registrar de todos modos
            if (isAssignedInForm) return true;

            const surgDate = new Date(`${s.date}T12:00:00`);
            const dayOfWeek = surgDate.getDay(); // 0 = Dom, 6 = Sab
            
            let isBefore6 = false;
            let isWithinTardeShift = false;
            let isAfter19 = false;
            if (s.actual_start_time) {
                const [h, m] = s.actual_start_time.split(':').map(Number);
                const startHourFraction = h + (m || 0) / 60;
                
                // Madrugada antes de las 06:00 AM
                isBefore6 = startHourFraction < 6;

                // Turno tarde: lunes a jueves de 15:00 a 19:00, viernes de 14:00 a 19:00
                if (dayOfWeek >= 1 && dayOfWeek <= 4) {
                    isWithinTardeShift = startHourFraction >= 15 && startHourFraction < 19;
                } else if (dayOfWeek === 5) {
                    isWithinTardeShift = startHourFraction >= 14 && startHourFraction < 19;
                }
                
                // Luego de las 19:00 hrs
                isAfter19 = startHourFraction >= 19;
            }

            const isFijo = tec.is_turno_tarde === true;
            const onDutyTec = getOnDutyTecnicoForDate(s.date);
            const isGuardia = onDutyTec && onDutyTec.id === selectedTecnicoId;

            // Fines de semana, luego de las 19:00 hs o antes de las 06:00 AM (Guardia Nocturna) -> Solo al que está de guardia
            if (dayOfWeek === 0 || dayOfWeek === 6 || isAfter19 || isBefore6) {
                return isGuardia;
            }

            // En el turno tarde, participan AMBOS (Fijo y Guardia), PERO DEBEN HABER MARCADO INGRESO ESE DÍA
            if (isWithinTardeShift) {
                if (isFijo || isGuardia) {
                    const checkedIn = hasCheckedInOnDate(selectedTecnicoId, s.date);
                    return checkedIn;
                }
                return false;
            }

            // En el Turno Mañana (06:00 a 14:00/15:00 hs) de días hábiles, no se imputa al de guardia salvo en la ficha técnica
            return false;
        });
    }, [surgeries, selectedTecnicoId, tecnicos, getOnDutyTecnicoForDate, manualSurgeryIds, hasCheckedInOnDate]);

    // Cálculo del Costo de las Cirugías
    const surgeriesReport = useMemo(() => {
        const tec = tecnicos.find(t => t.id === selectedTecnicoId);
        if (!tec) return [];

        return filteredSurgeries.map(s => {
            // 1. Extraer código del nomenclador y unificar a AOTER
            let rawCode = '';
            let procedureText = '';
            const matchBracket = s.procedure?.match(/^\[(.*?)\]\s*(.*)/);
            const matchColon = s.procedure?.match(/^(.*?):\s*(.*)/);
            if (matchBracket) {
                rawCode = matchBracket[1].trim();
                procedureText = matchBracket[2].trim();
            } else if (matchColon) {
                rawCode = matchColon[1].trim();
                procedureText = matchColon[2].trim();
            } else if (s.procedure) {
                procedureText = s.procedure.trim();
            }

            // Mapear a AOTER si existe equivalencia
            const mappedAoterCode = (nomencladorData.mapping as Record<string, string>)[rawCode] || rawCode;
            const code = mappedAoterCode.replace(/\./g, '').trim();

            // 2. Obtener tarifa de la práctica
            const existingRate = rates.find(r => r.rate_type === 'practice' && (r.practice_code === code || r.practice_code === rawCode.replace(/\./g, '').trim()));
            const practiceRate = existingRate?.value || 0;

            // 3. Duración redondeada
            const realMin = calculateDurationMinutes(s.actual_start_time, s.actual_end_time);
            const roundedMin = getRoundedDurationMinutes(realMin);
            const roundedHrs = roundedMin / 60;

            // 4. Costo por tiempo
            const timeCost = roundedHrs * hourRate;

            // 5. Total Qx
            const totalQx = practiceRate + timeCost;

            // 6. Liquidación individual y cálculo de porcentajes
            const surgDate = new Date(`${s.date}T12:00:00`);
            const dayOfWeek = surgDate.getDay();
            const isWeekDay = dayOfWeek >= 1 && dayOfWeek <= 5;

            const onDutyTec = getOnDutyTecnicoForDate(s.date);
            const isGuardia = onDutyTec && onDutyTec.id === selectedTecnicoId;
            const isFijo = tec.is_turno_tarde === true;
            
            let isWithinTardeShift = false;
            let isAfter19 = false;
            if (s.actual_start_time) {
                const [h, m] = s.actual_start_time.split(':').map(Number);
                const startHourFraction = h + (m || 0) / 60;
                if (dayOfWeek >= 1 && dayOfWeek <= 4) {
                    isWithinTardeShift = startHourFraction >= 15 && startHourFraction < 19;
                } else if (dayOfWeek === 5) {
                    isWithinTardeShift = startHourFraction >= 14 && startHourFraction < 19;
                }
                isAfter19 = startHourFraction >= 19;
            }

            // Verificar si el técnico asignado en la Ficha Técnica difiere de guardia/turno tarde
            const formInstrumentadora = Array.isArray(s.surgery_forms) ? s.surgery_forms[0]?.instrumentadora : s.surgery_forms?.instrumentadora;
            const isInstrumentadoraMismatch = formInstrumentadora && !isFijo && !isGuardia;

            // Contar cuántos técnicos están asignados y aprobados a esta cirugía
            const approvedManualAssignees = allManualSurgeries
                .filter(m => m.surgery_id === s.id && m.status === 'approved')
                .map(m => m.user_id);
            const isCoAssigned = approvedManualAssignees.length > 0;
            const hasMultipleAssignees = isCoAssigned || isWithinTardeShift;

            // Verificar si esta cirugía fue agregada manualmente para este técnico
            const myManual = allManualSurgeries.find(m => m.user_id === selectedTecnicoId && m.surgery_id === s.id);
            const isManual = !!myManual;
            const manualStatus: 'pending' | 'approved' | 'rejected' | null = myManual ? (myManual.status || 'pending') : null;

            let myShare = 0;
            let shareNotes = "";

            if (dayOfWeek === 0 || dayOfWeek === 6 || isAfter19) {
                if (isCoAssigned) {
                    myShare = totalQx / 2;
                    shareNotes = "50% Coparticipada (Fin de Semana / Nocturno)";
                } else {
                    myShare = totalQx;
                    shareNotes = "100% Guardia (Fin de Semana / Nocturno)";
                }
            } else if (isWithinTardeShift) {
                myShare = totalQx / 2;
                shareNotes = "50% Turno Tarde";
            } else {
                if (isCoAssigned) {
                    myShare = totalQx / 2;
                    shareNotes = "50% Coparticipada";
                } else {
                    myShare = totalQx;
                    shareNotes = "100% Asignado";
                }
            }

            const estimatedShare = myShare;
            // Si la cirugía fue agregada manualmente y aún no fue aprobada/validada, no computa en la liquidación oficial
            const actualShare = (isManual && manualStatus !== 'approved') ? 0 : myShare;

            return {
                id: s.id,
                date: s.date,
                patient: s.patient?.full_name || s.patient?.name || 'Desconocido',
                procedure: s.procedure,
                procedureText: procedureText || s.procedure,
                rawCode,
                practiceCode: code || rawCode.replace(/\./g, '').trim(),
                realMin,
                roundedMin,
                practiceRate,
                timeCost,
                totalCost: totalQx,
                share: actualShare,
                estimatedShare,
                notes: shareNotes,
                isSingleAssignee: !hasMultipleAssignees,
                coAssignedCount: approvedManualAssignees.length,
                formInstrumentadora: formInstrumentadora || null,
                isInstrumentadoraMismatch: !!isInstrumentadoraMismatch,
                rateUpdatedAt: existingRate?.updated_at,
                rateUpdatedByName: existingRate?.updated_by_name,
                isManual,
                manualRecord: myManual || null,
                manualStatus
            };
        });
    }, [filteredSurgeries, rates, hourRate, selectedTecnicoId, tecnicos, allManualSurgeries, getOnDutyTecnicoForDate]);

    const totalSurgeriesAmount = useMemo(() => {
        return surgeriesReport.reduce((acc, curr) => acc + curr.share, 0);
    }, [surgeriesReport]);

    // Cálculo de Días de Guardia del Técnico Seleccionado
    const guardsReport = useMemo(() => {
        const tec = tecnicos.find(t => t.id === selectedTecnicoId);
        if (!tec || !tec.does_guardias) return { daysCount: 0, weeksDetail: [], totalAmount: 0, weekendDaysCount: 0, holidaysCount: 0 };

        // Recorrer todos los días del mes y verificar si estuvo asignado
        const daysInMonth = new Date(selectedYear, selectedMonth + 1, 0).getDate();
        let weekDaysWorked: Record<string, Set<string>> = {}; // weekStartStr -> Set de días hábiles trabajados de guardia
        let weekendDaysWorkedCount = 0;
        let holidaysWorkedCount = 0;

        const lastDayOfPrevMonth = new Date(selectedYear, selectedMonth, 0);
        const lastDayOfPrevMonthStr = getLocalStr(lastDayOfPrevMonth);
        const prevMonthOnDuty = getOnDutyTecnicoForDate(lastDayOfPrevMonthStr);
        const prevMonthOnDutyIsMe = prevMonthOnDuty && prevMonthOnDuty.id === selectedTecnicoId;

        for (let day = 1; day <= daysInMonth; day++) {
            const dateObj = new Date(selectedYear, selectedMonth, day);
            const dateStr = getLocalStr(dateObj);
            
            // Exclusión de duplicidad: si el técnico de guardia actual estuvo de guardia a fin del mes anterior, 
            // y el día actual pertenece a la misma semana que comenzó en el mes anterior, lo excluimos de este mes.
            if (prevMonthOnDutyIsMe) {
                const weekStartOfPrevMonthEnd = getWeekStartStr(lastDayOfPrevMonth);
                const weekStartOfCurrentDay = getWeekStartStr(dateObj);
                if (weekStartOfPrevMonthEnd === weekStartOfCurrentDay) {
                    continue;
                }
            }

            const onDutyTec = getOnDutyTecnicoForDate(dateStr);

            if (onDutyTec && onDutyTec.id === selectedTecnicoId) {
                const dayOfWeek = dateObj.getDay();
                const isWE = dayOfWeek === 0 || dayOfWeek === 6;
                const isHolidayDay = isHoliday(dateObj);

                if (isHolidayDay && !isWE) {
                    // Si cae en día de semana y es feriado, se suma como feriado
                    holidaysWorkedCount++;
                    // Y TAMBIÉN lo agregamos a los días hábiles de la semana para que no reste la fracción semanal
                    const weekStartStr = getWeekStartStr(dateObj);
                    if (!weekDaysWorked[weekStartStr]) {
                        weekDaysWorked[weekStartStr] = new Set();
                    }
                    weekDaysWorked[weekStartStr].add(dateStr);
                } else if (isWE) {
                    weekendDaysWorkedCount++;
                } else {
                    const weekStartStr = getWeekStartStr(dateObj);
                    if (!weekDaysWorked[weekStartStr]) {
                        weekDaysWorked[weekStartStr] = new Set();
                    }
                    weekDaysWorked[weekStartStr].add(dateStr);
                }
            }
        }

        // Calcular días de guardia equivalentes
        let weekdayGuardsCount = 0;
        const weeksDetail = Object.entries(weekDaysWorked).map(([week, daysSet]) => {
            const count = daysSet.size;
            // 5 días hábiles = 1 día de guardia. Fracción proporcional:
            const equiv = count / 5;
            weekdayGuardsCount += equiv;
            return { week, daysCount: count, equiv };
        });

        // Contemplar semana completa al de guardia si la semana del final del mes seleccionado cruza al mes siguiente.
        const lastDayOfCurrentMonth = new Date(selectedYear, selectedMonth + 1, 0);
        const lastDayOfCurrentMonthStr = getLocalStr(lastDayOfCurrentMonth);
        const nextMonthOnDuty = getOnDutyTecnicoForDate(lastDayOfCurrentMonthStr);
        const nextMonthOnDutyIsMe = nextMonthOnDuty && nextMonthOnDuty.id === selectedTecnicoId;

        if (nextMonthOnDutyIsMe) {
            const lastDayOfWeek = lastDayOfCurrentMonth.getDay(); // 0 = Dom, 6 = Sab
            const weekStartStr = getWeekStartStr(lastDayOfCurrentMonth);
            
            for (let d = lastDayOfWeek + 1; d <= 6; d++) {
                const targetDate = new Date(lastDayOfCurrentMonth);
                targetDate.setDate(lastDayOfCurrentMonth.getDate() + (d - lastDayOfWeek));
                
                const targetDayOfWeek = targetDate.getDay();
                const isTargetHoliday = isHoliday(targetDate);

                if (targetDayOfWeek >= 1 && targetDayOfWeek <= 5) {
                    if (isTargetHoliday) {
                        holidaysWorkedCount++;
                    }
                    if (!weekDaysWorked[weekStartStr]) {
                        weekDaysWorked[weekStartStr] = new Set();
                    }
                    const targetDateStr = getLocalStr(targetDate);
                    if (!weekDaysWorked[weekStartStr].has(targetDateStr)) {
                        weekDaysWorked[weekStartStr].add(targetDateStr);
                    }
                } else if (targetDayOfWeek === 0 || targetDayOfWeek === 6) {
                    weekendDaysWorkedCount++;
                }
            }

            // Recalcular el weeksDetail y weekdayGuardsCount
            weekdayGuardsCount = 0;
            Object.entries(weekDaysWorked).forEach(([week, daysSet]) => {
                const count = daysSet.size;
                const equiv = count / 5;
                weekdayGuardsCount += equiv;
                
                const idx = weeksDetail.findIndex(w => w.week === week);
                if (idx !== -1) {
                    weeksDetail[idx] = { week, daysCount: count, equiv };
                } else {
                    weeksDetail.push({ week, daysCount: count, equiv });
                }
            });
        }

        const totalDaysCount = weekdayGuardsCount + weekendDaysWorkedCount + holidaysWorkedCount;
        const totalAmount = totalDaysCount * guardRate;

        return {
            daysCount: totalDaysCount,
            weeksDetail,
            weekendDaysCount: weekendDaysWorkedCount,
            holidaysCount: holidaysWorkedCount,
            totalAmount
        };
    }, [selectedYear, selectedMonth, selectedTecnicoId, tecnicos, getOnDutyTecnicoForDate, guardRate]);

    const grandTotalAmount = useMemo(() => {
        return totalSurgeriesAmount + guardsReport.totalAmount + attendanceHoursReport.amount;
    }, [totalSurgeriesAmount, guardsReport, attendanceHoursReport]);

    // Helper para registrar en audit_logs de forma segura
    const logAudit = async (action: 'CREATE' | 'UPDATE' | 'DELETE' | 'STATUS_CHANGE', resource: string, resourceId: string, description: string, meta?: any) => {
        try {
            await supabase.from('audit_logs').insert({
                user_name: user?.name || user?.email || 'Usuario',
                user_role: user?.role || 'Desconocido',
                user_avatar: user?.avatarUrl || '',
                action,
                resource,
                resource_id: resourceId,
                description,
                meta: {
                    ...meta,
                    timestamp: new Date().toISOString()
                }
            });
        } catch (err) {
            console.error('Error registrando auditoría en Gestión de Técnicos:', err);
        }
    };

    // Gestión de Adición Manual de Cirugías por Técnico
    const handleAddManualSurgery = async () => {
        if (!selectedManualSurgeryId || !selectedTecnicoId) return;
        setIsSavingManualSurgery(true);
        const targetTecnico = tecnicos.find(t => t.id === selectedTecnicoId);
        const targetSurgery = surgeries.find(s => s.id === selectedManualSurgeryId);

        const isValidator = canValidateManualSurgeries;
        const initialStatus = isValidator ? 'approved' : 'pending';

        try {
            const { error } = await supabase
                .from('tecnico_manual_surgeries')
                .insert({
                    user_id: selectedTecnicoId,
                    surgery_id: selectedManualSurgeryId,
                    status: initialStatus,
                    created_by: user?.id,
                    created_by_name: user?.name || user?.email || 'Usuario',
                    created_by_role: user?.role || 'Tecnico',
                    validated_at: isValidator ? new Date().toISOString() : null,
                    validated_by: isValidator ? user?.id : null,
                    validated_by_name: isValidator ? (user?.name || user?.email || 'Administrador') : null
                });

            if (error) {
                if (error.code === '23505') {
                    alert('Esta cirugía ya se encuentra agregada al listado de este técnico.');
                } else {
                    alert('Error al agregar cirugía: ' + error.message);
                }
            } else {
                await logAudit(
                    'CREATE',
                    'Técnicos - Cirugía Manual',
                    selectedManualSurgeryId,
                    isValidator
                        ? `${user?.name || 'Usuario'} agregó y validó directamente la cirugía de ${targetSurgery?.patient?.full_name || targetSurgery?.patient?.name || 'Paciente'} al técnico ${targetTecnico?.name || 'Técnico'}.`
                        : `${user?.name || 'Usuario'} agregó la cirugía de ${targetSurgery?.patient?.full_name || targetSurgery?.patient?.name || 'Paciente'} al listado de ${targetTecnico?.name || 'Técnico'} (Pendiente de validación).`,
                    { tecnico_id: selectedTecnicoId, tecnico_name: targetTecnico?.name, surgery_id: selectedManualSurgeryId, status: initialStatus }
                );

                setManualSurgeryIds(prev => [...prev, selectedManualSurgeryId]);
                setIsAddManualModalOpen(false);
                setSelectedManualSurgeryId('');
                fetchData();

                if (!isValidator) {
                    alert('Cirugía agregada con éxito.\n\nHa quedado registrada como "Pendiente de Validación" y solo se computará en la liquidación una vez que sea validada por un usuario de tipo SuperAdmin, Dirección o Administrativo de Gerencia.');
                } else {
                    alert('Cirugía agregada y validada con éxito.');
                }
            }
        } catch (err: any) {
            console.error('Error adding manual surgery:', err);
            alert('Error al agregar cirugía manual.');
        } finally {
            setIsSavingManualSurgery(false);
        }
    };

    const handleCoAssignTecnico = async () => {
        if (!coAssignSurgeryId || !coAssignTecnicoId) return;
        setIsSavingManualSurgery(true);
        const targetTecnico = tecnicos.find(t => t.id === coAssignTecnicoId);
        const targetSurgery = surgeries.find(s => s.id === coAssignSurgeryId);

        const isValidator = canValidateManualSurgeries;
        const initialStatus = isValidator ? 'approved' : 'pending';

        try {
            const { error } = await supabase
                .from('tecnico_manual_surgeries')
                .insert({
                    user_id: coAssignTecnicoId,
                    surgery_id: coAssignSurgeryId,
                    status: initialStatus,
                    created_by: user?.id,
                    created_by_name: user?.name || user?.email || 'Usuario',
                    created_by_role: user?.role || 'Tecnico',
                    validated_at: isValidator ? new Date().toISOString() : null,
                    validated_by: isValidator ? user?.id : null,
                    validated_by_name: isValidator ? (user?.name || user?.email || 'Administrador') : null
                });

            if (error) {
                if (error.code === '23505') {
                    alert('El técnico seleccionado ya se encuentra asignado a esta cirugía.');
                } else {
                    alert('Error al sumar técnico: ' + error.message);
                }
            } else {
                await logAudit(
                    'CREATE',
                    'Técnicos - Co-asignación',
                    coAssignSurgeryId,
                    isValidator
                        ? `${user?.name || 'Usuario'} co-asignó y validó al técnico ${targetTecnico?.name || 'Técnico'} a la cirugía de ${targetSurgery?.patient?.full_name || targetSurgery?.patient?.name || 'Paciente'}.`
                        : `${user?.name || 'Usuario'} solicitó co-asignar al técnico ${targetTecnico?.name || 'Técnico'} a la cirugía de ${targetSurgery?.patient?.full_name || targetSurgery?.patient?.name || 'Paciente'} (Pendiente de validación).`,
                    { tecnico_id: coAssignTecnicoId, tecnico_name: targetTecnico?.name, surgery_id: coAssignSurgeryId, status: initialStatus }
                );

                setIsCoAssignModalOpen(false);
                setCoAssignSurgeryId('');
                setCoAssignTecnicoId('');
                fetchData();

                if (!isValidator) {
                    alert('Co-asignación solicitada con éxito.\n\nHa quedado en estado "Pendiente de Validación" hasta su aprobación por SuperAdmin, Dirección o Administrativo de Gerencia.');
                } else {
                    alert('Técnico sumado y validado con éxito.');
                }
            }
        } catch (err: any) {
            console.error('Error co-assigning tecnico:', err);
            alert('Error al sumar técnico a la cirugía.');
        } finally {
            setIsSavingManualSurgery(false);
        }
    };

    const handleValidateManualSurgery = async (manualRecordId: string, action: 'approve' | 'reject') => {
        if (!canValidateManualSurgeries) {
            alert('No tiene permisos para validar cirugías manuales. Solo usuarios tipo SuperAdmin, Dirección o Administrativo de Gerencia pueden realizar esta acción.');
            return;
        }

        const manRecord = allManualSurgeries.find(m => m.id === manualRecordId);
        if (!manRecord) return;

        const targetSurgery = surgeries.find(s => s.id === manRecord.surgery_id);
        const targetTecnico = tecnicos.find(t => t.id === manRecord.user_id);

        const newStatus = action === 'approve' ? 'approved' : 'rejected';
        const actionLabel = action === 'approve' ? 'VALIDAR Y APROBAR' : 'RECHAZAR';

        if (!confirm(`¿Está seguro de que desea ${actionLabel} la cirugía de ${targetSurgery?.patient?.full_name || targetSurgery?.patient?.name || 'Paciente'} para la liquidación de ${targetTecnico?.name || 'Técnico'}?`)) {
            return;
        }

        try {
            const { error } = await supabase
                .from('tecnico_manual_surgeries')
                .update({
                    status: newStatus,
                    validated_at: new Date().toISOString(),
                    validated_by: user?.id,
                    validated_by_name: user?.name || user?.email || 'Administrador'
                })
                .eq('id', manualRecordId);

            if (error) throw error;

            await logAudit(
                'STATUS_CHANGE',
                'Técnicos - Validación Cirugía Manual',
                manRecord.surgery_id,
                `${user?.name || 'Administrador'} ${action === 'approve' ? 'aprobó y validó' : 'rechazó'} la cirugía manual de ${targetSurgery?.patient?.full_name || targetSurgery?.patient?.name || 'Paciente'} para el técnico ${targetTecnico?.name || 'Técnico'}.`,
                { manual_record_id: manualRecordId, surgery_id: manRecord.surgery_id, tecnico_id: manRecord.user_id, status: newStatus }
            );

            alert(action === 'approve' ? 'Cirugía validada exitosamente para la liquidación.' : 'Inclusión manual rechazada.');
            fetchData();
        } catch (err: any) {
            console.error('Error al validar cirugía manual:', err);
            alert('Error al validar la cirugía: ' + err.message);
        }
    };

    const handleRemoveManualSurgery = async (surgeryId: string) => {
        if (!selectedTecnicoId) return;
        if (!confirm('¿Desea quitar esta cirugía cargada manualmente del listado del técnico?')) return;

        const targetTecnico = tecnicos.find(t => t.id === selectedTecnicoId);
        const targetSurgery = surgeries.find(s => s.id === surgeryId);

        try {
            const { error } = await supabase
                .from('tecnico_manual_surgeries')
                .delete()
                .eq('user_id', selectedTecnicoId)
                .eq('surgery_id', surgeryId);

            if (error) {
                alert('Error al remover cirugía: ' + error.message);
            } else {
                await logAudit(
                    'DELETE',
                    'Técnicos - Cirugía Manual',
                    surgeryId,
                    `${user?.name || 'Usuario'} removió la cirugía manual de ${targetSurgery?.patient?.full_name || 'Paciente'} del técnico ${targetTecnico?.name || 'Técnico'}.`,
                    { tecnico_id: selectedTecnicoId, tecnico_name: targetTecnico?.name, surgery_id: surgeryId }
                );

                setManualSurgeryIds(prev => prev.filter(id => id !== surgeryId));
                fetchData();
            }
        } catch (err: any) {
            console.error('Error removing manual surgery:', err);
            alert('Error al remover cirugía manual.');
        }
    };

    // Gestión de Fichadas (Check-In / Out)
    const handleClockAction = async (type: 'check_in' | 'break_out' | 'break_in' | 'check_out') => {
        if (!user) return;
        
        // Validar IP pública excepto para admins en test
        const allowedIps = clinicIp ? clinicIp.split(',').map(ip => ip.trim()) : [];
        const isIpOk = allowedIps.includes(clientIp) || isLevelAdmin;
        if (!isIpOk) {
            const errorMsg = `Acceso denegado en fichada: IP no autorizada (${clientIp || 'Desconocida'}). IPs permitidas: ${clinicIp || 'No configurada'}`;
            
            // Guardar registro de error silencioso en la base de datos para auditoría
            supabase.from('system_errors').insert({
                user_name: user?.name || user?.email || 'Técnico',
                user_role: user?.role || 'tecnico',
                context: 'Fichada IP Validation',
                message: errorMsg,
                severity: 'warning',
                metadata: {
                    client_ip: clientIp || null,
                    allowed_ips: allowedIps,
                    action_type: type,
                    selected_tecnico_id: selectedTecnicoId || null,
                    user_agent: navigator.userAgent
                }
            }).then(({ error }) => {
                if (error) console.error('Error logging IP error to system_errors:', error);
            });

            alert(`Acceso denegado: Fichada solo disponible desde la red WiFi de la clínica (IPs autorizadas: ${clinicIp || 'No configurada'}, tu IP: ${clientIp || 'Desconocida'}).`);
            return;
        }

        if (!selectedTecnicoId) {
            alert('Por favor, seleccione un técnico.');
            return;
        }

        const targetTecnico = tecnicos.find(t => t.id === selectedTecnicoId);

        try {
            const { error } = await supabase
                .from('tecnico_attendance')
                .insert({
                    user_id: selectedTecnicoId,
                    type,
                    ip_address: clientIp || 'Local'
                });
            if (error) throw error;

            await logAudit(
                'CREATE',
                'Técnicos - Fichada',
                selectedTecnicoId,
                `Fichada de jornada (${type.toUpperCase()}) registrada para ${targetTecnico?.name || 'Técnico'} desde IP ${clientIp || 'Local'}.`,
                { type, clientIp, tecnico_id: selectedTecnicoId, tecnico_name: targetTecnico?.name }
            );

            alert('Fichada registrada con éxito');
            fetchData();
        } catch (e: any) {
            alert('Error al fichar: ' + e.message);
        }
    };

    const currentClockState = useMemo(() => {
        if (todayUserLogs.length === 0) return 'Fuera de Turno';
        const last = todayUserLogs[0]; // Ya filtradas por hoy y ordenadas desc
        
        if (last.type === 'check_in' || last.type === 'break_in') return 'En Turno';
        if (last.type === 'break_out') return 'En Descanso';
        return 'Fuera de Turno';
    }, [todayUserLogs]);

    // Registrar Consentimiento Mensual
    const handleGiveConsent = async () => {
        if (!selectedTecnicoId) return;
        const periodStr = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}`;
        const targetTecnico = tecnicos.find(t => t.id === selectedTecnicoId);
        
        if (currentConsent) {
            alert('Ya has brindado conformidad para este período.');
            return;
        }

        if (!confirm(`¿Confirmas conformidad con la planilla de ${periodStr} por un total de $${grandTotalAmount.toLocaleString()}?`)) {
            return;
        }

        try {
            const { error } = await supabase
                .from('tecnico_monthly_consents')
                .insert({
                    user_id: selectedTecnicoId,
                    period: periodStr,
                    amount_calculated: grandTotalAmount,
                    status: 'consented'
                });
            if (error) throw error;

            await logAudit(
                'STATUS_CHANGE',
                'Técnicos - Conformidad Mensual',
                `${selectedTecnicoId}-${periodStr}`,
                `Conformidad digital de liquidación otorgada para el período ${periodStr} (${targetTecnico?.name || 'Técnico'}) por un monto de $${grandTotalAmount.toLocaleString()}.`,
                {
                    period: periodStr,
                    amount: grandTotalAmount,
                    tecnico_id: selectedTecnicoId,
                    tecnico_name: targetTecnico?.name,
                    surgeries_amount: totalSurgeriesAmount,
                    guards_amount: guardsReport.totalAmount,
                    attendance_amount: attendanceHoursReport.amount
                }
            );

            // Encolar Notificaciones por Correo si hay emails configurados
            const nowFormatted = new Date().toLocaleString('es-ES');
            const emailSubject = `Conformidad Liquidación Técnicos - ${targetTecnico?.name || 'Técnico'} (${periodStr})`;
            const emailBody = `
Hola,

Se ha registrado la conformidad de liquidación mensual de Técnicos de Quirófano:

- Técnico: ${targetTecnico?.name || 'No especificado'} (${targetTecnico?.email || 'Sin correo registrado'})
- Período: ${periodStr}
- Monto Total Liquidado: $${grandTotalAmount.toLocaleString()}
  * Cirugías: $${totalSurgeriesAmount.toLocaleString()}
  * Guardias: $${guardsReport.totalAmount.toLocaleString()} (${guardsReport.daysCount} días)
  * Asistencia Horas Fichadas: $${attendanceHoursReport.amount.toLocaleString()} (${attendanceHoursReport.totalHours.toFixed(1)} hs)
- Fecha y Hora de Conformidad: ${nowFormatted}

Atentamente,
Sistema de Coordinación de Quirófano ITEO
`.trim();

            const recipients = new Set<string>();
            if (notificationEmail.trim()) recipients.add(notificationEmail.trim());
            if (targetTecnico?.email?.trim()) recipients.add(targetTecnico.email.trim());

            for (const recipientEmail of recipients) {
                await supabase.from('email_notifications').insert({
                    recipient_email: recipientEmail,
                    subject: emailSubject,
                    message: emailBody,
                    status: 'pending'
                });
            }
            
            alert('Conformidad registrada exitosamente y notificaciones de correo encoladas.');
            fetchData();
        } catch (e: any) {
            alert('Error al registrar conformidad: ' + e.message);
        }
    };

    // Configuración de Tarifas (Administrativos)
    const handleSaveGlobalRates = async () => {
        setIsSavingRate(true);
        try {
            const oldHourRate = rates.find(r => r.rate_type === 'hour')?.value ?? 0;
            const oldGuardRate = rates.find(r => r.rate_type === 'guard')?.value ?? 0;
            const oldClinicIp = clinicIp;
            const oldNotificationEmail = notificationEmail;
            const authorName = user?.name || user?.email || 'Administración';

            const upsertRate = async (type: 'hour' | 'guard' | 'clinic_ip' | 'notification_email', val: number, code?: string) => {
                const payload: any = { 
                    rate_type: type, 
                    value: val,
                    updated_at: new Date().toISOString(),
                    updated_by: user?.id,
                    updated_by_name: authorName
                };
                if (code !== undefined) payload.practice_code = code;
                
                // buscar si existe
                const match = rates.find(r => r.rate_type === type);
                if (match?.id) payload.id = match.id;

                const { error } = await supabase.from('tecnico_rates').upsert(payload);
                if (error) throw error;
            };

            await upsertRate('hour', hourRate);
            await upsertRate('guard', guardRate);
            await upsertRate('clinic_ip', 0, inputClinicIp);
            await upsertRate('notification_email', 0, inputNotificationEmail);

            await logAudit(
                'UPDATE',
                'Técnicos - Tarifas Globales',
                'GLOBAL_RATES',
                `${user?.name || 'Usuario'} actualizó los valores globales de liquidación de técnicos.`,
                {
                    hour_rate: { old: oldHourRate, new: hourRate },
                    guard_rate: { old: oldGuardRate, new: guardRate },
                    clinic_ip: { old: oldClinicIp, new: inputClinicIp },
                    notification_email: { old: oldNotificationEmail, new: inputNotificationEmail }
                }
            );

            alert('Tarifas y correos de notificación actualizados con éxito.');
            fetchData();
        } catch (e: any) {
            alert('Error al guardar tarifas: ' + e.message);
        } finally {
            setIsSavingRate(false);
        }
    };

    const savePracticeRateValue = async (rawCode: string, value: number, oserDisplayCode?: string) => {
        if (!rawCode.trim()) {
            alert('Código de práctica inválido.');
            return false;
        }
        setIsSavingRate(true);
        try {
            const code = rawCode.trim().replace(/\./g, '');
            const authorName = user?.name || user?.email || 'Administración';
            const payload: any = {
                rate_type: 'practice',
                practice_code: code,
                value: value,
                updated_at: new Date().toISOString(),
                updated_by: user?.id,
                updated_by_name: authorName
            };

            const match = rates.find(r => r.rate_type === 'practice' && r.practice_code === code);
            const isUpdate = !!match;
            const oldValue = match?.value ?? 0;
            if (match?.id) payload.id = match.id;

            const { error } = await supabase.from('tecnico_rates').upsert(payload);
            if (error) throw error;

            await logAudit(
                isUpdate ? 'UPDATE' : 'CREATE',
                'Técnicos - Tarifa Práctica',
                code,
                `${user?.name || 'Usuario'} ${isUpdate ? 'actualizó' : 'creó'} la tarifa para la práctica [${oserDisplayCode || code}] a $${value.toLocaleString()}.`,
                {
                    practice_code: code,
                    value: isUpdate ? { old: oldValue, new: value } : value
                }
            );

            await fetchData();
            return true;
        } catch (e: any) {
            alert('Error al guardar tarifa de práctica: ' + e.message);
            return false;
        } finally {
            setIsSavingRate(false);
        }
    };

    const handleSavePracticeRate = async () => {
        if (!practiceCodeInput.trim()) return alert('Ingrese un código de práctica.');
        const ok = await savePracticeRateValue(practiceCodeInput, practiceValueInput);
        if (ok) {
            alert('Tarifa de práctica guardada.');
            setPracticeCodeInput('');
            setPracticeValueInput(0);
        }
    };

    const handleDeletePracticeRate = async (id: string) => {
        const targetRate = rates.find(r => r.id === id);
        if (!confirm(`¿Eliminar tarifa de la práctica [${targetRate?.practice_code || id}]?`)) return;

        try {
            const { error } = await supabase.from('tecnico_rates').delete().eq('id', id);
            if (error) throw error;

            await logAudit(
                'DELETE',
                'Técnicos - Tarifa Práctica',
                targetRate?.practice_code || id,
                `${user?.name || 'Usuario'} eliminó la tarifa de la práctica [${targetRate?.practice_code || id}] (Monto anterior: $${targetRate?.value || 0}).`,
                { practice_code: targetRate?.practice_code, value: targetRate?.value }
            );

            fetchData();
        } catch (e: any) {
            alert('Error: ' + e.message);
        }
    };

    const practiceRates = useMemo(() => {
        return rates.filter(r => r.rate_type === 'practice');
    }, [rates]);

    const allowedIps = clinicIp ? clinicIp.split(',').map(ip => ip.trim()) : [];
    const isIpMatch = allowedIps.includes(clientIp) || isLevelAdmin;

    return (
        <div className="flex flex-col min-h-screen bg-slate-50 relative p-4 md:p-6 overflow-y-auto pb-24">
             <div className="mb-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-2xl font-black text-slate-800 flex items-center gap-2 tracking-tight">
                        <span className="material-symbols-outlined text-indigo-600 text-3xl">engineering</span>
                        Liquidación y Control de Técnicos
                    </h1>
                    <p className="text-sm text-slate-500 mt-1">
                        {isLevelAdmin ? 'Panel de supervisión, tarifas y control de asistencia' : 'Mi espacio personal de asistencia, cirugías y guardias'}
                    </p>
                </div>

                {/* Filtro Período / Técnico para Administración */}
                <div className="flex flex-wrap items-center gap-2 bg-white p-2 rounded-xl border border-slate-200 shadow-sm w-full md:w-auto">
                    {isLevelAdmin && (
                        <div className="flex flex-col">
                            <label className="text-[9px] font-bold text-slate-400 uppercase ml-1">Técnico</label>
                            <select
                                className="bg-transparent border-none text-xs font-bold focus:ring-0 text-slate-700 py-1"
                                value={selectedTecnicoId}
                                onChange={e => setSelectedTecnicoId(e.target.value)}
                            >
                                <option value="">Seleccione Técnico...</option>
                                {tecnicos.map(t => (
                                    <option key={t.id} value={t.id}>{t.name} {t.is_turno_tarde ? '(Fijo)' : '(Guardia)'}</option>
                                ))}
                            </select>
                        </div>
                    )}
                    
                    <div className="h-8 w-px bg-slate-200 hidden md:block"></div>

                    <div className="flex flex-col">
                        <label className="text-[9px] font-bold text-slate-400 uppercase ml-1">Mes</label>
                        <select
                            className="bg-transparent border-none text-xs font-bold focus:ring-0 text-slate-700 py-1"
                            value={selectedMonth}
                            onChange={e => setSelectedMonth(Number(e.target.value))}
                        >
                            {['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'].map((m, idx) => (
                                <option key={idx} value={idx}>{m}</option>
                            ))}
                        </select>
                    </div>

                    <div className="h-8 w-px bg-slate-200 hidden md:block"></div>

                    <div className="flex flex-col">
                        <label className="text-[9px] font-bold text-slate-400 uppercase ml-1">Año</label>
                        <select
                            className="bg-transparent border-none text-xs font-bold focus:ring-0 text-slate-700 py-1"
                            value={selectedYear}
                            onChange={e => setSelectedYear(Number(e.target.value))}
                        >
                            {[2025, 2026, 2027].map(y => (
                                <option key={y} value={y}>{y}</option>
                            ))}
                        </select>
                    </div>
                </div>
            </div>

            {/* Navigation Tabs */}
            <div className="flex bg-white rounded-xl p-1 border border-slate-200 shadow-sm w-fit mb-6">
                <button
                    onClick={() => setActiveTab('clock')}
                    className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold rounded-lg transition-all ${activeTab === 'clock' ? 'bg-indigo-50 text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'}`}
                >
                    <span className="material-symbols-outlined text-base">schedule</span>
                    Control de Asistencia
                </button>
                <button
                    onClick={() => setActiveTab('billing')}
                    className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold rounded-lg transition-all ${activeTab === 'billing' ? 'bg-indigo-50 text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'}`}
                >
                    <span className="material-symbols-outlined text-base">receipt_long</span>
                    Liquidación Cirugías
                </button>
                <button
                    onClick={() => setActiveTab('guards')}
                    className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold rounded-lg transition-all ${activeTab === 'guards' ? 'bg-indigo-50 text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'}`}
                >
                    <span className="material-symbols-outlined text-base">event_available</span>
                    Liquidación Guardias
                </button>
                {isLevelAdmin && (
                    <button
                        onClick={() => setActiveTab('rates')}
                        className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold rounded-lg transition-all ${activeTab === 'rates' ? 'bg-indigo-50 text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'}`}
                    >
                        <span className="material-symbols-outlined text-base">monetization_on</span>
                        Tarifas y Ajustes
                    </button>
                )}
            </div>

            {/* TAB CONTENT */}
            <div className="flex-1 space-y-6">

                {/* CLOCK TAB */}
                {activeTab === 'clock' && (
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-fadeIn">
                        
                        {/* Fichador Card */}
                        <div className="lg:col-span-1 bg-white p-6 rounded-2xl border border-slate-200 shadow-xl flex flex-col items-center text-center justify-between min-h-[350px] relative overflow-hidden">
                            <div className="absolute top-0 inset-x-0 h-2 bg-indigo-500"></div>
                            
                            <div className="space-y-2 mt-4">
                                <span className={`inline-flex px-3 py-1 rounded-full text-xs font-black uppercase tracking-widest ${
                                    currentClockState === 'En Turno' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                                    currentClockState === 'En Descanso' ? 'bg-amber-50 text-amber-700 border border-amber-200' :
                                    'bg-slate-100 text-slate-500 border border-slate-200'
                                }`}>
                                    {currentClockState}
                                </span>
                                <h3 className="text-3xl font-black text-slate-800 tracking-tight">Reloj de Fichadas</h3>
                                <p className="text-xs text-slate-400">Jornada actual y descansos</p>
                            </div>

                            {/* Reloj Digital en Tiempo Real */}
                            <div className="my-4 bg-slate-50 border border-slate-100 px-6 py-3 rounded-2xl shadow-inner select-none">
                                <p className="text-3xl font-black text-indigo-600 font-mono tracking-wider">
                                    {currentTime.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                                </p>
                                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-1">Hora Actual</p>
                            </div>

                            {/* Botones de fichada */}
                            <div className="w-full space-y-3 my-6">
                                {todayUserLogs.length === 0 || !todayUserLogs.some(l => l.type === 'check_in') ? (
                                    <button
                                        onClick={() => handleClockAction('check_in')}
                                        className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-lg shadow-emerald-100 flex items-center justify-center gap-2 transition-all active:scale-98"
                                    >
                                        <span className="material-symbols-outlined">login</span>
                                        Ingreso de Jornada
                                    </button>
                                ) : todayUserLogs.some(l => l.type === 'check_out') ? (
                                    <div className="w-full py-4 px-3 bg-slate-50 border border-slate-200 rounded-xl text-center">
                                        <p className="text-sm font-bold text-slate-500">Jornada Completada Hoy</p>
                                        <p className="text-xs text-slate-400 mt-1">Has registrado la salida de tu jornada.</p>
                                    </div>
                                ) : (
                                    <div className="w-full space-y-3">
                                        {/* Botón Salida Temporal / Reingreso */}
                                        {todayUserLogs[0]?.type === 'break_out' ? (
                                            <button
                                                onClick={() => handleClockAction('break_in')}
                                                className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl flex items-center justify-center gap-2 transition-all active:scale-98 animate-pulseFast"
                                            >
                                                <span className="material-symbols-outlined">play_arrow</span>
                                                Reingreso de Salida
                                            </button>
                                        ) : (
                                            <button
                                                onClick={() => handleClockAction('break_out')}
                                                className="w-full py-3.5 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-xl flex items-center justify-center gap-2 transition-all active:scale-98"
                                            >
                                                <span className="material-symbols-outlined">pause</span>
                                                Salida Temporal
                                            </button>
                                        )}

                                        {/* Botón Egreso de Jornada (Siempre disponible una vez ingresada y no egresada) */}
                                        <button
                                            onClick={() => handleClockAction('check_out')}
                                            className="w-full py-3.5 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl flex items-center justify-center gap-2 transition-all active:scale-98"
                                        >
                                            <span className="material-symbols-outlined">logout</span>
                                            Egreso de Jornada
                                        </button>
                                    </div>
                                )}
                            </div>

                            {/* Estado Red WiFi */}
                            <div className="w-full pt-4 border-t border-slate-100 flex flex-col items-center gap-1.5">
                                {loadingIp ? (
                                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider animate-pulse">Comprobando red WiFi...</p>
                                ) : (
                                    <div className="flex items-center gap-2">
                                        <span className={`size-2.5 rounded-full ${isIpMatch ? 'bg-emerald-500' : 'bg-rose-500'}`}></span>
                                        <p className="text-xs font-bold text-slate-600">
                                            {isIpMatch ? 'Conectado al WiFi de la Clínica' : 'Fuera del WiFi Autorizado'}
                                        </p>
                                    </div>
                                )}
                                <p className="text-[9px] text-slate-400 font-mono">IP: {clientIp || 'Cargando...'}</p>
                            </div>
                        </div>

                        {/* Historial Logs */}
                        <div className="lg:col-span-2 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col">
                            <h3 className="text-base font-bold text-slate-900 mb-4 flex items-center gap-2">
                                <span className="material-symbols-outlined text-slate-400">history</span>
                                Registro de Asistencia del Período
                            </h3>

                            {attendanceLogs.length === 0 ? (
                                <div className="flex-1 flex flex-col items-center justify-center py-12 text-slate-400 text-sm font-semibold italic">
                                    Sin registros cargados este mes.
                                </div>
                            ) : (
                                <div className="flex-1 overflow-y-auto max-h-[300px] divide-y divide-slate-100 custom-scrollbar pr-2">
                                    {attendanceHoursReport.displayLogs.map((log, idx) => (
                                        <div key={log.id || idx} className="py-3 flex justify-between items-center text-sm">
                                            <div className="flex items-center gap-3">
                                                <span className={`material-symbols-outlined p-2 rounded-full ${
                                                    log.type === 'check_in' ? 'bg-emerald-50 text-emerald-600' :
                                                    log.type === 'check_out' ? (log.isAuto ? 'bg-amber-50 text-amber-600' : 'bg-rose-50 text-rose-600') :
                                                    log.type === 'break_out' ? 'bg-amber-50 text-amber-600' :
                                                    'bg-blue-50 text-blue-600'
                                                }`}>
                                                    {
                                                        log.type === 'check_in' ? 'login' :
                                                        log.type === 'check_out' ? (log.isAuto ? 'timer_off' : 'logout') :
                                                        log.type === 'break_out' ? 'pause' : 'play_arrow'
                                                    }
                                                </span>
                                                <div>
                                                    <div className="flex items-center gap-2">
                                                        <p className="font-bold text-slate-800">
                                                            {
                                                                log.type === 'check_in' ? 'Entrada Turno' :
                                                                log.type === 'check_out' ? 'Salida Turno' :
                                                                log.type === 'break_out' ? 'Inicio Descanso' : 'Fin Descanso'
                                                            }
                                                        </p>
                                                        {log.isAuto && (
                                                            <span className="px-2 py-0.5 bg-amber-100 text-amber-800 text-[9px] font-extrabold uppercase rounded-full border border-amber-300">
                                                                Cerrado por falta de marca
                                                            </span>
                                                        )}
                                                    </div>
                                                    <p className="text-[10px] text-slate-400 font-mono">IP: {log.ip_address}</p>
                                                </div>
                                            </div>
                                            <div className="text-right">
                                                <p className="font-bold text-slate-700">
                                                    {new Date(log.timestamp).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                                                </p>
                                                <p className="text-xs text-slate-500">
                                                    {new Date(log.timestamp).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })} hs
                                                </p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* BILLING TAB */}
                {activeTab === 'billing' && (
                    <div className="space-y-6 animate-fadeIn">
                        {/* Overview Card */}
                        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                            <div>
                                <h3 className="text-base font-bold text-slate-900">Cirugías Realizadas</h3>
                                <p className="text-sm text-slate-500 mt-1">Cálculo de honorarios por procedimiento y tiempo de quirófano</p>
                            </div>
                            <div className="flex items-center gap-4">
                                <button
                                    onClick={() => setIsAddManualModalOpen(true)}
                                    className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-sm transition-all"
                                >
                                    <span className="material-symbols-outlined text-base">add_circle</span>
                                    Agregar Cirugía a mi Listado
                                </button>
                                <div className="text-right bg-slate-50 p-4 rounded-xl border border-slate-200 w-full md:w-auto">
                                    <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">Horas Fichadas ({attendanceHoursReport.totalHours.toFixed(2)} hs)</p>
                                    <p className="text-2xl font-black text-indigo-600 mt-1">${attendanceHoursReport.amount.toLocaleString()}</p>
                                </div>
                                <div className="text-right bg-slate-50 p-4 rounded-xl border border-slate-200 w-full md:w-auto">
                                    <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">Subtotal Cirugías</p>
                                    <p className="text-2xl font-black text-indigo-600 mt-1">${totalSurgeriesAmount.toLocaleString()}</p>
                                </div>
                            </div>
                        </div>

                        {/* Banner de Cirugías Pendientes de Validación */}
                        {surgeriesReport.some(s => s.isManual && s.manualStatus === 'pending') && (
                            <div className="bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent border border-amber-300/80 rounded-2xl p-4 flex items-center justify-between gap-4 shadow-sm animate-fadeIn">
                                <div className="flex items-center gap-3">
                                    <div className="p-2.5 bg-amber-500 text-white rounded-xl shadow-sm">
                                        <span className="material-symbols-outlined text-xl">hourglass_top</span>
                                    </div>
                                    <div>
                                        <p className="text-xs font-black text-amber-900 uppercase tracking-wide flex items-center gap-1.5">
                                            <span>Cirugías Agregadas Manualmente Pendientes de Validación</span>
                                            <span className="bg-amber-500 text-white text-[10px] px-2 py-0.2 rounded-full font-bold">
                                                {surgeriesReport.filter(s => s.isManual && s.manualStatus === 'pending').length}
                                            </span>
                                        </p>
                                        <p className="text-xs text-amber-800/90 mt-0.5">
                                            {canValidateManualSurgeries 
                                                ? 'Usted tiene permisos de validación (SuperAdmin / Dirección / Gerencia). Puede validar o rechazar estas cirugías directamente con los botones de acción en la tabla.'
                                                : 'Las cirugías agregadas manualmente por el instrumentador permanecen en espera y solo se computarán en el subtotal una vez validadas por SuperAdmin, Dirección o Administrativo de Gerencia.'}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* List Table */}
                        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden overflow-x-auto">
                            {surgeriesReport.length === 0 ? (
                                <div className="text-center py-12 text-slate-400 font-bold italic uppercase tracking-wider text-sm">
                                    No se registran cirugías realizadas para el técnico seleccionado en el período.
                                </div>
                            ) : (
                                <table className="w-full text-left">
                                    <thead className="bg-slate-100 text-slate-500 text-[10px] uppercase font-bold tracking-widest border-b border-slate-200">
                                        <tr>
                                            <th className="px-6 py-4">Fecha</th>
                                            <th className="px-6 py-4">Paciente</th>
                                            <th className="px-6 py-4">Procedimiento</th>
                                            <th className="px-6 py-4 text-center">Duración (Real / Redond.)</th>
                                            <th className="px-6 py-4 text-right">Tarifa Nomenclador</th>
                                            <th className="px-6 py-4 text-right">Tarifa Tiempo (Qx)</th>
                                            <th className="px-6 py-4 text-right bg-slate-50/50">Monto Qx Total</th>
                                            <th className="px-6 py-4 text-left">Cómputo / Regla</th>
                                            <th className="px-6 py-4 text-right bg-indigo-50/50 text-indigo-900 font-black">Mi Parte</th>
                                            <th className="px-4 py-4 text-center">Acciones</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 text-sm">
                                        {surgeriesReport.map((s, idx) => (
                                            <tr key={s.id || idx} className={`transition-colors ${s.isManual && s.manualStatus === 'pending' ? 'bg-amber-50/20 hover:bg-amber-50/40' : 'hover:bg-slate-50'}`}>
                                                <td className="px-6 py-4 font-bold text-slate-700">
                                                    {new Date(`${s.date}T12:00:00`).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' })}
                                                </td>
                                                <td className="px-6 py-4 font-bold text-slate-900 uppercase">{s.patient}</td>
                                                <td className="px-6 py-4 max-w-xs truncate font-medium text-slate-600" title={s.procedure}>
                                                    {s.procedure}
                                                </td>
                                                <td className="px-6 py-4 text-center font-semibold text-slate-700">
                                                    {s.realMin}m / <span className="text-indigo-600">{s.roundedMin}m</span>
                                                </td>
                                                <td className="px-6 py-4 text-right font-medium text-slate-600">
                                                    <div className="flex items-center justify-end gap-1.5">
                                                        {s.practiceRate > 0 ? (
                                                            <span className="font-bold text-slate-800">${s.practiceRate.toLocaleString()}</span>
                                                        ) : (
                                                            <span className="inline-flex items-center gap-0.5 px-2 py-0.5 bg-amber-50 text-amber-700 border border-amber-200 rounded text-[11px] font-bold" title="Sin tarifa de nomenclador establecida">
                                                                <span className="material-symbols-outlined text-xs text-amber-500">warning</span>
                                                                $0
                                                            </span>
                                                        )}
                                                        {isLevelAdmin && (
                                                            <button
                                                                onClick={() => openRateModal(s.practiceCode || s.rawCode, s.rawCode, s.procedureText || s.procedure, s.practiceRate, s.rateUpdatedAt, s.rateUpdatedByName)}
                                                                className={`p-1 rounded-md transition-all ${
                                                                    s.practiceRate > 0 
                                                                        ? 'text-slate-400 hover:text-indigo-600 hover:bg-indigo-50' 
                                                                        : 'text-indigo-600 bg-indigo-50 hover:bg-indigo-100 font-bold text-[10px] px-1.5 py-0.5 flex items-center gap-0.5 border border-indigo-200'
                                                                }`}
                                                                title={s.practiceRate > 0 ? `Editar tarifa de ${s.rawCode || s.practiceCode}` : `Cargar tarifa para ${s.rawCode || s.practiceCode}`}
                                                            >
                                                                {s.practiceRate > 0 ? (
                                                                    <span className="material-symbols-outlined text-sm">edit</span>
                                                                ) : (
                                                                    <>
                                                                        <span className="material-symbols-outlined text-xs">add</span>
                                                                        <span>Cargar</span>
                                                                    </>
                                                                )}
                                                            </button>
                                                        )}
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4 text-right font-medium text-slate-600">${s.timeCost.toLocaleString()}</td>
                                                <td className="px-6 py-4 text-right font-semibold bg-slate-50/50 text-slate-700">${s.totalCost.toLocaleString()}</td>
                                                <td className="px-6 py-4 text-left text-xs font-bold text-slate-500">
                                                     <div className="flex flex-col gap-1">
                                                         {s.isManual ? (
                                                             s.manualStatus === 'pending' ? (
                                                                 <div className="flex flex-col items-start gap-0.5">
                                                                     <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-100 text-amber-900 border border-amber-300 font-black text-[11px] animate-pulse shadow-2xs">
                                                                         <span className="material-symbols-outlined text-xs text-amber-700">hourglass_top</span>
                                                                         Pendiente de Validación
                                                                     </span>
                                                                     <span className="text-[10px] text-slate-500 font-normal pl-1">
                                                                         Por: {s.manualRecord?.created_by_name || 'Instrumentador'}
                                                                     </span>
                                                                 </div>
                                                             ) : s.manualStatus === 'approved' ? (
                                                                 <div className="flex flex-col items-start gap-0.5">
                                                                     <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-900 border border-emerald-300 font-bold text-[11px] shadow-2xs">
                                                                         <span className="material-symbols-outlined text-xs text-emerald-700">verified</span>
                                                                         Cargada Manual (Validada)
                                                                     </span>
                                                                     {s.manualRecord?.validated_by_name && (
                                                                         <span className="text-[10px] text-slate-500 font-normal pl-1">
                                                                             Aprobó: {s.manualRecord.validated_by_name}
                                                                         </span>
                                                                     )}
                                                                 </div>
                                                             ) : (
                                                                 <div className="flex flex-col items-start gap-0.5">
                                                                     <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-rose-100 text-rose-900 border border-rose-300 font-bold text-[11px]">
                                                                         <span className="material-symbols-outlined text-xs text-rose-700">cancel</span>
                                                                         Cargada Manual (Rechazada)
                                                                     </span>
                                                                     {s.manualRecord?.validated_by_name && (
                                                                         <span className="text-[10px] text-slate-500 font-normal pl-1">
                                                                             Por: {s.manualRecord.validated_by_name}
                                                                         </span>
                                                                     )}
                                                                 </div>
                                                             )
                                                         ) : (
                                                             <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full ${
                                                                 s.notes.includes('100%') ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-slate-100 text-slate-600 border border-slate-200'
                                                             }`}>
                                                                 {s.notes}
                                                             </span>
                                                         )}
                                                         
                                                         {s.isInstrumentadoraMismatch && (
                                                             <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-300 text-[10px]" title={`Técnico en ficha: ${s.formInstrumentadora}`}>
                                                                 <span className="material-symbols-outlined text-xs text-amber-600">warning</span>
                                                                 Ver: asignado/a en ficha ({s.formInstrumentadora}) no es del turno tarde ni de guardia
                                                             </span>
                                                         )}
                                                     </div>
                                                </td>
                                                <td className="px-6 py-4 text-right">
                                                    {s.isManual && s.manualStatus === 'pending' ? (
                                                        <div className="flex flex-col items-end">
                                                            <span className="text-sm font-black text-amber-700">$0</span>
                                                            <span className="text-[10px] font-semibold text-amber-600/90 leading-tight">
                                                                (Est. ${s.estimatedShare.toLocaleString()} al validar)
                                                            </span>
                                                        </div>
                                                    ) : s.isManual && s.manualStatus === 'rejected' ? (
                                                        <div className="flex flex-col items-end">
                                                            <span className="text-sm font-bold text-slate-400">$0</span>
                                                            <span className="text-[10px] text-rose-500">Rechazada</span>
                                                        </div>
                                                    ) : (
                                                        <span className="font-black bg-indigo-50/50 text-indigo-700 px-3 py-1.5 rounded-lg text-sm">
                                                            ${s.share.toLocaleString()}
                                                        </span>
                                                    )}
                                                </td>
                                                <td className="px-4 py-4 text-center">
                                                    <div className="flex items-center justify-center gap-1.5 flex-wrap">
                                                        {/* Acciones de Validación para SuperAdmin / Dirección / Gerencia */}
                                                        {s.isManual && s.manualStatus === 'pending' && (
                                                            canValidateManualSurgeries ? (
                                                                <div className="flex items-center gap-1">
                                                                    <button
                                                                        onClick={() => handleValidateManualSurgery(s.manualRecord.id, 'approve')}
                                                                        className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold shadow-xs flex items-center gap-1 transition-all active:scale-95"
                                                                        title="Aprobar y validar inclusión de cirugía"
                                                                    >
                                                                        <span className="material-symbols-outlined text-sm">check_circle</span>
                                                                        <span>Validar</span>
                                                                    </button>
                                                                    <button
                                                                        onClick={() => handleValidateManualSurgery(s.manualRecord.id, 'reject')}
                                                                        className="px-2 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-lg text-xs font-bold flex items-center gap-1 transition-all"
                                                                        title="Rechazar inclusión manual"
                                                                    >
                                                                        <span className="material-symbols-outlined text-sm">close</span>
                                                                        <span>Rechazar</span>
                                                                    </button>
                                                                </div>
                                                            ) : (
                                                                <span className="text-[10px] font-bold text-amber-700 bg-amber-50 px-2 py-1 rounded-md border border-amber-200 flex items-center gap-1" title="Pendiente de validación por SuperAdmin, Dirección o Gerencia">
                                                                    <span className="material-symbols-outlined text-xs animate-spin">progress_activity</span>
                                                                    Esperando Validación
                                                                </span>
                                                            )
                                                        )}

                                                        {/* Botón Sumar Técnico */}
                                                        {s.isSingleAssignee && (!s.isManual || s.manualStatus === 'approved') && (
                                                            <button
                                                                onClick={() => {
                                                                    setCoAssignSurgeryId(s.id);
                                                                    setIsCoAssignModalOpen(true);
                                                                }}
                                                                className="text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 p-1.5 rounded-lg transition-colors flex items-center gap-1 text-xs font-bold"
                                                                title="Sumar a otro técnico a esta cirugía"
                                                            >
                                                                <span className="material-symbols-outlined text-base">person_add</span>
                                                                <span className="hidden xl:inline">+ Sumar Técnico</span>
                                                            </button>
                                                        )}

                                                        {/* Botón Quitar/Eliminar Cirugía Manual */}
                                                        {s.isManual && (
                                                            <button
                                                                onClick={() => handleRemoveManualSurgery(s.id)}
                                                                className="text-slate-400 hover:text-rose-600 hover:bg-rose-50 p-1.5 rounded-lg transition-colors"
                                                                title={s.manualStatus === 'pending' ? "Cancelar solicitud de adición" : "Quitar cirugía del listado"}
                                                            >
                                                                <span className="material-symbols-outlined text-base">delete</span>
                                                            </button>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    </div>
                )}

                {/* GUARDS TAB */}
                {activeTab === 'guards' && (
                    <div className="space-y-6 animate-fadeIn">
                        
                        {/* Overview Card */}
                        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                            <div>
                                <h3 className="text-base font-bold text-slate-900">Guardias Realizadas</h3>
                                <p className="text-sm text-slate-500 mt-1">Cálculo proporcional de guardias cubiertas (Hábiles, Sábados, Domingos y Feriados)</p>
                            </div>
                            <div className="text-right bg-slate-50 p-4 rounded-xl border border-slate-200 w-full md:w-auto">
                                <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">Subtotal Guardias ({guardsReport.daysCount.toFixed(2)} días)</p>
                                <p className="text-2xl font-black text-emerald-600 mt-1">${guardsReport.totalAmount.toLocaleString()}</p>
                            </div>
                        </div>

                        {/* Detalle Guardias & Calendario */}
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                            
                            {/* Resumen numérico y Semanas */}
                            <div className="lg:col-span-1 space-y-6">
                                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
                                    <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest">Resumen de Días</h4>
                                    
                                    <div className="space-y-3">
                                        <div className="flex justify-between text-sm">
                                            <span className="text-slate-500 font-semibold">Equivalente de Hábiles:</span>
                                            <span className="font-bold text-slate-800">
                                                {guardsReport.weeksDetail.reduce((acc, curr) => acc + curr.equiv, 0).toFixed(2)} días
                                            </span>
                                        </div>
                                        <div className="flex justify-between text-sm">
                                            <span className="text-slate-500 font-semibold">Fines de Semana:</span>
                                            <span className="font-bold text-slate-800">{guardsReport.weekendDaysCount} días</span>
                                        </div>
                                        <div className="flex justify-between text-sm">
                                            <span className="text-slate-500 font-semibold">Feriados Nacionales:</span>
                                            <span className="font-bold text-slate-800">{guardsReport.holidaysCount} días</span>
                                        </div>
                                        <div className="h-px bg-slate-100 my-2"></div>
                                        <div className="flex justify-between text-sm font-bold text-indigo-600">
                                            <span>Total computable:</span>
                                            <span>{guardsReport.daysCount.toFixed(2)} días</span>
                                        </div>
                                    </div>
                                </div>

                                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col">
                                    <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4">Semanas Hábiles Trabajadas (Lunes a Viernes)</h4>
                                    
                                    {guardsReport.weeksDetail.length === 0 ? (
                                        <div className="flex-1 flex items-center justify-center text-xs text-slate-400 py-6 italic">
                                            No se computan días hábiles en guardias este período.
                                        </div>
                                    ) : (
                                        <div className="divide-y divide-slate-100 max-h-[250px] overflow-y-auto pr-2 custom-scrollbar">
                                            {guardsReport.weeksDetail.map((w, idx) => (
                                                <div key={idx} className="py-2.5 flex justify-between text-sm items-center">
                                                    <div>
                                                        <p className="font-bold text-slate-700">Semana del {new Date(`${w.week}T12:00:00`).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })}</p>
                                                        <p className="text-xs text-slate-400">Días trabajados: {w.daysCount}</p>
                                                    </div>
                                                    <div className="text-right">
                                                        <p className="font-black text-slate-800">{w.equiv.toFixed(2)} día</p>
                                                        <p className="text-[10px] text-slate-400">({w.daysCount}/5 de guardia)</p>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Calendario Visual de Guardias */}
                            <div className="lg:col-span-2 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col">
                                <div className="flex justify-between items-center mb-6">
                                    <h4 className="text-sm font-black text-slate-700 uppercase tracking-tight flex items-center gap-2">
                                        <span className="material-symbols-outlined text-indigo-600">calendar_month</span>
                                        Calendario de Guardias Asignadas
                                    </h4>
                                    
                                    {/* Leyenda */}
                                    <div className="flex gap-3 text-[10px] font-bold">
                                        <div className="flex items-center gap-1">
                                            <span className="size-2 rounded bg-emerald-500"></span>
                                            <span className="text-slate-500">Guardia Hábil</span>
                                        </div>
                                        <div className="flex items-center gap-1">
                                            <span className="size-2 rounded bg-indigo-500"></span>
                                            <span className="text-slate-500">Fin de Semana</span>
                                        </div>
                                        <div className="flex items-center gap-1">
                                            <span className="size-2 rounded bg-amber-500"></span>
                                            <span className="text-slate-500">Feriado</span>
                                        </div>
                                    </div>
                                </div>

                                {/* Rejilla del Calendario */}
                                <div className="grid grid-cols-7 gap-2 text-center text-xs">
                                    {/* Cabecera del día */}
                                    {['Dom', 'Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab'].map((d, i) => (
                                        <div key={i} className="font-black text-slate-400 uppercase text-[10px] tracking-wider pb-2 border-b border-slate-100">
                                            {d}
                                        </div>
                                    ))}
                                    
                                    {/* Celdas de días */}
                                    {(() => {
                                        const firstDayDate = new Date(selectedYear, selectedMonth, 1);
                                        const firstDayIndex = firstDayDate.getDay();
                                        const totalDays = new Date(selectedYear, selectedMonth + 1, 0).getDate();
                                        
                                        const cells = [];
                                        // Rellenar días vacíos antes del inicio del mes
                                        for (let i = 0; i < firstDayIndex; i++) {
                                            cells.push(<div key={`empty-${i}`} className="aspect-square bg-slate-50/50 rounded-xl border border-slate-100/30"></div>);
                                        }

                                        // Generar los días del mes
                                        for (let day = 1; day <= totalDays; day++) {
                                            const dateObj = new Date(selectedYear, selectedMonth, day);
                                            const dateStr = getLocalStr(dateObj);
                                            const onDuty = getOnDutyTecnicoForDate(dateStr);
                                            
                                            const isMe = onDuty && onDuty.id === selectedTecnicoId;
                                            const isHolidayDay = isHoliday(dateObj);
                                            const dayOfWeek = dateObj.getDay();
                                            const isWE = dayOfWeek === 0 || dayOfWeek === 6;

                                            let cellClass = "bg-slate-50 text-slate-500 border border-slate-100 hover:bg-slate-100/50";
                                            if (isMe) {
                                                if (isHolidayDay && !isWE) {
                                                    cellClass = "bg-amber-500 text-white font-bold shadow-md shadow-amber-100 border border-amber-600";
                                                } else if (isWE) {
                                                    cellClass = "bg-indigo-600 text-white font-bold shadow-md shadow-indigo-100 border border-indigo-700";
                                                } else {
                                                    cellClass = "bg-emerald-500 text-white font-bold shadow-md shadow-emerald-100 border border-emerald-600";
                                                }
                                            }

                                            cells.push(
                                                <div 
                                                    key={`day-${day}`} 
                                                    className={`aspect-square rounded-xl flex flex-col items-center justify-between p-2 transition-all relative ${cellClass}`}
                                                    title={isMe ? `Guardia asignada: ${isHolidayDay ? 'Feriado' : isWE ? 'Fin de Semana' : 'Día Hábil'}` : 'Sin asignación'}
                                                >
                                                    <span className="text-xs font-black">{day}</span>
                                                    {isMe && (
                                                        <span className="material-symbols-outlined text-[10px] absolute bottom-1 text-white/90">
                                                            {isHolidayDay ? 'star' : isWE ? 'event' : 'check_circle'}
                                                        </span>
                                                    )}
                                                </div>
                                            );
                                        }
                                        return cells;
                                    })()}
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* RATES TAB (ADMIN ONLY) */}
                {activeTab === 'rates' && isLevelAdmin && (
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-fadeIn">
                        
                        {/* Configurar Valores Globales */}
                        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between min-h-[350px]">
                            <h3 className="text-base font-bold text-slate-900 mb-4 flex items-center gap-2">
                                <span className="material-symbols-outlined text-slate-400">settings_suggest</span>
                                Valores Globales
                            </h3>

                            {(() => {
                                const hourRateObj = rates.find(r => r.rate_type === 'hour');
                                const guardRateObj = rates.find(r => r.rate_type === 'guard');
                                const clinicIpObj = rates.find(r => r.rate_type === 'clinic_ip');
                                const notifEmailObj = rates.find(r => r.rate_type === 'notification_email');

                                return (
                                    <div className="space-y-4 flex-1">
                                        <div>
                                            <div className="flex justify-between items-center mb-1">
                                                <label className="block text-xs font-bold text-slate-700 uppercase">Valor de la Hora de Cirugía ($)</label>
                                                {hourRateObj?.updated_at && (
                                                    <span className="text-[10px] text-indigo-600 font-semibold bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-100">
                                                        {formatLastUpdated(hourRateObj.updated_at, hourRateObj.updated_by_name)?.relativeStr}
                                                    </span>
                                                )}
                                            </div>
                                            <input
                                                type="number"
                                                className="w-full bg-slate-50 text-slate-900 font-bold rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-indigo-500 focus:border-indigo-500"
                                                value={hourRate}
                                                onChange={e => setHourRate(Number(e.target.value))}
                                            />
                                            <p className="text-[10px] text-slate-500 mt-1 flex items-center gap-1">
                                                <span className="material-symbols-outlined text-xs text-slate-400">history</span>
                                                {hourRateObj?.updated_at ? (
                                                    <span>Última edición: <strong className="text-slate-700">{formatLastUpdated(hourRateObj.updated_at)?.dateStr} {formatLastUpdated(hourRateObj.updated_at)?.timeStr} hs</strong> {hourRateObj.updated_by_name ? `por ${hourRateObj.updated_by_name}` : ''}</span>
                                                ) : (
                                                    <span className="text-slate-400 italic">Sin registro de edición previa</span>
                                                )}
                                            </p>
                                        </div>
                                        
                                        <div>
                                            <div className="flex justify-between items-center mb-1">
                                                <label className="block text-xs font-bold text-slate-700 uppercase">Valor del Día de Guardia ($)</label>
                                                {guardRateObj?.updated_at && (
                                                    <span className="text-[10px] text-indigo-600 font-semibold bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-100">
                                                        {formatLastUpdated(guardRateObj.updated_at, guardRateObj.updated_by_name)?.relativeStr}
                                                    </span>
                                                )}
                                            </div>
                                            <input
                                                type="number"
                                                className="w-full bg-slate-50 text-slate-900 font-bold rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-indigo-500 focus:border-indigo-500"
                                                value={guardRate}
                                                onChange={e => setGuardRate(Number(e.target.value))}
                                            />
                                            <p className="text-[10px] text-slate-500 mt-1 flex items-center gap-1">
                                                <span className="material-symbols-outlined text-xs text-slate-400">history</span>
                                                {guardRateObj?.updated_at ? (
                                                    <span>Última edición: <strong className="text-slate-700">{formatLastUpdated(guardRateObj.updated_at)?.dateStr} {formatLastUpdated(guardRateObj.updated_at)?.timeStr} hs</strong> {guardRateObj.updated_by_name ? `por ${guardRateObj.updated_by_name}` : ''}</span>
                                                ) : (
                                                    <span className="text-slate-400 italic">Sin registro de edición previa</span>
                                                )}
                                            </p>
                                        </div>

                                        <div>
                                            <div className="flex justify-between items-center mb-1">
                                                <label className="block text-xs font-bold text-slate-700 uppercase">IP Pública WiFi Clínica</label>
                                                {clinicIpObj?.updated_at && (
                                                    <span className="text-[10px] text-indigo-600 font-semibold bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-100">
                                                        {formatLastUpdated(clinicIpObj.updated_at, clinicIpObj.updated_by_name)?.relativeStr}
                                                    </span>
                                                )}
                                            </div>
                                            <input
                                                type="text"
                                                className="w-full bg-slate-50 text-slate-900 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-indigo-500 focus:border-indigo-500 font-mono"
                                                placeholder="Ej: 181.104.119.15, 190.57.246.74"
                                                value={inputClinicIp}
                                                onChange={e => setInputClinicIp(e.target.value)}
                                            />
                                            <p className="text-[10px] text-slate-500 mt-1 flex items-center gap-1">
                                                <span className="material-symbols-outlined text-xs text-slate-400">history</span>
                                                {clinicIpObj?.updated_at ? (
                                                    <span>Última edición: <strong className="text-slate-700">{formatLastUpdated(clinicIpObj.updated_at)?.dateStr} {formatLastUpdated(clinicIpObj.updated_at)?.timeStr} hs</strong> {clinicIpObj.updated_by_name ? `por ${clinicIpObj.updated_by_name}` : ''}</span>
                                                ) : (
                                                    <span className="text-slate-400 italic">Sin registro de edición previa</span>
                                                )}
                                            </p>
                                            <p className="text-[10px] text-indigo-600 mt-1 italic">
                                                Admite múltiples IPs separadas por coma. Tu IP actual es: {clientIp || 'No detectada'}
                                            </p>
                                        </div>

                                        <div>
                                            <div className="flex justify-between items-center mb-1">
                                                <label className="block text-xs font-bold text-slate-700 uppercase">Correo Notificación Cierre de Mes</label>
                                                {notifEmailObj?.updated_at && (
                                                    <span className="text-[10px] text-indigo-600 font-semibold bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-100">
                                                        {formatLastUpdated(notifEmailObj.updated_at, notifEmailObj.updated_by_name)?.relativeStr}
                                                    </span>
                                                )}
                                            </div>
                                            <input
                                                type="email"
                                                className="w-full bg-slate-50 text-slate-900 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-indigo-500 focus:border-indigo-500"
                                                placeholder="Ej: administracion@iteo.com.ar"
                                                value={inputNotificationEmail}
                                                onChange={e => setInputNotificationEmail(e.target.value)}
                                            />
                                            <p className="text-[10px] text-slate-500 mt-1 flex items-center gap-1">
                                                <span className="material-symbols-outlined text-xs text-slate-400">history</span>
                                                {notifEmailObj?.updated_at ? (
                                                    <span>Última edición: <strong className="text-slate-700">{formatLastUpdated(notifEmailObj.updated_at)?.dateStr} {formatLastUpdated(notifEmailObj.updated_at)?.timeStr} hs</strong> {notifEmailObj.updated_by_name ? `por ${notifEmailObj.updated_by_name}` : ''}</span>
                                                ) : (
                                                    <span className="text-slate-400 italic">Sin registro de edición previa</span>
                                                )}
                                            </p>
                                            <p className="text-[10px] text-slate-400 mt-0.5 italic">
                                                Al dar conformidad, se enviará el resumen a este correo y con copia al técnico.
                                            </p>
                                        </div>
                                    </div>
                                );
                            })()}

                            <button
                                onClick={handleSaveGlobalRates}
                                disabled={isSavingRate}
                                className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg shadow-md mt-6 transition-all active:scale-98"
                            >
                                {isSavingRate ? 'Guardando...' : 'Guardar Valores'}
                            </button>
                        </div>

                        {/* Configurar Valores Nomenclador */}
                        <div className="lg:col-span-2 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                                <div>
                                    <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                                        <span className="material-symbols-outlined text-slate-400">list_alt</span>
                                        Tarifas por Práctica (Nomenclador OSER / AOTER)
                                    </h3>
                                    <p className="text-xs text-slate-500 mt-0.5">
                                        Listado completo de prácticas. Asigne o modifique los valores de cada práctica para el cálculo de honorarios.
                                    </p>
                                </div>
                            </div>

                            {/* Buscador y Ordenador de Prácticas */}
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
                                <div className="sm:col-span-2 relative">
                                    <span className="material-symbols-outlined absolute left-3 top-2.5 text-slate-400 text-base">search</span>
                                    <input
                                        type="text"
                                        className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-4 py-2 text-xs font-medium text-slate-800 focus:bg-white focus:ring-2 focus:ring-indigo-500 transition-all"
                                        placeholder="Buscar práctica por código (ej: 1210708, 121.01.01, MS.01.01)..."
                                        value={practiceSearchFilter}
                                        onChange={e => setPracticeSearchFilter(e.target.value)}
                                    />
                                </div>
                                <div className="sm:col-span-1 flex items-center gap-1 bg-slate-50 border border-slate-200 rounded-xl px-3 py-1">
                                    <span className="material-symbols-outlined text-slate-400 text-sm">sort</span>
                                    <select
                                        className="w-full bg-transparent text-xs font-bold text-slate-700 focus:outline-none cursor-pointer py-1"
                                        value={practiceSortOption}
                                        onChange={e => setPracticeSortOption(e.target.value as any)}
                                    >
                                        <option value="cases_desc">Más Frecuentes (Casos ↓)</option>
                                        <option value="cases_asc">Menos Frecuentes (Casos ↑)</option>
                                        <option value="code_asc">Código (A-Z / Menor)</option>
                                        <option value="code_desc">Código (Z-A / Mayor)</option>
                                        <option value="price_desc">Precio (Mayor a Menor)</option>
                                        <option value="price_asc">Precio (Menor a Mayor)</option>
                                    </select>
                                </div>
                            </div>

                            {/* Cargar Práctica Manual */}
                            <div className="grid grid-cols-3 gap-3 mb-6 bg-slate-50 p-4 rounded-xl border border-slate-200">
                                <div className="col-span-1">
                                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Código (Ej: 1210708)</label>
                                    <input
                                        type="text"
                                        className="w-full bg-white text-slate-900 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-mono"
                                        placeholder="Código práctica..."
                                        value={practiceCodeInput}
                                        onChange={e => setPracticeCodeInput(e.target.value)}
                                    />
                                </div>
                                <div className="col-span-1">
                                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Monto ($)</label>
                                    <input
                                        type="number"
                                        className="w-full bg-white text-slate-900 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-bold"
                                        value={practiceValueInput}
                                        onChange={e => setPracticeValueInput(Number(e.target.value))}
                                    />
                                </div>
                                <div className="col-span-1 flex items-end">
                                    <button
                                        onClick={handleSavePracticeRate}
                                        disabled={isSavingRate}
                                        className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg text-xs transition-colors shadow-sm"
                                    >
                                        Agregar / Actualizar
                                    </button>
                                </div>
                            </div>

                            {/* Listado Completo de Prácticas Nomencladas con Tarifas y Pendientes */}
                            <div className="flex-1 overflow-y-auto max-h-[350px] divide-y divide-slate-100 pr-2 custom-scrollbar">
                                {(() => {
                                    // 1. Contar frecuencia de casos y capturar nombres/descripciones por código
                                    const practiceCaseCounts = new Map<string, number>();
                                    const practiceDescriptions = new Map<string, string>();

                                    surgeries.forEach(s => {
                                        let rawCode = '';
                                        let procedureText = '';
                                        
                                        const matchBracket = s.procedure?.match(/^\[(.*?)\]\s*(.*)/);
                                        const matchColon = s.procedure?.match(/^(.*?):\s*(.*)/);
                                        
                                        if (matchBracket) {
                                            rawCode = matchBracket[1].trim();
                                            procedureText = matchBracket[2].trim();
                                        } else if (matchColon) {
                                            rawCode = matchColon[1].trim();
                                            procedureText = matchColon[2].trim();
                                        } else if (s.procedure) {
                                            procedureText = s.procedure.trim();
                                        }

                                        const mappedAoterCode = (nomencladorData.mapping as Record<string, string>)[rawCode] || rawCode;
                                        const code = mappedAoterCode.replace(/\./g, '').trim();
                                        
                                        if (code) {
                                            practiceCaseCounts.set(code, (practiceCaseCounts.get(code) || 0) + 1);
                                            if (procedureText && !practiceDescriptions.has(code)) {
                                                practiceDescriptions.set(code, procedureText);
                                            }
                                        }
                                    });

                                    // 2. Mapeo completo de prácticas provenientes del nomenclador
                                    const mappingObj = nomencladorData.mapping as Record<string, string>;
                                    
                                    // Crear mapa de pares { oserCode, aoterCode } indexado por la versión numérica (OSER)
                                    const practiceEntriesMap = new Map<string, { oserCode: string; aoterCode: string; rateCode: string }>();

                                    Object.keys(mappingObj).forEach(k => {
                                        // Procesar prioritariamente las claves numéricas (OSER), ej: 121.01.04
                                        if (/^\d/.test(k)) {
                                            const oserClean = k.replace(/\./g, '').trim();
                                            const aoterVal = mappingObj[k] || k;
                                            const aoterClean = aoterVal.replace(/\./g, '').trim();

                                            if (!practiceEntriesMap.has(oserClean)) {
                                                practiceEntriesMap.set(oserClean, {
                                                    oserCode: k,
                                                    aoterCode: aoterVal,
                                                    rateCode: aoterClean
                                                });
                                            }
                                        }
                                    });

                                    // Para claves alfanuméricas de AOTER que no tuvieron equivalente OSER explícito
                                    Object.keys(mappingObj).forEach(k => {
                                        if (!/^\d/.test(k)) {
                                            const cleanK = k.replace(/\./g, '').trim();
                                            const isAlreadyMapped = Array.from(practiceEntriesMap.values()).some(e => e.aoterCode.replace(/\./g, '').trim() === cleanK);
                                            if (!isAlreadyMapped && !practiceEntriesMap.has(cleanK)) {
                                                practiceEntriesMap.set(cleanK, {
                                                    oserCode: k,
                                                    aoterCode: k,
                                                    rateCode: cleanK
                                                });
                                            }
                                        }
                                    });

                                    // Incorporar también tarifas cargadas explícitamente en la base de datos
                                    practiceRates.forEach(r => {
                                        if (r.practice_code && !practiceEntriesMap.has(r.practice_code)) {
                                            practiceEntriesMap.set(r.practice_code, {
                                                oserCode: r.practice_code,
                                                aoterCode: r.practice_code,
                                                rateCode: r.practice_code
                                            });
                                        }
                                    });

                                    let allEntries = Array.from(practiceEntriesMap.values());

                                    // 3. Ordenamiento dinámico según la opción seleccionada por el usuario
                                    allEntries.sort((entryA, entryB) => {
                                        const countA = practiceCaseCounts.get(entryA.rateCode) || practiceCaseCounts.get(entryA.oserCode.replace(/\./g, '')) || 0;
                                        const countB = practiceCaseCounts.get(entryB.rateCode) || practiceCaseCounts.get(entryB.oserCode.replace(/\./g, '')) || 0;
                                        const rateA = practiceRates.find(r => r.practice_code === entryA.rateCode)?.value || 0;
                                        const rateB = practiceRates.find(r => r.practice_code === entryB.rateCode)?.value || 0;

                                        if (practiceSortOption === 'cases_desc') {
                                            if (countB !== countA) return countB - countA;
                                            return entryA.oserCode.localeCompare(entryB.oserCode);
                                        }
                                        if (practiceSortOption === 'cases_asc') {
                                            if (countA !== countB) return countA - countB;
                                            return entryA.oserCode.localeCompare(entryB.oserCode);
                                        }
                                        if (practiceSortOption === 'code_asc') return entryA.oserCode.localeCompare(entryB.oserCode);
                                        if (practiceSortOption === 'code_desc') return entryB.oserCode.localeCompare(entryA.oserCode);
                                        if (practiceSortOption === 'price_desc') {
                                            if (rateB !== rateA) return rateB - rateA;
                                            return entryA.oserCode.localeCompare(entryB.oserCode);
                                        }
                                        if (practiceSortOption === 'price_asc') {
                                            if (rateA !== rateB) return rateA - rateB;
                                            return entryA.oserCode.localeCompare(entryB.oserCode);
                                        }
                                        return 0;
                                    });

                                    // 4. Filtrar por término de búsqueda si el usuario ingresó algo (código o descripción)
                                    if (practiceSearchFilter.trim()) {
                                        const query = practiceSearchFilter.toLowerCase().replace(/\./g, '').trim();
                                        allEntries = allEntries.filter(e => {
                                            const desc = (practiceDescriptions.get(e.rateCode) || practiceDescriptions.get(e.oserCode.replace(/\./g, '')) || '').toLowerCase();
                                            return (
                                                e.oserCode.toLowerCase().replace(/\./g, '').includes(query) ||
                                                e.aoterCode.toLowerCase().replace(/\./g, '').includes(query) ||
                                                desc.includes(query)
                                            );
                                        });
                                    }

                                    if (allEntries.length === 0) {
                                        return (
                                            <div className="text-center py-12 text-xs text-slate-400 italic">
                                                No se encontraron prácticas que coincidan con la búsqueda.
                                            </div>
                                        );
                                    }

                                    return allEntries.map(entry => {
                                        const existingRate = practiceRates.find(r => r.practice_code === entry.rateCode || r.practice_code === entry.oserCode.replace(/\./g, ''));
                                        const hasPrice = existingRate && existingRate.value > 0;
                                        const caseCount = practiceCaseCounts.get(entry.rateCode) || practiceCaseCounts.get(entry.oserCode.replace(/\./g, '')) || 0;
                                        
                                        // Buscar descripción registrada en cirugías o en las descripciones estáticas del nomenclador
                                        const catalogDescs = (nomencladorData as any).descriptions || {};
                                        const desc = practiceDescriptions.get(entry.rateCode) || 
                                                     practiceDescriptions.get(entry.oserCode.replace(/\./g, '')) || 
                                                     catalogDescs[entry.aoterCode] || 
                                                     catalogDescs[entry.oserCode] || 
                                                     '';

                                        // Solo mostrar entre paréntesis si el código AOTER es distinto al OSER mostrado
                                        const showParensAoter = entry.aoterCode && entry.aoterCode !== entry.oserCode;
                                        const fullTitle = `Práctica OSER ${entry.oserCode}${showParensAoter ? ` | AOTER (${entry.aoterCode})` : ''}${desc ? ` - ${desc}` : ''}`;

                                        return (
                                            <div
                                                key={entry.oserCode}
                                                className="py-2.5 flex justify-between items-center text-sm font-medium hover:bg-slate-50/80 px-2 rounded-lg transition-colors group cursor-default"
                                                title={fullTitle}
                                            >
                                                <div className="flex items-center gap-2.5 max-w-[70%] min-w-0">
                                                    <span className="material-symbols-outlined text-indigo-500/70 text-base shrink-0">medical_services</span>
                                                    <div className="flex flex-col min-w-0">
                                                        <div className="flex items-center gap-2 flex-wrap">
                                                            <span className="font-bold text-slate-800 font-mono text-xs truncate" title={fullTitle}>
                                                                Práctica {entry.oserCode} {showParensAoter && <span className="text-slate-400 font-normal">({entry.aoterCode})</span>}
                                                            </span>
                                                            {caseCount > 0 && (
                                                                <span className="px-2 py-0.5 bg-indigo-50 text-indigo-700 border border-indigo-200 text-[10px] font-extrabold rounded-md flex items-center gap-1 shrink-0">
                                                                    <span className="material-symbols-outlined text-[11px]">medical_services</span>
                                                                    {caseCount} {caseCount === 1 ? 'caso' : 'casos'}
                                                                </span>
                                                            )}
                                                        </div>
                                                        {desc && (
                                                            <span className="text-[11px] text-slate-500 font-normal truncate mt-0.5" title={desc}>
                                                                {desc}
                                                            </span>
                                                        )}
                                                        {existingRate?.updated_at ? (
                                                            <span className="text-[10px] text-slate-400 font-normal flex items-center gap-1 mt-0.5">
                                                                <span className="material-symbols-outlined text-[11px] text-slate-400">history</span>
                                                                Editado: <strong className="text-slate-600 font-semibold">{formatLastUpdated(existingRate.updated_at)?.dateStr} {formatLastUpdated(existingRate.updated_at)?.timeStr} hs</strong> {existingRate.updated_by_name ? `por ${existingRate.updated_by_name}` : ''} ({formatLastUpdated(existingRate.updated_at)?.relativeStr})
                                                            </span>
                                                        ) : hasPrice ? (
                                                            <span className="text-[10px] text-slate-400 italic mt-0.5">Sin registro de fecha previa</span>
                                                        ) : null}
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-3 shrink-0">
                                                    {hasPrice ? (
                                                        <span className="px-2.5 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg text-xs font-black">
                                                            ${existingRate.value.toLocaleString()}
                                                        </span>
                                                    ) : (
                                                        <span className="px-2.5 py-1 bg-amber-50 text-amber-700 border border-amber-200 rounded-lg text-[11px] font-bold flex items-center gap-1">
                                                            <span className="material-symbols-outlined text-xs text-amber-500">warning</span>
                                                            Sin Precio ($0)
                                                        </span>
                                                    )}
                                                    <button
                                                        onClick={() => {
                                                            openRateModal(entry.rateCode, entry.oserCode, desc, existingRate?.value || 0, existingRate?.updated_at, existingRate?.updated_by_name);
                                                        }}
                                                        className={`text-xs font-bold px-2.5 py-1 rounded-lg transition-colors flex items-center gap-1 ${hasPrice ? 'text-indigo-600 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100' : 'text-emerald-700 hover:text-emerald-900 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 shadow-sm'}`}
                                                        title={`Cargar o modificar precio para ${entry.oserCode} (${entry.aoterCode})`}
                                                    >
                                                        <span className="material-symbols-outlined text-xs">{hasPrice ? 'edit' : 'add_circle'}</span>
                                                        {hasPrice ? 'Editar' : 'Cargar Precio'}
                                                    </button>
                                                    {existingRate?.id && (
                                                        <button
                                                            onClick={() => handleDeletePracticeRate(existingRate.id!)}
                                                            className="text-slate-400 hover:text-rose-600 p-1"
                                                            title="Eliminar tarifa"
                                                        >
                                                            <span className="material-symbols-outlined text-base">delete</span>
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    });
                                })()}
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Bottom Consent Panel */}
            {selectedTecnicoId && (
                <div className="mt-8 bg-white border border-slate-200 rounded-2xl p-6 shadow-xl flex flex-col md:flex-row justify-between items-start md:items-center gap-4 relative overflow-hidden">
                    <div className="absolute top-0 inset-x-0 h-1.5 bg-indigo-600"></div>
                    <div>
                        <h3 className="text-lg font-black text-slate-900 tracking-tight flex items-center gap-2">
                            <span className="material-symbols-outlined text-indigo-600">verified</span>
                            Liquidación Total y Cierre Mensual
                        </h3>
                        <p className="text-xs text-slate-500 mt-1 leading-normal">
                            Suma acumulada de cirugías y guardias para el período seleccionado.
                        </p>
                    </div>

                    <div className="flex flex-col md:flex-row items-stretch md:items-center gap-4 w-full md:w-auto">
                        <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 text-center md:text-right min-w-[200px]">
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Total a Liquidar</p>
                            <p className="text-3xl font-black text-indigo-700 mt-1">${grandTotalAmount.toLocaleString()}</p>
                        </div>
                        
                        {currentConsent ? (
                            <div className="bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-xl p-4 flex flex-col justify-center items-center gap-1">
                                <span className="px-2 py-0.5 bg-emerald-600 text-white text-[9px] font-bold uppercase tracking-wider rounded-md">Conformidad Brindada</span>
                                <p className="text-[10px] font-bold mt-1 text-center">
                                    Firmado el {new Date(currentConsent.consented_at).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' })} a las {new Date(currentConsent.consented_at).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })} hs
                                </p>
                            </div>
                        ) : (
                            <button
                                onClick={handleGiveConsent}
                                className="px-6 py-4 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-lg shadow-indigo-100 flex items-center justify-center gap-2 transition-all active:scale-97 text-sm"
                            >
                                <span className="material-symbols-outlined">edit_document</span>
                                Dar Consentimiento / Conformidad
                            </button>
                        )}
                    </div>
                </div>
            )}

            {/* Modal para Agregar Cirugía Manualmente */}
            {isAddManualModalOpen && (
                <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn">
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-lg w-full p-6 space-y-4">
                        <div className="flex justify-between items-center border-b border-slate-100 pb-3">
                            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                                <span className="material-symbols-outlined text-indigo-600">add_circle</span>
                                Agregar Cirugía Manual
                            </h3>
                            <button
                                onClick={() => {
                                    setIsAddManualModalOpen(false);
                                    setSelectedManualSurgeryId('');
                                }}
                                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
                            >
                                <span className="material-symbols-outlined">close</span>
                            </button>
                        </div>

                        <p className="text-xs text-slate-500">
                            Seleccione una cirugía completada en el período para incluirla en el listado del técnico seleccionado.
                        </p>

                        {!canValidateManualSurgeries && (
                            <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-xs text-amber-900 flex items-start gap-2">
                                <span className="material-symbols-outlined text-base text-amber-600 shrink-0 mt-0.5">info</span>
                                <p>
                                    <strong>Nota de validación:</strong> Al agregarla, la cirugía quedará en estado <strong>"Pendiente de Validación"</strong> y solo podrá ser aprobada para liquidación por un usuario de tipo <strong>SuperAdmin, Dirección o Administrativo de Gerencia</strong>.
                                </p>
                            </div>
                        )}

                        <div className="space-y-2">
                            <label className="text-xs font-bold text-slate-700">Cirugías Disponibles ({surgeries.length}):</label>
                            <select
                                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium text-slate-800 focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all"
                                value={selectedManualSurgeryId}
                                onChange={e => setSelectedManualSurgeryId(e.target.value)}
                            >
                                <option value="">-- Seleccionar Cirugía --</option>
                                {surgeries.map(s => {
                                    const isAlreadyIncluded = filteredSurgeries.some(fs => fs.id === s.id);
                                    return (
                                        <option key={s.id} value={s.id} disabled={isAlreadyIncluded}>
                                            {s.date} | {s.patient?.name || 'Paciente sin nombre'} - {s.procedure} ({s.actual_start_time || 'Sin hora'}) {isAlreadyIncluded ? '(Ya incluida)' : ''}
                                        </option>
                                    );
                                })}
                            </select>
                        </div>

                        <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
                            <button
                                onClick={() => {
                                    setIsAddManualModalOpen(false);
                                    setSelectedManualSurgeryId('');
                                }}
                                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-all"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleAddManualSurgery}
                                disabled={!selectedManualSurgeryId || isSavingManualSurgery}
                                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-sm transition-all flex items-center gap-1"
                            >
                                {isSavingManualSurgery ? 'Guardando...' : canValidateManualSurgeries ? 'Confirmar e Incluir' : 'Solicitar Inclusión'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal para Sumar/Coparticipar a Segundo Técnico */}
            {isCoAssignModalOpen && (
                <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn">
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-lg w-full p-6 space-y-4">
                        <div className="flex justify-between items-center border-b border-slate-100 pb-3">
                            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                                <span className="material-symbols-outlined text-indigo-600">person_add</span>
                                Sumar Técnico a la Cirugía
                            </h3>
                            <button
                                onClick={() => {
                                    setIsCoAssignModalOpen(false);
                                    setCoAssignSurgeryId('');
                                    setCoAssignTecnicoId('');
                                }}
                                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
                            >
                                <span className="material-symbols-outlined">close</span>
                            </button>
                        </div>

                        <p className="text-xs text-slate-500">
                            Seleccione un técnico disponible (fijo o de guardia) para coparticipar al 50% en los honorarios de esta cirugía.
                        </p>

                        {!canValidateManualSurgeries && (
                            <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-xs text-amber-900 flex items-start gap-2">
                                <span className="material-symbols-outlined text-base text-amber-600 shrink-0 mt-0.5">info</span>
                                <p>
                                    <strong>Nota de validación:</strong> La coparticipación quedará en estado <strong>"Pendiente de Validación"</strong> hasta ser aprobada por <strong>SuperAdmin, Dirección o Administrativo de Gerencia</strong>.
                                </p>
                            </div>
                        )}

                        <div className="space-y-2">
                            <label className="text-xs font-bold text-slate-700">Técnico a incorporar:</label>
                            <select
                                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium text-slate-800 focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all"
                                value={coAssignTecnicoId}
                                onChange={e => setCoAssignTecnicoId(e.target.value)}
                            >
                                <option value="">-- Seleccionar Técnico --</option>
                                {tecnicos.filter(t => t.id !== selectedTecnicoId).map(t => (
                                    <option key={t.id} value={t.id}>
                                        {t.name} {t.is_turno_tarde ? '(Fijo Tarde)' : '(Guardia)'}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
                            <button
                                onClick={() => {
                                    setIsCoAssignModalOpen(false);
                                    setCoAssignSurgeryId('');
                                    setCoAssignTecnicoId('');
                                }}
                                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-all"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleCoAssignTecnico}
                                disabled={!coAssignTecnicoId || isSavingManualSurgery}
                                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-sm transition-all flex items-center gap-1"
                            >
                                {isSavingManualSurgery ? 'Guardando...' : 'Confirmar Coparticipación'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal para Carga / Edición Directa de Tarifa de Práctica */}
            {rateModalConfig.isOpen && (
                <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn">
                    <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-md w-full overflow-hidden animate-scaleUp">
                        <div className="bg-gradient-to-r from-indigo-600 to-indigo-700 p-5 text-white flex justify-between items-center">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-white/10 rounded-xl">
                                    <span className="material-symbols-outlined text-2xl">receipt_long</span>
                                </div>
                                <div>
                                    <h3 className="text-base font-bold">Tarifa de Práctica</h3>
                                    <p className="text-xs text-indigo-100">Configuración de valor para liquidación</p>
                                </div>
                            </div>
                            <button
                                onClick={() => setRateModalConfig(prev => ({ ...prev, isOpen: false }))}
                                className="text-white/80 hover:text-white p-1.5 rounded-lg hover:bg-white/10 transition-colors"
                            >
                                <span className="material-symbols-outlined">close</span>
                            </button>
                        </div>

                        <form
                            onSubmit={async (e) => {
                                e.preventDefault();
                                const success = await savePracticeRateValue(
                                    rateModalConfig.code, 
                                    rateModalInputValue, 
                                    rateModalConfig.oserCode
                                );
                                if (success) {
                                    setRateModalConfig(prev => ({ ...prev, isOpen: false }));
                                }
                            }}
                            className="p-6 space-y-4"
                        >
                            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2">
                                <div className="flex items-center justify-between">
                                    <span className="text-xs font-mono font-bold text-slate-800">
                                        Práctica {rateModalConfig.oserCode || rateModalConfig.code}
                                    </span>
                                    {rateModalConfig.code && rateModalConfig.code !== rateModalConfig.oserCode && (
                                        <span className="text-[11px] font-mono text-slate-500 bg-white px-2 py-0.5 rounded border border-slate-200">
                                            AOTER: {rateModalConfig.code}
                                        </span>
                                    )}
                                </div>
                                {rateModalConfig.description && (
                                    <p className="text-xs text-slate-600 leading-relaxed font-medium">
                                        {rateModalConfig.description}
                                    </p>
                                )}
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                                    Monto de la Tarifa ($)
                                </label>
                                <div className="relative">
                                    <span className="absolute left-3.5 top-3 text-slate-400 font-bold text-base">$</span>
                                    <input
                                        type="number"
                                        min="0"
                                        step="any"
                                        autoFocus
                                        required
                                        className="w-full bg-slate-50 focus:bg-white text-slate-900 font-black rounded-xl border border-slate-300 pl-8 pr-4 py-2.5 text-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all"
                                        placeholder="0"
                                        value={rateModalInputValue}
                                        onChange={e => setRateModalInputValue(Number(e.target.value))}
                                    />
                                </div>
                            </div>

                            {rateModalConfig.updated_at && (
                                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-[11px] text-slate-500 flex items-start gap-2.5">
                                    <span className="material-symbols-outlined text-slate-400 text-base shrink-0 mt-0.5">history</span>
                                    <div>
                                        <p className="font-semibold text-slate-700">
                                            Última edición: {formatLastUpdated(rateModalConfig.updated_at)?.fullText}
                                        </p>
                                        {rateModalConfig.updated_by_name && (
                                            <p className="text-slate-400 mt-0.5">
                                                Modificado por: <strong className="text-slate-600">{rateModalConfig.updated_by_name}</strong>
                                            </p>
                                        )}
                                    </div>
                                </div>
                            )}

                            <div className="flex gap-3 pt-3 border-t border-slate-100">
                                <button
                                    type="button"
                                    onClick={() => setRateModalConfig(prev => ({ ...prev, isOpen: false }))}
                                    className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-colors"
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="submit"
                                    disabled={isSavingRate}
                                    className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-md transition-all flex items-center justify-center gap-1.5"
                                >
                                    <span className="material-symbols-outlined text-sm">save</span>
                                    {isSavingRate ? 'Guardando...' : 'Guardar Tarifa'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
