import React, { useCallback, useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { RpcCycle } from '../../../types';
import { useAuth } from '../../auth/providers/AuthProvider';
import ApiService from '../../shared/services/apiService';
import { CycleSelectScreen } from './CycleSelectScreen';
import ScannerScreen from './ScannerScreen';
import { ScannedAssetsScreen } from './ScannedAssetsScreen';
import { RpcInventoryReportScreen } from './RpcInventoryReportScreen';
import { RpcInventoryAuditScreen } from './RpcInventoryAuditScreen';
import { PropertyQrScreen } from './PropertyQrScreen';
import { QrGenerateScreen } from './QrGenerateScreen';

type TabType = 'cycles' | 'scanner' | 'assets' | 'report' | 'audit' | 'property-qr' | 'generate-qr';
const REFRESH_INTERVAL_MS = 10000;

interface RpcInventoryWorkspaceProps {
    initialCycleId?: number;
}

export function RpcInventoryWorkspace({
    initialCycleId,
}: RpcInventoryWorkspaceProps): React.JSX.Element {
    const { signOut, user } = useAuth();
    const isAdmin = user?.UserRoleID === 1;
    const [selectedCycleId, setSelectedCycleId] = useState<number | null>(initialCycleId ?? null);
    const [activeTab, setActiveTab] = useState<TabType>('cycles');
    const [cycleInfo, setCycleInfo] = useState<RpcCycle | null>(null);
    const [loadingCycles, setLoadingCycles] = useState(true);

    const refreshCycles = useCallback(async (): Promise<void> => {
        setLoadingCycles(true);
        try {
            const response = await ApiService.listRpcInventoryCycles();
            const cycles = response.data;

            if (selectedCycleId) {
                const refreshedSelected = cycles.find((cycle) => cycle.id === selectedCycleId) ?? null;
                if (refreshedSelected) {
                    setCycleInfo(refreshedSelected);
                    return;
                }
            }

            const fallbackCycle = cycles.find((cycle) => cycle.status === 'active') ?? cycles[0] ?? null;
            const selectedCycle =
                (initialCycleId ? cycles.find((cycle) => cycle.id === initialCycleId) : null) ?? fallbackCycle;

            if (selectedCycle) {
                setSelectedCycleId(selectedCycle.id);
                setCycleInfo(selectedCycle);
                setActiveTab('scanner');
            } else {
                setSelectedCycleId(null);
                setCycleInfo(null);
                setActiveTab('cycles');
            }
        } catch (error) {
            console.error('Failed to load RPC cycles:', error);
            // Provide a clearer hint when network errors occur (common on devices/emulators)
            // so developers/users can check their `EXPO_PUBLIC_API_URL` and network.
            // Avoid using too many alerts in prod — this helps local dev debugging.
            // Normalize the caught error to `any` so we can inspect `message` safely.
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const errAny: any = error;
            const isNetwork = (errAny && errAny.message && String(errAny.message).toLowerCase().includes('network')) || false;
            if (isNetwork) {
                Alert.alert(
                    'Network Error',
                    'Failed to reach backend API. Check EXPO_PUBLIC_API_URL in .env.local and ensure the device/emulator can reach your machine.'
                );
            }
        } finally {
            setLoadingCycles(false);
        }
    }, [initialCycleId, selectedCycleId]);

    useFocusEffect(
        useCallback(() => {
            void refreshCycles();
        }, [refreshCycles])
    );

    useEffect(() => {
        if (!selectedCycleId) {
            return;
        }

        const timer = setInterval(() => {
            void refreshCycles();
        }, REFRESH_INTERVAL_MS);

        return () => clearInterval(timer);
    }, [refreshCycles, selectedCycleId]);

    const handleSelectCycle = (cycleId: number) => {
        void ApiService.listRpcInventoryCycles()
            .then((response) => {
                const selectedCycle = response.data.find((cycle) => cycle.id === cycleId) ?? null;
                setCycleInfo(selectedCycle);
            })
            .catch((error) => {
                console.error('Failed to refresh selected cycle:', error);
            });
        setSelectedCycleId(cycleId);
        setActiveTab('scanner');
    };

    const handleBackToCycles = () => {
        setSelectedCycleId(null);
        setCycleInfo(null);
        setActiveTab('cycles');
    };

    if (loadingCycles && !selectedCycleId) {
        return (
            <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#2563EB" />
                <Text style={styles.loadingText}>Loading RPC cycles...</Text>
            </View>
        );
    }

    if (!selectedCycleId) {
        return <CycleSelectScreen onSelectCycle={handleSelectCycle} />;
    }

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <View style={styles.headerContent}>
                    <TouchableOpacity onPress={handleBackToCycles} style={styles.backButton}>
                        <Text style={styles.backButtonText}>Back</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={styles.logoutButton}
                        onPress={() => {
                            Alert.alert('Log out', 'Clear the saved session and return to the login screen?', [
                                { text: 'Cancel', style: 'cancel' },
                                {
                                    text: 'Log out',
                                    style: 'destructive',
                                    onPress: () => {
                                        void signOut();
                                    },
                                },
                            ]);
                        }}
                    >
                        <Text style={styles.logoutButtonText}>Logout</Text>
                    </TouchableOpacity>
                </View>
            </View>

            {/* Content */}
            <View style={styles.content}>
                {activeTab === 'scanner' && (
                    <ScannerScreen
                        cycleId={selectedCycleId}
                        cycleTotals={{
                            total: cycleInfo?.scans_count ?? 0,
                            rpcppe: cycleInfo?.rpcppe_count ?? 0,
                            rpcsep: cycleInfo?.rpcsep_count ?? 0,
                        }}
                    />
                )}
                {activeTab === 'assets' && (
                    <ScannedAssetsScreen cycleId={selectedCycleId} />
                )}
                {activeTab === 'report' && (
                    <RpcInventoryReportScreen cycleId={selectedCycleId} />
                )}
                {activeTab === 'audit' && isAdmin && (
                    <RpcInventoryAuditScreen cycleId={selectedCycleId} />
                )}
                {activeTab === 'property-qr' && (
                    <PropertyQrScreen />
                )}
                {activeTab === 'generate-qr' && (
                    <QrGenerateScreen />
                )}
            </View>

            {/* Tabs */}
            <View style={styles.bottomDock}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabScroll}>
                    {[
                        { key: 'scanner', label: 'Scanner' },
                        { key: 'assets', label: 'Scanned Assets' },
                        ...(isAdmin ? [{ key: 'audit', label: 'Audit' }] : []),
                        { key: 'report', label: 'Report' },
                        { key: 'property-qr', label: 'Property QR' },
                        { key: 'generate-qr', label: 'Generate QR' },
                    ].map((tab) => (
                        <TouchableOpacity
                            key={tab.key}
                            style={[styles.tab, activeTab === tab.key && styles.tabActive]}
                            onPress={() => setActiveTab(tab.key as TabType)}
                        >
                            <Text style={[styles.tabText, activeTab === tab.key && styles.tabTextActive]}>
                                {tab.label}
                            </Text>
                        </TouchableOpacity>
                    ))}
                </ScrollView>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#0b1220' },
    header: { backgroundColor: '#111a2d', borderBottomWidth: 1, borderBottomColor: '#1f2b44', paddingHorizontal: 14, paddingTop: 8, paddingBottom: 8 },
    headerContent: { flexDirection: 'row', alignItems: 'center' },
    backButton: { paddingRight: 12 },
    backButtonText: { fontSize: 14, fontWeight: '700', color: '#93c5fd' },
    logoutButton: { marginLeft: 'auto', borderRadius: 999, backgroundColor: '#991b1b', paddingHorizontal: 12, paddingVertical: 8 },
    logoutButtonText: { color: '#fecaca', fontSize: 12, fontWeight: '800' },
    bottomDock: { backgroundColor: '#111a2d', borderTopWidth: 1, borderTopColor: '#1f2b44' },
    tabScroll: { flexDirection: 'row', paddingHorizontal: 4, paddingVertical: 6, gap: 6 },
    tab: { paddingVertical: 10, paddingHorizontal: 14, alignItems: 'center', borderRadius: 10, backgroundColor: '#0b1220', borderWidth: 1, borderColor: '#263552' },
    tabActive: { backgroundColor: '#2563EB', borderColor: '#2563EB' },
    tabText: { fontSize: 13, fontWeight: '700', color: '#9bb0d2' },
    tabTextActive: { color: '#ffffff' },
    content: { flex: 1 },
    loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0b1220' },
    loadingText: { marginTop: 12, color: '#9bb0d2', fontWeight: '600' },
});
