import React from 'react';
import { supabase } from '../../src/lib/supabase';

interface PatientSectionProps {
    isNew: boolean;
    isReadOnly: boolean;
    currentUserRole: string;
    patientInputRef: React.RefObject<HTMLInputElement>;
    patientSearchTerm: string;
    onPatientSearch: (term: string) => void;
    isSearchingPatient: boolean;
    patientSearchResults: any[];
    onSelectPatient: (patient: any) => void;
    patientName: string;
    onPatientNameChange: (value: string) => void;
    nuc: string;
    onNucChange: (value: string) => void;
    medicalRecordNumber: string;
    onMedicalRecordNumberChange: (value: string) => void;
    documentNumber: string;
    onDocumentNumberChange: (value: string) => void;
    birthDate: string;
    onBirthDateChange: (value: string) => void;
    patientAge: number | null;
    phone: string;
    onPhoneChange: (value: string) => void;
    address: string;
    onAddressChange: (value: string) => void;
    province: string;
    onProvinceChange: (value: string) => void;
    locality: string;
    onLocalityChange: (value: string) => void;
    sexo: string;
    onSexoChange: (value: string) => void;
    ARGENTINA_LOCATIONS: Record<string, string[]>;
    medicalCoverage: string;
    onCoverageChange: (value: string) => void;
    availableCoverages: any[];
    selectedVendor: string;
    onVendorChange: (value: string) => void;
    availableVendors: any[];
    requiresProsthesis: boolean;
    onVendorNotification: (e: any, type: string) => void;
    authDate: string;
    onAuthDateChange: (value: string) => void;
    admissionAlert: any;
    preOpExams: boolean;
    onPreOpExamsChange: (value: boolean) => void;
    preOpDate: string;
    onPreOpDateChange: (value: string) => void;
    checkDateValidity: () => boolean;
    surgeryDate: string;
    consentSigned: boolean;
    onConsentSignedChange: (value: boolean) => void;
    saving: boolean;
    surgeryId?: string;
    initialOserStatus?: string | null;
    canEditField?: (fieldId: string) => boolean;
    isAmbulatory?: boolean;
    isAmbulatoryExplicit?: boolean;
    onAmbulatoryChange?: (value: boolean) => void;
}

interface OserButtonsSectionProps {
    currentUserRole: string;
    initialOserStatus?: string | null;
    surgeryId?: string;
    nuc: string;
    patientName: string;
    documentNumber: string;
    address: string;
    sexo: string;
    locality: string;
}

