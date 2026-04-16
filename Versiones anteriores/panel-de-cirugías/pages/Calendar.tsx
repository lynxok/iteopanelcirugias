import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';

// --- Types & Helpers ---
type ViewMode = 'month' | 'week' | 'day';

interface CalendarEvent {
  id: string;
  title: string;
  start: Date;
  end: Date; // For hour calculation
  color: string;
  icon?: string;
  completed?: boolean;
}

interface PendingSurgery {
    id: string;
    name: string;
    proc: string;
    doctor: string;
    duration: number; // minutes
    color: string;
}

// Mock Data matching "Ready for Surgery - No Date" column from Kanban
const PENDING_SURGERIES: PendingSurgery[] = [
      { id: '11.223.344', name: 'Carlos Ruiz', proc: 'Apendicectomía', doctor: 'Dr. Garcia', duration: 60, color: 'bg-blue-500' },
      { id: '99.888.777', name: 'Elena Vazquez', proc: 'Reparación LCA', doctor: 'Dra. Lopez', duration: 120, color: 'bg-blue-500' },
      { id: '87.654.321', name: 'Luis Torres', proc: 'Chequeo General', doctor: 'Dr. Fernandez', duration: 30, color: 'bg-blue-500' },
];

// Mock Data Generator relative to "Today" to ensure data visibility
const generateMockEvents = (baseDate: Date): CalendarEvent[] => {
  const y = baseDate.getFullYear();
  const m = baseDate.getMonth();
  const d = baseDate.getDate();

  return [
    { id: '101', title: 'Cataratas', start: new Date(y, m, 2, 8, 0), end: new Date(y, m, 2, 9, 30), color: 'bg-slate-500' },
    { id: '102', title: 'Rodilla', start: new Date(y, m, 2, 11, 30), end: new Date(y, m, 2, 13, 0), color: 'bg-slate-500' },
    { id: '103', title: 'Apéndice', start: new Date(y, m, 5, 8, 30), end: new Date(y, m, 5, 10, 0), color: 'bg-emerald-500', icon: 'check_circle', completed: true },
    { id: '104', title: 'Rinoplastia', start: new Date(y, m, 5, 14, 0), end: new Date(y, m, 5, 16, 0), color: 'bg-emerald-500' },
    { id: '105', title: 'Consulta', start: new Date(y, m, 5, 16, 0), end: new Date(y, m, 5, 16, 30), color: 'bg-primary/70' },
    { id: '106', title: 'LCA', start: new Date(y, m, 9, 13, 0), end: new Date(y, m, 9, 15, 0), color: 'bg-primary' },
    { id: '107', title: 'Bypass', start: new Date(y, m, 11, 7, 0), end: new Date(y, m, 11, 11, 0), color: 'bg-primary' },
    { id: '108', title: 'Stent', start: new Date(y, m, 11, 10, 0), end: new Date(y, m, 11, 11, 30), color: 'bg-primary' },
    { id: '109', title: 'Valvula', start: new Date(y, m, 11, 14, 0), end: new Date(y, m, 11, 17, 0), color: 'bg-primary' },
    { id: '110', title: 'Tunel C.', start: new Date(y, m, 23, 9, 30), end: new Date(y, m, 23, 11, 0), color: 'bg-primary' },
    // Events for "Current Day" testing (assuming user lands on initial state)
    { id: '111', title: 'Urgencia', start: new Date(y, m, d, 9, 0), end: new Date(y, m, d, 10, 30), color: 'bg-red-500' },
    { id: '112', title: 'Revisión', start: new Date(y, m, d, 15, 0), end: new Date(y, m, d, 15, 30), color: 'bg-blue-500' },
  ];
};

