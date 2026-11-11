import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../src/lib/supabase';
import { useAuth } from '../src/lib/AuthContext';
import ProgressBar from '../components/ProgressBar';
import { captureError } from '../src/lib/errorLogger';

// --- Types ---
interface PreOpPatient {
    id: string; // Surgery ID
    patientDocument: string;
    name: string;
    age: number;
    doctor: string;
    proc: string;
    priority: 'Normal' | 'Urgente' | 'Alta';

    // Status Flags
    materialStatus: 'OK' | 'Pending' | 'Missing';
    clinicalStatus: 'OK' | 'Pending' | 'Missing';
    adminStatus: 'OK' | 'Pending';

    // Tooltips
    materialTooltip?: string;
    clinicalTooltip?: string;
    adminTooltip?: string;

    // Metadata
    createdAtRaw?: string;
    daysWaiting?: number;
    daysWaitingFromCreation?: number;
    daysSinceAuth?: number | null;
    orthoValidationDate?: string | null;
    hasAuthorization?: boolean;
    dateAdded: string;
    lastUpdate: string;
    status: string;
    surgeryDate?: string;
    startTime?: string;
    actualStartTime?: string | null;
    actualEndTime?: string | null;
    orName?: string;
    tags?: string[];
    authorizationDate?: string;
    vendorId?: string;
    vendorName?: string;
    medicalCoverage?: string;
    requiresMaterial?: boolean;
    suspensionRequested?: boolean;
    rescheduleRequested?: boolean;
    oserStatus?: string;
    suspensionReason?: string | null;
    suspensionObservations?: string | null;
    suspendedAt?: string | null;
    suspendedByName?: string | null;
}

// --- Date & Formatting Helpers (Buenos Aires UTC-3) ---
export const localTodayStr = (): string => {
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Argentina/Buenos_Aires',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).format(new Date());
};

const getDaysDiffFromDates = (dateAStr: string, dateBStr: string): number => {
    if (!dateAStr || !dateBStr) return 0;
    const cleanA = dateAStr.includes('T') ? dateAStr.split('T')[0] : dateAStr;
    const cleanB = dateBStr.includes('T') ? dateBStr.split('T')[0] : dateBStr;
    const [yA, mA, dA] = cleanA.split('-').map(Number);
    const [yB, mB, dB] = cleanB.split('-').map(Number);
    if (!yA || !mA || !dA || !yB || !mB || !dB) return 0;
    const utcA = Date.UTC(yA, mA - 1, dA);
    const utcB = Date.UTC(yB, mB - 1, dB);
    return Math.round((utcB - utcA) / (1000 * 60 * 60 * 24));
};

const calculateRealAge = (birthDateStr: string | null | undefined): number => {
    if (!birthDateStr) return 0;
    const clean = birthDateStr.includes('T') ? birthDateStr.split('T')[0] : birthDateStr;
    const [bYear, bMonth, bDay] = clean.split('-').map(Number);
    if (!bYear || !bMonth || !bDay) return 0;

    const todayParts = localTodayStr().split('-').map(Number);
    const tYear = todayParts[0];
    const tMonth = todayParts[1];
    const tDay = todayParts[2];

    let age = tYear - bYear;
    if (tMonth < bMonth || (tMonth === bMonth && tDay < bDay)) {
        age--;
    }
    return Math.max(0, age);
};

