import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';

import { NomencladorCatalog } from '../../../types';

interface NomencladorModalProps {
    isOpen: boolean;
    onClose: () => void;
    nomencladorForm: {
        id?: string;
        code: string;
        description: string;
        type: string;
        active: boolean;
    };
    setNomencladorForm: React.Dispatch<React.SetStateAction<{
        id?: string;
        code: string;
        description: string;
        type: string;
        active: boolean;
    }>>;
    isEditing: boolean;
    onSave: () => Promise<boolean | void>;
    isSaving?: boolean;
    catalogs?: NomencladorCatalog[];
}

const COLOR_CLASSES: Record<string, { bg: string; border: string; text: string; activeBg: string; activeBorder: string; dot: string }> = {
    emerald: { bg: 'bg-white', border: 'border-slate-200', text: 'text-slate-600', activeBg: 'bg-emerald-50', activeBorder: 'border-emerald-600 text-emerald-800', dot: 'bg-emerald-500' },
    purple: { bg: 'bg-white', border: 'border-slate-200', text: 'text-slate-600', activeBg: 'bg-purple-50', activeBorder: 'border-purple-600 text-purple-800', dot: 'bg-purple-500' },
    sky: { bg: 'bg-white', border: 'border-slate-200', text: 'text-slate-600', activeBg: 'bg-sky-50', activeBorder: 'border-sky-600 text-sky-800', dot: 'bg-sky-500' },
    amber: { bg: 'bg-white', border: 'border-slate-200', text: 'text-slate-600', activeBg: 'bg-amber-50', activeBorder: 'border-amber-600 text-amber-800', dot: 'bg-amber-500' },
    rose: { bg: 'bg-white', border: 'border-slate-200', text: 'text-slate-600', activeBg: 'bg-rose-50', activeBorder: 'border-rose-600 text-rose-800', dot: 'bg-rose-500' },
    indigo: { bg: 'bg-white', border: 'border-slate-200', text: 'text-slate-600', activeBg: 'bg-indigo-50', activeBorder: 'border-indigo-600 text-indigo-800', dot: 'bg-indigo-500' },
    teal: { bg: 'bg-white', border: 'border-slate-200', text: 'text-slate-600', activeBg: 'bg-teal-50', activeBorder: 'border-teal-600 text-teal-800', dot: 'bg-teal-500' },
    slate: { bg: 'bg-white', border: 'border-slate-200', text: 'text-slate-600', activeBg: 'bg-slate-100', activeBorder: 'border-slate-600 text-slate-800', dot: 'bg-slate-500' }
};

const DEFAULT_CATALOGS: NomencladorCatalog[] = [
    { id: 'AOTER', name: 'AOTER', color: 'emerald' },
    { id: 'OSER', name: 'OSER', color: 'purple' },
    { id: 'NN', name: 'NN (Nacional)', color: 'sky' }
];

