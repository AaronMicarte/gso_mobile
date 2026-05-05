type Row = Record<string, unknown>;

const tables = {
  scan_queue: [] as Row[],
};

function cloneRow(row: Row): Row {
  return JSON.parse(JSON.stringify(row));
}

function applyInsert(params: unknown[] = []): void {
  const [
    id,
    client_uuid,
    cycle_id,
    inventory_detail_id,
    property_id,
    condition_id,
    scanned_at,
    remarks,
    device_id,
    user_id,
    status,
    created_at,
  ] = params as [
    string,
    string,
    number,
    number,
    number | null,
    number,
    string,
    string | null,
    string,
    number,
    string,
    string,
  ];

  tables.scan_queue.push({
    id,
    client_uuid,
    cycle_id,
    inventory_detail_id,
    property_id,
    condition_id,
    scanned_at,
    remarks,
    device_id,
    user_id,
    status,
    error_message: null,
    attempt_count: 0,
    last_attempt_at: null,
    created_at,
  });
}

function applyUpdate(sql: string, params: unknown[] = []): void {
  const isClientUuidLookup = sql.includes('WHERE client_uuid = ?');
  const isIdLookup = sql.includes('WHERE id = ?');
  const target = String(params[params.length - 1] ?? '');

  const row = tables.scan_queue.find((item) => {
    if (isClientUuidLookup) return item.client_uuid === target;
    if (isIdLookup) return item.id === target;
    return false;
  });

  if (!row) return;

  if (sql.includes("status = 'synced'")) {
    row.status = 'synced';
    row.error_message = null;
    return;
  }

  if (sql.includes("status = 'failed'")) {
    row.status = 'failed';
    row.error_message = String(params[0] ?? null);
    row.last_attempt_at = String(params[1] ?? new Date().toISOString());
    return;
  }

  if (sql.includes('status = ?')) {
    row.status = params[0] as string;
    row.last_attempt_at = String(params[1] ?? new Date().toISOString());
    row.attempt_count = Number(row.attempt_count ?? 0) + 1;
    if (params.length > 3) {
      row.error_message = String(params[2] ?? null);
    }
  }
}

function applyDelete(params: unknown[] = []): void {
  const clientUuid = String(params[0] ?? '');
  tables.scan_queue = tables.scan_queue.filter((row) => row.client_uuid !== clientUuid);
}

function getRows(sql: string, params: unknown[] = []): Row[] {
  let rows = [...tables.scan_queue];

  if (sql.includes("WHERE status = 'pending' AND cycle_id = ?")) {
    const cycleId = Number(params[0]);
    const limit = Number(params[1] ?? rows.length);
    rows = rows.filter((row) => row.status === 'pending' && Number(row.cycle_id) === cycleId);
    rows.sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
    return rows.slice(0, limit).map(cloneRow);
  }

  if (sql.includes("WHERE status = 'pending'")) {
    const limit = Number(params[0] ?? rows.length);
    rows = rows.filter((row) => row.status === 'pending');
    rows.sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
    return rows.slice(0, limit).map(cloneRow);
  }

  if (sql.includes('WHERE cycle_id = ? ORDER BY created_at ASC')) {
    const cycleId = Number(params[0]);
    rows = rows.filter((row) => Number(row.cycle_id) === cycleId);
    rows.sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
    return rows.map(cloneRow);
  }

  if (sql.includes('WHERE cycle_id = ? ORDER BY created_at DESC')) {
    const cycleId = Number(params[0]);
    rows = rows.filter((row) => Number(row.cycle_id) === cycleId);
    rows.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
    return rows.map(cloneRow);
  }

  if (
    sql.includes('WHERE cycle_id = ? AND inventory_detail_id = ? ORDER BY created_at DESC LIMIT 1')
  ) {
    const cycleId = Number(params[0]);
    const inventoryDetailId = Number(params[1]);
    rows = rows.filter(
      (row) =>
        Number(row.cycle_id) === cycleId && Number(row.inventory_detail_id) === inventoryDetailId
    );
    rows.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
    return rows.slice(0, 1).map(cloneRow);
  }

  if (sql.includes('SELECT * FROM scan_queue ORDER BY created_at DESC')) {
    rows.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
    return rows.map(cloneRow);
  }

  if (sql.includes('SELECT * FROM scan_queue')) {
    return rows.map(cloneRow);
  }

  if (sql.includes('COUNT(*) as total')) {
    const source = sql.includes('WHERE cycle_id = ?')
      ? rows.filter((row) => Number(row.cycle_id) === Number(params[0]))
      : rows;

    const total = source.length;
    const pending = source.filter((row) => row.status === 'pending').length;
    const synced = source.filter((row) => row.status === 'synced').length;
    const failed = source.filter((row) => row.status === 'failed').length;

    return [{ total, pending, synced, failed }];
  }

  return [];
}

class MockDatabase {
  async runAsync(sql: string, params: unknown[] = []): Promise<void> {
    return this.execAsync(sql, params);
  }

  async execAsync(sql: string, params: unknown[] = []): Promise<void> {
    if (sql.includes('INSERT INTO scan_queue')) {
      applyInsert(params);
      return;
    }

    if (sql.includes('UPDATE scan_queue')) {
      applyUpdate(sql, params);
      return;
    }

    if (sql.includes('DELETE FROM scan_queue')) {
      applyDelete(params);
    }
  }

  async getAllAsync(sql: string, params: unknown[] = []): Promise<Row[]> {
    return getRows(sql, params);
  }
}

export async function openDatabaseAsync(): Promise<MockDatabase> {
  return new MockDatabase();
}

export default {
  openDatabaseAsync,
};
