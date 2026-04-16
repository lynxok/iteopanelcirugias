import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../src/lib/supabase';
import { useAuth } from '../src/lib/AuthContext';
import ProgressBar from '../components/ProgressBar';
import ExcelImporter from '../components/ExcelImporter';
import { captureError } from '../src/lib/errorLogger';

interface SurgeryRow {
    id: string;
    patientName: string;
    patientId: string;
    procedure: string;
    doctor: string;
    status: 'Borrador' | 'Pendiente Autorización' | 'Programada' | 'En Quirófano' | 'En Curso' | 'Demorada' | 'Finalizada' | 'Cancelada' | 'Suspendida' | 'A la espera de fecha';
    date: string;
    time: string;
    or?: string;
    medical_coverage?: string;
    vendor_name?: string;
    suspension_requested?: boolean;
    reschedule_requested?: boolean;
}

const mapStatus = (status: string): SurgeryRow['status'] => {
    switch (status) {
        case 'pending_validation': return 'Pendiente Autorización';
        case 'scheduled': return 'Programada';
        case 'in_or': return 'En Quirófano';
        case 'in_progress': return 'En Curso';
        case 'delayed': return 'Demorada';
        case 'completed': return 'Finalizada';
        case 'cancelled': return 'Cancelada';
        case 'suspended': return 'Suspendida';
        case 'waiting_date': return 'A la espera de fecha';
        default: return 'Borrador';
    }
};

const SUSPENSION_REASONS = [
    'Falta de Materiales',
    'Condición del Paciente',
    'Falta de Cama / Sector',
    'Administrativo / Autorización',
    'Error en Programación',
    'Causa Médica / Profesional',
    'Otro'
];