export const toTitleCase = (name?: string): string => {
    if (!name) return '';
    return name
        .toLowerCase()
        .split(' ')
        .filter(Boolean)
        .map(w => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ');
};

export const formatDisplayDate = (dateStr?: string | null, forceFullYear = false): string => {
    if (!dateStr) return '';
    const clean = dateStr.includes('T') ? dateStr.split('T')[0] : dateStr;
    const parts = clean.split('-');
    if (parts.length !== 3) return dateStr;
    const [y, m, d] = parts;
    const currentYear = localTodayStr().split('-')[0];
    if (!forceFullYear && y === currentYear) {
        return `${d}/${m}`;
    }
    return `${d}/${m}/${y}`;
};

// --- Urgency Sorting Protocol ---
const getUrgencyScore = (p: PreOpPatient): number => {
    if (p.priority === 'Alta') return 1;     // emergency
    if (p.priority === 'Urgente') return 2;  // urgent
    return 3;                                // normal
};

const byUrgencyThen = (secondary: (a: PreOpPatient, b: PreOpPatient) => number) => {
    return (a: PreOpPatient, b: PreOpPatient): number => {
        const uA = getUrgencyScore(a);
        const uB = getUrgencyScore(b);
        if (uA !== uB) return uA - uB;
        return secondary(a, b);
    };
};

// --- Coverage Classification Helpers ---
export const isArtCoverage = (coverage?: string, artSet?: Set<string>): boolean => {
    if (!coverage) return false;
    const norm = coverage.trim().toUpperCase();
    if (artSet && artSet.has(norm)) return true;
    return /\bART\b/i.test(coverage);
};

export const isParticularCoverage = (coverage?: string): boolean => {
    if (!coverage) return false;
    const norm = coverage.trim().toUpperCase();
    return norm.includes('PARTICULAR') || norm.includes('PRIVADO');
};

export const isArtOrParticularCategory = (coverage?: string, artSet?: Set<string>): boolean => {
    return isArtCoverage(coverage, artSet) || isParticularCoverage(coverage);
};

export const isOserCategory = (coverage?: string): boolean => {
    if (!coverage) return false;
    const upper = coverage.toUpperCase();
    return upper.includes('OSER') || upper.includes('OBRA SOCIAL');
};

export const isPrepagaCategory = (coverage?: string, artSet?: Set<string>): boolean => {
    if (!coverage) return false;
    return !isOserCategory(coverage) && !isArtOrParticularCategory(coverage, artSet);
};

// --- Progress & Readiness Helpers ---
const calculateProgress = (p: PreOpPatient) => {
    let score = 0;
    if (p.materialStatus === 'OK') score += 33;
    if (p.clinicalStatus === 'OK') score += 33;
    if (p.adminStatus === 'OK') score += 34;
    return score;
};

const isReady = (p: PreOpPatient) => p.materialStatus === 'OK' && p.clinicalStatus === 'OK' && p.adminStatus === 'OK';

// REGLA: La excepción de material pendiente aplica SOLO a priority 'Alta' (emergencia), NO a 'Urgente'
const isReadyForScheduling = (p: PreOpPatient) => {
    if (isReady(p)) return true;
    const isEmergency = p.priority === 'Alta';
    if (isEmergency && p.clinicalStatus === 'OK' && p.adminStatus === 'OK') return true;
    return false;
};

// --- Components ---
const StatusBadge = ({ type, status, highlight, tooltip }: { type: 'MAT' | 'EXAM' | 'QX', status: string, highlight?: boolean, tooltip?: string }) => {
    let colorClass = 'bg-slate-100 text-slate-500 border-slate-200';
    let icon = 'remove';

    if (status === 'OK') {
        colorClass = 'bg-emerald-50 text-emerald-700 border-emerald-200';
        icon = 'check_circle';
    }
    if (status === 'Pending') {
        colorClass = 'bg-amber-50 text-amber-700 border-amber-200';
        icon = 'hourglass_empty';
    }
    if (status === 'Missing') {
        colorClass = 'bg-red-50 text-red-700 border-red-200';
        icon = 'cancel';
    }

    return (
        <div className={`relative group/badge flex items-center gap-1.5 px-2 py-1 rounded border text-[10px] font-bold uppercase tracking-wider transition-all duration-300 ${colorClass} ${highlight ? 'ring-2 ring-primary ring-offset-1 scale-105 shadow-sm' : ''}`}>
            <span className={`material-symbols-outlined text-[12px] font-bold ${highlight ? 'animate-pulse' : ''}`}>{icon}</span>
            <span>{type}</span>

            {/* Premium Tooltip */}
            {tooltip && (
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-max max-w-[200px] px-2.5 py-1.5 bg-slate-900/90 text-white text-[9px] font-medium normal-case rounded-lg shadow-xl opacity-0 invisible group-hover/badge:opacity-100 group-hover/badge:visible transition-all duration-200 z-[100] backdrop-blur-sm pointer-events-none">
                    {tooltip}
                    <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 border-4 border-transparent border-t-slate-900/90"></div>
                </div>
            )}
        </div>
    );
};

const PatientCard: React.FC<{
    patient: PreOpPatient;
    minimal?: boolean;
    userRole?: string;
    currentUser?: any;
    highlight?: 'MAT' | 'EXAM' | 'QX';
    isSuspended?: boolean;
    artSet?: Set<string>;
    onCancel?: (patient: PreOpPatient) => void;
}> = ({ patient, minimal = false, userRole, currentUser, highlight, isSuspended, artSet, onCancel }) => {
    const navigate = useNavigate();
    const today = localTodayStr();

    const isOser = isOserCategory(patient.medicalCoverage);
    const isOserMaterialPending = isOser && patient.requiresMaterial && patient.materialStatus !== 'OK';
    const isEmergOrUrgent = patient.priority === 'Alta' || patient.priority === 'Urgente';

    // Detección ART
    const isART = isArtCoverage(patient.medicalCoverage, artSet);

    // Días transcurridos desde created_at en hora local (Buenos Aires)
    let artDaysElapsed = 0;
    if (isART && patient.createdAtRaw) {
        const createdLocal = new Intl.DateTimeFormat('en-CA', {
            timeZone: 'America/Argentina/Buenos_Aires',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        }).format(new Date(patient.createdAtRaw));
        artDaysElapsed = Math.max(0, getDaysDiffFromDates(createdLocal, today));
    }

    // Cálculos de fecha autorizada de internación
    let authDiffDays: number | null = null;
    if (patient.authorizationDate) {
        authDiffDays = getDaysDiffFromDates(today, patient.authorizationDate);
    }

    // Información de suspensión
    let suspendedDaysAgo: number | null = null;
    if (isSuspended && patient.suspendedAt) {
        const suspLocal = new Intl.DateTimeFormat('en-CA', {
            timeZone: 'America/Argentina/Buenos_Aires',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        }).format(new Date(patient.suspendedAt));
        suspendedDaysAgo = Math.max(0, getDaysDiffFromDates(suspLocal, today));
    }

    return (
        <div
            onClick={() => navigate(`/detail/${patient.id}`, { state: { from: '/kanban' } })}
            className={`group rounded-xl border shadow-sm hover:shadow-md transition-all p-4 cursor-pointer relative ${
                isOserMaterialPending
                    ? 'bg-amber-50/90 border-amber-300 hover:border-amber-400'
                    : 'bg-white border-slate-200 hover:border-primary/30'
            }`}
        >
            {/* Borde lateral izquierdo: Urgente/Alta tiene prioridad estricta sobre el naranja de OSER */}
            <div
                className={`absolute left-0 top-0 bottom-0 w-1 rounded-l-xl ${
                    isEmergOrUrgent
                        ? 'bg-red-500'
                        : isOserMaterialPending
                            ? 'bg-amber-500'
                            : 'bg-blue-500'
                }`}
            ></div>

            <div className="flex justify-between items-start mb-2 pl-3">
                <div className="pr-14">
                    <h4 className="font-bold text-slate-900 group-hover:text-primary transition-colors leading-tight">
                        {toTitleCase(patient.name)}
                    </h4>
                    <p className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
                        <span className="font-mono">{patient.patientDocument}</span>
                        <span>•</span>
                        <span>{patient.age} años</span>
                    </p>
                </div>

                {/* Right Badges Container */}
                <div className="absolute top-2 right-2 flex flex-col items-end gap-1 z-10">
                    {/* Badge de Emergencia con estado real de material */}
                    {patient.priority === 'Alta' && (
                        patient.requiresMaterial && patient.materialStatus !== 'OK' ? (
                            <div className="bg-red-600 text-white text-[8px] font-black px-1.5 py-0.5 rounded shadow-sm uppercase tracking-wider border border-red-700 animate-pulse flex items-center gap-0.5">
                                <span className="material-symbols-outlined text-[10px]">warning</span>
                                Emergencia · material sin validar
                            </div>
                        ) : (
                            <div className="bg-emerald-600 text-white text-[8px] font-black px-1.5 py-0.5 rounded shadow-sm uppercase tracking-wider border border-emerald-700 flex items-center gap-0.5">
                                <span className="material-symbols-outlined text-[10px]">check</span>
                                Emergencia · material OK
                            </div>
                        )
                    )}

                    {patient.priority === 'Urgente' && (
                        <span className="bg-red-50 text-red-600 text-[9px] font-bold px-1.5 py-0.5 rounded border border-red-100 uppercase">
                            Urgente
                        </span>
                    )}

                    {/* Badge ART (sin fecha de cirugía) */}
                    {isART && !patient.surgeryDate && (
                        artDaysElapsed >= 7 ? (
                            <div className="bg-rose-600 text-white text-[8px] font-black px-1.5 py-0.5 rounded shadow-sm uppercase tracking-wider animate-pulse flex items-center gap-0.5 border border-rose-700">
                                <span className="material-symbols-outlined text-[10px]">alarm</span>
                                ART vencida hace {artDaysElapsed - 6} {artDaysElapsed - 6 === 1 ? 'día' : 'días'}
                            </div>
                        ) : artDaysElapsed === 6 ? (
                            <div className="bg-rose-600 text-white text-[8px] font-black px-1.5 py-0.5 rounded shadow-sm uppercase tracking-wider border border-rose-700 flex items-center gap-0.5">
                                <span className="material-symbols-outlined text-[10px]">schedule</span>
                                ART · día 6 de 6
                            </div>
                        ) : artDaysElapsed >= 4 ? (
                            <div className="bg-amber-500 text-white text-[8px] font-black px-1.5 py-0.5 rounded shadow-sm uppercase tracking-wider border border-amber-600 flex items-center gap-0.5">
                                <span className="material-symbols-outlined text-[10px]">schedule</span>
                                ART · día {artDaysElapsed} de 6
                            </div>
                        ) : (
                            <div className="bg-emerald-600 text-white text-[8px] font-black px-1.5 py-0.5 rounded shadow-sm uppercase tracking-wider border border-emerald-700 flex items-center gap-0.5">
                                <span className="material-symbols-outlined text-[10px]">verified</span>
                                ART · día {artDaysElapsed} de 6
                            </div>
                        )
                    )}

                    {/* Badge Fecha autorizada de internación */}
                    {patient.authorizationDate && authDiffDays !== null && (
                        <div className="bg-emerald-50 text-emerald-800 text-[8px] font-bold px-1.5 py-0.5 rounded border border-emerald-200 uppercase tracking-tighter">
                            Internación: {formatDisplayDate(patient.authorizationDate)}
                            {authDiffDays === 0 ? ' (hoy)' : (authDiffDays > 0 ? ` (en ${authDiffDays} ${authDiffDays === 1 ? 'día' : 'días'})` : '')}
                        </div>
                    )}

                    {/* Badge de Alerta: Material pendiente e internación cercana/vencida */}
                    {patient.requiresMaterial && patient.materialStatus !== 'OK' && patient.authorizationDate && authDiffDays !== null && (
                        authDiffDays < 0 ? (
                            <div className="bg-rose-600 text-white text-[8px] font-black px-1.5 py-0.5 rounded shadow-sm uppercase tracking-wider flex items-center gap-1 animate-pulse border border-rose-700" title={`Fecha autorizada de internación: ${formatDisplayDate(patient.authorizationDate, true)}`}>
                                <span className="material-symbols-outlined text-[10px]">warning</span>
                                <span>Internación vencida hace {Math.abs(authDiffDays)} {Math.abs(authDiffDays) === 1 ? 'día' : 'días'} · material pendiente</span>
                            </div>
                        ) : authDiffDays <= 2 ? (
                            <div className="bg-rose-600 text-white text-[8px] font-black px-1.5 py-0.5 rounded shadow-sm uppercase tracking-wider flex items-center gap-1 animate-pulse border border-rose-700" title={`Fecha autorizada de internación: ${formatDisplayDate(patient.authorizationDate, true)}`}>
                                <span className="material-symbols-outlined text-[10px]">warning</span>
                                <span>{authDiffDays === 0 ? 'Internación hoy' : `Internación en ${authDiffDays} ${authDiffDays === 1 ? 'día' : 'días'}`} · material pendiente</span>
                            </div>
                        ) : authDiffDays <= 7 ? (
                            <div className="bg-amber-600 text-white text-[8px] font-black px-1.5 py-0.5 rounded shadow-sm uppercase tracking-wider flex items-center gap-1 border border-amber-700" title={`Fecha autorizada de internación: ${formatDisplayDate(patient.authorizationDate, true)}`}>
                                <span className="material-symbols-outlined text-[10px]">hourglass_top</span>
                                <span>Internación en {authDiffDays} días · material pendiente</span>
                            </div>
                        ) : null
                    )}

                    {/* Días esperando ortopedia (para rol Ortopedia / SuperAdmin en OSER/Capital) */}
                    {(userRole === 'SuperAdmin' || userRole === 'Ortopedia') && (isOser || patient.vendorName?.toLowerCase().includes('capital')) && patient.requiresMaterial && patient.materialStatus !== 'OK' && (
                        <div className="bg-purple-600 text-white text-[8px] font-black px-1.5 py-0.5 rounded shadow-sm uppercase tracking-wider flex items-center gap-0.5 border border-purple-700">
                            <span className="material-symbols-outlined text-[10px]">hourglass_top</span>
                            <span>Esperando ortopedia: {patient.daysWaiting ?? 0} {patient.daysWaiting === 1 ? 'día' : 'días'}</span>
                        </div>
                    )}

                    {isSuspended && (
                        <div className="flex flex-col items-end">
                            <span className="bg-amber-500 text-white text-[8px] font-black px-1.5 py-0.5 rounded shadow-sm uppercase tracking-tighter">
                                Suspendida
                            </span>
                            {suspendedDaysAgo !== null && (
                                <span className="text-[8px] text-amber-700 font-bold mt-0.5">
                                    hace {suspendedDaysAgo} {suspendedDaysAgo === 1 ? 'día' : 'días'}
                                </span>
                            )}
                        </div>
                    )}

                    {!patient.surgeryDate && !isSuspended && (
                        <div className="bg-slate-800 text-white text-[8px] font-black px-1.5 py-0.5 rounded shadow-sm uppercase tracking-wide">
                            Sin Fecha
                        </div>
                    )}

                    {patient.oserStatus === 'CERRADA' && (
                        <div className="bg-red-500 text-white text-[8px] font-black px-1.5 py-0.5 rounded shadow-sm uppercase tracking-wider animate-pulse flex items-center gap-0.5 border border-red-600">
                            <span className="material-symbols-outlined text-[10px] font-black">lock</span>
                            Cerrada OSER
                        </div>
                    )}

                    {patient.suspensionRequested && (
                        <div className="bg-amber-100 text-amber-700 text-[8px] font-bold px-1.5 py-0.5 rounded border border-amber-200 uppercase tracking-tighter animate-pulse flex items-center gap-1">
                            <span className="material-symbols-outlined text-[10px]">report_problem</span>
                            Suspensión Solicitada
                        </div>
                    )}

                    {patient.rescheduleRequested && (
                        <div className="bg-indigo-100 text-indigo-700 text-[8px] font-bold px-1.5 py-0.5 rounded border border-indigo-200 uppercase tracking-tighter animate-pulse flex items-center gap-1">
                            <span className="material-symbols-outlined text-[10px]">event_repeat</span>
                            Reprogramación Solicitada
                        </div>
                    )}
                </div>
            </div>

            <div className="pl-3 grid grid-cols-2 gap-y-2 gap-x-4 mb-4">
                <div className="text-xs text-slate-600 flex items-center gap-1.5 min-w-0">
                    <span className="material-symbols-outlined text-sm text-slate-400">person</span>
                    <span className="truncate">{patient.doctor}</span>
                </div>
                <div className="text-xs text-slate-600 flex items-center gap-1.5 min-w-0">
                    <span className="material-symbols-outlined text-sm text-slate-400">medical_information</span>
                    <span className="truncate">{patient.proc}</span>
                </div>
                {patient.medicalCoverage && (
                    <div className="text-xs text-slate-700 font-medium flex items-center gap-1.5 min-w-0 col-span-2">
                        <span className="material-symbols-outlined text-sm text-slate-400">health_and_safety</span>
                        <span className="truncate bg-slate-100 text-slate-800 text-[10px] font-bold px-2 py-0.5 rounded border border-slate-200 uppercase tracking-tight">
                            {patient.medicalCoverage}
                        </span>
                    </div>
                )}
                {patient.surgeryDate && (
                    <div className="text-xs text-slate-600 flex items-center gap-1.5 min-w-0">
                        <span className="material-symbols-outlined text-sm text-slate-400">calendar_today</span>
                        <span className="truncate">
                            {formatDisplayDate(patient.surgeryDate)} {patient.startTime}
                        </span>
                    </div>
                )}
                {patient.orName && (
                    <div className="text-xs text-slate-600 flex items-center gap-1.5 min-w-0">
                        <span className="material-symbols-outlined text-sm text-slate-400">meeting_room</span>
                        <span className="truncate">{patient.orName}</span>
                    </div>
                )}
            </div>

            {/* Status Indicators Row */}
            {!minimal && (
                <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                        <StatusBadge type="MAT" status={patient.materialStatus} highlight={highlight === 'MAT'} tooltip={patient.materialTooltip} />
                        <StatusBadge type="EXAM" status={patient.clinicalStatus} highlight={highlight === 'EXAM'} tooltip={patient.clinicalTooltip} />
                        <StatusBadge type="QX" status={patient.adminStatus} highlight={highlight === 'QX'} tooltip={patient.adminTooltip} />
                    </div>

                    <button
                        type="button"
                        onClick={(e) => {
                            e.stopPropagation();
                            navigate('/prequirurgicos', { state: { patientName: patient.name } });
                        }}
                        className="p-1 rounded-lg hover:bg-blue-50 text-slate-400 hover:text-blue-600 transition-colors"
                        title="Buscar y descargar Prequirúrgicos (Lab y ECG)"
                    >
                        <span className="material-symbols-outlined text-base">assignment_turned_in</span>
                    </button>
                </div>
            )}

            {/* QUICK ACTIONS for Suspended (Integrated) */}
            {isSuspended && (userRole === 'SuperAdmin' || userRole === 'Tecnico' || userRole === 'Internacion') && (
                <div className="pl-3 mt-4 pt-4 border-t border-slate-100 flex gap-2">
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            // Navegar directamente a la ficha clínica para reprogramación
                            navigate(`/detail/${patient.id}`, { state: { from: '/kanban' } });
                        }}
                        className="flex-1 bg-blue-600 hover:bg-blue-700 text-white text-[10px] font-black py-2 rounded-lg flex items-center justify-center gap-1.5 uppercase transition-colors"
                        title="Reprogramar fecha y horario en Ficha Clínica"
                    >
                        <span className="material-symbols-outlined text-sm font-bold">event_repeat</span>
                        Reprogramar
                    </button>
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            if (onCancel) onCancel(patient);
                        }}
                        className="px-3 bg-red-50 hover:bg-red-100 text-red-600 py-2 rounded-lg flex items-center justify-center transition-colors border border-red-100"
                        title="Baja Definitiva (No se operará)"
                    >
                        <span className="material-symbols-outlined text-sm font-bold">person_remove</span>
                    </button>
                </div>
            )}

            {/* QUICK ACTIONS for Scheduled/Unscheduled */}
            {!isSuspended && !patient.surgeryDate && (userRole === 'Tecnico' || userRole === 'SuperAdmin') && (
                <div className="pl-3 mt-4 pt-4 border-t border-slate-100">
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/detail/${patient.id}`, { state: { from: '/kanban' } });
                        }}
                        className="w-full bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-[10px] font-black uppercase py-2 rounded-lg flex items-center justify-center gap-2 transition-all border border-indigo-100"
                    >
                        <span className="material-symbols-outlined text-sm">calendar_month</span>
                        Agendar Cirugía
                    </button>
                </div>
            )}

            {/* Hover Action Link */}
            <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
                <button className="text-slate-400 hover:text-primary">
                    <span className="material-symbols-outlined text-xl">open_in_new</span>
                </button>
            </div>
        </div>
    );
};

// Cache en memoria a nivel módulo para navegación instantánea (0 ms)
let kanbanCache: {
    patients: PreOpPatient[];
    roleKey: string;
    timestamp: number;
} | null = null;

const Kanban: React.FC = () => {
    const navigate = useNavigate();
    const { user } = useAuth();

    useEffect(() => {
        if (user && user.role === 'Administrativo de Guardias') {
            navigate('/');
        }
    }, [user, navigate]);

    const [patients, setPatients] = useState<PreOpPatient[]>(kanbanCache ? kanbanCache.patients : []);
    const [loading, setLoading] = useState(!kanbanCache && patients.length === 0);
    const [refreshing, setRefreshing] = useState(false);
    const [filterText, setFilterText] = useState('');

    // Filtros Rápidos (Chips debajo del buscador)
    const [filterMissingMat, setFilterMissingMat] = useState(false);
    const [filterMissingExams, setFilterMissingExams] = useState(false);
    const [filterMissingOR, setFilterMissingOR] = useState(false);
    const [filterWithin7Days, setFilterWithin7Days] = useState(false);

    // Filtro adicional de la pestaña Pendientes Ortopedia
    const [pendingOrthoFilterWithin7Days, setPendingOrthoFilterWithin7Days] = useState(false);

    // Map de coberturas tipo ART desde DB
    const [artCoveragesSet, setArtCoveragesSet] = useState<Set<string>>(new Set());

    // Métricas históricas de ortopedia (últimos 12 meses, incluyendo completed)
    const [historicalOrthoStats, setHistoricalOrthoStats] = useState<{
        avgDays: number | null;
        pctBeforeAuth: number | null;
        totalCases: number;
    }>({
        avgDays: null,
        pctBeforeAuth: null,
        totalCases: 0
    });

    // Lista de instrumentadoras / técnicos para selector de cierre rápido
    const [collaboratorsList, setCollaboratorsList] = useState<string[]>([]);

    // KPI Summary visibility
    const [showKPIs, setShowKPIs] = useState<boolean>(() => {
        const saved = localStorage.getItem('kanban_show_kpi_summary');
        return saved !== null ? JSON.parse(saved) : true;
    });

    const toggleKPIs = () => {
        setShowKPIs(prev => {
            const newState = !prev;
            localStorage.setItem('kanban_show_kpi_summary', JSON.stringify(newState));
            return newState;
        });
    };

    // Collapsed Sections with LocalStorage Persistence
    const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>(() => {
        const saved = localStorage.getItem('kanban_collapsed_sections');
        return saved ? JSON.parse(saved) : {
            oser_pending_material: false,
            oser_approved_material: false,
            other_authorized: false,
            unscheduled: false,
            art_particular: false,
            ready: false,
            scheduled: false
        };
    });

    const toggleSection = (section: string) => {
        setCollapsedSections(prev => {
            const newState = { ...prev, [section]: !prev[section] };
            localStorage.setItem('kanban_collapsed_sections', JSON.stringify(newState));
            return newState;
        });
    };

    // Carga de Coberturas ART
    const fetchCoverages = async () => {
        try {
            const { data, error } = await supabase.from('coverages').select('name, type');
            if (error) throw error;
            const newArtSet = new Set<string>();
            (data || []).forEach((c: any) => {
                if (c.type === 'ART' && c.name) {
                    newArtSet.add(c.name.trim().toUpperCase());
                }
            });
            setArtCoveragesSet(newArtSet);
        } catch (e) {
            console.error('Error fetching coverages in Kanban:', e);
        }
    };

    // Carga de Técnicos e Instrumentadoras
    const fetchCollaborators = async () => {
        try {
            const { data } = await supabase
                .from('users')
                .select('name, role')
                .in('role', ['Tecnico', 'Instrumentadora', 'JefaturaDeQuirofano', 'Quirofano'])
                .order('name');
            if (data) {
                setCollaboratorsList(data.map((u: any) => u.name).filter(Boolean));
            }
        } catch (e) {
            console.error('Error fetching collaborators:', e);
        }
    };

    // Carga de Métricas Históricas de Ortopedia (últimos 12 meses con status 'completed' y material requerido)
    const fetchHistoricalOrthoMetrics = async () => {
        try {
            const twelveMonthsAgo = new Date();
            twelveMonthsAgo.setFullYear(twelveMonthsAgo.getFullYear() - 1);
            const twelveMonthsAgoStr = twelveMonthsAgo.toISOString();

            // Paginación con .range() para superar el límite de 1000 filas de Supabase
            let allRows: any[] = [];
            let from = 0;
            const pageSize = 1000;
            let hasMore = true;

            while (hasMore) {
                const { data, error } = await supabase
                    .from('surgeries')
                    .select(`
                        id,
                        status,
                        created_at,
                        ortho_validated,
                        ortho_validation_date,
                        authorization_date,
                        requires_prosthesis,
                        medical_coverage,
                        vendor_id,
                        vendors!vendor_id (name),
                        surgery_materials (id)
                    `)
                    .gte('created_at', twelveMonthsAgoStr)
                    .not('ortho_validation_date', 'is', null)
                    .range(from, from + pageSize - 1);

                if (error) throw error;
                if (data && data.length > 0) {
                    allRows = allRows.concat(data);
                    if (data.length < pageSize) {
                        hasMore = false;
                    } else {
                        from += pageSize;
                    }
                } else {
                    hasMore = false;
                }
            }

            // Filtrar:
            // 1) Requieren material: requires_prosthesis === true || (surgery_materials && surgery_materials.length > 0)
            // 2) Proveedor Capital o cobertura OSER
            const relevant = allRows.filter((s: any) => {
                const reqMat = Boolean(s.requires_prosthesis || (s.surgery_materials && s.surgery_materials.length > 0));
                if (!reqMat) return false;

                const vName = (Array.isArray(s.vendors) ? s.vendors[0]?.name : s.vendors?.name) || '';
                const isCapital = vName.toLowerCase().includes('capital');
                const isOser = isOserCategory(s.medical_coverage);
                return isCapital || isOser;
            });

            // Promedio de días entre created_at y ortho_validation_date
            const diffDaysList = relevant.map((s: any) => {
                if (!s.created_at || !s.ortho_validation_date) return null;
                const createdLocal = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(s.created_at));
                const orthoLocal = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(s.ortho_validation_date));
                return Math.max(0, getDaysDiffFromDates(createdLocal, orthoLocal));
            }).filter((d: any): d is number => d !== null);

            const avgDays = diffDaysList.length > 0
                ? Math.round(diffDaysList.reduce((acc, d) => acc + d, 0) / diffDaysList.length)
                : null;

            // % validadas antes de la fecha de internación (ortho_validation_date <= authorization_date)
            const withBothDates = relevant.filter((s: any) => s.ortho_validation_date && s.authorization_date);
            let pctBeforeAuth: number | null = null;
            if (withBothDates.length > 0) {
                const validatedBefore = withBothDates.filter((s: any) => {
                    const authClean = s.authorization_date.split('T')[0];
                    const orthoLocal = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(s.ortho_validation_date));
                    return orthoLocal <= authClean;
                });
                pctBeforeAuth = Math.round((validatedBefore.length / withBothDates.length) * 100);
            }

            setHistoricalOrthoStats({ avgDays, pctBeforeAuth, totalCases: relevant.length });
        } catch (e) {
            console.error('Error fetching historical ortho metrics:', e);
        }
    };

    const fetchPendingSurgeries = async (forceRefresh = false) => {
        const roleKey = `${user?.role}_${user?.doctorId}_${user?.vendorId}`;
        const nowTs = Date.now();

        if (!forceRefresh && kanbanCache && kanbanCache.roleKey === roleKey && (nowTs - kanbanCache.timestamp < 15000)) {
            setPatients(kanbanCache.patients);
            setLoading(false);
            setRefreshing(false);
            return;
        }

        // REGLA: setLoading(true) SOLO si todavía no hay datos; recargas forzadas son silenciosas para evitar parpadeo y pérdida de scroll
        if (patients.length === 0 && !kanbanCache) {
            setLoading(true);
        } else {
            setRefreshing(true);
        }

        try {
            let query = supabase
                .from('surgeries')
                .select(`
                    id,
                    status,
                    procedure_name,
                    priority,
                    surgery_date,
                    start_time,
                    actual_start_time,
                    actual_end_time,
                    authorization_date, 
                    ortho_validated,
                    ortho_validation_date,
                    admission_validated,
                    or_validated,
                    requires_prosthesis,
                    pre_op_exams,
                    consent_signed,
                    or_validation_date,
                    or_validated_by_name,
                    created_at,
                    vendor_id,
                    medical_coverage,
                    suspension_requested,
                    reschedule_requested,
                    is_ambulatory,
                    oser_status,
                    suspension_reason,
                    suspension_observations,
                    suspended_at,
                    suspended_by_name,
                    patients (full_name, document_number, birth_date),
                    doctors!doctor_id (full_name),
                    operating_rooms!operating_room_id (name, is_ambulatory),
                    vendors!vendor_id (name),
                    surgery_materials (id)
                `);

            if (user?.role === 'Ortopedia' && user.vendorId && !user.can_view_all_vendors) {
                query = query.eq('vendor_id', user.vendorId);
            }

            // Traemos cirugías activas, suspendidas y canceladas
            query = query.or('status.eq.scheduled,status.eq.pending_validation,status.eq.waiting_date,status.eq.suspended,status.eq.cancelled');

            if (user?.role === 'Medico' && user.doctorId) {
                query = query.eq('doctor_id', user.doctorId);
            }

            const { data, error } = await query
                .order('surgery_date', { ascending: true })
                .order('start_time', { ascending: true })
                .order('created_at', { ascending: false });

            if (error) throw error;

            // Deduplicación estricta por ID
            const uniqueData = Array.from(new Map((data || []).map((item: any) => [item.id, item])).values());
            const today = localTodayStr();

            const mapped: PreOpPatient[] = uniqueData.map((s: any) => {
                const patient = Array.isArray(s.patients) ? s.patients[0] : s.patients;
                const doctor = Array.isArray(s.doctors) ? s.doctors[0] : s.doctors;
                const orGroup = Array.isArray(s.operating_rooms) ? s.operating_rooms[0] : s.operating_rooms;
                const vendorObj = Array.isArray(s.vendors) ? s.vendors[0] : s.vendors;

                const age = calculateRealAge(patient?.birth_date);

                const mapPriority = (p: string): 'Normal' | 'Urgente' | 'Alta' => {
                    if (p === 'urgent') return 'Urgente';
                    if (p === 'emergency') return 'Alta';
                    return 'Normal';
                };

                const mapStatus = (val: any, isRequired: boolean = true): 'OK' | 'Pending' | 'Missing' => {
                    if (!isRequired) return 'OK';
                    if (val === true || val === 'OK') return 'OK';
                    if (val === false || val === 'Missing') return 'Missing';
                    return 'Pending';
                };

                // REGLA 6.7: Las emergencias calculan el estado del material igual que cualquier cirugía (no se fuerza 'OK')
                const requiresMat = Boolean(s.requires_prosthesis || (s.surgery_materials && s.surgery_materials.length > 0));
                const matStatus = mapStatus(s.ortho_validated, requiresMat);
                const materialTooltip = matStatus === 'OK' ? 'Materiales validados / No requiere prótesis' :
                    (requiresMat ? 'Falta validación de materiales por Ortopedia' : 'Sin materiales cargados para esta cirugía');

                const isAmbulatorySurgery = !!s.is_ambulatory || !!orGroup?.is_ambulatory;
                const clinStatus = isAmbulatorySurgery ? 'OK' : mapStatus(s.admission_validated);
                const clinicalTooltip = isAmbulatorySurgery
                    ? 'Cirugía Ambulatoria (No requiere prequirúrgicos, consentimiento ni Cama/ART)'
                    : (clinStatus === 'OK' ? 'Validación clínica completada' :
                        (!s.pre_op_exams && !s.consent_signed ? 'Faltan exámenes pre-quirúrgicos y consentimiento firmado' :
                            (!s.pre_op_exams ? 'Faltan cargar/validar exámenes pre-quirúrgicos' :
                                (!s.consent_signed ? 'Falta firma de consentimiento informado' : 'Falta validación final de Internación'))));

                const admStatus = (mapStatus(s.or_validated) === 'OK' ? 'OK' : 'Pending') as 'OK' | 'Pending';
                const adminTooltip = admStatus === 'OK' ? 'Quirófano y horario confirmados' : 'Falta asignar quirófano o programar horario final';

                const hasAuth = Boolean(s.authorization_date);

                // Días corridos desde la creación/ingreso de la cirugía en hora local
                let daysWaitingFromCreation = 0;
                if (s.created_at) {
                    const createdLocal = new Intl.DateTimeFormat('en-CA', {
                        timeZone: 'America/Argentina/Buenos_Aires',
                        year: 'numeric',
                        month: '2-digit',
                        day: '2-digit'
                    }).format(new Date(s.created_at));
                    daysWaitingFromCreation = Math.max(0, getDaysDiffFromDates(createdLocal, today));
                }

                // Días respecto a la fecha autorizada de internación (positivo = futura, negativo = pasada)
                let daysSinceAuth: number | null = null;
                if (hasAuth && s.authorization_date) {
                    daysSinceAuth = getDaysDiffFromDates(today, s.authorization_date);
                }

                return {
                    id: s.id,
                    patientDocument: patient?.document_number || 'N/A',
                    name: patient?.full_name || 'Desconocido',
                    age,
                    doctor: doctor?.full_name || 'No asignado',
                    proc: s.procedure_name || 'Sin nombre',
                    priority: mapPriority(s.priority),
                    materialStatus: matStatus,
                    clinicalStatus: clinStatus,
                    adminStatus: admStatus,
                    materialTooltip,
                    clinicalTooltip,
                    adminTooltip,
                    createdAtRaw: s.created_at,
                    daysWaiting: daysWaitingFromCreation,
                    daysWaitingFromCreation,
                    daysSinceAuth,
                    orthoValidationDate: s.ortho_validation_date,
                    hasAuthorization: hasAuth,
                    dateAdded: formatDisplayDate(s.created_at),
                    lastUpdate: formatDisplayDate(s.created_at),
                    status: s.status || 'pending_validation',
                    surgeryDate: s.surgery_date,
                    startTime: s.start_time?.substring(0, 5),
                    actualStartTime: s.actual_start_time,
                    actualEndTime: s.actual_end_time,
                    orName: orGroup?.name,
                    authorizationDate: s.authorization_date,
                    vendorId: s.vendor_id,
                    vendorName: vendorObj?.name || '',
                    medicalCoverage: s.medical_coverage || '',
                    requiresMaterial: requiresMat,
                    suspensionRequested: s.suspension_requested,
                    rescheduleRequested: s.reschedule_requested,
                    oserStatus: s.oser_status,
                    suspensionReason: s.suspension_reason,
                    suspensionObservations: s.suspension_observations,
                    suspendedAt: s.suspended_at,
                    suspendedByName: s.suspended_by_name
                };
            });

            setPatients(mapped);
            kanbanCache = {
                patients: mapped,
                roleKey,
                timestamp: Date.now()
            };
        } catch (err) {
            console.error('Error fetching Kanban data:', err);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    // Subscripción en tiempo real con debounce de 1s y forceRefresh=true
    useEffect(() => {
        fetchPendingSurgeries();
        fetchCoverages();
        fetchCollaborators();
        fetchHistoricalOrthoMetrics();

        let debounceTimer: any = null;
        const channel = supabase
            .channel('kanban-realtime-changes')
            .on(
                'postgres_changes',
                { event: '*', schema: 'quirofano', table: 'surgeries' },
                () => {
                    if (debounceTimer) clearTimeout(debounceTimer);
                    debounceTimer = setTimeout(() => {
                        fetchPendingSurgeries(true);
                    }, 1000);
                }
            )
            .subscribe();

        // Carga de métricas históricas de ortopedia al montar y como máximo cada 10 minutos (no en realtime)
        const orthoInterval = setInterval(() => {
            fetchHistoricalOrthoMetrics();
        }, 10 * 60 * 1000);

        return () => {
            if (debounceTimer) clearTimeout(debounceTimer);
            clearInterval(orthoInterval);
            supabase.removeChannel(channel);
        };
    }, [user]);

    // Búsqueda integral: nombre, DNI, cirujano, procedimiento y cobertura
    const term = filterText.toLowerCase().trim();
    const filteredPatients = patients.filter(p => {
        if (!term) return true;
        return (
            p.name.toLowerCase().includes(term) ||
            p.patientDocument.toLowerCase().includes(term) ||
            p.doctor.toLowerCase().includes(term) ||
            p.proc.toLowerCase().includes(term) ||
            p.medicalCoverage?.toLowerCase().includes(term)
        );
    });

    const todayStr = localTodayStr();
    const todayPlus7Str = (() => {
        const d = new Date();
        d.setDate(d.getDate() + 7);
        return new Intl.DateTimeFormat('en-CA', {
            timeZone: 'America/Argentina/Buenos_Aires',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        }).format(d);
    })();

    // Comparadores de Ordenamiento
    const sortByDateAsc = (a: PreOpPatient, b: PreOpPatient) => {
        const tA = a.createdAtRaw ? new Date(a.createdAtRaw).getTime() : 0;
        const tB = b.createdAtRaw ? new Date(b.createdAtRaw).getTime() : 0;
        return tA - tB;
    };

    const sortPriorityAndDate = (a: PreOpPatient, b: PreOpPatient) => {
        const getScore = (p: PreOpPatient) => {
            const hasAuth = Boolean(p.authorizationDate);
            const matOk = p.materialStatus === 'OK' || !p.requiresMaterial;
            if (hasAuth && matOk) return 1;
            if (hasAuth && !matOk) return 2;
            return 3;
        };
        const sA = getScore(a);
        const sB = getScore(b);
        if (sA !== sB) return sA - sB;
        return sortByDateAsc(a, b);
    };

    const sortArtAndParticular = (a: PreOpPatient, b: PreOpPatient) => {
        const isArtA = isArtCoverage(a.medicalCoverage, artCoveragesSet);
        const isArtB = isArtCoverage(b.medicalCoverage, artCoveragesSet);

        // ART primero, Particulares después
        if (isArtA && !isArtB) return -1;
        if (!isArtA && isArtB) return 1;

        if (isArtA && isArtB) {
            // ART por días restantes (las más cerca de vencer arriba -> mayor días transcurridos primero)
            const daysA = a.createdAtRaw ? getDaysDiffFromDates(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(a.createdAtRaw)), todayStr) : 0;
            const daysB = b.createdAtRaw ? getDaysDiffFromDates(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(b.createdAtRaw)), todayStr) : 0;
            if (daysA !== daysB) return daysB - daysA; // Mayor demora arriba
            return sortByDateAsc(a, b);
        }

        // Particulares por created_at ascendente
        return sortByDateAsc(a, b);
    };

    // Helper para verificar filtros rápidos (chips)
    const matchesChips = (p: PreOpPatient): boolean => {
        if (filterMissingMat && !(p.requiresMaterial && p.materialStatus !== 'OK')) return false;
        if (filterMissingExams && p.clinicalStatus === 'OK') return false;
        if (filterMissingOR && p.adminStatus === 'OK') return false;
        if (filterWithin7Days && !(p.surgeryDate && p.surgeryDate >= todayStr && p.surgeryDate <= todayPlus7Str)) return false;
        return true;
    };

    // --- UNIVERSO DE ACTIVAS Y EXCLUSIÓN DE PASADAS ---
    // Las de fecha pasada sin cerrar quedan ÚNICAMENTE en la pestaña "Pasadas sin cerrar"
    const activeNonPast = filteredPatients.filter(p =>
        p.status !== 'suspended' &&
        p.status !== 'cancelled' &&
        p.status !== 'completed' &&
        !(p.surgeryDate && p.surgeryDate < todayStr)
    );

    // Total de cirugías activas que no son pasadas
    const totalActivosCount = activeNonPast.length;

    // --- SECCIONES EXCLUYENTES DE ETAPA (VISTA FLUJO) ---
    // g. Con fecha asignada: SOLO surgery_date >= hoy (hora local)
    const stageG_Scheduled = activeNonPast
        .filter(p => Boolean(p.surgeryDate) && p.surgeryDate! >= todayStr)
        .sort(byUrgencyThen((a, b) => {
            const dA = new Date(`${a.surgeryDate}T${a.startTime || '00:00'}:00`).getTime() || 0;
            const dB = new Date(`${b.surgeryDate}T${b.startTime || '00:00'}:00`).getTime() || 0;
            return dA - dB;
        }));

    // Las que no tienen fecha asignada se dividen en f, a, b, c, d, e:
    const unscheduledActive = activeNonPast.filter(p => !p.surgeryDate);

    // f. Listas para programar: sin fecha y con material, clínico y quirófano OK (con o sin autorización).
    // Excepción: emergencia con material pendiente y clínico + quirófano OK también entra acá.
    const stageF_Ready = unscheduledActive
        .filter(p => isReadyForScheduling(p))
        .sort(byUrgencyThen(sortByDateAsc));

    // Las restantes unscheduled que NO están listas para programar van a e, a, b, c, d:
    const unscheduledNotReady = unscheduledActive.filter(p => !isReadyForScheduling(p));

    // e. ART y Particulares sin fecha
    const stageE_ArtParticular = unscheduledNotReady
        .filter(p => isArtOrParticularCategory(p.medicalCoverage, artCoveragesSet))
        .sort(byUrgencyThen(sortArtAndParticular));

    // Las restantes tienen OSER o prepagas (no ART ni Particular)
    const standardUnscheduledNotReady = unscheduledNotReady.filter(p => !isArtOrParticularCategory(p.medicalCoverage, artCoveragesSet));

    // a. OSER sin aprobar material (con autorización de internación, requiere material y pendiente)
    const stageA_OserPendingMat = standardUnscheduledNotReady
        .filter(p => Boolean(p.authorizationDate) && isOserCategory(p.medicalCoverage) && p.requiresMaterial && p.materialStatus !== 'OK')
        .sort(byUrgencyThen(sortByDateAsc));

    // b. OSER material aprobado (Capital) (con autorización de internación, material OK o no requiere, proveedor Capital)
    const stageB_OserApprovedCapital = standardUnscheduledNotReady
        .filter(p => Boolean(p.authorizationDate) && isOserCategory(p.medicalCoverage) && (p.materialStatus === 'OK' || !p.requiresMaterial) && (p.vendorName?.toLowerCase().includes('capital') ?? false))
        .sort(byUrgencyThen(sortByDateAsc));

    // c. Otras coberturas con internación autorizada sin fecha (Otras obras sociales / prepagas autorizadas, u OSER con otro proveedor)
    const stageC_OtherAuthorized = standardUnscheduledNotReady
        .filter(p => {
            if (!p.authorizationDate) return false;
            // No pertenece a 'a' ni a 'b'
            const isOserPending = isOserCategory(p.medicalCoverage) && p.requiresMaterial && p.materialStatus !== 'OK';
            const isOserAppCapital = isOserCategory(p.medicalCoverage) && (p.materialStatus === 'OK' || !p.requiresMaterial) && (p.vendorName?.toLowerCase().includes('capital') ?? false);
            return !isOserPending && !isOserAppCapital;
        })
        .sort(byUrgencyThen(sortByDateAsc));

    // d. Sin autorización de internación (sin fecha, sin authorization_date, no ART ni Particular)
    const stageD_NoAuth = standardUnscheduledNotReady
        .filter(p => !p.authorizationDate)
        .sort(byUrgencyThen(sortByDateAsc));

    // Verificación de partición estricta en desarrollo
    if (process.env.NODE_ENV !== 'production') {
        const sumPartition = stageA_OserPendingMat.length +
            stageB_OserApprovedCapital.length +
            stageC_OtherAuthorized.length +
            stageD_NoAuth.length +
            stageE_ArtParticular.length +
            stageF_Ready.length +
            stageG_Scheduled.length;
        console.assert(
            sumPartition === totalActivosCount,
            `[Kanban Partición Error] La suma de las secciones a..g (${sumPartition}) no coincide con el total de activas (${totalActivosCount})`
        );
    }

    // Listas filtradas por los chips activos para renderizado en Flujo
    const displayA_OserPending = stageA_OserPendingMat.filter(matchesChips);
    const displayB_OserApproved = stageB_OserApprovedCapital.filter(matchesChips);
    const displayC_OtherAuth = stageC_OtherAuthorized.filter(matchesChips);
    const displayD_NoAuth = stageD_NoAuth.filter(matchesChips);
    const displayE_ArtParticular = stageE_ArtParticular.filter(matchesChips);
    const displayF_Ready = stageF_Ready.filter(matchesChips);
    const displayG_Scheduled = stageG_Scheduled.filter(matchesChips);

    // --- BLOQUE: ATENCIÓN INMEDIATA ---
    const immediateAttentionList = useMemo(() => {
        const list: {
            patient: PreOpPatient;
            missingItems: string[];
            responsible: 'Ortopedia' | 'Internación' | 'Quirófano' | 'ART';
        }[] = [];

        activeNonPast.forEach(p => {
            let isIncluded = false;
            const missing: string[] = [];
            let resp: 'Ortopedia' | 'Internación' | 'Quirófano' | 'ART' = 'Ortopedia';

            const isART = isArtCoverage(p.medicalCoverage, artCoveragesSet);
            const daysElapsedART = p.createdAtRaw ? getDaysDiffFromDates(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(p.createdAtRaw)), todayStr) : 0;

            // 1. Cirugías con fecha entre hoy y hoy+7 con algún pendiente (material, clínico o quirófano)
            if (p.surgeryDate && p.surgeryDate >= todayStr && p.surgeryDate <= todayPlus7Str) {
                const matMissing = p.requiresMaterial && p.materialStatus !== 'OK';
                const clinMissing = p.clinicalStatus !== 'OK';
                const adminMissing = p.adminStatus !== 'OK';

                if (matMissing || clinMissing || adminMissing) {
                    isIncluded = true;
                    if (matMissing) {
                        missing.push('Falta Material');
                        resp = 'Ortopedia';
                    }
                    if (clinMissing) {
                        missing.push('Falta Exámenes');
                        if (!matMissing) resp = 'Internación';
                    }
                    if (adminMissing) {
                        missing.push('Falta Quirófano');
                        if (!matMissing && !clinMissing) resp = 'Quirófano';
                    }
                }
            }

            // 2. ART vencidas o en día 6 (sin fecha)
            if (!p.surgeryDate && isART && daysElapsedART >= 6) {
                isIncluded = true;
                if (daysElapsedART === 6) {
                    missing.push('ART por vencer (día 6 de 6)');
                } else {
                    missing.push(`ART vencida hace ${daysElapsedART - 6} ${daysElapsedART - 6 === 1 ? 'día' : 'días'}`);
                }
                resp = 'ART';
            }

            // 3. Material pendiente con internación en <= 2 días o vencida
            if (p.requiresMaterial && p.materialStatus !== 'OK' && p.authorizationDate) {
                const diffAuth = getDaysDiffFromDates(todayStr, p.authorizationDate);
                if (diffAuth <= 2) {
                    isIncluded = true;
                    if (diffAuth < 0) {
                        missing.push(`Internación vencida hace ${Math.abs(diffAuth)} d · material pendiente`);
                    } else if (diffAuth === 0) {
                        missing.push('Internación hoy · material pendiente');
                    } else {
                        missing.push(`Internación en ${diffAuth} d · material pendiente`);
                    }
                    resp = 'Ortopedia';
                }
            }

            // 4. Emergencias con material pendiente y fecha en los próximos 7 días (responsable: Ortopedia)
            if (p.priority === 'Alta' && p.requiresMaterial && p.materialStatus !== 'OK' && p.surgeryDate && p.surgeryDate >= todayStr && p.surgeryDate <= todayPlus7Str) {
                isIncluded = true;
                if (!missing.includes('Emergencia: material pendiente')) {
                    missing.push('Emergencia: material pendiente');
                }
                resp = 'Ortopedia';
            }

            if (isIncluded) {
                list.push({
                    patient: p,
                    missingItems: Array.from(new Set(missing)),
                    responsible: resp
                });
            }
        });

        return list.sort((a, b) => {
            const uA = getUrgencyScore(a.patient);
            const uB = getUrgencyScore(b.patient);
            if (uA !== uB) return uA - uB;
            const dateA = a.patient.surgeryDate || '9999-99-99';
            const dateB = b.patient.surgeryDate || '9999-99-99';
            return dateA.localeCompare(dateB);
        });
    }, [activeNonPast, todayStr, todayPlus7Str, artCoveragesSet]);

    // --- RESUMEN DE ESTADO (Métricas y Chips clickeables) ---
    const next7DaysSurgeries = activeNonPast.filter(p => p.surgeryDate && p.surgeryDate >= todayStr && p.surgeryDate <= todayPlus7Str);
    const next7DaysWithBlockersCount = next7DaysSurgeries.filter(p => (p.requiresMaterial && p.materialStatus !== 'OK') || p.clinicalStatus !== 'OK' || p.adminStatus !== 'OK').length;

    const allMaterialBlockers = activeNonPast.filter(p => p.requiresMaterial && p.materialStatus !== 'OK');
    const matBlockersNext7DaysCount = allMaterialBlockers.filter(p => p.surgeryDate && p.surgeryDate >= todayStr && p.surgeryDate <= todayPlus7Str).length;

    const allClinicalBlockers = activeNonPast.filter(p => p.clinicalStatus !== 'OK');
    const clinBlockersNext7DaysCount = allClinicalBlockers.filter(p => p.surgeryDate && p.surgeryDate >= todayStr && p.surgeryDate <= todayPlus7Str).length;

    const artExpiringOrExpired = activeNonPast.filter(p => {
        if (p.surgeryDate || !isArtCoverage(p.medicalCoverage, artCoveragesSet) || !p.createdAtRaw) return false;
        const createdLocal = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(p.createdAtRaw));
        const days = getDaysDiffFromDates(createdLocal, todayStr);
        return days >= 4;
    });

    // --- VISTA RANKING ---
    const isSearching = term !== '';
    const isUrgentOrEmergency = (p: PreOpPatient) => p.priority === 'Urgente' || p.priority === 'Alta';

    // Ranking base: cirugías activas sin fecha asignada
    const rankingBase = filteredPatients.filter(p => !p.surgeryDate && p.status !== 'suspended' && p.status !== 'cancelled');

    // ART y Particulares NO requieren fecha autorizada de internación. Tampoco urgencias/emergencias ni cuando hay búsqueda activa.
    const rankingEligible = rankingBase.filter(p =>
        isSearching ||
        isUrgentOrEmergency(p) ||
        isArtOrParticularCategory(p.medicalCoverage, artCoveragesSet) ||
        Boolean(p.authorizationDate)
    );

    // 1. Columna: Urgencias y Emergencias (Todas las no electivas)
    const urgenciesRanking = rankingEligible.filter(isUrgentOrEmergency).sort(byUrgencyThen(sortByDateAsc));

    // Columnas electivas sin urgencias
    const electiveRankingEligible = rankingEligible.filter(p => !isUrgentOrEmergency(p));

    const oserRanking = electiveRankingEligible.filter(p => isOserCategory(p.medicalCoverage)).sort(byUrgencyThen(sortPriorityAndDate));
    const prepagasRanking = electiveRankingEligible.filter(p => isPrepagaCategory(p.medicalCoverage, artCoveragesSet)).sort(byUrgencyThen(sortPriorityAndDate));
    const artParticularesRanking = electiveRankingEligible.filter(p => isArtOrParticularCategory(p.medicalCoverage, artCoveragesSet)).sort(byUrgencyThen(sortArtAndParticular));

    // --- VISTA PENDIENTES ORTOPEDIA ---
    const isSuperAdmin = user?.role === 'SuperAdmin';
    const isOrtopediaCapital = user?.role === 'Ortopedia' && (
        user?.vendorName?.toLowerCase().includes('capital') ||
        user?.can_view_all_vendors
    );
    const canAccessPendingOrthoTab = isSuperAdmin || isOrtopediaCapital;

    const allPendingOrtho = filteredPatients.filter(p => {
        if (p.materialStatus === 'OK' || !p.requiresMaterial) return false;
        const isVendorCapital = p.vendorName?.toLowerCase().includes('capital') ?? false;
        const isOser = isOserCategory(p.medicalCoverage);
        return isVendorCapital || isOser;
    });

    // Filtro interactivo de ≤ 7 días de internación con material pendiente
    const filteredPendingOrtho = pendingOrthoFilterWithin7Days
        ? allPendingOrtho.filter(p => {
            if (!p.authorizationDate) return false;
            const diff = getDaysDiffFromDates(todayStr, p.authorizationDate);
            return diff <= 7;
        })
        : allPendingOrtho;

    const pendingOrthoAuthorized = filteredPendingOrtho
        .filter(p => p.status !== 'suspended' && p.status !== 'cancelled' && p.status !== 'completed' && p.hasAuthorization)
        .sort(byUrgencyThen((a, b) => (b.daysWaiting ?? 0) - (a.daysWaiting ?? 0)));

    const pendingOrthoWaitingAuth = filteredPendingOrtho
        .filter(p => p.status !== 'suspended' && p.status !== 'cancelled' && p.status !== 'completed' && !p.hasAuthorization)
        .sort(byUrgencyThen((a, b) => (b.daysWaiting ?? 0) - (a.daysWaiting ?? 0)));

    const pendingOrthoSuspended = filteredPendingOrtho
        .filter(p => p.status === 'suspended')
        .sort(byUrgencyThen((a, b) => (b.daysWaiting ?? 0) - (a.daysWaiting ?? 0)));

    const pendingOrthoCancelled = filteredPendingOrtho
        .filter(p => p.status === 'cancelled')
        .sort(byUrgencyThen((a, b) => (b.daysWaiting ?? 0) - (a.daysWaiting ?? 0)));

    // Métrica: cantidad con internación en ≤ 7 días con material pendiente
    const orthoWithin7DaysCount = allPendingOrtho.filter(p => {
        if (!p.authorizationDate || p.status === 'cancelled') return false;
        const diff = getDaysDiffFromDates(todayStr, p.authorizationDate);
        return diff <= 7;
    }).length;

    // Promedio de días totales de espera (desde ingreso)
    const avgDaysTotalWaiting = pendingOrthoAuthorized.length > 0
        ? Math.round(pendingOrthoAuthorized.reduce((acc, p) => acc + (p.daysWaitingFromCreation ?? p.daysWaiting ?? 0), 0) / pendingOrthoAuthorized.length)
        : 0;

    // --- VISTA SUSPENDIDAS Y CANCELADAS ---
    // Ordenadas por suspended_at descendente (más recientes primero); urgentes arriba
    const suspendedPatients = filteredPatients
        .filter(p => p.status === 'suspended')
        .sort(byUrgencyThen((a, b) => {
            const tA = a.suspendedAt ? new Date(a.suspendedAt).getTime() : 0;
            const tB = b.suspendedAt ? new Date(b.suspendedAt).getTime() : 0;
            return tB - tA;
        }));

    const cancelledPatients = filteredPatients
        .filter(p => p.status === 'cancelled')
        .sort(byUrgencyThen((a, b) => {
            const tA = a.suspendedAt ? new Date(a.suspendedAt).getTime() : 0;
            const tB = b.suspendedAt ? new Date(b.suspendedAt).getTime() : 0;
            return tB - tA;
        }));

    const allSuspendedAndCancelled = [...suspendedPatients, ...cancelledPatients];

    // --- VISTA PASADAS SIN CERRAR ---
    // Programadas con fecha anterior a hoy (hora local), no completadas, ni suspendidas, ni canceladas.
    const pastUnclosedSurgeries = filteredPatients
        .filter(p => Boolean(p.surgeryDate) && p.surgeryDate! < todayStr && p.status !== 'completed' && p.status !== 'suspended' && p.status !== 'cancelled')
        .sort(byUrgencyThen((a, b) => {
            const dateA = new Date(`${a.surgeryDate}T${a.startTime || '00:00'}:00`).getTime() || 0;
            const dateB = new Date(`${b.surgeryDate}T${b.startTime || '00:00'}:00`).getTime() || 0;
            return dateB - dateA;
        }));

    // View Mode Toggle
    const [viewMode, setViewMode] = useState<'flow' | 'ranking' | 'pending_ortho' | 'suspended_cancelled' | 'past_unclosed'>(() => {
        const saved = localStorage.getItem('kanban_view_mode');
        if (saved === 'pending_ortho' && canAccessPendingOrthoTab) return 'pending_ortho';
        if (saved === 'suspended_cancelled' || saved === 'past_unclosed' || saved === 'ranking' || saved === 'flow') return saved;
        return 'flow';
    });

    const toggleViewMode = (mode: 'flow' | 'ranking' | 'pending_ortho' | 'suspended_cancelled' | 'past_unclosed') => {
        setViewMode(mode);
        localStorage.setItem('kanban_view_mode', mode);
    };

    // --- MODALES DE ACCIONES OPERATIVAS ---

    // 1. Modal Baja Definitiva (con motivo obligatorio y recarga force=true)
    const [cancelModal, setCancelModal] = useState<{
        isOpen: boolean;
        patient: PreOpPatient | null;
        reason: string;
        isSubmitting: boolean;
    }>({
        isOpen: false,
        patient: null,
        reason: '',
        isSubmitting: false
    });

    const handleConfirmCancelSurgery = async () => {
        if (!cancelModal.patient) return;
        const patient = cancelModal.patient;
        const reason = cancelModal.reason.trim();

        if (!reason) {
            alert('Debe ingresar obligatoriamente el motivo de la cancelación definitiva.');
            return;
        }

        setCancelModal(prev => ({ ...prev, isSubmitting: true }));
        try {
            const nowIso = new Date().toISOString();
            const { error } = await supabase
                .from('surgeries')
                .update({
                    status: 'cancelled',
                    suspension_reason: reason,
                    suspended_by_name: user?.name || 'Sistema',
                    suspended_at: nowIso
                })
                .eq('id', patient.id);

            if (error) throw error;

            // Notificación al proveedor si corresponde
            if (patient.vendorId) {
                const { data: vendorData } = await supabase
                    .from('vendors')
                    .select('name, email')
                    .eq('id', patient.vendorId)
                    .single();

                if (vendorData && vendorData.email) {
                    await supabase
                        .from('email_notifications')
                        .insert({
                            recipient_email: vendorData.email,
                            subject: `Aviso de Cirugía Cancelada: ${patient.name}`,
                            message: `La cirugía de ${patient.name} (DNI ${patient.patientDocument}, ${patient.proc}) ha sido cancelada definitivamente.\n\nDetalles:\n- Médico: ${patient.doctor}\n- Cobertura: ${patient.medicalCoverage}\n- Motivo de cancelación: ${reason}\n- Registrado por: ${user?.name || 'Sistema'} (${user?.role || 'Usuario'})\n- Fecha: ${nowIso}\n\nEste es un mensaje automático del Sistema de Coordinación de Quirófanos.`,
                            metadata: {
                                surgery_id: patient.id,
                                patient_name: patient.name,
                                doctor_name: patient.doctor,
                                reason,
                                action_type: 'cancelled'
                            }
                        });
                }
            }

            captureError("Evento de Auditoría: Cancelación", {
                context: 'Kanban.handleCancelSurgery.audit',
                severity: 'WARNING',
                user: user,
                metadata: {
                    user_name: user?.name,
                    action: 'DELETE',
                    resource_id: patient.id,
                    reason
                }
            });

            await supabase.from('audit_logs').insert({
                user_name: user?.name || 'Sistema',
                user_role: user?.role,
                action: 'DELETE',
                resource: 'Cirugía',
                resource_id: patient.id,
                description: `Cirugía cancelada definitivamente desde Planificación. Motivo: ${reason}`,
                meta: { source: 'Kanban', reason, cancelled_by: user?.name }
            });

            setCancelModal({ isOpen: false, patient: null, reason: '', isSubmitting: false });
            // Recarga obligatoria forzada para desaparecer la tarjeta al instante
            fetchPendingSurgeries(true);
        } catch (err: any) {
            console.error('Error cancelling surgery:', err);
            alert('Error al cancelar la cirugía: ' + (err.message || err));
            setCancelModal(prev => ({ ...prev, isSubmitting: false }));
        }
    };

    // 2. Reincorporar cirugía
    const handleReincorporateSurgery = async (patient: PreOpPatient) => {
        const confirmMsg = `¿Desea reincorporar la cirugía de ${patient.name} al flujo activo?\nSe restablecerá a estado Pendiente de Validación para que pueda ser coordinada.`;
        if (!confirm(confirmMsg)) return;

        try {
            const { error } = await supabase
                .from('surgeries')
                .update({
                    status: 'pending_validation',
                    suspension_requested: false,
                    suspension_reason: null,
                    suspension_observations: null
                })
                .eq('id', patient.id);

            if (error) throw error;

            await supabase.from('audit_logs').insert({
                user_name: user?.name || 'Sistema',
                user_role: user?.role,
                action: 'STATUS_CHANGE',
                resource: 'Cirugía',
                resource_id: patient.id,
                description: `Cirugía reincorporada al flujo activo desde ${patient.status === 'suspended' ? 'Suspendidas' : 'Canceladas'} por ${user?.name} (${user?.role})`,
                meta: { previous_status: patient.status, new_status: 'pending_validation' }
            });

            alert(`La cirugía de ${patient.name} fue reincorporada con éxito.`);
            fetchPendingSurgeries(true);
        } catch (err: any) {
            console.error('Error reincorporating surgery:', err);
            alert('Error al reincorporar la cirugía: ' + (err.message || err));
        }
    };

    // 3. Eliminación permanente (SuperAdmin)
    const handleDeletePermanent = async (patient: PreOpPatient) => {
        if (user?.role !== 'SuperAdmin') {
            alert('Solo los usuarios con rol SuperAdmin tienen autorización para eliminar definitivamente registros de cirugías.');
            return;
        }

        const confirmMsg = `⚠️ ATENCIÓN: Esta acción eliminará PERMANENTEMENTE la cirugía de ${patient.name} (DNI ${patient.patientDocument}) de la base de datos.\n\n¿Confirma la eliminación irreversible?`;
        if (!confirm(confirmMsg)) return;

        try {
            await supabase.from('surgery_materials').delete().eq('surgery_id', patient.id);

            const { error } = await supabase
                .from('surgeries')
                .delete()
                .eq('id', patient.id);

            if (error) throw error;

            await supabase.from('audit_logs').insert({
                user_name: user?.name || 'SuperAdmin',
                user_role: user?.role,
                action: 'DELETE',
                resource: 'Cirugía',
                resource_id: patient.id,
                description: `Eliminación DEFINITIVA de la cirugía de ${patient.name} (${patient.proc}) ejecutada por SuperAdmin`,
                meta: { patient_document: patient.patientDocument, surgery_id: patient.id }
            });

            alert(`La cirugía de ${patient.name} ha sido eliminada permanentemente.`);
            fetchPendingSurgeries(true);
        } catch (err: any) {
            console.error('Error deleting surgery permanently:', err);
            alert('Error al eliminar la cirugía: ' + (err.message || err));
        }
    };

    // 4. Modal de Solicitud de Eliminación (no-admin)
    const [requestDeleteModal, setRequestDeleteModal] = useState<{
        isOpen: boolean;
        patient: PreOpPatient | null;
        reason: string;
    }>({
        isOpen: false,
        patient: null,
        reason: ''
    });

    const handleRequestDeleteSubmit = async () => {
        if (!requestDeleteModal.patient) return;
        const patient = requestDeleteModal.patient;
        const reason = requestDeleteModal.reason.trim();

        if (!reason) {
            alert('Por favor ingrese el motivo por el cual confirma que se debe eliminar esta cirugía.');
            return;
        }

        try {
            const { error } = await supabase.from('system_alerts').insert({
                type: 'deletion_requested',
                severity: 'Warning',
                title: 'Solicitud de Eliminación de Cirugía',
                message: `El usuario ${user?.name} (${user?.role}) solicita eliminar definitivamente la cirugía de ${patient.name} (DNI ${patient.patientDocument}). Motivo: ${reason}`,
                patient_name: patient.name,
                surgery_id: patient.id,
                target_role: 'SuperAdmin',
                status: 'Active',
                date_generated: new Date().toISOString()
            });

            if (error) throw error;

            await supabase.from('audit_logs').insert({
                user_name: user?.name || 'Sistema',
                user_role: user?.role,
                action: 'REQUEST_DELETE',
                resource: 'Cirugía',
                resource_id: patient.id,
                description: `Solicitud de eliminación enviada a SuperAdmin por ${user?.name}. Motivo: ${reason}`,
                meta: { reason, patient_name: patient.name }
            });

            alert(`Solicitud enviada a SuperAdmin exitosamente.`);
            setRequestDeleteModal({ isOpen: false, patient: null, reason: '' });
        } catch (err: any) {
            console.error('Error sending delete request:', err);
            alert('Error al enviar la solicitud: ' + (err.message || err));
        }
    };

    // 5. Cierre Rápido de "Pasadas sin cerrar"
    const [quickCloseModal, setQuickCloseModal] = useState<{
        isOpen: boolean;
        patient: PreOpPatient | null;
        startTime: string;
        endTime: string;
        instrumentadora: string;
        isSubmitting: boolean;
    }>({
        isOpen: false,
        patient: null,
        startTime: '',
        endTime: '',
        instrumentadora: '',
        isSubmitting: false
    });

    const openQuickCloseModal = (patient: PreOpPatient) => {
        // Arrancan vacíos y no inventan horarios ('08:00' / '10:00')
        const initStart = patient.actualStartTime || '';
        const initEnd = patient.actualEndTime || '';

        setQuickCloseModal({
            isOpen: true,
            patient,
            startTime: initStart,
            endTime: initEnd,
            instrumentadora: '',
            isSubmitting: false
        });

        // Intentamos precargar instrumentadora de surgery_forms si ya existe
        supabase
            .from('surgery_forms')
            .select('instrumentadora, cirugia_inicio, cirugia_fin')
            .eq('surgery_id', patient.id)
            .maybeSingle()
            .then(({ data }) => {
                if (data) {
                    setQuickCloseModal(prev => ({
                        ...prev,
                        instrumentadora: prev.instrumentadora || data.instrumentadora || '',
                        startTime: prev.startTime || data.cirugia_inicio || '',
                        endTime: prev.endTime || data.cirugia_fin || ''
                    }));
                }
            });
    };

    const handleQuickCloseSubmit = async (skipTech = false) => {
        if (!quickCloseModal.patient) return;
        const { patient, startTime, endTime, instrumentadora } = quickCloseModal;

        if (!startTime || !endTime) {
            alert('Debe especificar tanto el horario real de inicio como de finalización.');
            return;
        }

        // Validación de orden horario: si el fin es anterior o igual al inicio, requerir confirmación explícita
        if (endTime <= startTime) {
            const confirmedCrossing = confirm(
                `El horario de fin (${endTime}) es anterior o igual al horario de inicio (${startTime}).\n\n¿Confirma que la intervención quirúrgica cruzó la medianoche?`
            );
            if (!confirmedCrossing) return;
        }

        // Validación de técnica / instrumentadora participante
        if (!instrumentadora.trim()) {
            if (!skipTech) {
                alert('Por favor seleccione una instrumentadora del listado o use la opción "Cerrar sin técnica" o "Abrir ficha para cargarla".');
                return;
            }
            const confirmed = confirm(
                '⚠️ ATENCIÓN: La cirugía se cerrará sin técnica asignada y NO entrará en la liquidación de ninguna técnica/instrumentadora.\n\n¿Confirma el cierre sin técnica?'
            );
            if (!confirmed) return;
        }

        setQuickCloseModal(prev => ({ ...prev, isSubmitting: true }));
        try {
            // Actualización de cirugías
            const { error: surgError } = await supabase
                .from('surgeries')
                .update({
                    status: 'completed',
                    actual_start_time: startTime,
                    actual_end_time: endTime
                })
                .eq('id', patient.id);

            if (surgError) throw surgError;

            // Sincronización con surgery_forms
            await supabase.from('surgery_forms').upsert({
                surgery_id: patient.id,
                cirugia_inicio: startTime,
                cirugia_fin: endTime,
                instrumentadora: instrumentadora.trim() || null
            }, { onConflict: 'surgery_id' });

            await supabase.from('audit_logs').insert({
                user_name: user?.name || 'Sistema',
                user_role: user?.role,
                action: 'STATUS_CHANGE',
                resource: 'Cirugía',
                resource_id: patient.id,
                description: `Cirugía pasada cerrada como Realizada por ${user?.name} (${user?.role}). Horario: ${startTime} - ${endTime}${instrumentadora.trim() ? ` · Técnica: ${instrumentadora.trim()}` : ' · Sin técnica'}`,
                meta: { actual_start_time: startTime, actual_end_time: endTime, instrumentadora: instrumentadora.trim() || null, new_status: 'completed' }
            });

            alert(`Cirugía de ${patient.name} cerrada correctamente como realizada.`);
            setQuickCloseModal({ isOpen: false, patient: null, startTime: '', endTime: '', instrumentadora: '', isSubmitting: false });
            fetchPendingSurgeries(true);
        } catch (err: any) {
            console.error('Error closing past surgery:', err);
            alert('Error al cerrar la cirugía: ' + (err.message || err));
            setQuickCloseModal(prev => ({ ...prev, isSubmitting: false }));
        }
    };

    // 6. Suspender cirugía pasada
    const handleMarkPastAsSuspended = async (patient: PreOpPatient) => {
        const reason = prompt(`Ingrese el motivo por el cual la cirugía de ${patient.name} (${formatDisplayDate(patient.surgeryDate)}) no se realizó:`);
        if (reason === null) return;

        try {
            const { error } = await supabase
                .from('surgeries')
                .update({
                    status: 'suspended',
                    suspension_reason: reason || 'Fecha pasada sin realización',
                    suspended_by_name: user?.name || 'Sistema',
                    suspended_at: new Date().toISOString()
                })
                .eq('id', patient.id);

            if (error) throw error;

            await supabase.from('audit_logs').insert({
                user_name: user?.name || 'Sistema',
                user_role: user?.role,
                action: 'STATUS_CHANGE',
                resource: 'Cirugía',
                resource_id: patient.id,
                description: `Cirugía pasada marcada como Suspendida por ${user?.name}. Motivo: ${reason}`,
                meta: { previous_date: patient.surgeryDate, reason }
            });

            alert(`La cirugía de ${patient.name} fue movida a Suspendidas.`);
            fetchPendingSurgeries(true);
        } catch (err: any) {
            console.error('Error marking past surgery as suspended:', err);
            alert('Error al suspender: ' + (err.message || err));
        }
    };

    const isSectionCollapsed = (sectionKey: string, count: number) => {
        if (term !== '' && count > 0) return false;
        return !!collapsedSections[sectionKey];
    };

    const SectionHeader = ({ title, count, colorClass, icon, sectionKey }: { title: string, count: number, colorClass: string, icon: string, sectionKey: string }) => (
        <div
            className="flex items-center justify-between mb-4 cursor-pointer hover:bg-slate-50 p-2 rounded-lg transition-colors select-none"
            onClick={() => toggleSection(sectionKey)}
        >
            <div className="flex items-center gap-2">
                <span className={`material-symbols-outlined ${colorClass}`}>{icon}</span>
                <h2 className="text-lg font-bold text-slate-900">{title}</h2>
                <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${colorClass.replace('text-', 'bg-').replace('500', '100').replace('600', '100')} ${colorClass.replace('text-', 'text-').replace('500', '700').replace('600', '700')}`}>
                    {count}
                </span>
            </div>
            <span className={`material-symbols-outlined text-slate-400 transition-transform duration-200 ${isSectionCollapsed(sectionKey, count) ? '-rotate-90' : 'rotate-0'}`}>
                expand_more
            </span>
        </div>
    );

    return (
        <div className="flex-1 h-full overflow-y-auto bg-slate-50 flex flex-col font-sans">
            <ProgressBar isLoading={loading || refreshing} />

            {/* HEADER */}
            <header className="bg-white border-b border-slate-200 px-6 py-5 sticky top-0 z-20 shadow-sm">
                <div className="max-w-7xl mx-auto w-full">
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                        <div>
                            <h1 className="text-2xl font-bold text-slate-900 leading-none">Gestión de Flujo Pre-Quirúrgico</h1>
                            <p className="text-slate-500 text-sm mt-1">Supervisión de validaciones, fechas y desbloqueo de pacientes.</p>
                        </div>
                        <div className="flex items-center gap-3 flex-wrap">
                            <div className="relative">
                                <span className="material-symbols-outlined absolute left-3 top-2.5 text-slate-400 text-lg">search</span>
                                <input
                                    type="text"
                                    placeholder="Buscar paciente, DNI, médico, proc, cobertura..."
                                    className="pl-9 pr-4 py-2 w-64 md:w-80 rounded-lg border border-slate-300 bg-white text-xs md:text-sm focus:ring-2 focus:ring-primary focus:border-primary outline-none shadow-sm"
                                    value={filterText}
                                    onChange={(e) => setFilterText(e.target.value)}
                                />
                            </div>

                            {/* View Mode Toggle (Wrap & Responsive para ≤ 800px) */}
                            <div className="flex items-center flex-wrap gap-1 bg-slate-100 p-1 rounded-lg border border-slate-200 max-w-full overflow-x-auto">
                                <button
                                    onClick={() => toggleViewMode('flow')}
                                    className={`px-3 py-1.5 rounded-md text-xs font-bold flex items-center gap-1.5 transition-all ${
                                        viewMode === 'flow'
                                            ? 'bg-white text-slate-900 shadow-sm'
                                            : 'text-slate-500 hover:text-slate-900'
                                    }`}
                                >
                                    <span className="material-symbols-outlined text-sm">view_kanban</span>
                                    Flujo Pre-Qx
                                </button>
                                <button
                                    onClick={() => toggleViewMode('ranking')}
                                    className={`px-3 py-1.5 rounded-md text-xs font-bold flex items-center gap-1.5 transition-all ${
                                        viewMode === 'ranking'
                                            ? 'bg-white text-slate-900 shadow-sm'
                                            : 'text-slate-500 hover:text-slate-900'
                                    }`}
                                >
                                    <span className="material-symbols-outlined text-sm">format_list_numbered</span>
                                    Ranking
                                </button>
                                {canAccessPendingOrthoTab && (
                                    <button
                                        onClick={() => toggleViewMode('pending_ortho')}
                                        className={`px-3 py-1.5 rounded-md text-xs font-bold flex items-center gap-1.5 transition-all ${
                                            viewMode === 'pending_ortho'
                                                ? 'bg-purple-600 text-white shadow-sm font-black'
                                                : 'text-purple-700 hover:text-purple-900 font-bold'
                                        }`}
                                    >
                                        <span className="material-symbols-outlined text-sm">inventory_2</span>
                                        Pendientes Ortopedia ({allPendingOrtho.filter(p => p.status !== 'suspended' && p.status !== 'cancelled').length})
                                    </button>
                                )}
                                <button
                                    onClick={() => toggleViewMode('suspended_cancelled')}
                                    className={`px-3 py-1.5 rounded-md text-xs font-bold flex items-center gap-1.5 transition-all ${
                                        viewMode === 'suspended_cancelled'
                                            ? 'bg-amber-600 text-white shadow-sm font-black'
                                            : 'text-amber-800 hover:text-amber-950 font-bold'
                                    }`}
                                >
                                    <span className="material-symbols-outlined text-sm">pause_circle</span>
                                    Suspendidas / Canceladas ({allSuspendedAndCancelled.length})
                                </button>
                                <button
                                    onClick={() => toggleViewMode('past_unclosed')}
                                    className={`px-3 py-1.5 rounded-md text-xs font-bold flex items-center gap-1.5 transition-all ${
                                        viewMode === 'past_unclosed'
                                            ? 'bg-rose-600 text-white shadow-sm font-black'
                                            : 'text-rose-700 hover:text-rose-900 font-bold'
                                    }`}
                                >
                                    <span className="material-symbols-outlined text-sm">history_toggle_off</span>
                                    Pasadas sin Cerrar ({pastUnclosedSurgeries.length})
                                </button>
                            </div>

                            {user?.role !== 'Medico' && user?.role !== 'Tecnico' && user?.role !== 'Ortopedia' && (
                                <button
                                    onClick={() => navigate('/detail/new')}
                                    className="bg-slate-900 hover:bg-slate-800 text-white px-3.5 py-2 rounded-lg text-xs md:text-sm font-bold shadow-sm flex items-center gap-1.5 transition-colors whitespace-nowrap"
                                >
                                    <span className="material-symbols-outlined text-base">add</span> Nueva Cirugía
                                </button>
                            )}
                        </div>
                    </div>

                    {/* QUICK FILTER CHIPS (Debajo del buscador, combinables) */}
                    {viewMode === 'flow' && (
                        <div className="flex flex-wrap items-center gap-2 mt-4 pt-3 border-t border-slate-100">
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mr-1">Filtros rápidos:</span>
                            <button
                                type="button"
                                onClick={() => setFilterMissingMat(prev => !prev)}
                                className={`px-2.5 py-1 rounded-full text-xs font-bold transition-all flex items-center gap-1.5 border ${
                                    filterMissingMat
                                        ? 'bg-amber-600 text-white border-amber-700 shadow-sm'
                                        : 'bg-white text-slate-600 border-slate-200 hover:border-amber-300'
                                }`}
                            >
                                <span className="material-symbols-outlined text-xs">inventory_2</span>
                                Falta material
                                {filterMissingMat && <span className="material-symbols-outlined text-xs">close</span>}
                            </button>

                            <button
                                type="button"
                                onClick={() => setFilterMissingExams(prev => !prev)}
                                className={`px-2.5 py-1 rounded-full text-xs font-bold transition-all flex items-center gap-1.5 border ${
                                    filterMissingExams
                                        ? 'bg-blue-600 text-white border-blue-700 shadow-sm'
                                        : 'bg-white text-slate-600 border-slate-200 hover:border-blue-300'
                                }`}
                            >
                                <span className="material-symbols-outlined text-xs">clinical_notes</span>
                                Falta exámenes
                                {filterMissingExams && <span className="material-symbols-outlined text-xs">close</span>}
                            </button>

                            <button
                                type="button"
                                onClick={() => setFilterMissingOR(prev => !prev)}
                                className={`px-2.5 py-1 rounded-full text-xs font-bold transition-all flex items-center gap-1.5 border ${
                                    filterMissingOR
                                        ? 'bg-purple-600 text-white border-purple-700 shadow-sm'
                                        : 'bg-white text-slate-600 border-slate-200 hover:border-purple-300'
                                }`}
                            >
                                <span className="material-symbols-outlined text-xs">meeting_room</span>
                                Falta quirófano
                                {filterMissingOR && <span className="material-symbols-outlined text-xs">close</span>}
                            </button>

                            <button
                                type="button"
                                onClick={() => setFilterWithin7Days(prev => !prev)}
                                className={`px-2.5 py-1 rounded-full text-xs font-bold transition-all flex items-center gap-1.5 border ${
                                    filterWithin7Days
                                        ? 'bg-indigo-600 text-white border-indigo-700 shadow-sm'
                                        : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300'
                                }`}
                            >
                                <span className="material-symbols-outlined text-xs">calendar_today</span>
                                Operan en ≤ 7 días
                                {filterWithin7Days && <span className="material-symbols-outlined text-xs">close</span>}
                            </button>

                            {(filterMissingMat || filterMissingExams || filterMissingOR || filterWithin7Days) && (
                                <button
                                    type="button"
                                    onClick={() => {
                                        setFilterMissingMat(false);
                                        setFilterMissingExams(false);
                                        setFilterMissingOR(false);
                                        setFilterWithin7Days(false);
                                    }}
                                    className="text-[11px] font-semibold text-slate-400 hover:text-slate-600 underline ml-2"
                                >
                                    Limpiar filtros
                                </button>
                            )}
                        </div>
                    )}

                    <div className="flex items-center justify-between gap-4 mt-5 mb-2">
                        <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-2">
                            <span className="material-symbols-outlined text-xs">analytics</span>
                            Resumen de Estado
                        </h3>
                        <button
                            onClick={toggleKPIs}
                            className="text-[10px] font-bold text-primary hover:text-primary/70 flex items-center gap-1 transition-colors uppercase tracking-tight bg-primary/5 px-2 py-1 rounded"
                        >
                            <span className="material-symbols-outlined text-xs">
                                {showKPIs ? 'keyboard_arrow_up' : 'keyboard_arrow_down'}
                            </span>
                            {showKPIs ? 'Ocultar Resumen' : 'Mostrar Resumen'}
                        </button>
                    </div>

                    {/* RESUMEN DE ESTADO (Grilla de 2 columnas en ≤800px, 4 columnas en desktop; Clickeables) */}
                    {showKPIs && (
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 animate-fadeIn">
                            {/* 1. OPERAN EN 7 DÍAS */}
                            <div
                                onClick={() => {
                                    toggleViewMode('flow');
                                    setFilterWithin7Days(prev => !prev);
                                }}
                                className={`cursor-pointer p-3.5 rounded-xl border flex items-start gap-3 shadow-sm hover:shadow-md transition-all ${
                                    filterWithin7Days
                                        ? 'bg-indigo-100/90 border-indigo-400 ring-2 ring-indigo-500'
                                        : 'bg-indigo-50/90 border-indigo-200/80'
                                }`}
                                title="Clic para filtrar cirugías que operan en los próximos 7 días"
                            >
                                <div className="size-9 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center shrink-0 mt-0.5">
                                    <span className="material-symbols-outlined text-lg">event_upcoming</span>
                                </div>
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-baseline gap-1.5 flex-wrap">
                                        <p className="text-xl font-black text-indigo-700 leading-none">{next7DaysSurgeries.length}</p>
                                        <p className="text-[11px] font-bold text-indigo-700 uppercase tracking-tight">Operan en 7 días</p>
                                    </div>
                                    <div className="mt-2 pt-1.5 border-t border-indigo-200/60 text-[10px] text-indigo-800/90 font-medium">
                                        <span><strong>{next7DaysWithBlockersCount}</strong> con pendientes</span>
                                    </div>
                                </div>
                            </div>

                            {/* 2. FALTA MATERIAL */}
                            <div
                                onClick={() => {
                                    toggleViewMode('flow');
                                    setFilterMissingMat(prev => !prev);
                                }}
                                className={`cursor-pointer p-3.5 rounded-xl border flex items-start gap-3 shadow-sm hover:shadow-md transition-all ${
                                    filterMissingMat
                                        ? 'bg-amber-100/90 border-amber-400 ring-2 ring-amber-500'
                                        : 'bg-amber-50/90 border-amber-200/80'
                                }`}
                                title="Clic para filtrar cirugías con falta de material"
                            >
                                <div className="size-9 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center shrink-0 mt-0.5">
                                    <span className="material-symbols-outlined text-lg">inventory_2</span>
                                </div>
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-baseline gap-1.5 flex-wrap">
                                        <p className="text-xl font-black text-amber-700 leading-none">{allMaterialBlockers.length}</p>
                                        <p className="text-[11px] font-bold text-amber-700 uppercase tracking-tight">Falta Material</p>
                                    </div>
                                    <div className="mt-2 pt-1.5 border-t border-amber-200/60 text-[10px] text-amber-800/90 font-medium">
                                        <span><strong>{matBlockersNext7DaysCount}</strong> operan en ≤ 7 días</span>
                                    </div>
                                </div>
                            </div>

                            {/* 3. FALTA EXÁMENES */}
                            <div
                                onClick={() => {
                                    toggleViewMode('flow');
                                    setFilterMissingExams(prev => !prev);
                                }}
                                className={`cursor-pointer p-3.5 rounded-xl border flex items-start gap-3 shadow-sm hover:shadow-md transition-all ${
                                    filterMissingExams
                                        ? 'bg-blue-100/90 border-blue-400 ring-2 ring-blue-500'
                                        : 'bg-blue-50/90 border-blue-200/80'
                                }`}
                                title="Clic para filtrar cirugías con falta de exámenes clínicos"
                            >
                                <div className="size-9 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center shrink-0 mt-0.5">
                                    <span className="material-symbols-outlined text-lg">clinical_notes</span>
                                </div>
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-baseline gap-1.5 flex-wrap">
                                        <p className="text-xl font-black text-blue-700 leading-none">{allClinicalBlockers.length}</p>
                                        <p className="text-[11px] font-bold text-blue-700 uppercase tracking-tight">Falta Exámenes</p>
                                    </div>
                                    <div className="mt-2 pt-1.5 border-t border-blue-200/60 text-[10px] text-blue-800/90 font-medium">
                                        <span><strong>{clinBlockersNext7DaysCount}</strong> operan en ≤ 7 días</span>
                                    </div>
                                </div>
                            </div>

                            {/* 4. ART POR VENCER / VENCIDAS */}
                            <div
                                onClick={() => {
                                    toggleViewMode('ranking');
                                }}
                                className="cursor-pointer p-3.5 rounded-xl border bg-rose-50/90 border-rose-200/80 flex items-start gap-3 shadow-sm hover:shadow-md transition-all"
                                title="Ver columna ART y Particulares en Ranking"
                            >
                                <div className="size-9 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center shrink-0 mt-0.5">
                                    <span className="material-symbols-outlined text-lg">alarm</span>
                                </div>
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-baseline gap-1.5 flex-wrap">
                                        <p className="text-xl font-black text-rose-700 leading-none">{artExpiringOrExpired.length}</p>
                                        <p className="text-[11px] font-bold text-rose-700 uppercase tracking-tight">ART por vencer</p>
                                    </div>
                                    <div className="mt-2 pt-1.5 border-t border-rose-200/60 text-[10px] text-rose-800/90 font-medium">
                                        <span>Total activas: <strong>{totalActivosCount}</strong> (sin pasadas)</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </header>

            {/* MAIN CONTENT AREA */}
            <div className="flex-1 p-6 md:p-8 max-w-7xl mx-auto w-full">
                {loading ? (
                    <div className="flex flex-col items-center justify-center h-64 text-slate-400">
                        <span className="material-symbols-outlined animate-spin text-4xl mb-4">progress_activity</span>
                        <p className="font-medium">Cargando planificación...</p>
                    </div>
                ) : viewMode === 'ranking' ? (
                    /* --- VIEW MODE: RANKING (4 Columnas) --- */
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6 animate-fadeIn">
                        {/* COLUMNA 1: URGENCIAS Y EMERGENCIAS */}
                        <div className="bg-white rounded-xl border border-red-200 shadow-sm flex flex-col h-full overflow-hidden">
                            <div className="bg-red-50 border-b border-red-100 p-4 flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <span className="material-symbols-outlined text-red-600 font-bold">warning</span>
                                    <h3 className="font-bold text-slate-900 text-base">Urgencias y Emergencias</h3>
                                </div>
                                <span className="bg-red-100 text-red-800 text-xs font-black px-2.5 py-1 rounded-full">
                                    {urgenciesRanking.length}
                                </span>
                            </div>
                            <div className="p-4 flex-1 overflow-y-auto space-y-3 max-h-[calc(100vh-280px)] min-h-[400px]">
                                {urgenciesRanking.length > 0 ? (
                                    urgenciesRanking.map(p => (
                                        <PatientCard key={p.id} patient={p} userRole={user?.role} currentUser={user} artSet={artCoveragesSet} onCancel={(pt) => setCancelModal({ isOpen: true, patient: pt, reason: '', isSubmitting: false })} />
                                    ))
                                ) : (
                                    <div className="bg-slate-50 border border-dashed border-slate-200 rounded-xl p-8 text-center text-slate-400 text-sm italic">
                                        No hay urgencias o emergencias pendientes.
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* COLUMNA 2: OSER */}
                        <div className="bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col h-full overflow-hidden">
                            <div className="bg-amber-50 border-b border-amber-100 p-4 flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <span className="material-symbols-outlined text-amber-600 font-bold">clinical_notes</span>
                                    <h3 className="font-bold text-slate-900 text-base">OSER</h3>
                                </div>
                                <span className="bg-amber-100 text-amber-800 text-xs font-black px-2.5 py-1 rounded-full">
                                    {oserRanking.length}
                                </span>
                            </div>
                            <div className="p-4 flex-1 overflow-y-auto space-y-3 max-h-[calc(100vh-280px)] min-h-[400px]">
                                {oserRanking.length > 0 ? (
                                    oserRanking.map(p => (
                                        <PatientCard key={p.id} patient={p} userRole={user?.role} currentUser={user} artSet={artCoveragesSet} onCancel={(pt) => setCancelModal({ isOpen: true, patient: pt, reason: '', isSubmitting: false })} />
                                    ))
                                ) : (
                                    <div className="bg-slate-50 border border-dashed border-slate-200 rounded-xl p-8 text-center text-slate-400 text-sm italic">
                                        No hay cirugías de OSER pendientes.
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* COLUMNA 3: PREPAGAS */}
                        <div className="bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col h-full overflow-hidden">
                            <div className="bg-blue-50 border-b border-blue-100 p-4 flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <span className="material-symbols-outlined text-blue-600 font-bold">domain</span>
                                    <h3 className="font-bold text-slate-900 text-base">Prepagas</h3>
                                </div>
                                <span className="bg-blue-100 text-blue-800 text-xs font-black px-2.5 py-1 rounded-full">
                                    {prepagasRanking.length}
                                </span>
                            </div>
                            <div className="p-4 flex-1 overflow-y-auto space-y-3 max-h-[calc(100vh-280px)] min-h-[400px]">
                                {prepagasRanking.length > 0 ? (
                                    prepagasRanking.map(p => (
                                        <PatientCard key={p.id} patient={p} userRole={user?.role} currentUser={user} artSet={artCoveragesSet} onCancel={(pt) => setCancelModal({ isOpen: true, patient: pt, reason: '', isSubmitting: false })} />
                                    ))
                                ) : (
                                    <div className="bg-slate-50 border border-dashed border-slate-200 rounded-xl p-8 text-center text-slate-400 text-sm italic">
                                        No hay cirugías de Prepagas pendientes.
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* COLUMNA 4: ART Y PARTICULARES (Muestra sin requerir autorización) */}
                        <div className="bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col h-full overflow-hidden">
                            <div className="bg-emerald-50 border-b border-emerald-100 p-4 flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <span className="material-symbols-outlined text-emerald-600 font-bold">verified_user</span>
                                    <h3 className="font-bold text-slate-900 text-base">ART y Particulares</h3>
                                </div>
                                <span className="bg-emerald-100 text-emerald-800 text-xs font-black px-2.5 py-1 rounded-full">
                                    {artParticularesRanking.length}
                                </span>
                            </div>
                            <div className="p-4 flex-1 overflow-y-auto space-y-3 max-h-[calc(100vh-280px)] min-h-[400px]">
                                {artParticularesRanking.length > 0 ? (
                                    artParticularesRanking.map(p => (
                                        <PatientCard key={p.id} patient={p} userRole={user?.role} currentUser={user} artSet={artCoveragesSet} onCancel={(pt) => setCancelModal({ isOpen: true, patient: pt, reason: '', isSubmitting: false })} />
                                    ))
                                ) : (
                                    <div className="bg-slate-50 border border-dashed border-slate-200 rounded-xl p-8 text-center text-slate-400 text-sm italic">
                                        No hay cirugías de ART o Particulares pendientes.
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                ) : viewMode === 'pending_ortho' ? (
                    /* --- VIEW MODE: PENDIENTES ORTOPEDIA --- */
                    <div className="flex flex-col gap-8 animate-fadeIn">
                        {/* Header Banner */}
                        <div className="bg-purple-900 text-white rounded-2xl p-6 shadow-lg border border-purple-800 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                            <div>
                                <div className="flex items-center gap-2">
                                    <span className="material-symbols-outlined text-purple-300 text-2xl font-bold">inventory_2</span>
                                    <h2 className="text-xl font-black tracking-tight">Cirugías Pendientes de Ortopedia / Autorización</h2>
                                </div>
                                <p className="text-purple-200 text-xs mt-1">
                                    Supervisión y control de solicitudes de material para Ortopedia Capital y OSER.
                                </p>
                            </div>

                            <div className="flex items-center gap-3 flex-wrap">
                                <div className="bg-purple-950/60 px-4 py-2 rounded-xl border border-purple-700/50 flex items-center gap-3">
                                    <span className="text-2xl font-black text-purple-200">{pendingOrthoAuthorized.length}</span>
                                    <span className="text-[10px] font-bold uppercase tracking-wider text-purple-300">Aut. / Ortopedia</span>
                                </div>
                                <div className="bg-amber-950/60 px-4 py-2 rounded-xl border border-amber-700/50 flex items-center gap-3">
                                    <span className="text-2xl font-black text-amber-300">{pendingOrthoWaitingAuth.length}</span>
                                    <span className="text-[10px] font-bold uppercase tracking-wider text-amber-300">Esperando Aut.</span>
                                </div>
                                <div className="bg-orange-950/60 px-4 py-2 rounded-xl border border-orange-700/50 flex items-center gap-3">
                                    <span className="text-2xl font-black text-orange-300">{pendingOrthoSuspended.length}</span>
                                    <span className="text-[10px] font-bold uppercase tracking-wider text-orange-300">Suspendidas</span>
                                </div>
                                <div className="bg-red-950/60 px-4 py-2 rounded-xl border border-red-700/50 flex items-center gap-3">
                                    <span className="text-2xl font-black text-red-300">{pendingOrthoCancelled.length}</span>
                                    <span className="text-[10px] font-bold uppercase tracking-wider text-red-300">Canceladas</span>
                                </div>

                                {/* MÉTRICAS Y PROMEDIOS DE TIEMPO DE ESPERA */}
                                <div className="w-full border-t border-purple-800/80 pt-3 mt-1 flex flex-wrap items-center gap-3 justify-end text-xs">
                                    {/* Métrica 1: Reemplazo de "Demora promedio post-autorización" por "Internación en ≤ 7 días con material pendiente: N" */}
                                    <button
                                        type="button"
                                        onClick={() => setPendingOrthoFilterWithin7Days(prev => !prev)}
                                        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-all ${
                                            pendingOrthoFilterWithin7Days
                                                ? 'bg-rose-900 text-white border-rose-400 ring-2 ring-rose-400'
                                                : 'bg-purple-950/40 border-purple-800/50 text-purple-200 hover:bg-purple-950/70'
                                        }`}
                                        title="Clic para filtrar únicamente las cirugías con internación en ≤ 7 días y material pendiente"
                                    >
                                        <span className="material-symbols-outlined text-rose-400 text-sm">alarm</span>
                                        <span className="text-[11px] font-medium">Internación en ≤ 7 días con material pendiente:</span>
                                        <span className="font-black text-rose-300 bg-rose-950/80 px-2 py-0.5 rounded text-[11px] border border-rose-800/60">
                                            {orthoWithin7DaysCount}
                                        </span>
                                    </button>

                                    {/* Métrica 2: Espera total promedio desde ingreso */}
                                    <div className="flex items-center gap-2 bg-purple-950/40 px-3 py-1.5 rounded-lg border border-purple-800/50" title="Promedio de días transcurridos desde el ingreso de la solicitud al sistema">
                                        <span className="material-symbols-outlined text-amber-400 text-sm">hourglass_bottom</span>
                                        <span className="text-purple-200 text-[11px] font-medium">Espera Total Promedio (Ingreso):</span>
                                        <span className="font-black text-amber-300 bg-amber-950/80 px-2 py-0.5 rounded text-[11px] border border-amber-800/60">
                                            {avgDaysTotalWaiting} {avgDaysTotalWaiting === 1 ? 'día' : 'días'}
                                        </span>
                                    </div>

                                    {/* Métrica 3: Histórico respuesta ortopedia (últimos 12 meses sobre cirugías de DB con material) */}
                                    {historicalOrthoStats.avgDays !== null && (
                                        <div className="flex items-center gap-2 bg-purple-950/40 px-3 py-1.5 rounded-lg border border-purple-800/50" title={`Promedio en los últimos 12 meses (${historicalOrthoStats.totalCases} cirugías con material evaluadas en Capital/OSER)`}>
                                            <span className="material-symbols-outlined text-emerald-400 text-sm">history_toggle_off</span>
                                            <span className="text-purple-200 text-[11px] font-medium">Histórico Respuesta Ortopedia:</span>
                                            <span className="font-black text-emerald-300 bg-emerald-950/80 px-2 py-0.5 rounded text-[11px] border border-emerald-800/60">
                                                {historicalOrthoStats.avgDays} {historicalOrthoStats.avgDays === 1 ? 'día' : 'días'}
                                            </span>
                                            <span className="text-[10px] text-purple-200 font-semibold">
                                                (sobre {historicalOrthoStats.totalCases} cirugías)
                                            </span>
                                            {historicalOrthoStats.pctBeforeAuth !== null && (
                                                <span className="text-[10px] text-emerald-200 font-bold ml-1" title="Porcentaje de cirugías validadas antes de la fecha autorizada de internación">
                                                    · {historicalOrthoStats.pctBeforeAuth}% validadas antes de internación
                                                </span>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* SECCIÓN 1: AUTORIZADAS - PENDIENTES DE ORTOPEDIA */}
                        <section className="bg-purple-50/40 rounded-xl border border-purple-200/80 p-4 transition-all">
                            <SectionHeader
                                title="Cirugías Autorizadas - Pendientes de Material de Ortopedia"
                                count={pendingOrthoAuthorized.length}
                                colorClass="text-purple-700"
                                icon="hourglass_top"
                                sectionKey="ortho_authorized"
                            />

                            {!isSectionCollapsed('ortho_authorized', pendingOrthoAuthorized.length) && (
                                <div className="mt-4">
                                    {pendingOrthoAuthorized.length > 0 ? (
                                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 animate-fadeIn">
                                            {pendingOrthoAuthorized.map(p => (
                                                <PatientCard
                                                    key={p.id}
                                                    patient={p}
                                                    userRole={user?.role}
                                                    currentUser={user}
                                                    highlight="MAT"
                                                    artSet={artCoveragesSet}
                                                    onCancel={(pt) => setCancelModal({ isOpen: true, patient: pt, reason: '', isSubmitting: false })}
                                                />
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="bg-white/60 border border-dashed border-purple-200 rounded-xl p-6 text-center">
                                            <p className="text-purple-700/70 text-sm italic">No hay cirugías autorizadas pendientes de aprobación por ortopedia.</p>
                                        </div>
                                    )}
                                </div>
                            )}
                        </section>

                        {/* SECCIÓN 2: PENDIENTES DE AUTORIZACIÓN DE COBERTURA */}
                        <section className="bg-amber-50/40 rounded-xl border border-amber-200/80 p-4 transition-all">
                            <SectionHeader
                                title="Cirugías Pendientes de Autorización de Cobertura"
                                count={pendingOrthoWaitingAuth.length}
                                colorClass="text-amber-700"
                                icon="pending_actions"
                                sectionKey="ortho_waiting_auth"
                            />

                            {!isSectionCollapsed('ortho_waiting_auth', pendingOrthoWaitingAuth.length) && (
                                <div className="mt-4">
                                    {pendingOrthoWaitingAuth.length > 0 ? (
                                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 animate-fadeIn">
                                            {pendingOrthoWaitingAuth.map(p => (
                                                <PatientCard
                                                    key={p.id}
                                                    patient={p}
                                                    userRole={user?.role}
                                                    currentUser={user}
                                                    highlight="MAT"
                                                    artSet={artCoveragesSet}
                                                    onCancel={(pt) => setCancelModal({ isOpen: true, patient: pt, reason: '', isSubmitting: false })}
                                                />
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="bg-white/60 border border-dashed border-amber-200 rounded-xl p-6 text-center">
                                            <p className="text-amber-700/70 text-sm italic">No hay cirugías pendientes de autorización de cobertura.</p>
                                        </div>
                                    )}
                                </div>
                            )}
                        </section>

                        {/* SECCIÓN 3: SUSPENDIDAS PENDIENTES DE ORTOPEDIA */}
                        <section className="bg-orange-50/40 rounded-xl border border-orange-200/80 p-4 transition-all">
                            <SectionHeader
                                title="Cirugías Suspendidas Pendientes de Aprobación"
                                count={pendingOrthoSuspended.length}
                                colorClass="text-orange-600"
                                icon="pause_circle"
                                sectionKey="ortho_suspended"
                            />

                            {!isSectionCollapsed('ortho_suspended', pendingOrthoSuspended.length) && (
                                <div className="mt-4">
                                    {pendingOrthoSuspended.length > 0 ? (
                                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 animate-fadeIn">
                                            {pendingOrthoSuspended.map(p => (
                                                <PatientCard
                                                    key={p.id}
                                                    patient={p}
                                                    userRole={user?.role}
                                                    currentUser={user}
                                                    highlight="MAT"
                                                    isSuspended={true}
                                                    artSet={artCoveragesSet}
                                                    onCancel={(pt) => setCancelModal({ isOpen: true, patient: pt, reason: '', isSubmitting: false })}
                                                />
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="bg-white/60 border border-dashed border-orange-200 rounded-xl p-6 text-center">
                                            <p className="text-amber-700/70 text-sm italic">No hay cirugías suspendidas pendientes de aprobación por ortopedia.</p>
                                        </div>
                                    )}
                                </div>
                            )}
                        </section>

                        {/* SECCIÓN 4: CANCELADAS PENDIENTES DE ORTOPEDIA */}
                        <section className="bg-red-50/40 rounded-xl border border-red-200/80 p-4 transition-all">
                            <SectionHeader
                                title="Cirugías Canceladas"
                                count={pendingOrthoCancelled.length}
                                colorClass="text-red-600"
                                icon="cancel"
                                sectionKey="ortho_cancelled"
                            />

                            {!isSectionCollapsed('ortho_cancelled', pendingOrthoCancelled.length) && (
                                <div className="mt-4">
                                    {pendingOrthoCancelled.length > 0 ? (
                                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 animate-fadeIn">
                                            {pendingOrthoCancelled.map(p => (
                                                <div key={p.id} className="opacity-75">
                                                    <PatientCard
                                                        patient={p}
                                                        userRole={user?.role}
                                                        currentUser={user}
                                                        highlight="MAT"
                                                        artSet={artCoveragesSet}
                                                        onCancel={(pt) => setCancelModal({ isOpen: true, patient: pt, reason: '', isSubmitting: false })}
                                                    />
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="bg-white/60 border border-dashed border-red-200 rounded-xl p-6 text-center">
                                            <p className="text-red-700/70 text-sm italic">No hay cirugías canceladas con material pendiente.</p>
                                        </div>
                                    )}
                                </div>
                            )}
                        </section>
                    </div>
                ) : viewMode === 'flow' ? (
                    /* --- VIEW MODE: FLUJO PRE-QUIRÚRGICO (Etapas Excluyentes a..g) --- */
                    <div className="flex flex-col gap-8">
                        {/* BLOQUE ATENCIÓN INMEDIATA */}
                        <div className="bg-white rounded-xl border border-red-200 shadow-sm p-4 mb-2">
                            <div className="flex items-center justify-between mb-3 border-b border-red-100 pb-2 flex-wrap gap-2">
                                <div className="flex items-center gap-2">
                                    <span className="material-symbols-outlined text-red-600 font-bold">priority_high</span>
                                    <h3 className="font-bold text-slate-900 text-sm uppercase tracking-wider">Atención Inmediata</h3>
                                    <span className="bg-red-100 text-red-800 text-[10px] font-black px-2 py-0.5 rounded-full">
                                        {immediateAttentionList.length}
                                    </span>
                                </div>
                                <span className="text-[11px] text-slate-500 font-medium">
                                    Cirugías en próximos 7 días con pendientes, ART críticas o internaciones urgentes
                                </span>
                            </div>

                            {immediateAttentionList.length > 0 ? (
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left text-xs">
                                        <thead>
                                            <tr className="border-b border-slate-200 text-slate-500 text-[10px] uppercase font-bold bg-slate-50">
                                                <th className="py-2 px-3">Fecha y Hora</th>
                                                <th className="py-2 px-3">Quirófano</th>
                                                <th className="py-2 px-3">Paciente</th>
                                                <th className="py-2 px-3">Cirujano</th>
                                                <th className="py-2 px-3">Qué Falta</th>
                                                <th className="py-2 px-3">Responsable</th>
                                                <th className="py-2 px-3 text-right">Acción</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {immediateAttentionList.map(item => (
                                                <tr
                                                    key={item.patient.id}
                                                    onClick={() => navigate(`/detail/${item.patient.id}`, { state: { from: '/kanban' } })}
                                                    className="hover:bg-red-50/50 cursor-pointer transition-colors"
                                                >
                                                    <td className="py-2.5 px-3 font-semibold text-slate-900 whitespace-nowrap">
                                                        {item.patient.surgeryDate ? (
                                                            <>
                                                                <span className="text-red-700 font-bold">{formatDisplayDate(item.patient.surgeryDate)}</span>
                                                                {item.patient.startTime && <span className="text-slate-500 ml-1">({item.patient.startTime})</span>}
                                                            </>
                                                        ) : (
                                                            <span className="text-slate-400 italic">Sin fecha</span>
                                                        )}
                                                    </td>
                                                    <td className="py-2.5 px-3 text-slate-700 whitespace-nowrap">
                                                        {item.patient.orName || <span className="text-slate-400 italic">--</span>}
                                                    </td>
                                                    <td className="py-2.5 px-3">
                                                        <div className="font-bold text-slate-900 leading-tight">{toTitleCase(item.patient.name)}</div>
                                                        <div className="text-[10px] text-slate-500 font-mono">DNI: {item.patient.patientDocument} • {item.patient.medicalCoverage}</div>
                                                    </td>
                                                    <td className="py-2.5 px-3 text-slate-700 whitespace-nowrap">
                                                        {item.patient.doctor}
                                                    </td>
                                                    <td className="py-2.5 px-3">
                                                        <div className="flex flex-wrap gap-1">
                                                            {item.missingItems.map((m, idx) => (
                                                                <span key={idx} className="bg-red-50 text-red-700 border border-red-200 px-1.5 py-0.5 rounded text-[10px] font-bold">
                                                                    {m}
                                                                </span>
                                                            ))}
                                                        </div>
                                                    </td>
                                                    <td className="py-2.5 px-3 whitespace-nowrap">
                                                        <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-tight ${
                                                            item.responsible === 'Ortopedia'
                                                                ? 'bg-purple-100 text-purple-800 border border-purple-200'
                                                                : item.responsible === 'Internación'
                                                                    ? 'bg-blue-100 text-blue-800 border border-blue-200'
                                                                    : item.responsible === 'Quirófano'
                                                                        ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                                                                        : 'bg-amber-100 text-amber-800 border border-amber-200'
                                                        }`}>
                                                            {item.responsible}
                                                        </span>
                                                    </td>
                                                    <td className="py-2.5 px-3 text-right whitespace-nowrap">
                                                        <span className="text-primary hover:underline font-bold text-xs inline-flex items-center gap-0.5">
                                                            Ver Ficha <span className="material-symbols-outlined text-xs">arrow_forward</span>
                                                        </span>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            ) : (
                                <div className="py-3 px-4 text-center text-xs text-slate-500 italic bg-slate-50/60 rounded-lg">
                                    Sin pendientes urgentes
                                </div>
                            )}
                        </div>

                        {/* SECCIÓN a: OSER SIN APROBAR MATERIAL */}
                        <section className="bg-amber-50/40 rounded-xl border border-amber-200/80 p-4 transition-all">
                            <SectionHeader
                                title="OSER sin aprobar material"
                                count={displayA_OserPending.length}
                                colorClass="text-amber-600"
                                icon="pending_actions"
                                sectionKey="oser_pending_material"
                            />

                            {!isSectionCollapsed('oser_pending_material', displayA_OserPending.length) && (
                                <div className="mt-4">
                                    {displayA_OserPending.length > 0 ? (
                                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 animate-fadeIn">
                                            {displayA_OserPending.map(p => (
                                                <PatientCard key={p.id} patient={p} userRole={user?.role} currentUser={user} highlight="MAT" artSet={artCoveragesSet} onCancel={(pt) => setCancelModal({ isOpen: true, patient: pt, reason: '', isSubmitting: false })} />
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="bg-white/60 border border-dashed border-amber-200 rounded-xl p-6 text-center">
                                            <p className="text-amber-700/70 text-sm italic">No hay cirugías de OSER autorizadas pendientes de aprobación de material.</p>
                                        </div>
                                    )}
                                </div>
                            )}
                        </section>

                        {/* SECCIÓN b: OSER MATERIAL APROBADO (CAPITAL) */}
                        <section className="bg-emerald-50/40 rounded-xl border border-emerald-200/80 p-4 transition-all">
                            <SectionHeader
                                title="OSER material aprobado (Capital)"
                                count={displayB_OserApproved.length}
                                colorClass="text-emerald-600"
                                icon="task_alt"
                                sectionKey="oser_approved_material"
                            />

                            {!isSectionCollapsed('oser_approved_material', displayB_OserApproved.length) && (
                                <div className="mt-4">
                                    {displayB_OserApproved.length > 0 ? (
                                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 animate-fadeIn">
                                            {displayB_OserApproved.map(p => (
                                                <PatientCard key={p.id} patient={p} userRole={user?.role} currentUser={user} highlight="MAT" artSet={artCoveragesSet} onCancel={(pt) => setCancelModal({ isOpen: true, patient: pt, reason: '', isSubmitting: false })} />
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="bg-white/60 border border-dashed border-emerald-200 rounded-xl p-6 text-center">
                                            <p className="text-emerald-700/70 text-sm italic">No hay cirugías autorizadas con material aprobado por Ortopedia Capital.</p>
                                        </div>
                                    )}
                                </div>
                            )}
                        </section>

                        {/* SECCIÓN c: OTRAS COBERTURAS CON INTERNACIÓN AUTORIZADA SIN FECHA */}
                        <section className="bg-white/50 rounded-xl border border-slate-200 p-4 transition-all">
                            <SectionHeader
                                title="Otras Coberturas con Internación Autorizada sin Fecha"
                                count={displayC_OtherAuth.length}
                                colorClass="text-blue-600"
                                icon="verified"
                                sectionKey="other_authorized"
                            />

                            {!isSectionCollapsed('other_authorized', displayC_OtherAuth.length) && (
                                <div className="mt-4">
                                    {displayC_OtherAuth.length > 0 ? (
                                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 animate-fadeIn">
                                            {displayC_OtherAuth.map(p => (
                                                <PatientCard key={p.id} patient={p} userRole={user?.role} currentUser={user} artSet={artCoveragesSet} onCancel={(pt) => setCancelModal({ isOpen: true, patient: pt, reason: '', isSubmitting: false })} />
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="bg-slate-50 border border-dashed border-slate-200 rounded-xl p-6 text-center">
                                            <p className="text-slate-400 text-sm italic">No hay cirugías de otras coberturas con internación autorizada pendientes de fecha.</p>
                                        </div>
                                    )}
                                </div>
                            )}
                        </section>

                        {/* SECCIÓN d: SIN AUTORIZACIÓN DE INTERNACIÓN */}
                        <section className="bg-white/50 rounded-xl border border-slate-200 p-4 transition-all">
                            <SectionHeader
                                title="Sin Autorización de Internación"
                                count={displayD_NoAuth.length}
                                colorClass="text-indigo-500"
                                icon="new_releases"
                                sectionKey="unscheduled"
                            />

                            {!isSectionCollapsed('unscheduled', displayD_NoAuth.length) && (
                                <div className="mt-4 animate-fadeIn">
                                    {displayD_NoAuth.length > 0 ? (
                                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                                            {displayD_NoAuth.map(p => <PatientCard key={p.id} patient={p} userRole={user?.role} currentUser={user} artSet={artCoveragesSet} onCancel={(pt) => setCancelModal({ isOpen: true, patient: pt, reason: '', isSubmitting: false })} />)}
                                        </div>
                                    ) : (
                                        <div className="bg-slate-50 border border-dashed border-slate-200 rounded-xl p-6 text-center">
                                            <p className="text-slate-400 text-sm italic">No hay solicitudes sin autorización de internación.</p>
                                        </div>
                                    )}
                                </div>
                            )}
                        </section>

                        {/* SECCIÓN e: ART Y PARTICULARES SIN FECHA */}
                        <section className="bg-emerald-50/20 rounded-xl border border-emerald-200/60 p-4 transition-all">
                            <SectionHeader
                                title="ART y Particulares sin Fecha"
                                count={displayE_ArtParticular.length}
                                colorClass="text-emerald-700"
                                icon="verified_user"
                                sectionKey="art_particular"
                            />

                            {!isSectionCollapsed('art_particular', displayE_ArtParticular.length) && (
                                <div className="mt-4">
                                    {displayE_ArtParticular.length > 0 ? (
                                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 animate-fadeIn">
                                            {displayE_ArtParticular.map(p => (
                                                <PatientCard key={p.id} patient={p} userRole={user?.role} currentUser={user} artSet={artCoveragesSet} onCancel={(pt) => setCancelModal({ isOpen: true, patient: pt, reason: '', isSubmitting: false })} />
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="bg-white/60 border border-dashed border-emerald-200 rounded-xl p-6 text-center">
                                            <p className="text-emerald-700/70 text-sm italic">No hay cirugías de ART o Particulares pendientes de fecha.</p>
                                        </div>
                                    )}
                                </div>
                            )}
                        </section>

                        {/* SECCIÓN f: VALIDADAS (LISTAS PARA PROGRAMAR) */}
                        <section className="bg-emerald-50/30 rounded-xl border border-emerald-100 p-4 transition-all">
                            <SectionHeader
                                title="Validadas (Listas para Programar)"
                                count={displayF_Ready.length}
                                colorClass="text-emerald-600"
                                icon="task_alt"
                                sectionKey="ready"
                            />

                            {!isSectionCollapsed('ready', displayF_Ready.length) && (
                                <div className="mt-4">
                                    {displayF_Ready.length > 0 ? (
                                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 animate-fadeIn">
                                            {displayF_Ready.map(p => (
                                                <div key={p.id} className="relative group">
                                                    <PatientCard patient={p} userRole={user?.role} currentUser={user} artSet={artCoveragesSet} onCancel={(pt) => setCancelModal({ isOpen: true, patient: pt, reason: '', isSubmitting: false })} />
                                                    <div className="absolute top-0 right-0 -mt-1 -mr-1 size-4 bg-emerald-500 rounded-full border-2 border-white shadow-sm animate-pulse z-20"></div>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="bg-white/50 border border-dashed border-slate-200 rounded-xl p-6 text-center">
                                            <p className="text-slate-400 text-sm italic">No hay cirugías 100% validadas pendientes de fecha.</p>
                                        </div>
                                    )}
                                </div>
                            )}
                        </section>

                        {/* SECCIÓN g: CIRUGÍAS CON FECHA ASIGNADA (SOLO HOY Y FUTURAS) */}
                        <section className="bg-indigo-50/30 rounded-xl border border-indigo-100 p-4 transition-all">
                            <SectionHeader
                                title="Cirugías con Fecha Asignada"
                                count={displayG_Scheduled.length}
                                colorClass="text-indigo-600"
                                icon="calendar_today"
                                sectionKey="scheduled"
                            />

                            {!isSectionCollapsed('scheduled', displayG_Scheduled.length) && (
                                <div className="mt-4">
                                    {displayG_Scheduled.length > 0 ? (
                                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 animate-fadeIn">
                                            {displayG_Scheduled.map(p => (
                                                <PatientCard key={p.id} patient={p} userRole={user?.role} currentUser={user} artSet={artCoveragesSet} onCancel={(pt) => setCancelModal({ isOpen: true, patient: pt, reason: '', isSubmitting: false })} />
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="bg-white/50 border border-dashed border-indigo-200 rounded-xl p-6 text-center">
                                            <p className="text-indigo-600/70 text-sm italic">No hay cirugías activas con fecha programada vigente.</p>
                                        </div>
                                    )}
                                </div>
                            )}
                        </section>
                    </div>
                ) : viewMode === 'suspended_cancelled' ? (
                    /* --- VIEW MODE: SUSPENDIDAS Y CANCELADAS --- */
                    <div className="flex flex-col gap-8 animate-fadeIn">
                        {/* Header Banner */}
                        <div className="bg-slate-900 text-white rounded-2xl p-6 shadow-lg border border-slate-800 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                            <div>
                                <div className="flex items-center gap-2">
                                    <span className="material-symbols-outlined text-amber-400 text-2xl font-bold">pause_circle</span>
                                    <h2 className="text-xl font-black tracking-tight">Cirugías Suspendidas y Canceladas</h2>
                                </div>
                                <p className="text-slate-300 text-xs mt-1">
                                    Control de pacientes fuera de la programación activa. Reincorporación al flujo activo o baja definitiva con auditoría.
                                </p>
                            </div>
                            <div className="flex items-center gap-3 flex-wrap">
                                <div className="bg-amber-950/60 px-4 py-2 rounded-xl border border-amber-700/50 flex items-center gap-3">
                                    <span className="text-2xl font-black text-amber-400">{suspendedPatients.length}</span>
                                    <span className="text-[10px] font-bold uppercase tracking-wider text-amber-300">Suspendidas</span>
                                </div>
                                <div className="bg-red-950/60 px-4 py-2 rounded-xl border border-red-700/50 flex items-center gap-3">
                                    <span className="text-2xl font-black text-red-400">{cancelledPatients.length}</span>
                                    <span className="text-[10px] font-bold uppercase tracking-wider text-red-300">Canceladas</span>
                                </div>
                            </div>
                        </div>

                        {/* SECCIÓN 1: SUSPENDIDAS */}
                        <section className="bg-amber-50/40 rounded-xl border border-amber-200/80 p-5 transition-all">
                            <div className="flex items-center justify-between mb-4">
                                <div className="flex items-center gap-2">
                                    <span className="material-symbols-outlined text-amber-600">pause_circle</span>
                                    <h2 className="text-lg font-bold text-slate-900">Cirugías Suspendidas</h2>
                                    <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800">
                                        {suspendedPatients.length}
                                    </span>
                                </div>
                            </div>

                            {suspendedPatients.length > 0 ? (
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 animate-fadeIn">
                                    {suspendedPatients.map(p => {
                                        let daysAgo = 0;
                                        if (p.suspendedAt) {
                                            const suspLocal = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(p.suspendedAt));
                                            daysAgo = Math.max(0, getDaysDiffFromDates(suspLocal, todayStr));
                                        }

                                        return (
                                            <div key={p.id} className="bg-white rounded-xl border border-amber-200 p-4 shadow-sm hover:shadow transition-all flex flex-col justify-between">
                                                <div>
                                                    <div className="flex items-start justify-between gap-2 mb-2">
                                                        <div>
                                                            <h4 className="font-bold text-slate-900 text-sm">{toTitleCase(p.name)}</h4>
                                                            <p className="text-xs text-slate-500 font-mono">DNI: {p.patientDocument} • {p.age} años</p>
                                                        </div>
                                                        <span className="bg-amber-100 text-amber-800 text-[9px] font-black px-2 py-0.5 rounded uppercase">
                                                            Suspendida
                                                        </span>
                                                    </div>

                                                    <div className="space-y-1.5 text-xs text-slate-600 mb-3 bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                                                        <div className="flex items-center gap-1.5 truncate">
                                                            <span className="material-symbols-outlined text-sm text-slate-400">person</span>
                                                            <span className="truncate">{p.doctor}</span>
                                                        </div>
                                                        <div className="flex items-center gap-1.5 truncate">
                                                            <span className="material-symbols-outlined text-sm text-slate-400">medical_information</span>
                                                            <span className="truncate">{p.proc}</span>
                                                        </div>
                                                        {p.medicalCoverage && (
                                                            <div className="flex items-center gap-1.5 truncate">
                                                                <span className="material-symbols-outlined text-sm text-slate-400">health_and_safety</span>
                                                                <span className="truncate font-semibold">{p.medicalCoverage}</span>
                                                            </div>
                                                        )}
                                                        {p.surgeryDate && (
                                                            <div className="flex items-center gap-1.5 truncate text-slate-500">
                                                                <span className="material-symbols-outlined text-sm text-slate-400">event</span>
                                                                <span>Fecha previa: {formatDisplayDate(p.surgeryDate)}</span>
                                                            </div>
                                                        )}

                                                        {/* Información enriquecida de suspensión */}
                                                        {p.suspendedAt && (
                                                            <div className="text-[11px] text-amber-800 font-semibold flex items-center gap-1 pt-1 border-t border-slate-200/60">
                                                                <span className="material-symbols-outlined text-xs">schedule</span>
                                                                <span>Suspendida hace {daysAgo} {daysAgo === 1 ? 'día' : 'días'}{p.suspendedByName ? ` · por ${p.suspendedByName}` : ''}</span>
                                                            </div>
                                                        )}

                                                        {p.suspensionReason && (
                                                            <div className="pt-1 text-[11px] text-amber-950">
                                                                <span className="font-bold">Motivo:</span> {p.suspensionReason}
                                                            </div>
                                                        )}
                                                        {p.suspensionObservations && (
                                                            <div className="text-[10px] text-slate-600 italic">
                                                                <span className="font-semibold">Obs:</span> {p.suspensionObservations}
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>

                                                {/* Action Buttons */}
                                                <div className="pt-3 border-t border-slate-100 flex flex-col gap-2">
                                                    <button
                                                        onClick={() => handleReincorporateSurgery(p)}
                                                        className="w-full bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold py-2 px-3 rounded-lg flex items-center justify-center gap-1.5 shadow-sm transition-colors"
                                                    >
                                                        <span className="material-symbols-outlined text-sm">replay</span>
                                                        Reincorporar al Flujo
                                                    </button>

                                                    <div className="flex gap-2">
                                                        <button
                                                            onClick={() => navigate(`/detail/${p.id}`, { state: { from: '/kanban' } })}
                                                            className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold py-1.5 rounded-lg text-center transition-colors"
                                                        >
                                                            Ver Ficha
                                                        </button>

                                                        {user?.role === 'SuperAdmin' ? (
                                                            <button
                                                                onClick={() => handleDeletePermanent(p)}
                                                                className="flex-1 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 text-xs font-bold py-1.5 rounded-lg flex items-center justify-center gap-1 transition-colors"
                                                                title="Eliminar permanentemente de la base de datos"
                                                            >
                                                                <span className="material-symbols-outlined text-xs">delete_forever</span>
                                                                Eliminar
                                                            </button>
                                                        ) : (
                                                            <button
                                                                onClick={() => setRequestDeleteModal({ isOpen: true, patient: p, reason: '' })}
                                                                className="flex-1 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 text-xs font-bold py-1.5 rounded-lg flex items-center justify-center gap-1 transition-colors"
                                                                title="Confirmar y solicitar eliminación definitiva a SuperAdmin"
                                                            >
                                                                <span className="material-symbols-outlined text-xs">notification_important</span>
                                                                Solicitar Baja
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            ) : (
                                <div className="bg-white/60 border border-dashed border-amber-200 rounded-xl p-8 text-center">
                                    <p className="text-amber-800/70 text-sm italic">No hay cirugías suspendidas actualmente.</p>
                                </div>
                            )}
                        </section>

                        {/* SECCIÓN 2: CANCELADAS */}
                        <section className="bg-red-50/40 rounded-xl border border-red-200/80 p-5 transition-all">
                            <div className="flex items-center justify-between mb-4">
                                <div className="flex items-center gap-2">
                                    <span className="material-symbols-outlined text-red-600">cancel</span>
                                    <h2 className="text-lg font-bold text-slate-900">Cirugías Canceladas</h2>
                                    <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-red-100 text-red-800">
                                        {cancelledPatients.length}
                                    </span>
                                </div>
                            </div>

                            {cancelledPatients.length > 0 ? (
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 animate-fadeIn">
                                    {cancelledPatients.map(p => (
                                        <div key={p.id} className="bg-white rounded-xl border border-red-200 p-4 shadow-sm hover:shadow transition-all flex flex-col justify-between opacity-95">
                                            <div>
                                                <div className="flex items-start justify-between gap-2 mb-2">
                                                    <div>
                                                        <h4 className="font-bold text-slate-900 text-sm">{toTitleCase(p.name)}</h4>
                                                        <p className="text-xs text-slate-500 font-mono">DNI: {p.patientDocument} • {p.age} años</p>
                                                    </div>
                                                    <span className="bg-red-100 text-red-800 text-[9px] font-black px-2 py-0.5 rounded uppercase">
                                                        Cancelada
                                                    </span>
                                                </div>

                                                <div className="space-y-1.5 text-xs text-slate-600 mb-3 bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                                                    <div className="flex items-center gap-1.5 truncate">
                                                        <span className="material-symbols-outlined text-sm text-slate-400">person</span>
                                                        <span className="truncate">{p.doctor}</span>
                                                    </div>
                                                    <div className="flex items-center gap-1.5 truncate">
                                                        <span className="material-symbols-outlined text-sm text-slate-400">medical_information</span>
                                                        <span className="truncate">{p.proc}</span>
                                                    </div>
                                                    {p.medicalCoverage && (
                                                        <div className="flex items-center gap-1.5 truncate">
                                                            <span className="material-symbols-outlined text-sm text-slate-400">health_and_safety</span>
                                                            <span className="truncate font-semibold">{p.medicalCoverage}</span>
                                                        </div>
                                                    )}
                                                    {p.suspensionReason && (
                                                        <div className="pt-1 text-[11px] text-red-950 border-t border-slate-200/60">
                                                            <span className="font-bold">Motivo baja:</span> {p.suspensionReason}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Action Buttons */}
                                            <div className="pt-3 border-t border-slate-100 flex flex-col gap-2">
                                                <button
                                                    onClick={() => handleReincorporateSurgery(p)}
                                                    className="w-full bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold py-2 px-3 rounded-lg flex items-center justify-center gap-1.5 shadow-sm transition-colors"
                                                >
                                                    <span className="material-symbols-outlined text-sm">replay</span>
                                                    Reincorporar al Flujo
                                                </button>

                                                <div className="flex gap-2">
                                                    <button
                                                        onClick={() => navigate(`/detail/${p.id}`, { state: { from: '/kanban' } })}
                                                        className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold py-1.5 rounded-lg text-center transition-colors"
                                                    >
                                                        Ver Ficha
                                                    </button>

                                                    {user?.role === 'SuperAdmin' && (
                                                        <button
                                                            onClick={() => handleDeletePermanent(p)}
                                                            className="flex-1 bg-red-600 hover:bg-red-700 text-white text-xs font-bold py-1.5 rounded-lg flex items-center justify-center gap-1 transition-colors shadow-sm"
                                                            title="Eliminar permanentemente de la base de datos"
                                                        >
                                                            <span className="material-symbols-outlined text-xs">delete_forever</span>
                                                            Eliminar
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="bg-white/60 border border-dashed border-red-200 rounded-xl p-8 text-center">
                                    <p className="text-red-800/70 text-sm italic">No hay cirugías canceladas.</p>
                                </div>
                            )}
                        </section>
                    </div>
                ) : viewMode === 'past_unclosed' ? (
                    /* --- VIEW MODE: CIRUGÍAS PASADAS SIN CERRAR --- */
                    <div className="flex flex-col gap-8 animate-fadeIn">
                        {/* Header Banner */}
                        <div className="bg-rose-950 text-white rounded-2xl p-6 shadow-lg border border-rose-900 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                            <div>
                                <div className="flex items-center gap-2">
                                    <span className="material-symbols-outlined text-rose-400 text-2xl font-bold">history_toggle_off</span>
                                    <h2 className="text-xl font-black tracking-tight">Cirugías Pasadas sin Cerrar (Auditoría Quirúrgica)</h2>
                                </div>
                                <p className="text-rose-200 text-xs mt-1">
                                    Cirugías que figuraban programadas en calendario con fecha anterior a hoy ({formatDisplayDate(todayStr, true)}) y aún no fueron marcadas como completadas.
                                </p>
                            </div>
                            <div className="bg-rose-900/60 px-5 py-3 rounded-xl border border-rose-700/50 flex items-center gap-3">
                                <span className="text-3xl font-black text-rose-300">{pastUnclosedSurgeries.length}</span>
                                <span className="text-xs font-bold uppercase tracking-wider text-rose-200">Pendientes de Cierre</span>
                            </div>
                        </div>

                        {pastUnclosedSurgeries.length > 0 ? (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 animate-fadeIn">
                                {pastUnclosedSurgeries.map(p => (
                                    <div key={p.id} className="bg-white rounded-xl border border-rose-200 p-5 shadow-sm hover:shadow-md transition-all flex flex-col justify-between">
                                        <div>
                                            <div className="flex items-start justify-between gap-2 mb-3">
                                                <div>
                                                    <h3 className="font-bold text-slate-900 text-base leading-tight">{toTitleCase(p.name)}</h3>
                                                    <p className="text-xs text-slate-500 font-mono mt-0.5">DNI: {p.patientDocument} • {p.age} años</p>
                                                </div>
                                                <span className="bg-rose-100 text-rose-800 text-[10px] font-black px-2.5 py-1 rounded-full uppercase tracking-tight flex items-center gap-1">
                                                    <span className="material-symbols-outlined text-xs">warning</span>
                                                    Fecha Vencida
                                                </span>
                                            </div>

                                            <div className="space-y-2 text-xs text-slate-600 bg-rose-50/30 p-3 rounded-lg border border-rose-100 mb-4">
                                                <div className="flex items-center gap-2">
                                                    <span className="material-symbols-outlined text-rose-600 text-sm">calendar_month</span>
                                                    <span className="font-bold text-rose-950">
                                                        Fecha: {formatDisplayDate(p.surgeryDate)} {p.startTime ? `a las ${p.startTime}` : ''}
                                                    </span>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <span className="material-symbols-outlined text-slate-400 text-sm">person</span>
                                                    <span>Médico: <strong className="text-slate-800">{p.doctor}</strong></span>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <span className="material-symbols-outlined text-slate-400 text-sm">medical_information</span>
                                                    <span>Procedimiento: <strong className="text-slate-800">{p.proc}</strong></span>
                                                </div>
                                                {p.orName && (
                                                    <div className="flex items-center gap-2">
                                                        <span className="material-symbols-outlined text-slate-400 text-sm">meeting_room</span>
                                                        <span>Quirófano: <strong className="text-slate-800">{p.orName}</strong></span>
                                                    </div>
                                                )}
                                                {p.medicalCoverage && (
                                                    <div className="flex items-center gap-2">
                                                        <span className="material-symbols-outlined text-slate-400 text-sm">health_and_safety</span>
                                                        <span>Cobertura: <strong className="text-slate-800">{p.medicalCoverage}</strong></span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        {/* Action Buttons */}
                                        <div className="space-y-2 pt-3 border-t border-slate-100">
                                            <button
                                                onClick={() => openQuickCloseModal(p)}
                                                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2.5 px-3 rounded-lg text-xs flex items-center justify-center gap-2 shadow-sm transition-colors"
                                            >
                                                <span className="material-symbols-outlined text-base">check_circle</span>
                                                Cerrar Cirugía (Efectivamente Realizada)
                                            </button>

                                            <div className="grid grid-cols-2 gap-2">
                                                <button
                                                    onClick={() => handleMarkPastAsSuspended(p)}
                                                    className="bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 font-bold py-2 px-2 rounded-lg text-xs flex items-center justify-center gap-1 transition-colors"
                                                    title="Mover a Suspendidas si no se realizó"
                                                >
                                                    <span className="material-symbols-outlined text-sm">pause_circle</span>
                                                    No se realizó (Suspender)
                                                </button>

                                                <button
                                                    onClick={() => navigate(`/detail/${p.id}`, { state: { from: '/kanban' } })}
                                                    className="bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 font-bold py-2 px-2 rounded-lg text-xs flex items-center justify-center gap-1 transition-colors"
                                                >
                                                    <span className="material-symbols-outlined text-sm">edit_calendar</span>
                                                    Reprogramar Fecha
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="bg-white border-2 border-dashed border-slate-200 rounded-2xl p-12 text-center">
                                <span className="material-symbols-outlined text-4xl text-emerald-500 mb-2">task_alt</span>
                                <h3 className="text-base font-bold text-slate-800">¡Al día! No hay cirugías pasadas sin cerrar</h3>
                                <p className="text-xs text-slate-500 mt-1">Todas las cirugías de fechas anteriores han sido cerradas o suspendidas adecuadamente.</p>
                            </div>
                        )}
                    </div>
                ) : null}

                {/* MODAL: BAJA DEFINITIVA (Reemplaza confirm() y pide motivo obligatorio) */}
                {cancelModal.isOpen && cancelModal.patient && (
                    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fadeIn">
                        <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-100">
                            <div className="flex items-center gap-3 mb-4">
                                <div className="p-3 bg-red-100 text-red-700 rounded-xl">
                                    <span className="material-symbols-outlined text-2xl">person_remove</span>
                                </div>
                                <div>
                                    <h3 className="text-lg font-bold text-slate-900">Baja Definitiva de Cirugía</h3>
                                    <p className="text-xs text-slate-500">Esta acción cancela formalmente la intervención quirúrgica.</p>
                                </div>
                            </div>

                            <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-100 text-xs text-slate-700 mb-4">
                                <p><strong className="text-slate-900">Paciente:</strong> {toTitleCase(cancelModal.patient.name)} (DNI {cancelModal.patient.patientDocument})</p>
                                <p className="mt-1"><strong className="text-slate-900">Procedimiento:</strong> {cancelModal.patient.proc}</p>
                                <p className="mt-1"><strong className="text-slate-900">Médico:</strong> {cancelModal.patient.doctor}</p>
                            </div>

                            <div className="mb-4">
                                <label className="block text-xs font-bold text-slate-700 uppercase mb-1.5">
                                    Motivo de Cancelación Obligatorio *
                                </label>
                                <textarea
                                    rows={3}
                                    placeholder="Indique detalladamente el motivo de la baja (ej. Paciente no se opera, indicación médica cancelada, derivación)..."
                                    className="w-full text-xs rounded-xl border border-slate-200 p-3 focus:outline-none focus:ring-2 focus:ring-red-500 bg-white"
                                    value={cancelModal.reason}
                                    onChange={(e) => setCancelModal(prev => ({ ...prev, reason: e.target.value }))}
                                />
                            </div>

                            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                                <button
                                    onClick={() => setCancelModal({ isOpen: false, patient: null, reason: '', isSubmitting: false })}
                                    disabled={cancelModal.isSubmitting}
                                    className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition-colors"
                                >
                                    Cancelar
                                </button>
                                <button
                                    onClick={handleConfirmCancelSurgery}
                                    disabled={cancelModal.isSubmitting || !cancelModal.reason.trim()}
                                    className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold shadow-sm transition-colors flex items-center gap-1.5 disabled:opacity-50"
                                >
                                    <span className="material-symbols-outlined text-sm">delete</span>
                                    {cancelModal.isSubmitting ? 'Cancelando...' : 'Confirmar Baja Definitiva'}
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* MODAL: SOLICITAR ELIMINACIÓN DEFINITIVA */}
                {requestDeleteModal.isOpen && requestDeleteModal.patient && (
                    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fadeIn">
                        <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-100">
                            <div className="flex items-center gap-3 mb-4">
                                <div className="p-3 bg-amber-100 text-amber-700 rounded-xl">
                                    <span className="material-symbols-outlined text-2xl">notification_important</span>
                                </div>
                                <div>
                                    <h3 className="text-lg font-bold text-slate-900">Solicitar Eliminación Definitiva</h3>
                                    <p className="text-xs text-slate-500">Se generará una notificación prioritaria dirigida a SuperAdmin.</p>
                                </div>
                            </div>

                            <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 text-xs text-slate-700 mb-4">
                                <p><strong className="text-slate-900">Paciente:</strong> {toTitleCase(requestDeleteModal.patient.name)} (DNI {requestDeleteModal.patient.patientDocument})</p>
                                <p className="mt-1"><strong className="text-slate-900">Procedimiento:</strong> {requestDeleteModal.patient.proc}</p>
                                <p className="mt-1"><strong className="text-slate-900">Estado actual:</strong> {requestDeleteModal.patient.status}</p>
                            </div>

                            <div className="mb-4">
                                <label className="block text-xs font-bold text-slate-700 uppercase mb-1.5">
                                    Motivo de la Eliminación *
                                </label>
                                <textarea
                                    rows={3}
                                    placeholder="Explique detalladamente por qué se debe eliminar esta cirugía..."
                                    className="w-full text-xs rounded-xl border border-slate-200 p-3 focus:outline-none focus:ring-2 focus:ring-amber-500 bg-white"
                                    value={requestDeleteModal.reason}
                                    onChange={(e) => setRequestDeleteModal(prev => ({ ...prev, reason: e.target.value }))}
                                />
                            </div>

                            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                                <button
                                    onClick={() => setRequestDeleteModal({ isOpen: false, patient: null, reason: '' })}
                                    className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition-colors"
                                >
                                    Cancelar
                                </button>
                                <button
                                    onClick={handleRequestDeleteSubmit}
                                    className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold shadow-sm transition-colors flex items-center gap-1.5"
                                >
                                    <span className="material-symbols-outlined text-sm">send</span>
                                    Confirmar y Enviar Solicitud
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* MODAL: CIERRE RÁPIDO DE CIRUGÍA (Sin horarios precargados inventados) */}
                {quickCloseModal.isOpen && quickCloseModal.patient && (
                    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fadeIn">
                        <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-100">
                            <div className="flex items-center gap-3 mb-4">
                                <div className="p-3 bg-emerald-100 text-emerald-700 rounded-xl">
                                    <span className="material-symbols-outlined text-2xl">check_circle</span>
                                </div>
                                <div>
                                    <h3 className="text-lg font-bold text-slate-900">Cierre de Cirugía Realizada</h3>
                                    <p className="text-xs text-slate-500">Cargue los horarios reales para marcar la cirugía como Completada.</p>
                                </div>
                            </div>

                            <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-100 text-xs text-slate-700 mb-4">
                                <p><strong className="text-slate-900">Paciente:</strong> {toTitleCase(quickCloseModal.patient.name)} (DNI {quickCloseModal.patient.patientDocument})</p>
                                <p className="mt-1"><strong className="text-slate-900">Cirugía programada:</strong> {quickCloseModal.patient.proc}</p>
                                <p className="mt-1"><strong className="text-slate-900">Fecha agendada:</strong> {formatDisplayDate(quickCloseModal.patient.surgeryDate, true)} ({quickCloseModal.patient.doctor})</p>
                            </div>

                            <div className="grid grid-cols-2 gap-4 mb-4">
                                <div>
                                    <label className="block text-xs font-bold text-slate-700 uppercase mb-1.5">
                                        Hora Inicio Real *
                                    </label>
                                    <input
                                        type="time"
                                        required
                                        className="w-full text-xs rounded-xl border border-slate-200 p-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white font-mono"
                                        value={quickCloseModal.startTime}
                                        onChange={(e) => setQuickCloseModal(prev => ({ ...prev, startTime: e.target.value }))}
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-700 uppercase mb-1.5">
                                        Hora Fin Real *
                                    </label>
                                    <input
                                        type="time"
                                        required
                                        className="w-full text-xs rounded-xl border border-slate-200 p-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white font-mono"
                                        value={quickCloseModal.endTime}
                                        onChange={(e) => setQuickCloseModal(prev => ({ ...prev, endTime: e.target.value }))}
                                    />
                                </div>
                            </div>

                            {/* Selector Estricto de Instrumentadora / Técnica Participante */}
                            <div className="mb-4">
                                <label className="block text-xs font-bold text-slate-700 uppercase mb-1.5">
                                    Instrumentadora / Técnica (Liquidación)
                                </label>
                                <select
                                    className="w-full text-xs rounded-xl border border-slate-200 p-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
                                    value={quickCloseModal.instrumentadora}
                                    onChange={(e) => setQuickCloseModal(prev => ({ ...prev, instrumentadora: e.target.value }))}
                                >
                                    <option value="">-- Sin Técnica Asignada --</option>
                                    {quickCloseModal.instrumentadora && !collaboratorsList.includes(quickCloseModal.instrumentadora) && (
                                        <option value={quickCloseModal.instrumentadora}>
                                            {quickCloseModal.instrumentadora} (no coincide con el listado)
                                        </option>
                                    )}
                                    {collaboratorsList.map(name => (
                                        <option key={name} value={name}>{name}</option>
                                    ))}
                                </select>
                                <p className="text-[10px] text-slate-400 mt-1 italic">
                                    Seleccione del listado oficial. La liquidación compara este nombre para imputar los honorarios.
                                </p>
                            </div>

                            <div className="flex flex-col sm:flex-row justify-between items-center gap-3 pt-3 border-t border-slate-100">
                                <button
                                    type="button"
                                    onClick={() => {
                                        const pId = quickCloseModal.patient?.id;
                                        setQuickCloseModal({ isOpen: false, patient: null, startTime: '', endTime: '', instrumentadora: '', isSubmitting: false });
                                        if (pId) navigate(`/detail/${pId}`, { state: { from: '/kanban' } });
                                    }}
                                    className="text-xs text-primary font-bold hover:underline flex items-center gap-1 self-start sm:self-auto"
                                >
                                    <span className="material-symbols-outlined text-sm">open_in_new</span>
                                    Abrir Ficha Quirúrgica Completa
                                </button>

                                <div className="flex flex-wrap items-center gap-2 justify-end w-full sm:w-auto">
                                    <button
                                        type="button"
                                        onClick={() => setQuickCloseModal({ isOpen: false, patient: null, startTime: '', endTime: '', instrumentadora: '', isSubmitting: false })}
                                        disabled={quickCloseModal.isSubmitting}
                                        className="px-3.5 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition-colors"
                                    >
                                        Cancelar
                                    </button>

                                    {!quickCloseModal.instrumentadora.trim() ? (
                                        <>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    const pId = quickCloseModal.patient?.id;
                                                    setQuickCloseModal({ isOpen: false, patient: null, startTime: '', endTime: '', instrumentadora: '', isSubmitting: false });
                                                    if (pId) navigate(`/detail/${pId}`, { state: { from: '/kanban' } });
                                                }}
                                                disabled={quickCloseModal.isSubmitting}
                                                className="px-3.5 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-xl text-xs font-bold transition-colors flex items-center gap-1"
                                                title="Abrir la ficha para cargar la técnica correspondiente"
                                            >
                                                <span className="material-symbols-outlined text-sm">edit_note</span>
                                                Abrir ficha para cargarla
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => handleQuickCloseSubmit(true)}
                                                disabled={quickCloseModal.isSubmitting}
                                                className="px-3.5 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold shadow-sm transition-colors flex items-center gap-1 disabled:opacity-50"
                                                title="Cerrar la cirugía sin asignar técnica"
                                            >
                                                <span className="material-symbols-outlined text-sm">warning</span>
                                                {quickCloseModal.isSubmitting ? 'Guardando...' : 'Cerrar sin técnica'}
                                            </button>
                                        </>
                                    ) : (
                                        <button
                                            type="button"
                                            onClick={() => handleQuickCloseSubmit(false)}
                                            disabled={quickCloseModal.isSubmitting}
                                            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-sm transition-colors flex items-center gap-1.5 disabled:opacity-50"
                                        >
                                            <span className="material-symbols-outlined text-sm">check</span>
                                            {quickCloseModal.isSubmitting ? 'Guardando...' : 'Confirmar Cierre'}
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default Kanban;
