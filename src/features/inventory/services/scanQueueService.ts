import { openDatabaseAsync } from '../../../lib/sqlite';
import ApiService from '../../shared/services/apiService';
import { LocalScan } from '../../../types';

const DB_NAME = 'gso_scan_queue.db';

interface DatabaseConnection {
    execAsync(sql: string, params?: Array<string | number | null>): Promise<void>;
    getAllAsync<T = Record<string, unknown>>(
        sql: string,
        params?: Array<string | number | null>
    ): Promise<T[]>;
}

interface QueueStats {
    total: number;
    pending: number;
    synced: number;
    failed: number;
}

interface ScanQueueColumnInfo {
    name?: unknown;
}

interface AddScanInput {
    cycle_id?: number;
    cycleId?: number;
    inventory_detail_id?: number;
    inventoryDetailId?: number;
    scanned_at?: string;
    scannedAt?: string;
    condition_id?: number;
    conditionId?: number;
    device_id?: string;
    deviceId?: string;
    user_id?: number;
    userId?: number;
    property_id?: number | null;
    propertyId?: number | null;
    remarks?: string | null;
    remark?: string | null;
    article?: string | null;
    description?: string | null;
    property_number?: string | null;
    propertyNumber?: string | null;
    unit_of_measure?: string | null;
    unitOfMeasure?: string | null;
    unit_value?: number | null;
    unitValue?: number | null;
    accountable_officer?: string | null;
    accountableOfficer?: string | null;
    condition_name?: string | null;
    conditionName?: string | null;
    rpc_type?: string | null;
    rpcType?: string | null;
    id?: string;
    client_uuid?: string;
    clientUuid?: string;
}

function createClientUuid(): string {
    const timestamp = Date.now().toString(16);
    const randomA = Math.random().toString(16).slice(2, 10);
    const randomB = Math.random().toString(16).slice(2, 10);
    return `${timestamp}-${randomA}-${randomB}`;
}

class ScanQueueService {
    private db: DatabaseConnection | null = null;
    private isInitialized = false;

    private async ensureInitialized(): Promise<void> {
        if (this.isInitialized && this.db) {
            return;
        }
        await this.init();
    }

    private async runWithDatabase<T>(operation: (db: DatabaseConnection) => Promise<T>): Promise<T> {
        await this.ensureInitialized();

        if (!this.db) {
            throw new Error('Database not initialized');
        }

        // SQLite wrapper now handles all stale handle recovery internally
        // No need for retry logic here
        return operation(this.db);
    }

    private async getScanByCycleAndDetail(
        cycleId: number,
        inventoryDetailId: number
    ): Promise<LocalScan | null> {
        const result = await this.runWithDatabase((db) =>
            db.getAllAsync<LocalScan>(
                `SELECT * FROM scan_queue WHERE cycle_id = ? AND inventory_detail_id = ? ORDER BY created_at DESC LIMIT 1`,
                [cycleId, inventoryDetailId]
            )
        );

        return result[0] ?? null;
    }

    async init(): Promise<void> {
        if (this.isInitialized && this.db) {
            return;
        }

        // open a runtime promisified sqlite client
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        this.db = await openDatabaseAsync(DB_NAME as string);
        await this.createTables();
        this.isInitialized = true;
    }

    async initializeDatabase(): Promise<void> {
        return this.init();
    }

    private async createTables(): Promise<void> {
        if (!this.db) return;

        // Ensure base table exists
        await this.db.execAsync(`
            CREATE TABLE IF NOT EXISTS scan_queue (
                id TEXT PRIMARY KEY,
                client_uuid TEXT UNIQUE NOT NULL,
                cycle_id INTEGER NOT NULL,
                inventory_detail_id INTEGER NOT NULL,
                property_id INTEGER,
                condition_id INTEGER NOT NULL,
                scanned_at TEXT NOT NULL,
                remarks TEXT,
                device_id TEXT NOT NULL,
                user_id INTEGER NOT NULL,
                status TEXT NOT NULL DEFAULT 'pending',
                error_message TEXT,
                attempt_count INTEGER DEFAULT 0,
                last_attempt_at TEXT,
                created_at TEXT NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_status ON scan_queue(status);
            CREATE INDEX IF NOT EXISTS idx_cycle_id ON scan_queue(cycle_id);
            CREATE INDEX IF NOT EXISTS idx_cycle_inventory_detail_id ON scan_queue(cycle_id, inventory_detail_id);
            CREATE INDEX IF NOT EXISTS idx_created_at ON scan_queue(created_at);
        `);

        // Migration: add any missing asset-detail columns to existing table
        // Query current columns
        const cols = await this.db.getAllAsync<ScanQueueColumnInfo>("PRAGMA table_info('scan_queue')");
        const existing = new Set<string>((cols || []).map((column) => String(column.name)));

        const needed: Array<{ name: string; def: string }> = [
            { name: 'article', def: 'article TEXT' },
            { name: 'description', def: 'description TEXT' },
            { name: 'property_number', def: 'property_number TEXT' },
            { name: 'unit_of_measure', def: 'unit_of_measure TEXT' },
            { name: 'unit_value', def: 'unit_value REAL' },
            { name: 'accountable_officer', def: 'accountable_officer TEXT' },
            { name: 'condition_name', def: 'condition_name TEXT' },
            { name: 'rpc_type', def: 'rpc_type TEXT' },
        ];

        for (const col of needed) {
            if (!existing.has(col.name)) {
                // ALTER TABLE to add the missing column
                try {
                    // eslint-disable-next-line @typescript-eslint/no-floating-promises
                    await this.db.execAsync(`ALTER TABLE scan_queue ADD COLUMN ${col.def}`);
                } catch (e) {
                    console.error(`Failed to add column ${col.name} to scan_queue:`, e);
                }
            }
        }
    }