const SurgeryList: React.FC = () => {
    const navigate = useNavigate();
    const { user } = useAuth();
    const [surgeries, setSurgeries] = useState<SurgeryRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [filterStatus, setFilterStatus] = useState<string>('Todos');
    const [filterCoverage, setFilterCoverage] = useState<string>('Todas');
    const [filterVendor, setFilterVendor] = useState<string>('Todas');
    const [coverageTypeFilter, setCoverageTypeFilter] = useState<string>('Todos');
    const [coverageMapping, setCoverageMapping] = useState<Record<string, string>>({});
    const [showImporter, setShowImporter] = useState(false);


    // Modal States
    const [suspensionModal, setSuspensionModal] = useState<{ isOpen: boolean, surgeryId: string | null, reason: string, observations: string }>({
        isOpen: false,
        surgeryId: null,
        reason: SUSPENSION_REASONS[0],
        observations: ''
    });

    const [rescheduleModal, setRescheduleModal] = useState<{ isOpen: boolean, surgeryId: string | null, date: string, time: string }>({
        isOpen: false,
        surgeryId: null,
        date: '',
        time: ''
    });

    useEffect(() => {
        fetchSurgeries();
        fetchCoverageMapping();
    }, []);

    const fetchCoverageMapping = async () => {
        try {
            const { data, error } = await supabase
                .from('coverages')
                .select('name, type');
            if (error) throw error;
            if (data) {
                const mapping: Record<string, string> = {};
                data.forEach((c: any) => {
                    mapping[c.name] = c.type;
                });
                setCoverageMapping(mapping);
            }
        } catch (err) {
            console.error('Error fetching coverage mapping:', err);
        }
    };


    const fetchSurgeries = async () => {
        setLoading(true);
        try {
            let query = supabase
                .from('surgeries')
                .select(`
                    id,
                    procedure_name,
                    surgery_date,
                    start_time,
                    status,
                    priority,
                    operating_room_id,
                    vendor_id,
                    ortho_validated,
                    admission_validated,
                    or_validated,
                    actual_start_time,
                    actual_end_time,
                    estimated_duration,
                    medical_coverage,
                    suspension_requested,
                    reschedule_requested,
                    operating_rooms (name),
                    patients (full_name, document_number),
                    doctors!doctor_id (full_name),
                    vendors (name)
                `);

            if (user?.role === 'Medico' && user.doctorId) {
                query = query.eq('doctor_id', user.doctorId);
            }

            if (user?.role === 'Ortopedia' && user.vendorId) {
                query = query.eq('vendor_id', user.vendorId);
            }

            if (user?.role === 'Oficina ART') {
                const { data: artCoverages } = await supabase
                    .from('coverages')
                    .select('name')
                    .eq('type', 'ART');

                const artNames = artCoverages?.map(c => c.name) || [];
                if (artNames.length > 0) {
                    query = query.in('medical_coverage', artNames);
                } else {
                    // If no ARTs defined, they see nothing (safe)
                    query = query.eq('id', '00000000-0000-0000-0000-000000000000');
                }
            }

            const { data, error } = await query
                .order('created_at', { ascending: false });

            if (error) throw error;

            if (data) {
                // Deduplicate by ID
                const uniqueData = Array.from(new Map((data || []).map((item: any) => [item.id, item])).values());

                const nowAt = new Date();
                const curH = nowAt.getHours();
                const curM = nowAt.getMinutes();
                const curTotalMin = curH * 60 + curM;

                const year = nowAt.getFullYear();
                const month = (nowAt.getMonth() + 1).toString().padStart(2, '0');
                const day = nowAt.getDate().toString().padStart(2, '0');
                const todayStr = `${year}-${month}-${day}`;

                const updates: any[] = [];
                const mappedData: SurgeryRow[] = uniqueData.map((s: any) => {
                    let finalStatus = s.status;
                    const isToday = s.surgery_date === todayStr;

                    // 0. Visual Promotion for Pending (v1.1.11 Logic)
                    if (finalStatus === 'pending_validation' || finalStatus === 'waiting_date' || finalStatus === 'scheduled') {
                        if (s.ortho_validated && s.admission_validated) {
                            if (s.or_validated && s.surgery_date) {
                                finalStatus = 'scheduled';
                            } else {
                                finalStatus = 'waiting_date';
                            }
                        } else {
                            finalStatus = 'pending_validation';
                        }
                    }

                    // Helper to calculate time + duration
                    const calculateEnd = (timeStr: string | null, durationMin: number | null) => {
                        if (!timeStr || !durationMin) return null;
                        const [h, m] = timeStr.split(':').map(Number);
                        const totalMin = h * 60 + m + durationMin;
                        const newH = Math.floor(totalMin / 60) % 24;
                        const newM = totalMin % 60;
                        return `${newH.toString().padStart(2, '0')}:${newM.toString().padStart(2, '0')}`;
                    };

                    const effectiveStart = s.actual_start_time ? s.actual_start_time.substring(0, 5) : (s.start_time?.substring(0, 5) || '--:--');
                    let effectiveEnd = s.actual_end_time ? s.actual_end_time.substring(0, 5) : null;

                    if (!effectiveEnd && effectiveStart !== '--:--' && s.estimated_duration) {
                        effectiveEnd = calculateEnd(effectiveStart, s.estimated_duration);
                    }

                    const displayTime = effectiveEnd ? `${effectiveStart} - ${effectiveEnd}` : effectiveStart;

                    return {
                        id: s.id,
                        patientName: s.patients?.full_name || 'N/A',
                        patientId: s.patients?.document_number || 'N/A',
                        procedure: s.procedure_name,
                        doctor: s.doctors?.full_name || 'N/A',
                        status: mapStatus(finalStatus),
                        date: s.surgery_date || 'TBD',
                        time: s.start_time?.substring(0, 5) || '--:--',
                        or: s.operating_rooms?.name,
                        medical_coverage: s.medical_coverage || 'Sin Cobertura',
                        vendor_name: s.vendors?.name || 'Pendiente',
                        suspension_requested: s.suspension_requested,
                        reschedule_requested: s.reschedule_requested
                    };
                });

                setSurgeries(mappedData);
            }
        } catch (err) {
            console.error('Error fetching surgeries:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleSuspend = async () => {
        if (!suspensionModal.surgeryId) return;

        try {
            const { error } = await supabase
                .from('surgeries')
                .update({
                    status: 'suspended',
                    suspension_reason: suspensionModal.reason,
                    suspension_observations: suspensionModal.observations,
                    or_validated: false, // Reset OR validation on suspension
                    or_validation_date: null,
                    or_validated_by_name: null
                })
                .eq('id', suspensionModal.surgeryId);

            if (error) throw error;

            // Audit Log (Non-blocking)
            captureError(`Suspensión: ${suspensionModal.reason}`, {
                context: 'SurgeryList.handleSuspend.audit',
                severity: 'WARNING',
                user: user,
                metadata: {
                    user_name: user?.name,
                    action: 'STATUS_CHANGE',
                    resource_id: suspensionModal.surgeryId,
                    reason: suspensionModal.reason,
                    observations: suspensionModal.observations
                }
            });

            supabase.from('audit_logs').insert({
                user_name: user?.name || 'Sistema',
                user_role: user?.role,
                action: 'STATUS_CHANGE',
                resource: 'Cirugía',
                resource_id: suspensionModal.surgeryId,
                description: `Cirugía suspendida. Motivo: ${suspensionModal.reason}. Observaciones: ${suspensionModal.observations}`,
                meta: { source: 'SurgeryList' }
            }).then(({ error: auditError }) => {
                if (auditError) console.warn('Silent Audit Error:', auditError);
            });

            setSuspensionModal({ ...suspensionModal, isOpen: false });
            fetchSurgeries();
        } catch (err) {
            console.error('Error suspending surgery:', err);
            alert('Error al suspender la cirugía');
        }
    };

    const handleRequestSuspension = async () => {
        if (!suspensionModal.surgeryId) return;

        try {
            const { error } = await supabase
                .from('surgeries')
                .update({
                    suspension_requested: true,
                    request_note: suspensionModal.observations,
                    request_date: new Date().toISOString(),
                    request_user_name: user?.name || 'Enfermería'
                })
                .eq('id', suspensionModal.surgeryId);

            if (error) throw error;

            // System Alert
            const surgery = surgeries.find(s => s.id === suspensionModal.surgeryId);
            await supabase.from('system_alerts').insert({
                type: 'suspension_requested',
                severity: 'Warning',
                title: 'Solicitud de Suspensión',
                message: `El área de Enfermería solicita la suspensión de la cirugía de ${surgery?.patientName}. Motivo: ${suspensionModal.observations}`,
                patientName: surgery?.patientName || 'N/A',
                surgeryId: suspensionModal.surgeryId,
                targetRole: 'Tecnico',
                status: 'Active'
            });

            alert('Solicitud de suspensión enviada al equipo técnico.');
            setSuspensionModal({ ...suspensionModal, isOpen: false });
            fetchSurgeries();
        } catch (err) {
            console.error('Error requesting suspension:', err);
            alert('Error al solicitar la suspensión');
        }
    };

    const handleReschedule = async () => {
        if (!rescheduleModal.surgeryId) return;

        try {
            const { error } = await supabase
                .from('surgeries')
                .update({
                    surgery_date: rescheduleModal.date,
                    start_time: rescheduleModal.time,
                    status: 'scheduled',
                    or_validated: user?.role === 'Tecnico', // Auto-validate if Técnico, otherwise reset
                    or_validation_date: user?.role === 'Tecnico' ? new Date().toISOString() : null,
                    or_validated_by_name: user?.role === 'Tecnico' ? (user?.name || 'Técnico') : null
                })
                .eq('id', rescheduleModal.surgeryId);

            if (error) throw error;

            // Audit Log (Non-blocking)
            captureError(`Reprogramación: ${rescheduleModal.date} ${rescheduleModal.time}`, {
                context: 'SurgeryList.handleReschedule.audit',
                severity: 'WARNING',
                user: user,
                metadata: {
                    user_name: user?.name,
                    action: 'UPDATE',
                    resource_id: rescheduleModal.surgeryId,
                    newDate: rescheduleModal.date,
                    newTime: rescheduleModal.time
                }
            });

            supabase.from('audit_logs').insert({
                user_name: user?.name || 'Sistema',
                user_role: user?.role,
                action: 'UPDATE',
                resource: 'Cirugía',
                resource_id: rescheduleModal.surgeryId,
                description: `Cirugía reprogramada para el ${rescheduleModal.date} a las ${rescheduleModal.time}`,
                meta: { source: 'SurgeryList' }
            }).then(({ error: auditError }) => {
                if (auditError) console.warn('Silent Audit Error:', auditError);
            });

            setRescheduleModal({ ...rescheduleModal, isOpen: false });
            fetchSurgeries();
        } catch (err) {
            console.error('Error rescheduling surgery:', err);
            alert('Error al reprogramar la cirugía');
        }
    };

    const handleRequestReschedule = async () => {
        if (!rescheduleModal.surgeryId) return;

        try {
            const { error } = await supabase
                .from('surgeries')
                .update({
                    reschedule_requested: true,
                    request_note: `Nueva fecha sugerida: ${rescheduleModal.date} ${rescheduleModal.time}`,
                    request_date: new Date().toISOString(),
                    request_user_name: user?.name || 'Enfermería'
                })
                .eq('id', rescheduleModal.surgeryId);

            if (error) throw error;

            // System Alert
            const surgery = surgeries.find(s => s.id === rescheduleModal.surgeryId);
            await supabase.from('system_alerts').insert({
                type: 'reschedule_requested',
                severity: 'Warning',
                title: 'Solicitud de Reprogramación',
                message: `El área de Enfermería solicita reprogramar la cirugía de ${surgery?.patientName} para el ${rescheduleModal.date} ${rescheduleModal.time}`,
                patientName: surgery?.patientName || 'N/A',
                surgeryId: rescheduleModal.surgeryId,
                targetRole: 'Tecnico',
                status: 'Active'
            });

            alert('Solicitud de reprogramación enviada al equipo técnico.');
            setRescheduleModal({ ...rescheduleModal, isOpen: false });
            fetchSurgeries();
        } catch (err) {
            console.error('Error requesting reschedule:', err);
            alert('Error al solicitar la reprogramación');
        }
    };

    // Filter Logic
    const filteredData = surgeries.filter(item => {
        const matchesSearch =
            item.patientName.toLowerCase().includes(searchTerm.toLowerCase()) ||
            item.patientId.includes(searchTerm) ||
            item.procedure.toLowerCase().includes(searchTerm.toLowerCase()) ||
            item.doctor.toLowerCase().includes(searchTerm.toLowerCase());

        const matchesStatus = filterStatus === 'Todos' || item.status === filterStatus;

        const matchesCoverage = filterCoverage === 'Todas' || item.medical_coverage === filterCoverage;
        const matchesVendor = filterVendor === 'Todas' || item.vendor_name === filterVendor;

        let matchesType = true;
        if (coverageTypeFilter !== 'Todos') {
            const type = item.medical_coverage ? coverageMapping[item.medical_coverage] : 'Particular';
            if (coverageTypeFilter === 'ART') {
                matchesType = type === 'ART' || (item.medical_coverage?.toUpperCase().includes('ART'));
            } else if (coverageTypeFilter === 'Obra Social') {
                matchesType = type === 'Obra Social' && !item.medical_coverage?.toUpperCase().includes('ART');
            } else if (coverageTypeFilter === 'Particular') {
                matchesType = !item.medical_coverage || item.medical_coverage === 'Sin Cobertura' || item.medical_coverage.toUpperCase() === 'PARTICULAR' || type === 'Particular';
            }
        }

        return matchesSearch && matchesStatus && matchesCoverage && matchesVendor && matchesType;
    });


    // Derive unique coverages for dropdown
    const uniqueCoverages = useMemo(() => {
        const coverages = new Set(surgeries.map(s => s.medical_coverage).filter(Boolean));
        return ['Todas', ...Array.from(coverages).sort()];
    }, [surgeries]);

    const uniqueVendors = useMemo(() => {
        const vendors = new Set(surgeries.map(s => s.vendor_name).filter(Boolean));
        return ['Todas', ...Array.from(vendors).sort()];
    }, [surgeries]);

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'Programada': return 'bg-gray-100 text-gray-700 border-gray-200';
            case 'En Quirófano': return 'bg-purple-50 text-purple-700 border-purple-200';
            case 'En Curso': return 'bg-blue-50 text-blue-700 border-blue-200 animate-pulse';
            case 'Demorada': return 'bg-amber-50 text-amber-700 border-amber-200';
            case 'Pendiente Autorización': return 'bg-orange-50 text-orange-700 border-orange-200';
            case 'A la espera de fecha': return 'bg-sky-50 text-sky-700 border-sky-200';
            case 'Finalizada': return 'bg-emerald-50 text-emerald-700 border-emerald-200';
            case 'Cancelada':
            case 'Suspendida': return 'bg-red-50 text-red-700 border-red-200';
            case 'Borrador': return 'bg-slate-100 text-slate-600 border-slate-200';
            default: return 'bg-slate-100 text-slate-600';
        }
    };

    return (
        <div className="flex-1 h-full overflow-y-auto bg-slate-50 p-8 font-sans">
            <ProgressBar isLoading={loading} />
            <div className="max-w-[1600px] mx-auto flex flex-col gap-6">

                {/* Excel Importer Section */}
                {user?.role === 'SuperAdmin' && showImporter && (
                    <ExcelImporter onComplete={() => {
                        setShowImporter(false);
                        fetchSurgeries();
                    }} />
                )}

                {/* Search and Filters */}
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <div>
                        <h1 className="text-2xl font-bold text-slate-900">Listado General</h1>
                        <p className="text-slate-500 text-sm mt-1">Gestión centralizada de todas las solicitudes quirúrgicas.</p>
                    </div>
                    {user?.role !== 'Medico' && user?.role !== 'Tecnico' && user?.role !== 'Ortopedia' && (
                        <div className="flex flex-col md:flex-row gap-2">
                            {user?.role === 'SuperAdmin' && (
                                <button
                                    onClick={() => setShowImporter(!showImporter)}
                                    className="h-10 px-4 bg-slate-100 text-slate-700 rounded-xl font-bold flex items-center gap-2 hover:bg-slate-200 transition-all border border-slate-200"
                                >
                                    <span className="material-symbols-outlined text-lg">upload_file</span>
                                    {showImporter ? 'Cerrar Importador' : 'Importar Excel'}
                                </button>
                            )}
                            <button
                                onClick={() => navigate('/nueva-cirugia')}
                                className="h-10 px-4 bg-primary text-white rounded-xl font-bold flex items-center gap-2 hover:bg-primary/90 transition-all shadow-lg shadow-primary/20"
                            >
                                <span className="material-symbols-outlined text-lg">add</span>
                                Nueva Cirugía
                            </button>
                        </div>
                    )}
                </div>

                {/* Filters Bar */}
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row gap-4 items-center justify-between">
                    <div className="relative w-full md:w-96">
                        <span className="material-symbols-outlined absolute left-3 top-2.5 text-slate-400">search</span>
                        <input
                            type="text"
                            placeholder="Buscar por Paciente, DNI, Procedimiento..."
                            className="w-full pl-10 pr-4 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-primary focus:border-primary outline-none text-sm transition-all"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>

                    <div className="flex items-center gap-2 w-full md:w-auto overflow-x-auto pb-2 md:pb-0">

                        {/* Coverage Filter */}
                        <div className="flex items-center gap-2">
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Cobertura:</span>
                            <select
                                value={filterCoverage}
                                onChange={(e) => setFilterCoverage(e.target.value)}
                                className="px-3 py-1.5 rounded-lg text-xs font-bold border border-slate-300 bg-white text-slate-700 outline-none focus:ring-2 focus:ring-primary/50"
                            >
                                {uniqueCoverages.map(c => (
                                    <option key={c} value={c}>{c}</option>
                                ))}
                            </select>
                        </div>

                        {/* Vendor Filter */}
                        <div className="flex items-center gap-2">
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Ortopedia:</span>
                            <select
                                value={filterVendor}
                                onChange={(e) => setFilterVendor(e.target.value)}
                                className="px-3 py-1.5 rounded-lg text-xs font-bold border border-slate-300 bg-white text-slate-700 outline-none focus:ring-2 focus:ring-primary/50"
                            >
                                {uniqueVendors.map(v => (
                                    <option key={v} value={v}>{v}</option>
                                ))}
                            </select>
                        </div>

                        <div className="h-6 w-px bg-slate-200 hidden md:block mr-4"></div>

                        <span className="text-sm font-bold text-slate-500 whitespace-nowrap mr-2">Estado:</span>
                        {['Todos', 'Programada', 'Suspendida', 'Pendiente Autorización'].map(status => (
                            <button
                                key={status}
                                onClick={() => setFilterStatus(status)}
                                className={`px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap border transition-all ${filterStatus === status
                                    ? 'bg-slate-800 text-white border-slate-800'
                                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                                    }`}
                            >
                                {status}
                            </button>
                        ))}

                        <div className="h-6 w-px bg-slate-200 hidden md:block mx-2"></div>
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Tipo:</span>
                        {['Todos', 'ART', 'Obra Social', 'Particular'].map(type => (
                            <button
                                key={type}
                                onClick={() => setCoverageTypeFilter(type)}
                                className={`px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap border transition-all ${coverageTypeFilter === type
                                    ? 'bg-blue-600 text-white border-blue-600 shadow-md shadow-blue-200'
                                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                                    }`}
                            >
                                {type === 'Obra Social' ? 'Obra Social / Prepaga' : type}
                            </button>
                        ))}
                    </div>

                </div>

                {/* Table Section */}
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex-1">
                    {/* DESKTOP VIEW */}
                    <div className="hidden md:block overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead className="bg-slate-50 border-b border-slate-200">
                                <tr>
                                    <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Paciente</th>
                                    <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Procedimiento</th>
                                    <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Cirujano</th>
                                    <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Cobertura</th>
                                    <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Ortopedia</th>
                                    <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Estado</th>
                                    <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Fecha / Qx</th>
                                    <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Acciones</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {filteredData.length > 0 ? (
                                    filteredData.map((row) => (
                                        <tr
                                            key={row.id}
                                            className="hover:bg-blue-50/30 transition-colors group cursor-pointer"
                                            onClick={() => navigate(`/detail/${row.id}`)}
                                        >
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-3">
                                                    {(row.suspension_requested || row.reschedule_requested) && (
                                                        <div className={`shrink-0 size-6 rounded-full flex items-center justify-center shadow-sm animate-pulse ${row.suspension_requested ? 'bg-amber-100 text-amber-600' : 'bg-indigo-100 text-indigo-600'}`} title={row.suspension_requested ? 'Solicitud de Suspensión' : 'Solicitud de Reprogramación'}>
                                                            <span className="material-symbols-outlined text-base font-bold">
                                                                {row.suspension_requested ? 'report_problem' : 'event_repeat'}
                                                            </span>
                                                        </div>
                                                    )}
                                                    <div className="flex flex-col">
                                                        <span className="font-bold text-slate-900 text-sm">{row.patientName}</span>
                                                        <span className="text-xs text-slate-400 font-mono">{row.patientId}</span>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <span className="text-sm font-medium text-slate-700">{row.procedure}</span>
                                            </td>
                                            <td className="px-6 py-4 text-sm text-slate-600">
                                                {row.doctor}
                                            </td>
                                            <td className="px-6 py-4">
                                                <span className={`inline-block px-2 py-0.5 rounded text-[11px] font-bold border transition-colors ${row.medical_coverage === 'Sin Cobertura'
                                                        ? 'bg-slate-50 text-slate-400 border-slate-200'
                                                        : 'bg-blue-50 text-blue-700 border-blue-200'
                                                    }`}>
                                                    {row.medical_coverage}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4">
                                                <span className={`inline-block px-2 py-0.5 rounded text-[11px] font-bold border ${row.vendor_name === 'Pendiente'
                                                        ? 'bg-amber-50 text-amber-700 border-amber-200 italic'
                                                        : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                                    }`}>
                                                    {row.vendor_name}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="flex flex-col gap-1 items-start">
                                                    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold border ${getStatusColor(row.status)}`}>
                                                        {row.status}
                                                    </span>
                                                    {row.date !== 'TBD' && row.status === 'Pendiente Autorización' && (
                                                        <span className="flex items-center gap-1 text-[9px] text-blue-600 font-bold bg-blue-50 px-1.5 py-0.5 rounded border border-blue-100">
                                                            <span className="material-symbols-outlined text-[12px]">calendar_month</span>
                                                            FECHA RESERVADA
                                                        </span>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="flex flex-col">
                                                    <span className="text-sm font-bold text-slate-700">{row.date} {row.time}</span>
                                                    {row.or && <span className="text-[10px] text-slate-500 uppercase font-bold">{row.or}</span>}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 text-right">
                                                <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <button
                                                        title="Suspender"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setSuspensionModal({ ...suspensionModal, isOpen: true, surgeryId: row.id });
                                                        }}
                                                        className="text-amber-500 hover:bg-amber-50 p-1.5 rounded-lg border border-transparent hover:border-amber-200 transition-all"
                                                    >
                                                        <span className="material-symbols-outlined text-lg">block</span>
                                                    </button>
                                                    <button
                                                        title="Reprogramar"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setRescheduleModal({ ...rescheduleModal, isOpen: true, surgeryId: row.id, date: row.date });
                                                        }}
                                                        className="text-blue-500 hover:bg-blue-50 p-1.5 rounded-lg border border-transparent hover:border-blue-200 transition-all"
                                                    >
                                                        <span className="material-symbols-outlined text-lg">event_repeat</span>
                                                    </button>
                                                    <button
                                                        title="Ver Detalle"
                                                        className="text-slate-400 hover:text-primary transition-colors p-1.5 hover:bg-slate-100 rounded-lg"
                                                    >
                                                        <span className="material-symbols-outlined text-lg">chevron_right</span>
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))
                                ) : (
                                    <tr>
                                        <td colSpan={6} className="px-6 py-12 text-center text-slate-400">
                                            <span className="material-symbols-outlined text-4xl mb-2">search_off</span>
                                            <p className="text-sm font-medium">No se encontraron cirugías con los filtros actuales.</p>
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>

                    {/* MOBILE VIEW (CARDS) */}
                    <div className="md:hidden flex flex-col divide-y divide-slate-100 bg-slate-50/50">
                        {filteredData.length > 0 ? (
                            filteredData.map((row) => (
                                <div
                                    key={row.id}
                                    onClick={() => navigate(`/detail/${row.id}`)}
                                    className="p-4 bg-white active:bg-slate-50 transition-colors cursor-pointer"
                                >
                                    <div className="flex justify-between items-start mb-3">
                                        <div className="flex flex-col max-w-[70%]">
                                            <span className="font-bold text-slate-900 text-sm leading-tight">{row.patientName}</span>
                                            <span className="text-xs text-slate-500 mt-1">{row.procedure}</span>
                                            <div className="flex flex-wrap gap-1 mt-2">
                                                {row.medical_coverage && row.medical_coverage !== 'Sin Cobertura' && (
                                                    <span className="text-[9px] text-blue-600 font-bold bg-blue-50 px-1.5 py-0.5 rounded border border-blue-100">
                                                        {row.medical_coverage}
                                                    </span>
                                                )}
                                                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${row.vendor_name === 'Pendiente'
                                                        ? 'bg-amber-50 text-amber-600 border-amber-100'
                                                        : 'bg-emerald-50 text-emerald-600 border-emerald-100'
                                                    }`}>
                                                    {row.vendor_name}
                                                </span>
                                            </div>
                                        </div>
                                        <span className={`px-2 py-1 rounded-full text-[10px] font-bold border whitespace-nowrap ${getStatusColor(row.status).split(' ').filter(c => !c.includes('border')).join(' ')}`}>
                                            {row.status}
                                        </span>
                                    </div>

                                    <div className="grid grid-cols-2 gap-y-2 gap-x-4 text-xs text-slate-600 mb-4">
                                        <div className="flex items-center gap-1.5">
                                            <span className="material-symbols-outlined text-[16px] text-slate-400">calendar_month</span>
                                            <span className="font-medium">{row.date}</span>
                                        </div>
                                        <div className="flex items-center gap-1.5">
                                            <span className="material-symbols-outlined text-[16px] text-slate-400">schedule</span>
                                            <span className="font-medium">{row.time}</span>
                                        </div>
                                        <div className="flex items-center gap-1.5 col-span-2">
                                            <span className="material-symbols-outlined text-[16px] text-slate-400">person</span>
                                            <span className="truncate">{row.doctor}</span>
                                        </div>
                                    </div>

                                    <div className="flex gap-2 pt-3 border-t border-slate-100">
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setRescheduleModal({ ...rescheduleModal, isOpen: true, surgeryId: row.id, date: row.date });
                                            }}
                                            className="flex-1 py-2 rounded-lg bg-blue-50 text-blue-600 text-xs font-bold border border-blue-100 flex items-center justify-center gap-1"
                                        >
                                            <span className="material-symbols-outlined text-[14px]">event_repeat</span> Reprogramar
                                        </button>
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setSuspensionModal({ ...suspensionModal, isOpen: true, surgeryId: row.id });
                                            }}
                                            className="flex-1 py-2 rounded-lg bg-amber-50 text-amber-600 text-xs font-bold border border-amber-100 flex items-center justify-center gap-1"
                                        >
                                            <span className="material-symbols-outlined text-[14px]">block</span> Suspender
                                        </button>
                                    </div>
                                </div>
                            ))
                        ) : (
                            <div className="px-6 py-12 text-center text-slate-400 bg-white">
                                <span className="material-symbols-outlined text-4xl mb-2">search_off</span>
                                <p className="text-sm font-medium">No se encontraron cirugías.</p>
                            </div>
                        )}
                    </div>

                    {/* Pagination Footer (Mock) */}
                    <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
                        <p className="text-xs text-slate-500">Mostrando {filteredData.length} resultados</p>
                        <div className="flex items-center gap-2">
                            <button className="p-1 rounded hover:bg-white border border-transparent hover:border-slate-200 text-slate-400 hover:text-slate-600 disabled:opacity-50">
                                <span className="material-symbols-outlined">chevron_left</span>
                            </button>
                            <button className="p-1 rounded hover:bg-white border border-transparent hover:border-slate-200 text-slate-400 hover:text-slate-600">
                                <span className="material-symbols-outlined">chevron_right</span>
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Suspension Modal */}
            {suspensionModal.isOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border border-slate-200 animate-in fade-in zoom-in duration-200">
                        <div className="bg-amber-50 p-6 border-b border-amber-100 flex items-center gap-4">
                            <div className="size-12 bg-amber-100 rounded-full flex items-center justify-center text-amber-600 shadow-inner">
                                <span className="material-symbols-outlined text-3xl">warning</span>
                            </div>
                             <div>
                                <h2 className="text-xl font-black text-amber-900">{user?.role === 'Internacion' ? 'Solicitar Suspensión' : 'Suspender Cirugía'}</h2>
                                <p className="text-amber-700 text-xs font-bold uppercase tracking-widest">{user?.role === 'Internacion' ? 'Aviso a Coordinación' : 'Protocolo de Auditoría'}</p>
                            </div>
                        </div>

                        <div className="p-6 flex flex-col gap-5">
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Motivo Estandarizado</label>
                                <select
                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-medium focus:ring-2 focus:ring-amber-500 outline-none transition-all"
                                    value={suspensionModal.reason}
                                    onChange={(e) => setSuspensionModal({ ...suspensionModal, reason: e.target.value })}
                                >
                                    {SUSPENSION_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
                                </select>
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Observaciones de Auditoría</label>
                                <textarea
                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm min-h-[120px] focus:ring-2 focus:ring-amber-500 outline-none transition-all"
                                    placeholder="Detalle los motivos específicos o bloqueos encontrados..."
                                    value={suspensionModal.observations}
                                    onChange={(e) => setSuspensionModal({ ...suspensionModal, observations: e.target.value })}
                                />
                            </div>
                        </div>

                        <div className="bg-slate-50 p-6 flex flex-col sm:flex-row gap-3">
                            <button
                                onClick={() => setSuspensionModal({ ...suspensionModal, isOpen: false })}
                                className="flex-1 px-4 py-3 bg-white border border-slate-200 text-slate-600 font-bold rounded-xl hover:bg-slate-100 transition-all text-sm"
                            >
                                Cancelar
                            </button>
                             <button
                                onClick={user?.role === 'Internacion' ? handleRequestSuspension : handleSuspend}
                                className="flex-1 px-4 py-3 bg-amber-600 text-white font-black rounded-xl hover:bg-amber-700 shadow-lg shadow-amber-200 transition-all text-sm"
                            >
                                {user?.role === 'Internacion' ? 'Enviar Solicitud' : 'Confirmar Suspensión'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Reschedule Modal */}
            {rescheduleModal.isOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border border-slate-200 animate-in fade-in zoom-in duration-200">
                        <div className="bg-blue-50 p-6 border-b border-blue-100 flex items-center gap-4">
                            <div className="size-12 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 shadow-inner">
                                <span className="material-symbols-outlined text-3xl">event_repeat</span>
                            </div>
                             <div>
                                <h2 className="text-xl font-black text-blue-900">{user?.role === 'Internacion' ? 'Solicitar Cambio' : 'Reprogramar'}</h2>
                                <p className="text-blue-700 text-xs font-bold uppercase tracking-widest">{user?.role === 'Internacion' ? 'Sugerencia de Fecha' : 'Ajuste de Calendario'}</p>
                            </div>
                        </div>

                        <div className="p-6 flex flex-col gap-5">
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Nueva Fecha</label>
                                <input
                                    type="date"
                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-medium focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                                    value={rescheduleModal.date}
                                    onChange={(e) => setRescheduleModal({ ...rescheduleModal, date: e.target.value })}
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Nueva Hora</label>
                                <input
                                    type="time"
                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-medium focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                                    value={rescheduleModal.time}
                                    onChange={(e) => setRescheduleModal({ ...rescheduleModal, time: e.target.value })}
                                />
                            </div>
                        </div>

                        <div className="bg-slate-50 p-6 flex flex-col sm:flex-row gap-3">
                            <button
                                onClick={() => setRescheduleModal({ ...rescheduleModal, isOpen: false })}
                                className="flex-1 px-4 py-3 bg-white border border-slate-200 text-slate-600 font-bold rounded-xl hover:bg-slate-100 transition-all text-sm"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={user?.role === 'Internacion' ? handleRequestReschedule : handleReschedule}
                                className="flex-1 px-4 py-3 bg-blue-600 text-white font-black rounded-xl hover:bg-blue-700 shadow-lg shadow-blue-200 transition-all text-sm"
                            >
                                {user?.role === 'Internacion' ? 'Solicitar Cambio' : 'Confirmar Reprogramación'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default SurgeryList;