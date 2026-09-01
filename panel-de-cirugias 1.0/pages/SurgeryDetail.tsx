import React, { useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../src/lib/AuthContext';
import ProgressBar from '../components/ProgressBar';
import CIE10SelectorModal from '../components/CIE10SelectorModal';
import NomencladorSelectorModal from '../components/NomencladorSelectorModal';
import { TopBanners } from '../components/surgery-detail/TopBanners';
import { SurgeryHeader } from '../components/surgery-detail/SurgeryHeader';
import { PatientSection } from '../components/surgery-detail/PatientSection';
import { ObsRecordingSection } from '../components/surgery-detail/ObsRecordingSection';
import { ClinicalDetailsSection } from '../components/surgery-detail/ClinicalDetailsSection';
import { DocumentationSection } from '../components/surgery-detail/DocumentationSection';
import { PatientHistorySection } from '../components/surgery-detail/PatientHistorySection';
import { LogisticsSection } from '../components/surgery-detail/LogisticsSection';
import { MaterialsSection } from '../components/surgery-detail/MaterialsSection';
import { SUSPENSION_REASONS, DOCUMENT_CATEGORIES } from '../components/surgery-detail/constants';
import { useSurgeryDetail } from '../components/surgery-detail/hooks/useSurgeryDetail';
import { ARGENTINA_LOCATIONS } from '../src/data/locations';
import SurgeryForm from '../components/SurgeryForm';

export const SurgeryDetail: React.FC = () => {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const location = useLocation();
    const navigationState = location.state as any;
    const { user } = useAuth();
    
    // Refs
    const patientInputRef = useRef<HTMLInputElement>(null);

    // Custom Hook: Main Logic & State Orchestrator
    const {
        // UI & Loading
        loading,
        saving,
        isNew,
        isReadOnly,
        showSurgeryForm,
        setShowSurgeryForm,

        // Data & Lists
        doctors,
        availableVendors,
        availableCoverages,
        availableORs,
        patientHistory,

        // Patient State
        patientName, setPatientName,
        documentNumber, setDocumentNumber,
        nuc, setNuc,
        medicalRecordNumber, setMedicalRecordNumber,
        birthDate, setBirthDate,
        patientAge,
        phone, setPhone,
        address, setAddress,
        province, setProvince,
        locality, setLocality,
        allergies, setAllergies,
        sexo, setSexo,

        // Clinical State
        diagnosis, setDiagnosis,
        referringDoctorId, setReferringDoctorId,
        selectedDoctorId, setSelectedDoctorId,
        selectedProcedures, setSelectedProcedures,
        procedureInput, setProcedureInput,
        surgerySide, setSurgerySide,
        preOpNotes, setPreOpNotes,
        preOpExams, setPreOpExams,
        preOpDate, setPreOpDate,
        consentSigned, setConsentSigned,
        authDate, setAuthDate,

        // Logistics State
        surgeryDate, setSurgeryDate,
        startTime, setStartTime,
        estimatedDuration, setEstimatedDuration,
        selectedOrId, setSelectedOrId,
        anesthesiaType, setAnesthesiaType,
        anesthesiologistId, setAnesthesiologistId,
        status, setStatus,
        priority, setPriority,
        isGuardia, setIsGuardia,
        isAmbulatory, setIsAmbulatory, computedIsAmbulatory,
        medicalCoverage, setMedicalCoverage,

        // Materials State
        materials, setMaterials,
        requiresProsthesis, setRequiresProsthesis,
        selectedVendor, setSelectedVendor,
        areAllMaterialsConfirmed,
        vendorRequiresValidation,
        canValidate,
        canEditList,

        // Validation & Alerts
        approvals, setApprovals,
        admissionAlert,
        prosthesisAlert,
        orthoValidationDate, setOrthoValidationDate,
        orthoValidatedByName, setOrthoValidatedByName,
        admissionValidationDate, setAdmissionValidationDate,
        orValidationDate, setOrValidationDate,
        orValidatedByName, setOrValidatedByName,
        checkDateValidity,

        // Predictive Stats
        predictedDuration,
        predictionBasis,
        predictionCount,

        // Search States & Logic
        patientSearchTerm,
        isSearchingPatient,
        patientSearchResults,
        handlePatientSearch,
        handleSelectPatient,
        nomencladorSuggestions,
        isSearchingNomenclador,
        currentNomencladorType,
        handleProcedureInputChange,
        handleNomencladorSearch,
        handleAddProcedure,
        handleRemoveProcedure,

        // Document States & Handlers
        documents,
        uploading,
        uploadProgress,
        uploadCategory, setUploadCategory,
        handleFileUpload,
        handleDeleteDocument,
        getFileUrl,

        // Request States & Logic
        suspensionRequested,
        rescheduleRequested,
        suggestedDate,
        requestNote,
        requestUserName,
        internacionNotified,
        internacionNotifiedBy,
        handleToggleInternacion,
        handleResolveRequest,

        // Modal States
        suspensionModal, setSuspensionModal,
        rescheduleModal, setRescheduleModal,
        requestRescheduleModal, setRequestRescheduleModal,
        requestSuspensionModal, setRequestSuspensionModal,
        isNomencladorModalOpen, setIsNomencladorModalOpen,
        isCie10ModalOpen, setIsCie10ModalOpen,
        isCie10Enabled,

        // Actions
        handleSurgerySave,
        handleDeleteSurgery,
        handleSuspend,
        handleReschedule,
        handleRequestReschedule,
        handleRequestSuspension,
        handleVendorNotification,
        handleCopyId,
        idCopied,
        createdAt,
        fetchSurgeryDetails,
        
        // Faltantes de auditoría
        currentUserRole,
        isScheduled,
        suspensionReason,
        suspensionObservations,
        suspendedByName,
        suspendedAt,
        doctorPriorityValidated,
        setDoctorPriorityValidated,
        duplicateSurgery,
        setDuplicateSurgery,
        originalData,
        canEditField
    } = useSurgeryDetail({ id, user, navigationState });

    const [showComparison, setShowComparison] = React.useState(false);

    const translateStatus = (s: string) => {
        switch (s) {
            case 'pending_validation': return 'Pendiente Validación';
            case 'waiting_date': return 'Esperando Fecha';
            case 'scheduled': return 'Programada';
            case 'in_progress': return 'En Curso';
            case 'completed': return 'Finalizada';
            case 'suspended': return 'Suspendida';
            case 'cancelled': return 'Cancelada';
            case 'delayed': return 'Demorada';
            default: return s;
        }
    };

    const getStatusBadgeClass = (s: string) => {
        switch (s) {
            case 'pending_validation': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
            case 'waiting_date': return 'bg-indigo-100 text-indigo-800 border-indigo-200';
            case 'scheduled': return 'bg-green-100 text-green-800 border-green-200';
            case 'in_progress': return 'bg-blue-100 text-blue-800 border-blue-200';
            case 'completed': return 'bg-slate-100 text-slate-800 border-slate-200';
            case 'suspended': return 'bg-red-100 text-red-800 border-red-200';
            case 'cancelled': return 'bg-red-200 text-red-900 border-red-300';
            default: return 'bg-slate-100 text-slate-800';
        }
    };

    const activeDoctor = doctors.find(d => d.id === selectedDoctorId);
    const activeDoctorName = activeDoctor ? activeDoctor.name : 'Medico_No_Especificado';

    const isArtroscopia = selectedProcedures.some(proc => 
        proc.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").includes("artroscopia")
    );

    const canDelete = currentUserRole === 'SuperAdmin' || currentUserRole === 'Tecnico';

    if (loading) return <div className="flex items-center justify-center h-screen bg-slate-50"><ProgressBar isLoading={true} /></div>;

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

                <TopBanners
                    navigationState={navigationState}
                    suspensionRequested={suspensionRequested}
                    rescheduleRequested={rescheduleRequested}
                    currentUserRole={currentUserRole}
                    requestUserName={requestUserName}
                    requestNote={requestNote}
                    status={status}
                    suspensionReason={suspensionReason}
                    suspensionObservations={suspensionObservations}
                    suspendedByName={suspendedByName}
                    suspendedAt={suspendedAt}
                    onResolveRequest={handleResolveRequest}
                    onOpenEditSuspensionModal={() => setSuspensionModal({
                        isOpen: true,
                        reason: suspensionReason,
                        observations: suspensionObservations,
                        isDefinitive: status === 'cancelled',
                        isEdit: true
                    })}
                />

                {/* HEADER CARD - REDESIGNED v{__APP_VERSION__} */}
                <SurgeryHeader
                    isNew={isNew}
                    id={id}
                    patientName={patientName}
                    idCopied={idCopied}
                    onCopyId={handleCopyId}
                    currentUserRole={currentUserRole}
                    documentNumber={documentNumber}
                    nuc={nuc}
                    selectedProcedures={selectedProcedures}
                    selectedDoctorId={selectedDoctorId}
                    doctors={doctors}
                    status={status}
                    isScheduled={isScheduled}
                    createdAt={createdAt}
                    rescheduleRequested={rescheduleRequested}
                    suspensionRequested={suspensionRequested}
                    onRequestReschedule={() => setRequestRescheduleModal({ ...requestRescheduleModal, isOpen: true })}
                    internacionNotified={internacionNotified}
                    internacionNotifiedBy={internacionNotifiedBy}
                    onToggleInternacion={handleToggleInternacion}
                    saving={saving}
                    priority={priority}
                    onSetPriority={setPriority}
                    isReadOnly={isReadOnly}
                    doctorPriorityValidated={doctorPriorityValidated}
                    onSetDoctorPriorityValidated={setDoctorPriorityValidated}
                />

                {rescheduleRequested && (
                    <div className="mb-6 bg-red-50 border-l-4 border-red-500 p-4 rounded-r-lg shadow-sm">
                        <div className="flex items-start gap-3">
                            <span className="material-symbols-outlined text-red-600 mt-0.5 animate-pulse">schedule</span>
                            <div className="flex-1">
                                <h4 className="text-sm font-bold text-red-800 uppercase tracking-wider mb-1">
                                    Solicitud de Reprogramación Pendiente
                                </h4>
                                <div className="space-y-1">
                                    <p className="text-xs text-red-700 leading-relaxed">
                                        <span className="font-bold">Solicitado por:</span> {requestUserName || 'Internación'}
                                    </p>
                                    <p className="text-xs text-red-700 leading-relaxed">
                                        <span className="font-bold">Fecha Sugerida:</span> {suggestedDate ? new Date(suggestedDate + 'T12:00:00').toLocaleDateString('es-AR') : <span className="italic font-bold">sin fecha sugerida</span>}
                                    </p>
                                    <p className="text-xs text-red-700 leading-relaxed italic border-t border-red-100 pt-1 mt-1">
                                        "{requestNote}"
                                    </p>
                                </div>
                            </div>
                            {(currentUserRole === 'Tecnico' || currentUserRole === 'SuperAdmin') && (
                                <button
                                    onClick={() => setRescheduleModal({ ...rescheduleModal, isOpen: true, newDate: suggestedDate || '', newTime: startTime })}
                                    className="bg-red-600 hover:bg-red-700 text-white text-[10px] font-black uppercase px-3 py-1.5 rounded transition-all shadow-sm shrink-0"
                                >
                                    Reprogramar Ahora
                                </button>
                            )}
                        </div>
                    </div>
                )}

                {/* TOP ROW: CLINICAL & LOGISTICS */}
                <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 mb-6">

                    {/* LEFT: Patient & Clinical (8 cols) */}
                    <div className="xl:col-span-8 flex flex-col gap-6">



                        {/* Section 1: Patient Data */}
                        <PatientSection
                            isNew={isNew}
                            isReadOnly={isReadOnly}
                            currentUserRole={currentUserRole}
                            patientInputRef={patientInputRef}
                            patientSearchTerm={patientSearchTerm}
                            onPatientSearch={handlePatientSearch}
                            isSearchingPatient={isSearchingPatient}
                            patientSearchResults={patientSearchResults}
                            onSelectPatient={handleSelectPatient}
                            patientName={patientName}
                            onPatientNameChange={setPatientName}
                            nuc={nuc}
                            onNucChange={setNuc}
                            medicalRecordNumber={medicalRecordNumber}
                            onMedicalRecordNumberChange={setMedicalRecordNumber}
                            documentNumber={documentNumber}
                            onDocumentNumberChange={setDocumentNumber}
                            birthDate={birthDate}
                            onBirthDateChange={setBirthDate}
                            patientAge={patientAge}
                            phone={phone}
                            onPhoneChange={setPhone}
                            address={address}
                            onAddressChange={setAddress}
                            province={province}
                            onProvinceChange={setProvince}
                            locality={locality}
                            onLocalityChange={setLocality}
                            sexo={sexo}
                            onSexoChange={setSexo}
                            ARGENTINA_LOCATIONS={ARGENTINA_LOCATIONS}
                            medicalCoverage={medicalCoverage}
                            onCoverageChange={setMedicalCoverage}
                            availableCoverages={availableCoverages}
                            selectedVendor={selectedVendor}
                            onVendorChange={setSelectedVendor}
                            availableVendors={availableVendors}
                            requiresProsthesis={requiresProsthesis}
                            onVendorNotification={handleVendorNotification}
                            authDate={authDate}
                            onAuthDateChange={setAuthDate}
                            admissionAlert={admissionAlert}
                            preOpExams={preOpExams}
                            onPreOpExamsChange={setPreOpExams}
                            preOpDate={preOpDate}
                            onPreOpDateChange={setPreOpDate}
                            checkDateValidity={checkDateValidity}
                            surgeryDate={surgeryDate}
                            consentSigned={consentSigned}
                            onConsentSignedChange={setConsentSigned}
                            saving={saving}
                            surgeryId={id}
                            initialOserStatus={originalData?.oser_status}
                            isAmbulatory={computedIsAmbulatory}
                            isAmbulatoryExplicit={isAmbulatory}
                            onAmbulatoryChange={setIsAmbulatory}
                        />

                        {/* Section 2: Clinical Details */}
                        <ClinicalDetailsSection
                            user={user}
                            isNew={isNew}
                            isReadOnly={isReadOnly}
                            currentUserRole={currentUserRole}
                            setShowSurgeryForm={setShowSurgeryForm}
                            setIsNomencladorModalOpen={setIsNomencladorModalOpen}
                            currentNomencladorType={currentNomencladorType as "AOTER" | "OSER"}
                            procedureInput={procedureInput}
                            onProcedureInputChange={handleProcedureInputChange}
                            nomencladorSuggestions={nomencladorSuggestions}
                            isSearchingNomenclador={isSearchingNomenclador}
                            selectedProcedures={selectedProcedures}
                            onAddProcedure={handleAddProcedure}
                            onRemoveProcedure={handleRemoveProcedure}
                            isCie10Enabled={isCie10Enabled}
                            setIsCie10ModalOpen={setIsCie10ModalOpen}
                            diagnosis={diagnosis}
                            onDiagnosisChange={setDiagnosis}
                            referringDoctorId={referringDoctorId}
                            onReferringDoctorChange={setReferringDoctorId}
                            doctors={doctors}
                            selectedDoctorId={selectedDoctorId}
                            onSelectedDoctorChange={setSelectedDoctorId}
                            surgerySide={surgerySide}
                            onSurgerySideChange={setSurgerySide}
                            allergies={allergies}
                            onAllergiesChange={setAllergies}
                            preOpNotes={preOpNotes}
                            onPreOpNotesChange={setPreOpNotes}
                            canEditField={canEditField}
                        />

                        {/* Section: Documents */}
                        <DocumentationSection
                            uploadCategory={uploadCategory}
                            onUploadCategoryChange={setUploadCategory}
                            DOCUMENT_CATEGORIES={DOCUMENT_CATEGORIES}
                            uploading={uploading}
                            uploadProgress={uploadProgress}
                            handleFileUpload={handleFileUpload}
                            isReadOnly={isReadOnly}
                            currentUserRole={currentUserRole}
                            documents={documents}
                            getFileUrl={getFileUrl}
                            onDeleteDocument={handleDeleteDocument}
                        />

                        {/* Section: Patient History */}
                        {!isNew && (
                            <PatientHistorySection
                                patientHistory={patientHistory}
                                onNavigateToSurgery={(surgeryId) => navigate(`/detail/${surgeryId}`)}
                            />
                        )}
                    </div>

                    {/* RIGHT: Logistics (4 cols) */}
                    <LogisticsSection
                        user={user}
                        isNew={isNew}
                        isReadOnly={isReadOnly}
                        currentUserRole={currentUserRole}
                        surgeryDate={surgeryDate}
                        onSurgeryDateChange={setSurgeryDate}
                        startTime={startTime}
                        onStartTimeChange={setStartTime}
                        estimatedDuration={estimatedDuration === "" ? "" : Number(estimatedDuration)}
                        onEstimatedDurationChange={(val) => setEstimatedDuration(val === "" ? "" : String(val))}
                        predictedDuration={predictedDuration}
                        predictionBasis={predictionBasis}
                        predictionCount={predictionCount}
                        availableORs={availableORs}
                        selectedOrId={selectedOrId}
                        onSelectedOrIdChange={setSelectedOrId}
                        anesthesiaType={anesthesiaType}
                        onAnesthesiaTypeChange={setAnesthesiaType}
                        anesthesiologistId={anesthesiologistId}
                        onAnesthesiologistIdChange={setAnesthesiologistId}
                        doctors={doctors}
                        isGuardia={isGuardia}
                        onIsGuardiaChange={setIsGuardia}
                        priority={priority}
                        onPriorityChange={setPriority}
                        approvals={approvals}
                        onApprovalsChange={setApprovals}
                        orthoValidationDate={orthoValidationDate}
                        onOrthoValidationDateChange={setOrthoValidationDate}
                        orthoValidatedByName={orthoValidatedByName}
                        onOrthoValidatedByNameChange={setOrthoValidatedByName}
                        admissionValidationDate={admissionValidationDate}
                        onAdmissionValidationDateChange={setAdmissionValidationDate}
                        orValidationDate={orValidationDate}
                        onOrValidationDateChange={setOrValidationDate}
                        orValidatedByName={orValidatedByName}
                        onOrValidatedByNameChange={setOrValidatedByName}
                        medicalCoverage={medicalCoverage}
                        availableCoverages={availableCoverages}
                        preOpExams={preOpExams}
                        consentSigned={consentSigned}
                        preOpDate={preOpDate}
                        vendorRequiresValidation={vendorRequiresValidation}
                        materials={materials}
                        areAllMaterialsConfirmed={areAllMaterialsConfirmed}
                        requiresProsthesis={requiresProsthesis}
                        prosthesisAlert={prosthesisAlert}
                        canEditField={canEditField}
                        isAmbulatory={computedIsAmbulatory}
                    />
                </div>

                {/* BOTTOM FULL-WIDTH: MATERIALS */}
                <section className={`rounded-lg border shadow-sm overflow-hidden flex flex-col mb-20 ${isNew ? 'bg-slate-50 border-slate-200 border-dashed' : 'bg-white border-slate-200'}`}>
                <MaterialsSection
                    materials={materials}
                    setMaterials={setMaterials}
                    isNew={isNew}
                    isReadOnly={isReadOnly}
                    currentUserRole={currentUserRole}
                    requiresProsthesis={requiresProsthesis}
                    setRequiresProsthesis={setRequiresProsthesis}
                    selectedVendor={selectedVendor}
                    availableVendors={availableVendors}
                    selectedProcedures={selectedProcedures}
                    onVendorNotification={handleVendorNotification}
                    canValidate={canValidate}
                    canEditList={canEditList}
                    nuc={nuc}
                    status={status}
                    canEditField={canEditField}
                />
                </section>
            </div >

            {/* Sticky Bottom Actions */}
            < div className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 p-4 z-20 md:ml-64 shadow-[0_-5px_20px_-5px_rgba(0,0,0,0.05)]" >
                <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
                    <button
                        onClick={() => navigate(navigationState?.from || '/surgeries')}
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

                        {!isNew && status !== 'suspended' && (['SuperAdmin', 'Tecnico', 'DireccionMedica', 'Oficina ART', 'Internacion'].includes(currentUserRole)) && (
                            <button
                                onClick={() => setSuspensionModal({ isOpen: true, reason: '', observations: '', isDefinitive: false, isEdit: false })}
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

                                {/* Definitive Cancellation Option */}
                                <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                                    <div className="flex items-start gap-3">
                                        <div className="pt-0.5">
                                            <input
                                                type="checkbox"
                                                id="isDefinitive"
                                                checked={suspensionModal.isDefinitive}
                                                onChange={(e) => setSuspensionModal({ ...suspensionModal, isDefinitive: e.target.checked })}
                                                className="size-5 rounded border-slate-300 text-red-600 focus:ring-red-500 cursor-pointer"
                                            />
                                        </div>
                                        <label htmlFor="isDefinitive" className="cursor-pointer select-none">
                                            <span className="block text-sm font-black text-slate-900">Baja Definitiva (No se operará)</span>
                                            <span className="block text-[10px] text-slate-500 font-bold leading-tight mt-0.5">
                                                Si marca esta opción, la cirugía se quitará del flujo activo del Kanban permanentemente.
                                            </span>
                                        </label>
                                    </div>
                                </div>
                            </div>
                            <div className="p-6 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
                                <button onClick={() => setSuspensionModal({ ...suspensionModal, isOpen: false })} className="px-5 py-2 font-bold text-slate-500 hover:bg-slate-200 rounded-xl transition-all">Cancelar</button>
                                <button
                                    onClick={handleSuspend}
                                    disabled={!suspensionModal.reason}
                                    className={`px-6 py-2 ${suspensionModal.isDefinitive ? 'bg-red-600 hover:bg-red-700 shadow-red-200' : 'bg-amber-600 hover:bg-amber-700 shadow-amber-200'} disabled:opacity-50 text-white rounded-xl font-black text-sm shadow-lg transition-all active:scale-95`}
                                >
                                    {suspensionModal.isDefinitive ? 'Confirmar Baja Definitiva' : 'Confirmar Suspensión'}
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
                                readOnly={user?.role !== 'Tecnico' && user?.role !== 'SuperAdmin'}
                                operatingRoomId={selectedOrId}
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

            {/* CIE-10 Selector Modal */}
            <CIE10SelectorModal
                isOpen={isCie10ModalOpen}
                onClose={() => setIsCie10ModalOpen(false)}
                initialValue={diagnosis}
                onSelect={(selectedDiag) => {
                    setDiagnosis(selectedDiag);
                }}
            />

            {/* Nomenclador Selector Modal */}
            <NomencladorSelectorModal
                isOpen={isNomencladorModalOpen}
                onClose={() => setIsNomencladorModalOpen(false)}
                onSelect={(item) => {
                    if (!selectedProcedures.includes(item)) {
                        setSelectedProcedures([...selectedProcedures, item]);
                    }
                }}
                nomencladorType={currentNomencladorType}
            />

            {/* DUPLICATE NUC WARNING MODAL */}
            {duplicateSurgery && !showComparison && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-md p-4 animate-in fade-in duration-300">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden border border-slate-200">
                        <div className="p-6 border-b border-slate-100 bg-amber-50 flex items-center gap-3">
                            <span className="material-symbols-outlined text-amber-600 text-3xl animate-pulse">warning</span>
                            <div>
                                <h3 className="text-xl font-black text-amber-950">¡NUC Duplicado Detectado!</h3>
                                <p className="text-xs text-amber-800 font-bold uppercase tracking-wider mt-0.5">El número único ya existe en el sistema</p>
                            </div>
                        </div>
                        <div className="p-6 space-y-4">
                            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2 text-sm text-slate-700">
                                <p>Ya existe una cirugía registrada con el NUC <strong className="text-slate-900">{duplicateSurgery.nuc || duplicateSurgery.patients?.nuc}</strong>:</p>
                                <div className="grid grid-cols-3 gap-2 mt-2 pt-2 border-t border-slate-200/60 text-xs">
                                    <span className="font-bold text-slate-400">Paciente:</span>
                                    <span className="col-span-2 font-black text-slate-900">{duplicateSurgery.patients?.full_name}</span>
                                    
                                    <span className="font-bold text-slate-400">DNI:</span>
                                    <span className="col-span-2 font-bold text-slate-800">{duplicateSurgery.patients?.document_number}</span>

                                    <span className="font-bold text-slate-400">Fecha:</span>
                                    <span className="col-span-2 font-bold text-slate-800">
                                        {duplicateSurgery.surgery_date ? new Date(duplicateSurgery.surgery_date + 'T12:00:00').toLocaleDateString('es-AR') : 'Sin fecha'}
                                    </span>

                                    <span className="font-bold text-slate-400">Procedimiento:</span>
                                    <span className="col-span-2 font-bold text-slate-800 truncate">{duplicateSurgery.procedure_name}</span>

                                    <span className="font-bold text-slate-400">Médico:</span>
                                    <span className="col-span-2 font-bold text-slate-800">{duplicateSurgery.doctors?.full_name || 'Sin asignar'}</span>

                                    <span className="font-bold text-slate-400">Estado:</span>
                                    <span className="col-span-2">
                                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider border ${getStatusBadgeClass(duplicateSurgery.status)}`}>
                                            {translateStatus(duplicateSurgery.status)}
                                        </span>
                                    </span>
                                </div>
                            </div>
                            <p className="text-xs font-semibold text-slate-500 leading-normal">
                                Para evitar duplicados innecesarios y asegurar la consistencia de los datos, el sistema no permite guardar una nueva cirugía con el mismo NUC. Puede comparar ambas cirugías o ver la cirugía existente en detalle.
                            </p>
                        </div>
                        <div className="p-6 bg-slate-50 border-t border-slate-100 flex flex-col sm:flex-row justify-end gap-3">
                            <button 
                                onClick={() => setDuplicateSurgery(null)} 
                                className="w-full sm:w-auto px-5 py-2.5 font-bold text-slate-600 hover:bg-slate-200 rounded-xl transition-all text-sm border border-slate-200"
                            >
                                Volver a Editar
                            </button>
                            <button
                                onClick={() => setShowComparison(true)}
                                className="w-full sm:w-auto px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-black text-sm shadow-lg shadow-indigo-200 transition-all flex items-center justify-center gap-2"
                            >
                                <span className="material-symbols-outlined text-sm">compare_arrows</span>
                                Comparar Cirugías
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* SIDE-BY-SIDE COMPARISON MODAL */}
            {duplicateSurgery && showComparison && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-md p-4 animate-in fade-in duration-300 overflow-y-auto">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl overflow-hidden border border-slate-200 my-8">
                        <div className="p-6 border-b border-slate-100 bg-indigo-900 text-white flex justify-between items-center">
                            <div>
                                <h3 className="text-2xl font-black text-white">Comparación de Cirugías (NUC: {duplicateSurgery.nuc || duplicateSurgery.patients?.nuc})</h3>
                                <p className="text-xs text-indigo-200 font-bold uppercase tracking-wider mt-0.5">Analice las diferencias entre el borrador actual y el registro existente</p>
                            </div>
                            <button 
                                onClick={() => { setShowComparison(false); setDuplicateSurgery(null); }}
                                className="text-white hover:bg-white/10 rounded-full p-2 transition-colors flex items-center justify-center"
                            >
                                <span className="material-symbols-outlined">close</span>
                            </button>
                        </div>
                        
                        <div className="p-6 overflow-y-auto max-h-[60vh] space-y-6">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                {/* Left Side: New Draft */}
                                <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                                    <div className="bg-slate-100 p-4 border-b border-slate-200 flex items-center gap-2">
                                        <span className="material-symbols-outlined text-slate-500">add_circle</span>
                                        <h4 className="font-black text-slate-800 text-sm uppercase tracking-wider">Nueva Cirugía (Borrador Actual)</h4>
                                    </div>
                                    <div className="p-4 space-y-4 text-sm">
                                        <div className="space-y-3">
                                            <div>
                                                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Paciente</span>
                                                <span className="font-black text-slate-950">{patientName || 'No especificado'}</span>
                                                <span className="text-xs text-slate-500 block">DNI: {documentNumber || 'Sin DNI'}</span>
                                            </div>
                                            <div className="border-t border-slate-100 pt-2">
                                                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Procedimientos</span>
                                                <span className="font-bold text-slate-800">{selectedProcedures.join(' + ') || 'No especificados'}</span>
                                            </div>
                                            <div className="border-t border-slate-100 pt-2">
                                                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Fecha y Hora</span>
                                                <span className="font-bold text-slate-800">
                                                    {surgeryDate ? new Date(surgeryDate + 'T12:00:00').toLocaleDateString('es-AR') : 'Pendiente'} {startTime ? `@ ${startTime} hs` : ''}
                                                </span>
                                            </div>
                                            <div className="border-t border-slate-100 pt-2">
                                                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Médico</span>
                                                <span className="font-bold text-slate-800">
                                                    {doctors.find(d => d.id === selectedDoctorId)?.full_name || 'Sin asignar'}
                                                </span>
                                            </div>
                                            <div className="border-t border-slate-100 pt-2">
                                                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Obra Social</span>
                                                <span className="font-bold text-slate-800">{medicalCoverage || 'No especificada'}</span>
                                            </div>
                                            <div className="border-t border-slate-100 pt-2">
                                                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Estado del Borrador</span>
                                                <span className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider mt-1 border ${getStatusBadgeClass(status)}`}>
                                                    {translateStatus(status)}
                                                </span>
                                            </div>
                                            <div className="border-t border-slate-100 pt-2">
                                                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Prótesis</span>
                                                <span className="font-bold text-slate-800">{requiresProsthesis ? 'Sí' : 'No'}</span>
                                            </div>
                                            <div className="border-t border-slate-100 pt-2">
                                                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">CIE-10 (Diagnóstico)</span>
                                                <span className="text-xs text-slate-700 block">{diagnosis || 'No especificado'}</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Right Side: Existing DB Surgery */}
                                <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-sm bg-indigo-50/20">
                                    <div className="bg-indigo-50 p-4 border-b border-indigo-100 flex items-center gap-2">
                                        <span className="material-symbols-outlined text-indigo-600">database</span>
                                        <h4 className="font-black text-indigo-900 text-sm uppercase tracking-wider">Cirugía Existente en Base de Datos</h4>
                                    </div>
                                    <div className="p-4 space-y-4 text-sm">
                                        <div className="space-y-3">
                                            <div>
                                                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Paciente</span>
                                                <span className="font-black text-slate-950">{duplicateSurgery.patients?.full_name}</span>
                                                <span className="text-xs text-slate-500 block">DNI: {duplicateSurgery.patients?.document_number}</span>
                                            </div>
                                            <div className="border-t border-slate-100 pt-2">
                                                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Procedimientos</span>
                                                <span className="font-bold text-slate-800">{duplicateSurgery.procedure_name}</span>
                                            </div>
                                            <div className="border-t border-slate-100 pt-2">
                                                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Fecha y Hora</span>
                                                <span className="font-bold text-slate-800">
                                                    {duplicateSurgery.surgery_date ? new Date(duplicateSurgery.surgery_date + 'T12:00:00').toLocaleDateString('es-AR') : 'Sin fecha'} {duplicateSurgery.start_time ? `@ ${duplicateSurgery.start_time} hs` : ''}
                                                </span>
                                            </div>
                                            <div className="border-t border-slate-100 pt-2">
                                                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Médico</span>
                                                <span className="font-bold text-slate-800">
                                                    {duplicateSurgery.doctors?.full_name || 'Sin asignar'}
                                                </span>
                                            </div>
                                            <div className="border-t border-slate-100 pt-2">
                                                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Obra Social</span>
                                                <span className="font-bold text-slate-800">{duplicateSurgery.medical_coverage || 'No especificada'}</span>
                                            </div>
                                            <div className="border-t border-slate-100 pt-2">
                                                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Estado del Registro</span>
                                                <span className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider mt-1 border ${getStatusBadgeClass(duplicateSurgery.status)}`}>
                                                    {translateStatus(duplicateSurgery.status)}
                                                </span>
                                            </div>
                                            <div className="border-t border-slate-100 pt-2">
                                                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Prótesis</span>
                                                <span className="font-bold text-slate-800">{duplicateSurgery.requires_prosthesis ? 'Sí' : 'No'}</span>
                                            </div>
                                            <div className="border-t border-slate-100 pt-2">
                                                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">CIE-10 (Diagnóstico)</span>
                                                <span className="text-xs text-slate-700 block">{duplicateSurgery.diagnosis || 'No especificado'}</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="p-6 bg-slate-50 border-t border-slate-100 flex flex-col sm:flex-row justify-between gap-3">
                            <button
                                onClick={() => {
                                    window.open(`/detail/${duplicateSurgery.id}`, '_blank');
                                }}
                                className="w-full sm:w-auto px-5 py-2.5 bg-slate-800 hover:bg-slate-900 text-white rounded-xl font-black text-sm flex items-center justify-center gap-2 transition-all active:scale-95"
                            >
                                <span className="material-symbols-outlined text-sm">open_in_new</span>
                                Abrir Existente en otra Pestaña
                            </button>
                            <div className="flex flex-col sm:flex-row gap-3">
                                <button
                                    onClick={() => setShowComparison(false)}
                                    className="w-full sm:w-auto px-5 py-2.5 font-bold text-slate-600 hover:bg-slate-200 rounded-xl transition-all text-sm border border-slate-200 text-center"
                                >
                                    Volver al Aviso
                                </button>
                                <button
                                    onClick={() => {
                                        setShowComparison(false);
                                        setDuplicateSurgery(null);
                                    }}
                                    className="w-full sm:w-auto px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-black text-sm shadow-lg shadow-indigo-200 transition-all text-center"
                                >
                                    Cerrar y Editar
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div >
    );
};

export default SurgeryDetail;
