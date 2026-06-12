import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Condition, LocalScan } from '../../../types';
import { useAuth } from '../../auth/providers/AuthProvider';
import ApiService from '../../shared/services/apiService';
import ScanQueueService from '../services/scanQueueService';
import SyncService from '../services/syncService';

type QueueGroup = {
  key: string;
  scans: LocalScan[];
  primaryScan: LocalScan;
  title: string;
  subtitle: string;
  propertyPreview: string;
  status: LocalScan['status'];
  latestScanAt: string;
  conditionPreview: string;
  groupRemark: string;
};

const CONDITION_FALLBACKS: Record<number, string> = {
  1: 'Serviceable',
  2: 'Unserviceable',
  6: 'Under Repair',
};

function getScanTimestamp(scan: LocalScan): number {
  return new Date(scan.scanned_at || scan.created_at).getTime();
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function formatStatusLabel(status: LocalScan['status']): string {
  switch (status) {
    case 'syncing':
      return 'Syncing';
    case 'synced':
      return 'Synced';
    case 'failed':
      return 'Failed';
    case 'pending':
    default:
      return 'Pending';
  }
}

function getConditionLabel(scan: LocalScan, conditionLookup: Record<number, string>): string {
  return (
    scan.condition_name?.trim() ||
    conditionLookup[scan.condition_id] ||
    CONDITION_FALLBACKS[scan.condition_id] ||
    `Condition ${scan.condition_id}`
  );
}

function getStatusPriority(status: LocalScan['status']): number {
  switch (status) {
    case 'failed':
      return 0;
    case 'syncing':
      return 1;
    case 'pending':
      return 2;
    case 'synced':
    default:
      return 3;
  }
}

function resolveGroupStatus(scans: LocalScan[]): LocalScan['status'] {
  return (
    [...scans].sort(
      (left, right) => getStatusPriority(left.status) - getStatusPriority(right.status)
    )[0]?.status ?? 'pending'
  );
}

function buildGroupKey(scan: LocalScan): string {
  return [
    // Primary grouping by RPC type, article and description
    scan.rpc_type ?? '',
    scan.article ?? '',
    scan.description ?? '',
    // Include accountable officer, brand/model/serial when available so identical assets group together
    scan.accountable_officer ?? '',
    // Some scans may carry Brand/ModelNumber/SerialNumber when enriched; include defensively
    (scan as unknown as Record<string, unknown>).Brand ?? '',
    (scan as unknown as Record<string, unknown>).ModelNumber ?? '',
    (scan as unknown as Record<string, unknown>).SerialNumber ?? '',
    scan.unit_of_measure ?? '',
    scan.unit_value ?? '',
  ]
    .map((part) => String(part).trim().toLowerCase())
    .join('|');
}

function buildPropertyPreview(scans: LocalScan[]): string {
  const propertyNumbers = Array.from(
    new Set(scans.map((scan) => scan.property_number?.trim()).filter(Boolean) as string[])
  );

  if (propertyNumbers.length === 0) {
    return `${scans.length} item${scans.length === 1 ? '' : 's'}`;
  }

  if (propertyNumbers.length === 1) {
    return propertyNumbers[0];
  }

  // If a reasonable number of property numbers, show them all inline; otherwise show abbreviated preview
  if (propertyNumbers.length <= 9) {
    return propertyNumbers.join(', ');
  }

  return `${propertyNumbers[0]} + ${propertyNumbers.length - 1} more`;
}

function buildQueueGroups(
  scans: LocalScan[],
  conditionLookup: Record<number, string>
): QueueGroup[] {
  const grouped = new Map<string, LocalScan[]>();

  for (const scan of scans) {
    const key = buildGroupKey(scan);
    const bucket = grouped.get(key);

    if (bucket) {
      bucket.push(scan);
    } else {
      grouped.set(key, [scan]);
    }
  }

  return Array.from(grouped.entries())
    .map(([key, groupScans]) => {
      const sortedScans = [...groupScans].sort(
        (left, right) => getScanTimestamp(right) - getScanTimestamp(left)
      );
      const primaryScan = sortedScans[0];
      const conditionLabels = Array.from(
        new Set(sortedScans.map((scan) => getConditionLabel(scan, conditionLookup)))
      );

      return {
        key,
        scans: sortedScans,
        primaryScan,
        title:
          primaryScan.article?.trim() ||
          primaryScan.description?.trim() ||
          `Detail ${primaryScan.inventory_detail_id}`,
        subtitle:
          primaryScan.description?.trim() ||
          primaryScan.accountable_officer?.trim() ||
          'Queued asset',
        propertyPreview: buildPropertyPreview(sortedScans),
        status: resolveGroupStatus(sortedScans),
        latestScanAt: formatDateTime(primaryScan.scanned_at || primaryScan.created_at),
        conditionPreview:
          conditionLabels.length === 1
            ? conditionLabels[0]
            : `${conditionLabels.length} condition labels`,
        groupRemark: (() => {
          const found = sortedScans.find((s) => (s.remarks ?? '').trim().length > 0);
          return found ? (found.remarks as string) : 'Not Found';
        })(),
      };
    })
    .sort(
      (left, right) => getScanTimestamp(right.primaryScan) - getScanTimestamp(left.primaryScan)
    );
}

function QueueScreen(): React.JSX.Element {
  const { cycleId } = useAuth();
  const [scans, setScans] = useState<LocalScan[]>([]);
  const [cycleStatus, setCycleStatus] = useState<string | null>(null);
  const [conditionLookup, setConditionLookup] = useState<Record<number, string>>({});
  const [refreshing, setRefreshing] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [stats, setStats] = useState({ synced: 0, failed: 0, total: 0, pending: 0 });
  const [activeGroupKey, setActiveGroupKey] = useState<string | null>(null);

  const loadConditions = useCallback(async (): Promise<void> => {
    try {
      const conditions = await ApiService.getConditions();
      const nextLookup = conditions.reduce<Record<number, string>>(
        (accumulator, condition: Condition) => {
          accumulator[condition.ConditionID] = condition.ConditionName;
          return accumulator;
        },
        {}
      );

      setConditionLookup(nextLookup);
    } catch (error) {
      console.error('[QueueScreen] Failed to load conditions:', error);
    }
  }, []);

  const loadScans = useCallback(async (): Promise<void> => {
    try {
      if (cycleId) {
        await ScanQueueService.reconcileSyncedScans(cycleId);
      }

      const [allScans, queueStats] = await Promise.all([
        ScanQueueService.getAllScans(cycleId),
        ScanQueueService.getQueueStats(cycleId),
      ]);

      setScans(allScans);
      setStats(queueStats);
    } catch (error) {
      console.error('[QueueScreen] Failed to load scans:', error);
    }
  }, [cycleId]);

  useEffect(() => {
    const initialLoad = setTimeout(() => {
      void loadConditions();
      void loadScans();
      void (async () => {
        try {
          const resp = await ApiService.listRpcInventoryCycles();
          const found = resp.data.find((c: any) => c.id === cycleId) ?? null;
          setCycleStatus(found?.status ?? null);
        } catch (err) {
          console.error('[QueueScreen] Failed to load cycle status:', err);
        }
      })();
    }, 0);
    const interval = setInterval(() => {
      void loadScans();
    }, 10000);

    return () => {
      clearTimeout(initialLoad);
      clearInterval(interval);
    };
  }, [loadConditions, loadScans]);

  const groupedScans = buildQueueGroups(scans, conditionLookup);
  const activeGroup = groupedScans.find((group) => group.key === activeGroupKey) ?? null;

  async function onRefresh(): Promise<void> {
    setRefreshing(true);
    try {
      await loadScans();
    } finally {
      setRefreshing(false);
    }
  }

  async function handleManualSync(): Promise<void> {
    if (cycleStatus === 'closed') {
      Alert.alert("RPCPPE closed", "This year's RPCPPE has been closed. If you are an Administrator, you may reopen it through the web application.");
      return;
    }

    setSyncing(true);
    try {
      const result = await SyncService.manualSync();

      if (!result || (result.synced === 0 && result.failed === 0 && result.total === 0)) {
        Alert.alert('Info', 'No pending scans to sync');
      } else {
        Alert.alert(
          'Sync Result',
          `Synced: ${result.synced}\nFailed: ${result.failed}\nTotal: ${result.total}`
        );
      }

      await loadScans();
    } catch (error) {
      Alert.alert(
        'Error',
        `Sync failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    } finally {
      setSyncing(false);
    }
  }

  async function handleDeleteGroup(): Promise<void> {
    if (cycleStatus === 'closed') {
      Alert.alert("RPCPPE closed", "This year's RPCPPE has been closed. If you are an Administrator, you may reopen it through the web application.");
      return;
    }

    if (!activeGroup) {
      return;
    }

    Alert.alert('Delete Group', 'Delete all scans in this group?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await Promise.all(
              activeGroup.scans.map((scan) => ScanQueueService.deleteScan(scan.client_uuid))
            );
            setActiveGroupKey(null);
            await loadScans();
          } catch {
            Alert.alert('Error', 'Failed to delete group');
          }
        },
      },
    ]);
  }

  async function handleDeleteScan(scan: LocalScan): Promise<void> {
    if (cycleStatus === 'closed') {
      Alert.alert("RPCPPE closed", "This year's RPCPPE has been closed. If you are an Administrator, you may reopen it through the web application.");
      return;
    }

    Alert.alert(
      'Delete Scan',
      `Delete ${scan.property_number?.trim() || `detail ${scan.inventory_detail_id}`
      } from the queue?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await ScanQueueService.deleteScan(scan.client_uuid);
              await loadScans();
            } catch {
              Alert.alert('Error', 'Failed to delete scan');
            }
          },
        },
      ]
    );
  }

  async function handleRetryGroup(): Promise<void> {
    if (cycleStatus === 'closed') {
      Alert.alert("RPCPPE closed", "This year's RPCPPE has been closed. If you are an Administrator, you may reopen it through the web application.");
      return;
    }

    if (!activeGroup) {
      return;
    }

    try {
      const failedScans = activeGroup.scans.filter((scan) => scan.status === 'failed');
      await Promise.all(
        failedScans.map((scan) => ScanQueueService.updateScanStatus(scan.client_uuid, 'pending'))
      );
      await loadScans();
      Alert.alert('Success', 'Failed scans marked for retry');
    } catch {
      Alert.alert('Error', 'Failed to retry group');
    }
  }

  const renderGroup = ({ item }: { item: QueueGroup }) => {
    const badgeStyle = [
      styles.badge,
      item.status === 'synced'
        ? styles.badgeSynced
        : item.status === 'failed'
          ? styles.badgeFailed
          : item.status === 'syncing'
            ? styles.badgeSyncing
            : styles.badgePending,
    ];

    const badgeTextStyle = [
      styles.badgeText,
      item.status === 'synced'
        ? styles.badgeTextSynced
        : item.status === 'failed'
          ? styles.badgeTextFailed
          : item.status === 'syncing'
            ? styles.badgeTextSyncing
            : styles.badgeTextPending,
    ];

    return (
      <TouchableOpacity
        style={styles.groupCard}
        onPress={() => {
          if (cycleStatus === 'closed') return;
          setActiveGroupKey(item.key);
        }}
        activeOpacity={cycleStatus === 'closed' ? 1 : 0.88}
      >
        <View style={styles.cardRow}>
          <View style={styles.cardLeft}>
            <Text style={styles.cardTitle}>{item.title}</Text>
            <Text style={styles.cardSubtitle}>{item.subtitle}</Text>
            <Text style={styles.cardMeta}>{item.propertyPreview}</Text>
          </View>
          <View style={badgeStyle}>
            <Text style={badgeTextStyle}>{formatStatusLabel(item.status)}</Text>
          </View>
        </View>

        <View style={styles.groupFooter}>
          <Text style={styles.groupMeta}>{item.conditionPreview}</Text>
          <Text style={styles.groupMeta}>
            {item.scans.length} scan{item.scans.length === 1 ? '' : 's'}
          </Text>
          <Text style={styles.groupMeta}>{item.latestScanAt}</Text>
        </View>

        <Text style={styles.openHint}>Tap to view full details</Text>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Scan Queue</Text>
        <Text style={styles.headerSubtitle}>Offline queue for cycle {cycleId}</Text>

        <View style={styles.statsContainer}>
          <View style={styles.statBox}>
            <Text style={styles.statNumber}>{stats.total}</Text>
            <Text style={styles.statLabel}>Total</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={[styles.statNumber, styles.statSynced]}>{stats.synced}</Text>
            <Text style={styles.statLabel}>Synced</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={[styles.statNumber, styles.statPending]}>{stats.pending}</Text>
            <Text style={styles.statLabel}>Pending</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={[styles.statNumber, styles.statFailed]}>{stats.failed}</Text>
            <Text style={styles.statLabel}>Failed</Text>
          </View>
        </View>
      </View>

      <View style={styles.listWrap}>
        {cycleStatus === 'closed' ? (
          <View style={styles.closedBox}>
            <Text style={styles.closedText}>
              This year's RPCPPE has been closed. If you are an Administrator, you may reopen it through the web application.
            </Text>
          </View>
        ) : (
          <FlatList
            data={groupedScans}
            renderItem={renderGroup}
            keyExtractor={(item) => item.key}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} />
            }
            ListEmptyComponent={
              <View style={styles.emptyBox}>
                <Text style={styles.emptyText}>No scans yet</Text>
              </View>
            }
            contentContainerStyle={groupedScans.length === 0 ? { flexGrow: 1 } : undefined}
          />
        )}
      </View>

      <Modal
        visible={activeGroup !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setActiveGroupKey(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.sheetHandle} />
            {activeGroup ? (
              <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.modalContent}
              >
                <View style={styles.cardRow}>
                  <View style={styles.cardLeft}>
                    <Text style={styles.modalTitle}>{activeGroup.title}</Text>
                    <Text style={styles.modalSubtitle}>{activeGroup.subtitle}</Text>
                  </View>
                  <View
                    style={[
                      styles.badge,
                      activeGroup.status === 'synced'
                        ? styles.badgeSynced
                        : activeGroup.status === 'failed'
                          ? styles.badgeFailed
                          : activeGroup.status === 'syncing'
                            ? styles.badgeSyncing
                            : styles.badgePending,
                    ]}
                  >
                    <Text
                      style={[
                        styles.badgeText,
                        activeGroup.status === 'synced'
                          ? styles.badgeTextSynced
                          : activeGroup.status === 'failed'
                            ? styles.badgeTextFailed
                            : activeGroup.status === 'syncing'
                              ? styles.badgeTextSyncing
                              : styles.badgeTextPending,
                      ]}
                    >
                      {formatStatusLabel(activeGroup.status)}
                    </Text>
                  </View>
                </View>

                <View style={styles.summaryGrid}>
                  <View style={styles.summaryChip}>
                    <Text style={styles.summaryValue}>{activeGroup.scans.length}</Text>
                    <Text style={styles.summaryLabel}>Scans</Text>
                  </View>
                  <View style={styles.summaryChip}>
                    <Text style={styles.summaryValue}>{activeGroup.propertyPreview}</Text>
                    <Text style={styles.summaryLabel}>Property</Text>
                  </View>
                </View>

                <View style={styles.detailBlock}>
                  <Text style={styles.detailLabel}>Latest scan</Text>
                  <Text style={styles.detailValue}>{activeGroup.latestScanAt}</Text>
                </View>

                <View style={styles.detailBlock}>
                  <Text style={styles.detailLabel}>Condition</Text>
                  <Text style={styles.detailValue}>{activeGroup.conditionPreview}</Text>
                </View>

                <View style={styles.detailBlock}>
                  <Text style={styles.detailLabel}>Remarks</Text>
                  <Text style={styles.detailValue}>{activeGroup.groupRemark}</Text>
                </View>
                <View style={styles.detailList}>
                  {activeGroup.scans.map((scan) => (
                    <View key={scan.client_uuid} style={styles.detailCard}>
                      <Text style={styles.detailCardTitle}>
                        {scan.property_number?.trim() || `Detail ${scan.inventory_detail_id}`}
                      </Text>
                      <Text style={styles.detailCardMeta}>
                        {formatDateTime(scan.scanned_at || scan.created_at)}
                      </Text>
                      <Text style={styles.detailCardLine}>
                        Condition: {getConditionLabel(scan, conditionLookup)}
                      </Text>
                      <Text style={styles.detailCardLine}>
                        Queue status: {formatStatusLabel(scan.status)}
                      </Text>
                      {scan.accountable_officer ? (
                        <Text style={styles.detailCardLine}>
                          Officer: {scan.accountable_officer}
                        </Text>
                      ) : null}
                      {scan.unit_value ? (
                        <Text style={styles.detailCardLine}>
                          Value: ₱{Number(scan.unit_value).toFixed(2)}
                        </Text>
                      ) : null}
                      {/* Per-scan remarks suppressed in favor of the group's latest remark shown above. */}
                      {scan.error_message ? (
                        <Text style={styles.detailCardError}>{scan.error_message}</Text>
                      ) : null}
                      <View style={styles.detailCardActions}>
                        <TouchableOpacity
                          style={[styles.detailActionBtn, styles.detailDeleteBtn]}
                          onPress={() => void handleDeleteScan(scan)}
                        >
                          <Text style={styles.detailActionText}>Delete this scan</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  ))}
                </View>

                <View style={styles.modalActions}>
                  {activeGroup.scans.some((scan) => scan.status === 'failed') ? (
                    <TouchableOpacity
                      style={[styles.actionBtn, styles.retryBtn]}
                      onPress={() => void handleRetryGroup()}
                    >
                      <Text style={styles.actionText}>Retry failed</Text>
                    </TouchableOpacity>
                  ) : null}
                  <TouchableOpacity
                    style={[styles.actionBtn, styles.deleteBtn]}
                    onPress={() => void handleDeleteGroup()}
                  >
                    <Text style={styles.actionText}>Delete group</Text>
                  </TouchableOpacity>
                </View>

                <TouchableOpacity style={styles.closeBtn} onPress={() => setActiveGroupKey(null)}>
                  <Text style={styles.closeBtnText}>Close</Text>
                </TouchableOpacity>
              </ScrollView>
            ) : null}
          </View>
        </View>
      </Modal>

      <View style={styles.footer}>
        <TouchableOpacity
          style={styles.syncBtn}
          onPress={() => void handleManualSync()}
          disabled={syncing || cycleStatus === 'closed'}
        >
          {syncing ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.syncBtnText}>{cycleStatus === 'closed' ? 'RPCPPE Closed' : 'Manual Sync'}</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0b1220' },
  header: {
    borderBottomWidth: 1,
    borderBottomColor: '#1f2b44',
    backgroundColor: '#111a2d',
    paddingHorizontal: 16,
    paddingBottom: 16,
    paddingTop: 16,
  },
  headerTitle: { fontSize: 24, fontWeight: '900', color: '#f8fafc' },
  headerSubtitle: { marginTop: 4, fontSize: 13, color: '#9bb0d2' },
  statsContainer: {
    marginTop: 16,
    flexDirection: 'row',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#263552',
    backgroundColor: '#0b1220',
    padding: 12,
  },
  statBox: { flex: 1, alignItems: 'center' },
  statNumber: { fontSize: 20, fontWeight: '800', color: '#f8fafc' },
  statLabel: { fontSize: 11, color: '#9bb0d2' },
  statSynced: { color: '#4ade80' },
  statPending: { color: '#38bdf8' },
  statFailed: { color: '#fb7185' },

  listWrap: { flex: 1, paddingHorizontal: 16, paddingVertical: 16 },
  emptyBox: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#334463',
    backgroundColor: '#111a2d',
    paddingVertical: 48,
  },
  emptyText: { fontSize: 16, fontWeight: '600', color: '#9bb0d2' },

  groupCard: {
    marginBottom: 12,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#263552',
    backgroundColor: '#111a2d',
    padding: 16,
  },
  cardRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  cardLeft: { flex: 1, paddingRight: 12 },
  cardTitle: { fontSize: 16, fontWeight: '800', color: '#f8fafc' },
  cardSubtitle: { marginTop: 4, fontSize: 12, color: '#a7b7d1' },
  cardMeta: { marginTop: 8, fontSize: 13, fontWeight: '700', color: '#e2e8f0' },

  badge: { borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  badgeSynced: { backgroundColor: '#166534' },
  badgeFailed: { backgroundColor: '#9f1239' },
  badgeSyncing: { backgroundColor: '#92400e' },
  badgePending: { backgroundColor: '#1d4ed8' },
  badgeText: { fontSize: 12, fontWeight: '700' },
  badgeTextSynced: { color: '#dcfce7' },
  badgeTextFailed: { color: '#ffe4e6' },
  badgeTextSyncing: { color: '#fef3c7' },
  badgeTextPending: { color: '#dbeafe' },

  groupFooter: { marginTop: 12, flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  groupMeta: {
    borderRadius: 999,
    backgroundColor: '#0b1220',
    borderWidth: 1,
    borderColor: '#263552',
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 11,
    fontWeight: '700',
    color: '#c5d5ef',
  },
  openHint: { marginTop: 12, fontSize: 12, color: '#7dd3fc', fontWeight: '700' },

  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.64)' },
  modalCard: {
    maxHeight: '92%',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    backgroundColor: '#111a2d',
    borderTopWidth: 1,
    borderColor: '#263552',
    paddingHorizontal: 16,
    paddingTop: 10,
  },
  modalContent: { paddingBottom: 28 },
  sheetHandle: {
    alignSelf: 'center',
    width: 44,
    height: 4,
    borderRadius: 999,
    backgroundColor: '#475569',
    marginBottom: 12,
  },
  modalTitle: { fontSize: 20, fontWeight: '900', color: '#f8fafc' },
  modalSubtitle: { marginTop: 4, fontSize: 13, color: '#9bb0d2' },
  summaryGrid: { marginTop: 16, flexDirection: 'row', gap: 10 },
  summaryChip: {
    flex: 1,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#263552',
    backgroundColor: '#0b1220',
    paddingVertical: 12,
    paddingHorizontal: 12,
    alignItems: 'center',
  },
  summaryValue: { fontSize: 12, fontWeight: '900', color: '#f8fafc', textAlign: 'center' },
  summaryLabel: {
    marginTop: 4,
    fontSize: 11,
    fontWeight: '700',
    color: '#8aa0c5',
    textTransform: 'uppercase',
  },
  detailBlock: {
    marginTop: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#263552',
    backgroundColor: '#0b1220',
    padding: 12,
  },
  detailLabel: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
    color: '#8aa0c5',
    textTransform: 'uppercase',
  },
  detailValue: { marginTop: 4, fontSize: 14, fontWeight: '600', color: '#f8fafc' },
  detailList: { marginTop: 14, gap: 10 },
  detailCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#263552',
    backgroundColor: '#0b1220',
    padding: 12,
  },
  detailCardTitle: { fontSize: 15, fontWeight: '800', color: '#f8fafc' },
  detailCardMeta: { marginTop: 4, fontSize: 12, color: '#9bb0d2' },
  detailCardLine: { marginTop: 8, fontSize: 13, color: '#dbeafe' },
  detailCardError: { marginTop: 8, fontSize: 13, color: '#fb7185' },
  detailCardActions: { marginTop: 12, flexDirection: 'row', justifyContent: 'flex-end' },
  detailActionBtn: {
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    alignItems: 'center',
  },
  detailActionText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  detailDeleteBtn: { backgroundColor: '#991b1b' },

  modalActions: { marginTop: 16, flexDirection: 'row', gap: 10 },
  closeBtn: {
    marginTop: 10,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#334463',
    backgroundColor: '#0b1220',
    paddingVertical: 12,
    alignItems: 'center',
  },
  closeBtnText: { color: '#f8fafc', fontSize: 15, fontWeight: '700' },

  actionBtn: {
    flex: 1,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
    alignItems: 'center',
  },
  retryBtn: { backgroundColor: '#f59e0b' },
  deleteBtn: { backgroundColor: '#991b1b' },
  actionText: { color: '#fff', fontSize: 16, fontWeight: '700' },

  footer: {
    borderTopWidth: 1,
    borderTopColor: '#1f2b44',
    backgroundColor: '#111a2d',
    paddingHorizontal: 16,
    paddingBottom: 32,
    paddingTop: 16,
  },
  syncBtn: {
    borderRadius: 16,
    backgroundColor: '#2563eb',
    paddingHorizontal: 16,
    paddingVertical: 16,
    alignItems: 'center',
  },
  syncBtnText: { textAlign: 'center', fontSize: 16, fontWeight: '700', color: '#fff' },
  closedBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#334463',
    backgroundColor: '#111a2d',
    paddingVertical: 48,
  },
  closedText: { fontSize: 16, fontWeight: '600', color: '#f8fafc', textAlign: 'center', paddingHorizontal: 20 },
});

export default QueueScreen;
