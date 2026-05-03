import React, { useEffect, useMemo, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    FlatList,
    Modal,
    RefreshControl,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { Condition, RpcInventoryScanRecord } from '../../../types';
import ApiService from '../../shared/services/apiService';

interface ScannedAssetsScreenProps {
    cycleId: number;
}

export function ScannedAssetsScreen({ cycleId }: ScannedAssetsScreenProps): React.JSX.Element {
    const [scans, setScans] = useState<RpcInventoryScanRecord[]>([]);
    const [conditions, setConditions] = useState<Condition[]>([]);
    const [loading, setLoading] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [searchText, setSearchText] = useState('');
    const [filterType, setFilterType] = useState<'ALL' | 'RPCPPE' | 'RPCSEP'>('ALL');
    const [editingScan, setEditingScan] = useState<RpcInventoryScanRecord | null>(null);
    const [editConditionId, setEditConditionId] = useState<number | null>(null);
    const [editRemarks, setEditRemarks] = useState('');
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        void loadScans();
        void loadConditions();
    }, [cycleId]);

    async function loadConditions(): Promise<void> {
        try {
            const response = await ApiService.getConditions();
            setConditions(response);
        } catch (error) {
            console.error('Failed to load conditions:', error);
        }
    }

    async function loadScans(): Promise<void> {
        setLoading(true);
        try {
            const response = await ApiService.getRpcInventoryCycleScans(cycleId, {
                page: 1,
                per_page: 100,
            });
            setScans(response.data);
        } catch (error) {
            console.error('Failed to load scans:', error);
            setScans([]);
        } finally {
            setLoading(false);
        }
    }

    async function onRefresh(): Promise<void> {
        setRefreshing(true);
        try {
            await loadScans();
        } finally {
            setRefreshing(false);
        }
    }

    const filteredScans = useMemo(() => {
        const needle = searchText.trim().toLowerCase();

        return scans.filter((scan) => {
            const matchesSearch =
                needle.length === 0 ||
                scan.property_number?.toLowerCase().includes(needle) ||
                scan.article?.toLowerCase().includes(needle) ||
                scan.accountable_officer?.toLowerCase().includes(needle) ||
                scan.description?.toLowerCase().includes(needle);

            const matchesType = filterType === 'ALL' || scan.rpc_type === filterType;

            return matchesSearch && matchesType;
        });
    }, [filterType, scans, searchText]);

    function openEditor(scan: RpcInventoryScanRecord): void {
        setEditingScan(scan);
        setEditConditionId(scan.condition_id);
        setEditRemarks(scan.remarks ?? '');
    }

    function closeEditor(): void {
        setEditingScan(null);
        setEditConditionId(null);
        setEditRemarks('');
    }

    async function saveEditor(): Promise<void> {
        if (!editingScan || !editConditionId) {
            Alert.alert('Validation', 'Please select a condition.');
            return;
        }

        setSaving(true);
        try {
            await ApiService.updateRpcScan(editingScan.id, {
                condition_id: editConditionId,
                remarks: editRemarks.trim() || null,
            });
            closeEditor();
            await loadScans();
        } catch (error) {
            console.error('Failed to update scan:', error);
            Alert.alert('Error', 'Failed to update scanned asset.');
        } finally {
            setSaving(false);
        }
    }

    function handleDeleteScan(scanId: number): void {
        Alert.alert('Remove scan', 'Remove this scanned asset from the selected cycle?', [
            { text: 'Cancel', style: 'cancel' },
            {
                text: 'Remove',
                style: 'destructive',
                onPress: async () => {
                    try {
                        await ApiService.deleteRpcScan(scanId);
                        await loadScans();
                    } catch (error) {
                        console.error('Failed to delete scan:', error);
                        Alert.alert('Error', 'Failed to delete scan.');
                    }
                },
            },
        ]);
    }

    const renderScanItem = (scan: RpcInventoryScanRecord) => (
        <View style={styles.assetCard}>
            <View style={styles.assetHeader}>
                <Text style={styles.assetTitle}>{scan.property_number ?? 'No property number'}</Text>
                <View style={styles.assetTypeChip}>
                    <Text style={styles.assetTypeChipText}>{scan.rpc_type}</Text>
                </View>
            </View>

            <Text style={styles.assetArticle}>{scan.article ?? 'No article'}</Text>
            <Text style={styles.assetMeta}>Officer: {scan.accountable_officer ?? scan.scanned_by?.FullName ?? '—'}</Text>

            <View style={styles.assetStatsRow}>
                <View style={styles.assetStatBox}>
                    <Text style={styles.assetStatLabel}>Condition</Text>
                    <Text style={styles.assetStatValue}>{scan.condition?.ConditionName ?? '—'}</Text>
                </View>
                <View style={styles.assetStatBox}>
                    <Text style={styles.assetStatLabel}>Count</Text>
                    <Text style={styles.assetStatValue}>{scan.quantity_per_count}</Text>
                </View>
            </View>

            <View style={styles.actionsCell}>
                <TouchableOpacity style={styles.actionButton} onPress={() => openEditor(scan)}>
                    <Text style={styles.actionButtonText}>Edit</Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={[styles.actionButton, styles.deleteButton]}
                    onPress={() => handleDeleteScan(scan.id)}
                >
                    <Text style={styles.actionButtonText}>Remove</Text>
                </TouchableOpacity>
            </View>
        </View>
    );

    if (loading && scans.length === 0) {
        return (
            <View style={styles.centerLoading}>
                <ActivityIndicator size="large" color="#2563EB" />
                <Text style={styles.loadingText}>Loading scanned assets...</Text>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <View style={styles.filterBar}>
                <Text style={styles.screenTitle}>Scanned Assets</Text>
                <Text style={styles.screenSubtitle}>Review, filter, and correct scanned entries for this cycle.</Text>
                <TextInput
                    style={styles.searchInput}
                    placeholder="Search property/article"
                    placeholderTextColor="#94a3b8"
                    value={searchText}
                    onChangeText={setSearchText}
                />
                <View style={styles.filterButtons}>
                    {(['ALL', 'RPCPPE', 'RPCSEP'] as const).map((type) => (
                        <TouchableOpacity
                            key={type}
                            style={[
                                styles.filterButton,
                                filterType === type && styles.filterButtonActive,
                            ]}
                            onPress={() => setFilterType(type)}
                        >
                            <Text
                                style={[
                                    styles.filterButtonText,
                                    filterType === type && styles.filterButtonTextActive,
                                ]}
                            >
                                {type}
                            </Text>
                        </TouchableOpacity>
                    ))}
                </View>
            </View>

            {filteredScans.length === 0 ? (
                <View style={styles.emptyContainer}>
                    <Text style={styles.emptyText}>No scanned assets yet for this cycle.</Text>
                </View>
            ) : (
                <FlatList
                    data={filteredScans}
                    keyExtractor={(item) => item.id.toString()}
                    renderItem={({ item }) => renderScanItem(item)}
                    refreshControl={
                        <RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} />
                    }
                    contentContainerStyle={styles.listContent}
                />
            )}

            <Modal visible={editingScan !== null} transparent animationType="slide" onRequestClose={closeEditor}>
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <Text style={styles.modalTitle}>Edit Scanned Asset</Text>
                        <TouchableOpacity style={styles.closeButton} onPress={closeEditor}>
                            <Text style={styles.closeButtonText}>✕</Text>
                        </TouchableOpacity>

                        <Text style={styles.sectionLabel}>Condition</Text>
                        <View style={styles.conditionList}>
                            {conditions.map((condition) => {
                                const selected = condition.ConditionID === editConditionId;
                                return (
                                    <TouchableOpacity
                                        key={condition.ConditionID}
                                        style={[styles.conditionChip, selected && styles.conditionChipSelected]}
                                        onPress={() => setEditConditionId(condition.ConditionID)}
                                    >
                                        <Text
                                            style={[
                                                styles.conditionChipText,
                                                selected && styles.conditionChipTextSelected,
                                            ]}
                                        >
                                            {condition.ConditionName}
                                        </Text>
                                    </TouchableOpacity>
                                );
                            })}
                        </View>

                        <Text style={styles.sectionLabel}>Remarks</Text>
                        <TextInput
                            style={styles.remarksInput}
                            placeholder="Add remarks"
                            placeholderTextColor="#94a3b8"
                            value={editRemarks}
                            onChangeText={setEditRemarks}
                            multiline
                        />

                        <View style={styles.modalActions}>
                            <TouchableOpacity style={styles.cancelButton} onPress={closeEditor} disabled={saving}>
                                <Text style={styles.cancelButtonText}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.saveButton} onPress={() => void saveEditor()} disabled={saving}>
                                <Text style={styles.saveButtonText}>{saving ? 'Saving...' : 'Save'}</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#0b1220' },
    filterBar: {
        backgroundColor: '#111a2d',
        paddingHorizontal: 14,
        paddingTop: 14,
        paddingBottom: 12,
        borderBottomWidth: 1,
        borderBottomColor: '#1f2b44',
    },
    screenTitle: { fontSize: 22, fontWeight: '900', color: '#f8fafc' },
    screenSubtitle: { marginTop: 4, marginBottom: 12, fontSize: 12, color: '#93a6c4' },
    searchInput: {
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#263552',
        backgroundColor: '#0b1220',
        paddingHorizontal: 12,
        paddingVertical: 10,
        color: '#f8fafc',
        marginBottom: 10,
    },
    filterButtons: { flexDirection: 'row', gap: 8 },
    filterButton: {
        borderRadius: 999,
        borderWidth: 1,
        borderColor: '#334463',
        backgroundColor: '#0b1220',
        paddingHorizontal: 14,
        paddingVertical: 7,
    },
    filterButtonActive: { backgroundColor: '#2563eb', borderColor: '#2563eb' },
    filterButtonText: { fontSize: 12, fontWeight: '700', color: '#a7b7d1' },
    filterButtonTextActive: { color: '#ffffff' },
    listContent: { paddingHorizontal: 12, paddingVertical: 10 },
    assetCard: {
        borderRadius: 16,
        borderWidth: 1,
        borderColor: '#263552',
        backgroundColor: '#111a2d',
        padding: 12,
        marginBottom: 10,
    },
    assetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    assetTitle: { flex: 1, paddingRight: 8, fontSize: 16, fontWeight: '800', color: '#f8fafc' },
    assetTypeChip: { borderRadius: 999, backgroundColor: '#1d4ed8', paddingHorizontal: 10, paddingVertical: 5 },
    assetTypeChipText: { color: '#ffffff', fontSize: 11, fontWeight: '800' },
    assetArticle: { marginTop: 8, fontSize: 13, color: '#dbe7ff' },
    assetMeta: { marginTop: 4, fontSize: 12, color: '#9bb0d2' },
    assetStatsRow: { marginTop: 10, flexDirection: 'row', gap: 8 },
    assetStatBox: { flex: 1, borderRadius: 12, backgroundColor: '#0b1220', borderWidth: 1, borderColor: '#263552', padding: 10 },
    assetStatLabel: { fontSize: 10, color: '#8aa0c5', textTransform: 'uppercase', fontWeight: '800' },
    assetStatValue: { marginTop: 4, fontSize: 13, color: '#f8fafc', fontWeight: '700' },
    actionsCell: { marginTop: 10, flexDirection: 'row', gap: 8 },
    actionButton: { flex: 1, paddingVertical: 10, borderRadius: 10, backgroundColor: '#1e293b', alignItems: 'center' },
    deleteButton: { backgroundColor: '#991b1b' },
    actionButtonText: { color: '#ffffff', fontSize: 12, fontWeight: '800' },
    emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 16 },
    emptyText: { fontSize: 14, color: '#9bb0d2', textAlign: 'center' },
    centerLoading: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0b1220' },
    loadingText: { marginTop: 12, fontSize: 14, color: '#9bb0d2' },
    modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
    modalContent: { backgroundColor: '#111a2d', borderTopLeftRadius: 18, borderTopRightRadius: 18, paddingHorizontal: 16, paddingVertical: 24, minHeight: 420, borderTopWidth: 1, borderColor: '#263552' },
    modalTitle: { fontSize: 18, fontWeight: '700', color: '#f8fafc', marginBottom: 16 },
    closeButton: { position: 'absolute', top: 16, right: 16, width: 32, height: 32, justifyContent: 'center', alignItems: 'center' },
    closeButtonText: { fontSize: 20, color: '#f8fafc' },
    sectionLabel: { marginTop: 8, marginBottom: 8, fontSize: 14, fontWeight: '700', color: '#c5d5ef' },
    conditionList: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    conditionChip: { borderRadius: 999, borderWidth: 1, borderColor: '#334463', paddingHorizontal: 12, paddingVertical: 8, marginBottom: 8, backgroundColor: '#0b1220' },
    conditionChipSelected: { backgroundColor: '#2563EB', borderColor: '#2563EB' },
    conditionChipText: { color: '#c5d5ef', fontWeight: '600', fontSize: 12 },
    conditionChipTextSelected: { color: '#fff' },
    remarksInput: { minHeight: 96, borderRadius: 12, borderWidth: 1, borderColor: '#334463', backgroundColor: '#0b1220', paddingHorizontal: 12, paddingVertical: 10, color: '#f8fafc' },
    modalActions: { flexDirection: 'row', gap: 12, marginTop: 20 },
    cancelButton: { flex: 1, borderRadius: 12, backgroundColor: '#475569', alignItems: 'center', paddingVertical: 12 },
    cancelButtonText: { color: '#fff', fontWeight: '700' },
    saveButton: { flex: 1, borderRadius: 12, backgroundColor: '#2563EB', alignItems: 'center', paddingVertical: 12 },
    saveButtonText: { color: '#fff', fontWeight: '700' },
});
