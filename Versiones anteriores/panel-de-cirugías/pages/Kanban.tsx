import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

// --- Types ---
interface KanbanItem {
  name: string;
  id: string;
  age: number;
  doctor: string;
  proc: string;
  color: string;
  tag?: string;
  tagColor?: string;
  status?: string;
  time?: string;
  date?: string;
  done?: boolean; // Used for logic
}

interface KanbanColumn {
  id: string;
  title: string;
  count: number;
  color: string;
  items: KanbanItem[];
}

interface AutomationRule {
  id: string;
  name: string;
  triggerField: keyof KanbanItem;
  triggerValue: string;
  targetColumnId: string;
  isActive: boolean;
}

// --- Initial Data ---
const INITIAL_COLUMNS: KanbanColumn[] = [
  {
    id: 'todo',
    title: 'Por Agendar',
    count: 2,
    color: 'bg-slate-400',
    items: [
      { name: 'Jose Perez', id: '12.345.678', age: 34, doctor: 'Dr. Garcia', proc: 'Hernioplastia Inguinal', color: 'blue' },
      { name: 'Ana Maria Gomez', id: '23.456.789', age: 62, doctor: 'Dra. Martinez', proc: 'Consulta Ortopedia', tag: 'Prioridad', tagColor: 'red', color: 'blue' }
    ]
  },
  {
    id: 'no-material',
    title: 'Sin Material coordinado',
    count: 2,
    color: 'bg-orange-400',
    items: [
      { name: 'Maria Rodriguez', id: '67.890.123', age: 52, doctor: 'Dra. Lopez', proc: 'Reemplazo Cadera', tag: 'Orto', tagColor: 'purple', status: 'Cotización Pendiente', time: 'hace 2 días', color: 'blue' },
      { name: 'Pedro Alcazar', id: '99.111.222', age: 45, doctor: 'Dr. Smith', proc: 'Osteosíntesis Fémur', tag: 'Orto', tagColor: 'purple', status: 'Falta Proveedor', color: 'blue' },
    ]
  },
  {
    id: 'no-preop',
    title: 'Sin Pre-quirúrgico',
    count: 2,
    color: 'bg-red-400',
    items: [
      { name: 'Jorge Ramirez', id: '44.555.666', age: 71, doctor: 'Dr. Garcia', proc: 'Eval Cardio', status: 'Falta ECG', time: 'Hoy', color: 'blue' },
      { name: 'Lucia Mendez', id: '55.444.333', age: 28, doctor: 'Dr. Fernandez', proc: 'Colecistectomía', status: 'Anestesia Pendiente', color: 'blue' },
    ]
  },
  {
    id: 'ready-nodate',
    title: 'Listo para Cirugía - Sin fecha',
    count: 3,
    color: 'bg-emerald-500',
    items: [
      { name: 'Carlos Ruiz', id: '11.223.344', age: 29, doctor: 'Dr. Garcia', proc: 'Apendicectomía', done: true, color: 'blue' },
      { name: 'Elena Vazquez', id: '99.888.777', age: 41, doctor: 'Dra. Lopez', proc: 'Reparación LCA', done: true, color: 'blue' },
      { name: 'Luis Torres', id: '87.654.321', age: 45, doctor: 'Dr. Fernandez', proc: 'Chequeo General', done: true, color: 'blue' },
    ]
  }
];

const INITIAL_RULES: AutomationRule[] = [
    { id: 'r1', name: 'Mover a Sin Material (Orto)', triggerField: 'tag', triggerValue: 'Orto', targetColumnId: 'no-material', isActive: true },
    { id: 'r2', name: 'Mover Finalizados a Listo', triggerField: 'done', triggerValue: 'true', targetColumnId: 'ready-nodate', isActive: true }
];

