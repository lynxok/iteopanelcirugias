import React, { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '../src/lib/supabase';
import { useAuth } from '../src/lib/AuthContext';
import {
  AoterProfessional,
  TripticoCirugia,
  TripticoSyncHistoryItem,
  TripticoPrestacion,
  TripticoAdjunto
} from '../src/types/tripticos';
import { AOTER_NOMENCLADOR } from '../src/data/aoterNomenclador';
import AOTER_OBRAS_SOCIALES from '../src/data/aoterObrasSociales.json';

export const Tripticos: React.FC = () => {
  const { user } = useAuth();

  // Tabs
  const [activeTab, setActiveTab] = useState<'carga' | 'profesionales' | 'historial'>('carga');

  // Fechas de relevamiento
  const todayStr = new Date().toISOString().split('T')[0];
  const firstDayStr = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];
  const [dateFrom, setDateFrom] = useState<string>(firstDayStr);
  const [dateTo, setDateTo] = useState<string>(todayStr);

  // Toggle para ver el navegador Playwright en pantalla
  const [showBrowser, setShowBrowser] = useState<boolean>(false);

  // Estados de datos
  const [cirugias, setCirugias] = useState<TripticoCirugia[]>([]);
  const [professionals, setProfessionals] = useState<AoterProfessional[]>([]);
  const [history, setHistory] = useState<TripticoSyncHistoryItem[]>([]);

  // Estados de carga y ejecución
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [loadingMessage, setLoadingMessage] = useState<string>('');
  const [progressPercent, setProgressPercent] = useState<number>(0);
  const [progressCurrent, setProgressCurrent] = useState<number>(0);
  const [progressTotal, setProgressTotal] = useState<number>(0);

  // Consola de Logs en vivo
  const [logs, setLogs] = useState<string[]>([]);
  const [isLogDrawerOpen, setIsLogDrawerOpen] = useState<boolean>(false);
  const logEndRef = useRef<HTMLDivElement>(null);

  // Modal de Detalle de Cirugía / Historial
  const [selectedItemForDetail, setSelectedItemForDetail] = useState<TripticoCirugia | TripticoSyncHistoryItem | null>(null);

  // Modal para Editar / Agregar Profesional SGAPI
  const [editingProf, setEditingProf] = useState<AoterProfessional | null>(null);
  const [showProfModal, setShowProfModal] = useState<boolean>(false);
  const [showProfPassword, setShowProfPassword] = useState<boolean>(false);

  // Filtros de búsqueda en Historial / Trípticos Generados
  const [historySearch, setHistorySearch] = useState<string>('');
  const [historyDateFrom, setHistoryDateFrom] = useState<string>('');
  const [historyDateTo, setHistoryDateTo] = useState<string>('');
  const [historyDoctor, setHistoryDoctor] = useState<string>('');
  const [historyInsurance, setHistoryInsurance] = useState<string>('');
  const [historyStatusFilter, setHistoryStatusFilter] = useState<'all' | 'synced' | 'error'>('all');

  // 1. Escuchar logs del proceso en Electron
  useEffect(() => {
    const electronAPI = (window as any).electronAPI;
    if (electronAPI && typeof electronAPI.onTripticosLog === 'function') {
      electronAPI.onTripticosLog((message: string) => {
        setLogs(prev => [...prev.slice(-300), `[${new Date().toLocaleTimeString()}] ${message}`]);

        // Parsear progreso del log estilo "[X/Y] Procesando..." o "[X/Y] Cargando..."
        const match = message.match(/\[(\d+)\/(\d+)\]/);
        if (match) {
          const curr = parseInt(match[1], 10);
          const tot = parseInt(match[2], 10);
          if (tot > 0) {
            setProgressCurrent(curr);
            setProgressTotal(tot);
            setProgressPercent(Math.round((curr / tot) * 100));
          }
        }
      });
    }
  }, []);

  // Auto-scroll al final de los logs
  useEffect(() => {
    if (isLogDrawerOpen && logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, isLogDrawerOpen]);

  // 2. Cargar Profesionales y Historial desde Supabase (admin_settings)
  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      // Cargar Profesionales
      const { data: profData } = await supabase
        .schema('quirofano')
        .from('admin_settings')
        .select('value')
        .eq('key', 'tripticos_professionals')
        .maybeSingle();

      if (profData?.value) {
        try {
          const parsed = JSON.parse(profData.value);
          if (Array.isArray(parsed)) setProfessionals(parsed);
        } catch (e) {
          console.error('Error parseando tripticos_professionals:', e);
        }
      } else {
        // Fallback localStorage
        const localProf = localStorage.getItem('tripticos_professionals');
        if (localProf) {
          try {
            setProfessionals(JSON.parse(localProf));
          } catch (e) {}
        }
      }

      // Cargar Historial
      const { data: histData } = await supabase
        .schema('quirofano')
        .from('admin_settings')
        .select('value')
        .eq('key', 'tripticos_sync_history')
        .maybeSingle();

      if (histData?.value) {
        try {
          const parsed = JSON.parse(histData.value);
          if (Array.isArray(parsed)) setHistory(parsed);
        } catch (e) {
          console.error('Error parseando tripticos_sync_history:', e);
        }
      } else {
        const localHist = localStorage.getItem('tripticos_sync_history');
        if (localHist) {
          try {
            setHistory(JSON.parse(localHist));
          } catch (e) {}
        }
      }
    } catch (err) {
      console.error('Error cargando settings de trípticos:', err);
    }
  };

  const saveProfessionals = async (updated: AoterProfessional[]) => {
    setProfessionals(updated);
    localStorage.setItem('tripticos_professionals', JSON.stringify(updated));
    try {
      await supabase
        .schema('quirofano')
        .from('admin_settings')
        .upsert({
          key: 'tripticos_professionals',
          value: JSON.stringify(updated),
          updated_at: new Date().toISOString()
        });
    } catch (err) {
      console.error('Error guardando tripticos_professionals en Supabase:', err);
    }
  };

  const saveHistory = async (updated: TripticoSyncHistoryItem[]) => {
    setHistory(updated);
    localStorage.setItem('tripticos_sync_history', JSON.stringify(updated));
    try {
      await supabase
        .schema('quirofano')
        .from('admin_settings')
        .upsert({
          key: 'tripticos_sync_history',
          value: JSON.stringify(updated),
          updated_at: new Date().toISOString()
        });
    } catch (err) {
      console.error('Error guardando tripticos_sync_history en Supabase:', err);
    }
  };

  // 3. Importar Médicos activos desde quirofano.doctors
  const handleImportDoctorsFromPanel = async () => {
    setIsLoading(true);
    setLoadingMessage('Importando profesionales del Panel de Cirugías...');
    try {
      const { data: docs, error } = await supabase
        .schema('quirofano')
        .from('doctors')
        .select('id, full_name, license_number, active')
        .eq('active', true);

      if (error) throw error;

      if (docs && docs.length > 0) {
        const existingNames = new Set(professionals.map(p => p.doctor_name.trim().toUpperCase()));
        const newProfs: AoterProfessional[] = [...professionals];

        docs.forEach(d => {
          const norm = (d.full_name || '').trim().toUpperCase();
          if (norm && !existingNames.has(norm)) {
            newProfs.push({
              id: d.id,
              doctor_id: d.id,
              doctor_name: norm,
              matricula: d.license_number || '',
              sgapi_username: '',
              sgapi_password: '',
              active: true,
              created_at: new Date().toISOString()
            });
            existingNames.add(norm);
          }
        });

        await saveProfessionals(newProfs);
        alert(`Se sincronizaron ${newProfs.length} profesionales en total.`);
      }
    } catch (err: any) {
      alert(`Error importando médicos: ${err.message}`);
    } finally {
      setIsLoading(false);
      setLoadingMessage('');
    }
  };

  // 4. Acción Relevar Cirugías (GlobalApp + Cruce Panel de Cirugías)
  const handleRelevarCirugias = async () => {
    if (!dateFrom || !dateTo) {
      alert('Por favor selecciona las fechas "Desde" y "Hasta".');
      return;
    }

    const electronAPI = (window as any).electronAPI;
    if (!electronAPI || typeof electronAPI.runTripticosScraper !== 'function') {
      alert('Esta funcionalidad requiere ejecutarse en la aplicación de escritorio (Electron).');
      return;
    }

    setIsLoading(true);
    setProgressPercent(0);
    setProgressCurrent(0);
    setProgressTotal(0);
    setLoadingMessage('Consultando GlobalApp y cruzando datos con el Panel de Cirugías...');
    setLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] Iniciando relevamiento para el rango: ${dateFrom} al ${dateTo}...`]);
    setIsLogDrawerOpen(true);

    try {
      // Paso 0: Obtener médicos traumatólogos desde quirofano.doctors (Especialidad / Patología en Panel de Cirugías)
      const { data: panelDoctors } = await supabase
        .schema('quirofano')
        .from('doctors')
        .select('id, name, full_name, license_number, specialty, globalapp_patologia, active');

      const traumaDoctorsList = (panelDoctors || []).filter(d => {
        const pat = String(d.globalapp_patologia || '').toUpperCase();
        const esp = String(d.specialty || '').toUpperCase();
        return pat.includes('TRAUMA') || esp.includes('TRAUMA');
      }).map(d => ({
        id: d.id,
        name: d.name || d.full_name || '',
        full_name: d.full_name || d.name || '',
        license_number: d.license_number || '',
        globalapp_patologia: d.globalapp_patologia || 'TRAUMATOLOGIA'
      }));

      // Paso 1: Ejecutar scraper en GlobalApp
      const gaRes = await electronAPI.runTripticosScraper({
        action: 'relevar',
        desde: dateFrom,
        hasta: dateTo,
        trauma_doctors: traumaDoctorsList
      });

      if (!gaRes || !gaRes.success) {
        throw new Error(gaRes?.error || 'Error al consultar cirugías en GlobalApp.');
      }

      const gaPartes: TripticoCirugia[] = gaRes.partes || [];
      setLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] Partes obtenidos de GlobalApp: ${gaPartes.length}. Consultando cirugías del Panel...`]);

      // Paso 2: Consultar quirofano.surgeries en Supabase para enriquecer datos (DNI, NUC, nacimiento, sexo, ayudantes)
      const { data: panelSurgeries, error: panelErr } = await supabase
        .schema('quirofano')
        .from('surgeries')
        .select(`
          id,
          surgery_date,
          start_time,
          end_time,
          procedure_name,
          diagnosis,
          nuc,
          patient:patients (
            id,
            full_name,
            document_number,
            nuc,
            birth_date,
            sexo,
            insurance_name
          ),
          doctor:doctors (
            id,
            full_name,
            license_number
          )
        `)
        .gte('surgery_date', dateFrom)
        .lte('surgery_date', dateTo);

      if (panelErr) {
        console.warn('Aviso al consultar cirugías del Panel:', panelErr);
      }

      // Paso 3: Cruce e indexación
      const syncedIds = new Set(history.map(h => `${h.fecha_cirugia}_${h.paciente_dni || h.paciente_nombre}`));

      const enrichedList: TripticoCirugia[] = gaPartes.map(ga => {
        // Buscar match en panelSurgeries
        let matched: any = null;

        if (panelSurgeries && panelSurgeries.length > 0) {
          matched = panelSurgeries.find((ps: any) => {
            const sameDate = ps.surgery_date === ga.fecha_cirugia;
            if (!sameDate) return false;

            const pDni = (ps.patient?.document_number || '').trim();
            const gaDni = (ga.paciente_dni || '').trim();

            if (pDni && gaDni && pDni === gaDni) return true;

            // Comparar nombres normalizados
            const pNameNorm = (ps.patient?.full_name || '').toUpperCase().replace(/[^A-Z]/g, '');
            const gaNameNorm = (ga.paciente_nombre || '').toUpperCase().replace(/[^A-Z]/g, '');
            return pNameNorm && gaNameNorm && (pNameNorm.includes(gaNameNorm) || gaNameNorm.includes(pNameNorm));
          });
        }

        const patient = matched?.patient;
        const doc = matched?.doctor;

        return {
          ...ga,
          surgery_id: matched?.id || undefined,
          paciente_dni: patient?.document_number || ga.paciente_dni || '',
          paciente_nuc: patient?.nuc || undefined,
          paciente_fecha_nacimiento: patient?.birth_date || ga.paciente_fecha_nacimiento || undefined,
          paciente_sexo: patient?.sexo || ga.paciente_sexo || undefined,
          obra_social: patient?.insurance_name || ga.obra_social || 'OSER',
          especialista_matricula: doc?.license_number || ga.especialista_matricula || '',
          matched_panel: !!matched,
          selected: true,
          adjuntos: []
        };
      });

      // Filtrar cirugías ya sincronizadas previamente
      const pendingList = enrichedList.filter(s => {
        const key = `${s.fecha_cirugia}_${s.paciente_dni || s.paciente_nombre}`;
        return !syncedIds.has(key);
      });

      setCirugias(pendingList);
      setLogs(prev => [
        ...prev,
        `[${new Date().toLocaleTimeString()}] Cruce finalizado: ${pendingList.length} cirugías pendientes para sincronizar (${enrichedList.length - pendingList.length} ya sincronizadas anteriormente).`
      ]);
    } catch (err: any) {
      alert(`Error durante el relevamiento: ${err.message}`);
      setLogs(prev => [...prev, `[ERROR] ${err.message}`]);
    } finally {
      setIsLoading(false);
      setLoadingMessage('');
    }
  };

  // 5. Agrupamiento de Cirugías por Especialista
  const cirugiasPorEspecialista = useMemo(() => {
    const map = new Map<string, TripticoCirugia[]>();
    cirugias.forEach(c => {
      const doc = c.especialista_nombre || 'SIN ESPECIALISTA ASIGNADO';
      if (!map.has(doc)) map.set(doc, []);
      map.get(doc)!.push(c);
    });
    return Array.from(map.entries());
  }, [cirugias]);

  // Selección
  const totalCount = cirugias.length;
  const selectedCount = cirugias.filter(c => c.selected).length;
  const isAllSelected = totalCount > 0 && selectedCount === totalCount;

  const handleToggleSelectAll = () => {
    const next = !isAllSelected;
    setCirugias(prev => prev.map(c => ({ ...c, selected: next })));
  };

  const handleToggleDoctorSelect = (docName: string) => {
    const docSurgeries = cirugias.filter(c => c.especialista_nombre === docName);
    const allDocSelected = docSurgeries.every(c => c.selected);
    setCirugias(prev =>
      prev.map(c => (c.especialista_nombre === docName ? { ...c, selected: !allDocSelected } : c))
    );
  };

  const handleToggleSurgery = (id: string) => {
    setCirugias(prev => prev.map(c => (c.id === id ? { ...c, selected: !c.selected } : c)));
  };

  // 6. Adjuntar archivos por cirugía
  const handleAttachFiles = async (surgeryId: string) => {
    const electronAPI = (window as any).electronAPI;
    if (!electronAPI || typeof electronAPI.selectTripticosFiles !== 'function') {
      alert('La selección de archivos requiere la versión de escritorio.');
      return;
    }

    try {
      const selectedFiles: TripticoAdjunto[] = await electronAPI.selectTripticosFiles();
      if (selectedFiles && selectedFiles.length > 0) {
        setCirugias(prev =>
          prev.map(c => {
            if (c.id === surgeryId) {
              const existingPaths = new Set(c.adjuntos.map(a => a.path));
              const combined = [...c.adjuntos];
              selectedFiles.forEach(f => {
                if (!existingPaths.has(f.path)) {
                  combined.push(f);
                  existingPaths.add(f.path);
                }
              });
              return { ...c, adjuntos: combined };
            }
            return c;
          })
        );
      }
    } catch (err: any) {
      alert(`Error adjuntando archivos: ${err.message}`);
    }
  };

  const handleRemoveAttachment = (surgeryId: string, pathToRemove: string) => {
    setCirugias(prev =>
      prev.map(c => (c.id === surgeryId ? { ...c, adjuntos: c.adjuntos.filter(a => a.path !== pathToRemove) } : c))
    );
  };

  // Manejo de prácticas por cirugía (Agregar, Eliminar, Editar)
  const handleAddPractice = (surgeryId: string, cod?: string, desc?: string, pct: number = 100) => {
    const newCod = cod || '1240704';
    const newDesc = desc || (AOTER_NOMENCLADOR as any)[newCod] || 'Práctica Nomenclada AOTER';
    const newPr: TripticoPrestacion = {
      codigo: newCod,
      descripcion: newDesc,
      porcentaje_especialista: pct,
      porcentaje_ayudante_1: pct,
      porcentaje_ayudante_2: pct,
      tipo: 'principal'
    };

    setCirugias(prev =>
      prev.map(c => {
        if (c.id === surgeryId) {
          return { ...c, prestaciones: [...(c.prestaciones || []), newPr] };
        }
        return c;
      })
    );

    if (selectedItemForDetail && selectedItemForDetail.id === surgeryId) {
      setSelectedItemForDetail((prev: any) => ({
        ...prev,
        prestaciones: [...(prev.prestaciones || []), newPr]
      }));
    }
  };

  const handleRemovePractice = (surgeryId: string, indexToRemove: number) => {
    setCirugias(prev =>
      prev.map(c => {
        if (c.id === surgeryId) {
          const updated = [...(c.prestaciones || [])];
          updated.splice(indexToRemove, 1);
          return { ...c, prestaciones: updated };
        }
        return c;
      })
    );

    if (selectedItemForDetail && selectedItemForDetail.id === surgeryId) {
      setSelectedItemForDetail((prev: any) => {
        const updated = [...(prev.prestaciones || [])];
        updated.splice(indexToRemove, 1);
        return { ...prev, prestaciones: updated };
      });
    }
  };

  const handleUpdatePracticeField = (
    surgeryId: string,
    index: number,
    field: keyof TripticoPrestacion,
    value: any
  ) => {
    setCirugias(prev =>
      prev.map(c => {
        if (c.id === surgeryId) {
          const updated = [...(c.prestaciones || [])];
          if (updated[index]) {
            updated[index] = { ...updated[index], [field]: value };
            if (field === 'codigo' && (AOTER_NOMENCLADOR as any)[value]) {
              updated[index].descripcion = (AOTER_NOMENCLADOR as any)[value];
            }
          }
          return { ...c, prestaciones: updated };
        }
        return c;
      })
    );

    if (selectedItemForDetail && selectedItemForDetail.id === surgeryId) {
      setSelectedItemForDetail((prev: any) => {
        const updated = [...(prev.prestaciones || [])];
        if (updated[index]) {
          updated[index] = { ...updated[index], [field]: value };
          if (field === 'codigo' && (AOTER_NOMENCLADOR as any)[value]) {
            updated[index].descripcion = (AOTER_NOMENCLADOR as any)[value];
          }
        }
        return { ...prev, prestaciones: updated };
      });
    }
  };

  // Edición rápida de campos por cirugía
  const handleUpdateSurgeryField = (id: string, field: keyof TripticoCirugia, value: any) => {
    setCirugias(prev =>
      prev.map(c => {
        if (c.id === id) {
          const updated = { ...c, [field]: value };
          if (field === 'obra_social') {
            updated.convenio = value;
          }
          return updated;
        }
        return c;
      })
    );
  };

  // 7. Transferir a AOTER SGAPI
  const handleTransferToAoter = async () => {
    const selectedSurgeries = cirugias.filter(c => c.selected);
    if (selectedSurgeries.length === 0) {
      alert('No hay cirugías seleccionadas para transferir.');
      return;
    }

    // Verificar credenciales para los profesionales involucrados
    const missingCredsDocs: string[] = [];
    const activeProfMap = new Map<string, AoterProfessional>();
    professionals.forEach(p => {
      const norm = p.doctor_name.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (norm) activeProfMap.set(norm, p);
    });

    selectedSurgeries.forEach(s => {
      const key = (s.especialista_nombre || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
      const prof = activeProfMap.get(key);
      if (!prof || !prof.sgapi_username || !prof.sgapi_password) {
        if (!missingCredsDocs.includes(s.especialista_nombre)) {
          missingCredsDocs.push(s.especialista_nombre);
        }
      }
    });

    if (missingCredsDocs.length > 0) {
      const proceed = confirm(
        `Los siguientes profesionales no tienen usuario o contraseña cargados en la pestaña "Profesionales SGAPI":\n\n` +
          missingCredsDocs.map(d => `• ${d}`).join('\n') +
          `\n\n¿Deseas continuar transfiriendo solo las de médicos configurados?`
      );
      if (!proceed) {
        setActiveTab('profesionales');
        return;
      }
    }

    const electronAPI = (window as any).electronAPI;
    if (!electronAPI || typeof electronAPI.runTripticosScraper !== 'function') {
      alert('Esta función requiere la aplicación de escritorio (Electron).');
      return;
    }

    setIsSyncing(true);
    setProgressPercent(0);
    setProgressCurrent(0);
    setProgressTotal(selectedSurgeries.length);
    setLoadingMessage(`Transfiriendo ${selectedSurgeries.length} cirugía(s) a SGAPI de AOTER...`);
    setIsLogDrawerOpen(true);
    setLogs(prev => [
      ...prev,
      `[${new Date().toLocaleTimeString()}] Iniciando transferencia de ${selectedSurgeries.length} cirugías hacia AOTER SGAPI (Navegador: ${showBrowser ? 'Visible' : 'Segundo Plano'})...`
    ]);

    try {
      const result = await electronAPI.runTripticosScraper({
        action: 'transfer_aoter',
        surgeries: selectedSurgeries,
        professionals,
        show_browser: showBrowser
      });

      if (!result || !result.success) {
        throw new Error(result?.error || 'Error durante la transferencia a SGAPI.');
      }

      const syncResults: { id: string; status: 'synced' | 'error'; error?: string; orden_triptico_aoter?: string }[] =
        result.results || [];

      // Procesar cirugías exitosas y con error
      const newlySyncedHistory: TripticoSyncHistoryItem[] = [];
      const successfulIds = new Set<string>();

      syncResults.forEach(sr => {
        const surgery = selectedSurgeries.find(s => s.id === sr.id);
        if (!surgery) return;

        const isOk = sr.status === 'synced';
        if (isOk) {
          successfulIds.add(sr.id);
        }

        newlySyncedHistory.push({
          id: `hist_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          cirugia_id: surgery.id,
          fecha_cirugia: surgery.fecha_cirugia,
          paciente_nombre: surgery.paciente_nombre,
          paciente_dni: surgery.paciente_dni,
          paciente_nuc: surgery.paciente_nuc,
          especialista_nombre: surgery.especialista_nombre,
          especialista_matricula: surgery.especialista_matricula,
          ayudantes: [surgery.ayudante_1_nombre, surgery.ayudante_2_nombre].filter(Boolean) as string[],
          anestesista: surgery.anestesista_nombre,
          tipo_anestesia: surgery.tipo_anestesia,
          obra_social: surgery.obra_social,
          codigo_prestacion: surgery.prestaciones.map(p => p.codigo).join(', ') || 'N/A',
          prestaciones_detalle: surgery.prestaciones,
          diagnostico: surgery.diagnostico,
          tratamiento: surgery.tratamiento,
          protocolo_operatorio: surgery.protocolo_operatorio,
          recargo: surgery.recargo,
          adjuntos_count: surgery.adjuntos.length,
          orden_triptico_aoter: isOk ? (sr.orden_triptico_aoter || `AOTER-${Date.now()}`) : undefined,
          synced_at: new Date().toISOString(),
          synced_by: user?.name || user?.email || 'Administración',
          status: isOk ? 'synced' : 'error',
          error_message: sr.error
        });
      });

      // Actualizar historial persistente
      if (newlySyncedHistory.length > 0) {
        const updatedHist = [...newlySyncedHistory, ...history];
        await saveHistory(updatedHist);
      }

      // Remover las sincronizadas exitosamente de la lista activa de relevamiento
      if (successfulIds.size > 0) {
        setCirugias(prev => prev.filter(c => !successfulIds.has(c.id)));
      }

      const successCount = successfulIds.size;
      const errorCount = syncResults.filter(s => s.status === 'error').length;

      alert(
        `Transferencia a AOTER finalizada:\n\n` +
          `• ${successCount} tríptico(s) generado(s) correctamente (confirmados con fecha/hora y usuario).\n` +
          (errorCount > 0
            ? `• ${errorCount} cirugía(s) con error. Se detallaron en la pestaña 'Trípticos Generados' indicando el motivo de rechazo.`
            : '')
      );

      // Redirigir a la pestaña de historial / trípticos generados
      setActiveTab('historial');
    } catch (err: any) {
      alert(`Error en la transferencia a AOTER: ${err.message}`);
      setLogs(prev => [...prev, `[ERROR] ${err.message}`]);
    } finally {
      setIsSyncing(false);
    }
  };

  // 8. Imprimir Listado Limpio
  const handlePrintListado = () => {
    window.print();
  };

  // 9. Guardar Profesional Modal
  const handleSaveProf = async () => {
    if (!editingProf || !editingProf.doctor_name.trim()) {
      alert('El nombre del profesional es obligatorio.');
      return;
    }

    const updated = [...professionals];
    const idx = updated.findIndex(p => p.id === editingProf.id);
    if (idx >= 0) {
      updated[idx] = { ...editingProf, updated_at: new Date().toISOString() };
    } else {
      updated.push({
        ...editingProf,
        id: `prof_${Date.now()}`,
        created_at: new Date().toISOString()
      });
    }

    await saveProfessionals(updated);
    setShowProfModal(false);
    setEditingProf(null);
  };

  const handleDeleteProf = async (id: string) => {
    if (confirm('¿Eliminar este profesional de la lista de SGAPI?')) {
      const updated = professionals.filter(p => p.id !== id);
      await saveProfessionals(updated);
    }
  };

  // 10. Revertir / Desmarcar del historial
  const handleRevertSync = async (histItem: TripticoSyncHistoryItem) => {
    if (confirm(`¿Desmarcar del historial la cirugía de ${histItem.paciente_nombre}? Volverá a aparecer en las consultas de relevamiento.`)) {
      const updated = history.filter(h => h.id !== histItem.id);
      await saveHistory(updated);
    }
  };

  // Listas únicas para selects de filtros en Trípticos Generados
  const historyDoctorsList = useMemo(() => {
    const set = new Set<string>();
    history.forEach(h => {
      if (h.especialista_nombre) set.add(h.especialista_nombre.trim());
    });
    return Array.from(set).sort();
  }, [history]);

  const historyInsurancesList = useMemo(() => {
    const set = new Set<string>();
    history.forEach(h => {
      if (h.obra_social) set.add(h.obra_social.trim());
    });
    return Array.from(set).sort();
  }, [history]);

  // Filtrado de historial / Trípticos Generados por fecha, profesional, cobertura y búsqueda
  const filteredHistory = useMemo(() => {
    return history.filter(h => {
      if (historyStatusFilter !== 'all' && h.status !== historyStatusFilter) {
        return false;
      }
      if (historyDateFrom && h.fecha_cirugia < historyDateFrom) {
        return false;
      }
      if (historyDateTo && h.fecha_cirugia > historyDateTo) {
        return false;
      }
      if (historyDoctor && h.especialista_nombre.trim().toUpperCase() !== historyDoctor.trim().toUpperCase()) {
        return false;
      }
      if (historyInsurance && h.obra_social.trim().toUpperCase() !== historyInsurance.trim().toUpperCase()) {
        return false;
      }
      if (historySearch.trim()) {
        const q = historySearch.toLowerCase();
        const match =
          h.paciente_nombre.toLowerCase().includes(q) ||
          h.paciente_dni.toLowerCase().includes(q) ||
          h.especialista_nombre.toLowerCase().includes(q) ||
          (h.orden_triptico_aoter || '').toLowerCase().includes(q) ||
          (h.codigo_prestacion || '').toLowerCase().includes(q) ||
          (h.error_message || '').toLowerCase().includes(q);
        if (!match) return false;
      }
      return true;
    });
  }, [history, historySearch, historyDateFrom, historyDateTo, historyDoctor, historyInsurance, historyStatusFilter]);

  return (
    <div className="flex flex-col min-h-screen bg-slate-50 text-slate-800 pb-20">
      {/* Header Superior */}
      <header className="bg-white border-b border-slate-200 px-6 py-4 shadow-sm print:hidden">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="size-11 rounded-xl bg-teal-600 text-white flex items-center justify-center shadow-md">
              <span className="material-symbols-outlined text-2xl">description</span>
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900 leading-tight">
                Gestión de Trípticos Quirúrgicos AOTER
              </h1>
              <p className="text-xs text-slate-500 font-medium">
                Relevamiento GlobalApp • Cruce de Quirófano • Sincronización Automática SGAPI
              </p>
            </div>
          </div>

          {/* Selector de Pestañas */}
          <nav className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200">
            <button
              onClick={() => setActiveTab('carga')}
              className={`flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg transition-all ${
                activeTab === 'carga'
                  ? 'bg-white text-teal-700 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <span className="material-symbols-outlined text-base">assignment</span>
              Carga y Sincronización
              {cirugias.length > 0 && (
                <span className="px-1.5 py-0.5 text-[10px] font-bold rounded-full bg-teal-100 text-teal-800">
                  {cirugias.length}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab('profesionales')}
              className={`flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg transition-all ${
                activeTab === 'profesionales'
                  ? 'bg-white text-teal-700 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <span className="material-symbols-outlined text-base">badge</span>
              Profesionales SGAPI
              <span className="px-1.5 py-0.5 text-[10px] font-bold rounded-full bg-slate-200 text-slate-700">
                {professionals.length}
              </span>
            </button>

            <button
              onClick={() => setActiveTab('historial')}
              className={`flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg transition-all ${
                activeTab === 'historial'
                  ? 'bg-white text-teal-700 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <span className="material-symbols-outlined text-base">task_alt</span>
              Trípticos Generados
              {history.length > 0 && (
                <span className="px-1.5 py-0.5 text-[10px] font-bold rounded-full bg-emerald-100 text-emerald-800">
                  {history.length}
                </span>
              )}
            </button>
          </nav>
        </div>
      </header>

      {/* Contenido Principal */}
      <main className="max-w-7xl mx-auto w-full px-6 py-6 flex-1">
        {/* ======================================================== */}
        {/* PESTAÑA 1: CARGA Y RELEVAMIENTO DE TRÍPTICOS */}
        {/* ======================================================== */}
        {activeTab === 'carga' && (
          <div className="space-y-6">
            {/* Barra de Filtros y Acciones */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 print:hidden">
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2">
                  <label className="text-xs font-bold text-slate-600 uppercase tracking-wider">Desde:</label>
                  <input
                    type="date"
                    value={dateFrom}
                    onChange={e => setDateFrom(e.target.value)}
                    className="text-xs bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>

                <div className="flex items-center gap-2">
                  <label className="text-xs font-bold text-slate-600 uppercase tracking-wider">Hasta:</label>
                  <input
                    type="date"
                    value={dateTo}
                    onChange={e => setDateTo(e.target.value)}
                    className="text-xs bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>

                {/* Switch para ver o no el navegador Playwright */}
                <div className="flex items-center gap-2 ml-2 pl-3 border-l border-slate-200">
                  <button
                    type="button"
                    onClick={() => setShowBrowser(!showBrowser)}
                    className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      showBrowser ? 'bg-teal-600' : 'bg-slate-300'
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                        showBrowser ? 'translate-x-4' : 'translate-x-0'
                      }`}
                    />
                  </button>
                  <span className="text-xs font-medium text-slate-600 cursor-pointer" onClick={() => setShowBrowser(!showBrowser)}>
                    Ver navegador en pantalla
                  </span>
                </div>

                <button
                  onClick={handleRelevarCirugias}
                  disabled={isLoading || isSyncing}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold shadow-sm transition-all disabled:opacity-50 ml-1"
                >
                  <span className={`material-symbols-outlined text-base ${isLoading ? 'animate-spin' : ''}`}>
                    {isLoading ? 'progress_activity' : 'sync'}
                  </span>
                  Relevar Cirugías
                </button>
              </div>

              {/* Sugerencia de no cambiar de pantalla durante el relevamiento/sincronización */}
              {(isLoading || isSyncing) && (
                <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 text-amber-900 px-3 py-1.5 rounded-xl text-[11px] animate-pulse">
                  <span className="material-symbols-outlined text-base text-amber-600">info</span>
                  <span><strong>Tip:</strong> Permanecer en esta pestaña hasta completar el proceso para conservar la vista de cirugías.</span>
                </div>
              )}

              {/* Botones de Acción Global */}
              <div className="flex items-center gap-2">
                <button
                  onClick={handlePrintListado}
                  disabled={cirugias.length === 0}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold border border-slate-300 transition-all disabled:opacity-40"
                >
                  <span className="material-symbols-outlined text-base">print</span>
                  Imprimir Listado
                </button>

                <button
                  onClick={() => setIsLogDrawerOpen(!isLogDrawerOpen)}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border transition-all ${
                    isLogDrawerOpen
                      ? 'bg-slate-800 text-white border-slate-900 shadow-sm'
                      : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <span className="material-symbols-outlined text-base">terminal</span>
                  Logs ({logs.length})
                </button>

                <button
                  onClick={handleTransferToAoter}
                  disabled={selectedCount === 0 || isSyncing || isLoading}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-sm transition-all disabled:opacity-40"
                >
                  <span className={`material-symbols-outlined text-base ${isSyncing ? 'animate-spin' : ''}`}>
                    {isSyncing ? 'refresh' : 'send'}
                  </span>
                  Transferir a AOTER ({selectedCount})
                </button>
              </div>
            </div>

            {/* Cabecera para Impresión (Solo Visible al Imprimir) */}
            <div className="hidden print:block mb-6">
              <div className="border-b-2 border-slate-800 pb-3 mb-4 flex items-center justify-between">
                <div>
                  <h1 className="text-xl font-bold uppercase tracking-wide">ITEO SRL - Instituto Traumatológico</h1>
                  <h2 className="text-sm font-semibold text-slate-700">Listado General de Trípticos Quirúrgicos AOTER</h2>
                  <p className="text-xs text-slate-500">Período: {dateFrom} al {dateTo}</p>
                </div>
                <div className="text-right text-xs text-slate-500">
                  <p>Emitido: {new Date().toLocaleDateString()} {new Date().toLocaleTimeString()}</p>
                  <p>Total Cirugías: {cirugias.length}</p>
                </div>
              </div>
            </div>

            {/* Selector Global */}
            {cirugias.length > 0 && (
              <div className="flex items-center justify-between bg-teal-50/70 border border-teal-200/80 px-4 py-2.5 rounded-xl print:hidden">
                <label className="flex items-center gap-2.5 text-xs font-semibold text-teal-900 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isAllSelected}
                    onChange={handleToggleSelectAll}
                    className="size-4 rounded border-teal-400 text-teal-600 focus:ring-teal-500"
                  />
                  Seleccionar todas las cirugías de todos los profesionales ({selectedCount} de {totalCount})
                </label>
                <span className="text-[11px] font-medium text-teal-700">
                  {cirugiasPorEspecialista.length} profesional(es) con cirugías en el período
                </span>
              </div>
            )}

            {/* Estado de Vacío */}
            {cirugias.length === 0 && !isLoading && (
              <div className="bg-white border border-dashed border-slate-300 rounded-2xl p-12 text-center max-w-lg mx-auto">
                <div className="size-16 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-3">
                  <span className="material-symbols-outlined text-3xl">content_paste_search</span>
                </div>
                <h3 className="text-sm font-bold text-slate-800 mb-1">No hay cirugías relevadas</h3>
                <p className="text-xs text-slate-500 mb-4">
                  Selecciona el rango de fechas deseado y haz clic en "Relevar Cirugías" para consultar GlobalApp y cruzar los datos clínicos.
                </p>
                <button
                  onClick={handleRelevarCirugias}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-teal-600 text-white text-xs font-bold shadow-sm hover:bg-teal-700"
                >
                  <span className="material-symbols-outlined text-base">sync</span>
                  Relevar Cirugías Ahora
                </button>
              </div>
            )}

            {/* Listado de Cirugías Agrupadas por Especialista */}
            {cirugiasPorEspecialista.map(([docName, docSurgeries]) => {
              const allDocSelected = docSurgeries.every(c => c.selected);
              const docCred = professionals.find(
                p => p.doctor_name.trim().toUpperCase() === docName.trim().toUpperCase()
              );
              const hasCreds = docCred && docCred.sgapi_username && docCred.sgapi_password;

              return (
                <div
                  key={docName}
                  className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden break-inside-avoid"
                >
                  {/* Encabezado del Profesional */}
                  <div className="bg-slate-100/80 px-5 py-3 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={allDocSelected}
                        onChange={() => handleToggleDoctorSelect(docName)}
                        className="size-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500 cursor-pointer print:hidden"
                        title="Seleccionar todas las de este médico"
                      />
                      <div className="flex items-center gap-2">
                        <span className="material-symbols-outlined text-teal-700 text-lg">medical_services</span>
                        <h2 className="text-sm font-bold text-slate-900 tracking-tight">{docName}</h2>
                        {docCred?.matricula && (
                          <span className="text-[11px] font-medium text-slate-500 bg-white px-2 py-0.5 rounded border border-slate-200">
                            Mat: {docCred.matricula}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      {!hasCreds ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-0.5 rounded-full print:hidden">
                          <span className="material-symbols-outlined text-xs">warning</span>
                          Sin credenciales SGAPI
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full print:hidden">
                          <span className="material-symbols-outlined text-xs">verified</span>
                          SGAPI: {docCred?.sgapi_username}
                        </span>
                      )}

                      <span className="text-xs font-semibold text-slate-600 bg-slate-200/80 px-2.5 py-1 rounded-lg">
                        {docSurgeries.length} cirugía(s)
                      </span>
                    </div>
                  </div>

                  {/* Tabla de Cirugías del Médico */}
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50/70 text-slate-500 font-bold border-b border-slate-200 uppercase tracking-wider text-[10px]">
                        <tr>
                          <th className="py-2.5 px-3 w-10 text-center print:hidden">Sel</th>
                          <th className="py-2.5 px-3 w-28">Fecha / Hora</th>
                          <th className="py-2.5 px-3">Paciente</th>
                          <th className="py-2.5 px-3 w-28">Ayudante(s)</th>
                          <th className="py-2.5 px-3">Diagnóstico y Tratamiento</th>
                          <th className="py-2.5 px-3">Códigos AOTER</th>
                          <th className="py-2.5 px-3 w-28 text-center print:hidden">Adjuntos</th>
                          <th className="py-2.5 px-3 w-20 text-center print:hidden">Detalle</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-medium">
                        {docSurgeries.map(surg => (
                          <tr
                            key={surg.id}
                            className={`hover:bg-slate-50/80 transition-colors ${
                              surg.selected ? 'bg-teal-50/30' : ''
                            }`}
                          >
                            {/* Checkbox de Fila */}
                            <td className="py-3 px-3 text-center print:hidden">
                              <input
                                type="checkbox"
                                checked={surg.selected}
                                onChange={() => handleToggleSurgery(surg.id)}
                                className="size-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500 cursor-pointer"
                              />
                            </td>

                            {/* Fecha y Horas */}
                            <td className="py-3 px-3 whitespace-nowrap">
                              <div className="font-bold text-slate-900">{surg.fecha_cirugia}</div>
                              <div className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5">
                                <span className="material-symbols-outlined text-[13px]">schedule</span>
                                {surg.hora_inicio || '08:00'} - {surg.hora_fin || '09:00'}
                              </div>
                            </td>

                            {/* Paciente y Cobertura */}
                            <td className="py-3 px-3">
                              <div className="font-bold text-slate-900">{surg.paciente_nombre}</div>
                              <div className="text-[11px] text-slate-500 flex flex-wrap items-center gap-1.5 mt-1">
                                <span>DNI: {surg.paciente_dni || 'S/D'}</span>
                                {surg.paciente_nuc && (
                                  <span className="bg-blue-50 text-blue-700 px-1.5 py-0.2 rounded font-semibold text-[10px] border border-blue-200">
                                    NUC: {surg.paciente_nuc}
                                  </span>
                                )}
                              </div>
                              <div className="mt-1.5">
                                <select
                                  value={surg.obra_social || ''}
                                  onChange={e => handleUpdateSurgeryField(surg.id, 'obra_social', e.target.value)}
                                  className="text-[11px] bg-slate-50 hover:bg-white focus:bg-white border border-slate-300 rounded px-1.5 py-0.5 font-medium text-slate-800 focus:outline-none focus:ring-1 focus:ring-teal-500 max-w-[220px] cursor-pointer"
                                  title="Seleccionar Obra Social aceptada por AOTER"
                                >
                                  {/* Si la actual no está en la lista estándar, mostrarla arriba */}
                                  {surg.obra_social && !AOTER_OBRAS_SOCIALES.some(os => os.nombre === surg.obra_social) && (
                                    <option value={surg.obra_social}>{surg.obra_social} (Actual)</option>
                                  )}
                                  <option value="">-- Seleccionar Cobertura AOTER --</option>
                                  {AOTER_OBRAS_SOCIALES.map(os => (
                                    <option key={os.id} value={os.nombre}>
                                      {os.nombre}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            </td>

                            {/* Equipo Quirúrgico (Ayudantes y Anestesista) */}
                            <td className="py-3 px-3">
                              {surg.ayudante_1_nombre ? (
                                <div className="text-slate-800 font-semibold text-[11px] truncate max-w-[140px]">
                                  {surg.ayudante_1_nombre}
                                  {surg.ayudante_2_nombre && (
                                    <div className="text-slate-500 font-normal text-[10px] truncate">
                                      + {surg.ayudante_2_nombre}
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <span className="text-slate-400 italic text-[11px]">Sin ayudante</span>
                              )}
                              {surg.anestesista_nombre && (
                                <div className="text-teal-700 font-medium text-[10px] truncate max-w-[140px] mt-0.5" title={`Anestesista: ${surg.anestesista_nombre} (${surg.tipo_anestesia || 'Anestesia'})`}>
                                  <span className="text-slate-400 font-bold mr-0.5">Anes:</span>
                                  {surg.anestesista_nombre}
                                </div>
                              )}
                            </td>

                            {/* Diagnóstico y Tratamiento */}
                            <td className="py-3 px-3">
                              <div className="text-slate-900 line-clamp-1 font-medium">
                                <span className="font-bold text-slate-600 text-[10px] uppercase mr-1">Diag:</span>
                                {surg.diagnostico || <span className="text-slate-400 italic">No especificado</span>}
                              </div>
                              <div className="text-slate-600 text-[11px] line-clamp-1 mt-0.5">
                                <span className="font-bold text-slate-500 text-[10px] uppercase mr-1">Trat:</span>
                                {surg.tratamiento || <span className="text-slate-400 italic">No especificado</span>}
                              </div>
                            </td>

                            {/* Códigos AOTER y % */}
                            <td className="py-3 px-3">
                              <div className="flex flex-col gap-1">
                                {surg.prestaciones && surg.prestaciones.length > 0 ? (
                                  surg.prestaciones.map((pr, pIdx) => (
                                    <div
                                      key={pIdx}
                                      className="inline-flex items-center gap-1.5 bg-slate-100 px-2 py-1 rounded text-[11px] border border-slate-200 text-slate-800 group/pr"
                                    >
                                      <span className="font-mono font-bold text-teal-800">{pr.codigo}</span>
                                      <span className="text-slate-500 truncate max-w-[130px]" title={pr.descripcion}>
                                        {pr.descripcion}
                                      </span>
                                      <span className="ml-auto font-bold text-emerald-700 bg-emerald-50 px-1 rounded text-[10px]">
                                        {pr.porcentaje_especialista}%
                                      </span>
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleRemovePractice(surg.id, pIdx);
                                        }}
                                        className="opacity-0 group-hover/pr:opacity-100 p-0.5 text-slate-400 hover:text-rose-600 rounded transition-opacity"
                                        title="Eliminar práctica"
                                      >
                                        <span className="material-symbols-outlined text-[13px] leading-none">close</span>
                                      </button>
                                    </div>
                                  ))
                                ) : (
                                  <span className="text-amber-600 bg-amber-50 px-2 py-0.5 rounded text-[10px] font-semibold border border-amber-200">
                                    Sin práctica AOTER
                                  </span>
                                )}
                                <button
                                  type="button"
                                  onClick={() => handleAddPractice(surg.id)}
                                  className="inline-flex items-center gap-1 text-[10px] font-bold text-teal-700 hover:text-teal-900 mt-0.5 w-fit hover:underline"
                                >
                                  <span className="material-symbols-outlined text-xs">add</span>
                                  Agregar práctica
                                </button>
                              </div>
                            </td>

                            {/* Botón de Adjuntos */}
                            <td className="py-3 px-3 text-center print:hidden">
                              <button
                                type="button"
                                onClick={() => handleAttachFiles(surg.id)}
                                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-all ${
                                  surg.adjuntos.length > 0
                                    ? 'bg-teal-50 text-teal-700 border-teal-300'
                                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                                }`}
                              >
                                <span className="material-symbols-outlined text-sm">attach_file</span>
                                <span>{surg.adjuntos.length}</span>
                              </button>
                            </td>

                            {/* Botón Ver Detalle */}
                            <td className="py-3 px-3 text-center print:hidden">
                              <button
                                onClick={() => setSelectedItemForDetail(surg)}
                                className="p-1 rounded-lg hover:bg-slate-200 text-slate-500 hover:text-slate-900 transition-colors"
                                title="Ver detalles completos del tríptico"
                              >
                                <span className="material-symbols-outlined text-base">visibility</span>
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ======================================================== */}
        {/* PESTAÑA 2: GESTIÓN DE PROFESIONALES SGAPI (AOTER) */}
        {/* ======================================================== */}
        {activeTab === 'profesionales' && (
          <div className="space-y-6">
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <h2 className="text-base font-bold text-slate-900">Credenciales AOTER SGAPI</h2>
                <p className="text-xs text-slate-500">
                  Configura el usuario y contraseña del portal AOTER (servicios.aoter.com.ar) para cada médico especialista.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleImportDoctorsFromPanel}
                  disabled={isLoading}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold border border-slate-300 transition-all"
                >
                  <span className="material-symbols-outlined text-base">download</span>
                  Sincronizar Médicos del Panel
                </button>

                <button
                  onClick={() => {
                    setEditingProf({
                      id: `prof_${Date.now()}`,
                      doctor_name: '',
                      matricula: '',
                      sgapi_username: '',
                      sgapi_password: '',
                      active: true
                    });
                    setShowProfModal(true);
                  }}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold shadow-sm transition-all"
                >
                  <span className="material-symbols-outlined text-base">add</span>
                  Nuevo Profesional
                </button>
              </div>
            </div>

            {/* Listado de Profesionales */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-500 font-bold border-b border-slate-200 uppercase tracking-wider text-[10px]">
                  <tr>
                    <th className="py-3 px-4">Profesional</th>
                    <th className="py-3 px-4">Matrícula</th>
                    <th className="py-3 px-4">Usuario SGAPI</th>
                    <th className="py-3 px-4">Contraseña SGAPI</th>
                    <th className="py-3 px-4 text-center">Estado</th>
                    <th className="py-3 px-4 text-center">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {professionals.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-12 text-center text-slate-400 italic">
                        No hay profesionales configurados. Haz clic en "Sincronizar Médicos del Panel" para cargarlos automáticamente.
                      </td>
                    </tr>
                  ) : (
                    professionals.map(prof => (
                      <tr key={prof.id} className="hover:bg-slate-50 transition-colors">
                        <td className="py-3 px-4 font-bold text-slate-900">{prof.doctor_name}</td>
                        <td className="py-3 px-4 font-mono text-slate-600">{prof.matricula || 'S/D'}</td>
                        <td className="py-3 px-4">
                          {prof.sgapi_username ? (
                            <span className="font-mono bg-slate-100 text-slate-800 px-2 py-0.5 rounded text-[11px] border border-slate-200">
                              {prof.sgapi_username}
                            </span>
                          ) : (
                            <span className="text-amber-600 italic text-[11px]">Sin usuario</span>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          {prof.sgapi_password ? (
                            <span className="text-slate-400 font-mono text-[11px]">••••••••</span>
                          ) : (
                            <span className="text-amber-600 italic text-[11px]">Sin clave</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-center">
                          <span
                            className={`inline-block size-2 rounded-full ${
                              prof.active ? 'bg-emerald-500' : 'bg-slate-300'
                            }`}
                          />
                        </td>
                        <td className="py-3 px-4 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <button
                              onClick={() => {
                                setEditingProf({ ...prof });
                                setShowProfModal(true);
                              }}
                              className="p-1 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-slate-800"
                              title="Editar"
                            >
                              <span className="material-symbols-outlined text-base">edit</span>
                            </button>
                            <button
                              onClick={() => handleDeleteProf(prof.id)}
                              className="p-1 rounded-lg hover:bg-rose-50 text-slate-400 hover:text-rose-600"
                              title="Eliminar"
                            >
                              <span className="material-symbols-outlined text-base">delete</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ======================================================== */}
        {/* PESTAÑA 3: TRÍPTICOS GENERADOS (AUDITORÍA & FILTROS) */}
        {/* ======================================================== */}
        {activeTab === 'historial' && (
          <div className="space-y-6">
            {/* Barra de Filtros Avanzados */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col gap-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                    <span className="material-symbols-outlined text-teal-700">task_alt</span>
                    Trípticos Generados
                  </h2>
                  <p className="text-xs text-slate-500">
                    Registro de trípticos procesados en AOTER SGAPI con trazabilidad de fecha/hora, usuario emisor y estado de carga.
                  </p>
                </div>

                {/* Filtro por estado: Todos / Exitosos / Con Error */}
                <div className="flex items-center bg-slate-100 p-1 rounded-xl self-start sm:self-auto">
                  <button
                    onClick={() => setHistoryStatusFilter('all')}
                    className={`px-3 py-1 text-xs font-bold rounded-lg transition-all ${
                      historyStatusFilter === 'all'
                        ? 'bg-white text-slate-900 shadow-sm'
                        : 'text-slate-500 hover:text-slate-900'
                    }`}
                  >
                    Todos ({history.length})
                  </button>
                  <button
                    onClick={() => setHistoryStatusFilter('synced')}
                    className={`px-3 py-1 text-xs font-bold rounded-lg transition-all ${
                      historyStatusFilter === 'synced'
                        ? 'bg-white text-emerald-700 shadow-sm'
                        : 'text-slate-500 hover:text-slate-900'
                    }`}
                  >
                    Confirmados ({history.filter(h => h.status === 'synced').length})
                  </button>
                  <button
                    onClick={() => setHistoryStatusFilter('error')}
                    className={`px-3 py-1 text-xs font-bold rounded-lg transition-all ${
                      historyStatusFilter === 'error'
                        ? 'bg-white text-rose-700 shadow-sm'
                        : 'text-slate-500 hover:text-slate-900'
                    }`}
                  >
                    Con Error ({history.filter(h => h.status === 'error').length})
                  </button>
                </div>
              </div>

              {/* Filtros por Fecha, Profesional y Cobertura */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 pt-3 border-t border-slate-100">
                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                    Fecha Cirugía (Desde):
                  </label>
                  <input
                    type="date"
                    value={historyDateFrom}
                    onChange={e => setHistoryDateFrom(e.target.value)}
                    className="w-full text-xs bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                    Fecha Cirugía (Hasta):
                  </label>
                  <input
                    type="date"
                    value={historyDateTo}
                    onChange={e => setHistoryDateTo(e.target.value)}
                    className="w-full text-xs bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                    Profesional Especialista:
                  </label>
                  <select
                    value={historyDoctor}
                    onChange={e => setHistoryDoctor(e.target.value)}
                    className="w-full text-xs bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500"
                  >
                    <option value="">Todos los profesionales</option>
                    {historyDoctorsList.map(doc => (
                      <option key={doc} value={doc}>
                        {doc}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                    Cobertura / Obra Social:
                  </label>
                  <select
                    value={historyInsurance}
                    onChange={e => setHistoryInsurance(e.target.value)}
                    className="w-full text-xs bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500"
                  >
                    <option value="">Todas las coberturas</option>
                    {historyInsurancesList.map(os => (
                      <option key={os} value={os}>
                        {os}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                    Búsqueda general:
                  </label>
                  <div className="relative">
                    <span className="material-symbols-outlined text-slate-400 absolute left-2.5 top-2 text-base">
                      search
                    </span>
                    <input
                      type="text"
                      placeholder="Paciente, DNI u orden..."
                      value={historySearch}
                      onChange={e => setHistorySearch(e.target.value)}
                      className="w-full text-xs pl-8 pr-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500"
                    />
                  </div>
                </div>
              </div>

              {/* Botón reset filtros si alguno activo */}
              {(historyDateFrom || historyDateTo || historyDoctor || historyInsurance || historySearch || historyStatusFilter !== 'all') && (
                <div className="flex justify-end pt-1">
                  <button
                    onClick={() => {
                      setHistoryDateFrom('');
                      setHistoryDateTo('');
                      setHistoryDoctor('');
                      setHistoryInsurance('');
                      setHistorySearch('');
                      setHistoryStatusFilter('all');
                    }}
                    className="text-xs font-semibold text-teal-700 hover:text-teal-900 flex items-center gap-1"
                  >
                    <span className="material-symbols-outlined text-sm">filter_alt_off</span>
                    Limpiar Filtros
                  </button>
                </div>
              )}
            </div>

            {/* Tabla de Trípticos Generados */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-500 font-bold border-b border-slate-200 uppercase tracking-wider text-[10px]">
                  <tr>
                    <th className="py-3 px-4 w-12 text-center">Estado</th>
                    <th className="py-3 px-4">Fecha Cirugía</th>
                    <th className="py-3 px-4">Paciente y Cobertura</th>
                    <th className="py-3 px-4">Especialista</th>
                    <th className="py-3 px-4">Prácticas</th>
                    <th className="py-3 px-4">Orden / Motivo</th>
                    <th className="py-3 px-4">Generado</th>
                    <th className="py-3 px-4 text-center">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {filteredHistory.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-12 text-center text-slate-400 italic">
                        No se encontraron registros con los filtros seleccionados.
                      </td>
                    </tr>
                  ) : (
                    filteredHistory.map(item => {
                      const isOk = item.status === 'synced';
                      return (
                        <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                          {/* Columna Estado con tilde o error */}
                          <td className="py-3 px-4 text-center">
                            {isOk ? (
                              <span
                                className="inline-flex items-center justify-center size-6 rounded-full bg-emerald-100 text-emerald-700 shadow-sm"
                                title="Tríptico confirmado y generado correctamente"
                              >
                                <span className="material-symbols-outlined text-sm font-bold">check</span>
                              </span>
                            ) : (
                              <span
                                className="inline-flex items-center justify-center size-6 rounded-full bg-rose-100 text-rose-700 shadow-sm"
                                title={item.error_message || 'Error durante la carga'}
                              >
                                <span className="material-symbols-outlined text-sm font-bold">close</span>
                              </span>
                            )}
                          </td>

                          {/* Fecha Cirugía */}
                          <td className="py-3 px-4 font-bold text-slate-900 whitespace-nowrap">
                            {item.fecha_cirugia}
                          </td>

                          {/* Paciente y Cobertura */}
                          <td className="py-3 px-4">
                            <div className="font-bold text-slate-900">{item.paciente_nombre}</div>
                            <div className="text-[11px] text-slate-500 mt-0.5">
                              <span>DNI: {item.paciente_dni || 'S/D'}</span>
                              <span className="ml-1.5 bg-slate-100 px-1.5 py-0.5 rounded text-[10px] text-slate-700 font-semibold">
                                {item.obra_social}
                              </span>
                            </div>
                          </td>

                          {/* Especialista */}
                          <td className="py-3 px-4 text-slate-800 font-semibold whitespace-nowrap">
                            {item.especialista_nombre}
                            {item.especialista_matricula && (
                              <span className="block text-[10px] text-slate-400 font-normal">
                                Mat: {item.especialista_matricula}
                              </span>
                            )}
                          </td>

                          {/* Prácticas AOTER */}
                          <td className="py-3 px-4 font-mono text-[11px] text-teal-800">
                            {item.codigo_prestacion}
                            {item.recargo && (
                              <span className="block text-[10px] font-sans font-bold text-emerald-700 mt-0.5">
                                Recargo: {item.recargo}
                              </span>
                            )}
                          </td>

                          {/* N° Orden AOTER o Detalle de Error */}
                          <td className="py-3 px-4 max-w-[220px]">
                            {isOk ? (
                              <span className="inline-flex items-center gap-1 font-mono bg-emerald-50 text-emerald-800 px-2 py-0.5 rounded text-[11px] font-bold border border-emerald-200">
                                <span className="material-symbols-outlined text-xs">verified</span>
                                {item.orden_triptico_aoter || 'SGAPI'}
                              </span>
                            ) : (
                              <div className="text-rose-700 text-[11px] bg-rose-50 border border-rose-200 rounded px-2 py-1 leading-tight" title={item.error_message}>
                                <div className="font-bold text-[10px] uppercase flex items-center gap-1">
                                  <span className="material-symbols-outlined text-xs">error</span>
                                  No cargado
                                </div>
                                <div className="truncate mt-0.5 text-[10px] text-rose-600">
                                  {item.error_message || 'Fallo de autenticación o campos requeridos en SGAPI'}
                                </div>
                              </div>
                            )}
                          </td>

                          {/* Fecha / Hora y Usuario de Carga */}
                          <td className="py-3 px-4 text-[11px] text-slate-500 whitespace-nowrap">
                            <div className="font-semibold text-slate-700">
                              {new Date(item.synced_at).toLocaleDateString()} {new Date(item.synced_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </div>
                            <div className="text-[10px] text-teal-700 font-medium flex items-center gap-0.5 mt-0.5">
                              <span className="material-symbols-outlined text-[11px]">person</span>
                              {item.synced_by}
                            </div>
                          </td>

                          {/* Acciones */}
                          <td className="py-3 px-4 text-center whitespace-nowrap">
                            <div className="flex items-center justify-center gap-1">
                              <button
                                onClick={() => setSelectedItemForDetail(item)}
                                className="p-1 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-slate-800"
                                title="Ver Ficha Completa del Tríptico"
                              >
                                <span className="material-symbols-outlined text-base">visibility</span>
                              </button>
                              <button
                                onClick={() => handleRevertSync(item)}
                                className="p-1 rounded-lg hover:bg-amber-50 text-slate-400 hover:text-amber-600"
                                title="Desmarcar / Reintentar en Carga"
                              >
                                <span className="material-symbols-outlined text-base">undo</span>
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>

      {/* ======================================================== */}
      {/* DRAWER / CONSOLA DE LOGS EN VIVO */}
      {/* ======================================================== */}
      <AnimatePresence>
        {isLogDrawerOpen && (
          <motion.div
            initial={{ y: 200, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 200, opacity: 0 }}
            className="fixed bottom-0 left-0 right-0 z-50 bg-slate-900 border-t border-slate-700 shadow-2xl text-slate-200 font-mono text-xs max-h-80 flex flex-col print:hidden"
          >
            <div className="bg-slate-950 px-4 py-2 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="size-2 rounded-full bg-emerald-400 animate-pulse" />
                <span className="font-bold text-slate-300">Consola de Sincronización en Vivo</span>
                <span className="text-[10px] text-slate-500">({logs.length} líneas)</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setLogs([])}
                  className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white text-[10px]"
                >
                  Limpiar
                </button>
                <button
                  onClick={() => setIsLogDrawerOpen(false)}
                  className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-white"
                >
                  <span className="material-symbols-outlined text-base">close</span>
                </button>
              </div>
            </div>

            <div className="p-4 overflow-y-auto space-y-1 flex-1 leading-relaxed">
              {logs.length === 0 ? (
                <div className="text-slate-600 italic">No hay registros aún...</div>
              ) : (
                logs.map((line, idx) => (
                  <div
                    key={idx}
                    className={`${
                      line.includes('[ERROR]') || line.includes('Error')
                        ? 'text-rose-400'
                        : line.includes('exitosamente') || line.includes('éxito')
                        ? 'text-emerald-400 font-bold'
                        : 'text-slate-300'
                    }`}
                  >
                    {line}
                  </div>
                ))
              )}
              <div ref={logEndRef} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ======================================================== */}
      {/* MODAL DETALLES DE CIRUGÍA / HISTORIAL */}
      {/* ======================================================== */}
      <AnimatePresence>
        {selectedItemForDetail && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm print:hidden">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl border border-slate-200"
            >
              <div className="bg-slate-50 px-6 py-4 border-b border-slate-200 flex items-center justify-between">
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    Ficha de Tríptico Quirúrgico
                  </h3>
                  <p className="text-xs text-slate-500">
                    {selectedItemForDetail.paciente_nombre} • {selectedItemForDetail.fecha_cirugia}
                  </p>
                </div>
                <button
                  onClick={() => setSelectedItemForDetail(null)}
                  className="p-1 rounded-lg hover:bg-slate-200 text-slate-500"
                >
                  <span className="material-symbols-outlined text-lg">close</span>
                </button>
              </div>

              <div className="p-6 space-y-4 text-xs">
                {/* Datos de Cabecera */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                  <div>
                    <span className="text-slate-400 text-[10px] uppercase font-bold block">Sanatorio</span>
                    <span className="font-bold text-slate-800">I.T.E.O. (Paraná)</span>
                  </div>
                  <div>
                    <span className="text-slate-400 text-[10px] uppercase font-bold block">Fecha</span>
                    <span className="font-bold text-slate-800">{selectedItemForDetail.fecha_cirugia}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 text-[10px] uppercase font-bold block">Especialista</span>
                    <span className="font-bold text-slate-800">{selectedItemForDetail.especialista_nombre}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 text-[10px] uppercase font-bold block">Paciente</span>
                    <span className="font-bold text-slate-800">{selectedItemForDetail.paciente_nombre}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 text-[10px] uppercase font-bold block">DNI / NUC</span>
                    <span className="font-bold text-slate-800">
                      {selectedItemForDetail.paciente_dni || 'S/D'} {selectedItemForDetail.paciente_nuc ? `• NUC: ${selectedItemForDetail.paciente_nuc}` : ''}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 text-[10px] uppercase font-bold block">Obra Social</span>
                    {'selected' in selectedItemForDetail ? (
                      <select
                        value={selectedItemForDetail.obra_social || ''}
                        onChange={e => {
                          const val = e.target.value;
                          handleUpdateSurgeryField(selectedItemForDetail.id, 'obra_social', val);
                          setSelectedItemForDetail({ ...selectedItemForDetail, obra_social: val, convenio: val });
                        }}
                        className="mt-0.5 w-full text-[11px] bg-white border border-slate-300 rounded px-1.5 py-0.5 font-bold text-slate-800 focus:outline-none focus:ring-1 focus:ring-teal-500 cursor-pointer"
                      >
                        {selectedItemForDetail.obra_social && !AOTER_OBRAS_SOCIALES.some(os => os.nombre === selectedItemForDetail.obra_social) && (
                          <option value={selectedItemForDetail.obra_social}>{selectedItemForDetail.obra_social} (Actual)</option>
                        )}
                        <option value="">-- Seleccionar Cobertura AOTER --</option>
                        {AOTER_OBRAS_SOCIALES.map(os => (
                          <option key={os.id} value={os.nombre}>
                            {os.nombre}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className="font-bold text-slate-800">{selectedItemForDetail.obra_social}</span>
                    )}
                  </div>
                </div>

                {/* Diagnóstico y Tratamiento */}
                <div className="space-y-2">
                  <div>
                    <span className="font-bold text-slate-700 text-[11px] block">Diagnóstico:</span>
                    <p className="bg-slate-50 p-2 rounded-lg border border-slate-200 text-slate-800">
                      {selectedItemForDetail.diagnostico || <span className="italic text-slate-400">Sin diagnóstico registrado</span>}
                    </p>
                  </div>

                  <div>
                    <span className="font-bold text-slate-700 text-[11px] block">Tratamiento / Práctica Efectuada:</span>
                    <p className="bg-slate-50 p-2 rounded-lg border border-slate-200 text-slate-800">
                      {selectedItemForDetail.tratamiento || <span className="italic text-slate-400">Sin tratamiento registrado</span>}
                    </p>
                  </div>
                </div>

                {/* Prestaciones AOTER */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="font-bold text-slate-700 text-[11px] block">
                      Prácticas Nomencladas AOTER:
                    </span>
                    {'selected' in selectedItemForDetail && (
                      <button
                        type="button"
                        onClick={() => handleAddPractice(selectedItemForDetail.id)}
                        className="inline-flex items-center gap-1 text-[11px] font-bold text-teal-700 hover:text-teal-900 bg-teal-50 hover:bg-teal-100 px-2 py-0.5 rounded-lg border border-teal-200 transition-colors"
                      >
                        <span className="material-symbols-outlined text-sm font-bold">add</span>
                        Agregar Práctica
                      </button>
                    )}
                  </div>
                  {'prestaciones' in selectedItemForDetail && selectedItemForDetail.prestaciones.length > 0 ? (
                    <div className="space-y-1.5">
                      {selectedItemForDetail.prestaciones.map((p, idx) => {
                        const isEditable = 'selected' in selectedItemForDetail;
                        return (
                          <div
                            key={idx}
                            className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-slate-50 p-2 rounded-lg border border-slate-200 hover:border-slate-300 transition-colors"
                          >
                            <div className="flex-1 min-w-0">
                              {isEditable ? (
                                <div className="flex items-center gap-2">
                                  <input
                                    type="text"
                                    value={p.codigo}
                                    onChange={e => handleUpdatePracticeField(selectedItemForDetail.id, idx, 'codigo', e.target.value)}
                                    placeholder="Código AOTER"
                                    className="w-24 font-mono font-bold text-teal-800 text-xs bg-white border border-slate-300 rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-teal-500"
                                  />
                                  <input
                                    type="text"
                                    value={p.descripcion}
                                    onChange={e => handleUpdatePracticeField(selectedItemForDetail.id, idx, 'descripcion', e.target.value)}
                                    placeholder="Descripción de la práctica"
                                    className="flex-1 text-slate-700 text-xs bg-white border border-slate-300 rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-teal-500"
                                  />
                                </div>
                              ) : (
                                <div>
                                  <span className="font-mono font-bold text-teal-800 mr-2">{p.codigo}</span>
                                  <span className="text-slate-700">{p.descripcion}</span>
                                </div>
                              )}
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                              {isEditable ? (
                                <>
                                  <div className="flex items-center gap-1">
                                    <span className="text-[10px] text-slate-400 font-bold">Esp%:</span>
                                    <input
                                      type="number"
                                      value={p.porcentaje_especialista}
                                      onChange={e => handleUpdatePracticeField(selectedItemForDetail.id, idx, 'porcentaje_especialista', Number(e.target.value))}
                                      className="w-14 text-center text-xs font-bold bg-white border border-slate-300 rounded px-1 py-0.5 text-teal-800 focus:outline-none focus:ring-1 focus:ring-teal-500"
                                      min={0}
                                      max={100}
                                    />
                                  </div>
                                  <div className="flex items-center gap-1">
                                    <span className="text-[10px] text-slate-400 font-bold">Ayu%:</span>
                                    <input
                                      type="number"
                                      value={p.porcentaje_ayudante_1 || 0}
                                      onChange={e => {
                                        const v = Number(e.target.value);
                                        handleUpdatePracticeField(selectedItemForDetail.id, idx, 'porcentaje_ayudante_1', v);
                                        handleUpdatePracticeField(selectedItemForDetail.id, idx, 'porcentaje_ayudante_2', v);
                                      }}
                                      className="w-14 text-center text-xs font-bold bg-white border border-slate-300 rounded px-1 py-0.5 text-blue-800 focus:outline-none focus:ring-1 focus:ring-blue-500"
                                      min={0}
                                      max={100}
                                    />
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => handleRemovePractice(selectedItemForDetail.id, idx)}
                                    className="p-1 text-slate-400 hover:text-rose-600 rounded transition-colors"
                                    title="Eliminar práctica"
                                  >
                                    <span className="material-symbols-outlined text-base">delete</span>
                                  </button>
                                </>
                              ) : (
                                <>
                                  <span className="text-[10px] font-bold bg-teal-100 text-teal-800 px-1.5 py-0.5 rounded">
                                    Esp: {p.porcentaje_especialista}%
                                  </span>
                                  {p.porcentaje_ayudante_1 && (
                                    <span className="text-[10px] font-bold bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded">
                                      Ayu: {p.porcentaje_ayudante_1}%
                                    </span>
                                  )}
                                </>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="flex items-center justify-between p-3 bg-slate-50 border border-slate-200 rounded-lg">
                      <p className="text-slate-400 italic text-xs">No hay códigos de prestación asociados.</p>
                      {'selected' in selectedItemForDetail && (
                        <button
                          type="button"
                          onClick={() => handleAddPractice(selectedItemForDetail.id)}
                          className="inline-flex items-center gap-1 text-xs font-bold text-teal-700 hover:text-teal-900"
                        >
                          <span className="material-symbols-outlined text-sm">add</span>
                          Agregar primera práctica
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* Protocolo Operatorio */}
                <div>
                  <span className="font-bold text-slate-700 text-[11px] block mb-1">
                    Protocolo Operatorio (Narrativa Quirúrgica):
                  </span>
                  <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 max-h-36 overflow-y-auto text-slate-700 whitespace-pre-wrap leading-relaxed">
                    {selectedItemForDetail.protocolo_operatorio || <span className="italic text-slate-400">Sin protocolo operatorio adjunto</span>}
                  </div>
                </div>

                {/* Adjuntos */}
                {'adjuntos' in selectedItemForDetail && (
                  <div>
                    <span className="font-bold text-slate-700 text-[11px] block mb-1">
                      Archivos Adjuntos ({selectedItemForDetail.adjuntos.length}):
                    </span>
                    {selectedItemForDetail.adjuntos.length > 0 ? (
                      <div className="space-y-1">
                        {selectedItemForDetail.adjuntos.map((att, aIdx) => (
                          <div
                            key={aIdx}
                            className="flex items-center justify-between bg-slate-50 px-2.5 py-1.5 rounded-lg border border-slate-200"
                          >
                            <span className="truncate max-w-[400px] text-slate-800">{att.name}</span>
                            <button
                              type="button"
                              onClick={() => handleRemoveAttachment(selectedItemForDetail.id, att.path)}
                              className="text-rose-500 hover:text-rose-700 p-0.5"
                            >
                              <span className="material-symbols-outlined text-sm">delete</span>
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-slate-400 italic">Sin archivos adjuntos cargados.</p>
                    )}
                  </div>
                )}
              </div>

              <div className="bg-slate-50 px-6 py-3 border-t border-slate-200 flex justify-end">
                <button
                  onClick={() => setSelectedItemForDetail(null)}
                  className="px-4 py-2 rounded-xl bg-slate-200 hover:bg-slate-300 font-semibold text-slate-700"
                >
                  Cerrar
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ======================================================== */}
      {/* MODAL CONFIGURACIÓN DE PROFESIONAL SGAPI */}
      {/* ======================================================== */}
      <AnimatePresence>
        {showProfModal && editingProf && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-200 overflow-hidden"
            >
              <div className="bg-slate-50 px-6 py-4 border-b border-slate-200 flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-900">
                  {editingProf.doctor_name ? `Editar: ${editingProf.doctor_name}` : 'Nuevo Profesional SGAPI'}
                </h3>
                <button
                  onClick={() => {
                    setShowProfModal(false);
                    setEditingProf(null);
                  }}
                  className="p-1 rounded-lg hover:bg-slate-200 text-slate-500"
                >
                  <span className="material-symbols-outlined text-lg">close</span>
                </button>
              </div>

              <div className="p-6 space-y-4 text-xs">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Nombre Completo:</label>
                  <input
                    type="text"
                    value={editingProf.doctor_name}
                    onChange={e => setEditingProf({ ...editingProf, doctor_name: e.target.value.toUpperCase() })}
                    placeholder="Ej. PEREZ LINDO LUCAS OSCAR"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1">Matrícula Provincial:</label>
                  <input
                    type="text"
                    value={editingProf.matricula}
                    onChange={e => setEditingProf({ ...editingProf, matricula: e.target.value })}
                    placeholder="Ej. 6925"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1">Usuario Portal SGAPI (AOTER):</label>
                  <input
                    type="text"
                    value={editingProf.sgapi_username}
                    onChange={e => setEditingProf({ ...editingProf, sgapi_username: e.target.value })}
                    placeholder="Ej. usuario.aoter o DNI"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1">Contraseña Portal SGAPI:</label>
                  <div className="relative">
                    <input
                      type={showProfPassword ? 'text' : 'password'}
                      value={editingProf.sgapi_password}
                      onChange={e => setEditingProf({ ...editingProf, sgapi_password: e.target.value })}
                      placeholder="••••••••"
                      className="w-full px-3 py-2 pr-9 bg-slate-50 border border-slate-300 rounded-xl font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-500"
                    />
                    <button
                      type="button"
                      onClick={() => setShowProfPassword(!showProfPassword)}
                      className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-700"
                    >
                      <span className="material-symbols-outlined text-base">
                        {showProfPassword ? 'visibility_off' : 'visibility'}
                      </span>
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-2">
                  <input
                    type="checkbox"
                    id="prof_active"
                    checked={editingProf.active}
                    onChange={e => setEditingProf({ ...editingProf, active: e.target.checked })}
                    className="size-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                  />
                  <label htmlFor="prof_active" className="font-semibold text-slate-700 cursor-pointer">
                    Profesional Activo para sincronización
                  </label>
                </div>
              </div>

              <div className="bg-slate-50 px-6 py-3 border-t border-slate-200 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowProfModal(false);
                    setEditingProf(null);
                  }}
                  className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 font-semibold text-slate-700"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleSaveProf}
                  className="px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 font-bold text-white shadow-sm"
                >
                  Guardar Profesional
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Overlay / Barra Superior durante Carga Global (Sin Blur, Barra de Progreso y Consola Visible) */}
      {(isLoading || isSyncing) && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 w-full max-w-xl px-4 pointer-events-none print:hidden">
          <div className="bg-slate-900/95 text-white p-4 rounded-2xl shadow-2xl border border-teal-500/30 flex flex-col gap-2.5 pointer-events-auto">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="size-5 border-2 border-teal-400/30 border-t-teal-400 rounded-full animate-spin flex-shrink-0" />
                <span className="text-xs font-bold text-slate-100 truncate">{loadingMessage}</span>
              </div>
              {progressTotal > 0 && (
                <span className="text-xs font-mono font-bold text-teal-400 bg-teal-950/80 px-2 py-0.5 rounded border border-teal-500/40">
                  {progressCurrent}/{progressTotal} ({progressPercent}%)
                </span>
              )}
            </div>

            {/* Barra de Progreso visual */}
            <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden border border-slate-700">
              <div
                className="bg-gradient-to-r from-teal-500 to-emerald-400 h-full transition-all duration-300 ease-out"
                style={{ width: `${progressTotal > 0 ? progressPercent : 100}%` }}
              />
            </div>

            <div className="flex items-center justify-between text-[11px] text-slate-400">
              <span className="truncate max-w-[380px]">
                {logs.length > 0 ? logs[logs.length - 1].replace(/\[\d+:\d+:\d+\]\s*/, '') : 'Procesando...'}
              </span>
              <button
                type="button"
                onClick={() => setIsLogDrawerOpen(!isLogDrawerOpen)}
                className="text-teal-400 hover:text-teal-300 font-semibold underline text-[10px] ml-2 flex-shrink-0"
              >
                {isLogDrawerOpen ? 'Ocultar logs' : 'Ver consola'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Tripticos;