    async addScan(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        maybeObj: AddScanInput | number,
        inventoryDetailId?: number,
        conditionId?: number,
        deviceId?: string,
        userId?: number,
        propertyId?: number,
        remarks?: string
    ): Promise<LocalScan> {
        let cycleId = 0;
        let invId = 0;
        let condId = 0;
        let devId = '';
        let usrId = 0;
        let propId: number | null = null;
        let rem: string | null = null;
        let article: string | null = null;
        let description: string | null = null;
        let propertyNumber: string | null = null;
        let unitOfMeasure: string | null = null;
        let unitValue: number | null = null;
        let accountableOfficer: string | null = null;
        let conditionName: string | null = null;
        let rpcType: string | null = null;
        let providedId: string | null = null;
        let providedClientUuid: string | null = null;

        if (typeof maybeObj === 'object' && maybeObj !== null && !Array.isArray(maybeObj)) {
            cycleId = maybeObj.cycle_id || maybeObj.cycleId || 0;
            invId = maybeObj.inventory_detail_id || maybeObj.inventoryDetailId || 0;
            condId = maybeObj.condition_id || maybeObj.conditionId || 0;
            devId = maybeObj.device_id || maybeObj.deviceId || '';
            usrId = maybeObj.user_id || maybeObj.userId || 0;
            propId = maybeObj.property_id || maybeObj.propertyId || null;
            rem = maybeObj.remarks || maybeObj.remark || null;
            article = maybeObj.article || null;
            description = maybeObj.description || null;
            propertyNumber = maybeObj.property_number || maybeObj.propertyNumber || null;
            unitOfMeasure = maybeObj.unit_of_measure || maybeObj.unitOfMeasure || null;
            unitValue = maybeObj.unit_value || maybeObj.unitValue || null;
            accountableOfficer = maybeObj.accountable_officer || maybeObj.accountableOfficer || null;
            conditionName = maybeObj.condition_name || maybeObj.conditionName || null;
            rpcType = maybeObj.rpc_type || maybeObj.rpcType || null;
            providedId =
                typeof maybeObj.id === 'string' && maybeObj.id.trim() ? maybeObj.id.trim() : null;
            providedClientUuid =
                typeof maybeObj.client_uuid === 'string' && maybeObj.client_uuid.trim()
                    ? maybeObj.client_uuid.trim()
                    : typeof maybeObj.clientUuid === 'string' && maybeObj.clientUuid.trim()
                        ? maybeObj.clientUuid.trim()
                        : null;
        } else {
            cycleId = maybeObj as number;
            invId = inventoryDetailId || 0;
            condId = conditionId || 0;
            devId = deviceId || '';
            usrId = userId || 0;
            propId = propertyId || null;
            rem = remarks || null;
        }

        if (cycleId > 0 && invId > 0) {
            const existingScan = await this.getScanByCycleAndDetail(cycleId, invId);
            if (existingScan) {
                return existingScan;
            }
        }

        const id = providedId ?? createClientUuid();
        const clientUuid = providedClientUuid ?? createClientUuid();
        const now = new Date().toISOString();

        const scan: LocalScan = {
            id,
            client_uuid: clientUuid,
            cycle_id: cycleId,
            inventory_detail_id: invId,
            property_id: propId,
            condition_id: condId,
            scanned_at: now,
            remarks: rem,
            device_id: devId,
            user_id: usrId,
            status: 'pending',
            error_message: null,
            attempt_count: 0,
            last_attempt_at: null,
            created_at: now,
            article,
            description,
            property_number: propertyNumber,
            unit_of_measure: unitOfMeasure,
            unit_value: unitValue,
            accountable_officer: accountableOfficer,
            condition_name: conditionName,
            rpc_type: rpcType as 'RPCPPE' | 'RPCSEP' | undefined,
        };

        await this.runWithDatabase((db) =>
            db.execAsync(
                `INSERT INTO scan_queue (
        id, client_uuid, cycle_id, inventory_detail_id, property_id,
        condition_id, scanned_at, remarks, device_id, user_id, status, created_at,
        article, description, property_number, unit_of_measure, unit_value,
        accountable_officer, condition_name, rpc_type
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    scan.id,
                    scan.client_uuid,
                    scan.cycle_id,
                    scan.inventory_detail_id,
                    scan.property_id,
                    scan.condition_id,
                    scan.scanned_at,
                    scan.remarks,
                    scan.device_id,
                    scan.user_id,
                    scan.status,
                    scan.created_at,
                    scan.article ?? null,
                    scan.description ?? null,
                    scan.property_number ?? null,
                    scan.unit_of_measure ?? null,
                    scan.unit_value ?? null,
                    scan.accountable_officer ?? null,
                    scan.condition_name ?? null,
                    scan.rpc_type ?? null,
                ]
            )
        );

        return scan;
    }

    async getPendingScans(limit: number = 50, cycleId?: number): Promise<LocalScan[]> {
        if (typeof cycleId === 'number') {
            const result = await this.runWithDatabase((db) =>
                db.getAllAsync(
                    `SELECT * FROM scan_queue WHERE status = 'pending' AND cycle_id = ? ORDER BY created_at ASC LIMIT ?`,
                    [cycleId, limit]
                )
            );
            return (result || []) as unknown as LocalScan[];
        }

        const result = await this.runWithDatabase((db) =>
            db.getAllAsync(
                `SELECT * FROM scan_queue WHERE status = 'pending' ORDER BY created_at ASC LIMIT ?`,
                [limit]
            )
        );

        return (result || []) as unknown as LocalScan[];
    }

    async updateScanStatus(
        clientUuid: string,
        status: 'pending' | 'syncing' | 'synced' | 'failed',
        errorMessage?: string
    ): Promise<void> {
        const now = new Date().toISOString();
        let query = `UPDATE scan_queue SET status = ?, last_attempt_at = ?, attempt_count = attempt_count + 1`;
        const params: Array<string | null | number> = [status, now];

        if (errorMessage) {
            query += `, error_message = ?`;
            params.push(errorMessage);
        }

        query += ` WHERE client_uuid = ?`;
        params.push(clientUuid);

        await this.runWithDatabase((db) => db.execAsync(query, params));
    }

    async deleteScan(clientUuid: string): Promise<void> {
        // First, fetch the local scan record so we can attempt to remove it from the backend if needed
        const rows = await this.runWithDatabase((db) =>
            db.getAllAsync(`SELECT * FROM scan_queue WHERE client_uuid = ? LIMIT 1`, [clientUuid])
        );

        const scan = (rows && rows.length > 0 ? (rows[0] as unknown as LocalScan) : null);

        if (scan) {
            // If the scan was already synced to the server, try to find and delete the corresponding remote record
            if (scan.status === 'synced' || scan.status === 'syncing') {
                try {
                    let page = 1;
                    let lastPage = 1;

                    do {
                        // Request remote scans for the cycle in pages and try to locate the record matching inventory_detail_id
                        const response = await ApiService.getRpcInventoryCycleScans(scan.cycle_id, {
                            page,
                            per_page: 100,
                        });

                        for (const remote of response.data) {
                            if (remote.inventory_detail_id === scan.inventory_detail_id) {
                                try {
                                    await ApiService.deleteRpcScan(remote.id);
                                } catch (err) {
                                    // Non-fatal: log and continue. We still remove local record to keep UI consistent.
                                    console.warn('[ScanQueueService] Failed to delete remote scan', remote.id, err);
                                }
                                // Found and attempted delete; break out
                                page = lastPage + 1;
                                break;
                            }
                        }

                        lastPage = response.last_page || 1;
                        page += 1;
                    } while (page <= lastPage);
                } catch (err) {
                    console.warn('[ScanQueueService] Error while attempting remote delete:', err);
                }
            }
        }

        // Always remove the local record
        await this.runWithDatabase((db) => db.execAsync(`DELETE FROM scan_queue WHERE client_uuid = ?`, [clientUuid]));
    }

    async markSynced(clientUuid: string): Promise<void> {
        await this.runWithDatabase((db) =>
            db.execAsync(
                `UPDATE scan_queue SET status = 'synced', error_message = NULL WHERE client_uuid = ?`,
                [clientUuid]
            )
        );
    }

    async markFailed(clientUuid: string, errorMessage: string): Promise<void> {
        const now = new Date().toISOString();
        await this.runWithDatabase((db) =>
            db.execAsync(
                `UPDATE scan_queue SET status = 'failed', error_message = ?, last_attempt_at = ? WHERE client_uuid = ?`,
                [errorMessage, now, clientUuid]
            )
        );
    }

    async reconcileSyncedScans(cycleId: number): Promise<number> {
        try {
            const remoteDetailIds = await this.fetchRemoteInventoryDetailIds(cycleId);
            const syncedScans = await this.getAllScans(cycleId);
            let removed = 0;

            const syncedOnly = syncedScans.filter((s) => s.status === 'synced');

            // Delete stale synced scans and collect them
            const toDelete = [];
            for (const scan of syncedOnly) {
                const isRemote = remoteDetailIds.has(scan.inventory_detail_id);

                if (!isRemote) {
                    toDelete.push(scan.client_uuid);
                }
            }

            // Execute all deletes in parallel, with a tiny delay to ensure DB flush
            if (toDelete.length > 0) {
                await Promise.all(toDelete.map((uuid) => this.deleteScan(uuid)));
                // Small delay to ensure SQLite writes are persisted
                await new Promise((r) => setTimeout(r, 50));
                removed = toDelete.length;
            }

            return removed;
        } catch (error) {
            console.error('[Reconcile] Error during reconciliation:', error);
            return 0;
        }
    }

    private async fetchRemoteInventoryDetailIds(cycleId: number): Promise<Set<number>> {
        const inventoryDetailIds = new Set<number>();
        let page = 1;
        let lastPage = 1;

        do {
            const response = await ApiService.getRpcInventoryCycleScans(cycleId, {
                page,
                per_page: 100,
            });

            for (const scan of response.data) {
                inventoryDetailIds.add(scan.inventory_detail_id);
            }

            lastPage = response.last_page || 1;
            page += 1;
        } while (page <= lastPage);

        return inventoryDetailIds;
    }

    async getQueueStats(cycleId?: number): Promise<QueueStats> {
        interface StatsRow {
            total: number;
            pending: number | null;
            synced: number | null;
            failed: number | null;
        }

        if (typeof cycleId === 'number') {
            const stats = await this.runWithDatabase((db) =>
                db.getAllAsync<StatsRow>(
                    `SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN status = 'synced' THEN 1 ELSE 0 END) as synced,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed
      FROM scan_queue WHERE cycle_id = ?`,
                    [cycleId]
                )
            );
            if (stats && stats.length > 0) {
                return {
                    total: stats[0].total || 0,
                    pending: stats[0].pending || 0,
                    synced: stats[0].synced || 0,
                    failed: stats[0].failed || 0,
                };
            }
        } else {
            const stats = await this.runWithDatabase((db) =>
                db.getAllAsync<StatsRow>(
                    `SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN status = 'synced' THEN 1 ELSE 0 END) as synced,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed
      FROM scan_queue`,
                    []
                )
            );

            if (stats && stats.length > 0) {
                return {
                    total: stats[0].total || 0,
                    pending: stats[0].pending || 0,
                    synced: stats[0].synced || 0,
                    failed: stats[0].failed || 0,
                };
            }
        }

        return { total: 0, pending: 0, synced: 0, failed: 0 };
    }

    async clearOldScans(cycleId: number, daysOld: number = 30): Promise<void> {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - daysOld);

        await this.runWithDatabase((db) =>
            db.execAsync(
                `DELETE FROM scan_queue WHERE cycle_id = ? AND status = 'synced' AND created_at < ?`,
                [cycleId, cutoffDate.toISOString()]
            )
        );
    }

    async getAllScans(cycleId?: number): Promise<LocalScan[]> {
        if (typeof cycleId === 'number') {
            const result = await this.runWithDatabase((db) =>
                db.getAllAsync(`SELECT * FROM scan_queue WHERE cycle_id = ? ORDER BY created_at DESC`, [
                    cycleId,
                ])
            );
            return (result || []) as unknown as LocalScan[];
        }

        const result = await this.runWithDatabase((db) =>
            db.getAllAsync(`SELECT * FROM scan_queue ORDER BY created_at DESC`, [])
        );

        return (result || []) as unknown as LocalScan[];
    }
}

export default new ScanQueueService();