const NomencladorModal: React.FC<NomencladorModalProps> = ({
    isOpen,
    onClose,
    nomencladorForm,
    setNomencladorForm,
    isEditing,
    onSave,
    isSaving = false,
    catalogs = DEFAULT_CATALOGS
}) => {
    if (!isOpen) return null;

    const availableCatalogs = catalogs.length > 0 ? catalogs : DEFAULT_CATALOGS;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        await onSave();
    };

    return (
        <AnimatePresence>
            <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 overflow-y-auto">
                <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: 20 }}
                    className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden border border-slate-200 my-8"
                >
                    {/* Header */}
                    <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                        <div className="flex items-center gap-3">
                            <div className="size-10 rounded-xl flex items-center justify-center shadow-lg bg-blue-600 shadow-blue-200 text-white">
                                <span className="material-symbols-outlined text-2xl">clinical_notes</span>
                            </div>
                            <div>
                                <h3 className="text-xl font-bold text-slate-900 leading-tight">
                                    {isEditing ? 'Editar Práctica' : 'Nueva Práctica'}
                                </h3>
                                <p className="text-xs text-slate-500 font-medium">
                                    Nomenclador {nomencladorForm.type}
                                </p>
                            </div>
                        </div>
                        <button
                            type="button"
                            onClick={onClose}
                            className="size-10 rounded-full hover:bg-slate-200 text-slate-400 flex items-center justify-center transition-all"
                        >
                            <span className="material-symbols-outlined">close</span>
                        </button>
                    </div>

                    {/* Form */}
                    <form onSubmit={handleSubmit} className="p-6 space-y-5">
                        {/* Selector de Nomenclador */}
                        <div>
                            <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                                Nomenclador de Destino
                            </label>
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 max-h-40 overflow-y-auto custom-scrollbar p-1">
                                {availableCatalogs.map(cat => {
                                    const isSelected = (nomencladorForm.type || '').toUpperCase() === cat.id.toUpperCase();
                                    const col = COLOR_CLASSES[cat.color || 'indigo'] || COLOR_CLASSES.indigo;

                                    return (
                                        <button
                                            key={cat.id}
                                            type="button"
                                            onClick={() => setNomencladorForm(prev => ({ ...prev, type: cat.id }))}
                                            className={`py-2.5 px-2 rounded-xl text-xs font-bold border-2 transition-all flex items-center justify-center gap-1.5 ${
                                                isSelected
                                                    ? `${col.activeBorder} ${col.activeBg} shadow-sm`
                                                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                                            }`}
                                        >
                                            <span className={`size-2 rounded-full ${col.dot}`}></span>
                                            <span className="truncate">{cat.name}</span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Código */}
                        <div>
                            <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                                Código de la Práctica <span className="text-red-500">*</span>
                            </label>
                            <div className="relative">
                                <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-lg">
                                    tag
                                </span>
                                <input
                                    type="text"
                                    required
                                    placeholder={
                                        nomencladorForm.type === 'NN'
                                            ? 'Ej: 12.03.05'
                                            : nomencladorForm.type === 'OSER'
                                            ? 'Ej: 121.01.01'
                                            : 'Ej: MS.01.01'
                                    }
                                    value={nomencladorForm.code}
                                    onChange={e => setNomencladorForm(prev => ({ ...prev, code: e.target.value.trim() }))}
                                    className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 text-sm font-mono font-bold focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-slate-50/50"
                                />
                            </div>
                            <p className="text-[11px] text-slate-400 mt-1">
                                Debe ser único dentro del nomenclador {nomencladorForm.type === 'NN' ? 'NN (Nacional)' : nomencladorForm.type}.
                            </p>
                        </div>

                        {/* Descripción */}
                        <div>
                            <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                                Descripción o Nombre del Procedimiento <span className="text-red-500">*</span>
                            </label>
                            <textarea
                                required
                                rows={3}
                                placeholder="Ej: Fractura de Tabique Nasal. Reducción y contención."
                                value={nomencladorForm.description}
                                onChange={e => setNomencladorForm(prev => ({ ...prev, description: e.target.value }))}
                                className="w-full p-3 rounded-xl border border-slate-200 text-sm font-medium focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-slate-50/50 resize-none"
                            />
                        </div>

                        {/* Estado Activo */}
                        <div className="flex items-center justify-between p-3.5 bg-slate-50 rounded-xl border border-slate-100">
                            <div>
                                <p className="text-sm font-bold text-slate-800">Práctica Habilitada</p>
                                <p className="text-xs text-slate-500">Disponible para búsqueda y asignación en cirugías</p>
                            </div>
                            <label className="relative inline-flex items-center cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={nomencladorForm.active}
                                    onChange={e => setNomencladorForm(prev => ({ ...prev, active: e.target.checked }))}
                                    className="sr-only peer"
                                />
                                <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
                            </label>
                        </div>

                        {/* Botones */}
                        <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                            <button
                                type="button"
                                onClick={onClose}
                                disabled={isSaving}
                                className="px-5 py-2.5 rounded-xl border border-slate-200 text-slate-600 font-bold text-sm hover:bg-slate-50 transition-all disabled:opacity-50"
                            >
                                Cancelar
                            </button>
                            <button
                                type="submit"
                                disabled={isSaving || !nomencladorForm.code || !nomencladorForm.description}
                                className="px-6 py-2.5 rounded-xl bg-blue-600 text-white font-bold text-sm hover:bg-blue-700 transition-all shadow-lg shadow-blue-200 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed active:scale-95"
                            >
                                {isSaving ? (
                                    <>
                                        <span className="size-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                                        <span>Guardando...</span>
                                    </>
                                ) : (
                                    <>
                                        <span className="material-symbols-outlined text-lg">check</span>
                                        <span>{isEditing ? 'Guardar Cambios' : 'Crear Práctica'}</span>
                                    </>
                                )}
                            </button>
                        </div>
                    </form>
                </motion.div>
            </div>
        </AnimatePresence>
    );
};

export default NomencladorModal;
