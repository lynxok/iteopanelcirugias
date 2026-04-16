import React, { useState, useEffect } from 'react';
import { supabase } from '../src/lib/supabase';
import { useAuth } from '../src/lib/AuthContext';
import { useNavigate } from 'react-router-dom';
import ProgressBar from '../components/ProgressBar';

const ResultsDashboard: React.FC = () => {
    const navigate = useNavigate();
    const { user } = useAuth();
    const [period, setPeriod] = useState('Este Mes');

    const [loading, setLoading] = useState(true);
    const [stats, setStats] = useState({
        totalCompleted: 0,
        successRate: '0%',
        suspensionRate: '0%',
        avgOccupancy: '0%',
        totalPeriod: 0
    });
    const [orOccupancy, setOrOccupancy] = useState<{ name: string, value: number, goal: number }[]>([]);
    const [suspensionReasons, setSuspensionReasons] = useState<{ label: string, value: number, color: string }[]>([]);
    const [efficiencyData, setEfficiencyData] = useState<any[]>([]);
    const [selectedDocDetails, setSelectedDocDetails] = useState<{ doctor: string, surgeries: any[] } | null>(null);

    useEffect(() => {
        if (user?.role === 'Medico') {
            navigate('/surgeries');
            return;
        }
        fetchResults();
    }, [period, user, navigate]);

    const fetchResults = async () => {
        setLoading(true);
        try {
            // 1. Fetch ORs with goals
            const { data: ors, error: orError } = await supabase
                .from('operating_rooms')
                .select('id, name, daily_goal')
                .eq('active', true);

            if (orError) throw orError;

            // 2. Fetch Surgeries with Doctor and Patient info
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
                    doctors!doctor_id (
                        full_name,
                        specialty
                    ),
                    patients!patient_id (
                        full_name
                    )
                `);

            if (surError) throw surError;

            const total = surgeries?.length || 0;
            const completed = surgeries?.filter(s => s.status === 'completed').length || 0;
            const suspended = surgeries?.filter(s => s.status === 'suspended').length || 0;

            // Calculate Stats
            const suspRate = total > 0 ? ((suspended / total) * 100).toFixed(1) : '0';
            const succRate = total > 0 ? ((completed / total) * 100).toFixed(1) : '0';

            // Calculate OR Occupancy
            const orData = (ors || []).map(or => {
                const orSurgeries = surgeries?.filter(s => s.operating_room_id === or.id && s.status === 'completed').length || 0;
                const goal = or.daily_goal || 4;
                const value = Math.min(100, Math.round((orSurgeries / goal) * 100)); // Simple calc for demo
                return { name: or.name, value, goal };
            });

            const avgOcc = orData.length > 0
                ? Math.round(orData.reduce((acc, curr) => acc + curr.value, 0) / orData.length)
                : 0;

            setStats({
                totalCompleted: completed,
                successRate: `${succRate}%`,
                suspensionRate: `${suspRate}%`,
                avgOccupancy: `${avgOcc}%`,
                totalPeriod: total
            });

            setOrOccupancy(orData);

            // Suspension Reasons
            const reasons = suspended > 0 ? Object.entries(
                surgeries?.filter(s => s.status === 'suspended' && s.suspension_reason)
                    .reduce((acc: any, s) => {
                        acc[s.suspension_reason] = (acc[s.suspension_reason] || 0) + 1;
                        return acc;
                    }, {})
            ).map(([label, count]: [string, any]) => ({
                label,
                value: Math.round((count / suspended) * 100),
                color: label.includes('Material') ? 'bg-orange-500' : 'bg-blue-500'
            })) : [];

            setSuspensionReasons(reasons);

            // 3. Calculate Efficiency Data (Group by Doctor)
            const doctorStats: Record<string, any> = {};

            surgeries?.forEach(s => {
                if (!s.doctor_id || !s.doctors) return;
                const docName = (s.doctors as any).full_name || 'Desconocido';
                const specialty = (s.doctors as any).specialty || 'General';

                if (!doctorStats[s.doctor_id]) {
                    doctorStats[s.doctor_id] = {
                        doctor: docName,
                        specialty: specialty,
                        totalScheduled: 0, // Programadas (Total en el listado)
                        totalPerformed: 0, // Realizadas (Completadas)
                        totalDuration: 0,
                        avgTime: 0,
                        surgeries: [] // Store individual surgeries for drill-down
                    };
                }

                // Increment counts and store individual surgeries
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
                complications: '0%', // Placeholder until complications tracking is added
                performance: Math.min(5, Math.ceil(doc.totalPerformed / 5)), // Star logic based on performed
                surgeries: doc.surgeries // Pass down the details
            })).sort((a, b) => b.performed - a.performed);

            setEfficiencyData(processedEfficiency);

        } catch (err) {
            console.error('Error fetching results:', err);
        } finally {
            setLoading(false);
        }
    };

    const kpis = [
        { title: 'Cirugías Realizadas', value: stats.totalCompleted, trend: '+12%', isPositive: true, icon: 'medical_services', color: 'blue' },
        { title: 'Tasa de Éxito', value: stats.successRate, trend: '+0.5%', isPositive: true, icon: 'check_circle', color: 'emerald' },
        { title: 'Tasa de Suspensión', value: stats.suspensionRate, trend: '-1.5%', isPositive: true, icon: 'cancel', color: 'red' },
        { title: 'Ocupación Quirófano', value: stats.avgOccupancy, trend: '+5%', isPositive: true, icon: 'door_sliding', color: 'purple' },
    ];

    // Simple CSS Chart Components
    const BarChartItem = ({ label, height, colorClass }: any) => (
        <div className="flex flex-col items-center gap-2 flex-1 group">
            <div className="relative w-full bg-slate-100 rounded-2xl h-36 flex items-end justify-center overflow-hidden border border-slate-200 shadow-inner">
                <div className={`w-full mx-3 rounded-t-xl transition-all duration-500 group-hover:opacity-90 shadow-lg ${colorClass}`} style={{ height: height }}></div>
            </div>
            <span className="text-xs text-slate-500 font-bold uppercase tracking-wider">{label}</span>
        </div>
    );

    return (
        <div className="flex-1 h-full overflow-y-auto bg-slate-50 relative pb-12 font-sans">
            <ProgressBar isLoading={loading} />
            {/* Background Decoration */}
            <div className="absolute top-0 left-0 w-full h-96 bg-gradient-to-b from-blue-50/50 to-transparent pointer-events-none z-0" />

            <div className="relative z-10 max-w-[1920px] mx-auto p-6 md:p-8 flex flex-col gap-8">

                {/* Header */}
                <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 glass-panel p-6 shadow-sm">
                    <div>
                        <div className="flex items-center gap-2 mb-2">
                            <span className="flex h-2 w-2 rounded-full bg-indigo-500"></span>
                            <span className="text-indigo-600 text-[10px] font-black uppercase tracking-widest">Analytics Dashboard</span>
                        </div>
                        <h1 className="text-3xl font-black text-slate-900 tracking-tight leading-none">Resultados Operativos</h1>
                        <p className="text-slate-500 text-sm font-medium mt-1">Monitor de eficiencia, calidad y rendimiento quirúrgico.</p>
                    </div>

                    <div className="bg-slate-100 p-1.5 rounded-xl flex items-center shadow-inner">
                        {['Esta Semana', 'Este Mes', 'Este Trimestre', 'Este Año'].map(p => (
                            <button
                                key={p}
                                onClick={() => setPeriod(p)}
                                className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${period === p
                                    ? 'bg-white text-slate-900 shadow-md ring-1 ring-black/5 scale-100'
                                    : 'text-slate-500 hover:text-slate-900 hover:bg-slate-200/50'
                                    }`}
                            >
                                {p}
                            </button>
                        ))}
                    </div>
                </div>

                {/* KPI Grid - Bento Style */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    {kpis.map((kpi, idx) => (
                        <div key={idx} className="glass-panel p-6 flex flex-col justify-between h-40 group hover:shadow-lg transition-all border-l-4" style={{ borderLeftColor: `var(--color-${kpi.color}-500)` }}>
                            <div className="flex justify-between items-start">
                                <div className={`p-3 rounded-2xl bg-${kpi.color}-50 text-${kpi.color}-600 group-hover:scale-110 transition-transform`}>
                                    <span className="material-symbols-outlined text-2xl">{kpi.icon}</span>
                                </div>
                                <div className={`flex items-center gap-1 text-xs font-black px-2 py-1 rounded-full ${kpi.isPositive ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'}`}>
                                    <span className="material-symbols-outlined text-sm font-bold">
                                        {kpi.isPositive ? 'trending_up' : 'trending_down'}
                                    </span>
                                    <span>{kpi.trend}</span>
                                </div>
                            </div>
                            <div>
                                <h3 className="text-4xl font-black text-slate-800 tracking-tighter">{kpi.value}</h3>
                                <p className="text-slate-400 text-xs font-bold uppercase tracking-wider mt-1">{kpi.title}</p>
                            </div>
                        </div>
                    ))}
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                    {/* Chart: Activity Volume */}
                    <div className="lg:col-span-2 glass-panel p-8 flex flex-col shadow-sm">
                        <div className="flex justify-between items-center mb-8">
                            <div>
                                <h3 className="font-black text-xl text-slate-800">Volumen & Ocupación</h3>
                                <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">Rendimiento por Quirófano</p>
                            </div>
                            <button className="text-slate-400 hover:text-indigo-600 transition-colors bg-slate-50 p-2 rounded-lg">
                                <span className="material-symbols-outlined">more_horiz</span>
                            </button>
                        </div>

                        {/* Dynamic Chart per OR */}
                        <div className="flex-1 flex items-end gap-4 md:gap-8 px-4 border-b border-slate-100 pb-8 overflow-x-auto min-h-[250px]">
                            {orOccupancy.map((or, idx) => (
                                <BarChartItem
                                    key={idx}
                                    label={or.name}
                                    height={`${or.value}%`}
                                    colorClass={or.value > 90 ? "bg-emerald-500 shadow-emerald-500/30" : or.value > 50 ? "bg-blue-500 shadow-blue-500/30" : "bg-amber-400 shadow-amber-500/30"}
                                />
                            ))}
                            {orOccupancy.length === 0 && (
                                <div className="w-full h-full flex items-center justify-center text-slate-300 italic font-medium">No hay datos de ocupación disponibles.</div>
                            )}
                        </div>
                        <div className="mt-8 grid grid-cols-3 gap-4 text-center divide-x divide-slate-100">
                            <div>
                                <p className="text-[10px] text-slate-400 uppercase font-bold tracking-widest mb-1">Ocupación Prom.</p>
                                <p className="font-black text-slate-900 text-2xl">{stats.avgOccupancy}</p>
                            </div>
                            <div>
                                <p className="text-[10px] text-slate-400 uppercase font-bold tracking-widest mb-1">Total Cirugías</p>
                                <p className="font-black text-slate-900 text-2xl">{stats.totalPeriod}</p>
                            </div>
                            <div>
                                <p className="text-[10px] text-slate-400 uppercase font-bold tracking-widest mb-1">Quirófanos Activos</p>
                                <p className="font-black text-slate-900 text-2xl">{orOccupancy.length}</p>
                            </div>
                        </div>
                    </div>

                    {/* Chart: Suspension Reasons */}
                    <div className="glass-panel p-8 flex flex-col shadow-sm">
                        <h3 className="font-black text-xl text-slate-800 mb-2">Motivos de Suspensión</h3>
                        <p className="text-xs text-slate-400 font-bold uppercase tracking-wider mb-8">Análisis de causas raíz</p>

                        <div className="flex-1 flex flex-col justify-center gap-6">
                            {suspensionReasons.map((reason, suspensionIndex) => (
                                <div key={suspensionIndex} className="group cursor-default">
                                    <div className="flex justify-between text-xs mb-2 font-black uppercase tracking-wide">
                                        <span className="text-slate-600 group-hover:text-slate-900 transition-colors">{reason.label}</span>
                                        <span className="text-slate-900 bg-slate-100 px-2 rounded">{reason.value}%</span>
                                    </div>
                                    <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden shadow-inner">
                                        <div className={`h-full rounded-full transition-all duration-1000 ${reason.color}`} style={{ width: `${reason.value}%` }}></div>
                                    </div>
                                </div>
                            ))}
                            {suspensionReasons.length === 0 && (
                                <div className="text-center text-slate-400 text-sm py-12 border-2 border-dashed border-slate-200 rounded-xl">No hay suspensiones registradas.</div>
                            )}
                        </div>

                        <div className="mt-8 p-4 bg-red-50 rounded-xl border border-red-100 flex gap-3 items-start">
                            <span className="material-symbols-outlined text-red-500 mt-0.5">warning</span>
                            <p className="text-xs text-red-800 font-medium leading-relaxed">
                                <strong className="block mb-1 text-red-900 uppercase tracking-wide">Atención Requerida</strong>
                                Analice los motivos de suspensión para tomar acciones correctivas inmediatas y reducir tiempos muertos.
                            </p>
                        </div>
                    </div>
                </div>

                {/* Efficiency Table */}
                <div className="glass-panel overflow-hidden shadow-sm">
                    <div className="px-8 py-6 border-b border-slate-100 flex justify-between items-center bg-white/50 backdrop-blur-md sticky top-0 md:relative">
                        <div>
                            <h3 className="font-black text-xl text-slate-800">Eficiencia por Profesional</h3>
                            <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">Desglose de productividad y calidad</p>
                        </div>
                        <button className="text-indigo-600 text-xs font-black uppercase tracking-wider hover:bg-indigo-50 px-4 py-2 rounded-lg transition-colors flex items-center gap-2">
                            Ver Reporte Completo <span className="material-symbols-outlined text-sm">arrow_forward</span>
                        </button>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead className="bg-slate-50/50 text-slate-400 text-[10px] uppercase font-black tracking-widest border-b border-slate-100">
                                <tr>
                                    <th className="px-8 py-4">Profesional</th>
                                    <th className="px-6 py-4">Especialidad</th>
                                    <th className="px-6 py-4 text-center">Programadas</th>
                                    <th className="px-6 py-4 text-center">Realizadas</th>
                                    <th className="px-6 py-4 text-center">Tiempo Prom.</th>
                                    <th className="px-6 py-4 text-center">Complicaciones</th>
                                    <th className="px-8 py-4 text-right">Desempeño</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 bg-white">
                                {efficiencyData.length > 0 ? (
                                    efficiencyData.map((row, idx) => (
                                        <tr
                                            key={idx}
                                            className="hover:bg-slate-50 cursor-pointer active:bg-slate-100 transition-colors group"
                                            onClick={() => setSelectedDocDetails({ doctor: row.doctor, surgeries: row.surgeries })}
                                        >
                                            <td className="px-8 py-5 font-bold text-slate-800 group-hover:text-indigo-600 transition-colors">
                                                <div className="flex items-center gap-3">
                                                    <div className="size-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 group-hover:bg-indigo-100 group-hover:text-indigo-600 transition-all font-bold text-xs">
                                                        {row.doctor.charAt(0)}
                                                    </div>
                                                    {row.doctor}
                                                </div>
                                            </td>
                                            <td className="px-6 py-5 text-xs font-bold text-slate-500 uppercase tracking-wide">{row.specialty}</td>
                                            <td className="px-6 py-5 text-center text-sm font-medium text-slate-600">{row.scheduled}</td>
                                            <td className="px-6 py-5 text-center text-sm font-black text-emerald-600 bg-emerald-50/10 rounded-lg">{row.performed}</td>
                                            <td className="px-6 py-5 text-center text-sm font-mono text-slate-600 bg-slate-50/50 rounded mx-2">{row.avgTime}</td>
                                            <td className="px-6 py-5 text-center">
                                                <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-[10px] font-black uppercase tracking-wider ${parseFloat(row.complications) === 0 ? 'bg-emerald-100 text-emerald-700' :
                                                    parseFloat(row.complications) < 5 ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'
                                                    }`}>
                                                    {row.complications}
                                                </span>
                                            </td>
                                            <td className="px-8 py-5 text-right">
                                                <div className="flex justify-end gap-0.5">
                                                    {[1, 2, 3, 4, 5].map(star => (
                                                        <span key={star} className={`material-symbols-outlined text-sm ${star <= row.performance ? 'text-amber-400 filled' : 'text-slate-200'}`}>star</span>
                                                    ))}
                                                </div>
                                            </td>
                                        </tr>
                                    ))
                                ) : (
                                    <tr>
                                        <td colSpan={7} className="px-6 py-12 text-center text-slate-400 italic font-medium">No hay datos de eficiencia disponibles para el periodo seleccionado.</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

            </div>

            {/* Drill-down Modal */}
            {selectedDocDetails && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="glass-panel w-full max-w-4xl overflow-hidden flex flex-col max-h-[85vh] shadow-2xl ring-1 ring-black/5">
                        {/* Modal Header */}
                        <div className="px-8 py-6 bg-slate-50/80 backdrop-blur-md border-b border-slate-200 flex justify-between items-center sticky top-0 z-20">
                            <div>
                                <h3 className="text-2xl font-black text-slate-900 tracking-tight">{selectedDocDetails.doctor}</h3>
                                <p className="text-xs text-slate-500 font-bold uppercase tracking-widest mt-1">Historial de Operaciones</p>
                            </div>
                            <button
                                onClick={() => setSelectedDocDetails(null)}
                                className="size-8 flex items-center justify-center hover:bg-slate-200 rounded-full transition-colors text-slate-400 hover:text-slate-900"
                            >
                                <span className="material-symbols-outlined">close</span>
                            </button>
                        </div>

                        {/* Modal Content */}
                        <div className="overflow-y-auto flex-1 bg-white">
                            <table className="w-full text-left border-collapse">
                                <thead className="sticky top-0 bg-white border-b border-slate-200 shadow-sm z-10">
                                    <tr className="text-[10px] uppercase font-black text-slate-400 tracking-widest bg-slate-50/50">
                                        <th className="px-8 py-4">Fecha</th>
                                        <th className="px-6 py-4">Paciente</th>
                                        <th className="px-6 py-4">Procedimiento</th>
                                        <th className="px-8 py-4 text-right">Estado</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {selectedDocDetails.surgeries.map((s: any) => (
                                        <tr key={s.id} className="hover:bg-slate-50 transition-colors">
                                            <td className="px-8 py-5 text-sm font-mono text-slate-500 font-medium">
                                                {s.surgery_date ? new Date(s.surgery_date).toLocaleDateString('es-AR') : 'N/A'}
                                            </td>
                                            <td className="px-6 py-5 font-bold text-slate-900">
                                                {s.patients?.full_name || 'Desconocido'}
                                            </td>
                                            <td className="px-6 py-5 text-sm text-slate-600 font-medium truncate max-w-xs">
                                                {s.procedure_name || 'Sin especificar'}
                                            </td>
                                            <td className="px-8 py-5 text-right">
                                                <span className={`inline-flex px-3 py-1 rounded-md text-[10px] font-black uppercase tracking-wider ${s.status === 'completed' ? 'bg-emerald-100 text-emerald-700' :
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
                        <div className="px-8 py-6 bg-slate-50 border-t border-slate-200 flex justify-between items-center">
                            <span className="text-xs text-slate-500 font-black uppercase tracking-wide">Total: {selectedDocDetails.surgeries.length} cirugías</span>
                            <button
                                onClick={() => setSelectedDocDetails(null)}
                                className="px-8 py-3 bg-slate-900 text-white text-xs font-bold uppercase tracking-wider rounded-xl hover:bg-slate-800 transition-all shadow-lg active:scale-95 hover:shadow-xl"
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

export default ResultsDashboard;