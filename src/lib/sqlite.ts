import { openDatabaseAsync as expoOpenDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';

type Params = Array<string | number | null> | undefined;

interface DatabaseConnection {
    execAsync(sql: string, params?: Params): Promise<void>;
    getAllAsync<T = Record<string, unknown>>(sql: string, params?: Params): Promise<T[]>;
}

export async function openDatabaseAsync(name: string) {
    const db = (await expoOpenDatabaseAsync(name)) as SQLiteDatabase & DatabaseConnection;

    return {
        async execAsync(sql: string, params: Params = []) {
            if (params.length > 0) {
                await db.runAsync(sql, params);
                return;
            }
            await db.execAsync(sql);
        },
        getAllAsync<T = Record<string, unknown>>(sql: string, params: Params = []) {
            return db.getAllAsync<T>(sql, params);
        },
    };
}

export default {
    openDatabaseAsync,
};
