import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../src/lib/AuthContext';

export const QRScanner: React.FC = () => {
    const navigate = useNavigate();
    const { user } = useAuth();
    const [scanResult, setScanResult] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment'); // rear by default
    const isRunningRef = useRef(false);
    const scannerRef = useRef<Html5Qrcode | null>(null);

    const handleSuccess = useCallback(async (decodedText: string) => {
        try {
            const url = new URL(decodedText);
            const match = url.hash?.match(/\/tracking\/([^/?#]+)/);
            let surgeryId = '';

            if (match && match[1]) {
                surgeryId = match[1];
            } else if (url.pathname.includes('/tracking/')) {
                const parts = url.pathname.split('/tracking/');
                if (parts[1]) surgeryId = parts[1];
            }

            if (surgeryId) {
                setScanResult(decodedText);
                // Safe stop before navigation
                if (scannerRef.current && isRunningRef.current) {
                    try {
                        isRunningRef.current = false;
                        await scannerRef.current.stop();
                    } catch (e) {
                        // ignore
                    }
                }
                navigate(`/tracking/${surgeryId}`);
                return;
            }
            
            setError('El código escaneado no pertenece a esta aplicación.');
        } catch {
            // Maybe it's a raw UUID
            if (decodedText.length === 36) {
                setScanResult(decodedText);
                if (scannerRef.current && isRunningRef.current) {
                    isRunningRef.current = false;
                    scannerRef.current.stop().catch(() => {});
                }
                navigate(`/tracking/${decodedText}`);
            } else {
                setError('Formato de código QR inválido.');
            }
        }
    }, [navigate]);

    const startScanner = useCallback(async (facing: 'environment' | 'user') => {
        if (!document.getElementById('reader')) return;

        // Stop any previous instance
        if (scannerRef.current) {
            try { await scannerRef.current.stop(); } catch { /* ignore */ }
        }

        const html5Qrcode = new Html5Qrcode('reader');
        scannerRef.current = html5Qrcode;

        try {
            await html5Qrcode.start(
                { facingMode: facing },
                { fps: 10, qrbox: { width: 260, height: 260 } },
                handleSuccess,
                () => { /* frame errors are normal when no QR is in view */ }
            );
            isRunningRef.current = true;
        } catch (err: any) {
            setError('No se pudo acceder a la cámara. Verifique los permisos.');
            console.error(err);
        }
    }, [handleSuccess]);

    // Start scanner on mount and when facing changes
    useEffect(() => {
        if (!user) {
            setError('Debe iniciar sesión para usar el escáner.');
            return;
        }
        if (scanResult) return; // already scanned, don't restart

        const timer = setTimeout(() => startScanner(facingMode), 200);
        return () => { clearTimeout(timer); };
    }, [facingMode, user, startScanner, scanResult]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (scannerRef.current && isRunningRef.current) {
                isRunningRef.current = false;
                scannerRef.current.stop().catch(() => {
                    // Silently fail to avoid crashing the whole app during unmount
                });
            }
        };
    }, []);

    const switchCamera = async () => {
        const next: 'environment' | 'user' = facingMode === 'environment' ? 'user' : 'environment';
        if (scannerRef.current && isRunningRef.current) {
            isRunningRef.current = false;
            try { await scannerRef.current.stop(); } catch { /* ok */ }
        }
        setFacingMode(next);
    };

    return (
        <div className="flex flex-col h-full bg-slate-900 overflow-hidden font-sans">
            {/* Header */}
            <div className="flex justify-between items-center p-4 bg-slate-900 border-b border-slate-800 text-white z-10 shrink-0">
                <button
                    onClick={() => navigate(-1)}
                    className="flex items-center gap-1 text-slate-300 hover:text-white transition-colors"
                >
                    <span className="material-symbols-outlined">close</span>
                    Cerrar
                </button>
                <span className="font-bold text-sm tracking-widest text-slate-400">ESCÁNER QR</span>
                {/* Camera switch button */}
                <button
                    onClick={switchCamera}
                    disabled={!!scanResult}
                    className="flex items-center gap-1 text-slate-300 hover:text-white transition-colors disabled:opacity-40"
                    title="Cambiar cámara"
                >
                    <span className="material-symbols-outlined">flip_camera_ios</span>
                </button>
            </div>

            {/* Scanner Area */}
            <div className="flex-1 relative flex flex-col items-center justify-center bg-black">
                {error && (
                    <div className="absolute top-4 left-4 right-4 z-50 bg-red-500/90 text-white p-3 rounded-lg shadow-lg flex items-start gap-3 animate-fadeIn">
                        <span className="material-symbols-outlined">error</span>
                        <div className="flex-1">
                            <span className="block font-bold">Error</span>
                            <span className="text-sm">{error}</span>
                        </div>
                        <button onClick={() => setError(null)}>
                            <span className="material-symbols-outlined">close</span>
                        </button>
                    </div>
                )}

                {scanResult ? (
                    <div className="flex flex-col items-center justify-center p-8 bg-black/80 w-full h-full z-20">
                        <div className="size-20 bg-green-500 rounded-full flex items-center justify-center mb-4 animate-bounce">
                            <span className="material-symbols-outlined text-white text-4xl">check</span>
                        </div>
                        <h2 className="text-white text-xl font-bold mb-2">¡Código detectado!</h2>
                        <p className="text-slate-400">Redirigiendo a ficha del paciente...</p>
                    </div>
                ) : (
                    <>
                        {/* Camera indicator badge */}
                        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 bg-slate-800/80 text-slate-300 text-xs font-bold px-3 py-1 rounded-full flex items-center gap-1.5 backdrop-blur-sm">
                            <span className="material-symbols-outlined text-sm">{facingMode === 'environment' ? 'camera_rear' : 'camera_front'}</span>
                            {facingMode === 'environment' ? 'Cámara trasera' : 'Cámara frontal'}
                        </div>

                        {/* html5-qrcode renders the video feed into this div */}
                        <div
                            id="reader"
                            className="w-full max-w-md mx-auto"
                        />

                        <p className="text-slate-400 mt-6 text-center text-sm px-6">
                            Apunte con la cámara hacia el código QR de la pulsera del paciente.
                        </p>
                    </>
                )}
            </div>

            <style>{`
                #reader { border: none !important; background: transparent !important; }
                #reader video { border-radius: 0 !important; }
                #reader__scan_region { background: transparent !important; }
                #reader__dashboard { display: none !important; }
            `}</style>
        </div>
    );
};
