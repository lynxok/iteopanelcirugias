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

    // Metadata
    dateAdded: string;
    lastUpdate: string;
    status: string;
    surgeryDate?: string;
    startTime?: string;
    orName?: string;
    tags?: string[];
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
const StatusBadge = ({ type, status }: { type: 'Mat' | 'Clin' | 'Adm', status: string }) => {
    let colorClass = 'bg-slate-100/50 text-slate-400 border-slate-200';
    let icon = 'remove';

    if (status === 'OK') { colorClass = 'bg-emerald-100/50 text-emerald-700 border-emerald-200'; icon = 'check'; }
    if (status === 'Pending') { colorClass = 'bg-amber-100/50 text-amber-700 border-amber-200'; icon = 'hourglass_empty'; }
    if (status === 'Missing') { colorClass = 'bg-red-100/50 text-red-700 border-red-200'; icon = 'close'; }

    return (
        <div className={`flex items-center gap-1.5 px-2 py-1 rounded-md border text-[10px] font-bold uppercase tracking-wide backdrop-blur-sm ${colorClass}`}>
            <span className="material-symbols-outlined text-[10px] font-bold">{icon}</span>
            <span>{type}</span>
        </div>
    );
};

const PatientCard: React.FC<{ patient: PreOpPatient; minimal?: boolean; userRole?: string }> = ({ patient, minimal = false, userRole }) => {
    const navigate = useNavigate();
    const progress = calculateProgress(patient);

    return (
        <div
            onClick={() => navigate(`/detail/${patient.id}`)}
            className="group glass-card hover:bg-white/90 p-4 cursor-pointer relative overflow-hidden transition-all duration-300 hover:shadow-lg hover:-translate-y-1"
        >
            {/* Left accent border based on priority */}
            <div className={`absolute left-0 top-0 bottom-0 w-1 ${patient.priority === 'Urgente' || patient.priority === 'Alta' ? 'bg-red-500' : 'bg-blue-500'}`}></div>

            <div className="flex justify-between items-start mb-2 pl-3">
                <div className="flex flex-col">
                    <h4 className="font-bold text-slate-800 text-sm group-hover:text-blue-600 transition-colors leading-tight mb-1">{patient.name}</h4>
                    <p className="text-[10px] text-slate-400 font-medium flex items-center gap-1">
                        <span className="tracking-wider">{patient.patientDocument}</span>
                        <span>•</span>
                        <span>{patient.age} años</span>
                    </p>
                </div>
                {patient.priority !== 'Normal' && (
                    <span className="bg-red-100 text-red-600 text-[9px] font-black px-1.5 py-0.5 rounded-md uppercase tracking-wide border border-red-200">
                        {patient.priority}
                    </span>
                )}
            </div>

            <div className="pl-3 grid grid-cols-1 gap-1 mb-3">
                <div className="text-[10px] text-slate-500 flex items-center gap-1.5 truncate">
                    <span className="material-symbols-outlined text-[14px] text-slate-400">person</span>
                    <span className="truncate font-medium">{patient.doctor}</span>
                </div>
                <div className="text-[10px] text-slate-500 flex items-center gap-1.5 truncate">
                    <span className="material-symbols-outlined text-[14px] text-slate-400">medical_services</span>
                    <span className="truncate">{patient.proc}</span>
                </div>
                {patient.surgeryDate && (
                    <div className="text-[10px] text-blue-600 font-bold flex items-center gap-1.5 bg-blue-50/50 px-2 py-1 rounded-md mt-1 w-fit">
                        <span className="material-symbols-outlined text-[14px]">calendar_today</span>
                        <span>{new Date(patient.surgeryDate + 'T12:00:00').toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })} • {patient.startTime}</span>
                    </div>
                )}
            </div>

            {/* Status Indicators Row */}
            {!minimal && (
                <div className="pl-3 flex items-center gap-1.5 mb-3 flex-wrap">
                    <StatusBadge type="Mat" status={patient.materialStatus} />
                    <StatusBadge type="Clin" status={patient.clinicalStatus} />
                    <StatusBadge type="Adm" status={patient.adminStatus} />
                </div>
            )}

            {/* Progress Bar */}
            <div className="pl-3">
                <div className="flex justify-between items-center text-[9px] mb-1 font-bold uppercase tracking-wide">
                    <span className="text-slate-400">Progreso</span>
                    <span className={`text-${progress === 100 ? 'emerald' : 'blue'}-600`}>{progress}%</span>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-1">
                    <div
                        className={`h-1 rounded-full transition-all duration-500 ${progress === 100 ? 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]' : 'bg-blue-500'}`}
                        style={{ width: `${progress}%` }}
                    ></div>
                </div>
            </div>
            {/* QUICK ACTIONS for Technician / SuperAdmin */}
            {!patient.surgeryDate && (userRole === 'Tecnico' || userRole === 'SuperAdmin') && (
                <div className="pl-3 mt-3 pt-3 border-t border-slate-100">
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/detail/${patient.id}`);
                        }}
                        className="w-full bg-slate-900 hover:bg-slate-800 text-white text-[10px] font-bold uppercase py-1.5 rounded-lg flex items-center justify-center gap-2 transition-all shadow-md shadow-slate-900/10"
                    >
                        Agendar
                    </button>
                </div>
            )}
        </div>
    );
};

const Kanban: React.FC = () => {
    const navigate = useNavigate();
    const { user } = useAuth();
    const [patients, setPatients] = useState<PreOpPatient[]>([]);
    const [loading, setLoading] = useState(true);
    const [filterText, setFilterText] = useState('');

    useEffect(() => {
        fetchPendingSurgeries();
        const channel = supabase.channel('kanban-changes')
            .on('postgres_changes', { event: '*', schema: 'quirofano', table: 'surgeries' }, () => fetchPendingSurgeries())
            .subscribe();
        return () => { supabase.removeChannel(channel); };
    }, [user]);

    const fetchPendingSurgeries = async () => {
        setLoading(true);
        try {
            let query = supabase.from('surgeries').select(`
              id, status, procedure_name, priority, surgery_date, start_time,
              ortho_validated, admission_validated, or_validated, requires_prosthesis,
              created_at,
              patients (full_name, document_number, birth_date),
              doctors!doctor_id (full_name),
              operating_rooms!operating_room_id (name),
              surgery_materials (id)
            `);

            if (user?.role === 'Ortopedia' && user.vendorId) query = query.eq('vendor_id', user.vendorId);
            query = query.or('status.eq.scheduled,status.eq.pending_validation,status.eq.suspended');
            if (user?.role === 'Medico' && user.doctorId) query = query.eq('doctor_id', user.doctorId);

            const { data, error } = await query
                .order('surgery_date', { ascending: true })
                .order('start_time', { ascending: true })
                .order('created_at', { ascending: false });

            if (error) throw error;

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

                return {
                    id: s.id,
                    patientDocument: patient?.document_number || 'N/A',
                    name: patient?.full_name || 'Desconocido',
                    age,
                    doctor: doctor?.full_name || 'No asignado',
                    proc: s.procedure_name || 'Sin nombre',
                    priority: mapPriority(s.priority),
                    materialStatus: s.priority === 'emergency' ? 'OK' : mapStatus(s.ortho_validated, s.requires_prosthesis || (s.surgery_materials && s.surgery_materials.length > 0)),
                    clinicalStatus: mapStatus(s.admission_validated),
                    adminStatus: (mapStatus(s.or_validated) === 'OK' ? 'OK' : 'Pending') as 'OK' | 'Pending',
                    dateAdded: new Date(s.created_at).toLocaleDateString(),
                    lastUpdate: new Date(s.created_at).toLocaleDateString(),
                    status: s.status || 'pending_validation',
                    surgeryDate: s.surgery_date,
                    startTime: s.start_time?.substring(0, 5),
                    orName: orGroup?.name
                };
            });
            setPatients(mapped);
        } catch (err) { console.error(err); }
        finally { setLoading(false); }
    };

    const handleCancelSurgery = async (id: string) => {
        if (!confirm('¿Cancelar definitivamente?')) return;
        try {
            const { error } = await supabase.from('surgeries').update({ status: 'cancelled' }).eq('id', id);
            if (error) throw error;
            fetchPendingSurgeries();
        } catch (err) { alert('Error al cancelar'); }
    };

    // --- Grouping Logic ---
    const filteredPatients = patients.filter(p => p.name.toLowerCase().includes(filterText.toLowerCase()) || p.patientDocument.includes(filterText));

    // 1. New / Unscheduled
    const unscheduledNew = filteredPatients.filter(p => !p.surgeryDate && !isReady(p));
    // 2. Blockers
    const materialBlockers = filteredPatients.filter(p => p.status !== 'suspended' && p.surgeryDate && !isReady(p) && p.materialStatus !== 'OK');
    const clinicalBlockers = filteredPatients.filter(p => p.status !== 'suspended' && p.surgeryDate && !isReady(p) && p.clinicalStatus !== 'OK' && p.materialStatus === 'OK');
    const otherBlockers = filteredPatients.filter(p => p.status !== 'suspended' && p.surgeryDate && !isReady(p) && p.adminStatus !== 'OK' && p.materialStatus === 'OK' && p.clinicalStatus === 'OK');
    // 3. Suspended
    const suspendedPatients = filteredPatients.filter(p => p.status === 'suspended');

    return (
        <div className="flex-1 h-full overflow-y-auto bg-slate-50 relative pb-12 font-sans">
            <ProgressBar isLoading={loading} />
            <div className="absolute top-0 left-0 w-full h-80 bg-gradient-to-b from-indigo-50/80 to-transparent pointer-events-none z-0" />

            <div className="relative z-10 max-w-[1920px] mx-auto p-6 md:p-8 flex flex-col gap-8">

                {/* Header & KPIs */}
                <div className="glass-panel p-6 flex flex-col md:flex-row justify-between gap-6 items-center sticky top-4 z-40 shadow-xl shadow-slate-900/5 backdrop-blur-xl">
                    <div className="flex flex-col gap-1 w-full md:w-auto">
                        <h1 className="text-2xl font-black text-slate-800 tracking-tight leading-none bg-gradient-to-br from-slate-900 to-slate-600 bg-clip-text text-transparent">
                            Gestión de Flujo
                        </h1>
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-wide">
                            Supervisión de validaciones de {patients.length} pacientes
                        </p>
                    </div>

                    {/* Stats */}
                    <div className="flex bg-slate-100/50 rounded-xl p-1 gap-1">
                        <div className="px-4 py-2 rounded-lg bg-white shadow-sm flex flex-col items-center min-w-[80px]">
                            <span className="text-xl font-black text-slate-800 leading-none">{materialBlockers.length}</span>
                            <span className="text-[9px] font-bold text-slate-400 uppercase">Mat</span>
                        </div>
                        <div className="px-4 py-2 rounded-lg bg-white shadow-sm flex flex-col items-center min-w-[80px]">
                            <span className="text-xl font-black text-slate-800 leading-none">{clinicalBlockers.length}</span>
                            <span className="text-[9px] font-bold text-slate-400 uppercase">Clin</span>
                        </div>
                        <div className="px-4 py-2 rounded-lg bg-white shadow-sm flex flex-col items-center min-w-[80px]">
                            <span className="text-xl font-black text-slate-800 leading-none">{otherBlockers.length}</span>
                            <span className="text-[9px] font-bold text-slate-400 uppercase">Adm</span>
                        </div>
                    </div>

                    <div className="flex items-center gap-3 w-full md:w-auto">
                        <div className="relative flex-1 md:w-64">
                            <span className="material-symbols-outlined absolute left-3 top-2.5 text-slate-400 text-lg">search</span>
                            <input
                                type="text"
                                placeholder="Buscar..."
                                className="w-full pl-10 pr-4 py-2 rounded-xl bg-white border border-slate-200 text-sm font-medium focus:ring-2 focus:ring-indigo-500 outline-none shadow-sm transition-all"
                                value={filterText}
                                onChange={(e) => setFilterText(e.target.value)}
                            />
                        </div>
                        {user?.role !== 'Medico' && user?.role !== 'Tecnico' && user?.role !== 'Ortopedia' && (
                            <button
                                onClick={() => navigate('/detail/new')}
                                className="bg-slate-900 hover:bg-slate-800 text-white px-4 py-2 rounded-xl text-sm font-bold shadow-lg shadow-slate-900/20 flex items-center gap-2 transition-all hover:scale-105 active:scale-95"
                            >
                                <span className="material-symbols-outlined text-lg">add</span> <span className="hidden md:inline">Nueva</span>
                            </button>
                        )}
                    </div>
                </div>

                {/* Bento Grid Kanban */}
                <div className="grid grid-cols-1 xl:grid-cols-4 gap-6 h-full">

                    {/* Col 1: Nuevas Solicitudes */}
                    <div className="flex flex-col gap-4">
                        <div className="flex items-center justify-between px-2">
                            <h2 className="text-sm font-black text-slate-700 uppercase tracking-widest flex items-center gap-2">
                                <span className="size-2 rounded-full bg-indigo-500"></span> Nuevas
                            </h2>
                            <span className="bg-slate-200 text-slate-600 text-xs font-bold px-2 py-0.5 rounded-full">{unscheduledNew.length}</span>
                        </div>
                        <div className="glass-panel p-2 min-h-[500px] bg-white/40 flex flex-col gap-3">
                            {unscheduledNew.map(p => <PatientCard key={p.id} patient={p} userRole={user?.role} />)}
                            {unscheduledNew.length === 0 && <span className="text-xs text-slate-400 italic text-center py-10">Sin nuevas solicitudes</span>}
                        </div>
                    </div>

                    {/* Col 2: Bloqueo Materiales */}
                    <div className="flex flex-col gap-4">
                        <div className="flex items-center justify-between px-2">
                            <h2 className="text-sm font-black text-slate-700 uppercase tracking-widest flex items-center gap-2">
                                <span className="size-2 rounded-full bg-amber-500"></span> Materiales
                            </h2>
                            <span className="bg-amber-100 text-amber-700 text-xs font-bold px-2 py-0.5 rounded-full">{materialBlockers.length}</span>
                        </div>
                        <div className="glass-panel p-2 min-h-[500px] bg-amber-50/30 border-amber-100/50 flex flex-col gap-3">
                            {materialBlockers.map(p => <PatientCard key={p.id} patient={p} userRole={user?.role} />)}
                            {materialBlockers.length === 0 && <span className="text-xs text-slate-400 italic text-center py-10">Todo cubierto</span>}
                        </div>
                    </div>

                    {/* Col 3: Bloqueo Clínico */}
                    <div className="flex flex-col gap-4">
                        <div className="flex items-center justify-between px-2">
                            <h2 className="text-sm font-black text-slate-700 uppercase tracking-widest flex items-center gap-2">
                                <span className="size-2 rounded-full bg-blue-500"></span> Clínico
                            </h2>
                            <span className="bg-blue-100 text-blue-700 text-xs font-bold px-2 py-0.5 rounded-full">{clinicalBlockers.length}</span>
                        </div>
                        <div className="glass-panel p-2 min-h-[500px] bg-blue-50/30 border-blue-100/50 flex flex-col gap-3">
                            {clinicalBlockers.map(p => <PatientCard key={p.id} patient={p} userRole={user?.role} />)}
                            {clinicalBlockers.length === 0 && <span className="text-xs text-slate-400 italic text-center py-10">Todo validado</span>}
                        </div>
                    </div>

                    {/* Col 4: Bloqueo Admin */}
                    <div className="flex flex-col gap-4">
                        <div className="flex items-center justify-between px-2">
                            <h2 className="text-sm font-black text-slate-700 uppercase tracking-widest flex items-center gap-2">
                                <span className="size-2 rounded-full bg-purple-500"></span> Admisión
                            </h2>
                            <span className="bg-purple-100 text-purple-700 text-xs font-bold px-2 py-0.5 rounded-full">{otherBlockers.length}</span>
                        </div>
                        <div className="glass-panel p-2 min-h-[500px] bg-purple-50/30 border-purple-100/50 flex flex-col gap-3">
                            {otherBlockers.map(p => <PatientCard key={p.id} patient={p} userRole={user?.role} />)}
                            {otherBlockers.length === 0 && <span className="text-xs text-slate-400 italic text-center py-10">Todo listo</span>}
                        </div>
                    </div>

                </div>

                {/* Suspended Section (Bottom) */}
                {suspendedPatients.length > 0 && (
                    <div className="mt-8">
                        <div className="flex items-center gap-2 mb-4">
                            <span className="material-symbols-outlined text-amber-600 font-bold">pause_circle</span>
                            <h2 className="text-lg font-black text-slate-800">Suspendidas</h2>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 glass-panel p-4 bg-amber-50/50 border-amber-200/50">
                            {suspendedPatients.map(p => (
                                <div key={p.id} className="relative group">
                                    <PatientCard patient={p} userRole={user?.role} />
                                    <div className="absolute inset-0 bg-amber-500/10 backdrop-blur-[1px] rounded-2xl flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all z-10">
                                        <div className="flex gap-2">
                                            <button onClick={(e) => { e.stopPropagation(); navigate('/calendar'); }} className="bg-white text-slate-800 font-bold px-3 py-2 rounded-lg text-xs shadow-lg hover:bg-slate-50">Reprogramar</button>
                                            <button onClick={(e) => { e.stopPropagation(); handleCancelSurgery(p.id); }} className="bg-red-500 text-white font-bold px-3 py-2 rounded-lg text-xs shadow-lg hover:bg-red-600">Cancelar</button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

            </div>
        </div>
    );
};

export default Kanban;