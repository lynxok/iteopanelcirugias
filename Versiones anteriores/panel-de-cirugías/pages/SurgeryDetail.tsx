import React, { useState, useEffect } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';

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
}

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

export const SurgeryDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isNew = id === 'new';
  const [priority, setPriority] = useState<'elective' | 'urgent' | 'emergency'>('elective');
  
  // --- Clinical Data State ---
  const [surgeryDate, setSurgeryDate] = useState(isNew ? '' : "2023-10-24");
  
  // Validation Requirements State
  const [preOpExams, setPreOpExams] = useState(false);
  const [preOpDate, setPreOpDate] = useState('');
  const [consentSigned, setConsentSigned] = useState(false);

  // Role Simulation State
  const [currentUserRole, setCurrentUserRole] = useState<'SuperAdmin' | 'Ortopedia' | 'Internacion' | 'Quirofano'>('SuperAdmin');
  
  // Scheduling Approvals
  const [approvals, setApprovals] = useState({
      ortho: false,
      admission: false,
      or: false
  });

  // Materials State
  const [materials, setMaterials] = useState<SurgeryMaterial[]>([
    { id: '1', name: 'Hoja Shaver 4.5mm', quantity: 2, requestedQuantity: 2, category: 'Herramienta', isCovered: false, isConfirmed: false, observation: '' },
    { id: '2', name: 'Bomba Irrigación', quantity: 1, requestedQuantity: 1, category: 'Herramienta', isCovered: true, isConfirmed: true, observation: 'Marca alternativa autorizada' }
  ]);
  const [showMaterialModal, setShowMaterialModal] = useState(false);
  
  // Material Modal Form State
  const [selectedMaterialName, setSelectedMaterialName] = useState('');
  const [quantity, setQuantity] = useState(1);

  // Derived Status
  const isScheduled = approvals.ortho && approvals.admission && approvals.or;
  
  // Derived Helper: Check if ALL materials are confirmed
  const areAllMaterialsConfirmed = materials.length > 0 && materials.every(m => m.isConfirmed);

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
            observation: ''
        };
        // Adding new material resets global approval if active
        if (approvals.ortho) setApprovals(prev => ({ ...prev, ortho: false }));
        setMaterials([...materials, newMaterial]);
    }
    
    // Reset form
    setSelectedMaterialName('');
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


  // --- BUSINESS LOGIC FOR VALIDATION ---
  
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
  const canToggle = (type: 'ortho' | 'admission' | 'or') => {
      // 1. Check Role Permission
      let hasRole = false;
      if (currentUserRole === 'SuperAdmin') hasRole = true;
      else if (type === 'ortho' && currentUserRole === 'Ortopedia') hasRole = true;
      else if (type === 'admission' && currentUserRole === 'Internacion') hasRole = true;
      else if (type === 'or' && currentUserRole === 'Quirofano') hasRole = true;

      if (!hasRole) return false;

      // 2. Special Logic for Admission (Internación)
      if (type === 'admission') {
          if (!preOpExams) return false;
          if (!consentSigned) return false;
          if (!checkDateValidity()) return false;
      }

      // 3. Special Logic for Orthopedia
      if (type === 'ortho') {
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
    if (!surgeryDate) return "Falta: Fecha de Cirugía";
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

  return (
    <div className="flex-1 h-full overflow-y-auto bg-slate-50 p-6 pb-24 relative font-sans">
      
      {/* DEV TOOL: Role Switcher */}
      <div className="fixed bottom-4 right-4 z-50 bg-slate-800 text-white p-2 rounded-lg shadow-lg opacity-90 hover:opacity-100 transition-opacity flex items-center gap-2 text-xs border border-slate-600">
        <span className="font-bold text-amber-400">Simular Rol:</span>
        <select 
            value={currentUserRole} 
            onChange={(e) => setCurrentUserRole(e.target.value as any)}
            className="bg-slate-700 border-none rounded text-xs py-1 focus:ring-1 focus:ring-amber-400 cursor-pointer outline-none"
        >
            <option value="SuperAdmin">SuperAdmin (Todo)</option>
            <option value="Ortopedia">Usuario Ortopedia</option>
            <option value="Internacion">Usuario Internación</option>
            <option value="Quirofano">Usuario Quirófano</option>
        </select>
      </div>

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

        {/* HEADER CARD */}
        <div className="bg-white rounded-lg shadow-sm border border-slate-200 mb-8 overflow-hidden">
             <div className="flex flex-col md:flex-row md:items-center p-6 gap-6">
                {/* Avatar & Name */}
                <div className="flex items-center gap-4 min-w-[280px]">
                    <div className={`size-12 rounded-full flex items-center justify-center text-sm font-bold text-white uppercase tracking-wider ${isNew ? 'bg-slate-400' : 'bg-primary'}`}>
                        {isNew ? 'NP' : 'JP'}
                    </div>
                    <div>
                        <h1 className="text-base font-medium text-slate-900 leading-tight">
                            {isNew ? 'Nuevo Paciente' : 'Juan Pérez'}
                        </h1>
                        <p className="text-sm text-slate-500 mt-0.5">
                            {isNew ? 'ID: --' : 'juan.perez@email.com'}
                        </p>
                    </div>
                </div>

                {/* Info Columns */}
                <div className="flex-1 grid grid-cols-1 sm:grid-cols-3 gap-6 border-t md:border-t-0 md:border-l border-slate-100 pt-4 md:pt-0 md:pl-6">
                    <div>
                        <p className="text-sm font-medium text-slate-900">
                             {isNew ? 'Por definir' : 'Artroscopia de Rodilla'}
                        </p>
                        <p className="text-xs text-slate-500 mt-0.5">Procedimiento</p>
                    </div>
                    <div>
                         <p className="text-sm font-medium text-slate-900">
                            {isNew ? '--' : 'Dr. Jorge Garcia'}
                        </p>
                        <button className="text-xs text-primary hover:underline mt-0.5 flex items-center gap-1">
                            Ver opciones avanzadas
                        </button>
                    </div>
                    <div>
                        {!isNew ? (
                            <div className="flex flex-col items-start gap-1">
                                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold border transition-all duration-300 ${isScheduled ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-orange-50 text-orange-700 border-orange-200'}`}>
                                    {isScheduled ? 'Programada' : 'Pendiente Validaciones'}
                                </span>
                                <p className="text-xs text-slate-400">Estado actual</p>
                            </div>
                        ) : (
                             <span className="text-sm text-slate-400 italic">Borrador</span>
                        )}
                    </div>
                </div>

                {/* Right Actions */}
                <div className="flex items-center justify-end gap-4 ml-auto min-w-[120px] border-t md:border-t-0 md:border-l border-slate-100 pt-4 md:pt-0 md:pl-6">
                     <button className="text-sm font-medium text-primary hover:text-primary-hover">
                        Detalles
                     </button>
                     <button className="size-8 flex items-center justify-center rounded border border-slate-200 text-slate-500 hover:bg-slate-50 transition-colors">
                        <span className="material-symbols-outlined text-lg">more_horiz</span>
                    </button>
                </div>
             </div>

             {/* Footer Bar for Priority */}
             <div className="bg-slate-50 border-t border-slate-200 px-6 py-2 flex items-center gap-4 text-xs">
                <span className="font-semibold text-slate-500">Prioridad:</span>
                 <div className="flex gap-2">
                    <button onClick={() => setPriority('elective')} className={`px-2 py-0.5 rounded transition-colors ${priority === 'elective' ? 'bg-white text-slate-900 font-medium shadow-sm border border-slate-200' : 'text-slate-500 hover:text-slate-700'}`}>Programada</button>
                    <button onClick={() => setPriority('urgent')} className={`px-2 py-0.5 rounded transition-colors ${priority === 'urgent' ? 'bg-orange-50 text-orange-700 font-medium border border-orange-100' : 'text-slate-500 hover:text-slate-700'}`}>Urgencia</button>
                    <button onClick={() => setPriority('emergency')} className={`px-2 py-0.5 rounded transition-colors ${priority === 'emergency' ? 'bg-red-50 text-red-700 font-medium border border-red-100' : 'text-slate-500 hover:text-slate-700'}`}>Emergencia</button>
                </div>
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
                        {isNew && <span className="text-xs font-medium text-primary cursor-pointer hover:underline">+ Crear Paciente</span>}
                    </div>
                    <div className="p-6">
                         {isNew && (
                            <div className="mb-6">
                                <label className="block text-xs font-semibold text-slate-500 mb-2">Buscar Paciente Existente</label>
                                <div className="relative">
                                    <span className="material-symbols-outlined absolute left-3 top-2.5 text-slate-400 text-lg">search</span>
                                    <input 
                                        type="text" 
                                        className="w-full pl-9 pr-4 py-2 rounded border border-slate-300 focus:border-primary focus:ring-1 focus:ring-primary text-sm transition-all outline-none" 
                                        placeholder="Ingrese Nombre, Cédula o Historia Clínica..."
                                    />
                                </div>
                            </div>
                        )}

                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
                            <div className="lg:col-span-2">
                                <label className="block text-xs font-semibold text-slate-500 mb-1.5">Nombre Completo</label>
                                <input className="w-full rounded border border-slate-200 bg-slate-50 text-slate-900 focus:border-primary focus:ring-1 focus:ring-primary text-sm px-3 py-2" type="text" defaultValue={isNew ? '' : "Juan Pérez"} placeholder="Nombre del paciente"/>
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-slate-500 mb-1.5">Historia Clínica</label>
                                <input className="w-full rounded border border-slate-200 bg-slate-50 text-slate-900 focus:border-primary focus:ring-1 focus:ring-primary text-sm px-3 py-2" type="text" defaultValue={isNew ? '' : "84920"} placeholder="Nº HC"/>
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-slate-500 mb-1.5">Cédula</label>
                                <input className="w-full rounded border border-slate-200 bg-slate-50 text-slate-900 focus:border-primary focus:ring-1 focus:ring-primary text-sm px-3 py-2" type="text" defaultValue={isNew ? '' : "12345678"} placeholder="ID #"/>
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-slate-500 mb-1.5">Fecha Nacimiento</label>
                                <div className="relative">
                                    <input 
                                        className="w-full rounded border border-slate-200 bg-slate-50 text-slate-900 focus:border-primary focus:ring-1 focus:ring-primary text-sm px-3 py-2 pr-10 [&::-webkit-calendar-picker-indicator]:opacity-0 [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:right-0 [&::-webkit-calendar-picker-indicator]:w-full [&::-webkit-calendar-picker-indicator]:h-full cursor-pointer" 
                                        type="date" 
                                        defaultValue={isNew ? '' : "1978-05-20"}
                                    />
                                    <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none text-lg">calendar_today</span>
                                </div>
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-slate-500 mb-1.5">Edad</label>
                                <input className="w-full rounded border border-slate-200 bg-slate-100 text-slate-500 text-sm font-medium px-3 py-2" readOnly type="text" defaultValue={isNew ? '' : "45"} placeholder="--"/>
                            </div>
                            <div className="lg:col-span-2 flex flex-col justify-end pb-1">
                                {/* Custom Checkbox for Pre-op Exams */}
                                <label className="flex items-center gap-2 cursor-pointer mb-3 group select-none">
                                    <div className="relative">
                                        <input 
                                            type="checkbox" 
                                            className="peer sr-only"
                                            checked={preOpExams}
                                            onChange={(e) => setPreOpExams(e.target.checked)}
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
                                                className="w-full rounded border border-slate-200 bg-white text-slate-900 focus:border-primary focus:ring-1 focus:ring-primary text-xs px-2 py-1.5 pr-8 [&::-webkit-calendar-picker-indicator]:opacity-0 [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:right-0 [&::-webkit-calendar-picker-indicator]:w-full [&::-webkit-calendar-picker-indicator]:h-full cursor-pointer"
                                            />
                                            <span className="material-symbols-outlined absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none text-base">calendar_today</span>
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
                     <div className="px-6 py-4 border-b border-slate-100">
                        <h3 className="text-sm font-bold text-slate-900">Detalles Clínicos</h3>
                    </div>
                    <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="md:col-span-2">
                            <label className="block text-xs font-semibold text-slate-500 mb-1.5">Procedimiento Principal</label>
                            <select 
                                className="w-full rounded border border-slate-200 bg-white text-slate-900 focus:border-primary focus:ring-1 focus:ring-primary px-3 py-2 text-sm"
                                defaultValue={!isNew ? "Artroscopia de Rodilla" : ""}
                            >
                                <option value="">Seleccionar procedimiento...</option>
                                <option value="Artroscopia de Rodilla">Artroscopia de Rodilla</option>
                                <option value="Reemplazo Total de Cadera">Reemplazo Total de Cadera</option>
                                <option value="Colecistectomía Laparoscópica">Colecistectomía Laparoscópica</option>
                                <option value="Hernioplastia Inguinal">Hernioplastia Inguinal</option>
                            </select>
                        </div>
                        <div className="md:col-span-2">
                            <label className="block text-xs font-semibold text-slate-500 mb-1.5">Diagnóstico (CIE-10)</label>
                            <input className="w-full rounded border border-slate-200 bg-white text-slate-900 focus:border-primary focus:ring-1 focus:ring-primary text-sm px-3 py-2" type="text" placeholder="Ej: M17.0 Gonartrosis primaria bilateral"/>
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-slate-500 mb-1.5">Cirujano Principal</label>
                            <div className="relative">
                                <select 
                                    className="w-full rounded border border-slate-200 bg-white text-slate-900 focus:border-primary focus:ring-1 focus:ring-primary px-3 py-2 text-sm appearance-none"
                                    defaultValue={!isNew ? "Dra. Sarah Smith" : ""}
                                >
                                    <option value="">Seleccionar Cirujano...</option>
                                    <option value="Dra. Sarah Smith">Dra. Sarah Smith</option>
                                    <option value="Dr. Jorge Garcia">Dr. Jorge Garcia</option>
                                </select>
                                <span className="material-symbols-outlined absolute right-3 top-2.5 text-slate-400 pointer-events-none text-lg">arrow_drop_down</span>
                            </div>
                        </div>
                         <div>
                            <label className="block text-xs font-semibold text-slate-500 mb-1.5">Lateralidad</label>
                            <div className="flex gap-2">
                                <label className="flex-1 text-center py-2 border border-slate-200 rounded text-sm font-medium text-slate-600 hover:bg-slate-50 cursor-pointer has-[:checked]:bg-blue-50 has-[:checked]:text-blue-700 has-[:checked]:border-blue-200 transition-colors">
                                    <input type="radio" name="side" className="hidden"/> Izq
                                </label>
                                <label className="flex-1 text-center py-2 border border-slate-200 rounded text-sm font-medium text-slate-600 hover:bg-slate-50 cursor-pointer has-[:checked]:bg-blue-50 has-[:checked]:text-blue-700 has-[:checked]:border-blue-200 transition-colors">
                                    <input type="radio" name="side" className="hidden"/> Der
                                </label>
                                <label className="flex-1 text-center py-2 border border-slate-200 rounded text-sm font-medium text-slate-600 hover:bg-slate-50 cursor-pointer has-[:checked]:bg-blue-50 has-[:checked]:text-blue-700 has-[:checked]:border-blue-200 transition-colors">
                                    <input type="radio" name="side" className="hidden"/> Bilateral
                                </label>
                            </div>
                        </div>
                        <div className="md:col-span-2">
                             <label className="block text-xs font-semibold text-slate-500 mb-1.5">Notas Pre-operatorias</label>
                            <textarea className="w-full rounded border border-slate-200 bg-white text-slate-900 focus:border-primary focus:ring-1 focus:ring-primary text-sm px-3 py-2" rows={3} defaultValue={isNew ? '' : "Paciente con historial de hipertensión controlada."} placeholder="Alergias, comorbilidades, requerimientos especiales..."></textarea>
                        </div>
                    </div>
                </section>
            </div>

            {/* RIGHT: Logistics (4 cols) */}
            <div className="xl:col-span-4 flex flex-col gap-6">
                
                {/* Section 3: Logistics */}
                <section className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden h-fit">
                    <div className="px-6 py-4 border-b border-slate-100">
                        <h3 className="text-sm font-bold text-slate-900">Programación</h3>
                    </div>
                    <div className="p-5 flex flex-col gap-5">
                        <div>
                            <label className="block text-xs font-semibold text-slate-500 mb-1.5">Fecha Propuesta</label>
                            <div className="relative">
                                <input 
                                    className="w-full rounded border border-slate-200 bg-white text-slate-900 focus:border-primary focus:ring-1 focus:ring-primary px-3 py-2 text-sm pr-10 [&::-webkit-calendar-picker-indicator]:opacity-0 [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:right-0 [&::-webkit-calendar-picker-indicator]:w-full [&::-webkit-calendar-picker-indicator]:h-full cursor-pointer" 
                                    type="date" 
                                    value={surgeryDate}
                                    onChange={(e) => setSurgeryDate(e.target.value)}
                                />
                                <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none text-lg">calendar_today</span>
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-semibold text-slate-500 mb-1.5">Hora Inicio</label>
                                <input className="w-full rounded border border-slate-200 bg-white text-slate-900 focus:border-primary focus:ring-1 focus:ring-primary px-3 py-2 text-sm" type="time" defaultValue={isNew ? '' : "08:00"}/>
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-slate-500 mb-1.5">Duración Est.</label>
                                <div className="relative">
                                    <input className="w-full rounded border border-slate-200 bg-white text-slate-900 focus:border-primary focus:ring-1 focus:ring-primary pl-3 pr-10 py-2 text-sm" type="number" placeholder="min"/>
                                    <span className="absolute right-3 top-2 text-xs text-slate-400 font-bold pointer-events-none">MIN</span>
                                </div>
                            </div>
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-slate-500 mb-1.5">Quirófano</label>
                            <div className="relative">
                                <select 
                                    className="w-full rounded border border-slate-200 bg-white text-slate-900 focus:border-primary focus:ring-1 focus:ring-primary px-3 py-2 text-sm appearance-none"
                                    defaultValue={!isNew ? "302" : ""}
                                >
                                    <option value="">Por asignar...</option>
                                    <option value="301">Qx 301 (General)</option>
                                    <option value="302">Qx 302 (Orto)</option>
                                    <option value="303">Qx 303 (Amb)</option>
                                </select>
                                <span className="material-symbols-outlined absolute right-3 top-2.5 text-slate-400 pointer-events-none text-lg">arrow_drop_down</span>
                            </div>
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-slate-500 mb-1.5">Anestesia</label>
                            <div className="relative">
                                <select className="w-full rounded border border-slate-200 bg-white text-slate-900 focus:border-primary focus:ring-1 focus:ring-primary px-3 py-2 text-sm appearance-none">
                                    <option value="">Seleccionar...</option>
                                    <option>General</option>
                                    <option>Raquídea</option>
                                    <option>Local + Sedación</option>
                                </select>
                                <span className="material-symbols-outlined absolute right-3 top-2.5 text-slate-400 pointer-events-none text-lg">arrow_drop_down</span>
                            </div>
                        </div>

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
                                                onChange={() => canToggle('ortho') && setApprovals({...approvals, ortho: !approvals.ortho})}
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
                                            <p className="text-[10px] text-slate-500 leading-tight">Materiales Ok</p>
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

                             {/* Internacion Checkbox */}
                             <label className={`flex flex-col p-3 rounded border transition-colors cursor-pointer ${approvals.admission ? 'bg-green-50 border-green-200' : 'bg-slate-50 border-slate-200'} ${!canToggle('admission') ? 'opacity-50 cursor-not-allowed' : ''}`}>
                                <div className="flex items-center justify-between w-full pointer-events-none">
                                    <div className="flex items-center gap-3">
                                        <div className="relative">
                                            <input 
                                                type="checkbox" 
                                                className="peer sr-only"
                                                checked={approvals.admission}
                                                onChange={() => canToggle('admission') && setApprovals({...approvals, admission: !approvals.admission})}
                                                disabled={!canToggle('admission')}
                                            />
                                            <div className={`size-5 bg-white border-2 rounded flex items-center justify-center transition-all peer-checked:[&_span]:opacity-100 peer-checked:[&_span]:scale-100
                                                ${!canToggle('admission') ? 'border-slate-200' : 'border-slate-300 peer-checked:border-primary'}
                                            `}>
                                                <span className="material-symbols-outlined text-base text-primary opacity-0 transform scale-50 transition-all font-bold">check</span>
                                            </div>
                                        </div>
                                        <div>
                                            <p className={`text-sm font-bold ${approvals.admission ? 'text-green-800' : 'text-slate-700'}`}>Validación Internación</p>
                                            <p className="text-[10px] text-slate-500 leading-tight">Cama Asignada</p>
                                        </div>
                                    </div>
                                    {!canToggle('admission') && !approvals.admission && (
                                        <span className={`text-[10px] px-2 py-1 rounded ${currentUserRole === 'Internacion' || currentUserRole === 'SuperAdmin' ? 'bg-red-50 text-red-600 font-bold' : 'bg-slate-200 text-slate-500'}`}>
                                            {currentUserRole === 'Internacion' || currentUserRole === 'SuperAdmin' ? 'Incompleto' : 'Solo Intern.'}
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

                             {/* Quirofano Checkbox */}
                             <label className={`flex items-center justify-between p-3 rounded border transition-colors cursor-pointer ${approvals.or ? 'bg-green-50 border-green-200' : 'bg-slate-50 border-slate-200'} ${!canToggle('or') ? 'opacity-50 cursor-not-allowed' : ''}`}>
                                <div className="flex items-center gap-3 pointer-events-none">
                                     <div className="relative">
                                        <input 
                                            type="checkbox" 
                                            className="peer sr-only"
                                            checked={approvals.or}
                                            onChange={() => canToggle('or') && setApprovals({...approvals, or: !approvals.or})}
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
                                        <p className="text-[10px] text-slate-500 leading-tight">Sala Lista</p>
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
            <div className={`px-6 py-4 border-b flex justify-between items-center ${isNew ? 'border-slate-200' : 'border-slate-100'}`}>
                <h3 className={`text-sm font-bold ${isNew ? 'text-slate-400' : 'text-slate-900'}`}>
                    Gestión de Materiales y Equipamiento
                </h3>
            </div>
            
            {!isNew ? (
                <div className="p-5 flex-1 flex flex-col gap-4">
                        <div className="bg-blue-50 border border-blue-100 p-3 rounded flex items-center gap-2">
                        <span className="material-symbols-outlined text-primary text-sm">auto_awesome</span>
                        <p className="text-xs text-blue-700 font-medium">Sugerencia Automática: Kit de Artroscopia Std</p>
                    </div>
                    
                    {/* Materials Table with Role-Based Logic */}
                    <div className="bg-white rounded border border-slate-200 overflow-hidden">
                        <table className="w-full text-xs text-left">
                            <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200">
                                <tr>
                                    <th className="px-4 py-3">Ítem / Material</th>
                                    <th className="px-4 py-3 text-center w-24">Solicitado</th>
                                    <th className="px-4 py-3 text-center w-24">Provisión</th>
                                    {/* Ortho Columns */}
                                    {(currentUserRole === 'Ortopedia' || currentUserRole === 'SuperAdmin') && (
                                        <>
                                            <th className="px-4 py-3 text-center w-16" title="Disponibilidad">Disp.</th>
                                            <th className="px-4 py-3">Observaciones</th>
                                            <th className="px-4 py-3 text-center w-16" title="Validación Final">Val.</th>
                                        </>
                                    )}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {materials.map(mat => {
                                    const hasDiscrepancy = mat.quantity !== mat.requestedQuantity;
                                    
                                    return (
                                        <tr key={mat.id} className="hover:bg-slate-50">
                                            <td className="px-4 py-3">
                                                <span className="text-slate-700 font-bold block">{mat.name}</span>
                                                <span className="text-[10px] text-slate-400">{mat.category}</span>
                                                {/* Show visual indicator of status for non-ortho roles */}
                                                {!(currentUserRole === 'Ortopedia' || currentUserRole === 'SuperAdmin') && mat.observation && (
                                                    <div className="text-[10px] text-amber-600 italic mt-1 bg-amber-50 px-2 py-1 rounded w-fit">
                                                        <span className="font-bold">Obs:</span> {mat.observation}
                                                    </div>
                                                )}
                                            </td>
                                            <td className="px-4 py-3 text-center">
                                                <span className="text-slate-500 font-medium">{mat.requestedQuantity}</span>
                                            </td>
                                            <td className="px-4 py-3 text-center">
                                                {(currentUserRole === 'Ortopedia' || currentUserRole === 'SuperAdmin') ? (
                                                    <div className={`flex items-center justify-center gap-1 p-1 rounded ${hasDiscrepancy ? 'bg-amber-100' : ''}`}>
                                                        <button 
                                                            onClick={() => handleUpdateQuantity(mat.id, mat.quantity - 1)}
                                                            className="text-slate-400 hover:text-slate-600 font-bold size-5 flex items-center justify-center rounded hover:bg-black/5 transition-colors"
                                                        >
                                                            -
                                                        </button>
                                                        <span className={`w-6 text-center font-bold ${hasDiscrepancy ? 'text-amber-700' : 'text-slate-700'}`}>
                                                            {mat.quantity}
                                                        </span>
                                                        <button 
                                                            onClick={() => handleUpdateQuantity(mat.id, mat.quantity + 1)}
                                                            className="text-slate-400 hover:text-slate-600 font-bold size-5 flex items-center justify-center rounded hover:bg-black/5 transition-colors"
                                                        >
                                                            +
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <span className={`font-bold ${hasDiscrepancy ? 'text-amber-600' : 'text-slate-900'}`}>
                                                        {mat.quantity}
                                                    </span>
                                                )}
                                                {hasDiscrepancy && (
                                                    <span className="block text-[9px] text-amber-600 font-bold mt-0.5">Modificado</span>
                                                )}
                                            </td>
                                            
                                            {/* ORTHOPEDICS INTERACTIVE COLUMNS */}
                                            {(currentUserRole === 'Ortopedia' || currentUserRole === 'SuperAdmin') && (
                                                <>
                                                    <td className="px-4 py-3 text-center align-middle">
                                                        <input 
                                                            type="checkbox" 
                                                            checked={mat.isCovered || false}
                                                            onChange={() => toggleCovered(mat.id)}
                                                            className="rounded border-slate-300 text-primary focus:ring-primary size-4 cursor-pointer"
                                                            title="Material Cubierto / Disponible"
                                                        />
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        <input 
                                                            type="text" 
                                                            value={mat.observation || ''}
                                                            onChange={(e) => updateObservation(mat.id, e.target.value)}
                                                            placeholder={hasDiscrepancy ? "Motivo del cambio..." : "Observaciones..."}
                                                            className={`w-full text-xs bg-transparent border rounded px-2 py-1.5 transition-colors ${
                                                                hasDiscrepancy && !mat.observation 
                                                                ? 'border-amber-300 bg-amber-50 focus:bg-white text-amber-900 placeholder-amber-400 ring-1 ring-amber-200' 
                                                                : mat.observation 
                                                                    ? 'border-amber-200 bg-amber-50 text-amber-800' 
                                                                    : 'border-slate-200 text-slate-600 focus:border-primary'
                                                            } focus:outline-none`}
                                                        />
                                                    </td>
                                                    <td className="px-4 py-3 text-center align-middle">
                                                        <input 
                                                            type="checkbox" 
                                                            checked={mat.isConfirmed || false}
                                                            onChange={() => toggleConfirmed(mat.id)}
                                                            disabled={!mat.isCovered} // Can't confirm if not covered first
                                                            className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 size-4 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                                                            title="Reconfirmar para cirugía"
                                                        />
                                                    </td>
                                                </>
                                            )}
                                        </tr>
                                    );
                                })}
                                {materials.length === 0 && (
                                    <tr>
                                        <td colSpan={(currentUserRole === 'Ortopedia' || currentUserRole === 'SuperAdmin') ? 6 : 3} className="px-3 py-8 text-center text-slate-400 italic">
                                            No hay materiales asignados a esta cirugía.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                    
                    {/* Legend for Ortho User */}
                    {(currentUserRole === 'Ortopedia' || currentUserRole === 'SuperAdmin') && (
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
                        className="mt-2 w-full py-3 border-2 border-dashed border-slate-200 text-slate-500 rounded-lg text-sm font-bold hover:border-primary hover:text-primary hover:bg-slate-50 transition-all flex items-center justify-center gap-2"
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
                    <h4 className="text-slate-600 font-bold text-base mb-1">Sección Bloqueada</h4>
                    <p className="text-sm max-w-[300px]">Guarde los detalles clínicos y de programación para habilitar la solicitud de materiales.</p>
                </div>
            )}
        </section>

       {/* Sticky Bottom Actions */}
       <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 p-4 z-20 md:ml-64 shadow-[0_-5px_20px_-5px_rgba(0,0,0,0.05)]">
            <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
                <button className="hidden md:flex items-center gap-2 px-4 py-2 text-slate-500 hover:text-slate-900 rounded transition-colors font-medium text-sm">
                    Cancelar
                </button>
                <div className="flex items-center gap-3 ml-auto">
                    <button className="px-5 py-2 rounded border border-slate-300 text-slate-700 font-bold text-sm hover:bg-slate-50 transition-colors shadow-sm">
                        {isNew ? 'Guardar Borrador' : 'Descartar Cambios'}
                    </button>
                    <button className={`px-6 py-2 rounded text-white font-bold text-sm shadow-sm transition-all flex items-center gap-2 ${priority === 'emergency' ? 'bg-red-600 hover:bg-red-700' : 'bg-primary hover:bg-primary-hover'}`}>
                        {isNew ? 'Crear Solicitud' : 'Guardar Cambios'}
                    </button>
                </div>
            </div>
       </div>

       {/* Materials Modal (Cart) */}
       {showMaterialModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4 animate-fadeIn">
            <div className="bg-white rounded-lg shadow-2xl w-full max-w-lg flex flex-col max-h-[90vh]">
                <div className="p-5 border-b border-slate-200 flex justify-between items-center">
                    <h3 className="text-base font-bold text-slate-900">
                        Gestión de Materiales
                    </h3>
                    <button 
                        onClick={() => setShowMaterialModal(false)}
                        className="text-slate-400 hover:text-slate-600 transition-colors"
                    >
                        <span className="material-symbols-outlined">close</span>
                    </button>
                </div>
                
                <div className="p-5 overflow-y-auto flex-1">
                    {/* Current List */}
                    <h4 className="text-xs font-bold text-slate-500 uppercase mb-3">Materiales Asignados</h4>
                    <div className="space-y-2 mb-6">
                        {materials.map(mat => (
                            <div key={mat.id} className="flex items-center justify-between p-3 bg-slate-50 border border-slate-200 rounded group">
                                <div>
                                    <p className="text-sm font-bold text-slate-900">{mat.name}</p>
                                    <span className={`text-[10px] uppercase font-bold px-1.5 py-0.5 rounded border bg-slate-100 text-slate-600 border-slate-200`}>
                                        {mat.category}
                                    </span>
                                </div>
                                <div className="flex items-center gap-4">
                                     <div className="flex items-center rounded border border-slate-200 bg-white">
                                        <button 
                                            onClick={() => handleUpdateQuantity(mat.id, mat.quantity - 1)}
                                            className="px-2 py-1 text-slate-500 hover:bg-slate-50 hover:text-slate-700 transition-colors border-r border-slate-200 font-bold"
                                            title="Reducir"
                                        >
                                            -
                                        </button>
                                        <span className="w-8 text-center text-sm font-mono font-bold text-slate-700">{mat.quantity}</span>
                                        <button 
                                            onClick={() => handleUpdateQuantity(mat.id, mat.quantity + 1)}
                                            className="px-2 py-1 text-slate-500 hover:bg-slate-50 hover:text-slate-700 transition-colors border-l border-slate-200 font-bold"
                                            title="Aumentar"
                                        >
                                            +
                                        </button>
                                    </div>
                                    <button 
                                        onClick={() => handleRemoveMaterial(mat.id)}
                                        className="text-slate-400 hover:text-red-500 transition-colors p-1"
                                        title="Eliminar"
                                    >
                                        <span className="material-symbols-outlined text-lg">delete</span>
                                    </button>
                                </div>
                            </div>
                        ))}
                        {materials.length === 0 && (
                            <div className="text-center py-6 border-2 border-dashed border-slate-200 rounded">
                                <p className="text-slate-400 text-sm">El carrito está vacío</p>
                            </div>
                        )}
                    </div>

                    {/* Add New */}
                    <div className="bg-slate-50 p-4 rounded border border-slate-200">
                        <h4 className="text-xs font-bold text-slate-500 uppercase mb-3">Agregar Item</h4>
                        <div className="flex gap-3">
                            <div className="flex-1">
                                <select 
                                    className="w-full rounded border-slate-300 text-sm py-2 px-3 focus:ring-2 focus:ring-primary focus:border-primary"
                                    value={selectedMaterialName}
                                    onChange={(e) => setSelectedMaterialName(e.target.value)}
                                >
                                    <option value="">Seleccionar material...</option>
                                    {AVAILABLE_MATERIALS.map(m => (
                                        <option key={m.name} value={m.name}>{m.name}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="w-20">
                                <input 
                                    type="number" 
                                    min="1" 
                                    className="w-full rounded border-slate-300 text-sm py-2 px-3 text-center focus:ring-2 focus:ring-primary focus:border-primary"
                                    value={quantity}
                                    onChange={(e) => setQuantity(parseInt(e.target.value))}
                                />
                            </div>
                            <button 
                                onClick={handleAddMaterial}
                                disabled={!selectedMaterialName}
                                className="bg-primary hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed text-white rounded px-4 flex items-center justify-center transition-colors"
                            >
                                <span className="material-symbols-outlined">add</span>
                            </button>
                        </div>
                    </div>
                </div>

                <div className="p-5 border-t border-slate-200 bg-slate-50 rounded-b-lg flex justify-end gap-3">
                    <button 
                        onClick={() => setShowMaterialModal(false)}
                        className="px-4 py-2 text-slate-600 hover:bg-white hover:shadow-sm rounded font-bold text-sm border border-transparent hover:border-slate-200 transition-all"
                    >
                        Cerrar
                    </button>
                    <button 
                        onClick={() => setShowMaterialModal(false)}
                        className="px-6 py-2 bg-primary text-white rounded font-bold text-sm shadow-sm hover:bg-primary-hover transition-all"
                    >
                        Guardar Cambios
                    </button>
                </div>
            </div>
        </div>
       )}
    </div>
  );
};