const Calendar: React.FC = () => {
  const navigate = useNavigate();
  // State
  const [currentDate, setCurrentDate] = useState(new Date()); // Default to actual today
  const [view, setView] = useState<ViewMode>('month');
  
  // Data State
  const [events, setEvents] = useState<CalendarEvent[]>(() => generateMockEvents(new Date()));
  const [pendingSurgeries, setPendingSurgeries] = useState<PendingSurgery[]>(PENDING_SURGERIES);

  // Modal State
  const [showModal, setShowModal] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<{ date: Date, hour?: number } | null>(null);

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

  // -- Modal & Scheduling Logic --
  const openScheduleModal = (date: Date, hour?: number) => {
      setSelectedSlot({ date, hour });
      setShowModal(true);
  };

  const handleSchedulePending = (surgery: PendingSurgery) => {
      if (!selectedSlot) return;

      const start = new Date(selectedSlot.date);
      // If hour provided, set it, otherwise default to 08:00
      start.setHours(selectedSlot.hour || 8, 0, 0, 0);
      
      const end = new Date(start);
      end.setMinutes(start.getMinutes() + surgery.duration);

      const newEvent: CalendarEvent = {
          id: `evt-${Date.now()}`,
          title: surgery.proc, // Using procedure as title for calendar
          start,
          end,
          color: surgery.color
      };

      setEvents([...events, newEvent]);
      setPendingSurgeries(prev => prev.filter(p => p.id !== surgery.id)); // Remove from pending list
      setShowModal(false);
  };

  // -- Formatting Helpers --
  const getHeaderTitle = () => {
    const options: Intl.DateTimeFormatOptions = { month: 'long', year: 'numeric' };
    if (view === 'day') options.day = 'numeric';
    return new Intl.DateTimeFormat('es-ES', options).format(currentDate);
  };

  const isSameDate = (d1: Date, d2: Date) => 
    d1.getDate() === d2.getDate() && 
    d1.getMonth() === d2.getMonth() && 
    d1.getFullYear() === d2.getFullYear();

  // Helper to check if a date is today or in the future
  const isFutureOrToday = (date: Date) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const target = new Date(date);
    target.setHours(0, 0, 0, 0);
    return target >= today;
  };

  // -- Views Components --

  // 1. Month View
  const MonthView = () => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    
    const firstDayOfMonth = new Date(year, month, 1).getDay(); // 0 = Sun
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    
    // Padding for start of month
    const paddingDays = Array.from({ length: firstDayOfMonth }, (_, i) => i);
    const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);

    const weekDays = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

    return (
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 h-full flex flex-col min-h-[600px]">
        <div className="grid grid-cols-7 border-b border-slate-200">
          {weekDays.map((d) => (
            <div key={d} className="py-3 text-center text-sm font-semibold text-slate-500 uppercase tracking-wider">
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 grid-rows-5 flex-1">
          {paddingDays.map(i => (
             <div key={`pad-${i}`} className="border-b border-r border-slate-100 p-2 bg-slate-50/50"></div>
          ))}
          {days.map((d) => {
             const dayDate = new Date(year, month, d);
             const isToday = isSameDate(dayDate, new Date());
             const dayEvents = events.filter(e => isSameDate(e.start, dayDate));
             const canAdd = isFutureOrToday(dayDate);

             return (
              <div key={d} className="border-b border-r border-slate-100 p-2 hover:bg-slate-50 transition-colors relative group/cell min-h-[100px]">
                <div className="flex justify-between items-start">
                  <span className={`text-sm font-bold ${isToday ? 'flex size-7 items-center justify-center rounded-full bg-primary text-white shadow-md' : 'text-slate-900'}`}>
                    {d}
                  </span>
                  {isToday && <span className="text-[10px] font-bold text-primary uppercase mr-1">Hoy</span>}
                </div>
                <div className="mt-2 flex flex-col gap-1">
                    {dayEvents.map(ev => (
                         <button 
                            key={ev.id}
                            onClick={(e) => { e.stopPropagation(); navigate(`/detail/${ev.id}`); }}
                            className={`w-full text-left ${ev.color} text-white px-2 py-1 rounded text-xs font-medium truncate shadow-sm flex items-center justify-between hover:opacity-90 transition-opacity`}
                        >
                            <span>
                                {ev.start.getHours().toString().padStart(2,'0')}:{ev.start.getMinutes().toString().padStart(2,'0')} • {ev.title}
                            </span>
                            {ev.icon && <span className="material-symbols-outlined text-[10px]">{ev.icon}</span>}
                        </button>
                    ))}
                </div>
                 {/* Hover Add Button - Only for Future/Today */}
                 {canAdd && (
                    <button 
                        onClick={(e) => { e.stopPropagation(); openScheduleModal(dayDate); }}
                        className="absolute top-2 right-2 opacity-0 group-hover/cell:opacity-100 p-1 text-primary hover:bg-blue-50 rounded transition-opacity"
                        title="Agendar Cirugía"
                    >
                        <span className="material-symbols-outlined text-[16px]">add</span>
                    </button>
                 )}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  // 2. Week View
  const WeekView = () => {
    // Calculate start of week (Sunday)
    const startOfWeek = new Date(currentDate);
    const day = currentDate.getDay();
    const diff = currentDate.getDate() - day; // adjust when day is sunday
    startOfWeek.setDate(diff);

    const weekDates = Array.from({ length: 7 }, (_, i) => {
        const d = new Date(startOfWeek);
        d.setDate(d.getDate() + i);
        return d;
    });

    const hours = Array.from({ length: 13 }, (_, i) => i + 7); // 07:00 to 19:00

    return (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 h-full flex flex-col overflow-hidden">
            {/* Header */}
            <div className="grid grid-cols-8 border-b border-slate-200 divide-x divide-slate-100 bg-slate-50">
                <div className="p-3 text-center text-xs font-bold text-slate-400 uppercase pt-4">Hora</div>
                {weekDates.map((date, i) => {
                    const isToday = isSameDate(date, new Date());
                    return (
                        <div key={i} className={`p-3 text-center ${isToday ? 'bg-primary/5' : ''}`}>
                            <div className={`text-xs font-semibold uppercase ${isToday ? 'text-primary' : 'text-slate-500'}`}>
                                {date.toLocaleDateString('es-ES', { weekday: 'short' })}
                            </div>
                            <div className={`text-lg font-bold ${isToday ? 'text-primary' : 'text-slate-900'}`}>
                                {date.getDate()}
                            </div>
                        </div>
                    );
                })}
            </div>
            {/* Grid */}
            <div className="flex-1 overflow-y-auto">
                 <div className="grid grid-cols-8 divide-x divide-slate-100">
                    {/* Time Column */}
                    <div className="bg-slate-50/50">
                        {hours.map(h => (
                            <div key={h} className="h-20 border-b border-slate-100 text-right pr-2 pt-2 text-xs text-slate-400 font-medium relative">
                                {h}:00
                            </div>
                        ))}
                    </div>
                    {/* Days Columns */}
                    {weekDates.map((date, i) => {
                         const canAdd = isFutureOrToday(date);
                         return (
                             <div key={i} className="relative group/col">
                                 {/* Click to add helper (full height overlay or per cell) - Per cell implemented below */}
                                {hours.map(h => (
                                    <div 
                                        key={h} 
                                        onClick={() => canAdd && openScheduleModal(date, h)}
                                        className={`h-20 border-b border-slate-100 relative group/cell ${canAdd ? 'hover:bg-slate-50/80 cursor-pointer' : ''}`}
                                    >
                                        {canAdd && (
                                            <span className="absolute inset-0 flex items-center justify-center opacity-0 group-hover/cell:opacity-100 text-slate-300">
                                                <span className="material-symbols-outlined text-sm">add</span>
                                            </span>
                                        )}
                                    </div>
                                ))}
                                {/* Render Events for this day */}
                                {events
                                    .filter(e => isSameDate(e.start, date))
                                    .map(ev => {
                                        const startHour = ev.start.getHours();
                                        const startMin = ev.start.getMinutes();
                                        const durationMin = (ev.end.getTime() - ev.start.getTime()) / (1000 * 60);
                                        
                                        // Calculate relative position (7:00 AM start = index 0)
                                        const topOffset = ((startHour - 7) * 80) + ((startMin / 60) * 80); // 80px per hour
                                        const height = (durationMin / 60) * 80;

                                        if (startHour < 7 || startHour > 19) return null; // Simple bounds check

                                        return (
                                            <button 
                                                key={ev.id}
                                                onClick={(e) => { e.stopPropagation(); navigate(`/detail/${ev.id}`); }}
                                                style={{ top: `${topOffset}px`, height: `${height}px` }}
                                                className={`absolute left-1 right-1 rounded px-2 py-1 text-xs font-bold text-white shadow-sm z-10 flex flex-col justify-start items-start overflow-hidden hover:brightness-110 transition-all ${ev.color}`}
                                            >
                                                <span className="truncate w-full text-left">{ev.title}</span>
                                                <span className="opacity-80 text-[10px]">{startHour}:{startMin.toString().padStart(2,'0')}</span>
                                            </button>
                                        );
                                    })
                                }
                             </div>
                         );
                    })}
                 </div>
            </div>
        </div>
    );
  };

  // 3. Day View
  const DayView = () => {
    const hours = Array.from({ length: 13 }, (_, i) => i + 7); // 07:00 to 19:00
    const canAdd = isFutureOrToday(currentDate);

    return (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 h-full flex flex-col overflow-hidden max-w-4xl mx-auto w-full">
            <div className="border-b border-slate-200 p-4 bg-slate-50 flex justify-center">
                 <div className="text-center">
                    <div className="text-sm font-semibold uppercase text-primary">
                        {currentDate.toLocaleDateString('es-ES', { weekday: 'long' })}
                    </div>
                    <div className="text-3xl font-black text-slate-900">
                        {currentDate.getDate()}
                    </div>
                 </div>
            </div>
             <div className="flex-1 overflow-y-auto">
                 <div className="grid grid-cols-[80px_1fr] divide-x divide-slate-100">
                     <div className="bg-slate-50/50">
                        {hours.map(h => (
                            <div key={h} className="h-24 border-b border-slate-100 text-right pr-4 pt-2 text-sm text-slate-400 font-bold">
                                {h}:00
                            </div>
                        ))}
                    </div>
                    <div className="relative bg-white">
                        {hours.map(h => (
                            <div key={h} className="h-24 border-b border-slate-100 flex flex-col justify-center px-4 hover:bg-slate-50 transition-colors group">
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
                         {/* Render Events */}
                            {events
                                .filter(e => isSameDate(e.start, currentDate))
                                .map(ev => {
                                    const startHour = ev.start.getHours();
                                    const startMin = ev.start.getMinutes();
                                    const durationMin = (ev.end.getTime() - ev.start.getTime()) / (1000 * 60);
                                    
                                    // 96px per hour (h-24 = 6rem = 96px)
                                    const pxPerHour = 96;
                                    const topOffset = ((startHour - 7) * pxPerHour) + ((startMin / 60) * pxPerHour); 
                                    const height = (durationMin / 60) * pxPerHour;

                                    if (startHour < 7 || startHour > 19) return null;

                                    return (
                                        <button 
                                            key={ev.id}
                                            onClick={(e) => { e.stopPropagation(); navigate(`/detail/${ev.id}`); }}
                                            style={{ top: `${topOffset}px`, height: `${height}px` }}
                                            className={`absolute left-2 right-4 rounded-lg px-4 py-2 text-sm font-medium text-white shadow-md z-10 flex items-center justify-between hover:scale-[1.01] transition-all border-l-4 border-black/20 ${ev.color}`}
                                        >
                                            <div className="flex flex-col items-start">
                                                <span className="font-bold text-lg">{ev.title}</span>
                                                <span className="opacity-90">{startHour}:{startMin.toString().padStart(2,'0')} - {ev.end.getHours()}:{ev.end.getMinutes().toString().padStart(2,'0')}</span>
                                            </div>
                                            {ev.icon && <span className="material-symbols-outlined text-2xl bg-white/20 p-1 rounded-full">{ev.icon}</span>}
                                        </button>
                                    );
                                })
                            }
                    </div>
                 </div>
             </div>
        </div>
    );
  };

  return (
    <div className="flex-1 flex flex-col min-w-0 bg-background overflow-hidden h-full relative">
      {/* Calendar Header */}
      <div className="px-6 py-4 flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 bg-white sticky top-0 z-10">
        <div className="flex items-center gap-4">
          <h1 className="text-slate-900 text-2xl font-black leading-tight tracking-tight capitalize min-w-[200px]">
            {getHeaderTitle()}
          </h1>
          <div className="flex items-center rounded-lg bg-slate-100 p-0.5">
            <button 
                onClick={handlePrev}
                className="p-1 hover:bg-white rounded-md shadow-sm transition-all text-slate-900"
            >
              <span className="material-symbols-outlined text-[20px]">chevron_left</span>
            </button>
            <button 
                onClick={handleNext}
                className="p-1 hover:bg-white rounded-md shadow-sm transition-all text-slate-900"
            >
              <span className="material-symbols-outlined text-[20px]">chevron_right</span>
            </button>
          </div>
          <button 
            onClick={handleToday}
            className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-sm font-bold text-slate-900 hover:bg-slate-50 transition-colors"
          >
            Hoy
          </button>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex h-9 items-center rounded-lg bg-slate-100 p-1">
            <button 
                onClick={() => setView('month')}
                className={`flex items-center justify-center px-3 py-1 rounded-md text-xs font-bold transition-all ${view === 'month' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-900'}`}
            >
                Mes
            </button>
            <button 
                onClick={() => setView('week')}
                className={`flex items-center justify-center px-3 py-1 rounded-md text-xs font-bold transition-all ${view === 'week' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-900'}`}
            >
                Semana
            </button>
            <button 
                onClick={() => setView('day')}
                className={`flex items-center justify-center px-3 py-1 rounded-md text-xs font-bold transition-all ${view === 'day' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-900'}`}
            >
                Día
            </button>
          </div>
          <div className="w-px h-6 bg-slate-200 mx-1"></div>
          <button className="p-2 text-slate-500 hover:text-slate-900 transition-colors">
            <span className="material-symbols-outlined text-[20px]">filter_list</span>
          </button>
          <button className="p-2 text-slate-500 hover:text-slate-900 transition-colors">
            <span className="material-symbols-outlined text-[20px]">print</span>
          </button>
        </div>
      </div>

      {/* Calendar Grid Container */}
      <div className="flex-1 overflow-y-auto p-6">
          {view === 'month' && <MonthView />}
          {view === 'week' && <WeekView />}
          {view === 'day' && <DayView />}
      </div>

      {/* SCHEDULING MODAL */}
      {showModal && selectedSlot && (
         <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4 animate-fadeIn">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg flex flex-col max-h-[90vh]">
                <div className="p-5 border-b border-slate-200 bg-slate-50 rounded-t-xl flex justify-between items-center">
                    <div>
                        <h3 className="text-lg font-bold text-slate-900">Agendar Cirugía</h3>
                        <p className="text-xs text-slate-500 font-medium">
                            {selectedSlot.date.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })}
                            {selectedSlot.hour !== undefined ? ` • ${selectedSlot.hour}:00 hs` : ''}
                        </p>
                    </div>
                    <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600">
                        <span className="material-symbols-outlined">close</span>
                    </button>
                </div>
                
                <div className="flex-1 overflow-y-auto p-6">
                    {/* Option A: Pending from Kanban */}
                    <div className="mb-6">
                        <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                             <span className="material-symbols-outlined text-sm">view_kanban</span>
                             Listo para Cirugía (Planificación)
                        </h4>
                        
                        <div className="space-y-3">
                            {pendingSurgeries.map(surgery => (
                                <div 
                                    key={surgery.id} 
                                    onClick={() => handleSchedulePending(surgery)}
                                    className="group cursor-pointer bg-white border border-slate-200 hover:border-primary/50 hover:shadow-md rounded-lg p-3 transition-all flex items-center justify-between"
                                >
                                    <div className="flex items-center gap-3">
                                        <div className={`size-8 rounded-full ${surgery.color} bg-opacity-10 text-blue-600 flex items-center justify-center`}>
                                            <span className="material-symbols-outlined text-lg">person</span>
                                        </div>
                                        <div>
                                            <p className="font-bold text-slate-900 text-sm group-hover:text-primary transition-colors">{surgery.name}</p>
                                            <p className="text-xs text-slate-500">{surgery.proc} • {surgery.duration} min</p>
                                        </div>
                                    </div>
                                    <button className="text-slate-400 group-hover:text-primary">
                                        <span className="material-symbols-outlined">event_available</span>
                                    </button>
                                </div>
                            ))}
                            
                            {pendingSurgeries.length === 0 && (
                                <div className="text-center py-4 border-2 border-dashed border-slate-100 rounded-lg">
                                    <p className="text-xs text-slate-400 italic">No hay pacientes en espera en la columna "Listo para Cirugía"</p>
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="relative flex py-2 items-center">
                        <div className="flex-grow border-t border-slate-200"></div>
                        <span className="flex-shrink-0 mx-4 text-slate-400 text-xs">O</span>
                        <div className="flex-grow border-t border-slate-200"></div>
                    </div>

                    {/* Option B: New Surgery */}
                    <div className="mt-4">
                        <button 
                            onClick={() => navigate('/detail/new')}
                            className="w-full py-3 border-2 border-dashed border-slate-200 text-slate-500 rounded-lg hover:border-primary hover:text-primary hover:bg-slate-50 transition-all font-bold text-sm flex items-center justify-center gap-2"
                        >
                            <span className="material-symbols-outlined">add_circle</span>
                            Crear Nueva Solicitud
                        </button>
                    </div>
                </div>
            </div>
        </div>
      )}
    </div>
  );
};

export default Calendar;