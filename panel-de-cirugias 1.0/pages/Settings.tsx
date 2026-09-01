import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { createPortal } from 'react-dom';
import ProgressBar from '../components/ProgressBar';
import BlankSurgeryFormPrint from '../components/BlankSurgeryFormPrint';

// Hooks
import { useSettings } from '../components/settings/hooks/useSettings';

// Tabs
import UsersTab from '../components/settings/UsersTab';
import DoctorsTab from '../components/settings/DoctorsTab';
import VendorsTab from '../components/settings/VendorsTab';
import CoveragesTab from '../components/settings/CoveragesTab';
import OrsTab from '../components/settings/OrsTab';
import SurgeryTreeTab from '../components/settings/SurgeryTreeTab';
import EmailConfigTab from '../components/settings/EmailConfigTab';
import VademecumTab from '../components/settings/VademecumTab';
import MedicationsTab from '../components/settings/MedicationsTab';
import FormsTab from '../components/settings/FormsTab';
import SignatureTab from '../components/settings/SignatureTab';
import PermissionsTab from '../components/settings/PermissionsTab';
import Cie10Tab from '../components/settings/Cie10Tab';
import NomencladorTab from '../components/settings/NomencladorTab';
import PrintersTab from '../components/settings/PrintersTab';
import ObsConfigTab from '../components/settings/ObsConfigTab';
import { checkAccess } from '../src/lib/permissions';

// Modals
import UserModal from '../components/settings/modals/UserModal';
import DoctorModal from '../components/settings/modals/DoctorModal';
import VendorModal from '../components/settings/modals/VendorModal';
import CoverageModal from '../components/settings/modals/CoverageModal';
import ORModal from '../components/settings/modals/ORModal';
import CatalogModal from '../components/settings/modals/CatalogModal';
import ProcedureModal from '../components/settings/modals/ProcedureModal';
import MaterialModal from '../components/settings/modals/MaterialModal';
import Cie10Modal from '../components/settings/modals/Cie10Modal';
import NomencladorModal from '../components/settings/modals/NomencladorModal';
import SpecialtiesModal from '../components/settings/modals/SpecialtiesModal';
import OserSyncTab from '../components/settings/OserSyncTab';
import BedStatsTab from '../components/settings/BedStatsTab';


