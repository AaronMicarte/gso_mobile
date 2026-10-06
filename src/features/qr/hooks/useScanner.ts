import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';
import { Camera, BarcodeScanningResult } from 'expo-camera';
import { useFocusEffect } from '@react-navigation/native';
import * as Network from 'expo-network';
import ApiService from '../../shared/services/apiService';
import ScanQueueService from '../../inventory/services/scanQueueService';
import AuthService from '../../auth/services/authService';
import { Condition, PreviewScanResponse } from '../../../types';

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
    queueStats: { synced: number; failed: number; total: number; pending: number };
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

const DEFAULT_CONDITIONS: Condition[] = [
    { ConditionID: 1, ConditionName: 'Serviceable' },
    { ConditionID: 2, ConditionName: 'Unserviceable' },
];

interface ParsedQrInfo {
    propertyId: number | null;
    inventoryDetailId: number | null;
    propertyNumber: string | null;
    rawText: string;
}

function parseQrPayload(data: string): ParsedQrInfo {
    const trimmed = (data || '').trim();
    let propertyId: number | null = null;
    let inventoryDetailId: number | null = null;
    let propertyNumber: string | null = null;

    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
        try {
            const parsed = JSON.parse(trimmed);
            const pid = parsed.property_id ?? parsed.propertyId ?? parsed.PropertyID;
            if (pid) propertyId = Number(pid);
            const did = parsed.inventory_detail_id ?? parsed.inventoryDetailId ?? parsed.InventoryDetailID;
            if (did) inventoryDetailId = Number(did);
            const pnum = parsed.property_number ?? parsed.propertyNumber ?? parsed.PropertyNumber;
            if (pnum) propertyNumber = String(pnum);
        } catch {
            // Ignore JSON parse error
        }
    }

    if (!propertyId && !inventoryDetailId) {
        const scanMatch = trimmed.match(/\/qr\/scan\/(\d+)/i);
        if (scanMatch && scanMatch[1]) {
            propertyId = parseInt(scanMatch[1], 10);
        }

        const propParam = trimmed.match(/[?&](?:property_id|propertyId|PropertyID)=(\d+)/i);
        if (propParam && propParam[1]) {
            propertyId = parseInt(propParam[1], 10);
        }

        const detailParam = trimmed.match(/[?&](?:inventory_detail_id|inventoryDetailId|detail)=(\d+)/i);
        if (detailParam && detailParam[1]) {
            inventoryDetailId = parseInt(detailParam[1], 10);
        }

        const propNumParam = trimmed.match(/[?&](?:property_number|propertyNumber)=([^&]+)/i);
        if (propNumParam && propNumParam[1]) {
            try {
                propertyNumber = decodeURIComponent(propNumParam[1]);
            } catch {
                propertyNumber = propNumParam[1];
            }
        }
    }

    if (!propertyId && !inventoryDetailId && /^\d+$/.test(trimmed)) {
        propertyId = parseInt(trimmed, 10);
    }

    if (!propertyNumber) {
        if (propertyId) {
            propertyNumber = `ID #${propertyId}`;
        } else if (inventoryDetailId) {
            propertyNumber = `Detail #${inventoryDetailId}`;
        } else {
            propertyNumber = trimmed;
        }
    }

    return {
        propertyId: propertyId && !isNaN(propertyId) && propertyId > 0 ? propertyId : null,
        inventoryDetailId: inventoryDetailId && !isNaN(inventoryDetailId) && inventoryDetailId > 0 ? inventoryDetailId : null,
        propertyNumber,
        rawText: trimmed,
    };
}

