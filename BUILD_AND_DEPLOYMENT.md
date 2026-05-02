# Build & Deployment Guide

## Prerequisites

- Node.js 18+
- Expo CLI: `npm install -g expo-cli`
- EAS CLI: `npm install -g eas-cli`
- iOS: Xcode (for iOS builds)
- Android: Android Studio or Android SDK
- Git for version control

## Local Development Build

### 1. Setup

```bash
cd gso_mobile

# Install dependencies
npm install

# Verify setup
npm run type-check
npm run lint
```

### 2. Run on Simulator/Emulator

#### iOS Simulator
```bash
npm run ios
```

#### Android Emulator
```bash
npm run android
```

### 3. Run on Physical Device

Start the development server:
```bash
npm start
```

Then use Expo Go app on your phone to scan the QR code.

## Production Build

### 1. Pre-Build Checks

```bash
# Type checking
npm run type-check

# Linting
npm run lint -- --fix

# Security audit
npm audit fix --force

# Run tests
npm test
```

### 2. Build APK (Android)

Using EAS Build (recommended):
```bash
eas login  # Use your Expo account
eas build --platform android --type apk
```

Local build:
```bash
npm run build
expo run:android --release
```

### 3. Build IPA (iOS)

```bash
eas login
eas build --platform ios
```

### 4. Build AAB (Android Play Store)

```bash
eas build --platform android --type app-bundle
```

## Deployment Steps

### Android Play Store

1. **Create Google Play account**
   - Go to https://play.google.com/apps/publish/
   - Set up billing and create app listing

2. **Sign APK/AAB**
   - EAS automatically signs builds
   - Download signed APK from EAS dashboard

3. **Upload to Play Store**
   - Open Google Play Console
   - Create new release
   - Upload AAB file
   - Fill in version notes
   - Set release date (now or scheduled)
   - Submit for review

4. **Review Timeline**
   - Initial review: 1-24 hours
   - Full store review: 2-4 hours typically

### iOS App Store

1. **Create Apple Developer account**
   - Go to https://developer.apple.com/
   - Enroll in App Store Connect
   - $99/year developer fee

2. **Create App Store entry**
   - App ID: com.gso.mobile.scanner
   - Name: GSO Mobile
   - Category: Business
   - Privacy Policy URL

3. **Upload Build**
   - EAS automatically uploads to TestFlight
   - Download IPA and upload via Xcode or transporter

4. **Add Required Information**
   - Screenshots (5 for each device size)
   - Keywords
   - Description
   - Support URL
   - Marketing URL
   - Privacy Policy

5. **Submit for Review**
   - Review guidelines compliance
   - Submit for App Store review
   - Typical review: 24-48 hours

## Environment Configuration

### Production .env
```
EXPO_PUBLIC_API_URL=https://api.gso-system.com/api
EXPO_PUBLIC_API_TIMEOUT=30000
EXPO_PUBLIC_SYNC_INTERVAL_MS=30000
EXPO_PUBLIC_MAX_RETRY_ATTEMPTS=5
EXPO_PUBLIC_ENABLE_OFFLINE_MODE=true
EXPO_PUBLIC_ENABLE_AUTO_SYNC=true
```

### Staging .env
```
EXPO_PUBLIC_API_URL=https://staging-api.gso-system.com/api
EXPO_PUBLIC_API_TIMEOUT=30000
EXPO_PUBLIC_SYNC_INTERVAL_MS=10000  # More frequent for testing
EXPO_PUBLIC_MAX_RETRY_ATTEMPTS=3
```

## Version Management

Update version in `app.json`:
```json
{
  "expo": {
    "version": "1.1.0",
    "android": {
      "versionCode": 2
    },
    "ios": {
      "buildNumber": "2"
    }
  }
}
```

Version format: MAJOR.MINOR.PATCH
- MAJOR: Breaking changes
- MINOR: New features (backwards compatible)
- PATCH: Bug fixes

## Continuous Integration

### GitHub Actions (Optional)

Create `.github/workflows/build.yml`:
```yaml
name: Build

on: [push, pull_request]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: 18
      - run: npm install
      - run: npm run type-check
      - run: npm run lint
      - run: npm audit fix --force
      - run: npm test
```

## Troubleshooting Builds

### Build Fails with "out of memory"
```bash
export NODE_OPTIONS="--max-old-space-size=4096"
npm run build
```

### APK/IPA not downloaded
- Check EAS build status: `eas build:list`
- View build logs: `eas build:view <build-id>`

### App crashes on startup
1. Check backend API accessibility
2. Verify `.env` configuration
3. Run `npm run db:init` to reinitialize database
4. Check logs: `npm start` and review console

### Submission rejected

**iOS Common Issues**:
- Using private APIs → Check all imports
- Privacy policy required → Add privacy URL
- Screenshots don't match app → Update screenshots
- Cryptography use → Declare if crypto used

**Android Common Issues**:
- Targetted SDK too old → Update targetSdkVersion
- Dangerous permissions without justification → Review permission usage
- Malware detected → Run full audit, rebuild clean

## Monitoring Production

### Crash Reporting

Install Sentry:
```bash
npm install @sentry/react-native
```

Initialize in App.tsx:
```typescript
import * as Sentry from '@sentry/react-native';

Sentry.init({
  dsn: 'https://YOUR_KEY@sentry.io/YOUR_PROJECT',
  environment: 'production',
});
```

### Error Logging

Check app logs:
- iOS: Xcode Console or Apple Console
- Android: Android Studio Logcat

## Rollback Strategy

If production build has critical issues:

1. **Immediate**: Communicate with users
2. **If minor**: Deploy patch version
3. **If major**: Recall via:
   - Google Play: Create new version with fix
   - App Store: Submit new version, mark old as deprecated
4. **Backend**: Keep old API version for compatibility

## Release Checklist

Before production deployment:

- [ ] Code reviewed
- [ ] All tests passing
- [ ] Type check passing
- [ ] Linting passing
- [ ] Security audit clean
- [ ] Backend API tested
- [ ] Version number bumped
- [ ] Changelog updated
- [ ] Screenshots updated
- [ ] .env configured
- [ ] Release notes written
- [ ] Device testing completed
- [ ] Performance profiling done
- [ ] Accessibility checked
- [ ] Privacy policy current

## Support & Feedback

After deployment:

1. **Monitor crash reports** - React to critical issues immediately
2. **Track user feedback** - Use app store reviews and support channels
3. **Performance metrics** - Monitor API response times, sync success rates
4. **User adoption** - Track installs and active users
5. **Iterate** - Plan next release based on feedback
