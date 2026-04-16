import React, { useState, useEffect, useRef } from 'react';
import { Link, useParams, useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../src/lib/supabase';
import { useAuth } from '../src/lib/AuthContext';
import { captureError } from '../src/lib/errorLogger';
import { createOrUpdateDoctorAlert, syncSurgeryAlerts } from '../src/lib/alertService';
import { UserRole } from '../types';
import { ARGENTINA_LOCATIONS } from '../src/data/locations';
import ProgressBar from '../components/ProgressBar';
import { generateUUID } from '../src/lib/uuid';
import SurgeryForm from '../components/SurgeryForm';
import { MonitorCase } from './Monitor';

interface SurgeryMaterial {
    id: string;
    name: string;
    quantity: number;         // Current / Actual Quantity (What is being provided)
    requestedQuantity: number; // Original Quantity requested by Doctor
    category: string;
    // Orthopedics Workflow Fields
    isCovered?: boolean;     // Checkbox 1: "Tengo el material"
    observation?: string;    // Text: "Cambio de marca / Detalle"
    isConfirmed?: boolean;   // Checkbox 2: "Reconfirmado / Validado"
    procedureName?: string;  // Linked procedure from the "cart"
}

interface SurgeryDocument {
    id: string;
    name: string;
    type: string;
    category?: string; // e.g. "DNI", "Pedido Médico", "Autorización"
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

// Fallback lists for offline/initial state
const FALLBACK_COVERAGES = [
    'OSDE', 'Swiss Medical', 'Galeno', 'PAMI', 'IOMA', 'Particular'
];

// Estos vendrán de la base de datos eventualmente
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
    const location = useLocation();
    const navigationState = location.state as { 
        prefillDate?: string, 
        prefillOr?: string, 
        prefillTime?: string,
        isPastRegistration?: boolean 
    } | null;

    // Refs for interaction
    const patientInputRef = useRef<HTMLInputElement>(null);


    const { user } = useAuth();
    const isNew = !id || id === 'new';
    // --- UI/Loading State ---
    const [loading, setLoading] = useState(!isNew);
    const [saving, setSaving] = useState(false);

    // --- Clinical Data State ---
    const [procedureInput, setProcedureInput] = useState('');
    const [selectedProcedures, setSelectedProcedures] = useState<string[]>([]);
    const [diagnosis, setDiagnosis] = useState(''); // New Diagnosis State
    const [patientName, setPatientName] = useState('');

    const [documentNumber, setDocumentNumber] = useState('');
    const [nuc, setNuc] = useState('');
    const [medicalRecordNumber, setMedicalRecordNumber] = useState('');
    const [birthDate, setBirthDate] = useState('');
    const [phone, setPhone] = useState('');
    const [address, setAddress] = useState('');
    const [province, setProvince] = useState('');
    const [locality, setLocality] = useState('');
    const [allergies, setAllergies] = useState('');
    const [surgerySide, setSurgerySide] = useState<'left' | 'right' | 'bilateral' | ''>('');
    const [preOpNotes, setPreOpNotes] = useState('');
    const [surgeryDate, setSurgeryDate] = useState('');
    const [startTime, setStartTime] = useState('');
    const [estimatedDuration, setEstimatedDuration] = useState<number | ''>('');
    const [status, setStatus] = useState(isNew ? 'pending_validation' : 'scheduled');
    const [priority, setPriority] = useState<'elective' | 'urgent' | 'emergency'>('elective');
    const [isGuardia, setIsGuardia] = useState(false);
    const [showSurgeryForm, setShowSurgeryForm] = useState(false);

    // Suspension State
    const [suspensionModal, setSuspensionModal] = useState({
        isOpen: false,
        reason: '',
        observations: ''
    });

    // Reschedule State
    const [rescheduleModal, setRescheduleModal] = useState({
        isOpen: false,
        newDate: '',
        newTime: ''
    });

    const [requestRescheduleModal, setRequestRescheduleModal] = useState({
        isOpen: false,
        reason: '',
        suggestedDate: ''
    });

    const [requestSuspensionModal, setRequestSuspensionModal] = useState({
        isOpen: false,
        reason: ''
    });

    // Validation Requirements State
    const [preOpExams, setPreOpExams] = useState(false);
    const [preOpDate, setPreOpDate] = useState('');
    const [consentSigned, setConsentSigned] = useState(false);

    // New State: Authorization Date
    const [authDate, setAuthDate] = useState('');
    // New State: Medical Coverage
    const [medicalCoverage, setMedicalCoverage] = useState('');
    // New State: Anesthesiologist
    const [anesthesiologistId, setAnesthesiologistId] = useState('');
    const [plannedStartTime, setPlannedStartTime] = useState<string | null>(null);
    const [plannedEndTime, setPlannedEndTime] = useState<string | null>(null);
    const [doctorPriorityValidated, setDoctorPriorityValidated] = useState(false);
    const [createdAt, setCreatedAt] = useState<string | null>(null);
    const [internacionNotified, setInternacionNotified] = useState(false);
    const [internacionNotifiedBy, setInternacionNotifiedBy] = useState<string | null>(null);
    // Material Modal Form State
    const [selectedMaterialName, setSelectedMaterialName] = useState('');
    const [selectedProcedureForMaterial, setSelectedProcedureForMaterial] = useState('');
    const [quantity, setQuantity] = useState(1);
    const [doctors, setDoctors] = useState<any[]>(FALLBACK_DOCTORS);
    const [selectedDoctorId, setSelectedDoctorId] = useState('');
    const [availableVendors, setAvailableVendors] = useState<any[]>(FALLBACK_VENDORS);
    const [availableCoverages, setAvailableCoverages] = useState<any[]>([]);
    const [availableORs, setAvailableORs] = useState<any[]>([]);
    const [selectedOrId, setSelectedOrId] = useState(isNew ? '301' : '');
    const [anesthesiaType, setAnesthesiaType] = useState('');

    // --- Audit State: Original Data for comparison ---
    const [originalData, setOriginalData] = useState<any>(null);
    const [referringDoctorId, setReferringDoctorId] = useState(''); // New Referring Doctor State

    // Request State (Hospitalization -> Technical)
    const [suspensionRequested, setSuspensionRequested] = useState(false);
    const [rescheduleRequested, setRescheduleRequested] = useState(false);
    const [requestNote, setRequestNote] = useState('');
    const [requestUserName, setRequestUserName] = useState('');
    const [idCopied, setIdCopied] = useState(false);

    // --- Audit Helper: Get Changes ---
    const getChanges = (original: any, current: any) => {
        const changes: string[] = [];
        const userSuffix = user?.name ? ` (por ${user.name})` : '';

        // Basic Fields
        if (original.surgery_date !== current.surgery_date) itemsPush(`Fecha: ${original.surgery_date || 'N/A'} -> ${current.surgery_date || 'N/A'}${userSuffix}`);
        if (original.start_time !== current.start_time) itemsPush(`Hora: ${original.start_time || 'N/A'} -> ${current.start_time || 'N/A'}${userSuffix}`);
        if (original.status !== current.status) itemsPush(`Estado: ${original.status} -> ${current.status}${userSuffix}`);
        if (original.priority !== current.priority) itemsPush(`Prioridad: ${original.priority} -> ${current.priority}${userSuffix}`);
        if (original.is_guardia !== current.is_guardia) itemsPush(`Cirugía de Guardia: ${original.is_guardia ? 'SÍ' : 'NO'} -> ${current.is_guardia ? 'SÍ' : 'NO'}${userSuffix}`);
        if (original.surgery_side !== current.surgery_side) itemsPush(`Lado: ${original.surgery_side || 'N/A'} -> ${current.surgery_side || 'N/A'}${userSuffix}`);
        if (original.operating_room_id !== current.operating_room_id) itemsPush(`Quirófano: ${getORName(original.operating_room_id)} -> ${getORName(current.operating_room_id)}${userSuffix}`);

        // Validation Checkboxes (Boolean vs Boolean)
        if (!!original.ortho_validated !== !!current.ortho_validated) {
            itemsPush(`Validación Ortopedia: ${current.ortho_validated ? 'APROBADO (OK Materiales)' : 'PENDIENTE'}${userSuffix}`);
        }
        if (!!original.admission_validated !== !!current.admission_validated) {
            itemsPush(`Validación Admisión: ${current.admission_validated ? 'APROBADO (Estudios OK)' : 'PENDIENTE'}${userSuffix}`);
        }
        if (!!original.or_validated !== !!current.or_validated) {
            itemsPush(`Validación Quirófano: ${current.or_validated ? 'APROBADO (Programación OK)' : 'PENDIENTE'}${userSuffix}`);
        }
        if (!!original.doctor_priority_validated !== !!current.doctor_priority_validated) {
            itemsPush(`Aval Médico Urgencia: ${current.doctor_priority_validated ? 'CONCEDIDO (Médico avala urgencia)' : 'REVOCADO'}${userSuffix}`);
        }

        return changes;

        function itemsPush(msg: string) { changes.push(msg); }
        function getORName(id: string | null) {
            if (!id) return 'Sin asignar';
            return availableORs.find(or => or.id === id)?.name || id;
        }
    };

    // --- Documents State ---
    const [documents, setDocuments] = useState<SurgeryDocument[]>([]);
    const [uploading, setUploading] = useState(false);

    // --- Patient Search State ---
    const [patientSearchTerm, setPatientSearchTerm] = useState('');
    const [patientSearchResults, setPatientSearchResults] = useState<any[]>([]);
    const [isSearchingPatient, setIsSearchingPatient] = useState(false);
    const searchTimeoutRef = useRef<any>(null);
    const [uploadCategory, setUploadCategory] = useState('other');
    const [uploadProgress, setUploadProgress] = useState(0);
    const [tempId] = useState(() => generateUUID());

    // --- Patient Search Logic ---
    const handlePatientSearch = async (term: string) => {
        setPatientSearchTerm(term);

        if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);

        if (!term || term.length < 3) {
            setPatientSearchResults([]);
            return;
        }

        searchTimeoutRef.current = setTimeout(async () => {
            setIsSearchingPatient(true);
            try {
                const { data, error } = await supabase
                    .from('patients')
                    .select('*')
                    .or(`full_name.ilike.%${term}%,document_number.ilike.%${term}%,medical_record_number.ilike.%${term}%`)
                    .limit(10);

                if (error) throw error;
                setPatientSearchResults(data || []);
            } catch (err) {
                console.error('Error searching patients:', err);
            } finally {
                setIsSearchingPatient(false);
            }
        }, 300);
    };

    const handleSelectPatient = (patient: any) => {
        setPatientName(patient.full_name || '');
        setDocumentNumber(patient.document_number || '');
        setNuc(patient.nuc || '');
        setMedicalRecordNumber(patient.medical_record_number || '');
        setBirthDate(patient.birth_date || '');
        setPhone(patient.phone || '');
        setAddress(patient.address || '');
        setProvince(patient.province || '');
        setLocality(patient.locality || '');
        setAllergies(patient.allergies || '');

        // Clear search
        setPatientSearchResults([]);
        setPatientSearchTerm('');

        // Focus on the next logical field or just provide feedback
        if (patientInputRef.current) {
            patientInputRef.current.focus();
        }
    };

    const handleCopyId = () => {
        if (!id) return;
        navigator.clipboard.writeText(id).then(() => {
            setIdCopied(true);
            setTimeout(() => setIdCopied(false), 2000);
        });
    };
    const [stagedDocuments, setStagedDocuments] = useState<any[]>([]);

    // --- Patient History State ---
    const [patientHistory, setPatientHistory] = useState<any[]>([]);

    // --- Manual Materials Entry State ---
    const [manualMaterialName, setManualMaterialName] = useState('');
    const [manualMaterialQty, setManualMaterialQty] = useState(1);
    const [manualMaterialProc, setManualMaterialProc] = useState('');

    // --- Calculate Age from Birth Date ---
    const calculateAge = (dateStr: string): number | null => {
        if (!dateStr) return null;
        const today = new Date();
        const birth = new Date(dateStr);
        let age = today.getFullYear() - birth.getFullYear();
        const monthDiff = today.getMonth() - birth.getMonth();
        if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
            age--;
        }
        return age >= 0 ? age : null;
    };

    const patientAge = calculateAge(birthDate);

    useEffect(() => {
        if (isNew) {
            if (navigationState?.prefillDate) setSurgeryDate(navigationState.prefillDate);
            if (navigationState?.prefillOr) setSelectedOrId(navigationState.prefillOr);
            if (navigationState?.prefillTime) setStartTime(navigationState.prefillTime);
            if (navigationState?.isPastRegistration) {
                setStatus('completed');
                setPriority('urgent');
            }
            
            if (user?.role === 'Ortopedia') {
                alert('No tiene permiso para crear cirugías.');
                navigate('/surgeries');
                return;
            }

            if (user?.role === 'Administrativo de Guardias') {
                setIsGuardia(true);
                setPriority('emergency');
            }
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

    const fetchDoctors = async () => {
        try {
            const { data, error } = await supabase
                .from('doctors')
                .select('*')
                .eq('active', true);

            if (error) throw error;
            if (data && data.length > 0) {
                console.log('Fetched doctors:', data.length, data.map(d => ({ name: d.full_name, spec: d.specialty })));
                setDoctors(data);
            }
        } catch (err) {
            console.warn('Could not fetch doctors from DB, using fallback list.');
        }
    };
    const fetchVendors = async () => {
        const { data } = await supabase.from('vendors').select('*').order('name');
        if (data && data.length > 0) setAvailableVendors(data);
    };

    const fetchCoverages = async () => {
        let query = supabase.from('coverages').select('*').order('name');
        if (user?.role === 'Oficina ART') {
            query = query.eq('type', 'ART');
        }
        const { data } = await query;
        if (data && data.length > 0) setAvailableCoverages(data);
    };

    const fetchORs = async () => {
        const { data } = await supabase.from('operating_rooms').select('*').eq('active', true).order('name');
        if (data && data.length > 0) setAvailableORs(data);
    };

    const fetchDocuments = async (surgeryId: string) => {
        const { data, error } = await supabase
            .from('surgery_documents')
            .select('*')
            .eq('surgery_id', surgeryId)
            .order('created_at', { ascending: false });

        if (error) console.error('Error fetching docs:', error);
        else if (data) setDocuments(data);
    };

    const fetchPatientHistory = async (docNumber: string, currentSurgeryId: string) => {
        if (!docNumber) return;
        try {
            let query = supabase
                .from('surgeries')
                .select(`
                    id,
                    surgery_date,
                    procedure_name,
                    status,
                    doctor_id,
                    doctors!doctor_id (full_name),
                    patients!inner (document_number)
                `)
                .eq('patients.document_number', docNumber);

            // Evitar error 400: No aplicar neq('id', 'new') ya que 'new' no es un UUID válido
            if (currentSurgeryId && currentSurgeryId !== 'new') {
                query = query.neq('id', currentSurgeryId);
            }

            const { data: historyData, error: historyError } = await query
                .order('surgery_date', { ascending: false });

            if (historyError) throw historyError;
            setPatientHistory(historyData || []);
        } catch (err) {
            console.error('Error fetching patient history:', err);
        }
    };

    const fetchSurgeryDetails = async (surgeryId: string) => {
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('surgeries')
                .select(`
                    *,
                    patients (full_name, document_number, nuc, phone, address, province, locality, birth_date, medical_record_number, allergies),
                    surgery_materials (*),
                    vendor_id
                `)
                .eq('id', surgeryId)
                .single();

            if (error) throw error;

            if (data) {
                // Access Control for Medico
                if (user?.role === 'Medico' && user.doctorId && data.doctor_id !== user.doctorId) {
                    alert('No tiene permiso para ver esta cirugía.');
                    navigate('/surgeries');
                    return;
                }
                if (user?.role === 'Ortopedia' && user.vendorId && data.vendor_id !== user.vendorId) {
                    alert('No tiene permiso para ver esta cirugía.');
                    navigate('/surgeries');
                    return;
                }
                if (user?.role === 'Oficina ART') {
                    const { data: artCoverages } = await supabase
                        .from('coverages')
                        .select('name')
                        .eq('type', 'ART');
                    const artNames = artCoverages?.map(c => c.name) || [];
                    if (!artNames.includes(data.medical_coverage)) {
                        alert('No tiene permiso para ver esta cirugía (Restringido a ART).');
                        navigate('/surgeries');
                        return;
                    }
                }
                if (data.procedure_name) {
                    setSelectedProcedures(data.procedure_name.split(' + '));
                }
                setDiagnosis(data.diagnosis || ''); // Load Diagnosis
                setReferringDoctorId(data.referring_doctor_id || ''); // Load Referring Doctor
                setPatientName(data.patients.full_name);
                setDocumentNumber(data.patients.document_number);
                setNuc(data.patients.nuc || '');

                // Fetch patient history using the document number
                if (data.patients.document_number) {
                    fetchPatientHistory(data.patients.document_number, surgeryId);
                }
                setPhone(data.patients.phone || '');
                setAddress(data.patients.address || '');
                setProvince(data.patients.province || '');
                setLocality(data.patients.locality || '');
                setAllergies(data.patients.allergies || '');
                setBirthDate(data.patients.birth_date || '');
                setMedicalRecordNumber(data.patients.medical_record_number || '');
                setSurgeryDate(data.surgery_date || '');
                setSurgerySide(data.surgery_side || '');
                setPreOpNotes(data.pre_op_notes || '');
                setStartTime(data.start_time || '');
                setEstimatedDuration(data.estimated_duration || 60);
                setStatus(data.status || 'scheduled');
                setPriority(data.priority || 'elective');
                setIsGuardia(data.is_guardia || false);

                // Load OR and Anesthesia
                setSelectedOrId(data.operating_room_id || '');
                setAnesthesiaType(data.anesthesia_type || '');
                setAnesthesiologistId(data.anesthesiologist_id || '');

                // Load authorizations and checkboxes
                setAuthDate(data.authorization_date || '');
                setPreOpExams(data.pre_op_exams || false);
                setPreOpDate(data.pre_op_date || '');
                setConsentSigned(data.consent_signed || false);
                setMedicalCoverage(data.medical_coverage || '');

                // Set vendor and prosthesis independently
                setSelectedVendor(data.vendor_id || '');
                setRequiresProsthesis(data.requires_prosthesis || false);
                setPlannedStartTime(data.planned_start_time || null);
                setPlannedEndTime(data.planned_end_time || null);
                setDoctorPriorityValidated(data.doctor_priority_validated || false);
                setCreatedAt(data.created_at);
                setInternacionNotified(data.internacion_notified || false);
                setInternacionNotifiedBy(data.internacion_notified_by || null);
                setSelectedDoctorId(data.doctor_id || '');

                // Load Requests
                setSuspensionRequested(data.suspension_requested || false);
                setRescheduleRequested(data.reschedule_requested || false);
                setRequestNote(data.request_note || '');
                setRequestUserName(data.request_user_name || '');

                // Load validations
                setApprovals({
                    ortho: data.ortho_validated || false,
                    admission: data.admission_validated || false,
                    or: data.or_validated || false
                });
                if (data.admission_validation_date) setAdmissionValidationDate(data.admission_validation_date);
                if (data.ortho_validation_date) setOrthoValidationDate(data.ortho_validation_date);
                if (data.ortho_validated_by_name) setOrthoValidatedByName(data.ortho_validated_by_name);
                if (data.or_validation_date) setOrValidationDate(data.or_validation_date);
                if (data.or_validated_by_name) setOrValidatedByName(data.or_validated_by_name);
                setMaterials(data.surgery_materials.map((m: any) => ({
                    id: m.id,
                    name: m.name,
                    quantity: m.provided_quantity,
                    requestedQuantity: m.requested_quantity,
                    category: m.category,
                    isCovered: m.is_covered,
                    isConfirmed: m.is_confirmed,
                    observation: m.observation,
                    procedureName: m.procedure_name
                })));

                // Capture Original Data Snapshot for Audit
                setOriginalData({
                    surgery_date: data.surgery_date,
                    start_time: data.start_time,
                    status: data.status,
                    priority: data.priority,
                    is_guardia: data.is_guardia,
                    surgery_side: data.surgery_side,
                    operating_room_id: data.operating_room_id,
                    ortho_validated: data.ortho_validated,
                    admission_validated: data.admission_validated,
                    or_validated: data.or_validated,
                    doctor_priority_validated: data.doctor_priority_validated,
                    referring_doctor_id: data.referring_doctor_id,
                    // Add more fields if needed
                });
            }
        } catch (err) {
            console.error('Error fetching surgery:', err);
        } finally {
            setLoading(false);
        }
    };

    // Role Simulation State (DEPRECATED: using useAuth)
    const currentUserRole = user?.role || 'Invitado';

    const handleToggleInternacion = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!id || id === 'new') return;
        const newValue = e.target.checked;

        // Security check: Only SuperAdmin can uncheck (set to false)
        if (!newValue && currentUserRole !== 'SuperAdmin') {
            alert('Solo el SuperAdmin puede desmarcar una cirugía ya vista.');
            return;
        }

        try {
            setSaving(true);
            const byWho = newValue ? user?.name || '' : null;
            const atWhen = newValue ? new Date().toISOString() : null;
            
            const { error } = await supabase
                .from('surgeries')
                .update({
                    internacion_notified: newValue,
                    internacion_notified_by: byWho,
                    internacion_notified_at: atWhen
                })
                .eq('id', id);

            if (error) throw error;
            setInternacionNotified(newValue);
            setInternacionNotifiedBy(byWho);
            
            supabase.from('audit_logs').insert({
                user_name: user?.name,
                user_role: user?.role,
                action: 'UPDATE',
                resource: 'Cirugia',
                resource_id: id,
                description: `Internación marcó cirugía como ${newValue ? 'VISTA' : 'NO VISTA'}`
            }).then();

        } catch (err) {
            console.error('Error updating internacion state', err);
            alert('Error al guardar el estado');
        } finally {
            setSaving(false);
        }
    };

    // Scheduling Approvals
    const [approvals, setApprovals] = useState({
        ortho: false,
        admission: false,
        or: false
    });
    const [admissionValidationDate, setAdmissionValidationDate] = useState<string | null>(null);
    const [orthoValidationDate, setOrthoValidationDate] = useState<string | null>(null);
    const [orthoValidatedByName, setOrthoValidatedByName] = useState<string | null>(null);
    const [orValidationDate, setOrValidationDate] = useState<string | null>(null);
    const [orValidatedByName, setOrValidatedByName] = useState<string | null>(null);

    // Materials State
    const [materials, setMaterials] = useState<SurgeryMaterial[]>([]);
    const [requiresProsthesis, setRequiresProsthesis] = useState(false); // New Checkbox State
    const [selectedVendor, setSelectedVendor] = useState(''); // New Vendor State

    // Auto Validation Dependency
    const vendorRequiresValidation = React.useMemo(() => {
        const vendor = availableVendors.find(v => v.id === selectedVendor);
        return vendor ? vendor.requires_material_validation !== false : true;
    }, [availableVendors, selectedVendor]);

    useEffect(() => {
        // Automatically check the ortho validation in UI if the vendor doesn't require it
        if (!vendorRequiresValidation && !approvals.ortho) {
            setApprovals(prev => ({ ...prev, ortho: true }));
        }
    }, [vendorRequiresValidation, approvals.ortho]);

    const [showMaterialModal, setShowMaterialModal] = useState(false);

    // Derived Status
    const isScheduled = approvals.ortho && approvals.admission && approvals.or;

    // Derived Helper: Check if ALL materials are confirmed
    const areAllMaterialsConfirmed = materials.length > 0 && materials.every(m => m.isConfirmed);

    // Helper: Who can edit the list (Add/Remove items)?
    const canEditList = currentUserRole === 'SuperAdmin' || currentUserRole === 'Ortopedia' || currentUserRole === 'Internacion';

    // Helper: Who can validate items (Check availability)?
    const canValidate = currentUserRole === 'SuperAdmin' || currentUserRole === 'Ortopedia';

    // Helper: Is Material Section Unlocked?
    // Unlocked if: Existing Surgery OR (New Surgery AND User has permission to request)
    const isMaterialSectionUnlocked = !isNew || ['Internacion', 'SuperAdmin', 'Medico'].includes(currentUserRole);

    const isReadOnly = 
        (currentUserRole === 'Administrativo de Guardias' && !isGuardia && !isNew) ||
        (currentUserRole === 'Medico' && !isNew);

    const canDelete = currentUserRole === 'SuperAdmin';

    // --- UI Handlers ---
    const handleCoverageChange = (coverageName: string) => {
        setMedicalCoverage(coverageName);

        // Find if this coverage has an associated vendor
        const coverage = availableCoverages.find(c => c.name === coverageName);
        if (coverage && coverage.vendor_id) {
            setSelectedVendor(coverage.vendor_id);
            // setRequiresProsthesis(true); // Removed auto-enable as per user request
        }
    };



    // --- Material Handlers ---

    const handleAddMaterial = () => {
        if (!selectedMaterialName) return;
        const template = AVAILABLE_MATERIALS.find(m => m.name === selectedMaterialName);

        // Check if exists
        const existing = materials.find(m => m.name === selectedMaterialName);
        if (existing) {
            handleUpdateQuantity(existing.id, existing.quantity + quantity);
        } else {
            const newMaterial: SurgeryMaterial = {
                id: Date.now().toString(),
                name: selectedMaterialName,
                quantity: quantity,
                requestedQuantity: quantity, // Init both same
                category: (template?.category as any) || 'Farmacia',
                isCovered: false,
                isConfirmed: false,
                observation: '',
                procedureName: selectedProcedureForMaterial || selectedProcedures[0] // Default to first if not selected
            };
            // Adding new material resets global approval if active
            if (approvals.ortho) setApprovals(prev => ({ ...prev, ortho: false }));
            setMaterials([...materials, newMaterial]);
        }

        // Reset form
        setSelectedMaterialName('');
        setSelectedProcedureForMaterial('');
        setQuantity(1);
    };

    const handleRemoveMaterial = (id: string) => {
        // Removing material resets global approval if active
        if (approvals.ortho) setApprovals(prev => ({ ...prev, ortho: false }));
        setMaterials(materials.filter(m => m.id !== id));
    };

    const handleUpdateQuantity = (id: string, newQuantity: number) => {
        if (newQuantity < 0) return; // Allow 0 to show "Not provided"

        // If quantity changes, we must un-confirm that specific item AND uncheck global approval
        if (approvals.ortho) setApprovals(prev => ({ ...prev, ortho: false }));

        setMaterials(materials.map(m =>
            m.id === id
                ? { ...m, quantity: newQuantity, isConfirmed: false } // Reset confirmation on edit
                : m
        ));
    };

    // Orthopedics Specific Handlers
    const toggleCovered = (id: string) => {
        setMaterials(materials.map(m => m.id === id ? { ...m, isCovered: !m.isCovered } : m));
    };

    const updateObservation = (id: string, text: string) => {
        setMaterials(materials.map(m => m.id === id ? { ...m, observation: text } : m));
    };

    const toggleConfirmed = (id: string) => {
        setMaterials(materials.map(m => m.id === id ? { ...m, isConfirmed: !m.isConfirmed } : m));
    };

    const handleDeleteSurgery = async () => {
        if (!confirm('ADVERTENCIA: ¿Está seguro que desea eliminar esta cirugía PERMANENTEMENTE? Esta acción no se puede deshacer.')) return;

        try {
            // Delete related documents first (if specific logic needed, though cascade might handle it)
            // But usually safer to cascading in DB or just delete row.

            // Audit Logic (Before delete to capture data, or parallel? Supabase triggers are better but we do app-level for now)
            // Note: If we delete the row, we might lose reference if resource_id is strictly foreign keyed without cascade setnull.
            // Assuming audit_logs resource_id is NOT a foreign key or is weak.
            // Usually audit logs should persist.

            // Audit (Non-blocking)
            supabase.from('audit_logs').insert({
                user_name: user?.name || 'Usuario',
                user_role: currentUserRole,
                action: 'DELETE',
                resource: 'Cirugía',
                resource_id: id,
                description: `Cirugía eliminada irreversiblemente. Paciente: ${patientName}`,
                meta: { source: 'SurgeryDetail' }
            }).then(({ error }) => {
                if (error) captureError(error, { context: 'SurgeryDetail.handleDeleteSurgery.audit', severity: 'WARNING', user: user, metadata: { surgeryId: id } });
            });

            // Delete the surgery
            const { error } = await supabase
                .from('surgeries')
                .delete()
                .eq('id', id);

            if (error) throw error;

            alert('Cirugía eliminada correctamente.');
            navigate('/surgeries');
        } catch (err: any) {
            console.error('Error deleting surgery:', err);
            alert('Error al eliminar la cirugía: ' + (err.message || 'Error desconocido'));
        }
    };

    const handleSurgerySave = async () => {
        if (!patientName || selectedProcedures.length === 0) {
            alert('Por favor complete el nombre del paciente y al menos un procedimiento.');
            return;
        }

        // Validate: if pre-op exams checkbox is checked, date is required
        if (preOpExams && !preOpDate) {
            alert('Por favor ingrese la fecha de realización de los exámenes pre-quirúrgicos.');
            return;
        }

        if (requiresProsthesis && materials.length === 0) {
            const proceed = window.confirm('Usted marcó que la cirugía lleva prótesis pero no ha cargado ningún material. ¿Desea continuar de todas formas?');
            if (!proceed) {
                setSaving(false);
                return;
            }
        }

        setSaving(true);
        try {
            // 1. Get or Create Patient

            // Clean DNI
            const cleanDni = documentNumber?.trim();

            // Status Validation: If scheduled, must have date, time and duration
            let finalStatus = status;

            const currentUserRole = user?.role as UserRole;
            const isEmergency = priority === 'emergency';
            const isInternacion = currentUserRole === 'Internacion';
            const isTecnico = currentUserRole === 'Tecnico';

            // --- AUTO-VALIDATE OR FOR TECNICO ---
            let currentApprovals = { ...approvals };
            if (isTecnico && surgeryDate && !currentApprovals.or) {
                currentApprovals.or = true;
                // We'll also update the metadata if we can reach the setter, 
                // but for db payload it's enough to update the local variable used for payload.
            }

            // --- AUTO-VALIDATE ORTHO IF NO MATERIALS/PROSTHESIS OR NOT REQUIRED BY VENDOR ---
            // Fix for "Contreras" case: If no materials/prosthesis, Ortho is implicitly valid.
            const needsOrtho = (materials && materials.length > 0) || requiresProsthesis;
            if (!needsOrtho || !vendorRequiresValidation) {
                currentApprovals.ortho = true;
                // We don't necessarily update state setters here as we are about to save/navigate, 
                // but we must ensure the payload uses these values.
            }

            // --- RECALCULATE FINAL STATUS BASED ON APPROVALS ---
            if (currentApprovals.ortho && currentApprovals.admission) {
                if (currentApprovals.or && surgeryDate) {
                    finalStatus = 'scheduled';
                } else {
                    finalStatus = 'waiting_date';
                }
            } else {
                finalStatus = 'pending_validation';
            }

            // --- OVERRIDE IF SUSPENDED OR COMPLETED ---
            if (status === 'suspended' || status === 'completed') {
                finalStatus = status;
            }

            if (finalStatus === 'scheduled') {
                if (!surgeryDate || !startTime || !estimatedDuration) {
                    alert('No se puede programar una cirugía sin fecha, hora y duración estimada.');
                    setSaving(false);
                    return;
                }

                // --- AUTHORIZATION DATE VALIDATION (REMOVED v1.1.13) ---
                // if (!authDate) {
                //     alert('No se puede agendar: Se requiere la fecha de autorización de la obra social.');
                //     setSaving(false);
                //     return;
                // }

                const sDate = parseLocalYMD(surgeryDate);
                const aDate = parseLocalYMD(authDate);
                if (medicalCoverage !== 'Particular' && sDate && aDate && sDate < aDate) {
                    alert('Error: La fecha de la cirugía no puede ser anterior a la fecha de autorización del prestador.');
                    setSaving(false);
                    return;
                }

                // --- ORTHO VALIDATION REQUIREMENT (Bypass if Emergency) ---
                const needsOrthoValidation = (materials && materials.length > 0);
                const isUrgent = priority === 'urgent';

                if (needsOrthoValidation && !approvals.ortho && !isEmergency) {
                    // Check if it's an unvalidated urgency within 14 days of creation
                    let isBlockedUrgency = false;
                    if (isUrgent && !doctorPriorityValidated && surgeryDate) {
                        const creationDate = createdAt ? new Date(createdAt) : new Date();
                        creationDate.setHours(0, 0, 0, 0);
                        const targetDate = new Date(surgeryDate);
                        targetDate.setHours(0, 0, 0, 0);

                        const diffTime = targetDate.getTime() - creationDate.getTime();
                        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

                        if (diffDays < 14) {
                            isBlockedUrgency = true;
                        }
                    }

                    if (!isBlockedUrgency) {
                        alert('⚠️ VALIDACIÓN REQUERIDA: Esta cirugía requiere materiales de ortopedia. Debe ser validada por el sector de Ortopedia antes de poder programarla (excepto Emergencias o Urgencias con aval médico).');
                        setSaving(false);
                        return;
                    }
                }

                // --- URGENCY PHYSICIAN VALIDATION RULE ---
                if (isUrgent && !doctorPriorityValidated && surgeryDate) {
                    const creationDate = createdAt ? new Date(createdAt) : new Date();
                    creationDate.setHours(0, 0, 0, 0);
                    const targetDate = new Date(surgeryDate);
                    targetDate.setHours(0, 0, 0, 0);

                    const diffTime = targetDate.getTime() - creationDate.getTime();
                    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

                    if (diffDays < 14) {
                        alert('⚠️ AVAL MÉDICO REQUERIDO: Las cirugías de "Urgencia" sin aval del médico interviniente no pueden programarse dentro de los 14 días posteriores a su creación.');
                        setSaving(false);
                        return;
                    }
                }

                // --- INTEGRATED Conflict Detection & Cascade Displacement ---
                // Get all events for this Day and this OR
                const { data: dayEvents, error: dayError } = await supabase
                    .from('surgeries')
                    .select('*, patients(full_name)')
                    .eq('surgery_date', surgeryDate)
                    .eq('operating_room_id', selectedOrId)
                    .neq('status', 'cancelled')
                    .order('start_time', { ascending: true });

                if (dayError) throw dayError;

                const addMinutes = (timeStr: string, minutes: number) => {
                    const [h, m] = timeStr.split(':').map(Number);
                    const d = new Date();
                    d.setHours(h, m + minutes, 0, 0);
                    return d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false });
                };

                const myId = id === 'new' ? tempId : id;
                const myDuration = Number(estimatedDuration) || 60;

                // 1. Create working list including the current surgery (simulated)
                let workingEvents = (dayEvents || [])
                    .filter(s => s.id !== myId)
                    .map(s => {
                        const start = s.start_time;
                        const dur = s.estimated_duration || 60;
                        const end = addMinutes(start, dur);
                        return { ...s, start, end };
                    });

                // Add the current one being saved
                workingEvents.push({
                    id: myId,
                    start: startTime,
                    end: addMinutes(startTime, myDuration),
                    patients: { full_name: patientName }
                } as any);

                // Sort by start time (stable sort)
                workingEvents.sort((a, b) => {
                    const diff = a.start.localeCompare(b.start);
                    if (diff !== 0) return diff;
                    // Pre-existing surgeries take priority on the same minute
                    if (a.id === myId) return 1;
                    if (b.id === myId) return -1;
                    return 0;
                });

                // 2. Identify and resolve overlaps (Cascade Displacement)
                let shiftedUpdates = [];
                for (let i = 0; i < workingEvents.length - 1; i++) {
                    const current = workingEvents[i];
                    const next = workingEvents[i + 1];

                    if (current.end.localeCompare(next.start) > 0) {
                        // OVERLAP DETECTED
                        const newNextStart = current.end;
                        const nextDuration = (next as any).estimated_duration || 60;
                        const newNextEnd = addMinutes(newNextStart, nextDuration);

                        workingEvents[i + 1] = { ...next, start: newNextStart, end: newNextEnd };

                        // If it's not the current surgery, record it for DB update
                        if (next.id !== myId) {
                            shiftedUpdates.push({ id: next.id, start_time: newNextStart, patient_name: (next as any).patients?.full_name });
                        } else {
                            // If the current surgery was the one pushed, update the form state
                            setStartTime(newNextStart);
                        }
                    }
                }

                if (shiftedUpdates.length > 0) {
                    const proceed = window.confirm(
                        `⚠️ CONFLICTO DETECTADO: El horario se superpone con otras cirugías.\n\n` +
                        `Si continúa, se desplazarán las siguientes cirugías:\n` +
                        shiftedUpdates.map(u => `• ${u.patient_name || 'Paciente'} -> ${u.start_time}`).join('\n') +
                        `\n\n¿Desea continuar con el desplazamiento en cascada?`
                    );
                    if (!proceed) {
                        setSaving(false);
                        return;
                    }

                    // Perform updates in background/parallel
                    await Promise.all(shiftedUpdates.map(async (u) => {
                        const { error: cascadeError } = await supabase
                            .from('surgeries')
                            .update({ start_time: u.start_time })
                            .eq('id', u.id);

                        if (cascadeError) throw cascadeError;

                        // Alert the displaced doctor
                        const originalS = dayEvents?.find(s => s.id === u.id);
                        if (originalS?.doctor_id) {
                            await createOrUpdateDoctorAlert({
                                surgeryId: u.id,
                                doctorId: originalS.doctor_id,
                                title: 'Agenda Desplazada',
                                message: `Su cirugía de ${u.patient_name || 'N/A'} ha sido desplazada a las ${u.start_time} debido a cambios en la agenda.`,
                                severity: surgeryDate === new Date().toISOString().split('T')[0] ? 'Urgent' : 'Warning',
                                type: 'displacement',
                                patientName: u.patient_name
                            });
                        }
                    }));
                }

            }

            // --- RE-TRIGGER PHYSICIAN ALERT FOR URGENCY (MOVED TO CENTRALIZED SERVICE) ---
            // Manual trigger removed to avoid duplication with syncSurgeryAlerts


            if (!cleanDni) {
                alert('El DNI es obligatorio para identificar al paciente.');
                setSaving(false);
                return;
            }

            let patientId;
            const { data: patientData, error: patientError } = await supabase
                .from('patients')
                .select('id')
                .eq('document_number', cleanDni)
                .maybeSingle();

            if (patientError) {
                console.error('Error finding patient:', patientError);
                throw patientError;
            }

            if (patientData) {
                patientId = patientData.id;
                // Update patient data
                const { error: updateError } = await supabase.from('patients').update({
                    full_name: patientName,
                    nuc: nuc || null,
                    medical_record_number: medicalRecordNumber || null,
                    birth_date: birthDate || null,
                    phone: phone || null,
                    address: address || null,
                    province: province || null,
                    locality: locality || null,
                    allergies: allergies || null
                }).eq('id', patientId);

                if (updateError) {
                    console.error('Error updating patient:', updateError);
                    throw updateError;
                }
            } else {
                const { data: newPatient, error: createPatientError } = await supabase
                    .from('patients')
                    .insert({
                        full_name: patientName,
                        document_number: cleanDni,
                        nuc: nuc || null,
                        medical_record_number: medicalRecordNumber || null,
                        birth_date: birthDate || null,
                        phone: phone || null,
                        address: address || null,
                        province: province || null,
                        locality: locality || null,
                        allergies: allergies || null
                    })
                    .select('id')
                    .single();

                if (createPatientError) {
                    console.error('Error creating patient:', createPatientError);
                    throw createPatientError;
                }
                patientId = newPatient.id;
            }

            // 2. Insert or Update Surgery
            const surgeryPayload: any = {
                patient_id: patientId,
                doctor_id: isNew && user?.role === 'Medico' ? user.doctorId : (selectedDoctorId || null),
                referring_doctor_id: referringDoctorId || null, // Referring Doctor
                procedure_name: selectedProcedures.join(' + '),
                diagnosis: diagnosis || null, // Save Diagnosis
                surgery_date: surgeryDate || null,
                start_time: startTime || null,
                estimated_duration: estimatedDuration || 60,
                status: finalStatus || 'pending_validation',
                priority: priority,
                is_guardia: isGuardia,
                surgery_side: surgerySide || null,
                operating_room_id: selectedOrId || null,
                anesthesia_type: anesthesiaType || null,
                anesthesiologist_id: anesthesiologistId || null,
                ortho_validated: currentApprovals.ortho,
                ortho_validation_date: currentApprovals.ortho ? (orthoValidationDate || new Date().toISOString()) : null,
                ortho_validated_by_name: currentApprovals.ortho ? (orthoValidatedByName || (!needsOrtho ? 'Sistema (No Requiere)' : (user?.name || 'Usuario Ortopedia'))) : null,
                admission_validated: approvals.admission,
                admission_validation_date: approvals.admission ? (admissionValidationDate || new Date().toISOString()) : null,
                or_validated: currentApprovals.or,
                or_validation_date: currentApprovals.or ? (orValidationDate || new Date().toISOString()) : null,
                or_validated_by_name: currentApprovals.or ? (orValidatedByName || (isTecnico ? (user?.name || 'Técnico') : 'Usuario')) : null,
                pre_op_exams: preOpExams,
                pre_op_date: preOpDate || null,
                pre_op_notes: preOpNotes || null,
                consent_signed: consentSigned,
                authorization_date: authDate || null,
                medical_coverage: medicalCoverage || null,
                internacion_notified: false,
                requires_prosthesis: requiresProsthesis,
                vendor_id: selectedVendor || null,
                doctor_priority_validated: doctorPriorityValidated,
                planned_start_time: plannedStartTime,
                planned_end_time: plannedEndTime || (startTime ? (() => {
                    const [h, m] = startTime.split(':').map(Number);
                    const date = new Date();
                    date.setHours(h, m + (estimatedDuration || 60), 0, 0);
                    return date.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
                })() : null)
            };

            let currentSurgeryId = id;
            if (isNew) {
                const { data: newSurgery, error: surgeryError } = await supabase
                    .from('surgeries')
                    .insert(surgeryPayload)
                    .select('id')
                    .single();
                if (surgeryError) throw surgeryError;
                currentSurgeryId = newSurgery.id;
            } else {
                // FIX: Perform update regardless of doctor selection
                const { error: surgeryError } = await supabase
                    .from('surgeries')
                    .update(surgeryPayload)
                    .eq('id', id);
                if (surgeryError) throw surgeryError;
            }

            // --- OPERATIONAL ALERT FOR PRIMARY DOCTOR ---
            if (selectedDoctorId) {
                const isStatusChange = originalData?.status !== finalStatus;
                const isTimeChange = originalData?.start_time !== (startTime || null) || originalData?.surgery_date !== (surgeryDate || null);

                if (isTimeChange || isStatusChange) {
                    let title = 'Cambio en Cirugía';
                    let message = `Su cirugía de ${patientName} ha sido actualizada.`;
                    let type: 'schedule_change' | 'operational_delay' | 'displacement' = 'schedule_change';
                    let severity: 'Urgent' | 'Warning' = surgeryDate === new Date().toISOString().split('T')[0] ? 'Urgent' : 'Warning';

                    if (isTimeChange) {
                        title = 'Cirugía Reprogramada';
                        message = `Su cirugía de ${patientName} ha sido reprogramada para el ${surgeryDate} a las ${startTime}.`;
                        type = 'schedule_change';
                    } else if (finalStatus === 'delayed') {
                        title = 'Cirugía Demorada';
                        message = `Su cirugía de ${patientName} se encuentra demorada.`;
                        type = 'operational_delay';
                        severity = 'Urgent';
                    }

                    await createOrUpdateDoctorAlert({
                        surgeryId: currentSurgeryId!,
                        doctorId: selectedDoctorId,
                        title,
                        message,
                        severity,
                        type,
                        patientName
                    });
                }
            }

            // 3. Sync Materials
            // Delete existing and re-insert (This handles both updates to existing and initial save of new ones)
            if (!isNew) {
                await supabase.from('surgery_materials').delete().eq('surgery_id', currentSurgeryId!);
            }

            if (materials.length > 0) {
                const materialsPayload = materials.map(m => ({
                    surgery_id: currentSurgeryId,
                    name: m.name,
                    requested_quantity: m.requestedQuantity,
                    provided_quantity: m.quantity,
                    category: m.category || 'General',
                    is_covered: m.isCovered || false,
                    is_confirmed: m.isConfirmed || false,
                    observation: m.observation || '',
                    procedure_name: m.procedureName
                }));
                const { error: matError } = await supabase.from('surgery_materials').insert(materialsPayload);
                if (matError) throw matError;
            }

            // 4. Save Staged Documents
            try {
                if (stagedDocuments.length > 0) {
                    const docsPayload = stagedDocuments.map(d => ({
                        ...d,
                        surgery_id: currentSurgeryId
                    }));
                    const { error: docsError } = await supabase.from('surgery_documents').insert(docsPayload);
                    if (docsError) throw docsError;
                }
            } catch (docError) {
                await captureError(docError, {
                    context: 'SurgeryDetail > SaveDocuments',
                    user,
                    metadata: { surgeryId: currentSurgeryId }
                });
            }

            // 5. Audit Log (Non-blocking)
            const auditAction = isNew ? 'CREATE' : 'UPDATE';
            let auditDesc = '';
            const auditMeta: any = {
                source: 'SurgeryDetail',
                patient_name: patientName,
                patient_dni: cleanDni
            };

            if (isNew) {
                const scheduledInfo = (surgeryDate && startTime) ? ` - Programada para el ${surgeryDate} a las ${startTime}` : '';
                auditDesc = `Cirugía creada para ${patientName} (DNI: ${cleanDni})${scheduledInfo}`;
            } else {
                // Calculate Diffs
                const currentDataSnapshot = {
                    surgery_date: surgeryDate || null,
                    start_time: startTime || null,
                    status: finalStatus || 'pending_validation',
                    priority: priority,
                    is_guardia: isGuardia,
                    surgery_side: surgerySide || null,
                    operating_room_id: selectedOrId || null,
                    ortho_validated: currentApprovals.ortho,
                    admission_validated: approvals.admission,
                    or_validated: approvals.or,
                    doctor_priority_validated: doctorPriorityValidated
                };

                const diffs = originalData ? getChanges(originalData, currentDataSnapshot) : [];

                if (diffs.length > 0) {
                    auditDesc = `Modificaciones en Cirugía de ${patientName}:\n` + diffs.map(d => `• ${d}`).join('\n');
                    auditMeta.diffs = diffs;
                } else {
                    auditDesc = `Actualización de cirugía de ${patientName} (Sin cambios críticos detectados)`;
                }
            }

            supabase.from('audit_logs').insert({
                user_name: user?.name || 'Usuario',
                user_role: currentUserRole,
                action: auditAction,
                resource: 'Cirugía',
                resource_id: currentSurgeryId,
                description: auditDesc,
                meta: auditMeta
            }).then(({ error }) => {
                if (error) captureError(error, { context: 'SurgeryDetail.handleSurgerySave.audit', severity: 'WARNING', user: user, metadata: { surgeryId: currentSurgeryId } });
            });

            // 6. Sync System Alerts (Hybrid Logic - Auto-resolves based on new state)
            await syncSurgeryAlerts({
                id: currentSurgeryId,
                surgery_date: surgeryDate,
                priority,
                requires_prosthesis: requiresProsthesis,
                vendor_id: selectedVendor || null,
                ortho_validated: currentApprovals.ortho,
                admission_validated: approvals.admission,
                or_validated: currentApprovals.or,
                auth_date: authDate || null,
                materials,
                patient_name: patientName,
                doctor_id: selectedDoctorId,
                doctor_priority_validated: doctorPriorityValidated
            }, [...documents, ...stagedDocuments]);

            // Update original data snapshot if we stay on page (though we navigate away currently)
            setOriginalData({
                surgery_date: surgeryDate || null,
                start_time: startTime || null,
                status: finalStatus || 'pending_validation',
                priority: priority,
                is_guardia: isGuardia,
                surgery_side: surgerySide || null,
                operating_room_id: selectedOrId || null,
                ortho_validated: currentApprovals.ortho,
                admission_validated: approvals.admission,
                or_validated: currentApprovals.or,
                doctor_priority_validated: doctorPriorityValidated
            });

            // After successful save, redirect
            if (navigationState?.isPastRegistration) {
                // If it's a past registration, redirect to detail to allow loading materials
                navigate(`/detail/${currentSurgeryId}`);
            } else {
                navigate('/surgeries');
            }
        } catch (error: any) {
            console.error('Error saving surgery:', error);
            alert('Error al guardar la cirugía: ' + (error.message || error.details || JSON.stringify(error)));
        } finally {
            setSaving(false);
        }
    };

    const handleRequestReschedule = async () => {
        if (!requestRescheduleModal.reason.trim()) return;
        setSaving(true);
        try {
            // Format suggested date if present
            const dateText = requestRescheduleModal.suggestedDate
                ? ` para el ${new Date(requestRescheduleModal.suggestedDate + 'T12:00:00').toLocaleDateString('es-AR')}`
                : '';

            // Update Surgery Table
            const { error: surgeryError } = await supabase
                .from('surgeries')
                .update({
                    reschedule_requested: true,
                    request_note: requestRescheduleModal.reason,
                    request_date: new Date().toISOString(),
                    request_user_name: user?.name || 'Enfermería'
                })
                .eq('id', id);

            if (surgeryError) throw surgeryError;

            const { error } = await supabase.from('system_alerts').insert({
                type: 'Solicitud Reprogramación',
                severity: 'Urgent',
                title: 'Solicitud de Cambio de Fecha',
                message: `${currentUserRole === 'Ortopedia' ? 'Ortopedia' : 'Enfermería'} solicita reprogramar cirugía de ${patientName}${dateText}. Motivo: ${requestRescheduleModal.reason}`,
                patient_name: patientName,
                surgery_id: id,
                target_role: 'Tecnico',
                status: 'Active'
            });

            if (error) throw error;

            alert('Solicitud enviada a Coordinación/Quirófano.');
            setRequestRescheduleModal({ isOpen: false, reason: '', suggestedDate: '' });
            fetchSurgeryDetails(id!);
        } catch (error: any) {
            console.error('Error sending request:', error);
            alert('Error al enviar solicitud: ' + error.message);
        } finally {
            setSaving(false);
        }
    };

    const handleRequestSuspension = async () => {
        if (!requestSuspensionModal.reason.trim()) return;
        setSaving(true);
        try {
            // Update Surgery Table
            const { error: surgeryError } = await supabase
                .from('surgeries')
                .update({
                    suspension_requested: true,
                    request_note: requestSuspensionModal.reason,
                    request_date: new Date().toISOString(),
                    request_user_name: user?.name || 'Enfermería'
                })
                .eq('id', id);

            if (surgeryError) throw surgeryError;

            const { error } = await supabase.from('system_alerts').insert({
                type: 'Solicitud Suspensión',
                severity: 'Urgent',
                title: 'Solicitud de Suspensión',
                message: `Enfermería solicita suspender la cirugía de ${patientName}. Motivo: ${requestSuspensionModal.reason}`,
                patient_name: patientName,
                surgery_id: id,
                target_role: 'Tecnico',
                status: 'Active'
            });

            if (error) throw error;

            alert('Solicitud de suspensión enviada a Coordinación/Quirófano.');
            setRequestSuspensionModal({ isOpen: false, reason: '' });
            fetchSurgeryDetails(id!);
        } catch (error: any) {
            console.error('Error sending suspension request:', error);
            alert('Error al enviar solicitud: ' + error.message);
        } finally {
            setSaving(false);
        }
    };

    const handleResolveRequest = async (type: 'suspension' | 'reschedule', action: 'accept' | 'reject') => {
        setSaving(true);
        try {
            const updatePayload: any = {
                request_note: null,
                request_date: null,
                request_user_name: null
            };

            if (type === 'suspension') {
                updatePayload.suspension_requested = false;
                if (action === 'accept') {
                    // This opens the actual suspension modal or applies directly
                    setSuspensionModal({ isOpen: true, reason: requestNote, observations: 'Aceptado desde solicitud de Enfermería' });
                    setSaving(false);
                    return;
                }
            } else if (type === 'reschedule') {
                updatePayload.reschedule_requested = false;
                if (action === 'accept') {
                    setRescheduleModal({ ...rescheduleModal, isOpen: true });
                    setSaving(false);
                    return;
                }
            }

            const { error } = await supabase
                .from('surgeries')
                .update(updatePayload)
                .eq('id', id);

            if (error) throw error;
            
            // Resolve alerts
            await supabase.from('system_alerts')
                .update({ status: 'Resolved', resolved_at: new Date().toISOString(), resolved_by: user?.name || 'Tecnico' })
                .eq('surgery_id', id)
                .eq('status', 'Active')
                .ilike('type', `%Solicitud%`);

            alert(action === 'reject' ? 'Solicitud rechazada y eliminada.' : 'Solicitud procesada.');
            fetchSurgeryDetails(id!);
        } catch (error: any) {
            console.error('Error resolving request:', error);
            alert('Error al procesar la solicitud');
        } finally {
            setSaving(false);
        }
    };

    const queueVendorNotification = async (surgeryId: string, status: 'suspended' | 'cancelled', reason: string) => {
        if (!selectedVendor) return;

        const vendor = availableVendors.find(v => v.id === selectedVendor);
        if (!vendor || !vendor.email) {
            console.log('Vendor has no email or is not selected');
            return;
        }

        try {
            const doctorName = doctors.find(d => d.id === selectedDoctorId)?.full_name || 'N/A';
            const { error } = await supabase
                .from('email_notifications')
                .insert({
                    recipient_email: vendor.email,
                    subject: `Aviso de Cirugía ${status === 'suspended' ? 'Suspendida' : 'Cancelada'}: ${patientName}`,
                    message: `La cirugía de ${patientName} DNI: ${documentNumber} (${selectedProcedures.join(', ')}) ha sido ${status === 'suspended' ? 'suspendida' : 'cancelada'}.\n\nDetalles:\n- Fecha: ${surgeryDate}\n- Hora: ${startTime}\n- Médico: ${doctorName}\n- Motivo/Obs: ${reason}\n\nEste es un mensaje automático del Sistema de Coordinación de Quirófanos.`,
                    metadata: {
                        surgery_id: surgeryId,
                        patient_name: patientName,
                        doctor_name: doctorName,
                        action_type: status
                    }
                });

            if (error) throw error;
            console.log(`Email notification queued for vendor: ${vendor.name} (${vendor.email})`);
        } catch (error) {
            console.error('Error queuing email notification:', error);
            // Non-blocking
        }
    };

    const handleSuspend = async () => {
        if (isNew || !id) return;

        // Security reinforcement in code
        const allowedRoles = ['SuperAdmin', 'Tecnico', 'DireccionMedica'];
        if (!allowedRoles.includes(currentUserRole)) {
            alert('No tiene permisos para suspender cirugías.');
            return;
        }

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
                .eq('id', id);

            if (error) throw error;

            // --- VENDOR NOTIFICATION ---
            await queueVendorNotification(id, 'suspended', suspensionModal.reason + (suspensionModal.observations ? ` - ${suspensionModal.observations}` : ''));

            // --- OPERATIONAL ALERT FOR DOCTOR ---
            if (selectedDoctorId) {
                await createOrUpdateDoctorAlert({
                    surgeryId: id,
                    doctorId: selectedDoctorId,
                    title: 'Cirugía Suspendida',
                    message: `Su cirugía de ${patientName} ha sido susp/canc. Motivo: ${suspensionModal.reason}`,
                    severity: 'Urgent',
                    type: 'operational_delay',
                    patientName
                });
            }

            // Audit Log (Non-blocking)
            supabase.from('audit_logs').insert({
                user_name: user?.name || user?.email || 'Usuario Actual',
                user_role: currentUserRole,
                action: 'STATUS_CHANGE',
                resource: 'Cirugía',
                resource_id: id,
                description: `Cirugía suspendida/cancelada. Motivo: ${suspensionModal.reason}. Obs: ${suspensionModal.observations}`,
                meta: { source: 'SurgeryDetail' }
            }).then(({ error }) => {
                if (error) captureError(error, { context: 'SurgeryDetail.handleSuspend.audit', severity: 'WARNING', user: user, metadata: { surgeryId: id } });
            });

            setSuspensionModal({ ...suspensionModal, isOpen: false });
            fetchSurgeryDetails(id);
            alert('Cirugía procesada correctamente');
        } catch (err) {
            console.error('Error in handleSuspend:', err);
            alert('Error al suspender/cancelar la cirugía');
        }
    };

    const handleReschedule = async () => {
        if (isNew || !id || !rescheduleModal.newDate || !rescheduleModal.newTime) return;

        // Security reinforcement in code
        const allowedRoles = ['SuperAdmin', 'Tecnico', 'DireccionMedica'];
        if (!allowedRoles.includes(currentUserRole)) {
            alert('No tiene permisos para reprogramar cirugías.');
            return;
        }

        try {
            setSaving(true);

            // --- INTEGRATED Conflict Detection & Cascade Displacement ---
            const { data: dayEvents, error: dayError } = await supabase
                .from('surgeries')
                .select('*, patients(full_name)')
                .eq('surgery_date', rescheduleModal.newDate)
                .eq('operating_room_id', selectedOrId)
                .neq('status', 'cancelled')
                .order('start_time', { ascending: true });

            if (dayError) throw dayError;

            const addMinutesHelper = (timeStr: string, minutes: number) => {
                const [h, m] = timeStr.split(':').map(Number);
                const d = new Date();
                d.setHours(h, m + minutes, 0, 0);
                return d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false });
            };

            const myDuration = Number(estimatedDuration) || 60;

            // 1. Create working list including the current surgery (simulated)
            let workingEvents = (dayEvents || [])
                .filter(s => s.id !== id)
                .map(s => {
                    const start = s.start_time;
                    const dur = s.estimated_duration || 60;
                    const end = addMinutesHelper(start, dur);
                    return { ...s, start, end };
                });

            // Add the current one being rescheduled
            workingEvents.push({
                id: id,
                start: rescheduleModal.newTime,
                end: addMinutesHelper(rescheduleModal.newTime, myDuration),
                patients: { full_name: patientName }
            } as any);

            // Sort by start time (stable sort)
            workingEvents.sort((a, b) => {
                const diff = (a.start as string).localeCompare(b.start as string);
                if (diff !== 0) return diff;
                // Pre-existing surgeries take priority on the same minute
                if (a.id === id) return 1;
                if (b.id === id) return -1;
                return 0;
            });

            // 2. Identify and resolve overlaps (Cascade Displacement)
            let shiftedUpdates = [];
            for (let i = 0; i < workingEvents.length - 1; i++) {
                const current = workingEvents[i];
                const next = workingEvents[i + 1];

                if ((current.end as string).localeCompare(next.start as string) > 0) {
                    // OVERLAP DETECTED
                    const newNextStart = current.end as string;
                    const nextDuration = (next as any).estimated_duration || 60;
                    const newNextEnd = addMinutesHelper(newNextStart, nextDuration);

                    workingEvents[i + 1] = { ...next, start: newNextStart, end: newNextEnd };

                    // If it's not the current surgery, record it for DB update
                    if (next.id !== id) {
                        shiftedUpdates.push({ id: next.id, start_time: newNextStart, patient_name: (next as any).patients?.full_name });
                    } else {
                        // If the current surgery was the one pushed
                        rescheduleModal.newTime = newNextStart;
                    }
                }
            }

            if (shiftedUpdates.length > 0) {
                const proceed = window.confirm(
                    `⚠️ CONFLICTO DETECTADO: El nuevo horario se superpone con otras cirugías.\n\n` +
                    `Si continúa, se desplazarán las siguientes cirugías:\n` +
                    shiftedUpdates.map(u => `• ${u.patient_name || 'Paciente'} -> ${u.start_time}`).join('\n') +
                    `\n\n¿Desea continuar con el desplazamiento en cascada?`
                );
                if (!proceed) {
                    setSaving(false);
                    return;
                }

                // Perform updates for shifted surgeries
                await Promise.all(shiftedUpdates.map(async (u) => {
                    const { error: cascadeError } = await supabase
                        .from('surgeries')
                        .update({ start_time: u.start_time })
                        .eq('id', u.id);

                    if (cascadeError) throw cascadeError;

                    // Alert the displaced doctor
                    const originalS = dayEvents?.find(s => s.id === u.id);
                    if (originalS?.doctor_id) {
                        await createOrUpdateDoctorAlert({
                            surgeryId: u.id,
                            doctorId: originalS.doctor_id,
                            title: 'Agenda Desplazada',
                            message: `Su cirugía de ${u.patient_name || 'N/A'} ha sido desplazada a las ${u.start_time} debido a reprogramaciones en la agenda.`,
                            severity: rescheduleModal.newDate === new Date().toISOString().split('T')[0] ? 'Urgent' : 'Warning',
                            type: 'displacement',
                            patientName: u.patient_name
                        });
                    }
                }));
            }

            const { error } = await supabase
                .from('surgeries')
                .update({
                    surgery_date: rescheduleModal.newDate,
                    start_time: rescheduleModal.newTime,
                    status: 'scheduled',
                    or_validated: currentUserRole === 'Tecnico' ? true : approvals.or,
                    or_validation_date: currentUserRole === 'Tecnico' ? new Date().toISOString() : orValidationDate,
                    or_validated_by_name: currentUserRole === 'Tecnico' ? (user?.name || 'Técnico') : orValidatedByName
                })
                .eq('id', id);

            if (error) throw error;

            // --- CLEAR PENDING RESCHEDULE ALERTS ---
            await supabase
                .from('system_alerts')
                .update({ status: 'Resolved' })
                .eq('surgery_id', id)
                .eq('type', 'Solicitud Reprogramación');

            // --- OPERATIONAL ALERT FOR DOCTOR ---
            if (selectedDoctorId) {
                await createOrUpdateDoctorAlert({
                    surgeryId: id,
                    doctorId: selectedDoctorId,
                    title: 'Cirugía Reprogramada',
                    message: `Su cirugía de ${patientName} ha sido reprogramada para el ${rescheduleModal.newDate} a las ${rescheduleModal.newTime}.`,
                    severity: rescheduleModal.newDate === new Date().toISOString().split('T')[0] ? 'Urgent' : 'Warning',
                    type: 'schedule_change',
                    patientName
                });
            }

            // Audit Log (Non-blocking)
            supabase.from('audit_logs').insert({
                user_name: user?.name || user?.email || 'Usuario Actual',
                user_role: currentUserRole,
                action: 'UPDATE',
                resource: 'Cirugía',
                resource_id: id,
                description: `Cirugía reprogramada para el ${rescheduleModal.newDate} a las ${rescheduleModal.newTime}`,
                meta: { source: 'SurgeryDetail' }
            }).then(({ error }) => {
                if (error) captureError(error, { context: 'SurgeryDetail.handleReschedule.audit', severity: 'WARNING', user: user, metadata: { surgeryId: id } });
            });

            setRescheduleModal({ ...rescheduleModal, isOpen: false });
            fetchSurgeryDetails(id);
            alert('Cirugía reprogramada correctamente');
        } catch (err) {
            console.error('Error rescheduling surgery:', err);
            alert('Error al reprogramar la cirugía');
        }
    };

    const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
        if (!event.target.files || event.target.files.length === 0) return;
        setUploading(true);
        setUploadProgress(10);

        const file = event.target.files[0];
        const fileExt = file.name.split('.').pop();
        const folderId = isNew ? `pending-${tempId}` : id;
        const fileName = `${folderId}/${Date.now()}.${fileExt}`;
        const filePath = `${fileName}`;

        try {
            // 1. Upload to Storage
            const { error: uploadError } = await supabase.storage
                .from('documents')
                .upload(filePath, file);

            if (uploadError) throw uploadError;
            setUploadProgress(60);

            // 2. Prepare Metadata
            const selectedCat = DOCUMENT_CATEGORIES.find(c => c.id === uploadCategory);
            const docMetadata = {
                name: file.name,
                type: selectedCat?.name || 'Otro',
                category: uploadCategory,
                file_path: filePath,
                uploaded_by: user?.id
            };

            if (isNew) {
                // Stage for later
                const localDoc: SurgeryDocument = {
                    id: crypto.randomUUID(), // Temp ID for list
                    ...docMetadata,
                    created_at: new Date().toISOString()
                };
                setStagedDocuments(prev => [...prev, docMetadata]);
                setDocuments(prev => [localDoc, ...prev]);
            } else {
                // Save immediately
                const { error: dbError } = await supabase
                    .from('surgery_documents')
                    .insert({
                        ...docMetadata,
                        surgery_id: id
                    });

                if (dbError) throw dbError;

                // Audit Log (Non-blocking)
                supabase.from('audit_logs').insert({
                    user_name: user?.name || 'Usuario',
                    user_role: currentUserRole,
                    action: 'UPLOAD_DOCUMENT',
                    resource: 'Cirugía',
                    resource_id: id,
                    description: `Documento subido: ${file.name} (${selectedCat?.name})`,
                    meta: {
                        source: 'SurgeryDetail',
                        file_path: filePath
                    }
                }).then(({ error }) => {
                    if (error) captureError(error, { context: 'SurgeryDetail.handleFileUpload.audit', severity: 'WARNING', user: user, metadata: { surgeryId: id } });
                });

                await fetchDocuments(id!);
            }

            setUploadProgress(100);

            // Reset state
            setTimeout(() => {
                setUploadProgress(0);
                setUploadCategory('other');
            }, 1000);
        } catch (error) {
            console.error('Error uploading:', error);
            alert('Error al subir el documento: ' + (error instanceof Error ? error.message : 'Error desconocido'));
            setUploadProgress(0);
        } finally {
            setUploading(false);
        }
    };

    const handleDeleteDocument = async (docId: string, filePath: string) => {
        if (!confirm('¿Seguro que desea eliminar este documento?')) return;
        try {
            const { error: storageError } = await supabase.storage
                .from('documents')
                .remove([filePath]);

            if (storageError) throw storageError;

            if (isNew) {
                // Remove from staged and local view
                setStagedDocuments(prev => prev.filter(d => d.file_path !== filePath));
                setDocuments(prev => prev.filter(d => d.id !== docId));
            } else {
                // Delete from DB
                const { error: dbError } = await supabase
                    .from('surgery_documents')
                    .delete()
                    .eq('id', docId);

                if (dbError) throw dbError;

                // Audit Log (Non-blocking)
                supabase.from('audit_logs').insert({
                    user_name: user?.name || 'Usuario',
                    user_role: currentUserRole,
                    action: 'DELETE_DOCUMENT',
                    resource: 'Cirugía',
                    resource_id: id,
                    description: `Documento eliminado`,
                    meta: {
                        source: 'SurgeryDetail',
                        deleted_file_path: filePath
                    }
                }).then(({ error }) => {
                    if (error) captureError(error, { context: 'SurgeryDetail.handleDeleteDocument.audit', severity: 'WARNING', user: user, metadata: { surgeryId: id } });
                });

                if (id) await fetchDocuments(id);
            }
        } catch (error) {
            console.error('Error deleting:', error);
            alert('Error al eliminar el documento');
        }
    };

    const getFileUrl = (path: string) => {
        const { data } = supabase.storage.from('documents').getPublicUrl(path);
        return data.publicUrl;
    };


    // --- BUSINESS LOGIC FOR VALIDATION & ALERTS ---

    // Safe date parser to avoid timezone issues with YYYY-MM-DD strings
    const parseLocalYMD = (dateStr: string) => {
        if (!dateStr) return null;
        const parts = dateStr.split('-');
        if (parts.length !== 3) return null;
        const year = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10) - 1; // JS months are 0-based
        const day = parseInt(parts[2], 10);
        return new Date(year, month, day);
    }

    const getDaysRemaining = (targetDateStr: string) => {
        if (!targetDateStr) return null;
        const target = parseLocalYMD(targetDateStr);
        if (!target) return null;
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const diffTime = target.getTime() - today.getTime();
        return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    };

    // LOGIC 1: ORTHOPEDICS ALERT (Prosthesis)
    const getProsthesisAlert = () => {
        if (!vendorRequiresValidation) return null; // Bypass alerts if vendor doesn't require validation
        if (!requiresProsthesis) return null;
        if (areAllMaterialsConfirmed) return null; // Logic stops if everything is confirmed
        if (!surgeryDate) return null;

        const days = getDaysRemaining(surgeryDate);
        if (days === null) return null;

        // Condition A: 0-14 days (Urgent)
        if (days >= 0 && days <= 14) {
            return {
                level: 'urgent', // Red
                message: `URGENTE: Faltan ${days} días. El plazo de gestión (14 días) está vencido. Actúe de inmediato.`
            };
        }

        // Condition B: 15-21 days (Warning)
        if (days > 14 && days <= 21) {
            return {
                level: 'warning', // Yellow
                message: `PLANIFICACIÓN: Faltan ${days} días. Inicie la gestión de prótesis con tiempo.`
            };
        }

        return null;
    };

    // LOGIC 2: ADMISSION ALERT (Pre-op Exams)
    const getAdmissionAlert = () => {
        if (preOpExams) return null; // Logic stops if exams are checked
        if (!surgeryDate) return null;

        // Only show to Internacion or SuperAdmin
        if (currentUserRole !== 'Internacion' && currentUserRole !== 'SuperAdmin') return null;

        const days = getDaysRemaining(surgeryDate);
        if (days === null) return null;

        // Condition B: 0-3 days (Critical / Cancellation)
        if (days >= 0 && days <= 3) {
            return {
                level: 'critical', // Black/Dark Red
                message: `ACCIÓN REQUERIDA: Faltan ${days} días. Sin pre-quirúrgicos. Solicite CANCELACIÓN o REPROGRAMACIÓN.`
            };
        }

        // Condition A: 4-7 days (Urgent)
        if (days > 3 && days <= 7) {
            return {
                level: 'urgent', // Red
                message: `URGENTE: Faltan ${days} días. No hay pre-quirúrgicos validados.`
            };
        }

        return null;
    };

    const checkDateValidity = () => {
        const surg = parseLocalYMD(surgeryDate);
        const exam = parseLocalYMD(preOpDate);

        if (!surg || !exam) return false;

        if (exam.getTime() > surg.getTime()) return false;

        const diffTime = surg.getTime() - exam.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        return diffDays <= 30;
    };

    // Helper to check permission and logic
    const canToggle = (type: 'ortho' | 'admission' | 'or', ignoreRole = false) => {
        // 1. Check Role Permission
        let hasRole = false;
        if (currentUserRole === 'SuperAdmin') hasRole = true;
        else if (type === 'ortho' && currentUserRole === 'Ortopedia') hasRole = true;
        else if (type === 'admission') {
            const selectedProvider = availableCoverages.find(c => c.name === medicalCoverage);
            const isART = selectedProvider?.type === 'ART' || (medicalCoverage && medicalCoverage.toUpperCase().includes('ART'));

            if (isART) {
                if (currentUserRole === 'Oficina ART') hasRole = true;
            } else {
                if (currentUserRole === 'Internacion') hasRole = true;
            }
        }
        else if (type === 'or' && (currentUserRole === 'Quirofano' || currentUserRole === 'Tecnico')) hasRole = true;

        if (!hasRole && !ignoreRole) return false;

        // 2. Special Logic for Admission (Internación)
        if (type === 'admission') {
            if (!preOpExams) return false;
            if (!consentSigned) return false;
            // Rule: Internación can validate without surgeryDate. 
            // If date exists, it must be valid for the sector to be "confirmed", 
            // but the user wants it to be toggleable regardless of date presence.
            // However, we'll keep the date validity check ONLY if both dates exist.
            if (surgeryDate && preOpDate && !checkDateValidity()) return false;
        }

        // 3. Special Logic for Orthopedia
        if (type === 'ortho') {
            // Disable manual toggle if vendor does not require validation (it's auto-validated)
            if (!vendorRequiresValidation) return false;
            // MUST have materials validated individually
            if (materials.length > 0 && !areAllMaterialsConfirmed) return false;
        }

        return true;
    };

    // Helper error texts
    const getAdmissionErrorText = () => {
        if (currentUserRole !== 'Internacion' && currentUserRole !== 'SuperAdmin') return null;
        if (approvals.admission) return null;

        if (!preOpExams) return "Falta: Exámenes Pre-Qx";
        if (!consentSigned) return "Falta: Firma Consentimiento";
        // removed !surgeryDate requirement
        if (!preOpDate) return "Falta: Fecha de Exámenes";

        const validDates = checkDateValidity();
        if (!validDates) {
            const surg = parseLocalYMD(surgeryDate);
            const exam = parseLocalYMD(preOpDate);
            if (surg && exam && exam > surg) return "Error: Exámenes posteriores a cirugía";
            return "Error: Exámenes vencidos (>30 días)";
        }

        return null;
    };

    const getOrthoErrorText = () => {
        if (currentUserRole !== 'Ortopedia' && currentUserRole !== 'SuperAdmin') return null;
        if (approvals.ortho) return null;

        if (materials.length > 0 && !areAllMaterialsConfirmed) {
            const pending = materials.filter(m => !m.isConfirmed).length;
            return `Falta validar ${pending} ítem(s) en la lista de materiales`;
        }
        return null;
    };

    const prosthesisAlert = getProsthesisAlert();
    const admissionAlert = getAdmissionAlert();

    return (
        <div className="flex-1 h-full overflow-y-auto bg-slate-50 p-6 pb-24 relative font-sans">
            <ProgressBar isLoading={loading || saving} />

            {/* DEV TOOL: Role Switcher (DISABLED: use Sidebar) */}
            {/* 
            <div className="fixed bottom-4 right-4 z-50 bg-slate-800 text-white p-2 rounded-lg shadow-lg opacity-90 hover:opacity-100 transition-opacity flex items-center gap-2 text-xs border border-slate-600">
                ... 
            </div>
            */}

            <div className="max-w-7xl mx-auto">
                {/* Navigation Breadcrumb - Minimal */}
                <nav className="flex items-center gap-2 text-xs text-slate-500 mb-4">
                    <button
                        onClick={() => navigate(-1)}
                        className="hover:text-slate-900 flex items-center gap-1 transition-colors"
                    >
                        <span className="material-symbols-outlined text-sm">arrow_back</span>
                        Atrás
                    </button>
                    <span className="text-slate-300">/</span>
                    <span>{isNew ? 'Nueva Cirugía' : 'Detalle'}</span>
                </nav>

                {navigationState?.isPastRegistration && (
                    <div className="mb-6 p-4 bg-indigo-600 rounded-xl shadow-lg shadow-indigo-100 flex items-center gap-4 text-white animate-in slide-in-from-top-4 duration-500">
                        <div className="size-10 bg-white/20 rounded-full flex items-center justify-center shrink-0">
                            <span className="material-symbols-outlined text-2xl">emergency</span>
                        </div>
                        <div>
                            <h4 className="font-black uppercase tracking-widest text-xs">Registro de Cirugía Pasada / Urgencia</h4>
                            <p className="text-[11px] font-bold text-indigo-100 mt-0.5 leading-relaxed">
                                Usted está registrando una cirugía que ya se realizó. Complete los datos básicos y guarde para poder cargar los materiales consumidos en la <strong className="text-white underline decoration-white/30 decoration-2 underline-offset-2">Ficha Técnica</strong>.
                            </p>
                        </div>
                    </div>
                )}

                {/* PENDING REQUESTS WARNING BANNER */}
                {(suspensionRequested || rescheduleRequested) && (currentUserRole === 'Tecnico' || currentUserRole === 'SuperAdmin') && (
                    <div className={`mb-6 p-5 rounded-2xl shadow-xl border-2 flex flex-col md:flex-row items-center gap-5 animate-in slide-in-from-top-4 duration-500
                        ${suspensionRequested ? 'bg-amber-50 border-amber-200 shadow-amber-100' : 'bg-indigo-50 border-indigo-200 shadow-indigo-100'}`}>
                        <div className={`size-14 rounded-full flex items-center justify-center shrink-0 shadow-inner
                            ${suspensionRequested ? 'bg-amber-100 text-amber-600' : 'bg-indigo-100 text-indigo-600'}`}>
                            <span className="material-symbols-outlined text-3xl font-bold">
                                {suspensionRequested ? 'report_problem' : 'event_repeat'}
                            </span>
                        </div>
                        <div className="flex-1 text-center md:text-left">
                            <h4 className={`font-black uppercase tracking-widest text-xs mb-1
                                ${suspensionRequested ? 'text-amber-800' : 'text-indigo-800'}`}>
                                ATENCIÓN: SOLICITUD DE {suspensionRequested ? 'SUSPENSIÓN' : 'REPROGRAMACIÓN'} PENDIENTE
                            </h4>
                            <p className="text-sm font-bold text-slate-700 leading-tight">
                                {requestUserName} solicita {suspensionRequested ? 'suspender' : 'reprogramar'} esta cirugía.
                            </p>
                            {requestNote && (
                                <p className="text-xs italic text-slate-500 mt-2 bg-white/50 p-2 rounded-lg border border-slate-200 inline-block">
                                    " {requestNote} "
                                </p>
                            )}
                        </div>
                        <div className="flex gap-3 shrink-0">
                            <button 
                                onClick={() => handleResolveRequest(suspensionRequested ? 'suspension' : 'reschedule', 'reject')}
                                className="px-5 py-2.5 bg-white text-slate-600 hover:bg-slate-100 border border-slate-200 rounded-xl font-black text-xs uppercase tracking-widest shadow-sm transition-all active:scale-95"
                            >
                                Rechazar
                            </button>
                            <button 
                                onClick={() => handleResolveRequest(suspensionRequested ? 'suspension' : 'reschedule', 'accept')}
                                className={`px-6 py-2.5 text-white rounded-xl font-black text-xs uppercase tracking-widest shadow-lg transition-all active:scale-95
                                    ${suspensionRequested ? 'bg-amber-600 hover:bg-amber-700 shadow-amber-200' : 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-200'}`}>
                                Aceptar
                            </button>
                        </div>
                    </div>
                )}

                {/* HEADER CARD - REDESIGNED v2.1.8 */}
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
                                        <h1 className="text-lg font-black text-slate-900 tracking-tight leading-none">
                                            {isNew ? 'Nueva Solicitud' : (patientName || 'Sin Nombre')}
                                        </h1>
                                        {!isNew && id && id !== 'new' && (
                                            <div className="flex items-center gap-1">
                                                <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-mono font-bold bg-slate-100 text-slate-500 border border-slate-200" title={`Código de Cirugía Completo: ${id}`}>
                                                    #{id.split('-')[0].toUpperCase()}
                                                </span>
                                                <button 
                                                    onClick={handleCopyId}
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
                                                    ${status === 'suspended' ? 'bg-amber-100 text-amber-700 border-amber-200 shadow-sm shadow-amber-50' :
                                                        isScheduled ? 'bg-emerald-100 text-emerald-700 border-emerald-200 shadow-sm shadow-emerald-50' :
                                                            'bg-orange-100 text-orange-700 border-orange-200 shadow-sm shadow-orange-50'}`}>
                                                    {status === 'suspended' ? 'Supendida' : (isScheduled ? 'Programada' : 'Pendiente')}
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
                                            onClick={() => setRequestRescheduleModal({ ...requestRescheduleModal, isOpen: true })}
                                            className="group flex items-center gap-2 px-3 py-2 bg-indigo-50 text-indigo-700 hover:bg-indigo-600 hover:text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border border-indigo-200 hover:border-indigo-600 shadow-sm active:scale-95"
                                            disabled={rescheduleRequested || suspensionRequested}
                                        >
                                            <span className="material-symbols-outlined text-base group-hover:rotate-12 transition-transform">event_repeat</span>
                                            {rescheduleRequested ? 'Reprog. Solicitada' : 'Reprogramar'}
                                        </button>
                                        <button
                                            onClick={() => setRequestSuspensionModal({ ...requestSuspensionModal, isOpen: true })}
                                            className="group flex items-center gap-2 px-3 py-2 bg-amber-50 text-amber-700 hover:bg-amber-600 hover:text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border border-amber-200 hover:border-amber-600 shadow-sm active:scale-95"
                                            disabled={rescheduleRequested || suspensionRequested}
                                        >
                                            <span className="material-symbols-outlined text-base group-hover:scale-110 transition-transform">report_problem</span>
                                            {suspensionRequested ? 'Susp. Solicitada' : 'Suspender'}
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
                                                onChange={handleToggleInternacion}
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
                                    {!isNew && (currentUserRole === 'SuperAdmin' || currentUserRole === 'Tecnico' || currentUserRole === 'Internacion') && (
                                        <button 
                                            onClick={() => window.open(`/#/print-wristband/${id}`, '_blank')}
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
                                onClick={() => setPriority('elective')}
                                className={`px-2 py-0.5 rounded transition-colors ${priority === 'elective' ? 'bg-white text-slate-900 font-medium shadow-sm border border-slate-200' : 'text-slate-500 hover:text-slate-700'} ${(isReadOnly || currentUserRole === 'Tecnico' || currentUserRole === 'Ortopedia') ? 'opacity-50 pointer-events-none' : ''}`}
                                disabled={isReadOnly || currentUserRole === 'Tecnico' || currentUserRole === 'Ortopedia'}
                            >Programada</button>
                            <button
                                type="button"
                                onClick={() => setPriority('urgent')}
                                className={`px-2 py-0.5 rounded transition-colors ${priority === 'urgent' ? 'bg-orange-50 text-orange-700 font-medium border border-orange-100' : 'text-slate-500 hover:text-slate-700'} ${(isReadOnly || currentUserRole === 'Tecnico' || currentUserRole === 'Ortopedia') ? 'opacity-50 pointer-events-none' : ''}`}
                                disabled={isReadOnly || currentUserRole === 'Tecnico' || currentUserRole === 'Ortopedia'}
                            >Urgencia</button>
                            <button
                                type="button"
                                onClick={() => setPriority('emergency')}
                                className={`px-2 py-0.5 rounded transition-colors ${priority === 'emergency' ? 'bg-red-50 text-red-700 font-medium border border-red-100' : 'text-slate-500 hover:text-slate-700'} ${(isReadOnly || currentUserRole === 'Tecnico' || currentUserRole === 'Ortopedia') ? 'opacity-50 pointer-events-none' : ''}`}
                                disabled={isReadOnly || currentUserRole === 'Tecnico' || currentUserRole === 'Ortopedia'}
                            >Emergencia</button>
                        </div>

                        {priority === 'urgent' && (
                            <div className="flex items-center gap-2 ml-2 pl-4 border-l border-slate-200">
                                <label className="flex items-center gap-2 cursor-pointer bg-orange-100/50 px-3 py-1 rounded-full border border-orange-200 transition-all hover:bg-orange-100">
                                    <input
                                        type="checkbox"
                                        checked={doctorPriorityValidated}
                                        onChange={(e) => setDoctorPriorityValidated(e.target.checked)}
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
                    </div>
                </div>

                {/* TOP ROW: CLINICAL & LOGISTICS */}
                <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 mb-6">

                    {/* LEFT: Patient & Clinical (8 cols) */}
                    <div className="xl:col-span-8 flex flex-col gap-6">

                        {/* Section 1: Patient Data */}
                        <section className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
                            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center">
                                <h3 className="text-sm font-bold text-slate-900">Datos del Paciente</h3>
                                {isNew && (
                                    <span
                                        onClick={() => patientInputRef.current?.focus()}
                                        className="text-xs font-medium text-primary cursor-pointer hover:underline"
                                    >
                                        + Crear Paciente
                                    </span>
                                )}
                            </div>
                            <div className="p-6">
                                {isNew && (
                                    <div className="mb-6 relative">
                                        <label className="block text-xs font-semibold text-slate-500 mb-2">Buscar Paciente Existente</label>
                                        <div className="relative">
                                            <span className="material-symbols-outlined absolute left-3 top-2.5 text-slate-400 text-lg">search</span>
                                            <input
                                                type="text"
                                                className="w-full pl-9 pr-4 py-2 rounded border border-slate-300 focus:border-primary focus:ring-1 focus:ring-primary text-sm transition-all outline-none"
                                                placeholder="Ingrese Nombre, Cédula o Historia Clínica..."
                                                value={patientSearchTerm}
                                                onChange={(e) => handlePatientSearch(e.target.value)}
                                                disabled={isReadOnly || currentUserRole === 'Tecnico' || currentUserRole === 'Ortopedia'}
                                            />
                                            {isSearchingPatient && (
                                                <div className="absolute right-3 top-2.5">
                                                    <div className="size-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin"></div>
                                                </div>
                                            )}
                                        </div>

                                        {/* Dropdown de Resultados */}
                                        {patientSearchResults.length > 0 && (
                                            <div className="absolute z-50 w-full mt-1 bg-white border border-slate-200 rounded-lg shadow-xl max-h-60 overflow-y-auto">
                                                {patientSearchResults.map((p) => (
                                                    <div
                                                        key={p.id}
                                                        className="px-4 py-3 hover:bg-slate-50 cursor-pointer border-b border-slate-100 last:border-0"
                                                        onClick={() => handleSelectPatient(p)}
                                                    >
                                                        <div className="flex justify-between items-center">
                                                            <div>
                                                                <p className="text-sm font-bold text-slate-900">{p.full_name}</p>
                                                                <p className="text-xs text-slate-500">DNI: {p.document_number} | HC: {p.medical_record_number || 'N/A'}</p>
                                                            </div>
                                                            <span className="material-symbols-outlined text-slate-300">chevron_right</span>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                        {patientSearchTerm.length > 2 && !isSearchingPatient && patientSearchResults.length === 0 && (
                                            <div className="absolute z-50 w-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg px-4 py-3 text-sm text-slate-500 italic">
                                                No se encontraron pacientes que coincidan.
                                            </div>
                                        )}
                                    </div>
                                )}

                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
                                    <div className="lg:col-span-2">
                                        <label className="block text-xs font-semibold text-slate-500 mb-1.5">Nombre Completo</label>
                                        <input
                                            ref={patientInputRef}
                                            className="w-full rounded border border-slate-200 bg-slate-50 text-slate-900 focus:border-primary focus:ring-1 focus:ring-primary text-sm px-3 py-2"
                                            type="text"
                                            value={patientName}
                                            onChange={(e) => setPatientName(e.target.value)}
                                            placeholder="Nombre del paciente"
                                            disabled={isReadOnly || currentUserRole === 'Tecnico' || currentUserRole === 'Ortopedia'}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-semibold text-slate-500 mb-1.5">NUC (Carpeta)</label>
                                        <input className="w-full rounded border border-slate-200 bg-slate-50 text-slate-900 focus:border-primary focus:ring-1 focus:ring-primary text-sm px-3 py-2 disabled:bg-slate-100 disabled:text-slate-500" type="number" value={nuc} onChange={(e) => setNuc(e.target.value)} placeholder="Nº Carpeta" disabled={isReadOnly || currentUserRole === 'Tecnico' || currentUserRole === 'Ortopedia'} />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-semibold text-slate-500 mb-1.5">Historia Clínica</label>
                                        <input
                                            className="w-full rounded border border-slate-200 bg-slate-50 text-slate-900 focus:border-primary focus:ring-1 focus:ring-primary text-sm px-3 py-2"
                                            type="text"
                                            value={medicalRecordNumber}
                                            onChange={(e) => setMedicalRecordNumber(e.target.value)}
                                            placeholder="Nº HC"
                                            disabled={isReadOnly || currentUserRole === 'Tecnico' || currentUserRole === 'Ortopedia'}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-semibold text-slate-500 mb-1.5">DNI</label>
                                        <input
                                            className="w-full rounded border border-slate-200 bg-slate-50 text-slate-900 focus:border-primary focus:ring-1 focus:ring-primary text-sm px-3 py-2"
                                            type="text"
                                            value={documentNumber}
                                            onChange={(e) => setDocumentNumber(e.target.value)}
                                            placeholder="Nº Documento"
                                            disabled={isReadOnly || currentUserRole === 'Tecnico' || currentUserRole === 'Ortopedia'}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-semibold text-slate-500 mb-1.5">Fecha Nacimiento</label>
                                        <div className="relative">
                                            <input
                                                className="w-full rounded border border-slate-200 bg-slate-50 text-slate-900 focus:border-primary focus:ring-1 focus:ring-primary text-sm px-3 py-2"
                                                type="date"
                                                value={birthDate}
                                                onChange={(e) => setBirthDate(e.target.value)}
                                                disabled={isReadOnly || currentUserRole === 'Tecnico' || currentUserRole === 'Ortopedia'}
                                            />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-semibold text-slate-500 mb-1.5">Edad</label>
                                        <input
                                            className="w-full rounded border border-slate-200 bg-slate-100 text-slate-500 text-sm font-medium px-3 py-2"
                                            readOnly
                                            type="text"
                                            value={patientAge !== null ? `${patientAge} años` : ''}
                                            placeholder="--"
                                        />
                                    </div>

                                    {/* Contact Fields */}
                                    <div>
                                        <label className="block text-xs font-semibold text-slate-500 mb-1.5">Teléfono</label>
                                        <input className="w-full rounded border border-slate-200 bg-slate-50 text-slate-900 focus:border-primary focus:ring-1 focus:ring-primary text-sm px-3 py-2 disabled:bg-slate-100 disabled:text-slate-500" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Teléfono / Celular" disabled={isReadOnly || currentUserRole === 'Tecnico' || currentUserRole === 'Ortopedia'} />
                                    </div>
                                    <div className="md:col-span-2">
                                        <label className="block text-xs font-semibold text-slate-500 mb-1.5">Domicilio</label>
                                        <input className="w-full rounded border border-slate-200 bg-slate-50 text-slate-900 focus:border-primary focus:ring-1 focus:ring-primary text-sm px-3 py-2 disabled:bg-slate-100 disabled:text-slate-500" type="text" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Calle, Altura, Piso..." disabled={isReadOnly || currentUserRole === 'Tecnico' || currentUserRole === 'Ortopedia'} />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-semibold text-slate-500 mb-1.5">Provincia</label>
                                        <div className="relative">
                                            <input
                                                list="provinces-list"
                                                className="w-full rounded border border-slate-200 bg-slate-50 text-slate-900 focus:border-primary focus:ring-1 focus:ring-primary text-sm px-3 py-2"
                                                value={province}
                                                onChange={(e) => {
                                                    setProvince(e.target.value);
                                                    setLocality(''); // Reset locality on change
                                                }}
                                                placeholder="Buscar Provincia..."
                                                disabled={isReadOnly || currentUserRole === 'Tecnico' || currentUserRole === 'Ortopedia'}
                                            />
                                            <datalist id="provinces-list">
                                                {Object.keys(ARGENTINA_LOCATIONS).sort().map(prov => (
                                                    <option key={prov} value={prov} />
                                                ))}
                                            </datalist>
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-semibold text-slate-500 mb-1.5">Localidad</label>
                                        <div className="relative">
                                            <input
                                                list="localities-list"
                                                className="w-full rounded border border-slate-200 bg-slate-50 text-slate-900 focus:border-primary focus:ring-1 focus:ring-primary text-sm px-3 py-2 disabled:bg-slate-100 disabled:text-slate-400"
                                                value={locality}
                                                onChange={(e) => setLocality(e.target.value)}
                                                disabled={isReadOnly || (!province || !ARGENTINA_LOCATIONS[province]) || currentUserRole === 'Tecnico'}
                                                placeholder={!province ? "Seleccione Provincia primero" : "Buscar Localidad..."}
                                            />
                                            <datalist id="localities-list">
                                                {province && ARGENTINA_LOCATIONS[province]?.sort().map(loc => (
                                                    <option key={loc} value={loc} />
                                                ))}
                                            </datalist>
                                        </div>
                                    </div>

                                    {/* Admin & Logistics Section */}
                                    <div className="md:col-span-2 lg:col-span-4 mt-2 p-4 bg-slate-50/50 rounded-lg border border-slate-100 grid grid-cols-1 md:grid-cols-3 gap-4">
                                        <div className="md:col-span-3 flex items-center gap-2 mb-1">
                                            <span className="material-symbols-outlined text-slate-400 text-sm">admin_panel_settings</span>
                                            <h4 className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Gestión Administrativa</h4>
                                        </div>

                                        {/* Provider Field (renamed from Medical Coverage) */}
                                        <div>
                                            <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1.5 ml-0.5">Prestador (OS / ART)</label>
                                            <div className="relative group">
                                                <select
                                                    className="w-full rounded border border-slate-200 bg-white text-slate-900 focus:border-primary focus:ring-4 focus:ring-primary/10 text-sm px-3 py-2 appearance-none transition-all outline-none"
                                                    value={medicalCoverage}
                                                    onChange={(e) => handleCoverageChange(e.target.value)}
                                                    disabled={isReadOnly || currentUserRole === 'Tecnico' || currentUserRole === 'Ortopedia'}
                                                >
                                                    <option value="">Seleccionar Prestador...</option>
                                                    <optgroup label="Obras Sociales / Prepagas">
                                                        {availableCoverages.filter(c => c.type === 'Obra Social' || !c.type).map(cov => (
                                                            <option key={cov.id} value={cov.name}>{cov.name}</option>
                                                        ))}
                                                    </optgroup>
                                                    <optgroup label="Aseguradoras (ART)">
                                                        {availableCoverages.filter(c => c.type === 'ART').map(cov => (
                                                            <option key={cov.id} value={cov.name}>{cov.name}</option>
                                                        ))}
                                                    </optgroup>
                                                </select>
                                                <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-primary pointer-events-none text-lg transition-colors">expand_more</span>
                                            </div>
                                        </div>

                                        {/* Vendor Selection */}
                                        <div>
                                            <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1.5 ml-0.5">Ortopedia Asignada</label>
                                            <div className="relative group">
                                                <select
                                                    className="w-full rounded border border-slate-200 bg-white text-slate-900 focus:border-primary focus:ring-4 focus:ring-primary/10 text-sm px-3 py-2 appearance-none transition-all outline-none"
                                                    value={selectedVendor}
                                                    onChange={(e) => setSelectedVendor(e.target.value)}
                                                    disabled={isReadOnly || currentUserRole === 'Tecnico' || currentUserRole === 'Ortopedia'}
                                                >
                                                    <option value="">Seleccionar Proveedor...</option>
                                                    {availableVendors.map(v => (
                                                        <option key={v.id} value={v.id}>{v.name}</option>
                                                    ))}
                                                </select>
                                                <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-primary pointer-events-none text-lg transition-colors">domain</span>
                                            </div>
                                        </div>

                                        {/* Authorization Date Field */}
                                        {medicalCoverage !== 'Particular' && (
                                            <div>
                                                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1.5 ml-0.5">Fecha Autorización</label>
                                                <div className="relative group">
                                                    <input
                                                        className="w-full rounded border border-slate-200 bg-white text-slate-900 focus:border-primary focus:ring-4 focus:ring-primary/10 text-sm px-3 py-2 transition-all outline-none"
                                                        type="date"
                                                        value={authDate}
                                                        onChange={(e) => setAuthDate(e.target.value)}
                                                        disabled={isReadOnly || currentUserRole === 'Tecnico' || currentUserRole === 'Ortopedia'}
                                                    />
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    <div className="lg:col-span-2 flex flex-col justify-end pb-1">

                                        {/* ADMISSION ALERT (Specific to Internacion) */}
                                        {admissionAlert && (
                                            <div className={`mb-3 p-3 rounded-md flex items-start gap-2 text-xs font-bold border animate-pulse ${admissionAlert.level === 'critical'
                                                ? 'bg-slate-900 text-red-400 border-red-500 shadow-lg'
                                                : 'bg-red-50 text-red-700 border-red-200'
                                                }`}>
                                                <span className="material-symbols-outlined text-base">
                                                    {admissionAlert.level === 'critical' ? 'cancel_schedule_send' : 'notification_important'}
                                                </span>
                                                <p>{admissionAlert.message}</p>
                                            </div>
                                        )}

                                        {/* Custom Checkbox for Pre-op Exams */}
                                        <label className="flex items-center gap-2 cursor-pointer mb-3 group select-none">
                                            <div className="relative">
                                                <input
                                                    type="checkbox"
                                                    className="peer sr-only"
                                                    checked={preOpExams}
                                                    onChange={(e) => setPreOpExams(e.target.checked)}
                                                    disabled={isReadOnly || currentUserRole === 'Tecnico' || currentUserRole === 'Ortopedia'}
                                                />
                                                <div className="size-5 bg-white border-2 border-slate-300 rounded peer-checked:border-primary peer-focus:ring-2 peer-focus:ring-primary/20 transition-all flex items-center justify-center peer-checked:[&_span]:opacity-100 peer-checked:[&_span]:scale-100">
                                                    <span className="material-symbols-outlined text-base text-primary opacity-0 transform scale-50 transition-all font-bold">check</span>
                                                </div>
                                            </div>
                                            <span className="text-sm font-medium text-slate-700 group-hover:text-slate-900">Exámenes pre-quirúrgicos</span>
                                        </label>

                                        {preOpExams && (
                                            <div className="pl-7 mb-3 animate-fadeIn">
                                                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Fecha Realización</label>
                                                <div className="relative max-w-[200px]">
                                                    <input
                                                        type="date"
                                                        value={preOpDate}
                                                        onChange={(e) => setPreOpDate(e.target.value)}
                                                        className="w-full rounded border border-slate-200 bg-white text-slate-900 focus:border-primary focus:ring-1 focus:ring-primary text-xs px-2 py-1.5"
                                                        disabled={isReadOnly || currentUserRole === 'Tecnico' || currentUserRole === 'Ortopedia'}
                                                    />
                                                </div>
                                                {!checkDateValidity() && preOpDate && surgeryDate && (
                                                    <p className="text-[10px] text-red-500 mt-1 font-medium">⚠️ Revise la vigencia (&lt;30 días).</p>
                                                )}
                                            </div>
                                        )}

                                        {/* Custom Checkbox for Consent */}
                                        <label className="flex items-center gap-2 cursor-pointer group select-none">
                                            <div className="relative">
                                                <input
                                                    type="checkbox"
                                                    className="peer sr-only"
                                                    checked={consentSigned}
                                                    onChange={(e) => setConsentSigned(e.target.checked)}
                                                    disabled={isReadOnly || currentUserRole === 'Tecnico' || currentUserRole === 'Ortopedia'}
                                                />
                                                <div className="size-5 bg-white border-2 border-slate-300 rounded peer-checked:border-primary peer-focus:ring-2 peer-focus:ring-primary/20 transition-all flex items-center justify-center peer-checked:[&_span]:opacity-100 peer-checked:[&_span]:scale-100">
                                                    <span className="material-symbols-outlined text-base text-primary opacity-0 transform scale-50 transition-all font-bold">check</span>
                                                </div>
                                            </div>
                                            <span className="text-sm font-medium text-slate-700 group-hover:text-slate-900">Firma de consentimiento</span>
                                        </label>
                                    </div>
                                </div>
                            </div>
                        </section>

                        {/* Section 2: Clinical Details */}
                        <section className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
                            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center">
                                <h3 className="text-sm font-bold text-slate-900">Detalles Clínicos</h3>
                                {['SuperAdmin', 'Tecnico'].includes(user?.role || '') && !isNew && (
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
                                    <label className="block text-xs font-semibold text-slate-500 mb-1.5">Procedimientos (Carrito de Intervención)</label>
                                    <div className="flex flex-col gap-3">
                                        <div className="flex gap-2">
                                            <input
                                                type="text"
                                                className="flex-1 rounded border border-slate-200 bg-white text-slate-900 focus:border-primary focus:ring-1 focus:ring-primary px-3 py-2 text-sm"
                                                placeholder="Escriba el nombre del procedimiento..."
                                                value={procedureInput}
                                                onChange={(e) => setProcedureInput(e.target.value)}
                                                disabled={isReadOnly || currentUserRole === 'Tecnico' || currentUserRole === 'Ortopedia'}
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter') {
                                                        e.preventDefault();
                                                        if (procedureInput.trim()) {
                                                            setSelectedProcedures([...selectedProcedures, procedureInput.trim()]);
                                                            setProcedureInput('');
                                                        }
                                                    }
                                                }}
                                            />
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    if (procedureInput.trim()) {
                                                        setSelectedProcedures([...selectedProcedures, procedureInput.trim()]);
                                                        setProcedureInput('');
                                                    }
                                                }}
                                                className={`bg-primary hover:bg-primary-hover text-white px-4 py-2 rounded text-sm font-bold transition-all shadow-sm ${(isReadOnly || currentUserRole === 'Tecnico') ? 'opacity-50 cursor-not-allowed' : ''}`}
                                                disabled={isReadOnly || currentUserRole === 'Tecnico' || currentUserRole === 'Ortopedia'}
                                            >
                                                Agregar
                                            </button>
                                        </div>

                                        {/* Procedures Display */}
                                        <div className="flex flex-wrap gap-2 min-h-[40px] p-2 bg-slate-50 rounded border border-slate-100 border-dashed">
                                            {selectedProcedures.length === 0 ? (
                                                <span className="text-xs text-slate-400 italic self-center px-1">No hay procedimientos agregados</span>
                                            ) : (
                                                selectedProcedures.map((proc, idx) => (
                                                    <div key={idx} className="flex items-center gap-1.5 bg-white border border-slate-200 px-2.5 py-1 rounded-full shadow-sm animate-fadeIn">
                                                        <span className="text-xs font-bold text-slate-700">{proc}</span>
                                                        <button
                                                            onClick={() => setSelectedProcedures(selectedProcedures.filter((_, i) => i !== idx))}
                                                            className="text-slate-400 hover:text-red-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                                            disabled={isReadOnly || currentUserRole === 'Tecnico' || currentUserRole === 'Ortopedia'}
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
                                    <label className="block text-xs font-semibold text-slate-500 mb-1.5">Diagnóstico (CIE-10)</label>
                                    <input
                                        className="w-full rounded border border-slate-200 bg-white text-slate-900 focus:border-primary focus:ring-1 focus:ring-primary text-sm px-3 py-2 disabled:bg-slate-50 disabled:text-slate-500"
                                        type="text"
                                        placeholder="Ej: M17.0 Gonartrosis primaria bilateral"
                                        value={diagnosis}
                                        onChange={(e) => setDiagnosis(e.target.value)}
                                        disabled={isReadOnly || currentUserRole === 'Tecnico' || currentUserRole === 'Ortopedia'}
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-slate-500 mb-1.5">Médico Derivante</label>
                                    <div className="relative">
                                        <select
                                            className="w-full rounded border border-slate-200 bg-white text-slate-900 focus:border-primary focus:ring-1 focus:ring-primary px-3 py-2 text-sm appearance-none"
                                            value={referringDoctorId}
                                            onChange={(e) => setReferringDoctorId(e.target.value)}
                                            disabled={isReadOnly || currentUserRole === 'Tecnico' || currentUserRole === 'Ortopedia'}
                                        >
                                            <option value="">Seleccionar Médico...</option>
                                            {doctors
                                                .filter(doc => {
                                                    // Allow all active doctors for referring
                                                    // because clinically any doctor can refer.
                                                    // EXCEPT anesthesiologists as per user request.
                                                    // Also keep the currently selected one if editing.
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
                                            onChange={(e) => setSelectedDoctorId(e.target.value)}
                                            disabled={isReadOnly || currentUserRole === 'Tecnico' || currentUserRole === 'Ortopedia'}
                                        >
                                            <option value="">Seleccionar Cirujano...</option>
                                            {doctors
                                                .filter(doc => {
                                                    const specialty = (doc.specialty || '').toLowerCase();
                                                    // Filter out anesthesiologists, but keep the selected one if editing
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
                                        <label className={`flex-1 text-center py-2 border rounded text-sm font-medium cursor-pointer transition-colors ${surgerySide === 'left' ? 'bg-blue-50 text-blue-700 border-blue-200' : 'border-slate-200 text-slate-600 hover:bg-slate-50'} ${(isReadOnly || currentUserRole === 'Tecnico' || currentUserRole === 'Ortopedia') ? 'opacity-50 pointer-events-none' : ''}`}>
                                            <input
                                                type="radio"
                                                name="side"
                                                className="hidden"
                                                checked={surgerySide === 'left'}
                                                onChange={() => setSurgerySide('left')}
                                            /> Izq
                                        </label>
                                        <label className={`flex-1 text-center py-2 border rounded text-sm font-medium cursor-pointer transition-colors ${surgerySide === 'right' ? 'bg-blue-50 text-blue-700 border-blue-200' : 'border-slate-200 text-slate-600 hover:bg-slate-50'} ${(isReadOnly || currentUserRole === 'Tecnico' || currentUserRole === 'Ortopedia') ? 'opacity-50 pointer-events-none' : ''}`}>
                                            <input
                                                type="radio"
                                                name="side"
                                                className="hidden"
                                                checked={surgerySide === 'right'}
                                                onChange={() => setSurgerySide('right')}
                                            /> Der
                                        </label>
                                        <label className={`flex-1 text-center py-2 border rounded text-sm font-medium cursor-pointer transition-colors ${surgerySide === 'bilateral' ? 'bg-blue-50 text-blue-700 border-blue-200' : 'border-slate-200 text-slate-600 hover:bg-slate-50'} ${(isReadOnly || currentUserRole === 'Tecnico' || currentUserRole === 'Ortopedia') ? 'opacity-50 pointer-events-none' : ''}`}>
                                            <input
                                                type="radio"
                                                name="side"
                                                className="hidden"
                                                checked={surgerySide === 'bilateral'}
                                                onChange={() => setSurgerySide('bilateral')}
                                            /> Bilateral
                                        </label>
                                    </div>
                                </div>
                                <div className="md:col-span-2">
                                    <label className="block text-xs font-semibold text-slate-500 mb-1.5">Alergias Conocidas</label>
                                    <input
                                        className="w-full rounded border border-slate-200 bg-white text-slate-900 focus:border-primary focus:ring-1 focus:ring-primary text-sm px-3 py-2 disabled:bg-slate-50 disabled:text-slate-500 mb-2"
                                        type="text"
                                        placeholder="Medicamentos, látex, yodo, etc. (Dejar en blanco si no tiene)"
                                        value={allergies}
                                        onChange={(e) => setAllergies(e.target.value)}
                                        disabled={isReadOnly || currentUserRole === 'Tecnico' || currentUserRole === 'Ortopedia'}
                                    />
                                    <p className="text-[10px] text-slate-400 mb-4">* Las alergias se reflejarán en la pulsera impresa.</p>
                                </div>
                                <div className="md:col-span-2">
                                    <label className="block text-xs font-semibold text-slate-500 mb-1.5">Notas Pre-operatorias</label>
                                    <textarea
                                        className="w-full rounded border border-slate-200 bg-white text-slate-900 focus:border-primary focus:ring-1 focus:ring-primary text-sm px-3 py-2"
                                        rows={3}
                                        value={preOpNotes}
                                        onChange={(e) => setPreOpNotes(e.target.value)}
                                        placeholder="Alergias, comorbilidades, requerimientos especiales..."
                                        disabled={isReadOnly || currentUserRole === 'Tecnico' || currentUserRole === 'Ortopedia'}
                                    ></textarea>
                                </div>
                            </div>
                        </section>

                        {/* Section: Documents */}
                        <section className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden flex flex-col">
                            <div className="px-6 py-4 border-b border-slate-100 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                                <div>
                                    <h3 className="text-sm font-bold text-slate-900">Documentación Adjunta</h3>
                                    <p className="text-[10px] text-slate-500 font-medium">Gestione pedidos, autorizaciones y estudios</p>
                                </div>

                                <div className="flex items-center gap-2 w-full md:w-auto">
                                    <div className="relative flex-1 md:w-48">
                                        <select
                                            className="w-full rounded border border-slate-200 bg-slate-50 text-slate-700 text-xs px-2 py-1.5 appearance-none focus:ring-1 focus:ring-primary outline-none transition-all"
                                            value={uploadCategory}
                                            onChange={(e) => setUploadCategory(e.target.value)}
                                        >
                                            {DOCUMENT_CATEGORIES.map(cat => (
                                                <option key={cat.id} value={cat.id}>{cat.name}</option>
                                            ))}
                                        </select>
                                        <span className="material-symbols-outlined absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 text-sm pointer-events-none">expand_more</span>
                                    </div>

                                    <label className={`text-xs font-bold px-4 py-1.5 rounded cursor-pointer transition-all flex items-center gap-2 whitespace-nowrap shadow-sm ${uploading ? 'bg-slate-100 text-slate-400 cursor-not-allowed' : 'bg-primary text-white hover:bg-primary-hover active:scale-95'}`}>
                                        <span className="material-symbols-outlined text-sm">{uploading ? 'progress_activity' : 'upload_file'}</span>
                                        {uploading ? 'Subiendo...' : 'Subir'}
                                        <input
                                            type="file"
                                            className="hidden"
                                            onChange={handleFileUpload}
                                            disabled={isReadOnly || uploading || currentUserRole === 'Tecnico'}
                                        />
                                    </label>
                                </div>
                            </div>

                            {uploading && (
                                <div className="px-6 py-2 bg-slate-50 border-b border-slate-100 animate-fadeIn">
                                    <div className="flex items-center justify-between mb-1">
                                        <span className="text-[10px] font-bold text-primary uppercase">Subiendo archivo...</span>
                                        <span className="text-[10px] font-bold text-slate-500">{uploadProgress}%</span>
                                    </div>
                                    <div className="w-full bg-slate-200 rounded-full h-1 overflow-hidden">
                                        <div
                                            className="bg-primary h-full transition-all duration-300 ease-out"
                                            style={{ width: `${uploadProgress}%` }}
                                        ></div>
                                    </div>
                                </div>
                            )}

                            <div className="p-6">
                                {documents.length === 0 ? (
                                    <div className="py-12 flex flex-col items-center justify-center text-slate-300 bg-slate-50/50 rounded-xl border-2 border-dashed border-slate-100">
                                        <div className="size-16 rounded-full bg-white flex items-center justify-center mb-3 shadow-sm">
                                            <span className="material-symbols-outlined text-3xl opacity-30">folder_open</span>
                                        </div>
                                        <p className="text-xs font-medium">No hay documentos adjuntos en esta cirugía.</p>
                                        <p className="text-[9px] mt-1 text-slate-400 px-4 text-center">Suba estudios, pedidos médicos o credenciales para completar el legajo.</p>
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                                        {documents.map(doc => {
                                            const catInfo = DOCUMENT_CATEGORIES.find(c => c.name === doc.type) || DOCUMENT_CATEGORIES[5];
                                            const isImage = /\.(jpg|jpeg|png|webp|gif)$/i.test(doc.name);

                                            return (
                                                <div key={doc.id} className="group relative bg-white border border-slate-100 rounded-xl p-3 hover:border-primary/30 hover:shadow-xl hover:shadow-primary/5 transition-all animate-fadeIn">
                                                    <div className="flex items-start gap-3 mb-3">
                                                        <div className={`size-10 rounded-lg flex items-center justify-center shrink-0 ${doc.type === 'Pedido Médico' ? 'bg-blue-50 text-blue-500' :
                                                            doc.type === 'Autorización' ? 'bg-emerald-50 text-emerald-500' :
                                                                doc.type === 'DNI / Credencial' ? 'bg-purple-50 text-purple-500' :
                                                                    'bg-slate-100 text-slate-500'
                                                            }`}>
                                                            <span className="material-symbols-outlined text-xl">{catInfo.icon}</span>
                                                        </div>
                                                        <div className="min-w-0 flex-1">
                                                            <h4 className="text-xs font-bold text-slate-900 truncate" title={doc.name}>{doc.name}</h4>
                                                            <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-black uppercase tracking-tighter mt-1 inline-block">
                                                                {doc.type}
                                                            </span>
                                                        </div>
                                                    </div>

                                                    {isImage && (
                                                        <div className="aspect-video mb-3 rounded-lg bg-slate-50 border border-slate-100 overflow-hidden relative group/thumb">
                                                            <img
                                                                src={getFileUrl(doc.file_path)}
                                                                alt={doc.name}
                                                                className="w-full h-full object-cover opacity-80 group-hover/thumb:opacity-100 transition-opacity"
                                                            />
                                                            <div className="absolute inset-0 bg-black/0 group-hover/thumb:bg-black/5 flex items-center justify-center opacity-0 group-hover/thumb:opacity-100 transition-all">
                                                                <a href={getFileUrl(doc.file_path)} target="_blank" rel="noopener noreferrer" className="bg-white/90 p-1.5 rounded-full text-slate-900 shadow-sm hover:scale-110 transition-transform">
                                                                    <span className="material-symbols-outlined text-sm">open_in_new</span>
                                                                </a>
                                                            </div>
                                                        </div>
                                                    )}

                                                    <div className="flex items-center justify-between pt-2 border-t border-slate-50">
                                                        <span className="text-[9px] text-slate-400 font-bold">{new Date(doc.created_at).toLocaleDateString()}</span>
                                                        <div className="flex items-center gap-1">
                                                            <a
                                                                href={getFileUrl(doc.file_path)}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                className="size-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-primary hover:bg-primary/5 transition-all"
                                                                title="Ver / Descargar"
                                                            >
                                                                <span className="material-symbols-outlined text-base">visibility</span>
                                                            </a>
                                                            <button
                                                                onClick={() => handleDeleteDocument(doc.id, doc.file_path)}
                                                                className="size-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                                                title="Eliminar"
                                                                disabled={isReadOnly || currentUserRole === 'Tecnico'}
                                                            >
                                                                <span className="material-symbols-outlined text-base">delete</span>
                                                            </button>
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        </section>

                        {/* Section: Patient History */}
                        {!isNew && (
                            <section className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden flex flex-col">
                                <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                                    <div>
                                        <h3 className="text-sm font-bold text-slate-900">Historial del Paciente</h3>
                                        <p className="text-[10px] text-slate-500 font-medium">Antecedentes registrados</p>
                                    </div>
                                    <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded text-[10px] font-bold border border-slate-200">
                                        {patientHistory.length}
                                    </span>
                                </div>
                                <div className="p-4 max-h-[300px] overflow-y-auto">
                                    {patientHistory.length === 0 ? (
                                        <div className="py-8 flex flex-col items-center justify-center text-slate-300 bg-slate-50 border border-dashed border-slate-100 rounded-lg">
                                            <span className="material-symbols-outlined text-2xl opacity-30 mb-1">history</span>
                                            <p className="text-[10px] font-medium">Sin antecedentes registrados</p>
                                        </div>
                                    ) : (
                                        <div className="space-y-3">
                                            {patientHistory.map((h) => (
                                                <div
                                                    key={h.id}
                                                    onClick={() => navigate(`/detail/${h.id}`)}
                                                    className="p-3 bg-white border border-slate-100 rounded-lg hover:border-primary/30 hover:shadow-md transition-all cursor-pointer group"
                                                >
                                                    <div className="flex justify-between items-start mb-1">
                                                        <span className="text-[10px] font-bold text-slate-400">
                                                            {new Date(h.surgery_date).toLocaleDateString()}
                                                        </span>
                                                        <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold uppercase ${h.status === 'completed' ? 'bg-green-50 text-green-700' :
                                                            h.status === 'suspended' ? 'bg-red-50 text-red-700' :
                                                                'bg-blue-50 text-blue-700'
                                                            }`}>
                                                            {h.status}
                                                        </span>
                                                    </div>
                                                    <h4 className="text-xs font-bold text-slate-900 line-clamp-2 group-hover:text-primary transition-colors">
                                                        {h.procedure_name}
                                                    </h4>
                                                    <div className="flex items-center gap-1 mt-1.5">
                                                        <span className="material-symbols-outlined text-[12px] text-slate-400">person</span>
                                                        <span className="text-[10px] text-slate-500 font-medium truncate">
                                                            {h.doctors?.full_name || 'Médico no asignado'}
                                                        </span>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </section>
                        )}
                    </div>

                    {/* RIGHT: Logistics (4 cols) */}
                    <div className="xl:col-span-4 flex flex-col gap-6">

                        {/* Section 3: Programación */}
                        <section className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden h-fit">
                            <div className="px-6 py-4 border-b border-slate-100">
                                <h3 className="text-sm font-bold text-slate-900">Programación</h3>
                            </div>
                            <div className="p-5 flex flex-col gap-5">
                                <div>
                                    <label className="block text-xs font-semibold text-slate-500 mb-1.5">Fecha Propuesta</label>
                                    <div className="relative">
                                        <input
                                            className={`w-full rounded border bg-white text-slate-900 focus:border-primary focus:ring-1 focus:ring-primary px-3 py-2 text-sm transition-colors ${prosthesisAlert ? 'border-amber-300 ring-1 ring-amber-100' : 'border-slate-200'} ${currentUserRole === 'Internacion' ? 'bg-slate-50 text-slate-500 cursor-not-allowed' : ''}`}
                                            type="date"
                                            value={surgeryDate}
                                            onChange={(e) => setSurgeryDate(e.target.value)}
                                            disabled={isReadOnly || currentUserRole === 'Internacion' || currentUserRole === 'Ortopedia'}
                                        />
                                    </div>

                                    {/* PROSTHESIS ALERT (Ortho specific) */}
                                    {prosthesisAlert && (
                                        <div className={`mt-2 p-2 rounded text-[10px] font-bold flex items-start gap-1.5 animate-fadeIn border ${prosthesisAlert.level === 'urgent'
                                            ? 'bg-red-50 text-red-600 border-red-100'
                                            : 'bg-amber-50 text-amber-700 border-amber-100'
                                            }`}>
                                            <span className="material-symbols-outlined text-sm">
                                                {prosthesisAlert.level === 'urgent' ? 'warning' : 'info'}
                                            </span>
                                            {prosthesisAlert.message}
                                        </div>
                                    )}
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs font-semibold text-slate-500 mb-1.5">Hora Inicio</label>
                                        <input
                                            className={`w-full rounded border border-slate-200 bg-white text-slate-900 focus:border-primary focus:ring-1 focus:ring-primary px-3 py-2 text-sm ${currentUserRole === 'Internacion' ? 'bg-slate-50 text-slate-500 cursor-not-allowed' : ''}`}
                                            type="time"
                                            value={startTime}
                                            onChange={(e) => setStartTime(e.target.value)}
                                            disabled={isReadOnly || currentUserRole === 'Internacion' || currentUserRole === 'Ortopedia'}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-semibold text-slate-500 mb-1.5">Duración Est.</label>
                                        <div className="relative">
                                            <input
                                                className={`w-full rounded border border-slate-200 bg-white text-slate-900 focus:border-primary focus:ring-1 focus:ring-primary pl-3 pr-10 py-2 text-sm appearance-none ${currentUserRole === 'Internacion' ? 'bg-slate-50 text-slate-500 cursor-not-allowed' : ''}`}
                                                type="number"
                                                value={estimatedDuration}
                                                onChange={(e) => {
                                                    const val = e.target.value;
                                                    setEstimatedDuration(val === '' ? '' : parseInt(val));
                                                }}
                                                placeholder="min"
                                                disabled={isReadOnly || currentUserRole === 'Internacion' || currentUserRole === 'Ortopedia'}
                                            />
                                            <span className="absolute right-3 top-2.5 text-[10px] text-slate-400 font-black pointer-events-none">MIN</span>
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-semibold text-slate-500 mb-1.5">Hora Fin Aprox.</label>
                                        <div className="relative">
                                            <input
                                                className="w-full rounded border border-slate-200 bg-slate-50 text-slate-500 px-3 py-2 text-sm cursor-not-allowed font-medium"
                                                type="time"
                                                value={(() => {
                                                    if (!startTime || !estimatedDuration) return '';
                                                    const [h, m] = startTime.split(':').map(Number);
                                                    const date = new Date();
                                                    date.setHours(h, m + Number(estimatedDuration));
                                                    return date.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false });
                                                })()}
                                                disabled
                                                readOnly
                                            />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-semibold text-slate-500 mb-1.5">Quirófano</label>
                                        <div className="relative">
                                            <select
                                                className={`w-full rounded border border-slate-200 bg-white text-slate-900 focus:border-primary focus:ring-1 focus:ring-primary px-3 py-2 text-sm appearance-none ${currentUserRole === 'Internacion' ? 'bg-slate-50 text-slate-500 cursor-not-allowed' : ''}`}
                                                value={selectedOrId}
                                                onChange={(e) => setSelectedOrId(e.target.value)}
                                                disabled={isReadOnly || currentUserRole === 'Internacion' || currentUserRole === 'Ortopedia'}
                                            >
                                                <option value="">Por asignar...</option>
                                                {availableORs.map(or => (
                                                    <option key={or.id} value={or.id}>{or.name}</option>
                                                ))}
                                            </select>
                                            <span className="material-symbols-outlined absolute right-3 top-2.5 text-slate-400 pointer-events-none text-lg">arrow_drop_down</span>
                                        </div>
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-slate-500 mb-1.5">Tipo de Anestesia</label>
                                    <div className="relative group">
                                        <select
                                            className={`w-full rounded border border-slate-200 bg-white text-slate-900 focus:border-primary focus:ring-4 focus:ring-primary/10 text-sm px-3 py-2 appearance-none transition-all outline-none ${currentUserRole === 'Internacion' ? 'bg-slate-50 text-slate-500 cursor-not-allowed' : ''}`}
                                            value={anesthesiaType}
                                            onChange={(e) => setAnesthesiaType(e.target.value)}
                                            disabled={isReadOnly || currentUserRole === 'Internacion' || currentUserRole === 'Ortopedia'}
                                        >
                                            <option value="">Seleccionar...</option>
                                            <option value="General">General</option>
                                            <option value="Sedación">Sedación</option>
                                            <option value="Local">Local</option>
                                            <option value="Raquídea">Raquídea/Epidural</option>
                                            <option value="Bloqueo">Bloqueo Regional</option>
                                        </select>
                                        <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-primary pointer-events-none text-lg transition-colors">medical_services</span>
                                    </div>
                                </div>

                                {/* Guardia Toggle */}
                                <div className="p-3 bg-rose-50 border border-rose-100 rounded-lg">
                                    <label className="flex items-center justify-between cursor-pointer group select-none">
                                        <div className="flex items-center gap-2">
                                            <span className={`material-symbols-outlined text-lg ${isGuardia ? 'text-rose-500 font-variation-fill' : 'text-slate-400'}`}>
                                                {isGuardia ? 'emergency_home' : 'clinical_notes'}
                                            </span>
                                            <div>
                                                <p className="text-xs font-bold text-rose-900">Cirugía de Guardia</p>
                                                <p className="text-[10px] text-rose-600 font-medium">Se identificará con color diferenciado</p>
                                            </div>
                                        </div>
                                        <div className="relative">
                                            <input
                                                type="checkbox"
                                                className="peer sr-only"
                                                checked={isGuardia}
                                                onChange={(e) => {
                                                    const checked = e.target.checked;
                                                    setIsGuardia(checked);
                                                    if (checked) setPriority('emergency');
                                                }}
                                                disabled={isReadOnly || currentUserRole === 'Tecnico' || currentUserRole === 'Ortopedia' || (currentUserRole === 'Administrativo de Guardias' && isNew)}
                                            />
                                            <div className="w-9 h-5 bg-slate-200 rounded-full peer peer-checked:bg-rose-500 transition-all after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-4"></div>
                                        </div>
                                    </label>
                                    {currentUserRole === 'Administrativo de Guardias' && isNew && (
                                        <p className="text-[9px] text-rose-400 mt-1 italic italic">* Campo obligatorio para su rol</p>
                                    )}
                                </div>

                                {/* Dynamic Anesthesiologist Field */}
                                {anesthesiaType && (
                                    <div className="animate-fadeIn">
                                        <label className="block text-xs font-semibold text-slate-500 mb-1.5">Anestesista Asignado</label>
                                        <div className="relative group">
                                            <select
                                                className={`w-full rounded border border-slate-200 bg-white text-slate-900 focus:border-primary focus:ring-4 focus:ring-primary/10 text-sm px-3 py-2 appearance-none transition-all outline-none ${currentUserRole === 'Internacion' ? 'bg-slate-50 text-slate-500 cursor-not-allowed' : ''}`}
                                                value={anesthesiologistId}
                                                onChange={(e) => setAnesthesiologistId(e.target.value)}
                                                disabled={currentUserRole === 'Internacion' || currentUserRole === 'Ortopedia'}
                                            >
                                                <option value="">Seleccionar Anestesista...</option>
                                                {doctors.filter(d => d.specialty === 'Anestesista').map(doc => (
                                                    <option key={doc.id} value={doc.id}>{doc.full_name}</option>
                                                ))}
                                            </select>
                                            <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-primary pointer-events-none text-lg transition-colors">person_search</span>
                                        </div>
                                        {doctors.filter(d => d.specialty === 'Anestesista').length === 0 && (
                                            <p className="text-[10px] text-amber-600 mt-1 font-medium italic">No hay médicos registrados con la especialidad "Anestesista".</p>
                                        )}
                                    </div>
                                )}

                                {/* Validations Sub-section */}
                                <div className="mt-2 pt-4 border-t border-slate-100 flex flex-col gap-3">
                                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Validaciones Requeridas</p>

                                    {/* Ortopedia Checkbox */}
                                    <label className={`flex flex-col p-3 rounded border transition-colors cursor-pointer ${approvals.ortho ? 'bg-green-50 border-green-200' : 'bg-slate-50 border-slate-200'} ${!canToggle('ortho') ? 'opacity-50 cursor-not-allowed' : ''}`}>
                                        <div className="flex items-center justify-between w-full pointer-events-none">
                                            <div className="flex items-center gap-3">
                                                <div className="relative">
                                                    <input
                                                        type="checkbox"
                                                        className="peer sr-only"
                                                        checked={approvals.ortho}
                                                        onChange={() => {
                                                            if (canToggle('ortho')) {
                                                                const newVal = !approvals.ortho;
                                                                setApprovals({ ...approvals, ortho: newVal });
                                                                if (newVal) {
                                                                    setOrthoValidationDate(new Date().toISOString());
                                                                    setOrthoValidatedByName(user?.name || 'Usuario Ortopedia');
                                                                } else {
                                                                    setOrthoValidationDate(null);
                                                                    setOrthoValidatedByName(null);
                                                                }
                                                            }
                                                        }}
                                                        disabled={!canToggle('ortho')}
                                                    />
                                                    <div className={`size-5 bg-white border-2 rounded flex items-center justify-center transition-all peer-checked:[&_span]:opacity-100 peer-checked:[&_span]:scale-100 
                                                ${!canToggle('ortho') ? 'border-slate-200' : 'border-slate-300 peer-checked:border-primary'}
                                            `}>
                                                        <span className="material-symbols-outlined text-base text-primary opacity-0 transform scale-50 transition-all font-bold">check</span>
                                                    </div>
                                                </div>
                                                <div>
                                                    <p className={`text-sm font-bold ${approvals.ortho ? 'text-green-800' : 'text-slate-700'}`}>Validación Ortopedia</p>
                                                    <p className="text-[10px] text-slate-500 leading-tight">
                                                        {!vendorRequiresValidation ? 'No requiere validación' :
                                                         approvals.ortho && orthoValidationDate ? (
                                                            `Validado por ${orthoValidatedByName} el ${new Date(orthoValidationDate).toLocaleDateString()} ${new Date(orthoValidationDate).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false })}`
                                                        ) : 'Materiales Ok'}
                                                    </p>
                                                </div>
                                            </div>
                                            {!canToggle('ortho') && !approvals.ortho && <span className="text-[10px] bg-slate-200 text-slate-500 px-2 py-1 rounded">Solo Ortopedia</span>}
                                        </div>
                                        {getOrthoErrorText() && (
                                            <div className="mt-2 pl-8 pointer-events-none">
                                                <p className="text-[10px] font-medium text-amber-600 bg-amber-50 px-2 py-1 rounded flex items-center gap-1 w-fit">
                                                    <span className="material-symbols-outlined text-xs">warning</span>
                                                    {getOrthoErrorText()}
                                                </p>
                                            </div>
                                        )}
                                    </label>

                                    {/* Internacion / ART Checkbox */}
                                    {(() => {
                                        // Determine if it is ART
                                        const selectedProvider = availableCoverages.find(c => c.name === medicalCoverage);
                                        const isART = selectedProvider?.type === 'ART' || (medicalCoverage && medicalCoverage.toUpperCase().includes('ART')); // Fallback check
                                        const validationLabel = isART ? 'Validación Oficina ART' : 'Validación Enfermería';
                                        const roleLabel = isART ? 'Solo ART' : 'Solo Intern.';

                                        return (
                                            <label className={`flex flex-col p-3 rounded border transition-colors cursor-pointer ${approvals.admission ? 'bg-green-50 border-green-200' : 'bg-slate-50 border-slate-200'} ${!canToggle('admission') ? 'opacity-50 cursor-not-allowed' : ''}`}>
                                                <div className="flex items-center justify-between w-full pointer-events-none">
                                                    <div className="flex items-center gap-3">
                                                        <div className="relative">
                                                            <input
                                                                type="checkbox"
                                                                className="peer sr-only"
                                                                checked={approvals.admission}
                                                                onChange={() => {
                                                                    if (canToggle('admission')) {
                                                                        const newValue = !approvals.admission;
                                                                        setApprovals({ ...approvals, admission: newValue });
                                                                        if (newValue) {
                                                                            setAdmissionValidationDate(new Date().toISOString());
                                                                        } else {
                                                                            setAdmissionValidationDate(null);
                                                                        }
                                                                    }
                                                                }}
                                                                disabled={!canToggle('admission')}
                                                            />
                                                            <div className={`size-5 bg-white border-2 rounded flex items-center justify-center transition-all peer-checked:[&_span]:opacity-100 peer-checked:[&_span]:scale-100
                                                ${!canToggle('admission') ? 'border-slate-200' : 'border-slate-300 peer-checked:border-primary'}
                                            `}>
                                                                <span className="material-symbols-outlined text-base text-primary opacity-0 transform scale-50 transition-all font-bold">check</span>
                                                            </div>
                                                        </div>
                                                        <div>
                                                            <p className={`text-sm font-bold ${approvals.admission ? 'text-green-800' : 'text-slate-700'}`}>{validationLabel}</p>
                                                            <p className="text-[10px] text-slate-500 leading-tight">Cama Asignada</p>
                                                            {approvals.admission && admissionValidationDate && (
                                                                <span className="text-[9px] text-green-700 font-bold block mt-0.5">
                                                                    {new Date(admissionValidationDate).toLocaleDateString()}
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>
                                                    {!canToggle('admission') && !approvals.admission && (
                                                        <span className={`text-[10px] px-2 py-1 rounded ${(currentUserRole === 'SuperAdmin' || (isART ? currentUserRole === 'Oficina ART' : currentUserRole === 'Internacion')) ? 'bg-red-50 text-red-600 font-bold' : 'bg-slate-200 text-slate-500'}`}>
                                                            {(currentUserRole === 'SuperAdmin' || (isART ? currentUserRole === 'Oficina ART' : currentUserRole === 'Internacion')) ? 'Incompleto' : roleLabel}
                                                        </span>
                                                    )}
                                                </div>
                                                {/* Detailed Error Feedback */}
                                                {getAdmissionErrorText() && (
                                                    <div className="mt-2 pl-8 pointer-events-none">
                                                        <p className="text-[10px] font-medium text-red-500 bg-red-50 px-2 py-1 rounded flex items-center gap-1 w-fit">
                                                            <span className="material-symbols-outlined text-xs">info</span>
                                                            {getAdmissionErrorText()}
                                                        </p>
                                                    </div>
                                                )}
                                            </label>
                                        );
                                    })()}

                                    {/* Quirofano Checkbox */}
                                    <label className={`flex items-center justify-between p-3 rounded border transition-colors cursor-pointer ${approvals.or ? 'bg-green-50 border-green-200' : 'bg-slate-50 border-slate-200'} ${!canToggle('or') ? 'opacity-50 cursor-not-allowed' : ''}`}>
                                        <div className="flex items-center gap-3 pointer-events-none">
                                            <div className="relative">
                                                <input
                                                    type="checkbox"
                                                    className="peer sr-only"
                                                    checked={approvals.or}
                                                    onChange={() => {
                                                        if (!canToggle('or')) return;
                                                        const newVal = !approvals.or;
                                                        setApprovals({ ...approvals, or: newVal });
                                                        if (newVal) {
                                                            setOrValidationDate(new Date().toISOString());
                                                            setOrValidatedByName(user?.name || (currentUserRole === 'Tecnico' ? 'Técnico' : 'Personal Qx.'));
                                                        } else {
                                                            setOrValidationDate(null);
                                                            setOrValidatedByName(null);
                                                        }
                                                    }}
                                                    disabled={!canToggle('or')}
                                                />
                                                <div className={`size-5 bg-white border-2 rounded flex items-center justify-center transition-all peer-checked:[&_span]:opacity-100 peer-checked:[&_span]:scale-100
                                            ${!canToggle('or') ? 'border-slate-200' : 'border-slate-300 peer-checked:border-primary'}
                                        `}>
                                                    <span className="material-symbols-outlined text-base text-primary opacity-0 transform scale-50 transition-all font-bold">check</span>
                                                </div>
                                            </div>
                                            <div>
                                                <p className={`text-sm font-bold ${approvals.or ? 'text-green-800' : 'text-slate-700'}`}>Validación Quirófano</p>
                                                <p className="text-[10px] text-slate-500 leading-tight">
                                                    {approvals.or && orValidationDate ? (
                                                        `Validado por ${orValidatedByName} el ${new Date(orValidationDate).toLocaleDateString()} ${new Date(orValidationDate).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false })}`
                                                    ) : 'Sala Lista'}
                                                </p>
                                            </div>
                                        </div>
                                        {!canToggle('or') && !approvals.or && <span className="text-[10px] bg-slate-200 text-slate-500 px-2 py-1 rounded">Solo Qx.</span>}
                                    </label>
                                </div>

                            </div>
                        </section>
                    </div>
                </div>

                {/* BOTTOM FULL-WIDTH: MATERIALS */}
                <section className={`rounded-lg border shadow-sm overflow-hidden flex flex-col mb-20 ${isNew ? 'bg-slate-50 border-slate-200 border-dashed' : 'bg-white border-slate-200'}`}>
                    <div className={`px-6 py-4 border-b flex items-center gap-6 ${isNew ? 'border-slate-200' : 'border-slate-100'}`}>
                        <h3 className={`text-sm font-bold ${isNew ? 'text-slate-500' : 'text-slate-800'}`}>
                            Gestión de Materiales y Equipamiento
                        </h3>
                        {/* CHECKBOX: LLEVA PROTESIS - NOW ALWAYS VISIBLE */}
                        <label className="flex items-center gap-2 cursor-pointer bg-purple-50 px-3 py-1.5 rounded-full border border-purple-100 hover:bg-purple-100 transition-colors">
                            <input
                                type="checkbox"
                                className="rounded border-purple-300 text-purple-600 focus:ring-purple-500 size-4 disabled:opacity-50"
                                checked={requiresProsthesis}
                                onChange={(e) => setRequiresProsthesis(e.target.checked)}
                                disabled={isReadOnly || currentUserRole === 'Tecnico'}
                            />
                            <span className="text-xs font-bold text-purple-800">¿Lleva Prótesis?</span>
                        </label>
                    </div>

                    {true ? ( // Always visible now as requested
                        <div className="p-5 flex-1 flex flex-col gap-4">
                            {/* Manual Entry Form */}
                            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl">
                                <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-2">
                                    <span className="material-symbols-outlined text-sm">add_circle</span>
                                    Carga Manual de Materiales
                                </h4>
                                <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
                                    <div className="md:col-span-1">
                                        <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1 ml-0.5">Nombre del Material</label>
                                        <input
                                            type="text"
                                            className="w-full rounded border border-slate-200 bg-white text-slate-900 focus:border-primary focus:ring-1 focus:ring-primary px-3 py-2 text-sm disabled:bg-slate-50 disabled:text-slate-500"
                                            placeholder="Ej: Clavo Endomedular"
                                            value={manualMaterialName}
                                            onChange={(e) => setManualMaterialName(e.target.value)}
                                            disabled={isReadOnly || currentUserRole === 'Tecnico'}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1 ml-0.5">Cant.</label>
                                        <input
                                            type="number"
                                            min="1"
                                            className="w-full rounded border border-slate-200 bg-white text-slate-900 focus:border-primary focus:ring-1 focus:ring-primary px-3 py-2 text-sm disabled:bg-slate-50 disabled:text-slate-500"
                                            value={manualMaterialQty}
                                            onChange={(e) => setManualMaterialQty(parseInt(e.target.value) || 1)}
                                            disabled={isReadOnly || currentUserRole === 'Tecnico'}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1 ml-0.5">Procedimiento</label>
                                        <select
                                            className="w-full rounded border border-slate-200 bg-white text-slate-900 focus:border-primary focus:ring-1 focus:ring-primary px-3 py-2 text-sm appearance-none disabled:bg-slate-50 disabled:text-slate-500"
                                            value={manualMaterialProc}
                                            onChange={(e) => setManualMaterialProc(e.target.value)}
                                            disabled={isReadOnly || currentUserRole === 'Tecnico'}
                                        >
                                            <option value="">General / Otros</option>
                                            {selectedProcedures.map(p => (
                                                <option key={p} value={p}>{p}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            if (manualMaterialName.trim()) {
                                                const newMat = {
                                                    id: crypto.randomUUID(),
                                                    name: manualMaterialName.trim(),
                                                    requestedQuantity: manualMaterialQty,
                                                    quantity: manualMaterialQty,
                                                    category: 'General',
                                                    isCovered: false,
                                                    isConfirmed: false,
                                                    observation: '',
                                                    procedureName: manualMaterialProc || undefined
                                                };
                                                setMaterials([...materials, newMat]);
                                                setManualMaterialName('');
                                                setManualMaterialQty(1);
                                            }
                                        }}
                                        className={`h-[38px] bg-slate-900 text-white rounded-lg text-xs font-black uppercase hover:bg-black transition-all shadow-sm flex items-center justify-center gap-2 ${(isReadOnly || currentUserRole === 'Tecnico') ? 'opacity-50 cursor-not-allowed' : ''}`}
                                        disabled={isReadOnly || currentUserRole === 'Tecnico'}
                                    >
                                        <span className="material-symbols-outlined text-sm">add</span>
                                        Agregar a Lista
                                    </button>
                                </div>
                            </div>

                            <div className="bg-blue-50 border border-blue-100 p-3 rounded flex items-center gap-2">
                                <span className="material-symbols-outlined text-primary text-sm">auto_awesome</span>
                                <p className="text-xs text-blue-700 font-medium">Lista de Materiales Solicitados</p>
                            </div>

                            {/* Materials Table with Role-Based Logic */}
                            {/* Materials Table Grouped by Procedure */}
                            <div className="bg-white rounded border border-slate-200 overflow-hidden">
                                {selectedProcedures.length > 0 ? (
                                    [...selectedProcedures, "General / Otros"].map(procGroup => {
                                        const groupMaterials = materials.filter(m =>
                                            procGroup === "General / Otros"
                                                ? (!m.procedureName || !selectedProcedures.includes(m.procedureName))
                                                : m.procedureName === procGroup
                                        );

                                        if (groupMaterials.length === 0) return null;

                                        return (
                                            <div key={procGroup} className="mb-0">
                                                <div className="bg-slate-50 px-4 py-2 border-y border-slate-200 flex items-center gap-2">
                                                    <span className="material-symbols-outlined text-sm text-slate-400">subdirectory_arrow_right</span>
                                                    <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{procGroup}</h4>
                                                    <span className="bg-white text-[9px] text-slate-400 px-1.5 rounded border border-slate-100 font-bold ml-auto">{groupMaterials.length} ítems</span>
                                                </div>
                                                <table className="w-full text-xs text-left">
                                                    <thead className="bg-slate-50/50 text-slate-400 font-bold border-b border-slate-100">
                                                        <tr>
                                                            <th className="px-4 py-2 text-[9px] uppercase">Ítem</th>
                                                            <th className="px-4 py-2 text-center w-24 text-[9px] uppercase">Solicitado</th>
                                                            <th className="px-4 py-2 text-center w-24 text-[9px] uppercase">Provisión</th>
                                                            {canValidate && (
                                                                <>
                                                                    <th className="px-4 py-2 text-center w-16 text-[9px] uppercase">Disp.</th>
                                                                    <th className="px-4 py-2 text-[9px] uppercase">Obs.</th>
                                                                    <th className="px-4 py-2 text-center w-16 text-[9px] uppercase">Val.</th>
                                                                </>
                                                            )}
                                                            <th className="px-4 py-2 text-center w-16 text-[9px] uppercase">Acción</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-slate-100">
                                                        {groupMaterials.map(mat => {
                                                            const hasDiscrepancy = mat.quantity !== mat.requestedQuantity;
                                                            return (
                                                                <tr key={mat.id} className="hover:bg-slate-50/50">
                                                                    <td className="px-4 py-3">
                                                                        <span className="text-slate-900 font-bold block">{mat.name}</span>
                                                                        <span className="text-[10px] text-slate-500 font-medium">{mat.category}</span>
                                                                        {!canValidate && mat.observation && (
                                                                            <div className="text-[10px] text-amber-600 italic mt-1 bg-amber-50 px-2 py-1 rounded w-fit">
                                                                                <span className="font-bold">Obs:</span> {mat.observation}
                                                                            </div>
                                                                        )}
                                                                    </td>
                                                                    <td className="px-4 py-3 text-center">
                                                                        <span className="text-slate-700 font-bold">{mat.requestedQuantity}</span>
                                                                    </td>
                                                                    <td className="px-4 py-3 text-center">
                                                                        {canEditList && !isReadOnly && (currentUserRole as string) !== 'Internacion' && (currentUserRole as string) !== 'Tecnico' ? (
                                                                            <div className={`flex items-center justify-center gap-1 p-1 rounded ${hasDiscrepancy ? 'bg-amber-100' : ''}`}>
                                                                                <button onClick={() => handleUpdateQuantity(mat.id, mat.quantity - 1)} className="text-slate-400 hover:text-slate-600 font-bold size-5 flex items-center justify-center rounded hover:bg-black/5">-</button>
                                                                                <span className={`w-6 text-center font-bold ${hasDiscrepancy ? 'text-amber-700' : 'text-slate-700'}`}>{mat.quantity}</span>
                                                                                <button onClick={() => handleUpdateQuantity(mat.id, mat.quantity + 1)} className="text-slate-400 hover:text-slate-600 font-bold size-5 flex items-center justify-center rounded hover:bg-black/5">+</button>
                                                                            </div>
                                                                        ) : (
                                                                            <span className={`font-bold ${hasDiscrepancy ? 'text-amber-600' : 'text-slate-900'}`}>{mat.quantity}</span>
                                                                        )}
                                                                    </td>
                                                                    {canValidate && (
                                                                        <>
                                                                            <td className="px-4 py-3 text-center align-middle">
                                                                                <input type="checkbox" checked={mat.isCovered || false} onChange={() => toggleCovered(mat.id)} className="rounded border-slate-300 text-primary size-4 cursor-pointer" />
                                                                            </td>
                                                                            <td className="px-4 py-3">
                                                                                <input type="text" value={mat.observation || ''} onChange={(e) => updateObservation(mat.id, e.target.value)} className="w-full text-xs bg-transparent border rounded px-2 py-1.5 focus:outline-none" />
                                                                            </td>
                                                                            <td className="px-4 py-3 text-center align-middle">
                                                                                <input type="checkbox" checked={mat.isConfirmed || false} onChange={() => toggleConfirmed(mat.id)} disabled={!mat.isCovered} className="rounded border-slate-300 text-emerald-600 size-4 cursor-pointer disabled:opacity-30" />
                                                                            </td>
                                                                        </>
                                                                    )}
                                                                    <td className="px-4 py-3 text-center align-middle">
                                                                        <button
                                                                            onClick={() => setMaterials(materials.filter(m => m.id !== mat.id))}
                                                                            className="size-7 mx-auto flex items-center justify-center rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                                                                            disabled={isReadOnly || currentUserRole === 'Tecnico'}
                                                                        >
                                                                            <span className="material-symbols-outlined text-sm">delete</span>
                                                                        </button>
                                                                    </td>
                                                                </tr>
                                                            );
                                                        })}
                                                    </tbody>
                                                </table>
                                            </div>
                                        );
                                    })
                                ) : (
                                    <div className="bg-white rounded border border-slate-200 overflow-hidden">
                                        <table className="w-full text-xs text-left">
                                            <thead className="bg-slate-50/50 text-slate-400 font-bold border-b border-slate-100">
                                                <tr>
                                                    <th className="px-4 py-2 text-[9px] uppercase">Ítem</th>
                                                    <th className="px-4 py-2 text-center w-24 text-[9px] uppercase">Solicitado</th>
                                                    <th className="px-4 py-2 text-center w-24 text-[9px] uppercase">Provisión</th>
                                                    {canValidate && (
                                                        <>
                                                            <th className="px-4 py-2 text-center w-16 text-[9px] uppercase">Disp.</th>
                                                            <th className="px-4 py-2 text-[9px] uppercase">Obs.</th>
                                                            <th className="px-4 py-2 text-center w-16 text-[9px] uppercase">Val.</th>
                                                        </>
                                                    )}
                                                    <th className="px-4 py-2 text-center w-16 text-[9px] uppercase">Acción</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100">
                                                {materials.length === 0 ? (
                                                    <tr><td colSpan={canValidate ? 7 : 4} className="px-3 py-12 text-center text-slate-300 italic font-medium">No hay materiales cargados manualmente.</td></tr>
                                                ) : (
                                                    materials.map(mat => (
                                                        <tr key={mat.id} className="hover:bg-slate-50/50">
                                                            <td className="px-4 py-3">
                                                                <span className="text-slate-900 font-bold block">{mat.name}</span>
                                                                <span className="text-[10px] text-slate-500 font-medium">General</span>
                                                            </td>
                                                            <td className="px-4 py-3 text-center"><span className="text-slate-700 font-bold">{mat.requestedQuantity}</span></td>
                                                            <td className="px-4 py-3 text-center"><span className="text-slate-900 font-bold">{mat.quantity}</span></td>
                                                            {canValidate ? (
                                                                <>
                                                                    <td className="px-4 py-3 text-center align-middle">
                                                                        <input type="checkbox" checked={mat.isCovered || false} onChange={() => toggleCovered(mat.id)} className="rounded border-slate-300 text-primary size-4 cursor-pointer" />
                                                                    </td>
                                                                    <td className="px-4 py-3">
                                                                        <input type="text" value={mat.observation || ''} onChange={(e) => updateObservation(mat.id, e.target.value)} className="w-full text-xs bg-transparent border rounded px-2 py-1.5 focus:outline-none" />
                                                                    </td>
                                                                    <td className="px-4 py-3 text-center align-middle">
                                                                        <div className="flex items-center justify-center gap-2">
                                                                            <input type="checkbox" checked={mat.isConfirmed || false} onChange={() => toggleConfirmed(mat.id)} disabled={!mat.isCovered} className="rounded border-slate-300 text-emerald-600 size-4 cursor-pointer disabled:opacity-30" />
                                                                            <button
                                                                                onClick={() => setMaterials(materials.filter(m => m.id !== mat.id))}
                                                                                className="size-7 flex items-center justify-center rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                                                                                disabled={(currentUserRole as string) === 'Tecnico'}
                                                                            >
                                                                                <span className="material-symbols-outlined text-sm">delete</span>
                                                                            </button>
                                                                        </div>
                                                                    </td>
                                                                </>
                                                            ) : (
                                                                <td className="px-4 py-3 text-center">
                                                                    <button
                                                                        onClick={() => setMaterials(materials.filter(m => m.id !== mat.id))}
                                                                        className="size-7 mx-auto flex items-center justify-center rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                                                                        disabled={currentUserRole === 'Tecnico'}
                                                                    >
                                                                        <span className="material-symbols-outlined text-sm">delete</span>
                                                                    </button>
                                                                </td>
                                                            )}
                                                        </tr>
                                                    ))
                                                )}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </div>

                            {/* Legend for Ortho User */}
                            {canValidate && (
                                <div className="flex justify-between items-center text-[10px] text-slate-400 px-1">
                                    <div className="flex gap-4">
                                        <span className="flex items-center gap-1"><div className="size-3 border border-slate-300 rounded bg-white"></div> Disponibilidad Física</span>
                                        <span className="flex items-center gap-1"><div className="size-3 border border-slate-300 rounded bg-emerald-600"></div> Validado / Auditable</span>
                                        <span className="flex items-center gap-1"><div className="size-3 border border-amber-300 rounded bg-amber-100"></div> Cantidad Modificada</span>
                                    </div>
                                </div>
                            )}

                            <button
                                onClick={() => setShowMaterialModal(true)}
                                className={`mt-2 w-full py-3 border-2 border-dashed border-slate-200 text-slate-500 rounded-lg text-sm font-bold transition-all flex items-center justify-center gap-2 ${!['SuperAdmin', 'Internacion', 'Ortopedia'].includes(currentUserRole || '') ? 'opacity-50 cursor-not-allowed' : 'hover:border-primary hover:text-primary hover:bg-slate-50'}`}
                                disabled={!['SuperAdmin', 'Internacion', 'Ortopedia'].includes(currentUserRole || '')}
                            >
                                <span className="material-symbols-outlined text-lg">edit_note</span>
                                Gestionar Lista Completa
                            </button>
                        </div>
                    ) : (
                        <div className="p-12 flex flex-col items-center justify-center text-slate-400 text-center flex-1 min-h-[200px]">
                            <div className="size-16 rounded-full bg-slate-100 flex items-center justify-center mb-4">
                                <span className="material-symbols-outlined text-3xl text-slate-300">lock</span>
                            </div>
                            <h4 className="text-slate-500 font-bold text-base mb-1">Sección Bloqueada</h4>
                            <p className="text-sm max-w-[300px] text-slate-400">Guarde los detalles clínicos y de programación para habilitar la solicitud de materiales.</p>
                        </div>
                    )}
                </section>
            </div >

            {/* Sticky Bottom Actions */}
            < div className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 p-4 z-20 md:ml-64 shadow-[0_-5px_20px_-5px_rgba(0,0,0,0.05)]" >
                <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
                    <button
                        onClick={() => navigate('/surgeries')}
                        className="hidden md:flex items-center gap-2 px-4 py-2 text-slate-500 hover:text-slate-900 rounded transition-colors font-medium text-sm"
                    >
                        Cancelar
                    </button>
                    <div className="flex items-center gap-3 ml-auto">
                        {!isNew && canDelete && (
                            <button
                                onClick={handleDeleteSurgery}
                                className="px-4 py-2 rounded border border-red-200 bg-red-50 text-red-700 font-bold text-sm hover:bg-red-100 transition-colors flex items-center gap-2 mr-4"
                            >
                                <span className="material-symbols-outlined text-base">delete</span>
                                Eliminar
                            </button>
                        )}

                        {!isNew && status !== 'suspended' && (['SuperAdmin', 'Tecnico', 'DireccionMedica'].includes(currentUserRole)) && (
                            <button
                                onClick={() => setSuspensionModal({ isOpen: true, reason: '', observations: '' })}
                                className={`px-4 py-2 rounded border border-amber-200 bg-amber-50 text-amber-700 font-bold text-sm hover:bg-amber-100 transition-colors flex items-center gap-2`}
                            >
                                <span className="material-symbols-outlined text-base">block</span>
                                Suspender / Cancelar
                            </button>
                        )}
                        {!isNew && (['SuperAdmin', 'Tecnico', 'DireccionMedica'].includes(currentUserRole)) && (
                            <button
                                onClick={() => setRescheduleModal({ isOpen: true, newDate: surgeryDate, newTime: startTime })}
                                className={`px-4 py-2 rounded border border-blue-200 bg-blue-50 text-blue-700 font-bold text-sm hover:bg-blue-100 transition-colors flex items-center gap-2`}
                            >
                                <span className="material-symbols-outlined text-base">event_repeat</span>
                                Reprogramar
                            </button>
                        )}
                        {!isNew && (currentUserRole === 'Internacion' || currentUserRole === 'Ortopedia') && status !== 'suspended' && (
                            <button
                                onClick={() => setRequestRescheduleModal({ isOpen: true, reason: '', suggestedDate: '' })}
                                className="px-4 py-2 rounded border border-indigo-200 bg-indigo-50 text-indigo-700 font-bold text-sm hover:bg-indigo-100 transition-colors flex items-center gap-2"
                            >
                                <span className="material-symbols-outlined text-base">campaign</span>
                                Solicitar Reprogramación
                            </button>
                        )}
                        {!isReadOnly && (
                            <button
                                onClick={handleSurgerySave}
                                disabled={saving}
                                className={`px-6 py-2 rounded text-white font-bold text-sm shadow-sm transition-all flex items-center gap-2 ${priority === 'emergency' ? 'bg-red-600 hover:bg-red-700' : 'bg-primary hover:bg-primary-hover'} ${saving ? 'opacity-50 cursor-not-allowed' : ''}`}
                            >
                                {saving ? 'Guardando...' : (isNew ? 'Crear Solicitud' : 'Guardar Cambios')}
                            </button>
                        )}
                    </div>
                </div>
            </div >

            {/* SUSPENSION MODAL */}
            {
                suspensionModal.isOpen && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-md p-4 animate-in fade-in duration-300">
                        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border border-slate-200">
                            <div className="p-6 border-b border-slate-100 bg-slate-50">
                                <h3 className="text-xl font-black text-slate-900">Suspender Cirugía</h3>
                                <p className="text-xs text-slate-500 font-bold uppercase tracking-wider mt-1">Indique el motivo y observaciones</p>
                            </div>
                            <div className="p-6 space-y-5">
                                <div>
                                    <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Motivo de Suspensión</label>
                                    <select
                                        value={suspensionModal.reason}
                                        onChange={(e) => setSuspensionModal({ ...suspensionModal, reason: e.target.value })}
                                        className="w-full rounded-xl border-slate-200 bg-slate-50 text-slate-900 font-bold text-sm p-3 focus:ring-2 focus:ring-amber-400 transition-all outline-none"
                                    >
                                        <option value="">Seleccionar motivo...</option>
                                        {SUSPENSION_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Observaciones Detalladas</label>
                                    <textarea
                                        value={suspensionModal.observations}
                                        onChange={(e) => setSuspensionModal({ ...suspensionModal, observations: e.target.value })}
                                        className="w-full rounded-xl border-slate-200 bg-slate-50 text-slate-700 text-sm p-3 min-h-[100px] focus:ring-2 focus:ring-amber-400 transition-all outline-none resize-none"
                                        placeholder="Explique las circunstancias de la suspensión..."
                                    />
                                </div>
                            </div>
                            <div className="p-6 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
                                <button onClick={() => setSuspensionModal({ ...suspensionModal, isOpen: false })} className="px-5 py-2 font-bold text-slate-500 hover:bg-slate-200 rounded-xl transition-all">Cancelar</button>
                                <button
                                    onClick={handleSuspend}
                                    disabled={!suspensionModal.reason}
                                    className="px-6 py-2 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white rounded-xl font-black text-sm shadow-lg shadow-amber-200 transition-all active:scale-95"
                                >
                                    Confirmar Suspensión
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }

            {/* RESCHEDULE MODAL */}
            {
                rescheduleModal.isOpen && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-md p-4 animate-in fade-in duration-300">
                        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border border-slate-200">
                            <div className="p-6 border-b border-slate-100 bg-slate-50">
                                <h3 className="text-xl font-black text-slate-900">Reprogramar Cirugía</h3>
                                <p className="text-xs text-slate-500 font-bold uppercase tracking-wider mt-1">Seleccione nueva fecha y hora</p>
                            </div>
                            <div className="p-6 space-y-5">
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Nueva Fecha</label>
                                        <input
                                            type="date"
                                            value={rescheduleModal.newDate}
                                            onChange={(e) => setRescheduleModal({ ...rescheduleModal, newDate: e.target.value })}
                                            className="w-full rounded-xl border-slate-200 bg-slate-50 text-slate-900 font-bold text-sm p-3 focus:ring-2 focus:ring-blue-400 transition-all outline-none"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Nueva Hora</label>
                                        <input
                                            type="time"
                                            value={rescheduleModal.newTime}
                                            onChange={(e) => setRescheduleModal({ ...rescheduleModal, newTime: e.target.value })}
                                            className="w-full rounded-xl border-slate-200 bg-slate-50 text-slate-900 font-bold text-sm p-3 focus:ring-2 focus:ring-blue-400 transition-all outline-none"
                                        />
                                    </div>
                                </div>
                                <div className="p-4 bg-blue-50 border border-blue-100 rounded-xl">
                                    <p className="text-[10px] text-blue-700 font-bold leading-tight">
                                        Al reprogramar, el estado de la cirugía volverá a "Programada" y las validaciones previas se mantendrán.
                                    </p>
                                </div>
                            </div>
                            <div className="p-6 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
                                <button onClick={() => setRescheduleModal({ ...rescheduleModal, isOpen: false })} className="px-5 py-2 font-bold text-slate-500 hover:bg-slate-200 rounded-xl transition-all">Cancelar</button>
                                <button
                                    onClick={handleReschedule}
                                    disabled={!rescheduleModal.newDate || !rescheduleModal.newTime}
                                    className="px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl font-black text-sm shadow-lg shadow-blue-200 transition-all active:scale-95"
                                >
                                    Guardar Nueva Fecha
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }

            {/* REQUEST RESCHEDULE MODAL (Internación) */}
            {
                requestRescheduleModal.isOpen && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-md p-4 animate-in fade-in duration-300">
                        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border border-slate-200">
                            <div className="p-6 border-b border-slate-100 bg-indigo-50">
                                <h3 className="text-xl font-black text-slate-900">Solicitar Reprogramación</h3>
                                <p className="text-xs text-indigo-800 font-bold uppercase tracking-wider mt-1">Informe a Quirófano el motivo</p>
                            </div>
                            <div className="p-6 space-y-5">
                                <div>
                                    <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Fecha Sugerida (Opcional)</label>
                                    <input
                                        type="date"
                                        value={requestRescheduleModal.suggestedDate}
                                        onChange={(e) => setRequestRescheduleModal({ ...requestRescheduleModal, suggestedDate: e.target.value })}
                                        className="w-full rounded-xl border-slate-200 bg-slate-50 text-slate-900 font-bold text-sm p-3 focus:ring-2 focus:ring-indigo-400 transition-all outline-none mb-4"
                                    />

                                    <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Motivo de la solicitud</label>
                                    <textarea
                                        value={requestRescheduleModal.reason}
                                        onChange={(e) => setRequestRescheduleModal({ ...requestRescheduleModal, reason: e.target.value })}
                                        className="w-full rounded-xl border-slate-200 bg-slate-50 text-slate-700 text-sm p-3 min-h-[100px] focus:ring-2 focus:ring-indigo-400 transition-all outline-none resize-none"
                                        placeholder="Ej: Paciente con fiebre, falta de estudios, cambios en la disponibilidad de cama..."
                                    />
                                </div>
                                <div className="p-4 bg-indigo-50/50 border border-indigo-100 rounded-xl">
                                    <p className="text-[10px] text-indigo-700 font-bold leading-tight">
                                        Esta acción generará una alerta prioritaria para la coordinación de quirófano.
                                    </p>
                                </div>
                            </div>
                            <div className="p-6 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
                                <button onClick={() => setRequestRescheduleModal({ isOpen: false, reason: '', suggestedDate: '' })} className="px-5 py-2 font-bold text-slate-500 hover:bg-slate-200 rounded-xl transition-all">Cancelar</button>
                                <button
                                    onClick={handleRequestReschedule}
                                    disabled={!requestRescheduleModal.reason.trim()}
                                    className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl font-black text-sm shadow-lg shadow-indigo-200 transition-all active:scale-95"
                                >
                                    Enviar Solicitud
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }

            {/* REQUEST SUSPENSION MODAL (Internación) */}
            {
                requestSuspensionModal.isOpen && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-md p-4 animate-in fade-in duration-300">
                        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border border-slate-200">
                            <div className="p-6 border-b border-slate-100 bg-amber-50">
                                <h3 className="text-xl font-black text-slate-900 text-amber-900">Solicitar Suspensión</h3>
                                <p className="text-xs text-amber-800 font-bold uppercase tracking-wider mt-1">Informe a Quirófano el motivo</p>
                            </div>
                            <div className="p-6 space-y-5">
                                <div>
                                    <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Motivo de la solicitud</label>
                                    <textarea
                                        value={requestSuspensionModal.reason}
                                        onChange={(e) => setRequestSuspensionModal({ ...requestSuspensionModal, reason: e.target.value })}
                                        className="w-full rounded-xl border-slate-200 bg-slate-50 text-slate-700 text-sm p-3 min-h-[100px] focus:ring-2 focus:ring-amber-400 transition-all outline-none resize-none"
                                        placeholder="Ej: Paciente no cumple ayuno, falta de cama, decisión familiar..."
                                    />
                                </div>
                                <div className="p-4 bg-amber-50/50 border border-amber-100 rounded-xl">
                                    <p className="text-[10px] text-amber-700 font-bold leading-tight">
                                        Esta acción generará una alerta prioritaria para la coordinación de quirófano.
                                    </p>
                                </div>
                            </div>
                            <div className="p-6 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
                                <button onClick={() => setRequestSuspensionModal({ isOpen: false, reason: '' })} className="px-5 py-2 font-bold text-slate-500 hover:bg-slate-200 rounded-xl transition-all">Cancelar</button>
                                <button
                                    onClick={handleRequestSuspension}
                                    disabled={!requestSuspensionModal.reason.trim()}
                                    className="px-6 py-2 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white rounded-xl font-black text-sm shadow-lg shadow-amber-200 transition-all active:scale-95"
                                >
                                    Enviar Solicitud
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }

            {/* Materials Modal (Cart) */}
            {
                showMaterialModal && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4 animate-fadeIn">
                        <div className="bg-white rounded-lg shadow-2xl w-full max-w-lg flex flex-col max-h-[90vh]">
                            <div className="p-5 border-b border-slate-200 flex justify-between items-center bg-slate-50 rounded-t-lg">
                                <h3 className="text-base font-bold text-slate-900">
                                    Gestión de Materiales
                                </h3>
                                <button
                                    onClick={() => setShowMaterialModal(false)}
                                    className="text-slate-500 hover:text-slate-800 transition-colors bg-white rounded-full p-1 border border-slate-200 hover:border-slate-300"
                                >
                                    <span className="material-symbols-outlined text-xl">close</span>
                                </button>
                            </div>

                            <div className="p-6 overflow-y-auto flex-1">
                                {/* Current List */}
                                <div className="flex justify-between items-center mb-3">
                                    <h4 className="text-xs font-black text-slate-900 uppercase tracking-wide">Materiales Asignados</h4>
                                    <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded text-[10px] font-bold border border-slate-200">{materials.length} Ítems</span>
                                </div>

                                <div className="space-y-3 mb-8">
                                    {materials.map(mat => (
                                        <div key={mat.id} className="flex items-center justify-between p-3 bg-white border border-slate-200 rounded shadow-sm hover:border-primary/50 transition-colors group">
                                            <div className="flex-1">
                                                <div className="flex items-center gap-2 mb-1">
                                                    <p className="text-sm font-bold text-slate-900">{mat.name}</p>
                                                    {mat.procedureName && (
                                                        <span className="text-[9px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded border border-blue-100 font-bold uppercase">
                                                            {mat.procedureName}
                                                        </span>
                                                    )}
                                                </div>
                                                <span className={`text-[10px] uppercase font-bold px-1.5 py-0.5 rounded border bg-slate-100 text-slate-700 border-slate-200`}>
                                                    {mat.category}
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-4">
                                                <div className="flex items-center rounded border border-slate-300 bg-slate-50">
                                                    <button
                                                        onClick={() => handleUpdateQuantity(mat.id, mat.quantity - 1)}
                                                        className="px-2 py-1 text-slate-600 hover:bg-white hover:text-primary transition-colors border-r border-slate-300 font-bold"
                                                        title="Reducir"
                                                    >
                                                        -
                                                    </button>
                                                    <span className="w-10 text-center text-sm font-mono font-bold text-slate-900 bg-white h-full flex items-center justify-center">{mat.quantity}</span>
                                                    <button
                                                        onClick={() => handleUpdateQuantity(mat.id, mat.quantity + 1)}
                                                        className="px-2 py-1 text-slate-600 hover:bg-white hover:text-primary transition-colors border-l border-slate-300 font-bold"
                                                        title="Aumentar"
                                                    >
                                                        +
                                                    </button>
                                                </div>
                                                <button
                                                    onClick={() => handleRemoveMaterial(mat.id)}
                                                    className="text-slate-400 hover:text-red-600 transition-colors p-1.5 hover:bg-red-50 rounded"
                                                    title="Eliminar"
                                                >
                                                    <span className="material-symbols-outlined text-xl">delete</span>
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                    {materials.length === 0 && (
                                        <div className="text-center py-8 border-2 border-dashed border-slate-300 rounded bg-slate-50">
                                            <span className="material-symbols-outlined text-slate-400 text-3xl mb-2">remove_shopping_cart</span>
                                            <p className="text-slate-600 font-medium text-sm">El carrito está vacío</p>
                                            <p className="text-slate-400 text-xs">Agregue ítems usando el formulario de abajo.</p>
                                        </div>
                                    )}
                                </div>

                                {/* Add New Section */}
                                <div className="bg-slate-100 p-5 rounded-lg border border-slate-300">
                                    <h4 className="text-xs font-black text-slate-900 uppercase mb-3 tracking-wide flex items-center gap-2">
                                        <span className="material-symbols-outlined text-base">add_circle</span>
                                        Agregar Item
                                    </h4>
                                    <div className="flex flex-col gap-3">
                                        <div className="flex gap-3 items-stretch">
                                            <div className="flex-1">
                                                <select
                                                    className="w-full h-10 rounded-lg border border-slate-300 bg-white text-slate-900 text-sm px-3 focus:ring-2 focus:ring-primary focus:border-primary shadow-sm outline-none font-medium"
                                                    value={selectedMaterialName}
                                                    onChange={(e) => setSelectedMaterialName(e.target.value)}
                                                >
                                                    <option value="">Seleccionar material...</option>
                                                    {AVAILABLE_MATERIALS.map(m => (
                                                        <option key={m.name} value={m.name} className="py-1">{m.name}</option>
                                                    ))}
                                                </select>
                                            </div>
                                            <div className="w-20">
                                                <input
                                                    type="number"
                                                    min="1"
                                                    className="w-full h-10 rounded-lg border border-slate-300 bg-white text-slate-900 text-sm px-2 text-center focus:ring-2 focus:ring-primary focus:border-primary shadow-sm outline-none font-bold"
                                                    value={quantity}
                                                    onChange={(e) => setQuantity(parseInt(e.target.value))}
                                                />
                                            </div>
                                            <button
                                                onClick={handleAddMaterial}
                                                disabled={!selectedMaterialName}
                                                className="h-10 bg-primary hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg px-4 flex items-center justify-center transition-colors shadow-sm"
                                            >
                                                <span className="material-symbols-outlined font-bold">add</span>
                                            </button>
                                        </div>

                                        {/* Procedure Linker inside Modal */}
                                        <div>
                                            <label className="block text-[10px] font-black text-slate-500 uppercase mb-1 px-1">Vincular a Procedimiento:</label>
                                            <select
                                                className="w-full h-9 rounded border border-slate-300 bg-white text-slate-900 text-xs px-3 focus:ring-2 focus:ring-primary outline-none font-medium"
                                                value={selectedProcedureForMaterial}
                                                onChange={(e) => setSelectedProcedureForMaterial(e.target.value)}
                                            >
                                                <option value="">(Opcional) General / Sin asignar</option>
                                                {selectedProcedures.map(proc => (
                                                    <option key={proc} value={proc}>{proc}</option>
                                                ))}
                                            </select>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="p-5 border-t border-slate-200 bg-slate-50 rounded-b-lg flex justify-end gap-3">
                                <button
                                    onClick={() => setShowMaterialModal(false)}
                                    className="px-5 py-2.5 text-slate-700 hover:bg-white hover:text-slate-900 hover:shadow-sm rounded-lg font-bold text-sm border border-transparent hover:border-slate-300 transition-all"
                                >
                                    Cerrar
                                </button>
                                <button
                                    onClick={() => setShowMaterialModal(false)}
                                    className="px-6 py-2.5 bg-primary text-white rounded-lg font-bold text-sm shadow-md hover:bg-primary-hover hover:shadow-lg transition-all transform active:scale-95"
                                >
                                    Guardar Cambios
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }
            {showSurgeryForm && !isNew && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/60 backdrop-blur-md p-4 overflow-hidden">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl max-h-[90vh] overflow-hidden flex flex-col border border-slate-200">
                        <div className="flex-1 overflow-y-auto">
                            <SurgeryForm
                                surgery={{
                                    id: id!,
                                    patient: patientName,
                                    procedure: selectedProcedures.join(', '),
                                    date: surgeryDate,
                                    startTime: startTime,
                                    estimatedDuration: Number(estimatedDuration),
                                    status: status,
                                    doctor: doctors.find(d => d.id === selectedDoctorId)?.full_name || 'Sin asignar'
                                } as any}
                                onClose={() => setShowSurgeryForm(false)}
                                onSave={() => {
                                    setShowSurgeryForm(false);
                                    fetchSurgeryDetails(id!);
                                }}
                            />
                        </div>
                    </div>
                </div>
            )}
        </div >
    );
};