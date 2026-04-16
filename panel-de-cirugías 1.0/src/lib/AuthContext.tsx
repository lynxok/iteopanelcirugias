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

    // Initial session simulation: load from localStorage if exists
    useEffect(() => {
        const savedUser = localStorage.getItem('simulated_user');
        if (savedUser) {
            setUser(JSON.parse(savedUser));
        }
        setLoading(false);
    }, []);

    const signInAs = async (email: string, password?: string) => {
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('users')
                .select('*')
                .eq('email', email)
                .single();

            if (error) throw error;

            if (data) {
                // Si el usuario tiene contraseña, validarla
                if (data.password && data.password !== password) {
                    throw new Error('Contraseña incorrecta');
                }

                const appUser: AppUser = {
                    id: data.id,
                    name: data.name,
                    email: data.email,
                    password: data.password,
                    avatarUrl: data.avatar_url,
                    role: data.role as UserRole,
                    active: data.active,
                    vendorId: data.vendor_id,
                    doctorId: data.doctor_id,
                    canFillForms: data.can_fill_forms
                };
                setUser(appUser);
                localStorage.setItem('simulated_user', JSON.stringify(appUser));
            } else {
                throw new Error('Usuario no encontrado');
            }
        } catch (err: any) {
            console.error('Simulated Sign In Error:', err);
            throw err;
        } finally {
            setLoading(false);
        }
    };

    const signOut = () => {
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
