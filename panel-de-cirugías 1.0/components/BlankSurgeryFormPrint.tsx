import React from 'react';

interface BlankSurgeryFormPrintProps {
    materialPagesCount?: number;
}

const BlankSurgeryFormPrint: React.FC<BlankSurgeryFormPrintProps> = ({ materialPagesCount = 1 }) => {
    // Page 1 now has NO material rows. 
    // Additional material sheets are now based directly on materialPagesCount
    const rowsExtraPages = Array.from({ length: 30 });
    const additionalPages = Array.from({ length: materialPagesCount });


    const MaterialTable = ({ rows, pageNumber }: { rows: any[], pageNumber: number }) => (
        <div className="mb-4 flex-1">

            <h2 className="text-[10px] font-black text-slate-900 bg-slate-100 px-2 py-1 uppercase tracking-widest mb-3 border-l-4 border-slate-900 flex justify-between items-center">
                <span>Registro de Insumos & Medicación {materialPagesCount > 1 ? `(Hoja ${pageNumber} de ${materialPagesCount})` : ''}</span>
                <span className="text-[8px] font-bold text-slate-500">UTILIZAR LETRA IMPRENTA CLARA</span>
            </h2>
            <table className="w-full border-collapse border border-slate-300">
                <thead className="bg-slate-50">
                    <tr>
                        <th className="border border-slate-300 px-2 py-1 text-[9px] font-black text-slate-500 uppercase text-left">Elemento / Medicamento</th>
                        <th className="border border-slate-300 px-2 py-1 text-[9px] font-black text-slate-500 uppercase text-center w-20">Cantidad</th>
                        <th className="border border-slate-300 px-2 py-1 text-[9px] font-black text-slate-500 uppercase text-center w-24">Unidad</th>
                    </tr>
                </thead>
                <tbody>
                    {rows.map((_, i) => (
                        <tr key={i} className="h-6">
                            <td className="border border-slate-300 px-2"></td>
                            <td className="border border-slate-300 px-2"></td>
                            <td className="border border-slate-300 px-2"></td>
                        </tr>
                    ))}
                </tbody>

            </table>
        </div>
    );

    const Signatures = () => (
        <div className="mt-4 pt-10 flex justify-center avoid-break border-t border-slate-300">
            <div className="w-64 text-center">
                <p className="text-[9px] font-black text-slate-500 uppercase">Firma y Sello Anestesista</p>
                <div className="h-6"></div>
            </div>
        </div>
    );



    return (
        <div className="bg-white font-sans text-slate-900">
            {/* PAGE 1: FULL FORM */}
            <div className="print-page p-8 min-h-screen flex flex-col">
                {/* Header */}

                <div className="border-b-2 border-slate-900 pb-4 mb-6 flex justify-between items-center">
                    <div>
                        <h1 className="text-2xl font-black uppercase tracking-tight">Ficha Técnica de Cirugía</h1>
                        <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mt-1">Hospital / Centro Quirúrgico - Respaldo Manual</p>
                    </div>
                    <div className="text-right">
                        <div className="text-[10px] font-black text-slate-400 uppercase">Versión Form: 2.2</div>
                        <div className="text-xs font-bold px-3 py-1 bg-slate-100 rounded border border-slate-200 mt-1">SST-MOD-042</div>
                    </div>
                </div>

                {/* Patient & General Info Section */}
                <div className="grid grid-cols-2 gap-x-8 gap-y-4 mb-6">
                    <div className="col-span-2 grid grid-cols-4 gap-4">
                        <div className="col-span-2 border-b border-slate-300 pb-1">
                            <label className="block text-[9px] font-black text-slate-400 uppercase">Paciente (Apellido y Nombre)</label>
                            <div className="h-6"></div>
                        </div>
                        <div className="border-b border-slate-300 pb-1">
                            <label className="block text-[9px] font-black text-slate-400 uppercase">Edad</label>
                            <div className="h-6"></div>
                        </div>
                        <div className="border-b border-slate-300 pb-1">
                            <label className="block text-[9px] font-black text-slate-400 uppercase">DNI / HC</label>
                            <div className="h-6"></div>
                        </div>
                    </div>

                    <div className="col-span-2 grid grid-cols-3 gap-4">
                        <div className="col-span-2 border-b border-slate-300 pb-1">
                            <label className="block text-[9px] font-black text-slate-400 uppercase">Obra Social / ART</label>
                            <div className="h-6"></div>
                        </div>
                        <div className="border-b border-slate-300 pb-1">
                            <label className="block text-[9px] font-black text-slate-400 uppercase">Fecha de Cirugía</label>
                            <div className="h-6 text-slate-300 font-mono">____ / ____ / 202__</div>
                        </div>
                    </div>

                    <div className="col-span-2 border-b border-slate-300 pb-1">
                        <label className="block text-[9px] font-black text-slate-400 uppercase">Diagnóstico Pre-Operatorio</label>
                        <div className="h-6"></div>
                    </div>

                    <div className="col-span-2 border-b border-slate-300 pb-1">
                        <label className="block text-[9px] font-black text-slate-400 uppercase">Procedimiento Quirúrgico Efectuado</label>
                        <div className="h-8"></div>
                    </div>
                </div>

                {/* Medical Team Section */}
                <div className="mb-6">
                    <h2 className="text-[10px] font-black text-slate-900 bg-slate-100 px-2 py-1 uppercase tracking-widest mb-3 border-l-4 border-slate-900">Equipo Médico Responsable</h2>
                    <div className="grid grid-cols-2 gap-x-8 gap-y-3">
                        {['Cirujano', 'Anestesista', '1° Ayudante', 'Cardiólogo', '2° Ayudante', 'Instrumentadora'].map(role => (
                            <div key={role} className="border-b border-slate-200 pb-1">
                                <label className="block text-[9px] font-black text-slate-400 uppercase">{role}</label>
                                <div className="h-5"></div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Times & Samples Section */}
                <div className="grid grid-cols-2 gap-8 mb-6">
                    <div>
                        <h2 className="text-[10px] font-black text-slate-900 bg-slate-100 px-2 py-1 uppercase tracking-widest mb-3 border-l-4 border-slate-900">Control de Tiempos</h2>
                        <div className="grid grid-cols-2 gap-4 border border-slate-200 p-3 rounded-lg">
                            {['H.I. Anestesia', 'H.F. Anestesia', 'H.C. Cirugía', 'H.F. Cirugía'].map(label => (
                                <div key={label} className="border-b border-slate-100 pb-1">
                                    <label className={`block text-[8px] font-black uppercase ${label.includes('Anestesia') ? 'text-indigo-500' : 'text-emerald-500'}`}>{label}</label>
                                    <div className="text-sm font-mono text-slate-300">__:__</div>
                                </div>
                            ))}
                        </div>
                    </div>
                    <div>
                        <h2 className="text-[10px] font-black text-slate-900 bg-slate-100 px-2 py-1 uppercase tracking-widest mb-3 border-l-4 border-slate-900">Muestras & Cultivos</h2>
                        <div className="space-y-3 border border-slate-200 p-3 rounded-lg h-[84px]">
                            {['Anatomía Patológica', 'Cultivo'].map(label => (
                                <div key={label} className="flex items-center gap-2 border-b border-slate-100 pb-1">
                                    <div className="size-3 border border-slate-400 rounded-sm"></div>
                                    <label className="text-[9px] font-bold text-slate-600 uppercase">{label}</label>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Spacer to push signatures to the bottom of Page 1 */}
                <div className="flex-1"></div>

                {/* Signatures at the bottom of Page 1 */}
                <Signatures />
            </div>



            {/* ADDITIONAL PAGES */}
            {additionalPages.map((_, index) => (
                <div key={index} className="print-page p-8 min-h-screen flex flex-col">
                    <div className="border-b-2 border-slate-900 pb-2 mb-6 flex justify-between items-center">

                        <div>
                            <h2 className="text-lg font-black uppercase tracking-tight">Ficha Técnica - Registro de Insumos</h2>
                            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Hoja de Insumos {index + 1} de {materialPagesCount}</p>
                        </div>

                        <div className="border border-slate-300 px-4 py-1 rounded flex items-center gap-4">
                             <div className="text-[8px] font-black text-slate-400 uppercase">Paciente:</div>
                             <div className="w-48 border-b border-slate-200 h-4"></div>
                        </div>
                    </div>

                    <MaterialTable rows={rowsExtraPages} pageNumber={index + 1} />
                    <Signatures />
                </div>


            ))}

            <style dangerouslySetInnerHTML={{
                __html: `
                @media print {
                    @page {
                        size: A4 portrait;
                        margin: 0;
                    }
                    body {
                        background: white !important;
                        margin: 0 !important;
                        padding: 0 !important;
                    }
                    .print-page {
                        padding: 15mm !important;
                        width: 210mm !important; 
                        height: 297mm !important; /* Fixed A4 height to prevent overflow */
                        display: flex;
                        flex-direction: column;
                        break-after: page;
                        position: relative;
                        background: white !important;
                        box-sizing: border-box;
                        overflow: hidden; /* Prevent small overflows from triggering extra pages */
                    }
                    .avoid-break {
                        break-inside: avoid;
                    }
                    #root {
                        display: none !important;
                    }
                }
                `
            }} />

        </div>
    );
};

export default BlankSurgeryFormPrint;
