import React from 'react';
import { StatusBar } from 'expo-status-bar';
import RootNavigator from './src/navigation/RootNavigator';
import { AppBootstrapProvider } from './src/providers/AppBootstrapProvider';

export default function App(): React.JSX.Element {
    return (
        <AppBootstrapProvider>
            <StatusBar style="dark" />
            <RootNavigator />
        </AppBootstrapProvider>
    );
}
