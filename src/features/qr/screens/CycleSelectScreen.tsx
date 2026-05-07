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

function formatCycleDate(value: string | null): string {
    if (!value) {
        return '-';
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return '-';
    }

    return date.toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
    });
}

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

            <Text style={styles.cycleDate}>{formatCycleDate(item.started_at)}</Text>

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
            <View style={styles.heroCard}>
                <Text style={styles.heroTitle}>Select Inventory Cycle</Text>
                <Text style={styles.heroSubtitle}>Choose an active cycle to start scanning, review assets, and generate reports.</Text>
            </View>

            <TouchableOpacity
                style={styles.createButton}
                onPress={() => void handleCreateCycle()}
            >
                <Text style={styles.createButtonText}>Create Current Year Cycle</Text>
            </TouchableOpacity>

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
    container: { flex: 1, backgroundColor: '#0b1220', paddingHorizontal: 14, paddingTop: 10 },
    centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0b1220' },
    loadingText: { marginTop: 12, fontSize: 16, color: '#9bb0d2' },
    emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 16 },
    emptyTitle: { fontSize: 20, fontWeight: '700', color: '#f8fafc', marginBottom: 8 },
    emptySubtitle: { fontSize: 14, color: '#9bb0d2', marginBottom: 24 },
    heroCard: {
        borderRadius: 18,
        borderWidth: 1,
        borderColor: '#263552',
        backgroundColor: '#111a2d',
        paddingHorizontal: 14,
        paddingVertical: 14,
        marginBottom: 10,
    },
    heroTitle: { fontSize: 22, fontWeight: '900', color: '#f8fafc' },
    heroSubtitle: { marginTop: 4, fontSize: 12, color: '#9bb0d2' },
    createButton: {
        borderRadius: 12,
        backgroundColor: '#2563EB',
        borderWidth: 1,
        borderColor: '#3b82f6',
        paddingHorizontal: 20,
        paddingVertical: 11,
        marginBottom: 10,
        alignItems: 'center',
    },
    createButtonText: { color: '#fff', fontWeight: '700', fontSize: 14 },
    listContent: { paddingVertical: 2, paddingBottom: 20 },
    cycleCard: {
        borderRadius: 14,
        backgroundColor: '#111a2d',
        borderWidth: 1,
        borderColor: '#263552',
        padding: 14,
        marginBottom: 10,
    },
    cycleHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
    cycleLabel: { fontSize: 17, fontWeight: '800', color: '#f8fafc' },
    cycleStatus: { fontSize: 11, fontWeight: '800', color: '#052e16', backgroundColor: '#4ade80', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999 },
    cycleDate: { marginBottom: 10, fontSize: 12, color: '#9bb0d2' },
    statsContainer: { flexDirection: 'row', justifyContent: 'space-around', borderTopWidth: 1, borderTopColor: '#223252', paddingTop: 10 },
    statBox: { flex: 1, alignItems: 'center' },
    statValue: { fontSize: 22, fontWeight: '900', color: '#93c5fd' },
    statLabel: { marginTop: 4, fontSize: 11, color: '#9bb0d2' },
});
