import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { supabase } from '../src/lib/supabase';

interface NomencladorItem {
    code: string;
    description: string;
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

    useEffect(() => {
        if (isOpen) {
            setSearchTerm('');
            fetchInitialItems();
        }
    }, [isOpen, nomencladorType]);

    const fetchInitialItems = async () => {
        setIsLoading(true);
        try {
            let { data, error } = await supabase
                .from('nomenclador_items')
                .select('code, description')
                .eq('type', nomencladorType)
                .limit(50);
            
            // Si no hay resultados con el filtro, probamos traer cualquiera solo para ver si hay conexión
            if (!data || data.length === 0) {
                const { data: fallbackData } = await supabase
                    .from('nomenclador_items')
                    .select('code, description')
                    .limit(50);
                data = fallbackData;
            }

            if (error) throw error;
            const defaultItem: NomencladorItem = { code: '00.00.00', description: 'A DEFINIR' };
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
            } else {
                if (items.length === 0) fetchInitialItems();
            }
            return;
        }

        setIsLoading(true);
        try {
            // 1. Intentamos búsqueda directa con el término completo
            let { data, error } = await supabase
                .from('nomenclador_items')
                .select('code, description')
                .eq('type', nomencladorType)
                .or(`description.ilike.%${cleanTerm}%,code.ilike.%${cleanTerm}%`)
                .limit(100);
                
            if (error) throw error;
            
            // 2. Si no hay nada, probamos buscando solo la primera palabra larga
            if (!data || data.length === 0) {
                const words = cleanTerm.split(/\s+/).filter(w => w.length > 2);
                if (words.length > 0) {
                    const mainWord = words.sort((a,b) => b.length - a.length)[0];
                    const { data: fallbackData } = await supabase
                        .from('nomenclador_items')
                        .select('code, description')
                        .eq('type', nomencladorType)
                        .or(`description.ilike.%${mainWord}%,code.ilike.%${mainWord}%`)
                        .limit(100);
                    data = fallbackData;
                }
            }

            // 3. Si sigue sin haber nada, probamos SIN el filtro de tipo (Emergencia)
            if (!data || data.length === 0) {
                const { data: anyTypeData } = await supabase
                    .from('nomenclador_items')
                    .select('code, description')
                    .or(`description.ilike.%${cleanTerm.split(' ')[0]}%,code.ilike.%${cleanTerm.split(' ')[0]}%`)
                    .limit(50);
                data = anyTypeData;
            }

            const defaultItem: NomencladorItem = { code: '00.00.00', description: 'A DEFINIR' };
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
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
            <motion.div 
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[85vh] overflow-hidden border border-slate-200"
            >
                {/* Header */}
                <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                    <div className="flex items-center gap-3">
                        <div className="size-10 bg-primary rounded-xl flex items-center justify-center shadow-lg shadow-primary/20">
                            <span className="material-symbols-outlined text-white">clinical_notes</span>
                        </div>
                        <div>
                            <h3 className="text-xl font-bold text-slate-900 leading-tight">Buscador {nomencladorType} <span className="text-[10px] text-slate-400 font-normal">v2.3.18</span></h3>
                            <p className="text-xs text-slate-500 font-medium">Catálogo oficial de procedimientos</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="size-10 rounded-full hover:bg-slate-200 text-slate-400 flex items-center justify-center transition-all">
                        <span className="material-symbols-outlined">close</span>
                    </button>
                </div>

                {/* Search Bar */}
                <div className="px-6 py-4 border-b border-slate-100 bg-white">
                    <div className="relative group">
                        <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-primary transition-colors">search</span>
                        <input 
                            type="text"
                            placeholder="Buscar por código o descripción..."
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
                            <span className="material-symbols-outlined animate-spin text-4xl mb-2">progress_activity</span>
                            <p className="text-sm">Buscando...</p>
                        </div>
                    ) : items.length > 0 ? (
                        <div className="grid gap-3">
                            {items.map((item, idx) => (
                                <button 
                                    key={idx}
                                    onClick={() => {
                                        onSelect(`[${item.code}] ${item.description}`);
                                        onClose();
                                    }}
                                    className="w-full text-left p-4 bg-white border border-slate-200 rounded-2xl hover:border-primary hover:bg-primary/5 transition-all flex items-start gap-4 shadow-sm group"
                                >
                                    <div className="font-mono text-xs font-bold bg-slate-100 text-slate-600 px-2 py-1 rounded group-hover:bg-primary/10 group-hover:text-primary transition-colors">
                                        {item.code}
                                    </div>
                                    <span className="text-sm font-bold text-slate-800 group-hover:text-primary transition-colors">{item.description}</span>
                                </button>
                            ))}
                        </div>
                    ) : (
                        <div className="flex flex-col items-center justify-center py-20 text-slate-400 text-center">
                            <span className="material-symbols-outlined text-4xl mb-2 text-slate-300">search_off</span>
                            <p className="text-sm">No se encontraron resultados</p>
                            {searchTerm && (
                                <button 
                                    onClick={() => {
                                        onSelect(searchTerm);
                                        onClose();
                                    }}
                                    className="mt-4 text-primary text-xs font-bold hover:underline"
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
