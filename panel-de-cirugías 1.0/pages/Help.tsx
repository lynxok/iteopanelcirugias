import React, { useState } from 'react';
import { useAuth } from '../src/lib/AuthContext';

const Help: React.FC = () => {
    const { user } = useAuth();
    const [activeTab, setActiveTab] = useState<'faq' | 'guide' | 'internacion' | 'admision' | 'roles'>('faq');

    return (
        <div className="flex-1 h-full overflow-y-auto bg-background p-8">
            <div className="max-w-5xl mx-auto flex flex-col gap-8">

                {/* Header */}
                <div className="flex flex-col gap-2">
                    <h2 className="text-3xl font-bold text-slate-900">Centro de Ayuda</h2>
                    <p className="text-slate-500 text-lg">Documentación oficial para la gestión del flujo quirúrgico e internación.</p>
                </div>

                {/* Navigation Tabs */}
                <div className="flex gap-4 border-b border-slate-200 overflow-x-auto scrollbar-hide">
                    <button
                        onClick={() => setActiveTab('faq')}
                        className={`pb-3 px-2 text-sm font-bold transition-all border-b-2 whitespace-nowrap ${activeTab === 'faq'
                            ? 'border-primary text-primary'
                            : 'border-transparent text-slate-500 hover:text-slate-700'
                            }`}
                    >
                        Preguntas Frecuentes
                    </button>
                    <button
                        onClick={() => setActiveTab('guide')}
                        className={`pb-3 px-2 text-sm font-bold transition-all border-b-2 whitespace-nowrap ${activeTab === 'guide'
                            ? 'border-primary text-primary'
                            : 'border-transparent text-slate-500 hover:text-slate-700'
                            }`}
                    >
                        Proceso Quirúrgico
                    </button>
                    <button
                        onClick={() => setActiveTab('internacion')}
                        className={`pb-3 px-2 text-sm font-bold transition-all border-b-2 whitespace-nowrap ${activeTab === 'internacion'
                            ? 'border-primary text-primary'
                            : 'border-transparent text-slate-500 hover:text-slate-700'
                            }`}
                    >
                        Mapa de Internación
                    </button>
                    <button
                        onClick={() => setActiveTab('admision')}
                        className={`pb-3 px-2 text-sm font-bold transition-all border-b-2 whitespace-nowrap ${activeTab === 'admision'
                            ? 'border-primary text-primary'
                            : 'border-transparent text-slate-500 hover:text-slate-700'
                            }`}
                    >
                        Admisión y QR
                    </button>
                    <button
                        onClick={() => setActiveTab('roles')}
                        className={`pb-3 px-2 text-sm font-bold transition-all border-b-2 whitespace-nowrap ${activeTab === 'roles'
                            ? 'border-primary text-primary'
                            : 'border-transparent text-slate-500 hover:text-slate-700'
                            }`}
                    >
                        Roles y Permisos
                    </button>
                </div>

                {/* Content Area */}
                <div className="animate-fadeIn pb-12">

                    {/* --- FAQ SECTION --- */}
                    {activeTab === 'faq' && (
                        <div className="space-y-4">
                            <FaqItem
                                question="¿Cómo cambio mi contraseña?"
                                answer="Puedes cambiar tu contraseña yendo a la sección 'Configuración' en el menú lateral y seleccionando 'Mi Perfil' o 'Usuarios' si tienes permisos. Si olvidaste tu contraseña y no puedes entrar, contacta a un Administrador."
                            />
                            <FaqItem
                                question="¿Qué hago si no encuentro un material en la lista/Kardex?"
                                answer="El sistema carga automáticamente materiales según el procedimiento. Si falta algo específico, puedes usar el campo de 'Notas Adicionales' en la solicitud de materiales, o contactar al área de Farmacia/Ortopedia para que actualicen el maestro de materiales."
                            />
                            <FaqItem
                                question="¿Por qué no puedo programar una cirugía de Urgencia?"
                                answer="Las cirugías de 'Urgencia' requieren una Validación Médica para ser programadas dentro de los primeros 14 días. Si el sistema te bloquea, es porque falta el 'Aval Médico de Urgencia'. El médico asignado debe entrar al detalle de la cirugía y tildar la casilla de aval."
                            />
                            <FaqItem
                                question="¿Cómo veo detalles rápidos de una cirugía?"
                                answer="En el Calendario (vistas de Mes, Semana o Día) y en la lista de Cirugías Pendientes, puedes pasar el mouse (hover) sobre cualquier tarjeta para ver un resumen premium con el nombre del paciente, obra social y médico asignado sin necesidad de abrir el detalle."
                            />
                            <FaqItem
                                question="¿Por qué el Monitor muestra varias cirugías?"
                                answer="El Monitor está diseñado para mostrar el flujo completo del día. Verás las cirugías terminadas hoy, la que está actualmente en curso y todas las cirugías programadas restantes para el resto de la jornada en cada quirófano."
                            />
                        </div>
                    )}

                    {/* --- GUIDE SECTION (SURGERY) --- */}
                    {activeTab === 'guide' && (
                        <div className="flex flex-col gap-8">

                            {/* Prioridades */}
                            <DocumentationSection title="Prioridades de Cirugía" icon="priority_high">
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    <PriorityCard
                                        title="Programada (Rutinaria)"
                                        color="blue"
                                        desc="Cirugías estándar planificadas con antelación."
                                        rules="Requiere validación de admisión y materiales."
                                    />
                                    <PriorityCard
                                        title="Urgencia"
                                        color="orange"
                                        desc="Casos que requieren atención pronta."
                                        rules="Regla de los 14 Días: Requiere Aval Médico para agendarse antes de las 2 semanas posteriores a su creación."
                                    />
                                    <PriorityCard
                                        title="Emergencia"
                                        color="red"
                                        desc="Casos de vida o muerte inmediata."
                                        rules="Se salta TODAS las validaciones y permite programación inmediata en cualquier horario."
                                    />
                                </div>
                            </DocumentationSection>

                            {/* Calendario y Desplazamiento */}
                            <DocumentationSection title="Agenda y Reglas de Calendario" icon="calendar_month">
                                <div className="grid lg:grid-cols-2 gap-8 items-start">
                                    <div className="space-y-4">
                                        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                                            <h4 className="font-bold text-slate-900 mb-2 flex items-center gap-2">
                                                <span className="material-symbols-outlined text-primary text-sm">swap_vert</span>
                                                Lógica de Desplazamiento (Cascade)
                                            </h4>
                                            <p className="text-sm text-slate-600 mb-3">
                                                El sistema utiliza una lógica de <strong>Desplazamiento en Cascada</strong>. Cuando insertas una cirugía en un horario ya ocupado:
                                            </p>
                                            <ul className="text-sm text-slate-500 space-y-2 list-disc list-inside">
                                                <li>La nueva cirugía ocupa el lugar seleccionado.</li>
                                                <li>Las cirugías posteriores en ese mismo quirófano se "empujan" hacia adelante automáticamente.</li>
                                                <li>Se notificará a los médicos involucrados sobre el cambio de su agenda.</li>
                                            </ul>
                                        </div>
                                        <div className="bg-blue-50 border border-blue-100 p-4 rounded-xl flex gap-3">
                                            <span className="material-symbols-outlined text-blue-500">info</span>
                                            <p className="text-xs text-blue-700">
                                                <strong>Tip:</strong> Puedes reordenar la agenda simplemente arrastrando la cirugía a un nuevo horario; el sistema ajustará el resto para evitar solapamientos.
                                            </p>
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <img src="/help/help_calendar_view.png" alt="Calendario" className="rounded-xl border border-slate-200 shadow-lg w-full" />
                                        <p className="text-center text-[10px] text-slate-400 font-medium italic">Vista de la agenda diaria con quirófanos organizados</p>
                                    </div>
                                </div>
                            </DocumentationSection>

                            {/* Monitor de Quirófano */}
                            <DocumentationSection title="Monitor de Quirófano" icon="monitor">
                                <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
                                    <p className="text-sm text-slate-600">Diseñado para seguimiento en tiempo real dentro del área quirúrgica.</p>
                                    <div className="grid md:grid-cols-3 gap-3">
                                        <div className="p-3 bg-emerald-50 rounded-lg border border-emerald-100">
                                            <span className="text-[10px] font-black text-emerald-700 uppercase">Terminadas</span>
                                            <p className="text-xs text-emerald-600">Finalizadas hoy.</p>
                                        </div>
                                        <div className="p-3 bg-blue-50 rounded-lg border border-blue-100">
                                            <span className="text-[10px] font-black text-blue-700 uppercase">En Curso</span>
                                            <p className="text-xs text-blue-600">Cirugía actual en el quirófano.</p>
                                        </div>
                                        <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
                                            <span className="text-[10px] font-black text-slate-700 uppercase">Próximas</span>
                                            <p className="text-xs text-slate-600">Resto de la jornada.</p>
                                        </div>
                                    </div>
                                </div>
                            </DocumentationSection>
                        </div>
                    )}

                    {/* --- INTERNACION SECTION --- */}
                    {activeTab === 'internacion' && (
                        <div className="flex flex-col gap-10">
                            <DocumentationSection title="Mapa de Internación (Estación de Enfermería)" icon="domain">
                                <div className="grid lg:grid-cols-2 gap-8 items-center">
                                    <div className="space-y-4">
                                        <p className="text-slate-600">
                                            El mapa permite gestionar las camas del piso en tiempo real. Cada cama muestra su estado actual mediante colores e iconos:
                                        </p>
                                        <div className="grid grid-cols-2 gap-3">
                                            <div className="flex items-center gap-2 p-2 bg-white rounded border border-slate-100 text-xs text-slate-500">
                                                <div className="size-3 rounded-full bg-emerald-500"></div> Libre
                                            </div>
                                            <div className="flex items-center gap-2 p-2 bg-white rounded border border-slate-100 text-xs text-slate-500">
                                                <div className="size-3 rounded-full bg-blue-500"></div> Ocupada
                                            </div>
                                            <div className="flex items-center gap-2 p-2 bg-white rounded border border-slate-100 text-xs text-slate-500">
                                                <div className="size-3 rounded-full bg-amber-500"></div> Limpieza/Manto.
                                            </div>
                                            <div className="flex items-center gap-2 p-2 bg-white rounded border border-slate-100 text-xs text-slate-500">
                                                <div className="size-3 rounded-full bg-red-500"></div> Bloqueada
                                            </div>
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <img src="/help/help_bed_grid.png" alt="Mapa de Camas" className="rounded-xl border border-slate-200 shadow-lg w-full" />
                                        <p className="text-center text-[10px] text-slate-400 font-medium italic">Grilla interactiva de internación</p>
                                    </div>
                                </div>
                            </DocumentationSection>

                            <DocumentationSection title="Gestión de Pacientes en Cama" icon="patient_list">
                                <div className="grid lg:grid-cols-2 gap-8 items-center">
                                    <div className="space-y-2 order-2 lg:order-1">
                                        <img src="/help/help_bed_detail.png" alt="Detalle de Cama" className="rounded-xl border border-slate-200 shadow-lg w-full" />
                                        <p className="text-center text-[10px] text-slate-400 font-medium italic">Modal de gestión de paciente en cama</p>
                                    </div>
                                    <div className="space-y-4 order-1 lg:order-2">
                                        <h4 className="font-bold text-slate-900">¿Cómo asignar o cambiar un paciente?</h4>
                                        <ol className="text-sm text-slate-600 space-y-3 list-decimal list-inside">
                                            <li>Haz clic sobre cualquier cama <strong>libre</strong> para buscar un paciente por nombre o DNI.</li>
                                            <li>Si la cama está <strong>ocupada</strong>, verás los datos del paciente, alergias y el médico a cargo.</li>
                                            <li>Para liberar la cama, usa el botón "Egresar Paciente" (esto cambiará el estado de la cirugía a Finalizada).</li>
                                            <li>Puedes cambiar el estado de la cama a Mantenimiento o Bloqueada desde el mismo panel lateral.</li>
                                        </ol>
                                    </div>
                                </div>
                            </DocumentationSection>
                        </div>
                    )}

                    {/* --- ADMISION SECTION --- */}
                    {activeTab === 'admision' && (
                        <div className="flex flex-col gap-10">
                            <DocumentationSection title="Ingreso mediante Escáner QR" icon="qr_code_scanner">
                                <div className="grid lg:grid-cols-2 gap-8 items-center">
                                    <div className="space-y-4">
                                        <p className="text-slate-600">
                                            Para agilizar la recepción, puedes usar la cámara de cualquier dispositivo para escanear el código del paciente:
                                        </p>
                                        <ul className="text-sm text-slate-600 space-y-3 list-disc list-inside">
                                            <li>Accede a "Escáner QR" en el menú principal.</li>
                                            <li>Apunta el código del paciente o de la pulsera.</li>
                                            <li>El sistema detectará automáticamente al paciente y te permitirá asignarlo a una cama en un solo paso.</li>
                                            <li>También puedes buscar manualmente por DNI si el código no es legible.</li>
                                        </ul>
                                    </div>
                                    <div className="space-y-2">
                                        <img src="/help/help_qr_scanner.png" alt="Escáner QR" className="rounded-xl border border-slate-200 shadow-lg w-full" />
                                        <p className="text-center text-[10px] text-slate-400 font-medium italic">Interfaz del escáner en tiempo real</p>
                                    </div>
                                </div>
                            </DocumentationSection>

                            <DocumentationSection title="Impresión de Pulseras Identificatorias" icon="print">
                                <div className="grid lg:grid-cols-2 gap-8 items-center">
                                    <div className="space-y-2 order-2 lg:order-1">
                                        <img src="/help/help_print_wristband.png" alt="Vista de Impresión" className="rounded-xl border border-slate-200 shadow-lg w-full" />
                                        <p className="text-center text-[10px] text-slate-400 font-medium italic">Previsualización de pulsera térmica</p>
                                    </div>
                                    <div className="space-y-4 order-1 lg:order-2">
                                        <h4 className="font-bold text-slate-900">Proceso de Impresión</h4>
                                        <p className="text-sm text-slate-600">
                                            Una vez que el paciente está ingresado, puedes imprimir su pulsera identificadora desde el panel de "Mapa de Internación" o desde el "Detalle de Cirugía".
                                        </p>
                                        <div className="bg-amber-50 border border-amber-100 p-4 rounded-xl flex gap-3">
                                            <span className="material-symbols-outlined text-amber-500">settings</span>
                                            <p className="text-xs text-amber-700">
                                                <strong>Configuración de Impresora:</strong> Para resultados óptimos en impresoras térmicas (como Schtec), asegúrate de ajustar el tamaño de papel en Windows y poner "Márgenes: Ninguno" en el diálogo de impresión del navegador.
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </DocumentationSection>
                        </div>
                    )}

                    {/* --- ROLES SECTION --- */}
                    {activeTab === 'roles' && (
                        <div className="overflow-hidden bg-white rounded-xl border border-slate-200 shadow-sm">
                            <table className="w-full text-sm text-left">
                                <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-xs">
                                    <tr>
                                        <th className="px-6 py-4">Rol</th>
                                        <th className="px-6 py-4">Permisos Principales</th>
                                        <th className="px-6 py-4">Responsabilidades</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    <RoleRow
                                        role="SuperAdmin"
                                        perms="Acceso Total (Crear, Editar, Borrar, Configurar)"
                                        resp="Gestión global del sistema, usuarios y auditoría."
                                    />
                                    <RoleRow
                                        role="Gerencia"
                                        perms="Lectura de Dashboards y Reportes"
                                        resp="Análisis de KPI, ocupación de quirófanos y tiempos."
                                    />
                                    <RoleRow
                                        role="Admision / Internación"
                                        perms="Mapa de Camas, Impresión de Pulseras, QR"
                                        resp="Confirmar ingresos, asignar camas y documentación."
                                    />
                                    <RoleRow
                                        role="Ortopedia / Farmacia"
                                        perms="Validación de Materiales"
                                        resp="Confirmar disponibilidad de insumos solicitados."
                                    />
                                    <RoleRow
                                        role="Medico"
                                        perms="Ver Agenda Propia, Validar Urgencias, Ver Alertas"
                                        resp="Dar aval médico a urgencias, seguir sus cirugías asignadas."
                                    />
                                    <RoleRow
                                        role="Tecnico / Instrumentador"
                                        perms="Ver Agenda General, Estado de Quirófano"
                                        resp="Preparación de quirófano, seguimiento del estado 'En Curso'."
                                    />
                                </tbody>
                            </table>
                        </div>
                    )}

                </div>
            </div>
        </div>
    );
};

