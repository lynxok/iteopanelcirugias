
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useOserSync } from '../../../src/lib/OserSyncContext';
import { getStatusLabel, checkMatch } from '../../../src/lib/oserUtils';

const OserSyncModal: React.FC = () => {
    const { 
        isModalOpen, results, processedHistory, closeModal, isMinimized, setMinimized, 
        applyBatchUpdates, syncLogs 
    } = useOserSync();

    const [selectedSurgeries, setSelectedSurgeries] = useState<Set<string>>(new Set());
    const [selectedPractices, setSelectedPractices] = useState<Record<string, string[]>>({});
    const [isApplying, setIsApplying] = useState(false);
    const [showLogs, setShowLogs] = useState(false);
    const [activeTab, setActiveTab] = useState<'discrepancies' | 'history'>('discrepancies');
    const [searchQuery, setSearchQuery] = useState('');
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc' | 'none'>('none');

    const filteredResults = results.filter(r => {
        const query = searchQuery.toLowerCase();
        const patientName = String(r.surgery?.patients?.full_name || '').toLowerCase();
        const nuc = String(r.surgery?.patients?.nuc || '').toLowerCase();
        const procedure = String(r.surgery?.procedure_name || '').toLowerCase();
        return patientName.includes(query) || nuc.includes(query) || procedure.includes(query);
    });

    const sortedResults = [...filteredResults].sort((a, b) => {
        if (sortOrder === 'asc') {
            return String(a.surgery?.patients?.full_name || '').localeCompare(String(b.surgery?.patients?.full_name || ''));
        }
        if (sortOrder === 'desc') {
            return String(b.surgery?.patients?.full_name || '').localeCompare(String(a.surgery?.patients?.full_name || ''));
        }
        return 0;
    });

    const filteredHistory = processedHistory.filter(item => {
        const query = searchQuery.toLowerCase();
        const patientName = String(item.patient || '').toLowerCase();
        const nuc = String(item.nuc || '').toLowerCase();
        return patientName.includes(query) || nuc.includes(query);
    });

    const sortedHistory = [...filteredHistory].sort((a, b) => {
        if (sortOrder === 'asc') {
            return (a.patient || '').localeCompare(b.patient || '');
        }
        if (sortOrder === 'desc') {
            return (b.patient || '').localeCompare(a.patient || '');
        }
        return 0;
    });

    // Seleccionar todo por defecto cuando hay nuevos resultados
    useEffect(() => {
        if (results.length > 0) {
            setSelectedSurgeries(new Set(results.map(r => r.surgery.id)));
            // Pre-seleccionar prácticas que NO coinciden y son seleccionables
            const initialPractices: Record<string, string[]> = {};
            results.forEach(r => {
                const missing = r.oserData.Practicas
                    ?.filter((p: any) => {
                        const isMatch = checkMatch(r.surgery.procedure_name, p[1], p[0]);
                        const statusLower = String(p[4] || "").toLowerCase();
                        const isSelectable = !statusLower.includes('rechazo') && 
                                             !statusLower.includes('rechazada') && 
                                             !statusLower.includes('no autorizada') && 
                                             !statusLower.includes('anulado') && 
                                             !statusLower.includes('anulada') && 
                                             !statusLower.includes('cambio de codigo') && 
                                             !statusLower.includes('cambio de código');
                        return !isMatch && isSelectable;
                    })
                    .map((p: any) => p[0]) || [];
                initialPractices[r.surgery.id] = missing;
            });
            setSelectedPractices(initialPractices);
        }
    }, [results]);

    const toggleSurgery = (id: string) => {
        setSelectedSurgeries(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const togglePractice = (surgeryId: string, practiceCode: string) => {
        setSelectedPractices(prev => {
            const current = prev[surgeryId] || [];
            if (current.includes(practiceCode)) {
                return { ...prev, [surgeryId]: current.filter(p => p !== practiceCode) };
            } else {
                return { ...prev, [surgeryId]: [...current, practiceCode] };
            }
        });
    };

    const getStatusInfo = (status: string) => {
        const s = (status || "").toLowerCase();
        if (s.includes('anulado')) return { color: 'text-red-600', bg: 'bg-red-50', border: 'border-red-100', icon: 'cancel', label: 'ANULADA' };
        if (s.includes('no autorizada') || s.includes('rechazo') || s.includes('rechazada')) return { color: 'text-orange-600', bg: 'bg-orange-50', border: 'border-orange-100', icon: 'block', label: 'NO AUTORIZADA' };
        if (s.includes('cambio de codigo') || s.includes('cambio de código')) return { color: 'text-purple-600', bg: 'bg-purple-50', border: 'border-purple-100', icon: 'swap_horiz', label: 'CAMBIO DE CÓDIGO' };
        if (s.includes('iniciada') || s.includes('pendiente')) return { color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-100', icon: 'pending', label: 'INICIADA' };
        if (s.includes('autorizada') || s.includes('aprobada')) return { color: 'text-green-600', bg: 'bg-green-50', border: 'border-green-100', icon: 'check_circle', label: 'AUTORIZADA' };
        return { color: 'text-slate-600', bg: 'bg-slate-50', border: 'border-slate-100', icon: 'info', label: status || 'S/D' };
    };

    const handleBatchSync = async () => {
        if (selectedSurgeries.size === 0) return;
        setIsApplying(true);
        
        const toSync = results
            .filter(r => selectedSurgeries.has(r.surgery.id))
            .map(r => {
                const selections = selectedPractices[r.surgery.id] || [];
                const finalPractices = r.oserData.Practicas
                    ?.filter((p: any) => selections.includes(p[0]))
                    .map((p: any) => `${p[0]}: ${p[1]}`) || [];
                
                return {
                    ...r,
                    customProcedures: finalPractices.length > 0 ? finalPractices.join(' + ') : null
                };
            });

        await applyBatchUpdates(toSync);
        setIsApplying(false);
    };

    if (!isModalOpen || isMinimized) return null;

    return (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <motion.div 
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-6xl max-h-[90vh] flex flex-col overflow-hidden border border-slate-200"
            >
                {/* Header */}
                <div className="p-8 border-b border-slate-100 flex items-center justify-between bg-white">
                    <div className="flex items-center gap-5">
                        <div className="size-14 bg-gradient-to-br from-blue-600 to-indigo-700 rounded-2xl flex items-center justify-center text-white shadow-xl shadow-blue-100">
                             <span className="material-symbols-outlined text-3xl">sync_saved_locally</span>
                        </div>
                        <div>
                            <h2 className="text-3xl font-black text-slate-800 tracking-tight flex items-center gap-3">
                                Resultados de Auditoría OSER
                                <span className="text-[10px] bg-blue-100 text-blue-700 px-3 py-1 rounded-full font-black uppercase tracking-widest">v3.5.0</span>
                            </h2>
                            <p className="text-sm font-bold text-slate-400 uppercase tracking-widest mt-1">
                                {results.length} discrepancias detectadas • {selectedSurgeries.size} seleccionadas
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        <button 
                            onClick={() => setMinimized(true)}
                            className="size-12 flex items-center justify-center text-slate-400 hover:bg-slate-50 hover:text-slate-600 rounded-2xl transition-all"
                            title="Minimizar"
                        >
                            <span className="material-symbols-outlined text-2xl">stat_minus_1</span>
                        </button>
                        <button 
                            onClick={closeModal}
                            className="size-12 flex items-center justify-center text-slate-400 hover:bg-red-50 hover:text-red-500 rounded-2xl transition-all"
                            title="Cerrar"
                        >
                            <span className="material-symbols-outlined text-2xl">close</span>
                        </button>
                    </div>
                </div>

                {/* Toolbar */}
                <div className="px-8 py-4 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <div className="flex bg-slate-200/50 p-1 rounded-xl mr-4 shadow-inner">
                            <button 
                                onClick={() => setActiveTab('discrepancies')}
                                className={`px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'discrepancies' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                            >
                                Discrepancias ({results.length})
                            </button>
                            <button 
                                onClick={() => setActiveTab('history')}
                                className={`px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'history' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                            >
                                Historial Completo ({processedHistory.length})
                            </button>
                        </div>

                        {activeTab === 'discrepancies' && (
                            <>
                                <label className="flex items-center gap-3 cursor-pointer group bg-white border border-slate-200 px-4 py-2 rounded-xl hover:border-blue-400 transition-all shadow-sm">
                                    <input 
                                        type="checkbox" 
                                        checked={selectedSurgeries.size === results.length}
                                        onChange={(e) => {
                                            if (e.target.checked) {
                                                setSelectedSurgeries(new Set(results.map(r => r.surgery.id)));
                                            } else {
                                                setSelectedSurgeries(new Set());
                                                setSelectedPractices({});
                                            }
                                        }}
                                        className="size-5 rounded-md border-slate-300 text-blue-600 focus:ring-blue-500"
                                    />
                                    <span className="text-[11px] font-black text-slate-600 uppercase tracking-widest">Seleccionar Todo</span>
                                </label>

                                <button 
                                    disabled={selectedSurgeries.size === 0 || isApplying}
                                    onClick={async () => {
                                        if (selectedSurgeries.size === 0) return;
                                        setIsApplying(true);
                                        const toSync = results
                                            .filter(r => selectedSurgeries.has(r.surgery.id))
                                            .map(r => ({ ...r, customProcedures: 'FORCE_NULL' }));
                                        
                                        await applyBatchUpdates(toSync);
                                        setIsApplying(false);
                                    }}
                                    className="px-4 py-2 rounded-xl text-[11px] font-black uppercase tracking-widest bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-600 hover:text-white transition-all flex items-center gap-2 shadow-sm"
                                >
                                    <span className="material-symbols-outlined text-sm">calendar_today</span>
                                    Solo Fechas ({selectedSurgeries.size})
                                </button>
                            </>
                        )}

                        <button 
                            onClick={() => setShowLogs(!showLogs)}
                            className={`px-4 py-2 rounded-xl text-[11px] font-black uppercase tracking-widest flex items-center gap-2 transition-all ${showLogs ? 'bg-slate-800 text-white' : 'bg-white text-slate-600 border border-slate-200 hover:border-slate-300'}`}
                        >
                            <span className="material-symbols-outlined text-sm">terminal</span>
                            {showLogs ? 'Ocultar Logs' : 'Ver Logs'}
                        </button>

                        <div className="relative flex items-center">
                            <span className="material-symbols-outlined absolute left-3 text-slate-400 text-sm">search</span>
                            <input 
                                type="text" 
                                placeholder="Buscar por paciente, NUC..." 
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="pl-9 pr-8 py-2 rounded-xl text-[11px] font-bold bg-white border border-slate-200 hover:border-slate-300 focus:border-blue-500 focus:outline-none transition-all shadow-sm w-48 text-slate-700 placeholder-slate-400"
                            />
                            {searchQuery && (
                                <button 
                                    onClick={() => setSearchQuery('')}
                                    className="absolute right-2 text-slate-400 hover:text-slate-600 flex items-center"
                                >
                                    <span className="material-symbols-outlined text-sm">close</span>
                                </button>
                            )}
                        </div>

                        <button 
                            onClick={() => {
                                setSortOrder(prev => {
                                    if (prev === 'none') return 'asc';
                                    if (prev === 'asc') return 'desc';
                                    return 'none';
                                });
                            }}
                            className={`px-4 py-2 rounded-xl text-[11px] font-black uppercase tracking-widest flex items-center gap-2 border transition-all ${sortOrder !== 'none' ? 'bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100' : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'}`}
                            title="Ordenar por nombre alfabéticamente"
                        >
                            <span className="material-symbols-outlined text-sm">
                                {sortOrder === 'asc' ? 'arrow_upward' : sortOrder === 'desc' ? 'arrow_downward' : 'sort_by_alpha'}
                            </span>
                            {sortOrder === 'asc' ? 'A-Z' : sortOrder === 'desc' ? 'Z-A' : 'Ordenar'}
                        </button>
                    </div>

                    {activeTab === 'discrepancies' && (
                        <button 
                            disabled={selectedSurgeries.size === 0 || isApplying}
                            onClick={handleBatchSync}
                            className="bg-emerald-600 text-white px-8 py-3 rounded-2xl text-sm font-black shadow-lg shadow-emerald-100 hover:bg-emerald-700 disabled:opacity-50 flex items-center gap-3 transition-all transform active:scale-95"
                        >
                            {isApplying ? (
                                <div className="size-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                            ) : (
                                <span className="material-symbols-outlined">auto_fix_high</span>
                            )}
                            SINCRONIZAR SELECCIONADOS ({selectedSurgeries.size})
                        </button>
                    )}
                </div>

                {/* Content Area */}
                <div className="flex-1 overflow-hidden flex">
                    <div className={`flex-1 overflow-y-auto p-8 custom-scrollbar transition-all ${showLogs ? 'w-2/3' : 'w-full'}`}>
                        {activeTab === 'discrepancies' ? (
                            <div className="space-y-6">
                                {results.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center py-20 text-slate-400">
                                        <span className="material-symbols-outlined text-6xl mb-4">check_circle</span>
                                        <p className="text-lg font-black uppercase tracking-widest">No hay discrepancias pendientes</p>
                                        <p className="text-sm font-medium">Todos los pacientes coinciden con el portal OSER.</p>
                                    </div>
                                ) : sortedResults.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center py-20 text-slate-400">
                                        <span className="material-symbols-outlined text-6xl mb-4">search_off</span>
                                        <p className="text-lg font-black uppercase tracking-widest">Sin resultados</p>
                                        <p className="text-sm font-medium">No se encontraron discrepancias que coincidan con la búsqueda.</p>
                                    </div>
                                ) : (
                                    sortedResults.map((result, idx) => {
                                        const isSelected = selectedSurgeries.has(result.surgery.id);
                                        return (
                                            <div 
                                                key={result.surgery.id} 
                                                className={`relative group bg-white border-2 rounded-3xl overflow-hidden transition-all ${isSelected ? 'border-blue-500 shadow-xl shadow-blue-50' : 'border-slate-100 hover:border-slate-200'}`}
                                            >
                                                <div className={`p-5 flex items-center justify-between ${isSelected ? 'bg-blue-50/30' : 'bg-slate-50/50'}`}>
                                                    <div className="flex items-center gap-4">
                                                        <input 
                                                            type="checkbox" 
                                                            checked={isSelected}
                                                            onChange={() => toggleSurgery(result.surgery.id)}
                                                            className="size-6 rounded-lg border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                                                        />
                                                        <div>
                                                            <h4 className="text-lg font-black text-slate-800 leading-none mb-1">{result.surgery.patients.full_name}</h4>
                                                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">NUC: {result.surgery.patients.nuc}</p>
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        {result.isStale && (
                                                            <span className="bg-red-100 text-red-700 text-[10px] font-black px-3 py-1 rounded-full flex items-center gap-1.5 border border-red-200">
                                                                <span className="material-symbols-outlined text-xs">history</span> SIN AVANCES
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>

                                                <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-8">
                                                    {/* Columna Fecha */}
                                                    <div className="space-y-4">
                                                        <h5 className="text-[11px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                                                            <span className="material-symbols-outlined text-sm">event_note</span> Cambio de Fecha
                                                        </h5>
                                                        {result.diffs.date ? (
                                                            <div className="flex items-center gap-4 bg-white p-4 rounded-2xl border border-blue-100 shadow-sm relative overflow-hidden">
                                                                <div className="absolute top-0 left-0 w-1 h-full bg-blue-500"></div>
                                                                <div className="flex-1">
                                                                    <p className="text-[9px] text-slate-400 font-black uppercase mb-1">Actual</p>
                                                                    <p className="text-sm font-black text-slate-400 line-through tracking-tight">{result.diffs.date.old || 'Sin fecha'}</p>
                                                                </div>
                                                                <div className="size-8 rounded-full bg-blue-50 flex items-center justify-center">
                                                                    <span className="material-symbols-outlined text-blue-600 text-sm">arrow_forward</span>
                                                                </div>
                                                                <div className="flex-1">
                                                                    <p className="text-[9px] text-blue-600 font-black uppercase mb-1">Nueva (OSER)</p>
                                                                    <p className="text-sm font-black text-blue-700 tracking-tight">{result.diffs.date.new}</p>
                                                                </div>
                                                            </div>
                                                        ) : (
                                                            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 flex items-center gap-3 text-slate-400">
                                                                <span className="material-symbols-outlined text-green-500">check_circle</span>
                                                                <p className="text-xs font-bold uppercase tracking-wide">Fecha Correcta</p>
                                                            </div>
                                                        )}
                                                    </div>

                                                    {/* Columna Prácticas */}
                                                    <div className="space-y-4">
                                                        <h5 className="text-[11px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                                                            <span className="material-symbols-outlined text-sm">clinical_notes</span> Prácticas en OSER
                                                        </h5>
                                                        <div className="bg-slate-100/50 p-4 rounded-2xl border border-slate-200 mb-2">
                                                            <p className="text-[9px] text-slate-500 font-black uppercase mb-1">En App</p>
                                                            <p className="text-xs font-black text-slate-700 italic truncate">"{result.surgery.procedure_name}"</p>
                                                        </div>
                                                        <div className="space-y-2">
                                                            {result.oserData.Practicas?.map((p: any, pIdx: number) => {
                                                                const statusInfo = getStatusInfo(p[4]);
                                                                const isMatch = checkMatch(result.surgery.procedure_name, p[1], p[0]);
                                                                const isSelectedPractice = selectedPractices[result.surgery.id]?.includes(p[0]);
                                                                const statusLower = String(p[4] || "").toLowerCase();
                                                                const isSelectable = !statusLower.includes('rechazo') && 
                                                                                     !statusLower.includes('rechazada') && 
                                                                                     !statusLower.includes('no autorizada') && 
                                                                                     !statusLower.includes('anulado') && 
                                                                                     !statusLower.includes('anulada') && 
                                                                                     !statusLower.includes('cambio de codigo') && 
                                                                                     !statusLower.includes('cambio de código');
                                                                
                                                                return (
                                                                    <div 
                                                                        key={pIdx} 
                                                                        onClick={() => {
                                                                            if (isSelectable) {
                                                                                togglePractice(result.surgery.id, p[0]);
                                                                            }
                                                                        }}
                                                                        className={`p-3 rounded-2xl border-2 transition-all flex items-center gap-3 ${
                                                                            !isSelectable 
                                                                                ? 'border-slate-100 bg-slate-50/20 opacity-60 cursor-not-allowed' 
                                                                                : isSelectedPractice 
                                                                                    ? 'border-blue-500 bg-blue-50/30 cursor-pointer' 
                                                                                    : 'border-slate-50 bg-slate-50/30 hover:border-slate-200 cursor-pointer'
                                                                        }`}
                                                                    >
                                                                        <div className={`size-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                                                                            !isSelectable 
                                                                                ? 'bg-slate-100 border-slate-200 text-slate-400' 
                                                                                : isSelectedPractice 
                                                                                    ? 'bg-blue-600 border-blue-600 text-white' 
                                                                                    : 'bg-white border-slate-300'
                                                                        }`}>
                                                                            {!isSelectable ? (
                                                                                <span className="material-symbols-outlined text-slate-400 text-[10px] font-black">lock</span>
                                                                            ) : isSelectedPractice ? (
                                                                                <span className="material-symbols-outlined text-white text-[10px] font-black">check</span>
                                                                            ) : null}
                                                                        </div>
                                                                        <div className="flex-1 min-w-0">
                                                                            <p className={`text-[11px] font-black truncate ${!isSelectable ? 'text-slate-400' : isSelectedPractice ? 'text-blue-900' : 'text-slate-700'}`}>
                                                                                {p[0]}: {p[1]}
                                                                            </p>
                                                                            <div className="flex items-center gap-2 mt-1">
                                                                                <span className={`text-[9px] font-black px-2 py-0.5 rounded-full border ${statusInfo.color} ${statusInfo.border} ${statusInfo.bg}`}>
                                                                                    {statusInfo.label}
                                                                                </span>
                                                                                {isMatch && <span className="text-[9px] text-green-600 font-black uppercase tracking-tighter">● Ya en App</span>}
                                                                                {!isSelectable && <span className="text-[9px] text-slate-400 font-black uppercase tracking-tighter">● Solo Historial</span>}
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                );
                                                            })}
                                                            
                                                            {result.diffs.protesis && result.diffs.protesis.length > 0 && (
                                                                <div className="mt-4 border-t border-slate-200 pt-4">
                                                                    <h5 className="text-[11px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2 mb-3">
                                                                        <span className="material-symbols-outlined text-sm">hardware</span> Prótesis y Materiales
                                                                    </h5>
                                                                    <div className="space-y-2">
                                                                        {result.diffs.protesis.map((p: any, pIdx: number) => {
                                                                            const statusInfo = getStatusInfo(p[4]);
                                                                            return (
                                                                                <div key={`prot-${pIdx}`} className="p-3 rounded-2xl border border-indigo-100 bg-indigo-50/30 flex items-center gap-3">
                                                                                    <div className="size-5 rounded-md bg-indigo-100 text-indigo-600 flex items-center justify-center flex-shrink-0">
                                                                                        <span className="material-symbols-outlined text-[12px] font-black">medical_services</span>
                                                                                    </div>
                                                                                    <div className="flex-1 min-w-0">
                                                                                        <p className="text-[11px] font-black text-indigo-900 truncate" title={`${p[0]}: ${p[1]}`}>
                                                                                            {p[0]}: {p[1]}
                                                                                        </p>
                                                                                        <div className="flex gap-3 mt-0.5 mb-1">
                                                                                            <span className="text-[9px] text-slate-500 font-bold uppercase">
                                                                                                Pedida: <span className="text-slate-800 font-black">{p[2]}</span>
                                                                                            </span>
                                                                                            <span className="text-[9px] text-slate-500 font-bold uppercase">
                                                                                                Aut: <span className="text-slate-800 font-black">{p[3]}</span>
                                                                                            </span>
                                                                                        </div>
                                                                                        <div className="flex flex-wrap items-center gap-2 mt-1">
                                                                                            <span className={`text-[9px] font-black px-2 py-0.5 rounded-full border ${statusInfo.color} ${statusInfo.border} ${statusInfo.bg}`}>
                                                                                                {statusInfo.label}
                                                                                            </span>
                                                                                            {p[5] && (
                                                                                                <span className="text-[9px] text-slate-500 font-black uppercase tracking-tighter flex items-center gap-1">
                                                                                                    <span className="material-symbols-outlined text-[10px]">event_available</span>
                                                                                                    {p[5]}
                                                                                                </span>
                                                                                            )}
                                                                                            <span className="text-[9px] text-indigo-500 font-black uppercase tracking-tighter">● Solo Lectura</span>
                                                                                        </div>
                                                                                    </div>
                                                                                </div>
                                                                            );
                                                                        })}
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })
                                )}
                            </div>
                        ) : (
                            <div className="bg-white rounded-3xl border border-slate-100 overflow-hidden">
                                <table className="w-full text-left border-collapse">
                                    <thead>
                                        <tr className="bg-slate-50 border-b border-slate-100">
                                            <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">NUC</th>
                                            <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Paciente</th>
                                            <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Estado OSER</th>
                                            <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Resultado</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-50">
                                        {processedHistory.length === 0 ? (
                                            <tr>
                                                <td colSpan={4} className="px-6 py-20 text-center text-slate-400">
                                                    <span className="material-symbols-outlined text-5xl mb-2">history</span>
                                                    <p className="text-sm font-black uppercase tracking-widest">Historial vacío</p>
                                                </td>
                                            </tr>
                                        ) : sortedHistory.length === 0 ? (
                                            <tr>
                                                <td colSpan={4} className="px-6 py-20 text-center text-slate-400">
                                                    <span className="material-symbols-outlined text-5xl mb-2">search_off</span>
                                                    <p className="text-sm font-black uppercase tracking-widest">Sin resultados</p>
                                                    <p className="text-xs text-slate-400 mt-1">No se encontraron pacientes que coincidan con la búsqueda.</p>
                                                </td>
                                            </tr>
                                        ) : (
                                            sortedHistory.map((item, idx) => (
                                                <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                                                    <td className="px-6 py-4 font-mono text-xs font-bold text-slate-500">{item.nuc}</td>
                                                    <td className="px-6 py-4 text-sm font-black text-slate-700">{item.patient}</td>
                                                    <td className="px-6 py-4">
                                                        <div className="flex justify-center">
                                                            {item.status === 'success' ? (
                                                                <span className="bg-green-50 text-green-600 px-3 py-1 rounded-full text-[9px] font-black border border-green-100 uppercase tracking-widest">Sincronizado</span>
                                                            ) : item.status === 'not_found' ? (
                                                                <span className="bg-slate-50 text-slate-500 px-3 py-1 rounded-full text-[9px] font-black border border-slate-100 uppercase tracking-widest">No Encontrado</span>
                                                            ) : (
                                                                <span className="bg-red-50 text-red-600 px-3 py-1 rounded-full text-[9px] font-black border border-red-100 uppercase tracking-widest">Error</span>
                                                            )}
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-4 text-right">
                                                        {item.hasChanges ? (
                                                            <span className="text-blue-600 text-[10px] font-black uppercase tracking-widest flex items-center justify-end gap-1.5">
                                                                <span className="material-symbols-outlined text-sm">warning</span> Discrepancia
                                                            </span>
                                                        ) : (
                                                            <span className="text-slate-300 text-[10px] font-black uppercase tracking-widest flex items-center justify-end gap-1.5">
                                                                <span className="material-symbols-outlined text-sm text-green-500">check</span> Sin Cambios
                                                            </span>
                                                        )}
                                                    </td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>

                    {/* Logs Sidebar */}
                    <AnimatePresence>
                        {showLogs && (
                            <motion.div 
                                initial={{ width: 0, opacity: 0 }}
                                animate={{ width: '33.333%', opacity: 1 }}
                                exit={{ width: 0, opacity: 0 }}
                                className="bg-slate-900 border-l border-slate-800 flex flex-col font-mono text-[10px]"
                            >
                                <div className="p-4 border-b border-slate-800 flex items-center justify-between text-slate-500 uppercase font-black tracking-widest">
                                    <span>Consola en Vivo</span>
                                    <div className="size-2 bg-blue-500 rounded-full animate-pulse"></div>
                                </div>
                                <div className="flex-1 overflow-y-auto p-4 space-y-1 text-blue-300 custom-scrollbar-dark">
                                    {syncLogs.map((log, lIdx) => (
                                        <div key={lIdx} className="border-l border-blue-900/50 pl-2 py-0.5">
                                            {log}
                                        </div>
                                    ))}
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>

                {/* Footer */}
                <div className="p-8 border-t border-slate-100 bg-white flex items-center justify-between">
                    <div className="flex items-center gap-6">
                        <div className="flex flex-col">
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Selección Actual</span>
                            <div className="flex items-center gap-2">
                                <span className="text-xl font-black text-slate-800">{selectedSurgeries.size}</span>
                                <span className="text-xs font-bold text-slate-400">cirugías listas para aplicar</span>
                            </div>
                        </div>
                    </div>
                    <div className="flex items-center gap-4">
                        <button 
                            onClick={closeModal}
                            className="px-8 py-3 rounded-2xl text-sm font-black text-slate-500 hover:bg-slate-100 transition-all uppercase tracking-widest"
                        >
                            Descartar cambios
                        </button>
                        <button 
                            disabled={selectedSurgeries.size === 0 || isApplying}
                            onClick={handleBatchSync}
                            className="bg-blue-600 text-white px-10 py-4 rounded-2xl text-sm font-black shadow-xl shadow-blue-100 hover:bg-blue-700 disabled:opacity-50 transition-all flex items-center gap-3"
                        >
                            APLICAR {selectedSurgeries.size} ACTUALIZACIONES
                        </button>
                    </div>
                </div>
            </motion.div>
        </div>
    );
};

export default OserSyncModal;
