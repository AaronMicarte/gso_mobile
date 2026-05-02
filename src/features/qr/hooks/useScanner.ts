import { useCallback, useEffect, useState } from 'react';
import { Alert } from 'react-native';
import { Camera, BarcodeScanningResult } from 'expo-camera';
import { useFocusEffect } from '@react-navigation/native';
import ApiService from '../../shared/services/apiService';
import ScanQueueService from '../../inventory/services/scanQueueService';
import AuthService from '../../auth/services/authService';
import { BulkScanPayload, Condition, PreviewScanResponse } from '../../../types';

interface ScannerPreview extends PreviewScanResponse {
    qr_value: string;
    cycle_id: number;
}

interface UseScannerResult {
    hasPermission: boolean | null;
    scanned: boolean;
    loading: boolean;
    preview: ScannerPreview | null;
    conditions: Condition[];
    queueStats: { synced: number; failed: number; total: number };
    selectedCondition: number | null;
    remarks: string;
    requestCameraPermission: () => Promise<void>;
    onBarcodeScanned: (result: BarcodeScanningResult) => Promise<void>;
    previewManual: (qrValue: string) => Promise<void>;
    selectedInventoryDetailIds: number[];
    setSelectedInventoryDetailIds: (ids: number[]) => void;
    setSelectedCondition: (conditionId: number | null) => void;
    setRemarks: (remarks: string) => void;
    resetScan: () => void;
    confirmScan: () => Promise<void>;
    refreshScanner: () => Promise<void>;
}

function toPreviewCycleId(preview: ScannerPreview | null, cycleId: number): number {
    return preview?.cycle_id ?? cycleId;
}

