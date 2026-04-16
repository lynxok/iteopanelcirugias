import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../src/lib/supabase';
import { useAuth } from '../src/lib/AuthContext';
import { createOrUpdateDoctorAlert } from '../src/lib/alertService';
import { OperatingRoom } from '../types';
import ProgressBar from '../components/ProgressBar';
import { captureError } from '../src/lib/errorLogger';

// --- Types & Helpers ---
type ViewMode = 'month' | 'week' | 'day';

interface CalendarEvent {
    id: string;
    title: string;
    start: Date;
    end: Date;
    isTimeTBD?: boolean;
    color: string;
    icon?: string;
    completed?: boolean;
    suspended?: boolean;
    orId: string;
    isBlocked?: boolean;
    originalDoctor?: string;
    orthoValidated?: boolean;
    needsOrthoValidation?: boolean;
    hasAllDocs?: boolean;
    missingDocs?: string[];
    authDate?: string | null;
    doctorId?: string | null;
    patientName?: string;
    patientAvailableFrom?: string | null;
    patientUnableToAttend?: boolean;
    hasPendingReschedule?: boolean;
    suggestedDate?: string | null;
    medicalCoverage?: string;
    isGuardia?: boolean;
}

interface PendingSurgery {
    id: string;
    name: string;
    proc: string;
    doctor: string;
    duration: number; // minutes
    color: string;
    status?: string;
    // New fields for rules
    orthoValidated: boolean;
    needsOrthoValidation: boolean;
    hasAllDocs: boolean;
    missingDocs: string[];
    priority: string;
    completenessScore: number;
    doctorPriorityValidated: boolean;
    requiresProsthesis: boolean;
    createdAt: string;
    authDate?: string | null;
    doctorId?: string | null;
    patientName?: string;
    isArt?: boolean;
    patientAvailableFrom?: string | null;
    patientUnableToAttend?: boolean;
    hasPendingReschedule?: boolean;
    suggestedDate?: string | null;
    medicalCoverage?: string;
    isGuardia?: boolean;
}

