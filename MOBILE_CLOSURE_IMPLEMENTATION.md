# RPCPPE/RPCSEP Closure & Reopening - Mobile Implementation Guide

## Overview
Mobile app (React Native/Expo) should gracefully handle closed cycles by disabling scanning and showing read-only views. Reopening can only be done on the web/backend.

## Components to Update

### 1. Cycle Closed Banner (`src/components/RpcCycleClosedBanner.tsx`)

```typescript
import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Lock, AlertCircle } from 'lucide-react-native';

interface RpcCycleClosedBannerProps {
  closedBy: string;
  closedAt: string;
  closeReason: string;
  canReopen: boolean;
  onReopenPress?: () => void;
}

export const RpcCycleClosedBanner: React.FC<RpcCycleClosedBannerProps> = ({
  closedBy,
  closedAt,
  closeReason,
  canReopen,
  onReopenPress,
}) => {
  const closedDate = new Date(closedAt);
  const formattedDate = closedDate.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <View className='bg-orange-50 border-l-4 border-orange-500 px-4 py-3 mb-4'>
      <View className='flex-row items-start'>
        <Lock size={20} color='#EA580C' style={{ marginRight: 12, marginTop: 2 }} />
        <View className='flex-1'>
          <Text className='text-base font-semibold text-orange-900'>
            Inventory Cycle Closed
          </Text>
          <Text className='text-sm text-orange-700 mt-1'>
            Finalized by {closedBy} on {formattedDate}
          </Text>
          <Text className='text-xs text-orange-600 mt-2 italic'>
            {closeReason}
          </Text>
          <Text className='text-xs text-orange-700 mt-2'>
            This cycle is locked and read-only. Scanning and editing are disabled.
          </Text>
        </View>
      </View>
    </View>
  );
};
```

### 2. Scanner Screen Updates (`src/features/scanner/screens/ScannerScreen.tsx`)

```typescript
// Add to existing ScannerScreen component:

import { RpcCycleClosedBanner } from '@/components/RpcCycleClosedBanner';
import { Text, View, TouchableOpacity } from 'react-native';

interface ScannerScreenProps {
  // ... existing props
  rpcCycle?: {
    id: number;
    status: string;
    closed_by?: string;
    closed_at?: string;
    close_reason?: string;
    can_reopen?: boolean;
  };
}

export const ScannerScreen: React.FC<ScannerScreenProps> = ({
  rpcCycle,
  // ... other props
}) => {
  const isCycleClosed = rpcCycle?.status === 'closed';

  // If cycle is closed, show banner and disable scanner
  if (isCycleClosed) {
    return (
      <View className='flex-1 bg-gray-50'>
        <View className='flex-1 p-4'>
          <RpcCycleClosedBanner
            closedBy={rpcCycle.closed_by || 'Unknown'}
            closedAt={rpcCycle.closed_at || ''}
            closeReason={rpcCycle.close_reason || ''}
            canReopen={rpcCycle.can_reopen || false}
          />

          <View className='bg-yellow-50 border border-yellow-200 rounded-lg p-4 mt-4'>
            <View className='flex-row'>
              <AlertCircle size={20} color='#CA8A04' style={{ marginRight: 12 }} />
              <View className='flex-1'>
                <Text className='text-sm font-semibold text-yellow-900'>
                  Scanning Disabled
                </Text>
                <Text className='text-xs text-yellow-700 mt-2'>
                  The inventory cycle is locked. Scanning, editing, and deletion of records are disabled.
                </Text>
                <Text className='text-xs text-yellow-700 mt-2'>
                  To make changes, an Administrator must reopen this cycle on the web application.
                </Text>
              </View>
            </View>
          </View>

          <TouchableOpacity
            className='bg-blue-100 rounded-lg p-4 mt-6'
            onPress={() => {
              // Optional: Open link to web app or show instructions
              console.log('Visit web app to reopen cycle');
            }}
          >
            <Text className='text-blue-700 text-center font-semibold'>
              ℹ️ Reopen on Web Application
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ... rest of existing scanner UI
};
```

### 3. QR Scanner Component Updates (`src/features/qr/hooks/useScanHandler.ts`)

