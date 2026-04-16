import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../src/lib/supabase';
import { useAuth } from '../src/lib/AuthContext';
import ProgressBar from '../components/ProgressBar';

export const PatientCard: React.FC = () => {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const { user } = useAuth();
    
    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [errorMsg, setErrorMsg] = useState('');

    useEffect(() => {
        const fetchDetails = async () => {
            if (!id) return;
            try {
                // Ensure the user is logged in
                if (!user) {
                    setErrorMsg('Acceso denegado. Debe iniciar sesión.');
                    setLoading(false);
                    return;
                }

                const { data: surgeryData, error } = await supabase
                    .from('surgeries')
                    .select(`
                        *,
                        patients (full_name, document_number, allergies, birth_date, medical_record_number, phone),
                        doctors!surgeries_doctor_id_fkey(full_name, specialty),
                        operating_rooms(name)
                    `)
                    .eq('id', id)
                    .single();

                if (error) throw error;
                
                if (!surgeryData) {
                    setErrorMsg('Cirugía no encontrada.');
                } else {
                    setData(surgeryData);
                }

            } catch (err: any) {
                console.error('Error fetching data for PatientCard:', err);
                setErrorMsg('Error al obtener la información.');
            } finally {
                setLoading(false);
            }
        };

        fetchDetails();
    }, [id, user]);

    if (loading) {
        return (
            <div className="flex-1 h-full bg-slate-50 relative">
                <ProgressBar isLoading={true} />
            </div>
        );
    }

    if (errorMsg) {
        return (
            <div className="flex-1 h-full flex flex-col items-center justify-center bg-slate-50 p-6">
                <span className="material-symbols-outlined text-red-500 text-6xl mb-4">error</span>
                <h2 className="text-xl font-bold text-slate-800 mb-2">Error de Acceso</h2>
                <p className="text-slate-500 text-center">{errorMsg}</p>
                <button
                    onClick={() => navigate('/')}
                    className="mt-6 px-6 py-2 bg-primary text-white rounded-lg font-bold shadow-md"
                >
                    Volver al Inicio
                </button>
            </div>
        );
    }
    
    const patient = data?.patients;
    const isScheduled = data?.ortho_validated && data?.admission_validated && data?.or_validated && data?.surgery_date;

    // Calculate age
    let ageText = '';
    if (patient?.birth_date) {
        try {
            const today = new Date();
            const birth = new Date(patient.birth_date);
            let age = today.getFullYear() - birth.getFullYear();
            const monthDiff = today.getMonth() - birth.getMonth();
            if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
                age--;
            }
            ageText = age >= 0 ? `${age} años` : '';
        } catch (e) {
            console.error("Error calculating age:", e);
        }
    }

    // Safe initials generation
    const getInitials = (name: string | undefined | null) => {
        if (!name) return 'NN';
        try {
            const matches = name.match(/\b(\w)/g);
            return matches ? matches.join('').substring(0, 2).toUpperCase() : 'NN';
        } catch (e) {
            return 'NN';
        }
    };

    return (
        <div className="flex-1 bg-slate-100 p-4 sm:p-6 pb-24 font-sans">
            <div className="max-w-md mx-auto space-y-4">
                
                {/* Header Back Button */}
                <div className="flex justify-between items-center mb-6">
                    <button 
                        onClick={() => navigate(-1)}
                        className="flex items-center gap-1 text-slate-500 hover:text-slate-800 font-bold transition-colors bg-white px-3 py-1.5 rounded-full shadow-sm"
                    >
                        <span className="material-symbols-outlined text-sm">arrow_back</span>
                        Volver
                    </button>
                    <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest bg-slate-200 px-3 py-1 rounded-full">
                        Seguimiento QX
                    </span>
                </div>

                {/* Identity Card */}
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden relative">
                    <div className="h-16 bg-blue-600 w-full absolute top-0 left-0"></div>
                    
                    <div className="px-6 pt-10 pb-6 relative z-10 flex flex-col items-center">
                        <div className="size-20 bg-white rounded-full border-4 border-slate-100 shadow-md flex items-center justify-center text-3xl font-black text-blue-600 uppercase mb-3 text-center">
                            {getInitials(patient?.full_name)}
                        </div>
                        
                        <h2 className="text-xl font-extrabold text-slate-900 text-center leading-tight mb-1">
                            {patient?.full_name || 'Nombre no disponible'}
                        </h2>
                        <div className="flex items-center gap-2 text-sm font-bold text-slate-500">
                            <span className="bg-slate-100 px-2 py-0.5 rounded">DNI: {patient?.document_number || 'S/D'}</span>
                            {ageText && <span className="bg-slate-100 px-2 py-0.5 rounded">{ageText}</span>}
                        </div>

                        {/* Allergies Warning */}
                        {patient?.allergies ? (
                            <div className="mt-4 w-full bg-red-50 border border-red-200 rounded-lg p-3 flex items-start gap-3">
                                <span className="material-symbols-outlined text-red-500 text-xl shrink-0">warning</span>
                                <div>
                                    <span className="block text-[10px] font-black uppercase text-red-600 tracking-wider">Alergias Conocidas</span>
                                    <span className="text-sm font-bold text-red-900 leading-tight">
                                        {patient.allergies}
                                    </span>
                                </div>
                            </div>
                        ) : (
                            <div className="mt-4 w-full bg-slate-50 border border-slate-100 rounded-lg p-2 text-center">
                                <span className="text-xs font-bold text-slate-500">Sin alergias registradas</span>
                            </div>
                        )}
                    </div>
                </div>

                {/* Surgery Details Card */}
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5">
                    <div className="flex items-center justify-between mb-4 border-b border-slate-100 pb-3">
                        <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest flex items-center gap-2">
                            <span className="material-symbols-outlined text-primary text-lg">medical_services</span>
                            Datos Cirugía
                        </h3>
                        <span className={`px-2.5 py-1 rounded-md text-[10px] font-black uppercase tracking-wider
                            ${data?.status === 'suspended' ? 'bg-amber-100 text-amber-700' :
                              isScheduled ? 'bg-emerald-100 text-emerald-700' :
                              'bg-indigo-100 text-indigo-700'}
                        `}>
                            {data?.status === 'suspended' ? 'Suspendida' : (isScheduled ? 'Programada' : 'En Preparación')}
                        </span>
                    </div>

                    <div className="space-y-4">
                        <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
                            <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Procedimiento</span>
                            <span className="text-sm font-bold text-slate-800 leading-snug">
                                {data?.procedure_name || 'No especificado'}
                            </span>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
                                <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Fecha</span>
                                <span className="text-sm font-bold text-slate-800">
                                    {data?.surgery_date ? new Date(data.surgery_date + 'T12:00:00').toLocaleDateString('es-AR') : 'A Confirmar'}
                                </span>
                            </div>
                            <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
                                <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Quirófano / Hora</span>
                                <span className="text-sm font-bold text-slate-800">
                                    {data?.operating_rooms?.name || 'S/A'} | {data?.start_time || '--:--'}
                                </span>
                            </div>
                        </div>

                        <div className="bg-blue-50/50 p-3 rounded-lg border border-blue-100 flex items-center gap-3">
                            <div className="size-10 bg-white rounded-full flex items-center justify-center text-blue-500 shadow-sm shrink-0 border border-blue-100">
                                <span className="material-symbols-outlined">person</span>
                            </div>
                            <div>
                                <span className="block text-[10px] font-bold text-blue-500 uppercase tracking-wider mb-0.5">Cirujano</span>
                                <span className="text-sm font-bold text-slate-800">
                                    {data?.doctors?.full_name || 'No asignado'}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Patient Extra Data */}
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5">
                    <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest mb-4 flex items-center gap-2">
                        <span className="material-symbols-outlined text-slate-400 text-lg">description</span>
                        Más Información
                    </h3>
                    
                    <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                        <div>
                            <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">DNI</span>
                            <span className="text-sm font-bold text-slate-700">{patient?.document_number || '-'}</span>
                        </div>
                        <div>
                            <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">HC</span>
                            <span className="text-sm font-bold text-slate-700">{patient?.medical_record_number || '-'}</span>
                        </div>
                        <div>
                            <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">NUC</span>
                            <span className="text-sm font-bold text-slate-700">{patient?.nuc || '-'}</span>
                        </div>
                        <div>
                            <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Teléfono</span>
                            <span className="text-sm font-bold text-slate-700">{patient?.phone || '-'}</span>
                        </div>
                        <div className="col-span-2">
                            <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Cobertura</span>
                            <span className="text-sm font-bold text-slate-700">{data?.medical_coverage || '-'}</span>
                        </div>
                    </div>
                </div>

            </div>
        </div>
    );
};
