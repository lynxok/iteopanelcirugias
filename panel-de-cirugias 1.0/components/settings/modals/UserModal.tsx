import React from 'react';
import SignatureCanvas from 'react-signature-canvas';
import { AppUser, Vendor, UserRole } from '../../../types';

interface UserModalProps {
    show: boolean;
    onClose: () => void;
    onSave: () => void;
    newUser: Partial<AppUser>;
    setNewUser: (user: Partial<AppUser>) => void;
    isEditing: boolean;
    vendors: Vendor[];
    specialties: string[];
    newUserSpecialty: string;
    setNewUserSpecialty: (spec: string) => void;
}

const UserModal: React.FC<UserModalProps> = ({
    show, onClose, onSave, newUser, setNewUser, isEditing, 
    vendors, specialties, newUserSpecialty, setNewUserSpecialty
}) => {
    if (!show) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4 animate-fadeIn">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[95vh] md:max-h-[90vh]">
                <div className="p-4 md:p-6 border-b border-slate-200 flex justify-between items-center bg-slate-50 rounded-t-2xl">
                    <h3 className="text-lg font-bold text-slate-900">
                        {isEditing ? 'Editar Usuario' : 'Crear Nuevo Usuario'}
                    </h3>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1">
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

                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-4">
                        <div className="flex items-center justify-between">
                            <p className="text-xs font-bold text-slate-700 uppercase flex items-center gap-2">
                                <span className="material-symbols-outlined text-sm text-indigo-600">notifications_active</span>
                                Preferencias de Comunicación
                            </p>
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                    type="checkbox"
                                    className="size-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                                    checked={newUser.auto_notify}
                                    onChange={e => setNewUser({ ...newUser, auto_notify: e.target.checked })}
                                />
                                <span className="text-[10px] font-bold text-slate-600 uppercase">Activar Avisos</span>
                            </label>
                        </div>

                        {newUser.auto_notify && (
                            <div className="space-y-4 pt-3 border-t border-slate-200 animate-fadeIn">
                                <div>
                                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-2">Método de Envío</label>
                                    <div className="grid grid-cols-2 gap-2">
                                        <button
                                            type="button"
                                            onClick={() => setNewUser({ ...newUser, notification_method: 'whatsapp' })}
                                            className={`flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-bold transition-all border ${newUser.notification_method === 'whatsapp' ? 'bg-emerald-50 border-emerald-500 text-emerald-700 shadow-sm' : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'}`}
                                        >
                                            <span className="material-symbols-outlined text-sm">chat</span>
                                            WhatsApp
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setNewUser({ ...newUser, notification_method: 'telegram' })}
                                            className={`flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-bold transition-all border ${newUser.notification_method === 'telegram' ? 'bg-blue-50 border-blue-500 text-blue-700 shadow-sm' : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'}`}
                                        >
                                            <span className="material-symbols-outlined text-sm">send</span>
                                            Telegram
                                        </button>
                                    </div>
                                </div>

                                {newUser.notification_method === 'telegram' ? (
                                    <div className="animate-slideDown">
                                        <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1.5">Telegram Chat ID</label>
                                        <input
                                            className="w-full bg-white text-slate-900 rounded-lg border border-slate-300 focus:ring-blue-500 focus:border-blue-500 px-3 py-2 text-sm placeholder-slate-400 font-mono"
                                            type="text"
                                            value={newUser.telegramChatId || ''}
                                            onChange={e => setNewUser({ ...newUser, telegramChatId: e.target.value })}
                                            placeholder="Ej: 123456789"
                                        />
                                        <p className="text-[9px] text-blue-600 mt-1 italic font-medium">El usuario debe iniciar chat con el Bot para obtener este ID.</p>
                                    </div>
                                ) : (
                                    <div className="animate-slideDown">
                                        <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1.5">Número de WhatsApp</label>
                                        <input
                                            className="w-full bg-white text-slate-900 rounded-lg border border-slate-300 focus:ring-emerald-500 focus:border-emerald-500 px-3 py-2 text-sm placeholder-slate-400"
                                            type="text"
                                            value={newUser.whatsapp_number || ''}
                                            onChange={e => setNewUser({ ...newUser, whatsapp_number: e.target.value })}
                                            placeholder="Ej: 549343..."
                                        />
                                    </div>
                                )}

                                <div className="space-y-2 pt-2 border-t border-slate-200">
                                    <p className="text-[10px] font-bold text-slate-500 uppercase mb-1">Alertas Específicas</p>
                                    
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
                                            <span className="text-[11px] font-medium text-slate-700 group-hover:text-indigo-600 transition-colors">
                                                {newUser.role === 'Ortopedia' ? 'Cirugía Programada' : 'Resumen Diario y Validaciones'}
                                            </span>
                                        </div>
                                    </label>

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
                                            <span className="text-[11px] font-medium text-slate-700 group-hover:text-indigo-600 transition-colors">
                                                {newUser.role === 'Ortopedia' ? 'Reprogramación de Día' : 'Demoras y Reprogramaciones'}
                                            </span>
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
                                            <span className="text-[11px] font-medium text-slate-700 group-hover:text-indigo-600 transition-colors">
                                                {newUser.role === 'Ortopedia' ? 'Suspensión o Cancelación' : 'Cambios de Estado y Enfermería'}
                                            </span>
                                        </div>
                                    </label>

                                    {newUser.role === 'Ortopedia' && (
                                        <label className="flex items-center gap-3 cursor-pointer group animate-fadeIn">
                                            <input
                                                type="checkbox"
                                                className="size-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                                                checked={newUser.notificationPreferences?.vendor_assignments}
                                                onChange={e => setNewUser({
                                                    ...newUser,
                                                    notificationPreferences: { ...newUser.notificationPreferences, vendor_assignments: e.target.checked }
                                                } as any)}
                                            />
                                            <div className="flex flex-col">
                                                <span className="text-[11px] font-medium text-slate-700 group-hover:text-indigo-600 transition-colors">Asignación de Proveedor</span>
                                            </div>
                                        </label>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                    
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
                    
                    <div className="bg-emerald-50 p-4 rounded-xl border border-emerald-200">
                        <label className="flex items-center gap-3 cursor-pointer group">
                            <input
                                type="checkbox"
                                className="size-4 rounded border-emerald-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                                checked={newUser.active}
                                onChange={e => setNewUser({ ...newUser, active: e.target.checked })}
                            />
                            <div className="flex flex-col">
                                <span className="text-sm font-bold text-emerald-900 group-hover:text-emerald-700 transition-colors uppercase tracking-tight">Usuario Activo / Validado</span>
                                <span className="text-[10px] text-emerald-700">Permite al usuario iniciar sesión y acceder al sistema.</span>
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
                                    vendorId: undefined,
                                    does_guardias: (e.target.value === 'Medico' || e.target.value === 'Tecnico' || e.target.value === 'Anestesista') ? newUser.does_guardias : false
                                });
                                if (e.target.value !== 'Medico') setNewUserSpecialty('');
                            }}
                        >
                            <option value="Medico">Médico</option>
                            <option value="Residente">Residente</option>
                            <option value="Tecnico">Técnico</option>
                            <option value="Administrativo">Administrativo</option>
                            <option value="Administrativo ART">Administrativo ART</option>
                            <option value="Administrativo de Guardias">Administrativo de Guardias</option>
                            <option value="Internacion">Enfermería</option>
                            <option value="Mucama">Mucama</option>
                            <option value="Oficina ART">Oficina ART</option>
                            <option value="Ortopedia">Proveedor Ortopedia</option>
                            <option value="Direccion">Dirección</option>
                            <option value="SuperAdmin">SuperAdmin</option>
                            <option value="RRHH">Recursos Humanos (RRHH)</option>
                        </select>
                    </div>

                    {newUser.role === 'Ortopedia' && (
                        <div className="bg-purple-50 p-4 rounded-lg border border-purple-100 animate-fadeIn space-y-3">
                            <div>
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
                            </div>
                            
                            <label className="flex items-start gap-3 cursor-pointer group pt-1 border-t border-purple-200">
                                <input
                                    type="checkbox"
                                    className="mt-0.5 size-4 rounded border-purple-300 text-purple-600 focus:ring-purple-500 cursor-pointer"
                                    checked={!!newUser.can_view_all_vendors}
                                    onChange={e => setNewUser({ ...newUser, can_view_all_vendors: e.target.checked })}
                                />
                                <div className="flex flex-col">
                                    <span className="text-xs font-bold text-purple-900 group-hover:text-purple-700 transition-colors uppercase tracking-tight">Acceso a otras cirugías</span>
                                    <span className="text-[10px] text-purple-600 leading-normal">
                                        Permitir ver y acceder a cirugías asignadas a otras ortopedias o sin ortopedia asignada.
                                    </span>
                                </div>
                            </label>

                            <p className="text-[10px] text-purple-600 leading-tight">
                                * Por defecto, los usuarios de ortopedia solo pueden ver y editar cirugías de su propia empresa.
                            </p>
                        </div>
                    )}

                    {newUser.role === 'Tecnico' && (
                        <div className="bg-rose-50 p-4 rounded-xl border border-rose-200 animate-fadeIn space-y-4">
                            <label className="flex items-center gap-3 cursor-pointer group">
                                <input
                                    type="checkbox"
                                    className="size-4 rounded border-rose-300 text-rose-600 focus:ring-rose-500 cursor-pointer"
                                    checked={!!newUser.does_guardias}
                                    onChange={e => setNewUser({ ...newUser, does_guardias: e.target.checked })}
                                />
                                <div className="flex flex-col">
                                    <span className="text-sm font-bold text-rose-900 group-hover:text-rose-700 transition-colors uppercase tracking-tight">¿Hace guardias?</span>
                                    <span className="text-[10px] text-rose-700">Permite asignar a este técnico como instrumentador/a en los turnos de guardias semanales.</span>
                                </div>
                            </label>
                            
                            <label className="flex items-center gap-3 cursor-pointer group pt-3 border-t border-rose-200">
                                <input
                                    type="checkbox"
                                    className="size-4 rounded border-rose-300 text-rose-600 focus:ring-rose-500 cursor-pointer"
                                    checked={!!newUser.is_turno_tarde}
                                    onChange={e => setNewUser({ ...newUser, is_turno_tarde: e.target.checked })}
                                />
                                <div className="flex flex-col">
                                    <span className="text-sm font-bold text-rose-900 group-hover:text-rose-700 transition-colors uppercase tracking-tight">Turno Tarde (Técnico Fijo)</span>
                                    <span className="text-[10px] text-rose-700">Identifica a este técnico como fijo de lunes a viernes en el turno de 15:00 a 19:00 hs.</span>
                                </div>
                            </label>

                            <label className="flex items-center gap-3 cursor-pointer group pt-3 border-t border-rose-200">
                                <input
                                    type="checkbox"
                                    className="size-4 rounded border-rose-300 text-rose-600 focus:ring-rose-500 cursor-pointer"
                                    checked={!!newUser.has_tecnico_section_access}
                                    onChange={e => setNewUser({ ...newUser, has_tecnico_section_access: e.target.checked })}
                                />
                                <div className="flex flex-col">
                                    <span className="text-sm font-bold text-rose-900 group-hover:text-rose-700 transition-colors uppercase tracking-tight">Habilitar Sección de Técnicos</span>
                                    <span className="text-[10px] text-rose-700">Permite a este técnico acceder a la sección de registro y liquidación de cirugías.</span>
                                </div>
                            </label>
                        </div>
                    )}

                    {newUser.role === 'Medico' && (
                        <div className="bg-blue-50 p-4 rounded-lg border border-blue-100 animate-fadeIn space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-blue-700 uppercase mb-1.5 flex items-center gap-1">
                                    <span className="material-symbols-outlined text-sm">medical_services</span>
                                    Especialidad Médica <span className="text-red-500">*</span>
                                </label>
                                <select
                                    className="w-full bg-white text-slate-900 rounded-lg border-blue-300 focus:ring-blue-500 focus:border-blue-500 px-3 py-2 text-sm"
                                    value={newUserSpecialty}
                                    onChange={e => {
                                        setNewUserSpecialty(e.target.value);
                                        if (e.target.value !== 'Cirugía General' && e.target.value !== 'Cirujano') {
                                            setNewUser({ ...newUser, does_guardias: false });
                                        }
                                    }}
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

                            <div className="bg-indigo-50 p-4 rounded-xl border border-indigo-200 animate-fadeIn">
                                <label className="flex items-center gap-3 cursor-pointer group">
                                    <input
                                        type="checkbox"
                                        className="size-4 rounded border-indigo-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                                        checked={!!newUser.does_guardias_medicas}
                                        onChange={e => setNewUser({ ...newUser, does_guardias_medicas: e.target.checked })}
                                    />
                                    <div className="flex flex-col">
                                        <span className="text-sm font-bold text-indigo-900 group-hover:text-indigo-700 transition-colors uppercase tracking-tight">¿Hace guardias médicas?</span>
                                        <span className="text-[10px] text-indigo-700">Permite asignar a este médico en los turnos de guardias de residentes.</span>
                                    </div>
                                </label>
                            </div>

                            {(newUserSpecialty === 'Cirugía General' || newUserSpecialty === 'Cirujano') && (
                                <div className="bg-rose-50 p-4 rounded-xl border border-rose-200 animate-fadeIn">
                                    <label className="flex items-center gap-3 cursor-pointer group">
                                        <input
                                            type="checkbox"
                                            className="size-4 rounded border-rose-300 text-rose-600 focus:ring-rose-500 cursor-pointer"
                                            checked={!!newUser.does_guardias}
                                            onChange={e => setNewUser({ ...newUser, does_guardias: e.target.checked })}
                                        />
                                        <div className="flex flex-col">
                                            <span className="text-sm font-bold text-rose-900 group-hover:text-rose-700 transition-colors uppercase tracking-tight">¿Hace guardias?</span>
                                            <span className="text-[10px] text-rose-700">Permite asignar a este médico en los turnos de guardias semanales.</span>
                                        </div>
                                    </label>
                                </div>
                            )}
                        </div>
                    )}

                    {newUser.role === 'Anestesista' && (
                        <div className="bg-purple-50 p-4 rounded-xl border border-purple-200 animate-fadeIn">
                            <label className="flex items-center gap-3 cursor-pointer group">
                                <input
                                    type="checkbox"
                                    className="size-4 rounded border-purple-300 text-purple-600 focus:ring-purple-500 cursor-pointer"
                                    checked={!!newUser.does_guardias}
                                    onChange={e => setNewUser({ ...newUser, does_guardias: e.target.checked })}
                                />
                                <div className="flex flex-col">
                                    <span className="text-sm font-bold text-purple-900 group-hover:text-purple-700 transition-colors uppercase tracking-tight">¿Hace guardias?</span>
                                    <span className="text-[10px] text-purple-700">Permite asignar a este anestesista en los turnos de guardias semanales.</span>
                                </div>
                            </label>
                        </div>
                    )}

                    {(newUser.role === 'Medico' || newUser.role === 'Residente') && (
                        <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 animate-fadeIn">
                            <label className="block text-xs font-bold text-slate-700 uppercase mb-1.5 flex items-center gap-1">
                                <span className="material-symbols-outlined text-sm">badge</span>
                                Número de Matrícula
                            </label>
                            <input
                                className="w-full bg-white text-slate-900 rounded-lg border border-slate-300 focus:ring-amber-500 focus:border-amber-500 px-3 py-2 text-sm placeholder-slate-400"
                                type="text"
                                value={newUser.license_number || ''}
                                onChange={e => setNewUser({ ...newUser, license_number: e.target.value })}
                                placeholder="Ej: 123456"
                            />
                        </div>
                    )}

                    {newUser.role === 'Residente' && (
                        <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 animate-fadeIn mt-4 space-y-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs font-bold text-slate-700 uppercase mb-1.5 flex items-center gap-1">
                                        <span className="material-symbols-outlined text-sm font-black text-amber-600">workspace_premium</span>
                                        Nivel de Residencia
                                    </label>
                                    <select
                                        className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500 font-medium"
                                        value={newUser.resident_level || ''}
                                        onChange={e => {
                                            const newLvl = (e.target.value as any) || null;
                                            setNewUser({ 
                                                ...newUser, 
                                                resident_level: newLvl,
                                                resident_level_valid_from: newUser.resident_level_valid_from || new Date().toISOString().slice(0, 7)
                                            });
                                        }}
                                    >
                                        <option value="">Seleccione un nivel...</option>
                                        <option value="R1">R1 (3 de 24hs / 5 de 12hs)</option>
                                        <option value="R2">R2 (2 de 24hs / 6 de 12hs)</option>
                                        <option value="R3">R3 (2 de 24hs / 4 de 12hs)</option>
                                        <option value="R4">R4 (1 de 24hs / 5 de 12hs)</option>
                                    </select>
                                </div>

                                {newUser.resident_level && (
                                    <div className="animate-fadeIn">
                                        <label className="block text-xs font-bold text-slate-700 uppercase mb-1.5 flex items-center gap-1">
                                            <span className="material-symbols-outlined text-sm font-black text-indigo-600">calendar_month</span>
                                            Vigente a partir de (Mes)
                                        </label>
                                        <input
                                            type="month"
                                            className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 font-medium"
                                            value={newUser.resident_level_valid_from ? newUser.resident_level_valid_from.slice(0, 7) : new Date().toISOString().slice(0, 7)}
                                            onChange={e => setNewUser({ ...newUser, resident_level_valid_from: e.target.value })}
                                        />
                                        <p className="text-[10px] text-slate-500 mt-1">
                                            El cálculo aplicará a partir de este mes inclusive sin alterar meses anteriores.
                                        </p>
                                    </div>
                                )}
                            </div>

                            {/* Historial de niveles registrados */}
                            {Array.isArray(newUser.resident_level_history) && newUser.resident_level_history.length > 0 && (
                                <div className="pt-3 border-t border-slate-200/80">
                                    <p className="text-[11px] font-bold text-slate-600 uppercase tracking-wide mb-2 flex items-center gap-1">
                                        <span className="material-symbols-outlined text-xs text-slate-400">history</span>
                                        Historial Registrado de Categorías:
                                    </p>
                                    <div className="flex flex-wrap gap-2">
                                        {[...newUser.resident_level_history]
                                            .filter(h => h && h.level && h.valid_from)
                                            .sort((a, b) => a.valid_from.localeCompare(b.valid_from))
                                            .map((item, idx) => {
                                                const dateParts = item.valid_from.split('-');
                                                const monthDate = new Date(Number(dateParts[0]), Number(dateParts[1]) - 1, 1);
                                                const monthLabel = monthDate.toLocaleDateString('es-ES', { month: 'short', year: 'numeric' });
                                                return (
                                                    <span 
                                                        key={idx} 
                                                        className="inline-flex items-center gap-1.5 bg-white border border-slate-200 text-slate-700 text-xs px-2.5 py-1 rounded-lg font-medium shadow-xs"
                                                    >
                                                        <span className="font-bold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded text-[10px] border border-amber-200">{item.level}</span>
                                                        <span className="text-[11px] text-slate-500 capitalize">desde {monthLabel}</span>
                                                        {newUser.resident_level_history && newUser.resident_level_history.length > 1 && (
                                                            <button
                                                                type="button"
                                                                title="Eliminar este hito del historial"
                                                                onClick={() => {
                                                                    const updated = newUser.resident_level_history?.filter((_, i) => i !== idx) || [];
                                                                    const latest = updated.length > 0 ? updated[updated.length - 1].level : null;
                                                                    setNewUser({
                                                                        ...newUser,
                                                                        resident_level_history: updated,
                                                                        resident_level: latest
                                                                    });
                                                                }}
                                                                className="text-slate-400 hover:text-red-500 ml-0.5 p-0.5 rounded transition-colors"
                                                            >
                                                                <span className="material-symbols-outlined text-[13px]">close</span>
                                                            </button>
                                                        )}
                                                    </span>
                                                );
                                            })}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {newUser.role === 'Residente' && (
                        <div className="bg-orange-50 p-4 rounded-xl border border-orange-200 animate-fadeIn mt-4">
                            <label className="flex items-center gap-3 cursor-pointer group">
                                <input
                                    type="checkbox"
                                    className="size-4 rounded border-orange-300 text-orange-600 focus:ring-orange-500 cursor-pointer"
                                    checked={!!newUser.can_edit_shifts}
                                    onChange={e => setNewUser({ ...newUser, can_edit_shifts: e.target.checked })}
                                />
                                <div className="flex flex-col">
                                    <span className="text-sm font-bold text-orange-900 group-hover:text-orange-700 transition-colors uppercase tracking-tight">¿Habilitado para editar guardias?</span>
                                    <span className="text-[10px] text-orange-700">Permite a este residente asignar las guardias del mes y cargar vacaciones.</span>
                                </div>
                            </label>
                        </div>
                    )}

                    {(newUser.role === 'Enfermeria' || newUser.role === 'Internacion' || (newUser.role as any) === 'JefaturaDeEnfermeria') && (
                        <div className="bg-sky-50 p-4 rounded-xl border border-sky-200 animate-fadeIn mt-4">
                            <label className="flex items-center gap-3 cursor-pointer group">
                                <input
                                    type="checkbox"
                                    className="size-4 rounded border-sky-300 text-sky-600 focus:ring-sky-500 cursor-pointer"
                                    checked={!!newUser.can_manage_nursing_shifts}
                                    onChange={e => setNewUser({ ...newUser, can_manage_nursing_shifts: e.target.checked })}
                                />
                                <div className="flex flex-col">
                                    <span className="text-sm font-bold text-sky-900 group-hover:text-sky-700 transition-colors uppercase tracking-tight">¿Responsable de Enfermería?</span>
                                    <span className="text-[10px] text-sky-700">Permite planificar cuadrante de turnos, asignar enfermeras, francos y registrar ausencias/vacaciones.</span>
                                </div>
                            </label>
                        </div>
                    )}


                    {(newUser.role === 'Medico' || newUser.role === 'Anestesista' || newUser.role === 'Residente') && (
                        <div className="border-t border-slate-200 pt-6 mt-6 space-y-4">
                            <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                                <span className="material-symbols-outlined text-indigo-500">draw</span>
                                Firma Digital y Seguridad
                            </h4>
                            
                            <div className="grid grid-cols-1 gap-6">
                                <div>
                                    <label className="block text-xs font-bold text-slate-700 uppercase mb-1.5">PIN de Firma (4 dígitos)</label>
                                    <div className="relative">
                                        <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">lock</span>
                                        <input 
                                            type="password"
                                            maxLength={4}
                                            placeholder="Ej: 1234"
                                            value={newUser.signature_pin || ''}
                                            onChange={(e) => setNewUser({...newUser, signature_pin: e.target.value.replace(/\D/g, '')})}
                                            className="w-full bg-white text-slate-900 rounded-lg border border-slate-300 focus:ring-indigo-500 focus:border-indigo-500 pl-10 pr-3 py-2 text-sm font-mono tracking-widest placeholder:tracking-normal"
                                        />
                                    </div>
                                    <p className="text-[10px] text-slate-500 mt-1">Este PIN permitirá al usuario validar documentos.</p>
                                </div>

                                <div className="space-y-2">
                                    <label className="block text-xs font-bold text-slate-700 uppercase mb-1.5">Firma del Usuario</label>
                                    
                                    {newUser.saved_signature ? (
                                        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex flex-col items-center justify-center gap-3">
                                            <img src={newUser.saved_signature} alt="Firma" className="max-h-24 object-contain mix-blend-multiply" />
                                            <button 
                                                onClick={() => setNewUser({...newUser, saved_signature: null})}
                                                className="text-[10px] font-bold text-red-600 hover:bg-red-50 px-3 py-1.5 rounded-lg border border-red-200 transition-colors flex items-center gap-1"
                                            >
                                                <span className="material-symbols-outlined text-sm">delete</span>
                                                Eliminar Firma y Capturar Nueva
                                            </button>
                                        </div>
                                    ) : (
                                        <div className="space-y-3">
                                            <div className="border-2 border-dashed border-slate-200 rounded-xl bg-slate-50 p-2 relative">
                                                <div className="bg-white rounded-lg shadow-inner overflow-hidden border border-slate-200">
                                                    <SignatureCanvas 
                                                        onEnd={() => {
                                                            const canvas = document.querySelector('.user-modal-canvas') as any;
                                                            if (canvas) {
                                                                const data = canvas.toDataURL('image/png');
                                                                setNewUser({...newUser, saved_signature: data});
                                                            }
                                                        }}
                                                        canvasProps={{
                                                            className: "user-modal-canvas w-full h-32 cursor-crosshair"
                                                        }}
                                                    />
                                                </div>
                                                <p className="text-[10px] text-slate-400 mt-1 italic text-center">Dibuje la firma arriba para capturarla.</p>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}
                </div>
                <div className="p-4 md:p-6 border-t border-slate-200 bg-slate-50 rounded-b-2xl flex justify-end gap-3">
                    <button
                        onClick={onClose}
                        className="px-4 py-2.5 text-slate-600 hover:bg-white hover:shadow-sm rounded-lg font-bold text-sm border border-transparent hover:border-slate-200 transition-all flex-1 md:flex-none"
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={onSave}
                        disabled={
                            !newUser.name ||
                            !newUser.email ||
                            (!isEditing && !newUser.password) ||
                            (newUser.role === 'Ortopedia' && !newUser.vendorId) ||
                            (newUser.role === 'Medico' && !newUserSpecialty)
                        }
                        className="px-4 py-2.5 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg font-bold text-sm shadow-sm transition-all flex-1 md:flex-none"
                    >
                        {isEditing ? 'Guardar Cambios' : 'Guardar Usuario'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default UserModal;