export function useScanner(cycleId: number): UseScannerResult {
    const [hasPermission, setHasPermission] = useState<boolean | null>(null);
    const [scanned, setScanned] = useState(false);
    const [preview, setPreview] = useState<ScannerPreview | null>(null);
    const [conditions, setConditions] = useState<Condition[]>([]);
    const [selectedCondition, setSelectedCondition] = useState<number | null>(null);
    const [remarks, setRemarks] = useState('');
    const [selectedInventoryDetailIds, setSelectedInventoryDetailIds] = useState<number[]>([]);
    const [loading, setLoading] = useState(false);
    const [queueStats, setQueueStats] = useState({ synced: 0, failed: 0, total: 0 });

    const updateQueueStats = useCallback(async () => {
        try {
            if (cycleId) {
                await ScanQueueService.reconcileSyncedScans(cycleId);
            }
            const stats = await ScanQueueService.getQueueStats(cycleId);
            setQueueStats(stats);
        } catch (error) {
            console.error('Failed to load queue stats:', error);
        }
    }, [cycleId]);

    // eslint-disable-next-line react-hooks/set-state-in-effect
    useEffect(() => {
        void requestCameraPermission();
        void loadConditions();
        // eslint-disable-next-line react-hooks/set-state-in-effect
        void updateQueueStats();
    }, [cycleId, updateQueueStats]);

    useFocusEffect(
        useCallback(() => {
            void updateQueueStats();
        }, [updateQueueStats])
    );

    async function requestCameraPermission(): Promise<void> {
        const { status } = await Camera.requestCameraPermissionsAsync();
        setHasPermission(status === 'granted');
    }

    async function loadConditions(): Promise<void> {
        try {
            const conds = await ApiService.getConditions();
            setConditions(conds);
            setSelectedCondition((current) => current ?? conds[0]?.ConditionID ?? null);
        } catch (error) {
            console.error('Failed to load conditions:', error);
        }
    }

    const refreshScanner = useCallback(async (): Promise<void> => {
        await Promise.all([loadConditions(), updateQueueStats()]);
    }, [loadConditions, updateQueueStats]);

    async function onBarcodeScanned(result: BarcodeScanningResult): Promise<void> {
        if (scanned || !cycleId) return;

        setScanned(true);
        setLoading(true);

        try {
            console.debug('[useScanner] previewScan request', { cycleId, qr_value: result.data });
            const response = await ApiService.previewScan(cycleId, result.data);
            const unscannedIds = response.candidates.filter((candidate) => !candidate.is_scanned).map((candidate) => candidate.inventory_detail_id);
            const defaultSelection = unscannedIds.includes(response.asset.inventory_detail_id)
                ? [response.asset.inventory_detail_id]
                : (unscannedIds[0] ? [unscannedIds[0]] : []);

            setPreview({
                qr_value: result.data,
                cycle_id: cycleId,
                ...response,
            });
            setSelectedInventoryDetailIds(defaultSelection);
            setSelectedCondition((current) => current ?? conditions[0]?.ConditionID ?? null);
        } catch (error) {
            // Surface backend response when available so user sees why preview failed
            console.error('Failed to preview scan:', error);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const err: any = error;
            if (err && err.response) {
                const status = err.response.status;
                const message = (err.response.data && err.response.data.message) || `Request failed with status code ${status}`;
                Alert.alert('Preview failed', message);
            } else if (err && err.message) {
                Alert.alert('Preview failed', err.message);
            } else {
                Alert.alert('Preview failed', 'Unable to preview scan. Check network or server.');
            }
            setScanned(false);
        } finally {
            setLoading(false);
        }
    }

    async function previewManual(qrValue: string): Promise<void> {
        if (scanned || !cycleId) return;

        setScanned(true);
        setLoading(true);

        try {
            console.debug('[useScanner] previewScan (manual) request', { cycleId, qr_value: qrValue });
            const response = await ApiService.previewScan(cycleId, qrValue, { property_number: qrValue });
            const unscannedIds = response.candidates.filter((candidate) => !candidate.is_scanned).map((candidate) => candidate.inventory_detail_id);
            const defaultSelection = unscannedIds.includes(response.asset.inventory_detail_id)
                ? [response.asset.inventory_detail_id]
                : (unscannedIds[0] ? [unscannedIds[0]] : []);

            setPreview({
                qr_value: qrValue,
                cycle_id: cycleId,
                ...response,
            });
            setSelectedInventoryDetailIds(defaultSelection);
            setSelectedCondition((current) => current ?? conditions[0]?.ConditionID ?? null);
        } catch (error) {
            console.error('Failed to preview scan (manual):', error);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const err: any = error;
            if (err && err.response) {
                const status = err.response.status;
                const message = (err.response.data && err.response.data.message) || `Request failed with status code ${status}`;
                Alert.alert('Preview failed', message);
            } else if (err && err.message) {
                Alert.alert('Preview failed', err.message);
            } else {
                Alert.alert('Preview failed', 'Unable to preview scan. Check network or server.');
            }
            setScanned(false);
        } finally {
            setLoading(false);
        }
    }

    async function confirmScan(): Promise<void> {
        if (!preview || !selectedCondition || selectedInventoryDetailIds.length === 0) {
            throw new Error('Please select a condition and at least one property to scan');
        }

        setLoading(true);
        try {
            const deviceId = await AuthService.getOrCreateDeviceId();
            const user = await AuthService.getUser();

            // For offline queue, create one LocalScan row per selected inventory_detail_id
            const cycleToUse = toPreviewCycleId(preview, cycleId);
            const now = new Date().toISOString();

            for (const detailId of selectedInventoryDetailIds) {
                const clientUuid = `${preview.qr_value}-${detailId}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
                await ScanQueueService.addScan({
                    cycle_id: cycleToUse,
                    inventory_detail_id: detailId,
                    property_id: preview.asset?.property_id ?? null,
                    condition_id: selectedCondition,
                    scanned_at: now,
                    remarks: remarks.trim() || null,
                    device_id: deviceId,
                    user_id: user?.UserID ?? 0,
                    client_uuid: clientUuid,
                    // Asset details
                    article: preview.asset?.article ?? null,
                    description: preview.asset?.description ?? null,
                    property_number: preview.asset?.property_number ?? null,
                    unit_of_measure: preview.asset?.unit_of_measure ?? null,
                    unit_value: preview.asset?.unit_value ?? null,
                    accountable_officer: preview.asset?.accountable_officer ?? null,
                    rpc_type: preview.asset?.rpc_type ?? null,
                });
            }

            await updateQueueStats();
            // clear selection and reset
            setSelectedInventoryDetailIds([]);
            resetScan();
        } finally {
            setLoading(false);
        }
    }

    function resetScan(): void {
        setScanned(false);
        setPreview(null);
        setSelectedCondition(null);
        setRemarks('');
        setSelectedInventoryDetailIds([]);
    }

    return {
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
        requestCameraPermission,
        onBarcodeScanned,
        setSelectedCondition,
        setRemarks,
        resetScan,
        confirmScan,
        refreshScanner,
        previewManual,
    };
}
