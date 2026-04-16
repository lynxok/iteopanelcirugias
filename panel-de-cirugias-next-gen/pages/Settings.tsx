import React, { useState, useEffect } from 'react';
import { Doctor, OperatingRoom, ProcedureType, AppUser, Vendor, UserRole, MaterialTemplate, Coverage } from '../types';
import { supabase } from '../src/lib/supabase';
import ProgressBar from '../components/ProgressBar';

const Settings: React.FC = () => {
    const [activeTab, setActiveTab] = useState<'users' | 'doctors' | 'ors' | 'tree' | 'vendors' | 'coverages'>('users');

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

    // --- SPECIALTIES STATE ---
    const [specialties, setSpecialties] = useState<string[]>([]);

    const [showSpecialtiesModal, setShowSpecialtiesModal] = useState(false);
    const [specialtyForm, setSpecialtyForm] = useState('');
    const [editingSpecialtyOriginal, setEditingSpecialtyOriginal] = useState<string | null>(null);

    const [selectedProcedureId, setSelectedProcedureId] = useState<string | null>('p1');
    const selectedProcedure = procedures.find(p => p.id === selectedProcedureId);

    // --- MODAL STATE ---
    const [showUserModal, setShowUserModal] = useState(false);
    const [newUser, setNewUser] = useState<Partial<AppUser>>({ role: 'Medico', active: true });
    const [newUserSpecialty, setNewUserSpecialty] = useState<string>('');
    const [isEditingUser, setIsEditingUser] = useState(false);

    // Doctor Modal State
    const [showDoctorModal, setShowDoctorModal] = useState(false);
    const [doctorForm, setDoctorForm] = useState<Partial<Doctor>>({ name: '', specialty: 'Cirugía General', email: '', active: true });
    const [isEditingDoctor, setIsEditingDoctor] = useState(false);

    // Vendor Modal State
    const [showVendorModal, setShowVendorModal] = useState(false);
    const [vendorForm, setVendorForm] = useState<{ id?: string, name: string }>({ name: '' });
    const [isEditingVendor, setIsEditingVendor] = useState(false);

    // Coverage Modal State
    const [showCoverageModal, setShowCoverageModal] = useState(false);
    const [coverageForm, setCoverageForm] = useState<Partial<Coverage>>({ name: '', vendor_id: '', type: 'Obra Social' });
    const [isEditingCoverage, setIsEditingCoverage] = useState(false);


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
            fetchCategories()
        ]);
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
                doctorId: u.doctor_id
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
        setVendorForm({ name: '' });
        setIsEditingVendor(false);
        setShowVendorModal(true);
    };

    const openEditVendorModal = (vendor: Vendor) => {
        setVendorForm({ id: vendor.id, name: vendor.name });
        setIsEditingVendor(true);
        setShowVendorModal(true);
    };

    const handleSaveVendor = async () => {
        if (vendorForm.name.trim()) {
            if (isEditingVendor && vendorForm.id) {
                await supabase.from('vendors').update({ name: vendorForm.name }).eq('id', vendorForm.id);
            } else {
                await supabase.from('vendors').insert({ name: vendorForm.name });
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

    const handleDeleteCoverage = async (id: string) => {
        if (window.confirm('¿Eliminar este prestador?')) {
            await supabase.from('coverages').delete().eq('id', id);
            fetchCoverages();
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

    const toggleUserStatus = async (id: string) => {
        const u = users.find(user => user.id === id);
        if (u) {
            await Promise.all([
                supabase.from('users').update({ active: !u.active }).eq('id', id),
                u.role === 'Medico' ? supabase.from('doctors').update({ active: !u.active }).eq('email', u.email) : Promise.resolve()
            ]);
            fetchInitialData();
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
        setNewUser({ name: '', email: '', password: '', role: 'Medico', active: true });
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
            active: user.active
        });

        if (user.role === 'Medico') {
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
            // 1. If role is Medico, AUTOMATICALLY create/update the Doctor profile
            let doctorId = null;
            if (newUser.role === 'Medico') {
                const doctorPayload = {
                    full_name: newUser.name,
                    email: newUser.email,
                    specialty: newUserSpecialty,
                    active: true
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
                active: newUser.active !== undefined ? newUser.active : true
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
            setNewUser({ role: 'Medico', active: true });
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
            <header className="bg-slate-900 text-white px-8 py-6 flex-shrink-0 flex justify-between items-center shadow-lg z-10">
                <div>
                    <h1 className="text-2xl font-bold flex items-center gap-3">
                        <span className="material-symbols-outlined text-amber-400">admin_panel_settings</span>
                        Administración del Sistema
                    </h1>
                    <p className="text-slate-400 text-sm mt-1">Configuración maestra de recursos y árboles de decisión.</p>
                </div>
                <div className="bg-slate-800 px-4 py-2 rounded-lg border border-slate-700">
                    <span className="text-xs text-slate-400 font-bold uppercase tracking-wider block">Rol Actual</span>
                    <span className="text-sm font-bold text-white">SuperAdmin</span>
                </div>
            </header>

            <div className="flex-1 overflow-hidden flex w-full">
                {/* Sidebar Navigation */}
                <nav className="w-72 flex-shrink-0 flex flex-col bg-white border-r border-slate-200 h-full">
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
                        </div>
                    </div>
                </nav>

                {/* Main Content Area */}
                <main className="flex-1 h-full overflow-y-auto bg-slate-50 p-8">

                    {/* TAB: USERS MANAGEMENT */}
                    {activeTab === 'users' && (
                        <div className="max-w-6xl mx-auto flex flex-col gap-6 animate-fadeIn">
                            <div className="flex justify-between items-end">
                                <div>
                                    <h2 className="text-xl font-bold text-slate-900">Usuarios del Sistema</h2>
                                    <p className="text-sm text-slate-500">Gestione accesos, roles y vinculaciones con proveedores externos.</p>
                                </div>
                                <button
                                    onClick={handleOpenNewUser}
                                    className="bg-amber-600 hover:bg-amber-700 text-white px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 shadow-sm transition-colors"
                                >
                                    <span className="material-symbols-outlined text-lg">person_add</span> Crear Usuario
                                </button>
                            </div>

                            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                                <table className="w-full text-left">
                                    <thead className="bg-slate-100 text-slate-500 text-xs uppercase font-bold tracking-wider">
                                        <tr>
                                            <th className="px-6 py-4">Usuario</th>
                                            <th className="px-6 py-4">Rol</th>
                                            <th className="px-6 py-4">Organización / Proveedor</th>
                                            <th className="px-6 py-4 text-center">Estado</th>
                                            <th className="px-6 py-4 text-right">Acciones</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {users.map(u => (
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
                                                <td className="px-6 py-4 text-center">
                                                    <button
                                                        onClick={() => toggleUserStatus(u.id)}
                                                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${u.active ? 'bg-emerald-500' : 'bg-slate-300'}`}
                                                    >
                                                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${u.active ? 'translate-x-6' : 'translate-x-1'}`} />
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

                            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
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
                                        {doctors.map(doc => (
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

                            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
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

                            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
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
                        <div className="flex h-[calc(100vh-140px)] gap-6 animate-fadeIn">

                            {/* Left: Procedure List */}
                            <div className="w-1/3 bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col overflow-hidden">
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

                                            <div className="border border-slate-200 rounded-lg overflow-hidden">
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

                </main>
            </div>

            {/* USER MODAL */}
            {showUserModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4 animate-fadeIn">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col">
                        <div className="p-6 border-b border-slate-200 flex justify-between items-center bg-slate-50 rounded-t-2xl">
                            <h3 className="text-lg font-bold text-slate-900">
                                {isEditingUser ? 'Editar Usuario' : 'Crear Nuevo Usuario'}
                            </h3>
                            <button onClick={() => setShowUserModal(false)} className="text-slate-400 hover:text-slate-600">
                                <span className="material-symbols-outlined">close</span>
                            </button>
                        </div>
                        <div className="p-6 space-y-4">
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
                                    <option value="Tecnico">Técnico</option>
                                    <option value="Internacion">Internación</option>
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
                        <div className="p-4 border-t border-slate-200 bg-slate-50 rounded-b-2xl flex justify-end gap-2">
                            <button
                                onClick={() => setShowUserModal(false)}
                                className="px-4 py-2 text-slate-600 hover:bg-white hover:shadow-sm rounded-lg font-bold text-sm border border-transparent hover:border-slate-200 transition-all"
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
                                className="px-4 py-2 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg font-bold text-sm shadow-sm transition-all"
                            >
                                {isEditingUser ? 'Guardar Cambios' : 'Guardar Usuario'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* DOCTOR ADD/EDIT MODAL */}
            {showDoctorModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4 animate-fadeIn">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col">
                        <div className="p-6 border-b border-slate-200 flex justify-between items-center bg-slate-50 rounded-t-2xl">
                            <h3 className="text-lg font-bold text-slate-900">
                                {isEditingDoctor ? 'Editar Médico' : 'Nuevo Médico'}
                            </h3>
                            <button onClick={() => setShowDoctorModal(false)} className="text-slate-400 hover:text-slate-600">
                                <span className="material-symbols-outlined">close</span>
                            </button>
                        </div>
                        <div className="p-6 space-y-4">
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
                        <div className="p-4 border-t border-slate-200 bg-slate-50 rounded-b-2xl flex justify-end gap-2">
                            <button
                                onClick={() => setShowDoctorModal(false)}
                                className="px-4 py-2 text-slate-600 hover:bg-white hover:shadow-sm rounded-lg font-bold text-sm border border-transparent hover:border-slate-200 transition-all"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleSaveDoctor}
                                disabled={!doctorForm.name || !doctorForm.email}
                                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg font-bold text-sm shadow-sm transition-all"
                            >
                                {isEditingDoctor ? 'Guardar Cambios' : 'Crear Médico'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* VENDOR ADD/EDIT MODAL */}
            {showVendorModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4 animate-fadeIn">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col">
                        <div className="p-6 border-b border-slate-200 flex justify-between items-center bg-slate-50 rounded-t-2xl">
                            <h3 className="text-lg font-bold text-slate-900">
                                {isEditingVendor ? 'Editar Proveedor' : 'Nuevo Proveedor'}
                            </h3>
                            <button onClick={() => setShowVendorModal(false)} className="text-slate-400 hover:text-slate-600">
                                <span className="material-symbols-outlined">close</span>
                            </button>
                        </div>
                        <div className="p-6 space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-slate-700 uppercase mb-1.5">Nombre de la Empresa</label>
                                <input
                                    className="w-full bg-white text-slate-900 rounded-lg border border-slate-300 focus:ring-purple-500 focus:border-purple-500 px-3 py-2 text-sm placeholder-slate-400"
                                    type="text"
                                    value={vendorForm.name}
                                    onChange={e => setVendorForm({ ...vendorForm, name: e.target.value })}
                                    placeholder="Ej: Implantes Médicos S.A."
                                    autoFocus
                                />
                            </div>
                        </div>
                        <div className="p-4 border-t border-slate-200 bg-slate-50 rounded-b-2xl flex justify-end gap-2">
                            <button
                                onClick={() => setShowVendorModal(false)}
                                className="px-4 py-2 text-slate-600 hover:bg-white hover:shadow-sm rounded-lg font-bold text-sm border border-transparent hover:border-slate-200 transition-all"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleSaveVendor}
                                disabled={!vendorForm.name.trim()}
                                className="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg font-bold text-sm shadow-sm transition-all"
                            >
                                {isEditingVendor ? 'Guardar Cambios' : 'Crear Proveedor'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* COVERAGE ADD/EDIT MODAL */}
            {showCoverageModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4 animate-fadeIn">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col">
                        <div className="p-6 border-b border-slate-200 flex justify-between items-center bg-slate-50 rounded-t-2xl">
                            <h3 className="text-lg font-bold text-slate-900">
                                {isEditingCoverage ? 'Editar Prestador' : 'Nuevo Prestador'}
                            </h3>
                            <button onClick={() => setShowCoverageModal(false)} className="text-slate-400 hover:text-slate-600 transition-colors">
                                <span className="material-symbols-outlined">close</span>
                            </button>
                        </div>
                        <div className="p-6 space-y-5">
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
                        <div className="p-4 border-t border-slate-200 bg-slate-50 rounded-b-2xl flex justify-end gap-2">
                            <button
                                onClick={() => setShowCoverageModal(false)}
                                className="px-4 py-2 text-slate-600 hover:bg-white hover:shadow-sm rounded-lg font-bold text-sm border border-transparent hover:border-slate-200 transition-all"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleSaveCoverage}
                                disabled={!coverageForm.name || !coverageForm.name.trim()}
                                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg font-bold text-sm shadow-sm transition-all"
                            >
                                {isEditingCoverage ? 'Guardar Cambios' : 'Crear Cobertura'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* SPECIALTIES MANAGEMENT MODAL */}
            {showSpecialtiesModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4 animate-fadeIn">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col max-h-[80vh]">
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
            )}

            {/* PROCEDURE CREATE MODAL */}
            {showProcModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4 animate-fadeIn">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col">
                        <div className="p-6 border-b border-slate-200 flex justify-between items-center bg-slate-50 rounded-t-2xl">
                            <h3 className="text-lg font-bold text-slate-900">Nuevo Tipo de Cirugía</h3>
                            <button onClick={() => setShowProcModal(false)} className="text-slate-400 hover:text-slate-600">
                                <span className="material-symbols-outlined">close</span>
                            </button>
                        </div>
                        <div className="p-6 space-y-4">
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
            )}

            {/* PROCEDURE EDIT MODAL */}
            {showEditProcModal && editingProcedure && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4 animate-fadeIn">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col">
                        <div className="p-6 border-b border-slate-200 flex justify-between items-center bg-slate-50 rounded-t-2xl">
                            <h3 className="text-lg font-bold text-slate-900">Editar Detalles de Cirugía</h3>
                            <button onClick={() => setShowEditProcModal(false)} className="text-slate-400 hover:text-slate-600">
                                <span className="material-symbols-outlined">close</span>
                            </button>
                        </div>
                        <div className="p-6 space-y-4">
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
            )}

            {/* MATERIAL ADD MODAL */}
            {showMaterialModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4 animate-fadeIn">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col">
                        <div className="p-6 border-b border-slate-200 flex justify-between items-center bg-slate-50 rounded-t-2xl">
                            <h3 className="text-lg font-bold text-slate-900">Agregar Nuevo Material</h3>
                            <button onClick={() => setShowMaterialModal(false)} className="text-slate-400 hover:text-slate-600">
                                <span className="material-symbols-outlined">close</span>
                            </button>
                        </div>
                        <div className="p-6 space-y-4">
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
            )}

            {/* OR ADD MODAL */}
            {showORModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4 animate-fadeIn">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col">
                        <div className="p-6 border-b border-slate-200 flex justify-between items-center bg-slate-50 rounded-t-2xl">
                            <h3 className="text-lg font-bold text-slate-900">
                                {isEditingOR ? 'Editar Sala de Quirófano' : 'Nueva Sala de Quirófano'}
                            </h3>
                            <button onClick={() => setShowORModal(false)} className="text-slate-400 hover:text-slate-600">
                                <span className="material-symbols-outlined">close</span>
                            </button>
                        </div>
                        <div className="p-6 space-y-4">
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
            )}
        </div>
    );
};

export default Settings;