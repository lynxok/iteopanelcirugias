import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../src/lib/supabase';
import { CalendarHoliday } from '../../types';

interface HolidaysTabProps {
    isSuperAdmin?: boolean;
}

export const HolidaysTab: React.FC<HolidaysTabProps> = ({ isSuperAdmin = false }) => {
    const [holidays, setHolidays] = useState<CalendarHoliday[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
    const [selectedType, setSelectedType] = useState<string>('all');
    const [isSaving, setIsSaving] = useState(false);
    const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

    // Modal state
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingHoliday, setEditingHoliday] = useState<Partial<CalendarHoliday> | null>(null);

    const fetchHolidays = async () => {
        try {
            setIsLoading(true);
            const { data, error } = await supabase
                .from('calendar_holidays')
                .select('*')
                .order('date', { ascending: true });

            if (error) throw error;
            setHolidays(data || []);
        } catch (err: any) {
            console.error('Error cargando feriados:', err);
            setFeedback({ type: 'error', message: 'No se pudieron cargar los feriados: ' + (err.message || '') });
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchHolidays();
    }, []);

    const showNotification = (message: string, type: 'success' | 'error' = 'success') => {
        setFeedback({ type, message });
        setTimeout(() => setFeedback(null), 4000);
    };

    const handleOpenNew = () => {
        const todayStr = new Date().toISOString().split('T')[0];
        setEditingHoliday({
            date: todayStr,
            name: '',
            holiday_type: 'nacional',
            affects_consulting: true,
            is_recurring_yearly: false,
            notes: ''
        });
        setIsModalOpen(true);
    };

    const handleOpenEdit = (h: CalendarHoliday) => {
        setEditingHoliday({ ...h });
        setIsModalOpen(true);
    };

    const handleDelete = async (id: string, name: string) => {
        if (!window.confirm(`¿Está seguro de eliminar el feriado "${name}"?`)) return;
        try {
            setIsSaving(true);
            const { error } = await supabase
                .from('calendar_holidays')
                .delete()
                .eq('id', id);

            if (error) throw error;
            showNotification(`Feriado "${name}" eliminado correctamente.`);
            await fetchHolidays();
        } catch (err: any) {
            console.error('Error eliminando feriado:', err);
            showNotification('Error al eliminar: ' + (err.message || ''), 'error');
        } finally {
            setIsSaving(false);
        }
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editingHoliday?.date || !editingHoliday?.name?.trim()) {
            showNotification('Debe ingresar la fecha y el nombre del feriado.', 'error');
            return;
        }

        try {
            setIsSaving(true);
            const payload = {
                date: editingHoliday.date,
                name: editingHoliday.name.trim(),
                holiday_type: editingHoliday.holiday_type || 'nacional',
                affects_consulting: editingHoliday.affects_consulting ?? true,
                is_recurring_yearly: editingHoliday.is_recurring_yearly ?? false,
                notes: editingHoliday.notes?.trim() || null
            };

            if (editingHoliday.id) {
                // Actualizar existente
                const { error } = await supabase
                    .from('calendar_holidays')
                    .update(payload)
                    .eq('id', editingHoliday.id);
                if (error) throw error;
                showNotification('Feriado actualizado correctamente.');
            } else {
                // Insertar nuevo
                const { error } = await supabase
                    .from('calendar_holidays')
                    .insert(payload);
                if (error) throw error;
                showNotification('Feriado registrado correctamente.');
            }

            setIsModalOpen(false);
            setEditingHoliday(null);
            await fetchHolidays();
        } catch (err: any) {
            console.error('Error guardando feriado:', err);
            showNotification('Error al guardar: ' + (err.message || ''), 'error');
        } finally {
            setIsSaving(false);
        }
    };

    // Importar feriados oficiales del año seleccionado vía ArgentinaDatos API
    const handleSyncFromArgentinaDatos = async () => {
        if (!window.confirm(`¿Desea sincronizar e importar los feriados nacionales oficiales de Argentina para el año ${selectedYear}?`)) {
            return;
        }

        try {
            setIsSaving(true);
            const response = await fetch(`https://api.argentinadatos.com/v1/feriados/${selectedYear}`);
            if (!response.ok) throw new Error(`HTTP ${response.status} al consultar api.argentinadatos.com`);
            const data = await response.json();

            if (!Array.isArray(data) || data.length === 0) {
                showNotification(`No se encontraron feriados oficiales para el año ${selectedYear}.`, 'error');
                return;
            }

            let inserted = 0;
            for (const item of data) {
                const payload = {
                    date: item.fecha,
                    name: item.nombre,
                    holiday_type: 'nacional',
                    affects_consulting: true,
                    notes: item.tipo ? `Tipo oficial: ${item.tipo}` : null
                };

                const { error } = await supabase
                    .from('calendar_holidays')
                    .upsert(payload, { onConflict: 'date,name' });

                if (!error) inserted++;
            }

            showNotification(`Sincronización completada: se sincronizaron ${inserted} feriados del año ${selectedYear}.`);
            await fetchHolidays();
        } catch (err: any) {
            console.error('Error sincronizando feriados:', err);
            showNotification('Error en la sincronización: ' + (err.message || ''), 'error');
        } finally {
            setIsSaving(false);
        }
    };

    // Años disponibles según los datos cargados + año actual + siguiente
    const availableYears = useMemo(() => {
        const yearsSet = new Set<number>([new Date().getFullYear(), new Date().getFullYear() + 1]);
        holidays.forEach(h => {
            if (h.date) {
                const y = parseInt(h.date.split('-')[0], 10);
                if (!isNaN(y)) yearsSet.add(y);
            }
        });
        return Array.from(yearsSet).sort((a, b) => b - a);
    }, [holidays]);

    // Filtrado
    const filteredHolidays = useMemo(() => {
        return holidays.filter(h => {
            const hYear = parseInt(h.date.split('-')[0], 10);
            if (selectedYear !== 0 && hYear !== selectedYear) return false;
            if (selectedType !== 'all' && h.holiday_type !== selectedType) return false;
            if (searchTerm.trim()) {
                const query = searchTerm.toLowerCase();
                const matchName = h.name.toLowerCase().includes(query);
                const matchNotes = (h.notes || '').toLowerCase().includes(query);
                const matchDate = h.date.includes(query);
                if (!matchName && !matchNotes && !matchDate) return false;
            }
            return true;
        });
    }, [holidays, selectedYear, selectedType, searchTerm]);

    const getTypeBadge = (type: string) => {
        switch (type) {
            case 'sanidad':
                return {
                    label: 'Sanidad (ATSA)',
                    bg: 'bg-purple-100 text-purple-800 border-purple-200',
                    icon: 'medical_services'
                };
            case 'institucional':
                return {
                    label: 'Institucional',
                    bg: 'bg-amber-100 text-amber-800 border-amber-200',
                    icon: 'apartment'
                };
            case 'provincial':
                return {
                    label: 'Provincial',
                    bg: 'bg-emerald-100 text-emerald-800 border-emerald-200',
                    icon: 'location_on'
                };
            case 'otro':
                return {
                    label: 'Otro',
                    bg: 'bg-slate-100 text-slate-700 border-slate-200',
                    icon: 'bookmark'
                };
            case 'nacional':
            default:
                return {
                    label: 'Nacional',
                    bg: 'bg-rose-100 text-rose-800 border-rose-200',
                    icon: 'flag'
                };
        }
    };

    return (
        <div className="max-w-6xl mx-auto flex flex-col gap-6 animate-fadeIn pb-12">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                <div>
                    <div className="flex items-center gap-2">
                        <span className="material-symbols-outlined text-rose-600 text-2xl">event_busy</span>
                        <h2 className="text-xl font-bold text-slate-900">Feriados y Asuetos</h2>
                    </div>
                    <p className="text-sm text-slate-500 mt-1">
                        Gestione los feriados nacionales, asuetos de sanidad (ATSA) y fechas no laborales que impactan en los calendarios de Quirófano y Consultorios.
                    </p>
                </div>
                <div className="flex items-center gap-2.5">
                    <button
                        type="button"
                        onClick={handleSyncFromArgentinaDatos}
                        disabled={isSaving || isLoading}
                        title={`Sincronizar feriados oficiales del año ${selectedYear} desde ArgentinaDatos`}
                        className="bg-white hover:bg-slate-50 active:scale-95 text-slate-700 border border-slate-200 px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-xs transition-all disabled:opacity-50"
                    >
                        <span className="material-symbols-outlined text-base text-blue-600">sync</span>
                        Sincronizar Oficiales ({selectedYear})
                    </button>
                    <button
                        type="button"
                        onClick={handleOpenNew}
                        className="bg-slate-900 hover:bg-slate-800 active:scale-95 text-white px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all"
                    >
                        <span className="material-symbols-outlined text-base">add</span>
                        Nuevo Feriado / Asueto
                    </button>
                </div>
            </div>

            {/* Feedback alert */}
            {feedback && (
                <div className={`p-4 rounded-xl border flex items-center justify-between text-xs font-semibold ${
                    feedback.type === 'success' 
                        ? 'bg-emerald-50 text-emerald-800 border-emerald-200' 
                        : 'bg-rose-50 text-rose-800 border-rose-200'
                }`}>
                    <div className="flex items-center gap-2">
                        <span className="material-symbols-outlined text-base">
                            {feedback.type === 'success' ? 'check_circle' : 'error'}
                        </span>
                        <span>{feedback.message}</span>
                    </div>
                    <button onClick={() => setFeedback(null)} className="text-slate-400 hover:text-slate-600">
                        <span className="material-symbols-outlined text-sm">close</span>
                    </button>
                </div>
            )}

            {/* Filtros y Controles */}
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col md:flex-row items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
                    {/* Búsqueda */}
                    <div className="relative flex-1 md:w-64">
                        <span className="material-symbols-outlined absolute left-3 top-2.5 text-slate-400 text-sm">search</span>
                        <input
                            type="text"
                            placeholder="Buscar por nombre, nota o fecha..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-blue-500 focus:outline-none transition-all"
                        />
                    </div>

                    {/* Selector de Año */}
                    <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200">
                        <span className="text-[10px] font-bold text-slate-500 uppercase px-2">Año:</span>
                        {availableYears.map(yr => (
                            <button
                                key={yr}
                                onClick={() => setSelectedYear(yr)}
                                className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-all ${
                                    selectedYear === yr
                                        ? 'bg-white text-slate-900 shadow-xs'
                                        : 'text-slate-600 hover:text-slate-900'
                                }`}
                            >
                                {yr}
                            </button>
                        ))}
                    </div>

                    {/* Filtro por Tipo */}
                    <select
                        value={selectedType}
                        onChange={(e) => setSelectedType(e.target.value)}
                        className="py-2 px-3 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-blue-500 focus:outline-none transition-all font-medium text-slate-700"
                    >
                        <option value="all">Todos los tipos</option>
                        <option value="nacional">Nacional</option>
                        <option value="sanidad">Sanidad (ATSA)</option>
                        <option value="institucional">Institucional</option>
                        <option value="provincial">Provincial</option>
                        <option value="otro">Otro</option>
                    </select>
                </div>

                <div className="text-xs text-slate-500 font-medium self-end md:self-center">
                    Total: <strong className="text-slate-800">{filteredHolidays.length}</strong> {filteredHolidays.length === 1 ? 'feriado' : 'feriados'}
                </div>
            </div>

            {/* Tabla / Tarjetas de Feriados */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
                {isLoading ? (
                    <div className="p-12 text-center text-slate-400 flex flex-col items-center justify-center gap-2">
                        <span className="material-symbols-outlined text-3xl animate-spin text-blue-500">progress_activity</span>
                        <p className="text-xs font-medium">Cargando feriados y asuetos...</p>
                    </div>
                ) : filteredHolidays.length === 0 ? (
                    <div className="p-12 text-center text-slate-400 flex flex-col items-center justify-center gap-2">
                        <span className="material-symbols-outlined text-4xl text-slate-300">event_available</span>
                        <p className="text-xs font-semibold text-slate-600">No se encontraron feriados con los filtros seleccionados.</p>
                        <p className="text-[11px] text-slate-400">Puede agregar uno manualmente o sincronizar los oficiales del año desde el botón superior.</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                                    <th className="py-3 px-4">Fecha</th>
                                    <th className="py-3 px-4">Nombre / Conmemoración</th>
                                    <th className="py-3 px-4">Tipo</th>
                                    <th className="py-3 px-4">Impacto</th>
                                    <th className="py-3 px-4">Notas</th>
                                    <th className="py-3 px-4 text-right">Acciones</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 text-xs">
                                {filteredHolidays.map((h) => {
                                    const badge = getTypeBadge(h.holiday_type);
                                    // Parse fecha para mostrar día de la semana
                                    const parts = h.date.split('-');
                                    const dateObj = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
                                    const dayName = dateObj.toLocaleDateString('es-AR', { weekday: 'long' });
                                    const formattedDate = dateObj.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });

                                    return (
                                        <tr key={h.id} className="hover:bg-slate-50/70 transition-colors">
                                            <td className="py-3 px-4 whitespace-nowrap">
                                                <div className="flex flex-col">
                                                    <span className="font-bold text-slate-900">{formattedDate}</span>
                                                    <span className="text-[10px] text-slate-500 capitalize">{dayName}</span>
                                                </div>
                                            </td>
                                            <td className="py-3 px-4">
                                                <div className="font-semibold text-slate-900">{h.name}</div>
                                            </td>
                                            <td className="py-3 px-4 whitespace-nowrap">
                                                <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold border ${badge.bg}`}>
                                                    <span className="material-symbols-outlined text-xs">{badge.icon}</span>
                                                    {badge.label}
                                                </span>
                                            </td>
                                            <td className="py-3 px-4 whitespace-nowrap">
                                                {h.affects_consulting ? (
                                                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-700 bg-rose-50 px-2 py-0.5 rounded-md border border-rose-100">
                                                        <span className="material-symbols-outlined text-xs">block</span>
                                                        Cierra Consultorios
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-md">
                                                        <span className="material-symbols-outlined text-xs">check</span>
                                                        Operativo
                                                    </span>
                                                )}
                                            </td>
                                            <td className="py-3 px-4 text-slate-500 max-w-xs truncate" title={h.notes || ''}>
                                                {h.notes || '-'}
                                            </td>
                                            <td className="py-3 px-4 text-right whitespace-nowrap">
                                                <div className="flex items-center justify-end gap-1.5">
                                                    <button
                                                        onClick={() => handleOpenEdit(h)}
                                                        className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                                                        title="Editar feriado"
                                                    >
                                                        <span className="material-symbols-outlined text-base">edit</span>
                                                    </button>
                                                    <button
                                                        onClick={() => handleDelete(h.id, h.name)}
                                                        className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all"
                                                        title="Eliminar feriado"
                                                    >
                                                        <span className="material-symbols-outlined text-base">delete</span>
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Modal de Creación / Edición */}
            {isModalOpen && editingHoliday && (
                <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-lg overflow-hidden animate-scaleIn">
                        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <span className="material-symbols-outlined text-rose-600">event_busy</span>
                                <h3 className="font-bold text-slate-900 text-sm">
                                    {editingHoliday.id ? 'Editar Feriado / Asueto' : 'Nuevo Feriado o Fecha Especial'}
                                </h3>
                            </div>
                            <button
                                type="button"
                                onClick={() => setIsModalOpen(false)}
                                className="text-slate-400 hover:text-slate-600"
                            >
                                <span className="material-symbols-outlined text-lg">close</span>
                            </button>
                        </div>

                        <form onSubmit={handleSave} className="p-6 space-y-4">
                            {/* Fecha */}
                            <div>
                                <label className="block text-xs font-bold text-slate-700 mb-1">
                                    Fecha *
                                </label>
                                <input
                                    type="date"
                                    required
                                    value={editingHoliday.date || ''}
                                    onChange={(e) => setEditingHoliday({ ...editingHoliday, date: e.target.value })}
                                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-blue-500 focus:outline-none font-semibold text-slate-900"
                                />
                            </div>

                            {/* Nombre */}
                            <div>
                                <label className="block text-xs font-bold text-slate-700 mb-1">
                                    Nombre o Motivo de Conmemoración *
                                </label>
                                <input
                                    type="text"
                                    required
                                    placeholder="Ej: Día de la Sanidad (ATSA), Feriado Puente, etc."
                                    value={editingHoliday.name || ''}
                                    onChange={(e) => setEditingHoliday({ ...editingHoliday, name: e.target.value })}
                                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-blue-500 focus:outline-none text-slate-900"
                                />
                            </div>

                            {/* Tipo de Feriado */}
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs font-bold text-slate-700 mb-1">
                                        Tipo
                                    </label>
                                    <select
                                        value={editingHoliday.holiday_type || 'nacional'}
                                        onChange={(e) => setEditingHoliday({ ...editingHoliday, holiday_type: e.target.value as any })}
                                        className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-blue-500 focus:outline-none font-medium text-slate-900"
                                    >
                                        <option value="nacional">Nacional</option>
                                        <option value="sanidad">Sanidad (ATSA)</option>
                                        <option value="institucional">Institucional</option>
                                        <option value="provincial">Provincial</option>
                                        <option value="otro">Otro</option>
                                    </select>
                                </div>

                                <div className="flex flex-col justify-end">
                                    <label className="flex items-center gap-2 p-2 bg-slate-50 border border-slate-200 rounded-xl cursor-pointer hover:bg-slate-100 transition-colors">
                                        <input
                                            type="checkbox"
                                            checked={editingHoliday.affects_consulting ?? true}
                                            onChange={(e) => setEditingHoliday({ ...editingHoliday, affects_consulting: e.target.checked })}
                                            className="rounded text-rose-600 focus:ring-rose-500"
                                        />
                                        <div className="text-[11px] leading-tight font-medium text-slate-700">
                                            <strong>Cierra Consultorios</strong>
                                            <span className="block text-[10px] text-slate-400">Sin atención externa</span>
                                        </div>
                                    </label>
                                </div>
                            </div>

                            {/* Notas / Observaciones */}
                            <div>
                                <label className="block text-xs font-bold text-slate-700 mb-1">
                                    Notas u Observaciones (Opcional)
                                </label>
                                <textarea
                                    rows={2}
                                    placeholder="Detalles sobre guardias mínimas, turnos o resoluciones..."
                                    value={editingHoliday.notes || ''}
                                    onChange={(e) => setEditingHoliday({ ...editingHoliday, notes: e.target.value })}
                                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-blue-500 focus:outline-none text-slate-900 resize-none"
                                />
                            </div>

                            {/* Acciones */}
                            <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100">
                                <button
                                    type="button"
                                    onClick={() => setIsModalOpen(false)}
                                    className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="submit"
                                    disabled={isSaving}
                                    className="px-5 py-2 text-xs font-bold bg-slate-900 hover:bg-slate-800 active:scale-95 text-white rounded-xl shadow-sm transition-all disabled:opacity-50"
                                >
                                    {isSaving ? 'Guardando...' : (editingHoliday.id ? 'Guardar Cambios' : 'Registrar Feriado')}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default HolidaysTab;
