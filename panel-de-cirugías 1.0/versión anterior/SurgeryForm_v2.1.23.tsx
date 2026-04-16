import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../src/lib/supabase';
import { MonitorCase } from '../pages/Monitor';
import { CatalogItem } from '../types';
import { useAuth } from '../src/lib/AuthContext';

interface SurgeryFormProps {
    surgery: MonitorCase;
    onClose: () => void;
    onSave: () => void;
}

interface FormItem {
    id?: string;
    type: 'anesthesia' | 'surgery';
    name: string;
    unit: string;
    quantity: number;
}

const SurgeryForm: React.FC<SurgeryFormProps> = ({ surgery, onClose, onSave }) => {
    const [loading, setLoading] = useState(false);
    const [isLoaded, setIsLoaded] = useState(false);
    const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);
    const [formId, setFormId] = useState<string | null>(null);

    const [isDirty, setIsDirty] = useState(false);
    const [showSuccess, setShowSuccess] = useState(false);
    const { user } = useAuth();
    const isReadOnly = (() => {
        if (user?.role === 'SuperAdmin' || user?.canFillForms) return false;

        const allowedRoles = ['Medico', 'Anestesista', 'Instrumentadora', 'Quirofano', 'JefaturaDeQuirofano', 'Tecnico'];
        const isAllowedRole = allowedRoles.includes(user?.role || '');

        if (user?.role === 'Tecnico' && surgery.status === 'previous') {
            if (surgery.actualEndTime && surgery.actualEndTime !== '--:--' && surgery.date) {
                // Modified: Extended to 60 minutes for Technicians to avoid locking during administrative tasks
                const endDateTime = new Date(`${surgery.date.split('T')[0]}T${surgery.actualEndTime}`);
                const now = new Date();
                const diffMinutes = (now.getTime() - endDateTime.getTime()) / 60000;
                return diffMinutes > 60;
            }
            return true;
        }

        return surgery.status === 'previous' && !isAllowedRole;
    })();

    // Form States
    const formatTimeHHmm = (timeStr?: string | null) => {
        if (!timeStr || timeStr === '--:--') return '';
        return timeStr.substring(0, 5); // Take only HH:mm
    };

    const [ayudante1, setAyudante1] = useState('');
    const [ayudante2, setAyudante2] = useState('');
    const [cardiologo, setCardiologo] = useState('');
    const [instrumentadora, setInstrumentadora] = useState('');
    const [hia, setHia] = useState('');
    const [hfa, setHfa] = useState('');
    const [hcc, setHcc] = useState(formatTimeHHmm(surgery.actualStartTime || ''));
    const [hfc, setHfc] = useState(formatTimeHHmm(surgery.actualEndTime || ''));
    const [anesthesiologistId, setAnesthesiologistId] = useState(surgery.anesthesiologistId || '');
    const [anatomiaPatologica, setAnatomiaPatologica] = useState('');
    const [cultivo, setCultivo] = useState('');
    const [patientMetadata, setPatientMetadata] = useState<any>(null);
    const [surgeryMetadata, setSurgeryMetadata] = useState<any>(null);
    const [procedimientoEfectuado, setProcedimientoEfectuado] = useState('');
    const [recommendedDuration, setRecommendedDuration] = useState<number | null>(null);

    const calculateAge = (dob: string | undefined) => {
        if (!dob) return 'N/A';
        const birthDate = new Date(dob);
        const today = new Date();
        let age = today.getFullYear() - birthDate.getFullYear();
        const m = today.getMonth() - birthDate.getMonth();
        if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
            age--;
        }
        return age;
    };

    // Items States
    const [items, setItems] = useState<FormItem[]>([]);
    const [newItem, setNewItem] = useState<{ name: string, unit: string, quantity: number, type: 'anesthesia' | 'surgery' }>({
        name: '', unit: 'unidad', quantity: 1, type: 'anesthesia'
    });
    const [catalogItems, setCatalogItems] = useState<CatalogItem[]>([]);
    const [filteredCatalog, setFilteredCatalog] = useState<CatalogItem[]>([]);
    const [showSuggestions, setShowSuggestions] = useState(false);

    // Editing states for in-line edit
    const [editingItemId, setEditingItemId] = useState<string | null>(null);
    const [tempQuantity, setTempQuantity] = useState<number>(1);

    useEffect(() => {
        if (newItem.name) {
            const filtered = catalogItems.filter(item =>
                item.name.toLowerCase().includes(newItem.name.toLowerCase())
            );
            setFilteredCatalog(filtered);
            setShowSuggestions(true);
        } else {
            setFilteredCatalog(catalogItems);
        }
    }, [newItem.name, catalogItems]);

    const unitOptions = ['unidad', 'amp', 'frasco', 'ml', 'mg', 'g', 'caja'];

    const [users, setUsers] = useState<any[]>([]);

    useEffect(() => {
        const fetchUsers = async () => {
            const { data } = await supabase
                .from('users')
                .select('id, name, role, doctor_id, doctors(specialty)')
                .eq('active', true)
                .order('name');

            if (data) {
                // Flatten instructions: some users might not have a doctor_id
                const flattened = data.map((u: any) => ({
                    ...u,
                    specialty: u.doctors?.specialty || null
                }));
                setUsers(flattened);
            }
        };

        const fetchRecommendedDuration = async () => {
            if (!surgery.procedure || user?.role !== 'SuperAdmin') return;
            try {
                const { data } = await supabase
                    .from('surgeries')
                    .select('actual_start_time, actual_end_time')
                    .eq('status', 'completed')
                    .eq('procedure_name', surgery.procedure)
                    .not('actual_start_time', 'is', null)
                    .not('actual_end_time', 'is', null);

                if (data && data.length >= 3) {
                    const durations = data.map(s => {
                        const [sh, sm] = s.actual_start_time.split(':').map(Number);
                        const [eh, em] = s.actual_end_time.split(':').map(Number);
                        return (eh * 60 + em) - (sh * 60 + sm);
                    }).filter(d => d > 0);

                    if (durations.length > 0) {
                        const avg = Math.round(durations.reduce((a, b) => a + b, 0) / durations.length);
                        setRecommendedDuration(avg);
                    }
                }
            } catch (err) {
                console.error('Error fetching recommended duration:', err);
            }
        };

        fetchUsers();
        fetchRecommendedDuration();
        fetchExistingForm();
        fetchCatalogItems();
    }, [surgery.id]);

    const fetchCatalogItems = async () => {
        try {
            const { data, error } = await supabase
                .from('catalog_items')
                .select('*')
                .eq('active', true)
                .order('name');
            if (error) throw error;
            setCatalogItems(data || []);
            setFilteredCatalog(data || []);
        } catch (err) {
            console.error('Error fetching catalog items:', err);
        }
    };

    const translateSide = (side?: string) => {
        if (!side) return '';
        const s = side.toLowerCase();
        if (s === 'left' || s === 'izquierda') return 'IZQUIERDA';
        if (s === 'right' || s === 'derecha') return 'DERECHA';
        if (s === 'bilateral') return 'BILATERAL';
        return side.toUpperCase();
    };

    const fetchExistingForm = async () => {
        try {
            setLoading(true);
            setIsLoaded(false);

            // Fetch form items
            const { data: form, error } = await supabase
                .from('surgery_forms')
                .select('*, surgery_form_items(*)')
                .eq('surgery_id', surgery.id)
                .maybeSingle();

            if (error) throw error;

            // Fetch surgery and patient metadata for print
            const { data: sx, error: sxError } = await supabase
                .from('surgeries')
                .select(`
                    *,
                    patient:patients(*),
                    doctor:doctors!doctor_id(*),
                    anesthesiologist:doctors!anesthesiologist_id(*),
                    operating_room:operating_rooms!operating_room_id(*)
                `)
                .eq('id', surgery.id)
                .maybeSingle();

            if (sx) {
                setSurgeryMetadata(sx);
                setPatientMetadata(sx.patient);
                if (sx.anesthesiologist_id) {
                    setAnesthesiologistId(sx.anesthesiologist_id);
                } else if (surgery.anesthesiologistId) {
                    // Fallback to prop if DB is null but prop has it (unlikely but safe)
                    setAnesthesiologistId(surgery.anesthesiologistId);
                }
            }

            if (form) {
                setFormId(form.id);
                setLastUpdatedAt(form.updated_at);
                setAyudante1(form.ayudante_1 || '');
                setAyudante2(form.ayudante_2 || '');
                setCardiologo(form.cardiologo || '');
                setInstrumentadora(form.instrumentadora || '');
                setHia(formatTimeHHmm(form.anestesia_inicio));
                setHfa(formatTimeHHmm(form.anestesia_fin));
                // Priority: Database (Fresh) > Actual time from monitor prop > Saved form time
                const dbHcc = sx ? formatTimeHHmm(sx.actual_start_time) : '';
                const dbHfc = sx ? formatTimeHHmm(sx.actual_end_time) : '';
                
                setHcc(dbHcc || formatTimeHHmm(surgery.actualStartTime || form.cirugia_inicio));
                setHfc(dbHfc || formatTimeHHmm(surgery.actualEndTime || form.cirugia_fin));
                setAnatomiaPatologica(form.anatomia_patologica || '');
                setCultivo(form.cultivo || '');
                setProcedimientoEfectuado(form.procedimiento_efectuado || '');
                setItems(form.surgery_form_items || []);
            }
            setIsLoaded(true);
        } catch (err) {
            console.error('Error fetching form:', err);
            alert('Error al cargar la ficha técnica. Por favor, cierre y vuelva a intentar.');
        } finally {
            setLoading(false);
        }
    };


    const handleAddItem = () => {
        if (!newItem.name || newItem.quantity <= 0) return;

        const item: FormItem = {
            id: `temp-${Date.now()}`,
            ...newItem
        };

        setItems([...items, item]);
        setNewItem({ ...newItem, name: '', quantity: 1 });
        setIsDirty(true);
    };

    const removeItem = (id: string) => {
        setItems(items.filter(i => i.id !== id));
        setIsDirty(true);
    };

    // Edit logic functions
    const handleStartEdit = (item: FormItem) => {
        setEditingItemId(item.id || null);
        setTempQuantity(item.quantity);
    };

    const handleSaveEdit = (id: string) => {
        setItems(items.map(i => i.id === id ? { ...i, quantity: tempQuantity } : i));
        setEditingItemId(null);
        setIsDirty(true);
    };

    const handleCancelEdit = () => {
        setEditingItemId(null);
    };

    const handleInternalClose = () => {
        if (isDirty && !isReadOnly) {
            const confirmed = window.confirm('Hay cambios sin guardar en la ficha quirúrgica. ¿Está seguro que desea cerrar?');
            if (confirmed) onClose();
        } else {
            onClose();
        }
    };

    const handleSave = async (autoClose: boolean = true) => {
        try {
            // Validation logic for times
            const tHia = formatTimeHHmm(hia);
            const tHcc = formatTimeHHmm(hcc);
            const tHfc = formatTimeHHmm(hfc);
            const tHfa = formatTimeHHmm(hfa);

            // Helper to convert HH:mm to minutes for easy comparison
            const timeToMinutes = (timeStr: string) => {
                if (!timeStr) return null;
                const [h, m] = timeStr.split(':').map(Number);
                return h * 60 + m;
            };

            const minHia = timeToMinutes(tHia);
            const minHcc = timeToMinutes(tHcc);
            const minHfc = timeToMinutes(tHfc);
            const minHfa = timeToMinutes(tHfa);

            // Validations
            if (minHcc !== null && minHfc !== null && minHcc > minHfc) {
                alert("Error: La Hora de Inicio de Cirugía no puede ser posterior a la Hora de Fin de Cirugía.");
                return;
            }

            setLoading(true);

            // Safety check: Don't allow saving if fetch failed initially
            if (!isLoaded && formId) {
                alert('Error de Seguridad: La ficha técnica no se cargó correctamente al abrirse. Para evitar pérdida de datos, el guardado está deshabilitado. Por favor, recargue la página.');
                setLoading(false);
                return;
            }

            // Optimistic Locking Check
            if (formId) {
                const { data: currentForm, error: checkError } = await supabase
                    .from('surgery_forms')
                    .select('updated_at')
                    .eq('id', formId)
                    .single();

                // Robust check: Compare first 19 chars (YYYY-MM-DDTHH:mm:ss) to avoid ISO precision mismatches
                if (!checkError && currentForm && lastUpdatedAt) {
                    const dbUpdate = currentForm.updated_at.substring(0, 19);
                    const localUpdate = lastUpdatedAt.substring(0, 19);
                    if (dbUpdate !== localUpdate) {
                        alert('Conflicto de Edición: Otro usuario ha modificado esta ficha mientras la tenías abierta. Por favor, cierre la ficha y vuelva a abrirla para ver los cambios más recientes.');
                        setLoading(false);
                        return;
                    }
                }
            }


            // Audit logging check
            const origHcc = formatTimeHHmm(surgery.actualStartTime || surgery.startTime);
            const origHfc = formatTimeHHmm(surgery.actualEndTime || surgery.endTime);
            // Audit logging
            const auditAction = formId ? 'UPDATE' : 'CREATE';
            const logDescription = formId 
                ? (timeChanges.length > 0 
                    ? `Ficha Técnica Actualizada. Cambios en tiempos: ${timeChanges.join(' | ')}` 
                    : 'Ficha Técnica Actualizada (Ajuste de datos e insumos)')
                : `Ficha Técnica Inicial Creada. Tiempos registrados: In Qx: ${tHcc || 'N/A'} | Fin Qx: ${tHfc || 'N/A'}`;

            await supabase.from('audit_logs').insert({
                user_name: user?.name || 'Usuario',
                user_role: user?.role,
                action: auditAction,
                resource: 'surgery_forms',
                resource_id: surgery.id,
                description: logDescription,
                meta: { patient: surgery.patient, procedure: surgery.procedure, source: 'SurgeryForm' }
            }).then(({ error }) => {
                if (error) console.warn('Silent Audit Error:', error);
            });

            const formData = {
                surgery_id: surgery.id,
                ayudante_1: ayudante1,
                ayudante_2: ayudante2,
                cardiologo: cardiologo,
                instrumentadora: instrumentadora,
                anestesia_inicio: tHia || null,
                anestesia_fin: tHfa || null,
                cirugia_inicio: tHcc || null,
                cirugia_fin: tHfc || null,
                anatomia_patologica: anatomiaPatologica,
                cultivo: cultivo,
                procedimiento_efectuado: procedimientoEfectuado,
                updated_at: new Date().toISOString()
            };

            // Update surgery anesthesiologist if changed
            if (anesthesiologistId !== surgery.anesthesiologistId) {
                const { error: sxError } = await supabase
                    .from('surgeries')
                    .update({ anesthesiologist_id: anesthesiologistId || null })
                    .eq('id', surgery.id);
                if (sxError) throw sxError;

                await supabase.from('audit_logs').insert({
                    user_name: user?.name,
                    user_role: user?.role,
                    action: 'UPDATE',
                    resource: 'surgeries',
                    resource_id: surgery.id,
                    description: `Anestesista modificado desde la ficha técnica.`,
                    meta: { old: surgery.anesthetist, new: users.find(u => u.doctor_id === anesthesiologistId)?.name }
                });
            }

            let currentFormId = formId;

            if (formId) {
                const { error } = await supabase.from('surgery_forms').update(formData).eq('id', formId);
                if (error) throw error;
            } else {
                const { data, error } = await supabase.from('surgery_forms').insert(formData).select('id').single();
                if (error) throw error;
                currentFormId = data.id;
            }

            if (currentFormId) {
                // Delete existing items
                const { error: deleteError } = await supabase.from('surgery_form_items').delete().eq('form_id', currentFormId);
                if (deleteError) {
                    alert('Error al actualizar materiales (posible conexión inestable). Intente de nuevo.');
                    throw deleteError;
                }

                if (items.length > 0) {
                    const itemsToInsert = items.map(i => ({
                        form_id: currentFormId,
                        type: i.type,
                        name: i.name,
                        unit: i.unit,
                        quantity: i.quantity
                    }));
                    const { error: itemsError } = await supabase.from('surgery_form_items').insert(itemsToInsert);
                    if (itemsError) {
                        alert('AVISO: Los materiales se borraron pero falló la inserción de los nuevos. NO CIERRE la ficha, intente "Guardar" de nuevo para reintentar la carga.');
                        throw itemsError;
                    }
                }

                // IMPORTANT: Update local state to allow subsequent saves without reopening the form
                setFormId(currentFormId);
                setLastUpdatedAt(formData.updated_at);
            }


            setIsDirty(false);
            setShowSuccess(true);

            if (autoClose) {
                // Wait 2 seconds showing the success message then close automatically
                setTimeout(() => {
                    setShowSuccess(false);
                    onSave();
                    onClose();
                }, 1800);
            } else {
                // For auto-saves (like before printing)
                setTimeout(() => setShowSuccess(false), 2000);
                onSave(); // Refresh parent just in case
            }

            return true;
        } catch (err) {
            console.error('Error saving form:', err);
            alert('Error al guardar la ficha');
            return false;
        } finally {

            setLoading(false);
        }
    };

    const handlePrint = async () => {
        if (loading) return;
        
        // If there are unsaved changes, save first
        if (isDirty) {
            const success = await handleSave(false);
            if (!success) {
                if (!confirm('No se pudieron guardar los cambios. ¿Desea imprimir de todas formas?')) {
                    return;
                }
            }
        }
        
        window.print();
    };

    return (
        <>
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4 animate-fadeIn modal-backdrop print:static print:p-0">
                <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl flex flex-col max-h-[90vh] overflow-hidden print-container print:max-h-none print:overflow-visible print:shadow-none">
                    {/* Documento Clínico Formal (Impresión) - PORTAL DIRECTO AL BODY PARA EVITAR HERENCIA DE LAYOUTS */}
                    {createPortal(
                        <div id="print-view-portal" className="hidden print:block bg-white text-black font-serif text-xs w-full">

                            <style dangerouslySetInnerHTML={{
                                __html: `
                                @media print {
                                    @page { size: A4 portrait; margin: 8mm; }
                                    #root { display: none !important; }
                                    body { background: white !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                                }
                            `}} />

                            {/* 1. CABECERA */}
                            <div className="flex justify-between items-center border-b-2 border-black pb-2 mb-3">
                                <div className="flex items-center">
                                    <img src="/logo-iteo.png" className="h-14 object-contain" alt="ITEO" />
                                </div>
                                <div className="text-right">
                                    <h2 className="text-2xl font-bold uppercase tracking-widest border border-black px-3 py-0.5 inline-block">Ficha Quirúrgica</h2>
                                    <p className="text-[10px] mt-0.5 font-bold">Código: {surgery.id?.slice(-8).toUpperCase()} | Formulario de Registro Oficial</p>
                                </div>
                            </div>

                            {/* 2. DATOS DEL PACIENTE E INTERVENCIÓN */}
                            <div className="border border-black mb-3">
                                <div className="bg-gray-100 border-b border-black px-2 py-0.5 font-bold text-[10px] uppercase tracking-wider">
                                    1. Datos del Paciente y Procedimiento
                                </div>
                                <div className="p-2 grid grid-cols-12 gap-y-1.5 gap-x-3 text-[11px]">
                                    <div className="col-span-8 border-b border-gray-300 pb-0.5">
                                        <span className="font-bold uppercase text-[9px] text-gray-600 block">Paciente</span>
                                        <span className="font-bold text-sm uppercase">{surgery.patient}</span>
                                    </div>
                                    <div className="col-span-4 border-b border-gray-300 pb-0.5">
                                        <span className="font-bold uppercase text-[9px] text-gray-600 block">Fecha de Cirugía</span>
                                        <span className="font-bold text-sm">{surgery.date ? new Date(surgery.date + 'T12:00:00').toLocaleDateString('es-AR') : '---'}</span>
                                    </div>
                                    <div className="col-span-12 border-b border-gray-300 pb-0.5">
                                        <span className="font-bold uppercase text-[9px] text-gray-600 block">Diagnóstico</span>
                                        <span className="font-bold text-sm uppercase">
                                            {(surgeryMetadata?.diagnosis || surgery.diagnosis) || (surgeryMetadata?.procedure_name || surgery.procedure) || '---'}
                                            {` ${translateSide(surgeryMetadata?.surgery_side || surgeryMetadata?.side || surgery.surgerySide || surgery.side)}`}
                                        </span>
                                    </div>
                                    <div className="col-span-12 border-b border-gray-300 pb-0.5">
                                        <span className="font-bold uppercase text-[9px] text-gray-600 block">Procedimiento Quirúrgico Efectuado</span>
                                        <span className="font-bold text-sm uppercase">{procedimientoEfectuado || '---'}</span>
                                    </div>
                                    <div className="col-span-4">
                                        <span className="font-bold uppercase text-[9px] text-gray-600 inline-block w-8">DNI:</span>
                                        <span className="font-semibold">{patientMetadata?.document_number || '---'}</span>
                                    </div>
                                    <div className="col-span-4">
                                        <span className="font-bold uppercase text-[9px] text-gray-600 inline-block w-8">Edad:</span>
                                        <span className="font-semibold">{calculateAge(patientMetadata?.birth_date)} años</span>
                                    </div>
                                    <div className="col-span-8">
                                        <span className="font-bold uppercase text-[9px] text-gray-600 inline-block w-16">Obra Social:</span>
                                        <span className="font-semibold uppercase">{surgeryMetadata?.medical_coverage || 'PARTICULAR'}</span>
                                    </div>
                                    <div className="col-span-12 border-t border-gray-200 pt-1 mt-1">
                                        <span className="font-bold uppercase text-[9px] text-gray-600 inline-block w-16">Domicilio:</span>
                                        <span className="font-semibold">{patientMetadata?.address || '---'} {patientMetadata?.locality ? `, ${patientMetadata.locality}` : ''}</span>
                                    </div>
                                </div>
                            </div>

                            {/* 3. EQUIPO QUIRÚRGICO Y TIEMPOS */}
                            <div className="grid grid-cols-2 gap-4 mb-3">
                                {/* Equipo */}
                                <div className="border border-black">
                                    <div className="bg-gray-100 border-b border-black px-2 py-0.5 font-bold text-[10px] uppercase tracking-wider">
                                        2. Equipo Quirúrgico
                                    </div>
                                    <div className="p-2 text-[10px] space-y-1">
                                        <div className="flex justify-between border-b border-dotted border-gray-400 pb-0.5">
                                            <span className="font-semibold">Cirujano:</span><span className="uppercase">{surgery.doctor}</span>
                                        </div>
                                        <div className="flex justify-between border-b border-dotted border-gray-400 pb-0.5">
                                            <span className="font-semibold">Anestesista:</span><span className="uppercase">{users.find(u => u.doctor_id === anesthesiologistId)?.name || surgery.anesthetist || '---'}</span>
                                        </div>
                                        <div className="flex justify-between border-b border-dotted border-gray-400 pb-0.5">
                                            <span className="font-semibold">1° Ayudante:</span><span className="uppercase">{ayudante1 || '---'}</span>
                                        </div>
                                        <div className="flex justify-between border-b border-dotted border-gray-400 pb-0.5">
                                            <span className="font-semibold">2° Ayudante:</span><span className="uppercase">{ayudante2 || '---'}</span>
                                        </div>
                                        <div className="flex justify-between border-b border-dotted border-gray-400 pb-0.5">
                                            <span className="font-semibold">Instrumentadora:</span><span className="uppercase">{instrumentadora || '---'}</span>
                                        </div>
                                    </div>
                                </div>

                                {/* Tiempos y Sala */}
                                <div className="border border-black flex flex-col">
                                    <div className="bg-gray-100 border-b border-black px-2 py-0.5 font-bold text-[10px] uppercase tracking-wider">
                                        3. Ubicación y Tiempos
                                    </div>
                                    <div className="p-2 text-[10px] flex-1 flex flex-col justify-between">
                                        <div className="border-b border-dotted border-gray-400 pb-1 mb-1.5 flex justify-between">
                                            <span className="font-semibold">Sala / Quirófano:</span><span className="uppercase font-bold">{surgeryMetadata?.operating_room?.name || '---'}</span>
                                        </div>
                                        <div className="grid grid-cols-4 gap-1 mb-1.5">
                                            <div className="border border-gray-300 p-0.5 text-center">
                                                <span className="block text-[8px] uppercase text-gray-500 font-bold border-b border-gray-200">In. Anes.</span>
                                                <span className="font-mono font-bold text-[11px]">{hia || '--:--'}</span>
                                            </div>
                                            <div className="border border-gray-300 p-0.5 text-center">
                                                <span className="block text-[8px] uppercase text-gray-500 font-bold border-b border-gray-200">Fin Anes.</span>
                                                <span className="font-mono font-bold text-[11px]">{hfa || '--:--'}</span>
                                            </div>
                                            <div className="border border-gray-300 p-0.5 text-center">
                                                <span className="block text-[8px] uppercase text-gray-500 font-bold border-b border-gray-200">In. Ciru.</span>
                                                <span className="font-mono font-bold text-[11px]">{hcc || '--:--'}</span>
                                            </div>
                                            <div className="border border-gray-300 p-0.5 text-center">
                                                <span className="block text-[8px] uppercase text-gray-500 font-bold border-b border-gray-200">Fin Ciru.</span>
                                                <span className="font-mono font-bold text-[11px]">{hfc || '--:--'}</span>
                                            </div>
                                        </div>
                                        <div className="flex justify-between gap-4 pt-1">
                                            <div className="flex-1 flex justify-between border-b border-dotted border-gray-400">
                                                <span className="font-semibold">A. Patológica:</span><span className="uppercase font-bold">{anatomiaPatologica || 'NO'}</span>
                                            </div>
                                            <div className="flex-1 flex justify-between border-b border-dotted border-gray-400">
                                                <span className="font-semibold">Cultivos:</span><span className="uppercase font-bold">{cultivo || 'NO'}</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* 4. INSUMOS Y MEDICACIÓN (COMPACTA) */}
                            <div className="border border-black mb-6 avoid-break">
                                <div className="bg-gray-100 border-b border-black px-2 py-0.5 font-bold text-[10px] uppercase tracking-wider">
                                    4. Insumos y Medicación Utilizada
                                </div>
                                <div className="grid grid-cols-2 divide-x divide-black">
                                    <div className="p-1">
                                        <div className="font-bold text-center border-b border-black pb-0.5 mb-1 text-[10px] tracking-widest uppercase">Anestesia</div>
                                        <ul className="text-[10px] leading-tight columns-1 list-none p-0 m-0">
                                            {items.filter(i => i.type === 'anesthesia').map((item, idx) => (
                                                <li key={idx} className="flex justify-between border-b border-gray-200 py-0.5">
                                                    <span className="truncate pr-1 uppercase">{item.name}</span>
                                                    <span className="font-bold shrink-0">{item.quantity} {item.unit}</span>
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                    <div className="p-1">
                                        <div className="font-bold text-center border-b border-black pb-0.5 mb-1 text-[10px] tracking-widest uppercase">Cirugía</div>
                                        <ul className="text-[10px] leading-tight columns-1 list-none p-0 m-0">
                                            {items.filter(i => i.type === 'surgery').map((item, idx) => (
                                                <li key={idx} className="flex justify-between border-b border-gray-200 py-0.5">
                                                    <span className="truncate pr-1 uppercase">{item.name}</span>
                                                    <span className="font-bold shrink-0">{item.quantity} {item.unit}</span>
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                </div>
                            </div>

                            {/* 5. FIRMAS */}
                            <div className="flex justify-center avoid-break mt-28">
                                <div className="text-center relative pt-2 w-64">
                                    <div className="absolute top-0 left-0 w-full border-t border-black"></div>
                                    <p className="text-[10px] font-bold uppercase tracking-widest">
                                        Médico Anestesista: {anesthesiologistId ? users.find(u => u.doctor_id === anesthesiologistId)?.name : '..........................'}
                                    </p>
                                </div>
                            </div>
                        </div>,
                        document.body
                    )}

                    {/* Check if logo exists, if not show placeholder or text */}
                    {/* Header (Hidden in Print) */}
                    <div className="p-6 border-b border-slate-200 flex justify-between items-center bg-slate-50 print:hidden relative">
                        {showSuccess && (
                            <div className="absolute inset-0 z-[100] bg-emerald-600 flex items-center justify-center animate-fadeIn">
                                <div className="flex items-center gap-3 text-white">
                                    <span className="material-symbols-outlined text-3xl animate-bounce">check_circle</span>
                                    <span className="text-xl font-black uppercase tracking-widest">Ficha Guardada Exitosamente</span>
                                </div>
                            </div>
                        )}
                        <div>
                            <h3 className="text-xl font-black text-slate-900 uppercase tracking-tight">
                                Ficha Técnica de Cirugía | <span className="text-indigo-600">{surgery.id?.slice(-8).toUpperCase()}</span>
                            </h3>
                            <div className="flex items-center gap-4">
                                <p className="text-xs text-slate-500 font-bold uppercase tracking-wider">
                                    Paciente: <span className="text-indigo-600 font-black">{surgery.patient}</span> |
                                    Procedimiento: <span className="text-slate-900">{surgery.procedure}</span>
                                </p>
                                {recommendedDuration && user?.role === 'SuperAdmin' && (
                                    <div className="flex items-center gap-2 bg-indigo-50 border border-indigo-100 px-3 py-1 rounded-full animate-pulse shadow-sm">
                                        <span className="material-symbols-outlined text-indigo-500 text-sm">psychology</span>
                                        <span className="text-[10px] font-black text-indigo-700 uppercase tracking-tighter">
                                            Predicción I.A.: ~{recommendedDuration} min recomendados
                                        </span>
                                    </div>
                                )}
                            </div>
                            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-[0.1em] mt-1">
                                Diagnóstico: <span className="text-slate-600">
                                    {(surgeryMetadata?.diagnosis || surgery.diagnosis) || (surgeryMetadata?.procedure_name || surgery.procedure) || '---'}
                                    <span className="text-indigo-600 ml-1">
                                        {translateSide(surgeryMetadata?.surgery_side || surgeryMetadata?.side || surgery.surgerySide || surgery.side)}
                                    </span>
                                </span>
                            </p>
                        </div>
                        <button onClick={handleInternalClose} className="text-slate-400 hover:text-slate-600 size-10 flex items-center justify-center rounded-full hover:bg-slate-200 transition-all print:hidden">
                            <span className="material-symbols-outlined">close</span>
                        </button>
                    </div>


                    <div className="flex-1 overflow-y-auto p-6 space-y-8 bg-white print:hidden">
                        {/* Section: General Information */}
                        <div>
                            <h4 className="flex items-center gap-2 text-xs font-black text-slate-400 uppercase tracking-[0.2em] mb-4 print:text-slate-900 print:border-b print:border-slate-300 print:pb-1">
                                <span className="material-symbols-outlined text-sm">info</span> Información General
                            </h4>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 print:grid print:grid-cols-2">
                                <div className="space-y-1">
                                    <label className="block text-[10px] font-bold text-slate-500 uppercase">1° Ayudante</label>
                                    <select
                                        value={ayudante1}
                                        onChange={e => { setAyudante1(e.target.value); setIsDirty(true); }}
                                        disabled={isReadOnly}
                                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm font-bold text-slate-900 disabled:opacity-75 focus:ring-2 focus:ring-indigo-500 outline-none"
                                    >
                                        <option value="">Seleccionar...</option>
                                        <optgroup label="MÉDICOS">
                                            {users.filter(u => (u.role === 'Medico' || u.role === 'DireccionMedica' || u.role === 'JefaturaDeGuardia') && u.role !== 'Residente' && u.specialty !== 'Anestesista').map(u => (
                                                <option key={u.id} value={u.name}>{u.name}</option>
                                            ))}
                                        </optgroup>
                                        <optgroup label="RESIDENTES">
                                            {users.filter(u => u.role === 'Residente' && u.specialty !== 'Anestesista').map(u => (
                                                <option key={u.id} value={u.name}>{u.name}</option>
                                            ))}
                                        </optgroup>
                                    </select>

                                </div>
                                <div className="space-y-1">
                                    <label className="block text-[10px] font-bold text-slate-500 uppercase">2° Ayudante</label>
                                    <select
                                        value={ayudante2}
                                        onChange={e => { setAyudante2(e.target.value); setIsDirty(true); }}
                                        disabled={isReadOnly}
                                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm font-bold text-slate-900 disabled:opacity-75 focus:ring-2 focus:ring-indigo-500 outline-none"
                                    >
                                        <option value="">Seleccionar...</option>
                                        <optgroup label="MÉDICOS">
                                            {users.filter(u => (u.role === 'Medico' || u.role === 'DireccionMedica' || u.role === 'JefaturaDeGuardia') && u.role !== 'Residente' && u.specialty !== 'Anestesista').map(u => (
                                                <option key={u.id} value={u.name}>{u.name}</option>
                                            ))}
                                        </optgroup>
                                        <optgroup label="RESIDENTES">
                                            {users.filter(u => u.role === 'Residente' && u.specialty !== 'Anestesista').map(u => (
                                                <option key={u.id} value={u.name}>{u.name}</option>
                                            ))}
                                        </optgroup>
                                    </select>

                                </div>
                                <div className="space-y-1">
                                    <label className="block text-[10px] font-bold text-slate-500 uppercase text-indigo-600">Médico Anestesista</label>
                                    <select
                                        value={anesthesiologistId}
                                        onChange={e => { setAnesthesiologistId(e.target.value); setIsDirty(true); }}
                                        disabled={isReadOnly}
                                        className="w-full bg-indigo-50 border border-indigo-100 rounded-lg px-3 py-2 text-sm font-bold text-slate-900 disabled:opacity-75 focus:ring-2 focus:ring-indigo-500 outline-none"
                                    >
                                        <option value="">Seleccionar...</option>
                                        {users.filter(u => u.specialty === 'Anestesista' || u.role === 'Anestesista').map(u => (
                                            <option key={u.id} value={u.doctor_id}>{u.name}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="space-y-1">
                                    <label className="block text-[10px] font-bold text-slate-500 uppercase">Instrumentadora</label>
                                    <select
                                        value={instrumentadora}
                                        onChange={e => { setInstrumentadora(e.target.value); setIsDirty(true); }}
                                        disabled={isReadOnly}
                                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm font-bold text-slate-900 disabled:opacity-75 focus:ring-2 focus:ring-indigo-500 outline-none"
                                    >
                                        <option value="">Seleccionar...</option>
                                        {users.filter(u => u.role === 'Instrumentadora' || u.role === 'Tecnico' || u.role === 'JefaturaDeQuirofano' || u.role === 'Quirofano').map(u => (
                                            <option key={u.id} value={u.name}>{u.name}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="col-span-full mt-4">
                                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Procedimiento Quirúrgico Efectuado</label>
                                    <textarea
                                        value={procedimientoEfectuado}
                                        onChange={e => { setProcedimientoEfectuado(e.target.value); setIsDirty(true); }}
                                        disabled={isReadOnly}
                                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm font-bold text-slate-900 disabled:opacity-75 focus:ring-2 focus:ring-indigo-500 outline-none min-h-[80px]"
                                        placeholder="Describa el procedimiento realizado..."
                                    />
                                </div>
                                <div className="col-span-full mt-4 p-4 bg-slate-50 border border-slate-200 rounded-xl">
                                    <div className="flex items-center gap-2 text-indigo-600 mb-2">
                                        <span className="material-symbols-outlined text-sm">location_on</span>
                                        <span className="text-[10px] font-black uppercase tracking-wider">Dirección del Paciente</span>
                                    </div>
                                    <p className="text-sm font-bold text-slate-700">
                                        {patientMetadata?.address || 'Sin dirección registrada'}
                                        {patientMetadata?.locality && ` - ${patientMetadata.locality}`}
                                        {patientMetadata?.province && ` (${patientMetadata.province})`}
                                    </p>
                                </div>
                            </div>
                        </div>

                        {/* Section: Times & Samples */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 print:grid print:grid-cols-2">
                            <div className="space-y-4">
                                <h4 className="flex items-center gap-2 text-xs font-black text-slate-400 uppercase tracking-[0.2em]">
                                    <span className="material-symbols-outlined text-sm">schedule</span> Control de Tiempos
                                </h4>
                                <div className="grid grid-cols-2 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-100">
                                    <div className="space-y-1">
                                        <label className="block text-[10px] font-black text-indigo-500 uppercase">H.I. Anestesia</label>
                                        <input type="time" value={hia} onChange={e => { setHia(e.target.value); setIsDirty(true); }} disabled={isReadOnly} className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm font-mono font-bold text-slate-900 disabled:opacity-75" />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="block text-[10px] font-black text-indigo-500 uppercase">H.F. Anestesia</label>
                                        <input type="time" value={hfa} onChange={e => { setHfa(e.target.value); setIsDirty(true); }} disabled={isReadOnly} className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm font-mono font-bold text-slate-900 disabled:opacity-75" />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="block text-[10px] font-black text-emerald-500 uppercase">H.C. Cirugía</label>
                                        <input type="time" value={hcc} onChange={e => { setHcc(e.target.value); setIsDirty(true); }} disabled={isReadOnly} className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm font-mono font-bold text-slate-900 disabled:opacity-75" />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="block text-[10px] font-black text-emerald-500 uppercase">H.F. Cirugía</label>
                                        <input type="time" value={hfc} onChange={e => { setHfc(e.target.value); setIsDirty(true); }} disabled={isReadOnly} className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm font-mono font-bold text-slate-900 disabled:opacity-75" />
                                    </div>
                                </div>
                            </div>
                            <div className="space-y-4">
                                <h4 className="flex items-center gap-2 text-xs font-black text-slate-400 uppercase tracking-[0.2em]">
                                    <span className="material-symbols-outlined text-sm">biotech</span> Muestras & Cultivos
                                </h4>
                                <div className="space-y-3 bg-slate-50 p-4 rounded-xl border border-slate-100">
                                    <div className="space-y-1">
                                        <label className="block text-[10px] font-bold text-slate-500 uppercase">Anatomía Patológica</label>
                                        <input value={anatomiaPatologica} onChange={e => { setAnatomiaPatologica(e.target.value); setIsDirty(true); }} disabled={isReadOnly} className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm font-bold text-slate-900 disabled:opacity-75" placeholder="¿Se envió muestra? Detalle..." />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="block text-[10px] font-bold text-slate-500 uppercase">Cultivo</label>
                                        <input value={cultivo} onChange={e => { setCultivo(e.target.value); setIsDirty(true); }} disabled={isReadOnly} className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm font-bold text-slate-900 disabled:opacity-75" placeholder="¿Se envió cultivo? Detalle..." />
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Section: Items / Medications */}
                        <div>
                            <h4 className="flex items-center gap-2 text-xs font-black text-slate-400 uppercase tracking-[0.2em] mb-4">
                                <span className="material-symbols-outlined text-sm">inventory_2</span> Registro de Insumos & Medicación
                                {isReadOnly && <span className="ml-auto text-amber-600 bg-amber-50 px-2 py-0.5 rounded font-black text-[10px] normal-case">VISTA DE SOLO LECTURA</span>}
                            </h4>

                            {/* Selector Row */}
                            <div className={`bg-slate-50 p-4 rounded-xl border border-slate-200 flex flex-wrap gap-4 items-end print:hidden ${isReadOnly ? 'hidden' : ''}`}>
                                <div className="flex-1 min-w-[200px]">
                                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Elemento / Medicamento <span className="text-[8px] text-slate-300 ml-1 font-normal">({catalogItems.length} disp.)</span></label>
                                    <div className="relative z-[60]">
                                        <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">search</span>
                                        <input
                                            type="text"
                                            className="w-full pl-9 pr-3 py-2 bg-white border border-slate-300 rounded-lg text-sm font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none placeholder:text-slate-400"
                                            placeholder="Buscar en vademécum..."
                                            value={newItem.name}
                                            onChange={e => setNewItem({ ...newItem, name: e.target.value })}
                                            onFocus={() => setShowSuggestions(true)}
                                            onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                                        />
                                        {showSuggestions && filteredCatalog.length > 0 && (
                                            <div className="absolute z-[70] w-full bg-slate-800 border border-slate-600 max-h-60 overflow-y-auto rounded shadow-lg mt-1">
                                                {filteredCatalog.map((item, idx) => (
                                                    <div
                                                        key={idx}
                                                        className="px-3 py-2 hover:bg-slate-700 cursor-pointer text-sm text-slate-200 flex justify-between items-center bg-slate-800"
                                                        onMouseDown={(e) => {
                                                            e.preventDefault(); // Prevent blur
                                                            // Auto-detect type based on catalog category
                                                            const detectedType = item.category === 'anesthesia' ? 'anesthesia' : 'surgery';
                                                            setNewItem({ ...newItem, name: item.name, type: detectedType });
                                                            setShowSuggestions(false);
                                                        }}
                                                    >
                                                        <span>{item.name}</span>
                                                        <span className={`text-[10px] font-bold uppercase tracking-wider ml-2 px-1.5 py-0.5 rounded ${item.category === 'anesthesia' ? 'bg-indigo-900 text-indigo-200' : 'bg-emerald-900 text-emerald-200'}`}>
                                                            {item.category === 'anesthesia' ? 'ANES' : 'CIR'}
                                                        </span>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>
                                <div className="w-24">
                                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Cant.</label>
                                    <input
                                        type="number"
                                        min="1"
                                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none"
                                        value={newItem.quantity}
                                        onChange={e => setNewItem({ ...newItem, quantity: parseInt(e.target.value) || 1 })}
                                        onFocus={(e) => e.target.select()}
                                    />
                                </div>
                                <div className="w-28">
                                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Unidad</label>
                                    <select
                                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none"
                                        value={newItem.unit}
                                        onChange={e => setNewItem({ ...newItem, unit: e.target.value })}
                                    >
                                        {unitOptions.map(u => <option key={u} value={u} className="text-slate-900">{u}</option>)}
                                    </select>
                                </div>
                                <div className="w-32">
                                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Tipo</label>
                                    <div className="flex rounded-lg overflow-hidden border border-slate-300">
                                        <button
                                            onClick={() => setNewItem({ ...newItem, type: 'anesthesia' })}
                                            className={`flex-1 text-[9px] font-black uppercase py-2 transition-colors ${newItem.type === 'anesthesia' ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:text-indigo-600'}`}
                                        >Anes.</button>
                                        <button
                                            onClick={() => setNewItem({ ...newItem, type: 'surgery' })}
                                            className={`flex-1 text-[9px] font-black uppercase py-2 transition-colors ${newItem.type === 'surgery' ? 'bg-emerald-600 text-white' : 'text-slate-500 hover:text-emerald-600'}`}
                                        >Cir.</button>
                                    </div>
                                </div>
                                <button
                                    onClick={handleAddItem}
                                    className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2.5 rounded-lg font-black uppercase text-[10px] tracking-widest shadow-lg shadow-indigo-900/20 transition-all flex items-center gap-2 h-10"
                                >
                                    <span className="material-symbols-outlined text-sm">add</span>
                                    Agregar
                                </button>
                            </div>

                            {/* List Grid */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 print:grid print:grid-cols-2">
                                {/* Anesthesia Column */}
                                <div className="border border-slate-100 rounded-xl overflow-hidden shadow-sm">
                                    <div className="bg-indigo-50 px-4 py-2 border-b border-indigo-100 flex justify-between items-center">
                                        <span className="text-[10px] font-black text-indigo-700 uppercase tracking-widest">Anestesia</span>
                                        <span className="text-[10px] font-bold bg-indigo-200 text-indigo-800 px-2 py-0.5 rounded-full">
                                            {items.filter(i => i.type === 'anesthesia').length} ítems
                                        </span>
                                    </div>
                                    <div className="p-2 space-y-1 min-h-[100px]">
                                        {items.filter(i => i.type === 'anesthesia').map(item => (
                                            <div key={item.id} className="flex items-center justify-between p-2 rounded bg-slate-50 border border-slate-200 group">
                                                {editingItemId === item.id ? (
                                                    <div className="flex items-center gap-2 w-full">
                                                        <span className="text-xs font-bold text-slate-700 truncate flex-1">{item.name}</span>
                                                        <input
                                                            type="number"
                                                            value={tempQuantity}
                                                            onChange={(e) => setTempQuantity(parseInt(e.target.value) || 0)}
                                                            onFocus={(e) => e.target.select()}
                                                            className="w-16 px-1 py-0.5 border border-indigo-300 rounded text-xs font-bold focus:ring-1 focus:ring-indigo-500 outline-none"
                                                            autoFocus
                                                        />
                                                        <button onClick={() => handleSaveEdit(item.id!)} className="text-emerald-600 hover:text-emerald-700">
                                                            <span className="material-symbols-outlined text-sm">check</span>
                                                        </button>
                                                        <button onClick={handleCancelEdit} className="text-slate-400 hover:text-slate-600">
                                                            <span className="material-symbols-outlined text-sm">close</span>
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <>
                                                        <span className="text-xs font-bold text-slate-700">{item.name} <span className="text-slate-400 font-normal">({item.quantity} {item.unit})</span></span>
                                                        {!isReadOnly && (
                                                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all print:hidden">
                                                                <button onClick={() => handleStartEdit(item)} className="text-slate-300 hover:text-indigo-500 p-1">
                                                                    <span className="material-symbols-outlined text-sm">edit</span>
                                                                </button>
                                                                <button onClick={() => removeItem(item.id!)} className="text-slate-300 hover:text-red-500 p-1">
                                                                    <span className="material-symbols-outlined text-sm">delete</span>
                                                                </button>
                                                            </div>
                                                        )}
                                                    </>
                                                )}
                                            </div>
                                        ))}
                                        {items.filter(i => i.type === 'anesthesia').length === 0 && <p className="text-[10px] text-slate-400 italic p-4 text-center">No hay registros</p>}
                                    </div>
                                </div>

                                {/* Surgery Column */}
                                <div className="border border-slate-100 rounded-xl overflow-hidden shadow-sm">
                                    <div className="bg-emerald-50 px-4 py-2 border-b border-emerald-100 flex justify-between items-center">
                                        <span className="text-[10px] font-black text-emerald-700 uppercase tracking-widest">Cirugía</span>
                                        <span className="text-[10px] font-bold bg-emerald-200 text-emerald-800 px-2 py-0.5 rounded-full">
                                            {items.filter(i => i.type === 'surgery').length} ítems
                                        </span>
                                    </div>
                                    <div className="p-2 space-y-1 min-h-[100px]">
                                        {items.filter(i => i.type === 'surgery').map(item => (
                                            <div key={item.id} className="flex items-center justify-between p-2 rounded bg-slate-50 border border-slate-200 group">
                                                {editingItemId === item.id ? (
                                                    <div className="flex items-center gap-2 w-full">
                                                        <span className="text-xs font-bold text-slate-700 truncate flex-1">{item.name}</span>
                                                        <input
                                                            type="number"
                                                            value={tempQuantity}
                                                            onChange={(e) => setTempQuantity(parseInt(e.target.value) || 0)}
                                                            onFocus={(e) => e.target.select()}
                                                            className="w-16 px-1 py-0.5 border border-emerald-300 rounded text-xs font-bold focus:ring-1 focus:ring-emerald-500 outline-none"
                                                            autoFocus
                                                        />
                                                        <button onClick={() => handleSaveEdit(item.id!)} className="text-emerald-600 hover:text-emerald-700">
                                                            <span className="material-symbols-outlined text-sm">check</span>
                                                        </button>
                                                        <button onClick={handleCancelEdit} className="text-slate-400 hover:text-slate-600">
                                                            <span className="material-symbols-outlined text-sm">close</span>
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <>
                                                        <span className="text-xs font-bold text-slate-700">{item.name} <span className="text-slate-400 font-normal">({item.quantity} {item.unit})</span></span>
                                                        {!isReadOnly && (
                                                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all print:hidden">
                                                                <button onClick={() => handleStartEdit(item)} className="text-slate-300 hover:text-indigo-500 p-1">
                                                                    <span className="material-symbols-outlined text-sm">edit</span>
                                                                </button>
                                                                <button onClick={() => removeItem(item.id!)} className="text-slate-300 hover:text-red-500 p-1">
                                                                    <span className="material-symbols-outlined text-sm">delete</span>
                                                                </button>
                                                            </div>
                                                        )}
                                                    </>
                                                )}
                                            </div>
                                        ))}
                                        {items.filter(i => i.type === 'surgery').length === 0 && <p className="text-[10px] text-slate-400 italic p-4 text-center">No hay registros</p>}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>


                    {/* Footer Buttons */}
                    <div className="p-6 border-t border-slate-200 flex justify-end gap-3 bg-slate-50 print:hidden">
                        <button
                            onClick={handleInternalClose}
                            className="px-6 py-2 text-sm font-bold text-slate-600 hover:text-slate-800 transition-all print:hidden"
                        >Cancelar</button>
                        <button
                            onClick={handlePrint}
                            className="px-6 py-2 bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 rounded-lg font-bold text-sm shadow-sm flex items-center gap-2 print:hidden"
                        >
                            <span className="material-symbols-outlined text-lg">print</span>
                            Imprimir
                        </button>
                        {!isReadOnly && (
                            <button
                                onClick={() => handleSave(true)}
                                disabled={loading}
                                className="px-8 py-2 bg-slate-900 hover:bg-black text-white rounded-lg font-black uppercase text-sm shadow-xl shadow-slate-900/20 disabled:opacity-50 flex items-center gap-2 print:hidden"
                            >
                                {loading && <span className="material-symbols-outlined animate-spin text-sm">progress_activity</span>}
                                Guardar Ficha
                            </button>
                        )}
                    </div>
                </div>
            </div>

            <style dangerouslySetInnerHTML={{
                __html: `
                @media print {
                    @page {
                        size: A4 portrait;
                        margin: 10mm;
                    }
                    /* Complete Reset for Print */
                    body, html {
                        background: white !important;
                        height: auto !important;
                        min-height: auto !important;
                        overflow: visible !important;
                    }
                    /* Container styles */
                    .print-container {
                        visibility: visible !important;
                        opacity: 1 !important;
                        display: block !important;
                        position: relative !important;
                        width: 100% !important;
                        max-width: none !important;
                        box-shadow: none !important;
                        border: none !important;
                        padding: 0 !important;
                        margin: 0 !important;
                    }
                    .print\\:hidden {
                        display: none !important;
                    }
                    /* Ensure headers print correctly */
                    h1, h2, h3, h4, p, span {
                        -webkit-print-color-adjust: exact !important;
                        print-color-adjust: exact !important;
                    }
                    /* Grid support for print */
                    .print\\:grid {
                        display: grid !important;
                    }
                    .print\\:grid-cols-2 {
                        grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
                    }
                    /* Input styling for print */
                    input, select {
                        border: none !important;
                        background: transparent !important;
                        padding: 0 !important;
                        appearance: none;
                        font-weight: bold;
                        color: #0f172a !important; /* slate-900 */
                    }
                    /* Typography Refinement */
                    p, div, span, td, th {
                        font-family: 'Inter', -apple-system, sans-serif !important;
                    }

                    /* Multi-page optimization */
                    .avoid-break {
                        page-break-inside: avoid !important;
                        break-inside: avoid !important;
                    }

                    @page {
                        counter-increment: page;
                    }

                    .page-number:after {
                        content: counter(page);
                    }

                    body {
                        counter-reset: page;
                    }
                }
            `
            }} />
        </>
    );
};

export default SurgeryForm;
