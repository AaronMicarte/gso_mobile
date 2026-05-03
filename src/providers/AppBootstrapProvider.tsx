import React, { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { ActivityIndicator, View, StyleSheet } from 'react-native';
import ScanQueueService from '../features/inventory/services/scanQueueService';
import { AuthProvider } from '../features/auth/providers/AuthProvider';
import ApiService from '../features/shared/services/apiService';

export function AppBootstrapProvider({
    children,
}: {
    children: React.ReactNode;
}): React.JSX.Element {
    const [ready, setReady] = useState(false);

    const initializeRuntimeServices = useCallback(async (): Promise<void> => {
        try {
            await ScanQueueService.initializeDatabase();
            // Load stored auth token (if any) so ApiService can attach Authorization header
            await ApiService.init();
        } catch (error) {
            console.error('App bootstrap error:', error);
        }
    }, []);

    async function initialize(): Promise<void> {
        try {
            await initializeRuntimeServices();
        } finally {
            setReady(true);
        }
    }

    // eslint-disable-next-line react-hooks/set-state-in-effect
    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        void initialize();
    }, []);

    useEffect(() => {
        const subscription = AppState.addEventListener('change', (nextState) => {
            if (nextState === 'active') {
                void initializeRuntimeServices();
            }
        });

        return () => subscription.remove();
    }, [initializeRuntimeServices]);

    if (!ready) {
        return (
            <View style={styles.container}>
                <ActivityIndicator size="large" color="#2563EB" />
            </View>
        );
    }

    return <AuthProvider>{children}</AuthProvider>;
}

const styles = StyleSheet.create({
    container: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0f172a' },
});
