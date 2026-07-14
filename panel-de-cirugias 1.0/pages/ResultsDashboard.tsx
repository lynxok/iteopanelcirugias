import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Calendar,
    ChevronLeft,
    ChevronRight,
    Search,
    Filter,
    ArrowUpRight,
    ArrowDownRight,
    Clock,
    User,
    Activity,
    Users,
    Stethoscope,
    Building2,
    CheckCircle2,
    CalendarDays,
    BarChart3,
    ArrowRight,
    Download,
    TrendingUp,
    AlertCircle,
    BrainCircuit,
    Maximize2,
    LayoutDashboard,
    FileSpreadsheet,
    PlusCircle,
    Info,
    Eye,
    Zap,
    X,
    Database
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, PieChart, Pie, LineChart, Line, AreaChart, Area, ScatterChart, Scatter, ZAxis, ComposedChart, Legend } from 'recharts';
import nomencladorMapping from '../src/data/nomenclador_mapping.json';
import * as XLSX from 'xlsx';
import {
    format,
    startOfWeek,
    endOfWeek,
    startOfMonth,
    endOfMonth,
    startOfQuarter,
    endOfQuarter,
    startOfYear,
    endOfYear,
    isSameDay,
    isSameMonth,
    isSameQuarter,
    isSameYear,
    isWeekend,
    addDays,
    addMonths,
    subDays,
    subMonths,
    subQuarters,
    subYears,
    eachDayOfInterval,
    eachMonthOfInterval,
    eachQuarterOfInterval,
    eachYearOfInterval,
    differenceInDays,
    parseISO,
    isValid
} from 'date-fns';
import { es } from 'date-fns/locale';
import { useAuth } from '../src/lib/AuthContext';
import { supabase } from '../src/lib/supabase';
import { Surgery } from '../types';
import ProgressBar from '../components/ProgressBar';
import { utils, writeFile } from 'xlsx';
import HospitalizationStats from './HospitalizationStats';

// Helper to parse "YYYY-MM-DD" reliably into a local Date object without Timezone shifting
const parseLocalDate = (dateStr: string) => {
    if (!dateStr) return null;
    const [year, month, day] = dateStr.split('-').map(Number);
    return new Date(year, month - 1, day);
};

// Helper to normalize procedure codes (remove dots, hyphens, brackets, spaces, and make uppercase)
const normalizeCode = (code: string) => {
    return code.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
};

// Pre-process nomenclador mapping with normalized keys
const normalizedNomencladorMapping = Object.fromEntries(
    Object.entries(nomencladorMapping.mapping).map(([key, val]) => [
        normalizeCode(key),
        val
    ])
);

// Helper to parse procedure code and clean name
const extractProcedureCodeAndName = (procedureName: string) => {
    if (!procedureName) return { code: '', cleanName: '' };
    
    // Format 1: [CODE] Name
    const bracketMatch = procedureName.match(/^\[(.*?)\]\s*(.*)$/);
    if (bracketMatch) {
        return {
            code: bracketMatch[1].trim(),
            cleanName: bracketMatch[2].trim()
        };
    }
    
    // Format 2: CODE followed by separator (colon, hyphen, or space) and Name
    // A code starts with letters/numbers and has at least one dot or hyphen, e.g. PC.09.01 or 121.01.01
    const genericMatch = procedureName.match(/^([A-Za-z0-9]+(?:[\.\-][A-Za-z0-9]+)+)\s*[\s\-:]\s*(.*)$/);
    if (genericMatch) {
        return {
            code: genericMatch[1].trim(),
            cleanName: genericMatch[2].trim()
        };
    }

    // Format 3: Just the CODE (e.g. "PC.09.01")
    const codeOnlyMatch = procedureName.match(/^([A-Za-z0-9]+(?:[\.\-][A-Za-z0-9]+)+)$/);
    if (codeOnlyMatch) {
        return {
            code: codeOnlyMatch[1].trim(),
            cleanName: ''
        };
    }

    // Format 4: CODE: Name (fallback for codes without dots/hyphens but short prefix with colon)
    const colonMatch = procedureName.match(/^([^:]+?)\s*:\s*(.*)$/);
    if (colonMatch) {
        const prefix = colonMatch[1].trim();
        const suffix = colonMatch[2].trim();
        if (/\d/.test(prefix) || prefix.length < 15) {
            return {
                code: prefix,
                cleanName: suffix
            };
        }
    }

    return {
        code: '',
        cleanName: procedureName.trim()
    };
};

