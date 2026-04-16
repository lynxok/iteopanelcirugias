import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../src/lib/supabase';
import { useAuth } from '../src/lib/AuthContext';
import { QRCodeSVG } from 'qrcode.react';
import { Html5Qrcode } from 'html5-qrcode';
import { HospitalRoom, HospitalBed, HospitalAdmission, Patient, HospitalMedicationLog, CatalogItem, HospitalMedicationPlan } from '../types';
import ProgressBar from '../components/ProgressBar';

import HospitalizationStats from './HospitalizationStats';
import SurgeryMiniMonitor from '../components/SurgeryMiniMonitor';
import SurgicalCoordinationAlerts from '../components/SurgicalCoordinationAlerts';

const HospitalizationMap: React.FC = () => {
    const { user } = useAuth();
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    const [view, setView] = useState<'map' | 'stats'>('map');
    const [rooms, setRooms] = useState<HospitalRoom[]>([]);
    const [beds, setBeds] = useState<HospitalBed[]>([]);
    const [selectedBed, setSelectedBed] = useState<HospitalBed | null>(null);
    const [showBedModal, setShowBedModal] = useState(false);
    const [showConfigModal, setShowConfigModal] = useState(false);

    // Filter by Floor (optional)
    const [filterFloor, setFilterFloor] = useState('Todas');

    // Medication State
    const [medications, setMedications] = useState<CatalogItem[]>([]);
    const [medicationLogs, setMedicationLogs] = useState<HospitalMedicationLog[]>([]);
    const [medPlans, setMedPlans] = useState<HospitalMedicationPlan[]>([]);
    const [showMedForm, setShowMedForm] = useState(false);
    const [showScheduleForm, setShowScheduleForm] = useState(false);
    const [newMed, setNewMed] = useState({ name: '', dose: '', unit: 'mg', next_dose_time: '' });
    const [newPlan, setNewPlan] = useState({ name: '', dose: '', unit: 'mg', frequency: '8', start_time: '', days: '' });
    const [showDischargeDialog, setShowDischargeDialog] = useState(false);
    const [tempDischarge, setTempDischarge] = useState('');
    const [doctors, setDoctors] = useState<{id: string, full_name: string, specialty?: string}[]>([]);
    const [patientManualCode, setPatientManualCode] = useState('');
    const [isScanning, setIsScanning] = useState(false);
    const [scannerError, setScannerError] = useState<string | null>(null);
    const scannerRef = useRef<Html5Qrcode | null>(null);

    // Edit states
    const [editingLog, setEditingLog] = useState<HospitalMedicationLog | null>(null);
    const [editingPlan, setEditingPlan] = useState<HospitalMedicationPlan | null>(null);
    const [editMedValue, setEditMedValue] = useState({ name: '', dose: '', unit: '', next_dose_time: '' });
    const [editPlanValue, setEditPlanValue] = useState({ name: '', dose: '', unit: '', frequency: '', next_dose_time: '', ends_at: '' });

    // Real-time Ticker
    const [currentTime, setCurrentTime] = useState(new Date());

    useEffect(() => {
        const timer = setInterval(() => setCurrentTime(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        setLoading(true);
        try {
            // Fetch rooms
            const { data: roomsData, error: roomsError, status: s1 } = await supabase.from('hospital_rooms').select('*').order('name');
            console.log('Fetch Rooms Response:', { roomsData, roomsError, status: s1 });
            if (roomsError) throw roomsError;

            // Fetch beds with their admissions
            // We fetch all admissions and will use the one without check_out as the 'active' one
            const { data: bedsData, error: bedsError, status: s2 } = await supabase
                .from('hospital_beds')
                .select(`
                    *,
                    active_admission:hospital_admissions(
                        *,
                        doctor:doctor_id(id, full_name),
                        patient:patients(
                            *,
                            surgeries:surgeries(
                                procedure_name,
                                surgery_date,
                                medical_coverage,
                                doctor:doctor_id(full_name)
                            )
                        )
                    )
                `);
            
            console.log('Fetch Beds Response:', { bedsData, bedsError, status: s2 });
            if (bedsError) throw bedsError;

            // Post-process to ensure active_admission is actually the one without check_out
            // (In case a bed has multiple historical admissions)
            const processedBeds = (bedsData || []).map(bed => {
                const admissions = Array.isArray(bed.active_admission) ? bed.active_admission : [bed.active_admission];
                const active = admissions.find((a: any) => a && !a.check_out);
                return { ...bed, active_admission: active || null };
            });

            setRooms(roomsData || []);
            setBeds(processedBeds);

            // Fetch Medication List
            const { data: medData } = await supabase.from('catalog_items').select('*').eq('category', 'medication');
            setMedications(medData || []);

            // Fetch active plans to calculate alerts
            const { data: plansData } = await supabase
                .from('hospital_medication_plans')
                .select('*')
                .eq('active', true);
            setMedPlans(plansData || []);

            // Fetch Doctors (Filter only surgeons)
            const { data: doctorsData } = await supabase.from('doctors').select('id, full_name, specialty').eq('active', true).order('full_name');
            const surgeons = (doctorsData || []).filter(d => d.specialty !== 'Anestesista');
            setDoctors(surgeons);
        } catch (err: any) {
            console.error('Error fetching hospitalization data:', err);
        } finally {
            setLoading(false);
        }
    };

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'available': return 'bg-emerald-500';
            case 'occupied': return 'bg-red-500';
            case 'cleaning_pending': return 'bg-amber-400 animate-pulse';
            case 'maintenance': return 'bg-slate-400';
            default: return 'bg-slate-200';
        }
    };

    const getStatusText = (status: string) => {
        switch (status) {
            case 'available': return 'Libre';
            case 'occupied': return 'Ocupada';
            case 'cleaning_pending': return 'Pend. Limpieza';
            case 'maintenance': return 'Mantenimiento';
            default: return status;
        }
    };

    const canManageMedication = () => {
        if (!user || !selectedBed?.active_admission) return false;
        if (user.role === 'SuperAdmin' || user.role === 'Direccion') return true;
        
        // Check if user is the responsible doctor by ID or Name
        const respDoctorId = selectedBed.active_admission.doctor_id;
        const respDoctorName = selectedBed.active_admission.doctor?.full_name;
        
        if (user.doctorId && respDoctorId && user.doctorId === respDoctorId) return true;
        if (user.name && respDoctorName && user.name === respDoctorName) return true;
        
        return false;
    };

    const getMedicationAlert = (admissionId: string) => {
        if (!admissionId) return null;
        
        // Filter alerts for this admission
        const logAlerts = medicationLogs
            .filter(l => l.admission_id === admissionId && l.next_dose_at)
            .map(l => ({ name: l.drug_name || l.medication_name, time: new Date(l.next_dose_at!) }));

        const planAlerts = medPlans
            .filter(p => p.admission_id === admissionId && p.next_dose_at)
            .map(p => ({ name: p.drug_name || p.medication_name, time: new Date(p.next_dose_at!) }));

        const allAlerts = [...logAlerts, ...planAlerts]
            .sort((a, b) => a.time.getTime() - b.time.getTime());
        
        if (allAlerts.length === 0) return null;
        
        const soonest = allAlerts[0];
        const diffMs = soonest.time.getTime() - currentTime.getTime();
        const diffMins = diffMs / (1000 * 60);

        if (diffMins <= 0) return { type: 'overdue', ...soonest };
        if (diffMins <= 30) return { type: 'upcoming', ...soonest };
        
        return null;
    };

    const handleBedClick = async (bed: HospitalBed) => {
        setSelectedBed(bed);
        setShowBedModal(true);
        
        if (bed.status === 'occupied' && bed.active_admission) {
            const admissionId = bed.active_admission.id;
            
            const [logsRes, plansRes] = await Promise.all([
                supabase
                    .from('hospital_medication_logs')
                    .select('*')
                    .eq('admission_id', admissionId)
                    .order('administered_at', { ascending: false }),
                supabase
                    .from('hospital_medication_plans')
                    .select('*')
                    .eq('admission_id', admissionId)
                    .eq('active', true)
                    .order('next_dose_at', { ascending: true })
            ]);

            setMedicationLogs(logsRes.data || []);
            setMedPlans(plansRes.data || []);
        }
    };

    const stopScanner = useCallback(async () => {
        if (scannerRef.current) {
            try {
                await scannerRef.current.stop();
                scannerRef.current = null;
                setIsScanning(false);
            } catch (e) { console.error(e); }
        }
    }, []);

    const startScanner = useCallback(async () => {
        if (!document.getElementById('modal-qr-reader')) return;
        setIsScanning(true);
        setScannerError(null);
        
        try {
            const html5Qrcode = new Html5Qrcode('modal-qr-reader');
            scannerRef.current = html5Qrcode;
            await html5Qrcode.start(
                { facingMode: "environment" },
                { fps: 10, qrbox: { width: 250, height: 250 } },
                (decodedText) => {
                    handleManualAdmission(decodedText);
                    stopScanner();
                },
                () => {}
            );
        } catch (err: any) {
            console.error(err);
            setIsScanning(false);
            if (err.toString().includes('NotAllowedError')) {
                setScannerError('Acceso denegado. Por favor, habilite el permiso de cámara en su navegador.');
            } else {
                setScannerError('No se pudo iniciar la cámara.');
            }
        }
    }, []);

    useEffect(() => {
        if (showBedModal && selectedBed?.status === 'available') {
            const timer = setTimeout(startScanner, 500);
            return () => clearTimeout(timer);
        } else {
            stopScanner();
        }
    }, [showBedModal, selectedBed, startScanner, stopScanner]);

    const handleManualAdmission = async (codeOverride?: string) => {
        const inputCode = codeOverride || patientManualCode;
        if (!inputCode || !selectedBed) return;
        const cleanCode = inputCode.replace(/^#/, '').trim();
        
        setLoading(true);
        try {
            // Priority 1: Buscar por ID de cirugía (fragmento o completo) usando RPC para permitir cast a texto
            let surgery: any = null;
            const { data: rpcData, error: rpcError } = await (supabase as any).rpc('get_surgery_by_code', { 
                search_code: cleanCode 
            });

            if (rpcData && rpcData.length > 0) {
                const { data: fullSurgery } = await supabase
                    .from('surgeries')
                    .select('id, doctor_id, patients(id, full_name, allergies)')
                    .eq('id', rpcData[0].id)
                    .maybeSingle();
                if (fullSurgery) surgery = fullSurgery;
            }

            // Priority 2: Si no se encontró y el código parece un DNI, buscar la cirugía más reciente del paciente
            if (!surgery && /^\d+$/.test(cleanCode) && cleanCode.length >= 7) {
                const { data: surgeriesByDni, error: dniError } = await supabase
                    .from('surgeries')
                    .select('id, doctor_id, surgery_date, created_at, patients!inner(id, full_name, allergies, document_number)')
                    .eq('patients.document_number', cleanCode)
                    .order('surgery_date', { ascending: false })
                    .order('created_at', { ascending: false })
                    .limit(1);
                
                if (dniError) console.error('Error buscando por DNI:', dniError);
                if (surgeriesByDni && surgeriesByDni.length > 0) {
                    surgery = surgeriesByDni[0] as any;
                }
            }

            if (!surgery) throw new Error('No se encontró ninguna cirugía con ese código o DNI');

            // Create admission
            const patientData = Array.isArray(surgery.patients) ? surgery.patients[0] : surgery.patients;
            if (!patientData) throw new Error('Datos del paciente no encontrados');

            const { error: admError } = await supabase
                .from('hospital_admissions')
                .insert({
                    patient_id: patientData.id,
                    bed_id: selectedBed.id,
                    doctor_id: surgery.doctor_id,
                    observations: `Ingreso manual desde mapa (Cód: ${cleanCode})`,
                    allergies: patientData.allergies
                });

            if (admError) throw admError;

            // Update bed status
            await supabase.from('hospital_beds').update({ status: 'occupied' }).eq('id', selectedBed.id);
            await supabase.from('hospital_bed_history').insert({ bed_id: selectedBed.id, status: 'occupied', changed_by: user?.name });

            setPatientManualCode('');
            setShowBedModal(false);
            fetchData();
        } catch (err: any) {
            alert(err.message || 'Error al procesar el ingreso');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="flex-1 h-full overflow-y-auto bg-slate-50 p-8 font-sans">
            <ProgressBar isLoading={loading} />
            
            <div className="max-w-[1600px] mx-auto flex flex-col gap-6">
                {/* Header */}
                <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
                    <div className="w-full lg:w-auto">
                        <h1 className="text-xl md:text-2xl font-bold text-slate-900 flex flex-wrap items-center gap-2">
                            Mapa de Enfermería
                            <span className="text-[10px] bg-slate-200 px-2 py-0.5 rounded text-slate-500 font-bold uppercase tracking-tighter self-center">v2.1.3</span>
                        </h1>
                        <div className="flex flex-col sm:flex-row sm:items-center gap-4 mt-2 sm:mt-1">
                            <p className="text-slate-500 text-sm">Gestión de camas y habitaciones en tiempo real.</p>
                            <div className="flex items-center gap-2 bg-white border border-slate-200 px-3 py-1 rounded-lg shadow-sm w-fit">
                                <span className="material-symbols-outlined text-slate-400 text-sm">schedule</span>
                                <span className="text-base md:text-lg font-black text-slate-900 font-mono tracking-wider">
                                    {currentTime.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}
                                </span>
                            </div>
                        </div>
                    </div>
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full lg:w-auto">
                        <div className="flex bg-slate-200/50 p-1 rounded-xl border border-slate-200 w-full sm:w-auto">
                            <button 
                                onClick={() => setView('map')}
                                className={`flex-1 sm:flex-none px-4 py-1.5 rounded-lg text-[10px] md:text-xs font-bold transition-all flex items-center justify-center gap-2 ${view === 'map' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                            >
                                <span className="material-symbols-outlined text-base md:text-lg">map</span>
                                Mapa
                            </button>
                            <button 
                                onClick={() => setView('stats')}
                                className={`flex-1 sm:flex-none px-4 py-1.5 rounded-lg text-[10px] md:text-xs font-bold transition-all flex items-center justify-center gap-2 ${view === 'stats' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                            >
                                <span className="material-symbols-outlined text-base md:text-lg">monitoring</span>
                                Estadísticas
                            </button>
                        </div>
                        <div className="flex gap-2 w-full sm:w-auto">
                            {(user?.role === 'SuperAdmin' || (user?.role as any) === 'Dirección') && (
                                <button 
                                    onClick={() => setShowConfigModal(true)}
                                    className="flex-1 sm:flex-none h-10 px-3 md:px-4 bg-slate-800 text-white rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-slate-700 transition-all shadow-lg text-[10px] md:text-xs"
                                >
                                    <span className="material-symbols-outlined text-base md:text-lg">settings</span>
                                    <span className="hidden sm:inline">Configurar Planta</span>
                                    <span className="sm:hidden">Planta</span>
                                </button>
                            )}
                            <button 
                                onClick={() => navigate('/hospitalization-scanner')}
                                className="flex-1 sm:flex-none h-10 px-3 md:px-4 bg-primary text-white rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-primary/90 transition-all shadow-lg shadow-primary/20 text-[10px] md:text-xs"
                            >
                                <span className="material-symbols-outlined text-base md:text-lg">qr_code_scanner</span>
                                <span className="hidden sm:inline">Asignar Cama</span>
                                <span className="sm:hidden">Asignar</span>
                            </button>
                        </div>
                    </div>
                </div>

                {view === 'map' ? (
                    <div className="flex flex-col lg:flex-row gap-6 md:gap-8 items-start">
                        {/* Right Column (Mobile: top, Desktop: side): Mini Monitor */}
                        <div className="w-full lg:w-80 flex-none lg:sticky lg:top-8 order-first lg:order-last">
                            <SurgeryMiniMonitor />
                        </div>

                        {/* Left Column: Legend & Beds */}
                        <div className="flex-1 space-y-6 w-full">
                            {/* Floor Legend & Filters */}
                            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
                                <div className="flex flex-wrap gap-4 md:gap-6 items-center">
                                    <div className="flex items-center gap-2">
                                        <div className="size-3 rounded-full bg-emerald-500"></div>
                                        <span className="text-xs font-bold text-slate-600">Libre</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <div className="size-3 rounded-full bg-red-500"></div>
                                        <span className="text-xs font-bold text-slate-600">Ocupada</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <div className="size-3 rounded-full bg-amber-400"></div>
                                        <span className="text-xs font-bold text-slate-600">A limpiar</span>
                                    </div>
                                </div>
                            </div>

                            {/* Graphical Layout */}
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 gap-6">
                                {rooms.map(room => (
                                    <div key={room.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
                                        <div className="bg-slate-50 px-4 py-3 border-b border-slate-200 flex justify-between items-center">
                                            <h3 className="font-black text-slate-800 uppercase tracking-tighter">Habitacion {room.name}</h3>
                                            <span className="text-[10px] bg-white px-2 py-0.5 rounded-full border border-slate-200 text-slate-400 font-bold uppercase">{room.floor}</span>
                                        </div>
                                        <div className="p-4 grid grid-cols-1 xs:grid-cols-2 gap-3">
                                            {beds.filter(b => b.room_id === room.id).map(bed => {
                                                const admission = bed.active_admission;
                                                return (
                                                    <div 
                                                        key={bed.id}
                                                        onClick={() => handleBedClick(bed)}
                                                        className={`relative p-3 rounded-xl border-2 cursor-pointer transition-all hover:scale-[1.02] ${
                                                            bed.status === 'occupied' 
                                                            ? 'bg-red-50 border-red-200' 
                                                            : bed.status === 'cleaning_pending'
                                                            ? 'bg-amber-50 border-amber-200'
                                                            : 'bg-emerald-50 border-emerald-200'
                                                        }`}
                                                    >
                                                        <div className="flex justify-between items-start">
                                                            <div className="flex flex-col">
                                                                <span className="text-xs font-black text-slate-900">{bed.bed_code}</span>
                                                                {admission && (
                                                                    <div className="flex items-center gap-1 mt-1">
                                                                        {getMedicationAlert(admission.id)?.type === 'overdue' && (
                                                                            <span 
                                                                                className="material-symbols-outlined text-sm text-red-600 animate-pulse font-bold"
                                                                                title={`ATRASADO: ${getMedicationAlert(admission.id)?.name} (${getMedicationAlert(admission.id)?.time.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false })})`}
                                                                            >
                                                                                medication_liquid
                                                                            </span>
                                                                        )}
                                                                        {getMedicationAlert(admission.id)?.type === 'upcoming' && (
                                                                            <span 
                                                                                className="material-symbols-outlined text-sm text-amber-500 font-bold"
                                                                                title={`PRÓXIMO: ${getMedicationAlert(admission.id)?.name} (${getMedicationAlert(admission.id)?.time.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false })})`}
                                                                            >
                                                                                medication
                                                                            </span>
                                                                        )}
                                                                        {admission.ready_at && (
                                                                            <div className="absolute -top-2 -right-2 bg-emerald-600 text-white px-2 py-0.5 rounded-full flex items-center gap-1 shadow-lg animate-pulse ring-2 ring-white z-10">
                                                                                <span className="material-symbols-outlined text-[10px] font-black">verified</span>
                                                                                <span className="text-[9px] font-black uppercase tracking-tighter">ALTA</span>
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                )}
                                                            </div>
                                                            <div className={`size-2 rounded-full ${getStatusColor(bed.status)}`}></div>
                                                        </div>
                                                        <div className="mt-2 min-h-[40px]">
                                                            {admission ? (
                                                                <p className="text-[11px] font-bold text-slate-700 line-clamp-2">{admission.patient?.full_name}</p>
                                                            ) : (
                                                                <p className="text-[10px] text-slate-400 italic">{getStatusText(bed.status)}</p>
                                                            )}
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                ) : (
                    <HospitalizationStats />
                )}
            </div>

            {/* Bed Detail Modal */}
            {showBedModal && selectedBed && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-md p-4 text-left">
                    <div className="bg-white rounded-[32px] shadow-2xl w-full max-w-xl max-h-[90vh] overflow-hidden flex flex-col border border-slate-200 animate-in fade-in zoom-in duration-300">
                        <div className={`p-6 border-b flex justify-between items-center ${
                            selectedBed.status === 'occupied' ? 'bg-red-50 border-red-100' : 
                            selectedBed.status === 'cleaning_pending' ? 'bg-amber-50 border-amber-100' : 
                            'bg-emerald-50 border-emerald-100'
                        }`}>
                            <div className="flex items-center gap-3">
                                <div className={`size-10 rounded-full flex items-center justify-center text-white ${getStatusColor(selectedBed.status)}`}>
                                    <span className="material-symbols-outlined">bed</span>
                                </div>
                                <div>
                                    <h2 className="text-xl font-black text-slate-900">Cama {selectedBed.bed_code}</h2>
                                    <p className="text-xs font-bold uppercase tracking-widest text-slate-500">{getStatusText(selectedBed.status)}</p>
                                </div>
                            </div>
                            <button onClick={() => setShowBedModal(false)} className="size-8 flex items-center justify-center rounded-full hover:bg-black/5 text-slate-400">
                                <span className="material-symbols-outlined">close</span>
                            </button>
                        </div>
                        
                        <div className="flex-1 overflow-y-auto p-4 md:p-8 space-y-8 scrollbar-hide">
                            {selectedBed.status === 'occupied' && selectedBed.active_admission ? (
                                <div className="space-y-6">
                                    {selectedBed.active_admission.ready_at && (
                                        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center gap-3 animate-pulse">
                                            <span className="material-symbols-outlined text-emerald-600 text-2xl">verified</span>
                                            <div>
                                                <p className="text-xs font-black text-emerald-800 uppercase">Alta Médica Otorgada</p>
                                                <p className="text-[10px] text-emerald-600 font-bold">El paciente tiene el alta médica confirmada.</p>
                                            </div>
                                        </div>
                                    )}
                                    <div className="flex gap-4 p-4 bg-slate-50 rounded-2xl border border-slate-100">
                                        <div className="size-12 bg-white rounded-xl border border-slate-200 flex items-center justify-center text-primary shadow-sm">
                                            <span className="material-symbols-outlined text-2xl">person</span>
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-xs font-bold text-slate-400 uppercase tracking-tighter">Paciente</p>
                                            <h2 className="text-lg font-black text-slate-900 leading-tight">{selectedBed.active_admission.patient?.full_name}</h2>
                                            <p className="text-[10px] text-slate-500 font-mono">ID: {selectedBed.active_admission.patient?.document_number}</p>
                                            
                                            <div className="mt-3 flex flex-col gap-1">
                                                <label className="text-[9px] font-black text-primary uppercase ml-1">Médico Responsable</label>
                                                <select 
                                                    className="w-full h-8 bg-slate-50 border border-slate-200 rounded-lg px-2 text-[10px] font-bold text-slate-700 outline-none focus:ring-2 focus:ring-primary/10 transition-all cursor-pointer"
                                                    value={selectedBed.active_admission.doctor_id || ''}
                                                    onChange={async (e) => {
                                                        const newVal = e.target.value;
                                                        const { error } = await supabase
                                                            .from('hospital_admissions')
                                                            .update({ doctor_id: newVal || null })
                                                            .eq('id', selectedBed.active_admission!.id);
                                                        if (error) alert('Error al actualizar médico');
                                                        else fetchData();
                                                    }}
                                                >
                                                    <option value="">(Asignar médico...)</option>
                                                    {doctors.map(d => (
                                                        <option key={d.id} value={d.id}>{d.full_name}</option>
                                                    ))}
                                                </select>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                                            <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Edad</p>
                                            <p className="text-sm font-bold text-slate-700">
                                                {selectedBed.active_admission.patient?.birth_date 
                                                    ? `${Math.floor((new Date().getTime() - new Date(selectedBed.active_admission.patient.birth_date).getTime()) / (1000 * 60 * 60 * 24 * 365.25))} años` 
                                                    : 'N/A'}
                                            </p>
                                        </div>
                                        <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                                            <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Cobertura</p>
                                            <p className="text-sm font-bold text-slate-700 truncate">
                                                {(selectedBed.active_admission.patient as any)?.surgeries?.[0]?.medical_coverage || 'N/A'}
                                            </p>
                                        </div>
                                        <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                                            <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Cirugia</p>
                                            <p className="text-xs font-bold text-slate-700 line-clamp-1">
                                                {(selectedBed.active_admission.patient as any)?.surgeries?.[0]?.procedure_name || 'N/A'}
                                            </p>
                                            <p className="text-[9px] text-slate-400">
                                                {(selectedBed.active_admission.patient as any)?.surgeries?.[0]?.surgery_date || ''}
                                            </p>
                                        </div>
                                        <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                                            <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Medico</p>
                                            <p className="text-xs font-bold text-slate-700 truncate">
                                                {(selectedBed.active_admission.patient as any)?.surgeries?.[0]?.doctor?.full_name || 'N/A'}
                                            </p>
                                        </div>
                                    </div>

                                    {/* Medication Section */}
                                    <div className="space-y-4 pt-4 border-t border-slate-100">
                                        <div className="flex justify-between items-center">
                                            <h3 className="text-xs font-black text-slate-900 uppercase tracking-widest flex items-center gap-2">
                                                <span className="material-symbols-outlined text-base text-primary">medication</span>
                                                Suministro de Medicamentos
                                            </h3>
                                            <button 
                                                onClick={() => setShowMedForm(!showMedForm)}
                                                className="size-7 bg-primary/10 text-primary rounded-lg flex items-center justify-center hover:bg-primary/20 transition-all"
                                            >
                                                <span className="material-symbols-outlined text-sm">{showMedForm ? 'close' : 'add'}</span>
                                            </button>
                                        </div>

                                        {showMedForm && (
                                            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3 animate-in fade-in slide-in-from-top-2 duration-200">
                                                <div className="grid grid-cols-2 gap-3">
                                                    <div className="col-span-2">
                                                        <label className="text-[9px] font-bold text-slate-400 uppercase ml-1">Medicamento</label>
                                                        <select 
                                                            className="w-full h-9 bg-white border border-slate-200 rounded-lg px-3 text-xs font-bold"
                                                            value={newMed.name}
                                                            onChange={e => setNewMed({...newMed, name: e.target.value})}
                                                        >
                                                            <option value="">Seleccionar...</option>
                                                            {medications.map(m => <option key={m.id} value={m.name}>{m.name}</option>)}
                                                        </select>
                                                    </div>
                                                    <div>
                                                        <label className="text-[9px] font-bold text-slate-400 uppercase ml-1">Dosis</label>
                                                        <input 
                                                            type="number" 
                                                            className="w-full h-9 bg-white border border-slate-200 rounded-lg px-3 text-xs font-bold"
                                                            placeholder="Cant."
                                                            value={newMed.dose}
                                                            onChange={e => setNewMed({...newMed, dose: e.target.value})}
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="text-[9px] font-bold text-slate-400 uppercase ml-1">Unidad</label>
                                                        <select 
                                                            className="w-full h-9 bg-white border border-slate-200 rounded-lg px-3 text-xs font-bold"
                                                            value={newMed.unit}
                                                            onChange={e => setNewMed({...newMed, unit: e.target.value})}
                                                        >
                                                            <option value="mg">mg</option>
                                                            <option value="ml">ml</option>
                                                            <option value="comp">comp</option>
                                                            <option value="unidades">unid.</option>
                                                        </select>
                                                    </div>
                                                    <div className="col-span-2">
                                                        <label className="text-[9px] font-bold text-slate-400 uppercase ml-1">Proxima Dosis (Hora)</label>
                                                        <input 
                                                            type="time" 
                                                            className="w-full h-9 bg-white border border-slate-200 rounded-lg px-3 text-xs font-bold"
                                                            value={newMed.next_dose_time}
                                                            onChange={e => setNewMed({...newMed, next_dose_time: e.target.value})}
                                                        />
                                                    </div>
                                                </div>
                                                <button 
                                                    className="w-full h-10 bg-primary text-white font-bold rounded-xl text-xs hover:bg-primary/90 transition-all shadow-md shadow-primary/10"
                                                    disabled={!newMed.name || !newMed.dose}
                                                    onClick={async () => {
                                                        let nextDateISO = null;
                                                        if (newMed.next_dose_time) {
                                                            const [hrs, mins] = newMed.next_dose_time.split(':').map(Number);
                                                            const nd = new Date();
                                                            nd.setHours(hrs, mins, 0, 0);
                                                            if (nd < new Date()) {
                                                                nd.setDate(nd.getDate() + 1);
                                                            }
                                                            nextDateISO = nd.toISOString();
                                                        }
                                                        
                                                        const selectedMedItem = medications.find(m => m.name === newMed.name);
                                                        const { error } = await supabase.from('hospital_medication_logs').insert({
                                                            admission_id: selectedBed.active_admission!.id,
                                                            medication_name: newMed.name,
                                                            drug_name: selectedMedItem?.drug_name || newMed.name,
                                                            dose: parseFloat(newMed.dose),
                                                            unit: newMed.unit,
                                                            administered_by: user?.name,
                                                            next_dose_at: nextDateISO
                                                        });
                                                        
                                                        if (error) alert('Error al registrar medicamento');
                                                        else {
                                                            setNewMed({ name: '', dose: '', unit: 'mg', next_dose_time: '' });
                                                            setShowMedForm(false);
                                                            handleBedClick(selectedBed); // Refresh logs
                                                        }
                                                    }}
                                                >
                                                    Registrar Suministro
                                                </button>
                                            </div>
                                        )}

                                        <div className="space-y-2 max-h-[200px] overflow-y-auto pr-1 custom-scrollbar">
                                            {medicationLogs.length === 0 ? (
                                                <div className="text-center py-4 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                                                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Sin medicamentos registrados</p>
                                                </div>
                                            ) : (
                                                medicationLogs.map(log => (
                                                    <div key={log.id} className="p-3 bg-white border border-slate-100 rounded-xl flex justify-between items-center shadow-sm group/log">
                                                        <div className="flex-1">
                                                            <p className="text-xs font-black text-slate-900">{log.drug_name || log.medication_name} <span className="text-slate-400 font-bold">{log.dose} {log.unit}</span></p>
                                                            <p className="text-[9px] text-slate-500 font-medium">({log.medication_name})</p>
                                                            <p className="text-[9px] text-slate-400 font-bold uppercase">{new Date(log.administered_at).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false })} - Por: {log.administered_by}</p>
                                                        </div>
                                                        <div className="flex items-center gap-2">
                                                            <div className="text-right mr-2">
                                                                <p className="text-[8px] font-black text-slate-400 uppercase tracking-tighter">Prox. Dosis</p>
                                                                <p className="text-[11px] font-black text-primary">
                                                                    {log.next_dose_at ? new Date(log.next_dose_at).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false }) : '--:--'}
                                                                </p>
                                                            </div>
                                                            {canManageMedication() && (
                                                                <div className="flex gap-1 transition-opacity">
                                                                    <button 
                                                                        onClick={() => {
                                                                            setEditingLog(log);
                                                                            setEditMedValue({
                                                                                name: log.medication_name,
                                                                                dose: log.dose.toString(),
                                                                                unit: log.unit,
                                                                                next_dose_time: log.next_dose_at ? new Date(log.next_dose_at).toISOString().slice(11, 16) : ''
                                                                            });
                                                                        }}
                                                                        className="size-7 bg-slate-100 text-slate-500 rounded-lg flex items-center justify-center hover:bg-slate-200 hover:text-primary transition-all"
                                                                        title="Editar Suministro"
                                                                    >
                                                                        <span className="material-symbols-outlined text-sm">edit</span>
                                                                    </button>
                                                                    <button 
                                                                        onClick={async () => {
                                                                            if (confirm('¿Eliminar este registro de suministro?')) {
                                                                                const { error } = await supabase.from('hospital_medication_logs').delete().eq('id', log.id);
                                                                                if (error) alert('Error al eliminar log');
                                                                                else handleBedClick(selectedBed!);
                                                                            }
                                                                        }}
                                                                        className="size-7 bg-slate-100 text-slate-500 rounded-lg flex items-center justify-center hover:bg-red-50 hover:text-red-500 transition-all"
                                                                        title="Eliminar Suministro"
                                                                    >
                                                                        <span className="material-symbols-outlined text-sm">delete</span>
                                                                    </button>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                ))
                                            )}

                                            {editingLog && (
                                                <div className="p-4 bg-primary/5 rounded-2xl border border-primary/20 space-y-3 animate-in fade-in slide-in-from-top-2 duration-200">
                                                    <div className="flex justify-between items-center mb-1">
                                                        <p className="text-[10px] font-black text-primary uppercase tracking-widest">Editar Suministro</p>
                                                        <button onClick={() => setEditingLog(null)} className="text-slate-400 hover:text-slate-600">
                                                            <span className="material-symbols-outlined text-sm">close</span>
                                                        </button>
                                                    </div>
                                                    <div className="grid grid-cols-2 gap-3">
                                                        <div className="col-span-2">
                                                            <label className="text-[9px] font-bold text-slate-400 uppercase ml-1">Medicamento</label>
                                                            <select 
                                                                className="w-full h-9 bg-white border border-slate-200 rounded-lg px-3 text-xs font-bold"
                                                                value={editMedValue.name}
                                                                onChange={e => setEditMedValue({...editMedValue, name: e.target.value})}
                                                            >
                                                                {medications.map(m => <option key={m.id} value={m.name}>{m.name}</option>)}
                                                            </select>
                                                        </div>
                                                        <div>
                                                            <label className="text-[9px] font-bold text-slate-400 uppercase ml-1">Dosis</label>
                                                            <input 
                                                                type="number" 
                                                                className="w-full h-9 bg-white border border-slate-200 rounded-lg px-3 text-xs font-bold"
                                                                value={editMedValue.dose}
                                                                onChange={e => setEditMedValue({...editMedValue, dose: e.target.value})}
                                                            />
                                                        </div>
                                                        <div>
                                                            <label className="text-[9px] font-bold text-slate-400 uppercase ml-1">Unidad</label>
                                                            <select 
                                                                className="w-full h-9 bg-white border border-slate-200 rounded-lg px-3 text-xs font-bold"
                                                                value={editMedValue.unit}
                                                                onChange={e => setEditMedValue({...editMedValue, unit: e.target.value})}
                                                            >
                                                                <option value="mg">mg</option>
                                                                <option value="ml">ml</option>
                                                                <option value="comp">comp</option>
                                                                <option value="unidades">unid.</option>
                                                            </select>
                                                        </div>
                                                        <div className="col-span-2">
                                                            <label className="text-[9px] font-bold text-slate-400 uppercase ml-1">Prox. Dosis (Hora)</label>
                                                            <input 
                                                                type="time" 
                                                                className="w-full h-9 bg-white border border-slate-200 rounded-lg px-3 text-xs font-bold"
                                                                value={editMedValue.next_dose_time}
                                                                onChange={e => setEditMedValue({...editMedValue, next_dose_time: e.target.value})}
                                                            />
                                                        </div>
                                                    </div>
                                                    <button 
                                                        className="w-full h-10 bg-primary text-white font-bold rounded-xl text-xs hover:bg-primary/90 transition-all shadow-md shadow-primary/10"
                                                        onClick={async () => {
                                                            let nextDateISO = null;
                                                            if (editMedValue.next_dose_time) {
                                                                const [hrs, mins] = editMedValue.next_dose_time.split(':').map(Number);
                                                                const nd = new Date(editingLog.next_dose_at || new Date());
                                                                nd.setHours(hrs, mins, 0, 0);
                                                                nextDateISO = nd.toISOString();
                                                            }
                                                            
                                                            const { error } = await supabase.from('hospital_medication_logs')
                                                                .update({
                                                                    medication_name: editMedValue.name,
                                                                    drug_name: medications.find(m => m.name === editMedValue.name)?.drug_name || editMedValue.name,
                                                                    dose: parseFloat(editMedValue.dose),
                                                                    unit: editMedValue.unit,
                                                                    next_dose_at: nextDateISO
                                                                })
                                                                .eq('id', editingLog.id);
                                                            
                                                            if (error) alert('Error al actualizar registro');
                                                            else {
                                                                setEditingLog(null);
                                                                handleBedClick(selectedBed!);
                                                            }
                                                        }}
                                                    >
                                                        Guardar Cambios
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Medication Schedule Section */}
                                    <div className="space-y-4 pt-4 border-t border-slate-100">
                                        <div className="flex justify-between items-center">
                                            <h3 className="text-xs font-black text-slate-900 uppercase tracking-widest flex items-center gap-2">
                                                <span className="material-symbols-outlined text-base text-emerald-600">event_note</span>
                                                Esquema de Medicación (Plan)
                                            </h3>
                                            <button 
                                                onClick={() => setShowScheduleForm(!showScheduleForm)}
                                                className="size-7 bg-emerald-100 text-emerald-700 rounded-lg flex items-center justify-center hover:bg-emerald-200 transition-all"
                                            >
                                                <span className="material-symbols-outlined text-sm">{showScheduleForm ? 'close' : 'calendar_add_on'}</span>
                                            </button>
                                        </div>

                                        {showScheduleForm && (
                                            <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-100 space-y-3 animate-in fade-in slide-in-from-top-2 duration-200">
                                                <div className="grid grid-cols-2 gap-3">
                                                    <div className="col-span-2">
                                                        <label className="text-[9px] font-bold text-emerald-600 uppercase ml-1">Medicamento</label>
                                                        <select 
                                                            className="w-full h-9 bg-white border border-emerald-200 rounded-lg px-3 text-xs font-bold"
                                                            value={newPlan.name}
                                                            onChange={e => setNewPlan({...newPlan, name: e.target.value})}
                                                        >
                                                            <option value="">Seleccionar...</option>
                                                            {medications.map(m => <option key={m.id} value={m.name}>{m.name}</option>)}
                                                        </select>
                                                    </div>
                                                    <div>
                                                        <label className="text-[9px] font-bold text-emerald-600 uppercase ml-1">Dosis / Unidad</label>
                                                        <div className="flex gap-1">
                                                            <input 
                                                                type="number" 
                                                                className="w-full h-9 bg-white border border-emerald-200 rounded-lg px-3 text-xs font-bold"
                                                                placeholder="Cant."
                                                                value={newPlan.dose}
                                                                onChange={e => setNewPlan({...newPlan, dose: e.target.value})}
                                                            />
                                                            <select 
                                                                className="w-20 h-9 bg-white border border-emerald-200 rounded-lg px-2 text-[10px] font-bold"
                                                                value={newPlan.unit}
                                                                onChange={e => setNewPlan({...newPlan, unit: e.target.value})}
                                                            >
                                                                <option value="mg">mg</option>
                                                                <option value="ml">ml</option>
                                                                <option value="comp">comp</option>
                                                            </select>
                                                        </div>
                                                    </div>
                                                    <div>
                                                        <label className="text-[9px] font-bold text-emerald-600 uppercase ml-1">Frecuencia (Cada X hs)</label>
                                                        <input 
                                                            type="number" 
                                                            className="w-full h-9 bg-white border border-emerald-200 rounded-lg px-3 text-xs font-bold"
                                                            placeholder="hs."
                                                            value={newPlan.frequency}
                                                            onChange={e => setNewPlan({...newPlan, frequency: e.target.value})}
                                                        />
                                                    </div>
                                                    <div className="col-span-2">
                                                        <label className="text-[9px] font-bold text-emerald-600 uppercase ml-1">Primera Dosis (Hora)</label>
                                                        <input 
                                                            type="time" 
                                                            className="w-full h-9 bg-white border border-emerald-200 rounded-lg px-3 text-xs font-bold"
                                                            value={newPlan.start_time}
                                                            onChange={e => setNewPlan({...newPlan, start_time: e.target.value})}
                                                        />
                                                    </div>
                                                    <div className="col-span-2">
                                                        <label className="text-[9px] font-bold text-emerald-600 uppercase ml-1">Repetir por (Días)</label>
                                                        <input 
                                                            type="number" 
                                                            className="w-full h-9 bg-white border border-emerald-200 rounded-lg px-3 text-xs font-bold"
                                                            placeholder="Dejar vacío si es indefinido"
                                                            value={newPlan.days}
                                                            onChange={e => setNewPlan({...newPlan, days: e.target.value})}
                                                        />
                                                    </div>
                                                </div>
                                                <button 
                                                    className="w-full h-10 bg-emerald-600 text-white font-bold rounded-xl text-xs hover:bg-emerald-700 transition-all shadow-md shadow-emerald-200"
                                                    disabled={!newPlan.name || !newPlan.dose || !newPlan.start_time}
                                                    onClick={async () => {
                                                        const [hrs, mins] = newPlan.start_time.split(':').map(Number);
                                                        const sd = new Date();
                                                        sd.setHours(hrs, mins, 0, 0);
                                                        if (sd < new Date()) sd.setDate(sd.getDate() + 1);

                                                        let endsAt = null;
                                                        if (newPlan.days) {
                                                            endsAt = new Date(sd);
                                                            endsAt.setDate(endsAt.getDate() + parseInt(newPlan.days));
                                                        }

                                                        const selectedMedItem = medications.find(m => m.name === newPlan.name);
                                                        const { error } = await supabase.from('hospital_medication_plans').insert({
                                                            admission_id: selectedBed.active_admission!.id,
                                                            medication_name: newPlan.name,
                                                            drug_name: selectedMedItem?.drug_name || newPlan.name,
                                                            dose: parseFloat(newPlan.dose),
                                                            unit: newPlan.unit,
                                                            frequency_hours: parseInt(newPlan.frequency),
                                                            next_dose_at: sd.toISOString(),
                                                            ends_at: endsAt ? endsAt.toISOString() : null,
                                                            created_by: user?.name
                                                        });
                                                        
                                                        if (error) alert('Error al crear plan medicación');
                                                        else {
                                                            setNewPlan({ name: '', dose: '', unit: 'mg', frequency: '8', start_time: '', days: '' });
                                                            setShowScheduleForm(false);
                                                            handleBedClick(selectedBed);
                                                        }
                                                    }}
                                                >
                                                    Programar Esquema
                                                </button>
                                            </div>
                                        )}

                                        <div className="space-y-2">
                                            {medPlans.map(plan => {
                                                const nextDose = plan.next_dose_at ? new Date(plan.next_dose_at) : null;
                                                const isOverdue = nextDose && nextDose < currentTime;
                                                
                                                return (
                                                    <div key={plan.id} className={`p-4 rounded-2xl border flex justify-between items-center group/plan transition-all ${
                                                        isOverdue ? 'bg-red-50 border-red-200' : 'bg-slate-50 border-slate-200'
                                                    }`}>
                                                        <div className="flex-1">
                                                            <div className="flex items-center gap-2">
                                                                <div className="flex flex-col">
                                                                    <p className="text-sm font-black text-slate-900 uppercase tracking-tighter">{plan.drug_name || plan.medication_name}</p>
                                                                    <p className="text-[9px] text-slate-500 font-medium lowercase italic">({plan.medication_name})</p>
                                                                </div>
                                                                <span className="text-[10px] bg-white px-2 py-0.5 rounded-full border border-slate-200 text-slate-500 font-bold">
                                                                    {plan.dose}{plan.unit} c/{plan.frequency_hours}h
                                                                </span>
                                                            </div>
                                                            <p className="text-[10px] font-bold text-slate-500 mt-1 uppercase tracking-widest flex items-center gap-1.5">
                                                                <span className={`size-1.5 rounded-full ${isOverdue ? 'bg-red-500 animate-pulse' : 'bg-emerald-500'}`}></span>
                                                                Próxima Dosis: <span className={isOverdue ? 'text-red-600 font-black' : 'text-slate-700'}>
                                                                    {nextDose ? nextDose.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false }) : '--:--'}
                                                                </span>
                                                                {isOverdue && <span className="text-[9px] text-red-400 font-black">(ATRASADA)</span>}
                                                            </p>
                                                            <p className="text-[9px] font-bold text-slate-300 uppercase tracking-widest mt-0.5">
                                                                {plan.created_by ? `Por: ${plan.created_by}` : ''} 
                                                                {plan.ends_at ? ` - Hasta: ${new Date(plan.ends_at).toLocaleDateString()} ${new Date(plan.ends_at).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false })}` : ''}
                                                            </p>
                                                        </div>
                                                        <div className="flex gap-2">
                                                            <button 
                                                                onClick={async () => {
                                                                    if (!confirm('¿Registrar suministro de esta dosis programada?')) return;
                                                                    
                                                                    // 1. Create Log
                                                                    const { error: logErr } = await supabase.from('hospital_medication_logs').insert({
                                                                        admission_id: plan.admission_id,
                                                                        plan_id: plan.id,
                                                                        medication_name: plan.medication_name,
                                                                        drug_name: plan.drug_name || plan.medication_name,
                                                                        dose: plan.dose,
                                                                        unit: plan.unit,
                                                                        administered_by: user?.name
                                                                    });

                                                                    if (logErr) return alert('Error al registrar log');

                                                                    // 2. Update Plan Next Dose
                                                                    if (plan.frequency_hours) {
                                                                        const nextAt = new Date(plan.next_dose_at || new Date());
                                                                        nextAt.setHours(nextAt.getHours() + plan.frequency_hours);
                                                                        // If still overdue (missed multiple), skip to next future slot
                                                                        while (nextAt < new Date()) {
                                                                            nextAt.setHours(nextAt.getHours() + plan.frequency_hours);
                                                                        }
                                                                        
                                                                        await supabase.from('hospital_medication_plans')
                                                                            .update({ next_dose_at: nextAt.toISOString() })
                                                                            .eq('id', plan.id);
                                                                    }

                                                                    handleBedClick(selectedBed!);
                                                                }}
                                                                className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                                                                    isOverdue 
                                                                    ? 'bg-red-600 text-white hover:bg-red-700 shadow-lg shadow-red-200' 
                                                                    : 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-md shadow-emerald-200'
                                                                }`}
                                                            >
                                                                Suministrar
                                                            </button>
                                                            {canManageMedication() && (
                                                                <div className="flex gap-1">
                                                                    <button 
                                                                        onClick={() => {
                                                                            setEditingPlan(plan);
                                                                            setEditPlanValue({
                                                                                name: plan.medication_name,
                                                                                dose: plan.dose.toString(),
                                                                                unit: plan.unit,
                                                                                frequency: plan.frequency_hours?.toString() || '8',
                                                                                next_dose_time: plan.next_dose_at ? new Date(plan.next_dose_at).toISOString().slice(11, 16) : '',
                                                                                ends_at: plan.ends_at ? new Date(plan.ends_at).toISOString().slice(0, 16) : ''
                                                                            });
                                                                        }}
                                                                        className="size-8 text-slate-300 hover:text-primary transition-colors flex items-center justify-center"
                                                                        title="Editar Esquema"
                                                                    >
                                                                        <span className="material-symbols-outlined text-sm">edit</span>
                                                                    </button>
                                                                    <button 
                                                                        onClick={async () => {
                                                                            if (confirm('¿Eliminar este esquema de medicación?')) {
                                                                                await supabase.from('hospital_medication_plans').update({ active: false }).eq('id', plan.id);
                                                                                handleBedClick(selectedBed!);
                                                                            }
                                                                        }}
                                                                        className="size-8 text-slate-300 hover:text-red-500 transition-colors flex items-center justify-center"
                                                                        title="Eliminar Esquema"
                                                                    >
                                                                        <span className="material-symbols-outlined text-sm">delete</span>
                                                                    </button>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                );
                                            })}

                                            {editingPlan && (
                                                <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-200 space-y-3 animate-in fade-in slide-in-from-top-2 duration-200">
                                                    <div className="flex justify-between items-center mb-1">
                                                        <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">Editar Esquema</p>
                                                        <button onClick={() => setEditingPlan(null)} className="text-emerald-400 hover:text-emerald-600">
                                                            <span className="material-symbols-outlined text-sm">close</span>
                                                        </button>
                                                    </div>
                                                    <div className="grid grid-cols-2 gap-3">
                                                        <div className="col-span-2">
                                                            <label className="text-[9px] font-bold text-emerald-600 uppercase ml-1">Medicamento</label>
                                                            <select 
                                                                className="w-full h-9 bg-white border border-emerald-200 rounded-lg px-3 text-xs font-bold"
                                                                value={editPlanValue.name}
                                                                onChange={e => setEditPlanValue({...editPlanValue, name: e.target.value})}
                                                            >
                                                                {medications.map(m => <option key={m.id} value={m.name}>{m.name}</option>)}
                                                            </select>
                                                        </div>
                                                        <div>
                                                            <label className="text-[9px] font-bold text-emerald-600 uppercase ml-1">Dosis / Unidad</label>
                                                            <div className="flex gap-1">
                                                                <input 
                                                                    type="number" 
                                                                    className="w-full h-9 bg-white border border-emerald-200 rounded-lg px-3 text-xs font-bold"
                                                                    value={editPlanValue.dose}
                                                                    onChange={e => setEditPlanValue({...editPlanValue, dose: e.target.value})}
                                                                />
                                                                <select 
                                                                    className="w-20 h-9 bg-white border border-emerald-200 rounded-lg px-2 text-[10px] font-bold"
                                                                    value={editPlanValue.unit}
                                                                    onChange={e => setEditPlanValue({...editPlanValue, unit: e.target.value})}
                                                                >
                                                                    <option value="mg">mg</option>
                                                                    <option value="ml">ml</option>
                                                                    <option value="comp">comp</option>
                                                                </select>
                                                            </div>
                                                        </div>
                                                        <div>
                                                            <label className="text-[9px] font-bold text-emerald-600 uppercase ml-1">Frecuencia (Horas)</label>
                                                            <input 
                                                                type="number" 
                                                                className="w-full h-9 bg-white border border-emerald-200 rounded-lg px-3 text-xs font-bold"
                                                                value={editPlanValue.frequency}
                                                                onChange={e => setEditPlanValue({...editPlanValue, frequency: e.target.value})}
                                                            />
                                                        </div>
                                                        <div className="col-span-2">
                                                            <label className="text-[9px] font-bold text-emerald-600 uppercase ml-1">Prox. Dosis (Hora)</label>
                                                            <input 
                                                                type="time" 
                                                                className="w-full h-9 bg-white border border-emerald-200 rounded-lg px-3 text-xs font-bold"
                                                                value={editPlanValue.next_dose_time}
                                                                onChange={e => setEditPlanValue({...editPlanValue, next_dose_time: e.target.value})}
                                                            />
                                                        </div>
                                                        <div className="col-span-2">
                                                            <label className="text-[9px] font-bold text-emerald-600 uppercase ml-1">Finaliza (Fecha/Hora)</label>
                                                            <input 
                                                                type="datetime-local" 
                                                                className="w-full h-9 bg-white border border-emerald-200 rounded-lg px-3 text-xs font-bold"
                                                                value={editPlanValue.ends_at}
                                                                onChange={e => setEditPlanValue({...editPlanValue, ends_at: e.target.value})}
                                                            />
                                                        </div>
                                                    </div>
                                                    <button 
                                                        className="w-full h-10 bg-emerald-600 text-white font-bold rounded-xl text-xs hover:bg-emerald-700 transition-all shadow-md shadow-emerald-200"
                                                        onClick={async () => {
                                                            let nextDateISO = null;
                                                            if (editPlanValue.next_dose_time) {
                                                                const [hrs, mins] = editPlanValue.next_dose_time.split(':').map(Number);
                                                                const nd = new Date(editingPlan.next_dose_at || new Date());
                                                                nd.setHours(hrs, mins, 0, 0);
                                                                nextDateISO = nd.toISOString();
                                                            }
                                                            
                                                            const { error } = await supabase.from('hospital_medication_plans')
                                                                .update({
                                                                    medication_name: editPlanValue.name,
                                                                    drug_name: medications.find(m => m.name === editPlanValue.name)?.drug_name || editPlanValue.name,
                                                                    dose: parseFloat(editPlanValue.dose),
                                                                    unit: editPlanValue.unit,
                                                                    frequency_hours: parseInt(editPlanValue.frequency),
                                                                    next_dose_at: nextDateISO,
                                                                    ends_at: editPlanValue.ends_at ? new Date(editPlanValue.ends_at).toISOString() : null
                                                                })
                                                                .eq('id', editingPlan.id);
                                                            
                                                            if (error) alert('Error al actualizar esquema');
                                                            else {
                                                                setEditingPlan(null);
                                                                handleBedClick(selectedBed!);
                                                            }
                                                        }}
                                                    >
                                                        Guardar Esquema
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    <div className="space-y-4 pt-4 border-t border-slate-100">
                                        <div className="flex justify-between items-center">
                                            <p className="text-[10px] font-bold text-slate-400 uppercase px-1">Programación de Alta</p>
                                            <button 
                                                onClick={() => {
                                                    setTempDischarge(selectedBed.active_admission?.est_discharge ? new Date(selectedBed.active_admission.est_discharge).toISOString().slice(0, 16) : '');
                                                    setShowDischargeDialog(!showDischargeDialog);
                                                }}
                                                className="text-[10px] font-black text-amber-600 uppercase tracking-widest"
                                            >
                                                {showDischargeDialog ? 'Cancelar' : 'Establecer'}
                                            </button>
                                        </div>
                                        
                                        {showDischargeDialog ? (
                                            <div className="p-4 bg-amber-50 border border-amber-100 rounded-xl space-y-3">
                                                <input 
                                                    type="datetime-local" 
                                                    className="w-full h-9 bg-white border border-amber-200 rounded-lg px-3 text-xs font-bold"
                                                    value={tempDischarge}
                                                    onChange={e => setTempDischarge(e.target.value)}
                                                />
                                                <button 
                                                    className="w-full h-9 bg-amber-600 text-white font-black rounded-lg text-[10px] uppercase shadow-md shadow-amber-200"
                                                    onClick={async () => {
                                                        const { error } = await supabase.from('hospital_admissions')
                                                            .update({ est_discharge: tempDischarge ? new Date(tempDischarge).toISOString() : null })
                                                            .eq('id', selectedBed.active_admission!.id);
                                                        
                                                        if (error) alert('Error al actualizar alta');
                                                        else {
                                                            setShowDischargeDialog(false);
                                                            handleBedClick(selectedBed);
                                                        }
                                                    }}
                                                >
                                                    Guardar Programación
                                                </button>
                                            </div>
                                        ) : (
                                            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl flex justify-between items-center transition-all">
                                                <div>
                                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Alta Estimada</p>
                                                    <p className="text-xs font-black text-slate-700">
                                                        {selectedBed.active_admission?.est_discharge 
                                                            ? `${new Date(selectedBed.active_admission.est_discharge).toLocaleDateString()} ${new Date(selectedBed.active_admission.est_discharge).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false })}`
                                                            : 'No establecida'}
                                                    </p>
                                                </div>
                                                <span className="material-symbols-outlined text-amber-500">event_available</span>
                                            </div>
                                        )}

                                        <p className="text-[10px] font-bold text-slate-400 uppercase px-1 pt-2">Notas de Admision</p>
                                        <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-600">
                                            {selectedBed.active_admission.observations || 'Sin observaciones.'}
                                        </div>
                                    </div>

                                    <button 
                                        className="w-full py-4 bg-amber-500 text-white font-black rounded-2xl hover:bg-amber-600 shadow-lg shadow-amber-200 transition-all flex items-center justify-center gap-2 uppercase text-xs tracking-widest"
                                        onClick={async () => {
                                            if (!confirm('¿Desea liberar esta cama y marcarla para limpieza?')) return;
                                            setLoading(true);
                                            try {
                                                const { error } = await supabase.from('hospital_beds').update({ status: 'cleaning_pending' }).eq('id', selectedBed.id);
                                                if (error) throw error;
                                                await supabase.from('hospital_admissions').update({ check_out: new Date().toISOString() }).eq('id', selectedBed.active_admission!.id);
                                                await supabase.from('hospital_bed_history').insert({ bed_id: selectedBed.id, status: 'cleaning_pending', changed_by: user?.name });
                                                setShowBedModal(false);
                                                fetchData();
                                            } catch (err) { alert('Error al liberar cama'); }
                                            finally { setLoading(false); }
                                        }}
                                    >
                                        <span className="material-symbols-outlined">cleaning_services</span>
                                        Liberar Cama para Limpieza
                                    </button>
                                </div>
                            ) : selectedBed.status === 'cleaning_pending' ? (
                                <div className="text-center py-6">
                                    <div className="size-20 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center mx-auto mb-4">
                                        <span className="material-symbols-outlined text-4xl">sanitizer</span>
                                    </div>
                                    <h3 className="text-lg font-bold text-slate-800">En espera de limpieza</h3>
                                    <p className="text-xs text-slate-500 mt-2 mb-8 px-10">La cama debe ser acondicionada antes de recibir un nuevo paciente.</p>
                                    
                                    <button 
                                        className="w-full py-4 bg-emerald-500 text-white font-black rounded-2xl hover:bg-emerald-600 shadow-lg shadow-emerald-200 transition-all flex items-center justify-center gap-2 uppercase text-xs tracking-widest"
                                        onClick={async () => {
                                            setLoading(true);
                                            try {
                                                const { error } = await supabase.from('hospital_beds').update({ status: 'available' }).eq('id', selectedBed.id);
                                                if (error) throw error;
                                                await supabase.from('hospital_bed_history').insert({ bed_id: selectedBed.id, status: 'available', changed_by: user?.name });
                                                setShowBedModal(false);
                                                fetchData();
                                            } catch (err) { alert('Error al acondicionar cama'); }
                                            finally { setLoading(false); }
                                        }}
                                    >
                                        <span className="material-symbols-outlined">check_circle</span>
                                        Cama Lista / Acondicionada
                                    </button>
                                </div>
                            ) : (
                                <div className="text-center py-4 px-6">
                                    <div className="relative w-full aspect-square max-w-[280px] mx-auto bg-slate-100 rounded-3xl border-2 border-dashed border-slate-200 overflow-hidden flex flex-col items-center justify-center mb-6">
                                        <div id="modal-qr-reader" className="w-full h-full"></div>
                                        
                                        {isScanning && (
                                            <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                                                <div className="size-48 border-2 border-primary/30 rounded-2xl relative">
                                                    <div className="absolute -top-1 -left-1 size-8 border-t-4 border-l-4 border-primary rounded-tl-lg"></div>
                                                    <div className="absolute -top-1 -right-1 size-8 border-t-4 border-r-4 border-primary rounded-tr-lg"></div>
                                                    <div className="absolute -bottom-1 -left-1 size-8 border-b-4 border-l-4 border-primary rounded-bl-lg"></div>
                                                    <div className="absolute -bottom-1 -right-1 size-8 border-b-4 border-r-4 border-primary rounded-br-lg"></div>
                                                </div>
                                            </div>
                                        )}

                                        {!isScanning && !scannerError && (
                                            <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-50/80 backdrop-blur-sm group">
                                                <button 
                                                    onClick={startScanner}
                                                    className="size-20 bg-primary text-slate-950 rounded-full flex items-center justify-center shadow-xl shadow-primary/20 group-hover:scale-110 transition-all"
                                                >
                                                    <span className="material-symbols-outlined text-4xl">photo_camera</span>
                                                </button>
                                                <p className="mt-4 text-xs font-black text-slate-600 uppercase tracking-widest">Activar Cámara</p>
                                            </div>
                                        )}

                                        {scannerError && (
                                            <div className="absolute inset-0 flex flex-col items-center justify-center bg-red-50 p-6 text-center">
                                                <span className="material-symbols-outlined text-red-500 text-4xl mb-3">videocam_off</span>
                                                <p className="text-xs font-bold text-red-600 leading-tight mb-4">{scannerError}</p>
                                                <button 
                                                    onClick={startScanner}
                                                    className="px-4 py-2 bg-red-500 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-red-600 transition-all"
                                                >
                                                    Reintentar
                                                </button>
                                            </div>
                                        )}

                                        {isScanning && !scannerError && (
                                            <div className="absolute top-4 right-4 z-10">
                                                <button 
                                                    onClick={stopScanner}
                                                    className="size-8 bg-white/20 backdrop-blur-md text-white rounded-full flex items-center justify-center hover:bg-white/40 transition-all"
                                                >
                                                    <span className="material-symbols-outlined text-sm">close</span>
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                    
                                    <p className="text-[10px] text-slate-400 leading-relaxed mb-6 font-bold uppercase tracking-widest">Escanear pulsera del paciente</p>
                                    
                                    <div className="h-px bg-slate-100 w-full mb-6 flex items-center justify-center">
                                        <span className="bg-white px-3 text-[9px] font-black text-slate-300 uppercase tracking-[0.2em]">O Ingreso Manual</span>
                                    </div>

                                    <div className="flex flex-col gap-2 w-full">
                                        <div className="flex gap-2">
                                            <input 
                                                type="text"
                                                placeholder="Código de pulsera..."
                                                className="flex-1 h-12 bg-slate-50 border border-slate-200 rounded-2xl px-4 text-sm font-bold text-slate-800 uppercase outline-none focus:border-primary transition-all shadow-inner"
                                                value={patientManualCode}
                                                onChange={e => setPatientManualCode(e.target.value)}
                                                onKeyDown={e => e.key === 'Enter' && handleManualAdmission()}
                                            />
                                            <button 
                                                onClick={() => handleManualAdmission()}
                                                disabled={patientManualCode.length < 4}
                                                className="h-12 px-6 bg-slate-900 text-white font-black rounded-2xl text-xs uppercase disabled:opacity-30 transition-all shadow-lg"
                                            >
                                                INGRESAR
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Config Modal */}
            {showConfigModal && (
                <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/60 backdrop-blur-md p-4 text-left">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-4xl max-h-[85vh] overflow-hidden border border-slate-200 flex flex-col animate-in fade-in zoom-in duration-300">
                        {/* Header */}
                        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                            <div className="flex items-center gap-3">
                                <div className="size-10 bg-slate-900 text-white rounded-xl flex items-center justify-center shadow-lg">
                                    <span className="material-symbols-outlined">settings</span>
                                </div>
                                <div>
                                    <h2 className="text-xl font-black text-slate-900">Configuración de Planta</h2>
                                    <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Gestión de Habitaciones y Camas</p>
                                </div>
                            </div>
                            <button 
                                onClick={() => {
                                    setShowConfigModal(false);
                                    fetchData(); // Refresh main map on close
                                }} 
                                className="size-10 flex items-center justify-center rounded-full hover:bg-slate-200 text-slate-400 transition-colors"
                            >
                                <span className="material-symbols-outlined">close</span>
                            </button>
                        </div>

                        {/* Content */}
                        <div className="flex-1 overflow-y-auto p-8 bg-white grid grid-cols-1 md:grid-cols-2 gap-8">
                            {/* Rooms Column */}
                            <div className="flex flex-col gap-4">
                                <div className="flex justify-between items-center mb-2">
                                    <h3 className="font-black text-slate-900 uppercase text-xs tracking-tighter">Habitaciones</h3>
                                    <button 
                                        className="h-8 px-3 bg-slate-900 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 hover:bg-slate-800 transition-all"
                                        onClick={async () => {
                                            const name = prompt('Nombre de la habitación (ej: 101):');
                                            const floor = prompt('Piso (ej: 1er Piso):');
                                            if (name && floor) {
                                                const { error } = await supabase.from('hospital_rooms').insert({ name, floor });
                                                if (error) alert('Error al crear habitación: ' + error.message);
                                                fetchData();
                                            }
                                        }}
                                    >
                                        <span className="material-symbols-outlined text-sm">add</span>
                                        Nueva Habitación
                                    </button>
                                </div>

                                <div className="space-y-2">
                                    {rooms.map(room => (
                                        <div 
                                            key={room.id}
                                            className="group p-4 bg-slate-50 rounded-2xl border border-slate-200 flex justify-between items-center hover:bg-white hover:shadow-md transition-all"
                                        >
                                            <div className="flex items-center gap-3">
                                                <div className="size-8 bg-white border border-slate-200 rounded-lg flex items-center justify-center text-slate-400">
                                                    <span className="material-symbols-outlined text-sm">meeting_room</span>
                                                </div>
                                                <div>
                                                    <p className="text-sm font-black text-slate-900">{room.name}</p>
                                                    <p className="text-[10px] text-slate-400 font-bold uppercase">{room.floor}</p>
                                                </div>
                                            </div>
                                            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <button 
                                                    onClick={async () => {
                                                        const newName = prompt('Editar nombre de habitacion:', room.name);
                                                        const newFloor = prompt('Editar piso:', room.floor);
                                                        if (newName && newFloor) {
                                                            const { error } = await supabase.from('hospital_rooms').update({ name: newName, floor: newFloor }).eq('id', room.id);
                                                            if (error) alert('Error al actualizar habitación');
                                                            fetchData();
                                                        }
                                                    }}
                                                    className="size-8 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center hover:bg-slate-200"
                                                    title="Editar Habitación"
                                                >
                                                    <span className="material-symbols-outlined text-sm">edit</span>
                                                </button>
                                                <button 
                                                    onClick={() => {
                                                        const roomBeds = beds.filter(b => b.room_id === room.id);
                                                        const bedCode = prompt(`Nueva cama para Hab ${room.name} (ej: ${room.name}-A):`, `${room.name}-`);
                                                        if (bedCode) {
                                                            supabase.from('hospital_beds').insert({ room_id: room.id, bed_code: bedCode }).then(({ error }) => {
                                                                if (error) alert('Error al crear cama: ' + error.message);
                                                                fetchData();
                                                            });
                                                        }
                                                    }}
                                                    className="size-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center hover:bg-emerald-100"
                                                    title="Agregar Cama"
                                                >
                                                    <span className="material-symbols-outlined text-sm">add_circle</span>
                                                </button>
                                                <button 
                                                    onClick={async () => {
                                                        if (confirm('¿Eliminar habitación y todas sus camas?')) {
                                                            const { error } = await supabase.from('hospital_rooms').delete().eq('id', room.id);
                                                            if (error) alert('Error al eliminar habitación: ' + error.message);
                                                            fetchData();
                                                        }
                                                    }}
                                                    className="size-8 rounded-lg bg-red-50 text-red-600 flex items-center justify-center hover:bg-red-100"
                                                    title="Eliminar"
                                                >
                                                    <span className="material-symbols-outlined text-sm">delete</span>
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Beds Column */}
                            <div className="flex flex-col gap-4">
                                <h3 className="font-black text-slate-900 uppercase text-xs tracking-tighter mb-2">Detalle de Camas</h3>
                                <div className="space-y-6 overflow-y-auto max-h-[500px] pr-2 custom-scrollbar">
                                    {rooms.map(room => {
                                        const roomBeds = beds.filter(b => b.room_id === room.id);
                                        return (
                                            <div key={room.id} className="space-y-3">
                                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 pb-1">Hab {room.name}</p>
                                                {roomBeds.length === 0 ? (
                                                    <p className="text-[10px] text-slate-300 italic py-2 pl-4">No hay camas asignadas</p>
                                                ) : (
                                                    <div className="grid grid-cols-2 gap-2">
                                                        {roomBeds.map(bed => (
                                                            <div key={bed.id} className="p-3 bg-white border border-slate-200 rounded-xl flex justify-between items-center group/bed hover:border-slate-300 shadow-sm transition-all">
                                                                <span className="text-xs font-bold text-slate-700">{bed.bed_code}</span>
                                                                <div className="flex items-center gap-1.5 opacity-0 group-hover/bed:opacity-100 transition-opacity">
                                                                    <button 
                                                                        onClick={async () => {
                                                                            const newCode = prompt('Editar código de cama:', bed.bed_code);
                                                                            if (newCode) {
                                                                                const { error } = await supabase.from('hospital_beds').update({ bed_code: newCode }).eq('id', bed.id);
                                                                                if (error) alert('Error al actualizar cama');
                                                                                fetchData();
                                                                            }
                                                                        }}
                                                                        className="size-6 text-slate-400 hover:text-slate-600 transition-colors"
                                                                        title="Editar Cama"
                                                                    >
                                                                        <span className="material-symbols-outlined text-base">edit</span>
                                                                    </button>
                                                                    <button 
                                                                        onClick={async () => {
                                                                            if (confirm(`¿Eliminar cama ${bed.bed_code}?`)) {
                                                                                await supabase.from('hospital_beds').delete().eq('id', bed.id);
                                                                                fetchData();
                                                                            }
                                                                        }}
                                                                        className="size-6 text-red-300 hover:text-red-500 transition-colors"
                                                                        title="Eliminar Cama"
                                                                    >
                                                                        <span className="material-symbols-outlined text-base">delete</span>
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>

                        {/* Footer */}
                        <div className="p-6 bg-slate-50 border-t border-slate-100 flex justify-end">
                            <button 
                                onClick={() => {
                                    setShowConfigModal(false);
                                    fetchData();
                                }}
                                className="px-6 py-2 bg-slate-900 text-white rounded-xl font-black text-xs uppercase tracking-widest hover:bg-slate-800 shadow-lg shadow-slate-200 transition-all"
                            >
                                Finalizar Edición
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {/* Floor Medication Summary Panel */}
            <div className="fixed bottom-4 md:bottom-6 left-4 md:left-1/2 md:-translate-x-1/2 z-40 bg-white/95 backdrop-blur-md rounded-2xl md:rounded-3xl border border-slate-200 shadow-2xl p-1.5 md:p-2 w-[calc(100%-32px)] md:w-fit max-w-[90vw] animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="flex items-center gap-2 md:gap-3 px-2 md:px-4 py-1.5 md:py-2">
                    <div className="flex items-center gap-1.5 md:gap-2 shrink-0">
                        <span className="material-symbols-outlined text-emerald-600 text-sm md:text-base">notifications_active</span>
                        <span className="text-[9px] md:text-[10px] font-black text-slate-400 uppercase tracking-widest hidden xs:inline">Dosis del Piso</span>
                    </div>
                    <div className="h-4 w-px bg-slate-200 shrink-0 hidden xs:block"></div>
                     <div className="flex gap-2 max-w-[60vw] overflow-x-auto no-scrollbar py-1">
                        {beds
                            .filter(b => b.status === 'occupied' && b.active_admission)
                            .map(b => {
                                 const alert = getMedicationAlert(b.active_admission!.id);
                                 if (alert) {
                                     return (
                                         <button 
                                             key={b.id}
                                             onClick={() => handleBedClick(b)}
                                             className={`flex items-center gap-2 px-3 py-1.5 rounded-2xl border transition-all whitespace-nowrap shadow-sm group ${
                                                 alert.type === 'overdue' 
                                                 ? 'bg-red-600 border-red-500 text-white animate-pulse' 
                                                 : 'bg-amber-50 border-amber-200 text-amber-800'
                                             }`}
                                         >
                                             <span className="text-[10px] font-black uppercase tracking-tighter">{b.bed_code}</span>
                                             <div className="h-3 w-px bg-current opacity-20"></div>
                                             <span className="text-[11px] font-black tracking-tight">{alert.name}</span>
                                             <span className="text-[10px] font-bold opacity-80">
                                                 {alert.time.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false })}
                                             </span>
                                         </button>
                                     );
                                 }

                                 if (b.active_admission?.ready_at) {
                                     return (
                                         <button 
                                             key={b.id}
                                             onClick={() => handleBedClick(b)}
                                             className="flex items-center gap-2 px-3 py-1.5 rounded-2xl border border-emerald-200 bg-emerald-600 text-white transition-all whitespace-nowrap shadow-sm group animate-pulse"
                                         >
                                             <span className="text-[10px] font-black uppercase tracking-tighter">{b.bed_code}</span>
                                             <div className="h-3 w-px bg-white/20"></div>
                                             <span className="text-[11px] font-black tracking-tight uppercase">ALTA OTORGADA</span>
                                             <span className="material-symbols-outlined text-sm">verified</span>
                                         </button>
                                     );
                                 }

                                 return null;
                             })
                            .filter(Boolean).length === 0 && (
                                <span className="text-[10px] font-bold text-slate-400 italic px-4 py-1">Sin alertas de medicación activas</span>
                            )}
                    </div>
                </div>
            </div>
            <SurgicalCoordinationAlerts />
            <div className="h-24 md:hidden"></div> {/* Padding for mobile bottom bar */}
        </div>
    );
};

export default HospitalizationMap;
