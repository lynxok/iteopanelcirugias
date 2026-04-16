import React, { useState, useRef } from 'react';
import * as XLSX from 'xlsx';
import { supabase } from '../src/lib/supabase';

interface ExcelImporterProps {
    onComplete: () => void;
}

const ExcelImporter: React.FC<ExcelImporterProps> = ({ onComplete }) => {
    const [isImporting, setIsImporting] = useState(false);
    const [progress, setProgress] = useState(0);
    const [total, setTotal] = useState(0);
    const [logs, setLogs] = useState<string[]>([]);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const addLog = (msg: string) => {
        setLogs(prev => [msg, ...prev].slice(0, 50));
    };

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setIsImporting(true);
        setLogs(['Iniciando lectura de archivo...']);
        setProgress(0);

        try {
            const data = await file.arrayBuffer();
            const workbook = XLSX.read(data);
            const worksheet = workbook.Sheets[workbook.SheetNames[0]];
            const jsonData: any[] = XLSX.utils.sheet_to_json(worksheet);

            if (jsonData.length === 0) {
                addLog('Error: El archivo está vacío.');
                setIsImporting(false);
                return;
            }

            setTotal(jsonData.length);
            addLog(`Se encontraron ${jsonData.length} registros.`);

            // Pre-fetch Doctors and ORs for mapping
            const { data: doctors } = await supabase.from('doctors').select('id, full_name');
            const { data: ors } = await supabase.from('operating_rooms').select('id, name');

            for (let i = 0; i < jsonData.length; i++) {
                const row = jsonData[i];
                try {
                    // 1. Process Patient
                    let patientId = null;
                    if (row.DNI) {
                        const dni = String(row.DNI).replace(/\D/g, '');
                        const { data: patient } = await supabase
                            .from('patients')
                            .select('id')
                            .eq('document_number', dni)
                            .maybeSingle();

                        if (patient) {
                            patientId = patient.id;
                        } else {
                            const { data: newPatient, error: pError } = await supabase
                                .from('patients')
                                .insert({
                                    full_name: row.Paciente || 'N/A',
                                    document_number: dni,
                                    medical_coverage: row['Obra Social'] || ''
                                })
                                .select('id')
                                .single();

                            if (pError) throw pError;
                            patientId = newPatient.id;
                        }
                    }

                    // 2. Map Doctor
                    let doctorId = null;
                    if (row.Médico && doctors) {
                        const foundDoc = doctors.find(d =>
                            d.full_name.toLowerCase().includes(row.Médico.toLowerCase()) ||
                            row.Médico.toLowerCase().includes(d.full_name.toLowerCase())
                        );
                        doctorId = foundDoc?.id || null;
                    }

                    // 3. Map OR
                    let orId = '301'; // Default
                    if (row.Quirófano && ors) {
                        const foundOr = ors.find(o =>
                            o.name.toLowerCase().includes(row.Quirófano.toLowerCase())
                        );
                        orId = foundOr?.id || '301';
                    }

                    // 4. Map Priority
                    let priority = 'routine';
                    const pRaw = String(row.Prioridad || '').toLowerCase();
                    if (pRaw.includes('urg')) priority = 'urgency';
                    if (pRaw.includes('emer')) priority = 'emergency';

                    // 5. Insert Surgery
                    const { error: sError } = await supabase
                        .from('surgeries')
                        .insert({
                            patient_id: patientId,
                            doctor_id: doctorId,
                            operating_room_id: orId,
                            procedure_name: row.Procedimiento || 'Pendiente',
                            medical_coverage: row['Obra Social'] || '',
                            priority: priority,
                            authorization_date: row.Fecha || null,
                            surgery_date: null,
                            status: 'pending_validation'
                        });

                    if (sError) throw sError;

                    setProgress(i + 1);
                } catch (err: any) {
                    addLog(`Error en fila ${i + 2}: ${err.message}`);
                }
            }

            addLog('Importación finalizada con éxito.');
            setTimeout(() => {
                onComplete();
                setIsImporting(false);
            }, 2000);

        } catch (err: any) {
            addLog(`Error crítico: ${err.message}`);
            setIsImporting(false);
        }

        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const downloadTemplate = () => {
        const templateData = [
            {
                'DNI': '12345678',
                'Paciente': 'JUAN PEREZ',
                'Obra Social': 'OSDE 210',
                'Procedimiento': 'COLECISTECTOMIA LAPAROSCOPICA',
                'Médico': 'GARCIA',
                'Quirófano': 'Quirófano 1',
                'Prioridad': 'Rutina',
                'Fecha Autorización': '2024-03-20'
            },
            {
                'DNI': '87654321',
                'Paciente': 'MARIA LOPEZ',
                'Obra Social': 'SWISS MEDICAL',
                'Procedimiento': 'HERNIOPLASTIA INGUINAL',
                'Médico': 'MARTINEZ',
                'Quirófano': 'Quirófano 2',
                'Prioridad': 'Urgencia',
                'Fecha Autorización': '2024-03-20'
            }
        ];

        const ws = XLSX.utils.json_to_sheet(templateData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Plantilla');

        // Auto-size columns
        const colWidths = Object.keys(templateData[0]).map(key => ({ wch: key.length + 15 }));
        ws['!cols'] = colWidths;

        XLSX.writeFile(wb, 'item_plantilla_cirugias.xlsx');
    };

    return (
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm mb-6">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 mb-6">
                <div>
                    <h3 className="text-lg font-bold text-slate-900">Importación Masiva (Excel)</h3>
                    <p className="text-sm text-slate-500">Cargá múltiples cirugías desde un archivo .xlsx (Solo Autorización)</p>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={downloadTemplate}
                        className="h-10 px-4 bg-slate-100 text-slate-700 rounded-xl font-bold flex items-center gap-2 hover:bg-slate-200 transition-all border border-slate-200"
                    >
                        <span className="material-symbols-outlined text-lg">download</span>
                        Descargar Plantilla
                    </button>
                    <button
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isImporting}
                        className="h-10 px-4 bg-primary text-white rounded-xl font-bold flex items-center gap-2 hover:bg-primary/90 disabled:opacity-50 transition-all"
                    >
                        <span className="material-symbols-outlined text-lg">upload_file</span>
                        {isImporting ? 'Procesando...' : 'Seleccionar Archivo'}
                    </button>
                </div>
                <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileChange}
                    accept=".xlsx, .xls"
                    className="hidden"
                />
            </div>

            {isImporting && (
                <div className="mb-6">
                    <div className="flex justify-between text-sm font-medium mb-2">
                        <span className="text-slate-600">Procesando {progress} de {total}</span>
                        <span className="text-primary">{Math.round((progress / total) * 100)}%</span>
                    </div>
                    <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div
                            className="h-full bg-primary transition-all duration-300"
                            style={{ width: `${(progress / total) * 100}%` }}
                        />
                    </div>
                </div>
            )}

            {logs.length > 0 && (
                <div className="bg-slate-50 rounded-xl p-4 max-h-40 overflow-y-auto border border-slate-100">
                    {logs.map((log, i) => (
                        <p key={i} className={`text-xs mb-1 ${log.startsWith('Error') ? 'text-red-500 font-medium' : 'text-slate-600'}`}>
                            • {log}
                        </p>
                    ))}
                </div>
            )}
        </div>
    );
};

export default ExcelImporter;
