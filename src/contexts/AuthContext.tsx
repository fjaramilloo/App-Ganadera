import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { Session, User } from '@supabase/supabase-js';

export type UserRole = 'administrador' | 'vaquero' | 'observador' | null;

interface UserFinca {
    id_finca: string;
    nombre_finca: string;
    rol: UserRole;
}

interface AuthState {
    user: User | null;
    session: Session | null;
    role: UserRole;
    fincaId: string | null;
    userFincas: UserFinca[];
    isSuperAdmin: boolean;
    loading: boolean;
    signOut: () => Promise<void>;
    setFincaId: (id: string) => void;
    refreshFincas: () => Promise<void>;
}

const AuthContext = createContext<AuthState>({
    user: null,
    session: null,
    role: null,
    fincaId: null,
    userFincas: [],
    isSuperAdmin: false,
    loading: true,
    signOut: async () => { },
    setFincaId: () => { },
    refreshFincas: async () => { },
});

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [user, setUser] = useState<User | null>(null);
    const [session, setSession] = useState<Session | null>(null);
    const [role, setRole] = useState<UserRole>(null);
    const [fincaId, setFincaId] = useState<string | null>(null);
    const [userFincas, setUserFincas] = useState<UserFinca[]>([]);
    const [isSuperAdmin, setIsSuperAdmin] = useState(false);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        supabase.auth.getSession().then(({ data: { session } }) => {
            setSession(session);
            setUser(session?.user ?? null);
            if (session?.user) {
                fetchUserData(session.user.id);
            } else {
                setLoading(false);
            }
        });

        const { data: { subscription } } = supabase.auth.onAuthStateChange(
            (_event, session) => {
                setSession(session);
                setUser(session?.user ?? null);
                if (session?.user) {
                    fetchUserData(session.user.id);
                } else {
                    setRole(null);
                    setFincaId(null);
                    setUserFincas([]);
                    setIsSuperAdmin(false);
                    setLoading(false);
                }
            }
        );

        return () => subscription.unsubscribe();
    }, []);

    const fetchUserData = async (userId: string) => {
        try {
            // 1. Verificamos Rol(es) y Finca(s)
            const { data: permisos, error: roleError } = await supabase
                .from('permisos_finca')
                .select(`
                    id_finca,
                    rol,
                    fincas ( nombre )
                `)
                .eq('id_usuario', userId);

            if (roleError) {
                console.error("Error obteniendo roles:", roleError);
            } else if (permisos && permisos.length > 0) {
                const mappedFincas: UserFinca[] = permisos.map((p: any) => ({
                    id_finca: p.id_finca,
                    nombre_finca: p.fincas.nombre,
                    rol: p.rol as UserRole
                }));

                setUserFincas(mappedFincas);

                // Si ya teníamos una seleccionada y sigue siendo válida, la mantenemos
                // Si no, seleccionamos la primera
                const savedFincaId = localStorage.getItem('lastFincaId');
                const validFinca = mappedFincas.find(f => f.id_finca === savedFincaId) || mappedFincas[0];

                setFincaId(validFinca.id_finca);
                setRole(validFinca.rol);
            }

            // 2. Verificamos si es superadmin
            const { data: adminData } = await supabase
                .from('superadmins')
                .select('id_usuario')
                .eq('id_usuario', userId)
                .single();

            setIsSuperAdmin(!!adminData);

        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const handleSetFincaId = (id: string) => {
        const finca = userFincas.find(f => f.id_finca === id);
        if (finca) {
            setFincaId(id);
            setRole(finca.rol);
            localStorage.setItem('lastFincaId', id);
        }
    };

    const refreshFincas = async () => {
        if (user) await fetchUserData(user.id);
    };

    const signOut = async () => {
        await supabase.auth.signOut();
        localStorage.removeItem('lastFincaId');
    };

    return (
        <AuthContext.Provider value={{
            user,
            session,
            role,
            fincaId,
            userFincas,
            isSuperAdmin,
            loading,
            signOut,
            setFincaId: handleSetFincaId,
            refreshFincas
        }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => useContext(AuthContext);
