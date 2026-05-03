import React from 'react';
import { ActivityIndicator, View, StyleSheet } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useAuth } from '../features/auth/providers/AuthProvider';
import LoginScreen from '../features/auth/screens/LoginScreen';
import QueueScreen from '../features/inventory/screens/QueueScreen';
import { RpcInventoryWorkspace } from '../features/qr/screens/RpcInventoryWorkspace';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

const AuthStack = () => (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Login" component={LoginScreen} />
    </Stack.Navigator>
);

const AppStack = () => (
    <AppShell />
);

function AppShell(): React.JSX.Element {
    return (
        <Tab.Navigator
            screenOptions={({ route }) => ({
                tabBarIcon: ({ focused, color, size }) => {
                    let iconName: keyof typeof Ionicons.glyphMap = 'home';

                    if (route.name === 'Inventory') {
                        iconName = focused ? 'scan' : 'scan-outline';
                    } else if (route.name === 'Queue') {
                        iconName = focused ? 'list' : 'list-outline';
                    }

                    return <Ionicons name={iconName} size={size} color={color} />;
                },
                tabBarActiveTintColor: '#2563EB',
                tabBarInactiveTintColor: '#64748B',
                tabBarStyle: {
                    backgroundColor: '#0b1220',
                    borderTopColor: '#E2E8F0',
                    borderTopWidth: 1,
                    height: 66,
                    paddingBottom: 10,
                    paddingTop: 8,
                },
                tabBarLabelStyle: {
                    fontSize: 12,
                    fontWeight: '700',
                },
                headerShown: false,
            })}
        >
            <Tab.Screen
                name="Inventory"
                children={() => <RpcInventoryWorkspace />}
                options={{ tabBarLabel: 'RPC Inventory' }}
            />
            <Tab.Screen name="Queue" component={QueueScreen} options={{ tabBarLabel: 'Queue' }} />
        </Tab.Navigator>
    );
}

function RootNavigator(): React.JSX.Element {
    const { initializing, isAuthenticated } = useAuth();

    if (initializing) {
        return (
            <View style={styles.container}>
                <ActivityIndicator size="large" color="#2563EB" />
            </View>
        );
    }

    return (
        <NavigationContainer>
            {isAuthenticated ? <AppStack /> : <AuthStack />}
        </NavigationContainer>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0f172a' },
});

export default RootNavigator;