const Settings: React.FC = () => {
    const s = useSettings();
    const [updateStatus, setUpdateStatus] = React.useState<string | null>(null);
    const [showMobileContent, setShowMobileContent] = React.useState(false);

    // Escuchar mensajes de actualización desde Electron
    React.useEffect(() => {
        if ((window as any).electronAPI?.onUpdateMessage) {
            (window as any).electronAPI.onUpdateMessage((message: string) => {
                setUpdateStatus(message);
                // Si es un mensaje final o de error, podríamos limpiarlo después de unos segundos
                if (message.includes('última versión') || message.includes('Error') || message.includes('descargada')) {
                    setTimeout(() => setUpdateStatus(null), 5000);
                }
            });
        }
    }, []);

    const APP_SECTIONS = [
        { id: 'dashboard', label: 'Tablero', icon: 'dashboard' },
        { id: 'medico', label: 'Perfil Médico', icon: 'medical_services' },
        { id: 'admin_dashboard', label: 'Tablero Admin', icon: 'admin_panel_settings' },
        { id: 'alerts', label: 'Centro de Alertas', icon: 'notifications' },
        { id: 'calendar', label: 'Calendario', icon: 'calendar_today' },
        { id: 'resident_shifts', label: 'Guardias (Calendario)', icon: 'medical_services' },
        { id: 'on_duty', label: 'Médico de Guardia (Semanal)', icon: 'medical_services' },
        { id: 'kanban', label: 'Planificación', icon: 'view_kanban' },
        { id: 'surgeries', label: 'Listado General', icon: 'table_rows' },
        { id: 'scanner', label: 'Escanear Pulsera', icon: 'qr_code_scanner' },
        { id: 'monitor', label: 'Monitor en Vivo', icon: 'monitor_heart' },
        { id: 'hospitalization', label: 'Enfermería', icon: 'bed' },
        { id: 'results', label: 'Resultados', icon: 'analytics' },
        { id: 'audit', label: 'Auditoría', icon: 'history_edu' },
        { id: 'billing', label: 'Facturación', icon: 'receipt_long' },
        { id: 'error_logs', label: 'Logs de Errores', icon: 'bug_report' },
        { id: 'settings', label: 'Configuración', icon: 'settings' },
        { id: 'obs_recording', label: 'Control de Grabación (OBS)', icon: 'videocam' },
        { id: 'help', label: 'Ayuda', icon: 'help' }
    ];

    const MAJOR_ROLES = [
        'SuperAdmin', 'Administrativo', 'Administrativo de Guardias', 'Anestesista', 
        'Auditoria', 'Caja', 'Cirujano', 'Direccion', 'Enfermeria', 
        'Facturacion', 'Farmacia', 'Gerencia', 'Internacion', 
        'Medico', 'Mucama', 'Oficina ART', 'Ortopedia', 'Personal', 
        'Recepcion', 'Residente', 'Tecnico', 'Ventas', 'Quirofano', 'RRHH'
    ];

    const hasObsAccess = s.user?.role === 'SuperAdmin' || 
                         s.user?.role === 'Tecnico' || 
                         checkAccess(s.rolePermissions, s.user?.role || '', 'obs_recording', 'edit');

    const sidebarItems = [
        { id: 'users', label: 'Usuarios', icon: 'group' },
        { id: 'doctors', label: 'Médicos', icon: 'medical_services' },
        { id: 'ors', label: 'Salas / Quirófanos', icon: 'meeting_room' },
        { id: 'tree', label: 'Árbol de Cirugías', icon: 'account_tree' },
        { id: 'vendors', label: 'Ortopedias', icon: 'business' },
        { id: 'coverages', label: 'Coberturas', icon: 'shield' },
        { id: 'nomenclador', label: 'Nomencladores', icon: 'clinical_notes' },
        { id: 'vademecum', label: 'Vademécum', icon: 'inventory' },
        { id: 'medications', label: 'Medicamentos', icon: 'vaccines' },
        { id: 'cie10', label: 'CIE-10', icon: 'label' },
        { id: 'email_config', label: 'Configuración de Email', icon: 'mail' },
        { id: 'forms', label: 'Formularios', icon: 'description' },
        { id: 'oser_sync', label: 'Sincronización OSER', icon: 'sync' },
        ...(s.user?.role === 'SuperAdmin' ? [{ id: 'bed_stats', label: 'Estimación de Camas', icon: 'bed' }] : []),
        { id: 'signature', label: 'Mi Firma', icon: 'draw' },
        ...( (window as any).electronAPI ? [{ id: 'printers', label: 'Impresoras', icon: 'print' }] : [] ),
        ...( (window as any).electronAPI && hasObsAccess ? [{ id: 'obs_config', label: 'Grabación (OBS)', icon: 'videocam' }] : [] ),
        { id: 'permissions', label: 'Permisos', icon: 'lock' }
    ];

    if (s.isLoading) return <ProgressBar isLoading={s.isLoading} />;

    return (
        <div className="flex flex-col md:flex-row h-screen bg-slate-100 overflow-hidden">
            {/* Sidebar */}
            <aside className={`${showMobileContent ? 'hidden' : 'flex'} md:flex w-full md:w-64 lg:w-72 bg-white border-r border-slate-200 flex-col shadow-sm z-20 overflow-y-auto flex-shrink-0 h-full`}>
                <div className="p-6 border-b border-slate-100 bg-slate-50/50">
                    <h2 className="text-xl font-black text-slate-800 tracking-tight flex items-center gap-2">
                        <span className="material-symbols-outlined text-blue-600">settings</span>
                        Panel de Control
                    </h2>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Configuración del Sistema</p>
                </div>
                
                <nav className="flex-1 p-4 space-y-1">
                    {sidebarItems.map(item => (
                        <button
                            key={item.id}
                            onClick={() => {
                                s.setActiveTab(item.id as any);
                                setShowMobileContent(true);
                            }}
                            className={`w-full flex items-center justify-between px-4 py-3 rounded-xl text-sm font-bold transition-all duration-200 group ${
                                s.activeTab === item.id 
                                ? 'bg-blue-600 text-white shadow-md shadow-blue-200' 
                                : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'
                            }`}
                        >
                            <div className="flex items-center gap-3">
                                <span className={`material-symbols-outlined text-xl transition-transform group-hover:scale-110 ${s.activeTab === item.id ? 'text-white' : 'text-slate-400 group-hover:text-blue-500'}`}>
                                    {item.icon}
                                </span>
                                <span>{item.label}</span>
                            </div>
                            <span className={`material-symbols-outlined text-sm md:hidden ${s.activeTab === item.id ? 'text-white' : 'text-slate-300'}`}>
                                chevron_right
                            </span>
                        </button>
                    ))}
                </nav>

                {!(window as any).electronAPI && (
                    <div className="p-4 mt-auto">
                        <button
                            onClick={() => window.open('https://github.com/lynxok/iteopanelcirugias/releases/latest/download/PanelCirugias_ITEO_Setup.exe', '_blank')}
                            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-black bg-slate-900 text-white shadow-lg shadow-slate-200 hover:bg-black transition-all group mb-2"
                        >
                            <span className="material-symbols-outlined text-blue-400 group-hover:rotate-12 transition-transform">laptop_mac</span>
                            DESCARGAR APP DESKTOP
                        </button>
                    </div>
                )}
                
                {(window as any).electronAPI && (
                    <div className="p-4 pt-0 space-y-2">
                        {updateStatus && (
                            <div className="px-4 py-2 bg-blue-600 text-white text-[10px] font-black uppercase tracking-widest rounded-lg animate-pulse shadow-lg shadow-blue-200">
                                {updateStatus}
                            </div>
                        )}
                        <button
                            onClick={async () => {
                                if ((window as any).electronAPI.checkForUpdates) {
                                    setUpdateStatus('Iniciando búsqueda...');
                                    await (window as any).electronAPI.checkForUpdates();
                                }
                            }}
                            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-black bg-blue-50 text-blue-600 border border-blue-100 shadow-sm hover:bg-blue-600 hover:text-white transition-all group"
                        >
                            <span className="material-symbols-outlined text-blue-500 group-hover:text-white transition-colors">system_update</span>
                            {updateStatus ? 'BUSCANDO...' : 'BUSCAR ACTUALIZACIONES'}
                        </button>
                    </div>
                )}
            </aside>

            {/* Main Content Area */}
            <main className={`${showMobileContent ? 'flex' : 'hidden'} md:flex flex-1 flex-col overflow-y-auto bg-slate-50 relative custom-scrollbar h-full`}>
                {/* Mobile Header with Back Button */}
                <div className="md:hidden flex items-center justify-between p-3.5 bg-white border-b border-slate-200 sticky top-0 z-30 shadow-sm shrink-0">
                    <button
                        onClick={() => setShowMobileContent(false)}
                        className="flex items-center gap-1.5 text-xs font-bold text-blue-600 hover:text-blue-700 active:scale-95 transition-all bg-blue-50 hover:bg-blue-100 px-3 py-2 rounded-xl border border-blue-100 shadow-sm"
                    >
                        <span className="material-symbols-outlined text-base">arrow_back</span>
                        Menú de Ajustes
                    </button>
                    <span className="text-xs font-black text-slate-700 uppercase tracking-wider flex items-center gap-1.5 truncate max-w-[180px]">
                        <span className="material-symbols-outlined text-base text-blue-600">
                            {sidebarItems.find(i => i.id === s.activeTab)?.icon}
                        </span>
                        <span className="truncate">{sidebarItems.find(i => i.id === s.activeTab)?.label}</span>
                    </span>
                </div>

                <AnimatePresence mode="wait">
                    <motion.div
                        key={s.activeTab}
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -20 }}
                        transition={{ duration: 0.2 }}
                        className="p-4 md:p-8 max-w-7xl mx-auto w-full flex-1"
                    >
                        {s.activeTab === 'users' && (
                            <UsersTab 
                                users={s.users}
                                searchUsers={s.searchUsers}
                                setSearchUsers={s.setSearchUsers}
                                vendors={s.vendors}
                                handleOpenNewUser={() => {
                                    s.setIsEditingUser(false);
                                    s.setNewUser({
                                        role: 'Medico',
                                        active: true,
                                        notificationPreferences: { delays: true, daily_summary: true, status_changes: true, vendor_assignments: true },
                                        resident_level_valid_from: new Date().toISOString().slice(0, 7)
                                    });
                                    s.setShowUserModal(true);
                                }}
                                handleOpenEditUser={(user) => {
                                    s.setIsEditingUser(true);
                                    const latestHistory = user.resident_level_history && user.resident_level_history.length > 0
                                        ? user.resident_level_history[user.resident_level_history.length - 1]
                                        : null;
                                    s.setNewUser({
                                        ...user,
                                        resident_level_valid_from: latestHistory ? latestHistory.valid_from.slice(0, 7) : new Date().toISOString().slice(0, 7)
                                    });
                                    s.setShowUserModal(true);
                                }}
                                handleDeleteUser={s.handleDeleteUser}
                                toggleUserStatus={s.toggleUserStatus}
                                toggleUserTelegram={s.toggleUserTelegram}
                                containerVariants={{}}
                                itemVariants={{}}
                            />
                        )}

                        {s.activeTab === 'doctors' && (
                            <DoctorsTab 
                                doctors={s.doctors}
                                searchDoctors={s.searchDoctors}
                                setSearchDoctors={s.setSearchDoctors}
                                setShowSpecialtiesModal={s.setShowSpecialtiesModal}
                                openNewDoctorModal={() => {
                                    s.setIsEditingDoctor(false);
                                    s.setDoctorForm({ name: '', specialty: 'Cirugía General', email: '', active: true });
                                    s.setShowDoctorModal(true);
                                }}
                                openEditDoctorModal={(doc) => {
                                    s.setIsEditingDoctor(true);
                                    s.setDoctorForm(doc);
                                    s.setShowDoctorModal(true);
                                }}
                                handleDeleteDoctor={s.handleDeleteDoctor}
                                toggleDoctorStatus={s.toggleDoctorStatus}
                            />
                        )}

                        {s.activeTab === 'vendors' && (
                            <VendorsTab 
                                vendors={s.vendors}
                                openNewVendorModal={() => {
                                    s.setIsEditingVendor(false);
                                    s.setVendorForm({ 
                                        name: '', email: '', whatsapp_number: '', telegram_chat_id: '',
                                        notification_method: 'whatsapp', auto_notify: false, requires_material_validation: true 
                                    });
                                    s.setShowVendorModal(true);
                                }}
                                openEditVendorModal={(vendor) => {
                                    s.setIsEditingVendor(true);
                                    s.setVendorForm(vendor as any);
                                    s.setShowVendorModal(true);
                                }}
                                handleDeleteVendor={s.handleDeleteVendor}
                            />
                        )}

                        {s.activeTab === 'coverages' && (
                            <CoveragesTab 
                                coverages={s.coverages}
                                searchCoverage={s.searchCoverage}
                                setSearchCoverage={s.setSearchCoverage}
                                vendors={s.vendors}
                                openNewCoverageModal={() => {
                                    s.setIsEditingCoverage(false);
                                    s.setCoverageForm({ name: '', vendor_id: '', type: 'Obra Social', nomenclador_type: null });
                                    s.setShowCoverageModal(true);
                                }}
                                openEditCoverageModal={(cov) => {
                                    s.setIsEditingCoverage(true);
                                    s.setCoverageForm(cov);
                                    s.setShowCoverageModal(true);
                                }}
                                handleDeleteCoverage={s.handleDeleteCoverage}
                            />
                        )}

                        {s.activeTab === 'ors' && (
                            <OrsTab 
                                ors={s.ors}
                                openNewORModal={() => {
                                    s.setIsEditingOR(false);
                                    s.setNewORID('');
                                    s.setNewORName('');
                                    s.setNewORGoal(4);
                                    s.setNewORStartTime('07:00');
                                    s.setNewORIsAmbulatory(false);
                                    s.setShowORModal(true);
                                }}
                                openEditORModal={(room) => {
                                    s.setIsEditingOR(true);
                                    s.setNewORID(room.id);
                                    s.setNewORName(room.name);
                                    s.setNewORGoal(room.daily_goal || 4);
                                    s.setNewORStartTime(room.start_time || '07:00');
                                    s.setNewORIsAmbulatory(room.is_ambulatory ?? false);
                                    s.setShowORModal(true);
                                }}
                                handleDeleteOR={s.handleDeleteOR}
                                toggleOrStatus={s.toggleOrStatus}
                            />
                        )}

                        {s.activeTab === 'tree' && (
                            <SurgeryTreeTab 
                                procedures={s.procedures}
                                selectedProcedureId={s.selectedProcedureId}
                                setSelectedProcedureId={s.setSelectedProcedureId}
                                setShowProcModal={s.setShowProcModal}
                                selectedProcedure={s.procedures.find(p => p.id === s.selectedProcedureId)}
                                handleOpenEditProcedure={() => {
                                    const proc = s.procedures.find(p => p.id === s.selectedProcedureId);
                                    if (proc) {
                                        s.setIsEditingOR(true); // Reusando estado para edición de proc
                                        s.setEditingProcedure(proc);
                                        s.setShowEditProcModal(true);
                                    }
                                }}
                                handleDeleteProcedure={s.handleDeleteProcedure}
                                setShowMaterialModal={s.setShowMaterialModal}
                                deleteMaterial={s.handleDeleteMaterial}
                            />
                        )}

                        {s.activeTab === 'email_config' && (
                            <EmailConfigTab 
                                smtpSettings={s.smtpSettings}
                                setSmtpSettings={s.setSmtpSettings}
                                handleSaveSmtp={s.handleSaveSmtp}
                                isSavingSmtp={s.isSavingSmtp}
                            />
                        )}

                        {s.activeTab === 'vademecum' && (
                            <VademecumTab 
                                isLoadingCatalog={s.isLoadingCatalog}
                                catalogItems={s.catalogItems}
                                fetchCatalogItems={s.fetchCatalogItems}
                                setCatalogForm={s.setCatalogForm}
                                setIsEditingCatalog={s.setIsEditingCatalog}
                                setShowCatalogModal={s.setShowCatalogModal}
                                searchCatalog={s.searchCatalog}
                                setSearchCatalog={s.setSearchCatalog}
                                sortCatalog={s.sortCatalog}
                                setSortCatalog={s.setSortCatalog}
                                catalogFilters={s.catalogFilters}
                                setCatalogFilters={s.setCatalogFilters}
                                handleDeleteCatalogItem={s.handleDeleteCatalogItem}
                            />
                        )}

                        {s.activeTab === 'medications' && (
                            <MedicationsTab 
                                isLoadingCatalog={s.isLoadingCatalog}
                                catalogItems={s.catalogItems}
                                fetchCatalogItems={s.fetchCatalogItems}
                                setCatalogForm={s.setCatalogForm}
                                setIsEditingCatalog={s.setIsEditingCatalog}
                                setShowCatalogModal={s.setShowCatalogModal}
                                searchCatalog={s.searchCatalog}
                                setSearchCatalog={s.setSearchCatalog}
                                handleDeleteCatalogItem={s.handleDeleteCatalogItem}
                            />
                        )}

                        {s.activeTab === 'forms' && (
                            <FormsTab 
                                materialPagesCount={s.materialPagesCount}
                                setMaterialPagesCount={s.setMaterialPagesCount}
                                setIsPrintingBlank={s.setIsPrintingBlank}
                            />
                        )}

                        {s.activeTab === 'signature' && (
                            <SignatureTab 
                                signatureRef={s.signatureRef}
                                setSignatureRef={s.setSignatureRef}
                                signaturePin={s.signaturePin}
                                setSignaturePin={s.setSignaturePin}
                                currentSignature={s.currentSignature}
                                handleSaveUserSignature={s.handleSaveUserSignature}
                                isSavingSignature={s.isSavingSignature}
                            />
                        )}

                        {s.activeTab === 'oser_sync' && (
                            <OserSyncTab />
                        )}

                        {s.activeTab === 'permissions' && (
                            <PermissionsTab 
                                isSavingPermissions={s.isSavingPermissions}
                                MAJOR_ROLES={MAJOR_ROLES as any}
                                APP_SECTIONS={APP_SECTIONS}
                                rolePermissions={s.rolePermissions}
                                handleSetPermissionLevel={s.setPermissionLevel}
                                handleSetFieldPermission={s.setFieldPermission}
                                currentUserRole={s.user?.role}
                                systemFields={s.systemFields}
                                onAddSystemField={s.handleAddSystemField}
                                onDeleteSystemField={s.handleDeleteSystemField}
                            />
                        )}

                        {s.activeTab === 'printers' && (
                            <PrintersTab />
                        )}

                        {s.activeTab === 'obs_config' && (
                            <ObsConfigTab />
                        )}

                        {s.activeTab === 'bed_stats' && (
                            <BedStatsTab />
                        )}

                        {s.activeTab === 'cie10' && (
                            <Cie10Tab 
                                searchCie10={s.searchCie10}
                                setSearchCie10={s.setSearchCie10}
                                openNewCie10Modal={() => {
                                    s.setIsEditingCie10(false);
                                    s.setCie10Form({ code: '', description: '', region: 'Cráneo', part: '', injury_type: '' });
                                    s.setShowCie10Modal(true);
                                }}
                                cie10Items={s.cie10Items}
                                openEditCie10Modal={(item) => {
                                    s.setIsEditingCie10(true);
                                    s.setCie10Form(item);
                                    s.setShowCie10Modal(true);
                                }}
                                handleDeleteCie10={s.handleDeleteCie10}
                            />
                        )}

                        {s.activeTab === 'nomenclador' && (
                            <NomencladorTab 
                                nomencladorItems={s.nomencladorItems}
                                searchNomenclador={s.searchNomenclador}
                                setSearchNomenclador={s.setSearchNomenclador}
                                nomencladorFilterType={s.nomencladorFilterType}
                                setNomencladorFilterType={s.setNomencladorFilterType}
                                openNewNomencladorModal={s.openNewNomencladorModal}
                                openEditNomencladorModal={s.openEditNomencladorModal}
                                handleDeleteNomenclador={s.handleDeleteNomenclador}
                                handleToggleNomencladorActive={s.handleToggleNomencladorActive}
                                isLoading={s.isLoadingNomenclador}
                                isSuperAdmin={s.user?.role === 'SuperAdmin'}
                            />
                        )}
                    </motion.div>
                </AnimatePresence>
            </main>

            {/* Portal for Blank Form Print */}
            {s.isPrintingBlank && createPortal(
                <div className="absolute top-0 left-0 w-full z-[9999] bg-white print:relative print:z-auto">
                    <BlankSurgeryFormPrint materialPagesCount={s.materialPagesCount} />
                </div>,
                document.body
            )}

            {/* Modals Area */}
            <UserModal 
                show={s.showUserModal}
                onClose={() => s.setShowUserModal(false)}
                onSave={s.handleSaveUser}
                newUser={s.newUser}
                setNewUser={s.setNewUser}
                newUserSpecialty={s.newUserSpecialty}
                setNewUserSpecialty={s.setNewUserSpecialty}
                isEditing={s.isEditingUser}
                vendors={s.vendors}
                specialties={s.specialties}
            />

            <DoctorModal 
                show={s.showDoctorModal}
                onClose={() => s.setShowDoctorModal(false)}
                onSave={s.handleSaveDoctor}
                doctorForm={s.doctorForm}
                setDoctorForm={s.setDoctorForm}
                isEditing={s.isEditingDoctor}
                specialties={s.specialties}
            />

            <VendorModal 
                show={s.showVendorModal}
                onClose={() => s.setShowVendorModal(false)}
                onSave={s.handleSaveVendor}
                vendorForm={s.vendorForm}
                setVendorForm={s.setVendorForm}
                isEditing={s.isEditingVendor}
            />

            <CoverageModal 
                show={s.showCoverageModal}
                onClose={() => s.setShowCoverageModal(false)}
                onSave={s.handleSaveCoverage}
                coverageForm={s.coverageForm}
                setCoverageForm={s.setCoverageForm}
                isEditing={s.isEditingCoverage}
                vendors={s.vendors}
            />

            <ORModal 
                show={s.showORModal}
                onClose={() => s.setShowORModal(false)}
                onSave={s.handleSaveOR}
                newORID={s.newORID}
                setNewORID={s.setNewORID}
                newORName={s.newORName}
                setNewORName={s.setNewORName}
                newORGoal={s.newORGoal}
                setNewORGoal={s.setNewORGoal}
                newORStartTime={s.newORStartTime}
                setNewORStartTime={s.setNewORStartTime}
                newORIsAmbulatory={s.newORIsAmbulatory}
                setNewORIsAmbulatory={s.setNewORIsAmbulatory}
                isEditing={s.isEditingOR}
            />

            <CatalogModal 
                show={s.showCatalogModal}
                onClose={() => s.setShowCatalogModal(false)}
                onSave={s.handleSaveCatalogItem}
                catalogForm={s.catalogForm}
                setCatalogForm={s.setCatalogForm}
                isEditing={s.isEditingCatalog}
            />

            <ProcedureModal 
                show={s.showProcModal || s.showEditProcModal}
                onClose={() => { s.setShowProcModal(false); s.setShowEditProcModal(false); }}
                onSave={s.handleSaveProcedure}
                procedureForm={s.showEditProcModal ? s.editingProcedure || {} : s.newProcedure}
                setProcedureForm={s.showEditProcModal ? s.setEditingProcedure : s.setNewProcedure}
                isEditing={s.showEditProcModal}
                specialties={s.specialties}
            />

            <MaterialModal 
                show={s.showMaterialModal}
                onClose={() => s.setShowMaterialModal(false)}
                onSave={s.handleSaveMaterial}
                newMaterial={s.newMaterial}
                setNewMaterial={s.setNewMaterial}
                categories={s.categories}
                isAddingCategory={s.isAddingCategory}
                setIsAddingCategory={s.setIsAddingCategory}
                newCategoryName={s.newCategoryName}
                setNewCategoryName={s.setNewCategoryName}
                handleSaveCategory={s.handleSaveCategory}
            />

            <Cie10Modal 
                show={s.showCie10Modal}
                onClose={() => s.setShowCie10Modal(false)}
                onSave={s.handleSaveCie10}
                cie10Form={s.cie10Form}
                setCie10Form={s.setCie10Form}
                isEditing={s.isEditingCie10}
            />

            <NomencladorModal 
                isOpen={s.showNomencladorModal}
                onClose={() => s.setShowNomencladorModal(false)}
                nomencladorForm={s.nomencladorForm}
                setNomencladorForm={s.setNomencladorForm}
                isEditing={s.isEditingNomenclador}
                onSave={s.handleSaveNomenclador}
                isSaving={s.isSavingNomenclador}
            />

            <SpecialtiesModal 
                show={s.showSpecialtiesModal}
                onClose={() => s.setShowSpecialtiesModal(false)}
                specialtyForm={s.specialtyForm}
                setSpecialtyForm={s.setSpecialtyForm}
                onSave={s.handleSaveSpecialty}
                editingOriginal={s.editingSpecialtyOriginal}
                setEditingOriginal={s.setEditingSpecialtyOriginal}
                specialties={s.specialties}
                onEdit={(spec) => {
                    s.setSpecialtyForm(spec);
                    s.setEditingSpecialtyOriginal(spec);
                }}
                onDelete={s.handleDeleteSpecialty}
            />

        </div>
    );
};

export default Settings;