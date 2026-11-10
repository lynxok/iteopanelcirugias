import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../src/lib/supabase';
import { MonitorCase } from '../pages/Monitor';
import { CatalogItem } from '../types';
import { useAuth } from '../src/lib/AuthContext';
import { PDFDownloadLink } from '@react-pdf/renderer';
import { SurgeryPDF } from './SurgeryPDF';
import SignaturePad from 'react-signature-canvas';
import { useRef } from 'react';
import { ObsRecordingSection } from './surgery-detail/ObsRecordingSection';
import { triggerGlobalappSync } from '../src/lib/globalappSync';


interface SurgeryFormProps {
    surgery: MonitorCase;
    onClose: () => void;
    onSave: () => void;
    onMinimize?: () => void;
    readOnly?: boolean;
    operatingRoomId?: string;
}

interface FormItem {
    id?: string;
    type: 'anesthesia' | 'surgery';
    name: string;
    unit: string;
    quantity: number;
    descontar_stock?: boolean;
    stock_descontado?: boolean;
    catalog_item_id?: string | null;
}

const SurgeryForm: React.FC<SurgeryFormProps> = ({ surgery, onClose, onSave, onMinimize, readOnly, operatingRoomId }) => {
    const [loading, setLoading] = useState(false);
    const [isLoaded, setIsLoaded] = useState(false);
    const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);
    const [formId, setFormId] = useState<string | null>(null);

    const [isDirty, setIsDirty] = useState(false);
    const [showSuccess, setShowSuccess] = useState(false);
    const [syncingGlobalapp, setSyncingGlobalapp] = useState(false);
    const [globalappStatusMsg, setGlobalappStatusMsg] = useState<string | null>(null);
    const { user } = useAuth();
    const isReadOnly = readOnly || (() => {
        if (user?.role === 'SuperAdmin' || user?.canFillForms) return false;

        const allowedRoles = ['Medico', 'Anestesista', 'Instrumentadora', 'Quirofano', 'JefaturaDeQuirofano', 'Tecnico', 'Internacion'];
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
    const [arcoEnC, setArcoEnC] = useState(false);
    const [arcoEnCSynced, setArcoEnCSynced] = useState(false);
    const [arcoEnCSyncTimer, setArcoEnCSyncTimer] = useState<number | null>(null);
    const [arcoEnCStatusMsg, setArcoEnCStatusMsg] = useState<string | null>(null);
    const arcoEnCTimerRef = useRef<NodeJS.Timeout | null>(null);
    const arcoEnCIntervalRef = useRef<NodeJS.Timeout | null>(null);
    const [patientMetadata, setPatientMetadata] = useState<any>(null);
    const [surgeryMetadata, setSurgeryMetadata] = useState<any>(null);
    const [procedimientoEfectuado, setProcedimientoEfectuado] = useState('');
    const [recommendedDuration, setRecommendedDuration] = useState<number | null>(null);
    const [signature, setSignature] = useState<string | null>(null);
    const [surgeonSignature, setSurgeonSignature] = useState<string | null>(null);
    const [signatureTarget, setSignatureTarget] = useState<'anesthesiologist' | 'surgeon'>('anesthesiologist');
    const sigPad = useRef<SignaturePad>(null);
    const [showPinModal, setShowPinModal] = useState(false);
    const [pinInput, setPinInput] = useState('');
    const [isVerifyingPin, setIsVerifyingPin] = useState(false);

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

    // Manejo de Checkbox de Arco en C con disparo programado a 5s o al guardar (Alta y Reversión)
    const handleToggleArcoEnC = (checked: boolean) => {
        if (isReadOnly) return;
        setArcoEnC(checked);
        setIsDirty(true);

        // Cancelar temporizadores previos activos
        if (arcoEnCTimerRef.current) {
            clearTimeout(arcoEnCTimerRef.current);
            arcoEnCTimerRef.current = null;
        }
        if (arcoEnCIntervalRef.current) {
            clearInterval(arcoEnCIntervalRef.current);
            arcoEnCIntervalRef.current = null;
        }

        // CASO 1: SE DESTILDA
        if (!checked) {
            // Si nunca se había sincronizado con GlobalApp, cancelar cuenta regresiva y limpiar
            if (!arcoEnCSynced) {
                setArcoEnCSyncTimer(null);
                setArcoEnCStatusMsg(null);
                return;
            }

            // Si YA estaba sincronizado con GlobalApp, iniciar cuenta regresiva de 5s para ELIMINAR en GlobalApp
            let remaining = 5;
            setArcoEnCSyncTimer(remaining);
            setArcoEnCStatusMsg(`Eliminando de GlobalApp en ${remaining}s...`);

            arcoEnCIntervalRef.current = setInterval(() => {
                remaining -= 1;
                if (remaining > 0) {
                    setArcoEnCSyncTimer(remaining);
                    setArcoEnCStatusMsg(`Eliminando de GlobalApp en ${remaining}s...`);
                } else {
                    if (arcoEnCIntervalRef.current) clearInterval(arcoEnCIntervalRef.current);
                    setArcoEnCSyncTimer(null);
                }
            }, 1000);

            arcoEnCTimerRef.current = setTimeout(async () => {
                if (arcoEnCIntervalRef.current) clearInterval(arcoEnCIntervalRef.current);
                setArcoEnCSyncTimer(null);
                setArcoEnCStatusMsg('Eliminando en GlobalApp...');

                try {
                    await supabase
                        .from('surgery_forms')
                        .upsert({
                            surgery_id: surgery.id,
                            arco_en_c: false,
                            updated_at: new Date().toISOString()
                        }, { onConflict: 'surgery_id' });

                    const res = await triggerGlobalappSync(surgery.id, 'arco_en_c_revert');
                    if (res?.success) {
                        setArcoEnCSynced(false);
                        setArcoEnCStatusMsg('Arco en C eliminado de GlobalApp');
                        await supabase
                            .from('surgery_forms')
                            .upsert({
                                surgery_id: surgery.id,
                                arco_en_c: false,
                                arco_en_c_synced: false,
                                updated_at: new Date().toISOString()
                            }, { onConflict: 'surgery_id' });
                        setTimeout(() => setArcoEnCStatusMsg(null), 4000);
                    } else {
                        setArcoEnCStatusMsg(res?.error || 'Aviso al revertir en GlobalApp');
                    }
                } catch (err: any) {
                    console.error('[ArcoEnC] Error al revertir:', err);
                    setArcoEnCStatusMsg('Error al conectar con GlobalApp');
                }
            }, 5000);
            return;
        }

        // CASO 2: SE TILDA
        // Si ya fue sincronizado previamente en GlobalApp, no volver a disparar para evitar duplicados
        if (arcoEnCSynced) {
            setArcoEnCSyncTimer(null);
            setArcoEnCStatusMsg('Ya cargado en GlobalApp');
            return;
        }

        // Iniciar cuenta regresiva de 5 segundos para cargar en GlobalApp
        let remaining = 5;
        setArcoEnCSyncTimer(remaining);
        setArcoEnCStatusMsg(`Sincronizando con GlobalApp en ${remaining}s...`);

        arcoEnCIntervalRef.current = setInterval(() => {
            remaining -= 1;
            if (remaining > 0) {
                setArcoEnCSyncTimer(remaining);
                setArcoEnCStatusMsg(`Sincronizando con GlobalApp en ${remaining}s...`);
            } else {
                if (arcoEnCIntervalRef.current) clearInterval(arcoEnCIntervalRef.current);
                setArcoEnCSyncTimer(null);
            }
        }, 1000);

        arcoEnCTimerRef.current = setTimeout(async () => {
            if (arcoEnCIntervalRef.current) clearInterval(arcoEnCIntervalRef.current);
            setArcoEnCSyncTimer(null);
            setArcoEnCStatusMsg('Cargando en GlobalApp (con PAC)...');

            try {
                // Persistir estado en la base de datos de inmediato con upsert
                const formUpsert: any = {
                    surgery_id: surgery.id,
                    arco_en_c: true,
                    updated_at: new Date().toISOString()
                };
                if (hcc) formUpsert.cirugia_inicio = hcc;
                if (hfc) formUpsert.cirugia_fin = hfc;

                await supabase
                    .from('surgery_forms')
                    .upsert(formUpsert, { onConflict: 'surgery_id' });

                const overrides: any = {};
                if (hcc) overrides.startTime = hcc;
                if (hfc) overrides.endTime = hfc;

                const res = await triggerGlobalappSync(surgery.id, 'arco_en_c_only', false, overrides);
                if (res?.success) {
                    if (res.delegated) {
                        setArcoEnCStatusMsg('Enviado a PC Quirófano...');
                    } else {
                        setArcoEnCSynced(true);
                        setArcoEnCStatusMsg('Cargado en GlobalApp (PAC)');
                        await supabase
                            .from('surgery_forms')
                            .upsert({
                                surgery_id: surgery.id,
                                arco_en_c: true,
                                arco_en_c_synced: true,
                                updated_at: new Date().toISOString()
                            }, { onConflict: 'surgery_id' });
                        setTimeout(() => setArcoEnCStatusMsg(null), 4000);
                    }
                } else {
                    const errMsg = res?.error || (res as any)?.warning || 'No se pudo sincronizar la práctica en GlobalApp.';
                    setArcoEnC(false);
                    setArcoEnCSynced(false);
                    setArcoEnCStatusMsg('No cargado en GlobalApp');
                    await supabase
                        .from('surgery_forms')
                        .upsert({
                            surgery_id: surgery.id,
                            arco_en_c: false,
                            arco_en_c_synced: false,
                            updated_at: new Date().toISOString()
                        }, { onConflict: 'surgery_id' });
                    alert(`⚠️ GlobalApp - Arco en C:\n\n${errMsg}\n\nEl tilde de Arco en C ha sido cancelado.`);
                }
            } catch (err: any) {
                console.error('[ArcoEnC] Error al sincronizar:', err);
                const errMsg = err?.message || 'Error de conexión con GlobalApp';
                setArcoEnC(false);
                setArcoEnCSynced(false);
                setArcoEnCStatusMsg('Error de conexión');
                await supabase
                    .from('surgery_forms')
                    .upsert({
                        surgery_id: surgery.id,
                        arco_en_c: false,
                        arco_en_c_synced: false,
                        updated_at: new Date().toISOString()
                    }, { onConflict: 'surgery_id' });
                alert(`⚠️ GlobalApp - Arco en C:\n\n${errMsg}\n\nEl tilde de Arco en C ha sido cancelado.`);
            }
        }, 5000);
    };

    useEffect(() => {
        return () => {
            if (arcoEnCTimerRef.current) clearTimeout(arcoEnCTimerRef.current);
            if (arcoEnCIntervalRef.current) clearInterval(arcoEnCIntervalRef.current);
        };
    }, []);

    // Escuchar respuestas de sincronización de Globalapp emitidas por la PC de Quirófano (para Tablets/Web)
    useEffect(() => {
        const channel = supabase.channel(`globalapp-sync-listener-${surgery.id}-${Math.random()}`);
        channel
            .on('broadcast', { event: 'GLOBALAPP_SYNC_RESULT' }, (msg: any) => {
                const { surgeryId, action, result } = msg?.payload || {};
                if (surgeryId !== surgery.id) return;

                if (action === 'arco_en_c_only') {
                    if (result?.success) {
                        setArcoEnCSynced(true);
                        setArcoEnCStatusMsg('Cargado en GlobalApp (PAC)');
                        setTimeout(() => setArcoEnCStatusMsg(null), 4000);
                    } else {
                        const errMsg = result?.error || result?.warning || 'No se pudo sincronizar la práctica en GlobalApp.';
                        setArcoEnC(false);
                        setArcoEnCSynced(false);
                        setArcoEnCStatusMsg('No cargado en GlobalApp');
                        alert(`⚠️ GlobalApp (PC Quirófano) - Arco en C:\n\n${errMsg}\n\nEl tilde de Arco en C ha sido cancelado.`);
                    }
                } else if (action === 'arco_en_c_revert') {
                    if (result?.success) {
                        setArcoEnCSynced(false);
                        setArcoEnCStatusMsg('Arco en C eliminado de GlobalApp');
                        setTimeout(() => setArcoEnCStatusMsg(null), 4000);
                    } else {
                        setArcoEnCStatusMsg(result?.error || 'Aviso al revertir en GlobalApp');
                    }
                }
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [surgery.id]);

    // Items States
    const [items, setItems] = useState<FormItem[]>([]);
    const originalItemsRef = useRef<FormItem[]>([]);
    const [newItem, setNewItem] = useState<{ name: string, unit: string, quantity: number, type: 'anesthesia' | 'surgery' }>({
        name: '', unit: 'unidad', quantity: 1, type: 'anesthesia'
    });
    const [catalogItems, setCatalogItems] = useState<CatalogItem[]>([]);
    const [filteredCatalog, setFilteredCatalog] = useState<CatalogItem[]>([]);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [stockConsumptionEnabled, setStockConsumptionEnabled] = useState<boolean>(false);
    const [unlistedWarningItem, setUnlistedWarningItem] = useState<{ name: string, unit: string, quantity: number, type: 'anesthesia' | 'surgery' } | null>(null);

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
                    }).filter(d => d > 0 && d < 600);

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
        fetchGlobalSettings();
    }, [surgery.id]);

    const fetchGlobalSettings = async () => {
        try {
            const { data } = await supabase
                .from('admin_settings')
                .select('key, value')
                .eq('key', 'stock_consumption_enabled')
                .maybeSingle();
            if (data) {
                setStockConsumptionEnabled(data.value === 'true');
            }
        } catch (err) {
            console.error('Error fetching stock consumption setting:', err);
        }
    };

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
                // Priority: Saved form time > Database surgeries table > Monitor prop
                const dbHcc = sx ? formatTimeHHmm(sx.actual_start_time) : '';
                const dbHfc = sx ? formatTimeHHmm(sx.actual_end_time) : '';
                
                setHcc(formatTimeHHmm(form.cirugia_inicio) || dbHcc || formatTimeHHmm(surgery.actualStartTime));
                setHfc(formatTimeHHmm(form.cirugia_fin) || dbHfc || formatTimeHHmm(surgery.actualEndTime));
                setAnatomiaPatologica(form.anatomia_patologica || '');
                setCultivo(form.cultivo || '');
                setArcoEnC(Boolean(form.arco_en_c));
                setArcoEnCSynced(Boolean(form.arco_en_c_synced));
                setProcedimientoEfectuado(form.procedimiento_efectuado || '');
                setSignature(form.anesthesiologist_signature || null);
                setSurgeonSignature(form.surgeon_signature || null);
                const loadedItems = (form.surgery_form_items || []).map((it: any) => ({
                    ...it,
                    descontar_stock: it.descontar_stock !== false,
                    stock_descontado: it.stock_descontado === true
                }));
                setItems(loadedItems);
                originalItemsRef.current = JSON.parse(JSON.stringify(loadedItems));
            }
            setIsLoaded(true);
        } catch (err) {
            console.error('Error fetching form:', err);
            alert('Error al cargar la ficha técnica. Por favor, cierre y vuelva a intentar.');
        } finally {
            setLoading(false);
        }
    };


    const executeAddItem = (itemToAdd: { name: string, unit: string, quantity: number, type: 'anesthesia' | 'surgery' }) => {
        const matchedCatalog = catalogItems.find(c => c.name.toLowerCase() === itemToAdd.name.toLowerCase());

        const item: FormItem = {
            id: `temp-${Date.now()}`,
            ...itemToAdd,
            descontar_stock: true,
            stock_descontado: false,
            catalog_item_id: matchedCatalog ? matchedCatalog.id : null
        };

        setItems([...items, item]);
        setNewItem({ ...newItem, name: '', quantity: 1 });
        setIsDirty(true);
        setUnlistedWarningItem(null);
    };

    const handleAddItem = () => {
        if (!newItem.name || newItem.quantity <= 0) return;

        const trimmedName = newItem.name.trim();
        const matchedCatalog = catalogItems.find(c => c.name.toLowerCase() === trimmedName.toLowerCase());

        // Si no coincide exactamente con ningún elemento del catálogo, advertir al usuario
        if (!matchedCatalog) {
            setUnlistedWarningItem({ ...newItem, name: trimmedName });
            return;
        }

        executeAddItem({ ...newItem, name: matchedCatalog.name });
    };

    const toggleItemDescontar = (id: string) => {
        setItems(items.map(i => i.id === id ? { ...i, descontar_stock: i.descontar_stock !== false ? false : true } : i));
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

    const handleApplySignature = async () => {
        if (pinInput.length < 4) return;
        
        // Role check before verification
        const isAnestesista = user?.role === 'Anestesista';
        const isMedico = user?.role === 'Medico' || user?.role === 'Residente';
        const isSuperAdmin = user?.role === 'SuperAdmin';

        if (!isSuperAdmin) {
            if (signatureTarget === 'anesthesiologist' && !isAnestesista && !(isMedico && user?.specialty === 'Anestesiología')) {
                alert('Solo los médicos anestesistas pueden firmar esta sección.');
                setPinInput('');
                setShowPinModal(false);
                return;
            }
            if (signatureTarget === 'surgeon' && !isMedico) {
                alert('Solo los médicos cirujanos pueden firmar esta sección.');
                setPinInput('');
                setShowPinModal(false);
                return;
            }
        }

        setIsVerifyingPin(true);
        try {
            const { data, error } = await supabase
                .from('users')
                .select('saved_signature, signature_pin')
                .eq('id', user?.id)
                .single();
            
            if (error) throw error;
            
            if (data.signature_pin === pinInput) {
                if (data.saved_signature) {
                    if (signatureTarget === 'anesthesiologist') {
                        setSignature(data.saved_signature);
                    } else {
                        setSurgeonSignature(data.saved_signature);
                    }
                    setIsDirty(true);
                    setShowPinModal(false);
                    setPinInput('');
                } else {
                    alert('No tienes una firma guardada. Por favor, configúrala en el menú de Configuración.');
                }
            } else {
                alert('PIN incorrecto. Intente nuevamente.');
                setPinInput('');
            }
        } catch (error: any) {
            console.error('Error verifying PIN:', error);
            alert('Error de validación: ' + error.message);
        } finally {
            setIsVerifyingPin(false);
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

            let finalHfc = tHfc;
            const minHfc = timeToMinutes(tHfc);
            const minHfa = timeToMinutes(tHfa);

            // Rule: If anesthesia end time is later than surgery end time (or surgery end time is empty), surgery end time takes anesthesia end time
            if (minHfa !== null && (minHfc === null || minHfa > minHfc)) {
                finalHfc = tHfa;
                setHfc(tHfa);
            }

            const tHfcEffective = finalHfc;
            const minHcc = timeToMinutes(tHcc);
            const minHfcEffective = timeToMinutes(tHfcEffective);

            // Validations
            if (minHcc !== null && minHfcEffective !== null && minHcc > minHfcEffective) {
                alert("Error: La Hora de Inicio de Cirugía no puede ser posterior a la Hora de Fin de Cirugía.");
                return;
            }

            setLoading(true);

            // Cancelar cualquier cuenta regresiva pendiente de Arco en C para evitar carreras
            if (arcoEnCTimerRef.current) {
                clearTimeout(arcoEnCTimerRef.current);
                arcoEnCTimerRef.current = null;
            }
            if (arcoEnCIntervalRef.current) {
                clearInterval(arcoEnCIntervalRef.current);
                arcoEnCIntervalRef.current = null;
            }
            setArcoEnCSyncTimer(null);

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
            
            const timeChanges = [];
            if (tHcc !== origHcc) timeChanges.push(`Inicio: ${origHcc} -> ${tHcc}`);
            if (tHfc !== origHfc) timeChanges.push(`Fin: ${origHfc} -> ${tHfc}`);
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
                cirugia_fin: tHfcEffective || null,
                anatomia_patologica: anatomiaPatologica,
                cultivo: cultivo,
                arco_en_c: arcoEnC,
                arco_en_c_synced: arcoEnCSynced,
                procedimiento_efectuado: procedimientoEfectuado,
                anesthesiologist_signature: signature,
                surgeon_signature: surgeonSignature,
                signature_date: signature ? new Date().toISOString() : null,
                surgeon_signature_date: surgeonSignature ? new Date().toISOString() : null,
                updated_at: new Date().toISOString()
            };

            // Sync times, anesthesiologist and auto-completion to the surgeries table
            const surgeryUpdates: any = {};
            if (tHcc) surgeryUpdates.actual_start_time = tHcc.length === 5 ? `${tHcc}:00` : tHcc;
            if (tHfcEffective) {
                surgeryUpdates.actual_end_time = tHfcEffective.length === 5 ? `${tHfcEffective}:00` : tHfcEffective;
                // Si la ficha técnica tiene hora de finalización y la cirugía no está cancelada o suspendida, se da por realizada (completed)
                const currentDbStatus = surgeryMetadata?.status || (surgery as any).status;
                if (currentDbStatus !== 'completed' && currentDbStatus !== 'cancelled' && currentDbStatus !== 'suspended') {
                    surgeryUpdates.status = 'completed';
                }
            }

            if (anesthesiologistId !== surgery.anesthesiologistId) {
                surgeryUpdates.anesthesiologist_id = anesthesiologistId || null;
            }

            if (Object.keys(surgeryUpdates).length > 0) {
                const { error: sxError } = await supabase
                    .from('surgeries')
                    .update(surgeryUpdates)
                    .eq('id', surgery.id);
                if (sxError) throw sxError;

                const currentDbStatus = surgeryMetadata?.status || (surgery as any).status;
                if (surgeryUpdates.status === 'completed' && currentDbStatus !== 'completed') {
                    await supabase.from('audit_logs').insert({
                        user_name: user?.name,
                        user_role: user?.role,
                        action: 'UPDATE',
                        resource: 'surgeries',
                        resource_id: surgery.id,
                        description: `Cirugía finalizada automáticamente al registrar hora de fin (${tHfcEffective}) en la ficha técnica.`,
                        meta: { old_status: currentDbStatus, new_status: 'completed', actual_end_time: surgeryUpdates.actual_end_time }
                    });
                }

                if (anesthesiologistId !== surgery.anesthesiologistId) {
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
            }

            let currentFormId = formId;

            // Use upsert to handle potential race conditions and ensure only one form per surgery
            const { data: upsertData, error: upsertError } = await supabase
                .from('surgery_forms')
                .upsert(formData, { onConflict: 'surgery_id' })
                .select('id')
                .single();

            if (upsertError) throw upsertError;
            currentFormId = upsertData.id;

            if (currentFormId) {
                // Stock Deduction & Reversion Logic (Only executes when global stock consumption is enabled)
                const prevItems = originalItemsRef.current || [];
                
                // 1. Revert stock for items previously deducted that are now removed, un-ticked, or decreased
                if (stockConsumptionEnabled) {
                    for (const oldItem of prevItems) {
                        if (oldItem.stock_descontado && oldItem.catalog_item_id) {
                            const currentMatch = items.find(i => 
                                (i.id && i.id === oldItem.id) || 
                                (i.catalog_item_id === oldItem.catalog_item_id && i.name.toLowerCase() === oldItem.name.toLowerCase())
                            );

                            // If removed or unticked: return all units
                            if (!currentMatch || currentMatch.descontar_stock === false) {
                                const { data: cat } = await supabase
                                    .from('catalog_items')
                                    .select('stock_actual')
                                    .eq('id', oldItem.catalog_item_id)
                                    .single();
                                
                                const prevStock = Number(cat?.stock_actual || 0);
                                const newStock = prevStock + Number(oldItem.quantity || 0);
                                
                                await supabase.from('catalog_items').update({ stock_actual: newStock }).eq('id', oldItem.catalog_item_id);
                                await supabase.from('stock_movements').insert({
                                    catalog_item_id: oldItem.catalog_item_id,
                                    movement_type: 'REINTEGRO_CIRUGIA',
                                    quantity: Number(oldItem.quantity || 0),
                                    previous_stock: prevStock,
                                    new_stock: newStock,
                                    surgery_id: surgery.id,
                                    reason: 'Reversión / Destilde de consumo en ficha de cirugía',
                                    patient_name: surgery.patientName || surgeryMetadata?.patient?.name || 'Cirugía',
                                    created_by: user?.name || 'Técnico'
                                });
                            }
                        }
                    }
                }

                // 2. Process items to deduct new or updated stock
                const processedItems = [];
                for (const item of items) {
                    let isDeducted = item.stock_descontado === true;

                    // Only deduct if global flag is ON
                    if (stockConsumptionEnabled && item.descontar_stock !== false && !isDeducted && item.catalog_item_id) {
                        const { data: cat } = await supabase
                            .from('catalog_items')
                            .select('stock_actual')
                            .eq('id', item.catalog_item_id)
                            .single();
                        
                        const prevStock = Number(cat?.stock_actual || 0);
                        const newStock = Math.max(0, prevStock - Number(item.quantity || 0));

                        await supabase.from('catalog_items').update({ stock_actual: newStock }).eq('id', item.catalog_item_id);
                        await supabase.from('stock_movements').insert({
                            catalog_item_id: item.catalog_item_id,
                            movement_type: 'CONSUMO_CIRUGIA',
                            quantity: Number(item.quantity || 0),
                            previous_stock: prevStock,
                            new_stock: newStock,
                            surgery_id: surgery.id,
                            reason: `Consumo en cirugía - ${item.type === 'anesthesia' ? 'Anestesia' : 'Cirugía'}`,
                            patient_name: surgery.patientName || surgeryMetadata?.patient?.name || 'Cirugía',
                            created_by: user?.name || 'Técnico'
                        });

                        isDeducted = true;
                    }

                    processedItems.push({
                        form_id: currentFormId,
                        type: item.type,
                        name: item.name,
                        unit: item.unit,
                        quantity: item.quantity,
                        descontar_stock: item.descontar_stock !== false,
                        stock_descontado: isDeducted,
                        catalog_item_id: item.catalog_item_id || null
                    });
                }

                // Delete existing items
                const { error: deleteError } = await supabase.from('surgery_form_items').delete().eq('form_id', currentFormId);
                if (deleteError) {
                    alert('Error al actualizar materiales (posible conexión inestable). Intente de nuevo.');
                    throw deleteError;
                }

                if (processedItems.length > 0) {
                    const { error: itemsError } = await supabase.from('surgery_form_items').insert(processedItems);
                    if (itemsError) {
                        alert('AVISO: Los materiales se borraron pero falló la inserción de los nuevos. NO CIERRE la ficha, intente "Guardar" de nuevo para reintentar la carga.');
                        throw itemsError;
                    }
                }

                originalItemsRef.current = JSON.parse(JSON.stringify(processedItems));
                setItems(processedItems);

                // IMPORTANT: Update local state to allow subsequent saves without reopening the form
                setFormId(currentFormId);
                setLastUpdatedAt(formData.updated_at);
            }


            setIsDirty(false);
            setShowSuccess(true);

            // Trigger Globalapp Sync to review & update all fields in Globalapp (non-blocking)
            triggerGlobalappSync(surgery.id, 'sync', false, { startTime: tHcc, endTime: tHfcEffective })
                .then(res => {
                    if (res && !res.success && res.error) {
                        alert(`⚠️ Aviso Globalapp:\n${res.error}\n\n(La Ficha Quirúrgica se guardó normalmente en el Panel de Cirugías).`);
                    } else if (res && res.success) {
                        if ((res as any).arcoEnCResult && !(res as any).arcoEnCResult.success) {
                            alert(`⚠️ Aviso Arco en C en GlobalApp:\n${(res as any).arcoEnCResult.error}\n\n(La cirugía se sincronizó pero la práctica de Arco en C no se pudo cargar).`);
                        } else if (arcoEnC && !arcoEnCSynced) {
                            setArcoEnCSynced(true);
                        } else if (!arcoEnC && arcoEnCSynced) {
                            setArcoEnCSynced(false);
                        }
                    }
                })
                .catch(err => console.error('[GlobalappSync] Error al sincronizar desde Ficha Técnica:', err));

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
                                    <img src="logo-iteo.png" className="h-14 object-contain" alt="ITEO" />
                                </div>
                                <div className="text-right">
                                    <h2 className="text-2xl font-bold uppercase tracking-widest border border-black px-3 py-0.5 inline-block">Ficha Quirúrgica</h2>
                                    <p className="text-[10px] mt-0.5 font-bold">Código: {surgery.id?.slice(-6).toUpperCase()} | Formulario de Registro Oficial</p>
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
                                            <span className="font-semibold">Anestesiólogo:</span><span className="uppercase">{users.find(u => u.doctor_id === anesthesiologistId)?.name || surgery.anesthetist || '---'}</span>
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
                                            <div className="flex-1 flex justify-between border-b border-dotted border-gray-400">
                                                <span className="font-semibold">Arco en C:</span><span className="uppercase font-bold">{arcoEnC ? 'SÍ' : 'NO'}</span>
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
                            <div className="flex justify-around print:justify-center avoid-break mt-12">
                                {/* Firma Cirujano */}
                                <div className="text-center relative pt-2 w-64 flex flex-col items-center print:hidden">
                                    {surgeonSignature && (
                                        <img src={surgeonSignature} className="h-14 object-contain mb-1" alt="Firma Cirujano" />
                                    )}
                                    <div className="w-full border-t border-black"></div>
                                    <p className="text-[10px] font-bold uppercase tracking-widest">
                                        Médico Cirujano: {surgeryMetadata?.doctor?.full_name || surgery.doctor || '..........................'}
                                    </p>
                                </div>

                                {/* Firma Anestesista */}
                                <div className="text-center relative pt-2 w-64 flex flex-col items-center">
                                    {signature && (
                                        <img src={signature} className="h-14 object-contain mb-1" alt="Firma Anestesista" />
                                    )}
                                    <div className="w-full border-t border-black"></div>
                                    <p className="text-[10px] font-bold uppercase tracking-widest">
                                        Médico Anestesiólogo: {anesthesiologistId ? users.find(u => u.doctor_id === anesthesiologistId)?.name : '..........................'}
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
                                Ficha Técnica de Cirugía | <span className="text-indigo-600">{surgery.id?.slice(-6).toUpperCase()}</span>
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
                        <div className="flex items-center gap-2 print:hidden">
                            <button
                                type="button"
                                disabled={syncingGlobalapp}
                                onClick={async (e) => {
                                    const showBrowser = e.shiftKey;
                                    setSyncingGlobalapp(true);
                                    setGlobalappStatusMsg('Sincronizando con Globalapp...');
                                    try {
                                        if (isDirty && !isReadOnly) {
                                            await handleSave(false);
                                        }
                                        const res = await triggerGlobalappSync(surgery.id, 'sync', showBrowser, { startTime: hcc, endTime: hfc });
                                        if (res?.success) {
                                            setGlobalappStatusMsg(res.delegated ? 'Enviado a PC Quirófano' : 'Globalapp Sincronizado');
                                        } else {
                                            setGlobalappStatusMsg('No sincronizado');
                                            if (res?.error) {
                                                alert(`⚠️ Aviso Globalapp:\n${res.error}`);
                                            }
                                        }
                                    } catch (err) {
                                        setGlobalappStatusMsg('Error al sincronizar');
                                    } finally {
                                        setSyncingGlobalapp(false);
                                        setTimeout(() => setGlobalappStatusMsg(null), 4000);
                                    }
                                }}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-black uppercase tracking-wider border transition-all ${
                                    syncingGlobalapp
                                        ? 'bg-indigo-50 text-indigo-600 border-indigo-200 animate-pulse cursor-wait'
                                        : globalappStatusMsg?.includes('Error')
                                        ? 'bg-rose-50 text-rose-600 border-rose-200'
                                        : globalappStatusMsg
                                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                        : 'bg-white text-indigo-600 border-indigo-200 hover:bg-indigo-50 shadow-sm'
                                }`}
                                title="Sincronizar datos de la cirugía con Globalapp (Shift + Clic para abrir navegador visible)"
                            >
                                <span className={`material-symbols-outlined text-base ${syncingGlobalapp ? 'animate-spin' : ''}`}>
                                    {syncingGlobalapp ? 'sync' : globalappStatusMsg ? 'cloud_done' : 'cloud_upload'}
                                </span>
                                <span>{globalappStatusMsg || 'Globalapp'}</span>
                            </button>
                            {onMinimize && (
                                <button
                                    onClick={onMinimize}
                                    className="text-slate-400 hover:text-indigo-600 size-10 flex items-center justify-center rounded-full hover:bg-indigo-50 transition-all"
                                    title="Minimizar ficha"
                                >
                                    <span className="material-symbols-outlined">minimize</span>
                                </button>
                            )}
                            <button onClick={handleInternalClose} className="text-slate-400 hover:text-slate-600 size-10 flex items-center justify-center rounded-full hover:bg-slate-200 transition-all">
                                <span className="material-symbols-outlined">close</span>
                            </button>
                        </div>
                    </div>


                    <div className="flex-1 overflow-y-auto p-6 space-y-8 bg-white print:hidden">
                        <ObsRecordingSection
                            patientName={surgery.patient}
                            doctorName={surgery.doctor}
                            currentUserRole={user?.role || ''}
                            status={surgery.status}
                            operatingRoomId={operatingRoomId || surgeryMetadata?.operating_room_id || ''}
                        />

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
                                        <input 
                                            type="time" 
                                            value={hfa} 
                                            onChange={e => { 
                                                const newHfa = e.target.value;
                                                setHfa(newHfa); 
                                                setIsDirty(true);
                                                if (newHfa) {
                                                    const [faH, faM] = newHfa.split(':').map(Number);
                                                    const faMin = faH * 60 + faM;
                                                    if (!hfc) {
                                                        setHfc(newHfa);
                                                    } else {
                                                        const [fcH, fcM] = hfc.split(':').map(Number);
                                                        const fcMin = fcH * 60 + fcM;
                                                        if (faMin > fcMin) {
                                                            setHfc(newHfa);
                                                        }
                                                    }
                                                }
                                            }} 
                                            disabled={isReadOnly} 
                                            className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm font-mono font-bold text-slate-900 disabled:opacity-75" 
                                        />
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
                                    <span className="material-symbols-outlined text-sm">biotech</span> Muestras & Equipamiento
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

                                    {/* Checkbox: ¿Se utilizó Arco en C? */}
                                    <div className="pt-2.5 border-t border-slate-200">
                                        <label className={`flex items-center justify-between p-2 rounded-lg border transition-all cursor-pointer select-none ${
                                            arcoEnC 
                                                ? 'bg-indigo-50/80 border-indigo-200 shadow-sm' 
                                                : 'bg-white border-slate-200 hover:bg-slate-100/50'
                                        }`}>
                                            <div className="flex items-center gap-2.5">
                                                <input
                                                    type="checkbox"
                                                    checked={arcoEnC}
                                                    onChange={e => handleToggleArcoEnC(e.target.checked)}
                                                    disabled={isReadOnly}
                                                    className="size-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 disabled:opacity-50 cursor-pointer"
                                                />
                                                <div>
                                                    <span className="text-xs font-black text-slate-800 uppercase tracking-wide">
                                                        ¿Se utilizó Arco en C?
                                                    </span>
                                                    <p className="text-[10px] font-semibold text-slate-400">
                                                        Práctica 340907 con Gastos y PAC en GlobalApp
                                                    </p>
                                                </div>
                                            </div>
                                            {/* Badges de Estado */}
                                            <div className="shrink-0">
                                                {arcoEnCSynced && !arcoEnCSyncTimer && (
                                                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-800 border border-emerald-300">
                                                        <span className="material-symbols-outlined text-[13px]">check_circle</span>
                                                        Cargado en GlobalApp
                                                    </span>
                                                )}
                                                {arcoEnCSyncTimer !== null && (
                                                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black bg-amber-100 text-amber-800 border border-amber-300 animate-pulse">
                                                        <span className="material-symbols-outlined text-[13px] animate-spin">timelapse</span>
                                                        {arcoEnCStatusMsg}
                                                    </span>
                                                )}
                                                {!arcoEnCSynced && arcoEnCSyncTimer === null && arcoEnCStatusMsg && (
                                                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black bg-slate-200 text-slate-700">
                                                        {arcoEnCStatusMsg}
                                                    </span>
                                                )}
                                            </div>
                                        </label>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Section: Items / Medications */}
                        <div>
                            <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                                <h4 className="flex items-center gap-2 text-xs font-black text-slate-400 uppercase tracking-[0.2em]">
                                    <span className="material-symbols-outlined text-sm">inventory_2</span> Registro de Insumos & Medicación
                                    {isReadOnly && <span className="ml-auto text-amber-600 bg-amber-50 px-2 py-0.5 rounded font-black text-[10px] normal-case">VISTA DE SOLO LECTURA</span>}
                                </h4>
                                <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase border print:hidden ${
                                    stockConsumptionEnabled
                                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                        : 'bg-slate-100 text-slate-500 border-slate-200'
                                }`}>
                                    <span className={`size-1.5 rounded-full ${stockConsumptionEnabled ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                                    {stockConsumptionEnabled ? 'Descuento de Stock Activo' : 'Descuento de Stock Pausado'}
                                </span>
                            </div>

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
                                                            setNewItem({ ...newItem, name: item.name, type: detectedType, unit: item.default_unit || newItem.unit });
                                                            setShowSuggestions(false);
                                                        }}
                                                    >
                                                        <div>
                                                            <span className="font-bold text-slate-100">{item.name}</span>
                                                            <span className="text-[10px] text-slate-400 block">
                                                                Stock: <strong className={item.stock_actual && item.stock_actual > 0 ? 'text-emerald-400' : 'text-rose-400'}>{item.stock_actual ?? 0} {item.default_unit || 'unidades'}</strong>
                                                            </span>
                                                        </div>
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
                                                        <div className="flex items-center gap-2 flex-1 min-w-0">
                                                            <span className="text-xs font-bold text-slate-700 truncate">{item.name} <span className="text-slate-400 font-normal">({item.quantity} {item.unit})</span></span>
                                                            <label 
                                                                className={`print:hidden inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium transition-colors cursor-pointer select-none ${
                                                                    item.descontar_stock !== false 
                                                                        ? 'bg-indigo-50 text-indigo-700 border border-indigo-200' 
                                                                        : 'bg-amber-50 text-amber-700 border border-amber-200'
                                                                }`}
                                                                title={item.descontar_stock !== false ? "Se descontará del stock de farmacia al guardar" : "Uso parcial / No descontará stock"}
                                                            >
                                                                <input
                                                                    type="checkbox"
                                                                    checked={item.descontar_stock !== false}
                                                                    onChange={() => toggleItemDescontar(item.id!)}
                                                                    disabled={isReadOnly}
                                                                    className="w-3 h-3 text-indigo-600 rounded focus:ring-0 cursor-pointer"
                                                                />
                                                                <span>{item.descontar_stock !== false ? 'Desc. stock' : 'No descontar'}</span>
                                                            </label>
                                                        </div>
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
                                                        <div className="flex items-center gap-2 flex-1 min-w-0">
                                                            <span className="text-xs font-bold text-slate-700 truncate">{item.name} <span className="text-slate-400 font-normal">({item.quantity} {item.unit})</span></span>
                                                            <label 
                                                                className={`print:hidden inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium transition-colors cursor-pointer select-none ${
                                                                    item.descontar_stock !== false 
                                                                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' 
                                                                        : 'bg-amber-50 text-amber-700 border border-amber-200'
                                                                }`}
                                                                title={item.descontar_stock !== false ? "Se descontará del stock de farmacia al guardar" : "Uso parcial / No descontará stock"}
                                                            >
                                                                <input
                                                                    type="checkbox"
                                                                    checked={item.descontar_stock !== false}
                                                                    onChange={() => toggleItemDescontar(item.id!)}
                                                                    disabled={isReadOnly}
                                                                    className="w-3 h-3 text-emerald-600 rounded focus:ring-0 cursor-pointer"
                                                                />
                                                                <span>{item.descontar_stock !== false ? 'Desc. stock' : 'No descontar'}</span>
                                                            </label>
                                                        </div>
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

                            {/* Section: Signature and Validation */}
                            <div className="mt-8 border-t border-slate-100 pt-8">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
                                    {/* Column 1: Surgeon (Only for SuperAdmin or if already signed) */}
                                    {(user?.role === 'SuperAdmin' || surgeonSignature) && (
                                        <div className="space-y-4">
                                            <h4 className="flex items-center gap-2 text-xs font-black text-slate-400 uppercase tracking-[0.2em] mb-4">
                                                <span className="material-symbols-outlined text-sm">draw</span> Firma del Cirujano
                                            </h4>
                                            <div className="bg-slate-50 border border-slate-200 rounded-xl overflow-hidden">
                                                {surgeonSignature ? (
                                                    <div className="relative group p-4 bg-white flex flex-col items-center">
                                                        <img src={surgeonSignature} alt="Firma Cirujano" className="max-h-32 object-contain" />
                                                        <button 
                                                            onClick={() => { setSurgeonSignature(null); setIsDirty(true); }}
                                                            disabled={isReadOnly}
                                                            className="mt-2 text-[10px] font-bold text-red-500 uppercase hover:underline disabled:opacity-0"
                                                        >
                                                            Eliminar Firma
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <div className="p-8 flex flex-col items-center justify-center gap-4 bg-slate-50/50">
                                                        <div className="size-16 rounded-full bg-indigo-50 flex items-center justify-center">
                                                            <span className="material-symbols-outlined text-indigo-600 text-3xl">verified_user</span>
                                                        </div>
                                                        <div className="text-center">
                                                            <p className="text-sm font-bold text-slate-700">Firma Cirujano</p>
                                                            <p className="text-[10px] text-slate-500">Haz clic abajo para aplicar firma.</p>
                                                        </div>
                                                        <button 
                                                            onClick={() => { setSignatureTarget('surgeon'); setShowPinModal(true); }}
                                                            disabled={isReadOnly}
                                                            className="flex items-center gap-2 bg-slate-800 hover:bg-black disabled:opacity-50 text-white font-bold py-2.5 px-6 rounded-xl transition-all shadow-md shadow-slate-200 uppercase text-[10px] tracking-widest"
                                                        >
                                                            <span className="material-symbols-outlined text-lg">draw</span>
                                                            Firmar Cirujano
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                            <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
                                                <div className="flex justify-between border-b border-slate-200 pb-1">
                                                    <span className="text-[10px] text-slate-500 uppercase font-bold">Cirujano:</span>
                                                    <span className="text-[10px] text-slate-900 font-black uppercase">
                                                        {surgeryMetadata?.doctor?.full_name || surgery.doctor || 'NO ASIGNADO'}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {/* Column 2: Anesthesiologist */}
                                    <div className="space-y-4">
                                        <h4 className="flex items-center gap-2 text-xs font-black text-slate-400 uppercase tracking-[0.2em] mb-4">
                                            <span className="material-symbols-outlined text-sm">draw</span> Firma del Anestesista
                                        </h4>
                                        <div className="bg-slate-50 border border-slate-200 rounded-xl overflow-hidden">
                                            {signature ? (
                                                <div className="relative group p-4 bg-white flex flex-col items-center">
                                                    <img src={signature} alt="Firma Anestesista" className="max-h-32 object-contain" />
                                                    <button 
                                                        onClick={() => { setSignature(null); setIsDirty(true); }}
                                                        disabled={isReadOnly}
                                                        className="mt-2 text-[10px] font-bold text-red-500 uppercase hover:underline disabled:opacity-0"
                                                    >
                                                        Eliminar Firma
                                                    </button>
                                                </div>
                                            ) : (
                                                <div className="p-8 flex flex-col items-center justify-center gap-4 bg-slate-50/50">
                                                    <div className="size-16 rounded-full bg-indigo-50 flex items-center justify-center">
                                                        <span className="material-symbols-outlined text-indigo-600 text-3xl">verified_user</span>
                                                    </div>
                                                    <div className="text-center">
                                                        <p className="text-sm font-bold text-slate-700">Firma Anestesista</p>
                                                        <p className="text-[10px] text-slate-500">Haz clic abajo para aplicar firma.</p>
                                                    </div>
                                                    <button 
                                                        onClick={() => { setSignatureTarget('anesthesiologist'); setShowPinModal(true); }}
                                                        disabled={isReadOnly}
                                                        className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold py-2.5 px-6 rounded-xl transition-all shadow-md shadow-indigo-200 uppercase text-[10px] tracking-widest"
                                                    >
                                                        <span className="material-symbols-outlined text-lg">draw</span>
                                                        Firmar Anestesista
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                        <div className="bg-indigo-50/50 rounded-xl p-4 border border-indigo-100/50">
                                            <div className="flex justify-between border-b border-indigo-100 pb-1">
                                                <span className="text-[10px] text-indigo-500 uppercase font-bold">Anestesista:</span>
                                                <span className="text-[10px] text-indigo-900 font-black uppercase">
                                                    {users.find(u => u.doctor_id === anesthesiologistId)?.name || 'NO ASIGNADO'}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div className="mt-6 text-center">
                                    <p className="text-[10px] text-slate-400 italic">
                                        Al firmar digitalmente, el profesional valida la integridad de los datos registrados y los insumos utilizados.
                                    </p>
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

                        <PDFDownloadLink
                            document={
                                <SurgeryPDF
                                    data={{
                                        surgery,
                                        metadata: surgeryMetadata,
                                        patient: patientMetadata,
                                        form: {
                                            ayudante_1: ayudante1,
                                            ayudante_2: ayudante2,
                                            instrumentadora: instrumentadora,
                                            anestesia_inicio: hia,
                                            anestesia_fin: hfa,
                                            cirugia_inicio: hcc,
                                            cirugia_fin: hfc,
                                            age: calculateAge(patientMetadata?.birth_date)
                                        },
                                        items,
                                        signature: signature || undefined,
                                        surgeonSignature: surgeonSignature || undefined,
                                        anesthesiologistName: users.find(u => u.doctor_id === anesthesiologistId)?.name || surgery.anesthetist,
                                        surgeonName: surgeryMetadata?.doctor?.full_name || surgery.doctor
                                    }}
                                />
                            }
                            fileName={`Ficha_Quirurgica_${surgery.id?.slice(-6)}.pdf`}
                            className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-bold text-sm shadow-md flex items-center gap-2 print:hidden"
                        >
                            {({ loading: pdfLoading }) => (
                                <>
                                    <span className="material-symbols-outlined text-lg">
                                        {pdfLoading ? 'sync' : 'picture_as_pdf'}
                                    </span>
                                    {pdfLoading ? 'Preparando...' : 'Generar PDF'}
                                </>
                            )}
                        </PDFDownloadLink>

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
            {/* PIN Validation Modal */}
            {showPinModal && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-md p-4 animate-fadeIn">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden border border-slate-200">
                        <div className="p-6 bg-indigo-600 text-white text-center">
                            <div className="size-16 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center mx-auto mb-4">
                                <span className="material-symbols-outlined text-3xl">lock</span>
                            </div>
                            <h3 className="text-xl font-bold">Validar Firma Digital</h3>
                            <p className="text-indigo-100 text-xs mt-1">Ingresa tu PIN de 4 dígitos para autorizar</p>
                        </div>
                        <div className="p-8 space-y-6">
                            <div className="flex justify-center gap-3">
                                {[0, 1, 2, 3].map((i) => (
                                    <div 
                                        key={i}
                                        className={`size-12 rounded-2xl border-2 flex items-center justify-center text-xl font-black transition-all ${
                                            pinInput[i] ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-slate-200 bg-slate-50 text-slate-300'
                                        }`}
                                    >
                                        {pinInput[i] ? '●' : ''}
                                    </div>
                                ))}
                            </div>
                            
                            <input 
                                type="password"
                                autoFocus
                                maxLength={4}
                                value={pinInput}
                                onChange={(e) => {
                                    const val = e.target.value.replace(/\D/g, '');
                                    setPinInput(val);
                                }}
                                className="sr-only"
                            />

                            <div className="grid grid-cols-3 gap-3">
                                {[1, 2, 3, 4, 5, 6, 7, 8, 9, '', 0, 'del'].map((num, i) => (
                                    <button
                                        key={i}
                                        onClick={() => {
                                            if (num === 'del') setPinInput(pinInput.slice(0, -1));
                                            else if (num !== '' && pinInput.length < 4) setPinInput(pinInput + num);
                                        }}
                                        className={`h-14 rounded-2xl font-bold text-lg flex items-center justify-center transition-all ${
                                            num === '' ? 'invisible' : 'bg-slate-50 hover:bg-slate-100 text-slate-700 active:scale-95'
                                        }`}
                                    >
                                        {num === 'del' ? <span className="material-symbols-outlined">backspace</span> : num}
                                    </button>
                                ))}
                            </div>

                            <div className="flex gap-3 pt-2">
                                <button
                                    onClick={() => { setShowPinModal(false); setPinInput(''); }}
                                    className="flex-1 py-3 font-bold text-slate-500 hover:text-slate-700"
                                >
                                    Cancelar
                                </button>
                                <button
                                    onClick={handleApplySignature}
                                    disabled={pinInput.length < 4 || isVerifyingPin}
                                    className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-2xl font-bold shadow-lg shadow-indigo-100 flex items-center justify-center gap-2"
                                >
                                    {isVerifyingPin ? (
                                        <div className="size-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                                    ) : 'Validar'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal de Advertencia para Ítems no incluidos en el Listado Habitual */}
            {unlistedWarningItem && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[150] flex items-center justify-center p-4 animate-fadeIn">
                    <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-amber-200 animate-scaleUp">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="size-12 rounded-2xl bg-amber-100 text-amber-600 flex items-center justify-center flex-shrink-0">
                                <span className="material-symbols-outlined text-2xl">help</span>
                            </div>
                            <div>
                                <h3 className="text-base font-black text-slate-800">Elemento no Habitual</h3>
                                <p className="text-xs text-slate-500">Confirmación de carga manual</p>
                            </div>
                        </div>

                        <div className="bg-amber-50/70 border border-amber-200/60 rounded-xl p-3.5 mb-5 text-sm text-slate-700">
                            <p className="mb-2">
                                El elemento <strong className="text-amber-900 font-bold bg-amber-100/70 px-1.5 py-0.5 rounded">"{unlistedWarningItem.name}"</strong> no se encuentra en el listado ni en el vademécum habitual de quirófano.
                            </p>
                            <p className="text-xs text-amber-800 font-medium">
                                ¿Desea agregarlo de todas formas aunque no esté en el catálogo oficial?
                            </p>
                        </div>

                        <div className="flex gap-3">
                            <button
                                type="button"
                                onClick={() => setUnlistedWarningItem(null)}
                                className="flex-1 py-2.5 px-4 rounded-xl border border-slate-300 font-bold text-xs text-slate-700 hover:bg-slate-100 transition-colors"
                            >
                                Volver y corregir
                            </button>
                            <button
                                type="button"
                                onClick={() => executeAddItem(unlistedWarningItem)}
                                className="flex-1 py-2.5 px-4 rounded-xl bg-amber-600 hover:bg-amber-700 font-bold text-xs text-white shadow-lg shadow-amber-600/20 transition-all flex items-center justify-center gap-1.5"
                            >
                                <span className="material-symbols-outlined text-sm">check</span>
                                Sí, agregar igual
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};

export default SurgeryForm;
