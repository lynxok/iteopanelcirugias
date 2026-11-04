import React, { useEffect, useRef } from 'react';
import { supabase } from '../src/lib/supabase';

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
                                .update({ arco_en_c: false, arco_en_c_synced: false, updated_at: new Date().toISOString() })
                                .eq('surgery_id', syncPayload.surgeryId);
                        } else if (syncPayload.arcoEnC || syncPayload.action === 'arco_en_c_only') {
                            await supabase
                                .from('surgery_forms')
                                .update({ arco_en_c_synced: true, updated_at: new Date().toISOString() })
                                .eq('surgery_id', syncPayload.surgeryId);
                        }
                    }

                    await supabase.from('audit_logs').insert({
                        user_name: 'Puente Globalapp (Tablet -> PC)',
                        user_role: 'Quirofano',
                        action: 'SYNC_GLOBALAPP',
                        resource: 'Cirugía',
                        resource_id: syncPayload.surgeryId,
                        description: res?.success
                            ? `Sincronización Globalapp (${String(syncPayload.action).toUpperCase()} - ${res.mode || 'ok'}) completada para ${syncPayload.patientName} (DNI ${syncPayload.patientDni}).`
                            : `Error en sincronización Globalapp (${String(syncPayload.action).toUpperCase()}): ${res?.error || 'Desconocido'}`,
                        diff: { payload: syncPayload, result: res }
                    });
                } catch (err) {
                    console.error('[GlobalappBridge] Error ejecutando scraper:', err);
                } finally {
                    isRunningRef.current = false;
                }
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [isElectron]);

    return null;
};

