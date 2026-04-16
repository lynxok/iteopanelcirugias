import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../src/lib/supabase';
import { motion, AnimatePresence } from 'framer-motion';

interface SurgeryAlert {
    id: string;
    patientName: string;
    orName: string;
    minsToStart: number;
    type: 'turnover' | 'preparation';
}

const SurgicalCoordinationAlerts: React.FC = () => {
    const [alerts, setAlerts] = useState<SurgeryAlert[]>([]);
    const [currentTime, setCurrentTime] = useState(new Date());

    const fetchData = useCallback(async () => {
        try {
            const today = new Date().toISOString().split('T')[0];
            const { data: sxData } = await supabase
                .from('surgeries')
                .select(`
                    id,
                    status,
                    start_time,
                    estimated_duration,
                    patients (full_name),
                    operating_room:operating_room_id (name)
                `)
                .eq('surgery_date', today)
                .neq('status', 'cancelled')
                .neq('status', 'suspended')
                .order('start_time', { ascending: true });

            if (sxData) {
                const now = new Date();
                const newAlerts: SurgeryAlert[] = [];

                // Group by OR to check gaps
                const orGroups: Record<string, any[]> = {};
                sxData.forEach((s: any) => {
                    const orId = s.operating_room_id || s.operating_room?.id;
                    if (!orId) return;
                    if (!orGroups[orId]) orGroups[orId] = [];
                    orGroups[orId].push(s);
                });

                Object.values(orGroups).forEach(group => {
                    for (let i = 0; i < group.length; i++) {
                        const current = group[i];
                        const next = group[i+1];
                        
                        // Scenario 1: Tight turnover (current in progress, next starts in < 30 min of expected end)
                        if (next && ['in_progress', 'in_or', 'delayed'].includes(current.status)) {
                            const [curH, curM] = current.start_time.split(':').map(Number);
                            const curEnd = new Date(); curEnd.setHours(curH, curM + (current.estimated_duration || 60), 0, 0);
                            const minsToEnd = Math.floor((curEnd.getTime() - now.getTime()) / (1000 * 60));

                            if (minsToEnd <= 45) {
                                const [nextH, nextM] = next.start_time.split(':').map(Number);
                                const nextStart = new Date(); nextStart.setHours(nextH, nextM, 0, 0);
                                const gap = (nextStart.getTime() - curEnd.getTime()) / (1000 * 60);
                                const minsToStart = Math.floor((nextStart.getTime() - now.getTime()) / (1000 * 60));

                                if (gap <= 30 && minsToStart > 0) {
                                    newAlerts.push({
                                        id: next.id,
                                        patientName: next.patients?.full_name || 'N/A',
                                        orName: next.operating_room?.name || 'QO',
                                        minsToStart,
                                        type: 'turnover'
                                    });
                                }
                            }
                        }

                        // Scenario 2: Standard preparation (next starts in <= 45 min, no tight turnover active)
                        const surgery = current;
                        if (['scheduled', 'pending_validation', 'waiting_date'].includes(surgery.status)) {
                            const [sH, sM] = surgery.start_time.split(':').map(Number);
                            const sxStart = new Date(); sxStart.setHours(sH, sM, 0, 0);
                            const minsToStart = Math.floor((sxStart.getTime() - now.getTime()) / (1000 * 60));

                            // Only show if it's not already covered by a turnover alert for this OR
                            if (minsToStart <= 45 && minsToStart > 0 && !newAlerts.find(a => a.id === surgery.id)) {
                                newAlerts.push({
                                    id: surgery.id,
                                    patientName: surgery.patients?.full_name || 'N/A',
                                    orName: surgery.operating_room?.name || 'QO',
                                    minsToStart,
                                    type: 'preparation'
                                });
                            }
                        }
                    }
                });

                setAlerts(newAlerts);
            }
        } catch (err) {
            console.error('Error fetching surgical alerts:', err);
        }
    }, []);

    useEffect(() => {
        fetchData();
        const timer = setInterval(() => {
            setCurrentTime(new Date());
            fetchData();
        }, 30000);

        const channel = supabase
            .channel('global-surgery-alerts')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'surgeries' }, () => fetchData())
            .subscribe();

        return () => {
            clearInterval(timer);
            supabase.removeChannel(channel);
        };
    }, [fetchData]);

    if (alerts.length === 0) return null;

    return (
        <div className="fixed bottom-24 md:bottom-28 left-4 md:left-1/2 md:-translate-x-1/2 z-[60] w-[calc(100%-32px)] md:w-fit max-w-[90vw]">
            <AnimatePresence>
                <div className="flex flex-col gap-2 scale-[0.85] md:scale-100 items-center">
                    {alerts.map(alert => (
                        <motion.div 
                            key={alert.id}
                            initial={{ y: 20, opacity: 0, scale: 0.95 }}
                            animate={{ y: 0, opacity: 1, scale: 1 }}
                            exit={{ y: 20, opacity: 0, scale: 0.95 }}
                            className={`backdrop-blur-xl rounded-2xl md:rounded-3xl border shadow-2xl p-3 md:p-4 flex items-center gap-4 transition-all ${
                                alert.type === 'turnover' 
                                ? 'bg-orange-600/90 border-orange-400/50 shadow-orange-500/30' 
                                : 'bg-indigo-600/90 border-indigo-400/50 shadow-indigo-500/30'
                            }`}
                        >
                            <div className="flex items-center gap-3 px-1 md:px-2">
                                <div className="relative flex h-3 w-3">
                                    <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${alert.type === 'turnover' ? 'bg-orange-300' : 'bg-indigo-300'}`}></span>
                                    <span className="relative inline-flex rounded-full h-3 w-3 bg-white"></span>
                                </div>
                                <div className="flex flex-col">
                                    <span className={`text-[9px] font-black uppercase tracking-widest leading-none ${alert.type === 'turnover' ? 'text-orange-100' : 'text-indigo-100'}`}>
                                        {alert.type === 'turnover' ? 'Giro Crítico' : 'Preparar Paciente'}
                                    </span>
                                    <span className="text-xs md:text-sm font-black text-white uppercase tracking-tighter">
                                        {alert.type === 'turnover' ? 'Preparar Inmediatamente' : 'Traslado Próximo'}
                                    </span>
                                </div>
                            </div>

                            <div className="h-8 w-px bg-white/20"></div>

                            <div className="flex items-center gap-4 py-1">
                                <div className="flex flex-col">
                                    <div className="flex items-center gap-2">
                                        <span className={`text-[10px] font-black uppercase ${alert.type === 'turnover' ? 'text-orange-200' : 'text-indigo-200'}`}>
                                            {alert.orName}
                                        </span>
                                        <div className="h-1.5 w-1.5 rounded-full bg-white animate-pulse"></div>
                                        <span className="text-xs md:text-sm font-bold text-white max-w-[150px] truncate">{alert.patientName}</span>
                                    </div>
                                    <p className={`text-[10px] font-black uppercase ${alert.type === 'turnover' ? 'text-orange-100' : 'text-indigo-100'}`}>
                                        {alert.type === 'turnover' ? 'Entra en' : 'Inicio en'} {alert.minsToStart} min
                                    </p>
                                </div>
                            </div>
                        </motion.div>
                    ))}
                </div>
            </AnimatePresence>
        </div>
    );
};

export default SurgicalCoordinationAlerts;
