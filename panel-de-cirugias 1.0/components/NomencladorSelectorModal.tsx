import React, { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { supabase } from '../src/lib/supabase';

interface NomencladorItem {
    code: string;
    description: string;
    type?: string;
}

interface NomencladorSelectorModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSelect: (item: string) => void;
    nomencladorType: 'AOTER' | 'OSER' | 'NN' | string;
}

const NomencladorSelectorModal: React.FC<NomencladorSelectorModalProps> = ({ isOpen, onClose, onSelect, nomencladorType }) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [items, setItems] = useState<NomencladorItem[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [subFilter, setSubFilter] = useState<'ALL' | 'AOTER' | 'NN'>('ALL');

    const isOserOnly = useMemo(() => {
        return nomencladorType === 'OSER';
    }, [nomencladorType]);

    const allowedTypes = useMemo(() => {
        if (isOserOnly) return ['OSER'];
        if (subFilter === 'AOTER') return ['AOTER'];
        if (subFilter === 'NN') return ['NN'];
        return ['AOTER', 'NN'];
    }, [isOserOnly, subFilter]);

    useEffect(() => {
        if (isOpen) {
            setSearchTerm('');
            setSubFilter('ALL');
        }
    }, [isOpen, nomencladorType]);

    useEffect(() => {
        if (isOpen) {
            if (searchTerm.trim().length >= 2) {
                handleSearch(searchTerm);
            } else {
                fetchInitialItems();
            }
        }
    }, [isOpen, allowedTypes]);

    const fetchInitialItems = async () => {
        setIsLoading(true);
        try {
            let query = supabase
                .from('nomenclador_items')
                .select('code, description, type')
                .eq('active', true);

            if (allowedTypes.length === 1) {
                query = query.eq('type', allowedTypes[0]);
            } else {
                query = query.in('type', allowedTypes);
            }

            let { data, error } = await query.order('code', { ascending: true }).limit(50);
            
            // Fallback si no hay activos
            if (!data || data.length === 0) {
                let fallbackQuery = supabase
                    .from('nomenclador_items')
                    .select('code, description, type');

                if (allowedTypes.length === 1) {
                    fallbackQuery = fallbackQuery.eq('type', allowedTypes[0]);
                } else {
                    fallbackQuery = fallbackQuery.in('type', allowedTypes);
                }

                const { data: fallbackData } = await fallbackQuery.limit(50);
                data = fallbackData;
            }

            if (error) throw error;
            const defaultItem: NomencladorItem = { code: '00.00.00', description: 'A DEFINIR', type: '' };
            setItems([defaultItem, ...(data || [])]);
        } catch (error) {
            console.error('Error fetching initial items:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleSearch = async (term: string) => {
        setSearchTerm(term);
        const cleanTerm = term.trim();

        if (cleanTerm.length < 2) {
            if (cleanTerm === '') {
                fetchInitialItems();
            }
            return;
        }

        setIsLoading(true);
        try {
            let query = supabase
                .from('nomenclador_items')
                .select('code, description, type')
                .eq('active', true)
                .or(`description.ilike.%${cleanTerm}%,code.ilike.%${cleanTerm}%`);

            if (allowedTypes.length === 1) {
                query = query.eq('type', allowedTypes[0]);
            } else {
                query = query.in('type', allowedTypes);
            }

            let { data, error } = await query.limit(100);
                
            if (error) throw error;
            
            // Si no hay nada, probar por palabras clave
            if (!data || data.length === 0) {
                const words = cleanTerm.split(/\s+/).filter(w => w.length > 2);
                if (words.length > 0) {
                    const mainWord = words.sort((a,b) => b.length - a.length)[0];
                    let fallbackQuery = supabase
                        .from('nomenclador_items')
                        .select('code, description, type')
                        .eq('active', true)
                        .or(`description.ilike.%${mainWord}%,code.ilike.%${mainWord}%`);

                    if (allowedTypes.length === 1) {
                        fallbackQuery = fallbackQuery.eq('type', allowedTypes[0]);
                    } else {
                        fallbackQuery = fallbackQuery.in('type', allowedTypes);
                    }

                    const { data: fallbackData } = await fallbackQuery.limit(100);
                    data = fallbackData;
                }
            }

            const defaultItem: NomencladorItem = { code: '00.00.00', description: 'A DEFINIR', type: '' };
            const matchesADefinir = 'a definir'.includes(cleanTerm.toLowerCase()) || '00.00.00'.includes(cleanTerm);
            const finalData = data || [];
            if (matchesADefinir && !finalData.some(i => i.code === '00.00.00')) {
                setItems([defaultItem, ...finalData]);
            } else {
                setItems(finalData);
            }
        } catch (error) {
            console.error('Error in search:', error);
        } finally {
            setIsLoading(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <motion.div 
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[85vh] overflow-hidden border border-slate-200"
            >
                {/* Header */}
                <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                    <div className="flex items-center gap-3">
                        <div className={`size-10 rounded-xl flex items-center justify-center shadow-lg ${
                            isOserOnly 
                                ? 'bg-purple-600 shadow-purple-200 text-white' 
                                : 'bg-primary shadow-primary/20 text-white'
                        }`}>
                            <span className="material-symbols-outlined text-white">clinical_notes</span>
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <h3 className="text-lg md:text-xl font-bold text-slate-900 leading-tight">
                                    Buscador de Nomenclador
                                </h3>
                                <span className={`text-[11px] font-black px-2 py-0.5 rounded-md border ${
                                    isOserOnly
                                        ? 'bg-purple-100 text-purple-800 border-purple-200'
                                        : 'bg-blue-100 text-blue-800 border-blue-200'
                                }`}>
                                    {isOserOnly ? 'OSER' : 'AOTER + NN'}
                                </span>
                            </div>
                            <p className="text-xs text-slate-500 font-medium">
                                {isOserOnly 
                                    ? 'Catálogo de procedimientos específico para cobertura OSER' 
                                    : 'Búsqueda combinada en Nomenclador AOTER y Nomenclador Nacional (NN)'}
                            </p>
                        </div>
                    </div>
                    <button 
                        onClick={onClose} 
                        className="size-10 rounded-full hover:bg-slate-200 text-slate-400 flex items-center justify-center transition-all"
                    >
                        <span className="material-symbols-outlined">close</span>
                    </button>
                </div>

                {/* Sub-filter tabs for non-OSER mode */}
                {!isOserOnly && (
                    <div className="px-6 pt-3 pb-0 bg-slate-50/80 border-b border-slate-200/60 flex gap-2">
                        <button
                            type="button"
                            onClick={() => setSubFilter('ALL')}
                            className={`px-3 py-1.5 text-xs font-bold rounded-t-lg transition-all border-b-2 flex items-center gap-1.5 ${
                                subFilter === 'ALL'
                                    ? 'bg-white text-blue-700 border-blue-600 shadow-sm'
                                    : 'text-slate-600 hover:text-slate-900 border-transparent hover:bg-white/50'
                            }`}
                        >
                            <span className="material-symbols-outlined text-xs">all_inclusive</span>
                            Todos (AOTER + NN)
                        </button>
                        <button
                            type="button"
                            onClick={() => setSubFilter('AOTER')}
                            className={`px-3 py-1.5 text-xs font-bold rounded-t-lg transition-all border-b-2 flex items-center gap-1.5 ${
                                subFilter === 'AOTER'
                                    ? 'bg-white text-emerald-700 border-emerald-600 shadow-sm'
                                    : 'text-slate-600 hover:text-slate-900 border-transparent hover:bg-white/50'
                            }`}
                        >
                            <span className="size-2 rounded-full bg-emerald-500"></span>
                            Solo AOTER
                        </button>
                        <button
                            type="button"
                            onClick={() => setSubFilter('NN')}
                            className={`px-3 py-1.5 text-xs font-bold rounded-t-lg transition-all border-b-2 flex items-center gap-1.5 ${
                                subFilter === 'NN'
                                    ? 'bg-white text-sky-700 border-sky-600 shadow-sm'
                                    : 'text-slate-600 hover:text-slate-900 border-transparent hover:bg-white/50'
                            }`}
                        >
                            <span className="size-2 rounded-full bg-sky-500"></span>
                            Solo NN (Nacional)
                        </button>
                    </div>
                )}

                {/* Search Bar */}
                <div className="px-6 py-4 border-b border-slate-100 bg-white">
                    <div className="relative group">
                        <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-primary transition-colors">search</span>
                        <input 
                            type="text"
                            placeholder={isOserOnly ? "Buscar por código o descripción en OSER..." : "Buscar por código o descripción en AOTER o NN..."}
                            className="w-full bg-slate-50 border border-slate-200 focus:border-primary focus:ring-4 focus:ring-primary/10 outline-none rounded-2xl pl-12 pr-4 py-3 text-sm font-medium text-slate-700 placeholder:text-slate-400 transition-all"
                            value={searchTerm}
                            onChange={(e) => handleSearch(e.target.value)}
                            autoFocus
                        />
                    </div>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6 custom-scrollbar bg-slate-50/30">
                    {isLoading ? (
                        <div className="flex flex-col items-center justify-center py-20 text-slate-400">
                            <span className="material-symbols-outlined animate-spin text-4xl mb-2 text-primary">progress_activity</span>
                            <p className="text-sm font-medium">Buscando prácticas...</p>
                        </div>
                    ) : items.length > 0 ? (
                        <div className="grid gap-2.5">
                            {items.map((item, idx) => {
                                const itemType = item.type || (item.code === '00.00.00' ? '' : 'AOTER');
                                return (
                                    <button 
                                        key={idx}
                                        onClick={() => {
                                            onSelect(`[${item.code}] ${item.description}`);
                                            onClose();
                                        }}
                                        className="w-full text-left p-3.5 bg-white border border-slate-200 rounded-2xl hover:border-primary hover:bg-primary/5 transition-all flex items-center justify-between gap-3 shadow-sm group active:scale-[0.99]"
                                    >
                                        <div className="flex items-center gap-3 flex-1 min-w-0">
                                            <div className="font-mono text-xs font-bold bg-slate-100 text-slate-700 px-2 py-1 rounded-md border border-slate-200 group-hover:bg-primary/10 group-hover:text-primary transition-colors shrink-0">
                                                {item.code}
                                            </div>
                                            <span className="text-sm font-bold text-slate-800 group-hover:text-primary transition-colors truncate">
                                                {item.description}
                                            </span>
                                        </div>

                                        {itemType && (
                                            <span className={`text-[10px] font-black px-2 py-0.5 rounded-full border shrink-0 uppercase tracking-wider ${
                                                itemType === 'OSER'
                                                    ? 'bg-purple-50 text-purple-700 border-purple-200'
                                                    : itemType === 'NN'
                                                    ? 'bg-sky-50 text-sky-700 border-sky-200'
                                                    : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                            }`}>
                                                {itemType}
                                            </span>
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                    ) : (
                        <div className="flex flex-col items-center justify-center py-20 text-slate-400 text-center">
                            <span className="material-symbols-outlined text-4xl mb-2 text-slate-300">search_off</span>
                            <p className="text-sm font-semibold text-slate-600">No se encontraron resultados</p>
                            <p className="text-xs text-slate-400 mt-1">Intenta con otras palabras o código</p>
                            {searchTerm && (
                                <button 
                                    onClick={() => {
                                        onSelect(searchTerm);
                                        onClose();
                                    }}
                                    className="mt-4 px-4 py-2 bg-primary/10 text-primary rounded-xl text-xs font-bold hover:bg-primary hover:text-white transition-all shadow-sm"
                                >
                                    Usar "{searchTerm}" como texto libre
                                </button>
                            )}
                        </div>
                    )}
                </div>
            </motion.div>
        </div>
    );
};

export default NomencladorSelectorModal;
