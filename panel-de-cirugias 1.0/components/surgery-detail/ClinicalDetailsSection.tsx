import React from 'react';
import { AppUser, UserRole } from '../../types';

interface NomencladorItem {
    code: string;
    description: string;
}

interface ClinicalDetailsSectionProps {
    user: AppUser | null;
    isNew: boolean;
    isReadOnly: boolean;
    currentUserRole: UserRole;
    setShowSurgeryForm: (show: boolean) => void;
    setIsNomencladorModalOpen: (open: boolean) => void;
    currentNomencladorType: 'AOTER' | 'OSER' | 'NN' | string;
    procedureInput: string;
    onProcedureInputChange: (term: string) => void;
    nomencladorSuggestions: NomencladorItem[];
    isSearchingNomenclador: boolean;
    selectedProcedures: string[];
    onAddProcedure: (procedure: string) => void;
    onRemoveProcedure: (index: number) => void;
    isCie10Enabled: boolean;
    setIsCie10ModalOpen: (open: boolean) => void;
    diagnosis: string;
    onDiagnosisChange: (diagnosis: string) => void;
    referringDoctorId: string;
    onReferringDoctorChange: (id: string) => void;
    doctors: any[];
    selectedDoctorId: string;
    onSelectedDoctorChange: (id: string) => void;
    surgerySide: string;
    onSurgerySideChange: (side: string) => void;
    allergies: string;
    onAllergiesChange: (allergies: string) => void;
    preOpNotes: string;
    onPreOpNotesChange: (notes: string) => void;
    canEditField?: (fieldId: string) => boolean;
}

