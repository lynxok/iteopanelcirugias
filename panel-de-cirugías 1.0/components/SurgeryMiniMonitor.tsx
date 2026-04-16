import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../src/lib/supabase';
import { OperatingRoom } from '../types';
import { motion, AnimatePresence } from 'framer-motion';

interface MiniMonitorSurgery {
    id: string;
    patientName: string;
    procedure: string;
    status: string;
    startTime: string;
    estimatedDuration: number;
    orId: string;
}

const SurgeryMiniMonitor: React.FC = () => {
    const [surgeries, setSurgeries] = useState<MiniMonitorSurgery[]>([]);
    const [ors, setOrs] = useState<OperatingRoom[]>([]);
    const [loading, setLoading] = useState(true);
    const [currentTime, setCurrentTime] = useState(new Date());

    const fetchData = useCallback(async () => {
        try {
            // Fetch active ORs
            const { data: orData } = await supabase
                .from('operating_rooms')
                .select('*')
                .eq('active', true)
                .order('name');
            if (orData) setOrs(orData);

            // Fetch today's surgeries
            const today = new Date().toISOString().split('T')[0];
            const { data: sxData, error } = await supabase
                .from('surgeries')
                .select(`
                    id,
                    status,
                    start_time,
                    estimated_duration,
                    procedure_name,
                    operating_room_id,
                    patients (full_name)
                `)
                .eq('surgery_date', today)
                .neq('status', 'cancelled')
                .neq('status', 'suspended')
                .order('start_time', { ascending: true });

            if (error) throw error;

            if (sxData) {
                const mapped: MiniMonitorSurgery[] = sxData.map((s: any) => ({
                    id: s.id,
                    patientName: s.patients?.full_name || 'N/A',
                    procedure: s.procedure_name || 'N/A',
                    status: s.status,
                    startTime: s.start_time || '00:00',
                    estimatedDuration: s.estimated_duration || 60,
                    orId: s.operating_room_id
                }));
                setSurgeries(mapped);
            }
        } catch (err) {
            console.error('Error fetching mini monitor data:', err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchData();
        const timer = setInterval(() => setCurrentTime(new Date()), 30000); // Update every 30s
        
        const channel = supabase
            .channel('mini-monitor-changes')
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'surgeries' },
                () => fetchData()
            )
            .subscribe();

        return () => {
            clearInterval(timer);
            supabase.removeChannel(channel);
        };
    }, [fetchData]);

    const getRemainingMinutesToEnd = (startTime: string, duration: number) => {
        const [h, m] = startTime.split(':').map(Number);
        const end = new Date();
        end.setHours(h, m + duration, 0, 0);
        const diff = end.getTime() - currentTime.getTime();
        return Math.floor(diff / (1000 * 60));
    };

    const getMinutesToStart = (startTime: string) => {
        const [h, m] = startTime.split(':').map(Number);
        const start = new Date();
        start.setHours(h, m, 0, 0);
        const diff = start.getTime() - currentTime.getTime();
        return Math.floor(diff / (1000 * 60));
    };

    return (
        <div className="bg-white/70 backdrop-blur-xl rounded-2xl border border-slate-200 shadow-xl overflow-hidden flex flex-col h-full min-h-[300px] lg:min-h-[500px]">
            <div className="bg-slate-900 px-4 py-3 border-b border-slate-800 flex justify-between items-center">
                <h3 className="font-black text-white uppercase tracking-wider flex items-center gap-2 text-[11px] md:text-sm">
                    <span className="material-symbols-outlined text-primary text-base md:text-lg">live_tv</span>
                    Estado de Quirófanos
                </h3>
                <div className="bg-emerald-500/20 px-2 py-0.5 rounded flex items-center gap-1.5">
                    <span className="flex h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
                    <span className="text-[10px] font-black text-emerald-500 uppercase tracking-widest">En Vivo</span>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
                {loading ? (
                    <div className="flex items-center justify-center h-full py-10">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                    </div>
                ) : ors.length === 0 ? (
                    <div className="text-center py-10 text-slate-400 italic">No hay quirófanos activos</div>
                ) : (
                    ors.map(or => {
                        const roomSurgeries = surgeries.filter(s => s.orId === or.id);
                        
                        // Rule Logic
                        const current = roomSurgeries.find(s => ['in_progress', 'in_or', 'delayed'].includes(s.status));
                        const next = roomSurgeries.find(s => ['scheduled', 'pending_validation', 'waiting_date'].includes(s.status) && s.id !== current?.id);
                        
                        const minsToEnd = current ? getRemainingMinutesToEnd(current.startTime, current.estimatedDuration) : null;
                        const minsToStart = next ? getMinutesToStart(next.startTime) : null;

                        // Identify Alert Type
                        let alertType: 'turnover' | 'standard' | null = null;
                        
                        // Rule 1: Turnover Alert (45 min before end of current, if next is within 30 min of that end)
                        if (current && minsToEnd !== null && minsToEnd <= 45 && next) {
                            const [curH, curM] = current.startTime.split(':').map(Number);
                            const curEnd = new Date(); curEnd.setHours(curH, curM + current.estimatedDuration);
                            const [nextH, nextM] = next.startTime.split(':').map(Number);
                            const nextStart = new Date(); nextStart.setHours(nextH, nextM);
                            
                            const gap = (nextStart.getTime() - curEnd.getTime()) / (1000 * 60);
                            if (gap <= 30) {
                                alertType = 'turnover';
                            }
                        }

                        // Rule 2: Standard Alert (45 min before start of any next)
                        if (!alertType && next && minsToStart !== null && minsToStart <= 45) {
                            alertType = 'standard';
                        }

                        return (
                            <div key={or.id} className="border border-slate-100 rounded-xl p-3 bg-white/50 backdrop-blur-sm shadow-sm transition-all hover:shadow-md">
                                <div className="flex justify-between items-center mb-2">
                                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">{or.name}</span>
                                    {current && (
                                        <span className={`text-[9px] font-black px-2 py-0.5 rounded-full uppercase border ${
                                            current.status === 'in_progress' ? 'bg-indigo-50 text-indigo-700 border-indigo-100 animate-pulse' : 
                                            current.status === 'delayed' ? 'bg-amber-50 text-amber-700 border-amber-100' :
                                            'bg-slate-100 text-slate-500 border-slate-200'
                                        }`}>
                                            {current.status === 'in_progress' ? 'En Curso' : current.status === 'delayed' ? 'Demorada' : 'En Quirófano'}
                                        </span>
                                    )}
                                </div>

                                {current ? (
                                    <div className="space-y-1">
                                        <p className="text-xs font-black text-slate-900 truncate leading-none mb-1">{current.patientName}</p>
                                        <div className="flex items-center justify-between">
                                            <p className="text-[10px] text-slate-500 truncate max-w-[150px] font-medium">{current.procedure}</p>
                                            <div className="flex items-center gap-1.5 bg-slate-100 px-2 py-0.5 rounded-lg border border-slate-200">
                                                <span className="material-symbols-outlined text-[12px] text-slate-400">timer</span>
                                                <span className={`text-[10px] font-black ${minsToEnd !== null && minsToEnd < 0 ? 'text-red-600' : 'text-slate-700'}`}>
                                                    {minsToEnd !== null ? (minsToEnd < 0 ? `+${Math.abs(minsToEnd)}m` : `${minsToEnd}m`) : '--'}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="flex items-center gap-2 py-2 text-slate-300">
                                        <span className="material-symbols-outlined text-sm">bed_outpatient</span>
                                        <p className="text-[10px] italic font-medium">Quirófano Disponible</p>
                                    </div>
                                ) }

                                <AnimatePresence>
                                    {alertType && (
                                        <motion.div 
                                            initial={{ opacity: 0, height: 0 }}
                                            animate={{ opacity: 1, height: 'auto' }}
                                            exit={{ opacity: 0, height: 0 }}
                                            className={`mt-3 p-2.5 rounded-xl border-2 shadow-lg ${
                                                alertType === 'turnover' 
                                                ? 'bg-orange-50/80 border-orange-200 shadow-orange-500/10' 
                                                : 'bg-indigo-50/80 border-indigo-200 shadow-indigo-500/10'
                                            }`}
                                        >
                                            <div className="flex items-center gap-2 mb-1.5">
                                                <div className={`p-1 rounded-lg ${alertType === 'turnover' ? 'bg-orange-500 text-white' : 'bg-indigo-600 text-white'}`}>
                                                    <span className="material-symbols-outlined text-xs">
                                                        {alertType === 'turnover' ? 'priority_high' : 'notifications_active'}
                                                    </span>
                                                </div>
                                                <span className={`text-[10px] font-black uppercase tracking-tighter ${alertType === 'turnover' ? 'text-orange-700' : 'text-indigo-700'}`}>
                                                    {alertType === 'turnover' ? '¡PREPARAR GIRO!' : 'PREPARACIÓN PRÓXIMA'}
                                                </span>
                                            </div>
                                            <p className="text-[11px] font-black text-slate-900 leading-tight">
                                                {next?.patientName}
                                            </p>
                                            <div className="flex justify-between items-center mt-1">
                                                <p className={`text-[9px] font-bold ${alertType === 'turnover' ? 'text-orange-600' : 'text-indigo-600'}`}>
                                                    {alertType === 'turnover' ? `En ${minsToStart}m (Giro Estrecho)` : `Inicia: ${next?.startTime}`}
                                                </p>
                                                {alertType === 'turnover' && (
                                                    <span className="flex h-2 w-2">
                                                        <span className="animate-ping absolute inline-flex h-2 w-2 rounded-full bg-orange-400 opacity-75"></span>
                                                        <span className="relative inline-flex rounded-full h-2 w-2 bg-orange-500"></span>
                                                    </span>
                                                )}
                                            </div>
                                        </motion.div>
                                    )}
                                </AnimatePresence>

                                {!alertType && next && (
                                    <div className="mt-2 pt-2 border-t border-slate-100 flex justify-between items-center">
                                        <div className="flex items-center gap-1.5 opacity-60">
                                            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Prox:</span>
                                            <p className="text-[10px] font-bold text-slate-600 truncate max-w-[110px]">{next.patientName}</p>
                                        </div>
                                        <span className="text-[10px] font-black text-slate-400">{next.startTime}</span>
                                    </div>
                                )}
                            </div>
                        );
                    })
                )}
            </div>
        </div>
    );
};

export default SurgeryMiniMonitor;
