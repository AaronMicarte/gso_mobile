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
    Brand?: string | null;
    ModelNumber?: string | null;
    SerialNumber?: string | null;
}

function createClientUuid(): string {
    const timestamp = Date.now().toString(16);
    const randomA = Math.random().toString(16).slice(2, 10);
    const randomB = Math.random().toString(16).slice(2, 10);
    return `${timestamp}-${randomA}-${randomB}`;
}

function sanitizeClientUuid(u?: string | null): string | null {
    if (!u || typeof u !== 'string') return null;
    const trimmed = u.trim();
    if (!trimmed) return null;
    if (trimmed.length > 36) return null;
    return trimmed;
}

class ScanQueueService {
    private db: DatabaseConnection | null = null;
    private isInitialized = false;

    private async ensureInitialized(): Promise<void> {
        if (this.isInitialized && this.db) return;
        await this.init();
    }

    private async runWithDatabase<T>(operation: (db: DatabaseConnection) => Promise<T>): Promise<T> {
        await this.ensureInitialized();
        if (!this.db) throw new Error('Database not initialized');
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

    async isAlreadyScanned(
        cycleId: number,
        identifiers: {
            inventoryDetailId?: number | null;
            propertyId?: number | null;
            propertyNumber?: string | null;
        }
    ): Promise<boolean> {
        const { inventoryDetailId, propertyId, propertyNumber } = identifiers;
        if (!cycleId || cycleId <= 0) return false;

        const clauses: string[] = [];
        const params: Array<string | number> = [cycleId];

        if (inventoryDetailId && inventoryDetailId > 0) {
            clauses.push('inventory_detail_id = ?');
            params.push(inventoryDetailId);
        }
        if (propertyId && propertyId > 0) {
            clauses.push('property_id = ?');
            params.push(propertyId);
        }
        if (propertyNumber && propertyNumber.trim()) {
            clauses.push('property_number = ?');
            params.push(propertyNumber.trim());
        }

        if (clauses.length === 0) return false;

        const sql = `SELECT COUNT(*) as count FROM scan_queue WHERE cycle_id = ? AND (${clauses.join(' OR ')})`;
        const result = await this.runWithDatabase((db) =>
            db.getAllAsync<{ count: number }>(sql, params)
        );

        return Number(result?.[0]?.count ?? 0) > 0;
    }

    async retryAllFailedScans(cycleId?: number): Promise<void> {
        let query = `UPDATE scan_queue SET status = 'pending', error_message = NULL WHERE status = 'failed'`;
        const params: Array<string | number> = [];
        if (typeof cycleId === 'number' && cycleId > 0) {
            query += ` AND cycle_id = ?`;
            params.push(cycleId);
        }
        await this.runWithDatabase((db) => db.execAsync(query, params));
    }

    async init(): Promise<void> {
        if (this.isInitialized && this.db) return;

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
            { name: 'Brand', def: 'Brand TEXT' },
            { name: 'ModelNumber', def: 'ModelNumber TEXT' },
            { name: 'SerialNumber', def: 'SerialNumber TEXT' },
            { name: 'remote_scan_id', def: 'remote_scan_id INTEGER' },
        ];

        for (const col of needed) {
            if (!existing.has(col.name)) {
                try {
                    // eslint-disable-next-line @typescript-eslint/no-floating-promises
                    await this.db.execAsync(`ALTER TABLE scan_queue ADD COLUMN ${col.def}`);
                } catch (e) {
                    console.error(`Failed to add column ${col.name} to scan_queue:`, e);
                }
            }
        }

        await this.normalizeInvalidClientUuids();
    }