export const ClinicalDetailsSection: React.FC<ClinicalDetailsSectionProps> = ({
    user,
    isNew,
    isReadOnly,
    currentUserRole,
    setShowSurgeryForm,
    setIsNomencladorModalOpen,
    currentNomencladorType,
    procedureInput,
    onProcedureInputChange,
    nomencladorSuggestions,
    isSearchingNomenclador,
    selectedProcedures,
    onAddProcedure,
    onRemoveProcedure,
    isCie10Enabled,
    setIsCie10ModalOpen,
    diagnosis,
    onDiagnosisChange,
    referringDoctorId,
    onReferringDoctorChange,
    doctors,
    selectedDoctorId,
    onSelectedDoctorChange,
    surgerySide,
    onSurgerySideChange,
    allergies,
    onAllergiesChange,
    preOpNotes,
    onPreOpNotesChange,
    canEditField
}) => {
    const [showSuggestions, setShowSuggestions] = React.useState(false);
    const dropdownRef = React.useRef<HTMLDivElement>(null);

    React.useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setShowSuggestions(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const isDiagnosisReadOnly = isReadOnly || (canEditField && !canEditField('diagnostico')) || currentUserRole === 'Ortopedia';
    return (
        <section className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center">
                <h3 className="text-sm font-bold text-slate-900">Detalles Clínicos</h3>
                {['SuperAdmin', 'Tecnico', 'Enfermeria', 'Internacion', 'Direccion', 'Medico', 'Residente', 'Anestesista', 'Cirujano'].includes(user?.role || '') && !isNew && (
                    <button
                        onClick={() => setShowSurgeryForm(true)}
                        className="flex items-center gap-2 px-3 py-1.5 bg-primary/10 text-primary hover:bg-primary/20 rounded-md text-xs font-bold transition-all"
                    >
                        <span className="material-symbols-outlined text-base">clinical_notes</span>
                        Ficha de Cirugía (Materiales Usados)
                    </button>
                )}
            </div>
            <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="md:col-span-2">
                    <label className="block text-xs font-semibold text-slate-500 mb-1.5 flex justify-between items-center">
                        <span>Procedimientos</span>
                        <button
                            type="button"
                            onClick={() => setIsNomencladorModalOpen(true)}
                            className="text-[10px] font-bold text-primary hover:underline flex items-center gap-1"
                            disabled={isReadOnly || currentUserRole === 'Ortopedia'}
                        >
                            <span className="material-symbols-outlined text-xs">search</span>
                            BUSCAR EN NOMENCLADOR {currentNomencladorType}
                        </button>
                    </label>
                    <div className="flex flex-col gap-3">
                        <div className="flex gap-2 relative">
                            <div className="flex-1 relative" ref={dropdownRef}>
                                <input
                                    type="text"
                                    className="w-full rounded border border-slate-200 bg-white text-slate-900 focus:border-primary focus:ring-1 focus:ring-primary px-3 py-2 text-sm"
                                    placeholder={`Buscar en Nomenclador ${currentNomencladorType}...`}
                                    value={procedureInput}
                                    onFocus={() => {
                                        if (procedureInput.trim().length >= 2 && nomencladorSuggestions.length > 0) {
                                            setShowSuggestions(true);
                                        }
                                    }}
                                    onChange={(e) => {
                                        const val = e.target.value;
                                        onProcedureInputChange(val);
                                        setShowSuggestions(val.trim().length >= 2);
                                    }}
                                    disabled={isReadOnly || currentUserRole === 'Ortopedia'}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                            e.preventDefault();
                                            if (procedureInput.trim()) {
                                                onAddProcedure(procedureInput.trim());
                                                onProcedureInputChange('');
                                                setShowSuggestions(false);
                                            }
                                        } else if (e.key === 'Escape') {
                                            setShowSuggestions(false);
                                        }
                                    }}
                                />
                                {showSuggestions && nomencladorSuggestions.length > 0 && (
                                    <div className="absolute z-50 w-full mt-1 bg-white border border-slate-200 rounded-lg shadow-xl max-h-[300px] overflow-y-auto animate-in fade-in zoom-in-95 duration-150">
                                        {nomencladorSuggestions.map((item, idx) => (
                                            <button
                                                key={idx}
                                                type="button"
                                                className="w-full text-left px-4 py-3 hover:bg-primary/5 border-b border-slate-50 last:border-0 transition-colors group"
                                                onClick={() => {
                                                    const fullText = `[${item.code}] ${item.description}`;
                                                    onAddProcedure(fullText);
                                                    onProcedureInputChange('');
                                                    setShowSuggestions(false);
                                                }}
                                            >
                                                <div className="flex justify-between items-center gap-2">
                                                    <span className="text-sm font-bold text-slate-900 group-hover:text-primary transition-colors flex-1">{item.description}</span>
                                                    <div className="flex items-center gap-1.5 flex-shrink-0">
                                                        {item.type && item.type !== '' && (
                                                            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border uppercase ${
                                                                item.type === 'OSER'
                                                                    ? 'bg-purple-50 text-purple-700 border-purple-200'
                                                                    : item.type === 'NN'
                                                                    ? 'bg-sky-50 text-sky-700 border-sky-200'
                                                                    : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                                            }`}>
                                                                {item.type}
                                                            </span>
                                                        )}
                                                        <span className="text-[10px] font-mono bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded border border-slate-200 uppercase">{item.code}</span>
                                                    </div>
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                )}
                                {isSearchingNomenclador && (
                                    <div className="absolute right-3 top-2.5">
                                        <div className="animate-spin rounded-full h-4 w-4 border-2 border-primary border-t-transparent"></div>
                                    </div>
                                )}
                            </div>
                            <button
                                type="button"
                                onClick={() => {
                                    if (procedureInput.trim()) {
                                        onAddProcedure(procedureInput.trim());
                                        onProcedureInputChange('');
                                        setShowSuggestions(false);
                                    }
                                }}
                                className={`bg-primary hover:bg-primary-hover text-white px-4 py-2 rounded text-sm font-bold transition-all shadow-sm ${(isReadOnly || currentUserRole === 'Ortopedia') ? 'opacity-50 cursor-not-allowed' : ''}`}
                                disabled={isReadOnly || currentUserRole === 'Ortopedia'}
                            >
                                Agregar
                            </button>
                        </div>

                        {/* Mensaje de advertencia cuando se ingresa o selecciona A DEFINIR */}
                        {(
                            procedureInput.toLowerCase().includes('a definir') ||
                            procedureInput.includes('000000') ||
                            procedureInput.includes('00.00.00') ||
                            selectedProcedures.some(p => p.toUpperCase().includes('A DEFINIR') || p.includes('00.00.00'))
                        ) && (
                            <div className="flex items-center gap-2 p-2.5 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 text-xs font-medium animate-fadeIn">
                                <span className="material-symbols-outlined text-amber-600 text-base">warning</span>
                                <span><strong>Atención:</strong> No se podrá programar la cirugía en el calendario sin especificar un código válido.</span>
                            </div>
                        )}

                        {/* Procedures Display */}
                        <div className="flex flex-wrap gap-2 min-h-[40px] p-2 bg-slate-50 rounded border border-slate-100 border-dashed">
                            {selectedProcedures.length === 0 ? (
                                <span className="text-xs text-slate-400 italic self-center px-1">No hay procedimientos agregados</span>
                            ) : (
                                selectedProcedures.map((proc, idx) => (
                                    <div key={idx} className="flex items-center gap-1.5 bg-white border border-slate-200 px-2.5 py-1 rounded-full shadow-sm animate-fadeIn">
                                        <span className="text-xs font-bold text-slate-700">{proc}</span>
                                        <button
                                            onClick={() => onRemoveProcedure(idx)}
                                            className="text-slate-400 hover:text-red-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                            disabled={isReadOnly || currentUserRole === 'Ortopedia'}
                                        >
                                            <span className="material-symbols-outlined text-sm font-bold">close</span>
                                        </button>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>
                <div className="md:col-span-2">
                    <label className="block text-xs font-semibold text-slate-500 mb-1.5 flex justify-between items-center">
                        <span>Diagnóstico (CIE-10)</span>
                        {isCie10Enabled && (
                            <button
                                type="button"
                                onClick={() => setIsCie10ModalOpen(true)}
                                className="text-[10px] font-bold text-primary hover:underline flex items-center gap-1"
                                disabled={isDiagnosisReadOnly}
                            >
                                <span className="material-symbols-outlined text-xs">search</span>
                                BUSCAR EN CIE-10
                            </button>
                        )}
                    </label>
                    <div className="relative group">
                        <div className={`w-full min-h-[42px] rounded border border-slate-200 bg-white flex flex-wrap gap-2 p-2 transition-all ${(!isDiagnosisReadOnly) ? 'hover:border-primary/50' : ''}`}>
                            {(!diagnosis || diagnosis.trim() === '') ? (
                                <div 
                                    className="flex-1 flex items-center justify-between cursor-pointer"
                                    onClick={() => !isDiagnosisReadOnly && setIsCie10ModalOpen(true)}
                                >
                                    <span className="text-xs text-slate-400 italic px-1">Sin diagnósticos cargados...</span>
                                    {isCie10Enabled && (
                                        <span className="material-symbols-outlined text-slate-300 group-hover:text-primary transition-colors">clinical_notes</span>
                                    )}
                                </div>
                            ) : (
                                diagnosis.split(' + ').map((diag, idx) => {
                                    const [code, ...descParts] = diag.split(' - ');
                                    const desc = descParts.join(' - ');
                                    return (
                                        <div key={idx} className="flex items-center gap-2 bg-indigo-50/50 border border-indigo-100 px-3 py-1.5 rounded-xl shadow-sm animate-fadeIn">
                                            <div className="flex flex-col">
                                                <span className="text-[9px] font-black text-indigo-600 leading-none mb-0.5 tracking-wider uppercase">{code}</span>
                                                <span className="text-[11px] font-bold text-slate-700 leading-tight">{desc}</span>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    const items = diagnosis.split(' + ').filter((_, i) => i !== idx);
                                                    onDiagnosisChange(items.join(' + '));
                                                }}
                                                className="text-slate-300 hover:text-red-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed ml-1 flex items-center"
                                                disabled={isDiagnosisReadOnly}
                                                title="Eliminar diagnóstico"
                                            >
                                                <span className="material-symbols-outlined text-base font-bold">cancel</span>
                                            </button>
                                        </div>
                                    );
                                })
                            )}
                            
                            {/* Final interaction area if not empty */}
                            {diagnosis && diagnosis.trim() !== '' && !isDiagnosisReadOnly && (
                                <button
                                    type="button"
                                    onClick={() => setIsCie10ModalOpen(true)}
                                    className="size-8 rounded-lg bg-slate-50 hover:bg-indigo-50 flex items-center justify-center text-slate-400 hover:text-indigo-600 transition-all border border-dashed border-slate-200 hover:border-indigo-200 self-center"
                                    title="Agregar más diagnósticos"
                                >
                                    <span className="material-symbols-outlined text-lg">add</span>
                                </button>
                            )}
                        </div>
                    </div>
                </div>
                <div>
                    <label className="block text-xs font-semibold text-slate-500 mb-1.5">Médico Derivante</label>
                    <div className="relative">
                        <select
                            className="w-full rounded border border-slate-200 bg-white text-slate-900 focus:border-primary focus:ring-1 focus:ring-primary px-3 py-2 text-sm appearance-none"
                            value={referringDoctorId}
                            onChange={(e) => onReferringDoctorChange(e.target.value)}
                            disabled={isReadOnly || currentUserRole === 'Ortopedia'}
                        >
                            <option value="">Seleccionar Médico...</option>
                            {doctors
                                .filter(doc => {
                                    const specialty = (doc.specialty || '').toLowerCase();
                                    const isAnesthesiologist = specialty.includes('aneste');
                                    return (doc.active && !isAnesthesiologist) || doc.id === referringDoctorId;
                                })
                                .map(doc => (
                                    <option key={doc.id} value={doc.id}>{doc.full_name}</option>
                                ))}
                        </select>
                        <span className="material-symbols-outlined absolute right-3 top-2.5 text-slate-400 pointer-events-none text-lg">arrow_drop_down</span>
                    </div>
                </div>
                <div>
                    <label className="block text-xs font-semibold text-slate-500 mb-1.5">Cirujano Principal</label>
                    <div className="relative">
                        <select
                            className="w-full rounded border border-slate-200 bg-white text-slate-900 focus:border-primary focus:ring-1 focus:ring-primary px-3 py-2 text-sm appearance-none"
                            value={selectedDoctorId}
                            onChange={(e) => onSelectedDoctorChange(e.target.value)}
                            disabled={isReadOnly || currentUserRole === 'Ortopedia'}
                        >
                            <option value="">Seleccionar Cirujano...</option>
                            {doctors
                                .filter(doc => {
                                    const specialty = (doc.specialty || '').toLowerCase();
                                    return specialty !== 'anestesista' || doc.id === selectedDoctorId;
                                })
                                .map(doc => (
                                    <option key={doc.id} value={doc.id}>{doc.full_name}</option>
                                ))}
                        </select>
                        <span className="material-symbols-outlined absolute right-3 top-2.5 text-slate-400 pointer-events-none text-lg">arrow_drop_down</span>
                    </div>
                </div>
                <div>
                    <label className="block text-xs font-semibold text-slate-500 mb-1.5">Lateralidad</label>
                    <div className="flex gap-2">
                        {(['left', 'right', 'bilateral'] as const).map((side) => (
                            <label 
                                key={side}
                                className={`flex-1 text-center py-2 border rounded text-sm font-medium cursor-pointer transition-colors ${surgerySide === side ? 'bg-blue-50 text-blue-700 border-blue-200' : 'border-slate-200 text-slate-600 hover:bg-slate-50'} ${(isReadOnly || currentUserRole === 'Ortopedia') ? 'opacity-50 pointer-events-none' : ''}`}
                            >
                                <input
                                    type="radio"
                                    name="side"
                                    className="hidden"
                                    checked={surgerySide === side}
                                    onChange={() => onSurgerySideChange(side)}
                                /> 
                                {side === 'left' ? 'Izq' : side === 'right' ? 'Der' : 'Bilateral'}
                            </label>
                        ))}
                    </div>
                </div>
                <div className="md:col-span-2">
                    <label className="block text-xs font-semibold text-slate-500 mb-1.5">Alergias Conocidas</label>
                    <input
                        className="w-full rounded border border-slate-200 bg-white text-slate-900 focus:border-primary focus:ring-1 focus:ring-primary text-sm px-3 py-2 disabled:bg-slate-50 disabled:text-slate-500 mb-2"
                        type="text"
                        placeholder="Medicamentos, látex, yodo, etc. (Dejar en blanco si no tiene)"
                        value={allergies}
                        onChange={(e) => onAllergiesChange(e.target.value)}
                        disabled={isReadOnly || currentUserRole === 'Ortopedia'}
                    />
                    <p className="text-[10px] text-slate-400 mb-4">* Las alergias se reflejarán en la pulsera impresa.</p>
                </div>
                <div className="md:col-span-2">
                    <label className="block text-xs font-semibold text-slate-500 mb-1.5">Notas Pre-operatorias</label>
                    <textarea
                        className="w-full rounded border border-slate-200 bg-white text-slate-900 focus:border-primary focus:ring-1 focus:ring-primary text-sm px-3 py-2"
                        rows={3}
                        value={preOpNotes}
                        onChange={(e) => onPreOpNotesChange(e.target.value)}
                        placeholder="Alergias, comorbilidades, requerimientos especiales..."
                        disabled={isReadOnly || currentUserRole === 'Ortopedia'}
                    ></textarea>
                </div>
            </div>
        </section>
    );
};
