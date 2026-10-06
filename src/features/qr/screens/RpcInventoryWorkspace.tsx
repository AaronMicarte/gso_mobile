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
import AuthService from '../../auth/services/authService';
import { CycleSelectScreen } from './CycleSelectScreen';
import ScannerScreen from './ScannerScreen';
import { ScannedAssetsScreen } from './ScannedAssetsScreen';
import { RpcInventoryReportScreen } from './RpcInventoryReportScreen';
import { RpcInventoryAuditScreen } from './RpcInventoryAuditScreen';

type TabType = 'cycles' | 'scanner' | 'assets' | 'report' | 'audit';
const REFRESH_INTERVAL_MS = 60000;

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
    const [bootstrapped, setBootstrapped] = useState(false);

    // On mount: if we have no cycle yet, try the cached one from SecureStore.
    // This lets the workspace open the scanner even when offline.
    useEffect(() => {
        let cancelled = false;
        const bootstrap = async () => {
            if (selectedCycleId) {
                setBootstrapped(true);
                return;
            }
            try {
                const cached = await AuthService.getSecureItem('last_active_cycle_id');
                if (!cancelled && cached) {
                    setSelectedCycleId(Number(cached));
                    setActiveTab('scanner');
                }
            } catch {
                /* ignore */
            }
            if (!cancelled) setBootstrapped(true);
        };
        void bootstrap();
        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

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
                try {
                    await AuthService.setSecureItem('last_active_cycle_id', String(selectedCycle.id));
                } catch {
                    /* ignore */
                }
            } else {
                setSelectedCycleId(null);
                setCycleInfo(null);
                setActiveTab('cycles');
            }
        } catch (error) {
            console.warn('[Workspace] Offline or backend unreachable — using cached cycle data');
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
        void AuthService.setSecureItem('last_active_cycle_id', String(cycleId));
    };

    const handleBackToCycles = () => {
        setSelectedCycleId(null);
        setCycleInfo(null);
        setActiveTab('cycles');
    };

    if (loadingCycles && !selectedCycleId && !bootstrapped) {
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

            <View style={styles.content}>
                {cycleInfo?.status === 'closed' ? (
                    <View style={styles.closedContainer}>
                        <Text style={styles.closedText}>
                            This year's RPCPPE has been closed. If you are an Administrator, you may reopen it through the web application.
                        </Text>
                    </View>
                ) : (
                    <>
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
                    </>
                )}
            </View>

            <View style={styles.bottomDock}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabScroll}>
                    {[
                        { key: 'scanner', label: 'Scanner' },
                        { key: 'assets', label: 'Scanned Assets' },
                        ...(isAdmin ? [{ key: 'audit', label: 'Audit' }] : []),
                        { key: 'report', label: 'Report' },
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
    closedContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 },
    closedText: { color: '#f8fafc', textAlign: 'center', fontSize: 16, lineHeight: 22 },
});