import React from 'react';
import RootNavigator from './src/navigation/RootNavigator';
import { AppBootstrapProvider } from './src/providers/AppBootstrapProvider';
import { useAndroidImmersiveMode } from './src/hooks/useAndroidImmersiveMode';

export default function App(): React.JSX.Element {
    useAndroidImmersiveMode();

    return (
        <AppBootstrapProvider>
            <RootNavigator />
        </AppBootstrapProvider>
    );
}
