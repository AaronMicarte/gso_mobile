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

type GroupedScanRow = {
    key: string;
    primaryScan: RpcInventoryScanRecord;
    scans: RpcInventoryScanRecord[];
    propertyNumbersPreview: string;
    propertyNumbersFull: string[];
    scansCount: number;
    conditionPreview: string;
    latestScanAt: string;
};

type EditScanItem = {
    scanId: number;
    propertyNumber: string;
    included: boolean;
};

function getScanTimestamp(scan: RpcInventoryScanRecord): number {
    return new Date(scan.scanned_at || scan.created_at).getTime();
}

function formatDateTime(value: string): string {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return value;
    }

    return date.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
    });
}

function normalizeAccountableOfficer(value: string | null | undefined): string {
    if (!value) {
        return '';
    }

    const parts = value.split('-').map((p) => p.trim());
    const seen = new Set<string>();
    const unique: string[] = [];

    for (const part of parts) {
        if (!seen.has(part)) {
            unique.push(part);
            seen.add(part);
        }
    }

    return unique.join(' - ');
}

function buildGroupKey(scan: RpcInventoryScanRecord): string {
    return [
        scan.rpc_type ?? '',
        scan.article ?? '',
        scan.description ?? '',
        normalizeAccountableOfficer(scan.accountable_officer),
        scan.property_type ?? '',
        scan.unit_of_measure ?? '',
        scan.unit_value ?? '',
    ]
        .map((part) => String(part).trim().toLowerCase())
        .join('|');
}

function extractPropertyNumbers(scans: RpcInventoryScanRecord[]): string[] {
    return Array.from(
        new Set(scans.map((scan) => scan.property_number?.trim()).filter(Boolean) as string[])
    );
}

function buildPropertyPreview(scans: RpcInventoryScanRecord[]): string {
    const propertyNumbers = extractPropertyNumbers(scans);

    if (propertyNumbers.length === 0) {
        return `${scans.length} item${scans.length === 1 ? '' : 's'}`;
    }

    if (propertyNumbers.length <= 3) {
        return propertyNumbers.join(', ');
    }

    return `${propertyNumbers.slice(0, 3).join(', ')} ...`;
}

function getConditionLabel(scan: RpcInventoryScanRecord, conditions: Condition[]): string {
    return scan.condition?.ConditionName ?? conditions.find((condition) => condition.ConditionID === scan.condition_id)?.ConditionName ?? `Condition ${scan.condition_id}`;
}

function buildGroupedScans(
    scans: RpcInventoryScanRecord[],
    conditions: Condition[],
    searchText: string,
    filterType: 'ALL' | 'RPCPPE' | 'RPCSEP'
): GroupedScanRow[] {
    let filtered = scans;

    if (filterType !== 'ALL') {
        filtered = filtered.filter((scan) => scan.rpc_type === filterType);
    }

    const needle = searchText.trim().toLowerCase();
    if (needle.length > 0) {
        filtered = filtered.filter((scan) => {
            const haystack = [scan.property_number, scan.article, scan.accountable_officer, scan.description]
                .map((value) => (value || '').trim().toLowerCase())
                .join(' ');

            return haystack.includes(needle);
        });
    }

    const grouped = new Map<string, RpcInventoryScanRecord[]>();

    for (const scan of filtered) {
        const key = buildGroupKey(scan);
        const bucket = grouped.get(key);
        if (bucket) {
            bucket.push(scan);
        } else {
            grouped.set(key, [scan]);
        }
    }

    return Array.from(grouped.entries())
        .map(([key, groupedScans]) => {
            const sorted = [...groupedScans].sort((left, right) => getScanTimestamp(right) - getScanTimestamp(left));
            const conditionLabels = Array.from(new Set(sorted.map((scan) => getConditionLabel(scan, conditions))));
            const propertyNumbers = extractPropertyNumbers(sorted);

            return {
                key,
                primaryScan: sorted[0],
                scans: sorted,
                propertyNumbersPreview: buildPropertyPreview(sorted),
                propertyNumbersFull: propertyNumbers,
                scansCount: sorted.length,
                conditionPreview: conditionLabels.length === 1 ? conditionLabels[0] : `${conditionLabels.length} condition labels`,
                latestScanAt: formatDateTime(sorted[0].scanned_at || sorted[0].created_at),
            };
        })
        .sort((left, right) => getScanTimestamp(right.primaryScan) - getScanTimestamp(left.primaryScan));
}

