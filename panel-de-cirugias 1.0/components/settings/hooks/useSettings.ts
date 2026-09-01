import { useState, useEffect, useCallback } from 'react';
import { supabase, supabasePublic } from '../../../src/lib/supabase';
import { useAuth } from '../../../src/lib/AuthContext';
import { 
    Doctor, OperatingRoom, ProcedureType, AppUser, Vendor, 
    UserRole, MaterialTemplate, Coverage, CatalogItem, NomencladorItem 
} from '../../../types';
import { LEGACY_PERMISSIONS } from '../../../src/lib/permissions';

export const useSettings = () => {
    const { user } = useAuth();
    
    // --- TABS & UI STATE ---
    const [activeTab, setActiveTab] = useState<'users' | 'doctors' | 'ors' | 'tree' | 'vendors' | 'coverages' | 'vademecum' | 'medications' | 'email_config' | 'forms' | 'signature' | 'permissions' | 'cie10' | 'oser_sync' | 'printers' | 'obs_config' | 'bed_stats' | 'nomenclador'>('users');
    const [isPrintingBlank, setIsPrintingBlank] = useState(false);
    const [materialPagesCount, setMaterialPagesCount] = useState(1);
    
    if (typeof window !== 'undefined') {
        (window as any).APP_VERSION = '3.10.29';
        (window as any).USE_SETTINGS_LOADED = true;
    }
    
    // --- DATA STATE ---
    const [vendors, setVendors] = useState<Vendor[]>([]);
    const [coverages, setCoverages] = useState<Coverage[]>([]);
    const [users, setUsers] = useState<AppUser[]>([]);
    const [doctors, setDoctors] = useState<Doctor[]>([]);
    const [ors, setOrs] = useState<OperatingRoom[]>([]);
    const [procedures, setProcedures] = useState<ProcedureType[]>([]);
    const [categories, setCategories] = useState<string[]>([]);
    const [catalogItems, setCatalogItems] = useState<CatalogItem[]>([]);
    const [cie10Items, setCie10Items] = useState<any[]>([]);
    const [nomencladorItems, setNomencladorItems] = useState<NomencladorItem[]>([]);
    const [specialties, setSpecialties] = useState<string[]>([]);
    
    // --- LOADING & SAVING STATE ---
    const [isLoading, setIsLoading] = useState(false);
    const [isLoadingCatalog, setIsLoadingCatalog] = useState(false);
    const [isLoadingNomenclador, setIsLoadingNomenclador] = useState(false);
    const [isSavingNomenclador, setIsSavingNomenclador] = useState(false);
    const [isSavingPermissions, setIsSavingPermissions] = useState(false);
    const [isSavingSmtp, setIsSavingSmtp] = useState(false);

    // --- CONFIG & PERMISSIONS STATE ---
    const [rolePermissions, setRolePermissions] = useState<Record<string, string[]>>({});
    const [telegramGlobalEnabled, setTelegramGlobalEnabled] = useState(false);
    const [bccEnabled, setBccEnabled] = useState(false);
    const [cie10Enabled, setCie10Enabled] = useState(false);
    const [smtpSettings, setSmtpSettings] = useState({
        host: '',
        port: '587',
        user: '',
        pass: '',
        fromName: 'Panel de Cirugías',
        fromEmail: ''
    });

    // --- SIGNATURE STATE ---
    const [signaturePin, setSignaturePin] = useState('');
    const [currentSignature, setCurrentSignature] = useState<string | null>(null);
    const [signatureRef, setSignatureRef] = useState<any>(null);
    const [isSavingSignature, setIsSavingSignature] = useState(false);

    // --- MODAL & FORM STATES ---
    const [showUserModal, setShowUserModal] = useState(false);
    const [newUser, setNewUser] = useState<Partial<AppUser>>({
        role: 'Medico',
        active: true,
        notificationPreferences: { delays: true, daily_summary: true, status_changes: true, vendor_assignments: true }
    });
    const [newUserSpecialty, setNewUserSpecialty] = useState<string>('');
    const [isEditingUser, setIsEditingUser] = useState(false);

    const [showDoctorModal, setShowDoctorModal] = useState(false);
    const [doctorForm, setDoctorForm] = useState<Partial<Doctor>>({ name: '', specialty: 'Cirugía General', email: '', active: true });
    const [isEditingDoctor, setIsEditingDoctor] = useState(false);

    const [showVendorModal, setShowVendorModal] = useState(false);
    const [vendorForm, setVendorForm] = useState<{ 
        id?: string, 
        name: string, 
        email?: string, 
        whatsapp_number?: string, 
        telegram_chat_id?: string,
        notification_method: 'whatsapp' | 'telegram',
        auto_notify: boolean,
        requires_material_validation?: boolean 
    }>({ 
        name: '', email: '', whatsapp_number: '', telegram_chat_id: '',
        notification_method: 'whatsapp', auto_notify: false, requires_material_validation: true 
    });
    const [isEditingVendor, setIsEditingVendor] = useState(false);

    const [showCoverageModal, setShowCoverageModal] = useState(false);
    const [coverageForm, setCoverageForm] = useState<Partial<Coverage>>({ name: '', vendor_id: '', type: 'Obra Social', nomenclador_type: null });
    const [isEditingCoverage, setIsEditingCoverage] = useState(false);

    const [showCatalogModal, setShowCatalogModal] = useState(false);
    const [catalogForm, setCatalogForm] = useState<Partial<CatalogItem>>({ name: '', code: '', category: 'surgery', active: true, default_unit: '' });
    const [isEditingCatalog, setIsEditingCatalog] = useState(false);

    const [showORModal, setShowORModal] = useState(false);
    const [newORName, setNewORName] = useState('');
    const [newORID, setNewORID] = useState('');
    const [newORGoal, setNewORGoal] = useState<number>(4);
    const [newORStartTime, setNewORStartTime] = useState('07:00');
    const [newORIsAmbulatory, setNewORIsAmbulatory] = useState<boolean>(false);
    const [isEditingOR, setIsEditingOR] = useState(false);

    const [showProcModal, setShowProcModal] = useState(false);
    const [newProcedure, setNewProcedure] = useState<Partial<ProcedureType>>({
        name: '', specialty: 'Ortopedia', defaultDurationMin: 60, requiredMaterials: []
    });

    const [showEditProcModal, setShowEditProcModal] = useState(false);
    const [editingProcedure, setEditingProcedure] = useState<ProcedureType | null>(null);

    const [showMaterialModal, setShowMaterialModal] = useState(false);
    const [newMaterial, setNewMaterial] = useState<Partial<MaterialTemplate>>({
        name: '', category: 'Herramienta', quantity: 1
    });

    const [showCie10Modal, setShowCie10Modal] = useState(false);
    const [cie10Form, setCie10Form] = useState<any>({ code: '', description: '', region: 'Cráneo', part: '', injury_type: '' });
    const [isEditingCie10, setIsEditingCie10] = useState(false);

    const [showNomencladorModal, setShowNomencladorModal] = useState(false);
    const [nomencladorForm, setNomencladorForm] = useState<{ id?: string; code: string; description: string; type: 'AOTER' | 'OSER' | 'NN'; active: boolean }>({ code: '', description: '', type: 'AOTER', active: true });
    const [isEditingNomenclador, setIsEditingNomenclador] = useState(false);

    const [showSpecialtiesModal, setShowSpecialtiesModal] = useState(false);
    const [specialtyForm, setSpecialtyForm] = useState('');
    const [editingSpecialtyOriginal, setEditingSpecialtyOriginal] = useState<string | null>(null);

    const [showOserSyncModal, setShowOserSyncModal] = useState(false);
    const [oserResults, setOserResults] = useState<any[]>([]);
    const [oserLogs, setOserLogs] = useState<string[]>([]);

    // --- SEARCH STATES ---
    const [searchUsers, setSearchUsers] = useState('');
    const [searchDoctors, setSearchDoctors] = useState('');
    const [searchCoverage, setSearchCoverage] = useState('');
    const [searchCatalog, setSearchCatalog] = useState('');
    const [searchCie10, setSearchCie10] = useState('');
    const [searchNomenclador, setSearchNomenclador] = useState('');
    const [nomencladorFilterType, setNomencladorFilterType] = useState<'ALL' | 'AOTER' | 'OSER' | 'NN'>('ALL');
    const [selectedProcedureId, setSelectedProcedureId] = useState<string | null>(null);
    const [isAddingCategory, setIsAddingCategory] = useState(false);
    const [newCategoryName, setNewCategoryName] = useState('');

    const [catalogFilters, setCatalogFilters] = useState({ name: '', code: '', category: '' });
    const [sortCatalog, setSortCatalog] = useState<{ column: 'name' | 'code' | 'category' | 'active', direction: 'asc' | 'desc' }>({
        column: 'name', direction: 'asc'
    });

    const [systemFields, setSystemFields] = useState<{ id: string; section_id: string; field_id: string; label: string }[]>([]);

    // --- FETCHING LOGIC ---

    const fetchUsers = useCallback(async () => {
        const { data, error } = await supabase.from('users').select('*').order('name');
        if (!error && data) {
            setUsers(data.map(u => ({
                id: u.id, name: u.name, email: u.email, password: u.password,
                role: u.role as UserRole, active: u.active, vendorId: u.vendor_id,
                doctorId: u.doctor_id, telegramChatId: u.telegram_chat_id,
                telegramEnabled: u.telegram_enabled, notification_method: u.notification_method || 'telegram',
                auto_notify: u.auto_notify ?? true, whatsapp_number: u.whatsapp_number || '',
                notificationPreferences: u.notification_preferences || { delays: true, daily_summary: true, status_changes: true },
                canFillForms: u.can_fill_forms, saved_signature: u.saved_signature, signature_pin: u.signature_pin,
                license_number: u.license_number, does_guardias: u.does_guardias,
                does_guardias_medicas: u.does_guardias_medicas,
                can_edit_shifts: u.can_edit_shifts,
                resident_level: u.resident_level,
                resident_level_history: u.resident_level_history || [],
                can_view_all_vendors: u.can_view_all_vendors,
                is_turno_tarde: u.is_turno_tarde,
                has_tecnico_section_access: u.has_tecnico_section_access
            })));
        }
    }, []);

    const fetchDoctors = useCallback(async () => {
        const { data, error } = await supabase.from('doctors').select('*').order('full_name');
        if (!error && data) {
            setDoctors(data.map(d => ({
                id: d.id, name: d.full_name, specialty: d.specialty || 'Cirugía General',
                email: d.email || '', active: d.active, does_guardias: d.does_guardias
            })));
        }
    }, []);

    const fetchOperatingRooms = useCallback(async () => {
        const { data, error } = await supabase.from('operating_rooms').select('*').order('name');
        if (!error && data) setOrs(data);
    }, []);

    const fetchVendors = useCallback(async () => {
        const { data, error } = await supabase.from('vendors').select('*').order('name');
        if (!error && data) setVendors(data);
    }, []);

    const fetchCoverages = useCallback(async () => {
        const { data, error } = await supabase.from('coverages').select('id, name, type, vendor_id, nomenclador_type').order('name');
        if (!error && data) setCoverages(data);
    }, []);

    const fetchProcedures = useCallback(async () => {
        const { data, error } = await supabase.from('procedures').select('*').order('name');
        if (!error && data) {
            const mapped = data.map((p: any) => ({
                id: p.id, name: p.name, specialty: p.specialty,
                defaultDurationMin: p.default_duration_min, requiredMaterials: p.required_materials || []
            }));
            setProcedures(mapped);
            if (mapped.length > 0 && !selectedProcedureId) {
                setSelectedProcedureId(mapped[0].id);
            }
        }
    }, [selectedProcedureId]);

    const fetchSpecialties = useCallback(async () => {
        const { data, error } = await supabase.from('specialties').select('name').order('name');
        if (!error && data) setSpecialties(data.map((s: any) => s.name));
    }, []);

    const fetchCategories = useCallback(async () => {
        const { data, error } = await supabase.from('material_categories').select('name').order('name');
        if (!error && data) setCategories(data.map((c: any) => c.name));
    }, []);

    const fetchCatalogItems = useCallback(async () => {
        setIsLoadingCatalog(true);
        const { data, error } = await supabase.from('catalog_items').select('*').order('name');
        if (!error && data) setCatalogItems(data);
        setIsLoadingCatalog(false);
    }, []);

    const fetchCie10Items = useCallback(async () => {
        const { data, error } = await supabase.from('cie10_catalog').select('*').order('code');
        if (!error && data) setCie10Items(data);
    }, []);

    const fetchNomencladorItems = useCallback(async () => {
        setIsLoadingNomenclador(true);
        try {
            const { data, error } = await supabase
                .from('nomenclador_items')
                .select('*')
                .order('code', { ascending: true });
            if (!error && data) {
                setNomencladorItems(data);
            }
        } catch (err) {
            console.error('Error fetching nomenclador items:', err);
        } finally {
            setIsLoadingNomenclador(false);
        }
    }, []);

    const fetchUserSignature = useCallback(async () => {
        if (!user) return;
        const { data } = await supabase.from('users').select('saved_signature, signature_pin').eq('id', user.id).single();
        if (data) {
            setCurrentSignature(data.saved_signature);
            setSignaturePin(data.signature_pin || '');
        }
    }, [user]);

    const fetchGlobalSettings = useCallback(async () => {
        try {
            const { data, error } = await supabase.from('admin_settings').select('key, value, bcc_enabled');
            if (error) throw error;
            
            if (data) {
                const settingsData: any = {};
                data.forEach((s: any) => {
                    settingsData[s.key] = s.value;
                    if (s.key === 'telegram_enabled') setBccEnabled(s.bcc_enabled === true);
                    if (s.key === 'cie10_enabled') setCie10Enabled(s.value === 'true');
                });
                setTelegramGlobalEnabled(settingsData.telegram_enabled === 'true');
                setSmtpSettings({
                    host: settingsData.smtp_host || '',
                    port: settingsData.smtp_port || '587',
                    user: settingsData.smtp_user || '',
                    pass: settingsData.smtp_pass || '',
                    fromName: settingsData.smtp_from_name || 'Panel de Cirugías',
                    fromEmail: settingsData.smtp_from_email || ''
                });
            }
        } catch (err) {
            console.error('Error fetching global settings:', err);
        }
    }, []);

    const fetchRolePermissions = useCallback(async () => {
        try {
            const { data, error } = await supabase
                .from('admin_settings')
                .select('value')
                .eq('key', 'role_permissions')
                .maybeSingle();
            
            if (!error && data && data.value) {
                try { 
                    const parsed = JSON.parse(data.value);
                    if (parsed && typeof parsed === 'object') {
                        // Merge parsed database permissions with legacy fallback keys to ensure new roles have defaults
                        const merged = { ...LEGACY_PERMISSIONS, ...parsed };
                        setRolePermissions(merged);
                    }
                } catch (e) { 
                    console.error('Error parsing role permissions:', e);
                    setRolePermissions(LEGACY_PERMISSIONS);
                }
            } else {
                setRolePermissions(LEGACY_PERMISSIONS);
            }
        } catch (err) {
            console.error('Error fetching role permissions:', err);
            setRolePermissions(LEGACY_PERMISSIONS);
        }
    }, []);

    const fetchSystemFields = useCallback(async () => {
        try {
            const { data, error } = await supabasePublic
                .from('system_fields')
                .select('*')
                .order('created_at', { ascending: true });
            if (!error && data) {
                setSystemFields(data);
            }
        } catch (err) {
            console.error('Error fetching system fields:', err);
        }
    }, []);

    const fetchInitialData = useCallback(async () => {
        setIsLoading(true);
        await Promise.all([
            fetchUsers(), fetchDoctors(), fetchOperatingRooms(), fetchVendors(),
            fetchCoverages(), fetchProcedures(), fetchSpecialties(), fetchCategories(),
            fetchGlobalSettings(), fetchCatalogItems(), fetchRolePermissions(), fetchCie10Items(),
            fetchNomencladorItems(), fetchSystemFields()
        ]);
        setIsLoading(false);
    }, [fetchUsers, fetchDoctors, fetchOperatingRooms, fetchVendors, fetchCoverages, fetchProcedures, fetchSpecialties, fetchCategories, fetchGlobalSettings, fetchCatalogItems, fetchRolePermissions, fetchCie10Items, fetchNomencladorItems, fetchSystemFields]);

    useEffect(() => {
        fetchInitialData();
    }, [fetchInitialData]);

    useEffect(() => {
        if (user) fetchUserSignature();
    }, [user, fetchUserSignature]);

    // --- HANDLERS ---

    const handleSaveUser = async () => {
        if (!newUser.name || !newUser.email || !newUser.role) return;
        if (newUser.role === 'Ortopedia' && !newUser.vendorId) return;
        if (newUser.role === 'Medico' && !newUserSpecialty) return;

        try {
            let doctorId = null;
            if (newUser.role === 'Medico' || newUser.role === 'Anestesista' || newUser.role === 'Residente') {
                const doctorPayload: any = {
                    full_name: newUser.name,
                    email: newUser.email,
                    specialty: newUser.role === 'Anestesista' ? 'Anestesiología' : (newUser.role === 'Residente' ? 'Residencia' : newUserSpecialty),
                    active: newUser.active,
                    does_guardias: ((newUser.role === 'Medico' && (newUserSpecialty === 'Cirugía General' || newUserSpecialty === 'Cirujano')) || newUser.role === 'Anestesista') ? newUser.does_guardias : false
                };
                if (newUser.doctorId) {
                    doctorPayload.id = newUser.doctorId;
                }
                const { data: docData, error: docError } = await supabase.from('doctors').upsert(doctorPayload, { onConflict: newUser.doctorId ? 'id' : 'email' }).select('id').single();
                if (docError) throw docError;
                doctorId = docData?.id;
            }

            let residentLevelHistory = newUser.resident_level_history ? [...newUser.resident_level_history] : [];
            let latestLevel = newUser.resident_level || null;

            if (newUser.role === 'Residente' && newUser.resident_level) {
                const selectedLevel = newUser.resident_level;
                let validFrom = newUser.resident_level_valid_from;
                if (!validFrom) {
                    validFrom = new Date().toISOString().slice(0, 7) + '-01';
                } else if (validFrom.length === 7) {
                    validFrom = `${validFrom}-01`;
                }

                const targetMonth = validFrom.slice(0, 7);
                const existingIndex = residentLevelHistory.findIndex(h => h && h.valid_from && h.valid_from.startsWith(targetMonth));
                
                if (existingIndex >= 0) {
                    residentLevelHistory[existingIndex] = { level: selectedLevel, valid_from: validFrom };
                } else {
                    residentLevelHistory.push({ level: selectedLevel, valid_from: validFrom });
                }

                // Ordenar historial ascendentemente por fecha
                residentLevelHistory = residentLevelHistory
                    .filter(h => h && h.level && h.valid_from)
                    .sort((a, b) => a.valid_from.localeCompare(b.valid_from));
                
                if (residentLevelHistory.length > 0) {
                    latestLevel = residentLevelHistory[residentLevelHistory.length - 1].level;
                }
            } else if (newUser.role !== 'Residente') {
                residentLevelHistory = [];
                latestLevel = null;
            }

            const userPayload: any = {
                name: newUser.name, email: newUser.email, password: newUser.password, role: newUser.role,
                vendor_id: newUser.vendorId, doctor_id: doctorId, active: newUser.active,
                telegram_chat_id: newUser.telegramChatId, telegram_enabled: newUser.telegramEnabled,
                notification_method: newUser.notification_method, auto_notify: newUser.auto_notify,
                whatsapp_number: newUser.whatsapp_number, notification_preferences: newUser.notificationPreferences,
                can_fill_forms: newUser.canFillForms, saved_signature: newUser.saved_signature, signature_pin: newUser.signature_pin,
                license_number: newUser.license_number,
                does_guardias: newUser.does_guardias || false,
                does_guardias_medicas: newUser.role === 'Medico' ? (newUser.does_guardias_medicas || false) : false,
                can_edit_shifts: newUser.can_edit_shifts || false,
                resident_level: latestLevel,
                resident_level_history: newUser.role === 'Residente' ? residentLevelHistory : [],
                can_view_all_vendors: newUser.role === 'Ortopedia' ? (newUser.can_view_all_vendors || false) : false,
                is_turno_tarde: newUser.role === 'Tecnico' ? (newUser.is_turno_tarde || false) : false,
                has_tecnico_section_access: newUser.role === 'Tecnico' ? (newUser.has_tecnico_section_access || false) : false
            };
            if (isEditingUser && newUser.id) userPayload.id = newUser.id;

            const { error } = await supabase.from('users').upsert(userPayload, { onConflict: isEditingUser ? 'id' : 'email' });
            if (error) throw error;

            fetchInitialData();
            setShowUserModal(false);
        } catch (e: any) { alert(e.message); }
    };

    const handleSaveDoctor = async () => {
        if (!doctorForm.name) return;
        try {
            const payload = { 
                full_name: doctorForm.name, 
                specialty: doctorForm.specialty, 
                email: doctorForm.email, 
                active: doctorForm.active,
                does_guardias: (doctorForm.specialty === 'Cirugía General' || doctorForm.specialty === 'Cirujano' || doctorForm.specialty === 'Anestesiología' || doctorForm.specialty === 'Anestesista') ? doctorForm.does_guardias : false 
            };
            const { data: savedDoc, error } = isEditingDoctor && doctorForm.id
                ? await supabase.from('doctors').update(payload).eq('id', doctorForm.id).select().single()
                : await supabase.from('doctors').insert(payload).select().single();
            if (error) throw error;

            if (savedDoc) {
                await supabase.from('users').upsert({ 
                    name: doctorForm.name, 
                    email: doctorForm.email, 
                    role: 'Medico', 
                    active: doctorForm.active
                }, { onConflict: 'email' });
            }
            fetchInitialData();
            setShowDoctorModal(false);
        } catch (e: any) { alert(e.message); }
    };

    const handleSaveVendor = async () => {
        if (!vendorForm.name) return;
        const payload = {
            name: vendorForm.name, email: vendorForm.email || null, whatsapp_number: vendorForm.whatsapp_number || null,
            telegram_chat_id: vendorForm.telegram_chat_id || null, notification_method: vendorForm.notification_method,
            auto_notify: vendorForm.auto_notify, requires_material_validation: vendorForm.requires_material_validation ?? true
        };
        if (isEditingVendor && vendorForm.id) await supabase.from('vendors').update(payload).eq('id', vendorForm.id);
        else await supabase.from('vendors').insert([payload]);
        fetchVendors();
        setShowVendorModal(false);
    };

    const handleSaveCoverage = async () => {
        if (!coverageForm.name) return;
        const payload = { name: coverageForm.name, type: coverageForm.type, vendor_id: coverageForm.vendor_id || null, nomenclador_type: coverageForm.nomenclador_type || null };
        if (isEditingCoverage && coverageForm.id) await supabase.from('coverages').update(payload).eq('id', coverageForm.id);
        else await supabase.from('coverages').insert(payload);
        fetchCoverages();
        setShowCoverageModal(false);
    };

    const handleSaveUserSignature = async () => {
        if (!user) return;
        setIsSavingSignature(true);
        try {
            let signatureData = currentSignature;
            if (signatureRef && !signatureRef.isEmpty()) {
                signatureData = signatureRef.toDataURL();
            }

            const { error } = await supabase
                .from('users')
                .update({ 
                    saved_signature: signatureData, 
                    signature_pin: signaturePin 
                })
                .eq('id', user.id);

            if (error) throw error;
            setCurrentSignature(signatureData);
            alert('Firma y PIN actualizados correctamente');
        } catch (e: any) {
            alert('Error al guardar firma: ' + e.message);
        } finally {
            setIsSavingSignature(false);
        }
    };

    const handleSaveSmtp = async () => {
        setIsSavingSmtp(true);
        try {
            const { error } = await supabase.rpc('save_email_settings', {
                p_host: smtpSettings.host, p_port: smtpSettings.port, p_user: smtpSettings.user, p_pass: smtpSettings.pass,
                p_from_name: smtpSettings.fromName, p_from_email: smtpSettings.fromEmail,
                p_admin_email: user?.email || '', p_admin_password: user?.password || ''
            });
            if (error) throw error;
            alert('Éxito');
        } catch (e: any) { alert(e.message); }
        finally { setIsSavingSmtp(false); }
    };

    const handleSaveOR = async () => {
        if (!newORName || !newORID) return;
        try {
            const payload: any = {
                name: newORName,
                active: true,
                daily_goal: newORGoal,
                start_time: newORStartTime,
                is_ambulatory: newORIsAmbulatory
            };
            const { error } = isEditingOR
                ? await supabase.from('operating_rooms').update(payload).eq('id', newORID)
                : await supabase.from('operating_rooms').insert({ id: newORID, ...payload });

            if (error) {
                console.error('Error al guardar sala:', error);
                alert('Error al guardar sala: ' + error.message);
                return;
            }
            fetchOperatingRooms();
            setShowORModal(false);
        } catch (err: any) {
            console.error('Error al guardar sala:', err);
            alert('Error al guardar sala: ' + (err.message || err));
        }
    };

    const handleSaveCatalogItem = async () => {
        if (!catalogForm.name) return;
        const payload = { name: catalogForm.name, code: catalogForm.code || null, category: catalogForm.category, active: catalogForm.active, default_unit: catalogForm.default_unit || null };
        if (isEditingCatalog && catalogForm.id) await supabase.from('catalog_items').update(payload).eq('id', catalogForm.id);
        else await supabase.from('catalog_items').insert([payload]);
        fetchCatalogItems();
        setShowCatalogModal(false);
    };

    const handleSaveCie10 = async () => {
        if (!cie10Form.code || !cie10Form.description) return;
        const payload = { code: cie10Form.code, description: cie10Form.description, region: cie10Form.region, part: cie10Form.part, injury_type: cie10Form.injury_type };
        if (isEditingCie10 && cie10Form.id) await supabase.from('cie10_catalog').update(payload).eq('id', cie10Form.id);
        else await supabase.from('cie10_catalog').insert([payload]);
        fetchCie10Items();
        setShowCie10Modal(false);
    };

    const handleSaveNomenclador = async () => {
        if (user?.role !== 'SuperAdmin') {
            alert('Acceso denegado: Únicamente los usuarios con rol SuperAdmin tienen permisos para dar de alta o modificar prácticas en los nomencladores.');
            return false;
        }
        if (!nomencladorForm.code.trim() || !nomencladorForm.description.trim()) {
            alert('Por favor complete el código y la descripción.');
            return false;
        }
        setIsSavingNomenclador(true);
        try {
            const payload = {
                code: nomencladorForm.code.trim(),
                description: nomencladorForm.description.trim(),
                type: nomencladorForm.type,
                active: nomencladorForm.active ?? true
            };

            if (isEditingNomenclador && nomencladorForm.id) {
                const { error } = await supabase
                    .from('nomenclador_items')
                    .update(payload)
                    .eq('id', nomencladorForm.id);
                if (error) throw error;
            } else {
                const { error } = await supabase
                    .from('nomenclador_items')
                    .insert([payload]);
                if (error) {
                    if (error.code === '23505') {
                        alert(`Ya existe una práctica con el código "${payload.code}" en el nomenclador ${payload.type}.`);
                        return false;
                    }
                    throw error;
                }
            }
            await fetchNomencladorItems();
            setShowNomencladorModal(false);
            return true;
        } catch (err: any) {
            console.error('Error saving nomenclador item:', err);
            alert(`Error al guardar la práctica: ${err.message || err}`);
            return false;
        } finally {
            setIsSavingNomenclador(false);
        }
    };

    const handleDeleteNomenclador = async (id: string) => {
        if (user?.role !== 'SuperAdmin') {
            alert('Acceso denegado: Únicamente los usuarios con rol SuperAdmin tienen permisos para eliminar prácticas de los nomencladores.');
            return;
        }
        if (!window.confirm('¿Está seguro de que desea eliminar esta práctica del nomenclador?')) return;
        try {
            const { error } = await supabase.from('nomenclador_items').delete().eq('id', id);
            if (error) throw error;
            await fetchNomencladorItems();
        } catch (err: any) {
            console.error('Error deleting nomenclador item:', err);
            alert(`Error al eliminar: ${err.message || err}`);
        }
    };

    const handleToggleNomencladorActive = async (item: NomencladorItem) => {
        if (user?.role !== 'SuperAdmin') {
            alert('Acceso denegado: Únicamente los usuarios con rol SuperAdmin tienen permisos para modificar el estado de las prácticas.');
            return;
        }
        if (!item.id) return;
        try {
            const { error } = await supabase
                .from('nomenclador_items')
                .update({ active: !item.active })
                .eq('id', item.id);
            if (error) throw error;
            setNomencladorItems(prev => prev.map(i => i.id === item.id ? { ...i, active: !item.active } : i));
        } catch (err: any) {
            console.error('Error toggling nomenclador active:', err);
            alert(`Error al actualizar estado: ${err.message || err}`);
        }
    };

    const openNewNomencladorModal = (defaultType?: 'AOTER' | 'OSER' | 'NN') => {
        if (user?.role !== 'SuperAdmin') {
            alert('Acceso denegado: Únicamente los usuarios con rol SuperAdmin pueden crear prácticas.');
            return;
        }
        setNomencladorForm({
            code: '',
            description: '',
            type: defaultType || (nomencladorFilterType !== 'ALL' ? nomencladorFilterType : 'AOTER'),
            active: true
        });
        setIsEditingNomenclador(false);
        setShowNomencladorModal(true);
    };

    const openEditNomencladorModal = (item: NomencladorItem) => {
        if (user?.role !== 'SuperAdmin') {
            alert('Acceso denegado: Únicamente los usuarios con rol SuperAdmin pueden editar prácticas.');
            return;
        }
        setNomencladorForm({
            id: item.id,
            code: item.code,
            description: item.description,
            type: (item.type as 'AOTER' | 'OSER' | 'NN') || 'AOTER',
            active: item.active ?? true
        });
        setIsEditingNomenclador(true);
        setShowNomencladorModal(true);
    };

    const setPermissionLevel = async (role: string, sectionId: string, level: 'none' | 'view' | 'edit') => {
        setIsSavingPermissions(true);
        try {
            const roleKey = Object.keys(rolePermissions || {}).find(k => k.toLowerCase() === role.toLowerCase()) || role;
            const currentRolePerms = rolePermissions[roleKey] || {};
            
            let newRolePerms: any;
            if (Array.isArray(currentRolePerms)) {
                // Convert old style array to new style object
                const converted: Record<string, any> = {};
                currentRolePerms.forEach(id => {
                    converted[id] = { access: 'edit' };
                });
                newRolePerms = converted;
            } else {
                newRolePerms = { ...currentRolePerms };
            }

            if (level === 'none') {
                delete newRolePerms[sectionId];
            } else {
                newRolePerms[sectionId] = { access: level };
            }

            const newPermissions = { ...rolePermissions, [roleKey]: newRolePerms };
            
            const { error } = await supabase.rpc('save_admin_setting', { 
                p_key: 'role_permissions', 
                p_value: JSON.stringify(newPermissions) 
            });
            if (!error) {
                setRolePermissions(newPermissions);
            } else {
                console.error('Error al guardar permisos:', error);
                alert('Error al guardar permisos: ' + error.message);
            }
        } catch (err: any) {
            console.error('Error en setPermissionLevel:', err);
            alert('Error al guardar permisos: ' + (err.message || err));
        } finally {
            setIsSavingPermissions(false);
        }
    };

    const setFieldPermission = async (role: string, sectionId: string, fieldId: string, enabled: boolean) => {
        setIsSavingPermissions(true);
        try {
            const roleKey = Object.keys(rolePermissions || {}).find(k => k.toLowerCase() === role.toLowerCase()) || role;
            const currentRolePerms = rolePermissions[roleKey] || {};
            
            let newRolePerms: any;
            if (Array.isArray(currentRolePerms)) {
                // Convert to object
                const converted: Record<string, any> = {};
                currentRolePerms.forEach(id => {
                    converted[id] = { access: 'edit' };
                });
                newRolePerms = converted;
            } else {
                newRolePerms = { ...currentRolePerms };
            }

            if (!newRolePerms[sectionId]) {
                newRolePerms[sectionId] = { access: 'edit', fields: {} };
            } else {
                newRolePerms[sectionId] = { 
                    ...newRolePerms[sectionId], 
                    fields: { ...(newRolePerms[sectionId].fields || {}) } 
                };
            }

            newRolePerms[sectionId].fields[fieldId] = enabled;

            const newPermissions = { ...rolePermissions, [roleKey]: newRolePerms };
            
            const { error } = await supabase.rpc('save_admin_setting', { 
                p_key: 'role_permissions', 
                p_value: JSON.stringify(newPermissions) 
            });
            if (!error) {
                setRolePermissions(newPermissions);
            } else {
                console.error('Error al guardar permisos de campo:', error);
                alert('Error al guardar permisos: ' + error.message);
            }
        } catch (err: any) {
            console.error('Error en setFieldPermission:', err);
            alert('Error al guardar permisos de campo: ' + (err.message || err));
        } finally {
            setIsSavingPermissions(false);
        }
    };

    const handleAddSystemField = async (sectionId: string, fieldId: string, label: string) => {
        try {
            const { data, error } = await supabasePublic
                .from('system_fields')
                .insert([{ section_id: sectionId, field_id: fieldId, label }])
                .select();
            if (!error && data) {
                setSystemFields(prev => [...prev, data[0]]);
                return { success: true };
            } else {
                throw error;
            }
        } catch (err: any) {
            console.error('Error adding system field:', err);
            return { success: false, error: err.message || err };
        }
    };

    const handleDeleteSystemField = async (id: string) => {
        try {
            const { error } = await supabasePublic
                .from('system_fields')
                .delete()
                .eq('id', id);
            if (!error) {
                setSystemFields(prev => prev.filter(f => f.id !== id));
                return { success: true };
            } else {
                throw error;
            }
        } catch (err: any) {
            console.error('Error deleting system field:', err);
            return { success: false, error: err.message || err };
        }
    };

    return {
        user, activeTab, setActiveTab, isPrintingBlank, setIsPrintingBlank, materialPagesCount, setMaterialPagesCount,
        vendors, coverages, users, doctors, ors, procedures, categories, catalogItems, cie10Items, nomencladorItems, specialties,
        isLoading, isLoadingCatalog, isLoadingNomenclador, isSavingNomenclador, isSavingPermissions, isSavingSmtp, isSavingSignature,
        rolePermissions, telegramGlobalEnabled, bccEnabled, cie10Enabled, smtpSettings, setSmtpSettings,
        signaturePin, setSignaturePin, currentSignature, setCurrentSignature, signatureRef, setSignatureRef,
        showUserModal, setShowUserModal, newUser, setNewUser, newUserSpecialty, setNewUserSpecialty, isEditingUser, setIsEditingUser,
        systemFields, handleAddSystemField, handleDeleteSystemField,
        showDoctorModal, setShowDoctorModal, doctorForm, setDoctorForm, isEditingDoctor, setIsEditingDoctor,
        showVendorModal, setShowVendorModal, vendorForm, setVendorForm, isEditingVendor, setIsEditingVendor,
        showCoverageModal, setShowCoverageModal, coverageForm, setCoverageForm, isEditingCoverage, setIsEditingCoverage,
        showCatalogModal, setShowCatalogModal, catalogForm, setCatalogForm, isEditingCatalog, setIsEditingCatalog,
        showORModal, setShowORModal, newORName, setNewORName, newORID, setNewORID, newORGoal, setNewORGoal, newORStartTime, setNewORStartTime, newORIsAmbulatory, setNewORIsAmbulatory, isEditingOR, setIsEditingOR,
        showProcModal, setShowProcModal, newProcedure, setNewProcedure, showEditProcModal, setShowEditProcModal, editingProcedure, setEditingProcedure,
        showMaterialModal, setShowMaterialModal, newMaterial, setNewMaterial, showCie10Modal, setShowCie10Modal, cie10Form, setCie10Form, isEditingCie10, setIsEditingCie10,
        showNomencladorModal, setShowNomencladorModal, nomencladorForm, setNomencladorForm, isEditingNomenclador, setIsEditingNomenclador,
        showSpecialtiesModal, setShowSpecialtiesModal, specialtyForm, setSpecialtyForm, editingSpecialtyOriginal, setEditingSpecialtyOriginal,
        showOserSyncModal, setShowOserSyncModal, oserResults, setOserResults, oserLogs, setOserLogs,
        searchUsers, setSearchUsers, searchDoctors, setSearchDoctors, searchCoverage, setSearchCoverage, searchCatalog, setSearchCatalog, searchCie10, setSearchCie10, searchNomenclador, setSearchNomenclador,
        nomencladorFilterType, setNomencladorFilterType,
        selectedProcedureId, setSelectedProcedureId, isAddingCategory, setIsAddingCategory, newCategoryName, setNewCategoryName,
        catalogFilters, setCatalogFilters, sortCatalog, setSortCatalog,
        fetchInitialData, handleSaveUser, handleSaveDoctor, handleSaveVendor, handleSaveCoverage, handleSaveSmtp, handleSaveOR, handleSaveCatalogItem, handleSaveCie10, handleSaveNomenclador, handleDeleteNomenclador, handleToggleNomencladorActive, openNewNomencladorModal, openEditNomencladorModal, handleSaveUserSignature,
        setPermissionLevel, setFieldPermission, fetchCatalogItems, fetchCie10Items, fetchNomencladorItems, fetchUsers, fetchDoctors, fetchOperatingRooms, fetchVendors, fetchCoverages, fetchProcedures, fetchSpecialties, fetchCategories,
        toggleTelegramGlobal: async () => {
            const newValue = !telegramGlobalEnabled;
            const { error } = await supabase.rpc('save_admin_setting', { 
                p_key: 'telegram_enabled', 
                p_value: String(newValue) 
            });
            if (!error) {
                setTelegramGlobalEnabled(newValue);
            } else {
                console.error(error);
                alert('Error al guardar configuración de Telegram: ' + error.message);
            }
        },
        toggleBcc: async () => {
            const newValue = !bccEnabled;
            const { error } = await supabase.rpc('save_admin_setting', { 
                p_key: 'telegram_enabled', 
                p_bcc_enabled: newValue 
            });
            if (!error) {
                setBccEnabled(newValue);
            } else {
                console.error(error);
                alert('Error al guardar configuración de BCC: ' + error.message);
            }
        },
        toggleCie10: async () => {
            const newValue = !cie10Enabled;
            const { error } = await supabase.rpc('save_admin_setting', { 
                p_key: 'cie10_enabled', 
                p_value: String(newValue) 
            });
            if (!error) {
                setCie10Enabled(newValue);
            } else {
                console.error(error);
                alert('Error al guardar configuración de CIE-10: ' + error.message);
            }
        },
        handleDeleteUser: async (id: string) => {
            if (window.confirm('¿Eliminar?')) {
                const { error } = await supabase.from('users').delete().eq('id', id);
                if (!error) fetchUsers();
            }
        },
        handleDeleteDoctor: async (id: string) => {
            if (window.confirm('¿Eliminar?')) {
                const { error } = await supabase.from('doctors').delete().eq('id', id);
                if (!error) fetchDoctors();
            }
        },
        handleDeleteVendor: async (id: string) => {
            if (window.confirm('¿Eliminar?')) {
                const { error } = await supabase.from('vendors').delete().eq('id', id);
                if (!error) fetchVendors();
            }
        },
        handleDeleteCoverage: async (id: string) => {
            if (window.confirm('¿Eliminar?')) {
                const { error } = await supabase.from('coverages').delete().eq('id', id);
                if (!error) fetchCoverages();
            }
        },
        handleDeleteOR: async (id: string) => {
            if (window.confirm('¿Eliminar?')) {
                const { error } = await supabase.from('operating_rooms').delete().eq('id', id);
                if (!error) fetchOperatingRooms();
            }
        },
        handleDeleteCatalogItem: async (id: string) => {
            if (window.confirm('¿Eliminar?')) {
                const { error } = await supabase.from('catalog_items').delete().eq('id', id);
                if (!error) fetchCatalogItems();
            }
        },
        handleDeleteCie10: async (id: string) => {
            if (window.confirm('¿Eliminar?')) {
                const { error } = await supabase.from('cie10_catalog').delete().eq('id', id);
                if (!error) fetchCie10Items();
            }
        },
        handleSaveSpecialty: async () => {
            if (!specialtyForm.trim()) return;
            if (editingSpecialtyOriginal) {
                await supabase.from('specialties').update({ name: specialtyForm }).eq('name', editingSpecialtyOriginal);
                setEditingSpecialtyOriginal(null);
            } else {
                await supabase.from('specialties').insert({ name: specialtyForm });
            }
            setSpecialtyForm('');
            fetchSpecialties();
        },
        handleDeleteSpecialty: async (spec: string) => {
            if (window.confirm(`¿Eliminar la especialidad "${spec}"?`)) {
                await supabase.from('specialties').delete().eq('name', spec);
                fetchSpecialties();
            }
        },
        handleSaveMaterial: async () => {
            if (!newMaterial.name || !selectedProcedureId) return;
            const proc = procedures?.find(p => p.id === selectedProcedureId);
            if (!proc) return;
            const updatedMaterials = [...proc.requiredMaterials, { ...newMaterial, id: crypto.randomUUID() }];
            const { error } = await supabase.from('procedures').update({ required_materials: updatedMaterials }).eq('id', selectedProcedureId);
            if (!error) {
                fetchProcedures();
                setShowMaterialModal(false);
                setNewMaterial({ name: '', category: 'Herramienta', quantity: 1 });
            }
        },
        handleDeleteMaterial: async (materialId: string) => {
            if (!selectedProcedureId) return;
            const proc = procedures?.find(p => p.id === selectedProcedureId);
            if (!proc) return;
            const updatedMaterials = proc.requiredMaterials.filter(m => m.id !== materialId);
            const { error } = await supabase.from('procedures').update({ required_materials: updatedMaterials }).eq('id', selectedProcedureId);
            if (!error) fetchProcedures();
        },
        handleSaveCategory: async () => {
            if (!newCategoryName.trim()) return;
            const { error } = await supabase.from('material_categories').insert({ name: newCategoryName });
            if (!error) {
                fetchCategories();
                setIsAddingCategory(false);
                setNewCategoryName('');
            }
        },
        handleSaveProcedure: async () => {
            const proc = isEditingOR ? editingProcedure : newProcedure;
            if (!proc?.name) return;
            const payload = { name: proc.name, specialty: proc.specialty, default_duration_min: proc.defaultDurationMin, required_materials: proc.requiredMaterials };
            const { error } = isEditingOR && editingProcedure ? await supabase.from('procedures').update(payload).eq('id', editingProcedure.id) : await supabase.from('procedures').insert([payload]);
            if (!error) {
                fetchProcedures();
                setShowProcModal(false);
                setShowEditProcModal(false);
            }
        },
        handleDeleteProcedure: async (id: string) => {
            if (window.confirm('¿Eliminar procedimiento?')) {
                const { error } = await supabase.from('procedures').delete().eq('id', id);
                if (!error) fetchProcedures();
            }
        },
        toggleUserStatus: async (id: string, active: boolean) => {
            const { error } = await supabase.from('users').update({ active }).eq('id', id);
            if (!error) fetchUsers();
        },
        toggleUserTelegram: async (id: string, telegram_enabled: boolean) => {
            const { error } = await supabase.from('users').update({ telegram_enabled }).eq('id', id);
            if (!error) fetchUsers();
        },
        toggleDoctorStatus: async (id: string, active: boolean) => {
            const { error } = await supabase.from('doctors').update({ active }).eq('id', id);
            if (!error) fetchDoctors();
        },
        toggleOrStatus: async (id: string, active: boolean) => {
            const { error } = await supabase.from('operating_rooms').update({ active: !active }).eq('id', id);
            if (!error) fetchOperatingRooms();
        }
    };
};
