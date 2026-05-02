import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { User } from '../../../types';
import AuthService from '../services/authService';
import SyncService from '../../inventory/services/syncService';
import ApiService from '../../shared/services/apiService';

interface AuthContextValue {
    initializing: boolean;
    isAuthenticated: boolean;
    user: User | null;
    cycleId: number;
    signIn: (user: User, token: string) => Promise<void>;
    signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
    const [initializing, setInitializing] = useState(true);
    const [user, setUser] = useState<User | null>(null);
    const [cycleId, setCycleId] = useState(1);

    async function bootstrapSession(): Promise<void> {
        try {
            const storedToken = await AuthService.getToken();
            const storedUser = await AuthService.getUser();
            if (storedUser && storedToken) {
                ApiService.setToken(storedToken);
                setUser(storedUser);
                setCycleId(storedUser.UserID || 1);
                void SyncService.start();
            } else {
                await AuthService.clearAuth();
                ApiService.setToken(null);
            }
        } finally {
            setInitializing(false);
        }
    }

    async function signIn(nextUser: User, token: string): Promise<void> {
        await AuthService.saveToken(token);
        await AuthService.saveUser(nextUser);
        ApiService.setToken(token);
        setUser(nextUser);
        setCycleId(nextUser.UserID || 1);
        void SyncService.start();
    }

    async function signOut(): Promise<void> {
        SyncService.stop();
        await AuthService.clearAuth();
        ApiService.setToken(null);
        setUser(null);
    }

    useEffect(() => {
        void bootstrapSession();
    }, []);

    const value = useMemo<AuthContextValue>(
        () => ({
            initializing,
            isAuthenticated: !!user,
            user,
            cycleId,
            signIn,
            signOut,
        }),
        [cycleId, initializing, user]
    );

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within AuthProvider');
    }
    return context;
}
