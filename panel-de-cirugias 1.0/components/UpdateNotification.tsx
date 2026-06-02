
import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const UpdateNotification: React.FC = () => {
    const [updateStatus, setUpdateStatus] = useState<'idle' | 'available' | 'downloading' | 'ready'>('idle');
    const [progress, setProgress] = useState(0);

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

    const handleRestart = () => {
        (window as any).electronAPI.restartApp();
    };

    return (
        <AnimatePresence>
            {updateStatus !== 'idle' && (
                <motion.div
                    initial={{ y: -100, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    exit={{ y: -100, opacity: 0 }}
                    className="fixed top-0 left-0 right-0 z-[9999] p-4 flex justify-center pointer-events-none"
                >
                    <div className="bg-slate-900 text-white px-6 py-3 rounded-2xl shadow-2xl border border-slate-700 flex items-center gap-4 pointer-events-auto min-w-[300px]">
                        <div className="w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center overflow-hidden shrink-0">
                            <span className="material-symbols-outlined text-blue-400 normal-case text-xl">
                                {updateStatus === 'ready' ? 'auto_renew' : 'downloading'}
                            </span>
                        </div>
                        
                        <div className="flex-1">
                            <p className="text-sm font-black tracking-tight">
                                {updateStatus === 'available' && 'Nueva versión detectada...'}
                                {updateStatus === 'downloading' && `Descargando actualización... ${progress}%`}
                                {updateStatus === 'ready' && '¡Actualización lista!'}
                            </p>
                            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                                {updateStatus === 'ready' ? 'Reinicia para aplicar los cambios' : 'Se instalará automáticamente al reiniciar'}
                            </p>
                        </div>

                        {updateStatus === 'ready' && (
                            <button
                                onClick={handleRestart}
                                className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-xl text-xs font-black transition-colors shadow-lg shadow-blue-900/20"
                            >
                                REINICIAR AHORA
                            </button>
                        )}
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
};

export default UpdateNotification;
