import React, { useState, useEffect, useRef } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../src/lib/supabase';
import { useAuth } from '../src/lib/AuthContext';
import { captureError } from '../src/lib/errorLogger';
import { createOrUpdateDoctorAlert } from '../src/lib/alertService';
import { UserRole } from '../types';
import ProgressBar from '../components/ProgressBar';

interface SurgeryMaterial {
    id: string;
    name: string;
    quantity: number;
    requestedQuantity: number;
    category: string;
    isCovered?: boolean;
    observation?: string;
    isConfirmed?: boolean;
    procedureName?: string;
}

interface SurgeryDocument {
    id: string;
    name: string;
    type: string;
    category?: string;
    file_path: string;
    created_at: string;
    uploaded_by?: string;
}

const SUSPENSION_REASONS = [
    'Falta de Material',
    'Ausencia de Cirujano',
    'Falta de Cama',
    'Problema Administrativo',
    'Condición del Paciente',
    'Falta de Tiempo en Quirófano',
    'Falla Técnica de Equipamiento',
    'Otro'
];

const AVAILABLE_MATERIALS = [
    { name: 'Hoja Shaver 4.5mm', category: 'Herramienta' },
    { name: 'Bomba Irrigación', category: 'Herramienta' },
    { name: 'Set de Cánulas', category: 'Instrumental' },
    { name: 'Sutura FiberWire', category: 'Farmacia' },
    { name: 'Anclaje 3.5mm', category: 'Osteosíntesis' },
    { name: 'Torre Laparoscopia', category: 'Herramienta' },
    { name: 'Kit Trocares', category: 'Farmacia' },
    { name: 'Prótesis Cadera', category: 'Prótesis' },
    { name: 'Cemento Óseo', category: 'Farmacia' },
];

const FALLBACK_DOCTORS = [
    { id: 'd1', full_name: 'DR OBAID LUIS MARCELO', license_number: '4216' },
    { id: 'd2', full_name: 'DR BARBERO CARLOS JULIAN', license_number: '8689' },
    { id: 'd3', full_name: 'DR LOPEZ DARIO ALBERTO', license_number: '6925' },
    { id: 'd4', full_name: 'DR GOLPE LUCIO MARTIN', license_number: '7267' },
    { id: 'd5', full_name: 'DR CRESPO FERNANDO ADRIAN', license_number: '7504' },
    { id: 'd6', full_name: 'DR RIAL PEDRO JAVIER', license_number: '9203' },
    { id: 'd7', full_name: 'DR CASTILLO MARTIN', license_number: '12359' },
    { id: 'd8', full_name: 'DR PEREZLINDO LUCAS', license_number: '11261' }
];

const FALLBACK_VENDORS = [
    { id: 'v1', name: 'Ortopedia Alemana S.A.' },
    { id: 'v2', name: 'Implantes del Sur' },
    { id: 'v3', name: 'BioSystems Medical' },
];

const DOCUMENT_CATEGORIES = [
    { id: 'order', name: 'Pedido Médico', icon: 'description' },
    { id: 'auth', name: 'Autorización', icon: 'verified_user' },
    { id: 'dni', name: 'DNI / Credencial', icon: 'badge' },
    { id: 'studies', name: 'Estudios / Lab', icon: 'biotech' },
    { id: 'consent', name: 'Consentimiento', icon: 'history_edu' },
    { id: 'other', name: 'Otros', icon: 'attachment' }
];

