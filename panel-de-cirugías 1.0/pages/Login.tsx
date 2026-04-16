import React, { useState } from 'react';
import { useAuth } from '../src/lib/AuthContext';
import { useNavigate } from 'react-router-dom';

const Login: React.FC = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState(''); // Por ahora se ignora, pero se mantiene para la UI
    const [error, setError] = useState<string | null>(null);
    const { signInAs, loading } = useAuth();
    const navigate = useNavigate();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        if (!email) {
            setError('Por favor, ingrese su correo electrónico');
            return;
        }

        try {
            await signInAs(email, password);
            navigate('/');
        } catch (err: any) {
            setError(err.message === 'Contraseña incorrecta' ? 'Contraseña incorrecta' : 'Error al iniciar sesión. Verifique sus credenciales.');
        }
    };

    return (
        <div className="min-h-screen w-full flex items-center justify-center bg-slate-50 p-4 font-sans">
            <div className="max-w-md w-full bg-white rounded-2xl shadow-xl border border-slate-200 p-8 flex flex-col gap-8 animate-fadeIn">

                {/* Logo & Header */}
                <div className="flex flex-col items-center gap-4">
                    <img
                        src="/logo iteo azul.png"
                        alt="ITEO Logo"
                        className="h-20 w-auto object-contain"
                    />
                    <h3 className="text-primary font-medium text-sm -mt-2">Modulo de coordinación de cirugías</h3>
                    <div className="text-center mt-2">
                        <h2 className="text-2xl font-bold text-slate-900">Bienvenido</h2>
                        <p className="text-slate-500 text-sm">Ingrese sus credenciales para continuar</p>
                    </div>
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit} className="flex flex-col gap-6">
                    <div className="flex flex-col gap-2">
                        <label htmlFor="email" className="text-sm font-semibold text-slate-700 ml-1">
                            Correo Electrónico
                        </label>
                        <div className="relative">
                            <span className="material-symbols-outlined absolute left-3 top-2.5 text-slate-400">mail</span>
                            <input
                                id="email"
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="ejemplo@hospital.med"
                                className="w-full h-11 pl-10 pr-4 rounded-xl border border-slate-200 focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all outline-none text-slate-900"
                                required
                            />
                        </div>
                    </div>

                    <div className="flex flex-col gap-2">
                        <label htmlFor="pass" className="text-sm font-semibold text-slate-700 ml-1">
                            Contraseña
                        </label>
                        <div className="relative">
                            <span className="material-symbols-outlined absolute left-3 top-2.5 text-slate-400">lock</span>
                            <input
                                id="pass"
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="••••••••"
                                className="w-full h-11 pl-10 pr-4 rounded-xl border border-slate-200 focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all outline-none text-slate-900"
                            />
                        </div>
                    </div>

                    {error && (
                        <div className="bg-red-50 border border-red-100 text-red-600 text-xs px-4 py-3 rounded-lg flex items-center gap-2">
                            <span className="material-symbols-outlined text-sm">error</span>
                            {error}
                        </div>
                    )}

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full h-11 bg-primary hover:bg-primary-hover text-white font-bold rounded-xl transition-all shadow-lg shadow-primary/20 flex items-center justify-center gap-2 disabled:opacity-70"
                    >
                        {loading ? (
                            <span className="size-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                        ) : (
                            <>
                                <span>Iniciar Sesión</span>
                                <span className="material-symbols-outlined text-sm">login</span>
                            </>
                        )}
                    </button>
                </form>

                <div className="text-center">
                    <p className="text-xs text-slate-400">© 2026 ITEO - Centro de Coordinación Quirúrgica</p>
                </div>
            </div>
        </div>
    );
};

export default Login;
