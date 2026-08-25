
import React, { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const UpdateNotification: React.FC = () => {
    const [updateStatus, setUpdateStatus] = useState<'idle' | 'available' | 'downloading' | 'ready' | 'web_available'>('idle');
    const [progress, setProgress] = useState(0);

    // Detección para Electron
    useEffect(() => {
        const electronAPI = (window as any).electronAPI;
        if (!electronAPI) return;

        electronAPI.onUpdateAvailable(() => {
            setUpdateStatus('available');
        });

        electronAPI.onDownloadProgress((percent: number) => {
            setUpdateStatus('downloading');
            setProgress(Math.round(percent));
        });

        electronAPI.onUpdateDownloaded(() => {
            setUpdateStatus('ready');
        });
    }, []);

    // Detección para Web / PWA en iOS y Navegadores
    const checkForWebUpdate = useCallback(async () => {
        if ((window as any).electronAPI) return; // Si es Electron, se encarga el updater nativo
        try {
            const res = await fetch(`./index.html?_t=${Date.now()}`, {
                cache: 'no-store',
                headers: { 'Cache-Control': 'no-cache', 'Pragma': 'no-cache' }
            });
            if (!res.ok) return;
            const html = await res.text();

            // Buscar hashes de scripts generados en el nuevo index.html
            const match = html.match(/src=["'](\.\/)?assets\/index-([a-zA-Z0-9_-]+)\.js["']/);
            if (match) {
                const newHash = match[2];
                const currentScripts = Array.from(document.querySelectorAll('script')).map(s => s.getAttribute('src') || '');
                const currentHasAnyIndex = currentScripts.some(src => /assets\/index-[a-zA-Z0-9_-]+\.js/.test(src));
                const currentHasNewScript = currentScripts.some(src => src.includes(`assets/index-${newHash}.js`));

                if (currentHasAnyIndex && !currentHasNewScript) {
                    console.log('🔄 Nueva versión web detectada (hash:', newHash, ')');
                    setUpdateStatus('web_available');
                }
            }
        } catch (e) {
            // Ignorar fallos de red en modo offline
        }
    }, []);

    useEffect(() => {
        if ((window as any).electronAPI) return;

        // Comprobación inicial a los 10 segundos
        const timer = setTimeout(checkForWebUpdate, 10000);

        // Comprobación periódica cada 5 minutos
        const interval = setInterval(checkForWebUpdate, 5 * 60 * 1000);

        // Comprobar cuando el usuario desbloquea o regresa a la PWA en iOS / Móvil
        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') {
                checkForWebUpdate();
            }
        };
        document.addEventListener('visibilitychange', handleVisibilityChange);

        return () => {
            clearTimeout(timer);
            clearInterval(interval);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, [checkForWebUpdate]);

    const handleRestart = () => {
        if ((window as any).electronAPI?.restartApp) {
            (window as any).electronAPI.restartApp();
        }
    };

    const handleWebUpdate = async () => {
        if ('caches' in window) {
            try {
                const keys = await caches.keys();
                await Promise.all(keys.map(k => caches.delete(k)));
            } catch (e) {
                console.error('Error limpiando cachés:', e);
            }
        }
        window.location.reload();
    };

    return (
        <AnimatePresence>
            {updateStatus !== 'idle' && (
                <motion.div
                    initial={{ y: -100, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    exit={{ y: -100, opacity: 0 }}
                    className="fixed top-0 left-0 right-0 z-[9999] p-3 sm:p-4 flex justify-center pointer-events-none"
                >
                    <div className="bg-slate-900/95 backdrop-blur-md text-white px-4 sm:px-6 py-3 rounded-2xl shadow-2xl border border-slate-700 flex items-center gap-3 sm:gap-4 pointer-events-auto max-w-md w-full mx-2">
                        <div className="w-10 h-10 rounded-xl bg-blue-500/20 flex items-center justify-center overflow-hidden shrink-0 border border-blue-500/30">
                            <span className="material-symbols-outlined text-blue-400 normal-case text-xl animate-spin-slow">
                                {updateStatus === 'ready' || updateStatus === 'web_available' ? 'sync' : 'downloading'}
                            </span>
                        </div>
                        
                        <div className="flex-1 min-w-0">
                            <p className="text-xs sm:text-sm font-black tracking-tight truncate">
                                {updateStatus === 'available' && 'Nueva versión detectada...'}
                                {updateStatus === 'downloading' && `Descargando actualización... ${progress}%`}
                                {updateStatus === 'ready' && '¡Actualización lista!'}
                                {updateStatus === 'web_available' && '¡Nueva versión disponible!'}
                            </p>
                            <p className="text-[9px] sm:text-[10px] text-slate-400 font-bold uppercase tracking-wider truncate">
                                {updateStatus === 'ready' && 'Reinicia para aplicar cambios'}
                                {updateStatus === 'downloading' && 'Instalando en segundo plano...'}
                                {updateStatus === 'available' && 'Preparando descarga...'}
                                {updateStatus === 'web_available' && 'Toca actualizar para aplicar mejoras'}
                            </p>
                        </div>

                        {updateStatus === 'ready' && (
                            <button
                                onClick={handleRestart}
                                className="bg-blue-600 hover:bg-blue-500 text-white px-3 sm:px-4 py-2 rounded-xl text-xs font-black transition-all shadow-lg shadow-blue-900/20 shrink-0"
                            >
                                REINICIAR
                            </button>
                        )}

                        {updateStatus === 'web_available' && (
                            <button
                                onClick={handleWebUpdate}
                                className="bg-emerald-600 hover:bg-emerald-500 text-white px-3 sm:px-4 py-2 rounded-xl text-xs font-black transition-all shadow-lg shadow-emerald-900/20 active:scale-95 shrink-0 flex items-center gap-1.5"
                            >
                                <span className="material-symbols-outlined text-sm">refresh</span>
                                ACTUALIZAR
                            </button>
                        )}
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
};

export default UpdateNotification;
