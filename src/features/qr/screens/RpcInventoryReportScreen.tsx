import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import ApiService from '../../shared/services/apiService';
import type { RpcInventoryReportResponse, RpcInventoryReportRow, RpcType } from '../../../types';

interface RpcInventoryReportScreenProps {
    cycleId: number;
}

function formatCurrency(value: number): string {
    return Number(value || 0).toLocaleString('en-PH', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });
}

export function RpcInventoryReportScreen({ cycleId }: RpcInventoryReportScreenProps): React.JSX.Element {
    const [report, setReport] = useState<RpcInventoryReportResponse | null>(null);
    const [loading, setLoading] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [reportType, setReportType] = useState<RpcType>('RPCPPE');

    const load = async (): Promise<void> => {
        setLoading(true);
        try {
            const data = await ApiService.getRpcInventoryReport(cycleId);
            setReport(data);
        } catch (error) {
            console.error('Failed to load RPC report:', error);
            setReport(null);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        void load();
    }, [cycleId]);

    const bucket = report ? (reportType === 'RPCPPE' ? report.rpcppe : report.rpcsep) : null;

    const groupedRows = useMemo(() => {
        if (!bucket) return [];
        const groups = new Map<string, RpcInventoryReportRow[]>();
        for (const row of bucket.rows) {
            const key = (row.property_type || '-').trim() || '-';
            const next = groups.get(key) ?? [];
            next.push(row);
            groups.set(key, next);
        }

        return Array.from(groups.entries()).map(([propertyType, rows]) => ({
            propertyType,
            rows: rows.sort((a, b) => a.property_number.localeCompare(b.property_number, undefined, { sensitivity: 'base' })),
        }));
    }, [bucket]);

    if (loading && !report) {
        return (
            <View style={styles.centered}>
                <ActivityIndicator size="large" color="#2563EB" />
                <Text style={styles.loadingText}>Loading report...</Text>
            </View>
        );
    }

    if (!report || !bucket) {
        return (
            <View style={styles.centered}>
                <Text style={styles.emptyText}>Report not available.</Text>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <Text style={styles.title}>{reportType} Report</Text>
                <Text style={styles.subtitle}>{report.cycle.cycle_label}</Text>
            </View>

            <View style={styles.toggleRow}>
                {(['RPCPPE', 'RPCSEP'] as const).map((type) => (
                    <TouchableOpacity key={type} style={[styles.toggleButton, reportType === type && styles.toggleButtonActive]} onPress={() => setReportType(type)}>
                        <Text style={[styles.toggleButtonText, reportType === type && styles.toggleButtonTextActive]}>{type}</Text>
                    </TouchableOpacity>
                ))}
                <TouchableOpacity style={styles.refreshButton} onPress={() => void load()}>
                    <Text style={styles.refreshButtonText}>Refresh</Text>
                </TouchableOpacity>
            </View>

            <View style={styles.summaryRow}>
                <SummaryCard label="Scanned" value={bucket.scanned_count} />
                <SummaryCard label="Total" value={bucket.total_count} />
            </View>

            <ScrollView
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); try { await load(); } finally { setRefreshing(false); } }} />}
                contentContainerStyle={styles.listContent}
            >
                {groupedRows.map((group) => (
                    <View key={group.propertyType} style={styles.groupCard}>
                        <Text style={styles.groupTitle}>{group.propertyType}</Text>
                        {group.rows.map((row) => (
                            <View key={`${group.propertyType}-${row.property_number}`} style={styles.rowCard}>
                                <Text style={styles.rowTitle}>{row.property_number}</Text>
                                <Text style={styles.rowMeta}>{row.article}</Text>
                                <Text style={styles.rowMeta}>{row.description}</Text>
                                <View style={styles.rowGrid}>
                                    <MiniStat label="Unit value" value={formatCurrency(row.unit_value)} />
                                    <MiniStat label="Card" value={String(row.quantity_per_card)} />
                                    <MiniStat label="Count" value={String(row.quantity_per_count)} />
                                    <MiniStat label="Shortage / Over" value={String(row.shortage_overage_qty)} />
                                </View>
                                <Text style={styles.rowFooter}>Dept: {row.department} · Condition: {row.condition ?? '—'}</Text>
                            </View>
                        ))}
                        {group.rows.length === 0 ? <Text style={styles.emptyText}>No rows in this group.</Text> : null}
                    </View>
                ))}
            </ScrollView>
        </View>
    );
}

function SummaryCard({ label, value }: { label: string; value: number }): React.JSX.Element {
    return (
        <View style={styles.summaryCard}>
            <Text style={styles.summaryValue}>{value}</Text>
            <Text style={styles.summaryLabel}>{label}</Text>
        </View>
    );
}

function MiniStat({ label, value }: { label: string; value: string }): React.JSX.Element {
    return (
        <View style={styles.miniStat}>
            <Text style={styles.miniStatLabel}>{label}</Text>
            <Text style={styles.miniStatValue}>{value}</Text>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f8fafc' },
    centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f8fafc', paddingHorizontal: 16 },
    loadingText: { marginTop: 12, color: '#64748b' },
    emptyText: { color: '#64748b', fontSize: 14 },
    header: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 },
    title: { fontSize: 22, fontWeight: '900', color: '#0f172a' },
    subtitle: { marginTop: 4, fontSize: 13, color: '#64748b' },
    toggleRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingTop: 8 },
    toggleButton: { borderRadius: 999, borderWidth: 1, borderColor: '#cbd5e1', backgroundColor: '#fff', paddingHorizontal: 12, paddingVertical: 8 },
    toggleButtonActive: { backgroundColor: '#2563EB', borderColor: '#2563EB' },
    toggleButtonText: { fontSize: 12, fontWeight: '800', color: '#334155' },
    toggleButtonTextActive: { color: '#fff' },
    refreshButton: { marginLeft: 'auto', borderRadius: 999, backgroundColor: '#0f172a', paddingHorizontal: 12, paddingVertical: 8 },
    refreshButtonText: { color: '#fff', fontSize: 12, fontWeight: '800' },
    summaryRow: { flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingTop: 12 },
    summaryCard: { flex: 1, borderRadius: 16, backgroundColor: '#fff', borderWidth: 1, borderColor: '#e2e8f0', paddingVertical: 14, alignItems: 'center' },
    summaryValue: { fontSize: 24, fontWeight: '900', color: '#2563EB' },
    summaryLabel: { marginTop: 4, fontSize: 12, fontWeight: '700', color: '#64748b' },
    listContent: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 24, gap: 12 },
    groupCard: { borderRadius: 18, backgroundColor: '#fff', borderWidth: 1, borderColor: '#e2e8f0', padding: 14, gap: 10 },
    groupTitle: { fontSize: 16, fontWeight: '900', color: '#0f172a' },
    rowCard: { borderRadius: 16, backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e2e8f0', padding: 12, gap: 4 },
    rowTitle: { fontSize: 15, fontWeight: '900', color: '#0f172a' },
    rowMeta: { fontSize: 12, color: '#475569' },
    rowGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingTop: 8 },
    miniStat: { width: '48%', borderRadius: 12, backgroundColor: '#fff', borderWidth: 1, borderColor: '#e2e8f0', padding: 10 },
    miniStatLabel: { fontSize: 10, fontWeight: '800', color: '#64748b', textTransform: 'uppercase' },
    miniStatValue: { marginTop: 4, fontSize: 13, fontWeight: '800', color: '#0f172a' },
    rowFooter: { marginTop: 6, fontSize: 12, color: '#64748b' },
});