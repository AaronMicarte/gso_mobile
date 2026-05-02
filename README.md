# GSO Mobile - Inventory Scanner

Production-ready React Native (Expo) app for offline-first QR code scanning with automatic sync when online.

## Features

- ✅ **Offline-First**: Scan items without internet connection; scans saved to local SQLite queue
- ✅ **Auto-Sync**: Automatically syncs scans when connection is restored
- ✅ **Secure Auth**: Token stored encrypted on device using platform-specific Keychain/Keystore
- ✅ **Device Tracking**: Device ID generated for audit trail and support debugging
- ✅ **Retry Logic**: Failed syncs retry with exponential backoff up to 5 attempts
- ✅ **Type-Safe**: Full TypeScript implementation with strict mode
- ✅ **Linting**: ESLint + Prettier for code quality

## Prerequisites

- Node.js 18+
- Expo CLI: `npm install -g expo-cli`
- iOS Simulator or Android Emulator (or physical device)

## Setup

1. **Install dependencies**:
   ```bash
   cd gso_mobile
   npm install
   ```

2. **Configure environment**:
   ```bash
   cp .env.example .env.local
   # Edit .env.local with your API URL and settings
   ```

3. **Initialize database**:
   ```bash
   npm run db:init
   ```

4. **Run type check**:
   ```bash
   npm run type-check
   ```

5. **Run linter**:
   ```bash
   npm run lint
   ```

6. **Run security audit**:
   ```bash
   npm audit fix
   ```

## Development

### Start development server:
```bash
npm start
```

### Build for iOS:
```bash
npm run ios
```

### Build for Android:
```bash
npm run android
```

### Run tests:
```bash
npm test
```

### Building production APK/IPA:
```bash
eas build --platform ios
eas build --platform android
```

## Architecture

### Services

- **ApiService** (`src/services/ApiService.ts`): HTTP client with Bearer token auth, handles preview and bulk sync endpoints
- **AuthService** (`src/services/AuthService.ts`): Manages token/user persistence and device ID generation
- **ScanQueueService** (`src/services/ScanQueueService.ts`): SQLite database for offline queue with retry tracking
- **SyncService** (`src/services/SyncService.ts`): Batch sync logic with exponential backoff retry
- **NetworkMonitor** (`src/services/NetworkMonitor.ts`): Detects network changes and triggers auto-sync

### Screens

- **LoginScreen** (`src/screens/LoginScreen.tsx`): Email/password authentication
- **ScannerScreen** (`src/screens/ScannerScreen.tsx`): QR barcode capture with preview and confirm
- **QueueScreen** (`src/screens/QueueScreen.tsx`): Queue history with synced/failed/pending statuses

### Database Schema

**scan_queue** table:
- `id`: Primary key
- `client_uuid`: Unique per scan (UUID v4)
- `cycle_id`: Inventory cycle reference
- `inventory_detail_id`: Asset reference
- `condition_id`: Condition of item
- `scanned_at`: ISO timestamp
- `remarks`: Optional notes
- `device_id`: Device identifier for audit
- `user_id`: User who scanned
- `status`: pending | syncing | synced | failed
- `error_message`: Failure reason if applicable
- `attempt_count`: Number of sync attempts
- `created_at`: Timestamp

Indexes on: status, cycle_id, created_at, client_uuid

## API Endpoints

### Authentication
- `POST /api/auth/login` - Email/password login
- `GET /api/auth/me` - Get current user
- `POST /api/auth/logout` - Logout

### Scanning
- `GET /api/rpc-inventory/cycles/{id}/preview?qr_value=...` - Preview QR scan
- `POST /api/rpc-inventory/cycles/{id}/scans/bulk` - Bulk upload scans (max 100 per request)

### Conditions
- `GET /api/conditions` - Get all condition types

## Error Handling

### Network Errors
- Temporary network issues: Auto-retry with exponential backoff (2s, 4s, 8s, 16s, 32s)
- Permanent network loss: Scans remain in queue, auto-sync triggered when connectivity restored

### Validation Errors
- Server returns item-level status (created/duplicate/error)
- Failed scans marked with error message, user can retry or delete

### Duplicate Detection
- Client generates UUID v4 for each scan
- Server uses (cycle_id, client_uuid) unique constraint for idempotent retries
- Duplicate scans return status 'duplicate' without creating duplicate entries

## Performance Optimization

- Batch scans in groups of up to 100 per request
- SQLite indexes on frequently queried fields
- Auto-cleanup of old synced scans after 30 days
- 30-second sync interval to balance battery/timeliness

## Security

### Token Management
- Bearer token stored in platform-specific Keychain (iOS) / Keystore (Android)
- Token cleared on 401 response (auth expired)
- Device ID persisted across app launches for audit trail

### Data Protection
- All transmitted data uses HTTPS only
- No sensitive data logged to console in production
- SQLite queue encrypted at rest (platform default)

### Dependency Audit
- `npm audit fix` to resolve any vulnerabilities
- axios@1.6.5 has 0 disclosed CVEs
- All Expo dependencies maintained and security-patched

## Troubleshooting

### Scans not syncing
1. Check network connectivity: Status bar in Scanner screen
2. Manual sync: Open Queue → Manual Sync button
3. Check error messages in Queue history
4. Verify backend API is running and accessible

### Login fails
1. Verify API URL in .env.local
2. Check backend auth endpoint (`POST /api/auth/login`)
3. Ensure request credentials are correct

### App crashes on startup
1. Run `npm run db:init` to initialize database
2. Clear app cache and restart
3. Check logs: `npm start` and review console output

## Development Workflow

1. **Create feature branch**: `git checkout -b feature/scanner-improvements`
2. **Make changes** and test locally
3. **Run type check**: `npm run type-check`
4. **Run linter**: `npm run lint -- --fix`
5. **Run audit**: `npm audit fix` (if vulnerabilities found)
6. **Commit** with conventional commit message: `git commit -m "feat: improve scan preview"`
7. **Push** and create pull request

## Contributing

- Follow TypeScript strict mode
- Use ESLint + Prettier (run `npm run lint -- --fix`)
- Write tests for new features
- Document API changes
- Update CHANGELOG

## License

Proprietary - GSO System
