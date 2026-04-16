import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Doctor, OperatingRoom, ProcedureType, AppUser, Vendor, UserRole, MaterialTemplate, Coverage, CatalogItem } from '../types';
import { supabase } from '../src/lib/supabase';
import ProgressBar from '../components/ProgressBar';
import { useAuth } from '../src/lib/AuthContext';
import { createPortal } from 'react-dom';
import BlankSurgeryFormPrint from '../components/BlankSurgeryFormPrint';


const Settings: React.FC = () => {
    const { user } = useAuth();
    const [activeTab, setActiveTab] = useState<'users' | 'doctors' | 'ors' | 'tree' | 'vendors' | 'coverages' | 'vademecum' | 'medications' | 'email_config' | 'forms'>('users');
    const [isPrintingBlank, setIsPrintingBlank] = useState(false);
    const [materialPagesCount, setMaterialPagesCount] = useState(1);



    // --- ANIMATION VARIANTS (Version 2.0) ---
    const containerVariants = {
        hidden: { opacity: 0 },
        visible: {
            opacity: 1,
            transition: {
                staggerChildren: 0.1
            }
        }
    };

    const itemVariants = {
        hidden: { y: 20, opacity: 0 },
        visible: { 
            y: 0, 
            opacity: 1,
            transition: {
                type: 'spring' as const,
                stiffness: 100,
                damping: 12
            }
        }
    };

    // --- MOCK DATA STATE (Simulating Database) ---

    // Vendors (Proveedores de Ortopedia)
    const [vendors, setVendors] = useState<Vendor[]>([]);

    // Medical Coverages (Obras Sociales / ART)
    const [coverages, setCoverages] = useState<Coverage[]>([]);

    // Users
    const [users, setUsers] = useState<AppUser[]>([]);

    const [doctors, setDoctors] = useState<Doctor[]>([]);

    const [ors, setOrs] = useState<OperatingRoom[]>([]);

    const [procedures, setProcedures] = useState<ProcedureType[]>([]);
    const [categories, setCategories] = useState<string[]>([]);

    const [isAddingCategory, setIsAddingCategory] = useState(false);
    const [newCategoryName, setNewCategoryName] = useState('');

    // Vademécum / Catalog Items
    const [catalogItems, setCatalogItems] = useState<CatalogItem[]>([]);
    const [isLoadingCatalog, setIsLoadingCatalog] = useState(false);
    const [showCatalogModal, setShowCatalogModal] = useState(false);
    const [catalogForm, setCatalogForm] = useState<Partial<CatalogItem>>({ name: '', code: '', category: 'surgery', active: true, default_unit: '' });
    const [isEditingCatalog, setIsEditingCatalog] = useState(false);
    const [searchCatalog, setSearchCatalog] = useState('');
    const [catalogFilters, setCatalogFilters] = useState({
        name: '',
        code: '',
        category: ''
    });
    const [sortCatalog, setSortCatalog] = useState<{ column: 'name' | 'code' | 'category' | 'active', direction: 'asc' | 'desc' }>({
        column: 'name',
        direction: 'asc'
    });

    // --- SPECIALTIES STATE ---
    const [specialties, setSpecialties] = useState<string[]>([]);

    const [showSpecialtiesModal, setShowSpecialtiesModal] = useState(false);
    const [specialtyForm, setSpecialtyForm] = useState('');
    const [editingSpecialtyOriginal, setEditingSpecialtyOriginal] = useState<string | null>(null);

    const [selectedProcedureId, setSelectedProcedureId] = useState<string | null>('p1');
    const selectedProcedure = procedures.find(p => p.id === selectedProcedureId);

    // --- MODAL STATE ---
    const [showUserModal, setShowUserModal] = useState(false);
    const [newUser, setNewUser] = useState<Partial<AppUser>>({
        role: 'Medico',
        active: true,
        notificationPreferences: { delays: true, daily_summary: true, status_changes: true }
    });
    const [newUserSpecialty, setNewUserSpecialty] = useState<string>('');
    const [isEditingUser, setIsEditingUser] = useState(false);

    // Doctor Modal State
    const [showDoctorModal, setShowDoctorModal] = useState(false);
    const [doctorForm, setDoctorForm] = useState<Partial<Doctor>>({ name: '', specialty: 'Cirugía General', email: '', active: true });
    const [isEditingDoctor, setIsEditingDoctor] = useState(false);

    // Vendor Modal State
    const [showVendorModal, setShowVendorModal] = useState(false);
    const [vendorForm, setVendorForm] = useState<{ id?: string, name: string, email?: string, requires_material_validation?: boolean }>({ name: '', email: '', requires_material_validation: true });
    const [isEditingVendor, setIsEditingVendor] = useState(false);

    // Coverage Modal State
    const [showCoverageModal, setShowCoverageModal] = useState(false);
    const [coverageForm, setCoverageForm] = useState<Partial<Coverage>>({ name: '', vendor_id: '', type: 'Obra Social' });
    const [isEditingCoverage, setIsEditingCoverage] = useState(false);

    // Global Settings
    const [telegramGlobalEnabled, setTelegramGlobalEnabled] = useState(false);
    const [bccEnabled, setBccEnabled] = useState(false); // New state for BCC

    // Procedure Create Modal State
    const [showProcModal, setShowProcModal] = useState(false);
    const [newProcedure, setNewProcedure] = useState<Partial<ProcedureType>>({
        name: '',
        specialty: 'Ortopedia',
        defaultDurationMin: 60,
        requiredMaterials: []
    });

    // Procedure Edit Modal State
    const [showEditProcModal, setShowEditProcModal] = useState(false);
    const [editingProcedure, setEditingProcedure] = useState<ProcedureType | null>(null);

    // Material Modal State
    const [showMaterialModal, setShowMaterialModal] = useState(false);
    const [newMaterial, setNewMaterial] = useState<Partial<MaterialTemplate>>({
        name: '',
        category: 'Herramienta',
        quantity: 1
    });

    const [showORModal, setShowORModal] = useState(false);
    const [newORName, setNewORName] = useState('');
    const [newORID, setNewORID] = useState('');
    const [newORGoal, setNewORGoal] = useState<number>(4);
    const [newORStartTime, setNewORStartTime] = useState('07:00');
    const [isEditingOR, setIsEditingOR] = useState(false);

    const [searchCoverage, setSearchCoverage] = useState('');
    const [searchUsers, setSearchUsers] = useState('');
    const [searchDoctors, setSearchDoctors] = useState('');

    // SMTP Settings State
    const [smtpSettings, setSmtpSettings] = useState({
        host: '',
        port: '587',
        user: '',
        pass: '',
        fromName: 'Panel de Cirugías',
        fromEmail: ''
    });
    const [isSavingSmtp, setIsSavingSmtp] = useState(false);

    useEffect(() => {
        fetchInitialData();
    }, []);

    const fetchInitialData = async () => {
        await Promise.all([
            fetchUsers(),
            fetchDoctors(),
            fetchOperatingRooms(),
            fetchVendors(),
            fetchCoverages(),
            fetchProcedures(),
            fetchSpecialties(),
            fetchCategories(),
            fetchGlobalSettings(),
            fetchCatalogItems()
        ]);
    };

    const fetchGlobalSettings = async () => {
        try {
            const { data, error } = await supabase
                .from('admin_settings')
                .select('*');

            if (data) {
                const settingsData: any = {};
                data.forEach((s: any) => settingsData[s.key] = s.value);
                
                setTelegramGlobalEnabled(settingsData.telegram_enabled === 'true');
                setBccEnabled(settingsData.bcc_enabled === true);
                
                setSmtpSettings({
                    host: settingsData.smtp_host || '',
                    port: settingsData.smtp_port || '587',
                    user: settingsData.smtp_user || '',
                    pass: settingsData.smtp_pass || '',
                    fromName: settingsData.smtp_from_name || 'Panel de Cirugías',
                    fromEmail: settingsData.smtp_from_email || ''
                });
            }
        } catch (error) {
            console.error('Error fetching global settings:', error);
        }
    };

    const toggleTelegramGlobal = async () => {
        const newValue = !telegramGlobalEnabled;
        const { error } = await supabase
            .from('admin_settings')
            .update({ value: String(newValue) })
            .eq('key', 'telegram_enabled');

        if (!error) {
            setTelegramGlobalEnabled(newValue);
        } else {
            alert('Error al actualizar configuración global.');
            console.error(error);
        }
    };

    const toggleBcc = async () => {
        const newValue = !bccEnabled;
        // We update the row where key='telegram_enabled' because it relies on that row existing
        const { error: err } = await supabase
            .from('admin_settings')
            .update({ bcc_enabled: newValue })
            .eq('key', 'telegram_enabled');

        if (!err) {
            setBccEnabled(newValue);
        } else {
            console.error(err);
            alert('Error al actualizar BCC.');
        }
    };

    const fetchProcedures = async () => {
        const { data, error } = await supabase.from('procedures').select('*').order('name');
        if (!error && data) {
            setProcedures(data.map((p: any) => ({
                id: p.id,
                name: p.name,
                specialty: p.specialty,
                defaultDurationMin: p.default_duration_min,
                requiredMaterials: p.required_materials || []
            })));
            if (data.length > 0 && !selectedProcedureId) {
                setSelectedProcedureId(data[0].id);
            }
        }
    };

    const fetchCatalogItems = async () => {
        setIsLoadingCatalog(true);
        const { data, error } = await supabase.from('catalog_items').select('*').order('name');
        if (!error && data) {
            setCatalogItems(data);
        }
        setIsLoadingCatalog(false);
    };

    const handleSaveCatalogItem = async () => {
        if (!catalogForm.name) return;

        const payload = {
            name: catalogForm.name!,
            code: catalogForm.code || null,
            category: catalogForm.category || 'surgery',
            active: catalogForm.active || false,
            default_unit: catalogForm.default_unit || null
        };

        if (isEditingCatalog && catalogForm.id) {
            const { error } = await supabase.from('catalog_items').update(payload).eq('id', catalogForm.id);
            if (!error) {
                setShowCatalogModal(false);
                fetchCatalogItems();
            }
        } else {
            const { error } = await supabase.from('catalog_items').insert([payload]);
            if (!error) {
                setShowCatalogModal(false);
                fetchCatalogItems();
            }
        }
    };

    const handleDeleteCatalogItem = async (id: string) => {
        if (window.confirm('¿Eliminar este ítem del catálogo?')) {
            const { error } = await supabase.from('catalog_items').delete().eq('id', id);
            if (!error) {
                fetchCatalogItems();
            }
        }
    };

    const fetchSpecialties = async () => {
        const { data, error } = await supabase.from('specialties').select('name').order('name');
        if (!error && data) setSpecialties(data.map((s: any) => s.name));
    };

    const fetchCategories = async () => {
        const { data, error } = await supabase.from('material_categories').select('name').order('name');
        if (!error && data) setCategories(data.map((c: any) => c.name));
    };

    const fetchUsers = async () => {
        const { data, error } = await supabase.from('users').select('*').order('name');
        if (!error && data) {
            setUsers(data.map(u => ({
                id: u.id,
                name: u.name,
                email: u.email,
                password: u.password,
                role: u.role as UserRole,
                active: u.active,
                vendorId: u.vendor_id,
                doctorId: u.doctor_id,
                telegramChatId: u.telegram_chat_id,
                telegramEnabled: u.telegram_enabled,
                notificationPreferences: u.notification_preferences || { delays: true, daily_summary: true, status_changes: true },
                canFillForms: u.can_fill_forms
            })));
        }
    };

    const fetchDoctors = async () => {
        const { data, error } = await supabase.from('doctors').select('*').order('full_name');
        if (!error && data) {
            setDoctors(data.map(d => ({
                id: d.id,
                name: d.full_name,
                specialty: d.specialty || 'Cirugía General',
                email: d.email || '',
                active: d.active
            })));
        }
    };

    const fetchOperatingRooms = async () => {
        const { data, error } = await supabase.from('operating_rooms').select('*').order('name');
        if (!error && data) setOrs(data);
    };

    const fetchVendors = async () => {
        const { data, error } = await supabase.from('vendors').select('*').order('name');
        if (!error && data) setVendors(data);
    };

    const fetchCoverages = async () => {
        const { data, error } = await supabase.from('coverages').select('id, name, type, vendor_id').order('name');
        if (!error && data) setCoverages(data);
    };

    // --- HANDLERS ---
    const toggleDoctorStatus = async (id: string, currentStatus: boolean) => {
        // Find if there's a user associated with this doctor (by email)
        const doc = doctors.find(d => d.id === id);
        if (doc) {
            await Promise.all([
                supabase.from('doctors').update({ active: !currentStatus }).eq('id', id),
                supabase.from('users').update({ active: !currentStatus }).eq('email', doc.email)
            ]);
        }
        fetchInitialData();
    };


    const openNewDoctorModal = () => {
        setDoctorForm({ name: '', specialty: specialties[0] || '', email: '', active: true });
        setIsEditingDoctor(false);
        setShowDoctorModal(true);
    };

    const openEditDoctorModal = (doc: Doctor) => {
        setDoctorForm({ ...doc });
        setIsEditingDoctor(true);
        setShowDoctorModal(true);
    };

    const handleSaveDoctor = async () => {
        if (doctorForm.name) {
            const payload = {
                full_name: doctorForm.name,
                specialty: doctorForm.specialty || 'General',
                email: doctorForm.email,
                active: doctorForm.active
            };

            const { data: savedDoc, error } = isEditingDoctor && doctorForm.id
                ? await supabase.from('doctors').update(payload).eq('id', doctorForm.id).select().single()
                : await supabase.from('doctors').insert(payload).select().single();

            if (error) {
                console.error('Error saving doctor:', error);
                alert(`Error al guardar médico: ${error.message}`);
                return;
            }

            if (savedDoc) {
                const userPayload = {
                    name: doctorForm.name,
                    email: doctorForm.email,
                    role: 'Medico',
                    active: doctorForm.active
                };
                const { error: userError } = await supabase.from('users').upsert(userPayload, { onConflict: 'email' });
                if (userError) {
                    console.error('Error syncing user:', userError);
                    alert(`El médico se guardó pero hubo un error sincronizando el usuario de sistema: ${userError.message}`);
                }
            }

            fetchInitialData();
            setShowDoctorModal(false);
        } else {
            alert('Por favor complete todos los campos requeridos (Nombre, Email).');
        }
    };

    const handleDeleteDoctor = async (id: string) => {
        const doc = doctors.find(d => d.id === id);
        if (window.confirm('¿Está seguro de eliminar este médico? También se eliminará su acceso como usuario.')) {
            if (doc) {
                await Promise.all([
                    supabase.from('doctors').delete().eq('id', id),
                    supabase.from('users').delete().eq('email', doc.email)
                ]);
            }
            fetchInitialData();
        }
    };

    // Specialties Handlers
    const handleSaveSpecialty = async () => {
        if (!specialtyForm.trim()) return;

        if (editingSpecialtyOriginal) {
            // Update: Rename in table
            await supabase.from('specialties').update({ name: specialtyForm }).eq('name', editingSpecialtyOriginal);
            setEditingSpecialtyOriginal(null);
        } else {
            // Add new
            await supabase.from('specialties').insert({ name: specialtyForm });
        }
        setSpecialtyForm('');
        fetchSpecialties();
    };

    const handleEditSpecialty = (spec: string) => {
        setSpecialtyForm(spec);
        setEditingSpecialtyOriginal(spec);
    };

    const handleDeleteSpecialty = async (spec: string) => {
        if (window.confirm(`¿Eliminar la especialidad "${spec}"? Esto podría afectar a los médicos asignados.`)) {
            await supabase.from('specialties').delete().eq('name', spec);
            fetchSpecialties();
        }
    };

    // Vendor Handlers
    const openNewVendorModal = () => {
        setVendorForm({ name: '', email: '', requires_material_validation: true });
        setIsEditingVendor(false);
        setShowVendorModal(true);
    };

    const openEditVendorModal = (vendor: Vendor) => {
        setVendorForm({ id: vendor.id, name: vendor.name, email: vendor.email || '', requires_material_validation: vendor.requires_material_validation ?? true });
        setIsEditingVendor(true);
        setShowVendorModal(true);
    };

    const handleSaveVendor = async () => {
        if (vendorForm.name.trim()) {
            const payload = {
                name: vendorForm.name,
                email: vendorForm.email || null,
                requires_material_validation: vendorForm.requires_material_validation ?? true
            };
            if (isEditingVendor && vendorForm.id) {
                await supabase.from('vendors').update(payload).eq('id', vendorForm.id);
            } else {
                await supabase.from('vendors').insert([payload]);
            }
            fetchVendors();
            setShowVendorModal(false);
        }
    };

    const handleDeleteVendor = async (id: string) => {
        if (window.confirm('¿Eliminar este proveedor?')) {
            await supabase.from('vendors').delete().eq('id', id);
            fetchVendors();
        }
    };

    // Coverage Handlers
    const openNewCoverageModal = () => {
        setCoverageForm({ name: '', vendor_id: '', type: 'Obra Social' });
        setIsEditingCoverage(false);
        setShowCoverageModal(true);
    };

    const openEditCoverageModal = (cov: { id: string, name: string, vendor_id?: string }) => {
        setCoverageForm(cov);
        setIsEditingCoverage(true);
        setShowCoverageModal(true);
    };

    const handleSaveCoverage = async () => {
        if (coverageForm.name && coverageForm.name.trim()) {
            const payload = {
                name: coverageForm.name,
                type: coverageForm.type || 'Obra Social',
                vendor_id: coverageForm.vendor_id || null
            };
            if (isEditingCoverage && coverageForm.id) {
                await supabase.from('coverages').update(payload).eq('id', coverageForm.id);
            } else {
                await supabase.from('coverages').insert(payload);
            }
            fetchCoverages();
            setShowCoverageModal(false);
        }
    };

    const handleSaveSmtp = async () => {
        setIsSavingSmtp(true);
        try {
            const updates = [
                { key: 'smtp_host', value: smtpSettings.host },
                { key: 'smtp_port', value: smtpSettings.port },
                { key: 'smtp_user', value: smtpSettings.user },
                { key: 'smtp_pass', value: smtpSettings.pass },
                { key: 'smtp_from_name', value: smtpSettings.fromName },
                { key: 'smtp_from_email', value: smtpSettings.fromEmail }
            ];

            const { error: userError } = await supabase.rpc('save_email_settings', {
                p_host: smtpSettings.host,
                p_port: smtpSettings.port,
                p_user: smtpSettings.user,
                p_pass: smtpSettings.pass,
                p_from_name: smtpSettings.fromName,
                p_from_email: smtpSettings.fromEmail,
                p_admin_email: user?.email || '',
                p_admin_password: user?.password || ''
            });

            if (userError) throw userError;
            alert('Configuración SMTP guardada con éxito.');
        } catch (error: any) {
            console.error('Error saving SMTP settings:', error);
            alert(`Error al guardar: ${error.message || 'Error desconocido'}`);
        } finally {
            setIsSavingSmtp(false);
        }
    };

    const handleDeleteCoverage = async (id: string) => {
        if (window.confirm('¿Eliminar este prestador?')) {
            await supabase.from('coverages').delete().eq('id', id);
            fetchCoverages();
        }
    };

    const toggleUserStatus = async (userId: string, currentStatus: boolean) => {
        const { error } = await supabase.from('users').update({ active: !currentStatus }).eq('id', userId);
        if (!error) {
            // Also update doctor status if the user is a doctor
            const u = users.find(user => user.id === userId);
            if (u && u.role === 'Medico') {
                await supabase.from('doctors').update({ active: !currentStatus }).eq('email', u.email);
            }
            fetchInitialData();
        } else {
            alert('Error al actualizar estado del usuario');
        }
    };

    const toggleUserTelegram = async (userId: string, current: boolean) => {
        const { error } = await supabase.from('users').update({ telegram_enabled: !current }).eq('id', userId);
        if (!error) {
            fetchInitialData();
        } else {
            alert('Error al actualizar preferencia de Telegram');
        }
    };

    const toggleOrStatus = async (id: string, currentStatus: boolean) => {
        await supabase.from('operating_rooms').update({ active: !currentStatus }).eq('id', id);
        fetchOperatingRooms();
    };

    const openEditORModal = (or: OperatingRoom) => {
        setNewORID(or.id);
        setNewORName(or.name);
        setNewORGoal(or.daily_goal || 4);
        setNewORStartTime(or.start_time || '07:00');
        setIsEditingOR(true);
        setShowORModal(true);
    };

    const handleDeleteOR = async (id: string) => {
        if (window.confirm(`¿Está seguro de eliminar el quirófano "${id}"?`)) {
            const { error } = await supabase.from('operating_rooms').delete().eq('id', id);
            if (error) {
                alert(`Error al eliminar quirófano: ${error.message}`);
            } else {
                fetchOperatingRooms();
            }
        }
    };

    const deleteMaterial = async (procId: string, matId: string) => {
        const proc = procedures.find(p => p.id === procId);
        if (proc) {
            const updatedMaterials = proc.requiredMaterials.filter(m => m.id !== matId);
            await supabase.from('procedures').update({ required_materials: updatedMaterials }).eq('id', procId);
            fetchProcedures();
        }
    };

    const handleOpenNewUser = () => {
        setNewUser({
            name: '', email: '', password: '', role: 'Medico', active: true, telegramChatId: '', telegramEnabled: false,
            notificationPreferences: { delays: true, daily_summary: true, status_changes: true }
        });
        setNewUserSpecialty('');
        setIsEditingUser(false);
        setShowUserModal(true);
    };

    const handleOpenEditUser = (user: AppUser) => {
        setNewUser({
            id: user.id,
            name: user.name,
            email: user.email,
            password: user.password || '',
            role: user.role,
            vendorId: user.vendorId,
            doctorId: user.doctorId,
            active: user.active,
            telegramChatId: user.telegramChatId || '',
            telegramEnabled: user.telegramEnabled || false,
            notificationPreferences: user.notificationPreferences || { delays: true, daily_summary: true, status_changes: true },
            canFillForms: user.canFillForms || false
        });

        if (user.role === 'Medico' || user.role === 'Residente') {
            const doc = doctors.find(d => d.email === user.email);
            if (doc) setNewUserSpecialty(doc.specialty);
            else setNewUserSpecialty('');
        } else {
            setNewUserSpecialty('');
        }

        setIsEditingUser(true);
        setShowUserModal(true);
    };

    const handleDeleteUser = async (id: string) => {
        const u = users.find(user => user.id === id);
        if (window.confirm('¿Está seguro de eliminar este usuario?')) {
            const { error } = await supabase.from('users').delete().eq('id', id);
            if (!error && u && u.role === 'Medico') {
                await supabase.from('doctors').delete().eq('email', u.email);
            }
            if (error) {
                alert(`Error al eliminar usuario: ${error.message}`);
            } else {
                fetchInitialData();
            }
        }
    };

    const handleSaveUser = async () => {
        // Basic Validation
        if (!newUser.name || !newUser.email || !newUser.role) return;

        // Role Specific Validation
        if (newUser.role === 'Ortopedia' && !newUser.vendorId) return;
        if (newUser.role === 'Medico' && !newUserSpecialty) return;

        try {
            // 1. If role is Medico OR Anestesista, AUTOMATICALLY create/update the Doctor profile
            let doctorId = null;
            if (newUser.role === 'Medico' || newUser.role === 'Anestesista' || newUser.role === 'Residente') {
                const doctorPayload = {
                    full_name: newUser.name,
                    email: newUser.email,
                    specialty: newUser.role === 'Anestesista' ? 'Anestesiología' : (newUser.role === 'Residente' ? 'Residencia' : newUserSpecialty),
                    active: newUser.active
                };
                if (newUser.doctorId) {
                    (doctorPayload as any).id = newUser.doctorId;
                }

                const { data: docData, error: docError } = await supabase
                    .from('doctors')
                    .upsert(doctorPayload, { onConflict: newUser.doctorId ? 'id' : 'email' })
                    .select('id')
                    .single();

                if (docError) throw docError;
                doctorId = docData?.id;
            }

            // 2. Create/Update the User (System Access)
            const userPayload: any = {
                name: newUser.name,
                email: newUser.email,
                password: newUser.password,
                role: newUser.role,
                vendor_id: newUser.vendorId,
                doctor_id: doctorId,
                active: newUser.active !== undefined ? newUser.active : true,
                telegram_chat_id: newUser.telegramChatId,
                telegram_enabled: newUser.telegramEnabled !== undefined ? newUser.telegramEnabled : true,
                notification_preferences: newUser.notificationPreferences,
                can_fill_forms: newUser.canFillForms
            };

            if (isEditingUser && newUser.id) {
                userPayload.id = newUser.id;
            }

            const { error: userError } = await supabase
                .from('users')
                .upsert(userPayload, { onConflict: isEditingUser ? 'id' : 'email' });

            if (userError) throw userError;

            // 3. Cleanup and Refresh
            fetchInitialData();
            setShowUserModal(false);
            setIsEditingUser(false);
            setNewUser({ role: 'Medico', active: true, telegramChatId: '', telegramEnabled: false, notificationPreferences: { delays: true, daily_summary: true, status_changes: true } });
            setNewUserSpecialty('');

        } catch (error: any) {
            console.error('Save User Error:', error);
            alert(`Error al guardar usuario: ${error.message}`);
        }
    };

    const handleSaveProcedure = async () => {
        if (newProcedure.name && newProcedure.specialty) {
            const payload = {
                name: newProcedure.name,
                specialty: newProcedure.specialty,
                default_duration_min: newProcedure.defaultDurationMin || 60,
                required_materials: []
            };
            const { data, error } = await supabase.from('procedures').insert(payload).select().single();
            if (!error && data) {
                setSelectedProcedureId(data.id);
                fetchProcedures();
                setShowProcModal(false);
                setNewProcedure({ name: '', specialty: 'Ortopedia', defaultDurationMin: 60, requiredMaterials: [] });
            }
        }
    };

    const handleOpenEditProcedure = () => {
        if (selectedProcedure) {
            setEditingProcedure({ ...selectedProcedure });
            setShowEditProcModal(true);
        }
    };

    const handleUpdateProcedure = async () => {
        if (editingProcedure) {
            const payload = {
                name: editingProcedure.name,
                specialty: editingProcedure.specialty,
                default_duration_min: editingProcedure.defaultDurationMin,
                required_materials: editingProcedure.requiredMaterials
            };
            await supabase.from('procedures').update(payload).eq('id', editingProcedure.id);
            fetchProcedures();
            setShowEditProcModal(false);
            setEditingProcedure(null);
        }
    };

    const handleDeleteProcedure = async (id: string) => {
        if (window.confirm('¿Está seguro de eliminar este tipo de cirugía?')) {
            await supabase.from('procedures').delete().eq('id', id);
            fetchProcedures();
            setSelectedProcedureId(null);
        }
    };

    const handleSaveCategory = async () => {
        if (newCategoryName && !categories.includes(newCategoryName)) {
            await supabase.from('material_categories').insert({ name: newCategoryName });
            fetchCategories();
            setNewMaterial({ ...newMaterial, category: newCategoryName });
            setNewCategoryName('');
            setIsAddingCategory(false);
        }
    };

    const handleSaveMaterial = async () => {
        if (selectedProcedureId && newMaterial.name && newMaterial.quantity && newMaterial.category) {
            const proc = procedures.find(p => p.id === selectedProcedureId);
            if (proc) {
                const newItem: MaterialTemplate = {
                    id: `m-${Date.now()}`,
                    name: newMaterial.name,
                    quantity: newMaterial.quantity,
                    category: newMaterial.category
                };
                const updatedMaterials = [...proc.requiredMaterials, newItem];
                await supabase.from('procedures').update({ required_materials: updatedMaterials }).eq('id', selectedProcedureId);
                fetchProcedures();
                setShowMaterialModal(false);
                setNewMaterial({ name: '', category: 'Herramienta', quantity: 1 });
            }
        }
    };

    const handleSaveOR = async () => {
        if (newORName.trim() && newORID.trim()) {
            const payload = {
                id: newORID,
                name: newORName,
                active: true,
                daily_goal: newORGoal,
                start_time: newORStartTime
            };

            const { error } = isEditingOR
                ? await supabase.from('operating_rooms').update(payload).eq('id', newORID)
                : await supabase.from('operating_rooms').insert(payload);

            if (error) {
                alert(`Error al guardar quirófano: ${error.message}`);
            } else {
                fetchOperatingRooms();
                setShowORModal(false);
                setNewORName('');
                setNewORID('');
                setNewORGoal(4);
                setNewORStartTime('07:00');
                setIsEditingOR(false);
            }
        }
    };

    return (
        <div className="flex-1 h-full overflow-hidden bg-slate-50 flex flex-col relative">
            <ProgressBar isLoading={false} /> {/* Settings has many small fetches, usually fast, but keeping for consistency */}
            {/* Header - SuperAdmin Context */}
            <header className="bg-slate-900 text-white px-4 py-4 md:px-8 md:py-6 flex-shrink-0 flex justify-between items-center shadow-lg z-10">
                <div>
                    <h1 className="text-lg md:text-2xl font-bold flex items-center gap-2 md:gap-3">
                        <span className="material-symbols-outlined text-amber-400 text-2xl md:text-2xl">admin_panel_settings</span>
                        <span>Administración</span>
                    </h1>
                    <p className="hidden md:block text-slate-400 text-sm mt-1">Configuración maestra de recursos y árboles de decisión.</p>
                </div>
                <div className="bg-slate-800 px-4 py-2 rounded-lg border border-slate-700">
                    <span className="text-xs text-slate-400 font-bold uppercase tracking-wider block">Rol Actual</span>
                    <span className="text-sm font-bold text-white">SuperAdmin</span>
                </div>
            </header>

            {/* Global Alert Control Bar (SuperAdmin Only) */}
            {user?.role === 'SuperAdmin' && (
                <div className="flex flex-col md:flex-row gap-2 md:gap-4 bg-slate-800 p-2 md:p-4 border-b border-slate-700">
                    {/* Master Switch */}
                    <div className={`${telegramGlobalEnabled ? 'bg-indigo-600' : 'bg-slate-700'} text-white px-4 py-2 md:px-6 md:py-3 rounded-lg flex justify-between items-center transition-colors flex-1`}>
                        <div className="flex items-center gap-2 md:gap-3">
                            <span className="material-symbols-outlined text-xl">{telegramGlobalEnabled ? 'mark_chat_unread' : 'mark_chat_read'}</span>
                            <div>
                                <p className="text-xs md:text-sm font-bold">Servicio de Notificaciones</p>
                                <p className="hidden md:block text-xs opacity-80">{telegramGlobalEnabled ? 'ACTIVO: El sistema envía alertas.' : 'PAUSADO: Nadie recibe mensajes.'}</p>
                            </div>
                        </div>
                        <button
                            onClick={toggleTelegramGlobal}
                            className={`px-4 py-1.5 rounded-full text-xs font-bold border transition-all flex items-center gap-2 ${telegramGlobalEnabled ? 'bg-white text-indigo-700 border-transparent hover:bg-indigo-50' : 'bg-transparent text-slate-300 border-slate-500 hover:border-white hover:text-white'}`}
                        >
                            {telegramGlobalEnabled ? 'DESACTIVAR' : 'ACTIVAR'}
                        </button>
                    </div>

                    {/* BCC Switch */}
                    <div className={`${bccEnabled ? 'bg-emerald-600' : 'bg-slate-700'} text-white px-4 py-2 md:px-6 md:py-3 rounded-lg flex justify-between items-center transition-colors flex-1`}>
                        <div className="flex items-center gap-2 md:gap-3">
                            <span className="material-symbols-outlined text-xl">{bccEnabled ? 'visibility' : 'visibility_off'}</span>
                            <div>
                                <p className="text-xs md:text-sm font-bold">Monitoreo de Alertas (Admin)</p>
                                <p className="hidden md:block text-xs opacity-80">{bccEnabled ? 'RECIBES COPIA de todo mensaje enviado para auditoría.' : 'SOLO LOG: No recibes copias automáticas.'}</p>
                            </div>
                        </div>
                        <button
                            onClick={toggleBcc}
                            className={`px-4 py-1.5 rounded-full text-xs font-bold border transition-all flex items-center gap-2 ${bccEnabled ? 'bg-white text-emerald-700 border-transparent hover:bg-emerald-50' : 'bg-transparent text-slate-300 border-slate-500 hover:border-white hover:text-white'}`}
                        >
                            {bccEnabled ? 'DESACTIVAR' : 'ACTIVAR'}
                        </button>
                    </div>
                </div>
            )}

            <div className="flex-1 overflow-hidden flex flex-col md:flex-row w-full">
                {/* Mobile Navigation (Dropdown) */}
                <div className="md:hidden p-4 bg-white border-b border-slate-200">
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Sección</label>
                    <div className="relative">
                        <select
                            value={activeTab}
                            onChange={(e) => setActiveTab(e.target.value as any)}
                            className="w-full appearance-none bg-slate-50 border border-slate-300 text-slate-900 text-sm rounded-lg focus:ring-amber-500 focus:border-amber-500 block p-2.5 font-semibold"
                        >
                            <option value="users">Gestión de Usuarios</option>
                            <option value="doctors">ABM Médicos</option>
                            <option value="ors">Quirófanos</option>
                            <option value="vendors">Proveedores / Ortopedias</option>
                            <option value="coverages">Prestadores (OS / ART)</option>
                            <option value="tree">Árbol de Procedimientos</option>
                            <option value="email_config">Configuración de Correo</option>
                            <option value="forms">Documentación e Impresos</option>
                        </select>

                        <span className="material-symbols-outlined absolute right-3 top-3 text-slate-500 pointer-events-none">arrow_drop_down</span>
                    </div>
                </div>

                {/* Sidebar Navigation (Desktop) */}
                <nav className="hidden md:flex flex-shrink-0 flex-col w-72 bg-white border-r border-slate-200 h-full overflow-y-auto">
                    <div className="p-6">
                        <p className="text-xs font-bold text-slate-400 uppercase mb-4 tracking-wider">Seguridad</p>
                        <div className="flex flex-col gap-2">
                            <button
                                onClick={() => setActiveTab('users')}
                                className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all text-left ${activeTab === 'users' ? 'bg-amber-50 text-amber-700 border border-amber-100' : 'text-slate-600 hover:bg-slate-50'
                                    }`}
                            >
                                 <span className="material-symbols-outlined">group</span>
                                Gestión de Usuarios
                            </button>
                            <button
                                onClick={() => setActiveTab('email_config')}
                                className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all text-left ${activeTab === 'email_config' ? 'bg-amber-50 text-amber-700 border border-amber-100' : 'text-slate-600 hover:bg-slate-50'
                                    }`}
                            >
                                <span className="material-symbols-outlined">mail</span>
                                Configuración de Correo
                            </button>
                        </div>

                        <p className="text-xs font-bold text-slate-400 uppercase mb-4 mt-8 tracking-wider">Gestión de Recursos</p>
                        <div className="flex flex-col gap-2">
                            <button
                                onClick={() => setActiveTab('doctors')}
                                className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all text-left ${activeTab === 'doctors' ? 'bg-blue-50 text-blue-700 border border-blue-100' : 'text-slate-600 hover:bg-slate-50'
                                    }`}
                            >
                                <span className="material-symbols-outlined">stethoscope</span>
                                ABM Médicos
                            </button>
                            <button
                                onClick={() => setActiveTab('ors')}
                                className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all text-left ${activeTab === 'ors' ? 'bg-blue-50 text-blue-700 border border-blue-100' : 'text-slate-600 hover:bg-slate-50'
                                    }`}
                            >
                                <span className="material-symbols-outlined">door_sensor</span>
                                Quirófanos
                            </button>
                            <button
                                onClick={() => setActiveTab('vendors')}
                                className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all text-left ${activeTab === 'vendors' ? 'bg-blue-50 text-blue-700 border border-blue-100' : 'text-slate-600 hover:bg-slate-50'
                                    }`}
                            >
                                <span className="material-symbols-outlined">domain</span>
                                Proveedores / Ortopedias
                            </button>
                            <button
                                onClick={() => setActiveTab('coverages')}
                                className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all text-left ${activeTab === 'coverages' ? 'bg-blue-50 text-blue-700 border border-blue-100' : 'text-slate-600 hover:bg-slate-50'
                                    }`}
                            >
                                <span className="material-symbols-outlined">health_and_safety</span>
                                Prestadores (OS / ART)
                            </button>
                        </div>

                        <p className="text-xs font-bold text-slate-400 uppercase mb-4 mt-8 tracking-wider">Lógica de Negocio</p>
                        <div className="flex flex-col gap-2">
                            <button
                                onClick={() => setActiveTab('tree')}
                                className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all text-left ${activeTab === 'tree' ? 'bg-purple-50 text-purple-700 border border-purple-100' : 'text-slate-600 hover:bg-slate-50'
                                    }`}
                            >
                                <span className="material-symbols-outlined">account_tree</span>
                                Árbol de Procedimientos
                            </button>
                            <button
                                onClick={() => setActiveTab('vademecum')}
                                className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all text-left ${activeTab === 'vademecum' ? 'bg-indigo-50 text-indigo-700 border border-indigo-100' : 'text-slate-600 hover:bg-slate-50'
                                    }`}
                            >
                                <span className="material-symbols-outlined">inventory_2</span>
                                Vademécum Cirugía
                            </button>
                            <button
                                onClick={() => setActiveTab('medications')}
                                className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all text-left ${activeTab === 'medications' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'text-slate-600 hover:bg-slate-50'
                                    }`}
                            >
                                <span className="material-symbols-outlined">medication</span>
                                Medicamentos Enfermería
                            </button>
                        </div>

                        <p className="text-xs font-bold text-slate-400 uppercase mb-4 mt-8 tracking-wider">Documentación</p>
                        <div className="flex flex-col gap-2">
                            <button
                                onClick={() => setActiveTab('forms')}
                                className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all text-left ${activeTab === 'forms' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'text-slate-600 hover:bg-slate-50'
                                    }`}
                            >
                                <span className="material-symbols-outlined">print</span>
                                Formularios e Impresos
                            </button>
                        </div>
                    </div>
                </nav>

                {/* Main Content Area */}
                <main className="flex-1 h-full overflow-y-auto bg-slate-50 p-4 md:p-8">

                    {/* TAB: USERS MANAGEMENT */}
                    {activeTab === 'users' && (
                        <div className="max-w-6xl mx-auto flex flex-col gap-6 animate-fadeIn">
                            <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
                                <div>
                                    <h2 className="text-xl font-bold text-slate-900">Usuarios del Sistema</h2>
                                    <p className="text-sm text-slate-500">Gestione accesos, roles y vinculaciones con proveedores externos.</p>
                                </div>
                                <button
                                    onClick={handleOpenNewUser}
                                    className="w-full md:w-auto bg-amber-600 hover:bg-amber-700 text-white px-4 py-2.5 rounded-lg text-sm font-bold flex justify-center items-center gap-2 shadow-sm transition-colors"
                                >
                                    <span className="material-symbols-outlined text-lg">person_add</span> Crear Usuario
                                </button>
                            </div>

                            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center gap-3">
                                <span className="material-symbols-outlined text-slate-400">search</span>
                                <input
                                    type="text"
                                    placeholder="Buscar por nombre, email o rol..."
                                    className="flex-1 bg-transparent border-none focus:ring-0 text-sm"
                                    value={searchUsers}
                                    onChange={(e) => setSearchUsers(e.target.value)}
                                />
                                {searchUsers && (
                                    <button onClick={() => setSearchUsers('')} className="text-slate-400 hover:text-slate-600">
                                        <span className="material-symbols-outlined text-sm">close</span>
                                    </button>
                                )}
                            </div>

                            {/* DESKTOP TABLE VIEW */}
                            <div className="hidden md:block bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden overflow-x-auto">
                                <table className="w-full text-left">
                                    <thead className="bg-slate-100 text-slate-500 text-xs uppercase font-bold tracking-wider">
                                        <tr>
                                            <th className="px-6 py-4">Usuario</th>
                                            <th className="px-6 py-4">Rol</th>
                                            <th className="px-6 py-4">Organización / Proveedor</th>
                                            <th className="px-6 py-4">Contraseña</th>
                                            <th className="px-6 py-4 text-center">Estado</th>
                                            <th className="px-6 py-4 text-center">Telegram</th>
                                            <th className="px-6 py-4 text-right">Acciones</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {users
                                            .filter(u =>
                                                u.name.toLowerCase().includes(searchUsers.toLowerCase()) ||
                                                u.email.toLowerCase().includes(searchUsers.toLowerCase()) ||
                                                u.role.toLowerCase().includes(searchUsers.toLowerCase())
                                            )
                                            .map(u => (
                                                <tr key={u.id} className="hover:bg-slate-50 transition-colors group">
                                                    <td className="px-6 py-4">
                                                        <div className="flex flex-col">
                                                            <span className="font-medium text-slate-900">{u.name}</span>
                                                            <span className="text-xs text-slate-500">{u.email}</span>
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold border ${u.role === 'SuperAdmin' ? 'bg-slate-100 text-slate-700 border-slate-200' :
                                                            u.role === 'Medico' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                                                                u.role === 'Ortopedia' ? 'bg-purple-50 text-purple-700 border-purple-200' :
                                                                    u.role === 'Direccion' ? 'bg-slate-900 text-white border-slate-700' :
                                                                        'bg-orange-50 text-orange-700 border-orange-200'
                                                            }`}>
                                                            {u.role}
                                                        </span>
                                                    </td>
                                                    <td className="px-6 py-4 text-sm text-slate-600">
                                                        {u.role === 'Ortopedia' && u.vendorId ? (
                                                            <div className="flex items-center gap-2">
                                                                <span className="material-symbols-outlined text-slate-400">domain</span>
                                                                {vendors.find(v => v.id === u.vendorId)?.name || 'Desconocido'}
                                                            </div>
                                                        ) : (
                                                            <span className="text-slate-400 italic">Interno (Hospital)</span>
                                                        )}
                                                    </td>
                                                    <td className="px-6 py-4 text-sm text-slate-500 font-mono">
                                                        <div className="flex items-center gap-2 group/pass">
                                                            <input
                                                                type="password"
                                                                value={u.password || ''}
                                                                readOnly
                                                                className="bg-transparent border-none w-24 text-xs focus:ring-0 cursor-default"
                                                            />
                                                            <button
                                                                onClick={(e) => {
                                                                    const input = e.currentTarget.previousElementSibling as HTMLInputElement;
                                                                    input.type = input.type === 'password' ? 'text' : 'password';
                                                                }}
                                                                className="opacity-0 group-hover/pass:opacity-100 transition-opacity text-slate-400 hover:text-primary"
                                                                title="Ver contraseña"
                                                            >
                                                                <span className="material-symbols-outlined text-sm">visibility</span>
                                                            </button>
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-4 text-center">
                                                        <button
                                                            onClick={() => toggleUserStatus(u.id, u.active)}
                                                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${u.active ? 'bg-emerald-500' : 'bg-slate-300'}`}
                                                        >
                                                            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${u.active ? 'translate-x-6' : 'translate-x-1'}`} />
                                                        </button>
                                                    </td>
                                                    <td className="px-6 py-4 text-center">
                                                        <button
                                                            onClick={() => toggleUserTelegram(u.id, !!u.telegramEnabled)}
                                                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${u.telegramEnabled ? 'bg-indigo-500' : 'bg-slate-300'}`}
                                                            title={u.telegramEnabled ? 'Notificaciones Telegram activas' : 'Notificaciones Telegram inactivas'}
                                                        >
                                                            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${u.telegramEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
                                                        </button>
                                                    </td>
                                                    <td className="px-6 py-4 text-right">
                                                        <div className="flex justify-end gap-2">
                                                            <button
                                                                onClick={() => handleOpenEditUser(u)}
                                                                className="text-slate-400 hover:text-amber-600 transition-colors"
                                                                title="Editar Usuario"
                                                            >
                                                                <span className="material-symbols-outlined">edit</span>
                                                            </button>
                                                            <button
                                                                onClick={() => handleDeleteUser(u.id)}
                                                                className="text-slate-400 hover:text-red-600 transition-colors"
                                                                title="Eliminar Usuario"
                                                            >
                                                                <span className="material-symbols-outlined">delete</span>
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))}
                                    </tbody>
                                </table>
                            </div>

                            {/* MOBILE CARD VIEW */}
                            <motion.div 
                                variants={containerVariants}
                                initial="hidden"
                                animate="visible"
                                className="md:hidden flex flex-col gap-4"
                            >
                                {users
                                    .filter(u =>
                                        u.name.toLowerCase().includes(searchUsers.toLowerCase()) ||
                                        u.email.toLowerCase().includes(searchUsers.toLowerCase()) ||
                                        u.role.toLowerCase().includes(searchUsers.toLowerCase())
                                    )
                                    .map(u => (
                                        <motion.div 
                                            key={u.id}
                                            variants={itemVariants}
                                            whileHover={{ y: -2 }}
                                            className="bg-white/70 backdrop-blur-md rounded-xl border border-slate-200/50 shadow-sm p-4 space-y-4"
                                        >
                                            <div className="flex justify-between items-start">
                                                <div className="flex flex-col">
                                                    <span className="font-bold text-slate-900">{u.name}</span>
                                                    <span className="text-xs text-slate-500">{u.email}</span>
                                                </div>
                                                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${u.role === 'SuperAdmin' ? 'bg-slate-100 text-slate-700 border-slate-200' :
                                                    u.role === 'Medico' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                                                        u.role === 'Ortopedia' ? 'bg-purple-50 text-purple-700 border-purple-200' :
                                                            u.role === 'Direccion' ? 'bg-slate-900 text-white border-slate-700' :
                                                                'bg-orange-50 text-orange-700 border-orange-200'
                                                    }`}>
                                                    {u.role}
                                                </span>
                                            </div>

                                            <div className="text-xs text-slate-600 flex items-center gap-2">
                                                <span className="material-symbols-outlined text-sm text-slate-400">domain</span>
                                                {u.role === 'Ortopedia' && u.vendorId 
                                                    ? vendors.find(v => v.id === u.vendorId)?.name || 'Desconocido'
                                                    : 'Interno (Hospital)'
                                                }
                                            </div>

                                            <div className="flex items-center justify-between pt-2 border-t border-slate-100 gap-4">
                                                <div className="flex items-center gap-4">
                                                    <div className="flex flex-col items-center gap-1">
                                                        <span className="text-[10px] font-bold text-slate-400 uppercase">Estado</span>
                                                        <button
                                                            onClick={() => toggleUserStatus(u.id, u.active)}
                                                            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${u.active ? 'bg-emerald-500' : 'bg-slate-300'}`}
                                                        >
                                                            <span className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${u.active ? 'translate-x-5' : 'translate-x-1'}`} />
                                                        </button>
                                                    </div>
                                                    <div className="flex flex-col items-center gap-1">
                                                        <span className="text-[10px] font-bold text-slate-400 uppercase">Telegram</span>
                                                        <button
                                                            onClick={() => toggleUserTelegram(u.id, !!u.telegramEnabled)}
                                                            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${u.telegramEnabled ? 'bg-indigo-500' : 'bg-slate-300'}`}
                                                        >
                                                            <span className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${u.telegramEnabled ? 'translate-x-5' : 'translate-x-1'}`} />
                                                        </button>
                                                    </div>
                                                </div>

                                                <div className="flex gap-2">
                                                    <button
                                                        onClick={() => handleOpenEditUser(u)}
                                                        className="size-9 bg-slate-50 text-slate-400 hover:text-amber-600 rounded-lg flex items-center justify-center border border-slate-200"
                                                    >
                                                        <span className="material-symbols-outlined text-lg">edit</span>
                                                    </button>
                                                    <button
                                                        onClick={() => handleDeleteUser(u.id)}
                                                        className="size-9 bg-red-50 text-red-400 hover:text-red-600 rounded-lg flex items-center justify-center border border-red-100"
                                                    >
                                                        <span className="material-symbols-outlined text-lg">delete</span>
                                                    </button>
                                                </div>
                                            </div>
                                        </motion.div>
                                    ))}
                            </motion.div>

                            {users.filter(u =>
                                u.name.toLowerCase().includes(searchUsers.toLowerCase()) ||
                                u.email.toLowerCase().includes(searchUsers.toLowerCase()) ||
                                u.role.toLowerCase().includes(searchUsers.toLowerCase())
                            ).length === 0 && (
                                    <div className="px-6 py-12 text-center text-slate-400 italic bg-white rounded-xl border border-slate-200">No se encontraron usuarios.</div>
                                )}
                        </div>
                    )}

                    {/* TAB: DOCTORS ABM */}
                    {activeTab === 'doctors' && (
                        <div className="max-w-5xl mx-auto flex flex-col gap-6 animate-fadeIn">
                            <div className="flex justify-between items-end">
                                <div>
                                    <h2 className="text-xl font-bold text-slate-900">Base de Médicos</h2>
                                    <p className="text-sm text-slate-500">Gestione los profesionales habilitados para solicitar cirugías.</p>
                                </div>
                                <div className="flex gap-3">
                                    <button
                                        onClick={() => setShowSpecialtiesModal(true)}
                                        className="bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 shadow-sm transition-colors"
                                    >
                                        <span className="material-symbols-outlined text-lg">school</span> Gestionar Especialidades
                                    </button>
                                    <button
                                        onClick={openNewDoctorModal}
                                        className="bg-primary hover:bg-primary-hover text-white px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 shadow-sm transition-colors"
                                    >
                                        <span className="material-symbols-outlined text-lg">add</span> Nuevo Médico
                                    </button>
                                </div>
                            </div>

                            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center gap-3">
                                <span className="material-symbols-outlined text-slate-400">search</span>
                                <input
                                    type="text"
                                    placeholder="Buscar por nombre, especialidad o email..."
                                    className="flex-1 bg-transparent border-none focus:ring-0 text-sm"
                                    value={searchDoctors}
                                    onChange={(e) => setSearchDoctors(e.target.value)}
                                />
                                {searchDoctors && (
                                    <button onClick={() => setSearchDoctors('')} className="text-slate-400 hover:text-slate-600">
                                        <span className="material-symbols-outlined text-sm">close</span>
                                    </button>
                                )}
                            </div>

                            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden overflow-x-auto">
                                <table className="w-full text-left">
                                    <thead className="bg-slate-100 text-slate-500 text-xs uppercase font-bold tracking-wider">
                                        <tr>
                                            <th className="px-6 py-4">Profesional</th>
                                            <th className="px-6 py-4">Especialidad</th>
                                            <th className="px-6 py-4">Email (ID Usuario)</th>
                                            <th className="px-6 py-4 text-center">Estado</th>
                                            <th className="px-6 py-4 text-right">Acciones</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {doctors
                                            .filter(doc =>
                                                doc.name.toLowerCase().includes(searchDoctors.toLowerCase()) ||
                                                doc.specialty.toLowerCase().includes(searchDoctors.toLowerCase()) ||
                                                doc.email.toLowerCase().includes(searchDoctors.toLowerCase())
                                            )
                                            .map(doc => (
                                                <tr key={doc.id} className="hover:bg-slate-50 transition-colors group">
                                                    <td className="px-6 py-4 font-medium text-slate-900">{doc.name}</td>
                                                    <td className="px-6 py-4 text-sm text-slate-600">{doc.specialty}</td>
                                                    <td className="px-6 py-4 text-sm text-slate-500 font-mono bg-slate-50 w-fit rounded">{doc.email}</td>
                                                    <td className="px-6 py-4 text-center">
                                                        <button
                                                            onClick={() => toggleDoctorStatus(doc.id, doc.active)}
                                                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${doc.active ? 'bg-emerald-500' : 'bg-slate-300'}`}
                                                        >
                                                            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${doc.active ? 'translate-x-6' : 'translate-x-1'}`} />
                                                        </button>
                                                    </td>
                                                    <td className="px-6 py-4 text-right">
                                                        <div className="flex justify-end gap-2">
                                                            <button
                                                                onClick={() => openEditDoctorModal(doc)}
                                                                className="text-slate-400 hover:text-blue-600 transition-colors"
                                                                title="Editar Médico"
                                                            >
                                                                <span className="material-symbols-outlined">edit</span>
                                                            </button>
                                                            <button
                                                                onClick={() => handleDeleteDoctor(doc.id)}
                                                                className="text-slate-400 hover:text-red-600 transition-colors"
                                                                title="Eliminar Médico"
                                                            >
                                                                <span className="material-symbols-outlined">delete</span>
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))}
                                    </tbody>
                                </table>
                                {doctors.filter(doc =>
                                    doc.name.toLowerCase().includes(searchDoctors.toLowerCase()) ||
                                    doc.specialty.toLowerCase().includes(searchDoctors.toLowerCase()) ||
                                    doc.email.toLowerCase().includes(searchDoctors.toLowerCase())
                                ).length === 0 && (
                                        <div className="px-6 py-12 text-center text-slate-400 italic">No se encontraron médicos.</div>
                                    )}
                            </div>
                        </div>
                    )}

                    {/* TAB: VENDORS ABM */}
                    {activeTab === 'vendors' && (
                        <div className="max-w-4xl mx-auto flex flex-col gap-6 animate-fadeIn">
                            <div className="flex justify-between items-end">
                                <div>
                                    <h2 className="text-xl font-bold text-slate-900">Proveedores de Ortopedia</h2>
                                    <p className="text-sm text-slate-500">Gestione las empresas habilitadas para suministrar implantes y equipos.</p>
                                </div>
                                <button
                                    onClick={openNewVendorModal}
                                    className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 shadow-sm transition-colors"
                                >
                                    <span className="material-symbols-outlined text-lg">add</span> Nuevo Proveedor
                                </button>
                            </div>

                            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden overflow-x-auto">
                                <table className="w-full text-left">
                                    <thead className="bg-slate-100 text-slate-500 text-xs uppercase font-bold tracking-wider">
                                        <tr>
                                            <th className="px-6 py-4">Nombre de la Empresa</th>
                                            <th className="px-6 py-4">ID Sistema</th>
                                            <th className="px-6 py-4 text-right">Acciones</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {vendors.map(vendor => (
                                            <tr key={vendor.id} className="hover:bg-slate-50 transition-colors group">
                                                <td className="px-6 py-4 font-medium text-slate-900 flex items-center gap-3">
                                                    <div className="size-8 rounded bg-purple-100 text-purple-700 flex items-center justify-center">
                                                        <span className="material-symbols-outlined text-lg">domain</span>
                                                    </div>
                                                    {vendor.name}
                                                </td>
                                                <td className="px-6 py-4 text-sm text-slate-500 font-mono">{vendor.id}</td>
                                                <td className="px-6 py-4 text-right">
                                                    <div className="flex justify-end gap-2">
                                                        <button
                                                            onClick={() => openEditVendorModal(vendor)}
                                                            className="text-slate-400 hover:text-primary transition-colors"
                                                            title="Editar"
                                                        >
                                                            <span className="material-symbols-outlined">edit</span>
                                                        </button>
                                                        <button
                                                            onClick={() => handleDeleteVendor(vendor.id)}
                                                            className="text-slate-400 hover:text-red-500 transition-colors"
                                                            title="Eliminar"
                                                        >
                                                            <span className="material-symbols-outlined">delete</span>
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {activeTab === 'coverages' && (
                        <div className="max-w-5xl mx-auto flex flex-col gap-6 animate-fadeIn">
                            <div className="flex justify-between items-end">
                                <div>
                                    <h2 className="text-xl font-bold text-slate-900">Gestión de Prestadores</h2>
                                    <p className="text-sm text-slate-500">Administre Obras Sociales, Prepagas y Aseguradoras de Riesgo (ART).</p>
                                </div>
                                <button
                                    onClick={openNewCoverageModal}
                                    className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 shadow-sm transition-colors"
                                >
                                    <span className="material-symbols-outlined text-lg">add</span> Añadir Prestador
                                </button>
                            </div>

                            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center gap-3">
                                <span className="material-symbols-outlined text-slate-400">search</span>
                                <input
                                    type="text"
                                    placeholder="Buscar por nombre de prestador..."
                                    className="flex-1 bg-transparent border-none focus:ring-0 text-sm"
                                    value={searchCoverage}
                                    onChange={(e) => setSearchCoverage(e.target.value)}
                                />
                            </div>

                            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden overflow-x-auto">
                                <table className="w-full text-left">
                                    <thead className="bg-slate-100 text-slate-500 text-xs uppercase font-bold tracking-wider">
                                        <tr>
                                            <th className="px-6 py-4">Nombre del Prestador</th>
                                            <th className="px-6 py-4">Tipo</th>
                                            <th className="px-6 py-4">Ortopedia Asociada</th>
                                            <th className="px-6 py-4 text-right">Acciones</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {coverages
                                            .filter(c => c.name.toLowerCase().includes(searchCoverage.toLowerCase()))
                                            .map(cov => (
                                                <tr key={cov.id} className="hover:bg-slate-50 transition-colors group">
                                                    <td className="px-6 py-4 font-medium text-slate-900 flex items-center gap-3">
                                                        {cov.name}
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        {cov.type === 'ART' ? (
                                                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-orange-100 text-orange-700 border border-orange-200">
                                                                ART
                                                            </span>
                                                        ) : (
                                                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-700 border border-blue-200">
                                                                OS / PREPAGA
                                                            </span>
                                                        )}
                                                    </td>
                                                    <td className="px-6 py-4 text-sm text-slate-600 italic">
                                                        {vendors.find(v => v.id === cov.vendor_id)?.name || 'Sin asociación'}
                                                    </td>
                                                    <td className="px-6 py-4 text-right">
                                                        <div className="flex justify-end gap-2 text-slate-400">
                                                            <button onClick={() => openEditCoverageModal(cov)} className="hover:text-blue-600 transition-colors">
                                                                <span className="material-symbols-outlined">edit</span>
                                                            </button>
                                                            <button onClick={() => handleDeleteCoverage(cov.id)} className="hover:text-red-500 transition-colors">
                                                                <span className="material-symbols-outlined">delete</span>
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))}
                                        {coverages.filter(c => c.name.toLowerCase().includes(searchCoverage.toLowerCase())).length === 0 && (
                                            <tr><td colSpan={4} className="px-6 py-8 text-center text-slate-400 italic text-sm">No se encontraron prestadores.</td></tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {/* TAB: ORs CONFIGURATION */}
                    {activeTab === 'ors' && (
                        <div className="max-w-5xl mx-auto flex flex-col gap-6 animate-fadeIn">
                            <div className="flex justify-between items-end">
                                <div>
                                    <h2 className="text-xl font-bold text-slate-900">Configuración de Quirófanos</h2>
                                    <p className="text-sm text-slate-500">Defina los espacios físicos disponibles para la asignación.</p>
                                </div>
                                <button
                                    onClick={() => {
                                        setNewORName('');
                                        setNewORID('');
                                        setIsEditingOR(false);
                                        setShowORModal(true);
                                    }}
                                    className="bg-slate-900 hover:bg-slate-800 text-white px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 shadow-sm transition-colors"
                                >
                                    <span className="material-symbols-outlined text-lg">add</span> Añadir Sala
                                </button>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                {ors.map(or => (
                                    <div key={or.id} className={`bg-white rounded-xl border p-6 shadow-sm transition-all relative ${or.active ? 'border-slate-200' : 'border-slate-200 opacity-60 bg-slate-50'}`}>
                                        <div className="flex justify-between items-start mb-4">
                                            <div className={`size-12 rounded-lg flex items-center justify-center text-2xl font-bold ${or.active ? 'bg-orange-50 text-orange-600' : 'bg-slate-200 text-slate-500'}`}>
                                                {or.id}
                                            </div>
                                            <button onClick={() => toggleOrStatus(or.id, !!or.active)} className={`text-xs font-bold px-2 py-1 rounded border ${or.active ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100' : 'bg-slate-200 text-slate-500 border-slate-300 hover:bg-slate-300 cursor-pointer'}`}>
                                                {or.active ? 'ACTIVO' : 'INACTIVO'}
                                            </button>
                                        </div>
                                        <h3 className="font-bold text-slate-900 text-lg mb-1">{or.name}</h3>
                                        <p className="text-xs text-slate-500">ID Ref: QX-{or.id.padStart(3, '0')}</p>

                                        <div className="mt-6 pt-4 border-t border-slate-100 flex gap-2">
                                            <button
                                                onClick={() => openEditORModal(or)}
                                                className="flex-1 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 rounded-lg border border-slate-200"
                                            >
                                                Editar
                                            </button>
                                            <button
                                                onClick={() => handleDeleteOR(or.id)}
                                                className="flex-1 py-2 text-sm font-medium text-red-600 hover:bg-red-50 rounded-lg border border-slate-200"
                                            >
                                                Eliminar
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* TAB: SURGERY TREE (REQUIREMENTS) */}
                    {activeTab === 'tree' && (
                        <div className="flex flex-col md:flex-row h-auto md:h-[calc(100vh-140px)] gap-6 animate-fadeIn">

                            {/* Left: Procedure List */}
                            <div className="w-full md:w-1/3 bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col overflow-hidden h-[400px] md:h-full">
                                <div className="p-4 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
                                    <h3 className="font-bold text-slate-700">Tipos de Cirugía</h3>
                                    <button
                                        onClick={() => setShowProcModal(true)}
                                        className="text-primary hover:bg-primary/10 p-1 rounded transition-colors"
                                    >
                                        <span className="material-symbols-outlined">add</span>
                                    </button>
                                </div>
                                <div className="overflow-y-auto flex-1 p-2 space-y-1">
                                    {procedures.map(proc => (
                                        <button
                                            key={proc.id}
                                            onClick={() => setSelectedProcedureId(proc.id)}
                                            className={`w-full text-left p-3 rounded-lg text-sm transition-all border ${selectedProcedureId === proc.id
                                                ? 'bg-purple-50 border-purple-200 ring-1 ring-purple-300'
                                                : 'bg-white border-transparent hover:bg-slate-50 hover:border-slate-200'
                                                }`}
                                        >
                                            <div className="font-bold text-slate-900">{proc.name}</div>
                                            <div className="text-xs text-slate-500 flex justify-between mt-1">
                                                <span>{proc.specialty}</span>
                                                <span>{proc.defaultDurationMin} min</span>
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Right: Template Details */}
                            <div className="flex-1 bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col overflow-hidden">
                                {selectedProcedure ? (
                                    <>
                                        <div className="p-6 border-b border-slate-200 bg-purple-50/30">
                                            <div className="flex justify-between items-start">
                                                <div>
                                                    <h2 className="text-xl font-bold text-slate-900">{selectedProcedure.name}</h2>
                                                    <p className="text-sm text-slate-500 mt-1">Configuración del Árbol de Requerimientos y Materiales Sugeridos.</p>
                                                </div>
                                                <div className="flex gap-2">
                                                    <button
                                                        onClick={handleOpenEditProcedure}
                                                        className="px-4 py-2 bg-white border border-slate-300 text-slate-700 rounded-lg text-sm font-bold shadow-sm hover:bg-slate-50"
                                                    >
                                                        Editar Detalles
                                                    </button>
                                                    <button
                                                        onClick={() => handleDeleteProcedure(selectedProcedure.id)}
                                                        className="px-4 py-2 bg-red-50 border border-red-200 text-red-600 rounded-lg text-sm font-bold shadow-sm hover:bg-red-100 transition-colors flex items-center gap-1"
                                                    >
                                                        <span className="material-symbols-outlined text-sm">delete</span>
                                                        Eliminar
                                                    </button>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="flex-1 overflow-y-auto p-6">
                                            <div className="flex justify-between items-center mb-4">
                                                <h3 className="font-bold text-slate-900 flex items-center gap-2">
                                                    <span className="material-symbols-outlined text-purple-600">inventory_2</span>
                                                    Materiales por Defecto
                                                </h3>
                                                <button
                                                    onClick={() => setShowMaterialModal(true)}
                                                    className="text-xs font-bold text-purple-700 hover:underline flex items-center gap-1"
                                                >
                                                    <span className="material-symbols-outlined text-sm">add_circle</span> Agregar Item
                                                </button>
                                            </div>

                                            <div className="border border-slate-200 rounded-lg overflow-hidden overflow-x-auto">
                                                <table className="w-full text-left text-sm">
                                                    <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200">
                                                        <tr>
                                                            <th className="px-4 py-3">Nombre del Material</th>
                                                            <th className="px-4 py-3">Categoría</th>
                                                            <th className="px-4 py-3 text-center">Cant. Sugerida</th>
                                                            <th className="px-4 py-3 w-10"></th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-slate-100">
                                                        {selectedProcedure.requiredMaterials.map(mat => (
                                                            <tr key={mat.id} className="group hover:bg-slate-50">
                                                                <td className="px-4 py-3 font-medium text-slate-900">{mat.name}</td>
                                                                <td className="px-4 py-3">
                                                                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border bg-slate-100 text-slate-600 border-slate-200`}>
                                                                        {mat.category}
                                                                    </span>
                                                                </td>
                                                                <td className="px-4 py-3 text-center font-mono">{mat.quantity}</td>
                                                                <td className="px-4 py-3 text-right">
                                                                    <button
                                                                        onClick={() => deleteMaterial(selectedProcedure.id, mat.id)}
                                                                        className="text-slate-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-all"
                                                                    >
                                                                        <span className="material-symbols-outlined text-lg">delete</span>
                                                                    </button>
                                                                </td>
                                                            </tr>
                                                        ))}
                                                        {selectedProcedure.requiredMaterials.length === 0 && (
                                                            <tr>
                                                                <td colSpan={4} className="px-4 py-8 text-center text-slate-400 italic">
                                                                    No hay materiales configurados para este procedimiento.
                                                                </td>
                                                            </tr>
                                                        )}
                                                    </tbody>
                                                </table>
                                            </div>

                                            <div className="mt-8 bg-amber-50 border border-amber-200 rounded-lg p-4">
                                                <h4 className="text-amber-800 font-bold text-sm mb-2 flex items-center gap-2">
                                                    <span className="material-symbols-outlined">warning</span>
                                                    Reglas de Negocio (Show_If Logic)
                                                </h4>
                                                <p className="text-xs text-amber-700 mb-2">
                                                    Configuración simulada de reglas de visualización:
                                                </p>
                                                <ul className="list-disc list-inside text-xs text-amber-800 space-y-1 ml-2">
                                                    <li>Si <strong>Tipo</strong> = "{selectedProcedure.name}", mostrar sección "Ortopedia".</li>
                                                    <li>Permitir edición de materiales solo si Rol = "Ortopedia" o "SuperAdmin".</li>
                                                </ul>
                                            </div>
                                        </div>
                                    </>
                                ) : (
                                    <div className="flex-1 flex flex-col items-center justify-center text-slate-400">
                                        <span className="material-symbols-outlined text-4xl mb-2 text-slate-300">account_tree</span>
                                        <p>Seleccione un procedimiento para configurar su árbol.</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* TAB: EMAIL CONFIGURATION */}
                    {activeTab === 'email_config' && (
                        <div className="max-w-4xl mx-auto space-y-6 animate-fadeIn">
                            <div className="flex justify-between items-end">
                                <div>
                                    <h2 className="text-xl font-bold text-slate-900">Configuración de Correo (SMTP)</h2>
                                    <p className="text-sm text-slate-500">Configure los datos de su servidor de correo para los envíos automáticos.</p>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
                                    <div className="flex items-center gap-2 text-slate-800 font-bold mb-2">
                                        <span className="material-symbols-outlined text-amber-600">settings_applications</span>
                                        Servidor y Conexión
                                    </div>
                                    
                                    <div>
                                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Servidor SMTP (Host)</label>
                                        <input
                                            type="text"
                                            className="w-full bg-slate-50 text-slate-900 rounded-lg border border-slate-200 px-3 py-2 text-sm focus:ring-2 focus:ring-amber-500 focus:bg-white transition-all"
                                            value={smtpSettings.host}
                                            onChange={e => setSmtpSettings({ ...smtpSettings, host: e.target.value })}
                                            placeholder="Ex: smtp.gmail.com"
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Puerto</label>
                                        <input
                                            type="text"
                                            className="w-full bg-slate-50 text-slate-900 rounded-lg border border-slate-200 px-3 py-2 text-sm focus:ring-2 focus:ring-amber-500 focus:bg-white transition-all"
                                            value={smtpSettings.port}
                                            onChange={e => setSmtpSettings({ ...smtpSettings, port: e.target.value })}
                                            placeholder="Ex: 587 o 465"
                                        />
                                    </div>
                                </div>

                                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
                                    <div className="flex items-center gap-2 text-slate-800 font-bold mb-2">
                                        <span className="material-symbols-outlined text-amber-600">lock_open</span>
                                        Autenticación
                                    </div>

                                    <div>
                                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Usuario / Email</label>
                                        <input
                                            type="text"
                                            className="w-full bg-slate-50 text-slate-900 rounded-lg border border-slate-200 px-3 py-2 text-sm focus:ring-2 focus:ring-amber-500 focus:bg-white transition-all"
                                            value={smtpSettings.user}
                                            onChange={e => setSmtpSettings({ ...smtpSettings, user: e.target.value })}
                                            placeholder="correo@empresa.com"
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Contraseña / Token</label>
                                        <input
                                            type="password"
                                            className="w-full bg-slate-50 text-slate-900 rounded-lg border border-slate-200 px-3 py-2 text-sm focus:ring-2 focus:ring-amber-500 focus:bg-white transition-all font-mono"
                                            value={smtpSettings.pass}
                                            onChange={e => setSmtpSettings({ ...smtpSettings, pass: e.target.value })}
                                            placeholder="••••••••••••"
                                        />
                                    </div>
                                </div>

                                <div className="md:col-span-2 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
                                    <div className="flex items-center gap-2 text-slate-800 font-bold mb-2">
                                        <span className="material-symbols-outlined text-amber-600">alternate_email</span>
                                        Información del Remitente
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Nombre a mostrar</label>
                                            <input
                                                type="text"
                                                className="w-full bg-slate-50 text-slate-900 rounded-lg border border-slate-200 px-3 py-2 text-sm focus:ring-2 focus:ring-amber-500 focus:bg-white transition-all"
                                                value={smtpSettings.fromName}
                                                onChange={e => setSmtpSettings({ ...smtpSettings, fromName: e.target.value })}
                                                placeholder="Ej: Panel de Cirugías"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Email del remitente (opcional)</label>
                                            <input
                                                type="text"
                                                className="w-full bg-slate-50 text-slate-900 rounded-lg border border-slate-200 px-3 py-2 text-sm focus:ring-2 focus:ring-amber-500 focus:bg-white transition-all"
                                                value={smtpSettings.fromEmail}
                                                onChange={e => setSmtpSettings({ ...smtpSettings, fromEmail: e.target.value })}
                                                placeholder="Dejar vacío para usar Usuario"
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="flex justify-end pt-4">
                                <button
                                    onClick={handleSaveSmtp}
                                    disabled={isSavingSmtp || !smtpSettings.host || !smtpSettings.user}
                                    className="bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white px-8 py-3 rounded-xl font-bold flex items-center gap-2 shadow-lg hover:shadow-xl transition-all active:scale-95"
                                >
                                    {isSavingSmtp ? (
                                        <>
                                            <span className="material-symbols-outlined animate-spin shadow-none">refresh</span>
                                            Guardando...
                                        </>
                                    ) : (
                                        <>
                                            <span className="material-symbols-outlined text-lg shadow-none">save</span>
                                            Guardar Configuración
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>
                    )}

                    {/* TAB: VADEMECUM MANAGEMENT */}
                    {activeTab === 'vademecum' && (
                        <div className="max-w-6xl mx-auto flex flex-col gap-6 animate-fadeIn pb-20 text-slate-900">
                            <div className="flex justify-between items-end">
                                <div>
                                    <h2 className="text-xl font-bold flex items-center gap-2">
                                        Vademécum de Cirugía
                                        <span className="text-sm font-normal text-slate-500 bg-slate-200 px-2 py-0.5 rounded-full">
                                            {isLoadingCatalog ? 'Cargando...' : `${catalogItems.length} ítems`}
                                        </span>
                                    </h2>
                                    <p className="text-sm text-slate-500">Gestione el catálogo de medicamentos e insumos disponibles para las fichas técnicas.</p>
                                </div>
                                <div className="flex gap-2">
                                    <button
                                        onClick={fetchCatalogItems}
                                        className="text-slate-500 hover:text-indigo-600 px-3 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition-colors border border-slate-200 hover:border-indigo-200 hover:bg-indigo-50"
                                        title="Refrescar lista"
                                    >
                                        <span className={`material-symbols-outlined text-lg ${isLoadingCatalog ? 'animate-spin' : ''}`}>sync</span>
                                    </button>
                                    <button
                                        onClick={() => {
                                            setCatalogForm({ name: '', code: '', category: 'surgery', active: true });
                                            setIsEditingCatalog(false);
                                            setShowCatalogModal(true);
                                        }}
                                        className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 shadow-sm transition-colors"
                                    >
                                        <span className="material-symbols-outlined text-lg">add</span> Nuevo Ítem
                                    </button>
                                </div>
                            </div>

                            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                                <div className="p-4 border-b border-slate-100 bg-slate-50 flex gap-4">
                                    <div className="relative flex-1">
                                        <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">search</span>
                                        <input
                                            type="text"
                                            placeholder="Buscar por nombre o código..."
                                            className="w-full pl-10 pr-4 py-2 rounded-lg border border-slate-200 text-sm focus:ring-2 focus:ring-indigo-500 bg-white"
                                            value={searchCatalog}
                                            onChange={e => setSearchCatalog(e.target.value)}
                                        />
                                        {searchCatalog && (
                                            <button
                                                onClick={() => setSearchCatalog('')}
                                                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                                            >
                                                <span className="material-symbols-outlined text-lg">close</span>
                                            </button>
                                        )}
                                    </div>
                                </div>

                                <table className="w-full text-left">
                                    <thead className="bg-slate-100 text-slate-500 text-[10px] uppercase font-bold tracking-wider border-b border-slate-200">
                                        <tr className="divide-x divide-slate-200">
                                            <th
                                                className="px-6 py-3 cursor-pointer hover:bg-slate-200 transition-colors group"
                                                onClick={() => setSortCatalog(prev => ({ column: 'name', direction: prev.column === 'name' && prev.direction === 'asc' ? 'desc' : 'asc' }))}
                                            >
                                                <div className="flex items-center gap-2">
                                                    Ítem
                                                    <span className={`material-symbols-outlined text-sm ${sortCatalog.column === 'name' ? 'text-indigo-600' : 'text-slate-300 opacity-0 group-hover:opacity-100'}`}>
                                                        {sortCatalog.column === 'name' && sortCatalog.direction === 'desc' ? 'arrow_downward' : 'arrow_upward'}
                                                    </span>
                                                </div>
                                            </th>
                                            <th
                                                className="px-6 py-3 cursor-pointer hover:bg-slate-200 transition-colors group"
                                                onClick={() => setSortCatalog(prev => ({ column: 'code', direction: prev.column === 'code' && prev.direction === 'asc' ? 'desc' : 'asc' }))}
                                            >
                                                <div className="flex items-center gap-2">
                                                    Código
                                                    <span className={`material-symbols-outlined text-sm ${sortCatalog.column === 'code' ? 'text-indigo-600' : 'text-slate-300 opacity-0 group-hover:opacity-100'}`}>
                                                        {sortCatalog.column === 'code' && sortCatalog.direction === 'desc' ? 'arrow_downward' : 'arrow_upward'}
                                                    </span>
                                                </div>
                                            </th>
                                            <th
                                                className="px-6 py-3 text-center cursor-pointer hover:bg-slate-200 transition-colors group"
                                                onClick={() => setSortCatalog(prev => ({ column: 'category', direction: prev.column === 'category' && prev.direction === 'asc' ? 'desc' : 'asc' }))}
                                            >
                                                <div className="flex items-center justify-center gap-2">
                                                    Categoría
                                                    <span className={`material-symbols-outlined text-sm ${sortCatalog.column === 'category' ? 'text-indigo-600' : 'text-slate-300 opacity-0 group-hover:opacity-100'}`}>
                                                        {sortCatalog.column === 'category' && sortCatalog.direction === 'desc' ? 'arrow_downward' : 'arrow_upward'}
                                                    </span>
                                                </div>
                                            </th>
                                            <th
                                                className="px-6 py-3 text-center cursor-pointer hover:bg-slate-200 transition-colors group"
                                                onClick={() => setSortCatalog(prev => ({ column: 'active', direction: prev.column === 'active' && prev.direction === 'asc' ? 'desc' : 'asc' }))}
                                            >
                                                <div className="flex items-center justify-center gap-2">
                                                    Estado
                                                    <span className={`material-symbols-outlined text-sm ${sortCatalog.column === 'active' ? 'text-indigo-600' : 'text-slate-300 opacity-0 group-hover:opacity-100'}`}>
                                                        {sortCatalog.column === 'active' && sortCatalog.direction === 'desc' ? 'arrow_downward' : 'arrow_upward'}
                                                    </span>
                                                </div>
                                            </th>
                                            <th className="px-6 py-3 text-right">Acciones</th>
                                        </tr>
                                        {/* Filters Row */}
                                        <tr className="bg-white divide-x divide-slate-100 border-b border-slate-100">
                                            <td className="px-4 py-2">
                                                <div className="relative">
                                                    <input
                                                        type="text"
                                                        placeholder="Filtrar..."
                                                        className="w-full pl-2 pr-2 py-1 text-[11px] rounded border border-slate-200 focus:ring-1 focus:ring-indigo-500 bg-slate-50/50"
                                                        value={catalogFilters.name}
                                                        onChange={e => setCatalogFilters({ ...catalogFilters, name: e.target.value })}
                                                    />
                                                </div>
                                            </td>
                                            <td className="px-4 py-2">
                                                <input
                                                    type="text"
                                                    placeholder="Filtrar..."
                                                    className="w-full px-2 py-1 text-[11px] rounded border border-slate-200 focus:ring-1 focus:ring-indigo-500 bg-slate-50/50"
                                                    value={catalogFilters.code}
                                                    onChange={e => setCatalogFilters({ ...catalogFilters, code: e.target.value })}
                                                />
                                            </td>
                                            <td className="px-4 py-2">
                                                <select
                                                    className="w-full px-2 py-1 text-[11px] rounded border border-slate-200 focus:ring-1 focus:ring-indigo-500 bg-slate-50/50 cursor-pointer"
                                                    value={catalogFilters.category}
                                                    onChange={e => setCatalogFilters({ ...catalogFilters, category: e.target.value })}
                                                >
                                                    <option value="">Todas</option>
                                                    <option value="surgery">Cirugía</option>
                                                    <option value="anesthesia">Anestesia</option>
                                                </select>
                                            </td>
                                            <td className="px-4 py-2 text-center">
                                                <div className="text-[11px] text-slate-400 italic">Auto</div>
                                            </td>
                                            <td className="px-4 py-2 text-right">
                                                <button
                                                    onClick={() => setCatalogFilters({ name: '', code: '', category: '' })}
                                                    className="text-[10px] text-indigo-500 hover:text-indigo-700 font-bold transition-colors"
                                                    title="Limpiar filtros"
                                                >
                                                    LIMPIAR
                                                </button>
                                            </td>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 font-medium">
                                        {isLoadingCatalog ? (
                                            <tr>
                                                <td colSpan={4} className="px-6 py-12 text-center text-slate-400">
                                                    <div className="flex flex-col items-center gap-2">
                                                        <span className="material-symbols-outlined animate-spin text-3xl text-indigo-500">progress_activity</span>
                                                        <span className="text-sm">Cargando catálogo...</span>
                                                    </div>
                                                </td>
                                            </tr>
                                        ) : (
                                            <>
                                                {(() => {
                                                    let filtered = catalogItems.filter(item => {
                                                        // Global search
                                                        const globalMatch = !searchCatalog ||
                                                            item.name.toLowerCase().includes(searchCatalog.toLowerCase()) ||
                                                            (item.code && item.code.toLowerCase().includes(searchCatalog.toLowerCase()));

                                                        // Column filters
                                                        const nameMatch = !catalogFilters.name ||
                                                            item.name.toLowerCase().includes(catalogFilters.name.toLowerCase());
                                                        const codeMatch = !catalogFilters.code ||
                                                            (item.code && item.code.toLowerCase().includes(catalogFilters.code.toLowerCase()));
                                                        const categoryMatch = !catalogFilters.category ||
                                                            item.category === catalogFilters.category;

                                                        return globalMatch && nameMatch && codeMatch && categoryMatch;
                                                    });

                                                    // Sorting
                                                    filtered.sort((a, b) => {
                                                        let valA = a[sortCatalog.column] || '';
                                                        let valB = b[sortCatalog.column] || '';

                                                        if (typeof valA === 'string') valA = valA.toLowerCase();
                                                        if (typeof valB === 'string') valB = valB.toLowerCase();

                                                        if (valA < valB) return sortCatalog.direction === 'asc' ? -1 : 1;
                                                        if (valA > valB) return sortCatalog.direction === 'asc' ? 1 : -1;
                                                        return 0;
                                                    });

                                                    return filtered.map(item => (
                                                        <tr key={item.id} className="hover:bg-slate-50 transition-colors group">
                                                            <td className="px-6 py-4 font-bold text-slate-900">{item.name}</td>
                                                            <td className="px-6 py-4 text-slate-500 font-mono text-sm">{item.code || '-'}</td>
                                                            <td className="px-6 py-4 text-center">
                                                                <span className={`inline-flex px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase border ${item.category === 'anesthesia'
                                                                    ? 'bg-blue-50 text-blue-700 border-blue-100'
                                                                    : 'bg-emerald-50 text-emerald-700 border-emerald-100'
                                                                    }`}>
                                                                    {item.category === 'anesthesia' ? 'Anestesia' : 'Cirugía'}
                                                                </span>
                                                            </td>
                                                            <td className="px-6 py-4 text-center">
                                                                <span className={`inline-flex items-center gap-1.5 text-[10px] font-black uppercase ${item.active ? 'text-emerald-700' : 'text-slate-400'}`}>
                                                                    <div className={`size-2 rounded-full ${item.active ? 'bg-emerald-500 shadow-sm shadow-emerald-500/50' : 'bg-slate-300'}`} />
                                                                    {item.active ? 'Activo' : 'Inactivo'}
                                                                </span>
                                                            </td>
                                                            <td className="px-6 py-4 text-right">
                                                                <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                                    <button
                                                                        onClick={() => {
                                                                            setCatalogForm({
                                                                                id: item.id,
                                                                                name: item.name,
                                                                                code: item.code || '',
                                                                                category: item.category,
                                                                                active: item.active
                                                                            });
                                                                            setIsEditingCatalog(true);
                                                                            setShowCatalogModal(true);
                                                                        }}
                                                                        className="text-slate-400 hover:text-indigo-600 transition-colors"
                                                                    >
                                                                        <span className="material-symbols-outlined text-lg font-bold">edit</span>
                                                                    </button>
                                                                    <button
                                                                        onClick={() => handleDeleteCatalogItem(item.id)}
                                                                        className="text-slate-400 hover:text-red-600 transition-colors"
                                                                    >
                                                                        <span className="material-symbols-outlined text-lg font-bold">delete</span>
                                                                    </button>
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    ));
                                                })()}
                                                {catalogItems.length > 0 && (() => {
                                                    const filteredLength = catalogItems.filter(item => {
                                                        const globalMatch = !searchCatalog ||
                                                            item.name.toLowerCase().includes(searchCatalog.toLowerCase()) ||
                                                            (item.code && item.code.toLowerCase().includes(searchCatalog.toLowerCase()));
                                                        const nameMatch = !catalogFilters.name ||
                                                            item.name.toLowerCase().includes(catalogFilters.name.toLowerCase());
                                                        const codeMatch = !catalogFilters.code ||
                                                            (item.code && item.code.toLowerCase().includes(catalogFilters.code.toLowerCase()));
                                                        const categoryMatch = !catalogFilters.category ||
                                                            item.category === catalogFilters.category;
                                                        return globalMatch && nameMatch && codeMatch && categoryMatch;
                                                    }).length;
                                                    return filteredLength === 0;
                                                })() && (
                                                        <tr>
                                                            <td colSpan={4} className="px-6 py-12 text-center text-slate-400 italic font-normal">
                                                                No se encontraron items que coincidan con la búsqueda.
                                                            </td>
                                                        </tr>
                                                    )}
                                                {catalogItems.length === 0 && (
                                                    <tr>
                                                        <td colSpan={4} className="px-6 py-12 text-center text-slate-400 italic font-normal">
                                                            El catálogo está vacío. Utilice el botón "Nuevo Ítem" para agregar elementos manuales o verifique la conexión.
                                                        </td>
                                                    </tr>
                                                )}
                                            </>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {activeTab === 'medications' && (
                        <div className="max-w-6xl mx-auto flex flex-col gap-6 animate-fadeIn pb-20 text-slate-900">
                            <div className="flex justify-between items-end">
                                <div>
                                    <h2 className="text-xl font-bold flex items-center gap-2 text-slate-900">
                                        Catálogo de Medicamentos (Enfermería)
                                        <span className="text-sm font-normal text-slate-500 bg-emerald-100 px-2 py-0.5 rounded-full">
                                            {isLoadingCatalog ? 'Cargando...' : `${catalogItems.filter(i => i.category === 'medication').length} ítems`}
                                        </span>
                                    </h2>
                                    <p className="text-sm text-slate-500">Gestione la lista de medicamentos que las enfermeras pueden suministrar en piso.</p>
                                </div>
                                <div className="flex gap-2">
                                    <button
                                        onClick={fetchCatalogItems}
                                        className="text-slate-500 hover:text-emerald-600 px-3 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition-colors border border-slate-200 hover:border-emerald-200 hover:bg-emerald-50"
                                        title="Refrescar lista"
                                    >
                                        <span className={`material-symbols-outlined text-lg ${isLoadingCatalog ? 'animate-spin' : ''}`}>sync</span>
                                    </button>
                                    <button
                                        onClick={() => {
                                            setCatalogForm({ name: '', code: '', category: 'medication', active: true, default_unit: 'mg' });
                                            setIsEditingCatalog(false);
                                            setShowCatalogModal(true);
                                        }}
                                        className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 shadow-sm transition-colors"
                                    >
                                        <span className="material-symbols-outlined text-lg">add</span> Nuevo Medicamento
                                    </button>
                                </div>
                            </div>

                            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                                <div className="p-4 border-b border-slate-100 bg-slate-50 flex gap-4">
                                    <div className="relative flex-1">
                                        <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">search</span>
                                        <input
                                            type="text"
                                            placeholder="Buscar medicamento o código..."
                                            className="w-full pl-10 pr-4 py-2 rounded-lg border border-slate-200 text-sm focus:ring-2 focus:ring-emerald-500 bg-white"
                                            value={searchCatalog}
                                            onChange={e => setSearchCatalog(e.target.value)}
                                        />
                                    </div>
                                </div>

                                <table className="w-full text-left">
                                    <thead className="bg-slate-100 text-slate-500 text-[10px] uppercase font-bold tracking-wider border-b border-slate-200">
                                        <tr>
                                            <th className="px-6 py-3">Medicamento</th>
                                            <th className="px-6 py-3">Código</th>
                                            <th className="px-6 py-3 text-center">Unidad x Defecto</th>
                                            <th className="px-6 py-3 text-center">Estado</th>
                                            <th className="px-6 py-3 text-right">Acciones</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 font-medium">
                                        {isLoadingCatalog ? (
                                            <tr>
                                                <td colSpan={5} className="px-6 py-12 text-center text-slate-400">
                                                    <div className="flex flex-col items-center gap-2">
                                                        <span className="material-symbols-outlined animate-spin text-3xl text-emerald-500">progress_activity</span>
                                                        <span className="text-sm">Cargando medicamentos...</span>
                                                    </div>
                                                </td>
                                            </tr>
                                        ) : (
                                            <>
                                                {catalogItems
                                                    .filter(item => item.category === 'medication' && (
                                                        !searchCatalog || 
                                                        item.name.toLowerCase().includes(searchCatalog.toLowerCase()) ||
                                                        (item.code && item.code.toLowerCase().includes(searchCatalog.toLowerCase()))
                                                    ))
                                                    .sort((a, b) => a.name.localeCompare(b.name))
                                                    .map(item => (
                                                        <tr key={item.id} className="hover:bg-slate-50 transition-colors group">
                                                            <td className="px-6 py-4 font-bold text-slate-900">{item.name}</td>
                                                            <td className="px-6 py-4 text-slate-500 font-mono text-sm">{item.code || '-'}</td>
                                                            <td className="px-6 py-4 text-center">
                                                                <span className="bg-slate-100 text-slate-600 px-2 py-1 rounded text-xs font-mono">
                                                                    {item.default_unit || 'n/a'}
                                                                </span>
                                                            </td>
                                                            <td className="px-6 py-4 text-center">
                                                                <span className={`inline-flex items-center gap-1.5 text-[10px] font-black uppercase ${item.active ? 'text-emerald-700' : 'text-slate-400'}`}>
                                                                    <div className={`size-2 rounded-full ${item.active ? 'bg-emerald-500 shadow-sm shadow-emerald-500/50' : 'bg-slate-300'}`} />
                                                                    {item.active ? 'Activo' : 'Inactivo'}
                                                                </span>
                                                            </td>
                                                            <td className="px-6 py-4 text-right">
                                                                <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                                    <button
                                                                        onClick={() => {
                                                                            setCatalogForm({ ...item, default_unit: item.default_unit || '' });
                                                                            setIsEditingCatalog(true);
                                                                            setShowCatalogModal(true);
                                                                        }}
                                                                        className="text-slate-400 hover:text-emerald-600 transition-colors"
                                                                    >
                                                                        <span className="material-symbols-outlined text-lg font-bold">edit</span>
                                                                    </button>
                                                                    <button
                                                                        onClick={() => handleDeleteCatalogItem(item.id)}
                                                                        className="text-slate-400 hover:text-red-600 transition-colors"
                                                                    >
                                                                        <span className="material-symbols-outlined text-lg font-bold">delete</span>
                                                                    </button>
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    ))
                                                }
                                                {catalogItems.filter(item => item.category === 'medication').length === 0 && (
                                                    <tr>
                                                        <td colSpan={5} className="px-6 py-12 text-center text-slate-400 italic font-normal">
                                                            No hay medicamentos registrados.
                                                        </td>
                                                    </tr>
                                                )}
                                            </>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {/* Forms Tab Content */}
                    {activeTab === 'forms' && (
                        <motion.div
                            variants={containerVariants}
                            initial="hidden"
                            animate="visible"
                            className="p-4 md:p-8 space-y-6"
                        >
                            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                                <div className="p-6 border-b border-slate-100 bg-slate-50/50">
                                    <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                                        <span className="material-symbols-outlined text-emerald-500">description</span>
                                        Gestión de Formularios
                                    </h3>
                                    <p className="text-sm text-slate-500 mt-1">Accede a versiones digitales y para impresión de los documentos oficiales.</p>
                                </div>
                                <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div className="border border-slate-200 rounded-xl p-6 bg-white hover:border-emerald-200 hover:shadow-md transition-all group">
                                        <div className="size-12 rounded-lg bg-emerald-50 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                                            <span className="material-symbols-outlined text-emerald-600">article</span>
                                        </div>
                                        <h4 className="font-bold text-slate-900 mb-2">Ficha Quirúrgica (Vacía)</h4>
                                        <p className="text-sm text-slate-500 mb-4">Genera una ficha oficial en blanco con los campos estructurados para llenado manual en quirófano. Ideal para contingencias o registros físicos.</p>

                                        <div className="flex items-center gap-4 mb-6 bg-slate-50 p-3 rounded-lg border border-slate-100">
                                            <div className="flex-1">
                                                <p className="text-xs font-bold text-slate-700 uppercase">Cantidad de hojas de insumos</p>
                                                <p className="text-[10px] text-slate-400 font-medium">Define cuántas carillas de registro quieres imprimir.</p>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <button
                                                    onClick={() => setMaterialPagesCount(Math.max(1, materialPagesCount - 1))}
                                                    className="size-8 rounded-lg border border-slate-200 bg-white flex items-center justify-center hover:bg-slate-50 transition-colors text-slate-600"
                                                >
                                                    <span className="material-symbols-outlined text-sm font-black">remove</span>
                                                </button>
                                                <span className="w-8 text-center font-black text-slate-900 border-x border-slate-200">{materialPagesCount}</span>
                                                <button
                                                    onClick={() => setMaterialPagesCount(Math.min(5, materialPagesCount + 1))}
                                                    className="size-8 rounded-lg border border-slate-200 bg-white flex items-center justify-center hover:bg-slate-50 transition-colors text-slate-600"
                                                >
                                                    <span className="material-symbols-outlined text-sm font-black">add</span>
                                                </button>
                                            </div>
                                        </div>

                                        <button
                                            onClick={() => {
                                                setIsPrintingBlank(true);
                                                // Give more time for the portal to render and the print CSS to apply
                                                setTimeout(() => {
                                                    window.print();
                                                    // Give a small extra buffer before removing the print content
                                                    setTimeout(() => setIsPrintingBlank(false), 500);
                                                }, 1500);
                                            }}

                                            className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 px-4 rounded-xl transition-all shadow-lg shadow-emerald-200"
                                        >
                                            <span className="material-symbols-outlined text-xl">print</span>
                                            Imprimir {materialPagesCount > 1 ? `${materialPagesCount} Hojas` : 'Formulario'}
                                        </button>
                                    </div>


                                    {/* Placeholder for future documents */}
                                    <div className="border border-dashed border-slate-300 rounded-xl p-6 flex flex-col items-center justify-center text-center bg-slate-50/30">
                                        <span className="material-symbols-outlined text-slate-300 text-4xl mb-4">add_circle</span>
                                        <p className="text-sm font-medium text-slate-400 italic">Próximamente:<br />Protocolos y Consentimientos Informados</p>
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    )}
                </main>
            </div>

            {/* Portal for Blank Form Print */}
            {isPrintingBlank && createPortal(
                <div className="absolute top-0 left-0 w-full z-[9999] bg-white print:relative print:z-auto">
                    <BlankSurgeryFormPrint materialPagesCount={materialPagesCount} />
                </div>,
                document.body
            )}



            {/* USER MODAL */}
            {
                showUserModal && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4 animate-fadeIn">
                        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[95vh] md:max-h-[90vh]">
                            <div className="p-4 md:p-6 border-b border-slate-200 flex justify-between items-center bg-slate-50 rounded-t-2xl">
                                <h3 className="text-lg font-bold text-slate-900">
                                    {isEditingUser ? 'Editar Usuario' : 'Crear Nuevo Usuario'}
                                </h3>
                                <button onClick={() => setShowUserModal(false)} className="text-slate-400 hover:text-slate-600 p-1">
                                    <span className="material-symbols-outlined">close</span>
                                </button>
                            </div>
                            <div className="p-4 md:p-6 space-y-4 overflow-y-auto flex-1 custom-scrollbar">
                                <div>
                                    <label className="block text-xs font-bold text-slate-700 uppercase mb-1.5">Nombre Completo</label>
                                    <input
                                        className="w-full bg-white text-slate-900 rounded-lg border border-slate-300 focus:ring-amber-500 focus:border-amber-500 px-3 py-2 text-sm placeholder-slate-400"
                                        type="text"
                                        value={newUser.name || ''}
                                        onChange={e => setNewUser({ ...newUser, name: e.target.value })}
                                        placeholder="Ej: Juan Perez"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-700 uppercase mb-1.5">Correo Electrónico</label>
                                    <input
                                        className="w-full bg-white text-slate-900 rounded-lg border border-slate-300 focus:ring-amber-500 focus:border-amber-500 px-3 py-2 text-sm placeholder-slate-400"
                                        type="email"
                                        value={newUser.email || ''}
                                        onChange={e => setNewUser({ ...newUser, email: e.target.value })}
                                        placeholder="usuario@hospital.med"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-700 uppercase mb-1.5">Contraseña</label>
                                    <input
                                        className="w-full bg-white text-slate-900 rounded-lg border border-slate-300 focus:ring-amber-500 focus:border-amber-500 px-3 py-2 text-sm placeholder-slate-400"
                                        type="password"
                                        value={newUser.password || ''}
                                        onChange={e => setNewUser({ ...newUser, password: e.target.value })}
                                        placeholder="Ingrese contraseña..."
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-700 uppercase mb-1.5 flex justify-between">
                                        <span>ID Chat Telegram</span>
                                        <span className="text-slate-400 font-normal normal-case text-[10px]">Opcional</span>
                                    </label>
                                    <input
                                        className="w-full bg-white text-slate-900 rounded-lg border border-slate-300 focus:ring-amber-500 focus:border-amber-500 px-3 py-2 text-sm placeholder-slate-400 font-mono"
                                        type="text"
                                        value={newUser.telegramChatId || ''}
                                        onChange={e => setNewUser({ ...newUser, telegramChatId: e.target.value })}
                                        placeholder="Ej: 123456789"
                                    />
                                    <p className="text-[10px] text-slate-500 mt-1">
                                        Inicia el bot <strong className="text-slate-700">@quirofano_alerts_bot</strong> para obtener tu ID.
                                    </p>
                                </div>

                                {/* Granular Notification Preferences */}
                                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
                                    <p className="text-xs font-bold text-slate-700 uppercase flex items-center gap-2">
                                        <span className="material-symbols-outlined text-sm text-indigo-600">notifications_active</span>
                                        Preferencias de Alerta (Telegram)
                                    </p>
                                    <div className="space-y-2">
                                        <label className="flex items-center gap-3 cursor-pointer group">
                                            <input
                                                type="checkbox"
                                                className="size-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                                                checked={newUser.notificationPreferences?.delays}
                                                onChange={e => setNewUser({
                                                    ...newUser,
                                                    notificationPreferences: { ...newUser.notificationPreferences, delays: e.target.checked }
                                                } as any)}
                                            />
                                            <div className="flex flex-col">
                                                <span className="text-sm font-medium text-slate-700 group-hover:text-indigo-600 transition-colors">Demoras y Reprogramaciones</span>
                                                <span className="text-[10px] text-slate-500">Avisos automáticos cuando una cirugía anterior se atrasa.</span>
                                            </div>
                                        </label>
                                        <label className="flex items-center gap-3 cursor-pointer group">
                                            <input
                                                type="checkbox"
                                                className="size-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                                                checked={newUser.notificationPreferences?.daily_summary}
                                                onChange={e => setNewUser({
                                                    ...newUser,
                                                    notificationPreferences: { ...newUser.notificationPreferences, daily_summary: e.target.checked }
                                                } as any)}
                                            />
                                            <div className="flex flex-col">
                                                <span className="text-sm font-medium text-slate-700 group-hover:text-indigo-600 transition-colors">Resumen Diario y Validaciones</span>
                                                <span className="text-[10px] text-slate-500">Reportes matutinos y alertas de prótesis/documentación.</span>
                                            </div>
                                        </label>
                                        <label className="flex items-center gap-3 cursor-pointer group">
                                            <input
                                                type="checkbox"
                                                className="size-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                                                checked={newUser.notificationPreferences?.status_changes}
                                                onChange={e => setNewUser({
                                                    ...newUser,
                                                    notificationPreferences: { ...newUser.notificationPreferences, status_changes: e.target.checked }
                                                } as any)}
                                            />
                                            <div className="flex flex-col">
                                                <span className="text-sm font-medium text-slate-700 group-hover:text-indigo-600 transition-colors">Cambios de Estado y Enfermería</span>
                                                <span className="text-[10px] text-slate-500">Notificaciones sobre ingresos a piso y altas.</span>
                                            </div>
                                        </label>
                                    </div>
                                </div>
                                {/* Ficha de Cirugía Permission */}
                                <div className="bg-amber-50 p-4 rounded-xl border border-amber-200">
                                    <label className="flex items-center gap-3 cursor-pointer group">
                                        <input
                                            type="checkbox"
                                            className="size-4 rounded border-amber-300 text-amber-600 focus:ring-amber-500 cursor-pointer"
                                            checked={newUser.canFillForms}
                                            onChange={e => setNewUser({ ...newUser, canFillForms: e.target.checked })}
                                        />
                                        <div className="flex flex-col">
                                            <span className="text-sm font-bold text-amber-900 group-hover:text-amber-700 transition-colors uppercase tracking-tight">Habilitar Ficha de Cirugía</span>
                                            <span className="text-[10px] text-amber-700">Permite a este usuario completar formularios técnicos desde el Monitor.</span>
                                        </div>
                                    </label>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-700 uppercase mb-1.5">Rol de Sistema</label>
                                    <select
                                        className="w-full bg-white text-slate-900 rounded-lg border border-slate-300 focus:ring-amber-500 focus:border-amber-500 px-3 py-2 text-sm"
                                        value={newUser.role}
                                        onChange={e => {
                                            setNewUser({
                                                ...newUser,
                                                role: e.target.value as UserRole,
                                                vendorId: undefined
                                            });
                                            // Reset specialty if changing away from Medico
                                            if (e.target.value !== 'Medico') setNewUserSpecialty('');
                                        }}
                                    >
                                        <option value="Medico">Médico</option>
                                        <option value="Residente">Residente</option>
                                        <option value="Tecnico">Técnico</option>
                                        <option value="Administrativo">Administrativo</option>
                                        <option value="Administrativo de Guardias">Administrativo de Guardias</option>
                                        <option value="Internacion">Enfermería</option>
                                        <option value="Oficina ART">Oficina ART</option>
                                        <option value="Ortopedia">Proveedor Ortopedia</option>
                                        <option value="Direccion">Dirección</option>
                                        <option value="SuperAdmin">SuperAdmin</option>
                                    </select>
                                </div>

                                {/* Conditional Vendor Select */}
                                {newUser.role === 'Ortopedia' && (
                                    <div className="bg-purple-50 p-4 rounded-lg border border-purple-100 animate-fadeIn">
                                        <label className="block text-xs font-bold text-purple-700 uppercase mb-1.5 flex items-center gap-1">
                                            <span className="material-symbols-outlined text-sm">domain</span>
                                            Empresa Proveedora <span className="text-red-500">*</span>
                                        </label>
                                        <select
                                            className="w-full bg-white text-slate-900 rounded-lg border-purple-300 focus:ring-purple-500 focus:border-purple-500 px-3 py-2 text-sm"
                                            value={newUser.vendorId || ''}
                                            onChange={e => setNewUser({ ...newUser, vendorId: e.target.value })}
                                        >
                                            <option value="">Seleccionar Empresa...</option>
                                            {vendors.map(v => (
                                                <option key={v.id} value={v.id}>{v.name}</option>
                                            ))}
                                        </select>
                                        <p className="text-[10px] text-purple-600 mt-2 leading-tight">
                                            * Este usuario solo podrá ver y editar cirugías asignadas a esta empresa.
                                        </p>
                                    </div>
                                )}

                                {/* Conditional Specialty Select (New for Medico) */}
                                {newUser.role === 'Medico' && (
                                    <div className="bg-blue-50 p-4 rounded-lg border border-blue-100 animate-fadeIn">
                                        <label className="block text-xs font-bold text-blue-700 uppercase mb-1.5 flex items-center gap-1">
                                            <span className="material-symbols-outlined text-sm">medical_services</span>
                                            Especialidad Médica <span className="text-red-500">*</span>
                                        </label>
                                        <select
                                            className="w-full bg-white text-slate-900 rounded-lg border-blue-300 focus:ring-blue-500 focus:border-blue-500 px-3 py-2 text-sm"
                                            value={newUserSpecialty}
                                            onChange={e => setNewUserSpecialty(e.target.value)}
                                        >
                                            <option value="">Seleccionar Especialidad...</option>
                                            {specialties.map(spec => (
                                                <option key={spec} value={spec}>{spec}</option>
                                            ))}
                                        </select>
                                        <p className="text-[10px] text-blue-600 mt-2 leading-tight">
                                            * Se creará automáticamente un perfil en la "Base de Médicos" con esta especialidad.
                                        </p>
                                    </div>
                                )}
                            </div>
                            <div className="p-4 md:p-6 border-t border-slate-200 bg-slate-50 rounded-b-2xl flex justify-end gap-3">
                                <button
                                    onClick={() => setShowUserModal(false)}
                                    className="px-4 py-2.5 text-slate-600 hover:bg-white hover:shadow-sm rounded-lg font-bold text-sm border border-transparent hover:border-slate-200 transition-all flex-1 md:flex-none"
                                >
                                    Cancelar
                                </button>
                                <button
                                    onClick={handleSaveUser}
                                    disabled={
                                        !newUser.name ||
                                        !newUser.email ||
                                        (!isEditingUser && !newUser.password) ||
                                        (newUser.role === 'Ortopedia' && !newUser.vendorId) ||
                                        (newUser.role === 'Medico' && !newUserSpecialty)
                                    }
                                    className="px-4 py-2.5 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg font-bold text-sm shadow-sm transition-all flex-1 md:flex-none"
                                >
                                    {isEditingUser ? 'Guardar Cambios' : 'Guardar Usuario'}
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }

            {/* DOCTOR ADD/EDIT MODAL */}
            {
                showDoctorModal && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4 animate-fadeIn">
                        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col max-h-[95vh] md:max-h-[90vh]">
                            <div className="p-4 md:p-6 border-b border-slate-200 flex justify-between items-center bg-slate-50 rounded-t-2xl">
                                <h3 className="text-lg font-bold text-slate-900">
                                    {isEditingDoctor ? 'Editar Médico' : 'Nuevo Médico'}
                                </h3>
                                <button onClick={() => setShowDoctorModal(false)} className="text-slate-400 hover:text-slate-600 p-1">
                                    <span className="material-symbols-outlined">close</span>
                                </button>
                            </div>
                            <div className="p-4 md:p-6 space-y-4 overflow-y-auto flex-1 custom-scrollbar">
                                <div>
                                    <label className="block text-xs font-bold text-slate-700 uppercase mb-1.5">Nombre Completo</label>
                                    <input
                                        className="w-full bg-white text-slate-900 rounded-lg border border-slate-300 focus:ring-blue-500 focus:border-blue-500 px-3 py-2 text-sm placeholder-slate-400"
                                        type="text"
                                        value={doctorForm.name || ''}
                                        onChange={e => setDoctorForm({ ...doctorForm, name: e.target.value })}
                                        placeholder="Ej: Dr. Jorge Garcia"
                                    />
                                </div>

                                <div>
                                    <label className="block text-xs font-bold text-slate-700 uppercase mb-1.5">Email / Usuario Sistema</label>
                                    <input
                                        className="w-full bg-white text-slate-900 rounded-lg border border-slate-300 focus:ring-blue-500 focus:border-blue-500 px-3 py-2 text-sm placeholder-slate-400"
                                        type="email"
                                        value={doctorForm.email || ''}
                                        onChange={e => setDoctorForm({ ...doctorForm, email: e.target.value })}
                                        placeholder="usuario@hospital.med"
                                    />
                                </div>

                                <div>
                                    <label className="block text-xs font-bold text-slate-700 uppercase mb-1.5">Especialidad</label>
                                    <select
                                        className="w-full bg-white text-slate-900 rounded-lg border border-slate-300 focus:ring-blue-500 focus:border-blue-500 px-3 py-2 text-sm"
                                        value={doctorForm.specialty || ''}
                                        onChange={e => setDoctorForm({ ...doctorForm, specialty: e.target.value })}
                                    >
                                        <option value="">Seleccionar Especialidad...</option>
                                        {specialties.map(spec => (
                                            <option key={spec} value={spec}>{spec}</option>
                                        ))}
                                    </select>
                                    {specialties.length === 0 && (
                                        <p className="text-[10px] text-amber-600 mt-1 font-medium italic">Cargando especialidades...</p>
                                    )}
                                </div>
                            </div>
                            <div className="p-4 md:p-6 border-t border-slate-200 bg-slate-50 rounded-b-2xl flex justify-end gap-3">
                                <button
                                    onClick={() => setShowDoctorModal(false)}
                                    className="px-4 py-2.5 text-slate-600 hover:bg-white hover:shadow-sm rounded-lg font-bold text-sm border border-transparent hover:border-slate-200 transition-all flex-1 md:flex-none"
                                >
                                    Cancelar
                                </button>
                                <button
                                    onClick={handleSaveDoctor}
                                    disabled={!doctorForm.name || !doctorForm.email}
                                    className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg font-bold text-sm shadow-sm transition-all flex-1 md:flex-none"
                                >
                                    {isEditingDoctor ? 'Guardar Cambios' : 'Crear Médico'}
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }

            {/* VENDOR ADD/EDIT MODAL */}
            {
                showVendorModal && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4 animate-fadeIn">
                        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col max-h-[95vh] md:max-h-[90vh]">
                            <div className="p-4 md:p-6 border-b border-slate-200 flex justify-between items-center bg-slate-50 rounded-t-2xl">
                                <h3 className="text-lg font-bold text-slate-900">
                                    {isEditingVendor ? 'Editar Proveedor' : 'Nuevo Proveedor'}
                                </h3>
                                <button onClick={() => setShowVendorModal(false)} className="text-slate-400 hover:text-slate-600 p-1">
                                    <span className="material-symbols-outlined">close</span>
                                </button>
                            </div>
                            <div className="p-4 md:p-6 space-y-4 overflow-y-auto flex-1 custom-scrollbar">
                                <div>
                                    <label className="block text-xs font-bold text-slate-700 uppercase mb-1.5">Nombre de la Empresa</label>
                                    <input
                                        className="w-full bg-white text-slate-900 rounded-lg border border-slate-300 focus:ring-purple-500 focus:border-purple-500 px-3 py-2 text-sm placeholder-slate-400 font-bold"
                                        type="text"
                                        value={vendorForm.name}
                                        onChange={e => setVendorForm({ ...vendorForm, name: e.target.value })}
                                        placeholder="Ej: Implantes Médicos S.A."
                                        autoFocus
                                    />
                                </div>
                                <div className="mt-4">
                                    <label className="block text-xs font-bold text-slate-700 uppercase mb-1.5">Correo Electrónico de Contacto</label>
                                    <div className="relative">
                                        <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">mail</span>
                                        <input
                                            className="w-full bg-white text-slate-900 rounded-lg border border-slate-300 focus:ring-purple-500 focus:border-purple-500 pl-10 pr-3 py-2 text-sm placeholder-slate-400"
                                            type="email"
                                            value={vendorForm.email || ''}
                                            onChange={e => setVendorForm({ ...vendorForm, email: e.target.value })}
                                            placeholder="ejemplo@ortopedia.com"
                                        />
                                    </div>
                                    <p className="text-[10px] text-slate-500 mt-1 italic">Este correo recibirá las notificaciones de cancelación de cirugías.</p>
                                </div>
                                <div className="mt-4 bg-slate-50 p-4 rounded-xl border border-slate-200">
                                    <label className="flex items-center gap-3 cursor-pointer group">
                                        <input
                                            type="checkbox"
                                            className="size-4 rounded border-slate-300 text-purple-600 focus:ring-purple-500 cursor-pointer"
                                            checked={vendorForm.requires_material_validation ?? true}
                                            onChange={e => setVendorForm({ ...vendorForm, requires_material_validation: e.target.checked })}
                                        />
                                        <div className="flex flex-col">
                                            <span className="text-sm font-bold text-slate-700 group-hover:text-purple-600 transition-colors">Requiere Validación de Materiales</span>
                                            <span className="text-[10px] text-slate-500">Si se desmarca, las cirugías asignadas a esta ortopedia se marcarán automáticamente como validadas (no generará alertas).</span>
                                        </div>
                                    </label>
                                </div>
                            </div>
                            <div className="p-4 md:p-6 border-t border-slate-200 bg-slate-50 rounded-b-2xl flex justify-end gap-3">
                                <button
                                    onClick={() => setShowVendorModal(false)}
                                    className="px-4 py-2.5 text-slate-600 hover:bg-white hover:shadow-sm rounded-lg font-bold text-sm border border-transparent hover:border-slate-200 transition-all flex-1 md:flex-none"
                                >
                                    Cancelar
                                </button>
                                <button
                                    onClick={handleSaveVendor}
                                    disabled={!vendorForm.name.trim()}
                                    className="px-4 py-2.5 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg font-bold text-sm shadow-sm transition-all flex-1 md:flex-none"
                                >
                                    {isEditingVendor ? 'Guardar Cambios' : 'Crear Proveedor'}
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }

            {/* COVERAGE ADD/EDIT MODAL */}
            {
                showCoverageModal && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4 animate-fadeIn">
                        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col max-h-[95vh] md:max-h-[90vh]">
                            <div className="p-4 md:p-6 border-b border-slate-200 flex justify-between items-center bg-slate-50 rounded-t-2xl">
                                <h3 className="text-lg font-bold text-slate-900">
                                    {isEditingCoverage ? 'Editar Prestador' : 'Nuevo Prestador'}
                                </h3>
                                <button onClick={() => setShowCoverageModal(false)} className="text-slate-400 hover:text-slate-600 transition-colors p-1">
                                    <span className="material-symbols-outlined">close</span>
                                </button>
                            </div>
                            <div className="p-4 md:p-6 space-y-5 overflow-y-auto flex-1 custom-scrollbar">
                                <div>
                                    <label className="block text-xs font-bold text-slate-700 uppercase mb-2">Nombre del Prestador</label>
                                    <input
                                        className="w-full bg-white text-slate-900 rounded-lg border border-slate-300 focus:ring-blue-500 focus:border-blue-500 px-3 py-2 text-sm placeholder-slate-400 transition-all"
                                        type="text"
                                        value={coverageForm.name || ''}
                                        onChange={e => setCoverageForm({ ...coverageForm, name: e.target.value })}
                                        placeholder="Ej: OSDE, Swiss Medical o Provincia ART"
                                        autoFocus
                                    />
                                </div>

                                <div className="flex items-center gap-3 bg-slate-50 p-3 rounded-lg border border-slate-100">
                                    <label className="relative inline-flex items-center cursor-pointer">
                                        <input
                                            type="checkbox"
                                            className="sr-only peer"
                                            checked={coverageForm.type === 'ART'}
                                            onChange={e => setCoverageForm({ ...coverageForm, type: e.target.checked ? 'ART' : 'Obra Social' })}
                                        />
                                        <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-orange-500 shadow-inner"></div>
                                    </label>
                                    <div className="flex flex-col">
                                        <span className="text-sm font-bold text-slate-700">Es Aseguradora (ART)</span>
                                        <span className="text-[10px] text-slate-500">Marque si este prestador es una cobertura por accidente laboral.</span>
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-xs font-bold text-slate-700 uppercase mb-2">Ortopedia Asociada (Opcional)</label>
                                    <select
                                        className="w-full bg-white text-slate-900 rounded-lg border border-slate-300 focus:ring-blue-500 focus:border-blue-500 px-3 py-2 text-sm transition-all shadow-sm"
                                        value={coverageForm.vendor_id || ''}
                                        onChange={e => setCoverageForm({ ...coverageForm, vendor_id: e.target.value })}
                                    >
                                        <option value="">Ninguna (Libre)</option>
                                        {vendors.map(v => (
                                            <option key={v.id} value={v.id}>{v.name}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                            <div className="p-4 md:p-6 border-t border-slate-200 bg-slate-50 rounded-b-2xl flex justify-end gap-3">
                                <button
                                    onClick={() => setShowCoverageModal(false)}
                                    className="px-4 py-2.5 text-slate-600 hover:bg-white hover:shadow-sm rounded-lg font-bold text-sm border border-transparent hover:border-slate-200 transition-all flex-1 md:flex-none"
                                >
                                    Cancelar
                                </button>
                                <button
                                    onClick={handleSaveCoverage}
                                    disabled={!coverageForm.name || !coverageForm.name.trim()}
                                    className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg font-bold text-sm shadow-sm transition-all flex-1 md:flex-none"
                                >
                                    {isEditingCoverage ? 'Guardar Cambios' : 'Crear Cobertura'}
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }

            {/* SPECIALTIES MANAGEMENT MODAL */}
            {
                showSpecialtiesModal && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4 animate-fadeIn">
                        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col max-h-[90vh]">
                            <div className="p-6 border-b border-slate-200 flex justify-between items-center bg-slate-50 rounded-t-2xl">
                                <h3 className="text-lg font-bold text-slate-900">Gestión de Especialidades</h3>
                                <button onClick={() => setShowSpecialtiesModal(false)} className="text-slate-400 hover:text-slate-600">
                                    <span className="material-symbols-outlined">close</span>
                                </button>
                            </div>
                            <div className="p-6 space-y-6 flex-1 overflow-y-auto">
                                {/* Add/Edit Form */}
                                <div className="flex gap-2 items-end">
                                    <div className="flex-1">
                                        <label className="block text-xs font-bold text-slate-700 uppercase mb-1.5">
                                            {editingSpecialtyOriginal ? 'Editar Especialidad' : 'Nueva Especialidad'}
                                        </label>
                                        <input
                                            className="w-full bg-white text-slate-900 rounded-lg border border-slate-300 focus:ring-blue-500 focus:border-blue-500 px-3 py-2 text-sm placeholder-slate-400"
                                            type="text"
                                            value={specialtyForm}
                                            onChange={e => setSpecialtyForm(e.target.value)}
                                            placeholder="Ej: Pediatría"
                                            autoFocus
                                        />
                                    </div>
                                    <button
                                        onClick={handleSaveSpecialty}
                                        disabled={!specialtyForm.trim()}
                                        className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white p-2 rounded-lg shadow-sm flex items-center justify-center"
                                        title="Guardar"
                                    >
                                        <span className="material-symbols-outlined text-lg">{editingSpecialtyOriginal ? 'save' : 'add'}</span>
                                    </button>
                                    {editingSpecialtyOriginal && (
                                        <button
                                            onClick={() => { setEditingSpecialtyOriginal(null); setSpecialtyForm(''); }}
                                            className="bg-slate-200 hover:bg-slate-300 text-slate-600 p-2 rounded-lg shadow-sm flex items-center justify-center"
                                            title="Cancelar Edición"
                                        >
                                            <span className="material-symbols-outlined text-lg">close</span>
                                        </button>
                                    )}
                                </div>

                                {/* List */}
                                <div>
                                    <label className="block text-xs font-bold text-slate-400 uppercase mb-2">Especialidades Activas ({specialties.length})</label>
                                    <div className="border border-slate-200 rounded-lg overflow-hidden divide-y divide-slate-100">
                                        {specialties.map(spec => (
                                            <div key={spec} className="px-3 py-2 bg-white flex justify-between items-center hover:bg-slate-50 group">
                                                <span className="text-sm font-medium text-slate-700">{spec}</span>
                                                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <button
                                                        onClick={() => handleEditSpecialty(spec)}
                                                        className="p-1 text-slate-400 hover:text-blue-600"
                                                        title="Editar"
                                                    >
                                                        <span className="material-symbols-outlined text-base">edit</span>
                                                    </button>
                                                    <button
                                                        onClick={() => handleDeleteSpecialty(spec)}
                                                        className="p-1 text-slate-400 hover:text-red-500"
                                                        title="Eliminar"
                                                    >
                                                        <span className="material-symbols-outlined text-base">delete</span>
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                        {specialties.length === 0 && (
                                            <div className="p-4 text-center text-slate-400 text-sm italic">No hay especialidades registradas.</div>
                                        )}
                                    </div>
                                </div>
                            </div>
                            <div className="p-4 border-t border-slate-200 bg-slate-50 rounded-b-2xl flex justify-end">
                                <button
                                    onClick={() => setShowSpecialtiesModal(false)}
                                    className="px-4 py-2 text-slate-600 hover:bg-white hover:shadow-sm rounded-lg font-bold text-sm border border-transparent hover:border-slate-200 transition-all"
                                >
                                    Cerrar
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }

            {/* PROCEDURE CREATE MODAL */}
            {
                showProcModal && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4 animate-fadeIn">
                        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col max-h-[90vh]">
                            <div className="p-6 border-b border-slate-200 flex justify-between items-center bg-slate-50 rounded-t-2xl">
                                <h3 className="text-lg font-bold text-slate-900">Nuevo Tipo de Cirugía</h3>
                                <button onClick={() => setShowProcModal(false)} className="text-slate-400 hover:text-slate-600">
                                    <span className="material-symbols-outlined">close</span>
                                </button>
                            </div>
                            <div className="p-6 space-y-4 overflow-y-auto flex-1">
                                <div>
                                    <label className="block text-xs font-bold text-slate-700 uppercase mb-1.5">Nombre del Procedimiento</label>
                                    <input
                                        className="w-full bg-white text-slate-900 rounded-lg border border-slate-300 focus:ring-purple-500 focus:border-purple-500 px-3 py-2 text-sm placeholder-slate-400"
                                        type="text"
                                        value={newProcedure.name || ''}
                                        onChange={e => setNewProcedure({ ...newProcedure, name: e.target.value })}
                                        placeholder="Ej: Artroplastia de Rodilla"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-700 uppercase mb-1.5">Especialidad</label>
                                    <select
                                        className="w-full bg-white text-slate-900 rounded-lg border border-slate-300 focus:ring-purple-500 focus:border-purple-500 px-3 py-2 text-sm"
                                        value={newProcedure.specialty || ''}
                                        onChange={e => setNewProcedure({ ...newProcedure, specialty: e.target.value })}
                                    >
                                        {specialties.map(spec => (
                                            <option key={spec} value={spec}>{spec}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-700 uppercase mb-1.5">Duración Estándar (Minutos)</label>
                                    <input
                                        className="w-full bg-white text-slate-900 rounded-lg border border-slate-300 focus:ring-purple-500 focus:border-purple-500 px-3 py-2 text-sm"
                                        type="number"
                                        min="15"
                                        step="15"
                                        value={newProcedure.defaultDurationMin}
                                        onChange={e => setNewProcedure({ ...newProcedure, defaultDurationMin: parseInt(e.target.value) })}
                                    />
                                </div>
                            </div>
                            <div className="p-4 border-t border-slate-200 bg-slate-50 rounded-b-2xl flex justify-end gap-2">
                                <button
                                    onClick={() => setShowProcModal(false)}
                                    className="px-4 py-2 text-slate-600 hover:bg-white hover:shadow-sm rounded-lg font-bold text-sm border border-transparent hover:border-slate-200 transition-all"
                                >
                                    Cancelar
                                </button>
                                <button
                                    onClick={handleSaveProcedure}
                                    disabled={!newProcedure.name}
                                    className="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg font-bold text-sm shadow-sm transition-all"
                                >
                                    Crear Cirugía
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }

            {/* PROCEDURE EDIT MODAL */}
            {
                showEditProcModal && editingProcedure && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4 animate-fadeIn">
                        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col max-h-[90vh]">
                            <div className="p-6 border-b border-slate-200 flex justify-between items-center bg-slate-50 rounded-t-2xl">
                                <h3 className="text-lg font-bold text-slate-900">Editar Detalles de Cirugía</h3>
                                <button onClick={() => setShowEditProcModal(false)} className="text-slate-400 hover:text-slate-600">
                                    <span className="material-symbols-outlined">close</span>
                                </button>
                            </div>
                            <div className="p-6 space-y-4 overflow-y-auto flex-1">
                                <div>
                                    <label className="block text-xs font-bold text-slate-700 uppercase mb-1.5">Nombre del Procedimiento</label>
                                    <input
                                        className="w-full bg-white text-slate-900 rounded-lg border border-slate-300 focus:ring-purple-500 focus:border-purple-500 px-3 py-2 text-sm placeholder-slate-400"
                                        type="text"
                                        value={editingProcedure.name}
                                        onChange={e => setEditingProcedure({ ...editingProcedure, name: e.target.value })}
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-700 uppercase mb-1.5">Especialidad</label>
                                    <select
                                        className="w-full bg-white text-slate-900 rounded-lg border border-slate-300 focus:ring-purple-500 focus:border-purple-500 px-3 py-2 text-sm"
                                        value={editingProcedure.specialty}
                                        onChange={e => setEditingProcedure({ ...editingProcedure, specialty: e.target.value })}
                                    >
                                        {specialties.map(spec => (
                                            <option key={spec} value={spec}>{spec}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-700 uppercase mb-1.5">Duración Estándar (Minutos)</label>
                                    <input
                                        className="w-full bg-white text-slate-900 rounded-lg border border-slate-300 focus:ring-purple-500 focus:border-purple-500 px-3 py-2 text-sm"
                                        type="number"
                                        min="15"
                                        step="15"
                                        value={editingProcedure.defaultDurationMin}
                                        onChange={e => setEditingProcedure({ ...editingProcedure, defaultDurationMin: parseInt(e.target.value) })}
                                    />
                                </div>
                            </div>
                            <div className="p-4 border-t border-slate-200 bg-slate-50 rounded-b-2xl flex justify-end gap-2">
                                <button
                                    onClick={() => setShowEditProcModal(false)}
                                    className="px-4 py-2 text-slate-600 hover:bg-white hover:shadow-sm rounded-lg font-bold text-sm border border-transparent hover:border-slate-200 transition-all"
                                >
                                    Cancelar
                                </button>
                                <button
                                    onClick={handleUpdateProcedure}
                                    disabled={!editingProcedure.name}
                                    className="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg font-bold text-sm shadow-sm transition-all"
                                >
                                    Guardar Cambios
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }

            {/* MATERIAL ADD MODAL */}
            {
                showMaterialModal && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4 animate-fadeIn">
                        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col max-h-[90vh]">
                            <div className="p-6 border-b border-slate-200 flex justify-between items-center bg-slate-50 rounded-t-2xl">
                                <h3 className="text-lg font-bold text-slate-900">Agregar Nuevo Material</h3>
                                <button onClick={() => setShowMaterialModal(false)} className="text-slate-400 hover:text-slate-600">
                                    <span className="material-symbols-outlined">close</span>
                                </button>
                            </div>
                            <div className="p-6 space-y-4 overflow-y-auto flex-1">
                                <div>
                                    <label className="block text-xs font-bold text-slate-700 uppercase mb-1.5">Nombre del Material</label>
                                    <input
                                        className="w-full bg-white text-slate-900 rounded-lg border border-slate-300 focus:ring-purple-500 focus:border-purple-500 px-3 py-2 text-sm placeholder-slate-400"
                                        type="text"
                                        value={newMaterial.name || ''}
                                        onChange={e => setNewMaterial({ ...newMaterial, name: e.target.value })}
                                        placeholder="Ej: Sutura FiberWire"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-700 uppercase mb-1.5">Categoría</label>

                                    {isAddingCategory ? (
                                        <div className="flex gap-2">
                                            <input
                                                className="flex-1 bg-white text-slate-900 rounded-lg border border-slate-300 focus:ring-purple-500 focus:border-purple-500 px-3 py-2 text-sm"
                                                type="text"
                                                autoFocus
                                                placeholder="Nueva Categoría"
                                                value={newCategoryName}
                                                onChange={e => setNewCategoryName(e.target.value)}
                                            />
                                            <button
                                                onClick={handleSaveCategory}
                                                className="bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg px-3 flex items-center justify-center"
                                            >
                                                <span className="material-symbols-outlined text-sm">check</span>
                                            </button>
                                            <button
                                                onClick={() => { setIsAddingCategory(false); setNewCategoryName(''); }}
                                                className="bg-slate-200 hover:bg-slate-300 text-slate-600 rounded-lg px-3 flex items-center justify-center"
                                            >
                                                <span className="material-symbols-outlined text-sm">close</span>
                                            </button>
                                        </div>
                                    ) : (
                                        <div className="flex gap-2">
                                            <select
                                                className="flex-1 bg-white text-slate-900 rounded-lg border border-slate-300 focus:ring-purple-500 focus:border-purple-500 px-3 py-2 text-sm"
                                                value={newMaterial.category || 'Herramienta'}
                                                onChange={e => setNewMaterial({ ...newMaterial, category: e.target.value as any })}
                                            >
                                                {categories.map(cat => (
                                                    <option key={cat} value={cat}>{cat}</option>
                                                ))}
                                            </select>
                                            <button
                                                onClick={() => setIsAddingCategory(true)}
                                                title="Crear nueva categoría"
                                                className="bg-purple-50 hover:bg-purple-100 border border-purple-200 text-purple-700 rounded-lg px-3 flex items-center justify-center transition-colors"
                                            >
                                                <span className="material-symbols-outlined text-lg">add</span>
                                            </button>
                                        </div>
                                    )}
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-700 uppercase mb-1.5">Cantidad Sugerida</label>
                                    <input
                                        className="w-full bg-white text-slate-900 rounded-lg border border-slate-300 focus:ring-purple-500 focus:border-purple-500 px-3 py-2 text-sm"
                                        type="number"
                                        min="1"
                                        value={newMaterial.quantity}
                                        onChange={e => setNewMaterial({ ...newMaterial, quantity: parseInt(e.target.value) })}
                                    />
                                </div>
                            </div>
                            <div className="p-4 border-t border-slate-200 bg-slate-50 rounded-b-2xl flex justify-end gap-2">
                                <button
                                    onClick={() => setShowMaterialModal(false)}
                                    className="px-4 py-2 text-slate-600 hover:bg-white hover:shadow-sm rounded-lg font-bold text-sm border border-transparent hover:border-slate-200 transition-all"
                                >
                                    Cancelar
                                </button>
                                <button
                                    onClick={handleSaveMaterial}
                                    disabled={!newMaterial.name || !newMaterial.quantity}
                                    className="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg font-bold text-sm shadow-sm transition-all"
                                >
                                    Agregar Item
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }

            {/* OR ADD MODAL */}
            {
                showORModal && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4 animate-fadeIn">
                        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col max-h-[90vh]">
                            <div className="p-6 border-b border-slate-200 flex justify-between items-center bg-slate-50 rounded-t-2xl">
                                <h3 className="text-lg font-bold text-slate-900">
                                    {isEditingOR ? 'Editar Sala de Quirófano' : 'Nueva Sala de Quirófano'}
                                </h3>
                                <button onClick={() => setShowORModal(false)} className="text-slate-400 hover:text-slate-600">
                                    <span className="material-symbols-outlined">close</span>
                                </button>
                            </div>
                            <div className="p-6 space-y-4 overflow-y-auto flex-1">
                                <div>
                                    <label className="block text-xs font-bold text-slate-700 uppercase mb-1.5">ID / Número de Sala</label>
                                    <input
                                        className="w-full bg-slate-50 text-slate-900 rounded-lg border border-slate-300 focus:ring-slate-500 focus:border-slate-500 px-3 py-2 text-sm font-mono"
                                        type="text"
                                        value={newORID}
                                        onChange={e => setNewORID(e.target.value)}
                                        placeholder="Ej: 305"
                                        disabled={isEditingOR}
                                    />
                                    {isEditingOR && <p className="text-[10px] text-slate-400 mt-1">El ID no puede modificarse después de creado.</p>}
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-700 uppercase mb-1.5">Nombre de la Sala</label>
                                    <input
                                        className="w-full bg-white text-slate-900 rounded-lg border border-slate-300 focus:ring-slate-500 focus:border-slate-500 px-3 py-2 text-sm placeholder-slate-400"
                                        type="text"
                                        value={newORName}
                                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewORName(e.target.value)}
                                        placeholder="Ej: Quirófano 4 (Urgencias)"
                                        autoFocus
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-700 uppercase mb-1.5">Meta Diaria de Cirugías</label>
                                    <input
                                        className="w-full bg-white text-slate-900 rounded-lg border border-slate-300 focus:ring-slate-500 focus:border-slate-500 px-3 py-2 text-sm"
                                        type="number"
                                        min="1"
                                        max="20"
                                        value={newORGoal}
                                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewORGoal(parseInt(e.target.value) || 4)}
                                        placeholder="Ej: 4"
                                    />
                                    <p className="text-[10px] text-slate-400 mt-1">Este valor se utiliza para calcular el % de ocupación en reportes.</p>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-700 uppercase mb-1.5">Hora de Inicio Jornada</label>
                                    <input
                                        className="w-full bg-white text-slate-900 rounded-lg border border-slate-300 focus:ring-slate-500 focus:border-slate-500 px-3 py-2 text-sm"
                                        type="time"
                                        value={newORStartTime}
                                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewORStartTime(e.target.value)}
                                    />
                                    <p className="text-[10px] text-slate-400 mt-1">Hora por defecto para la primera cirugía del día en esta sala.</p>
                                </div>
                            </div>
                            <div className="p-4 border-t border-slate-200 bg-slate-50 rounded-b-2xl flex justify-end gap-2">
                                <button
                                    onClick={() => setShowORModal(false)}
                                    className="px-4 py-2 text-slate-600 hover:bg-white hover:shadow-sm rounded-lg font-bold text-sm border border-transparent hover:border-slate-200 transition-all"
                                >
                                    Cancelar
                                </button>
                                <button
                                    onClick={handleSaveOR}
                                    disabled={!newORName.trim() || !newORID.trim()}
                                    className="px-4 py-2 bg-slate-800 hover:bg-slate-900 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg font-bold text-sm shadow-sm transition-all"
                                >
                                    {isEditingOR ? 'Guardar Cambios' : 'Crear Sala'}
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }
            {/* CATALOG ITEM MODAL */}
            {
                showCatalogModal && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4 animate-fadeIn">
                        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col max-h-[90vh]">
                            <div className="p-6 border-b border-slate-200 flex justify-between items-center bg-slate-50 rounded-t-2xl">
                                <h3 className="text-lg font-bold text-slate-900">
                                    {isEditingCatalog ? 'Editar Ítem del Catálogo' : 'Nuevo Ítem de Catálogo'}
                                </h3>
                                <button onClick={() => setShowCatalogModal(false)} className="text-slate-400 hover:text-slate-600">
                                    <span className="material-symbols-outlined">close</span>
                                </button>
                            </div>
                            <div className="p-6 space-y-4 overflow-y-auto flex-1">
                                <div className="grid grid-cols-3 gap-4">
                                    <div className="col-span-2">
                                        <label className="block text-xs font-bold text-slate-700 uppercase mb-1.5 font-bold">Nombre del Ítem</label>
                                        <input
                                            className="w-full bg-white text-slate-900 rounded-lg border border-slate-200 focus:ring-2 focus:ring-indigo-500 px-3 py-2 text-sm placeholder-slate-400"
                                            type="text"
                                            value={catalogForm.name || ''}
                                            onChange={e => setCatalogForm({ ...catalogForm, name: e.target.value })}
                                            placeholder="Ej: Propofol 1%"
                                            autoFocus
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-slate-700 uppercase mb-1.5 font-bold">Código</label>
                                        <input
                                            className="w-full bg-white text-slate-900 rounded-lg border border-slate-200 focus:ring-2 focus:ring-indigo-500 px-3 py-2 text-sm placeholder-slate-400 font-mono"
                                            type="text"
                                            value={catalogForm.code || ''}
                                            onChange={e => setCatalogForm({ ...catalogForm, code: e.target.value })}
                                            placeholder="Cód..."
                                        />
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs font-bold text-slate-700 uppercase mb-1.5 font-bold">Categoría</label>
                                        <select
                                            className="w-full bg-white text-slate-900 rounded-lg border border-slate-200 focus:ring-2 focus:ring-indigo-500 px-3 py-2 text-sm"
                                            value={catalogForm.category || 'surgery'}
                                            onChange={e => setCatalogForm({ ...catalogForm, category: e.target.value as any })}
                                        >
                                            <option value="surgery">Cirugía</option>
                                            <option value="anesthesia">Anestesia</option>
                                            <option value="medication">Medicamento (Enfermería)</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-slate-700 uppercase mb-1.5 font-bold">Unidades (e.g. mg, ml)</label>
                                        <input
                                            className="w-full bg-white text-slate-900 rounded-lg border border-slate-200 focus:ring-2 focus:ring-indigo-500 px-3 py-2 text-sm placeholder-slate-400"
                                            type="text"
                                            value={catalogForm.default_unit || ''}
                                            onChange={e => setCatalogForm({ ...catalogForm, default_unit: e.target.value })}
                                            placeholder="Ej: mg"
                                        />
                                    </div>
                                    <div className="flex items-end">
                                        <label className="flex items-center gap-2 cursor-pointer p-2 rounded-lg hover:bg-slate-50 transition-colors w-full border border-slate-100">
                                            <input
                                                type="checkbox"
                                                className="size-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                                                checked={catalogForm.active}
                                                onChange={e => setCatalogForm({ ...catalogForm, active: e.target.checked })}
                                            />
                                            <span className="text-sm font-bold text-slate-700">Item Activo</span>
                                        </label>
                                    </div>
                                </div>
                            </div>
                            <div className="p-4 border-t border-slate-200 bg-slate-50 rounded-b-2xl flex justify-end gap-2">
                                <button
                                    onClick={() => setShowCatalogModal(false)}
                                    className="px-4 py-2 text-slate-600 hover:bg-white hover:shadow-sm rounded-lg font-bold text-sm border border-transparent hover:border-slate-200 transition-all font-bold"
                                >
                                    Cancelar
                                </button>
                                <button
                                    onClick={handleSaveCatalogItem}
                                    disabled={!(catalogForm.name || '').trim()}
                                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg font-bold text-sm shadow-sm transition-all"
                                >
                                    {isEditingCatalog ? 'Guardar Cambios' : 'Crear Ítem'}
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }
        </div >
    );
};

export default Settings;