const Kanban: React.FC = () => {
  const navigate = useNavigate();
  const [columns, setColumns] = useState<KanbanColumn[]>(INITIAL_COLUMNS);
  
  // Rules State
  const [rules, setRules] = useState<AutomationRule[]>(INITIAL_RULES);
  const [showRulesModal, setShowRulesModal] = useState(false);
  const [isAutomating, setIsAutomating] = useState(false); // For visual feedback

  // New Rule Form State
  const [newRule, setNewRule] = useState<Partial<AutomationRule>>({
      triggerField: 'status',
      isActive: true
  });

  // Rename Columns State
  const [editingColId, setEditingColId] = useState<string | null>(null);
  const [tempTitle, setTempTitle] = useState('');
  const editInputRef = useRef<HTMLInputElement>(null);

  // --- Column Management ---
  useEffect(() => {
    if (editingColId && editInputRef.current) {
        editInputRef.current.focus();
    }
  }, [editingColId]);

  const handleStartEdit = (col: KanbanColumn) => {
      setEditingColId(col.id);
      setTempTitle(col.title);
  };

  const handleSaveTitle = (colId: string) => {
      if (tempTitle.trim() !== '') {
          setColumns(prev => prev.map(col => 
              col.id === colId ? { ...col, title: tempTitle } : col
          ));
      }
      setEditingColId(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent, colId: string) => {
      if (e.key === 'Enter') handleSaveTitle(colId);
      if (e.key === 'Escape') setEditingColId(null);
  };

  const handleAddColumn = () => {
      const newId = `col-${Date.now()}`;
      const newColumn: KanbanColumn = {
          id: newId,
          title: 'Nueva Etapa',
          count: 0,
          color: 'bg-slate-300', 
          items: []
      };
      setColumns([...columns, newColumn]);
      setEditingColId(newId);
      setTempTitle('Nueva Etapa');
  };

  // --- Automation Logic ---
  const runAutomations = () => {
      setIsAutomating(true);
      
      setTimeout(() => {
          let newCols = [...columns];
          let movedCount = 0;

          // Process each rule
          rules.filter(r => r.isActive).forEach(rule => {
              // Iterate all columns to find items that match the rule but are in the WRONG column
              newCols.forEach(sourceCol => {
                  // Skip if this is already the target column
                  if (sourceCol.id === rule.targetColumnId) return;

                  // Find items to move
                  const itemsToMove = sourceCol.items.filter(item => {
                      const itemValue = String(item[rule.triggerField]);
                      // Simple equality check (convert boolean to string for comparison)
                      return itemValue === rule.triggerValue;
                  });

                  if (itemsToMove.length > 0) {
                      movedCount += itemsToMove.length;
                      
                      // 1. Remove from source
                      sourceCol.items = sourceCol.items.filter(item => !itemsToMove.includes(item));
                      sourceCol.count = sourceCol.items.length;

                      // 2. Add to target
                      const targetCol = newCols.find(c => c.id === rule.targetColumnId);
                      if (targetCol) {
                          targetCol.items = [...targetCol.items, ...itemsToMove];
                          targetCol.count = targetCol.items.length;
                      }
                  }
              });
          });

          setColumns(newCols);
          setIsAutomating(false);
          if (movedCount > 0) alert(`Se movieron ${movedCount} tarjetas automáticamente según las reglas.`);
      }, 800); // Fake delay for UX
  };

  const handleAddRule = () => {
      if (newRule.name && newRule.triggerValue && newRule.targetColumnId) {
          setRules([...rules, { ...newRule, id: Date.now().toString() } as AutomationRule]);
          setNewRule({ triggerField: 'status', isActive: true }); // Reset
      }
  };

  const handleDeleteRule = (id: string) => {
      setRules(rules.filter(r => r.id !== id));
  };

  return (
    <div className="flex-1 h-full overflow-hidden flex flex-col bg-background relative">
        <header className="bg-white border-b border-slate-200 px-8 py-5 flex flex-col gap-5 shrink-0 z-10">
            <div className="flex justify-between items-center">
                <div className="flex flex-col">
                    <h1 className="text-slate-900 text-3xl font-bold leading-tight tracking-tight">Tablero de Planificación</h1>
                    <p className="text-slate-500 text-base font-normal mt-1">Gestión del flujo de pacientes pre-quirúrgicos</p>
                </div>
                <div className="flex items-center gap-3">
                    <button 
                        onClick={() => setShowRulesModal(true)}
                        className="flex items-center justify-center gap-2 h-10 px-4 bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 rounded-lg text-sm font-bold shadow-sm transition-all"
                    >
                        <span className="material-symbols-outlined text-[20px] text-amber-500">auto_fix</span>
                        <span>Automatizar</span>
                    </button>
                    <button 
                        onClick={runAutomations}
                        disabled={isAutomating}
                        className={`flex items-center justify-center gap-2 h-10 px-4 bg-slate-900 text-white rounded-lg text-sm font-bold shadow-sm transition-all ${isAutomating ? 'opacity-80 cursor-wait' : 'hover:bg-slate-800'}`}
                    >
                        <span className={`material-symbols-outlined text-[20px] ${isAutomating ? 'animate-spin' : ''}`}>
                            {isAutomating ? 'sync' : 'play_arrow'}
                        </span>
                        <span>{isAutomating ? 'Procesando...' : 'Ejecutar Reglas'}</span>
                    </button>
                    <button 
                        onClick={() => navigate('/detail/new')}
                        className="flex items-center justify-center gap-2 h-10 px-5 bg-primary hover:bg-primary-hover text-white rounded-lg text-sm font-bold shadow-sm transition-all ml-2"
                    >
                        <span className="material-symbols-outlined text-[20px]">add</span>
                        <span>Nueva Cirugía</span>
                    </button>
                </div>
            </div>
            {/* Filters */}
            <div className="flex items-center gap-4 flex-wrap">
                 <div className="relative w-full max-w-md">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <span className="material-symbols-outlined text-slate-400">search</span>
                    </div>
                    <input className="block w-full pl-10 pr-3 py-2.5 border-none rounded-lg leading-5 bg-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-primary/50 sm:text-sm" placeholder="Buscar por Doctor, Paciente o ID" type="text"/>
                </div>
                <div className="flex gap-2 items-center overflow-x-auto py-1">
                    <button className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 text-primary border border-primary/20 text-sm font-medium whitespace-nowrap">Todos</button>
                    <button className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 text-sm font-medium whitespace-nowrap">Requiere Orto</button>
                </div>
            </div>
        </header>

        <div className="flex-1 overflow-x-auto overflow-y-hidden p-8">
            <div className="flex h-full gap-6">
                {columns.map(col => (
                    <div key={col.id} className="flex-1 flex flex-col min-w-[320px] max-w-[400px] h-full rounded-xl bg-slate-100 border border-transparent">
                        {/* Column Header */}
                        <div className="p-4 flex items-center justify-between sticky top-0 bg-slate-100 rounded-t-xl z-10 group/header">
                            <div className="flex items-center gap-2 flex-1">
                                <div className={`size-2 rounded-full ${col.color}`}></div>
                                
                                {editingColId === col.id ? (
                                    <input 
                                        ref={editInputRef}
                                        value={tempTitle}
                                        onChange={(e) => setTempTitle(e.target.value)}
                                        onBlur={() => handleSaveTitle(col.id)}
                                        onKeyDown={(e) => handleKeyDown(e, col.id)}
                                        className="font-semibold text-slate-900 bg-white px-2 py-1 rounded border border-primary outline-none w-full shadow-sm text-sm"
                                    />
                                ) : (
                                    <>
                                        <h3 className="font-semibold text-slate-900">{col.title}</h3>
                                        <span className="bg-white px-2 py-0.5 rounded-full text-xs font-medium text-slate-500">{col.items.length}</span>
                                        <button 
                                            onClick={() => handleStartEdit(col)}
                                            className="opacity-0 group-hover/header:opacity-100 text-slate-400 hover:text-primary transition-all ml-1 p-1 rounded hover:bg-slate-200"
                                            title="Renombrar columna"
                                        >
                                            <span className="material-symbols-outlined text-sm">edit</span>
                                        </button>
                                    </>
                                )}
                            </div>
                            <button className="text-slate-400 hover:text-primary transition-colors">
                                <span className="material-symbols-outlined text-xl">more_horiz</span>
                            </button>
                        </div>

                        {/* Column Content */}
                        <div className="flex-1 overflow-y-auto px-3 pb-3 flex flex-col gap-3">
                            {col.items.map((item, idx) => (
                                <div 
                                    key={idx} 
                                    onClick={() => navigate(`/detail/${item.id}`)}
                                    className={`bg-white p-4 rounded-lg shadow-sm border border-slate-200 cursor-pointer hover:shadow-md hover:border-primary/50 hover:bg-blue-50/10 transition-all group ${item.done ? 'opacity-60' : ''} ${col.id === 'ready-nodate' ? 'border-l-4 border-l-emerald-500' : ''} ${col.id === 'no-material' ? 'border-l-4 border-l-orange-400' : ''} ${col.id === 'no-preop' ? 'border-l-4 border-l-red-400' : ''}`}
                                >
                                    <div className="flex justify-between items-start mb-2">
                                        <div>
                                            <h4 className="font-semibold text-slate-900 text-sm group-hover:text-primary transition-colors">{item.name}</h4>
                                            <p className="text-xs text-slate-500">ID: {item.id}</p>
                                        </div>
                                        <div className="bg-blue-50 text-blue-700 text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wide">{item.age} Años</div>
                                    </div>
                                    <div className="flex flex-col gap-2 mt-3">
                                        <div className="flex items-center gap-2 text-xs text-slate-500">
                                            <span className="material-symbols-outlined text-sm">person</span>
                                            <span>{item.doctor}</span>
                                        </div>
                                         <div className="flex items-center gap-2 text-xs text-slate-500">
                                            <span className="material-symbols-outlined text-sm">clinical_notes</span>
                                            <span>{item.proc}</span>
                                        </div>
                                        {item.tag && (
                                            <div className="flex gap-2 mt-1">
                                                <span className={`bg-${item.tagColor}-100 text-${item.tagColor}-700 text-[10px] font-medium px-2 py-0.5 rounded flex items-center gap-1`}>
                                                    <span className="material-symbols-outlined text-[10px]">medical_services</span> {item.tag}
                                                </span>
                                            </div>
                                        )}
                                        {(item.status || item.date) && (
                                             <div className="mt-2 pt-2 border-t border-slate-100 flex justify-between items-center">
                                                {item.status && (
                                                    <span className={`text-[10px] font-medium flex items-center gap-1 ${col.id === 'no-material' ? 'text-orange-600' : col.id === 'no-preop' ? 'text-red-600' : 'text-blue-600'}`}>
                                                        <span className="material-symbols-outlined text-[12px]">{col.id.includes('no-') ? 'warning' : 'assignment'}</span> {item.status}
                                                    </span>
                                                )}
                                                {item.date && (
                                                     <span className="text-[10px] font-medium flex items-center gap-1 text-slate-600">
                                                        <span className="material-symbols-outlined text-[12px]">event</span> {item.date}
                                                    </span>
                                                )}
                                                {item.time && <span className="text-[10px] text-slate-400">{item.time}</span>}
                                            </div>
                                        )}
                                         {item.done && (
                                             <div className="mt-1">
                                                  <span className="bg-emerald-50 text-emerald-600 text-[10px] font-medium px-2 py-0.5 rounded inline-flex items-center gap-1">
                                                    <span className="material-symbols-outlined text-[10px]">check</span> Listo
                                                  </span>
                                             </div>
                                         )}
                                    </div>
                                </div>
                            ))}
                            {col.id === 'todo' && (
                                <button className="w-full py-2 flex items-center justify-center gap-2 text-slate-500 hover:text-primary hover:bg-white rounded-lg transition-all text-sm font-medium border border-dashed border-slate-300">
                                    <span className="material-symbols-outlined text-lg">add</span> Añadir
                                </button>
                            )}
                        </div>
                    </div>
                ))}
                
                {/* Add Column Button */}
                <div className="min-w-[320px] max-w-[320px] h-full rounded-xl border-2 border-dashed border-slate-300 flex flex-col items-center justify-center text-slate-400 hover:border-primary hover:text-primary hover:bg-slate-50/50 transition-all cursor-pointer" onClick={handleAddColumn}>
                     <span className="material-symbols-outlined text-4xl mb-2">view_column</span>
                     <span className="font-bold text-sm">Añadir Columna</span>
                </div>
                
                <div className="w-4"></div>
            </div>
        </div>

        {/* Automation Rules Modal */}
        {showRulesModal && (
             <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4 animate-fadeIn">
                <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[90vh]">
                    <div className="p-6 border-b border-slate-200 flex justify-between items-center bg-slate-50 rounded-t-xl">
                        <div>
                             <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                                <span className="material-symbols-outlined text-amber-500">auto_fix</span>
                                Reglas de Automatización
                            </h3>
                             <p className="text-sm text-slate-500">Defina condiciones para mover tarjetas automáticamente.</p>
                        </div>
                        <button onClick={() => setShowRulesModal(false)} className="text-slate-400 hover:text-slate-600">
                            <span className="material-symbols-outlined">close</span>
                        </button>
                    </div>

                    <div className="flex-1 overflow-y-auto p-6">
                        {/* Rules List */}
                        <div className="space-y-3 mb-8">
                             {rules.map(rule => (
                                 <div key={rule.id} className="flex items-center justify-between p-4 bg-white border border-slate-200 rounded-lg shadow-sm">
                                    <div className="flex items-center gap-4">
                                        <div className={`p-2 rounded-full ${rule.isActive ? 'bg-amber-100 text-amber-600' : 'bg-slate-100 text-slate-400'}`}>
                                            <span className="material-symbols-outlined">bolt</span>
                                        </div>
                                        <div>
                                            <h4 className="font-bold text-slate-800 text-sm">{rule.name}</h4>
                                            <p className="text-xs text-slate-500 mt-1 flex items-center gap-2">
                                                <span>Si <strong>{rule.triggerField}</strong> es "<strong>{rule.triggerValue}</strong>"</span>
                                                <span className="material-symbols-outlined text-[10px]">arrow_forward</span>
                                                <span>Mover a <strong>{columns.find(c => c.id === rule.targetColumnId)?.title || rule.targetColumnId}</strong></span>
                                            </p>
                                        </div>
                                    </div>
                                    <button onClick={() => handleDeleteRule(rule.id)} className="text-slate-400 hover:text-red-500 p-2">
                                        <span className="material-symbols-outlined">delete</span>
                                    </button>
                                 </div>
                             ))}
                             {rules.length === 0 && <p className="text-center text-slate-400 italic py-4">No hay reglas configuradas.</p>}
                        </div>

                        {/* Add New Rule */}
                        <div className="bg-slate-50 p-6 rounded-xl border border-slate-200 shadow-inner">
                            <h4 className="text-sm font-bold text-slate-900 uppercase mb-4 flex items-center gap-2">
                                <span className="material-symbols-outlined text-primary">add_circle</span>
                                Crear Nueva Regla
                            </h4>
                            <div className="grid grid-cols-2 gap-5 mb-5">
                                <div className="col-span-2">
                                    <label className="block text-xs font-bold text-slate-700 uppercase mb-1.5">Nombre de la Regla</label>
                                    <input 
                                        type="text" 
                                        placeholder="Ej: Mover Urgencias al principio" 
                                        className="w-full bg-white text-slate-900 border border-slate-300 rounded-lg shadow-sm focus:ring-2 focus:ring-primary focus:border-primary text-sm px-3 py-2.5 placeholder-slate-400 transition-all"
                                        value={newRule.name || ''}
                                        onChange={e => setNewRule({...newRule, name: e.target.value})}
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-700 uppercase mb-1.5">Si el Campo...</label>
                                    <select 
                                        className="w-full bg-white text-slate-900 border border-slate-300 rounded-lg shadow-sm focus:ring-2 focus:ring-primary focus:border-primary text-sm px-3 py-2.5 transition-all"
                                        value={newRule.triggerField}
                                        onChange={e => setNewRule({...newRule, triggerField: e.target.value as any})}
                                    >
                                        <option value="status">Estado (Status)</option>
                                        <option value="done">Finalizado (Done)</option>
                                        <option value="doctor">Doctor</option>
                                        <option value="tag">Etiqueta (Tag)</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-700 uppercase mb-1.5">Es igual a...</label>
                                    <input 
                                        type="text" 
                                        placeholder="Ej: true, Val Cardio, Orto" 
                                        className="w-full bg-white text-slate-900 border border-slate-300 rounded-lg shadow-sm focus:ring-2 focus:ring-primary focus:border-primary text-sm px-3 py-2.5 placeholder-slate-400 transition-all"
                                        value={newRule.triggerValue || ''}
                                        onChange={e => setNewRule({...newRule, triggerValue: e.target.value})}
                                    />
                                </div>
                                <div className="col-span-2">
                                    <label className="block text-xs font-bold text-slate-700 uppercase mb-1.5">Mover a Columna...</label>
                                    <select 
                                        className="w-full bg-white text-slate-900 border border-slate-300 rounded-lg shadow-sm focus:ring-2 focus:ring-primary focus:border-primary text-sm px-3 py-2.5 transition-all"
                                        value={newRule.targetColumnId || ''}
                                        onChange={e => setNewRule({...newRule, targetColumnId: e.target.value})}
                                    >
                                        <option value="">Seleccionar Columna...</option>
                                        {columns.map(c => (
                                            <option key={c.id} value={c.id}>{c.title}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                            <button 
                                onClick={handleAddRule}
                                disabled={!newRule.name || !newRule.targetColumnId || !newRule.triggerValue}
                                className="w-full bg-slate-800 hover:bg-slate-900 text-white rounded-lg py-3 text-sm font-bold shadow-md disabled:opacity-50 transition-all transform active:scale-[0.99]"
                            >
                                Agregar Regla
                            </button>
                        </div>
                    </div>
                    <div className="p-4 border-t border-slate-200 bg-slate-50 rounded-b-xl flex justify-end">
                        <button 
                            onClick={() => setShowRulesModal(false)} 
                            className="px-6 py-2 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-lg font-bold text-sm shadow-sm"
                        >
                            Cerrar
                        </button>
                    </div>
                </div>
             </div>
        )}
    </div>
  );
};

export default Kanban;