export function ScannedAssetsScreen({ cycleId }: ScannedAssetsScreenProps): React.JSX.Element {
    const [scans, setScans] = useState<RpcInventoryScanRecord[]>([]);
    const [cycleStatus, setCycleStatus] = useState<string | null>(null);
    const [conditions, setConditions] = useState<Condition[]>([]);
    const [loading, setLoading] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [searchText, setSearchText] = useState('');
    const [filterType, setFilterType] = useState<'ALL' | 'RPCPPE' | 'RPCSEP'>('ALL');
    const [editingGroup, setEditingGroup] = useState<GroupedScanRow | null>(null);
    const [editingItems, setEditingItems] = useState<EditScanItem[]>([]);
    const [editConditionId, setEditConditionId] = useState<number | null>(null);
    const [editRemarks, setEditRemarks] = useState('');
    const [saving, setSaving] = useState(false);
    const [expandedPropertyGroups, setExpandedPropertyGroups] = useState<Set<string>>(new Set());

    useEffect(() => {
        void loadScans();
        void loadConditions();
        void (async () => {
            try {
                const response = await ApiService.listRpcInventoryCycles();
                const found = response.data.find((c: any) => c.id === cycleId) ?? null;
                setCycleStatus(found?.status ?? null);
            } catch (err) {
                // ignore — if we fail to load cycle info we leave status null
                console.error('Failed to load cycle status:', err);
            }
        })();
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

    const groupedScans = useMemo(
        () => buildGroupedScans(scans, conditions, searchText, filterType),
        [conditions, filterType, scans, searchText]
    );

    function openEditor(group: GroupedScanRow): void {
        setEditingGroup(group);
        setEditingItems(
            group.scans.map((scan) => ({
                scanId: scan.id,
                propertyNumber: scan.property_number ?? '-',
                included: true,
            }))
        );
        setEditConditionId(group.primaryScan.condition_id);
        setEditRemarks(group.scans.find((scan) => (scan.remarks || '').trim().length > 0)?.remarks ?? '');
    }

    function closeEditor(): void {
        setEditingGroup(null);
        setEditingItems([]);
        setEditConditionId(null);
        setEditRemarks('');
    }

    async function saveEditor(): Promise<void> {
        if (!editingGroup || !editConditionId) {
            Alert.alert('Validation', 'Please select a condition.');
            return;
        }

        const selectedItems = editingItems.filter((item) => item.included);
        const removedItems = editingItems.filter((item) => !item.included);
        const selectedById = new Map<number, RpcInventoryScanRecord>(editingGroup.scans.map((scan) => [scan.id, scan]));
        const changedItems = selectedItems.filter((item) => {
            const original = selectedById.get(item.scanId);
            if (!original) {
                return true;
            }

            return original.condition_id !== editConditionId || (original.remarks || '') !== editRemarks.trim();
        });

        if (selectedItems.length === 0) {
            Alert.alert('Validation', 'Keep at least one scan in the group.');
            return;
        }

        setSaving(true);
        try {
            await Promise.all([
                ...changedItems.map((item) =>
                    ApiService.updateRpcScan(item.scanId, {
                        condition_id: editConditionId,
                        remarks: editRemarks.trim() || null,
                    })
                ),
                ...removedItems.map((item) => ApiService.deleteRpcScan(item.scanId)),
            ]);
            closeEditor();
            await loadScans();
        } catch (error) {
            console.error('Failed to update scan:', error);
            Alert.alert('Error', 'Failed to update scanned asset.');
        } finally {
            setSaving(false);
        }
    }

    function handleDeleteGroup(group: GroupedScanRow): void {
        Alert.alert(
            'Remove Asset Group',
            `Remove ${group.scansCount} scanned asset${group.scansCount === 1 ? '' : 's'} (${group.propertyNumbersPreview}) from the selected cycle?`,
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Remove',
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            // Delete all scans in the group
                            await Promise.all(group.scans.map((scan: RpcInventoryScanRecord) => ApiService.deleteRpcScan(scan.id)));
                            await loadScans();
                        } catch (error) {
                            console.error('Failed to delete scan group:', error);
                            Alert.alert('Error', 'Failed to delete scan group.');
                        }
                    },
                },
            ]
        );
    }

    const renderScanItem = (group: GroupedScanRow) => {
        const isExpanded = expandedPropertyGroups.has(group.key);

        return (
            <View style={styles.assetCard}>
                <TouchableOpacity activeOpacity={0.88} onPress={() => openEditor(group)}>
                    <View style={styles.assetHeader}>
                        <View style={styles.propertyNumbersContainer}>
                            <Text style={styles.assetTitle}>
                                {isExpanded
                                    ? group.propertyNumbersFull.join(', ')
                                    : group.propertyNumbersPreview}
                            </Text>
                        </View>
                        {group.propertyNumbersFull.length > 3 && (
                            <TouchableOpacity
                                activeOpacity={0.6}
                                onPress={() => {
                                    const newExpanded = new Set(expandedPropertyGroups);
                                    if (newExpanded.has(group.key)) {
                                        newExpanded.delete(group.key);
                                    } else {
                                        newExpanded.add(group.key);
                                    }
                                    setExpandedPropertyGroups(newExpanded);
                                }}
                            >
                                <Text style={styles.expandIndicator}>{isExpanded ? '▲' : '▼'}</Text>
                            </TouchableOpacity>
                        )}
                        <View style={styles.assetTypeChip}>
                            <Text style={styles.assetTypeChipText}>{group.primaryScan.rpc_type}</Text>
                        </View>
                    </View>

                    <Text style={styles.assetArticle}>{group.primaryScan.article ?? group.primaryScan.description ?? 'No article'}</Text>
                    <Text style={styles.assetMeta}>
                        Officer: {normalizeAccountableOfficer(group.primaryScan.accountable_officer) ?? (group.primaryScan.scanned_by?.FullName ?? '—')}
                    </Text>

                    <View style={styles.assetStatsRow}>
                        <View style={styles.assetStatBox}>
                            <Text style={styles.assetStatLabel}>Condition</Text>
                            <Text style={styles.assetStatValue}>{group.conditionPreview}</Text>
                        </View>
                        <View style={styles.assetStatBox}>
                            <Text style={styles.assetStatLabel}>Scans</Text>
                            <Text style={styles.assetStatValue}>{group.scansCount}</Text>
                        </View>
                    </View>

                    <Text style={styles.assetMetaSecondary}>Latest scan: {group.latestScanAt}</Text>
                </TouchableOpacity>

                <View style={styles.actionsCell}>
                    <TouchableOpacity style={styles.actionButton} onPress={() => openEditor(group)}>
                        <Text style={styles.actionButtonText}>Edit</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[styles.actionButton, styles.deleteButton]}
                        onPress={() => handleDeleteGroup(group)}
                    >
                        <Text style={styles.actionButtonText}>Remove</Text>
                    </TouchableOpacity>
                </View>
            </View>
        );
    };

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

            {cycleStatus === 'closed' ? (
                <View style={styles.closedContainer}>
                    <Text style={styles.closedText}>
                        This year's RPCPPE has been closed. If you are an Administrator, you may reopen it through the web application.
                    </Text>
                </View>
            ) : groupedScans.length === 0 ? (
                <View style={styles.emptyContainer}>
                    <Text style={styles.emptyText}>No scanned assets yet for this cycle.</Text>
                </View>
            ) : (
                <FlatList
                    data={groupedScans}
                    keyExtractor={(item) => item.key}
                    renderItem={({ item }) => renderScanItem(item)}
                    refreshControl={
                        <RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} />
                    }
                    contentContainerStyle={styles.listContent}
                />
            )}

            <Modal visible={editingGroup !== null} transparent animationType="slide" onRequestClose={closeEditor}>
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <Text style={styles.modalTitle}>Edit Scanned Asset</Text>
                        <TouchableOpacity style={styles.closeButton} onPress={closeEditor}>
                            <Text style={styles.closeButtonText}>✕</Text>
                        </TouchableOpacity>

                        {editingGroup ? (
                            <View style={styles.groupSummaryBlock}>
                                <Text style={styles.groupSummaryTitle}>{editingGroup.primaryScan.article ?? editingGroup.primaryScan.description ?? 'Asset group'}</Text>
                                <Text style={styles.groupSummaryMeta}>{editingGroup.propertyNumbersPreview}</Text>
                                <Text style={styles.groupSummaryMeta}>{editingGroup.scansCount} scan{editingGroup.scansCount === 1 ? '' : 's'}</Text>
                            </View>
                        ) : null}

                        <Text style={styles.sectionLabel}>Condition</Text>
                        <Text style={styles.sectionHint}>This will apply to all included scans in the group.</Text>
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

                        <Text style={styles.sectionLabel}>Sibling scans</Text>
                        <Text style={styles.sectionHint}>Keep the scans you want to update, or untick the ones you want to remove from the group.</Text>
                        <View style={styles.siblingList}>
                            {editingItems.map((item) => {
                                const selected = item.included;
                                return (
                                    <TouchableOpacity
                                        key={item.scanId}
                                        style={[styles.siblingRow, selected && styles.siblingRowSelected]}
                                        onPress={() => {
                                            setEditingItems((prev) =>
                                                prev.map((entry) =>
                                                    entry.scanId === item.scanId
                                                        ? { ...entry, included: !entry.included }
                                                        : entry
                                                )
                                            );
                                        }}
                                    >
                                        <View style={styles.siblingRowText}>
                                            <Text style={[styles.siblingRowTitle, selected && styles.siblingRowTitleSelected]}>
                                                {item.propertyNumber}
                                            </Text>
                                            <Text style={styles.siblingRowMeta}>
                                                {selected ? 'Included' : 'Marked for removal'}
                                            </Text>
                                        </View>
                                        <Text style={[styles.siblingRowToggle, selected && styles.siblingRowToggleSelected]}>
                                            {selected ? 'On' : 'Off'}
                                        </Text>
                                    </TouchableOpacity>
                                );
                            })}
                        </View>

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
    assetHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 },
    propertyNumbersContainer: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 4 },
    assetTitle: { flex: 1, fontSize: 14, fontWeight: '700', color: '#f8fafc' },
    expandIndicator: { color: '#8aa0c5', fontSize: 12, fontWeight: '800', paddingHorizontal: 4 },
    assetTypeChip: { borderRadius: 999, backgroundColor: '#1d4ed8', paddingHorizontal: 10, paddingVertical: 5 },
    assetTypeChipText: { color: '#ffffff', fontSize: 11, fontWeight: '800' },
    assetArticle: { marginTop: 8, fontSize: 13, color: '#dbe7ff' },
    assetMeta: { marginTop: 4, fontSize: 12, color: '#9bb0d2' },
    assetStatsRow: { marginTop: 10, flexDirection: 'row', gap: 8 },
    assetStatBox: { flex: 1, borderRadius: 12, backgroundColor: '#0b1220', borderWidth: 1, borderColor: '#263552', padding: 10 },
    assetStatLabel: { fontSize: 10, color: '#8aa0c5', textTransform: 'uppercase', fontWeight: '800' },
    assetStatValue: { marginTop: 4, fontSize: 13, color: '#f8fafc', fontWeight: '700' },
    assetMetaSecondary: { marginTop: 6, fontSize: 11, color: '#7f94ba' },
    actionsCell: { marginTop: 10, flexDirection: 'row', gap: 8 },
    actionButton: { flex: 1, paddingVertical: 10, borderRadius: 10, backgroundColor: '#1e293b', alignItems: 'center' },
    deleteButton: { backgroundColor: '#991b1b' },
    actionButtonText: { color: '#ffffff', fontSize: 12, fontWeight: '800' },
    emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 16 },
    emptyText: { fontSize: 14, color: '#9bb0d2', textAlign: 'center' },
    closedContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 20 },
    closedText: { color: '#f8fafc', textAlign: 'center', fontSize: 16, lineHeight: 22 },
    centerLoading: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0b1220' },
    loadingText: { marginTop: 12, fontSize: 14, color: '#9bb0d2' },
    modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
    modalContent: { backgroundColor: '#111a2d', borderTopLeftRadius: 18, borderTopRightRadius: 18, paddingHorizontal: 16, paddingVertical: 24, minHeight: 420, borderTopWidth: 1, borderColor: '#263552' },
    modalTitle: { fontSize: 18, fontWeight: '700', color: '#f8fafc', marginBottom: 16 },
    closeButton: { position: 'absolute', top: 16, right: 16, width: 32, height: 32, justifyContent: 'center', alignItems: 'center' },
    closeButtonText: { fontSize: 20, color: '#f8fafc' },
    sectionLabel: { marginTop: 8, marginBottom: 8, fontSize: 14, fontWeight: '700', color: '#c5d5ef' },
    sectionHint: { marginTop: -4, marginBottom: 8, fontSize: 12, color: '#8aa0c5' },
    conditionList: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    conditionChip: { borderRadius: 999, borderWidth: 1, borderColor: '#334463', paddingHorizontal: 12, paddingVertical: 8, marginBottom: 8, backgroundColor: '#0b1220' },
    conditionChipSelected: { backgroundColor: '#2563EB', borderColor: '#2563EB' },
    conditionChipText: { color: '#c5d5ef', fontWeight: '600', fontSize: 12 },
    conditionChipTextSelected: { color: '#fff' },
    remarksInput: { minHeight: 96, borderRadius: 12, borderWidth: 1, borderColor: '#334463', backgroundColor: '#0b1220', paddingHorizontal: 12, paddingVertical: 10, color: '#f8fafc' },
    groupSummaryBlock: { borderRadius: 14, backgroundColor: '#0b1220', borderWidth: 1, borderColor: '#263552', padding: 12, marginBottom: 10 },
    groupSummaryTitle: { fontSize: 15, fontWeight: '800', color: '#f8fafc' },
    groupSummaryMeta: { marginTop: 3, fontSize: 12, color: '#8aa0c5' },
    siblingList: { gap: 8, marginTop: 2 },
    siblingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, borderRadius: 12, borderWidth: 1, borderColor: '#334463', backgroundColor: '#0b1220', paddingHorizontal: 12, paddingVertical: 10 },
    siblingRowSelected: { borderColor: '#2563EB', backgroundColor: '#0f1b34' },
    siblingRowText: { flex: 1 },
    siblingRowTitle: { fontSize: 13, fontWeight: '700', color: '#f8fafc' },
    siblingRowTitleSelected: { color: '#bfdbfe' },
    siblingRowMeta: { marginTop: 2, fontSize: 11, color: '#8aa0c5' },
    siblingRowToggle: { minWidth: 42, textAlign: 'center', borderRadius: 999, backgroundColor: '#334463', color: '#dbe7ff', fontSize: 11, fontWeight: '800', paddingHorizontal: 10, paddingVertical: 5 },
    siblingRowToggleSelected: { backgroundColor: '#2563EB', color: '#ffffff' },
    modalActions: { flexDirection: 'row', gap: 12, marginTop: 20 },
    cancelButton: { flex: 1, borderRadius: 12, backgroundColor: '#475569', alignItems: 'center', paddingVertical: 12 },
    cancelButtonText: { color: '#fff', fontWeight: '700' },
    saveButton: { flex: 1, borderRadius: 12, backgroundColor: '#2563EB', alignItems: 'center', paddingVertical: 12 },
    saveButtonText: { color: '#fff', fontWeight: '700' },
});
