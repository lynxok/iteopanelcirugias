import React, { useState, useEffect } from 'react';
import { SurgeryStatus, OrthoStatus } from '../types';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../src/lib/supabase';
import { useAuth } from '../src/lib/AuthContext';
import ProgressBar from '../components/ProgressBar';

const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [surgeries, setSurgeries] = useState<any[]>([]);
  const [alerts, setAlerts] = useState<any[]>([]);
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

  useEffect(() => {
    fetchData();
    fetchAlerts();

    // Subscribe to changes
    const surgeriesSubscription = supabase
      .channel('dashboard-surgeries')
      .on('postgres_changes',
        { event: '*', schema: 'quirofano', table: 'surgeries' },
        () => fetchData()
      )
      .subscribe();

    const alertsSubscription = supabase
      .channel('dashboard-alerts')
      .on('postgres_changes',
        { event: '*', schema: 'quirofano', table: 'system_alerts' },
        () => fetchAlerts()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(surgeriesSubscription);
      supabase.removeChannel(alertsSubscription);
    };
  }, [user]); // Re-fetch if user changes to ensure role filtering

  const fetchAlerts = async () => {
    if (!user) {
      setAlerts([]);
      return;
    }

    try {
      let query = supabase
        .from('system_alerts')
        .select('*')
        .eq('status', 'Active')
        .order('date_generated', { ascending: false })
        .limit(5); // Show top 5 recent alerts

      if (user.role !== 'SuperAdmin') {
        if (user.role === 'Medico' && user.doctorId) {
          query = query.or(`target_role.eq.Medico,target_doctor_id.eq.${user.doctorId}`);
        } else {
          query = query.eq('target_role', user.role);
        }
      }

      const { data, error } = await query;
      if (error) throw error;
      setAlerts(data || []);
    } catch (err) {
      console.error('Error fetching dashboard alerts:', err);
    }
  };

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
                    doctors!doctor_id (id, full_name, specialty)
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

      // 3. Proactive Alerts Check (Fetch for 14 days specifically for alerts)
      let alertSxQuery = supabase
        .from('surgeries')
        .select(`
            id, surgery_date, ortho_validated, admission_validated, or_validated, requires_prosthesis, auth_date,
            status,
            patients (full_name)
        `)
        .gte('surgery_date', today)
        .lte('surgery_date', (() => {
          const d = new Date(); d.setDate(d.getDate() + 14);
          return d.toISOString().split('T')[0];
        })())
        .or('status.eq.scheduled,status.eq.pending_validation');

      if (user?.role === 'Oficina ART') {
        const { data: artCoverages } = await supabase
          .from('coverages')
          .select('name')
          .eq('type', 'ART');
        const artNames = artCoverages?.map(c => c.name) || [];
        if (artNames.length > 0) {
          alertSxQuery = alertSxQuery.in('medical_coverage', artNames);
        } else {
          alertSxQuery = alertSxQuery.eq('id', '00000000-0000-0000-0000-000000000000');
        }
      }

      const { data: alertSxData } = await alertSxQuery;

      if (alertSxData) {
        generateProactiveAlerts(alertSxData);
      }

      // Safety filter: ensure no surgery from a previous date is included 
      // even if the database filter had timezone discrepancies
      const uniqueSurgeryData = Array.from(new Map((surgeryData || []).map((item: any) => [item.id, item])).values());
      const validSurgeryData = uniqueSurgeryData.filter(s => s.surgery_date >= today);

      const nowAt = new Date();
      const curH = nowAt.getHours();
      const curM = nowAt.getMinutes();
      const curTotalMin = curH * 60 + curM;

      const processedData = validSurgeryData.map((s: any) => {
        const isToday = s.surgery_date === today;
        if (!isToday || !s.start_time) return s;

        const [sH, sM] = s.start_time.split(':').map(Number);
        const sStartTotal = sH * 60 + sM;
        // Strict: Check if estimated_duration exists
        const duration = s.estimated_duration ? Number(s.estimated_duration) : null;

        let finalStatus = s.status;

        // 0. Visual Promotion for Pending (v1.1.11 Logic)
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

        // 1. Auto-Start (Visual)
        if ((finalStatus === 'scheduled' || finalStatus === 'pending_validation') && curTotalMin >= sStartTotal) {
          finalStatus = 'in_progress';
        }

        // 2. Smart Auto-Finish (Visual)
        if ((finalStatus === 'in_progress' || finalStatus === 'in_or' || finalStatus === 'delayed') && duration) {
          const timeBase = finalStatus === 'delayed' ? s.start_time : (s.actual_start_time || s.start_time);

          if (timeBase) {
            const [bH, bM] = timeBase.split(':').map(Number);
            const baseStartTotal = bH * 60 + bM;

            const BUFFER_MINUTES = 10;
            const safeEndTotal = baseStartTotal + duration + BUFFER_MINUTES;

            if (curTotalMin >= safeEndTotal) {
              finalStatus = 'completed';
            }
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
        s.status === 'scheduled' || s.status === 'in_progress' || s.status === 'in_or'
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

  const generateProactiveAlerts = async (surgeries: any[]) => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    for (const sx of surgeries) {
      if (!sx.surgery_date) continue;

      const sxDate = new Date(sx.surgery_date + 'T12:00:00');
      const diffTime = sxDate.getTime() - today.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      if (diffDays > 0 && diffDays <= 14) {
        const missingOrto = sx.requires_prosthesis && !sx.ortho_validated;
        const missingAdm = !sx.admission_validated;
        const missingOr = !sx.or_validated;
        const missingAuth = !sx.auth_date;

        if (!missingOrto && !missingAdm && !missingOr && !missingAuth) continue;

        const reason = [];
        if (missingOrto) reason.push('Ortopedia');
        if (missingAdm) reason.push('Internación');
        if (missingOr) reason.push('Quirófano');

        // 0. AUTH ALERT (Critical at <= 3 days)
        if (missingAuth && diffDays <= 3) {
          await createAlertIfNotExists(
            sx,
            'Internacion',
            'URGENTE: Falta Autorización',
            `La cirugía es en ${diffDays} días y NO TIENE fecha de autorización cargada.`,
            'Critical'
          );
        }

        if (diffDays <= 10) {
          // ESCALATED: Notify everyone
          const roles = ['Tecnico', 'Internacion', 'Ortopedia'];

          for (const role of roles) {
            await createAlertIfNotExists(
              sx,
              role,
              'ESCALACIÓN CRÍTICA: Falta Validación',
              `La cirugía programada en ${diffDays} días aún no cuenta con validación de: ${reason.join(', ')}.`,
              'Critical'
            );
          }

          // Also notify Medico if it belongs to one
          if (sx.doctor_id) {
            await createAlertIfNotExists(
              sx,
              'Medico',
              'ALERTA MÉDICO: Validación Pendiente',
              `Su cirugía en ${diffDays} días tiene validaciones pendientes de: ${reason.join(', ')}.`,
              'Critical',
              sx.doctor_id
            );
          }
        } else {
          // TARGETED (11-14 days)
          if (missingOrto) {
            await createAlertIfNotExists(sx, 'Ortopedia', 'Recordatorio: Validación Ortopedia', `Falta validar ortopedia para cirugía en ${diffDays} días.`, 'Urgent');
          }
          if (missingAdm) {
            await createAlertIfNotExists(sx, 'Internacion', 'Recordatorio: Validación Internación', `Falta validar internación para cirugía en ${diffDays} días.`, 'Urgent');
          }
          if (missingOr) {
            await createAlertIfNotExists(sx, 'Tecnico', 'Recordatorio: Validación Quirófano', `Falta validar quirófano para cirugía en ${diffDays} días.`, 'Urgent');
          }

          // TARGETED: Medico (11-14 days)
          if (sx.doctor_id && (missingOrto || missingAdm || missingOr)) {
            await createAlertIfNotExists(sx, 'Medico', 'Aviso Médico: Validaciones en Proceso', `Su cirugía en ${diffDays} días está en proceso de validación (${reason.join(', ')} pendientes).`, 'Info', sx.doctor_id);
          }
        }
      }
    }
  };

  const createAlertIfNotExists = async (sx: any, role: string, title: string, message: string, severity: string, doctorId?: string) => {
    // We identify unique alerts by surgery_id, target_role AND a prefix of the message to allow updates 
    // but avoid spamming the exact same alert multiple times.
    // Or better: just by surgery_id and target_role for 'proactive_validation' type.

    let query = supabase
      .from('system_alerts')
      .select('id, title')
      .eq('surgery_id', sx.id)
      .eq('target_role', role)
      .eq('status', 'Active')
      .eq('type', 'proactive_validation');

    if (doctorId) {
      query = query.eq('target_doctor_id', doctorId);
    }

    const { data: existing } = await query.maybeSingle();

    if (!existing) {
      await supabase.from('system_alerts').insert({
        type: 'proactive_validation',
        severity,
        title,
        message,
        patient_name: sx.patients?.full_name || 'N/A',
        surgery_id: sx.id,
        target_role: role,
        target_doctor_id: doctorId || null,
        status: 'Active'
      });
    } else if (existing.title !== title) {
      // Update title/severity if it changed (e.g. from Urgent to Critical)
      await supabase.from('system_alerts').update({
        title,
        message,
        severity,
        date_generated: new Date().toISOString()
      }).eq('id', existing.id);
    }
  };

  // Process and Filter Data Effect
  useEffect(() => {
    let filteredList = [...rawSurgeries];

    if (filteredList.length > 0) {
      // --- FILTERING ---

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

  const getAlertStyle = (severity: string) => {
    switch (severity) {
      case 'Critical': return 'bg-red-50 border-red-200 text-red-800';
      case 'Urgent': return 'bg-orange-50 border-orange-200 text-orange-800';
      default: return 'bg-blue-50 border-blue-200 text-blue-800';
    }
  };

  return (
    <div className="flex-1 h-full overflow-y-auto bg-slate-50/50 p-6 md:p-8 font-sans">
      <ProgressBar isLoading={loading} />
      <div className="max-w-[1800px] mx-auto flex flex-col gap-8">

        {/* 1. Header & Quick Actions */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 animate-fadeIn">
          <div>
            <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight">Centro de Coordinación</h2>
            <p className="text-slate-500 font-medium mt-1">Visión general y gestión de procedimientos.</p>
          </div>

          <div className="flex items-center gap-3 w-full md:w-auto glass-panel p-1.5">
            <div className="relative flex-1 md:w-80 group">
              <span className="material-symbols-outlined absolute left-3 top-2.5 text-slate-400 group-focus-within:text-primary transition-colors">search</span>
              <input
                className="w-full pl-10 pr-4 h-10 rounded-xl bg-transparent border-none text-sm font-medium focus:ring-0 placeholder-slate-400"
                placeholder="Buscar paciente, médico o DNI..."
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            {user?.role !== 'Medico' && user?.role !== 'Tecnico' && user?.role !== 'Ortopedia' && (
              <button
                onClick={() => navigate('/detail/new')}
                className="flex items-center gap-2 h-10 px-5 bg-slate-900 text-white hover:bg-slate-800 rounded-xl font-bold text-sm transition-all shadow-lg shadow-slate-900/20 active:scale-95"
              >
                <span className="material-symbols-outlined text-lg">add_circle</span>
                <span>Nueva</span>
              </button>
            )}
          </div>
        </div>

        {/* 2. Bento Grid Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {stats.map((stat, i) => (
            <div key={i} className={`glass-card p-6 relative overflow-hidden group interactive-card border-l-4 ${stat.color === 'orange' ? 'border-l-orange-500' :
                stat.color === 'blue' ? 'border-l-blue-500' : 'border-l-emerald-500'
              }`}>
              <div className="flex justify-between items-start z-10 relative">
                <div>
                  <p className="text-slate-500 text-xs font-bold uppercase tracking-wider mb-1">{stat.title}</p>
                  <h3 className="text-4xl font-extrabold text-slate-900 tracking-tighter">{stat.value}</h3>
                </div>
                <div className={`p-3 rounded-2xl ${stat.color === 'orange' ? 'bg-orange-50 text-orange-600' :
                    stat.color === 'blue' ? 'bg-blue-50 text-blue-600' : 'bg-emerald-50 text-emerald-600'
                  }`}>
                  <span className="material-symbols-outlined text-2xl">{stat.icon}</span>
                </div>
              </div>
              <p className="text-slate-400 text-xs font-medium mt-4 z-10 relative">{stat.sub}</p>

              {/* Background Decoration */}
              <div className={`absolute -right-6 -bottom-6 size-32 rounded-full opacity-5 blur-2xl transition-all group-hover:scale-150 ${stat.color === 'orange' ? 'bg-orange-500' :
                  stat.color === 'blue' ? 'bg-blue-500' : 'bg-emerald-500'
                }`}></div>
            </div>
          ))}
        </div>

        {/* 3. Alerts Section (Glassmorphic) */}
        {alerts.length > 0 && (
          <div className="glass-panel p-6 border-l-4 border-l-amber-400">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <span className="material-symbols-outlined text-amber-500 filled">warning</span>
                Atención Requerida
              </h3>
              <button
                onClick={() => navigate('/alerts')}
                className="text-xs font-bold text-slate-500 hover:text-slate-900 hover:underline transition-colors"
              >
                VER HISTORIAL
              </button>
            </div>
            <div className="grid grid-cols-1 gap-3">
              {alerts.map((alert) => (
                <div
                  key={alert.id}
                  onClick={() => navigate(`/detail/${alert.surgery_id}`)}
                  className="flex items-start gap-4 p-4 rounded-xl bg-white/50 hover:bg-white border border-white/50 transition-all cursor-pointer group"
                >
                  <div className={`p-2 rounded-lg shrink-0 ${alert.severity === 'Critical' ? 'bg-red-100 text-red-600' : 'bg-amber-100 text-amber-600'}`}>
                    <span className="material-symbols-outlined text-xl">{alert.severity === 'Critical' ? 'gpp_maybe' : 'priority_high'}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-baseline">
                      <h4 className="font-bold text-sm text-slate-800 group-hover:text-primary transition-colors">{alert.title}</h4>
                      <span className="text-[10px] font-mono text-slate-400">{new Date(alert.date_generated).toLocaleDateString()}</span>
                    </div>
                    <p className="text-xs text-slate-500 mt-1 line-clamp-1">{alert.message}</p>
                    <div className="flex items-center gap-2 mt-2">
                      <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                        {alert.patient_name}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 4. Main Table (Clean & Modern) */}
        <div className="glass-card flex flex-col overflow-hidden min-h-[500px]">
          {/* Table Toolbar */}
          <div className="px-8 py-6 border-b border-slate-100 flex flex-wrap items-center justify-between gap-4 bg-white/40">
            <div>
              <h3 className="text-xl font-bold text-slate-900">Agenda Quirúrgica</h3>
              <p className="text-xs text-slate-400 font-medium uppercase tracking-wider mt-1">
                {filterDate ? `Mostrando: ${new Date(filterDate + 'T12:00:00').toLocaleDateString()}` : 'Próximos 5 días'}
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowFilters(!showFilters)}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wide transition-all ${showFilters ? 'bg-slate-900 text-white shadow-md' : 'bg-white text-slate-600 hover:bg-slate-50 border border-slate-200'
                  }`}
              >
                <span className="material-symbols-outlined text-lg">tune</span>
                Filtros
              </button>
            </div>
          </div>

          {/* Filters Expanded */}
          {showFilters && (
            <div className="bg-slate-50/80 px-8 py-4 flex gap-4 border-b border-slate-100 animate-fadeIn">
              {/* Same filters but styled better */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold text-slate-400 uppercase">Estado</label>
                <select
                  className="h-10 rounded-lg border-slate-200 bg-white text-sm focus:ring-2 focus:ring-slate-900/10"
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                >
                  <option value="all">Todos</option>
                  <option value="scheduled">Programadas</option>
                  <option value="pending_validation">Pendientes</option>
                  <option value="in_progress">En Progreso</option>
                  <option value="completed">Completadas</option>
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold text-slate-400 uppercase">Fecha</label>
                <input
                  type="date"
                  className="h-10 rounded-lg border-slate-200 bg-white text-sm focus:ring-2 focus:ring-slate-900/10"
                  value={filterDate}
                  onChange={(e) => setFilterDate(e.target.value)}
                />
              </div>
            </div>
          )}

          {/* Table Content */}
          <div className="overflow-x-auto flex-1">
            <table className="w-full text-left border-collapse">
              <thead className="bg-slate-50/50 sticky top-0 z-10 backdrop-blur-sm">
                <tr>
                  <th className="px-8 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Paciente</th>
                  <th className="px-8 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Equipo Médico</th>
                  <th className="px-8 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Procedimiento</th>
                  <th className="px-8 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-center">Estado</th>
                  <th className="px-8 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-center">Ortopedia</th>
                  <th className="px-8 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-right">Horario</th>
                  <th className="px-6 py-4"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {Object.keys(surgeries).length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-20 text-center flex flex-col items-center justify-center opacity-50">
                      <span className="material-symbols-outlined text-4xl mb-2">event_busy</span>
                      <p className="text-sm font-medium">No se encontraron cirugías</p>
                    </td>
                  </tr>
                ) : (
                  Object.entries(surgeries as any).map(([date, daySurgeries]: [string, any]) => (
                    <React.Fragment key={date}>
                      <tr className="bg-slate-50/30">
                        <td colSpan={7} className="px-8 py-3">
                          <div className="flex items-center gap-2">
                            <span className="size-2 rounded-full bg-slate-300"></span>
                            <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">
                              {new Date(date + 'T12:00:00').toLocaleDateString('es-AR', { weekday: 'long', day: '2-digit', month: 'long' })}
                            </span>
                          </div>
                        </td>
                      </tr>
                      {daySurgeries.map((row: any) => (
                        <tr
                          key={row.id}
                          onClick={() => navigate(`/detail/${row.id}`)}
                          className="group hover:bg-blue-50/50 transition-all cursor-pointer relative"
                        >
                          {/* Hover Indicator */}
                          <td className="absolute left-0 top-0 bottom-0 w-1 bg-primary scale-y-0 group-hover:scale-y-100 transition-transform origin-center"></td>

                          <td className="px-8 py-5">
                            <div className="flex items-center gap-4">
                              <div className={`size-10 rounded-xl bg-gradient-to-br from-${row.color}-100 to-${row.color}-50 text-${row.color}-700 flex items-center justify-center font-bold text-sm shadow-sm ring-1 ring-white`}>
                                {row.initials}
                              </div>
                              <div>
                                <p className="text-sm font-bold text-slate-900 group-hover:text-primary transition-colors">{row.name}</p>
                                <p className="text-[10px] text-slate-400 uppercase tracking-wide font-medium">HC: {row.id.substring(0, 6)}...</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-8 py-5">
                            <p className="text-sm font-medium text-slate-900">{row.doctor}</p>
                            <p className="text-xs text-slate-500">{row.specialty}</p>
                          </td>
                          <td className="px-8 py-5 max-w-xs">
                            <p className="text-sm text-slate-700 font-medium truncate" title={row.proc}>{row.proc}</p>
                          </td>
                          <td className="px-8 py-5 text-center">
                            <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold border ${getStatusColor(row.status).replace('rounded-full', 'rounded-lg')}`}>
                              {row.status}
                            </span>
                          </td>
                          <td className="px-8 py-5 text-center">
                            <div className="flex justify-center">
                              <span className={`size-3 rounded-full ${row.ortho === OrthoStatus.Completed ? 'bg-emerald-400 shadow-lg shadow-emerald-400/40' : 'bg-slate-200'}`} title={`Ortopedia: ${row.ortho}`}></span>
                            </div>
                          </td>
                          <td className="px-8 py-5 text-right">
                            <span className="text-lg font-bold text-slate-700 font-mono tracking-tight">{row.time}</span>
                          </td>
                          <td className="px-6 py-5 text-right">
                            <span className="material-symbols-outlined text-slate-300 group-hover:text-slate-500 transition-colors">chevron_right</span>
                          </td>
                        </tr>
                      ))}
                    </React.Fragment>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  );
};

export default Dashboard;