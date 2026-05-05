import axios from 'axios';
import { BulkScanPayload, LocalScan } from '../../../types';
import ApiService from '../../shared/services/apiService';
import ScanQueueService from './scanQueueService';
import AuthService from '../../auth/services/authService';

const DEFAULT_SYNC_INTERVAL_MS = 30000;
const DEFAULT_MAX_RETRY_ATTEMPTS = 5;
const RETRY_DELAY_MS = 2000;

interface BulkStoreScanResult {
  status?: 'created' | 'duplicate' | 'error' | string;
  client_uuid: string;
  message?: string;
}

interface BulkStoreScanResponse {
  results?: BulkStoreScanResult[];
}

function resolveSyncIntervalMs(): number {
  const configuredInterval = Number(process.env.EXPO_PUBLIC_SYNC_INTERVAL_MS);
  return Number.isFinite(configuredInterval) && configuredInterval > 0
    ? configuredInterval
    : DEFAULT_SYNC_INTERVAL_MS;
}

function resolveMaxRetryAttempts(): number {
  const configuredAttempts = Number(process.env.EXPO_PUBLIC_MAX_RETRY_ATTEMPTS);
  return Number.isFinite(configuredAttempts) && configuredAttempts >= 0
    ? configuredAttempts
    : DEFAULT_MAX_RETRY_ATTEMPTS;
}

class SyncService {
  private isSyncing = false;
  private syncInterval: NodeJS.Timeout | null = null;
  private lastSyncReport: {
    synced: number;
    failed: number;
    total: number;
    failures: Array<{ client_uuid: string; message: string }>;
  } | null = null;

  private normalizeScannedAt(scannedAt: string): string {
    const parsed = new Date(scannedAt);
    if (Number.isNaN(parsed.getTime())) {
      return scannedAt;
    }

    return parsed.toISOString().replace(/\.\d{3}Z$/, 'Z');
  }

  async start(): Promise<void> {
    if (this.syncInterval) return;
    const syncIntervalMs = resolveSyncIntervalMs();
    this.syncInterval = setInterval(() => {
      this.syncPendingScans().catch((e) => console.error('Sync error', e));
    }, syncIntervalMs);
    await this.syncPendingScans();
  }

  stop(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
  }

  async syncPendingScans(): Promise<{
    synced: number;
    failed: number;
    total: number;
    failures: Array<{ client_uuid: string; message: string }>;
  }> {
    if (this.isSyncing) return { synced: 0, failed: 0, total: 0, failures: [] };
    this.isSyncing = true;
    let totalSynced = 0;
    let totalFailed = 0;
    const failures: Array<{ client_uuid: string; message: string }> = [];
    try {
      const user = await AuthService.getUser();
      if (!user) return { synced: 0, failed: 0, total: 0, failures: [] };

      const pending = await ScanQueueService.getPendingScans(100);
      const cycles = new Map<number, LocalScan[]>();
      pending.forEach((s) => {
        if (!cycles.has(s.cycle_id)) cycles.set(s.cycle_id, []);
        cycles.get(s.cycle_id)!.push(s);
      });

      for (const [cycleId, scans] of cycles) {
        const result = await this.syncCycleScans(cycleId, scans);
        totalSynced += result.synced;
        totalFailed += result.failed;
        if (result.failures && result.failures.length) failures.push(...result.failures);
      }
      const report = { synced: totalSynced, failed: totalFailed, total: pending.length, failures };
      this.lastSyncReport = report;
      return report;
    } catch (error) {
      console.error('Sync error', error);
      const report = {
        synced: totalSynced,
        failed: totalFailed,
        total: 0,
        failures: [{ client_uuid: 'unknown', message: String(error) }],
      };
      this.lastSyncReport = report;
      return report;
    } finally {
      this.isSyncing = false;
    }
  }

  private async syncCycleScans(
    cycleId: number,
    scans: LocalScan[]
  ): Promise<{
    synced: number;
    failed: number;
    failures: Array<{ client_uuid: string; message: string }>;
  }> {
    if (!scans.length) return { synced: 0, failed: 0, failures: [] };
    let synced = 0;
    let failed = 0;
    const failures: Array<{ client_uuid: string; message: string }> = [];
    const payload: BulkScanPayload = {
      scans: scans.map((scan) => ({
        client_uuid: scan.client_uuid,
        inventory_detail_id: scan.inventory_detail_id,
        property_id: scan.property_id,
        condition_id: scan.condition_id,
        scanned_at: this.normalizeScannedAt(scan.scanned_at),
        remarks: scan.remarks,
        device_id: scan.device_id,
      })),
    };

    try {
      const res = await this.retryRequest(() => ApiService.bulkStoreScan(cycleId, payload));
      const response = res as BulkStoreScanResponse;
      if (response && Array.isArray(response.results)) {
        for (const r of response.results) {
          if (r.status === 'created') {
            await ScanQueueService.markSynced(r.client_uuid);
            synced += 1;
          } else if (r.status === 'duplicate') {
            await ScanQueueService.deleteScan(r.client_uuid);
            synced += 1;
          } else if (r.status === 'error') {
            const msg = r.message || 'Server reported error';
            await ScanQueueService.markFailed(r.client_uuid, msg);
            failed += 1;
            failures.push({ client_uuid: r.client_uuid, message: msg });
          }
        }
      } else {
        const msg = `Unexpected bulkStoreScan response: ${JSON.stringify(res)}`;
        console.error(msg);
        for (const s of scans) {
          await ScanQueueService.markFailed(s.client_uuid, msg);
          failed += 1;
          failures.push({ client_uuid: s.client_uuid, message: msg });
        }
      }
    } catch (error) {
      const status = axios.isAxiosError(error) ? error.response?.status : undefined;
      const details = axios.isAxiosError(error) ? error.response?.data : undefined;
      const msg =
        error instanceof Error
          ? `${error.message}${status ? ` (HTTP ${status})` : ''}${details ? `: ${JSON.stringify(details)}` : ''
          }`
          : 'Unknown';

      for (const s of scans) {
        await ScanQueueService.markFailed(s.client_uuid, msg);
        failed += 1;
        failures.push({ client_uuid: s.client_uuid, message: msg });
      }
    }
    return { synced, failed, failures };
  }

  private async retryRequest<T>(fn: () => Promise<T>, attempt = 0): Promise<T> {
    try {
      return await fn();
    } catch (err) {
      const retryable = !axios.isAxiosError(err) || !err.response || err.response.status >= 500;
      const maxRetryAttempts = resolveMaxRetryAttempts();
      if (retryable && attempt < maxRetryAttempts) {
        const delay = RETRY_DELAY_MS * Math.pow(2, attempt);
        await new Promise((r) => setTimeout(r, delay));
        return this.retryRequest(fn, attempt + 1);
      }
      throw err;
    }
  }

  async manualSync(): Promise<{
    synced: number;
    failed: number;
    total: number;
    failures: Array<{ client_uuid: string; message: string }>;
  }> {
    return this.syncPendingScans();
  }

  getLastSyncReport() {
    return this.lastSyncReport;
  }
}

export default new SyncService();
