import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { supabase } from '../src/lib/supabase';
import { useAuth } from '../src/lib/AuthContext';
import {
  ConsultingRoom,
  ConsultingProfessional,
  ConsultingSchedule,
  CalendarHoliday,
  ConsultingCalendarException,
  ConsultingEquipment
} from '../types';

type ViewMode = 'calendar' | 'grid' | 'professionals' | 'analytics' | 'financial' | 'management';

const DAYS = [
  { id: 1, name: 'Lunes', short: 'Lun' },
  { id: 2, name: 'Martes', short: 'Mar' },
  { id: 3, name: 'Miércoles', short: 'Mié' },
  { id: 4, name: 'Jueves', short: 'Jue' },
  { id: 5, name: 'Viernes', short: 'Vie' },
];

const MONTH_NAMES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

// Genera slots de 30 minutos entre 07:00 y 21:00
const TIME_SLOTS: string[] = [];
for (let h = 7; h <= 20; h++) {
  TIME_SLOTS.push(`${String(h).padStart(2, '0')}:00`);
  TIME_SLOTS.push(`${String(h).padStart(2, '0')}:30`);
}
TIME_SLOTS.push('21:00');

// Helper para convertir HH:mm:ss a minutos
const timeToMinutes = (timeStr: string): number => {
  if (!timeStr) return 0;
  const parts = timeStr.split(':');
  return parseInt(parts[0], 10) * 60 + parseInt(parts[1] || '0', 10);
};

// Formato de hora simple HH:mm
const formatTime = (timeStr: string): string => {
  if (!timeStr) return '';
  return timeStr.slice(0, 5);
};

// Formato local YYYY-MM-DD
const formatDateToISO = (d: Date): string => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