export function useScanner(cycleId: number): UseScannerResult {
    const [hasPermission, setHasPermission] = useState<boolean | null>(null);
    const [scanned, setScanned] = useState(false);
    const [preview, setPreview] = useState<ScannerPreview | null>(null);
    const [conditions, setConditions] = useState<Condition[]>(DEFAULT_CONDITIONS);
    const [selectedCondition, setSelectedCondition] = useState<number | null>(DEFAULT_CONDITIONS[0].ConditionID);
    const [remarks, setRemarks] = useState('');
    const [selectedInventoryDetailIds, setSelectedInventoryDetailIds] = useState<number[]>([]);
    const [loading, setLoading] = useState(false);
    const [queueStats, setQueueStats] = useState({ synced: 0, failed: 0, total: 0, pending: 0 });

    const lastScanRef = useRef<{ value: string; at: number } | null>(null);
    const scanThrottleRef = useRef(0);
    const lastBlockedRef = useRef<{ key: string; at: number } | null>(null);

    const updateQueueStats = useCallback(async () => {
        try {
            const stats = await ScanQueueService.getQueueStats(cycleId);
            setQueueStats({
                total: stats.synced + stats.pending + stats.failed,
                synced: stats.synced,
                pending: stats.pending,
                failed: stats.failed,
            });
        } catch (error) {
            console.error('Failed to load queue stats:', error);
        }
    }, [cycleId]);

    const requestCameraPermission = useCallback(async (): Promise<void> => {
        const { status } = await Camera.requestCameraPermissionsAsync();
        setHasPermission(status === 'granted');
    }, []);

    const loadConditions = useCallback(async (): Promise<void> => {
        try {
            const conds = await ApiService.getConditions();
            if (conds && conds.length > 0) {
                setConditions(conds);
                setSelectedCondition((current) => current ?? conds[0]?.ConditionID ?? 1);
                return;
            }
        } catch (error) {
            console.warn('[useScanner] Offline or failed to load conditions online, using defaults:', error);
        }
        setConditions(DEFAULT_CONDITIONS);
        setSelectedCondition((current) => current ?? DEFAULT_CONDITIONS[0].ConditionID);
    }, []);

    // eslint-disable-next-line react-hooks/set-state-in-effect
    useEffect(() => {
        const initialLoad = setTimeout(() => {
            void requestCameraPermission();
            void loadConditions();
            void updateQueueStats();
        }, 0);

        return () => {
            clearTimeout(initialLoad);
        };
    }, [cycleId, loadConditions, requestCameraPermission, updateQueueStats]);

    useFocusEffect(
        useCallback(() => {
            void updateQueueStats();
        }, [updateQueueStats])
    );

    const refreshScanner = useCallback(async (): Promise<void> => {
        await ScanQueueService.reconcileSyncedScans(cycleId);
        await Promise.all([loadConditions(), updateQueueStats()]);
    }, [cycleId, loadConditions, updateQueueStats]);

    /**
     * Shared offline handler. Called when we already know the device is offline,
     * or when a network error is thrown from previewScan. Opens the modal immediately
     * with placeholder asset data, no network wait.
     */
    async function handleOfflineScan(qrData: string, currentCycleId: number, now: number): Promise<void> {
        const parsed = parseQrPayload(qrData);
        const isAlreadyInQueue = await ScanQueueService.isAlreadyScanned(currentCycleId, parsed);

        if (isAlreadyInQueue) {
            const key = String(parsed.propertyNumber);
            const lastBlocked = lastBlockedRef.current;
            if (!lastBlocked || lastBlocked.key !== key || now - lastBlocked.at > 3000) {
                lastBlockedRef.current = { key, at: now };
                Alert.alert(
                    'Already scanned',
                    `Property #${parsed.propertyNumber} has already been scanned in this cycle (queued locally).`
                );
            }
            setTimeout(() => setScanned(false), 800);
            setLoading(false);
            return;
        }

        const resolvedCondition = selectedCondition ?? conditions[0]?.ConditionID ?? 1;
        const offlineDetailId = parsed.inventoryDetailId ?? 0;
        const offlineAsset: any = {
            inventory_detail_id: offlineDetailId,
            property_id: parsed.propertyId,
            property_number: parsed.propertyNumber,
            article: 'Property Item',
            description: `Offline scan: ${parsed.propertyNumber}`,
            condition_id: resolvedCondition,
            unit_of_measure: 'unit',
            unit_value: 0,
            accountable_officer: 'Unknown (Offline)',
            rpc_type: 'RPCPPE',
        };

        const offlineCandidate = {
            inventory_detail_id: offlineDetailId,
            property_id: parsed.propertyId,
            property_number: parsed.propertyNumber,
            is_scanned: false,
            existing_scan_id: null,
        };

        setPreview({
            qr_value: qrData,
            cycle_id: currentCycleId,
            asset: offlineAsset,
            already_scanned: false,
            existing_scan_id: null,
            group_total_count: 1,
            group_scanned_count: 0,
            group_remaining_count: 1,
            candidates: [offlineCandidate],
        });
        setSelectedInventoryDetailIds([offlineDetailId]);
        setSelectedCondition(resolvedCondition);
        setLoading(false);
    }

    async function onBarcodeScanned(result: BarcodeScanningResult): Promise<void> {
        if (scanned || !cycleId) return;

        const now = Date.now();

        // Global throttle: max one decode every 700ms
        if (now - scanThrottleRef.current < 700) return;
        scanThrottleRef.current = now;

        // Same QR within 2s → drop BEFORE network call
        const last = lastScanRef.current;
        if (last && last.value === result.data && now - last.at < 2000) {
            return;
        }
        lastScanRef.current = { value: result.data, at: now };

        setScanned(true);
        setLoading(true);

        // FAST OFFLINE CHECK — skip the network entirely when offline so the modal
        // opens in ~1 second instead of waiting for the axios timeout.
        let isOffline = false;
        try {
            const net = await Network.getNetworkStateAsync();
            isOffline = !net.isConnected;
        } catch {
            // If the check fails, fall through and let axios try
        }

        if (isOffline) {
            await handleOfflineScan(result.data, cycleId, now);
            return;
        }
        // END FAST OFFLINE CHECK

        try {
            const response = await ApiService.previewScan(cycleId, result.data);

            const unscannedIds = response.candidates
                .filter((candidate) => !candidate.is_scanned)
                .map((candidate) => candidate.inventory_detail_id);

            if (unscannedIds.length === 0) {
                const first = response.candidates?.[0];
                const propertyLabel =
                    first?.property_number ??
                    response.asset?.property_number ??
                    first?.inventory_detail_id ??
                    '';

                const key = String(propertyLabel);
                const lastBlocked = lastBlockedRef.current;

                if (!lastBlocked || lastBlocked.key !== key || now - lastBlocked.at > 3000) {
                    lastBlockedRef.current = { key, at: now };
                    Alert.alert(
                        'Already scanned',
                        `Property #${propertyLabel} has already been scanned in this cycle.`
                    );
                }

                setTimeout(() => setScanned(false), 800);
                setLoading(false);
                return;
            }

            const defaultSelection = unscannedIds.includes(response.asset.inventory_detail_id)
                ? [response.asset.inventory_detail_id]
                : [unscannedIds[0]];

            setPreview({
                qr_value: result.data,
                cycle_id: cycleId,
                ...response,
            });
            setSelectedInventoryDetailIds(defaultSelection);
            const initialCond = response.asset?.condition_id ?? conditions[0]?.ConditionID ?? null;
            setSelectedCondition(initialCond);
        } catch (error) {
            console.error('Failed to preview scan:', error);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const err: any = error;
            const isNetworkError =
                !err?.response ||
                err?.code === 'ERR_NETWORK' ||
                err?.code === 'ECONNABORTED' ||
                (typeof err?.message === 'string' && err.message.toLowerCase().includes('network'));

            if (isNetworkError) {
                await handleOfflineScan(result.data, cycleId, now);
                return;
            }

            if (err && err.response) {
                const status = err.response.status;
                const message =
                    (err.response.data && err.response.data.message) ||
                    `Request failed with status code ${status}`;
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

        // FAST OFFLINE CHECK for manual too
        let isOffline = false;
        try {
            const net = await Network.getNetworkStateAsync();
            isOffline = !net.isConnected;
        } catch {
            /* ignore */
        }

        if (isOffline) {
            await handleOfflineScan(qrValue, cycleId, Date.now());
            return;
        }

        try {
            const response = await ApiService.previewScan(cycleId, qrValue, { property_number: qrValue });

            const unscannedIds = response.candidates
                .filter((candidate) => !candidate.is_scanned)
                .map((candidate) => candidate.inventory_detail_id);

            if (unscannedIds.length === 0) {
                const first = response.candidates?.[0];
                const propertyLabel =
                    first?.property_number ??
                    response.asset?.property_number ??
                    first?.inventory_detail_id ??
                    '';

                const key = String(propertyLabel);
                const now = Date.now();
                const lastBlocked = lastBlockedRef.current;

                if (!lastBlocked || lastBlocked.key !== key || now - lastBlocked.at > 3000) {
                    lastBlockedRef.current = { key, at: now };
                    Alert.alert(
                        'Already scanned',
                        `Property #${propertyLabel} has already been scanned in this cycle.`
                    );
                }

                setScanned(false);
                setLoading(false);
                return;
            }

            const defaultSelection = unscannedIds.includes(response.asset.inventory_detail_id)
                ? [response.asset.inventory_detail_id]
                : [unscannedIds[0]];

            setPreview({
                qr_value: qrValue,
                cycle_id: cycleId,
                ...response,
            });
            setSelectedInventoryDetailIds(defaultSelection);
            const initialCond = response.asset?.condition_id ?? conditions[0]?.ConditionID ?? null;
            setSelectedCondition(initialCond);
        } catch (error) {
            console.error('Failed to preview scan (manual):', error);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const err: any = error;
            const isNetworkError =
                !err?.response ||
                err?.code === 'ERR_NETWORK' ||
                err?.code === 'ECONNABORTED' ||
                (typeof err?.message === 'string' && err.message.toLowerCase().includes('network'));

            if (isNetworkError) {
                await handleOfflineScan(qrValue, cycleId, Date.now());
                return;
            }

            if (err && err.response) {
                const status = err.response.status;
                const message =
                    (err.response.data && err.response.data.message) ||
                    `Request failed with status code ${status}`;
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
        if (!preview || !selectedCondition) {
            throw new Error('Please select a condition and preview a property to scan');
        }

        const detailId = preview.asset?.inventory_detail_id ?? selectedInventoryDetailIds[0] ?? 0;
        const candidate = (preview.candidates ?? []).find((c) => c.inventory_detail_id === detailId) ?? null;
        const propertyNumber = candidate?.property_number ?? preview.asset?.property_number ?? null;
        const propertyId = candidate?.property_id ?? preview.asset?.property_id ?? null;

        if (!detailId && !propertyId && !propertyNumber) {
            throw new Error('No valid property selected for scanning');
        }

        setLoading(true);
        try {
            const deviceId = await AuthService.getOrCreateDeviceId();
            const user = await AuthService.getUser();

            const cycleToUse = toPreviewCycleId(preview, cycleId);
            const now = new Date().toISOString();

            await ScanQueueService.addScan({
                cycle_id: cycleToUse,
                inventory_detail_id: detailId,
                property_id: propertyId,
                property_number: propertyNumber,
                condition_id: selectedCondition,
                scanned_at: now,
                remarks: remarks.trim() || null,
                device_id: deviceId,
                user_id: user?.UserID ?? 0,
                article: preview.asset?.article ?? null,
                description: preview.asset?.description ?? null,
                unit_of_measure: preview.asset?.unit_of_measure ?? null,
                unit_value: preview.asset?.unit_value ?? null,
                accountable_officer: preview.asset?.accountable_officer ?? null,
                rpc_type: preview.asset?.rpc_type ?? null,
                Brand: (preview.asset as any)?.Brand ?? (preview.asset as any)?.BrandName ?? null,
                ModelNumber: (preview.asset as any)?.ModelNumber ?? null,
                SerialNumber: (preview.asset as any)?.SerialNumber ?? null,
            });

            await updateQueueStats();
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

    const handleSelectCondition = useCallback((conditionId: number | null) => {
        setSelectedCondition(conditionId);
        if (!conditionId || !preview || !cycleId) return;

        const detailId = preview.asset?.inventory_detail_id;
        const propId = preview.asset?.property_id ?? undefined;
        if (!detailId && !propId) return;

        void ApiService.updateAssetCondition(cycleId, {
            inventory_detail_id: detailId,
            property_id: propId,
            condition_id: conditionId,
        }).then(() => {
            setPreview((prev) => {
                if (!prev) return null;
                return {
                    ...prev,
                    asset: {
                        ...prev.asset,
                        condition_id: conditionId,
                    },
                };
            });
        }).catch((err: unknown) => {
            console.error('Failed to sync condition to inventory during preview:', err);
        });
    }, [cycleId, preview]);

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
        setSelectedCondition: handleSelectCondition,
        setRemarks,
        resetScan,
        confirmScan,
        refreshScanner,
        previewManual,
    };
}