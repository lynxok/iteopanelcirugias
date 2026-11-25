import React, { useEffect, useRef } from 'react';
import { supabase } from '../src/lib/supabase';
import { logGlobalappAudit } from '../src/lib/globalappSync';

/**
 * Background listener that runs only inside the Electron Desktop App.
 * Receives Globalapp synchronization requests sent from Tablets / Web browsers
 * when a surgery is started, finished, or updated in the Technical Form.
 */
export const GlobalappBackgroundController: React.FC = () => {
    const isElectron = !!(window as any).electronAPI?.runGlobalappScraper;
    const processedRequestsRef = useRef<Set<string>>(new Set());
    const isRunningRef = useRef<boolean>(false);

    useEffect(() => {
        if (!isElectron) return;

        const channel = supabase.channel('globalapp-sync-bridge');

        const upsertHeartbeat = async () => {
            try {
                await supabase.from('globalapp_bridge_status').upsert({
                    id: 'default',
                    last_seen: new Date().toISOString(),
                    host_info: navigator.userAgent.slice(0, 120)
                }, { onConflict: 'id' });
            } catch {
                // ignore heartbeat errors
            }
        };

        const processQueue = async () => {
            if (isRunningRef.current) return;
            try {
                const { data: pending } = await supabase
                    .from('globalapp_sync_queue')
                    .select('*')
                    .eq('status', 'pending')
                    .order('created_at', { ascending: true })
                    .limit(5);

                if (!pending || pending.length === 0) return;

                for (const item of pending) {
                    if (isRunningRef.current) break;
                    isRunningRef.current = true;
                    try {
                        await supabase
                            .from('globalapp_sync_queue')
                            .update({ status: 'processing', attempts: (item.attempts || 0) + 1, updated_at: new Date().toISOString() })
                            .eq('id', item.id);

                        const res = await (window as any).electronAPI.runGlobalappScraper(item.payload);
                        await supabase
                            .from('globalapp_sync_queue')
                            .update({
                                status: res?.success ? 'done' : 'error',
                                last_error: res?.success ? null : (res?.error || 'Error desconocido'),
                                updated_at: new Date().toISOString()
                            })
                            .eq('id', item.id);

                        await logGlobalappAudit({
                            surgeryId: item.surgery_id,
                            userName: 'Puente Globalapp (Cola)',
                            auditAction: res?.success ? 'SYNC_GLOBALAPP' : 'SYNC_GLOBALAPP_ERROR',
                            syncAction: String(item.action),
                            payload: item.payload,
                            result: res,
                            description: res?.success
                                ? `Sincronización en cola (${String(item.action).toUpperCase()}) completada para ${item.payload?.patientName || ''} (DNI ${item.payload?.patientDni || ''}).`
                                : `Error en cola Globalapp (${String(item.action).toUpperCase()}): ${res?.error || 'Desconocido'}`
                        });
                    } catch (err: any) {
                        await supabase
                            .from('globalapp_sync_queue')
                            .update({ status: 'error', last_error: err?.message || 'Excepción', updated_at: new Date().toISOString() })
                            .eq('id', item.id);
                    } finally {
                        isRunningRef.current = false;
                    }
                }
            } catch {
                // ignore queue poll errors
            }
        };

        upsertHeartbeat();
        processQueue();
        const heartbeatTimer = setInterval(upsertHeartbeat, 60_000);
        const queueTimer = setInterval(processQueue, 30_000);

        channel
            .on('broadcast', { event: 'RUN_GLOBALAPP_SYNC' }, async (msg) => {
                const { requestId, syncPayload } = msg.payload || {};
                if (!syncPayload || !syncPayload.surgeryId) return;

                if (requestId && processedRequestsRef.current.has(requestId)) {
                    return;
                }
                if (requestId) {
                    processedRequestsRef.current.add(requestId);
                }

                // Wait if another sync is currently running
                while (isRunningRef.current) {
                    await new Promise((r) => setTimeout(r, 1500));
                }

                isRunningRef.current = true;
                try {
                    console.log('[GlobalappBridge] Ejecutando sincronización recibida desde Tablet/Web:', syncPayload);
                    const res = await (window as any).electronAPI.runGlobalappScraper(syncPayload);

                    if (res?.success) {
                        if (syncPayload.action === 'arco_en_c_revert') {
                            await supabase
                                .from('surgery_forms')
                                .upsert({
                                    surgery_id: syncPayload.surgeryId,
                                    arco_en_c: false,
                                    arco_en_c_synced: false
                                }, { onConflict: 'surgery_id' });
                        } else if (syncPayload.arcoEnC || syncPayload.action === 'arco_en_c_only') {
                            await supabase
                                .from('surgery_forms')
                                .upsert({
                                    surgery_id: syncPayload.surgeryId,
                                    arco_en_c: true,
                                    arco_en_c_synced: true
                                }, { onConflict: 'surgery_id' });
                        }
                    } else {
                        if (syncPayload.action === 'arco_en_c_only') {
                            await supabase
                                .from('surgery_forms')
                                .upsert({
                                    surgery_id: syncPayload.surgeryId,
                                    arco_en_c: false,
                                    arco_en_c_synced: false
                                }, { onConflict: 'surgery_id' });
                        }
                    }

                    // Retransmitir resultado a tablets/clientes conectados
                    try {
                        await channel.send({
                            type: 'broadcast',
                            event: 'GLOBALAPP_SYNC_RESULT',
                            payload: {
                                requestId,
                                surgeryId: syncPayload.surgeryId,
                                action: syncPayload.action,
                                result: res
                            }
                        });
                    } catch (bErr) {
                        console.error('[GlobalappBridge] Error broadcasting resultado:', bErr);
                    }

                    await logGlobalappAudit({
                        surgeryId: syncPayload.surgeryId,
                        userName: 'Puente Globalapp (Tablet -> PC)',
                        auditAction: res?.success ? 'SYNC_GLOBALAPP' : 'SYNC_GLOBALAPP_ERROR',
                        syncAction: String(syncPayload.action),
                        payload: syncPayload,
                        result: res,
                        description: res?.success
                            ? `Sincronización Globalapp (${String(syncPayload.action).toUpperCase()} - ${res.mode || 'ok'}) completada para ${syncPayload.patientName} (DNI ${syncPayload.patientDni}).`
                            : `Error en sincronización Globalapp (${String(syncPayload.action).toUpperCase()}): ${res?.error || 'Desconocido'}`
                    });
                } catch (err) {
                    console.error('[GlobalappBridge] Error ejecutando scraper:', err);
                } finally {
                    isRunningRef.current = false;
                }
            })
            .subscribe();

        return () => {
            clearInterval(heartbeatTimer);
            clearInterval(queueTimer);
            supabase.removeChannel(channel);
        };
    }, [isElectron]);

    return null;
};

