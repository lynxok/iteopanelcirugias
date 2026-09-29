import React, { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '../src/lib/supabase';
import { useAuth } from '../src/lib/AuthContext';

interface CollectedFile {
    path: string;
    name: string;
    type: 'ecg' | 'lab';
}

interface CollectionResult {
    timestamp: string;
    patient: string;
    lab_date: string;
    ecg_date: string;
    output_dir: string;
    ecg?: {
        success: boolean;
        files: string[];
        message?: string;
        error?: string;
    };
    laboratory?: {
        success: boolean;
        file?: string | null;
        source?: string;
        message?: string;
        error?: string;
    };
    downloaded_files: string[];
}

export const Prequirurgicos: React.FC = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const { user } = useAuth();

    // Estado del formulario
    const [patientName, setPatientName] = useState('');
    const [labDate, setLabDate] = useState(() => new Date().toISOString().split('T')[0]);
    const [ecgDate, setEcgDate] = useState(() => {
        const d = new Date();
        d.setDate(d.getDate() - 30);
        return d.toISOString().split('T')[0];
    });
    const [outputDir, setOutputDir] = useState('');

    // Búsqueda y autocompletado de pacientes con cirugías activas
    const [searchQuery, setSearchQuery] = useState('');
    const [searchingPatients, setSearchingPatients] = useState(false);
    const [patientSuggestions, setPatientSuggestions] = useState<any[]>([]);
    const [showSuggestions, setShowSuggestions] = useState(false);

    // Estado de ejecución
    const [isRunning, setIsRunning] = useState(false);
    const [logs, setLogs] = useState<string[]>([]);
    const [result, setResult] = useState<CollectionResult | null>(null);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    const logContainerRef = useRef<HTMLDivElement>(null);

    // Autoscroll para logs
    useEffect(() => {
        if (logContainerRef.current) {
            logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
        }
    }, [logs]);

    // Cargar carpeta por defecto desde preferencias de app o fallback
    useEffect(() => {
        const initDir = async () => {
            if ((window as any).electronAPI?.getAppPreference) {
                const saved = await (window as any).electronAPI.getAppPreference('prequirurgicos_output_dir');
                if (saved) {
                    setOutputDir(saved);
                    return;
                }
            }
        };
        initDir();
    }, []);

    // Escuchar logs en vivo de Electron
    useEffect(() => {
        if ((window as any).electronAPI?.onPrequirurgicosLog) {
            (window as any).electronAPI.onPrequirurgicosLog((msg: string) => {
                setLogs(prev => [...prev, msg]);
            });
        }
    }, []);

    // Si viene desde otra pantalla (como Detalle de Cirugía o Kanban)
    useEffect(() => {
        const state = location.state as any;
        if (state?.patientName) {
            setPatientName(state.patientName);
            if (state.labDate) setLabDate(state.labDate);
            if (state.ecgDate) setEcgDate(state.ecgDate);
        }
    }, [location.state]);

    // Búsqueda en Supabase de pacientes activos
    useEffect(() => {
        const timer = setTimeout(async () => {
            if (!searchQuery || searchQuery.trim().length < 2) {
                setPatientSuggestions([]);
                return;
            }

            try {
                setSearchingPatients(true);
                const { data, error } = await supabase
                    .from('surgeries')
                    .select('id, patient_name, patient_document, surgery_date, doctor_name')
                    .ilike('patient_name', `%${searchQuery.trim()}%`)
                    .order('created_at', { ascending: false })
                    .limit(6);

                if (!error && data) {
                    setPatientSuggestions(data);
                }
            } catch (err) {
                console.error('Error buscando pacientes:', err);
            } finally {
                setSearchingPatients(false);
            }
        }, 300);

        return () => clearTimeout(timer);
    }, [searchQuery]);

    const handleSelectPatient = (p: any) => {
        setPatientName(p.patient_name || '');
        setSearchQuery('');
        setShowSuggestions(false);
    };

    const handleSelectDirectory = async () => {
        if ((window as any).electronAPI?.selectDirectory) {
            const chosen = await (window as any).electronAPI.selectDirectory();
            if (chosen) {
                setOutputDir(chosen);
                if ((window as any).electronAPI?.setAppPreference) {
                    await (window as any).electronAPI.setAppPreference('prequirurgicos_output_dir', chosen);
                }
            }
        } else {
            alert('Esta función requiere la aplicación de escritorio de ITEO.');
        }
    };

    const handleStartCollection = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!patientName.trim()) {
            alert('Por favor ingrese el Apellido y Nombre del paciente.');
            return;
        }

        if (!(window as any).electronAPI?.runPrequirurgicosCollector) {
            alert('La recolección de prequirúrgicos automatizada requiere la aplicación de escritorio de ITEO.');
            return;
        }

        setIsRunning(true);
        setResult(null);
        setErrorMessage(null);
        setLogs([`Iniciando recolección de prequirúrgicos para: ${patientName.trim().toUpperCase()}...`]);

        try {
            const resp = await (window as any).electronAPI.runPrequirurgicosCollector(
                patientName.trim(),
                labDate,
                ecgDate,
                outputDir || undefined
            );

            if (resp.success && resp.data) {
                setResult(resp.data);
            } else {
                setErrorMessage(resp.error || 'Ocurrió un error durante la ejecución del proceso.');
            }
        } catch (err: any) {
            console.error('Error al ejecutar recolector:', err);
            setErrorMessage(err.message || 'Error inesperado al ejecutar el recolector.');
        } finally {
            setIsRunning(false);
        }
    };

    const handleStop = async () => {
        if ((window as any).electronAPI?.stopPrequirurgicosCollector) {
            await (window as any).electronAPI.stopPrequirurgicosCollector();
            setIsRunning(false);
            setLogs(prev => [...prev, '[Usuario] Recolección detenida por el usuario.']);
        }
    };

    const handleOpenFile = async (filePath: string) => {
        if ((window as any).electronAPI?.openPath) {
            const r = await (window as any).electronAPI.openPath(filePath);
            if (!r.success) alert(r.error || 'No se pudo abrir el archivo.');
        }
    };

    const handleOpenFolder = async (folderPath?: string) => {
        const path = folderPath || result?.output_dir || outputDir;
        if ((window as any).electronAPI?.openPath && path) {
            const r = await (window as any).electronAPI.openPath(path);
            if (!r.success) alert(r.error || 'No se pudo abrir la carpeta.');
        }
    };

    return (
        <div className="flex-1 overflow-y-auto bg-slate-50 min-h-screen p-4 lg:p-8">
            <div className="max-w-6xl mx-auto space-y-6">

                {/* HEADER */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm">
                    <div>
                        <div className="flex items-center gap-3">
                            <div className="size-11 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-md shadow-blue-100">
                                <span className="material-symbols-outlined text-2xl">assignment_turned_in</span>
                            </div>
                            <div>
                                <h1 className="text-xl font-black text-slate-900 tracking-tight">
                                    Recolector de Prequirúrgicos
                                </h1>
                                <p className="text-xs text-slate-500 font-medium">
                                    Búsqueda y descarga automática de Laboratorio (Nanni / IPHH) y ECG (Correo Ferozo)
                                </p>
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={() => handleOpenFolder()}
                            disabled={!result?.output_dir && !outputDir}
                            className="px-4 py-2 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 rounded-xl transition-all flex items-center gap-2 shadow-sm"
                            title="Abrir carpeta de destino en Windows"
                        >
                            <span className="material-symbols-outlined text-base text-slate-500">folder_open</span>
                            Abrir Carpeta
                        </button>
                    </div>
                </div>

                {/* GRID FORM + LOGS */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

                    {/* COLUMNA IZQUIERDA: FORMULARIO DE CARGA */}
                    <div className="lg:col-span-5 space-y-5">
                        <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm space-y-5">
                            <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                                <span className="material-symbols-outlined text-blue-600 text-lg">person_search</span>
                                Datos del Paciente
                            </h2>

                            {/* BUSCADOR DE CIRUGÍAS / AUTOCOMPLETAR */}
                            <div className="relative">
                                <label className="block text-xs font-bold text-slate-600 mb-1">
                                    Buscar en Cirugías Programadas (Opcional)
                                </label>
                                <div className="relative">
                                    <input
                                        type="text"
                                        value={searchQuery}
                                        onChange={(e) => {
                                            setSearchQuery(e.target.value);
                                            setShowSuggestions(true);
                                        }}
                                        onFocus={() => setShowSuggestions(true)}
                                        placeholder="Tipeá nombre de paciente para autocompletar..."
                                        className="w-full text-xs bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-8 py-2.5 focus:bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none transition-all"
                                    />
                                    <span className="material-symbols-outlined absolute left-3 top-2.5 text-slate-400 text-lg">search</span>
                                    {searchingPatients && (
                                        <div className="size-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin absolute right-3 top-3"></div>
                                    )}
                                </div>

                                {showSuggestions && patientSuggestions.length > 0 && (
                                    <div className="absolute z-30 mt-1 w-full bg-white rounded-xl shadow-xl border border-slate-200 overflow-hidden divide-y divide-slate-100 animate-fadeIn">
                                        {patientSuggestions.map(p => (
                                            <div
                                                key={p.id}
                                                onClick={() => handleSelectPatient(p)}
                                                className="p-3 hover:bg-blue-50/70 cursor-pointer transition-colors text-left"
                                            >
                                                <p className="text-xs font-bold text-slate-900">{p.patient_name}</p>
                                                <p className="text-[11px] text-slate-500 font-mono">
                                                    DNI: {p.patient_document || 'S/D'} • Dr: {p.doctor_name || 'S/A'}
                                                </p>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            <form onSubmit={handleStartCollection} className="space-y-4 pt-2 border-t border-slate-100">
                                <div>
                                    <label className="block text-xs font-bold text-slate-700 mb-1">
                                        Apellido y Nombre <span className="text-red-500">*</span>
                                    </label>
                                    <input
                                        type="text"
                                        required
                                        value={patientName}
                                        onChange={(e) => setPatientName(e.target.value)}
                                        placeholder="Ej: PEREZ JUAN IGNACIO"
                                        className="w-full text-xs font-bold uppercase bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 focus:bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none transition-all"
                                    />
                                    <span className="text-[10px] text-slate-400">En ese orden exacto según el protocolo.</span>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <div>
                                        <label className="block text-xs font-bold text-slate-700 mb-1">
                                            Fecha Laboratorio <span className="text-red-500">*</span>
                                        </label>
                                        <input
                                            type="date"
                                            required
                                            value={labDate}
                                            onChange={(e) => setLabDate(e.target.value)}
                                            className="w-full text-xs bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 focus:bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-xs font-bold text-slate-700 mb-1">
                                            Fecha ECG <span className="text-red-500">*</span>
                                        </label>
                                        <input
                                            type="date"
                                            required
                                            value={ecgDate}
                                            onChange={(e) => setEcgDate(e.target.value)}
                                            className="w-full text-xs bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 focus:bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-xs font-bold text-slate-700 mb-1">
                                        Carpeta de Destino en PC
                                    </label>
                                    <div className="flex gap-2">
                                        <input
                                            type="text"
                                            value={outputDir}
                                            onChange={(e) => setOutputDir(e.target.value)}
                                            placeholder="Por defecto: 7 - PREQUIRÚRGICOS"
                                            className="flex-1 text-[11px] font-mono bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 focus:bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none truncate"
                                        />
                                        <button
                                            type="button"
                                            onClick={handleSelectDirectory}
                                            className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-colors"
                                            title="Cambiar carpeta de guardado"
                                        >
                                            <span className="material-symbols-outlined text-base">folder</span>
                                        </button>
                                    </div>
                                </div>

                                <div className="pt-3">
                                    {!isRunning ? (
                                        <button
                                            type="submit"
                                            className="w-full py-3 bg-blue-600 hover:bg-blue-700 active:scale-[0.99] text-white text-xs font-black uppercase tracking-wider rounded-xl shadow-lg shadow-blue-500/25 flex items-center justify-center gap-2 transition-all"
                                        >
                                            <span className="material-symbols-outlined text-lg">download</span>
                                            Buscar y Descargar Prequirúrgicos
                                        </button>
                                    ) : (
                                        <button
                                            type="button"
                                            onClick={handleStop}
                                            className="w-full py-3 bg-red-600 hover:bg-red-700 active:scale-[0.99] text-white text-xs font-black uppercase tracking-wider rounded-xl shadow-lg shadow-red-500/25 flex items-center justify-center gap-2 transition-all"
                                        >
                                            <span className="material-symbols-outlined text-lg animate-spin">sync</span>
                                            Detener Recolección
                                        </button>
                                    )}
                                </div>
                            </form>
                        </div>

                        {/* TARJETA DE RESUMEN DE RESULTADOS */}
                        {result && (
                            <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm space-y-4 animate-fadeIn">
                                <h3 className="text-xs font-black text-slate-900 uppercase tracking-wider flex items-center justify-between">
                                    <span>Resultados de la Descarga</span>
                                    <span className="px-2 py-0.5 rounded-full text-[10px] bg-slate-100 text-slate-700 font-mono">
                                        {result.downloaded_files.length} archivos
                                    </span>
                                </h3>

                                {/* ESTADO ECG */}
                                <div className={`p-3.5 rounded-xl border flex items-start gap-3 ${result.ecg?.success ? 'bg-emerald-50/70 border-emerald-200' : 'bg-amber-50/70 border-amber-200'}`}>
                                    <span className={`material-symbols-outlined text-xl shrink-0 ${result.ecg?.success ? 'text-emerald-600' : 'text-amber-600'}`}>
                                        {result.ecg?.success ? 'check_circle' : 'warning'}
                                    </span>
                                    <div className="space-y-1">
                                        <p className="text-xs font-bold text-slate-900">Electrocardiograma (ECG)</p>
                                        <p className="text-[11px] text-slate-600 leading-relaxed">
                                            {result.ecg?.message || (result.ecg?.success ? 'Descargado correctamente.' : 'No disponible.')}
                                        </p>
                                    </div>
                                </div>

                                {/* ESTADO LABORATORIO */}
                                <div className={`p-3.5 rounded-xl border flex items-start gap-3 ${result.laboratory?.success ? 'bg-emerald-50/70 border-emerald-200' : 'bg-amber-50/70 border-amber-200'}`}>
                                    <span className={`material-symbols-outlined text-xl shrink-0 ${result.laboratory?.success ? 'text-emerald-600' : 'text-amber-600'}`}>
                                        {result.laboratory?.success ? 'check_circle' : 'warning'}
                                    </span>
                                    <div className="space-y-1">
                                        <p className="text-xs font-bold text-slate-900">Laboratorio de Análisis</p>
                                        <p className="text-[11px] text-slate-600 leading-relaxed">
                                            {result.laboratory?.success
                                                ? `Descargado con éxito desde ${result.laboratory.source || 'portal'}.`
                                                : (result.laboratory?.message || 'No se encontró en los portales Nanni ni IPHH.')}
                                        </p>
                                    </div>
                                </div>

                                {/* LISTA DE ARCHIVOS DESCARGADOS */}
                                {result.downloaded_files.length > 0 && (
                                    <div className="space-y-2 pt-2 border-t border-slate-100">
                                        <p className="text-[11px] font-bold text-slate-700">Archivos guardados en disco:</p>
                                        <div className="space-y-1.5">
                                            {result.downloaded_files.map((fp, i) => {
                                                const fileName = fp.split(/[\\/]/).pop();
                                                return (
                                                    <div
                                                        key={i}
                                                        className="flex items-center justify-between p-2 rounded-lg bg-slate-50 border border-slate-200/70 text-xs"
                                                    >
                                                        <div className="flex items-center gap-2 truncate mr-2">
                                                            <span className="material-symbols-outlined text-red-500 text-base">picture_as_pdf</span>
                                                            <span className="font-mono text-[11px] text-slate-700 truncate" title={fp}>
                                                                {fileName}
                                                            </span>
                                                        </div>
                                                        <button
                                                            type="button"
                                                            onClick={() => handleOpenFile(fp)}
                                                            className="px-2 py-1 bg-white hover:bg-slate-100 border border-slate-200 rounded text-[10px] font-bold text-blue-600 transition-colors shrink-0"
                                                        >
                                                            Abrir PDF
                                                        </button>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* COLUMNA DERECHA: CONSOLA DE PROGRESO Y LOGS */}
                    <div className="lg:col-span-7">
                        <div className="bg-slate-900 text-slate-200 p-6 rounded-2xl shadow-xl border border-slate-800 flex flex-col h-[580px]">
                            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
                                <div className="flex items-center gap-2.5">
                                    <div className={`size-3 rounded-full ${isRunning ? 'bg-emerald-500 animate-pulse' : 'bg-slate-600'}`}></div>
                                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 font-mono">
                                        Consola de Recolección en Vivo
                                    </h3>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setLogs([])}
                                    className="text-[11px] text-slate-500 hover:text-slate-300 transition-colors font-mono"
                                >
                                    Limpiar
                                </button>
                            </div>

                            <div
                                ref={logContainerRef}
                                className="flex-1 overflow-y-auto py-4 space-y-2 font-mono text-xs text-slate-300 scrollbar-thin scrollbar-thumb-slate-800"
                            >
                                {logs.length === 0 ? (
                                    <div className="h-full flex flex-col items-center justify-center text-slate-600 space-y-2">
                                        <span className="material-symbols-outlined text-4xl">terminal</span>
                                        <p className="text-xs">Los mensajes del robot aparecerán aquí al iniciar la recolección.</p>
                                    </div>
                                ) : (
                                    logs.map((line, index) => {
                                        const isError = line.includes('[Error]') || line.includes('error');
                                        const isSuccess = line.includes('éxito') || line.includes('exito') || line.includes('¡') || line.includes('SUCCESS');
                                        return (
                                            <div
                                                key={index}
                                                className={`leading-relaxed break-words ${isError ? 'text-rose-400' : isSuccess ? 'text-emerald-400' : 'text-slate-300'}`}
                                            >
                                                {line}
                                            </div>
                                        );
                                    })
                                )}
                            </div>

                            {/* ESTADO EN FOOTER DE CONSOLA */}
                            <div className="pt-3 border-t border-slate-800 flex items-center justify-between text-[11px] text-slate-400 font-mono">
                                <span>Estado: {isRunning ? 'Ejecutando robots...' : result ? 'Finalizado' : 'En espera'}</span>
                                {isRunning && (
                                    <span className="inline-flex items-center gap-1.5 text-blue-400">
                                        <span className="size-2 rounded-full bg-blue-400 animate-ping"></span>
                                        Conectando...
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>

                </div>

            </div>
        </div>
    );
};

export default Prequirurgicos;