    private async normalizeInvalidClientUuids(): Promise<void> {
        if (!this.db) return;

        interface InvalidUuidRow {
            id: string;
            client_uuid: string | null;
        }

        const invalidRows = await this.db.getAllAsync<InvalidUuidRow>(
            `SELECT id, client_uuid
             FROM scan_queue
             WHERE client_uuid IS NULL OR TRIM(client_uuid) = '' OR LENGTH(client_uuid) > 36`
        );

        for (const row of invalidRows) {
            let nextUuid = createClientUuid();
            // eslint-disable-next-line no-constant-condition
            while (true) {
                const existing = await this.db.getAllAsync<{ count: number }>(
                    `SELECT COUNT(*) as count FROM scan_queue WHERE client_uuid = ? AND id != ?`,
                    [nextUuid, row.id]
                );
                const count = Number(existing?.[0]?.count ?? 0);
                if (count === 0) break;
                nextUuid = createClientUuid();
            }

            await this.db.execAsync(`UPDATE scan_queue SET client_uuid = ? WHERE id = ?`, [nextUuid, row.id]);
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
        let brand: string | null = null;
        let modelNumber: string | null = null;
        let serialNumber: string | null = null;
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
            brand = (maybeObj as any).Brand || null;
            modelNumber = (maybeObj as any).ModelNumber || null;
            serialNumber = (maybeObj as any).SerialNumber || null;
            propertyNumber = maybeObj.property_number || maybeObj.propertyNumber || null;
            unitOfMeasure = maybeObj.unit_of_measure || maybeObj.unitOfMeasure || null;
            unitValue = maybeObj.unit_value || maybeObj.unitValue || null;
            accountableOfficer = maybeObj.accountable_officer || maybeObj.accountableOfficer || null;
            conditionName = maybeObj.condition_name || maybeObj.conditionName || null;
            rpcType = maybeObj.rpc_type || maybeObj.rpcType || null;
            providedId =
                typeof maybeObj.id === 'string' && maybeObj.id.trim() ? maybeObj.id.trim() : null;
            providedClientUuid = sanitizeClientUuid(
                typeof maybeObj.client_uuid === 'string' && maybeObj.client_uuid.trim()
                    ? maybeObj.client_uuid
                    : typeof maybeObj.clientUuid === 'string' && maybeObj.clientUuid.trim()
                        ? maybeObj.clientUuid
                        : null
            );
        } else {
            cycleId = maybeObj as number;
            invId = inventoryDetailId || 0;
            condId = conditionId || 0;
            devId = deviceId || '';
            usrId = userId || 0;
            propId = propertyId || null;
            rem = remarks || null;
        }

        if (cycleId > 0) {
            if (invId > 0) {
                const existingScan = await this.getScanByCycleAndDetail(cycleId, invId);
                if (existingScan) return existingScan;
            } else if (propId && propId > 0) {
                const result = await this.runWithDatabase((db) =>
                    db.getAllAsync<LocalScan>(
                        `SELECT * FROM scan_queue WHERE cycle_id = ? AND property_id = ? ORDER BY created_at DESC LIMIT 1`,
                        [cycleId, propId]
                    )
                );
                if (result && result.length > 0) return result[0];
            } else if (propertyNumber && propertyNumber.trim()) {
                const result = await this.runWithDatabase((db) =>
                    db.getAllAsync<LocalScan>(
                        `SELECT * FROM scan_queue WHERE cycle_id = ? AND property_number = ? ORDER BY created_at DESC LIMIT 1`,
                        [cycleId, propertyNumber.trim()]
                    )
                );
                if (result && result.length > 0) return result[0];
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
            Brand: brand,
            ModelNumber: modelNumber,
            SerialNumber: serialNumber,
        };

        await this.runWithDatabase((db) =>
            db.execAsync(
                `INSERT INTO scan_queue (
        id, client_uuid, cycle_id, inventory_detail_id, property_id,
        condition_id, scanned_at, remarks, device_id, user_id, status, created_at,
                                article, description, property_number, unit_of_measure, unit_value,
                                accountable_officer, condition_name, rpc_type, Brand, ModelNumber, SerialNumber, remote_scan_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
                    scan.Brand ?? null,
                    scan.ModelNumber ?? null,
                    scan.SerialNumber ?? null,
                    null,
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

    async deleteScan(clientUuid: string, localOnly: boolean = false): Promise<void> {
        const rows = await this.runWithDatabase((db) =>
            db.getAllAsync(`SELECT * FROM scan_queue WHERE client_uuid = ? LIMIT 1`, [clientUuid])
        );

        const scan = (rows && rows.length > 0 ? (rows[0] as unknown as LocalScan) : null);

        if (scan && !localOnly) {
            if (scan.status === 'synced' || scan.status === 'syncing' || scan.remote_scan_id) {
                try {
                    if (scan.remote_scan_id) {
                        await ApiService.deleteRpcScan(scan.remote_scan_id);
                    } else {
                        let page = 1;
                        let lastPage = 1;

                        do {
                            const response = await ApiService.getRpcInventoryCycleScans(scan.cycle_id, {
                                page,
                                per_page: 100,
                            });

                            for (const remote of response.data) {
                                if (remote.inventory_detail_id === scan.inventory_detail_id) {
                                    try {
                                        await ApiService.deleteRpcScan(remote.id);
                                    } catch (err) {
                                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                        const status = (err as any)?.response?.status;
                                        if (status !== 404) {
                                            console.warn('[ScanQueueService] Failed to delete remote scan', remote.id, err);
                                        }
                                    }
                                    page = lastPage + 1;
                                    break;
                                }
                            }

                            lastPage = response.last_page || 1;
                            page += 1;
                        } while (page <= lastPage);
                    }
                } catch (err) {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const status = (err as any)?.response?.status;
                    if (status !== 404) {
                        console.warn('[ScanQueueService] Error while attempting remote delete:', err);
                    }
                }
            }
        }

        await this.runWithDatabase((db) => db.execAsync(`DELETE FROM scan_queue WHERE client_uuid = ?`, [clientUuid]));
    }

    async markSynced(clientUuid: string, remoteScanId?: number | null): Promise<void> {
        const params: Array<string | number | null> = [clientUuid];
        let query = `UPDATE scan_queue SET status = 'synced', error_message = NULL`;

        if (typeof remoteScanId === 'number') {
            query += `, remote_scan_id = ?`;
            params.unshift(remoteScanId);
        }

        query += ` WHERE client_uuid = ?`;

        await this.runWithDatabase((db) => db.execAsync(query, params));

        if (typeof remoteScanId === 'number' && remoteScanId > 0) {
            await this.refreshAssetDetails(clientUuid, remoteScanId);
        }
    }

    /**
     * Fetch the real asset details from the server and update the local row.
     * Fixes the "Property Item / Offline scan / Unknown (Offline)" placeholders
     * that were written when the scan was queued offline.
     */
    async refreshAssetDetails(clientUuid: string, remoteScanId: number): Promise<void> {
        try {
            const remote = await ApiService.getRpcInventoryScan(remoteScanId);
            await this.runWithDatabase((db) =>
                db.execAsync(
                    `UPDATE scan_queue SET
                        article = ?,
                        description = ?,
                        property_number = ?,
                        accountable_officer = ?,
                        unit_of_measure = ?,
                        unit_value = ?,
                        rpc_type = ?,
                        condition_name = ?
                     WHERE client_uuid = ?`,
                    [
                        remote.article ?? null,
                        remote.description ?? null,
                        remote.property_number ?? null,
                        remote.accountable_officer ?? null,
                        remote.unit_of_measure ?? null,
                        remote.unit_value ?? null,
                        remote.rpc_type ?? null,
                        remote.condition?.ConditionName ?? null,
                        clientUuid,
                    ]
                )
            );
        } catch (e) {
            console.warn('[ScanQueue] Refresh asset details failed:', e);
        }
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
        return 0;
    }

    async getQueueStats(cycleId?: number): Promise<QueueStats> {
        interface StatsRow {
            total: number;
            pending: number | null;
            synced: number | null;
            failed: number | null;
        }

        const hasCycleId = typeof cycleId === 'number' && cycleId > 0;
        const query = hasCycleId
            ? `SELECT
                COUNT(*) as total,
                SUM(CASE WHEN status IN ('pending', 'syncing') THEN 1 ELSE 0 END) as pending,
                SUM(CASE WHEN status = 'synced' THEN 1 ELSE 0 END) as synced,
                SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed
               FROM scan_queue WHERE cycle_id = ?`
            : `SELECT
                COUNT(*) as total,
                SUM(CASE WHEN status IN ('pending', 'syncing') THEN 1 ELSE 0 END) as pending,
                SUM(CASE WHEN status = 'synced' THEN 1 ELSE 0 END) as synced,
                SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed
               FROM scan_queue`;

        const params = hasCycleId ? [cycleId] : [];

        const stats = await this.runWithDatabase((db) =>
            db.getAllAsync<StatsRow>(query, params)
        );

        if (stats && stats.length > 0) {
            const pending = Number(stats[0].pending) || 0;
            const synced = Number(stats[0].synced) || 0;
            const failed = Number(stats[0].failed) || 0;
            const total = synced + pending + failed;
            return { total, pending, synced, failed };
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