```typescript
import { useCallback } from 'react';
import { Alert } from 'react-native';
import { useScannerStore } from '@/features/scanner/store/scannerStore';
import { apiCall } from '@/lib/api';

export function useScanHandler() {
  const { cycle } = useScannerStore();

  const handleScan = useCallback(
    async (qrValue: string) => {
      // Validate cycle status before attempting scan
      if (cycle?.status === 'closed') {
        Alert.alert(
          'Cycle Closed',
          'This inventory cycle is closed and read-only. You cannot add new scans.\n\nTo reopen this cycle, contact an Administrator.',
          [{ text: 'OK', onPress: () => {} }]
        );
        return false;
      }

      // Proceed with scan
      try {
        const response = await apiCall(`/rpc-inventory/cycles/${cycle?.id}/scan-preview`, {
          method: 'POST',
          body: JSON.stringify({ qr_value: qrValue }),
        });

        return response;
      } catch (error: any) {
        // Handle closed cycle errors from backend
        if (error?.status === 409) {
          Alert.alert(
            'Cycle Locked',
            'This inventory cycle has been closed and is now read-only.',
            [{ text: 'OK', onPress: () => {} }]
          );
          return false;
        }

        throw error;
      }
    },
    [cycle?.id, cycle?.status]
  );

  return { handleScan };
}
```

### 4. Inventory List Updates (`src/features/inventory/screens/InventoryListScreen.tsx`)

```typescript
// Update scan edit/delete buttons to be disabled when cycle is closed

import { RpcCycleClosedBanner } from '@/components/RpcCycleClosedBanner';

interface ScanItemProps {
  scan: any;
  cycleStatus: string;
}

export const ScanListItem: React.FC<ScanItemProps> = ({
  scan,
  cycleStatus,
}) => {
  const isClosed = cycleStatus === 'closed';

  return (
    <View className='bg-white border-b border-gray-200 p-4'>
      {/* Rest of scan info */}

      <View className='flex-row gap-2 mt-3'>
        <TouchableOpacity
          className={`flex-1 py-2 px-3 rounded-lg ${
            isClosed ? 'bg-gray-200' : 'bg-blue-100'
          }`}
          disabled={isClosed}
          onPress={() => {
            if (!isClosed) {
              handleEditScan(scan);
            } else {
              Alert.alert(
                'Cycle Closed',
                'Cannot edit scans in a closed inventory cycle.'
              );
            }
          }}
        >
          <Text className={`text-center font-semibold ${isClosed ? 'text-gray-500' : 'text-blue-700'}`}>
            Edit
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          className={`flex-1 py-2 px-3 rounded-lg ${
            isClosed ? 'bg-gray-200' : 'bg-red-100'
          }`}
          disabled={isClosed}
          onPress={() => {
            if (!isClosed) {
              handleDeleteScan(scan);
            } else {
              Alert.alert(
                'Cycle Closed',
                'Cannot delete scans from a closed inventory cycle.'
              );
            }
          }}
        >
          <Text className={`text-center font-semibold ${isClosed ? 'text-gray-500' : 'text-red-700'}`}>
            Delete
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

export const InventoryListScreen: React.FC<InventoryListScreenProps> = ({
  cycle,
  // ...
}) => {
  const isCycleClosed = cycle?.status === 'closed';

  return (
    <View className='flex-1 bg-gray-50'>
      {/* Show closed banner if applicable */}
      {isCycleClosed && (
        <View className='p-4'>
          <RpcCycleClosedBanner
            closedBy={cycle.closed_by}
            closedAt={cycle.closed_at}
            closeReason={cycle.close_reason}
            canReopen={cycle.can_reopen}
          />
        </View>
      )}

      {/* Disable fab button if cycle is closed */}
      <FAB
        icon='plus'
        onPress={() => navigateToScanner()}
        disabled={isCycleClosed}
        style={{
          opacity: isCycleClosed ? 0.5 : 1,
        }}
      />

      {/* Render scan list items with edit/delete disabled */}
      <FlatList
        data={scans}
        renderItem={({ item }) => (
          <ScanListItem scan={item} cycleStatus={cycle?.status} />
        )}
        keyExtractor={(item) => item.id.toString()}
      />
    </View>
  );
};
```

