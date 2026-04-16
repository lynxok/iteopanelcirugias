import React from 'react';
import { SurgeryStatus, OrthoStatus } from '../types';
import { useNavigate } from 'react-router-dom';

const Dashboard: React.FC = () => {
  const navigate = useNavigate();

  const stats = [
    {
      title: 'Pendientes Totales',
      value: '12',
      trend: '+2 hoy',
      trendUp: true,
      sub: 'Solicitudes requieren aprobación',
      icon: 'pending_actions',
      color: 'orange'
    },
    {
      title: 'Programadas Hoy',
      value: '8',
      sub: '65% utilización de capacidad',
      progress: 65,
      icon: 'event',
      color: 'blue'
    },
    {
      title: 'Completadas',
      value: '3',
      sub: '100% tasa de éxito hoy',
      icon: 'check_circle',
      color: 'green'
    }
  ];

  const surgeries = [
    {
      initials: 'JD', name: 'Juan D.', id: 'PAC-8842', doctor: 'Dr. Smith', specialty: 'Ortopedia',
      proc: 'Reemplazo de Rodilla', status: SurgeryStatus.InProgress, ortho: OrthoStatus.ImplantReady, time: '09:00 AM', color: 'blue'
    },
    {
      initials: 'JR', name: 'Juana R.', id: 'PAC-1293', doctor: 'Dr. Jones', specialty: 'Neuro',
      proc: 'Fusión Espinal', status: SurgeryStatus.Scheduled, ortho: OrthoStatus.EquipmentPending, time: '11:30 AM', color: 'purple'
    },
    {
      initials: 'AR', name: 'Alex R.', id: 'PAC-5531', doctor: 'Dr. Lee', specialty: 'Ortopedia',
      proc: 'Reparación LCA', status: SurgeryStatus.Recovery, ortho: OrthoStatus.Completed, time: '08:00 AM', color: 'teal'
    },
    {
      initials: 'SK', name: 'Sam K.', id: 'PAC-9021', doctor: 'Dr. Patel', specialty: 'Ortopedia',
      proc: 'Resuperficie Cadera', status: SurgeryStatus.Pending, ortho: OrthoStatus.ReviewNeeded, time: '02:00 PM', color: 'pink'
    },
    {
      initials: 'CP', name: 'Chris P.', id: 'PAC-3329', doctor: 'Dr. Wong', specialty: 'Ortopedia',
      proc: 'Artroscopia Hombro', status: SurgeryStatus.Completed, ortho: OrthoStatus.Completed, time: '07:30 AM', color: 'indigo'
    },
  ];

  const getStatusColor = (status: SurgeryStatus) => {
    switch (status) {
      case SurgeryStatus.InProgress: return 'bg-blue-100 text-blue-700 border-blue-200';
      case SurgeryStatus.Scheduled: return 'bg-gray-100 text-gray-700 border-gray-200';
      case SurgeryStatus.Recovery: return 'bg-purple-100 text-purple-700 border-purple-200';
      case SurgeryStatus.Pending: return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case SurgeryStatus.Completed: return 'bg-green-100 text-green-800 border-green-200';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getOrthoColor = (status: OrthoStatus) => {
     switch (status) {
      case OrthoStatus.ImplantReady: return 'bg-green-100 text-green-800';
      case OrthoStatus.EquipmentPending: return 'bg-yellow-100 text-yellow-800';
      case OrthoStatus.Completed: return 'bg-green-100 text-green-800';
      case OrthoStatus.ReviewNeeded: return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="flex-1 h-full overflow-y-auto bg-background p-8">
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
                    <input className="pl-10 pr-4 h-10 w-64 rounded-lg bg-white border border-slate-200 text-sm focus:ring-2 focus:ring-primary focus:outline-none placeholder-slate-400" placeholder="Buscar operaciones..." type="text"/>
                </div>
                <button 
                  onClick={() => navigate('/detail/new')}
                  className="flex items-center justify-center gap-2 cursor-pointer overflow-hidden rounded-lg h-10 px-4 bg-primary text-white hover:bg-primary-hover transition-colors shadow-sm"
                >
                    <span className="material-symbols-outlined text-lg">add</span>
                    <span className="text-sm font-bold whitespace-nowrap">Nueva Cirugía</span>
                </button>
            </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {stats.map((stat, i) => (
                <div key={i} className="flex flex-col gap-2 rounded-xl p-6 bg-white border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
                    <div className="flex items-center justify-between">
                        <p className="text-slate-500 text-sm font-medium uppercase tracking-wider">{stat.title}</p>
                        <span className={`material-symbols-outlined text-${stat.color}-500 bg-${stat.color}-50 p-1.5 rounded-md`}>{stat.icon}</span>
                    </div>
                    <div className="flex items-end gap-2 mt-2">
                        <p className="text-slate-900 text-3xl font-bold leading-tight">{stat.value}</p>
                        {stat.trend && (
                            <div className="flex items-center text-emerald-700 text-xs font-medium mb-1.5 bg-green-50 px-1.5 py-0.5 rounded">
                                <span className="material-symbols-outlined text-sm mr-0.5">trending_up</span>
                                <span>{stat.trend}</span>
                            </div>
                        )}
                        {stat.title === 'Programadas Hoy' && <p className="text-slate-500 text-sm font-medium mb-1.5">Cirugías</p>}
                    </div>
                    {stat.progress && (
                         <div className="w-full bg-slate-100 rounded-full h-1.5 mt-2">
                            <div className="bg-primary h-1.5 rounded-full" style={{width: `${stat.progress}%`}}></div>
                        </div>
                    )}
                    <p className="text-slate-500 text-xs mt-1">{stat.sub}</p>
                </div>
            ))}
        </div>

        {/* Table */}
        <div className="flex flex-col gap-4 bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-4">
                <h3 className="text-lg font-bold text-slate-900">Próximos Procedimientos</h3>
                <div className="flex items-center gap-3">
                    <button className="flex items-center gap-2 px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm font-medium text-slate-900 hover:bg-slate-50 transition-colors">
                        <span className="material-symbols-outlined text-lg">filter_list</span>
                        Filtrar
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
                        {surgeries.map((row, index) => (
                            <tr 
                                key={index} 
                                onClick={() => navigate(`/detail/${row.id}`)}
                                className="group hover:bg-slate-50 transition-colors cursor-pointer"
                            >
                                <td className="px-6 py-4">
                                    <div className="flex items-center gap-3">
                                        <div className={`h-8 w-8 rounded-full bg-${row.color}-100 text-${row.color}-600 flex items-center justify-center font-bold text-xs`}>{row.initials}</div>
                                        <div>
                                            <p className="text-sm font-medium text-slate-900">{row.name}</p>
                                            <p className="text-xs text-slate-500">#{row.id}</p>
                                        </div>
                                    </div>
                                </td>
                                <td className="px-6 py-4">
                                    <p className="text-sm text-slate-900">{row.doctor}</p>
                                    <p className="text-xs text-slate-500">{row.specialty}</p>
                                </td>
                                <td className="px-6 py-4 text-sm text-slate-900 font-medium">{row.proc}</td>
                                <td className="px-6 py-4">
                                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${getStatusColor(row.status)}`}>
                                        {row.status === SurgeryStatus.InProgress && <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse"></span>}
                                        {row.status}
                                    </span>
                                </td>
                                <td className="px-6 py-4">
                                    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${getOrthoColor(row.ortho)}`}>
                                        {row.ortho}
                                    </span>
                                </td>
                                <td className="px-6 py-4 text-right text-sm font-medium text-slate-900">{row.time}</td>
                                <td className="px-6 py-4 text-center">
                                    <button className="text-slate-400 hover:text-primary transition-colors">
                                        <span className="material-symbols-outlined text-lg">more_vert</span>
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;