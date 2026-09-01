import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface NomencladorModalProps {
    isOpen: boolean;
    onClose: () => void;
    nomencladorForm: {
        id?: string;
        code: string;
        description: string;
        type: 'AOTER' | 'OSER';
        active: boolean;
    };
    setNomencladorForm: React.Dispatch<React.SetStateAction<{
        id?: string;
        code: string;
        description: string;
        type: 'AOTER' | 'OSER';
        active: boolean;
    }>>;
    isEditing: boolean;
    onSave: () => Promise<boolean | void>;
    isSaving?: boolean;
}

const NomencladorModal: React.FC<NomencladorModalProps> = ({
    isOpen,
    onClose,
    nomencladorForm,
    setNomencladorForm,
    isEditing,
    onSave,
    isSaving = false
}) => {
    if (!isOpen) return null;

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
                            <div className={`size-10 rounded-xl flex items-center justify-center shadow-lg ${
                                nomencladorForm.type === 'OSER'
                                    ? 'bg-purple-600 shadow-purple-200 text-white'
                                    : 'bg-emerald-600 shadow-emerald-200 text-white'
                            }`}>
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
                            <div className="grid grid-cols-2 gap-3">
                                <button
                                    type="button"
                                    onClick={() => setNomencladorForm(prev => ({ ...prev, type: 'AOTER' }))}
                                    className={`py-3 px-4 rounded-xl text-sm font-bold border-2 transition-all flex items-center justify-center gap-2 ${
                                        nomencladorForm.type === 'AOTER'
                                            ? 'border-emerald-600 bg-emerald-50 text-emerald-800 shadow-sm'
                                            : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                                    }`}
                                >
                                    <span className="size-2.5 rounded-full bg-emerald-500"></span>
                                    AOTER
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setNomencladorForm(prev => ({ ...prev, type: 'OSER' }))}
                                    className={`py-3 px-4 rounded-xl text-sm font-bold border-2 transition-all flex items-center justify-center gap-2 ${
                                        nomencladorForm.type === 'OSER'
                                            ? 'border-purple-600 bg-purple-50 text-purple-800 shadow-sm'
                                            : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                                    }`}
                                >
                                    <span className="size-2.5 rounded-full bg-purple-500"></span>
                                    OSER (Nacional)
                                </button>
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
                                    placeholder={nomencladorForm.type === 'OSER' ? 'Ej: 120305 o 121.01.01' : 'Ej: MS.01.01 o 120305'}
                                    value={nomencladorForm.code}
                                    onChange={e => setNomencladorForm(prev => ({ ...prev, code: e.target.value.trim() }))}
                                    className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 text-sm font-mono font-bold focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-slate-50/50"
                                />
                            </div>
                            <p className="text-[11px] text-slate-400 mt-1">
                                Debe ser único dentro del nomenclador {nomencladorForm.type}.
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
