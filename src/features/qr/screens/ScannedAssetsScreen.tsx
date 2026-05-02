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
        <View style={styles.tableRow}>
            <Text style={[styles.tableCell, styles.typeCell]}>{scan.rpc_type}</Text>
            <Text style={[styles.tableCell, styles.numberCell]}>{scan.property_number ?? '—'}</Text>
            <Text style={[styles.tableCell, styles.articleCell]}>{scan.article ?? '—'}</Text>
            <Text style={[styles.tableCell, styles.officerCell]}>
                {scan.accountable_officer ?? scan.scanned_by?.FullName ?? '—'}
            </Text>
            <Text style={[styles.tableCell, styles.conditionCell]}>
                {scan.condition?.ConditionName ?? '—'}
            </Text>
            <Text style={[styles.tableCell, styles.countCell]}>{scan.quantity_per_count}</Text>
            <View style={styles.actionsCell}>
                <TouchableOpacity style={styles.actionButton} onPress={() => openEditor(scan)}>
                    <Text style={styles.actionButtonText}>✎</Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={[styles.actionButton, styles.deleteButton]}
                    onPress={() => handleDeleteScan(scan.id)}
                >
                    <Text style={styles.actionButtonText}>🗑</Text>
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
    container: { flex: 1, backgroundColor: '#f8fafc' },
    filterBar: { backgroundColor: '#fff', paddingHorizontal: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#e2e8f0' },
    searchInput: { borderRadius: 8, borderWidth: 1, borderColor: '#e2e8f0', backgroundColor: '#f1f5f9', paddingHorizontal: 12, paddingVertical: 8, color: '#0f172a', marginBottom: 8 },
    filterButtons: { flexDirection: 'row', gap: 8 },
    filterButton: { borderRadius: 6, borderWidth: 1, borderColor: '#cbd5e1', paddingHorizontal: 12, paddingVertical: 6 },
    filterButtonActive: { backgroundColor: '#2563EB', borderColor: '#2563EB' },
    filterButtonText: { fontSize: 12, fontWeight: '600', color: '#64748b' },
    filterButtonTextActive: { color: '#fff' },
    listContent: { paddingHorizontal: 12, paddingVertical: 8 },
    tableRow: { backgroundColor: '#fff', borderRadius: 8, borderWidth: 1, borderColor: '#e2e8f0', padding: 12, marginBottom: 8, flexDirection: 'row', alignItems: 'center' },
    tableCell: { fontSize: 12, color: '#0f172a', flex: 1 },
    typeCell: { fontWeight: '600', maxWidth: 60 },
    numberCell: { maxWidth: 80 },
    articleCell: { flex: 2 },
    officerCell: { maxWidth: 70 },
    conditionCell: { maxWidth: 60 },
    countCell: { textAlign: 'center', maxWidth: 30 },
    actionsCell: { flexDirection: 'row', gap: 4 },
    actionButton: { padding: 4, borderRadius: 4, backgroundColor: '#f1f5f9' },
    deleteButton: { backgroundColor: '#fee2e2' },
    actionButtonText: { fontSize: 14 },
    emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 16 },
    emptyText: { fontSize: 14, color: '#64748b', textAlign: 'center' },
    centerLoading: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    loadingText: { marginTop: 12, fontSize: 14, color: '#64748b' },
    modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
    modalContent: { backgroundColor: '#fff', borderTopLeftRadius: 16, borderTopRightRadius: 16, paddingHorizontal: 16, paddingVertical: 24, minHeight: 420 },
    modalTitle: { fontSize: 18, fontWeight: '700', color: '#0f172a', marginBottom: 16 },
    closeButton: { position: 'absolute', top: 16, right: 16, width: 32, height: 32, justifyContent: 'center', alignItems: 'center' },
    closeButtonText: { fontSize: 20, color: '#0f172a' },
    sectionLabel: { marginTop: 8, marginBottom: 8, fontSize: 14, fontWeight: '700', color: '#334155' },
    conditionList: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    conditionChip: { borderRadius: 999, borderWidth: 1, borderColor: '#cbd5e1', paddingHorizontal: 12, paddingVertical: 8, marginBottom: 8 },
    conditionChipSelected: { backgroundColor: '#2563EB', borderColor: '#2563EB' },
    conditionChipText: { color: '#334155', fontWeight: '600', fontSize: 12 },
    conditionChipTextSelected: { color: '#fff' },
    remarksInput: { minHeight: 96, borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0', backgroundColor: '#f8fafc', paddingHorizontal: 12, paddingVertical: 10, color: '#0f172a' },
    modalActions: { flexDirection: 'row', gap: 12, marginTop: 20 },
    cancelButton: { flex: 1, borderRadius: 12, backgroundColor: '#94a3b8', alignItems: 'center', paddingVertical: 12 },
    cancelButtonText: { color: '#fff', fontWeight: '700' },
    saveButton: { flex: 1, borderRadius: 12, backgroundColor: '#2563EB', alignItems: 'center', paddingVertical: 12 },
    saveButtonText: { color: '#fff', fontWeight: '700' },
});
