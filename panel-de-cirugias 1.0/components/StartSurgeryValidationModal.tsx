import React, { useEffect, useState } from 'react';
import { supabase } from '../src/lib/supabase';

export interface StartValidationTarget {
    id: string;
    patient: string;
    procedure: string;
    doctorId?: string;
    doctor: string;
    anesthesiologistId?: string;
    anesthetist?: string;
}

export interface ValidatedTeamData {
    doctorId: string;
    doctorName: string;
    anesthesiologistId: string;
    anesthetistName: string;
    ayudante1: string;
    ayudante2: string;
}

interface StartSurgeryValidationModalProps {
    isOpen: boolean;
    surgery: StartValidationTarget | null;
    submitting: boolean;
    onClose: () => void;
    onConfirm: (data: ValidatedTeamData) => Promise<void>;
}

interface DoctorOption {
    id: string;
    full_name: string;
    specialty?: string | null;
}

interface UserOption {
    id: string;
    name: string;
    role: string;
    doctor_id?: string | null;
    specialty?: string | null;
}

const StartSurgeryValidationModal: React.FC<StartSurgeryValidationModalProps> = ({
    isOpen,
    surgery,
    submitting,
    onClose,
    onConfirm
}) => {
    const [loadingData, setLoadingData] = useState(false);
    const [doctors, setDoctors] = useState<DoctorOption[]>([]);
    const [users, setUsers] = useState<UserOption[]>([]);

    const [doctorId, setDoctorId] = useState('');
    const [anesthesiologistId, setAnesthesiologistId] = useState('');
    const [ayudante1, setAyudante1] = useState('');
    const [ayudante2, setAyudante2] = useState('');
    const [validationError, setValidationError] = useState<string | null>(null);

    useEffect(() => {
        if (!isOpen || !surgery) return;

        let cancelled = false;
        setValidationError(null);
        setLoadingData(true);

        const loadInitialData = async () => {
            try {
                const [doctorsRes, usersRes, sxRes, formRes] = await Promise.all([
                    supabase
                        .from('doctors')
                        .select('id, full_name, specialty')
                        .eq('active', true)
                        .order('full_name', { ascending: true }),
                    supabase
                        .from('users')
                        .select('id, name, role, doctor_id, doctors(specialty)')
                        .eq('active', true)
                        .order('name', { ascending: true }),
                    supabase
                        .from('surgeries')
                        .select('doctor_id, anesthesiologist_id')
                        .eq('id', surgery.id)
                        .maybeSingle(),
                    supabase
                        .from('surgery_forms')
                        .select('ayudante_1, ayudante_2')
                        .eq('surgery_id', surgery.id)
                        .maybeSingle()
                ]);

                if (cancelled) return;

                if (doctorsRes.data) {
                    setDoctors(doctorsRes.data);
                }

                if (usersRes.data) {
                    setUsers(
                        usersRes.data.map((u: any) => ({
                            id: u.id,
                            name: u.name,
                            role: u.role,
                            doctor_id: u.doctor_id,
                            specialty: u.doctors?.specialty || null
                        }))
                    );
                }

                setDoctorId(sxRes.data?.doctor_id || surgery.doctorId || '');
                setAnesthesiologistId(sxRes.data?.anesthesiologist_id || surgery.anesthesiologistId || '');
                setAyudante1(formRes.data?.ayudante_1 || '');
                setAyudante2(formRes.data?.ayudante_2 || '');
            } catch (err) {
                console.error('[StartSurgeryValidationModal] Error cargando equipo quirúrgico:', err);
                if (!cancelled) {
                    setDoctorId(surgery.doctorId || '');
                    setAnesthesiologistId(surgery.anesthesiologistId || '');
                }
            } finally {
                if (!cancelled) {
                    setLoadingData(false);
                }
            }
        };

        loadInitialData();

        return () => {
            cancelled = true;
        };
    }, [isOpen, surgery]);

    if (!isOpen || !surgery) return null;

    // Specialists: active doctors excluding Anestesista (always keeping current doctorId if present)
    const specialistOptions = doctors.filter(
        d => d.specialty !== 'Anestesista' || d.id === doctorId
    );

    // Anesthesiologists: merge doctors with specialty 'Anestesista' and users with role/specialty 'Anestesista'
    const anesthetistMap = new Map<string, string>();
    doctors
        .filter(d => d.specialty === 'Anestesista' || d.id === anesthesiologistId)
        .forEach(d => {
            anesthetistMap.set(d.id, d.full_name);
        });
    users
        .filter(u => (u.specialty === 'Anestesista' || u.role === 'Anestesista') && u.doctor_id)
        .forEach(u => {
            if (u.doctor_id && !anesthetistMap.has(u.doctor_id)) {
                anesthetistMap.set(u.doctor_id, u.name);
            }
        });
    const anesthetistOptions = Array.from(anesthetistMap.entries())
        .map(([id, name]) => ({ id, name }))
        .sort((a, b) => a.name.localeCompare(b.name));

    const medicalAssistants = users.filter(
        u =>
            (u.role === 'Medico' || u.role === 'DireccionMedica' || u.role === 'JefaturaDeGuardia') &&
            u.specialty !== 'Anestesista'
    );
    const residentAssistants = users.filter(
        u => u.role === 'Residente' && u.specialty !== 'Anestesista'
    );

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!doctorId) {
            setValidationError('Debe seleccionar el especialista a cargo de la cirugía.');
            return;
        }
        if (!anesthesiologistId) {
            setValidationError('Debe seleccionar el médico anestesista.');
            return;
        }

        setValidationError(null);
        const doctorName = specialistOptions.find(d => d.id === doctorId)?.full_name || surgery.doctor || '';
        const anesthetistName = anesthetistMap.get(anesthesiologistId) || surgery.anesthetist || '';

        await onConfirm({
            doctorId,
            doctorName,
            anesthesiologistId,
            anesthetistName,
            ayudante1,
            ayudante2
        });
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
            <div className="w-full max-w-lg rounded-2xl bg-[#1A2027] border border-white/10 shadow-2xl overflow-hidden">
                <div className="px-5 py-4 border-b border-white/10 bg-[#14191F] flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                        <span className="material-symbols-outlined text-emerald-400 text-2xl">verified_user</span>
                        <div>
                            <h3 className="text-sm font-black uppercase tracking-wider text-white">
                                Validar Equipo Quirúrgico
                            </h3>
                            <p className="text-[11px] text-slate-400">
                                Confirmar profesionales antes de iniciar y sincronizar con GlobalApp
                            </p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={submitting}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors disabled:opacity-50"
                        title="Cancelar"
                    >
                        <span className="material-symbols-outlined text-lg">close</span>
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-5 space-y-4">
                    <div className="rounded-xl bg-white/5 border border-white/10 p-3">
                        <p className="text-xs font-black text-white uppercase truncate">{surgery.patient}</p>
                        <p className="text-[11px] text-slate-400 truncate mt-0.5">{surgery.procedure}</p>
                    </div>

                    {loadingData ? (
                        <div className="py-8 flex flex-col items-center justify-center text-slate-400 gap-2">
                            <span className="material-symbols-outlined animate-spin text-2xl text-emerald-400">progress_activity</span>
                            <span className="text-xs font-bold uppercase tracking-wider">Cargando equipo...</span>
                        </div>
                    ) : (
                        <div className="space-y-3.5">
                            <div>
                                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-300 mb-1">
                                    Especialista a Cargo <span className="text-red-400">*</span>
                                </label>
                                <select
                                    value={doctorId}
                                    onChange={e => { setDoctorId(e.target.value); setValidationError(null); }}
                                    disabled={submitting}
                                    className="w-full rounded-xl bg-[#11151A] border border-white/15 px-3 py-2.5 text-sm font-bold text-white focus:border-emerald-500 focus:outline-none"
                                >
                                    <option value="">Seleccionar especialista...</option>
                                    {specialistOptions.map(d => (
                                        <option key={d.id} value={d.id}>
                                            {d.full_name}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label className="block text-[11px] font-bold uppercase tracking-wider text-indigo-300 mb-1">
                                    Anestesista <span className="text-red-400">*</span>
                                </label>
                                <select
                                    value={anesthesiologistId}
                                    onChange={e => { setAnesthesiologistId(e.target.value); setValidationError(null); }}
                                    disabled={submitting}
                                    className="w-full rounded-xl bg-[#11151A] border border-indigo-500/30 px-3 py-2.5 text-sm font-bold text-white focus:border-indigo-400 focus:outline-none"
                                >
                                    <option value="">Seleccionar anestesista...</option>
                                    {anesthetistOptions.map(a => (
                                        <option key={a.id} value={a.id}>
                                            {a.name}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                                        1° Ayudante (Opcional)
                                    </label>
                                    <select
                                        value={ayudante1}
                                        onChange={e => setAyudante1(e.target.value)}
                                        disabled={submitting}
                                        className="w-full rounded-xl bg-[#11151A] border border-white/15 px-3 py-2.5 text-sm font-bold text-white focus:border-emerald-500 focus:outline-none"
                                    >
                                        <option value="">Sin ayudante</option>
                                        <optgroup label="MÉDICOS">
                                            {medicalAssistants.map(u => (
                                                <option key={u.id} value={u.name}>{u.name}</option>
                                            ))}
                                        </optgroup>
                                        <optgroup label="RESIDENTES">
                                            {residentAssistants.map(u => (
                                                <option key={u.id} value={u.name}>{u.name}</option>
                                            ))}
                                        </optgroup>
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                                        2° Ayudante (Opcional)
                                    </label>
                                    <select
                                        value={ayudante2}
                                        onChange={e => setAyudante2(e.target.value)}
                                        disabled={submitting}
                                        className="w-full rounded-xl bg-[#11151A] border border-white/15 px-3 py-2.5 text-sm font-bold text-white focus:border-emerald-500 focus:outline-none"
                                    >
                                        <option value="">Sin ayudante</option>
                                        <optgroup label="MÉDICOS">
                                            {medicalAssistants.map(u => (
                                                <option key={u.id} value={u.name}>{u.name}</option>
                                            ))}
                                        </optgroup>
                                        <optgroup label="RESIDENTES">
                                            {residentAssistants.map(u => (
                                                <option key={u.id} value={u.name}>{u.name}</option>
                                            ))}
                                        </optgroup>
                                    </select>
                                </div>
                            </div>
                        </div>
                    )}

                    {validationError && (
                        <div className="rounded-xl bg-red-500/15 border border-red-500/30 px-3 py-2 text-xs font-bold text-red-300 flex items-center gap-2">
                            <span className="material-symbols-outlined text-base">error</span>
                            {validationError}
                        </div>
                    )}

                    <div className="pt-2 flex items-center justify-end gap-2.5 border-t border-white/10">
                        <button
                            type="button"
                            onClick={onClose}
                            disabled={submitting}
                            className="px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 text-xs font-bold uppercase tracking-wider transition-colors disabled:opacity-50"
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            disabled={loadingData || submitting}
                            className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black uppercase tracking-wider transition-all shadow-lg active:scale-95 disabled:opacity-50 flex items-center gap-2"
                        >
                            <span className="material-symbols-outlined text-base">
                                {submitting ? 'progress_activity' : 'play_arrow'}
                            </span>
                            {submitting ? 'Iniciando...' : 'Confirmar e Iniciar'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default StartSurgeryValidationModal;