const Calendar: React.FC = () => {
    const navigate = useNavigate();
    const { user } = useAuth();
    const [searchParams, setSearchParams] = useSearchParams();

    // Initial calculation from URL
    const initialView = useMemo(() => (searchParams.get('view') as ViewMode) || 'month', [searchParams]);
    const initialDate = useMemo(() => {
        const dateParam = searchParams.get('date');
        if (dateParam) {
            const d = new Date(dateParam + 'T12:00:00');
            if (!isNaN(d.getTime())) return d;
        }
        return new Date();
    }, [searchParams]);

    // State
    const [currentDate, setCurrentDate] = useState(initialDate);
    const [view, setView] = useState<ViewMode>(initialView);
    const [previousView, setPreviousView] = useState<ViewMode | null>(null);
    const [showRulesSummary, setShowRulesSummary] = useState(false);
    const [currentTime, setCurrentTime] = useState(new Date());

    // --- Synchronization & URL Sync ---
    const lastUrlDate = useRef(searchParams.get('date'));

    // Helper to format date in local YYYY-MM-DD
    const getLocalStr = (d: Date) => {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    };

    // 1. Sync State FROM URL (Handles browser back/forward and initial load)
    useEffect(() => {
        const urlView = searchParams.get('view') as ViewMode;
        const urlDate = searchParams.get('date');
        
        if (urlView && urlView !== view) {
            setView(urlView);
        }
        
        // Only update if URL date is different from what we last SYNCED (avoids pings)
        if (urlDate && urlDate !== lastUrlDate.current) {
            const dateObj = new Date(urlDate + 'T12:00:00');
            if (!isNaN(dateObj.getTime())) {
                setCurrentDate(dateObj);
                lastUrlDate.current = urlDate;
            }
        }
    }, [searchParams]);

    // 2. Sync URL FROM State (Handles UI navigation buttons like NEXT/PREV)
    useEffect(() => {
        const currentDSafe = getLocalStr(currentDate);
        const urlView = searchParams.get('view');
        const urlDate = searchParams.get('date');

        if (urlView !== view || urlDate !== currentDSafe) {
            const newParams = new URLSearchParams(searchParams);
            newParams.set('view', view);
            newParams.set('date', currentDSafe);
            setSearchParams(newParams, { replace: true });
            
            // Critical: Update ref so Hook 1 knows this was an internal change
            lastUrlDate.current = currentDSafe;
        }
    }, [currentDate, view, setSearchParams]);

    // Data State
    const [events, setEvents] = useState<CalendarEvent[]>([]);
    const [pendingSurgeries, setPendingSurgeries] = useState<PendingSurgery[]>([]);
    const [ors, setOrs] = useState<OperatingRoom[]>([]);
    const [loading, setLoading] = useState(true);
    const [isMobile, setIsMobile] = useState(window.innerWidth < 1024);
    const [selectedDayOrId, setSelectedDayOrId] = useState<string | null>(null);
    const [holidays, setHolidays] = useState<Record<string, string>>({});

    useEffect(() => {
        const fetchHolidays = async () => {
            try {
                const year = currentDate.getFullYear();
                const response = await fetch(`https://api.argentinadatos.com/v1/feriados/${year}`);
                const data = await response.json();

                const holidayMap: Record<string, string> = {};
                data.forEach((h: any) => {
                    holidayMap[h.fecha] = h.nombre;
                });
                setHolidays(holidayMap);
            } catch (err) {
                console.error('Error fetching holidays for calendar:', err);
            }
        };
        fetchHolidays();
    }, [currentDate.getFullYear()]);

    useEffect(() => {
        const handleResize = () => setIsMobile(window.innerWidth < 1024);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    // Also default selectedDayOrId when ORs are loaded
    useEffect(() => {
        if (ors.length > 0 && !selectedDayOrId) {
            setSelectedDayOrId(ors[0].id);
        }
    }, [ors]);

    // Modal State
    const [showModal, setShowModal] = useState(false);
    const [modalDate, setModalDate] = useState<Date | null>(null);

    // Scheduling Logic State
    const [selectedPendingId, setSelectedPendingId] = useState<string | null>(null);
    const [selectedOrId, setSelectedOrId] = useState<string>('');
    const [selectedTimeSlot, setSelectedTimeSlot] = useState<string | null>(null);
    const [modalSearchTerm, setModalSearchTerm] = useState('');


    const canDrag = user?.role === 'Quirofano' || user?.role === 'SuperAdmin' || user?.role === 'Tecnico';

    // -- Fetch Data --
    useEffect(() => {
        const year = currentDate.getFullYear();
        const month = currentDate.getMonth();
        const daysInMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).getDate();
        fetchInitialData(year, month);
    }, [currentDate.getFullYear(), currentDate.getMonth()]); // Only re-fetch on month/year change

    // -- Cascade Displacement Logic --
    const calculateDisplacement = (
        dayEvents: CalendarEvent[],
        movedEventId: string,
        newStart: Date,
        movedDurationMinutes: number
    ): { id: string, start: Date, end: Date }[] => {
        // 1. Create a working list of events (simulating the move)
        let workingEvents = dayEvents.map(e => {
            if (e.id === movedEventId) {
                const end = new Date(newStart);
                end.setMinutes(newStart.getMinutes() + movedDurationMinutes);
                return { ...e, start: newStart, end };
            }
            return e;
        }).sort((a, b) => {
            const timeDiff = a.start.getTime() - b.start.getTime();
            if (timeDiff !== 0) return timeDiff;
            
            // If they start at the same time:
            // 1. If one is the MOVED event, put it FIRST (since we want to "respect" what the user is doing)
            // Actually, user said "respect the one that is first". 
            // If I move S2 to exactly 08:00 (where S1 is), and S1 was already there...
            // User said: "fijate cual es la que primero esta programada y respetes ese horario y desplaces las demas".
            // If they are identical, we should probably prefer the pre-existing one if we want to "respect" scheduled times.
            // But if the user's intent is to INSERT at the top, we prefer the moved one.
            
            // Re-reading user: "respect the first scheduled one". 
            // Let's assume pre-existing ones have priority for the same minute.
            if (a.id === movedEventId) return 1;
            if (b.id === movedEventId) return -1;
            
            return a.id.localeCompare(b.id); // Ensure stability
        });

        // 2. Identify and resolve overlaps (Cascade Displacement)
        for (let i = 0; i < workingEvents.length - 1; i++) {
            const current = workingEvents[i];
            const next = workingEvents[i + 1];

            // If current ends AFTER next starts, we must push next.
            if (current.end.getTime() > next.start.getTime()) {
                // OVERLAP DETECTED - Move 'next' to start when 'current' ends
                const newNextStart = new Date(current.end);
                const duration = next.end.getTime() - next.start.getTime();
                const newNextEnd = new Date(newNextStart.getTime() + duration);
                workingEvents[i + 1] = { ...next, start: newNextStart, end: newNextEnd };
            }
        }

        // Return only changed events + the moved one itself
        return workingEvents.filter(we => {
            const original = dayEvents.find(de => de.id === we.id);
            if (!original) return true; // It's a newly scheduled event, MUST include it
            return original.start.getTime() !== we.start.getTime() || we.id === movedEventId;
        }).map(e => ({ id: e.id, start: e.start, end: e.end }));
    };

    const handleBackToBackReorder = async (roomEvents: CalendarEvent[], movedId: string, targetIndex: number) => {
        if (targetIndex < 0 || targetIndex >= roomEvents.length) return;

        // 1. Sort by current start time to ensure sequence
        const sorted = [...roomEvents].sort((a, b) => a.start.getTime() - b.start.getTime());

        // 2. Calculate Gaps between slots (Gap[i] is the time between Event[i] End and Event[i+1] Start)
        const gaps: number[] = [];
        for (let i = 0; i < sorted.length - 1; i++) {
            const currentEnd = sorted[i].end.getTime();
            const nextStart = sorted[i + 1].start.getTime();
            gaps.push(nextStart - currentEnd);
        }

        // 3. Capture the anchor start time (Start of the very first event in the sequence)
        const firstSlotStartTime = sorted[0].start.getTime();

        // 4. Perform the Reorder
        const movedItem = sorted.find(e => e.id === movedId);
        if (!movedItem) return;

        const filtered = sorted.filter(e => e.id !== movedId);
        filtered.splice(targetIndex, 0, movedItem);

        // 5. Recalculate Times (NO GAPS - Back-to-Back)
        let currentStart = firstSlotStartTime;
        const updates: { id: string, start: Date, end: Date }[] = [];

        filtered.forEach((ev) => {
            const start = new Date(currentStart);
            const durationMs = ev.end.getTime() - ev.start.getTime();
            const end = new Date(start.getTime() + durationMs);

            // Check if changed
            if (ev.start.getTime() !== start.getTime()) {
                updates.push({ id: ev.id, start, end });
            }

            // Prep start for next iteration (Back-to-Back)
            currentStart = end.getTime();
        });

        if (updates.length > 0) {
            try {
                setLoading(true);
                await Promise.all(updates.map(async (u) => {
                    const timeStr = `${u.start.getHours().toString().padStart(2, '0')}:${u.start.getMinutes().toString().padStart(2, '0')}`;
                    const res = await supabase
                        .from('surgeries')
                        .update({ start_time: timeStr, or_validated: true })
                        .eq('id', u.id);

                    if (res.error) throw res.error;

                    // --- OPERATIONAL ALERT FOR DOCTOR ---
                    const targetEvent = roomEvents.find(e => e.id === u.id);
                    if (targetEvent?.doctorId) {
                        const isOriginalMoved = u.id === movedId;
                        const title = isOriginalMoved ? 'Cirugía Reprogramada' : 'Agenda Desplazada';
                        const message = isOriginalMoved
                            ? `Su cirugía de ${targetEvent.patientName || 'N/A'} ha sido reprogramada para hoy a las ${timeStr}.`
                            : `Su cirugía de ${targetEvent.patientName || 'N/A'} ha sido desplazada a las ${timeStr} debido a reordenamiento de la agenda.`;

                        await createOrUpdateDoctorAlert({
                            surgeryId: u.id,
                            doctorId: targetEvent.doctorId,
                            title,
                            message,
                            severity: 'Urgent',
                            type: isOriginalMoved ? 'schedule_change' : 'displacement',
                            patientName: targetEvent.patientName
                        });
                    }
                }));

                const year = currentDate.getFullYear();
                const month = currentDate.getMonth();
                await fetchInitialData(year, month);
            } catch (err) {
                console.error("Error reordering:", err);
                alert("Error al reordenar la secuencia.");
            } finally {
                setLoading(false);
            }
        }
    };

    const handleRescheduleDrop = async (eventId: string, newStartTimeStr: string, orId: string) => {
        const event = events.find(e => e.id === eventId);
        if (!event) return;

        const [h, m] = newStartTimeStr.split(':').map(Number);
        const newStart = new Date(event.start);
        newStart.setHours(h, m, 0, 0);

        // --- AUTHORIZATION DATE VALIDATION ---
        const year = newStart.getFullYear();
        const month = (newStart.getMonth() + 1).toString().padStart(2, '0');
        const day = newStart.getDate().toString().padStart(2, '0');
        const targetDateStr = `${year}-${month}-${day}`;

        if (!event.authDate) {
            alert('⚠️ Error crítico: Esta cirugía no tiene fecha de autorización. Debe definirla en el detalle antes de agendarla.');
            return;
        }

        if (targetDateStr < event.authDate) {
            alert(`⚠️ Error: No se puede mover la cirugía al ${targetDateStr} porque su autorización es del ${event.authDate}.`);
            return;
        }

        // --- PATIENT AVAILABILITY VALIDATION ---
        if (event.patientAvailableFrom && targetDateStr < event.patientAvailableFrom) {
            alert(`⚠️ Error: El paciente solo está disponible a partir del ${event.patientAvailableFrom}. No se puede agendar para el ${targetDateStr}.`);
            return;
        }

        // Get all events for this Day and this OR
        const dayEvents = events.filter(e =>
            e.orId === orId &&
            isSameDate(e.start, newStart) &&
            e.id !== eventId // Exclude self for the 'others' list? No, include all for sorting
        );
        // Actually include self in the list passed to calculator
        const allDayEvents = events.filter(e => e.orId === orId && isSameDate(e.start, newStart));

        const durationMinutes = (event.end.getTime() - event.start.getTime()) / (1000 * 60);

        const updates = calculateDisplacement(allDayEvents, eventId, newStart, durationMinutes);

        // If no updates (unlikely if we moved something), but surely the moved one changed
        // Ensuring the moved event is in updates list even if logic didn't push it further (it pushed itself)
        // My logic above catches it.

        if (confirm(`Se moverá la cirugía y se desplazarán ${updates.length - 1} cirugías posteriores. ¿Confirmar?`)) {
            try {
                setLoading(true);
                // Batch update
                await Promise.all(updates.map(async (update) => {
                    const timeStr = `${update.start.getHours().toString().padStart(2, '0')}:${update.start.getMinutes().toString().padStart(2, '0')}`;
                    const isTecnico = user?.role === 'Tecnico';

                    const { error } = await supabase
                        .from('surgeries')
                        .update({
                            start_time: timeStr,
                            surgery_date: targetDateStr,
                            or_validated: isTecnico,
                            or_validation_date: isTecnico ? new Date().toISOString() : null,
                            or_validated_by_name: isTecnico ? (user?.name || 'Personal Quirófano') : null
                        })
                        .eq('id', update.id);
                    if (error) throw error;

                    // --- OPERATIONAL ALERT FOR DOCTOR ---
                    const targetEvent = allDayEvents.find(e => e.id === update.id);
                    if (targetEvent?.doctorId) {
                        const isOriginalMoved = update.id === eventId;
                        const title = isOriginalMoved ? 'Cirugía Reprogramada' : 'Agenda Desplazada';
                        const message = isOriginalMoved
                            ? `Su cirugía de ${targetEvent.patientName || 'N/A'} ha sido reprogramada para el ${targetDateStr} a las ${timeStr}.`
                            : `Su cirugía de ${targetEvent.patientName || 'N/A'} ha sido desplazada a las ${timeStr} debido a cambios en la agenda del quirófano.`;

                        await createOrUpdateDoctorAlert({
                            surgeryId: update.id,
                            doctorId: targetEvent.doctorId,
                            title,
                            message,
                            severity: targetDateStr === new Date().toISOString().split('T')[0] ? 'Urgent' : 'Warning',
                            type: isOriginalMoved ? 'schedule_change' : 'displacement',
                            patientName: targetEvent.patientName
                        });
                    }
                }));



                supabase.from('audit_logs').insert({
                    user_name: user?.name || 'Personal Quirofano',
                    user_role: user?.role,
                    action: 'UPDATE',
                    resource: 'Calendario',
                    resource_id: eventId,
                    description: `Reordenamiento Drag&Drop: Cirugía principal ${eventId} a las ${newStartTimeStr}. ${updates.length - 1} desplazadas.`,
                    meta: { source: 'CalendarDragDrop', updatesCount: updates.length }
                }).then(({ error: auditError }) => {
                    if (auditError) console.warn('Silent Audit Error:', auditError);
                });

                await fetchInitialData();
            } catch (err) {
                console.error("Error in drag and drop update:", err);
                alert("Error al actualizar la programación.");
            }
        }
    };


    const fetchInitialData = async (targetYear?: number, targetMonth?: number) => {
        setLoading(true);
        try {
            // Calculate date range for optimization
            const now = new Date();
            const year = targetYear ?? currentDate.getFullYear();
            const month = targetMonth ?? currentDate.getMonth();

            // Fetch +/- 1 month to allow smooth navigation and drag/drop across borders
            const startDate = new Date(year, month - 1, 1);
            const endDate = new Date(year, month + 2, 0);
            const startStr = startDate.toISOString().split('T')[0];
            const endStr = endDate.toISOString().split('T')[0];

            // 1. Fetch Operating Rooms
            const { data: orData, error: orError } = await supabase
                .from('operating_rooms')
                .select('*')
                .eq('active', true);

            // Sort manually to avoid potential 400 error with order param
            if (orData) {
                (orData as any[]).sort((a, b) => a.name.localeCompare(b.name));
            }

            if (orError) throw orError;
            setOrs(orData || []);
            if (orData && orData.length > 0) setSelectedOrId(orData[0].id);

            // 2. Fetch Surgeries in range
            let query = supabase
                .from('surgeries')
                .select('*, patients(full_name), doctors!doctor_id(full_name), surgery_materials(id), patient_unable_to_attend, is_guardia')
                .or(`surgery_date.gte.${startStr},surgery_date.is.null`) // Include unscheduled
                .or(`surgery_date.lte.${endStr},surgery_date.is.null`);

            if (user?.role === 'Medico' && user.doctorId) {
                // query = query.eq('doctor_id', user.doctorId); // REMOVED: Now we fetch all to show 'Busy' slots
            }
            if (user?.role === 'Ortopedia' && user.vendorId) {
                // query = query.eq('vendor_id', user.vendorId); // REMOVED: Now we fetch all to show 'Busy' slots
            }

            const { data: surgeryData, error: surError } = await query
                .select('*, patients(full_name), doctors!doctor_id(full_name), surgery_materials(id), patient_unable_to_attend, is_guardia, suggested_date')
                .order('surgery_date', { ascending: true })
                .order('start_time', { ascending: true });
            if (surError) throw surError;

            // 3. Fetch active reschedule alerts
            const { data: alerts } = await supabase
                .from('system_alerts')
                .select('surgery_id')
                .eq('type', 'Solicitud Reprogramación')
                .eq('status', 'Active');

            const alertIds = new Set((alerts || []).map(a => a.surgery_id));

            // --- Robust Join Support (Helper) ---
            const getFullName = (obj: any) => {
                if (!obj) return undefined;
                if (Array.isArray(obj)) return obj[0]?.full_name;
                return obj.full_name;
            };

            // --- AUTO-TRANSITION LOGIC REMOVED (Manual Control Only) ---

            // Map and Sanitize Data
            const processedSurgeryData = (surgeryData || []).map((s: any) => {
                // Sanitize Relations
                const patientName = getFullName(s.patients);
                const doctorName = getFullName(s.doctors);

                const normalizedS = {
                    ...s,
                    patients: { full_name: patientName },
                    doctors: { full_name: doctorName }
                };

                return normalizedS;
            });
            // ----------------------------------------

            // 3. Fetch Document categories only for these surgeries
            const surgeryIds = processedSurgeryData.map(s => s.id);
            let docData: any[] = [];
            if (surgeryIds.length > 0) {
                const { data, error: docError } = await supabase
                    .from('surgery_documents')
                    .select('surgery_id, category')
                    .in('surgery_id', surgeryIds);
                if (docError) throw docError;
                docData = data || [];
            }

            // Map documents to surgery IDs
            const surgeryDocsMap: Record<string, string[]> = {};
            (docData || []).forEach(doc => {
                if (!surgeryDocsMap[doc.surgery_id]) surgeryDocsMap[doc.surgery_id] = [];
                surgeryDocsMap[doc.surgery_id].push(doc.category);
            });

            // Get ART names for blocking and prioritization
            let artNames: string[] = [];
            const { data: artCoverages } = await supabase
                .from('coverages')
                .select('name')
                .eq('type', 'ART');
            artNames = artCoverages?.map(c => c.name) || [];

            const scheduled: CalendarEvent[] = [];
            const pending: PendingSurgery[] = [];

            (processedSurgeryData || []).forEach(s => {
                const patient = s.patients;
                const doctor = s.doctors;
                const isDoctorRole = user?.role === 'Medico';
                const isOrtopediaRole = user?.role === 'Ortopedia';
                const isArtRole = user?.role === 'Oficina ART';
                const isOwningDoctor = s.doctor_id === user?.doctorId;
                const isOwningVendor = s.vendor_id === user?.vendorId;
                const isOwner = user?.role === 'SuperAdmin' ||
                    user?.role === 'Direccion' ||
                    user?.role === 'Internacion' ||
                    user?.role === 'Tecnico' ||
                    (user?.role === 'Medico' && s.doctor_id === user.doctorId) ||
                    (user?.role === 'Anestesista' && s.anesthesiologist_id === user.doctorId) ||
                    (user?.role === 'Ortopedia' && s.vendor_id === user.vendorId);
                const isArtSurgery = s.medical_coverage && artNames.includes(s.medical_coverage);
                const isBlocked = (isDoctorRole && !isOwningDoctor) || (isOrtopediaRole && !isOwningVendor) || (isArtRole && !isArtSurgery);

                const docs = surgeryDocsMap[s.id] || [];

                // --- Refined Documentation Alert Logic ---
                const missingDocs: string[] = [];
                if (!patient?.full_name) missingDocs.push('Nombre');
                if (!s.medical_coverage) missingDocs.push('Prestador');
                if (!s.authorization_date) missingDocs.push('Autorización');

                const hasExams = s.pre_op_date || docs.includes('studies');
                if (!hasExams) missingDocs.push('Exámenes');

                const hasConsent = s.consent_signed || docs.includes('consent');
                if (!hasConsent) missingDocs.push('Consentimiento');

                const hasAllDocs = missingDocs.length === 0;
                const orthoValidated = s.ortho_validated || false;
                const needsOrthoValidation = s.requires_prosthesis || (s.surgery_materials && s.surgery_materials.length > 0);

                // Color logic for calendar - PRIORITY: COMPLETADA (Emerald)
                let eventColor = 'bg-emerald-500'; // Default: Listo OK

                if (s.surgery_date && s.status !== 'suspended') {
                    // Check for completion or past time
                    const now = new Date();
                    const [h, m] = s.start_time ? s.start_time.split(':').map(Number) : [7, 0];
                    const [year, month, day] = s.surgery_date.split('-').map(Number);
                    const startDate = new Date(year, month - 1, day, h, m, 0, 0);
                    const endDate = new Date(startDate);
                    endDate.setMinutes(startDate.getMinutes() + (s.estimated_duration || 60));

                    const isPast = endDate < now;
                    const hasRealEndTime = !!s.real_end_time;
                    const isFinished = s.status === 'completed' || isPast || hasRealEndTime;

                    if (isFinished) {
                        eventColor = 'bg-violet-800'; // Past/Completed: Dark Violet
                    } else if (s.is_guardia) {
                        eventColor = 'bg-rose-500'; // Guardia: Rose (Distinct)
                    } else if (needsOrthoValidation && !orthoValidated) {
                        eventColor = 'bg-red-500'; // Critical: No materials
                    } else if (!hasAllDocs) {
                        eventColor = 'bg-orange-500'; // Alert: Missing critical docs
                    }

                    const hasTime = !!s.start_time;
                    // Already calculated h, m above
                    // let h = 0, m = 0; // Removed local redeclaration

                    // Already calculated startDate, endDate above
                    // const [year, month, day] = s.surgery_date.split('-').map(Number);
                    // const startDate = new Date(year, month - 1, day, h, m, 0, 0);

                    // const endDate = new Date(startDate);
                    // endDate.setMinutes(startDate.getMinutes() + (s.estimated_duration || 60));

                    let displayTitle = s.procedure_name || 'Cirugía sin nombre';
                    if (isBlocked) {
                        const docName = doctor?.full_name || 'Colega';
                        displayTitle = (isOrtopediaRole || isArtRole) ? 'Ocupado' : `Ocupado - ${docName}`;
                    }

                    if (isBlocked) {
                        eventColor = 'bg-slate-400';
                    }

                    scheduled.push({
                        id: s.id,
                        title: displayTitle,
                        start: startDate,
                        end: endDate,
                        color: eventColor,
                        icon: isBlocked ? 'lock' : 'medical_services',
                        completed: s.status === 'completed',
                        suspended: false,
                        orId: s.operating_room_id,
                        isBlocked: isBlocked,
                        originalDoctor: doctor?.full_name,
                        doctorId: s.doctor_id,
                        patientName: patient?.full_name,
                        patientAvailableFrom: s.patient_available_from,
                        orthoValidated,
                        needsOrthoValidation,
                        hasAllDocs,
                        missingDocs,
                        authDate: s.authorization_date,
                        isTimeTBD: !hasTime,
                        patientUnableToAttend: s.patient_unable_to_attend,
                        hasPendingReschedule: alertIds.has(s.id),
                        suggestedDate: s.suggested_date,
                        medicalCoverage: s.medical_coverage,
                        isGuardia: s.is_guardia,
                        internacionNotified: s.internacion_notified
                    });

                } else if (s.status === 'suspended' || !s.surgery_date) {
                    if (!isBlocked) {
                        // Completeness Score: Material (3 points) + each non-missing critical item (1 point)
                        const totalCriticalItems = 5; // Nombre, Cobertura, Autorización, Exámenes, Consentimiento
                        let score = (orthoValidated ? 3 : 0);
                        score += (totalCriticalItems - missingDocs.length);

                        pending.push({
                            id: s.id,
                            name: patient?.full_name || 'Paciente Desconocido',
                            proc: s.procedure_name || 'Proc. Desconocido',
                            doctor: doctor?.full_name || 'Dr. Desconocido',
                            duration: s.estimated_duration || 60,
                            color: s.status === 'suspended' ? 'bg-amber-500' : (hasAllDocs && (orthoValidated || !needsOrthoValidation) ? 'bg-emerald-500' : 'bg-blue-500'),
                            status: s.status,
                            orthoValidated,
                            needsOrthoValidation,
                            hasAllDocs,
                            missingDocs,
                            priority: s.priority || 'elective',
                            completenessScore: score,
                            doctorPriorityValidated: s.doctor_priority_validated || false,
                            requiresProsthesis: s.requires_prosthesis || false,
                            createdAt: s.created_at,
                            authDate: s.authorization_date,
                            doctorId: s.doctor_id,
                            patientName: patient?.full_name,
                            patientAvailableFrom: s.patient_available_from,
                            patientUnableToAttend: s.patient_unable_to_attend,
                            isArt: s.medical_coverage && artNames.includes(s.medical_coverage),
                            hasPendingReschedule: alertIds.has(s.id),
                            suggestedDate: s.suggested_date,
                            medicalCoverage: s.medical_coverage,
                            isGuardia: s.is_guardia
                        });
                    }
                }
            });

            // Sort scheduled by time, then patient name
            scheduled.sort((a, b) => {
                const timeDiff = a.start.getTime() - b.start.getTime();
                if (timeDiff !== 0) return timeDiff;
                return (a.patientName || '').localeCompare(b.patientName || '');
            });

            // Sort pending by ART priority first, then completeness score (desc)
            pending.sort((a, b) => {
                if (a.isArt && !b.isArt) return -1;
                if (!a.isArt && b.isArt) return 1;
                return b.completenessScore - a.completenessScore;
            });

            setEvents(scheduled);
            setPendingSurgeries(pending);
        } catch (err) {
            console.error('Error loading calendar data:', err);
        } finally {
            setLoading(false);
        }
    };

    // -- Helpers --
    const selectedSurgery = useMemo(() =>
        pendingSurgeries.find(p => p.id === selectedPendingId),
        [selectedPendingId, pendingSurgeries]);

    const generateTimeSlots = (date: Date, orId: string) => {
        const slots = [];
        const selectedOR = ors.find((o: OperatingRoom) => o.id === orId);
        const startHour = selectedOR?.start_time ? parseInt(selectedOR.start_time.split(':')[0]) : 7;
        const endHour = 21; // Extended to allow later surgeries if start is later

        const dayEvents = events.filter(e =>
            e.start.getDate() === date.getDate() &&
            e.start.getMonth() === date.getMonth() &&
            e.orId === orId
        );

        for (let h = startHour; h < endHour; h++) {
            for (let m = 0; m < 60; m += 30) {
                const timeString = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
                const slotDate = new Date(date);
                slotDate.setHours(h, m, 0, 0);

                const isBusy = dayEvents.some(ev => {
                    return slotDate >= ev.start && slotDate < ev.end;
                });

                slots.push({ time: timeString, busy: isBusy });
            }
        }
        return slots;
    };

    const availableSlots = useMemo(() => {
        if (!modalDate) return [];
        return generateTimeSlots(modalDate, selectedOrId);
    }, [modalDate, selectedOrId, events]);

    // -- Navigation Handlers --
    const handlePrev = () => {
        const newDate = new Date(currentDate);
        if (view === 'month') newDate.setMonth(newDate.getMonth() - 1);
        if (view === 'week') newDate.setDate(newDate.getDate() - 7);
        if (view === 'day') newDate.setDate(newDate.getDate() - 1);
        setCurrentDate(newDate);
    };

    const handleNext = () => {
        const newDate = new Date(currentDate);
        if (view === 'month') newDate.setMonth(newDate.getMonth() + 1);
        if (view === 'week') newDate.setDate(newDate.getDate() + 7);
        if (view === 'day') newDate.setDate(newDate.getDate() + 1);
        setCurrentDate(newDate);
    };

    const handleToday = () => setCurrentDate(new Date());

    // -- Modal Logic --
    const openScheduleModal = (date: Date, hour?: number) => {
        setModalDate(date);
        if (ors.length > 0) setSelectedOrId(ors[0].id);
        setSelectedPendingId(null);

        if (hour !== undefined) {
            const timeStr = `${hour.toString().padStart(2, '0')}:00`;
            setSelectedTimeSlot(timeStr);
        } else {
            setSelectedTimeSlot(null);
        }

        setShowModal(true);
    };

    const handleConfirmSchedule = async () => {
        if (!modalDate || !selectedTimeSlot || !selectedPendingId) return;

        // Validation: Ortho (Bypass if emergency or doesn't need materials)
        const pending = pendingSurgeries.find(p => p.id === selectedPendingId);
        const isEmergency = pending?.priority === 'emergency';
        if (pending && pending.needsOrthoValidation && !pending.orthoValidated && !isEmergency) {
            alert('⚠️ No se puede programar: Esta cirugía requiere materiales y no ha sido validada por Ortopedia.');
            return;
        }

        const year = modalDate.getFullYear();
        const month = (modalDate.getMonth() + 1).toString().padStart(2, '0');
        const day = modalDate.getDate().toString().padStart(2, '0');
        const surgeryDateStr = `${year}-${month}-${day}`;

        // --- AUTHORIZATION DATE VALIDATION (REMOVED v1.1.13) ---
        // if (!pending.authDate) {
        //     alert('⚠️ No se puede agendar: Esta cirugía no cuenta con fecha de autorización definida.');
        //     return;
        // }

        if (pending && pending.authDate && surgeryDateStr < (pending.authDate as string)) {
            alert('⚠️ Error: La fecha de la cirugía no puede ser anterior a la fecha de autorización.');
            return;
        }

        // --- PATIENT AVAILABILITY VALIDATION ---
        if (pending && pending.patientAvailableFrom && surgeryDateStr < pending.patientAvailableFrom) {
            alert(`⚠️ Error: El paciente solo está disponible a partir del ${pending.patientAvailableFrom}. No se puede agendar para el ${surgeryDateStr}.`);
            return;
        }

        const [h, m] = selectedTimeSlot.split(':').map(Number);
        const newStart = new Date(modalDate);
        newStart.setHours(h, m, 0, 0);

        // --- PATIENT AVAILABILITY VALIDATION ---
        if (pending && pending.patientAvailableFrom && surgeryDateStr < pending.patientAvailableFrom) {
            alert(`⚠️ Error: El paciente solo está disponible a partir del ${pending.patientAvailableFrom}. No se puede agendar para el ${surgeryDateStr}.`);
            return;
        }

        const isTecnico = user?.role === 'Tecnico';

        // --- CASCADE DISPLACEMENT LOGIC ---
        // Get all events for this Day and this OR
        const allDayEvents = events.filter(e => e.orId === selectedOrId && isSameDate(e.start, modalDate));
        const durationMinutes = pending?.duration || 60;

        // Use our existing displacement calculator
        const updates = calculateDisplacement(allDayEvents, selectedPendingId, newStart, durationMinutes);

        const confirmMsg = updates.length > 1
            ? `Se agendará la cirugía y se desplazarán ${updates.length - 1} cirugías posteriores. ¿Confirmar?`
            : `¿Confirmar programación para el ${surgeryDateStr} a las ${selectedTimeSlot}?`;

        if (confirm(confirmMsg)) {
            try {
                setLoading(true);

                // Perform all updates (including the new one)
                await Promise.all(updates.map(async (u) => {
                    const timeStr = `${u.start.getHours().toString().padStart(2, '0')}:${u.start.getMinutes().toString().padStart(2, '0')}`;
                    const targetDateStr = `${u.start.getFullYear()}-${(u.start.getMonth() + 1).toString().padStart(2, '0')}-${u.start.getDate().toString().padStart(2, '0')}`;

                    const { error } = await supabase
                        .from('surgeries')
                        .update({
                            surgery_date: targetDateStr,
                            start_time: timeStr,
                            operating_room_id: selectedOrId,
                            status: 'scheduled',
                            or_validated: isTecnico,
                            or_validation_date: isTecnico ? new Date().toISOString() : null,
                            or_validated_by_name: isTecnico ? (user?.name || 'Personal Quirófano') : null
                        })
                        .eq('id', u.id);

                    if (error) throw error;

                    // Trigger Alert for Doctor
                    const evData = u.id === selectedPendingId ? pending : allDayEvents.find(e => e.id === u.id);
                    if (evData?.doctorId) {
                        const isOriginal = u.id === selectedPendingId;
                        await createOrUpdateDoctorAlert({
                            surgeryId: u.id,
                            doctorId: evData.doctorId,
                            title: isOriginal ? 'Cirugía Programada' : 'Agenda Desplazada',
                            message: isOriginal
                                ? `Su cirugía para ${evData.patientName || 'Paciente'} ha sido programada para el ${targetDateStr} a las ${timeStr} en ${ors.find(o => o.id === selectedOrId)?.name}.`
                                : `Su cirugía de ${evData.patientName || 'N/A'} ha sido desplazada a las ${timeStr} debido a reordenamiento de la agenda.`,
                            severity: targetDateStr === new Date().toISOString().split('T')[0] ? 'Urgent' : 'Warning',
                            type: isOriginal ? 'schedule_change' : 'displacement',
                            patientName: evData.patientName
                        });
                    }
                }));

                supabase.from('audit_logs').insert({
                    user_name: user?.name || 'Sistema',
                    user_role: user?.role,
                    action: 'UPDATE',
                    resource: 'Cirugía',
                    resource_id: selectedPendingId,
                    description: `Cirugía agendada/reprogramada desde el calendario (Modal) con Cascade Displacement. ${updates.length - 1} desplazadas.`,
                    meta: { source: 'CalendarModal' }
                }).then(({ error: auditError }) => {
                    if (auditError) console.warn('Silent Audit Error:', auditError);
                });

                await fetchInitialData();
                setShowModal(false);
            } catch (err) {
                console.error('Error scheduling surgery:', err);
                alert('Error al agendar la cirugía.');
            } finally {
                setLoading(false);
            }
        }
    };

    const getHeaderTitle = () => {
        const options: Intl.DateTimeFormatOptions = { month: 'long', year: 'numeric' };
        if (view === 'day') options.day = 'numeric';
        return new Intl.DateTimeFormat('es-ES', options).format(currentDate);
    };

    const isSameDate = (d1: Date, d2: Date) =>
        d1.getDate() === d2.getDate() &&
        d1.getMonth() === d2.getMonth() &&
        d1.getFullYear() === d2.getFullYear();

    const isFutureOrToday = (date: Date) => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const target = new Date(date);
        target.setHours(0, 0, 0, 0);
        return target >= today;
    };

    const MonthView = () => {
        const year = currentDate.getFullYear();
        const month = currentDate.getMonth();
        const firstDayOfMonth = new Date(year, month, 1).getDay();
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const paddingDays = Array.from({ length: firstDayOfMonth }, (_, i) => i);
        const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);
        const weekDays = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

        return (
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 h-auto flex flex-col min-h-[600px]">
                <div className="grid grid-cols-7 border-b border-slate-200">
                    {weekDays.map((d) => (
                        <div key={d} className="py-3 text-center text-sm font-semibold text-slate-500 uppercase tracking-wider">
                            {d}
                        </div>
                    ))}
                </div>
                <div className="grid grid-cols-7 auto-rows-min divide-x divide-y divide-slate-100 min-h-0 pb-10">
                    {paddingDays.map(i => (
                        <div key={`pad-${i}`} className="bg-slate-50/50"></div>
                    ))}
                    {days.map((d) => {
                        const dayDate = new Date(year, month, d);
                        const isToday = isSameDate(dayDate, new Date());
                        const dayEvents = events
                            .filter(e => isSameDate(e.start, dayDate))
                            .sort((a, b) => a.start.getTime() - b.start.getTime());
                        const canAdd = isFutureOrToday(dayDate);

                        return (
                            <div
                                key={d}
                                onClick={() => {
                                    setCurrentDate(dayDate);
                                    setPreviousView('month');
                                    setView('day');
                                }}
                                className={`p-2 hover:bg-slate-50 transition-colors relative group/cell min-h-[100px] cursor-pointer ${(() => {
                                    const dateStr = `${year}-${(month + 1).toString().padStart(2, '0')}-${d.toString().padStart(2, '0')}`;
                                    return holidays[dateStr] ? 'bg-red-50/30' : '';
                                })()}`}
                            >
                                <div className="flex justify-between items-start">
                                    <span className={`text-sm font-bold ${isToday ? 'flex size-7 items-center justify-center rounded-full bg-primary text-white shadow-md' : 'text-slate-900'}`}>
                                        {d}
                                    </span>
                                    {(() => {
                                        const dateStr = `${year}-${(month + 1).toString().padStart(2, '0')}-${d.toString().padStart(2, '0')}`;
                                        const holidayTitle = holidays[dateStr];
                                        if (holidayTitle) {
                                            return (
                                                <div className="flex flex-col items-end">
                                                    <span className="text-[7px] font-black text-white bg-red-500 px-1 py-0.5 rounded uppercase tracking-tighter" title={holidayTitle}>
                                                        FERIADO
                                                    </span>
                                                    <span className="text-[6px] text-red-600 font-bold truncate max-w-[60px]" title={holidayTitle}>
                                                        {holidayTitle}
                                                    </span>
                                                </div>
                                            );
                                        }
                                        return null;
                                    })()}
                                </div>
                                <div className="mt-2 flex flex-col gap-1">
                                    {dayEvents.map(ev => (
                                        <div key={ev.id} className="group relative w-full">
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    if (!ev.isBlocked) navigate(`/detail/${ev.id}`);
                                                }}
                                                className={`w-full text-left ${ev.color} text-white px-2 py-1 rounded text-[10px] font-bold truncate shadow-xs flex items-center justify-between transition-all ${ev.isBlocked ? 'cursor-not-allowed opacity-80' : 'hover:brightness-110'}`}
                                            >
                                                <span className="truncate flex items-center gap-0.5">
                                                    {ev.patientUnableToAttend && <span className="material-symbols-outlined text-[10px] text-red-200 animate-pulse">person_off</span>}
                                                    {ev.hasPendingReschedule && <span className="material-symbols-outlined text-[10px] text-amber-200 animate-pulse">event_repeat</span>}
                                                    {((user?.role === 'Internacion' || user?.role === 'SuperAdmin') && ev.internacionNotified === false) && <span className="material-symbols-outlined text-[16px] text-yellow-300 animate-bounce mr-1 drop-shadow-[0_0_5px_rgba(0,0,0,0.8)] scale-125 align-middle" title="Cirugía Nueva">fiber_new</span>}
                                                    {ev.isTimeTBD ? 'H. Pend.' : `${ev.start.getHours().toString().padStart(2, '0')}:${ev.start.getMinutes().toString().padStart(2, '0')}`} {(ev.patientUnableToAttend || ev.hasPendingReschedule) && "[!] "}{ev.title}
                                                </span>
                                                {/* Show doctor surname (assuming 'Surname Name' format, take first word) */}
                                                {ev.isBlocked && ev.originalDoctor && <span className="text-[8px] opacity-75 ml-1">{ev.originalDoctor.split(' ')[0]}</span>}
                                            </button>

                                            {/* Premium Tooltip */}
                                            {!ev.isBlocked && (
                                                <div className="premium-tooltip">
                                                    <div className="flex flex-col gap-1.5">
                                                        <div className="border-b border-white/10 pb-1.5 mb-1">
                                                            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-0.5">Paciente</p>
                                                            <p className="text-[13px] font-black text-white leading-tight">{ev.patientName || 'N/A'}</p>
                                                        </div>
                                                        <div className="grid grid-cols-2 gap-2">
                                                            <div>
                                                                <p className="text-[9px] text-slate-400 font-bold uppercase mb-0.5">Cobertura</p>
                                                                <p className="text-[10px] font-bold text-blue-200">{ev.medicalCoverage || 'Particular'}</p>
                                                            </div>
                                                            <div>
                                                                <p className="text-[9px] text-slate-400 font-bold uppercase mb-0.5">Médico</p>
                                                                <p className="text-[10px] font-bold text-white/90">{ev.originalDoctor?.split(' ').slice(0, 2).join(' ') || 'N/A'}</p>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                                {canAdd && (user?.role === 'Tecnico' || user?.role === 'SuperAdmin' || user?.role === 'Internacion') && (
                                    <button
                                        onClick={(e) => { e.stopPropagation(); openScheduleModal(dayDate); }}
                                        className="absolute top-2 right-2 opacity-0 group-hover/cell:opacity-100 p-1 text-primary hover:bg-blue-50 rounded transition-opacity"
                                    >
                                        <span className="material-symbols-outlined text-lg">add_circle</span>
                                    </button>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>
        );
    };

    const WeekView = () => {
        const startOfWeek = new Date(currentDate);
        startOfWeek.setDate(currentDate.getDate() - currentDate.getDay());
        const weekDates = Array.from({ length: 7 }, (_, i) => {
            const d = new Date(startOfWeek);
            d.setDate(d.getDate() + i);
            return d;
        });
        const hours = Array.from({ length: 13 }, (_, i) => i + 7);

        // -- Current Time Indicator Logic --
        const [now, setNow] = useState(new Date());
        useEffect(() => {
            const timer = setInterval(() => setNow(new Date()), 60000);
            return () => clearInterval(timer);
        }, []);

        const isCurrentWeek = weekDates.some(d => isSameDate(d, now));
        const currentTimeTop = ((now.getHours() - 7) * 80) + ((now.getMinutes() / 60) * 80);

        return (
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 h-full flex flex-col overflow-hidden relative">
                {/* Scrollable Container */}
                <div className="flex-1 overflow-auto no-scrollbar relative pb-24">
                    <div className="min-w-[800px] lg:min-w-full relative">
                        {/* Sticky Header Row */}
                        <div className="sticky top-0 z-30 grid grid-cols-[60px_1fr] divide-x divide-slate-200 bg-slate-50 border-b border-slate-200 shadow-sm">
                            <div className="p-3 text-center text-[9px] font-black text-slate-400 uppercase flex items-center justify-center bg-slate-50 sticky left-0 z-40 border-r border-slate-200">
                                Hora
                            </div>
                            <div className="grid grid-cols-7 divide-x divide-slate-100">
                                {weekDates.map((date, i) => {
                                    const isToday = isSameDate(date, now);
                                    return (
                                        <div
                                            key={i}
                                            onClick={() => {
                                                setCurrentDate(date);
                                                setPreviousView('week');
                                                setView('day');
                                            }}
                                            className={`p-2 text-center cursor-pointer hover:bg-slate-100 transition-colors ${isToday ? 'bg-primary/5' : ''}`}
                                        >
                                            <div className={`text-[10px] font-black uppercase tracking-tighter ${isToday ? 'text-primary' : 'text-slate-500'}`}>
                                                {date.toLocaleDateString('es-ES', { weekday: 'short' })}
                                            </div>
                                            <div className="flex flex-col items-center">
                                                <div className={`text-base font-black leading-none mt-0.5 ${isToday ? 'text-primary' : 'text-slate-900'}`}>
                                                    {date.getDate()}
                                                </div>
                                                {(() => {
                                                    const dateStr = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')}`;
                                                    if (holidays[dateStr]) {
                                                        return <span className="text-[7px] font-black text-red-600 bg-red-50 px-1 rounded border border-red-100 mt-1 uppercase tracking-tighter">FERIADO</span>;
                                                    }
                                                    return null;
                                                })()}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Grid Body */}
                        <div className="grid grid-cols-[60px_1fr] divide-x divide-slate-200 relative">
                            {/* Sticky Time Column */}
                            <div className="bg-slate-50/80 backdrop-blur-sm sticky left-0 z-20 border-r border-slate-200">
                                {hours.map(h => (
                                    <div key={h} className="h-20 border-b border-slate-100 text-right pr-2 pt-1 text-[9px] text-slate-400 font-black font-mono">
                                        {h.toString().padStart(2, '0')}:00
                                    </div>
                                ))}
                            </div>

                            {/* Days Columns */}
                            <div className="grid grid-cols-7 divide-x divide-slate-100 relative">
                                {isCurrentWeek && now.getHours() >= 7 && now.getHours() <= 19 && (
                                    <div
                                        className="absolute left-0 right-0 h-[2px] bg-red-500 z-30 pointer-events-none shadow-[0_0_8px_rgba(239,68,68,0.5)] flex items-center"
                                        style={{ top: `${currentTimeTop}px` }}
                                    >
                                        <div className="size-1.5 rounded-full bg-red-500 absolute -left-0.75"></div>
                                    </div>
                                )}

                                {weekDates.map((date, i) => {
                                    const canAdd = isFutureOrToday(date) && (user?.role === 'Tecnico' || user?.role === 'SuperAdmin' || user?.role === 'Internacion');
                                    const dayEvents = events.filter(e => isSameDate(e.start, date));

                                    // -- Side-by-Side Overlap Calculation --
                                    const sortedEvents = [...dayEvents].sort((a, b) => a.start.getTime() - b.start.getTime());
                                    const renderedEvents: any[] = [];

                                    sortedEvents.forEach(ev => {
                                        const overlaps = renderedEvents.filter(re =>
                                            (ev.start < re.end && ev.end > re.start)
                                        );

                                        const column = overlaps.length;
                                        const totalInGroup = overlaps.length + 1; // Simple approach: just increment

                                        renderedEvents.push({
                                            ...ev,
                                            column,
                                            totalInGroup: 1 // We'll refine this if needed, for now just 1
                                        });
                                    });

                                    return (
                                        <div key={i} className="relative group/col h-full bg-white">
                                            {hours.map(h => (
                                                <div
                                                    key={h}
                                                    onClick={() => canAdd && openScheduleModal(date, h)}
                                                    className={`h-20 border-b border-slate-100 relative group/cell ${canAdd ? 'hover:bg-slate-50/40 cursor-pointer' : ''}`}
                                                ></div>
                                            ))}
                                            {dayEvents.map(ev => {
                                                const startHour = ev.start.getHours();
                                                const startMin = ev.start.getMinutes();
                                                const durationMin = (ev.end.getTime() - ev.start.getTime()) / 60000;
                                                const topOffset = ((startHour - 7) * 80) + ((startMin / 60) * 80);
                                                const height = (durationMin / 60) * 80;

                                                if (startHour < 7 || startHour > 19) return null;

                                                return (
                                                    <button
                                                        key={ev.id}
                                                        style={{
                                                            top: `${topOffset}px`,
                                                            height: `${height}px`,
                                                            minHeight: '20px',
                                                        }}
                                                        className={`absolute left-0.5 right-0.5 rounded border border-white/20 shadow-sm z-10 flex flex-col p-1 overflow-hidden transition-all hover:z-20 hover:scale-[1.02] cursor-pointer ${ev.color.replace('text-', 'bg-').replace('ring-', 'bg-') || 'bg-slate-400'}`}
                                                        onClick={(e) => { e.stopPropagation(); navigate(`/detail/${ev.id}`); }}
                                                    >
                                                        <div className="w-full flex justify-between items-center mb-0.5">
                                                            <span className="font-mono opacity-90 text-[8px] lg:text-[9px] flex items-center gap-0.5">
                                                                <span className="material-symbols-outlined text-[10px]">schedule</span>
                                                                 {startHour.toString().padStart(2, '0')}:{startMin.toString().padStart(2, '0')}
                                                            </span>
                                                            {ev.isBlocked && <span className="material-symbols-outlined text-[10px]">lock</span>}
                                                        </div>
                                                        <span className="leading-tight text-left line-clamp-2 uppercase tracking-tighter flex items-center gap-1">
                                                            {ev.patientUnableToAttend && <span className="material-symbols-outlined text-[12px] animate-pulse">person_off</span>}
                                                            {ev.hasPendingReschedule && <span className="material-symbols-outlined text-[12px] text-amber-300 animate-pulse">event_repeat</span>}
                                                            {(user?.role === 'Internacion' || user?.role === 'SuperAdmin') && ev.internacionNotified === false && <span className="material-symbols-outlined text-[32px] text-cyan-500 animate-bounce drop-shadow-[0_0_15px_rgba(6,182,212,0.8)] font-black" title="Cirugía Nueva para Internación">fiber_new</span>}
                                                            {(ev.patientUnableToAttend || ev.hasPendingReschedule) && "[!] "}{ev.title}
                                                        </span>
                                                        {!ev.isBlocked && ev.originalDoctor && (
                                                            <span className="text-[8px] lg:text-[9px] opacity-80 mt-auto font-medium truncate w-full pt-1 border-t border-white/10 uppercase">
                                                                {ev.originalDoctor.split(' ').slice(0, 2).join(' ')}
                                                            </span>
                                                        )}

                                                        {/* Premium Tooltip */}
                                                        {!ev.isBlocked && (
                                                            <div className="premium-tooltip !normal-case text-left">
                                                                <div className="flex flex-col gap-1.5">
                                                                    <div className="border-b border-white/10 pb-1.5 mb-1">
                                                                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-0.5">Paciente</p>
                                                                        <p className="text-[13px] font-black text-white leading-tight">{ev.patientName || 'N/A'}</p>
                                                                    </div>
                                                                    <div className="grid grid-cols-2 gap-2">
                                                                        <div>
                                                                            <p className="text-[9px] text-slate-400 font-bold uppercase mb-0.5">Cobertura</p>
                                                                            <p className="text-[10px] font-bold text-blue-200">{ev.medicalCoverage || 'Particular'}</p>
                                                                        </div>
                                                                        <div>
                                                                            <p className="text-[9px] text-slate-400 font-bold uppercase mb-0.5">Médico</p>
                                                                            <p className="text-[10px] font-bold text-white/90">{ev.originalDoctor?.split(' ').slice(0, 2).join(' ') || 'N/A'}</p>
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        )}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        );
    };

    const DayView = () => {
        const hours = Array.from({ length: 13 }, (_, i) => i + 7);
        const canAdd = isFutureOrToday(currentDate) && (user?.role === 'Tecnico' || user?.role === 'SuperAdmin' || user?.role === 'Internacion');

        const dayEvents = events.filter(e => isSameDate(e.start, currentDate));
        const roomEvents = dayEvents.filter(e => e.orId === selectedDayOrId).sort((a, b) => a.start.getTime() - b.start.getTime());

        return (
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 h-full flex flex-col overflow-hidden max-w-4xl mx-auto w-full">
                {/* Header with Back Button (if navigated from month/week) */}
                {(previousView === 'month' || previousView === 'week') && (
                    <div className="px-4 py-2 bg-slate-100 border-b border-slate-200 flex items-center justify-between">
                        <button
                            onClick={() => {
                                setView(previousView);
                                setPreviousView(null);
                            }}
                            className="flex items-center gap-1 text-xs font-black text-slate-600 hover:text-slate-900 transition-colors"
                        >
                            <span className="material-symbols-outlined text-sm">arrow_back</span>
                            VOLVER AL {previousView === 'month' ? 'MES' : 'SEMANA'}
                        </button>
                    </div>
                )}

                {/* Room Selector Tab Bar */}
                <div className="flex overflow-x-auto gap-1 p-2 bg-slate-50 border-b border-slate-200 no-scrollbar">
                    {ors.map(or => (
                        <button
                            key={or.id}
                            onClick={() => setSelectedDayOrId(or.id)}
                            className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest whitespace-nowrap transition-all border ${selectedDayOrId === or.id
                                ? 'bg-primary border-primary text-white shadow-md shadow-primary/20'
                                : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'
                                }`}
                        >
                            {or.name}
                        </button>
                    ))}
                </div>

                {!isMobile ? (
                    /* DESKTOP GRID VIEW */
                    <div className="flex-1 overflow-y-auto pb-24">
                        <div className="grid grid-cols-[100px_1fr] divide-x divide-slate-100">
                            <div className="bg-slate-50/50">
                                {hours.map(h => (
                                    <div key={h} className="h-24 border-b border-slate-100 text-right pr-4 pt-2 text-sm text-slate-400 font-bold">
                                        {h}:00
                                    </div>
                                ))}
                            </div>
                            <div className="relative bg-white">
                                {hours.map(h => (
                                    <div
                                        key={h}
                                        className="h-24 border-b border-slate-100 flex flex-col justify-center px-4 transition-all group relative hover:bg-slate-50"
                                    >
                                        {canAdd && (
                                            <button
                                                onClick={() => openScheduleModal(currentDate, h)}
                                                className="opacity-0 group-hover:opacity-100 text-xs text-slate-400 font-bold flex items-center gap-1 hover:text-primary transition-colors"
                                            >
                                                <span className="material-symbols-outlined text-base">add</span> Agendar
                                            </button>
                                        )}
                                    </div>
                                ))}
                                {(() => {
                                    // 1. Group overlapping events
                                    const groups: CalendarEvent[][] = [];
                                    const sortedEvents = [...roomEvents].sort((a, b) => a.start.getTime() - b.start.getTime());

                                    sortedEvents.forEach(event => {
                                        let placed = false;
                                        for (const group of groups) {
                                            // Check if this event overlaps with ANY event in the existing group
                                            if (group.some(e => event.start.getTime() < e.end.getTime() && event.end.getTime() > e.start.getTime())) {
                                                group.push(event);
                                                placed = true;
                                                break;
                                            }
                                        }
                                        if (!placed) groups.push([event]);
                                    });

                                    // 2. Render events with calculated width/left
                                    return groups.flatMap(group => {
                                        // For each group, we need to assign columns to events
                                        const columns: CalendarEvent[][] = [];
                                        group.forEach(event => {
                                            let colIdx = 0;
                                            while (columns[colIdx]?.some(e => event.start.getTime() < e.end.getTime() && event.end.getTime() > e.start.getTime())) {
                                                colIdx++;
                                            }
                                            if (!columns[colIdx]) columns[colIdx] = [];
                                            columns[colIdx].push(event);
                                        });

                                        const maxCols = columns.length;

                                        return group.map(ev => {
                                            const colIdx = columns.findIndex(col => col.includes(ev));
                                            const startHour = ev.start.getHours();
                                            const startMin = ev.start.getMinutes();
                                            const durationMin = (ev.end.getTime() - ev.start.getTime()) / 60000;
                                            const pxPerHour = 96;
                                            const topOffset = ((startHour - 7) * pxPerHour) + ((startMin / 60) * pxPerHour);
                                            const height = (durationMin / 60) * pxPerHour;

                                            const width = 100 / maxCols;
                                            const left = colIdx * width;

                                            return (
                                                <div
                                                    key={ev.id}
                                                    style={{
                                                        top: `${topOffset}px`,
                                                        height: `${height}px`,
                                                        minHeight: '85px',
                                                        left: `${left}%`,
                                                        width: `${width}%`,
                                                        paddingRight: '4px' // Padding between side-by-side cards
                                                    }}
                                                    className={`absolute rounded-xl shadow-md z-10 flex transition-all group/card bg-white border border-slate-200 ${ev.isBlocked ? 'cursor-not-allowed opacity-80' : 'hover:scale-[1.01] hover:shadow-lg hover:z-20'}`}
                                                >
                                                    {/* Colored Strip (Left) */}
                                                    <div className={`w-1.5 h-full shrink-0 ${ev.color.replace('text-', 'bg-').replace('ring-', 'bg-') || 'bg-slate-400'}`}></div>

                                                    {/* Left Side: Info & Navigation */}
                                                    <div
                                                        className="flex-1 p-2 flex flex-col justify-between min-w-0 cursor-pointer hover:bg-slate-50 transition-colors"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            if (!ev.isBlocked) navigate(`/detail/${ev.id}`);
                                                        }}
                                                    >
                                                        <div className="overflow-hidden">
                                                            <div className="flex items-start justify-between gap-1">
                                                                <span className="font-black text-[10px] md:text-sm text-slate-900 leading-tight truncate">
                                                                    {ev.patientUnableToAttend && <span className="material-symbols-outlined text-red-600 animate-pulse text-[10px] md:text-sm align-middle mr-1">person_off</span>}
                                                                    {ev.hasPendingReschedule && <span className="material-symbols-outlined text-amber-500 animate-pulse text-[10px] md:text-sm align-middle mr-1">event_repeat</span>}
                                                                    {ev.title}
                                                                </span>
                                                                {ev.isBlocked && <span className="material-symbols-outlined text-[10px] text-slate-400 shrink-0">lock</span>}
                                                            </div>
                                                            <span className="text-[9px] md:text-[11px] font-bold text-slate-500 flex items-center gap-1 mt-0.5">
                                                                {ev.isTimeTBD ? 'Hora Pendiente' : `${startHour.toString().padStart(2, '0')}:${startMin.toString().padStart(2, '0')} - ${ev.end.getHours().toString().padStart(2, '0')}:${ev.end.getMinutes().toString().padStart(2, '0')}`}
                                                            </span>
                                                        </div>

                                                        {!ev.isBlocked && ev.originalDoctor && maxCols < 3 && ( // Only show doctor if enough space
                                                            <div className="mt-auto pt-1 border-t border-slate-100">
                                                                <p className="text-[9px] md:text-[10px] font-bold text-slate-400 uppercase truncate flex items-center gap-1">
                                                                    <span className="material-symbols-outlined text-[10px]">person</span>
                                                                    {ev.originalDoctor.split(' ').slice(0, 2).join(' ')}
                                                                </p>
                                                            </div>
                                                        )}
                                                    </div>

                                                    {/* Right Side: Controls */}
                                                    <div
                                                        className={`border-l border-slate-100 bg-slate-50/50 flex flex-col items-center justify-center gap-1 p-1 shrink-0 cursor-default ${maxCols > 2 ? 'w-[20px]' : 'w-[30%] min-w-[30px] max-w-[100px]'}`}
                                                        onClick={(e) => e.stopPropagation()}
                                                    >
                                                        {maxCols <= 2 && (
                                                            <div className={`px-1 py-0.5 rounded text-[7px] font-black uppercase tracking-tighter text-white text-center w-full truncate ${ev.color}`}>
                                                                {ev.completed ? 'REALIZADA' : ev.suspended ? 'SUSPENDIDA' : 'PROG.'}
                                                            </div>
                                                        )}

                                                        {canDrag && !ev.isBlocked && (
                                                            <div className="flex-1 flex flex-col justify-center gap-1 w-full h-full">
                                                                <button
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        const idx = roomEvents.findIndex(item => item.id === ev.id);
                                                                        handleBackToBackReorder(roomEvents, ev.id, idx - 1);
                                                                    }}
                                                                    className="flex-1 bg-white border border-slate-200 hover:bg-blue-50 hover:text-blue-600 rounded-md flex items-center justify-center transition-all shadow-sm"
                                                                >
                                                                    <span className="material-symbols-outlined text-base">expand_less</span>
                                                                </button>
                                                                <button
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        const idx = roomEvents.findIndex(item => item.id === ev.id);
                                                                        handleBackToBackReorder(roomEvents, ev.id, idx + 1);
                                                                    }}
                                                                    className="flex-1 bg-white border border-slate-200 hover:bg-blue-50 hover:text-blue-600 rounded-md flex items-center justify-center transition-all shadow-sm"
                                                                >
                                                                    <span className="material-symbols-outlined text-base">expand_more</span>
                                                                </button>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        });
                                    });
                                })()}
                            </div>
                        </div>
                    </div>
                ) : (
                    /* MOBILE AGENDA VIEW */
                    <div className="flex-1 overflow-y-auto bg-slate-50 p-4 space-y-4 pb-20">
                        {roomEvents.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-20 text-slate-400 gap-4">
                                <span className="material-symbols-outlined text-6xl opacity-20">calendar_today</span>
                                <p className="font-bold text-sm uppercase tracking-widest">Sin cirugías agendadas</p>
                                {canAdd && (
                                    <button onClick={() => openScheduleModal(currentDate)} className="mt-2 px-6 py-2 bg-primary text-white rounded-xl font-black text-xs uppercase tracking-tighter shadow-lg shadow-primary/20">
                                        Agendar Primera
                                    </button>
                                )}
                            </div>
                        ) : (
                            roomEvents.map((ev, idx) => (
                                <div
                                    key={ev.id}
                                    className={`relative bg-white rounded-2xl shadow-sm border border-slate-200 p-3 md:p-4 flex gap-3 md:gap-4 transition-all ${ev.isBlocked ? 'opacity-80 grayscale-[0.5]' : 'active:scale-95'}`}
                                >
                                    {/* Timeline Decorator */}
                                    <div className="flex flex-col items-center gap-1.5 md:gap-2">
                                        <div className="w-14 h-14 md:w-16 md:h-16 rounded-2xl bg-slate-50 flex flex-col items-center justify-center border border-slate-100">
                                            <span className="text-[11px] md:text-xs font-black text-slate-900 leading-none">
                                                {ev.start.getHours().toString().padStart(2, '0')}:{ev.start.getMinutes().toString().padStart(2, '0')}
                                            </span>
                                            <div className="w-3 h-[2px] bg-slate-200 my-1"></div>
                                            <span className="text-[9px] md:text-[10px] font-bold text-slate-400">
                                                {ev.end.getHours().toString().padStart(2, '0')}:{ev.end.getMinutes().toString().padStart(2, '0')}
                                            </span>
                                        </div>
                                        {idx < roomEvents.length - 1 && <div className="w-[1.5px] flex-1 bg-slate-100 rounded-full"></div>}
                                    </div>

                                    {/* Surgery Details */}
                                    <div className="flex-1 min-w-0 flex flex-col justify-between" onClick={() => !ev.isBlocked && navigate(`/detail/${ev.id}`)}>
                                        <div className="overflow-hidden">
                                            <h3 className="font-black text-slate-900 leading-tight mb-0.5 text-sm md:text-base truncate flex items-center gap-1">
                                                {(user?.role === 'Internacion' || user?.role === 'SuperAdmin') && ev.internacionNotified === false && <span className="material-symbols-outlined text-cyan-500 animate-bounce text-4xl md:text-5xl align-middle drop-shadow-[0_0_20px_rgba(6,182,212,0.8)]" title="Cirugía Nueva para Internación">fiber_new</span>}
                                                {ev.patientUnableToAttend && <span className="material-symbols-outlined text-red-600 animate-pulse text-sm md:text-base align-middle">person_off</span>}
                                                {ev.hasPendingReschedule && <span className="material-symbols-outlined text-amber-500 animate-pulse text-sm md:text-base align-middle" title="Solicitud de Reprogramación">event_repeat</span>}
                                                {ev.title}
                                            </h3>
                                            <p className="text-[10px] md:text-[11px] font-bold text-slate-500 uppercase flex items-center gap-1 truncate">
                                                <span className="material-symbols-outlined text-[12px] md:text-[14px]">person</span>
                                                {ev.originalDoctor}
                                                {ev.patientUnableToAttend && <span className="text-red-600 font-black animate-pulse">[!] NO PUEDE ASISTIR</span>}
                                            </p>
                                        </div>

                                        <div className="flex items-center justify-between mt-2 md:mt-3">
                                            {/* Status Badge */}
                                            <div className={`px-2 py-0.5 md:px-3 md:py-1 rounded-full text-[9px] md:text-[10px] font-black uppercase tracking-tighter ${ev.color} text-white`}>
                                                {ev.completed ? 'REALIZADA' : ev.suspended ? 'SUSPENDIDA' : 'PROGRAMADA'}
                                            </div>
                                            {/* Agile Controls (Move Up/Down) */}
                                            {canDrag && !ev.isBlocked && (
                                                <div className="flex gap-1">
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); handleBackToBackReorder(roomEvents, ev.id, idx - 1); }}
                                                        disabled={idx === 0}
                                                        className="size-8 rounded-lg bg-slate-100 flex items-center justify-center text-slate-600 disabled:opacity-30"
                                                    >
                                                        <span className="material-symbols-outlined text-lg">expand_less</span>
                                                    </button>
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); handleBackToBackReorder(roomEvents, ev.id, idx + 1); }}
                                                        disabled={idx === roomEvents.length - 1}
                                                        className="size-8 rounded-lg bg-slate-100 flex items-center justify-center text-slate-600 disabled:opacity-30"
                                                    >
                                                        <span className="material-symbols-outlined text-lg">expand_more</span>
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Status Badge */}
                                    {ev.completed && (
                                        <div className="absolute -top-2 -right-2 size-8 bg-violet-800 rounded-full flex items-center justify-center text-white shadow-lg border-2 border-white">
                                            <span className="material-symbols-outlined text-lg">check</span>
                                        </div>
                                    )}
                                </div>
                            ))
                        )}
                        {canAdd && (
                            <button
                                onClick={() => openScheduleModal(currentDate)}
                                className="w-full py-4 border-2 border-dashed border-slate-200 rounded-2xl flex items-center justify-center gap-2 text-slate-400 hover:text-primary hover:border-primary/50 transition-all font-bold text-sm"
                            >
                                <span className="material-symbols-outlined">add_circle</span>
                                AGENDAR CIRUGÍA
                            </button>
                        )}
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className="flex-1 flex flex-col min-w-0 bg-background overflow-hidden h-full relative">
            <ProgressBar isLoading={loading} />
            <div className="px-4 py-3 md:px-8 md:py-6 flex flex-col md:flex-row md:items-center justify-between gap-3 md:gap-4 border-b border-slate-200 bg-white sticky top-0 z-10">
                <div className="flex items-center gap-3 md:gap-6">
                    <div>
                        <h1 className="text-slate-900 text-xl md:text-3xl font-black leading-tight tracking-tighter capitalize flex items-center gap-2">
                            {getHeaderTitle()}
                            {(() => {
                                const dateStr = `${currentDate.getFullYear()}-${(currentDate.getMonth() + 1).toString().padStart(2, '0')}-${currentDate.getDate().toString().padStart(2, '0')}`;
                                const holidayTitle = holidays[dateStr];
                                if (holidayTitle && view === 'day') {
                                    return (
                                        <span className="text-[10px] font-black text-white bg-red-500 px-2 py-1 rounded uppercase tracking-widest shadow-sm" title={holidayTitle}>
                                            FERIADO: {holidayTitle}
                                        </span>
                                    );
                                }
                                return null;
                            })()}
                        </h1>
                        <p className="hidden md:block text-slate-500 text-xs font-bold uppercase tracking-widest mt-0.5">Gestión de Calendario QX</p>
                    </div>
                    <div className="flex items-center rounded-xl bg-slate-100 p-1 shadow-inner">
                        <button onClick={handlePrev} className="p-1.5 md:p-2 hover:bg-white rounded-lg shadow-sm transition-all text-slate-900">
                            <span className="material-symbols-outlined text-lg md:text-2xl">chevron_left</span>
                        </button>
                        <button onClick={handleNext} className="p-1.5 md:p-2 hover:bg-white rounded-lg shadow-sm transition-all text-slate-900">
                            <span className="material-symbols-outlined text-lg md:text-2xl">chevron_right</span>
                        </button>
                    </div>
                    <button onClick={handleToday} className="px-3 py-1.5 md:px-4 md:py-2 rounded-xl border border-slate-200 bg-white text-xs md:text-sm font-black text-slate-800 hover:bg-slate-50 transition-colors shadow-sm">
                        Hoy
                    </button>
                    {user?.role === 'SuperAdmin' && (
                        <button
                            onClick={() => navigate('/nueva-cirugia', { state: { isPastRegistration: true } })}
                            className="px-3 py-1.5 md:px-4 md:py-2 rounded-xl border border-indigo-100 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 transition-all shadow-sm flex items-center gap-2 active:scale-95"
                        >
                            <span className="material-symbols-outlined text-lg md:text-xl">emergency</span>
                            <span className="hidden md:inline text-[10px] font-black uppercase tracking-widest">+ Registrar Cirugía Pasada</span>
                        </button>
                    )}
                    <button
                        onClick={() => fetchInitialData(currentDate.getFullYear(), currentDate.getMonth())}
                        disabled={loading}
                        className="px-3 py-1.5 md:px-4 md:py-2 rounded-xl border border-slate-200 bg-white text-slate-600 hover:text-primary hover:bg-slate-50 transition-colors shadow-sm disabled:opacity-50 flex items-center gap-2"
                        title="Actualizar datos"
                    >
                        <span className={`material-symbols-outlined text-lg md:text-xl ${loading ? 'animate-spin' : ''}`}>refresh</span>
                        <span className="hidden md:inline text-xs font-black uppercase tracking-tighter">Actualizar</span>
                    </button>
                </div>
                <div className="flex items-center gap-4">
                    <div className="flex h-8 md:h-10 items-center rounded-xl bg-slate-100 p-1">
                        {['month', 'week', 'day'].map(v => (
                            <button
                                key={v}
                                onClick={() => setView(v as ViewMode)}
                                className={`px-3 py-1 md:px-4 md:py-1.5 rounded-lg text-[10px] md:text-xs font-black transition-all ${view === v ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-900'}`}
                            >
                                {v === 'month' ? 'MES' : v === 'week' ? 'SEMANA' : 'DÍA'}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-8">
                {/* Rules & Alerts Legend */}
                <div className="mb-4 md:mb-8 bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
                    <button
                        onClick={() => setShowRulesSummary(!showRulesSummary)}
                        className="w-full px-4 py-3 md:px-6 md:py-4 flex items-center justify-between hover:bg-slate-50 transition-colors"
                    >
                        <h2 className="text-sm font-black text-slate-900 flex items-center gap-2">
                            <span className="material-symbols-outlined text-primary text-xl">info</span>
                            REGLAS DE PROGRAMACIÓN Y ALERTAS
                        </h2>
                        <span className={`material-symbols-outlined transition-transform duration-300 ${showRulesSummary ? 'rotate-180' : ''}`}>
                            expand_more
                        </span>
                    </button>

                    {showRulesSummary && (
                        <div className="px-4 pb-4 md:px-6 md:pb-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 md:gap-6 animate-in slide-in-from-top-2 duration-300">
                            <div className="flex-1">
                                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2 md:gap-4">
                                    <div className="flex items-center gap-2">
                                        <span className="size-2.5 rounded-full bg-emerald-500 shadow-sm shadow-emerald-200"></span>
                                        <span className="text-[9px] md:text-[10px] font-bold text-slate-600 uppercase">Listo OK</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className="size-2.5 rounded-full bg-orange-500 shadow-sm shadow-orange-200"></span>
                                        <span className="text-[9px] md:text-[10px] font-bold text-slate-600 uppercase">Falta Doc.</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className="size-2.5 rounded-full bg-red-500 shadow-sm shadow-red-200"></span>
                                        <span className="text-[9px] md:text-[10px] font-bold text-slate-600 uppercase">Sin Mat.</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className="size-2.5 rounded-full bg-violet-800 shadow-sm shadow-violet-200"></span>
                                        <span className="text-[9px] md:text-[10px] font-bold text-slate-600 uppercase">Realizada</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className="size-2.5 rounded-full bg-slate-400"></span>
                                        <span className="text-[9px] md:text-[10px] font-bold text-slate-600 uppercase">Ocupado</span>
                                    </div>
                                </div>
                            </div>
                            <div className="hidden lg:block shrink-0 bg-red-50 border border-red-100 p-4 rounded-xl max-w-xs">
                                <div className="flex items-center gap-2 mb-1">
                                    <span className="material-symbols-outlined text-red-600 text-lg">schedule</span>
                                    <span className="text-[11px] font-black text-red-900 uppercase">Restricción de Logística</span>
                                </div>
                                <p className="text-[10px] text-red-700 leading-relaxed font-medium">
                                    Casos con materiales requieren validación o programar con <strong>+14 días</strong> de antelación.
                                </p>
                            </div>
                        </div>
                    )}
                </div>

                {loading && (
                    <div className="absolute inset-0 z-[100] bg-white/60 backdrop-blur-[2px] flex items-center justify-center transition-all animate-in fade-in duration-300">
                        <div className="bg-white p-8 rounded-3xl shadow-2xl border border-slate-100 flex flex-col items-center gap-4 scale-110">
                            <div className="size-12 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
                            <div className="flex flex-col items-center gap-1 text-center">
                                <span className="text-slate-900 font-black text-lg tracking-tight">Cargando cirugías</span>
                                <span className="text-slate-500 text-xs font-bold uppercase tracking-widest">Optimización de Calendario</span>
                            </div>
                        </div>
                    </div>
                )}

                {view === 'month' && <MonthView />}
                {view === 'week' && <WeekView />}
                {view === 'day' && <DayView />}
            </div>

            {showModal && modalDate && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-md p-4 animate-in fade-in duration-300">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl flex flex-col max-h-[90vh] overflow-hidden border border-slate-200">
                        <div className="p-6 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
                            <div>
                                <h3 className="text-2xl font-black text-slate-900">Agendar / Reprogramar</h3>
                                <p className="text-sm text-primary font-bold uppercase tracking-wider">
                                    {modalDate.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })}
                                </p>
                            </div>
                            <button onClick={() => setShowModal(false)} className="size-10 flex items-center justify-center rounded-full hover:bg-slate-200 text-slate-400 transition-colors">
                                <span className="material-symbols-outlined">close</span>
                            </button>
                        </div>

                        <div className="flex-1 overflow-hidden flex flex-col md:flex-row">
                            <div className="w-full md:w-[380px] border-r border-slate-200 flex flex-col bg-slate-50/50">
                                <div className="p-4 border-b border-slate-200 bg-white/50 space-y-3">
                                    <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest">1. Cirugías Disponibles</h4>
                                    <div className="relative">
                                        <span className="material-symbols-outlined absolute left-3 top-2.5 text-slate-400 text-lg">search</span>
                                        <input
                                            type="text"
                                            placeholder="Buscar paciente, médico o proc..."
                                            className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-primary focus:outline-none placeholder-slate-400"
                                            value={modalSearchTerm}
                                            onChange={(e) => setModalSearchTerm(e.target.value)}
                                        />
                                    </div>
                                    <div className="pt-1">
                                        <button
                                            onClick={() => {
                                                const formattedDate = modalDate.toISOString().split('T')[0];
                                                navigate('/nueva-cirugia', { 
                                                    state: { 
                                                        prefillDate: formattedDate,
                                                        prefillOr: selectedOrId,
                                                        prefillTime: selectedTimeSlot,
                                                        isPastRegistration: true
                                                    } 
                                                });
                                            }}
                                            className="w-full flex items-center justify-center gap-2 py-2.5 bg-indigo-50 hover:bg-indigo-100 border border-indigo-100 rounded-xl text-indigo-700 text-[10px] font-black uppercase tracking-widest transition-all active:scale-95 shadow-sm"
                                        >
                                            <span className="material-symbols-outlined text-base">emergency</span>
                                            Registrar Cirugía de Urgencia / Pasada
                                        </button>
                                    </div>
                                </div>
                                <div className="flex-1 overflow-y-auto p-4 space-y-6">
                                    {(() => {
                                        const filtered = pendingSurgeries.filter(s =>
                                            s.name.toLowerCase().includes(modalSearchTerm.toLowerCase()) ||
                                            s.doctor.toLowerCase().includes(modalSearchTerm.toLowerCase()) ||
                                            s.proc.toLowerCase().includes(modalSearchTerm.toLowerCase())
                                        );
                                        const artPending = filtered.filter(s => s.isArt);
                                        const normalPending = filtered.filter(s => !s.isArt);

                                        const renderCard = (surgery: PendingSurgery) => {
                                            const isMaterialsPending = surgery.needsOrthoValidation && !surgery.orthoValidated;
                                            const isDocsPending = !surgery.hasAllDocs;
                                            return (
                                                <div
                                                    key={surgery.id}
                                                    onClick={() => setSelectedPendingId(surgery.id)}
                                                    className={`cursor-pointer border-2 rounded-xl p-4 transition-all group relative ${selectedPendingId === surgery.id
                                                        ? 'bg-white border-primary shadow-lg ring-4 ring-primary/10'
                                                        : 'bg-white border-slate-200 hover:border-slate-300'
                                                        } ${surgery.isArt ? 'ring-2 ring-amber-500/20 border-amber-500/30' : ''}`}
                                                >
                                                    <div className="flex justify-between items-start mb-1">
                                                        <div className="flex flex-col">
                                                            {surgery.isArt && (
                                                                <span className="text-[9px] font-black text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded w-fit mb-1 tracking-tighter uppercase">Prioridad ART</span>
                                                            )}
                                                            <p className="font-bold text-slate-900 text-sm truncate pr-2 flex items-center gap-1">
                                                                {((user?.role === 'Internacion' || user?.role === 'SuperAdmin') && surgery.internacionNotified === false) && <span className="material-symbols-outlined text-cyan-500 animate-bounce text-4xl align-middle drop-shadow-[0_0_15px_rgba(6,182,212,0.7)]" title="Cirugía Nueva">fiber_new</span>}
                                                                {surgery.name}
                                                            </p>
                                                        </div>
                                                        <div className="flex gap-1 shrink-0">
                                                            {isMaterialsPending && (
                                                                <span title="Faltan Materiales" className="material-symbols-outlined text-[14px] text-red-500 font-bold">handyman</span>
                                                            )}
                                                            {isDocsPending && (
                                                                <span title={`Falta: ${surgery.missingDocs.join(', ')}`} className="material-symbols-outlined text-[14px] text-orange-500 font-bold">assignment_late</span>
                                                            )}
                                                            {surgery.patientUnableToAttend && (
                                                                <span title="EL PACIENTE NOTIFICÓ QUE NO PUEDE ASISTIR" className="material-symbols-outlined text-[14px] text-red-600 font-bold animate-pulse">person_off</span>
                                                            )}
                                                            {surgery.hasPendingReschedule && (
                                                                <span title="Reprogramación Solicitada" className="material-symbols-outlined text-[14px] text-amber-500 font-bold animate-pulse">event_repeat</span>
                                                            )}
                                                            {!isMaterialsPending && !isDocsPending && !surgery.patientUnableToAttend && (
                                                                <span title="Listo para programar" className="material-symbols-outlined text-[14px] text-emerald-500 font-bold">check_circle</span>
                                                            )}
                                                        </div>
                                                    </div>
                                                    <p className="text-xs text-slate-500 font-medium mb-2 truncate">{surgery.proc}</p>
                                                    <div className="flex items-center justify-between text-[10px] font-bold text-slate-400">
                                                        <div className="flex flex-col gap-1">
                                                            <span className="flex items-center gap-1"><span className="material-symbols-outlined text-xs">person</span> {surgery.doctor}</span>
                                                            <span className="flex items-center gap-1"><span className="material-symbols-outlined text-xs">schedule</span> {surgery.duration}m</span>
                                                        </div>
                                                        {surgery.patientAvailableFrom && (
                                                            <div className="flex items-center gap-1 bg-violet-50 text-violet-700 px-2 py-1 rounded-md border border-violet-100">
                                                                <span className="material-symbols-outlined text-xs">event_available</span>
                                                                <span>Desde: {new Date(surgery.patientAvailableFrom).toLocaleDateString()}</span>
                                                            </div>
                                                        )}
                                                    </div>

                                                    {/* Premium Tooltip for Pending Surgery */}
                                                    <div className="premium-tooltip !bottom-auto !top-full !mt-2">
                                                        <div className="flex flex-col gap-1.5">
                                                            <div className="border-b border-white/10 pb-1.5 mb-1">
                                                                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-0.5">Paciente</p>
                                                                <p className="text-[13px] font-black text-white leading-tight">{surgery.name || 'N/A'}</p>
                                                            </div>
                                                            <div className="grid grid-cols-2 gap-2">
                                                                <div>
                                                                    <p className="text-[9px] text-slate-400 font-bold uppercase mb-0.5">Cobertura</p>
                                                                    <p className="text-[10px] font-bold text-blue-200">{surgery.medicalCoverage || 'Particular'}</p>
                                                                </div>
                                                                <div>
                                                                    <p className="text-[9px] text-slate-400 font-bold uppercase mb-0.5">Médico</p>
                                                                    <p className="text-[10px] font-bold text-white/90">{surgery.doctor?.split(' ').slice(0, 2).join(' ') || 'N/A'}</p>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        };

                                        return (
                                            <>
                                                {artPending.length > 0 && (
                                                    <div className="space-y-2">
                                                        <h5 className="text-[10px] font-black text-amber-600 uppercase tracking-widest flex items-center gap-2 mb-3">
                                                            <span className="material-symbols-outlined text-sm">star</span> CIRUGÍAS ART / ASEGURADORAS
                                                        </h5>
                                                        {artPending.map(renderCard)}
                                                    </div>
                                                )}

                                                {normalPending.length > 0 && (
                                                    <div className="space-y-2">
                                                        <h5 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">
                                                            OTRAS CIRUGÍAS / OS
                                                        </h5>
                                                        {normalPending.map(renderCard)}
                                                    </div>
                                                )}

                                                {filtered.length === 0 && (
                                                    <div className="text-center py-12 opacity-40">
                                                        <span className="material-symbols-outlined text-5xl mb-2">search_off</span>
                                                        <p className="text-sm font-bold">No se encontraron cirugías</p>
                                                    </div>
                                                )}
                                            </>
                                        );
                                    })()}
                                    {pendingSurgeries.length === 0 && (
                                        <div className="text-center py-12 opacity-40">
                                            <span className="material-symbols-outlined text-5xl mb-2">check_circle</span>
                                            <p className="text-sm font-bold">Todo al día</p>
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="flex-1 flex flex-col bg-white">
                                <div className="p-6 border-b border-slate-100">
                                    <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4">2. Espacio de Quirófano</h4>
                                    <div className="flex gap-2 p-1.5 bg-slate-100 rounded-xl">
                                        {ors.map(or => (
                                            <button
                                                key={or.id}
                                                onClick={() => setSelectedOrId(or.id)}
                                                className={`flex-1 py-2 px-4 text-xs font-black rounded-lg transition-all ${selectedOrId === or.id
                                                    ? 'bg-white text-slate-900 shadow-md transform scale-[1.02]'
                                                    : 'text-slate-500 hover:text-slate-700'
                                                    }`}
                                            >
                                                {or.name}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                <div className="flex-1 overflow-y-auto p-8">
                                    {selectedPendingId ? (
                                        <>
                                            <div className="grid grid-cols-4 sm:grid-cols-6 gap-3">
                                                {availableSlots.map((slot, idx) => {
                                                    const today = new Date();
                                                    today.setHours(0, 0, 0, 0);
                                                    const diffTime = modalDate.getTime() - today.getTime();
                                                    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

                                                    const isEmergency = selectedSurgery?.priority === 'emergency';
                                                    const isOrthoRuleViolated = selectedSurgery?.needsOrthoValidation && !selectedSurgery?.orthoValidated && diffDays < 14 && !isEmergency;

                                                    // New Urgency Rule: Unvalidated Urgent surgeries restricted to 14 days from creation
                                                    let isUrgencyRuleViolated = false;
                                                    if (selectedSurgery?.priority === 'urgent' && !selectedSurgery?.doctorPriorityValidated) {
                                                        const creationDate = selectedSurgery?.createdAt ? new Date(selectedSurgery.createdAt) : new Date();
                                                        creationDate.setHours(0, 0, 0, 0);
                                                        const targetDate = new Date(modalDate);
                                                        targetDate.setHours(0, 0, 0, 0);

                                                        const diffFromCreation = Math.ceil((targetDate.getTime() - creationDate.getTime()) / (1000 * 60 * 60 * 24));
                                                        if (diffFromCreation < 14) {
                                                            isUrgencyRuleViolated = true;
                                                        }
                                                    }

                                                    const isDisabled = slot.busy || isOrthoRuleViolated || isUrgencyRuleViolated;

                                                    return (
                                                        <button
                                                            key={idx}
                                                            disabled={isDisabled}
                                                            onClick={() => setSelectedTimeSlot(slot.time)}
                                                            className={`py-3 px-2 rounded-xl border-2 text-sm font-black transition-all ${isDisabled
                                                                ? 'bg-slate-50 text-slate-300 border-slate-100 cursor-not-allowed opacity-50'
                                                                : selectedTimeSlot === slot.time
                                                                    ? 'bg-primary text-white border-primary shadow-lg shadow-primary/30 transform scale-110'
                                                                    : 'bg-white text-slate-900 border-slate-100 hover:border-primary/30 hover:bg-blue-50'
                                                                }`}
                                                            title={isOrthoRuleViolated ? "Falta validación de materiales (mínimo 14 días de antelación)" : isUrgencyRuleViolated ? "Falta aval médico para Urgencia (mínimo 14 días desde creación)" : undefined}
                                                        >
                                                            {slot.time}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                            {selectedSurgery?.needsOrthoValidation && !selectedSurgery?.orthoValidated && selectedSurgery?.priority !== 'emergency' && (
                                                <div className="mt-4 p-3 bg-red-50 border border-red-100 rounded-xl flex items-center gap-3">
                                                    <span className="material-symbols-outlined text-red-500">warning</span>
                                                    <p className="text-[11px] font-bold text-red-700">
                                                        ATENCIÓN: Falta validación de materiales. Solo se permite programar con al menos 14 días de antelación (excepto Emergencias).
                                                    </p>
                                                </div>
                                            )}

                                            {selectedSurgery?.priority === 'urgent' && !selectedSurgery?.doctorPriorityValidated && (
                                                <div className="mt-2 p-3 bg-orange-50 border border-orange-100 rounded-xl flex items-center gap-3">
                                                    <span className="material-symbols-outlined text-orange-500">medical_services</span>
                                                    <p className="text-[11px] font-bold text-orange-700">
                                                        ATENCIÓN: Falta aval médico para esta Urgencia. Solo se permite programar con al menos 14 días de antelación desde su creación.
                                                    </p>
                                                </div>
                                            )}
                                            {selectedSurgery?.priority === 'emergency' && selectedPendingId && (
                                                <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-xl flex items-center gap-3">
                                                    <span className="material-symbols-outlined text-red-600 font-bold">priority_high</span>
                                                    <p className="text-[11px] font-bold text-red-900">
                                                        EMERGENCIA: Esta cirugía tiene prioridad máxima y puede programarse de inmediato sin restricciones de materiales.
                                                    </p>
                                                </div>
                                            )}
                                            {!selectedSurgery?.needsOrthoValidation && selectedSurgery?.priority !== 'emergency' && selectedPendingId && (
                                                <div className="mt-4 p-3 bg-emerald-50 border border-emerald-100 rounded-xl flex items-center gap-3">
                                                    <span className="material-symbols-outlined text-emerald-500">check_circle</span>
                                                    <p className="text-[11px] font-bold text-emerald-700">
                                                        LISTO PARA AGENDAR: Esta cirugía no requiere materiales de ortopedia y puede programarse sin restricciones de antelación.
                                                    </p>
                                                </div>
                                            )}
                                            {selectedTimeSlot && (
                                                <div className="mt-8 p-6 bg-primary/5 border border-primary/20 rounded-2xl flex items-center gap-4 animate-in slide-in-from-bottom-2 duration-300">
                                                    <div className="size-12 bg-primary text-white rounded-full flex items-center justify-center shadow-lg shadow-primary/20">
                                                        <span className="material-symbols-outlined">event_available</span>
                                                    </div>
                                                    <div>
                                                        <p className="text-sm font-bold text-slate-900 leading-tight">Confirmar Programación</p>
                                                        <p className="text-xs text-slate-500 mt-0.5">La cirugía se fijará a las <strong>{selectedTimeSlot}</strong> en el <strong>{ors.find(o => o.id === selectedOrId)?.name}</strong>.</p>
                                                    </div>
                                                </div>
                                            )}
                                        </>
                                    ) : (
                                        <div className="h-full flex flex-col items-center justify-center text-slate-300">
                                            <span className="material-symbols-outlined text-6xl mb-4">move_item</span>
                                            <p className="text-lg font-bold">Seleccione una cirugía de la izquierda</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        <div className="p-6 border-t border-slate-200 bg-slate-50 flex justify-end gap-3">
                            <button onClick={() => setShowModal(false)} className="px-6 py-2.5 text-slate-500 font-bold hover:bg-slate-200 rounded-xl transition-all">
                                Cancelar
                            </button>
                            <button
                                disabled={!selectedPendingId || !selectedTimeSlot}
                                onClick={handleConfirmSchedule}
                                className="px-8 py-2.5 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white rounded-xl font-black text-sm shadow-xl shadow-slate-200 transition-all active:scale-95"
                            >
                                Guardar Programación
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Calendar;