export const SurgeryDetail: React.FC = () => {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const patientInputRef = useRef<HTMLInputElement>(null);
    const { user } = useAuth();
    const isNew = !id || id === 'new';

    // --- UI State ---
    const [loading, setLoading] = useState(!isNew);
    const [saving, setSaving] = useState(false);

    // --- Clinical Data State ---
    const [procedureInput, setProcedureInput] = useState('');
    const [selectedProcedures, setSelectedProcedures] = useState<string[]>([]);
    const [patientName, setPatientName] = useState('');
    const [documentNumber, setDocumentNumber] = useState('');
    const [nuc, setNuc] = useState('');
    const [medicalRecordNumber, setMedicalRecordNumber] = useState('');
    const [birthDate, setBirthDate] = useState('');
    const [phone, setPhone] = useState('');
    const [address, setAddress] = useState('');
    const [province, setProvince] = useState('');
    const [locality, setLocality] = useState('');
    const [surgerySide, setSurgerySide] = useState<'left' | 'right' | 'bilateral' | ''>('');
    const [preOpNotes, setPreOpNotes] = useState('');
    const [surgeryDate, setSurgeryDate] = useState('');
    const [startTime, setStartTime] = useState('');
    const [estimatedDuration, setEstimatedDuration] = useState<number | ''>('');
    const [status, setStatus] = useState(isNew ? 'pending_validation' : 'scheduled');
    const [priority, setPriority] = useState<'elective' | 'urgent' | 'emergency'>('elective');

    // --- Modals ---
    const [suspensionModal, setSuspensionModal] = useState({ isOpen: false, reason: '', observations: '' });
    const [rescheduleModal, setRescheduleModal] = useState({ isOpen: false, newDate: '', newTime: '' });
    const [requestRescheduleModal, setRequestRescheduleModal] = useState({ isOpen: false, reason: '', suggestedDate: '' });

    // --- Validations ---
    const [preOpExams, setPreOpExams] = useState(false);
    const [preOpDate, setPreOpDate] = useState('');
    const [consentSigned, setConsentSigned] = useState(false);
    const [authDate, setAuthDate] = useState('');
    const [medicalCoverage, setMedicalCoverage] = useState('');
    const [doctorPriorityValidated, setDoctorPriorityValidated] = useState(false);
    const [createdAt, setCreatedAt] = useState<string | null>(null);

    // --- Assignment ---
    const [doctors, setDoctors] = useState<any[]>(FALLBACK_DOCTORS);
    const [selectedDoctorId, setSelectedDoctorId] = useState('');
    const [anesthesiologistId, setAnesthesiologistId] = useState('');
    const [anesthesiaType, setAnesthesiaType] = useState('');
    const [availableORs, setAvailableORs] = useState<any[]>([]);
    const [selectedOrId, setSelectedOrId] = useState(isNew ? '301' : '');

    // --- Ortopedia & Materials ---
    const [materials, setMaterials] = useState<SurgeryMaterial[]>([]);
    const [requiresProsthesis, setRequiresProsthesis] = useState(false);
    const [selectedVendor, setSelectedVendor] = useState('');
    const [availableVendors, setAvailableVendors] = useState<any[]>(FALLBACK_VENDORS);
    const [availableCoverages, setAvailableCoverages] = useState<any[]>([]);
    const [selectedMaterialName, setSelectedMaterialName] = useState('');
    const [quantity, setQuantity] = useState(1);

    // --- Documents ---
    const [documents, setDocuments] = useState<SurgeryDocument[]>([]);
    const [uploading, setUploading] = useState(false);
    const [uploadCategory, setUploadCategory] = useState('other');
    const [stagedDocuments, setStagedDocuments] = useState<any[]>([]);

    // --- Approvals ---
    const [approvals, setApprovals] = useState({ ortho: false, admission: false, or: false });

    // --- Access Control ---
    const currentUserRole = user?.role || 'Invitado';
    const canEditList = currentUserRole === 'SuperAdmin' || currentUserRole === 'Ortopedia' || currentUserRole === 'Internacion' || currentUserRole === 'Medico';

    // --- Patient Search ---
    const [patientSearchTerm, setPatientSearchTerm] = useState('');
    const [patientSearchResults, setPatientSearchResults] = useState<any[]>([]);
    const searchTimeoutRef = useRef<any>(null);

    // --- Audit Snapshot ---
    const [originalData, setOriginalData] = useState<any>(null);

    // --- Effects ---
    useEffect(() => {
        if (isNew && user?.role === 'Ortopedia') {
            alert('No tiene permiso para crear cirugías.');
            navigate('/surgeries');
            return;
        }
        if (!isNew && id) {
            fetchSurgeryDetails(id);
            fetchDocuments(id);
        }
        fetchDoctors();
        fetchVendors();
        fetchCoverages();
        fetchORs();
    }, [id, isNew, user]);

    // --- Derived Logic ---
    const calculateAge = (dateStr: string): number | null => {
        if (!dateStr) return null;
        const today = new Date();
        const birth = new Date(dateStr);
        let age = today.getFullYear() - birth.getFullYear();
        const m = today.getMonth() - birth.getMonth();
        if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
        return age >= 0 ? age : null;
    };
    const patientAge = calculateAge(birthDate);

    // --- Fetchers (Keep logic same as before, simplified structure for brevity) ---
    const fetchDoctors = async () => {
        const { data } = await supabase.from('doctors').select('*').eq('active', true);
        if (data && data.length) setDoctors(data);
    };
    const fetchVendors = async () => {
        const { data } = await supabase.from('vendors').select('*').order('name');
        if (data && data.length) setAvailableVendors(data);
    };
    const fetchCoverages = async () => {
        let query = supabase.from('coverages').select('*').order('name');
        if (user?.role === 'Oficina ART') query = query.eq('type', 'ART');
        const { data } = await query;
        if (data && data.length) setAvailableCoverages(data);
    };
    const fetchORs = async () => {
        const { data } = await supabase.from('operating_rooms').select('*').eq('active', true).order('name');
        if (data && data.length) setAvailableORs(data);
    };
    const fetchDocuments = async (surgeryId: string) => {
        const { data } = await supabase.from('surgery_documents').select('*').eq('surgery_id', surgeryId).order('created_at', { ascending: false });
        if (data) setDocuments(data);
    };

    const fetchSurgeryDetails = async (surgeryId: string) => {
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('surgeries')
                .select(`*, patients (*), surgery_materials (*), vendor_id`)
                .eq('id', surgeryId)
                .single();

            if (error) throw error;
            if (data) {
                // ... (Keep existing role permission checks)
                if (user?.role === 'Medico' && user.doctorId && data.doctor_id !== user.doctorId) {
                    alert('No tiene permiso para ver esta cirugía.'); navigate('/surgeries'); return;
                }
                if (user?.role === 'Oficina ART') {
                    const { data: artCoverages } = await supabase.from('coverages').select('name').eq('type', 'ART');
                    const artNames = artCoverages?.map(c => c.name) || [];
                    if (!artNames.includes(data.medical_coverage)) {
                        alert('Restringido a ART.'); navigate('/surgeries'); return;
                    }
                }

                // Populate State
                setPatientName(data.patients.full_name);
                setDocumentNumber(data.patients.document_number);
                setNuc(data.patients.nuc || '');
                setMedicalRecordNumber(data.patients.medical_record_number || '');
                setBirthDate(data.patients.birth_date || '');
                setPhone(data.patients.phone || '');
                setAddress(data.patients.address || '');
                setProvince(data.patients.province || '');
                setLocality(data.patients.locality || '');

                if (data.procedure_name) setSelectedProcedures(data.procedure_name.split(' + '));
                setSurgeryDate(data.surgery_date || '');
                setStartTime(data.start_time || '');
                setEstimatedDuration(data.estimated_duration || 60);
                setStatus(data.status || 'scheduled');
                setPriority(data.priority || 'elective');
                setSurgerySide(data.surgery_side || '');
                setSelectedDoctorId(data.doctor_id || '');
                setPreOpNotes(data.pre_op_notes || '');

                setSelectedOrId(data.operating_room_id || '');
                setAnesthesiaType(data.anesthesia_type || '');
                setAnesthesiologistId(data.anesthesiologist_id || '');

                setAuthDate(data.authorization_date || '');
                setMedicalCoverage(data.medical_coverage || '');
                setPreOpExams(data.pre_op_exams || false);
                setPreOpDate(data.pre_op_date || '');
                setConsentSigned(data.consent_signed || false);

                setSelectedVendor(data.vendor_id || '');
                setRequiresProsthesis(data.requires_prosthesis || false);
                setCreatedAt(data.created_at);
                setDoctorPriorityValidated(data.doctor_priority_validated || false);

                setApprovals({
                    ortho: data.ortho_validated || false,
                    admission: data.admission_validated || false,
                    or: data.or_validated || false
                });

                setMaterials(data.surgery_materials.map((m: any) => ({
                    id: m.id, name: m.name, quantity: m.provided_quantity, requestedQuantity: m.requested_quantity,
                    category: m.category, isCovered: m.is_covered, isConfirmed: m.is_confirmed, observation: m.observation, procedureName: m.procedure_name
                })));

                setOriginalData(data); // Simpler snapshot
            }
        } catch (err) {
            console.error('Error fetching details:', err);
        } finally {
            setLoading(false);
        }
    };

    // --- Search Patient ---
    const handlePatientSearch = async (term: string) => {
        setPatientSearchTerm(term);
        if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
        if (!term || term.length < 3) { setPatientSearchResults([]); return; }

        searchTimeoutRef.current = setTimeout(async () => {
            const { data } = await supabase.from('patients')
                .select('*')
                .or(`full_name.ilike.%${term}%,document_number.ilike.%${term}%`)
                .limit(5);
            setPatientSearchResults(data || []);
        }, 300);
    };

    const handleSelectPatient = (p: any) => {
        setPatientName(p.full_name);
        setDocumentNumber(p.document_number);
        setNuc(p.nuc || '');
        setMedicalRecordNumber(p.medical_record_number || '');
        setBirthDate(p.birth_date || '');
        setPhone(p.phone || '');
        setAddress(p.address || '');
        setPatientSearchResults([]);
        setPatientSearchTerm('');
    };

    // --- Save Logic ---
    const handleSurgerySave = async () => {
        if (!patientName || selectedProcedures.length === 0) {
            alert('Complete nombre y procedimiento.');
            return;
        }

        setSaving(true);
        try {
            // 1. Upsert Patient
            let patientId;
            const cleanDni = documentNumber?.trim();
            if (!cleanDni) throw new Error("DNI requerido");

            const { data: existingP } = await supabase.from('patients').select('id').eq('document_number', cleanDni).maybeSingle();

            if (existingP) {
                patientId = existingP.id;
                await supabase.from('patients').update({
                    full_name: patientName, nuc, medical_record_number: medicalRecordNumber, birth_date: birthDate || null, phone, address, province, locality
                }).eq('id', patientId);
            } else {
                const { data: newP, error: pErr } = await supabase.from('patients').insert({
                    full_name: patientName, document_number: cleanDni, nuc, medical_record_number: medicalRecordNumber, birth_date: birthDate || null, phone, address, province, locality
                }).select('id').single();
                if (pErr) throw pErr;
                patientId = newP.id;
            }

            // 2. Logic for Status
            let finalStatus = status;
            const isScheduledLogic = approvals.ortho && approvals.admission && (approvals.or || (surgeryDate && currentUserRole === 'Tecnico')); // Auto-validate logic for Tecnico

            if (isScheduledLogic) {
                if (surgeryDate && approvals.or) finalStatus = 'scheduled';
                else finalStatus = 'waiting_date';
            } else {
                // Keep existing logic unless new validation changes it
                if (status !== 'suspended' && status !== 'completed' && status !== 'cancelled') {
                    finalStatus = 'pending_validation';
                }
            }

            // 3. Upsert Surgery
            const payload = {
                patient_id: patientId,
                doctor_id: isNew && user?.role === 'Medico' ? user.doctorId : (selectedDoctorId || null),
                procedure_name: selectedProcedures.join(' + '),
                surgery_date: surgeryDate || null,
                start_time: startTime || null,
                estimated_duration: estimatedDuration || 60,
                status: finalStatus,
                priority,
                surgery_side: surgerySide || null,
                operating_room_id: selectedOrId || null,
                anesthesia_type: anesthesiaType || null,
                anesthesiologist_id: anesthesiologistId || null,
                ortho_validated: approvals.ortho,
                admission_validated: approvals.admission,
                or_validated: approvals.or,
                pre_op_exams: preOpExams,
                pre_op_date: preOpDate || null,
                pre_op_notes: preOpNotes || null,
                consent_signed: consentSigned,
                authorization_date: authDate || null,
                medical_coverage: medicalCoverage || null,
                requires_prosthesis: requiresProsthesis,
                vendor_id: selectedVendor || null,
                doctor_priority_validated: doctorPriorityValidated
            };

            let currentSurgeryId = id;
            if (isNew) {
                const { data: newS, error: sErr } = await supabase.from('surgeries').insert(payload).select('id').single();
                if (sErr) throw sErr;
                currentSurgeryId = newS.id;
            } else {
                const { error: sErr } = await supabase.from('surgeries').update(payload).eq('id', id);
                if (sErr) throw sErr;
            }

            // 4. Sync Materials
            if (!isNew && id) await supabase.from('surgery_materials').delete().eq('surgery_id', id);
            if (materials.length > 0) {
                await supabase.from('surgery_materials').insert(materials.map(m => ({
                    surgery_id: currentSurgeryId, name: m.name, requested_quantity: m.requestedQuantity, provided_quantity: m.quantity, category: m.category, is_covered: m.isCovered, is_confirmed: m.isConfirmed, observation: m.observation, procedure_name: m.procedureName
                })));
            }

            // 5. Sync Documents (Staged)
            if (stagedDocuments.length > 0) {
                await supabase.from('surgery_documents').insert(stagedDocuments.map(d => ({ ...d, surgery_id: currentSurgeryId })));
            }

            navigate('/surgeries');
        } catch (err: any) {
            console.error(err);
            alert('Error al guardar: ' + err.message);
        } finally {
            setSaving(false);
        }
    };

    const handleSuspend = async () => {
        if (!suspensionModal.reason) { alert('Motivo requerido'); return; }
        if (!confirm('Confirmar suspensión?')) return;

        try {
            const { error } = await supabase.from('surgeries')
                .update({ status: 'suspended', suspension_reason: suspensionModal.reason })
                .eq('id', id);
            if (error) throw error;
            setSuspensionModal({ ...suspensionModal, isOpen: false });
            fetchSurgeryDetails(id!);
        } catch (err: any) { alert('Error: ' + err.message); }
    };

    const handleReschedule = async () => {
        if (!rescheduleModal.newDate || !rescheduleModal.newTime) { alert('Fecha y hora requeridas'); return; }
        if (!confirm('Confirmar reprogramación?')) return;

        try {
            const { error } = await supabase.from('surgeries')
                .update({
                    surgery_date: rescheduleModal.newDate,
                    start_time: rescheduleModal.newTime,
                    status: 'scheduled'
                })
                .eq('id', id);
            if (error) throw error;
            setRescheduleModal({ ...rescheduleModal, isOpen: false });
            fetchSurgeryDetails(id!);
        } catch (err: any) { alert('Error: ' + err.message); }
    };

    // --- File Upload ---
    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files?.length) return;
        setUploading(true);
        const file = e.target.files[0];
        const filePath = `${isNew ? 'temp' : id}/${Date.now()}.${file.name.split('.').pop()}`;

        try {
            const { error: upErr } = await supabase.storage.from('documents').upload(filePath, file);
            if (upErr) throw upErr;

            const docData = {
                name: file.name, type: DOCUMENT_CATEGORIES.find(c => c.id === uploadCategory)?.name || 'Otro',
                category: uploadCategory, file_path: filePath, uploaded_by: user?.id
            };

            if (isNew) {
                setStagedDocuments(prev => [...prev, docData]);
                setDocuments(prev => [{ id: crypto.randomUUID(), ...docData, created_at: new Date().toISOString() }, ...prev]);
            } else {
                await supabase.from('surgery_documents').insert({ ...docData, surgery_id: id });
                fetchDocuments(id!);
            }
        } catch (err) { console.error(err); alert('Error subiendo archivo'); }
        finally { setUploading(false); }
    };

    const handleDeleteDocument = async (docId: string, path: string) => {
        if (!confirm('Eliminar documento?')) return;
        await supabase.storage.from('documents').remove([path]);
        if (isNew) {
            setStagedDocuments(prev => prev.filter(d => d.file_path !== path));
            setDocuments(prev => prev.filter(d => d.id !== docId));
        } else {
            await supabase.from('surgery_documents').delete().eq('id', docId);
            fetchDocuments(id!);
        }
    };

    // --- Action Handlers ---
    const handleAddMaterial = () => {
        if (!selectedMaterialName) return;
        setMaterials([...materials, {
            id: Date.now().toString(), name: selectedMaterialName, quantity: quantity, requestedQuantity: quantity,
            category: 'General', isConfirmed: false, isCovered: false
        }]);
        setSelectedMaterialName(''); setQuantity(1);
    };

    const handleUpdateQuantity = (mId: string, qty: number) => {
        setMaterials(materials.map(m => m.id === mId ? { ...m, quantity: qty } : m));
    };

    // --- Render ---
    return (
        <div className="flex-1 overflow-y-auto bg-slate-50 relative pb-12">
            <ProgressBar isLoading={loading || saving} />
            <div className="absolute top-0 left-0 w-full h-80 bg-gradient-to-b from-blue-50/80 to-transparent pointer-events-none z-0" />

            <div className="relative z-10 max-w-[1600px] mx-auto p-4 md:p-8 flex flex-col gap-6">

                {/* Header */}
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2 text-slate-500 text-sm font-medium">
                            <Link to="/surgeries" className="hover:text-blue-600 transition-colors">Cirugías</Link>
                            <span className="material-symbols-outlined text-xs">chevron_right</span>
                            <span>{isNew ? 'Nueva' : 'Detalle'}</span>
                        </div>
                        <h1 className="text-3xl font-black text-slate-900 tracking-tight flex items-center gap-3">
                            {patientName || 'Nueva Cirugía'}
                            {!isNew && <span className="px-3 py-1 rounded-full bg-slate-200 text-slate-700 text-sm font-bold tracking-wide uppercase">{status}</span>}
                        </h1>
                    </div>
                    <div className="flex gap-3">
                        {!isNew && (
                            <>
                                <button onClick={() => setSuspensionModal({ ...suspensionModal, isOpen: true })} className="px-4 py-2 bg-white/50 border border-slate-200 text-amber-600 font-bold rounded-xl hover:bg-amber-50 transition-colors">Suspender</button>
                                <button onClick={() => setRescheduleModal({ ...rescheduleModal, isOpen: true })} className="px-4 py-2 bg-white/50 border border-slate-200 text-blue-600 font-bold rounded-xl hover:bg-blue-50 transition-colors">Reprogramar</button>
                            </>
                        )}
                        <button onClick={handleSurgerySave} disabled={saving} className="px-6 py-2 bg-slate-900 text-white font-bold rounded-xl hover:bg-slate-800 transition-all shadow-lg shadow-slate-900/20 flex items-center gap-2">
                            {saving ? 'Guardando...' : 'Guardar Cambios'}
                        </button>
                    </div>
                </div>

                {/* Bento Grid Layout */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

                    {/* Col 1: Patient & Clinical */}
                    <div className="flex flex-col gap-6 space-y-6">
                        {/* Patient Card */}
                        <div className="glass-panel p-6 flex flex-col gap-4">
                            <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                                <span className="material-symbols-outlined text-blue-500">person</span>
                                Datos del Paciente
                            </h2>

                            <div className="relative">
                                <span className="absolute right-3 top-3 text-slate-400 material-symbols-outlined">search</span>
                                <input
                                    type="text"
                                    className="w-full bg-slate-50/50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-medium outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                                    placeholder="Buscar paciente por nombre o DNI..."
                                    value={patientSearchTerm}
                                    onChange={(e) => handlePatientSearch(e.target.value)}
                                />
                                {patientSearchResults.length > 0 && (
                                    <div className="absolute top-full left-0 w-full bg-white shadow-xl rounded-xl mt-2 p-2 z-50 border border-slate-100">
                                        {patientSearchResults.map(p => (
                                            <div key={p.id} onClick={() => handleSelectPatient(p)} className="p-3 hover:bg-slate-50 rounded-lg cursor-pointer flex flex-col">
                                                <span className="font-bold text-slate-700">{p.full_name}</span>
                                                <span className="text-xs text-slate-400">DNI: {p.document_number}</span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="flex flex-col gap-1">
                                    <label className="text-xs font-bold text-slate-400 uppercase">Nombre Completo</label>
                                    <input value={patientName} onChange={e => setPatientName(e.target.value)} className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-500" />
                                </div>
                                <div className="flex flex-col gap-1">
                                    <label className="text-xs font-bold text-slate-400 uppercase">DNI</label>
                                    <input value={documentNumber} onChange={e => setDocumentNumber(e.target.value)} className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-500" />
                                </div>
                                <div className="flex flex-col gap-1">
                                    <label className="text-xs font-bold text-slate-400 uppercase">F. Nacimiento</label>
                                    <input type="date" value={birthDate} onChange={e => setBirthDate(e.target.value)} className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-500" />
                                </div>
                                <div className="flex flex-col gap-1">
                                    <label className="text-xs font-bold text-slate-400 uppercase">Edad</label>
                                    <div className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-500">{patientAge !== null ? `${patientAge} años` : '-'}</div>
                                </div>
                                <div className="flex flex-col gap-1 col-span-2">
                                    <label className="text-xs font-bold text-slate-400 uppercase">Obra Social / ART</label>
                                    <select value={medicalCoverage} onChange={e => setMedicalCoverage(e.target.value)} className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-500">
                                        <option value="">Seleccionar...</option>
                                        {availableCoverages.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                                    </select>
                                </div>
                            </div>
                        </div>

                        {/* Clinical Data Card */}
                        <div className="glass-panel p-6 flex flex-col gap-4">
                            <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                                <span className="material-symbols-outlined text-emerald-500">medical_services</span>
                                Datos Clínicos
                            </h2>
                            <div className="flex flex-col gap-1">
                                <label className="text-xs font-bold text-slate-400 uppercase">Procedimiento</label>
                                <div className="flex gap-2 mb-2 flex-wrap">
                                    {selectedProcedures.map((proc, i) => (
                                        <span key={i} className="px-2 py-1 bg-emerald-50 text-emerald-700 rounded-md text-xs font-bold flex items-center gap-1">
                                            {proc}
                                            <button onClick={() => setSelectedProcedures(selectedProcedures.filter((_, idx) => idx !== i))} className="hover:text-emerald-900">×</button>
                                        </span>
                                    ))}
                                </div>
                                <div className="flex gap-2">
                                    <input
                                        value={procedureInput}
                                        onChange={e => setProcedureInput(e.target.value)}
                                        onKeyDown={e => {
                                            if (e.key === 'Enter' && procedureInput.trim()) {
                                                setSelectedProcedures([...selectedProcedures, procedureInput.trim()]);
                                                setProcedureInput('');
                                            }
                                        }}
                                        className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-emerald-500"
                                        placeholder="Escriba y presione Enter..."
                                    />
                                    <button onClick={() => { if (procedureInput.trim()) { setSelectedProcedures([...selectedProcedures, procedureInput.trim()]); setProcedureInput(''); } }} className="px-3 bg-slate-100 rounded-lg text-slate-600 hover:bg-slate-200">+</button>
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="flex flex-col gap-1">
                                    <label className="text-xs font-bold text-slate-400 uppercase">Lado</label>
                                    <select value={surgerySide} onChange={e => setSurgerySide(e.target.value as any)} className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-emerald-500">
                                        <option value="">-</option>
                                        <option value="left">Izquierdo</option>
                                        <option value="right">Derecho</option>
                                        <option value="bilateral">Bilateral</option>
                                    </select>
                                </div>
                                <div className="flex flex-col gap-1">
                                    <label className="text-xs font-bold text-slate-400 uppercase">Prioridad</label>
                                    <select value={priority} onChange={e => setPriority(e.target.value as any)} className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-emerald-500">
                                        <option value="elective">Electiva</option>
                                        <option value="urgent">Urgencia</option>
                                        <option value="emergency">Emergencia</option>
                                    </select>
                                </div>
                                <div className="flex flex-col gap-1 col-span-2">
                                    <label className="text-xs font-bold text-slate-400 uppercase">Médico Cirujano</label>
                                    <select value={selectedDoctorId} onChange={e => setSelectedDoctorId(e.target.value)} className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-emerald-500">
                                        <option value="">Seleccionar...</option>
                                        {doctors.map(d => <option key={d.id} value={d.id}>{d.full_name}</option>)}
                                    </select>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Col 2: Logistics & Validation */}
                    <div className="flex flex-col gap-6 space-y-6">
                        {/* Logistics Card */}
                        <div className="glass-panel p-6 flex flex-col gap-4">
                            <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                                <span className="material-symbols-outlined text-purple-500">event</span>
                                Agenda
                            </h2>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="flex flex-col gap-1">
                                    <label className="text-xs font-bold text-slate-400 uppercase">Fecha</label>
                                    <input type="date" value={surgeryDate} onChange={e => setSurgeryDate(e.target.value)} className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-purple-500" />
                                </div>
                                <div className="flex flex-col gap-1">
                                    <label className="text-xs font-bold text-slate-400 uppercase">Hora Inicio</label>
                                    <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-purple-500" />
                                </div>
                                <div className="flex flex-col gap-1">
                                    <label className="text-xs font-bold text-slate-400 uppercase">Duración (min)</label>
                                    <input type="number" value={estimatedDuration} onChange={e => setEstimatedDuration(Number(e.target.value))} className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-purple-500" />
                                </div>
                                <div className="flex flex-col gap-1">
                                    <label className="text-xs font-bold text-slate-400 uppercase">Quirófano</label>
                                    <select value={selectedOrId} onChange={e => setSelectedOrId(e.target.value)} className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-purple-500">
                                        <option value="">Seleccionar...</option>
                                        {availableORs.map(or => <option key={or.id} value={or.id}>{or.name}</option>)}
                                    </select>
                                </div>
                            </div>
                            <div className="flex flex-col gap-1 mt-2">
                                <label className="text-xs font-bold text-slate-400 uppercase">Anestesia</label>
                                <div className="flex gap-2">
                                    <select value={anesthesiaType} onChange={e => setAnesthesiaType(e.target.value)} className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-purple-500">
                                        <option value="">Tipo...</option>
                                        <option value="general">General</option>
                                        <option value="sedation">Sedación</option>
                                        <option value="regional">Regional</option>
                                        <option value="local">Local</option>
                                    </select>
                                </div>
                            </div>
                        </div>

                        {/* Validations Card */}
                        <div className="glass-panel p-6 flex flex-col gap-4">
                            <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                                <span className="material-symbols-outlined text-amber-500">check_circle</span>
                                Validaciones
                            </h2>

                            <div className="flex flex-col gap-3">
                                {/* Ortho Toggle */}
                                <div className={`flex items-center justify-between p-3 rounded-xl border ${approvals.ortho ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-50 border-slate-200'}`}>
                                    <div className="flex flex-col">
                                        <span className={`font-bold text-sm ${approvals.ortho ? 'text-emerald-700' : 'text-slate-500'}`}>Ortopedia</span>
                                        <span className="text-xs text-slate-400">Materiales confirmados</span>
                                    </div>
                                    <div
                                        onClick={() => (currentUserRole === 'SuperAdmin' || currentUserRole === 'Ortopedia') && setApprovals({ ...approvals, ortho: !approvals.ortho })}
                                        className={`w-12 h-6 rounded-full relative cursor-pointer transition-colors ${approvals.ortho ? 'bg-emerald-500' : 'bg-slate-300'}`}
                                    >
                                        <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${approvals.ortho ? 'left-7' : 'left-1'}`} />
                                    </div>
                                </div>

                                {/* Admission Toggle */}
                                <div className={`flex flex-col p-3 rounded-xl border transition-all ${approvals.admission ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-50 border-slate-200'}`}>
                                    <div className="flex items-center justify-between mb-2">
                                        <div className="flex flex-col">
                                            <span className={`font-bold text-sm ${approvals.admission ? 'text-emerald-700' : 'text-slate-500'}`}>Admisión</span>
                                            <span className="text-xs text-slate-400">Documentación completa</span>
                                        </div>
                                        <div
                                            onClick={() => (currentUserRole === 'SuperAdmin' || currentUserRole === 'Internacion') && setApprovals({ ...approvals, admission: !approvals.admission })}
                                            className={`w-12 h-6 rounded-full relative cursor-pointer transition-colors ${approvals.admission ? 'bg-emerald-500' : 'bg-slate-300'}`}
                                        >
                                            <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${approvals.admission ? 'left-7' : 'left-1'}`} />
                                        </div>
                                    </div>
                                    <div className="pl-2 border-l-2 border-slate-200 ml-1 flex flex-col gap-2 mt-1">
                                        <label className="flex items-center gap-2 text-xs font-bold text-slate-600 cursor-pointer">
                                            <input type="checkbox" checked={preOpExams} onChange={e => setPreOpExams(e.target.checked)} className="rounded text-blue-600 focus:ring-blue-500" />
                                            Exámenes Pre-Qx
                                        </label>
                                        <label className="flex items-center gap-2 text-xs font-bold text-slate-600 cursor-pointer">
                                            <input type="checkbox" checked={consentSigned} onChange={e => setConsentSigned(e.target.checked)} className="rounded text-blue-600 focus:ring-blue-500" />
                                            Consentimiento Firmado
                                        </label>
                                        <div className="flex items-center gap-2">
                                            <span className="text-xs text-slate-400">Fecha Exámenes:</span>
                                            <input type="date" value={preOpDate} onChange={e => setPreOpDate(e.target.value)} className="bg-transparent border-b border-slate-300 text-xs w-24 outline-none focus:border-blue-500" />
                                        </div>
                                    </div>
                                </div>

                                {/* OR Toggle */}
                                <div className={`flex items-center justify-between p-3 rounded-xl border ${approvals.or ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-50 border-slate-200'}`}>
                                    <div className="flex flex-col">
                                        <span className={`font-bold text-sm ${approvals.or ? 'text-emerald-700' : 'text-slate-500'}`}>Quirófano</span>
                                        <span className="text-xs text-slate-400">Horario confirmado</span>
                                    </div>
                                    <div
                                        onClick={() => (currentUserRole === 'SuperAdmin' || currentUserRole === 'Tecnico') && setApprovals({ ...approvals, or: !approvals.or })}
                                        className={`w-12 h-6 rounded-full relative cursor-pointer transition-colors ${approvals.or ? 'bg-emerald-500' : 'bg-slate-300'}`}
                                    >
                                        <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${approvals.or ? 'left-7' : 'left-1'}`} />
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Col 3: Resources */}
                    <div className="flex flex-col gap-6 space-y-6">
                        {/* Materials Card */}
                        <div className="glass-panel p-6 flex flex-col gap-4 min-h-[300px]">
                            <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                                <span className="material-symbols-outlined text-blue-500">healing</span>
                                Materiales / Ortopedia
                            </h2>
                            <div className="flex flex-col gap-3">
                                <label className="flex items-center gap-2 p-3 bg-slate-50 rounded-lg cursor-pointer border border-transparent hover:border-slate-200">
                                    <input type="checkbox" checked={requiresProsthesis} onChange={e => setRequiresProsthesis(e.target.checked)} className="size-4 rounded text-blue-600" />
                                    <span className="text-sm font-bold text-slate-700">Requiere Prótesis / Implante</span>
                                </label>
                                {requiresProsthesis && (
                                    <select value={selectedVendor} onChange={e => setSelectedVendor(e.target.value)} className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-500">
                                        <option value="">Seleccionar Proveedor...</option>
                                        {availableVendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                                    </select>
                                )}
                            </div>

                            <div className="h-px bg-slate-100 my-2" />

                            <div className="flex gap-2">
                                <input value={selectedMaterialName} onChange={e => setSelectedMaterialName(e.target.value)} placeholder="Nuevo material..." className="flex-1 bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-500" />
                                <input type="number" value={quantity} onChange={e => setQuantity(Number(e.target.value))} className="w-16 bg-white border border-slate-200 rounded-lg px-2 py-2 text-sm outline-none focus:border-blue-500" min="1" />
                                <button onClick={handleAddMaterial} className="bg-blue-600 text-white rounded-lg px-3 hover:bg-blue-700 font-bold">+</button>
                            </div>

                            <div className="flex flex-col gap-2 max-h-[300px] overflow-y-auto pr-1">
                                {materials.map(m => (
                                    <div key={m.id} className="flex flex-col bg-white border border-slate-100 rounded-lg p-3 text-sm shadow-sm gap-2">
                                        <div className="flex justify-between items-start">
                                            <span className="font-bold text-slate-700">{m.name}</span>
                                            <span className="text-slate-400 text-xs">x{m.quantity}</span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <input
                                                type="number"
                                                value={m.quantity}
                                                onChange={e => handleUpdateQuantity(m.id, Number(e.target.value))}
                                                className="w-12 border border-slate-200 rounded px-1 text-xs"
                                            />
                                            {canEditList && (
                                                <button onClick={() => setMaterials(materials.filter(x => x.id !== m.id))} className="text-red-400 hover:text-red-600 text-xs font-bold ml-auto">Eliminar</button>
                                            )}
                                        </div>
                                    </div>
                                ))}
                                {materials.length === 0 && <span className="text-slate-400 text-xs text-center py-4 italic">No hay materiales cargados</span>}
                            </div>
                        </div>

                        {/* Documents Card */}
                        <div className="glass-panel p-6 flex flex-col gap-4">
                            <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                                <span className="material-symbols-outlined text-pink-500">folder_open</span>
                                Documentación
                            </h2>
                            <div className="flex gap-2">
                                <select value={uploadCategory} onChange={e => setUploadCategory(e.target.value)} className="flex-1 bg-white border border-slate-200 rounded-lg px-2 py-2 text-xs outline-none">
                                    {DOCUMENT_CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                </select>
                                <label className={`px-3 py-2 bg-pink-50 text-pink-600 rounded-lg cursor-pointer hover:bg-pink-100 text-xs font-bold flex items-center ${uploading ? 'opacity-50 pointer-events-none' : ''}`}>
                                    {uploading ? 'Subiendo...' : 'Subir'}
                                    <input type="file" className="hidden" onChange={handleFileUpload} disabled={uploading} />
                                </label>
                            </div>
                            <div className="flex flex-col gap-2 max-h-[200px] overflow-y-auto">
                                {documents.map(d => (
                                    <div key={d.id} className="flex justify-between items-center p-2 rounded-lg hover:bg-slate-50 border border-transparent hover:border-slate-100 group">
                                        <div className="flex items-center gap-2 overflow-hidden">
                                            <span className="material-symbols-outlined text-slate-400 text-sm">description</span>
                                            <a href={`#`} className="text-xs text-blue-600 hover:underline truncate blocks max-w-[120px]" title={d.name}>{d.name}</a>
                                        </div>
                                        <button onClick={() => handleDeleteDocument(d.id, d.file_path)} className="text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <span className="material-symbols-outlined text-sm">delete</span>
                                        </button>
                                    </div>
                                ))}
                                {documents.length === 0 && <span className="text-slate-400 text-xs text-center py-4 italic">Sin documentos</span>}
                            </div>
                        </div>
                    </div>

                </div>

            </div>

            {/* Minimalist Modals */}
            {suspensionModal.isOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
                    <div className="glass-panel w-full max-w-md p-6 animate-fadeIn">
                        <h2 className="text-xl font-bold mb-4">Confirmar Suspensión</h2>
                        <select className="w-full bg-white border border-slate-200 rounded-lg px-4 py-3 mb-4" value={suspensionModal.reason} onChange={e => setSuspensionModal({ ...suspensionModal, reason: e.target.value })}>
                            <option value="">Seleccione motivo...</option>
                            {SUSPENSION_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
                        </select>
                        <div className="flex gap-3">
                            <button onClick={() => setSuspensionModal({ ...suspensionModal, isOpen: false })} className="flex-1 py-3 border border-slate-200 rounded-xl font-bold text-slate-600 hover:bg-slate-50">Cancelar</button>
                            <button onClick={handleSuspend} className="flex-1 py-3 bg-amber-500 text-white rounded-xl font-bold hover:bg-amber-600 shadow-lg shadow-amber-500/20">Confirmar</button>
                        </div>
                    </div>
                </div>
            )}

            {rescheduleModal.isOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
                    <div className="glass-panel w-full max-w-md p-6 animate-fadeIn">
                        <h2 className="text-xl font-bold mb-4">Reprogramar Cirugía</h2>
                        <div className="flex flex-col gap-4 mb-6">
                            <div className="flex flex-col gap-1">
                                <label className="text-xs font-bold text-slate-400 uppercase">Nueva Fecha</label>
                                <input type="date" value={rescheduleModal.newDate} onChange={e => setRescheduleModal({ ...rescheduleModal, newDate: e.target.value })} className="w-full bg-white border border-slate-200 rounded-lg px-4 py-3 outline-none focus:border-blue-500" />
                            </div>
                            <div className="flex flex-col gap-1">
                                <label className="text-xs font-bold text-slate-400 uppercase">Nueva Hora</label>
                                <input type="time" value={rescheduleModal.newTime} onChange={e => setRescheduleModal({ ...rescheduleModal, newTime: e.target.value })} className="w-full bg-white border border-slate-200 rounded-lg px-4 py-3 outline-none focus:border-blue-500" />
                            </div>
                        </div>
                        <div className="flex gap-3">
                            <button onClick={() => setRescheduleModal({ ...rescheduleModal, isOpen: false })} className="flex-1 py-3 border border-slate-200 rounded-xl font-bold text-slate-600 hover:bg-slate-50">Cancelar</button>
                            <button onClick={handleReschedule} className="flex-1 py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 shadow-lg shadow-blue-600/20">Guardar</button>
                        </div>
                    </div>
                </div>
            )}



        </div>
    );
};

export default SurgeryDetail;