const OserButtonsSection: React.FC<OserButtonsSectionProps> = ({
    currentUserRole,
    initialOserStatus,
    surgeryId,
    nuc,
    patientName,
    documentNumber,
    address,
    sexo,
    locality
}) => {
    const [runningAction, setRunningAction] = React.useState<'ingreso' | 'compromiso' | null>(null);
    const [oserStatus, setOserStatus] = React.useState<string | null>(initialOserStatus || null);

    React.useEffect(() => {
        setOserStatus(initialOserStatus || null);
    }, [initialOserStatus]);

    const canReRun = ['SuperAdmin', 'Direccion'].includes(currentUserRole);

    // Registrar Ingreso (Fase 3)
    const isIngresoDone = oserStatus === 'INGRESO_REGISTRADO' || oserStatus === 'INGRESO_Y_COMPROMISO';
    const isIngresoBtnDisabled = runningAction !== null || !nuc || (isIngresoDone && !canReRun);

    // Firmar Compromiso (Fases 4-6)
    const isCompromisoDone = oserStatus === 'COMPROMISO_FIRMADO' || oserStatus === 'INGRESO_Y_COMPROMISO';
    const isCompromisoBtnDisabled = runningAction !== null || !nuc || (isCompromisoDone && !canReRun);

    const handleIngreso = async () => {
        if (typeof (window as any).electronAPI !== 'undefined') {
            setRunningAction('ingreso');
            try {
                const res = await (window as any).electronAPI.runOserWriterScraper('ingreso', nuc, patientName, documentNumber, address, sexo, locality);
                if (res.success) {
                    const newStatus = oserStatus === 'COMPROMISO_FIRMADO' ? 'INGRESO_Y_COMPROMISO' : 'INGRESO_REGISTRADO';
                    if (surgeryId) {
                        await supabase
                            .from('surgeries')
                            .update({
                                oser_status: newStatus,
                                oser_status_updated_at: new Date().toISOString()
                            })
                            .eq('id', surgeryId);
                    }
                    setOserStatus(newStatus);
                    alert(res.message);
                } else {
                    alert("Error: " + res.error);
                }
            } catch (err: any) {
                alert("Error al ejecutar el bot: " + err.message);
            } finally {
                setRunningAction(null);
            }
        } else {
            alert("La acción requiere ejecutar la aplicación de escritorio.");
        }
    };

    const handleCompromiso = async () => {
        if (typeof (window as any).electronAPI !== 'undefined') {
            setRunningAction('compromiso');
            try {
                const res = await (window as any).electronAPI.runOserWriterScraper('compromiso', nuc, patientName, documentNumber, address, sexo, locality);

                if (res.success) {
                    const newStatus = oserStatus === 'INGRESO_REGISTRADO' ? 'INGRESO_Y_COMPROMISO' : 'COMPROMISO_FIRMADO';
                    if (surgeryId) {
                        await supabase
                            .from('surgeries')
                            .update({
                                oser_status: newStatus,
                                oser_status_updated_at: new Date().toISOString()
                            })
                            .eq('id', surgeryId);
                    }
                    setOserStatus(newStatus);
                    alert(res.message);
                } else {
                    alert("Error: " + res.error);
                }
            } catch (err: any) {
                alert("Error al ejecutar el bot: " + err.message);
            } finally {
                setRunningAction(null);
            }
        } else {
            alert("La acción requiere ejecutar la aplicación de escritorio.");
        }
    };

    return (
        <div className="mt-4 flex flex-col gap-1 w-full border-t border-slate-100 pt-4">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">Acciones OSER (Playwright)</span>
            <div className="flex flex-wrap gap-2">
                {/* Botón Ingreso */}
                <button
                    type="button"
                    onClick={handleIngreso}
                    disabled={isIngresoBtnDisabled}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all shadow-sm active:scale-95 border ${
                        isIngresoDone
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : 'bg-sky-50 text-sky-700 border-sky-200 hover:bg-sky-600 hover:text-white hover:border-sky-600'
                    } disabled:opacity-50 disabled:cursor-not-allowed`}
                    title={isIngresoDone ? "Ingreso ya registrado" : "Registrar ingreso en el portal de OSER"}
                >
                    <span className={`material-symbols-outlined text-base ${runningAction === 'ingreso' ? 'animate-spin' : ''}`}>
                        {runningAction === 'ingreso' ? 'sync' : isIngresoDone ? 'check_circle' : 'login'}
                    </span>
                    {runningAction === 'ingreso' ? 'Ingresando...' : isIngresoDone ? 'Ingreso Registrado' : 'Registrar Ingreso'}
                </button>

                {/* Botón Compromiso */}
                <button
                    type="button"
                    onClick={handleCompromiso}
                    disabled={isCompromisoBtnDisabled}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all shadow-sm active:scale-95 border ${
                        isCompromisoDone
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : 'bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-600 hover:text-white hover:border-indigo-600'
                    } disabled:opacity-50 disabled:cursor-not-allowed`}
                    title={isCompromisoDone ? "Compromiso ya firmado/impreso" : "Imprimir/Firmar compromiso de pago en el portal de OSER"}
                >
                    <span className={`material-symbols-outlined text-base ${runningAction === 'compromiso' ? 'animate-spin' : ''}`}>
                        {runningAction === 'compromiso' ? 'sync' : isCompromisoDone ? 'check_circle' : 'print'}
                    </span>
                    {runningAction === 'compromiso' ? 'Generando...' : isCompromisoDone ? 'Compromiso Impreso' : 'Imprimir Compromiso'}
                </button>
            </div>
        </div>
    );
}


