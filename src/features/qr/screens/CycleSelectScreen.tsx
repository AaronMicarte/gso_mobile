import React, { useCallback, useEffect, useState } from 'react';
import {
    ActivityIndicator,
    FlatList,
    RefreshControl,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { RpcCycle } from '../../../types';
import ApiService from '../../shared/services/apiService';

interface CycleSelectScreenProps {
    onSelectCycle: (cycleId: number) => void;
}

const REFRESH_INTERVAL_MS = 10000;

export function CycleSelectScreen({ onSelectCycle }: CycleSelectScreenProps): React.JSX.Element {
    const [cycles, setCycles] = useState<RpcCycle[]>([]);
    const [loading, setLoading] = useState(false);
    const [refreshing, setRefreshing] = useState(false);

    const loadCycles = useCallback(async (): Promise<void> => {
        setLoading(true);
        try {
            const response = await ApiService.listRpcInventoryCycles();
            setCycles(response.data);
        } catch (error) {
            console.error('Failed to load cycles:', error);
            setCycles([]);
        } finally {
            setLoading(false);
        }
    }, []);

    useFocusEffect(
        useCallback(() => {
            void loadCycles();
        }, [loadCycles])
    );

    useEffect(() => {
        if (!cycles.length) {
            return;
        }

        const timer = setInterval(() => {
            void loadCycles();
        }, REFRESH_INTERVAL_MS);

        return () => clearInterval(timer);
    }, [cycles.length, loadCycles]);

    async function onRefresh(): Promise<void> {
        setRefreshing(true);
        try {
            await loadCycles();
        } finally {
            setRefreshing(false);
        }
    }

    async function handleCreateCycle(): Promise<void> {
        setLoading(true);
        try {
            await ApiService.createCurrentRpcInventoryCycle();
            await loadCycles();
        } catch (error) {
            console.error('Failed to create cycle:', error);
        } finally {
            setLoading(false);
        }
    }

    const renderCycleItem = (item: RpcCycle) => (
        <TouchableOpacity
            style={styles.cycleCard}
            onPress={() => onSelectCycle(item.id)}
        >
            <View style={styles.cycleHeader}>
                <Text style={styles.cycleLabel}>{item.cycle_label}</Text>
                <Text style={styles.cycleStatus}>{item.status.toUpperCase()}</Text>
            </View>

            <View style={styles.statsContainer}>
                <View style={styles.statBox}>
                    <Text style={styles.statValue}>{item.scans_count}</Text>
                    <Text style={styles.statLabel}>Total</Text>
                </View>
                <View style={styles.statBox}>
                    <Text style={styles.statValue}>{item.rpcppe_count}</Text>
                    <Text style={styles.statLabel}>RPCPPE</Text>
                </View>
                <View style={styles.statBox}>
                    <Text style={styles.statValue}>{item.rpcsep_count}</Text>
                    <Text style={styles.statLabel}>RPCSEP</Text>
                </View>
            </View>
        </TouchableOpacity>
    );

    if (loading && cycles.length === 0) {
        return (
            <View style={styles.centered}>
                <ActivityIndicator size="large" color="#2563EB" />
                <Text style={styles.loadingText}>Loading cycles...</Text>
            </View>
        );
    }

    if (cycles.length === 0) {
        return (
            <View style={styles.emptyContainer}>
                <Text style={styles.emptyTitle}>No Cycles Found</Text>
                <Text style={styles.emptySubtitle}>Create one to get started</Text>
                <TouchableOpacity
                    style={styles.createButton}
                    onPress={() => void handleCreateCycle()}
                >
                    <Text style={styles.createButtonText}>Create Current Year Cycle</Text>
                </TouchableOpacity>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <FlatList
                data={cycles}
                keyExtractor={(item) => item.id.toString()}
                renderItem={({ item }) => renderCycleItem(item)}
                refreshControl={
                    <RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} />
                }
                contentContainerStyle={styles.listContent}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f8fafc', paddingHorizontal: 16, paddingTop: 8 },
    centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    loadingText: { marginTop: 12, fontSize: 16, color: '#64748b' },
    emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 16 },
    emptyTitle: { fontSize: 20, fontWeight: '700', color: '#0f172a', marginBottom: 8 },
    emptySubtitle: { fontSize: 14, color: '#64748b', marginBottom: 24 },
    createButton: { borderRadius: 12, backgroundColor: '#2563EB', paddingHorizontal: 20, paddingVertical: 12 },
    createButtonText: { color: '#fff', fontWeight: '700', fontSize: 14 },
    listContent: { paddingVertical: 8 },
    cycleCard: { borderRadius: 12, backgroundColor: '#fff', borderWidth: 1, borderColor: '#e2e8f0', padding: 16, marginBottom: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 2 },
    cycleHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
    cycleLabel: { fontSize: 18, fontWeight: '700', color: '#0f172a' },
    cycleStatus: { fontSize: 11, fontWeight: '700', color: '#10b981', backgroundColor: '#d1fae5', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
    statsContainer: { flexDirection: 'row', justifyContent: 'space-around' },
    statBox: { flex: 1, alignItems: 'center' },
    statValue: { fontSize: 24, fontWeight: '900', color: '#2563EB' },
    statLabel: { marginTop: 4, fontSize: 12, color: '#64748b' },
});
