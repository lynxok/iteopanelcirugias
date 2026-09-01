import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../../src/lib/supabase';
import { captureError } from '../../../src/lib/errorLogger';
import { createOrUpdateDoctorAlert, syncSurgeryAlerts } from '../../../src/lib/alertService';
import { UserRole, SurgeryMaterial, SurgeryDocument } from '../../../types';
import { generateUUID } from '../../../src/lib/uuid';
import { DOCUMENT_CATEGORIES, FALLBACK_DOCTORS, FALLBACK_VENDORS, FALLBACK_COVERAGES } from '../constants';
import { checkAccess, checkFieldPermission, LEGACY_PERMISSIONS } from '../../../src/lib/permissions';

interface UseSurgeryDetailProps {
    id?: string;
    user: any;
    navigationState: any;
}

export const useSurgeryDetail = ({ id, user, navigationState }: UseSurgeryDetailProps) => {
    const isNew = !id || id === 'new';
    const navigate = useNavigate();
    const currentUserRole = user?.role as UserRole;
    const [tempId] = useState(generateUUID());
    const isSavingRef = useRef(false);

    // --- UI/Loading State ---
    const [loading, setLoading] = useState(!isNew);
    const [saving, setSaving] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [idCopied, setIdCopied] = useState(false);
    const [showSurgeryForm, setShowSurgeryForm] = useState(false);

    // --- Clinical Data State ---
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
    const [sexo, setSexo] = useState('');
    
    const [diagnosis, setDiagnosis] = useState('');
    const [selectedProcedures, setSelectedProcedures] = useState<string[]>([]);
    const [surgerySide, setSurgerySide] = useState('');
    const [anesthesiaType, setAnesthesiaType] = useState('');
    const [preOpNotes, setPreOpNotes] = useState('');
    const [preOpExams, setPreOpExams] = useState(false);
    const [preOpDate, setPreOpDate] = useState('');
    const [consentSigned, setConsentSigned] = useState(false);
    const [authDate, setAuthDate] = useState('');
    const [medicalCoverage, setMedicalCoverage] = useState('');
    const [currentNomencladorType, setCurrentNomencladorType] = useState('AOTER / NN');

    // --- Logistics State ---
    const [surgeryDate, setSurgeryDate] = useState('');
    const [startTime, setStartTime] = useState('');
    const [estimatedDuration, setEstimatedDuration] = useState('');
    const [status, setStatus] = useState<string>('pending_validation');
    const [priority, setPriority] = useState<string>('elective');
    const [isGuardia, setIsGuardia] = useState(false);
    const [selectedOrId, setSelectedOrId] = useState('301');
    const [anesthesiologistId, setAnesthesiologistId] = useState('');
    const [selectedDoctorId, setSelectedDoctorId] = useState('');
    const [referringDoctorId, setReferringDoctorId] = useState('');
    const [selectedVendor, setSelectedVendor] = useState('');
    const [materials, setMaterials] = useState<SurgeryMaterial[]>([]);
    const [requiresProsthesisState, setRequiresProsthesis] = useState(false);
    const requiresProsthesis = materials.length > 0;
    const [doctorPriorityValidated, setDoctorPriorityValidated] = useState(false);
    const [createdAt, setCreatedAt] = useState<string | null>(null);

    // --- Approvals & Validation ---
    const [approvals, setApprovals] = useState({ ortho: false, admission: false, or: false });
    const [orthoValidationDate, setOrthoValidationDate] = useState<string | null>(null);
    const [orthoValidatedByName, setOrthoValidatedByName] = useState<string | null>(null);
    const [admissionValidationDate, setAdmissionValidationDate] = useState<string | null>(null);
    const [orValidationDate, setOrValidationDate] = useState<string | null>(null);
    const [orValidatedByName, setOrValidatedByName] = useState<string | null>(null);
    
    // --- Internacion Notification ---
    const [internacionNotified, setInternacionNotified] = useState(false);
    const [internacionNotifiedBy, setInternacionNotifiedBy] = useState<string | null>(null);
    const [internacionNotifiedAt, setInternacionNotifiedAt] = useState<string | null>(null);

    // --- Documents ---
    const [documents, setDocuments] = useState<SurgeryDocument[]>([]);
    const [stagedDocuments, setStagedDocuments] = useState<any[]>([]);
    const [uploadCategory, setUploadCategory] = useState('other');
    const [predictedDuration, setPredictedDuration] = useState<number | null>(null);
    const [predictionBasis, setPredictionBasis] = useState<'doctor' | 'general' | null>(null);
    const [predictionCount, setPredictionCount] = useState(0);
    const [isCie10Enabled, setIsCie10Enabled] = useState(false);
    const [patientHistory, setPatientHistory] = useState<any[]>([]);

    // --- Suspension & Reschedule Info ---
    const [suspensionRequested, setSuspensionRequested] = useState(false);
    const [rescheduleRequested, setRescheduleRequested] = useState(false);
    const [requestNote, setRequestNote] = useState('');
    const [suggestedDate, setSuggestedDate] = useState<string | null>(null);
    const [requestUserName, setRequestUserName] = useState('');
    const [suspensionReason, setSuspensionReason] = useState('');
    const [suspensionObservations, setSuspensionObservations] = useState('');
    const [suspendedByName, setSuspendedByName] = useState('');
    const [suspendedAt, setSuspendedAt] = useState('');

    // --- Master Data ---
    const [doctors, setDoctors] = useState<any[]>(FALLBACK_DOCTORS);
    const [availableVendors, setAvailableVendors] = useState<any[]>(FALLBACK_VENDORS);
    const [availableCoverages, setAvailableCoverages] = useState<any[]>([]);
    const [availableORs, setAvailableORs] = useState<any[]>([]);
    const [originalData, setOriginalData] = useState<any>(null);
    const [patientSearchResults, setPatientSearchResults] = useState<any[]>([]);
    const [nomencladorSuggestions, setNomencladorSuggestions] = useState<any[]>([]);

    // --- Modals State ---
    const [suspensionModal, setSuspensionModal] = useState({ isOpen: false, reason: '', observations: '', isDefinitive: false, isEdit: false });
    const [rescheduleModal, setRescheduleModal] = useState({ isOpen: false, newDate: '', newTime: '' });
    const [requestRescheduleModal, setRequestRescheduleModal] = useState({ isOpen: false, reason: '', suggestedDate: '' });
    const [requestSuspensionModal, setRequestSuspensionModal] = useState({ isOpen: false, reason: '' });
    const [cie10ModalOpen, setCie10ModalOpen] = useState(false);
    const [nomencladorModalOpen, setNomencladorModalOpen] = useState(false);
    const [patientSearchTerm, setPatientSearchTerm] = useState('');
    const [isSearchingPatient, setIsSearchingPatient] = useState(false);
    const [isSearchingNomenclador, setIsSearchingNomenclador] = useState(false);
    const [procedureInputText, setProcedureInputText] = useState('');
    const [duplicateSurgery, setDuplicateSurgery] = useState<any>(null);
    const [isAmbulatory, setIsAmbulatory] = useState(false);

    // --- Fetching Logic ---
    const fetchSurgeryDetails = async (surgeryId: string) => {
        try {
            setLoading(true);
            const { data, error } = await supabase
                .from('surgeries')
                .select(`
                    *,
                    patients (*),
                    operating_rooms (name),
                    surgery_materials (*)
                `)
                .eq('id', surgeryId)
                .maybeSingle();

            if (error) throw error;
            if (!data) {
                console.warn('Cirugía no encontrada:', surgeryId);
                setLoading(false);
                return;
            }
            if (data) {
                setOriginalData(data);
                setPatientName(data.patients?.full_name || '');
                setDocumentNumber(data.patients?.document_number || '');
                setNuc(data.nuc || data.patients?.nuc || '');
                setMedicalRecordNumber(data.patients?.medical_record_number || '');
                setBirthDate(data.patients?.birth_date || '');
                setPhone(data.patients?.phone || '');
                setAddress(data.patients?.address || '');
                setProvince(data.patients?.province || '');
                setLocality(data.patients?.locality || '');
                setAllergies(data.patients?.allergies || '');
                setSexo(data.patients?.sexo || '');

                // Fetch patient history after we know the patient
                if (data.patients?.document_number) {
                    fetchPatientHistory(data.patients.document_number, surgeryId);
                }
                
                setDiagnosis(data.diagnosis || '');
                setSelectedProcedures(data.procedure_name ? data.procedure_name.split(' + ') : []);
                setSurgeryDate(data.surgery_date || '');
                setStartTime(data.start_time || '');
                setEstimatedDuration(data.estimated_duration?.toString() || '');
                setStatus(data.status);
                setPriority(data.priority);
                setIsGuardia(data.is_guardia || false);
                setIsAmbulatory(data.is_ambulatory || false);
                setSurgerySide(data.surgery_side || '');
                setSelectedOrId(data.operating_room_id || '');
                setAnesthesiaType(data.anesthesia_type || '');
                setAnesthesiologistId(data.anesthesiologist_id || '');
                setSelectedDoctorId(data.doctor_id || '');
                setReferringDoctorId(data.referring_doctor_id || '');
                setSelectedVendor(data.vendor_id || '');
                setRequiresProsthesis(data.requires_prosthesis || false);
                setDoctorPriorityValidated(data.doctor_priority_validated || false);
                setCreatedAt(data.created_at);

                setApprovals({
                    ortho: data.ortho_validated || false,
                    admission: data.admission_validated || false,
                    or: data.or_validated || false
                });
                setOrthoValidationDate(data.ortho_validation_date);
                setOrthoValidatedByName(data.ortho_validated_by_name);
                setAdmissionValidationDate(data.admission_validation_date);
                setOrValidationDate(data.or_validation_date);
                setOrValidatedByName(data.or_validated_by_name);

                setPreOpExams(data.pre_op_exams || false);
                setPreOpDate(data.pre_op_date || '');
                setPreOpNotes(data.pre_op_notes || '');
                setConsentSigned(data.consent_signed || false);
                setAuthDate(data.authorization_date || '');
                setMedicalCoverage(data.medical_coverage || '');

                setInternacionNotified(data.internacion_notified || false);
                setInternacionNotifiedBy(data.internacion_notified_by);
                setInternacionNotifiedAt(data.internacion_notified_at);

                setSuspensionRequested(data.suspension_requested || false);
                setRescheduleRequested(data.reschedule_requested || false);
                setRequestNote(data.request_note || '');
                setSuggestedDate(data.suggested_date);
                setRequestUserName(data.request_user_name || '');
                setSuspensionReason(data.suspension_reason || '');
                setSuspensionObservations(data.suspension_observations || '');
                setSuspendedByName(data.suspended_by_name || '');
                setSuspendedAt(data.suspended_at || '');

                if (data.surgery_materials) {
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
                }
            }
        } catch (err) {
            console.error('Error fetching surgery details:', err);
            captureError(err, { context: 'useSurgeryDetail.fetchSurgeryDetails', user });
        } finally {
            setLoading(false);
        }
    };

    const fetchPatientHistory = async (docNumber: string, currentSurgeryId: string) => {
        try {
            const { data: patientData } = await supabase
                .from('patients')
                .select('id')
                .eq('document_number', docNumber)
                .maybeSingle();
            if (!patientData) return;
            const { data, error } = await supabase
                .from('surgeries')
                .select('id, surgery_date, procedure_name, status, doctors!surgeries_doctor_id_fkey(full_name)')
                .eq('patient_id', patientData.id)
                .neq('id', currentSurgeryId)
                .order('surgery_date', { ascending: false })
                .limit(10);
            if (error) throw error;
            setPatientHistory(data || []);
        } catch (err) {
            console.error('Error fetching patient history:', err);
        }
    };

    const fetchDocuments = async (surgeryId: string) => {
        try {
            const { data, error } = await supabase
                .from('surgery_documents')
                .select('*')
                .eq('surgery_id', surgeryId)
                .order('created_at', { ascending: false });
            if (error) throw error;
            setDocuments(data || []);
        } catch (err) {
            console.error('Error fetching documents:', err);
        }
    };

    const fetchDoctors = async () => {
        try {
            const { data, error } = await supabase
                .from('doctors')
                .select('*')
                .eq('active', true)
                .order('full_name');
            if (error) throw error;
            if (data && data.length > 0) setDoctors(data);
        } catch (err) {
            console.error('Error fetching doctors:', err);
        }
    };

    const fetchVendors = async () => {
        try {
            const { data, error } = await supabase.from('vendors').select('*').order('name');
            if (error) throw error;
            if (data) setAvailableVendors(data);
        } catch (err) {
            console.error('Error fetching vendors:', err);
        }
    };

    const fetchCoverages = async () => {
        try {
            const { data, error } = await supabase.from('coverages').select('*').order('name');
            if (error) throw error;
            if (data) setAvailableCoverages(data);
        } catch (err) {
            console.error('Error fetching coverages:', err);
        }
    };

    const fetchORs = async () => {
        try {
            const { data, error } = await supabase.from('operating_rooms').select('*').order('name');
            if (error) throw error;
            if (data) setAvailableORs(data);
        } catch (err) {
            console.error('Error fetching ORs:', err);
        }
    };

    const fetchConfig = async () => {
        try {
            // Placeholder for future config fetches
        } catch (err) {
            console.error('Error fetching config:', err);
        }
    };

    // --- Lifecycle ---
    useEffect(() => {
        if (isNew) {
            // Reset volatile states
            setInternacionNotified(false);
            setPatientName('');
            setDocumentNumber('');
            setDiagnosis('');
            setSelectedProcedures([]);
            setApprovals({ ortho: false, admission: false, or: false });
            setStatus('pending_validation');
            setPriority('elective');
            setMaterials([]);
            setDocuments([]);
            setRequiresProsthesis(false);
            setIsGuardia(currentUserRole === 'Administrativo de Guardias');

            if (navigationState?.prefillDate) setSurgeryDate(navigationState.prefillDate);
            if (navigationState?.prefillOr) setSelectedOrId(navigationState.prefillOr);
            if (navigationState?.prefillTime) setStartTime(navigationState.prefillTime);
            if (navigationState?.isPastRegistration) {
                setStatus('completed');
                setPriority('urgent');
            }
        }
        
        fetchDoctors();
        fetchVendors();
        fetchCoverages();
        fetchORs();
        if (id && id !== 'new') {
            fetchSurgeryDetails(id);
            fetchDocuments(id);
        }
    }, [id, isNew]);

    // Update nomenclador type based on selected medical coverage
    useEffect(() => {
        if (!medicalCoverage || availableCoverages.length === 0) {
            setCurrentNomencladorType('AOTER / NN');
            return;
        }
        
        const coverage = availableCoverages.find(c => c.name.toLowerCase() === medicalCoverage.toLowerCase());
        const isOser = coverage?.nomenclador_type === 'OSER' || 
                       coverage?.name.toUpperCase().includes('OSER') || 
                       medicalCoverage.toUpperCase().includes('OSER');
        
        if (isOser) {
            setCurrentNomencladorType('OSER');
        } else {
            setCurrentNomencladorType('AOTER / NN');
        }
    }, [medicalCoverage, availableCoverages]);

    // --- Handlers ---
    const handleCopyId = () => {
        if (id) {
            navigator.clipboard.writeText(id);
            setIdCopied(true);
            setTimeout(() => setIdCopied(false), 2000);
        }
    };

    const handleToggleInternacion = async () => {
        if (isNew) {
            setInternacionNotified(!internacionNotified);
            setInternacionNotifiedBy(user?.name || 'Usuario');
            setInternacionNotifiedAt(new Date().toISOString());
        } else {
            const newValue = !internacionNotified;
            const notifier = newValue ? (user?.name || 'Usuario') : null;
            const notifiedAt = newValue ? new Date().toISOString() : null;

            try {
                const { error } = await supabase
                    .from('surgeries')
                    .update({
                        internacion_notified: newValue,
                        internacion_notified_by: notifier,
                        internacion_notified_at: notifiedAt
                    })
                    .eq('id', id);

                if (error) throw error;
                setInternacionNotified(newValue);
                setInternacionNotifiedBy(notifier);
                setInternacionNotifiedAt(notifiedAt);
            } catch (err) {
                console.error('Error updating internacion status:', err);
            }
        }
    };

    // Prediction Logic
    useEffect(() => {
        const fetchPredictedDuration = async () => {
            if (selectedProcedures.length === 0) { setPredictedDuration(null); setPredictionBasis(null); setPredictionCount(0); return; }
            const mainProcedure = selectedProcedures[0];
            const codeMatch = mainProcedure.match(/\[(.*?)\]/);
            if (!codeMatch) { setPredictedDuration(null); setPredictionBasis(null); setPredictionCount(0); return; }
            const code = codeMatch[1];
            try {
                const { data, error } = await supabase.from('surgeries').select('actual_start_time, actual_end_time, doctor_id').eq('status', 'completed').not('actual_start_time', 'is', null).not('actual_end_time', 'is', null).ilike('procedure_name', `%[${code}]%`);
                if (error) throw error;
                if (!data || data.length === 0) { setPredictedDuration(null); setPredictionBasis(null); setPredictionCount(0); return; }
                const validSurgeries = data.map(s => {
                    const [sh, sm] = s.actual_start_time.split(':').map(Number);
                    const [eh, em] = s.actual_end_time.split(':').map(Number);
                    const duration = (eh * 60 + em) - (sh * 60 + sm);
                    return { duration, doctorId: s.doctor_id };
                }).filter(s => s.duration > 5 && s.duration < 600);
                if (validSurgeries.length === 0) { setPredictedDuration(null); setPredictionBasis(null); setPredictionCount(0); return; }
                const doctorSurgeries = validSurgeries.filter(s => s.doctorId === selectedDoctorId);
                if (doctorSurgeries.length >= 3) {
                    const avg = Math.round(doctorSurgeries.reduce((acc, s) => acc + s.duration, 0) / doctorSurgeries.length);
                    setPredictedDuration(avg); setPredictionBasis('doctor'); setPredictionCount(doctorSurgeries.length);
                } else if (validSurgeries.length >= 3) {
                    const avg = Math.round(validSurgeries.reduce((acc, s) => acc + s.duration, 0) / validSurgeries.length);
                    setPredictedDuration(avg); setPredictionBasis('general'); setPredictionCount(validSurgeries.length);
                } else { setPredictedDuration(null); setPredictionBasis(null); setPredictionCount(0); }
            } catch (err) { console.error('Error in prediction:', err); }
        };
        fetchPredictedDuration();
    }, [selectedProcedures, selectedDoctorId]);

    // Config Logic
    useEffect(() => {
        supabase.from('admin_settings').select('value').eq('key', 'cie10_enabled').single()
            .then(({ data }) => { if (data) setIsCie10Enabled(data.value === 'true'); });
    }, []);

    const handlePatientSearch = async (term: string) => {
        setPatientSearchTerm(term);
        if (term.length < 3) {
            setPatientSearchResults([]);
            return;
        }
        setIsSearchingPatient(true);
        try {
            const { data, error } = await supabase
                .from('patients')
                .select('*')
                .or(`full_name.ilike.%${term}%,document_number.ilike.%${term}%`)
                .limit(5);
            if (error) throw error;
            setPatientSearchResults(data || []);
        } catch (err) {
            console.error('Error searching patients:', err);
        } finally {
            setIsSearchingPatient(false);
        }
    };

    const handleAddProcedure = (proc: string) => {
        if (!selectedProcedures.includes(proc)) setSelectedProcedures([...selectedProcedures, proc]);
        setNomencladorSuggestions([]);
    };

    const handleRemoveProcedure = (index: number) => {
        setSelectedProcedures(selectedProcedures.filter((_, i) => i !== index));
    };

    const handleSelectPatient = (patient: any) => {
        setPatientName(patient.full_name);
        setDocumentNumber(patient.document_number);
        setNuc(patient.nuc ? String(patient.nuc) : '');
        setMedicalRecordNumber(patient.medical_record_number || '');
        setBirthDate(patient.birth_date || '');
        setPhone(patient.phone || '');
        setAddress(patient.address || '');
        setProvince(patient.province || '');
        setLocality(patient.locality || '');
        setAllergies(patient.allergies || '');
        setSexo(patient.sexo || '');
        setPatientSearchResults([]);
    };

    const handleProcedureInputChange = (val: string) => {
        setProcedureInputText(val);
        handleNomencladorSearch(val);
    };

    const handleNomencladorSearch = async (term: string) => {
        setIsSearchingNomenclador(true);
        try {
            const defaultItem = { code: '00.00.00', description: 'A DEFINIR', type: '' };
            const cleanTerm = term.trim().toLowerCase();
            const allowedTypes = currentNomencladorType === 'OSER' ? ['OSER'] : ['AOTER', 'NN'];

            if (cleanTerm.length < 2) {
                setNomencladorSuggestions([]);
                return;
            }

            let query = supabase
                .from('nomenclador_items')
                .select('code, description, type')
                .eq('active', true)
                .or(`description.ilike.%${cleanTerm}%,code.ilike.%${cleanTerm}%`);

            if (allowedTypes.length === 1) {
                query = query.eq('type', allowedTypes[0]);
            } else {
                query = query.in('type', allowedTypes);
            }

            let { data, error } = await query.limit(15);
            if (error) throw error;
            const matchesADefinir = 'a definir'.includes(cleanTerm) || '00.00.00'.includes(cleanTerm) || '000000'.includes(cleanTerm);
            const results = data || [];
            if (matchesADefinir && !results.some(i => i.code === '00.00.00')) {
                setNomencladorSuggestions([defaultItem, ...results]);
            } else {
                setNomencladorSuggestions(results);
            }
        } catch (err) {
            console.error('Error searching nomenclador:', err);
        } finally {
            setIsSearchingNomenclador(false);
        }
    };

    const calculateAge = (dateStr: string): number | null => {
        if (!dateStr) return null;
        const today = new Date();
        const birth = new Date(dateStr);
        let age = today.getFullYear() - birth.getFullYear();
        const monthDiff = today.getMonth() - birth.getMonth();
        if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) age--;
        return age >= 0 ? age : null;
    };

    // Helpers
    const parseLocalYMD = (dateStr: string) => {
        if (!dateStr) return null;
        const parts = dateStr.split('-');
        if (parts.length !== 3) return null;
        return new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
    };

    const getDaysRemaining = (targetDateStr: string) => {
        const target = parseLocalYMD(targetDateStr);
        if (!target) return null;
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        return Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    };

    const getFileUrl = (path: string) => {
        const { data } = supabase.storage.from('documents').getPublicUrl(path);
        return data.publicUrl;
    };

    const checkDateValidity = () => {
        const surg = parseLocalYMD(surgeryDate);
        const exam = parseLocalYMD(preOpDate);
        if (!surg || !exam) return false;
        if (exam.getTime() > surg.getTime()) return false;
        const diffDays = Math.ceil((surg.getTime() - exam.getTime()) / (1000 * 60 * 60 * 24));
        return diffDays <= 30;
    };

    const getChanges = (prev: any, current: any) => {
        const diffs: string[] = [];
        if (prev.surgery_date !== current.surgery_date) diffs.push(`Fecha: ${prev.surgery_date || 'N/A'} -> ${current.surgery_date || 'N/A'}`);
        if (prev.start_time !== current.start_time) diffs.push(`Hora: ${prev.start_time || 'N/A'} -> ${current.start_time || 'N/A'}`);
        if (prev.status !== current.status) diffs.push(`Estado: ${prev.status} -> ${current.status}`);
        return diffs;
    };
    const handleDeleteSurgery = async () => {
        if (!confirm('ADVERTENCIA: ¿Está seguro que desea eliminar esta cirugía PERMANENTEMENTE? Esta acción no se puede deshacer.')) return;
        try {
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

            const { error } = await supabase.from('surgeries').delete().eq('id', id);
            if (error) throw error;
            alert('Cirugía eliminada correctamente.');
            navigate('/surgeries');
        } catch (err: any) {
            console.error('Error deleting surgery:', err);
            alert('Error al eliminar la cirugía: ' + (err.message || 'Error desconocido'));
        }
    };

    const handleVendorNotification = async (customMessage?: string, type: 'manual' | 'scheduled' | 'suspended' | 'rescheduled' = 'manual') => {
        const vendor = availableVendors.find(v => v.id === selectedVendor);
        if (!vendor) {
            if (type === 'manual') alert('Seleccione un proveedor primero.');
            return;
        }

        const dateFormatted = surgeryDate ? new Date(surgeryDate + 'T12:00:00').toLocaleDateString('es-AR') : 'Pendiente';
        const proceduresText = selectedProcedures.join(' + ') || 'No especificado';
        const doctorObj = doctors.find(d => d.id === selectedDoctorId);
        const doctorName = doctorObj?.full_name || 'No especificado';
        
        const materialsText = materials.length > 0 
            ? '\n\n*Materiales Requeridos:*\n' + materials.map(m => `• ${m.name} (Cant: ${m.quantity})`).join('\n')
            : '\n\n*Materiales:* Pendiente de especificación';

        let title = '*NOTIFICACIÓN DE CIRUGÍA - LYNX*';
        let footer = '_Por favor confirmar recepción y disponibilidad de materiales._';

        if (type === 'scheduled') title = '*NUEVA CIRUGÍA PROGRAMADA - LYNX*';
        if (type === 'suspended') {
            title = '*⚠️ CIRUGÍA SUSPENDIDA - LYNX*';
            footer = '*FAVOR DE NO ENVIAR MATERIALES.*';
        }
        if (type === 'rescheduled') title = '*🔄 CIRUGÍA REPROGRAMADA - LYNX*';

        const message = customMessage || `${title}\n\n` +
            `*Paciente:* ${patientName}\n` +
            `*DNI:* ${documentNumber || 'No especificado'}\n` +
            `*NUC:* ${nuc || 'No especificado'}\n` +
            `*Cirujano:* ${doctorName}\n` +
            `*Procedimiento:* ${proceduresText}\n` +
            `*Fecha:* ${dateFormatted}\n` +
            `*Hora:* ${startTime || 'Pendiente'}\n` +
            `${materialsText}\n\n` +
            `${footer}`;

        if (vendor.notification_method === 'telegram' && vendor.telegram_chat_id) {
            try {
                const token = import.meta.env.VITE_TELEGRAM_BOT_TOKEN;
                if (!token) throw new Error('Token de Telegram no configurado.');
                const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ chat_id: vendor.telegram_chat_id, text: message, parse_mode: 'Markdown' })
                });
                const data = await response.json();
                if (data.ok) {
                    if (type === 'manual') alert('Notificación enviada por Telegram exitosamente.');
                    supabase.from('audit_logs').insert({
                        user_name: user?.name || 'Sistema',
                        user_role: currentUserRole,
                        action: 'NOTIFICATION',
                        resource: 'Proveedor',
                        resource_id: vendor.id,
                        description: `Notificación de ${type} enviada a ${vendor.name} vía Telegram`,
                        meta: { type, method: 'telegram', chat_id: vendor.telegram_chat_id }
                    }).then();
                } else {
                    throw new Error(data.description || 'Error en Telegram API');
                }
            } catch (error: any) {
                console.error('Error sending Telegram notification:', error);
                if (type === 'manual') alert(`Error al enviar por Telegram: ${error.message}`);
            }
        } else {
            const phoneNumber = (vendor.whatsapp_number || '').replace(/\D/g, '');
            if (!phoneNumber) {
                if (type === 'manual') alert('El proveedor no tiene un número de WhatsApp configurado.');
                return;
            }
            const encodedMessage = encodeURIComponent(message);
            const waUrl = `https://wa.me/${phoneNumber}?text=${encodedMessage}`;
            window.open(waUrl, '_blank');
            supabase.from('audit_logs').insert({
                user_name: user?.name || 'Usuario',
                user_role: currentUserRole,
                action: 'NOTIFICATION',
                resource: 'Proveedor',
                resource_id: vendor.id,
                description: `Apertura de WhatsApp para notificación de ${type} a ${vendor.name}`,
                meta: { type, method: 'whatsapp', phone: phoneNumber }
            }).then();
        }
    };

    const handleSurgerySave = async () => {
        if (isSavingRef.current) return;

        const hasValidProcedure = selectedProcedures.length > 0 || 
            (procedureInputText && (
                procedureInputText.toLowerCase().includes('a definir') ||
                procedureInputText.includes('00.00.00') ||
                procedureInputText.includes('000000')
            ));

        if (!patientName || !hasValidProcedure) {
            alert('Por favor complete el nombre del paciente y al menos un procedimiento.');
            return;
        }

        // Si el procedimiento en selectedProcedures está vacío pero se ingresó A DEFINIR en el input, agregarlo automáticamente
        if (selectedProcedures.length === 0 && procedureInputText.trim()) {
            selectedProcedures.push(procedureInputText.trim());
        }

        const selectedOR = availableORs.find(or => String(or.id) === String(selectedOrId));
        const isCurrentlyAmbulatory = !!isAmbulatory || !!selectedOR?.is_ambulatory;

        if (!isCurrentlyAmbulatory && preOpExams && !preOpDate) {
            alert('Por favor ingrese la fecha de realización de los exámenes pre-quirúrgicos.');
            return;
        }

        if (requiresProsthesis && materials.length === 0) {
            if (!window.confirm('Usted marcó que la cirugía lleva prótesis pero no ha cargado ningún material. ¿Desea continuar?')) return;
        }

        isSavingRef.current = true;
        setSaving(true);
        try {
            const cleanDni = documentNumber?.trim();
            if (!cleanDni) {
                alert('El DNI es obligatorio.');
                setSaving(false);
                return;
            }

            // Check if active surgery with the same NUC already exists
            if (nuc && String(nuc).trim()) {
                const cleanNuc = String(nuc).trim();
                let query = supabase
                    .from('surgeries')
                    .select(`
                        id,
                        surgery_date,
                        procedure_name,
                        status,
                        diagnosis,
                        priority,
                        is_guardia,
                        medical_coverage,
                        requires_prosthesis,
                        doctor_id,
                        nuc,
                        doctors(full_name),
                        patients!inner(
                            id,
                            full_name,
                            document_number,
                            medical_record_number,
                            birth_date,
                            phone,
                            address,
                            province,
                            locality,
                            allergies
                        )
                    `)
                    .eq('nuc', cleanNuc)
                    .not('status', 'in', '("completed","cancelled","suspended")');

                if (!isNew && id) {
                    query = query.neq('id', id);
                }

                const { data: dupSurgeries, error: dupError } = await query.limit(1);

                if (dupError) {
                    console.error('Error al comprobar NUC duplicado:', dupError);
                } else if (dupSurgeries && dupSurgeries.length > 0) {
                    setDuplicateSurgery(dupSurgeries[0]);
                    setSaving(false);
                    return;
                }
            }


            // Status Logic
            let currentApprovals = { ...approvals };
            const isTecnico = currentUserRole === 'Tecnico';
            if (isTecnico && surgeryDate && !currentApprovals.or) currentApprovals.or = true;

            const needsOrtho = (materials && materials.length > 0) || requiresProsthesis;
            if (!needsOrtho || !vendorRequiresValidation) currentApprovals.ortho = true;

            let finalStatus = status;
            if (currentApprovals.ortho && currentApprovals.admission) {
                finalStatus = (currentApprovals.or && surgeryDate) ? 'scheduled' : 'waiting_date';
            } else {
                finalStatus = 'pending_validation';
            }

            if (['suspended', 'cancelled', 'delayed', 'completed', 'in_progress'].includes(status)) finalStatus = status;

            // Validation for ART users
            const isArtUser = user?.role?.toLowerCase() === 'oficina art' || user?.role?.toLowerCase() === 'art';
            if (isArtUser && (!medicalCoverage || !medicalCoverage.trim())) {
                alert('⚠️ Como usuario de ROL ART, debe seleccionar o asignar obligatoriamente una cobertura médica para poder crear/guardar la cirugía.');
                setSaving(false);
                return;
            }

            const isADefinir = selectedProcedures.length === 0 || selectedProcedures.some(p => p.toUpperCase().includes('A DEFINIR') || p.includes('00.00.00'));

            // Date validation for scheduled or assigning date/time
            if (surgeryDate || finalStatus === 'scheduled') {
                if (isADefinir) {
                    alert('⚠️ No se puede programar en calendario una cirugía con procedimiento "A DEFINIR". El médico debe especificar la práctica o código de nomenclador primero.');
                    setSaving(false);
                    return;
                }
            }

            if (finalStatus === 'scheduled') {
                if (!surgeryDate || !startTime || !estimatedDuration) {
                    alert('Complete fecha, hora y duración.');
                    setSaving(false);
                    return;
                }
            }

            // Patient Logic
            let patientId;
            const { data: patientData } = await supabase.from('patients').select('id').eq('document_number', cleanDni).maybeSingle();
            const patientPayload = {
                full_name: patientName,
                medical_record_number: medicalRecordNumber || null,
                birth_date: birthDate || null,
                phone: phone || null,
                address: address || null,
                province: province || null,
                locality: locality || null,
                allergies: allergies || null,
                sexo: sexo || null,
                insurance_name: medicalCoverage || null
            };

            if (patientData) {
                patientId = patientData.id;
                await supabase.from('patients').update(patientPayload).eq('id', patientId);
            } else {
                const { data: newP } = await supabase.from('patients').insert({ ...patientPayload, document_number: cleanDni }).select('id').single();
                patientId = newP.id;
            }

            // Surgery Payload
            const dateChanged = !isNew && originalData?.surgery_date && originalData.surgery_date !== (surgeryDate || null);
            const finalInternacionNotified = dateChanged ? false : internacionNotified;
            const finalInternacionNotifiedBy = dateChanged ? null : internacionNotifiedBy;
            const finalInternacionNotifiedAt = dateChanged ? null : internacionNotifiedAt;

            const selectedOR = availableORs.find(or => String(or.id) === String(selectedOrId));
            const computedIsAmbulatory = !!isAmbulatory || !!selectedOR?.is_ambulatory;

            const surgeryPayload = {
                patient_id: patientId,
                nuc: nuc ? Number(nuc) : null,
                doctor_id: isNew && user?.role === 'Medico' ? user.doctorId : (selectedDoctorId || null),
                referring_doctor_id: referringDoctorId || null,
                procedure_name: selectedProcedures.join(' + '),
                diagnosis: diagnosis || null,
                surgery_date: surgeryDate || null,
                start_time: startTime || null,
                estimated_duration: estimatedDuration || 60,
                status: finalStatus,
                priority,
                is_guardia: isGuardia,
                is_ambulatory: isAmbulatory,
                surgery_side: surgerySide || null,
                operating_room_id: selectedOrId || null,
                anesthesia_type: anesthesiaType || null,
                anesthesiologist_id: anesthesiologistId || null,
                ortho_validated: currentApprovals.ortho,
                ortho_validation_date: currentApprovals.ortho ? (orthoValidationDate || new Date().toISOString()) : null,
                ortho_validated_by_name: currentApprovals.ortho ? (orthoValidatedByName || (!needsOrtho ? 'Sistema (No Requiere)' : user?.name)) : null,
                admission_validated: computedIsAmbulatory ? true : approvals.admission,
                admission_validation_date: computedIsAmbulatory ? (admissionValidationDate || new Date().toISOString()) : (approvals.admission ? (admissionValidationDate || new Date().toISOString()) : null),
                or_validated: currentApprovals.or,
                or_validation_date: currentApprovals.or ? (orValidationDate || new Date().toISOString()) : null,
                or_validated_by_name: currentApprovals.or ? (orValidatedByName || (isTecnico ? user?.name : 'Usuario')) : null,
                pre_op_exams: computedIsAmbulatory ? true : preOpExams,
                pre_op_date: preOpDate || null,
                pre_op_notes: preOpNotes || null,
                consent_signed: computedIsAmbulatory ? true : consentSigned,
                authorization_date: authDate || null,
                medical_coverage: medicalCoverage || null,
                internacion_notified: finalInternacionNotified,
                internacion_notified_by: finalInternacionNotifiedBy,
                internacion_notified_at: finalInternacionNotifiedAt,
                requires_prosthesis: requiresProsthesis,
                vendor_id: selectedVendor || null,
                doctor_priority_validated: priority === 'urgent' ? true : doctorPriorityValidated,
                ...(isNew ? { created_by_role: user?.role } : {})
            };

            let currentSurgeryId = id;
            if (isNew) {
                const { data: newS } = await supabase.from('surgeries').insert(surgeryPayload).select('id').single();
                currentSurgeryId = newS.id;
            } else {
                await supabase.from('surgeries').update(surgeryPayload).eq('id', id);
                if (dateChanged) {
                    setInternacionNotified(false);
                    setInternacionNotifiedBy(null);
                    setInternacionNotifiedAt(null);
                }
            }

            // Sync Materials
            if (!isNew) await supabase.from('surgery_materials').delete().eq('surgery_id', currentSurgeryId!);
            if (materials.length > 0) {
                const matPayload = materials.map(m => ({
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
                await supabase.from('surgery_materials').insert(matPayload);
            }

            // Sync Alerts
            await syncSurgeryAlerts({
                id: currentSurgeryId, surgery_date: surgeryDate, priority, requires_prosthesis: requiresProsthesis,
                vendor_id: selectedVendor || null, ortho_validated: currentApprovals.ortho,
                admission_validated: approvals.admission, or_validated: currentApprovals.or,
                auth_date: authDate || null, materials, patient_name: patientName,
                doctor_id: selectedDoctorId, doctor_priority_validated: doctorPriorityValidated
            }, [...documents, ...stagedDocuments]);

            // Finalize
            if (navigationState?.isPastRegistration) navigate(`/detail/${currentSurgeryId}`);
            else navigate(navigationState?.from || '/surgeries');
        } catch (err: any) {
            console.error('Save error:', err);
            alert('Error al guardar: ' + err.message);
        } finally {
            isSavingRef.current = false;
            setSaving(false);
        }
    };

    const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
        if (!event.target.files || event.target.files.length === 0) return;
        setUploading(true);
        setUploadProgress(10);
        const file = event.target.files[0];
        const fileExt = file.name.split('.').pop();
        const folderId = isNew ? `pending-${tempId}` : id;
        const filePath = `${folderId}/${Date.now()}.${fileExt}`;

        try {
            const { error: uploadError } = await supabase.storage.from('documents').upload(filePath, file);
            if (uploadError) throw uploadError;
            setUploadProgress(60);

            const docMetadata = {
                name: file.name,
                type: DOCUMENT_CATEGORIES.find(c => c.id === uploadCategory)?.name || 'Otro',
                category: uploadCategory,
                file_path: filePath,
                uploaded_by: user?.id
            };

            if (isNew) {
                setStagedDocuments(prev => [...prev, docMetadata]);
                setDocuments(prev => [{ id: generateUUID(), ...docMetadata, created_at: new Date().toISOString() } as any, ...prev]);
            } else {
                await supabase.from('surgery_documents').insert({ ...docMetadata, surgery_id: id });
                await fetchDocuments(id!);
            }
            setUploadProgress(100);
            setTimeout(() => { setUploadProgress(0); setUploadCategory('other'); }, 1000);
        } catch (err: any) {
            alert('Error al subir: ' + err.message);
            setUploadProgress(0);
        } finally {
            setUploading(false);
        }
    };

    const handleDeleteDocument = async (docId: string, filePath: string) => {
        if (!confirm('¿Seguro?')) return;
        try {
            await supabase.storage.from('documents').remove([filePath]);
            if (isNew) {
                setStagedDocuments(prev => prev.filter(d => d.file_path !== filePath));
                setDocuments(prev => prev.filter(d => d.id !== docId));
            } else {
                await supabase.from('surgery_documents').delete().eq('id', docId);
                if (id) await fetchDocuments(id);
            }
        } catch (err) { alert('Error al eliminar'); }
    };

    const handleSuspend = async () => {
        if (isNew || !id) return;
        try {
            const targetStatus = suspensionModal.isDefinitive ? 'cancelled' : 'suspended';
            const updateData: any = {
                suspension_reason: suspensionModal.reason,
                suspension_observations: suspensionModal.observations,
                suspended_by_name: user?.name || 'Sistema',
                suspended_at: new Date().toISOString(),
                status: targetStatus,
                or_validated: false
            };
            await supabase.from('surgeries').update(updateData).eq('id', id);
            setStatus(targetStatus);
            setSuspensionModal({ ...suspensionModal, isOpen: false });
            fetchSurgeryDetails(id);
            alert('Procesado');
        } catch (err) { alert('Error al suspender'); }
    };

    const handleReschedule = async () => {
        if (isNew || !id || !rescheduleModal.newDate) return;
        try {
            await supabase.from('surgeries').update({
                surgery_date: rescheduleModal.newDate,
                start_time: rescheduleModal.newTime,
                status: 'scheduled',
                reschedule_requested: false,
                internacion_notified: false,
                internacion_notified_by: null,
                internacion_notified_at: null
            }).eq('id', id);
            setRescheduleModal({ ...rescheduleModal, isOpen: false });
            setInternacionNotified(false);
            setInternacionNotifiedBy(null);
            setInternacionNotifiedAt(null);
            fetchSurgeryDetails(id);
            alert('Reprogramado');
        } catch (err) { alert('Error al reprogramar'); }
    };

    const handleResolveRequest = async (type: 'suspension' | 'reschedule', action: 'accept' | 'reject') => {
        try {
            const updatePayload: any = { request_note: null, request_date: null, request_user_name: null };
            if (type === 'suspension') {
                updatePayload.suspension_requested = false;
                if (action === 'accept') { setSuspensionModal({ isOpen: true, reason: requestNote, observations: '', isDefinitive: false, isEdit: false }); return; }
            } else {
                updatePayload.reschedule_requested = false;
                if (action === 'accept') { setRescheduleModal({ isOpen: true, newDate: suggestedDate || '', newTime: startTime }); return; }
            }
            await supabase.from('surgeries').update(updatePayload).eq('id', id);
            await supabase.from('system_alerts').update({ status: 'Resolved' }).eq('surgery_id', id).eq('status', 'Active').ilike('type', `%Solicitud%`);
            fetchSurgeryDetails(id!);
        } catch (err) { alert('Error'); }
    };

    // --- Derived Values ---
    const isScheduled = approvals.ortho && approvals.admission && approvals.or;
    const areAllMaterialsConfirmed = materials.length > 0 && materials.every(m => m.isConfirmed);
    const vendorRequiresValidation = availableVendors.find(v => v.id === selectedVendor)?.requires_material_validation ?? true;

    // Sync ortho validation state when materials or vendor validation requirements change
    useEffect(() => {
        const needsOrtho = (materials && materials.length > 0) || requiresProsthesis;
        if (needsOrtho && vendorRequiresValidation) {
            // If it needs validation, but it is currently marked as validated by the system, we reset it
            if (approvals.ortho && orthoValidatedByName === 'Sistema (No Requiere)') {
                setApprovals(prev => ({ ...prev, ortho: false }));
                setOrthoValidationDate(null);
                setOrthoValidatedByName(null);
            }
        } else {
            // If it does NOT need validation, auto-validate it by the system
            if (!approvals.ortho || orthoValidatedByName !== 'Sistema (No Requiere)') {
                setApprovals(prev => ({ ...prev, ortho: true }));
                setOrthoValidationDate(new Date().toISOString());
                setOrthoValidatedByName('Sistema (No Requiere)');
            }
        }
    }, [materials, requiresProsthesis, selectedVendor, vendorRequiresValidation, approvals.ortho, orthoValidatedByName]);

    const [rolePermissions, setRolePermissions] = useState<any>(null);

    useEffect(() => {
        const fetchPermissions = async () => {
            try {
                const { data } = await supabase
                    .from('admin_settings')
                    .select('value')
                    .eq('key', 'role_permissions')
                    .maybeSingle();
                if (data?.value) {
                    setRolePermissions(JSON.parse(data.value));
                }
            } catch (err) {
                console.error('Error fetching role permissions in useSurgeryDetail:', err);
            }
        };
        fetchPermissions();
    }, []);

    const hasEditAccess = checkAccess(rolePermissions || LEGACY_PERMISSIONS, currentUserRole, 'surgeries', 'edit');

    const isReadOnly = !hasEditAccess ||
                       (currentUserRole === 'Administrativo de Guardias' && !isNew && originalData?.created_by_role !== 'Administrativo de Guardias') ||
                       (['completed', 'cancelled'].includes(status) && currentUserRole !== 'SuperAdmin');

    const canEditField = (fieldId: string) => {
        if (isReadOnly) return false;
        return checkFieldPermission(rolePermissions || LEGACY_PERMISSIONS, currentUserRole, 'surgeries', fieldId);
    };

    const canValidate = currentUserRole === 'Ortopedia' || currentUserRole === 'SuperAdmin';
    const canEditList = currentUserRole === 'Ortopedia' || currentUserRole === 'SuperAdmin' || currentUserRole === 'Instrumentadora';

    const getProsthesisAlert = () => {
        if (!vendorRequiresValidation || !requiresProsthesis || areAllMaterialsConfirmed || !surgeryDate) return null;
        const days = getDaysRemaining(surgeryDate);
        if (days === null) return null;
        if (days >= 0 && days <= 14) return { level: 'urgent', message: `URGENTE: Faltan ${days} días. Plazo vencido.` };
        if (days > 14 && days <= 21) return { level: 'warning', message: `PLANIFICACIÓN: Faltan ${days} días.` };
        return null;
    };

    const getAdmissionAlert = () => {
        if (!preOpExams) {
            if (!surgeryDate) return { level: 'normal', message: 'Faltan exámenes pre-quirúrgicos' };
            const days = getDaysRemaining(surgeryDate);
            if (days !== null && days >= 0 && days <= 3 && (currentUserRole === 'Internacion' || currentUserRole === 'SuperAdmin')) {
                return { level: 'critical', message: `ACCIÓN REQUERIDA: Faltan ${days} días. Sin pre-quirúrgicos.` };
            }
            return { level: 'normal', message: 'Faltan exámenes pre-quirúrgicos' };
        }
        if (!consentSigned) return { level: 'normal', message: 'Consentimiento no firmado' };
        return null;
    };

    // --- FINAL EXPORT ---
    return {
        // State
        loading, setLoading, saving, setSaving, uploading, setUploading, uploadProgress, setUploadProgress,
        idCopied, patientName, setPatientName, documentNumber, setDocumentNumber, nuc, setNuc,
        medicalRecordNumber, setMedicalRecordNumber, birthDate, setBirthDate, phone, setPhone,
        address, setAddress, province, setProvince, locality, setLocality, allergies, setAllergies,
        sexo, setSexo,
        diagnosis, setDiagnosis, selectedProcedures, setSelectedProcedures, surgerySide, setSurgerySide,
        anesthesiaType, setAnesthesiaType, preOpNotes, setPreOpNotes, preOpExams, setPreOpExams,
        preOpDate, setPreOpDate, consentSigned, setConsentSigned, authDate, setAuthDate,
        medicalCoverage, setMedicalCoverage, surgeryDate, setSurgeryDate, startTime, setStartTime,
        estimatedDuration, setEstimatedDuration, status, setStatus, priority, setPriority,
        isGuardia, setIsGuardia, selectedOrId, setSelectedOrId, anesthesiologistId, setAnesthesiologistId,
        selectedDoctorId, setSelectedDoctorId, referringDoctorId, setReferringDoctorId,
        selectedVendor, setSelectedVendor, requiresProsthesis, setRequiresProsthesis,
        doctorPriorityValidated, setDoctorPriorityValidated, approvals, setApprovals,
        orthoValidationDate, setOrthoValidationDate, orthoValidatedByName, setOrthoValidatedByName,
        admissionValidationDate, setAdmissionValidationDate, orValidationDate, setOrValidationDate, orValidatedByName, setOrValidatedByName,
        internacionNotified, internacionNotifiedBy, internacionNotifiedAt,
        materials, setMaterials, documents, stagedDocuments,
        uploadCategory, setUploadCategory, predictedDuration, predictionBasis, predictionCount, isCie10Enabled,
        suspensionRequested, rescheduleRequested, requestNote,
        suggestedDate, requestUserName, suspensionReason, suspensionObservations,
        suspendedByName, suspendedAt, doctors, availableVendors, availableCoverages, availableORs,
        originalData, patientSearchResults, nomencladorSuggestions,
        suspensionModal, setSuspensionModal, rescheduleModal, setRescheduleModal,
        requestRescheduleModal, setRequestRescheduleModal, requestSuspensionModal, setRequestSuspensionModal,
        cie10ModalOpen, setCie10ModalOpen, nomencladorModalOpen, setNomencladorModalOpen,
        isCie10ModalOpen: cie10ModalOpen, setIsCie10ModalOpen: setCie10ModalOpen,
        isNomencladorModalOpen: nomencladorModalOpen, setIsNomencladorModalOpen: setNomencladorModalOpen,
        currentNomencladorType, setCurrentNomencladorType,
        patientSearchTerm, isSearchingPatient, isSearchingNomenclador,
        procedureInput: procedureInputText, setProcedureInput: setProcedureInputText, handleProcedureInputChange, duplicateSurgery, setDuplicateSurgery,

        // Derived
        isNew, isScheduled, areAllMaterialsConfirmed, vendorRequiresValidation, isReadOnly, canEditField,
        canValidate, canEditList,
        isAmbulatory, setIsAmbulatory,
        computedIsAmbulatory: !!isAmbulatory || !!availableORs.find(or => String(or.id) === String(selectedOrId))?.is_ambulatory,
        prosthesisAlert: getProsthesisAlert(),
        admissionAlert: getAdmissionAlert(),
        currentUserRole,
        createdAt,
        patientHistory,
        showSurgeryForm, setShowSurgeryForm,
        
        // Helpers
        calculateAge, getDaysRemaining, getFileUrl, checkDateValidity,
        patientAge: calculateAge(birthDate),
        // Methods
        handleCopyId, handleToggleInternacion, handlePatientSearch, handleSelectPatient,
        handleNomencladorSearch, handleAddProcedure, handleRemoveProcedure,
        fetchSurgeryDetails, fetchDocuments,
        handleDeleteSurgery, handleVendorNotification, handleSurgerySave, handleFileUpload,
        handleDeleteDocument, handleSuspend, handleReschedule, handleResolveRequest,
        handleRequestReschedule: async () => {
            if (!requestRescheduleModal.reason.trim()) return;
            setSaving(true);
            try {
                const dateText = requestRescheduleModal.suggestedDate
                    ? ` para el ${new Date(requestRescheduleModal.suggestedDate + 'T12:00:00').toLocaleDateString('es-AR')}`
                    : '';

                const { error: surgeryError } = await supabase
                    .from('surgeries')
                    .update({
                        reschedule_requested: true,
                        request_note: requestRescheduleModal.reason,
                        request_date: new Date().toISOString(),
                        request_user_name: user?.name || 'Enfermería',
                        suggested_date: requestRescheduleModal.suggestedDate || null
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
        },
        handleRequestSuspension: async () => {
            if (!requestSuspensionModal.reason.trim()) return;
            setSaving(true);
            try {
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
        }
    };
};
