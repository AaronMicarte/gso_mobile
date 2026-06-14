import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { Alert } from 'react-native';
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
    const [cycleId, setCycleId] = useState(0);

    async function bootstrapSession(): Promise<void> {
        try {
            const storedToken = await AuthService.getToken();
            const storedUser = await AuthService.getUser();
            const isAllowed = (u: User | null | undefined) => {
                if (!u) return false;
                const role = (u.Role || '').toString().toLowerCase();
                if (role === 'admin' || role === 'staff') return true;
                if (typeof u.UserRoleID === 'number' && (u.UserRoleID === 1 || u.UserRoleID === 2)) return true;
                return false;
            };

            if (storedUser && storedToken && isAllowed(storedUser)) {
                ApiService.setToken(storedToken);
                setUser(storedUser);
                // Determine active RPC inventory cycle from backend so Admin and Staff
                // share the same active cycle instead of using the local user id.
                try {
                    const resp = await ApiService.listRpcInventoryCycles();
                    const year = resp.current_cycle?.start_year ?? null;
                    const found = Array.isArray(resp.data)
                        ? resp.data.find((c: any) => Number(c.start_year) === Number(year))
                        : null;
                    setCycleId(found?.id ?? 0);
                } catch (e) {
                    // Fallback to 0 when cycle cannot be resolved
                    setCycleId(0);
                    console.error('[AuthProvider] Failed to resolve active cycle:', e);
                }

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
        const isAllowed = (u: User | null | undefined) => {
            if (!u) return false;
            const role = (u.Role || '').toString().toLowerCase();
            if (role === 'admin' || role === 'staff') return true;
            if (typeof u.UserRoleID === 'number' && (u.UserRoleID === 1 || u.UserRoleID === 2)) return true;
            return false;
        };

        if (!isAllowed(nextUser)) {
            // Prevent storing credentials for unauthorized roles
            await AuthService.clearAuth();
            ApiService.setToken(null);
            Alert.alert('Access denied', "This mobile app is restricted to Administrator and Staff users only.");
            return;
        }

        await AuthService.saveToken(token);
        await AuthService.saveUser(nextUser);
        ApiService.setToken(token);
        setUser(nextUser);
        // Resolve active cycle from backend after successful sign-in
        try {
            const resp = await ApiService.listRpcInventoryCycles();
            const year = resp.current_cycle?.start_year ?? null;
            const found = Array.isArray(resp.data) ? resp.data.find((c: any) => Number(c.start_year) === Number(year)) : null;
            setCycleId(found?.id ?? 0);
        } catch (e) {
            setCycleId(0);
            console.error('[AuthProvider] Failed to resolve active cycle after sign-in:', e);
        }

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
