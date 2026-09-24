import React from 'react';
import { Coverage, Vendor, NomencladorCatalog, parseCoverageNomencladores, formatCoverageNomencladores } from '../../../types';

interface CoverageModalProps {
    show: boolean;
    onClose: () => void;
    onSave: () => void;
    coverageForm: Partial<Coverage>;
    setCoverageForm: (form: Partial<Coverage>) => void;
    isEditing: boolean;
    vendors: Vendor[];
    catalogs?: NomencladorCatalog[];
}

const CoverageModal: React.FC<CoverageModalProps> = ({
    show, onClose, onSave, coverageForm, setCoverageForm, isEditing, vendors, catalogs = []
}) => {
    if (!show) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4 animate-fadeIn">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col max-h-[95vh] md:max-h-[90vh]">
                <div className="p-4 md:p-6 border-b border-slate-200 flex justify-between items-center bg-slate-50 rounded-t-2xl">
                    <h3 className="text-lg font-bold text-slate-900">
                        {isEditing ? 'Editar Prestador' : 'Nuevo Prestador'}
                    </h3>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors p-1">
                        <span className="material-symbols-outlined">close</span>
                    </button>
                </div>
                <div className="p-4 md:p-6 space-y-5 overflow-y-auto flex-1 custom-scrollbar">
                    <div>
                        <label className="block text-xs font-bold text-slate-700 uppercase mb-2">Nombre del Prestador</label>
                        <input
                            className="w-full bg-white text-slate-900 rounded-lg border border-slate-300 focus:ring-blue-500 focus:border-blue-500 px-3 py-2 text-sm placeholder-slate-400 transition-all"
                            type="text"
                            value={coverageForm.name || ''}
                            onChange={e => setCoverageForm({ ...coverageForm, name: e.target.value })}
                            placeholder="Ej: OSDE, Swiss Medical o Provincia ART"
                            autoFocus
                        />
                    </div>

                    <div className="flex items-center gap-3 bg-slate-50 p-3 rounded-lg border border-slate-100">
                        <label className="relative inline-flex items-center cursor-pointer">
                            <input
                                type="checkbox"
                                className="sr-only peer"
                                checked={coverageForm.type === 'ART'}
                                onChange={e => setCoverageForm({ ...coverageForm, type: e.target.checked ? 'ART' : 'Obra Social' })}
                            />
                            <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-orange-500 shadow-inner"></div>
                        </label>
                        <div className="flex flex-col">
                            <span className="text-sm font-bold text-slate-700">Es Aseguradora (ART)</span>
                            <span className="text-[10px] text-slate-500">Marque si este prestador es una cobertura por accidente laboral.</span>
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-slate-700 uppercase mb-2">Ortopedia Asociada (Opcional)</label>
                        <select
                            value={coverageForm.vendor_id || ''}
                            onChange={e => setCoverageForm({ ...coverageForm, vendor_id: e.target.value })}
                            className="w-full bg-slate-50 text-slate-900 rounded-lg border border-slate-200 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all"
                        >
                            <option value="">Ninguna</option>
                            {vendors.map(v => (
                                <option key={v.id} value={v.id}>{v.name}</option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-slate-700 uppercase mb-2 flex items-center justify-between">
                            <span className="flex items-center gap-1.5">
                                <span className="material-symbols-outlined text-sm text-primary">inventory</span>
                                Nomencladores Habilitados
                            </span>
                            <span className="text-[10px] text-slate-400 font-normal lowercase">selección múltiple</span>
                        </label>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 bg-slate-50 p-3 rounded-xl border border-slate-200">
                            {catalogs.map(cat => {
                                const activeCatalogs = parseCoverageNomencladores(coverageForm);
                                const isChecked = activeCatalogs.includes(cat.id.toUpperCase());

                                return (
                                    <label
                                        key={cat.id}
                                        className={`flex items-center gap-2.5 p-2 rounded-lg border text-xs font-bold cursor-pointer transition-all ${
                                            isChecked
                                                ? 'bg-blue-50 border-blue-300 text-blue-900 shadow-sm'
                                                : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-100'
                                        }`}
                                    >
                                        <input
                                            type="checkbox"
                                            className="size-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500"
                                            checked={isChecked}
                                            onChange={() => {
                                                let nextList: string[];
                                                if (isChecked) {
                                                    nextList = activeCatalogs.filter(c => c !== cat.id.toUpperCase());
                                                    if (nextList.length === 0) nextList = ['AOTER'];
                                                } else {
                                                    nextList = [...activeCatalogs, cat.id.toUpperCase()];
                                                }
                                                setCoverageForm({
                                                    ...coverageForm,
                                                    nomenclador_type: formatCoverageNomencladores(nextList),
                                                    nomenclador_types: nextList
                                                });
                                            }}
                                        />
                                        <span className="truncate">{cat.name}</span>
                                    </label>
                                );
                            })}
                        </div>
                        <p className="text-[10px] text-slate-500 mt-1.5">
                            Puede asignar varios nomencladores simultáneamente a esta cobertura.
                        </p>
                    </div>
                </div>
                <div className="p-4 md:p-6 border-t border-slate-200 bg-slate-50 rounded-b-2xl flex justify-end gap-3">
                    <button onClick={onClose} className="px-4 py-2.5 text-slate-600 hover:bg-white hover:shadow-sm rounded-lg font-bold text-sm border border-transparent hover:border-slate-200 transition-all flex-1 md:flex-none">
                        Cancelar
                    </button>
                    <button
                        onClick={onSave}
                        disabled={!coverageForm.name || !coverageForm.name.trim()}
                        className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg font-bold text-sm shadow-sm transition-all flex-1 md:flex-none"
                    >
                        {isEditing ? 'Guardar Cambios' : 'Crear Cobertura'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default CoverageModal;
