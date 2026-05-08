import React, { useEffect, useMemo, useState } from 'react';
import {
    ActivityIndicator,
    RefreshControl,
    Modal,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import ApiService from '../../shared/services/apiService';
import type { Condition, RpcInventoryAuditLog } from '../../../types';

interface RpcInventoryAuditScreenProps {
    cycleId: number;
}

const PER_PAGE = 20;

function formatActionLabel(action: string): string {
    return action
        .replace(/^scan_/, 'scan ')
        .replace(/^cycle_/, 'cycle ')
        .replace(/^sync_/, 'sync ')
        .replace(/_/g, ' ')
        .replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatDetailLabel(value: string): string {
    return value
        .replace(/_/g, ' ')
        .replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatDetailValue(value: unknown): string {
    if (value === null || value === undefined || value === '') {
        return '-';
    }

    if (Array.isArray(value)) {
        return value.map((item) => formatDetailValue(item)).filter((item) => item !== '-').join(', ') || '-';
    }

    if (typeof value === 'object') {
        const entries = Object.entries(value as Record<string, unknown>)
            .filter(([, nestedValue]) => nestedValue !== null && nestedValue !== undefined && nestedValue !== '')
            .map(([nestedKey, nestedValue]) => `${formatDetailLabel(nestedKey)}: ${formatDetailValue(nestedValue)}`);

        return entries.length > 0 ? entries.join(' | ') : '-';
    }

    return String(value);
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

function summarizeDetails(details: Record<string, unknown> | null): Array<{ label: string; value: string }> {
    if (!details) {
        return [];
    }

    return Object.entries(details)
        .filter(([, value]) => value !== null && value !== undefined && value !== '')
        .map(([key, value]) => ({
            label: formatDetailLabel(key),
            value: formatDetailValue(value),
        }))
        .filter((entry) => entry.value !== '-');
}

export function RpcInventoryAuditScreen({ cycleId }: RpcInventoryAuditScreenProps): React.JSX.Element {
    const [logs, setLogs] = useState<RpcInventoryAuditLog[]>([]);
    const [conditions, setConditions] = useState<Condition[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [page, setPage] = useState(1);
    const [lastPage, setLastPage] = useState(1);
    const [total, setTotal] = useState(0);
    const [selectedAuditLog, setSelectedAuditLog] = useState<RpcInventoryAuditLog | null>(null);
    const [expandedDetailKeys, setExpandedDetailKeys] = useState<Set<string>>(new Set());

    const conditionLabelById = useMemo(() => {
        return new Map(conditions.map((condition) => [condition.ConditionID, condition.ConditionName]));
    }, [conditions]);

    useEffect(() => {
        void ApiService.getConditions()
            .then((data) => setConditions(data))
            .catch((error) => {
                console.error('Failed to load RPC conditions:', error);
            });
    }, []);

    function formatDetailLabel(value: string): string {
        if (value === 'condition_id') return 'Condition';
        if (value === 'new_condition_id') return 'After condition';
        if (value === 'property_number') return 'Property #';
        if (value === 'property_numbers') return 'Property numbers';
        if (value === 'sync_source') return 'Source';
        if (value === 'total') return 'Total';
        if (value === 'created') return 'Created';
        if (value === 'duplicates') return 'Duplicates';
        if (value === 'errors') return 'Errors';
        if (value === 'remarks') return 'Remarks';
        if (value === 'rpc_type') return 'RPC Type';
        if (value === 'scanned_at') return 'Scanned at';

        return value
            .replace(/_/g, ' ')
            .replace(/\b\w/g, (char) => char.toUpperCase());
    }

    function formatDetailValue(key: string, value: unknown): string | null {
        if (value === null || value === undefined || value === '') {
            return null;
        }

        const normalizedKey = key.toLowerCase();

        if (['inventory_detail_id', 'property_id', 'rpc_inventory_scan_id', 'performed_by_user_id', 'performed_by_device_id', 'client_uuid'].includes(normalizedKey)) {
            return null;
        }

        if (Array.isArray(value)) {
            const items = value
                .map((item) => formatDetailValue(key, item))
                .filter((item): item is string => Boolean(item));
            return items.length > 0 ? items.join(', ') : null;
        }

        if (typeof value === 'object') {
            const entries = Object.entries(value as Record<string, unknown>)
                .map(([nestedKey, nestedValue]) => {
                    const formattedNestedValue = formatDetailValue(nestedKey, nestedValue);
                    return formattedNestedValue ? `${formatDetailLabel(nestedKey)}: ${formattedNestedValue}` : null;
                })
                .filter((item): item is string => Boolean(item));

            return entries.length > 0 ? entries.join(' | ') : null;
        }

        const stringValue = String(value).trim();

        if (normalizedKey === 'condition_id' || normalizedKey.endsWith('_condition_id')) {
            const conditionId = Number(stringValue);
            return Number.isFinite(conditionId) ? conditionLabelById.get(conditionId) ?? 'Unknown condition' : null;
        }

        if (normalizedKey === 'source') {
            return stringValue.charAt(0).toUpperCase() + stringValue.slice(1);
        }

        if (normalizedKey === 'scanned_at') {
            return formatDateTime(stringValue);
        }

        return stringValue;
    }

    function summarizeAuditLog(log: RpcInventoryAuditLog): string {
        const details = log.details || {};

        if (typeof log.action === 'string' && log.action.startsWith('sync_batch')) {
            const created = Number(details.created ?? 0);
            const duplicates = Number(details.duplicates ?? 0);
            const errors = Number(details.errors ?? 0);
            return `${created} created • ${duplicates} duplicates • ${errors} errors`;
        }

        const fragments: string[] = [];
        const propertyNumber = log.property_number || log.scan?.property_number;
        const condition = formatDetailValue('condition_id', log.condition_id ?? log.scan?.condition_id);
        const remarks = log.new_remarks || log.previous_remarks || (typeof details.remarks === 'string' ? details.remarks : null);
        const source = typeof details.source === 'string' ? details.source : log.source;

        if (propertyNumber) fragments.push(`Property # ${propertyNumber}`);
        if (condition) fragments.push(`Condition ${condition}`);
        if (remarks) fragments.push(`Remarks ${remarks}`);
        if (source) fragments.push(`Source ${source.charAt(0).toUpperCase() + source.slice(1)}`);

        return fragments.length > 0 ? fragments.join(' • ') : 'Tap for details';
    }

    function getDetailEntries(log: RpcInventoryAuditLog): Array<{ key: string; label: string; value: string }> {
        const details = log.details || {};
        const entries: Array<{ key: string; label: string; value: string }> = [];

        if (log.action === 'scan_updated') {
            const before = details.before as Record<string, unknown> | undefined;
            const after = details.after as Record<string, unknown> | undefined;

            const beforeCondition = before ? formatDetailValue('previous_condition_id', before.condition_id) : null;
            const afterCondition = after ? formatDetailValue('condition_id', after.condition_id) : null;
            const beforeRemarks = before && typeof before.remarks === 'string' ? before.remarks : null;
            const afterRemarks = after && typeof after.remarks === 'string' ? after.remarks : null;

            if (beforeCondition) entries.push({ key: 'before_condition_id', label: 'Before condition', value: beforeCondition });
            if (afterCondition) entries.push({ key: 'new_condition_id', label: 'After condition', value: afterCondition });
            if (beforeRemarks) entries.push({ key: 'previous_remarks', label: 'Before remarks', value: beforeRemarks });
            if (afterRemarks) entries.push({ key: 'remarks', label: 'After remarks', value: afterRemarks });

            return entries;
        }

        if (typeof log.action === 'string' && log.action.startsWith('sync_batch')) {
            if (Array.isArray(details.property_numbers) && details.property_numbers.length > 0) {
                entries.push({ key: 'property_numbers', label: 'Property numbers', value: details.property_numbers.join(', ') });
            }
            if (details.source) {
                entries.push({ key: 'source', label: 'Source', value: String(details.source).charAt(0).toUpperCase() + String(details.source).slice(1) });
            }
            entries.push({ key: 'total', label: 'Total', value: String(details.total ?? 0) });
            entries.push({ key: 'created', label: 'Created', value: String(details.created ?? 0) });
            entries.push({ key: 'duplicates', label: 'Duplicates', value: String(details.duplicates ?? 0) });
            entries.push({ key: 'errors', label: 'Errors', value: String(details.errors ?? 0) });
            if (details.status) {
                entries.push({ key: 'status', label: 'Status', value: String(details.status).replace(/_/g, ' ') });
            }
            return entries;
        }

        if (log.property_number) entries.push({ key: 'property_number', label: 'Property #', value: log.property_number });

        const currentCondition = formatDetailValue('condition_id', log.condition_id ?? log.scan?.condition_id);
        if (currentCondition) entries.push({ key: 'condition_id', label: 'Condition', value: currentCondition });

        const remarks = log.new_remarks || log.previous_remarks;
        if (remarks) entries.push({ key: 'remarks', label: 'Remarks', value: remarks });

        const sourceValue = (details.source as string | undefined) ?? (log.source as string | undefined);
        if (sourceValue) entries.push({ key: 'source', label: 'Source', value: formatDetailValue('source', sourceValue) || sourceValue });

        const scannedAtValue = (details.scanned_at as string | undefined) ?? (log.scan?.scanned_at as string | undefined);
        if (scannedAtValue) entries.push({ key: 'scanned_at', label: 'Scanned at', value: formatDetailValue('scanned_at', scannedAtValue) || scannedAtValue });

        if (log.action === 'scan_deleted') {
            return entries.filter((e) => ['property_number'].includes(e.key));
        }

        if (log.action === 'scan_created') {
            return entries.filter((e) => !['before_condition_id', 'previous_condition_id', 'previous_remarks', 'new_remarks', 'scanned_at'].includes(e.key));
        }

        return entries;
    }

    const fetchLogs = async (nextPage = page): Promise<void> => {
        try {
            const response = await ApiService.getRpcInventoryCycleAuditLogs(cycleId, {
                page: nextPage,
                per_page: PER_PAGE,
            });

            setLogs(response.data);
            setPage(response.current_page || nextPage);
            setLastPage(Math.max(1, response.last_page || 1));
            setTotal(response.total || 0);
        } catch (error) {
            console.error('Failed to load RPC audit logs:', error);
            setLogs([]);
            setLastPage(1);
            setTotal(0);
        }
    };

    useEffect(() => {
        void fetchLogs(1).finally(() => {
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setLoading(false);
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [cycleId]);

    const load = async (nextPage = page): Promise<void> => {
        setLoading(true);
        try {
            await fetchLogs(nextPage);
        } finally {
            setLoading(false);
        }
    };

    const onRefresh = async (): Promise<void> => {
        setRefreshing(true);
        try {
            await load(page);
        } finally {
            setRefreshing(false);
        }
    };

    if (loading && logs.length === 0) {
        return (
            <View style={styles.centered}>
                <ActivityIndicator size="large" color="#2563EB" />
                <Text style={styles.loadingText}>Loading audit trail...</Text>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <Text style={styles.title}>Cycle Audit Trail</Text>
                <Text style={styles.subtitle}>Admin-only timeline for scan and sync actions.</Text>
            </View>

            <ScrollView
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} />}
                contentContainerStyle={styles.listContent}
            >
                {logs.length === 0 ? (
                    <View style={styles.emptyCard}>
                        <Text style={styles.emptyText}>No audit entries yet.</Text>
                    </View>
                ) : (
                    logs.map((log) => {
                        const actor = log.performed_by?.FullName || `User ${log.performed_by_user_id}`;
                        const details = log.details || {};
                        const pnums = Array.isArray(details.property_numbers) ? details.property_numbers.filter((v): v is string => typeof v === 'string') : [];
                        const propertyNumber = pnums.length === 1 ? pnums[0] : (pnums.length > 1 ? 'Batched' : (log.property_number || log.scan?.property_number || '-'));
                        const summary = summarizeAuditLog(log);

                        return (
                            <TouchableOpacity
                                key={log.AuditID}
                                style={styles.auditCard}
                                activeOpacity={0.85}
                                onPress={() => setSelectedAuditLog(log)}
                            >
                                <View style={styles.auditRowTop}>
                                    <Text style={styles.auditAction}>{formatActionLabel(log.action)}</Text>
                                    <Text style={styles.auditSource}>{formatDetailValue('source', log.source ?? (log.details as any)?.source) || '-'}</Text>
                                </View>
                                <Text style={styles.auditMeta}>{formatDateTime(log.created_at)}</Text>
                                <Text style={styles.auditMeta}>Actor: {actor}</Text>
                                <Text style={styles.auditMeta}>Property #: {propertyNumber}</Text>
                                <Text style={styles.auditSummary} numberOfLines={1} ellipsizeMode="tail">
                                    {summary}
                                </Text>
                                <Text style={styles.auditHint}>Tap to view details</Text>
                            </TouchableOpacity>
                        );
                    })
                )}
            </ScrollView>

            <Modal visible={Boolean(selectedAuditLog)} transparent animationType="fade" onRequestClose={() => setSelectedAuditLog(null)}>
                <View style={styles.modalOverlay}>
                    <View style={styles.modalCard}>
                        <View style={styles.modalHeader}>
                            <View style={{ flex: 1 }}>
                                <Text style={styles.modalTitle}>{selectedAuditLog ? formatActionLabel(selectedAuditLog.action) : 'Audit details'}</Text>
                                <Text style={styles.modalSubtitle}>{selectedAuditLog ? formatDateTime(selectedAuditLog.created_at) : ''}</Text>
                            </View>
                            <TouchableOpacity onPress={() => setSelectedAuditLog(null)} style={styles.modalCloseButton}>
                                <Text style={styles.modalCloseText}>Close</Text>
                            </TouchableOpacity>
                        </View>

                        {selectedAuditLog && (
                            <ScrollView contentContainerStyle={styles.modalBody}>
                                <View style={styles.summaryBlock}>
                                    <Text style={styles.summaryLabel}>User</Text>
                                    <Text style={styles.summaryValue}>{selectedAuditLog.performed_by?.FullName || 'Unknown user'}</Text>
                                    <Text style={styles.summaryLabel}>Property #</Text>
                                    <Text style={styles.summaryValue}>{(() => {
                                        const details = selectedAuditLog.details || {};
                                        const pnums = Array.isArray(details.property_numbers) ? details.property_numbers.filter((v): v is string => typeof v === 'string') : [];
                                        if (pnums.length === 1) return pnums[0];
                                        if (pnums.length > 1) return 'Batched';
                                        return selectedAuditLog.property_number || selectedAuditLog.scan?.property_number || 'Not available';
                                    })()}</Text>
                                    <Text style={styles.summaryLabel}>Source</Text>
                                    <Text style={styles.summaryValue}>{formatDetailValue('source', selectedAuditLog.source ?? (selectedAuditLog.details as any)?.source) || 'Not available'}</Text>
                                </View>

                                <View style={styles.detailList}>
                                    {getDetailEntries(selectedAuditLog).length === 0 ? (
                                        <Text style={styles.emptyDetailText}>No additional details.</Text>
                                    ) : (
                                        getDetailEntries(selectedAuditLog).map((entry) => {
                                            const detailKey = `${selectedAuditLog.AuditID}:${entry.key}`;
                                            const expanded = expandedDetailKeys.has(detailKey);
                                            const longText = entry.value.length > 120;

                                            return (
                                                <TouchableOpacity
                                                    key={detailKey}
                                                    style={styles.detailRow}
                                                    activeOpacity={0.85}
                                                    onPress={() => {
                                                        if (!longText) return;
                                                        setExpandedDetailKeys((prev) => {
                                                            const next = new Set(prev);
                                                            if (next.has(detailKey)) {
                                                                next.delete(detailKey);
                                                            } else {
                                                                next.add(detailKey);
                                                            }
                                                            return next;
                                                        });
                                                    }}
                                                >
                                                    <Text style={styles.detailKey}>{entry.label}</Text>
                                                    <Text style={styles.detailValue} numberOfLines={expanded ? undefined : 1} ellipsizeMode="tail">
                                                        {expanded || !longText ? entry.value : `${entry.value.slice(0, 117)}...`}
                                                    </Text>
                                                    {longText && <Text style={styles.detailHint}>{expanded ? 'Tap to collapse' : 'Tap to expand'}</Text>}
                                                </TouchableOpacity>
                                            );
                                        })
                                    )}
                                </View>
                            </ScrollView>
                        )}
                    </View>
                </View>
            </Modal>

            {total > PER_PAGE && (
                <View style={styles.paginationRow}>
                    <Text style={styles.paginationText}>
                        Showing {(page - 1) * PER_PAGE + 1} to {Math.min(page * PER_PAGE, total)} of {total}
                    </Text>
                    <View style={styles.paginationButtons}>
                        <TouchableOpacity
                            style={[styles.paginationBtn, page === 1 && styles.paginationBtnDisabled]}
                            disabled={page === 1 || loading}
                            onPress={() => void load(Math.max(1, page - 1))}
                        >
                            <Text style={styles.paginationBtnText}>Previous</Text>
                        </TouchableOpacity>
                        <Text style={styles.pageIndicator}>Page {page} of {lastPage}</Text>
                        <TouchableOpacity
                            style={[styles.paginationBtn, page === lastPage && styles.paginationBtnDisabled]}
                            disabled={page === lastPage || loading}
                            onPress={() => void load(Math.min(lastPage, page + 1))}
                        >
                            <Text style={styles.paginationBtnText}>Next</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#0b1220' },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0b1220' },
    loadingText: { marginTop: 12, color: '#9bb0d2', fontWeight: '600' },
    header: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 },
    title: { fontSize: 22, fontWeight: '900', color: '#f8fafc' },
    subtitle: { marginTop: 4, fontSize: 13, color: '#9bb0d2' },
    listContent: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 20, gap: 10 },
    emptyCard: { borderRadius: 16, backgroundColor: '#111a2d', borderWidth: 1, borderColor: '#263552', padding: 16 },
    emptyText: { color: '#9bb0d2', fontSize: 14 },
    auditCard: { borderRadius: 16, backgroundColor: '#111a2d', borderWidth: 1, borderColor: '#263552', padding: 12, gap: 4 },
    auditRowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    auditAction: { color: '#f8fafc', fontSize: 14, fontWeight: '900' },
    auditSource: { color: '#93c5fd', fontSize: 11, fontWeight: '800', textTransform: 'uppercase' },
    auditMeta: { color: '#9bb0d2', fontSize: 12 },
    auditSummary: { color: '#dbe7ff', fontSize: 13, fontWeight: '600', marginTop: 4 },
    auditHint: { color: '#60a5fa', fontSize: 11, fontWeight: '700', marginTop: 2 },
    modalOverlay: { flex: 1, backgroundColor: 'rgba(5, 10, 20, 0.7)', justifyContent: 'center', padding: 16 },
    modalCard: { maxHeight: '88%', borderRadius: 20, backgroundColor: '#0b1220', borderWidth: 1, borderColor: '#263552', overflow: 'hidden' },
    modalHeader: { flexDirection: 'row', gap: 12, alignItems: 'flex-start', padding: 16, borderBottomWidth: 1, borderBottomColor: '#1f2b44' },
    modalTitle: { color: '#f8fafc', fontSize: 18, fontWeight: '900' },
    modalSubtitle: { color: '#9bb0d2', fontSize: 12, marginTop: 2 },
    modalCloseButton: { borderRadius: 999, backgroundColor: '#17223a', paddingHorizontal: 12, paddingVertical: 8 },
    modalCloseText: { color: '#dbe7ff', fontSize: 12, fontWeight: '800' },
    modalBody: { padding: 16, gap: 12 },
    summaryBlock: { borderRadius: 16, backgroundColor: '#111a2d', borderWidth: 1, borderColor: '#263552', padding: 12, gap: 4 },
    summaryLabel: { color: '#9bb0d2', fontSize: 11, fontWeight: '800', textTransform: 'uppercase', marginTop: 6 },
    summaryValue: { color: '#f8fafc', fontSize: 14, fontWeight: '700' },
    detailList: { gap: 8 },
    emptyDetailText: { color: '#9bb0d2', fontSize: 13 },
    detailRow: { borderRadius: 16, backgroundColor: '#111a2d', borderWidth: 1, borderColor: '#263552', padding: 12, gap: 4 },
    detailKey: { color: '#9bb0d2', fontSize: 11, fontWeight: '800', textTransform: 'uppercase' },
    detailValue: { color: '#f8fafc', fontSize: 13, fontWeight: '600' },
    detailHint: { color: '#60a5fa', fontSize: 11, fontWeight: '700' },
    paginationRow: { borderTopWidth: 1, borderTopColor: '#1f2b44', paddingHorizontal: 16, paddingVertical: 10, gap: 8 },
    paginationText: { color: '#9bb0d2', fontSize: 12 },
    paginationButtons: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
    paginationBtn: { borderRadius: 10, backgroundColor: '#1d4ed8', paddingHorizontal: 12, paddingVertical: 8 },
    paginationBtnDisabled: { backgroundColor: '#334155' },
    paginationBtnText: { color: '#ffffff', fontSize: 12, fontWeight: '800' },
    pageIndicator: { color: '#c5d5ef', fontSize: 12, fontWeight: '700' },
});
