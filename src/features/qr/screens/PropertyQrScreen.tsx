import React, { useMemo, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Linking,
    Modal,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { Camera, CameraView, BarcodeScanningResult } from 'expo-camera';
import ApiService from '../../shared/services/apiService';
import { AssetDetailCard } from '../../inventory/components/AssetDetailCard';
import type { InventoryResponse, QrScanAssignedProperty, QrScanResponse } from '../../../types';
import { parseQrTarget } from '../utils/parseQrTarget';

type PreviewState =
    | { kind: 'property'; data: QrScanResponse; rawValue: string }
    | { kind: 'inventory'; data: InventoryResponse; rawValue: string; inventoryDetailId: number | null }
    | null;

function formatDate(raw?: string | null): string {
    if (!raw) return 'Not recorded';
    const date = new Date(raw);
    if (Number.isNaN(date.getTime())) return 'Not recorded';
    return new Intl.DateTimeFormat('en-PH', {
        timeZone: 'Asia/Manila',
        year: 'numeric',
        month: 'short',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
    }).format(date);
}

function getPropertyTitle(property: QrScanAssignedProperty): string {
    return (
        property.inventoryDetail?.drDetail?.ItemDescription
        ?? property.inventoryDetail?.Description
        ?? property.Description
        ?? property.inventoryDetail?.PropertyName
        ?? 'Property'
    );
}

function getPropertyNumber(property: QrScanAssignedProperty): string {
    return property.inventoryDetail?.PropertyNumber ?? property.PropertyCardNumber ?? '—';
}

export function PropertyQrScreen(): React.JSX.Element {
    const [scanMode, setScanMode] = useState<'paste' | 'camera'>('paste');
    const [input, setInput] = useState('');
    const [hasPermission, setHasPermission] = useState<boolean | null>(null);
    const [scanned, setScanned] = useState(false);
    const [loading, setLoading] = useState(false);
    const [preview, setPreview] = useState<PreviewState>(null);
    const [selectedInventoryDetailId, setSelectedInventoryDetailId] = useState<number | null>(null);

    const inventory = useMemo(() => {
        if (preview?.kind !== 'inventory') return null;
        const details = preview.data.details ?? [];
        if (details.length === 0) return null;
        const selected = selectedInventoryDetailId
            ? details.find((detail) => detail.InventoryDetailID === selectedInventoryDetailId) ?? null
            : null;
        return {
            data: preview.data,
            details,
            selected: selected ?? details[0] ?? null,
        };
    }, [preview, selectedInventoryDetailId]);

    const requestCameraPermission = async (): Promise<void> => {
        const { status } = await Camera.requestCameraPermissionsAsync();
        setHasPermission(status === 'granted');
    };

    const loadTarget = async (rawValue: string): Promise<void> => {
        const target = parseQrTarget(rawValue);
        if (!target) {
            Alert.alert('Unsupported QR', 'This QR must be a PropertyID, /qr/scan/{id}, or /admin/inventory/{id}.');
            return;
        }

        if (target.kind === 'inventory' && !target.inventoryDetailId) {
            Alert.alert(
                'Invalid QR',
                'This inventory QR must include ?detail={InventoryDetailID}. Please reprint the sticker per item.'
            );
            return;
        }

        setLoading(true);
        try {
            if (target.kind === 'property') {
                const response = await ApiService.scanProperty(target.propertyId);
                setPreview({ kind: 'property', data: response, rawValue });
                setSelectedInventoryDetailId(null);
            } else {
                const response = await ApiService.getInventory(target.inventoryId);
                setPreview({ kind: 'inventory', data: response, rawValue, inventoryDetailId: target.inventoryDetailId });
                setSelectedInventoryDetailId(target.inventoryDetailId);
            }
        } catch (error) {
            console.error('Failed to load QR target:', error);
            Alert.alert('Preview failed', error instanceof Error ? error.message : 'Unable to load QR preview.');
        } finally {
            setLoading(false);
            setScanned(false);
        }
    };

    const onBarcodeScanned = async (result: BarcodeScanningResult): Promise<void> => {
        if (scanned || loading) return;
        setScanned(true);
        await loadTarget(result.data);
    };

    const openFromInput = async (): Promise<void> => {
        await loadTarget(input);
    };

    const selectedProperty = preview?.kind === 'property' ? preview.data.property : null;
    const latestIssuance = preview?.kind === 'property' ? preview.data.latest_issuance_detail?.issuance ?? null : null;

    if (hasPermission === false) {
        return (
            <View style={styles.centered}>
                <Text style={styles.infoText}>Camera permission denied</Text>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            {scanMode === 'camera' ? (
                <CameraView
                    onBarcodeScanned={scanned || loading ? undefined : onBarcodeScanned}
                    barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
                    style={StyleSheet.absoluteFill}
                />
            ) : (
                <View style={styles.pasteBackdrop} />
            )}

            <View style={styles.overlay}>
                <View style={styles.headerBar}>
                    <Text style={styles.headerTitle}>Property QR</Text>
                    <Text style={styles.headerSubtitle}>Scan a PropertyID or QR URL</Text>
                </View>

                <View style={styles.modeBar}>
                    <TouchableOpacity
                        style={[styles.modeButton, scanMode === 'paste' && styles.modeButtonActive]}
                        onPress={() => setScanMode('paste')}
                    >
                        <Text style={[styles.modeButtonText, scanMode === 'paste' && styles.modeButtonTextActive]}>Paste</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[styles.modeButton, scanMode === 'camera' && styles.modeButtonActive]}
                        onPress={() => {
                            setScanMode('camera');
                            void requestCameraPermission();
                        }}
                    >
                        <Text style={[styles.modeButtonText, scanMode === 'camera' && styles.modeButtonTextActive]}>Camera</Text>
                    </TouchableOpacity>
                </View>

                {scanMode === 'paste' ? (
                    <View style={styles.inputCard}>
                        <Text style={styles.sectionLabel}>Paste PropertyID or QR URL</Text>
                        <TextInput
                            style={styles.input}
                            value={input}
                            onChangeText={setInput}
                            placeholder="/qr/scan/5 or http://.../inventory/8?detail=14"
                            placeholderTextColor="#94a3b8"
                            autoCapitalize="none"
                            autoCorrect={false}
                        />
                        <TouchableOpacity style={styles.primaryButton} onPress={() => void openFromInput()} disabled={loading}>
                            <Text style={styles.primaryButtonText}>{loading ? 'Loading...' : 'Open Preview'}</Text>
                        </TouchableOpacity>
                    </View>
                ) : (
                    <View style={styles.cameraHelp}>
                        <Text style={styles.cameraHelpText}>Point the camera at a property QR or inventory URL sticker.</Text>
                    </View>
                )}
            </View>

            <Modal visible={preview !== null} animationType="slide" transparent onRequestClose={() => setPreview(null)}>
                <View style={styles.modalOverlay}>
                    <View style={styles.modalCard}>
                        <ScrollView showsVerticalScrollIndicator={false}>
                            {loading ? (
                                <View style={styles.loadingCenter}>
                                    <ActivityIndicator size="large" color="#2563EB" />
                                    <Text style={styles.loadingText}>Loading preview...</Text>
                                </View>
                            ) : preview?.kind === 'property' && selectedProperty ? (
                                <View style={styles.previewStack}>
                                    <Text style={styles.previewTitle}>Property Scan Result</Text>
                                    <AssetDetailCard
                                        assetType={(selectedProperty.inventoryDetail?.PropertyName ? 'RPCPPE' : 'RPCPPE') as 'RPCPPE'}
                                        title={getPropertyTitle(selectedProperty)}
                                        subtitle={selectedProperty.inventoryDetail?.Description ?? selectedProperty.Description}
                                        code={getPropertyNumber(selectedProperty)}
                                        description={preview.rawValue}
                                    />
                                    <View style={styles.infoGrid}>
                                        <InfoCard label="End User" value={selectedProperty.endUser?.FullName ?? 'Not recorded'} />
                                        <InfoCard
                                            label="Department"
                                            value={selectedProperty.department?.DepartmentName ?? selectedProperty.endUser?.department?.DepartmentName ?? 'Not recorded'}
                                        />
                                        <InfoCard label="Accountable" value={selectedProperty.accountabilityLabel ?? 'Not recorded'} />
                                        <InfoCard label="Status" value={selectedProperty.propertyStatus?.StatusName ?? 'Not recorded'} />
                                        <InfoCard label="Condition" value={selectedProperty.condition?.ConditionName ?? 'Not recorded'} />
                                        <InfoCard label="Assigned" value={formatDate(selectedProperty.AssignedDate)} />
                                    </View>
                                    <View style={styles.sectionBlock}>
                                        <Text style={styles.sectionLabel}>Latest issuance</Text>
                                        {!latestIssuance ? (
                                            <Text style={styles.emptyText}>No issuance record found for this item.</Text>
                                        ) : (
                                            <View style={styles.detailBox}>
                                                <Text style={styles.detailLine}>Document: {latestIssuance.DocumentType} {latestIssuance.DocumentNumber}</Text>
                                                <Text style={styles.detailLine}>Status: {latestIssuance.Status}</Text>
                                                <Text style={styles.detailLine}>Date issued: {formatDate(latestIssuance.DateIssued)}</Text>
                                                <Text style={styles.detailLine}>Acknowledged: {formatDate(latestIssuance.AcknowledgedAt ?? null)}</Text>
                                            </View>
                                        )}
                                    </View>
                                </View>
                            ) : preview?.kind === 'inventory' && inventory?.selected ? (
                                <View style={styles.previewStack}>
                                    <Text style={styles.previewTitle}>Inventory Preview</Text>
                                    <AssetDetailCard
                                        assetType={inventory.selected.DocumentType === 'ICS' ? 'RPCSEP' : 'RPCPPE'}
                                        title={inventory.selected.dr_item_description ?? inventory.selected.Description ?? 'Unknown Item'}
                                        subtitle={inventory.selected.dr_article_name ?? inventory.selected.PropertyName ?? null}
                                        code={inventory.selected.PropertyNumber ?? null}
                                        description={preview.rawValue}
                                    />

                                    <View style={styles.sectionBlock}>
                                        <Text style={styles.sectionLabel}>Property numbers</Text>
                                        <View style={styles.chipWrap}>
                                            {inventory.details.map((detail) => {
                                                const active = detail.InventoryDetailID === inventory.selected.InventoryDetailID;
                                                return (
                                                    <TouchableOpacity
                                                        key={detail.InventoryDetailID}
                                                        style={[styles.chip, active && styles.chipActive]}
                                                        onPress={() => setSelectedInventoryDetailId(detail.InventoryDetailID)}
                                                    >
                                                        <Text style={[styles.chipText, active && styles.chipTextActive]}>
                                                            {detail.PropertyNumber ?? `#${detail.InventoryDetailID}`}
                                                        </Text>
                                                    </TouchableOpacity>
                                                );
                                            })}
                                        </View>
                                    </View>

                                    <View style={styles.infoGrid}>
                                        <InfoCard label="Brand" value={inventory.selected.Brand ?? 'Not recorded'} />
                                        <InfoCard label="Model" value={inventory.selected.ModelNumber ?? 'Not recorded'} />
                                        <InfoCard label="Serial" value={inventory.selected.SerialNumber ?? 'Not recorded'} />
                                        <InfoCard label="Unit cost" value={inventory.selected.UnitCost != null ? `₱${Number(inventory.selected.UnitCost).toLocaleString()}` : 'Not recorded'} />
                                        <InfoCard label="Custodian" value={inventory.selected.custodianName ?? 'Unassigned'} />
                                        <InfoCard label="Department" value={inventory.selected.locationDepartment ?? 'Not recorded'} />
                                    </View>

                                    <View style={styles.sectionBlock}>
                                        <Text style={styles.sectionLabel}>Inventory details</Text>
                                        <View style={styles.detailBox}>
                                            <Text style={styles.detailLine}>Inventory ID: {inventory.data.InventoryID}</Text>
                                            <Text style={styles.detailLine}>Inventory number: {inventory.data.InventoryNumber}</Text>
                                            <Text style={styles.detailLine}>Date acquired: {formatDate(inventory.data.DateAcquired)}</Text>
                                            <Text style={styles.detailLine}>Primary status: {inventory.data.PrimaryStatus ?? 'Not recorded'}</Text>
                                        </View>
                                    </View>
                                </View>
                            ) : null}

                            <View style={styles.actionRow}>
                                <TouchableOpacity style={[styles.actionButton, styles.cancelButton]} onPress={() => setPreview(null)}>
                                    <Text style={styles.actionButtonText}>Close</Text>
                                </TouchableOpacity>
                                {preview?.kind === 'inventory' && inventory?.selected ? (
                                    <TouchableOpacity
                                        style={[styles.actionButton, styles.primaryActionButton]}
                                        onPress={() => {
                                            const url = selectedProperty?.qrCode?.QRCodeData ?? preview.rawValue;
                                            void Linking.openURL(url);
                                        }}
                                    >
                                        <Text style={styles.actionButtonText}>Open QR URL</Text>
                                    </TouchableOpacity>
                                ) : null}
                            </View>
                        </ScrollView>
                    </View>
                </View>
            </Modal>
        </View>
    );
}

function InfoCard({ label, value }: { label: string; value: string }): React.JSX.Element {
    return (
        <View style={styles.infoCard}>
            <Text style={styles.infoLabel}>{label}</Text>
            <Text style={styles.infoValue}>{value}</Text>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#0b1220' },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16, backgroundColor: '#0b1220' },
    infoText: { fontSize: 16, color: '#f8fafc' },
    pasteBackdrop: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: '#0b1220' },
    overlay: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, justifyContent: 'space-between', backgroundColor: 'rgba(11,18,32,0.35)' },
    headerBar: { paddingHorizontal: 16, paddingTop: 28, paddingBottom: 12 },
    headerTitle: { fontSize: 24, fontWeight: '900', color: '#f8fafc' },
    headerSubtitle: { marginTop: 4, fontSize: 13, color: '#9bb0d2' },
    modeBar: { marginHorizontal: 16, marginTop: 8, flexDirection: 'row', gap: 10 },
    modeButton: { flex: 1, borderRadius: 14, borderWidth: 1, borderColor: '#334463', backgroundColor: '#111a2d', paddingVertical: 10, alignItems: 'center' },
    modeButtonActive: { backgroundColor: '#2563EB', borderColor: '#2563EB' },
    modeButtonText: { color: '#c5d5ef', fontWeight: '700' },
    modeButtonTextActive: { color: '#fff' },
    inputCard: { marginHorizontal: 16, marginBottom: 16, borderRadius: 20, backgroundColor: '#111a2d', borderWidth: 1, borderColor: '#263552', padding: 16 },
    sectionLabel: { marginBottom: 8, fontSize: 12, fontWeight: '800', color: '#8aa0c5', textTransform: 'uppercase' },
    input: { borderRadius: 14, borderWidth: 1, borderColor: '#334463', backgroundColor: '#0b1220', paddingHorizontal: 14, paddingVertical: 12, color: '#f8fafc' },
    primaryButton: { marginTop: 12, borderRadius: 14, backgroundColor: '#2563EB', paddingVertical: 12, alignItems: 'center' },
    primaryButtonText: { color: '#fff', fontWeight: '800' },
    cameraHelp: { marginHorizontal: 16, marginBottom: 16, borderRadius: 20, backgroundColor: '#111a2d', borderWidth: 1, borderColor: '#263552', padding: 16 },
    cameraHelpText: { color: '#dbe7ff', fontWeight: '600' },
    modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.62)' },
    modalCard: { maxHeight: '90%', borderTopLeftRadius: 28, borderTopRightRadius: 28, backgroundColor: '#111a2d', borderTopWidth: 1, borderColor: '#263552', paddingHorizontal: 16, paddingTop: 18 },
    loadingCenter: { alignItems: 'center', justifyContent: 'center', paddingVertical: 24 },
    loadingText: { marginTop: 12, color: '#9bb0d2' },
    previewStack: { gap: 14 },
    previewTitle: { fontSize: 20, fontWeight: '900', color: '#f8fafc' },
    infoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    infoCard: { width: '48%', borderRadius: 14, borderWidth: 1, borderColor: '#263552', backgroundColor: '#0b1220', padding: 12 },
    infoLabel: { fontSize: 11, fontWeight: '800', color: '#8aa0c5', textTransform: 'uppercase' },
    infoValue: { marginTop: 4, fontSize: 14, fontWeight: '700', color: '#f8fafc' },
    sectionBlock: { marginTop: 2 },
    emptyText: { color: '#9bb0d2', fontSize: 13 },
    detailBox: { borderRadius: 14, borderWidth: 1, borderColor: '#263552', backgroundColor: '#0b1220', padding: 12 },
    detailLine: { fontSize: 13, color: '#dbe7ff', marginBottom: 4 },
    chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: { borderRadius: 999, borderWidth: 1, borderColor: '#334463', backgroundColor: '#0b1220', paddingHorizontal: 12, paddingVertical: 8 },
    chipActive: { backgroundColor: '#2563EB', borderColor: '#2563EB' },
    chipText: { fontSize: 12, fontWeight: '800', color: '#c5d5ef' },
    chipTextActive: { color: '#fff' },
    actionRow: { flexDirection: 'row', gap: 12, paddingVertical: 18 },
    actionButton: { flex: 1, borderRadius: 14, paddingVertical: 12, alignItems: 'center', borderWidth: 1, borderColor: '#334463' },
    cancelButton: { backgroundColor: '#475569' },
    primaryActionButton: { backgroundColor: '#10b981' },
    actionButtonText: { color: '#fff', fontWeight: '800' },
});