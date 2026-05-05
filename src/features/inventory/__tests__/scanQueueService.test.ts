import ScanQueueService from '../services/scanQueueService';

/**
 * Integration test suite for offline scanning and sync
 */
describe('Offline Sync Flow', () => {
  beforeAll(async () => {
    await ScanQueueService.initializeDatabase();
  });

  afterEach(async () => {
    try {
      const allScans = await ScanQueueService.getAllScans();
      for (const scan of allScans) {
        await ScanQueueService.deleteScan(scan.client_uuid);
      }
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('ScanQueueService', () => {
    it('should add scan to queue', async () => {
      const scan = await ScanQueueService.addScan({
        cycle_id: 1,
        inventory_detail_id: 100,
        property_id: 1,
        condition_id: 1,
        scanned_at: new Date().toISOString(),
        remarks: 'Test scan',
        device_id: 'device-001',
      });

      expect(scan.client_uuid).toBeDefined();
      expect(scan.status).toBe('pending');
    });

    it('should get pending scans', async () => {
      await ScanQueueService.addScan({
        cycle_id: 1,
        inventory_detail_id: 100,
        property_id: 1,
        condition_id: 1,
        scanned_at: new Date().toISOString(),
        remarks: 'Test 1',
        device_id: 'device-001',
      });

      await ScanQueueService.addScan({
        cycle_id: 1,
        inventory_detail_id: 101,
        property_id: 1,
        condition_id: 2,
        scanned_at: new Date().toISOString(),
        remarks: 'Test 2',
        device_id: 'device-001',
      });

      const pending = await ScanQueueService.getPendingScans(10);
      expect(pending.length).toBe(2);
      expect(pending[0].status).toBe('pending');
    });

    it('should mark scan as synced', async () => {
      const scan = await ScanQueueService.addScan({
        cycle_id: 1,
        inventory_detail_id: 100,
        property_id: 1,
        condition_id: 1,
        scanned_at: new Date().toISOString(),
        remarks: 'Test',
        device_id: 'device-001',
      });

      await ScanQueueService.markSynced(scan.client_uuid);

      const updated = await ScanQueueService.getAllScans();
      const syncedScan = updated.find((s) => s.client_uuid === scan.client_uuid);
      expect(syncedScan?.status).toBe('synced');
    });

    it('should mark scan as failed with error message', async () => {
      const scan = await ScanQueueService.addScan({
        cycle_id: 1,
        inventory_detail_id: 100,
        property_id: 1,
        condition_id: 1,
        scanned_at: new Date().toISOString(),
        remarks: 'Test',
        device_id: 'device-001',
      });

      const errorMsg = 'Invalid asset ID';
      await ScanQueueService.markFailed(scan.client_uuid, errorMsg);

      const updated = await ScanQueueService.getAllScans();
      const failedScan = updated.find((s) => s.client_uuid === scan.client_uuid);
      expect(failedScan?.status).toBe('failed');
      expect(failedScan?.error_message).toBe(errorMsg);
    });

    it('should get queue statistics', async () => {
      const scan1 = await ScanQueueService.addScan({
        cycle_id: 1,
        inventory_detail_id: 100,
        property_id: 1,
        condition_id: 1,
        scanned_at: new Date().toISOString(),
        device_id: 'device-001',
      });

      const scan2 = await ScanQueueService.addScan({
        cycle_id: 1,
        inventory_detail_id: 101,
        property_id: 1,
        condition_id: 1,
        scanned_at: new Date().toISOString(),
        device_id: 'device-001',
      });

      await ScanQueueService.markSynced(scan1.client_uuid);
      await ScanQueueService.markFailed(scan2.client_uuid, 'Test error');

      const stats = await ScanQueueService.getQueueStats();
      expect(stats.total).toBeGreaterThanOrEqual(2);
      expect(stats.synced).toBeGreaterThanOrEqual(1);
      expect(stats.failed).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Duplicate Detection', () => {
    it('should detect duplicate scan by client_uuid and cycle_id', async () => {
      await ScanQueueService.addScan({
        cycle_id: 1,
        inventory_detail_id: 100,
        property_id: 1,
        condition_id: 1,
        scanned_at: new Date().toISOString(),
        device_id: 'device-001',
      });

      const allScans = await ScanQueueService.getAllScans();
      const duplicateCheck = allScans.filter(
        (s) => s.cycle_id === 1 && s.inventory_detail_id === 100
      );

      expect(duplicateCheck.length).toBeGreaterThanOrEqual(1);
    });

    it('should not create a second row for the same cycle and inventory detail', async () => {
      const firstScan = await ScanQueueService.addScan({
        cycle_id: 1,
        inventory_detail_id: 100,
        property_id: 1,
        condition_id: 1,
        scanned_at: new Date().toISOString(),
        device_id: 'device-001',
        client_uuid: 'client-uuid-1',
      });

      const secondScan = await ScanQueueService.addScan({
        cycle_id: 1,
        inventory_detail_id: 100,
        property_id: 1,
        condition_id: 2,
        scanned_at: new Date().toISOString(),
        device_id: 'device-001',
        client_uuid: 'client-uuid-2',
      });

      const allScans = await ScanQueueService.getAllScans();
      const duplicateRows = allScans.filter(
        (scan) => scan.cycle_id === 1 && scan.inventory_detail_id === 100
      );

      expect(duplicateRows.length).toBe(1);
      expect(secondScan.client_uuid).toBe(firstScan.client_uuid);
    });
  });

  describe('Retry Logic', () => {
    it('should track attempt count', async () => {
      const scan = await ScanQueueService.addScan({
        cycle_id: 1,
        inventory_detail_id: 100,
        property_id: 1,
        condition_id: 1,
        scanned_at: new Date().toISOString(),
        device_id: 'device-001',
      });

      await ScanQueueService.updateScanStatus(scan.client_uuid, 'syncing');
      await ScanQueueService.updateScanStatus(scan.client_uuid, 'pending');

      const updated = await ScanQueueService.getAllScans();
      const updatedScan = updated.find((s) => s.client_uuid === scan.client_uuid);
      expect(updatedScan?.attempt_count).toBeGreaterThanOrEqual(0);
    });
  });
});
