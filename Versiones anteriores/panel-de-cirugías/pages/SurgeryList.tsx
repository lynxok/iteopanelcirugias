import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

interface SurgeryRow {
  id: string;
  patientName: string;
  patientId: string;
  procedure: string;
  doctor: string;
  status: 'Borrador' | 'Pendiente Autorización' | 'Programada' | 'En Quirófano' | 'Finalizada' | 'Cancelada';
  date: string;
  or?: string;
}

const MOCK_DATA: SurgeryRow[] = [
  { id: '101', patientName: 'Juan Pérez', patientId: '12.345.678', procedure: 'Artroscopia de Rodilla', doctor: 'Dr. Jorge Garcia', status: 'Programada', date: '2023-10-24', or: 'Qx 302' },
  { id: '102', patientName: 'Maria Rodriguez', patientId: '23.456.789', procedure: 'Reemplazo Total de Cadera', doctor: 'Dra. Sarah Smith', status: 'Pendiente Autorización', date: '2023-10-25' },
  { id: '103', patientName: 'Carlos Ruiz', patientId: '11.223.344', procedure: 'Apendicectomía', doctor: 'Dr. Lopez', status: 'En Quirófano', date: 'Hoy', or: 'Qx 301' },
  { id: '104', patientName: 'Ana Gomez', patientId: '87.654.321', procedure: 'Colecistectomía', doctor: 'Dr. Garcia', status: 'Borrador', date: '--' },
  { id: '105', patientName: 'Luis Torres', patientId: '44.555.666', procedure: 'Hernioplastia Inguinal', doctor: 'Dr. Fernandez', status: 'Programada', date: '2023-10-26', or: 'Qx 303' },
  { id: '106', patientName: 'Elena Vazquez', patientId: '99.888.777', procedure: 'Reparación LCA', doctor: 'Dra. Sarah Smith', status: 'Finalizada', date: 'Ayer' },
  { id: '107', patientName: 'Roberto Diaz', patientId: '33.444.555', procedure: 'Rinoplastia', doctor: 'Dr. Lee', status: 'Pendiente Autorización', date: '2023-10-28' },
];

const SurgeryList: React.FC = () => {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('Todos');

  // Filter Logic
  const filteredData = MOCK_DATA.filter(item => {
    const matchesSearch = 
        item.patientName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.patientId.includes(searchTerm) ||
        item.procedure.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.doctor.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesStatus = filterStatus === 'Todos' || item.status === filterStatus;

    return matchesSearch && matchesStatus;
  });

  const getStatusColor = (status: string) => {
    switch (status) {
        case 'Programada': return 'bg-blue-50 text-blue-700 border-blue-200';
        case 'En Quirófano': return 'bg-purple-50 text-purple-700 border-purple-200 animate-pulse';
        case 'Pendiente Autorización': return 'bg-orange-50 text-orange-700 border-orange-200';
        case 'Finalizada': return 'bg-emerald-50 text-emerald-700 border-emerald-200';
        case 'Cancelada': return 'bg-red-50 text-red-700 border-red-200';
        case 'Borrador': return 'bg-slate-100 text-slate-600 border-slate-200';
        default: return 'bg-slate-100 text-slate-600';
    }
  };

  return (
    <div className="flex-1 h-full overflow-y-auto bg-slate-50 p-8 font-sans">
      <div className="max-w-[1600px] mx-auto flex flex-col gap-6">
        
        {/* Header Section */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div>
                <h1 className="text-2xl font-bold text-slate-900">Listado General</h1>
                <p className="text-slate-500 text-sm mt-1">Gestión centralizada de todas las solicitudes quirúrgicas.</p>
            </div>
            <button 
                onClick={() => navigate('/detail/new')}
                className="flex items-center gap-2 bg-primary hover:bg-primary-hover text-white px-5 py-2.5 rounded-lg font-bold text-sm shadow-sm transition-all"
            >
                <span className="material-symbols-outlined text-lg">add</span>
                Nueva Cirugía
            </button>
        </div>

        {/* Filters Bar */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row gap-4 items-center justify-between">
            <div className="relative w-full md:w-96">
                <span className="material-symbols-outlined absolute left-3 top-2.5 text-slate-400">search</span>
                <input 
                    type="text" 
                    placeholder="Buscar por Paciente, DNI, Procedimiento..." 
                    className="w-full pl-10 pr-4 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-primary focus:border-primary outline-none text-sm transition-all"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                />
            </div>
            
            <div className="flex items-center gap-2 w-full md:w-auto overflow-x-auto pb-2 md:pb-0">
                <span className="text-sm font-bold text-slate-500 whitespace-nowrap mr-2">Estado:</span>
                {['Todos', 'Programada', 'Pendiente Autorización', 'Borrador'].map(status => (
                    <button
                        key={status}
                        onClick={() => setFilterStatus(status)}
                        className={`px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap border transition-all ${
                            filterStatus === status 
                            ? 'bg-slate-800 text-white border-slate-800' 
                            : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                        }`}
                    >
                        {status}
                    </button>
                ))}
            </div>
        </div>

        {/* Table Section */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex-1">
            <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                    <thead className="bg-slate-50 border-b border-slate-200">
                        <tr>
                            <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Paciente</th>
                            <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Procedimiento</th>
                            <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Cirujano</th>
                            <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Estado</th>
                            <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Fecha / Qx</th>
                            <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Acciones</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {filteredData.length > 0 ? (
                            filteredData.map((row) => (
                                <tr 
                                    key={row.id} 
                                    onClick={() => navigate(`/detail/${row.id}`)}
                                    className="hover:bg-blue-50/30 cursor-pointer transition-colors group"
                                >
                                    <td className="px-6 py-4">
                                        <div className="flex flex-col">
                                            <span className="font-bold text-slate-900 text-sm">{row.patientName}</span>
                                            <span className="text-xs text-slate-500">DNI: {row.patientId}</span>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className="text-sm font-medium text-slate-700">{row.procedure}</span>
                                    </td>
                                    <td className="px-6 py-4 text-sm text-slate-600">
                                        {row.doctor}
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold border ${getStatusColor(row.status)}`}>
                                            {row.status}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="flex flex-col">
                                            <span className="text-sm font-bold text-slate-700">{row.date}</span>
                                            {row.or && <span className="text-[10px] text-slate-500 uppercase font-bold">{row.or}</span>}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <button className="text-slate-400 hover:text-primary transition-colors p-2 hover:bg-slate-100 rounded-full">
                                            <span className="material-symbols-outlined text-xl">chevron_right</span>
                                        </button>
                                    </td>
                                </tr>
                            ))
                        ) : (
                            <tr>
                                <td colSpan={6} className="px-6 py-12 text-center text-slate-400">
                                    <span className="material-symbols-outlined text-4xl mb-2">search_off</span>
                                    <p className="text-sm font-medium">No se encontraron cirugías con los filtros actuales.</p>
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
            
            {/* Pagination Footer (Mock) */}
            <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
                <p className="text-xs text-slate-500">Mostrando {filteredData.length} resultados</p>
                <div className="flex items-center gap-2">
                    <button className="p-1 rounded hover:bg-white border border-transparent hover:border-slate-200 text-slate-400 hover:text-slate-600 disabled:opacity-50">
                        <span className="material-symbols-outlined">chevron_left</span>
                    </button>
                    <button className="p-1 rounded hover:bg-white border border-transparent hover:border-slate-200 text-slate-400 hover:text-slate-600">
                        <span className="material-symbols-outlined">chevron_right</span>
                    </button>
                </div>
            </div>
        </div>
      </div>
    </div>
  );
};

export default SurgeryList;