export const ConsultingRoomsPage: React.FC = () => {
  const { user } = useAuth();

  // Estados de datos
  const [rooms, setRooms] = useState<ConsultingRoom[]>([]);
  const [professionals, setProfessionals] = useState<ConsultingProfessional[]>([]);
  const [schedules, setSchedules] = useState<ConsultingSchedule[]>([]);
  const [systemDoctors, setSystemDoctors] = useState<{ id: string; full_name: string; specialty?: string; license_number?: string }[]>([]);
  const [systemUsers, setSystemUsers] = useState<{ id: string; name: string; email?: string; role?: string }[]>([]);
  const [holidays, setHolidays] = useState<CalendarHoliday[]>([]);
  const [calendarExceptions, setCalendarExceptions] = useState<ConsultingCalendarException[]>([]);
  const [equipmentCatalog, setEquipmentCatalog] = useState<ConsultingEquipment[]>([]);
  const [newEquipmentInput, setNewEquipmentInput] = useState<string>('');
  const [loading, setLoading] = useState(true);

  // Estados de UI y Filtros
  const [viewMode, setViewMode] = useState<ViewMode>('calendar');
  const [selectedDay, setSelectedDay] = useState<number>(1); // Lunes por defecto para grilla semanal
  const [selectedSector, setSelectedSector] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [selectedProfessionalId, setSelectedProfessionalId] = useState<string | null>(null);

  // Estados de Calendario con Fechas Reales
  const [currentCalendarDate, setCurrentCalendarDate] = useState<Date>(new Date());
  const [selectedCalendarDateStr, setSelectedCalendarDateStr] = useState<string>(() => formatDateToISO(new Date()));
  const [calendarSubView, setCalendarSubView] = useState<'day' | 'month'>('day');

  // Modales
  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<Partial<ConsultingSchedule> | null>(null);
  const [isRoomModalOpen, setIsRoomModalOpen] = useState(false);
  const [editingRoom, setEditingRoom] = useState<Partial<ConsultingRoom> | null>(null);
  const [isProfModalOpen, setIsProfModalOpen] = useState(false);
  const [editingProf, setEditingProf] = useState<Partial<ConsultingProfessional> | null>(null);
  const [isExceptionModalOpen, setIsExceptionModalOpen] = useState(false);
  const [editingException, setEditingException] = useState<Partial<ConsultingCalendarException> | null>(null);

  // Buscador Inteligente de Turnos Libres
  const [isFreeSlotFinderOpen, setIsFreeSlotFinderOpen] = useState(false);
  const [finderDay, setFinderDay] = useState<number>(1); // Lunes por defecto
  const [finderStartTime, setFinderStartTime] = useState<string>('14:00');
  const [finderEndTime, setFinderEndTime] = useState<string>('18:00');
  const [finderSelectedEquipments, setFinderSelectedEquipments] = useState<string[]>([]);
  const [finderSector, setFinderSector] = useState<string>('all');
  const [finderMinDurationMin, setFinderMinDurationMin] = useState<number>(30); // Duración mínima por tramo (30, 60, 120 mins)
  const [finderExcludedRoomIds, setFinderExcludedRoomIds] = useState<string[]>([]);
  const [finderSelectedProfId, setFinderSelectedProfId] = useState<string>('');
  const [finderSpecificDate, setFinderSpecificDate] = useState<string>(() => formatDateToISO(new Date()));
  const [saving, setSaving] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Drag and Drop de bloques de horarios (Mover entre horarios, consultorios o días)
  const [isReorganizeMode, setIsReorganizeMode] = useState(false);
  const [draggedSchedule, setDraggedSchedule] = useState<ConsultingSchedule | null>(null);
  const draggedScheduleRef = useRef<ConsultingSchedule | null>(null);
  const dragOffsetYRef = useRef<number>(0); // Offset Y dentro de la tarjeta donde se inicia el drag
  const reorganizeSnapshotRef = useRef<ConsultingSchedule[]>([]); // Snapshot para poder cancelar/revertir
  const [dragOverTarget, setDragOverTarget] = useState<{ roomId?: string; slot?: string; dayId?: number } | null>(null);

  const canEdit = useMemo(() => {
    if (!user) return false;
    const role = user.role?.toLowerCase();
    return (
      role === 'superadmin' ||
      role === 'direccion' ||
      role === 'administrativo' ||
      role === 'administrativo direccion' ||
      role === 'administrativo art' ||
      role === 'administrativo de guardias'
    );
  }, [user]);

  // Privilegio exclusivo para Dirección y SuperAdmin (Tarifas y Finanzas)
  const isExecutive = useMemo(() => {
    if (!user) return false;
    const role = user.role?.toLowerCase();
    return role === 'superadmin' || role === 'direccion';
  }, [user]);

  // Carga de datos
  const fetchData = async () => {
    try {
      setLoading(true);
      const [roomsRes, profsRes, schedsRes, docsRes, usersRes, holsRes, exceptsRes, equipRes] = await Promise.all([
        supabase.from('consulting_rooms').select('*').order('display_order', { ascending: true }),
        supabase.from('consulting_professionals').select('*').order('full_name', { ascending: true }),
        supabase
          .from('consulting_room_schedules')
          .select('*, consulting_rooms(*), consulting_professionals(*)')
          .eq('active', true),
        supabase.from('doctors').select('id, full_name, specialty, license_number').eq('active', true).order('full_name', { ascending: true }),
        supabase.from('users').select('id, name, email, role').eq('active', true).order('name', { ascending: true }),
        supabase.from('calendar_holidays').select('*').order('date', { ascending: true }),
        supabase
          .from('consulting_calendar_exceptions')
          .select('*, consulting_rooms(*), consulting_professionals!professional_id(*), substitute_professionals:consulting_professionals!substitute_professional_id(*)')
          .eq('active', true),
        supabase.from('consulting_room_equipment_catalog').select('*').order('name', { ascending: true })
      ]);

      if (roomsRes.data) setRooms(roomsRes.data);
      if (profsRes.data) setProfessionals(profsRes.data);
      if (schedsRes.data) setSchedules(schedsRes.data);
      if (docsRes.data) setSystemDoctors(docsRes.data);
      if (usersRes.data) setSystemUsers(usersRes.data);
      if (holsRes.data) setHolidays(holsRes.data);
      if (exceptsRes.data) setCalendarExceptions(exceptsRes.data);
      if (equipRes.data) setEquipmentCatalog(equipRes.data);
    } catch (err) {
      console.error('Error fetching consulting data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Notificaciones temporales
  const showFeedback = (text: string, type: 'success' | 'error' = 'success') => {
    setFeedbackMsg({ type, text });
    setTimeout(() => setFeedbackMsg(null), 4000);
  };

  // Sectores disponibles
  const sectors = useMemo(() => {
    const list = Array.from(new Set(rooms.map(r => r.sector || 'General')));
    return ['all', ...list];
  }, [rooms]);

  // Consultorios filtrados
  const filteredRooms = useMemo(() => {
    return rooms.filter(r => {
      if (!r.active) return false;
      if (selectedSector !== 'all' && r.sector !== selectedSector) return false;
      return true;
    });
  }, [rooms, selectedSector]);

  // Mapeo rápido de horarios activos por consultorio y día
  const daySchedules = useMemo(() => {
    return schedules.filter(s => s.day_of_week === selectedDay);
  }, [schedules, selectedDay]);

  // Métricas de Ocupación
  const analytics = useMemo(() => {
    const totalWorkingHoursPerDay = 14; // 07:00 a 21:00 = 14hs
    const totalDays = 5;
    const activeRoomsCount = rooms.filter(r => r.active).length;
    const totalCapacityHours = activeRoomsCount * totalWorkingHoursPerDay * totalDays;

    let totalOccupiedMinutes = 0;
    const roomOccupationMap: Record<string, number> = {};
    const dayOccupationMap: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    const profHoursMap: Record<string, { name: string; specialty: string; minutes: number }> = {};

    schedules.forEach(s => {
      const startMin = timeToMinutes(s.start_time);
      const endMin = timeToMinutes(s.end_time);
      const diff = Math.max(0, endMin - startMin);

      totalOccupiedMinutes += diff;
      roomOccupationMap[s.consulting_room_id] = (roomOccupationMap[s.consulting_room_id] || 0) + diff;
      dayOccupationMap[s.day_of_week] = (dayOccupationMap[s.day_of_week] || 0) + diff;

      const profName = s.consulting_professionals?.full_name || 'Desconocido';
      const profSpec = s.consulting_professionals?.specialty || 'General';
      if (!profHoursMap[s.professional_id]) {
        profHoursMap[s.professional_id] = { name: profName, specialty: profSpec, minutes: 0 };
      }
      profHoursMap[s.professional_id].minutes += diff;
    });

    const totalOccupiedHours = Math.round((totalOccupiedMinutes / 60) * 10) / 10;
    const globalRate = totalCapacityHours > 0 ? Math.round((totalOccupiedHours / totalCapacityHours) * 100) : 0;

    // Cálculo Financiero Ejecutivo (Semanas por mes promedio = 4.33)
    const WEEKS_PER_MONTH = 4.33;
    let totalWeeklyProjectedRevenue = 0;
    let totalMonthlyProjectedRevenue = 0;
    let totalPotentialMonthlyRevenue = 0;

    // Métricas financieras por consultorio
    const roomFinancials: Record<
      string,
      {
        roomId: string;
        roomName: string;
        sector: string;
        equipment: string[];
        hourlyRate: number;
        occupiedHours: number;
        weeklyRevenue: number;
        monthlyRevenue: number;
        potentialMonthlyRevenue: number;
        occupancyRate: number;
      }
    > = {};

    rooms.forEach(r => {
      const roomMins = roomOccupationMap[r.id] || 0;
      const occHs = Math.round((roomMins / 60) * 10) / 10;
      const baseRate = Number(r.hourly_rate) || 0;
      const capWeeklyHs = 70; // 14hs x 5 días
      const potMonthRev = capWeeklyHs * baseRate * WEEKS_PER_MONTH;
      totalPotentialMonthlyRevenue += potMonthRev;

      // Calcular ingresos reales según las asignaciones y si el profesional tiene tarifa personalizada
      const rScheds = schedules.filter(s => s.consulting_room_id === r.id);
      let rWeeklyRev = 0;
      rScheds.forEach(s => {
        const diffHs = Math.max(0, timeToMinutes(s.end_time) - timeToMinutes(s.start_time)) / 60;
        const prof = professionals.find(p => p.id === s.professional_id);
        const effectiveRate = prof?.custom_hourly_rate != null ? Number(prof.custom_hourly_rate) : baseRate;
        rWeeklyRev += diffHs * effectiveRate;
      });

      const rMonthlyRev = rWeeklyRev * WEEKS_PER_MONTH;
      totalWeeklyProjectedRevenue += rWeeklyRev;
      totalMonthlyProjectedRevenue += rMonthlyRev;

      roomFinancials[r.id] = {
        roomId: r.id,
        roomName: r.name,
        sector: r.sector,
        equipment: r.equipment || [],
        hourlyRate: baseRate,
        occupiedHours: occHs,
        weeklyRevenue: Math.round(rWeeklyRev),
        monthlyRevenue: Math.round(rMonthlyRev),
        potentialMonthlyRevenue: Math.round(potMonthRev),
        occupancyRate: Math.round((occHs / capWeeklyHs) * 100)
      };
    });

    // Métricas financieras por profesional
    const profFinancials = professionals.map(prof => {
      const profScheds = schedules.filter(s => s.professional_id === prof.id);
      let weeklyMinutes = 0;
      let weeklyRevenue = 0;

      profScheds.forEach(s => {
        const diffMin = Math.max(0, timeToMinutes(s.end_time) - timeToMinutes(s.start_time));
        weeklyMinutes += diffMin;
        const room = rooms.find(r => r.id === s.consulting_room_id);
        const effectiveRate = prof.custom_hourly_rate != null
          ? Number(prof.custom_hourly_rate)
          : (Number(room?.hourly_rate) || 0);
        weeklyRevenue += (diffMin / 60) * effectiveRate;
      });

      const weeklyHours = Math.round((weeklyMinutes / 60) * 10) / 10;
      const monthlyRevenue = Math.round(weeklyRevenue * WEEKS_PER_MONTH);

      return {
        profId: prof.id,
        fullName: prof.full_name,
        specialty: prof.specialty || 'General',
        customRate: prof.custom_hourly_rate,
        weeklyHours,
        weeklyRevenue: Math.round(weeklyRevenue),
        monthlyRevenue
      };
    }).sort((a, b) => b.monthlyRevenue - a.monthlyRevenue);

    return {
      totalCapacityHours,
      totalOccupiedHours,
      globalRate,
      roomOccupationMap,
      dayOccupationMap,
      profHoursMap,
      totalWeeklyProjectedRevenue: Math.round(totalWeeklyProjectedRevenue),
      totalMonthlyProjectedRevenue: Math.round(totalMonthlyProjectedRevenue),
      totalPotentialMonthlyRevenue: Math.round(totalPotentialMonthlyRevenue),
      roomFinancials,
      profFinancials
    };
  }, [rooms, schedules, professionals]);

  // Cálculo de Opciones de Turnos Libres Disponibles y Paquetes Combinados (Buscador Inteligente)
  const finderSolutions = useMemo(() => {
    const qStart = timeToMinutes(finderStartTime);
    const qEnd = timeToMinutes(finderEndTime);
    if (qEnd <= qStart) return { singleRoomSlots: [], combinationPackages: [] };

    // Filtrar consultorios según criterios avanzados a tener en cuenta:
    const candidateRooms = rooms.filter(r => {
      if (!r.active) return false;
      // Consultorios explícitamente excluidos por el usuario
      if (finderExcludedRoomIds.includes(r.id)) return false;
      // Filtro de Sector
      if (finderSector !== 'all' && r.sector !== finderSector) return false;
      // Filtro de Equipamiento / Accesorios requeridos (todos los seleccionados deben estar presentes)
      if (finderSelectedEquipments.length > 0) {
        const roomEqs = r.equipment || [];
        const hasAllRequired = finderSelectedEquipments.every(req => roomEqs.includes(req));
        if (!hasAllRequired) return false;
      }
      return true;
    });

    const dayScheds = schedules.filter(s => s.day_of_week === finderDay);

    // 1. Calcular intervalos libres por consultorio
    const singleRoomSlots: {
      room: ConsultingRoom;
      freeIntervals: { startMin: number; endMin: number; startStr: string; endStr: string; durationMin: number }[];
      isFullyAvailable: boolean;
    }[] = [];

    const minToStr = (m: number) =>
      `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

    // Lista plana de todos los bloques libres individuales para combinatoria
    const allFreeSegments: {
      room: ConsultingRoom;
      startMin: number;
      endMin: number;
      startStr: string;
      endStr: string;
    }[] = [];

    candidateRooms.forEach(room => {
      const rOccupied = dayScheds
        .filter(s => s.consulting_room_id === room.id)
        .map(s => ({
          start: timeToMinutes(s.start_time),
          end: timeToMinutes(s.end_time)
        }))
        .sort((a, b) => a.start - b.start);

      const freeIntervals: { startMin: number; endMin: number; startStr: string; endStr: string; durationMin: number }[] = [];
      let cursor = qStart;

      for (const occ of rOccupied) {
        if (occ.end <= cursor) continue;
        if (occ.start >= qEnd) break;

        if (occ.start > cursor) {
          const freeStart = cursor;
          const freeEnd = Math.min(occ.start, qEnd);
          if (freeEnd > freeStart) {
            const seg = {
              startMin: freeStart,
              endMin: freeEnd,
              startStr: minToStr(freeStart),
              endStr: minToStr(freeEnd),
              durationMin: freeEnd - freeStart
            };
            freeIntervals.push(seg);
            allFreeSegments.push({ room, ...seg });
          }
        }
        cursor = Math.max(cursor, occ.end);
      }

      if (cursor < qEnd) {
        const freeStart = cursor;
        const freeEnd = qEnd;
        const seg = {
          startMin: freeStart,
          endMin: freeEnd,
          startStr: minToStr(freeStart),
          endStr: minToStr(freeEnd),
          durationMin: freeEnd - freeStart
        };
        freeIntervals.push(seg);
        allFreeSegments.push({ room, ...seg });
      }

      const isFullyAvailable =
        freeIntervals.length === 1 &&
        freeIntervals[0].startMin === qStart &&
        freeIntervals[0].endMin === qEnd;

      if (freeIntervals.length > 0) {
        singleRoomSlots.push({
          room,
          freeIntervals,
          isFullyAvailable
        });
      }
    });

    // Ordenar individuales: primero 100% libres
    singleRoomSlots.sort((a, b) => {
      if (a.isFullyAvailable && !b.isFullyAvailable) return -1;
      if (!a.isFullyAvailable && b.isFullyAvailable) return 1;
      const durA = a.freeIntervals.reduce((acc, i) => acc + i.durationMin, 0);
      const durB = b.freeIntervals.reduce((acc, i) => acc + i.durationMin, 0);
      return durB - durA;
    });

    // 2. Algoritmo de "Paquetes Combinados":
    // Si ningún consultorio individual cubre el 100% o como alternativa de rotación de consultorios,
    // buscamos combinaciones continuas (ej. de 14:00 a 16:00 en C2 y de 16:00 a 18:00 en C3)
    const combinationPackages: {
      id: string;
      legs: { room: ConsultingRoom; startMin: number; endMin: number; startStr: string; endStr: string }[];
      totalCoverageMin: number;
      isCompleteCoverage: boolean;
    }[] = [];

    // Algoritmo recursivo / encadenado para encontrar caminos que cubran de qStart a qEnd cambiando de sala
    const findChains = (
      currentMin: number,
      currentLegs: { room: ConsultingRoom; startMin: number; endMin: number; startStr: string; endStr: string }[],
      usedRoomIds: Set<string>
    ) => {
      if (currentMin >= qEnd) {
        if (currentLegs.length > 1) {
          combinationPackages.push({
            id: currentLegs.map(l => `${l.room.name}_${l.startStr}-${l.endStr}`).join('__'),
            legs: [...currentLegs],
            totalCoverageMin: qEnd - qStart,
            isCompleteCoverage: true
          });
        }
        return;
      }

      // Buscar segmentos que comiencen exactamente en currentMin o que lo contengan
      const matchingSegments = allFreeSegments.filter(
        seg => seg.startMin <= currentMin && seg.endMin > currentMin && !usedRoomIds.has(seg.room.id)
      );

      for (const seg of matchingSegments) {
        const nextEnd = Math.min(seg.endMin, qEnd);
        const legDuration = nextEnd - currentMin;
        // Respetar duración mínima por consultorio en un paquete (ej. no cambiar de consultorio por menos de 30 o 60 minutos)
        if (legDuration < finderMinDurationMin && nextEnd < qEnd) continue;

        const newUsed = new Set(usedRoomIds);
        newUsed.add(seg.room.id);

        findChains(
          nextEnd,
          [
            ...currentLegs,
            {
              room: seg.room,
              startMin: currentMin,
              endMin: nextEnd,
              startStr: minToStr(currentMin),
              endStr: minToStr(nextEnd)
            }
          ],
          newUsed
        );
        if (combinationPackages.length >= 6) break; // Máximo 6 paquetes recomendados
      }
    };

    findChains(qStart, [], new Set());

    return {
      singleRoomSlots,
      combinationPackages: combinationPackages.slice(0, 5) // Máximo 5 mejores paquetes combinados
    };
  }, [rooms, schedules, finderDay, finderStartTime, finderEndTime, finderSector, finderSelectedEquipments, finderExcludedRoomIds, finderMinDurationMin]);

  // Reserva en Paquete Combinado (para siempre o puntual)
  const handleBookPackage = async (
    pkg: { legs: { room: ConsultingRoom; startMin: number; endMin: number; startStr: string; endStr: string }[] },
    mode: 'permanent' | 'specific'
  ) => {
    if (!finderSelectedProfId && professionals.length === 0) {
      showFeedback('Seleccione un profesional para reservar', 'error');
      return;
    }
    const profId = finderSelectedProfId || professionals[0]?.id;
    const profName = professionals.find(p => p.id === profId)?.full_name || 'Profesional';

    setSaving(true);
    try {
      if (mode === 'permanent') {
        // Inserción en batch de las piernas del paquete en consulting_room_schedules
        const inserts = pkg.legs.map(leg => ({
          consulting_room_id: leg.room.id,
          professional_id: profId,
          day_of_week: finderDay,
          start_time: `${leg.startStr}:00`,
          end_time: `${leg.endStr}:00`,
          active: true,
          notes: `Paquete combinado (${pkg.legs.map(l => `${l.room.name}: ${l.startStr}-${l.endStr}`).join(' + ')})`
        }));

        const { error } = await supabase.from('consulting_room_schedules').insert(inserts);
        if (error) throw error;
        showFeedback(`¡Paquete semanal fijado con éxito para ${profName}!`);
      } else {
        // Inserción en batch de excepciones de calendario
        const inserts = pkg.legs.map(leg => ({
          exception_type: 'horario_especial',
          consulting_room_id: leg.room.id,
          professional_id: profId,
          start_date: finderSpecificDate,
          end_date: finderSpecificDate,
          start_time: `${leg.startStr}:00`,
          end_time: `${leg.endStr}:00`,
          active: true,
          reason: `Paquete puntual combinado (${pkg.legs.map(l => `${l.room.name}: ${l.startStr}-${l.endStr}`).join(' + ')})`
        }));

        const { error } = await supabase.from('consulting_calendar_exceptions').insert(inserts);
        if (error) throw error;
        showFeedback(`¡Paquete para la fecha ${finderSpecificDate} reservado con éxito!`);
      }

      setIsFreeSlotFinderOpen(false);
      await fetchData();
    } catch (err: any) {
      console.error('Error guardando paquete:', err);
      showFeedback(err.message || 'Error al procesar reserva de paquete', 'error');
    } finally {
      setSaving(false);
    }
  };

  // Manejadores de creación/edición de asignaciones
  const handleOpenNewSchedule = (roomId?: string, timeSlot?: string) => {
    let nextHour = '08:00';
    if (timeSlot) {
      const min = timeToMinutes(timeSlot);
      const nextMin = min + 60;
      nextHour = `${String(Math.floor(nextMin / 60)).padStart(2, '0')}:${String(nextMin % 60).padStart(2, '0')}`;
    }
    setEditingSchedule({
      consulting_room_id: roomId || filteredRooms[0]?.id || '',
      professional_id: professionals[0]?.id || '',
      day_of_week: selectedDay,
      start_time: timeSlot ? `${timeSlot}:00` : '08:00:00',
      end_time: `${nextHour}:00`,
      active: true,
      notes: ''
    });
    setIsScheduleModalOpen(true);
  };

  const handleEditSchedule = (schedule: ConsultingSchedule) => {
    setEditingSchedule({ ...schedule });
    setIsScheduleModalOpen(true);
  };

  const handleSaveSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSchedule?.consulting_room_id || !editingSchedule.professional_id) {
      showFeedback('Por favor complete todos los campos obligatorios', 'error');
      return;
    }

    const startMin = timeToMinutes(editingSchedule.start_time || '');
    const endMin = timeToMinutes(editingSchedule.end_time || '');

    if (endMin <= startMin) {
      showFeedback('La hora de finalización debe ser posterior a la de inicio', 'error');
      return;
    }

    // Validación de solapamiento en el mismo consultorio y día
    const overlap = schedules.find(s => {
      if (s.id === editingSchedule.id) return false;
      if (s.consulting_room_id !== editingSchedule.consulting_room_id) return false;
      if (s.day_of_week !== editingSchedule.day_of_week) return false;
      const sStart = timeToMinutes(s.start_time);
      const sEnd = timeToMinutes(s.end_time);
      return Math.max(startMin, sStart) < Math.min(endMin, sEnd);
    });

    if (overlap) {
      const profName = overlap.consulting_professionals?.full_name || 'Otro profesional';
      showFeedback(`Conflicto de horario: Ya está ocupado por ${profName} (${formatTime(overlap.start_time)} - ${formatTime(overlap.end_time)})`, 'error');
      return;
    }

    setSaving(true);
    try {
      if (editingSchedule.id) {
        // Actualizar
        const { error } = await supabase
          .from('consulting_room_schedules')
          .update({
            consulting_room_id: editingSchedule.consulting_room_id,
            professional_id: editingSchedule.professional_id,
            day_of_week: editingSchedule.day_of_week,
            start_time: editingSchedule.start_time,
            end_time: editingSchedule.end_time,
            notes: editingSchedule.notes || null,
            updated_at: new Date().toISOString()
          })
          .eq('id', editingSchedule.id);

        if (error) throw error;
        showFeedback('Horario actualizado con éxito');
      } else {
        // Insertar nuevo
        const { error } = await supabase.from('consulting_room_schedules').insert({
          consulting_room_id: editingSchedule.consulting_room_id,
          professional_id: editingSchedule.professional_id,
          day_of_week: editingSchedule.day_of_week,
          start_time: editingSchedule.start_time,
          end_time: editingSchedule.end_time,
          notes: editingSchedule.notes || null,
          active: true
        });

        if (error) throw error;
        showFeedback('Horario asignado exitosamente');
      }

      setIsScheduleModalOpen(false);
      setEditingSchedule(null);
      await fetchData();
    } catch (err: any) {
      console.error('Error guardando horario:', err);
      showFeedback(err.message || 'Error al guardar el horario', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteSchedule = async (id: string) => {
    if (!confirm('¿Está seguro de eliminar esta asignación de horario?')) return;
    try {
      const { error } = await supabase.from('consulting_room_schedules').delete().eq('id', id);
      if (error) throw error;
      showFeedback('Horario eliminado');
      await fetchData();
    } catch (err: any) {
      console.error('Error borrando horario:', err);
      showFeedback('No se pudo eliminar el horario', 'error');
    }
  };

  // Mover asignación de horario mediante Drag and Drop (cambio de franja o consultorio)
  // Mover horario — solo actualiza estado local durante reorganización (sin DB)
  // La persistencia ocurre al finalizar con handleFinalizeReorganize
  const handleMoveSchedule = (schedOrId: ConsultingSchedule | string, newRoomId: string, newStartSlot: string) => {
    let schedule: ConsultingSchedule | undefined;
    if (typeof schedOrId === 'string') {
      schedule = schedules.find(s => s.id === schedOrId) || (draggedScheduleRef.current?.id === schedOrId ? draggedScheduleRef.current : undefined);
    } else {
      schedule = schedOrId;
    }
    if (!schedule) schedule = draggedScheduleRef.current || draggedSchedule || undefined;
    if (!schedule) {
      console.warn('handleMoveSchedule: No se encontró el horario a mover');
      return;
    }

    const origStartMin = timeToMinutes(schedule.start_time);
    const origEndMin = timeToMinutes(schedule.end_time);
    const durationMin = origEndMin - origStartMin;
    const newStartMin = timeToMinutes(newStartSlot);
    const newEndMin = newStartMin + durationMin;

    if (schedule.consulting_room_id === newRoomId && origStartMin === newStartMin) return;

    if (newEndMin > 21 * 60) {
      showFeedback('El turno se extiende más allá del horario límite (21:00)', 'error');
      return;
    }

    const newStartTimeStr = `${newStartSlot}:00`;
    const newEndHH = String(Math.floor(newEndMin / 60)).padStart(2, '0');
    const newEndMM = String(newEndMin % 60).padStart(2, '0');
    const newEndTimeStr = `${newEndHH}:${newEndMM}:00`;

    const overlap = schedules.find(s => {
      if (s.id === schedule!.id) return false;
      if (s.consulting_room_id !== newRoomId) return false;
      if (s.day_of_week !== schedule!.day_of_week) return false;
      const sStart = timeToMinutes(s.start_time);
      const sEnd = timeToMinutes(s.end_time);
      return Math.max(newStartMin, sStart) < Math.min(newEndMin, sEnd);
    });
    if (overlap) {
      const profName = overlap.consulting_professionals?.full_name || 'Otro profesional';
      showFeedback(`Conflicto: ${profName} ya ocupa ese horario (${formatTime(overlap.start_time)} - ${formatTime(overlap.end_time)})`, 'error');
      return;
    }

    // Solo estado local — la DB se actualiza al presionar "Guardar Reorganización"
    setSchedules(prev =>
      prev.map(s =>
        s.id === schedule!.id
          ? { ...s, consulting_room_id: newRoomId, start_time: newStartTimeStr, end_time: newEndTimeStr }
          : s
      )
    );
    const targetRoom = rooms.find(r => r.id === newRoomId);
    showFeedback(`Movido a ${targetRoom?.name || 'consultorio'} — ${newStartSlot} a ${newEndHH}:${newEndMM} (sin guardar)`);
  };

  // Mover a otro día — solo estado local durante reorganización
  const handleMoveScheduleToDay = (schedOrId: ConsultingSchedule | string, targetDayId: number) => {
    let schedule: ConsultingSchedule | undefined;
    if (typeof schedOrId === 'string') {
      schedule = schedules.find(s => s.id === schedOrId) || (draggedScheduleRef.current?.id === schedOrId ? draggedScheduleRef.current : undefined);
    } else {
      schedule = schedOrId;
    }
    if (!schedule) schedule = draggedScheduleRef.current || draggedSchedule || undefined;
    if (!schedule) {
      console.warn('handleMoveScheduleToDay: No se encontró el horario a mover');
      return;
    }
    if (schedule.day_of_week === targetDayId) return;

    const startMin = timeToMinutes(schedule.start_time);
    const endMin = timeToMinutes(schedule.end_time);
    const overlap = schedules.find(s => {
      if (s.id === schedule!.id) return false;
      if (s.consulting_room_id !== schedule!.consulting_room_id) return false;
      if (s.day_of_week !== targetDayId) return false;
      const sStart = timeToMinutes(s.start_time);
      const sEnd = timeToMinutes(s.end_time);
      return Math.max(startMin, sStart) < Math.min(endMin, sEnd);
    });
    if (overlap) {
      const profName = overlap.consulting_professionals?.full_name || 'Otro profesional';
      const targetDayName = DAYS.find(d => d.id === targetDayId)?.name || 'Ese día';
      showFeedback(`Conflicto en ${targetDayName}: ${profName} ya ocupa ese horario`, 'error');
      return;
    }

    setSchedules(prev => prev.map(s => (s.id === schedule!.id ? { ...s, day_of_week: targetDayId } : s)));
    const targetDayName = DAYS.find(d => d.id === targetDayId)?.name || 'nuevo día';
    showFeedback(`Movido al ${targetDayName} (sin guardar)`);
    setSelectedDay(targetDayId);
  };

  // Guardar todos los cambios de la reorganización a la DB
  const handleFinalizeReorganize = async () => {
    const snapshot = reorganizeSnapshotRef.current;
    const changed = schedules.filter(s => {
      const orig = snapshot.find(o => o.id === s.id);
      if (!orig) return false;
      return (
        orig.consulting_room_id !== s.consulting_room_id ||
        orig.start_time !== s.start_time ||
        orig.end_time !== s.end_time ||
        orig.day_of_week !== s.day_of_week
      );
    });

    if (changed.length === 0) {
      setIsReorganizeMode(false);
      reorganizeSnapshotRef.current = [];
      showFeedback('Sin cambios para guardar');
      return;
    }

    setSaving(true);
    try {
      for (const s of changed) {
        const { error } = await supabase
          .from('consulting_room_schedules')
          .update({
            consulting_room_id: s.consulting_room_id,
            start_time: s.start_time,
            end_time: s.end_time,
            day_of_week: s.day_of_week
          })
          .eq('id', s.id);
        if (error) throw error;
      }
      showFeedback(`✓ ${changed.length} turno${changed.length > 1 ? 's' : ''} reorganizado${changed.length > 1 ? 's' : ''} y guardados`);
    } catch (err: any) {
      console.error('Error al guardar reorganización:', err);
      // Revertir al snapshot si falla
      setSchedules(snapshot);
      showFeedback(err.message || 'Error al guardar. Los cambios fueron revertidos.', 'error');
    } finally {
      setSaving(false);
      setIsReorganizeMode(false);
      reorganizeSnapshotRef.current = [];
    }
  };

  // Cancelar reorganización — restaura el snapshot sin tocar la DB
  const handleCancelReorganize = () => {
    setSchedules(reorganizeSnapshotRef.current);
    reorganizeSnapshotRef.current = [];
    setIsReorganizeMode(false);
    setDraggedSchedule(null);
    draggedScheduleRef.current = null;
    setDragOverTarget(null);
    showFeedback('Reorganización cancelada — se restauró el estado original');
  };

  // Guardar Consultorio (incluye equipamiento y tarifa horaria)
  const handleSaveRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRoom?.name) return;
    setSaving(true);
    try {
      const roomPayload = {
        name: editingRoom.name,
        sector: editingRoom.sector || 'Planta Principal',
        color: editingRoom.color || '#3B82F6',
        equipment: editingRoom.equipment || [],
        hourly_rate: Number(editingRoom.hourly_rate) || 0,
        active: editingRoom.active !== undefined ? editingRoom.active : true,
        updated_at: new Date().toISOString()
      };

      if (editingRoom.id) {
        const { error } = await supabase
          .from('consulting_rooms')
          .update(roomPayload)
          .eq('id', editingRoom.id);
        if (error) throw error;
        showFeedback('Consultorio actualizado');
      } else {
        const { error } = await supabase.from('consulting_rooms').insert({
          ...roomPayload,
          display_order: rooms.length + 1,
          active: true
        });
        if (error) throw error;
        showFeedback('Consultorio creado exitosamente');
      }
      setIsRoomModalOpen(false);
      setEditingRoom(null);
      await fetchData();
    } catch (err: any) {
      showFeedback(err.message || 'Error al guardar consultorio', 'error');
    } finally {
      setSaving(false);
    }
  };

  // Agregar nuevo tipo de equipamiento al catálogo global
  const handleAddEquipmentCatalogItem = async () => {
    const trimmed = newEquipmentInput.trim();
    if (!trimmed) return;
    try {
      const existing = equipmentCatalog.find(e => e.name.toLowerCase() === trimmed.toLowerCase());
      if (existing) {
        // Si ya existe, simplemente agregarlo al consultorio actual si no lo tiene
        if (editingRoom) {
          const currentEq = editingRoom.equipment || [];
          if (!currentEq.includes(existing.name)) {
            setEditingRoom({ ...editingRoom, equipment: [...currentEq, existing.name] });
          }
        }
        setNewEquipmentInput('');
        return;
      }

      const { data, error } = await supabase
        .from('consulting_room_equipment_catalog')
        .insert({ name: trimmed, category: 'General', icon: 'devices' })
        .select()
        .single();

      if (error) throw error;
      if (data) {
        setEquipmentCatalog(prev => [...prev, data]);
        if (editingRoom) {
          const currentEq = editingRoom.equipment || [];
          setEditingRoom({ ...editingRoom, equipment: [...currentEq, data.name] });
        }
        showFeedback(`Equipamiento "${trimmed}" agregado al catálogo`);
      }
      setNewEquipmentInput('');
    } catch (err: any) {
      console.error('Error agregando equipamiento:', err);
      showFeedback(err.message || 'Error al agregar equipamiento', 'error');
    }
  };

  // Guardar Profesional
  const handleSaveProf = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProf?.full_name) return;
    setSaving(true);
    try {
      const profPayload = {
        full_name: editingProf.full_name,
        specialty: editingProf.specialty || 'General',
        license_number: editingProf.license_number || null,
        doctor_id: editingProf.doctor_id || null,
        user_id: editingProf.user_id || null,
        color: editingProf.color || '#10B981',
        custom_hourly_rate: editingProf.custom_hourly_rate !== undefined && editingProf.custom_hourly_rate !== null && editingProf.custom_hourly_rate !== ''
          ? Number(editingProf.custom_hourly_rate)
          : null,
        active: editingProf.active !== undefined ? editingProf.active : true,
        updated_at: new Date().toISOString()
      };

      if (editingProf.id) {
        const { error } = await supabase
          .from('consulting_professionals')
          .update(profPayload)
          .eq('id', editingProf.id);
        if (error) throw error;
        showFeedback('Profesional actualizado');
      } else {
        const { error } = await supabase.from('consulting_professionals').insert({
          ...profPayload,
          active: true
        });
        if (error) throw error;
        showFeedback('Profesional creado');
      }
      setIsProfModalOpen(false);
      setEditingProf(null);
      await fetchData();
    } catch (err: any) {
      showFeedback(err.message || 'Error al guardar profesional', 'error');
    } finally {
      setSaving(false);
    }
  };

  // Guardar Excepción de Calendario (Vacaciones, Licencias, Suplencias, etc.)
  const handleSaveException = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingException?.exception_type || !editingException.start_date || !editingException.end_date) {
      showFeedback('Complete los campos obligatorios (tipo y fechas)', 'error');
      return;
    }

    if (editingException.end_date < editingException.start_date) {
      showFeedback('La fecha de fin no puede ser anterior a la fecha de inicio', 'error');
      return;
    }

    setSaving(true);
    try {
      if (editingException.id) {
        const { error } = await supabase
          .from('consulting_calendar_exceptions')
          .update({
            exception_type: editingException.exception_type,
            start_date: editingException.start_date,
            end_date: editingException.end_date,
            consulting_room_id: editingException.consulting_room_id || null,
            professional_id: editingException.professional_id || null,
            substitute_professional_id: editingException.substitute_professional_id || null,
            start_time: editingException.start_time || null,
            end_time: editingException.end_time || null,
            reason: editingException.reason || null,
            updated_at: new Date().toISOString()
          })
          .eq('id', editingException.id);
        if (error) throw error;
        showFeedback('Novedad de calendario actualizada');
      } else {
        const { error } = await supabase.from('consulting_calendar_exceptions').insert({
          exception_type: editingException.exception_type,
          start_date: editingException.start_date,
          end_date: editingException.end_date,
          consulting_room_id: editingException.consulting_room_id || null,
          professional_id: editingException.professional_id || null,
          substitute_professional_id: editingException.substitute_professional_id || null,
          start_time: editingException.start_time || null,
          end_time: editingException.end_time || null,
          reason: editingException.reason || null,
          active: true
        });
        if (error) throw error;
        showFeedback('Novedad registrada exitosamente');
      }

      setIsExceptionModalOpen(false);
      setEditingException(null);
      await fetchData();
    } catch (err: any) {
      console.error('Error guardando excepción:', err);
      showFeedback(err.message || 'Error al registrar la novedad', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteException = async (id: string) => {
    if (!confirm('¿Desea eliminar esta novedad de calendario?')) return;
    try {
      const { error } = await supabase.from('consulting_calendar_exceptions').delete().eq('id', id);
      if (error) throw error;
      showFeedback('Novedad eliminada');
      await fetchData();
    } catch (err: any) {
      showFeedback(err.message || 'Error al eliminar', 'error');
    }
  };

  // Helper para navegar días en el calendario real
  const handleNavigateCalendarDay = (offsetDays: number) => {
    const parts = selectedCalendarDateStr.split('-');
    const cur = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
    cur.setDate(cur.getDate() + offsetDays);
    setSelectedCalendarDateStr(formatDateToISO(cur));
    setCurrentCalendarDate(cur);
  };

  const handleNavigateCalendarMonth = (offsetMonths: number) => {
    const cur = new Date(currentCalendarDate);
    cur.setMonth(cur.getMonth() + offsetMonths);
    setCurrentCalendarDate(cur);
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-50/50 overflow-hidden text-slate-800">
      {/* Toast Feedback */}
      {feedbackMsg && (
        <div
          className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl shadow-lg border text-sm font-medium flex items-center gap-2 animate-fadeIn ${
            feedbackMsg.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
              : 'bg-rose-50 text-rose-800 border-rose-200'
          }`}
        >
          <span className="material-symbols-outlined text-lg">
            {feedbackMsg.type === 'success' ? 'check_circle' : 'error'}
          </span>
          {feedbackMsg.text}
        </div>
      )}

      {/* Header Principal */}
      <div className="bg-white border-b border-slate-200/80 px-6 py-4 flex-shrink-0">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center text-white shadow-md shadow-blue-500/20">
                <span className="material-symbols-outlined text-2xl">meeting_room</span>
              </div>
              <div>
                <h1 className="text-xl font-bold text-slate-900 tracking-tight">
                  Ocupación de Consultorios
                </h1>
                <p className="text-xs text-slate-500">
                  Planificación semanal, asignación de profesionales y control de capacidad
                </p>
              </div>
            </div>
          </div>

          {/* Selector de Modos de Vista y Botón Acción */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200/60">
              <button
                onClick={() => setViewMode('calendar')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  viewMode === 'calendar'
                    ? 'bg-white text-blue-600 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <span className="material-symbols-outlined text-base">calendar_month</span>
                Calendario Fechas
              </button>
              <button
                onClick={() => setViewMode('grid')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  viewMode === 'grid'
                    ? 'bg-white text-blue-600 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <span className="material-symbols-outlined text-base">calendar_view_week</span>
                Grilla Base Semanal
              </button>
              <button
                onClick={() => setViewMode('professionals')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  viewMode === 'professionals'
                    ? 'bg-white text-blue-600 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <span className="material-symbols-outlined text-base">person</span>
                Por Profesional
              </button>
              <button
                onClick={() => setViewMode('analytics')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  viewMode === 'analytics'
                    ? 'bg-white text-blue-600 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <span className="material-symbols-outlined text-base">bar_chart</span>
                Ocupación
              </button>
              {canEdit && (
                <button
                  onClick={() => setViewMode('management')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    viewMode === 'management'
                      ? 'bg-white text-blue-600 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <span className="material-symbols-outlined text-base">tune</span>
                  Gestión
                </button>
              )}
              {isExecutive && (
                <button
                  onClick={() => setViewMode('financial')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    viewMode === 'financial'
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'text-emerald-700 hover:text-emerald-800 hover:bg-emerald-50/50'
                  }`}
                  title="Acceso exclusivo Super Admin y Dirección"
                >
                  <span className="material-symbols-outlined text-base">payments</span>
                  Tarifas y Finanzas
                </button>
              )}
            </div>

            {/* Botón Buscador Inteligente de Turnos Libres */}
            <button
              onClick={() => {
                if (professionals.length > 0 && !finderSelectedProfId) {
                  setFinderSelectedProfId(professionals[0].id);
                }
                setIsFreeSlotFinderOpen(true);
              }}
              className="flex items-center gap-2 px-3.5 py-2 bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-700 hover:to-blue-700 active:scale-95 text-white rounded-xl text-xs font-bold shadow-sm shadow-indigo-600/20 transition-all cursor-pointer"
              title="Consultar disponibilidad y huecos libres en consultorios"
            >
              <span className="material-symbols-outlined text-base">search_check</span>
              Buscar Turnos Libres
            </button>

            {canEdit && viewMode === 'calendar' && (
              <button
                onClick={() => {
                  setEditingException({
                    exception_type: 'vacaciones',
                    start_date: selectedCalendarDateStr,
                    end_date: selectedCalendarDateStr,
                    professional_id: professionals[0]?.id || '',
                    active: true,
                    reason: ''
                  });
                  setIsExceptionModalOpen(true);
                }}
                className="flex items-center gap-2 px-3.5 py-2 bg-amber-600 hover:bg-amber-700 active:scale-95 text-white rounded-xl text-xs font-semibold shadow-sm shadow-amber-600/20 transition-all"
              >
                <span className="material-symbols-outlined text-base">beach_access</span>
                Registrar Novedad / Vacación
              </button>
            )}

            {canEdit && (viewMode === 'grid' || (viewMode === 'calendar' && calendarSubView === 'day')) && (
              <button
                onClick={() => {
                  if (isReorganizeMode) {
                    // Ya está activo — no hace nada, los botones del banner manejan guardar/cancelar
                    return;
                  }
                  // Activar: guardar snapshot antes de cualquier movimiento
                  reorganizeSnapshotRef.current = schedules.map(s => ({ ...s }));
                  setIsReorganizeMode(true);
                  showFeedback('Modo Reorganización activado — arrastrá los turnos. Confirmá o cancelá con los botones del banner.', 'success');
                }}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all shadow-sm ${
                  isReorganizeMode
                    ? 'bg-amber-500 text-white shadow-amber-500/30 ring-2 ring-amber-300 cursor-default'
                    : 'bg-white hover:bg-slate-50 text-slate-700 border border-slate-200'
                }`}
                title={isReorganizeMode ? 'Usar los botones del banner para guardar o cancelar' : 'Activar modo de arrastre para mover turnos entre horarios, consultorios o días'}
              >
                <span className="material-symbols-outlined text-base">
                  {isReorganizeMode ? 'lock_open' : 'drag_indicator'}
                </span>
                {isReorganizeMode ? 'Reorganizando...' : 'Reorganizar Turnos'}
              </button>
            )}

            {canEdit && viewMode !== 'calendar' && (
              <button
                onClick={() => handleOpenNewSchedule()}
                className="flex items-center gap-2 px-3.5 py-2 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white rounded-xl text-xs font-semibold shadow-sm shadow-blue-600/20 transition-all"
              >
                <span className="material-symbols-outlined text-base">add</span>
                Asignar Horario
              </button>
            )}
          </div>
        </div>

        {/* Barra de Controles y Filtros para Vista Calendario */}
        {viewMode === 'calendar' && (
          <div className="mt-4 pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
            {/* Navegación de Fecha Real */}
            <div className="flex items-center gap-2 flex-wrap">
              {/* Botón Hoy */}
              <button
                onClick={() => {
                  const today = new Date();
                  setCurrentCalendarDate(today);
                  setSelectedCalendarDateStr(formatDateToISO(today));
                }}
                className="px-2.5 py-1 text-xs font-bold text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg border border-blue-200 transition-colors"
              >
                Hoy
              </button>

              {/* Botones Anterior / Siguiente */}
              <div className="flex items-center bg-white border border-slate-200 rounded-lg p-0.5">
                <button
                  onClick={() => calendarSubView === 'day' ? handleNavigateCalendarDay(-1) : handleNavigateCalendarMonth(-1)}
                  className="p-1 hover:bg-slate-100 rounded text-slate-600"
                  title="Anterior"
                >
                  <span className="material-symbols-outlined text-base">chevron_left</span>
                </button>
                <button
                  onClick={() => calendarSubView === 'day' ? handleNavigateCalendarDay(1) : handleNavigateCalendarMonth(1)}
                  className="p-1 hover:bg-slate-100 rounded text-slate-600"
                  title="Siguiente"
                >
                  <span className="material-symbols-outlined text-base">chevron_right</span>
                </button>
              </div>

              {/* Título de Fecha / Selector */}
              {calendarSubView === 'day' ? (
                <div className="flex items-center gap-2">
                  <input
                    type="date"
                    value={selectedCalendarDateStr}
                    onChange={e => {
                      if (!e.target.value) return;
                      setSelectedCalendarDateStr(e.target.value);
                      const parts = e.target.value.split('-');
                      setCurrentCalendarDate(new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10)));
                    }}
                    className="px-2.5 py-1 text-xs font-bold text-slate-800 bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-blue-500 cursor-pointer shadow-2xs"
                  />
                  {(() => {
                    const parts = selectedCalendarDateStr.split('-');
                    const dateObj = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
                    const dayOfWeek = dateObj.getDay(); // 0 Dom, 1 Lun ... 6 Sab
                    const dayObj = DAYS.find(d => d.id === (dayOfWeek === 0 ? 7 : dayOfWeek));
                    const hol = holidays.find(h => h.date === selectedCalendarDateStr);

                    return (
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-slate-700 bg-slate-100 px-2 py-1 rounded-lg">
                          {dayObj ? dayObj.name : (dayOfWeek === 6 ? 'Sábado' : 'Domingo')}
                        </span>
                        {hol && (
                          <span
                            className={`text-xs font-bold px-2 py-0.5 rounded-lg flex items-center gap-1 ${
                              hol.holiday_type === 'sanidad'
                                ? 'bg-purple-100 text-purple-700 border border-purple-200'
                                : 'bg-rose-100 text-rose-700 border border-rose-200'
                            }`}
                            title={hol.notes || 'Feriado / Asueto'}
                          >
                            <span className="material-symbols-outlined text-sm">
                              {hol.holiday_type === 'sanidad' ? 'local_hospital' : 'flag'}
                            </span>
                            {hol.name} ({hol.holiday_type === 'sanidad' ? 'Sanidad' : 'Feriado'})
                          </span>
                        )}
                      </div>
                    );
                  })()}
                </div>
              ) : (
                <span className="text-xs font-bold text-slate-800 px-2 py-1 bg-white border border-slate-200 rounded-lg shadow-2xs">
                  {MONTH_NAMES[currentCalendarDate.getMonth()]} {currentCalendarDate.getFullYear()}
                </span>
              )}

              {/* Selector Subvista Día vs Mes */}
              <div className="flex bg-slate-100 p-0.5 rounded-lg border border-slate-200 ml-2">
                <button
                  onClick={() => setCalendarSubView('day')}
                  className={`px-2.5 py-0.5 rounded text-xs font-semibold transition-all ${
                    calendarSubView === 'day' ? 'bg-white text-blue-600 shadow-2xs' : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  Día
                </button>
                <button
                  onClick={() => setCalendarSubView('month')}
                  className={`px-2.5 py-0.5 rounded text-xs font-semibold transition-all ${
                    calendarSubView === 'month' ? 'bg-white text-blue-600 shadow-2xs' : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  Vista Mensual
                </button>
              </div>
            </div>

            {/* Filtro Sector y Búsqueda */}
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-lg px-2.5 py-1 text-xs">
                <span className="material-symbols-outlined text-slate-400 text-base">domain</span>
                <select
                  value={selectedSector}
                  onChange={e => setSelectedSector(e.target.value)}
                  className="bg-transparent text-slate-700 font-medium focus:outline-none cursor-pointer"
                >
                  <option value="all">Todos los sectores</option>
                  {sectors.filter(s => s !== 'all').map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>

              <div className="relative">
                <span className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-base">search</span>
                <input
                  type="text"
                  placeholder="Buscar médico o novedad..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  className="pl-8 pr-3 py-1 bg-white border border-slate-200 rounded-lg text-xs focus:outline-none focus:border-blue-500 w-36 sm:w-48 text-slate-800"
                />
              </div>
            </div>
          </div>
        )}

        {/* Barra de Filtros Contextuales (para Vista Grilla) */}
        {viewMode === 'grid' && (
          <div className="mt-4 pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
            {/* Tabs de Días de la Semana con soporte Drop */}
            <div className="flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0">
              {DAYS.map(day => {
                const isSelected = selectedDay === day.id;
                const countInDay = schedules.filter(s => s.day_of_week === day.id).length;
                const isDragOverThisDay = dragOverTarget?.dayId === day.id;

                return (
                  <button
                    key={day.id}
                    onClick={() => setSelectedDay(day.id)}
                    onDragOver={e => {
                      if (canEdit && isReorganizeMode) {
                        e.preventDefault();
                        e.dataTransfer.dropEffect = 'move';
                        if (dragOverTarget?.dayId !== day.id) {
                          setDragOverTarget({ dayId: day.id });
                        }
                      }
                    }}
                    onDragLeave={() => {
                      if (dragOverTarget?.dayId === day.id) {
                        setDragOverTarget(null);
                      }
                    }}
                    onDrop={e => {
                      e.preventDefault();
                      setDragOverTarget(null);
                      if (canEdit && isReorganizeMode) {
                        const schedId = e.dataTransfer.getData('text/plain') || draggedScheduleRef.current?.id || draggedSchedule?.id;
                        if (schedId) {
                          handleMoveScheduleToDay(schedId, day.id);
                        }
                        setDraggedSchedule(null);
                        draggedScheduleRef.current = null;
                      }
                    }}
                    className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                      isDragOverThisDay
                        ? 'bg-amber-500 text-white ring-2 ring-amber-300 scale-105 shadow-md'
                        : isSelected
                        ? 'bg-blue-600 text-white shadow-sm'
                        : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                    }`}
                    title={isReorganizeMode ? `Soltar aquí para mover turno al ${day.name}` : undefined}
                  >
                    <span>{day.name}</span>
                    <span
                      className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                        isDragOverThisDay
                          ? 'bg-white/30 text-white'
                          : isSelected
                          ? 'bg-white/20 text-white'
                          : 'bg-slate-100 text-slate-500'
                      }`}
                    >
                      {countInDay}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Filtro por Sector y Búsqueda */}
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-lg px-2.5 py-1 text-xs">
                <span className="material-symbols-outlined text-slate-400 text-base">domain</span>
                <select
                  value={selectedSector}
                  onChange={e => setSelectedSector(e.target.value)}
                  className="bg-transparent text-slate-700 font-medium focus:outline-none cursor-pointer"
                >
                  <option value="all">Todos los sectores</option>
                  {sectors.filter(s => s !== 'all').map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>

              <div className="relative">
                <span className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-base">search</span>
                <input
                  type="text"
                  placeholder="Buscar médico..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  className="pl-8 pr-3 py-1 bg-white border border-slate-200 rounded-lg text-xs focus:outline-none focus:border-blue-500 w-36 sm:w-48 text-slate-800"
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Contenido Principal según el modo */}
      <div className="flex-1 overflow-auto p-4 sm:p-6">
        {loading ? (
          <div className="h-64 flex flex-col items-center justify-center gap-3">
            <div className="w-8 h-8 border-3 border-blue-600/20 border-t-blue-600 rounded-full animate-spin" />
            <p className="text-xs text-slate-400 font-medium">Cargando cronograma...</p>
          </div>
        ) : (
          <>
            {/* ==================== VISTA 0: CALENDARIO DE FECHAS REALES (DINÁMICO) ==================== */}
            {viewMode === 'calendar' && (
              <div className="space-y-4">
                {/* SUBVISTA 1: DÍA PUNTUAL CALENDARIO */}
                {calendarSubView === 'day' && (
                  <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden flex flex-col">
                    {/* Banner de Modo Reorganización Activo */}
                    {isReorganizeMode && (
                      <div className="bg-amber-500 text-white px-4 py-2.5 flex items-center justify-between gap-3 shadow-xs animate-in fade-in duration-200">
                        <div className="flex items-center gap-2 text-xs font-semibold">
                          <span className="material-symbols-outlined text-lg animate-bounce">drag_indicator</span>
                          <span>
                            <strong>Modo Reorganización:</strong> Arrastrá los bloques para cambiar horario o consultorio. Los cambios <em>no se guardan</em> hasta que hagas clic en <strong>Guardar</strong>.
                          </span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            onClick={handleCancelReorganize}
                            className="bg-red-600 hover:bg-red-700 text-white text-xs font-bold px-3 py-1 rounded-lg shadow-sm transition-colors flex items-center gap-1"
                            title="Descartar todos los movimientos y volver al estado original"
                          >
                            <span className="material-symbols-outlined text-sm">undo</span>
                            Cancelar
                          </button>
                          <button
                            onClick={handleFinalizeReorganize}
                            className="bg-white hover:bg-green-50 text-green-800 text-xs font-bold px-3 py-1 rounded-lg shadow-sm transition-colors flex items-center gap-1"
                            title="Guardar todos los cambios en la base de datos"
                          >
                            <span className="material-symbols-outlined text-sm">save</span>
                            Guardar Cambios
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Alerta de Feriado si el día seleccionado lo es */}
                    {(() => {
                      const hol = holidays.find(h => h.date === selectedCalendarDateStr);
                      if (!hol) return null;
                      return (
                        <div className={`p-4 border-b flex items-center justify-between gap-3 ${
                          hol.holiday_type === 'sanidad'
                            ? 'bg-purple-50 text-purple-900 border-purple-200'
                            : 'bg-rose-50 text-rose-900 border-rose-200'
                        }`}>
                          <div className="flex items-center gap-2.5">
                            <span className="material-symbols-outlined text-xl">
                              {hol.holiday_type === 'sanidad' ? 'medical_services' : 'event_busy'}
                            </span>
                            <div>
                              <p className="text-xs font-bold uppercase tracking-wider">
                                {hol.name} ({hol.holiday_type === 'sanidad' ? 'Día de la Sanidad - ATSA' : 'Feriado Nacional'})
                              </p>
                              <p className="text-[11px] opacity-80">
                                {hol.affects_consulting
                                  ? 'Consultorios externos cerrados / Atención restringida a guardias.'
                                  : 'Día conmemorativo. Consultorios con esquema operativo adaptado.'}
                              </p>
                            </div>
                          </div>
                          {hol.notes && (
                            <span className="text-[10px] bg-white/70 px-2.5 py-1 rounded-md font-semibold">
                              {hol.notes}
                            </span>
                          )}
                        </div>
                      );
                    })()}

                    {/* Grilla Horaria del Día Seleccionado con Excepciones Aplicadas */}
                    <div className="overflow-auto max-h-[calc(100vh-250px)]">
                      <div style={{ minWidth: `${80 + Math.max(1, filteredRooms.length) * 140}px` }}>
                        {/* Header de columnas: Consultorios */}
                        <div
                          style={{
                            display: 'grid',
                            gridTemplateColumns: `80px repeat(${Math.max(1, filteredRooms.length)}, minmax(140px, 1fr))`
                          }}
                          className="bg-slate-50 border-b border-slate-200 sticky top-0 z-30 shadow-xs"
                        >
                          <div className="p-3 text-[11px] font-bold text-slate-500 uppercase tracking-wider text-center border-r border-slate-200 sticky left-0 bg-slate-100 z-40 shadow-xs">
                            Hora
                          </div>
                          {filteredRooms.map(room => (
                            <div
                              key={room.id}
                              className="p-3 border-r border-slate-200 last:border-r-0 flex flex-col items-center justify-center text-center bg-slate-50/95"
                            >
                              <span className="text-xs font-bold text-slate-800">{room.name}</span>
                              <span className="text-[10px] text-slate-400 mt-0.5">{room.sector}</span>
                              {room.equipment && room.equipment.length > 0 && (
                                <div className="flex flex-wrap items-center justify-center gap-1 mt-1.5 max-w-[130px]">
                                  {room.equipment.map((eq, i) => (
                                    <span
                                      key={i}
                                      className="text-[9px] bg-blue-50 text-blue-700 px-1 py-0.2 rounded font-medium border border-blue-100 flex items-center gap-0.5"
                                      title={`Equipamiento: ${eq}`}
                                    >
                                      <span className="material-symbols-outlined text-[10px]">devices</span>
                                      <span className="truncate max-w-[70px]">{eq}</span>
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>

                        {/* Timeline con cálculo dinámico (Plantilla Base + Novedades) */}
                        {(() => {
                          const parts = selectedCalendarDateStr.split('-');
                          const dateObj = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
                          const dayOfWeek = dateObj.getDay(); // 0: Dom ... 6: Sab
                          const convertedDayOfWeek = dayOfWeek === 0 ? 7 : dayOfWeek;

                          // Horarios base de la plantilla para este día de la semana
                          const baseDaySchedules = schedules.filter(s => s.day_of_week === convertedDayOfWeek);

                          // Novedades activas para esta fecha específica
                          const dayExceptions = calendarExceptions.filter(ex =>
                            ex.start_date <= selectedCalendarDateStr && ex.end_date >= selectedCalendarDateStr
                          );

                          return (
                            <div className="relative" style={{ height: `${(TIME_SLOTS.length - 1) * 44}px` }}>
                              {/* Rejilla de Fondo */}
                              <div className="absolute inset-0 divide-y divide-slate-100 pointer-events-none">
                                {TIME_SLOTS.slice(0, -1).map(slot => (
                                  <div
                                    key={slot}
                                    style={{
                                      display: 'grid',
                                      gridTemplateColumns: `80px repeat(${Math.max(1, filteredRooms.length)}, minmax(140px, 1fr))`
                                    }}
                                    className="h-[44px]"
                                  >
                                    <div className="px-2 py-1 text-[11px] font-semibold text-slate-500 flex items-center justify-center border-r border-slate-200 bg-slate-50/95 sticky left-0 z-20 shadow-2xs pointer-events-auto">
                                      {slot}
                                    </div>
                                    {filteredRooms.map(room => (
                                      <div
                                        key={room.id}
                                        className="border-r border-slate-100 last:border-r-0 h-full"
                                      />
                                    ))}
                                  </div>
                                ))}
                              </div>

                              {/* Columnas de Consultorios con Resolución Dinámica de Excepciones */}
                              <div
                                style={{
                                  display: 'grid',
                                  gridTemplateColumns: `80px repeat(${Math.max(1, filteredRooms.length)}, minmax(140px, 1fr))`
                                }}
                                className="absolute inset-0 pointer-events-none"
                              >
                                <div className="h-full border-r border-slate-100 pointer-events-none" />

                                {filteredRooms.map(room => {
                                  // Bloqueo total del consultorio por obras/mantenimiento
                                  const roomBlocked = dayExceptions.find(
                                    ex => ex.exception_type === 'bloqueo_consultorio' && ex.consulting_room_id === room.id
                                  );

                                  if (roomBlocked) {
                                    return (
                                      <div
                                        key={room.id}
                                        className="relative h-full border-r border-slate-100 last:border-r-0 bg-slate-100/70 flex flex-col items-center justify-center p-4 text-center select-none"
                                      >
                                        <span className="material-symbols-outlined text-slate-400 text-3xl mb-1">
                                          handyman
                                        </span>
                                        <p className="text-xs font-bold text-slate-600">Consultorio Inhabilitado</p>
                                        <p className="text-[10px] text-slate-400 mt-1">{roomBlocked.reason || 'Mantenimiento / Refacciones'}</p>
                                      </div>
                                    );
                                  }

                                  const roomBaseScheds = baseDaySchedules.filter(s => s.consulting_room_id === room.id);

                                  return (
                                    <div
                                      key={room.id}
                                      className="relative h-full border-r border-slate-100 last:border-r-0 pointer-events-auto"
                                      onDragOver={e => {
                                        if (!canEdit || !isReorganizeMode) return;
                                        e.preventDefault();
                                        e.dataTransfer.dropEffect = 'move';
                                        const rect = e.currentTarget.getBoundingClientRect();
                                        const relY = e.clientY - rect.top - dragOffsetYRef.current;
                                        const slotIdx = Math.max(0, Math.min(Math.floor(relY / 44), TIME_SLOTS.length - 2));
                                        const slot = TIME_SLOTS[slotIdx];
                                        if (dragOverTarget?.roomId !== room.id || dragOverTarget?.slot !== slot) {
                                          setDragOverTarget({ roomId: room.id, slot });
                                        }
                                      }}
                                      onDragLeave={e => {
                                        if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                                          setDragOverTarget(null);
                                        }
                                      }}
                                      onDrop={e => {
                                        e.preventDefault();
                                        if (!canEdit || !isReorganizeMode) return;
                                        const rect = e.currentTarget.getBoundingClientRect();
                                        const relY = e.clientY - rect.top - dragOffsetYRef.current;
                                        const slotIdx = Math.max(0, Math.min(Math.floor(relY / 44), TIME_SLOTS.length - 2));
                                        const slot = TIME_SLOTS[slotIdx];
                                        const schedId = e.dataTransfer.getData('text/plain') || draggedScheduleRef.current?.id || draggedSchedule?.id;
                                        if (schedId && slot) {
                                          handleMoveSchedule(schedId, room.id, slot);
                                        }
                                        setDragOverTarget(null);
                                        setDraggedSchedule(null);
                                        draggedScheduleRef.current = null;
                                      }}
                                    >
                                      {/* Botones de slots libres (y zonas de Drop) en calendario diario */}
                                      {canEdit &&
                                        TIME_SLOTS.slice(0, -1).map((slot, slotIdx) => {
                                          const slotStartMin = timeToMinutes(slot);
                                          const slotEndMin = slotStartMin + 30;
                                          const isOccupied = roomBaseScheds.some(s => {
                                            const sStart = timeToMinutes(s.start_time);
                                            const sEnd = timeToMinutes(s.end_time);
                                            return Math.max(slotStartMin, sStart) < Math.min(slotEndMin, sEnd);
                                          });

                                          const isDropOverThis = dragOverTarget?.roomId === room.id && dragOverTarget?.slot === slot;

                                          if (isOccupied) return null;

                                          return (
                                            <button
                                              key={slot}
                                              onClick={() => !isReorganizeMode && handleOpenNewSchedule(room.id, slot)}
                                              onDragOver={e => {
                                                if (canEdit && isReorganizeMode) {
                                                  e.preventDefault();
                                                  e.dataTransfer.dropEffect = 'move';
                                                  if (dragOverTarget?.roomId !== room.id || dragOverTarget?.slot !== slot) {
                                                    setDragOverTarget({ roomId: room.id, slot });
                                                  }
                                                }
                                              }}
                                              onDragLeave={() => {
                                                if (dragOverTarget?.roomId === room.id && dragOverTarget?.slot === slot) {
                                                  setDragOverTarget(null);
                                                }
                                              }}
                                              onDrop={e => {
                                                e.preventDefault();
                                                setDragOverTarget(null);
                                                if (canEdit && isReorganizeMode) {
                                                  const schedId = e.dataTransfer.getData('text/plain') || draggedScheduleRef.current?.id || draggedSchedule?.id;
                                                  if (schedId) {
                                                    handleMoveSchedule(schedId, room.id, slot);
                                                  }
                                                  setDraggedSchedule(null);
                                                  draggedScheduleRef.current = null;
                                                }
                                              }}
                                              title={isReorganizeMode ? `Soltar aquí para mover turno a ${room.name} (${slot})` : `Asignar ${room.name} (${slot})`}
                                              style={{
                                                top: `${slotIdx * 44}px`,
                                                height: '44px'
                                              }}
                                              className={`absolute inset-x-1 border rounded-lg flex items-center justify-center transition-all text-[11px] font-medium ${
                                                isDropOverThis
                                                  ? 'opacity-100 bg-amber-100 border-2 border-amber-600 text-amber-900 scale-[1.02] shadow-sm z-20 animate-pulse'
                                                  : isReorganizeMode
                                                  ? 'opacity-70 border-dashed border-amber-300 hover:border-amber-500 bg-amber-50/20 hover:bg-amber-100/50 text-amber-700 z-5'
                                                  : 'opacity-0 hover:opacity-100 border-dashed border-blue-300 hover:border-blue-500 bg-blue-50/30 hover:bg-blue-50/70 text-blue-600 z-5'
                                              }`}
                                            >
                                              <span className="material-symbols-outlined text-sm mr-1">
                                                {isDropOverThis ? 'move_down' : isReorganizeMode ? 'input' : 'add'}
                                              </span>
                                              {isDropOverThis ? `Mover aquí (${slot})` : isReorganizeMode ? `Libre (${slot})` : 'Libre'}
                                            </button>
                                          );
                                        })}

                                      {/* Renderizar cada bloque con su estado de excepción (Draggable) */}
                                      {roomBaseScheds.map(sched => {
                                        const startMin = timeToMinutes(sched.start_time);
                                        const endMin = timeToMinutes(sched.end_time);
                                        const dayStartMin = 7 * 60; // 07:00

                                        const topOffset = ((startMin - dayStartMin) / 30) * 44;
                                        const height = Math.max(36, ((endMin - startMin) / 30) * 44);

                                        const prof = sched.consulting_professionals;

                                        // Buscar si este profesional tiene alguna novedad hoy
                                        const activeException = dayExceptions.find(ex => {
                                          if (ex.professional_id !== sched.professional_id) return false;
                                          if (ex.consulting_room_id && ex.consulting_room_id !== room.id) return false;
                                          return true;
                                        });

                                        const isVacation = activeException?.exception_type === 'vacaciones';
                                        const isLicence = activeException?.exception_type === 'licencia';
                                        const isReplaced = activeException?.exception_type === 'reemplazo';
                                        const substituteProf = activeException?.substitute_professionals;

                                        const color = isReplaced && substituteProf
                                          ? (substituteProf.color || '#10B981')
                                          : (prof?.color || '#3B82F6');

                                        const matchesSearch =
                                          !searchTerm ||
                                          (prof?.full_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                                          (substituteProf?.full_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                                          (prof?.specialty || '').toLowerCase().includes(searchTerm.toLowerCase());

                                        const durationMin = endMin - startMin;
                                        const isShort = durationMin <= 30; // 30 minutos (44px)
                                        const isCurrentlyDragged = draggedSchedule?.id === sched.id;

                                        return (
                                          <div
                                            key={sched.id}
                                            draggable={canEdit && isReorganizeMode}
                                            onDragStart={e => {
                                              if (!canEdit || !isReorganizeMode) return;
                                              // Guardar offset Y dentro de la tarjeta para slot destino correcto
                                              dragOffsetYRef.current = e.clientY - e.currentTarget.getBoundingClientRect().top;
                                              setDraggedSchedule(sched);
                                              draggedScheduleRef.current = sched;
                                              e.dataTransfer.effectAllowed = 'move';
                                              e.dataTransfer.setData('text/plain', sched.id);
                                            }}
                                            onDragEnd={() => {
                                              setTimeout(() => {
                                                setDraggedSchedule(null);
                                                draggedScheduleRef.current = null;
                                                setDragOverTarget(null);
                                              }, 100);
                                            }}
                                            onClick={() => {
                                              if (!canEdit || isReorganizeMode) return;
                                              // Si tiene excepción, abrir para editarla; si no, abrir para crear una novedad rápida
                                              if (activeException) {
                                                setEditingException({ ...activeException });
                                              } else {
                                                setEditingException({
                                                  exception_type: 'vacaciones',
                                                  start_date: selectedCalendarDateStr,
                                                  end_date: selectedCalendarDateStr,
                                                  professional_id: sched.professional_id,
                                                  consulting_room_id: room.id,
                                                  active: true,
                                                  reason: ''
                                                });
                                              }
                                              setIsExceptionModalOpen(true);
                                            }}
                                            style={{
                                              top: `${topOffset + 1}px`,
                                              height: `${height - 2}px`,
                                              borderLeftColor: color
                                            }}
                                            className={`absolute inset-x-1 rounded-lg border-l-4 ${
                                              isShort ? 'px-1.5 py-1' : 'p-2'
                                            } flex flex-col justify-between overflow-hidden z-10 select-none transition-all ${
                                              canEdit && isReorganizeMode
                                                ? 'cursor-grab active:cursor-grabbing ring-1 ring-amber-400/60'
                                                : canEdit
                                                ? 'cursor-pointer hover:ring-1 hover:ring-blue-400'
                                                : 'cursor-default'
                                            } ${
                                              isCurrentlyDragged
                                                ? 'opacity-40 scale-95 border-dashed border-2 border-amber-500 shadow-inner'
                                                : isVacation || isLicence
                                                ? 'bg-slate-100/95 border-slate-300 border dashed hover:border-amber-400 opacity-80'
                                                : isReplaced
                                                ? 'bg-emerald-50/95 border-emerald-300 border hover:shadow-md'
                                                : 'bg-gradient-to-r from-blue-50/95 to-slate-50/90 border border-slate-200 hover:border-blue-300 hover:shadow-md'
                                            } ${matchesSearch ? 'opacity-100' : 'opacity-20'} group`}
                                            title={
                                              isReorganizeMode
                                                ? 'Modo Reorganizar activo: Arrastra para mover a otro horario o consultorio.'
                                                : canEdit
                                                ? 'Clic para registrar o editar novedad / licencia / reemplazo.'
                                                : undefined
                                            }
                                          >
                                            <div className="min-w-0">
                                              {/* Badges de Novedades */}
                                              {isVacation && (
                                                <div className="flex items-center gap-1 text-[9px] font-bold text-amber-700 bg-amber-100/80 px-1 py-0.2 rounded mb-0.5">
                                                  <span className="material-symbols-outlined text-[10px]">beach_access</span>
                                                  <span>VACACIONES</span>
                                                </div>
                                              )}
                                              {isLicence && (
                                                <div className="flex items-center gap-1 text-[9px] font-bold text-rose-700 bg-rose-100/80 px-1 py-0.2 rounded mb-0.5">
                                                  <span className="material-symbols-outlined text-[10px]">local_hospital</span>
                                                  <span>LICENCIA</span>
                                                </div>
                                              )}
                                              {isReplaced && substituteProf && (
                                                <div className="flex items-center gap-1 text-[9px] font-bold text-emerald-800 bg-emerald-100 px-1.5 py-0.5 rounded mb-0.5">
                                                  <span className="material-symbols-outlined text-[10px]">person_pin</span>
                                                  <span>REEMPLAZO</span>
                                                </div>
                                              )}

                                              {/* Nombres de Médicos */}
                                              {isReplaced && substituteProf ? (
                                                <>
                                                  <p className={`font-bold text-emerald-950 leading-tight truncate ${
                                                    isShort ? 'text-[11px]' : 'text-xs'
                                                  }`}>
                                                    {substituteProf.full_name}
                                                  </p>
                                                  {!isShort && (
                                                    <p className="text-[10px] font-medium text-slate-500 mt-0.5 truncate">
                                                      Suple a: <span className="line-through">{prof?.full_name}</span>
                                                    </p>
                                                  )}
                                                </>
                                              ) : (
                                                <>
                                                  <p className={`font-bold leading-tight truncate ${
                                                    isShort ? 'text-[11px]' : 'text-xs'
                                                  } ${
                                                    isVacation || isLicence ? 'line-through text-slate-400' : 'text-slate-900'
                                                  }`}>
                                                    {prof?.full_name || 'Profesional'}
                                                  </p>
                                                  {!isShort && (
                                                    <p className="text-[10px] font-medium text-slate-500 truncate mt-0.5">
                                                      {prof?.specialty || 'General'}
                                                    </p>
                                                  )}
                                                </>
                                              )}

                                              {!isShort && activeException?.reason && (
                                                <p className="text-[10px] text-slate-500 italic mt-0.5 truncate">
                                                  "{activeException.reason}"
                                                </p>
                                              )}
                                            </div>

                                            {/* Horario */}
                                            <div className={`flex items-center justify-between gap-1 flex-wrap ${
                                              isShort ? 'mt-0 pt-0' : 'mt-1 pt-1 border-t border-slate-200/50'
                                            }`}>
                                              <span className={`inline-flex items-center gap-0.5 font-bold text-slate-700 bg-white/90 rounded text-[9px] shadow-2xs border border-slate-200/60 ${
                                                isShort ? 'px-1 py-0' : 'px-1.5 py-0.5 text-[10px]'
                                              }`}>
                                                <span className="material-symbols-outlined text-[10px] text-blue-600">schedule</span>
                                                {formatTime(sched.start_time)} - {formatTime(sched.end_time)}
                                              </span>

                                              {activeException && (
                                                <span className="text-[8px] bg-amber-100 text-amber-800 px-1 py-0.2 rounded font-bold">
                                                  Novedad
                                                </span>
                                              )}
                                            </div>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })()}
                      </div>
                    </div>
                  </div>
                )}

                {/* SUBVISTA 2: VISTA MENSUAL (CALENDARIO DE 30/31 DÍAS CON NOVEDADES) */}
                {calendarSubView === 'month' && (
                  <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-6">
                    <div className="grid grid-cols-7 gap-px bg-slate-200 rounded-xl overflow-hidden border border-slate-200">
                      {['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map(d => (
                        <div key={d} className="bg-slate-50 p-2.5 text-center text-xs font-bold text-slate-500">
                          {d}
                        </div>
                      ))}

                      {(() => {
                        const year = currentCalendarDate.getFullYear();
                        const month = currentCalendarDate.getMonth();
                        const firstDayOfMonth = new Date(year, month, 1);
                        const daysInMonth = new Date(year, month + 1, 0).getDate();

                        // Día de inicio (0: Domingo, 1: Lunes ...)
                        let startDay = firstDayOfMonth.getDay() - 1;
                        if (startDay === -1) startDay = 6; // Domingo

                        const cells = [];
                        // Relleno días del mes anterior
                        for (let i = 0; i < startDay; i++) {
                          cells.push(
                            <div key={`empty-${i}`} className="bg-slate-50/40 min-h-[110px] p-2" />
                          );
                        }

                        // Días del mes
                        for (let day = 1; day <= daysInMonth; day++) {
                          const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                          const isSelected = dateStr === selectedCalendarDateStr;
                          const todayStr = formatDateToISO(new Date());
                          const isToday = dateStr === todayStr;

                          const hol = holidays.find(h => h.date === dateStr);
                          const dayExceptions = calendarExceptions.filter(ex =>
                            ex.start_date <= dateStr && ex.end_date >= dateStr
                          );

                          cells.push(
                            <div
                              key={day}
                              onClick={() => {
                                setSelectedCalendarDateStr(dateStr);
                                setCalendarSubView('day');
                              }}
                              className={`bg-white min-h-[110px] p-2 transition-all cursor-pointer hover:bg-blue-50/40 flex flex-col justify-between group ${
                                isSelected ? 'ring-2 ring-blue-500 bg-blue-50/20' : ''
                              } ${hol ? 'bg-rose-50/30' : ''}`}
                            >
                              <div>
                                <div className="flex items-center justify-between">
                                  <span className={`text-xs font-bold ${
                                    isToday
                                      ? 'w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center shadow-xs'
                                      : 'text-slate-800'
                                  }`}>
                                    {day}
                                  </span>

                                  {hol && (
                                    <span
                                      className={`text-[9px] px-1.5 py-0.2 rounded font-extrabold uppercase ${
                                        hol.holiday_type === 'sanidad'
                                          ? 'bg-purple-100 text-purple-700'
                                          : 'bg-rose-100 text-rose-700'
                                      }`}
                                      title={hol.name}
                                    >
                                      {hol.holiday_type === 'sanidad' ? 'Sanidad' : 'Feriado'}
                                    </span>
                                  )}
                                </div>

                                {hol && (
                                  <p className="text-[10px] text-rose-700 font-bold truncate mt-1" title={hol.name}>
                                    {hol.name}
                                  </p>
                                )}

                                {/* Lista compacta de novedades */}
                                <div className="mt-1 space-y-0.5">
                                  {dayExceptions.slice(0, 3).map(ex => {
                                    const prof = ex.consulting_professionals?.full_name || 'Profesional';
                                    const isVac = ex.exception_type === 'vacaciones';
                                    const isRep = ex.exception_type === 'reemplazo';

                                    return (
                                      <div
                                        key={ex.id}
                                        className={`text-[9px] px-1.5 py-0.5 rounded font-semibold truncate ${
                                          isVac
                                            ? 'bg-amber-100 text-amber-800'
                                            : isRep
                                            ? 'bg-emerald-100 text-emerald-800'
                                            : 'bg-slate-100 text-slate-700'
                                        }`}
                                        title={`${ex.exception_type}: ${prof}`}
                                      >
                                        {isVac ? '🏖️ ' : isRep ? '🔄 ' : '📌 '}
                                        {prof.split(' ')[0]}
                                      </div>
                                    );
                                  })}
                                  {dayExceptions.length > 3 && (
                                    <p className="text-[9px] text-slate-400 font-semibold pl-1">
                                      +{dayExceptions.length - 3} más
                                    </p>
                                  )}
                                </div>
                              </div>

                              <div className="opacity-0 group-hover:opacity-100 transition-opacity flex justify-end">
                                <span className="text-[10px] text-blue-600 font-bold flex items-center gap-0.5">
                                  Ver día
                                  <span className="material-symbols-outlined text-xs">arrow_forward</span>
                                </span>
                              </div>
                            </div>
                          );
                        }

                        return cells;
                      })()}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ==================== VISTA 1: GRILLA BASE SEMANAL (PLANTILLA) ==================== */}
            {viewMode === 'grid' && (
              <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden flex flex-col">
                {/* Banner de Modo Reorganización Activo */}
                {isReorganizeMode && (
                  <div className="bg-amber-500 text-white px-4 py-2.5 flex items-center justify-between gap-3 shadow-xs animate-in fade-in duration-200">
                    <div className="flex items-center gap-2 text-xs font-semibold">
                      <span className="material-symbols-outlined text-lg animate-bounce">drag_indicator</span>
                      <span>
                        <strong>Modo Reorganización:</strong> Arrastrá los turnos para cambiar horario, consultorio o día. Los cambios <em>no se guardan</em> hasta que hagas clic en <strong>Guardar</strong>.
                      </span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={handleCancelReorganize}
                        className="bg-red-600 hover:bg-red-700 text-white text-xs font-bold px-3 py-1 rounded-lg shadow-sm transition-colors flex items-center gap-1"
                        title="Descartar todos los movimientos y volver al estado original"
                      >
                        <span className="material-symbols-outlined text-sm">undo</span>
                        Cancelar
                      </button>
                      <button
                        onClick={handleFinalizeReorganize}
                        className="bg-white hover:bg-green-50 text-green-800 text-xs font-bold px-3 py-1 rounded-lg shadow-sm transition-colors flex items-center gap-1"
                        title="Guardar todos los cambios en la base de datos"
                      >
                        <span className="material-symbols-outlined text-sm">save</span>
                        Guardar Cambios
                      </button>
                    </div>
                  </div>
                )}

                <div className="overflow-auto max-h-[calc(100vh-250px)]">
                  <div style={{ minWidth: `${80 + Math.max(1, filteredRooms.length) * 140}px` }}>
                    {/* Header de columnas: Consultorios */}
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: `80px repeat(${Math.max(1, filteredRooms.length)}, minmax(140px, 1fr))`
                      }}
                      className="bg-slate-50 border-b border-slate-200 sticky top-0 z-30 shadow-xs"
                    >
                      <div className="p-3 text-[11px] font-bold text-slate-500 uppercase tracking-wider text-center border-r border-slate-200 sticky left-0 bg-slate-100 z-40 shadow-xs">
                        Hora
                      </div>
                      {filteredRooms.map(room => {
                        // Calcular ocupación de este consultorio en este día específico
                        const roomSchedules = daySchedules.filter(s => s.consulting_room_id === room.id);
                        let occMin = 0;
                        roomSchedules.forEach(s => {
                          occMin += Math.max(0, timeToMinutes(s.end_time) - timeToMinutes(s.start_time));
                        });
                        const occPct = Math.round((occMin / (14 * 60)) * 100);

                        return (
                          <div
                            key={room.id}
                            className="p-3 border-r border-slate-200 last:border-r-0 flex flex-col items-center justify-center text-center bg-slate-50/95"
                          >
                            <span className="text-xs font-bold text-slate-800">{room.name}</span>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <span className="text-[10px] text-slate-400">{room.sector}</span>
                              <span
                                className={`text-[9px] px-1 rounded-sm font-semibold ${
                                  occPct >= 70
                                    ? 'bg-emerald-100 text-emerald-700'
                                    : occPct > 0
                                    ? 'bg-blue-100 text-blue-700'
                                    : 'bg-slate-100 text-slate-400'
                                }`}
                              >
                                {occPct}%
                              </span>
                            </div>
                            {room.equipment && room.equipment.length > 0 && (
                              <div className="flex flex-wrap items-center justify-center gap-1 mt-1 max-w-[120px]">
                                {room.equipment.map((eq, i) => (
                                  <span
                                    key={i}
                                    className="text-[8px] bg-slate-100 text-slate-600 px-1 py-0.2 rounded font-medium border border-slate-200/60 truncate max-w-[65px]"
                                    title={`Equipamiento: ${eq}`}
                                  >
                                    {eq}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {/* Timeline de Franjas Horarias con Bloques Continuos */}
                    <div className="relative" style={{ height: `${(TIME_SLOTS.length - 1) * 44}px` }}>
                      {/* Fondo de rejilla y líneas horarias */}
                      <div className="absolute inset-0 divide-y divide-slate-100 pointer-events-none">
                        {TIME_SLOTS.slice(0, -1).map(slot => (
                          <div
                            key={slot}
                            style={{
                              display: 'grid',
                              gridTemplateColumns: `80px repeat(${Math.max(1, filteredRooms.length)}, minmax(140px, 1fr))`
                            }}
                            className="h-[44px]"
                          >
                            <div className="px-2 py-1 text-[11px] font-semibold text-slate-500 flex items-center justify-center border-r border-slate-200 bg-slate-50/95 sticky left-0 z-20 shadow-2xs pointer-events-auto">
                              {slot}
                            </div>
                            {filteredRooms.map(room => (
                              <div
                                key={room.id}
                                className="border-r border-slate-100 last:border-r-0 h-full"
                              />
                            ))}
                          </div>
                        ))}
                      </div>

                      {/* Columnas de consultorios con bloques continuos absolutos y botones de slot libre */}
                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns: `80px repeat(${Math.max(1, filteredRooms.length)}, minmax(140px, 1fr))`
                        }}
                        className="absolute inset-0"
                      >
                        {/* Espacio para la columna de horas */}
                        <div className="h-full border-r border-slate-100 pointer-events-none" />

                        {filteredRooms.map(room => {
                          const roomScheds = daySchedules.filter(s => s.consulting_room_id === room.id);

                          return (
                            <div
                              key={room.id}
                              className="relative h-full border-r border-slate-100 last:border-r-0"
                              onDragOver={e => {
                                if (!canEdit || !isReorganizeMode) return;
                                e.preventDefault();
                                e.dataTransfer.dropEffect = 'move';
                                const rect = e.currentTarget.getBoundingClientRect();
                                const relY = e.clientY - rect.top - dragOffsetYRef.current;
                                const slotIdx = Math.max(0, Math.min(Math.floor(relY / 44), TIME_SLOTS.length - 2));
                                const slot = TIME_SLOTS[slotIdx];
                                if (dragOverTarget?.roomId !== room.id || dragOverTarget?.slot !== slot) {
                                  setDragOverTarget({ roomId: room.id, slot });
                                }
                              }}
                              onDragLeave={e => {
                                if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                                  setDragOverTarget(null);
                                }
                              }}
                              onDrop={e => {
                                e.preventDefault();
                                if (!canEdit || !isReorganizeMode) return;
                                const rect = e.currentTarget.getBoundingClientRect();
                                const relY = e.clientY - rect.top - dragOffsetYRef.current;
                                const slotIdx = Math.max(0, Math.min(Math.floor(relY / 44), TIME_SLOTS.length - 2));
                                const slot = TIME_SLOTS[slotIdx];
                                const schedId = e.dataTransfer.getData('text/plain') || draggedScheduleRef.current?.id || draggedSchedule?.id;
                                if (schedId && slot) {
                                  handleMoveSchedule(schedId, room.id, slot);
                                }
                                setDragOverTarget(null);
                                setDraggedSchedule(null);
                                draggedScheduleRef.current = null;
                              }}
                            >
                              {/* Botones de slots libres cuando pasa el cursor (y zonas de Drop) */}
                              {canEdit &&
                                TIME_SLOTS.slice(0, -1).map((slot, slotIdx) => {
                                  const slotStartMin = timeToMinutes(slot);
                                  const slotEndMin = slotStartMin + 30;
                                  const isOccupied = roomScheds.some(s => {
                                    const sStart = timeToMinutes(s.start_time);
                                    const sEnd = timeToMinutes(s.end_time);
                                    return Math.max(slotStartMin, sStart) < Math.min(slotEndMin, sEnd);
                                  });

                                  const isDropOverThis = dragOverTarget?.roomId === room.id && dragOverTarget?.slot === slot;

                                  if (isOccupied) return null;

                                  return (
                                    <button
                                      key={slot}
                                      onClick={() => !isReorganizeMode && handleOpenNewSchedule(room.id, slot)}
                                      onDragOver={e => {
                                        if (canEdit && isReorganizeMode) {
                                          e.preventDefault();
                                          e.dataTransfer.dropEffect = 'move';
                                          if (dragOverTarget?.roomId !== room.id || dragOverTarget?.slot !== slot) {
                                            setDragOverTarget({ roomId: room.id, slot });
                                          }
                                        }
                                      }}
                                      onDragLeave={() => {
                                        if (dragOverTarget?.roomId === room.id && dragOverTarget?.slot === slot) {
                                          setDragOverTarget(null);
                                        }
                                      }}
                                      onDrop={e => {
                                        e.preventDefault();
                                        setDragOverTarget(null);
                                        if (canEdit && isReorganizeMode) {
                                          const schedId = e.dataTransfer.getData('text/plain') || draggedScheduleRef.current?.id || draggedSchedule?.id;
                                          if (schedId) {
                                            handleMoveSchedule(schedId, room.id, slot);
                                          }
                                          setDraggedSchedule(null);
                                          draggedScheduleRef.current = null;
                                        }
                                      }}
                                      title={isReorganizeMode ? `Soltar aquí para mover turno a ${room.name} (${slot})` : `Asignar ${room.name} (${slot})`}
                                      style={{
                                        top: `${slotIdx * 44}px`,
                                        height: '44px'
                                      }}
                                      className={`absolute inset-x-1 border rounded-lg flex items-center justify-center transition-all text-[11px] font-medium ${
                                        isDropOverThis
                                          ? 'opacity-100 bg-amber-100 border-2 border-amber-600 text-amber-900 scale-[1.02] shadow-sm z-20 animate-pulse'
                                          : isReorganizeMode
                                          ? 'opacity-70 border-dashed border-amber-300 hover:border-amber-500 bg-amber-50/20 hover:bg-amber-100/50 text-amber-700 z-5'
                                          : 'opacity-0 hover:opacity-100 border-dashed border-blue-300 hover:border-blue-500 bg-blue-50/30 hover:bg-blue-50/70 text-blue-600 z-5'
                                      }`}
                                    >
                                      <span className="material-symbols-outlined text-sm mr-1">
                                        {isDropOverThis ? 'move_down' : isReorganizeMode ? 'input' : 'add'}
                                      </span>
                                      {isDropOverThis ? `Mover aquí (${slot})` : isReorganizeMode ? `Libre (${slot})` : 'Libre'}
                                    </button>
                                  );
                                })}

                              {/* Bloques Continuos Reales de Profesionales (Draggable) */}
                              {roomScheds.map(sched => {
                                const startMin = timeToMinutes(sched.start_time);
                                const endMin = timeToMinutes(sched.end_time);
                                const dayStartMin = 7 * 60; // 07:00

                                const topOffset = ((startMin - dayStartMin) / 30) * 44;
                                const height = Math.max(36, ((endMin - startMin) / 30) * 44);

                                const prof = sched.consulting_professionals;
                                const color = prof?.color || '#3B82F6';

                                const matchesSearch =
                                  !searchTerm ||
                                  (prof?.full_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                                  (prof?.specialty || '').toLowerCase().includes(searchTerm.toLowerCase());

                                const durationMin = endMin - startMin;
                                const isShort = durationMin <= 30; // 30 minutos (44px)
                                const isMedium = durationMin > 30 && durationMin < 60; // 45 minutos
                                const isTall = height >= 88; // Más de 1 hora
                                const isCurrentlyDragged = draggedSchedule?.id === sched.id;

                                return (
                                  <div
                                    key={sched.id}
                                    draggable={canEdit && isReorganizeMode}
                                    onDragStart={e => {
                                      if (!canEdit || !isReorganizeMode) return;
                                      // Guardar offset Y dentro de la tarjeta para calcular correctamente el slot destino
                                      dragOffsetYRef.current = e.clientY - e.currentTarget.getBoundingClientRect().top;
                                      setDraggedSchedule(sched);
                                      draggedScheduleRef.current = sched;
                                      e.dataTransfer.effectAllowed = 'move';
                                      e.dataTransfer.setData('text/plain', sched.id);
                                    }}
                                    onDragEnd={() => {
                                      setTimeout(() => {
                                        setDraggedSchedule(null);
                                        draggedScheduleRef.current = null;
                                        setDragOverTarget(null);
                                      }, 100);
                                    }}
                                    onClick={() => {
                                      if (canEdit && !isReorganizeMode) {
                                        handleEditSchedule(sched);
                                      }
                                    }}
                                    style={{
                                      top: `${topOffset + 1}px`,
                                      height: `${height - 2}px`,
                                      borderLeftColor: color
                                    }}
                                    className={`absolute inset-x-1 rounded-lg border-l-4 bg-gradient-to-r from-blue-50/95 to-slate-50/90 border border-slate-200/90 hover:border-blue-300 hover:shadow-md transition-all ${
                                      isShort ? 'px-1.5 py-1' : 'p-2'
                                    } flex flex-col justify-between overflow-hidden z-10 select-none ${
                                      canEdit && isReorganizeMode
                                        ? 'cursor-grab active:cursor-grabbing ring-1 ring-amber-400/60'
                                        : canEdit
                                        ? 'cursor-pointer hover:ring-1 hover:ring-blue-400'
                                        : 'cursor-default'
                                    } ${
                                      isCurrentlyDragged
                                        ? 'opacity-40 scale-95 border-dashed border-2 border-amber-500 shadow-inner'
                                        : matchesSearch
                                        ? 'opacity-100'
                                        : 'opacity-20'
                                    } group`}
                                    title={
                                      isReorganizeMode
                                        ? 'Modo Reorganizar activo: Arrastra para mover horario o cambiar de consultorio/día.'
                                        : canEdit
                                        ? 'Clic para editar horario asignado.'
                                        : undefined
                                    }
                                  >
                                    <div className="min-w-0">
                                      <div className="flex items-center justify-between gap-1">
                                        <p className={`font-bold text-slate-900 leading-tight truncate ${
                                          isShort ? 'text-[11px]' : 'text-xs'
                                        }`}>
                                          {prof?.full_name || 'Profesional'}
                                        </p>
                                        {canEdit && (
                                          <button
                                            onClick={e => {
                                              e.stopPropagation();
                                              handleDeleteSchedule(sched.id);
                                            }}
                                            title="Eliminar asignación"
                                            className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-rose-600 p-0.5 rounded transition-opacity shrink-0"
                                          >
                                            <span className="material-symbols-outlined text-xs">close</span>
                                          </button>
                                        )}
                                      </div>
                                      {!isShort && (
                                        <p className="text-[10px] font-medium text-slate-500 truncate mt-0.5">
                                          {prof?.specialty || 'General'}
                                        </p>
                                      )}
                                    </div>

                                    {/* Pie del bloque con horario y badges */}
                                    <div className={`flex items-center justify-between gap-1 flex-wrap ${
                                      isShort ? 'mt-0 pt-0' : 'mt-1 pt-1 border-t border-slate-200/50'
                                    }`}>
                                      <span className={`inline-flex items-center gap-0.5 font-bold text-slate-700 bg-white/90 rounded text-[9px] shadow-2xs border border-slate-200/60 ${
                                        isShort ? 'px-1 py-0' : 'px-1.5 py-0.5 text-[10px]'
                                      }`}>
                                        <span className="material-symbols-outlined text-[10px] text-blue-600">schedule</span>
                                        {formatTime(sched.start_time)} - {formatTime(sched.end_time)}
                                      </span>

                                      {isTall && prof?.doctor_id && (
                                        <span
                                          className="text-[9px] bg-blue-100 text-blue-700 px-1.5 py-0.2 rounded font-bold"
                                          title="Médico vinculado"
                                        >
                                          Médico
                                        </span>
                                      )}
                                    </div>
                                  </div>
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
            )}

            {/* ==================== VISTA 2: POR PROFESIONAL ==================== */}
            {viewMode === 'professionals' && (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Lista de Profesionales */}
                <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-4 flex flex-col h-[calc(100vh-210px)] overflow-hidden">
                  <div className="mb-3">
                    <h2 className="text-sm font-bold text-slate-900">Profesionales ({professionals.length})</h2>
                    <p className="text-xs text-slate-400">Seleccione un profesional para ver su agenda semanal</p>
                    <div className="mt-2 relative">
                      <span className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-sm">search</span>
                      <input
                        type="text"
                        placeholder="Filtrar por nombre o especialidad..."
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                        className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:outline-none focus:border-blue-500 text-slate-800"
                      />
                    </div>
                  </div>

                  <div className="flex-1 overflow-y-auto divide-y divide-slate-100 pr-1">
                    {professionals
                      .filter(p => {
                        const term = searchTerm.toLowerCase();
                        return (
                          p.full_name.toLowerCase().includes(term) ||
                          p.specialty?.toLowerCase().includes(term)
                        );
                      })
                      .map(prof => {
                        const isSelected = selectedProfessionalId === prof.id;
                        const profSchedules = schedules.filter(s => s.professional_id === prof.id);
                        let totalMinutes = 0;
                        profSchedules.forEach(s => {
                          totalMinutes += Math.max(0, timeToMinutes(s.end_time) - timeToMinutes(s.start_time));
                        });
                        const totalHours = Math.round((totalMinutes / 60) * 10) / 10;

                        return (
                          <div
                            key={prof.id}
                            onClick={() => setSelectedProfessionalId(prof.id)}
                            className={`p-3 rounded-xl cursor-pointer transition-all flex items-center justify-between ${
                              isSelected
                                ? 'bg-blue-50/80 border border-blue-200'
                                : 'hover:bg-slate-50'
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              <div
                                style={{ backgroundColor: prof.color || '#3B82F6' }}
                                className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shadow-2xs"
                              >
                                {prof.full_name.slice(0, 2).toUpperCase()}
                              </div>
                              <div>
                                <p className="text-xs font-bold text-slate-800">{prof.full_name}</p>
                                <p className="text-[11px] text-slate-400">{prof.specialty || 'General'}</p>
                              </div>
                            </div>
                            <div className="text-right">
                              <span className="text-xs font-bold text-blue-600">{totalHours}h</span>
                              <p className="text-[10px] text-slate-400">{profSchedules.length} turnos</p>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </div>

                {/* Detalle de Agenda del Profesional Seleccionado */}
                <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200/80 shadow-xs p-6 h-[calc(100vh-210px)] overflow-y-auto">
                  {(() => {
                    const prof = professionals.find(p => p.id === selectedProfessionalId) || professionals[0];
                    if (!prof) {
                      return (
                        <div className="h-full flex items-center justify-center text-slate-400 text-xs">
                          No hay profesionales registrados
                        </div>
                      );
                    }

                    const profSchedules = schedules.filter(s => s.professional_id === prof.id);

                    return (
                      <div>
                        {/* Cabecera del profesional */}
                        <div className="flex items-center justify-between pb-4 border-b border-slate-100">
                          <div className="flex items-center gap-3">
                            <div
                              style={{ backgroundColor: prof.color || '#3B82F6' }}
                              className="w-12 h-12 rounded-2xl flex items-center justify-center text-white text-base font-bold shadow-sm"
                            >
                              {prof.full_name.slice(0, 2).toUpperCase()}
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <h2 className="text-base font-bold text-slate-900">{prof.full_name}</h2>
                                {prof.doctor_id && (
                                  <span className="text-[10px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded-md font-semibold flex items-center gap-1" title="Vinculado al Padrón de Médicos">
                                    <span className="material-symbols-outlined text-xs">medical_services</span>
                                    Médico del Sistema
                                  </span>
                                )}
                                {prof.user_id && (
                                  <span className="text-[10px] bg-purple-100 text-purple-700 px-2 py-0.5 rounded-md font-semibold flex items-center gap-1" title="Vinculado a Usuario con Login">
                                    <span className="material-symbols-outlined text-xs">account_circle</span>
                                    Usuario
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-2 text-xs text-slate-500 mt-0.5">
                                <span className="font-medium text-blue-600 bg-blue-50 px-2 py-0.5 rounded-md">
                                  {prof.specialty || 'Especialidad General'}
                                </span>
                                {prof.license_number && (
                                  <span>Matrícula: {prof.license_number}</span>
                                )}
                              </div>
                            </div>
                          </div>

                          {canEdit && (
                            <button
                              onClick={() => {
                                setEditingSchedule({
                                  professional_id: prof.id,
                                  consulting_room_id: filteredRooms[0]?.id || '',
                                  day_of_week: 1,
                                  start_time: '08:00:00',
                                  end_time: '12:00:00',
                                  active: true
                                });
                                setIsScheduleModalOpen(true);
                              }}
                              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg text-xs font-semibold transition-all"
                            >
                              <span className="material-symbols-outlined text-sm">add</span>
                              Agregar Horario
                            </button>
                          )}
                        </div>

                        {/* Desglose por Días de la Semana */}
                        <div className="mt-6 space-y-4">
                          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                            Distribución Semanal
                          </h3>

                          <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
                            {DAYS.map(day => {
                              const dayList = profSchedules.filter(s => s.day_of_week === day.id);

                              return (
                                <div
                                  key={day.id}
                                  className="bg-slate-50/70 rounded-xl border border-slate-200/60 p-3 flex flex-col"
                                >
                                  <div className="flex items-center justify-between pb-2 border-b border-slate-200/50 mb-2">
                                    <span className="text-xs font-bold text-slate-700">{day.name}</span>
                                    <span className="text-[10px] text-slate-400 font-semibold">
                                      {dayList.length}
                                    </span>
                                  </div>

                                  {dayList.length === 0 ? (
                                    <div className="flex-1 flex items-center justify-center py-6 text-[11px] text-slate-400 italic">
                                      Sin turnos
                                    </div>
                                  ) : (
                                    <div className="space-y-2">
                                      {dayList.map(s => (
                                        <div
                                          key={s.id}
                                          className="bg-white p-2.5 rounded-lg border border-slate-200 shadow-2xs group"
                                        >
                                          <div className="flex items-center justify-between">
                                            <span className="text-xs font-bold text-blue-600">
                                              {s.consulting_rooms?.name}
                                            </span>
                                            {canEdit && (
                                              <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <button
                                                  onClick={() => handleEditSchedule(s)}
                                                  className="p-0.5 text-slate-400 hover:text-blue-600 rounded"
                                                >
                                                  <span className="material-symbols-outlined text-xs">edit</span>
                                                </button>
                                                <button
                                                  onClick={() => handleDeleteSchedule(s.id)}
                                                  className="p-0.5 text-slate-400 hover:text-rose-600 rounded"
                                                >
                                                  <span className="material-symbols-outlined text-xs">delete</span>
                                                </button>
                                              </div>
                                            )}
                                          </div>
                                          <p className="text-[11px] font-semibold text-slate-700 mt-1">
                                            {formatTime(s.start_time)} - {formatTime(s.end_time)}
                                          </p>
                                          <p className="text-[10px] text-slate-400">
                                            {s.consulting_rooms?.sector}
                                          </p>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </div>
            )}

            {/* ==================== VISTA 3: ANALÍTICAS & OCUPACIÓN ==================== */}
            {viewMode === 'analytics' && (
              <div className="space-y-6">
                {/* Métricas Resumen */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                      <span className="material-symbols-outlined text-2xl">pie_chart</span>
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Ocupación Global</p>
                      <h3 className="text-2xl font-bold text-slate-900 mt-0.5">{analytics.globalRate}%</h3>
                      <p className="text-[11px] text-slate-500">Meta sugerida: 70%</p>
                    </div>
                  </div>

                  <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                      <span className="material-symbols-outlined text-2xl">schedule</span>
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Horas Ocupadas</p>
                      <h3 className="text-2xl font-bold text-slate-900 mt-0.5">{analytics.totalOccupiedHours} hs</h3>
                      <p className="text-[11px] text-slate-500">De {analytics.totalCapacityHours} hs disponibles</p>
                    </div>
                  </div>

                  <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center">
                      <span className="material-symbols-outlined text-2xl">meeting_room</span>
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Consultorios Activos</p>
                      <h3 className="text-2xl font-bold text-slate-900 mt-0.5">
                        {rooms.filter(r => r.active).length}
                      </h3>
                      <p className="text-[11px] text-slate-500">En 2 sectores de la clínica</p>
                    </div>
                  </div>

                  <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
                      <span className="material-symbols-outlined text-2xl">groups</span>
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Profesionales</p>
                      <h3 className="text-2xl font-bold text-slate-900 mt-0.5">{professionals.length}</h3>
                      <p className="text-[11px] text-slate-500">Con turnos asignados</p>
                    </div>
                  </div>
                </div>

                {/* Tabla de Ocupación por Consultorio */}
                <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-6">
                  <h3 className="text-sm font-bold text-slate-900 mb-4">
                    Detalle de Capacidad y Ocupación por Consultorio
                  </h3>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="border-b border-slate-100 text-slate-400 uppercase font-bold text-[10px]">
                          <th className="pb-3">Consultorio</th>
                          <th className="pb-3">Sector</th>
                          <th className="pb-3">Horas Ocupadas</th>
                          <th className="pb-3">Capacidad Semanal</th>
                          <th className="pb-3">Nivel de Ocupación</th>
                          <th className="pb-3 text-right">% Ocupación</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {rooms.map(room => {
                          const occMinutes = analytics.roomOccupationMap[room.id] || 0;
                          const occHours = Math.round((occMinutes / 60) * 10) / 10;
                          const maxHours = 70; // 14hs x 5 días
                          const pct = Math.round((occHours / maxHours) * 100);

                          return (
                            <tr key={room.id} className="hover:bg-slate-50/50">
                              <td className="py-3 font-bold text-slate-800">{room.name}</td>
                              <td className="py-3 text-slate-500">{room.sector}</td>
                              <td className="py-3 font-semibold text-slate-700">{occHours} hs</td>
                              <td className="py-3 text-slate-400">{maxHours} hs</td>
                              <td className="py-3 w-48">
                                <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                                  <div
                                    style={{ width: `${Math.min(pct, 100)}%` }}
                                    className={`h-full rounded-full ${
                                      pct >= 70
                                        ? 'bg-emerald-500'
                                        : pct >= 40
                                        ? 'bg-blue-500'
                                        : 'bg-amber-400'
                                    }`}
                                  />
                                </div>
                              </td>
                              <td className="py-3 text-right font-bold text-slate-800">{pct}%</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* ==================== VISTA 5: TARIFAS Y FINANZAS EJECUTIVAS (SUPERADMIN Y DIRECCIÓN) ==================== */}
            {viewMode === 'financial' && isExecutive && (
              <div className="space-y-6">
                {/* KPIs Financieros */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div className="bg-gradient-to-br from-emerald-500 to-teal-700 p-5 rounded-2xl text-white shadow-md shadow-emerald-600/20">
                    <div className="flex items-center justify-between opacity-80 mb-2">
                      <span className="text-xs font-bold uppercase tracking-wider">Ingreso Mensual Estimado</span>
                      <span className="material-symbols-outlined">payments</span>
                    </div>
                    <div className="text-2xl font-black">
                      ${analytics.totalMonthlyProjectedRevenue.toLocaleString('es-AR')}
                    </div>
                    <p className="text-[11px] opacity-80 mt-1">
                      Basado en {analytics.totalOccupiedHours} hs/semana ocupadas
                    </p>
                  </div>

                  <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
                    <div className="flex items-center justify-between text-slate-400 mb-2">
                      <span className="text-xs font-bold uppercase tracking-wider">Ingreso Semanal Efectivo</span>
                      <span className="material-symbols-outlined text-emerald-600">calendar_view_week</span>
                    </div>
                    <div className="text-2xl font-bold text-slate-900">
                      ${analytics.totalWeeklyProjectedRevenue.toLocaleString('es-AR')}
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1">
                      Facturación semanal por horas ocupadas
                    </p>
                  </div>

                  <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
                    <div className="flex items-center justify-between text-slate-400 mb-2">
                      <span className="text-xs font-bold uppercase tracking-wider">Potencial Máximo al 100%</span>
                      <span className="material-symbols-outlined text-blue-600">trending_up</span>
                    </div>
                    <div className="text-2xl font-bold text-blue-600">
                      ${analytics.totalPotentialMonthlyRevenue.toLocaleString('es-AR')}
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1">
                      Si todos los consultorios estuvieran al 100%
                    </p>
                  </div>

                  <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
                    <div className="flex items-center justify-between text-slate-400 mb-2">
                      <span className="text-xs font-bold uppercase tracking-wider">Eficiencia de Facturación</span>
                      <span className="material-symbols-outlined text-indigo-600">percent</span>
                    </div>
                    <div className="text-2xl font-bold text-indigo-600">
                      {analytics.totalPotentialMonthlyRevenue > 0
                        ? Math.round((analytics.totalMonthlyProjectedRevenue / analytics.totalPotentialMonthlyRevenue) * 100)
                        : 0}%
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1">
                      {analytics.globalRate}% de ocupación de capacidad horaria
                    </p>
                  </div>
                </div>

                {/* Tabla 1: Tarifas y Rendimiento por Consultorio */}
                <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-6">
                  <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                    <div>
                      <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                        <span className="material-symbols-outlined text-emerald-600">meeting_room</span>
                        Tarifas y Facturación Proyectada por Consultorio
                      </h3>
                      <p className="text-xs text-slate-400">
                        Configure la tarifa horaria base de cada consultorio y supervise su facturación proyectada
                      </p>
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="border-b border-slate-100 text-slate-400 uppercase font-bold text-[10px]">
                          <th className="pb-3">Consultorio</th>
                          <th className="pb-3">Sector</th>
                          <th className="pb-3">Equipamiento / Accesorios</th>
                          <th className="pb-3">Tarifa Base / Hora</th>
                          <th className="pb-3">Ocupación Semanal</th>
                          <th className="pb-3">Fact. Semanal</th>
                          <th className="pb-3">Fact. Mensual Estimada</th>
                          <th className="pb-3 text-right">Acción</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {rooms.map(room => {
                          const fin = analytics.roomFinancials[room.id] || {
                            hourlyRate: Number(room.hourly_rate) || 0,
                            occupiedHours: 0,
                            weeklyRevenue: 0,
                            monthlyRevenue: 0,
                            occupancyRate: 0,
                            equipment: room.equipment || []
                          };

                          return (
                            <tr key={room.id} className="hover:bg-slate-50/50 transition-colors">
                              <td className="py-3 font-bold text-slate-800 flex items-center gap-2">
                                <span
                                  style={{ backgroundColor: room.color || '#3B82F6' }}
                                  className="w-2.5 h-2.5 rounded-full shrink-0"
                                />
                                {room.name}
                              </td>
                              <td className="py-3 text-slate-500">{room.sector}</td>
                              <td className="py-3">
                                <div className="flex flex-wrap gap-1 max-w-xs">
                                  {room.equipment && room.equipment.length > 0 ? (
                                    room.equipment.map((eq, i) => (
                                      <span
                                        key={i}
                                        className="text-[10px] bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded-md font-medium border border-slate-200/60"
                                      >
                                        {eq}
                                      </span>
                                    ))
                                  ) : (
                                    <span className="text-[10px] text-slate-400 italic">Sin equipamiento asignado</span>
                                  )}
                                </div>
                              </td>
                              <td className="py-3">
                                <span className={`font-semibold px-2 py-1 rounded-md text-[11px] ${
                                  fin.hourlyRate > 0 ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-amber-50 text-amber-700 border border-amber-200'
                                }`}>
                                  ${fin.hourlyRate.toLocaleString('es-AR')} / hs
                                </span>
                              </td>
                              <td className="py-3">
                                <div className="flex items-center gap-2">
                                  <span className="font-semibold text-slate-700">{fin.occupiedHours} hs</span>
                                  <span className="text-[10px] text-slate-400">({fin.occupancyRate}%)</span>
                                </div>
                              </td>
                              <td className="py-3 font-bold text-slate-800">
                                ${fin.weeklyRevenue.toLocaleString('es-AR')}
                              </td>
                              <td className="py-3 font-black text-emerald-700">
                                ${fin.monthlyRevenue.toLocaleString('es-AR')}
                              </td>
                              <td className="py-3 text-right">
                                <button
                                  onClick={() => {
                                    setEditingRoom({ ...room });
                                    setIsRoomModalOpen(true);
                                  }}
                                  className="px-2.5 py-1 bg-slate-100 hover:bg-blue-50 text-slate-600 hover:text-blue-700 rounded-lg text-xs font-semibold transition-all inline-flex items-center gap-1"
                                >
                                  <span className="material-symbols-outlined text-xs">edit</span>
                                  Tarifa / Equipos
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Tabla 2: Tarifas y Facturación por Profesional */}
                <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-6">
                  <div className="mb-4">
                    <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                      <span className="material-symbols-outlined text-blue-600">group</span>
                      Facturación y Alquileres de Consultorio por Profesional
                    </h3>
                    <p className="text-xs text-slate-400">
                      Rendimiento económico generado según las horas asignadas y tarifas pactadas por profesional
                    </p>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="border-b border-slate-100 text-slate-400 uppercase font-bold text-[10px]">
                          <th className="pb-3">Profesional</th>
                          <th className="pb-3">Especialidad</th>
                          <th className="pb-3">Tarifa Especial Pactada</th>
                          <th className="pb-3">Horas Semanales</th>
                          <th className="pb-3">Total Semanal</th>
                          <th className="pb-3">Total Mensual Estimado</th>
                          <th className="pb-3 text-right">Acción</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {analytics.profFinancials.map(pf => {
                          const profObj = professionals.find(p => p.id === pf.profId);
                          return (
                            <tr key={pf.profId} className="hover:bg-slate-50/50 transition-colors">
                              <td className="py-3 font-bold text-slate-800">{pf.fullName}</td>
                              <td className="py-3 text-slate-500">{pf.specialty}</td>
                              <td className="py-3">
                                {pf.customRate != null ? (
                                  <span className="text-[11px] font-bold text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-md">
                                    ${Number(pf.customRate).toLocaleString('es-AR')} / hs (Personalizada)
                                  </span>
                                ) : (
                                  <span className="text-[10px] text-slate-400 italic">
                                    Aplica tarifa base del consultorio
                                  </span>
                                )}
                              </td>
                              <td className="py-3 font-semibold text-slate-700">{pf.weeklyHours} hs</td>
                              <td className="py-3 font-bold text-slate-800">
                                ${pf.weeklyRevenue.toLocaleString('es-AR')}
                              </td>
                              <td className="py-3 font-black text-emerald-700">
                                ${pf.monthlyRevenue.toLocaleString('es-AR')}
                              </td>
                              <td className="py-3 text-right">
                                <button
                                  onClick={() => {
                                    if (profObj) {
                                      setEditingProf({ ...profObj });
                                      setIsProfModalOpen(true);
                                    }
                                  }}
                                  className="px-2.5 py-1 bg-slate-100 hover:bg-blue-50 text-slate-600 hover:text-blue-700 rounded-lg text-xs font-semibold transition-all inline-flex items-center gap-1"
                                >
                                  <span className="material-symbols-outlined text-xs">edit</span>
                                  Editar Tarifa
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* ==================== VISTA 4: GESTIÓN DE ESPACIOS Y PROFESIONALES ==================== */}
            {viewMode === 'management' && canEdit && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Gestión de Consultorios */}
                <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h3 className="text-sm font-bold text-slate-900">Consultorios</h3>
                      <p className="text-xs text-slate-400">Administrar consultorios físicos y sectores</p>
                    </div>
                    <button
                      onClick={() => {
                        setEditingRoom({ name: '', sector: 'Planta Principal', color: '#3B82F6', active: true });
                        setIsRoomModalOpen(true);
                      }}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold shadow-xs"
                    >
                      <span className="material-symbols-outlined text-sm">add</span>
                      Nuevo Consultorio
                    </button>
                  </div>

                  <div className="divide-y divide-slate-100 max-h-[500px] overflow-y-auto pr-1">
                    {rooms.map(room => (
                      <div key={room.id} className="py-3 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <span
                            style={{ backgroundColor: room.color || '#3B82F6' }}
                            className="w-3 h-3 rounded-full"
                          />
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="text-xs font-bold text-slate-800">{room.name}</p>
                              {Number(room.hourly_rate) > 0 && (
                                <span className="text-[9px] bg-emerald-100 text-emerald-800 font-bold px-1.5 py-0.2 rounded">
                                  ${Number(room.hourly_rate).toLocaleString('es-AR')}/h
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] text-slate-400">{room.sector}</p>
                            {room.equipment && room.equipment.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-1">
                                {room.equipment.map((eq, i) => (
                                  <span
                                    key={i}
                                    className="text-[9px] bg-slate-100 text-slate-600 px-1.5 py-0.2 rounded font-medium border border-slate-200/60"
                                  >
                                    {eq}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => {
                              setEditingRoom({ ...room });
                              setIsRoomModalOpen(true);
                            }}
                            className="p-1 text-slate-400 hover:text-blue-600 rounded"
                          >
                            <span className="material-symbols-outlined text-sm">edit</span>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Gestión de Profesionales */}
                <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h3 className="text-sm font-bold text-slate-900">Profesionales</h3>
                      <p className="text-xs text-slate-400">Administrar médicos y especialistas</p>
                    </div>
                    <button
                      onClick={() => {
                        setEditingProf({ full_name: '', specialty: 'General', license_number: '', color: '#10B981', active: true });
                        setIsProfModalOpen(true);
                      }}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold shadow-xs"
                    >
                      <span className="material-symbols-outlined text-sm">add</span>
                      Nuevo Profesional
                    </button>
                  </div>

                  <div className="divide-y divide-slate-100 max-h-[500px] overflow-y-auto pr-1">
                    {professionals.map(prof => (
                      <div key={prof.id} className="py-3 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <span
                            style={{ backgroundColor: prof.color || '#10B981' }}
                            className="w-3 h-3 rounded-full"
                          />
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="text-xs font-bold text-slate-800">{prof.full_name}</p>
                              {prof.doctor_id && (
                                <span className="text-[9px] bg-blue-100 text-blue-700 px-1.5 py-0.2 rounded-full font-bold flex items-center gap-0.5" title="Vinculado con Médico del Sistema">
                                  <span className="material-symbols-outlined text-[10px]">medical_services</span>
                                  Médico
                                </span>
                              )}
                              {prof.user_id && (
                                <span className="text-[9px] bg-purple-100 text-purple-700 px-1.5 py-0.2 rounded-full font-bold flex items-center gap-0.5" title="Vinculado con Usuario del Sistema">
                                  <span className="material-symbols-outlined text-[10px]">account_circle</span>
                                  Usuario
                                </span>
                              )}
                              {prof.custom_hourly_rate != null && (
                                <span className="text-[9px] bg-blue-50 text-blue-800 font-bold px-1.5 py-0.2 rounded border border-blue-200" title="Tarifa especial del profesional">
                                  ${Number(prof.custom_hourly_rate).toLocaleString('es-AR')}/h
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] text-slate-400">
                              {prof.specialty || 'General'} {prof.license_number ? `· Mat. ${prof.license_number}` : ''}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => {
                              setEditingProf({ ...prof });
                              setIsProfModalOpen(true);
                            }}
                            className="p-1 text-slate-400 hover:text-blue-600 rounded"
                          >
                            <span className="material-symbols-outlined text-sm">edit</span>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* ==================== MODAL: BUSCADOR INTELIGENTE DE TURNOS LIBRES ==================== */}
      {isFreeSlotFinderOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-2xl overflow-hidden animate-scaleIn flex flex-col max-h-[90vh]">
            {/* Cabecera del Buscador */}
            <div className="px-6 py-4 bg-gradient-to-r from-slate-900 to-indigo-950 text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-blue-500/20 text-blue-400 flex items-center justify-center border border-blue-500/30">
                  <span className="material-symbols-outlined text-xl">search_check</span>
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    Buscador de Disponibilidad y Turnos Libres
                  </h3>
                  <p className="text-[11px] text-slate-300">
                    Encuentre consultorios disponibles según día, franja horaria y equipamiento
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsFreeSlotFinderOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg transition-colors"
              >
                <span className="material-symbols-outlined text-xl">close</span>
              </button>
            </div>

            {/* Formulario de Consulta / Filtros */}
            <div className="p-6 bg-slate-50/70 border-b border-slate-200/80">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
                {/* Día de la semana */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1 flex items-center gap-1">
                    <span className="material-symbols-outlined text-xs text-blue-600">calendar_view_day</span>
                    Día de la Semana
                  </label>
                  <select
                    value={finderDay}
                    onChange={e => setFinderDay(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:border-blue-500 cursor-pointer"
                  >
                    {DAYS.map(d => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Hora Desde */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1 flex items-center gap-1">
                    <span className="material-symbols-outlined text-xs text-blue-600">schedule</span>
                    Hora Inicio
                  </label>
                  <input
                    type="time"
                    step="1800"
                    value={finderStartTime}
                    onChange={e => setFinderStartTime(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:border-blue-500"
                  />
                </div>

                {/* Hora Hasta */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1 flex items-center gap-1">
                    <span className="material-symbols-outlined text-xs text-blue-600">schedule</span>
                    Hora Fin
                  </label>
                  <input
                    type="time"
                    step="1800"
                    value={finderEndTime}
                    onChange={e => setFinderEndTime(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              {/* Filtro de Sector y Profesional solicitante */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Sector */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1 flex items-center gap-1">
                    <span className="material-symbols-outlined text-xs text-blue-600">apartment</span>
                    Sector
                  </label>
                  <select
                    value={finderSector}
                    onChange={e => setFinderSector(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:border-blue-500 cursor-pointer"
                  >
                    {sectors.map(sec => (
                      <option key={sec} value={sec}>
                        {sec === 'all' ? 'Todos los sectores' : sec}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Profesional que desea reservar */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1 flex items-center gap-1">
                    <span className="material-symbols-outlined text-xs text-blue-600">person</span>
                    Profesional a Asignar
                  </label>
                  <select
                    value={finderSelectedProfId}
                    onChange={e => setFinderSelectedProfId(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:border-blue-500 cursor-pointer"
                  >
                    {professionals.map(p => (
                      <option key={p.id} value={p.id}>
                        {p.full_name} ({p.specialty || 'General'})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* CRITERIOS AVANZADOS: EQUIPAMIENTO REQUERIDO Y CONSULTORIOS A CONSIDERAR */}
              <div className="mt-3 pt-3 border-t border-slate-200/80 grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* 1. Equipamiento indispensable que debe tener el consultorio */}
                <div className="bg-white p-3 rounded-2xl border border-slate-200/80">
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-[11px] font-bold text-slate-800 flex items-center gap-1">
                      <span className="material-symbols-outlined text-sm text-indigo-600">devices</span>
                      Equipamiento / Accesorios Necesarios:
                    </label>
                    {finderSelectedEquipments.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setFinderSelectedEquipments([])}
                        className="text-[10px] text-blue-600 hover:underline font-semibold"
                      >
                        Limpiar ({finderSelectedEquipments.length})
                      </button>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto pr-1">
                    {equipmentCatalog.map(eq => {
                      const isSelected = finderSelectedEquipments.includes(eq.name);
                      return (
                        <button
                          key={eq.id}
                          type="button"
                          onClick={() => {
                            if (isSelected) {
                              setFinderSelectedEquipments(finderSelectedEquipments.filter(e => e !== eq.name));
                            } else {
                              setFinderSelectedEquipments([...finderSelectedEquipments, eq.name]);
                            }
                          }}
                          className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all flex items-center gap-1 border cursor-pointer ${
                            isSelected
                              ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                              : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
                          }`}
                        >
                          <span className="material-symbols-outlined text-[13px]">
                            {isSelected ? 'check' : 'add'}
                          </span>
                          {eq.name}
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-[10px] text-slate-400 mt-1.5">
                    Solo se considerarán consultorios que cuenten con todos los elementos marcados.
                  </p>
                </div>

                {/* 2. Exclusión / Selección de Consultorios y Duración Mínima de Tramo */}
                <div className="bg-white p-3 rounded-2xl border border-slate-200/80 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] font-bold text-slate-800 flex items-center gap-1">
                      <span className="material-symbols-outlined text-sm text-amber-600">meeting_room</span>
                      Consultorios a Considerar / Descartar:
                    </label>
                    {finderExcludedRoomIds.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setFinderExcludedRoomIds([])}
                        className="text-[10px] text-amber-600 hover:underline font-semibold"
                      >
                        Habilitar todos ({finderExcludedRoomIds.length} excluidos)
                      </button>
                    )}
                  </div>

                  {/* Toggle rápido de consultorios a descartar */}
                  <div className="flex flex-wrap gap-1 max-h-16 overflow-y-auto pr-1">
                    {rooms.filter(r => r.active).map(r => {
                      const isExcluded = finderExcludedRoomIds.includes(r.id);
                      return (
                        <button
                          key={r.id}
                          type="button"
                          onClick={() => {
                            if (isExcluded) {
                              setFinderExcludedRoomIds(finderExcludedRoomIds.filter(id => id !== r.id));
                            } else {
                              setFinderExcludedRoomIds([...finderExcludedRoomIds, r.id]);
                            }
                          }}
                          className={`px-2 py-0.5 rounded-md text-[10px] font-bold transition-all border cursor-pointer ${
                            isExcluded
                              ? 'bg-rose-50 text-rose-600 border-rose-200 line-through opacity-60'
                              : 'bg-emerald-50 text-emerald-800 border-emerald-200'
                          }`}
                          title={isExcluded ? 'Consultorio descartado de la búsqueda' : 'Consultorio tenido en cuenta'}
                        >
                          {r.name}
                        </button>
                      );
                    })}
                  </div>

                  {/* Duración mínima por tramo */}
                  <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2">
                    <span className="text-[10px] font-bold text-slate-600 flex items-center gap-1">
                      <span className="material-symbols-outlined text-xs text-blue-600">timelapse</span>
                      Tiempo mínimo por consultorio:
                    </span>
                    <select
                      value={finderMinDurationMin}
                      onChange={e => setFinderMinDurationMin(Number(e.target.value))}
                      className="px-2 py-1 bg-slate-50 border border-slate-200 rounded-lg text-[11px] font-semibold text-slate-800 focus:outline-none focus:border-blue-500 cursor-pointer"
                    >
                      <option value={30}>Mínimo 30 minutos</option>
                      <option value={60}>Mínimo 1 hora</option>
                      <option value={90}>Mínimo 1h 30m</option>
                      <option value={120}>Mínimo 2 horas</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>

            {/* Listado de Opciones y Resultados */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* SECCIÓN A: PAQUETES COMBINADOS CONTINUOS (MÚLTIPLES CONSULTORIOS) */}
              {finderSolutions.combinationPackages.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-purple-900 flex items-center gap-1.5 bg-purple-100/70 border border-purple-200 px-3 py-1.5 rounded-xl">
                      <span className="material-symbols-outlined text-sm text-purple-700">inventory_2</span>
                      PAQUETES COMBINADOS (100% de la franja cubierta rotando de consultorio)
                    </span>
                    <span className="text-[11px] text-purple-700 font-semibold">
                      {finderSolutions.combinationPackages.length} combinaciones sugeridas
                    </span>
                  </div>

                  <div className="space-y-3">
                    {finderSolutions.combinationPackages.map(pkg => (
                      <div
                        key={pkg.id}
                        className="bg-gradient-to-r from-purple-50/90 via-indigo-50/50 to-white rounded-2xl border-2 border-purple-200/90 p-4 shadow-sm relative overflow-hidden"
                      >
                        <div className="flex items-start justify-between gap-3 mb-3 flex-wrap">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] bg-purple-600 text-white font-extrabold px-2 py-0.5 rounded-full uppercase tracking-wider flex items-center gap-1">
                                <span className="material-symbols-outlined text-xs">auto_awesome</span>
                                Paquete Sugerido
                              </span>
                              <h4 className="text-sm font-bold text-slate-900">
                                Cobertura Completa: {finderStartTime} a {finderEndTime}
                              </h4>
                            </div>
                            <p className="text-xs text-slate-600 mt-1">
                              El profesional atiende toda su franja repartida en {pkg.legs.length} consultorios continuos:
                            </p>
                          </div>

                          {/* Botones de Reserva del Paquete Completo */}
                          {canEdit && (
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => handleBookPackage(pkg, 'permanent')}
                                disabled={saving}
                                className="px-3 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold shadow-sm shadow-purple-600/30 flex items-center gap-1.5 transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
                                title="Fija todas las piernas del paquete en la grilla semanal para siempre"
                              >
                                <span className="material-symbols-outlined text-sm">all_inclusive</span>
                                Reservar Paquete Fijo Semanal
                              </button>
                              <button
                                onClick={() => handleBookPackage(pkg, 'specific')}
                                disabled={saving}
                                className="px-3 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-xs font-bold shadow-sm shadow-amber-500/30 flex items-center gap-1.5 transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
                                title="Reserva todas las piernas del paquete para la fecha puntual seleccionada"
                              >
                                <span className="material-symbols-outlined text-sm">event</span>
                                Reservar Paquete Puntual
                              </button>
                            </div>
                          )}
                        </div>

                        {/* Visualización de las piernas del paquete con flecha conectora */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
                          {pkg.legs.map((leg, legIdx) => (
                            <div
                              key={legIdx}
                              className="bg-white/90 border border-purple-100 rounded-xl p-3 flex items-center justify-between"
                            >
                              <div className="flex items-center gap-2.5">
                                <div className="w-6 h-6 rounded-full bg-purple-100 text-purple-700 font-bold text-xs flex items-center justify-center shrink-0">
                                  {legIdx + 1}
                                </div>
                                <div>
                                  <div className="flex items-center gap-1.5">
                                    <span
                                      style={{ backgroundColor: leg.room.color || '#3B82F6' }}
                                      className="w-2.5 h-2.5 rounded-full shrink-0"
                                    />
                                    <span className="text-xs font-bold text-slate-800">{leg.room.name}</span>
                                    <span className="text-[10px] text-slate-400">({leg.room.sector})</span>
                                  </div>
                                  {leg.room.equipment && leg.room.equipment.length > 0 && (
                                    <span className="text-[9px] text-slate-500 truncate max-w-[160px] block">
                                      {leg.room.equipment.join(', ')}
                                    </span>
                                  )}
                                </div>
                              </div>
                              <div className="text-right">
                                <span className="text-xs font-black text-purple-900 bg-purple-50 px-2 py-0.5 rounded-md border border-purple-200">
                                  {leg.startStr} a {leg.endStr}
                                </span>
                                <span className="block text-[10px] text-slate-400 mt-0.5 font-medium">
                                  {(leg.endMin - leg.startMin) / 60} hs
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* SECCIÓN B: CONSULTORIOS INDIVIDUALES (COMPLETOS O PARCIALES) */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-500" />
                    Consultorios Individuales con Disponibilidad:
                  </span>
                  <span className="text-[11px] text-slate-400 font-medium">
                    {finderSolutions.singleRoomSlots.length} opciones encontradas
                  </span>
                </div>

                {finderSolutions.singleRoomSlots.length === 0 && finderSolutions.combinationPackages.length === 0 ? (
                  <div className="p-8 text-center bg-slate-50 rounded-2xl border border-slate-200/80">
                    <span className="material-symbols-outlined text-4xl text-amber-500 mb-2">event_busy</span>
                    <h4 className="text-sm font-bold text-slate-800">No hay disponibilidad en esa franja</h4>
                    <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                      Todos los consultorios que coinciden con los filtros están ocupados los {DAYS.find(d => d.id === finderDay)?.name}s entre las {finderStartTime} y {finderEndTime}.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {finderSolutions.singleRoomSlots.map(({ room, freeIntervals, isFullyAvailable }) => (
                      <div
                        key={room.id}
                        className={`p-4 rounded-2xl border transition-all ${
                          isFullyAvailable
                            ? 'bg-emerald-50/50 border-emerald-200 shadow-xs'
                            : 'bg-white border-slate-200'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3 mb-3 flex-wrap">
                          <div className="flex items-center gap-2.5">
                            <span
                              style={{ backgroundColor: room.color || '#3B82F6' }}
                              className="w-3.5 h-3.5 rounded-full shrink-0"
                            />
                            <div>
                              <div className="flex items-center gap-2">
                                <h4 className="text-sm font-bold text-slate-900">{room.name}</h4>
                                <span className="text-[11px] text-slate-500 font-medium">{room.sector}</span>
                                {isFullyAvailable && (
                                  <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded-md flex items-center gap-0.5">
                                    <span className="material-symbols-outlined text-xs">check_circle</span>
                                    100% Libre en todo el rango
                                  </span>
                                )}
                              </div>
                              {room.equipment && room.equipment.length > 0 && (
                                <div className="flex flex-wrap gap-1 mt-1">
                                  {room.equipment.map((eq, i) => (
                                    <span
                                      key={i}
                                      className="text-[9px] bg-slate-100 text-slate-700 px-1.5 py-0.2 rounded font-medium border border-slate-200/60"
                                    >
                                      {eq}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>

                          {Number(room.hourly_rate) > 0 && (
                            <div className="text-right">
                              <span className="text-xs font-bold text-emerald-700">
                                ${Number(room.hourly_rate).toLocaleString('es-AR')}/h
                              </span>
                              <p className="text-[10px] text-slate-400">Tarifa base</p>
                            </div>
                          )}
                        </div>

                        {/* Intervalos libres dentro de este consultorio */}
                        <div className="space-y-2">
                          {freeIntervals.map((interval, idx) => (
                            <div
                              key={idx}
                              className="flex items-center justify-between bg-white p-2.5 rounded-xl border border-slate-200/80 gap-2 flex-wrap"
                            >
                              <div className="flex items-center gap-2">
                                <span className="material-symbols-outlined text-base text-emerald-600">timer</span>
                                <span className="text-xs font-bold text-slate-800">
                                  {interval.startStr} a {interval.endStr}
                                </span>
                                <span className="text-[11px] text-slate-400 font-medium">
                                  ({interval.durationMin / 60} horas libres)
                                </span>
                              </div>

                              {/* Botones de Acción de Reserva */}
                              {canEdit && (
                                <div className="flex items-center gap-1.5">
                                  {/* Botón: Reservar Fijo Semanal (Para Siempre) */}
                                  <button
                                    onClick={() => {
                                      setEditingSchedule({
                                        consulting_room_id: room.id,
                                        professional_id: finderSelectedProfId || professionals[0]?.id,
                                        day_of_week: finderDay,
                                        start_time: `${interval.startStr}:00`,
                                        end_time: `${interval.endStr}:00`,
                                        active: true,
                                        notes: 'Asignado desde Buscador de Turnos Libres'
                                      });
                                      setIsFreeSlotFinderOpen(false);
                                      setIsScheduleModalOpen(true);
                                    }}
                                    className="px-2.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold shadow-xs flex items-center gap-1 transition-all active:scale-95"
                                    title="Asignar horario fijo semanal recurrente (plantilla)"
                                  >
                                    <span className="material-symbols-outlined text-xs">all_inclusive</span>
                                    Fijo Semanal
                                  </button>

                                  {/* Botón: Reservar Fecha Específica */}
                                  <button
                                    onClick={() => {
                                      setEditingException({
                                        exception_type: 'horario_especial',
                                        consulting_room_id: room.id,
                                        professional_id: finderSelectedProfId || professionals[0]?.id,
                                        start_date: finderSpecificDate,
                                        end_date: finderSpecificDate,
                                        start_time: `${interval.startStr}:00`,
                                        end_time: `${interval.endStr}:00`,
                                        active: true,
                                        reason: `Turno puntual asignado de ${interval.startStr} a ${interval.endStr}`
                                      });
                                      setIsFreeSlotFinderOpen(false);
                                      setIsExceptionModalOpen(true);
                                    }}
                                    className="px-2.5 py-1.5 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-xs font-semibold shadow-xs flex items-center gap-1 transition-all active:scale-95"
                                    title="Reservar solo para una fecha puntual de calendario"
                                  >
                                    <span className="material-symbols-outlined text-xs">event</span>
                                    Fecha Puntual
                                  </button>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Pie con selector de fecha puntual rápida */}
            <div className="px-6 py-3 bg-slate-100/70 border-t border-slate-200 flex items-center justify-between flex-wrap gap-2 text-xs">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-semibold text-slate-600">Fecha para reservas puntuales:</span>
                <input
                  type="date"
                  value={finderSpecificDate}
                  onChange={e => setFinderSpecificDate(e.target.value)}
                  className="px-2 py-1 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-800"
                />
              </div>
              <button
                onClick={() => setIsFreeSlotFinderOpen(false)}
                className="px-4 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-xl font-semibold transition-colors"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================== MODAL: ASIGNAR / EDITAR HORARIO ==================== */}
      {isScheduleModalOpen && editingSchedule && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-md overflow-hidden animate-scaleIn">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900">
                {editingSchedule.id ? 'Editar Franja Horaria' : 'Nueva Asignación de Horario'}
              </h3>
              <button
                onClick={() => setIsScheduleModalOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <span className="material-symbols-outlined text-lg">close</span>
              </button>
            </div>

            <form onSubmit={handleSaveSchedule} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Consultorio *</label>
                <select
                  value={editingSchedule.consulting_room_id}
                  onChange={e => setEditingSchedule({ ...editingSchedule, consulting_room_id: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:border-blue-500"
                  required
                >
                  {rooms.filter(r => r.active).map(r => (
                    <option key={r.id} value={r.id}>{r.name} ({r.sector})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Profesional *</label>
                <select
                  value={editingSchedule.professional_id}
                  onChange={e => setEditingSchedule({ ...editingSchedule, professional_id: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:border-blue-500"
                  required
                >
                  {professionals.filter(p => p.active).map(p => (
                    <option key={p.id} value={p.id}>
                      {p.full_name} ({p.specialty || 'General'})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Día de la Semana *</label>
                <select
                  value={editingSchedule.day_of_week}
                  onChange={e => setEditingSchedule({ ...editingSchedule, day_of_week: parseInt(e.target.value, 10) })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:border-blue-500"
                  required
                >
                  {DAYS.map(d => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Hora Inicio *</label>
                  <input
                    type="time"
                    step="1800"
                    value={editingSchedule.start_time ? editingSchedule.start_time.slice(0, 5) : '08:00'}
                    onChange={e => setEditingSchedule({ ...editingSchedule, start_time: `${e.target.value}:00` })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:border-blue-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Hora Fin *</label>
                  <input
                    type="time"
                    step="1800"
                    value={editingSchedule.end_time ? editingSchedule.end_time.slice(0, 5) : '12:00'}
                    onChange={e => setEditingSchedule({ ...editingSchedule, end_time: `${e.target.value}:00` })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:border-blue-500"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Observaciones / Notas</label>
                <textarea
                  rows={2}
                  value={editingSchedule.notes || ''}
                  onChange={e => setEditingSchedule({ ...editingSchedule, notes: e.target.value })}
                  placeholder="Ej. Quincenal, estudios especiales..."
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsScheduleModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl shadow-xs disabled:opacity-50"
                >
                  {saving ? 'Guardando...' : 'Guardar Horario'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ==================== MODAL: CONSULTORIO ==================== */}
      {isRoomModalOpen && editingRoom && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-md overflow-hidden animate-scaleIn">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900">
                {editingRoom.id ? 'Editar Consultorio' : 'Nuevo Consultorio'}
              </h3>
              <button onClick={() => setIsRoomModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <span className="material-symbols-outlined text-lg">close</span>
              </button>
            </div>
            <form onSubmit={handleSaveRoom} className="p-6 space-y-4 max-h-[85vh] overflow-y-auto">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Nombre *</label>
                  <input
                    type="text"
                    placeholder="Ej. C6, NEURO 10"
                    value={editingRoom.name || ''}
                    onChange={e => setEditingRoom({ ...editingRoom, name: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:border-blue-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Sector *</label>
                  <input
                    type="text"
                    placeholder="Ej. Planta Principal"
                    value={editingRoom.sector || ''}
                    onChange={e => setEditingRoom({ ...editingRoom, sector: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:border-blue-500"
                    required
                  />
                </div>
              </div>

              {/* Tarifa Base por Hora (Visible para administración) */}
              <div className="bg-emerald-50/70 p-3 rounded-xl border border-emerald-200/80">
                <label className="block text-[11px] font-bold text-emerald-950 mb-1 flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-sm text-emerald-700">payments</span>
                  Tarifa Base por Hora ($ ARS / USD)
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-xs">$</span>
                  <input
                    type="number"
                    min="0"
                    step="500"
                    placeholder="Ej. 15000"
                    value={editingRoom.hourly_rate ?? ''}
                    onChange={e => setEditingRoom({ ...editingRoom, hourly_rate: e.target.value === '' ? 0 : Number(e.target.value) })}
                    className="w-full pl-7 pr-3 py-2 bg-white border border-emerald-200 rounded-lg text-xs font-bold text-emerald-900 focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <p className="text-[10px] text-emerald-700 mt-1">
                  Se computa automáticamente en el Dashboard Financiero por cada hora de turno asignado.
                </p>
              </div>

              {/* Equipamiento y Accesorios del Consultorio */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center justify-between">
                  <span>Equipamiento / Accesorios Disponibles</span>
                  <span className="text-[10px] font-normal text-slate-400">
                    {(editingRoom.equipment || []).length} seleccionados
                  </span>
                </label>
                
                {/* Lista de tags / checkboxes disponibles */}
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 max-h-40 overflow-y-auto space-y-1.5">
                  {equipmentCatalog.map(eq => {
                    const currentList = editingRoom.equipment || [];
                    const isChecked = currentList.includes(eq.name);

                    return (
                      <label
                        key={eq.id}
                        className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs cursor-pointer select-none transition-all ${
                          isChecked
                            ? 'bg-blue-50 text-blue-800 font-semibold border border-blue-200'
                            : 'hover:bg-white text-slate-700'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={e => {
                            if (e.target.checked) {
                              setEditingRoom({
                                ...editingRoom,
                                equipment: [...currentList, eq.name]
                              });
                            } else {
                              setEditingRoom({
                                ...editingRoom,
                                equipment: currentList.filter(item => item !== eq.name)
                              });
                            }
                          }}
                          className="rounded text-blue-600 focus:ring-blue-500 w-3.5 h-3.5"
                        />
                        <span className="material-symbols-outlined text-sm text-slate-400">
                          {eq.icon || 'devices'}
                        </span>
                        <span>{eq.name}</span>
                      </label>
                    );
                  })}
                </div>

                {/* Formulario rápido para crear nuevo accesorio/equipamiento */}
                <div className="mt-2 flex items-center gap-1.5">
                  <input
                    type="text"
                    placeholder="Crear otro equipamiento (ej. Densitómetro)..."
                    value={newEquipmentInput}
                    onChange={e => setNewEquipmentInput(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddEquipmentCatalogItem();
                      }
                    }}
                    className="flex-1 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 focus:outline-none focus:border-blue-500"
                  />
                  <button
                    type="button"
                    onClick={handleAddEquipmentCatalogItem}
                    className="px-3 py-1.5 bg-slate-200 hover:bg-blue-600 hover:text-white text-slate-700 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1 shrink-0"
                  >
                    <span className="material-symbols-outlined text-sm">add</span>
                    Agregar
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Color Identificador</label>
                <input
                  type="color"
                  value={editingRoom.color || '#3B82F6'}
                  onChange={e => setEditingRoom({ ...editingRoom, color: e.target.value })}
                  className="w-full h-9 p-1 bg-slate-50 border border-slate-200 rounded-xl cursor-pointer"
                />
              </div>

              <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsRoomModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl shadow-xs disabled:opacity-50"
                >
                  {saving ? 'Guardando...' : 'Guardar Consultorio'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ==================== MODAL: REGISTRAR NOVEDAD / EXCEPCIÓN ==================== */}
      {isExceptionModalOpen && editingException && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-md overflow-hidden animate-scaleIn">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-amber-600">event_busy</span>
                <h3 className="text-sm font-bold text-slate-900">
                  {editingException.id ? 'Editar Novedad de Calendario' : 'Registrar Vacaciones / Novedad'}
                </h3>
              </div>
              <button
                onClick={() => setIsExceptionModalOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <span className="material-symbols-outlined text-lg">close</span>
              </button>
            </div>

            <form onSubmit={handleSaveException} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Tipo de Novedad *</label>
                <select
                  value={editingException.exception_type || 'vacaciones'}
                  onChange={e => setEditingException({ ...editingException, exception_type: e.target.value as any })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:border-amber-500 cursor-pointer"
                  required
                >
                  <option value="vacaciones">🏖️ Vacaciones / Receso</option>
                  <option value="licencia">🏥 Licencia Médica / Personal</option>
                  <option value="reemplazo">🔄 Reemplazo / Médico Suplente</option>
                  <option value="horario_especial">⏰ Atención Extraordinaria / Horario Especial</option>
                  <option value="bloqueo_consultorio">🚫 Consultorio Fuera de Servicio / Mantenimiento</option>
                  <option value="otro">📌 Otra novedad</option>
                </select>
              </div>

              {/* Profesional afectado */}
              {editingException.exception_type !== 'bloqueo_consultorio' && (
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Profesional Titular {editingException.exception_type === 'horario_especial' ? '*' : '(Ausente)'}
                  </label>
                  <select
                    value={editingException.professional_id || ''}
                    onChange={e => setEditingException({ ...editingException, professional_id: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:border-amber-500 cursor-pointer"
                    required={editingException.exception_type !== 'bloqueo_consultorio'}
                  >
                    <option value="">-- Seleccionar profesional --</option>
                    {professionals.filter(p => p.active).map(p => (
                      <option key={p.id} value={p.id}>
                        {p.full_name} ({p.specialty || 'General'})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Médico suplente si es reemplazo */}
              {editingException.exception_type === 'reemplazo' && (
                <div className="bg-emerald-50/60 p-3 rounded-xl border border-emerald-100">
                  <label className="block text-[11px] font-bold text-emerald-900 mb-1 flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-sm">person_pin</span>
                    Profesional Suplente que Atenderá *
                  </label>
                  <select
                    value={editingException.substitute_professional_id || ''}
                    onChange={e => setEditingException({ ...editingException, substitute_professional_id: e.target.value || null })}
                    className="w-full px-2.5 py-1.5 bg-white border border-emerald-200 rounded-lg text-xs font-medium text-slate-800 focus:outline-none focus:border-emerald-500 cursor-pointer"
                    required
                  >
                    <option value="">-- Seleccionar suplente --</option>
                    {professionals.filter(p => p.active && p.id !== editingException.professional_id).map(p => (
                      <option key={p.id} value={p.id}>
                        {p.full_name} ({p.specialty || 'General'})
                      </option>
                    ))}
                  </select>
                  <p className="text-[10px] text-emerald-700 mt-1">
                    El consultorio mostrará la cobertura del suplente en esta fecha.
                  </p>
                </div>
              )}

              {/* Consultorio (opcional o requerido según caso) */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Consultorio Específico {editingException.exception_type === 'bloqueo_consultorio' ? '*' : '(Opcional / Todos sus consultorios)'}
                </label>
                <select
                  value={editingException.consulting_room_id || ''}
                  onChange={e => setEditingException({ ...editingException, consulting_room_id: e.target.value || null })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:border-amber-500 cursor-pointer"
                  required={editingException.exception_type === 'bloqueo_consultorio'}
                >
                  <option value="">-- Aplica a todos sus consultorios asignados --</option>
                  {rooms.filter(r => r.active).map(r => (
                    <option key={r.id} value={r.id}>{r.name} ({r.sector})</option>
                  ))}
                </select>
              </div>

              {/* Rango de Fechas */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Fecha Desde *</label>
                  <input
                    type="date"
                    value={editingException.start_date || selectedCalendarDateStr}
                    onChange={e => {
                      const s = e.target.value;
                      setEditingException({
                        ...editingException,
                        start_date: s,
                        end_date: (editingException.end_date && editingException.end_date < s) ? s : editingException.end_date
                      });
                    }}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:border-amber-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Fecha Hasta *</label>
                  <input
                    type="date"
                    value={editingException.end_date || selectedCalendarDateStr}
                    min={editingException.start_date}
                    onChange={e => setEditingException({ ...editingException, end_date: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:border-amber-500"
                    required
                  />
                </div>
              </div>

              {/* Horario acotado opcional */}
              <div className="bg-slate-50/80 p-3 rounded-xl border border-slate-200/60">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-bold text-slate-700">Franja Horaria Específica (Opcional)</span>
                  <span className="text-[10px] text-slate-400">Si se deja vacío aplica a todo el día</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <input
                      type="time"
                      value={editingException.start_time ? editingException.start_time.slice(0, 5) : ''}
                      onChange={e => setEditingException({ ...editingException, start_time: e.target.value ? `${e.target.value}:00` : null })}
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs"
                      placeholder="Inicio"
                    />
                  </div>
                  <div>
                    <input
                      type="time"
                      value={editingException.end_time ? editingException.end_time.slice(0, 5) : ''}
                      onChange={e => setEditingException({ ...editingException, end_time: e.target.value ? `${e.target.value}:00` : null })}
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs"
                      placeholder="Fin"
                    />
                  </div>
                </div>
              </div>

              {/* Motivo / Razón */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Motivo / Notas</label>
                <textarea
                  rows={2}
                  value={editingException.reason || ''}
                  onChange={e => setEditingException({ ...editingException, reason: e.target.value })}
                  placeholder="Ej. Congreso anual AAOT, reposo médico certificado, obras en el consultorio..."
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="pt-2 flex items-center justify-between gap-2 border-t border-slate-100">
                {editingException.id ? (
                  <button
                    type="button"
                    onClick={() => {
                      if (editingException.id) {
                        handleDeleteException(editingException.id);
                        setIsExceptionModalOpen(false);
                      }
                    }}
                    className="px-3 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-50 rounded-xl"
                  >
                    Eliminar Novedad
                  </button>
                ) : <div />}

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsExceptionModalOpen(false)}
                    className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold rounded-xl shadow-xs disabled:opacity-50"
                  >
                    {saving ? 'Guardando...' : 'Guardar Novedad'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
      {isProfModalOpen && editingProf && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-sm overflow-hidden animate-scaleIn">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900">
                {editingProf.id ? 'Editar Profesional' : 'Nuevo Profesional'}
              </h3>
              <button onClick={() => setIsProfModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <span className="material-symbols-outlined text-lg">close</span>
              </button>
            </div>
            <form onSubmit={handleSaveProf} className="p-6 space-y-4">
              {/* Selector de Vinculación con Médico de la BD */}
              <div className="bg-blue-50/60 p-3 rounded-xl border border-blue-100">
                <label className="block text-[11px] font-bold text-blue-900 mb-1 flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-sm">link</span>
                  Vincular con Médico del Sistema (Opcional)
                </label>
                <select
                  value={editingProf.doctor_id || ''}
                  onChange={e => {
                    const docId = e.target.value;
                    if (!docId) {
                      setEditingProf({ ...editingProf, doctor_id: null });
                      return;
                    }
                    const doc = systemDoctors.find(d => d.id === docId);
                    setEditingProf({
                      ...editingProf,
                      doctor_id: docId,
                      // Si no tenía nombre o se desea autocompletar:
                      full_name: editingProf.full_name ? editingProf.full_name : (doc?.full_name || ''),
                      specialty: editingProf.specialty && editingProf.specialty !== 'General' ? editingProf.specialty : (doc?.specialty || 'General'),
                      license_number: editingProf.license_number ? editingProf.license_number : (doc?.license_number || '')
                    });
                  }}
                  className="w-full px-2.5 py-1.5 bg-white border border-blue-200 rounded-lg text-xs text-slate-800 focus:outline-none focus:border-blue-500"
                >
                  <option value="">-- Sin vincular a médico (Registro manual) --</option>
                  {systemDoctors.map(d => (
                    <option key={d.id} value={d.id}>
                      {d.full_name} {d.specialty ? `(${d.specialty})` : ''}
                    </option>
                  ))}
                </select>
                <p className="text-[10px] text-blue-600/80 mt-1">
                  Al elegir un médico, se autocompletan los datos y queda conectado con el registro quirúrgico.
                </p>
              </div>

              {/* Selector de Vinculación con Usuario de la BD */}
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200/80">
                <label className="block text-[11px] font-bold text-slate-700 mb-1 flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-sm">account_circle</span>
                  Vincular con Usuario / Login del Sistema (Opcional)
                </label>
                <select
                  value={editingProf.user_id || ''}
                  onChange={e => setEditingProf({ ...editingProf, user_id: e.target.value || null })}
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-800 focus:outline-none focus:border-blue-500"
                >
                  <option value="">-- Sin vincular a usuario --</option>
                  {systemUsers.map(u => (
                    <option key={u.id} value={u.id}>
                      {u.name} ({u.role || 'Usuario'}) {u.email ? `· ${u.email}` : ''}
                    </option>
                  ))}
                </select>
                <p className="text-[10px] text-slate-400 mt-1">
                  Permite asociar su cuenta activa para futuras vistas personalizadas.
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Nombre y Apellido *</label>
                <input
                  type="text"
                  placeholder="Ej. Dr. Juan Pérez"
                  value={editingProf.full_name || ''}
                  onChange={e => setEditingProf({ ...editingProf, full_name: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:border-blue-500"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Especialidad</label>
                <input
                  type="text"
                  placeholder="Ej. Traumatólogo, Neurólogo..."
                  value={editingProf.specialty || ''}
                  onChange={e => setEditingProf({ ...editingProf, specialty: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Matrícula</label>
                <input
                  type="text"
                  placeholder="Ej. 12345"
                  value={editingProf.license_number || ''}
                  onChange={e => setEditingProf({ ...editingProf, license_number: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Color Agenda</label>
                <input
                  type="color"
                  value={editingProf.color || '#10B981'}
                  onChange={e => setEditingProf({ ...editingProf, color: e.target.value })}
                  className="w-full h-9 p-1 bg-slate-50 border border-slate-200 rounded-xl cursor-pointer"
                />
              </div>

              {/* Tarifa Personalizada por Hora (Opcional - Reemplaza la del consultorio) */}
              <div className="bg-blue-50/60 p-3 rounded-xl border border-blue-200/80">
                <label className="block text-[11px] font-bold text-blue-950 mb-1 flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-sm text-blue-700">monetization_on</span>
                  Tarifa Especial / Hora del Profesional ($ ARS / USD)
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-xs">$</span>
                  <input
                    type="number"
                    min="0"
                    step="500"
                    placeholder="Opcional: Dejar vacío para usar la tarifa del consultorio"
                    value={editingProf.custom_hourly_rate ?? ''}
                    onChange={e => setEditingProf({
                      ...editingProf,
                      custom_hourly_rate: e.target.value === '' ? null : Number(e.target.value)
                    })}
                    className="w-full pl-7 pr-3 py-2 bg-white border border-blue-200 rounded-lg text-xs font-bold text-blue-900 focus:outline-none focus:border-blue-500"
                  />
                </div>
                <p className="text-[10px] text-blue-600/80 mt-1">
                  Si se define, tiene prioridad sobre la tarifa base del consultorio en el Dashboard Financiero.
                </p>
              </div>
              <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsProfModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-xl shadow-xs disabled:opacity-50"
                >
                  {saving ? 'Guardando...' : 'Guardar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default ConsultingRoomsPage;
