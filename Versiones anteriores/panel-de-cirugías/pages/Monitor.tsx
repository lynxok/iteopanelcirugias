import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

interface MonitorCase {
    id: string;
    patient: string;
    procedure: string;
    doctor: string;
    anesthetist?: string;
    status: 'previous' | 'current' | 'next';
    startTime?: string; // HH:mm
    endTime?: string; // HH:mm
    estimatedDuration: number; // minutes
    elapsedMinutes?: number; // Calculated or mocked for current
}

const OR_1_DATA: MonitorCase[] = [
    {
        id: 'qx1-prev',
        patient: 'LOPEZ, MARIA',
        procedure: 'Artroscopia Rodilla',
        doctor: 'Dr. Garcia',
        status: 'previous',
        startTime: '07:30',
        endTime: '09:00',
        estimatedDuration: 90
    },
    {
        id: 'qx1-curr',
        patient: 'GOMEZ, ROBERTO',
        procedure: 'Rinoplastia Estructural',
        doctor: 'Dr. K. Lee',
        anesthetist: 'Dra. M. Ruiz',
        status: 'current',
        startTime: '09:15',
        estimatedDuration: 180, // 3 hours
        elapsedMinutes: 45 // Mock elapsed
    },
    {
        id: 'qx1-next',
        patient: 'PEREZ, JUAN',
        procedure: 'Reemplazo Cadera',
        doctor: 'Dr. Smith',
        status: 'next',
        startTime: '12:30', // Estimated start
        estimatedDuration: 120
    }
];

const OR_2_DATA: MonitorCase[] = [
    {
        id: 'qx2-prev',
        patient: 'DIAZ, CARLOS',
        procedure: 'Apendicectomía',
        doctor: 'Dr. Lopez',
        status: 'previous',
        startTime: '08:00',
        endTime: '09:30',
        estimatedDuration: 60
    },
    {
        id: 'qx2-curr',
        patient: 'MARTINEZ, ANA',
        procedure: 'Colecistectomía',
        doctor: 'Dr. Lopez',
        anesthetist: 'Dr. Chen',
        status: 'current',
        startTime: '10:00',
        estimatedDuration: 60,
        elapsedMinutes: 15 // Just started
    },
    {
        id: 'qx2-next',
        patient: 'SILVA, PEDRO',
        procedure: 'Hernioplastia',
        doctor: 'Dr. Fernandez',
        status: 'next',
        startTime: '11:15',
        estimatedDuration: 45
    }
];