const ResultsDashboard: React.FC = () => {
    const navigate = useNavigate();
    const { user } = useAuth();
    const [activeTab, setActiveTab] = useState<'surgeries' | 'nursing'>('surgeries');

    // --- State variables for caching raw database data ---
    const [rawOrs, setRawOrs] = useState<any[]>([]);
    const [rawSurgeries, setRawSurgeries] = useState<any[]>([]);
    const [rawAdmissions, setRawAdmissions] = useState<any[]>([]);
    const [currentPeriodSurgeries, setCurrentPeriodSurgeries] = useState<any[]>([]);

    // --- Local Period Helper ---
    const parseLocalDate = (dateStr: string) => {
        if (!dateStr) return null;
        const [year, month, day] = dateStr.split('-').map(Number);
        return new Date(year, month - 1, day);
    };

    const getPeriodDates = (
        activePeriod: string, 
        refDate: Date, 
        customRange: { start: string, end: string }
    ) => {
        let startDate = startOfMonth(refDate);
        let endDate = endOfMonth(refDate);

        if (activePeriod === 'Esta Semana') {
            startDate = startOfWeek(refDate, { weekStartsOn: 1 });
            endDate = endOfWeek(refDate, { weekStartsOn: 1 });
        } else if (activePeriod === 'Este Mes') {
            startDate = startOfMonth(refDate);
            endDate = endOfMonth(refDate);
        } else if (activePeriod === 'Este Trimestre') {
            startDate = startOfMonth(subMonths(refDate, 2));
            endDate = endOfMonth(refDate);
        } else if (activePeriod === 'Este Año') {
            startDate = startOfYear(refDate);
            endDate = endOfYear(refDate);
        } else if (activePeriod === 'Personalizado') {
            startDate = parseLocalDate(customRange.start) || startOfMonth(refDate);
            endDate = parseLocalDate(customRange.end) || endOfMonth(refDate);
        }
        return { startDate, endDate };
    };

    // --- Card 1 (Volumen Quirúrgico) Filter States ---
    const [isLocalVolumen, setIsLocalVolumen] = useState(false);
    const [periodVolumen, setPeriodVolumen] = useState('Este Mes');
    const [customRangeVolumen, setCustomRangeVolumen] = useState({
        start: format(startOfMonth(new Date()), 'yyyy-MM-dd'),
        end: format(endOfMonth(new Date()), 'yyyy-MM-dd')
    });

    // --- Card 2 (Motivos de Suspensión) Filter States ---
    const [isLocalSuspensiones, setIsLocalSuspensiones] = useState(false);
    const [periodSuspensiones, setPeriodSuspensiones] = useState('Este Mes');
    const [customRangeSuspensiones, setCustomRangeSuspensiones] = useState({
        start: format(startOfMonth(new Date()), 'yyyy-MM-dd'),
        end: format(endOfMonth(new Date()), 'yyyy-MM-dd')
    });

    // --- Card 3 (Derivaciones) Filter States ---
    const [periodDerivaciones, setPeriodDerivaciones] = useState('Este Trimestre');

    // --- Card 4 (Operaciones por Cirujano) Filter States ---
    const [isLocalCirujanos, setIsLocalCirujanos] = useState(false);
    const [periodCirujanos, setPeriodCirujanos] = useState('Este Mes');
    const [customRangeCirujanos, setCustomRangeCirujanos] = useState({
        start: format(startOfMonth(new Date()), 'yyyy-MM-dd'),
        end: format(endOfMonth(new Date()), 'yyyy-MM-dd')
    });

    // --- Card 5 (Inteligencia Predictiva) Filter States ---
    const [isLocalPredictiva, setIsLocalPredictiva] = useState(false);
    const [periodPredictiva, setPeriodPredictiva] = useState('Este Mes');
    const [customRangePredictiva, setCustomRangePredictiva] = useState({
        start: format(startOfMonth(new Date()), 'yyyy-MM-dd'),
        end: format(endOfMonth(new Date()), 'yyyy-MM-dd')
    });

    // --- Card 6 (Casuística por Procedimiento) Filter States ---
    const [isLocalCasuistica, setIsLocalCasuistica] = useState(false);
    const [periodCasuistica, setPeriodCasuistica] = useState('Este Mes');
    const [customRangeCasuistica, setCustomRangeCasuistica] = useState({
        start: format(startOfMonth(new Date()), 'yyyy-MM-dd'),
        end: format(endOfMonth(new Date()), 'yyyy-MM-dd')
    });
    const [period, setPeriod] = useState('Este Mes');
    const [referenceDate, setReferenceDate] = useState(new Date());
    const [globalCustomRange, setGlobalCustomRange] = useState({
        start: format(startOfMonth(new Date()), 'yyyy-MM-dd'),
        end: format(endOfMonth(new Date()), 'yyyy-MM-dd')
    });

    const [loading, setLoading] = useState(true);
    const [stats, setStats] = useState({
        totalCompleted: 0,
        successRate: '0%',
        suspensionRate: '0%',
        avgOccupancy: '0%',
        totalPeriod: 0
    });
    const [predictiveStats, setPredictiveStats] = useState<{
        topDeviations: { name: string, avg: number, max: number, count: number, doctors: any[], avg_total_time?: number, code?: string, relatedCodes?: string[] }[],
        allDeviations: { name: string, avg: number, max: number, count: number, doctors: any[], avg_total_time: number, code: string, relatedCodes: string[] }[],
        accuracyData: { label: string, estimated: number, actual: number, deviation: number, date?: string, fullProcedure?: string }[],
        avgDeviation: number
    }>({
        topDeviations: [],
        allDeviations: [],
        accuracyData: [],
        avgDeviation: 0
    });
    const [orOccupancy, setOrOccupancy] = useState<{ name: string, value: number, goal: number }[]>([]);
    const [suspensionReasons, setSuspensionReasons] = useState<{ label: string, value: number, color: string }[]>([]);
    const [efficiencyData, setEfficiencyData] = useState<any[]>([]);
    const [chartMode, setChartMode] = useState<'Occupancy' | 'Volume'>('Volume');
    const [casuistryMode, setCasuistryMode] = useState<'Frecuencia' | 'Relacion'>('Frecuencia');
    const [casuistryPage, setCasuistryPage] = useState<number>(0);
    const [volumeData, setVolumeData] = useState<{ label: string, value: number, isCurrent: boolean }[]>([]);

    const [selectedDocDetails, setSelectedDocDetails] = useState<{ doctor: string, surgeries: any[] } | null>(null);
    const [selectedProcedureDetails, setSelectedProcedureDetails] = useState<{ name: string, code: string, doctors: any[], avgDuration?: number, relatedCodes?: string[] } | null>(null);

    // --- Referral Stats State ---
    const [referralData, setReferralData] = useState<any[]>([]);
    const [referringDoctorsList, setReferringDoctorsList] = useState<{ id: string, name: string }[]>([]);
    const [procedureCasuistry, setProcedureCasuistry] = useState<{ name: string, count: number, percentage: number, code?: string, avgDuration?: number, doctors?: any[] }[]>([]);
    const [selectedReferrerId, setSelectedReferrerId] = useState<string>('');
    const [referralDateRange, setReferralDateRange] = useState({
        start: format(subMonths(new Date(), 6), 'yyyy-MM-dd'),
        end: format(new Date(), 'yyyy-MM-dd')
    });
    const [isReferralFilterIndependent, setIsReferralFilterIndependent] = useState(false);
    const [referralSummaryMode, setReferralSummaryMode] = useState<'Referring' | 'Receiving'>('Referring');
    const [targetSurgeonStats, setTargetSurgeonStats] = useState<{ name: string, count: number, percentage: number, surgeries: any[] }[]>([]);
    const [selectedReferralGroup, setSelectedReferralGroup] = useState<{ title: string, surgeries: any[] } | null>(null);
    const [holidays, setHolidays] = useState<string[]>([]);
    const [showAllProceduresModal, setShowAllProceduresModal] = useState(false);
    const [procedureSearchQuery, setProcedureSearchQuery] = useState('');

    const exportCasuistryToExcel = () => {
        if (!procedureCasuistry.length) return;
        const exportData = procedureCasuistry.map(p => ({
            "Procedimiento": p.name,
            "Código Nomenclador": (p as any).code || '-',
            "Cantidad de Cirugías": p.count,
            "Tiempo Promedio (min)": (p as any).avgDuration || 0,
            "Participación (%)": p.percentage
        }));
        
        const ws = XLSX.utils.json_to_sheet(exportData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Casuística");
        
        ws['!cols'] = [
            { wch: 60 },
            { wch: 20 },
            { wch: 20 },
            { wch: 20 },
            { wch: 15 }
        ];

        XLSX.writeFile(wb, `Casuistica_Cirugias_${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
    };
    const [drillDownProcedure, setDrillDownProcedure] = useState<any>(null);

    const handleChartClick = (data: any) => {
        if (!data || !data.date) return;
        const clickedDate = data.date;

        if (period === 'Este Año' || period === 'Este Trimestre') {
            setPeriod('Este Mes');
            setReferenceDate(clickedDate);
        } else if (period === 'Este Mes' || (period === 'Personalizado' && differenceInDays(parseLocalDate(globalCustomRange.end)!, parseLocalDate(globalCustomRange.start)!) > 60)) {
            setPeriod('Esta Semana');
            setReferenceDate(clickedDate);
        }
    };

    const handleBackToToday = () => {
        setReferenceDate(new Date());
        setPeriod('Este Mes');
    };

    useEffect(() => {
        const fetchHolidays = async () => {
            try {
                const year = new Date().getFullYear();
                const response = await fetch(`https://api.argentinadatos.com/v1/feriados/${year}`);
                const data = await response.json();
                // Map to YYYY-MM-DD
                const holidayDates = data.map((h: any) => h.fecha);
                setHolidays(holidayDates);
            } catch (err) {
                console.error('Error fetching holidays:', err);
            }
        };
        fetchHolidays();
    }, []);

    useEffect(() => {
        if (user?.role === 'Medico') {
            navigate('/surgeries');
            return;
        }
        fetchRawData();
    }, [user, navigate]);

    // --- Inline Component helper for Card Local Filter Controls ---
    const renderCardFilterControls = (
        isLocal: boolean, 
        setIsLocal: (val: boolean) => void, 
        localPeriod: string, 
        setLocalPeriod: (val: string) => void, 
        localCustomRange: { start: string, end: string }, 
        setLocalCustomRange: (val: { start: string, end: string }) => void,
        isDark?: boolean
    ) => {
        const bgContainer = isDark ? 'bg-slate-800/50 border-slate-700/50' : 'bg-slate-50 border-slate-100';
        const textLabel = isDark ? 'text-slate-300' : 'text-slate-500';
        const bgInput = isDark ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-200 text-slate-700';
        return (
            <div className={`flex flex-col sm:flex-row sm:items-center gap-3 p-2 rounded-xl border mt-2 ${bgContainer}`}>
                <div className="flex items-center gap-2">
                    <label className="relative inline-flex items-center cursor-pointer">
                        <input 
                            type="checkbox" 
                            checked={isLocal} 
                            onChange={(e) => setIsLocal(e.target.checked)} 
                            className="sr-only peer" 
                        />
                        <div className="w-7 h-4 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-indigo-600"></div>
                        <span className={`ml-1.5 text-[9px] font-black uppercase ${textLabel}`}>Filtro Local</span>
                    </label>
                </div>
                {isLocal && (
                    <div className="flex flex-wrap items-center gap-2 animate-in fade-in duration-200">
                        <select
                            value={localPeriod}
                            onChange={(e) => setLocalPeriod(e.target.value)}
                            className={`rounded-lg px-2 py-0.5 text-[10px] font-bold focus:outline-none ${bgInput}`}
                        >
                            {['Esta Semana', 'Este Mes', 'Este Trimestre', 'Este Año', 'Personalizado'].map(p => (
                                <option key={p} value={p} className={isDark ? 'bg-slate-800 text-white' : ''}>{p}</option>
                            ))}
                        </select>
                        {localPeriod === 'Personalizado' && (
                            <div className="flex items-center gap-1">
                                <input
                                    type="date"
                                    value={localCustomRange.start}
                                    onChange={(e) => setLocalCustomRange({ ...localCustomRange, start: e.target.value })}
                                    className={`rounded-lg px-1.5 py-0.5 text-[9px] font-bold ${bgInput}`}
                                />
                                <span className="text-[9px] font-bold text-slate-400">a</span>
                                <input
                                    type="date"
                                    value={localCustomRange.end}
                                    onChange={(e) => setLocalCustomRange({ ...localCustomRange, end: e.target.value })}
                                    className={`rounded-lg px-1.5 py-0.5 text-[9px] font-bold ${bgInput}`}
                                />
                            </div>
                        )}
                    </div>
                )}
            </div>
        );
    };

    // --- Fetch Raw Data once (or when user changes) ---
    const fetchRawData = async () => {
        setLoading(true);
        try {
            const { data: ors, error: orError } = await supabase
                .from('operating_rooms')
                .select('id, name, daily_goal')
                .eq('active', true);
            if (orError) throw orError;
            setRawOrs(ors || []);

            const { data: surgeries, error: surError } = await supabase
                .from('surgeries')
                .select(`
                    id,
                    status, 
                    suspension_reason, 
                    operating_room_id,
                    estimated_duration,
                    surgery_date,
                    procedure_name,
                    doctor_id,
                    patient_id,
                    actual_start_time,
                    actual_end_time,
                    doctors!doctor_id (
                        full_name,
                        specialty
                    ),
                    patients!patient_id (
                        full_name
                    ),
                    referring_doctor_id,
                    referring_doctor:doctors!referring_doctor_id (
                        full_name
                    )
                `);
            if (surError) throw surError;
            setRawSurgeries(surgeries || []);

            const twoYearsAgoStr = format(subYears(new Date(), 2), 'yyyy-MM-dd');
            const { data: admissionsData, error: admError } = await supabase
                .from('hospital_admissions')
                .select('patient_id, check_in, check_out')
                .not('check_out', 'is', null)
                .gte('check_in', twoYearsAgoStr);
            if (admError) throw admError;
            setRawAdmissions(admissionsData || []);

        } catch (err) {
            console.error('Error fetching raw results:', err);
        } finally {
            setLoading(false);
        }
    };

    // --- Reactively calculate global KPIs ---
    const globalStats = useMemo(() => {
        const { startDate, endDate } = getPeriodDates(period, referenceDate, globalCustomRange);

        const daysInRange = eachDayOfInterval({ start: startDate, end: endDate });
        const usefulDays = daysInRange.filter(day => {
            const dateStr = format(day, 'yyyy-MM-dd');
            return !isWeekend(day) && !holidays.includes(dateStr);
        }).length;
        const usefulMinutes = usefulDays * 810;

        const rawFiltered = rawSurgeries.filter((s: any) => {
            if (!s.surgery_date) return false;
            const sDate = parseLocalDate(s.surgery_date);
            return sDate && sDate >= startDate && sDate <= endDate;
        });

        const admissionsMap = {};
        rawAdmissions.forEach(adm => {
            if (adm.patient_id) {
                if (!admissionsMap[adm.patient_id]) admissionsMap[adm.patient_id] = [];
                admissionsMap[adm.patient_id].push(adm);
            }
        });

        const filteredSurgeries = rawFiltered.map((s: any) => {
            const hasRealEndTime = !!s.actual_end_time;
            let hasCompletedAdmission = false;
            if (s.patient_id && s.surgery_date && s.actual_start_time) {
                const sDate = new Date(s.surgery_date + 'T12:00:00Z');
                const adms = admissionsMap[s.patient_id] || [];
                hasCompletedAdmission = adms.some(adm => {
                    if (!adm.check_in || !adm.check_out) return false;
                    const checkInDate = new Date(adm.check_in.substring(0, 10) + 'T12:00:00Z');
                    const diffDays = Math.abs(sDate.getTime() - checkInDate.getTime()) / (1000 * 60 * 60 * 24);
                    return diffDays <= 2;
                });
            }
            const isFinished = s.status === 'completed' || hasRealEndTime || hasCompletedAdmission;
            return { ...s, status: isFinished ? 'completed' : s.status };
        });

        const total = filteredSurgeries.length;
        const completedCount = filteredSurgeries.filter((s: any) => s.status === 'completed').length;
        const suspendedCount = filteredSurgeries.filter((s: any) => s.status === 'suspended').length;
        const suspRate = total > 0 ? ((suspendedCount / total) * 100).toFixed(1) : '0';
        const succRate = total > 0 ? ((completedCount / total) * 100).toFixed(1) : '0';

        const orOccupancyData = rawOrs.map(or => {
            const orSurgeries = filteredSurgeries.filter((s: any) => s.status === 'completed' && s.operating_room_id === or.id);
            let usedMinutes = 0;
            orSurgeries.forEach((s: any) => {
                const actualStart = s.actual_start_time;
                const actualEnd = s.actual_end_time;
                if (actualStart && actualEnd) {
                    const [startH, startM] = actualStart.split(':').map(Number);
                    const [endH, endM] = actualEnd.split(':').map(Number);
                    usedMinutes += Math.max(0, (endH * 60 + endM) - (startH * 60 + startM));
                } else {
                    usedMinutes += (s.estimated_duration || 0);
                }
            });
            return usefulMinutes > 0 ? Math.round((usedMinutes / usefulMinutes) * 100) : 0;
        });

        const avgOcc = orOccupancyData.length > 0
            ? Math.round(orOccupancyData.reduce((acc, curr) => acc + curr, 0) / orOccupancyData.length)
            : 0;

        return {
            totalCompleted: completedCount,
            successRate: `${succRate}%`,
            suspensionRate: `${suspRate}%`,
            avgOccupancy: `${avgOcc}%`,
            totalPeriod: total
        };
    }, [rawSurgeries, rawOrs, rawAdmissions, period, referenceDate, globalCustomRange, holidays]);

    // --- Reactively calculate Card 1 (Volumen Quirúrgico) ---
    const card1Data = useMemo(() => {
        const { startDate, endDate } = isLocalVolumen 
            ? getPeriodDates(periodVolumen, new Date(), customRangeVolumen)
            : getPeriodDates(period, referenceDate, globalCustomRange);

        const daysInRange = eachDayOfInterval({ start: startDate, end: endDate });
        const usefulDays = daysInRange.filter(day => {
            const dateStr = format(day, 'yyyy-MM-dd');
            return !isWeekend(day) && !holidays.includes(dateStr);
        }).length;
        const usefulMinutes = usefulDays * 810;

        const rawFiltered = rawSurgeries.filter((s: any) => {
            if (!s.surgery_date) return false;
            const sDate = parseLocalDate(s.surgery_date);
            return sDate && sDate >= startDate && sDate <= endDate;
        });

        const admissionsMap = {};
        rawAdmissions.forEach(adm => {
            if (adm.patient_id) {
                if (!admissionsMap[adm.patient_id]) admissionsMap[adm.patient_id] = [];
                admissionsMap[adm.patient_id].push(adm);
            }
        });

        const filteredSurgeries = rawFiltered.map((s: any) => {
            const hasRealEndTime = !!s.actual_end_time;
            let hasCompletedAdmission = false;
            if (s.patient_id && s.surgery_date && s.actual_start_time) {
                const sDate = new Date(s.surgery_date + 'T12:00:00Z');
                const adms = admissionsMap[s.patient_id] || [];
                hasCompletedAdmission = adms.some(adm => {
                    if (!adm.check_in || !adm.check_out) return false;
                    const checkInDate = new Date(adm.check_in.substring(0, 10) + 'T12:00:00Z');
                    const diffDays = Math.abs(sDate.getTime() - checkInDate.getTime()) / (1000 * 60 * 60 * 24);
                    return diffDays <= 2;
                });
            }
            const isFinished = s.status === 'completed' || hasRealEndTime || hasCompletedAdmission;
            return { ...s, status: isFinished ? 'completed' : s.status };
        });

        const total = filteredSurgeries.length;
        const completedList = filteredSurgeries.filter((s: any) => s.status === 'completed');
        const completedCount = completedList.length;
        const suspendedCount = filteredSurgeries.filter((s: any) => s.status === 'suspended').length;
        const suspRate = total > 0 ? ((suspendedCount / total) * 100).toFixed(1) : '0';
        const succRate = total > 0 ? ((completedCount / total) * 100).toFixed(1) : '0';

        const orOccupancyData = rawOrs.map(or => {
            const orSurgeries = completedList.filter((s: any) => s.operating_room_id === or.id);
            let usedMinutes = 0;
            orSurgeries.forEach((s: any) => {
                const actualStart = s.actual_start_time;
                const actualEnd = s.actual_end_time;
                if (actualStart && actualEnd) {
                    const [startH, startM] = actualStart.split(':').map(Number);
                    const [endH, endM] = actualEnd.split(':').map(Number);
                    usedMinutes += Math.max(0, (endH * 60 + endM) - (startH * 60 + startM));
                } else {
                    usedMinutes += (s.estimated_duration || 0);
                }
            });
            const value = usefulMinutes > 0 ? Math.round((usedMinutes / usefulMinutes) * 100) : 0;
            return { name: or.name, value, goal: 100 };
        });

        const avgOcc = orOccupancyData.length > 0
            ? Math.round(orOccupancyData.reduce((acc, curr) => acc + curr.value, 0) / orOccupancyData.length)
            : 0;

        let volumeInterval = [];
        let displayFormat = 'MMM';
        let checkSamefn = isSameMonth;
        const activePeriod = isLocalVolumen ? periodVolumen : period;

        if (activePeriod === 'Esta Semana') {
            volumeInterval = eachDayOfInterval({ start: startDate, end: endDate });
            displayFormat = 'dd/MM';
            checkSamefn = isSameDay;
        } else if (activePeriod === 'Este Mes') {
            volumeInterval = eachDayOfInterval({ start: startDate, end: endDate });
            displayFormat = 'dd/MM';
            checkSamefn = isSameDay;
        } else if (activePeriod === 'Este Trimestre') {
            volumeInterval = eachMonthOfInterval({ start: startDate, end: endDate });
            displayFormat = 'MMM';
            checkSamefn = isSameMonth;
        } else if (activePeriod === 'Este Año') {
            volumeInterval = eachMonthOfInterval({ start: startDate, end: endDate });
            displayFormat = 'MMM';
            checkSamefn = isSameMonth;
        } else {
            const diffDays = differenceInDays(endDate, startDate);
            if (diffDays <= 60) {
                volumeInterval = eachDayOfInterval({ start: startDate, end: endDate });
                displayFormat = 'dd/MM';
                checkSamefn = isSameDay;
            } else {
                volumeInterval = eachMonthOfInterval({ start: startOfMonth(startDate), end: endDate });
                displayFormat = 'MMM';
                checkSamefn = isSameMonth;
            }
        }

        const processedVolume = volumeInterval.map(date => {
            const count = rawSurgeries.filter((s: any) => {
                if (!s.surgery_date || s.status !== 'completed') return false;
                const sDate = parseLocalDate(s.surgery_date);
                return sDate && checkSamefn(sDate, date);
            }).length;

            return {
                label: format(date, displayFormat, { locale: es }),
                value: count,
                isCurrent: checkSamefn(date, new Date()),
                date: date
            };
        });

        return {
            volumeData: processedVolume,
            orOccupancy: orOccupancyData,
            stats: {
                totalCompleted: completedCount,
                successRate: `${succRate}%`,
                suspensionRate: `${suspRate}%`,
                avgOccupancy: `${avgOcc}%`,
                totalPeriod: total
            },
            surgeries: filteredSurgeries
        };
    }, [rawSurgeries, rawOrs, rawAdmissions, isLocalVolumen, periodVolumen, customRangeVolumen, period, referenceDate, globalCustomRange, holidays]);

    // --- Reactively calculate Card 2 (Motivos de Suspensión) ---
    const card2Data = useMemo(() => {
        const { startDate, endDate } = isLocalSuspensiones
            ? getPeriodDates(periodSuspensiones, new Date(), customRangeSuspensiones)
            : getPeriodDates(period, referenceDate, globalCustomRange);

        const filtered = rawSurgeries.filter((s: any) => {
            if (!s.surgery_date) return false;
            const sDate = parseLocalDate(s.surgery_date);
            return sDate && sDate >= startDate && sDate <= endDate;
        });

        const suspendedList = filtered.filter((s: any) => s.status === 'suspended');
        const suspendedCount = suspendedList.length;

        const reasons = suspendedCount > 0 ? Object.entries(
            suspendedList.filter((s: any) => s.suspension_reason)
                .reduce((acc: any, s: any) => {
                    acc[s.suspension_reason] = (acc[s.suspension_reason] || 0) + 1;
                    return acc;
                }, {})
        ).map(([label, count]: [string, any]) => ({
            label,
            value: Math.round((count / suspendedCount) * 100),
            color: label.includes('Material') ? 'bg-orange-500' : 'bg-blue-500'
        })) : [];

        return reasons;
    }, [rawSurgeries, isLocalSuspensiones, periodSuspensiones, customRangeSuspensiones, period, referenceDate, globalCustomRange]);

    // --- Reactively calculate Card 3 (Derivaciones) ---
    const card3Data = useMemo(() => {
        let referralStartDate = new Date();
        let referralEndDate = new Date();

        if (isReferralFilterIndependent) {
            const { startDate, endDate } = getPeriodDates(periodDerivaciones, new Date(), { start: referralDateRange.start, end: referralDateRange.end });
            referralStartDate = startDate;
            referralEndDate = endDate;
        } else {
            const { startDate, endDate } = getPeriodDates(period, referenceDate, globalCustomRange);
            referralStartDate = startDate;
            referralEndDate = endDate;
        }

        const referrals = rawSurgeries.filter((s: any) => {
            if (!s.referring_doctor_id || !s.surgery_date) return false;
            if (s.referring_doctor_id === s.doctor_id) return false;
            const sDate = parseLocalDate(s.surgery_date);
            return sDate && sDate >= referralStartDate && sDate <= referralEndDate;
        });

        const uniqueReferrers = Array.from(new Set(referrals.map((s: any) => s.referring_doctor_id)))
            .map(id => {
                const s = referrals.find((r: any) => r.referring_doctor_id === id);
                return {
                    id: id,
                    name: s?.referring_doctor?.full_name || 'Desconocido'
                };
            }).sort((a, b) => a.name.localeCompare(b.name));

        return { referrals, uniqueReferrers, startDate: referralStartDate, endDate: referralEndDate };
    }, [rawSurgeries, isReferralFilterIndependent, periodDerivaciones, referralDateRange, period, referenceDate, globalCustomRange]);

    // --- Reactively calculate Card 4 (Operaciones por Cirujano) ---
    const card4Data = useMemo(() => {
        const { startDate, endDate } = isLocalCirujanos
            ? getPeriodDates(periodCirujanos, new Date(), customRangeCirujanos)
            : getPeriodDates(period, referenceDate, globalCustomRange);

        const filtered = rawSurgeries.filter((s: any) => {
            if (!s.surgery_date) return false;
            const sDate = parseLocalDate(s.surgery_date);
            return sDate && sDate >= startDate && sDate <= endDate;
        });

        const doctorStats = {};
        filtered.forEach((s: any) => {
            if (!s.doctor_id || !s.doctors) return;
            const docName = s.doctors.full_name || 'Desconocido';
            const specialty = s.doctors.specialty || 'General';

            if (!doctorStats[s.doctor_id]) {
                doctorStats[s.doctor_id] = {
                    doctor: docName,
                    specialty: specialty,
                    totalScheduled: 0,
                    totalPerformed: 0,
                    totalDuration: 0,
                    surgeries: []
                };
            }

            doctorStats[s.doctor_id].totalScheduled += 1;
            doctorStats[s.doctor_id].surgeries.push(s);

            if (s.status === 'completed') {
                doctorStats[s.doctor_id].totalPerformed += 1;
            }
            doctorStats[s.doctor_id].totalDuration += (s.estimated_duration || 0);
        });

        const processedEfficiency = Object.values(doctorStats).map((doc: any) => ({
            doctor: doc.doctor,
            specialty: doc.specialty,
            scheduled: doc.totalScheduled,
            performed: doc.totalPerformed,
            avgTime: doc.totalScheduled > 0 ? `${Math.round(doc.totalDuration / doc.totalScheduled)} min` : '0 min',
            complications: '0%',
            performance: Math.min(5, Math.ceil(doc.totalPerformed / 5)),
            surgeries: doc.surgeries
        })).sort((a, b) => b.performed - a.performed);

        return processedEfficiency;
    }, [rawSurgeries, isLocalCirujanos, periodCirujanos, customRangeCirujanos, period, referenceDate, globalCustomRange]);

    // --- Reactively calculate Card 5 (Inteligencia Predictiva) ---
    const card5Data = useMemo(() => {
        const { startDate, endDate } = isLocalPredictiva
            ? getPeriodDates(periodPredictiva, new Date(), customRangePredictiva)
            : getPeriodDates(period, referenceDate, globalCustomRange);

        const predictiveList = rawSurgeries.filter((s: any) => {
            if (s.status !== 'completed' || !s.actual_start_time || !s.actual_end_time) return false;
            const sDate = parseLocalDate(s.surgery_date);
            if (!sDate || sDate < startDate || sDate > endDate) return false;
            const { code } = extractProcedureCodeAndName(s.procedure_name || '');
            return !!code;
        });

        const deviationsByProcedure: Record<string, any> = {};

        predictiveList.forEach((s: any) => {
            const [startH, startM] = s.actual_start_time.split(':').map(Number);
            const [endH, endM] = s.actual_end_time.split(':').map(Number);
            const actualDuration = (endH * 60 + endM) - (startH * 60 + startM);
            const deviation = actualDuration - (s.estimated_duration || 0);

            const { code: rawCode, cleanName } = extractProcedureCodeAndName(s.procedure_name || '');
            if (!rawCode) return;

            let code = rawCode;
            let displayProcedureName = cleanName;

            const normalizedCode = normalizeCode(rawCode);
            const mapped = normalizedNomencladorMapping[normalizedCode];
            if (mapped) {
                code = mapped;
                if (nomencladorMapping.descriptions[code]) {
                    displayProcedureName = nomencladorMapping.descriptions[code];
                }
            }

            if (!deviationsByProcedure[code]) {
                deviationsByProcedure[code] = { 
                    name: displayProcedureName, 
                    code: code, 
                    total: 0, 
                    count: 0, 
                    max: 0,
                    doctors: {} as Record<string, any>,
                    surgeries: []
                };
            }

            const procStats = deviationsByProcedure[code];
            procStats.total += deviation;
            procStats.count += 1;
            procStats.max = Math.max(procStats.max, deviation);

            if (s.doctor_id && s.doctors) {
                const docId = s.doctor_id;
                const docName = s.doctors.full_name || 'Desconocido';
                
                if (!procStats.doctors[docId]) {
                    procStats.doctors[docId] = { name: docName, total: 0, count: 0 };
                }
                procStats.doctors[docId].total += actualDuration;
                procStats.doctors[docId].count += 1;
            }

            procStats.surgeries.push({
                id: s.id,
                patient_name: s.patients?.full_name || 'N/A',
                doctor_name: s.doctors?.full_name || 'N/A',
                date: s.surgery_date,
                actual_duration: actualDuration,
                estimated_duration: s.estimated_duration || 0,
                deviation: deviation
            });
        });

        const allDeviations = Object.entries(deviationsByProcedure)
            .map(([code, stats]: [string, any]) => {
                const relatedCodes = Object.entries(nomencladorMapping.mapping)
                    .filter(([orig, unified]) => unified === code)
                    .map(([orig]) => orig);
                
                const allRelated = relatedCodes.length > 0 ? relatedCodes : [code];

                return {
                    name: stats.name,
                    code: stats.code,
                    relatedCodes: allRelated,
                    avg: Math.round(stats.total / stats.count),
                    avg_total_time: Math.round((Object.values(stats.doctors).reduce((acc: number, d: any) => acc + d.total, 0) as number) / stats.count),
                    max: stats.max,
                    count: stats.count,
                    doctors: Object.values(stats.doctors).map((d: any) => ({
                        name: d.name,
                        avg: Math.round(d.total / d.count),
                        count: d.count
                    })).sort((a: any, b: any) => b.count - a.count),
                    surgeries: stats.surgeries.sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime())
                };
            })
            .filter((d: any) => d.count >= 1) 
            .sort((a: any, b: any) => b.avg - a.avg);

        const topDeviations = allDeviations.slice(0, 5);

        const accuracyData = [...predictiveList]
            .sort((a, b) => new Date(a.surgery_date).getTime() - new Date(b.surgery_date).getTime())
            .map((s: any) => {
                const [startH, startM] = s.actual_start_time.split(':').map(Number);
                const [endH, endM] = s.actual_end_time.split(':').map(Number);
                const actual = (endH * 60 + endM) - (startH * 60 + startM);
                const { cleanName } = extractProcedureCodeAndName(s.procedure_name || '');
                return {
                    label: cleanName || 'Cirugía',
                    fullProcedure: s.procedure_name || 'Sin nombre',
                    date: s.surgery_date ? format(new Date(s.surgery_date + 'T12:00:00'), 'dd/MM') : 'N/A',
                    estimated: s.estimated_duration || 0,
                    actual: actual,
                    deviation: actual - (s.estimated_duration || 0)
                };
            }).slice(-10);

        return {
            topDeviations,
            allDeviations,
            accuracyData,
            avgDeviation: predictiveList.length > 0
                ? Math.round(predictiveList.reduce((acc, s) => {
                    const [sh, sm] = s.actual_start_time.split(':').map(Number);
                    const [eh, em] = s.actual_end_time.split(':').map(Number);
                    return acc + ((eh * 60 + em) - (sh * 60 + sm) - (s.estimated_duration || 0));
                }, 0) / predictiveList.length)
                : 0
        };
    }, [rawSurgeries, isLocalPredictiva, periodPredictiva, customRangePredictiva, period, referenceDate, globalCustomRange, user?.role]);

    // --- Reactively calculate Card 6 (Casuística por Procedimiento) ---
    const card6Data = useMemo(() => {
        const { startDate, endDate } = isLocalCasuistica
            ? getPeriodDates(periodCasuistica, new Date(), customRangeCasuistica)
            : getPeriodDates(period, referenceDate, globalCustomRange);

        const filtered = rawSurgeries.filter((s: any) => {
            if (!s.surgery_date) return false;
            const sDate = parseLocalDate(s.surgery_date);
            return sDate && sDate >= startDate && sDate <= endDate;
        });

        const procedureStats: Record<string, any> = {};
        
        const listWithNomenclator = filtered.filter((s: any) => {
            if (s.status !== 'completed') return false;
            const { code } = extractProcedureCodeAndName(s.procedure_name || '');
            return !!code;
        });
        
        const totalForCasuistry = listWithNomenclator.length;

        listWithNomenclator.forEach((s: any) => {
            const { code: rawCode, cleanName } = extractProcedureCodeAndName(s.procedure_name || '');
            
            let unifiedCode = rawCode;
            let displayProcedureName = cleanName;

            const normalizedCode = normalizeCode(rawCode);
            const mapped = normalizedNomencladorMapping[normalizedCode];
            if (mapped) {
                unifiedCode = mapped;
                if (nomencladorMapping.descriptions[unifiedCode]) {
                    displayProcedureName = nomencladorMapping.descriptions[unifiedCode];
                }
            }

            if (!procedureStats[unifiedCode]) {
                procedureStats[unifiedCode] = { name: displayProcedureName, count: 0, totalDuration: 0, doctors: {} as Record<string, any> };
            }

            procedureStats[unifiedCode].count += 1;

            let duration = 0;
            if (s.actual_start_time && s.actual_end_time) {
                const [startH, startM] = s.actual_start_time.split(':').map(Number);
                const [endH, endM] = s.actual_end_time.split(':').map(Number);
                duration = (endH * 60 + endM) - (startH * 60 + startM);
            } else {
                duration = s.estimated_duration || 0;
            }
            procedureStats[unifiedCode].totalDuration += duration;

            if (s.doctor_id && s.doctors) {
                const docId = s.doctor_id;
                const docName = s.doctors.full_name || 'Desconocido';
                if (!procedureStats[unifiedCode].doctors[docId]) {
                    procedureStats[unifiedCode].doctors[docId] = { name: docName, count: 0, totalDuration: 0 };
                }
                procedureStats[unifiedCode].doctors[docId].count += 1;
                procedureStats[unifiedCode].doctors[docId].totalDuration += duration;
            }
        });

        const processedCasuistry = Object.entries(procedureStats)
            .map(([code, data]) => ({
                code,
                name: data.name,
                count: data.count,
                avgDuration: Math.round(data.totalDuration / data.count),
                percentage: totalForCasuistry > 0 ? Math.round((data.count / totalForCasuistry) * 100) : 0,
                doctors: Object.values(data.doctors).map((d: any) => ({
                    name: d.name,
                    count: d.count,
                    avg: Math.round(d.totalDuration / d.count)
                })).sort((a, b) => b.count - a.count)
            }))
            .sort((a, b) => b.count - a.count);

        return processedCasuistry;
    }, [rawSurgeries, isLocalCasuistica, periodCasuistica, customRangeCasuistica, period, referenceDate, globalCustomRange]);

    // --- Sync computed data with states used in JSX ---
    useEffect(() => {
        setStats(globalStats);
    }, [globalStats]);

    useEffect(() => {
        setVolumeData(card1Data.volumeData);
        setOrOccupancy(card1Data.orOccupancy);
        setCurrentPeriodSurgeries(card1Data.surgeries);
    }, [card1Data]);

    useEffect(() => {
        setSuspensionReasons(card2Data);
    }, [card2Data]);

    useEffect(() => {
        setReferralData(card3Data.referrals);
        setReferringDoctorsList(card3Data.uniqueReferrers);
    }, [card3Data]);

    useEffect(() => {
        setEfficiencyData(card4Data);
    }, [card4Data]);

    useEffect(() => {
        setPredictiveStats(card5Data);
    }, [card5Data]);

    useEffect(() => {
        setProcedureCasuistry(card6Data);
    }, [card6Data]);

    // Calculate Referral Stats when selection changes
    useEffect(() => {
        const referrals = card3Data.referrals;
        if (referrals.length === 0) {
            setTargetSurgeonStats([]);
            return;
        }

        const statsByGroup: Record<string, any[]> = {};
        let totalCount = 0;

        if (selectedReferrerId) {
            const myReferrals = referrals.filter(s => s.referring_doctor_id === selectedReferrerId);
            totalCount = myReferrals.length;
            myReferrals.forEach((s: any) => {
                const surgeonName = s.doctors?.full_name || 'Sin Asignar';
                if (!statsByGroup[surgeonName]) statsByGroup[surgeonName] = [];
                statsByGroup[surgeonName].push(s);
            });
        } else {
            totalCount = referrals.length;
            referrals.forEach((s: any) => {
                const groupName = referralSummaryMode === 'Referring'
                    ? s.referring_doctor?.full_name || 'Desconocido'
                    : s.doctors?.full_name || 'Sin Asignar';
                if (!statsByGroup[groupName]) statsByGroup[groupName] = [];
                statsByGroup[groupName].push(s);
            });
        }

        const processed = Object.entries(statsByGroup).map(([name, list]) => ({
            name,
            count: list.length,
            percentage: totalCount > 0 ? Math.round((list.length / totalCount) * 100) : 0,
            surgeries: list
        })).sort((a, b) => b.count - a.count);

        setTargetSurgeonStats(processed);
    }, [card3Data.referrals, selectedReferrerId, referralSummaryMode]);


    // Calculate Referral Stats when selection changes
    useEffect(() => {
        if (referralData.length === 0) {
            setTargetSurgeonStats([]);
            return;
        }

        const statsByGroup: Record<string, any[]> = {};
        let totalCount = 0;

        if (selectedReferrerId) {
            // Detailed view: Surgeries grouped by surgeon for a specific referrer
            const myReferrals = referralData.filter(s => s.referring_doctor_id === selectedReferrerId);
            totalCount = myReferrals.length;
            myReferrals.forEach((s: any) => {
                const surgeonName = (s.doctors as any)?.full_name || 'Sin Asignar';
                if (!statsByGroup[surgeonName]) statsByGroup[surgeonName] = [];
                statsByGroup[surgeonName].push(s);
            });
        } else {
            // Summary view: group by Referring or Receiving doctor
            totalCount = referralData.length;
            referralData.forEach((s: any) => {
                const name = referralSummaryMode === 'Referring'
                    ? (s.referring_doctor as any)?.full_name || 'Desconocido'
                    : (s.doctors as any)?.full_name || 'Sin Asignar';
                if (!statsByGroup[name]) statsByGroup[name] = [];
                statsByGroup[name].push(s);
            });
        }

        const processedStats = Object.entries(statsByGroup).map(([name, groupSurgeries]) => ({
            name,
            count: groupSurgeries.length,
            percentage: totalCount > 0 ? Math.round((groupSurgeries.length / totalCount) * 100) : 0,
            surgeries: groupSurgeries
        })).sort((a, b) => b.count - a.count);

        setTargetSurgeonStats(processedStats);

    }, [selectedReferrerId, referralData, referralSummaryMode]);

    const activeReferrer = selectedReferrerId; // Helper for closure if needed


    const kpis = [
        { title: 'Cirugías Realizadas', value: stats.totalCompleted, trend: '+12%', isPositive: true, icon: 'medical_services', color: 'blue' },
        { title: 'Tasa de Éxito', value: stats.successRate, trend: '+0.5%', isPositive: true, icon: 'check_circle', color: 'emerald' },
        { title: 'Tasa de Suspensión', value: stats.suspensionRate, trend: '-1.5%', isPositive: true, icon: 'cancel', color: 'red' },
        { title: 'Ocupación Quirófano', value: stats.avgOccupancy, trend: '+5%', isPositive: true, icon: 'door_sliding', color: 'purple' },
    ];

    // Simple CSS Chart Components
    const BarChartItem = ({ label, height, colorClass, isCurrent, subLabel }: any) => (
        <div className="flex flex-col items-center gap-2 flex-1 group min-w-[40px]">
            <div className={`relative w-full bg-slate-100 rounded-t-lg h-32 flex items-end justify-center overflow-hidden transition-all ${isCurrent ? 'ring-2 ring-slate-900 border-x-2 border-t-2 border-slate-900 shadow-[0_-4px_10px_rgba(0,0,0,0.1)]' : ''}`}>
                <div className={`w-full mx-1 rounded-t-md transition-all group-hover:opacity-80 ${colorClass}`} style={{ height: height }}></div>
                {isCurrent && (
                    <div className="absolute top-1 left-1/2 -translate-x-1/2 bg-slate-900 text-white text-[8px] font-bold px-1 rounded-sm uppercase tracking-tighter">
                        Hoy
                    </div>
                )}
            </div>
            <div className="flex flex-col items-center">
                <span className={`text-[10px] ${isCurrent ? 'text-slate-900 font-bold' : 'text-slate-500 font-medium'}`}>{label}</span>
                {subLabel && <span className="text-[8px] text-slate-400 font-bold">{subLabel}</span>}
            </div>
        </div>
    );

    return (
        <div className="flex-1 h-full overflow-y-auto bg-slate-50 p-8 font-sans">
            <ProgressBar isLoading={loading} />
            <div className="max-w-[1600px] mx-auto flex flex-col gap-8">

                {/* Header */}
                <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
                    <div>
                        <div className="flex items-center gap-2 mb-1">
                            <span className="bg-slate-900 text-white text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider">Dirección</span>
                            <span className="text-slate-400 text-xs font-medium">Acceso Ejecutivo</span>
                        </div>
                        <h1 className="text-2xl font-bold text-slate-900">
                            {activeTab === 'surgeries' ? 'Resultados Quirúrgicos' : 'Estadísticas de Internación y Enfermería'}
                        </h1>
                        <p className="text-slate-500 text-sm">
                            {activeTab === 'surgeries' 
                                ? 'Análisis de rendimiento, eficiencia y calidad de atención.' 
                                : 'Estadísticas de ocupación de camas, tiempos de limpieza y flujo de internación.'}
                        </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 bg-slate-100/50 p-1.5 rounded-2xl border border-slate-200 backdrop-blur-sm">
                        {/* Selector de Sección */}
                        <div className="flex bg-slate-200/60 p-0.5 rounded-xl border border-slate-300/30 mr-2">
                            <button
                                onClick={() => setActiveTab('surgeries')}
                                className={`px-4 py-1.5 rounded-lg text-xs font-black transition-all ${
                                    activeTab === 'surgeries'
                                        ? 'bg-white text-slate-900 shadow-sm'
                                        : 'text-slate-500 hover:text-slate-900'
                                }`}
                            >
                                Área Quirúrgica
                            </button>
                            <button
                                onClick={() => setActiveTab('nursing')}
                                className={`px-4 py-1.5 rounded-lg text-xs font-black transition-all ${
                                    activeTab === 'nursing'
                                        ? 'bg-white text-slate-900 shadow-sm'
                                        : 'text-slate-500 hover:text-slate-900'
                                }`}
                            >
                                Internación / Enfermería
                            </button>
                        </div>

                        {activeTab === 'surgeries' && (
                            <>
                                {['Esta Semana', 'Este Mes', 'Este Trimestre', 'Este Año', 'Personalizado'].map((p) => (
                                    <button
                                        key={p}
                                        onClick={() => setPeriod(p)}
                                        className={`px-5 py-2.5 rounded-xl text-sm font-bold transition-all duration-300 active:scale-95 ${period === p
                                            ? 'bg-slate-900 text-white shadow-xl shadow-slate-900/20 translate-y-[-1px]'
                                            : 'text-slate-500 hover:text-slate-900 hover:bg-white/80 hover:shadow-sm'
                                            }`}
                                    >
                                        {p}
                                    </button>
                                ))}

                                <div className="w-[1px] h-6 bg-slate-300 mx-1 hidden md:block" />

                                {(period !== 'Este Mes' || !isSameMonth(referenceDate, new Date())) && (
                                    <button
                                        onClick={handleBackToToday}
                                        className="px-5 py-2.5 rounded-xl bg-indigo-50 text-indigo-700 hover:bg-indigo-100 hover:text-indigo-800 transition-all duration-300 flex items-center gap-2 border border-indigo-200 active:scale-95 shadow-sm font-bold"
                                        title="Volver a Hoy"
                                    >
                                        <Calendar className="w-4 h-4" />
                                        <span className="text-xs">Volver a Hoy</span>
                                    </button>
                                )}
                            </>
                        )}
                    </div>
                </div>

                {activeTab === 'nursing' ? (
                    <HospitalizationStats />
                ) : (
                    <>
                        {period === 'Personalizado' && (
                    <div className="flex flex-wrap items-center gap-6 p-5 bg-white rounded-2xl border border-slate-200 shadow-xl shadow-slate-200/20 animate-in slide-in-from-top duration-500 ease-out">
                        <div className="flex items-center gap-3 group">
                            <span className="text-xs font-black text-slate-400 uppercase tracking-widest">Desde</span>
                            <div className="relative">
                                <input
                                    type="date"
                                    value={globalCustomRange.start}
                                    onChange={(e) => setGlobalCustomRange(prev => ({ ...prev, start: e.target.value }))}
                                    className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-sm text-slate-900 focus:ring-4 focus:ring-slate-900/5 focus:border-slate-900 outline-none transition-all font-bold appearance-none cursor-pointer"
                                />
                                <Calendar className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none group-focus-within:text-slate-900" />
                            </div>
                        </div>
                        <div className="w-8 h-[2px] bg-slate-200 rounded-full" />
                        <div className="flex items-center gap-3 group">
                            <span className="text-xs font-black text-slate-400 uppercase tracking-widest">Hasta</span>
                            <div className="relative">
                                <input
                                    type="date"
                                    value={globalCustomRange.end}
                                    onChange={(e) => setGlobalCustomRange(prev => ({ ...prev, end: e.target.value }))}
                                    className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-sm text-slate-900 focus:ring-4 focus:ring-slate-900/5 focus:border-slate-900 outline-none transition-all font-bold appearance-none cursor-pointer"
                                />
                                <Calendar className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none group-focus-within:text-slate-900" />
                            </div>
                        </div>
                        <div className="lg:ml-auto flex items-center gap-2 text-slate-400">
                            <Filter className="w-4 h-4" />
                            <span className="text-[10px] font-bold uppercase tracking-wider">Filtro Global Activo</span>
                        </div>
                    </div>
                )}

                {/* KPI Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    {kpis.map((kpi, idx) => (
                        <div key={idx} className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex items-start justify-between">
                            <div>
                                <p className="text-slate-500 text-xs font-bold uppercase tracking-wider mb-1">{kpi.title}</p>
                                <h3 className="text-3xl font-black text-slate-900">{kpi.value}</h3>
                                <div className={`flex items-center gap-1 mt-2 text-xs font-bold ${kpi.isPositive ? 'text-emerald-600' : 'text-red-600'}`}>
                                    <span className="material-symbols-outlined text-sm">
                                        {kpi.isPositive ? 'trending_up' : 'trending_down'}
                                    </span>
                                    <span>{kpi.trend} vs periodo anterior</span>
                                </div>
                            </div>
                            <div className={`p-3 rounded-lg bg-${kpi.color}-50 text-${kpi.color}-600`}>
                                <span className="material-symbols-outlined text-2xl">{kpi.icon}</span>
                            </div>
                        </div>
                    ))}
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                    {/* Chart: Activity Volume */}
                    <div className="lg:col-span-2 bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                        <div className="flex justify-between items-center mb-6">
                            <div>
                                <h3 className="font-bold text-slate-900">Volumen Quirúrgico</h3>
                                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                                    {chartMode === 'Volume' ? 'Cirugías por periodo' : 'Ocupación por quirófano'}
                                </p>
                                {renderCardFilterControls(isLocalVolumen, setIsLocalVolumen, periodVolumen, setPeriodVolumen, customRangeVolumen, setCustomRangeVolumen)}
                            </div>
                            <div className="bg-slate-100 p-1 rounded-lg flex gap-1">
                                <button
                                    onClick={() => setChartMode('Volume')}
                                    className={`px-3 py-1 rounded text-[10px] font-bold transition-all ${chartMode === 'Volume' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                                >
                                    Temporal
                                </button>
                                <button
                                    onClick={() => setChartMode('Occupancy')}
                                    className={`px-3 py-1 rounded text-[10px] font-bold transition-all ${chartMode === 'Occupancy' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                                >
                                    Quirófanos
                                </button>
                            </div>
                        </div>

                        {/* Dynamic Chart */}
                        <div className="h-64 w-full flex items-end gap-3 px-2 border-b border-slate-100 pb-4 overflow-x-auto scrollbar-hide">
                            {chartMode === 'Occupancy' ? (
                                orOccupancy.map((or, idx) => (
                                    <BarChartItem
                                        key={idx}
                                        label={or.name}
                                        height={`${or.value}%`}
                                        colorClass={or.value > 90 ? "bg-emerald-500" : or.value > 50 ? "bg-blue-400" : "bg-amber-400"}
                                    />
                                ))
                            ) : (
                                <ResponsiveContainer width="100%" height="100%" minHeight={100}>
                                    <BarChart data={volumeData} onClick={(data: any) => {
                                        if (data && data.activePayload && data.activePayload.length > 0) {
                                            handleChartClick(data.activePayload[0].payload);
                                        }
                                    }}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                                        <XAxis
                                            dataKey="label"
                                            stroke="#94a3b8"
                                            fontSize={10}
                                            tickLine={false}
                                            axisLine={false}
                                        />
                                        <YAxis stroke="#94a3b8" fontSize={10} tickLine={false} axisLine={false} />
                                        <Tooltip
                                            cursor={{ fill: '#f8fafc' }}
                                            contentStyle={{
                                                backgroundColor: '#ffffff',
                                                border: '1px solid #e2e8f0',
                                                borderRadius: '8px',
                                                fontSize: '12px',
                                                boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'
                                            }}
                                        />
                                        <Bar
                                            dataKey="value"
                                            radius={[4, 4, 0, 0]}
                                            className="cursor-pointer"
                                        >
                                            {volumeData.map((entry, index) => (
                                                <Cell
                                                    key={`cell-${index}`}
                                                    fill={entry.isCurrent ? '#0f172a' : '#cbd5e1'}
                                                    className="hover:fill-slate-700 transition-colors duration-200"
                                                />
                                            ))}
                                        </Bar>
                                    </BarChart>
                                </ResponsiveContainer>
                            )}
                            {(chartMode === 'Occupancy' ? orOccupancy.length === 0 : volumeData.length === 0) && (
                                <div className="w-full h-full flex items-center justify-center text-slate-300 italic">No hay datos disponibles.</div>
                            )}
                        </div>

                        {/* Calculation Legend */}
                        <div className="px-4 py-2 bg-slate-50 border-x border-slate-100 flex items-center gap-2">
                            <span className="material-symbols-outlined text-slate-400 text-sm">info</span>
                            <p className="text-[9px] text-slate-500 leading-tight">
                                <span className="font-bold">Cálculo de Ocupación:</span> (Minutos de cirugías realizadas / Minutos útiles).
                                El tiempo útil considera Lunes a Viernes de 06:30 a 20:00 (810 min/día), excluyendo feriados nacionales.
                            </p>
                        </div>

                        <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-4 text-center border-t border-slate-100 pt-4">
                            <div>
                                <p className="text-[10px] text-slate-400 uppercase font-bold tracking-tight">Ocupación Promedio</p>
                                <p className="font-black text-slate-900 text-lg">{stats.avgOccupancy}</p>
                            </div>
                            <div>
                                <p className="text-[10px] text-slate-400 uppercase font-bold tracking-tight">Cirugías Realizadas</p>
                                <p className="font-black text-emerald-600 text-lg">{stats.totalCompleted}</p>
                            </div>
                            <div>
                                <p className="text-[10px] text-slate-400 uppercase font-bold tracking-tight">Cirugías Programadas</p>
                                <p className="font-black text-indigo-600 text-lg">{stats.totalPeriod}</p>
                            </div>
                            <div>
                                <p className="text-[10px] text-slate-400 uppercase font-bold tracking-tight">Quirófanos Activos</p>
                                <p className="font-black text-slate-900 text-lg">{orOccupancy.length}</p>
                            </div>
                        </div>
                    </div>

                    {/* Chart: Suspension Reasons */}
                    <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex flex-col">
                        <h3 className="font-bold text-slate-900">Motivos de Suspensión</h3>
                        {renderCardFilterControls(isLocalSuspensiones, setIsLocalSuspensiones, periodSuspensiones, setPeriodSuspensiones, customRangeSuspensiones, setCustomRangeSuspensiones)}
                        <div className="flex-1 flex flex-col justify-center gap-6 mt-4">
                            {suspensionReasons.map((reason, suspensionIndex) => (
                                <div key={suspensionIndex}>
                                    <div className="flex justify-between text-xs mb-1 font-medium">
                                        <span className="text-slate-700">{reason.label}</span>
                                        <span className="text-slate-900">{reason.value}%</span>
                                    </div>
                                    <div className="w-full bg-slate-100 rounded-full h-2">
                                        <div className={`h-2 rounded-full ${reason.color}`} style={{ width: `${reason.value}%` }}></div>
                                    </div>
                                </div>
                            ))}
                            {suspensionReasons.length === 0 && (
                                <div className="text-center text-slate-400 text-sm">No hay suspensiones registradas.</div>
                            )}
                        </div>
                        <div className="mt-6 p-4 bg-red-50 rounded-lg border border-red-100">
                            <p className="text-xs text-red-800 font-medium flex items-start gap-2">
                                <span className="material-symbols-outlined text-sm">warning</span>
                                Analice los motivos de suspensión para tomar acciones correctivas inmediatas.
                            </p>
                        </div>
                    </div>
                </div>

                {/* --- Referral Analysis Section --- */}
                <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
                        <div>
                            <h3 className="font-bold text-slate-900 leading-tight">Análisis de Derivaciones</h3>
                            <p className="text-xs text-slate-500 mb-3">Distribución de pacientes derivados por médico.</p>

                            {!selectedReferrerId && (
                                <div className="flex bg-slate-100/80 p-1 rounded-xl w-fit border border-slate-200/50 backdrop-blur-sm">
                                    <button
                                        onClick={() => setReferralSummaryMode('Referring')}
                                        className={`px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all duration-300 ${referralSummaryMode === 'Referring' ? 'bg-white text-indigo-600 shadow-sm ring-1 ring-slate-200/50' : 'text-slate-400 hover:text-slate-600'}`}
                                    >
                                        Médicos Derivantes
                                    </button>
                                    <button
                                        onClick={() => setReferralSummaryMode('Receiving')}
                                        className={`px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all duration-300 ${referralSummaryMode === 'Receiving' ? 'bg-white text-indigo-600 shadow-sm ring-1 ring-slate-200/50' : 'text-slate-400 hover:text-slate-600'}`}
                                    >
                                        Cirujanos Receptores
                                    </button>
                                </div>
                            )}
                        </div>
                        <div className="relative min-w-[250px]">
                            <div className="flex flex-col gap-4">
                                <div className="flex items-center justify-between p-4 bg-white rounded-2xl border border-slate-200 shadow-sm">
                                    <div className="flex items-center gap-3">
                                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${isReferralFilterIndependent ? 'bg-indigo-50 text-indigo-600' : 'bg-slate-50 text-slate-400'}`}>
                                            <Calendar className="w-5 h-5" />
                                        </div>
                                        <div>
                                            <p className="text-sm font-bold text-slate-900">Filtro independiente</p>
                                            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Ignorar filtro general</p>
                                        </div>
                                    </div>
                                    <label className="relative inline-flex items-center cursor-pointer">
                                        <input
                                            type="checkbox"
                                            className="sr-only peer"
                                            checked={isReferralFilterIndependent}
                                            onChange={(e) => setIsReferralFilterIndependent(e.target.checked)}
                                        />
                                        <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                                    </label>
                                </div>

                                {isReferralFilterIndependent && (
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-white rounded-2xl border border-slate-200 shadow-lg shadow-slate-200/20 animate-in fade-in slide-in-from-top-2 duration-300">
                                        <div className="md:col-span-2 space-y-1.5">
                                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Periodo</label>
                                            <select
                                                value={periodDerivaciones}
                                                onChange={(e) => setPeriodDerivaciones(e.target.value)}
                                                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-sm text-slate-900 font-bold outline-none focus:ring-4 focus:ring-indigo-500/5 focus:border-indigo-500 transition-all"
                                            >
                                                {['Esta Semana', 'Este Mes', 'Este Trimestre', 'Este Año', 'Personalizado'].map(p => (
                                                    <option key={p} value={p}>{p}</option>
                                                ))}
                                            </select>
                                        </div>
                                        {periodDerivaciones === 'Personalizado' && (
                                            <>
                                                <div className="space-y-1.5">
                                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Fecha Inicio</label>
                                            <input
                                                type="date"
                                                value={referralDateRange.start}
                                                onChange={(e) => setReferralDateRange(prev => ({ ...prev, start: e.target.value }))}
                                                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-sm text-slate-900 outline-none focus:ring-4 focus:ring-indigo-500/5 focus:border-indigo-500 font-bold transition-all"
                                            />
                                        </div>
                                        <div className="space-y-1.5">
                                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Fecha Fin</label>
                                            <input
                                                type="date"
                                                value={referralDateRange.end}
                                                onChange={(e) => setReferralDateRange(prev => ({ ...prev, end: e.target.value }))}
                                                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-sm text-slate-900 outline-none focus:ring-4 focus:ring-indigo-500/5 focus:border-indigo-500 font-bold transition-all"
                                            />
                                        </div>
                                            </>
                                        )}
                                        <button
                                            onClick={() => {
                                                setPeriodDerivaciones('Personalizado');
                                                setReferralDateRange({ start: '2020-01-01', end: format(new Date(), 'yyyy-MM-dd') });
                                            }}
                                            className="md:col-span-2 py-2.5 text-[10px] font-black uppercase tracking-widest text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 rounded-xl transition-all border border-indigo-100 active:scale-[0.98]"
                                        >
                                            Ver Histórico Completo
                                        </button>
                                    </div>
                                )}

                                <select
                                    value={selectedReferrerId}
                                    onChange={(e) => setSelectedReferrerId(e.target.value)}
                                    className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3.5 text-slate-900 text-sm font-bold focus:ring-4 focus:ring-slate-900/5 focus:border-slate-900 outline-none appearance-none transition-all shadow-sm"
                                >
                                    <option value="">Seleccione médico derivante...</option>
                                    {referringDoctorsList.map(doc => (
                                        <option key={doc.id} value={doc.id}>{doc.name}</option>
                                    ))}
                                </select>
                            </div>
                            <span className="material-symbols-outlined absolute right-3 top-2.5 text-slate-500 pointer-events-none">arrow_drop_down</span>
                        </div>
                    </div>

                    {referralData.length > 0 ? (
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                            {/* Chart Area */}
                            <div className="lg:col-span-2">
                                <h4 className="text-sm font-bold text-slate-700 mb-6 flex items-center gap-2">
                                    <span className={`w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse`}></span>
                                    {selectedReferrerId
                                        ? 'Destino de Referencias'
                                        : referralSummaryMode === 'Referring'
                                            ? 'Ranking de Médicos Derivantes (Origen)'
                                            : 'Ranking de Cirujanos Receptores (Destino)'}
                                </h4>
                                <div className="space-y-4">
                                    {targetSurgeonStats.map((stat, idx) => (
                                        <div
                                            key={idx}
                                            className="group cursor-pointer"
                                            onClick={() => setSelectedReferralGroup({ title: stat.name, surgeries: stat.surgeries })}
                                        >
                                            <div className="flex justify-between text-xs mb-1 font-semibold">
                                                <span className="text-slate-700 group-hover:text-indigo-600 transition-colors uppercase tracking-tight">{stat.name}</span>
                                                <span className="text-slate-900 group-hover:scale-110 transition-transform origin-right">{stat.count} Pacientes ({stat.percentage}%)</span>
                                            </div>
                                            <div className="w-full bg-slate-50 rounded-lg h-8 relative overflow-hidden border border-slate-100 group-hover:border-indigo-200 transition-colors">
                                                <div
                                                    className="h-full bg-indigo-600 rounded-lg transition-all duration-500 ease-out group-hover:bg-indigo-500 relative min-w-[2px] shadow-[0_0_10px_rgba(79,70,229,0.3)]"
                                                    style={{ width: `${stat.percentage}%` }}
                                                >
                                                    {stat.percentage > 10 && (
                                                        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-bold text-white tracking-wider">
                                                            {stat.percentage}%
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                    {targetSurgeonStats.length === 0 && (
                                        <div className="p-8 text-center text-slate-400 italic bg-slate-50 rounded-lg border border-slate-100 border-dashed">
                                            No hay registros disponibles para el criterio seleccionado.
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Summary Box */}
                            <div className="bg-white rounded-2xl p-8 flex flex-col justify-center border border-slate-200 shadow-xl shadow-slate-200/20">
                                <div className="text-center mb-8">
                                    <div className="w-16 h-16 bg-indigo-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
                                        <Users className="w-8 h-8 text-indigo-600" />
                                    </div>
                                    <p className="text-[10px] text-slate-400 font-black uppercase tracking-[0.2em] mb-1">Total Derivaciones</p>
                                    <p className="text-5xl font-black text-slate-900">
                                        {targetSurgeonStats.reduce((acc, curr) => acc + curr.count, 0)}
                                    </p>
                                    <p className="text-[10px] text-slate-500 font-bold mt-2 bg-slate-100 py-1 px-3 rounded-full inline-block">
                                        {selectedReferrerId ? 'Dr. Seleccionado' : 'Todos los médicos'}
                                    </p>
                                </div>
                                <div className="space-y-4">
                                    <div className="flex items-start gap-3 bg-slate-50 p-4 rounded-xl border border-slate-100">
                                        <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
                                        <p className="text-xs text-slate-600 leading-relaxed font-medium">
                                            {selectedReferrerId
                                                ? `Se derivó a ${targetSurgeonStats.length} cirujanos distintos.`
                                                : `Participación de ${targetSurgeonStats.length} médicos derivantes.`}
                                        </p>
                                    </div>
                                    <div className="flex items-start gap-3 bg-indigo-50/30 p-4 rounded-xl border border-indigo-100/50">
                                        <Activity className="w-5 h-5 text-indigo-500 shrink-0" />
                                        <p className="text-xs text-indigo-900/70 leading-relaxed font-medium">
                                            Datos actualizados según filtros de fecha aplicados.
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="flex flex-col items-center justify-center py-20 bg-slate-50 rounded-2xl border border-dashed border-slate-300">
                            <div className="p-4 bg-white rounded-full shadow-sm mb-4">
                                <Search className="w-8 h-8 text-slate-400" />
                            </div>
                            <p className="text-slate-500 font-bold">No se encontraron derivaciones en este período.</p>
                            <p className="text-slate-400 text-xs">Intenta ampliando el rango de fechas.</p>
                        </div>
                    )}
                </div>



                {/* Efficiency Table */}
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="px-6 py-4 border-b border-slate-200 flex justify-between items-center">
                        <div>
                            <h3 className="font-bold text-slate-900">Operaciones por Cirujano</h3>
                            {renderCardFilterControls(isLocalCirujanos, setIsLocalCirujanos, periodCirujanos, setPeriodCirujanos, customRangeCirujanos, setCustomRangeCirujanos)}
                        </div>
                        <button
                            onClick={() => {
                                const exportData = efficiencyData.map(row => ({
                                    'Profesional': row.doctor,
                                    'Especialidad': row.specialty,
                                    'Programadas': row.scheduled,
                                    'Realizadas': row.performed,
                                    'Tiempo Promedio': row.avgTime,
                                    'Tasa Complicaciones': row.complications
                                }));
                                const ws = utils.json_to_sheet(exportData);
                                const wb = utils.book_new();
                                utils.book_append_sheet(wb, ws, "Eficiencia_Cirujanos");
                                writeFile(wb, `Reporte_Cirujanos_${period.replace(' ', '_')}.xlsx`);
                            }}
                            className="px-4 py-2 bg-white text-slate-900 border border-slate-200 rounded-xl text-xs font-black uppercase tracking-tighter hover:bg-slate-50 hover:border-slate-300 transition-all flex items-center gap-2 shadow-sm active:scale-95"
                        >
                            <Download className="w-3.5 h-3.5" />
                            <span>Exportar Reporte</span>
                        </button>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead className="bg-slate-50 text-slate-500 text-xs uppercase font-bold tracking-wider">
                                <tr>
                                    <th className="px-6 py-4">Profesional</th>
                                    <th className="px-6 py-4">Especialidad</th>
                                    <th className="px-6 py-4 text-center">Programadas</th>
                                    <th className="px-6 py-4 text-center">Realizadas</th>
                                    <th className="px-6 py-4 text-center">Tiempo Promedio</th>
                                    <th className="px-6 py-4 text-center">Tasa Complicaciones</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {efficiencyData.length > 0 ? (
                                    efficiencyData.map((row, idx) => (
                                        <tr
                                            key={idx}
                                            className="hover:bg-slate-50 cursor-pointer active:bg-slate-100 transition-colors group"
                                            onClick={() => setSelectedDocDetails({ doctor: row.doctor, surgeries: row.surgeries })}
                                        >
                                            <td className="px-6 py-4 font-bold text-slate-900 group-hover:text-indigo-600 transition-colors">
                                                <div className="flex items-center gap-2">
                                                    <User className="w-4 h-4 text-slate-300 group-hover:text-indigo-400 transition-colors" />
                                                    {row.doctor}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 text-sm text-slate-500">{row.specialty}</td>
                                            <td className="px-6 py-4 text-center text-sm font-medium">{row.scheduled}</td>
                                            <td className="px-6 py-4 text-center text-sm font-bold text-emerald-600">{row.performed}</td>
                                            <td className="px-6 py-4 text-center text-sm font-mono text-slate-600 bg-slate-50/50">{row.avgTime}</td>
                                            <td className="px-6 py-4 text-center">
                                                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold ${parseFloat(row.complications) === 0 ? 'bg-emerald-100 text-emerald-800' :
                                                    parseFloat(row.complications) < 5 ? 'bg-yellow-100 text-yellow-800' : 'bg-red-100 text-red-800'
                                                    }`}>
                                                    {row.complications}
                                                </span>
                                            </td>
                                        </tr>
                                    ))
                                ) : (
                                    <tr>
                                        <td colSpan={6} className="px-6 py-8 text-center text-slate-400 italic">No hay datos de eficiencia disponibles para el periodo seleccionado.</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* --- Predictive Analytics & Intelligence (SuperAdmin Only) --- */}
                {user?.role === 'SuperAdmin' && (
                    <div className="bg-slate-900 rounded-2xl p-8 text-white shadow-2xl relative overflow-hidden mt-12 pb-20">
                        {/* Decorative Background */}
                        <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/10 blur-[100px] -mr-32 -mt-32"></div>

                        <div className="relative z-10">
                            <div className="flex items-center gap-4 mb-10">
                                <div className="p-3 bg-indigo-500/20 rounded-2xl border border-indigo-400/20">
                                    <BrainCircuit className="w-8 h-8 text-indigo-400" />
                                </div>
                                <div>
                                    <h3 className="text-xl font-black uppercase tracking-tight">Inteligencia Predictiva</h3>
                                    {renderCardFilterControls(isLocalPredictiva, setIsLocalPredictiva, periodPredictiva, setPeriodPredictiva, customRangePredictiva, setCustomRangePredictiva, true)}
                                    <p className="text-slate-400 text-[10px] font-black uppercase tracking-[0.2em]">Análisis de precisión y optimización</p>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
                                {/* Procedimientos con Desvío */}
                                <div>
                                    <div className="flex items-center justify-between mb-6">
                                        <h4 className="text-[10px] font-black text-indigo-300 uppercase tracking-[0.2em] flex items-center gap-2">
                                            <AlertCircle className="w-4 h-4" />
                                            Procedimientos con Mayor Desvío
                                        </h4>
                                        <button 
                                            onClick={() => setShowAllProceduresModal(true)}
                                            className="px-4 py-1.5 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 border border-indigo-500/20 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all active:scale-95 flex items-center gap-2"
                                        >
                                            <Database className="w-3 h-3" />
                                            Ver Todos ({predictiveStats.allDeviations?.length || 0})
                                        </button>
                                    </div>
                                    <div className="space-y-6">
                                        {predictiveStats.topDeviations.length > 0 ? predictiveStats.topDeviations.map((d, idx) => (
                                            <div 
                                                key={idx} 
                                                className="group cursor-pointer bg-white/[0.03] border border-white/5 hover:bg-white/10 hover:border-indigo-500/30 p-4 rounded-2xl transition-all active:scale-[0.98]"
                                                onClick={() => setSelectedProcedureDetails({ 
                                                    name: d.name, 
                                                    code: d.code, 
                                                    avgDuration: d.avg_total_time,
                                                    doctors: d.doctors,
                                                    relatedCodes: (d as any).relatedCodes 
                                                })}
                                            >
                                                <div className="flex justify-between items-start mb-3">
                                                    <div className="max-w-[70%]">
                                                        <div className="flex items-center gap-2 flex-wrap mb-1">
                                                            <p className="text-sm font-black text-white group-hover:text-indigo-300 transition-colors uppercase leading-tight">{d.name}</p>
                                                            <span className="text-[9px] bg-indigo-500/20 text-indigo-400 px-2 py-0.5 rounded-full border border-indigo-400/20 font-mono font-bold">UNIFICADO: {d.code}</span>
                                                        </div>
                                                        <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">
                                                            Basado en {d.count} {d.count === 1 ? 'caso' : 'casos'} | Máx Desvío: +{d.max}m
                                                        </p>
                                                    </div>
                                                    <div className="text-right">
                                                        <span className="text-indigo-400 font-mono font-black text-2xl block leading-none">+{d.avg}m</span>
                                                        <span className="text-[8px] text-slate-500 font-black uppercase tracking-tighter mt-1 block">DESVÍO PROM.</span>
                                                    </div>
                                                </div>
                                                <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                                                    <div
                                                        className="h-full bg-gradient-to-r from-indigo-600 to-indigo-400 rounded-full shadow-[0_0_8px_rgba(79,70,229,0.4)]"
                                                        style={{ width: `${Math.min(100, (d.avg / 60) * 100)}%` }}
                                                    ></div>
                                                </div>
                                            </div>
                                        )) : (
                                            <p className="text-slate-500 italic text-sm py-4">Sin datos suficientes para calcular desvíos.</p>
                                        )}
                                    </div>
                                </div>

                                {/* Gráfico de Precisión */}
                                <div className="bg-slate-800/80 rounded-2xl p-8 border border-white/5 shadow-inner">
                                    <h4 className="text-[10px] font-black text-indigo-300 uppercase tracking-[0.2em] mb-8 flex items-center gap-2">
                                        <TrendingUp className="w-4 h-4" />
                                        Comparativa: Tiempo Planeado vs Ejecutado
                                    </h4>
                                    <div className="h-56 flex items-end gap-3 px-2 border-b border-slate-700/50 pb-6">
                                        {predictiveStats.accuracyData.map((d, idx) => {
                                            const maxDim = Math.max(d.estimated, d.actual, 10);
                                            return (
                                                <div key={idx} className="flex-1 flex flex-col items-center gap-2 group relative">
                                                    {/* Tooltip Mejorado */}
                                                    <div className="absolute -top-20 left-1/2 -translate-x-1/2 bg-slate-900 border border-indigo-500/50 text-[10px] px-4 py-3 rounded-2xl opacity-0 group-hover:opacity-100 transition-all scale-90 group-hover:scale-100 z-50 shadow-[0_20px_40px_rgba(0,0,0,0.5)] pointer-events-none mb-4 min-w-[180px]">
                                                        <p className="text-indigo-400 font-black uppercase mb-1 truncate">{d.label}</p>
                                                        <div className="flex justify-between items-center mb-2">
                                                            <span className="text-slate-500 font-bold uppercase text-[8px]">Fecha: {d.date}</span>
                                                            <span className={`font-black px-1.5 py-0.5 rounded text-[9px] ${d.deviation > 0 ? 'bg-red-500/20 text-red-400' : 'bg-emerald-500/20 text-emerald-400'}`}>
                                                                {d.deviation > 0 ? `+${d.deviation}` : d.deviation}m
                                                            </span>
                                                        </div>
                                                        <div className="grid grid-cols-2 gap-4 pt-2 border-t border-white/5 text-[9px]">
                                                            <div>
                                                                <p className="text-slate-500 uppercase font-bold text-[7px]">Planeado</p>
                                                                <p className="text-white font-mono">{d.estimated}m</p>
                                                            </div>
                                                            <div>
                                                                <p className="text-slate-500 uppercase font-bold text-[7px]">Ejecutado</p>
                                                                <p className="text-white font-mono">{d.actual}m</p>
                                                            </div>
                                                        </div>
                                                    </div>

                                                    <div className="w-full flex justify-center items-end gap-1.5 h-32">
                                                        {/* Barra Estimado */}
                                                        <div 
                                                            className="w-2.5 bg-slate-700/50 rounded-t-lg transition-all duration-500 group-hover:bg-slate-600" 
                                                            style={{ height: `${(d.estimated / maxDim) * 100}%` }}
                                                        ></div>
                                                        {/* Barra Real */}
                                                        <div 
                                                            className={`w-2.5 rounded-t-lg transition-all duration-700 delay-100 group-hover:scale-y-105 ${d.deviation > 15 ? 'bg-indigo-400' : 'bg-indigo-600'}`} 
                                                            style={{ 
                                                                height: `${(d.actual / maxDim) * 100}%`,
                                                                boxShadow: d.deviation > 15 ? '0 0 15px rgba(129, 140, 248, 0.3)' : 'none'
                                                            }}
                                                        ></div>
                                                    </div>
                                                    <span className="text-[8px] font-bold text-slate-500 uppercase tracking-tighter">{d.date}</span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                    <div className="flex justify-center gap-8 mt-6">
                                        <div className="flex items-center gap-2">
                                            <div className="w-2.5 h-2.5 bg-slate-700/50 rounded-sm"></div>
                                            <span className="text-[9px] text-slate-400 font-black uppercase tracking-widest">Tiempo Planeado</span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <div className="w-2.5 h-2.5 bg-indigo-500 rounded-sm shadow-[0_0_10px_rgba(99,102,241,0.5)]"></div>
                                            <span className="text-[9px] text-slate-400 font-black uppercase tracking-widest">Tiempo Ejecutado</span>
                                        </div>
                                    </div>
                                    <div className="mt-8 p-5 bg-indigo-500/5 rounded-2xl border border-indigo-500/10">
                                        <div className="flex gap-4 items-center">
                                            <div className="size-10 bg-indigo-500/10 rounded-xl flex items-center justify-center text-indigo-400 border border-indigo-500/20">
                                                <Zap className="w-5 h-5" />
                                            </div>
                                            <div>
                                                <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest mb-0.5">Diagnóstico IA</p>
                                                <p className="text-xs text-indigo-100/80 leading-relaxed font-medium">
                                                    El desvío promedio actual es de <span className="text-white font-black underline decoration-indigo-500/50 underline-offset-4">+{predictiveStats.avgDeviation} minutos</span>. 
                                                    Los procedimientos resaltados en rojo presentan anomalías de planificación constantes.
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Casuística por Procedimiento (Análisis Global Unificado v3.3.1) */}
                <div className="bg-white rounded-[2.5rem] p-10 border border-slate-200 shadow-xl shadow-slate-200/20 mb-12 mt-12 relative overflow-hidden">
                    {/* Decorative Background Element */}
                    <div className="absolute top-0 right-0 w-96 h-96 bg-emerald-500/5 blur-[120px] -mr-48 -mt-48 rounded-full"></div>

                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-12 relative z-10">
                        <div className="flex items-center gap-6">
                            <div className="p-4 bg-emerald-500/10 rounded-[2rem] text-emerald-600 border border-emerald-500/10 shadow-inner">
                                <Activity className="w-8 h-8" />
                            </div>
                            <div>
                                <h3 className="text-2xl font-black text-slate-900 uppercase tracking-tighter leading-none mb-2">Casuística por Procedimiento</h3>
                                {renderCardFilterControls(isLocalCasuistica, setIsLocalCasuistica, periodCasuistica, setPeriodCasuistica, customRangeCasuistica, setCustomRangeCasuistica)}
                                <div className="flex items-center gap-2">
                                    <span className="text-emerald-600 font-black text-[10px] uppercase tracking-widest bg-emerald-50 py-0.5 px-2 rounded-full">Inteligencia de Datos</span>
                                    <span className="w-1 h-1 rounded-full bg-slate-300"></span>
                                    <p className="text-slate-400 text-[10px] font-black uppercase tracking-[0.2em]">Frecuencia y Distribución Histórica Unificada</p>
                                </div>
                            </div>
                        </div>

                            <div className="flex flex-wrap items-center gap-4">
                                {/* Botón de exportación a Excel */}
                                <button
                                    onClick={exportCasuistryToExcel}
                                    className="flex items-center gap-2 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg text-[10px] font-black uppercase tracking-wider transition-all duration-300 shadow-sm shadow-emerald-500/20 active:scale-95"
                                >
                                    <Database className="w-3.5 h-3.5" />
                                    Exportar Tabla
                                </button>
                                
                                {/* Toggle for chart view mode */}
                                <div className="bg-slate-100 p-1.5 rounded-xl flex gap-1 border border-slate-200/50">
                                    <button
                                        onClick={() => setCasuistryMode('Frecuencia')}
                                        className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all duration-300 ${casuistryMode === 'Frecuencia' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-500 hover:text-slate-900'}`}
                                    >
                                        Frecuencia
                                    </button>
                                    <button
                                        onClick={() => setCasuistryMode('Relacion')}
                                        className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all duration-300 ${casuistryMode === 'Relacion' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-900'}`}
                                    >
                                        Cantidad vs Duración
                                    </button>
                                </div>
                                
                                <div className="bg-slate-50 px-6 py-3 rounded-2xl border border-slate-100 flex items-center gap-4">
                                <div className="text-right">
                                    <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest">Muestra Total</p>
                                    <p className="text-xl font-black text-slate-900 leading-none">
                                        {procedureCasuistry.reduce((acc, p) => acc + p.count, 0)} <span className="text-[10px] text-slate-500">Eventos</span>
                                    </p>
                                </div>
                                <div className="w-px h-8 bg-slate-200"></div>
                                <div className="p-2 bg-white rounded-xl shadow-sm">
                                    <Search className="w-4 h-4 text-emerald-500" />
                                </div>
                            </div>
                        </div>
                    </div>

                    {procedureCasuistry.length > 0 ? (
                        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 relative z-10">
                            {/* Gráfico Principal Mejorado */}
                            <div className="lg:col-span-8">
                                {/* Pagination controls */}
                                {(() => {
                                    const PAGE_SIZE = 15;
                                    const totalPages = Math.ceil(procedureCasuistry.length / PAGE_SIZE);
                                    const pagedData = procedureCasuistry.slice(casuistryPage * PAGE_SIZE, (casuistryPage + 1) * PAGE_SIZE);
                                    // Dominios fijos globales para mantener la escala constante entre páginas
                                    const globalMaxCount = Math.max(...procedureCasuistry.map(p => p.count), 1);
                                    const globalMaxDuration = Math.max(...procedureCasuistry.map(p => (p as any).avgDuration || 0), 1);
                                    return (
                                        <>
                                            {totalPages > 1 && (
                                                <div className="flex items-center justify-between mb-3 px-1">
                                                    <button
                                                        disabled={casuistryPage === 0}
                                                        onClick={() => setCasuistryPage(p => p - 1)}
                                                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider border transition-all disabled:opacity-30 disabled:cursor-not-allowed bg-white border-slate-200 text-slate-600 hover:bg-indigo-50 hover:border-indigo-300 hover:text-indigo-700"
                                                    >
                                                        <ChevronLeft className="w-3.5 h-3.5" /> Anterior
                                                    </button>
                                                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                                                        Página {casuistryPage + 1} de {totalPages}
                                                        <span className="ml-2 text-slate-300">·</span>
                                                        <span className="ml-2 text-slate-500">{procedureCasuistry.length} procedimientos</span>
                                                    </span>
                                                    <button
                                                        disabled={casuistryPage >= totalPages - 1}
                                                        onClick={() => setCasuistryPage(p => p + 1)}
                                                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider border transition-all disabled:opacity-30 disabled:cursor-not-allowed bg-white border-slate-200 text-slate-600 hover:bg-indigo-50 hover:border-indigo-300 hover:text-indigo-700"
                                                    >
                                                        Siguiente <ChevronRight className="w-3.5 h-3.5" />
                                                    </button>
                                                </div>
                                            )}
                                            <div className="h-[450px] w-full bg-slate-50/50 rounded-3xl p-6 border border-slate-100/50">
                                                <ResponsiveContainer width="100%" height="100%">
                                                    {casuistryMode === 'Frecuencia' ? (
                                                        <BarChart 
                                                            data={pagedData} 
                                                            layout="vertical" 
                                                            margin={{ left: 20, right: 60, top: 20, bottom: 20 }}
                                                            onClick={(data) => {
                                                                if (data && data.activePayload) {
                                                                    const item = data.activePayload[0].payload;
                                                                    setSelectedProcedureDetails({
                                                                        name: item.name,
                                                                        code: item.code,
                                                                        avgDuration: item.avgDuration,
                                                                        doctors: item.doctors,
                                                                        relatedCodes: Object.entries(nomencladorMapping.mapping)
                                                                            .filter(([orig, unified]) => unified === item.code)
                                                                            .map(([orig]) => orig)
                                                                    });
                                                                }
                                                            }}
                                            >
                                                <CartesianGrid strokeDasharray="8 8" horizontal={false} stroke="#e2e8f0" />
                                                <XAxis type="number" hide domain={[0, globalMaxCount]} />
                                                <YAxis 
                                                    dataKey="name" 
                                                    type="category" 
                                                    width={1} 
                                                    hide
                                                />
                                                <Tooltip 
                                                    cursor={{ fill: 'rgba(16, 185, 129, 0.05)', radius: 12 }}
                                                    content={({ active, payload }) => {
                                                        if (active && payload && payload.length) {
                                                            const data = payload[0].payload;
                                                            return (
                                                                <div className="bg-white p-4 rounded-2xl shadow-2xl border border-slate-100 animate-in fade-in zoom-in duration-200">
                                                                    <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest mb-1">Procedimiento</p>
                                                                    <p className="text-sm font-black text-slate-900 mb-3 leading-tight">{data.name}</p>
                                                                    <div className="flex gap-4 pt-3 border-t border-slate-50">
                                                                        <div>
                                                                            <p className="text-[8px] text-slate-400 font-bold uppercase">Volumen</p>
                                                                            <p className="text-lg font-black text-slate-900">{data.count}</p>
                                                                        </div>
                                                                        <div>
                                                                            <p className="text-[8px] text-slate-400 font-bold uppercase">Participación</p>
                                                                            <p className="text-lg font-black text-emerald-600">{data.percentage}%</p>
                                                                        </div>
                                                                    </div>
                                                                    <p className="mt-3 text-[8px] text-slate-400 font-black uppercase tracking-tighter italic">Click para ver distribución x médico</p>
                                                                </div>
                                                            );
                                                        }
                                                        return null;
                                                    }}
                                                />
                                                <Bar 
                                                    dataKey="count" 
                                                    radius={[0, 12, 12, 0]} 
                                                    barSize={32}
                                                    className="cursor-pointer"
                                                >
                                                    {pagedData.map((entry, index) => (
                                                        <Cell 
                                                            key={`cell-${index}`} 
                                                            fill={`url(#barGradientCasuistry-${index})`}
                                                            className="hover:opacity-80 transition-opacity"
                                                        />
                                                    ))}
                                                </Bar>
                                                <defs>
                                                    {pagedData.map((_, index) => (
                                                        <linearGradient key={`grad-${index}`} id={`barGradientCasuistry-${index}`} x1="0" y1="0" x2="1" y2="0">
                                                            <stop offset="0%" stopColor="#10b981" stopOpacity={0.8} />
                                                            <stop offset="100%" stopColor="#059669" stopOpacity={1} />
                                                        </linearGradient>
                                                    ))}
                                                </defs>
                                            </BarChart>
                                        ) : (
                                            /* Combo Chart: Bar (cantidad) + Line (tiempo promedio) */
                                            <ComposedChart
                                                data={pagedData}
                                                margin={{ top: 20, right: 50, bottom: 60, left: 10 }}
                                                onClick={(data) => {
                                                    if (data && data.activePayload && data.activePayload.length) {
                                                        const item = data.activePayload[0].payload;
                                                        setSelectedProcedureDetails({
                                                            name: item.name,
                                                            code: item.code,
                                                            avgDuration: item.avgDuration,
                                                            doctors: item.doctors,
                                                            relatedCodes: Object.entries(nomencladorMapping.mapping)
                                                                .filter(([, unified]) => unified === item.code)
                                                                .map(([orig]) => orig)
                                                        });
                                                    }
                                                }}
                                            >
                                                <defs>
                                                    <linearGradient id="comboBarGradient" x1="0" y1="0" x2="0" y2="1">
                                                        <stop offset="0%" stopColor="#6366f1" stopOpacity={0.9} />
                                                        <stop offset="100%" stopColor="#818cf8" stopOpacity={0.5} />
                                                    </linearGradient>
                                                </defs>
                                                <CartesianGrid strokeDasharray="8 8" stroke="#e2e8f0" vertical={false} />
                                                <XAxis
                                                    dataKey="code"
                                                    stroke="#94a3b8"
                                                    fontSize={9}
                                                    tickLine={false}
                                                    axisLine={false}
                                                    angle={-40}
                                                    textAnchor="end"
                                                    interval={0}
                                                    height={56}
                                                    tick={{ fontWeight: 700, fill: '#475569' }}
                                                />
                                                {/* Left Y: Cantidad */}
                                                <YAxis
                                                    yAxisId="left"
                                                    stroke="#6366f1"
                                                    fontSize={9}
                                                    tickLine={false}
                                                    axisLine={false}
                                                    domain={[0, globalMaxCount]}
                                                    tick={{ fontWeight: 700, fill: '#6366f1' }}
                                                    label={{ value: 'Cant. cirugías', angle: -90, position: 'insideLeft', offset: 10, fontSize: 9, fill: '#6366f1', fontWeight: '800' }}
                                                />
                                                {/* Right Y: Tiempo promedio */}
                                                <YAxis
                                                    yAxisId="right"
                                                    orientation="right"
                                                    stroke="#f59e0b"
                                                    fontSize={9}
                                                    tickLine={false}
                                                    axisLine={false}
                                                    unit=" m"
                                                    domain={[0, globalMaxDuration]}
                                                    tick={{ fontWeight: 700, fill: '#f59e0b' }}
                                                    label={{ value: 'Tiempo prom.', angle: 90, position: 'insideRight', offset: 10, fontSize: 9, fill: '#f59e0b', fontWeight: '800' }}
                                                />
                                                <Tooltip
                                                    cursor={{ fill: 'rgba(99,102,241,0.05)', radius: 8 }}
                                                    content={({ active, payload }) => {
                                                        if (active && payload && payload.length) {
                                                            const d = payload[0].payload;
                                                            return (
                                                                <div className="bg-white p-4 rounded-2xl shadow-2xl border border-slate-100 animate-in fade-in zoom-in duration-200 max-w-[300px]">
                                                                    <p className="text-[9px] font-black text-indigo-500 uppercase tracking-widest mb-0.5">{d.code}</p>
                                                                    <p className="text-sm font-black text-slate-900 mb-3 leading-tight">{d.name}</p>
                                                                    <div className="flex gap-5 pt-3 border-t border-slate-100">
                                                                        <div>
                                                                            <p className="text-[8px] text-slate-400 font-bold uppercase">Cant. Cirugías</p>
                                                                            <p className="text-xl font-black text-indigo-600">{d.count}</p>
                                                                        </div>
                                                                        <div>
                                                                            <p className="text-[8px] text-slate-400 font-bold uppercase">Tiempo Promedio</p>
                                                                            <p className="text-xl font-black text-amber-500">{d.avgDuration} min</p>
                                                                        </div>
                                                                        <div>
                                                                            <p className="text-[8px] text-slate-400 font-bold uppercase">Participación</p>
                                                                            <p className="text-xl font-black text-slate-700">{d.percentage}%</p>
                                                                        </div>
                                                                    </div>
                                                                    <p className="mt-3 text-[8px] text-slate-400 font-black uppercase tracking-tighter italic">Click para ver distribución x médico</p>
                                                                </div>
                                                            );
                                                        }
                                                        return null;
                                                    }}
                                                />
                                                <Legend
                                                    verticalAlign="top"
                                                    align="right"
                                                    wrapperStyle={{ fontSize: 9, fontWeight: 800, paddingBottom: 8 }}
                                                    formatter={(value) => value === 'count' ? 'Cantidad' : 'Tiempo prom. (min)'}
                                                />
                                                <Bar
                                                    yAxisId="left"
                                                    dataKey="count"
                                                    name="count"
                                                    fill="url(#comboBarGradient)"
                                                    radius={[8, 8, 0, 0]}
                                                    barSize={28}
                                                    className="cursor-pointer"
                                                />
                                                <Line
                                                    yAxisId="right"
                                                    type="monotone"
                                                    dataKey="avgDuration"
                                                    name="avgDuration"
                                                    stroke="#f59e0b"
                                                    strokeWidth={2.5}
                                                    dot={{ fill: '#f59e0b', r: 5, strokeWidth: 2, stroke: 'white' }}
                                                    activeDot={{ r: 7, stroke: '#f59e0b', strokeWidth: 2, fill: 'white' }}
                                                    className="cursor-pointer"
                                                />
                                            </ComposedChart>
                                        )}
                                    </ResponsiveContainer>
                                </div>
                                        </>
                                    );
                                })()
                                }
                            </div>

                            {/* Ranking Lateral Premium */}
                            <div className="lg:col-span-4 space-y-6">
                                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.25em] mb-6 flex items-center gap-2">
                                    <TrendingUp className="w-4 h-4 text-emerald-500" />
                                    Procedimientos Principales
                                </h4>
                                <div className="space-y-3 overflow-y-auto max-h-[380px] pr-2 scrollbar-thin">
                                    {procedureCasuistry.map((p, idx) => (
                                        <div 
                                            key={idx} 
                                            className="group flex items-center justify-between p-4 bg-slate-50 hover:bg-white hover:shadow-xl hover:shadow-slate-200/50 border border-transparent hover:border-emerald-500/20 rounded-2xl transition-all cursor-pointer active:scale-95"
                                            onClick={() => setSelectedProcedureDetails({
                                                name: p.name,
                                                code: p.code,
                                                avgDuration: (p as any).avgDuration,
                                                doctors: (p as any).doctors,
                                                relatedCodes: Object.entries(nomencladorMapping.mapping)
                                                    .filter(([orig, unified]) => unified === p.code)
                                                    .map(([orig]) => orig)
                                            })}
                                        >
                                            <div className="flex items-center gap-4 overflow-hidden">
                                                <div className="size-10 rounded-xl bg-white border border-slate-200 flex items-center justify-center text-sm font-black text-slate-400 group-hover:bg-emerald-600 group-hover:text-white group-hover:border-emerald-600 transition-all shadow-sm">
                                                    {idx + 1}
                                                </div>
                                                <div className="overflow-hidden">
                                                    <p className="text-xs font-black text-slate-900 truncate group-hover:text-emerald-700 transition-colors uppercase tracking-tight" title={p.name}>
                                                        {p.name}
                                                    </p>
                                                    <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">Código: {p.code}</p>
                                                </div>
                                            </div>
                                            <div className="text-right pl-4 shrink-0">
                                                <div className="text-base font-black text-slate-900 leading-none">{p.count} <span className="text-[9px] text-slate-400 font-normal">cir.</span></div>
                                                <div className="text-[10px] font-black text-indigo-600 uppercase mt-1">{p.avgDuration} min</div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="flex flex-col items-center justify-center py-24 bg-slate-50 rounded-[2rem] border-2 border-dashed border-slate-200">
                            <div className="p-6 bg-white rounded-3xl shadow-xl shadow-slate-200/50 mb-6">
                                <Activity className="w-10 h-10 text-slate-300" />
                            </div>
                            <p className="text-slate-500 font-black uppercase tracking-widest text-sm">Sin registros de casuística</p>
                            <p className="text-slate-400 text-xs mt-2 font-medium">No se detectaron cirugías finalizadas en el período seleccionado.</p>
                        </div>
                    )}
                </div>

                    </>
                )}
            </div>

            {/* Drill-down Modal */}
            {selectedDocDetails && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl overflow-hidden flex flex-col max-h-[85vh] animate-in fade-in zoom-in duration-200">
                        {/* Modal Header */}
                        <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
                            <div>
                                <h3 className="text-xl font-black text-slate-900">{selectedDocDetails.doctor}</h3>
                                <p className="text-xs text-slate-500 font-bold uppercase tracking-tighter">Desglose de Cirugías en el Periodo</p>
                            </div>
                            <button
                                onClick={() => setSelectedDocDetails(null)}
                                className="p-2 hover:bg-slate-200 rounded-full transition-colors text-slate-400 hover:text-slate-900"
                            >
                                <span className="material-symbols-outlined">close</span>
                            </button>
                        </div>

                        {/* Modal Content */}
                        <div className="overflow-y-auto flex-1 p-0">
                            <table className="w-full text-left border-collapse">
                                <thead className="sticky top-0 bg-white border-b border-slate-200 shadow-sm z-10">
                                    <tr className="text-[10px] uppercase font-black text-slate-400 tracking-widest">
                                        <th className="px-6 py-3">Fecha</th>
                                        <th className="px-6 py-3">Paciente</th>
                                        <th className="px-6 py-3">Procedimiento</th>
                                        <th className="px-6 py-3 text-right">Estado</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {selectedDocDetails.surgeries.map((s: any) => (
                                        <tr key={s.id} className="hover:bg-slate-50 transition-colors">
                                            <td className="px-6 py-4 text-sm font-mono text-slate-500">
                                                {s.surgery_date ? new Date(s.surgery_date).toLocaleDateString('es-AR') : 'N/A'}
                                            </td>
                                            <td className="px-6 py-4 font-bold text-slate-900">
                                                {s.patients?.full_name || 'Desconocido'}
                                            </td>
                                            <td className="px-6 py-4 text-sm text-slate-600 truncate max-w-xs">
                                                {s.procedure_name || 'Sin especificar'}
                                            </td>
                                            <td className="px-6 py-4 text-right">
                                                <span className={`inline-flex px-2 py-1 rounded text-[10px] font-black uppercase tracking-tighter ${s.status === 'completed' ? 'bg-emerald-100 text-emerald-700' :
                                                    s.status === 'suspended' ? 'bg-red-100 text-red-700' :
                                                        'bg-blue-100 text-blue-700'
                                                    }`}>
                                                    {s.status === 'completed' ? 'Realizada' :
                                                        s.status === 'suspended' ? 'Suspendida' :
                                                            s.status === 'scheduled' ? 'Programada' : 'Pendiente'}
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {/* Modal Footer */}
                        <div className="px-8 py-6 bg-white border-t border-slate-100 flex justify-between items-center">
                            <div className="flex items-center gap-2 text-slate-400">
                                <Search className="w-4 h-4" />
                                <span className="text-xs font-bold uppercase tracking-wider">Total: {selectedDocDetails.surgeries.length} registros</span>
                            </div>
                            <button
                                onClick={() => setSelectedDocDetails(null)}
                                className="px-8 py-3 bg-slate-900 text-white text-xs font-black uppercase tracking-widest rounded-xl hover:bg-slate-800 transition-all shadow-xl shadow-slate-900/10 active:scale-95 border border-slate-900"
                            >
                                Cerrar Ventana
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Procedure Intelligence Drill-down (Casuística + Predictiva v3.3.1) */}
            {selectedProcedureDetails && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-xl animate-in fade-in duration-300">
                    <div className="bg-white border border-slate-200 rounded-[3rem] shadow-[0_40px_100px_rgba(0,0,0,0.25)] w-full max-w-4xl overflow-hidden flex flex-col max-h-[90vh] animate-in slide-in-from-bottom-10 zoom-in-95 duration-500">
                        
                        {/* Header Premium Adaptativo */}
                        <div className={`px-10 py-10 border-b border-slate-100 relative overflow-hidden ${selectedProcedureDetails.doctors[0]?.avg ? 'bg-indigo-50/30' : 'bg-emerald-50/30'}`}>
                            {/* Decorative Icon in Background */}
                            <div className="absolute top-0 right-0 p-8 opacity-[0.03]">
                                {selectedProcedureDetails.doctors[0]?.avg ? (
                                    <Zap className="w-48 h-48 text-indigo-600" />
                                ) : (
                                    <Activity className="w-48 h-48 text-emerald-600" />
                                )}
                            </div>

                            <div className="relative z-10 flex justify-between items-start">
                                <div className="max-w-[85%]">
                                    <div className="flex items-center gap-3 mb-4">
                                        <span className={`text-[10px] px-3 py-1 rounded-full font-black uppercase tracking-[0.2em] shadow-sm ${
                                            selectedProcedureDetails.doctors[0]?.avg 
                                                ? 'bg-indigo-600 text-white' 
                                                : 'bg-emerald-600 text-white'
                                        }`}>
                                            {selectedProcedureDetails.doctors[0]?.avg ? 'Análisis de Eficiencia' : 'Análisis de Casuística'}
                                        </span>
                                        <span className="text-[10px] text-slate-500 font-black uppercase tracking-widest bg-white border border-slate-200 px-3 py-1 rounded-full">
                                            Código: {selectedProcedureDetails.code}
                                        </span>
                                        {selectedProcedureDetails.doctors[0]?.avg !== undefined && (
                                            (() => {
                                             const doctorsList = selectedProcedureDetails.doctors || [];
                                             const totalSurgeries = doctorsList.reduce((acc: any, d: any) => acc + d.count, 0);
                                             const generalAvg = totalSurgeries > 0
                                                 ? Math.round(doctorsList.reduce((acc: any, d: any) => acc + ((d.avg || 0) * d.count), 0) / totalSurgeries)
                                                 : 0;
                                             return (
                                                 <span className="text-[10px] text-amber-600 font-black uppercase tracking-widest bg-amber-50 border border-amber-200 px-3 py-1 rounded-full shadow-sm">
                                                     Tiempo Promedio General: {generalAvg} min
                                                 </span>
                                             );
                                         })()
                                        )}
                                    </div>
                                    <h3 className="text-3xl font-black text-slate-900 uppercase tracking-tighter leading-none mb-3">
                                        {selectedProcedureDetails.name}
                                    </h3>
                                    <p className="text-slate-500 text-sm font-medium leading-relaxed max-w-2xl">
                                        {selectedProcedureDetails.doctors[0]?.avg 
                                            ? 'Visualización profunda de desvíos de tiempo y precisión en la agenda por cada profesional especialista.' 
                                            : 'Distribución histórica de volumen y frecuencia de ejecución unificada entre todos los nomencladores.'}
                                    </p>
                                </div>
                                <button
                                    onClick={() => setSelectedProcedureDetails(null)}
                                    className="p-4 bg-white hover:bg-slate-50 rounded-2xl transition-all text-slate-400 hover:text-slate-900 border border-slate-200 shadow-sm active:scale-90"
                                >
                                    <X className="w-6 h-6" />
                                </button>
                            </div>
                        </div>

                        {/* Content */}
                        <div className="overflow-y-auto flex-1 p-10 custom-scrollbar bg-white">
                            <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
                                
                                {/* Left Column: Intelligence Panel */}
                                <div className="lg:col-span-4 space-y-8">
                                    <div>
                                        <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.25em] mb-4 flex items-center gap-2">
                                            <Database className="w-4 h-4 text-slate-400" />
                                            Mapeo Maestro
                                        </h4>
                                        <div className="flex flex-wrap gap-2">
                                            {selectedProcedureDetails.relatedCodes?.map((code: string, i: number) => (
                                                <span key={i} className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-600 text-[10px] font-mono font-bold hover:border-slate-400 transition-colors">
                                                    {code}
                                                </span>
                                            ))}
                                        </div>
                                    </div>

                                    <div className={`p-6 rounded-[2rem] border ${
                                        selectedProcedureDetails.doctors[0]?.avg 
                                            ? 'bg-indigo-50 border-indigo-100' 
                                            : 'bg-emerald-50 border-emerald-100'
                                    }`}>
                                        <h4 className={`text-[10px] font-black uppercase tracking-[0.2em] mb-2 ${
                                            selectedProcedureDetails.doctors[0]?.avg ? 'text-indigo-600' : 'text-emerald-600'
                                        }`}>Diagnóstico Sugerido</h4>
                                        <p className="text-xs text-slate-600 leading-relaxed font-medium">
                                            {selectedProcedureDetails.doctors[0]?.avg 
                                                ? 'Se recomienda ajustar el tiempo base en la agenda para evitar retrasos acumulativos en el quirófano.' 
                                                : 'Este procedimiento presenta una alta recurrencia, lo que justifica la estandarización de kits de materiales.'}
                                        </p>
                                    </div>
                                </div>

                                {/* Right Column: Ranking de Profesionales */}
                                <div className="lg:col-span-8">
                                    <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.25em] mb-8 flex justify-between items-center">
                                        <span className="flex items-center gap-2">
                                            <Users className="w-4 h-4" />
                                            Distribución por Médico
                                        </span>
                                        <span className="text-[9px] bg-slate-100 px-2 py-0.5 rounded text-slate-500">Muestra Histórica</span>
                                    </h4>

                                    <div className="space-y-4">
                                        {selectedProcedureDetails.doctors.map((doc: any, idx: number) => {
                                            const maxValue = selectedProcedureDetails.doctors[0].avg || selectedProcedureDetails.doctors[0].count;
                                            const currentValue = doc.avg || doc.count;
                                            const percentage = (currentValue / maxValue) * 100;

                                            return (
                                                <div key={idx} className="group bg-slate-50 hover:bg-white border border-transparent hover:border-slate-200 rounded-3xl p-6 transition-all hover:shadow-xl hover:shadow-slate-200/50">
                                                    <div className="flex justify-between items-center mb-4">
                                                        <div className="flex items-center gap-4">
                                                            <div className={`size-12 rounded-2xl flex items-center justify-center font-black transition-all shadow-inner ${
                                                                selectedProcedureDetails.doctors[0]?.avg 
                                                                    ? 'bg-indigo-100 text-indigo-600 group-hover:bg-indigo-600 group-hover:text-white' 
                                                                    : 'bg-emerald-100 text-emerald-600 group-hover:bg-emerald-600 group-hover:text-white'
                                                            }`}>
                                                                {doc.name.charAt(0)}
                                                            </div>
                                                            <div>
                                                                <p className="font-black text-slate-900 uppercase text-sm tracking-tight">{doc.name}</p>
                                                                <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest">
                                                                    {doc.count} Intervenciones Registradas
                                                                </p>
                                                            </div>
                                                        </div>
                                                        <div className="text-right">
                                                             <div className="flex items-baseline justify-end gap-1">
                                                                 <p className="text-2xl font-black text-slate-900 leading-none">
                                                                     {currentValue}
                                                                 </p>
                                                                 <p className={`text-[10px] font-black uppercase ${
                                                                     selectedProcedureDetails.doctors[0]?.avg ? 'text-indigo-600' : 'text-emerald-600'
                                                                 }`}>
                                                                     min
                                                                 </p>
                                                             </div>
                                                         </div>
                                                    </div>
                                                    
                                                    {/* Progresión Visual Premium */}
                                                    <div className="h-2 w-full bg-slate-200/50 rounded-full overflow-hidden">
                                                        <div 
                                                            className={`h-full rounded-full transition-all duration-1000 ease-out shadow-sm ${
                                                                selectedProcedureDetails.doctors[0]?.avg ? 'bg-indigo-500' : 'bg-emerald-500'
                                                            }`}
                                                            style={{ width: `${percentage}%` }}
                                                        ></div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Footer Unificado */}
                        <div className={`px-10 py-8 border-t border-slate-100 flex justify-between items-center ${
                            selectedProcedureDetails.doctors[0]?.avg ? 'bg-indigo-600' : 'bg-emerald-600'
                        }`}>
                            <div className="flex items-center gap-4">
                                <div className="size-12 bg-white/20 rounded-2xl flex items-center justify-center text-white backdrop-blur-md">
                                    <TrendingUp className="w-6 h-6" />
                                </div>
                                <div>
                                    <p className="text-[10px] font-black uppercase tracking-widest text-white/70">Resumen Ejecutivo</p>
                                    <p className="text-sm font-bold text-white">
                                        Total de {selectedProcedureDetails.doctors.reduce((acc: any, d: any) => acc + d.count, 0)} cirugías analizadas.
                                    </p>
                                </div>
                            </div>
                            <button
                                onClick={() => setSelectedProcedureDetails(null)}
                                className="px-10 py-4 bg-white text-slate-900 text-[10px] font-black uppercase tracking-[0.2em] rounded-2xl hover:bg-slate-50 transition-all shadow-2xl shadow-black/20 active:scale-95"
                            >
                                Cerrar Análisis
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Referral Drill-down Modal */}
            {selectedReferralGroup && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl overflow-hidden flex flex-col max-h-[85vh] animate-in fade-in zoom-in duration-200">
                        {/* Modal Header */}
                        <div className="px-6 py-5 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
                            <div className="flex items-center gap-4">
                                <div className="p-3 bg-indigo-50 rounded-xl text-indigo-600">
                                    <Users className="w-6 h-6" />
                                </div>
                                <div>
                                    <h3 className="text-xl font-black text-slate-900 tracking-tight">{selectedReferralGroup.title}</h3>
                                    <div className="flex items-center gap-2 mt-0.5">
                                        <span className="text-[10px] text-slate-400 font-black uppercase tracking-widest">{selectedReferrerId ? 'Paciente Derivado a' : referralSummaryMode === 'Referring' ? 'Origen de Derivación' : 'Destino de Derivación'}</span>
                                        <span className="w-1 h-1 rounded-full bg-slate-300"></span>
                                        <span className="text-[10px] text-indigo-600 font-bold uppercase">{selectedReferralGroup.surgeries.length} {selectedReferralGroup.surgeries.length === 1 ? 'Cirugía' : 'Cirugías'} Registradas</span>
                                    </div>
                                </div>
                            </div>
                            <button
                                onClick={() => setSelectedReferralGroup(null)}
                                className="p-2.5 hover:bg-slate-200 rounded-full transition-all text-slate-400 hover:text-slate-900 active:scale-95 translate-x-2"
                            >
                                <span className="material-symbols-outlined">close</span>
                            </button>
                        </div>

                        {/* Modal Content */}
                        <div className="overflow-y-auto flex-1 p-0">
                            <table className="w-full text-left border-collapse">
                                <thead className="sticky top-0 bg-white/95 backdrop-blur-md border-b border-slate-200 shadow-sm z-10">
                                    <tr className="text-[10px] uppercase font-black text-slate-400 tracking-[0.2em]">
                                        <th className="px-8 py-4">Fecha</th>
                                        <th className="px-8 py-4">Paciente</th>
                                        <th className="px-8 py-4">Procedimiento</th>
                                        <th className="px-8 py-4">{referralSummaryMode === 'Referring' || selectedReferrerId ? 'Cirujano' : 'Derivante'}</th>
                                        <th className="px-8 py-4 text-right">Estado</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {selectedReferralGroup.surgeries.map((s: any) => (
                                        <tr key={s.id} className="hover:bg-slate-50 transition-colors group/row">
                                            <td className="px-8 py-4 text-xs font-mono text-slate-500 group-hover/row:text-slate-900 transition-colors">
                                                {s.surgery_date ? format(new Date(s.surgery_date + 'T12:00:00'), 'dd/MM/yyyy') : 'N/A'}
                                            </td>
                                            <td className="px-8 py-4">
                                                <div className="font-bold text-slate-900 text-sm">{s.patients?.full_name || 'Desconocido'}</div>
                                                {s.id && <div className="text-[10px] text-slate-400 font-medium">#{s.id.slice(0, 8)}</div>}
                                            </td>
                                            <td className="px-8 py-4">
                                                <div className="text-xs text-slate-700 font-medium max-w-xs truncate" title={s.procedure_name}>
                                                    {s.procedure_name || 'Sin especificar'}
                                                </div>
                                            </td>
                                            <td className="px-8 py-4 text-xs font-bold text-slate-600">
                                                {referralSummaryMode === 'Referring' || selectedReferrerId
                                                    ? (s.doctors?.full_name || 'N/A')
                                                    : (s.referring_doctor?.full_name || 'N/A')}
                                            </td>
                                            <td className="px-8 py-4 text-right">
                                                <span className={`inline-flex px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-tighter shadow-sm ${s.status === 'completed' ? 'bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200' :
                                                        s.status === 'suspended' ? 'bg-red-100 text-red-700 ring-1 ring-red-200' :
                                                            'bg-blue-100 text-blue-700 ring-1 ring-blue-200'
                                                    }`}>
                                                    {s.status === 'completed' ? 'Realizada' : s.status === 'suspended' ? 'Suspendida' : 'Programada'}
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {/* Footer */}
                        <div className="px-8 py-4 bg-slate-50 border-t border-slate-200 flex justify-end">
                            <p className="text-[10px] text-slate-400 font-medium italic underline decoration-slate-200 underline-offset-4">Visualizando únicamente derivaciones genuinas (no auto-derivaciones).</p>
                        </div>
                    </div>
                </div>
            )}

            {/* Global Procedures Explorer Modal (Ranking & Averages) */}
            {showAllProceduresModal && (
                <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-950/40 backdrop-blur-md animate-in fade-in duration-300">
                    <div className="bg-[#F8FAFC] border border-white/40 rounded-[2.5rem] shadow-[0_32px_64px_-12px_rgba(0,0,0,0.14)] w-full max-w-5xl overflow-hidden flex flex-col max-h-[90vh] animate-in slide-in-from-bottom-8 zoom-in-95 duration-500">
                        {/* Header Modernizado */}
                        <div className="px-12 py-10 bg-white/50 backdrop-blur-sm border-b border-slate-200/60 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                            <div>
                                <div className="flex items-center gap-4 mb-2">
                                    <div className="p-3 bg-gradient-to-br from-indigo-500 to-indigo-700 rounded-2xl text-white shadow-xl shadow-indigo-200/50">
                                        <BrainCircuit className="w-6 h-6" />
                                    </div>
                                    <div>
                                        <h3 className="text-2xl font-black text-slate-900 uppercase tracking-tighter leading-tight">Explorador de Procedimientos</h3>
                                        <div className="flex items-center gap-2 mt-1">
                                            <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></span>
                                            <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest opacity-70">Inteligencia Predictiva v3.5.5</p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            
                            <div className="flex items-center gap-4 w-full md:w-auto">
                                <div className="relative flex-1 md:w-80 group">
                                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-indigo-500 transition-colors" />
                                    <input 
                                        type="text" 
                                        placeholder="Buscar por nombre o código..."
                                        value={procedureSearchQuery}
                                        onChange={(e) => setProcedureSearchQuery(e.target.value)}
                                        className="w-full bg-white border border-slate-200 rounded-2xl pl-12 pr-4 py-4 text-sm text-slate-900 font-bold focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none transition-all shadow-sm group-hover:shadow-md"
                                    />
                                </div>
                                <button
                                    onClick={() => {
                                        setShowAllProceduresModal(false);
                                        setDrillDownProcedure(null);
                                    }}
                                    className="p-4 hover:bg-white hover:shadow-lg rounded-2xl transition-all text-slate-400 hover:text-rose-500 active:scale-90 border border-transparent hover:border-rose-100"
                                >
                                    <X className="w-6 h-6" />
                                </button>
                            </div>
                        </div>

                        {/* Contenido Principal con Drill-Down */}
                        <div className="relative flex-1 overflow-hidden min-h-0 bg-[#F8FAFC] flex flex-col">
                            <div className={`flex-1 overflow-y-auto custom-scrollbar p-12 transition-all duration-500 ${drillDownProcedure ? 'opacity-0 -translate-x-20 pointer-events-none' : 'opacity-100 translate-x-0'}`}>
                                <div className="grid grid-cols-1 gap-6 pb-10">
                                    {(() => {
                                        const filtered = (predictiveStats.allDeviations || [])
                                            .filter((p: any) => {
                                                const query = procedureSearchQuery.toLowerCase();
                                                const name = (p.name || '').toLowerCase();
                                                const code = (p.code || '').toLowerCase();
                                                return name.includes(query) || code.includes(query);
                                            });

                                        if (filtered.length === 0) {
                                            return (
                                                <div className="py-24 flex flex-col items-center justify-center text-slate-400 bg-white rounded-[3rem] border-2 border-dashed border-slate-200">
                                                    <div className="p-6 bg-slate-50 rounded-full mb-6">
                                                        <Search className="w-12 h-12 opacity-20" />
                                                    </div>
                                                    <p className="font-black uppercase tracking-[0.2em] text-sm text-slate-600">No hay coincidencias</p>
                                                    <p className="text-[10px] font-bold uppercase tracking-tight text-slate-400 mt-2 max-w-[250px] text-center leading-relaxed">
                                                        Asegúrate de que existan cirugías completadas con nomenclador en este periodo.
                                                    </p>
                                                </div>
                                            );
                                        }

                                        return filtered.map((p: any, idx: number) => (
                                            <div 
                                                key={idx}
                                                onClick={() => setDrillDownProcedure(p)}
                                                className="group relative flex flex-col md:flex-row md:items-center justify-between p-8 bg-white border border-slate-100 hover:border-indigo-500/30 rounded-[2.5rem] transition-all cursor-pointer hover:shadow-[0_20px_50px_-12px_rgba(79,70,229,0.1)] active:scale-[0.99]"
                                            >
                                                <div className="flex items-center gap-8 mb-6 md:mb-0 overflow-hidden">
                                                    <div className="shrink-0 size-16 rounded-[1.5rem] bg-slate-50 border border-slate-100 flex flex-col items-center justify-center shadow-sm group-hover:bg-indigo-600 group-hover:border-indigo-600 transition-all duration-300">
                                                        <span className="text-[10px] font-black text-slate-400 group-hover:text-white/70 uppercase tracking-tighter">POS</span>
                                                        <span className="text-2xl font-black text-slate-900 group-hover:text-white leading-none">{idx + 1}</span>
                                                    </div>
                                                    <div className="min-w-0 flex-1">
                                                        <div className="flex items-center gap-3 mb-2">
                                                            <span className="shrink-0 text-[10px] bg-slate-100 text-slate-500 px-3 py-1 rounded-full font-mono font-bold uppercase border border-slate-200/50">#{p.code || 'N/A'}</span>
                                                            <span className={`shrink-0 text-[10px] px-3 py-1 rounded-full font-bold uppercase tracking-tighter ${(p.avg || 0) > 15 ? 'bg-rose-50 text-rose-500 border border-rose-100' : 'bg-emerald-50 text-emerald-500 border border-emerald-100'}`}>
                                                                {(p.avg || 0) > 0 ? 'CRÍTICO' : 'OPTIMIZADO'}
                                                            </span>
                                                        </div>
                                                        <h4 className="text-base font-black text-slate-900 uppercase tracking-tight group-hover:text-indigo-600 transition-colors line-clamp-2 leading-snug pr-4">
                                                            {p.name || 'Sin nombre'}
                                                        </h4>
                                                        <div className="flex items-center gap-4 mt-3">
                                                            <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest flex items-center gap-2">
                                                                <Users className="w-3.5 h-3.5" />
                                                                {p.count} Casos
                                                            </p>
                                                            <span className="w-1.5 h-1.5 rounded-full bg-slate-200"></span>
                                                            <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest flex items-center gap-2">
                                                                <Clock className="w-3.5 h-3.5" />
                                                                Promedio {p.avg_total_time || 'N/A'} min
                                                            </p>
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="flex items-center gap-8 shrink-0">
                                                    <div className="text-right">
                                                        <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest mb-1.5 opacity-60">Firma Predictiva</p>
                                                        <div className="flex items-center gap-3 justify-end">
                                                            <span className={`text-3xl font-black font-mono tracking-tighter leading-none ${(p.avg || 0) > 0 ? 'text-rose-500' : (p.avg || 0) < 0 ? 'text-emerald-500' : 'text-slate-400'}`}>
                                                                {(p.avg || 0) > 0 ? `+${p.avg}` : p.avg}m
                                                            </span>
                                                            <div className={`p-2 rounded-xl transition-all group-hover:scale-110 ${(p.avg || 0) > 15 ? 'bg-rose-50 text-rose-500 shadow-sm shadow-rose-100' : 'bg-emerald-50 text-emerald-500 shadow-sm shadow-emerald-100'}`}>
                                                                {(p.avg || 0) > 15 ? <TrendingUp className="w-5 h-5" /> : <TrendingUp className="w-5 h-5 rotate-180" />}
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div className="size-14 rounded-2xl bg-[#F8FAFC] border border-slate-100 flex items-center justify-center text-slate-300 group-hover:text-indigo-600 group-hover:bg-indigo-50 group-hover:border-indigo-100 transition-all shadow-inner">
                                                        <ArrowRight className="w-6 h-6" />
                                                    </div>
                                                </div>
                                            </div>
                                        ));
                                    })()}
                                </div>
                            </div>

                            {/* Detalle de Casos (Drill-Down Panel) */}
                            <div className={`absolute inset-0 bg-[#F8FAFC] z-20 transition-all duration-500 flex flex-col ${drillDownProcedure ? 'translate-x-0 opacity-100' : 'translate-x-full opacity-0'}`}>
                                <div className="px-12 py-8 bg-white border-b border-slate-200 flex justify-between items-center">
                                    <div className="flex items-center gap-6">
                                        <button 
                                            onClick={() => setDrillDownProcedure(null)}
                                            className="p-3 bg-slate-50 hover:bg-slate-100 rounded-2xl text-slate-600 transition-all active:scale-90"
                                        >
                                            <ChevronLeft className="w-6 h-6" />
                                        </button>
                                        <div>
                                            <h4 className="text-lg font-black text-slate-900 uppercase tracking-tighter line-clamp-1 max-w-[600px]">
                                                {drillDownProcedure?.name}
                                            </h4>
                                            <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest mt-1">Desglose de {drillDownProcedure?.count} casos analizados</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <div className="px-4 py-2 bg-indigo-50 rounded-xl border border-indigo-100">
                                            <p className="text-[10px] text-indigo-400 font-black uppercase tracking-widest text-center mb-0.5 leading-none">Promedio</p>
                                            <p className="text-xl font-black text-indigo-600 text-center leading-none font-mono">{drillDownProcedure?.avg_total_time}m</p>
                                        </div>
                                    </div>
                                </div>

                                <div className="flex-1 overflow-y-auto p-12 custom-scrollbar">
                                    <div className="bg-white rounded-[2.5rem] border border-slate-200/60 shadow-sm overflow-hidden">
                                        <table className="w-full text-left border-collapse">
                                            <thead>
                                                <tr className="bg-slate-50/80">
                                                    <th className="px-8 py-6 text-[10px] font-black text-slate-500 uppercase tracking-widest">Paciente / Médico</th>
                                                    <th className="px-8 py-6 text-[10px] font-black text-slate-500 uppercase tracking-widest">Fecha</th>
                                                    <th className="px-8 py-6 text-[10px] font-black text-slate-500 uppercase tracking-widest text-center">Duración Real</th>
                                                    <th className="px-8 py-6 text-[10px] font-black text-slate-500 uppercase tracking-widest text-right">Desvío</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100">
                                                {drillDownProcedure?.surgeries?.map((s: any, i: number) => (
                                                    <tr key={i} className="hover:bg-slate-50/50 transition-colors">
                                                        <td className="px-8 py-6">
                                                            <p className="text-sm font-black text-slate-900 uppercase tracking-tight">{s.patient_name}</p>
                                                            <div className="flex items-center gap-2 mt-1">
                                                                <Stethoscope className="w-3 h-3 text-slate-400" />
                                                                <p className="text-[10px] text-slate-500 font-bold uppercase">{s.doctor_name}</p>
                                                            </div>
                                                        </td>
                                                        <td className="px-8 py-6">
                                                            <p className="text-xs font-bold text-slate-600">{format(new Date(s.date + 'T12:00:00'), 'dd/MM/yyyy')}</p>
                                                        </td>
                                                        <td className="px-8 py-6 text-center">
                                                            <div className="flex flex-col items-center">
                                                                <span className="text-sm font-black text-slate-900 font-mono">{s.actual_duration}m</span>
                                                                <span className="text-[9px] text-slate-400 font-bold uppercase">Est: {s.estimated_duration}m</span>
                                                            </div>
                                                        </td>
                                                        <td className="px-8 py-6 text-right">
                                                            <span className={`text-sm font-black font-mono ${s.deviation > 0 ? 'text-rose-500' : 'text-emerald-500'}`}>
                                                                {s.deviation > 0 ? `+${s.deviation}` : s.deviation}m
                                                            </span>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Footer Modernizado */}
                        <div className="px-12 py-8 bg-white border-t border-slate-100 flex justify-between items-center">
                            <div className="flex items-center gap-4">
                                <div className="p-2 bg-indigo-50 rounded-lg">
                                    <Info className="w-4 h-4 text-indigo-500" />
                                </div>
                                <p className="text-[9px] font-black uppercase tracking-[0.15em] text-slate-400 max-w-xs leading-relaxed">
                                    {drillDownProcedure 
                                        ? "Listado completo de intervenciones que conforman la estadística predictiva de este nomenclador."
                                        : "Haz clic en cualquier procedimiento para ver el listado detallado de cirugías analizadas."}
                                </p>
                            </div>
                            <div className="flex items-center gap-4">
                                {drillDownProcedure && (
                                    <button
                                        onClick={() => setDrillDownProcedure(null)}
                                        className="px-8 py-4 bg-slate-100 text-slate-600 text-[10px] font-black uppercase tracking-[0.2em] rounded-2xl hover:bg-slate-200 transition-all active:scale-95"
                                    >
                                        Volver al Ranking
                                    </button>
                                )}
                                <button
                                    onClick={() => {
                                        setShowAllProceduresModal(false);
                                        setDrillDownProcedure(null);
                                    }}
                                    className="px-10 py-4 bg-indigo-600 text-white text-[10px] font-black uppercase tracking-[0.2em] rounded-2xl hover:bg-indigo-700 transition-all shadow-xl shadow-indigo-200 active:scale-95"
                                >
                                    Cerrar Explorador
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ResultsDashboard;