import React, { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { NomencladorItem } from '../../types';

interface NomencladorTabProps {
    nomencladorItems: NomencladorItem[];
    searchNomenclador: string;
    setSearchNomenclador: (val: string) => void;
    nomencladorFilterType: 'ALL' | 'AOTER' | 'OSER' | 'NN';
    setNomencladorFilterType: (val: 'ALL' | 'AOTER' | 'OSER' | 'NN') => void;
    openNewNomencladorModal: (defaultType?: 'AOTER' | 'OSER' | 'NN') => void;
    openEditNomencladorModal: (item: NomencladorItem) => void;
    handleDeleteNomenclador: (id: string) => void;
    handleToggleNomencladorActive: (item: NomencladorItem) => void;
    isLoading?: boolean;
    isSuperAdmin?: boolean;
}

const NomencladorTab: React.FC<NomencladorTabProps> = ({
    nomencladorItems,
    searchNomenclador,
    setSearchNomenclador,
    nomencladorFilterType,
    setNomencladorFilterType,
    openNewNomencladorModal,
    openEditNomencladorModal,
    handleDeleteNomenclador,
    handleToggleNomencladorActive,
    isLoading = false,
    isSuperAdmin = false
}) => {
    const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState<number>(50);

    // Contadores
    const countAOTER = useMemo(() => nomencladorItems.filter(i => i.type === 'AOTER').length, [nomencladorItems]);
    const countOSER = useMemo(() => nomencladorItems.filter(i => i.type === 'OSER').length, [nomencladorItems]);
    const countNN = useMemo(() => nomencladorItems.filter(i => i.type === 'NN').length, [nomencladorItems]);
    const countTotal = nomencladorItems.length;

    // Filtrado
    const filteredItems = useMemo(() => {
        const query = searchNomenclador.trim().toLowerCase();
        return nomencladorItems.filter(item => {
            // Filtro por Nomenclador
            if (nomencladorFilterType !== 'ALL' && item.type !== nomencladorFilterType) {
                return false;
            }
            // Filtro por estado
            if (statusFilter === 'ACTIVE' && item.active === false) return false;
            if (statusFilter === 'INACTIVE' && item.active !== false) return false;

            // Filtro por texto de búsqueda (código o descripción)
            if (query) {
                const matchCode = item.code.toLowerCase().includes(query);
                const matchDesc = item.description.toLowerCase().includes(query);
                if (!matchCode && !matchDesc) return false;
            }

            return true;
        });
    }, [nomencladorItems, nomencladorFilterType, statusFilter, searchNomenclador]);

    // Resetear a página 1 si cambian los filtros
    React.useEffect(() => {
        setCurrentPage(1);
    }, [searchNomenclador, nomencladorFilterType, statusFilter, pageSize]);

    // Paginación
    const totalPages = pageSize === -1 ? 1 : Math.ceil(filteredItems.length / pageSize) || 1;
    const paginatedItems = useMemo(() => {
        if (pageSize === -1) return filteredItems;
        const startIndex = (currentPage - 1) * pageSize;
        return filteredItems.slice(startIndex, startIndex + pageSize);
    }, [filteredItems, currentPage, pageSize]);

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex-1 overflow-y-auto p-4 md:p-8"
        >
            <div className="max-w-7xl mx-auto space-y-6">
                {/* Header & Stats */}
                <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
                    <div>
                        <div className="flex items-center gap-3">
                            <div className="size-11 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center text-white shadow-lg shadow-blue-200">
                                <span className="material-symbols-outlined text-2xl">clinical_notes</span>
                            </div>
                            <div>
                                <div className="flex items-center gap-2">
                                    <h2 className="text-2xl font-black text-slate-800 tracking-tight">
                                        Catálogo de Nomencladores
                                    </h2>
                                    {!isSuperAdmin && (
                                        <span className="bg-amber-100 text-amber-800 text-[10px] font-black px-2.5 py-0.5 rounded-full uppercase tracking-wider border border-amber-200 flex items-center gap-1">
                                            <span className="material-symbols-outlined text-xs">lock</span>
                                            Solo Lectura
                                        </span>
                                    )}
                                </div>
                                <p className="text-slate-500 text-xs md:text-sm font-medium">
                                    Catálogo oficial de prácticas y códigos de los nomencladores AOTER, OSER y NN (Nomenclador Nacional).
                                </p>
                            </div>
                        </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                        {isSuperAdmin ? (
                            <button
                                onClick={() => openNewNomencladorModal()}
                                className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl text-sm font-bold flex items-center gap-2 shadow-lg shadow-blue-200 transition-all active:scale-95"
                            >
                                <span className="material-symbols-outlined text-lg">add_circle</span>
                                Nueva Práctica
                            </button>
                        ) : (
                            <div className="text-xs text-slate-400 font-medium flex items-center gap-1.5 bg-slate-100 px-3.5 py-2 rounded-xl border border-slate-200">
                                <span className="material-symbols-outlined text-sm text-slate-400">admin_panel_settings</span>
                                Edición restringida a SuperAdmin
                            </div>
                        )}
                    </div>
                </div>

                {!isSuperAdmin && (
                    <div className="p-4 bg-amber-50/80 border border-amber-200 rounded-2xl flex items-center gap-3 text-amber-900 text-xs font-medium">
                        <span className="material-symbols-outlined text-amber-600 text-xl">info</span>
                        <span>
                            Estás visualizando el catálogo en <strong>modo lectura</strong>. Solamente los usuarios con rol <strong>SuperAdmin</strong> tienen permisos para dar de alta, editar o dar de baja prácticas en los nomencladores.
                        </span>
                    </div>
                )}

                {/* Quick Stats Pills */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div 
                        onClick={() => setNomencladorFilterType('ALL')}
                        className={`p-4 rounded-2xl border transition-all cursor-pointer ${
                            nomencladorFilterType === 'ALL'
                                ? 'bg-white border-blue-500 shadow-md ring-2 ring-blue-500/20'
                                : 'bg-white/80 border-slate-200 hover:bg-white'
                        }`}
                    >
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Total Prácticas</p>
                                <p className="text-2xl font-black text-slate-800 mt-0.5">{countTotal}</p>
                            </div>
                            <span className="material-symbols-outlined text-slate-300 text-3xl">list_alt</span>
                        </div>
                    </div>

                    <div 
                        onClick={() => setNomencladorFilterType('AOTER')}
                        className={`p-4 rounded-2xl border transition-all cursor-pointer ${
                            nomencladorFilterType === 'AOTER'
                                ? 'bg-emerald-50/50 border-emerald-500 shadow-md ring-2 ring-emerald-500/20'
                                : 'bg-white/80 border-slate-200 hover:bg-white'
                        }`}
                    >
                        <div className="flex items-center justify-between">
                            <div>
                                <div className="flex items-center gap-1.5">
                                    <span className="size-2 rounded-full bg-emerald-500"></span>
                                    <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-700">AOTER</p>
                                </div>
                                <p className="text-2xl font-black text-slate-800 mt-0.5">{countAOTER}</p>
                            </div>
                            <span className="material-symbols-outlined text-emerald-300 text-3xl">bookmark</span>
                        </div>
                    </div>

                    <div 
                        onClick={() => setNomencladorFilterType('OSER')}
                        className={`p-4 rounded-2xl border transition-all cursor-pointer ${
                            nomencladorFilterType === 'OSER'
                                ? 'bg-purple-50/50 border-purple-500 shadow-md ring-2 ring-purple-500/20'
                                : 'bg-white/80 border-slate-200 hover:bg-white'
                        }`}
                    >
                        <div className="flex items-center justify-between">
                            <div>
                                <div className="flex items-center gap-1.5">
                                    <span className="size-2 rounded-full bg-purple-500"></span>
                                    <p className="text-[11px] font-bold uppercase tracking-wider text-purple-700">OSER</p>
                                </div>
                                <p className="text-2xl font-black text-slate-800 mt-0.5">{countOSER}</p>
                            </div>
                            <span className="material-symbols-outlined text-purple-300 text-3xl">verified</span>
                        </div>
                    </div>

                    <div 
                        onClick={() => setNomencladorFilterType('NN')}
                        className={`p-4 rounded-2xl border transition-all cursor-pointer ${
                            nomencladorFilterType === 'NN'
                                ? 'bg-sky-50/50 border-sky-500 shadow-md ring-2 ring-sky-500/20'
                                : 'bg-white/80 border-slate-200 hover:bg-white'
                        }`}
                    >
                        <div className="flex items-center justify-between">
                            <div>
                                <div className="flex items-center gap-1.5">
                                    <span className="size-2 rounded-full bg-sky-500"></span>
                                    <p className="text-[11px] font-bold uppercase tracking-wider text-sky-700">NN (Nacional)</p>
                                </div>
                                <p className="text-2xl font-black text-slate-800 mt-0.5">{countNN}</p>
                            </div>
                            <span className="material-symbols-outlined text-sky-400 text-3xl">local_hospital</span>
                        </div>
                    </div>
                </div>

                {/* Main Card */}
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                    {/* Filter / Search Bar */}
                    <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
                        {/* Search Input */}
                        <div className="relative flex-1">
                            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-lg">
                                search
                            </span>
                            <input
                                type="text"
                                placeholder="Buscar por código (ej. 12.03.05, MS.01) o por nombre de práctica..."
                                value={searchNomenclador}
                                onChange={e => setSearchNomenclador(e.target.value)}
                                className="w-full pl-10 pr-10 py-2.5 rounded-xl border border-slate-200 text-sm font-medium focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
                            />
                            {searchNomenclador && (
                                <button
                                    onClick={() => setSearchNomenclador('')}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 size-6 flex items-center justify-center rounded-full hover:bg-slate-100"
                                >
                                    <span className="material-symbols-outlined text-sm">close</span>
                                </button>
                            )}
                        </div>

                        {/* Filter Tabs & Status */}
                        <div className="flex flex-wrap items-center gap-2">
                            <div className="flex bg-slate-200/70 p-1 rounded-xl">
                                <button
                                    onClick={() => setNomencladorFilterType('ALL')}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                                        nomencladorFilterType === 'ALL'
                                            ? 'bg-white text-slate-800 shadow-sm'
                                            : 'text-slate-600 hover:text-slate-900'
                                    }`}
                                >
                                    Todos
                                </button>
                                <button
                                    onClick={() => setNomencladorFilterType('AOTER')}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                                        nomencladorFilterType === 'AOTER'
                                            ? 'bg-emerald-600 text-white shadow-sm'
                                            : 'text-slate-600 hover:text-emerald-700'
                                    }`}
                                >
                                    AOTER
                                </button>
                                <button
                                    onClick={() => setNomencladorFilterType('OSER')}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                                        nomencladorFilterType === 'OSER'
                                            ? 'bg-purple-600 text-white shadow-sm'
                                            : 'text-slate-600 hover:text-purple-700'
                                    }`}
                                >
                                    OSER
                                </button>
                                <button
                                    onClick={() => setNomencladorFilterType('NN')}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                                        nomencladorFilterType === 'NN'
                                            ? 'bg-sky-600 text-white shadow-sm'
                                            : 'text-slate-600 hover:text-sky-700'
                                    }`}
                                >
                                    NN (Nacional)
                                </button>
                            </div>

                            <select
                                value={statusFilter}
                                onChange={e => setStatusFilter(e.target.value as any)}
                                className="px-3 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 bg-white focus:ring-2 focus:ring-blue-500"
                            >
                                <option value="ALL">Todos los Estados</option>
                                <option value="ACTIVE">Solo Habilitadas</option>
                                <option value="INACTIVE">Solo Deshabilitadas</option>
                            </select>

                            <select
                                value={pageSize}
                                onChange={e => setPageSize(Number(e.target.value))}
                                className="px-3 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 bg-white focus:ring-2 focus:ring-blue-500"
                            >
                                <option value={25}>25 por pág.</option>
                                <option value={50}>50 por pág.</option>
                                <option value={100}>100 por pág.</option>
                                <option value={200}>200 por pág.</option>
                                <option value={-1}>Ver Todas</option>
                            </select>
                        </div>
                    </div>

                    {/* Table */}
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead className="bg-slate-50 text-slate-400 text-[10px] uppercase font-black tracking-widest border-b border-slate-200">
                                <tr>
                                    <th className="px-6 py-4 w-36">Nomenclador</th>
                                    <th className="px-6 py-4 w-36">Código</th>
                                    <th className="px-6 py-4">Descripción de la Práctica</th>
                                    <th className="px-6 py-4 w-32 text-center">Estado</th>
                                    <th className="px-6 py-4 w-28 text-right">Acciones</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 font-medium text-sm">
                                {paginatedItems.map(item => (
                                    <tr key={item.id || `${item.type}-${item.code}`} className="hover:bg-slate-50/70 transition-colors group">
                                        {/* Nomenclador Badge */}
                                        <td className="px-6 py-3.5">
                                            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold border ${
                                                item.type === 'OSER'
                                                    ? 'bg-purple-50 text-purple-700 border-purple-200'
                                                    : item.type === 'NN'
                                                    ? 'bg-sky-50 text-sky-700 border-sky-200'
                                                    : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                            }`}>
                                                <span className={`size-1.5 rounded-full ${
                                                    item.type === 'OSER'
                                                        ? 'bg-purple-500'
                                                        : item.type === 'NN'
                                                        ? 'bg-sky-500'
                                                        : 'bg-emerald-500'
                                                }`}></span>
                                                {item.type === 'NN' ? 'NN (Nacional)' : item.type}
                                            </span>
                                        </td>

                                        {/* Código */}
                                        <td className="px-6 py-3.5">
                                            <span className="font-mono font-bold text-slate-800 bg-slate-100 px-2.5 py-1 rounded-lg border border-slate-200 text-xs">
                                                {item.code}
                                            </span>
                                        </td>

                                        {/* Descripción */}
                                        <td className="px-6 py-3.5">
                                            <span className="text-slate-700 font-medium">
                                                {item.description}
                                            </span>
                                        </td>

                                        {/* Estado */}
                                        <td className="px-6 py-3.5 text-center">
                                            {isSuperAdmin ? (
                                                <button
                                                    type="button"
                                                    onClick={() => handleToggleNomencladorActive(item)}
                                                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold transition-all cursor-pointer ${
                                                        item.active !== false
                                                            ? 'bg-emerald-100/70 text-emerald-800 hover:bg-emerald-200'
                                                            : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                                                    }`}
                                                    title={item.active !== false ? 'Clic para deshabilitar' : 'Clic para habilitar'}
                                                >
                                                    <span className={`size-1.5 rounded-full ${item.active !== false ? 'bg-emerald-600 animate-pulse' : 'bg-slate-400'}`}></span>
                                                    {item.active !== false ? 'Habilitada' : 'Inactiva'}
                                                </button>
                                            ) : (
                                                <span
                                                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold ${
                                                        item.active !== false
                                                            ? 'bg-emerald-100/70 text-emerald-800'
                                                            : 'bg-slate-100 text-slate-500'
                                                    }`}
                                                >
                                                    <span className={`size-1.5 rounded-full ${item.active !== false ? 'bg-emerald-600' : 'bg-slate-400'}`}></span>
                                                    {item.active !== false ? 'Habilitada' : 'Inactiva'}
                                                </span>
                                            )}
                                        </td>

                                        {/* Acciones */}
                                        <td className="px-6 py-3.5 text-right">
                                            {isSuperAdmin ? (
                                                <div className="flex justify-end gap-1.5 opacity-90 group-hover:opacity-100 transition-opacity">
                                                    <button
                                                        onClick={() => openEditNomencladorModal(item)}
                                                        className="size-8 rounded-lg bg-slate-100 text-slate-500 hover:bg-blue-100 hover:text-blue-600 transition-all flex items-center justify-center"
                                                        title="Editar Práctica"
                                                    >
                                                        <span className="material-symbols-outlined text-base">edit</span>
                                                    </button>
                                                    <button
                                                        onClick={() => item.id && handleDeleteNomenclador(item.id)}
                                                        className="size-8 rounded-lg bg-slate-100 text-slate-500 hover:bg-red-100 hover:text-red-600 transition-all flex items-center justify-center"
                                                        title="Eliminar Práctica"
                                                    >
                                                        <span className="material-symbols-outlined text-base">delete</span>
                                                    </button>
                                                </div>
                                            ) : (
                                                <span className="text-slate-300 text-xs font-medium italic">Solo lectura</span>
                                            )}
                                        </td>
                                    </tr>
                                ))}

                                {paginatedItems.length === 0 && (
                                    <tr>
                                        <td colSpan={5} className="px-6 py-16 text-center">
                                            <div className="max-w-sm mx-auto space-y-3">
                                                <div className="size-14 bg-slate-100 rounded-full flex items-center justify-center mx-auto text-slate-400">
                                                    <span className="material-symbols-outlined text-3xl">search_off</span>
                                                </div>
                                                <p className="text-base font-bold text-slate-700">No se encontraron prácticas</p>
                                                <p className="text-xs text-slate-400">
                                                    {searchNomenclador
                                                        ? `No hay prácticas que coincidan con "${searchNomenclador}" en el filtro seleccionado.`
                                                        : 'No hay prácticas cargadas en este nomenclador.'}
                                                </p>
                                                {searchNomenclador && (
                                                    <button
                                                        onClick={() => setSearchNomenclador('')}
                                                        className="text-xs font-bold text-blue-600 hover:underline inline-block mt-2"
                                                    >
                                                        Limpiar búsqueda
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>

                    {/* Pagination Footer */}
                    {filteredItems.length > 0 && pageSize !== -1 && (
                        <div className="p-4 border-t border-slate-100 bg-slate-50/50 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs font-medium text-slate-500">
                            <div>
                                Mostrando <span className="font-bold text-slate-800">{((currentPage - 1) * pageSize) + 1}</span> a{' '}
                                <span className="font-bold text-slate-800">
                                    {Math.min(currentPage * pageSize, filteredItems.length)}
                                </span>{' '}
                                de <span className="font-bold text-slate-800">{filteredItems.length}</span> prácticas encontradas
                            </div>

                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => setCurrentPage(p => Math.max(p - 1, 1))}
                                    disabled={currentPage === 1}
                                    className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center gap-1"
                                >
                                    <span className="material-symbols-outlined text-sm">chevron_left</span>
                                    Anterior
                                </button>

                                <span className="px-3 py-1.5 font-bold text-slate-700">
                                    Pág. {currentPage} de {totalPages}
                                </span>

                                <button
                                    onClick={() => setCurrentPage(p => Math.min(p + 1, totalPages))}
                                    disabled={currentPage === totalPages}
                                    className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center gap-1"
                                >
                                    Siguiente
                                    <span className="material-symbols-outlined text-sm">chevron_right</span>
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </motion.div>
    );
};

export default NomencladorTab;
