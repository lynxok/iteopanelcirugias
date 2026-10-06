import React, { createContext, useContext, useState, useEffect } from 'react';
import { AppUser, UserRole } from '../../types';
import { supabase } from './supabase';

interface AuthContextType {
    user: AppUser | null;
    loading: boolean;
    signInAs: (email: string, password?: string) => Promise<void>;
    signOut: () => void;
    updateUser: (updatedUser: AppUser) => void;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [user, setUser] = useState<AppUser | null>(null);
    const [loading, setLoading] = useState(true);

    // Initial session: load from Supabase native session and restore profile
    useEffect(() => {
        const checkAndRestoreSession = async () => {
            try {
                // 1. Obtener la sesión nativa actual de Supabase
                const { data: { session } } = await supabase.auth.getSession();

                if (session?.user?.email) {
                    // Restaurar perfil desde quirofano.users
                    const { data, error } = await supabase
                        .from('users')
                        .select('*, doctors(specialty)')
                        .eq('email', session.user.email)
                        .maybeSingle();

                    if (!error && data && data.active !== false) {
                        const appUser: AppUser = {
                            id: data.id,
                            name: data.name,
                            email: data.email,
                            avatarUrl: data.avatar_url,
                            role: data.role as UserRole,
                            active: data.active,
                            vendorId: data.vendor_id,
                            doctorId: data.doctor_id,
                            canFillForms: data.can_fill_forms,
                            specialty: data.doctors?.specialty,
                            can_edit_shifts: data.can_edit_shifts,
                            does_guardias: data.does_guardias,
                            resident_level: data.resident_level,
                            can_view_all_vendors: data.can_view_all_vendors,
                            is_turno_tarde: data.is_turno_tarde,
                            has_tecnico_section_access: data.has_tecnico_section_access,
                            can_manage_nursing_shifts: data.can_manage_nursing_shifts
                        };
                        setUser(appUser);
                        localStorage.setItem('simulated_user', JSON.stringify(appUser));
                    }
                } else {
                    // Fallback para sesiones cacheadas previas si existen
                    const savedUser = localStorage.getItem('simulated_user');
                    if (savedUser) {
                        try {
                            const parsedUser = JSON.parse(savedUser);
                            setUser(parsedUser);
                        } catch (e) {}
                    }
                }
            } catch (e) {
                console.error('[Auth] Error al restaurar la sesión:', e);
            } finally {
                setLoading(false);
            }
        };

        checkAndRestoreSession();
    }, []);

    const signInAs = async (email: string, password?: string) => {
        setLoading(true);
        try {
            const cleanEmail = email.trim().toLowerCase();
            
            if (!password) {
                throw new Error('Debe ingresar su contraseña.');
            }

            // 1. Autenticación nativa obligatoria en Supabase Auth
            const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
                email: cleanEmail,
                password
            });

            if (authError || !authData?.user) {
                console.error('Error de autenticación nativa:', authError?.message);
                throw new Error('Credenciales incorrectas. Verifique su correo y contraseña.');
            }

            // 2. Consultar perfil extendido en quirofano.users como usuario autenticado
            const { data, error } = await supabase
                .from('users')
                .select('*, doctors(specialty)')
                .eq('email', cleanEmail)
                .single();

            if (error || !data) {
                throw new Error('Usuario autenticado pero no registrado en el personal de quirófano.');
            }

            // Verificar si el usuario está activo
            if (data.active === false) {
                await supabase.auth.signOut();
                throw new Error('Su usuario se encuentra inactivo o deshabilitado.');
            }

            const appUser: AppUser = {
                id: data.id,
                name: data.name,
                email: data.email,
                avatarUrl: data.avatar_url,
                role: data.role as UserRole,
                active: data.active,
                vendorId: data.vendor_id,
                doctorId: data.doctor_id,
                canFillForms: data.can_fill_forms,
                specialty: data.doctors?.specialty,
                can_edit_shifts: data.can_edit_shifts,
                does_guardias: data.does_guardias,
                resident_level: data.resident_level,
                can_view_all_vendors: data.can_view_all_vendors,
                is_turno_tarde: data.is_turno_tarde,
                has_tecnico_section_access: data.has_tecnico_section_access,
                can_manage_nursing_shifts: data.can_manage_nursing_shifts
            };

            setUser(appUser);
            localStorage.setItem('simulated_user', JSON.stringify(appUser));
        } catch (err: any) {
            console.error('Sign In Error:', err);
            throw err;
        } finally {
            setLoading(false);
        }
    };

    const signOut = async () => {
        try {
            await supabase.auth.signOut();
        } catch (e) {
            console.error('Error durante signOut:', e);
        }
        setUser(null);
        localStorage.removeItem('simulated_user');
    };

    const updateUser = (updatedUser: AppUser) => {
        setUser(updatedUser);
        localStorage.setItem('simulated_user', JSON.stringify(updatedUser));
    };

    return (
        <AuthContext.Provider value={{ user, loading, signInAs, signOut, updateUser }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};
