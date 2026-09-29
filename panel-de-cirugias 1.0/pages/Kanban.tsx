import React, { useState, useEffect } from 'react';
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
}

// --- Helpers ---
const calculateProgress = (p: PreOpPatient) => {
    let score = 0;
    if (p.materialStatus === 'OK') score += 33;
    if (p.clinicalStatus === 'OK') score += 33;
    if (p.adminStatus === 'OK') score += 34;
    return score;
};

const isReady = (p: PreOpPatient) => p.materialStatus === 'OK' && p.clinicalStatus === 'OK' && p.adminStatus === 'OK';

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
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-max max-w-[180px] px-2.5 py-1.5 bg-slate-900/90 text-white text-[9px] font-medium normal-case rounded-lg shadow-xl opacity-0 invisible group-hover/badge:opacity-100 group-hover/badge:visible transition-all duration-200 z-[100] backdrop-blur-sm pointer-events-none">
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
    onCancel?: (id: string) => void;
}> = ({ patient, minimal = false, userRole, currentUser, highlight, isSuspended, onCancel }) => {
    const navigate = useNavigate();
    const progress = calculateProgress(patient);

    const isOser = patient.medicalCoverage?.toUpperCase().includes('OSER') || patient.medicalCoverage?.toUpperCase().includes('OBRA SOCIAL');
    const isOserMaterialPending = isOser && patient.requiresMaterial && patient.materialStatus !== 'OK';

    // Determinar si debemos mostrar el contador de días en espera de Ortopedia:
    // Aplica para superAdmin o rol Ortopedia (de la empresa Capital)
    // cuando la cirugía NO está completada/autorizada en su material (materialStatus !== 'OK')
    // Y SOLO para cirugías con proveedor 'Capital' O cobertura 'OSER'
    const isSuperAdmin = currentUser?.role === 'SuperAdmin';
    const isOrtopediaCapital = currentUser?.role === 'Ortopedia' && (
        currentUser?.vendorName?.toLowerCase().includes('capital') ||
        patient.vendorName?.toLowerCase().includes('capital') ||
        currentUser?.can_view_all_vendors
    );
    const isCapitalVendor = patient.vendorName?.toLowerCase().includes('capital') ?? false;
    const isCapitalOrOser = isCapitalVendor || isOser;

    const canSeeDaysWaiting = (isSuperAdmin || isOrtopediaCapital) && isCapitalOrOser && patient.materialStatus !== 'OK' && patient.status !== 'completed' && patient.status !== 'cancelled';

    return (
        <div
            onClick={() => navigate(`/detail/${patient.id}`, { state: { from: '/kanban' } })}
            className={`group rounded-xl border shadow-sm hover:shadow-md transition-all p-4 cursor-pointer relative ${isOserMaterialPending
                    ? 'bg-amber-50/90 border-amber-300 hover:border-amber-400'
                    : 'bg-white border-slate-200 hover:border-primary/30'
                }`}
        >
            {/* Left accent border based on priority */}
            <div className={`absolute left-0 top-0 bottom-0 w-1 rounded-l-xl ${isOserMaterialPending ? 'bg-amber-500' : (patient.priority === 'Urgente' || patient.priority === 'Alta' ? 'bg-red-500' : 'bg-blue-500')}`}></div>

            <div className="flex justify-between items-start mb-2 pl-3">
                <div className="pr-16">
                    <h4 className="font-bold text-slate-900 group-hover:text-primary transition-colors leading-tight">{patient.name}</h4>
                    <p className="text-xs text-slate-500 flex items-center gap-1">
                        <span className="font-mono">{patient.patientDocument}</span>
                        <span>•</span>
                        <span>{patient.age} años</span>
                    </p>
                </div>

                {/* Right Badges Container */}
                <div className="absolute top-2 right-2 flex flex-col items-end gap-1 z-10">
                    {canSeeDaysWaiting && (
                        patient.hasAuthorization ? (
                            <>
                                <div className="bg-purple-600 text-white text-[9px] font-black px-2 py-0.5 rounded shadow-sm uppercase tracking-wider flex items-center gap-1 animate-pulse border border-purple-700" title={`Ingresada el ${patient.dateAdded} - ${patient.daysWaiting ?? 0} días en el sistema`}>
                                    <span className="material-symbols-outlined text-[11px]">hourglass_top</span>
                                    <span>Esperando ortopedia: {patient.daysWaiting ?? 0} {patient.daysWaiting === 1 ? 'día' : 'días'}</span>
                                </div>
                                {patient.daysSinceAuth !== null && patient.daysSinceAuth !== undefined && patient.daysSinceAuth > 0 && (
                                    <div className="bg-rose-600 text-white text-[9px] font-black px-2 py-0.5 rounded shadow-sm uppercase tracking-wider flex items-center gap-1 animate-pulse border border-rose-700" title={`Autorizada el ${patient.authorizationDate} (hace ${patient.daysSinceAuth} ${patient.daysSinceAuth === 1 ? 'día' : 'días'})`}>
                                        <span className="material-symbols-outlined text-[11px]">warning</span>
                                        <span>Demora post-autorización: {patient.daysSinceAuth} {patient.daysSinceAuth === 1 ? 'día' : 'días'}</span>
                                    </div>
                                )}
                            </>
                        ) : (
                            <div className="bg-amber-600 text-white text-[9px] font-black px-2 py-0.5 rounded shadow-sm uppercase tracking-wider flex items-center gap-1 animate-pulse border border-amber-700" title="Sin fecha de autorización (contando días desde la carga inicial)">
                                <span className="material-symbols-outlined text-[11px]">pending_actions</span>
                                <span>Esperando autorización: {patient.daysWaiting ?? 0} {patient.daysWaiting === 1 ? 'día' : 'días'}</span>
                            </div>
                        )
                    )}

                    {patient.priority !== 'Normal' && (
                        <span className="bg-red-50 text-red-600 text-[9px] font-bold px-1.5 py-0.5 rounded border border-red-100 uppercase">
                            {patient.priority}
                        </span>
                    )}

                    {isSuspended && (
                        <span className="bg-amber-500 text-white text-[8px] font-black px-1.5 py-0.5 rounded shadow-sm uppercase tracking-tighter">
                            Suspendida
                        </span>
                    )}

                    {!patient.surgeryDate && (
                        <div className="bg-slate-800 text-white text-[8px] font-black px-1.5 py-0.5 rounded shadow-sm uppercase tracking-wide">
                            Sin Fecha
                        </div>
                    )}

                    {patient.authorizationDate && (
                        <div className="bg-emerald-100 text-emerald-700 text-[8px] font-bold px-1.5 py-0.5 rounded border border-emerald-200 uppercase tracking-tighter">
                            Aut: {patient.authorizationDate}
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
                        <span className="truncate">{new Date(patient.surgeryDate + 'T12:00:00').toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })} {patient.startTime}</span>
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
                            navigate('/calendar');
                        }}
                        className="flex-1 bg-blue-600 hover:bg-blue-700 text-white text-[10px] font-black py-2 rounded-lg flex items-center justify-center gap-1.5 uppercase transition-colors"
                    >
                        <span className="material-symbols-outlined text-sm font-bold">event_repeat</span>
                        Reprogramar
                    </button>
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            if (onCancel) onCancel(patient.id);
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
    const [loading, setLoading] = useState(!kanbanCache);
    const [filterText, setFilterText] = useState('');
    const [quickFilter, setQuickFilter] = useState<'all' | 'capital_validated' | 'auth_no_ortho_val'>('all');

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
            unscheduled: false,
            authorized: false,
            ready: false,
            scheduled: false,
            materials: false,
            clinical: false,
            admin: false,
            suspended: true // default collapsed
        };
    });

    const toggleSection = (section: string) => {
        setCollapsedSections(prev => {
            const newState = { ...prev, [section]: !prev[section] };
            localStorage.setItem('kanban_collapsed_sections', JSON.stringify(newState));
            return newState;
        });
    };

    useEffect(() => {
        // ... (subscription logic same as before)
        fetchPendingSurgeries();

        const channel = supabase
            .channel('kanban-changes')
            .on(
                'postgres_changes',
                { event: '*', schema: 'quirofano', table: 'surgeries' },
                () => fetchPendingSurgeries()
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [user]);

    const fetchPendingSurgeries = async (forceRefresh = false) => {
        const roleKey = `${user?.role}_${user?.doctorId}_${user?.vendorId}`;
        const nowTs = Date.now();

        if (!forceRefresh && kanbanCache && kanbanCache.roleKey === roleKey && (nowTs - kanbanCache.timestamp < 15000)) {
            setPatients(kanbanCache.patients);
            setLoading(false);
            return;
        }

        if (!kanbanCache) {
            setLoading(true);
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
          patients (full_name, document_number, birth_date),
          doctors!doctor_id (full_name),
          operating_rooms!operating_room_id (name, is_ambulatory),
          vendors!vendor_id (name),
          surgery_materials (id)
        `);

            if (user?.role === 'Ortopedia' && user.vendorId && !user.can_view_all_vendors) {
                query = query.eq('vendor_id', user.vendorId);
            }

            // We fetch surgeries that are active, suspended or cancelled to display in appropriate tabs/sections
            query = query.or('status.eq.scheduled,status.eq.pending_validation,status.eq.waiting_date,status.eq.suspended,status.eq.cancelled');

            if (user?.role === 'Medico' && user.doctorId) {
                query = query.eq('doctor_id', user.doctorId);
            }

            const { data, error } = await query
                .order('surgery_date', { ascending: true })
                .order('start_time', { ascending: true })
                .order('created_at', { ascending: false });

            if (error) throw error;

            // Deduplicate by ID to prevent repeated cards if joins return multiple rows
            const uniqueData = Array.from(new Map((data || []).map((item: any) => [item.id, item])).values());

            const mapped: PreOpPatient[] = uniqueData.map((s: any) => {
                const patient = Array.isArray(s.patients) ? s.patients[0] : s.patients;
                const doctor = Array.isArray(s.doctors) ? s.doctors[0] : s.doctors;
                const orGroup = Array.isArray(s.operating_rooms) ? s.operating_rooms[0] : s.operating_rooms;
                const vendorObj = Array.isArray(s.vendors) ? s.vendors[0] : s.vendors;

                const birthDate = patient?.birth_date ? new Date(patient.birth_date) : null;
                const age = birthDate ? new Date().getFullYear() - birthDate.getFullYear() : 0;

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

                // Tooltip Logic
                const matStatus = s.priority === 'emergency' ? 'OK' : mapStatus(s.ortho_validated, s.requires_prosthesis || (s.surgery_materials && s.surgery_materials.length > 0));
                const materialTooltip = matStatus === 'OK' ? 'Materiales validados / No requiere prótesis' :
                    (s.requires_prosthesis || (s.surgery_materials && s.surgery_materials.length > 0) ? 'Falta validación de materiales por Ortopedia' : 'Sin materiales cargados para esta cirugía');

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

                const requiresMat = Boolean(s.requires_prosthesis || (s.surgery_materials && s.surgery_materials.length > 0));

                const hasAuth = Boolean(s.authorization_date);
                
                // Días desde la creación/ingreso de la cirugía al sistema
                const creationDate = s.created_at ? new Date(s.created_at) : new Date();
                const diffTimeFromCreation = Math.max(0, new Date().getTime() - creationDate.getTime());
                const daysWaitingFromCreation = Math.floor(diffTimeFromCreation / (1000 * 60 * 60 * 24));

                // Días transcurridos desde la fecha de autorización
                let daysSinceAuth: number | null = null;
                if (hasAuth && s.authorization_date) {
                    const rawDateStr = s.authorization_date;
                    const authDateObj = new Date(rawDateStr.includes('T') ? rawDateStr : `${rawDateStr}T12:00:00`);
                    const diffTimeAuth = new Date().getTime() - authDateObj.getTime();
                    // Puede ser 0 si fue autorizada hoy
                    daysSinceAuth = Math.max(0, Math.floor(diffTimeAuth / (1000 * 60 * 60 * 24)));
                }

                // El cartel "Esperando ortopedia" y "Esperando autorización" ahora cuenta los días desde que se ingresó la cirugía
                const daysWaiting = daysWaitingFromCreation;

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
                    daysWaiting,
                    daysWaitingFromCreation,
                    daysSinceAuth,
                    orthoValidationDate: s.ortho_validation_date,
                    hasAuthorization: hasAuth,
                    dateAdded: new Date(s.created_at).toLocaleDateString(),
                    lastUpdate: new Date(s.created_at).toLocaleDateString(),
                    status: s.status || 'pending_validation',
                    surgeryDate: s.surgery_date,
                    startTime: s.start_time?.substring(0, 5),
                    orName: orGroup?.name,
                    authorizationDate: s.authorization_date,
                    vendorId: s.vendor_id,
                    vendorName: vendorObj?.name || '',
                    medicalCoverage: s.medical_coverage || '',
                    requiresMaterial: requiresMat,
                    suspensionRequested: s.suspension_requested,
                    rescheduleRequested: s.reschedule_requested,
                    oserStatus: s.oser_status
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
        }
    };

    // Grouping Data
    const filteredPatients = patients.filter(p =>
        p.name.toLowerCase().includes(filterText.toLowerCase()) ||
        p.patientDocument.includes(filterText)
    );

    // Helper para identificar OSER
    const isOserCoverage = (coverage?: string) => {
        if (!coverage) return false;
        const upper = coverage.toUpperCase();
        return upper.includes('OSER') || upper.includes('OBRA SOCIAL');
    };

    // 0. Authorized (Has auth date, no scheduled date)
    const authorizedPatients = filteredPatients.filter(p => !p.surgeryDate && p.authorizationDate && p.status !== 'suspended' && p.status !== 'cancelled');

    // 0a. OSER sin aprobar material
    const oserPendingMaterial = authorizedPatients.filter(p => isOserCoverage(p.medicalCoverage) && p.requiresMaterial && p.materialStatus !== 'OK');

    // 0b. OSER material aprobado (Capital)
    const oserApprovedMaterial = authorizedPatients.filter(p => isOserCoverage(p.medicalCoverage) && p.materialStatus === 'OK' && (p.vendorName?.toLowerCase().includes('capital') || false));

    // 0c. Otras Coberturas Autorizadas (ART, Particular, u otras obras sociales autorizadas sin fecha)
    const otherCoveragesAuthorized = authorizedPatients.filter(p => !isOserCoverage(p.medicalCoverage) || (!p.requiresMaterial && p.materialStatus === 'OK' && !p.vendorName?.toLowerCase().includes('capital')));

    // 1. Ready to Schedule (isReady, no date, no auth) - NEW SECTION
    const readyToSchedule = filteredPatients.filter(p => !p.surgeryDate && !p.authorizationDate && isReady(p) && p.status !== 'suspended' && p.status !== 'cancelled');

    // 2. Unscheduled (No Date, No Auth Date, NOT Ready)
    const unscheduledNew = filteredPatients.filter(p => !p.surgeryDate && !p.authorizationDate && !isReady(p) && p.status !== 'suspended' && p.status !== 'cancelled');

    // 3. Programadas (Con Fecha Asignada) - ordenadas por fecha/hora ascendente
    const scheduledPatients = filteredPatients
        .filter(p => !!p.surgeryDate && p.status !== 'suspended' && p.status !== 'cancelled' && p.status !== 'completed')
        .sort((a, b) => {
            const dateA = new Date(`${a.surgeryDate}T${a.startTime || '00:00'}:00`).getTime() || 0;
            const dateB = new Date(`${b.surgeryDate}T${b.startTime || '00:00'}:00`).getTime() || 0;
            return dateA - dateB;
        });

    // 4. Blocked Scheduled & Problem Surgeries
    // Falta Material: cualquier activa que requiera material y no esté validado
    const materialBlockers = filteredPatients.filter(p => p.status !== 'suspended' && p.status !== 'cancelled' && p.requiresMaterial && p.materialStatus !== 'OK');
    // Falta Exámenes: cualquier activa que adeude exámenes / validación clínica
    const clinicalBlockers = filteredPatients.filter(p => p.status !== 'suspended' && p.status !== 'cancelled' && p.clinicalStatus !== 'OK');
    const otherBlockers = filteredPatients.filter(p => p.status !== 'suspended' && p.status !== 'cancelled' && p.surgeryDate && !isReady(p) && p.adminStatus !== 'OK' && p.materialStatus === 'OK' && p.clinicalStatus === 'OK');

    // Solapamientos (Intersecciones):
    // 1. Cirugías que adeudan material Y exámenes prequirúrgicos al mismo tiempo
    const bothMaterialAndExams = filteredPatients.filter(p => p.status !== 'suspended' && p.status !== 'cancelled' && p.requiresMaterial && p.materialStatus !== 'OK' && p.clinicalStatus !== 'OK');
    // 2. Cirugías con fecha ya asignada pero con falta de material
    const scheduledWithMaterialPending = scheduledPatients.filter(p => p.requiresMaterial && p.materialStatus !== 'OK');
    // 3. Cirugías con fecha ya asignada pero con falta de exámenes
    const scheduledWithExamsPending = scheduledPatients.filter(p => p.clinicalStatus !== 'OK');
    // 4. Cirugías con fecha asignada que tienen algún bloqueo (material o exámenes o admin)
    const scheduledBlockedCount = scheduledPatients.filter(p => !isReady(p)).length;

    // Total de cirugías activas únicas (sin suspendidas, sin canceladas y sin completadas)
    const totalActivosCount = filteredPatients.filter(p => p.status !== 'suspended' && p.status !== 'cancelled' && p.status !== 'completed').length;
    const handleCancelSurgery = async (id: string) => {
        if (!confirm('¿Está seguro de que desea cancelar definitivamente esta cirugía?')) return;

        try {
            const { error } = await supabase
                .from('surgeries')
                .update({ status: 'cancelled' })
                .eq('id', id);

            if (error) throw error;

            // --- VENDOR NOTIFICATION ---
            const patient = patients.find(p => p.id === id);
            if (patient && patient.vendorId) {
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
                            message: `La cirugía de ${patient.name} DNI: ${patient.patientDocument} (${patient.proc}) ha sido cancelada.\n\nDetalles:\n- Fecha: ${patient.surgeryDate || 'N/A'}\n- Hora: ${patient.startTime || 'N/A'}\n- Médico: ${patient.doctor}\n- Motivo: Cancelación definitiva desde el tablero de control.\n\nEste es un mensaje automático del Sistema de Coordinación de Quirófanos.`,
                            metadata: {
                                surgery_id: id,
                                patient_name: patient.name,
                                doctor_name: patient.doctor,
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
                    resource_id: id
                }
            });

            supabase.from('audit_logs').insert({
                user_name: user?.name || 'Sistema',
                user_role: user?.role,
                action: 'DELETE',
                resource: 'Cirugía',
                resource_id: id,
                description: 'Cirugía cancelada definitivamente desde Kanban Suspendidas',
                meta: { source: 'Kanban' }
            }).then(({ error: auditError }) => {
                if (auditError) console.warn('Silent Audit Error:', auditError);
            });

            fetchPendingSurgeries();
        } catch (err) {
            console.error('Error cancelling surgery:', err);
            alert('Error al cancelar la cirugía');
        }
    };

    const suspendedPatients = filteredPatients.filter(p => p.status === 'suspended');
    const cancelledPatients = filteredPatients.filter(p => p.status === 'cancelled');
    const allSuspendedAndCancelled = filteredPatients.filter(p => p.status === 'suspended' || p.status === 'cancelled');

    // Cirugías Pasadas sin Cerrar:
    // Programadas con fecha anterior a hoy (formato YYYY-MM-DD), no completadas, ni suspendidas, ni canceladas.
    const todayStr = new Date().toISOString().split('T')[0];
    const pastUnclosedSurgeries = filteredPatients
        .filter(p => !!p.surgeryDate && p.surgeryDate < todayStr && p.status !== 'completed' && p.status !== 'suspended' && p.status !== 'cancelled')
        .sort((a, b) => {
            const dateA = new Date(`${a.surgeryDate}T${a.startTime || '00:00'}:00`).getTime() || 0;
            const dateB = new Date(`${b.surgeryDate}T${b.startTime || '00:00'}:00`).getTime() || 0;
            return dateB - dateA; // Más recientes del pasado primero
        });

    // --- ACCIONES ESPECÍFICAS: SUSPENDIDAS Y CANCELADAS ---

    // 1. Reincorporar cirugía al flujo activo (disponible para todos los roles autorizados)
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

    // 2. Eliminación definitiva de la base de datos (Exclusivo SuperAdmin)
    const handleDeletePermanent = async (patient: PreOpPatient) => {
        if (user?.role !== 'SuperAdmin') {
            alert('Solo los usuarios con rol SuperAdmin tienen autorización para eliminar definitivamente registros de cirugías.');
            return;
        }

        const confirmMsg = `⚠️ ATENCIÓN: Esta acción eliminará PERMANENTEMENTE la cirugía de ${patient.name} (DNI ${patient.patientDocument}) de la base de datos.\n\n¿Confirma la eliminación irreversible?`;
        if (!confirm(confirmMsg)) return;

        try {
            // Eliminar materiales vinculados si los hubiera
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

    // 3. Solicitud de confirmación de eliminación (No admin) -> Genera System Alert para SuperAdmin
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

            alert(`Solicitud enviada a SuperAdmin exitosamente. Se notificará a los administradores para que evalúen la eliminación definitiva.`);
            setRequestDeleteModal({ isOpen: false, patient: null, reason: '' });
        } catch (err: any) {
            console.error('Error sending delete request:', err);
            alert('Error al enviar la solicitud: ' + (err.message || err));
        }
    };

    // --- ACCIONES ESPECÍFICAS: CIRUGÍAS PASADAS SIN CERRAR ---

    // 4. Cierre quirúrgico rápido de cirugía pasada (Horario de inicio y fin)
    const handleQuickCloseSubmit = async () => {
        if (!quickCloseModal.patient) return;
        const { patient, startTime, endTime } = quickCloseModal;

        if (!startTime || !endTime) {
            alert('Debe especificar tanto el horario real de inicio como de finalización.');
            return;
        }

        setQuickCloseModal(prev => ({ ...prev, isSubmitting: true }));
        try {
            const { error } = await supabase
                .from('surgeries')
                .update({
                    status: 'completed',
                    actual_start_time: startTime,
                    actual_end_time: endTime
                })
                .eq('id', patient.id);

            if (error) throw error;

            await supabase.from('audit_logs').insert({
                user_name: user?.name || 'Sistema',
                user_role: user?.role,
                action: 'STATUS_CHANGE',
                resource: 'Cirugía',
                resource_id: patient.id,
                description: `Cirugía pasada cerrada como Realizada por ${user?.name} (${user?.role}). Horario: ${startTime} - ${endTime}`,
                meta: { actual_start_time: startTime, actual_end_time: endTime, new_status: 'completed' }
            });

            alert(`Cirugía de ${patient.name} cerrada correctamente como realizada.`);
            setQuickCloseModal({ isOpen: false, patient: null, startTime: '', endTime: '', isSubmitting: false });
            fetchPendingSurgeries(true);
        } catch (err: any) {
            console.error('Error closing past surgery:', err);
            alert('Error al cerrar la cirugía: ' + (err.message || err));
            setQuickCloseModal(prev => ({ ...prev, isSubmitting: false }));
        }
    };

    // 5. Pasar cirugía pasada a suspendida si no se realizó
    const handleMarkPastAsSuspended = async (patient: PreOpPatient) => {
        const reason = prompt(`Ingrese el motivo por el cual la cirugía de ${patient.name} (${patient.surgeryDate}) no se realizó:`);
        if (reason === null) return; // Cancelado por usuario

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

    // --- RANKING VIEW LOGIC ---
    const isSearching = filterText.trim() !== '';

    const isOserCategory = (coverage?: string) => {
        if (!coverage) return false;
        const upper = coverage.toUpperCase();
        return upper.includes('OSER') || upper.includes('OBRA SOCIAL');
    };

    const isArtOrParticularCategory = (coverage?: string) => {
        if (!coverage) return false;
        const upper = coverage.toUpperCase();
        return upper.includes('ART') || upper.includes('PARTICULAR') || upper.includes('PRIVADO');
    };

    const isPrepagaCategory = (coverage?: string) => {
        if (!coverage) return false;
        return !isOserCategory(coverage) && !isArtOrParticularCategory(coverage);
    };

    // Filter active unscheduled/pending-date surgeries
    const rankingBase = filteredPatients.filter(p => !p.surgeryDate && p.status !== 'suspended' && p.status !== 'cancelled');

    // Helper for Urgencies/Emergencies
    const isUrgentOrEmergency = (p: PreOpPatient) => p.priority === 'Urgente' || p.priority === 'Alta';

    // Rule: Show authorized surgeries by default; show unauthorized ONLY when actively searching
    // Urgencies and emergencies are ALWAYS eligible regardless of authorization date
    const rankingEligible = rankingBase.filter(p => isSearching || isUrgentOrEmergency(p) ? true : Boolean(p.authorizationDate));

    // Sort Helper for Urgencies/Emergencies: Oldest creation date first
    const sortByDateAsc = (a: PreOpPatient, b: PreOpPatient) => {
        const dateA = new Date(a.dateAdded).getTime() || 0;
        const dateB = new Date(b.dateAdded).getTime() || 0;
        return dateA - dateB;
    };

    // Sort Helper for OSER & Prepagas:
    // Priority 1: Authorized AND Material OK (or doesn't require)
    // Priority 2: Authorized BUT Material Pending
    // Priority 3: Not Authorized (visible when searching)
    // Tie breaker: dateAdded / created_at (Oldest first)
    const sortPriorityAndDate = (a: PreOpPatient, b: PreOpPatient) => {
        const getScore = (p: PreOpPatient) => {
            const hasAuth = Boolean(p.authorizationDate);
            const matOk = p.materialStatus === 'OK';
            if (hasAuth && matOk) return 1;
            if (hasAuth && !matOk) return 2;
            return 3; // Not authorized
        };

        const scoreA = getScore(a);
        const scoreB = getScore(b);

        if (scoreA !== scoreB) return scoreA - scoreB;

        return sortByDateAsc(a, b);
    };

    // 1. Column: Urgencies & Emergencies (All non-elective priorities regardless of coverage)
    const urgenciesRanking = rankingEligible.filter(isUrgentOrEmergency).sort(sortByDateAsc);

    // Filter out urgent/emergency surgeries from coverage-based columns
    const electiveRankingEligible = rankingEligible.filter(p => !isUrgentOrEmergency(p));

    const oserRanking = electiveRankingEligible.filter(p => isOserCategory(p.medicalCoverage)).sort(sortPriorityAndDate);
    const prepagasRanking = electiveRankingEligible.filter(p => isPrepagaCategory(p.medicalCoverage)).sort(sortPriorityAndDate);
    const artParticularesRanking = electiveRankingEligible.filter(p => isArtOrParticularCategory(p.medicalCoverage)).sort(sortByDateAsc);

    // Verificación de acceso para la vista especial de Ortopedia Capital
    const isSuperAdmin = user?.role === 'SuperAdmin';
    const isOrtopediaCapital = user?.role === 'Ortopedia' && (
        user?.vendorName?.toLowerCase().includes('capital') ||
        user?.can_view_all_vendors
    );
    const canAccessPendingOrthoTab = isSuperAdmin || isOrtopediaCapital;

    // Cirugías que requieren material y tienen aprobación de ortopedia pendiente (materialStatus !== 'OK')
    // FILTRO ADICIONAL: Solo las cirugías que tengan asignado como proveedor 'Capital' O cobertura 'OSER'
    const allPendingOrtho = filteredPatients.filter(p => {
        if (p.materialStatus === 'OK' || !p.requiresMaterial) return false;

        const isVendorCapital = p.vendorName?.toLowerCase().includes('capital') ?? false;
        const isOser = isOserCoverage(p.medicalCoverage);

        return isVendorCapital || isOser;
    });

    // 1a. Activas Autorizadas (Esperando aprobación de material de Ortopedia)
    const pendingOrthoAuthorized = allPendingOrtho
        .filter(p => p.status !== 'suspended' && p.status !== 'cancelled' && p.status !== 'completed' && p.hasAuthorization)
        .sort((a, b) => (b.daysWaiting ?? 0) - (a.daysWaiting ?? 0));

    // 1b. Activas Sin Autorización (Esperando fecha de autorización de cobertura)
    const pendingOrthoWaitingAuth = allPendingOrtho
        .filter(p => p.status !== 'suspended' && p.status !== 'cancelled' && p.status !== 'completed' && !p.hasAuthorization)
        .sort((a, b) => (b.daysWaiting ?? 0) - (a.daysWaiting ?? 0));

    // 2. Suspendidas
    const pendingOrthoSuspended = allPendingOrtho
        .filter(p => p.status === 'suspended')
        .sort((a, b) => (b.daysWaiting ?? 0) - (a.daysWaiting ?? 0));

    // 3. Canceladas
    const pendingOrthoCancelled = allPendingOrtho
        .filter(p => p.status === 'cancelled')
        .sort((a, b) => (b.daysWaiting ?? 0) - (a.daysWaiting ?? 0));

    // --- MÉTRICAS Y PROMEDIOS DE TIEMPO DE ESPERA DE ORTOPEDIA ---
    // Promedio de demora post-autorización en cirugías actualmente pendientes con autorización
    const pendingWithAuthAndDelay = pendingOrthoAuthorized.filter(p => p.daysSinceAuth !== null && p.daysSinceAuth !== undefined);
    const avgDaysPostAuth = pendingWithAuthAndDelay.length > 0
        ? Math.round(pendingWithAuthAndDelay.reduce((acc, p) => acc + (p.daysSinceAuth || 0), 0) / pendingWithAuthAndDelay.length)
        : 0;

    // Promedio de días totales de espera (desde ingreso) en autorizadas pendientes de ortopedia
    const avgDaysTotalWaiting = pendingOrthoAuthorized.length > 0
        ? Math.round(pendingOrthoAuthorized.reduce((acc, p) => acc + (p.daysWaitingFromCreation ?? p.daysWaiting ?? 0), 0) / pendingOrthoAuthorized.length)
        : 0;

    // Métricas históricas de cirugías ya validadas por Ortopedia (tiempo de respuesta desde autorización hasta visto bueno)
    const approvedOrthoHistorical = filteredPatients.filter(p => {
        if (!p.requiresMaterial || p.materialStatus !== 'OK' || !p.orthoValidationDate) return false;
        const isVendorCapital = p.vendorName?.toLowerCase().includes('capital') ?? false;
        const isOser = isOserCoverage(p.medicalCoverage);
        return isVendorCapital || isOser;
    });

    const historicalPostAuthTimes = approvedOrthoHistorical.map(p => {
        if (!p.authorizationDate || !p.orthoValidationDate) return null;
        const authTime = new Date(p.authorizationDate.includes('T') ? p.authorizationDate : `${p.authorizationDate}T12:00:00`).getTime();
        const orthoTime = new Date(p.orthoValidationDate).getTime();
        const diffDays = Math.max(0, Math.round((orthoTime - authTime) / (1000 * 60 * 60 * 24)));
        return diffDays;
    }).filter((d): d is number => d !== null);

    const avgHistoricalResolutionDays = historicalPostAuthTimes.length > 0
        ? Math.round(historicalPostAuthTimes.reduce((acc, val) => acc + val, 0) / historicalPostAuthTimes.length)
        : null;

    // View Mode Toggle ('flow' | 'ranking' | 'pending_ortho' | 'suspended_cancelled' | 'past_unclosed')
    const [viewMode, setViewMode] = useState<'flow' | 'ranking' | 'pending_ortho' | 'suspended_cancelled' | 'past_unclosed'>(() => {
        const saved = localStorage.getItem('kanban_view_mode');
        if (saved === 'pending_ortho' && canAccessPendingOrthoTab) return 'pending_ortho';
        if (saved === 'suspended_cancelled' || saved === 'past_unclosed' || saved === 'ranking' || saved === 'flow') return saved;
        return 'flow';
    });

    // Modals de acciones operativas
    const [requestDeleteModal, setRequestDeleteModal] = useState<{
        isOpen: boolean;
        patient: PreOpPatient | null;
        reason: string;
    }>({
        isOpen: false,
        patient: null,
        reason: ''
    });

    const [quickCloseModal, setQuickCloseModal] = useState<{
        isOpen: boolean;
        patient: PreOpPatient | null;
        startTime: string;
        endTime: string;
        isSubmitting: boolean;
    }>({
        isOpen: false,
        patient: null,
        startTime: '',
        endTime: '',
        isSubmitting: false
    });

    const toggleViewMode = (mode: 'flow' | 'ranking' | 'pending_ortho' | 'suspended_cancelled' | 'past_unclosed') => {
        setViewMode(mode);
        localStorage.setItem('kanban_view_mode', mode);
    };

    // Helper to determine if a section is collapsed.
    // If user is searching (filterText is not empty) and the section has matching items, it auto-expands.
    const isSectionCollapsed = (sectionKey: string, count: number) => {
        if (filterText.trim() !== '' && count > 0) {
            return false; // Auto-expand when search query matches items in this section
        }
        return !!collapsedSections[sectionKey];
    };

    // Helper for Section Header
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
            <ProgressBar isLoading={loading} />

            {/* HEADER */}
            <header className="bg-white border-b border-slate-200 px-8 py-6 sticky top-0 z-20 shadow-sm">
                {/* ... (Same Header Content) ... */}
                <div className="max-w-7xl mx-auto w-full">
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                        <div>
                            <h1 className="text-2xl font-bold text-slate-900 leading-none">Gestión de Flujo Pre-Quirúrgico</h1>
                            <p className="text-slate-500 text-sm mt-1">Supervisión de validaciones y desbloqueo de pacientes.</p>
                        </div>
                        <div className="flex items-center gap-3">
                            <div className="relative">
                                <span className="material-symbols-outlined absolute left-3 top-2.5 text-slate-400 text-lg">search</span>
                                <input
                                    type="text"
                                    placeholder="Filtrar pacientes..."
                                    className="pl-9 pr-4 py-2 rounded-lg border border-slate-300 bg-white text-sm focus:ring-2 focus:ring-primary focus:border-primary outline-none shadow-sm"
                                    value={filterText}
                                    onChange={(e) => setFilterText(e.target.value)}
                                />
                            </div>
                            {/* View Mode Toggle */}
                            <div className="flex items-center bg-slate-100 p-1 rounded-lg border border-slate-200">
                                <button
                                    onClick={() => toggleViewMode('flow')}
                                    className={`px-3 py-1.5 rounded-md text-xs font-bold flex items-center gap-1.5 transition-all ${viewMode === 'flow'
                                            ? 'bg-white text-slate-900 shadow-sm'
                                            : 'text-slate-500 hover:text-slate-900'
                                        }`}
                                >
                                    <span className="material-symbols-outlined text-sm">view_kanban</span>
                                    Flujo Pre-Qx
                                </button>
                                <button
                                    onClick={() => toggleViewMode('ranking')}
                                    className={`px-3 py-1.5 rounded-md text-xs font-bold flex items-center gap-1.5 transition-all ${viewMode === 'ranking'
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
                                        className={`px-3 py-1.5 rounded-md text-xs font-bold flex items-center gap-1.5 transition-all ${viewMode === 'pending_ortho'
                                                ? 'bg-purple-600 text-white shadow-sm font-black'
                                                : 'text-purple-700 hover:text-purple-900 font-bold'
                                            }`}
                                    >
                                        <span className="material-symbols-outlined text-sm">inventory_2</span>
                                        Pendientes Ortopedia ({pendingOrthoAuthorized.length + pendingOrthoWaitingAuth.length})
                                    </button>
                                )}
                                <button
                                    onClick={() => toggleViewMode('suspended_cancelled')}
                                    className={`px-3 py-1.5 rounded-md text-xs font-bold flex items-center gap-1.5 transition-all ${viewMode === 'suspended_cancelled'
                                            ? 'bg-amber-600 text-white shadow-sm font-black'
                                            : 'text-amber-800 hover:text-amber-950 font-bold'
                                        }`}
                                >
                                    <span className="material-symbols-outlined text-sm">pause_circle</span>
                                    Suspendidas / Canceladas ({allSuspendedAndCancelled.length})
                                </button>
                                <button
                                    onClick={() => toggleViewMode('past_unclosed')}
                                    className={`px-3 py-1.5 rounded-md text-xs font-bold flex items-center gap-1.5 transition-all ${viewMode === 'past_unclosed'
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
                                    className="bg-slate-900 hover:bg-slate-800 text-white px-4 py-2 rounded-lg text-sm font-bold shadow-sm flex items-center gap-2 transition-colors"
                                >
                                    <span className="material-symbols-outlined text-lg">add</span> Nueva Cirugía
                                </button>
                            )}
                        </div>
                    </div>

                    <div className="flex items-center justify-between gap-4 mt-6 mb-2">
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

                    {/* LEYENDA DE COLORES Y BADGES */}
                    <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3 mb-2 flex flex-wrap items-center justify-between gap-x-6 gap-y-2 text-xs">
                        <div className="flex items-center gap-1.5 font-bold text-slate-700 text-[11px]">
                            <span className="material-symbols-outlined text-sm text-slate-500">palette</span>
                            <span>Leyenda de Colores:</span>
                        </div>

                        <div className="flex flex-wrap items-center gap-4 text-[11px] text-slate-600">
                            {/* OSER Pendiente Material */}
                            <div className="flex items-center gap-1.5">
                                <span className="size-3 rounded border border-amber-400 bg-amber-100 inline-block shadow-sm"></span>
                                <span>OSER sin material aprobado</span>
                            </div>

                            {/* Urgente / Alta Prioridad */}
                            <div className="flex items-center gap-1.5">
                                <span className="w-1 h-3 rounded-full bg-red-500 inline-block"></span>
                                <span>Prioridad Urgente / Alta</span>
                            </div>

                            {/* Normal Prioridad */}
                            <div className="flex items-center gap-1.5">
                                <span className="w-1 h-3 rounded-full bg-blue-500 inline-block"></span>
                                <span>Prioridad Normal</span>
                            </div>

                            {/* Badges OK vs Pendiente */}
                            <div className="flex items-center gap-2 pl-2 border-l border-slate-200">
                                <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 px-1.5 py-0.5 rounded text-[9px] font-black uppercase">OK</span>
                                <span>Validado</span>
                                <span className="bg-amber-50 text-amber-700 border border-amber-200 px-1.5 py-0.5 rounded text-[9px] font-black uppercase">Pend</span>
                                <span>Pendiente</span>
                                <span className="bg-red-50 text-red-700 border border-red-200 px-1.5 py-0.5 rounded text-[9px] font-black uppercase">Falta</span>
                                <span>Faltante</span>
                            </div>
                        </div>
                    </div>

                    {showKPIs && (
                        <div className="flex overflow-x-auto pb-4 gap-3 scrollbar-hide -mx-8 px-8 md:mx-0 md:px-0 md:grid md:grid-cols-4 md:pb-0 md:overflow-visible animate-fadeIn">
                            {/* 1. FALTA MATERIAL */}
                            <div className="flex-shrink-0 w-[240px] md:w-auto bg-amber-50/90 border border-amber-200/80 p-3.5 rounded-xl flex items-start gap-3 shadow-sm hover:shadow-md transition-all">
                                <div className="size-10 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center shrink-0 mt-0.5">
                                    <span className="material-symbols-outlined">inventory_2</span>
                                </div>
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-baseline gap-2">
                                        <p className="text-2xl font-black text-amber-700 leading-none">{materialBlockers.length}</p>
                                        <p className="text-xs font-bold text-amber-700 uppercase tracking-wide">Falta Material</p>
                                    </div>
                                    <div className="mt-2 pt-2 border-t border-amber-200/60 flex flex-col gap-1 text-[11px] text-amber-800/90 font-medium">
                                        <span className="flex items-center gap-1.5" title="Cirugías que además de material adeudan estudios prequirúrgicos">
                                            <span className="size-1.5 rounded-full bg-amber-500 shrink-0"></span>
                                            <span><strong>{bothMaterialAndExams.length}</strong> también faltan exámenes</span>
                                        </span>
                                        <span className="flex items-center gap-1.5" title="Cirugías que tienen fecha quirúrgica fijada pero material aún no validado">
                                            <span className="size-1.5 rounded-full bg-amber-500 shrink-0"></span>
                                            <span><strong>{scheduledWithMaterialPending.length}</strong> ya tienen fecha</span>
                                        </span>
                                    </div>
                                </div>
                            </div>

                            {/* 2. FALTA EXÁMENES */}
                            <div className="flex-shrink-0 w-[240px] md:w-auto bg-blue-50/90 border border-blue-200/80 p-3.5 rounded-xl flex items-start gap-3 shadow-sm hover:shadow-md transition-all">
                                <div className="size-10 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center shrink-0 mt-0.5">
                                    <span className="material-symbols-outlined">clinical_notes</span>
                                </div>
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-baseline gap-2">
                                        <p className="text-2xl font-black text-blue-700 leading-none">{clinicalBlockers.length}</p>
                                        <p className="text-xs font-bold text-blue-700 uppercase tracking-wide">Falta Exámenes</p>
                                    </div>
                                    <div className="mt-2 pt-2 border-t border-blue-200/60 flex flex-col gap-1 text-[11px] text-blue-800/90 font-medium">
                                        <span className="flex items-center gap-1.5" title="Cirugías que además de exámenes adeudan materiales de ortopedia">
                                            <span className="size-1.5 rounded-full bg-blue-500 shrink-0"></span>
                                            <span><strong>{bothMaterialAndExams.length}</strong> también falta material</span>
                                        </span>
                                        <span className="flex items-center gap-1.5" title="Cirugías que tienen fecha quirúrgica fijada pero adeudan exámenes prequirúrgicos">
                                            <span className="size-1.5 rounded-full bg-blue-500 shrink-0"></span>
                                            <span><strong>{scheduledWithExamsPending.length}</strong> ya tienen fecha</span>
                                        </span>
                                    </div>
                                </div>
                            </div>

                            {/* 3. CON FECHA ASIGNADA */}
                            <div className="flex-shrink-0 w-[240px] md:w-auto bg-indigo-50/90 border border-indigo-200/80 p-3.5 rounded-xl flex items-start gap-3 shadow-sm hover:shadow-md transition-all">
                                <div className="size-10 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center shrink-0 mt-0.5">
                                    <span className="material-symbols-outlined">event_available</span>
                                </div>
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-baseline gap-2">
                                        <p className="text-2xl font-black text-indigo-700 leading-none">{scheduledPatients.length}</p>
                                        <p className="text-xs font-bold text-indigo-700 uppercase tracking-wide whitespace-nowrap">Con Fecha Asignada</p>
                                    </div>
                                    <div className="mt-2 pt-2 border-t border-indigo-200/60 flex flex-col gap-1 text-[11px] text-indigo-800/90 font-medium">
                                        <span className="flex items-center gap-1.5" title="Cirugías con turno que adeudan material">
                                            <span className="size-1.5 rounded-full bg-indigo-500 shrink-0"></span>
                                            <span><strong>{scheduledWithMaterialPending.length}</strong> falta material</span>
                                        </span>
                                        <span className="flex items-center gap-1.5" title="Cirugías con turno que adeudan exámenes prequirúrgicos">
                                            <span className="size-1.5 rounded-full bg-indigo-500 shrink-0"></span>
                                            <span><strong>{scheduledWithExamsPending.length}</strong> faltan exámenes</span>
                                        </span>
                                    </div>
                                </div>
                            </div>

                            {/* 4. TOTAL ACTIVOS */}
                            <div className="flex-shrink-0 w-[240px] md:w-auto bg-emerald-50/90 border border-emerald-200/80 p-3.5 rounded-xl flex items-start gap-3 shadow-sm hover:shadow-md transition-all">
                                <div className="size-10 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0 mt-0.5">
                                    <span className="material-symbols-outlined">how_to_reg</span>
                                </div>
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-baseline gap-2">
                                        <p className="text-2xl font-black text-emerald-700 leading-none">{totalActivosCount}</p>
                                        <p className="text-xs font-bold text-emerald-700 uppercase tracking-wide whitespace-nowrap">Total Activos</p>
                                    </div>
                                    <div className="mt-2 pt-2 border-t border-emerald-200/60 flex flex-col gap-1 text-[11px] text-emerald-800/90 font-medium">
                                        <span className="flex items-center gap-1.5" title="Cirugías activas que ya tienen fecha quirúrgica fijada">
                                            <span className="size-1.5 rounded-full bg-emerald-500 shrink-0"></span>
                                            <span><strong>{scheduledPatients.length}</strong> programadas</span>
                                        </span>
                                        <span className="flex items-center gap-1.5" title="Cirugías activas que no tienen fecha quirúrgica fijada aún">
                                            <span className="size-1.5 rounded-full bg-emerald-500 shrink-0"></span>
                                            <span><strong>{totalActivosCount - scheduledPatients.length}</strong> pendientes de fecha</span>
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </header>

            {/* MAIN CONTENT GRID */}
            <div className="flex-1 p-8 max-w-7xl mx-auto w-full">
                {loading ? (
                    <div className="flex flex-col items-center justify-center h-64 text-slate-400">
                        <span className="material-symbols-outlined animate-spin text-4xl mb-4">progress_activity</span>
                        <p className="font-medium">Cargando planificación...</p>
                    </div>
                ) : viewMode === 'ranking' ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6 animate-fadeIn">
                        {/* COLUMN 1: URGENCIAS Y EMERGENCIAS */}
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
                                        <PatientCard key={p.id} patient={p} userRole={user?.role} currentUser={user} />
                                    ))
                                ) : (
                                    <div className="bg-slate-50 border border-dashed border-slate-200 rounded-xl p-8 text-center text-slate-400 text-sm italic">
                                        No hay urgencias o emergencias pendientes.
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* COLUMN 2: OSER */}
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
                                        <PatientCard key={p.id} patient={p} userRole={user?.role} currentUser={user} />
                                    ))
                                ) : (
                                    <div className="bg-slate-50 border border-dashed border-slate-200 rounded-xl p-8 text-center text-slate-400 text-sm italic">
                                        No hay cirugías de OSER pendientes.
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* COLUMN 3: PREPAGAS */}
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
                                        <PatientCard key={p.id} patient={p} userRole={user?.role} currentUser={user} />
                                    ))
                                ) : (
                                    <div className="bg-slate-50 border border-dashed border-slate-200 rounded-xl p-8 text-center text-slate-400 text-sm italic">
                                        No hay cirugías de Prepagas pendientes.
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* COLUMN 4: ART Y PARTICULARES */}
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
                                        <PatientCard key={p.id} patient={p} userRole={user?.role} currentUser={user} />
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
                    /* VIEW MODE: PENDING ORTHOPEDIA (Exclusivo SuperAdmin / Ortopedia Capital) */
                    <div className="flex flex-col gap-8 animate-fadeIn">
                        {/* Header Banner */}
                        <div className="bg-purple-900 text-white rounded-2xl p-6 shadow-lg border border-purple-800 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                            <div>
                                <div className="flex items-center gap-2">
                                    <span className="material-symbols-outlined text-purple-300 text-2xl font-bold">inventory_2</span>
                                    <h2 className="text-xl font-black tracking-tight">Cirugías Pendientes de Ortopedia / Autorización</h2>
                                </div>
                                <p className="text-purple-200 text-xs mt-1">
                                    Supervisión y control de solicitudes divididas por estado de autorización y material.
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

                                {/* MÉTRICAS DE PROMEDIO DE TIEMPOS DE ESPERA */}
                                <div className="w-full border-t border-purple-800/80 pt-3 mt-1 flex flex-wrap items-center gap-3 justify-end text-xs">
                                    <div className="flex items-center gap-2 bg-purple-950/40 px-3 py-1.5 rounded-lg border border-purple-800/50" title="Promedio de días transcurridos desde que se autorizó la cirugía en pacientes que aún no tienen visto bueno de ortopedia">
                                        <span className="material-symbols-outlined text-rose-400 text-sm">schedule</span>
                                        <span className="text-purple-200 text-[11px] font-medium">Demora Promedio Post-Autorización:</span>
                                        <span className="font-black text-rose-300 bg-rose-950/80 px-2 py-0.5 rounded text-[11px] border border-rose-800/60">
                                            {avgDaysPostAuth} {avgDaysPostAuth === 1 ? 'día' : 'días'}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-2 bg-purple-950/40 px-3 py-1.5 rounded-lg border border-purple-800/50" title="Promedio de días transcurridos desde el ingreso de la solicitud al sistema">
                                        <span className="material-symbols-outlined text-amber-400 text-sm">hourglass_bottom</span>
                                        <span className="text-purple-200 text-[11px] font-medium">Espera Total Promedio (Ingreso):</span>
                                        <span className="font-black text-amber-300 bg-amber-950/80 px-2 py-0.5 rounded text-[11px] border border-amber-800/60">
                                            {avgDaysTotalWaiting} {avgDaysTotalWaiting === 1 ? 'día' : 'días'}
                                        </span>
                                    </div>
                                    {avgHistoricalResolutionDays !== null && (
                                        <div className="flex items-center gap-2 bg-purple-950/40 px-3 py-1.5 rounded-lg border border-purple-800/50" title="Promedio histórico de días que tardó la ortopedia en dar visto bueno luego de la autorización en casos resueltos">
                                            <span className="material-symbols-outlined text-emerald-400 text-sm">history_toggle_off</span>
                                            <span className="text-purple-200 text-[11px] font-medium">Histórico Respuesta Ortopedia:</span>
                                            <span className="font-black text-emerald-300 bg-emerald-950/80 px-2 py-0.5 rounded text-[11px] border border-emerald-800/60">
                                                {avgHistoricalResolutionDays} {avgHistoricalResolutionDays === 1 ? 'día' : 'días'}
                                            </span>
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
                                                    onCancel={handleCancelSurgery}
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
                    <div className="flex flex-col gap-8">

                        {/* SECTION: OSER SIN APROBAR MATERIAL */}
                        <section className="bg-amber-50/40 rounded-xl border border-amber-200/80 p-4 transition-all">
                            <SectionHeader
                                title="OSER sin aprobar material"
                                count={oserPendingMaterial.length}
                                colorClass="text-amber-600"
                                icon="pending_actions"
                                sectionKey="oser_pending_material"
                            />

                            {!isSectionCollapsed('oser_pending_material', oserPendingMaterial.length) && (
                                <div className="mt-4">
                                    {oserPendingMaterial.length > 0 ? (
                                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 animate-fadeIn">
                                            {oserPendingMaterial.map(p => (
                                                <PatientCard key={p.id} patient={p} userRole={user?.role} currentUser={user} highlight="MAT" />
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="bg-white/60 border border-dashed border-amber-200 rounded-xl p-6 text-center">
                                            <p className="text-amber-700/70 text-sm italic">No hay cirugías autorizadas pendientes de aprobación de material de ortopedia.</p>
                                        </div>
                                    )}
                                </div>
                            )}
                        </section>

                        {/* SECTION: OSER MATERIAL APROBADO (CAPITAL) */}
                        <section className="bg-emerald-50/40 rounded-xl border border-emerald-200/80 p-4 transition-all">
                            <SectionHeader
                                title="OSER material aprobado (Capital)"
                                count={oserApprovedMaterial.length}
                                colorClass="text-emerald-600"
                                icon="task_alt"
                                sectionKey="oser_approved_material"
                            />

                            {!isSectionCollapsed('oser_approved_material', oserApprovedMaterial.length) && (
                                <div className="mt-4">
                                    {oserApprovedMaterial.length > 0 ? (
                                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 animate-fadeIn">
                                            {oserApprovedMaterial.map(p => (
                                                <PatientCard key={p.id} patient={p} userRole={user?.role} currentUser={user} highlight="MAT" />
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

                        {/* SECTION: OTRAS COBERTURAS AUTORIZADAS SIN FECHA */}
                        <section className="bg-white/50 rounded-xl border border-slate-200 p-4 transition-all">
                            <SectionHeader
                                title="Otras Coberturas Autorizadas sin Fecha"
                                count={otherCoveragesAuthorized.length}
                                colorClass="text-blue-600"
                                icon="verified"
                                sectionKey="other_authorized"
                            />

                            {!isSectionCollapsed('other_authorized', otherCoveragesAuthorized.length) && (
                                <div className="mt-4">
                                    {otherCoveragesAuthorized.length > 0 ? (
                                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 animate-fadeIn">
                                            {otherCoveragesAuthorized.map(p => (
                                                <PatientCard key={p.id} patient={p} userRole={user?.role} currentUser={user} />
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="bg-slate-50 border border-dashed border-slate-200 rounded-xl p-6 text-center">
                                            <p className="text-slate-400 text-sm italic">No hay cirugías de otras coberturas autorizadas pendientes de fecha.</p>
                                        </div>
                                    )}
                                </div>
                            )}
                        </section>

                        {/* SECTION: NEW & UNSCHEDULED REQUESTS */}
                        <section className="bg-white/50 rounded-xl border border-slate-200 p-4 transition-all">
                            <SectionHeader
                                title="Sin Autorización de Internación"
                                count={unscheduledNew.length}
                                colorClass="text-indigo-500"
                                icon="new_releases"
                                sectionKey="unscheduled"
                            />

                            {!isSectionCollapsed('unscheduled', unscheduledNew.length) && (
                                <div className="mt-4 animate-fadeIn">
                                    {unscheduledNew.length > 0 ? (
                                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                                            {unscheduledNew.map(p => <PatientCard key={p.id} patient={p} userRole={user?.role} currentUser={user} />)}
                                        </div>
                                    ) : (
                                        <div className="bg-slate-50 border border-dashed border-slate-200 rounded-xl p-6 text-center">
                                            <p className="text-slate-400 text-sm italic">No hay solicitudes sin autorización de internación.</p>
                                        </div>
                                    )}
                                </div>
                            )}
                        </section>

                        {/* SECTION: READY TO SCHEDULE (NEW) */}
                        <section className="bg-emerald-50/30 rounded-xl border border-emerald-100 p-4 transition-all">
                            <SectionHeader
                                title="Validadas (Listas para Programar)"
                                count={readyToSchedule.length}
                                colorClass="text-emerald-600"
                                icon="task_alt"
                                sectionKey="ready"
                            />

                            {!isSectionCollapsed('ready', readyToSchedule.length) && (
                                <div className="mt-4">
                                    {readyToSchedule.length > 0 ? (
                                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 animate-fadeIn">
                                            {readyToSchedule.map(p => (
                                                <div key={p.id} className="relative group">
                                                    <PatientCard patient={p} userRole={user?.role} />
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


                        {/* SECTION: SCHEDULED SURGERIES (CON FECHA ASIGNADA) */}
                        <section className="bg-indigo-50/30 rounded-xl border border-indigo-100 p-4 transition-all">
                            <SectionHeader
                                title="Cirugías con Fecha Asignada"
                                count={scheduledPatients.length}
                                colorClass="text-indigo-600"
                                icon="calendar_today"
                                sectionKey="scheduled"
                            />

                            {!isSectionCollapsed('scheduled', scheduledPatients.length) && (
                                <div className="mt-4">
                                    {scheduledPatients.length > 0 ? (
                                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 animate-fadeIn">
                                            {scheduledPatients.map(p => (
                                                <PatientCard key={p.id} patient={p} userRole={user?.role} currentUser={user} />
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="bg-white/50 border border-dashed border-indigo-200 rounded-xl p-6 text-center">
                                            <p className="text-indigo-600/70 text-sm italic">No hay cirugías activas con fecha programada.</p>
                                        </div>
                                    )}
                                </div>
                            )}
                        </section>

                        {/* SECTION: BLOCKED PIPELINES */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                            {/* Materials */}
                            <section className="bg-slate-100/50 rounded-xl p-4 border border-slate-200/60 flex flex-col h-fit">
                                <SectionHeader
                                    title="Falta Material (Ortopedia)"
                                    count={materialBlockers.length}
                                    colorClass="text-amber-500"
                                    icon="inventory_2"
                                    sectionKey="materials"
                                />
                                {!isSectionCollapsed('materials', materialBlockers.length) && (
                                    <div className="space-y-3 flex-1 overflow-y-auto max-h-[400px] pr-1 scrollbar-thin scrollbar-thumb-slate-200 animate-fadeIn">
                                        {materialBlockers.map(p => <PatientCard key={p.id} patient={p} userRole={user?.role} currentUser={user} highlight="MAT" />)}
                                        {materialBlockers.length === 0 && <p className="text-xs text-slate-400 italic">Sin pendientes.</p>}
                                    </div>
                                )}
                            </section>

                            {/* Clinical */}
                            <section className="bg-slate-100/50 rounded-xl p-4 border border-slate-200/60 flex flex-col h-fit">
                                <SectionHeader
                                    title="Falta Exámenes (Internación)"
                                    count={clinicalBlockers.length}
                                    colorClass="text-blue-500"
                                    icon="cardiology"
                                    sectionKey="clinical"
                                />
                                {!isSectionCollapsed('clinical', clinicalBlockers.length) && (
                                    <div className="space-y-3 flex-1 overflow-y-auto max-h-[400px] pr-1 scrollbar-thin scrollbar-thumb-slate-200 animate-fadeIn">
                                        {clinicalBlockers.map(p => <PatientCard key={p.id} patient={p} userRole={user?.role} currentUser={user} highlight="EXAM" />)}
                                        {clinicalBlockers.length === 0 && <p className="text-xs text-slate-400 italic">Sin pendientes.</p>}
                                    </div>
                                )}
                            </section>

                            {/* Admin */}
                            <section className="bg-slate-100/50 rounded-xl p-4 border border-slate-200/60 flex flex-col h-fit">
                                <SectionHeader
                                    title="Falta Validación (Quirófano)"
                                    count={otherBlockers.length}
                                    colorClass="text-purple-500"
                                    icon="verified_user"
                                    sectionKey="admin"
                                />
                                {!isSectionCollapsed('admin', otherBlockers.length) && (
                                    <div className="space-y-3 flex-1 overflow-y-auto max-h-[400px] pr-1 scrollbar-thin scrollbar-thumb-slate-200 animate-fadeIn">
                                        {otherBlockers.map(p => <PatientCard key={p.id} patient={p} userRole={user?.role} currentUser={user} highlight="QX" />)}
                                        {otherBlockers.length === 0 && <p className="text-xs text-slate-400 italic">Sin pendientes.</p>}
                                    </div>
                                )}
                            </section>
                        </div>

                        {/* SECTION: SUSPENDED SURGERIES (Requested) */}
                        <section className="bg-slate-100/30 rounded-xl border border-slate-200 p-4 transition-all">
                            <SectionHeader
                                title="Cirugías Suspendidas"
                                count={suspendedPatients.length}
                                colorClass="text-amber-600"
                                icon="pause_circle"
                                sectionKey="suspended"
                            />

                            {!isSectionCollapsed('suspended', suspendedPatients.length) && (
                                <div className="mt-4 animate-fadeIn">
                                    {suspendedPatients.length > 0 ? (
                                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                                            {suspendedPatients.map(p => (
                                                <PatientCard
                                                    key={p.id}
                                                    patient={p}
                                                    userRole={user?.role}
                                                    currentUser={user}
                                                    isSuspended={true}
                                                    onCancel={handleCancelSurgery}
                                                />
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="bg-slate-50 border-2 border-dashed border-slate-200 rounded-xl p-8 text-center">
                                            <p className="text-slate-400 font-medium italic">No hay cirugías suspendidas actualmente.</p>
                                        </div>
                                    )}
                                </div>
                            )}
                        </section>
                    </div>
                ) : viewMode === 'suspended_cancelled' ? (
                    /* VIEW MODE: SUSPENDIDAS Y CANCELADAS */
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
                                    {suspendedPatients.map(p => (
                                        <div key={p.id} className="bg-white rounded-xl border border-amber-200 p-4 shadow-sm hover:shadow transition-all flex flex-col justify-between">
                                            <div>
                                                <div className="flex items-start justify-between gap-2 mb-2">
                                                    <div>
                                                        <h4 className="font-bold text-slate-900 text-sm">{p.name}</h4>
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
                                                            <span>Fecha previa: {p.surgeryDate}</span>
                                                        </div>
                                                    )}
                                                    {p.suspensionReason && (
                                                        <div className="mt-1 pt-1 border-t border-slate-200/60 text-[11px] text-amber-900 font-medium">
                                                            <span className="font-bold">Motivo:</span> {p.suspensionReason}
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
                                    ))}
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
                                                        <h4 className="font-bold text-slate-900 text-sm">{p.name}</h4>
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
                                                            className="flex-1 bg-red-600 hover:bg-red-700 text-white text-xs font-bold py-1.5 rounded-lg flex items-center justify-center gap-1 transition-colors shadow-sm"
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
                    /* VIEW MODE: CIRUGÍAS PASADAS SIN CERRAR */
                    <div className="flex flex-col gap-8 animate-fadeIn">
                        {/* Header Banner */}
                        <div className="bg-rose-950 text-white rounded-2xl p-6 shadow-lg border border-rose-900 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                            <div>
                                <div className="flex items-center gap-2">
                                    <span className="material-symbols-outlined text-rose-400 text-2xl font-bold">history_toggle_off</span>
                                    <h2 className="text-xl font-black tracking-tight">Cirugías Pasadas sin Cerrar (Auditoría Quirúrgica)</h2>
                                </div>
                                <p className="text-rose-200 text-xs mt-1">
                                    Cirugías que figuraban programadas en calendario con fecha anterior a hoy ({todayStr}) y aún no fueron marcadas como completadas.
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
                                                    <h3 className="font-bold text-slate-900 text-base leading-tight">{p.name}</h3>
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
                                                        Fecha: {p.surgeryDate} {p.startTime ? `a las ${p.startTime}` : ''}
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
                                                onClick={() => {
                                                    setQuickCloseModal({
                                                        isOpen: true,
                                                        patient: p,
                                                        startTime: p.actualStartTime || p.startTime || '08:00',
                                                        endTime: p.actualEndTime || '10:00',
                                                        isSubmitting: false
                                                    });
                                                }}
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

                {/* MODAL: SOLICITAR ELIMINACIÓN DEFINITIVA (Para usuarios no admin) */}
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
                                <p><strong className="text-slate-900">Paciente:</strong> {requestDeleteModal.patient.name} (DNI {requestDeleteModal.patient.patientDocument})</p>
                                <p className="mt-1"><strong className="text-slate-900">Procedimiento:</strong> {requestDeleteModal.patient.proc}</p>
                                <p className="mt-1"><strong className="text-slate-900">Estado actual:</strong> {requestDeleteModal.patient.status}</p>
                            </div>

                            <div className="mb-4">
                                <label className="block text-xs font-bold text-slate-700 uppercase mb-1.5">
                                    Motivo de la Eliminación *
                                </label>
                                <textarea
                                    rows={3}
                                    placeholder="Explique detalladamente por qué se debe eliminar esta cirugía (ej. Paciente desistió, duplicado, derivación)..."
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

                {/* MODAL: CIERRE RÁPIDO DE CIRUGÍA (Carga de Horas Realizadas) */}
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
                                <p><strong className="text-slate-900">Paciente:</strong> {quickCloseModal.patient.name} (DNI {quickCloseModal.patient.patientDocument})</p>
                                <p className="mt-1"><strong className="text-slate-900">Cirugía programada:</strong> {quickCloseModal.patient.proc}</p>
                                <p className="mt-1"><strong className="text-slate-900">Fecha agendada:</strong> {quickCloseModal.patient.surgeryDate} ({quickCloseModal.patient.doctor})</p>
                            </div>

                            <div className="grid grid-cols-2 gap-4 mb-4">
                                <div>
                                    <label className="block text-xs font-bold text-slate-700 uppercase mb-1.5">
                                        Hora Inicio Real *
                                    </label>
                                    <input
                                        type="time"
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
                                        className="w-full text-xs rounded-xl border border-slate-200 p-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white font-mono"
                                        value={quickCloseModal.endTime}
                                        onChange={(e) => setQuickCloseModal(prev => ({ ...prev, endTime: e.target.value }))}
                                    />
                                </div>
                            </div>

                            <div className="flex justify-between items-center pt-3 border-t border-slate-100">
                                <button
                                    onClick={() => {
                                        const pId = quickCloseModal.patient?.id;
                                        setQuickCloseModal({ isOpen: false, patient: null, startTime: '', endTime: '', isSubmitting: false });
                                        if (pId) navigate(`/detail/${pId}`, { state: { from: '/kanban' } });
                                    }}
                                    className="text-xs text-primary font-bold hover:underline flex items-center gap-1"
                                >
                                    <span className="material-symbols-outlined text-sm">open_in_new</span>
                                    Abrir Ficha Quirúrgica Completa
                                </button>

                                <div className="flex gap-2">
                                    <button
                                        onClick={() => setQuickCloseModal({ isOpen: false, patient: null, startTime: '', endTime: '', isSubmitting: false })}
                                        disabled={quickCloseModal.isSubmitting}
                                        className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition-colors"
                                    >
                                        Cancelar
                                    </button>
                                    <button
                                        onClick={handleQuickCloseSubmit}
                                        disabled={quickCloseModal.isSubmitting}
                                        className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-sm transition-colors flex items-center gap-1.5 disabled:opacity-50"
                                    >
                                        <span className="material-symbols-outlined text-sm">check</span>
                                        {quickCloseModal.isSubmitting ? 'Guardando...' : 'Confirmar Cierre'}
                                    </button>
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