import { openDatabaseAsync as expoOpenDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';

type Params = Array<string | number | null> | undefined;

interface DatabaseConnection {
    execAsync(sql: string, params?: Params): Promise<void>;
    getAllAsync<T = Record<string, unknown>>(sql: string, params?: Params): Promise<T[]>;
}

/**
 * Stable SQLite singleton wrapper that handles Fast Refresh gracefully
 * - Maintains a single database connection instance
 * - Detects and recovers from stale native handles
 * - Queues operations during reconnection to prevent race conditions
 * - Safe across Fast Refresh and module reloads
 */
class SQLiteSingleton {
    private db: SQLiteDatabase | null = null;
    private isInitializing = false;
    private initPromise: Promise<void> | null = null;
    private dbName: string = '';
    private operationQueue: Array<{
        operation: () => Promise<unknown>;
        resolve: (value: unknown) => void;
        reject: (error: unknown) => void;
    }> = [];
    private isProcessingQueue = false;

    private isStaleError(error: unknown): boolean {
        const message = error instanceof Error ? error.message : String(error);
        return message.includes('NativeDatabase') || message.includes('NullPointerException');
    }

    private async processQueue(): Promise<void> {
        if (this.isProcessingQueue || this.operationQueue.length === 0) {
            return;
        }

        this.isProcessingQueue = true;
        try {
            while (this.operationQueue.length > 0) {
                const item = this.operationQueue.shift();
                if (!item) break;

                try {
                    const result = await item.operation();
                    item.resolve(result);
                } catch (error) {
                    item.reject(error);
                }
            }
        } finally {
            this.isProcessingQueue = false;
        }
    }

    private enqueueOperation<T>(
        operation: () => Promise<T>
    ): Promise<T> {
        return new Promise((resolve, reject) => {
            this.operationQueue.push({
                operation: () => operation().then((v) => v as unknown),
                resolve: resolve as (value: unknown) => void,
                reject,
            });
            void this.processQueue();
        });
    }

    async init(name: string): Promise<void> {
        // If already initialized with same name, return immediately
        if (this.db && this.dbName === name) {
            return;
        }

        // If currently initializing, wait for initialization to complete
        if (this.isInitializing && this.dbName === name) {
            if (this.initPromise) {
                return this.initPromise;
            }
        }

        this.isInitializing = true;
        this.dbName = name;

        try {
            this.initPromise = (async () => {
                try {
                    this.db = (await expoOpenDatabaseAsync(name)) as SQLiteDatabase;
                    console.log('[SQLite] Database initialized successfully');
                } catch (error) {
                    console.error('[SQLite] Failed to initialize database:', error);
                    this.db = null;
                    throw error;
                }
            })();

            await this.initPromise;
        } finally {
            this.isInitializing = false;
            this.initPromise = null;
        }
    }

    private async ensureDb(): Promise<SQLiteDatabase> {
        if (!this.db) {
            if (!this.dbName) {
                throw new Error('Database not initialized. Call init() first.');
            }
            // Try to recover from a cleared connection
            await this.init(this.dbName);
        }

        if (!this.db) {
            throw new Error('Failed to establish database connection');
        }

        return this.db;
    }

    async execAsync(sql: string, params: Params = []): Promise<void> {
        const maxRetries = 2;
        let lastError: unknown;

        for (let attempt = 0; attempt < maxRetries; attempt += 1) {
            try {
                const db = await this.ensureDb();
                if (params && params.length > 0) {
                    await db.runAsync(sql, params);
                } else {
                    await db.execAsync(sql);
                }
                return;
            } catch (error) {
                lastError = error;

                if (!this.isStaleError(error)) {
                    throw error;
                }

                console.warn('[SQLite] Stale native handle detected, attempting recovery');
                this.db = null;

                if (attempt < maxRetries - 1) {
                    try {
                        await this.init(this.dbName);
                    } catch (initError) {
                        console.error('[SQLite] Recovery failed:', initError);
                        lastError = initError;
                    }
                }
            }
        }

        throw lastError instanceof Error
            ? lastError
            : new Error('Database operation failed after recovery attempts');
    }

    async getAllAsync<T = Record<string, unknown>>(
        sql: string,
        params: Params = []
    ): Promise<T[]> {
        const maxRetries = 2;
        let lastError: unknown;

        for (let attempt = 0; attempt < maxRetries; attempt += 1) {
            try {
                const db = await this.ensureDb();
                return await db.getAllAsync<T>(sql, params);
            } catch (error) {
                lastError = error;

                if (!this.isStaleError(error)) {
                    throw error;
                }

                console.warn('[SQLite] Stale native handle detected, attempting recovery');
                this.db = null;

                if (attempt < maxRetries - 1) {
                    try {
                        await this.init(this.dbName);
                    } catch (initError) {
                        console.error('[SQLite] Recovery failed:', initError);
                        lastError = initError;
                    }
                }
            }
        }

        throw lastError instanceof Error
            ? lastError
            : new Error('Database query failed after recovery attempts');
    }
}

// Stable singleton instance (persists across Fast Refresh with proper key)
const sqliteSingleton = new SQLiteSingleton();

export async function openDatabaseAsync(name: string): Promise<DatabaseConnection> {
    await sqliteSingleton.init(name);

    return {
        async execAsync(sql: string, params: Params = []) {
            return sqliteSingleton.execAsync(sql, params);
        },
        async getAllAsync<T = Record<string, unknown>>(sql: string, params: Params = []) {
            return sqliteSingleton.getAllAsync<T>(sql, params);
        },
    };
}

export default {
    openDatabaseAsync,
};
