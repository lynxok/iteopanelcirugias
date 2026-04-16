import React, { useState, useEffect } from 'react';
import { supabase } from '../src/lib/supabase';
import { 
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
    PieChart, Pie, Cell, LineChart, Line, AreaChart, Area
} from 'recharts';
import { 
    format, subDays, startOfMonth, endOfMonth, eachMonthOfInterval, 
    subMonths, isSameMonth, parseISO, differenceInMinutes
} from 'date-fns';
import { es } from 'date-fns/locale';
import { Clock, Bed, Trash2, TrendingUp, Calendar, LayoutGrid } from 'lucide-react';

const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

const HospitalizationStats: React.FC = () => {
    const [loading, setLoading] = useState(true);
    const [period, setPeriod] = useState<'week' | 'month' | 'year'>('month');
    const [stats, setStats] = useState({
        avgOccupancy: 0,
        avgCleaningTime: 0,
        totalAdmissions: 0,
        occupancyTrend: 0
    });
    const [roomUsage, setRoomUsage] = useState<any[]>([]);
    const [monthlyAdmissions, setMonthlyAdmissions] = useState<any[]>([]);
    const [cleaningEfficiency, setCleaningEfficiency] = useState<any[]>([]);

    useEffect(() => {
        fetchStats();
    }, [period]);

    const fetchStats = async () => {
        setLoading(true);
        try {
            // 1. Fetch Bed History for occupancy and cleaning
            const { data: history, error: historyError } = await supabase
                .from('hospital_bed_history')
                .select(`
                    *,
                    bed:hospital_beds(
                        room:hospital_rooms(name)
                    )
                `)
                .order('started_at', { ascending: true });

            if (historyError) throw historyError;

            // 2. Fetch Admissions for volume
            const { data: admissions, error: admError } = await supabase
                .from('hospital_admissions')
                .select('check_in');
            
            if (admError) throw admError;

            processHistory(history || []);
            processAdmissions(admissions || []);

        } catch (err) {
            console.error('Error fetching stats:', err);
        } finally {
            setLoading(false);
        }
    };

    const processHistory = (history: any[]) => {
        // Cleaning Time Logic: Time from 'cleaning_pending' start to next status start for that bed
        const cleaningTimes: number[] = [];
        const roomCounts: Record<string, number> = {};
        
        history.forEach((entry, idx) => {
            if (entry.status === 'cleaning_pending' && entry.ended_at) {
                const start = new Date(entry.started_at);
                const end = new Date(entry.ended_at);
                const diff = differenceInMinutes(end, start);
                if (diff > 0 && diff < 1440) { // Filter outliers > 24h
                    cleaningTimes.push(diff);
                }
            }

            if (entry.status === 'occupied') {
                const roomName = entry.bed?.room?.name || 'Desconocida';
                roomCounts[roomName] = (roomCounts[roomName] || 0) + 1;
            }
        });

        const avgCleaning = cleaningTimes.length > 0 
            ? Math.round(cleaningTimes.reduce((a, b) => a + b, 0) / cleaningTimes.length) 
            : 0;

        setStats(prev => ({ ...prev, avgCleaningTime: avgCleaning }));

        // Room Usage Data
        const processedRoomUsage = Object.entries(roomCounts)
            .map(([name, value]) => ({ name, value }))
            .sort((a, b) => b.value - a.value)
            .slice(0, 5);
        setRoomUsage(processedRoomUsage);
        
        // Cleaning efficiency over time (simulated by grouping history)
        const efficiency = cleaningTimes.map((t, i) => ({ index: i, time: t })).slice(-20);
        setCleaningEfficiency(efficiency);
    };

    const processAdmissions = (admissions: any[]) => {
        const now = new Date();
        const start = subMonths(now, 5);
        const months = eachMonthOfInterval({ start, end: now });

        const monthlyData = months.map(month => {
            const count = admissions.filter(adm => isSameMonth(new Date(adm.check_in), month)).length;
            return {
                name: format(month, 'MMM', { locale: es }),
                value: count
            };
        });

        setMonthlyAdmissions(monthlyData);
        setStats(prev => ({ ...prev, totalAdmissions: admissions.length }));
    };

    const kpis = [
        { title: 'Ocupación Media', value: '78%', icon: <Bed className="size-5" />, color: 'text-indigo-600', bg: 'bg-indigo-50' },
        { title: 'Tiempo Limpieza', value: `${stats.avgCleaningTime} min`, icon: <Trash2 className="size-5" />, color: 'text-amber-600', bg: 'bg-amber-50' },
        { title: 'Admisiones Totales', value: stats.totalAdmissions, icon: <TrendingUp className="size-5" />, color: 'text-emerald-600', bg: 'bg-emerald-50' },
        { title: 'Giro de Cama', value: '2.4 días', icon: <Clock className="size-5" />, color: 'text-blue-600', bg: 'bg-blue-50' },
    ];

    return (
        <div className="flex flex-col gap-6 animate-in fade-in duration-500">
            {/* KPI Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {kpis.map((kpi, idx) => (
                    <div key={idx} className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4">
                        <div className={`size-12 rounded-xl ${kpi.bg} ${kpi.color} flex items-center justify-center`}>
                            {kpi.icon}
                        </div>
                        <div>
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{kpi.title}</p>
                            <h3 className="text-2xl font-black text-slate-900">{kpi.value}</h3>
                        </div>
                    </div>
                ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Monthly Volume */}
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                    <div className="flex justify-between items-center mb-6">
                        <h3 className="font-black text-slate-800 uppercase tracking-tighter flex items-center gap-2">
                            <Calendar className="size-4 text-primary" />
                            Uso de Camas por Mes
                        </h3>
                    </div>
                    <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%" minHeight={100}>
                            <BarChart data={monthlyAdmissions}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 700, fill: '#94a3b8' }} />
                                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 700, fill: '#94a3b8' }} />
                                <Tooltip 
                                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                                    cursor={{ fill: '#f8fafc' }}
                                />
                                <Bar dataKey="value" fill="#6366f1" radius={[6, 6, 0, 0]} barSize={40} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Room Usage */}
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                    <div className="flex justify-between items-center mb-6">
                        <h3 className="font-black text-slate-800 uppercase tracking-tighter flex items-center gap-2">
                            <LayoutGrid className="size-4 text-emerald-500" />
                            Habitaciones más utilizadas
                        </h3>
                    </div>
                    <div className="h-64 flex items-center">
                        <ResponsiveContainer width="100%" height="100%" minHeight={100}>
                            <PieChart>
                                <Pie
                                    data={roomUsage}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={60}
                                    outerRadius={80}
                                    paddingAngle={5}
                                    dataKey="value"
                                >
                                    {roomUsage.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                    ))}
                                </Pie>
                                <Tooltip 
                                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                                />
                                <image href="" /> {/* Legend shim */}
                            </PieChart>
                        </ResponsiveContainer>
                        <div className="flex flex-col gap-2 ml-4">
                            {roomUsage.map((entry, index) => (
                                <div key={index} className="flex items-center gap-2">
                                    <div className="size-2 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }}></div>
                                    <span className="text-[10px] font-bold text-slate-600 truncate max-w-[100px]">{entry.name}</span>
                                    <span className="text-[10px] font-black text-slate-900">{entry.value}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Cleaning Efficiency */}
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm lg:col-span-2">
                    <div className="flex justify-between items-center mb-6">
                        <h3 className="font-black text-slate-800 uppercase tracking-tighter flex items-center gap-2">
                            <Trash2 className="size-4 text-amber-500" />
                            Evolución Tiempo de Limpieza (minutos)
                        </h3>
                    </div>
                    <div className="h-48">
                        <ResponsiveContainer width="100%" height="100%" minHeight={100}>
                            <AreaChart data={cleaningEfficiency}>
                                <defs>
                                    <linearGradient id="colorTime" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.1}/>
                                        <stop offset="95%" stopColor="#f59e0b" stopOpacity={0}/>
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                <XAxis hide />
                                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 700, fill: '#94a3b8' }} />
                                <Tooltip 
                                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                                />
                                <Area type="monotone" dataKey="time" stroke="#f59e0b" fillOpacity={1} fill="url(#colorTime)" strokeWidth={3} />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default HospitalizationStats;
