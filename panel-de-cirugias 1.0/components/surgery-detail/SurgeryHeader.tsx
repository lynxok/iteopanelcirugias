import React from 'react';
import { useNavigate } from 'react-router-dom';

interface SurgeryHeaderProps {
    isNew: boolean;
    id: string | undefined;
    patientName: string;
    idCopied: boolean;
    onCopyId: () => void;
    currentUserRole: string;
    documentNumber: string;
    nuc: string;
    selectedProcedures: string[];
    selectedDoctorId: string | number;
    doctors: any[];
    status: string;
    isScheduled: boolean;
    createdAt: string | null;
    rescheduleRequested: boolean;
    suspensionRequested: boolean;
    onRequestReschedule: () => void;
    internacionNotified: boolean;
    internacionNotifiedBy: string | null;
    onToggleInternacion: () => void;
    saving: boolean;
    priority: string;
    onSetPriority: (priority: string) => void;
    isReadOnly: boolean;
    doctorPriorityValidated: boolean;
    onSetDoctorPriorityValidated: (validated: boolean) => void;
}

export const SurgeryHeader: React.FC<SurgeryHeaderProps> = ({
    isNew,
    id,
    patientName,
    idCopied,
    onCopyId,
    currentUserRole,
    documentNumber,
    nuc,
    selectedProcedures,
    selectedDoctorId,
    doctors,
    status,
    isScheduled,
    createdAt,
    rescheduleRequested,
    suspensionRequested,
    onRequestReschedule,
    internacionNotified,
    internacionNotifiedBy,
    onToggleInternacion,
    saving,
    priority,
    onSetPriority,
    isReadOnly,
    doctorPriorityValidated,
    onSetDoctorPriorityValidated
}) => {
    return (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 mb-8 overflow-hidden animate-in fade-in slide-in-from-top-4 duration-500">
            <div className="p-6">
                <div className="flex flex-col xl:flex-row xl:items-center gap-8">
                    
                    {/* BLOCK 1: PATIENT & IDENTITY */}
                    <div className="flex items-center gap-5 min-w-[320px] shrink-0">
                        <div className={`size-14 rounded-2xl flex items-center justify-center text-lg font-black text-white uppercase tracking-wider shadow-lg transition-all duration-500 ${isNew ? 'bg-slate-300' : 'bg-indigo-600 shadow-indigo-100'}`}>
                            {isNew ? 'NP' : (patientName ? patientName.match(/\b(\w)/g)?.join('').substring(0, 2).toUpperCase() : 'NN')}
                        </div>
                        <div className="space-y-1">
                            <div className="flex items-center gap-3">
                                <h1 className="text-lg font-black text-slate-900 tracking-tight leading-none uppercase">
                                    {isNew ? 'Nueva Solicitud' : (patientName || 'Sin Nombre')}
                                </h1>
                                {!isNew && id && id !== 'new' && (
                                    <div className="flex items-center gap-1">
                                        <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-mono font-bold bg-slate-100 text-slate-500 border border-slate-200" title={`Código de Cirugía Completo: ${id}`}>
                                            #{id.split('-')[0].toUpperCase()}
                                        </span>
                                        <button 
                                            onClick={onCopyId}
                                            className={`size-6 flex items-center justify-center rounded-md transition-all ${idCopied ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-50 text-slate-400 hover:bg-slate-100 hover:text-slate-600'} cursor-pointer`}
                                            title="Copiar ID completo"
                                        >
                                            <span className="material-symbols-outlined text-sm">
                                                {idCopied ? 'check' : 'content_copy'}
                                            </span>
                                        </button>
                                    </div>
                                )}
                            </div>
                            <div className="flex items-center gap-2">
                                {currentUserRole !== 'Ortopedia' && currentUserRole !== 'Tecnico' && currentUserRole !== 'Medico' && (
                                    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                                        {documentNumber ? `DNI: ${documentNumber}` : 'SIN DOCUMENTO'}
                                    </p>
                                )}
                                {nuc && (
                                    <>
                                        <span className="size-1 rounded-full bg-slate-200"></span>
                                        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">NUC: {nuc}</p>
                                    </>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* BLOCK 2: TECHNICAL METADATA (GRID) */}
                    <div className="flex-1 grid grid-cols-1 sm:grid-cols-3 gap-8 border-t xl:border-t-0 xl:border-l border-slate-100 pt-6 xl:pt-0 xl:pl-8">
                        <div className="space-y-1">
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Procedimiento</p>
                            <p className="text-sm font-bold text-slate-800 leading-snug line-clamp-2" title={selectedProcedures.join(' + ')}>
                                {selectedProcedures.length > 0 ? selectedProcedures.join(' + ') : 'Por definir'}
                            </p>
                        </div>
                        <div className="space-y-1">
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Cirujano</p>
                            <p className="text-sm font-bold text-slate-800 truncate">
                                {isNew && !selectedDoctorId ? '--' : (doctors.find(d => d.id == selectedDoctorId)?.full_name || doctors.find(d => d.id == selectedDoctorId)?.name || 'Sin Asignar')}
                            </p>
                        </div>
                        <div className="space-y-1">
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Estado y Registro</p>
                            <div className="flex flex-wrap items-center gap-2">
                                {!isNew ? (
                                    <>
                                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-black border transition-all duration-300 uppercase tracking-wider
                                            ${status === 'cancelled' ? 'bg-rose-100 text-rose-700 border-rose-200 shadow-sm shadow-rose-50' :
                                                status === 'suspended' ? 'bg-amber-100 text-amber-700 border-amber-200 shadow-sm shadow-amber-50' :
                                                    isScheduled ? 'bg-emerald-100 text-emerald-700 border-emerald-200 shadow-sm shadow-emerald-50' :
                                                        'bg-orange-100 text-orange-700 border-orange-200 shadow-sm shadow-orange-50'}`}>
                                            {status === 'cancelled' ? 'Cancelada' : (status === 'suspended' ? 'Suspendida' : (isScheduled ? 'Programada' : 'Pendiente'))}
                                        </span>
                                        <span className="text-[10px] font-bold text-slate-400 bg-slate-50 px-2 py-0.5 rounded border border-slate-100">
                                            {createdAt ? new Date(createdAt).toLocaleDateString('es-AR', { day: '2-digit', month: 'short' }) : '--'}
                                        </span>
                                    </>
                                ) : (
                                    <span className="text-xs font-bold text-slate-300 italic">Borrador de Solicitud</span>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* BLOCK 3: ACTIONS & MANAGEMENT */}
                    <div className="flex flex-wrap items-center xl:justify-end gap-3 border-t xl:border-t-0 xl:border-l border-slate-100 pt-6 xl:pt-0 xl:pl-8 min-w-fit">
                        {/* Internacion Priority Actions */}
                        {!isNew && currentUserRole === 'Internacion' && (
                            <div className="flex gap-2 mr-2">
                                <button
                                    onClick={onRequestReschedule}
                                    className="group flex items-center gap-2 px-3 py-2 bg-indigo-50 text-indigo-700 hover:bg-indigo-600 hover:text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border border-indigo-200 hover:border-indigo-600 shadow-sm active:scale-95"
                                    disabled={rescheduleRequested || suspensionRequested}
                                >
                                    <span className="material-symbols-outlined text-base group-hover:rotate-12 transition-transform">event_repeat</span>
                                    {rescheduleRequested ? 'Reprog. Solicitada' : 'Solicitar Reprog.'}
                                </button>
                            </div>
                        )}

                        {/* Internacion Visibility Check */}
                        {!isNew && (currentUserRole === 'Internacion' || currentUserRole === 'SuperAdmin') && (
                            <div className="px-4 py-2 bg-slate-50 rounded-xl border border-slate-100 flex flex-col gap-1 items-start min-w-[140px] shadow-inner">
                                <label className="flex items-center gap-2 cursor-pointer group">
                                    <input 
                                        type="checkbox" 
                                        className="size-4 rounded border-slate-300 text-blue-500 focus:ring-blue-500 transition-colors cursor-pointer"
                                        checked={internacionNotified}
                                        onChange={onToggleInternacion}
                                        disabled={saving || (internacionNotified && currentUserRole !== 'SuperAdmin')}
                                    />
                                    <span className="text-[10px] font-black text-slate-600 uppercase tracking-tight select-none pt-0.5">
                                        Visto Internación
                                    </span>
                                </label>
                                {internacionNotified && internacionNotifiedBy && (
                                    <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider ml-6 leading-none italic">
                                        {internacionNotifiedBy.split(' ').slice(0, 2).join(' ')}
                                    </p>
                                )}
                            </div>
                        )}

                        {/* Global Fast Actions */}
                        <div className="flex items-center gap-2 ml-2">
                            {!isNew && patientName && (
                                <button
                                    onClick={() => navigate('/prequirurgicos', { state: { patientName } })}
                                    className="px-3 py-2 flex items-center gap-1.5 bg-blue-50 text-blue-700 hover:bg-blue-600 hover:text-white rounded-xl border border-blue-200 transition-all shadow-sm active:scale-95 text-xs font-bold"
                                    title="Descargar Prequirúrgicos (Lab y ECG)"
                                >
                                    <span className="material-symbols-outlined text-base">assignment_turned_in</span>
                                    <span className="hidden sm:inline">Prequirúrgicos</span>
                                </button>
                            )}

                            {!isNew && (currentUserRole === 'SuperAdmin' || currentUserRole === 'Tecnico' || currentUserRole === 'Internacion') && (
                                <button 
                                    onClick={() => {
                                        const api = (window as any).electronAPI;
                                        if (api && api.printWristband) {
                                            api.printWristband(id);
                                        } else {
                                            window.open(`/#/print-wristband/${id}`, '_blank');
                                        }
                                    }}
                                    className="size-10 flex items-center justify-center bg-blue-50 text-blue-600 hover:bg-blue-600 hover:text-white rounded-xl border border-blue-200 transition-all shadow-sm active:scale-90"
                                    title="Imprimir Pulsera de Paciente"
                                >
                                    <span className="material-symbols-outlined text-xl">print</span>
                                </button>
                            )}
                            <button className="size-10 flex items-center justify-center rounded-xl border border-slate-200 text-slate-400 hover:bg-slate-50 hover:text-slate-600 transition-all active:scale-95">
                                <span className="material-symbols-outlined text-xl">more_horiz</span>
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Footer Bar for Priority */}
            <div className="bg-slate-50 border-t border-slate-200 px-6 py-2 flex items-center gap-4 text-xs">
                <span className="font-semibold text-slate-500">Prioridad:</span>
                <div className="flex gap-2">
                    <button
                        type="button"
                        onClick={() => onSetPriority('elective')}
                        className={`px-2 py-0.5 rounded transition-colors ${priority === 'elective' ? 'bg-white text-slate-900 font-medium shadow-sm border border-slate-200' : 'text-slate-500 hover:text-slate-700'} ${(isReadOnly || currentUserRole === 'Ortopedia') ? 'opacity-50 pointer-events-none' : ''}`}
                        disabled={isReadOnly || currentUserRole === 'Ortopedia'}
                    >Programada</button>
                    <button
                        type="button"
                        onClick={() => onSetPriority('urgent')}
                        className={`px-2 py-0.5 rounded transition-colors ${priority === 'urgent' ? 'bg-orange-50 text-orange-700 font-medium border border-orange-100' : 'text-slate-500 hover:text-slate-700'} ${(isReadOnly || currentUserRole === 'Ortopedia') ? 'opacity-50 pointer-events-none' : ''}`}
                        disabled={isReadOnly || currentUserRole === 'Ortopedia'}
                    >Urgencia</button>
                    <button
                        type="button"
                        onClick={() => onSetPriority('emergency')}
                        className={`px-2 py-0.5 rounded transition-colors ${priority === 'emergency' ? 'bg-red-50 text-red-700 font-medium border border-red-100' : 'text-slate-500 hover:text-slate-700'} ${(isReadOnly || currentUserRole === 'Ortopedia') ? 'opacity-50 pointer-events-none' : ''}`}
                        disabled={isReadOnly || currentUserRole === 'Ortopedia'}
                    >Emergencia</button>
                </div>

                {/* AVAL MÉDICO DE URGENCIA - Desactivado temporalmente por decisión operativa
                {priority === 'urgent' && (
                    <div className="flex items-center gap-2 ml-2 pl-4 border-l border-slate-200">
                        <label className="flex items-center gap-2 cursor-pointer bg-orange-100/50 px-3 py-1 rounded-full border border-orange-200 transition-all hover:bg-orange-100">
                            <input
                                type="checkbox"
                                checked={doctorPriorityValidated}
                                onChange={(e) => onSetDoctorPriorityValidated(e.target.checked)}
                                disabled={isReadOnly || (currentUserRole !== 'Medico' && currentUserRole !== 'SuperAdmin')}
                                className="size-3.5 rounded border-orange-300 text-orange-600 focus:ring-orange-500"
                            />
                            <span className="text-[11px] font-black text-orange-800 uppercase tracking-tight">Aval Médico de Urgencia</span>
                        </label>
                        {!doctorPriorityValidated && (
                            <span className="flex items-center gap-1 text-red-600 animate-pulse">
                                <span className="material-symbols-outlined text-xs">warning</span>
                                <span className="text-[9px] font-bold uppercase">Agenda Bloqueada (14 días)</span>
                            </span>
                        )}
                    </div>
                )}
                */}
            </div>
        </div>
    );
};
