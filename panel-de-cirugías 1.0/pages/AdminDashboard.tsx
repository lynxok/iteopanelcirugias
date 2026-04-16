import React, { useState, useEffect } from 'react';
import { supabase } from '../src/lib/supabase';
import { useAuth } from '../src/lib/AuthContext';
import { Surgery, SurgeryStatus } from '../types';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';

export const AdminDashboard: React.FC = () => {
    const { user } = useAuth();
    const [surgeries, setSurgeries] = useState<Surgery[]>([]);
    const [loading, setLoading] = useState(true);
    const [filterStatus, setFilterStatus] = useState<string>('all');
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedSurgeryDetails, setSelectedSurgeryDetails] = useState<Surgery | null>(null);

    const calculateAge = (birth_date: string | undefined) => {
        if (!birth_date) return 'N/A';
        const birthDate = new Date(birth_date);
        const today = new Date();
        let age = today.getFullYear() - birthDate.getFullYear();
        const m = today.getMonth() - birthDate.getMonth();
        if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
            age--;
        }
        return age;
    };

    useEffect(() => {
        fetchSurgeries();
    }, []);

    const fetchSurgeries = async () => {
        setLoading(true);
        // Fetch surgeries (Pending and Scheduled mostly relevant)
        // We join patient, doctor, procedure to show details
        const { data, error } = await supabase
            .from('surgeries')
            .select(`
                *,
                patient:patients(*),
                doctor:doctors!doctor_id(full_name)
            `)
            .order('created_at', { ascending: false });

        if (error) {
            console.error('Error fetching surgeries:', error);
        } else {
            // Map data to Surgery type (handling joins if necessary)
            const mapped: Surgery[] = (data || []).map((s: any) => ({
                ...s,
                patient: {
                    ...s.patient,
                    name: s.patient?.full_name || 'Desconocido',
                    initials: s.patient?.full_name
                        ? s.patient.full_name.split(' ').map((n: any) => n[0]).join('').substring(0, 2).toUpperCase()
                        : '??'
                },
                doctor: s.doctor?.full_name || 'Desconocido',
                procedure: s.procedure_name || 'Desconocido',
                // Map fields
                date: s.surgery_date,
                time: s.start_time,
                orRoom: s.operating_room_id,
                patientAvailableFrom: s.patient_available_from,
                adminConfirmation: s.admin_confirmation,
                confirmedBy: s.confirmed_by,
                patientUnableToAttend: s.patient_unable_to_attend
            }));
            setSurgeries(mapped);
        }
        setLoading(false);
    };

    const handleDateChange = async (surgeryId: string, date: string) => {
        // Optimistic update
        setSurgeries(prev => prev.map(s => s.id === surgeryId ? { ...s, patientAvailableFrom: date } : s));

        const { error } = await supabase
            .from('surgeries')
            .update({ patient_available_from: date || null })
            .eq('id', surgeryId);

        if (error) {
            console.error('Error updating availability:', error);
            alert('Error al actualizar fecha.');
            fetchSurgeries();
        } else {
            // Audit log
            const surgery = surgeries.find(s => s.id === surgeryId);
            supabase.from('audit_logs').insert({
                user_name: user?.name || 'Usuario',
                user_role: user?.role,
                action: 'UPDATE',
                resource: 'Cirugía',
                resource_id: surgeryId,
                description: `Administración: Disponibilidad de Paciente ${surgery?.patient?.full_name || ''} fijada para ${date || 'Indefinido'}`,
                meta: { source: 'AdminDashboard', patient_name: surgery?.patient?.full_name }
            }).then(({ error: auditError }) => {
                if (auditError) console.warn('Silent Audit Error:', auditError);
            });
        }
    };

    const toggleConfirmation = async (surgeryId: string, currentVal: boolean) => {
        const newVal = !currentVal;
        const confirmedByName = newVal ? (user?.name || user?.email || 'Admin') : null;

        setSurgeries(prev => prev.map(s => s.id === surgeryId ? { ...s, adminConfirmation: newVal, confirmedBy: confirmedByName } : s));

        const { error } = await supabase
            .from('surgeries')
            .update({
                admin_confirmation: newVal,
                confirmed_by: confirmedByName
            })
            .eq('id', surgeryId);

        if (error) {
            console.error('Error updating confirmation:', error);
            alert('Error al actualizar confirmación.');
            fetchSurgeries();
        } else {
            // Audit log
            const surgery = surgeries.find(s => s.id === surgeryId);
            supabase.from('audit_logs').insert({
                user_name: user?.name || 'Usuario',
                user_role: user?.role,
                action: 'UPDATE',
                resource: 'Cirugía',
                resource_id: surgeryId,
                description: `Administración: Confirmación Administrativa ${newVal ? 'REALIZADA' : 'CANCELADA'} para ${surgery?.patient?.full_name || ''}`,
                meta: { source: 'AdminDashboard', confirmed_by: confirmedByName }
            }).then(({ error: auditError }) => {
                if (auditError) console.warn('Silent Audit Error:', auditError);
            });
        }
    };

    const handleClearAvailability = async (surgeryId: string) => {
        setSurgeries(prev => prev.map(s => s.id === surgeryId ? { ...s, patientAvailableFrom: null } : s));

        const { error } = await supabase
            .from('surgeries')
            .update({ patient_available_from: null })
            .eq('id', surgeryId);

        if (error) {
            console.error('Error clearing availability:', error);
            alert('Error al quitar fecha de disponibilidad.');
            fetchSurgeries();
        } else {
            // Audit log
            const surgery = surgeries.find(s => s.id === surgeryId);
            supabase.from('audit_logs').insert({
                user_name: user?.name || 'Usuario',
                user_role: user?.role,
                action: 'UPDATE',
                resource: 'Cirugía',
                resource_id: surgeryId,
                description: `Administración: Fecha de disponibilidad QUITADA para ${surgery?.patient?.full_name || ''}`,
                meta: { source: 'AdminDashboard' }
            }).then(({ error: auditError }) => {
                if (auditError) console.warn('Silent Audit Error:', auditError);
            });
        }
    };

    const handleToggleUnable = async (surgeryId: string, currentVal: boolean) => {
        const newVal = !currentVal;
        setSurgeries(prev => prev.map(s => s.id === surgeryId ? { ...s, patientUnableToAttend: newVal } : s));

        const { error } = await supabase
            .from('surgeries')
            .update({ patient_unable_to_attend: newVal })
            .eq('id', surgeryId);

        if (error) {
            console.error('Error updating unable status:', error);
            alert('Error al notificar inasistencia.');
            fetchSurgeries();
        } else {
            // Audit log
            const surgery = surgeries.find(s => s.id === surgeryId);
            supabase.from('audit_logs').insert({
                user_name: user?.name || 'Usuario',
                user_role: user?.role,
                action: 'UPDATE',
                resource: 'Cirugía',
                resource_id: surgeryId,
                description: `Administración: Marcación de ${newVal ? 'PACIENTE NO ASISTIRÁ' : 'PACIENTE ASISTIRÁ'} para ${surgery?.patient?.full_name || ''}`,
                meta: { source: 'AdminDashboard' }
            }).then(({ error: auditError }) => {
                if (auditError) console.warn('Silent Audit Error:', auditError);
            });
        }
    };

    // Filter Logic
    const filteredSurgeries = surgeries.filter(s => {
        const matchesSearch =
            (s.patient.full_name || s.patient.name).toLowerCase().includes(searchTerm.toLowerCase()) ||
            s.patient.document_number?.includes(searchTerm) ||
            (s.doctor && s.doctor.toLowerCase().includes(searchTerm.toLowerCase()));

        const currentStatus = s.status as unknown as string;

        // --- Filter out past scheduled surgeries ---
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        if (s.date) {
            const surgeryDate = parseISO(s.date);
            if (surgeryDate < today && currentStatus === 'scheduled') {
                return false;
            }
        }

        if (filterStatus === 'all') return matchesSearch;

        if (filterStatus === 'waiting_date') {
            return matchesSearch && (currentStatus === 'pending_validation' || !s.date) && currentStatus !== 'suspended' && currentStatus !== 'completed' && currentStatus !== 'cancelled';
        }

        return matchesSearch && currentStatus === filterStatus;
    });

    if (loading) return <div className="p-8 text-center">Cargando tablero...</div>;

    return (
        <div className="p-6 bg-gray-50 h-screen flex flex-col">
            <header className="mb-6 flex flex-col md:flex-row justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold text-gray-800">Tablero Administrativo</h1>
                    <p className="text-gray-500">Gestión de disponibilidad y confirmación de pacientes</p>
                </div>
                {/* Filters */}
                <div className="mt-4 md:mt-0 flex gap-4">
                    <input
                        type="text"
                        placeholder="Buscar paciente, DNI o médico..."
                        className="px-4 py-2 border rounded-lg"
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                    />
                    <select
                        className="px-4 py-2 border rounded-lg"
                        value={filterStatus}
                        onChange={e => setFilterStatus(e.target.value)}
                    >
                        <option value="all">Todos los Estados</option>
                        <option value="waiting_date">A la espera de fecha</option>
                        <option value="pending_validation">Pendientes</option>
                        <option value="scheduled">Programadas</option>
                        <option value="completed">Completadas</option>
                    </select>
                </div>
            </header>

            <div className="bg-white rounded-xl shadow overflow-x-auto flex-1">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Paciente</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Procedimiento / Médico</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Estado</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Fecha Turno</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Disponibilidad Paciente</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Confirmación</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                        {filteredSurgeries.map((surgery) => (
                            <tr
                                key={surgery.id}
                                className={`hover:bg-blue-50 cursor-pointer transition-colors ${surgery.date && !surgery.adminConfirmation ? 'bg-orange-50/50' : ''}`}
                                onClick={() => setSelectedSurgeryDetails(surgery)}
                            >
                                <td className="px-6 py-4 whitespace-nowrap">
                                    <div className="flex flex-col gap-0.5">
                                        <div className="text-sm font-bold text-gray-900 leading-tight">{surgery.patient.full_name}</div>
                                        <div className="flex items-center gap-2">
                                            <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded font-bold uppercase">DNI: {surgery.patient.document_number}</span>
                                            {surgery.patient.phone && (
                                                <a
                                                    href={`https://wa.me/${surgery.patient.phone.replace(/\D/g, '')}`}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="flex items-center gap-1 text-[10px] bg-green-50 text-green-700 px-1.5 py-0.5 rounded hover:bg-green-100 transition-colors font-bold border border-green-100"
                                                    onClick={(e) => e.stopPropagation()}
                                                >
                                                    <span className="material-symbols-outlined text-[10px] font-bold">chat</span>
                                                    WhatsApp
                                                </a>
                                            )}
                                        </div>
                                        {surgery.patient.phone && (
                                            <div className="text-[10px] text-slate-400 font-mono mt-0.5">{surgery.patient.phone}</div>
                                        )}
                                    </div>
                                </td>
                                <td className="px-6 py-4">
                                    <div className="text-sm text-gray-900">{surgery.procedure}</div>
                                    <div className="text-sm text-gray-500">{surgery.doctor}</div>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                    <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full 
                                        ${((surgery.status as unknown as string) === 'pending_validation' || (surgery.status as unknown as string) === 'waiting_date') ? 'bg-yellow-100 text-yellow-800' : ''}
                                        ${(surgery.status as unknown as string) === 'scheduled' ? 'bg-green-100 text-green-800' : ''}
                                        ${(surgery.status as unknown as string) === 'completed' ? 'bg-blue-100 text-blue-800' : ''}
                                        ${(surgery.status as unknown as string) === 'suspended' ? 'bg-red-100 text-red-800' : ''}
                                    `}>
                                        {(surgery.status as unknown as string) === 'pending_validation' ? 'Pendiente' :
                                            (surgery.status as unknown as string) === 'scheduled' ? 'Programada' :
                                                (surgery.status as unknown as string) === 'completed' ? 'Completada' :
                                                    (surgery.status as unknown as string) === 'suspended' ? 'Suspendida' :
                                                        surgery.status}
                                    </span>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                    {surgery.date ? (
                                        <div className="flex flex-col">
                                            <span className="text-sm font-bold text-slate-900">
                                                {format(parseISO(surgery.date), 'dd/MM/yyyy')}
                                            </span>
                                            <span className="text-xs text-slate-500 font-mono">
                                                {surgery.time} hs
                                            </span>
                                        </div>
                                    ) : (
                                        <span className="text-xs text-slate-400 italic">No asignada</span>
                                    )}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                                    <div className="flex flex-col">
                                        <label className="text-xs text-gray-500 mb-1">A partir de:</label>
                                        <div className="flex items-center gap-1 group">
                                            <input
                                                type="date"
                                                className="border rounded px-2 py-1 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                                                value={surgery.patientAvailableFrom || ''}
                                                onChange={(e) => handleDateChange(surgery.id, e.target.value)}
                                            />
                                            {surgery.patientAvailableFrom && (
                                                <button
                                                    onClick={() => handleClearAvailability(surgery.id)}
                                                    className="text-gray-400 hover:text-red-500 p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                                                    title="Borrar disponibilidad"
                                                >
                                                    <span className="material-symbols-outlined text-lg">close</span>
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                                    {surgery.date ? (
                                        <div className="flex flex-col items-center gap-2">
                                            <div className="flex items-center gap-2">
                                                <button
                                                    onClick={() => toggleConfirmation(surgery.id, !!surgery.adminConfirmation)}
                                                    className={`flex items-center gap-2 px-3 py-1 rounded-full text-sm font-medium transition-colors
                                                        ${surgery.adminConfirmation
                                                            ? 'bg-green-100 text-green-700 hover:bg-green-200'
                                                            : 'bg-red-100 text-red-700 hover:bg-red-200 animate-pulse'}
                                                    `}
                                                >
                                                    {surgery.adminConfirmation ? (
                                                        <>✓ Confirmado</>
                                                    ) : (
                                                        <>⚠ Pendiente</>
                                                    )}
                                                </button>
                                                {surgery.adminConfirmation && surgery.confirmedBy && (
                                                    <span className="text-[10px] text-slate-400 italic">
                                                        por {surgery.confirmedBy}
                                                    </span>
                                                )}
                                                <button
                                                    onClick={() => handleToggleUnable(surgery.id, !!surgery.patientUnableToAttend)}
                                                    className={`p-1.5 rounded-lg transition-all flex items-center gap-1 ${surgery.patientUnableToAttend
                                                        ? 'text-red-500 bg-red-50 hover:bg-red-100'
                                                        : 'text-slate-400 hover:text-red-500 hover:bg-red-50'
                                                        }`}
                                                    title={surgery.patientUnableToAttend ? "Cancelar alerta de inasistencia" : "Notificar que el paciente no puede asistir"}
                                                >
                                                    <span className="material-symbols-outlined text-lg">
                                                        {surgery.patientUnableToAttend ? 'notification_important' : 'person_off'}
                                                    </span>
                                                </button>
                                            </div>
                                            {!surgery.adminConfirmation && (
                                                <span className="text-xs text-red-500 font-semibold uppercase tracking-tighter">
                                                    ¡Requiere contacto!
                                                </span>
                                            )}
                                        </div>
                                    ) : (
                                        <span className="text-xs text-gray-400">Sin fecha asignada</span>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                {filteredSurgeries.length === 0 && (
                    <div className="p-8 text-center text-gray-500">
                        No se encontraron cirugías con los filtros actuales.
                    </div>
                )}
            </div>

            {/* Patient Detail Modal */}
            {selectedSurgeryDetails && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-300">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col border border-slate-200 overflow-hidden">
                        <div className="p-6 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
                            <div>
                                <h3 className="text-xl font-bold text-slate-900">Detalles del Paciente</h3>
                                <p className="text-xs text-blue-600 font-bold uppercase tracking-wider">Ficha Administrativa</p>
                            </div>
                            <button
                                onClick={() => setSelectedSurgeryDetails(null)}
                                className="size-10 flex items-center justify-center rounded-full hover:bg-slate-200 text-slate-400 transition-colors"
                            >
                                <span className="material-symbols-outlined">close</span>
                            </button>
                        </div>

                        <div className="p-8 space-y-6">
                            <div className="grid grid-cols-2 gap-6">
                                <div className="col-span-2">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Nombre Completo</label>
                                    <p className="text-lg font-bold text-slate-900">{selectedSurgeryDetails.patient.full_name}</p>
                                </div>

                                <div>
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Documento (DNI)</label>
                                    <p className="text-base font-semibold text-slate-700">{selectedSurgeryDetails.patient.document_number || 'N/A'}</p>
                                </div>

                                <div>
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Teléfono</label>
                                    <p className="text-base font-semibold text-slate-700">{selectedSurgeryDetails.patient.phone || 'N/A'}</p>
                                </div>

                                <div className="col-span-2">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Procedimiento</label>
                                    <p className="text-base font-semibold text-blue-800 bg-blue-50 px-3 py-2 rounded-lg border border-blue-100">{selectedSurgeryDetails.procedure}</p>
                                </div>

                                <div className="col-span-2">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Domicilio</label>
                                    <p className="text-base font-semibold text-slate-700">{selectedSurgeryDetails.patient.address || 'No registrado'}</p>
                                </div>

                                <div>
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Fecha de Nacimiento</label>
                                    <p className="text-base font-semibold text-slate-700">
                                        {selectedSurgeryDetails.patient.birth_date
                                            ? format(parseISO(selectedSurgeryDetails.patient.birth_date), 'dd/MM/yyyy')
                                            : 'N/A'}
                                    </p>
                                </div>

                                <div>
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Edad</label>
                                    <p className="text-base font-semibold text-slate-700">{calculateAge(selectedSurgeryDetails.patient.birth_date)} años</p>
                                </div>
                            </div>
                        </div>

                        <div className="p-6 border-t border-slate-100 bg-slate-50 flex justify-end">
                            <button
                                onClick={() => setSelectedSurgeryDetails(null)}
                                className="px-8 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-bold text-sm shadow-lg transition-all active:scale-95"
                            >
                                Cerrar
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div >
    );
};
