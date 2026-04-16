import React, { useState, useEffect } from 'react';
import { supabase } from '../src/lib/supabase';
import { useAuth } from '../src/lib/AuthContext';
import { HospitalAdmission, HospitalMedicationPlan, HospitalMedicationLog, CatalogItem, Surgery } from '../types';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

const DoctorPanel: React.FC = () => {
    const { user } = useAuth();
    const [activeTab, setActiveTab] = useState<'patients' | 'upcoming' | 'history'>('patients');
    const [loading, setLoading] = useState(true);
    const [selectedDoctorId, setSelectedDoctorId] = useState<string | null>(user?.doctorId || null);
    const [allDoctors, setAllDoctors] = useState<{id: string, full_name: string}[]>([]);
    
    // Data states
    const [myAdmissions, setMyAdmissions] = useState<(HospitalAdmission & { bed_code?: string })[]>([]);
    const [upcomingSurgeries, setUpcomingSurgeries] = useState<Surgery[]>([]);
    const [pastSurgeries, setPastSurgeries] = useState<Surgery[]>([]);
    const [medications, setMedications] = useState<CatalogItem[]>([]);
    
    // UI states
    const [selectedAdmission, setSelectedAdmission] = useState<(HospitalAdmission & { bed_code?: string }) | null>(null);
    const [medPlans, setMedPlans] = useState<HospitalMedicationPlan[]>([]);
    const [medLogs, setMedLogs] = useState<HospitalMedicationLog[]>([]);
    const [showScheduleForm, setShowScheduleForm] = useState(false);
    const [newPlan, setNewPlan] = useState({ name: '', dose: '', unit: 'mg', frequency: '8', start_time: '', days: '' });
    
    // Discharge states
    const [showDischargeForm, setShowDischargeForm] = useState(false);
    const [dischargeDate, setDischargeDate] = useState(new Date().toISOString().split('T')[0]);
    const [dischargeTime, setDischargeTime] = useState('10:00');

    useEffect(() => {
        if (user?.role === 'SuperAdmin') {
            fetchAllDoctors();
        }
    }, [user]);

    useEffect(() => {
        if (selectedDoctorId) {
            fetchInitialData();
        } else {
            setLoading(false);
        }
    }, [selectedDoctorId]);

    const fetchAllDoctors = async () => {
        const { data } = await supabase.from('doctors').select('id, full_name').eq('active', true).order('full_name');
        if (data) setAllDoctors(data);
    };

    const fetchInitialData = async () => {
        setLoading(true);
        try {
            // 1. Fetch Admissions (Patients)
            const { data: admData } = await supabase
                .from('hospital_admissions')
                .select(`
                    *,
                    patient:patient_id (*),
                    bed:bed_id (bed_code)
                `)
                .eq('doctor_id', selectedDoctorId)
                .is('check_out', null);

            if (admData) {
                setMyAdmissions(admData.map(a => ({
                    ...a,
                    bed_code: a.bed?.bed_code
                })));
            }

            // 2. Fetch Surgeries
            const { data: surgData } = await supabase
                .from('surgeries')
                .select('*, patient:patient_id(*)')
                .eq('doctor_id', selectedDoctorId)
                .order('surgery_date', { ascending: true });

            if (surgData) {
                const today = new Date().toISOString().split('T')[0];
                setUpcomingSurgeries(surgData.filter(s => s.surgery_date >= today && s.status !== 'completed' && s.status !== 'cancelled'));
                setPastSurgeries(surgData.filter(s => s.surgery_date < today || s.status === 'completed' || s.status === 'cancelled').reverse());
            }

            // 3. Fetch Medications catalog
            const { data: medsData } = await supabase
                .from('catalog_items')
                .select('*')
                .eq('category', 'medication')
                .eq('active', true)
                .order('name');
            if (medsData) setMedications(medsData);

        } catch (error) {
            console.error('Error fetching doctor data:', error);
        } finally {
            setLoading(false);
        }
    };

    const fetchPatientClinicalData = async (admissionId: string) => {
        const { data: plans } = await supabase
            .from('hospital_medication_plans')
            .select('*')
            .eq('admission_id', admissionId)
            .eq('active', true);
        
        const { data: logs } = await supabase
            .from('hospital_medication_logs')
            .select('*')
            .eq('admission_id', admissionId)
            .order('administered_at', { ascending: false });

        if (plans) setMedPlans(plans);
        if (logs) setMedLogs(logs);
    };

    const handleSelectAdmission = (adm: any) => {
        setSelectedAdmission(adm);
        fetchPatientClinicalData(adm.id);
        setShowScheduleForm(false);
        setShowDischargeForm(false);
    };

    const handleMedicalDischarge = async () => {
        if (!selectedAdmission || !window.confirm('¿Confirmar Alta Médica? El paciente quedará en espera de que enfermería libere la cama.')) return;
        
        setLoading(true);
        try {
            const now = new Date().toISOString();
            
            // 1. Update Admission: Solo marcar como listo para el alta (Alta Médica)
            const { error: admError } = await supabase
                .from('hospital_admissions')
                .update({ ready_at: now })
                .eq('id', selectedAdmission.id);
            
            if (admError) throw admError;

            // Ya no se actualiza el estado de la cama ni el check_out aquí.
            // Eso lo hará enfermería desde su panel.

            setSelectedAdmission(null);
            fetchInitialData();
            alert('Alta Médica registrada exitosamente. Queda pendiente la liberación física de la cama por enfermería.');
        } catch (err: any) {
            alert('Error al procesar el alta médica: ' + err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleRevokeMedicalDischarge = async () => {
        if (!selectedAdmission || !window.confirm('¿Está seguro de revocar el alta médica de este paciente? El aviso desaparecerá del panel de enfermería.')) return;
        
        setLoading(true);
        try {
            const { error } = await supabase
                .from('hospital_admissions')
                .update({ ready_at: null })
                .eq('id', selectedAdmission.id);
            
            if (error) throw error;

            setSelectedAdmission(null);
            fetchInitialData();
            alert('Alta Médica revocada exitosamente.');
        } catch (err: any) {
            alert('Error al revocar el alta médica: ' + err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleScheduleDischarge = async () => {
        if (!selectedAdmission || !dischargeDate || !dischargeTime) return;

        const estDischarge = new Date(`${dischargeDate}T${dischargeTime}:00`).toISOString();
        
        const { error } = await supabase
            .from('hospital_admissions')
            .update({ est_discharge: estDischarge })
            .eq('id', selectedAdmission.id);

        if (error) alert('Error al programar alta');
        else {
            setShowDischargeForm(false);
            fetchInitialData();
            // Refresh local state too
            setSelectedAdmission({ ...selectedAdmission, est_discharge: estDischarge });
            alert('Alta programada exitosamente.');
        }
    };

    const handleRevokeScheduledDischarge = async () => {
        if (!selectedAdmission || !window.confirm('¿Está seguro de revocar la programación del alta?')) return;
        
        setLoading(true);
        try {
            const { error } = await supabase
                .from('hospital_admissions')
                .update({ est_discharge: null })
                .eq('id', selectedAdmission.id);
            
            if (error) throw error;

            setSelectedAdmission({ ...selectedAdmission, est_discharge: null });
            fetchInitialData();
            alert('Programación de alta revocada exitosamente.');
        } catch (err: any) {
            alert('Error al revocar la programación: ' + err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleAddPlan = async () => {
        if (!selectedAdmission || !newPlan.name || !newPlan.dose || !newPlan.start_time) return;

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
            admission_id: selectedAdmission.id,
            medication_name: newPlan.name,
            drug_name: selectedMedItem?.drug_name || newPlan.name,
            dose: parseFloat(newPlan.dose),
            unit: newPlan.unit,
            frequency_hours: parseInt(newPlan.frequency),
            next_dose_at: sd.toISOString(),
            ends_at: endsAt ? endsAt.toISOString() : null,
            created_by: user?.name
        });

        if (error) alert('Error al crear plan');
        else {
            setNewPlan({ name: '', dose: '', unit: 'mg', frequency: '8', start_time: '', days: '' });
            setShowScheduleForm(false);
            fetchPatientClinicalData(selectedAdmission.id);
        }
    };

    const togglePlanStatus = async (planId: string, currentActive: boolean) => {
        const { error } = await supabase
            .from('hospital_medication_plans')
            .update({ active: !currentActive })
            .eq('id', planId);
        
        if (!error && selectedAdmission) fetchPatientClinicalData(selectedAdmission.id);
    };

    if (loading) return (
        <div className="h-full w-full flex items-center justify-center bg-slate-50">
            <div className="size-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin"></div>
        </div>
    );

    return (
        <div className="flex flex-col h-full bg-slate-50 overflow-hidden">
            {/* Header */}
            <div className="bg-white border-b border-slate-200 px-4 md:px-8 py-4 md:py-6 flex flex-col gap-4">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
                    <div>
                        <h1 className="text-xl md:text-2xl font-black text-slate-900 tracking-tight">Panel Médico</h1>
                        <p className="text-slate-500 text-xs md:text-sm">Bienvenido, <span className="font-bold text-primary">{user?.name}</span></p>
                    </div>
                    {user?.role === 'SuperAdmin' && (
                        <div className="flex items-center gap-3 bg-slate-100 p-2 rounded-2xl border border-slate-200 w-full md:w-auto">
                            <span className="material-symbols-outlined text-slate-400">person_search</span>
                            <select 
                                value={selectedDoctorId || ''} 
                                onChange={e => setSelectedDoctorId(e.target.value)}
                                className="bg-transparent border-none text-[11px] font-black text-slate-700 outline-none pr-8 cursor-pointer flex-1 md:flex-none"
                            >
                                <option value="">Seleccionar Médico...</option>
                                {allDoctors.map(d => (
                                    <option key={d.id} value={d.id}>{d.full_name}</option>
                                ))}
                            </select>
                        </div>
                    )}
                </div>

                {/* Tabs */}
                <div className="flex gap-1 bg-slate-100 p-1 rounded-xl w-full md:w-fit overflow-x-auto no-scrollbar">
                    <button 
                        onClick={() => setActiveTab('patients')}
                        className={`flex-1 md:flex-none px-4 md:px-6 py-2 rounded-lg text-[10px] md:text-xs font-black transition-all whitespace-nowrap ${activeTab === 'patients' ? 'bg-white text-primary shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                        MIS PACIENTES ({myAdmissions.length})
                    </button>
                    <button 
                        onClick={() => setActiveTab('upcoming')}
                        className={`flex-1 md:flex-none px-4 md:px-6 py-2 rounded-lg text-[10px] md:text-xs font-black transition-all whitespace-nowrap ${activeTab === 'upcoming' ? 'bg-white text-primary shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                        AGENDA ({upcomingSurgeries.length})
                    </button>
                    <button 
                        onClick={() => setActiveTab('history')}
                        className={`flex-1 md:flex-none px-4 md:px-6 py-2 rounded-lg text-[10px] md:text-xs font-black transition-all whitespace-nowrap ${activeTab === 'history' ? 'bg-white text-primary shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                        HISTORIAL
                    </button>
                </div>
            </div>

            <div className="flex-1 overflow-hidden relative flex flex-col lg:flex-row">
                {/* Main Content Area */}
                <div className="flex-1 overflow-y-auto p-4 md:p-8 custom-scrollbar">
                    {activeTab === 'patients' && (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {myAdmissions.length === 0 ? (
                                <div className="col-span-full py-20 text-center">
                                    <span className="material-symbols-outlined text-6xl text-slate-200">person_off</span>
                                    <p className="text-slate-400 font-bold mt-4">No tiene pacientes asignados en enfermería.</p>
                                </div>
                            ) : (
                                myAdmissions.map(adm => (
                                    <div 
                                        key={adm.id}
                                        onClick={() => handleSelectAdmission(adm)}
                                        className={`group cursor-pointer p-5 bg-white rounded-3xl border transition-all hover:shadow-xl hover:-translate-y-1 ${selectedAdmission?.id === adm.id ? 'border-primary ring-4 ring-primary/5' : 'border-slate-100'}`}
                                    >
                                        <div className="flex justify-between items-start mb-4">
                                            <div className="size-12 bg-slate-100 rounded-2xl flex items-center justify-center text-slate-400 group-hover:bg-primary/10 group-hover:text-primary transition-colors">
                                                <span className="material-symbols-outlined text-3xl">person</span>
                                            </div>
                                            <div className="text-right">
                                                <span className="px-3 py-1 bg-slate-900 text-white text-[10px] font-black rounded-lg uppercase">CAMA {adm.bed_code}</span>
                                                <p className="text-[10px] text-slate-400 font-bold mt-1 uppercase">Ingreso: {new Date(adm.check_in).toLocaleDateString()}</p>
                                            </div>
                                        </div>
                                        <h3 className="text-lg font-black text-slate-900 leading-tight mb-1">{adm.patient?.full_name}</h3>
                                        <p className="text-xs text-slate-500 font-medium mb-4">DNI: {adm.patient?.document_number}</p>
                                        
                                        <div className="flex items-center gap-2 pt-4 border-t border-slate-50">
                                            <span className="material-symbols-outlined text-amber-500 text-lg">event_available</span>
                                            <p className="text-[10px] font-black text-slate-400 uppercase">
                                                Alta: <span className="text-slate-900 text-xs ml-1">
                                                    {adm.est_discharge ? format(new Date(adm.est_discharge), 'dd/MM HH:mm') : 'No prog.'}
                                                </span>
                                            </p>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    )}

                    {activeTab === 'upcoming' && (
                        <div className="space-y-4">
                            {upcomingSurgeries.length === 0 ? (
                                <div className="py-20 text-center">
                                    <p className="text-slate-400 font-bold">Sin cirugías programadas próximamente.</p>
                                </div>
                            ) : (
                                upcomingSurgeries.map(s => (
                                    <div key={s.id} className="p-6 bg-white rounded-3xl border border-slate-100 flex items-center gap-6 shadow-sm hover:shadow-md transition-all">
                                        <div className="flex flex-col items-center justify-center size-16 bg-primary/5 rounded-2xl text-primary flex-shrink-0">
                                            <span className="text-[10px] font-black uppercase">{format(new Date(s.surgery_date + 'T12:00:00'), 'MMM', { locale: es })}</span>
                                            <span className="text-2xl font-black">{format(new Date(s.surgery_date + 'T12:00:00'), 'dd')}</span>
                                        </div>
                                        <div className="flex-1">
                                            <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase mb-2 inline-block ${
                                                s.status === 'scheduled' ? 'bg-blue-100 text-blue-700' : 
                                                s.status === 'pending' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-700'
                                            }`}>
                                                {s.status}
                                            </span>
                                            <h3 className="text-lg font-black text-slate-900">{s.procedure_name}</h3>
                                            <p className="text-sm font-bold text-slate-500">{s.patient?.full_name} • <span className="text-primary">{s.start_time || 'Hora a confirmar'}</span></p>
                                        </div>
                                        <div className="text-right flex flex-col items-end gap-2">
                                            <span className="material-symbols-outlined text-slate-300">chevron_right</span>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    )}

                    {activeTab === 'history' && (
                        <div className="space-y-3">
                            {pastSurgeries.map(s => (
                                <div key={s.id} className="p-4 bg-white rounded-2xl border border-slate-100 flex items-center justify-between opacity-80 hover:opacity-100 transition-all">
                                    <div className="flex items-center gap-4">
                                        <p className="text-xs font-black text-slate-400 w-24">{format(new Date(s.surgery_date + 'T12:00:00'), 'dd/MM/yyyy')}</p>
                                        <div>
                                            <p className="text-sm font-black text-slate-900">{s.procedure_name}</p>
                                            <p className="text-[10px] font-bold text-slate-500 uppercase">{s.patient?.full_name}</p>
                                        </div>
                                    </div>
                                    <span className="px-3 py-1 bg-slate-100 text-slate-500 text-[10px] font-black rounded-lg uppercase">{s.status}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Patient Sidebar (Clinical info) - Mobile Overlay Drawer */}
                {selectedAdmission && activeTab === 'patients' && (
                    <>
                        {/* Backdrop for mobile */}
                        <div 
                            className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-40 lg:hidden animate-in fade-in duration-300"
                            onClick={() => setSelectedAdmission(null)}
                        ></div>
                        
                        <div className="fixed inset-y-0 right-0 w-[90%] md:w-[450px] lg:relative lg:w-[400px] bg-white border-l border-slate-200 flex flex-col p-4 md:p-6 animate-in slide-in-from-right duration-300 shadow-2xl z-50">
                            <div className="flex justify-between items-start mb-6">
                                <div>
                                    <h2 className="text-lg md:text-xl font-black text-slate-900 leading-tight">{selectedAdmission.patient?.full_name}</h2>
                                    <p className="text-[10px] md:text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">Cama {selectedAdmission.bed_code}</p>
                                </div>
                                <button onClick={() => setSelectedAdmission(null)} className="size-10 rounded-full hover:bg-slate-100 text-slate-400 flex items-center justify-center">
                                    <span className="material-symbols-outlined">close</span>
                                </button>
                            </div>

                            {/* Medications Section */}
                            <div className="flex-1 overflow-y-auto pr-1 space-y-6 custom-scrollbar pb-10">
                                <div className="space-y-4">
                                    <div className="flex justify-between items-center">
                                        <h3 className="text-[10px] md:text-xs font-black text-slate-900 uppercase tracking-widest flex items-center gap-2">
                                            <span className="material-symbols-outlined text-base text-emerald-600">event_note</span>
                                            Esquema de Medicación
                                        </h3>
                                        <button 
                                            onClick={() => setShowScheduleForm(!showScheduleForm)}
                                            className="size-8 bg-emerald-100 text-emerald-700 rounded-lg flex items-center justify-center hover:bg-emerald-200 transition-all shadow-sm"
                                        >
                                            <span className="material-symbols-outlined text-sm">{showScheduleForm ? 'close' : 'add'}</span>
                                        </button>
                                    </div>

                                    {showScheduleForm && (
                                        <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-100 space-y-3 animate-in fade-in slide-in-from-top-2 shadow-inner">
                                            <div className="space-y-1">
                                                <label className="text-[9px] font-black text-emerald-700 uppercase ml-1">Fármaco</label>
                                                <select 
                                                    className="w-full h-11 bg-white border border-emerald-200 rounded-xl px-3 text-xs font-bold shadow-sm outline-none focus:ring-2 focus:ring-primary/20"
                                                    value={newPlan.name}
                                                    onChange={e => setNewPlan({...newPlan, name: e.target.value})}
                                                >
                                                    <option value="">Seleccionar Droga...</option>
                                                    {medications.map(m => <option key={m.id} value={m.name}>{m.name}</option>)}
                                                </select>
                                            </div>
                                            <div className="grid grid-cols-2 gap-3">
                                                <div className="space-y-1">
                                                    <label className="text-[9px] font-black text-emerald-700 uppercase ml-1">Dosis</label>
                                                    <input 
                                                        type="number" 
                                                        className="w-full h-11 bg-white border border-emerald-200 rounded-xl px-3 text-xs font-bold shadow-sm outline-none focus:ring-2 focus:ring-primary/20"
                                                        placeholder="0.00"
                                                        value={newPlan.dose}
                                                        onChange={e => setNewPlan({...newPlan, dose: e.target.value})}
                                                    />
                                                </div>
                                                <div className="space-y-1">
                                                    <label className="text-[9px] font-black text-emerald-700 uppercase ml-1">Unidad</label>
                                                    <select 
                                                        className="w-full h-11 bg-white border border-emerald-200 rounded-xl px-3 text-xs font-bold shadow-sm outline-none focus:ring-2 focus:ring-primary/20"
                                                        value={newPlan.unit}
                                                        onChange={e => setNewPlan({...newPlan, unit: e.target.value})}
                                                    >
                                                        <option value="mg">mg</option>
                                                        <option value="ml">ml</option>
                                                        <option value="comp">comp</option>
                                                        <option value="unidades">unid</option>
                                                    </select>
                                                </div>
                                                <div className="space-y-1">
                                                    <label className="text-[9px] font-black text-emerald-700 uppercase ml-1">Frec (hs)</label>
                                                    <input 
                                                        type="number" 
                                                        className="w-full h-11 bg-white border border-emerald-200 rounded-xl px-3 text-xs font-bold shadow-sm outline-none focus:ring-2 focus:ring-primary/20"
                                                        placeholder="8"
                                                        value={newPlan.frequency}
                                                        onChange={e => setNewPlan({...newPlan, frequency: e.target.value})}
                                                    />
                                                </div>
                                                <div className="space-y-1">
                                                    <label className="text-[9px] font-black text-emerald-700 uppercase ml-1">Inicio</label>
                                                    <input 
                                                        type="time" 
                                                        className="w-full h-11 bg-white border border-emerald-200 rounded-xl px-3 text-xs font-bold shadow-sm outline-none focus:ring-2 focus:ring-primary/20"
                                                        value={newPlan.start_time}
                                                        onChange={e => setNewPlan({...newPlan, start_time: e.target.value})}
                                                    />
                                                </div>
                                                <div className="col-span-2 space-y-1">
                                                    <label className="text-[9px] font-black text-emerald-700 uppercase ml-1">Duración (Días) - Opcional</label>
                                                    <input 
                                                        type="number" 
                                                        className="w-full h-11 bg-white border border-emerald-200 rounded-xl px-3 text-xs font-bold shadow-sm outline-none focus:ring-2 focus:ring-primary/20"
                                                        placeholder="Indefinido"
                                                        value={newPlan.days}
                                                        onChange={e => setNewPlan({...newPlan, days: e.target.value})}
                                                    />
                                                </div>
                                            </div>
                                            <button 
                                                onClick={handleAddPlan}
                                                className="w-full h-12 bg-emerald-600 text-white font-black rounded-xl text-[10px] uppercase shadow-lg shadow-emerald-200 active:scale-95 transition-all mt-2"
                                            >
                                                Programar Esquema
                                            </button>
                                        </div>
                                    )}

                                    <div className="space-y-2">
                                        {medPlans.length === 0 ? (
                                            <div className="p-8 border border-dashed border-slate-200 rounded-3xl text-center">
                                                <p className="text-[10px] font-bold text-slate-300 uppercase tracking-widest">Sin Esquema Activo</p>
                                            </div>
                                        ) : (
                                            medPlans.map(plan => (
                                                <div key={plan.id} className={`group/item p-4 rounded-2xl border flex justify-between items-center bg-slate-50 border-slate-100 transition-all hover:bg-white hover:shadow-md ${!plan.active && 'opacity-50 grayscale'}`}>
                                                    <div>
                                                        <div className="flex flex-col">
                                                            <p className="text-sm font-black text-slate-900 uppercase tracking-tight">{plan.drug_name || plan.medication_name}</p>
                                                            <p className="text-[9px] text-slate-500 font-medium lowercase italic">({plan.medication_name})</p>
                                                        </div>
                                                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-1 flex items-center gap-2">
                                                            <span className="bg-white px-2 py-0.5 rounded border border-slate-200 text-slate-800">{plan.dose}{plan.unit}</span>
                                                            Cada {plan.frequency_hours}hs 
                                                            {plan.ends_at && ` • Hasta: ${format(new Date(plan.ends_at), 'dd/MM')}`}
                                                        </p>
                                                    </div>
                                                    <button 
                                                        onClick={() => togglePlanStatus(plan.id, plan.active)}
                                                        className={`size-10 rounded-xl flex items-center justify-center transition-all active:scale-90 ${plan.active ? 'bg-amber-100 text-amber-600 hover:bg-amber-200' : 'bg-emerald-100 text-emerald-600 hover:bg-emerald-200'}`}
                                                    >
                                                        <span className="material-symbols-outlined text-lg">{plan.active ? 'pause' : 'play_arrow'}</span>
                                                    </button>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                </div>

                                <div className="space-y-4 pt-6 border-t border-slate-100">
                                    <h3 className="text-[10px] md:text-xs font-black text-slate-900 uppercase tracking-widest flex items-center gap-2">
                                        <span className="material-symbols-outlined text-base text-primary">history</span>
                                        Últimos Suministros
                                    </h3>
                                    <div className="space-y-2">
                                        {medLogs.length === 0 ? (
                                            <p className="text-[10px] text-slate-300 font-bold uppercase text-center py-4">Sin registros históricos</p>
                                        ) : (
                                            medLogs.slice(0, 10).map(log => (
                                                <div key={log.id} className="p-3 bg-white border border-slate-50 rounded-2xl flex justify-between items-center shadow-sm hover:border-emerald-200 transition-colors">
                                                    <div>
                                                        <p className="text-[11px] font-black text-slate-800 uppercase tracking-tight">{log.drug_name || log.medication_name}</p>
                                                        <p className="text-[9px] text-slate-500 font-medium lowercase italic">({log.medication_name})</p>
                                                        <p className="text-[9px] text-slate-400 font-bold mt-0.5 uppercase tracking-tighter">
                                                            {format(new Date(log.administered_at), 'dd/MM HH:mm')} • {log.administered_by?.split(' ')[0]}
                                                        </p>
                                                    </div>
                                                    <div className="flex items-center gap-1.5">
                                                        <p className="text-[9px] font-black text-emerald-600 uppercase tracking-tighter">Aplicado</p>
                                                        <span className="material-symbols-outlined text-sm text-emerald-500 font-black">check_circle</span>
                                                    </div>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                </div>

                                {/* Discharge Section */}
                                <div className="space-y-4 pt-6 pb-20 border-t border-slate-100">
                                    <h3 className="text-[10px] md:text-xs font-black text-slate-900 uppercase tracking-widest flex items-center gap-2">
                                        <span className="material-symbols-outlined text-base text-red-500">logout</span>
                                        Gestión de Alta
                                    </h3>
                                    
                                    {!showDischargeForm ? (
                                        <div className="grid grid-cols-1 gap-2">
                                            {selectedAdmission?.est_discharge ? (
                                                <div className="p-4 bg-slate-900 text-white rounded-2xl border border-slate-800 space-y-3 shadow-xl">
                                                    <div className="flex items-center justify-between">
                                                        <div className="flex items-center gap-2">
                                                            <span className="material-symbols-outlined text-amber-400">calendar_month</span>
                                                            <p className="text-[10px] font-black uppercase tracking-widest">Alta Programada</p>
                                                        </div>
                                                        <p className="text-xs font-black text-amber-400">
                                                            {format(new Date(selectedAdmission.est_discharge), "dd/MM 'a las' HH:mm 'hs'", { locale: es })}
                                                        </p>
                                                    </div>
                                                    <div className="grid grid-cols-2 gap-2">
                                                        <button 
                                                            onClick={() => {
                                                                const d = new Date(selectedAdmission.est_discharge!);
                                                                setDischargeDate(d.toISOString().split('T')[0]);
                                                                setDischargeTime(format(d, 'HH:mm'));
                                                                setShowDischargeForm(true);
                                                            }}
                                                            className="h-9 bg-white/10 hover:bg-white/20 text-white font-bold rounded-xl text-[9px] uppercase transition-all"
                                                        >
                                                            Modificar
                                                        </button>
                                                        <button 
                                                            onClick={handleRevokeScheduledDischarge}
                                                            className="h-9 bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 font-bold rounded-xl text-[9px] uppercase transition-all"
                                                        >
                                                            Revocar
                                                        </button>
                                                    </div>
                                                </div>
                                            ) : (
                                                <button 
                                                    onClick={() => setShowDischargeForm(true)}
                                                    className="h-11 border border-slate-200 text-slate-700 font-bold rounded-xl text-[10px] uppercase flex items-center justify-center gap-2 hover:bg-slate-50 transition-all"
                                                >
                                                    <span className="material-symbols-outlined text-sm">calendar_month</span>
                                                    Programar Alta
                                                </button>
                                            )}
                                            {selectedAdmission?.ready_at ? (
                                                <button 
                                                    onClick={handleRevokeMedicalDischarge}
                                                    className="h-11 bg-rose-100 text-rose-600 border border-rose-200 font-black rounded-xl text-[10px] uppercase flex items-center justify-center gap-2 active:scale-95 transition-all"
                                                >
                                                    <span className="material-symbols-outlined text-sm">cancel</span>
                                                    Revocar Alta Médica
                                                </button>
                                            ) : (
                                                <button 
                                                    onClick={handleMedicalDischarge}
                                                    className="h-11 bg-emerald-600 text-white font-black rounded-xl text-[10px] uppercase flex items-center justify-center gap-2 shadow-lg shadow-emerald-100 active:scale-95 transition-all"
                                                >
                                                    <span className="material-symbols-outlined text-sm">verified</span>
                                                    Dar Alta Médica
                                                </button>
                                            )}
                                        </div>
                                    ) : (
                                        <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 space-y-3 animate-in fade-in slide-in-from-bottom-2">
                                            <div className="grid grid-cols-2 gap-3">
                                                <div className="space-y-1">
                                                    <label className="text-[9px] font-black text-slate-500 uppercase ml-1">Fecha</label>
                                                    <input 
                                                        type="date" 
                                                        className="w-full h-10 bg-white border border-slate-200 rounded-xl px-3 text-xs font-bold outline-none"
                                                        value={dischargeDate}
                                                        onChange={e => setDischargeDate(e.target.value)}
                                                    />
                                                </div>
                                                <div className="space-y-1">
                                                    <label className="text-[9px] font-black text-slate-500 uppercase ml-1">Hora</label>
                                                    <input 
                                                        type="time" 
                                                        className="w-full h-10 bg-white border border-slate-200 rounded-xl px-3 text-xs font-bold outline-none"
                                                        value={dischargeTime}
                                                        onChange={e => setDischargeTime(e.target.value)}
                                                    />
                                                </div>
                                            </div>
                                            <div className="flex gap-2">
                                                <button 
                                                    onClick={() => setShowDischargeForm(false)}
                                                    className="flex-1 h-10 text-slate-400 font-bold text-[10px] uppercase"
                                                >
                                                    Cancelar
                                                </button>
                                                <button 
                                                    onClick={handleScheduleDischarge}
                                                    className="flex-[2] h-10 bg-slate-900 text-white font-black rounded-xl text-[10px] uppercase shadow-lg shadow-slate-200"
                                                >
                                                    Confirmar Programación
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};

export default DoctorPanel;
