import React, { useState } from 'react';
import { useAuth } from '../src/lib/AuthContext';

const Help: React.FC = () => {
    const { user } = useAuth();
    const [activeTab, setActiveTab] = useState<'faq' | 'guide' | 'roles'>('faq');

    return (
        <div className="flex-1 h-full overflow-y-auto bg-background p-8">
            <div className="max-w-4xl mx-auto flex flex-col gap-8">

                {/* Header */}
                <div className="flex flex-col gap-2">
                    <h2 className="text-3xl font-bold text-slate-900">Centro de Ayuda</h2>
                    <p className="text-slate-500 text-lg">Documentación, guías de uso y preguntas frecuentes.</p>
                </div>

                {/* Navigation Tabs */}
                <div className="flex gap-4 border-b border-slate-200">
                    <button
                        onClick={() => setActiveTab('faq')}
                        className={`pb-3 px-2 text-sm font-bold transition-all border-b-2 ${activeTab === 'faq'
                            ? 'border-primary text-primary'
                            : 'border-transparent text-slate-500 hover:text-slate-700'
                            }`}
                    >
                        Preguntas Frecuentes
                    </button>
                    <button
                        onClick={() => setActiveTab('guide')}
                        className={`pb-3 px-2 text-sm font-bold transition-all border-b-2 ${activeTab === 'guide'
                            ? 'border-primary text-primary'
                            : 'border-transparent text-slate-500 hover:text-slate-700'
                            }`}
                    >
                        Guía de Uso & Reglas
                    </button>
                    <button
                        onClick={() => setActiveTab('roles')}
                        className={`pb-3 px-2 text-sm font-bold transition-all border-b-2 ${activeTab === 'roles'
                            ? 'border-primary text-primary'
                            : 'border-transparent text-slate-500 hover:text-slate-700'
                            }`}
                    >
                        Roles y Permisos
                    </button>
                </div>

                {/* Content Area */}
                <div className="animate-fadeIn">

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
                                question="¿Quién recibe las alertas?"
                                answer="Las alertas se dirigen al rol o persona responsable. Por ejemplo, si falta validar materiales de ortopedia, la alerta llega al rol 'Ortopedia'. Si es una validación médica de urgencia, llega directamente al médico asignado."
                            />
                        </div>
                    )}

                    {/* --- GUIDE SECTION --- */}
                    {activeTab === 'guide' && (
                        <div className="flex flex-col gap-8">

                            {/* Prioridades */}
                            <DocumentationSection title="Prioridades de Cirugía" icon="priority_high">
                                <div className="grid gap-4">
                                    <PriorityCard
                                        title="Programada (Rutinaria)"
                                        color="blue"
                                        desc="Cirugías estándar planificadas con antelación."
                                        rules="Requiere validación de admisión y materiales antes de finalizarse. No tiene restricciones de fecha especiales."
                                    />
                                    <PriorityCard
                                        title="Urgencia"
                                        color="orange"
                                        desc="Casos que requieren atención pronta pero permiten cierta ventana de planificación."
                                        rules="Regla de los 14 Días: Si creas una urgencia hoy, NO podrás agendarla para los próximos 14 días a menos que el médico la valide (Aval Médico). Ejemplo: Creas una urgencia el 1 de Marzo. Sin aval, solo podrás programarla a partir del 15 de Marzo."
                                    />
                                    <PriorityCard
                                        title="Emergencia"
                                        color="red"
                                        desc="Casos de vida o muerte inmediata."
                                        rules="Se salta TODAS las validaciones (Admisión, Materiales, Aval Médico). Permite programación inmediata en cualquier horario disponible."
                                    />
                                </div>
                            </DocumentationSection>

                            {/* Ciclo de Vida */}
                            <DocumentationSection title="Ciclo de Vida de una Cirugía" icon="cached">
                                <div className="flex flex-col gap-4 text-sm text-slate-600 bg-white p-6 rounded-xl border border-slate-200">
                                    <ol className="list-decimal list-inside space-y-3">
                                        <li>
                                            <strong className="text-slate-900">Creación (Borrador):</strong> Se ingresan datos del paciente, procedimiento y médico. Se define prioridad.
                                        </li>
                                        <li>
                                            <strong className="text-slate-900">Solicitud de Materiales:</strong> Se carga el pedido de farmacia/ortopedia. Estado: <em>Pendiente de Validación</em>.
                                        </li>
                                        <li>
                                            <strong className="text-slate-900">Validaciones:</strong>
                                            <ul className="list-disc list-inside pl-4 mt-1 space-y-1 text-slate-500">
                                                <li><strong>Ortopedia:</strong> Valida que las prótesis/materiales estén disponibles.</li>
                                                <li><strong>Admisión:</strong> Valida la cobertura social y papeles del paciente.</li>
                                                <li><strong>Médico:</strong> (Solo en Urgencias) Valida la necesidad de priorizar el turno.</li>
                                            </ul>
                                        </li>
                                        <li>
                                            <strong className="text-slate-900">Programación:</strong> Una vez validadas las condiciones necesarias, se asigna fecha, hora y quirófano en el Calendario. Estado: <em>Programada</em>.
                                        </li>
                                        <li>
                                            <strong className="text-slate-900">Ejecución:</strong>
                                            <ul className="list-disc list-inside pl-4 mt-1 space-y-1 text-slate-500">
                                                <li>El paciente ingresa a quirófano -&gt; Estado: <em>En Quirófano</em>.</li>
                                                <li>Comienza la cirugía -&gt; Estado: <em>En Curso</em>.</li>
                                                <li>Termina la cirugía -&gt; Estado: <em>Recuperación</em> o <em>Finalizada</em>.</li>
                                            </ul>
                                        </li>
                                    </ol>
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
                                        role="Admision"
                                        perms="Validación de Pacientes, Check-in"
                                        resp="Confirmar cobertura social y autorizaciones administrativas."
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
