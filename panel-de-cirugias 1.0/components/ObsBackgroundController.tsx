import React, { useEffect, useRef } from 'react';
import OBSWebSocket from 'obs-websocket-js';
import { supabase } from '../src/lib/supabase';

interface ActiveRecordingData {
    patientName: string;
    doctorName: string;
}

export const ObsBackgroundController: React.FC = () => {
    const obsRef = useRef<OBSWebSocket | null>(null);
    const channelRef = useRef<any>(null);
    const activeRecordingRef = useRef<ActiveRecordingData | null>(null);
    const durationIntervalRef = useRef<any>(null);
    const durationRef = useRef<number>(0);
    const recordStateRef = useRef<'stopped' | 'recording' | 'paused'>('stopped');
    const isConnectingRef = useRef<boolean>(false);
    const lastPingOkRef = useRef<boolean>(false);
    const channelRetryTimeoutRef = useRef<any>(null);

    const isElectron = !!(window as any).electronAPI;

    useEffect(() => {
        if (!isElectron) return;

        // Recuperar grabación activa persistida de sesión previa si existía
        try {
            const savedActive = localStorage.getItem('obs_active_recording');
            if (savedActive) {
                activeRecordingRef.current = JSON.parse(savedActive);
            }
        } catch (e) {
            console.error('[OBS Background] Error al leer obs_active_recording:', e);
        }

        let associatedOrId = localStorage.getItem('obs_associated_or_id') || '';
        let ip = localStorage.getItem('obs_ip') || 'localhost';
        let port = localStorage.getItem('obs_port') || '4455';
        let password = localStorage.getItem('obs_password') || '';

        const obs = new OBSWebSocket();
        obsRef.current = obs;

        let isConnected = false;
        let connectInterval: any = null;
        let heartbeatInterval: any = null;
        let syncInterval: any = null;

        const addLog = (message: string) => {
            try {
                const logs = JSON.parse(localStorage.getItem('obs_logs') || '[]');
                const newLog = {
                    time: new Date().toLocaleTimeString(),
                    message
                };
                logs.unshift(newLog);
                if (logs.length > 80) logs.pop();
                localStorage.setItem('obs_logs', JSON.stringify(logs));
                window.dispatchEvent(new Event('storage'));
            } catch (e) {
                console.error('[OBS Background] Error writing to logs:', e);
            }
        };

        const broadcastStatus = (
            state: 'stopped' | 'recording' | 'paused',
            msg?: { text: string; type: 'success' | 'error' | 'info' },
            secs?: number
        ) => {
            const payload = {
                state,
                msg,
                secs: typeof secs === 'number' ? secs : durationRef.current
            };

            // 1. Emisión vía Supabase Realtime a tablets/remoto (solo si el canal está activo)
            if (channelRef.current && channelRef.current.state === 'joined') {
                channelRef.current.send({
                    type: 'broadcast',
                    event: 'status',
                    payload
                }).catch((err: any) => {
                    console.warn('[OBS Background] Error al enviar broadcast por canal:', err);
                });
            }

            // 2. Emisión vía bus local a componentes en la misma ventana de Electron
            window.dispatchEvent(new CustomEvent('obs:status', { detail: payload }));
        };

        const stopDurationTimer = (resetSecs = true) => {
            if (durationIntervalRef.current) {
                clearInterval(durationIntervalRef.current);
                durationIntervalRef.current = null;
            }
            if (resetSecs) {
                durationRef.current = 0;
            }
        };

        const startDurationTimer = (initialSecs: number = 0) => {
            stopDurationTimer(false);
            durationRef.current = initialSecs;

            durationIntervalRef.current = setInterval(() => {
                durationRef.current += 1;
                broadcastStatus('recording', undefined, durationRef.current);
            }, 1000);
        };

        // Función con timeout estricto de 3 segundos para llamadas a OBS WebSocket
        const callObsWithTimeout = async (requestType: any, requestData?: any, timeoutMs = 3000): Promise<any> => {
            return await Promise.race([
                obs.call(requestType, requestData),
                new Promise((_, reject) =>
                    setTimeout(() => reject(new Error(`Timeout de respuesta de OBS (> ${timeoutMs}ms)`)), timeoutMs)
                )
            ]);
        };

        const connectOBS = async () => {
            if (!associatedOrId || isConnectingRef.current) return;
            isConnectingRef.current = true;
            try {
                // Siempre limpiar cualquier temporizador previo antes de conectar o fijar estado
                stopDurationTimer(true);

                const freshIp = localStorage.getItem('obs_ip') || 'localhost';
                const freshPort = localStorage.getItem('obs_port') || '4455';
                const freshPassword = localStorage.getItem('obs_password') || '';

                addLog('Intentando conectar a OBS local (' + freshIp + ':' + freshPort + ')...');
                await obs.connect('ws://' + freshIp + ':' + freshPort, freshPassword || undefined);
                isConnected = true;
                lastPingOkRef.current = true;
                addLog('Conectado a OBS Studio local exitosamente.');

                const statusRes = await callObsWithTimeout('GetRecordStatus', undefined, 3000);
                let initialRecordState: 'stopped' | 'recording' | 'paused' = 'stopped';

                if (statusRes.outputActive) {
                    initialRecordState = statusRes.outputPaused ? 'paused' : 'recording';
                    const initialSecs = Math.round((statusRes.outputDuration || 0) / 1000);
                    recordStateRef.current = initialRecordState;
                    if (initialRecordState === 'recording') {
                        startDurationTimer(initialSecs);
                    } else {
                        durationRef.current = initialSecs;
                    }
                    addLog('Estado inicial de OBS detectado: ' + initialRecordState + ' (' + initialSecs + 's)');
                    broadcastStatus(initialRecordState, { text: 'PC de Quirófano en línea y conectada a OBS', type: 'success' }, initialSecs);
                } else {
                    recordStateRef.current = 'stopped';
                    stopDurationTimer(true);
                    addLog('Estado inicial de OBS detectado: Detenido');
                    broadcastStatus('stopped', { text: 'PC de Quirófano en línea y conectada a OBS', type: 'success' }, 0);
                }
            } catch (err: any) {
                addLog('Error al conectar a OBS local: ' + err.message);
                isConnected = false;
                lastPingOkRef.current = false;
                stopDurationTimer(true);
            } finally {
                isConnectingRef.current = false;
            }
        };

        // Escuchar eventos nativos de desconexión y error de OBS
        obs.on('ConnectionClosed', () => {
            addLog('Conexión con OBS Studio cerrada localmente.');
            isConnected = false;
            lastPingOkRef.current = false;
            stopDurationTimer(true);
            recordStateRef.current = 'stopped';
            broadcastStatus('stopped', { text: 'Conexión con OBS Studio perdida. Reintentando...', type: 'error' }, 0);
        });

        obs.on('ConnectionError', (err) => {
            addLog('Error de conexión de socket OBS: ' + (err.message || String(err)));
            isConnected = false;
            lastPingOkRef.current = false;
            stopDurationTimer(true);
            recordStateRef.current = 'stopped';
            broadcastStatus('stopped', { text: 'Error de conexión con OBS. Reintentando...', type: 'error' }, 0);
        });

        obs.on('RecordStateChanged', async (data) => {
            const stateStr = data.outputState;
            addLog('Evento OBS recibido: RecordStateChanged -> ' + stateStr);

            let newState: 'stopped' | 'recording' | 'paused' = 'stopped';

            if (stateStr === 'OBS_WEBSOCKET_OUTPUT_STARTED' || stateStr === 'OBS_WEBSOCKET_OUTPUT_RESUMED') {
                newState = 'recording';
            } else if (stateStr === 'OBS_WEBSOCKET_OUTPUT_PAUSED') {
                newState = 'paused';
            } else if (stateStr === 'OBS_WEBSOCKET_OUTPUT_STOPPED') {
                newState = 'stopped';
            } else if (stateStr === 'OBS_WEBSOCKET_OUTPUT_STARTING' || stateStr === 'OBS_WEBSOCKET_OUTPUT_STOPPING') {
                return;
            } else {
                newState = data.outputActive ? 'recording' : 'stopped';
            }

            recordStateRef.current = newState;

            if (newState === 'recording') {
                let secs = durationRef.current;
                try {
                    const status = await callObsWithTimeout('GetRecordStatus', undefined, 2000);
                    secs = Math.round((status.outputDuration || 0) / 1000);
                } catch (e) {}
                startDurationTimer(secs);
                addLog('Cronómetro iniciado: ' + secs + ' segundos.');
            } else if (newState === 'paused') {
                stopDurationTimer(false);
                let secs = durationRef.current;
                try {
                    const status = await callObsWithTimeout('GetRecordStatus', undefined, 2000);
                    secs = Math.round((status.outputDuration || 0) / 1000);
                } catch (e) {}
                durationRef.current = secs;
                addLog('Cronómetro pausado en: ' + secs + ' segundos.');
                broadcastStatus('paused', undefined, secs);
            } else {
                stopDurationTimer(true);
                addLog('Cronómetro detenido.');
                broadcastStatus('stopped', undefined, 0);
            }

            if (stateStr === 'OBS_WEBSOCKET_OUTPUT_STOPPED') {
                const globalFolder = localStorage.getItem('obs_global_folder');
                const recordingData = activeRecordingRef.current;

                if (globalFolder && recordingData && data.outputPath) {
                    const { patientName, doctorName } = recordingData;
                    addLog('Renombrando video local: ' + data.outputPath + ' para el paciente: ' + patientName);

                    try {
                        const result = await (window as any).electronAPI.obsRenameVideo(
                            data.outputPath,
                            globalFolder,
                            doctorName,
                            patientName
                        );
                        if (result.success) {
                            addLog('Video guardado y renombrado exitosamente: ' + result.path);
                            broadcastStatus('stopped', {
                                text: 'Video guardado correctamente en la carpeta del médico: ' + doctorName,
                                type: 'success'
                            }, 0);
                        } else {
                            addLog('Error al renombrar video: ' + (result.error || 'Desconocido'));
                            broadcastStatus('stopped', {
                                text: 'Error al renombrar video: ' + (result.error || 'Mueva el archivo manualmente.'),
                                type: 'error'
                            }, 0);
                        }
                    } catch (ipcErr: any) {
                        addLog('Fallo de comunicación IPC al renombrar: ' + ipcErr.message);
                        broadcastStatus('stopped', {
                            text: 'Fallo de comunicación IPC al renombrar: ' + ipcErr.message,
                            type: 'error'
                        }, 0);
                    }
                } else {
                    if (!recordingData) {
                        addLog('Aviso: Grabación de OBS finalizada sin datos de paciente/médico (posiblemente iniciada directo desde OBS). Archivo original: ' + (data.outputPath || 'N/A'));
                    } else if (!globalFolder) {
                        addLog('Aviso: Grabación finalizada pero falta configurar la carpeta global de videos en Ajustes.');
                    }
                }

                // Limpiar siempre la referencia y la persistencia de grabación activa al detenerse
                activeRecordingRef.current = null;
                localStorage.removeItem('obs_active_recording');
            }
        });

        // Búsqueda inteligente de fuentes de texto en OBS
        const updateTextSources = async (patientName: string, doctorName: string) => {
            try {
                const inputsRes = await callObsWithTimeout('GetInputList', undefined, 3000);
                const inputs: Array<{ inputName: string }> = inputsRes?.inputs || [];
                const normalize = (str: string) => str.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();

                // Buscar fuente de paciente: primero exacto "Fuente_Paciente", luego que contenga "paciente"
                let patientInput = inputs.find(i => i.inputName === 'Fuente_Paciente')?.inputName;
                if (!patientInput) {
                    patientInput = inputs.find(i => normalize(i.inputName).includes('paciente'))?.inputName;
                }

                // Buscar fuente de médico: primero exacto "Fuente_Medico", luego que contenga "medico" o "cirujano"
                let doctorInput = inputs.find(i => i.inputName === 'Fuente_Medico')?.inputName;
                if (!doctorInput) {
                    doctorInput = inputs.find(i => {
                        const norm = normalize(i.inputName);
                        return norm.includes('medico') || norm.includes('cirujano');
                    })?.inputName;
                }

                if (patientInput) {
                    await callObsWithTimeout('SetInputSettings', {
                        inputName: patientInput,
                        inputSettings: { text: 'PACIENTE: ' + (patientName || '').toUpperCase() }
                    }, 3000);
                    addLog('Fuente de texto paciente actualizada en: "' + patientInput + '"');
                } else {
                    addLog('Aviso: No se encontró fuente de texto para Paciente en OBS (buscado "Fuente_Paciente" o con "paciente").');
                }

                if (doctorInput) {
                    await callObsWithTimeout('SetInputSettings', {
                        inputName: doctorInput,
                        inputSettings: { text: 'CIRUJANO: ' + (doctorName || '').toUpperCase() }
                    }, 3000);
                    addLog('Fuente de texto médico actualizada en: "' + doctorInput + '"');
                } else {
                    addLog('Aviso: No se encontró fuente de texto para Cirujano/Médico en OBS (buscado "Fuente_Medico" o con "medico"/"cirujano").');
                }
            } catch (textErr: any) {
                addLog('Error al buscar o actualizar fuentes de texto en OBS: ' + (textErr?.message || String(textErr)));
            }
        };

        // Ejecutor centralizado de comandos (tanto de Supabase como de bus local)
        const executeCommand = async (action: string, patientName?: string, doctorName?: string) => {
            if (!isConnected || !obsRef.current || !lastPingOkRef.current) {
                addLog('Comando ignorado: OBS no está conectado o no responde.');
                broadcastStatus(recordStateRef.current, {
                    text: 'Error: La PC de quirófano está en línea pero no está conectada a OBS Studio local.',
                    type: 'error'
                });
                return;
            }

            try {
                if (action === 'START') {
                    const recData: ActiveRecordingData = {
                        patientName: patientName || 'Paciente_No_Especificado',
                        doctorName: doctorName || 'Medico_No_Especificado'
                    };
                    activeRecordingRef.current = recData;
                    localStorage.setItem('obs_active_recording', JSON.stringify(recData));

                    await updateTextSources(recData.patientName, recData.doctorName);

                    await callObsWithTimeout('StartRecord', undefined, 3000);
                    addLog('OBS: Iniciando grabación...');
                    broadcastStatus('recording', { text: 'Grabación iniciada vía control remoto', type: 'success' }, 0);
                } else if (action === 'PAUSE') {
                    await callObsWithTimeout('PauseRecord', undefined, 3000);
                    addLog('OBS: Pausando grabación...');
                    broadcastStatus('paused', { text: 'Grabación pausada vía control remoto', type: 'info' });
                } else if (action === 'RESUME') {
                    await callObsWithTimeout('ResumeRecord', undefined, 3000);
                    addLog('OBS: Reanudando grabación...');
                    broadcastStatus('recording', { text: 'Grabación reanudada vía control remoto', type: 'success' });
                } else if (action === 'STOP') {
                    await callObsWithTimeout('StopRecord', undefined, 3000);
                    addLog('OBS: Deteniendo grabación...');
                } else if (action === 'TAKE_SCREENSHOT') {
                    addLog('OBS: Recibido comando para tomar captura...');
                    const globalFolder = localStorage.getItem('obs_global_folder');
                    if (!globalFolder) {
                        throw new Error('No se ha configurado la carpeta global de destino.');
                    }

                    const sceneRes = await callObsWithTimeout('GetCurrentProgramScene', undefined, 3000);
                    const currentSceneName = sceneRes.currentProgramSceneName || sceneRes.sceneName;

                    const pathResult = await (window as any).electronAPI.obsGetScreenshotPath(
                        globalFolder,
                        doctorName || 'Medico_No_Especificado',
                        patientName || 'Paciente_No_Especificado'
                    );

                    if (!pathResult.success) {
                        throw new Error(pathResult.error || 'No se pudo generar la ruta de la captura.');
                    }

                    await callObsWithTimeout('SaveSourceScreenshot', {
                        sourceName: currentSceneName,
                        imageFormat: 'png',
                        imageFilePath: pathResult.path
                    }, 4000);

                    addLog('Captura guardada en: ' + pathResult.path);
                    broadcastStatus(recordStateRef.current, {
                        text: 'Captura de pantalla guardada correctamente en la carpeta del médico.',
                        type: 'success'
                    });
                }
            } catch (err: any) {
                addLog('Error al ejecutar comando en OBS (' + action + '): ' + err.message);
                broadcastStatus(recordStateRef.current, {
                    text: 'Error al controlar OBS: ' + err.message,
                    type: 'error'
                });
            }
        };

        // Escucha del bus local de Electron (CustomEvent 'obs:command')
        const handleLocalCommand = (e: any) => {
            const { action, patientName, doctorName } = e.detail || {};
            if (action) {
                addLog('Comando recibido vía bus local: ' + action + ' (Paciente: ' + patientName + ')');
                executeCommand(action, patientName, doctorName);
            }
        };
        window.addEventListener('obs:command', handleLocalCommand as EventListener);

        // Suscripción al canal de Supabase Realtime
        const setupChannel = (roomId: string) => {
            if (channelRetryTimeoutRef.current) {
                clearTimeout(channelRetryTimeoutRef.current);
                channelRetryTimeoutRef.current = null;
            }

            if (channelRef.current) {
                try {
                    supabase.removeChannel(channelRef.current);
                } catch (e) {}
                channelRef.current = null;
            }

            addLog('Suscribiendo canal de control remoto Supabase para sala ID: ' + roomId);
            const channel = supabase.channel('obs_control_room_' + roomId);
            channelRef.current = channel;

            channel
                .on('broadcast', { event: 'command' }, (payload: any) => {
                    const { action, patientName, doctorName } = payload.payload || {};
                    addLog('Comando Supabase recibido: ' + action + ' (Paciente: ' + patientName + ', Médico: ' + doctorName + ')');
                    executeCommand(action, patientName, doctorName);
                })
                .subscribe((status, err) => {
                    addLog('Estado de canal Supabase [' + roomId + ']: ' + status + (err?.message ? ' - ' + err.message : ''));
                    if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
                        if (!channelRetryTimeoutRef.current) {
                            channelRetryTimeoutRef.current = setTimeout(() => {
                                channelRetryTimeoutRef.current = null;
                                const currentRoom = localStorage.getItem('obs_associated_or_id');
                                if (currentRoom) {
                                    addLog('Reintentando suscripción a canal Supabase tras estado ' + status);
                                    setupChannel(currentRoom);
                                }
                            }, 3000);
                        }
                    }
                });
        };

        if (associatedOrId) {
            setupChannel(associatedOrId);
            connectOBS();
        } else {
            addLog('PC no asociada a ningún quirófano. Bridge inactivo.');
        }

        // Bucle de sincronización con OBS y ping de vida cada 3 segundos (OBS es la fuente de verdad)
        syncInterval = setInterval(async () => {
            if (!isConnected || !obsRef.current) return;

            try {
                const status = await callObsWithTimeout('GetRecordStatus', undefined, 3000);
                lastPingOkRef.current = true;

                let obsState: 'stopped' | 'recording' | 'paused' = 'stopped';
                if (status.outputActive) {
                    obsState = status.outputPaused ? 'paused' : 'recording';
                }
                const obsSecs = Math.round((status.outputDuration || 0) / 1000);

                const stateChanged = recordStateRef.current !== obsState;
                const durationDrift = obsState === 'recording' && Math.abs(durationRef.current - obsSecs) >= 2;

                if (stateChanged || durationDrift) {
                    if (stateChanged) {
                        addLog('Sincronización OBS: discrepancia detectada. Estado local corregido a "' + obsState + '" (OBS: ' + obsSecs + 's)');
                    }
                    recordStateRef.current = obsState;
                    durationRef.current = obsSecs;

                    if (obsState === 'recording') {
                        if (!durationIntervalRef.current || durationDrift) {
                            startDurationTimer(obsSecs);
                        }
                    } else if (obsState === 'paused') {
                        stopDurationTimer(false);
                    } else {
                        stopDurationTimer(true);
                    }

                    broadcastStatus(obsState, undefined, obsSecs);
                }
            } catch (pingErr: any) {
                addLog('Ping de OBS falló o tardó >3s: ' + pingErr.message + '. Desconectando para forzar reconexión.');
                isConnected = false;
                lastPingOkRef.current = false;
                try {
                    await obs.disconnect();
                } catch (_) {}
                stopDurationTimer(true);
                recordStateRef.current = 'stopped';
                broadcastStatus('stopped', { text: 'Conexión con OBS congelada o perdida. Reintentando...', type: 'error' }, 0);
            }
        }, 3000);

        // Bucle de chequeo de ajustes locales y Watchdog de canal Supabase (cada 5 segundos)
        connectInterval = setInterval(() => {
            const newIp = localStorage.getItem('obs_ip') || 'localhost';
            const newPort = localStorage.getItem('obs_port') || '4455';
            const newPassword = localStorage.getItem('obs_password') || '';
            const newAssociatedOrId = localStorage.getItem('obs_associated_or_id') || '';

            const settingsChanged = newIp !== ip || newPort !== port || newPassword !== password;
            const roomChanged = newAssociatedOrId !== associatedOrId;

            if (settingsChanged || roomChanged) {
                addLog('Se detectaron cambios en Ajustes locales. Reiniciando bridge...');

                ip = newIp;
                port = newPort;
                password = newPassword;
                associatedOrId = newAssociatedOrId;

                isConnected = false;
                lastPingOkRef.current = false;
                obs.disconnect().catch(() => {});

                if (roomChanged && newAssociatedOrId) {
                    setupChannel(newAssociatedOrId);
                } else if (roomChanged && !newAssociatedOrId) {
                    if (channelRef.current) {
                        supabase.removeChannel(channelRef.current);
                        channelRef.current = null;
                    }
                    addLog('PC desvinculada del quirófano. Canal Supabase cerrado.');
                }

                if (associatedOrId) {
                    connectOBS();
                }
            } else {
                // Reconexión periódica de OBS si se perdió la conexión
                if (!isConnected && associatedOrId && !isConnectingRef.current) {
                    connectOBS();
                }

                // Watchdog del canal Supabase: si no está joined ni joining, resuscribir
                if (associatedOrId) {
                    const chState = channelRef.current?.state;
                    if (!channelRef.current || (chState !== 'joined' && chState !== 'joining')) {
                        addLog('Watchdog canal Supabase: estado no joined (' + (chState || 'nulo') + '). Resuscribiendo...');
                        setupChannel(associatedOrId);
                    }
                }
            }
        }, 5000);

        // Heartbeat periódico (cada 4 segundos) - SOLO si OBS respondió al ping
        heartbeatInterval = setInterval(() => {
            if (isConnected && lastPingOkRef.current) {
                if (channelRef.current && channelRef.current.state === 'joined') {
                    channelRef.current.send({
                        type: 'broadcast',
                        event: 'heartbeat',
                        payload: { online: true }
                    }).catch(() => {});
                }
                // También emitir latido al bus local
                window.dispatchEvent(new CustomEvent('obs:heartbeat', { detail: { online: true } }));
            }
        }, 4000);

        // Manejador de recuperación tras suspensión de la PC o restauración de red
        const handleWakeOrOnline = () => {
            addLog('Evento de reanudación detectado (wake/online). Forzando reconexión inmediata de OBS y canal Supabase...');
            isConnected = false;
            lastPingOkRef.current = false;
            stopDurationTimer(true);
            try {
                obs.disconnect().catch(() => {});
            } catch (_) {}

            const currentRoom = localStorage.getItem('obs_associated_or_id');
            if (currentRoom) {
                setupChannel(currentRoom);
                connectOBS();
            }
        };

        window.addEventListener('online', handleWakeOrOnline);
        if ((window as any).electronAPI?.onPowerResume) {
            (window as any).electronAPI.onPowerResume(handleWakeOrOnline);
        }

        return () => {
            window.removeEventListener('online', handleWakeOrOnline);
            window.removeEventListener('obs:command', handleLocalCommand as EventListener);
            clearInterval(connectInterval);
            clearInterval(heartbeatInterval);
            clearInterval(syncInterval);
            if (channelRetryTimeoutRef.current) clearTimeout(channelRetryTimeoutRef.current);
            stopDurationTimer(true);
            try {
                obs.disconnect().catch(() => {});
            } catch (_) {}
            if (channelRef.current) {
                supabase.removeChannel(channelRef.current);
            }
            channelRef.current = null;
        };
    }, []);

    return null;
};

export default ObsBackgroundController;
