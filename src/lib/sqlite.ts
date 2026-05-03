import { openDatabaseAsync as expoOpenDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';

type Params = Array<string | number | null> | undefined;

interface DatabaseConnection {
    execAsync(sql: string, params?: Params): Promise<void>;
    getAllAsync<T = Record<string, unknown>>(sql: string, params?: Params): Promise<T[]>;
}

export async function openDatabaseAsync(name: string) {
    let db = (await expoOpenDatabaseAsync(name)) as SQLiteDatabase & DatabaseConnection;

    const shouldReconnect = (error: unknown): boolean => {
        const message = error instanceof Error ? error.message : String(error);
        return message.includes('NativeDatabase.prepareAsync') || message.includes('NullPointerException');
    };

    const reconnect = async (): Promise<void> => {
        db = (await expoOpenDatabaseAsync(name)) as SQLiteDatabase & DatabaseConnection;
    };

    return {
        async execAsync(sql: string, params: Params = []) {
            try {
                if (params.length > 0) {
                    await db.runAsync(sql, params);
                    return;
                }
                await db.execAsync(sql);
            } catch (error) {
                if (!shouldReconnect(error)) {
                    throw error;
                }

                await reconnect();

                if (params.length > 0) {
                    await db.runAsync(sql, params);
                    return;
                }
                await db.execAsync(sql);
            }
        },
        async getAllAsync<T = Record<string, unknown>>(sql: string, params: Params = []) {
            try {
                return await db.getAllAsync<T>(sql, params);
            } catch (error) {
                if (!shouldReconnect(error)) {
                    throw error;
                }

                await reconnect();
                return db.getAllAsync<T>(sql, params);
            }
        },
    };
}

export default {
    openDatabaseAsync,
};
