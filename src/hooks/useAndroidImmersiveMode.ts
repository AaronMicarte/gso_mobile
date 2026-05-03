import { useEffect } from 'react';
import { AppState, Platform, StatusBar } from 'react-native';
import * as NavigationBar from 'expo-navigation-bar';

export function useAndroidImmersiveMode(): void {
    useEffect(() => {
        if (Platform.OS !== 'android') {
            return;
        }

        const applyImmersiveMode = (): void => {
            try {
                // Hide status bar
                StatusBar.setHidden(true, 'fade');

                // Hide navigation bar (modern supported way)
                void NavigationBar.setVisibilityAsync('hidden');
            } catch (error) {
                console.debug('Immersive mode failed:', error);
            }
        };

        // Apply immediately
        applyImmersiveMode();

        // Re-apply when app comes back to foreground
        const subscription = AppState.addEventListener('change', (nextState) => {
            if (nextState === 'active') {
                applyImmersiveMode();
            }
        });

        return () => {
            subscription.remove();

            // Optional restore (safe cleanup)
            try {
                StatusBar.setHidden(false);
                void NavigationBar.setVisibilityAsync('visible');
            } catch (error) {
                console.debug('Cleanup failed:', error);
            }
        };
    }, []);
}
