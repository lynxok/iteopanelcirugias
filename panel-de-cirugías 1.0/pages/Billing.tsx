import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../src/lib/supabase';
import { useAuth } from '../src/lib/AuthContext';
import { HospitalAdmission, Patient, HospitalMedicationLog, UserRole } from '../types';
import { format, differenceInHours, parseISO, startOfDay } from 'date-fns';
import { es } from 'date-fns/locale';

interface BillingAdmission extends HospitalAdmission {
    patient: Patient;
    room_name?: string;
    bed_code_val?: string;
    meds_count?: number;
    surgery?: any;
    medication_logs?: HospitalMedicationLog[];
}

const Billing: React.FC = () => {
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<'pendientes' | 'historial'>('pendientes');
    const [admissions, setAdmissions] = useState<BillingAdmission[]>([]);
    const [selectedAdmission, setSelectedAdmission] = useState<BillingAdmission | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const { user } = useAuth();

    // Permissions check
    const canManageBilling = ['SuperAdmin', 'Facturacion', 'Administrativo', 'Gerencia', 'Direccion'].includes(user?.role || '');

    useEffect(() => {
        fetchAdmissions();
    }, [activeTab]);

    const fetchAdmissions = async () => {
        try {
            setLoading(true);
            const statusFilter = activeTab === 'pendientes' ? 'pendiente' : 'facturado';

            const { data, error } = await supabase
                .from('hospital_admissions')
                .select(`
                    *,
                    patient:patients(*),
                    bed:hospital_beds(
                        bed_code,
                        room:hospital_rooms(name)
                    )
                `)
                .eq('billing_status', statusFilter)
                .not('check_out', 'is', null) // Only finished admissions
                .order('check_out', { ascending: false });

            if (error) throw error;

            const transformed: BillingAdmission[] = (data || []).map(adm => ({
                ...adm,
                room_name: adm.bed?.room?.name,
                bed_code_val: adm.bed?.bed_code
            }));

            setAdmissions(transformed);
        } catch (err) {
            console.error('Error fetching billing data:', err);
        } finally {
            setLoading(false);
        }
    };

    const calculateDays = (checkIn: string, checkOut: string) => {
        const start = parseISO(checkIn);
        const end = parseISO(checkOut);
        const diffHours = differenceInHours(end, start);
        return Math.max(1, Math.ceil(diffHours / 24));
    };

    const fetchAdmissionDetails = async (admission: BillingAdmission) => {
        try {
            setIsProcessing(true);
            
            // 1. Fetch Medication Logs
            const { data: meds } = await supabase
                .from('hospital_medication_logs')
                .select('*')
                .eq('admission_id', admission.id)
                .order('administered_at', { ascending: true });

            // 2. Try to find a surgery linked to this patient around these dates
            // (Heuristic: surgery from 1 day before admission to discharge/today)
            const admissionDate = new Date(admission.check_in);
            const searchStartDate = new Date(admissionDate);
            searchStartDate.setDate(searchStartDate.getDate() - 1);
            
            const startDateStr = searchStartDate.toISOString().split('T')[0];
            const endDateStr = admission.check_out?.split('T')[0] || new Date().toISOString().split('T')[0];

            const { data: surgeries } = await supabase
                .from('surgeries')
                .select(`
                    *,
                    doctor:doctors!doctor_id(full_name),
                    anesthesiologist:doctors!anesthesiologist_id(full_name)
                `)
                .eq('patient_id', admission.patient_id)
                .gte('surgery_date', startDateStr)
                .lte('surgery_date', endDateStr)
                .order('surgery_date', { ascending: false })
                .limit(1);

            // Fetch extra form data if surgery exists
            let surgeryWithForm = surgeries?.[0] || null;
            if (surgeryWithForm) {
                const { data: form } = await supabase
                    .from('surgery_forms')
                    .select('*, surgery_form_items(*)')
                    .eq('surgery_id', surgeryWithForm.id)
                    .maybeSingle();
                
                if (form) {
                    surgeryWithForm = { ...surgeryWithForm, form };
                }
            }

            setSelectedAdmission({
                ...admission,
                medication_logs: meds || [],
                surgery: surgeryWithForm
            });
        } catch (err) {
            console.error('Error fetching details:', err);
        } finally {
            setIsProcessing(false);
        }
    };

    const markAsBilled = async (admissionId: string) => {
        if (!confirm('¿Está seguro de marcar esta intervención como FACTURADA? Pasará al historial.')) return;

        try {
            setIsProcessing(true);
            const { error } = await supabase
                .from('hospital_admissions')
                .update({
                    billing_status: 'facturado',
                    billed_at: new Date().toISOString(),
                    billed_by: user?.name
                })
                .eq('id', admissionId);

            if (error) throw error;

            // Audit
            await supabase.from('audit_logs').insert({
                user_name: user?.name,
                user_role: user?.role,
                action: 'UPDATE',
                resource: 'hospital_admissions',
                resource_id: admissionId,
                description: `Enfermería marcada como FACTURADA.`,
                meta: { billed_by: user?.name }
            });

            setSelectedAdmission(null);
            fetchAdmissions();
        } catch (err) {
            console.error('Error billing:', err);
            alert('Error al facturar');
        } finally {
            setIsProcessing(false);
        }
    };

    return (
        <div className="p-6 max-w-7xl mx-auto animate-fadeIn">
            <header className="mb-8 flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-black text-slate-900 uppercase tracking-tight">Facturación</h1>
                    <p className="text-slate-500 font-medium">Gestión de internaciones finalizadas y procedimientos.</p>
                </div>
                
                <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200">
                    <button
                        onClick={() => setActiveTab('pendientes')}
                        className={`px-6 py-2 rounded-lg font-bold text-sm transition-all ${activeTab === 'pendientes' ? 'bg-white text-primary shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                        Pendientes
                    </button>
                    <button
                        onClick={() => setActiveTab('historial')}
                        className={`px-6 py-2 rounded-lg font-bold text-sm transition-all ${activeTab === 'historial' ? 'bg-white text-primary shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                        Historial
                    </button>
                </div>
            </header>

            {loading ? (
                <div className="flex flex-col items-center justify-center py-20 gap-4">
                    <div className="size-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin"></div>
                    <p className="text-slate-400 font-bold uppercase tracking-widest text-xs">Cargando registros...</p>
                </div>
            ) : admissions.length === 0 ? (
                <div className="bg-white border-2 border-dashed border-slate-200 rounded-3xl p-20 text-center">
                    <span className="material-symbols-outlined text-6xl text-slate-200 mb-4">receipt_long</span>
                    <p className="text-slate-400 font-bold uppercase">No hay internaciones {activeTab} para mostrar</p>
                </div>
            ) : (
                <div className="grid gap-4">
                    {admissions.map(adm => (
                        <div
                            key={adm.id}
                            onClick={() => fetchAdmissionDetails(adm)}
                            className="bg-white border border-slate-200 rounded-2xl p-5 hover:border-primary hover:shadow-xl transition-all cursor-pointer flex items-center gap-6 group"
                        >
                            <div className="size-14 bg-slate-50 rounded-2xl flex items-center justify-center text-slate-400 group-hover:bg-primary/5 group-hover:text-primary transition-colors">
                                <span className="material-symbols-outlined text-3xl">patient_list</span>
                            </div>

                            <div className="flex-1">
                                <div className="flex items-center gap-3 mb-1">
                                    <h3 className="font-black text-slate-900 uppercase tracking-tight">{adm.patient.name}</h3>
                                    <span className="text-[10px] bg-slate-100 px-2 py-0.5 rounded-full font-bold text-slate-500 uppercase">DNI: {adm.patient.document_number}</span>
                                </div>
                                <div className="flex items-center gap-4 text-xs font-bold text-slate-400">
                                    <div className="flex items-center gap-1">
                                        <span className="material-symbols-outlined text-sm">meeting_room</span>
                                        {adm.room_name} ({adm.bed_code_val})
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <span className="material-symbols-outlined text-sm">calendar_month</span>
                                        {adm.check_in && format(parseISO(adm.check_in), 'dd/MM/yy HH:mm')} - {adm.check_out && format(parseISO(adm.check_out), 'dd/MM/yy HH:mm')}
                                    </div>
                                </div>
                            </div>

                            <div className="text-right flex flex-col items-end gap-1">
                                <div className="bg-indigo-50 text-indigo-600 px-3 py-1 rounded-full text-xs font-black uppercase tracking-tighter">
                                    {calculateDays(adm.check_in, adm.check_out!)} Días Estancia
                                </div>
                                {adm.billing_status === 'facturado' && (
                                    <p className="text-[9px] text-emerald-600 font-bold uppercase flex items-center gap-1">
                                        <span className="material-symbols-outlined text-[10px]">verified</span>
                                        Facturado por {adm.billed_by}
                                    </p>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Detail Modal */}
            {selectedAdmission && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fadeIn print:hidden">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
                        
                        {/* Modal Header */}
                        <div className="px-8 py-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                            <div>
                                <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tight">Detalle de Facturación</h2>
                                <p className="text-sm font-bold text-slate-500 uppercase">Consolidado de servicios e insumos</p>
                            </div>
                            <div className="flex items-center gap-3">
                                <button 
                                    onClick={() => window.print()}
                                    className="flex items-center gap-2 bg-white border border-slate-200 px-4 py-2 rounded-xl font-bold text-sm hover:bg-slate-50 transition-all shadow-sm"
                                >
                                    <span className="material-symbols-outlined text-lg">print</span>
                                    Imprimir / PDF
                                </button>
                                {selectedAdmission.billing_status === 'pendiente' && canManageBilling && (
                                    <button 
                                        onClick={() => markAsBilled(selectedAdmission.id)}
                                        disabled={isProcessing}
                                        className="flex items-center gap-2 bg-primary text-white px-6 py-2 rounded-xl font-bold text-sm hover:bg-primary/90 transition-all shadow-lg shadow-primary/20"
                                    >
                                        <span className="material-symbols-outlined text-lg">check_circle</span>
                                        Marcar como Facturado
                                    </button>
                                )}
                                <button onClick={() => setSelectedAdmission(null)} className="size-10 flex items-center justify-center rounded-full hover:bg-slate-200 text-slate-400">
                                    <span className="material-symbols-outlined">close</span>
                                </button>
                            </div>
                        </div>

                        {/* Modal Body (Screen only) */}
                        <div className="flex-1 overflow-y-auto p-8 space-y-8 bg-white custom-scrollbar">
                            {/* Patient Info Card */}
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                <div className="md:col-span-2 bg-slate-50 border border-slate-200 rounded-3xl p-8 relative overflow-hidden group">
                                    {/* Subtle decorative pattern or icon */}
                                    <span className="material-symbols-outlined absolute -right-4 -bottom-4 text-9xl text-slate-200/50 rotate-12 group-hover:rotate-0 transition-transform duration-700">patient_list</span>
                                    
                                    <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-6 flex items-center gap-2">
                                        <span className="size-2 bg-primary rounded-full animate-pulse"></span>
                                        Información del Paciente
                                    </h4>
                                    
                                    <div className="grid grid-cols-2 gap-x-8 gap-y-6 relative z-10">
                                        <div>
                                            <p className="text-[10px] text-slate-500 font-bold uppercase mb-1 tracking-wider">Apellido y Nombre</p>
                                            <p className="text-2xl font-black text-slate-900 uppercase leading-tight tracking-tight">{selectedAdmission.patient.name}</p>
                                        </div>
                                        <div>
                                            <p className="text-[10px] text-slate-500 font-bold uppercase mb-1 tracking-wider">Documento / DNI</p>
                                            <p className="text-2xl font-black text-slate-900 tracking-tighter">{selectedAdmission.patient.document_number}</p>
                                        </div>
                                        <div>
                                            <p className="text-[10px] text-slate-500 font-bold uppercase mb-1 tracking-wider">Cobertura / Prepaga</p>
                                            <p className="text-lg font-black text-primary uppercase">
                                                {selectedAdmission.patient.insurance_name || 'PARTICULAR'}
                                                {selectedAdmission.patient.insurance_number && <span className="text-slate-400 font-bold ml-2 text-sm italic">({selectedAdmission.patient.insurance_number})</span>}
                                            </p>
                                        </div>
                                        <div>
                                            <p className="text-[10px] text-slate-500 font-bold uppercase mb-1 tracking-wider">Procedimiento</p>
                                            <p className="text-sm font-bold text-slate-700 uppercase leading-relaxed">{selectedAdmission.surgery?.procedure_name || selectedAdmission.surgery?.procedure || 'Ingreso por Enfermería'}</p>
                                        </div>
                                    </div>
                                </div>

                                <div className="bg-primary/5 border border-primary/10 rounded-3xl p-8 flex flex-col justify-center items-center text-center group hover:bg-primary/10 transition-colors duration-500">
                                    <h4 className="text-[10px] font-black text-primary uppercase tracking-[0.2em] mb-4">Estadía Total</h4>
                                    <p className="text-8xl font-black text-primary leading-none tracking-tighter group-hover:scale-110 transition-transform duration-500">
                                        {calculateDays(selectedAdmission.check_in, selectedAdmission.check_out!)}
                                    </p>
                                    <p className="text-sm font-black text-primary uppercase mt-4 tracking-widest">Días Computados</p>
                                    <div className="mt-4 px-4 py-1.5 bg-white/50 backdrop-blur-sm rounded-full border border-primary/20 text-[10px] text-primary/70 font-bold uppercase tracking-tighter">
                                        Reporte de Facturación
                                    </div>
                                </div>
                            </div>

                            {/* Detalle de Estancia */}
                            <div className="space-y-4">
                                <h4 className="text-xs font-black text-slate-900 uppercase tracking-[0.3em] flex items-center gap-3">
                                    <span className="material-symbols-outlined text-primary text-xl">meeting_room</span>
                                    Detalle de Estancia
                                </h4>
                                <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                                    <table className="w-full text-left border-collapse">
                                        <thead className="bg-slate-50 border-b border-slate-200">
                                            <tr>
                                                <th className="px-6 py-4 text-[11px] font-black text-slate-500 uppercase tracking-wider">Habitación / Cama</th>
                                                <th className="px-6 py-4 text-[11px] font-black text-slate-500 uppercase tracking-wider">Ingreso</th>
                                                <th className="px-6 py-4 text-[11px] font-black text-slate-500 uppercase tracking-wider">Egreso</th>
                                                <th className="px-6 py-4 text-[11px] font-black text-slate-500 uppercase tracking-wider text-right">Duración</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            <tr className="hover:bg-slate-50/50 transition-colors">
                                                <td className="px-6 py-4 font-black text-slate-900 uppercase">{selectedAdmission.room_name} - {selectedAdmission.bed_code_val}</td>
                                                <td className="px-6 py-4 text-xs font-bold text-slate-600 uppercase italic">{format(parseISO(selectedAdmission.check_in), "dd/MM/yyyy HH:mm 'hs'", { locale: es })}</td>
                                                <td className="px-6 py-4 text-xs font-bold text-slate-600 uppercase italic">{selectedAdmission.check_out && format(parseISO(selectedAdmission.check_out), "dd/MM/yyyy HH:mm 'hs'", { locale: es })}</td>
                                                <td className="px-6 py-4 text-sm font-black text-slate-900 text-right">
                                                    <span className="bg-slate-100 px-3 py-1 rounded-lg">
                                                        {selectedAdmission.check_out ? differenceInHours(parseISO(selectedAdmission.check_out), parseISO(selectedAdmission.check_in)) : '---'} hs
                                                    </span>
                                                </td>
                                            </tr>
                                        </tbody>
                                    </table>
                                </div>
                            </div>

                            {/* Equipo Profesional */}
                            {selectedAdmission.surgery && (
                                <div className="space-y-4">
                                    <h4 className="text-xs font-black text-slate-900 uppercase tracking-[0.3em] flex items-center gap-3">
                                        <span className="material-symbols-outlined text-primary text-xl">groups</span>
                                        Equipo Profesional Quirúrgico
                                    </h4>
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                        <div className="bg-slate-50 border border-slate-200 p-4 rounded-2xl flex items-center gap-4">
                                            <div className="size-10 bg-white rounded-xl flex items-center justify-center text-primary shadow-sm border border-slate-100">
                                                <span className="material-symbols-outlined">medical_information</span>
                                            </div>
                                            <div>
                                                <p className="text-[9px] font-black text-slate-400 uppercase tracking-tighter">Cirujano</p>
                                                <p className="text-sm font-black text-slate-900 uppercase tracking-tighter">{selectedAdmission.surgery.doctor?.full_name || '---'}</p>
                                            </div>
                                        </div>
                                        <div className="bg-slate-50 border border-slate-200 p-4 rounded-2xl flex items-center gap-4 relative overflow-hidden">
                                            <div className="size-10 bg-white rounded-xl flex items-center justify-center text-indigo-500 shadow-sm border border-slate-100 relative z-10 transition-transform duration-300 group-hover:scale-110">
                                                <span className="material-symbols-outlined text-2xl">medical_services</span>
                                            </div>
                                            <div>
                                                <p className="text-[9px] font-black text-slate-400 uppercase tracking-tighter">Anestesista</p>
                                                <p className="text-sm font-black text-slate-900 uppercase tracking-tighter">{selectedAdmission.surgery.anesthesiologist?.full_name || '---'}</p>
                                            </div>
                                        </div>
                                        <div className="bg-slate-50 border border-slate-200 p-4 rounded-2xl flex items-center gap-4">
                                            <div className="size-10 bg-white rounded-xl flex items-center justify-center text-emerald-500 shadow-sm border border-slate-100">
                                                <span className="material-symbols-outlined">person_add</span>
                                            </div>
                                            <div>
                                                <p className="text-[9px] font-black text-slate-400 uppercase tracking-tighter">1° Ayudante</p>
                                                <p className="text-sm font-black text-slate-900 uppercase tracking-tighter">{selectedAdmission.surgery.form?.ayudante_1 || '---'}</p>
                                            </div>
                                        </div>
                                        <div className="bg-slate-50 border border-slate-200 p-4 rounded-2xl flex items-center gap-4">
                                            <div className="size-10 bg-white rounded-xl flex items-center justify-center text-emerald-500 shadow-sm border border-slate-100 opacity-70">
                                                <span className="material-symbols-outlined">person_add</span>
                                            </div>
                                            <div>
                                                <p className="text-[9px] font-black text-slate-400 uppercase tracking-tighter">2° Ayudante</p>
                                                <p className="text-sm font-black text-slate-900 uppercase tracking-tighter">{selectedAdmission.surgery.form?.ayudante_2 || '---'}</p>
                                            </div>
                                        </div>
                                        <div className="bg-slate-50 border border-slate-200 p-4 rounded-2xl flex items-center gap-4">
                                            <div className="size-10 bg-white rounded-xl flex items-center justify-center text-amber-500 shadow-sm border border-slate-100">
                                                <span className="material-symbols-outlined">content_cut</span>
                                            </div>
                                            <div>
                                                <p className="text-[9px] font-black text-slate-400 uppercase tracking-tighter">Instrumentadora</p>
                                                <p className="text-sm font-black text-slate-900 uppercase tracking-tighter">{selectedAdmission.surgery.form?.instrumentadora || '---'}</p>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Medicación */}
                            <div className="space-y-4">
                                <h4 className="text-xs font-black text-slate-900 uppercase tracking-[0.3em] flex items-center gap-3">
                                    <span className="material-symbols-outlined text-primary text-xl">medication_liquid</span>
                                    Medicación en Enfermería
                                </h4>
                                <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                                    <table className="w-full text-left border-collapse">
                                        <thead className="bg-slate-50 border-b border-slate-200">
                                            <tr>
                                                <th className="px-6 py-4 text-[11px] font-black text-slate-500 uppercase tracking-wider">Medicamento</th>
                                                <th className="px-6 py-4 text-[11px] font-black text-slate-500 uppercase tracking-wider text-center">Dosis Consolidada</th>
                                                <th className="px-6 py-4 text-[11px] font-black text-slate-500 uppercase tracking-wider text-right">Administrado por</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {selectedAdmission.medication_logs?.length === 0 ? (
                                                <tr>
                                                    <td colSpan={3} className="px-6 py-12 text-center">
                                                        <span className="material-symbols-outlined text-4xl text-slate-200">medication</span>
                                                        <p className="text-xs font-bold text-slate-300 uppercase mt-2">Sin registros de medicación</p>
                                                    </td>
                                                </tr>
                                            ) : (
                                                selectedAdmission.medication_logs?.map(log => (
                                                    <tr key={log.id} className="hover:bg-slate-50/50 transition-colors">
                                                        <td className="px-6 py-4 font-black text-slate-900 uppercase tracking-tighter">{log.medication_name}</td>
                                                        <td className="px-6 py-4 text-sm font-black text-primary text-center">
                                                            <span className="bg-primary/5 px-3 py-1 rounded-full">{log.dose} {log.unit}</span>
                                                        </td>
                                                        <td className="px-6 py-4 text-[10px] font-black text-slate-500 text-right uppercase italic">{log.administered_by}</td>
                                                    </tr>
                                                ))
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>

                            {/* Insumos de Quirófano */}
                            {selectedAdmission.surgery?.form?.surgery_form_items && selectedAdmission.surgery.form.surgery_form_items.length > 0 && (
                                <div className="space-y-4">
                                    <h4 className="text-xs font-black text-slate-900 uppercase tracking-[0.3em] flex items-center gap-3">
                                        <span className="material-symbols-outlined text-primary text-xl">inventory_2</span>
                                        Insumos y Materiales de Quirófano
                                    </h4>
                                    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                                        <table className="w-full text-left border-collapse">
                                            <thead className="bg-slate-50 border-b border-slate-200">
                                                <tr>
                                                    <th className="px-6 py-4 text-[11px] font-black text-slate-500 uppercase tracking-wider">Categoría</th>
                                                    <th className="px-6 py-4 text-[11px] font-black text-slate-500 uppercase tracking-wider">Nombre del Insumo / Material</th>
                                                    <th className="px-6 py-4 text-[11px] font-black text-slate-500 uppercase tracking-wider text-right">Cantidad</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100">
                                                {selectedAdmission.surgery.form.surgery_form_items.map(item => (
                                                    <tr key={item.id} className="hover:bg-slate-50/50 transition-colors">
                                                        <td className="px-6 py-4">
                                                            <span className={`text-[9px] font-black uppercase px-2 py-1 rounded-md ${item.type === 'anesthesia' ? 'bg-indigo-50 text-indigo-600' : 'bg-orange-50 text-orange-600'}`}>
                                                                {item.type === 'anesthesia' ? 'Anestesia' : 'Quirófano'}
                                                            </span>
                                                        </td>
                                                        <td className="px-6 py-4 font-black text-slate-900 uppercase tracking-tighter">{item.name}</td>
                                                        <td className="px-6 py-4 text-sm font-black text-slate-900 text-right uppercase underline decoration-primary/30 underline-offset-4">{item.quantity} {item.unit}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* PRINT PORTAL (Strictly Isolated Document) */}
            {selectedAdmission && createPortal(
                <div id="print-billing-portal" className="hidden print:block fixed inset-0 bg-white z-[9999]">
                    <div className="max-w-[21cm] mx-auto p-0 space-y-8 bg-white text-black">
                        
                        {/* Formal Document Header */}
                        <div className="flex justify-between items-center border-b-2 border-black pb-2 mb-6">
                            <div className="flex items-center">
                                <img src="/logo-iteo.png" className="h-16 object-contain" alt="ITEO" />
                            </div>
                            <div className="text-right">
                                <h1 className="text-3xl font-bold uppercase tracking-widest border-2 border-black px-4 py-1 inline-block">Resumen de Facturación</h1>
                                <p className="text-xs mt-1 font-bold">Código Interno: {selectedAdmission.id.slice(-8).toUpperCase()} | Reporte Consolidado de Servicios</p>
                                <p className="text-[10px] uppercase font-bold text-gray-500">Fecha de Emisión: {format(new Date(), 'dd/MM/yyyy HH:mm')}</p>
                            </div>
                        </div>

                        {/* Patient Info Section */}
                        <div className="grid grid-cols-3 gap-0 border-2 border-black overflow-hidden bg-white">
                            <div className="col-span-2 p-6 border-r-2 border-black">
                                <h4 className="text-[10px] font-black uppercase tracking-widest mb-4 border-b border-black pb-1">Información del Paciente</h4>
                                <div className="grid grid-cols-2 gap-y-4">
                                    <div>
                                        <p className="text-[9px] font-bold uppercase mb-0.5">Apellido y Nombre</p>
                                        <p className="text-xl font-black uppercase leading-tight">{selectedAdmission.patient.name}</p>
                                    </div>
                                    <div>
                                        <p className="text-[9px] font-bold uppercase mb-0.5">Documento / DNI</p>
                                        <p className="text-xl font-black">{selectedAdmission.patient.document_number}</p>
                                    </div>
                                    <div className="col-span-2 mt-2">
                                        <p className="text-[9px] font-bold uppercase mb-0.5">Cobertura / Prepaga</p>
                                        <p className="text-sm font-black uppercase text-gray-700">
                                            {selectedAdmission.patient.insurance_name || 'PARTICULAR'} 
                                            {selectedAdmission.patient.insurance_number && <span className="text-gray-500 font-bold ml-2 italic">({selectedAdmission.patient.insurance_number})</span>}
                                        </p>
                                    </div>
                                    <div className="col-span-2 mt-2">
                                        <p className="text-[9px] font-bold uppercase mb-0.5">Diagnóstico / Procedimiento Efectuado</p>
                                        <p className="text-sm font-bold uppercase leading-tight">{selectedAdmission.surgery?.procedure_name || selectedAdmission.surgery?.procedure || 'Ingreso por Enfermería'}</p>
                                    </div>
                                </div>
                            </div>
                            <div className="p-6 flex flex-col justify-center items-center text-center bg-gray-50">
                                <h4 className="text-[10px] font-black uppercase tracking-widest mb-2">Días Computados</h4>
                                <p className="text-7xl font-black leading-none">
                                    {calculateDays(selectedAdmission.check_in, selectedAdmission.check_out!)}
                                </p>
                                <p className="text-[11px] font-black uppercase mt-1">Días de Estancia</p>
                            </div>
                        </div>

                        {/* Estancia Table */}
                        <div className="space-y-2">
                            <h4 className="text-xs font-black uppercase tracking-[0.2em] border-b-2 border-black pb-1">Detalle de Estancia</h4>
                            <table className="w-full text-left border-collapse border-2 border-black">
                                <thead className="bg-gray-100 border-b-2 border-black">
                                    <tr>
                                        <th className="px-4 py-2 text-[10px] font-black uppercase">Habitación / Cama</th>
                                        <th className="px-4 py-2 text-[10px] font-black uppercase">Fecha de Ingreso</th>
                                        <th className="px-4 py-2 text-[10px] font-black uppercase">Fecha de Egreso</th>
                                        <th className="px-4 py-2 text-[10px] font-black uppercase text-right">Total Horas</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr>
                                        <td className="px-4 py-3 font-bold text-sm uppercase">{selectedAdmission.room_name} - {selectedAdmission.bed_code_val}</td>
                                        <td className="px-4 py-3 text-xs font-bold uppercase">{format(parseISO(selectedAdmission.check_in), "dd/MM/yyyy HH:mm 'hs'", { locale: es })}</td>
                                        <td className="px-4 py-3 text-xs font-bold uppercase">{format(parseISO(selectedAdmission.check_out!), "dd/MM/yyyy HH:mm 'hs'", { locale: es })}</td>
                                        <td className="px-4 py-3 text-sm font-black text-right">{differenceInHours(parseISO(selectedAdmission.check_out!), parseISO(selectedAdmission.check_in))} hs</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>

                        {/* Medical Team */}
                        {selectedAdmission.surgery && (
                            <div className="space-y-2 avoid-break">
                                <h4 className="text-xs font-black uppercase tracking-[0.2em] border-b-2 border-black pb-1">Equipo Profesional Quirúrgico</h4>
                                <div className="grid grid-cols-3 border-2 border-black divide-x-2 divide-y-2 divide-black">
                                    <div className="p-3">
                                        <p className="text-[9px] font-bold uppercase mb-1">Cirujano</p>
                                        <p className="text-[11px] font-black uppercase">{selectedAdmission.surgery.doctor?.full_name || '---'}</p>
                                    </div>
                                    <div className="p-3">
                                        <p className="text-[9px] font-bold uppercase mb-1">Anestesista</p>
                                        <p className="text-[11px] font-black uppercase">{selectedAdmission.surgery.anesthesiologist?.full_name || '---'}</p>
                                    </div>
                                    <div className="p-3">
                                        <p className="text-[9px] font-bold uppercase mb-1">1° Ayudante</p>
                                        <p className="text-[11px] font-black uppercase">{selectedAdmission.surgery.form?.ayudante_1 || '---'}</p>
                                    </div>
                                    <div className="p-3">
                                        <p className="text-[9px] font-bold uppercase mb-1">2° Ayudante</p>
                                        <p className="text-[11px] font-black uppercase">{selectedAdmission.surgery.form?.ayudante_2 || '---'}</p>
                                    </div>
                                    <div className="p-3">
                                        <p className="text-[9px] font-bold uppercase mb-1">Instrumentadora</p>
                                        <p className="text-[11px] font-black uppercase">{selectedAdmission.surgery.form?.instrumentadora || '---'}</p>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Medication Tables (Reuse similar logic but with stricter print styling) */}
                        {/* [Resto de las tablas de medicación e insumos optimizadas...] */}
                        {/* Nota: Por brevedad en la respuesta, el contenido interno se mantiene coherente con el anterior pero dentro del Portal */}
                        
                        {/* Section: Medication Logs */}
                        <div className="space-y-2 avoid-break">
                            <h4 className="text-xs font-black uppercase tracking-[0.2em] border-b-2 border-black pb-1">Medicación en Enfermería</h4>
                            <table className="w-full text-left border-collapse border-2 border-black">
                                <thead className="bg-gray-100 border-b-2 border-black">
                                    <tr>
                                        <th className="px-4 py-1 text-[10px] font-black uppercase">Medicamento</th>
                                        <th className="px-4 py-1 text-[10px] font-black uppercase">Dosis</th>
                                        <th className="px-4 py-1 text-[10px] font-black uppercase">Administrado</th>
                                        <th className="px-4 py-1 text-[10px] font-black uppercase text-right">Firma</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-black">
                                    {selectedAdmission.medication_logs?.map(log => (
                                        <tr key={log.id}>
                                            <td className="px-4 py-1.5 font-bold uppercase text-[10px]">{log.medication_name}</td>
                                            <td className="px-4 py-1.5 text-[10px] font-bold">{log.dose} {log.unit}</td>
                                            <td className="px-4 py-1.5 text-[10px] font-bold uppercase">{format(parseISO(log.administered_at!), 'dd/MM/yy HH:mm')}</td>
                                            <td className="px-4 py-1.5 text-[10px] font-bold text-right uppercase">{log.administered_by}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {/* Section: Insumos (Repite el mismo patrón de tablas bordeadas en negro) */}
                        {selectedAdmission.surgery?.form?.surgery_form_items?.length > 0 && (
                             <div className="space-y-2 avoid-break">
                                <h4 className="text-xs font-black uppercase tracking-[0.2em] border-b-2 border-black pb-1">Materiales e Insumos de Quirófano</h4>
                                <table className="w-full text-left border-collapse border-2 border-black">
                                    <thead className="bg-gray-100 border-b-2 border-black">
                                        <tr>
                                            <th className="px-4 py-1 text-[10px] font-black uppercase">Insumo / Material</th>
                                            <th className="px-4 py-1 text-[10px] font-black uppercase text-right">Cantidad</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-black">
                                        {selectedAdmission.surgery.form.surgery_form_items.map(item => (
                                            <tr key={item.id}>
                                                <td className="px-4 py-1.5 font-bold uppercase text-[10px]">{item.name}</td>
                                                <td className="px-4 py-1.5 text-[10px] font-black text-right uppercase">{item.quantity} {item.unit}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}

                        {/* Final Signatures */}
                        <div className="grid grid-cols-2 gap-20 pt-20">
                            <div className="text-center pt-2 border-t-2 border-black">
                                <p className="text-[10px] font-black uppercase tracking-widest">Firma y Sello Auditoría Médica</p>
                            </div>
                            <div className="text-center pt-2 border-t-2 border-black">
                                <p className="text-[10px] font-black uppercase tracking-widest">Responsable de Facturación ITEO</p>
                            </div>
                        </div>

                    </div>
                </div>,
                document.body
            )}

            <style dangerouslySetInnerHTML={{ __html: `
                @media print {
                    #root { display: none !important; }
                    body { background: white !important; margin: 0 !important; padding: 0 !important; }
                    #print-billing-portal { display: block !important; visibility: visible !important; position: static !important; }
                    @page { size: auto; margin: 1cm; }
                    .avoid-break { page-break-inside: avoid; }
                    * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
                }
            ` }} />
        </div>
    );
};

export default Billing;
