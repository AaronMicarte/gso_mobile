import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  RefreshControl,
  Text,
  TouchableOpacity,
  View,
  StyleSheet,
} from 'react-native';
import { LocalScan } from '../../../types';
import { useAuth } from '../../auth/providers/AuthProvider';
import ScanQueueService from '../services/scanQueueService';
import SyncService from '../services/syncService';

function QueueScreen(): React.JSX.Element {
  const { cycleId } = useAuth();
  const [scans, setScans] = useState<LocalScan[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [stats, setStats] = useState({ synced: 0, failed: 0, total: 0, pending: 0 });

  useEffect(() => {
    void loadScans();
    const interval = setInterval(() => {
      void loadScans();
    }, 10000);

    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cycleId]);

  async function loadScans(): Promise<void> {
    try {

      if (cycleId) {
        const removed = await ScanQueueService.reconcileSyncedScans(cycleId);
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
  }

  async function onRefresh(): Promise<void> {
    setRefreshing(true);
    try {
      await loadScans();
    } finally {
      setRefreshing(false);
    }
  }

  async function handleManualSync(): Promise<void> {
    setSyncing(true);
    try {
      const result = await SyncService.manualSync();
      // Show detailed result to avoid false 'completed' success messages
      if (!result || (result.synced === 0 && result.failed === 0 && result.total === 0)) {
        Alert.alert('Info', 'No pending scans to sync');
      } else {
        Alert.alert('Sync Result', `Synced: ${result.synced}\nFailed: ${result.failed}\nTotal: ${result.total}`);
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

  async function handleDeleteScan(clientUuid: string): Promise<void> {
    Alert.alert('Delete Scan', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await ScanQueueService.deleteScan(clientUuid);
            await loadScans();
          } catch {
            Alert.alert('Error', 'Failed to delete scan');
          }
        },
      },
    ]);
  }

  async function handleRetryScan(clientUuid: string): Promise<void> {
    try {
      await ScanQueueService.updateScanStatus(clientUuid, 'pending');
      await loadScans();
      Alert.alert('Success', 'Scan marked for retry');
    } catch {
      Alert.alert('Error', 'Failed to retry scan');
    }
  }

  const renderScan = ({ item }: { item: LocalScan }) => {
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
      <View style={styles.card}>
        <View style={styles.cardRow}>
          <View style={styles.cardLeft}>
            <Text style={styles.cardTitle}>{item.article || `Detail ${item.inventory_detail_id}`}</Text>
            <Text style={styles.cardSubtitle}>
              {item.property_number ? `Property: ${item.property_number}` : 'No property'}
            </Text>
            <Text style={styles.cardSubtitle}>
              {new Date(item.scanned_at || item.created_at).toLocaleString()}
            </Text>
          </View>
          <View style={badgeStyle}>
            <Text style={badgeTextStyle}>{item.status}</Text>
          </View>
        </View>

        <View style={styles.detailsBox}>
          {item.description && (
            <>
              <Text style={styles.detailLabel}>Description</Text>
              <Text style={styles.detailValue}>{item.description}</Text>
            </>
          )}
          {item.accountable_officer && (
            <>
              <Text style={styles.detailLabel}>Officer</Text>
              <Text style={styles.detailValue}>{item.accountable_officer}</Text>
            </>
          )}
          <Text style={styles.detailLabel}>Condition</Text>
          <Text style={styles.detailValue}>{item.condition_name || `ID ${item.condition_id}`}</Text>
          {item.unit_value && (
            <>
              <Text style={styles.detailLabel}>Value</Text>
              <Text style={styles.detailValue}>₱{Number(item.unit_value).toFixed(2)}</Text>
            </>
          )}
          {item.rpc_type && (
            <>
              <Text style={styles.detailLabel}>Type</Text>
              <Text style={styles.detailValue}>{item.rpc_type}</Text>
            </>
          )}
          {item.remarks && <Text style={styles.note}>{item.remarks}</Text>}
          {item.error_message && <Text style={styles.errorText}>{item.error_message}</Text>}
        </View>

        <View style={styles.actionsRow}>
          {item.status === 'failed' ? (
            <TouchableOpacity style={[styles.actionBtn, styles.retryBtn]} onPress={() => void handleRetryScan(item.client_uuid)}>
              <Text style={styles.actionText}>Retry</Text>
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity style={[styles.actionBtn, styles.deleteBtn]} onPress={() => void handleDeleteScan(item.client_uuid)}>
            <Text style={styles.actionText}>Delete</Text>
          </TouchableOpacity>
        </View>
      </View>
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
        <FlatList
          data={scans}
          renderItem={renderScan}
          keyExtractor={(item) => item.client_uuid}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} />
          }
          ListEmptyComponent={
            <View style={styles.emptyBox}>
              <Text style={styles.emptyText}>No scans yet</Text>
            </View>
          }
          contentContainerStyle={scans.length === 0 ? { flexGrow: 1 } : undefined}
        />
      </View>

      <View style={styles.footer}>
        <TouchableOpacity style={styles.syncBtn} onPress={() => void handleManualSync()} disabled={syncing}>
          {syncing ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.syncBtnText}>Manual Sync</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}


const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0b1220' },
  header: { borderBottomWidth: 1, borderBottomColor: '#1f2b44', backgroundColor: '#111a2d', paddingHorizontal: 16, paddingBottom: 16, paddingTop: 16 },
  headerTitle: { fontSize: 24, fontWeight: '900', color: '#f8fafc' },
  headerSubtitle: { marginTop: 4, fontSize: 13, color: '#9bb0d2' },
  statsContainer: { marginTop: 16, flexDirection: 'row', borderRadius: 16, borderWidth: 1, borderColor: '#263552', backgroundColor: '#0b1220', padding: 12 },
  statBox: { flex: 1, alignItems: 'center' },
  statNumber: { fontSize: 20, fontWeight: '800', color: '#f8fafc' },
  statLabel: { fontSize: 11, color: '#9bb0d2' },
  statSynced: { color: '#4ade80' },
  statPending: { color: '#38bdf8' },
  statFailed: { color: '#fb7185' },

  listWrap: { flex: 1, paddingHorizontal: 16, paddingVertical: 16 },
  emptyBox: { alignItems: 'center', justifyContent: 'center', borderRadius: 16, borderWidth: 1, borderStyle: 'dashed', borderColor: '#334463', backgroundColor: '#111a2d', paddingVertical: 48 },
  emptyText: { fontSize: 16, fontWeight: '600', color: '#9bb0d2' },

  card: { marginBottom: 12, borderRadius: 16, borderWidth: 1, borderColor: '#263552', backgroundColor: '#111a2d', padding: 16 },
  cardRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  cardLeft: { flex: 1, paddingRight: 12 },
  cardTitle: { fontSize: 16, fontWeight: '800', color: '#f8fafc' },
  cardSubtitle: { marginTop: 4, fontSize: 12, color: '#a7b7d1' },

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

  detailsBox: { marginTop: 12, borderRadius: 14, backgroundColor: '#0b1220', borderWidth: 1, borderColor: '#263552', padding: 12 },
  detailLabel: { fontSize: 11, fontWeight: '800', letterSpacing: 1.2, color: '#8aa0c5' },
  detailValue: { marginTop: 4, fontSize: 14, fontWeight: '600', color: '#f8fafc' },
  note: { marginTop: 12, fontSize: 14, color: '#c5d5ef' },
  errorText: { marginTop: 12, fontSize: 14, color: '#fb7185' },

  actionsRow: { marginTop: 12, flexDirection: 'row', gap: 12 },
  actionBtn: { flex: 1, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 12, alignItems: 'center' },
  retryBtn: { backgroundColor: '#f59e0b' },
  deleteBtn: { backgroundColor: '#991b1b' },
  actionText: { color: '#fff', fontSize: 16, fontWeight: '700' },

  footer: { borderTopWidth: 1, borderTopColor: '#1f2b44', backgroundColor: '#111a2d', paddingHorizontal: 16, paddingBottom: 32, paddingTop: 16 },
  syncBtn: { borderRadius: 16, backgroundColor: '#2563eb', paddingHorizontal: 16, paddingVertical: 16, alignItems: 'center' },
  syncBtnText: { textAlign: 'center', fontSize: 16, fontWeight: '700', color: '#fff' },
});

export default QueueScreen;