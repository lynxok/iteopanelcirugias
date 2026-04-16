import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../src/lib/supabase';
import { useAuth } from '../src/lib/AuthContext';
import ProgressBar from '../components/ProgressBar';

type ScanStep = 'PATIENT' | 'BED' | 'SUCCESS' | 'ERROR';

const HospitalizationScanner: React.FC = () => {
    const navigate = useNavigate();
    const { user } = useAuth();
    
    const [step, setStep] = useState<ScanStep>('PATIENT');
    const [patientId, setPatientId] = useState<string | null>(null);
    const [bedId, setBedId] = useState<string | null>(null);
    const [patientName, setPatientName] = useState<string>('');
    const [bedCode, setBedCode] = useState<string>('');
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [patientAllergies, setPatientAllergies] = useState<string>('');

    const [doctors, setDoctors] = useState<{id: string, full_name: string, specialty?: string}[]>([]);
    const [selectedDoctorId, setSelectedDoctorId] = useState<string>('');
    const [manualCode, setManualCode] = useState('');

    useEffect(() => {
        fetchDoctors();
    }, []);

    const fetchDoctors = async () => {
        const { data } = await supabase.from('doctors').select('id, full_name, specialty').eq('active', true).order('full_name');
        if (data) {
            // Filter to show only surgeons (exclude anesthesiologists)
            const surgeons = data.filter(d => d.specialty !== 'Anestesista');
            setDoctors(surgeons);
        }
    };

    const isRunningRef = useRef(false);
    const scannerRef = useRef<Html5Qrcode | null>(null);

    const stopScanner = async () => {
        if (scannerRef.current && isRunningRef.current) {
            try {
                isRunningRef.current = false;
                await scannerRef.current.stop();
            } catch (e) {
                console.error('Error stopping scanner:', e);
            }
        }
    };

    const handlePatientScan = async (decodedText: string) => {
        setLoading(true);
        try {
            // Extract UUID from tracking URL if applicable
            let pId = decodedText.trim();
            if (decodedText.includes('/tracking/')) {
                pId = decodedText.split('/tracking/')[1].split(/[?#]/)[0];
            }
            // Strip # if it's there
            pId = pId.replace(/^#/, '');

            // Priority 1: Buscar por ID de cirugía (fragmento o completo) usando RPC para permitir cast a texto
            let surgery: any = null;
            const { data: rpcData, error: rpcError } = await (supabase as any).rpc('get_surgery_by_code', { 
                search_code: pId 
            });

            if (rpcData && rpcData.length > 0) {
                const { data: fullSurgery } = await supabase
                    .from('surgeries')
                    .select('id, doctor_id, patients(id, full_name, allergies)')
                    .eq('id', rpcData[0].id)
                    .maybeSingle();
                if (fullSurgery) surgery = fullSurgery;
            }

            // Priority 2: Si no se encontró y el código parece un DNI, buscar la cirugía más reciente del paciente
            if (!surgery && /^\d+$/.test(pId) && pId.length >= 7) {
                const { data: surgeriesByDni, error: dniError } = await supabase
                    .from('surgeries')
                    .select('id, doctor_id, surgery_date, created_at, patients!inner(id, full_name, allergies, document_number)')
                    .eq('patients.document_number', pId)
                    .order('surgery_date', { ascending: false })
                    .order('created_at', { ascending: false })
                    .limit(1);
                
                if (dniError) console.error('Error buscando por DNI:', dniError);
                if (surgeriesByDni && surgeriesByDni.length > 0) {
                    surgery = surgeriesByDni[0] as any;
                }
            }

            if (!surgery) {
                throw new Error('Paciente o Cirugía no encontrada (Código o DNI no válido)');
            }

            const patientData = Array.isArray(surgery.patients) ? surgery.patients[0] : surgery.patients;
            const pRealId = patientData?.id;
            const pName = patientData?.full_name || 'Desconocido';
            const pAllergies = (patientData as any)?.allergies || '';

            if (!pRealId) throw new Error('Error al obtener datos del paciente');

            setPatientId(pRealId);
            setPatientName(pName);
            setPatientAllergies(pAllergies);
            // Pre-select doctor if surgery has one
            if (surgery.doctor_id) setSelectedDoctorId(surgery.doctor_id);
            
            setStep('BED');
            setErrorMsg(null);
            
            // Restart scanner for the next step automatically
        } catch (err: any) {
            setErrorMsg(err.message || 'Código de paciente no válido');
        } finally {
            setLoading(false);
        }
    };

    const handleManualSubmit = () => {
        if (manualCode.length < 4) {
            setErrorMsg('El código debe tener al menos 4 caracteres');
            return;
        }
        handlePatientScan(manualCode);
    };

    const handleBedScan = async (decodedText: string) => {
        setLoading(true);
        try {
            // Bed QR should contain the bed_code or bed_id. 
            // We'll assume for now it's a bed_code string or bed UUID
            const { data: bed, error } = await supabase
                .from('hospital_beds')
                .select('id, bed_code, status')
                .or(`bed_code.eq.${decodedText},id.eq.${decodedText}`)
                .single();

            if (error || !bed) {
                throw new Error('Cama no encontrada');
            }

            if (bed.status === 'occupied') {
                throw new Error(`La cama ${bed.bed_code} ya está ocupada`);
            }

            setBedId(bed.id);
            setBedCode(bed.bed_code);
            
            // If we don't have a doctor selected yet, we might need to ask or just finalize.
            // For now, let's proceed to success but ensure finalizeAssignment handles the doctor_id
            await finalizeAssignment(patientId!, bed.id, selectedDoctorId);
            
            setStep('SUCCESS');
            await stopScanner();
        } catch (err: any) {
            setErrorMsg(err.message || 'Código de cama no válido');
        } finally {
            setLoading(false);
        }
    };

    const finalizeAssignment = async (pId: string, bId: string, dId?: string) => {
        const { error: admissionError } = await supabase
            .from('hospital_admissions')
            .insert({
                patient_id: pId,
                bed_id: bId,
                doctor_id: dId || null,
                check_in: new Date().toISOString(),
                allergies: patientAllergies
            });

        if (admissionError) {
            console.error('Error in admission:', admissionError);
            throw new Error('Error al crear la admisión: ' + admissionError.message);
        }

        const { error: bedUpdateError } = await supabase
            .from('hospital_beds')
            .update({ status: 'occupied' })
            .eq('id', bId);

        if (bedUpdateError) {
            console.error('Error updating bed:', bedUpdateError);
            throw new Error('Error al actualizar el estado de la cama: ' + bedUpdateError.message);
        }

        // Log the change
        const { error: historyError } = await supabase.from('hospital_bed_history').insert({
            bed_id: bId,
            status: 'occupied',
            changed_by: user?.name || 'Enfermería'
        });

        if (historyError) {
            console.warn('History log failed:', historyError);
            // Non-blocking but worthy of a log
        }
    };

    const handleSuccess = useCallback(async (decodedText: string) => {
        if (loading) return;

        if (step === 'PATIENT') {
            await handlePatientScan(decodedText);
        } else if (step === 'BED') {
            await handleBedScan(decodedText);
        }
    }, [step, loading, patientId]);

    const startScanner = useCallback(async () => {
        if (!document.getElementById('hospital-reader')) return;

        if (scannerRef.current) {
            try { await scannerRef.current.stop(); } catch { /* ignore */ }
        }

        const html5Qrcode = new Html5Qrcode('hospital-reader');
        scannerRef.current = html5Qrcode;

        try {
            await html5Qrcode.start(
                { facingMode: 'environment' },
                { fps: 10, qrbox: { width: 280, height: 280 } },
                handleSuccess,
                () => {}
            );
            isRunningRef.current = true;
        } catch (err) {
            setErrorMsg('Error al iniciar la cámara.');
        }
    }, [handleSuccess]);

    useEffect(() => {
        if (step === 'SUCCESS' || step === 'ERROR') return;
        
        const timer = setTimeout(startScanner, 300);
        return () => { 
            clearTimeout(timer);
            stopScanner();
        };
    }, [step, startScanner]);

    return (
        <div className="flex-1 h-full bg-slate-900 flex flex-col items-center justify-center p-6 text-white overflow-hidden relative">
            <ProgressBar isLoading={loading} />

            {/* Back Button */}
            <button 
                onClick={() => navigate('/hospitalization')}
                className="absolute top-6 left-6 size-12 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-all z-50"
            >
                <span className="material-symbols-outlined">arrow_back</span>
            </button>

            {/* Header / Info */}
            <div className="text-center mb-8 z-10">
                {step === 'PATIENT' && (
                    <>
                        <h2 className="text-2xl font-black mb-2 animate-pulse">PASO 1: ESCANEAR PACIENTE</h2>
                        <p className="text-slate-400 text-sm">Escanee el código QR de la pulsera del paciente.</p>
                    </>
                )}
                {step === 'BED' && (
                    <>
                        <h2 className="text-2xl font-black mb-2 text-primary animate-pulse">PASO 2: ESCANEAR CAMA</h2>
                        <p className="text-slate-400 text-sm">Escanee el código QR pegado en la cama.</p>
                        
                        <div className="mt-6 flex flex-col gap-3 w-full max-w-xs">
                            <div className="flex items-center gap-2 px-3 py-2 bg-white/10 rounded-2xl border border-white/20">
                                <span className="material-symbols-outlined text-sm text-emerald-400">person</span>
                                <span className="text-xs font-bold truncate">{patientName}</span>
                            </div>

                            <div className="flex flex-col gap-1 text-left">
                                <label className="text-[10px] font-black text-slate-500 uppercase ml-2 flex items-center gap-2">
                                    Médico a Cargo
                                    {selectedDoctorId && (
                                        <span className="text-[8px] bg-primary/20 text-primary px-1.5 py-0.5 rounded flex items-center gap-1 animate-pulse">
                                            <span className="material-symbols-outlined text-[10px]">magic_button</span>
                                            SUGERIDO POR CIRUGÍA
                                        </span>
                                    )}
                                </label>
                                <select 
                                    className="w-full h-11 bg-slate-800 border border-white/10 rounded-2xl px-4 text-sm font-bold text-white focus:border-primary transition-all outline-none"
                                    value={selectedDoctorId}
                                    onChange={(e) => setSelectedDoctorId(e.target.value)}
                                >
                                    <option value="">Seleccionar Médico...</option>
                                    {doctors.map(d => (
                                        <option key={d.id} value={d.id}>{d.full_name}</option>
                                    ))}
                                </select>
                            </div>
                        </div>
                    </>
                )}
            </div>

            {/* Scanner Container */}
            {(step === 'PATIENT' || step === 'BED') && (
                <div className="flex flex-col items-center gap-6 w-full max-w-sm">
                    <div className="relative w-full aspect-square bg-black rounded-3xl border-4 border-white/10 overflow-hidden shadow-2xl">
                        <div id="hospital-reader" className="w-full h-full"></div>
                        
                        {/* Scanner Overlay UI */}
                        <div className="absolute inset-x-0 top-0 h-1 bg-primary/50 animate-scan"></div>
                        <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                            <div className="size-64 border-2 border-primary/30 rounded-2xl relative">
                                <div className="absolute -top-1 -left-1 size-8 border-t-4 border-l-4 border-primary rounded-tl-lg"></div>
                                <div className="absolute -top-1 -right-1 size-8 border-t-4 border-r-4 border-primary rounded-tr-lg"></div>
                                <div className="absolute -bottom-1 -left-1 size-8 border-b-4 border-l-4 border-primary rounded-bl-lg"></div>
                                <div className="absolute -bottom-1 -right-1 size-8 border-b-4 border-r-4 border-primary rounded-br-lg"></div>
                            </div>
                        </div>
                    </div>

                    {step === 'PATIENT' && (
                        <div className="w-full flex flex-col gap-2">
                            <p className="text-[10px] font-black text-slate-500 uppercase ml-2">O ingrese código manual</p>
                            <div className="flex gap-2">
                                <input 
                                    type="text"
                                    placeholder="Ej: A1B2C3D4"
                                    className="flex-1 h-12 bg-slate-800 border border-white/10 rounded-2xl px-4 text-sm font-bold text-white uppercase outline-none focus:border-primary transition-all"
                                    value={manualCode}
                                    onChange={e => setManualCode(e.target.value)}
                                    onKeyDown={e => e.key === 'Enter' && handleManualSubmit()}
                                />
                                <button 
                                    onClick={handleManualSubmit}
                                    className="h-12 px-6 bg-primary text-slate-950 font-black rounded-2xl text-xs uppercase"
                                >
                                    INGRESAR
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Success State */}
            {step === 'SUCCESS' && (
                <div className="text-center animate-fadeInScale">
                    <div className="size-24 bg-emerald-500 rounded-full flex items-center justify-center mx-auto mb-6 shadow-lg shadow-emerald-500/20">
                        <span className="material-symbols-outlined text-5xl">check_circle</span>
                    </div>
                    <h2 className="text-3xl font-black mb-2">¡Asignación Exitosa!</h2>
                    <p className="text-slate-400 mb-8">El paciente ha sido vinculado a la cama <b>{bedCode}</b>.</p>
                    <button 
                        onClick={() => navigate('/hospitalization')}
                        className="px-8 py-3 bg-white text-slate-900 rounded-2xl font-black uppercase text-sm tracking-widest hover:scale-105 transition-all shadow-xl"
                    >
                        Volver a Enfermería
                    </button>
                </div>
            )}

            {/* Error Message */}
            {errorMsg && (
                <div className="mt-8 px-6 py-3 bg-red-500/20 border border-red-500/50 rounded-2xl flex items-center gap-3 animate-shake">
                    <span className="material-symbols-outlined text-red-500">error</span>
                    <p className="text-xs font-bold text-red-100">{errorMsg}</p>
                </div>
            )}

            {/* Footer Options */}
            {(step === 'PATIENT' || step === 'BED') && (
                <div className="mt-12 flex flex-col items-center gap-4">
                    <button 
                         onClick={() => {
                             setStep('PATIENT');
                             setPatientId(null);
                             setErrorMsg(null);
                         }}
                         className="text-xs font-bold text-slate-500 uppercase tracking-widest hover:text-white transition-colors"
                    >
                        Reiniciar Escaneo
                    </button>
                </div>
            )}
        </div>
    );
};

export default HospitalizationScanner;
