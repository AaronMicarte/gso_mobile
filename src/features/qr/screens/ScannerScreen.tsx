import React, { useState } from 'react';
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
import { MaterialIcons } from '@expo/vector-icons';
import { CameraView } from 'expo-camera';
import { useScanner } from '../hooks/useScanner';
import { AssetDetailCard } from '../../inventory/components/AssetDetailCard';
import type { ScanCandidate } from '../../../types';

interface ScannerScreenProps {
  cycleId: number;
  cycleTotals?: {
    total: number;
    rpcppe: number;
    rpcsep: number;
  };
}

export default function ScannerScreen({ cycleId, cycleTotals }: ScannerScreenProps): React.JSX.Element {
  const {
    hasPermission,
    scanned,
    loading,
    preview,
    conditions,
    selectedCondition,
    remarks,
    selectedInventoryDetailIds,
    setSelectedInventoryDetailIds,
    onBarcodeScanned,
    previewManual,
    setSelectedCondition,
    setRemarks,
    resetScan,
    confirmScan,
    refreshScanner,
  } = useScanner(cycleId);

  const [manualInput, setManualInput] = useState('');
  const [manualModalVisible, setManualModalVisible] = useState(false);

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
        style={StyleSheet.absoluteFill}
      />

      <View style={styles.overlay}>
        <View style={styles.headerCard}>
          <View style={styles.headerTextBlock}>
            <Text style={styles.headerTitle}>QR Scanner</Text>
            <Text style={styles.headerSubtitle}>Scan first. Manual entry is secondary.</Text>
          </View>
          <View style={styles.queuePills}>
            <View style={styles.queuePill}>
              <Text style={styles.queuePillLabel}>Total</Text>
              <Text style={styles.queuePillValue}>{cycleTotals?.total ?? 0}</Text>
            </View>
            <View style={styles.queuePill}>
              <Text style={styles.queuePillLabel}>RPCPPE</Text>
              <Text style={[styles.queuePillValue, styles.queuePillSuccess]}>{cycleTotals?.rpcppe ?? 0}</Text>
            </View>
            <View style={styles.queuePill}>
              <Text style={styles.queuePillLabel}>RPCSEP</Text>
              <Text style={[styles.queuePillValue, styles.queuePillDanger]}>{cycleTotals?.rpcsep ?? 0}</Text>
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
            <TouchableOpacity style={[styles.iconRefreshButton, styles.secondaryButton]} onPress={() => void refreshScanner()} disabled={loading}>
              <MaterialIcons name="refresh" size={20} color="#ffffff" />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.footerButton, styles.secondaryButton]}
              onPress={() => setManualModalVisible(true)}
              disabled={loading}
            >
              <Text style={styles.secondaryButtonText}>Manual Input</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      <Modal visible={manualModalVisible} transparent animationType="slide" onRequestClose={() => setManualModalVisible(false)}>
        <View style={styles.manualModalOverlay}>
          <View style={styles.manualModalCard}>
            <View style={styles.sheetHandle} />
            <Text style={styles.confirmTitle}>Manual Input</Text>
            <Text style={styles.confirmSubtitle}>Enter a property number or QR value to preview the item.</Text>

            <TextInput
              style={styles.manualModalInput}
              placeholder="Enter property number"
              placeholderTextColor="#94a3b8"
              value={manualInput}
              onChangeText={setManualInput}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="done"
            />

            <View style={styles.manualModalActions}>
              <TouchableOpacity style={[styles.actionButton, styles.cancelButton]} onPress={() => setManualModalVisible(false)} disabled={loading}>
                <Text style={styles.actionButtonText}>Close</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionButton, styles.confirmButton]}
                onPress={() => {
                  const value = manualInput.trim();
                  if (!value) {
                    Alert.alert('Validation', 'Please enter a property number');
                    return;
                  }
                  void previewManual(value)
                    .catch((err: unknown) => {
                      console.error('Manual preview error:', err);
                    })
                    .finally(() => {
                      setManualModalVisible(false);
                    });
                }}
                disabled={loading}
              >
                <Text style={styles.actionButtonText}>Preview</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

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
                    // description={preview.qr_value}
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
                      <Text style={styles.sectionLabel}>Property Number</Text>
                      <View style={{ marginTop: 8, flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' }}>
                        <Text style={{ color: '#fff', fontWeight: '800', fontSize: 16 }}>
                          Property #: {(preview.candidates ?? [])[0]?.property_number ?? `#${(preview.candidates ?? [])[0]?.inventory_detail_id ?? preview.asset?.inventory_detail_id ?? ''}`}
                        </Text>
                        <Text style={{ marginLeft: 12, color: (preview.candidates ?? [])[0]?.is_scanned ? '#fb7185' : '#34d399', fontSize: 14, fontWeight: '600' }}>
                          {(preview.candidates ?? [])[0]?.is_scanned ? '(already scanned)' : '(available)'}
                        </Text>
                      </View>
                    </View>
                  </View>
                ) : null}

                <View style={styles.section}>
                  <Text style={styles.sectionLabel}>Condition</Text>
                  <View style={styles.conditionListWrap}>
                    <ScrollView nestedScrollEnabled>
                      {(Array.isArray(conditions) ? conditions : [])
                        .filter((cond) => cond.ConditionName !== 'Under Repair')
                        .map((cond) => {
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
                  <Text style={{ marginTop: 6, fontSize: 11, color: '#94a3b8' }}>
                    Selecting condition here directly updates Inventory & All Items.
                  </Text>
                </View>

                <View style={styles.section}>
                  <Text style={styles.sectionLabel}>Remarks</Text>
                  <TextInput
                    value={remarks}
                    onChangeText={setRemarks}
                    multiline
                    placeholder="Optional custom remark. Leave blank to use default missing-count text."
                    placeholderTextColor="#94a3b8"
                    style={styles.remarksInput}
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
  container: { flex: 1, backgroundColor: '#0b1220' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16, backgroundColor: '#0b1220' },
  infoText: { fontSize: 16, color: '#f8fafc' },
  overlay: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, justifyContent: 'space-between', backgroundColor: 'rgba(11,18,32,0.3)' },
  headerCard: { marginTop: 12, marginHorizontal: 16, borderRadius: 24, borderWidth: 1, borderColor: '#334463', backgroundColor: 'rgba(17,26,45,0.9)', padding: 14, gap: 10 },
  headerTextBlock: { gap: 2 },
  headerTitle: { fontSize: 18, fontWeight: '800', color: '#fff' },
  headerSubtitle: { marginTop: 4, fontSize: 13, color: '#9bb0d2' },
  queuePills: { flexDirection: 'row', gap: 6 },
  queuePill: { flex: 1, borderRadius: 14, borderWidth: 1, borderColor: '#334463', backgroundColor: '#0b1220', paddingVertical: 8, paddingHorizontal: 8, alignItems: 'center' },
  queuePillLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 0.6, color: '#8aa0c5', textTransform: 'uppercase' },
  queuePillValue: { marginTop: 2, fontSize: 16, fontWeight: '800', color: '#fff' },
  queuePillSuccess: { color: '#34d399' },
  queuePillDanger: { color: '#fb7185' },
  centerPreview: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  previewFrame: { height: 216, width: 216, borderRadius: 36, borderWidth: 1.5, borderColor: '#5b7cb2', backgroundColor: 'rgba(15,23,42,0.35)', alignItems: 'center', justifyContent: 'center' },
  previewCornerTopLeft: { position: 'absolute', left: 16, top: 16, width: 28, height: 28, borderLeftWidth: 3, borderTopWidth: 3, borderColor: '#60a5fa', borderTopLeftRadius: 12 },
  previewCornerTopRight: { position: 'absolute', right: 16, top: 16, width: 28, height: 28, borderRightWidth: 3, borderTopWidth: 3, borderColor: '#60a5fa', borderTopRightRadius: 12 },
  previewCornerBottomLeft: { position: 'absolute', left: 16, bottom: 16, width: 28, height: 28, borderLeftWidth: 3, borderBottomWidth: 3, borderColor: '#60a5fa', borderBottomLeftRadius: 12 },
  previewCornerBottomRight: { position: 'absolute', right: 16, bottom: 16, width: 28, height: 28, borderRightWidth: 3, borderBottomWidth: 3, borderColor: '#60a5fa', borderBottomRightRadius: 12 },
  footerBar: { borderTopWidth: 1, borderTopColor: '#263552', backgroundColor: 'rgba(17,26,45,0.94)', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 20 },
  footerRow: { flexDirection: 'row', gap: 10 },
  footerButton: { flex: 1, borderRadius: 14, paddingVertical: 12, paddingHorizontal: 12, alignItems: 'center' },
  iconRefreshButton: { width: 52, minWidth: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  secondaryButton: { backgroundColor: '#0b1220', borderWidth: 1, borderColor: '#334463' },
  secondaryButtonText: { color: '#fff', fontWeight: '700' },
  primaryButton: { backgroundColor: '#2563EB' },
  primaryButtonText: { color: '#fff', fontWeight: '700' },
  manualModalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.62)' },
  manualModalCard: { borderTopLeftRadius: 28, borderTopRightRadius: 28, backgroundColor: '#111a2d', borderTopWidth: 1, borderColor: '#263552', paddingHorizontal: 16, paddingTop: 10, paddingBottom: 20 },
  manualModalInput: { marginTop: 10, borderRadius: 14, borderWidth: 1, borderColor: '#334463', backgroundColor: '#0b1220', paddingHorizontal: 14, paddingVertical: 12, color: '#f8fafc' },
  manualModalActions: { marginTop: 14, flexDirection: 'row', gap: 10 },
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.6)' },
  modalCard: { maxHeight: '90%', borderTopLeftRadius: 28, borderTopRightRadius: 28, backgroundColor: '#111a2d', borderTopWidth: 1, borderColor: '#263552', paddingHorizontal: 16, paddingTop: 10 },
  sheetHandle: { alignSelf: 'center', width: 44, height: 4, borderRadius: 999, backgroundColor: '#475569', marginBottom: 12 },
  loadingCenter: { alignItems: 'center', justifyContent: 'center', paddingVertical: 24 },
  loadingText: { marginTop: 12, color: '#9bb0d2' },
  confirmTitle: { marginBottom: 4, fontSize: 20, fontWeight: '800', color: '#f8fafc' },
  confirmSubtitle: { marginBottom: 14, fontSize: 13, color: '#9bb0d2' },
  sheetSection: { gap: 12 },
  section: { marginTop: 12 },
  sectionLabel: { marginBottom: 8, fontSize: 14, fontWeight: '700', color: '#c5d5ef' },
  summaryRow: { flexDirection: 'row', gap: 10 },
  summaryChip: { flex: 1, borderRadius: 14, borderWidth: 1, borderColor: '#263552', backgroundColor: '#0b1220', paddingVertical: 10, alignItems: 'center' },
  summaryValue: { fontSize: 18, fontWeight: '900', color: '#f8fafc' },
  summaryLabel: { marginTop: 2, fontSize: 11, fontWeight: '700', color: '#8aa0c5', textTransform: 'uppercase' },
  conditionListWrap: { maxHeight: 176, overflow: 'hidden', borderRadius: 12, borderWidth: 1, borderColor: '#334463' },
  conditionRow: { borderBottomWidth: 1, borderBottomColor: '#223252', paddingHorizontal: 12, paddingVertical: 10, backgroundColor: '#0b1220' },
  conditionRowSelected: { backgroundColor: '#2563EB' },
  conditionText: { fontSize: 14, color: '#c5d5ef' },
  conditionTextSelected: { color: '#fff' },
  candidateWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  candidateChip: { borderRadius: 999, borderWidth: 1, borderColor: '#334463', backgroundColor: '#0b1220', paddingHorizontal: 12, paddingVertical: 8 },
  candidateChipSelected: { backgroundColor: '#2563EB', borderColor: '#2563EB' },
  candidateChipDisabled: { opacity: 0.5 },
  candidateText: { fontSize: 12, fontWeight: '700', color: '#c5d5ef' },
  candidateTextSelected: { color: '#fff' },
  candidateTextDisabled: { color: '#94a3b8' },
  remarksInput: { minHeight: 80, borderRadius: 12, borderWidth: 1, borderColor: '#334463', backgroundColor: '#0b1220', paddingHorizontal: 12, paddingVertical: 10, color: '#f8fafc' },
  actionRow: { marginTop: 16, flexDirection: 'row', gap: 12, paddingBottom: 24 },
  actionButton: { flex: 1, borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  cancelButton: { backgroundColor: '#475569' },
  confirmButton: { backgroundColor: '#10b981' },
  actionButtonText: { color: '#fff', fontWeight: '700' },
});
