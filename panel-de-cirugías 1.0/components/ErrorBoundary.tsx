import React, { Component, ErrorInfo, ReactNode } from 'react';
import { captureError } from '../src/lib/errorLogger';
import { AuthContext } from '../src/lib/AuthContext';

interface Props {
    children: ReactNode;
    fallback?: ReactNode;
}

interface State {
    hasError: boolean;
    error: Error | null;
}

/**
 * Global Error Boundary to catch React render errors.
 * Logs errors to Supabase system_errors table.
 */
class ErrorBoundary extends React.Component<Props, State> {
    static contextType = AuthContext;

    public state: State = {
        hasError: false,
        error: null
    };

    constructor(props: Props) {
        super(props);
    }

    static getDerivedStateFromError(error: Error): State {
        // Update state so the next render will show the fallback UI.
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        // Log the error using our error logger
        const auth = this.context as any;
        captureError(error, {
            context: 'GlobalErrorBoundary',
            severity: 'CRITICAL',
            user: auth?.user || null,
            metadata: {
                componentStack: errorInfo.componentStack
            }
        });
    }

    render() {
        if (this.state.hasError) {
            if (this.props.fallback) {
                return this.props.fallback;
            }

            return (
                <div className="min-h-screen w-full flex items-center justify-center bg-slate-50 p-4">
                    <div className="bg-white p-8 rounded-2xl shadow-xl max-w-md w-full border border-red-100 text-center">
                        <div className="mx-auto size-16 bg-red-100 rounded-full flex items-center justify-center mb-6">
                            <span className="material-symbols-outlined text-red-600 text-3xl">error_outline</span>
                        </div>
                        <h1 className="text-2xl font-black text-slate-800 mb-2">Algo salió mal</h1>
                        <p className="text-slate-500 mb-6">
                            Ha ocurrido un error inesperado en la aplicación. Nuestro equipo ha sido notificado automáticamente.
                        </p>
                        <div className="flex flex-col gap-3">
                            <button
                                onClick={() => window.location.reload()}
                                className="w-full bg-primary hover:bg-primary-dark text-white font-bold py-3 px-4 rounded-xl transition-all active:scale-[0.98]"
                            >
                                Recargar Aplicación
                            </button>
                            <button
                                onClick={() => window.location.href = '/'}
                                className="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-3 px-4 rounded-xl transition-all"
                            >
                                Ir al Inicio
                            </button>
                        </div>
                        {(import.meta as any).env.DEV && this.state.error && (
                            <div className="mt-8 text-left bg-slate-100 p-4 rounded-lg overflow-auto max-h-40 text-xs font-mono text-red-800">
                                {this.state.error.toString()}
                            </div>
                        )}
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}

export default ErrorBoundary;