// --- Helper Components ---

const FaqItem: React.FC<{ question: string; answer: string }> = ({ question, answer }) => (
    <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
        <h3 className="font-bold text-lg text-slate-900 mb-2 flex items-center gap-2">
            <span className="material-symbols-outlined text-primary">help</span>
            {question}
        </h3>
        <p className="text-slate-600 leading-relaxed">{answer}</p>
    </div>
);

const DocumentationSection: React.FC<{ title: string; icon: string; children: React.ReactNode }> = ({ title, icon, children }) => (
    <div className="flex flex-col gap-4">
        <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2 border-b border-slate-200 pb-2">
            <span className="material-symbols-outlined text-slate-400">{icon}</span>
            {title}
        </h3>
        {children}
    </div>
);

const PriorityCard: React.FC<{ title: string; color: string; desc: string; rules: string }> = ({ title, color, desc, rules }) => (
    <div className={`p-4 rounded-lg border-l-4 bg-white shadow-sm border-${color}-500`}>
        <div className="flex items-center gap-2 mb-1">
            <span className={`px-2 py-0.5 rounded text-xs font-bold uppercase bg-${color}-100 text-${color}-700`}>{title}</span>
        </div>
        <p className="text-sm font-medium text-slate-900 mb-2">{desc}</p>
        <div className="text-xs text-slate-500 bg-slate-50 p-2 rounded border border-slate-100 italic">
            <strong>Regla:</strong> {rules}
        </div>
    </div>
);

const RoleRow: React.FC<{ role: string; perms: string; resp: string }> = ({ role, perms, resp }) => (
    <tr className="hover:bg-slate-50 transition-colors">
        <td className="px-6 py-4 font-bold text-slate-900">{role}</td>
        <td className="px-6 py-4 text-slate-600">{perms}</td>
        <td className="px-6 py-4 text-slate-600">{resp}</td>
    </tr>
);

export default Help;
