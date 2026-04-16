import React, { useState, useEffect } from 'react';

declare const __APP_VERSION__: string;

const UpdateNotification: React.FC = () => {
    const [updateAvailable, setUpdateAvailable] = useState(false);
    const [newVersion, setNewVersion] = useState('');

    useEffect(() => {
        const checkVersion = async () => {
            try {
                // No intentar si no hay internet para no ensuciar la consola
                if (!navigator.onLine) return;

                // Fetch version.json from server
                // Cache-busting with timestamp to ensure we get the latest file
                const response = await fetch(`/version.json?t=${Date.now()}`);
                if (!response.ok) return;

                const data = await response.json();
                const serverVersion = data.version;
                const clientVersion = __APP_VERSION__;

                const isNewer = (v1: string, v2: string) => {
                    const parts1 = v1.split('.').map(Number);
                    const parts2 = v2.split('.').map(Number);
                    for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
                        const num1 = parts1[i] || 0;
                        const num2 = parts2[i] || 0;
                        if (num1 > num2) return true;
                        if (num1 < num2) return false;
                    }
                    return false;
                };

                if (serverVersion && isNewer(serverVersion, clientVersion)) {
                    setNewVersion(serverVersion);
                    setUpdateAvailable(true);
                }
            } catch (error) {
                // Silenciar errores de fetch si son por falta de conexión
                if (error instanceof TypeError && error.message.includes('fetch')) {
                    console.warn('No se pudo verificar la versión (probablemente sin conexión)');
                } else {
                    console.error('Error checking version:', error);
                }
            }
        };

        // Initial check
        checkVersion();

        // Periodic check every 5 minutes
        const interval = setInterval(checkVersion, 5 * 60 * 1000);

        return () => clearInterval(interval);
    }, []);

    if (!updateAvailable) return null;

    const handleUpdate = () => {
        // Force reload by changing URL with a timestamp to bust cache
        const url = new URL(window.location.href);
        url.searchParams.set('v', Date.now().toString());
        window.location.href = url.toString();
    };

    return (
        <div className="fixed bottom-6 right-6 z-[9999] animate-bounce-in">
            <div className="bg-white border-2 border-primary rounded-2xl shadow-2xl p-5 max-w-xs overflow-hidden relative group">
                {/* Decorative background element */}
                <div className="absolute top-0 right-0 -mr-8 -mt-8 size-24 bg-primary/5 rounded-full group-hover:scale-125 transition-transform duration-500"></div>

                <div className="flex items-start gap-4">
                    <div className="size-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                        <span className="material-symbols-outlined text-primary text-2xl">system_update</span>
                    </div>

                    <div className="flex-1">
                        <h4 className="text-sm font-bold text-slate-900 leading-tight">Nueva versión disponible</h4>
                        <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                            Se ha detectado la versión <span className="font-bold text-primary">{newVersion}</span>.
                            Actualiza para disfrutar de las últimas mejoras.
                        </p>

                        <div className="flex gap-2 mt-4">
                            <button
                                onClick={handleUpdate}
                                className="flex-1 bg-primary text-white text-[11px] font-bold py-2 rounded-lg hover:bg-primary-hover active:scale-95 transition-all shadow-md shadow-primary/20"
                            >
                                ACTUALIZAR AHORA
                            </button>
                            <button
                                onClick={() => setUpdateAvailable(false)}
                                className="px-3 py-2 text-slate-400 hover:text-slate-600 text-[11px] font-bold hover:bg-slate-50 rounded-lg transition-colors"
                            >
                                LUEGO
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default UpdateNotification;
