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
    dateAdded: string;
    lastUpdate: string;
    status: string;
    surgeryDate?: string;
    startTime?: string;
    orName?: string;
    tags?: string[];
    authorizationDate?: string; 
    vendorId?: string; 
    suspensionRequested?: boolean;
    rescheduleRequested?: boolean;
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
    highlight?: 'MAT' | 'EXAM' | 'QX';
    isSuspended?: boolean;
    onCancel?: (id: string) => void;
}> = ({ patient, minimal = false, userRole, highlight, isSuspended, onCancel }) => {
    const navigate = useNavigate();
    const progress = calculateProgress(patient);

    return (
        <div
            onClick={() => navigate(`/detail/${patient.id}`)}
            className="group bg-white rounded-xl border border-slate-200 shadow-sm hover:shadow-md hover:border-primary/30 transition-all p-4 cursor-pointer relative overflow-hidden"
        >
            {/* Left accent border based on priority */}
            <div className={`absolute left-0 top-0 bottom-0 w-1 ${patient.priority === 'Urgente' || patient.priority === 'Alta' ? 'bg-red-500' : 'bg-blue-500'}`}></div>

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
                <div className="flex items-center gap-2">
                    <StatusBadge type="MAT" status={patient.materialStatus} highlight={highlight === 'MAT'} tooltip={patient.materialTooltip} />
                    <StatusBadge type="EXAM" status={patient.clinicalStatus} highlight={highlight === 'EXAM'} tooltip={patient.clinicalTooltip} />
                    <StatusBadge type="QX" status={patient.adminStatus} highlight={highlight === 'QX'} tooltip={patient.adminTooltip} />
                </div>
            )}

            {/* Progress Bar */}
            <div className="pl-3">
                <div className="flex justify-between items-center text-[10px] mb-1 font-medium">
                    <span className="text-slate-400">Prep. Pre-Qx</span>
                    {!isReady(patient) ? (
                        <span className="text-amber-600 font-bold bg-amber-50 px-1.5 rounded border border-amber-100 uppercase tracking-tighter">Falta Validación</span>
                    ) : (
                        <span className="text-emerald-600 font-bold bg-emerald-50 px-1.5 rounded border border-emerald-100 uppercase tracking-tighter">Validado OK</span>
                    )}
                    <span className="text-slate-400">{progress}%</span>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-1.5">
                    <div
                        className={`h-1.5 rounded-full transition-all duration-500 ${progress === 100 ? 'bg-emerald-500' : 'bg-blue-500'}`}
                        style={{ width: `${progress}%` }}
                    ></div>
                </div>
            </div>

            {/* QUICK ACTIONS for Suspended (Integrated) */}
            {isSuspended && (userRole === 'SuperAdmin' || userRole === 'Tecnico') && (
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
                            navigate(`/detail/${patient.id}`);
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

const Kanban: React.FC = () => {
    const navigate = useNavigate();
    const { user } = useAuth();
    const [patients, setPatients] = useState<PreOpPatient[]>([]);
    const [loading, setLoading] = useState(true);
    const [filterText, setFilterText] = useState('');

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

    const fetchPendingSurgeries = async () => {
        setLoading(true);
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
          admission_validated,
          or_validated,
          requires_prosthesis,
          pre_op_exams,
          consent_signed,
          or_validation_date,
          or_validated_by_name,
          created_at,
          vendor_id,
          suspension_requested,
          reschedule_requested,
          patients (full_name, document_number, birth_date),
          doctors!doctor_id (full_name),
          operating_rooms!operating_room_id (name),
          surgery_materials (id)
        `);

            if (user?.role === 'Ortopedia' && user.vendorId) {
                query = query.eq('vendor_id', user.vendorId);
            }
            // We fetch surgeries that are NOT completed/cancelled, or specifically those that are not yet fully validated
            query = query.or('status.eq.scheduled,status.eq.pending_validation,status.eq.suspended');

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

                const clinStatus = mapStatus(s.admission_validated);
                const clinicalTooltip = clinStatus === 'OK' ? 'Validación clínica completada' : 
                    (!s.pre_op_exams && !s.consent_signed ? 'Faltan exámenes pre-quirúrgicos y consentimiento firmado' : 
                    (!s.pre_op_exams ? 'Faltan cargar/validar exámenes pre-quirúrgicos' : 
                    (!s.consent_signed ? 'Falta firma de consentimiento informado' : 'Falta validación final de Internación')));

                const admStatus = (mapStatus(s.or_validated) === 'OK' ? 'OK' : 'Pending') as 'OK' | 'Pending';
                const adminTooltip = admStatus === 'OK' ? 'Quirófano y horario confirmados' : 'Falta asignar quirófano o programar horario final';

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
                    dateAdded: new Date(s.created_at).toLocaleDateString(),
                    lastUpdate: new Date(s.created_at).toLocaleDateString(),
                    status: s.status || 'pending_validation',
                    surgeryDate: s.surgery_date,
                    startTime: s.start_time?.substring(0, 5),
                    orName: orGroup?.name,
                    authorizationDate: s.authorization_date,
                    vendorId: s.vendor_id,
                    suspensionRequested: s.suspension_requested,
                    rescheduleRequested: s.reschedule_requested
                };
            });

            setPatients(mapped);
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

    // 0. Authorized (Has auth date, no scheduled date)
    const authorizedPatients = filteredPatients.filter(p => !p.surgeryDate && p.authorizationDate && p.status !== 'suspended');

    // 1. Ready to Schedule (isReady, no date, no auth) - NEW SECTION
    const readyToSchedule = filteredPatients.filter(p => !p.surgeryDate && !p.authorizationDate && isReady(p) && p.status !== 'suspended');

    // 2. Unscheduled (No Date, No Auth Date, NOT Ready)
    const unscheduledNew = filteredPatients.filter(p => !p.surgeryDate && !p.authorizationDate && !isReady(p) && p.status !== 'suspended');

    // 3. Blocked Scheduled (Has Date but something is missing)
    const materialBlockers = filteredPatients.filter(p => p.status !== 'suspended' && p.surgeryDate && !isReady(p) && p.materialStatus !== 'OK');
    const clinicalBlockers = filteredPatients.filter(p => p.status !== 'suspended' && p.surgeryDate && !isReady(p) && p.clinicalStatus !== 'OK' && p.materialStatus === 'OK');
    const otherBlockers = filteredPatients.filter(p => p.status !== 'suspended' && p.surgeryDate && !isReady(p) && p.adminStatus !== 'OK' && p.materialStatus === 'OK' && p.clinicalStatus === 'OK');

    // 4. Other Statuses
    const suspendedPatients = filteredPatients.filter(p => p.status === 'suspended');

    const handleCancelSurgery = async (id: string) => {
        // ... (same implementation)
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
                // Fetch vendor email and name
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
                    console.log(`Email notification queued for vendor: ${vendorData.name} (${vendorData.email})`);
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
            <span className={`material-symbols-outlined text-slate-400 transition-transform duration-200 ${collapsedSections[sectionKey] ? '-rotate-90' : 'rotate-0'}`}>
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

                    {showKPIs && (
                        <div className="flex overflow-x-auto pb-4 gap-3 scrollbar-hide -mx-8 px-8 md:mx-0 md:px-0 md:grid md:grid-cols-4 md:pb-0 md:overflow-visible animate-fadeIn">
                            <div className="flex-shrink-0 w-[160px] md:w-auto bg-amber-50 border border-amber-100 p-3 rounded-xl flex items-center gap-3 shadow-sm hover:shadow-md transition-all">
                                <div className="size-10 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center">
                                    <span className="material-symbols-outlined">inventory_2</span>
                                </div>
                                <div>
                                    <p className="text-2xl font-black text-amber-700 leading-none">{materialBlockers.length}</p>
                                    <p className="text-xs font-bold text-amber-600 uppercase">Falta Material</p>
                                </div>
                            </div>
                            <div className="flex-shrink-0 w-[160px] md:w-auto bg-blue-50 border border-blue-100 p-3 rounded-xl flex items-center gap-3 shadow-sm hover:shadow-md transition-all">
                                <div className="size-10 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center">
                                    <span className="material-symbols-outlined">clinical_notes</span>
                                </div>
                                <div>
                                    <p className="text-2xl font-black text-blue-700 leading-none">{clinicalBlockers.length}</p>
                                    <p className="text-xs font-bold text-blue-600 uppercase">Falta Exámenes</p>
                                </div>
                            </div>
                            <div className="flex-shrink-0 w-[160px] md:w-auto bg-emerald-50 border border-emerald-100 p-3 rounded-xl flex items-center gap-3 shadow-sm hover:shadow-md transition-all">
                                <div className="size-10 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center">
                                    <span className="material-symbols-outlined">how_to_reg</span>
                                </div>
                                <div>
                                    <p className="text-2xl font-black text-emerald-700 leading-none">
                                        {authorizedPatients.length + unscheduledNew.length + readyToSchedule.length + materialBlockers.length + clinicalBlockers.length + otherBlockers.length}
                                    </p>
                                    <p className="text-xs font-bold text-emerald-600 uppercase whitespace-nowrap">Total Activos</p>
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
                ) : (
                    <div className="flex flex-col gap-8">

                        {/* SECTION: AUTHORIZED (NEW) */}
                        <section className="bg-white/50 rounded-xl border border-slate-200 p-4 transition-all">
                            <SectionHeader
                                title="Autorizadas sin Fecha"
                                count={authorizedPatients.length}
                                colorClass="text-emerald-500"
                                icon="verified"
                                sectionKey="authorized"
                            />

                            {!collapsedSections['authorized'] && (
                                <div className="mt-4">
                                    {authorizedPatients.length > 0 ? (
                                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 animate-fadeIn">
                                            {authorizedPatients.map(p => (
                                                <PatientCard key={p.id} patient={p} userRole={user?.role} />
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="bg-slate-50 border border-dashed border-slate-200 rounded-xl p-6 text-center">
                                            <p className="text-slate-400 text-sm italic">No hay cirugías autorizadas pendientes de fecha.</p>
                                        </div>
                                    )}
                                </div>
                            )}
                        </section>

                        {/* SECTION: NEW & UNSCHEDULED REQUESTS */}
                        <section className="bg-white/50 rounded-xl border border-slate-200 p-4 transition-all">
                            <SectionHeader
                                title="Nuevas Solicitudes (Sin Autorización)"
                                count={unscheduledNew.length}
                                colorClass="text-indigo-500"
                                icon="new_releases"
                                sectionKey="unscheduled"
                            />

                            {!collapsedSections['unscheduled'] && (
                                <div className="mt-4 animate-fadeIn">
                                    {unscheduledNew.length > 0 ? (
                                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                                            {unscheduledNew.map(p => <PatientCard key={p.id} patient={p} userRole={user?.role} />)}
                                        </div>
                                    ) : (
                                        <div className="bg-slate-50 border border-dashed border-slate-200 rounded-xl p-6 text-center">
                                            <p className="text-slate-400 text-sm italic">No hay solicitudes nuevas sin fecha.</p>
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

                            {!collapsedSections['ready'] && (
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
                                {!collapsedSections['materials'] && (
                                    <div className="space-y-3 flex-1 overflow-y-auto max-h-[400px] pr-1 scrollbar-thin scrollbar-thumb-slate-200 animate-fadeIn">
                                        {materialBlockers.map(p => <PatientCard key={p.id} patient={p} userRole={user?.role} highlight="MAT" />)}
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
                                {!collapsedSections['clinical'] && (
                                    <div className="space-y-3 flex-1 overflow-y-auto max-h-[400px] pr-1 scrollbar-thin scrollbar-thumb-slate-200 animate-fadeIn">
                                        {clinicalBlockers.map(p => <PatientCard key={p.id} patient={p} userRole={user?.role} highlight="EXAM" />)}
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
                                {!collapsedSections['admin'] && (
                                    <div className="space-y-3 flex-1 overflow-y-auto max-h-[400px] pr-1 scrollbar-thin scrollbar-thumb-slate-200 animate-fadeIn">
                                        {otherBlockers.map(p => <PatientCard key={p.id} patient={p} userRole={user?.role} highlight="QX" />)}
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

                            {!collapsedSections['suspended'] && (
                                <div className="mt-4 animate-fadeIn">
                                    {suspendedPatients.length > 0 ? (
                                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                                            {suspendedPatients.map(p => (
                                                <PatientCard 
                                                    key={p.id} 
                                                    patient={p} 
                                                    userRole={user?.role} 
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
                )
                }
            </div >
        </div >
    );
};

export default Kanban;