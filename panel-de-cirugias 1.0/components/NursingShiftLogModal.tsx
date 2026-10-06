import React, { useState, useEffect } from 'react';
import { supabase } from '../src/lib/supabase';
import { useAuth } from '../src/lib/AuthContext';
import { NursingShiftLog, NursingShiftType } from '../types';

interface NursingShiftLogModalProps {
    show: boolean;
    onClose: () => void;
    onSaved: () => void;
    currentOccupiedBedsCount?: number;
}

export const NursingShiftLogModal: React.FC<NursingShiftLogModalProps> = ({
    show,
    onClose,
    onSaved,
    currentOccupiedBedsCount = 0
}) => {
    const { user } = useAuth();
    const [date, setDate] = useState(() => new Date().toISOString().split('T')[0]);
    const [shift, setShift] = useState<NursingShiftType>(() => {
        const hour = new Date().getHours();
        if (hour >= 6 && hour < 14) return 'manana';
        if (hour >= 14 && hour < 22) return 'tarde';
        return 'noche';
    });
    const [nurseName, setNurseName] = useState(user?.name || '');
    const [woundCount, setWoundCount] = useState<number>(0);
    const [notes, setNotes] = useState('');
    const [avgMinutes, setAvgMinutes] = useState(20);
    const [threshold, setThreshold] = useState(20);
    const [loading, setLoading] = useState(false);
    const [dailyTotalDressings, setDailyTotalDressings] = useState(0);

    // Cargar parámetros de admin_settings
    useEffect(() => {
        const loadSettings = async () => {
            try {
                const { data } = await supabase
                    .from('admin_settings')
                    .select('key, value')
                    .in('key', ['nursing_avg_dressing_minutes', 'nursing_dressing_threshold']);

                if (data) {
                    data.forEach(item => {
                        if (item.key === 'nursing_avg_dressing_minutes' && item.value) {
                            setAvgMinutes(parseInt(item.value, 10) || 20);
                        }
                        if (item.key === 'nursing_dressing_threshold' && item.value) {
                            setThreshold(parseInt(item.value, 10) || 20);
                        }
                    });
                }
            } catch (err) {
                console.error('Error loading nursing settings:', err);
            }
        };

        if (show) {
            loadSettings();
            fetchDayDressings();
        }
    }, [show, date]);

    const fetchDayDressings = async () => {
        try {
            const { data } = await supabase
                .from('nursing_shift_logs')
                .select('wound_dressings_count')
                .eq('date', date);

            if (data) {
                const sum = data.reduce((acc, curr) => acc + (curr.wound_dressings_count || 0), 0);
                setDailyTotalDressings(sum);
            }
        } catch (e) {
            console.error('Error fetching day dressings:', e);
        }
    };

    if (!show) return null;

    const projectedDailyTotal = dailyTotalDressings + woundCount;
    const thresholdExceeded = projectedDailyTotal > threshold;
    const totalExtraMinutes = thresholdExceeded ? projectedDailyTotal * avgMinutes : 0;
    const totalHours = (totalExtraMinutes / 60).toFixed(1);

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        try {
            const { error } = await supabase
                .from('nursing_shift_logs')
                .upsert({
                    date,
                    shift,
                    nurse_id: user?.id || null,
                    nurse_name: nurseName || user?.name || 'Enfermera en Guardia',
                    wound_dressings_count: woundCount,
                    avg_minutes_per_dressing: avgMinutes,
                    notes: notes.trim() || null,
                    updated_at: new Date().toISOString()
                }, { onConflict: 'date,shift,nurse_id' });

            if (error) throw error;

            alert('Cierre de turno guardado correctamente.');
            onSaved();
            onClose();
        } catch (err: any) {
            console.error('Error guardando cierre de turno:', err);
            alert('Error al guardar: ' + (err.message || 'Error desconocido'));
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-900/60 backdrop-blur-md p-4 animate-fadeIn">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden border border-slate-200 flex flex-col">
                {/* Header */}
                <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                    <div className="flex items-center gap-3">
                        <div className="size-10 bg-primary text-white rounded-xl flex items-center justify-center shadow-lg">
                            <span className="material-symbols-outlined">assignment_turned_in</span>
                        </div>
                        <div>
                            <h3 className="text-lg font-black text-slate-900">Cierre de Turno y Curaciones</h3>
                            <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Enfermería de Piso / Internación</p>
                        </div>
                    </div>
                    <button 
                        onClick={onClose}
                        className="size-8 rounded-full hover:bg-slate-200/80 flex items-center justify-center text-slate-400 hover:text-slate-600 transition-colors"
                    >
                        <span className="material-symbols-outlined text-lg">close</span>
                    </button>
                </div>

                <form onSubmit={handleSave} className="p-6 space-y-5 overflow-y-auto max-h-[80vh]">
                    {/* Fecha y Turno */}
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-[10px] font-black uppercase tracking-wider text-slate-500 mb-1">Fecha</label>
                            <input 
                                type="date"
                                value={date}
                                onChange={e => setDate(e.target.value)}
                                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none focus:border-primary"
                                required
                            />
                        </div>
                        <div>
                            <label className="block text-[10px] font-black uppercase tracking-wider text-slate-500 mb-1">Turno</label>
                            <select
                                value={shift}
                                onChange={e => setShift(e.target.value as NursingShiftType)}
                                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none focus:border-primary"
                            >
                                <option value="manana">Mañana (06:00 - 14:00)</option>
                                <option value="tarde">Tarde (14:00 - 22:00)</option>
                                <option value="noche">Noche (22:00 - 06:00)</option>
                            </select>
                        </div>
                    </div>

                    {/* Enfermera Responsable */}
                    <div>
                        <label className="block text-[10px] font-black uppercase tracking-wider text-slate-500 mb-1">Enfermero/a en Turno</label>
                        <input 
                            type="text"
                            value={nurseName}
                            onChange={e => setNurseName(e.target.value)}
                            placeholder="Nombre del enfermero/a..."
                            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none focus:border-primary"
                            required
                        />
                    </div>

                    {/* Contador de Curaciones */}
                    <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-3">
                        <div className="flex justify-between items-center">
                            <div>
                                <label className="block text-xs font-black uppercase tracking-wider text-slate-800">
                                    Curaciones Realizadas en el Turno
                                </label>
                                <p className="text-[10px] text-slate-500 font-medium">Contabiliza el total de curaciones de este turno.</p>
                            </div>
                            <span className="text-2xl font-black text-primary font-mono">{woundCount}</span>
                        </div>

                        <div className="flex items-center gap-2">
                            <button
                                type="button"
                                onClick={() => setWoundCount(Math.max(0, woundCount - 1))}
                                className="size-10 bg-white border border-slate-200 rounded-xl text-slate-700 font-black hover:bg-slate-100 flex items-center justify-center transition-all shadow-sm active:scale-95"
                            >
                                -
                            </button>
                            <input 
                                type="number"
                                min="0"
                                value={woundCount}
                                onChange={e => setWoundCount(Math.max(0, parseInt(e.target.value, 10) || 0))}
                                className="flex-1 h-10 bg-white border border-slate-200 rounded-xl text-center text-sm font-black text-slate-900 outline-none focus:border-primary shadow-inner"
                            />
                            <button
                                type="button"
                                onClick={() => setWoundCount(woundCount + 1)}
                                className="size-10 bg-primary text-white rounded-xl font-black hover:bg-primary/90 flex items-center justify-center transition-all shadow-sm active:scale-95"
                            >
                                +
                            </button>
                        </div>
                    </div>

                    {/* Alerta de Umbral de Curaciones (> 20) */}
                    <div className={`p-4 rounded-2xl border transition-all ${
                        thresholdExceeded 
                            ? 'bg-amber-50/70 border-amber-300 text-amber-900' 
                            : 'bg-slate-50 border-slate-200 text-slate-600'
                    }`}>
                        <div className="flex items-start gap-2.5">
                            <span className={`material-symbols-outlined text-lg ${thresholdExceeded ? 'text-amber-600' : 'text-slate-400'}`}>
                                {thresholdExceeded ? 'warning' : 'info'}
                            </span>
                            <div className="text-xs space-y-1">
                                <div className="font-bold flex items-center gap-1.5">
                                    <span>Acumulado del día: <strong>{projectedDailyTotal} curaciones</strong></span>
                                    <span className="text-[10px] text-slate-400">/ Umbral: {threshold}</span>
                                </div>
                                {!thresholdExceeded ? (
                                    <p className="text-[11px] text-slate-500">
                                        El volumen está dentro de la rutina de piso (&le; {threshold}). No se computa tiempo adicional para requerimiento de dotación.
                                    </p>
                                ) : (
                                    <p className="text-[11px] text-amber-800 font-medium">
                                        <strong>¡Umbral superado (&gt; {threshold})!</strong> Impacta <strong>{totalExtraMinutes} min (~{totalHours} hs)</strong> de trabajo directo de curaciones. A contemplar para sugerir refuerzo.
                                    </p>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Observaciones del Turno */}
                    <div>
                        <label className="block text-[10px] font-black uppercase tracking-wider text-slate-500 mb-1">Novedades / Observaciones</label>
                        <textarea
                            rows={3}
                            value={notes}
                            onChange={e => setNotes(e.target.value)}
                            placeholder="Comentarios del turno, requerimientos especiales o incidencias..."
                            className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 outline-none focus:border-primary resize-none"
                        />
                    </div>

                    {/* Botones */}
                    <div className="flex gap-3 pt-2">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs uppercase transition-all"
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            disabled={loading}
                            className="flex-1 py-3 bg-primary hover:bg-primary/90 text-white font-black rounded-xl text-xs uppercase shadow-lg shadow-primary/20 transition-all disabled:opacity-50"
                        >
                            {loading ? 'Guardando...' : 'Guardar Cierre'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};
