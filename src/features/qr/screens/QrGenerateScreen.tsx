import React, { useEffect, useMemo, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
    Share,
} from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import ApiService from '../../shared/services/apiService';
import type { QrScanAssignedProperty } from '../../../types';

function getDisplayName(property: QrScanAssignedProperty): string {
    return property.inventoryDetail?.drDetail?.ItemDescription ?? property.Description ?? 'Property';
}

export function QrGenerateScreen(): React.JSX.Element {
    const [search, setSearch] = useState('');
    const [missingOnly, setMissingOnly] = useState(false);
    const [loading, setLoading] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [rows, setRows] = useState<QrScanAssignedProperty[]>([]);
    const [total, setTotal] = useState(0);
    const [selected, setSelected] = useState<QrScanAssignedProperty | null>(null);
    const [generatedUrl, setGeneratedUrl] = useState<string | null>(null);

    const params = useMemo(
        () => ({
            per_page: 20,
            search: search.trim() || undefined,
            missing_qr_only: missingOnly || undefined,
        }),
        [search, missingOnly]
    );

    const load = async (): Promise<void> => {
        setLoading(true);
        try {
            const response = await ApiService.fetchQrProperties(params);
            setRows(response.data);
            setTotal(response.total);
        } catch (error) {
            console.error('Failed to load QR properties:', error);
            Alert.alert('Error', 'Failed to load QR properties.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        void load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [params.search, params.missing_qr_only]);

    const onRefresh = async (): Promise<void> => {
        setRefreshing(true);
        try {
            await load();
        } finally {
            setRefreshing(false);
        }
    };

    const handleGenerate = async (property: QrScanAssignedProperty): Promise<void> => {
        setLoading(true);
        try {
            const response = await ApiService.generateQrForProperty(property.PropertyID);
            const url = response.qr.QRCodeData ?? null;
            setSelected(property);
            setGeneratedUrl(url);
            await load();
            if (url) {
                Alert.alert('QR generated', 'The QR code has been generated successfully.');
            }
        } catch (error) {
            console.error('Failed to generate QR:', error);
            Alert.alert('Error', error instanceof Error ? error.message : 'Failed to generate QR code.');
        } finally {
            setLoading(false);
        }
    };

    const openDialog = (property: QrScanAssignedProperty): void => {
        setSelected(property);
        setGeneratedUrl(property.qrCode?.QRCodeData ?? null);
    };

    const selectedQrValue = selected
        ? (generatedUrl ?? selected.qrCode?.QRCodeData ?? `${selected.PropertyID}`)
        : null;

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <Text style={styles.title}>Generate QR Codes</Text>
                <Text style={styles.subtitle}>Assigned property records and generated QR values.</Text>
            </View>

            <View style={styles.filterCard}>
                <TextInput
                    value={search}
                    onChangeText={setSearch}
                    placeholder="Search property no., serial, end user..."
                    placeholderTextColor="#94a3b8"
                    style={styles.input}
                />
                <View style={styles.toggleRow}>
                    <TouchableOpacity style={[styles.toggleChip, missingOnly && styles.toggleChipActive]} onPress={() => setMissingOnly((value) => !value)}>
                        <Text style={[styles.toggleChipText, missingOnly && styles.toggleChipTextActive]}>Missing QR only</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.refreshButton} onPress={() => void load()}>
                        <Text style={styles.refreshButtonText}>Refresh</Text>
                    </TouchableOpacity>
                </View>
            </View>

            <View style={styles.summaryBar}>
                <Text style={styles.summaryText}>{loading ? 'Loading...' : `Showing ${rows.length} of ${total}`}</Text>
            </View>

            <ScrollView
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} />}
                contentContainerStyle={styles.listContent}
            >
                {rows.map((property) => {
                    const hasQr = Boolean(property.qrCode?.QRCodeData);
                    return (
                        <View key={property.PropertyID} style={styles.rowCard}>
                            <View style={styles.rowMain}>
                                <Text style={styles.rowTitle}>{getDisplayName(property)}</Text>
                                <Text style={styles.rowMeta} numberOfLines={2}>
                                    Property No: {property.inventoryDetail?.PropertyNumber ?? '—'} · Assigned to: {property.endUser?.FullName ?? 'N/A'}
                                </Text>
                                <Text style={styles.rowMeta} numberOfLines={1}>
                                    Dept: {property.department?.DepartmentName ?? property.endUser?.department?.DepartmentName ?? 'N/A'}
                                </Text>
                            </View>
                            <View style={styles.rowActions}>
                                <TouchableOpacity
                                    style={[styles.actionButton, hasQr ? styles.secondaryButton : styles.primaryButton]}
                                    onPress={() => {
                                        if (hasQr) {
                                            openDialog(property);
                                            return;
                                        }
                                        void handleGenerate(property);
                                    }}
                                    disabled={loading}
                                >
                                    <Text style={styles.actionButtonText}>{hasQr ? 'View / Print' : 'Generate'}</Text>
                                </TouchableOpacity>
                                {hasQr ? (
                                    <TouchableOpacity style={[styles.actionButton, styles.outlineButton]} onPress={() => void handleGenerate(property)} disabled={loading}>
                                        <Text style={styles.outlineButtonText}>Regenerate</Text>
                                    </TouchableOpacity>
                                ) : null}
                            </View>
                        </View>
                    );
                })}

                {rows.length === 0 && !loading ? (
                    <View style={styles.emptyState}>
                        <Text style={styles.emptyText}>No assigned properties found.</Text>
                    </View>
                ) : null}
            </ScrollView>

            {selected ? (
                <View style={styles.modalBackdrop}>
                    <View style={styles.modalCard}>
                        <Text style={styles.modalTitle}>QR: {getDisplayName(selected)}</Text>
                        <Text style={styles.modalSubtitle}>Property No: {selected.inventoryDetail?.PropertyNumber ?? '—'}</Text>

                        <View style={styles.qrBox}>
                            <Text style={styles.qrBoxLabel}>QR Code Data</Text>
                            <Text style={styles.qrBoxValue}>{selectedQrValue ?? 'No QR code generated yet.'}</Text>
                        </View>

                        {selectedQrValue ? (
                            <View style={styles.qrVisualWrap}>
                                <QRCode value={selectedQrValue} size={220} backgroundColor="#ffffff" color="#0f172a" />
                            </View>
                        ) : null}

                        <View style={styles.modalActions}>
                            <TouchableOpacity style={[styles.actionButton, styles.cancelButton]} onPress={() => { setSelected(null); setGeneratedUrl(null); }}>
                                <Text style={styles.actionButtonText}>Close</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.actionButton, styles.primaryButton]}
                                onPress={() => {
                                    if (!selected) return;
                                    void handleGenerate(selected);
                                }}
                                disabled={loading}
                            >
                                <Text style={styles.actionButtonText}>Regenerate</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.actionButton, styles.outlineButton]}
                                onPress={() => {
                                    if (!selectedQrValue) return;
                                    void Share.share({ message: selectedQrValue });
                                }}
                            >
                                <Text style={styles.outlineButtonText}>Share URL</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            ) : null}
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#0b1220' },
    header: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 },
    title: { fontSize: 22, fontWeight: '900', color: '#f8fafc' },
    subtitle: { marginTop: 4, fontSize: 13, color: '#9bb0d2' },
    filterCard: { marginHorizontal: 16, marginTop: 8, borderRadius: 18, backgroundColor: '#111a2d', padding: 12, borderWidth: 1, borderColor: '#263552' },
    input: { borderRadius: 14, borderWidth: 1, borderColor: '#334463', backgroundColor: '#0b1220', paddingHorizontal: 12, paddingVertical: 10, color: '#f8fafc' },
    toggleRow: { marginTop: 10, flexDirection: 'row', gap: 8, alignItems: 'center' },
    toggleChip: { borderRadius: 999, borderWidth: 1, borderColor: '#334463', backgroundColor: '#0b1220', paddingHorizontal: 12, paddingVertical: 8 },
    toggleChipActive: { backgroundColor: '#2563EB', borderColor: '#2563EB' },
    toggleChipText: { fontSize: 12, fontWeight: '700', color: '#c5d5ef' },
    toggleChipTextActive: { color: '#fff' },
    refreshButton: { marginLeft: 'auto', borderRadius: 999, backgroundColor: '#1d4ed8', paddingHorizontal: 12, paddingVertical: 8 },
    refreshButtonText: { color: '#fff', fontSize: 12, fontWeight: '800' },
    summaryBar: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 6 },
    summaryText: { fontSize: 13, fontWeight: '700', color: '#9bb0d2' },
    listContent: { paddingHorizontal: 16, paddingBottom: 24, gap: 10 },
    rowCard: { borderRadius: 18, backgroundColor: '#111a2d', borderWidth: 1, borderColor: '#263552', padding: 14, gap: 12 },
    rowMain: { gap: 4 },
    rowTitle: { fontSize: 16, fontWeight: '900', color: '#f8fafc' },
    rowMeta: { fontSize: 12, color: '#9bb0d2' },
    rowActions: { flexDirection: 'row', gap: 8 },
    actionButton: { flex: 1, borderRadius: 14, alignItems: 'center', paddingVertical: 10 },
    primaryButton: { backgroundColor: '#2563EB' },
    secondaryButton: { backgroundColor: '#1e293b' },
    outlineButton: { borderWidth: 1, borderColor: '#334463', backgroundColor: '#0b1220' },
    cancelButton: { backgroundColor: '#475569' },
    actionButtonText: { color: '#fff', fontWeight: '800', fontSize: 12 },
    outlineButtonText: { color: '#c5d5ef', fontWeight: '800', fontSize: 12 },
    emptyState: { paddingVertical: 24, alignItems: 'center' },
    emptyText: { color: '#9bb0d2', fontWeight: '600' },
    modalBackdrop: { position: 'absolute', inset: 0, justifyContent: 'flex-end', backgroundColor: 'rgba(15,23,42,0.56)' },
    modalCard: { borderTopLeftRadius: 28, borderTopRightRadius: 28, backgroundColor: '#111a2d', borderTopWidth: 1, borderColor: '#263552', paddingHorizontal: 16, paddingTop: 18, paddingBottom: 20 },
    modalTitle: { fontSize: 20, fontWeight: '900', color: '#f8fafc' },
    modalSubtitle: { marginTop: 4, fontSize: 13, color: '#9bb0d2' },
    qrBox: { marginTop: 14, borderRadius: 18, borderWidth: 1, borderColor: '#263552', backgroundColor: '#0b1220', padding: 14 },
    qrBoxLabel: { fontSize: 12, fontWeight: '800', color: '#8aa0c5', textTransform: 'uppercase' },
    qrBoxValue: { marginTop: 10, fontSize: 13, color: '#f8fafc', lineHeight: 18 },
    qrVisualWrap: { marginTop: 14, alignItems: 'center', justifyContent: 'center', borderRadius: 18, borderWidth: 1, borderColor: '#263552', backgroundColor: '#ffffff', padding: 16 },
    modalActions: { marginTop: 16, flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});