import React, { useState } from 'react';

const ResultsDashboard: React.FC = () => {
  const [period, setPeriod] = useState('Este Mes');

  // --- Mock Data ---
  const kpis = [
      { title: 'Cirugías Realizadas', value: 142, trend: '+12%', isPositive: true, icon: 'medical_services', color: 'blue' },
      { title: 'Tasa de Éxito', value: '98.5%', trend: '+0.5%', isPositive: true, icon: 'check_circle', color: 'emerald' },
      { title: 'Tasa de Suspensión', value: '2.1%', trend: '-1.5%', isPositive: true, icon: 'cancel', color: 'red' },
      { title: 'Ocupación Quirófano', value: '87%', trend: '+5%', isPositive: true, icon: 'door_sliding', color: 'purple' },
  ];

  const efficiencyData = [
      { doctor: 'Dr. Jorge Garcia', specialty: 'Ortopedia', cases: 45, avgTime: '85 min', complications: '0%' },
      { doctor: 'Dra. Sarah Smith', specialty: 'Traumatología', cases: 38, avgTime: '110 min', complications: '2.6%' },
      { doctor: 'Dr. Lopez', specialty: 'Cirugía General', cases: 32, avgTime: '60 min', complications: '0%' },
      { doctor: 'Dr. Fernandez', specialty: 'Neurocirugía', cases: 12, avgTime: '240 min', complications: '8.3%' },
  ];

  const suspensionReasons = [
      { label: 'Falta de Materiales', value: 45, color: 'bg-orange-500' },
      { label: 'Condición Paciente', value: 30, color: 'bg-red-500' },
      { label: 'Falta de Cama', value: 15, color: 'bg-blue-500' },
      { label: 'Administrativo', value: 10, color: 'bg-slate-400' },
  ];

  // Simple CSS Chart Components
  const BarChartItem = ({ label, height, colorClass }: { label: string, height: string, colorClass: string }) => (
      <div className="flex flex-col items-center gap-2 flex-1 group">
          <div className="relative w-full bg-slate-100 rounded-t-lg h-32 flex items-end justify-center overflow-hidden">
             <div className={`w-full mx-2 rounded-t-md transition-all group-hover:opacity-80 ${colorClass}`} style={{ height: height }}></div>
          </div>
          <span className="text-xs text-slate-500 font-medium">{label}</span>
      </div>
  );

  return (
    <div className="flex-1 h-full overflow-y-auto bg-slate-50 p-8 font-sans">
      <div className="max-w-[1600px] mx-auto flex flex-col gap-8">
        
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
            <div>
                <div className="flex items-center gap-2 mb-1">
                    <span className="bg-slate-900 text-white text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider">Dirección</span>
                    <span className="text-slate-400 text-xs font-medium">Acceso Ejecutivo</span>
                </div>
                <h1 className="text-2xl font-bold text-slate-900">Resultados Quirúrgicos</h1>
                <p className="text-slate-500 text-sm">Análisis de rendimiento, eficiencia y calidad de atención.</p>
            </div>
            
            <div className="bg-white border border-slate-200 p-1 rounded-lg flex items-center shadow-sm">
                {['Esta Semana', 'Este Mes', 'Este Trimestre', 'Este Año'].map(p => (
                    <button 
                        key={p}
                        onClick={() => setPeriod(p)}
                        className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all ${
                            period === p 
                            ? 'bg-slate-900 text-white shadow-sm' 
                            : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50'
                        }`}
                    >
                        {p}
                    </button>
                ))}
            </div>
        </div>

        {/* KPI Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {kpis.map((kpi, idx) => (
                <div key={idx} className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex items-start justify-between">
                    <div>
                        <p className="text-slate-500 text-xs font-bold uppercase tracking-wider mb-1">{kpi.title}</p>
                        <h3 className="text-3xl font-black text-slate-900">{kpi.value}</h3>
                        <div className={`flex items-center gap-1 mt-2 text-xs font-bold ${kpi.isPositive ? 'text-emerald-600' : 'text-red-600'}`}>
                            <span className="material-symbols-outlined text-sm">
                                {kpi.isPositive ? 'trending_up' : 'trending_down'}
                            </span>
                            <span>{kpi.trend} vs periodo anterior</span>
                        </div>
                    </div>
                    <div className={`p-3 rounded-lg bg-${kpi.color}-50 text-${kpi.color}-600`}>
                        <span className="material-symbols-outlined text-2xl">{kpi.icon}</span>
                    </div>
                </div>
            ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* Chart: Activity Volume */}
            <div className="lg:col-span-2 bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                <div className="flex justify-between items-center mb-6">
                    <h3 className="font-bold text-slate-900">Volumen Quirúrgico</h3>
                    <button className="text-slate-400 hover:text-slate-600">
                        <span className="material-symbols-outlined">more_horiz</span>
                    </button>
                </div>
                
                {/* Simulated Chart Container */}
                <div className="h-64 w-full flex items-end gap-4 px-4 border-b border-slate-100 pb-2">
                    <BarChartItem label="Ene" height="60%" colorClass="bg-blue-400" />
                    <BarChartItem label="Feb" height="45%" colorClass="bg-blue-400" />
                    <BarChartItem label="Mar" height="75%" colorClass="bg-blue-400" />
                    <BarChartItem label="Abr" height="50%" colorClass="bg-blue-400" />
                    <BarChartItem label="May" height="80%" colorClass="bg-blue-400" />
                    <BarChartItem label="Jun" height="65%" colorClass="bg-blue-400" />
                    <BarChartItem label="Jul" height="90%" colorClass="bg-primary" />
                </div>
                <div className="mt-4 grid grid-cols-3 gap-4 text-center">
                     <div>
                        <p className="text-xs text-slate-400 uppercase">Promedio Diario</p>
                        <p className="font-bold text-slate-900 text-lg">4.2</p>
                     </div>
                     <div>
                        <p className="text-xs text-slate-400 uppercase">Total Periodo</p>
                        <p className="font-bold text-slate-900 text-lg">142</p>
                     </div>
                     <div>
                        <p className="text-xs text-slate-400 uppercase">Capacidad Restante</p>
                        <p className="font-bold text-slate-900 text-lg">13%</p>
                     </div>
                </div>
            </div>

            {/* Chart: Suspension Reasons */}
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex flex-col">
                <h3 className="font-bold text-slate-900 mb-6">Motivos de Suspensión</h3>
                <div className="flex-1 flex flex-col justify-center gap-6">
                    {suspensionReasons.map((reason, i) => (
                        <div key={i}>
                            <div className="flex justify-between text-xs mb-1 font-medium">
                                <span className="text-slate-700">{reason.label}</span>
                                <span className="text-slate-900">{reason.value}%</span>
                            </div>
                            <div className="w-full bg-slate-100 rounded-full h-2">
                                <div className={`h-2 rounded-full ${reason.color}`} style={{ width: `${reason.value}%` }}></div>
                            </div>
                        </div>
                    ))}
                </div>
                <div className="mt-6 p-4 bg-red-50 rounded-lg border border-red-100">
                    <p className="text-xs text-red-800 font-medium flex items-start gap-2">
                        <span className="material-symbols-outlined text-sm">warning</span>
                        "Falta de Materiales" representa el 45% de las cancelaciones este mes. Se recomienda revisar proveedores de Ortopedia.
                    </p>
                </div>
            </div>
        </div>

        {/* Efficiency Table */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex justify-between items-center">
                <h3 className="font-bold text-slate-900">Eficiencia por Cirujano</h3>
                <button className="text-primary text-sm font-bold hover:underline">Ver Reporte Completo</button>
            </div>
            <div className="overflow-x-auto">
                <table className="w-full text-left">
                    <thead className="bg-slate-50 text-slate-500 text-xs uppercase font-bold tracking-wider">
                        <tr>
                            <th className="px-6 py-4">Profesional</th>
                            <th className="px-6 py-4">Especialidad</th>
                            <th className="px-6 py-4 text-center">Casos (Mes)</th>
                            <th className="px-6 py-4 text-center">Tiempo Promedio</th>
                            <th className="px-6 py-4 text-center">Tasa Complicaciones</th>
                            <th className="px-6 py-4 text-right">Desempeño</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {efficiencyData.map((row, idx) => (
                            <tr key={idx} className="hover:bg-slate-50">
                                <td className="px-6 py-4 font-bold text-slate-900">{row.doctor}</td>
                                <td className="px-6 py-4 text-sm text-slate-500">{row.specialty}</td>
                                <td className="px-6 py-4 text-center text-sm font-medium">{row.cases}</td>
                                <td className="px-6 py-4 text-center text-sm font-mono text-slate-600 bg-slate-50/50">{row.avgTime}</td>
                                <td className="px-6 py-4 text-center">
                                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold ${
                                        parseFloat(row.complications) === 0 ? 'bg-emerald-100 text-emerald-800' : 
                                        parseFloat(row.complications) < 5 ? 'bg-yellow-100 text-yellow-800' : 'bg-red-100 text-red-800'
                                    }`}>
                                        {row.complications}
                                    </span>
                                </td>
                                <td className="px-6 py-4 text-right">
                                    <div className="flex justify-end gap-1">
                                        {[1,2,3,4,5].map(star => (
                                            <span key={star} className={`material-symbols-outlined text-sm ${star <= 4 ? 'text-amber-400 filled' : 'text-slate-200'}`}>star</span>
                                        ))}
                                    </div>
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

export default ResultsDashboard;