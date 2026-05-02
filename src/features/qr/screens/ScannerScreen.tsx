import React from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { CameraView } from 'expo-camera';
import { useScanner } from '../hooks/useScanner';
import { AssetDetailCard } from '../../inventory/components/AssetDetailCard';
import type { ScanCandidate } from '../../../types';

interface ScannerScreenProps {
  cycleId: number;
}

export default function ScannerScreen({ cycleId }: ScannerScreenProps): React.JSX.Element {
  const {
    hasPermission,
    scanned,
    loading,
    preview,
    conditions,
    queueStats,
    selectedCondition,
    remarks,
    selectedInventoryDetailIds,
    setSelectedInventoryDetailIds,
    onBarcodeScanned,
    setSelectedCondition,
    setRemarks,
    resetScan,
    confirmScan,
    refreshScanner,
  } = useScanner(cycleId);

  if (hasPermission === null) {
    return (
      <View style={styles.centered}>
        <Text style={styles.infoText}>Requesting camera permission...</Text>
      </View>
    );
  }

  if (hasPermission === false) {
    return (
      <View style={styles.centered}>
        <Text style={styles.infoText}>Camera permission denied</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <CameraView
        onBarcodeScanned={scanned ? undefined : onBarcodeScanned}
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        style={StyleSheet.absoluteFillObject}
      />

      <View style={styles.overlay}>
        <View style={styles.headerCard}>
          <View>
            <Text style={styles.headerTitle}>QR Scanner</Text>
            <Text style={styles.headerSubtitle}>Minimal, guided scanning for inventory checks</Text>
          </View>
          <View style={styles.queuePills}>
            <View style={styles.queuePill}>
              <Text style={styles.queuePillLabel}>Queue</Text>
              <Text style={styles.queuePillValue}>{queueStats.total}</Text>
            </View>
            <View style={styles.queuePill}>
              <Text style={styles.queuePillLabel}>Synced</Text>
              <Text style={[styles.queuePillValue, styles.queuePillSuccess]}>{queueStats.synced}</Text>
            </View>
            <View style={styles.queuePill}>
              <Text style={styles.queuePillLabel}>Failed</Text>
              <Text style={[styles.queuePillValue, styles.queuePillDanger]}>{queueStats.failed}</Text>
            </View>
          </View>
        </View>

        <View style={styles.centerPreview}>
          <View style={styles.previewFrame}>
            <View style={styles.previewCornerTopLeft} />
            <View style={styles.previewCornerTopRight} />
            <View style={styles.previewCornerBottomLeft} />
            <View style={styles.previewCornerBottomRight} />
          </View>
        </View>

        <View style={styles.footerBar}>
          <View style={styles.footerRow}>
            <TouchableOpacity style={[styles.footerButton, styles.secondaryButton]} onPress={() => void refreshScanner()} disabled={loading}>
              <Text style={styles.secondaryButtonText}>Refresh</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.footerButton, styles.primaryButton]} onPress={resetScan} disabled={loading}>
              <Text style={styles.primaryButtonText}>Resume Scan</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      <Modal visible={!!preview} transparent animationType="slide" onRequestClose={resetScan}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            {loading ? (
              <View style={styles.loadingCenter}>
                <ActivityIndicator size="large" color="#2563EB" />
                <Text style={styles.loadingText}>Loading preview...</Text>
              </View>
            ) : (
              <ScrollView showsVerticalScrollIndicator={false}>
                <View style={styles.sheetHandle} />
                <Text style={styles.confirmTitle}>Confirm Scan</Text>
                <Text style={styles.confirmSubtitle}>Review the item details and choose the matching property number.</Text>

                {preview ? (
                  <View style={styles.sheetSection}>
                    <AssetDetailCard
                      assetType={preview.asset?.rpc_type ?? 'RPCPPE'}
                      title={preview.asset?.article ?? 'Unknown Asset'}
                      subtitle={preview.asset?.description}
                      code={preview.asset?.property_number}
                      description={preview.qr_value}
                    />

                    <View style={styles.summaryRow}>
                      <View style={styles.summaryChip}>
                        <Text style={styles.summaryValue}>{preview.group_total_count}</Text>
                        <Text style={styles.summaryLabel}>Total</Text>
                      </View>
                      <View style={styles.summaryChip}>
                        <Text style={styles.summaryValue}>{preview.group_scanned_count}</Text>
                        <Text style={styles.summaryLabel}>Scanned</Text>
                      </View>
                      <View style={styles.summaryChip}>
                        <Text style={styles.summaryValue}>{preview.group_remaining_count}</Text>
                        <Text style={styles.summaryLabel}>Remaining</Text>
                      </View>
                    </View>

                    <View style={styles.section}>
                      <Text style={styles.sectionLabel}>Select property numbers</Text>
                      <View style={styles.candidateWrap}>
                        {(preview.candidates ?? []).map((candidate: ScanCandidate) => {
                          const selected = selectedInventoryDetailIds.includes(candidate.inventory_detail_id);
                          const disabled = candidate.is_scanned;
                          return (
                            <TouchableOpacity
                              key={candidate.inventory_detail_id}
                              style={[
                                styles.candidateChip,
                                selected && styles.candidateChipSelected,
                                disabled && styles.candidateChipDisabled,
                              ]}
                              onPress={() => {
                                if (disabled) return;
                                setSelectedInventoryDetailIds(
                                  selected
                                    ? selectedInventoryDetailIds.filter((id: number) => id !== candidate.inventory_detail_id)
                                    : [...selectedInventoryDetailIds, candidate.inventory_detail_id]
                                );
                              }}
                              disabled={disabled}
                            >
                              <Text
                                style={[
                                  styles.candidateText,
                                  selected && styles.candidateTextSelected,
                                  disabled && styles.candidateTextDisabled,
                                ]}
                              >
                                {candidate.property_number ?? `#${candidate.inventory_detail_id}`}
                                {candidate.is_scanned ? ' (scanned)' : ''}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    </View>
                  </View>
                ) : null}

                <View style={styles.section}>
                  <Text style={styles.sectionLabel}>Condition</Text>
                  <View style={styles.conditionListWrap}>
                    <ScrollView nestedScrollEnabled>
                      {(Array.isArray(conditions) ? conditions : []).map((cond) => {
                        const selected = selectedCondition === cond.ConditionID;
                        return (
                          <TouchableOpacity
                            key={cond.ConditionID}
                            style={[styles.conditionRow, selected && styles.conditionRowSelected]}
                            onPress={() => setSelectedCondition(cond.ConditionID)}
                          >
                            <Text style={[styles.conditionText, selected && styles.conditionTextSelected]}>
                              {cond.ConditionName}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </ScrollView>
                  </View>
                </View>

                <View style={styles.section}>
                  <Text style={styles.sectionLabel}>Remarks</Text>
                  <TextInput
                    style={styles.remarksInput}
                    placeholder="Add remarks (optional)"
                    placeholderTextColor="#94a3b8"
                    value={remarks}
                    onChangeText={setRemarks}
                    multiline
                  />
                </View>

                <View style={styles.actionRow}>
                  <TouchableOpacity style={[styles.actionButton, styles.cancelButton]} onPress={resetScan} disabled={loading}>
                    <Text style={styles.actionButtonText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.actionButton, styles.confirmButton]}
                    onPress={() => {
                      confirmScan().catch((error: unknown) => {
                        Alert.alert('Validation', error instanceof Error ? error.message : 'Invalid scan');
                      });
                    }}
                    disabled={loading}
                  >
                    <Text style={styles.actionButtonText}>Confirm</Text>
                  </TouchableOpacity>
                </View>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16, backgroundColor: '#0f172a' },
  infoText: { fontSize: 16, color: '#f8fafc' },
  overlay: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, justifyContent: 'space-between', backgroundColor: 'rgba(15,23,42,0.28)' },
  headerCard: { marginTop: 44, marginHorizontal: 16, borderRadius: 24, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', backgroundColor: 'rgba(15,23,42,0.84)', padding: 16, gap: 12 },
  headerTitle: { fontSize: 18, fontWeight: '800', color: '#fff' },
  headerSubtitle: { marginTop: 4, fontSize: 13, color: '#cbd5e1' },
  queuePills: { flexDirection: 'row', gap: 8 },
  queuePill: { flex: 1, borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', backgroundColor: 'rgba(255,255,255,0.06)', paddingVertical: 10, paddingHorizontal: 10, alignItems: 'center' },
  queuePillLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 0.6, color: '#cbd5e1', textTransform: 'uppercase' },
  queuePillValue: { marginTop: 3, fontSize: 18, fontWeight: '800', color: '#fff' },
  queuePillSuccess: { color: '#34d399' },
  queuePillDanger: { color: '#fb7185' },
  centerPreview: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  previewFrame: { height: 196, width: 196, borderRadius: 32, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.26)', backgroundColor: 'rgba(255,255,255,0.04)', alignItems: 'center', justifyContent: 'center' },
  previewCornerTopLeft: { position: 'absolute', left: 16, top: 16, width: 28, height: 28, borderLeftWidth: 3, borderTopWidth: 3, borderColor: '#93c5fd', borderTopLeftRadius: 12 },
  previewCornerTopRight: { position: 'absolute', right: 16, top: 16, width: 28, height: 28, borderRightWidth: 3, borderTopWidth: 3, borderColor: '#93c5fd', borderTopRightRadius: 12 },
  previewCornerBottomLeft: { position: 'absolute', left: 16, bottom: 16, width: 28, height: 28, borderLeftWidth: 3, borderBottomWidth: 3, borderColor: '#93c5fd', borderBottomLeftRadius: 12 },
  previewCornerBottomRight: { position: 'absolute', right: 16, bottom: 16, width: 28, height: 28, borderRightWidth: 3, borderBottomWidth: 3, borderColor: '#93c5fd', borderBottomRightRadius: 12 },
  footerBar: { borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.08)', backgroundColor: 'rgba(15,23,42,0.88)', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 20 },
  footerRow: { flexDirection: 'row', gap: 12 },
  footerButton: { flex: 1, borderRadius: 14, paddingVertical: 12, paddingHorizontal: 12, alignItems: 'center' },
  secondaryButton: { backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)' },
  secondaryButtonText: { color: '#fff', fontWeight: '700' },
  primaryButton: { backgroundColor: '#2563EB' },
  primaryButtonText: { color: '#fff', fontWeight: '700' },
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.6)' },
  modalCard: { maxHeight: '90%', borderTopLeftRadius: 28, borderTopRightRadius: 28, backgroundColor: '#fff', paddingHorizontal: 16, paddingTop: 10 },
  sheetHandle: { alignSelf: 'center', width: 44, height: 4, borderRadius: 999, backgroundColor: '#cbd5e1', marginBottom: 12 },
  loadingCenter: { alignItems: 'center', justifyContent: 'center', paddingVertical: 24 },
  loadingText: { marginTop: 12, color: '#64748b' },
  confirmTitle: { marginBottom: 4, fontSize: 20, fontWeight: '800', color: '#0f172a' },
  confirmSubtitle: { marginBottom: 14, fontSize: 13, color: '#64748b' },
  sheetSection: { gap: 12 },
  section: { marginTop: 12 },
  sectionLabel: { marginBottom: 8, fontSize: 14, fontWeight: '700', color: '#334155' },
  summaryRow: { flexDirection: 'row', gap: 10 },
  summaryChip: { flex: 1, borderRadius: 14, borderWidth: 1, borderColor: '#e2e8f0', backgroundColor: '#f8fafc', paddingVertical: 10, alignItems: 'center' },
  summaryValue: { fontSize: 18, fontWeight: '900', color: '#0f172a' },
  summaryLabel: { marginTop: 2, fontSize: 11, fontWeight: '700', color: '#64748b', textTransform: 'uppercase' },
  conditionListWrap: { maxHeight: 176, overflow: 'hidden', borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0' },
  conditionRow: { borderBottomWidth: 1, borderBottomColor: '#f1f5f9', paddingHorizontal: 12, paddingVertical: 10, backgroundColor: '#fff' },
  conditionRowSelected: { backgroundColor: '#2563EB' },
  conditionText: { fontSize: 14, color: '#334155' },
  conditionTextSelected: { color: '#fff' },
  candidateWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  candidateChip: { borderRadius: 999, borderWidth: 1, borderColor: '#cbd5e1', backgroundColor: '#fff', paddingHorizontal: 12, paddingVertical: 8 },
  candidateChipSelected: { backgroundColor: '#2563EB', borderColor: '#2563EB' },
  candidateChipDisabled: { opacity: 0.5 },
  candidateText: { fontSize: 12, fontWeight: '700', color: '#334155' },
  candidateTextSelected: { color: '#fff' },
  candidateTextDisabled: { color: '#94a3b8' },
  remarksInput: { minHeight: 80, borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0', backgroundColor: '#f8fafc', paddingHorizontal: 12, paddingVertical: 10, color: '#0f172a' },
  actionRow: { marginTop: 16, flexDirection: 'row', gap: 12, paddingBottom: 24 },
  actionButton: { flex: 1, borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  cancelButton: { backgroundColor: '#94a3b8' },
  confirmButton: { backgroundColor: '#10b981' },
  actionButtonText: { color: '#fff', fontWeight: '700' },
});
