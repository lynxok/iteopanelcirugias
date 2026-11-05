import React, { useEffect, useState, useRef, useCallback } from 'react';
import { checkAccess, LEGACY_PERMISSIONS } from '../../src/lib/permissions';
import { supabase } from '../../src/lib/supabase';

interface ObsRecordingSectionProps {
    patientName: string;
    doctorName: string;
    currentUserRole: string;
    status: string;
    operatingRoomId: string;
}

export const ObsRecordingSection: React.FC<ObsRecordingSectionProps> = ({
    patientName,
    doctorName,
    currentUserRole,
    status,
    operatingRoomId
}) => {
    const [permissions, setPermissions] = useState<any>(LEGACY_PERMISSIONS);
    const [recordState, setRecordState] = useState<'stopped' | 'recording' | 'paused'>('stopped');
    const [duration, setDuration] = useState<number>(0);
    const [outputMessage, setOutputMessage] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);

    const [pcOnline, setPcOnline] = useState<boolean>(false);
    const [lastHeartbeat, setLastHeartbeat] = useState<number | null>(null);
    const [waitingForConfirmation, setWaitingForConfirmation] = useState<boolean>(false);
    const [showTips, setShowTips] = useState<boolean>(false);

    const confirmTimeoutRef = useRef<any>(null);
    const channelRef = useRef<any>(null);
    const reconnectTimeoutRef = useRef<any>(null);

    const isElectron = !!(window as any).electronAPI;

    // Monitor de presencia (Heartbeat checker): >10s sin latido = PC fuera de línea
    useEffect(() => {
        const interval = setInterval(() => {
            if (lastHeartbeat) {
                const elapsed = Date.now() - lastHeartbeat;
                if (elapsed > 10000) {
                    setPcOnline(false);
                }
            } else {
                setPcOnline(false);
            }
        }, 2500);

        return () => clearInterval(interval);
    }, [lastHeartbeat]);

    // Cargar permisos desde DB
    useEffect(() => {
        const fetchPermissions = async () => {
            try {
                const { data, error } = await supabase
                    .from('admin_settings')
                    .select('value')
                    .eq('key', 'role_permissions')
                    .maybeSingle();

                if (!error && data && data.value) {
                    const parsed = JSON.parse(data.value);
                    if (parsed && typeof parsed === 'object') {
                        setPermissions({ ...LEGACY_PERMISSIONS, ...parsed });
                    }
                }
            } catch (err) {
                console.error('[OBS Recording] Error fetching permissions:', err);
            }
        };
        fetchPermissions();
    }, []);

    const hasAccess = currentUserRole === 'SuperAdmin' ||
                      currentUserRole === 'Tecnico' ||
                      checkAccess(permissions, currentUserRole || '', 'obs_recording', 'edit');

    // MODO 1: En Electron (PC de quirófano) -> Hablar por bus de eventos local, NUNCA tocar Supabase Realtime
    useEffect(() => {
        if (!isElectron) return;

        const handleStatus = (e: any) => {
            const { state: rxState, msg, secs } = e.detail || {};
            if (rxState) setRecordState(rxState);
            if (typeof secs === 'number') setDuration(secs);

            setWaitingForConfirmation(false);
            if (confirmTimeoutRef.current) {
                clearTimeout(confirmTimeoutRef.current);
                confirmTimeoutRef.current = null;
            }

            if (msg) {
                setOutputMessage(msg);
                if (msg.type === 'success') {
                    setTimeout(() => setOutputMessage(null), 3000);
                }
            }
        };

        const handleHeartbeat = () => {
            setPcOnline(true);
            setLastHeartbeat(Date.now());
        };

        window.addEventListener('obs:status', handleStatus as EventListener);
        window.addEventListener('obs:heartbeat', handleHeartbeat as EventListener);

        return () => {
            window.removeEventListener('obs:status', handleStatus as EventListener);
            window.removeEventListener('obs:heartbeat', handleHeartbeat as EventListener);
        };
    }, [isElectron]);

    // MODO 2: En Web / Tablet -> Suscripción al canal de Supabase Realtime con auto-reconexión y visibilitychange
    const subscribeWebChannel = useCallback(() => {
        if (isElectron || !operatingRoomId || !hasAccess) return;

        if (reconnectTimeoutRef.current) {
            clearTimeout(reconnectTimeoutRef.current);
            reconnectTimeoutRef.current = null;
        }

        if (channelRef.current) {
            try {
                supabase.removeChannel(channelRef.current);
            } catch (e) {}
            channelRef.current = null;
        }

        console.log(`[OBS Realtime UI] Suscribiéndose al canal Supabase para quirófano: ${operatingRoomId}`);
        const channel = supabase.channel(`obs_control_room_${operatingRoomId}`);
        channelRef.current = channel;

        channel
            .on('broadcast', { event: 'status' }, (payload: any) => {
                const { state: rxState, msg, secs } = payload.payload || {};
                if (rxState) setRecordState(rxState);
                if (typeof secs === 'number') setDuration(secs);

                setWaitingForConfirmation(false);
                if (confirmTimeoutRef.current) {
                    clearTimeout(confirmTimeoutRef.current);
                    confirmTimeoutRef.current = null;
                }

                if (msg) {
                    setOutputMessage(msg);
                    if (msg.type === 'success') {
                        setTimeout(() => setOutputMessage(null), 3000);
                    }
                }
            })
            .on('broadcast', { event: 'heartbeat' }, () => {
                setPcOnline(true);
                setLastHeartbeat(Date.now());
            })
            .subscribe((subStatus, err) => {
                console.log(`[OBS Realtime UI] Canal quirófano ${operatingRoomId}: ${subStatus}`, err || '');
                if (subStatus === 'CHANNEL_ERROR' || subStatus === 'TIMED_OUT' || subStatus === 'CLOSED') {
                    if (!reconnectTimeoutRef.current) {
                        reconnectTimeoutRef.current = setTimeout(() => {
                            reconnectTimeoutRef.current = null;
                            console.log(`[OBS Realtime UI] Reintentando suscripción a canal tras estado: ${subStatus}`);
                            subscribeWebChannel();
                        }, 2500);
                    }
                }
            });
    }, [isElectron, operatingRoomId, hasAccess]);

    useEffect(() => {
        if (isElectron || !operatingRoomId || !hasAccess) return;

        subscribeWebChannel();

        // Al volver el foco a la app / despertar tablet de suspensión, resuscribirse si el canal se cayó
        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') {
                const st = channelRef.current?.state;
                if (!channelRef.current || (st !== 'joined' && st !== 'joining')) {
                    console.log(`[OBS Realtime UI] Tablet reanudada (visibilityState: visible). Resuscribiendo canal...`);
                    subscribeWebChannel();
                }
            }
        };

        const handleOnline = () => {
            console.log(`[OBS Realtime UI] Red restablecida (online). Resuscribiendo canal...`);
            subscribeWebChannel();
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);
        window.addEventListener('online', handleOnline);

        return () => {
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            window.removeEventListener('online', handleOnline);
            if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
            if (channelRef.current) {
                console.log(`[OBS Realtime UI] Desuscribiendo canal quirófano: ${operatingRoomId}`);
                supabase.removeChannel(channelRef.current);
                channelRef.current = null;
            }
        };
    }, [isElectron, operatingRoomId, hasAccess, subscribeWebChannel]);

    useEffect(() => {
        return () => {
            if (confirmTimeoutRef.current) clearTimeout(confirmTimeoutRef.current);
        };
    }, []);

    const sendRemoteCommand = (action: 'START' | 'PAUSE' | 'RESUME' | 'STOP' | 'TAKE_SCREENSHOT') => {
        setWaitingForConfirmation(true);
        setOutputMessage(null);

        if (confirmTimeoutRef.current) clearTimeout(confirmTimeoutRef.current);
        confirmTimeoutRef.current = setTimeout(() => {
            setWaitingForConfirmation(false);
            setOutputMessage({
                text: 'Sin respuesta de la PC de Quirófano. Verifique que la aplicación de escritorio esté abierta y conectada a OBS.',
                type: 'error'
            });
        }, 3500);

        if (isElectron) {
            // Emisión instantánea por bus local en Electron
            window.dispatchEvent(new CustomEvent('obs:command', {
                detail: {
                    action,
                    patientName,
                    doctorName
                }
            }));
        } else if (channelRef.current) {
            // Emisión por Supabase Realtime en Web / Tablet
            console.log(`[OBS Realtime UI] Enviando comando remoto vía canal: ${action}`);
            channelRef.current.send({
                type: 'broadcast',
                event: 'command',
                payload: {
                    action,
                    patientName,
                    doctorName
                }
            }).catch((sendErr: any) => {
                console.warn('[OBS Realtime UI] Error al enviar comando por canal:', sendErr);
            });
        } else {
            console.warn('[OBS Realtime UI] No se pudo enviar el comando: canal nulo y no está en Electron');
        }
    };

    const handleStartRecord = () => sendRemoteCommand('START');
    const handlePauseRecord = () => sendRemoteCommand('PAUSE');
    const handleResumeRecord = () => sendRemoteCommand('RESUME');
    const handleStopRecord = () => sendRemoteCommand('STOP');
    const handleTakeScreenshot = () => sendRemoteCommand('TAKE_SCREENSHOT');

    const formatDuration = (totalSeconds: number) => {
        const hrs = Math.floor(totalSeconds / 3600);
        const mins = Math.floor((totalSeconds % 3600) / 60);
        const secs = totalSeconds % 60;

        const pad = (n: number) => String(n).padStart(2, '0');
        return `${pad(hrs)}:${pad(mins)}:${pad(secs)}`;
    };

    if (!hasAccess) return null;

    if (!operatingRoomId) {
        return (
            <div className="p-4 bg-amber-50 text-amber-800 border border-amber-100 rounded-2xl text-xs font-bold flex items-center gap-2 mb-6">
                <span className="material-symbols-outlined text-lg">warning</span>
                <span>Para habilitar la grabación de OBS, asegúrese de que la cirugía tenga un Quirófano asignado en la pantalla de detalles.</span>
            </div>
        );
    }

    const disableControls = !pcOnline || waitingForConfirmation;

    return (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden mb-6">
            <div className="p-5 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-blue-600">videocam</span>
                    <div>
                        <h4 className="font-bold text-slate-800 text-sm">Grabación de Artroscopía (OBS Studio)</h4>
                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                            Control Remoto Activo {isElectron && '(Bus Local)'}
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full border text-[9px] font-black uppercase tracking-widest ${
                        pcOnline
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
                            : 'bg-red-50 text-red-700 border-red-100 animate-pulse'
                    }`}>
                        <span className="material-symbols-outlined text-xs">
                            {pcOnline ? 'sensors' : 'sensors_off'}
                        </span>
                        {pcOnline ? 'PC EN LÍNEA' : 'PC FUERA DE LÍNEA'}
                    </div>
                </div>
            </div>

            <div className="p-5 space-y-4">
                {outputMessage && (
                    <div className={`p-3 rounded-xl text-xs font-bold border ${
                        outputMessage.type === 'success' ? 'bg-emerald-50 text-emerald-800 border-emerald-100' :
                        outputMessage.type === 'error' ? 'bg-red-50 text-red-800 border-red-100' :
                        'bg-blue-50 text-blue-800 border-blue-100'
                    }`}>
                        {outputMessage.text}
                    </div>
                )}

                {!pcOnline && (
                    <div className="space-y-3">
                        <div className="p-3.5 bg-red-50 text-red-900 border border-red-200/80 rounded-xl text-xs font-bold flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <span className="material-symbols-outlined text-lg text-red-600">sensors_off</span>
                                <span>Los controles remotos están deshabilitados porque no se detecta la app de escritorio de este quirófano activa.</span>
                            </div>
                            <button
                                type="button"
                                onClick={() => setShowTips(!showTips)}
                                className="px-2.5 py-1 bg-red-100 hover:bg-red-200 text-red-800 rounded-lg text-[11px] font-black uppercase tracking-wider transition-colors flex items-center gap-1 shrink-0 ml-2"
                            >
                                <span className="material-symbols-outlined text-sm">help</span>
                                {showTips ? 'Ocultar Tips' : '¿Cómo solucionar?'}
                            </button>
                        </div>

                        {(showTips || outputMessage?.type === 'error') && (
                            <div className="p-4 bg-amber-50/90 border border-amber-200/90 rounded-2xl space-y-3 text-slate-800 text-xs shadow-sm">
                                <div className="flex items-center gap-2 font-bold text-amber-900 border-b border-amber-200/60 pb-2">
                                    <span className="material-symbols-outlined text-amber-600 text-base">lightbulb</span>
                                    <span>Guía rápida para resolver problemas de conexión con la PC de Quirófano:</span>
                                </div>
                                <ul className="space-y-2 text-[11px] text-slate-700 font-medium list-disc list-inside leading-relaxed">
                                    <li>
                                        <strong className="text-slate-900">1. App de Escritorio:</strong> Verifique que la aplicación de escritorio "Panel de Cirugías" esté abierta y ejecutándose en la computadora física del Quirófano.
                                    </li>
                                    <li>
                                        <strong className="text-slate-900">2. OBS Studio:</strong> Asegúrese de que el programa OBS Studio esté abierto en esa misma PC.
                                    </li>
                                    <li>
                                        <strong className="text-slate-900">3. Quirófano Asociado:</strong> En la app de escritorio (PC Quirófano), ingrese a <em>Ajustes → OBS Studio</em> y confirme que el <strong>Quirófano Asociado</strong> coincida exactamente con este Quirófano.
                                    </li>
                                    <li>
                                        <strong className="text-slate-900">4. Servidor WebSocket de OBS:</strong> En OBS Studio, vaya a <em>Herramientas → Ajustes de Servidor WebSocket</em>. Verifique que la casilla "Habilitar servidor WebSocket" esté activa, el puerto sea <code className="bg-amber-100 px-1 rounded text-amber-900 font-bold">4455</code> y la contraseña coincida con los Ajustes de la App.
                                    </li>
                                    <li>
                                        <strong className="text-slate-900">5. Conexión a Red:</strong> Confirme que tanto esta pantalla como la PC del Quirófano tengan conexión activa a internet/red.
                                    </li>
                                </ul>
                            </div>
                        )}
                    </div>
                )}

                <div className="flex items-center gap-3">
                    {!pcOnline ? (
                        <div className="flex items-center gap-2 px-3.5 py-2 bg-slate-100 text-slate-500 rounded-xl border border-slate-200">
                            <span className="w-2 h-2 rounded-full bg-slate-400"></span>
                            <span className="font-mono text-xs font-black tracking-wider uppercase">Estado: Desconocido / Sin conexión</span>
                        </div>
                    ) : (
                        <>
                            {recordState === 'stopped' && (
                                <button
                                    onClick={handleStartRecord}
                                    disabled={disableControls}
                                    className="h-11 px-5 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-black text-xs uppercase tracking-widest rounded-xl transition-all shadow-md shadow-red-100 flex items-center gap-2"
                                >
                                    <span className="material-symbols-outlined text-lg">
                                        {waitingForConfirmation ? 'autorenew' : 'fiber_manual_record'}
                                    </span>
                                    {waitingForConfirmation ? 'Conectando...' : 'Iniciar Grabación'}
                                </button>
                            )}

                            {recordState === 'recording' && (
                                <>
                                    <button
                                        onClick={handlePauseRecord}
                                        disabled={disableControls}
                                        className="h-11 px-5 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white font-black text-xs uppercase tracking-widest rounded-xl transition-all shadow-md shadow-amber-100 flex items-center gap-2"
                                    >
                                        <span className="material-symbols-outlined text-lg">
                                            {waitingForConfirmation ? 'autorenew' : 'pause'}
                                        </span>
                                        {waitingForConfirmation ? 'Enviando...' : 'Pausar'}
                                    </button>
                                    <button
                                        onClick={handleStopRecord}
                                        disabled={disableControls}
                                        className="h-11 px-5 bg-slate-900 hover:bg-black disabled:opacity-50 text-white font-black text-xs uppercase tracking-widest rounded-xl transition-all shadow-md shadow-slate-200 flex items-center gap-2"
                                    >
                                        <span className="material-symbols-outlined text-lg">
                                            {waitingForConfirmation ? 'autorenew' : 'stop'}
                                        </span>
                                        {waitingForConfirmation ? 'Enviando...' : 'Detener y Guardar'}
                                    </button>
                                </>
                            )}

                            {recordState === 'paused' && (
                                <>
                                    <button
                                        onClick={handleResumeRecord}
                                        disabled={disableControls}
                                        className="h-11 px-5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-black text-xs uppercase tracking-widest rounded-xl transition-all shadow-md shadow-emerald-100 flex items-center gap-2"
                                    >
                                        <span className="material-symbols-outlined text-lg">
                                            {waitingForConfirmation ? 'autorenew' : 'play_arrow'}
                                        </span>
                                        {waitingForConfirmation ? 'Enviando...' : 'Reanudar'}
                                    </button>
                                    <button
                                        onClick={handleStopRecord}
                                        disabled={disableControls}
                                        className="h-11 px-5 bg-slate-900 hover:bg-black disabled:opacity-50 text-white font-black text-xs uppercase tracking-widest rounded-xl transition-all shadow-md shadow-slate-200 flex items-center gap-2"
                                    >
                                        <span className="material-symbols-outlined text-lg">
                                            {waitingForConfirmation ? 'autorenew' : 'stop'}
                                        </span>
                                        {waitingForConfirmation ? 'Enviando...' : 'Detener y Guardar'}
                                    </button>
                                </>
                            )}

                            {/* Botón Tomar Foto - Disponible siempre que la PC esté online */}
                            <button
                                onClick={handleTakeScreenshot}
                                disabled={disableControls}
                                className="h-11 px-5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-black text-xs uppercase tracking-widest rounded-xl transition-all shadow-md shadow-blue-100 flex items-center gap-2"
                            >
                                <span className="material-symbols-outlined text-lg">
                                    {waitingForConfirmation ? 'autorenew' : 'photo_camera'}
                                </span>
                                {waitingForConfirmation ? 'Enviando...' : 'Tomar Foto'}
                            </button>

                            {(recordState === 'recording' || recordState === 'paused') && (
                                <div className="flex items-center gap-2 ml-4 px-3.5 py-1.5 bg-slate-100 text-slate-700 rounded-xl border border-slate-200/50">
                                    <span className={`w-2 h-2 rounded-full ${recordState === 'recording' ? 'bg-red-500 animate-ping' : 'bg-amber-500'}`}></span>
                                    <span className="font-mono text-xs font-black tracking-widest">{formatDuration(duration)}</span>
                                </div>
                            )}
                        </>
                    )}

                    <span className="text-xs font-black text-slate-400 uppercase tracking-widest ml-auto">
                        Paciente: {patientName}
                    </span>
                </div>
            </div>
        </div>
    );
};

export default ObsRecordingSection;
