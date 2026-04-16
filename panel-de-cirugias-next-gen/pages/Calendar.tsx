import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
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
}

const Calendar: React.FC = () => {
    const navigate = useNavigate();
    const { user } = useAuth();
    // State
    const [currentDate, setCurrentDate] = useState(new Date());
    const [view, setView] = useState<ViewMode>('month');
    const [previousView, setPreviousView] = useState<ViewMode | null>(null);
    const [showRulesSummary, setShowRulesSummary] = useState(false);
    const [currentTime, setCurrentTime] = useState(new Date());

    // Data State
    const [events, setEvents] = useState<CalendarEvent[]>([]);
    const [pendingSurgeries, setPendingSurgeries] = useState<PendingSurgery[]>([]);
    const [ors, setOrs] = useState<OperatingRoom[]>([]);
    const [loading, setLoading] = useState(true);
    const [isMobile, setIsMobile] = useState(window.innerWidth < 1024);
    const [selectedDayOrId, setSelectedDayOrId] = useState<string | null>(null);

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

    // Drag & Drop State
    const [draggedEventId, setDraggedEventId] = useState<string | null>(null);
    const [dragOverHour, setDragOverHour] = useState<number | null>(null);
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
            return a.id.localeCompare(b.id); // Ensure stability
        });

        // 2. Identify and resolve overlaps (Cascade Displacement)
        for (let i = 0; i < workingEvents.length - 1; i++) {
            const current = workingEvents[i];
            const next = workingEvents[i + 1];

            if (current.end > next.start) {
                // OVERLAP DETECTED - Move 'next' to start when 'current' ends
                const newNextStart = new Date(current.end);
                const duration = next.end.getTime() - next.start.getTime();
                const newNextEnd = new Date(newNextStart.getTime() + duration);
                workingEvents[i + 1] = { ...next, start: newNextStart, end: newNextEnd };
            }
        }

        // Return only changed events
        return workingEvents.filter(we => {
            const original = dayEvents.find(de => de.id === we.id);
            if (!original) return false;
            return original.start.getTime() !== we.start.getTime();
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
        // We assume the first slot's start time should remain fixed for the new first element.
        const firstSlotStartTime = sorted[0].start.getTime();

        // 4. Perform the Reorder
        const movedItem = sorted.find(e => e.id === movedId);
        if (!movedItem) return;

        const filtered = sorted.filter(e => e.id !== movedId);
        filtered.splice(targetIndex, 0, movedItem);

        // 5. Recalculate Times preserving Gaps
        // element[0] starts at firstSlotStartTime
        // element[i+1] starts at element[i].end + gaps[i]

        let currentStart = firstSlotStartTime;
        const updates: { id: string, start: Date, end: Date }[] = [];

        filtered.forEach((ev, index) => {
            const start = new Date(currentStart);
            const durationMs = ev.end.getTime() - ev.start.getTime();
            const end = new Date(start.getTime() + durationMs);

            // Check if changed
            if (ev.start.getTime() !== start.getTime()) {
                updates.push({ id: ev.id, start, end });
            }

            // Prep start for next iteration
            if (index < filtered.length - 1) {
                // Use the gap corresponding to this *slot index*
                const gapMs = gaps[index] || 0;
                currentStart = end.getTime() + gapMs;
            }
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
                .select('*, patients(full_name), doctors!doctor_id(full_name), surgery_materials(id)')
                .or(`surgery_date.gte.${startStr},surgery_date.is.null`) // Include unscheduled
                .or(`surgery_date.lte.${endStr},surgery_date.is.null`);

            if (user?.role === 'Medico' && user.doctorId) {
                // query = query.eq('doctor_id', user.doctorId); // REMOVED: Now we fetch all to show 'Busy' slots
            }
            if (user?.role === 'Ortopedia' && user.vendorId) {
                // query = query.eq('vendor_id', user.vendorId); // REMOVED: Now we fetch all to show 'Busy' slots
            }

            const { data: surgeryData, error: surError } = await query
                .order('surgery_date', { ascending: true })
                .order('start_time', { ascending: true });
            if (surError) throw surError;

            // --- AUTO-TRANSITION LOGIC (CALENDAR) ---
            const nowAt = new Date();
            const curH = nowAt.getHours();
            const curM = nowAt.getMinutes();
            const curTotalMin = curH * 60 + curM;

            const todayY = nowAt.getFullYear();
            const todayMo = (nowAt.getMonth() + 1).toString().padStart(2, '0');
            const todayD = nowAt.getDate().toString().padStart(2, '0');
            const todayStrComp = `${todayY}-${todayMo}-${todayD}`;

            const updates: any[] = [];
            const processedSurgeryData = (surgeryData || []).map((s: any) => {
                const isToday = s.surgery_date === todayStrComp;
                const isPast = s.surgery_date < todayStrComp;

                if ((!isToday && !isPast) || !s.start_time) return s;

                const [sH, sM] = s.start_time.split(':').map(Number);
                const sStartTotal = sH * 60 + sM;
                const duration = s.estimated_duration || 60;
                const sEndTotal = sStartTotal + duration;

                let finalStatus = s.status;

                // 0. Auto-Finish Past Dates (Scheduled/InProgress -> Completed)
                if (isPast && (finalStatus === 'scheduled' || finalStatus === 'in_progress' || finalStatus === 'in_or')) {
                    finalStatus = 'completed';
                    // Estimated end time logic?? Or just set to now? Or end of that day?
                    // Let's calculate the theoretical end time
                    const endH = Math.floor(sEndTotal / 60);
                    const endM = sEndTotal % 60;
                    const endStr = `${endH.toString().padStart(2, '0')}:${endM.toString().padStart(2, '0')}:00`;

                    updates.push(supabase.from('surgeries').update({ status: 'completed' }).eq('id', s.id));
                }

                // 1. Auto-Start Today (Scheduled -> In Progress)
                if (isToday && finalStatus === 'scheduled' && curTotalMin >= sStartTotal) {
                    finalStatus = 'in_progress';
                    updates.push(supabase.from('surgeries').update({ status: 'in_progress' }).eq('id', s.id));
                }

                // 2. Auto-Finish Today (In Progress/In OR -> Completed)
                // Added strict parsing to ensure duration is correct
                const safeDuration = Number(s.estimated_duration) || 60;
                const BUFFER_MINUTES = 10;
                const safeEndTotal = sStartTotal + safeDuration + BUFFER_MINUTES;

                if (isToday && (finalStatus === 'in_progress' || finalStatus === 'in_or') && curTotalMin >= safeEndTotal) {
                    finalStatus = 'completed';
                    // No need to set end_time here as it is removed from DB schema
                    updates.push(supabase.from('surgeries').update({ status: 'completed' }).eq('id', s.id));
                }

                return { ...s, status: finalStatus };
            });

            if (updates.length > 0) {
                Promise.all(updates).catch(e => console.error('Error in auto-transition (Calendar):', e));
            }
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
                if (s.status === 'completed') {
                    eventColor = 'bg-violet-800'; // Past/Completed: Dark Violet
                } else if (needsOrthoValidation && !orthoValidated) {
                    eventColor = 'bg-red-500'; // Critical: No materials
                } else if (!hasAllDocs) {
                    eventColor = 'bg-orange-500'; // Alert: Missing critical docs
                }

                if (s.surgery_date && s.start_time && s.status !== 'suspended') {
                    const [h, m] = s.start_time.split(':').map(Number);
                    const [year, month, day] = s.surgery_date.split('-').map(Number);
                    const startDate = new Date(year, month - 1, day, h, m, 0, 0);

                    const endDate = new Date(startDate);
                    endDate.setMinutes(startDate.getMinutes() + (s.estimated_duration || 60));

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
                        orthoValidated,
                        needsOrthoValidation,
                        hasAllDocs,
                        missingDocs,
                        authDate: s.authorization_date
                    });

                } else if (s.status === 'suspended' || !s.surgery_date || !s.start_time) {
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
                            isArt: s.medical_coverage && artNames.includes(s.medical_coverage)
                        });
                    }
                }
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

        const isTecnico = user?.role === 'Tecnico';

        try {
            const { error } = await supabase
                .from('surgeries')
                .update({
                    surgery_date: surgeryDateStr,
                    start_time: selectedTimeSlot,
                    operating_room_id: selectedOrId,
                    status: 'scheduled',
                    // Rule: Assigning date auto-validates if done by Tecnico
                    or_validated: isTecnico,
                    or_validation_date: isTecnico ? new Date().toISOString() : null,
                    or_validated_by_name: isTecnico ? (user?.name || 'Personal Quirófano') : null
                })
                .eq('id', selectedPendingId);

            if (error) throw error;

            // Trigger Alert for Doctor
            if (pending?.doctorId) {
                await createOrUpdateDoctorAlert({
                    surgeryId: selectedPendingId,
                    doctorId: pending.doctorId,
                    title: 'Cirugía Programada',
                    message: `Su cirugía para ${pending.patientName || 'Paciente'} ha sido programada para el ${surgeryDateStr} a las ${selectedTimeSlot} en ${ors.find(o => o.id === selectedOrId)?.name}.`,
                    severity: surgeryDateStr === new Date().toISOString().split('T')[0] ? 'Urgent' : 'Warning',
                    type: 'schedule_change',
                    patientName: pending.patientName
                });
            }



            supabase.from('audit_logs').insert({
                user_name: user?.name || 'Sistema',
                user_role: user?.role,
                action: 'UPDATE',
                resource: 'Cirugía',
                resource_id: selectedPendingId,
                description: `Cirugía agendada/reprogramada desde el calendario para el ${surgeryDateStr} a las ${selectedTimeSlot}`,
                meta: { source: 'Calendar' }
            }).then(({ error: auditError }) => {
                if (auditError) console.warn('Silent Audit Error:', auditError);
            });

            await fetchInitialData();
            setShowModal(false);
        } catch (err) {
            console.error('Error scheduling surgery:', err);
            alert('Error al agendar la cirugía.');
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
            <div className="glass-card shadow-sm border border-slate-200/50 h-auto flex flex-col min-h-[600px] overflow-hidden">
                <div className="grid grid-cols-7 border-b border-slate-200/50 bg-slate-50/50">
                    {weekDays.map((d) => (
                        <div key={d} className="py-3 text-center text-xs font-black text-slate-400 uppercase tracking-widest">
                            {d}
                        </div>
                    ))}
                </div>
                <div className="grid grid-cols-7 auto-rows-min divide-x divide-y divide-slate-100/50 min-h-0 pb-10 bg-white/40">
                    {paddingDays.map(i => (
                        <div key={`pad-${i}`} className="bg-slate-50/30"></div>
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
                                className={`p-2 transition-all relative group/cell min-h-[120px] cursor-pointer border-transparent hover:bg-white/80 hover:shadow-inner ${isToday ? 'bg-primary/5' : ''}`}
                            >
                                <div className="flex justify-between items-start">
                                    <span className={`text-sm font-bold transition-all ${isToday ? 'flex size-8 items-center justify-center rounded-xl bg-primary text-white shadow-lg shadow-primary/30 scale-110' : 'text-slate-500 group-hover/cell:text-slate-900'}`}>
                                        {d}
                                    </span>
                                </div>
                                <div className="mt-2 flex flex-col gap-1.5">
                                    {dayEvents.map(ev => (
                                        <button
                                            key={ev.id}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                if (!ev.isBlocked) navigate(`/detail/${ev.id}`);
                                            }}
                                            className={`w-full text-left ${ev.color} text-white px-2 py-1.5 rounded-lg text-[10px] font-bold truncate shadow-sm flex items-center justify-between transition-all hover:scale-[1.02] hover:shadow-md ${ev.isBlocked ? 'cursor-not-allowed opacity-80 grayscale-[0.3]' : 'hover:brightness-110'}`}
                                            title={ev.isBlocked ? `Médico: ${ev.originalDoctor}` : undefined}
                                        >
                                            <span className="truncate flex-1">
                                                <span className="opacity-80 font-mono mr-1">{ev.start.getHours().toString().padStart(2, '0')}:{ev.start.getMinutes().toString().padStart(2, '0')}</span>
                                                {ev.title}
                                            </span>
                                            {/* Show doctor surname (assuming 'Surname Name' format, take first word) */}
                                            {!ev.isBlocked && ev.originalDoctor && <span className="text-[9px] opacity-90 ml-1 truncate max-w-[50px] bg-black/10 px-1 rounded">{ev.originalDoctor.split(' ')[0]}</span>}
                                            {ev.isBlocked && ev.originalDoctor && <span className="text-[9px] opacity-75 ml-1">{ev.originalDoctor.split(' ')[0]}</span>}
                                        </button>
                                    ))}
                                </div>
                                {canAdd && (user?.role === 'Tecnico' || user?.role === 'SuperAdmin' || user?.role === 'Internacion') && (
                                    <button
                                        onClick={(e) => { e.stopPropagation(); openScheduleModal(dayDate); }}
                                        className="absolute top-2 right-2 opacity-0 group-hover/cell:opacity-100 p-1 text-primary hover:bg-primary/10 rounded-lg transition-all scale-90 hover:scale-100"
                                    >
                                        <span className="material-symbols-outlined text-xl">add_circle</span>
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
            <div className="glass-card shadow-sm border border-slate-200/50 h-full flex flex-col overflow-hidden relative">
                {/* Scrollable Container */}
                <div className="flex-1 overflow-auto no-scrollbar relative pb-24">
                    <div className="min-w-[800px] lg:min-w-full relative">
                        {/* Sticky Header Row */}
                        <div className="sticky top-0 z-30 grid grid-cols-[60px_1fr] divide-x divide-slate-200/50 bg-white/80 backdrop-blur-md border-b border-slate-200/50 shadow-sm">
                            <div className="p-3 text-center text-[9px] font-black text-slate-400 uppercase flex items-center justify-center bg-slate-50/50 sticky left-0 z-40 border-r border-slate-200/50 backdrop-blur-md">
                                Hora
                            </div>
                            <div className="grid grid-cols-7 divide-x divide-slate-100/50">
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
                                            className={`p-2 text-center cursor-pointer hover:bg-white/60 transition-colors ${isToday ? 'bg-primary/5' : ''}`}
                                        >
                                            <div className={`text-[10px] font-black uppercase tracking-tighter ${isToday ? 'text-primary' : 'text-slate-500'}`}>
                                                {date.toLocaleDateString('es-ES', { weekday: 'short' })}
                                            </div>
                                            <div className={`text-base font-black leading-none mt-0.5 ${isToday ? 'text-primary' : 'text-slate-900'}`}>
                                                {date.getDate()}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Grid Body */}
                        <div className="grid grid-cols-[60px_1fr] divide-x divide-slate-200/50 relative">
                            {/* Sticky Time Column */}
                            <div className="bg-slate-50/60 backdrop-blur-md sticky left-0 z-20 border-r border-slate-200/50">
                                {hours.map(h => (
                                    <div key={h} className="h-20 border-b border-slate-100/50 text-right pr-2 pt-1 text-[9px] text-slate-400 font-black font-mono">
                                        {h.toString().padStart(2, '0')}:00
                                    </div>
                                ))}
                            </div>

                            {/* Days Columns */}
                            <div className="grid grid-cols-7 divide-x divide-slate-100/50 relative bg-white/30">
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
                                        <div key={i} className="relative group/col h-full hover:bg-slate-50/20 transition-colors">
                                            {hours.map(h => (
                                                <div
                                                    key={h}
                                                    onClick={() => canAdd && openScheduleModal(date, h)}
                                                    className={`h-20 border-b border-slate-100/50 relative group/cell ${canAdd ? 'hover:bg-slate-100/30 cursor-pointer' : ''}`}
                                                ></div>
                                            ))}
                                            {dayEvents.map(ev => {
                                                const startHour = ev.start.getHours();
                                                const startMin = ev.start.getMinutes();
                                                const durationMin = (ev.end.getTime() - ev.start.getTime()) / (1000 * 60);
                                                const topOffset = ((startHour - 7) * 80) + ((startMin / 60) * 80);
                                                const height = Math.max((durationMin / 60) * 80, 24); // Min height 24px

                                                if (startHour < 7 || startHour > 19) return null;

                                                // Calculate Overlap Side-by-Side (Simplified for now)
                                                // We'll use a data attribute or similar if more complex logic is needed
                                                const dayEvsAtThisTime = dayEvents.filter(other =>
                                                    (ev.start < other.end && ev.end > other.start)
                                                ).sort((a, b) => a.id.localeCompare(b.id)); // Stable sort

                                                const pos = dayEvsAtThisTime.findIndex(e => e.id === ev.id);
                                                const total = dayEvsAtThisTime.length;
                                                const width = 100 / total;
                                                const left = pos * width;

                                                return (
                                                    <button
                                                        key={ev.id}
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            if (!ev.isBlocked) navigate(`/detail/${ev.id}`);
                                                        }}
                                                        style={{
                                                            top: `${topOffset}px`,
                                                            height: `${height}px`,
                                                            left: `${left}%`,
                                                            width: `${width}%`
                                                        }}
                                                        className={`absolute border border-white/20 rounded-xl p-1 lg:p-1.5 text-[9px] lg:text-[10px] font-black text-white shadow-md z-10 flex flex-col items-start overflow-hidden transition-all backdrop-blur-sm ${ev.color} ${ev.isBlocked ? 'cursor-not-allowed grayscale opacity-60' : 'hover:scale-[1.02] hover:z-20 hover:shadow-xl focus:outline-none hover:ring-2 hover:ring-white/30'}`}
                                                        title={ev.isBlocked ? `Médico: ${ev.originalDoctor}` : `${ev.title} (${ev.start.getHours()}:${ev.start.getMinutes().toString().padStart(2, '0')})`}
                                                    >
                                                        <div className="w-full flex justify-between items-center mb-0.5">
                                                            <span className="font-mono opacity-90 text-[8px] lg:text-[9px] flex items-center gap-0.5 bg-black/10 px-1 rounded-sm">
                                                                <span className="material-symbols-outlined text-[10px]">schedule</span>
                                                                {startHour}:{startMin.toString().padStart(2, '0')}
                                                            </span>
                                                            {ev.isBlocked && <span className="material-symbols-outlined text-[10px]">lock</span>}
                                                        </div>
                                                        <span className="leading-tight text-left line-clamp-2 uppercase tracking-tighter drop-shadow-sm">
                                                            {ev.title}
                                                        </span>
                                                        {!ev.isBlocked && ev.originalDoctor && (
                                                            <span className="text-[8px] lg:text-[9px] opacity-90 mt-auto font-medium truncate w-full pt-1 border-t border-white/10 uppercase bg-black/5 px-1 rounded-sm -mx-1 -mb-1 pb-0.5">
                                                                {ev.originalDoctor.split(' ').slice(0, 2).join(' ')}
                                                            </span>
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
            <div className="glass-card shadow-sm border border-slate-200/50 h-full flex flex-col overflow-hidden max-w-4xl mx-auto w-full">
                {/* Header with Back Button (if navigated from month/week) */}
                {(previousView === 'month' || previousView === 'week') && (
                    <div className="px-4 py-2 bg-slate-100/50 border-b border-slate-200/50 flex items-center justify-between backdrop-blur-sm">
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
                <div className="flex overflow-x-auto gap-1 p-2 bg-slate-50/50 border-b border-slate-200/50 no-scrollbar backdrop-blur-sm">
                    {ors.map(or => (
                        <button
                            key={or.id}
                            onClick={() => setSelectedDayOrId(or.id)}
                            className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest whitespace-nowrap transition-all border ${selectedDayOrId === or.id
                                ? 'bg-primary border-primary text-white shadow-md shadow-primary/20 scale-105'
                                : 'bg-white/60 border-slate-200/60 text-slate-500 hover:border-slate-300 hover:bg-white'
                                }`}
                        >
                            {or.name}
                        </button>
                    ))}
                </div>

                {!isMobile ? (
                    /* DESKTOP GRID VIEW */
                    <div className="flex-1 overflow-y-auto pb-24">
                        <div className="grid grid-cols-[100px_1fr] divide-x divide-slate-100/50">
                            <div className="bg-slate-50/30">
                                {hours.map(h => (
                                    <div key={h} className="h-24 border-b border-slate-100/50 text-right pr-4 pt-2 text-sm text-slate-400 font-bold">
                                        {h}:00
                                    </div>
                                ))}
                            </div>
                            <div className="relative bg-white/40">
                                {hours.map(h => (
                                    <div
                                        key={h}
                                        className={`h-24 border-b border-slate-100/50 flex flex-col justify-center px-4 transition-all group relative ${dragOverHour === h ? 'bg-primary/5 ring-2 ring-primary/20 ring-inset' : 'hover:bg-slate-50/50'}`}
                                        onDragOver={(e) => {
                                            if (canDrag && draggedEventId) {
                                                e.preventDefault();
                                                if (dragOverHour !== h) setDragOverHour(h);
                                            }
                                        }}
                                        onDragLeave={() => setDragOverHour(null)}
                                        onDrop={(e) => {
                                            if (!canDrag || !draggedEventId) return;
                                            e.preventDefault();
                                            setDragOverHour(null);
                                            const rect = e.currentTarget.getBoundingClientRect();
                                            const minutes = (e.clientY - rect.top) / rect.height > 0.5 ? 30 : 0;
                                            const timeStr = `${h.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
                                            handleRescheduleDrop(draggedEventId, timeStr, selectedDayOrId || '');
                                            setDraggedEventId(null);
                                        }}
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
                                {roomEvents.map(ev => {
                                    const startHour = ev.start.getHours();
                                    const startMin = ev.start.getMinutes();
                                    const durationMin = (ev.end.getTime() - ev.start.getTime()) / 60000;
                                    const pxPerHour = 96;
                                    const topOffset = ((startHour - 7) * pxPerHour) + ((startMin / 60) * pxPerHour);
                                    const height = (durationMin / 60) * pxPerHour;
                                    return (
                                        <div
                                            key={ev.id}
                                            draggable={canDrag && !ev.isBlocked}
                                            onDragStart={() => { if (canDrag && !ev.isBlocked) setDraggedEventId(ev.id); }}
                                            onClick={() => !ev.isBlocked && navigate(`/detail/${ev.id}`)}
                                            style={{ top: `${topOffset}px`, height: `${height}px` }}
                                            className={`absolute left-3 right-5 rounded-xl px-4 py-2 text-sm font-medium text-white shadow-lg z-10 flex items-center justify-between transition-all border-l-4 border-black/10 group/card backdrop-blur-sm ${ev.color} ${ev.isBlocked ? 'cursor-not-allowed opacity-80 grayscale' : 'hover:scale-[1.01] cursor-pointer hover:shadow-xl hover:ring-2 hover:ring-white/30'} ${draggedEventId === ev.id ? 'opacity-50 border-dashed border-2' : ''}`}
                                        >
                                            <div className="flex flex-col items-start overflow-hidden pointer-events-none">
                                                <span className="font-black text-sm truncate w-full leading-tight drop-shadow-sm">{ev.title}</span>
                                                <span className="opacity-90 font-bold text-[10px] leading-tight bg-black/10 px-1.5 py-0.5 rounded-md mt-1">
                                                    {startHour.toString().padStart(2, '0')}:{startMin.toString().padStart(2, '0')} - {ev.end.getHours().toString().padStart(2, '0')}:{ev.end.getMinutes().toString().padStart(2, '0')}
                                                </span>
                                            </div>

                                            <div className="flex items-center gap-1">
                                                {/* Reorder Buttons inside Card */}
                                                {canDrag && !ev.isBlocked && (
                                                    <div className="flex flex-col gap-0.5 transition-opacity opacity-0 group-hover/card:opacity-100">
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                const idx = roomEvents.findIndex(item => item.id === ev.id);
                                                                handleBackToBackReorder(roomEvents, ev.id, idx - 1);
                                                            }}
                                                            title="Subir"
                                                            className="size-6 bg-white/20 hover:bg-white/40 rounded flex items-center justify-center transition-colors"
                                                        >
                                                            <span className="material-symbols-outlined text-sm">expand_less</span>
                                                        </button>
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                const idx = roomEvents.findIndex(item => item.id === ev.id);
                                                                handleBackToBackReorder(roomEvents, ev.id, idx + 1);
                                                            }}
                                                            title="Bajar"
                                                            className="size-6 bg-white/20 hover:bg-white/40 rounded flex items-center justify-center transition-colors"
                                                        >
                                                            <span className="material-symbols-outlined text-sm">expand_more</span>
                                                        </button>
                                                    </div>
                                                )}

                                                {ev.icon && (
                                                    <span className="material-symbols-outlined text-xl bg-white/20 p-1.5 rounded-full pointer-events-none hidden md:block backdrop-blur-md shadow-inner">
                                                        {ev.icon}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                ) : (
                    /* MOBILE AGENDA VIEW */
                    <div className="flex-1 overflow-y-auto bg-slate-50/50 p-4 space-y-4 pb-20">
                        {roomEvents.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-20 text-slate-400 gap-4">
                                <span className="material-symbols-outlined text-6xl opacity-20">calendar_today</span>
                                <p className="font-bold text-sm uppercase tracking-widest">Sin cirugías agendadas</p>
                                {canAdd && (
                                    <button onClick={() => openScheduleModal(currentDate)} className="mt-2 px-6 py-2 bg-primary text-white rounded-xl font-black text-xs uppercase tracking-tighter shadow-lg shadow-primary/20 hover:scale-105 transition-transform">
                                        Agendar Primera
                                    </button>
                                )}
                            </div>
                        ) : (
                            roomEvents.map((ev, idx) => (
                                <div
                                    key={ev.id}
                                    className={`relative glass-card p-3 md:p-4 flex gap-3 md:gap-4 transition-all ${ev.isBlocked ? 'opacity-80 grayscale-[0.5]' : 'active:scale-95 hover:shadow-md'}`}
                                >
                                    {/* Timeline Decorator */}
                                    <div className="flex flex-col items-center gap-1.5 md:gap-2">
                                        <div className="w-14 h-14 md:w-16 md:h-16 rounded-2xl bg-slate-50/50 flex flex-col items-center justify-center border border-slate-100/50 backdrop-blur-sm">
                                            <span className="text-[11px] md:text-xs font-black text-slate-900 leading-none">
                                                {ev.start.getHours().toString().padStart(2, '0')}:{ev.start.getMinutes().toString().padStart(2, '0')}
                                            </span>
                                            <div className="w-3 h-[2px] bg-slate-200 my-1"></div>
                                            <span className="text-[9px] md:text-[10px] font-bold text-slate-400">
                                                {ev.end.getHours().toString().padStart(2, '0')}:{ev.end.getMinutes().toString().padStart(2, '0')}
                                            </span>
                                        </div>
                                        {idx < roomEvents.length - 1 && <div className="w-[1.5px] flex-1 bg-slate-100/50 rounded-full"></div>}
                                    </div>

                                    {/* Surgery Details */}
                                    <div className="flex-1 min-w-0 flex flex-col justify-between" onClick={() => !ev.isBlocked && navigate(`/detail/${ev.id}`)}>
                                        <div className="overflow-hidden">
                                            <h3 className="font-black text-slate-900 leading-tight mb-0.5 text-sm md:text-base truncate">{ev.title}</h3>
                                            <p className="text-[10px] md:text-[11px] font-bold text-slate-500 uppercase flex items-center gap-1 truncate">
                                                <span className="material-symbols-outlined text-[12px] md:text-[14px]">person</span>
                                                {ev.originalDoctor}
                                            </p>
                                        </div>

                                        <div className="flex items-center justify-between mt-2 md:mt-3">
                                            {/* Status Badge */}
                                            <div className={`px-2 py-0.5 md:px-3 md:py-1 rounded-full text-[9px] md:text-[10px] font-black uppercase tracking-tighter ${ev.color} text-white shadow-sm`}>
                                                {ev.completed ? 'REALIZADA' : ev.suspended ? 'SUSPENDIDA' : 'PROGRAMADA'}
                                            </div>
                                            {/* Agile Controls (Move Up/Down) */}
                                            {canDrag && !ev.isBlocked && (
                                                <div className="flex gap-1">
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); handleBackToBackReorder(roomEvents, ev.id, idx - 1); }}
                                                        disabled={idx === 0}
                                                        className="size-8 rounded-lg bg-slate-100/50 hover:bg-slate-100 flex items-center justify-center text-slate-600 disabled:opacity-30 transition-colors"
                                                    >
                                                        <span className="material-symbols-outlined text-lg">expand_less</span>
                                                    </button>
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); handleBackToBackReorder(roomEvents, ev.id, idx + 1); }}
                                                        disabled={idx === roomEvents.length - 1}
                                                        className="size-8 rounded-lg bg-slate-100/50 hover:bg-slate-100 flex items-center justify-center text-slate-600 disabled:opacity-30 transition-colors"
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
                                className="w-full py-4 border-2 border-dashed border-slate-200 rounded-2xl flex items-center justify-center gap-2 text-slate-400 hover:text-primary hover:border-primary/50 transition-all font-bold text-sm bg-white/20 hover:bg-white/40"
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
        <div className="flex-1 flex flex-col min-w-0 bg-slate-50/50 overflow-hidden h-full relative">
            <ProgressBar isLoading={loading} />
            <div className="px-4 py-3 md:px-8 md:py-6 flex flex-col md:flex-row md:items-center justify-between gap-3 md:gap-4 border-b border-slate-200/60 bg-white/80 backdrop-blur-xl sticky top-0 z-10 transition-all">
                <div className="flex items-center gap-3 md:gap-6">
                    <div>
                        <h1 className="text-slate-900 text-xl md:text-3xl font-black leading-tight tracking-tighter capitalize drop-shadow-sm">
                            {getHeaderTitle()}
                        </h1>
                        <p className="hidden md:block text-slate-500 text-xs font-bold uppercase tracking-widest mt-0.5">Gestión de Calendario QX</p>
                    </div>
                    <div className="flex items-center rounded-xl bg-slate-100/50 p-1 shadow-inner border border-slate-200/50">
                        <button onClick={handlePrev} className="p-1.5 md:p-2 hover:bg-white/80 rounded-lg shadow-sm transition-all text-slate-700 hover:text-primary active:scale-95">
                            <span className="material-symbols-outlined text-lg md:text-2xl">chevron_left</span>
                        </button>
                        <button onClick={handleNext} className="p-1.5 md:p-2 hover:bg-white/80 rounded-lg shadow-sm transition-all text-slate-700 hover:text-primary active:scale-95">
                            <span className="material-symbols-outlined text-lg md:text-2xl">chevron_right</span>
                        </button>
                    </div>
                    <button onClick={handleToday} className="px-3 py-1.5 md:px-4 md:py-2 rounded-xl border border-slate-200/60 bg-white/60 text-xs md:text-sm font-black text-slate-800 hover:bg-white hover:text-primary hover:shadow-md transition-all shadow-sm active:scale-95 backdrop-blur-md">
                        Hoy
                    </button>
                    <button
                        onClick={() => fetchInitialData(currentDate.getFullYear(), currentDate.getMonth())}
                        disabled={loading}
                        className="px-3 py-1.5 md:px-4 md:py-2 rounded-xl border border-slate-200/60 bg-white/60 text-slate-600 hover:text-primary hover:bg-white hover:shadow-md transition-all shadow-sm disabled:opacity-50 flex items-center gap-2 active:scale-95 backdrop-blur-md"
                        title="Actualizar datos"
                    >
                        <span className={`material-symbols-outlined text-lg md:text-xl ${loading ? 'animate-spin' : ''}`}>refresh</span>
                        <span className="hidden md:inline text-xs font-black uppercase tracking-tighter">Actualizar</span>
                    </button>
                </div>
                <div className="flex items-center gap-4">
                    <div className="flex h-8 md:h-10 items-center rounded-xl bg-slate-100/50 p-1 border border-slate-200/50">
                        {['month', 'week', 'day'].map(v => (
                            <button
                                key={v}
                                onClick={() => setView(v as ViewMode)}
                                className={`px-3 py-1 md:px-4 md:py-1.5 rounded-lg text-[10px] md:text-xs font-black transition-all ${view === v ? 'bg-white shadow-sm text-primary scale-105' : 'text-slate-500 hover:text-slate-900 hover:bg-white/40'}`}
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

            {showModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
                    <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity" onClick={() => setShowModal(false)} />
                    <div className="relative w-full max-w-5xl h-[90vh] glass-panel rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-white/20 animate-in zoom-in-95 duration-200">
                        {/* Modal Header */}
                        <div className="px-6 py-4 border-b border-slate-200/60 flex items-center justify-between bg-white/50 backdrop-blur-md">
                            <div>
                                <h2 className="text-xl font-black text-slate-800 flex items-center gap-2">
                                    <span className="material-symbols-outlined text-primary">event_available</span>
                                    Programar Cirugía
                                </h2>
                                <p className="text-xs text-slate-500 font-bold uppercase tracking-widest mt-0.5">
                                    {modalDate?.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })}
                                    {selectedTimeSlot ? ` • ${selectedTimeSlot} hs` : ''}
                                </p>
                            </div>
                            <button
                                onClick={() => setShowModal(false)}
                                className="p-2 hover:bg-slate-200/50 rounded-full text-slate-400 hover:text-red-500 transition-colors"
                            >
                                <span className="material-symbols-outlined text-xl">close</span>
                            </button>
                        </div>

                        <div className="flex-1 overflow-hidden grid grid-cols-1 md:grid-cols-12 divide-y md:divide-y-0 md:divide-x divide-slate-200/60 bg-slate-50/30">
                            {/* Left Column: Pending Surgeries List */}
                            <div className="md:col-span-5 flex flex-col min-h-0 bg-white/40">
                                <div className="p-4 border-b border-slate-200/50 bg-slate-50/50 backdrop-blur-sm">
                                    <div className="relative group">
                                        <span className="absolute left-3 top-1/2 -translate-y-1/2 material-symbols-outlined text-slate-400 group-focus-within:text-primary transition-colors">search</span>
                                        <input
                                            type="text"
                                            placeholder="Buscar paciente, médico..."
                                            value={modalSearchTerm}
                                            onChange={(e) => setModalSearchTerm(e.target.value)}
                                            className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all shadow-sm font-medium"
                                        />
                                    </div>
                                    <div className="flex gap-2 mt-3 overflow-x-auto no-scrollbar pb-1">
                                        {['todas', 'urgent', 'normal'].map(filter => (
                                            <button
                                                key={filter}
                                                onClick={() => setModalSearchTerm(prev => filter === 'todas' ? '' : filter)}
                                                className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest border transition-all whitespace-nowrap ${modalSearchTerm === filter || (filter === 'todas' && modalSearchTerm === '')
                                                    ? 'bg-slate-800 text-white border-slate-800 shadow-lg shadow-slate-800/20'
                                                    : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'
                                                    }`}
                                            >
                                                {filter === 'todas' ? 'Todas' : filter === 'urgent' ? 'Urgencias' : 'Normales'}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
                                    {pendingSurgeries
                                        .filter(s =>
                                            (s.patientName || s.name).toLowerCase().includes(modalSearchTerm.toLowerCase()) ||
                                            s.doctor?.toLowerCase().includes(modalSearchTerm.toLowerCase()) ||
                                            s.proc?.toLowerCase().includes(modalSearchTerm.toLowerCase())
                                        )
                                        .map(surgery => (
                                            <div
                                                key={surgery.id}
                                                onClick={() => {
                                                    setSelectedPendingId(surgery.id);
                                                    setSelectedOrId('');
                                                    setSelectedTimeSlot(null);
                                                }}
                                                className={`p-4 rounded-xl border cursor-pointer transition-all relative group ${selectedPendingId === surgery.id
                                                    ? 'bg-primary/5 border-primary shadow-lg shadow-primary/10 ring-1 ring-primary'
                                                    : 'bg-white border-slate-200 hover:border-primary/50 hover:shadow-md'
                                                    }`}
                                            >
                                                <div className="flex justify-between items-start mb-2">
                                                    <div className="flex items-center gap-2">
                                                        <span className={`px-2 py-0.5 rounded text-[10px] uppercase font-black tracking-tighter ${surgery.priority === 'emergency' ? 'bg-red-100 text-red-700' :
                                                            surgery.priority === 'urgent' ? 'bg-orange-100 text-orange-700' :
                                                                'bg-slate-100 text-slate-600'
                                                            }`}>
                                                            {surgery.priority === 'emergency' ? 'Emergencia' : surgery.priority === 'urgent' ? 'Urgencia' : 'Normal'}
                                                        </span>
                                                        <span className="text-[10px] font-bold text-slate-400">
                                                            #{surgery.id.slice(0, 8)}
                                                        </span>
                                                    </div>
                                                    {surgery.isArt && (
                                                        <span className="material-symbols-outlined text-amber-500" title="ART / Aseguradora">verified_user</span>
                                                    )}
                                                </div>
                                                <h3 className="font-bold text-slate-900 leading-tight mb-1">{surgery.patientName || surgery.name}</h3>
                                                <p className="text-xs text-slate-500 line-clamp-2 mb-2">{surgery.proc}</p>
                                                <div className="flex items-center gap-2 text-[11px] font-bold text-slate-500 bg-slate-50 px-2 py-1.5 rounded-lg w-fit">
                                                    <span className="material-symbols-outlined text-sm">person</span>
                                                    {surgery.doctor?.split(' ').slice(0, 2).join(' ')}
                                                </div>
                                            </div>
                                        ))}
                                    {pendingSurgeries.length === 0 && (
                                        <div className="text-center py-10 opacity-50">
                                            <span className="material-symbols-outlined text-4xl mb-2">search_off</span>
                                            <p className="text-sm font-bold">No se encontraron cirugías pendientes</p>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Right Column: Configuration */}
                            <div className="md:col-span-7 flex flex-col bg-slate-50/30">
                                <div className="flex-1 overflow-y-auto p-6">
                                    <div className="max-w-md mx-auto space-y-8">
                                        {selectedPendingId ? (
                                            (() => {
                                                const selectedSurgery = pendingSurgeries.find(s => s.id === selectedPendingId);
                                                return (
                                                    <>
                                                        {/* Quirofano Selection */}
                                                        <div className="space-y-3">
                                                            <label className="text-xs font-black text-slate-400 uppercase tracking-widest pl-1">Seleccionar Quirófano</label>
                                                            <div className="grid grid-cols-2 gap-3">
                                                                {ors.map(or => (
                                                                    <button
                                                                        key={or.id}
                                                                        onClick={() => setSelectedOrId(or.id)}
                                                                        className={`p-4 rounded-xl border text-left transition-all relative overflow-hidden ${selectedOrId === or.id
                                                                            ? 'bg-white border-primary shadow-lg shadow-primary/10 ring-1 ring-primary'
                                                                            : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                                                                            }`}
                                                                    >
                                                                        <span className={`text-sm font-black block mb-0.5 ${selectedOrId === or.id ? 'text-primary' : 'text-slate-700'}`}>{or.name}</span>
                                                                        <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">{or.institution?.name}</span>
                                                                        {selectedOrId === or.id && (
                                                                            <div className="absolute top-0 right-0 p-1.5 bg-primary rounded-bl-xl shadow-sm">
                                                                                <span className="material-symbols-outlined text-white text-sm block">check</span>
                                                                            </div>
                                                                        )}
                                                                    </button>
                                                                ))}
                                                            </div>
                                                        </div>

                                                        {/* Time Selection */}
                                                        <div className="space-y-3">
                                                            <label className="text-xs font-black text-slate-400 uppercase tracking-widest pl-1">Hora de Inicio</label>
                                                            <div className="relative">
                                                                <select
                                                                    value={selectedTimeSlot || ''}
                                                                    onChange={(e) => setSelectedTimeSlot(e.target.value)}
                                                                    className="w-full appearance-none bg-white border border-slate-200 rounded-xl px-4 py-3 pr-10 text-slate-900 font-bold text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all shadow-sm cursor-pointer hover:bg-slate-50"
                                                                >
                                                                    <option value="" disabled>-- Seleccionar Hora --</option>
                                                                    {Array.from({ length: 14 }, (_, i) => i + 7).map(h => (
                                                                        <React.Fragment key={h}>
                                                                            <option value={`${h.toString().padStart(2, '0')}:00`}>{h.toString().padStart(2, '0')}:00</option>
                                                                            <option value={`${h.toString().padStart(2, '0')}:30`}>{h.toString().padStart(2, '0')}:30</option>
                                                                        </React.Fragment>
                                                                    ))}
                                                                </select>
                                                                <span className="absolute right-4 top-1/2 -translate-y-1/2 material-symbols-outlined text-slate-400 pointer-events-none">schedule</span>
                                                            </div>
                                                        </div>

                                                        {/* Warnings & Info */}
                                                        {selectedSurgery?.priority === 'urgent' && !selectedSurgery?.doctorPriorityValidated && (
                                                            <div className="p-4 bg-orange-50 border border-orange-100 rounded-xl flex gap-3 animate-in fade-in slide-in-from-top-2">
                                                                <span className="material-symbols-outlined text-orange-500 mt-0.5">medical_services</span>
                                                                <div>
                                                                    <p className="text-xs font-bold text-orange-800 uppercase tracking-wide mb-1">Requiere Validación Médica</p>
                                                                    <p className="text-[11px] text-orange-700 leading-relaxed">
                                                                        Esta urgencia necesita aval médico. Solo se permite programar con al menos 14 días de antelación desde su creación si no está validada.
                                                                    </p>
                                                                </div>
                                                            </div>
                                                        )}

                                                        {selectedSurgery?.priority === 'emergency' && selectedPendingId && (
                                                            <div className="p-4 bg-red-50 border border-red-100 rounded-xl flex gap-3 animate-in fade-in slide-in-from-top-2">
                                                                <span className="material-symbols-outlined text-red-500 mt-0.5">priority_high</span>
                                                                <div>
                                                                    <p className="text-xs font-bold text-red-800 uppercase tracking-wide mb-1">Prioridad Máxima</p>
                                                                    <p className="text-[11px] text-red-700 leading-relaxed">
                                                                        EMERGENCIA: Esta cirugía tiene prioridad máxima y puede programarse de inmediato sin restricciones de materiales.
                                                                    </p>
                                                                </div>
                                                            </div>
                                                        )}

                                                        {!selectedSurgery?.needsOrthoValidation && selectedSurgery?.priority !== 'emergency' && selectedPendingId && (
                                                            <div className="p-4 bg-emerald-50 border border-emerald-100 rounded-xl flex gap-3 animate-in fade-in slide-in-from-top-2">
                                                                <span className="material-symbols-outlined text-emerald-500 mt-0.5">check_circle</span>
                                                                <div>
                                                                    <p className="text-xs font-bold text-emerald-800 uppercase tracking-wide mb-1">Listo para Agendar</p>
                                                                    <p className="text-[11px] text-emerald-700 leading-relaxed">
                                                                        Esta cirugía no requiere materiales de ortopedia y puede programarse sin restricciones de antelación.
                                                                    </p>
                                                                </div>
                                                            </div>
                                                        )}

                                                        {selectedTimeSlot && (
                                                            <div className="mt-8 p-6 bg-primary/5 border border-primary/20 rounded-2xl flex items-center gap-4 animate-in slide-in-from-bottom-2 duration-300 shadow-lg shadow-primary/5">
                                                                <div className="size-12 bg-primary text-white rounded-xl flex items-center justify-center shadow-lg shadow-primary/30 shrink-0">
                                                                    <span className="material-symbols-outlined">event_available</span>
                                                                </div>
                                                                <div>
                                                                    <p className="text-sm font-black text-slate-900 leading-tight uppercase tracking-tight">Confirmar Programación</p>
                                                                    <p className="text-xs font-medium text-slate-500 mt-1">
                                                                        Se agendará a las <strong className="text-slate-800 bg-white px-1 rounded shadow-sm">{selectedTimeSlot}</strong> en <strong className="text-slate-800 bg-white px-1 rounded shadow-sm">{ors.find(o => o.id === selectedOrId)?.name}</strong>.
                                                                    </p>
                                                                </div>
                                                            </div>
                                                        )}
                                                    </>
                                                );
                                            })()
                                        ) : (
                                            <div className="h-full flex flex-col items-center justify-center text-slate-300 py-20">
                                                <div className="size-24 rounded-full bg-slate-50 flex items-center justify-center mb-6 shadow-inner">
                                                    <span className="material-symbols-outlined text-5xl opacity-50">touch_app</span>
                                                </div>
                                                <p className="text-lg font-black uppercase tracking-tight text-slate-400">Seleccione una cirugía</p>
                                                <p className="text-xs font-semibold text-slate-400 max-w-[200px] text-center mt-2">Elija una cirugía pendiente del panel izquierdo para comenzar la programación.</p>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <div className="p-6 border-t border-slate-200/60 bg-white/60 backdrop-blur-md flex justify-end gap-3 sticky bottom-0 z-10">
                                    <button onClick={() => setShowModal(false)} className="px-6 py-2.5 text-slate-500 font-bold hover:bg-slate-100 rounded-xl transition-all">
                                        Cancelar
                                    </button>
                                    <button
                                        disabled={!selectedPendingId || !selectedTimeSlot}
                                        onClick={handleConfirmSchedule}
                                        className="px-8 py-2.5 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl font-black text-sm shadow-xl shadow-slate-900/20 transition-all active:scale-95 flex items-center gap-2"
                                    >
                                        <span className="material-symbols-outlined text-lg">save</span>
                                        Guardar Programación
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Calendar;