const Monitor: React.FC = () => {
  const navigate = useNavigate();
  const [currentTime, setCurrentTime] = useState(new Date());

  // Real-time clock effect
  useEffect(() => {
    document.documentElement.classList.add('dark');
    
    const timer = setInterval(() => {
        setCurrentTime(new Date());
    }, 1000);

    return () => {
      document.documentElement.classList.remove('dark');
      clearInterval(timer);
    };
  }, []);

  const formatTime = (date: Date) => {
      return date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  const formatDate = (date: Date) => {
      return date.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
  };

  // Component to render a single case card
  const CaseCard: React.FC<{ data: MonitorCase }> = ({ data }) => {
      if (data.status === 'previous') {
          return (
              <div className="bg-[#1F262E]/50 rounded-lg p-4 border-l-4 border-slate-500 opacity-60 grayscale mb-4">
                  <div className="flex justify-between items-center mb-1">
                      <span className="text-xs font-bold text-slate-400 uppercase">Finalizada</span>
                      <span className="text-xs font-mono text-slate-400">{data.startTime} - {data.endTime}</span>
                  </div>
                  <h4 className="text-lg font-bold text-slate-300 truncate">{data.patient}</h4>
                  <p className="text-sm text-slate-500 truncate">{data.procedure}</p>
              </div>
          );
      }

      if (data.status === 'next') {
           return (
              <div className="bg-[#1F262E] rounded-lg p-4 border-l-4 border-blue-500/30 border border-white/5 mt-4 relative overflow-hidden">
                  <div className="absolute top-0 right-0 p-2 opacity-10">
                      <span className="material-symbols-outlined text-4xl">event_upcoming</span>
                  </div>
                  <div className="flex justify-between items-center mb-1">
                      <span className="text-xs font-bold text-blue-400 uppercase tracking-wider">Siguiente</span>
                      <span className="text-xs font-mono text-slate-400">Est. {data.startTime}</span>
                  </div>
                  <h4 className="text-xl font-bold text-white truncate">{data.patient}</h4>
                  <p className="text-sm text-slate-400 truncate">{data.procedure}</p>
                  <div className="mt-2 flex items-center gap-2 text-xs text-slate-500">
                       <span className="material-symbols-outlined text-sm">person</span> {data.doctor}
                  </div>
              </div>
          );
      }

      // CURRENT CASE (Main Focus)
      const progress = Math.min(((data.elapsedMinutes || 0) / data.estimatedDuration) * 100, 100);
      const isOvertime = (data.elapsedMinutes || 0) > data.estimatedDuration;

      return (
        <div className="bg-card-dark rounded-xl border-l-8 border-primary shadow-[0_10px_30px_-10px_rgba(0,0,0,0.5)] ring-1 ring-white/10 overflow-hidden relative group">
             {/* Background Animation */}
             <div className="absolute inset-0 bg-gradient-to-r from-primary/10 to-transparent animate-pulse pointer-events-none"></div>
             
             <div className="p-6 flex flex-col gap-4 relative z-10">
                {/* Header: Status & Start Time */}
                <div className="flex justify-between items-start">
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded bg-primary text-white text-sm font-bold uppercase tracking-wider shadow-lg shadow-primary/20">
                        <span className="animate-spin material-symbols-outlined text-sm">progress_activity</span> En Curso
                    </div>
                    <div className="text-right">
                        <span className="block text-xs text-slate-400 font-bold uppercase">Inicio</span>
                        <span className="text-3xl font-black text-white tabular-nums tracking-tighter leading-none">{data.startTime}</span>
                    </div>
                </div>

                {/* Patient & Procedure */}
                <div>
                    <span className="text-slate-500 text-xs font-bold uppercase tracking-widest">Paciente Actual</span>
                    <h3 className="text-4xl font-black text-white leading-tight my-1 truncate">{data.patient}</h3>
                    <p className="text-xl text-primary font-medium truncate">{data.procedure}</p>
                </div>

                {/* Team Grid */}
                <div className="grid grid-cols-2 gap-4 py-4 border-t border-white/5 border-b mb-1">
                    <div>
                        <p className="text-[10px] text-slate-500 font-bold uppercase mb-1">Cirujano</p>
                        <p className="text-base font-bold text-white flex items-center gap-2 truncate">
                            <span className="material-symbols-outlined text-slate-500 text-sm">person</span> {data.doctor}
                        </p>
                    </div>
                    <div>
                        <p className="text-[10px] text-slate-500 font-bold uppercase mb-1">Anestesiólogo</p>
                        <p className="text-base font-bold text-white flex items-center gap-2 truncate">
                            <span className="material-symbols-outlined text-slate-500 text-sm">medication</span> {data.anesthetist || '--'}
                        </p>
                    </div>
                </div>

                {/* Time & Estimation */}
                <div>
                    <div className="flex justify-between items-end mb-2">
                        <div>
                             <p className="text-xs text-slate-400 font-bold uppercase mb-1">Tiempo Estimado</p>
                             <p className="text-white font-mono text-lg">{data.estimatedDuration} min</p>
                        </div>
                        <div className="text-right">
                             <p className="text-xs text-slate-400 font-bold uppercase mb-1">Transcurrido</p>
                             <p className={`font-mono text-2xl font-bold ${isOvertime ? 'text-red-500 animate-pulse' : 'text-emerald-400'}`}>
                                {data.elapsedMinutes} min
                             </p>
                        </div>
                    </div>
                    {/* Progress Bar */}
                    <div className="w-full bg-slate-700/50 rounded-full h-3 overflow-hidden">
                        <div 
                            className={`h-full rounded-full transition-all duration-1000 ${isOvertime ? 'bg-red-500' : 'bg-gradient-to-r from-primary to-emerald-400'}`} 
                            style={{width: `${progress}%`}}
                        ></div>
                    </div>
                </div>
             </div>
        </div>
      );
  };

  return (
    <div className="bg-dark-bg text-white h-screen flex flex-col overflow-hidden font-display w-full absolute top-0 left-0 z-50 selection:bg-primary/30">
        {/* Header */}
        <header className="flex-none bg-surface-dark border-b border-[#283039] px-6 py-4 shadow-md z-20">
            <div className="flex items-center justify-between w-full h-full">
                <div className="flex items-center gap-4 w-1/3">
                    <button onClick={() => navigate('/')} className="flex items-center justify-center size-10 rounded-full hover:bg-white/10 text-slate-400 hover:text-white transition-colors">
                        <span className="material-symbols-outlined text-2xl">arrow_back</span>
                    </button>
                    <div className="flex items-center justify-center size-12 bg-primary/20 rounded-lg text-primary border border-primary/20 shadow-[0_0_15px_rgba(13,127,242,0.3)]">
                        <span className="material-symbols-outlined text-[32px]">monitor_heart</span>
                    </div>
                    <div>
                        <h1 className="text-xl font-black tracking-tight text-white uppercase leading-none">Monitor Quirúrgico</h1>
                        <p className="text-slate-400 text-xs font-bold tracking-widest mt-1">CONTROL CENTRAL</p>
                    </div>
                </div>
                
                {/* Real-time Clock */}
                <div className="flex flex-col items-center justify-center w-1/3">
                    <div className="flex items-baseline gap-3">
                        <span className="text-5xl font-black tracking-tighter text-white font-mono leading-none drop-shadow-lg">
                            {formatTime(currentTime)}
                        </span>
                    </div>
                    <p className="text-primary font-bold text-sm uppercase tracking-[0.3em] mt-1 opacity-80">
                        {formatDate(currentTime)}
                    </p>
                </div>
                
                <div className="flex items-center justify-end gap-6 text-right w-1/3">
                    <div className="flex items-center gap-2 bg-[#283039] px-4 py-2 rounded-full border border-white/5 shadow-inner">
                        <span className="relative flex h-3 w-3">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
                        </span>
                        <span className="text-xs font-bold text-slate-300 tracking-wider">SISTEMA EN LÍNEA</span>
                    </div>
                </div>
            </div>
        </header>

        {/* Content - Two ORs */}
        <main className="flex-grow flex w-full overflow-hidden bg-dark-bg">
            
            {/* OR 1 Section */}
            <section className="w-1/2 flex flex-col border-r border-[#283039] h-full relative">
                <div className="bg-surface-dark p-4 border-b border-[#283039] flex items-center justify-between sticky top-0 z-10 shadow-lg">
                    <div className="flex items-center gap-4">
                        <div className="flex items-center justify-center size-14 rounded-xl bg-blue-600/20 text-blue-500 border border-blue-500/30 font-black text-2xl shadow-[0_0_15px_rgba(37,99,235,0.2)]">
                            01
                        </div>
                        <div>
                            <h2 className="text-2xl font-black text-white uppercase tracking-tight leading-none">Quirófano 1</h2>
                            <span className="inline-flex mt-1 items-center rounded bg-blue-500/10 px-2 py-0.5 text-xs font-bold text-blue-400 ring-1 ring-inset ring-blue-500/20 uppercase tracking-wide">
                                Ocupado
                            </span>
                        </div>
                    </div>
                </div>
                
                {/* Timeline Container */}
                <div className="flex-grow overflow-y-auto p-6 relative bg-gradient-to-b from-dark-bg to-[#13181e]">
                    {/* Vertical Line for Timeline Effect */}
                    <div className="absolute left-6 top-6 bottom-6 w-0.5 bg-slate-700/30 hidden"></div>
                    
                    <div className="flex flex-col h-full">
                        {/* 1. Previous Surgery */}
                        {OR_1_DATA.find(c => c.status === 'previous') && (
                            <CaseCard data={OR_1_DATA.find(c => c.status === 'previous')!} />
                        )}

                        {/* 2. Current Surgery (Main) */}
                        <div className="my-2 transform scale-100 transition-transform origin-left">
                            {OR_1_DATA.find(c => c.status === 'current') && (
                                <CaseCard data={OR_1_DATA.find(c => c.status === 'current')!} />
                            )}
                        </div>

                        {/* 3. Next Surgery */}
                         {OR_1_DATA.find(c => c.status === 'next') && (
                            <CaseCard data={OR_1_DATA.find(c => c.status === 'next')!} />
                        )}
                    </div>
                </div>
            </section>

             {/* OR 2 Section */}
            <section className="w-1/2 flex flex-col h-full relative bg-[#13181e]">
                 <div className="bg-surface-dark p-4 border-b border-[#283039] flex items-center justify-between sticky top-0 z-10 shadow-lg">
                    <div className="flex items-center gap-4">
                        <div className="flex items-center justify-center size-14 rounded-xl bg-orange-500/20 text-orange-500 border border-orange-500/30 font-black text-2xl shadow-[0_0_15px_rgba(249,115,22,0.2)]">
                            02
                        </div>
                        <div>
                            <h2 className="text-2xl font-black text-white uppercase tracking-tight leading-none">Quirófano 2</h2>
                            <span className="inline-flex mt-1 items-center rounded bg-orange-500/10 px-2 py-0.5 text-xs font-bold text-orange-400 ring-1 ring-inset ring-orange-500/20 uppercase tracking-wide">
                                Ocupado
                            </span>
                        </div>
                    </div>
                </div>

                 <div className="flex-grow overflow-y-auto p-6 relative bg-gradient-to-b from-dark-bg to-[#13181e]">
                     <div className="flex flex-col h-full">
                         {/* 1. Previous Surgery */}
                        {OR_2_DATA.find(c => c.status === 'previous') && (
                            <CaseCard data={OR_2_DATA.find(c => c.status === 'previous')!} />
                        )}

                        {/* 2. Current Surgery (Main) */}
                        <div className="my-2">
                            {OR_2_DATA.find(c => c.status === 'current') && (
                                <CaseCard data={OR_2_DATA.find(c => c.status === 'current')!} />
                            )}
                        </div>

                        {/* 3. Next Surgery */}
                         {OR_2_DATA.find(c => c.status === 'next') && (
                            <CaseCard data={OR_2_DATA.find(c => c.status === 'next')!} />
                        )}
                     </div>
                 </div>
            </section>
        </main>
    </div>
  );
};

export default Monitor;