export const PatientSection: React.FC<PatientSectionProps> = ({
    isNew,
    isReadOnly,
    currentUserRole,
    patientInputRef,
    patientSearchTerm,
    onPatientSearch,
    isSearchingPatient,
    patientSearchResults,
    onSelectPatient,
    patientName,
    onPatientNameChange,
    nuc,
    onNucChange,
    medicalRecordNumber,
    onMedicalRecordNumberChange,
    documentNumber,
    onDocumentNumberChange,
    birthDate,
    onBirthDateChange,
    patientAge,
    phone,
    onPhoneChange,
    address,
    onAddressChange,
    province,
    onProvinceChange,
    locality,
    onLocalityChange,
    sexo,
    onSexoChange,
    ARGENTINA_LOCATIONS,
    medicalCoverage,
    onCoverageChange,
    availableCoverages,
    selectedVendor,
    onVendorChange,
    availableVendors,
    requiresProsthesis,
    onVendorNotification,
    authDate,
    onAuthDateChange,
    admissionAlert,
    preOpExams,
    onPreOpExamsChange,
    preOpDate,
    onPreOpDateChange,
    checkDateValidity,
    surgeryDate,
    consentSigned,
    onConsentSignedChange,
    saving,
    surgeryId,
    initialOserStatus,
    canEditField,
    isAmbulatory,
    isAmbulatoryExplicit,
    onAmbulatoryChange
}) => {
    const isCoverageReadOnly = isReadOnly || (canEditField && !canEditField('obra_social')) || currentUserRole === 'Ortopedia';
    const [isOpeningPortal, setIsOpeningPortal] = React.useState(false);

    const handleOpenOserPortal = async () => {
        if (!nuc || isOpeningPortal) return;
        if (typeof (window as any).electronAPI !== 'undefined' && (window as any).electronAPI.openOserPortal) {
            setIsOpeningPortal(true);
            try {
                const res = await (window as any).electronAPI.openOserPortal(nuc);
                if (!res.success) {
                    alert("Error: " + res.error);
                }
            } catch (err: any) {
                alert("Error al abrir el portal de OSER: " + err.message);
            } finally {
                setIsOpeningPortal(false);
            }
        } else {
            alert("Esta acción solo está disponible en la versión de escritorio de la aplicación.");
        }
    };

    return (
        <section className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center">
                <h3 className="text-sm font-bold text-slate-900">Datos del Paciente</h3>
                {isNew && (
                    <span
                        onClick={() => patientInputRef.current?.focus()}
                        className="text-xs font-medium text-primary cursor-pointer hover:underline"
                    >
                        + Crear Paciente
                    </span>
                )}
            </div>
            <div className="p-6">
                {isNew && (
                    <div className="mb-6 relative">
                        <label className="block text-xs font-semibold text-slate-500 mb-2">Buscar Paciente Existente</label>
                        <div className="relative">
                            <span className="material-symbols-outlined absolute left-3 top-2.5 text-slate-400 text-lg">search</span>
                            <input
                                type="text"
                                className="w-full pl-9 pr-4 py-2 rounded border border-slate-300 focus:border-primary focus:ring-1 focus:ring-primary text-sm transition-all outline-none uppercase font-bold"
                                placeholder="Ingrese Nombre, Cédula o Historia Clínica..."
                                value={patientSearchTerm}
                                onChange={(e) => onPatientSearch(e.target.value)}
                                disabled={isReadOnly || currentUserRole === 'Ortopedia'}
                            />
                            {isSearchingPatient && (
                                <div className="absolute right-3 top-2.5">
                                    <div className="size-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin"></div>
                                </div>
                            )}
                        </div>

                        {/* Dropdown de Resultados */}
                        {patientSearchResults.length > 0 && (
                            <div className="absolute z-50 w-full mt-1 bg-white border border-slate-200 rounded-lg shadow-xl max-h-60 overflow-y-auto">
                                {patientSearchResults.map((p) => (
                                    <div
                                        key={p.id}
                                        className="px-4 py-3 hover:bg-slate-50 cursor-pointer border-b border-slate-100 last:border-0"
                                        onClick={() => onSelectPatient(p)}
                                    >
                                        <div className="flex justify-between items-center">
                                            <div>
                                                <p className="text-sm font-bold text-slate-900 uppercase">{p.full_name}</p>
                                                <p className="text-xs text-slate-500">DNI: {p.document_number} | HC: {p.medical_record_number || 'N/A'}</p>
                                            </div>
                                            <span className="material-symbols-outlined text-slate-300">chevron_right</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                        {patientSearchTerm.length > 2 && !isSearchingPatient && patientSearchResults.length === 0 && (
                            <div className="absolute z-50 w-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg px-4 py-3 text-sm text-slate-500 italic">
                                No se encontraron pacientes que coincidan.
                            </div>
                        )}
                    </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
                    <div className="lg:col-span-2">
                        <label className="block text-xs font-semibold text-slate-500 mb-1.5">Nombre Completo</label>
                        <input
                            ref={patientInputRef}
                            className="w-full rounded border border-slate-200 bg-slate-50 text-slate-900 focus:border-primary focus:ring-1 focus:ring-primary text-sm px-3 py-2 uppercase font-bold"
                            type="text"
                            value={patientName}
                            onChange={(e) => onPatientNameChange(e.target.value)}
                            placeholder="Nombre del paciente"
                            disabled={isReadOnly || currentUserRole === 'Ortopedia'}
                        />
                    </div>
                    <div>
                        <div className="flex justify-between items-center mb-1.5">
                            <label className="block text-xs font-semibold text-slate-500">NUC (Carpeta)</label>
                            {nuc && typeof (window as any).electronAPI !== 'undefined' && (
                                <button
                                    type="button"
                                    onClick={handleOpenOserPortal}
                                    disabled={isOpeningPortal}
                                    className={`text-[10px] font-bold flex items-center gap-0.5 hover:underline ${
                                        isOpeningPortal ? 'text-slate-400 cursor-not-allowed' : 'text-sky-600 hover:text-sky-800'
                                    }`}
                                    title="Buscar y abrir en portal OSER"
                                >
                                    {isOpeningPortal ? (
                                        <>
                                            <span className="material-symbols-outlined text-[12px] animate-spin">sync</span>
                                            Buscando...
                                        </>
                                    ) : (
                                        <>
                                            <span className="material-symbols-outlined text-[12px] font-bold">open_in_new</span>
                                            Portal OSER
                                        </>
                                    )}
                                </button>
                            )}
                        </div>
                        <input className="w-full rounded border border-slate-200 bg-slate-50 text-slate-900 focus:border-primary focus:ring-1 focus:ring-primary text-sm px-3 py-2 disabled:bg-slate-100 disabled:text-slate-500" type="number" value={nuc} onChange={(e) => onNucChange(e.target.value)} placeholder="Nº Carpeta" disabled={isReadOnly || currentUserRole === 'Ortopedia'} />
                    </div>
                    <div>
                        <label className="block text-xs font-semibold text-slate-500 mb-1.5">Historia Clínica</label>
                        <input
                            className="w-full rounded border border-slate-200 bg-slate-50 text-slate-900 focus:border-primary focus:ring-1 focus:ring-primary text-sm px-3 py-2"
                            type="text"
                            value={medicalRecordNumber}
                            onChange={(e) => onMedicalRecordNumberChange(e.target.value)}
                            placeholder="Nº HC"
                            disabled={isReadOnly || currentUserRole === 'Ortopedia'}
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-semibold text-slate-500 mb-1.5">DNI</label>
                        <input
                            className="w-full rounded border border-slate-200 bg-slate-50 text-slate-900 focus:border-primary focus:ring-1 focus:ring-primary text-sm px-3 py-2"
                            type="text"
                            value={documentNumber}
                            onChange={(e) => onDocumentNumberChange(e.target.value)}
                            placeholder="Nº Documento"
                            disabled={isReadOnly || currentUserRole === 'Ortopedia'}
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-semibold text-slate-500 mb-1.5">Sexo</label>
                        <select
                            className="w-full rounded border border-slate-200 bg-slate-50 text-slate-900 focus:border-primary focus:ring-1 focus:ring-primary text-sm px-3 py-2 disabled:bg-slate-100 disabled:text-slate-500"
                            value={sexo}
                            onChange={(e) => onSexoChange(e.target.value)}
                            disabled={isReadOnly || currentUserRole === 'Ortopedia'}
                        >
                            <option value="">Seleccione...</option>
                            <option value="M">Masculino</option>
                            <option value="F">Femenino</option>
                        </select>
                    </div>
                    <div>
                        <label className="block text-xs font-semibold text-slate-500 mb-1.5">Fecha Nacimiento</label>
                        <div className="relative">
                            <input
                                className="w-full rounded border border-slate-200 bg-slate-50 text-slate-900 focus:border-primary focus:ring-1 focus:ring-primary text-sm px-3 py-2"
                                type="date"
                                value={birthDate}
                                onChange={(e) => onBirthDateChange(e.target.value)}
                                disabled={isReadOnly || currentUserRole === 'Ortopedia'}
                            />
                        </div>
                    </div>
                    <div>
                        <label className="block text-xs font-semibold text-slate-500 mb-1.5">Edad</label>
                        <input
                            className="w-full rounded border border-slate-200 bg-slate-100 text-slate-500 text-sm font-medium px-3 py-2"
                            readOnly
                            type="text"
                            value={patientAge !== null ? `${patientAge} años` : ''}
                            placeholder="--"
                        />
                    </div>

                    {/* Contact & Location Fields */}
                    <div>
                        <label className="block text-xs font-semibold text-slate-500 mb-1.5">Teléfono</label>
                        <input className="w-full rounded border border-slate-200 bg-slate-50 text-slate-900 focus:border-primary focus:ring-1 focus:ring-primary text-sm px-3 py-2 disabled:bg-slate-100 disabled:text-slate-500" type="tel" value={phone} onChange={(e) => onPhoneChange(e.target.value)} placeholder="Teléfono / Celular" disabled={isReadOnly || currentUserRole === 'Ortopedia'} />
                    </div>
                    <div>
                        <label className="block text-xs font-semibold text-slate-500 mb-1.5">Domicilio</label>
                        <input className="w-full rounded border border-slate-200 bg-slate-50 text-slate-900 focus:border-primary focus:ring-1 focus:ring-primary text-sm px-3 py-2 disabled:bg-slate-100 disabled:text-slate-500" type="text" value={address} onChange={(e) => onAddressChange(e.target.value)} placeholder="Calle, Altura, Piso..." disabled={isReadOnly || currentUserRole === 'Ortopedia'} />
                    </div>

                    <div>
                        <label className="block text-xs font-semibold text-slate-500 mb-1.5">Provincia</label>
                        <div className="relative">
                            <input
                                list="provinces-list"
                                className="w-full rounded border border-slate-200 bg-slate-50 text-slate-900 focus:border-primary focus:ring-1 focus:ring-primary text-sm px-3 py-2"
                                value={province}
                                onChange={(e) => {
                                    onProvinceChange(e.target.value);
                                }}
                                placeholder="Buscar Provincia..."
                                disabled={isReadOnly || currentUserRole === 'Ortopedia'}
                            />
                            <datalist id="provinces-list">
                                {Object.keys(ARGENTINA_LOCATIONS).sort().map(prov => (
                                    <option key={prov} value={prov} />
                                ))}
                            </datalist>
                        </div>
                    </div>
                    <div>
                        <label className="block text-xs font-semibold text-slate-500 mb-1.5">Localidad</label>
                        <div className="relative">
                            <input
                                list={province === 'Entre Ríos' ? 'localities-list' : undefined}
                                className="w-full rounded border border-slate-200 bg-slate-50 text-slate-900 focus:border-primary focus:ring-1 focus:ring-primary text-sm px-3 py-2 disabled:bg-slate-100 disabled:text-slate-400"
                                value={locality}
                                onChange={(e) => onLocalityChange(e.target.value)}
                                disabled={isReadOnly || currentUserRole === 'Tecnico'}
                                placeholder={province === 'Entre Ríos' ? "Buscar Localidad..." : "Ingrese Localidad..."}
                            />
                            {province === 'Entre Ríos' && (
                                <datalist id="localities-list">
                                    {ARGENTINA_LOCATIONS['Entre Ríos']?.sort().map(loc => (
                                        <option key={loc} value={loc} />
                                    ))}
                                </datalist>
                            )}
                        </div>
                    </div>

                    {/* Admin & Logistics Section */}
                    <div className="md:col-span-2 lg:col-span-4 mt-2 p-4 bg-slate-50/50 rounded-lg border border-slate-100 grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="md:col-span-3 flex items-center gap-2 mb-1">
                            <span className="material-symbols-outlined text-slate-400 text-sm">admin_panel_settings</span>
                            <h4 className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Gestión Administrativa</h4>
                        </div>

                        {/* Provider Field */}
                        <div>
                            <div className="flex items-center justify-between mb-1.5 ml-0.5">
                                <label className="block text-[10px] font-bold text-slate-400 uppercase">Prestador (OS / ART)</label>
                                {(currentUserRole?.toLowerCase() === 'oficina art' || currentUserRole?.toLowerCase() === 'art') && (
                                    <span className="text-[10px] font-bold text-red-500 uppercase tracking-tight">* Obligatorio para ART</span>
                                )}
                            </div>
                            <div className="relative group">
                                <select
                                    className={`w-full rounded border text-slate-900 focus:border-primary focus:ring-4 focus:ring-primary/10 text-sm px-3 py-2 appearance-none transition-all outline-none ${
                                        (currentUserRole?.toLowerCase() === 'oficina art' || currentUserRole?.toLowerCase() === 'art') && !medicalCoverage
                                            ? 'border-red-300 bg-red-50/30 ring-1 ring-red-200'
                                            : 'border-slate-200 bg-white'
                                    }`}
                                    value={medicalCoverage}
                                    onChange={(e) => onCoverageChange(e.target.value)}
                                    disabled={isCoverageReadOnly}
                                >
                                    <option value="">Seleccionar Prestador...</option>
                                    {!(currentUserRole?.toLowerCase() === 'oficina art' || currentUserRole?.toLowerCase() === 'art') && (
                                        <optgroup label="Obras Sociales / Prepagas">
                                            {availableCoverages.filter(c => c.type === 'Obra Social' || !c.type).map(cov => (
                                                <option key={cov.id} value={cov.name}>{cov.name}</option>
                                            ))}
                                        </optgroup>
                                    )}
                                    <optgroup label="Aseguradoras (ART)">
                                        {availableCoverages.filter(c => c.type === 'ART').map(cov => (
                                            <option key={cov.id} value={cov.name}>{cov.name}</option>
                                        ))}
                                    </optgroup>
                                </select>
                                <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-primary pointer-events-none text-lg transition-colors">expand_more</span>
                            </div>
                        </div>

                        {/* Vendor Selection */}
                        <div>
                            <div className="flex items-center justify-between mb-1.5 ml-0.5">
                                <label className="block text-[10px] font-bold text-slate-400 uppercase">Ortopedia Asignada</label>
                                {requiresProsthesis && selectedVendor && (
                                    <button
                                        type="button"
                                        onClick={(e) => onVendorNotification(e, 'manual')}
                                        className={`flex items-center gap-1 text-[9px] font-black uppercase tracking-tight px-2 py-0.5 rounded border transition-colors
                                            ${availableVendors.find(v => v.id === selectedVendor)?.notification_method === 'telegram'
                                                ? 'text-sky-600 bg-sky-50 border-sky-100 hover:bg-sky-100'
                                                : 'text-emerald-600 bg-emerald-50 border-emerald-100 hover:bg-emerald-100 animate-pulse'
                                            }`}
                                        title={`Enviar notificación por ${availableVendors.find(v => v.id === selectedVendor)?.notification_method === 'telegram' ? 'Telegram' : 'WhatsApp'} al proveedor`}
                                    >
                                        <span className="material-symbols-outlined text-[14px]">
                                            {availableVendors.find(v => v.id === selectedVendor)?.notification_method === 'telegram' ? 'send' : 'chat'}
                                        </span>
                                        Notificar {availableVendors.find(v => v.id === selectedVendor)?.notification_method === 'telegram' ? 'Telegram' : 'WhatsApp'}
                                    </button>
                                )}
                            </div>
                            <div className="relative group">
                                <select
                                    className="w-full rounded border border-slate-200 bg-white text-slate-900 focus:border-primary focus:ring-4 focus:ring-primary/10 text-sm px-3 py-2 appearance-none transition-all outline-none"
                                    value={selectedVendor}
                                    onChange={(e) => onVendorChange(e.target.value)}
                                    disabled={isReadOnly || currentUserRole === 'Ortopedia'}
                                >
                                    <option value="">Seleccionar Proveedor...</option>
                                    {availableVendors.map(v => (
                                        <option key={v.id} value={v.id}>{v.name}</option>
                                    ))}
                                </select>
                                <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-primary pointer-events-none text-lg transition-colors">domain</span>
                            </div>
                        </div>

                        {/* Authorization Date Field */}
                        <div>
                            <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1.5 ml-0.5">Fecha Autorización</label>
                            <div className="relative group">
                                <input
                                    className="w-full rounded border border-slate-200 bg-white text-slate-900 focus:border-primary focus:ring-4 focus:ring-primary/10 text-sm px-3 py-2 transition-all outline-none"
                                    type="date"
                                    value={authDate}
                                    onChange={(e) => onAuthDateChange(e.target.value)}
                                    disabled={isReadOnly || currentUserRole === 'Ortopedia'}
                                />
                            </div>
                        </div>
                    </div>

                    <div className="lg:col-span-2 flex flex-col justify-end pb-1">

                        {/* ADMISSION ALERT (Specific to Internacion) */}
                        {admissionAlert && (
                            <div className={`mb-3 p-3 rounded-md flex items-start gap-2 text-xs font-bold border animate-pulse ${admissionAlert.level === 'critical'
                                ? 'bg-slate-900 text-red-400 border-red-500 shadow-lg'
                                : 'bg-red-50 text-red-700 border-red-200'
                                }`}>
                                <span className="material-symbols-outlined text-base">
                                    {admissionAlert.level === 'critical' ? 'cancel_schedule_send' : 'notification_important'}
                                </span>
                                <p>{admissionAlert.message}</p>
                            </div>
                        )}

                        {/* Switch Cirugía Ambulatoria */}
                        {onAmbulatoryChange && (
                            <div className="mb-3 p-3 bg-purple-50/60 border border-purple-200/60 rounded-xl flex items-center justify-between gap-3">
                                <div>
                                    <span className="text-xs font-extrabold text-purple-950 uppercase block">Modalidad Ambulatoria</span>
                                    <span className="text-[10px] text-purple-700 font-medium leading-tight block">
                                        Exime exámenes prequirúrgicos, consentimiento y asignación de cama/ART.
                                    </span>
                                </div>
                                <label className="relative inline-flex items-center cursor-pointer shrink-0">
                                    <input
                                        type="checkbox"
                                        className="sr-only peer"
                                        checked={!!isAmbulatoryExplicit}
                                        onChange={(e) => onAmbulatoryChange(e.target.checked)}
                                        disabled={isReadOnly || currentUserRole === 'Ortopedia'}
                                    />
                                    <div className="w-9 h-5 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-purple-600"></div>
                                </label>
                            </div>
                        )}

                        {/* Checkboxes Prequirúrgicos & Consentimiento */}
                        {isAmbulatory ? (
                            <div className="p-3.5 bg-purple-50 border border-purple-200/80 rounded-xl text-xs text-purple-900 font-bold flex items-center gap-2.5 animate-fadeIn">
                                <span className="material-symbols-outlined text-purple-600 text-lg shrink-0">medical_services</span>
                                <div>
                                    <p className="font-extrabold text-purple-950">Procedimiento Ambulatorio</p>
                                    <p className="text-[10px] text-purple-700 font-medium leading-tight">No requiere exámenes pre-quirúrgicos ni firma de consentimiento.</p>
                                </div>
                            </div>
                        ) : (
                            <>
                                {/* Custom Checkbox for Pre-op Exams */}
                                <label className="flex items-center gap-2 cursor-pointer mb-3 group select-none">
                                    <div className="relative">
                                        <input
                                            type="checkbox"
                                            className="peer sr-only"
                                            checked={preOpExams}
                                            onChange={(e) => onPreOpExamsChange(e.target.checked)}
                                            disabled={isReadOnly || currentUserRole === 'Ortopedia'}
                                        />
                                        <div className="size-5 bg-white border-2 border-slate-300 rounded peer-checked:border-primary peer-focus:ring-2 peer-focus:ring-primary/20 transition-all flex items-center justify-center peer-checked:[&_span]:opacity-100 peer-checked:[&_span]:scale-100">
                                            <span className="material-symbols-outlined text-base text-primary opacity-0 transform scale-50 transition-all font-bold">check</span>
                                        </div>
                                    </div>
                                    <span className="text-sm font-medium text-slate-700 group-hover:text-slate-900">Exámenes pre-quirúrgicos</span>
                                </label>

                                {preOpExams && (
                                    <div className="pl-7 mb-3 animate-fadeIn">
                                        <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Fecha Realización</label>
                                        <div className="relative max-w-[200px]">
                                            <input
                                                type="date"
                                                value={preOpDate}
                                                onChange={(e) => onPreOpDateChange(e.target.value)}
                                                className="w-full rounded border border-slate-200 bg-white text-slate-900 focus:border-primary focus:ring-1 focus:ring-primary text-xs px-2 py-1.5"
                                                disabled={isReadOnly || currentUserRole === 'Ortopedia'}
                                            />
                                        </div>
                                        {!checkDateValidity() && preOpDate && surgeryDate && (
                                            <p className="text-[10px] text-red-500 mt-1 font-medium">⚠️ Revise la vigencia (&lt;30 días).</p>
                                        )}
                                    </div>
                                )}

                                {/* Custom Checkbox for Consent */}
                                <label className="flex items-center gap-2 cursor-pointer group select-none">
                                    <div className="relative">
                                        <input
                                            type="checkbox"
                                            className="peer sr-only"
                                            checked={consentSigned}
                                            onChange={(e) => onConsentSignedChange(e.target.checked)}
                                            disabled={isReadOnly || currentUserRole === 'Ortopedia'}
                                        />
                                        <div className="size-5 bg-white border-2 border-slate-300 rounded peer-checked:border-primary peer-focus:ring-2 peer-focus:ring-primary/20 transition-all flex items-center justify-center peer-checked:[&_span]:opacity-100 peer-checked:[&_span]:scale-100">
                                            <span className="material-symbols-outlined text-base text-primary opacity-0 transform scale-50 transition-all font-bold">check</span>
                                        </div>
                                    </div>
                                    <span className="text-sm font-medium text-slate-700 group-hover:text-slate-900">Firma de consentimiento</span>
                                </label>
                            </>
                        )}

                        {/* Botones de OSER para roles autorizados */}
                        {medicalCoverage?.toUpperCase().includes('OSER') &&
                            ['SuperAdmin', 'Direccion', 'Internacion', 'Administrativo de Guardias'].includes(currentUserRole) && (
                                <OserButtonsSection
                                    currentUserRole={currentUserRole}
                                    initialOserStatus={initialOserStatus}
                                    surgeryId={surgeryId}
                                    nuc={nuc}
                                    patientName={patientName}
                                    documentNumber={documentNumber}
                                    address={address}
                                    sexo={sexo}
                                    locality={locality}
                                />
                            )
                        }
                    </div>
                </div>
            </div>
        </section>
    );
};
