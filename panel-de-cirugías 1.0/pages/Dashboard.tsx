import React, { useState, useEffect } from 'react';
import { SurgeryStatus, OrthoStatus } from '../types';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '../src/lib/supabase';
import { useAuth } from '../src/lib/AuthContext';
import ProgressBar from '../components/ProgressBar';

const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [surgeries, setSurgeries] = useState<any[]>([]);
  const [stats, setStats] = useState([
    { title: 'Pendientes Totales', value: '0', sub: 'Solicitudes requieren aprobación', icon: 'pending_actions', color: 'orange' },
    { title: 'Programadas Hoy', value: '0', sub: 'Pendientes de inicio', icon: 'event', color: 'blue' },
    { title: 'Completadas Hoy', value: '0', sub: 'Cirugías finalizadas', icon: 'check_circle', color: 'green' }
  ]);

  // Raw Data State (for client-side filtering)
  const [rawSurgeries, setRawSurgeries] = useState<any[]>([]);

  // Search & Filter State
  const [searchTerm, setSearchTerm] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterDate, setFilterDate] = useState<string>('');
  
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1,
        delayChildren: 0.1
      }
    }
  };

  const itemVariants = {
    hidden: { y: 20, opacity: 0 },
    visible: { 
      y: 0, 
      opacity: 1,
      transition: {
        type: 'spring' as const,
        stiffness: 100,
        damping: 12
      }
    }
  };

  useEffect(() => {
    fetchData();

    // Subscribe to changes
    const surgeriesSubscription = supabase
      .channel('dashboard-surgeries')
      .on('postgres_changes',
        { event: '*', schema: 'quirofano', table: 'surgeries' },
        () => fetchData()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(surgeriesSubscription);
    };
  }, [user]); // Re-fetch if user changes to ensure role filtering

  const fetchData = async () => {
    setLoading(true);
    try {
      const now = new Date();
      const year = now.getFullYear();
      const month = (now.getMonth() + 1).toString().padStart(2, '0');
      const day = now.getDate().toString().padStart(2, '0');
      const today = `${year}-${month}-${day}`;

      // Calculate the 5th day from today
      const fifthDayDate = new Date();
      fifthDayDate.setDate(now.getDate() + 4);
      const fY = fifthDayDate.getFullYear();
      const fM = (fifthDayDate.getMonth() + 1).toString().padStart(2, '0');
      const fD = fifthDayDate.getDate().toString().padStart(2, '0');
      const fifthDay = `${fY}-${fM}-${fD}`;

      // Fetch Surgeries for Table
      let query = supabase
        .from('surgeries')
        .select(`
                    id,
                    procedure_name,
                    surgery_date,
                    start_time,
                    status,
                    priority,
                    ortho_validated,
                    admission_validated,
                    or_validated,
                    estimated_duration,
                    actual_start_time,
                    patients (full_name, document_number),
                    doctors!surgeries_doctor_id_fkey (id, full_name, specialty)
                `);

      if (user?.role === 'Medico' && user.doctorId) {
        query = query.eq('doctor_id', user.doctorId);
      } else if (user?.role === 'Anestesista' && user.doctorId) {
        query = query.eq('anesthesiologist_id', user.doctorId);
      } else if (user?.role === 'Ortopedia' && user.vendorId) {
        query = query.eq('vendor_id', user.vendorId);
      } else if (user?.role === 'Oficina ART') {
        const { data: artCoverages } = await supabase
          .from('coverages')
          .select('name')
          .eq('type', 'ART');
        const artNames = artCoverages?.map(c => c.name) || [];
        if (artNames.length > 0) {
          query = query.in('medical_coverage', artNames);
        } else {
          query = query.eq('id', '00000000-0000-0000-0000-000000000000');
        }
      }

      const { data: surgeryData, error: surgeryError } = await query
        .gte('surgery_date', today)
        .lte('surgery_date', fifthDay)
        .order('surgery_date', { ascending: true })
        .order('start_time', { ascending: true });

      if (surgeryError) throw surgeryError;

      // 3. Status filter and processing
      const uniqueSurgeryData = Array.from(new Map((surgeryData || []).map((item: any) => [item.id, item])).values());
      const validSurgeryData = uniqueSurgeryData.filter(s => s.surgery_date >= today);

      const processedData = validSurgeryData.map((s: any) => {
        let finalStatus = s.status;

        // Visual Promotion for Pending (v1.1.11 Logic)
        if (finalStatus === 'pending_validation' || finalStatus === 'waiting_date' || finalStatus === 'scheduled') {
          if (s.ortho_validated && s.admission_validated) {
            if (s.or_validated && s.surgery_date) {
              finalStatus = 'scheduled';
            } else {
              finalStatus = 'waiting_date';
            }
          } else {
            finalStatus = 'pending_validation';
          }
        }
        return { ...s, status: finalStatus };
      });

      // Store Raw for filtering
      setRawSurgeries(processedData);

      // Fetch Stats
      const getCount = async (filters: any) => {
        let q = supabase.from('surgeries').select('*', { count: 'exact', head: true });
        if (user?.role === 'Medico' && user.doctorId) q = q.eq('doctor_id', user.doctorId);
        if (user?.role === 'Ortopedia' && user.vendorId) q = q.eq('vendor_id', user.vendorId);
        if (user?.role === 'Oficina ART') {
          const { data: artCoverages } = await supabase
            .from('coverages')
            .select('name')
            .eq('type', 'ART');
          const artNames = artCoverages?.map(c => c.name) || [];
          if (artNames.length > 0) {
            q = q.in('medical_coverage', artNames);
          } else {
            q = q.eq('id', '00000000-0000-0000-0000-000000000000');
          }
        }

        Object.entries(filters).forEach(([key, val]) => {
          if (key === 'ortho_validated' && val === false) {
            q = q.eq('requires_prosthesis', true).eq('ortho_validated', false);
          } else {
            q = q.eq(key, val);
          }
        });
        const { count, error } = await q;
        if (error) throw error;
        return count || 0;
      };

      const [pendingCount] = await Promise.all([
        getCount({ status: 'pending_validation' })
      ]);

      // Calculate Today's stats from loaded data
      const todaySurgeries = processedData.filter(s => s.surgery_date === today);
      const activeTodayCount = todaySurgeries.filter(s =>
        s.status === 'scheduled' ||
        s.status === 'in_progress' ||
        s.status === 'in_or' ||
        s.status === 'pending_validation' ||
        s.status === 'waiting_date' ||
        s.status === 'delayed'
      ).length;
      const completedTodayCount = todaySurgeries.filter(s => s.status === 'completed').length;

      setStats([
        { title: 'Pendientes Totales', value: pendingCount.toString(), sub: 'Solicitudes requieren aprobación', icon: 'pending_actions', color: 'orange' },
        { title: 'Programadas Hoy', value: activeTodayCount.toString(), sub: 'Cirugías para el día de hoy', icon: 'event', color: 'blue' },
        { title: 'Completadas Hoy', value: completedTodayCount.toString(), sub: 'Avance del día actual', icon: 'check_circle', color: 'green' }
      ]);

    } catch (err) {
      console.error('Error fetching dashboard data:', err);
    } finally {
      setLoading(false);
    }
  };

  // Process and Filter Data Effect
  useEffect(() => {
    let filteredList = [...rawSurgeries];

    if (filteredList.length > 0) {
      // Search Filter
      if (searchTerm) {
        const lower = searchTerm.toLowerCase();
        filteredList = filteredList.filter((s: any) =>
          s.patients?.full_name?.toLowerCase().includes(lower) ||
          s.procedure_name?.toLowerCase().includes(lower) ||
          s.patients?.document_number?.includes(searchTerm)
        );
      }

      // Status Filter
      if (filterStatus && filterStatus !== 'all') {
        filteredList = filteredList.filter((s: any) => s.status === filterStatus);
      }

      // Date Filter (Specific Day)
      if (filterDate) {
        filteredList = filteredList.filter((s: any) => s.surgery_date === filterDate);
      }
    }

    // Re-Group
    const newGrouped: Record<string, any[]> = {};

    filteredList.forEach((s: any) => {
      const date = s.surgery_date || 'TBD';
      if (!newGrouped[date]) newGrouped[date] = [];
      newGrouped[date].push({
        id: s.id,
        initials: s.patients?.full_name?.split(' ').map((n: any) => n[0]).join('').toUpperCase().substring(0, 2) || '??',
        name: s.patients?.full_name || 'Paciente Desconocido',
        doctor: s.doctors?.full_name || 'Médico Sin Asignar',
        specialty: s.doctors?.specialty || 'General',
        proc: s.procedure_name,
        status: mapToSurgeryStatus(s.status),
        ortho: mapToOrthoStatus(s),
        time: s.start_time?.substring(0, 5) || '--:--',
        date: s.surgery_date,
        color: s.priority === 'emergency' ? 'red' : s.priority === 'urgent' ? 'orange' : 'blue'
      });
    });

    setSurgeries(newGrouped as any);

  }, [rawSurgeries, searchTerm, filterStatus, filterDate]);

  const mapToSurgeryStatus = (status: string): SurgeryStatus => {
    switch (status) {
      case 'pending_validation': return SurgeryStatus.Pending;
      case 'scheduled': return SurgeryStatus.Scheduled;
      case 'in_or': return SurgeryStatus.InOR;
      case 'in_progress': return SurgeryStatus.InProgress;
      case 'delayed': return SurgeryStatus.Delayed;
      case 'completed': return SurgeryStatus.Completed;
      case 'cancelled': return SurgeryStatus.Cancelled;
      case 'suspended': return SurgeryStatus.Suspended;
      case 'waiting_date': return SurgeryStatus.WaitingDate;
      default: return SurgeryStatus.Pending;
    }
  };

  const mapToOrthoStatus = (surgery: any): OrthoStatus => {
    if (surgery.ortho_validated) return OrthoStatus.Completed;
    return OrthoStatus.ReviewNeeded;
  };

  const getStatusColor = (status: SurgeryStatus) => {
    switch (status) {
      case SurgeryStatus.InOR: return 'bg-purple-50 text-purple-700 ring-1 ring-inset ring-purple-700/10';
      case SurgeryStatus.InProgress: return 'bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-700/10';
      case SurgeryStatus.Delayed: return 'bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-600/20';
      case SurgeryStatus.Scheduled: return 'bg-slate-50 text-slate-700 ring-1 ring-inset ring-slate-600/20';
      case SurgeryStatus.Recovery: return 'bg-indigo-50 text-indigo-700 ring-1 ring-inset ring-indigo-700/10';
      case SurgeryStatus.Pending: return 'bg-orange-50 text-orange-700 ring-1 ring-inset ring-orange-600/20';
      case SurgeryStatus.WaitingDate: return 'bg-sky-50 text-sky-700 ring-1 ring-inset ring-sky-600/20';
      case SurgeryStatus.Completed: return 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-600/20';
      case SurgeryStatus.Cancelled:
      case SurgeryStatus.Suspended: return 'bg-red-50 text-red-700 ring-1 ring-inset ring-red-600/10';
      default: return 'bg-slate-50 text-slate-700 ring-1 ring-inset ring-slate-600/20';
    }
  };

  return (
    <motion.div 
      initial="hidden"
      animate="visible"
      variants={containerVariants}
      className="flex-1 h-full overflow-y-auto bg-background p-8"
    >
      <ProgressBar isLoading={loading} />
      <div className="max-w-[1600px] mx-auto flex flex-col gap-6">

        {/* Header */}
        <div className="flex flex-wrap justify-between items-center gap-4">
          <div className="flex flex-col gap-1">
            <h2 className="text-slate-900 text-2xl font-bold leading-tight">Centro de Coordinación</h2>
            <p className="text-slate-500 text-sm font-normal leading-normal">Resumen de operaciones quirúrgicas diarias</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="relative hidden sm:block">
              <span className="material-symbols-outlined absolute left-3 top-2.5 text-slate-400 text-xl">search</span>
              <input
                className="pl-10 pr-4 h-10 w-64 rounded-lg bg-white border border-slate-200 text-sm focus:ring-2 focus:ring-primary focus:outline-none placeholder-slate-400"
                placeholder="Buscar (Nombre, DNI, Procedimiento)..."
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            {user?.role !== 'Medico' && user?.role !== 'Tecnico' && user?.role !== 'Ortopedia' && (
              <button
                onClick={() => navigate('/detail/new')}
                className="flex items-center justify-center gap-2 cursor-pointer overflow-hidden rounded-lg h-10 px-4 bg-primary text-white hover:bg-primary-hover transition-colors shadow-sm"
              >
                <span className="material-symbols-outlined text-lg">add</span>
                <span className="text-sm font-bold whitespace-nowrap">Nueva Cirugía</span>
              </button>
            )}
          </div>
        </div>

        {/* Filters Panel */}
        {showFilters && (
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-wrap gap-4 animate-fadeIn">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-bold text-slate-500 uppercase">Estado</label>
              <select
                className="h-9 rounded border border-slate-200 text-sm min-w-[150px]"
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
              >
                <option value="all">Todos</option>
                <option value="scheduled">Programadas</option>
                <option value="pending_validation">Pendientes</option>
                <option value="in_progress">En Progreso</option>
                <option value="completed">Completadas</option>
                <option value="suspended">Suspendidas</option>
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-bold text-slate-500 uppercase">Fecha Específica</label>
              <input
                type="date"
                className="h-9 rounded border border-slate-200 text-sm min-w-[150px]"
                value={filterDate}
                onChange={(e) => setFilterDate(e.target.value)}
              />
            </div>
            <button
              onClick={() => { setFilterStatus('all'); setFilterDate(''); setSearchTerm(''); }}
              className="self-end text-xs text-red-500 font-bold hover:underline mb-2"
            >
              Limpiar Filtros
            </button>
          </div>
        )}

        {/* Stats */}
        <motion.div 
            variants={containerVariants}
            className="grid grid-cols-1 md:grid-cols-3 gap-4"
        >
          {stats.map((stat, i) => {
            const iconStyle =
              stat.color === 'orange' ? 'text-orange-500 bg-orange-50' :
                stat.color === 'blue' ? 'text-blue-500 bg-blue-50' :
                  stat.color === 'green' ? 'text-emerald-500 bg-emerald-50' :
                    'text-slate-500 bg-slate-50';

            return (
              <motion.div 
                key={i} 
                variants={itemVariants}
                whileHover={{ y: -4, transition: { duration: 0.2 } }}
                className="flex flex-col gap-2 rounded-xl p-6 bg-white/70 backdrop-blur-md border border-slate-200/50 shadow-sm hover:shadow-md transition-shadow"
              >
                <div className="flex items-center justify-between">
                  <p className="text-slate-500 text-sm font-medium uppercase tracking-wider">{stat.title}</p>
                  <span className={`material-symbols-outlined p-1.5 rounded-md ${iconStyle}`}>{stat.icon}</span>
                </div>
                <div className="flex items-end gap-2 mt-2">
                  <p className="text-slate-900 text-3xl font-bold leading-tight">{stat.value}</p>
                  <p className="text-slate-500 text-sm font-medium mb-1.5">{stat.title === 'Programadas Hoy' ? 'Cirugías' : ''}</p>
                </div>
                <p className="text-slate-500 text-xs mt-1">{stat.sub}</p>
              </motion.div>
            );
          })}
        </motion.div>

        {/* Table */}
        <motion.div 
            variants={itemVariants}
            className="flex flex-col gap-4 bg-white/70 backdrop-blur-md border border-slate-200/50 rounded-xl shadow-sm overflow-hidden"
        >
          <div className="px-6 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-4">
            <h3 className="text-lg font-bold text-slate-900">Próximos Procedimientos</h3>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowFilters(!showFilters)}
                className={`flex items-center gap-2 px-3 py-2 border rounded-lg text-sm font-medium transition-colors ${showFilters ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-white border-slate-200 text-slate-900 hover:bg-slate-50'}`}
              >
                <span className="material-symbols-outlined text-lg">filter_list</span>
                Filtros
              </button>
              <button className="flex items-center gap-2 px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm font-medium text-slate-900 hover:bg-slate-50 transition-colors">
                <span className="material-symbols-outlined text-lg">download</span>
                Exportar
              </button>
            </div>
          </div>
          <div className="overflow-x-auto w-full">
            <table className="w-full text-left border-collapse">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Paciente</th>
                  <th className="px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Doctor</th>
                  <th className="px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Procedimiento</th>
                  <th className="px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Estado</th>
                  <th className="px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Estado Orto</th>
                  <th className="px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider text-right">Hora</th>
                  <th className="px-6 py-3 w-10"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {Object.keys(surgeries).length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-10 text-center text-slate-500 italic">No hay cirugías que coincidan con los filtros.</td>
                  </tr>
                ) : (
                  Object.entries(surgeries as any).map(([date, daySurgeries]: [string, any]) => (
                    <React.Fragment key={date}>
                      <tr className="bg-slate-50/50">
                        <td colSpan={7} className="px-6 py-2 border-y border-slate-100">
                          <div className="flex items-center gap-2">
                            <span className="material-symbols-outlined text-slate-400 text-sm">calendar_today</span>
                            <span className="text-xs font-bold text-slate-600 uppercase tracking-widest">
                              {new Date(date + 'T12:00:00').toLocaleDateString('es-AR', { weekday: 'long', day: '2-digit', month: '2-digit' })}
                            </span>
                          </div>
                        </td>
                      </tr>
                      {daySurgeries.map((row: any, index: number) => (
                        <tr
                          key={row.id}
                          onClick={() => navigate(`/detail/${row.id}`)}
                          className="group hover:bg-slate-50 transition-colors cursor-pointer"
                        >
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              <div className={`h-8 w-8 rounded-full bg-${row.color}-100 text-${row.color}-700 flex items-center justify-center font-bold text-xs`}>{row.initials}</div>
                              <div>
                                <p className="text-sm font-medium text-slate-900">{row.name}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <p className="text-sm text-slate-900">{row.doctor}</p>
                            <p className="text-xs text-slate-500">{row.specialty}</p>
                          </td>
                          <td className="px-6 py-4 text-sm text-slate-900 font-medium">{row.proc}</td>
                          <td className="px-6 py-4">
                            <div className="flex flex-col gap-1 items-start">
                              <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border ${getStatusColor(row.status)}`}>
                                <span className={`size-1.5 rounded-full ${row.status === SurgeryStatus.InProgress ? 'bg-blue-500 animate-pulse' :
                                  row.status === SurgeryStatus.Completed ? 'bg-emerald-500' :
                                    row.status === SurgeryStatus.Delayed ? 'bg-amber-500' :
                                      row.status === SurgeryStatus.Cancelled || row.status === SurgeryStatus.Suspended ? 'bg-red-500' :
                                        row.status === SurgeryStatus.InOR ? 'bg-purple-500' :
                                          row.status === SurgeryStatus.Pending ? 'bg-orange-400' :
                                            row.status === SurgeryStatus.WaitingDate ? 'bg-sky-500' :
                                              'bg-slate-400'
                                  }`}></span>
                                {row.status}
                              </span>
                              {row.date && row.status === SurgeryStatus.Pending && (
                                <span className="flex items-center gap-1 text-[9px] text-blue-600 font-bold bg-blue-50 px-1.5 py-0.5 rounded border border-blue-100">
                                  <span className="material-symbols-outlined text-[12px]">calendar_month</span>
                                  FECHA RESERVADA
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium ${row.ortho === OrthoStatus.Completed
                              ? 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-600/20'
                              : 'bg-slate-50 text-slate-600 ring-1 ring-inset ring-slate-500/20'
                              }`}>
                              <span className={`size-1.5 rounded-full ${row.ortho === OrthoStatus.Completed ? 'bg-emerald-500' : 'bg-slate-400'}`}></span>
                              {row.ortho}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-sm font-bold text-slate-900 text-right">{row.time}</td>
                          <td className="px-6 py-4 text-right">
                            <button className="text-slate-400 hover:text-primary transition-colors">
                              <span className="material-symbols-outlined text-lg">more_vert</span>
                            </button>
                          </td>
                        </tr>
                      ))}
                    </React.Fragment>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
};

export default Dashboard;