### 5. Sync Handler Updates (`src/features/qr/services/syncService.ts`)

```typescript
import { apiCall } from '@/lib/api';
import { Alert } from 'react-native';

export class RpcSyncService {
  static async syncScans(cycleId: number, scans: any[]) {
    try {
      const response = await apiCall(`/rpc-inventory/cycles/${cycleId}/scans/bulk`, {
        method: 'POST',
        body: JSON.stringify({ scans }),
      });

      return response;
    } catch (error: any) {
      // Handle closed cycle error
      if (error?.status === 409) {
        Alert.alert(
          'Cycle Locked',
          'Cannot sync scans: This inventory cycle has been closed.\n\nFailed syncs will be retried when the cycle is reopened.',
          [{ text: 'OK' }]
        );

        // Queue for retry when cycle reopens
        await this.queueForRetry(cycleId, scans);
        return { queued: true, synced: 0, failed: scans.length };
      }

      throw error;
    }
  }

  private static async queueForRetry(cycleId: number, scans: any[]) {
    // Store in AsyncStorage or local DB for retry after reopening
    // Implementation depends on your storage strategy
  }
}
```

### 6. Cycle Details Hook (`src/features/qr/hooks/useRpcCycleDetails.ts`)

```typescript
import { useQuery } from '@tanstack/react-query';
import { apiCall } from '@/lib/api';

interface RpcCycle {
  id: number;
  cycle_label: string;
  status: 'active' | 'closed' | 'archived';
  closed_by?: string;
  closed_at?: string;
  close_reason?: string;
  reopened_by?: string;
  reopened_at?: string;
  reopen_reason?: string;
  reopen_count: number;
  can_reopen: boolean;
}

export function useRpcCycleDetails(cycleId: number) {
  return useQuery<RpcCycle>({
    queryKey: ['rpc-cycle', cycleId],
    queryFn: async () => {
      const response = await apiCall(`/rpc-inventory/cycles/${cycleId}`);
      return response.data;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchOnMount: 'stale',
  });
}
```

## UI/UX Guidelines

### Closed Cycle Indicators
- **Orange banner** with lock icon at top of screens
- **Disabled buttons** (grayed out) for edit/delete scans
- **"Read-Only" pill** badge in cycle header
- **Info message** explaining how to reopen

### Error Messages
When user attempts to scan/edit/delete on closed cycle:
```
⛔ Cycle Locked
This inventory cycle has been closed and is read-only.
You cannot add, edit, or delete scans.

To reopen this cycle, contact an Administrator.
```

### States to Handle

1. **Active Cycle** (normal)
   - Full scan, edit, delete functionality
   - "Close Cycle" button visible (Admin only)

2. **Closed Cycle** (read-only)
   - Scanning disabled
   - Edit/Delete buttons disabled
   - Show closure banner
   - Optional: Link to web app to reopen

3. **Reopened Cycle** (active again)
   - Full scan, edit, delete functionality restored
   - Optionally show "reopen summary" banner briefly
   - If reopen_count=2, show "last chance" warning when closed

## Offline Handling

If app is offline and cycle becomes closed:
1. Local queued scans cannot sync
2. Show persistence banner: "Pending scans will sync when connection returns"
3. When online, check cycle status first
4. If cycle is closed, prompt user to contact admin
5. Queue scans locally for later retry after reopen

## Performance Considerations

- Cache cycle status in-memory
- Refetch cycle details when tab comes to foreground
- Show stale data briefly but validate on scroll/refresh
- Poll cycle status every 2 minutes when sync is pending
- Cancel pending syncs if cycle becomes closed

## Permissions

- Regular staff: View cycle status, cannot close/reopen
- Admin on mobile: Can see reopen info but must use web to reopen

## Testing Checklist

- [ ] Scanner disabled when cycle closed
- [ ] Edit/Delete buttons disabled on closed cycle
- [ ] Closed banner displays correctly
- [ ] Sync attempts rejected with 409 error
- [ ] Offline queued scans handle closed cycle gracefully
- [ ] Cycle status updates in real-time
- [ ] Multiple user scenarios (staff, admin)
